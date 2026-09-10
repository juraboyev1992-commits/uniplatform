-- =====================================================================
-- CV / PORTFOLIO — talaba QO'LDA kiritadigan qism
--
-- ARXITEKTURA QOIDASI (eng muhimi):
--   CV alohida ma'lumotlar bazasi EMAS. GPA, klublar, tadbirlar,
--   volontyorlik, sertifikatlar, yutuqlar va musobaqalar allaqachon o'z
--   jadvallarida turadi va CV ularni FAQAT O'QIYDI. Ularni bu yerga
--   nusxalash ikki xil haqiqat yaratardi: hujjat reestrida bir xil,
--   CV da boshqacha.
--
--   Shuning uchun bu jadvalda faqat platformada MANBASI YO'Q narsalar
--   saqlanadi: talabaning o'zi haqidagi matni, tashqi havolalari,
--   ko'nikmalari, til darajalari, ish tajribasi va amaliyoti.
--
-- BITTA TALABA = BITTA QATOR. Ichki ro'yxatlar (ko'nikmalar, tillar,
-- ish tajribasi) `data` jsonb ichida massiv bo'lib turadi: ular kichik,
-- faqat egasi o'qiydi va ular bo'yicha qidiruv qilinmaydi. Har biriga
-- alohida jadval ochish bu yerda foyda bermaydi.
--
-- MAXFIYLIK: `visibility` uch qiymatli - private (faqat o'zi),
-- university (kirgan foydalanuvchilar), public (ommaviy havola).
-- Hozircha ilova faqat `private` bilan ishlaydi; ommaviy havola alohida
-- ish va u yoqilmaguncha bu ustun shunchaki saqlanadi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> hammasini nusxalab Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================

create table if not exists public.student_cv_profile (
    student_id   text primary key,
    visibility   text not null default 'private',
    template     text not null default 'classic',
    purpose      text,
    public_slug  text,
    updated_at   timestamptz not null default now(),
    data         jsonb not null default '{}'::jsonb,

    constraint student_cv_visibility_check
        check (visibility in ('private', 'university', 'public'))
);

-- Ommaviy havola takrorlanmasligi kerak. `where public_slug is not null` -
-- slug qo'yilmagan qatorlar bir-biriga xalaqit qilmasin.
create unique index if not exists student_cv_slug_unique
    on public.student_cv_profile (public_slug)
    where public_slug is not null;

alter table public.student_cv_profile enable row level security;

do $clean$
declare r record;
begin
    for r in
        select policyname from pg_policies
        where schemaname = 'public' and tablename = 'student_cv_profile'
    loop
        execute format('drop policy if exists %I on public.student_cv_profile', r.policyname);
    end loop;
end
$clean$;

-- O'QISH: o'zi, biriktirilgan mas'ul va administrator.
--
-- Ommaviy CV bu qoidadan O'TMAYDI: u kirmagan odamga ko'rinishi kerak,
-- ya'ni `security definer` funksiya orqali beriladi (hujjat tekshirish
-- sahifasi bilan bir xil naqsh). Jadvalni `anon` ga ochish esa butun
-- qatorni, jumladan telefon va emailni ochib qo'yardi.
create policy cv_select on public.student_cv_profile
    for select to authenticated using (
        student_id = public.current_username()
        or public.is_assigned_person_of(student_id)
        or public.is_platform_admin()
    );

-- YOZISH: FAQAT egasi. Administrator ham tahrirlamaydi - bu talabaning
-- o'z matni va o'z ko'nikmalari. Adminning ishi tasdiqlangan yozuvlarni
-- boshqarish, CV matnini emas.
create policy cv_write on public.student_cv_profile
    for all to authenticated
    using (student_id = public.current_username())
    with check (student_id = public.current_username());

revoke all on public.student_cv_profile from anon;
grant select, insert, update, delete on public.student_cv_profile to authenticated;

notify pgrst, 'reload schema';

select
    count(*)                                          as cv_profillari,
    count(*) filter (where visibility <> 'private')   as ommaviy
from public.student_cv_profile;
