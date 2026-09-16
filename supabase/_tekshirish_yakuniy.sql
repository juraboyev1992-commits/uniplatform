-- =====================================================================
-- YAKUNIY TEKSHIRUV: hali ham CHEKLOVSIZ yozishga ochiq jadvallar
--
-- Boshida 61 ta jadval ochiq edi. Bu so'rov hozir nechtasi qolganini va
-- ularning qaysi biri ATAYLAB shunday ekanini ko'rsatadi.
--
-- KUTILGAN NATIJA - faqat quyidagilar qolishi kerak:
--   * jurnallar (INSERT): competition_audit_logs, competition_appeal_audit_logs,
--     competition_delegation_audit_logs, competition_group_action_logs,
--     passport_access_logs, talent_audit_logs, club_membership_events,
--     activity_attendance_audit_logs, club_position_audit_logs,
--     document_audit_logs, social_activity_audit_logs, integration_sync_logs,
--     notifications - bularga QO'SHISH ochiq (hakam, koordinator yoki
--     tizim yozadi), lekin o'zgartirish yopiq;
--   * student_recognitions (INSERT) - talaba taklif kirita oladi;
--   * competitions (UPDATE) - talaba ro'yxatdan o'tganda o'sha qatorga
--     yoziladi; maydonlarni guard_competition_core_fields trigger qo'riqlaydi.
--
-- Shu ro'yxatdan TASHQARI nima chiqsa - u tekshirilishi kerak.
-- HECH NARSA O'ZGARTIRILMAYDI.
-- =====================================================================

do $final$
declare
    r record;
    report text := '';
    n int := 0;
    kutilgan text[] := array[
        'competition_audit_logs', 'competition_appeal_audit_logs',
        'competition_delegation_audit_logs', 'competition_group_action_logs',
        'passport_access_logs', 'talent_audit_logs', 'club_membership_events',
        'activity_attendance_audit_logs', 'club_position_audit_logs',
        'document_audit_logs', 'social_activity_audit_logs', 'integration_sync_logs',
        'notifications', 'student_recognitions', 'competitions',
        -- 2026-09-16 da qo'shildi: jurnal faqat to'ldiriladi; jamoa yozuvi esa
        -- talaba taklifni qabul qilganda ilova ichida yaratiladi, shuning uchun
        -- QO'SHISH ataylab ochiq (o'zgartirish va o'chirish cheklangan).
        'registration_audit_logs', 'teams', 'team_members'
    ];
begin
    -- DIQQAT (2026-09-16 da tuzatildi): ilgari bu so'rov faqat `true`
    -- so'zini qidirardi va `auth.role() = 'authenticated'` deb yozilgan
    -- eski qoidalarni UMUMAN ko'rsatmasdi - holbuki ular ham kirgan har
    -- kimga to'liq ruxsat beradi (events, registrations, teams shunday
    -- qolib ketgan edi). Endi tekshiruv SHARTNING TA'SIRI bo'yicha:
    -- qoida hech bo'lmasa bitta shaxsga bog'liq tekshiruvga tayanmasa -
    -- u ochiq hisoblanadi.
    for r in
        select p.tablename, p.policyname, p.cmd,
               coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') as ifoda
        from pg_policies p
        where p.schemaname = 'public'
          and p.cmd <> 'SELECT'
          and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) !~
              '(is_staff|is_platform_admin|is_club_officer|can_manage_activity|current_username|is_competition_judge|is_competition_owner|is_assigned_person_of|is_scholarship_evaluator|auth\.uid)'
        order by (p.tablename = any(kutilgan)), p.tablename, p.cmd
    loop
        n := n + 1;
        report := report || format(E'\n  %s | %s | %s%s',
            r.tablename, r.cmd, r.policyname,
            case when r.tablename = any(kutilgan) then '   (ataylab)' else '   <-- TEKSHIRING' end);
    end loop;

    report := report || format(E'\n\nJami cheklovsiz yozish qoidasi: %s', n);
    report := report || format(E'\nRLS yoqilmagan jadvallar: %s',
        coalesce((select string_agg(c.relname, ', ')
                  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
                  where ns.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), '(yo''q)'));

    raise exception 'NATIJA:%', report;
end
$final$;
