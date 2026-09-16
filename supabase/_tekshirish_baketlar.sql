-- =====================================================================
-- FAYL OMBORLARI (BAKETLAR) HOLATI
--
-- Jadvallar yopildi, endi navbat fayllarga: diplom nusxasi, talaba
-- hujjati, tashrif fotosurati. "public = true" bo'lgan baketdagi fayl
-- havolasini bilgan HAR KIM ocha oladi - login ham shart emas.
--
-- HECH NARSA O'ZGARTIRILMAYDI. Natija bitta xabar - nusxalab yuboring.
-- =====================================================================

do $check$
declare
    r record;
    report text := '';
begin
    report := report || E'\n--- baketlar ---';
    for r in
        select id, public, file_size_limit, created_at
        from storage.buckets order by id
    loop
        report := report || format(E'\n  %s | ommaviy=%s | hajm chegarasi=%s',
            r.id, r.public, coalesce(r.file_size_limit::text, '-'));
    end loop;

    report := report || E'\n--- storage.objects qoidalari ---';
    for r in
        select policyname, cmd, array_to_string(roles, '+') as roles,
               left(coalesce(qual, '-'), 110)       as q,
               left(coalesce(with_check, '-'), 110) as w
        from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
        order by policyname
    loop
        report := report || format(E'\n  %s | %s | %s\n      using=%s\n      check=%s',
            r.policyname, r.cmd, r.roles, r.q, r.w);
    end loop;

    report := report || E'\n--- har bir baketda nechta fayl bor ---';
    for r in
        select bucket_id, count(*) as soni from storage.objects group by bucket_id order by bucket_id
    loop
        report := report || format(E'\n  %s: %s', r.bucket_id, r.soni);
    end loop;

    raise exception 'NATIJA:%', report;
end
$check$;
