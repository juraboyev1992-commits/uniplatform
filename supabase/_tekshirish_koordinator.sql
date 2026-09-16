-- =====================================================================
-- KOORDINATOR HUQUQI HAQIQATDAN ISHLAYAPTIMI?
--
-- Oldingi sinov "koordinator" sifatida xodim akkauntini tanlab qolgan edi
-- (u hamma qatorga yozdi), shuning uchun haqiqiy koordinator yo'li
-- sinalmagan. Bu fayl aynan shuni tekshiradi.
--
-- HECH NARSA SAQLANMAYDI: oxirida ataylab xato chiqariladi.
-- Natija bitta xabar bo'lib chiqadi - hammasini nusxalab yuboring.
-- =====================================================================

do $check$
declare
    r record;
    report text := '';
    v_coord uuid;
    v_name  text;
    v_club  text;
    n int;
    ok boolean;
begin
    -- 1. KOORDINATOR A'ZOLIKLARI: user_id da nima turibdi?
    report := report || E'\n--- koordinator a''zoliklari ---';
    for r in
        select m.user_id, m.club_id, m.role,
               (select pr.role::text from public.profiles pr where pr.id::text = m.user_id::text) as profil_roli,
               (select pr.username   from public.profiles pr where pr.id::text = m.user_id::text) as login_id_boyicha,
               (select pr.username   from public.profiles pr where pr.username = m.user_id::text) as login_nom_boyicha
        from public.memberships m
        where m.role::text in ('head_coordinator', 'coordinator')
        order by m.club_id
        limit 25
    loop
        report := report || format(E'\n  klub %s | user_id=%s | profil roli=%s | id bo''yicha login=%s | nom bo''yicha login=%s',
                                   r.club_id, left(r.user_id::text, 20), coalesce(r.profil_roli, 'PROFIL YO''Q'),
                                   coalesce(r.login_id_boyicha, '-'), coalesce(r.login_nom_boyicha, '-'));
    end loop;

    -- 2. BAYONNOMALAR QAYSI KLUBGA TEGISHLI
    report := report || E'\n--- bayonnomalar va ularning klubi ---';
    for r in
        select p.id, p.activity_type, p.activity_id,
               public.activity_club_id(p.activity_type, p.activity_id) as klub
        from public.protocols p limit 10
    loop
        report := report || format(E'\n  %s | %s %s | klub=%s',
                                   left(r.id, 18), r.activity_type, left(r.activity_id, 18),
                                   coalesce(r.klub, 'TOPILMADI'));
    end loop;

    -- 3. TALABA ROLIDAGI HAQIQIY KOORDINATORNI TANLAB SINASH
    select pr.id, pr.username, m.club_id into v_coord, v_name, v_club
      from public.memberships m
      join public.profiles pr on pr.id::text = m.user_id::text
     where m.role::text in ('head_coordinator', 'coordinator')
       and pr.role::text = 'TALABA'
     limit 1;

    if v_coord is null then
        report := report || E'\n--- sinov ---\n  Talaba rolidagi koordinator topilmadi.'
               || E'\n  Ya''ni hozir koordinatorlar xodim akkauntida ishlayapti va'
               || E'\n  koordinator yo''li sinalmagan. Haqiqiy talaba akkaunti'
               || E'\n  koordinator qilinganda shu faylni qayta ishga tushiring.';
    else
        report := report || format(E'\n--- sinov: %s (klub %s) ---', v_name, v_club);
        execute 'set local role authenticated';
        perform set_config('request.jwt.claims',
            json_build_object('sub', v_coord, 'role', 'authenticated')::text, true);

        select public.is_club_officer_any() into ok;
        report := report || E'\n  is_club_officer_any() = ' || ok;
        select public.is_club_officer(v_club) into ok;
        report := report || E'\n  is_club_officer(o''z klubi) = ' || ok;
        select public.is_staff() into ok;
        report := report || E'\n  is_staff() = ' || ok || ' (false bo''lishi kerak)';

        begin
            execute 'update public.protocols set id = id';
            get diagnostics n = row_count;
            report := report || E'\n  bayonnomalarga yoza oldi: ' || n;
        exception when others then
            report := report || E'\n  bayonnomalarga yozuv: xato - ' || sqlerrm;
        end;

        for r in select p.id, p.activity_type, p.activity_id from public.protocols p limit 5 loop
            select public.can_manage_activity(r.activity_type, r.activity_id) into ok;
            report := report || format(E'\n  can_manage_activity(%s, %s) = %s',
                                       r.activity_type, left(r.activity_id, 16), ok);
        end loop;

        execute 'reset role';
    end if;

    raise exception 'NATIJA (hech narsa saqlanmadi):%', report;
end
$check$;
