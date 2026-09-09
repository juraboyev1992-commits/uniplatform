-- =====================================================================
-- TADBIR DASTURI UCHUN FAYL OMBORI
--
-- Xodim xonani band qilib, tadbir boshlanguncha dasturini biriktiradi
-- (Word yoki PDF). Fayl TADBIRGA bog'lanadi, klubga emas: xona band
-- qilinganda klub bo'lmasligi ham mumkin (universitet miqyosidagi
-- yig'ilish, uchrashuv, ekskursiya).
--
-- ALOHIDA OMBOR, `club-documents` ga qo'shilmadi: u klub identifikatori
-- bo'yicha yo'llangan va o'z qoidalariga ega. Tadbir hujjatini u yerga
-- tiqishtirish ikkala omborning ham qoidasini chalkashtirardi.
--
-- YOZUV JOYI: alohida jadval YARATILMAYDI. Fayl haqidagi ma'lumot
-- tadbirning o'z `data` ustunida (`programFile`) saqlanadi - u yerda
-- allaqachon `eventType`, `level`, `speakers` kabi maydonlar turibdi.
-- Bitta fayl uchun butun jadval ochish ortiqcha bo'lardi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> hammasini nusxalab Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('event-documents', 'event-documents', false)
on conflict (id) do nothing;

drop policy if exists event_documents_files_read   on storage.objects;
drop policy if exists event_documents_files_write  on storage.objects;
drop policy if exists event_documents_files_delete on storage.objects;

-- O'QISH: kirgan har bir foydalanuvchi. Tadbir dasturi maxfiy hujjat emas -
-- u baribir zalda tarqatiladi va e'lon qilinadi.
create policy event_documents_files_read on storage.objects
    for select to authenticated
    using (bucket_id = 'event-documents');

-- YOZISH va O'CHIRISH: kirgan foydalanuvchi.
--
-- Bu qoida ATAYLAB keng va bu bilinib turishi kerak: kim qaysi tadbirga
-- fayl biriktira olishi ilova tomonida hal qilinadi (tadbir ish maydoni
-- faqat administrator va klub koordinatoriga ochiq). Ombor darajasida
-- toraytirish uchun yo'ldagi tadbir identifikatorini `events` jadvali
-- bilan solishtirish kerak bo'ladi - bu alohida ish va uni sinovsiz
-- qilish fayl yuklashni butunlay ishdan chiqarishi mumkin.
-- Loyihadagi boshqa omborlar ham hozircha shu darajada (club-documents).
create policy event_documents_files_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'event-documents');

create policy event_documents_files_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'event-documents');

select id, name, public from storage.buckets where id = 'event-documents';
