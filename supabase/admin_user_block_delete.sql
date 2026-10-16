-- =====================================================================
-- FOYDALANUVCHINI BLOKLASH VA O'CHIRISH
--
-- IKKI XIL AMAL, ATAYLAB:
--
--   BLOKLASH  - asosiy yo'l. Odam kira olmaydi, lekin HAMMA YOZUVI JOYIDA
--               qoladi: diplomi tekshirilaveradi, indeks hisobi tarixda
--               turadi, bayonnomada imzosi ko'rinadi. Qaytariladi.
--
--   O'CHIRISH - faqat TARIXI YO'Q akkaunt uchun. Foydalanuvchi kamida 20 ta
--               jadvalga bog'langan; berilgan diplom esa `documents.recipient_id`
--               orqali odamga bog'langan va /verify/:token sahifasida
--               tekshiriladi. Tarixi bor odamni o'chirish "ma'lumot yo'qotish"
--               emas, "HUJJAT yo'qotish" bo'lardi: QR bilan kelgan ish beruvchi
--               diplomni tasdiqlay olmay qolardi.
--
-- NEGA O'CHIRISH UMUMAN KERAK: agar platforma xavfsiz yo'l bermasa, odam
-- Supabase konsolidan o'chiradi - u yerda esa hech qanday tekshiruv yo'q.
-- Ya'ni tugma qo'ymaslik xavfni kamaytirmaydi, uni ko'rinmaydigan joyga
-- ko'chiradi. Bu yerdagi tugma esa O'ZI HIMOYA: tarixi bor odamda ishlamaydi.
--
-- ISHGA TUSHIRISHDAN OLDIN `admin_user_management.sql` bajarilgan bo'lishi
-- kerak (`is_platform_admin()` o'sha yerda yaratilgan).
-- Qo'riqchi esa `can_manage_users()` - supabase/user_managers.sql.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Bloklash / blokdan chiqarish
--
-- Supabase auth'ning O'Z mexanizmi ishlatiladi (`banned_until`) - yangi ustun
-- o'ylab topilmaydi. Bloklangan foydalanuvchi kira olmaydi, lekin uning
-- `profiles` qatori va barcha yozuvlari tegilmaydi.
-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- BOG'LIQLIK: avval supabase/user_managers.sql ni ishga tushiring.
--
-- Bu fayldagi funksiyalar `can_manage_users()` ni chaqiradi. Ilgari
-- `is_platform_admin()` tekshirilardi - ya'ni ADMINISTRATOR roli berilgan
-- HAR KIM parol almashtira, rol ko'tara va akkaunt o'chira olardi. Endi
-- rol yetarli emas: login `user_managers` ro'yxatida ham bo'lishi shart.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- AVVAL ESKI NUSXALARNI OLIB TASHLAYMIZ
--
-- `create or replace` funksiyaning QAYTARISH TURINI o'zgartira olmaydi.
-- Bazada bu funksiyalarning eskiroq, boshqa ustunlar qaytaradigan nusxasi
-- turgan bo'lsa, qayta ishga tushirish shunday xato beradi:
--     42P13: cannot change return type of existing function
--
-- Shuning uchun avval o'chiramiz. Xavfsiz: Supabase SQL Editor butun
-- skriptni bitta tranzaksiyada bajaradi, ya'ni quyida biror narsa xato
-- bersa o'chirish ham bekor qilinadi - funksiyalar yo'qolib qolmaydi.
--
-- Imzolar ANIQ yozilgan: `drop function if exists` noto'g'ri imzo bilan
-- jimgina hech narsa qilmaydi va xato o'z-o'zidan qaytib kelardi.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_set_user_blocked(uuid, boolean);
drop function if exists public.admin_blocked_user_ids();
drop function if exists public.admin_user_history(uuid);
drop function if exists public.admin_delete_user(uuid);

create or replace function public.admin_set_user_blocked(
    p_user_id uuid,
    p_blocked boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
    if not can_manage_users() then
        raise exception 'Akkauntni bloklashga ruxsat yo''q - bu amal faqat akkauntlar uchun mas''ul administratorga ochiq';
    end if;
    -- O'zini bloklab qo'yishdan himoya: aks holda oxirgi admin o'zini yopib,
    -- tizimga hech kim kira olmay qolardi.
    if p_user_id = auth.uid() then
        raise exception 'O''z akkauntingizni bloklay olmaysiz';
    end if;

    update auth.users
       set banned_until = case when p_blocked then 'infinity'::timestamptz else null end
     where id = p_user_id;

    if not found then
        raise exception 'Foydalanuvchi topilmadi';
    end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 1b. Kim bloklangan
--
-- Bloklangan holat `auth.users.banned_until` da turadi, `profiles` da emas -
-- ya'ni ilova uni oddiy o'qish bilan bila olmaydi. Shu funksiya ro'yxatni
-- beradi, UI esa tugmani to'g'ri yozadi ("Bloklash" / "Blokdan chiqarish").
-- Busiz tugma har doim "Bloklash" deb turardi va admin kim bloklanganini
-- umuman ko'rmasdi.
-- ---------------------------------------------------------------------
create or replace function public.admin_blocked_user_ids()
returns table (user_id uuid)
language plpgsql security definer set search_path = public as $$
begin
    if not can_manage_users() then
        raise exception 'Ko''rishga ruxsat yo''q - bu ma''lumot faqat akkauntlar uchun mas''ul administratorga ochiq';
    end if;
    return query
        select u.id from auth.users u
        where u.banned_until is not null and u.banned_until > now();
end;
$$;


-- ---------------------------------------------------------------------
-- 2. Akkauntda tarix bormi
--
-- O'chirishdan OLDIN chaqiriladi va UI da ham ko'rsatiladi: admin nima
-- uchun o'chira olmayotganini bilishi kerak, shunchaki "bo'lmaydi" emas.
--
-- Ro'yxat ATAYLAB keng: shubha bo'lsa o'chirmaslik tarafga og'adi.
-- ---------------------------------------------------------------------
create or replace function public.admin_user_history(p_user_id uuid)
returns table (source text, cnt bigint)
language plpgsql security definer set search_path = public as $$
declare
    uname text;
    rec   record;
    n     bigint;
    -- Jadval nomi -> egasi ustuni -> ko'rsatiladigan nom.
    -- Jadvallar DINAMIK tekshiriladi: bu bazada ba'zi jadvallar boshqacha
    -- nomlangan yoki umuman yo'q bo'lishi mumkin. Statik `from public.documents`
    -- yozilsa, yo'q jadval butun funksiyani ishdan chiqarardi.
    checks text[][] := array[
        ['documents',                   'recipient_id', 'Berilgan hujjatlar'],
        ['registrations',               'user_id',      'Ro''yxatdan o''tishlar'],
        ['activity_attendance',         'participant_id', 'Davomat yozuvlari'],
        ['social_activity_applications','student_id',   'Ijtimoiy faollik arizalari'],
        ['memberships',                 'user_id',      'Klub a''zoligi'],
        ['academic_records',            'student_id',   'Akademik yozuvlar'],
        ['competition_scores',          'student_id',   'Musobaqa natijalari'],
        ['student_recognitions',        'student_id',   'Rag''bat yozuvlari']
    ];
    i int;
begin
    if not can_manage_users() then
        raise exception 'Ko''rishga ruxsat yo''q - bu ma''lumot faqat akkauntlar uchun mas''ul administratorga ochiq';
    end if;

    select username into uname from public.profiles where id = p_user_id;

    for i in 1 .. array_length(checks, 1) loop
        -- Jadval bormi?
        if to_regclass('public.' || checks[i][1]) is null then
            continue;
        end if;
        -- Ustun bormi?
        if not exists (
            select 1 from information_schema.columns
            where table_schema = 'public'
              and table_name = checks[i][1]
              and column_name = checks[i][2]
        ) then
            continue;
        end if;

        execute format(
            'select count(*) from public.%I where %I::text in (%L, %L)',
            checks[i][1], checks[i][2], coalesce(uname, '~yo''q~'), p_user_id::text
        ) into n;

        if n > 0 then
            source := checks[i][3];
            cnt := n;
            return next;
        end if;
    end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. O'chirish — faqat tarixi yo'q bo'lsa
-- ---------------------------------------------------------------------
create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
    blockers text;
begin
    if not can_manage_users() then
        raise exception 'Akkauntni o''chirishga ruxsat yo''q - bu amal faqat akkauntlar uchun mas''ul administratorga ochiq';
    end if;
    if p_user_id = auth.uid() then
        raise exception 'O''z akkauntingizni o''chira olmaysiz';
    end if;

    -- Tarix bo'lsa - O'CHIRILMAYDI va SABABI aytiladi. "Bo'lmaydi" deyish
    -- yetarli emas: admin nimaga to'xtaganini bilmasa, konsoldan o'chirishga
    -- o'tadi va aynan shu himoyani chetlab o'tadi.
    select string_agg(source || ': ' || cnt, ', ')
      into blockers
      from public.admin_user_history(p_user_id);

    if blockers is not null then
        raise exception
            'Bu akkauntda tarix bor (%). O''chirish o''rniga BLOKLANG — shunda hujjatlari tekshirilaveradi.',
            blockers;
    end if;

    delete from public.profiles where id = p_user_id;
    delete from auth.identities where user_id = p_user_id;
    delete from auth.users where id = p_user_id;
end;
$$;


revoke all on function public.admin_set_user_blocked(uuid, boolean) from public, anon;
revoke all on function public.admin_user_history(uuid)               from public, anon;
revoke all on function public.admin_delete_user(uuid)                from public, anon;
grant execute on function public.admin_set_user_blocked(uuid, boolean) to authenticated;
grant execute on function public.admin_user_history(uuid)               to authenticated;
revoke all on function public.admin_blocked_user_ids() from public, anon;
grant execute on function public.admin_blocked_user_ids() to authenticated;
grant execute on function public.admin_delete_user(uuid)                to authenticated;


-- ---------------------------------------------------------------------------
-- YAKUNIY TEKSHIRUV - SAKKIZALA funksiya bo'yicha
--
-- Bu so'rov uch faylning HAMMASINI birdan tekshiradi. Har qatorda
-- `holat` ustuniga qarang:
--     YANGI QO'RIQCHI            - hammasi joyida
--     ESKI - QAYTA ISHGA TUSHIRING - o'sha funksiya turgan faylni
--                                    qaytadan ishga tushiring
--     (qator umuman yo'q)        - funksiya bazada yaratilmagan
-- ---------------------------------------------------------------------------
select
    p.proname as funksiya,
    case
        when pg_get_functiondef(p.oid) like '%can_manage_users%'  then 'YANGI QO''RIQCHI'
        when pg_get_functiondef(p.oid) like '%is_platform_admin%' then 'ESKI - QAYTA ISHGA TUSHIRING'
        else 'aniqlanmadi'
    end as holat
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
        'admin_create_user', 'admin_set_user_role', 'admin_reset_user_password',
        'admin_set_user_blocked', 'admin_blocked_user_ids', 'admin_user_history',
        'admin_delete_user', 'admin_import_user'
  )
order by holat desc, p.proname;
