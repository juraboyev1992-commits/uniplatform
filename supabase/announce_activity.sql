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
-- QAMROV:
--   klub tadbiri  -> faqat o'sha klub a'zolariga
--   umumiy tadbir -> barcha talabalarga
-- Klub tadbirini hammaga yuborish bir hafta ichida bildirishnomani foydasiz
-- shovqinga aylantirardi.
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
    v_title  text;
    v_club   text;
    v_reg    boolean := false;
    v_head   text;
    v_msg    text;
    v_pref   text;
    inserted integer := 0;
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
               coalesce(e.registration_required, false)
          into v_title, v_club, v_reg
          from public.events e
         where e.id::text = p_activity_id;
        v_head := 'Yangi tadbir';
    else
        select coalesce(nullif(c.data->>'name', ''), nullif(c.data->>'title', ''), 'Musobaqa'),
               case when c.data->>'contextType' = 'club' then c.data->>'contextId' else null end,
               coalesce((c.data->>'registrationRequired')::boolean, true)
          into v_title, v_club, v_reg
          from public.competitions c
         where c.id::text = p_activity_id;
        v_head := 'Yangi musobaqa';
    end if;

    if v_title is null then
        raise exception 'Faoliyat topilmadi: % %', p_activity_type, p_activity_id;
    end if;

    -- Xabar matni ro'yxatdan o'tish HAQIQATAN ochiqligiga qarab yoziladi.
    -- Har doim "ro'yxatdan o'tish ochiq" deb yozish - ro'yxat talab
    -- qilinmaydigan tadbirda talabani yo'q tugmani qidirishga majburlardi.
    v_msg := case when v_reg
                  then v_title || ' — ro''yxatdan o''tish ochiq'
                  else v_title end;

    -- QAYSI SOZLAMAGA bo'ysunishi QAMROVGA qarab hal qilinadi, faoliyat turiga
    -- emas. Sozlamadagi ikki yozuv aynan shuni va'da qiladi:
    --   "Yangi musobaqa va tadbirlar" -> universitet miqyosidagi e'lonlar
    --   "Klub yangiliklari"           -> a'zo bo'lgan klubdagi o'zgarishlar
    -- Hammasi `new_activity` ga bog'lansa, "faqat o'z klubim yangiliklari
    -- kelsin" degan odam uni o'chirib klubidan ham uzilib qolardi.
    v_pref := case when v_club is null then 'new_activity' else 'club_news' end;

    -- Klub e'lonida KLUB NOMI sarlavhada turadi: talaba "bu menga nega keldi"
    -- deb o'ylamasligi kerak - u o'sha klub a'zosi ekani shu yerdan ko'rinadi.
    if v_club is not null then
        v_head := coalesce(
            (select cl.name from public.clubs cl where cl.id::text = v_club),
            'Klub'
        ) || ': ' || lower(v_head);
    end if;

    with audience as (
        select p.username
          from public.profiles p
         where p.role::text = 'TALABA'
           -- Klub tadbiri bo'lsa faqat a'zolarga. `memberships.user_id` ba'zan
           -- username, ba'zan uuid bilan yozilgan - ikkalasi ham tekshiriladi
           -- (ikkala tomon ham ::text ga keltiriladi, aks holda uuid = text
           -- xatosi chiqadi).
           and (
               v_club is null
               or exists (
                   select 1 from public.memberships m
                    where m.club_id::text = v_club
                      and (m.user_id::text = p.username::text or m.user_id::text = p.id::text)
               )
           )
           -- Sozlamada o'chirgan bo'lsa - yuborilmaydi.
           and not exists (
               select 1 from public.notification_preferences np
                where np.username::text = p.username::text
                  and np.type_id = v_pref
                  and np.enabled = false
           )
           -- Allaqachon yuborilgan bo'lsa - takrorlanmaydi.
           and not exists (
               select 1 from public.notifications n
                where n.user_id::text = p.username::text
                  and n.ref_id::text = p_activity_id
                  and n.ref_type = p_activity_type
           )
    ), ins as (
        insert into public.notifications (id, user_id, type, title, message, ref_id, ref_type, is_read)
        select 'notif_' || replace(gen_random_uuid()::text, '-', ''),
               a.username, 'info', v_head, v_msg, p_activity_id, p_activity_type, false
          from audience a
        returning 1
    )
    select count(*) into inserted from ins;

    return inserted;
end;
$$;

revoke all on function public.announce_activity(text, text) from public, anon;
grant execute on function public.announce_activity(text, text) to authenticated;

notify pgrst, 'reload schema';
