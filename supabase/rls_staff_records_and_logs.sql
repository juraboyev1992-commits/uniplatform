-- =====================================================================
-- XODIM YOZUVLARI VA JURNALLAR - YOZISHNI TORAYTIRISH (2-guruh, A qism)
--
-- TESHIK: quyidagi jadvallar ham `for all to authenticated using (true)`
-- bilan turgan edi - login olgan istalgan talaba API orqali ularga
-- yoza olardi:
--   * Marifat darslari, davomati va faollik ballari - o'ziga davomat va
--     ball qo'yish;
--   * e'tirof (rag'bat) qoidalari va yozuvlari, taqdirlash reestri;
--   * test bazasi, testlar va savollar - o'z testini tahrirlash;
--   * tadbir vakolatlari (event_delegations) - o'ziga vakolat berish;
--   * yotoqxona ma'lumotlari;
--   * jurnallar - yozilgan tarixni O'CHIRISH yoki O'ZGARTIRISH, ya'ni
--     izini yo'qotish.
--
-- KIM YOZISHI (2026-09-16 da kod bo'yicha tekshirildi):
--   marifat_*            -> Marifat sahifasi /admin/marifat VA /tutor/marifat
--                           da ochiladi, shuning uchun is_staff()
--                           (ADMINISTRATOR, RAHBARIYAT, TYUTOR);
--   qolgan yozuvlar      -> faqat /admin/* sahifalaridan, ya'ni
--                           is_platform_admin();
--   jurnallar            -> qo'shish avvalgidek hamma kirgan foydalanuvchiga
--                           ochiq (hakam ball kiritganda ham yoziladi), lekin
--                           O'ZGARTIRISH butunlay yopiladi, O'CHIRISH esa
--                           faqat activity_attendance_audit_logs da va faqat
--                           xodimga qoladi (tadbir o'chirilganda deleteEvent
--                           shu qatorlarni tozalaydi - uni admin yoki tyutor
--                           bajaradi).
--
-- ATAYLAB TEGILMAYDI: student_recognitions (talaba taklif kirita olishi
-- uchun INSERT ochiq, tahrirlash esa `proposed_by = current_username()` va
-- `status = 'pending'` bilan cheklangan - bu supabase/student_recognitions.sql
-- da ataylab shunday), competition_audit_logs va boshqa INSERT-only
-- jurnallar.
--
-- O'QISH O'ZGARMAYDI: skript eski `for all` qoidaning haqiqiy `using`
-- ifodasi va rollarini bazadan ko'chirib, aynan o'shani faqat-o'qish
-- qoidasi qilib qayta yaratadi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni nusxalab Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- Keyin: supabase/rls_staff_records_and_logs_test.sql ni ALOHIDA Run.
-- =====================================================================

do $lock$
declare
    -- Xodim (admin + rahbariyat + tyutor) yozadi
    staff_tables text[] := array[
        'marifat_lessons', 'marifat_attendance', 'marifat_activity_scores'
    ];
    -- Faqat administrator yozadi
    admin_tables text[] := array[
        'recognition_cases', 'recognition_records', 'student_housing',
        'event_delegations', 'tests', 'test_questions', 'question_bases'
    ];
    -- Jurnallar: qo'shish ochiq, o'zgartirish yo'q
    log_tables text[] := array[
        'activity_attendance_audit_logs', 'club_position_audit_logs',
        'document_audit_logs', 'social_activity_audit_logs', 'integration_sync_logs'
    ];
    -- Jurnallardan o'chirishga ruxsat (faqat xodimga)
    log_delete_staff text[] := array['activity_attendance_audit_logs'];
    t text;
    r record;
    role_list text;
    guard text;
begin
    foreach t in array staff_tables || admin_tables || log_tables loop
        if to_regclass('public.' || t) is null then
            raise notice 'jadval topilmadi, o''tkazib yuborildi: %', t;
            continue;
        end if;

        execute format('alter table public.%I enable row level security', t);

        -- Eski yozish qoidalari olib tashlanadi; `for all` bo'lganining
        -- o'qish qismi aynan saqlanadi.
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

        if t = any(log_tables) then
            -- Jurnal: qo'shish ochiq (hakam/koordinator amali ham yoziladi),
            -- o'zgartirish qoidasi ataylab YARATILMAYDI.
            execute format('create policy %I on public.%I for insert to authenticated with check (true)',
                           t || '_append', t);
            if t = any(log_delete_staff) then
                execute format('create policy %I on public.%I for delete to authenticated using (public.is_staff())',
                               t || '_staff_delete', t);
            end if;
        else
            guard := case when t = any(staff_tables)
                          then 'public.is_staff()'
                          else 'public.is_platform_admin()' end;
            execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
                           t || '_w_insert', t, guard);
            execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                           t || '_w_update', t, guard, guard);
            execute format('create policy %I on public.%I for delete to authenticated using (%s)',
                           t || '_w_delete', t, guard);
        end if;
    end loop;
end
$lock$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- TEKSHIRUV 1 - holat. To'g'ri natija:
--   marifat_*            -> ochiq_yozish 0 | is_staff 3        | is_admin 0
--   qolgan yozuvlar      -> ochiq_yozish 0 | is_staff 0        | is_admin 3
--   jurnallar            -> ochiq_yozish 1 (faqat qo'shish!)   | is_staff 0 yoki 1
--   har birida oqish >= 1
-- ---------------------------------------------------------------------
select
    t.tablename as jadval,
    count(*) filter (where p.cmd = 'SELECT')                                     as oqish,
    count(*) filter (where p.cmd <> 'SELECT'
                     and coalesce(p.qual, '') || coalesce(p.with_check, '') not like '%is_%') as ochiq_yozish,
    count(*) filter (where coalesce(p.qual, '') || coalesce(p.with_check, '') like '%is_staff%')          as is_staff,
    count(*) filter (where coalesce(p.qual, '') || coalesce(p.with_check, '') like '%is_platform_admin%') as is_admin,
    string_agg(p.cmd, ',' order by p.cmd) filter (where p.cmd <> 'SELECT')       as yozish_turlari
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
  and t.tablename in ('marifat_lessons', 'marifat_attendance', 'marifat_activity_scores',
                      'recognition_cases', 'recognition_records', 'student_housing',
                      'event_delegations', 'tests', 'test_questions', 'question_bases',
                      'activity_attendance_audit_logs', 'club_position_audit_logs',
                      'document_audit_logs', 'social_activity_audit_logs', 'integration_sync_logs')
group by t.tablename
order by t.tablename;
