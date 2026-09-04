-- ===========================================================================
-- KLUBGA A'ZOLIK: ARIZA VA TARIX
--
-- IKKI MUAMMO:
--
-- 1. A'ZOLIK ARIZASI YO'Q EDI. "A'zo bo'lish" bosilishi bilan talaba
--    DARHOL a'zo bo'lardi. Zakovat yoki Moot Court kabi klublar esa a'zoni
--    tanlaydi - ular uchun bu yo'l umuman yaroqsiz edi. Endi klubning
--    o'zi tanlaydi: ochiq (darhol qo'shiladi) yoki arizali (koordinator
--    ko'rib chiqadi).
--
-- 2. A'ZOLIK TARIXI YO'Q EDI. `leaveClub` yozuvni butunlay O'CHIRARDI -
--    kim qachon kirgani va chiqqani hech qayerda qolmasdi. Lavozimlarda
--    tarix saqlanadi (`clubPositionAssignments` yozuvi `ended` bo'ladi),
--    a'zolikda esa yo'q edi.
--
-- Supabase SQL Editor da bir marta ishga tushiriladi.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. A'ZOLIKKA ARIZALAR
--
--    Ariza A'ZOLIK EMAS, shuning uchun `memberships` da saqlanmaydi:
--    tasdiqlanmagan ariza a'zolik huquqini bermasligi kerak va uni
--    a'zolik jadvalida "holat" bilan saqlash xatolikka juda yaqin.
-- ---------------------------------------------------------------------------
create table if not exists public.club_join_requests (
    id          text primary key,
    club_id     text not null,
    user_id     text not null,
    status      text not null default 'pending',   -- pending | approved | rejected | cancelled
    data        jsonb not null default '{}'::jsonb, -- { motivation, reviewedBy, reviewedAt, comment }
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists club_join_requests_club_idx on public.club_join_requests (club_id);
create index if not exists club_join_requests_user_idx on public.club_join_requests (user_id);

-- Bitta talaba bitta klubga bir vaqtda bitta OCHIQ ariza bera oladi.
-- Cheklov bazada: bir necha oyna ochib turgan foydalanuvchi aks holda
-- takroriy ariza yuborardi.
create unique index if not exists club_join_requests_one_open
    on public.club_join_requests (club_id, user_id)
    where status = 'pending';

-- ---------------------------------------------------------------------------
-- 2. A'ZOLIK TARIXI
--
--    FAQAT QO'SHILADI, o'chirilmaydi va tahrirlanmaydi. Har voqea alohida
--    qator: qo'shildi, chiqdi, roli o'zgardi. Shu bilan "bu talaba klubda
--    qancha turdi" degan savolga javob bor - avval u yo'q edi.
-- ---------------------------------------------------------------------------
create table if not exists public.club_membership_events (
    id          text primary key,
    club_id     text not null,
    user_id     text not null,
    action      text not null,                      -- joined | left | role_changed
    data        jsonb not null default '{}'::jsonb, -- { role, previousRole, by, source, reason }
    created_at  timestamptz not null default now()
);

create index if not exists club_membership_events_club_idx on public.club_membership_events (club_id);
create index if not exists club_membership_events_user_idx on public.club_membership_events (user_id);

-- ---------------------------------------------------------------------------
-- 3. RUXSATLAR
--
--    `is_platform_admin()` supabase/club_membership_policy.sql da yaratilgan.
--
--    Arizani o'zi yubora oladi va o'zi bekor qila oladi; ko'rib chiqish
--    esa administrator qo'lida. Koordinator ko'rib chiqishi KODDA
--    tekshiriladi - uning roli `memberships` jadvalida turadi va uni
--    siyosat ichidan o'qish har so'rovda qo'shimcha so'rov demakdir.
-- ---------------------------------------------------------------------------
alter table public.club_join_requests enable row level security;
alter table public.club_membership_events enable row level security;

drop policy if exists club_join_requests_select on public.club_join_requests;
drop policy if exists club_join_requests_insert on public.club_join_requests;
drop policy if exists club_join_requests_update on public.club_join_requests;

create policy club_join_requests_select on public.club_join_requests
    for select to authenticated using (true);

create policy club_join_requests_insert on public.club_join_requests
    for insert to authenticated with check (true);

create policy club_join_requests_update on public.club_join_requests
    for update to authenticated using (true) with check (true);

drop policy if exists club_membership_events_select on public.club_membership_events;
drop policy if exists club_membership_events_insert on public.club_membership_events;

create policy club_membership_events_select on public.club_membership_events
    for select to authenticated using (true);

-- Faqat qo'shish. O'chirish va tahrirlash siyosati ATAYLAB yaratilmaydi -
-- tarixni o'zgartirib bo'lmasligi kerak.
create policy club_membership_events_insert on public.club_membership_events
    for insert to authenticated with check (true);

-- ---------------------------------------------------------------------------
-- 4. TEKSHIRUV
-- ---------------------------------------------------------------------------
select
    (select count(*) from public.club_join_requests)     as arizalar,
    (select count(*) from public.club_membership_events) as tarix_yozuvlari;
