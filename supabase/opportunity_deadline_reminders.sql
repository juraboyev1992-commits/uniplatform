-- ============================================================================
-- IMKONIYAT MUDDATI ESLATMALARI
--
-- DIQQAT - BU FAYL BAZADAN TIKLANGAN (2026-09-18).
--   `opportunity-deadline-reminders` nomli cron ishi jonli bazada FAOL edi,
--   lekin uning manbasi repozitoriyda YO'Q edi: butun loyiha bo'ylab
--   (.sql, .js, .jsx, .md) qidirildi - bitta ham iz topilmadi. Ya'ni u
--   to'g'ridan-to'g'ri Supabase konsolidan yaratilgan yoki fayli keyin
--   o'chib ketgan.
--
--   Buning xavfi: har kuni talabalarga xabar yuboradigan ish borligini
--   koddan bilib bo'lmasdi, uni ko'rib chiqib bo'lmasdi, va baza qayta
--   tiklansa yoki yangi muhitga ko'chirilsa - jimgina yo'qolardi.
--
--   Matn `select command from cron.job` orqali olindi va shu yerga
--   izohlari bilan qayta yozildi. MANTIQ O'ZGARTIRILMADI.
--
-- QANDAY ISHLAYDI:
--   Har kuni 06:00 (bazaning vaqti) da `student_opportunity_matches`
--   keshidan o'qiydi va muddatga 14, 7, 3 yoki 1 kun qolgan MOS talabaga
--   bitta xabar yozadi. Muddatga 3 kun yoki kamroq qolganda xabar turi
--   'warning', aks holda 'info'.
--
-- MUHIM CHEKLOV - KESH QO'LDA TO'LDIRILADI:
--   `student_opportunity_matches` ni pg_cron emas, ILOVA to'ldiradi:
--   admin "Stipendiyalar" bo'limidagi «Mosliklarni yangilash» tugmasi
--   (`ScholarshipManagement.jsx` -> `recomputeAllMatches`). Moslik mantiqi
--   JS da yozilgan va uni SQL ga ko'chirish ikkita haqiqat manbai degani
--   bo'lardi - shuning uchun bu ataylab shunday.
--
--   Oqibati: agar o'sha tugma bosilmasa, kesh eskiradi va bu ish
--   ESKIRGAN ma'lumot bo'yicha xabar yuboradi - yoki umuman yubormaydi.
--   Ya'ni avtomatik ish qo'lda bosiladigan tugmaga bog'langan.
-- ============================================================================

create extension if not exists pg_cron;

-- Ishning o'zi: takroriy yaratishda avvalgisi olib tashlanadi.
select cron.unschedule('opportunity-deadline-reminders')
where exists (select 1 from cron.job where jobname = 'opportunity-deadline-reminders');

select cron.schedule(
    'opportunity-deadline-reminders',
    '0 6 * * *',
    $job$
    insert into public.notifications (id, user_id, type, title, message, ref_id, ref_type, is_read)
    select
        'notif_' || replace(gen_random_uuid()::text, '-', ''),
        m.student_id,
        -- Uch kun va undan kam qolganda xabar boshqa rangda ko'rinadi.
        case when (m.deadline - current_date) <= 3 then 'warning' else 'info' end,
        'Muddat yaqinlashmoqda',
        m.title || ' - ' || (m.deadline - current_date) || ' kun qoldi'
            || case when m.fit is not null then '. Moslik: ' || round(m.fit) || '%' else '' end,
        m.opportunity_id,
        'opportunity',
        false
    from public.student_opportunity_matches m
    where m.state = 'eligible'
      and m.deadline is not null
      -- Faqat shu to'rt kunda: har kuni eslatib turish shovqin bo'lardi.
      and (m.deadline - current_date) in (14, 7, 3, 1)
      -- Ayni shu imkoniyat bo'yicha bugun xabar yuborilgan bo'lsa - takrorlanmaydi.
      and not exists (
          select 1 from public.notifications n
          where n.user_id = m.student_id
            and n.ref_id = m.opportunity_id
            and n.created_at::date = current_date
      );
    $job$
);

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
-- ---------------------------------------------------------------------------
select jobname, schedule, active from cron.job order by jobname;
