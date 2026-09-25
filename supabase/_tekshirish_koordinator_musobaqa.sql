-- =====================================================================
-- KOORDINATOR MUSOBAQAGA BALL QO'YA OLADIMI?
--
-- `rls_club_coordinator_competitions.sql` dan KEYIN ishga tushiriladi.
--
-- Bu fayl haqiqiy koordinator akkauntining o'rniga o'tib (impersonatsiya)
-- savolga ANIQ javob beradi. Brauzer kerak emas.
--
-- HECH NARSA SAQLANMAYDI: oxirida ataylab xato chiqariladi va butun
-- tranzaksiya bekor qilinadi. Natija bitta xabar bo'lib chiqadi -
-- hammasini nusxalab yuboring.
-- =====================================================================

do $check$
declare
    r          record;
    report     text := '';
    v_uid      uuid;
    v_login    text;
    v_club     text;
    v_comp     text;
    v_compname text;
    ok         boolean;
    n_coord    int;
    n_comp     int;
begin
    -- ---------------------------------------------------------------
    -- 1. KOORDINATORLAR HAQIQIY AKKAUNTGA BOG'LANGANMI?
    --
    -- `is_club_officer` `memberships.user_id` ni `auth.uid()` bilan
    -- solishtiradi. Agar a'zolik qatori haqiqiy profil uuid siga emas,
    -- eski ichki raqamga yozilgan bo'lsa - qoida HECH QACHON ishlamaydi.
    -- ---------------------------------------------------------------
    select count(*) into n_coord
    from public.memberships m
    where m.role::text in ('head_coordinator', 'coordinator');
    report := report || format(E'\n1. Koordinator a''zoliklari: %s ta', n_coord);

    for r in
        select m.club_id, m.user_id,
               (select pr.username from public.profiles pr where pr.id::text = m.user_id::text) as login
        from public.memberships m
        where m.role::text in ('head_coordinator', 'coordinator')
        order by m.club_id
        limit 15
    loop
        report := report || format(E'\n   klub %s -> %s',
            r.club_id,
            coalesce(r.login, 'PROFIL TOPILMADI (' || left(r.user_id::text, 12) || ')'));
    end loop;

    -- ---------------------------------------------------------------
    -- 2. KLUBGA TEGISHLI MUSOBAQALAR TOPILAYAPTIMI?
    -- ---------------------------------------------------------------
    select count(*) into n_comp
    from public.competitions c
    where public.activity_club_id('competition', c.id::text) is not null;
    report := report || format(E'\n\n2. Klubga bog''langan musobaqalar: %s ta', n_comp);

    for r in
        select c.id::text as id, c.name,
               public.activity_club_id('competition', c.id::text) as klub,
               c.data->>'ownerUsername' as egasi
        from public.competitions c
        where public.activity_club_id('competition', c.id::text) is not null
        order by c.name
        limit 10
    loop
        report := report || format(E'\n   "%s" | klub %s | egasi %s',
            left(r.name, 28), r.klub, coalesce(r.egasi, '-'));
    end loop;

    -- ---------------------------------------------------------------
    -- 3. ASOSIY SINOV
    --
    -- Koordinator O'ZI YARATMAGAN musobaqa tanlanadi - aynan shu holat
    -- ilgari ishlamasdi. Topilmasa, istalgan musobaqasi olinadi.
    -- ---------------------------------------------------------------
    select m.user_id::uuid, pr.username, m.club_id::text
      into v_uid, v_login, v_club
    from public.memberships m
    join public.profiles pr on pr.id::text = m.user_id::text
    where m.role::text in ('head_coordinator', 'coordinator')
      and exists (
          select 1 from public.competitions c
          where public.activity_club_id('competition', c.id::text) = m.club_id::text
      )
    limit 1;

    if v_uid is null then
        report := report || E'\n\n3. SINOV O''TKAZILMADI: haqiqiy profilga bog''langan va'
                         || E'\n   musobaqasi bor koordinator topilmadi.';
    else
        select c.id::text, c.name into v_comp, v_compname
        from public.competitions c
        where public.activity_club_id('competition', c.id::text) = v_club
        order by (c.data->>'ownerUsername' is distinct from v_login) desc
        limit 1;

        report := report || format(
            E'\n\n3. SINOV\n   koordinator: %s (klub %s)\n   musobaqa:    "%s"\n   egasi:       %s',
            v_login, v_club, left(v_compname, 30),
            coalesce((select c.data->>'ownerUsername' from public.competitions c
                      where c.id::text = v_comp), '-'));

        -- Shu foydalanuvchi bo'lib ko'ramiz.
        execute 'set local role authenticated';
        perform set_config('request.jwt.claims',
                           json_build_object('sub', v_uid::text, 'role', 'authenticated')::text,
                           true);

        select public.is_club_officer(v_club) into ok;
        report := report || format(E'\n   is_club_officer(o''z klubi)      = %s', ok);

        select public.is_competition_judge(v_comp) into ok;
        report := report || format(E'\n   is_competition_judge(musobaqa)  = %s  (eski qoida)', ok);

        select public.can_manage_competition(v_comp) into ok;
        report := report || format(E'\n   can_manage_competition(musobaqa)= %s  <-- ASOSIY JAVOB', ok);

        -- Haqiqiy yozuv urinishi: mavjud natija qatorini o'ziga tegmasdan
        -- yangilaymiz. Qoida rad etsa - 0 qator o'zgaradi yoki xato chiqadi.
        begin
            execute format(
                'update public.competition_scores set competition_id = competition_id '
                || 'where competition_id = %L', v_comp);
            get diagnostics n_comp = row_count;
            report := report || format(E'\n   natijalarga yozuv: %s qator o''zgardi', n_comp);
        exception when others then
            report := report || E'\n   natijalarga yozuv: XATO - ' || sqlerrm;
        end;

        execute 'reset role';
    end if;

    raise exception 'NATIJA (hech narsa saqlanmadi):%', report;
end
$check$;
