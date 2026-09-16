-- =====================================================================
-- 3-GURUH: QOLGAN OCHIQ JADVALLARNING USTUNLARI VA QOIDALARI
--
-- Ayniqsa `notifications` muhim: u ilgari toraytirilgan edi, lekin ochiq
-- jadvallar ro'yxatiga tushdi. Qoida turi `ALL` bo'lgani bilan sharti tor
-- bo'lishi mumkin - `using` matnini ko'rmasdan hal qilib bo'lmaydi.
--
-- activity_tasks, activity_reports, student_opportunity_matches va
-- notifications ta'riflari loyiha fayllarida yo'q (bazada yaratilgan),
-- shuning uchun ustunlari ham shu yerda so'raladi.
--
-- HECH NARSA O'ZGARTIRILMAYDI. Natija bitta xabar - nusxalab yuboring.
-- =====================================================================

do $check$
declare
    tables text[] := array[
        'notifications', 'club_positions', 'club_position_applications',
        'club_position_assignments', 'club_join_requests', 'club_membership_events',
        'club_documents', 'club_achievements', 'cultural_visits',
        'sport_teams', 'sport_team_nominations', 'sport_conduct_flags',
        'activity_tasks', 'activity_reports', 'social_activity_applications',
        'student_opportunity_matches', 'reading_sessions', 'competition_scoring_groups'
    ];
    r record;
    report text := '';
    t text;
    n bigint;
begin
    -- 1. USTUNLAR (loyiha fayllarida yo'q jadvallar uchun zarur)
    report := report || E'\n--- ustunlar ---';
    foreach t in array tables loop
        if to_regclass('public.' || t) is null then
            report := report || E'\n JADVAL YO''Q: ' || t;
            continue;
        end if;
        report := report || E'\n ' || t || ': ' || (
            select string_agg(column_name, ', ' order by ordinal_position)
            from information_schema.columns
            where table_schema = 'public' and table_name = t
        );
    end loop;

    -- 2. QOIDALAR
    report := report || E'\n--- qoidalar ---';
    for r in
        select tablename, policyname, cmd,
               array_to_string(roles, '+')         as roles,
               left(coalesce(qual, '-'), 80)       as q,
               left(coalesce(with_check, '-'), 80) as w
        from pg_policies
        where schemaname = 'public' and tablename = any(tables)
        order by tablename, cmd, policyname
    loop
        report := report || format(E'\n %s | %s | %s | %s | using=%s | check=%s',
            r.tablename, r.policyname, r.cmd, r.roles, r.q, r.w);
    end loop;

    -- qoidasi umuman yo'q jadval - RLS yoqilgan bo'lsa u O'LIK
    foreach t in array tables loop
        if to_regclass('public.' || t) is not null
           and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
            report := report || E'\n QOIDASIZ: ' || t;
        end if;
    end loop;

    -- 3. QATORLAR SONI
    report := report || E'\n--- qatorlar soni ---';
    foreach t in array tables loop
        if to_regclass('public.' || t) is not null then
            execute format('select count(*) from public.%I', t) into n;
            report := report || E'\n ' || t || ': ' || n;
        end if;
    end loop;

    raise exception 'NATIJA:%', report;
end
$check$;
