-- =====================================================================
-- TO'LMAGAN JAMOA ESLATMASI
--
-- MUAMMO: kapitan jamoani ro'yxatdan o'tkazadi, a'zolarga taklif yuboradi -
-- va shu bilan unutadi. Taklif qilinganlar ham ilovaga kirmasa, jamoa
-- TASDIQLANMAY qoladi. Tasdiqlanmagan jamoa esa davomat ro'yxatiga
-- umuman tushmaydi (db.js `getEventAttendanceRoster`), ya'ni tadbir kuni
-- hech kim yo'q bo'lib chiqadi. Hech kim xato qilmaydi - shunchaki
-- hech kim eslatmaydi.
--
-- Menyudagi qizil raqam bu yerda yetarli emas: u "yangi ish" belgisi va
-- bir marta ko'rilgach yo'qoladi. A'zolar umuman javob bermasa, raqam
-- qaytib chiqmaydi. Shuning uchun eslatma VAQTGA bog'lanadi.
--
-- KIMGA - IKKALA TOMONGA:
--   1. Javob bermagan a'zoga: "sizdan javob kutilyapti".
--   2. Kapitanga: "jamoangiz to'lmagan, N kishi yetishmaydi".
-- Faqat kapitanga aytish yetarli emas - to'siq aslida javob bermaganlarda.
--
-- QACHON: tadbirga 3 kun va 1 kun qolganda (muddat eslatmalari bilan bir xil
-- ritm). Sarlavhalari boshqa, shuning uchun ikkalasi ham o'tadi.
--
-- SOZLAMA: bu eslatma `application_status` qoidasiga bo'ysunadi - ya'ni
-- o'chirib bo'lmaydi. Sabab bir xil: javobsiz qolgan taklif muddatsiz
-- osilib qoladi va odam qatnasha olmay qoladi. Bu reklama emas, ish.
--
-- ISHGA TUSHIRISHDAN OLDIN `notification_preferences_and_deadlines.sql`
-- bajarilgan bo'lishi kerak.
-- =====================================================================

create or replace function public.send_incomplete_team_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    inserted integer := 0;
    today    date := (now() at time zone 'Asia/Tashkent')::date;
begin
    with activities as (
        -- Tadbir: sana ustunda. Turi bu bazada `text` bo'lishi mumkin,
        -- shuning uchun OCHIQ `::timestamptz` - aks holda UNION ikki
        -- tarmoqning turlarini tenglashtira olmaydi.
        select e.id::text        as activity_id,
               'event'::text     as ref_type,
               e.title::text     as title,
               e.date::timestamptz as starts_at
        from public.events e
        where e.date is not null
          -- `::text` ataylab: `status` ustuni matn ham, enum ham bo'lishi
          -- mumkin; cast ikkalasida ham ishlaydi.
          and e.status::text is distinct from 'completed'

        union all

        -- Musobaqa: butun obyekt `data` jsonb ichida.
        select c.id::text,
               'competition'::text,
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
    -- To'lmagan jamoalar. `accepted` ga +1: kapitan o'zi ham hisobda,
    -- ilovadagi hisob ham aynan shunday (respondToTeamInvite).
    teams as (
        select r.id            as reg_id,
               r.user_id::text as captain,
               r.team_name,
               r.team_members,
               coalesce(r.min_team_size, 0) as need,
               (select count(*) from jsonb_array_elements(r.team_members) m
                 where m->>'status' = 'accepted') + 1 as accepted,
               d.activity_id, d.ref_type, d.title, d.days_left
        from public.registrations r
        join due d
          on d.activity_id = r.activity_id::text
         and d.ref_type    = r.activity_type
        where r.participant_type = 'team'
          and r.team_confirmed_at is null
          and r.status <> 'cancelled'
    ),
    short as (
        select * from teams where need > 0 and accepted < need
    ),
    -- 1-TOMON: javob bermagan a'zolar. To'siq aynan shu yerda.
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
    -- 2-TOMON: kapitan. U kimni turtishi kerakligini bilishi uchun
    -- nechta kishi yetishmayotgani aytiladi.
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
    everyone as (
        select * from invitees
        union all
        select * from captains
    ),
    targets as (
        select e.*
        from everyone e
        where e.username is not null
          -- Sozlama: `application_status` o'chirib bo'lmaydigan tur, shuning
          -- uchun bu shart amalda hech qachon to'smaydi. U ATAYLAB yozilgan:
          -- niyat kodda ko'rinib tursin va tur keyinchalik ixtiyoriy qilinsa
          -- eslatma o'zi to'g'ri ishlasin.
          and not exists (
                  select 1 from public.notification_preferences np
                  where np.username::text = e.username
                    and np.type_id = 'application_status'
                    and np.enabled = false
              )
          -- Ayni odam + ayni faoliyat + ayni sarlavha bo'yicha takrorlanmaydi.
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
               t.username, 'warning', t.reminder_title, t.body,
               t.activity_id, t.ref_type, false
        from targets t
        returning 1
    )
    select count(*) into inserted from ins;

    return inserted;
end;
$$;

revoke all on function public.send_incomplete_team_reminders() from public, anon;
grant execute on function public.send_incomplete_team_reminders() to authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- Kunlik reja
--
-- AVVAL QO'LDA SINAB KO'RING:
--     select public.send_incomplete_team_reminders();
-- Nazoratsiz ishlaydigan vazifani sinovsiz rejaga qo'yish minglab qator
-- yozib yuborishi mumkin. Qaytgan raqam - yozilgan xabarlar soni.
--
-- Soat 04:00 UTC = Toshkentda 09:00 - talaba ertalab ko'radi.
-- ---------------------------------------------------------------------
-- do $sched$ begin
--     perform cron.schedule('incomplete-team-reminders', '0 4 * * *',
--                           $$select public.send_incomplete_team_reminders()$$);
-- end $sched$;
