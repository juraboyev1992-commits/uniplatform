-- ============================================================================
-- KIM TASDIQLAYDI - metodika qoidasi
--
-- Hujjat matni (9-mezon ustuni, boshqa mezonlarda ham takrorlanadi):
--
--   "Hujjatlar GURUH TYUTORI (4 va undan yuqori kurs talabalari uchun
--    FAKULTET DEKAN O'RINBOSARI) tomonidan tasdiqlanadi."
--
-- HOZIRGI HOLAT ikki jadvalda ikki xil va IKKALASI HAM noto'g'ri edi:
--
--   social_index_evidence : `using (is_platform_admin())` - JUDA TOR.
--       Tyutorga interfeysda tasdiqlash tugmasi ko'rinadi (tyutor ish
--       maydonida CriterionConfirmationPanel bor), lekin baza rad etadi.
--       Ya'ni tyutor tugmani bosadi va xato oladi.
--
--   cultural_visits : `using (is_staff())` - JUDA KENG. `is_staff()`
--       ADMINISTRATOR, RAHBARIYAT va TYUTOR ni qamraydi, ya'ni HAR QANDAY
--       tyutor BEGONA guruh talabasining tashrifini tasdiqlay olardi.
--
-- YECHIM: bitta funksiya - `is_index_reviewer_of(talaba)`. U metodikaning
--   qoidasini aynan takrorlaydi va ikkala jadval ham shunga tayanadi.
--
-- KURS MA'LUMOTI YO'Q BO'LSA: tyutor yo'li tanlanadi (coalesce(course,0)).
--   Sababi - kurssiz talaba ko'p (profilga kurs kiritilmagan bo'lishi
--   mumkin) va ularni tasdiqlovchisiz qoldirish oqimni to'xtatardi.
--
-- DIQQAT - RUXSAT TORAYADI: `cultural_visits` da RAHBARIYAT va boshqa
--   guruh tyutorlari endi tasdiqlay olmaydi. Bu metodikaning talabi, lekin
--   agar amalda rahbariyat ham tasdiqlayotgan bo'lsa - ayting, qo'shamiz.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni Run.
-- ============================================================================

do $guard$
begin
    if to_regprocedure('public.current_username()') is null
       or to_regclass('public.tutor_group_assignments') is null then
        raise exception 'Avval supabase/rls_documents_attendance.sql va event_collections.sql ni ishga tushiring.';
    end if;
end
$guard$;

create or replace function public.is_index_reviewer_of(p_student text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    with s as (
        select p.username, p.student_group, p.course, p.faculty
          from public.profiles p
         where p.username = p_student
    )
    select
        -- 1-3 kurs (yoki kurs ko'rsatilmagan): TALABANING O'Z guruhi tyutori.
        exists (
            select 1
              from s
              join public.tutor_group_assignments t
                on t.active
               and t.group_name = s.student_group
             where coalesce(s.course, 0) < 4
               and t.tutor_username = public.current_username()
        )
        or
        -- 4-kurs va yuqori: TALABANING O'Z fakulteti dekan o'rinbosari.
        -- Ro'yxat `scholarship_settings.data.facultyEvaluators` da yuritiladi
        -- ({faculty, username, fullName}) - alohida jadval ochilmadi, chunki
        -- fakultet mas'ullari allaqachon shu yerda boshqariladi.
        exists (
            select 1
              from s
              cross join public.scholarship_settings ss
              cross join lateral jsonb_array_elements(
                  coalesce(ss.data->'facultyEvaluators', '[]'::jsonb)
              ) as e
             where coalesce(s.course, 0) >= 4
               and ss.id = 'default'
               and e->>'username' = public.current_username()
               and e->>'faculty' = s.faculty
        );
$$;

revoke all on function public.is_index_reviewer_of(text) from public, anon;
grant execute on function public.is_index_reviewer_of(text) to authenticated;

-- ---------------------------------------------------------------------
-- 1. DALILLAR - tor edi, kengaytiriladi
-- ---------------------------------------------------------------------
drop policy if exists sie_update on public.social_index_evidence;
create policy sie_update on public.social_index_evidence
    for update to authenticated
    using      (public.is_platform_admin() or public.is_index_reviewer_of(student_id))
    with check (public.is_platform_admin() or public.is_index_reviewer_of(student_id));

-- ---------------------------------------------------------------------
-- 2. MADANIY TASHRIFLAR - keng edi, toraytiriladi
-- ---------------------------------------------------------------------
drop policy if exists cultural_visits_w_update on public.cultural_visits;
create policy cultural_visits_w_update on public.cultural_visits
    for update to authenticated
    using      (public.is_platform_admin() or public.is_index_reviewer_of(student_id))
    with check (public.is_platform_admin() or public.is_index_reviewer_of(student_id));

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
-- ---------------------------------------------------------------------------
select tablename as jadval, policyname as qoida, cmd as amal, qual as ifoda
from pg_policies
where schemaname = 'public'
  and tablename in ('social_index_evidence', 'cultural_visits')
  and cmd = 'UPDATE'
order by tablename;
