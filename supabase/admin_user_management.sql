-- ============================================================================
-- ADMIN TOMONIDAN FOYDALANUVCHI YARATISH VA ROL BERISH
--
-- O'z-o'zidan ro'yxatdan o'tish YOPILDI (login sahifasida "Ro'yxatdan o'tish"
-- tugmasi olib tashlandi). Endi akkauntni faqat administrator yaratadi:
-- login + parol + rolni o'zi belgilaydi.
--
-- NEGA SHU YO'L: brauzerdagi ilova `anon` kalit bilan ishlaydi, u esa
-- foydalanuvchi yarata olmaydi (buning uchun `service_role` kaliti kerak,
-- lekin uni mijoz kodiga qo'yish - butun bazani ochib berish demak).
-- Shuning uchun yaratish `security definer` funksiya ichida bajariladi va
-- funksiyaning o'zi `is_platform_admin()` bilan qo'riqlanadi.
--
-- OGOHLANTIRISH: funksiya `auth.users` jadvaliga to'g'ridan-to'g'ri yozadi.
-- Bu Supabase'ning rasmiy yo'li emas (rasmiysi - Edge Function + service_role),
-- lekin keng tarqalgan amaliyot. Supabase auth sxemasi kelajakda o'zgarsa,
-- shu funksiyani yangilash kerak bo'lishi mumkin.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Yangi foydalanuvchi yaratish
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_user(
    p_username  text,
    p_password  text,
    p_full_name text default '',
    p_role      text default 'TALABA'
) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
    v_id    uuid := gen_random_uuid();
    v_uname text := lower(trim(p_username));
    v_email text;
    v_has_provider_id boolean;
begin
    if not is_platform_admin() then
        raise exception 'Faqat administrator foydalanuvchi yarata oladi';
    end if;
    if coalesce(v_uname, '') = '' then
        raise exception 'Foydalanuvchi nomi kiritilmadi';
    end if;
    if v_uname !~ '^[a-z0-9._-]+$' then
        raise exception 'Foydalanuvchi nomida faqat lotin harflari, raqam va . _ - belgilari bo''lishi mumkin';
    end if;
    if length(coalesce(p_password, '')) < 6 then
        raise exception 'Parol kamida 6 ta belgidan iborat bo''lishi kerak';
    end if;
    if p_role not in ('TALABA', 'ADMINISTRATOR', 'RAHBARIYAT', 'TYUTOR') then
        raise exception 'Noma''lum rol: %', p_role;
    end if;

    -- Ilova login sifatida username ishlatadi, Supabase Auth esa email talab
    -- qiladi - AuthContext.jsx dagi usernameToEmail() bilan bir xil ko'prik.
    v_email := v_uname || '@uniplatform.local';

    if exists (select 1 from auth.users where email = v_email) then
        raise exception 'Bu foydalanuvchi nomi band: %', v_uname;
    end if;
    if exists (select 1 from public.profiles where username = v_uname) then
        raise exception 'Bu foydalanuvchi nomi band: %', v_uname;
    end if;

    insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
        v_email, crypt(p_password, gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('username', v_uname, 'full_name', coalesce(p_full_name, '')),
        now(), now(), '', '', '', ''
    );

    -- `auth.identities` sxemasi Supabase versiyalarida farq qiladi: yangisida
    -- alohida uuid `id` va matnli `provider_id` bor, eskisida `id` ning o'zi matn.
    select exists (
        select 1 from information_schema.columns
         where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
    ) into v_has_provider_id;

    if v_has_provider_id then
        insert into auth.identities (id, user_id, identity_data, provider, provider_id,
                                     last_sign_in_at, created_at, updated_at)
        values (gen_random_uuid(), v_id,
                jsonb_build_object('sub', v_id::text, 'email', v_email),
                'email', v_id::text, now(), now(), now());
    else
        insert into auth.identities (id, user_id, identity_data, provider,
                                     last_sign_in_at, created_at, updated_at)
        values (v_id::text, v_id,
                jsonb_build_object('sub', v_id::text, 'email', v_email),
                'email', now(), now(), now());
    end if;

    -- Profilni trigger yaratgan bo'lishi mumkin (roli majburan TALABA qilinadi -
    -- profiles_role_fix.sql), bo'lmasa o'zimiz yaratamiz. Keyin kerakli rol beriladi.
    insert into public.profiles (id, username, full_name)
    values (v_id, v_uname, coalesce(p_full_name, ''))
    on conflict (id) do nothing;

    update public.profiles
       set role      = p_role,
           username  = v_uname,
           full_name = coalesce(nullif(p_full_name, ''), full_name)
     where id = v_id;

    return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Mavjud foydalanuvchining rolini o'zgartirish
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_user_role(
    p_user_id uuid,
    p_role    text
) returns void
language plpgsql security definer set search_path = public as $$
begin
    if not is_platform_admin() then
        raise exception 'Faqat administrator rolni o''zgartira oladi';
    end if;
    if p_role not in ('TALABA', 'ADMINISTRATOR', 'RAHBARIYAT', 'TYUTOR') then
        raise exception 'Noma''lum rol: %', p_role;
    end if;
    -- O'zining admin huquqini tasodifan olib tashlashdan himoya.
    if p_user_id = auth.uid() and p_role <> 'ADMINISTRATOR' then
        raise exception 'O''z rolingizni o''zgartira olmaysiz';
    end if;

    update public.profiles set role = p_role where id = p_user_id;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Parolni qayta belgilash (foydalanuvchi parolini unutganda)
-- ---------------------------------------------------------------------------
create or replace function public.admin_reset_user_password(
    p_user_id  uuid,
    p_password text
) returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
    if not is_platform_admin() then
        raise exception 'Faqat administrator parolni o''zgartira oladi';
    end if;
    if length(coalesce(p_password, '')) < 6 then
        raise exception 'Parol kamida 6 ta belgidan iborat bo''lishi kerak';
    end if;

    update auth.users
       set encrypted_password = crypt(p_password, gen_salt('bf')),
           updated_at = now()
     where id = p_user_id;
end $$;

-- ---------------------------------------------------------------------------
-- Kirmagan (anon) foydalanuvchi bu funksiyalarni umuman chaqira olmasin.
-- Kirgan foydalanuvchi chaqirsa ham, ichkarida is_platform_admin() to'sadi.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_create_user(text, text, text, text) from public, anon;
revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
revoke all on function public.admin_reset_user_password(uuid, text) from public, anon;

grant execute on function public.admin_create_user(text, text, text, text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.admin_reset_user_password(uuid, text) to authenticated;
