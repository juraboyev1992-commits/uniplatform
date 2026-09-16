-- =====================================================================
-- rls_admin_config_tables.sql UCHUN XATTI-HARAKAT SINOVI
--
-- Hech narsa saqlanmaydi: blok oxirida ataylab xato chiqariladi, shuning
-- uchun barcha o'zgarishlar bekor bo'ladi. Natija xato xabari sifatida
-- ko'rinadi (SQL Editor faqat oxirgi buyruq natijasini ko'rsatadi).
--
-- Talaba va administrator akkaunti bazadan avtomatik olinadi. Har jadval:
--   talaba ko'radi N/jami | talaba yozdi | talaba o'chirdi | admin yozdi
-- To'g'ri natija: talaba hamma qatorni KO'RADI, yozdi = 0, o'chirdi = 0,
-- admin yozdi = jami. Muammoli qator oxirida "<-- DIQQAT" turadi.
-- =====================================================================

do $test$
declare
    tables text[] := array[
        'scholarship_settings', 'scholarship_grants', 'integration_settings',
        'social_scoring_sources', 'social_criteria_categories', 'social_criteria_subcategories',
        'award_rules', 'recognition_rules', 'venues', 'cultural_places', 'dormitories'
    ];
    v_student uuid;
    v_admin   uuid;
    t text;
    col text;
    total int;
    seen int;
    n_upd int;
    n_del int;
    n_admin int;
    report text := '';
    line text;
begin
    select id into v_student from public.profiles where role::text = 'TALABA' limit 1;
    select id into v_admin   from public.profiles where role::text = 'ADMINISTRATOR' limit 1;
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

        begin
            execute 'set local role authenticated';
            perform set_config('request.jwt.claims',
                json_build_object('sub', v_student, 'role', 'authenticated')::text, true);
            execute format('select count(*) from public.%I', t) into seen;
            execute format('update public.%I set %I = %I', t, col, col);
            get diagnostics n_upd = row_count;
            execute format('delete from public.%I', t);
            get diagnostics n_del = row_count;

            perform set_config('request.jwt.claims',
                json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
            execute format('update public.%I set %I = %I', t, col, col);
            get diagnostics n_admin = row_count;
            execute 'reset role';

            line := format('%s: talaba ko''radi %s/%s | talaba yozdi %s | talaba o''chirdi %s | admin yozdi %s',
                           t, seen, total, n_upd, n_del, n_admin);
            if n_upd > 0 or n_del > 0 or seen < total or n_admin < total then
                line := line || '  <-- DIQQAT';
            end if;
        exception when others then
            execute 'reset role';
            line := t || ': xato - ' || sqlerrm || '  <-- DIQQAT';
        end;
        report := report || E'\n  ' || line;
    end loop;

    raise exception 'NATIJA (hech narsa saqlanmadi):%', report;
end
$test$;
