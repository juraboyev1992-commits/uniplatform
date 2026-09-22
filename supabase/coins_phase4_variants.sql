-- ============================================================================
-- DO'KON - 4-BOSQICH: O'LCHAM, RANG VA BOSHQA PARAMETRLAR
--
-- MUAMMO: hoodie'ning o'lchami, futbolkaning rangi yo'q edi. Talaba "M
-- kerak" deya olmasdi, xodim esa kodni ko'rib nima berishini bilmasdi.
--
-- NEGA SHU YECHIM:
--   * Har o'lcham ALOHIDA MAHSULOT bo'lsa ("Hoodie M", "Hoodie L") -
--     katalog to'lib ketadi va tavsif/narx besh joyda tahrirlanadi.
--   * Parametr bo'lib, zaxira UMUMIY bo'lsa - 3 ta L buyurtma qilinadi,
--     aslida 1 ta bor. Xodim va'dani bajara olmaydi.
--   * Shuning uchun: bitta mahsulot, ichida VARIANTLAR va HAR BIRIGA
--     ALOHIDA ZAXIRA.
--
-- IKKI O'LCHOV (o'lcham VA rang) uchun alohida tizim qurilmadi: yorliqda
--   birga yoziladi - "M / Qora". Kombinatsiyalar jadvali to'ldirish azobi
--   bo'lardi va bu hajmdagi do'kon uchun ortiqcha.
--
-- ORQAGA MOSLIK: varianti yo'q mahsulot avvalgidek ishlaydi. `variants`
--   bo'sh bo'lsa, xarid `stock` ustunidan yechadi - ya'ni mavjud
--   mahsulotlarga va mavjud buyurtmalarga hech narsa bo'lmaydi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni Run.
--   Oldin coins_phase3_orders.sql ishga tushirilgan bo'lishi kerak.
-- ============================================================================

do $guard$
begin
    if to_regclass('public.shop_orders') is null then
        raise exception 'Avval supabase/coins_phase3_orders.sql ni ishga tushiring.';
    end if;
end
$guard$;

-- Variantlar: [{"label": "M", "stock": 5}, {"label": "L", "stock": 3}]
alter table public.shop_items  add column if not exists variants jsonb;
alter table public.shop_orders add column if not exists variant_label text;

-- ---------------------------------------------------------------------------
-- XARID - variant bilan
--
-- `stock` ustuni variantlar yig'indisi sifatida YANGILANIB turadi: mavjud
-- ekranlar va tekshiruvlar undan o'qiydi, ya'ni ular o'zgarishsiz ishlaydi.
-- ---------------------------------------------------------------------------
create or replace function public.shop_order_create(p_item_id text, p_variant text default null)
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
    v_has_var boolean;
    v_vstock  int;
    v_new     jsonb;
begin
    if coalesce(v_me, '') = '' then
        raise exception 'Avtorizatsiya talab qilinadi';
    end if;

    select * into v_item from public.shop_items where id = p_item_id for update;
    if not found then raise exception 'Mahsulot topilmadi'; end if;
    if not v_item.active then raise exception 'Bu mahsulot hozir berilmayapti'; end if;

    v_has_var := v_item.variants is not null and jsonb_array_length(v_item.variants) > 0;

    if v_has_var then
        if coalesce(p_variant, '') = '' then
            raise exception 'Variantni tanlang (masalan o''lcham yoki rang)';
        end if;
        select (e->>'stock')::int into v_vstock
          from jsonb_array_elements(v_item.variants) e
         where e->>'label' = p_variant;
        if v_vstock is null then
            raise exception 'Bunday variant yo''q: %', p_variant;
        end if;
        if v_vstock <= 0 then
            raise exception '"%" varianti tugagan', p_variant;
        end if;
    else
        if v_item.stock <= 0 then raise exception 'Zaxira tugagan'; end if;
    end if;

    v_balance := public.coin_balance(v_me);
    if v_balance < v_item.price then
        raise exception 'Tanga yetarli emas: % kerak, sizda %', v_item.price, v_balance;
    end if;

    loop
        v_try := v_try + 1;
        v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
        exit when not exists (select 1 from public.shop_orders where pickup_code = v_code);
        if v_try > 20 then raise exception 'Kod yaratib bo''lmadi, qayta urinib ko''ring'; end if;
    end loop;

    insert into public.shop_orders (id, student_id, item_id, item_name, price_paid, pickup_code, variant_label)
    values ('ord_' || replace(gen_random_uuid()::text, '-', ''),
            v_me, v_item.id, v_item.name, v_item.price, v_code,
            case when v_has_var then p_variant else null end)
    returning * into v_order;

    insert into public.coin_ledger (id, student_id, delta, reason, ref_type, ref_id, created_by)
    values ('coin_' || replace(gen_random_uuid()::text, '-', ''),
            v_me, -v_item.price,
            'Do''kon: ' || v_item.name || case when v_has_var then ' (' || p_variant || ')' else '' end,
            'shop_order', v_order.id, v_me);

    if v_has_var then
        -- Variant zaxirasi kamaytiriladi, `stock` esa yig'indi sifatida
        -- qayta hisoblanadi.
        select jsonb_agg(
                   case when e->>'label' = p_variant
                        then jsonb_set(e, '{stock}', to_jsonb((e->>'stock')::int - 1))
                        else e end)
          into v_new
          from jsonb_array_elements(v_item.variants) e;

        update public.shop_items
           set variants = v_new,
               stock = (select coalesce(sum((x->>'stock')::int), 0) from jsonb_array_elements(v_new) x),
               updated_at = now()
         where id = v_item.id;
    else
        update public.shop_items set stock = stock - 1, updated_at = now() where id = v_item.id;
    end if;

    return v_order;
end
$$;

-- ---------------------------------------------------------------------------
-- BEKOR QILISH - variant zaxirasi ham tiklanadi
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
    v_item  public.shop_items;
    v_new   jsonb;
begin
    select * into v_order from public.shop_orders where id = p_order_id for update;
    if not found then raise exception 'Buyurtma topilmadi'; end if;
    if v_order.student_id <> v_me and not public.is_staff() then
        raise exception 'Faqat o''z buyurtmangizni bekor qila olasiz';
    end if;
    if v_order.status = 'fulfilled' then
        raise exception 'Berilgan buyurtmani bekor qilib bo''lmaydi';
    end if;
    if v_order.status = 'cancelled' then return v_order; end if;

    update public.shop_orders
       set status = 'cancelled', cancelled_at = now(), cancelled_by = v_me
     where id = v_order.id
    returning * into v_order;

    insert into public.coin_ledger (id, student_id, delta, reason, ref_type, ref_id, created_by)
    values ('coin_' || replace(gen_random_uuid()::text, '-', ''),
            v_order.student_id, v_order.price_paid,
            'Bekor qilindi: ' || v_order.item_name, 'shop_refund', v_order.id, v_me);

    select * into v_item from public.shop_items where id = v_order.item_id for update;
    if found then
        if v_order.variant_label is not null
           and v_item.variants is not null
           and jsonb_array_length(v_item.variants) > 0
        then
            select jsonb_agg(
                       case when e->>'label' = v_order.variant_label
                            then jsonb_set(e, '{stock}', to_jsonb((e->>'stock')::int + 1))
                            else e end)
              into v_new
              from jsonb_array_elements(v_item.variants) e;

            update public.shop_items
               set variants = v_new,
                   stock = (select coalesce(sum((x->>'stock')::int), 0) from jsonb_array_elements(v_new) x),
                   updated_at = now()
             where id = v_item.id;
        else
            update public.shop_items set stock = stock + 1, updated_at = now() where id = v_item.id;
        end if;
    end if;

    return v_order;
end
$$;

-- Eski imzo (bir argumentli) olib tashlanadi: ikkita bir xil nomli funksiya
-- qolsa, PostgREST qaysi birini chaqirishni bilmay xato berardi.
drop function if exists public.shop_order_create(text);

revoke all on function public.shop_order_create(text, text) from public, anon;
grant execute on function public.shop_order_create(text, text) to authenticated;
revoke all on function public.shop_order_cancel(text) from public, anon;
grant execute on function public.shop_order_cancel(text) to authenticated;

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
-- ---------------------------------------------------------------------------
select p.proname as funksiya,
       pg_get_function_identity_arguments(p.oid) as argumentlar
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'shop_order%'
order by p.proname;
