-- ============================================================================
-- TADBIRLAR TO'PLAMI (Event Collections)
--
-- Mavjud `events`/`competitions` yozuvlarini O'ZGARTIRMAYDI - ularni ixtiyoriy
-- ravishda bitta "to'plam"ga (masalan "Talabalar festivali 2026") biriktiradigan
-- YUPQA qatlam. To'plam o'chirilsa ham asosiy tadbir/musobaqa va uning barcha
-- natijalari saqlanib qoladi - faqat bog'lanish (event_collection_items) yo'qoladi.
--
-- Universal mexanizm: faqat festivalga emas, istalgan ko'p tadbirli loyihaga
-- (Yoshlar haftaligi, Sport haftaligi va h.k.) ishlatilishi mumkin.
-- ============================================================================

create table if not exists event_collections (
    id text primary key,
    name text not null,
    description text,
    start_date date,
    end_date date,
    status text not null default 'DRAFT', -- DRAFT | ACTIVE | COMPLETED | ARCHIVED
    cover_image text,
    created_by text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    -- scoringConfig, settingsHistory (sozlama audit izi - ClubRegulationEditor'dagi
    -- `history` naqshi bilan bir xil), tieBreakOrder shu yerda.
    data jsonb not null default '{}'::jsonb
);

create table if not exists event_collection_items (
    id text primary key,
    collection_id text not null references event_collections(id) on delete cascade,
    activity_type text not null check (activity_type in ('event', 'competition')),
    activity_id text not null,
    -- placement (o'rin balli beradi) | participation (faqat ishtirok balli) |
    -- statistics_only (statistikada ko'rinadi, ball bermaydi) | none (hisobga olinmaydi)
    contribution_type text not null default 'participation',
    added_by text,
    added_at timestamptz not null default now(),
    unique (collection_id, activity_type, activity_id)
);

-- "Bu tyutor shu guruh(lar)ga mas'ul" - platforma darajasida umumiy fakt, biror
-- bitta to'plamga bog'liq emas. Bir guruhda bir vaqtda bitta FAOL tyutor
-- bo'ladi (talent_assignments'dagi "avvalgi faolni yopish" qoidasi bilan bir xil).
create table if not exists tutor_group_assignments (
    id text primary key,
    tutor_username text not null,
    group_name text not null,
    active boolean not null default true,
    assigned_by text,
    assigned_at timestamptz not null default now(),
    ended_at timestamptz
);

create index if not exists idx_event_collection_items_collection on event_collection_items(collection_id);
create index if not exists idx_tutor_group_assignments_group on tutor_group_assignments(group_name) where active;

alter table event_collections enable row level security;
alter table event_collection_items enable row level security;
alter table tutor_group_assignments enable row level security;

-- O'qish - hammaga ochiq (klublar/tadbirlar bilan bir xil konvensiya - amaliy
-- cheklov ilovaning o'zida, admin panelidagina ko'rinadi). Yozish - faqat admin.
drop policy if exists event_collections_select on event_collections;
create policy event_collections_select on event_collections for select using (true);
drop policy if exists event_collections_write on event_collections;
create policy event_collections_write on event_collections for all
    using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists event_collection_items_select on event_collection_items;
create policy event_collection_items_select on event_collection_items for select using (true);
drop policy if exists event_collection_items_write on event_collection_items;
create policy event_collection_items_write on event_collection_items for all
    using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists tutor_group_assignments_select on tutor_group_assignments;
create policy tutor_group_assignments_select on tutor_group_assignments for select using (true);
drop policy if exists tutor_group_assignments_write on tutor_group_assignments;
create policy tutor_group_assignments_write on tutor_group_assignments for all
    using (is_platform_admin()) with check (is_platform_admin());
