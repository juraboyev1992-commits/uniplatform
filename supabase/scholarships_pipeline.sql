-- ============================================================================
-- UniPlatform — Stipendiya: SOZLANADIGAN BOSQICHLAR ZANJIRI
-- ============================================================================
-- scholarships.sql va scholarships_stages.sql dan KEYIN ishga tushiriladi.
-- Idempotent.
--
-- Nima o'zgaradi: bosqichlar endi qat'iy "fakultet -> universitet" emas. Har bir
-- grant o'z zanjirini quradi (hujjat ko'rigi, fakultet komissiyasi, test, suhbat,
-- universitet komissiyasi, yakun) - shuning uchun ariza qaysi bosqichda turgani
-- matn emas, zanjirdagi INDEKS bilan saqlanadi.
-- ============================================================================

-- Ariza zanjirning nechanchi bosqichida turibdi (0 dan boshlab).
alter table public.scholarship_applications
    add column if not exists stage_index integer not null default 0;

create index if not exists scholarship_applications_stage_index_idx
    on public.scholarship_applications (stage_index);

-- Baho endi ALOHIDA BOSQICHGA tegishli: bitta nomzod fakultet komissiyasida ham,
-- suhbatda ham baholanadi va ikkalasi aralashib ketmasligi kerak.
alter table public.scholarship_evaluations
    add column if not exists stage_id text;

-- Eski (bosqichsiz) baholar fakultet bosqichiga tegishli edi.
update public.scholarship_evaluations
    set stage_id = 'faculty'
    where stage_id is null;

-- Unikallik endi bosqichni ham hisobga oladi: bitta baholovchi bitta arizani
-- HAR BOSQICHDA bir martadan baholaydi.
drop index if exists public.scholarship_evaluations_one_per_evaluator;

create unique index if not exists scholarship_evaluations_one_per_stage
    on public.scholarship_evaluations (application_id, evaluator_id, stage_id);

create index if not exists scholarship_evaluations_stage_idx
    on public.scholarship_evaluations (stage_id);
