-- =====================================================================
-- rls_events_registrations.sql UCHUN XATTI-HARAKAT SINOVI
--
-- Hech narsa saqlanmaydi: blok oxirida ataylab xato chiqariladi.
--
-- KUTILGAN NATIJA:
--   events                  -> talaba 0, admin = jami
--   registrations           -> talaba faqat O'Z qatorlari (va a'zosi
--                              bo'lgan jamoa qatorlari), admin = jami
--   registration_audit_logs -> ikkalasi ham 0 (jurnal o'zgarmaydi)
--   teams, team_members     -> talaba 0, admin = jami
--
-- Oxirida uchta yozuv sinovi:
--   * talaba O'ZI uchun ro'yxatdan o'ta oladimi (HA bo'lishi kerak)
--   * BEGONA nomdan ro'yxatdan o'ta oladimi (YO'Q bo'lishi kerak)
--   * tadbir yarata oladimi (YO'Q bo'lishi kerak)
-- =====================================================================

do $test$
declare
    tables text[] := array['events', 'registrations', 'registration_audit_logs',
                           'teams', 'team_members'];
    v_student  uuid;
    v_admin    uuid;
    v_stu_name text;
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

    foreach t in array tables loop
        if to_regclass('public.' || t) is null then
            report := report || E'\n  ' || t || ': jadval yo''q';
            continue;
        end if;
        select column_name into col from information_schema.columns
         where table_schema = 'public' and table_name = t
         order by ordinal_position limit 1;
        execute format('select count(*) from public.%I', t) into total;

        own := 0;
        if t = 'registrations' then
            execute format(
                'select count(*) from public.registrations r
                  where r.user_id = %L
                     or exists (select 1 from jsonb_array_elements(coalesce(r.team_members, ''[]''::jsonb)) m
                                 where m->>''userId'' = %L)', v_stu_name, v_stu_name) into own;
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
            if n_stu > own
               or (t = 'registration_audit_logs' and n_adm > 0)
               or (t <> 'registration_audit_logs' and n_adm <> total) then
                line := line || '  <-- DIQQAT';
            end if;
        exception when others then
            execute 'reset role';
            line := t || ': xato - ' || sqlerrm || '  <-- DIQQAT';
        end;
        report := report || E'\n  ' || line;
    end loop;

    -- ---------- YOZUV SINOVLARI (talaba nomidan) ----------
    report := report || E'\n--- talaba nomidan yozuv ---';
    begin
        execute 'set local role authenticated';
        perform set_config('request.jwt.claims',
            json_build_object('sub', v_student, 'role', 'authenticated')::text, true);

        begin
            execute format(
                'insert into public.registrations (id, activity_id, activity_type, user_id)
                 values (%L, %L, %L, %L)',
                'sinov_reg_own', 'sinov_activity', 'event', v_stu_name);
            report := report || E'\n  o''zi uchun ro''yxatdan o''tish: yozildi (to''g''ri)';
        exception when others then
            report := report || E'\n  o''zi uchun ro''yxatdan o''tish: RAD ETILDI  <-- DIQQAT ('
                      || left(sqlerrm, 50) || ')';
        end;

        begin
            execute format(
                'insert into public.registrations (id, activity_id, activity_type, user_id)
                 values (%L, %L, %L, %L)',
                'sinov_reg_begona', 'sinov_activity', 'event', 'begona_login');
            report := report || E'\n  BEGONA nomdan ro''yxatdan o''tish: yozildi  <-- DIQQAT';
        exception when others then
            report := report || E'\n  BEGONA nomdan ro''yxatdan o''tish: rad etildi (to''g''ri)';
        end;

        begin
            execute format(
                'insert into public.events (id, title, date) values (%L, %L, %L)',
                'sinov_event', 'Sinov tadbiri', '2026-12-31T10:00');
            report := report || E'\n  tadbir yaratish: yozildi  <-- DIQQAT';
        exception when others then
            report := report || E'\n  tadbir yaratish: rad etildi (to''g''ri)';
        end;

        execute 'reset role';
    exception when others then
        execute 'reset role';
        report := report || E'\n  yozuv sinovi xato: ' || sqlerrm;
    end;

    raise exception 'NATIJA (hech narsa saqlanmadi):%', report;
end
$test$;
