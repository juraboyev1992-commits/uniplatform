-- ===========================================================================
-- "MA'RIFAT DARSLARI" MODULI
-- Ijtimoiy faollik indeksining 7-mezoni (186-son buyruq, 2025-05-16)
--
-- Nega alohida jadval, tadbirlar emas: Ma'rifat darsi AUDITORIYA kesimida
-- rejalashtiriladi ("Yuridik fakultet 1-kursi uchun 6 ta dars"), va ball
-- aynan shu auditoriya doirasidagi davomat foizidan chiqadi. Tadbirlar
-- jadvalida bunday maydon yo'q va bo'lishi ham kerak emas.
--
-- Ball ikki qismdan:
--   davomat foizi -> 6 ballgacha  (tizim hisoblaydi)
--   faollik       -> 4 ballgacha  (vakolatli shaxs qo'yadi)
--
-- Supabase SQL Editor da bir marta ishga tushiriladi. Qayta ishga tushirish
-- xavfsiz: hamma narsa `if not exists` bilan.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. DARSLAR
--
--    faculty + course - AUDITORIYA. Ikkalasi ham majburiy: ularsiz davomat
--    foizining maxrajini aniqlab bo'lmaydi.
-- ---------------------------------------------------------------------------
create table if not exists public.marifat_lessons (
    id             text primary key,
    academic_year  text not null,              -- masalan "2026-2027"
    title          text not null,
    topic          text not null default '',
    date           date not null,
    faculty        text not null,              -- auditoriya: fakultet
    course         integer not null,           -- auditoriya: kurs
    venue          text not null default '',
    locked         boolean not null default false,   -- davomat qulflanganmi
    created_by     text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    data           jsonb not null default '{}'::jsonb
);

create index if not exists marifat_lessons_year_idx     on public.marifat_lessons (academic_year);
create index if not exists marifat_lessons_audience_idx on public.marifat_lessons (faculty, course);
create index if not exists marifat_lessons_date_idx     on public.marifat_lessons (date desc);

-- ---------------------------------------------------------------------------
-- 2. DAVOMAT
--
--    `active` - darsda FAOL qatnashgani. Alohida jadval emas: faollik aynan
--    shu darsdagi ishtirokning sifati.
--
--    Cheklov: kelmagan talaba faol bo'la olmaydi. Buni ilova ham tekshiradi,
--    lekin qoida ma'lumotlar bazasida turishi kerak - ilova chetlab o'tilsa
--    ham hisob buzilmasin.
-- ---------------------------------------------------------------------------
create table if not exists public.marifat_attendance (
    id          text primary key,
    lesson_id   text not null references public.marifat_lessons (id) on delete cascade,
    student_id  text not null,
    present     boolean not null default false,
    active      boolean not null default false,
    marked_by   text,
    marked_at   timestamptz not null default now(),
    data        jsonb not null default '{}'::jsonb,

    constraint marifat_attendance_active_requires_present
        check (active = false or present = true)
);

create unique index if not exists marifat_attendance_unique
    on public.marifat_attendance (lesson_id, student_id);

create index if not exists marifat_attendance_student_idx on public.marifat_attendance (student_id);

-- ---------------------------------------------------------------------------
-- 3. FAOLLIK BALI (yillik)
--
--    Metodikada faollik balining O'LCHOVI ham, KIM QO'YISHI ham
--    ko'rsatilmagan. Shuning uchun u tizim tomonidan qo'yilmaydi: vakolatli
--    shaxs kiritadi, tizim faqat taklif beradi. Kim va qachon qo'ygani
--    saqlanadi - bu ball keyin bahsga sabab bo'lishi mumkin.
--
--    Yuqori chegara 4 ball - buyruq bilan belgilangan, shuning uchun
--    ma'lumotlar bazasida ham tekshiriladi.
-- ---------------------------------------------------------------------------
create table if not exists public.marifat_activity_scores (
    id             text primary key,
    student_id     text not null,
    academic_year  text not null,
    points         numeric not null check (points >= 0 and points <= 4),
    comment        text not null default '',
    assessed_by    text,
    assessed_at    timestamptz not null default now(),
    data           jsonb not null default '{}'::jsonb
);

create unique index if not exists marifat_activity_scores_unique
    on public.marifat_activity_scores (student_id, academic_year);

-- ---------------------------------------------------------------------------
-- RLS — platformadagi boshqa jadvallar bilan bir xil
-- ---------------------------------------------------------------------------
alter table public.marifat_lessons         enable row level security;
alter table public.marifat_attendance      enable row level security;
alter table public.marifat_activity_scores enable row level security;

drop policy if exists ml_all  on public.marifat_lessons;
drop policy if exists ma_all  on public.marifat_attendance;
drop policy if exists mas_all on public.marifat_activity_scores;

create policy ml_all  on public.marifat_lessons         for all to authenticated using (true) with check (true);
create policy ma_all  on public.marifat_attendance      for all to authenticated using (true) with check (true);
create policy mas_all on public.marifat_activity_scores for all to authenticated using (true) with check (true);
