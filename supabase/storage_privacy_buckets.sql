-- =====================================================================
-- FAYL OMBORLARI: KIM O'QIYDI, KIM YOZADI
--
-- Jadvallar yopilgach navbat fayllarga keldi. Jonli bazada (2026-09-16)
-- topilgan uchta muammo:
--
-- 1. `cultural-visits` - TOR QOIDALAR YOZILGAN, LEKIN ISHLAMAYDI.
--    Ularning yonida `cv_read` va `cv_insert` turibdi va ular faqat
--    `bucket_id` ni tekshiradi. Qoidalar YOKI bilan qo'shilgani uchun
--    har qanday kirgan foydalanuvchi ISTALGAN talabaning tashrif
--    fotosuratini ocha oladi. (test_attempts dagi holatning aynan o'zi.)
--
-- 2. `club-documents` va `event-documents` - faqat baket nomi
--    tekshiriladi: klub nizomi va tadbir dasturini har kim yuklay,
--    o'chira va o'qiy oladi.
--
-- 3. `club-media` - ommaviy o'qish TO'G'RI (klub logotipi sahifada
--    ko'rinadi va `getPublicUrl` bilan olinadi), lekin YOZISH ham har
--    kimga ochiq: istalgan talaba klub logotipini almashtira yoki
--    o'chira oladi.
--
-- FAYL YO'LLARI (db.js dan o'qildi, taxmin emas):
--   club-achievements : <clubId>/<id>.<ext>
--   club-documents    : <clubId>/<id>.<ext>
--   club-media        : <clubId>/<kind>.<ext>
--   event-documents   : <eventId>/dastur.<ext>
--   cultural-visits   : <yil>/<login>/<id>.<ext>
--
-- O'QISH QAYERDA OCHIQ QOLADI: klub hujjatlari va tadbir dasturi - ular
-- klub sahifasida ko'rsatiladi va maxfiy emas. Maxfiy bo'lgani - talaba
-- fotosurati, hujjati va yutuq dalili; ular allaqachon tor qoidalarga ega
-- yoki shu faylda toraytiriladi.
--
-- TALAB: `current_username()`, `is_staff()`, `is_platform_admin()`,
-- `is_club_officer()`, `can_manage_activity()` mavjud bo'lishi kerak -
-- ular rls_documents_attendance.sql da yaratilgan.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni nusxalab Run.
-- Keyin: supabase/storage_privacy_buckets_test.sql ni ALOHIDA Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================

-- Kerakli funksiyalar bormi? Bo'lmasa - hech narsa o'zgartirmasdan to'xtaymiz,
-- aks holda qoida yaratilmay, ombor ochiq qolib ketardi.
do $guard$
begin
    if to_regprocedure('public.is_club_officer(text)') is null
       or to_regprocedure('public.can_manage_activity(text, text)') is null
       or to_regprocedure('public.current_username()') is null
       or to_regprocedure('public.is_assigned_person_of(text)') is null
       or to_regprocedure('public.is_staff()') is null then
        raise exception 'Avval supabase/rls_documents_attendance.sql ni ishga tushiring - yordamchi funksiyalar yo''q.';
    end if;
end
$guard$;

-- ---------------------------------------------------------------------
-- 1. ESKI QOIDALARNI OLIB TASHLASH (faqat shu beshta ombor uchun)
-- ---------------------------------------------------------------------
do $clean$
declare r record;
begin
    for r in
        select policyname from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and (coalesce(qual, '') || coalesce(with_check, '')) ~
              '(club-achievements|club-documents|club-media|event-documents|cultural-visits)'
    loop
        execute format('drop policy %I on storage.objects', r.policyname);
    end loop;
end
$clean$;

-- ---------------------------------------------------------------------
-- 2. MADANIY TASHRIF FOTOSURATI - faqat o'zi, biriktirilgan tyutor va admin
--    Yo'l: <yil>/<login>/<id>.<ext>  ->  foldername[2] = login
-- ---------------------------------------------------------------------
create policy cultural_visit_read on storage.objects
    for select to authenticated
    using (bucket_id = 'cultural-visits'
           and ((storage.foldername(name))[2] = public.current_username()
                or public.is_staff()
                or public.is_assigned_person_of((storage.foldername(name))[2])));

create policy cultural_visit_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'cultural-visits'
                and ((storage.foldername(name))[2] = public.current_username()
                     or public.is_staff()));

create policy cultural_visit_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'cultural-visits'
           and ((storage.foldername(name))[2] = public.current_username()
                or public.is_platform_admin()));

-- ---------------------------------------------------------------------
-- 3. KLUB YUTUG'I DALILI - ko'rish: admin, xodim yoki shu klub
--    koordinatori; yozish: xodim yoki koordinator.
--    Yo'l: <clubId>/<id>.<ext>  ->  foldername[1] = clubId
-- ---------------------------------------------------------------------
create policy club_achievement_read on storage.objects
    for select to authenticated
    using (bucket_id = 'club-achievements'
           and (public.is_staff() or public.is_club_officer((storage.foldername(name))[1])));

create policy club_achievement_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'club-achievements'
                and (public.is_staff() or public.is_club_officer((storage.foldername(name))[1])));

create policy club_achievement_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'club-achievements'
           and (public.is_staff() or public.is_club_officer((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------
-- 4. KLUB HUJJATLARI (nizom va boshqalar)
--    O'qish ochiq qoladi - hujjat klub sahifasida ko'rsatiladi.
--    Yozish va o'chirish: xodim yoki SHU klub koordinatori.
-- ---------------------------------------------------------------------
create policy club_documents_read on storage.objects
    for select to authenticated
    using (bucket_id = 'club-documents');

create policy club_documents_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'club-documents'
                and (public.is_staff() or public.is_club_officer((storage.foldername(name))[1])));

create policy club_documents_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'club-documents'
           and (public.is_staff() or public.is_club_officer((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------
-- 5. KLUB MEDIASI (logotip, muqova)
--    O'qish OMMAVIY qoladi: rasm sahifada `getPublicUrl` bilan
--    ko'rsatiladi va login talab qilinmaydi. Yozishni esa yopamiz.
-- ---------------------------------------------------------------------
create policy club_media_read on storage.objects
    for select to public
    using (bucket_id = 'club-media');

create policy club_media_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'club-media'
                and (public.is_staff() or public.is_club_officer((storage.foldername(name))[1])));

create policy club_media_update on storage.objects
    for update to authenticated
    using      (bucket_id = 'club-media'
                and (public.is_staff() or public.is_club_officer((storage.foldername(name))[1])))
    with check (bucket_id = 'club-media'
                and (public.is_staff() or public.is_club_officer((storage.foldername(name))[1])));

create policy club_media_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'club-media'
           and (public.is_staff() or public.is_club_officer((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------
-- 6. TADBIR HUJJATLARI (dastur)
--    O'qish ochiq qoladi - dastur ishtirokchilar uchun.
--    Yozish: tadbirni boshqarishga haqli odam (xodim, klub koordinatori).
--    Yo'l: <eventId>/dastur.<ext>  ->  foldername[1] = eventId
-- ---------------------------------------------------------------------
create policy event_documents_read on storage.objects
    for select to authenticated
    using (bucket_id = 'event-documents');

create policy event_documents_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'event-documents'
                and public.can_manage_activity('event', (storage.foldername(name))[1]));

create policy event_documents_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'event-documents'
           and public.can_manage_activity('event', (storage.foldername(name))[1]));

-- ---------------------------------------------------------------------
-- TEKSHIRUV - holat. To'g'ri natija: har bir ombor uchun 3-4 qoida va
-- HECH BIRIDA "faqat bucket_id" ko'rinishidagi yozish qoidasi qolmasin
-- (club_documents_read / event_documents_read / club_media_read -
-- ataylab shunday, ular O'QISH qoidasi).
-- ---------------------------------------------------------------------
select
    policyname, cmd, array_to_string(roles, '+') as roles,
    case
        when cmd = 'SELECT' then 'oqish'
        when (coalesce(qual, '') || coalesce(with_check, ''))
             ~ '(is_staff|is_platform_admin|is_club_officer|can_manage_activity|current_username|is_assigned_person_of)'
            then 'cheklangan'
        else 'OCHIQ <-- TEKSHIRING'
    end as holat
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
