-- ============================================================================
-- DO'KON - 3-BOSQICH: BUYURTMA VA BERISH
--
-- Bu fayl butun do'konning ENG NOZIK joyi: bu yerda tanga yechiladi va
-- zaxira kamayadi. Agar ikkalasi bir vaqtda bajarilmasa, ikki xil yomon
-- holat chiqadi:
--   * tanga yechilib, mahsulot ajratilmasa - talaba tangasini yo'qotadi;
--   * mahsulot ajratilib, tanga yechilmasa - zaxira bepul tarqaydi.
--
-- Shuning uchun xarid MIJOZDA emas, SERVERDA, bitta funksiya ichida
-- bajariladi. Funksiya - bitta tranzaksiya: yo hammasi bajariladi, yo
-- hech narsa. Mijoz faqat "shu mahsulotni olaman" deydi, qolganini
-- server hal qiladi va narxni ham O'ZI o'qiydi - mijozdan kelgan narxga
-- ishonib bo'lmaydi.
--
-- ZAXIRA QULFI: `select ... for update` - ikki talaba oxirgi donani bir
-- vaqtda olmoqchi bo'lsa, ikkinchisi birinchisini kutadi va zaxira
-- manfiyga tushmaydi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni Run.
--   Oldin coins_phase1.sql va coins_phase2_shop.sql ishga tushirilishi kerak.
-- ============================================================================

do $guard$
begin
    if to_regclass('public.shop_items') is null then
        raise exception 'Avval supabase/coins_phase2_shop.sql ni ishga tushiring.';
    end if;
end
$guard$;

create table if not exists public.shop_orders (
    id           text primary key,
    student_id   text not null,
    item_id      text not null references public.shop_items(id),
    item_name    text not null,          -- nusxa: mahsulot nomi keyin o'zgarsa
    price_paid   int  not null,          -- nusxa: narx keyin o'zgarsa, chek o'zgarmaydi
    status       text not null default 'pending'
                 check (status in ('pending', 'fulfilled', 'cancelled')),
    pickup_code  text not null unique,
    created_at   timestamptz not null default now(),
    fulfilled_at timestamptz,
    fulfilled_by text,
    cancelled_at timestamptz,
    cancelled_by text
);

create index if not exists shop_orders_student on public.shop_orders (student_id);
create index if not exists shop_orders_status  on public.shop_orders (status);

alter table public.shop_orders enable row level security;

-- O'qish: o'zi + xodim. Yozish QOIDA ORQALI HECH KIMGA berilmaydi -
-- buyurtma faqat pastdagi funksiyalar orqali (security definer) yoziladi.
-- Aks holda talaba o'z buyurtmasining holatini "berildi" ga o'zgartira olardi.
drop policy if exists shop_orders_read on public.shop_orders;
create policy shop_orders_read on public.shop_orders
    for select to authenticated
    using (student_id = public.current_username() or public.is_staff());

-- ---------------------------------------------------------------------------
-- XARID
-- ---------------------------------------------------------------------------
create or replace function public.shop_order_create(p_item_id text)
returns public.shop_orders
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me      text := public.current_username();
    v_item    public.shop_items;
    v_balance int;
    v_order   public.shop_orders;
    v_code    text;
    v_try     int := 0;
begin
    if coalesce(v_me, '') = '' then
        raise exception 'Avtorizatsiya talab qilinadi';
    end if;

    -- QULF: oxirgi donani ikki kishi bir vaqtda ololmasin.
    select * into v_item from public.shop_items where id = p_item_id for update;
    if not found then
        raise exception 'Mahsulot topilmadi';
    end if;
    if not v_item.active then
        raise exception 'Bu mahsulot hozir berilmayapti';
    end if;
    if v_item.stock <= 0 then
        raise exception 'Zaxira tugagan';
    end if;

    v_balance := public.coin_balance(v_me);
    if v_balance < v_item.price then
        raise exception 'Tanga yetarli emas: % kerak, sizda %', v_item.price, v_balance;
    end if;

    -- Olib ketish kodi - qisqa va o'qishga oson. Takrorlansa qayta uriniladi
    -- (unique cheklov bor, ya'ni bir xil kod ikki buyurtmaga tushmaydi).
    loop
        v_try := v_try + 1;
        v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
        exit when not exists (select 1 from public.shop_orders where pickup_code = v_code);
        if v_try > 20 then
            raise exception 'Kod yaratib bo''lmadi, qayta urinib ko''ring';
        end if;
    end loop;

    insert into public.shop_orders (id, student_id, item_id, item_name, price_paid, pickup_code)
    values ('ord_' || replace(gen_random_uuid()::text, '-', ''),
            v_me, v_item.id, v_item.name, v_item.price, v_code)
    returning * into v_order;

    -- Tanga yechiladi. `ref_id` - buyurtma raqami, ya'ni "bu tanga qayerga
    -- ketdi" degan savol reyestrdan javob topadi.
    insert into public.coin_ledger (id, student_id, delta, reason, ref_type, ref_id, created_by)
    values ('coin_' || replace(gen_random_uuid()::text, '-', ''),
            v_me, -v_item.price, 'Do''kon: ' || v_item.name, 'shop_order', v_order.id, v_me);

    update public.shop_items set stock = stock - 1, updated_at = now() where id = v_item.id;

    return v_order;
end
$$;

-- ---------------------------------------------------------------------------
-- BERISH - xodim kodni kiritadi
-- ---------------------------------------------------------------------------
create or replace function public.shop_order_fulfil(p_code text)
returns public.shop_orders
language plpgsql
security definer
set search_path = public
as $$
declare
    v_order public.shop_orders;
begin
    if not public.is_staff() then
        raise exception 'Faqat xodim mahsulot bera oladi';
    end if;

    select * into v_order from public.shop_orders
     where pickup_code = upper(trim(p_code)) for update;
    if not found then
        raise exception 'Bunday kod topilmadi';
    end if;
    if v_order.status = 'fulfilled' then
        raise exception 'Bu buyurtma allaqachon berilgan (%)', to_char(v_order.fulfilled_at, 'DD.MM.YYYY HH24:MI');
    end if;
    if v_order.status = 'cancelled' then
        raise exception 'Bu buyurtma bekor qilingan';
    end if;

    update public.shop_orders
       set status = 'fulfilled', fulfilled_at = now(), fulfilled_by = public.current_username()
     where id = v_order.id
    returning * into v_order;

    return v_order;
end
$$;

-- ---------------------------------------------------------------------------
-- BEKOR QILISH - tanga QAYTARILADI, zaxira tiklanadi
--
-- Talaba o'zi (berilmagan bo'lsa) yoki xodim bekor qila oladi. Berilgan
-- buyurtma bekor qilinmaydi: mahsulot allaqachon qo'lda.
-- ---------------------------------------------------------------------------
create or replace function public.shop_order_cancel(p_order_id text)
returns public.shop_orders
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me    text := public.current_username();
    v_order public.shop_orders;
begin
    select * into v_order from public.shop_orders where id = p_order_id for update;
    if not found then
        raise exception 'Buyurtma topilmadi';
    end if;
    if v_order.student_id <> v_me and not public.is_staff() then
        raise exception 'Faqat o''z buyurtmangizni bekor qila olasiz';
    end if;
    if v_order.status = 'fulfilled' then
        raise exception 'Berilgan buyurtmani bekor qilib bo''lmaydi';
    end if;
    if v_order.status = 'cancelled' then
        return v_order;
    end if;

    update public.shop_orders
       set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me
     where id = v_order.id
    returning * into v_order;

    -- Tanga qaytariladi. ALOHIDA yozuv, `ref_type` boshqa: reyestrda
    -- "yechildi" va "qaytarildi" ikkita ko'rinadigan qator bo'lishi kerak,
    -- aks holda tarix tushunarsiz bo'lardi.
    insert into public.coin_ledger (id, student_id, delta, reason, ref_type, ref_id, created_by)
    values ('coin_' || replace(gen_random_uuid()::text, '-', ''),
            v_order.student_id, v_order.price_paid,
            'Bekor qilindi: ' || v_order.item_name, 'shop_refund', v_order.id, v_me);

    update public.shop_items set stock = stock + 1, updated_at = now() where id = v_order.item_id;

    return v_order;
end
$$;

revoke all on function public.shop_order_create(text) from public, anon;
revoke all on function public.shop_order_fulfil(text) from public, anon;
revoke all on function public.shop_order_cancel(text) from public, anon;
grant execute on function public.shop_order_create(text) to authenticated;
grant execute on function public.shop_order_fulfil(text) to authenticated;
grant execute on function public.shop_order_cancel(text) to authenticated;

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
-- ---------------------------------------------------------------------------
select p.proname as funksiya,
       pg_get_function_identity_arguments(p.oid) as argumentlar,
       case when p.prosecdef then 'security definer' else 'invoker' end as rejim
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'shop_order%'
order by p.proname;
