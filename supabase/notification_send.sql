-- ===========================================================================
-- BILDIRISHNOMA YUBORISH - BOSHQA ODAMGA
--
-- MUAMMO: jamoaviy musobaqaga ro'yxatdan o'tishda shu xato chiqardi:
--     new row violates row-level security policy for table "notifications"
--
-- Sababi ikkita SQL faylining qarama-qarshiligi:
--   rls_workflow_tables.sql  -> insert ... with check (TRUE)
--   rls_notifications.sql    -> faqat o'ziga yoki xodimga (keyinroq yozilgan)
--
-- Ikkinchisi to'g'ri ish qildi: ochiq `with check (true)` har qanday
-- foydalanuvchiga HAR KIMGA soxta xabar yozish imkonini berardi
-- (spam va firibgarlik yo'li). Lekin u bilan birga ikkita HALOL yo'lni
-- ham yopdi:
--   1. jamoa sardori a'zolarni taklif qiladi  (type = 'team_invite')
--   2. navbatdan joy bo'shaganda taklif ketadi (type = 'waitlist_offer')
--
-- YECHIM: siyosat QAT'IY qoladi (faqat o'ziga yoki xodimga). Boshqa
-- odamga xabar esa shu `security definer` funksiya orqali yoziladi va u
-- har safar MUNOSABATNI tekshiradi:
--   - 'team_invite'    -> yozayotgan odam SHU faoliyat uchun jamoa
--                         ro'yxatining egasi (sardori) bo'lishi va qabul
--                         qiluvchi uning jamoa tarkibida turishi shart;
--   - 'waitlist_offer' -> ko'rsatilgan ro'yxat yozuvi HAQIQATAN o'sha
--                         odamniki va 'waitlisted' holatida bo'lishi shart.
-- Boshqa turdagi xabarni begona odamga yozib bo'lmaydi.
--
-- Ya'ni "kim yozyapti" emas, "yozishga asos bormi" tekshiriladi.
--
-- Supabase SQL Editor da bir marta ishga tushiriladi.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. SIYOSAT - qat'iy holicha qayta tasdiqlanadi
--
-- rls_workflow_tables.sql dagi ochiq `notifications_append` ATAYLAB
-- olib tashlanadi: u shu faylning butun maqsadini bekor qilardi.
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;

drop policy if exists notifications_append               on public.notifications;
drop policy if exists authenticated_access_notifications on public.notifications;
drop policy if exists notifications_own_or_staff         on public.notifications;

create policy notifications_own_or_staff on public.notifications
    for all to authenticated
    using      (user_id::text = public.current_username() or public.is_staff())
    with check (user_id::text = public.current_username() or public.is_staff());

revoke all on public.notifications from anon;
grant select, insert, update, delete on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- 2. YUBORISH FUNKSIYASI
-- ---------------------------------------------------------------------------
create or replace function public.send_notification(
    p_id         text,
    p_user_id    text,
    p_type       text,
    p_title      text,
    p_message    text    default null,
    p_ref_id     text    default null,
    p_ref_type   text    default null,
    p_expires_at timestamptz default null
)
returns public.notifications
language plpgsql
security definer
set search_path = ''
as $$
declare
    me      text := public.current_username();
    allowed boolean := false;
    row_out public.notifications;
begin
    if p_user_id is null or p_type is null or p_title is null then
        raise exception 'Bildirishnoma uchun qabul qiluvchi, tur va sarlavha shart';
    end if;

    -- O'ZIGA yozish va xodimlar - avvalgidek.
    if p_user_id = me then
        allowed := true;
    elsif public.is_staff() then
        allowed := true;

    -- JAMOAGA TAKLIF. `ref_id` faoliyatni ko'rsatadi (ro'yxat yozuvini
    -- emas), shuning uchun tekshiruv ham faoliyat bo'yicha boradi.
    elsif p_type = 'team_invite' then
        allowed := exists (
            select 1
              from public.registrations r
             where r.user_id::text       = me
               and r.activity_id::text   = p_ref_id
               and r.activity_type::text = p_ref_type
               and r.participant_type    = 'team'
               and exists (
                    select 1
                      from jsonb_array_elements(coalesce(r.team_members, '[]'::jsonb)) m
                     where m ->> 'userId' = p_user_id
               )
        );

    -- NAVBATDAN TAKLIF. Uni sahifani ochgan HAR KIM qo'zg'atishi mumkin
    -- (navbat o'qilganda tekshiriladi), shuning uchun yuboruvchi emas,
    -- QABUL QILUVCHI tekshiriladi: yozuv haqiqatan uniki va navbatda
    -- turganmi. Shunda eng yomon holatda ham xabar o'z egasiga boradi.
    elsif p_type = 'waitlist_offer' then
        allowed := exists (
            select 1
              from public.registrations r
             where r.id::text      = p_ref_id
               and r.user_id::text = p_user_id
               and r.status        = 'waitlisted'
        );
    end if;

    if not allowed then
        raise exception
            'Bu foydalanuvchiga bildirishnoma yuborishga asos yo''q (tur: %)', p_type
            using errcode = '42501';
    end if;

    insert into public.notifications
        (id, user_id, type, title, message, ref_id, ref_type, is_read, expires_at)
    values
        (p_id, p_user_id, p_type, p_title, p_message, p_ref_id, p_ref_type, false, p_expires_at)
    returning * into row_out;

    return row_out;
end
$$;

revoke all on function public.send_notification(text, text, text, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.send_notification(text, text, text, text, text, text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. TEKSHIRUV
-- ---------------------------------------------------------------------------

-- 3.1. `notifications` da qanday siyosatlar qoldi.
-- Kutilgan natija: FAQAT bitta qator - notifications_own_or_staff.
-- Agar `notifications_append` hamon ko'rinsa, rls_workflow_tables.sql
-- shu fayldan KEYIN ishga tushirilgan - bu faylni qayta ishga tushiring.
select policyname as qoida, cmd as amal, with_check as yozish_sharti
from pg_policies
where schemaname = 'public' and tablename = 'notifications'
order by policyname;

-- 3.2. Funksiya yaratildimi.
select p.proname as funksiya,
       case when p.prosecdef then 'security definer' else 'invoker' end as rejim
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'send_notification';

notify pgrst, 'reload schema';
