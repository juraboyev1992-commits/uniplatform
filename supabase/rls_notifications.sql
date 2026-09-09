-- =====================================================================
-- BILDIRISHNOMALARNI TORAYTIRISH
--
-- MUAMMO: `notifications` jadvaliga per-qator qoida yozilmagan edi. U
-- `rls_lockdown.sql` qo'ygan umumiy "kirgan foydalanuvchi hammasini
-- ko'radi" siyosati ostida turibdi, ya'ni HAR BIR TALABA HAMMANING
-- XABARINI o'qiy oladi.
--
-- Bu hafta jadvalga yozadigan narsalar ko'paydi (faoliyat e'lonlari,
-- muddat eslatmalari, jamoa takliflari, "jamoangiz to'lmagan"), lekin
-- eng nozigi ancha oldindan bor edi: "arizangiz qaytarildi" turidagi
-- shaxsiy xabarlar. Ular hammaga ochiq turishi kerak emas.
--
-- QOIDA: o'z xabarini har kim ko'radi, xodim (ADMINISTRATOR / RAHBARIYAT /
-- TYUTOR) hammasini ko'radi.
--
-- `user_id` ni `current_username()` bilan solishtirish ATAYLAB: bu ustunda
-- username saqlanadi, auth esa uuid bilan ishlaydi. Ikkisini aralashtirish
-- shu kod bazasidagi eng ko'p takrorlangan xato manbai.
--
-- ISHGA TUSHIRISHDAN OLDIN bajarilgan bo'lishi kerak:
--   storage_privacy_student_documents.sql  -> current_username()
--   rls_personal_data.sql                  -> is_staff()
-- =====================================================================

-- 1. Yordamchi funksiyalar joyidami. Yo'q bo'lsa siyosat yaratilmaydi va
--    jadval ochiq qolaveradi - shuning uchun avval TEKSHIRILADI, keyin
--    yoziladi.
do $check$
begin
    if to_regprocedure('public.current_username()') is null then
        raise exception 'current_username() topilmadi - avval storage_privacy_student_documents.sql ni bajaring';
    end if;
    if to_regprocedure('public.is_staff()') is null then
        raise exception 'is_staff() topilmadi - avval rls_personal_data.sql ni bajaring';
    end if;
end
$check$;

-- 2. Umumiy siyosat o'rniga aniq qoida.
alter table public.notifications enable row level security;

drop policy if exists authenticated_access_notifications on public.notifications;
drop policy if exists notifications_own_or_staff on public.notifications;

create policy notifications_own_or_staff on public.notifications
    for all to authenticated
    using      (user_id::text = public.current_username() or public.is_staff())
    with check (user_id::text = public.current_username() or public.is_staff());

revoke all on public.notifications from anon;
grant select, insert, update, delete on public.notifications to authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- 3. TEKSHIRISH - darhol, ishga tushirgan zahoti
--
-- Talaba akkauntida qo'ng'iroq belgisini oching. Xabarlar ko'rinib
-- tursa - hammasi joyida.
--
-- Xabarlar BO'SH chiqsa, demak `user_id` da username emas, boshqa narsa
-- turgan ekan. Quyidagi so'rov shuni ko'rsatadi:
--
--   select n.user_id, p.username
--   from public.notifications n
--   left join public.profiles p on p.username = n.user_id::text
--   limit 20;
--
-- `username` ustuni bo'sh chiqsa - moslik yo'q.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 4. ORQAGA QAYTARISH - bir qatorda
--
-- Biror narsa noto'g'ri ketsa, avvalgi holatga qaytaradi:
--
--   drop policy if exists notifications_own_or_staff on public.notifications;
--   create policy authenticated_access_notifications on public.notifications
--       for all to authenticated using (true) with check (true);
--
-- Ma'lumot o'chmaydi - faqat kim nimani ko'rishi o'zgaradi.
-- ---------------------------------------------------------------------
