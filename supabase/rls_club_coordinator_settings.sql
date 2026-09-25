-- ============================================================================
-- KOORDINATOR O'Z KLUBINING SOZLAMASINI SAQLAY OLSIN
--
-- MUAMMO: "Klubni sozlash" oynasida koordinator aloqa ma'lumotlarini
-- kiritib "Saqlash" bosganda "Cannot coerce the result to a single JSON
-- object" chiqardi. Bu baza xatosi emas, uning OQIBATI: `clubs` jadvaliga
-- yozish FAQAT administratorga ochiq edi, qoida 0 ta qator qaytardi, kod
-- esa undan bitta obyekt yasamoqchi bo'ldi.
--
-- Ya'ni interfeys formani ko'rsatardi, baza esa jimgina rad etardi.
--
-- QOIDA ENDI: klub koordinatori O'Z klubini tahrirlaydi. Lekin HAMMA
-- maydonni emas - quyidagilar administratorda qoladi:
--
--   points_modifier     klub ballini ko'paytiruvchi koeffitsient. Buni
--                       koordinatorga ochish "o'z ballingni o'zing
--                       oshirib ol" degani.
--   head_coordinator_id klub rahbari. Bu VAKOLAT masalasi.
--   name, category      rasmiy nom va yo'nalish - guvohnomada turadi.
--   registryNumber      ro'yxatga olish raqami, guvohnoma raqami va
--   certificateNumber   ro'yxatdan o'tish holati. Klub o'zini o'zi
--   registrationStatus  ro'yxatga ola olmaydi.
--   operationalStatus
--   members_count       hisoblanadigan qiymat, qo'lda yozilmaydi.
--
-- Koordinatorga ochiq: tavsif, aloqa ma'lumotlari, qisqa nom, "biz
-- haqimizda", a'zolik tartibi va anketasi, zinapoya talablari.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni Run.
-- ============================================================================

do $guard$
begin
    if to_regprocedure('public.is_club_officer(text)') is null
       or to_regprocedure('public.is_platform_admin()') is null then
        raise exception 'Avval supabase/rls_documents_attendance.sql ni ishga tushiring.';
    end if;
end
$guard$;

-- ---------------------------------------------------------------------
-- 1. QO'RIQCHI - qaysi maydonga tegish mumkin
-- ---------------------------------------------------------------------
create or replace function public.guard_club_core_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $trg$
declare
    k text;
    protected_keys text[] := array[
        'registrationStatus', 'operationalStatus', 'registryNumber', 'registeredAt',
        'certificateNumber', 'applicationId', 'clubType', 'createdFrom', 'createdBy',
        'status'
    ];
begin
    if public.is_platform_admin() then
        return new;
    end if;

    -- Koordinator bo'lmasa - umuman tegmaydi.
    if not public.is_club_officer(new.id::text) then
        raise exception 'Klub ma''lumotlarini faqat shu klub koordinatori yoki administrator o''zgartira oladi';
    end if;

    -- Ustunlar.
    if new.name              is distinct from old.name
       or new.category       is distinct from old.category
       or new.members_count  is distinct from old.members_count
       or new.head_coordinator_id is distinct from old.head_coordinator_id
       or new.points_modifier is distinct from old.points_modifier
       or new.display_number is distinct from old.display_number
    then
        raise exception 'Klub nomi, yo''nalishi, rahbari va ball koeffitsientini faqat administrator o''zgartiradi';
    end if;

    -- `data` ichidagi rasmiylashtirish maydonlari.
    foreach k in array protected_keys loop
        if (new.data -> k) is distinct from (old.data -> k) then
            raise exception 'Klubni ro''yxatga olish ma''lumotlarini faqat administrator o''zgartiradi (%)', k;
        end if;
    end loop;

    return new;
end
$trg$;

drop trigger if exists clubs_guard_core on public.clubs;
create trigger clubs_guard_core
    before update on public.clubs
    for each row execute function public.guard_club_core_fields();

-- ---------------------------------------------------------------------
-- 2. YANGILASH QOIDASI
--
-- Qatorga kirish ochiladi, maydonlarni yuqoridagi trigger ushlaydi.
-- QO'SHISH va O'CHIRISH avvalgidek administratorda qoladi: yangi klub
-- tashkil etish ariza orqali boradi, o'chirish esa qaytarib bo'lmaydigan
-- amal.
-- ---------------------------------------------------------------------
drop policy if exists "clubs writable by admins" on public.clubs;

create policy clubs_admin_insert on public.clubs
    for insert to authenticated
    with check (public.is_platform_admin());

create policy clubs_admin_delete on public.clubs
    for delete to authenticated
    using (public.is_platform_admin());

create policy clubs_update on public.clubs
    for update to authenticated
    using      (public.is_platform_admin() or public.is_club_officer(id::text))
    with check (public.is_platform_admin() or public.is_club_officer(id::text));

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
-- ---------------------------------------------------------------------------
select policyname as qoida, cmd as amal, qual as ifoda
from pg_policies
where schemaname = 'public' and tablename = 'clubs'
order by cmd, policyname;
