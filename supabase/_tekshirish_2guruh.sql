-- 3-GURUH UCHUN BAZANI O'RGANISH. HECH NARSA O'ZGARTIRMAYDI - faqat o'qiydi.
--
-- Natija BITTA xato xabari ko'rinishida chiqadi (jadval emas) - shunday
-- qilingani uchun uni bir marta nusxalab yuborish oson.

do $inspect$
declare
    tables text[] := array[
        'documents', 'document_counters', 'protocols', 'protocol_participants',
        'protocol_signers', 'award_batches', 'social_score_transactions',
        'activity_attendance', 'activity_attendance_locks', 'test_attempts', 'memberships'
    ];
    t text;
    r record;
    report text := '';
begin
    -- 1. USTUNLAR (faqat nomlar)
    foreach t in array tables loop
        if to_regclass('public.' || t) is null then
            report := report || E'\n USTUN ' || t || ': JADVAL YO''Q';
            continue;
        end if;
        report := report || E'\n USTUN ' || t || ': ' || (
            select string_agg(column_name, ', ' order by ordinal_position)
            from information_schema.columns
            where table_schema = 'public' and table_name = t
        );
    end loop;

    -- 2. HOZIRGI QOIDALAR
    for r in
        select tablename, policyname, cmd, array_to_string(roles, '+') as roles,
               left(coalesce(qual, '-'), 70) as q, left(coalesce(with_check, '-'), 70) as w
        from pg_policies
        where schemaname = 'public' and tablename = any(tables)
        order by tablename, cmd, policyname
    loop
        report := report || E'\n QOIDA ' || r.tablename || ' | ' || r.policyname || ' | ' ||
                  r.cmd || ' | ' || r.roles || ' | using=' || r.q || ' | check=' || r.w;
    end loop;

    -- 3. KERAKLI FUNKSIYALAR
    for r in
        select p.proname as nom, p.prosecdef as definer
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('next_doc_number', 'verify_document', 'current_username',
                            'is_staff', 'is_platform_admin', 'is_competition_judge',
                            'is_competition_owner')
        order by p.proname
    loop
        report := report || E'\n FUNKS ' || r.nom || ' security_definer=' || r.definer;
    end loop;

    -- 4. MEMBERSHIPS: qanday rollar bor (koordinatorni RLS da aniqlash uchun)
    if to_regclass('public.memberships') is not null
       and exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'memberships' and column_name = 'role') then
        report := report || E'\n ROLLAR memberships.role: ' ||
                  coalesce((select string_agg(distinct role::text, ', ') from public.memberships), '(bo''sh)');
    end if;

    raise exception 'NATIJA:%', report;
end
$inspect$;
