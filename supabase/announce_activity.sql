-- =====================================================================
-- YANGI MUSOBAQA / TADBIR E'LONI
--
-- Musobaqa yoki tadbir e'lon qilinganda talabalarga xabar yuboradi. Xabar
-- bosilganda to'g'ri sahifaga olib boradi (`ref_type` + `ref_id` ->
-- src/config/notificationTypes.js dagi `notificationLink`).
--
-- NEGA SERVERDA, brauzerda emas:
--   1. `notification_preferences` ning RLS'i har kimga FAQAT O'Z qatorini
--      ko'rsatadi. Brauzerdan yuborilsa, boshqalarning tanlovi ko'rinmay,
--      xabarni o'chirgan odam ham xabar olardi - ya'ni sozlama YOLG'ON
--      bo'lib qolardi.
--   2. Yuzlab qator yozishni brauzerga yuklamaslik kerak.
--
-- QAMROV QOIDASI: xabar KIM RO'YXATDAN O'TA OLSA, o'shanga boradi.
--
--   Bu qoida db.js dagi `checkEligibility` dan olingan - ya'ni bildirishnoma
--   ro'yxatdan o'tish bilan BIR XIL mantiqqa bo'ysunadi. Aks holda ikki xil
--   xato chiqardi: odamga qatnasha olmaydigan tadbir haqida xabar berish
--   (bekorga umid), yoki qatnasha oladiganidan xabarni yashirish (imkoniyat
--   yo'qoladi).
--
--   Cheklovlar: fakultet, kurs, jins, havaskor/professional. Klub A'ZOLIGI
--   cheklov EMAS - platformada bunday sozlama umuman yo'q, klub tadbiriga
--   istalgan talaba yozila oladi. Shuning uchun klub tadbiri ham barcha mos
--   talabaga e'lon qilinadi: klub aynan shu yo'l bilan yangi a'zo topadi.
--
--   `membersOnly` bayrog'i baribir tekshiriladi - hozircha uni hech qanday
--   ekran yozmaydi, lekin keyin "faqat a'zolar uchun" sozlamasi qo'shilsa,
--   e'lon o'zi to'g'ri ishlaydi va bu faylni qayta ochish kerak bo'lmaydi.
--
-- QAYSI SOZLAMAGA bo'ysunishi ODAMGA qarab hal qilinadi:
--   klub a'zosi        -> "Klub yangiliklari"
--   qolgan talabalar   -> "Yangi musobaqa va tadbirlar"
-- Bitta e'lon ikki xil odam uchun ikki xil narsa: a'zoga bu o'z klubining
-- yangiligi, boshqasiga esa yangi imkoniyat e'loni.
--
-- TAKRORLANMAYDI: ayni odam + ayni faoliyat bo'yicha yozuv bo'lsa, qayta
-- yozilmaydi. Shuning uchun funksiyani bir necha marta chaqirish xavfsiz -
-- yaratilganda ham, keyin tasdiqlanganda ham chaqiriladi.
--
-- ISHGA TUSHIRISHDAN OLDIN `notification_preferences` jadvali yaratilgan
-- bo'lishi kerak (notification_preferences_and_deadlines.sql).
-- =====================================================================

create or replace function public.announce_activity(
    p_activity_type text,      -- 'event' | 'competition'
    p_activity_id   text
) returns integer
language plpgsql security definer set search_path = public as $$
declare
    v_title    text;
    v_club     text;
    v_reg      boolean := false;
    v_members  boolean := false;
    v_restr    jsonb   := '{}'::jsonb;
    v_fac      jsonb;
    v_crs      jsonb;
    v_gen      text;
    v_prof     text;
    v_head     text;
    v_msg      text;
    inserted   integer := 0;
begin
    if p_activity_type not in ('event', 'competition') then
        raise exception 'Noma''lum faoliyat turi: %', p_activity_type;
    end if;

    -- Tadbirda alohida ustunlar, musobaqada hammasi `data` jsonb ichida -
    -- bu farq tarixiy (competitions jadvali 30+ maydonli), lekin hisobga
    -- olinishi shart.
    if p_activity_type = 'event' then
        select e.title::text,
               e.club_id::text,
               coalesce(e.registration_required, false),
               coalesce((e.data->>'membersOnly')::boolean, false),
               coalesce(e.data->'restrictions', '{}'::jsonb)
          into v_title, v_club, v_reg, v_members, v_restr
          from public.events e
         where e.id::text = p_activity_id;
        v_head := 'Yangi tadbir';
    else
        select coalesce(nullif(c.data->>'name', ''), nullif(c.data->>'title', ''), 'Musobaqa'),
               case when c.data->>'contextType' = 'club' then c.data->>'contextId' else null end,
               coalesce((c.data->>'registrationRequired')::boolean, true),
               coalesce((c.data->>'membersOnly')::boolean, false),
               coalesce(c.data->'restrictions', '{}'::jsonb)
          into v_title, v_club, v_reg, v_members, v_restr
          from public.competitions c
         where c.id::text = p_activity_id;
        v_head := 'Yangi musobaqa';
    end if;

    if v_title is null then
        raise exception 'Faoliyat topilmadi: % %', p_activity_type, p_activity_id;
    end if;

    -- Cheklovlar. Bo'sh ro'yxat / bo'sh satr = cheklov yo'q, xuddi
    -- `checkEligibility` dagidek. `jsonb_typeof` tekshiruvi shart: bu maydon
    -- ba'zi eski yozuvlarda massiv emas, `null` yoki satr bo'lishi mumkin va
    -- u holda `jsonb_array_length` butun funksiyani yiqitardi.
    v_fac  := case when jsonb_typeof(v_restr->'byFaculty') = 'array' then v_restr->'byFaculty' end;
    v_crs  := case when jsonb_typeof(v_restr->'byCourse')  = 'array' then v_restr->'byCourse'  end;
    v_gen  := nullif(v_restr->>'byGender', '');
    v_prof := nullif(v_restr->>'byProfessionalism', '');

    -- Xabar matni ro'yxatdan o'tish HAQIQATAN ochiqligiga qarab yoziladi.
    -- Har doim "ro'yxatdan o'tish ochiq" deb yozish - ro'yxat talab
    -- qilinmaydigan tadbirda talabani yo'q tugmani qidirishga majburlardi.
    v_msg := case when v_reg
                  then v_title || ' — ro''yxatdan o''tish ochiq'
                  else v_title end;

    -- Klub e'lonida KLUB NOMI sarlavhada turadi: a'zo bo'lmagan talaba "bu
    -- menga nega keldi" deb o'ylamasligi, tadbir kimniki ekanini darrov
    -- ko'rishi kerak.
    if v_club is not null then
        v_head := coalesce(
            (select cl.name from public.clubs cl where cl.id::text = v_club),
            'Klub'
        ) || ': ' || lower(v_head);
    end if;

    with cand as (
        select p.username,
               -- A'zolik qamrovni belgilamaydi, faqat QAYSI SOZLAMA
               -- qo'llanishini belgilaydi. `memberships.user_id` ba'zan
               -- username, ba'zan uuid bilan yozilgan - ikkalasi ham
               -- tekshiriladi va ikkala tomon ham ::text ga keltiriladi
               -- (aks holda "uuid = text" xatosi chiqadi).
               (v_club is not null and exists (
                    select 1 from public.memberships m
                     where m.club_id::text = v_club
                       and (m.user_id::text = p.username::text or m.user_id::text = p.id::text)
               )) as is_member
          from public.profiles p
         where p.role::text = 'TALABA'
           -- Fakultet cheklovi. Talabaning fakulteti ko'rsatilmagan bo'lsa
           -- xabar YUBORILADI - `checkEligibility` ham aynan shunday qiladi
           -- (ma'lumot yo'qligi rad etish uchun asos emas).
           -- `jsonb_exists(...)` ataylab, `?` operatori o'rniga: `?` ni ba'zi
           -- mijozlar parametr o'rni deb o'qiydi va so'rov jimgina buziladi.
           and (v_fac is null or jsonb_array_length(v_fac) = 0 or p.faculty is null
                or jsonb_exists(v_fac, p.faculty))
           and (v_crs is null or jsonb_array_length(v_crs) = 0 or p.course is null
                or exists (select 1 from jsonb_array_elements_text(v_crs) x where x = p.course::text))
           and (v_gen  is null or p.gender is null          or p.gender = v_gen)
           and (v_prof is null or p.professionalism is null or p.professionalism = v_prof)
    ), audience as (
        select c.username,
               case when c.is_member then 'club_news' else 'new_activity' end as pref,
               c.is_member
          from cand c
         -- "Faqat a'zolar uchun" bayrog'i qo'yilgan bo'lsa - qamrov toraytiriladi.
         where not v_members or c.is_member
    ), ins as (
        insert into public.notifications (id, user_id, type, title, message, ref_id, ref_type, is_read)
        select 'notif_' || replace(gen_random_uuid()::text, '-', ''),
               a.username, 'info', v_head, v_msg, p_activity_id, p_activity_type, false
          from audience a
         -- Sozlamada o'chirgan bo'lsa - yuborilmaydi.
         where not exists (
                   select 1 from public.notification_preferences np
                    where np.username::text = a.username::text
                      and np.type_id = a.pref
                      and np.enabled = false
               )
           -- Allaqachon yuborilgan bo'lsa - takrorlanmaydi.
           and not exists (
                   select 1 from public.notifications n
                    where n.user_id::text = a.username::text
                      and n.ref_id::text  = p_activity_id
                      and n.ref_type      = p_activity_type
               )
        returning 1
    )
    select count(*) into inserted from ins;

    return inserted;
end;
$$;

revoke all on function public.announce_activity(text, text) from public, anon;
grant execute on function public.announce_activity(text, text) to authenticated;

notify pgrst, 'reload schema';
