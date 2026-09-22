-- ============================================================================
-- HAFTALIK XULOSA
--
-- MAQSAD: talabaga haftada BIR MARTA "shu hafta nima qildingiz" deb aytish.
--   Bu platformaga qaytish sababini beradi va u O'YLAB TOPILGAN emas - hamma
--   raqam allaqachon bazada yozilgan.
--
-- NEGA ALOHIDA TUR:
--   Bazada allaqachon to'rtta kunlik ish bor (activity-reminders-daily,
--   registration-deadline-reminders, incomplete-team-reminders,
--   opportunity-deadline-reminders). Ularning hammasi KELAJAK haqida
--   ogohlantiradi: "muddat yaqinlashmoqda", "ertaga tadbir". Bu esa O'TGAN
--   hafta haqida. Kesishmaydi.
--
-- UCHTA QAT'IY QOIDA:
--
--   1. HECH NARSA BO'LMAGAN BO'LSA - XABAR YUBORILMAYDI.
--      "Bu hafta hech narsa qilmadingiz" degan xabar na foydali, na
--      xushmuomala. U shunchaki shovqin bo'lib, odamni bildirishnomalarni
--      butunlay o'chirishga olib keladi.
--
--   2. FAQAT SQL HALOL HISOBLAY OLADIGAN RAQAM.
--      Reyting o'rni, indeks foizi va moslik - bularning mantiqi JS da va
--      ularni bu yerda qayta yozish ikkinchi haqiqat manbai bo'lardi.
--      Shuning uchun xulosada faqat uchta narsa bor: to'plangan ball,
--      qatnashilgan tadbir, Ma'rifat darsi. Uchalasi ham yozuvdan o'qiladi.
--
--   3. FOYDALANUVCHI SOZLAMASI HURMAT QILINADI.
--      `notification_preferences` da `weekly_digest` o'chirilgan bo'lsa -
--      yuborilmaydi. Naqsh `notification_preferences_and_deadlines.sql`
--      dan olingan.
--
-- USTUNLAR TEKSHIRILGAN (taxmin emas):
--   social_score_transactions : student_id, points, created_at
--   activity_attendance       : participant_id, status ('present'), marked_at
--   marifat_attendance        : student_id, present (bool), marked_at
--
-- VAQT: har dushanba 05:00 UTC = Toshkentda 10:00. Dushanba ertalab -
--   hafta boshlanishi, ya'ni "endi nima qilaman" degan savol eng tirik payt.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni Run.
-- ============================================================================

create extension if not exists pg_cron;

create or replace function public.send_weekly_digest()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    inserted integer := 0;
begin
    with hafta as (
        select (now() at time zone 'Asia/Tashkent')::date - 7 as boshi
    ),
    -- Uchta manbadan uchta son. `full outer join` EMAS: talabalar ro'yxati
    -- profiles dan olinadi, qolgani chapga ulanadi - shunda hech bir manba
    -- bo'sh bo'lsa ham qator yo'qolmaydi.
    ball as (
        select t.student_id, sum(t.points)::numeric as jami
          from public.social_score_transactions t, hafta h
         where t.created_at >= h.boshi
         group by t.student_id
    ),
    tadbir as (
        select a.participant_id as student_id, count(*)::int as soni
          from public.activity_attendance a, hafta h
         where a.status = 'present'
           and a.marked_at >= h.boshi
         group by a.participant_id
    ),
    marifat as (
        select m.student_id, count(*)::int as soni
          from public.marifat_attendance m, hafta h
         where m.present
           and m.marked_at >= h.boshi
         group by m.student_id
    ),
    jamlangan as (
        select p.username,
               coalesce(b.jami, 0)  as ball,
               coalesce(t.soni, 0)  as tadbir,
               coalesce(m.soni, 0)  as marifat
          from public.profiles p
          left join ball    b on b.student_id = p.username
          left join tadbir  t on t.student_id = p.username
          left join marifat m on m.student_id = p.username
         where p.role = 'TALABA'
    )
    insert into public.notifications (id, user_id, type, title, message, ref_id, ref_type, is_read)
    select
        'notif_' || replace(gen_random_uuid()::text, '-', ''),
        j.username,
        'weekly_digest',
        'Haftalik xulosa',
        -- Matn faqat HAQIQATAN bo'lgan narsani sanaydi: nol bo'lgan qism
        -- umuman yozilmaydi ("0 ta tadbir" degan qator hech narsa bermaydi).
        trim(both ' · ' from concat_ws(' · ',
            case when j.ball    > 0 then '+' || trim(to_char(j.ball, 'FM9999990.9')) || ' ball' end,
            case when j.tadbir  > 0 then j.tadbir  || ' ta tadbir' end,
            case when j.marifat > 0 then j.marifat || ' ta Ma''rifat darsi' end
        )),
        null,
        'digest',
        false
    from jamlangan j
    where (j.ball > 0 or j.tadbir > 0 or j.marifat > 0)
      -- Foydalanuvchi bu turni o'chirgan bo'lsa - yubormaymiz.
      and not exists (
          select 1 from public.notification_preferences np
           where np.username = j.username
             and np.type_id = 'weekly_digest'
             and np.enabled = false
      )
      -- Shu haftada allaqachon yuborilgan bo'lsa - takrorlanmaydi. Ish
      -- qo'lda qayta ishga tushirilsa ham xabar ikkilanmaydi.
      and not exists (
          select 1 from public.notifications n
           where n.user_id = j.username
             and n.type = 'weekly_digest'
             and n.created_at > now() - interval '6 days'
      );

    get diagnostics inserted = row_count;
    return inserted;
end
$$;

revoke all on function public.send_weekly_digest() from public, anon;
grant execute on function public.send_weekly_digest() to authenticated;

-- ---------------------------------------------------------------------------
-- JADVAL: har dushanba 05:00 UTC (Toshkentda 10:00)
-- ---------------------------------------------------------------------------
select cron.unschedule('weekly-digest')
where exists (select 1 from cron.job where jobname = 'weekly-digest');

select cron.schedule('weekly-digest', '0 5 * * 1', $job$ select public.send_weekly_digest(); $job$);

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
--
-- 1) Ish ro'yxatga tushdimi:
select jobname, schedule, active from cron.job order by jobname;

-- 2) HOZIR nechta talabaga xabar ketardi - hech narsa YUBORMASDAN ko'rish
--    uchun quyidagini alohida ishga tushiring (izohni oching):
--
-- select count(*) from public.profiles p
--  where p.role = 'TALABA'
--    and (
--      exists (select 1 from public.social_score_transactions t
--               where t.student_id = p.username
--                 and t.created_at >= (now() at time zone 'Asia/Tashkent')::date - 7)
--      or exists (select 1 from public.activity_attendance a
--                  where a.participant_id = p.username and a.status = 'present'
--                    and a.marked_at >= (now() at time zone 'Asia/Tashkent')::date - 7)
--      or exists (select 1 from public.marifat_attendance m
--                  where m.student_id = p.username and m.present
--                    and m.marked_at >= (now() at time zone 'Asia/Tashkent')::date - 7)
--    );
-- ---------------------------------------------------------------------------
