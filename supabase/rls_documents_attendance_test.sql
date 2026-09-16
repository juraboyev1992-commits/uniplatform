-- =====================================================================
-- rls_documents_attendance.sql UCHUN XATTI-HARAKAT SINOVI
--
-- Hech narsa saqlanmaydi: blok oxirida ataylab xato chiqariladi.
-- Talaba, koordinator va administrator akkaunti bazadan avtomatik olinadi.
--
-- Har jadval uchun:
--   korish talaba/jami | yozdi: talaba | koordinator | admin
--
-- KUTILGAN NATIJA:
--   talaba        -> 0 (test_attempts da faqat O'Z urinishlari soni)
--   admin         -> jami (document_counters da 0 - u butunlay yopiq)
--   koordinator   -> o'z klubi faoliyatlari qancha bo'lsa shuncha; bu son
--                    oldindan ma'lum emas, shuning uchun faqat ko'rsatiladi
--   korish        -> talaba avvalgidek hamma qatorni ko'radi
--
-- Oxirida hujjat raqami sinovi: talaba `next_doc_number` ni chaqira
-- olishi kerak (bayonnomani koordinator yaratadi), lekin
-- document_counters ga TO'G'RIDAN-TO'G'RI yoza olmasligi kerak.
-- =====================================================================

do $test$
declare
    tables text[] := array['protocols', 'protocol_participants', 'protocol_signers',
                           'documents', 'document_counters', 'award_batches',
                           'social_score_transactions', 'activity_attendance',
                           'activity_attendance_locks', 'test_attempts'];
    v_student  uuid;
    v_coord    uuid;
    v_admin    uuid;
    v_stu_name text;
    t text;
    col text;
    total int;
    seen int;
    n_stu int;
    n_coo int;
    n_adm int;
    kutilgan_stu int;
    kutilgan_adm int;
    doc_num text;
    n_cnt int;
    report text := '';
    line text;
begin
    select id, username into v_student, v_stu_name
      from public.profiles where role::text = 'TALABA' limit 1;
    select id into v_admin from public.profiles where role::text = 'ADMINISTRATOR' limit 1;
    -- haqiqiy akkaunti bor koordinator (memberships.user_id da uuid turadi)
    select pr.id into v_coord
      from public.memberships m
      join public.profiles pr on pr.id::text = m.user_id::text
     where m.role::text in ('head_coordinator', 'coordinator')
     limit 1;
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

        kutilgan_stu := 0;
        if t = 'test_attempts' and v_stu_name is not null then
            execute format('select count(*) from public.test_attempts where student_id = %L', v_stu_name)
              into kutilgan_stu;
        end if;
        kutilgan_adm := case when t = 'document_counters' then 0 else total end;

        begin
            execute 'set local role authenticated';

            perform set_config('request.jwt.claims',
                json_build_object('sub', v_student, 'role', 'authenticated')::text, true);
            execute format('select count(*) from public.%I', t) into seen;
            execute format('update public.%I set %I = %I', t, col, col);
            get diagnostics n_stu = row_count;

            if v_coord is null then
                n_coo := -1;
            else
                perform set_config('request.jwt.claims',
                    json_build_object('sub', v_coord, 'role', 'authenticated')::text, true);
                execute format('update public.%I set %I = %I', t, col, col);
                get diagnostics n_coo = row_count;
            end if;

            perform set_config('request.jwt.claims',
                json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
            execute format('update public.%I set %I = %I', t, col, col);
            get diagnostics n_adm = row_count;
            execute 'reset role';

            line := format('%s: korish %s/%s | yozdi: talaba %s | koordinator %s | admin %s',
                           t, seen, total, n_stu, n_coo, n_adm);
            if n_stu <> kutilgan_stu or seen < total or n_adm <> kutilgan_adm then
                line := line || '  <-- DIQQAT';
            end if;
        exception when others then
            execute 'reset role';
            line := t || ': xato - ' || sqlerrm || '  <-- DIQQAT';
        end;
        report := report || E'\n  ' || line;
    end loop;

    -- hujjat raqami: talaba nomidan
    begin
        execute 'set local role authenticated';
        perform set_config('request.jwt.claims',
            json_build_object('sub', v_student, 'role', 'authenticated')::text, true);
        begin
            execute 'select public.next_doc_number($1)' into doc_num using 'SINOV-0000';
            report := report || E'\n  next_doc_number (talaba nomidan): ' || coalesce(doc_num, 'null');
        exception when others then
            report := report || E'\n  next_doc_number: XATO - ' || sqlerrm || '  <-- DIQQAT';
        end;
        begin
            execute 'update public.document_counters set value = value';
            get diagnostics n_cnt = row_count;
            report := report || E'\n  document_counters ga to''g''ridan-to''g''ri yozuv: ' || n_cnt ||
                      case when n_cnt > 0 then '  <-- DIQQAT' else ' (yopiq)' end;
        exception when others then
            report := report || E'\n  document_counters ga yozuv: baza rad etdi (yopiq)';
        end;
        execute 'reset role';
    exception when others then
        execute 'reset role';
        report := report || E'\n  raqam sinovi: xato - ' || sqlerrm;
    end;

    if v_coord is null then
        report := report || E'\n  (haqiqiy akkaunti bor koordinator topilmadi - koordinator ustuni -1)';
    end if;
    raise exception 'NATIJA (hech narsa saqlanmadi):%', report;
end
$test$;
