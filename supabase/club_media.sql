-- ===========================================================================
-- KLUB LOGOSI VA MUQOVA RASMI
--
-- MUAMMO: klub kartasida muqova o'rnida gradient rang turardi (klub ID
-- raqamidan tanlanadigan oltita rangdan biri), logo o'rnida esa klub
-- nomining birinchi harfi. Rasm yuklash yo'li umuman yo'q edi.
--
-- YECHIM: yangi JADVAL kerak emas - fayl yo'llari `clubs.data` ichida
-- saqlanadi (u supabase/club_contacts.sql da qo'shilgan). Bu yerda faqat
-- fayllar uchun OMBOR ochiladi.
--
-- Ma'lumot shakli:
--   { "media": { "logoPath": "...", "bannerPath": "..." } }
--
-- NEGA OCHIQ OMBOR: klub logosi va muqovasi - ochiq brend ma'lumoti, u
-- klublar ro'yxatida o'nlab karta ustida bir vaqtda ko'rinadi. Yopiq
-- omborda har rasm uchun alohida imzolangan havola olish kerak bo'lardi
-- va ular bir soatdan keyin ishlamay qolardi, ya'ni brauzer ularni
-- keshlay olmasdi. Diplom nusxasi kabi shaxsiy hujjatlar esa aksincha
-- YOPIQ omborda qoladi (supabase/club_achievements.sql).
--
-- Supabase SQL Editor da bir marta ishga tushiriladi.
-- ===========================================================================

insert into storage.buckets (id, name, public)
values ('club-media', 'club-media', true)
on conflict (id) do update set public = true;

-- ---------------------------------------------------------------------------
-- RUXSATLAR
--
-- O'qish: hamma (ombor ochiq).
-- Yozish: tizimga kirgan foydalanuvchi. Kim qaysi klubning rasmini
-- almashtira olishi KODDA hal qilinadi (klubni tahrirlash huquqi bilan
-- bir xil) - siyosatda emas, chunki bu yerda faylni klub bilan bog'laydigan
-- yagona narsa fayl yo'li, va unga tayanish ishonchsiz bo'lardi.
-- ---------------------------------------------------------------------------
drop policy if exists club_media_read   on storage.objects;
drop policy if exists club_media_write  on storage.objects;
drop policy if exists club_media_update on storage.objects;
drop policy if exists club_media_delete on storage.objects;

create policy club_media_read on storage.objects
    for select
    using (bucket_id = 'club-media');

create policy club_media_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'club-media');

-- Rasm almashtirilganda eskisi ustiga yoziladi (upsert), shuning uchun
-- update ham kerak.
create policy club_media_update on storage.objects
    for update to authenticated
    using (bucket_id = 'club-media')
    with check (bucket_id = 'club-media');

create policy club_media_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'club-media');

-- ---------------------------------------------------------------------------
-- TEKSHIRUV
-- ---------------------------------------------------------------------------
select id, name, public from storage.buckets where id = 'club-media';
