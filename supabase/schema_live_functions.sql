-- =====================================================================
-- JONLI BAZADAGI BARCHA FUNKSIYALAR (public sxemasi)
--
-- 2026-09-16 da jonli bazadan chiqarildi (_sxema_chiqarish_2.sql, bolim 1).
--
-- NEGA KERAK: bu funksiyalarning bir qismi hech qachon loyiha fayllarida
-- bo'lmagan - ular Supabase panelida qo'lda yozilgan va faqat jonli
-- bazada yashagan. Eng muhimlari: `next_doc_number` (hujjat raqami) va
-- `verify_document` (QR tekshiruvi). Bazani yo'qotganda yoki boshqa
-- serverga ko'chirganda ular tiklanmasdi.
--
-- Bu fayl YANGI bazada ishga tushirish uchun: avval jadvallar
-- (schema_live_tables.sql), keyin shu fayl, keyin triggerlar va
-- qoidalar.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.activity_club_id(p_type text, p_id text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select case
        when p_type = 'event' then
            (select e.club_id::text from public.events e where e.id::text = p_id)
        when p_type = 'competition' then
            (select coalesce(
                        case when c.data->>'contextType' = 'club' then c.data->>'contextId' end,
                        c.data->>'clubId')
               from public.competitions c where c.id::text = p_id)
        else null
    end
$function$;

CREATE OR REPLACE FUNCTION public.admin_blocked_user_ids()
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
    if not is_platform_admin() then
        raise exception 'Faqat administrator ko''ra oladi';
    end if;
    return query select u.id from auth.users u
                 where u.banned_until is not null and u.banned_until > now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_user(p_username text, p_password text, p_full_name text DEFAULT ''::text, p_role text DEFAULT 'TALABA'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
declare
    v_id    uuid := gen_random_uuid();
    v_uname text := lower(trim(p_username));
    v_email text;
    v_has_provider_id boolean;
begin
    if not is_platform_admin() then
        raise exception 'Faqat administrator foydalanuvchi yarata oladi';
    end if;
    if coalesce(v_uname, '') = '' then
        raise exception 'Foydalanuvchi nomi kiritilmadi';
    end if;
    if v_uname !~ '^[a-z0-9._-]+$' then
        raise exception 'Foydalanuvchi nomida faqat lotin harflari, raqam va . _ - belgilari bo''lishi mumkin';
    end if;
    if length(coalesce(p_password, '')) < 6 then
        raise exception 'Parol kamida 6 ta belgidan iborat bo''lishi kerak';
    end if;
    if p_role not in ('TALABA', 'ADMINISTRATOR', 'RAHBARIYAT', 'TYUTOR') then
        raise exception 'Noma''lum rol: %', p_role;
    end if;

    v_email := v_uname || '@uniplatform.local';

    if exists (select 1 from auth.users where email = v_email) then
        raise exception 'Bu foydalanuvchi nomi band: %', v_uname;
    end if;
    if exists (select 1 from public.profiles where username = v_uname) then
        raise exception 'Bu foydalanuvchi nomi band: %', v_uname;
    end if;

    insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
        v_email, crypt(p_password, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('username', v_uname, 'full_name', coalesce(p_full_name, '')),
        now(), now(), '', '', '', ''
    );

    select exists (
        select 1 from information_schema.columns
         where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
    ) into v_has_provider_id;

    if v_has_provider_id then
        insert into auth.identities (id, user_id, identity_data, provider, provider_id,
                                     last_sign_in_at, created_at, updated_at)
        values (gen_random_uuid(), v_id,
                jsonb_build_object('sub', v_id::text, 'email', v_email),
                'email', v_id::text, now(), now(), now());
    else
        insert into auth.identities (id, user_id, identity_data, provider,
                                     last_sign_in_at, created_at, updated_at)
        values (v_id::text, v_id,
                jsonb_build_object('sub', v_id::text, 'email', v_email),
                'email', now(), now(), now());
    end if;

    insert into public.profiles (id, username, full_name)
    values (v_id, v_uname, coalesce(p_full_name, ''))
    on conflict (id) do nothing;

    update public.profiles
       set role      = p_role::user_role,
           username  = v_uname,
           full_name = coalesce(nullif(p_full_name, ''), full_name)
     where id = v_id;

    return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare blockers text;
begin
    if not is_platform_admin() then
        raise exception 'Faqat administrator akkaunt o''chira oladi';
    end if;
    if p_user_id = auth.uid() then
        raise exception 'O''z akkauntingizni o''chira olmaysiz';
    end if;

    select string_agg(source || ': ' || cnt, ', ') into blockers
      from public.admin_user_history(p_user_id);

    if blockers is not null then
        raise exception
            'Bu akkauntda tarix bor (%). O''chirish o''rniga BLOKLANG — shunda hujjatlari tekshirilaveradi.',
            blockers;
    end if;

    delete from public.profiles where id = p_user_id;
    delete from auth.identities where user_id = p_user_id;
    delete from auth.users where id = p_user_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_issue_club_certificate(p_club_id text, p_certificate_number text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
    if not public.is_platform_admin() then
        raise exception 'Faqat administrator guvohnoma bera oladi';
    end if;
    update public.clubs
    set data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
        'certificateNumber', p_certificate_number,
        'operationalStatus', 'ACTIVE'
    )
    where id = p_club_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_register_club(p_club_id text, p_registry_number text, p_registered_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
    if not public.is_platform_admin() then
        raise exception 'Faqat administrator klubni ro''yxatdan o''tkaza oladi';
    end if;
    update public.clubs
    set data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
        'registrationStatus', 'REGISTERED',
        'registryNumber', p_registry_number,
        'registeredAt', to_jsonb(p_registered_at)
    )
    where id = p_club_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(p_user_id uuid, p_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
begin
    if not is_platform_admin() then
        raise exception 'Faqat administrator parolni o''zgartira oladi';
    end if;
    if length(coalesce(p_password, '')) < 6 then
        raise exception 'Parol kamida 6 ta belgidan iborat bo''lishi kerak';
    end if;

    update auth.users
       set encrypted_password = crypt(p_password, gen_salt('bf')),
           updated_at = now()
     where id = p_user_id;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_set_user_blocked(p_user_id uuid, p_blocked boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
    if not is_platform_admin() then
        raise exception 'Faqat administrator akkauntni bloklay oladi';
    end if;
    if p_user_id = auth.uid() then
        raise exception 'O''z akkauntingizni bloklay olmaysiz';
    end if;
    update auth.users
       set banned_until = case when p_blocked then 'infinity'::timestamptz else null end
     where id = p_user_id;
    if not found then raise exception 'Foydalanuvchi topilmadi'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
    if not is_platform_admin() then
        raise exception 'Faqat administrator rolni o''zgartira oladi';
    end if;
    if p_role not in ('TALABA', 'ADMINISTRATOR', 'RAHBARIYAT', 'TYUTOR') then
        raise exception 'Noma''lum rol: %', p_role;
    end if;
    if p_user_id = auth.uid() and p_role <> 'ADMINISTRATOR' then
        raise exception 'O''z rolingizni o''zgartira olmaysiz';
    end if;

    update public.profiles set role = p_role::user_role where id = p_user_id;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_user_history(p_user_id uuid)
 RETURNS TABLE(source text, cnt bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    uname text;
    n     bigint;
    i     int;
    -- Jadval -> egasi ustuni -> ko'rsatiladigan nom
    checks text[][] := array[
        ['documents',                   'recipient_id',   'Berilgan hujjatlar'],
        ['registrations',               'user_id',        'Ro''yxatdan o''tishlar'],
        ['activity_attendance',         'participant_id', 'Davomat yozuvlari'],
        ['social_activity_applications','student_id',     'Ijtimoiy faollik arizalari'],
        ['memberships',                 'user_id',        'Klub a''zoligi'],
        ['academic_records',            'student_id',     'Akademik yozuvlar'],
        ['competition_scores',          'student_id',     'Musobaqa natijalari'],
        ['student_recognitions',        'student_id',     'Rag''bat yozuvlari']
    ];
begin
    if not is_platform_admin() then
        raise exception 'Faqat administrator ko''ra oladi';
    end if;

    select username into uname from public.profiles where id = p_user_id;

    for i in 1 .. array_length(checks, 1) loop
        if to_regclass('public.' || checks[i][1]) is null then continue; end if;
        if not exists (
            select 1 from information_schema.columns
            where table_schema = 'public'
              and table_name  = checks[i][1]
              and column_name = checks[i][2]
        ) then continue; end if;

        execute format(
            'select count(*) from public.%I where %I::text in (%L, %L)',
            checks[i][1], checks[i][2], coalesce(uname, '~yo''q~'), p_user_id::text
        ) into n;

        if n > 0 then
            source := checks[i][3];
            cnt := n;
            return next;
        end if;
    end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.announce_activity(p_activity_type text, p_activity_id text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_title    text;
    v_club     text;
    v_reg      boolean := false;
    v_members  boolean := false;
    v_restr    jsonb   := '{}'::jsonb;
    v_fac      jsonb;
    v_crs      jsonb;
    v_gen      text;
    v_prof     text;
    v_head     text;
    v_msg      text;
    inserted   integer := 0;
begin
    if p_activity_type not in ('event', 'competition') then
        raise exception 'Noma''lum faoliyat turi: %', p_activity_type;
    end if;

    if p_activity_type = 'event' then
        select e.title::text, e.club_id::text,
               coalesce(e.registration_required, false),
               coalesce((e.data->>'membersOnly')::boolean, false),
               coalesce(e.data->'restrictions', '{}'::jsonb)
          into v_title, v_club, v_reg, v_members, v_restr
          from public.events e where e.id::text = p_activity_id;
        v_head := 'Yangi tadbir';
    else
        select coalesce(nullif(c.data->>'name', ''), nullif(c.data->>'title', ''), 'Musobaqa'),
               case when c.data->>'contextType' = 'club' then c.data->>'contextId' else null end,
               coalesce((c.data->>'registrationRequired')::boolean, true),
               coalesce((c.data->>'membersOnly')::boolean, false),
               coalesce(c.data->'restrictions', '{}'::jsonb)
          into v_title, v_club, v_reg, v_members, v_restr
          from public.competitions c where c.id::text = p_activity_id;
        v_head := 'Yangi musobaqa';
    end if;

    if v_title is null then
        raise exception 'Faoliyat topilmadi: % %', p_activity_type, p_activity_id;
    end if;

    v_fac  := case when jsonb_typeof(v_restr->'byFaculty') = 'array' then v_restr->'byFaculty' end;
    v_crs  := case when jsonb_typeof(v_restr->'byCourse')  = 'array' then v_restr->'byCourse'  end;
    v_gen  := nullif(v_restr->>'byGender', '');
    v_prof := nullif(v_restr->>'byProfessionalism', '');

    v_msg := case when v_reg
                  then v_title || ' — ro''yxatdan o''tish ochiq'
                  else v_title end;

    if v_club is not null then
        v_head := coalesce(
            (select cl.name from public.clubs cl where cl.id::text = v_club),
            'Klub'
        ) || ': ' || lower(v_head);
    end if;

    with cand as (
        select p.username,
               (v_club is not null and exists (
                    select 1 from public.memberships m
                     where m.club_id::text = v_club
                       and (m.user_id::text = p.username::text or m.user_id::text = p.id::text)
               )) as is_member
          from public.profiles p
         where p.role::text = 'TALABA'
           and (v_fac is null or jsonb_array_length(v_fac) = 0 or p.faculty is null
                or jsonb_exists(v_fac, p.faculty))
           and (v_crs is null or jsonb_array_length(v_crs) = 0 or p.course is null
                or exists (select 1 from jsonb_array_elements_text(v_crs) x where x = p.course::text))
           and (v_gen  is null or p.gender is null          or p.gender = v_gen)
           and (v_prof is null or p.professionalism is null or p.professionalism = v_prof)
    ), audience as (
        select c.username,
               case when c.is_member then 'club_news' else 'new_activity' end as pref,
               c.is_member
          from cand c
         where not v_members or c.is_member
    ), ins as (
        insert into public.notifications (id, user_id, type, title, message, ref_id, ref_type, is_read)
        select 'notif_' || replace(gen_random_uuid()::text, '-', ''),
               a.username, 'info', v_head, v_msg, p_activity_id, p_activity_type, false
          from audience a
         where not exists (
                   select 1 from public.notification_preferences np
                    where np.username::text = a.username::text
                      and np.type_id = a.pref and np.enabled = false
               )
           and not exists (
                   select 1 from public.notifications n
                    where n.user_id::text = a.username::text
                      and n.ref_id::text  = p_activity_id
                      and n.ref_type      = p_activity_type
               )
        returning 1
    )
    select count(*) into inserted from ins;

    return inserted;
end;
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_activity(p_type text, p_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select public.is_staff()
        or public.is_club_officer(public.activity_club_id(p_type, p_id))
        or (p_type = 'competition'
            and (public.is_competition_judge(p_id) or public.is_competition_owner(p_id)))
$function$;

CREATE OR REPLACE FUNCTION public.current_username()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select username from public.profiles where id::text = auth.uid()::text
$function$;

CREATE OR REPLACE FUNCTION public.force_default_role()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
    new.role := 'TALABA';
    return new;
end $function$;

CREATE OR REPLACE FUNCTION public.guard_competition_core_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
    if public.is_competition_judge(new.id) or public.is_platform_admin() then
        return new;
    end if;

    if (new.data->'judges'            is distinct from old.data->'judges')
       or (new.data->>'ownerUsername'   is distinct from old.data->>'ownerUsername')
       or (new.data->'criteria'         is distinct from old.data->'criteria')
       or (new.data->'roundRules'       is distinct from old.data->'roundRules')
       or (new.data->'stages'           is distinct from old.data->'stages')
       or (new.data->>'scoringMethod'   is distinct from old.data->>'scoringMethod')
       or (new.data->>'moderationStatus' is distinct from old.data->>'moderationStatus')
    then
        raise exception 'Musobaqa qoidalarini va hakamlar ro''yxatini faqat tashkilotchi o''zgartira oladi';
    end if;

    return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.guard_membership_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
    if auth.uid() is not null and not public.is_platform_admin()
       and coalesce(new.role::text, 'member') <> 'member' then
        raise exception 'Klubdagi lavozim rolini faqat administrator bera oladi';
    end if;
    return new;
end $function$;

CREATE OR REPLACE FUNCTION public.guard_profile_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
    if auth.uid() is not null and not public.is_platform_admin()
       and (new.role is distinct from old.role or new.username is distinct from old.username) then
        raise exception 'Rol va loginni faqat administrator o''zgartira oladi';
    end if;
    return new;
end $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id, username, full_name)
  values (new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'full_name');
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.is_assigned_person_of(target_student text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select exists (
        select 1 from public.talent_assignments a
        where a.active
          and a.student_id = target_student
          and a.person_id = public.current_username()
    )
$function$;

CREATE OR REPLACE FUNCTION public.is_club_officer(p_club_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select p_club_id is not null and exists (
        select 1 from public.memberships m
        where m.club_id::text = p_club_id
          and m.user_id::text = auth.uid()::text
          and m.role::text in ('head_coordinator', 'coordinator')
    )
$function$;

CREATE OR REPLACE FUNCTION public.is_club_officer_any()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select exists (
        select 1 from public.memberships m
        where m.user_id::text = auth.uid()::text
          and m.role::text in ('head_coordinator', 'coordinator')
    )
$function$;

CREATE OR REPLACE FUNCTION public.is_competition_judge(comp_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select comp_id is not null and (
        exists (
            select 1 from public.competitions c
            where c.id = comp_id
              and (
                  c.data->>'ownerUsername' = public.current_username()
                  or jsonb_exists(coalesce(c.data->'judges', '[]'::jsonb), public.current_username())
              )
        )
        or exists (
            select 1 from public.competition_delegations d
            where d.competition_id = comp_id
              and d.active
              and d.grantee_username = public.current_username()
        )
    )
$function$;

CREATE OR REPLACE FUNCTION public.is_competition_owner(comp_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select comp_id is not null and exists (
        select 1 from public.competitions c
        where c.id = comp_id
          and c.data->>'ownerUsername' = public.current_username()
    )
$function$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select exists (
        select 1 from public.profiles
        where id::text = auth.uid()::text
          and role::text = 'ADMINISTRATOR'
    );
$function$;

CREATE OR REPLACE FUNCTION public.is_scholarship_evaluator()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select exists (
        select 1
        from public.scholarship_settings s
        cross join lateral jsonb_array_elements(
            coalesce(s.data->'facultyEvaluators', '[]'::jsonb)
            || coalesce(s.data->'centralEvaluators', '[]'::jsonb)
        ) as e
        where s.id = 'default'
          and e->>'username' = public.current_username()
    )
$function$;

CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select exists (
        select 1 from public.profiles
        where id::text = auth.uid()::text
          and role::text in ('ADMINISTRATOR', 'RAHBARIYAT', 'TYUTOR')
    )
$function$;

CREATE OR REPLACE FUNCTION public.next_doc_number(p_scope text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v integer;
begin
    insert into document_counters (scope, value) values (p_scope, 1)
    on conflict (scope) do update set value = document_counters.value + 1
    returning value into v;
    return v;
end;
$function$;

CREATE OR REPLACE FUNCTION public.review_student_recognition(p_id text, p_status text, p_reviewed_by text, p_comment text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
    if not is_platform_admin() then
        raise exception 'Faqat admin tasdiqlashi mumkin';
    end if;
    if p_status not in ('approved', 'rejected') then
        raise exception 'Notogri holat';
    end if;
    update student_recognitions
        set status = p_status, reviewed_by = p_reviewed_by, reviewed_at = now(), review_comment = p_comment
        where id = p_id and status = 'pending';
end;
$function$;

CREATE OR REPLACE FUNCTION public.send_activity_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
    inserted integer := 0;
begin
    with due as (
        select
            e.id   as event_id,
            e.title,
            e.date,
            e.location,
            r.user_id
        from public.events e
        join public.registrations r
             on r.activity_id = e.id
            and r.activity_type = 'event'
            and r.status = 'registered'
        where e.status <> 'completed'
          and e.date::date = (now() at time zone 'Asia/Tashkent')::date + 1
          and not exists (
              select 1 from public.notifications n
              where n.user_id = r.user_id
                and n.ref_id = e.id
                and n.ref_type = 'event'
                and n.title = 'Ertaga tadbir'
          )
    ), ins as (
        insert into public.notifications (id, user_id, type, title, message, ref_id, ref_type, is_read)
        select
            'notif_' || replace(gen_random_uuid()::text, '-', ''),
            d.user_id,
            'info',
            'Ertaga tadbir',
            d.title
                || coalesce(' — ' || to_char(d.date, 'HH24:MI'), '')
                || coalesce(', ' || d.location, ''),
            d.event_id,
            'event',
            false
        from due d
        returning 1
    )
    select count(*) into inserted from ins;

    return inserted;
end;
$function$;

CREATE OR REPLACE FUNCTION public.send_incomplete_team_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    inserted integer := 0;
    today    date := (now() at time zone 'Asia/Tashkent')::date;
begin
    with activities as (
        select e.id::text          as activity_id,
               'event'::text       as ref_type,
               e.title::text       as title,
               e.date::timestamptz as starts_at
        from public.events e
        where e.date is not null
          and e.status::text is distinct from 'completed'

        union all

        select c.id::text, 'competition'::text,
               coalesce(nullif(c.data->>'name', ''), nullif(c.data->>'title', ''), 'Musobaqa')::text,
               (c.data->>'startDate')::timestamptz
        from public.competitions c
        where c.data->>'startDate' is not null
          and coalesce(c.data->>'status', '') <> 'completed'
    ),
    due as (
        select a.activity_id, a.ref_type, a.title,
               (a.starts_at at time zone 'Asia/Tashkent')::date - today as days_left
        from activities a
        where (a.starts_at at time zone 'Asia/Tashkent')::date - today in (1, 3)
    ),
    teams as (
        select r.id as reg_id, r.user_id::text as captain, r.team_name, r.team_members,
               coalesce(r.min_team_size, 0) as need,
               (select count(*) from jsonb_array_elements(r.team_members) m
                 where m->>'status' = 'accepted') + 1 as accepted,
               d.activity_id, d.ref_type, d.title, d.days_left
        from public.registrations r
        join due d on d.activity_id = r.activity_id::text and d.ref_type = r.activity_type
        where r.participant_type = 'team'
          and r.team_confirmed_at is null
          and r.status <> 'cancelled'
    ),
    short as (select * from teams where need > 0 and accepted < need),
    invitees as (
        select s.activity_id, s.ref_type, s.title, s.days_left,
               (m->>'userId')::text as username,
               case when s.days_left = 1
                    then 'Jamoa taklifi javobsiz — ertaga'
                    else 'Jamoa taklifi javobsiz — 3 kun qoldi' end as reminder_title,
               coalesce(s.team_name, 'Jamoa') || ' — ' || s.title
                   || '. Javobingiz kutilmoqda, aks holda jamoa qatnasha olmaydi.' as body
        from short s, jsonb_array_elements(s.team_members) m
        where m->>'status' = 'pending'
    ),
    captains as (
        select s.activity_id, s.ref_type, s.title, s.days_left,
               s.captain as username,
               case when s.days_left = 1
                    then 'Jamoangiz to''lmagan — ertaga'
                    else 'Jamoangiz to''lmagan — 3 kun qoldi' end as reminder_title,
               coalesce(s.team_name, 'Jamoangiz') || ': ' || s.accepted || '/' || s.need
                   || ' a''zo. Yana ' || (s.need - s.accepted)
                   || ' kishi taklifni qabul qilishi kerak, aks holda jamoa ro''yxatga tushmaydi.' as body
        from short s
    ),
    everyone as (select * from invitees union all select * from captains),
    targets as (
        select e.* from everyone e
        where e.username is not null
          and not exists (
                  select 1 from public.notification_preferences np
                  where np.username::text = e.username
                    and np.type_id = 'application_status' and np.enabled = false
              )
          and not exists (
                  select 1 from public.notifications n
                  where n.user_id::text = e.username
                    and n.ref_id::text  = e.activity_id
                    and n.ref_type      = e.ref_type
                    and n.title         = e.reminder_title
              )
    ), ins as (
        insert into public.notifications (id, user_id, type, title, message, ref_id, ref_type, is_read)
        select 'notif_' || replace(gen_random_uuid()::text, '-', ''),
               t.username, 'warning', t.reminder_title, t.body, t.activity_id, t.ref_type, false
        from targets t
        returning 1
    )
    select count(*) into inserted from ins;

    return inserted;
end;
$function$;

CREATE OR REPLACE FUNCTION public.send_registration_deadline_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    inserted integer := 0;
    today    date := (now() at time zone 'Asia/Tashkent')::date;
begin
    with activities as (
        select
            e.id::text                            as activity_id,
            'event'::text                         as ref_type,
            e.title::text                         as title,
            e.registration_closes_at::timestamptz as closes_at,
            e.club_id::text                       as club_id
        from public.events e
        where e.registration_closes_at is not null
          and e.status <> 'completed'

        union all

        select
            c.id::text,
            'competition'::text,
            coalesce(c.data->>'name', c.data->>'title', 'Musobaqa')::text,
            (c.data->>'registrationClosesAt')::timestamptz,
            (case when c.data->>'contextType' = 'club'
                  then c.data->>'contextId' else null end)::text
        from public.competitions c
        where c.data->>'registrationClosesAt' is not null
          and coalesce(c.data->>'status', '') <> 'completed'
    ),
    due as (
        select a.*,
            case (a.closes_at at time zone 'Asia/Tashkent')::date - today
                when 3 then 'Ro''yxat 3 kundan keyin yopiladi'
                when 1 then 'Ro''yxat ertaga yopiladi'
            end as reminder_title
        from activities a
        where (a.closes_at at time zone 'Asia/Tashkent')::date - today in (1, 3)
    ),
    targets as (
        select d.activity_id, d.ref_type, d.title, d.reminder_title, p.username
        from due d
        join public.profiles p on p.role::text = 'TALABA'
        where not exists (
                  select 1 from public.registrations r
                  where r.activity_id::text = d.activity_id
                    and r.activity_type = d.ref_type
                    and (r.user_id::text = p.username::text or r.user_id::text = p.id::text)
                    and r.status = 'registered')
          and not exists (
                  select 1 from public.notification_preferences np
                  where np.username::text = p.username::text
                    and np.type_id = 'registration_deadline'
                    and np.enabled = false)
          and (d.club_id is null or exists (
                  select 1 from public.memberships m
                  where m.club_id::text = d.club_id
                    and (m.user_id::text = p.username::text or m.user_id::text = p.id::text)))
          and not exists (
                  select 1 from public.notifications n
                  where n.user_id::text = p.username::text
                    and n.ref_id::text = d.activity_id
                    and n.ref_type = d.ref_type
                    and n.title = d.reminder_title)
    ), ins as (
        insert into public.notifications (id, user_id, type, title, message, ref_id, ref_type, is_read)
        select 'notif_' || replace(gen_random_uuid()::text, '-', ''),
               t.username, 'info', t.reminder_title,
               t.title || ' — ro''yxatdan o''tishni kechiktirmang',
               t.activity_id, t.ref_type, false
        from targets t
        returning 1
    )
    select count(*) into inserted from ins;
    return inserted;
end;
$function$;

CREATE OR REPLACE FUNCTION public.verify_club(p_registry_number text)
 RETURNS TABLE(registry_number text, club_name text, club_type text, direction text, registration_status text, registered_at timestamp with time zone, certificate_number text, certificate_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    select
        c.data->>'registryNumber',
        c.name,
        c.data->>'clubType',
        c.category,
        c.data->>'registrationStatus',
        (c.data->>'registeredAt')::timestamptz,
        cert.certificate_number,
        cert.status
    from public.clubs c
    left join lateral (
        select certificate_number, status
        from public.club_certificates
        where club_id = c.id
        order by issued_at desc
        limit 1
    ) cert on true
    where c.data->>'registryNumber' = p_registry_number
$function$;

CREATE OR REPLACE FUNCTION public.verify_document(p_token text)
 RETURNS TABLE(registration_number text, document_type text, status text, recipient_name text, activity_name text, achievement text, issued_at text, organization text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select d.registration_number, d.document_type, d.status,
           d.data->>'recipientName', d.data->>'activityName', d.data->>'achievement',
           d.data->>'issuedAt',
           coalesce(d.data->>'organization', 'Toshkent davlat yuridik universiteti')
    from documents d
    where d.verification_token = p_token and d.status in ('issued', 'revoked');
$function$;
