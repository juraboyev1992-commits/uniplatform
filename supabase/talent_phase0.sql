-- ============================================================================
-- UniPlatform — "Iqtidorli talabalar" moduli, PHASE 0: POYDEVOR
-- ============================================================================
-- Talent moduli qurilishidan OLDIN ishga tushiriladi.
--
-- Uchta narsa hal qilinadi:
--   1. Ijtimoiy faollik ballari    -> brauzerdan serverga
--   2. Davomat                     -> brauzerdan serverga
--   3. Akademik ko'rsatkich (GPA)  -> umuman yo'q edi, yangi jadval
--
-- Sababi: Talent Score va monitoring aynan shu uch manbaga tayanadi. Ular
-- brauzerda qolsa, har kompyuterda boshqacha reyting chiqadi va butun modul
-- ishonchsiz bo'ladi.
--
-- Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. IJTIMOIY FAOLLIK BALLARI (ledger)
--    Reytinglar, TAS va stipendiya me'zonlari shu jadvaldan o'qiydi.
--    `points` alohida ustunda - u bo'yicha yig'indi olinadi.
-- ---------------------------------------------------------------------------
create table if not exists public.social_score_transactions (
    id              text primary key,
    student_id      text not null,
    application_id  text,
    category        text,
    points          numeric not null default 0,
    academic_year   text,
    created_at      timestamptz not null default now(),
    data            jsonb not null default '{}'::jsonb
);

create index if not exists sst_student_idx  on public.social_score_transactions (student_id);
create index if not exists sst_category_idx on public.social_score_transactions (category);
create index if not exists sst_year_idx     on public.social_score_transactions (academic_year);

-- ---------------------------------------------------------------------------
-- 2. DAVOMAT
--    Bitta faoliyatning bitta "barg birligi"da (raund/match/tadbir) bitta
--    ishtirokchi bitta qatorga ega - unique shuni kafolatlaydi.
-- ---------------------------------------------------------------------------
create table if not exists public.activity_attendance (
    id              text primary key,
    activity_id     text not null,
    activity_type   text not null,             -- event | competition
    leaf_unit_type  text not null,             -- round | match | event ...
    leaf_unit_id    text not null,
    participant_id  text not null,
    team_id         text,
    status          text not null,             -- present | absent | excused
    marked_at       timestamptz,
    created_at      timestamptz not null default now(),
    data            jsonb not null default '{}'::jsonb
);

create unique index if not exists activity_attendance_unique
    on public.activity_attendance (activity_id, activity_type, leaf_unit_type, leaf_unit_id, participant_id);

create index if not exists aa_participant_idx on public.activity_attendance (participant_id);
create index if not exists aa_activity_idx    on public.activity_attendance (activity_id, activity_type);

-- Davomat qulflari va audit izi - mavjud mexanizm shularsiz ishlamaydi.
create table if not exists public.activity_attendance_locks (
    id              text primary key,
    activity_id     text not null,
    activity_type   text not null,
    leaf_unit_type  text not null,
    leaf_unit_id    text not null,
    locked_at       timestamptz,
    reopened_at     timestamptz,
    data            jsonb not null default '{}'::jsonb
);

create unique index if not exists activity_attendance_locks_unique
    on public.activity_attendance_locks (activity_id, activity_type, leaf_unit_type, leaf_unit_id);

create table if not exists public.activity_attendance_audit_logs (
    id              text primary key,
    activity_id     text not null,
    activity_type   text not null,
    participant_id  text not null,
    created_at      timestamptz not null default now(),
    data            jsonb not null default '{}'::jsonb
);

create index if not exists aaal_activity_idx on public.activity_attendance_audit_logs (activity_id, activity_type);

-- ---------------------------------------------------------------------------
-- 3. AKADEMIK KO'RSATKICH (GPA)
--    Platformada GPA umuman yo'q edi - studentScoring.js tasodifiy `gpaProxy`
--    ishlatardi. Talent moduli uchun bu yaramaydi.
--
--    Har semestr uchun alohida qator: GPA vaqt bo'yicha o'zgaradi va
--    "o'sish/tushish" dinamikasi monitoringning asosiy signali.
--
--    `source` - ma'lumot qayerdan keldi: hemis | manual | import
--    Bu muhim: HEMIS'dan kelgan raqam bilan qo'lda kiritilgani interfeysda
--    aralashib ketmasligi kerak.
-- ---------------------------------------------------------------------------
create table if not exists public.academic_records (
    id            text primary key,
    student_id    text not null,
    academic_year text not null,               -- masalan "2026-2027"
    semester      integer not null,            -- 1 | 2
    gpa           numeric,
    credits       numeric,
    source        text not null default 'manual',  -- hemis | manual | import
    synced_at     timestamptz,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    data          jsonb not null default '{}'::jsonb
);

create unique index if not exists academic_records_unique
    on public.academic_records (student_id, academic_year, semester);

create index if not exists academic_records_student_idx on public.academic_records (student_id);
create index if not exists academic_records_source_idx  on public.academic_records (source);

-- ---------------------------------------------------------------------------
-- 4. TASHQI TIZIM INTEGRATSIYASI SOZLAMALARI (HEMIS)
--    Bitta qator. Token bu yerda SAQLANMAYDI - u Edge Function'ning maxfiy
--    o'zgaruvchisida turadi (brauzerga hech qachon tushmasligi kerak).
--    Bu yerda faqat manzil, moslashtirish xaritasi va oxirgi sinxronlash izi.
-- ---------------------------------------------------------------------------
create table if not exists public.integration_settings (
    id          text primary key,
    updated_at  timestamptz not null default now(),
    data        jsonb not null default '{}'::jsonb
);

insert into public.integration_settings (id, data)
values ('hemis', '{"enabled": false, "baseUrl": "", "fieldMap": {}}'::jsonb)
on conflict (id) do nothing;

-- Sinxronlash tarixi - "qachon, nechta yozuv, xato bo'ldimi" ko'rinib tursin.
create table if not exists public.integration_sync_logs (
    id            text primary key,
    integration   text not null,
    status        text not null,               -- ok | error | partial
    started_at    timestamptz not null default now(),
    finished_at   timestamptz,
    records       integer not null default 0,
    data          jsonb not null default '{}'::jsonb
);

create index if not exists isl_integration_idx on public.integration_sync_logs (integration, started_at desc);

-- ---------------------------------------------------------------------------
-- RLS — platformadagi boshqa jadvallar bilan bir xil
-- ---------------------------------------------------------------------------
alter table public.social_score_transactions     enable row level security;
alter table public.activity_attendance           enable row level security;
alter table public.activity_attendance_locks     enable row level security;
alter table public.activity_attendance_audit_logs enable row level security;
alter table public.academic_records              enable row level security;
alter table public.integration_settings          enable row level security;
alter table public.integration_sync_logs         enable row level security;

drop policy if exists sst_all   on public.social_score_transactions;
drop policy if exists aa_all    on public.activity_attendance;
drop policy if exists aal_all   on public.activity_attendance_locks;
drop policy if exists aaal_all  on public.activity_attendance_audit_logs;
drop policy if exists ar_all    on public.academic_records;
drop policy if exists is_all    on public.integration_settings;
drop policy if exists isl_all   on public.integration_sync_logs;

create policy sst_all  on public.social_score_transactions      for all to authenticated using (true) with check (true);
create policy aa_all   on public.activity_attendance            for all to authenticated using (true) with check (true);
create policy aal_all  on public.activity_attendance_locks      for all to authenticated using (true) with check (true);
create policy aaal_all on public.activity_attendance_audit_logs for all to authenticated using (true) with check (true);
create policy ar_all   on public.academic_records               for all to authenticated using (true) with check (true);
create policy is_all   on public.integration_settings           for all to authenticated using (true) with check (true);
create policy isl_all  on public.integration_sync_logs          for all to authenticated using (true) with check (true);
