-- =====================================================================
-- TADBIR, RO'YXATDAN O'TISH VA JAMOALAR - OXIRGI OCHIQ JADVALLAR
--
-- QANDAY QOLIB KETGAN: bu beshta jadvalning qoidasi `using (true)` emas,
-- `auth.role() = 'authenticated'` deb yozilgan (Supabase panelida, ancha
-- oldin). Natija bir xil - kirgan har kimga to'liq ruxsat - lekin mening
-- yakuniy tekshiruv so'rovim aynan `true` so'zini qidirgani uchun ularni
-- ko'rsatmadi. Sxema nusxasini olayotganda ko'rindi.
--
-- HOZIR NIMA MUMKIN: istalgan talaba API orqali istalgan tadbirni
-- tahrirlashi yoki o'chirishi, begona ro'yxatdan o'tishni bekor qilishi,
-- jamoa tarkibini o'zgartirishi mumkin.
--
-- KIM YOZISHI (kod bo'yicha aniqlandi):
--   events        -> admin (EventManagement), klub koordinatori
--                    (ClubProfilePage: canManageThisClub), tyutor
--                    (TutorExcursionsPanel: ekskursiya) => is_staff()
--                    yoki is_club_officer(club_id);
--   registrations -> TALABANING O'ZI (user_id = login), jamoa a'zosi
--                    taklifga javob berganda KAPITANNING qatori
--                    yangilanadi (team_members ichida login turadi),
--                    tashkilotchi esa qo'lda qo'shadi va tasdiqlaydi;
--   registration_audit_logs -> faqat qo'lda qo'shishda yoziladi;
--   teams, team_members     -> ilova ichida, talaba taklifni qabul
--                    qilganda ham yoziladi (_materializeTeamFromRegistration),
--                    shuning uchun QO'SHISH ochiq qoladi, o'zgartirish va
--                    o'chirish esa xodim/koordinatorga.
--
-- KOD BILAN JAMOAGA QO'SHILISH ATAYLAB TO'SILADI (2026-09-16, egasining
-- qarori: "kod bilan qo'shilish kerak emas"). `joinTeamByCode` kapitanning
-- qatorini yangilaydi, lekin qo'shilayotgan talaba o'sha paytda hali
-- `team_members` ro'yxatida yo'q - shuning uchun quyidagi qoida uni
-- o'tkazmaydi. TAKLIF ORQALI qo'shilish ishlayveradi: taklif qilingan
-- talaba `team_members` ichida turadi.
--
-- Oqibati: "Kod bilan qo'shilish" maydoni ilovada hali ko'rinadi va
-- bosilganda xatolik beradi. Uni yashirish - alohida kichik ish (ilova
-- kodi o'zgaradi, qayta joylash kerak).
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni nusxalab Run.
-- Keyin: supabase/rls_events_registrations_test.sql ni ALOHIDA Run.
-- =====================================================================

do $guard$
begin
    if to_regprocedure('public.can_manage_activity(text, text)') is null
       or to_regprocedure('public.is_club_officer(text)') is null then
        raise exception 'Avval supabase/rls_documents_attendance.sql ni ishga tushiring.';
    end if;
end
$guard$;

-- ---------------------------------------------------------------------
-- 1. ESKI QOIDALARNI OLIB TASHLASH (o'qishni saqlab)
-- ---------------------------------------------------------------------
do $clean$
declare
    tables text[] := array['events', 'registrations', 'registration_audit_logs',
                           'teams', 'team_members'];
    t text;
    r record;
    role_list text;
begin
    foreach t in array tables loop
        if to_regclass('public.' || t) is null then
            raise notice 'jadval topilmadi: %', t;
            continue;
        end if;
        execute format('alter table public.%I enable row level security', t);
        for r in
            select policyname, cmd, roles, qual
            from pg_policies
            where schemaname = 'public' and tablename = t and cmd <> 'SELECT'
        loop
            if r.cmd = 'ALL' then
                select string_agg(quote_ident(x), ', ') into role_list from unnest(r.roles) x;
                execute format('drop policy if exists %I on public.%I', r.policyname || '_read', t);
                execute format('create policy %I on public.%I for select to %s using (%s)',
                               r.policyname || '_read', t, role_list, coalesce(r.qual, 'true'));
            end if;
            execute format('drop policy %I on public.%I', r.policyname, t);
        end loop;
    end loop;
end
$clean$;

-- ---------------------------------------------------------------------
-- 2. TADBIRLAR
--    Yaratishda hali qator yo'q, shuning uchun klub ustuni bo'yicha.
-- ---------------------------------------------------------------------
create policy events_w_insert on public.events
    for insert to authenticated
    with check (public.is_staff() or public.is_club_officer(club_id));
create policy events_w_update on public.events
    for update to authenticated
    using      (public.is_staff() or public.is_club_officer(club_id))
    with check (public.is_staff() or public.is_club_officer(club_id));
create policy events_w_delete on public.events
    for delete to authenticated
    using (public.is_staff() or public.is_club_officer(club_id));

-- ---------------------------------------------------------------------
-- 3. RO'YXATDAN O'TISH
--    `user_id` da LOGIN turadi (UI hamma joyda user.username uzatadi).
--    Jamoa taklifiga javob berilganda KAPITANNING qatori yangilanadi,
--    shuning uchun `team_members` ichidagi login ham tekshiriladi.
-- ---------------------------------------------------------------------
create policy reg_w_insert on public.registrations
    for insert to authenticated
    with check (user_id = public.current_username()
                or public.can_manage_activity(activity_type, activity_id));

create policy reg_w_update on public.registrations
    for update to authenticated
    using (user_id = public.current_username()
           or public.can_manage_activity(activity_type, activity_id)
           or exists (select 1 from jsonb_array_elements(coalesce(team_members, '[]'::jsonb)) m
                      where m->>'userId' = public.current_username()))
    with check (user_id = public.current_username()
                or public.can_manage_activity(activity_type, activity_id)
                or exists (select 1 from jsonb_array_elements(coalesce(team_members, '[]'::jsonb)) m
                           where m->>'userId' = public.current_username()));

create policy reg_w_delete on public.registrations
    for delete to authenticated
    using (public.can_manage_activity(activity_type, activity_id));

-- Jurnal: faqat qo'shish, o'zgartirish yo'q.
create policy reg_logs_append on public.registration_audit_logs
    for insert to authenticated with check (true);

-- ---------------------------------------------------------------------
-- 4. JAMOALAR
--    Qo'shish ochiq qoladi: jamoa talaba taklifni qabul qilganda ilova
--    ichida yaratiladi (_materializeTeamFromRegistration). O'zgartirish
--    va o'chirish esa xodim yoki klub koordinatoriga.
-- ---------------------------------------------------------------------
create policy teams_w_insert on public.teams
    for insert to authenticated with check (true);
create policy teams_w_update on public.teams
    for update to authenticated
    using      (public.is_staff() or public.is_club_officer(club_id))
    with check (public.is_staff() or public.is_club_officer(club_id));
create policy teams_w_delete on public.teams
    for delete to authenticated
    using (public.is_staff() or public.is_club_officer(club_id));

create policy team_members_w_insert on public.team_members
    for insert to authenticated with check (true);
create policy team_members_w_update on public.team_members
    for update to authenticated
    using      (public.is_staff() or public.is_club_officer((select t.club_id from public.teams t where t.id = team_id)))
    with check (public.is_staff() or public.is_club_officer((select t.club_id from public.teams t where t.id = team_id)));
create policy team_members_w_delete on public.team_members
    for delete to authenticated
    using (public.is_staff()
           or public.is_club_officer((select t.club_id from public.teams t where t.id = team_id))
           or user_id = public.current_username());

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- TEKSHIRUV - holat. To'g'ri natija: `auth.role` ishlatadigan qoida
-- qolmasin; ochiq_yozish faqat registration_audit_logs, teams va
-- team_members da 1 (ular ataylab QO'SHISHGA ochiq).
-- ---------------------------------------------------------------------
select
    t.tablename as jadval,
    count(*) filter (where p.cmd = 'SELECT')  as oqish,
    count(*) filter (where p.cmd <> 'SELECT') as yozish,
    count(*) filter (where p.cmd <> 'SELECT'
                     and coalesce(p.qual, '') || coalesce(p.with_check, '')
                         !~ '(is_staff|is_platform_admin|is_club_officer|can_manage_activity|current_username)')
                                              as ochiq_yozish,
    count(*) filter (where coalesce(p.qual, '') || coalesce(p.with_check, '') like '%auth.role%') as eski_qoida
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
  and t.tablename in ('events', 'registrations', 'registration_audit_logs', 'teams', 'team_members')
group by t.tablename
order by t.tablename;
