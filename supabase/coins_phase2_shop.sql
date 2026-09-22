-- ============================================================================
-- DO'KON - 2-BOSQICH: MAHSULOTLAR
--
-- 1-bosqich tangani yig'a boshladi. Bu bosqich mahsulotlarni HAQIQIY
-- qiladi: hozir ular `WardrobeManagement.jsx` ichida `useState` massivida
-- qattiq yozilgan - mahsulot o'chirsangiz sahifa yangilanishi bilan qaytib
-- keladi, qo'shsangiz yo'qoladi.
--
-- BUYURTMA BU YERDA YO'Q. U 3-bosqichda, chunki buyurtma zaxirani
-- kamaytiradi va tangani yechadi - ikkalasi bitta tranzaksiyada bo'lishi
-- kerak. Uni mahsulot jadvali bilan aralashtirmaslik xavfsizroq.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni Run.
--   Oldin supabase/coins_phase1.sql ishga tushirilgan bo'lishi kerak.
-- ============================================================================

do $guard$
begin
    if to_regclass('public.coin_ledger') is null then
        raise exception 'Avval supabase/coins_phase1.sql ni ishga tushiring.';
    end if;
end
$guard$;

create table if not exists public.shop_items (
    id          text primary key,
    name        text not null,
    category    text,
    price       int  not null check (price >= 0),
    stock       int  not null default 0 check (stock >= 0),
    description text,
    image_url   text,
    -- O'CHIRISH EMAS, O'CHIRIB QO'YISH. Sotilgan mahsulotni butunlay
    -- o'chirsak, eski buyurtmalar (3-bosqich) egasiz qolib, "nima
    -- olgandim" degan savol javobsiz qolardi.
    active      boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    created_by  text
);

create index if not exists shop_items_active on public.shop_items (active);

alter table public.shop_items enable row level security;

-- O'qish - hamma kirgan foydalanuvchiga: talaba do'konni ko'rishi kerak.
drop policy if exists shop_items_read on public.shop_items;
create policy shop_items_read on public.shop_items
    for select to authenticated using (true);

-- Yozish - FAQAT administratorga. Zaxira va narx pul o'rnini bosadi,
-- shuning uchun bu yerda koordinatorga ham ruxsat berilmaydi.
drop policy if exists shop_items_write on public.shop_items;
create policy shop_items_write on public.shop_items
    for all to authenticated
    using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- MIQYOS YORDAMCHISI
--
-- "500 tanga" degan narx o'z-o'zidan hech narsa anglatmaydi. Bu funksiya
-- narxni HAFTAGA aylantiradi: hozirgi qoidalar bo'yicha faol talaba bir
-- haftada qancha topishini hisoblab, narxni shunga bo'ladi.
--
-- Haftalik faollik taxmini ATAYLAB ehtiyotkor: 1 ta Ma'rifat darsi (faollik
-- bilan) + 1 ta tadbir. Bu "juda faol" emas, "muntazam" talaba. Shunda narx
-- ko'pchilik uchun yetib boradigan bo'lib chiqadi.
-- ---------------------------------------------------------------------------
create or replace function public.coin_weekly_rate()
returns int
language sql
stable
security definer
set search_path = public
as $$
    select greatest(1, coalesce(sum(amount), 0))::int
      from public.coin_rules
     where enabled
       and code in ('event_attendance', 'marifat_attendance', 'marifat_active');
$$;

grant execute on function public.coin_weekly_rate() to authenticated;

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
-- ---------------------------------------------------------------------------
select 'jadval' as tur, 'shop_items' as nomi,
       (select count(*)::text from public.shop_items) as qiymat
union all
select 'haftalik tezlik', 'coin_weekly_rate()', public.coin_weekly_rate()::text
union all
select 'qoida', code, amount::text from public.coin_rules
order by tur, nomi;
