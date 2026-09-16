-- =====================================================================
-- JONLI BAZADAGI JADVALLAR - loyiha fayllarida ta'rifi YO'Q bo'lganlari
--
-- 2026-09-16 da jonli bazadan chiqarildi (_sxema_chiqarish.sql).
--
-- NEGA KERAK: ilova 119 ta jadvaldan foydalanadi, ulardan 37 tasi bir
-- vaqtlar Supabase panelida qo'lda yaratilgan va loyiha fayllarida
-- ta'rifi bo'lmagan - jumladan eng asosiylari: profiles, clubs,
-- competitions, events, registrations, memberships, documents, protocols.
-- Ular yo'qolsa yoki boshqa serverga ko'chirilsa, fayllardan tiklab
-- bo'lmasdi.
--
-- 1-QISM: birinchi 19 jadval (activity_reports ... documents).
-- 2-qism alohida faylda: schema_live_tables_2.sql
-- =====================================================================

-- ===== activity_reports =====
create table if not exists public.activity_reports (
    id text not null,
    activity_id text not null,
    activity_type text not null,
    status text default 'draft'::text not null,
    submitted_by text,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    data jsonb default '{}'::jsonb not null
);
alter table public.activity_reports add constraint activity_reports_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX ar_activity_unique ON public.activity_reports USING btree (activity_id, activity_type);

-- ===== activity_tasks =====
create table if not exists public.activity_tasks (
    id text not null,
    activity_id text not null,
    activity_type text not null,
    title text not null,
    assignee_id text,
    role text,
    status text default 'todo'::text not null,
    due_date date,
    sort_order integer default 0 not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    data jsonb default '{}'::jsonb not null
);
alter table public.activity_tasks add constraint activity_tasks_pkey PRIMARY KEY (id);
CREATE INDEX at_activity_idx ON public.activity_tasks USING btree (activity_id, activity_type);
CREATE INDEX at_assignee_idx ON public.activity_tasks USING btree (assignee_id);

-- ===== award_batches =====
create table if not exists public.award_batches (
    id text not null,
    protocol_id text,
    registration_number text not null,
    status text default 'draft'::text not null,
    data jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null
);
alter table public.award_batches add constraint award_batches_registration_number_key UNIQUE (registration_number);
alter table public.award_batches add constraint award_batches_pkey PRIMARY KEY (id);
alter table public.award_batches add constraint award_batches_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE CASCADE;
CREATE INDEX award_batches_protocol_idx ON public.award_batches USING btree (protocol_id);

-- ===== award_rules =====
create table if not exists public.award_rules (
    id text not null,
    scope_type text not null,
    scope_id text,
    data jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null
);
alter table public.award_rules add constraint award_rules_pkey PRIMARY KEY (id);
CREATE INDEX award_rules_scope_idx ON public.award_rules USING btree (scope_type, scope_id);

-- ===== clubs =====
create table if not exists public.clubs (
    id text not null,
    name text not null,
    description text,
    category text,
    members_count integer default 0,
    head_coordinator_id uuid,
    points_modifier numeric default 1.0,
    display_number integer,
    created_at timestamp with time zone default now(),
    data jsonb default '{}'::jsonb not null
);
alter table public.clubs add constraint clubs_pkey PRIMARY KEY (id);
alter table public.clubs add constraint clubs_head_coordinator_id_fkey FOREIGN KEY (head_coordinator_id) REFERENCES profiles(id);

-- ===== competition_audit_logs =====
create table if not exists public.competition_audit_logs (
    id text not null,
    competition_id text not null,
    judge text,
    participant_id text,
    round integer,
    old_val jsonb,
    new_val jsonb,
    device text,
    "time" timestamp with time zone default now()
);
alter table public.competition_audit_logs add constraint competition_audit_logs_pkey PRIMARY KEY (id);

-- ===== competition_groups =====
create table if not exists public.competition_groups (
    id text not null,
    competition_id text not null,
    data jsonb not null
);
alter table public.competition_groups add constraint competition_groups_pkey PRIMARY KEY (id);

-- ===== competition_judge_roles =====
create table if not exists public.competition_judge_roles (
    id text not null,
    competition_id text not null,
    data jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null
);
alter table public.competition_judge_roles add constraint competition_judge_roles_pkey PRIMARY KEY (id);
alter table public.competition_judge_roles add constraint competition_judge_roles_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE;
CREATE INDEX competition_judge_roles_comp_idx ON public.competition_judge_roles USING btree (competition_id);

-- ===== competition_matches =====
create table if not exists public.competition_matches (
    id text not null,
    competition_id text not null,
    data jsonb not null
);
alter table public.competition_matches add constraint competition_matches_pkey PRIMARY KEY (id);

-- ===== competition_rounds =====
create table if not exists public.competition_rounds (
    id text not null,
    competition_id text not null,
    index integer not null,
    data jsonb not null
);
alter table public.competition_rounds add constraint competition_rounds_competition_id_index_key UNIQUE (competition_id, index);
alter table public.competition_rounds add constraint competition_rounds_pkey PRIMARY KEY (id);

-- ===== competition_scores =====
create table if not exists public.competition_scores (
    id text not null,
    competition_id text not null,
    round integer not null,
    judge text not null,
    participant_id text not null,
    value jsonb,
    criteria_scores jsonb default '{}'::jsonb,
    device text,
    date timestamp with time zone default now()
);
alter table public.competition_scores add constraint competition_scores_pkey PRIMARY KEY (id);

-- ===== competition_tur_schedule =====
create table if not exists public.competition_tur_schedule (
    id text not null,
    competition_id text not null,
    data jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null
);
alter table public.competition_tur_schedule add constraint competition_tur_schedule_pkey PRIMARY KEY (id);
alter table public.competition_tur_schedule add constraint competition_tur_schedule_competition_id_fkey FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE;
CREATE INDEX competition_tur_schedule_comp_idx ON public.competition_tur_schedule USING btree (competition_id);

-- ===== competitions =====
create table if not exists public.competitions (
    id text not null,
    data jsonb not null,
    created_at timestamp with time zone default now()
);
alter table public.competitions add constraint competitions_pkey PRIMARY KEY (id);

-- ===== debate_match_best_speaker_picks =====
create table if not exists public.debate_match_best_speaker_picks (
    id text not null,
    match_id text not null,
    data jsonb not null
);
alter table public.debate_match_best_speaker_picks add constraint debate_match_best_speaker_picks_pkey PRIMARY KEY (id);

-- ===== debate_match_lineups =====
create table if not exists public.debate_match_lineups (
    id text not null,
    match_id text not null,
    data jsonb not null
);
alter table public.debate_match_lineups add constraint debate_match_lineups_pkey PRIMARY KEY (id);

-- ===== debate_match_notiq_scores =====
create table if not exists public.debate_match_notiq_scores (
    id text not null,
    match_id text not null,
    data jsonb not null
);
alter table public.debate_match_notiq_scores add constraint debate_match_notiq_scores_pkey PRIMARY KEY (id);

-- ===== debate_matches =====
create table if not exists public.debate_matches (
    id text not null,
    competition_id text not null,
    data jsonb not null
);
alter table public.debate_matches add constraint debate_matches_pkey PRIMARY KEY (id);

-- ===== debate_penalties =====
create table if not exists public.debate_penalties (
    id text not null,
    competition_id text not null,
    data jsonb not null
);
alter table public.debate_penalties add constraint debate_penalties_pkey PRIMARY KEY (id);

-- ===== documents =====
create table if not exists public.documents (
    id text not null,
    protocol_id text,
    batch_id text,
    recipient_id text not null,
    document_type text not null,
    registration_number text not null,
    verification_token text not null,
    status text default 'draft'::text not null,
    data jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null
);
alter table public.documents add constraint documents_registration_number_key UNIQUE (registration_number);
alter table public.documents add constraint documents_verification_token_key UNIQUE (verification_token);
alter table public.documents add constraint documents_pkey PRIMARY KEY (id);
alter table public.documents add constraint documents_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES award_batches(id) ON DELETE SET NULL;
alter table public.documents add constraint documents_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE SET NULL;
CREATE INDEX documents_recipient_idx ON public.documents USING btree (recipient_id);
CREATE INDEX documents_protocol_idx ON public.documents USING btree (protocol_id);
CREATE INDEX documents_batch_idx ON public.documents USING btree (batch_id);
CREATE INDEX documents_status_idx ON public.documents USING btree (status);
