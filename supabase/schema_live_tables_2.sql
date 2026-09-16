-- =====================================================================
-- JONLI BAZADAGI JADVALLAR - 2-QISM (document_audit_logs ... document_counters)
--
-- 2026-09-16 da jonli bazadan chiqarildi (_sxema_chiqarish.sql, bolim 2).
-- 1-qism: schema_live_tables.sql
--
-- DIQQAT, ko'chirishda: `profiles` jadvali `auth.users` ga bog'langan va
-- `user_role` turi hamda `profiles_display_number_seq` ketma-ketligi
-- oldindan mavjud bo'lishi kerak. `profiles_directory` esa ko'rinish
-- (view) bo'lishi mumkin - uni alohida tekshirish kerak.
-- =====================================================================

-- ===== document_audit_logs =====
create table if not exists public.document_audit_logs (
    id text not null,
    protocol_id text,
    document_id text,
    action text not null,
    data jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null
);
alter table public.document_audit_logs add constraint document_audit_logs_pkey PRIMARY KEY (id);
CREATE INDEX document_audit_protocol_idx ON public.document_audit_logs USING btree (protocol_id);
CREATE INDEX document_audit_document_idx ON public.document_audit_logs USING btree (document_id);

-- ===== event_collection_items =====
create table if not exists public.event_collection_items (
    id text not null,
    collection_id text not null,
    activity_type text not null,
    activity_id text not null,
    contribution_type text default 'participation'::text not null,
    added_by text,
    added_at timestamp with time zone default now() not null
);
alter table public.event_collection_items add constraint event_collection_items_collection_id_activity_type_activity_key UNIQUE (collection_id, activity_type, activity_id);
alter table public.event_collection_items add constraint event_collection_items_pkey PRIMARY KEY (id);
alter table public.event_collection_items add constraint event_collection_items_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES event_collections(id) ON DELETE CASCADE;
alter table public.event_collection_items add constraint event_collection_items_activity_type_check CHECK ((activity_type = ANY (ARRAY['event'::text, 'competition'::text])));
CREATE INDEX idx_event_collection_items_collection ON public.event_collection_items USING btree (collection_id);

-- ===== event_collections =====
create table if not exists public.event_collections (
    id text not null,
    name text not null,
    description text,
    start_date date,
    end_date date,
    status text default 'DRAFT'::text not null,
    cover_image text,
    created_by text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    data jsonb default '{}'::jsonb not null
);
alter table public.event_collections add constraint event_collections_pkey PRIMARY KEY (id);

-- ===== events =====
create table if not exists public.events (
    id text not null,
    club_id text,
    title text not null,
    description text,
    date text not null,
    status text default 'upcoming'::text not null,
    location text,
    location_type text default 'physical'::text,
    linked_competition_id text,
    registration_required boolean default false,
    registration_type text,
    max_participants integer,
    waitlist_enabled boolean default false,
    approval_required boolean default false,
    registration_opens_at text,
    registration_closes_at text,
    participants jsonb default '[]'::jsonb,
    registrations jsonb default '[]'::jsonb,
    display_number integer,
    created_at timestamp with time zone default now(),
    team_min_size integer,
    team_max_size integer,
    moderation_status text default 'approved'::text not null,
    team_composition_rule text default 'mixed'::text,
    team_course_rule text default 'mixed'::text,
    end_time text,
    data jsonb default '{}'::jsonb not null
);
alter table public.events add constraint events_pkey PRIMARY KEY (id);
alter table public.events add constraint events_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id);
alter table public.events add constraint events_moderation_status_check CHECK ((moderation_status = ANY (ARRAY['approved'::text, 'pending'::text, 'rejected'::text])));

-- ===== memberships =====
create table if not exists public.memberships (
    id uuid default gen_random_uuid() not null,
    user_id uuid,
    club_id text,
    role text default 'member'::text not null,
    joined_at timestamp with time zone default now()
);
alter table public.memberships add constraint memberships_user_id_club_id_key UNIQUE (user_id, club_id);
alter table public.memberships add constraint memberships_pkey PRIMARY KEY (id);
alter table public.memberships add constraint memberships_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;
alter table public.memberships add constraint memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ===== notifications =====
create table if not exists public.notifications (
    id text not null,
    user_id text not null,
    type text not null,
    title text not null,
    message text,
    ref_id text,
    ref_type text,
    is_read boolean default false,
    created_at timestamp with time zone default now(),
    expires_at timestamp with time zone
);
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);

-- ===== profiles =====
-- TALAB: `user_role` enum turi va `profiles_display_number_seq` ketma-ketligi
-- oldin yaratilgan bo'lishi kerak; `auth.users` esa Supabase auth bilan keladi.
create table if not exists public.profiles (
    id uuid not null,
    username text not null,
    full_name text not null,
    role user_role default 'TALABA'::user_role not null,
    faculty text,
    course integer,
    student_group text,
    student_id text,
    gender text,
    professionalism text,
    display_number integer default nextval('profiles_display_number_seq'::regclass) not null,
    created_at timestamp with time zone default now()
);
alter table public.profiles add constraint profiles_username_key UNIQUE (username);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ===== profiles_directory =====
create table if not exists public.profiles_directory (
    id uuid,
    username text,
    full_name text,
    faculty text,
    course integer,
    role user_role,
    student_group text,
    student_id text,
    gender text,
    professionalism text
);

-- ===== protocol_participants =====
create table if not exists public.protocol_participants (
    id text not null,
    protocol_id text not null,
    data jsonb default '{}'::jsonb not null
);
alter table public.protocol_participants add constraint protocol_participants_pkey PRIMARY KEY (id);
alter table public.protocol_participants add constraint protocol_participants_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE CASCADE;
CREATE INDEX protocol_participants_protocol_idx ON public.protocol_participants USING btree (protocol_id);

-- ===== protocol_signers =====
create table if not exists public.protocol_signers (
    id text not null,
    protocol_id text not null,
    username text not null,
    status text default 'pending'::text not null,
    data jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null
);
alter table public.protocol_signers add constraint protocol_signers_pkey PRIMARY KEY (id);
alter table public.protocol_signers add constraint protocol_signers_protocol_id_fkey FOREIGN KEY (protocol_id) REFERENCES protocols(id) ON DELETE CASCADE;
CREATE INDEX protocol_signers_protocol_idx ON public.protocol_signers USING btree (protocol_id);

-- ===== protocols =====
create table if not exists public.protocols (
    id text not null,
    activity_type text not null,
    activity_id text not null,
    registration_number text not null,
    status text default 'draft'::text not null,
    revision integer default 1 not null,
    data jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null
);
alter table public.protocols add constraint protocols_registration_number_key UNIQUE (registration_number);
alter table public.protocols add constraint protocols_pkey PRIMARY KEY (id);
CREATE INDEX protocols_activity_idx ON public.protocols USING btree (activity_type, activity_id);
CREATE INDEX protocols_status_idx ON public.protocols USING btree (status);

-- ===== registration_audit_logs =====
create table if not exists public.registration_audit_logs (
    id text not null,
    added_by_user_id text,
    added_student_id text,
    activity_id text not null,
    activity_type text not null,
    reason text,
    created_at timestamp with time zone default now()
);
alter table public.registration_audit_logs add constraint registration_audit_logs_pkey PRIMARY KEY (id);

-- ===== registrations =====
create table if not exists public.registrations (
    id text not null,
    activity_id text not null,
    activity_type text not null,
    user_id text not null,
    participant_snapshot jsonb,
    participant_type text default 'individual'::text not null,
    team_name text,
    team_members jsonb default '[]'::jsonb,
    min_team_size integer,
    attachments jsonb default '[]'::jsonb,
    invite_code text,
    status text default 'registered'::text not null,
    approval_required boolean default false,
    approval_status text,
    approval_comment text,
    added_by_override boolean default false,
    override_reason text,
    override_by_user_id text,
    is_repeat boolean default false,
    offer_expires_at timestamp with time zone,
    real_team_id text,
    team_confirmed_at timestamp with time zone,
    created_at timestamp with time zone default now(),
    approval_reviewed_by text,
    approval_reviewed_at timestamp with time zone
);
alter table public.registrations add constraint registrations_pkey PRIMARY KEY (id);

-- ===== student_recognitions =====
create table if not exists public.student_recognitions (
    id text not null,
    kind text not null,
    activity_type text,
    activity_id text,
    activity_title text,
    student_id text not null,
    source text default 'manual'::text not null,
    place integer,
    participation_description text,
    amount text,
    prize_title text,
    status text default 'pending'::text not null,
    proposed_by text,
    proposed_at timestamp with time zone default now() not null,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    review_comment text,
    data jsonb default '{}'::jsonb not null
);
alter table public.student_recognitions add constraint student_recognitions_pkey PRIMARY KEY (id);
alter table public.student_recognitions add constraint student_recognitions_activity_type_check CHECK ((activity_type = ANY (ARRAY['event'::text, 'competition'::text])));
alter table public.student_recognitions add constraint student_recognitions_kind_check CHECK ((kind = ANY (ARRAY['incentive'::text, 'prize'::text])));
alter table public.student_recognitions add constraint student_recognitions_source_check CHECK ((source = ANY (ARRAY['auto'::text, 'manual'::text])));
alter table public.student_recognitions add constraint student_recognitions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
CREATE INDEX idx_student_recognitions_status ON public.student_recognitions USING btree (status);
CREATE INDEX idx_student_recognitions_student ON public.student_recognitions USING btree (student_id);
CREATE INDEX idx_student_recognitions_activity ON public.student_recognitions USING btree (activity_type, activity_id);

-- ===== team_members =====
create table if not exists public.team_members (
    id text not null,
    team_id text,
    user_id text not null,
    role text default 'member'::text not null,
    joined_at timestamp with time zone default now()
);
alter table public.team_members add constraint team_members_pkey PRIMARY KEY (id);
alter table public.team_members add constraint team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

-- ===== teams =====
create table if not exists public.teams (
    id text not null,
    club_id text,
    name text not null,
    description text,
    founded_at timestamp with time zone default now(),
    display_number integer
);
alter table public.teams add constraint teams_pkey PRIMARY KEY (id);
alter table public.teams add constraint teams_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id);

-- ===== tutor_group_assignments =====
create table if not exists public.tutor_group_assignments (
    id text not null,
    tutor_username text not null,
    group_name text not null,
    active boolean default true not null,
    assigned_by text,
    assigned_at timestamp with time zone default now() not null,
    ended_at timestamp with time zone
);
alter table public.tutor_group_assignments add constraint tutor_group_assignments_pkey PRIMARY KEY (id);
CREATE INDEX idx_tutor_group_assignments_group ON public.tutor_group_assignments USING btree (group_name) WHERE active;

-- ===== venues =====
create table if not exists public.venues (
    id text not null,
    data jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null
);
alter table public.venues add constraint venues_pkey PRIMARY KEY (id);

-- ===== document_counters =====
create table if not exists public.document_counters (
    scope text not null,
    value integer default 0 not null
);
alter table public.document_counters add constraint document_counters_pkey PRIMARY KEY (scope);
