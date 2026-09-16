-- =====================================================================
-- MUSOBAQANING KLUBI QAYSI KALITDA TURIBDI?
--
-- activity_club_id() musobaqa uchun `data->>'clubId'` ni o'qiydi, lekin
-- uchala bayonnomada ham klub TOPILMADI. Shuni aniqlaymiz: kalit umuman
-- yo'qmi, boshqacha nomlanganmi yoki faqat eski qatorlarda yo'qmi.
--
-- HECH NARSA O'ZGARTIRILMAYDI. Natija bitta xabar - nusxalab yuboring.
-- =====================================================================

do $check$
declare
    r record;
    report text := '';
begin
    report := report || format(E'\nmusobaqalar: jami %s | clubId kaliti bor %s',
        (select count(*) from public.competitions),
        (select count(*) from public.competitions where jsonb_exists(data, 'clubId')));

    report := report || format(E'\ntadbirlar: jami %s | club_id to''ldirilgan %s',
        (select count(*) from public.events),
        (select count(*) from public.events where club_id is not null));

    report := report || E'\n--- har bir musobaqa ---';
    for r in
        select c.id,
               c.data->>'clubId'        as club_id,
               c.data->>'contextType'   as kontekst_turi,
               c.data->>'contextId'     as kontekst_id,
               c.data->>'ownerUsername' as egasi,
               public.activity_club_id('competition', c.id) as yordamchi_natijasi,
               jsonb_array_length(coalesce(c.data->'judges', '[]'::jsonb)) as hakamlar
        from public.competitions c
        order by c.id
        limit 20
    loop
        report := report || format(E'\n  %s | clubId=%s | contextType=%s contextId=%s | egasi=%s | yordamchi=%s | hakam soni=%s',
            left(r.id, 22), coalesce(r.club_id, '-'), coalesce(r.kontekst_turi, '-'),
            coalesce(r.kontekst_id, '-'), coalesce(r.egasi, '-'),
            coalesce(r.yordamchi_natijasi, 'TOPILMADI'), r.hakamlar);
    end loop;

    raise exception 'NATIJA:%', report;
end
$check$;
