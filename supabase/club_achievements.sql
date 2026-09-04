-- ===========================================================================
-- KLUB YUTUQLARI (tashqi)
--
-- MUAMMO: klub sahifasidagi "Yutuqlar" bo'limi TO'QIB CHIQARILGAN ma'lumot
-- ko'rsatardi - har klub o'z id raqamidan kelib chiqib 1-3 ta soxta yutuq
-- olardi ("Bahorgi Kubok", "Respublika Chempionati"...). Bazadagi birorta
-- musobaqa, hujjat yoki natija bilan bog'lanmagan edi. Yutuq qo'shish
-- uchun na ekran, na funksiya bor edi.
--
-- YECHIM IKKI QISMLI:
--   ICHKI yutuqlar - platformadagi RASMIY HUJJATDAN avtomatik chiqadi
--                    (documents jadvali). Ular saqlanmaydi: manba bitta
--                    bo'lishi kerak, aks holda reestrda bitta, klub
--                    sahifasida boshqa haqiqat paydo bo'lardi.
--   TASHQI yutuqlar - shu jadvalda. Universitetdan tashqarida qozonilgan
--                    va platforma uni bilishning iloji yo'q, shuning uchun
--                    odam kiritadi, DALIL biriktiradi, admin tasdiqlaydi.
--
-- Ma'lumot shakli `data` ichida:
--   { clubId, scope:'club'|'team'|'member', teamId, studentIds:[],
--     title, organizer, level, place, date,
--     evidenceFileName, evidencePath,
--     status:'pending'|'approved'|'returned'|'rejected',
--     submittedBy, submittedAt, reviewedBy, reviewedAt, comment }
--
-- Supabase SQL Editor da bir marta ishga tushiriladi.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. JADVAL
--
--    Qat'iy ustunlar faqat FILTRLANADIGANLAR uchun: klub, holat va yaratilish
--    vaqti. Qolgani `data` ichida - platformadagi boshqa jadvallar bilan bir
--    xil qolip, va yangi maydon qo'shilganda migratsiya kerak bo'lmaydi.
-- ---------------------------------------------------------------------------
create table if not exists public.club_achievements (
    id          text primary key,
    club_id     text not null,
    status      text not null default 'pending',
    data        jsonb not null default '{}'::jsonb,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists club_achievements_club_idx
    on public.club_achievements (club_id);
create index if not exists club_achievements_status_idx
    on public.club_achievements (status);

-- ---------------------------------------------------------------------------
-- 2. RUXSATLAR
--
--    O'qish: tizimga kirgan har kim. Yutuq klubning ochiq ma'lumoti - u
--    klub sahifasida ko'rinadi. (Tasdiqlanmaganini yashirish KODDA hal
--    qilinadi, siyosatda emas: koordinator o'z klubining kutilayotgan
--    yozuvini ko'rishi kerak.)
--
--    Yozish: tizimga kirgan har kim yubora oladi, chunki yuboruvchi klub
--    koordinatori va uning roli platformada boshqacha tekshiriladi. Yozuv
--    baribir TASDIQLANMAGUNCHA hech qayerda ko'rinmaydi - haqiqiy nazorat
--    shu yerda, insert huquqida emas.
-- ---------------------------------------------------------------------------
alter table public.club_achievements enable row level security;

drop policy if exists club_achievements_select on public.club_achievements;
drop policy if exists club_achievements_insert on public.club_achievements;
drop policy if exists club_achievements_update on public.club_achievements;
drop policy if exists club_achievements_delete on public.club_achievements;

create policy club_achievements_select on public.club_achievements
    for select to authenticated
    using (true);

create policy club_achievements_insert on public.club_achievements
    for insert to authenticated
    with check (true);

-- Tasdiqlash va tahrirlash - administrator, va yozuvni KIRITGAN odam.
--
-- `is_platform_admin()`   -> supabase/club_membership_policy.sql
-- `current_username()`    -> supabase/storage_privacy_student_documents.sql
-- Ular ishga tushirilmagan bo'lsa, avval o'shalarni ishga tushiring.
--
-- DIQQAT: taqqoslash USERNAME bo'yicha. `submittedBy` maydoniga
-- ClubAchievementForm.jsx aynan `user.username` ni yozadi - bu yerda
-- avval `auth.uid()` bilan solishtirilgan edi va u HECH QACHON to'g'ri
-- bo'lmasdi, ya'ni koordinator o'z yozuvini o'chira olmasdi.
create policy club_achievements_update on public.club_achievements
    for update to authenticated
    using       (public.is_platform_admin() or data->>'submittedBy' = public.current_username())
    with check  (public.is_platform_admin() or data->>'submittedBy' = public.current_username());

create policy club_achievements_delete on public.club_achievements
    for delete to authenticated
    using (public.is_platform_admin() or data->>'submittedBy' = public.current_username());

-- ---------------------------------------------------------------------------
-- 3. DALIL FAYLLARI UCHUN OMBOR
--
--    YOPIQ ombor: diplom nusxasi ochiq havolada turmasligi kerak. Fayl
--    faqat vaqtinchalik imzolangan havola orqali ochiladi - madaniy
--    tashriflar fotosuratlari bilan bir xil qolip.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('club-achievements', 'club-achievements', false)
on conflict (id) do nothing;

drop policy if exists club_achievement_files_read   on storage.objects;
drop policy if exists club_achievement_files_write  on storage.objects;

create policy club_achievement_files_read on storage.objects
    for select to authenticated
    using (bucket_id = 'club-achievements');

create policy club_achievement_files_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'club-achievements');

-- ---------------------------------------------------------------------------
-- 4. TEKSHIRUV
-- ---------------------------------------------------------------------------
select count(*) as yozuvlar from public.club_achievements;
