-- ============================================================================
-- KLUB KOORDINATORI O'Z KLUBI MUSOBAQASINI BOSHQARA OLSIN
--
-- MUAMMO: interfeys koordinatorga "Natija kiritish" tabini ko'rsatardi,
-- baza esa yozishni rad etardi. `competition_scores` qoidasi faqat uchtasini
-- taniydi: musobaqa EGASI, HAKAMLAR ro'yxatidagi login va VAKOLAT berilgan
-- shaxs. Klub koordinatori bo'lish bu ro'yxatda yo'q edi.
--
-- Natijada: koordinator musobaqani O'ZI yaratgan bo'lsa ishlardi (u egasi),
-- admin yaratgan bo'lsa - tab ko'rinardi, lekin saqlash rad etilardi.
--
-- QOIDA ENDI: musobaqa klubga tegishli bo'lsa, O'SHA KLUBNING koordinatori
-- uni boshqara oladi - kim yaratganidan qat'i nazar. Administrator esa
-- avvalgidek hammasini boshqaradi (`is_platform_admin()` har bir qoidada
-- allaqachon bor, unga tegilmaydi).
--
-- ESKI MUSOBAQALAR HAM QAMRALADI: klub `activity_club_id` orqali topiladi,
-- u esa yangi `contextId` ni ham, eski `clubId` maydonini ham o'qiydi.
--
-- TADBIRLARGA TEGILMAYDI: u yerda bu allaqachon ishlaydi -
-- `guard_event_core_fields` ichida `is_club_officer(new.club_id)` bor.
--
-- BITTA ISTISNO - `moderationStatus`. Koordinator musobaqaning qolgan
-- hamma narsasini o'zgartira oladi, lekin o'z musobaqasini "tasdiqlangan"
-- holatiga O'ZI o'tkaza olmaydi. Aks holda tasdiqlash tartibi ma'nosini
-- yo'qotardi: har kim o'zini o'zi tasdiqlayverardi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni Run.
-- ============================================================================

do $guard$
begin
    if to_regprocedure('public.is_competition_judge(text)') is null
       or to_regprocedure('public.is_club_officer(text)') is null
       or to_regprocedure('public.activity_club_id(text,text)') is null then
        raise exception
            'Avval supabase/rls_competition_integrity.sql va rls_documents_attendance.sql ni ishga tushiring.';
    end if;
end
$guard$;

-- ---------------------------------------------------------------------
-- 1. YANGI YORDAMCHI
--
-- `is_competition_judge` ning o'ziga tegilmaydi: u "hakam" degan aniq
-- ma'noga ega va boshqa joylarda ham o'qiladi. Yangi funksiya undan
-- kengroq savolga javob beradi: "bu odam shu musobaqani boshqara oladimi".
-- ---------------------------------------------------------------------
create or replace function public.can_manage_competition(comp_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select comp_id is not null and (
        public.is_competition_judge(comp_id)
        or public.is_club_officer(public.activity_club_id('competition', comp_id))
    )
$$;

revoke all on function public.can_manage_competition(text) from public, anon;
grant execute on function public.can_manage_competition(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. MUSOBAQA QATORINING O'ZI
--
-- Koordinator qoidalarni, hakamlarni va bosqichlarni o'zgartira oladi,
-- lekin `moderationStatus` ga tegolmaydi.
-- ---------------------------------------------------------------------
create or replace function public.guard_competition_core_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $trg$
begin
    -- Administrator, egasi va hakam - to'liq huquq (avvalgidek).
    if public.is_competition_judge(new.id) or public.is_platform_admin() then
        return new;
    end if;

    -- Klub koordinatori - hammasi, `moderationStatus` dan tashqari.
    if public.is_club_officer(public.activity_club_id('competition', new.id)) then
        if new.data->>'moderationStatus' is distinct from old.data->>'moderationStatus' then
            raise exception
                'Musobaqa holatini faqat administrator o''zgartiradi';
        end if;
        return new;
    end if;

    if (new.data->'judges'             is distinct from old.data->'judges')
       or (new.data->>'ownerUsername'    is distinct from old.data->>'ownerUsername')
       or (new.data->'criteria'          is distinct from old.data->'criteria')
       or (new.data->'roundRules'        is distinct from old.data->'roundRules')
       or (new.data->'stages'            is distinct from old.data->'stages')
       or (new.data->>'scoringMethod'    is distinct from old.data->>'scoringMethod')
       or (new.data->>'moderationStatus' is distinct from old.data->>'moderationStatus')
    then
        raise exception 'Musobaqa qoidalarini va hakamlar ro''yxatini faqat tashkilotchi o''zgartira oladi';
    end if;

    return new;
end
$trg$;

-- ---------------------------------------------------------------------
-- 3. NOMMA-NOM YOZILGAN QOIDALAR
-- ---------------------------------------------------------------------

-- Natijalar - asosiy muammo shu yerda edi.
drop policy if exists competition_scores_write on public.competition_scores;
create policy competition_scores_write on public.competition_scores
    for all to authenticated
    using      (public.can_manage_competition(competition_id) or public.is_platform_admin())
    with check (public.can_manage_competition(competition_id) or public.is_platform_admin());

-- E'tirozlar. Talaba o'zi bergan e'tirozni qo'sha oladi (avvalgidek).
drop policy if exists compappeal_insert on public.competition_appeals;
create policy compappeal_insert on public.competition_appeals
    for insert to authenticated with check (
        data->>'submittedBy' = public.current_username()
        or public.can_manage_competition(competition_id)
        or public.is_platform_admin()
    );

drop policy if exists compappeal_update on public.competition_appeals;
create policy compappeal_update on public.competition_appeals
    for update to authenticated
    using      (public.can_manage_competition(competition_id) or public.is_platform_admin())
    with check (public.can_manage_competition(competition_id) or public.is_platform_admin());

drop policy if exists compappeal_delete on public.competition_appeals;
create policy compappeal_delete on public.competition_appeals
    for delete to authenticated
    using (public.can_manage_competition(competition_id) or public.is_platform_admin());

-- Sertifikatlar. `competition_id` bo'sh bo'lsa - faqat administrator,
-- aks holda bo'sh maydon bilan cheklovni aylanib o'tish mumkin bo'lardi.
drop policy if exists cert_write on public.issued_certificates;
create policy cert_write on public.issued_certificates
    for all to authenticated
    using (
        public.is_platform_admin()
        or (competition_id is not null and public.can_manage_competition(competition_id))
    )
    with check (
        public.is_platform_admin()
        or (competition_id is not null and public.can_manage_competition(competition_id))
    );

-- ---------------------------------------------------------------------
-- 4. QOLGAN MUSOBAQA JADVALLARI - AVTOMATIK
--
-- Nomlarini qo'lda sanash xatarli: bittasi unutilsa u JIMGINA eski
-- qoidada qolib ketadi va koordinator o'sha joyda "saqlanmadi" xatosiga
-- uchraydi. Shuning uchun `rls_competition_integrity.sql` dagi aynan
-- o'sha aylanma takrorlanadi, faqat funksiya almashtiriladi.
-- ---------------------------------------------------------------------
do $rest$
declare
    t         text;
    has_comp  boolean;
    has_match boolean;
    expr      text;
    n_done    int := 0;
begin
    for t in
        select c.relname
        from pg_class c
        join pg_namespace nsp on nsp.oid = c.relnamespace
        where nsp.nspname = 'public'
          and c.relkind = 'r'
          and (c.relname like 'competition%' or c.relname like 'debate%')
          and c.relname not in (
              'competitions', 'competition_delegations', 'competition_appeals',
              'competition_scores'
          )
        order by c.relname
    loop
        select exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = t and column_name = 'competition_id'
        ) into has_comp;
        select exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = t and column_name = 'match_id'
        ) into has_match;

        if has_comp then
            expr := 'public.can_manage_competition(competition_id)';
        elsif has_match then
            expr := 'public.can_manage_competition('
                 || '(select m.competition_id from public.debate_matches m where m.id = match_id))';
        else
            -- Bog'lanish ustuni yo'q - tegilmaydi, avvalgi holatida qoladi.
            continue;
        end if;

        -- Jurnallar: qo'shish mumkin, o'zgartirish va o'chirish mumkin emas.
        if t like '%\_log%' or t like '%\_logs' then
            continue;
        end if;

        execute format('drop policy if exists %I_write on public.%I', t, t);
        execute format(
            'create policy %I_write on public.%I for all to authenticated '
            || 'using (%s or public.is_platform_admin()) '
            || 'with check (%s or public.is_platform_admin())',
            t, t, expr, expr);
        n_done := n_done + 1;
    end loop;

    raise notice 'Yangilangan jadvallar: %', n_done;
end
$rest$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- TEKSHIRISH - `can_manage_competition` ishlatadigan qoidalar
-- ---------------------------------------------------------------------------
select tablename as jadval, policyname as qoida, cmd as amal
from pg_policies
where schemaname = 'public'
  and qual like '%can_manage_competition%'
order by tablename, policyname;
