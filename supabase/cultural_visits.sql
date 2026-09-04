-- ===========================================================================
-- MADANIY TASHRIFLAR (9-mezon)
-- Teatr va muzey, xiyobon, kino, tarixiy qadamjolarga tashriflar
--
-- Metodika dalil sifatida GEOLOKATSIYA va HUDUDDA TUSHILGAN FOTOSURATNI talab
-- qiladi. Shuning uchun bu yerda talaba hisobot yozmaydi: joyga borganda
-- fotosurat oladi, joylashuvi qayd etiladi, ma'lumotnoma shu qaydlardan
-- o'zi shakllanadi.
--
-- Ball tashriflar SONIGA emas, MUNTAZAMLIGIGA qarab beriladi - shuning uchun
-- eng muhim maydon `visited_at` (sana).
--
-- Supabase SQL Editor da bir marta ishga tushiriladi. Qayta ishga tushirish
-- xavfsiz.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. JOYLAR KATALOGI
--
--    Koordinata ixtiyoriy: joy kiritilganda hali aniq nuqta bilinmasligi
--    mumkin. Koordinata bo'lsa tizim tashrif masofasini hisoblaydi va uzoq
--    qayd etilgan tashrifni BELGILAYDI (rad etmaydi - GPS xatosi shaharda
--    100 metrga yetadi).
-- ---------------------------------------------------------------------------
create table if not exists public.cultural_places (
    id          text primary key,
    name        text not null,
    type        text not null,               -- theatre | museum | park | cinema | heritage
    address     text not null default '',
    latitude    numeric,
    longitude   numeric,
    is_active   boolean not null default true,
    created_by  text,
    created_at  timestamptz not null default now(),
    data        jsonb not null default '{}'::jsonb
);

create index if not exists cultural_places_type_idx on public.cultural_places (type);

-- ---------------------------------------------------------------------------
-- 2. TASHRIFLAR
--
--    `visited_at` - sana. Muntazamlik shundan hisoblanadi.
--    `latitude/longitude` - qayd etilgan paytdagi joylashuv.
--    `photo_path` - Supabase Storage dagi fayl yo'li (pastdagi 3-bo'lim).
--
--    Holat: pending -> confirmed | rejected. Faqat CONFIRMED tashrif ballga
--    kiradi: fotosuratni odam ko'rmaguncha dalil hisoblanmaydi.
-- ---------------------------------------------------------------------------
create table if not exists public.cultural_visits (
    id             text primary key,
    student_id     text not null,
    academic_year  text not null,
    place_id       text references public.cultural_places (id) on delete set null,
    place_name     text not null,            -- katalogdan tashqari joy uchun
    place_type     text not null,
    visited_at     timestamptz not null,
    latitude       numeric,
    longitude      numeric,
    accuracy_m     numeric,                  -- GPS aniqligi (brauzer bergan)
    distance_m     numeric,                  -- katalogdagi joydan masofa
    photo_path     text,                     -- storage: cultural-visits/...
    note           text not null default '',
    status         text not null default 'pending',   -- pending | confirmed | rejected
    reviewed_by    text,
    reviewed_at    timestamptz,
    review_comment text not null default '',
    created_at     timestamptz not null default now(),
    data           jsonb not null default '{}'::jsonb,

    constraint cultural_visits_status_check
        check (status in ('pending', 'confirmed', 'rejected'))
);

create index if not exists cultural_visits_student_idx on public.cultural_visits (student_id, academic_year);
create index if not exists cultural_visits_status_idx  on public.cultural_visits (status);
create index if not exists cultural_visits_date_idx    on public.cultural_visits (visited_at desc);

-- ---------------------------------------------------------------------------
-- 3. FOTOSURAT OMBORI (Supabase Storage)
--
--    Bucket YOPIQ (public = false): talabaning fotosurati ochiq internetda
--    turmasligi kerak. Fayl faqat tizimga kirgan foydalanuvchiga ko'rinadi.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('cultural-visits', 'cultural-visits', false)
on conflict (id) do nothing;

drop policy if exists cv_read   on storage.objects;
drop policy if exists cv_insert on storage.objects;

create policy cv_read on storage.objects
    for select to authenticated
    using (bucket_id = 'cultural-visits');

create policy cv_insert on storage.objects
    for insert to authenticated
    with check (bucket_id = 'cultural-visits');

-- ---------------------------------------------------------------------------
-- RLS — platformadagi boshqa jadvallar bilan bir xil
-- ---------------------------------------------------------------------------
alter table public.cultural_places enable row level security;
alter table public.cultural_visits enable row level security;

drop policy if exists cp_all on public.cultural_places;
drop policy if exists cvi_all on public.cultural_visits;

create policy cp_all  on public.cultural_places for all to authenticated using (true) with check (true);
create policy cvi_all on public.cultural_visits for all to authenticated using (true) with check (true);
