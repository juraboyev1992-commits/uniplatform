// "Ijtimoiy faollik indeksi" — rasmiy metodika kodda.
//
// MANBA: Oliy ta'lim, fan va innovatsiyalar vazirligining 2025-yil 16-maydagi
// 186-sonli buyrug'iga ilova. Vazirlar Mahkamasining 2025-yil 14-martdagi
// 149-son qaroriga 2-ilova asosida.
//
// NEGA ALOHIDA FAYL: bugungacha platformada 11 ta mezon nomi va maksimal bali
// bor edi (constants/index.js), lekin HAR MEZON ICHIDAGI QOIDA - qaysi natijaga
// necha ball - hech qayerda yozilmagandi. Ball qo'lda kiritilardi, ya'ni
// metodika hujjatda qolib, tizimda esa "admin qancha desa shuncha" edi.
//
// Bu fayl faqat QOIDANI e'lon qiladi. Hisoblash `utils/socialActivityScoring.js`
// da, ma'lumot esa o'z joyida qoladi - mavjud jadval, funksiya va bog'lanishlar
// o'zgarmaydi.
//
// TAMOYIL: bu yerda hech narsa o'ylab topilmagan. Har bir raqam va band
// hujjatdan. Hujjat aytmagan joyda `null` turadi va tizim "ma'lumot yo'q" deydi,
// taxmin qilmaydi.

// ---------------------------------------------------------------------------
// MEZONLAR — hujjatning ilovasidagi jadval tartibida.
//
// `key` ATAYLAB eski kalitlar bilan bir xil (READING, CLUBS, ...): butun
// platforma (arizalar, ball manbalari, sozlamalar, talaba sahifasi) shu
// kalitlar bo'yicha ishlaydi va hech biri buzilmasligi kerak.
//
// `evidence` - hujjat talab qiladigan asoslovchi hujjat.
// `confirmedBy` - hujjatga ko'ra kim tasdiqlaydi.
// `source` - platformada bu ma'lumot QAYERDAN kelishi mumkin:
//     'auto'   - platformaning o'z ma'lumotidan hisoblanadi
//     'hemis'  - tashqi tizimdan olinishi kerak
//     'manual' - mas'ul kishi baholaydi (hujjat shunday talab qiladi)
// ---------------------------------------------------------------------------
export const INDEX_CRITERIA = {
    READING: {
        id: 1, key: 'READING', maxPoints: 20,
        name: 'Kitobxonlik madaniyati',
        // Hujjat: 100 ta eng sara badiiy adabiyot ro'yxati platformaga
        // joylashtiriladi, har asar bo'yicha test tuziladi, talaba testdan
        // o'tsa AVTOMATIK ball oladi.
        source: 'auto',
        evidence: 'Platformadagi test natijasi',
        confirmedBy: null, // avtomatik - tasdiqlovchi shart emas
        // O'quv yili davomida MUVAFFAQIYATLI test topshirilgan kitoblar soni.
        bands: [
            { min: 10, max: 12, points: 20, label: '10-12 ta kitob' },
            { min: 7, max: 9, points: 15, label: '7-9 ta kitob' },
            { min: 4, max: 6, points: 10, label: '4-6 ta kitob' },
            { min: 0, max: 3, points: 0, label: '4 tadan kam' },
        ],
        // Hujjatda 12 tadan ko'p o'qigan uchun alohida band yo'q - eng yuqori
        // band 20 ball bilan chegaralanadi.
        note: '12 tadan ortiq kitob ham 20 balldan oshmaydi.',
    },

    CLUBS: {
        id: 2, key: 'CLUBS', maxPoints: 20,
        name: '5 muhim tashabbus doirasidagi to\'garaklarda faol ishtiroki',
        source: 'auto',
        evidence: 'To\'garak rahbarining ma\'lumotnomasi',
        confirmedBy: ['kafedra_mudiri', 'iqtidorli_talabalar_boshligi', 'yoshlar_boshligi'],
        // BALL BIRLIGI - YO'NALISH, tadbir emas va klub emas.
        //
        // Har yo'nalish uchun 10 ballgacha; yig'indi 20 ball bilan chegaralangan.
        // Bundan muhim natija kelib chiqadi: 10 klubning 40 ta tadbirida
        // qatnashgan talaba ham, 2 klubning 8 ta tadbirida qatnashgan talaba ham
        // ikki yo'nalishni qamrasa BIR XIL - 20 ball oladi. Tadbir soni ballni
        // oshirmaydi, u faqat "shu yo'nalishda faolmi" degan savolga javob beradi.
        // Uchinchi yo'nalish ham qo'shimcha ball bermaydi.
        directions: [
            { key: 'culture', label: 'Madaniyat va san\'at', points: 10 },
            { key: 'sport', label: 'Sport seksiyalari', points: 10 },
            { key: 'it', label: 'Axborot texnologiyalari', points: 10 },
            { key: 'reading', label: 'Kitobxonlik va adabiyot', points: 10 },
            { key: 'employment', label: 'Bandlik', points: 10 },
        ],
        // Alohida band: talabaning O'ZI to'garak tashkil etgani va uni samarali
        // yo'lga qo'ygani - bu yolg'iz o'zi maksimal ballni beradi.
        founderPoints: 20,
        note: 'To\'garak tashkil etgan talaba 20 ball oladi.',
    },

    ACADEMIC: {
        id: 3, key: 'ACADEMIC', maxPoints: 10,
        name: 'Talabaning akademik o\'zlashtirishi',
        // Hujjat: platforma HEMIS ga integratsiya qilinadi, ball har semestr
        // yakunida AVTOMATIK qo'yiladi.
        source: 'hemis',
        evidence: 'HEMIS GPA ko\'rsatkichi',
        confirmedBy: null,
        // Hujjatdagi jadval AYNAN. Oraliq qiymat uchun qoida berilmagan -
        // shuning uchun eng yaqin PASTKI band olinadi, yaxlitlanmaydi.
        gpaTable: [
            { gpa: 5.0, points: 10 },
            { gpa: 4.9, points: 9.7 },
            { gpa: 4.8, points: 9.3 },
            { gpa: 4.7, points: 9 },
            { gpa: 4.6, points: 8.7 },
            { gpa: 4.5, points: 8.3 },
            { gpa: 4.4, points: 8 },
            { gpa: 4.3, points: 7.7 },
            { gpa: 4.2, points: 7.3 },
            { gpa: 4.1, points: 7 },
            { gpa: 4.0, points: 6.7 },
            { gpa: 3.9, points: 6.3 },
            { gpa: 3.8, points: 6 },
            { gpa: 3.7, points: 5.7 },
            { gpa: 3.6, points: 5.3 },
            { gpa: 3.5, points: 5 },
        ],
        note: 'GPA 3.5 dan past bo\'lsa ball berilmaydi.',
    },

    DISCIPLINE: {
        id: 4, key: 'DISCIPLINE', maxPoints: 5,
        name: 'Ichki tartib qoidalari va Odob-axloq kodeksiga rioya etishi',
        source: 'manual',
        evidence: 'Tyutor bahosi; Odob-axloq komissiyasi xulosasi',
        confirmedBy: ['tutor_or_dean_deputy'],
        parts: [
            { key: 'dresscode', label: 'Kiyinish madaniyati (dresskod)', points: 2 },
            { key: 'ethics', label: 'Odob-axloq kodeksi talablari', points: 3 },
        ],
        // Hujjat: haftada 1 marta baholanadi.
        cadence: 'weekly',
        // ENG QAT'IY QOIDA: talab buzilgan taqdirda talabaning hujjatlari
        // tanlov uchun UMUMAN QABUL QILINMAYDI. Bu ball kamayishi emas -
        // butun nomzodlik bekor bo'ladi.
        disqualifying: true,
        note: 'Talab buzilsa hujjatlar tanlovga qabul qilinmaydi.',
    },

    COMPETITIONS: {
        id: 5, key: 'COMPETITIONS', maxPoints: 10,
        name: 'Ko\'rik-tanlov, fan olimpiadalari va sport musobaqalarida erishgan natijalari',
        source: 'auto',
        evidence: 'Diplom yoki sertifikat',
        confirmedBy: ['tutor'],
        // Bosqich × o'rin. Hujjatda oraliq ("1, 3-ball", "4-6 ball") berilgan -
        // 1-o'rin yuqori chegara, 3-o'rin quyi chegara deb taqsimlandi.
        // Xalqaro bosqichda uchala o'rin ham 10 ball.
        //
        // Bosqich kalitlari ATAYLAB `config/activityLifecycle.js` dagi
        // ACTIVITY_LEVELS bilan bir xil - musobaqa yaratishda tanlanadigan
        // "Darajasi" maydoni to'g'ridan-to'g'ri shu yerga ulanadi.
        placement: {
            university: { 1: 3, 2: 2, 3: 1, label: 'Ta\'lim muassasasi bosqichi' },
            city: { 1: 6, 2: 5, 3: 4, label: 'Viloyat / hududiy bosqich' },
            republic: { 1: 9, 2: 8, 3: 7, label: 'Respublika bosqichi' },
            international: { 1: 10, 2: 10, 3: 10, label: 'Xalqaro miqyos' },
        },
        // Hujjat: ballar VAZIRLIK RO'YXATIGA kiritilgan ko'rik-tanlovlar
        // asosida beriladi. Ya'ni har qanday musobaqa emas.
        requiresOfficialList: true,
        note: 'Faqat vazirlik ro\'yxatidagi tanlovlar hisobga olinadi. Fakultet darajasi hujjatda yo\'q.',
    },

    ATTENDANCE: {
        id: 6, key: 'ATTENDANCE', maxPoints: 5,
        name: 'Talabaning darslarga to\'liq, kechikmasdan kelishi',
        // DIQQAT: bu DARS davomati, tadbir davomati EMAS. Platformada dars
        // davomati yo'q - u HEMIS tomonida.
        source: 'hemis',
        evidence: 'Dars davomati natijalari',
        confirmedBy: ['tutor_or_dean_deputy'],
        // Bir semestrda qoldirilgan soat. Hujjatda oraliq berilgan ("3-4 ball") -
        // quyi chegara olinadi, chunki yuqori chegara uchun qo'shimcha shart yo'q.
        bands: [
            { maxHours: 10, points: 5, label: '10 soatgacha' },
            { maxHours: 20, points: 3, label: '10-20 soat' },
            { maxHours: 30, points: 2, label: '20-30 soat' },
            { maxHours: Infinity, points: 0, label: '30 soatdan ortiq' },
        ],
        note: 'Semestr kesimida hisoblanadi.',
    },

    EDUCATION: {
        id: 7, key: 'EDUCATION', maxPoints: 10,
        name: '"Ma\'rifat darslari"dagi faol ishtiroki',
        source: 'manual',
        evidence: 'Ma\'rifat darslari davomati va faolligi',
        confirmedBy: ['masul_professor'],
        // Davomat foizi bo'yicha. Hujjatda 80-90% oralig'i uchun band
        // KO'RSATILMAGAN - o'ylab topilmaydi, 70-80 bandi qo'llanadi.
        attendanceBands: [
            { minPercent: 90, points: 6, label: '90-100%' },
            { minPercent: 70, points: 4, label: '70-80%' },
            { minPercent: 60, points: 2, label: '60-70%' },
            { minPercent: 0, points: 0, label: '60% dan past' },
        ],
        activityPoints: 4, // faollik uchun alohida 4 ballgacha
        note: 'Davomat 6 ball + faollik 4 ball = 10 ball.',
    },

    VOLUNTEERING: {
        id: 8, key: 'VOLUNTEERING', maxPoints: 5,
        name: 'Volontyorlik va jamoat ishlaridagi faolligi',
        source: 'manual',
        evidence: 'Tasdiqlovchi hujjat',
        confirmedBy: ['tutor_or_dean_deputy'],
        // Hujjat nimalar hisobga olinishini sanaydi, lekin har biriga alohida
        // ball bermaydi - tyutor 5 ballgacha yaxlit baholaydi.
        counts: [
            'Ma\'naviy-ma\'rifiy tadbirlar',
            'Umumxalq bayramlari',
            'Umumxalq hasharlari',
            'Ta\'lim muassasasi tashkil etgan jamoatchilik ishlari',
            'Volontyorlik faoliyati, tashkilotchiligi, tashabbuskorligi',
        ],
        cadence: 'yearly',
        note: 'Yaxlit baho (5 ballgacha) - hujjatda bandlar bo\'yicha taqsimot yo\'q.',
    },

    CULTURAL: {
        id: 9, key: 'CULTURAL', maxPoints: 5,
        name: 'Teatr va muzey, xiyobon, kino, tarixiy qadamjolarga tashriflar',
        source: 'manual',
        evidence: 'Geolokatsiya va hududda tushilgan fotosurat',
        confirmedBy: ['tutor_or_dean_deputy'],
        // Tashrif CHASTOTASI bo'yicha - jami soni bo'yicha emas.
        frequencyBands: [
            { key: 'monthly', label: 'Har oyda kamida bir marta', points: 5 },
            { key: 'bimonthly', label: 'Har ikki oyda kamida bir marta', points: 3 },
            { key: 'semester', label: 'Semestrda kamida bir marta', points: 1 },
        ],
        note: 'Ball tashriflar soniga emas, muntazamligiga qarab beriladi.',
    },

    SPORTS: {
        id: 10, key: 'SPORTS', maxPoints: 5,
        name: 'Sport bilan shug\'ullanishi va sog\'lom turmush tarziga amal qilishi',
        source: 'manual',
        evidence: 'A\'zolik hujjati; tyutor bahosi',
        confirmedBy: ['tutor_or_dean_deputy', 'sport_klubi'],
        parts: [
            { key: 'national_team', label: 'Terma jamoa a\'zoligi', points: 5, exclusive: true },
            { key: 'section', label: 'Sport klubi/seksiya/to\'garakda muntazam shug\'ullanish', points: 3, exclusive: true },
            { key: 'competition', label: 'OTM sport musobaqalarida faol ishtirok', points: 1, exclusive: true },
            { key: 'no_habits', label: 'Zararli illatlardan xoli ekanligi', points: 2 },
            { key: 'tidiness', label: 'Toza-ozoda yurish, saranjom-sarishtalik', points: 2 },
        ],
        // Birinchi uchtasi bir-birini istisno qiladi (eng yuqorisi olinadi),
        // qolgan ikkitasi qo'shiladi. Yig'indi baribir 5 ball bilan cheklanadi.
        note: 'A\'zolik turlaridan eng yuqorisi olinadi; jami 5 balldan oshmaydi.',
    },

    OTHER: {
        id: 11, key: 'OTHER', maxPoints: 5,
        name: 'Ma\'naviy-ma\'rifiy sohaga oid boshqa yo\'nalishlardagi faolligi',
        source: 'manual',
        evidence: 'Tyutor xulosasi',
        confirmedBy: ['tutor_or_dean_deputy'],
        parts: [
            { key: 'partner_event', label: 'Hamkor tashkilotlar bilan o\'z tashabbusi bilan tadbir tashkil etish', points: 3 },
            { key: 'xiyobon_event', label: 'Adiblar xiyoboni va boshqa xiyobonlarda tadbir tashkil etish', points: 2 },
            { key: 'active_participation', label: 'Ma\'naviy-ma\'rifiy tadbirlar tashkil etishda faol ishtirok', points: 1 },
        ],
        cadence: 'semester',
        note: 'Har semestr yakunida baholanadi.',
    },
};

// ---------------------------------------------------------------------------
// KITOBXONLIK TESTINING TARTIBI (1-mezon)
//
// Metodika testni qanday topshirishni aniq aytadi:
//   "Badiiy asarni o'qigan talabalar istalgan paytda oliy ta'lim muassasasi
//    ARMga kelib, HEMIS dasturi orqali o'z ID raqami va login parol bilan
//    aynan o'qigan asari bo'yicha kompyuterda test topshiradi va ijobiy
//    baholansa, avtomatik tarzda ball oladi."
//
// Ya'ni test KUTUBXONADA, joyida topshiriladi - bu ataylab qo'yilgan nazorat,
// qulaylik masalasi emas. Platformada u sozlama bilan boshqariladi, chunki
// universitet uni bosqichma-bosqich joriy qilishi mumkin.
//
// Urinishlar soni metodikada ko'rsatilmagan. Bir marta - universitetning
// qarori: asarni o'qigan talaba birinchi urinishda o'tadi degan mantiqqa
// tayanadi.
// ---------------------------------------------------------------------------
export const READING_POLICY = {
    // Bir asar bo'yicha necha marta urinish mumkin.
    maxAttemptsPerBook: 1,
    // Yoqilganda test faqat kutubxona xodimi ochgan seansda topshiriladi.
    // Sozlamalardan o'zgartiriladi; bu yerda boshlang'ich qiymat.
    libraryOnlyDefault: false,
    // Kutubxona seansi necha daqiqa amal qiladi.
    sessionMinutes: 90,
    // "Ijobiy baholansa" - metodika aniq foiz bermaydi, universitet belgilaydi.
    defaultPassPercent: 60,
};

// ---------------------------------------------------------------------------
// TO'GARAKLAR BO'YICHA HISOB TARTIBI (2-mezon)
//
// Metodika "har bir to'garakdagi faol ishtirok uchun 10 ballgacha baholanadi"
// deydi, lekin SHKALANI bermaydi. Shuning uchun o'lchov universitet tomonidan
// belgilanadi - kodda o'ylab topilmaydi.
//
// O'LCHOV: mutlaq tadbir soni EMAS, klubning O'Z tadbirlariga nisbatan foiz.
//
//     klub bo'yicha foiz = qatnashgan / klub o'tkazgan tadbirlar × 100
//     yo'nalish bali     = min(10, foiz / 10)
//
// Nega mutlaq son noto'g'ri edi: yiliga 2 ta uchrashuv o'tkazadigan klub a'zosi
// ikkalasiga ham borsa - bu TO'LIQ faollik. Mutlaq chegara (masalan 4 ta) unga
// yarim ball berardi, yiliga 20 ta tadbir o'tkazadigan klubda 4 tasiga borgan
// talabaga esa to'liq ball berardi. Natija teskari bo'lib chiqardi.
//
// Yo'nalish bir necha klубни qamrasa - ENG YUQORI foizli klub olinadi.
// Metodika "har bir to'garakdagi faol ishtirok" deydi, ya'ni birlik - klub;
// bir klubdagi to'liq faollik boshqa klubdagi sustlik bilan yuvilmasligi kerak.
// ---------------------------------------------------------------------------
export const CLUB_ACTIVITY = {
    // Klub kamida shuncha tadbir o'tkazgan bo'lsagina foiz hisoblanadi.
    // Bitta tadbir o'tkazib, unga kelgan hammaga 10 ball berish mumkin bo'lib
    // qolmasin. Sozlamalardan o'zgartiriladi.
    defaultMinClubEvents: 2,
    // Koordinator ballni qo'lda o'zgartira oladi - metodikadagi "to'garak
    // rahbarining ma'lumotnomasi" aynan shu.
    coordinatorMayOverride: true,
};

// Klub yo'nalishlari kalitlari - INDEX_CRITERIA.CLUBS.directions bilan bir xil.
export const CLUB_DIRECTION_KEYS = ['culture', 'sport', 'it', 'reading', 'employment'];

export const getClubDirectionLabel = (key) =>
    INDEX_CRITERIA.CLUBS.directions.find(d => d.key === key)?.label || null;

// Foiz -> ball. 100% = 10 ball, 60% = 6 ball.
export const clubPercentToPoints = (percent) => {
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    return Math.round(p / 10);
};

export const INDEX_CRITERIA_ORDER = [
    'READING', 'CLUBS', 'ACADEMIC', 'DISCIPLINE', 'COMPETITIONS',
    'ATTENDANCE', 'EDUCATION', 'VOLUNTEERING', 'CULTURAL', 'SPORTS', 'OTHER',
];

// ---------------------------------------------------------------------------
// QAYSI MEZON TASDIQ TALAB QILADI
//
// Bu ro'yxat o'ylab topilmagan - metodikaning O'Z iborasidan kelib chiqadi:
//
//   1-mezon: "ijobiy baholansa, AVTOMATIK tarzda ball oladi"        -> tasdiq yo'q
//   3-mezon: "ballar AVTOMATIK tarzda qo'yib boriladi"              -> tasdiq yo'q
//   qolganlari: "ma'lumotnoma asosida", "tyutor xulosasi asosida",
//               "asoslovchi hujjat asosida"                          -> tasdiq kerak
//
// Nega muhim: tasdiq talab qilmaydigan mezonga "Tasdiqlanmagan" yorlig'ini
// osib qo'yish talabani "kimdir tasdiqlashi kerak ekan" deb kutdirib qo'yardi,
// holbuki kutadigan hech kim yo'q.
// ---------------------------------------------------------------------------
// DISCIPLINE bu ro'yxatda YO'Q: mas'ulning ishi ball qo'yish emas, BUZILISHNI
// QAYD ETISH. Buzilish qayd etilmagan talaba metodikaga ko'ra to'liq ballga ega
// ("rioya etishi maksimal ball olishini kafolatlaydi"), shuning uchun uni
// alohida tasdiqlashga chiqarish 550 ta bo'sh qator degani bo'lardi.
// EDUCATION ham bu ro'yxatdan CHIQARILDI: 7-mezonning davomat qismini tizim
// hisoblaydi, faollik qismini esa vakolatli shaxs O'ZI qo'yadi. Ustiga yana
// tasdiqlash bosqichi qo'yilsa, o'sha odam o'z ishini o'zi tasdiqlagan bo'lardi.
// DISCIPLINE ham xuddi shu sabab bilan chiqarilgan (yuqoriga qarang).
// SPORTS ham chiqarildi: a'zolikni sport klubi rahbari tasdiqlaydi, ikki
// qolgan bandni tyutor yoki yotoqxona mudiri qayd etadi. Ustiga yana
// tasdiqlash bosqichi qo'yilsa, o'sha odamlar o'z ishini o'zi tasdiqlagan
// bo'lardi - EDUCATION va DISCIPLINE bilan bir xil sabab.
// OTHER ham chiqarildi: tashabbuskorlikni mas'ul davomat belgilashda qayd
// etadi va bu allaqachon uning tasdig'i. Yil oxirida yana bir bor tasdiqlash
// o'sha odamning o'z yozuvini o'zi tasdiqlashi bo'lardi.
export const CRITERIA_NEEDING_CONFIRMATION = [
    'CLUBS', 'COMPETITIONS', 'ATTENDANCE',
    'VOLUNTEERING', 'CULTURAL',
];

// ---------------------------------------------------------------------------
// INTIZOM VA ODOB-AXLOQ (4-mezon) — BUZILISH QAYD ETISH TARTIBI
//
// Metodikaning mantig'i TO'PLASH emas, PRESUMPSIYA:
//   "Talabaning dresskod qoidalarini buzmasligi ... uning MAKSIMAL BALL
//    olishini KAFOLATLAYDI"
//
// Ya'ni har talaba 5 balldan turadi va ball faqat buzilish qayd etilganda
// kamayadi. Mas'ul faqat buzgan talabani belgilaydi; qolganlariga tegmasa
// ular buzmagan hisoblanadi. Bu ish hajmini talabalar soniga emas,
// muammolar soniga bog'laydi.
//
// Ayirma miqdorini metodika BERMAYDI ("2 ballgacha", "3 ballgacha" deyilgan,
// shkala yo'q). Shuning uchun u sozlamadan o'zgartiriladi - bu universitet
// qarori, kodda o'ylab topilgan raqam emas.
// ---------------------------------------------------------------------------
export const DISCIPLINE_PARTS = {
    dresscode: {
        key: 'dresscode',
        label: 'Kiyinish madaniyati (dresskod)',
        maxPoints: 2,
        defaultDeduction: 0.5,
        // Metodikada 1-qoida uchun asos - talabaning tushuntirish xati.
        evidenceLabel: 'Talabaning tushuntirish xati',
    },
    ethics: {
        key: 'ethics',
        label: 'Odob-axloq kodeksi talablari',
        maxPoints: 3,
        defaultDeduction: 1.5,
        // 2-qoida uchun asos - rasmiy hujjat (hayfsan, farmoyish, buyruq).
        evidenceLabel: 'Rasmiy hujjat (hayfsan, farmoyish, buyruq)',
    },
};

export const DISCIPLINE_PART_ORDER = ['dresscode', 'ethics'];

// Buzilishlar asosida ball. Har qism ALOHIDA hisoblanadi va o'z shipiga uriladi:
// dresskodni ko'p marta buzish odob-axloq balini yeb qo'ymasligi kerak.
export const disciplinePoints = (violations, deductions = {}) => {
    return DISCIPLINE_PART_ORDER.reduce((total, key) => {
        const part = DISCIPLINE_PARTS[key];
        const per = Number(deductions[key] ?? part.defaultDeduction) || 0;
        const count = violations.filter(v => v.type === key).length;
        return total + Math.max(0, part.maxPoints - count * per);
    }, 0);
};

export const needsConfirmation = (criterionKey) =>
    CRITERIA_NEEDING_CONFIRMATION.includes(criterionKey);

// ---------------------------------------------------------------------------
// TALABA HAR MEZONDA NIMA QILA OLADI
//
// Bu ham metodikadan kelib chiqadi, taxmin emas. Uchta mezonda talabaning O'ZI
// asoslovchi hujjat keltiradi, bittasida test topshiradi, qolganlarida esa u
// KUZATUVCHI - va bu normal, chunki ballni tyutor yoki tizim qo'yadi.
//
// Har kartada aniq amal ko'rsatiladi. "Amal talab qilinmaydi" ham javob:
// talaba nimadir qilishi kerakmi yoki yo'qmi - shu savolga javob bo'lishi kerak.
//
//   type: 'link'   - boshqa sahifaga o'tadi
//         'upload' - asoslovchi hujjat yuklaydi
//         'remind' - tasdiqlashni so'raydi
//         'none'   - amal talab qilinmaydi
// ---------------------------------------------------------------------------
export const CRITERION_ACTIONS = {
    READING: {
        type: 'link', label: 'Testga o\'tish', to: '/student/library?tab=kitobxonlik',
        hint: 'O\'qigan asaringiz bo\'yicha testdan o\'ting — ball avtomatik qo\'shiladi.',
    },
    CLUBS: {
        type: 'remind',
        label: 'Tasdiqlashni so\'rash',
        hint: 'Ball klub tadbirlaridagi davomatingizdan hisoblanadi. Davomatni klub koordinatori belgilaydi.',
    },
    ACADEMIC: {
        type: 'none',
        hint: 'GPA ko\'rsatkichi o\'quv bo\'limidan olinadi — amal talab qilinmaydi.',
    },
    DISCIPLINE: {
        type: 'none',
        // Ball TO'PLANMAYDI - to'liq balldan boshlanadi va faqat qayd etilgan
        // buzilish uchun kamayadi. Shuning uchun talabaning qiladigan ishi yo'q.
        hint: 'Qoidalarga rioya etsangiz to\'liq ball saqlanadi — amal talab qilinmaydi.',
    },
    COMPETITIONS: {
        type: 'upload', label: 'Diplom yuklash',
        hint: 'Ko\'rik-tanlov, olimpiada yoki sport musobaqasidagi sovrinli o\'rin hujjatini yuklang.',
    },
    ATTENDANCE: {
        type: 'none',
        // Talabaning qiladigan ishi yo'q, lekin ball QAYERDAN kelishini
        // bilishi kerak - "o'quv bo'limi" degan noaniq javob yetarli emas.
        hint: 'Qoldirilgan dars soatini tyutor kiritadi (HEMIS ulangach avtomatik) — ballni tizim hisoblaydi.',
    },
    EDUCATION: {
        type: 'none',
        hint: 'Ball fakultetingiz va kursingiz uchun o\'tkazilgan "Ma\'rifat darslari"dagi davomatingizdan hisoblanadi; faollik balini mas\'ul qo\'yadi.',
    },
    VOLUNTEERING: {
        type: 'upload', label: 'Hujjat yuklash',
        // Platformadagi ishtirok AVTOMATIK hisoblanadi - talaba uni qayta
        // yuklamasligi kerak. Hujjat faqat TASHQI faoliyat uchun.
        hint: 'Platformadagi tadbirlardagi volontyorligingiz avtomatik hisobga olinadi. Bu yerga faqat tashqi tashkilotdagi volontyorlik hujjatini yuklang.',
    },
    CULTURAL: {
        // Hujjat yuklash EMAS: tashrif joyda qayd etiladi (fotosurat +
        // joylashuv). Shuning uchun bu yerda amal ko'rsatilmaydi - talaba
        // yuqoridagi "Madaniy tashriflar" bo'limidan foydalanadi.
        type: 'none',
        hint: 'Tashrifni joyda turib qayd eting — ball tashriflar soniga emas, muntazamligiga qarab beriladi.',
    },
    SPORTS: {
        // Terma jamoaga ariza alohida bo'limda; sport klubi davomati esa
        // avtomatik hisoblanadi. Hujjat yuklash yo'li ochiq qoladi -
        // universitetdan tashqaridagi a'zolik uchun.
        type: 'upload', label: 'Hujjat yuklash',
        hint: 'Sport klubidagi davomatingiz avtomatik hisoblanadi, terma jamoaga esa yuqoridagi bo\'limdan ariza berasiz. Bu yerga faqat tashqi a\'zolik hujjatini yuklang.',
    },
    OTHER: {
        // Tashabbuskorlik tadbir davomatida belgilanadi - talaba ariza
        // bermaydi. Shuning uchun bu yerda amal talab qilinmaydi.
        type: 'none',
        hint: 'Tadbir yoki musobaqa tashabbuskori bo\'lsangiz, mas\'ul davomat belgilashda buni qayd etadi — ball avtomatik hisoblanadi.',
    },
};

export const getCriterionAction = (criterionKey) =>
    CRITERION_ACTIONS[criterionKey] || { type: 'none', hint: null };

// Hujjat bo'yicha jami — o'zgarmas nazorat qiymati.
export const INDEX_TOTAL_MAX = 100;

// ---------------------------------------------------------------------------
// INTIZOMIY JAZO
//
// Hujjatning izohi: intizomiy jazoga tortilgan talabaning to'plagan balidan
// 15 BALLGACHA olib tashlanishi mumkin. "Gacha" - ya'ni miqdorni mas'ul
// belgilaydi, tizim o'zi hal qilmaydi.
// ---------------------------------------------------------------------------
export const DISCIPLINARY_MAX_DEDUCTION = 15;

// ---------------------------------------------------------------------------
// MAS'ULLAR
//
// Hujjatda takrorlanadigan qoida: baholovchi TYUTOR, lekin 4-kurs va undan
// yuqori kurs talabalari uchun FAKULTET DEKANI O'RINBOSARI. Bu kurs bo'yicha
// avtomatik hal bo'ladi, qo'lda tanlanmaydi.
// ---------------------------------------------------------------------------
export const REVIEWER_ROLES = {
    tutor: { key: 'tutor', label: 'Guruh tyutori' },
    dean_deputy: { key: 'dean_deputy', label: 'Fakultet dekani o\'rinbosari' },
    masul_professor: { key: 'masul_professor', label: 'Mas\'ul professor-o\'qituvchi' },
    kafedra_mudiri: { key: 'kafedra_mudiri', label: 'Kafedra mudiri' },
    iqtidorli_talabalar_boshligi: { key: 'iqtidorli_talabalar_boshligi', label: 'Iqtidorli talabalar bilan ishlash bo\'limi boshlig\'i' },
    yoshlar_boshligi: { key: 'yoshlar_boshligi', label: 'Yoshlar bilan ishlash, ma\'naviyat va ma\'rifat bo\'limi boshlig\'i' },
    sport_klubi: { key: 'sport_klubi', label: 'Sport klubi' },
    commission: { key: 'commission', label: 'Ijtimoiy faollikni aniqlash bo\'yicha komissiya' },
};

// 4-kurs chegarasi hujjatdan.
export const DEAN_DEPUTY_FROM_COURSE = 4;

export const resolveReviewerRole = (course) =>
    (Number(course) >= DEAN_DEPUTY_FROM_COURSE ? REVIEWER_ROLES.dean_deputy : REVIEWER_ROLES.tutor);

// ---------------------------------------------------------------------------
// KOMISSIYA
//
// Hujjat: rektor tomonidan, yoshlar masalalari va ma'naviy-ma'rifiy ishlar
// bo'yicha prorektor RAISLIGIDA, 9 nafardan KAM BO'LMAGAN tarkibda tuziladi.
// ---------------------------------------------------------------------------
export const COMMISSION = {
    minMembers: 9,
    chairRole: 'Yoshlar masalalari va ma\'naviy-ma\'rifiy ishlar bo\'yicha prorektor',
    appointedBy: 'Rektor (direktor)',
};

// ---------------------------------------------------------------------------
// MUDDATLAR
//
// Hujjatdagi uchta sana (oy-kun). Yil o'zgarganda ham qoida o'zgarmaydi,
// shuning uchun yil bu yerda saqlanmaydi.
// ---------------------------------------------------------------------------
export const DEADLINES = {
    upload: { day: '07-10', label: 'Talaba asoslovchi hujjatlarni yuklaydi', actor: 'student' },
    confirm: { day: '07-15', label: 'Mas\'ullar tasdiqlaydi', actor: 'reviewer' },
    evaluate: { day: '07-25', label: 'Komissiya baholaydi', actor: 'commission' },
};

export const DEADLINE_ORDER = ['upload', 'confirm', 'evaluate'];

// ---------------------------------------------------------------------------
// SHIKOYAT (APELLYATSIYA)
//
// Hujjat: natijadan norozi talaba 10 ISH KUNI ichida shikoyat qiladi; OTM
// shikoyatni 10 ISH KUNI ichida ko'rib chiqib qaror qabul qilishi SHART.
// Talaba ko'rib chiqishda ishtirok etish huquqiga ega.
// ---------------------------------------------------------------------------
export const APPEAL = {
    submitWorkingDays: 10,
    reviewWorkingDays: 10,
    studentMayAttend: true,
};

// ---------------------------------------------------------------------------
// YORDAMCHI FUNKSIYALAR
//
// Hisoblashning o'zi emas - faqat hujjatdagi jadvallarni o'qish.
// ---------------------------------------------------------------------------

// GPA -> ball. Oraliq qiymat uchun hujjatda qoida yo'q, shuning uchun eng
// yaqin PASTKI band olinadi (yuqoriga yaxlitlash ballni oshirib yuborardi).
export const gpaToPoints = (gpa) => {
    if (gpa == null || Number.isNaN(Number(gpa))) return null;
    const value = Number(gpa);
    const row = INDEX_CRITERIA.ACADEMIC.gpaTable.find(r => value >= r.gpa);
    return row ? row.points : 0;
};

// O'qilgan kitob soni -> ball.
export const booksToPoints = (count) => {
    if (count == null) return null;
    const n = Number(count) || 0;
    const band = INDEX_CRITERIA.READING.bands.find(b => n >= b.min && n <= b.max);
    if (band) return band.points;
    // 12 tadan ortiq - eng yuqori band.
    return n > 12 ? INDEX_CRITERIA.READING.bands[0].points : 0;
};

// Qoldirilgan soat -> ball (semestr kesimida).
export const missedHoursToPoints = (hours) => {
    if (hours == null) return null;
    const h = Number(hours) || 0;
    const band = INDEX_CRITERIA.ATTENDANCE.bands.find(b => h <= b.maxHours);
    return band ? band.points : 0;
};

// Bosqich va o'rin -> ball. Bosqich kalitlari ACTIVITY_LEVELS bilan bir xil.
export const placementToPoints = (level, place) => {
    const table = INDEX_CRITERIA.COMPETITIONS.placement[level];
    if (!table) return null;
    return table[Number(place)] ?? 0;
};

// Talaba tashqi hujjat yuklaganda tanlaydigan ro'yxat. Yuqoridan pastga -
// kuchli natijadan kuchsizga.
//
// BALL TANLANMAYDI: talaba faqat bosqich va o'rinni ko'rsatadi, ball
// yuqoridagi jadvaldan chiqadi. Ball qiymatlari 186-sonli buyruq bilan
// belgilangan, shuning uchun ular sozlanadigan EMAS - admin ham
// o'zgartira olmasligi kerak.
export const PLACEMENT_LEVEL_ORDER = ['international', 'republic', 'city', 'university'];
export const PLACEMENT_PLACES = [1, 2, 3];

// Bosqich nomi - MANBAI BITTA. Uni ko'rinishlarda qaytadan yozish
// hujjatdagi rasmiy nom bilan ("Ta'lim muassasasi bosqichi") interfeysdagi
// nomni ajratib yuborardi.
export const placementLabel = (level) =>
    INDEX_CRITERIA.COMPETITIONS.placement[level]?.label || level || '';

// Shu bosqich va o'rin uchun beriladigan ball. Bosqich yoki o'rin
// noma'lum bo'lsa `null` - nol emas: "ball yo'q" bilan "hali aniqlanmagan"
// bir narsa emas.
export const placementPoints = (level, place) => {
    const row = INDEX_CRITERIA.COMPETITIONS.placement[level];
    if (!row || !place) return null;
    return row[place] ?? null;
};

// Asoslovchi hujjatning holatlari.
//
// `returned` (qaytarilgan) `rejected` (rad etilgan) dan ATAYLAB ajratilgan:
// birinchisi "xatong bor, tuzat", ikkinchisi "bu qabul qilinmaydi". Ularni
// bitta holatga qo'shish talabaning haqiqiy natijasini soxta hujjat bilan
// bir qatorga qo'yardi.
export const EVIDENCE_STATUS_KEYS = {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    RETURNED: 'returned',
    REJECTED: 'rejected',
};

// Qaytarilgan hujjat tuzatiladi; rad etilganiga apellyatsiya beriladi.
export const evidenceMayResubmit = (status) => status === EVIDENCE_STATUS_KEYS.RETURNED;
export const evidenceMayAppeal = (status) => status === EVIDENCE_STATUS_KEYS.REJECTED;

// --- TASHABBUSKORLIK (11-mezon) ---
//
// 11-mezonning uchala bandi ham TASHKIL ETISH haqida: talaba tadbirga borgani
// uchun emas, uni tashabbus qilgani uchun ball oladi.
//
// Shuning uchun alohida ariza yoki hujjat oqimi qurilmadi: tadbir odatdagidek
// yaratiladi, davomat odatdagidek belgilanadi, va mas'ul o'sha yerda
// tashabbuskorni belgilab qo'yadi. Bir tadbirda tashabbuskor odatda yo'q,
// bo'lsa ham bitta-ikkita.
//
// Kalitlar INDEX_CRITERIA.OTHER.parts bilan bir xil - ball o'sha jadvaldan
// olinadi, bu yerda takrorlanmaydi.
export const INITIATIVE_TYPES = [
    { key: 'partner_event', label: 'Hamkor tashkilot bilan tadbir tashkil etdi' },
    { key: 'xiyobon_event', label: 'Xiyobonda tadbir tashkil etdi' },
    { key: 'active_participation', label: "Tadbir tashkil etishda faol ishtirok etdi" },
];

export const INITIATIVE_KEYS = INITIATIVE_TYPES.map(t => t.key);

export const initiativePoints = (key) =>
    INDEX_CRITERIA.OTHER.parts.find(p => p.key === key)?.points ?? 0;

// --- SPORT (10-mezon) ---
//
// Metodikada "muntazam shug'ullanish" deyilgan, lekin FOIZ ko'rsatilmagan.
// Shuning uchun chegara sozlamada turadi va universitet qarori deb ochiq
// belgilanadi - 2-mezondagi bilan bir xil yondashuv.
export const SPORT_POLICY = {
    // Sport klubi tadbirlarining shuncha foiziga qatnashgan talaba
    // "muntazam shug'ullanadi" hisoblanadi.
    defaultSectionMinPercent: 50,
};

// Talaba tashqi a'zolik hujjatini yuklaganda QAYSI darajani da'vo qilayotganini
// ko'rsatadi - 5-mezondagi bosqich/o'rin da'vosi bilan bir xil mexanizm.
// Ball da'vodan CHIQADI, da'vo bilan berilmaydi.
export const SPORT_CLAIM_LEVELS = ['national_team', 'section', 'competition'];

export const sportClaimPoints = (level) =>
    INDEX_CRITERIA.SPORTS.parts.find(p => p.key === level)?.points ?? null;

// --- MADANIY TASHRIFLAR (9-mezon) ---
//
// Ball tashriflar SONIGA emas, MUNTAZAMLIGIGA qarab beriladi. Shuning uchun
// tizimga sanalar kerak - bir oyda 10 ta tashrif 1 ball, olti oyda oyiga
// bittadan 5 ball.
//
// Talaba hisobot YOZMAYDI: joyga borganda jonli fotosurat oladi va joylashuvi
// qayd etiladi. Ma'lumotnoma shu qaydlardan o'zi shakllanadi.
export const CULTURAL_PLACE_TYPES = {
    theatre: { id: 'theatre', label: 'Teatr' },
    museum: { id: 'museum', label: 'Muzey' },
    park: { id: 'park', label: 'Xiyobon' },
    cinema: { id: 'cinema', label: 'Kino' },
    heritage: { id: 'heritage', label: 'Tarixiy qadamjo' },
};
export const CULTURAL_PLACE_TYPE_ORDER = ['theatre', 'museum', 'park', 'cinema', 'heritage'];

// Joyga yaqinlik chegarasi (metr). Qayddagi koordinata joydan shundan uzoq
// bo'lsa belgilanadi - RAD ETILMAYDI: GPS xatosi shaharda 100 metrga yetadi
// va talabani texnika xatosi uchun jazolash noto'g'ri. Qaror mas'ulda.
export const CULTURAL_PROXIMITY_METERS = 300;

// Ikki koordinata orasidagi masofa (metr) - Gaverzin formulasi.
export const distanceMeters = (lat1, lon1, lat2, lon2) => {
    if ([lat1, lon1, lat2, lon2].some(v => v == null || Number.isNaN(Number(v)))) return null;
    const R = 6371000;
    const rad = (d) => (Number(d) * Math.PI) / 180;
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

// O'quv yilining oylari: sentabrdan iyulgacha (11 oy). Avgust ta'til.
export const ACADEMIC_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7];

// MUNTAZAMLIKNI ANIQLASH.
//
// `visitMonths` - tashrif bo'lgan oylar ro'yxati ("2026-09" ko'rinishida).
// `elapsedMonths` - hisobot davrining O'TGAN oylari; kelmagan oy uchun
// talabani ayblab bo'lmaydi.
//
// Uch band metodikadan. Oraliq holat uchun qoida yo'q - pastroq band olinadi,
// chunki yuqori bandning sharti bajarilmagan.
export const culturalFrequency = (visitMonths, elapsedMonths) => {
    if (!elapsedMonths || elapsedMonths.length === 0) return null;
    const has = new Set(visitMonths);
    const bands = INDEX_CRITERIA.CULTURAL.frequencyBands;

    // Har oyda kamida bir marta.
    if (elapsedMonths.every(m => has.has(m))) {
        return { ...bands.find(b => b.key === 'monthly'), gaps: [] };
    }

    // Har ikki oyda kamida bir marta: ketma-ket ikki oylik har bir oynada
    // kamida bitta tashrif bo'lishi kerak.
    const pairsOk = elapsedMonths.length < 2 || elapsedMonths
        .slice(0, elapsedMonths.length - 1)
        .every((m, i) => has.has(m) || has.has(elapsedMonths[i + 1]));
    const gaps = elapsedMonths.filter(m => !has.has(m));

    if (pairsOk) return { ...bands.find(b => b.key === 'bimonthly'), gaps };
    if (has.size > 0) return { ...bands.find(b => b.key === 'semester'), gaps };
    return { key: 'none', label: 'Tashrif qayd etilmagan', points: 0, gaps };
};

// --- VOLONTYORLIK VA JAMOAT ISHLARI (8-mezon) ---
//
// Metodika beshta narsani sanaydi (ma'naviy-ma'rifiy tadbirlar, umumxalq
// bayramlari, hasharlar, jamoatchilik ishlari, volontyorlik tashabbusi),
// lekin HAR BIRIGA ALOHIDA BALL BERMAYDI - "5 ballgacha" yaxlit baho.
//
// Ya'ni "nechta ishtirok = necha ball" degan savolga hujjatda javob yo'q.
// Shuning uchun shkala SOZLAMADA turadi va universitet qarori deb ochiq
// belgilanadi. Tizim faqat TAKLIF beradi, oxirgi so'z mas'ulda.
// Metodikaning BESHTA yo'nalishi va ularga mos tadbir turlari.
//
// Ma'lumotnoma hujjatning o'z tilida gapirishi kerak: "3 ta ma'naviy-ma'rifiy
// tadbirda, 2 ta umumxalq hasharida" - "3 ta seminar, 2 ta aksiya" emas.
// Shuning uchun tadbir turlari metodikaning bandlariga guruhlanadi.
//
// Beshinchi yo'nalish ("volontyorlik faoliyati, tashkilotchiligi,
// tashabbuskorligi") tadbir TURI emas, ROL bilan aniqlanadi - shuning uchun
// bu jadvalda yo'q, u har guruh ichida alohida sanaladi.
export const VOLUNTEERING_CATEGORIES = [
    {
        key: 'spiritual', label: 'Ma\'naviy-ma\'rifiy tadbirlar',
        eventTypes: ['training', 'seminar', 'lecture', 'meeting', 'conference', 'excursion', 'other'],
    },
    {
        key: 'holiday', label: 'Umumxalq bayramlari',
        eventTypes: ['festival'],
    },
    {
        key: 'hashar', label: 'Umumxalq hasharlari',
        eventTypes: ['hashar'],
    },
    {
        key: 'community', label: 'Jamoatchilik ishlari',
        eventTypes: ['action'],
    },
    {
        key: 'volunteering', label: 'Volontyorlik faoliyati',
        eventTypes: ['volunteering'],
    },
];

export const volunteeringCategoryOf = (eventType) =>
    VOLUNTEERING_CATEGORIES.find(c => c.eventTypes.includes(eventType))
    || VOLUNTEERING_CATEGORIES[0];

export const VOLUNTEERING_SCALE = {
    // Volontyor va tashkilotchi roli og'irroq: ular tadbirni tashkil etgan,
    // shunchaki qatnashmagan.
    activeRolePoints: 2,
    participantPoints: 1,
    // Talaba yuklagan tashqi hujjat (boshqa tashkilotdagi volontyorlik).
    evidencePoints: 2,
    // 8-mezonga qaysi tadbir turlari kiradi. Rol volontyor/tashkilotchi
    // bo'lsa tadbir turidan qat'i nazar hisoblanadi.
    eventTypes: ['volunteering', 'hashar', 'action', 'festival'],
    // "Faol" deb hisoblanadigan rollar.
    activeRoles: ['volunteer', 'organizer'],
};

// --- "MA'RIFAT DARSLARI" (7-mezon) ---
//
// Darslar AUDITORIYA kesimida o'tkaziladi: "Falon fakultet 1-kursi uchun 6 ta
// dars", "shu fakultet 2-kursiga 8 ta". Shuning uchun davomat foizi ham shu
// kesimda hisoblanadi - talabaning fakulteti va kursi uchun o'tkazilgan
// darslar maxraj bo'ladi.
//
// FAOLLIK BALI (4 ball) metodikada UMUMAN ta'riflanmagan: qanday o'lchanishi,
// kim qo'yishi aytilmagan. Shuning uchun u vakolatli shaxs tomonidan
// qo'yiladi, tizim esa faqat TAKLIF beradi - darsda faol deb belgilangan
// ishtiroki nisbatidan. Taklif qoidasi universitet qarori, hujjatdan emas.
export const MARIFAT = {
    // Faollik uchun ajratilgan ball - INDEX_CRITERIA.EDUCATION.activityPoints
    // bilan bir xil bo'lishi shart.
    activityMaxPoints: 4,
    // Faol ishtirok ulushi -> taklif etiladigan ball. Chiziqli: hamma darsda
    // faol bo'lsa 4, yarmida bo'lsa 2. Yaxlitlash 0,5 ballgacha.
    proposedActivityPoints: (activeCount, attendedCount) => {
        if (!attendedCount) return null;
        const share = Math.min(1, activeCount / attendedCount);
        return Math.round(share * 4 * 2) / 2;
    },
};

// Ma'rifat darslari davomati foizi -> ball.
export const educationAttendanceToPoints = (percent) => {
    if (percent == null) return null;
    const p = Number(percent) || 0;
    const band = INDEX_CRITERIA.EDUCATION.attendanceBands.find(b => p >= b.minPercent);
    return band ? band.points : 0;
};

// Mezon bo'yicha ball HAR DOIM o'z shipiga urib turadi - hujjatda har mezonning
// maksimali qat'iy. Bu funksiya butun hisob-kitobning yagona chiqish nuqtasi
// bo'lishi kerak.
export const capCriterionPoints = (criterionKey, points) => {
    const criterion = INDEX_CRITERIA[criterionKey];
    if (!criterion || points == null) return points;
    return Math.max(0, Math.min(Number(points) || 0, criterion.maxPoints));
};
