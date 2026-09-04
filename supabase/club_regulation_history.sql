-- ===========================================================================
-- NIZOM TAHRIR TARIXI
--
-- Tasdiqlangan nizom endi ADMIN uchun butunlay qulflanmaydi - tahrirlanishi
-- mumkin, lekin ENDI OZGINA O'ZGACHA: eski matn O'CHIRILMAYDI, "N-tahrir"
-- sifatida saqlanib qoladi. Har kim (talaba, tashqi ko'ruvchi) kichik
-- havolani bosib oldingi tahrirlarni o'qiy oladi.
--
-- `history` - o'tgan versiyalar RO'YXATI, eskisidan yangisiga. Joriy matn
-- baribir `sections` ustunida qoladi (o'zgarmadi) - `history` faqat
-- QO'SHIMCHA, mavjud o'quvchilar buzilmaydi.
-- ===========================================================================
alter table public.club_regulations
    add column if not exists history jsonb not null default '[]'::jsonb;

-- Joriy matnni OXIRGI marta kim o'zgartirgani - tahrir tarixidagi har bir
-- yozuvga "kim" ma'lumotini to'g'ri biriktirish uchun kerak.
alter table public.club_regulations
    add column if not exists last_edited_by text;
