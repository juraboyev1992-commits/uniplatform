-- =====================================================================
-- TADBIR VAKOLATI (davomat belgilash huquqi)
--
-- MUAMMO: vakolat faqat BRAUZERDA saqlanardi (localStorage), Supabase'ga
-- umuman yozilmasdi. Ya'ni mas'ul vakolat beradi, ro'yxatda uni ko'radi -
-- lekin o'sha odam O'Z QURILMASIDA ochganda hech narsa yo'q.
--
-- Vakolatning butun ma'nosi BOSHQA odamga huquq berish, shuning uchun
-- brauzerda saqlanadigan vakolat aslida ishlamaydigan funksiya edi. Tugma
-- bosilardi, ro'yxatga qator qo'shilardi, natija esa yo'q.
--
-- Jadval SODDA: kim, qaysi tadbirga, qaysi huquqni oldi. Bekor qilish
-- yozuvni O'CHIRMAYDI, `active` ni false qiladi - kim qachon vakolat
-- bergani va olganini keyin tekshirish mumkin bo'lishi kerak.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> hammasini nusxalab Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================

create table if not exists public.event_delegations (
    id                text primary key,
    event_id          text not null,
    grantee_username  text not null,
    permissions       jsonb not null default '["attendance"]'::jsonb,
    granted_by        text,
    granted_at        timestamptz not null default now(),
    revoked_by        text,
    revoked_at        timestamptz,
    active            boolean not null default true
);

create index if not exists event_delegations_event_idx
    on public.event_delegations (event_id);
-- Vakolat olgan odam o'z ro'yxatini so'raydi - qidiruv shu ustun bo'yicha.
create index if not exists event_delegations_grantee_idx
    on public.event_delegations (grantee_username);

alter table public.event_delegations enable row level security;

drop policy if exists event_delegations_all on public.event_delegations;

-- O'QISH kirgan har bir foydalanuvchiga ochiq va bu SHART: vakolat olgan
-- odam o'z yozuvini ko'ra olishi kerak, aks holda tadbir unga ochilmaydi.
-- Yozuvda shaxsiy ma'lumot yo'q - faqat login va huquq nomi.
--
-- YOZISH ham kirgan foydalanuvchiga ochiq: kim vakolat bera olishi ilova
-- tomonida hal qilinadi (tadbir ish maydoni faqat administrator va klub
-- koordinatoriga ochiq). Buni baza darajasida toraytirish uchun tadbirning
-- klubi bilan a'zolikni solishtirish kerak - alohida ish.
create policy event_delegations_all on public.event_delegations
    for all to authenticated
    using (true) with check (true);

revoke all on public.event_delegations from anon;
grant select, insert, update, delete on public.event_delegations to authenticated;

notify pgrst, 'reload schema';

select count(*) as yozuvlar from public.event_delegations;
