-- ============================================================================
-- 9-MEZON: RO'YXATDA YO'Q JOY KATALOGGA TUSHSIN
--
-- MUAMMO: katalogda 124 ta joy bor, lekin mamlakatdagi hamma teatr, muzey
-- va qadamjo emas. Talaba ro'yxatda yo'q joyni yozsa, u faqat o'sha bitta
-- qaydda qolib ketadi - keyingi talaba yana qo'lda yozadi, yana boshqacha
-- imloda. Katalog o'smaydi, hisobot esa bitta joyni o'nta qilib ko'rsatadi.
--
-- YECHIM: talaba yozgan joy katalogga TASDIQLANMAGAN holda tushadi
-- (`is_active = false`). Talabalar ro'yxatida u KO'RINMAYDI - faqat
-- administrator panelida chiqadi va u tekshirib faollashtiradi.
--
-- NEGA TO'G'RIDAN-TO'G'RI FAOL EMAS: aks holda katalogni har qanday talaba
-- to'ldirib yuborardi - imlo xatolari, takrorlar, bema'ni yozuvlar. Katalog
-- ma'lumotnomaga tushadigan rasmiy ro'yxat, uni odam tasdiqlashi kerak.
--
-- NEGA `security definer`: `cultural_places` ga yozish `is_platform_admin()`
-- talab qiladi va bu TO'G'RI - siyosatni yumshatib, talabaga to'g'ridan
-- to'g'ri yozish huquqini bermaymiz. Funksiya aniq bitta ishni bajaradi:
-- tasdiqlanmagan yozuv qo'shadi, boshqa hech narsa qila olmaydi.
--
-- TAKRORNI OLDINI OLISH: nom katta-kichik harf, ortiqcha bo'sh joy va
-- apostrofning turli shakllari bo'yicha tenglashtiriladi. Bir xil nom
-- allaqachon bo'lsa yangisi QO'SHILMAYDI, mavjudining id si qaytariladi.
--
-- ISHGA TUSHIRISH: Supabase -> SQL Editor -> butun faylni Run.
-- ============================================================================

do $guard$
begin
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'cultural_places'
                      and column_name = 'district') then
        raise exception 'Avval supabase/cultural_district.sql ni ishga tushiring.';
    end if;
end
$guard$;

-- Nomni solishtirishga tayyorlash. Kodda ham shunga mos normalizatsiya bor
-- (CulturalPlacePicker) - ikkalasi bir xil ishlashi kerak.
create or replace function public.cultural_name_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
    select lower(btrim(regexp_replace(
        replace(replace(replace(replace(
            coalesce(p_name, ''),
            chr(8216), ''''), chr(8217), ''''),
            chr(699),  ''''), chr(700),  ''''),
        '\s+', ' ', 'g')));
$$;

create or replace function public.suggest_cultural_place(
    p_name text,
    p_type text,
    p_region text default null,
    p_district text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user text := public.current_username();
    v_name text := btrim(coalesce(p_name, ''));
    v_key  text;
    v_id   text;
begin
    if v_user is null then
        raise exception 'Avtorizatsiya talab qilinadi';
    end if;
    if v_name = '' then
        raise exception 'Joy nomi bo''sh';
    end if;
    if p_type not in ('theatre', 'museum', 'park', 'cinema', 'heritage') then
        raise exception 'Joy turi notanish: %', p_type;
    end if;
    -- Haddan tashqari uzun nom - katalogni buzadigan yozuv.
    if length(v_name) > 160 then
        raise exception 'Joy nomi juda uzun';
    end if;

    v_key := public.cultural_name_key(v_name);

    -- Allaqachon bormi (faol yoki tasdiqlanmagan - farqi yo'q).
    select p.id into v_id
      from public.cultural_places p
     where public.cultural_name_key(p.name) = v_key
       and p.type = p_type
       and coalesce(p.region, '') = coalesce(btrim(p_region), '')
     limit 1;

    if v_id is not null then
        return v_id;
    end if;

    -- `md5` pg_catalog da - `search_path = ''` bo'lsa ham topiladi.
    -- `gen_random_uuid()` ataylab ishlatilmadi: u Supabase da `extensions`
    -- sxemasida bo'lishi mumkin va bo'sh search_path da topilmay qolardi.
    v_id := 'cnew_' || md5(v_key || coalesce(p_type, '') || v_user
                           || clock_timestamp()::text);

    insert into public.cultural_places
        (id, name, type, region, district, address,
         latitude, longitude, is_active, created_by, created_at)
    values
        (v_id, v_name, p_type,
         nullif(btrim(coalesce(p_region, '')), ''),
         nullif(btrim(coalesce(p_district, '')), ''),
         '', null, null, false, v_user, now());

    return v_id;
end
$$;

revoke all on function public.suggest_cultural_place(text, text, text, text)
    from public, anon;
grant execute on function public.suggest_cultural_place(text, text, text, text)
    to authenticated;

-- ---------------------------------------------------------------------------
-- TEKSHIRISH
-- ---------------------------------------------------------------------------
select 'suggest_cultural_place' as funksiya,
       case when to_regprocedure(
                'public.suggest_cultural_place(text,text,text,text)') is null
            then 'YO''Q' else 'bor' end as holat
union all
select 'cultural_name_key',
       case when to_regprocedure('public.cultural_name_key(text)') is null
            then 'YO''Q' else 'bor' end;
