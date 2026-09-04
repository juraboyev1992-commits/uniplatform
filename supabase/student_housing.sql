-- ===========================================================================
-- TALABANING TURAR JOYI VA YOTOQXONALAR
--
-- Nima uchun kerak: 10-mezonning "toza-ozoda yurish, saranjom-sarishtalik"
-- bandini KIM baholashi talabaning qayerda yashashiga bog'liq:
--
--   TTJ (yotoqxona)da yashasa  -> yotoqxona mudiri
--   ijarada / uyida yashasa    -> tyutor
--
-- "Zararli illatlardan xoli" bandi esa har doim tyutorda qoladi.
--
-- MUHIM ESLATMA: talabaning yashash joyi haqidagi ma'lumot KELAJAKDA tizimning
-- o'zida (talaba ma'lumotlari qatlamida yoki HEMIS integratsiyasida) bo'ladi va
-- shu jadvalga avtomatik tushadi. Hozircha u qo'lda kiritiladi va bu vaqtinchalik
-- holat - `source` ustuni aynan shuni ajratib turadi.
--
-- YANGI ROL OCHILMADI: yotoqxona mudiri sifatida MAVJUD akkaunt biriktiriladi.
-- Vakolat rolga emas, biriktiruvga bog'liq - platformadagi mentor/tyutor
-- biriktiruvi bilan bir xil tamoyil.
--
-- Supabase SQL Editor da bir marta ishga tushiriladi. Qayta ishga tushirish
-- xavfsiz.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. YOTOQXONALAR
--
--    `responsible_user_id` - mudir sifatida biriktirilgan akkaunt (username).
--    Bo'sh bo'lishi mumkin: yotoqxona kiritilgan, lekin mudir hali
--    biriktirilmagan holat normal.
-- ---------------------------------------------------------------------------
create table if not exists public.dormitories (
    id                  text primary key,
    name                text not null,
    address             text not null default '',
    responsible_user_id text,
    is_active           boolean not null default true,
    created_by          text,
    created_at          timestamptz not null default now(),
    data                jsonb not null default '{}'::jsonb
);

create index if not exists dormitories_responsible_idx on public.dormitories (responsible_user_id);

-- ---------------------------------------------------------------------------
-- 2. TALABANING TURAR JOYI
--
--    O'QUV YILI kesimida: talaba kursdan kursga o'tганда turar joyi
--    o'zgarishi mumkin va o'tgan yilgi ma'lumot bu yilgi baholovchini
--    belgilamasligi kerak.
--
--    `source`:
--      manual - qo'lda kiritilgan (hozirgi holat)
--      system - talaba ma'lumotlari qatlamidan avtomatik keldi (kelajak)
--      import - Excel/CSV dan yuklandi
-- ---------------------------------------------------------------------------
create table if not exists public.student_housing (
    id             text primary key,
    student_id     text not null,
    academic_year  text not null,
    housing_type   text not null,              -- dormitory | rent | family
    dormitory_id   text references public.dormitories (id) on delete set null,
    room           text not null default '',
    source         text not null default 'manual',
    updated_by     text,
    updated_at     timestamptz not null default now(),
    data           jsonb not null default '{}'::jsonb,

    constraint student_housing_type_check
        check (housing_type in ('dormitory', 'rent', 'family')),
    -- Yotoqxonada yashaydi deyilsa, QAYSI yotoqxona ekani ko'rsatilishi shart:
    -- aks holda baholovchini aniqlab bo'lmaydi.
    constraint student_housing_dorm_required
        check (housing_type <> 'dormitory' or dormitory_id is not null)
);

create unique index if not exists student_housing_unique
    on public.student_housing (student_id, academic_year);

create index if not exists student_housing_dorm_idx on public.student_housing (dormitory_id);

-- ---------------------------------------------------------------------------
-- RLS — platformadagi boshqa jadvallar bilan bir xil
-- ---------------------------------------------------------------------------
alter table public.dormitories      enable row level security;
alter table public.student_housing  enable row level security;

drop policy if exists dorm_all on public.dormitories;
drop policy if exists sh_all   on public.student_housing;

create policy dorm_all on public.dormitories     for all to authenticated using (true) with check (true);
create policy sh_all   on public.student_housing for all to authenticated using (true) with check (true);
