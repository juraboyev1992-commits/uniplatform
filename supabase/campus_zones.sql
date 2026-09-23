-- ============================================================================
-- OTM HUDUDI - madaniy tashrif uchun (9-mezon)
--
-- MUAMMO: metodika madaniy tashrif TAHSIL OLAYOTGAN OTM HUDUDIDAN TASHQARIDA
--   bo'lishini talab qiladi. Kodda bu talab umuman yo'q edi: talaba
--   universitet binosida turib "muzeyga bordim" deb qayd etsa, tizim buni
--   farqlay olmasdi.
--
-- NEGA JADVAL, NEGA KODDA EMAS:
--   Koordinatani kodga yozib qo'yish mumkin emas edi - men uni BILMAYMAN.
--   O'ylab topilgan koordinata bu yerda ayniqsa zararli: u 300 metrlik
--   doiraga taqqoslanadi, ya'ni noto'g'ri nuqta butun tekshiruvni yolg'on
--   qiladi. Shuning uchun nuqtani ADMIN xaritadan belgilaydi.
--
--   Jadval - bitta nuqta emas, RO'YXAT: OTMning bir necha binosi, o'quv
--   korpuslari va yotoqxonasi bo'lishi mumkin va ularning har biri
--   "OTM hududi" hisoblanadi.
--
-- QANDAY ISHLAYDI: tashrif qayd etilganda koordinata har bir zona bilan
--   solishtiriladi. Zona ichida bo'lsa yozuv BELGILANADI, lekin RAD
--   ETILMAYDI - bu kodda allaqachon qabul qilingan yondashuv (qarang
--   CULTURAL_PROXIMITY_METERS izohi): shahar sharoitida GPS xatosi 100
--   metrga yetadi va talabani texnika xatosi uchun jazolash noto'g'ri.
--   Qaror tasdiqlovchi mas'ulda qoladi, lekin u endi HAQIQATNI ko'radi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni Run.
--   Keyin: Admin -> Madaniy tashriflar -> OTM hududi -> nuqtani belgilang.
-- ============================================================================

create table if not exists public.campus_zones (
    id         text primary key,
    name       text not null,
    latitude   numeric not null,
    longitude  numeric not null,
    -- Doira radiusi. Sukut 300 m - `CULTURAL_PROXIMITY_METERS` bilan bir xil,
    -- ya'ni ikki tekshiruv bir xil o'lchovda ishlaydi.
    radius_m   int not null default 300 check (radius_m > 0),
    is_active  boolean not null default true,
    note       text,
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.campus_zones enable row level security;

-- O'qish - hamma kirgan foydalanuvchiga: talaba tashrif qayd etayotganda
-- uning brauzeri ham zonani bilishi kerak (ogohlantirish uchun).
drop policy if exists campus_zones_read on public.campus_zones;
create policy campus_zones_read on public.campus_zones
    for select to authenticated using (true);

-- Yozish - faqat administrator.
drop policy if exists campus_zones_write on public.campus_zones;
create policy campus_zones_write on public.campus_zones
    for all to authenticated
    using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Tashrif yozuviga bayroq. Qayd etilgan PAYTDAGI holat saqlanadi: zona
-- keyin ko'chirilsa yoki o'chirilsa, eski tashrif qayta baholanmasin.
alter table public.cultural_visits add column if not exists on_campus boolean;
alter table public.cultural_visits add column if not exists campus_zone_name text;

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
-- ---------------------------------------------------------------------------
select 'zona' as tur, count(*)::text as qiymat from public.campus_zones
union all
select 'ustun: on_campus',
       case when exists (
           select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'cultural_visits'
              and column_name = 'on_campus'
       ) then 'bor' else 'YO''Q' end;
