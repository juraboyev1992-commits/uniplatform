-- =====================================================================
-- BILDIRISHNOMA: sozlamalar jadvali + ro'yxatdan o'tish muddati eslatmasi
--
-- IKKI QISM:
--   1. `notification_preferences` - foydalanuvchi qaysi turdagi xabarni
--      olishni o'zi belgilaydi. Jadval KERAK, chunki eslatmalarni pg_cron
--      yuboradi va u brauzerdagi sozlamani ko'ra olmaydi. Sozlama faqat
--      brauzerda tursa, tugma "ishlayotgandek" ko'rinib, aslida eslatmalarga
--      ta'sir qilmasdi.
--   2. `send_registration_deadline_reminders()` - ro'yxat yopilishiga
--      3 KUN va 1 KUN qolganda xabar.
--
-- NAQSH `activity_reminders.sql` dan olingan (o'sha faylning izohi ham
-- shu yerga tegishli):
--   JS  -> kim nimaga mos kelishini hal qiladi
--   SQL -> faqat VAQT arifmetikasi
--
-- TALAB: `pg_cron` yoqilgan bo'lishi kerak (Database -> Extensions).
-- Yoqilmagan bo'lsa funksiya baribir yaratiladi va uni qo'lda chaqirsa bo'ladi.
--
-- ISHGA TUSHIRISHDAN OLDIN `rls_lockdown.sql` bajarilgan bo'lishi kerak.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Sozlamalar jadvali
--
-- `username` bilan kalitlanadi, `auth.uid()` bilan emas: `notifications.user_id`
-- ham username saqlaydi (ilova odamni username bo'yicha biladi, Supabase auth esa
-- uuid bo'yicha). Ikkisini aralashtirish - bu kod bazasidagi eng ko'p takrorlangan
-- xato manbai, shuning uchun bu yerda ATAYLAB username ishlatiladi.
-- ---------------------------------------------------------------------
create table if not exists public.notification_preferences (
    username    text not null,
    type_id     text not null,
    enabled     boolean not null default true,
    updated_at  timestamptz not null default now(),
    primary key (username, type_id)
);

alter table public.notification_preferences enable row level security;

drop policy if exists notification_prefs_own on public.notification_preferences;
create policy notification_prefs_own on public.notification_preferences
    for all to authenticated
    using (username = public.current_username())
    with check (username = public.current_username());

revoke all on public.notification_preferences from anon;
grant select, insert, update, delete on public.notification_preferences to authenticated;


-- ---------------------------------------------------------------------
-- 2. Ro'yxatdan o'tish muddati eslatmasi
--
-- KIMGA: hali RO'YXATDAN O'TMAGAN talabalarga. Ro'yxatdan o'tganga "muddat
-- tugayapti" deyishning ma'nosi yo'q - u allaqachon o'tgan.
--
-- QAMROV: klub tadbiri bo'lsa faqat o'sha klub a'zolariga. Universitet
-- miqyosidagi tadbir hammaga boradi. Bu ataylab: har bir klub tadbiri 550 ta
-- talabaga xabar yuborsa, bir haftada hamma bildirishnomani o'chirib qo'yadi.
--
-- IKKI MARTA: 3 kun va 1 kun qolganda. Sarlavhalari boshqa, shuning uchun
-- takrorlanishdan himoya ikkalasini ham o'tkazadi.
-- ---------------------------------------------------------------------
create or replace function public.send_registration_deadline_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    inserted integer := 0;
    today    date := (now() at time zone 'Asia/Tashkent')::date;
begin
    -- HAR BIR USTUN TURI OCHIQ BELGILANADI.
    --
    -- Sabab: `events.registration_closes_at` bu bazada `text`, musobaqada esa
    -- qiymat `data` jsonb dan olinib `timestamptz` ga o'giriladi. UNION ikki
    -- tarmoqning turlarini tenglashtira olmay xato berardi:
    --   "UNION types text and timestamp with time zone cannot be matched"
    -- Ochiq `::` bilan ikkala tarmoq ham bir xil turga keltiriladi va ustun
    -- turi kelajakda o'zgarsa ham so'rov buzilmaydi.
    with activities as (
        -- Tadbirlar: muddat ustunda (turi `text` bo'lishi mumkin).
        select
            e.id::text                              as activity_id,
            'event'::text                           as ref_type,
            e.title::text                           as title,
            e.registration_closes_at::timestamptz   as closes_at,
            e.club_id::text                         as club_id
        from public.events e
        where e.registration_closes_at is not null
          and e.status <> 'completed'

        union all

        -- Musobaqalar: butun obyekt `data` jsonb ichida saqlanadi, shuning uchun
        -- muddat ham o'sha yerdan olinadi (tadbirdan farqli - bu farq ataylab
        -- emas, tarixiy, lekin hisobga olinishi shart).
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
        select
            a.*,
            case (a.closes_at at time zone 'Asia/Tashkent')::date - today
                when 3 then 'Ro''yxat 3 kundan keyin yopiladi'
                when 1 then 'Ro''yxat ertaga yopiladi'
            end as reminder_title
        from activities a
        where (a.closes_at at time zone 'Asia/Tashkent')::date - today in (1, 3)
    ),
    -- Kimga: talaba, hali ro'yxatdan o'tmagan, sozlamada o'chirmagan, va
    -- klub tadbiri bo'lsa - o'sha klub a'zosi.
    targets as (
        select d.activity_id, d.ref_type, d.title, d.reminder_title, p.username
        from due d
        join public.profiles p
          on p.role::text = 'TALABA'
        where not exists (
                  select 1 from public.registrations r
                  where r.activity_id::text = d.activity_id
                    and r.activity_type = d.ref_type
                    and (r.user_id::text = p.username::text or r.user_id::text = p.id::text)
                    and r.status = 'registered'
              )
          and not exists (
                  select 1 from public.notification_preferences np
                  where np.username::text = p.username::text
                    and np.type_id = 'registration_deadline'
                    and np.enabled = false
              )
          -- Klub a'zoligi. `memberships.user_id` kod bazasida BA'ZAN username,
          -- BA'ZAN profil uuid'si bilan yoziladi (AuthContext uuid uzatadi,
          -- boshqa joylar username). Qaysi biri ekaniga tayanib qolmaymiz -
          -- ikkalasi ham tekshiriladi. Aks holda shart hech qachon rost
          -- bo'lmay, klub tadbiri haqida hech kim xabar olmasdi.
          and (
                  d.club_id is null
                  or exists (
                      select 1 from public.memberships m
                      where m.club_id::text = d.club_id
                        and (m.user_id::text = p.username::text or m.user_id::text = p.id::text)
                  )
              )
          -- Ayni shu odamga ayni shu faoliyat bo'yicha ayni shu eslatma
          -- allaqachon yuborilgan bo'lsa - takrorlanmaydi.
          and not exists (
                  select 1 from public.notifications n
                  where n.user_id::text = p.username::text
                    and n.ref_id::text = d.activity_id
                    and n.ref_type = d.ref_type
                    and n.title = d.reminder_title
              )
    ), ins as (
        insert into public.notifications (id, user_id, type, title, message, ref_id, ref_type, is_read)
        select
            'notif_' || replace(gen_random_uuid()::text, '-', ''),
            t.username,
            'info',
            t.reminder_title,
            t.title || ' — ro''yxatdan o''tishni kechiktirmang',
            t.activity_id,
            t.ref_type,
            false
        from targets t
        returning 1
    )
    select count(*) into inserted from ins;

    return inserted;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. Kunlik reja
--
-- AVVAL QO'LDA SINAB KO'RING - nazoratsiz ishlaydigan vazifani sinovsiz
-- rejaga qo'yish minglab qator yozib qo'yishi mumkin:
--
--   select public.send_registration_deadline_reminders();
--
-- Qaytgan raqam - yozilgan xabarlar soni. Kutilganidan ko'p bo'lsa, cron'ga
-- qo'ymang va shartlarni qayta ko'rib chiqing.
-- ---------------------------------------------------------------------
do $sched$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        if exists (select 1 from cron.job where jobname = 'registration-deadline-reminders') then
            perform cron.unschedule('registration-deadline-reminders');
        end if;
        -- Har kuni 09:00 (Toshkent) = 04:00 UTC.
        perform cron.schedule(
            'registration-deadline-reminders',
            '0 4 * * *',
            $job$ select public.send_registration_deadline_reminders(); $job$
        );
        raise notice 'Kunlik eslatma rejaga qo''yildi (09:00 Toshkent)';
    else
        raise warning 'pg_cron yoqilmagan - funksiya yaratildi, lekin avtomatik ishlamaydi. Database -> Extensions dan yoqing.';
    end if;
end
$sched$;


-- Tekshirish:
--   select * from cron.job where jobname = 'registration-deadline-reminders';
--   select cron.unschedule('registration-deadline-reminders');   -- o'chirish
