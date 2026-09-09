-- =====================================================================
-- MUSOBAQA VAKOLATI — brauzerdan bazaga
--
-- Tadbir vakolati bilan AYNI muammo (supabase/event_delegations.sql):
-- vakolat faqat localStorage da saqlanardi, ya'ni tashkilotchi hakamga
-- huquq berardi, hakam esa o'z qurilmasida hech narsa ko'rmasdi.
--
-- Farqi shundaki, bu yerda huquqlar bir nechta bo'lishi mumkin (natija
-- kiritish, guruhlarni boshqarish va h.k.), shuning uchun `permissions`
-- massiv bo'lib saqlanadi.
--
-- TARIX ALOHIDA JADVALDA: kim kimga qachon vakolat bergani va olganini
-- keyin tekshirish kerak bo'ladi. Bekor qilish yozuvni o'chirmaydi,
-- `active` ni false qiladi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> hammasini nusxalab Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================

create table if not exists public.competition_delegations (
    id                text primary key,
    competition_id    text not null,
    grantee_username  text not null,
    permissions       jsonb not null default '[]'::jsonb,
    granted_by        text,
    granted_at        timestamptz not null default now(),
    revoked_by        text,
    revoked_at        timestamptz,
    active            boolean not null default true
);

create index if not exists comp_deleg_comp_idx    on public.competition_delegations (competition_id);
create index if not exists comp_deleg_grantee_idx on public.competition_delegations (grantee_username);

create table if not exists public.competition_delegation_audit_logs (
    id                text primary key,
    competition_id    text,
    action            text,
    grantee_username  text,
    permissions       jsonb,
    acting_username   text,
    time              timestamptz not null default now()
);

create index if not exists comp_deleg_log_comp_idx
    on public.competition_delegation_audit_logs (competition_id);

alter table public.competition_delegations            enable row level security;
alter table public.competition_delegation_audit_logs  enable row level security;

drop policy if exists competition_delegations_all on public.competition_delegations;
drop policy if exists competition_delegation_logs_all on public.competition_delegation_audit_logs;

-- O'qish kirgan har bir foydalanuvchiga ochiq va bu SHART: vakolat olgan
-- odam o'z yozuvini ko'ra olishi kerak, aks holda musobaqa unga ochilmaydi.
-- Yozuvda shaxsiy ma'lumot yo'q - faqat login va huquq nomlari.
create policy competition_delegations_all on public.competition_delegations
    for all to authenticated using (true) with check (true);

create policy competition_delegation_logs_all on public.competition_delegation_audit_logs
    for all to authenticated using (true) with check (true);

revoke all on public.competition_delegations           from anon;
revoke all on public.competition_delegation_audit_logs from anon;
grant select, insert, update, delete on public.competition_delegations           to authenticated;
grant select, insert, update, delete on public.competition_delegation_audit_logs to authenticated;

notify pgrst, 'reload schema';

select
    (select count(*) from public.competition_delegations)           as vakolatlar,
    (select count(*) from public.competition_delegation_audit_logs) as tarix;
