-- =====================================================================
-- SXEMANI CHIQARISH: loyiha fayllarida ta'rifi YO'Q jadvallar uchun DDL
--
-- Ilova 119 ta jadvaldan foydalanadi, ulardan 37 tasi bir vaqtlar
-- Supabase panelida qo'lda yaratilgan va loyiha fayllarida ta'rifi yo'q.
-- Shu so'rov ularning `create table` matnini, indekslarini va
-- cheklovlarini tayyor holda qaytaradi.
--
-- HECH NARSA O'ZGARTIRILMAYDI. Natija bitta xabar bo'lib chiqadi -
-- hammasini nusxalab yuboring, men faylga yozib repoga qo'yaman.
--
-- Agar natija juda uzun bo'lib kesilsa, quyidagi `bolim` raqamini
-- o'zgartirib ikki marta ishga tushiring: 1 (birinchi yarmi), 2 (ikkinchi).
-- =====================================================================

do $dump$
declare
    bolim int := 1;   -- 1 yoki 2
    jadvallar text[] := array[
        'activity_reports', 'activity_tasks', 'award_batches', 'award_rules', 'clubs',
        'competition_audit_logs', 'competition_groups', 'competition_judge_roles',
        'competition_matches', 'competition_rounds', 'competition_scores',
        'competition_tur_schedule', 'competitions', 'debate_match_best_speaker_picks',
        'debate_match_lineups', 'debate_match_notiq_scores', 'debate_matches',
        'debate_penalties', 'documents', 'document_audit_logs',
        'event_collection_items', 'event_collections', 'events', 'memberships',
        'notifications', 'profiles', 'profiles_directory', 'protocol_participants',
        'protocol_signers', 'protocols', 'registration_audit_logs', 'registrations',
        'student_recognitions', 'team_members', 'teams', 'tutor_group_assignments',
        'venues', 'document_counters'
    ];
    t text;
    r record;
    ddl text;
    report text := '';
    i int := 0;
    chegara int;
begin
    chegara := (array_length(jadvallar, 1) + 1) / 2;

    foreach t in array jadvallar loop
        i := i + 1;
        if (bolim = 1 and i > chegara) or (bolim = 2 and i <= chegara) then
            continue;
        end if;

        if to_regclass('public.' || t) is null then
            report := report || E'\n-- JADVAL YO''Q: ' || t;
            continue;
        end if;

        -- ustunlar
        ddl := 'create table if not exists public.' || quote_ident(t) || E' (\n';
        for r in
            select column_name, data_type, udt_name, is_nullable, column_default,
                   character_maximum_length
            from information_schema.columns
            where table_schema = 'public' and table_name = t
            order by ordinal_position
        loop
            ddl := ddl || '    ' || quote_ident(r.column_name) || ' ' ||
                   case when r.data_type = 'USER-DEFINED' then r.udt_name
                        when r.data_type = 'character varying' and r.character_maximum_length is not null
                            then 'varchar(' || r.character_maximum_length || ')'
                        else r.data_type end ||
                   coalesce(' default ' || r.column_default, '') ||
                   case when r.is_nullable = 'NO' then ' not null' else '' end || E',\n';
        end loop;
        ddl := left(ddl, length(ddl) - 2) || E'\n);';
        report := report || E'\n\n-- ===== ' || t || E' =====\n' || ddl;

        -- cheklovlar (primary key, unique, foreign key, check)
        for r in
            select conname, pg_get_constraintdef(oid) as def
            from pg_constraint
            where conrelid = ('public.' || t)::regclass
            order by contype desc, conname
        loop
            report := report || format(E'\nalter table public.%I add constraint %I %s;',
                                       t, r.conname, r.def);
        end loop;

        -- indekslar (cheklov bilan kelganlaridan tashqari)
        for r in
            select indexdef from pg_indexes
            where schemaname = 'public' and tablename = t
              and indexname not in (select conname from pg_constraint
                                    where conrelid = ('public.' || t)::regclass)
        loop
            report := report || E'\n' || r.indexdef || ';';
        end loop;
    end loop;

    raise exception 'NATIJA (bolim %):%', bolim, report;
end
$dump$;
