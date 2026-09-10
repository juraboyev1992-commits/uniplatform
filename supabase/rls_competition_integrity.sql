-- =====================================================================
-- MUSOBAQA HALOLLIGI — o'qish ochiq, YOZISH hakam bilan cheklanadi
--
-- Bu avvalgi ikki RLS faylidan BOSHQA turdagi muammo. U yerda maxfiylik
-- edi ("boshqa talabaning pasportini o'qib bo'lmasin"), bu yerda esa
-- HALOLLIK: hozir tizimga kirgan istalgan talaba brauzer konsolidan
-- o'z musobaqa balini o'zgartirishi yoki o'ziga sertifikat berishi
-- mumkin.
--
-- SHUNING UCHUN O'QISH OCHIQ QOLADI. Reyting, jonli ekran, setka va
-- natijalar hammaga ko'rinishi KERAK - ularni yopish ilovaning
-- maqsadini buzadi. Faqat yozish cheklanadi.
--
-- "KIM HAKAM" uchta manbadan aniqlanadi (ilovadagi haqiqiy modelning
-- aynan o'zi):
--   1. `competitions.data` ichidagi `judges` ro'yxati
--   2. o'sha jsonb dagi `ownerUsername` - musobaqani yaratgan odam
--   3. `competition_delegations` dagi faol vakolat
--
-- Bazada o'lchandi (10 ta musobaqa): hammasida ham egasi, ham hakami
-- bor. Ya'ni bu qoida hech kimni o'z musobaqasidan chetda qoldirmaydi.
--
-- VAKOLAT BERISH ALOHIDA: uni faqat musobaqa egasi va administrator
-- qila oladi. Aks holda vakolat olgan hakam o'ziga yana huquq qo'shib,
-- cheklovdan chiqib ketardi.
--
-- TARIX JADVALLARI: yozish ochiq (har amal qator qo'shadi), lekin
-- o'zgartirish va o'chirish umuman berilmaydi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> hammasini nusxalab Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================

do $guard$
begin
    if to_regprocedure('public.current_username()') is null
       or to_regprocedure('public.is_platform_admin()') is null then
        raise exception 'Kerakli funksiya topilmadi - avval supabase/rls_student_private_data.sql ni ishga tushiring';
    end if;
end
$guard$;


-- ---------------------------------------------------------------------
-- 1. YORDAMCHI FUNKSIYALAR
--
-- `jsonb_exists(...)` ataylab `?` operatori o'rniga ishlatilgan: `?`
-- ba'zi mijozlarda parametr belgisi deb o'qiladi va so'rov buziladi
-- (bu loyihada announce_activity.sql da allaqachon uchragan).
-- ---------------------------------------------------------------------
create or replace function public.is_competition_owner(comp_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select comp_id is not null and exists (
        select 1 from public.competitions c
        where c.id = comp_id
          and c.data->>'ownerUsername' = public.current_username()
    )
$$;

create or replace function public.is_competition_judge(comp_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.is_competition_owner(text) from public, anon;
revoke all on function public.is_competition_judge(text) from public, anon;
grant execute on function public.is_competition_owner(text) to authenticated;
grant execute on function public.is_competition_judge(text) to authenticated;


-- ---------------------------------------------------------------------
-- 2. ESKI QOIDALARNI TOZALASH
--
-- Barcha musobaqa/munozara jadvallari + sertifikatlar. Qoidalar YOKI
-- bilan birlashadi, ya'ni bitta `using (true)` qolsa yangi cheklov
-- ishlamaydi.
-- ---------------------------------------------------------------------
do $clean$
declare r record;
begin
    for r in
        select p.policyname, p.tablename
        from pg_policies p
        where p.schemaname = 'public'
          and (p.tablename like 'competition%' or p.tablename like 'debate%'
               or p.tablename = 'issued_certificates')
    loop
        execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
    end loop;
end
$clean$;


-- ---------------------------------------------------------------------
-- 3. MUSOBAQANING O'ZI - qoida emas, TRIGGER
--
-- Bu jadval alohida yondashuvni talab qiladi. Talaba musobaqaga
-- ro'yxatdan o'tganda AYNAN SHU QATOR yangilanadi: ishtirokchilar
-- ro'yxati `competitions.data` ichida turadi (db.js: registerParticipant).
-- Ya'ni "yozishni faqat hakamga ber" deb qo'ysak, ro'yxatdan o'tish
-- butunlay ishlamay qolardi.
--
-- RLS qoidasi QATOR darajasida ishlaydi, MAYDON darajasida emas - shuning
-- uchun "faqat ishtirokchilar ro'yxatini o'zgartirishi mumkin" degan
-- shartni qoida bilan ifodalab bo'lmaydi. Buni trigger qiladi.
--
-- Trigger ataylab TOR: u faqat halollikka daxldor maydonlarni qulflaydi.
-- Qolgan maydonlar (nomi, sanasi, joyi, ishtirokchilar) avvalgidek
-- o'zgaraveradi - chunki ularni o'zgartiradigan barcha oqimni sinovdan
-- o'tkazmasdan yopish, bilmagan joyni buzish demakdir.
--
-- Eng muhimi `judges`: usiz talaba o'zini hakamlar ro'yxatiga qo'shib,
-- keyin pastdagi barcha cheklovlardan qonuniy ravishda o'tib ketardi.
-- ---------------------------------------------------------------------
create or replace function public.guard_competition_core_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $trg$
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
$trg$;

drop trigger if exists competitions_guard_core on public.competitions;
create trigger competitions_guard_core
    before update on public.competitions
    for each row execute function public.guard_competition_core_fields();

create policy comp_select on public.competitions
    for select to authenticated using (true);
create policy comp_insert on public.competitions
    for insert to authenticated with check (
        data->>'ownerUsername' = public.current_username() or public.is_platform_admin()
    );
-- Yangilash ochiq qoladi (ro'yxatdan o'tish shunga tayanadi), maydonlarni
-- yuqoridagi trigger qo'riqlaydi.
create policy comp_update on public.competitions
    for update to authenticated using (true) with check (true);
-- O'chirish esa faqat egaga va administratorga.
create policy comp_delete on public.competitions
    for delete to authenticated
    using (public.is_competition_owner(id) or public.is_platform_admin());


-- ---------------------------------------------------------------------
-- 4. VAKOLAT - faqat ega va administrator
-- ---------------------------------------------------------------------
create policy compdeleg_select on public.competition_delegations
    for select to authenticated using (true);
create policy compdeleg_write on public.competition_delegations
    for all to authenticated
    using (public.is_competition_owner(competition_id) or public.is_platform_admin())
    with check (public.is_competition_owner(competition_id) or public.is_platform_admin());


-- ---------------------------------------------------------------------
-- 5. APELLYATSIYA - talaba o'zi yozadi
--
-- Shikoyatni ishtirokchi beradi (`submittedBy` - uning logini), qarorni
-- esa hakam chiqaradi. Shuning uchun INSERT va UPDATE alohida.
-- ---------------------------------------------------------------------
create policy compappeal_select on public.competition_appeals
    for select to authenticated using (true);
create policy compappeal_insert on public.competition_appeals
    for insert to authenticated with check (
        data->>'submittedBy' = public.current_username()
        or public.is_competition_judge(competition_id)
        or public.is_platform_admin()
    );
create policy compappeal_update on public.competition_appeals
    for update to authenticated
    using (public.is_competition_judge(competition_id) or public.is_platform_admin())
    with check (public.is_competition_judge(competition_id) or public.is_platform_admin());
create policy compappeal_delete on public.competition_appeals
    for delete to authenticated
    using (public.is_competition_judge(competition_id) or public.is_platform_admin());


-- ---------------------------------------------------------------------
-- 6. SERTIFIKATLAR
--
-- `competition_id` bo'sh bo'lishi mumkin (musobaqaga bog'liq bo'lmagan
-- sertifikat). Unda faqat administrator bera oladi - aks holda bo'sh
-- maydon bilan cheklovni aylanib o'tish mumkin bo'lardi.
-- ---------------------------------------------------------------------
create policy cert_select on public.issued_certificates
    for select to authenticated using (true);
create policy cert_write on public.issued_certificates
    for all to authenticated
    using (
        public.is_platform_admin()
        or (competition_id is not null and public.is_competition_judge(competition_id))
    )
    with check (
        public.is_platform_admin()
        or (competition_id is not null and public.is_competition_judge(competition_id))
    );


-- ---------------------------------------------------------------------
-- 7. QOLGAN JADVALLAR - avtomatik
--
-- Nomlarini qo'lda sanab chiqish xatarli: bittasi unutilsa u JIMGINA
-- ochiq qolardi. Shuning uchun jadvallar `information_schema` dan
-- o'qiladi va har biriga ustuniga qarab mos qoida qo'yiladi:
--
--   `competition_id` bor       -> to'g'ridan-to'g'ri
--   `match_id` bor             -> ota uchrashuv orqali
--   ikkalasi ham yo'q          -> qoida QO'YILMAYDI va oxirgi
--                                 ro'yxatda ko'rinadi
--
-- Tarix jadvallari (nomida `_log`) alohida: yozish ochiq, o'zgartirish
-- va o'chirish yo'q.
-- ---------------------------------------------------------------------
do $rest$
declare
    t          text;
    has_comp   boolean;
    has_match  boolean;
    expr       text;
begin
    for t in
        select c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and (c.relname like 'competition%' or c.relname like 'debate%')
          and c.relname not in (
              'competitions', 'competition_delegations', 'competition_appeals'
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
            expr := 'public.is_competition_judge(competition_id)';
        elsif has_match then
            expr := 'public.is_competition_judge('
                 || '(select m.competition_id from public.debate_matches m where m.id = match_id))';
        else
            -- MUHIM: qoidasiz qoldirib bo'lmaydi. RLS yoqilgan jadvalda
            -- birorta ham qoida bo'lmasa, PostgreSQL hammani rad etadi -
            -- ya'ni jadval ochiq qolmaydi, butunlay ISHLAMAY qoladi.
            -- Shuning uchun eski keng qoida qaytariladi va nomi pastdagi
            -- tekshiruvda `yozish_ochiq = 1` bo'lib ko'rinadi.
            raise notice 'CHEKLANMADI: % (competition_id ham, match_id ham yo''q) - ochiq qoldirildi', t;
            execute format(
                'create policy %I_all on public.%I for all to authenticated '
                || 'using (true) with check (true)', t, t);
            continue;
        end if;

        execute format('create policy %I_select on public.%I for select to authenticated using (true)', t, t);

        if t like '%\_log%' or t like '%\_logs' then
            -- Tarix: qo'shish mumkin, o'zgartirish va o'chirish mumkin emas.
            execute format(
                'create policy %I_insert on public.%I for insert to authenticated with check (true)', t, t);
        else
            execute format(
                'create policy %I_write on public.%I for all to authenticated '
                || 'using (%s or public.is_platform_admin()) '
                || 'with check (%s or public.is_platform_admin())',
                t, t, expr, expr);
        end if;
    end loop;
end
$rest$;


notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 8. TEKSHIRUV
--
-- `yozish_ochiq` ustunida 0 dan katta son chiqqan jadval hamon
-- himoyasiz. `qoidalar` 0 bo'lgan jadval esa umuman qoidasiz qolgan -
-- yuqoridagi NOTICE xabarlarida uning nomi ko'rinadi.
-- ---------------------------------------------------------------------
select
    c.relname                                                          as jadval,
    count(p.policyname)                                                as qoidalar,
    count(p.policyname) filter (
        where p.cmd in ('ALL', 'UPDATE', 'DELETE') and p.qual = 'true'
    )                                                                  as yozish_ochiq
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
where n.nspname = 'public'
  and c.relkind = 'r'
  and (c.relname like 'competition%' or c.relname like 'debate%'
       or c.relname = 'issued_certificates')
group by c.relname
order by c.relname;
