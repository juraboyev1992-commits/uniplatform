-- ===========================================================================
-- KLUB ALOQA MA'LUMOTLARI VA IJTIMOIY TARMOQLARI
--
-- MUAMMO: `clubs` jadvalida faqat qat'iy ustunlar bor (name, description,
-- category, points_modifier, head_coordinator_id). Telefon, pochta, xona va
-- ijtimoiy tarmoq havolalarini saqlaydigan joy yo'q edi.
--
-- YECHIM: har kanal uchun alohida ustun EMAS, bitta `data` jsonb ustuni.
-- Sabab - platformadagi boshqa jadvallar (competitions, events, tests)
-- allaqachon shu qolipda ishlaydi: qat'iy ustunlar + o'zgaruvchan `data`.
-- Yangi ijtimoiy tarmoq qo'shilganda migratsiya kerak bo'lmaydi.
--
-- Ma'lumot shakli:
--   { "contacts": { "phone": "...", "telegram": "...", ... } }
-- Kanallar ro'yxati kodda: src/config/clubContacts.js
--
-- Supabase SQL Editor da bir marta ishga tushiriladi.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. USTUN
--
--    `not null default '{}'` - mavjud klublar ham darhol yaroqli qiymatga ega
--    bo'ladi, ya'ni o'qishda `null` tekshiruvi kerak emas.
-- ---------------------------------------------------------------------------
alter table public.clubs
    add column if not exists data jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. TEKSHIRUV: ustun qo'shildimi?
-- ---------------------------------------------------------------------------
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'clubs' and column_name = 'data';

-- ---------------------------------------------------------------------------
-- 3. RUXSAT HAQIDA
--
--    Yangi siyosat KERAK EMAS: `data` - `clubs` jadvalining oddiy ustuni va
--    u jadvalning mavjud update siyosatiga bo'ysunadi (klubni tahrirlay
--    oladigan odam aloqa ma'lumotini ham tahrirlay oladi).
--
--    Agar aloqa ma'lumotini saqlashda "row-level security" xatosi chiqsa,
--    demak muammo umuman klubni tahrirlashda - u holda `clubs` jadvalining
--    update siyosatini ko'rib chiqing:
-- ---------------------------------------------------------------------------
-- select policyname, cmd, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename = 'clubs';
