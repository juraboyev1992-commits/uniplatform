-- ===========================================================================
-- TYUTOR ROLI
--
-- Ijtimoiy faollik metodikasi bir necha mezonning mas'uli sifatida ATAYLAB
-- tyutorni ko'rsatadi: dars davomati (6-mezon), madaniy tashriflar (9-mezon),
-- asoslovchi hujjatlar (5, 8, 10, 11-mezonlar).
--
-- Ilgari platformada bunday rol yo'q edi va o'sha ishlarning hammasi
-- administrator sozlamalarida turardi - ya'ni tyutor o'z ishini qila olmasdi,
-- yoki unga butun platformani ochib berish kerak bo'lardi.
--
-- MUHIM: rolning O'ZI hech qanday talabaga kirish huquqini bermaydi. Tyutor
-- faqat O'ZIGA BIRIKTIRILGAN talabalarni ko'radi (`talent_assignments`,
-- role = 'tutor'). Biriktiruvni administrator "Iqtidorli talabalar"
-- modulidan beradi.
--
-- DIQQAT: `profiles.role` ustuni MATN emas, ENUM turi (`user_role`). Shuning
-- uchun avval turga yangi qiymat qo'shiladi, keyingina u ishlatiladi.
-- Postgres yangi enum qiymatini O'SHA tranzaksiyada ishlatishga ruxsat
-- bermaydi, shuning uchun quyidagi ikki qadam ALOHIDA ishga tushiriladi.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1-QADAM. Turga yangi qiymat qo'shish.
--
--    FAQAT SHU QATORNI belgilab, ishga tushiring (Run selected).
--    Qayta ishga tushirish xavfsiz: `if not exists` bor.
-- ---------------------------------------------------------------------------
alter type public.user_role add value if not exists 'TYUTOR';


-- ---------------------------------------------------------------------------
-- 2-QADAM. Qolganini ishga tushiring (1-qadam tugagandan KEYIN).
--
--    Turdagi barcha qiymatlarni ko'rish - 'TYUTOR' ro'yxatda paydo bo'lganini
--    tekshirish uchun.
-- ---------------------------------------------------------------------------
select enumlabel as mavjud_rollar
from pg_enum
where enumtypid = 'public.user_role'::regtype
order by enumsortorder;


-- ---------------------------------------------------------------------------
-- 3-QADAM. Akkauntga tyutor rolini berish.
--
--    Avval odam odatdagidek ro'yxatdan o'tadi (u TALABA bo'lib yaraladi),
--    keyin shu so'rov bilan roli o'zgartiriladi.
--
--    `tyutor_ismi` o'rniga haqiqiy username ni qo'ying va qatordagi `--` ni
--    olib tashlab ishga tushiring.
-- ---------------------------------------------------------------------------
-- update public.profiles set role = 'TYUTOR' where username = 'tyutor_ismi';

-- Rolni qaytarib olish:
-- update public.profiles set role = 'TALABA' where username = 'tyutor_ismi';

-- Kimlar tyutor ekanini ko'rish (1-qadam bajarilgandan keyin ishlaydi):
-- select username, full_name, role from public.profiles
-- where role = 'TYUTOR' order by full_name;
