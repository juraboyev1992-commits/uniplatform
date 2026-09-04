-- ============================================================================
-- UniPlatform — Stipendiyalar moduli (Supabase migratsiyasi)
-- ============================================================================
-- Bu skript 3 ta jadval yaratadi. Platformaning qolgan qismidagi kabi "yupqa
-- relyatsion qobiq + data jsonb" shakli ishlatiladi: qidiriladigan/filtrlanadigan
-- maydonlar alohida ustunga chiqarilgan, qolgani `data` ichida.
--
-- Idempotent: qayta ishga tushirish xavfsiz (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Grantlar (avval localStorage['uni_grants'] da edi)
-- ---------------------------------------------------------------------------
create table if not exists public.scholarship_grants (
    id          text primary key,
    title       text not null,
    status      text not null default 'draft',   -- draft | active | closed | archived
    deadline    date,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    data        jsonb not null default '{}'::jsonb
);

create index if not exists scholarship_grants_status_idx   on public.scholarship_grants (status);
create index if not exists scholarship_grants_deadline_idx on public.scholarship_grants (deadline);

-- ---------------------------------------------------------------------------
-- 2. Arizalar (avval faqat localStorage'da — admin qarori boshqa qurilmada
--    ko'rinmasdi)
-- ---------------------------------------------------------------------------
create table if not exists public.scholarship_applications (
    id            text primary key,
    grant_id      text,
    student_id    text not null,
    status        text not null default 'submitted',
    -- draft | submitted | doc_check | committee | approved | rejected | withdrawn
    submitted_at  timestamptz,
    reviewed_at   timestamptz,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    data          jsonb not null default '{}'::jsonb
);

create index if not exists scholarship_applications_grant_idx   on public.scholarship_applications (grant_id);
create index if not exists scholarship_applications_student_idx on public.scholarship_applications (student_id);
create index if not exists scholarship_applications_status_idx  on public.scholarship_applications (status);

-- Bitta talaba bitta grantga faqat bitta faol ariza bera oladi. Rad etilgan yoki
-- qaytarib olingan arizadan keyin qayta topshirish mumkin bo'lishi uchun bu
-- qisman (partial) unique indeks — faqat "tirik" holatlarni qamrab oladi.
create unique index if not exists scholarship_applications_one_live_per_grant
    on public.scholarship_applications (grant_id, student_id)
    where status in ('draft', 'submitted', 'doc_check', 'committee', 'approved');

-- ---------------------------------------------------------------------------
-- 3. Sozlamalar — me'zonlar katalogi va hujjat turlari.
--    Avval oddiy useState edi: sahifa yangilansa yo'qolardi.
--    Bitta qator (id = 'default') — butun platforma uchun.
-- ---------------------------------------------------------------------------
create table if not exists public.scholarship_settings (
    id          text primary key,
    updated_at  timestamptz not null default now(),
    data        jsonb not null default '{}'::jsonb
);

insert into public.scholarship_settings (id, data)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS — platformaning boshqa jadvallari bilan bir xil siyosat:
-- autentifikatsiyadan o'tgan foydalanuvchiga to'liq ruxsat, anon'ga yo'q.
-- (Rolga asoslangan cheklov ilova qatlamida — Sidebar/ProtectedRoute.)
-- ---------------------------------------------------------------------------
alter table public.scholarship_grants       enable row level security;
alter table public.scholarship_applications enable row level security;
alter table public.scholarship_settings     enable row level security;

drop policy if exists scholarship_grants_all       on public.scholarship_grants;
drop policy if exists scholarship_applications_all on public.scholarship_applications;
drop policy if exists scholarship_settings_all     on public.scholarship_settings;

create policy scholarship_grants_all       on public.scholarship_grants
    for all to authenticated using (true) with check (true);
create policy scholarship_applications_all on public.scholarship_applications
    for all to authenticated using (true) with check (true);
create policy scholarship_settings_all     on public.scholarship_settings
    for all to authenticated using (true) with check (true);
