-- ===========================================================================
-- KLUB A'ZOLIGI RUXSATLARI
--
-- MUAMMO: administrator klubga koordinator tayinlaganda a'zolik roli
-- saqlanmasdi. Sabab - `memberships` jadvalining RLS siyosati faqat
-- foydalanuvchining O'Z yozuviga ruxsat berardi:
--
--     with check (auth.uid() = user_id)
--
-- Ya'ni admin BOSHQA odam uchun a'zolik yozuvi yarata olmasdi. Tayinlash
-- muvaffaqiyatli ko'rinardi (brauzerdagi nusxa o'zgarardi), lekin keyingi
-- sinxronlashda rol yo'qolardi va koordinator hech qanday huquq olmasdi.
--
-- YECHIM: administrator har qanday a'zolikni boshqara oladi, oddiy
-- foydalanuvchi esa avvalgidek faqat o'zining a'zoligini.
--
-- Supabase SQL Editor da bir marta ishga tushiriladi.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. TEKSHIRUV: hozir qanday siyosatlar bor?
--    Ishga tushirishdan oldin ko'rib chiqing - nomlari boshqacha bo'lishi
--    mumkin va 2-bo'limdagi `drop` ularni topa olmasligi mumkin.
-- ---------------------------------------------------------------------------
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'memberships';

-- ---------------------------------------------------------------------------
-- 2. YORDAMCHI FUNKSIYA: joriy foydalanuvchi administratormi?
--
--    `security definer` - funksiya `profiles` jadvalini o'qishi kerak, lekin
--    o'qiyotgan odamning o'zida bunga ruxsat bo'lmasligi mumkin.
--    `search_path` ataylab bo'sh: bu turdagi funksiyada u xavfsizlik talabi.
--
--    DIQQAT: `profiles.id` MATN turida (uuid emas), `auth.uid()` esa uuid
--    qaytaradi - shuning uchun solishtirishda aniq o'girish kerak. Busiz
--    Postgres "operator does not exist: text = uuid" xatosini beradi.
--
--    `role` ham enum (`user_role`) - u ham matnga o'giriladi.
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.profiles
        where id::text = auth.uid()::text
          and role::text = 'ADMINISTRATOR'
    );
$$;

-- ---------------------------------------------------------------------------
-- 3. SIYOSATLAR
--
--    O'qish: har qanday tizimga kirgan foydalanuvchi (klub tarkibi ochiq
--    ma'lumot - u klub sahifasida ko'rinadi).
--    Yozish: administrator hammasini, qolganlar faqat o'zinikini.
-- ---------------------------------------------------------------------------
alter table public.memberships enable row level security;

drop policy if exists "users can join a club"       on public.memberships;
drop policy if exists "users can leave a club"      on public.memberships;
drop policy if exists "memberships are viewable"    on public.memberships;
drop policy if exists memberships_select            on public.memberships;
drop policy if exists memberships_insert            on public.memberships;
drop policy if exists memberships_update            on public.memberships;
drop policy if exists memberships_delete            on public.memberships;

create policy memberships_select on public.memberships
    for select to authenticated
    using (true);

-- `user_id` ham MATN (sintetik `student_N` va haqiqiy UUID aralash turadi),
-- shuning uchun har ikki tomon matnga o'giriladi.
create policy memberships_insert on public.memberships
    for insert to authenticated
    with check (public.is_platform_admin() or user_id::text = auth.uid()::text);

create policy memberships_update on public.memberships
    for update to authenticated
    using (public.is_platform_admin() or user_id::text = auth.uid()::text)
    with check (public.is_platform_admin() or user_id::text = auth.uid()::text);

create policy memberships_delete on public.memberships
    for delete to authenticated
    using (public.is_platform_admin() or user_id::text = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 4. TEKSHIRUV: koordinatorlar ko'rinyaptimi?
--    Tayinlagandan keyin shu so'rov bilan tekshiring.
-- ---------------------------------------------------------------------------
-- select m.role, p.full_name, c.name as club
-- from public.memberships m
-- left join public.profiles p on p.id::text = m.user_id::text
-- left join public.clubs c on c.id::text = m.club_id::text
-- where m.role in ('head_coordinator', 'coordinator')
-- order by c.name;
