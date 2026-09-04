-- ============================================================================
-- UniPlatform — "Iqtidorli talabalar" moduli, PHASE 1: SXEMA
-- ============================================================================
-- talent_phase0.sql dan KEYIN ishga tushiriladi.
--
-- Tamoyil: mavjud stipendiya tizimi TEGILMAYDI. Bu jadvallar uning ustiga
-- qo'shiladi va undan ma'lumot o'qiydi. Nomzodlik bosqichiga yetganda
-- talent_targets mavjud `scholarship_applications` ga bog'lanadi - ikkinchi
-- komissiya ham, ikkinchi hujjat oqimi ham qurilmaydi.
--
-- Idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. IQTIDOR PROFILI
--    Har bir dasturga qo'shilgan talaba uchun bitta qator.
--    `program` - 1-kurs dasturimi yoki yuqori kurs; talaba dastur ichida
--    o'sib borgani sari o'zgaradi.
--    `entry_route` - tizimga qanday kirgani. Muhim: talaba faqat 1-kursda
--    emas, ISTALGAN bosqichda qo'shilishi mumkin (spetsifikatsiya §72).
-- ---------------------------------------------------------------------------
create table if not exists public.talent_profiles (
    id              text primary key,
    student_id      text not null,
    program         text not null default 'year1',   -- year1 | senior
    status          text not null default 'active',  -- active | paused | graduated | archived
    cohort_year     integer,
    entry_route     text default 'survey',           -- survey | nomination | achievement | self
    potential_grade text,                            -- A | B | C | null (6 oylik baholashdan keyin)
    talent_score    numeric,
    faculty         text,
    enrolled_at     timestamptz not null default now(),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    data            jsonb not null default '{}'::jsonb
);

create unique index if not exists talent_profiles_student_unique on public.talent_profiles (student_id);
create index if not exists talent_profiles_program_idx  on public.talent_profiles (program);
create index if not exists talent_profiles_status_idx   on public.talent_profiles (status);
create index if not exists talent_profiles_faculty_idx  on public.talent_profiles (faculty);
create index if not exists talent_profiles_grade_idx    on public.talent_profiles (potential_grade);

-- ---------------------------------------------------------------------------
-- 2. BIRIKTIRISHLAR (mentor / tyutor / ilmiy rahbar)
--    Bir talabani bir vaqtda uchalasi ham qo'llab-quvvatlashi mumkin (§64),
--    bir odam bir nechta rolda bo'lishi ham mumkin.
--    Vakolat ROLGA emas, shu biriktiruvga bog'liq - platformada hali
--    "dekan"/"tyutor" rollari yo'q.
-- ---------------------------------------------------------------------------
create table if not exists public.talent_assignments (
    id            text primary key,
    student_id    text not null,
    person_id     text not null,                   -- username
    role          text not null,                   -- mentor | tutor | supervisor
    active        boolean not null default true,
    assigned_at   timestamptz not null default now(),
    ended_at      timestamptz,
    data          jsonb not null default '{}'::jsonb
);

-- Bitta talabada bitta rolda bitta FAOL biriktiruv.
create unique index if not exists talent_assignments_one_active
    on public.talent_assignments (student_id, role) where active;

create index if not exists talent_assignments_person_idx  on public.talent_assignments (person_id, active);
create index if not exists talent_assignments_student_idx on public.talent_assignments (student_id);

-- ---------------------------------------------------------------------------
-- 3. INDIVIDUAL RIVOJLANISH REJASI (IDP)
-- ---------------------------------------------------------------------------
create table if not exists public.talent_idps (
    id           text primary key,
    student_id   text not null,
    status       text not null default 'draft',    -- draft | active | completed | archived
    period_from  date,
    period_to    date,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    data         jsonb not null default '{}'::jsonb
);

create index if not exists talent_idps_student_idx on public.talent_idps (student_id);
create index if not exists talent_idps_status_idx  on public.talent_idps (status);

-- ---------------------------------------------------------------------------
-- 4. IDP MAQSADLARI
--    Har bir maqsad SMART: deadline, status, progress, mas'ul, dalil (§15).
--    Dalillar `data.evidence` ichida - ular orasida MAVJUD hujjatlarga
--    havolalar ham bo'ladi (qayta yuklash talab qilinmaydi, §29/§65).
-- ---------------------------------------------------------------------------
create table if not exists public.talent_goals (
    id             text primary key,
    idp_id         text not null,
    student_id     text not null,
    category       text not null,                  -- academic|language|research|social|international|competition|scholarship|award
    title          text not null,
    deadline       date,
    status         text not null default 'planned', -- planned | in_progress | done | cancelled
    progress       integer not null default 0,
    responsible_id text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    data           jsonb not null default '{}'::jsonb
);

create index if not exists talent_goals_idp_idx      on public.talent_goals (idp_id);
create index if not exists talent_goals_student_idx  on public.talent_goals (student_id);
create index if not exists talent_goals_deadline_idx on public.talent_goals (deadline);
create index if not exists talent_goals_status_idx   on public.talent_goals (status);

-- ---------------------------------------------------------------------------
-- 5. MONITORING (1-kursda oylik, keyin semestrlik)
--    `flag` - 🟢/🟡/🔴. Bu JAZO uchun emas: "talabaga qayerda yordam kerak?"
--    savoliga javob (§11).
-- ---------------------------------------------------------------------------
create table if not exists public.talent_monitoring (
    id          text primary key,
    student_id  text not null,
    period      text not null,                     -- "2026-09" yoki "2026-2027/1"
    period_type text not null default 'month',     -- month | semester
    by_id       text,
    by_role     text,                              -- tutor | mentor | supervisor | faculty
    flag        text default 'green',              -- green | yellow | red
    created_at  timestamptz not null default now(),
    data        jsonb not null default '{}'::jsonb
);

create unique index if not exists talent_monitoring_unique
    on public.talent_monitoring (student_id, period, by_role);

create index if not exists talent_monitoring_student_idx on public.talent_monitoring (student_id);
create index if not exists talent_monitoring_flag_idx    on public.talent_monitoring (flag);

-- ---------------------------------------------------------------------------
-- 6. STIPENDIYA MAQSADLARI (target)
--    Talaba qaysi stipendiyaga tayyorlanmoqda va qay darajada tayyor.
--    `grant_id` - MAVJUD scholarship_grants jadvaliga havola (dublikat yo'q).
--    `application_id` - nomzodlik bosqichida yaratilgan REAL ariza; shu
--    orqali mavjud komissiya zanjiri ishlaydi.
-- ---------------------------------------------------------------------------
create table if not exists public.talent_targets (
    id             text primary key,
    student_id     text not null,
    grant_id       text,
    award_key      text,                           -- davlat mukofoti uchun (grant_id bo'lmaganda)
    status         text not null default 'not_started',
    -- not_started|preparing|almost_ready|ready|candidate|submitted|recommended|won|not_selected|archived
    readiness      numeric not null default 0,
    application_id text,
    priority       integer not null default 1,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    data           jsonb not null default '{}'::jsonb
);

create index if not exists talent_targets_student_idx on public.talent_targets (student_id);
create index if not exists talent_targets_grant_idx   on public.talent_targets (grant_id);
create index if not exists talent_targets_status_idx  on public.talent_targets (status);

create unique index if not exists talent_targets_one_live
    on public.talent_targets (student_id, grant_id)
    where status <> 'archived' and grant_id is not null;

-- ---------------------------------------------------------------------------
-- 7. RAG'BATLANTIRISH
--    Talaba natijaga erishganda tizim uni tayyorlagan jamoani aniqlaydi va
--    Recognition Case ochadi. Rag'bat AVTOMATIK berilmaydi - komissiya
--    ko'rib chiqadi, keyin hujjat chiqariladi (§37).
-- ---------------------------------------------------------------------------
create table if not exists public.recognition_cases (
    id           text primary key,
    student_id   text not null,
    target_id    text,
    achievement  text not null,                    -- "President Scholarship" kabi kalit/nom
    cycle_year   integer,
    status       text not null default 'draft',    -- draft | review | approved | issued | rejected
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    data         jsonb not null default '{}'::jsonb
);

create index if not exists recognition_cases_student_idx on public.recognition_cases (student_id);
create index if not exists recognition_cases_status_idx  on public.recognition_cases (status);
create index if not exists recognition_cases_year_idx    on public.recognition_cases (cycle_year);

-- Case ichidagi har bir shaxs uchun alohida yozuv (ilmiy rahbar, tyutor, mentor).
create table if not exists public.recognition_records (
    id                text primary key,
    case_id           text not null,
    person_id         text not null,
    role              text not null,               -- mentor | tutor | supervisor
    recognition_type  text,                        -- rules'dan keladi
    status            text not null default 'proposed', -- proposed | approved | issued | declined
    document_id       text,                        -- mavjud documents jadvaliga havola
    created_at        timestamptz not null default now(),
    data              jsonb not null default '{}'::jsonb
);

create index if not exists recognition_records_case_idx   on public.recognition_records (case_id);
create index if not exists recognition_records_person_idx on public.recognition_records (person_id);

-- Qoidalar: qaysi natija + qaysi rol -> qanday rag'bat (§63).
-- Moddiy rag'bat kodga qotirilmaydi, shu yerda sozlanadi.
create table if not exists public.recognition_rules (
    id               text primary key,
    achievement_key  text not null,
    role             text not null,
    recognition_type text not null,
    created_at       timestamptz not null default now(),
    data             jsonb not null default '{}'::jsonb
);

create unique index if not exists recognition_rules_unique
    on public.recognition_rules (achievement_key, role);

-- ---------------------------------------------------------------------------
-- 8. AUDIT (§55)
-- ---------------------------------------------------------------------------
create table if not exists public.talent_audit_logs (
    id          text primary key,
    entity      text not null,                     -- profile|idp|goal|assignment|target|monitoring|recognition
    entity_id   text,
    student_id  text,
    action      text not null,
    actor_id    text,
    created_at  timestamptz not null default now(),
    data        jsonb not null default '{}'::jsonb
);

create index if not exists talent_audit_entity_idx  on public.talent_audit_logs (entity, entity_id);
create index if not exists talent_audit_student_idx on public.talent_audit_logs (student_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.talent_profiles      enable row level security;
alter table public.talent_assignments   enable row level security;
alter table public.talent_idps          enable row level security;
alter table public.talent_goals         enable row level security;
alter table public.talent_monitoring    enable row level security;
alter table public.talent_targets       enable row level security;
alter table public.recognition_cases    enable row level security;
alter table public.recognition_records  enable row level security;
alter table public.recognition_rules    enable row level security;
alter table public.talent_audit_logs    enable row level security;

drop policy if exists tp_all  on public.talent_profiles;
drop policy if exists ta_all  on public.talent_assignments;
drop policy if exists ti_all  on public.talent_idps;
drop policy if exists tg_all  on public.talent_goals;
drop policy if exists tm_all  on public.talent_monitoring;
drop policy if exists tt_all  on public.talent_targets;
drop policy if exists rc_all  on public.recognition_cases;
drop policy if exists rr_all  on public.recognition_records;
drop policy if exists rrules_all on public.recognition_rules;
drop policy if exists tal_all on public.talent_audit_logs;

create policy tp_all     on public.talent_profiles     for all to authenticated using (true) with check (true);
create policy ta_all     on public.talent_assignments  for all to authenticated using (true) with check (true);
create policy ti_all     on public.talent_idps         for all to authenticated using (true) with check (true);
create policy tg_all     on public.talent_goals        for all to authenticated using (true) with check (true);
create policy tm_all     on public.talent_monitoring   for all to authenticated using (true) with check (true);
create policy tt_all     on public.talent_targets      for all to authenticated using (true) with check (true);
create policy rc_all     on public.recognition_cases   for all to authenticated using (true) with check (true);
create policy rr_all     on public.recognition_records for all to authenticated using (true) with check (true);
create policy rrules_all on public.recognition_rules   for all to authenticated using (true) with check (true);
create policy tal_all    on public.talent_audit_logs   for all to authenticated using (true) with check (true);
