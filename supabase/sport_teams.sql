-- ===========================================================================
-- TERMA JAMOALAR (10-mezon)
-- Sport bilan shug'ullanishi va sog'lom turmush tarziga amal qilishi
--
-- Metodika 10-mezonda uchta a'zolik turini sanaydi va ular BIR-BIRINI
-- ISTISNO QILADI (eng yuqorisi olinadi):
--   terma jamoa a'zoligi                     - 5 ball
--   sport klubi/seksiyada muntazam shug'ullanish - 3 ball
--   OTM sport musobaqalarida faol ishtirok    - 1 ball
--
-- Ikkinchi va uchinchisi platformada ALLAQACHON bor (klub davomati va sport
-- musobaqalari), birinchisi esa yo'q edi - shu fayl o'shani qo'shadi.
--
-- YANGI ROL OCHILMADI: terma jamoani sport yo'nalishidagi klubning
-- koordinatori boshqaradi. Klub yo'nalishlari 2-mezon uchun allaqachon
-- belgilanadi, klub rollari ham ishlaydi.
--
-- Supabase SQL Editor da bir marta ishga tushiriladi. Qayta ishga tushirish
-- xavfsiz.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. TERMA JAMOALAR
--
--    MAVSUM (academic_year) majburiy: o'tgan yilgi a'zolik jimgina davom
--    etmasligi kerak. Ball har o'quv yili uchun alohida hisoblanadi.
-- ---------------------------------------------------------------------------
create table if not exists public.sport_teams (
    id             text primary key,
    club_id        text,                       -- sport yo'nalishidagi klub
    name           text not null,
    sport          text not null default '',   -- voleybol, futbol, kurash...
    academic_year  text not null,
    max_size       integer,                    -- null = cheklov yo'q
    is_active      boolean not null default true,
    created_by     text,
    created_at     timestamptz not null default now(),
    data           jsonb not null default '{}'::jsonb
);

create index if not exists sport_teams_year_idx on public.sport_teams (academic_year);
create index if not exists sport_teams_club_idx on public.sport_teams (club_id);

-- ---------------------------------------------------------------------------
-- 2. NOMZODLAR VA TARKIB
--
--    Bitta jadval ikkala holatni ham saqlaydi: nomzod (pending) va tasdiqlangan
--    a'zo (approved). Alohida "tarkib" jadvali ochilmadi - a'zolik aynan
--    tasdiqlangan nomzodlik, va tarixi ham shu yerda qoladi.
--
--    `source` - kim tavsiya etgani:
--      tutor  - tyutor o'z talabasini
--      self   - talabaning o'zi ariza bergan
--      system - tizim taklif qilgan (sport natijalari asosida)
--      head   - klub rahbarining o'zi qo'shgan (ko'rib chiqish shart emas,
--               chunki ko'rib chiqadigan odamning o'zi qo'shyapti)
-- ---------------------------------------------------------------------------
create table if not exists public.sport_team_nominations (
    id             text primary key,
    team_id        text not null references public.sport_teams (id) on delete cascade,
    student_id     text not null,
    academic_year  text not null,
    source         text not null default 'tutor',
    nominated_by   text,
    motivation     text not null default '',
    status         text not null default 'pending',   -- pending | approved | rejected
    reviewed_by    text,
    reviewed_at    timestamptz,
    review_comment text not null default '',
    created_at     timestamptz not null default now(),
    data           jsonb not null default '{}'::jsonb,

    constraint sport_nominations_source_check
        check (source in ('tutor', 'self', 'system', 'head')),
    constraint sport_nominations_status_check
        check (status in ('pending', 'approved', 'rejected'))
);

-- Bir talaba bir jamoaga bir marta - takroriy ariza tushmasin.
create unique index if not exists sport_nominations_unique
    on public.sport_team_nominations (team_id, student_id);

create index if not exists sport_nominations_student_idx on public.sport_team_nominations (student_id, academic_year);
create index if not exists sport_nominations_status_idx  on public.sport_team_nominations (status);

-- ---------------------------------------------------------------------------
-- 3. "ZARARLI ILLATLARDAN XOLI" VA "TOZA-OZODA YURISH"
--
--    Metodikada bu ikki bandning O'LCHOVI ham, KIM ANIQLASHI ham
--    ko'rsatilmagan. 4-mezondagi mantiq qo'llanadi: talaba TO'LIQ balldan
--    boshlaydi va ball faqat QAYD ETILGAN holat uchun kamayadi.
--
--    Ya'ni bu jadval odatda BO'SH turadi - yozuvi yo'q talaba to'liq ballga
--    ega. Mas'ul 550 talabani belgilab chiqmaydi, faqat istisnoni qayd etadi.
-- ---------------------------------------------------------------------------
create table if not exists public.sport_conduct_flags (
    id             text primary key,
    student_id     text not null,
    academic_year  text not null,
    part           text not null,              -- no_habits | tidiness
    reason         text not null,              -- asos MAJBURIY
    recorded_by    text,
    recorded_at    timestamptz not null default now(),
    data           jsonb not null default '{}'::jsonb,

    constraint sport_conduct_part_check
        check (part in ('no_habits', 'tidiness'))
);

create unique index if not exists sport_conduct_unique
    on public.sport_conduct_flags (student_id, academic_year, part);

-- ---------------------------------------------------------------------------
-- RLS — platformadagi boshqa jadvallar bilan bir xil
-- ---------------------------------------------------------------------------
alter table public.sport_teams            enable row level security;
alter table public.sport_team_nominations enable row level security;
alter table public.sport_conduct_flags    enable row level security;

drop policy if exists st_all  on public.sport_teams;
drop policy if exists stn_all on public.sport_team_nominations;
drop policy if exists scf_all on public.sport_conduct_flags;

create policy st_all  on public.sport_teams            for all to authenticated using (true) with check (true);
create policy stn_all on public.sport_team_nominations for all to authenticated using (true) with check (true);
create policy scf_all on public.sport_conduct_flags    for all to authenticated using (true) with check (true);
