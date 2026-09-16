-- =====================================================================
-- storage_privacy_buckets.sql UCHUN XATTI-HARAKAT SINOVI
--
-- Hech narsa saqlanmaydi: blok oxirida ataylab xato chiqariladi.
-- Talaba va administrator akkaunti bazadan avtomatik olinadi.
--
-- Har ombor uchun talaba nomidan ikki narsa sinaladi:
--   * FAYL QO'SHA OLADIMI (yuklash o'rniga storage.objects ga qator
--     yoziladi - qoida aynan shu qatorga qo'llanadi);
--   * BOSHQA ODAMNING faylini ko'ra oladimi.
--
-- KUTILGAN NATIJA:
--   cultural-visits   : o'z papkasiga yozadi, BEGONA papkaga yo'q
--   club-achievements : yo'q (u koordinator/xodim ishi)
--   club-documents    : yo'q
--   club-media        : yo'q
--   event-documents   : yo'q
--   admin             : hamma omborga yozadi
-- =====================================================================

do $test$
declare
    v_student  uuid;
    v_admin    uuid;
    v_stu_name text;
    report text := '';
    ok boolean;
begin
    select id, username into v_student, v_stu_name
      from public.profiles where role::text = 'TALABA' limit 1;
    select id into v_admin from public.profiles where role::text = 'ADMINISTRATOR' limit 1;
    if v_student is null or v_admin is null then
        raise exception 'NATIJA: talaba yoki admin akkaunti topilmadi';
    end if;

    -- ---------- TALABA ----------
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
        json_build_object('sub', v_student, 'role', 'authenticated')::text, true);
    report := report || format(E'\n--- talaba: %s ---', v_stu_name);

    -- o'z papkasi (cultural-visits/<yil>/<login>/...)
    begin
        insert into storage.objects (bucket_id, name, owner)
        values ('cultural-visits', '2026/' || v_stu_name || '/sinov.jpg', v_student);
        report := report || E'\n  cultural-visits O''Z papkasi: yozdi (to''g''ri)';
    exception when others then
        report := report || E'\n  cultural-visits O''Z papkasi: RAD ETILDI  <-- DIQQAT (' || left(sqlerrm, 45) || ')';
    end;

    -- begona papka
    begin
        insert into storage.objects (bucket_id, name, owner)
        values ('cultural-visits', '2026/begona_talaba/sinov.jpg', v_student);
        report := report || E'\n  cultural-visits BEGONA papka: yozdi  <-- DIQQAT';
    exception when others then
        report := report || E'\n  cultural-visits BEGONA papka: rad etildi (to''g''ri)';
    end;

    -- qolgan omborlar
    begin
        insert into storage.objects (bucket_id, name, owner)
        values ('club-achievements', '1/sinov.pdf', v_student);
        report := report || E'\n  club-achievements: yozdi  <-- DIQQAT';
    exception when others then
        report := report || E'\n  club-achievements: rad etildi (to''g''ri)';
    end;
    begin
        insert into storage.objects (bucket_id, name, owner)
        values ('club-documents', '1/sinov.pdf', v_student);
        report := report || E'\n  club-documents: yozdi  <-- DIQQAT';
    exception when others then
        report := report || E'\n  club-documents: rad etildi (to''g''ri)';
    end;
    begin
        insert into storage.objects (bucket_id, name, owner)
        values ('club-media', '1/logo.png', v_student);
        report := report || E'\n  club-media: yozdi  <-- DIQQAT';
    exception when others then
        report := report || E'\n  club-media: rad etildi (to''g''ri)';
    end;
    begin
        insert into storage.objects (bucket_id, name, owner)
        values ('event-documents', 'e1/dastur.pdf', v_student);
        report := report || E'\n  event-documents: yozdi  <-- DIQQAT';
    exception when others then
        report := report || E'\n  event-documents: rad etildi (to''g''ri)';
    end;

    -- o'qish: club-media dagi mavjud fayl ko'rinadimi (ommaviy - ko'rinishi kerak)
    execute 'select exists (select 1 from storage.objects where bucket_id = ''club-media'')' into ok;
    report := report || E'\n  club-media o''qish: ' || ok || ' (true bo''lishi kerak)';

    -- ---------- ADMIN ----------
    perform set_config('request.jwt.claims',
        json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    report := report || E'\n--- administrator ---';
    begin
        insert into storage.objects (bucket_id, name, owner)
        values ('club-documents', '1/admin_sinov.pdf', v_admin);
        report := report || E'\n  club-documents: yozdi (to''g''ri)';
    exception when others then
        report := report || E'\n  club-documents: RAD ETILDI  <-- DIQQAT (' || left(sqlerrm, 45) || ')';
    end;
    begin
        insert into storage.objects (bucket_id, name, owner)
        values ('event-documents', 'e1/admin_dastur.pdf', v_admin);
        report := report || E'\n  event-documents: yozdi (to''g''ri)';
    exception when others then
        report := report || E'\n  event-documents: RAD ETILDI  <-- DIQQAT (' || left(sqlerrm, 45) || ')';
    end;
    begin
        insert into storage.objects (bucket_id, name, owner)
        values ('club-media', '1/admin_logo.png', v_admin);
        report := report || E'\n  club-media: yozdi (to''g''ri)';
    exception when others then
        report := report || E'\n  club-media: RAD ETILDI  <-- DIQQAT (' || left(sqlerrm, 45) || ')';
    end;

    execute 'reset role';
    raise exception 'NATIJA (hech narsa saqlanmadi):%', report;
end
$test$;
