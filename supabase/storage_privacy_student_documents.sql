-- ===========================================================================
-- TALABA HUJJATLARI OMBORI - HAQIQIY CHEKLOV
--
-- MUAMMO: `student_documents.sql` omborni yopiq qilib yaratdi, lekin
-- qoidasi shunchaki `bucket_id = 'student-documents'` edi. Ya'ni tizimga
-- kirgan HAR QANDAY foydalanuvchi boshqa talabaning passport nusxasini
-- yuklab ola olardi. Interfeys uni yashirardi, ombor esa yo'q.
--
-- QAROR: fayl yo'li `{username}/{id}.{ext}` ko'rinishida, demak birinchi
-- papka nomi egasining kim ekanini aytadi. Shuni tekshiramiz.
--
-- KIM KO'RADI:
--   - hujjat EGASI (o'z papkasi)
--   - administrator
--   - stipendiya baholovchisi - arizadagi hujjatni ochib ko'rishi kerak
--
-- KIM YOZADI VA O'CHIRADI: faqat egasi va administrator. Baholovchi
-- ko'radi, lekin tegmaydi - u ko'rib chiquvchi, muallif emas.
--
-- XAVFSIZ STANDART: `current_username()` null qaytarsa (profil topilmasa)
-- taqqoslash false beradi va ruxsat berilmaydi. Ya'ni noaniqlik holatida
-- eshik YOPIQ bo'ladi, ochiq emas.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. YORDAMCHI FUNKSIYALAR
--
-- `is_platform_admin()` allaqachon bor (club_membership_policy.sql).
-- Bu yerda ikkitasi qo'shiladi.
--
-- DIQQAT: `profiles.id` MATN, `auth.uid()` esa uuid - shuning uchun har
-- ikki tomon matnga o'giriladi (loyihadagi mavjud qoidalar bilan bir xil).
-- ---------------------------------------------------------------------------

-- Joriy foydalanuvchining username'i. Butun platforma odamni AYNAN shu
-- bilan taniydi (fayl yo'llari, `studentId` maydonlari) - auth uuid bilan
-- emas, shuning uchun bu ko'prik kerak.
create or replace function public.current_username()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select username from public.profiles where id::text = auth.uid()::text
$$;

-- Stipendiya baholovchisi. Ro'yxat `scholarship_settings.data` ichida
-- ikkita massivda turadi (fakultet va markaziy) - ikkalasi birlashtiriladi.
create or replace function public.is_scholarship_evaluator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.scholarship_settings s
        cross join lateral jsonb_array_elements(
            coalesce(s.data->'facultyEvaluators', '[]'::jsonb)
            || coalesce(s.data->'centralEvaluators', '[]'::jsonb)
        ) as e
        where s.id = 'default'
          and e->>'username' = public.current_username()
    )
$$;

-- ---------------------------------------------------------------------------
-- 2. OMBOR QOIDALARI
--
-- Eski (ochiq) qoidalar aynan shu nomlar bilan yaratilgan edi - ular
-- almashtiriladi. `storage.objects` dagi boshqa omborlarning qoidalariga
-- tegilmaydi: ular alohida nomlar bilan yashaydi.
-- ---------------------------------------------------------------------------
drop policy if exists student_documents_files_read   on storage.objects;
drop policy if exists student_documents_files_write  on storage.objects;
drop policy if exists student_documents_files_delete on storage.objects;

create policy student_documents_files_read on storage.objects
    for select to authenticated
    using (
        bucket_id = 'student-documents'
        and (
            (storage.foldername(name))[1] = public.current_username()
            or public.is_platform_admin()
            or public.is_scholarship_evaluator()
        )
    );

-- Yozish: faqat O'Z papkasiga. Bu boshqa talabaning papkasiga fayl
-- "joylab qo'yish" imkonini yopadi.
create policy student_documents_files_write on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'student-documents'
        and (
            (storage.foldername(name))[1] = public.current_username()
            or public.is_platform_admin()
        )
    );

create policy student_documents_files_delete on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'student-documents'
        and (
            (storage.foldername(name))[1] = public.current_username()
            or public.is_platform_admin()
        )
    );

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
--
-- 1. O'z nomingizni ko'ring:
--      select public.current_username();
--    null qaytsa - profil topilmadi, hech qanday fayl ochilmaydi.
--
-- 2. Talaba sifatida kirib "Yutuqlarim" da hujjat yuklang va oching -
--    ishlashi kerak.
--
-- 3. Boshqa talaba sifatida kirib o'sha faylni ochib ko'ring - endi
--    ochilmasligi kerak.
--
-- 4. Admin sifatida kirib ochib ko'ring - ochilishi kerak.
-- ---------------------------------------------------------------------------
