-- =====================================================================
-- MUSOBAQA O'TKAZISH YOZUVLARI VA SERTIFIKATLAR — brauzerdan bazaga
--
-- MUAMMO: musobaqani bir necha hakam har xil kompyuterdan baholaydi, lekin
-- quyidagilar faqat o'sha hakamning brauzerida saqlanardi:
--   guruhlarga taqsimlash, o'rin raqamlari, bosqichga o'tish qoidalari,
--   teng holat qarorlari, KIM BOSQICHDAN O'TGANI (muhrlangan natija),
--   apellyatsiyalar va ular bo'yicha qarorlar tarixi, guruh amallari tarixi,
--   TSUL Court ish rollari va Zakovat savol ballari.
--
-- Ya'ni bir hakam ishtirokchilarni guruhlarga bo'ladi, ikkinchisi o'z
-- ekranida taqsimlanmagan ro'yxatni ko'radi. Apellyatsiya bergan
-- ishtirokchining shikoyati esa hech kimga yetib bormasdi.
--
-- SERTIFIKATLAR ham shu ro'yxatda: ularni turli odamlar beradi, ya'ni
-- kim nima berganini birgalikda ko'rish kerak.
--
-- SAQLASH SHAKLI: `data jsonb` + qidiruv uchun `competition_id`. Yozuvlar
-- kichik va bir xil shaklda, lekin ustunma-ustun yozish bu loyihada
-- allaqachon maydon yo'qotishga olib kelgan - shuning uchun butun obyekt
-- `data` da turadi.
--
-- ESLATMA: jadvallar bo'sh yaratiladi va brauzerdagi mavjud yozuvlar
-- avtomatik ko'chmaydi. Davom etayotgan musobaqada guruh taqsimotini bir
-- marta qaytadan saqlash kerak bo'lishi mumkin.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> hammasini nusxalab Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================

create table if not exists public.competition_participant_groups (
    id text primary key, competition_id text, participant_id text,
    data jsonb not null default '{}'::jsonb
);
create index if not exists comp_pgroups_comp_idx on public.competition_participant_groups (competition_id);

create table if not exists public.competition_participant_seats (
    id text primary key, competition_id text, participant_id text,
    data jsonb not null default '{}'::jsonb
);
create index if not exists comp_seats_comp_idx on public.competition_participant_seats (competition_id);

create table if not exists public.competition_advancement_rules (
    id text primary key, competition_id text,
    data jsonb not null default '{}'::jsonb
);
create index if not exists comp_advrules_comp_idx on public.competition_advancement_rules (competition_id);

create table if not exists public.competition_tiebreak_resolutions (
    id text primary key, competition_id text,
    data jsonb not null default '{}'::jsonb
);
create index if not exists comp_tiebreak_comp_idx on public.competition_tiebreak_resolutions (competition_id);

create table if not exists public.competition_appeals (
    id text primary key, competition_id text, participant_id text, status text,
    data jsonb not null default '{}'::jsonb
);
create index if not exists comp_appeals_comp_idx on public.competition_appeals (competition_id);

create table if not exists public.competition_group_action_logs (
    id text primary key, competition_id text, action text,
    data jsonb not null default '{}'::jsonb
);
create index if not exists comp_grouplogs_comp_idx on public.competition_group_action_logs (competition_id);

-- Muhrlangan natija: kim keyingi Turga o'tdi va yakuniy o'rinlar. Bu eng
-- muhimi - hakam "Muhrlash" tugmasini bosgach, natija hamma uchun bir xil
-- bo'lishi kerak, aks holda keyingi Tur turli ekranlarda turli ishtirokchi
-- bilan boshlanadi.
create table if not exists public.competition_advancement_results (
    id text primary key, competition_id text, context text,
    data jsonb not null default '{}'::jsonb
);
create index if not exists comp_advresults_comp_idx on public.competition_advancement_results (competition_id);

-- Apellyatsiya qarorlari tarixi: kim qaysi shikoyatni qabul qilgani yoki
-- rad etgani. Shikoyatning o'zi ko'chib, qarori ko'chmasa, "nega bu ball
-- o'zgargan" degan savolga javob qolmaydi.
create table if not exists public.competition_appeal_audit_logs (
    id text primary key, competition_id text, appeal_id text,
    data jsonb not null default '{}'::jsonb
);
create index if not exists comp_appeal_logs_appeal_idx on public.competition_appeal_audit_logs (appeal_id);

-- TSUL Court ish rollari (da'vogar / javobgar) va Zakovat savol ballari.
-- Ikkalasi ham BAHOLASHGA bevosita ta'sir qiladi: bir hakam savolga 3 ball
-- belgilasa, ikkinchisining ekranida u hamon 1 ball bo'lib qolardi.
create table if not exists public.competition_case_roles (
    id text primary key, competition_id text, participant_id text,
    data jsonb not null default '{}'::jsonb
);
create index if not exists comp_caseroles_comp_idx on public.competition_case_roles (competition_id);

create table if not exists public.competition_question_points (
    id text primary key, competition_id text,
    data jsonb not null default '{}'::jsonb
);
create index if not exists comp_qpoints_comp_idx on public.competition_question_points (competition_id);

-- Sertifikatlar. `student_id` alohida ustun: kimga nima berilgani eng
-- ko'p so'raladigan savol.
create table if not exists public.issued_certificates (
    id text primary key, student_id text, competition_id text,
    data jsonb not null default '{}'::jsonb
);
create index if not exists issued_certs_student_idx on public.issued_certificates (student_id);

alter table public.competition_participant_groups     enable row level security;
alter table public.competition_participant_seats      enable row level security;
alter table public.competition_advancement_rules      enable row level security;
alter table public.competition_tiebreak_resolutions   enable row level security;
alter table public.competition_appeals                enable row level security;
alter table public.competition_group_action_logs      enable row level security;
alter table public.competition_advancement_results    enable row level security;
alter table public.competition_appeal_audit_logs      enable row level security;
alter table public.competition_case_roles             enable row level security;
alter table public.competition_question_points        enable row level security;
alter table public.issued_certificates                enable row level security;

do $pol$
declare t text;
begin
    -- Hamma jadvalga bir xil qoida yoziladi, shuning uchun qo'lda
    -- takrorlanmaydi: bittasini o'zgartirib, qolganini unutish oson.
    foreach t in array array[
        'competition_participant_groups', 'competition_participant_seats',
        'competition_advancement_rules', 'competition_tiebreak_resolutions',
        'competition_appeals', 'competition_appeal_audit_logs',
        'competition_advancement_results', 'competition_group_action_logs',
        'competition_case_roles', 'competition_question_points',
        'issued_certificates'
    ] loop
        execute format('drop policy if exists %I_all on public.%I', t, t);
        execute format(
            'create policy %I_all on public.%I for all to authenticated using (true) with check (true)',
            t, t
        );
        execute format('revoke all on public.%I from anon', t);
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    end loop;
end
$pol$;

notify pgrst, 'reload schema';

select
    (select count(*) from public.competition_participant_groups)   as guruhlar,
    (select count(*) from public.competition_participant_seats)    as orinlar,
    (select count(*) from public.competition_advancement_rules)    as qoidalar,
    (select count(*) from public.competition_tiebreak_resolutions) as teng_holat,
    (select count(*) from public.competition_appeals)              as apellyatsiya,
    (select count(*) from public.competition_advancement_results)  as muhrlangan,
    (select count(*) from public.competition_case_roles)           as ish_rollari,
    (select count(*) from public.competition_question_points)      as savol_ballari,
    (select count(*) from public.competition_group_action_logs)    as tarix,
    (select count(*) from public.issued_certificates)              as sertifikatlar;
