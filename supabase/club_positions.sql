-- =====================================================================
-- KLUB LAVOZIMLARI VA ARIZALAR — brauzerdan bazaga
--
-- MUAMMO: lavozimlar ham, ularga yozilgan arizalar ham faqat localStorage
-- da saqlanardi. Talaba lavozimga ariza berardi, o'z ekranida ko'rardi -
-- lekin KOORDINATOR BOSHQA KOMPYUTERDA hech narsa ko'rmasdi. Ya'ni
-- ariza -> suhbat -> tasdiq oqimi bitta brauzer ichida qolib ketardi.
--
-- Alohida g'alati holat: tasdiqlangan arizadan tug'ilgan A'ZOLIK ROLI
-- allaqachon serverga yozilardi (`memberships`), arizaning O'ZI esa yo'q.
-- Ya'ni natija ko'chardi, uning asosi ko'chmasdi - keyin "bu odam nega
-- koordinator bo'lgan" degan savolga javob topib bo'lmasdi.
--
-- UCHTA JADVAL:
--   club_positions              - ochilgan lavozimlar (necha o'rin, talablar)
--   club_position_applications  - arizalar (suhbat, koordinator va admin bosqichi)
--   club_position_audit_logs    - kim qachon nima qilgani
--
-- SAQLASH SHAKLI: `data jsonb` + qidiruv uchun bir nechta haqiqiy ustun.
-- Obyektlar keng va bosqichma-bosqich to'ladi (suhbat sanasi, izohlar,
-- ikki bosqichli tasdiq), ustunma-ustun yozish esa bu loyihada allaqachon
-- maydon yo'qotishga olib kelgan.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> hammasini nusxalab Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================

create table if not exists public.club_positions (
    id          text primary key,
    club_id     text,
    title       text,
    status      text,
    data        jsonb not null default '{}'::jsonb
);

create index if not exists club_positions_club_idx on public.club_positions (club_id);

create table if not exists public.club_position_applications (
    id           text primary key,
    position_id  text,
    club_id      text,
    student_id   text,
    status       text,
    data         jsonb not null default '{}'::jsonb
);

create index if not exists club_pos_apps_position_idx on public.club_position_applications (position_id);
create index if not exists club_pos_apps_club_idx     on public.club_position_applications (club_id);
create index if not exists club_pos_apps_student_idx  on public.club_position_applications (student_id);

create table if not exists public.club_position_audit_logs (
    id              text primary key,
    application_id  text,
    action          text,
    time            text,
    data            jsonb not null default '{}'::jsonb
);

create index if not exists club_pos_logs_app_idx on public.club_position_audit_logs (application_id);

alter table public.club_positions             enable row level security;
alter table public.club_position_applications enable row level security;
alter table public.club_position_audit_logs   enable row level security;

drop policy if exists club_positions_all on public.club_positions;
drop policy if exists club_pos_apps_all  on public.club_position_applications;
drop policy if exists club_pos_logs_all  on public.club_position_audit_logs;

-- Kirgan foydalanuvchi o'qiydi va yozadi.
--
-- ATAYLAB keng: kim kimning arizasini ko'rishi ilova tomonida hal qilinadi
-- (koordinator o'z klubini, admin hammasini). Baza darajasida toraytirish
-- uchun klub a'zoligini tekshiradigan qoida kerak - alohida ish, va uni
-- sinovsiz qilish butun ariza oqimini buzishi mumkin.
create policy club_positions_all on public.club_positions
    for all to authenticated using (true) with check (true);
create policy club_pos_apps_all on public.club_position_applications
    for all to authenticated using (true) with check (true);
create policy club_pos_logs_all on public.club_position_audit_logs
    for all to authenticated using (true) with check (true);

revoke all on public.club_positions             from anon;
revoke all on public.club_position_applications from anon;
revoke all on public.club_position_audit_logs   from anon;
grant select, insert, update, delete on public.club_positions             to authenticated;
grant select, insert, update, delete on public.club_position_applications to authenticated;
grant select, insert, update, delete on public.club_position_audit_logs   to authenticated;

notify pgrst, 'reload schema';

select
    (select count(*) from public.club_positions)             as lavozimlar,
    (select count(*) from public.club_position_applications) as arizalar,
    (select count(*) from public.club_position_audit_logs)   as tarix;
