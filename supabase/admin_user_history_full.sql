-- ============================================================================
-- AKKAUNT TARIXI - TO'LIQ RO'YXAT VA IKKI DARAJA
--
-- MUAMMO:
--   `admin_user_history` atigi 8 ta jadvalni sanardi, holbuki loginga
--   bog'langan jadval 50 dan ortiq. Ro'yxatda YO'Q edi: raqamli pasport,
--   CV, Ma'rifat davomati, test urinishlari, stipendiya arizalari, indeks
--   baholari, talent yozuvlari. Ya'ni pasporti to'ldirilgan va Ma'rifat
--   darsiga qatnashgan talaba "tarixi yo'q" deb hisoblanib, ogohlantirishsiz
--   o'chib ketishi mumkin edi.
--
--   Yana bir jimgina nosozlik: ro'yxatda `competition_scores` uchun
--   `student_id` ustuni ko'rsatilgan edi, aslida u `participant_id`. Funksiya
--   yo'q ustunni ko'rib o'sha tekshiruvni o'tkazib yuborardi - ya'ni musobaqa
--   natijalari HECH QACHON o'chirishni to'smagan. Endi ikkala nom ham
--   ro'yxatda: qaysi biri mavjud bo'lsa, o'sha ishlaydi.
--
-- NEGA IKKI DARAJA:
--   Hamma narsani to'siq qilib qo'ysak, o'chirish umuman imkonsiz bo'lardi -
--   masalan bildirishnoma hammada bor. Shuning uchun yozuvlar ikkiga bo'lindi:
--
--     'block' - RASMIY yozuv. O'chirilsa hujjat egasiz qoladi yoki dalil
--               yo'qoladi. Bunday akkaunt o'chirilmaydi, bloklanadi.
--     'warn'  - SHAXSIY yoki hosila ma'lumot (pasport, CV, turar joy).
--               O'chirishga to'sqinlik qilmaydi, LEKIN ro'yxatda
--               ko'rsatiladi, chunki u bazada YETIM qolib ketadi.
--
--   Yetim qatorlar nega muhim: bog'lanish UUID orqali emas, LOGIN orqali va
--   birorta jadvalda tashqi kalit (FK) yo'q. Agar o'chirilgan login keyin
--   boshqa odamga berilsa, u o'chirilgan odamning pasporti, CV si va
--   davomati bilan birga keladi. Hech qanday xato chiqmaydi - ma'lumot
--   jimgina boshqa odamga o'tadi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni Run.
--   Oldin supabase/admin_user_block_delete.sql ishga tushirilgan bo'lishi kerak.
-- ============================================================================

do $guard$
begin
    if to_regprocedure('public.admin_delete_user(uuid)') is null then
        raise exception 'Avval supabase/admin_user_block_delete.sql ni ishga tushiring.';
    end if;
end
$guard$;

-- Qaytariladigan ustunlar o'zgardi (yangi `blocking`), shuning uchun avval
-- o'chiriladi: `create or replace` qaytish turini o'zgartira olmaydi.
drop function if exists public.admin_user_history(uuid);

create or replace function public.admin_user_history(p_user_id uuid)
returns table (source text, cnt bigint, blocking boolean)
language plpgsql security definer set search_path = public as $$
declare
    uname text;
    n     bigint;
    -- Jadval nomi -> egasi ustuni -> ko'rsatiladigan nom -> daraja.
    --
    -- Jadvallar DINAMIK tekshiriladi: bu bazada ba'zi jadvallar boshqacha
    -- nomlangan yoki umuman yo'q bo'lishi mumkin. Statik `from public.x`
    -- yozilsa, yo'q jadval butun funksiyani ishdan chiqarardi.
    checks text[][] := array[
        -- ---- RASMIY YOZUVLAR: o'chirishni to'sadi -------------------------
        ['documents',                    'recipient_id',   'Berilgan hujjatlar',          'block'],
        ['issued_certificates',          'student_id',     'Berilgan sertifikatlar',      'block'],
        ['academic_records',             'student_id',     'Akademik yozuvlar',           'block'],
        ['activity_attendance',          'participant_id', 'Tadbir davomati',             'block'],
        ['marifat_attendance',           'student_id',     'Ma''rifat davomati',          'block'],
        ['competition_scores',           'participant_id', 'Musobaqa natijalari',         'block'],
        ['competition_scores',           'student_id',     'Musobaqa natijalari',         'block'],
        ['registrations',                'user_id',        'Ro''yxatdan o''tishlar',      'block'],
        ['memberships',                  'user_id',        'Klub a''zoligi',              'block'],
        ['social_activity_applications', 'student_id',     'Ijtimoiy faollik arizalari',  'block'],
        ['social_index_assessments',     'student_id',     'Indeks baholari',             'block'],
        ['social_index_evidence',        'student_id',     'Indeks dalillari',            'block'],
        ['social_index_penalties',       'student_id',     'Indeks jarimalari',           'block'],
        ['student_recognitions',         'student_id',     'Rag''bat yozuvlari',          'block'],
        ['recognition_cases',            'student_id',     'Rag''bat ishlari',            'block'],
        ['scholarship_applications',     'student_id',     'Stipendiya arizalari',        'block'],
        ['discipline_violations',        'student_id',     'Intizom yozuvlari',           'block'],
        ['student_documents',            'student_id',     'Yuklangan hujjatlar',         'block'],
        ['test_attempts',                'student_id',     'Test urinishlari',            'block'],

        -- ---- YETIM QOLADI: to'smaydi, lekin ko'rsatiladi -----------------
        ['student_passport',             'student_id',     'Raqamli pasport',             'warn'],
        ['student_cv_profile',           'student_id',     'CV va portfolio',             'warn'],
        ['student_enrollment_history',   'student_id',     'O''qish tarixi',              'warn'],
        ['student_housing',              'student_id',     'Turar joy yozuvi',            'warn'],
        ['reading_sessions',             'student_id',     'Kitobxonlik yozuvlari',       'warn'],
        ['cultural_visits',              'student_id',     'Madaniy tashriflar',          'warn'],
        ['marifat_activity_scores',      'student_id',     'Ma''rifat faollik ballari',   'warn'],
        ['social_score_transactions',    'student_id',     'Ball tranzaksiyalari',        'warn'],
        ['talent_profiles',              'student_id',     'Iqtidorli talaba profili',    'warn'],
        ['talent_assignments',           'student_id',     'Iqtidor biriktirmalari',      'warn'],
        ['talent_idps',                  'student_id',     'Rivojlanish rejalari',        'warn'],
        ['talent_goals',                 'student_id',     'Rivojlanish maqsadlari',      'warn'],
        ['team_members',                 'user_id',        'Jamoa a''zoligi',             'warn'],
        ['club_join_requests',           'user_id',        'Klubga arizalar',             'warn'],
        ['club_position_assignments',    'student_id',     'Klubdagi lavozimlar',         'warn'],
        ['sport_team_nominations',       'student_id',     'Sport nominatsiyalari',       'warn'],
        ['notifications',                'user_id',        'Bildirishnomalar',            'warn']
    ];
    i int;
begin
    if not is_platform_admin() then
        raise exception 'Faqat administrator ko''ra oladi';
    end if;

    select username into uname from public.profiles where id = p_user_id;

    for i in 1 .. array_length(checks, 1) loop
        if to_regclass('public.' || checks[i][1]) is null then
            continue;
        end if;
        if not exists (
            select 1 from information_schema.columns
            where table_schema = 'public'
              and table_name = checks[i][1]
              and column_name = checks[i][2]
        ) then
            continue;
        end if;

        -- Login VA UUID - ikkalasi bo'yicha: jadvallarning bir qismi loginni,
        -- bir qismi profil UUID sini saqlaydi.
        execute format(
            'select count(*) from public.%I where %I::text in (%L, %L)',
            checks[i][1], checks[i][2], coalesce(uname, '~yo''q~'), p_user_id::text
        ) into n;

        if n > 0 then
            source := checks[i][3];
            cnt := n;
            blocking := (checks[i][4] = 'block');
            return next;
        end if;
    end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- O'CHIRISH - endi FAQAT rasmiy yozuv to'sadi
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
      from public.admin_user_history(p_user_id)
     where blocking;

    if blockers is not null then
        raise exception
            'Bu akkauntda rasmiy yozuvlar bor (%). O''chirish o''rniga BLOKLANG — shunda hujjatlari tekshirilaveradi.',
            blockers;
    end if;

    delete from public.profiles where id = p_user_id;
    delete from auth.identities where user_id = p_user_id;
    delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.admin_user_history(uuid) from public, anon;
grant execute on function public.admin_user_history(uuid) to authenticated;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- TEKSHIRISH - qaysi jadvallar haqiqatan mavjud ekanini ko'rsatadi.
-- "yo'q" chiqqan qator xato emas: u jadval bu bazada boshqacha nomlangan
-- yoki hali yaratilmagan degani, va tekshiruv uni o'tkazib yuboradi.
-- ---------------------------------------------------------------------
with kutilgan(jadval, ustun) as (
    values
        ('documents','recipient_id'), ('issued_certificates','student_id'),
        ('academic_records','student_id'), ('activity_attendance','participant_id'),
        ('marifat_attendance','student_id'), ('competition_scores','participant_id'),
        ('registrations','user_id'), ('memberships','user_id'),
        ('social_activity_applications','student_id'), ('social_index_assessments','student_id'),
        ('social_index_evidence','student_id'), ('social_index_penalties','student_id'),
        ('student_recognitions','student_id'), ('recognition_cases','student_id'),
        ('scholarship_applications','student_id'), ('discipline_violations','student_id'),
        ('student_documents','student_id'), ('test_attempts','student_id'),
        ('student_passport','student_id'), ('student_cv_profile','student_id'),
        ('student_enrollment_history','student_id'), ('student_housing','student_id'),
        ('reading_sessions','student_id'), ('cultural_visits','student_id'),
        ('marifat_activity_scores','student_id'), ('social_score_transactions','student_id'),
        ('talent_profiles','student_id'), ('talent_assignments','student_id'),
        ('talent_idps','student_id'), ('talent_goals','student_id'),
        ('team_members','user_id'), ('club_join_requests','user_id'),
        ('club_position_assignments','student_id'), ('sport_team_nominations','student_id'),
        ('notifications','user_id')
)
select k.jadval, k.ustun,
       case when c.column_name is null then 'YO''Q - otkazib yuboriladi' else 'bor' end as holat
from kutilgan k
left join information_schema.columns c
       on c.table_schema = 'public' and c.table_name = k.jadval and c.column_name = k.ustun
order by holat, k.jadval;
