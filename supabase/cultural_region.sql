-- ============================================================================
-- 9-MEZON: HUDUD QOIDASI (oldingi "OTM hududi" yondashuvini ALMASHTIRADI)
--
-- NIMA NOTO'G'RI EDI: men metodikadagi "OTM joylashgan hudud" iborasini
--   universitet binosi va uning atrofi deb tushunib, 300 metrlik doira
--   (`campus_zones`) qurgandim. Hujjat matni buni rad etdi:
--
--     "...Samarqand, Buxoro, Toshkent, Xiva, Qo'qon, Shahrisabz va boshqa
--      shu kabi qadimiy shaharlarga (OTM joylashgan hududdan boshqa
--      joydagi) qadamjolar, turizm va ekoturizm maskanlariga qilingan
--      sayohatlar inobatga olinadi"
--
--   "Hudud" - VILOYAT/SHAHAR. TDYU Toshkentda, ya'ni Toshkentdagi qadamjo
--   hisobga olinmaydi, Samarqanddagisi olinadi.
--
--   Ikkinchi xato: cheklov FAQAT qadamjo va turizm maskanlariga tegishli.
--   Teatr, muzey, kino va xiyobon uchun joy cheklovi yo'q. Eski yondashuv
--   universitet yonidagi muzeyni ham qizil bilan belgilab, HAQIQATDA
--   hisoblanadigan tashrifni rad etishga undardi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni Run.
-- ============================================================================

-- Joy va tashrif hududi (shahar/viloyat nomi).
alter table public.cultural_places add column if not exists region text;
alter table public.cultural_visits add column if not exists region text;

-- Eski, noto'g'ri qoidaning ustunlari endi ishlatilmaydi. ATAYLAB
-- o'chirilmaydi: ularda allaqachon yozuv bo'lishi mumkin va ma'lumotni
-- yo'qotgandan ko'ra ishlatmagan xavfsizroq. Kod ularga murojaat qilmaydi.
--   (Tozalamoqchi bo'lsangiz - quyidagi uch qatorni oching.)
-- alter table public.cultural_visits drop column if exists on_campus;
-- alter table public.cultural_visits drop column if exists campus_zone_name;
-- drop table if exists public.campus_zones;

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
-- ---------------------------------------------------------------------------
select 'cultural_places.region' as ustun,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='cultural_places'
                            and column_name='region') then 'bor' else 'YO''Q' end as holat
union all
select 'cultural_visits.region',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='cultural_visits'
                            and column_name='region') then 'bor' else 'YO''Q' end;
