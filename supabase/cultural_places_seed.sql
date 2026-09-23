-- ============================================================================
-- 9-MEZON: BOSHLANG'ICH JOYLAR KATALOGI
--
-- Katalog bo'sh edi, ya'ni talaba har safar joy nomini o'zi yozardi: bir
-- xil teatr o'n xil imloda yozilib, hisobotda o'nta boshqa joy bo'lib
-- ko'rinardi. Bu ro'yxat shuni to'xtatadi.
--
-- NIMA KIRITILGAN: uzoq yillardan beri mavjud davlat va jamoat
-- muassasalari hamda yodgorliklari. Talaba baribir o'zi ham yoza oladi -
-- ro'yxat YOPIQ emas.
--
-- KOORDINATA VA KO'CHA MANZILI ATAYLAB YOZILMADI. Ularni aniq bilmayman,
-- taxminiy koordinata esa HAQIQIY tashrifni "joydan uzoqda" deb
-- belgilab, talabani nohaq ayblardi. Kerak bo'lsa administrator
-- panelidan joy ustiga bosib qo'shadi (Tadbirlar -> Madaniy tashriflar ->
-- Joylar katalogi).
--
-- KINOTEATRLAR ATAYLAB KIRITILMADI: ular tez-tez nom va egasini
-- o'zgartiradi, yopilib ham ketadi. Yopilgan kinoteatrni ro'yxatga
-- qo'yish - yo'q joyni bordek ko'rsatish. Administrator hozirgi
-- ishlayotganlarini o'zi qo'shadi, talaba esa nomini yozib qayd etaveradi.
--
-- MUZEY NOMLARI: har viloyatdagi "o'lkashunoslik muzeyi" ba'zi joylarda
-- "tarix muzeyi" deb yuritiladi - nomini joyida tekshirib, kerak bo'lsa
-- administrator panelidan tahrirlang.
--
-- QAYTA ISHGA TUSHIRSA BO'LADI: `on conflict do nothing` - mavjud
-- yozuvlarga tegmaydi, sizning tahrirlaringiz ham saqlanib qoladi.
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

insert into public.cultural_places
    (id, name, type, region, district, address, latitude, longitude,
     is_active, created_by, created_at)
select v.id, v.name, v.type, v.region, v.district, '', null, null,
       true, 'seed', now()
from (values
    ('cseed_heritage_samarqand_viloyati_registon_majmuasi', 'Registon majmuasi', 'heritage', 'Samarqand viloyati', 'Samarqand shahri'),
    ('cseed_heritage_samarqand_viloyati_go_ri_amir_maqbarasi', 'Go''ri Amir maqbarasi', 'heritage', 'Samarqand viloyati', 'Samarqand shahri'),
    ('cseed_heritage_samarqand_viloyati_bibixonim_masjidi', 'Bibixonim masjidi', 'heritage', 'Samarqand viloyati', 'Samarqand shahri'),
    ('cseed_heritage_samarqand_viloyati_shohi_zinda_majmuasi', 'Shohi Zinda majmuasi', 'heritage', 'Samarqand viloyati', 'Samarqand shahri'),
    ('cseed_heritage_samarqand_viloyati_mirzo_ulug_bek_rasadxonasi', 'Mirzo Ulug''bek rasadxonasi', 'heritage', 'Samarqand viloyati', 'Samarqand shahri'),
    ('cseed_heritage_samarqand_viloyati_afrosiyob_muzey_qo_riqxonasi', 'Afrosiyob muzey-qo''riqxonasi', 'heritage', 'Samarqand viloyati', 'Samarqand shahri'),
    ('cseed_heritage_samarqand_viloyati_xoja_doniyor_maqbarasi', 'Xoja Doniyor maqbarasi', 'heritage', 'Samarqand viloyati', 'Samarqand shahri'),
    ('cseed_heritage_samarqand_viloyati_ruhobod_maqbarasi', 'Ruhobod maqbarasi', 'heritage', 'Samarqand viloyati', 'Samarqand shahri'),
    ('cseed_heritage_samarqand_viloyati_imom_buxoriy_yodgorlik_majmuasi', 'Imom Buxoriy yodgorlik majmuasi', 'heritage', 'Samarqand viloyati', 'Payariq'),
    ('cseed_heritage_samarqand_viloyati_chor_chinor', 'Chor Chinor', 'heritage', 'Samarqand viloyati', 'Urgut'),
    ('cseed_heritage_buxoro_viloyati_poi_kalon_majmuasi', 'Poi Kalon majmuasi', 'heritage', 'Buxoro viloyati', 'Buxoro shahri'),
    ('cseed_heritage_buxoro_viloyati_ark_qal_asi', 'Ark qal''asi', 'heritage', 'Buxoro viloyati', 'Buxoro shahri'),
    ('cseed_heritage_buxoro_viloyati_labi_hovuz_majmuasi', 'Labi Hovuz majmuasi', 'heritage', 'Buxoro viloyati', 'Buxoro shahri'),
    ('cseed_heritage_buxoro_viloyati_chor_minor', 'Chor Minor', 'heritage', 'Buxoro viloyati', 'Buxoro shahri'),
    ('cseed_heritage_buxoro_viloyati_ismoil_somoniy_maqbarasi', 'Ismoil Somoniy maqbarasi', 'heritage', 'Buxoro viloyati', 'Buxoro shahri'),
    ('cseed_heritage_buxoro_viloyati_chashmai_ayub_maqbarasi', 'Chashmai Ayub maqbarasi', 'heritage', 'Buxoro viloyati', 'Buxoro shahri'),
    ('cseed_heritage_buxoro_viloyati_sitorai_mohi_xosa_saroyi', 'Sitorai Mohi Xosa saroyi', 'heritage', 'Buxoro viloyati', 'Buxoro shahri'),
    ('cseed_heritage_buxoro_viloyati_bolo_hovuz_masjidi', 'Bolo Hovuz masjidi', 'heritage', 'Buxoro viloyati', 'Buxoro shahri'),
    ('cseed_heritage_buxoro_viloyati_chor_bakr_nekropoli', 'Chor Bakr nekropoli', 'heritage', 'Buxoro viloyati', 'Buxoro shahri'),
    ('cseed_heritage_buxoro_viloyati_bahouddin_naqshband_majmuasi', 'Bahouddin Naqshband majmuasi', 'heritage', 'Buxoro viloyati', 'Buxoro'),
    ('cseed_heritage_buxoro_viloyati_abdulxoliq_g_ijduvoniy_majmuasi', 'Abdulxoliq G''ijduvoniy majmuasi', 'heritage', 'Buxoro viloyati', 'G''ijduvon'),
    ('cseed_heritage_xorazm_viloyati_ichan_qal_a_muzey_qo_riqxonasi', 'Ichan Qal''a muzey-qo''riqxonasi', 'heritage', 'Xorazm viloyati', 'Xiva shahri'),
    ('cseed_heritage_xorazm_viloyati_kalta_minor', 'Kalta Minor', 'heritage', 'Xorazm viloyati', 'Xiva shahri'),
    ('cseed_heritage_xorazm_viloyati_tosh_hovli_saroyi', 'Tosh Hovli saroyi', 'heritage', 'Xorazm viloyati', 'Xiva shahri'),
    ('cseed_heritage_xorazm_viloyati_pahlavon_mahmud_majmuasi', 'Pahlavon Mahmud majmuasi', 'heritage', 'Xorazm viloyati', 'Xiva shahri'),
    ('cseed_heritage_xorazm_viloyati_juma_masjidi', 'Juma masjidi', 'heritage', 'Xorazm viloyati', 'Xiva shahri'),
    ('cseed_heritage_xorazm_viloyati_islom_xoja_minorasi', 'Islom Xoja minorasi', 'heritage', 'Xorazm viloyati', 'Xiva shahri'),
    ('cseed_heritage_xorazm_viloyati_al_xorazmiy_yodgorlik_majmuasi', 'Al-Xorazmiy yodgorlik majmuasi', 'heritage', 'Xorazm viloyati', 'Urganch shahri'),
    ('cseed_heritage_qashqadaryo_viloyati_oqsaroy', 'Oqsaroy', 'heritage', 'Qashqadaryo viloyati', 'Shahrisabz shahri'),
    ('cseed_heritage_qashqadaryo_viloyati_dor_us_siyodat_majmuasi', 'Dor us-Siyodat majmuasi', 'heritage', 'Qashqadaryo viloyati', 'Shahrisabz shahri'),
    ('cseed_heritage_qashqadaryo_viloyati_dor_ut_tilovat_majmuasi', 'Dor ut-Tilovat majmuasi', 'heritage', 'Qashqadaryo viloyati', 'Shahrisabz shahri'),
    ('cseed_heritage_qashqadaryo_viloyati_ko_k_gumbaz_masjidi', 'Ko''k Gumbaz masjidi', 'heritage', 'Qashqadaryo viloyati', 'Shahrisabz shahri'),
    ('cseed_heritage_qashqadaryo_viloyati_kitob_davlat_geologik_qo_riqxonasi', 'Kitob davlat geologik qo''riqxonasi', 'heritage', 'Qashqadaryo viloyati', 'Kitob'),
    ('cseed_heritage_farg_ona_viloyati_xudoyorxon_o_rdasi', 'Xudoyorxon o''rdasi', 'heritage', 'Farg''ona viloyati', 'Qo''qon shahri'),
    ('cseed_heritage_farg_ona_viloyati_jome_masjidi', 'Jome masjidi', 'heritage', 'Farg''ona viloyati', 'Qo''qon shahri'),
    ('cseed_heritage_farg_ona_viloyati_dahmai_shohon', 'Dahmai Shohon', 'heritage', 'Farg''ona viloyati', 'Qo''qon shahri'),
    ('cseed_heritage_farg_ona_viloyati_modarixon_maqbarasi', 'Modarixon maqbarasi', 'heritage', 'Farg''ona viloyati', 'Qo''qon shahri'),
    ('cseed_heritage_farg_ona_viloyati_rishton_kulolchilik_markazi', 'Rishton kulolchilik markazi', 'heritage', 'Farg''ona viloyati', 'Rishton'),
    ('cseed_heritage_farg_ona_viloyati_yodgorlik_ipak_fabrikasi', 'Yodgorlik ipak fabrikasi', 'heritage', 'Farg''ona viloyati', 'Marg''ilon shahri'),
    ('cseed_heritage_surxondaryo_viloyati_al_hakim_at_termiziy_majmuasi', 'Al-Hakim at-Termiziy majmuasi', 'heritage', 'Surxondaryo viloyati', 'Termiz shahri'),
    ('cseed_heritage_surxondaryo_viloyati_sulton_saodat_majmuasi', 'Sulton Saodat majmuasi', 'heritage', 'Surxondaryo viloyati', 'Termiz shahri'),
    ('cseed_heritage_surxondaryo_viloyati_fayoztepa', 'Fayoztepa', 'heritage', 'Surxondaryo viloyati', 'Termiz shahri'),
    ('cseed_heritage_surxondaryo_viloyati_qirqqiz_qal_asi', 'Qirqqiz qal''asi', 'heritage', 'Surxondaryo viloyati', 'Termiz shahri'),
    ('cseed_heritage_surxondaryo_viloyati_zurmala_minorasi', 'Zurmala minorasi', 'heritage', 'Surxondaryo viloyati', 'Termiz shahri'),
    ('cseed_heritage_surxondaryo_viloyati_boysun_tog_lari_ekoturizm', 'Boysun tog''lari (ekoturizm)', 'heritage', 'Surxondaryo viloyati', 'Boysun'),
    ('cseed_heritage_navoiy_viloyati_chashma_majmuasi', 'Chashma majmuasi', 'heritage', 'Navoiy viloyati', 'Nurota'),
    ('cseed_heritage_navoiy_viloyati_nurota_qal_asi', 'Nurota qal''asi', 'heritage', 'Navoiy viloyati', 'Nurota'),
    ('cseed_heritage_navoiy_viloyati_sarmishsoy_petrogliflari', 'Sarmishsoy petrogliflari', 'heritage', 'Navoiy viloyati', 'Nurota'),
    ('cseed_heritage_toshkent_shahri_hazrati_imom_majmuasi', 'Hazrati Imom majmuasi', 'heritage', 'Toshkent shahri', 'Shayxontohur'),
    ('cseed_heritage_toshkent_shahri_shayxontohur_majmuasi', 'Shayxontohur majmuasi', 'heritage', 'Toshkent shahri', 'Shayxontohur'),
    ('cseed_heritage_toshkent_shahri_ko_kaldosh_madrasasi', 'Ko''kaldosh madrasasi', 'heritage', 'Toshkent shahri', 'Shayxontohur'),
    ('cseed_heritage_toshkent_shahri_minor_masjidi', 'Minor masjidi', 'heritage', 'Toshkent shahri', 'Yunusobod'),
    ('cseed_heritage_toshkent_viloyati_zangiota_majmuasi', 'Zangiota majmuasi', 'heritage', 'Toshkent viloyati', 'Zangiota'),
    ('cseed_heritage_toshkent_viloyati_chorvoq_suv_ombori', 'Chorvoq suv ombori', 'heritage', 'Toshkent viloyati', 'Bo''stonliq'),
    ('cseed_heritage_toshkent_viloyati_chimyon_tog_maskani', 'Chimyon tog'' maskani', 'heritage', 'Toshkent viloyati', 'Bo''stonliq'),
    ('cseed_heritage_toshkent_viloyati_beldersoy', 'Beldersoy', 'heritage', 'Toshkent viloyati', 'Bo''stonliq'),
    ('cseed_heritage_jizzax_viloyati_zomin_milliy_tabiat_bog_i', 'Zomin milliy tabiat bog''i', 'heritage', 'Jizzax viloyati', 'Zomin'),
    ('cseed_heritage_jizzax_viloyati_aydarko_l', 'Aydarko''l', 'heritage', 'Jizzax viloyati', 'Forish'),
    ('cseed_heritage_qoraqalpog_iston_respublikasi_kemalar_qabristoni_orol', 'Kemalar qabristoni (Orol)', 'heritage', 'Qoraqalpog''iston Respublikasi', 'Mo''ynoq'),
    ('cseed_heritage_qoraqalpog_iston_respublikasi_ayozqal_a', 'Ayozqal''a', 'heritage', 'Qoraqalpog''iston Respublikasi', 'Ellikqal''a'),
    ('cseed_heritage_qoraqalpog_iston_respublikasi_tuproqqal_a', 'Tuproqqal''a', 'heritage', 'Qoraqalpog''iston Respublikasi', 'Ellikqal''a'),
    ('cseed_heritage_qoraqalpog_iston_respublikasi_mizdaxkan_nekropoli', 'Mizdaxkan nekropoli', 'heritage', 'Qoraqalpog''iston Respublikasi', 'Xo''jayli'),
    ('cseed_heritage_andijon_viloyati_bobur_xotira_bog_i', 'Bobur xotira bog''i', 'heritage', 'Andijon viloyati', 'Andijon shahri'),
    ('cseed_heritage_namangan_viloyati_mullo_qirg_iz_madrasasi', 'Mullo Qirg''iz madrasasi', 'heritage', 'Namangan viloyati', 'Namangan shahri'),
    ('cseed_museum_toshkent_shahri_o_zbekiston_davlat_san_at_muzeyi', 'O''zbekiston davlat san''at muzeyi', 'museum', 'Toshkent shahri', null),
    ('cseed_museum_toshkent_shahri_o_zbekiston_tarixi_davlat_muzeyi', 'O''zbekiston tarixi davlat muzeyi', 'museum', 'Toshkent shahri', null),
    ('cseed_museum_toshkent_shahri_temuriylar_tarixi_davlat_muzeyi', 'Temuriylar tarixi davlat muzeyi', 'museum', 'Toshkent shahri', null),
    ('cseed_museum_toshkent_shahri_o_zbekiston_davlat_amaliy_san_at_muzeyi', 'O''zbekiston davlat amaliy san''at muzeyi', 'museum', 'Toshkent shahri', null),
    ('cseed_museum_toshkent_shahri_qatag_on_qurbonlari_xotirasi_muzeyi', 'Qatag''on qurbonlari xotirasi muzeyi', 'museum', 'Toshkent shahri', null),
    ('cseed_museum_toshkent_shahri_olimpiya_shon_shuhrati_muzeyi', 'Olimpiya shon-shuhrati muzeyi', 'museum', 'Toshkent shahri', null),
    ('cseed_museum_toshkent_shahri_davlat_geologiya_muzeyi', 'Davlat geologiya muzeyi', 'museum', 'Toshkent shahri', null),
    ('cseed_museum_toshkent_shahri_sergey_esenin_uy_muzeyi', 'Sergey Esenin uy-muzeyi', 'museum', 'Toshkent shahri', null),
    ('cseed_museum_toshkent_shahri_abdulla_qodiriy_uy_muzeyi', 'Abdulla Qodiriy uy-muzeyi', 'museum', 'Toshkent shahri', null),
    ('cseed_museum_qoraqalpog_iston_respublikasi_savitskiy_nomidagi_qoraqalpog_iston_davlat_san_at_muzeyi', 'Savitskiy nomidagi Qoraqalpog''iston davlat san''at muzeyi', 'museum', 'Qoraqalpog''iston Respublikasi', 'Nukus shahri'),
    ('cseed_museum_samarqand_viloyati_sadriddin_ayniy_uy_muzeyi', 'Sadriddin Ayniy uy-muzeyi', 'museum', 'Samarqand viloyati', 'Samarqand shahri'),
    ('cseed_museum_samarqand_viloyati_mirzo_ulug_bek_memorial_muzeyi', 'Mirzo Ulug''bek memorial muzeyi', 'museum', 'Samarqand viloyati', 'Samarqand shahri'),
    ('cseed_museum_buxoro_viloyati_buxoro_davlat_me_morchilik_va_san_at_muzey_qo_riqxonasi', 'Buxoro davlat me''morchilik va san''at muzey-qo''riqxonasi', 'museum', 'Buxoro viloyati', 'Buxoro shahri'),
    ('cseed_museum_surxondaryo_viloyati_termiz_arxeologiya_muzeyi', 'Termiz arxeologiya muzeyi', 'museum', 'Surxondaryo viloyati', 'Termiz shahri'),
    ('cseed_museum_xorazm_viloyati_xorazm_ma_mun_akademiyasi_muzeyi', 'Xorazm Ma''mun akademiyasi muzeyi', 'museum', 'Xorazm viloyati', 'Xiva shahri'),
    ('cseed_museum_andijon_viloyati_bobur_xotira_muzeyi', 'Bobur xotira muzeyi', 'museum', 'Andijon viloyati', 'Andijon shahri'),
    ('cseed_museum_qoraqalpog_iston_respublikasi_qoraqalpog_iston_respublikasi_o_lkashunoslik_muzeyi', 'Qoraqalpog''iston Respublikasi o''lkashunoslik muzeyi', 'museum', 'Qoraqalpog''iston Respublikasi', 'Nukus shahri'),
    ('cseed_museum_andijon_viloyati_andijon_viloyat_o_lkashunoslik_muzeyi', 'Andijon viloyat o''lkashunoslik muzeyi', 'museum', 'Andijon viloyati', 'Andijon shahri'),
    ('cseed_museum_buxoro_viloyati_buxoro_viloyat_o_lkashunoslik_muzeyi', 'Buxoro viloyat o''lkashunoslik muzeyi', 'museum', 'Buxoro viloyati', 'Buxoro shahri'),
    ('cseed_museum_farg_ona_viloyati_farg_ona_viloyat_o_lkashunoslik_muzeyi', 'Farg''ona viloyat o''lkashunoslik muzeyi', 'museum', 'Farg''ona viloyati', 'Farg''ona shahri'),
    ('cseed_museum_jizzax_viloyati_jizzax_viloyat_o_lkashunoslik_muzeyi', 'Jizzax viloyat o''lkashunoslik muzeyi', 'museum', 'Jizzax viloyati', 'Jizzax shahri'),
    ('cseed_museum_namangan_viloyati_namangan_viloyat_o_lkashunoslik_muzeyi', 'Namangan viloyat o''lkashunoslik muzeyi', 'museum', 'Namangan viloyati', 'Namangan shahri'),
    ('cseed_museum_navoiy_viloyati_navoiy_viloyat_o_lkashunoslik_muzeyi', 'Navoiy viloyat o''lkashunoslik muzeyi', 'museum', 'Navoiy viloyati', 'Navoiy shahri'),
    ('cseed_museum_qashqadaryo_viloyati_qashqadaryo_viloyat_o_lkashunoslik_muzeyi', 'Qashqadaryo viloyat o''lkashunoslik muzeyi', 'museum', 'Qashqadaryo viloyati', 'Qarshi shahri'),
    ('cseed_museum_samarqand_viloyati_samarqand_viloyat_o_lkashunoslik_muzeyi', 'Samarqand viloyat o''lkashunoslik muzeyi', 'museum', 'Samarqand viloyati', 'Samarqand shahri'),
    ('cseed_museum_sirdaryo_viloyati_sirdaryo_viloyat_o_lkashunoslik_muzeyi', 'Sirdaryo viloyat o''lkashunoslik muzeyi', 'museum', 'Sirdaryo viloyati', 'Guliston shahri'),
    ('cseed_museum_surxondaryo_viloyati_surxondaryo_viloyat_o_lkashunoslik_muzeyi', 'Surxondaryo viloyat o''lkashunoslik muzeyi', 'museum', 'Surxondaryo viloyati', 'Termiz shahri'),
    ('cseed_museum_toshkent_viloyati_toshkent_viloyat_o_lkashunoslik_muzeyi', 'Toshkent viloyat o''lkashunoslik muzeyi', 'museum', 'Toshkent viloyati', null),
    ('cseed_museum_xorazm_viloyati_xorazm_viloyat_o_lkashunoslik_muzeyi', 'Xorazm viloyat o''lkashunoslik muzeyi', 'museum', 'Xorazm viloyati', 'Urganch shahri'),
    ('cseed_theatre_toshkent_shahri_alisher_navoiy_nomidagi_davlat_akademik_katta_teatri', 'Alisher Navoiy nomidagi Davlat akademik Katta teatri', 'theatre', 'Toshkent shahri', null),
    ('cseed_theatre_toshkent_shahri_o_zbek_milliy_akademik_drama_teatri', 'O''zbek Milliy akademik drama teatri', 'theatre', 'Toshkent shahri', null),
    ('cseed_theatre_toshkent_shahri_o_zbekiston_davlat_akademik_rus_drama_teatri', 'O''zbekiston davlat akademik rus drama teatri', 'theatre', 'Toshkent shahri', null),
    ('cseed_theatre_toshkent_shahri_abror_hidoyatov_nomidagi_o_zbek_drama_teatri', 'Abror Hidoyatov nomidagi o''zbek drama teatri', 'theatre', 'Toshkent shahri', null),
    ('cseed_theatre_toshkent_shahri_muqimiy_nomidagi_o_zbek_davlat_musiqali_teatri', 'Muqimiy nomidagi o''zbek davlat musiqali teatri', 'theatre', 'Toshkent shahri', null),
    ('cseed_theatre_toshkent_shahri_yosh_tomoshabinlar_teatri', 'Yosh tomoshabinlar teatri', 'theatre', 'Toshkent shahri', null),
    ('cseed_theatre_toshkent_shahri_ilhom_teatri', 'Ilhom teatri', 'theatre', 'Toshkent shahri', null),
    ('cseed_theatre_toshkent_shahri_respublika_qo_g_irchoq_teatri', 'Respublika qo''g''irchoq teatri', 'theatre', 'Toshkent shahri', null),
    ('cseed_theatre_qoraqalpog_iston_respublikasi_berdaq_nomidagi_qoraqalpoq_davlat_musiqali_teatri', 'Berdaq nomidagi Qoraqalpoq davlat musiqali teatri', 'theatre', 'Qoraqalpog''iston Respublikasi', 'Nukus shahri'),
    ('cseed_theatre_andijon_viloyati_bobur_nomidagi_andijon_viloyat_musiqali_drama_teatri', 'Bobur nomidagi Andijon viloyat musiqali drama teatri', 'theatre', 'Andijon viloyati', 'Andijon shahri'),
    ('cseed_theatre_buxoro_viloyati_buxoro_viloyat_musiqali_drama_teatri', 'Buxoro viloyat musiqali drama teatri', 'theatre', 'Buxoro viloyati', 'Buxoro shahri'),
    ('cseed_theatre_farg_ona_viloyati_farg_ona_viloyat_musiqali_drama_teatri', 'Farg''ona viloyat musiqali drama teatri', 'theatre', 'Farg''ona viloyati', 'Farg''ona shahri'),
    ('cseed_theatre_jizzax_viloyati_jizzax_viloyat_musiqali_drama_teatri', 'Jizzax viloyat musiqali drama teatri', 'theatre', 'Jizzax viloyati', 'Jizzax shahri'),
    ('cseed_theatre_namangan_viloyati_namangan_viloyat_musiqali_drama_teatri', 'Namangan viloyat musiqali drama teatri', 'theatre', 'Namangan viloyati', 'Namangan shahri'),
    ('cseed_theatre_navoiy_viloyati_navoiy_viloyat_musiqali_drama_teatri', 'Navoiy viloyat musiqali drama teatri', 'theatre', 'Navoiy viloyati', 'Navoiy shahri'),
    ('cseed_theatre_qashqadaryo_viloyati_qashqadaryo_viloyat_musiqali_drama_teatri', 'Qashqadaryo viloyat musiqali drama teatri', 'theatre', 'Qashqadaryo viloyati', 'Qarshi shahri'),
    ('cseed_theatre_samarqand_viloyati_samarqand_viloyat_musiqali_drama_teatri', 'Samarqand viloyat musiqali drama teatri', 'theatre', 'Samarqand viloyati', 'Samarqand shahri'),
    ('cseed_theatre_sirdaryo_viloyati_sirdaryo_viloyat_musiqali_drama_teatri', 'Sirdaryo viloyat musiqali drama teatri', 'theatre', 'Sirdaryo viloyati', 'Guliston shahri'),
    ('cseed_theatre_surxondaryo_viloyati_surxondaryo_viloyat_musiqali_drama_teatri', 'Surxondaryo viloyat musiqali drama teatri', 'theatre', 'Surxondaryo viloyati', 'Termiz shahri'),
    ('cseed_theatre_toshkent_viloyati_toshkent_viloyat_musiqali_drama_teatri', 'Toshkent viloyat musiqali drama teatri', 'theatre', 'Toshkent viloyati', null),
    ('cseed_theatre_xorazm_viloyati_xorazm_viloyat_musiqali_drama_teatri', 'Xorazm viloyat musiqali drama teatri', 'theatre', 'Xorazm viloyati', 'Urganch shahri'),
    ('cseed_park_toshkent_shahri_alisher_navoiy_nomidagi_milliy_bog', 'Alisher Navoiy nomidagi Milliy bog''', 'park', 'Toshkent shahri', null),
    ('cseed_park_toshkent_shahri_mustaqillik_maydoni', 'Mustaqillik maydoni', 'park', 'Toshkent shahri', null),
    ('cseed_park_toshkent_shahri_ekopark', 'Ekopark', 'park', 'Toshkent shahri', null),
    ('cseed_park_toshkent_shahri_yangi_o_zbekiston_bog_i', 'Yangi O''zbekiston bog''i', 'park', 'Toshkent shahri', null),
    ('cseed_park_toshkent_shahri_akademik_f_n_rusanov_nomidagi_botanika_bog_i', 'Akademik F.N. Rusanov nomidagi Botanika bog''i', 'park', 'Toshkent shahri', null),
    ('cseed_park_toshkent_shahri_anhor_xiyoboni', 'Anhor xiyoboni', 'park', 'Toshkent shahri', null),
    ('cseed_park_toshkent_shahri_xotira_maydoni', 'Xotira maydoni', 'park', 'Toshkent shahri', null),
    ('cseed_park_toshkent_shahri_magic_city_bog_i', 'Magic City bog''i', 'park', 'Toshkent shahri', null),
    ('cseed_park_toshkent_shahri_tashkent_city_bog_i', 'Tashkent City bog''i', 'park', 'Toshkent shahri', null),
    ('cseed_park_samarqand_viloyati_boqiy_shahar_majmuasi', 'Boqiy shahar majmuasi', 'park', 'Samarqand viloyati', 'Samarqand shahri')
) as v(id, name, type, region, district)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- TEKSHIRISH - tur va hudud kesimida
-- ---------------------------------------------------------------------------
select type as tur, count(*) as soni
from public.cultural_places
group by type
order by count(*) desc;
