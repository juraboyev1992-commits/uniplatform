-- ===========================================================================
-- FOYDALANUVCHI AKKAUNTLARINI KIM BOSHQARADI
--
-- MUAMMO: `admin_create_user`, `admin_set_user_role`,
-- `admin_reset_user_password`, `admin_set_user_blocked`,
-- `admin_delete_user` va qolganlari `is_platform_admin()` ni tekshirardi.
-- Ya'ni ADMINISTRATOR roli berilgan HAR KIM boshqa odamning parolini
-- almashtira, rolini ko'tara yoki akkauntini o'chira olardi.
--
-- Administrator roli bir necha xodimga beriladi (tadbir tasdiqlash,
-- hisobot, reyting uchun). Akkauntlar boshqaruvi esa butun tizimning
-- kaliti - u alohida, torroq doirada qolishi kerak.
--
-- YECHIM: rol YETARLI EMAS. Login alohida ro'yxatda bo'lishi ham shart.
--
-- NEGA JADVAL, NEGA KOD EMAS: ilovadagi ro'yxat (AuthContext.jsx dagi
-- USER_MANAGER_USERNAMES) brauzerda ishlaydi, ya'ni uni chetlab o'tish
-- mumkin - u faqat tugmani ko'rsatish/yashirish uchun. Haqiqiy qulf shu
-- yerda: baza so'rovni kim yuborganini o'zi tekshiradi va brauzerda nima
-- qilinganiga qaramaydi.
--
-- JADVAL API ORQALI YOPIQ: RLS yoqilgan, lekin birorta ham siyosat
-- yo'q - demak `anon` ham, `authenticated` ham uni o'qiy ham, yoza ham
-- olmaydi. Ro'yxatni faqat Supabase SQL Editor orqali (yoki service key
-- bilan) o'zgartirish mumkin. `can_manage_users()` esa `security definer`
-- bo'lgani uchun uni o'qiy oladi.
--
-- Supabase SQL Editor da bir marta ishga tushiriladi.
-- Keyin uchta faylni QAYTA ishga tushiring (ularda qo'riqchi almashtirilgan):
--   supabase/admin_user_management.sql
--   supabase/admin_user_block_delete.sql
--   supabase/admin_import_user.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. RO'YXAT
-- ---------------------------------------------------------------------------
create table if not exists public.user_managers (
    username   text primary key,
    note       text,
    added_at   timestamptz not null default now()
);

alter table public.user_managers enable row level security;

-- ATAYLAB birorta siyosat yo'q: RLS yoqilgan va siyosat bo'lmasa,
-- jadvalga API orqali umuman kirib bo'lmaydi.
drop policy if exists user_managers_read  on public.user_managers;
drop policy if exists user_managers_write on public.user_managers;

-- Boshlang'ich mas'ul. O'zgartirish kerak bo'lsa - shu yerdan emas,
-- quyidagi "RO'YXATNI O'ZGARTIRISH" bo'limidagi buyruqlar bilan.
insert into public.user_managers (username, note)
values ('admin', 'Boshlang''ich mas''ul - akkauntlar boshqaruvi')
on conflict (username) do nothing;

-- ---------------------------------------------------------------------------
-- 2. QO'RIQCHI FUNKSIYA
--
-- IKKALA shart ham bajarilishi kerak: ADMINISTRATOR roli VA ro'yxatda
-- bo'lish. Rolning o'zi yetmaydi, ro'yxatning o'zi ham yetmaydi.
--
-- XAVFSIZ STANDART: `current_username()` null qaytarsa (profil topilmasa)
-- taqqoslash hech narsaga mos kelmaydi va ruxsat berilmaydi - noaniqlik
-- holatida eshik YOPIQ bo'ladi.
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_users()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.is_platform_admin()
       and exists (
            select 1
              from public.user_managers um
             where lower(um.username) = lower(coalesce(public.current_username(), ''))
       );
$$;

comment on function public.can_manage_users() is
    'Foydalanuvchi akkauntlarini boshqarish huquqi: ADMINISTRATOR roli VA user_managers ro''yxatida bo''lish.';

-- ---------------------------------------------------------------------------
-- 3. TEKSHIRUV - ishga tushirgandan keyin shu natijalarga qarang
-- ---------------------------------------------------------------------------

-- 3.1. Ro'yxatda kim bor.
select username, note, added_at from public.user_managers order by username;

-- 3.2. ENG MUHIM TEKSHIRUV.
--
-- Ro'yxatdagi har bir login HAQIQATAN mavjudmi va ADMINISTRATOR
-- rolidami. Agar `holat` ustunida "TOPILMADI" yoki "ROLI MOS EMAS"
-- chiqsa - TO'XTANG va quyidagi bo'limdan to'g'ri loginni qo'shing.
-- Aks holda foydalanuvchilar boshqaruvi HECH KIMGA ochilmay qoladi.
select
    um.username as royxatdagi_login,
    case
        when p.username is null then 'TOPILMADI - bunday login yo''q'
        when p.role::text <> 'ADMINISTRATOR' then 'ROLI MOS EMAS: ' || p.role::text
        else 'OK'
    end as holat
from public.user_managers um
left join public.profiles p on lower(p.username) = lower(um.username)
order by um.username;

-- ---------------------------------------------------------------------------
-- RO'YXATNI O'ZGARTIRISH (kelajakda kerak bo'lganda)
--
-- Yangi mas'ul qo'shish:
--   insert into public.user_managers (username, note)
--   values ('yangi_login', 'kim va nega') on conflict do nothing;
--
-- Mas'ulni olib tashlash:
--   delete from public.user_managers where username = 'eski_login';
--
-- OGOHLANTIRISH: ro'yxatni butunlay bo'shatmang. Bo'sh bo'lsa
-- foydalanuvchilar boshqaruvi hech kimga ochilmaydi va uni faqat shu
-- yerdan, SQL Editor orqali qaytarish mumkin bo'ladi.
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';
