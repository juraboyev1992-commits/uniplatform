-- ===========================================================================
-- BUZUQ BELGILARNI TOPISH (faqat SANAYDI, hech narsani o'zgartirmaydi)
--
-- MUAMMO: taqdirlash reestrida jamoa nomlari shunday ko'rinmoqda:
--     Nur yulduzlari вЂ" TSUL Court loyihasi (Test 54)
-- To'g'ri ko'rinishi:
--     Nur yulduzlari - TSUL Court loyihasi (Test 54)
--
-- SABAB: `вЂ"` - bu uzun tire (—) ning buzilgan ko'rinishi. Uning UTF-8
-- baytlari (E2 80 94) bir marta NOTO'G'RI kodlash bilan o'qilgan va shu
-- holida matn sifatida saqlanib qolgan.
--
-- KODDA EMAS: jamoa nomini yasaydigan shablon (`db.js`) boshidanoq
-- ODDIY DEFIS ishlatadi, ya'ni yangi yozuvlar to'g'ri yaratiladi.
-- Buzuq nomlar - bir marta, allaqachon bazaga yozilgan ma'lumot.
--
-- SHUNING UCHUN AVVAL SANAYMIZ. Nechta qator va qaysi jadvallarda
-- ekanini bilmasdan turib `update` yozish - ko'r-ko'rona o'zgartirish.
-- Natijani ko'rgandan keyin tuzatish so'rovi alohida yoziladi.
--
-- Supabase SQL Editor da ishga tushiring va natijani yuboring.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. QAYSI JADVALDA NECHTA
-- ---------------------------------------------------------------------------
select 'teams.name'                as joy,
       count(*)                    as buzuq_qator
  from public.teams
 where name like '%вЂ%'

union all
select 'registrations.team_name',
       count(*)
  from public.registrations
 where team_name like '%вЂ%'

union all
select 'documents.data (jsonb)',
       count(*)
  from public.documents
 where data::text like '%вЂ%'

union all
select 'competitions.data (jsonb)',
       count(*)
  from public.competitions
 where data::text like '%вЂ%'

union all
select 'events.data (jsonb)',
       count(*)
  from public.events
 where data::text like '%вЂ%'

union all
select 'clubs.data (jsonb)',
       count(*)
  from public.clubs
 where data::text like '%вЂ%'

order by buzuq_qator desc, joy;

-- ---------------------------------------------------------------------------
-- 2. NAMUNA - aynan qanday ko'rinayotganini ko'rish uchun
--
-- Agar yuqorida `teams.name` da qator chiqsa, shu so'rov 10 tasini
-- ko'rsatadi. Tuzatish so'rovi shu namunaga qarab yoziladi: buzilish
-- hamma joyda bir xilmi yoki bir nechta xil ko'rinishi bormi.
-- ---------------------------------------------------------------------------
select id, name
  from public.teams
 where name like '%вЂ%'
 limit 10;
