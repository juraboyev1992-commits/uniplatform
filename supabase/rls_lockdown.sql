-- =====================================================================
-- RLS QULFLASH — anonim kirishni yopish va barcha jadvallarga RLS yoqish
--
-- MUAMMO (2026-09-08 da o'lchandi, taxmin emas):
--   Anon kalit bilan yuborilgan so'rov BARCHA jadvallarni o'qiy olardi va
--   DELETE ham bajara olardi (204 qaytardi). Anon kalit esa saytning ochiq
--   JavaScript faylida turadi — uni brauzerni ochgan har kim ko'ra oladi.
--   Ya'ni istalgan odam talabalar pasporti, akademik yozuvlar va hujjatlarni
--   o'qishi ham, o'chirishi ham mumkin edi.
--
--   Tekshiruv natijasi: 56 ta jadvaldan faqat 18 tasida RLS yoqilgan, qolgan
--   38 tasi butunlay ochiq edi.
--
-- BU FAYL NIMA QILADI:
--   1-qadam. `anon` roldan barcha jadval huquqlarini olib tashlaydi.
--   2-qadam. Ochiq tekshiruv sahifalari uchun kerakli ikkita funksiyani
--            ataylab qoldiradi.
--   3-qadam. `public` sxemadagi HAR BIR jadvalga RLS yoqadi.
--   4-qadam. Siyosati yo'q jadvallarga "kirgan foydalanuvchi" siyosatini
--            qo'shadi — sayt hozirgidek ishlashda davom etadi.
--
-- BU FAYL NIMA QILMAYDI:
--   Har bir jadval uchun "faqat o'z ma'lumotini ko'rsin" darajasidagi aniq
--   qoidalar YOZILMAYDI. U alohida ish (pastdagi 5-bo'limga qarang). Bu fayl
--   eng katta teshikni — kirmagan odamning hamma narsaga yetishini — yopadi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> hammasini nusxalab Run.
-- Bir necha marta ishga tushirish xavfsiz (idempotent).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. `anon` roldan jadval huquqlarini olib tashlash
--
-- Ilova hamma ma'lumot amali uchun kirishni talab qiladi; kirgan foydalanuvchi
-- `authenticated` rolida bo'ladi, `anon` da emas. Ochiq sahifalar (musobaqa
-- ekrani, tadbir sahifasi) ma'lumotni brauzerning o'zidan oladi, bazadan emas —
-- shuning uchun bu revoke ularga tegmaydi (tekshirilgan).
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Kelajakda yaratiladigan jadvallar ham avtomatik ochiq bo'lib qolmasin.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- `authenticated` roli ishlashda davom etadi — sayt shunga tayanadi.
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;


-- ---------------------------------------------------------------------
-- 2. Ochiq tekshiruv sahifalari uchun istisno
--
-- `/verify/:token` va `/verify/club/:number` sahifalari KIRMASDAN ochiladi:
-- diplom yoki guvohnomani qo'lida ushlab turgan odam uning haqiqiyligini
-- tekshiradi. Ular jadvalni to'g'ridan-to'g'ri o'qimaydi, `security definer`
-- funksiya chaqiradi — funksiya egasi nomidan ishlaydi va faqat kerakli
-- maydonlarni qaytaradi. Shuning uchun ularga ruxsat ATAYLAB qoldiriladi.
-- ---------------------------------------------------------------------
-- Imzo (argument turlari) qo'lda yozilmaydi: `verify_document` hali bazada
-- bo'lmasligi ham mumkin, `verify_club` niki esa kelajakda o'zgarishi mumkin.
-- Shuning uchun mavjud funksiyalar katalogdan topiladi va aynan o'z imzosi
-- bilan grant beriladi. Funksiya yo'q bo'lsa - jim o'tkazib yuboriladi.
do $grant_verify$
declare
    r record;
begin
    for r in
        select p.proname,
               pg_get_function_identity_arguments(p.oid) as args
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('verify_document', 'verify_club')
    loop
        execute format('grant execute on function public.%I(%s) to anon, authenticated',
                       r.proname, r.args);
        raise notice 'Ochiq tekshiruv funksiyasiga ruxsat qoldirildi: %(%)', r.proname, r.args;
    end loop;
end
$grant_verify$;


-- ---------------------------------------------------------------------
-- 3. Har bir jadvalga RLS yoqish
--
-- Revoke o'zi ham yetarli, lekin RLS ikkinchi qatlam: kelajakda kimdir
-- xato bilan `anon` ga grant bersa yoki yangi jadval qo'shsa, RLS baribir
-- ushlab qoladi. Ikki qatlam ataylab.
-- ---------------------------------------------------------------------
do $enable_rls$
declare
    r record;
begin
    for r in
        select c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'          -- faqat oddiy jadvallar
          and not c.relrowsecurity     -- allaqachon yoqilganiga tegilmaydi
    loop
        execute format('alter table public.%I enable row level security', r.relname);
    end loop;
end
$enable_rls$;


-- ---------------------------------------------------------------------
-- 4. Siyosati yo'q jadvallar uchun "kirgan foydalanuvchi" siyosati
--
-- RLS yoqilgan-u siyosat yo'q jadval HAMMAGA yopiq bo'lib qoladi — kirgan
-- foydalanuvchiga ham. Bu saytni butunlay ishdan chiqarardi. Shuning uchun
-- siyosati yo'q har bir jadvalga bitta siyosat qo'shiladi: kirgan
-- foydalanuvchi o'qiy va yoza oladi.
--
-- MUHIM: bu HIMOYANING OXIRI EMAS, BOSHLANISHI. U "kirmagan odam ko'rmasin"
-- muammosini yechadi, "talaba boshqa talabaning pasportini ko'rmasin"
-- muammosini emas. Ikkinchisi 5-bo'limda.
--
-- Allaqachon siyosati bor jadvallarga TEGILMAYDI — ular ustidan yozib
-- yuborish mavjud qoidalarni buzardi.
-- ---------------------------------------------------------------------
do $add_policies$
declare
    r record;
begin
    for r in
        select c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and not exists (
              select 1 from pg_policies p
              where p.schemaname = 'public' and p.tablename = c.relname
          )
    loop
        execute format(
            'create policy %I on public.%I for all to authenticated using (true) with check (true)',
            'authenticated_access_' || r.relname,
            r.relname
        );
    end loop;
end
$add_policies$;


-- ---------------------------------------------------------------------
-- 5. NATIJANI TEKSHIRISH
--
-- Quyidagi so'rov RLS yoqilmagan yoki siyosatsiz qolgan jadvallarni
-- ko'rsatadi. TO'G'RI NATIJA — bo'sh ro'yxat.
-- ---------------------------------------------------------------------
select
    c.relname                                   as jadval,
    c.relrowsecurity                            as rls_yoqilgan,
    (select count(*) from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname) as siyosatlar
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and (
      not c.relrowsecurity
      or not exists (select 1 from pg_policies p
                     where p.schemaname = 'public' and p.tablename = c.relname)
  )
order by c.relname;


-- =====================================================================
-- KEYINGI BOSQICH (bu faylda EMAS, alohida ish)
--
-- Yuqoridagi 4-bo'lim "kirgan har kim hamma narsani ko'radi" degani. Bu
-- hozirgi holatdan ancha yaxshi, lekin yakuniy emas. Keyingi qadamda maxfiy
-- jadvallar egasi/mas'uli bilan cheklanadi, masalan:
--
--   student_passport, academic_records, student_documents, talent_*,
--   scholarship_applications, social_index_*, passport_access_logs
--
-- Ular uchun qoida shaklan shunday bo'ladi:
--
--   drop policy if exists authenticated_access_student_passport on public.student_passport;
--   create policy own_or_admin on public.student_passport
--       for select to authenticated
--       using (student_id = public.current_username() or public.is_platform_admin());
--
-- Har bir jadval uchun "kim ko'rishi kerak" savoliga alohida javob kerak
-- (talabaning o'zi? tyutori? dekanat? faqat admin?), shuning uchun uni
-- ko'r-ko'rona yozib bo'lmaydi.
-- =====================================================================
