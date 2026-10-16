-- ===========================================================================
-- BUZUQ BELGILARNI TUZATISH
--
-- Topilgan holat (teams.name):
--     Yulduz jamoasi вЂ" TSUL Court loyihasi (Test 41)
-- Bo'lishi kerak:
--     Yulduz jamoasi - TSUL Court loyihasi (Test 41)
--
-- `вЂ"` - bu uzun tire (—) ning buzilgan ko'rinishi: uning UTF-8 baytlari
-- bir marta noto'g'ri kodlash bilan o'qilgan va shu holida saqlangan.
--
-- NEGA DEFIS, NEGA UZUN TIRE EMAS: jamoa nomini yasaydigan shablon
-- (`db.js`) ODDIY DEFIS ishlatadi. Uzun tire bilan tiklasak, eski
-- yozuvlar yangilaridan farq qilib qolardi.
--
-- BELGILAR `chr()` ORQALI YOZILGAN. Buzuq belgilarni bu faylga
-- to'g'ridan-to'g'ri ko'chirish xavfli: fayl boshqa kodlashda ochilsa
-- ular yana buzilib, so'rov hech narsaga mos kelmay qolardi. `chr()`
-- esa raqam bilan ishlaydi va hech qachon buzilmaydi:
--     chr(1074) = в    chr(1026) = Ђ    chr(8221) = "    chr(8482) = ™
--
-- IKKI XIL BUZILISH tuzatiladi:
--     chr(1074)||chr(1026)||chr(8221)  ->  '-'   (uzun tire)
--     chr(1074)||chr(1026)||chr(8482)  ->  ''''  (o'ng apostrof)
--
-- XAVFSIZLIK: hech narsa o'chirilmaydi, faqat matn ichidagi belgi
-- almashtiriladi. Har `update` o'z shartiga ega, ya'ni buzuq belgisi
-- yo'q qatorlarga umuman tegilmaydi.
--
-- Supabase SQL Editor da ishga tushiring. Oxirgi so'rov natijasini
-- yuboring - unda "tuzatildi" va "qoldi" ustunlari bor.
-- ===========================================================================

do $$
declare
    dash text := chr(1074) || chr(1026) || chr(8221);   -- вЂ"  (uzun tire)
    apos text := chr(1074) || chr(1026) || chr(8482);   -- вЂ™  (apostrof)
    n    integer;
begin
    -- ---------------- teams.name ----------------
    update public.teams
       set name = replace(replace(name, dash, '-'), apos, '''')
     where name like '%' || chr(1074) || chr(1026) || '%';
    get diagnostics n = row_count;
    raise notice 'teams.name: % qator tuzatildi', n;

    -- ---------------- registrations.team_name ----------------
    update public.registrations
       set team_name = replace(replace(team_name, dash, '-'), apos, '''')
     where team_name like '%' || chr(1074) || chr(1026) || '%';
    get diagnostics n = row_count;
    raise notice 'registrations.team_name: % qator tuzatildi', n;

    -- ---------------- jsonb ustunlar ----------------
    --
    -- Jamoa nomi hujjat va musobaqa yozuvlariga NUSXA bo'lib tushadi
    -- (`data` jsonb ichida). Faqat `teams.name` ni tuzatsak, reestrda
    -- eski nusxa ko'rinib turaverardi.
    --
    -- Matnga o'girib almashtiriladi va qaytadan jsonb ga o'giriladi.
    -- Defis va apostrof JSON tuzilmasiga ta'sir qilmaydi, shuning uchun
    -- bu xavfsiz.
    update public.documents
       set data = replace(replace(data::text, dash, '-'), apos, '''')::jsonb
     where data::text like '%' || chr(1074) || chr(1026) || '%';
    get diagnostics n = row_count;
    raise notice 'documents.data: % qator tuzatildi', n;

    update public.competitions
       set data = replace(replace(data::text, dash, '-'), apos, '''')::jsonb
     where data::text like '%' || chr(1074) || chr(1026) || '%';
    get diagnostics n = row_count;
    raise notice 'competitions.data: % qator tuzatildi', n;

    update public.events
       set data = replace(replace(data::text, dash, '-'), apos, '''')::jsonb
     where data::text like '%' || chr(1074) || chr(1026) || '%';
    get diagnostics n = row_count;
    raise notice 'events.data: % qator tuzatildi', n;

    update public.clubs
       set data = replace(replace(data::text, dash, '-'), apos, '''')::jsonb
     where data::text like '%' || chr(1074) || chr(1026) || '%';
    get diagnostics n = row_count;
    raise notice 'clubs.data: % qator tuzatildi', n;
end
$$;

-- ---------------------------------------------------------------------------
-- TEKSHIRUV
--
-- `qoldi` ustuni HAMMA joyda 0 bo'lishi kerak.
--
-- Agar biror joyda 0 dan katta son qolsa - demak boshqa turdagi buzilish
-- ham bor (masalan qo'shtirnoq yoki o'zbekcha `oʻ`). Shu jadvalni menga
-- ayting, qaysi belgi ekanini aniqlaymiz.
-- ---------------------------------------------------------------------------
select 'teams.name' as joy,
       count(*) filter (where name like '%' || chr(1074) || chr(1026) || '%') as qoldi
  from public.teams
union all
select 'registrations.team_name',
       count(*) filter (where team_name like '%' || chr(1074) || chr(1026) || '%')
  from public.registrations
union all
select 'documents.data',
       count(*) filter (where data::text like '%' || chr(1074) || chr(1026) || '%')
  from public.documents
union all
select 'competitions.data',
       count(*) filter (where data::text like '%' || chr(1074) || chr(1026) || '%')
  from public.competitions
union all
select 'events.data',
       count(*) filter (where data::text like '%' || chr(1074) || chr(1026) || '%')
  from public.events
union all
select 'clubs.data',
       count(*) filter (where data::text like '%' || chr(1074) || chr(1026) || '%')
  from public.clubs
order by qoldi desc, joy;
