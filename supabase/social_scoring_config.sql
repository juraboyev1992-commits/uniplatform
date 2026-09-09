-- =====================================================================
-- BALL MANBALARI VA MEZONLAR — brauzerdan bazaga
--
-- MUAMMO va NEGA U JIDDIY: ijtimoiy faollik arizalari endi umumiy bazada
-- (supabase/social_activity_applications.sql), lekin ARIZA QANDAY
-- BALLANISHI har brauzerda alohida saqlanardi.
--
-- Natijasi: har admin o'z kompyuterida o'z ball manbalari bilan ishlaydi.
-- Bittasi "Volontyorlik = 5 ball" deb sozlaydi, ikkinchisida esa o'sha
-- mezon boshqa qiymatda yoki umuman yo'q. Ikki admin AYNI arizani
-- tasdiqlab, HAR XIL ball berishi mumkin - va buni hech kim sezmaydi,
-- chunki ikkalasida ham hammasi to'g'ri ko'rinadi.
--
-- Rasmiy indeks (Vazirlik 186-buyrug'i) uchun bu qabul qilib bo'lmaydi:
-- bir xil ish bir xil ball berishi kerak.
--
-- UCHTA JADVAL:
--   social_scoring_sources        - ball manbalari (mezon -> ball qiymati)
--   social_criteria_categories    - mezonlar
--   social_criteria_subcategories - mezon ichidagi bo'limlar
--
-- SAQLASH SHAKLI: `data jsonb` + qidiruv uchun bir nechta ustun. Obyektlar
-- erkin tuzilgan (amal qilish muddati, kimga tegishli, arxiv holati), va
-- bu loyihada ustunma-ustun yozish allaqachon maydon yo'qotishga olib
-- kelgan.
--
-- ESLATMA: bu jadvallar bo'sh yaratiladi. Ilova birinchi marta ochilganda
-- brauzerdagi mavjud sozlamalar AVTOMATIK KO'CHMAYDI - ular o'sha
-- kompyuterda qoladi. Sozlamalarni bir marta qaytadan kiritish yoki
-- mavjudini tahrirlab saqlash kerak: har saqlash endi bazaga yozadi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> hammasini nusxalab Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================

create table if not exists public.social_scoring_sources (
    id             text primary key,
    code           text,
    category       text,
    academic_year  text,
    is_active      boolean not null default true,
    is_archived    boolean not null default false,
    data           jsonb not null default '{}'::jsonb
);

create index if not exists scoring_sources_category_idx on public.social_scoring_sources (category);
create index if not exists scoring_sources_active_idx   on public.social_scoring_sources (is_active);

create table if not exists public.social_criteria_categories (
    id    text primary key,
    key   text,
    name  text,
    data  jsonb not null default '{}'::jsonb
);

create table if not exists public.social_criteria_subcategories (
    id           text primary key,
    category_id  text,
    name         text,
    data         jsonb not null default '{}'::jsonb
);

create index if not exists criteria_subcat_category_idx
    on public.social_criteria_subcategories (category_id);

alter table public.social_scoring_sources        enable row level security;
alter table public.social_criteria_categories    enable row level security;
alter table public.social_criteria_subcategories enable row level security;

drop policy if exists scoring_sources_all  on public.social_scoring_sources;
drop policy if exists criteria_cat_all     on public.social_criteria_categories;
drop policy if exists criteria_subcat_all  on public.social_criteria_subcategories;

-- O'QISH hammaga ochiq bo'lishi SHART: talaba o'z indeksini hisoblaganda
-- ham shu manbalar o'qiladi, ya'ni ular faqat adminga ko'rinsa, talaba
-- ekranida ball umuman chiqmasdi.
--
-- Yozish ham kirgan foydalanuvchiga ochiq - kim sozlashi ilova tomonida
-- hal qilinadi (Sozlamalar bo'limi faqat administratorga ochiq). Baza
-- darajasida toraytirish alohida ish.
create policy scoring_sources_all on public.social_scoring_sources
    for all to authenticated using (true) with check (true);
create policy criteria_cat_all on public.social_criteria_categories
    for all to authenticated using (true) with check (true);
create policy criteria_subcat_all on public.social_criteria_subcategories
    for all to authenticated using (true) with check (true);

revoke all on public.social_scoring_sources        from anon;
revoke all on public.social_criteria_categories    from anon;
revoke all on public.social_criteria_subcategories from anon;
grant select, insert, update, delete on public.social_scoring_sources        to authenticated;
grant select, insert, update, delete on public.social_criteria_categories    to authenticated;
grant select, insert, update, delete on public.social_criteria_subcategories to authenticated;

notify pgrst, 'reload schema';

select
    (select count(*) from public.social_scoring_sources)        as ball_manbalari,
    (select count(*) from public.social_criteria_categories)    as mezonlar,
    (select count(*) from public.social_criteria_subcategories) as bolimlar;
