-- ============================================================================
-- YANGI AKKAUNT HAR DOIM TALABA BO'LSIN
--
-- MUAMMO: ro'yxatdan o'tgan har bir yangi foydalanuvchi ADMINISTRATOR rolini
-- olib, admin paneliga tushib qolardi (2026-09-06 da sinov akkaunt bilan
-- tasdiqlangan: yangi `profiles` qatori role='ADMINISTRATOR' bilan yaratildi).
--
-- SABAB: `profiles` jadvali va `auth.users` triggeri Phase 1 migratsiyasida
-- qo'lda yaratilgan, repoda SQL'i yo'q edi; role ustuni standarti yoki trigger
-- ADMINISTRATOR beradi.
--
-- YECHIM: trigger nomini bilishga bog'liq bo'lmagan qo'riqchi - `profiles`
-- jadvaliga BEFORE INSERT trigger qo'yiladi va yangi qatorning roli majburan
-- TALABA qilinadi. Qaysi yo'l bilan qator qo'shilishidan qat'i nazar ishlaydi.
--
-- ADMIN TAYINLASHGA XALAQIT QILMAYDI: admin qilish UPDATE orqali bajariladi
-- (Table Editor'da rolni o'zgartirish), bu trigger esa faqat INSERT ga tegadi.
-- ============================================================================

alter table public.profiles alter column role set default 'TALABA';

create or replace function public.force_default_role()
returns trigger language plpgsql as $$
begin
    new.role := 'TALABA';   -- yangi akkaunt HAR DOIM talaba bo'lib boshlanadi
    return new;
end $$;

drop trigger if exists profiles_force_default_role on public.profiles;
create trigger profiles_force_default_role
    before insert on public.profiles
    for each row execute function public.force_default_role();

-- ----------------------------------------------------------------------------
-- ALLAQACHON XATO BILAN ADMIN BO'LGANLARNI TUZATISH
--
-- DIQQAT: ishga tushirishdan OLDIN 'SIZNING_ADMIN_USERNAME' o'rniga o'zingizning
-- haqiqiy admin akkauntingiz username'ini yozing - aks holda o'zingiz ham
-- talabaga aylanasiz va panelga kira olmay qolasiz.
--
-- Avval ro'yxatni ko'rib oling:
--     select username, role from public.profiles where role <> 'TALABA';
-- ----------------------------------------------------------------------------

-- update public.profiles
--    set role = 'TALABA'
--  where role = 'ADMINISTRATOR'
--    and username <> 'SIZNING_ADMIN_USERNAME';
