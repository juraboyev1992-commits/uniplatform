-- ============================================================================
-- 9-MEZON: TUMAN USTUNI
--
-- `cultural_region.sql` hudud (viloyat/shahar) ustunini qo'shgandi. Endi
-- interfeysda hudud 14 talik ro'yxatdan tanlanadi va tuman/shahar ham
-- so'raladi - shuning uchun uni saqlaydigan ustun kerak.
--
-- NEGA ALOHIDA USTUN, MANZIL ICHIDA EMAS: metodikaning qoidasi HUDUDGA
-- qarab ishlaydi, ma'lumotnomada esa joyning qayerdaligi to'liq ko'rinishi
-- kerak. Manzil erkin matn - undan tumanni ajratib olish ishonchsiz.
--
-- ESLATMA: bu fayl `supabase/cultural_region.sql` DAN KEYIN ishga tushadi.
-- Agar u hali ishga tushirilmagan bo'lsa - pastdagi guard to'xtatadi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni Run.
-- ============================================================================

do $guard$
begin
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'cultural_places'
                      and column_name = 'region') then
        raise exception 'Avval supabase/cultural_region.sql ni ishga tushiring.';
    end if;
end
$guard$;

alter table public.cultural_places add column if not exists district text;
alter table public.cultural_visits add column if not exists district text;

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
-- ---------------------------------------------------------------------------
select table_name as jadval, column_name as ustun
from information_schema.columns
where table_schema = 'public'
  and table_name in ('cultural_places', 'cultural_visits')
  and column_name in ('region', 'district')
order by table_name, column_name;
