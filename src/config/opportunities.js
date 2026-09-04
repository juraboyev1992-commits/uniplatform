// "Imkoniyatlar" moduli konfiguratsiyasi.
//
// TAMOYIL: yangi moslik engine yozilmaydi. Mavjud stipendiya me'zonlari katalogi
// (config/scholarships.js) va eligibility engine (utils/scholarshipEligibility.js)
// asos bo'lib qoladi. Bu fayl ularning ustiga ikki narsa qo'shadi:
//   1. Turli manbalarni (grant, stipendiya, musobaqa) bitta shaklga keltirish
//   2. Eshik shartlari - ayniqsa IMKONIYATLAR O'RTASIDAGI cheklovlar
//
// Mavjud jadvallar dublikat qilinmaydi: grantlar `scholarship_grants` da,
// musobaqalar `competitions` da qoladi. Bu yerda faqat ularni o'qish shakli.

// ---------------------------------------------------------------------------
// IMKONIYAT TURLARI
//
// Birinchi bosqichda faqat muddati bor, talab qo'yiladigan turlar. Klublar
// (qiziqish asosidagi moslik) keyingi bosqichga qoldirilgan - u yerda moslik
// butunlay boshqa formula bilan hisoblanadi.
// ---------------------------------------------------------------------------
// IMKONIYAT va IMTIYOZ - ikki xil narsa:
//
//   Imkoniyat (competitive: true)  - siz INTILASIZ. Raqobat bor, ariza bor,
//     muddat bor, natija noaniq. Foiz "qanchalik tayyorsiz" degani.
//
//   Imtiyoz (competitive: false)   - sizga TEGISHLI. Raqobat yo'q; shart
//     bajarilsa beriladi. Bu yerda foiz "yutish ehtimoli" emas, shunchaki
//     "shart bajarildimi" - shuning uchun interfeys ham boshqacha ko'rsatadi.
//
// Farq shunchaki so'zda emas: imtiyozda kvota, muddat va "ariza topshirish"
// tugmasi o'rinsiz.
export const OPPORTUNITY_KINDS = {
    scholarship: {
        id: 'scholarship', label: 'Stipendiya', icon: 'Award',
        tone: 'bg-violet-50 text-violet-700 border-violet-200',
        matching: 'requirements', competitive: true,
    },
    grant: {
        id: 'grant', label: 'Grant', icon: 'Banknote',
        tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        matching: 'requirements', competitive: true,
    },
    // MUKOFOT - pul yoki moddiy rag'bat: bir martalik to'lov, sovg'a,
    // nomli mukofot. Stipendiyadan farqi - u DAVRIY emas, bir marta
    // beriladi va odatda erishilgan natija uchun.
    award: {
        id: 'award', label: 'Mukofot', icon: 'Gift',
        tone: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
        matching: 'requirements', competitive: true,
    },
    benefit: {
        id: 'benefit', label: 'Imtiyoz', icon: 'BadgeCheck',
        tone: 'bg-sky-50 text-sky-700 border-sky-200',
        matching: 'requirements', competitive: false,
    },
    competition: {
        id: 'competition', label: 'Tanlov', icon: 'Trophy',
        tone: 'bg-amber-50 text-amber-700 border-amber-200',
        matching: 'restrictions', competitive: true,
    },
    olympiad: {
        id: 'olympiad', label: 'Olimpiada', icon: 'Medal',
        tone: 'bg-rose-50 text-rose-700 border-rose-200',
        matching: 'restrictions', competitive: true,
    },
    // Keyingi bosqich - qiziqish asosidagi moslik.
    club: {
        id: 'club', label: 'Klub', icon: 'Users',
        tone: 'bg-teal-50 text-teal-700 border-teal-200',
        matching: 'interests', competitive: true,
    },
};

// Imtiyoz uchun matnlar - imkoniyatnikidan boshqacha, chunki mohiyati boshqa.
export const BENEFIT_WORDING = {
    qualified: 'Sizga tegishli',
    notQualified: 'Sizga tegishli emas',
    criteriaTitle: 'Berilish shartlari',
    action: 'Rasmiylashtirish',
    blockedGroup: 'Sizga tegishli emas',
    hint: "Bu imtiyoz uchun raqobat yo'q - shartlarga javob bersangiz beriladi.",
};

export const OPPORTUNITY_WORDING = {
    criteriaTitle: "Shartlar bo'yicha",
    action: 'Ariza topshirish',
    blockedGroup: 'Hozircha mos emas',
};

export const isCompetitive = (kindId) => getKind(kindId).competitive !== false;

export const OPPORTUNITY_KIND_ORDER = [
    'scholarship', 'grant', 'award', 'benefit', 'competition', 'olympiad',
];

// TALABA UCHUN ASOSIY TURLAR - imkoniyatlar ro'yxatidagi filtrlar.
//
// Bular ro'yxat BO'SH bo'lsa ham ko'rsatiladi (soni bilan): talaba
// "stipendiya bormi" degan savolga javob topishi kerak, javob "hozircha
// yo'q" bo'lsa ham. Ilgari faqat mavjud turlar chiqardi va talaba
// stipendiya bo'limi umuman yo'qdek ko'rardi.
export const PRIMARY_OPPORTUNITY_KINDS = ['scholarship', 'grant', 'award'];

export const getKind = (id) => OPPORTUNITY_KINDS[id] || OPPORTUNITY_KINDS.grant;

// ---------------------------------------------------------------------------
// GURUHLAR
//
// "Bir vaqtda faqat bitta" qoidasi shu guruhlarga tayanadi. Guruhsiz imkoniyat
// uchun bu qoida umuman qo'llanmaydi (aks holda hamma narsa bir-birini istisno
// qilib qo'yardi).
// ---------------------------------------------------------------------------
export const OPPORTUNITY_GROUPS = {
    state: { id: 'state', label: 'Davlat stipendiyalari' },
    ministry: { id: 'ministry', label: 'Vazirlik stipendiyalari' },
    international: { id: 'international', label: 'Xalqaro grantlar' },
    internal: { id: 'internal', label: 'Universitet grant va stipendiyalari' },
    sponsor: { id: 'sponsor', label: 'Homiy grantlari' },
};

export const OPPORTUNITY_GROUP_ORDER = ['state', 'ministry', 'international', 'internal', 'sponsor'];

export const getGroupLabel = (id) => OPPORTUNITY_GROUPS[id]?.label || id;

// ---------------------------------------------------------------------------
// ESHIK SHARTLARI - IMKONIYATLAR O'RTASIDAGI CHEKLOVLAR
//
// Bularning hammasi ikkilik: bajarilmasa imkoniyat tavsiya qilinmaydi va foiz
// UMUMAN hisoblanmaydi. Sababi: 4 ta talabdan 3 tasi bajarilgani "75%" degani
// emas, agar bajarilmagani eshik bo'lsa - talaba ariza bera olmaydi.
//
// Tekshiruv uchun yangi ma'lumot kerak emas: kim nimani yutgani
// scholarship_applications (status='approved') va talent_targets (status='won')
// da saqlanadi.
// ---------------------------------------------------------------------------
export const CONSTRAINT_TYPES = {
    conflictsWith: {
        id: 'conflictsWith',
        label: 'Zid keladi',
        hint: 'Sanab o\'tilgan imkoniyatlarni olgan talaba bunga ariza bera olmaydi',
        example: 'Adliya vazirligi stipendiyasi ↔ universitet granti va stipendiyasi',
        // IKKI TOMONLAMA: admin bir marta kiritadi, tizim ikkala tomonda qo'llaydi.
        // Aks holda bir tomonini kiritib ikkinchisini unutib qo'yish mumkin.
        symmetric: true,
    },
    exclusiveGroup: {
        id: 'exclusiveGroup',
        label: 'Bir vaqtda faqat bitta',
        hint: 'Belgilangan guruhdan bir vaqtda faqat bitta imkoniyat olinadi',
        example: '"Davlat stipendiyalari" guruhidan bittasi',
        symmetric: true,
    },
    onceOnly: {
        id: 'onceOnly',
        label: 'Bir marta',
        hint: 'Ilgari olgan talaba qayta ariza bera olmaydi',
        example: 'Prezident stipendiyasini olgan qayta bermaydi',
        symmetric: false,
    },
    cooldownYears: {
        id: 'cooldownYears',
        label: 'Kutish muddati',
        hint: 'Olgandan keyin belgilangan yil davomida qayta bo\'lmaydi',
        example: '2 yildan keyin qayta ariza berish mumkin',
        symmetric: false,
    },
    requiresPrior: {
        id: 'requiresPrior',
        label: 'Oldindan talab',
        hint: 'Sanab o\'tilganlarning birortasini olmagan talaba ariza bera olmaydi',
        example: 'Xalqaro dasturga faqat respublika tanlovi g\'olibi',
        symmetric: false,
        // Bu cheklov emas, OCHUVCHI shart - teskari yo'nalishda ishlaydi.
        inverse: true,
    },
    yearlyLimit: {
        id: 'yearlyLimit',
        label: 'Yillik chegara',
        hint: 'Bir talaba bir yilda shundan ortiq ololmaydi',
        example: 'Yiliga bitta grant',
        symmetric: false,
    },
};

export const CONSTRAINT_ORDER = [
    'conflictsWith', 'exclusiveGroup', 'onceOnly', 'cooldownYears', 'requiresPrior', 'yearlyLimit',
];

export const defaultConstraints = () => ({
    conflictsWith: [],        // grant id lari
    conflictsWithGroups: [],  // guruh id lari - har birini sanab chiqish shart emas
    exclusiveGroup: null,
    onceOnly: false,
    cooldownYears: 0,
    requiresPrior: [],
    yearlyLimit: 0,
});

// ---------------------------------------------------------------------------
// ME'ZONNING VAQT XATTI-HARAKATI
//
// Hamma me'zon bir xil emas. GPA "uch oylik mehnat" emas - u faqat semestr
// yakunida o'zgaradi. Shuning uchun uch tur:
//
//   continuous - istalgan vaqtda oshadi, muddat kerak emas
//   periodic   - faqat belgilangan sanada yangilanadi, tizim kalendardan hisoblaydi
//   project    - noaniq lekin chegaralangan muddat, taxminiy qiymat beriladi
//
// Standart me'zonlar uchun bu shu yerda belgilangan - admin hech narsa
// kiritmaydi. Faqat o'zi qo'shgan me'zon uchun va u ham ixtiyoriy.
// ---------------------------------------------------------------------------
export const CRITERION_TIMING = {
    social_score: { timing: 'continuous' },
    diploma_count: { timing: 'project', estimateMonths: 4 },
    first_place_count: { timing: 'project', estimateMonths: 6 },
    prize_place_count: { timing: 'project', estimateMonths: 5 },
    certificate_count: { timing: 'continuous' },
    thanks_count: { timing: 'continuous' },
    activity_count: { timing: 'continuous' },
    club_count: { timing: 'continuous' },
    course: { timing: 'periodic', period: 'year' },
    gpa: { timing: 'periodic', period: 'semester' },
    language_score: { timing: 'project', estimateMonths: 6 },
    articles: { timing: 'project', estimateMonths: 4 },
    project: { timing: 'project', estimateMonths: 6 },
};

export const getCriterionTiming = (key) =>
    CRITERION_TIMING[key] || { timing: 'project', estimateMonths: null };

// O'quv kalendari - davriy me'zonlar qachon yangilanishini hisoblash uchun.
// Sozlamalarga chiqarilishi mumkin; hozircha standart qiymatlar.
export const ACADEMIC_CALENDAR = {
    // Semestr yakunlari (oy-kun). GPA shu sanalarda yangilanadi.
    semesterEnds: ['01-20', '06-25'],
    // O'quv yili boshlanishi - kurs shunda oshadi.
    yearStart: '09-01',
};

// Davriy me'zon keyingi marta qachon yangilanadi.
export const nextPeriodicUpdate = (period, from = new Date()) => {
    const year = from.getFullYear();
    const candidates = [];

    if (period === 'semester') {
        ACADEMIC_CALENDAR.semesterEnds.forEach(md => {
            candidates.push(new Date(`${year}-${md}T23:59:59`));
            candidates.push(new Date(`${year + 1}-${md}T23:59:59`));
        });
    } else {
        candidates.push(new Date(`${year}-${ACADEMIC_CALENDAR.yearStart}T00:00:00`));
        candidates.push(new Date(`${year + 1}-${ACADEMIC_CALENDAR.yearStart}T00:00:00`));
    }

    const future = candidates.filter(d => d > from).sort((a, b) => a - b);
    return future[0] || null;
};

// ---------------------------------------------------------------------------
// ERISHISH QIYINLIGI
// ---------------------------------------------------------------------------
export const ACHIEVABILITY = {
    reachable: { id: 'reachable', label: 'Ulgurasiz', tone: 'text-emerald-700', variant: 'success' },
    tight: { id: 'tight', label: 'Qiyin', tone: 'text-amber-700', variant: 'warning' },
    unreachable: { id: 'unreachable', label: 'Ulgurmaysiz', tone: 'text-red-600', variant: 'danger' },
    // Taxmin qilish uchun asos yo'q. Yolg'on baho berishdan ko'ra jim turgani
    // yaxshi - platformada GPA yo'q bo'lganda ham shunday `null` qaytadi.
    unknown: { id: 'unknown', label: null, tone: 'text-gray-400', variant: 'secondary' },
};

// ---------------------------------------------------------------------------
// TAVSIYA HOLATLARI - talaba ro'yxatda nima ko'radi
// ---------------------------------------------------------------------------
export const MATCH_STATE = {
    eligible: { id: 'eligible', label: 'Mos', showsPercent: true },
    // Eshik shartidan o'tmadi: foiz KO'RSATILMAYDI, sabab yoziladi.
    blocked: { id: 'blocked', label: 'Hozircha mos emas', showsPercent: false },
    applied: { id: 'applied', label: 'Ariza berilgan', showsPercent: true },
    won: { id: 'won', label: 'Olingan', showsPercent: false },
};

// 100% "yutasiz" degani emas - interfeys buni ochiq yozadi.
export const FULL_MATCH_DISCLAIMER =
    "Barcha shartlarga javob berganingiz g'oliblikni kafolatlamaydi - "
    + 'yakuniy qarorni komissiya qabul qiladi.';

// Muddat necha kun qolganda "shoshilinch" deb belgilanadi.
export const URGENT_DAYS = 14;
