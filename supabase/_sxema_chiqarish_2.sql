-- =====================================================================
-- SXEMANI CHIQARISH, 2-QISM: FUNKSIYALAR, TRIGGERLAR VA RLS QOIDALARI
--
-- Birinchi fayl (_sxema_chiqarish.sql) jadvallarni oladi. Bu fayl esa
-- bazadagi butun mantiqni: funksiyalar (jumladan faqat jonli bazada
-- yashaydigan next_doc_number va verify_document), triggerlar va barcha
-- RLS qoidalari.
--
-- HECH NARSA O'ZGARTIRILMAYDI. Natija xato xabari ko'rinishida chiqadi -
-- hammasini nusxalab yuboring.
--
-- UZUN CHIQADI. Shuning uchun uch bo'limga bo'lingan: pastdagi `bolim`
-- ni 1, keyin 2, keyin 3 qilib UCH MARTA ishga tushiring va har birining
-- natijasini alohida yuboring.
--   1 = funksiyalar
--   2 = triggerlar
--   3 = RLS qoidalari
-- =====================================================================

do $dump$
declare
    bolim int := 1;   -- 1, keyin 2, keyin 3
    r record;
    report text := '';
begin
    if bolim = 1 then
        for r in
            select p.proname, pg_get_functiondef(p.oid) as def
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.prokind = 'f'
            order by p.proname
        loop
            report := report || E'\n\n-- ===== funksiya: ' || r.proname || E' =====\n' || r.def || ';';
        end loop;

    elsif bolim = 2 then
        for r in
            select c.relname as jadval, t.tgname, pg_get_triggerdef(t.oid) as def
            from pg_trigger t
            join pg_class c on c.oid = t.tgrelid
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and not t.tgisinternal
            order by c.relname, t.tgname
        loop
            report := report || format(E'\n-- %s\n%s;', r.jadval, r.def);
        end loop;

    else
        for r in
            select tablename, policyname, cmd, permissive,
                   array_to_string(roles, ', ') as roles, qual, with_check
            from pg_policies
            where schemaname = 'public'
            order by tablename, policyname
        loop
            report := report || format(
                E'\ncreate policy %I on public.%I\n    for %s to %s%s%s;',
                r.policyname, r.tablename,
                lower(r.cmd), r.roles,
                case when r.qual is null then '' else E'\n    using (' || r.qual || ')' end,
                case when r.with_check is null then '' else E'\n    with check (' || r.with_check || ')' end
            );
        end loop;
    end if;

    raise exception 'NATIJA (bolim %):%', bolim, report;
end
$dump$;
