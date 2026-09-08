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
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Bloklash / blokdan chiqarish
--
-- Supabase auth'ning O'Z mexanizmi ishlatiladi (`banned_until`) - yangi ustun
-- o'ylab topilmaydi. Bloklangan foydalanuvchi kira olmaydi, lekin uning
-- `profiles` qatori va barcha yozuvlari tegilmaydi.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_user_blocked(
    p_user_id uuid,
    p_blocked boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
    if not is_platform_admin() then
        raise exception 'Faqat administrator akkauntni bloklay oladi';
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
    if not is_platform_admin() then
        raise exception 'Faqat administrator ko''ra oladi';
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
    if not is_platform_admin() then
        raise exception 'Faqat administrator ko''ra oladi';
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
    if not is_platform_admin() then
        raise exception 'Faqat administrator akkaunt o''chira oladi';
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
