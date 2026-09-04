-- ============================================================================
-- UniPlatform — TESTLAR MODULI (Supabase migratsiyasi)
-- ============================================================================
-- Testlar bo'limi shu paytgacha butunlay mock edi: savollar ham, testlar ham,
-- natijalar ham komponent ichidagi `useState` massivlarda yashagan. Ya'ni har
-- brauzerda boshqacha ma'lumot, natijalar esa umuman saqlanmagan.
--
-- Bu skript o'sha uchta narsani real backendga chiqaradi. Platformaning qolgan
-- qismidagi kabi "yupqa relyatsion qobiq + data jsonb" shakli.
--
-- Idempotent: qayta ishga tushirish xavfsiz.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Savollar bazasi (fan/mavzu bo'yicha to'plam)
-- ---------------------------------------------------------------------------
create table if not exists public.question_bases (
    id          text primary key,
    title       text not null,
    status      text not null default 'active',   -- active | archived
    created_at  timestamptz not null default now(),
    data        jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- 2. Savollar
--    `data` ichida: text, options[], correctIndex, explanation
-- ---------------------------------------------------------------------------
create table if not exists public.test_questions (
    id          text primary key,
    base_id     text,
    subject     text,
    difficulty  text default 'medium',            -- easy | medium | hard
    created_at  timestamptz not null default now(),
    data        jsonb not null default '{}'::jsonb
);

create index if not exists test_questions_base_idx    on public.test_questions (base_id);
create index if not exists test_questions_subject_idx on public.test_questions (subject);

-- ---------------------------------------------------------------------------
-- 3. Testlar
--    `data` ichida: type ('single'|'blocks'), blocks[], totalLimit, time,
--    shuffle, passScore, resultsPublished, description
-- ---------------------------------------------------------------------------
create table if not exists public.tests (
    id            text primary key,
    title         text not null,
    subject       text,
    status        text not null default 'draft',  -- draft | active | finished
    is_published  boolean not null default false,
    opens_at      timestamptz,
    closes_at     timestamptz,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    data          jsonb not null default '{}'::jsonb
);

create index if not exists tests_status_idx    on public.tests (status);
create index if not exists tests_published_idx on public.tests (is_published);

-- ---------------------------------------------------------------------------
-- 4. Urinishlar (natijalar)
--    Bir talaba bir testni bir necha marta topshirishi mumkin - shuning uchun
--    unique YO'Q; eng yaxshi/oxirgi urinish ilova qatlamida tanlanadi.
--    `data` ichida: answers{}, perBlock[], startedAt
-- ---------------------------------------------------------------------------
create table if not exists public.test_attempts (
    id           text primary key,
    test_id      text not null,
    student_id   text not null,
    score        numeric not null default 0,
    max_score    numeric not null default 0,
    correct      integer not null default 0,
    total        integer not null default 0,
    finished_at  timestamptz,
    created_at   timestamptz not null default now(),
    data         jsonb not null default '{}'::jsonb
);

create index if not exists test_attempts_test_idx    on public.test_attempts (test_id);
create index if not exists test_attempts_student_idx on public.test_attempts (student_id);
create index if not exists test_attempts_pair_idx    on public.test_attempts (test_id, student_id);

-- ---------------------------------------------------------------------------
-- RLS — platformadagi boshqa jadvallar bilan bir xil
-- ---------------------------------------------------------------------------
alter table public.question_bases  enable row level security;
alter table public.test_questions  enable row level security;
alter table public.tests           enable row level security;
alter table public.test_attempts   enable row level security;

drop policy if exists question_bases_all on public.question_bases;
drop policy if exists test_questions_all on public.test_questions;
drop policy if exists tests_all          on public.tests;
drop policy if exists test_attempts_all  on public.test_attempts;

create policy question_bases_all on public.question_bases
    for all to authenticated using (true) with check (true);
create policy test_questions_all on public.test_questions
    for all to authenticated using (true) with check (true);
create policy tests_all on public.tests
    for all to authenticated using (true) with check (true);
create policy test_attempts_all on public.test_attempts
    for all to authenticated using (true) with check (true);
