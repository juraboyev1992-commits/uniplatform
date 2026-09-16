-- =====================================================================
-- SOZLAMA VA KATALOG JADVALLARI - YOZISH FAQAT ADMINISTRATORGA
-- (ochiq jadvallarni yopish, 1-guruh)
--
-- TESHIK: quyidagi 11 jadvalning qoidasi `for all to authenticated using
-- (true) with check (true)` edi. Login olgan istalgan talaba ilovani chetlab
-- o'tib API orqali:
--   * scholarship_settings ga o'zini baholovchi qilib yozib, BARCHA
--     talabalarning stipendiya hujjatlarini ochishi mumkin edi
--     (is_scholarship_evaluator() aynan shu jadvalni o'qiydi);
--   * ball manbalari va mezonlar qiymatini o'zgartirib, butun
--     universitetning ijtimoiy faollik reytingini buzishi mumkin edi;
--   * grant, e'tirof qoidalari, xonalar, yotoqxonalar va platforma
--     sozlamalarini (masalan koordinator yaratish ON/OFF) o'zgartirishi
--     yoki o'chirishi mumkin edi.
--
-- NEGA XAVFSIZ (2026-09-15 da kod bo'yicha tekshirildi): ilovada bu
-- jadvallarga yozadigan har bir db metodi faqat `/admin/*` sahifalaridan
-- chaqiriladi, u yerga esa App.jsx faqat ADMINISTRATOR ni kiritadi.
-- Tyutor ish joyidagi CulturalVisitsPanel `showPlaces={false}` bilan
-- ochiladi - joy saqlash tugmasi yo'q. SQL da bu jadvallarga yozadigan
-- funksiya yoki trigger yo'q. `award_rules` ga ilova umuman yozmaydi.
--
-- O'QISH O'ZGARMAYDI: talaba o'z indeksi va stipendiya shartlarini
-- hisoblashda shu jadvallarni o'qiydi. Shuning uchun skript har bir
-- `for all` qoidaning HAQIQIY `using` ifodasi va rollarini bazaning
-- o'zidan olib, aynan o'shani faqat-o'qish qoidasi qilib qayta yaratadi.
-- (`venues` va `award_rules` qoidalari loyiha fayllarida yo'q - taxmin
-- qilinmaydi.)
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni nusxalab Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================

do $lock$
declare
    tables text[] := array[
        'scholarship_settings', 'scholarship_grants', 'integration_settings',
        'social_scoring_sources', 'social_criteria_categories', 'social_criteria_subcategories',
        'award_rules', 'recognition_rules', 'venues', 'cultural_places', 'dormitories'
    ];
    t text;
    r record;
    role_list text;
begin
    foreach t in array tables loop
        if to_regclass('public.' || t) is null then
            raise notice 'jadval topilmadi, o''tkazib yuborildi: %', t;
            continue;
        end if;

        execute format('alter table public.%I enable row level security', t);

        for r in
            select policyname, cmd, roles, qual
            from pg_policies
            where schemaname = 'public' and tablename = t and cmd <> 'SELECT'
        loop
            -- `for all` qoida o'qishni ham berardi - uni aynan saqlaymiz.
            if r.cmd = 'ALL' then
                select string_agg(quote_ident(x), ', ') into role_list from unnest(r.roles) x;
                execute format('drop policy if exists %I on public.%I', r.policyname || '_read', t);
                execute format('create policy %I on public.%I for select to %s using (%s)',
                               r.policyname || '_read', t, role_list, coalesce(r.qual, 'false'));
            end if;
            execute format('drop policy %I on public.%I', r.policyname, t);
        end loop;

        execute format('create policy %I on public.%I for insert to authenticated with check (public.is_platform_admin())',
                       t || '_admin_insert', t);
        execute format('create policy %I on public.%I for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin())',
                       t || '_admin_update', t);
        execute format('create policy %I on public.%I for delete to authenticated using (public.is_platform_admin())',
                       t || '_admin_delete', t);
    end loop;
end
$lock$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- TEKSHIRUV 1 - holat (Run qilganda natija sifatida shu chiqadi).
-- To'g'ri natija: 11 qator, har birida  ochiq_yozish = 0,
-- admin_yozish = 3, oqish >= 1.
-- ---------------------------------------------------------------------
select
    t.tablename as jadval,
    count(*) filter (where p.cmd <> 'SELECT'
                     and coalesce(p.qual, '') not like '%is_platform_admin%'
                     and coalesce(p.with_check, '') not like '%is_platform_admin%') as ochiq_yozish,
    count(*) filter (where p.cmd <> 'SELECT'
                     and (coalesce(p.qual, '') like '%is_platform_admin%'
                          or coalesce(p.with_check, '') like '%is_platform_admin%'))  as admin_yozish,
    count(*) filter (where p.cmd = 'SELECT')                                          as oqish
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
  and t.tablename in ('scholarship_settings', 'scholarship_grants', 'integration_settings',
                      'social_scoring_sources', 'social_criteria_categories', 'social_criteria_subcategories',
                      'award_rules', 'recognition_rules', 'venues', 'cultural_places', 'dormitories')
group by t.tablename
order by t.tablename;

-- ---------------------------------------------------------------------
-- TEKSHIRUV 2 - xatti-harakat: rls_admin_config_tables_test.sql faylini
-- ALOHIDA ishga tushiring (talaba yoza olmasligini, admin esa yoza
-- olishini jonli bazada tekshiradi; hech narsa saqlanmaydi).
-- ---------------------------------------------------------------------
