-- ============================================================================
-- UniPlatform — Stipendiya: IKKI BOSQICHLI TANLOV (fakultet -> universitet)
-- ============================================================================
-- supabase/scholarships.sql dan KEYIN ishga tushiriladi.
-- Idempotent: qayta ishga tushirish xavfsiz.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Arizaga bosqich ustuni.
--    Qidiriladigan/filtrlanadigan maydon bo'lgani uchun jsonb ichida emas,
--    alohida ustunda — admin monitoringi aynan shu bo'yicha filtrlaydi.
-- ---------------------------------------------------------------------------
alter table public.scholarship_applications
    add column if not exists stage text not null default 'faculty';   -- faculty | university

create index if not exists scholarship_applications_stage_idx
    on public.scholarship_applications (stage);

-- ---------------------------------------------------------------------------
-- 2. Baholashlar.
--    Alohida jadval, ariza `data` ichidagi massiv EMAS: bitta arizani bir necha
--    baholovchi bir vaqtda baholashi mumkin, jsonb massivda esa oxirgi yozuv
--    avvalgisini yo'q qilib yuborardi (lost update).
--    Bitta baholovchi bitta arizaga bitta baho — unique bilan kafolatlanadi,
--    qayta baholash mavjud qatorni yangilaydi.
-- ---------------------------------------------------------------------------
create table if not exists public.scholarship_evaluations (
    id              text primary key,
    application_id  text not null,
    grant_id        text,
    evaluator_id    text not null,
    total           numeric not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    data            jsonb not null default '{}'::jsonb
);

create index if not exists scholarship_evaluations_app_idx
    on public.scholarship_evaluations (application_id);
create index if not exists scholarship_evaluations_grant_idx
    on public.scholarship_evaluations (grant_id);
create index if not exists scholarship_evaluations_evaluator_idx
    on public.scholarship_evaluations (evaluator_id);

create unique index if not exists scholarship_evaluations_one_per_evaluator
    on public.scholarship_evaluations (application_id, evaluator_id);

-- ---------------------------------------------------------------------------
-- RLS — boshqa stipendiya jadvallari bilan bir xil.
-- Kim kimni baholay olishi ilova qatlamida cheklanadi (fakultet biriktiruvi).
-- ---------------------------------------------------------------------------
alter table public.scholarship_evaluations enable row level security;

drop policy if exists scholarship_evaluations_all on public.scholarship_evaluations;

create policy scholarship_evaluations_all on public.scholarship_evaluations
    for all to authenticated using (true) with check (true);
