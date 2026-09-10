-- =====================================================================
-- TALABANING SHAXSIY MA'LUMOTI — "kirgan hamma ko'radi" dan
-- "faqat o'zi, biriktirilgan mas'uli va administrator" ga
--
-- HOZIRGI HOLAT: `rls_lockdown.sql` anonim kirishni yopdi, lekin har
-- jadvalga "kirgan foydalanuvchi hamma narsani qila oladi" qoidasini
-- qoldirdi. Ya'ni tizimga kirgan TALABA boshqa talabaning pasportini,
-- akademik ma'lumotini va hujjatlarini o'qiy oladi.
--
-- MUHIM NOZIK JOY: PostgreSQL da bir jadvaldagi qoidalar YOKI bilan
-- birlashadi. Eski "using (true)" qoidasi joyida qolsa, yangi tor qoida
-- HECH NARSANI cheklamaydi. Shuning uchun quyida har bir jadvalning
-- BARCHA eski qoidalari avval o'chiriladi - nomini bilish shart emas,
-- `pg_policies` dan o'qib o'chiriladi.
--
-- O'QISH va YOZISH ALOHIDA. Bu ataylab:
--   Talaba o'z intizom yozuvini KO'RISHI kerak (ball nega kamayganini
--   bilsin), lekin uni O'ZGARTIRA olmasligi kerak. Ikkalasi bitta
--   qoida bilan berilsa, talaba brauzer konsolidan o'z
--   diskvalifikatsiyasini o'chirib tashlashi mumkin edi.
--
-- QAMROVI:
--   student_passport, student_enrollment_history, passport_access_logs,
--   academic_records, student_documents,
--   social_index_penalties, discipline_violations
--
-- Pasport bilan birga uning tarixi va murojaat jurnali ham kiritildi:
-- pasportni yopib, uning yonidagi tarixni ochiq qoldirish ma'nosiz.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> hammasini nusxalab Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. KERAKLI FUNKSIYALAR
--
-- `current_username()`, `is_platform_admin()`, `is_scholarship_evaluator()`
-- allaqachon bazada bor. `is_assigned_person_of()` esa hali ishga
-- tushirilmagan faylda (storage_privacy_clubs_cultural.sql) - shuning
-- uchun bu yerda qayta yaratiladi. `create or replace` xavfsiz.
--
-- Biriktiruv `talent_assignments` da turadi va tyutor ish stoli ham
-- AYNAN shu jadvaldan o'qiydi (TutorWorkspacePage -> db.getMyMentees),
-- ya'ni qoida ekrandagi ro'yxat bilan bir xil bo'ladi.
-- ---------------------------------------------------------------------
-- Biriktiruv jadvali bo'lmasa funksiya yaratilmaydi va HAR BIR qoida
-- tekshiruvi xato beradi - ya'ni sayt butunlay ishlamay qoladi. Shuning
-- uchun avval tekshiriladi.
do $tbl$
begin
    if to_regclass('public.talent_assignments') is null then
        raise exception 'talent_assignments topilmadi - avval supabase/talent_phase1.sql ni ishga tushiring';
    end if;
end
$tbl$;

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

revoke all on function public.is_assigned_person_of(text) from public, anon;
grant execute on function public.is_assigned_person_of(text) to authenticated;

-- Qolgan funksiyalar mavjudligini TEKSHIRAMIZ. Bittasi yo'q bo'lsa
-- qoida yaratilmay qolib, jadval JIMGINA ochiq qolardi - shuning uchun
-- bu yerda ataylab to'xtatiladi.
do $guard$
begin
    if to_regprocedure('public.current_username()') is null then
        raise exception 'current_username() topilmadi - avval supabase/storage_privacy_student_documents.sql ni ishga tushiring';
    end if;
    if to_regprocedure('public.is_platform_admin()') is null then
        raise exception 'is_platform_admin() topilmadi - avval supabase/club_membership_policy.sql ni ishga tushiring';
    end if;
    if to_regprocedure('public.is_scholarship_evaluator()') is null then
        raise exception 'is_scholarship_evaluator() topilmadi - avval supabase/storage_privacy_student_documents.sql ni ishga tushiring';
    end if;
end
$guard$;


-- ---------------------------------------------------------------------
-- 1. ESKI QOIDALARNI TOZALASH
--
-- Nomlar turli fayllarda turlicha (`sp_all`, `student_documents_select`,
-- `authenticated_access_academic_records`, ...), shuning uchun nom
-- bo'yicha emas, JADVAL bo'yicha o'chiriladi.
-- ---------------------------------------------------------------------
do $clean$
declare r record;
begin
    for r in
        select policyname, tablename
        from pg_policies
        where schemaname = 'public'
          and tablename in (
              'student_passport', 'student_enrollment_history', 'passport_access_logs',
              'academic_records', 'student_documents',
              'social_index_penalties', 'discipline_violations'
          )
    loop
        execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
    end loop;
end
$clean$;


-- ---------------------------------------------------------------------
-- 2. PASPORT, O'QISH TARIXI
--
-- O'qish: o'zi + biriktirilgan mas'ul + administrator.
-- Yozish: o'zi + administrator. Tyutor pasportni KO'RADI, lekin
-- o'zgartira olmaydi - u ma'lumot manbai emas.
-- ---------------------------------------------------------------------
create policy sp_select on public.student_passport
    for select to authenticated using (
        student_id = public.current_username()
        or public.is_assigned_person_of(student_id)
        or public.is_platform_admin()
    );
create policy sp_write on public.student_passport
    for all to authenticated
    using (student_id = public.current_username() or public.is_platform_admin())
    with check (student_id = public.current_username() or public.is_platform_admin());

create policy seh_select on public.student_enrollment_history
    for select to authenticated using (
        student_id = public.current_username()
        or public.is_assigned_person_of(student_id)
        or public.is_platform_admin()
    );
create policy seh_write on public.student_enrollment_history
    for all to authenticated
    using (public.is_platform_admin()) with check (public.is_platform_admin());


-- ---------------------------------------------------------------------
-- 3. PASPORTGA MUROJAAT JURNALI
--
-- O'qish FAQAT talabaning o'ziga va administratorga. Tyutor bu yerda
-- ATAYLAB yo'q: jurnalning maqsadi - talaba KIM uning ma'lumotini
-- ko'rganini bilishi. Ko'ruvchining o'zi jurnalni tahrirlay olmasligi
-- kerak, shuning uchun UPDATE va DELETE umuman berilmaydi.
--
-- Yozish esa hammaga ochiq bo'lishi SHART: pasportni ochgan har bir
-- odam shu jadvalga qator qo'shadi. Yopilsa, murojaat qayd etilmay
-- qolardi - ya'ni jurnal ishlamay qolardi.
-- ---------------------------------------------------------------------
create policy pal_select on public.passport_access_logs
    for select to authenticated using (
        student_id = public.current_username() or public.is_platform_admin()
    );
create policy pal_insert on public.passport_access_logs
    for insert to authenticated with check (true);


-- ---------------------------------------------------------------------
-- 4. AKADEMIK MA'LUMOT
--
-- Yozish faqat administratorga: baho manbai dekanat, talaba emas.
-- ---------------------------------------------------------------------
create policy acr_select on public.academic_records
    for select to authenticated using (
        student_id = public.current_username()
        or public.is_assigned_person_of(student_id)
        or public.is_platform_admin()
    );
create policy acr_write on public.academic_records
    for all to authenticated
    using (public.is_platform_admin()) with check (public.is_platform_admin());


-- ---------------------------------------------------------------------
-- 5. TALABA HUJJATLARI
--
-- Stipendiya baholovchisi ham ko'radi - fayl bucket'ida allaqachon
-- shunday (storage_privacy_student_documents.sql), jadval esa ochiq
-- qolgan edi. Ikkalasi bir xil bo'lishi kerak.
--
-- Yozish: o'zi + administrator. Baholovchi o'qiydi, o'zgartirmaydi.
-- ---------------------------------------------------------------------
create policy sdoc_select on public.student_documents
    for select to authenticated using (
        student_id = public.current_username()
        or public.is_assigned_person_of(student_id)
        or public.is_scholarship_evaluator()
        or public.is_platform_admin()
    );
create policy sdoc_write on public.student_documents
    for all to authenticated
    using (student_id = public.current_username() or public.is_platform_admin())
    with check (student_id = public.current_username() or public.is_platform_admin());


-- ---------------------------------------------------------------------
-- 6. INTIZOMIY JAZO, DISKVALIFIKATSIYA VA INTIZOM BUZILISHLARI
--
-- Bu yerda o'qish/yozish farqi eng muhim. Talaba o'z yozuvini KO'RADI
-- (rasmiy indeksda ball nega kamayganini bilishi kerak), lekin YOZISH
-- faqat administratorga. Aks holda talaba o'z diskvalifikatsiyasini
-- o'chirib tashlashi mumkin edi - va bu indeks orqali stipendiyaga
-- ta'sir qiladi.
-- ---------------------------------------------------------------------
create policy sipen_select on public.social_index_penalties
    for select to authenticated using (
        student_id = public.current_username()
        or public.is_assigned_person_of(student_id)
        or public.is_platform_admin()
    );
create policy sipen_write on public.social_index_penalties
    for all to authenticated
    using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy disc_select on public.discipline_violations
    for select to authenticated using (
        student_id = public.current_username()
        or public.is_assigned_person_of(student_id)
        or public.is_platform_admin()
    );
create policy disc_write on public.discipline_violations
    for all to authenticated
    using (public.is_platform_admin()) with check (public.is_platform_admin());


notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 7. TEKSHIRUV
--
-- Har jadvalda nechta qoida qolgani va ular orasida "hammaga ochiq"
-- (qual = true) borligi. `ochiq_qoida` ustunida 0 dan katta son chiqsa,
-- o'sha jadval hamon ochiq degani.
-- ---------------------------------------------------------------------
select
    tablename                                             as jadval,
    count(*)                                              as qoidalar,
    count(*) filter (where qual = 'true' and cmd <> 'INSERT') as ochiq_qoida
from pg_policies
where schemaname = 'public'
  and tablename in (
      'student_passport', 'student_enrollment_history', 'passport_access_logs',
      'academic_records', 'student_documents',
      'social_index_penalties', 'discipline_violations'
  )
group by tablename
order by tablename;
