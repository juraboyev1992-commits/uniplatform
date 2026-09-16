-- =====================================================================
-- JONLI BAZADAGI TRIGGERLAR (public sxemasi)
--
-- 2026-09-16 da jonli bazadan chiqarildi (_sxema_chiqarish_2.sql, bolim 2).
-- Funksiyalarning o'zi schema_live_functions.sql da.
--
-- To'rttasi ham XAVFSIZLIK triggeri - RLS qoidasi bilan hal qilib
-- bo'lmaydigan joylarni qo'riqlaydi:
--   competitions_guard_core     - musobaqa qoidalari va hakamlar ro'yxatini
--                                 faqat tashkilotchi o'zgartiradi (RLS
--                                 qatorga ishlaydi, maydonga emas);
--   memberships_guard_role      - talaba o'ziga koordinator roli yoza
--                                 olmasin;
--   profiles_force_default_role - yangi akkaunt har doim TALABA bo'lib
--                                 boshlanadi;
--   profiles_guard_identity     - rol va loginni faqat administrator
--                                 o'zgartiradi.
-- =====================================================================

CREATE TRIGGER competitions_guard_core BEFORE UPDATE ON public.competitions FOR EACH ROW EXECUTE FUNCTION guard_competition_core_fields();

CREATE TRIGGER memberships_guard_role BEFORE INSERT OR UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION guard_membership_role();

CREATE TRIGGER profiles_force_default_role BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION force_default_role();

CREATE TRIGGER profiles_guard_identity BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_identity();
