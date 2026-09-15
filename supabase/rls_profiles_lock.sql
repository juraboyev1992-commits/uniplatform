-- =====================================================================
-- PROFILES - ODDIY FOYDALANUVCHI O'ZINI ADMIN QILA OLMASIN
--
-- TESHIK (2026-09-15 da topildi): foydalanuvchining roli `profiles`
-- jadvalida, uning O'Z qatorida turadi. `rls_personal_data.sql` dagi
-- `profiles_own_or_staff` qoidasi esa `for all` edi - ya'ni har kimga o'z
-- qatorini YOZISHGA ham ruxsat berardi. Rolni to'suvchi trigger
-- (`profiles_force_default_role`) faqat INSERT da ishlaydi.
--
-- Natija: login olgan istalgan talaba ilovani chetlab o'tib, API'ga bitta
-- so'rov yuborib o'z rolini ADMINISTRATOR qila olardi - keyin foydalanuvchi
-- yaratish, o'chirish va parol almashtirishgacha hamma narsaga ega bo'lardi.
-- `is_staff()` tyutorni ham qamragani uchun tyutor ISTALGAN odamning rolini
-- o'zgartira olardi. `username` ham o'zgartirilishi mumkin edi - butun RLS
-- aynan shu `username` ga (current_username) tayanadi.
--
-- NEGA YOZISH HUQUQINI BUTUNLAY OLIB TASHLASH XAVFSIZ: ilova `profiles` ga
-- mijoz tomonidan HECH QACHON yozmaydi (src/ da faqat .select). Profilni
-- o'zgartiradigan uchala SQL funksiyasi - admin_create_user,
-- admin_set_user_role, admin_delete_user - `security definer`, ya'ni RLS ga
-- bo'ysunmaydi va ichida is_platform_admin() ni tekshiradi.
--
-- IKKI QULF:
--   1. faqat O'QISH qoidasi, yozish qoidasi ataylab yo'q
--   2. zaxira trigger: keyinchalik kimdir yozish qoidasini qaytarsa ham rol
--      va loginni faqat administrator o'zgartiradi. `auth.uid() is null`
--      holati (Supabase paneli, service role) ataylab ruxsat etiladi.
--
-- JONLI BAZADA TASDIQLANGAN (2026-09-15):
--   holat so'rovi                 -> 0 yozish | 1 o'qish | 1 trigger
--   talaba nomidan o'zini admin qilish urinishi -> 0 ta qator o'zgardi
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> hammasini nusxalab Run.
-- Bir necha marta ishga tushirish xavfsiz.
-- =====================================================================

do $clean$
declare r record;
begin
    for r in select policyname from pg_policies
             where schemaname = 'public' and tablename = 'profiles'
    loop
        execute format('drop policy if exists %I on public.profiles', r.policyname);
    end loop;
end
$clean$;

-- 1-qulf: faqat o'qish.
create policy profiles_select_own_or_staff on public.profiles
    for select to authenticated
    using (id::text = auth.uid()::text or public.is_staff());

-- 2-qulf: rol va loginni faqat administrator o'zgartiradi.
create or replace function public.guard_profile_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is not null and not public.is_platform_admin()
       and (new.role is distinct from old.role or new.username is distinct from old.username) then
        raise exception 'Rol va loginni faqat administrator o''zgartira oladi';
    end if;
    return new;
end $$;

drop trigger if exists profiles_guard_identity on public.profiles;
create trigger profiles_guard_identity before update on public.profiles
    for each row execute function public.guard_profile_identity();

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- TEKSHIRUV 1 - holat. To'g'ri natija: 0 | 1 | 1
-- ---------------------------------------------------------------------
select
    (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'profiles' and cmd <> 'SELECT') as yozish_qoidalari,
    (select count(*) from pg_policies
      where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT')  as oqish_qoidalari,
    (select count(*) from pg_trigger
      where tgrelid = 'public.profiles'::regclass
        and tgname = 'profiles_guard_identity')                                   as himoya_trigger;

-- ---------------------------------------------------------------------
-- TEKSHIRUV 2 - xatti-harakat. ALOHIDA ishga tushiring.
--
-- SQL Editor faqat OXIRGI buyruq natijasini ko'rsatadi, shuning uchun
-- natija xato xabari sifatida chiqariladi; xato bo'lgani uchun hech narsa
-- saqlanmaydi. `v_id` ga istalgan TALABA akkauntining id sini qo'ying.
-- Kutilgan xabar: "NATIJA: 0 ta qator ozgardi".
-- ---------------------------------------------------------------------
-- do $$
-- declare
--     v_id uuid := '00000000-0000-0000-0000-000000000000';  -- talaba id si
--     n int;
-- begin
--     execute 'set local role authenticated';
--     perform set_config('request.jwt.claims',
--         json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
--     update public.profiles set role = 'ADMINISTRATOR' where id = v_id;
--     get diagnostics n = row_count;
--     raise exception 'NATIJA: % ta qator ozgardi (0 = YOPIQ, 1 = OCHIQ). Hech narsa saqlanmadi.', n;
-- exception
--     when raise_exception then raise;
--     when others then
--         raise exception 'NATIJA: baza rad etdi (%) - YOPIQ. Hech narsa saqlanmadi.', sqlerrm;
-- end $$;
