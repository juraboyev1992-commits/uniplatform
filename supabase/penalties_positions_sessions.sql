-- =====================================================================
-- INTIZOM, LAVOZIM TAYINLASH, RAUND HOLATI VA KITOBXONLIK SEANSLARI
-- brauzerdan bazaga
--
-- Beshta yozuv turi qoldi, va ularning har biri BIR ODAM qo'yadi,
-- BOSHQASI ko'radi - ya'ni brauzerda qolishi mumkin bo'lgan narsa emas.
--
-- 1) INTIZOMIY JAZO VA DISKVALIFIKATSIYA (`social_index_penalties`)
--    Eng jiddiy. Rasmiy "Ijtimoiy faollik indeksi" (186-buyruq) shu
--    yozuvlarni o'qiydi. Bir admin talabani diskvalifikatsiya qiladi,
--    ikkinchisining ekranida talaba hamon tanlovga yaroqli ko'rinadi -
--    va indeks stipendiyaga ta'sir qiladi.
--
-- 2) INTIZOM BUZILISHLARI (`discipline_violations`)
--    Indeksning 4-mezoni. Talabaga xabar allaqachon serverga borardi,
--    xabar sababi bo'lgan YOZUVNING o'zi esa yo'q edi.
--
-- 3) LAVOZIMGA TAYINLASH YOZUVLARI (`club_position_assignments`)
--    Yana o'sha naqsh: tayinlashdan tug'ilgan A'ZOLIK ROLI serverga
--    yozilardi, tayinlashning O'ZI esa yo'q. Ya'ni "bu odamni kim,
--    qachon, qanday izoh bilan tayinlagan" degan savolga javob qolmasdi.
--
-- 4) RAUND HOLATI (`competition_round_participant_status`)
--    Raundda kim qatnashgani va kim chetlatilgani. Buni baholash paytida
--    hakam qo'yadi, ya'ni aynan har xil kompyuterdan.
--
-- 5) KITOBXONLIK SEANSI (`reading_sessions`)
--    Kutubxonachi seansni ochadi, talaba BOSHQA kompyuterda testga
--    kiradi. Seans brauzerda qolsa, talaba uchun u umuman ochilmagan
--    bo'lib chiqadi.
--
-- ESLATMA: jadvallar bo'sh yaratiladi, brauzerdagi mavjud yozuvlar
-- avtomatik ko'chmaydi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> hammasini nusxalab Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================

-- Bir talaba + bir o'quv yili = bitta yozuv (ball ayirish va
-- diskvalifikatsiya bitta qatorda turadi, kod ham shunday o'qiydi).
create table if not exists public.social_index_penalties (
    id text primary key,
    student_id text,
    academic_year text,
    data jsonb not null default '{}'::jsonb
);
create index if not exists sipen_student_idx on public.social_index_penalties (student_id);

create table if not exists public.discipline_violations (
    id text primary key,
    student_id text,
    academic_year text,
    type text,
    data jsonb not null default '{}'::jsonb
);
create index if not exists disc_student_idx on public.discipline_violations (student_id);

create table if not exists public.club_position_assignments (
    id text primary key,
    club_id text,
    student_id text,
    position_title text,
    status text,
    data jsonb not null default '{}'::jsonb
);
create index if not exists posasg_club_idx    on public.club_position_assignments (club_id);
create index if not exists posasg_student_idx on public.club_position_assignments (student_id);

create table if not exists public.competition_round_participant_status (
    id text primary key,
    competition_id text,
    participant_id text,
    data jsonb not null default '{}'::jsonb
);
create index if not exists rpstatus_comp_idx on public.competition_round_participant_status (competition_id);

create table if not exists public.reading_sessions (
    id text primary key,
    student_id text,
    test_id text,
    data jsonb not null default '{}'::jsonb
);
create index if not exists rsess_student_idx on public.reading_sessions (student_id);

alter table public.social_index_penalties               enable row level security;
alter table public.discipline_violations                enable row level security;
alter table public.club_position_assignments            enable row level security;
alter table public.competition_round_participant_status enable row level security;
alter table public.reading_sessions                     enable row level security;

do $pol$
declare t text;
begin
    foreach t in array array[
        'social_index_penalties', 'discipline_violations',
        'club_position_assignments', 'competition_round_participant_status',
        'reading_sessions'
    ] loop
        execute format('drop policy if exists %I_all on public.%I', t, t);
        -- Kirgan foydalanuvchi o'qiydi va yozadi. Kim nimani ko'rishi ilova
        -- tomonida hal qilinadi; baza darajasida toraytirish alohida ish va
        -- uni sinovsiz qilish indeks hisobini butunlay buzishi mumkin.
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
    (select count(*) from public.social_index_penalties)               as jazolar,
    (select count(*) from public.discipline_violations)                as buzilishlar,
    (select count(*) from public.club_position_assignments)            as tayinlashlar,
    (select count(*) from public.competition_round_participant_status) as raund_holati,
    (select count(*) from public.reading_sessions)                     as seanslar;
