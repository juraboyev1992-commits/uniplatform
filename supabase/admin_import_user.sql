-- ============================================================================
-- EXCELDAN FOYDALANUVCHI IMPORT QILISH
--
-- MUAMMO:
--   `admin_create_user` profilga faqat uchta narsani yozadi: id, username,
--   full_name (+ rol). Holbuki `profiles` jadvalida `faculty`, `course`,
--   `student_group`, `student_id`, `gender` ustunlari BOR va ilova ularga
--   tayanadi. Ularni to'ldiradigan yo'l esa butun ilovada yo'q edi:
--
--     * Ma'rifat darsi ro'yxati `faculty` + `course` bo'yicha yig'iladi ->
--       fakulteti yo'q talaba hech qaysi darsga tushmaydi -> davomat yo'q ->
--       ijtimoiy faollik indeksining EDUCATION mezoni bo'sh qoladi;
--     * tyutor `group_name` ga biriktiriladi -> guruhsiz talabaning tyutori
--       yo'q;
--     * `checkEligibility` da shart `participant?.faculty &&` ko'rinishida -
--       fakultet bo'sh bo'lsa cheklov UMUMAN tekshirilmaydi, ya'ni
--       "faqat Yuridik fakultet uchun" degan musobaqaga fakultetsiz talaba
--       bemalol yozilardi.
--
-- YECHIM: bitta yangi funksiya. Mavjud `admin_create_user` ga TEGILMAYDI -
-- u o'z holicha ishlayveradi, bu funksiya uni CHAQIRADI. `auth.users` ga
-- yozish mantig'i nusxalanmaydi: u eng nozik joy va ikki nusxa vaqt o'tib
-- bir-biridan chetga chiqib ketardi.
--
-- IKKI HOLAT:
--   1. Login mavjud EMAS -> yangi foydalanuvchi yaratiladi (parol majburiy),
--      so'ng profil maydonlari to'ldiriladi.  status = 'created'
--   2. Login MAVJUD       -> parolga ham, rolga ham TEGILMAYDI, faqat bo'sh
--      profil maydonlari to'ldiriladi.       status = 'updated'
--
--   Ikkinchi holat ataylab shunday: shu tufayli bitta faylni ikki marta
--   yuklash xavfsiz, va eski "yarim" yozuvlarni ham shu fayl bilan
--   to'ldirib olish mumkin - ularning parolini buzmasdan.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni Run.
--   Oldin supabase/admin_user_management.sql ishga tushirilgan bo'lishi shart.
-- ============================================================================

do $guard$
begin
    if to_regprocedure('public.admin_create_user(text, text, text, text)') is null then
        raise exception 'Avval supabase/admin_user_management.sql ni ishga tushiring.';
    end if;
end
$guard$;

create or replace function public.admin_import_user(
    p_username  text,
    p_full_name text default '',
    p_role      text default 'TALABA',
    p_password  text default null,
    p_faculty   text default null,
    p_course    int  default null,
    p_group     text default null,
    p_student_id text default null,
    p_gender    text default null
) returns jsonb
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
    v_uname  text := lower(trim(p_username));
    v_id     uuid;
    v_status text;
begin
    if not is_platform_admin() then
        raise exception 'Faqat administrator foydalanuvchi import qila oladi';
    end if;
    if coalesce(v_uname, '') = '' then
        raise exception 'Login kiritilmadi';
    end if;
    if p_course is not null and (p_course < 1 or p_course > 6) then
        raise exception 'Kurs 1 va 6 orasida bo''lishi kerak (kiritilgan: %)', p_course;
    end if;
    if p_gender is not null and p_gender not in ('male', 'female') then
        raise exception 'Jinsi faqat male yoki female bo''lishi mumkin (kiritilgan: %)', p_gender;
    end if;

    select id into v_id from public.profiles where username = v_uname;

    if v_id is null then
        -- Yangi foydalanuvchi. Login shakli, parol uzunligi, rol nomi va
        -- band-bandligi - hammasi admin_create_user ichida tekshiriladi.
        v_id := public.admin_create_user(v_uname, p_password, coalesce(p_full_name, ''), p_role);
        v_status := 'created';
    else
        v_status := 'updated';
    end if;

    -- Profil maydonlari. `coalesce(nullif(...), mavjud)` - bo'sh katak
    -- MAVJUD qiymatni O'CHIRMAYDI: Excelda faqat bir ustunni to'ldirib
    -- qayta yuklash mumkin bo'lsin. F.I.Sh. ham shu qoidada.
    update public.profiles
       set full_name     = coalesce(nullif(trim(coalesce(p_full_name, '')), ''), full_name),
           faculty       = coalesce(nullif(trim(coalesce(p_faculty, '')), ''), faculty),
           course        = coalesce(p_course, course),
           student_group = coalesce(nullif(trim(coalesce(p_group, '')), ''), student_group),
           student_id    = coalesce(nullif(trim(coalesce(p_student_id, '')), ''), student_id),
           gender        = coalesce(nullif(trim(coalesce(p_gender, '')), ''), gender)
     where id = v_id;

    return jsonb_build_object('status', v_status, 'user_id', v_id, 'username', v_uname);
end $$;

revoke all on function public.admin_import_user(text, text, text, text, text, int, text, text, text) from public, anon;
grant execute on function public.admin_import_user(text, text, text, text, text, int, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
-- ---------------------------------------------------------------------------
select p.proname as funksiya,
       pg_get_function_identity_arguments(p.oid) as argumentlar,
       case when p.prosecdef then 'security definer' else 'invoker' end as rejim
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('admin_create_user', 'admin_import_user')
order by p.proname;
