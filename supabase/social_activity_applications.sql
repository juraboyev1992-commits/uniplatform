-- =====================================================================
-- IJTIMOIY FAOLLIK ARIZALARI — brauzerdan bazaga
--
-- MUAMMO: arizalar faqat localStorage da saqlanardi. Talaba ariza yuborardi,
-- o'z ekranida ko'rardi - lekin ADMIN BOSHQA KOMPYUTERDA hech narsa
-- ko'rmasdi. Ya'ni butun tasdiqlash oqimi bitta brauzer ichida qolib
-- ketardi.
--
-- Ma'lumot yo'qolmasdi (o'sha brauzerda turaverardi), shuning uchun bitta
-- kompyuterda sinaganda hammasi ishlagandek ko'rinardi. Aynan shu sabab
-- xatoni sezish qiyin edi.
--
-- BALL YOZUVLARI (`social_score_transactions`) allaqachon serverda edi -
-- ya'ni tasdiqlangan arizaning BALLI ko'chardi, arizaning O'ZI esa yo'q.
-- Endi ikkalasi ham bir joyda.
--
-- SAQLASH SHAKLI: `data jsonb` + qidiruv uchun bir nechta haqiqiy ustun.
-- Ariza obyekti keng va erkin tuzilgan (mezon, dalil, izoh, ball manbai...),
-- ustunma-ustun yozish esa bu loyihada allaqachon xatoga olib kelgan
-- (teamMinSize/teamMaxSize yo'qolib ketgan holat). Shuning uchun butun
-- obyekt `data` da, ustunlar faqat izlash va bog'lash uchun.
--
-- `student_id` ustuni ALOHIDA turishi shart: `admin_user_history()` aynan shu
-- ustun bo'yicha "bu odamda tarix bormi" deb tekshiradi va ustun bo'lmasa
-- akkauntni o'chirishdan himoya jimgina ishlamay qolardi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> hammasini nusxalab Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================

create table if not exists public.social_activity_applications (
    id            text primary key,
    student_id    text,
    criteria_key  text,
    status        text,
    submitted_at  text,
    data          jsonb not null default '{}'::jsonb
);

create index if not exists social_apps_student_idx  on public.social_activity_applications (student_id);
create index if not exists social_apps_status_idx   on public.social_activity_applications (status);

create table if not exists public.social_activity_audit_logs (
    id              text primary key,
    application_id  text,
    action          text,
    time            text,
    data            jsonb not null default '{}'::jsonb
);

create index if not exists social_logs_app_idx on public.social_activity_audit_logs (application_id);

alter table public.social_activity_applications enable row level security;
alter table public.social_activity_audit_logs   enable row level security;

drop policy if exists social_apps_all on public.social_activity_applications;
drop policy if exists social_logs_all on public.social_activity_audit_logs;

-- Kirgan foydalanuvchi o'qiydi va yozadi.
--
-- ATAYLAB keng va bu bilinib turishi kerak: kim kimning arizasini ko'rishi
-- ilova tomonida hal qilinadi. Baza darajasida toraytirish alohida ish -
-- talaba o'zinikini, admin hammasini ko'radigan qoida yozish kerak, xuddi
-- `notifications` da qilinganidek (supabase/rls_notifications.sql).
-- Hozir toraytirilsa, tasdiqlash oqimi sinovsiz buzilishi mumkin.
create policy social_apps_all on public.social_activity_applications
    for all to authenticated using (true) with check (true);

create policy social_logs_all on public.social_activity_audit_logs
    for all to authenticated using (true) with check (true);

revoke all on public.social_activity_applications from anon;
revoke all on public.social_activity_audit_logs   from anon;
grant select, insert, update, delete on public.social_activity_applications to authenticated;
grant select, insert, update, delete on public.social_activity_audit_logs   to authenticated;

notify pgrst, 'reload schema';

select
    (select count(*) from public.social_activity_applications) as arizalar,
    (select count(*) from public.social_activity_audit_logs)   as tarix;
