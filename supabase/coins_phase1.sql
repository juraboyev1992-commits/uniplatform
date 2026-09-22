-- ============================================================================
-- DO'KON - 1-BOSQICH: TANGA IQTISODIYOTI (ma'lumot qatlami)
--
-- Bu bosqichda EKRANDA HECH NARSA O'ZGARMAYDI. Faqat tanga yig'ila
-- boshlaydi, shunda do'kon ochilganda talabalarda allaqachon balans bo'ladi.
-- Bo'sh balans bilan ochilgan do'kon birinchi kuniyoq "menda hech narsa
-- yo'q" degan taassurot qoldirardi.
--
-- ----------------------------------------------------------------------------
-- QABUL QILINGAN QARORLAR (foydalanuvchi bilan kelishilgan, 2026-09-22)
--
--   1. TANGA FAQAT DAVOMATDAN. Tadbir va Ma'rifat darsidagi qatnashuv -
--      ularni XODIM belgilaydi, ya'ni talaba o'zi yoza olmaydi. Test yoki
--      ariza kabi o'z-o'zidan bajariladigan narsalardan tanga berilmaydi.
--
--   2. TANGA - INDEKS BALI EMAS. Bu eng muhim qaror. Ijtimoiy faollik
--      indeksi 186-sonli buyruq bo'yicha rasmiy o'lchov va u stipendiya hal
--      qiladi. Agar talaba sovg'a olib ball sarflasa, uning RASMIY indeksi
--      tushib, stipendiyadan chetda qolardi. Shuning uchun tanga butunlay
--      alohida hisob: faollikdan HOSIL BO'LADI, lekin mustaqil sarflanadi.
--      Indeks hech qachon kamaymaydi.
--
--   3. ENG QIMMAT SOVG'A = BIR SEMESTRLIK FAOLLIK. Narxlar 2-bosqichda
--      admin tomonidan qo'yiladi; bu yerda faqat TOPISH tezligi belgilanadi.
--
-- ----------------------------------------------------------------------------
-- NEGA TRIGGER, NEGA JS EMAS
--   Davomat allaqachon ishlaydigan oqim. Unga tanga berishni JS ga qo'shsak,
--   davomat belgilanadigan HAR JOYNI (admin paneli, ish maydoni, delegatsiya)
--   topib o'zgartirish kerak bo'lardi va bittasi unutilsa, tanga jimgina
--   berilmay qolardi. Trigger esa jadval darajasida: qayerdan yozilishidan
--   qat'i nazar ishlaydi.
--
--   XAVFSIZLIK: trigger ichidagi xato DAVOMATNI BUZMASLIGI shart. Shuning
--   uchun butun mantiq `exception when others then null` bilan o'ralgan -
--   tanga berilmasa ham davomat saqlanaveradi. Tanga qo'shimcha, davomat esa
--   rasmiy yozuv; ikkovining ustuvorligi teng emas.
--
-- ORQAGA QAYTA HISOBLANMAYDI: trigger faqat SHU PAYTDAN keyingi davomatga
--   ishlaydi. Eski davomatni hisoblasak, ba'zi talabalarda birdan minglab
--   tanga paydo bo'lib, do'kon ochilishi bilan zaxira tugardi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni Run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. QOIDALAR - qaysi harakat necha tanga
--    Admin 2-bosqichda tahrirlaydi. Kodda qattiq yozilmaydi: narxni
--    o'zgartirish uchun dastur chiqarish kerak bo'lmasin.
-- ---------------------------------------------------------------------------
create table if not exists public.coin_rules (
    code        text primary key,
    label       text not null,
    amount      int  not null default 0,
    enabled     boolean not null default true,
    updated_at  timestamptz not null default now()
);

insert into public.coin_rules (code, label, amount) values
    ('event_attendance',   'Tadbirda qatnashish',        10),
    ('marifat_attendance', 'Ma''rifat darsida qatnashish', 5),
    ('marifat_active',     'Ma''rifat darsida faollik (qo''shimcha)', 5)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. REYESTR - har tanga harakati alohida qator
--
--    Balans ALOHIDA USTUNDA SAQLANMAYDI, u har safar yig'indidan olinadi.
--    Saqlangan balans reyestr bilan vaqt o'tib chetga chiqib ketadi va
--    qaysi biri to'g'riligini keyin aniqlab bo'lmaydi.
--
--    `ref_type` + `ref_id` - manba. Ular ustidagi YAGONA indeks tufayli
--    bitta davomat uchun ikkinchi marta tanga berilmaydi: davomat qayta
--    saqlansa ham (upsert), yozuv takrorlanmaydi.
-- ---------------------------------------------------------------------------
create table if not exists public.coin_ledger (
    id          text primary key,
    student_id  text not null,
    delta       int  not null,
    reason      text not null,
    ref_type    text,
    ref_id      text,
    created_at  timestamptz not null default now(),
    created_by  text
);

create unique index if not exists coin_ledger_unique_source
    on public.coin_ledger (student_id, ref_type, ref_id)
    where ref_type is not null and ref_id is not null;

create index if not exists coin_ledger_student on public.coin_ledger (student_id);

-- ---------------------------------------------------------------------------
-- 3. BALANS - yig'indi
-- ---------------------------------------------------------------------------
create or replace function public.coin_balance(p_student text)
returns int
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(sum(delta), 0)::int
      from public.coin_ledger
     where student_id = p_student;
$$;

-- ---------------------------------------------------------------------------
-- 4. TANGA YOZISH - bitta joy
--    `on conflict do nothing` - yagona indeks bilan birga takrorlanishning
--    to'liq himoyasi.
-- ---------------------------------------------------------------------------
create or replace function public.coin_award(
    p_student text,
    p_code    text,
    p_ref_type text,
    p_ref_id  text,
    p_by      text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_rule public.coin_rules;
begin
    if coalesce(p_student, '') = '' then return; end if;

    select * into v_rule from public.coin_rules where code = p_code and enabled;
    if not found or v_rule.amount = 0 then return; end if;

    insert into public.coin_ledger (id, student_id, delta, reason, ref_type, ref_id, created_by)
    values ('coin_' || replace(gen_random_uuid()::text, '-', ''),
            p_student, v_rule.amount, v_rule.label, p_ref_type, p_ref_id, p_by)
    on conflict do nothing;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. TRIGGERLAR
--
--    Har ikkalasi ham xatoni yutadi: tanga berilmasa ham davomat yoziladi.
-- ---------------------------------------------------------------------------
create or replace function public.coin_on_activity_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        if new.status = 'present' then
            perform public.coin_award(
                new.participant_id, 'event_attendance',
                'activity_attendance', new.id, null
            );
        end if;
    exception when others then
        -- Tanga qo'shimcha, davomat esa rasmiy yozuv. Hech qanday holatda
        -- tanga xatosi davomatni yiqitmasligi kerak.
        null;
    end;
    return new;
end
$$;

drop trigger if exists coin_activity_attendance on public.activity_attendance;
create trigger coin_activity_attendance
    after insert or update on public.activity_attendance
    for each row execute function public.coin_on_activity_attendance();

create or replace function public.coin_on_marifat_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    begin
        if new.present then
            perform public.coin_award(
                new.student_id, 'marifat_attendance',
                'marifat_attendance', new.id, new.marked_by
            );
            -- Faollik - ALOHIDA yozuv, alohida `ref_type` bilan: aks holda
            -- yagona indeks uni davomat yozuvi bilan bitta deb bilardi.
            if new.active then
                perform public.coin_award(
                    new.student_id, 'marifat_active',
                    'marifat_active', new.id, new.marked_by
                );
            end if;
        end if;
    exception when others then
        null;
    end;
    return new;
end
$$;

drop trigger if exists coin_marifat_attendance on public.marifat_attendance;
create trigger coin_marifat_attendance
    after insert or update on public.marifat_attendance
    for each row execute function public.coin_on_marifat_attendance();

-- ---------------------------------------------------------------------------
-- 6. RLS
--    Talaba FAQAT o'z reyestrini ko'radi. Yozish - hech kimga: tanga faqat
--    trigger orqali (security definer) beriladi.
-- ---------------------------------------------------------------------------
alter table public.coin_ledger enable row level security;
alter table public.coin_rules  enable row level security;

drop policy if exists coin_ledger_read on public.coin_ledger;
create policy coin_ledger_read on public.coin_ledger
    for select to authenticated
    using (student_id = public.current_username() or public.is_staff());

drop policy if exists coin_rules_read on public.coin_rules;
create policy coin_rules_read on public.coin_rules
    for select to authenticated using (true);

drop policy if exists coin_rules_write on public.coin_rules;
create policy coin_rules_write on public.coin_rules
    for all to authenticated
    using (public.is_platform_admin()) with check (public.is_platform_admin());

revoke all on function public.coin_award(text, text, text, text, text) from public, anon;
grant execute on function public.coin_balance(text) to authenticated;

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
-- ---------------------------------------------------------------------------
select 'qoida' as tur, code as nomi, amount::text as qiymat from public.coin_rules
union all
select 'trigger', tgname,
       case when tgenabled = 'D' then 'O''CHIRILGAN' else 'yoqilgan' end
  from pg_trigger
 where tgrelid in ('public.activity_attendance'::regclass, 'public.marifat_attendance'::regclass)
   and not tgisinternal and tgname like 'coin%'
order by tur, nomi;
