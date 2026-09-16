-- =====================================================================
-- rls_workflow_tables.sql UCHUN XATTI-HARAKAT SINOVI
--
-- Hech narsa saqlanmaydi: blok oxirida ataylab xato chiqariladi.
--
-- Har jadval uchun:  korish talaba/jami | yozdi: talaba | admin
-- KUTILGAN: talaba 0 (o'zining qatorlaridan tashqari), admin = jami.
--
-- Oxirida ikki alohida sinov:
--   * talaba o'ziga head_coordinator a'zoligini yoza oladimi (YO'Q bo'lishi
--     kerak - trigger to'sadi), 'member' esa yoza olishi kerak;
--   * talaba boshqa odamning bildirishnomasini ko'ra oladimi (YO'Q).
-- =====================================================================

do $test$
declare
    tables text[] := array['notifications', 'club_positions', 'club_position_applications',
                           'club_position_assignments', 'club_join_requests', 'club_membership_events',
                           'club_documents', 'club_achievements', 'cultural_visits',
                           'sport_teams', 'sport_team_nominations', 'sport_conduct_flags',
                           'activity_tasks', 'activity_reports', 'social_activity_applications',
                           'student_opportunity_matches', 'reading_sessions'];
    v_student  uuid;
    v_admin    uuid;
    v_stu_name text;
    v_club     text;
    t text;
    col text;
    total int;
    seen int;
    n_stu int;
    n_adm int;
    own int;
    report text := '';
    line text;
begin
    select id, username into v_student, v_stu_name
      from public.profiles where role::text = 'TALABA' limit 1;
    select id into v_admin from public.profiles where role::text = 'ADMINISTRATOR' limit 1;
    if v_student is null or v_admin is null then
        raise exception 'NATIJA: talaba yoki admin akkaunti topilmadi';
    end if;
    select id into v_club from public.clubs limit 1;

    foreach t in array tables loop
        if to_regclass('public.' || t) is null then
            report := report || E'\n  ' || t || ': jadval yo''q';
            continue;
        end if;
        select column_name into col from information_schema.columns
         where table_schema = 'public' and table_name = t
         order by ordinal_position limit 1;
        execute format('select count(*) from public.%I', t) into total;

        -- talabaning O'Z qatorlari (shularga yozishi KUTILADI)
        own := 0;
        if t = 'notifications' then
            execute format('select count(*) from public.notifications where user_id::text = %L', v_stu_name) into own;
        elsif t in ('cultural_visits', 'reading_sessions', 'social_activity_applications',
                    'club_position_applications', 'sport_team_nominations') then
            execute format('select count(*) from public.%I where student_id = %L', t, v_stu_name) into own;
        elsif t = 'activity_tasks' then
            execute format('select count(*) from public.activity_tasks where assignee_id = %L', v_stu_name) into own;
        end if;

        begin
            execute 'set local role authenticated';
            perform set_config('request.jwt.claims',
                json_build_object('sub', v_student, 'role', 'authenticated')::text, true);
            execute format('select count(*) from public.%I', t) into seen;
            execute format('update public.%I set %I = %I', t, col, col);
            get diagnostics n_stu = row_count;

            perform set_config('request.jwt.claims',
                json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
            execute format('update public.%I set %I = %I', t, col, col);
            get diagnostics n_adm = row_count;
            execute 'reset role';

            line := format('%s: korish %s/%s | yozdi: talaba %s (oz qatori %s) | admin %s',
                           t, seen, total, n_stu, own, n_adm);
            -- club_membership_events - faqat QO'SHISHGA ochiq jurnal:
            -- unda admin ham 0 yozadi va bu to'g'ri holat.
            if n_stu > own or (t <> 'club_membership_events' and n_adm <> total) then
                line := line || '  <-- DIQQAT';
            end if;
        exception when others then
            execute 'reset role';
            line := t || ': xato - ' || sqlerrm || '  <-- DIQQAT';
        end;
        report := report || E'\n  ' || line;
    end loop;

    -- A'ZOLIK ROLI SINOVI
    report := report || E'\n--- a''zolik roli ---';
    begin
        execute 'set local role authenticated';
        perform set_config('request.jwt.claims',
            json_build_object('sub', v_student, 'role', 'authenticated')::text, true);
        begin
            execute format(
                'insert into public.memberships (user_id, club_id, role) values (%L, %L, %L)',
                v_student::text, coalesce(v_club, '1'), 'head_coordinator');
            report := report || E'\n  head_coordinator yozildi  <-- DIQQAT (to''silishi kerak edi)';
        exception when others then
            report := report || E'\n  head_coordinator rad etildi: ' || left(sqlerrm, 60) || ' (to''g''ri)';
        end;
        begin
            execute format(
                'insert into public.memberships (user_id, club_id, role) values (%L, %L, %L)',
                v_student::text, coalesce(v_club, '1'), 'member');
            report := report || E'\n  member yozildi (to''g''ri - talaba klubga o''zi a''zo bo''la oladi)';
        exception when others then
            report := report || E'\n  member rad etildi: ' || left(sqlerrm, 60) || '  <-- DIQQAT';
        end;
        execute 'reset role';
    exception when others then
        execute 'reset role';
        report := report || E'\n  a''zolik sinovi xato: ' || sqlerrm;
    end;

    raise exception 'NATIJA (hech narsa saqlanmadi):%', report;
end
$test$;
