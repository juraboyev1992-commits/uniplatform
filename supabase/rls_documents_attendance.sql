-- =====================================================================
-- RASMIY HUJJATLAR, BAYONNOMA, DAVOMAT VA BALL - YOZISHNI TORAYTIRISH
-- (2-guruh, B qism - eng xavflisi)
--
-- TESHIK: bu jadvallarning hammasi `for all to authenticated using (true)`
-- bilan turgan edi. Login olgan istalgan talaba API orqali:
--   * `documents` ga O'ZIGA diplom yozib qo'yishi mumkin edi - va u QR
--     orqali HAQIQIY bo'lib chiqardi (verify_document faqat tokenni
--     qidiradi, kim yozganini tekshirmaydi);
--   * bayonnomani (protocols) o'zgartirishi, imzolovchilarni almashtirishi
--     yoki "tasdiqlangan" qilib qo'yishi mumkin edi;
--   * o'ziga ijtimoiy faollik bali yozishi (social_score_transactions);
--   * o'ziga davomat qo'yishi va yopilgan davomatni qayta ochishi;
--   * o'z test natijasini o'zgartirishi mumkin edi.
--
-- KIM YOZISHI (2026-09-16 da kod bo'yicha aniqlandi): bularni faqat admin
-- emas, tadbirni olib borayotgan KOORDINATOR ham yozadi
-- (ActivityFinalizationTab: `canManage = hasFullAdminAccess() || role ===
-- 'COORDINATOR'`), davomatni esa tyutor va hakam ham. Shuning uchun qoida
-- rolga emas, FAOLIYATGA bog'lanadi: uni boshqarishga haqli odam yozadi.
--
-- YANGI YORDAMCHI FUNKSIYALAR:
--   activity_club_id(turi, id)  - tadbir/musobaqaning klubi
--                                 (events.club_id yoki competitions.data->>'clubId')
--   is_club_officer(klub)       - shu klubda koordinatormi (memberships.role)
--   is_club_officer_any()       - istalgan klubda koordinatormi
--   can_manage_activity(t, id)  - xodim YOKI klub koordinatori YOKI
--                                 musobaqa hakami/egasi
--
-- document_counters: unga TO'G'RIDAN-TO'G'RI yozish butunlay yopiladi.
-- Hujjat raqami `next_doc_number` funksiyasi orqali beriladi - u
-- `security definer` EMAS edi, ya'ni chaqiruvchining huquqi bilan yozardi.
-- Shu sababli quyida u `security definer` qilinadi; aks holda raqam
-- berish ishlamay qolardi.
--
-- test_attempts: jonli bazada ikkita qoida bor edi - to'g'ri yozilgani
-- (`student_id = current_username() or is_staff()`) va uning ustidan
-- `test_attempts_all` (`true/true`). Qoidalar OR bilan qo'shilgani uchun
-- ikkinchisi birinchisini bekor qilib turardi. Endi ochiq qoida olib
-- tashlanadi, o'z urinishiga yozish esa qoladi (UI `studentId` sifatida
-- aynan `username` uzatadi - tekshirildi).
--
-- O'QISH O'ZGARMAYDI: har bir eski `for all` qoidaning haqiqiy `using`
-- ifodasi va rollari bazadan ko'chirilib, aynan o'shani faqat-o'qish
-- qoidasi qilib qayta yaratiladi (reyting va jonli ekranlar buzilmasin).
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni nusxalab Run.
-- Keyin: supabase/rls_documents_attendance_test.sql ni ALOHIDA Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. YORDAMCHI FUNKSIYALAR
-- ---------------------------------------------------------------------
-- Musobaqada klub `clubId` da EMAS: ilovaning o'zi (getActivityFinalSnapshot)
-- uni `contextType = 'club'` bo'lganda `contextId` dan oladi. Avvalgi
-- variant faqat `clubId` ni o'qigani uchun klub topilmasdi va koordinator
-- faqat hakam/ega bo'lgani uchungina o'ta olardi. Ikkala kalit ham
-- tekshiriladi - eski qatorlarda `clubId` bo'lishi mumkin.
create or replace function public.activity_club_id(p_type text, p_id text)
returns text language sql stable security definer set search_path = '' as $$
    select case
        when p_type = 'event' then
            (select e.club_id::text from public.events e where e.id::text = p_id)
        when p_type = 'competition' then
            (select coalesce(
                        case when c.data->>'contextType' = 'club' then c.data->>'contextId' end,
                        c.data->>'clubId')
               from public.competitions c where c.id::text = p_id)
        else null
    end
$$;

create or replace function public.is_club_officer(p_club_id text)
returns boolean language sql stable security definer set search_path = '' as $$
    select p_club_id is not null and exists (
        select 1 from public.memberships m
        where m.club_id::text = p_club_id
          and m.user_id::text = auth.uid()::text
          and m.role::text in ('head_coordinator', 'coordinator')
    )
$$;

create or replace function public.is_club_officer_any()
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.memberships m
        where m.user_id::text = auth.uid()::text
          and m.role::text in ('head_coordinator', 'coordinator')
    )
$$;

create or replace function public.can_manage_activity(p_type text, p_id text)
returns boolean language sql stable security definer set search_path = '' as $$
    select public.is_staff()
        or public.is_club_officer(public.activity_club_id(p_type, p_id))
        or (p_type = 'competition'
            and (public.is_competition_judge(p_id) or public.is_competition_owner(p_id)))
$$;

revoke all on function public.activity_club_id(text, text)    from public, anon;
revoke all on function public.is_club_officer(text)           from public, anon;
revoke all on function public.is_club_officer_any()           from public, anon;
revoke all on function public.can_manage_activity(text, text) from public, anon;
grant execute on function public.activity_club_id(text, text)    to authenticated;
grant execute on function public.is_club_officer(text)           to authenticated;
grant execute on function public.is_club_officer_any()           to authenticated;
grant execute on function public.can_manage_activity(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. HUJJAT RAQAMI: next_doc_number chaqiruvchining emas, egasining
--    huquqi bilan ishlasin (aks holda document_counters yopilganda
--    bayonnoma yaratish to'xtab qolardi).
-- ---------------------------------------------------------------------
do $fn$
declare r record; topildi int := 0;
begin
    for r in
        select p.oid::regprocedure as sig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'next_doc_number'
    loop
        execute format('alter function %s security definer', r.sig);
        execute format('alter function %s set search_path = public, pg_temp', r.sig);
        topildi := topildi + 1;
    end loop;
    if topildi = 0 then
        raise exception 'next_doc_number topilmadi - document_counters yopilsa hujjat raqami berilmaydi. To''xtatildi.';
    end if;
end
$fn$;

-- ---------------------------------------------------------------------
-- 3. QOIDALAR
-- ---------------------------------------------------------------------
do $lock$
declare
    -- faoliyatga bevosita bog'langan (activity_type + activity_id ustunlari)
    act_tables  text[] := array['protocols', 'activity_attendance', 'activity_attendance_locks'];
    -- bayonnoma orqali bog'langan (protocol_id ustuni)
    prot_tables text[] := array['protocol_participants', 'documents', 'award_batches'];
    all_tables  text[] := array[
        'protocols', 'activity_attendance', 'activity_attendance_locks',
        'protocol_participants', 'documents', 'award_batches',
        'protocol_signers', 'social_score_transactions', 'test_attempts',
        'document_counters'
    ];
    prot_guard constant text :=
        'public.is_staff() or exists (select 1 from public.protocols p '
        'where p.id = protocol_id and public.can_manage_activity(p.activity_type, p.activity_id))';
    t text;
    r record;
    role_list text;
    guard text;
    upd_guard text;
begin
    foreach t in array all_tables loop
        if to_regclass('public.' || t) is null then
            raise notice 'jadval topilmadi, o''tkazib yuborildi: %', t;
            continue;
        end if;

        execute format('alter table public.%I enable row level security', t);

        -- eski yozish qoidalari olib tashlanadi; `for all` bo'lganining
        -- o'qish qismi aynan saqlanadi
        for r in
            select policyname, cmd, roles, qual
            from pg_policies
            where schemaname = 'public' and tablename = t and cmd <> 'SELECT'
        loop
            if r.cmd = 'ALL' then
                select string_agg(quote_ident(x), ', ') into role_list from unnest(r.roles) x;
                execute format('drop policy if exists %I on public.%I', r.policyname || '_read', t);
                execute format('create policy %I on public.%I for select to %s using (%s)',
                               r.policyname || '_read', t, role_list, coalesce(r.qual, 'false'));
            end if;
            execute format('drop policy %I on public.%I', r.policyname, t);
        end loop;

        -- document_counters: yozish qoidasi ATAYLAB yaratilmaydi
        -- (faqat next_doc_number orqali o'zgaradi)
        if t = 'document_counters' then
            continue;
        end if;

        if t = any(act_tables) then
            guard := 'public.can_manage_activity(activity_type, activity_id)';
        elsif t = any(prot_tables) then
            guard := prot_guard;
        elsif t = 'protocol_signers' then
            guard := prot_guard;
        elsif t = 'social_score_transactions' then
            guard := 'public.is_staff() or public.is_club_officer_any()';
        elsif t = 'test_attempts' then
            guard := 'student_id = public.current_username() or public.is_staff()';
        end if;

        -- imzolovchi O'Z qatorini imzolaydi (signProtocol aynan shuni yozadi)
        upd_guard := case when t = 'protocol_signers'
                          then guard || ' or username = public.current_username()'
                          else guard end;

        execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
                       t || '_w_insert', t, guard);
        execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                       t || '_w_update', t, upd_guard, upd_guard);
        execute format('create policy %I on public.%I for delete to authenticated using (%s)',
                       t || '_w_delete', t, guard);
    end loop;
end
$lock$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- TEKSHIRUV 1 - holat. To'g'ri natija:
--   document_counters -> yozish_qoidalari 0
--   qolganlari        -> ochiq_yozish 0, yozish_qoidalari 3
--   har birida oqish >= 1
-- ---------------------------------------------------------------------
-- DIQQAT: pg_policies qoida matnini `public.` prefiksisiz saqlaydi
-- (`public.is_staff()` -> `is_staff()`), shuning uchun tekshiruv funksiya
-- NOMLARI bo'yicha qilinadi - prefiks bo'yicha emas.
select
    t.tablename as jadval,
    count(*) filter (where p.cmd = 'SELECT')      as oqish,
    count(*) filter (where p.cmd <> 'SELECT')     as yozish_qoidalari,
    count(*) filter (where p.cmd <> 'SELECT'
                     and coalesce(p.qual, '') || coalesce(p.with_check, '')
                         !~ '(can_manage_activity|is_staff|is_platform_admin|is_club_officer|current_username)')
                                                  as ochiq_yozish
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
  and t.tablename in ('protocols', 'protocol_participants', 'protocol_signers',
                      'documents', 'document_counters', 'award_batches',
                      'social_score_transactions', 'activity_attendance',
                      'activity_attendance_locks', 'test_attempts')
group by t.tablename
order by t.tablename;
