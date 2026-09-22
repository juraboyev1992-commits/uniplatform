-- ============================================================================
-- JAMOAGA KOD BILAN QO'SHILISH
--
-- MUAMMO (RLS o'tkazishidan keyin qolgan, 2026-09-22 da topildi):
--   Talaba taklif kodi bilan jamoaga qo'shilmoqchi bo'lganda xato chiqadi:
--   "Cannot coerce the result to a single JSON object" (PGRST116).
--
-- SABABI:
--   `registrations` ni yangilash qoidasi (rls_events_registrations.sql):
--
--     using (user_id = current_username()
--            or can_manage_activity(...)
--            or exists (... team_members ichida current_username()))
--
--   Kod bilan qo'shilayotgan odam uchalasiga ham TUSHMAYDI: u kapitan emas,
--   tashkilotchi emas, va `team_members` ichida hali YO'Q - u aynan o'zini
--   o'sha ro'yxatga qo'shmoqchi. Natijada UPDATE nol qator o'zgartiradi va
--   `.select().single()` yiqiladi.
--
--   Bu "tovuq va tuxum" holati: qoidaga tushish uchun ro'yxatda bo'lish
--   kerak, ro'yxatga tushish uchun esa qoidaga tushish kerak. Uni qoida
--   bilan yechib bo'lmaydi - shuning uchun `security definer` funksiya.
--
-- NEGA QOIDANI KENGAYTIRMADIM:
--   "Kodi bo'lganga ruxsat" degan shartni RLS da ifodalab bo'lmaydi: qoida
--   qatorni ko'radi, chaqiruvchi nimani bilishini emas. Qoidani kengaytirish
--   esa har qanday talabaga HAR QANDAY ro'yxat qatorini o'zgartirish huquqini
--   berardi - bu jamoani buzish, boshqani o'chirish demakdir.
--
-- FUNKSIYA NIMANI TEKSHIRADI (serverda, mijozga ishonmasdan):
--   * chaqiruvchi faqat O'ZINI qo'sha oladi - boshqa odamni emas;
--   * kod haqiqiy va bekor qilinmagan ro'yxatga tegishli;
--   * allaqachon a'zo yoki kapitan bo'lsa - hech narsa o'zgarmaydi (idempotent).
--
--   Qolgan tekshiruvlar (fakultet/kurs mosligi, jamoa tarkibi, maksimal hajm)
--   avvalgidek JS da qoladi va CHAQIRISHDAN OLDIN bajariladi - ular
--   `config/` dagi qoidalarga tayanadi va ularni SQL da qayta yozish
--   ikkinchi haqiqat manbai degani bo'lardi.
--
-- MUHIM: bu funksiya faqat BIRINCHI qo'shilishni bajaradi. Shundan keyin
--   odam `team_members` ichida bo'ladi, ya'ni yuqoridagi qoidaning uchinchi
--   sharti unga ishlaydi va keyingi yangilanishlar (teamConfirmedAt,
--   realTeamId) oddiy yo'l bilan o'tadi. Shuning uchun JS da faqat shu
--   bitta chaqiruv almashtirildi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni Run.
-- ============================================================================

do $guard$
begin
    if to_regprocedure('public.current_username()') is null then
        raise exception 'Avval supabase/rls_documents_attendance.sql ni ishga tushiring.';
    end if;
end
$guard$;

create or replace function public.join_team_by_code(p_code text, p_member jsonb)
returns setof public.registrations
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me     text := public.current_username();
    v_reg    public.registrations;
    v_member text := p_member->>'userId';
begin
    if coalesce(v_me, '') = '' then
        raise exception 'Avtorizatsiya talab qilinadi';
    end if;

    -- Faqat O'ZINI. Aks holda kodni bilgan odam boshqa talabani uning
    -- xabarisiz jamoaga qo'shib qo'ya olardi.
    if v_member is distinct from v_me then
        raise exception 'Faqat o''zingizni jamoaga qo''sha olasiz';
    end if;

    select * into v_reg
      from public.registrations
     where invite_code = p_code
       and status <> 'cancelled'
     limit 1;

    if not found then
        raise exception 'Taklif kodi topilmadi yoki bekor qilingan';
    end if;

    -- Allaqachon kapitan yoki a'zo - qator o'zgarmaydi, o'zi qaytariladi.
    if v_reg.user_id = v_me
       or exists (
            select 1
              from jsonb_array_elements(coalesce(v_reg.team_members, '[]'::jsonb)) m
             where m->>'userId' = v_me
       )
    then
        return next v_reg;
        return;
    end if;

    update public.registrations
       set team_members = coalesce(team_members, '[]'::jsonb) || jsonb_build_array(p_member)
     where id = v_reg.id
    returning * into v_reg;

    return next v_reg;
end
$$;

revoke all on function public.join_team_by_code(text, jsonb) from public, anon;
grant execute on function public.join_team_by_code(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
-- ---------------------------------------------------------------------------
select p.proname as funksiya,
       pg_get_function_identity_arguments(p.oid) as argumentlar,
       case when p.prosecdef then 'security definer' else 'invoker' end as rejim
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'join_team_by_code';
