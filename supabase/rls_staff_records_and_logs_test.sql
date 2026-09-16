-- =====================================================================
-- rls_staff_records_and_logs.sql UCHUN XATTI-HARAKAT SINOVI
--
-- Hech narsa saqlanmaydi: blok oxirida ataylab xato chiqariladi.
-- Talaba, tyutor va administrator akkaunti bazadan avtomatik olinadi.
--
-- Har jadval uchun:
--   ko'rish talaba/jami | yozdi: talaba | tyutor | admin
--
-- KUTILGAN NATIJA:
--   marifat_*         -> talaba 0, tyutor = jami, admin = jami
--   boshqa yozuvlar   -> talaba 0, tyutor 0,      admin = jami
--   jurnallar         -> talaba 0, tyutor 0,      admin 0
--                        (jurnal o'zgarmaydi - faqat qo'shiladi)
--   ko'rish: talaba avvalgidek hamma qatorni ko'radi
-- Muammoli qator oxirida "<-- DIQQAT" turadi.
-- =====================================================================

do $test$
declare
    staff_tables text[] := array['marifat_lessons', 'marifat_attendance', 'marifat_activity_scores'];
    admin_tables text[] := array['recognition_cases', 'recognition_records', 'student_housing',
                                 'event_delegations', 'tests', 'test_questions', 'question_bases'];
    log_tables   text[] := array['activity_attendance_audit_logs', 'club_position_audit_logs',
                                 'document_audit_logs', 'social_activity_audit_logs', 'integration_sync_logs'];
    v_student uuid;
    v_tutor   uuid;
    v_admin   uuid;
    t text;
    col text;
    total int;
    seen int;
    n_stu int;
    n_tut int;
    n_adm int;
    kutilgan_tutor int;
    kutilgan_admin int;
    report text := '';
    line text;
begin
    select id into v_student from public.profiles where role::text = 'TALABA'        limit 1;
    select id into v_tutor   from public.profiles where role::text = 'TYUTOR'        limit 1;
    select id into v_admin   from public.profiles where role::text = 'ADMINISTRATOR' limit 1;
    if v_student is null or v_admin is null then
        raise exception 'NATIJA: talaba yoki admin akkaunti topilmadi';
    end if;

    foreach t in array staff_tables || admin_tables || log_tables loop
        if to_regclass('public.' || t) is null then
            report := report || E'\n  ' || t || ': jadval yo''q';
            continue;
        end if;
        select column_name into col from information_schema.columns
         where table_schema = 'public' and table_name = t
         order by ordinal_position limit 1;
        execute format('select count(*) from public.%I', t) into total;

        begin
            execute 'set local role authenticated';

            perform set_config('request.jwt.claims',
                json_build_object('sub', v_student, 'role', 'authenticated')::text, true);
            execute format('select count(*) from public.%I', t) into seen;
            execute format('update public.%I set %I = %I', t, col, col);
            get diagnostics n_stu = row_count;

            if v_tutor is null then
                n_tut := -1;
            else
                perform set_config('request.jwt.claims',
                    json_build_object('sub', v_tutor, 'role', 'authenticated')::text, true);
                execute format('update public.%I set %I = %I', t, col, col);
                get diagnostics n_tut = row_count;
            end if;

            perform set_config('request.jwt.claims',
                json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
            execute format('update public.%I set %I = %I', t, col, col);
            get diagnostics n_adm = row_count;
            execute 'reset role';

            kutilgan_tutor := case when t = any(staff_tables) then total else 0 end;
            kutilgan_admin := case when t = any(log_tables)   then 0     else total end;

            line := format('%s: korish %s/%s | yozdi: talaba %s | tyutor %s | admin %s',
                           t, seen, total, n_stu, n_tut, n_adm);
            if n_stu > 0 or seen < total or n_adm <> kutilgan_admin
               or (v_tutor is not null and n_tut <> kutilgan_tutor) then
                line := line || '  <-- DIQQAT';
            end if;
        exception when others then
            execute 'reset role';
            line := t || ': xato - ' || sqlerrm || '  <-- DIQQAT';
        end;
        report := report || E'\n  ' || line;
    end loop;

    if v_tutor is null then
        report := report || E'\n  (tyutor akkaunti topilmadi - tyutor ustuni -1)';
    end if;
    raise exception 'NATIJA (hech narsa saqlanmadi):%', report;
end
$test$;
