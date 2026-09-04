-- ===========================================================================
-- KLUB HUJJATLARI - HAQIQIY FAYL OMBORI
--
-- MUAMMO: `db.uploadClubDocument`/`getClubDocuments` mutlaqo MAHALLIY edi -
-- Supabase'ga umuman yozilmasdi (boshqa qurilmada ko'rinmasdi) va fayl
-- MAZMUNI hech qachon saqlanmasdi, faqat nomi/hajmi. "Ko'zcha" bosilganda
-- ko'rsatadigan HECH NARSA yo'q edi - chunki fayl umuman yuklanmagan edi.
--
-- YECHIM: haqiqiy jadval + yopiq ombor. Fayl endi HAQIQATAN yuklanadi,
-- ko'rish vaqtincha imzolangan havola orqali (`student_documents.sql`,
-- `club_achievements.sql` bilan bir xil qolip).
-- ===========================================================================

create table if not exists public.club_documents (
    id           text primary key,
    club_id      text not null,
    category     text not null default 'boshqa',   -- 'nizom' | 'boshqa'
    status       text not null default 'active',    -- 'active' | 'replaced' | 'removed'
    data         jsonb not null default '{}'::jsonb, -- { title, fileName, sizeLabel, filePath, uploadedBy }
    created_at   timestamptz not null default now()
);

create index if not exists club_documents_club_idx on public.club_documents (club_id, status);

alter table public.club_documents enable row level security;

drop policy if exists club_documents_select on public.club_documents;
drop policy if exists club_documents_insert on public.club_documents;
drop policy if exists club_documents_update on public.club_documents;

-- O'qish: hamma - "Klub hujjatlari" tabi ochiq (club_achievements/nizom
-- fayl bilan bir xil qolip: yozuvchi kim ekani KODDA (canManage) tekshiriladi).
create policy club_documents_select on public.club_documents
    for select to authenticated
    using (true);

create policy club_documents_insert on public.club_documents
    for insert to authenticated
    with check (true);

-- O'chirish alohida amal emas - `status: 'removed'`/'replaced' UPDATE bilan.
create policy club_documents_update on public.club_documents
    for update to authenticated
    using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('club-documents', 'club-documents', false)
on conflict (id) do nothing;

drop policy if exists club_documents_files_read  on storage.objects;
drop policy if exists club_documents_files_write on storage.objects;

create policy club_documents_files_read on storage.objects
    for select to authenticated
    using (bucket_id = 'club-documents');

create policy club_documents_files_write on storage.objects
    for insert to authenticated
    with check (bucket_id = 'club-documents');

select count(*) as yozuvlar from public.club_documents;
