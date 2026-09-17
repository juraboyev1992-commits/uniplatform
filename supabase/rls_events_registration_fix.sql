-- =====================================================================
-- TADBIRGA RO'YXATDAN O'TISHNI TIKLASH
--
-- MUAMMO (jonli saytda topildi, 2026-09-17):
--   Talaba tadbirga yozilmoqchi bo'lganda xato chiqardi:
--   "Cannot coerce the result to a single JSON object" (PostgREST PGRST116).
--
-- SABABI:
--   Tadbir ishtirokchilari ro'yxati `events` jadvalining O'Z ustunlarida
--   turadi (`registrations`, `participants`) - ya'ni talaba yozilganda
--   AYNAN SHU QATOR yangilanadi (db.js: registerForEvent -> updateEvent).
--   Lekin rls_events_registrations.sql da yangilash faqat xodim va klub
--   rahbariga ochilgan edi:
--
--       create policy events_w_update on public.events
--           for update to authenticated
--           using (public.is_staff() or public.is_club_officer(club_id));
--
--   Talaba bu shartga tushmaydi -> UPDATE nol qator o'zgartiradi ->
--   `.select().single()` nol qatordan bitta obyekt yasay olmaydi -> xato.
--
-- NEGA AYNAN SHU YECHIM:
--   Musobaqada bu holat ALLAQACHON hal qilingan va aynan shu sababdan
--   (rls_competition_integrity.sql, 3-bo'lim): u yerda yangilash ochiq
--   qoldirilgan, maydonlarni esa TRIGGER qo'riqlaydi. Sababi shuki, RLS
--   qoidasi QATOR darajasida ishlaydi, MAYDON darajasida emas - "faqat
--   ishtirokchilar ro'yxatini o'zgartira olsin" degan shartni qoida bilan
--   yozib bo'lmaydi. Tadbirda shu asimmetriya qolib ketgan edi.
--
--   Bu yerdagi trigger musobaqanikidan TOR: u qora ro'yxat emas, OQ
--   ro'yxat ishlatadi - oddiy foydalanuvchi uchun ro'yxat ustunlaridan
--   BOSHQA har qanday ustun o'zgarsa, yangilash rad etiladi. Ya'ni
--   kelajakda yangi ustun qo'shilsa, u avtomatik himoyalangan bo'ladi
--   (qora ro'yxatda esa unutilib qolardi).
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni Run.
--   Oldin supabase/rls_events_registrations.sql ishga tushirilgan bo'lishi
--   kerak (u `is_club_officer` va `is_staff` ni talab qiladi).
-- =====================================================================

do $guard$
begin
    if to_regprocedure('public.is_club_officer(text)') is null
       or to_regprocedure('public.is_staff()') is null then
        raise exception 'Avval supabase/rls_events_registrations.sql ni ishga tushiring.';
    end if;
end
$guard$;

-- ---------------------------------------------------------------------
-- 1. QO'RIQCHI TRIGGER
--
--    Xodim va klub rahbari - avvalgidek, hech qanday cheklovsiz.
--    Qolgan hamma faqat ro'yxat ustunlariga tegishi mumkin.
--
--    `to_jsonb(new) - 'registrations' - ...` butun qatorni jsonb ga
--    aylantirib, ruxsat etilgan ustunlarni olib tashlaydi va qolganini
--    eskisi bilan solishtiradi. Bitta ham farq bo'lsa - rad etiladi.
--    `updated_at` ro'yxatdan chiqarilgan: agar jadvalda shunday ustun
--    bo'lsa va uni boshqa trigger yangilasa, u bu tekshiruvni yolg'ondan
--    yiqitmasin (yo'q kalitni olib tashlash jsonb da xatosiz o'tadi).
-- ---------------------------------------------------------------------
create or replace function public.guard_event_core_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $trg$
begin
    if public.is_staff() or public.is_club_officer(new.club_id) then
        return new;
    end if;

    if (to_jsonb(new) - 'registrations' - 'participants' - 'updated_at')
       is distinct from
       (to_jsonb(old) - 'registrations' - 'participants' - 'updated_at')
    then
        raise exception
            'Tadbir ma''lumotlarini faqat tashkilotchi o''zgartira oladi (siz faqat ro''yxatdan o''ta olasiz)';
    end if;

    return new;
end
$trg$;

drop trigger if exists events_guard_core on public.events;
create trigger events_guard_core
    before update on public.events
    for each row execute function public.guard_event_core_fields();

-- ---------------------------------------------------------------------
-- 2. YANGILASH QOIDASI
--    Endi qatorga kirish ochiq, maydonlarni yuqoridagi trigger ushlaydi.
--    QO'SHISH va O'CHIRISH avvalgidek yopiq qoladi - ularga tegilmaydi.
-- ---------------------------------------------------------------------
drop policy if exists events_w_update on public.events;
create policy events_w_update on public.events
    for update to authenticated
    using (true) with check (true);

-- ---------------------------------------------------------------------
-- 3. TEKSHIRISH - natijani ko'zdan kechiring
-- ---------------------------------------------------------------------
select 'qoida' as tur, policyname as nomi, cmd as amal,
       coalesce(qual, '-') as ifoda
from pg_policies
where schemaname = 'public' and tablename = 'events'
union all
select 'trigger', tgname, 'before update',
       case when tgenabled = 'D' then 'O''CHIRILGAN' else 'yoqilgan' end
from pg_trigger
where tgrelid = 'public.events'::regclass and not tgisinternal
order by tur, nomi;
