-- =====================================================================
-- BILDIRISHNOMA, KLUB, SPORT VA ARIZA JADVALLARI (3-guruh, oxirgisi)
--
-- IKKI JIDDIY TESHIK:
--
-- 1. `notifications` - jonli bazada IKKITA ochiq qoida turibdi
--    (`authenticated_access_notifications` va "authenticated read/write
--    notifications"). `rls_notifications.sql` yaratgan tor qoida esa yo'q.
--    Ya'ni login olgan har kim BARCHA bildirishnomalarni o'qiy, o'zgartira
--    va o'chira oladi - "arizangiz qaytarildi", "intizom buzilishi qayd
--    etildi" kabi shaxsiy xabarlarni ham.
--
-- 2. `memberships` - qoidasi `is_platform_admin() OR user_id = auth.uid()`,
--    ya'ni talaba O'ZIGA istalgan klubda `head_coordinator` a'zoligini
--    yozib qo'ya oladi. Bu oddiy teshik emas: rls_documents_attendance.sql
--    dagi `is_club_officer()` aynan shu jadvalga ishonadi, demak bu yo'l
--    bilan talaba klub bayonnomalari va hujjatlariga yozish huquqini
--    olardi. Qoidani buzmasdan (talaba klubga o'zi a'zo bo'la oladi)
--    trigger qo'yiladi: ROL faqat 'member' bo'lishi mumkin, boshqasini
--    faqat administrator yozadi - ilovada ham aynan shunday
--    (assignPosition va admin_approve - ikkalasi ham admin ekrani).
--
-- QOLGANLARI: klub lavozimlari, hujjatlari, a'zolik arizalari, sport
-- jamoalari va nomzodlari, xulq bayroqlari, tadbir vazifalari va
-- hisobotlari, ijtimoiy faollik arizalari, madaniy tashriflar, o'qish
-- seanslari, imkoniyat mosliklari - hammasi `using (true)` edi.
--
-- KIM YOZISHI (kod bo'yicha aniqlandi, 2026-09-16):
--   klub jadvallari      -> xodim yoki O'SHA klub koordinatori
--                           (is_club_officer), talaba esa faqat o'z
--                           arizasini ('PENDING' holatida);
--   tadbir vazifa/hisobot-> can_manage_activity (xodim, klub koordinatori,
--                           musobaqa hakami); talaba O'Z vazifasi holatini
--                           o'zgartira oladi (assignee_id = login);
--   sport jamoalari      -> xodim; nomzodni talaba o'zi ham yubora oladi;
--   xulq bayroqlari      -> xodim yoki YOTOQXONA MUDIRI
--                           (dormitories.responsible_user_id = login);
--   madaniy tashrif      -> talaba o'zinikini kirita oladi, ko'rib chiqishni
--                           esa faqat xodim (aks holda talaba o'z
--                           tashrifini "tasdiqlangan" qilib qo'yardi);
--   o'qish seansi        -> talaba o'zinikini;
--   imkoniyat mosliklari -> faqat xodim (admin panelida qayta hisoblanadi).
--
-- O'QISH: bildirishnoma va madaniy tashrifda ATAYLAB toraytiriladi
-- (shaxsiy ma'lumot). Qolgan jadvallarda o'qish aynan hozirgidek qoladi -
-- eski qoidaning haqiqiy `using` ifodasi bazadan ko'chiriladi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni nusxalab Run.
-- Keyin: supabase/rls_workflow_tables_test.sql ni ALOHIDA Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ESKI YOZISH QOIDALARINI OLIB TASHLASH (o'qishni saqlab)
-- ---------------------------------------------------------------------
do $clean$
declare
    -- o'qishi saqlanadigan jadvallar
    keep_read text[] := array[
        'club_positions', 'club_position_applications', 'club_position_assignments',
        'club_join_requests', 'club_membership_events', 'club_documents',
        'club_achievements', 'sport_teams', 'sport_team_nominations',
        'sport_conduct_flags', 'activity_tasks', 'activity_reports',
        'social_activity_applications', 'student_opportunity_matches', 'reading_sessions'
    ];
    -- o'qishi ATAYLAB toraytiriladigan jadvallar: hamma qoida olib tashlanadi
    narrow_read text[] := array['notifications', 'cultural_visits'];
    t text;
    r record;
    role_list text;
begin
    foreach t in array keep_read loop
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
                               r.policyname || '_read', t, role_list, coalesce(r.qual, 'false'));
            end if;
            execute format('drop policy %I on public.%I', r.policyname, t);
        end loop;
    end loop;

    foreach t in array narrow_read loop
        if to_regclass('public.' || t) is null then continue; end if;
        execute format('alter table public.%I enable row level security', t);
        for r in select policyname from pg_policies
                 where schemaname = 'public' and tablename = t
        loop
            execute format('drop policy %I on public.%I', r.policyname, t);
        end loop;
    end loop;
end
$clean$;

-- ---------------------------------------------------------------------
-- 2. BILDIRISHNOMALAR - faqat o'zinikini
--    Qo'shish ochiq qoladi: talaba ariza yuborganda koordinatorga,
--    koordinator ball berganda talabaga xabar yoziladi.
-- ---------------------------------------------------------------------
-- `user_id` da LOGIN turadi (addNotificationToSupabase `userId: studentId`
-- deb yozadi va u login). Lekin bu tor qoida jonli bazadan yo'qolgan edi,
-- ya'ni amalda hech qachon sinalmagan - shuning uchun uuid shakli ham
-- qabul qilinadi: aks holda bildirishnoma ekranida hech narsa
-- ko'rinmay qolishi mumkin edi.
create policy notifications_read on public.notifications
    for select to authenticated
    using (user_id::text = public.current_username()
           or user_id::text = auth.uid()::text or public.is_staff());
create policy notifications_append on public.notifications
    for insert to authenticated with check (true);
create policy notifications_update_own on public.notifications
    for update to authenticated
    using      (user_id::text = public.current_username()
                or user_id::text = auth.uid()::text or public.is_staff())
    with check (user_id::text = public.current_username()
                or user_id::text = auth.uid()::text or public.is_staff());
create policy notifications_delete_own on public.notifications
    for delete to authenticated
    using (user_id::text = public.current_username()
           or user_id::text = auth.uid()::text or public.is_staff());

-- ---------------------------------------------------------------------
-- 3. KLUB JADVALLARI
-- ---------------------------------------------------------------------
create policy club_positions_w_insert on public.club_positions
    for insert to authenticated with check (public.is_staff() or public.is_club_officer(club_id));
create policy club_positions_w_update on public.club_positions
    for update to authenticated
    using      (public.is_staff() or public.is_club_officer(club_id))
    with check (public.is_staff() or public.is_club_officer(club_id));
create policy club_positions_w_delete on public.club_positions
    for delete to authenticated using (public.is_staff() or public.is_club_officer(club_id));

-- Talaba O'Z arizasini bera oladi ('PENDING'), bekor qila oladi
-- ('CANCELLED'); tasdiqlashni koordinator/admin bajaradi.
create policy club_pos_apps_w_insert on public.club_position_applications
    for insert to authenticated
    with check (public.is_staff() or public.is_club_officer(club_id)
                or (student_id = public.current_username() and status = 'PENDING'));
create policy club_pos_apps_w_update on public.club_position_applications
    for update to authenticated
    using      (public.is_staff() or public.is_club_officer(club_id)
                or student_id = public.current_username())
    with check (public.is_staff() or public.is_club_officer(club_id)
                or (student_id = public.current_username() and status in ('PENDING', 'CANCELLED')));
create policy club_pos_apps_w_delete on public.club_position_applications
    for delete to authenticated using (public.is_staff() or public.is_club_officer(club_id));

create policy club_pos_asg_w_insert on public.club_position_assignments
    for insert to authenticated with check (public.is_staff() or public.is_club_officer(club_id));
create policy club_pos_asg_w_update on public.club_position_assignments
    for update to authenticated
    using      (public.is_staff() or public.is_club_officer(club_id))
    with check (public.is_staff() or public.is_club_officer(club_id));
create policy club_pos_asg_w_delete on public.club_position_assignments
    for delete to authenticated using (public.is_staff() or public.is_club_officer(club_id));

-- A'zolik arizasi: talaba o'zi yuboradi (user_id da auth uuid turadi -
-- ClubProfilePage `user.id || user.username` uzatadi, shuning uchun ikkala
-- shakl ham tekshiriladi), ko'rib chiqishni koordinator bajaradi.
create policy club_join_w_insert on public.club_join_requests
    for insert to authenticated
    with check (public.is_staff() or public.is_club_officer(club_id)
                or user_id = auth.uid()::text or user_id = public.current_username());
create policy club_join_w_update on public.club_join_requests
    for update to authenticated
    using      (public.is_staff() or public.is_club_officer(club_id))
    with check (public.is_staff() or public.is_club_officer(club_id));
create policy club_join_w_delete on public.club_join_requests
    for delete to authenticated using (public.is_staff() or public.is_club_officer(club_id));

-- Tarix yozuvi: qo'shiladi, o'zgarmaydi.
create policy club_mevents_append on public.club_membership_events
    for insert to authenticated with check (true);

create policy club_docs_w_insert on public.club_documents
    for insert to authenticated with check (public.is_staff() or public.is_club_officer(club_id));
create policy club_docs_w_update on public.club_documents
    for update to authenticated
    using      (public.is_staff() or public.is_club_officer(club_id))
    with check (public.is_staff() or public.is_club_officer(club_id));
create policy club_docs_w_delete on public.club_documents
    for delete to authenticated using (public.is_staff() or public.is_club_officer(club_id));

-- Yutuq: kiritgan odam o'zinikini tahrirlaydi/o'chiradi (avvalgi qoida
-- shunday edi va u saqlanadi), lekin endi BOSHQA nom bilan kirita olmaydi.
create policy club_ach_w_insert on public.club_achievements
    for insert to authenticated
    with check (public.is_staff() or public.is_club_officer(club_id)
                or data->>'submittedBy' = public.current_username());
create policy club_ach_w_update on public.club_achievements
    for update to authenticated
    using      (public.is_platform_admin() or data->>'submittedBy' = public.current_username())
    with check (public.is_platform_admin() or data->>'submittedBy' = public.current_username());
create policy club_ach_w_delete on public.club_achievements
    for delete to authenticated
    using (public.is_platform_admin() or data->>'submittedBy' = public.current_username());

-- ---------------------------------------------------------------------
-- 4. SPORT
-- ---------------------------------------------------------------------
create policy sport_teams_w_insert on public.sport_teams
    for insert to authenticated with check (public.is_staff());
create policy sport_teams_w_update on public.sport_teams
    for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy sport_teams_w_delete on public.sport_teams
    for delete to authenticated using (public.is_staff());

-- Talaba o'zini nomzod qilib qo'ya oladi ('pending'), ko'rib chiqishni xodim.
create policy sport_nom_w_insert on public.sport_team_nominations
    for insert to authenticated
    with check (public.is_staff() or public.is_club_officer_any()
                or (student_id = public.current_username() and status = 'pending'));
create policy sport_nom_w_update on public.sport_team_nominations
    for update to authenticated
    using      (public.is_staff() or public.is_club_officer_any())
    with check (public.is_staff() or public.is_club_officer_any());
create policy sport_nom_w_delete on public.sport_team_nominations
    for delete to authenticated using (public.is_staff() or public.is_club_officer_any());

-- Xulq bayrog'ini tyutor (is_staff) yoki yotoqxona mudiri yozadi.
-- Mudir alohida rol emas - u dormitories.responsible_user_id da login
-- sifatida turadi (db.js: dorm.responsibleUserId === viewer.username).
create policy sport_flags_w_insert on public.sport_conduct_flags
    for insert to authenticated
    with check (public.is_staff() or exists (
        select 1 from public.dormitories d
        where d.responsible_user_id = public.current_username()));
create policy sport_flags_w_update on public.sport_conduct_flags
    for update to authenticated
    using      (public.is_staff() or exists (
        select 1 from public.dormitories d
        where d.responsible_user_id = public.current_username()))
    with check (public.is_staff() or exists (
        select 1 from public.dormitories d
        where d.responsible_user_id = public.current_username()));
create policy sport_flags_w_delete on public.sport_conduct_flags
    for delete to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------
-- 5. TADBIR VAZIFALARI VA HISOBOTI
--    Talaba O'Z vazifasining holatini o'zgartira oladi (MyActivityPanel),
--    lekin uni boshqa odamga o'tkaza olmaydi - `with check` shuni ushlaydi.
-- ---------------------------------------------------------------------
create policy activity_tasks_w_insert on public.activity_tasks
    for insert to authenticated
    with check (public.can_manage_activity(activity_type, activity_id));
create policy activity_tasks_w_update on public.activity_tasks
    for update to authenticated
    using      (public.can_manage_activity(activity_type, activity_id)
                or assignee_id = public.current_username())
    with check (public.can_manage_activity(activity_type, activity_id)
                or assignee_id = public.current_username());
create policy activity_tasks_w_delete on public.activity_tasks
    for delete to authenticated using (public.can_manage_activity(activity_type, activity_id));

create policy activity_reports_w_insert on public.activity_reports
    for insert to authenticated
    with check (public.can_manage_activity(activity_type, activity_id));
create policy activity_reports_w_update on public.activity_reports
    for update to authenticated
    using      (public.can_manage_activity(activity_type, activity_id))
    with check (public.can_manage_activity(activity_type, activity_id));
create policy activity_reports_w_delete on public.activity_reports
    for delete to authenticated using (public.can_manage_activity(activity_type, activity_id));

-- ---------------------------------------------------------------------
-- 6. ARIZALAR, TASHRIFLAR, SEANSLAR, MOSLIKLAR
--    Status qiymatlari YOZUVCHI koddan olindi (db.js SOCIAL_APPLICATION_STATUS
--    = 'Pending'/'Approved'/'Rejected'/'Returned'), enumdan emas.
-- ---------------------------------------------------------------------
create policy social_apps_w_insert on public.social_activity_applications
    for insert to authenticated
    with check (public.is_staff()
                or (student_id = public.current_username() and status = 'Pending'));
create policy social_apps_w_update on public.social_activity_applications
    for update to authenticated
    using      (public.is_staff() or student_id = public.current_username())
    with check (public.is_staff()
                or (student_id = public.current_username() and status = 'Pending'));
create policy social_apps_w_delete on public.social_activity_applications
    for delete to authenticated using (public.is_staff());

-- Madaniy tashrif: talaba o'zinikini kiritadi va ko'radi; tasdiqlashni xodim.
create policy cultural_visits_read on public.cultural_visits
    for select to authenticated
    using (student_id = public.current_username() or public.is_staff());
create policy cultural_visits_w_insert on public.cultural_visits
    for insert to authenticated
    with check (public.is_staff() or student_id = public.current_username());
create policy cultural_visits_w_update on public.cultural_visits
    for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy cultural_visits_w_delete on public.cultural_visits
    for delete to authenticated using (public.is_staff());

create policy reading_sessions_w_insert on public.reading_sessions
    for insert to authenticated
    with check (public.is_staff() or student_id = public.current_username());
create policy reading_sessions_w_update on public.reading_sessions
    for update to authenticated
    using      (public.is_staff() or student_id = public.current_username())
    with check (public.is_staff() or student_id = public.current_username());
create policy reading_sessions_w_delete on public.reading_sessions
    for delete to authenticated using (public.is_staff());

create policy som_w_insert on public.student_opportunity_matches
    for insert to authenticated with check (public.is_staff());
create policy som_w_update on public.student_opportunity_matches
    for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy som_w_delete on public.student_opportunity_matches
    for delete to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------
-- 7. A'ZOLIK ROLI - o'zini koordinator qilib qo'yishning oldini olish
--    Qoidalar o'zgarmaydi (talaba klubga o'zi a'zo bo'la oladi), faqat
--    ROL qiymati qo'riqlanadi. `auth.uid() is null` (Supabase paneli,
--    service role) ataylab tegilmaydi.
-- ---------------------------------------------------------------------
create or replace function public.guard_membership_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is not null and not public.is_platform_admin()
       and coalesce(new.role::text, 'member') <> 'member' then
        raise exception 'Klubdagi lavozim rolini faqat administrator bera oladi';
    end if;
    return new;
end $$;

drop trigger if exists memberships_guard_role on public.memberships;
create trigger memberships_guard_role before insert or update on public.memberships
    for each row execute function public.guard_membership_role();

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- TEKSHIRUV 1 - holat. To'g'ri natija: ochiq_yozish faqat
-- club_membership_events va notifications da 1 (ular faqat QO'SHISHGA
-- ochiq), qolgan hamma joyda 0. memberships_guard_role = 1.
-- ---------------------------------------------------------------------
select
    t.tablename as jadval,
    count(*) filter (where p.cmd = 'SELECT')  as oqish,
    count(*) filter (where p.cmd <> 'SELECT') as yozish,
    count(*) filter (where p.cmd <> 'SELECT'
                     and coalesce(p.qual, '') || coalesce(p.with_check, '')
                         !~ '(is_staff|is_platform_admin|is_club_officer|can_manage_activity|current_username|auth\.uid)')
                                              as ochiq_yozish
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
  and t.tablename in ('notifications', 'club_positions', 'club_position_applications',
                      'club_position_assignments', 'club_join_requests', 'club_membership_events',
                      'club_documents', 'club_achievements', 'cultural_visits',
                      'sport_teams', 'sport_team_nominations', 'sport_conduct_flags',
                      'activity_tasks', 'activity_reports', 'social_activity_applications',
                      'student_opportunity_matches', 'reading_sessions')
group by t.tablename
order by t.tablename;
