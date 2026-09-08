-- =====================================================================
-- SHAXSIY MA'LUMOTNI YOPISH — talaba va koordinator faqat reyting uchun
-- zarur maydonlarni ko'radi
--
-- QOIDA (foydalanuvchi belgilagan):
--   Har bir talaba talabalar reytingini ko'ra oladi va u yerda faqat
--   F.I.Sh., FAKULTET, KURS va REYTING BALLARINI ko'radi.
--   Qolgan hamma narsa — guruh, talaba ID, jinsi, pasport, akademik yozuv,
--   hujjatlar — boshqa talabaga KO'RINMAYDI. Klub koordinatoriga ham
--   xuddi shunday: koordinatorlik klub ichidagi vakolat, u boshqa
--   talabalarning shaxsiy ma'lumotiga huquq bermaydi.
--
-- OLDINGI HOLAT (rls_lockdown.sql dan keyin):
--   Kirmagan odam hech narsa ko'rmaydi, LEKIN kirgan har kim hamma
--   jadvalni to'liq o'qiy olardi. Bu fayl o'sha qatlamni tor qiladi.
--
-- ISHGA TUSHIRISHDAN OLDIN:
--   `rls_lockdown.sql` ishga tushirilgan bo'lishi kerak (u `anon` ni yopadi
--   va har bir jadvalga RLS yoqadi). Bu fayl o'sha ish ustiga quriladi.
--
-- MUHIM: bu fayl bilan birga ILOVA KODI ham o'zgardi — `db.js` endi
-- barcha profillarni `profiles` dan emas, `profiles_directory` ko'rinishidan
-- o'qiydi. Ikkalasi birga ishlaydi.
--
-- Bir necha marta ishga tushirish xavfsiz (idempotent).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Kim "xodim" hisoblanadi
--
-- Xodim shaxsiy ma'lumotni ko'radi, chunki uning ishi shuni talab qiladi:
-- admin akkaunt yaratadi, rahbariyat hisobot oladi, tyutor biriktirilgan
-- talabalari bilan ishlaydi.
--
-- TYUTOR ATAYLAB kiritilgan: aks holda tyutor ish maydoni ishlamay qolardi.
-- Lekin bu KENG huquq — tyutor hozir BARCHA talabalarning ma'lumotini
-- ko'radi, faqat o'ziga biriktirilganini emas. Buni keyinroq
-- `tutor_group_assignments` bo'yicha toraytirish kerak; hozir uni
-- toraytirish tyutor bo'limini sinovsiz buzib qo'yish xavfini tug'diradi.
--
-- KOORDINATOR bu ro'yxatda YO'Q va bo'lmasligi kerak: u TALABA rolining
-- ustidagi klub a'zoligi, rol emas.
-- ---------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.profiles
        where id::text = auth.uid()::text
          and role::text in ('ADMINISTRATOR', 'RAHBARIYAT', 'TYUTOR')
    )
$$;

revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;


-- ---------------------------------------------------------------------
-- 2. `profiles` jadvalining o'zi — faqat o'z qatoring (yoki xodim)
--
-- Ilova kirgan foydalanuvchining o'z profilini shu jadvaldan o'qiydi
-- (AuthContext.jsx). Boshqalarning profillari uchun pastdagi ko'rinish bor.
-- ---------------------------------------------------------------------
drop policy if exists authenticated_access_profiles on public.profiles;
drop policy if exists profiles_own_or_staff on public.profiles;

create policy profiles_own_or_staff on public.profiles
    for all to authenticated
    using (id::text = auth.uid()::text or public.is_staff())
    with check (id::text = auth.uid()::text or public.is_staff());


-- ---------------------------------------------------------------------
-- 3. `profiles_directory` — reyting uchun ochiq ko'rinish
--
-- Nega ko'rinish (view) kerak: Postgres'ning RLS'i QATOR darajasida
-- ishlaydi, USTUN darajasida emas. Bizga esa "hamma qatorni ko'rsin, lekin
-- faqat to'rtta ustunni" kerak. Buni ko'rinish hal qiladi.
--
-- Ko'rinish EGASI nomidan ishlaydi (security definer xatti-harakati), ya'ni
-- yuqoridagi RLS siyosatini chetlab o'tadi — himoya endi quyidagi CASE
-- ifodalarida. Xodim va o'z qatori uchun to'liq qiymat, qolganlarga NULL.
--
-- `role` ham yopiq: kim admin ekanini bilish shart emas.
-- ---------------------------------------------------------------------
drop view if exists public.profiles_directory;

create view public.profiles_directory as
select
    -- Har doim ochiq: reyting ro'yxati aynan shularsiz ma'nosiz bo'ladi.
    p.id,
    p.username,
    p.full_name,
    p.faculty,
    p.course,
    -- Shaxsiy: faqat o'ziga va xodimga.
    case when public.is_staff() or p.id::text = auth.uid()::text then p.role            end as role,
    case when public.is_staff() or p.id::text = auth.uid()::text then p.student_group   end as student_group,
    case when public.is_staff() or p.id::text = auth.uid()::text then p.student_id      end as student_id,
    case when public.is_staff() or p.id::text = auth.uid()::text then p.gender          end as gender,
    case when public.is_staff() or p.id::text = auth.uid()::text then p.professionalism end as professionalism
from public.profiles p;

revoke all on public.profiles_directory from public, anon;
grant select on public.profiles_directory to authenticated;


-- ---------------------------------------------------------------------
-- 4. Shaxsiy ma'lumot jadvallari — faqat egasi va xodim
--
-- Hammasi odamni `student_id text` ustuni bilan biladi, u esa USERNAME
-- saqlaydi (auth uuid emas). `current_username()` shu ko'prikni quradi.
-- Bu farqni chalkashtirish oson: uuid bilan solishtirilsa shart hech qachon
-- rost bo'lmaydi va talaba o'z ma'lumotini ham ko'rmay qoladi.
--
-- Ro'yxatda bo'lmagan, lekin bazada bor jadval jim o'tkazib yuboriladi.
-- ---------------------------------------------------------------------
do $personal$
declare
    t text;
    tables text[] := array[
        'student_passport',
        'student_documents',
        'document_audit_logs',
        'passport_access_logs',
        'academic_records',
        'student_enrollment_history',
        'talent_profiles',
        'talent_idps',
        'talent_goals',
        'talent_monitoring',
        'talent_assignments',
        'scholarship_applications',
        'scholarship_evaluations',
        'social_index_assessments',
        'social_index_evidence',
        'social_index_appeals',
        'social_index_requests',
        'cultural_visits',
        'test_attempts',
        'student_housing'
    ];
begin
    foreach t in array tables loop
        if not exists (
            select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = t and c.relkind = 'r'
        ) then
            raise notice 'O''tkazib yuborildi (jadval yo''q): %', t;
            continue;
        end if;

        -- Egasi ustuni `student_id` bo'lmasa qoida yozib bo'lmaydi - jim
        -- o'tkazib yuborilmaydi, ATAYLAB ogohlantiriladi.
        if not exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = t and column_name = 'student_id'
        ) then
            raise warning 'DIQQAT: %.student_id ustuni yo''q - qoida yozilmadi, qo''lda ko''rib chiqing', t;
            continue;
        end if;

        execute format('drop policy if exists %I on public.%I', 'authenticated_access_' || t, t);
        execute format('drop policy if exists %I on public.%I', t || '_own_or_staff', t);
        execute format(
            'create policy %I on public.%I for all to authenticated
               using (student_id = public.current_username() or public.is_staff())
               with check (student_id = public.current_username() or public.is_staff())',
            t || '_own_or_staff', t
        );
        raise notice 'Yopildi (egasi + xodim): %', t;
    end loop;
end
$personal$;


-- ---------------------------------------------------------------------
-- 5. TEKSHIRISH
--
-- (a) Shaxsiy jadvallarda hali ham "hamma ko'radi" siyosati qolganmi?
--     To'g'ri natija — BO'SH ro'yxat.
-- ---------------------------------------------------------------------
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and policyname like 'authenticated_access_%'
  and tablename in (
      'profiles', 'student_passport', 'student_documents', 'academic_records',
      'talent_profiles', 'scholarship_applications', 'social_index_assessments',
      'passport_access_logs', 'test_attempts', 'cultural_visits'
  )
order by tablename;


-- =====================================================================
-- KEYINGI QADAM (bu faylda emas)
--
-- TYUTOR hozir barcha talabalarning ma'lumotini ko'radi. To'g'risi -
-- faqat `tutor_group_assignments` orqali o'ziga biriktirilgan guruhni
-- ko'rishi. Buni qilish uchun avval tyutor bo'limi qaysi jadvallarni
-- o'qishini aniqlash kerak, aks holda uning ish maydoni jim buziladi.
-- =====================================================================
