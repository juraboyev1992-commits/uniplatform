-- Tadbir eslatmalari: ertaga bo'ladigan tadbir haqida ro'yxatdan o'tganlarga xabar.
--
-- MAS'ULIYAT TAQSIMOTI (imkoniyatlar moduli bilan bir xil qoida):
--   JS  -> kim nimaga mos kelishini hal qiladi
--   SQL -> faqat VAQT arifmetikasi bilan shug'ullanadi
-- Bu yerda hech qanday tanlov mantig'i yo'q: kim ro'yxatdan o'tgan bo'lsa, o'shanga
-- xabar boradi. Shuning uchun buni SQL qilishi xavfsiz.
--
-- TALAB: `pg_cron` kengaytmasi yoqilgan bo'lishi kerak. Supabase da u
-- Database -> Extensions bo'limidan yoqiladi. Yoqilmagan bo'lsa faylning
-- oxirgi qismi (cron.schedule) xato beradi, funksiyaning o'zi esa
-- yaratilaveradi va uni qo'lda chaqirib turish mumkin.
create extension if not exists pg_cron;

create or replace function public.send_activity_reminders()
returns integer
language plpgsql
security definer
as $$
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
          -- Ertaga bo'ladigan tadbirlar (REMINDER_DAYS = [1]).
          and e.date::date = (now() at time zone 'Asia/Tashkent')::date + 1
          -- Ayni shu tadbir uchun ayni shu odamga eslatma allaqachon
          -- yuborilgan bo'lsa - takrorlanmaydi.
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
$$;

-- Har kuni ertalab 09:00 (Toshkent) = 04:00 UTC.
--
-- Qayta ishga tushirilsa xato bermasligi uchun avval eskisi olib tashlanadi.
-- (cron.unschedule mavjud bo'lmagan nom uchun xato beradi, shuning uchun
-- shartli tekshiruv bilan.)
do $$
begin
    if exists (select 1 from cron.job where jobname = 'activity-reminders-daily') then
        perform cron.unschedule('activity-reminders-daily');
    end if;
end
$$;

select cron.schedule(
    'activity-reminders-daily',
    '0 4 * * *',
    $$select public.send_activity_reminders();$$
);

-- Tekshirish uchun (xabar yaratadi, ehtiyot bo'ling):
--   select public.send_activity_reminders();
-- Jadvalni ko'rish:
--   select * from cron.job where jobname = 'activity-reminders-daily';
-- Bekor qilish:
--   select cron.unschedule('activity-reminders-daily');
