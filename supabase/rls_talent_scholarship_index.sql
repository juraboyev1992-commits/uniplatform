-- =====================================================================
-- IQTIDOR, STIPENDIYA VA INDEKS DALILLARI — egasi va mas'uli bilan cheklash
--
-- `rls_student_private_data.sql` ning davomi, AYNI naqsh bilan. O'sha
-- fayl pasport/akademik/intizomni yopdi; bu fayl qolgan shaxsiy
-- jadvallarni yopadi.
--
-- ENG MUHIM QISMI - BALL VA STATUSNI HIMOYALASH:
--
-- Bu jadvallarda talabaning O'ZI yozadigan qatorlar bor (dalil kiritish,
-- ariza berish, apellyatsiya). Ya'ni "o'z qatoringni o'zgartir" deb
-- qo'yib bo'lmaydi - aks holda talaba brauzer konsolidan o'z dalilini
-- "tasdiqlangan" deb belgilab, indeks ballini o'zi ko'tarib olardi,
-- yoki stipendiya arizasini "tasdiqlangan" holatiga o'tkazardi.
--
-- Shuning uchun qoidalar ikki tomonlama:
--   `using`      - QAYSI qatorga tegish mumkin (eski holat)
--   `with check` - qator QANDAY holatda qolishi mumkin (yangi holat)
--
-- Masalan talaba tuzatishga qaytarilgan arizani qayta yubora oladi
-- ('returned' -> 'doc_check') va qaytarib ola oladi ('withdrawn'), lekin
-- 'approved' ga o'tkaza OLMAYDI. Bu ilovadagi haqiqiy oqimning aynan
-- o'zi (db.js: resubmitScholarshipApplication, withdrawScholarshipApplication).
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> hammasini nusxalab Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================

do $guard$
begin
    if to_regprocedure('public.current_username()') is null
       or to_regprocedure('public.is_platform_admin()') is null
       or to_regprocedure('public.is_scholarship_evaluator()') is null
       or to_regprocedure('public.is_assigned_person_of(text)') is null then
        raise exception 'Kerakli funksiya topilmadi - avval supabase/rls_student_private_data.sql ni ishga tushiring';
    end if;
end
$guard$;


-- ---------------------------------------------------------------------
-- 1. ESKI QOIDALARNI TOZALASH
--
-- Qoidalar YOKI bilan birlashadi: bitta `using (true)` qolsa, quyidagi
-- tor qoidalar hech narsani cheklamaydi.
-- ---------------------------------------------------------------------
do $clean$
declare r record;
begin
    for r in
        select policyname, tablename from pg_policies
        where schemaname = 'public'
          and tablename in (
              'talent_profiles', 'talent_goals', 'talent_idps', 'talent_monitoring',
              'talent_targets', 'talent_assignments', 'talent_audit_logs',
              'social_index_assessments', 'social_index_evidence',
              'social_index_requests', 'social_index_appeals',
              'scholarship_applications', 'scholarship_evaluations'
          )
    loop
        execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
    end loop;
end
$clean$;


-- ---------------------------------------------------------------------
-- 2. IQTIDOR YOZUVLARI
--
-- O'qish: talabaning o'zi (MyDevelopmentPage o'z ma'lumotini ko'rsatadi)
-- + biriktirilgan mentor/tyutor + administrator.
--
-- Yozish: biriktirilgan mas'ul va administrator. Talaba bu yerda ATAYLAB
-- yo'q - maqsad, monitoring va individual reja uni BAHOLAYDI, ya'ni
-- baholanuvchi o'zi yoza olmasligi kerak. (Tekshirildi: talaba ekrani
-- bu jadvallarga hech narsa yozmaydi.)
-- ---------------------------------------------------------------------
do $talent$
declare t text;
begin
    foreach t in array array[
        'talent_profiles', 'talent_goals', 'talent_idps',
        'talent_monitoring', 'talent_targets'
    ] loop
        execute format($f$
            create policy %I_select on public.%I
                for select to authenticated using (
                    student_id = public.current_username()
                    or public.is_assigned_person_of(student_id)
                    or public.is_platform_admin()
                )
        $f$, t, t);
        execute format($f$
            create policy %I_write on public.%I
                for all to authenticated
                using (public.is_assigned_person_of(student_id) or public.is_platform_admin())
                with check (public.is_assigned_person_of(student_id) or public.is_platform_admin())
        $f$, t, t);
    end loop;
end
$talent$;


-- ---------------------------------------------------------------------
-- 3. BIRIKTIRUVLAR JADVALI — alohida holat
--
-- Bu jadvalning O'ZI `is_assigned_person_of()` ning manbai. Uni faqat
-- talabaga cheklash mumkin emas: TYUTOR o'z ro'yxatini shu jadvaldan
-- oladi (TutorWorkspacePage -> db.getMyMentees). Shuning uchun mas'ul
-- o'z biriktiruv qatorini `person_id` bo'yicha ko'radi.
--
-- Funksiyaning o'zi `security definer`, ya'ni u bu qoidaga bo'ysunmaydi
-- va har doim to'g'ri javob beradi.
-- ---------------------------------------------------------------------
create policy tasg_select on public.talent_assignments
    for select to authenticated using (
        student_id = public.current_username()
        or person_id = public.current_username()
        or public.is_platform_admin()
    );
create policy tasg_write on public.talent_assignments
    for all to authenticated
    using (public.is_platform_admin()) with check (public.is_platform_admin());


-- ---------------------------------------------------------------------
-- 4. IQTIDOR TARIXI
--
-- Yozish hammaga ochiq (har amal qator qo'shadi), lekin o'zgartirish va
-- o'chirish umuman berilmaydi - tarix o'zgartirilsa ma'nosini yo'qotadi.
-- ---------------------------------------------------------------------
create policy tlog_select on public.talent_audit_logs
    for select to authenticated using (
        student_id = public.current_username()
        or public.is_assigned_person_of(student_id)
        or public.is_platform_admin()
    );
create policy tlog_insert on public.talent_audit_logs
    for insert to authenticated with check (true);


-- ---------------------------------------------------------------------
-- 5. INDEKS BAHOSI — talaba umuman yoza olmaydi
--
-- `points` ustuni rasmiy ballning o'zi. Yozish faqat administratorga.
-- ---------------------------------------------------------------------
create policy sias_select on public.social_index_assessments
    for select to authenticated using (
        student_id = public.current_username()
        or public.is_assigned_person_of(student_id)
        or public.is_platform_admin()
    );
create policy sias_write on public.social_index_assessments
    for all to authenticated
    using (public.is_platform_admin()) with check (public.is_platform_admin());


-- ---------------------------------------------------------------------
-- 6. INDEKS DALILLARI
--
-- Talaba dalil KIRITADI, lekin faqat 'pending' holatida - ya'ni o'zi
-- tasdiqlab qo'ya olmaydi. Tasdiqlash (`reviewIndexEvidence`) admin
-- panelidan bo'ladi, shuning uchun UPDATE faqat administratorga.
--
-- O'chirish: hali ko'rib chiqilmagan o'z dalilini olib tashlash mumkin.
-- ---------------------------------------------------------------------
create policy sie_select on public.social_index_evidence
    for select to authenticated using (
        student_id = public.current_username()
        or public.is_assigned_person_of(student_id)
        or public.is_platform_admin()
    );
create policy sie_insert on public.social_index_evidence
    for insert to authenticated with check (
        (student_id = public.current_username() and status = 'pending')
        or public.is_platform_admin()
    );
create policy sie_update on public.social_index_evidence
    for update to authenticated
    using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy sie_delete on public.social_index_evidence
    for delete to authenticated using (
        (student_id = public.current_username() and status = 'pending')
        or public.is_platform_admin()
    );


-- ---------------------------------------------------------------------
-- 7. INDEKS SO'ROVLARI VA APELLYATSIYALARI
-- ---------------------------------------------------------------------
create policy sireq_select on public.social_index_requests
    for select to authenticated using (
        student_id = public.current_username()
        or public.is_assigned_person_of(student_id)
        or public.is_platform_admin()
    );
create policy sireq_insert on public.social_index_requests
    for insert to authenticated with check (
        student_id = public.current_username() or public.is_platform_admin()
    );
create policy sireq_delete on public.social_index_requests
    for delete to authenticated using (
        student_id = public.current_username() or public.is_platform_admin()
    );

create policy sap_select on public.social_index_appeals
    for select to authenticated using (
        student_id = public.current_username()
        or public.is_assigned_person_of(student_id)
        or public.is_platform_admin()
    );
create policy sap_insert on public.social_index_appeals
    for insert to authenticated with check (
        (student_id = public.current_username() and status = 'pending')
        or public.is_platform_admin()
    );
-- Qarorni faqat administrator chiqaradi.
create policy sap_update on public.social_index_appeals
    for update to authenticated
    using (public.is_platform_admin()) with check (public.is_platform_admin());


-- ---------------------------------------------------------------------
-- 8. STIPENDIYA ARIZALARI
--
-- Talaba qaysi holatga o'tkaza olishi `with check` bilan cheklangan:
--   'doc_check'  - tuzatishga qaytarilgan arizani qayta yuborish
--   'withdrawn'  - arizani qaytarib olish
-- Boshqa hech qanday holatga (ayniqsa 'approved') o'ta olmaydi.
--
-- Baholovchi ham ko'radi va yozadi: komissiya ishi shunga tayanadi.
-- ---------------------------------------------------------------------
create policy schapp_select on public.scholarship_applications
    for select to authenticated using (
        student_id = public.current_username()
        or public.is_assigned_person_of(student_id)
        or public.is_scholarship_evaluator()
        or public.is_platform_admin()
    );
create policy schapp_insert on public.scholarship_applications
    for insert to authenticated with check (
        (student_id = public.current_username() and status in ('draft', 'submitted'))
        or public.is_platform_admin()
    );
create policy schapp_update on public.scholarship_applications
    for update to authenticated
    using (
        student_id = public.current_username()
        or public.is_scholarship_evaluator()
        or public.is_platform_admin()
    )
    with check (
        public.is_scholarship_evaluator()
        or public.is_platform_admin()
        or (student_id = public.current_username()
            and status in ('draft', 'submitted', 'doc_check', 'withdrawn'))
    );
create policy schapp_delete on public.scholarship_applications
    for delete to authenticated using (public.is_platform_admin());


-- ---------------------------------------------------------------------
-- 9. KOMISSIYA BAHOLARI
--
-- Talabaga KO'RSATILMAYDI - tekshirildi, talaba ekranlari bu jadvalni
-- umuman o'qimaydi. Baholovchi va administrator ishlaydi.
-- ---------------------------------------------------------------------
create policy scheval_select on public.scholarship_evaluations
    for select to authenticated using (
        public.is_scholarship_evaluator() or public.is_platform_admin()
    );
create policy scheval_write on public.scholarship_evaluations
    for all to authenticated
    using (public.is_scholarship_evaluator() or public.is_platform_admin())
    with check (public.is_scholarship_evaluator() or public.is_platform_admin());


notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 10. TEKSHIRUV — `ochiq_qoida` hamma qatorda 0 bo'lishi kerak
-- (INSERT qoidalari hisobga olinmaydi: tarix jadvaliga yozish ataylab
-- ochiq).
-- ---------------------------------------------------------------------
select
    tablename                                                 as jadval,
    count(*)                                                  as qoidalar,
    count(*) filter (where qual = 'true' and cmd <> 'INSERT')  as ochiq_qoida
from pg_policies
where schemaname = 'public'
  and tablename in (
      'talent_profiles', 'talent_goals', 'talent_idps', 'talent_monitoring',
      'talent_targets', 'talent_assignments', 'talent_audit_logs',
      'social_index_assessments', 'social_index_evidence',
      'social_index_requests', 'social_index_appeals',
      'scholarship_applications', 'scholarship_evaluations'
  )
group by tablename
order by tablename;
