-- ===========================================================================
-- QOLGAN IKKITA YOPIQ OMBOR + BITTA ISHLAMAYOTGAN QOIDANI TUZATISH
--
-- TALAB: avval `storage_privacy_student_documents.sql` ishga tushirilgan
-- bo'lishi kerak - `current_username()` o'sha yerda yaratilgan.
--
-- 1. `club_achievements` jadvalidagi XATO. Qoidada
--       data->>'submittedBy' = auth.uid()::text
--    deb yozilgan, lekin `submittedBy` maydoniga USERNAME yoziladi
--    (ClubAchievementForm.jsx: `submittedBy: user?.username`), auth uuid
--    emas. Ya'ni taqqoslash HECH QACHON to'g'ri bo'lmaydi va yutuqni
--    kiritgan koordinator uni o'zi tahrirlay ham, o'chira ham olmaydi -
--    faqat administrator qila oladi. Bu maqsad emas edi.
--
-- 2. `club-achievements` ombori: diplom nusxasi hozir har kimga ochiq.
--
-- 3. `cultural-visits` ombori: talabaning fotosurati har kimga ochiq.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. YANGI YORDAMCHI: biriktirilgan mas'ulmi
--
-- Tyutor, mentor va ilmiy rahbar `talent_assignments` da turadi
-- (person_id = username). Vakolat ROLGA emas, BIRIKTIRUVGA bog'liq -
-- boshqa tyutorning talabasi ko'rinmaydi. Bu koddagi qoidaning aynan
-- o'zi (db.js: resolvePassportViewer).
-- ---------------------------------------------------------------------------
create or replace function public.is_assigned_person_of(target_student text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.talent_assignments a
        where a.active
          and a.student_id = target_student
          and a.person_id = public.current_username()
    )
$$;

-- ---------------------------------------------------------------------------
-- 1. KLUB YUTUQLARI JADVALI - taqqoslashni to'g'rilash
--
-- Endi kiritgan odam o'z yozuvini tahrirlay va o'chira oladi.
-- Ko'rish ochiq qoladi: klub yutug'i klub sahifasida ko'rsatiladi va
-- bu maxfiy ma'lumot emas. Maxfiy bo'lgani - DALIL FAYLI, u pastda.
-- ---------------------------------------------------------------------------
drop policy if exists club_achievements_update on public.club_achievements;
drop policy if exists club_achievements_delete on public.club_achievements;

create policy club_achievements_update on public.club_achievements
    for update to authenticated
    using       (public.is_platform_admin() or data->>'submittedBy' = public.current_username())
    with check  (public.is_platform_admin() or data->>'submittedBy' = public.current_username());

create policy club_achievements_delete on public.club_achievements
    for delete to authenticated
    using (public.is_platform_admin() or data->>'submittedBy' = public.current_username());

-- ---------------------------------------------------------------------------
-- 2. KLUB YUTUQLARI DALILI (club-achievements)
--
-- Fayl yo'li `{clubId}/{id}.{ext}` - undan kim yuklaganini bilib
-- bo'lmaydi. Shuning uchun yozuvning o'zidan qaraladi: shu faylga
-- tegishli yutuqni kim kiritgan bo'lsa, o'sha ko'radi. Va administrator.
--
-- NEGA BUNDAY TOR: bu boshqa tashkilot bergan diplomning nusxasi. Uni
-- klubning har bir a'zosi ko'rishi shart emas - yutuqning O'ZI baribir
-- klub sahifasida ochiq turadi, faqat nusxasi yopiq.
-- ---------------------------------------------------------------------------
drop policy if exists club_achievement_files_read   on storage.objects;
drop policy if exists club_achievement_files_write  on storage.objects;
drop policy if exists club_achievement_files_delete on storage.objects;

create policy club_achievement_files_read on storage.objects
    for select to authenticated
    using (
        bucket_id = 'club-achievements'
        and (
            public.is_platform_admin()
            or exists (
                select 1 from public.club_achievements ca
                where ca.data->>'evidencePath' = storage.objects.name
                  and ca.data->>'submittedBy'  = public.current_username()
            )
        )
    );

create policy club_achievement_files_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'club-achievements');

-- O'chirish: yutuq o'chirilganda fayl ham o'chadi (db.js). Demak
-- o'chirish huquqi yutuqni o'chira oladigan odamda bo'lishi kerak.
create policy club_achievement_files_delete on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'club-achievements'
        and (
            public.is_platform_admin()
            or exists (
                select 1 from public.club_achievements ca
                where ca.data->>'evidencePath' = storage.objects.name
                  and ca.data->>'submittedBy'  = public.current_username()
            )
        )
    );

-- ---------------------------------------------------------------------------
-- 3. MADANIY TASHRIF FOTOSURATLARI (cultural-visits)
--
-- Fayl yo'li `{o'quv yili}/{username}/{id}.{ext}` - IKKINCHI papka egasi.
--
-- KIM KO'RADI: egasi, administrator va BIRIKTIRILGAN tyutor. Tashrifni
-- aynan shu uchovi ko'rib chiqadi (CulturalVisitsPanel admin sozlamalari
-- va tyutor ish maydonida turadi, tyutorda esa faqat o'z talabalari).
-- ---------------------------------------------------------------------------
drop policy if exists cultural_visit_files_read   on storage.objects;
drop policy if exists cultural_visit_files_write  on storage.objects;
drop policy if exists cultural_visit_files_delete on storage.objects;

create policy cultural_visit_files_read on storage.objects
    for select to authenticated
    using (
        bucket_id = 'cultural-visits'
        and (
            (storage.foldername(name))[2] = public.current_username()
            or public.is_platform_admin()
            or public.is_assigned_person_of((storage.foldername(name))[2])
        )
    );

create policy cultural_visit_files_write on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'cultural-visits'
        and (
            (storage.foldername(name))[2] = public.current_username()
            or public.is_platform_admin()
        )
    );

create policy cultural_visit_files_delete on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'cultural-visits'
        and (
            (storage.foldername(name))[2] = public.current_username()
            or public.is_platform_admin()
        )
    );

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
--
-- 1. Koordinator sifatida klub yutug'ini kiriting, keyin uni O'CHIRING -
--    ilgari bu ishlamasdi, endi ishlashi kerak.
-- 2. Talaba sifatida madaniy tashrif qo'shing va fotosuratini oching.
-- 3. Boshqa talaba sifatida o'sha fotosuratni ochib ko'ring - ochilmasin.
-- 4. Tyutor sifatida O'Z talabasining tashrifini oching - ochilsin;
--    biriktirilmagan talabaniki - ochilmasin.
-- ---------------------------------------------------------------------------
