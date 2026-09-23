-- ============================================================================
-- 9-MEZON: UCHTA FOTOSURAT VA "JONLI" BELGISI
--
-- NIMA O'ZGARDI:
--
--   1. Bitta surat o'rniga UCHTA. Bitta surat dalil sifatida zaif - uni
--      oldindan olib qo'yish yoki boshqa manbadan olish oson. Uchtasi ayni
--      joyda, ayni paytda turishni talab qiladi.
--
--   2. Surat endi JONLI kameradan olinadi. Ilgari `<input capture>` ishlatilgan
--      edi, lekin `capture` atributi brauzerga MASLAHAT xolos: kompyuterda va
--      ko'p telefonlarda u oddiy fayl tanlash oynasini ochardi, ya'ni
--      gallereyadagi eski surat ham o'tib ketaverardi.
--
--      Endi `getUserMedia` orqali kamera sahifaning o'zida ochiladi va kadr
--      canvas ga ko'chiriladi - u yerdan fayl tanlab bo'lmaydi.
--
--      BU KAFOLAT EMAS va buni yashirmaymiz: kamerani ekranga qaratish
--      mumkin. Shuning uchun `capture_mode` yoziladi va tasdiqlovchi
--      "fayldan tanlangan" qaydni KO'RADI.
--
-- ESKI QAYDLAR TEGILMAYDI: `photo_paths` bo'sh bo'lsa kod `photo_path` ni
-- bitta elementli ro'yxatdek ko'rsatadi. `capture_mode` da null -
-- "BILINMAYDI", "fayldan" EMAS: o'shanda bu farq umuman yozilmasdi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni Run.
-- ============================================================================

alter table public.cultural_visits
    add column if not exists photo_paths jsonb;

alter table public.cultural_visits
    add column if not exists capture_mode text;

-- Faqat ikki qiymat yoki null. Yozuvni kod to'ldiradi, lekin chegarani
-- baza qo'yishi kerak - kod o'zgaradi, baza qoladi.
do $ck$
begin
    if not exists (select 1 from pg_constraint
                    where conname = 'cultural_visits_capture_mode_chk') then
        alter table public.cultural_visits
            add constraint cultural_visits_capture_mode_chk
            check (capture_mode is null or capture_mode in ('live', 'upload'));
    end if;
end
$ck$;

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
-- ---------------------------------------------------------------------------
select column_name as ustun, data_type as turi
from information_schema.columns
where table_schema = 'public'
  and table_name = 'cultural_visits'
  and column_name in ('photo_path', 'photo_paths', 'capture_mode')
order by column_name;
