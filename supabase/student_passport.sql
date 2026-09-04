-- ===========================================================================
-- TALABANING RAQAMLI PASPORTI
--
-- Tuzilma HEMIS'ning "Talabaning raqamli pasporti" ekranidan olingan: bir xil
-- bo'limlar, bir xil maydonlar. Ma'lumot kelajakda o'sha tizimdan keladi va
-- ikkita boshqa-boshqa shakl bo'lsa moslashtirish har safar qo'lda qilinardi.
--
-- NEGA USTUNLAR EMAS, JSONB:
--   Pasport bo'limlari o'zgarib turadi (HEMIS'da ham). Har yangi maydon uchun
--   migratsiya yozish - aynan shu loyihada "har yangi ehtiyoj yangi jadval"
--   muammosini tug'dirgan yo'l. Bo'limlar `sections` ichida, manba esa har
--   maydon uchun alohida `field_sources` da.
--
-- NIMA SAQLANMAYDI:
--   Turar joy (`student_housing`), stipendiya, davomat, ijtimoiy faollik
--   indeksi - bular o'z jadvallarida qoladi va pasport ularni faqat O'QIYDI.
--   Ikkinchi nusxa saqlansa ikkita raqam bir-biriga zid chiqadi.
--
-- Supabase SQL Editor da bir marta ishga tushiriladi. Qayta ishga tushirish
-- xavfsiz.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. PASPORT
--
--    `sections` shakli:
--      { "identity": { "jshshir": "...", "passport": "..." },
--        "contact":  { "phone": "...", "email": "..." },
--        "social":   { "orphan": true, "disability": "..." } }
--
--    `field_sources` shakli:
--      { "identity.jshshir": "hemis", "contact.phone": "manual" }
-- ---------------------------------------------------------------------------
create table if not exists public.student_passport (
    student_id     text primary key,
    sections       jsonb not null default '{}'::jsonb,
    field_sources  jsonb not null default '{}'::jsonb,
    updated_by     text,
    updated_at     timestamptz not null default now(),
    data           jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- 2. O'QUV TARIXI (yil kesimida)
--
--    Kurs va guruh har yili o'zgaradi. Hozir faqat JORIY qiymat saqlanadi va
--    "2024-yilda 2-kursda edi" degan ma'lumot yo'qoladi - arxiv hisobotlar
--    shu sababli noto'g'ri chiqardi.
-- ---------------------------------------------------------------------------
create table if not exists public.student_enrollment_history (
    id             text primary key,
    student_id     text not null,
    academic_year  text not null,
    course         integer,
    faculty        text,
    student_group  text,
    education_form text,
    status         text,                       -- o'qimoqda | akademik ta'til | chetlashtirilgan | bitirgan
    source         text not null default 'manual',
    created_at     timestamptz not null default now(),
    data           jsonb not null default '{}'::jsonb
);

create unique index if not exists enrollment_history_unique
    on public.student_enrollment_history (student_id, academic_year);

-- ---------------------------------------------------------------------------
-- 3. MAXFIY MAYDONGA KIM QARAGANI
--
--    Cheklovdan ham muhimroq: cheklovni chetlab o'tish mumkin, izni esa yo'q.
--    JSHSHIR, passport, nogironlik, ijtimoiy himoya - bularga har qaralganda
--    yozuv qoladi.
-- ---------------------------------------------------------------------------
create table if not exists public.passport_access_logs (
    id          text primary key,
    student_id  text not null,
    viewer_id   text not null,
    viewer_kind text not null,                 -- self | admin | tutor | evaluator | ...
    fields      text[] not null default '{}',  -- qaysi maxfiy maydonlar ochilgan
    reason      text not null default '',
    created_at  timestamptz not null default now()
);

create index if not exists passport_access_student_idx on public.passport_access_logs (student_id, created_at desc);
create index if not exists passport_access_viewer_idx  on public.passport_access_logs (viewer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS — platformadagi boshqa jadvallar bilan bir xil
-- ---------------------------------------------------------------------------
alter table public.student_passport            enable row level security;
alter table public.student_enrollment_history  enable row level security;
alter table public.passport_access_logs        enable row level security;

drop policy if exists sp_all  on public.student_passport;
drop policy if exists seh_all on public.student_enrollment_history;
drop policy if exists pal_all on public.passport_access_logs;

create policy sp_all  on public.student_passport           for all to authenticated using (true) with check (true);
create policy seh_all on public.student_enrollment_history for all to authenticated using (true) with check (true);
create policy pal_all on public.passport_access_logs       for all to authenticated using (true) with check (true);
