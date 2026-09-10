-- =====================================================================
-- SARALASH GURUHLARI VA RO'YXAT TASDIQI — brauzerdan bazaga
--
-- Ikkita alohida, lekin bir xil sababdan kelib chiqqan muammo.
--
-- 1) SARALASH GURUHLARI (`competition_scoring_groups`)
--
-- `competition_operations.sql` bilan ishtirokchining QAYSI GURUHGA
-- biriktirilgani bazaga ko'chdi, lekin GURUHNING O'ZI brauzerda qolgan edi.
-- Bu eng yomon holat: ikkinchi hakam biriktirishlarni yuklab oladi, ammo
-- ular ko'rsatayotgan guruh uning brauzerida umuman yo'q. Ya'ni ishtirokchi
-- "mavjud bo'lmagan guruhga" biriktirilgan bo'lib chiqadi.
--
-- 2) RO'YXATDAN O'TISHNI TASDIQLASH (`registrations` ga 2 ta ustun)
--
-- Admin arizani tasdiqlaganda `approvalStatus` faqat brauzerda o'zgarardi.
-- `registrations` jadvali esa har sinxronlashda serverdan QAYTA O'QILADI -
-- ya'ni tasdiq keyingi sinxronlashda jimgina yo'qolardi va ariza yana
-- "kutilmoqda" holatiga qaytardi.
--
-- `approval_status` va `approval_comment` ustunlari allaqachon bor edi;
-- kim va qachon ko'rib chiqqani uchun ikkitasi yetishmasdi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> hammasini nusxalab Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================

create table if not exists public.competition_scoring_groups (
    id text primary key,
    competition_id text,
    data jsonb not null default '{}'::jsonb
);
create index if not exists comp_sgroups_comp_idx on public.competition_scoring_groups (competition_id);

alter table public.competition_scoring_groups enable row level security;

drop policy if exists competition_scoring_groups_all on public.competition_scoring_groups;
create policy competition_scoring_groups_all on public.competition_scoring_groups
    for all to authenticated using (true) with check (true);

revoke all on public.competition_scoring_groups from anon;
grant select, insert, update, delete on public.competition_scoring_groups to authenticated;

-- Tasdiqni kim va qachon bergani. `if not exists` - ustun allaqachon
-- bo'lsa hech narsa o'zgarmaydi.
alter table public.registrations add column if not exists approval_reviewed_by text;
alter table public.registrations add column if not exists approval_reviewed_at timestamptz;

notify pgrst, 'reload schema';

select
    (select count(*) from public.competition_scoring_groups) as saralash_guruhlari,
    (select count(*) from public.registrations where approval_status = 'pending') as kutilayotgan_arizalar;
