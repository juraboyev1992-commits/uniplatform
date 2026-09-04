// Constants for UniPlatform

// User Roles
export const USER_ROLES = {
    STUDENT: 'TALABA',
    ADMIN: 'ADMINISTRATOR',
    MANAGEMENT: 'RAHBARIYAT',
    // Ijtimoiy faollik metodikasi mas'ul sifatida ATAYLAB tyutorni ko'rsatadi
    // (dars davomati, madaniy tashriflar, asoslovchi hujjatlar). Ilgari bunday
    // rol yo'q edi va o'sha ishlarning hammasi administrator sozlamalarida
    // turardi - ya'ni tyutor o'z ishini qila olmasdi yoki unga butun
    // platformani ochib berish kerak bo'lardi.
    //
    // VAKOLAT ROLGA EMAS, BIRIKTIRUVGA bog'liq: tyutor faqat O'ZIGA
    // biriktirilgan talabalarni ko'radi (`talent_assignments`, role: 'tutor').
    TUTOR: 'TYUTOR'
};

// Social Activity Criteria (11 mezonlar)
export const SOCIAL_ACTIVITY_CRITERIA = {
    READING: {
        id: 1,
        name: 'Kitobxonlik madaniyati',
        maxPoints: 20,
        description: '100 ta tavsiya etilgan badiiy kitob'
    },
    CLUBS: {
        id: 2,
        name: '5 muhim tashabbus to\'garaklari',
        maxPoints: 20,
        description: 'Madaniyat, sport, IT, kitobxonlik, bandlik'
    },
    ACADEMIC: {
        id: 3,
        name: 'Akademik o\'zlashtirish',
        maxPoints: 10,
        description: 'GPA orqali avtomatik hisoblash'
    },
    DISCIPLINE: {
        id: 4,
        name: 'Ichki tartib va odob-axloq',
        maxPoints: 5,
        description: 'Intizom, dresskod, xulq-atvor'
    },
    COMPETITIONS: {
        id: 5,
        name: 'Ko\'rik-tanlov va olimpiadalar',
        maxPoints: 10,
        description: 'Xalqaro / Respublika / Viloyat'
    },
    ATTENDANCE: {
        id: 6,
        name: 'Davomat',
        maxPoints: 5,
        description: 'Avtomatik hisoblash'
    },
    EDUCATION: {
        id: 7,
        name: 'Ma\'rifat darslari',
        maxPoints: 10,
        description: 'Davomat + faollik'
    },
    VOLUNTEERING: {
        id: 8,
        name: 'Volontyorlik',
        maxPoints: 5,
        description: 'Hujjat bilan tasdiqlash'
    },
    CULTURAL: {
        id: 9,
        name: 'Madaniy tashriflar',
        maxPoints: 5,
        description: 'Teatr, muzey, kino, xiyobon'
    },
    SPORTS: {
        id: 10,
        name: 'Sport va sog\'lom turmush',
        maxPoints: 5,
        description: 'Sport faoliyati hujjat bilan'
    },
    OTHER: {
        id: 11,
        name: 'Boshqa ijtimoiy faollik',
        maxPoints: 5,
        description: 'Ijtimoiy tarmoqlar, tashabbuslar'
    }
};

// Ijtimoiy faollik sub-kategoriyalarining "Avtomatik" hisoblash usuli tanlaganda ko'rsatiladigan manba
// ro'yxati — erkin havola/matn EMAS, faqat platformada haqiqatan mavjud (yoki ochiq tan olingan holda
// hali mavjud bo'lmagan) ma'lumot manbalari, chunki tekshirib bo'lmaydigan erkin havola ishonchsiz bo'lardi.
// `isReal: false` — manba nomi ko'rsatiladi, lekin uni tanlash hozircha faqat sozlamani saqlaydi, real
// hisoblash ulanmagan (`class_attendance`: platformada bunday tizim hali yo'q; `club_membership`: real
// ma'lumot bor, lekin klublarning ko'pi (Munozara/Zakovat/Moot Court/Vokal/Raqs kabi musobaqa-markazli
// klublar) talabalar bilan asosan MUSOBAQAGA RO'YXATDAN O'TISH orqali ishlaydi, `memberships` jadvali
// ular uchun deyarli to'ldirilmagan/ma'nosiz — shuning uchun xom "necha klubga a'zo" hisobi noto'g'ri
// signal berardi. Formula keyinroq registratsiya+Davomatni ham hisobga oladigan ko'proq universal
// signalga almashtirilgach qayta ko'rib chiqiladi). `club_attendance`/`competition_results` — real ishlaydi.
export const SOCIAL_AUTOMATIC_SOURCES = [
    { key: 'club_attendance', label: 'Klub davomati', description: "Klub/jamoa tadbir va musobaqalaridagi real Davomat yozuvlaridan hisoblanadi.", isReal: true },
    { key: 'competition_results', label: 'Musobaqa natijalari', description: "Real musobaqa reytingi/o'rinlaridan hisoblanadi (1-o'rin=5, 2-o'rin=3, 3-o'rin=2, ishtirok=1 ball).", isReal: true },
    { key: 'club_membership', label: 'Klub a\'zoligi', description: "Real klub a'zolik yozuvlaridan hisoblanadi — hozircha ishonchli emas, chunki ko'pgina klublarda a'zolik emas, musobaqaga ro'yxatdan o'tish asosiy ishtirok shakli.", isReal: false },
    { key: 'class_attendance', label: 'Darslar davomati', description: "Talabaning dars davomatidan hisoblanadi — platformada bu tizim hali mavjud emas, hisoblash ulanmagan.", isReal: false }
];

// Ijtimoiy faollik sub-kategoriyasi qo'lda ko'rib chiqiladigan bo'lsa, kim tasdiqlaydi.
export const SOCIAL_REVIEWER_ROLES = [
    { key: 'tutor', label: 'Tyutor' },
    { key: 'dean', label: 'Dekan' },
    { key: 'admin', label: 'Administrator' }
];

// Activity Status Levels
export const ACTIVITY_STATUS = {
    EXCELLENT: { min: 90, max: 100, label: 'Alo', color: 'green' },
    GOOD: { min: 70, max: 89, label: 'Yaxshi', color: 'blue' },
    AVERAGE: { min: 50, max: 69, label: 'O\'rtacha', color: 'yellow' },
    POOR: { min: 0, max: 49, label: 'Past', color: 'red' }
};

// Event Types
export const EVENT_TYPES = {
    COMPETITION: 'Tanlov',
    SEMINAR: 'Seminar',
    EXAM: 'Imtihon',
    CULTURAL: 'Madaniy tadbir',
    SPORTS: 'Sport tadbirи',
    CONFERENCE: 'Konferensiya'
};

// Competition Levels
export const COMPETITION_LEVELS = {
    INTERNATIONAL: 'Xalqaro',
    NATIONAL: 'Respublika',
    REGIONAL: 'Viloyat',
    UNIVERSITY: 'Universitet'
};

// File Upload Settings
export const FILE_UPLOAD = {
    MAX_SIZE_MB: 5,
    ALLOWED_TYPES: ['application/pdf', 'image/jpeg', 'image/png'],
    ALLOWED_EXTENSIONS: ['.pdf', '.jpg', '.jpeg', '.png']
};

// Pagination
export const PAGINATION = {
    DEFAULT_PAGE_SIZE: 10,
    PAGE_SIZE_OPTIONS: [10, 20, 50, 100]
};

// Date Formats
export const DATE_FORMATS = {
    DISPLAY: 'DD-MMM-YYYY',
    API: 'YYYY-MM-DD',
    TIME: 'HH:mm'
};

// ---------------------------------------------------------------------------
// TA'LIM TILI (potok)
//
// Universitetda o'zbek va rus potoklari alohida o'qiydi. Bu kitobxonlik
// ro'yxatiga va testlarga bevosita ta'sir qiladi: rus potokdagi talabaga
// o'zbek tilidagi asar ro'yxatini ko'rsatish noto'g'ri bo'lardi.
//
// Talabaning tili pasportdagi "Ta'lim tili" maydonidan olinadi. Belgilanmagan
// bo'lsa HAMMASI ko'rsatiladi - talabani ro'yxatsiz qoldirgandan ko'ra ortiqcha
// ko'rsatgan yaxshiroq.
// ---------------------------------------------------------------------------
export const TEACHING_LANGUAGES = {
    uz: { key: 'uz', label: "O'zbek", short: "O'zbek potok" },
    ru: { key: 'ru', label: 'Rus', short: 'Rus potok' },
};

export const TEACHING_LANGUAGE_ORDER = ['uz', 'ru'];

// Pasportdagi erkin matnni ("O'zbek", "узбекский", "rus") kalitga o'girish.
export const normalizeTeachingLanguage = (value) => {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return null;
    if (v.startsWith('rus') || v.startsWith('рус')) return 'ru';
    if (v.startsWith("o'z") || v.startsWith('uz') || v.startsWith('уз') || v.startsWith('ўз')) return 'uz';
    return null;
};

// Uzbek Months
export const UZ_MONTHS = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
];

// Uzbek Days
export const UZ_DAYS = [
    'Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba',
    'Payshanba', 'Juma', 'Shanba'
];

// API Endpoints (for future backend integration)
export const API_ENDPOINTS = {
    AUTH: {
        LOGIN: '/api/auth/login',
        LOGOUT: '/api/auth/logout',
        REFRESH: '/api/auth/refresh'
    },
    STUDENTS: {
        LIST: '/api/students',
        DETAIL: '/api/students/:id',
        ACTIVITY: '/api/students/:id/activity'
    },
    TESTS: {
        LIST: '/api/tests',
        CREATE: '/api/tests',
        DETAIL: '/api/tests/:id',
        SUBMIT: '/api/tests/:id/submit'
    },
    LIBRARY: {
        BOOKS: '/api/library/books',
        PROGRESS: '/api/library/progress',
        TESTS: '/api/library/tests'
    },
    EVENTS: {
        LIST: '/api/events',
        CREATE: '/api/events',
        REGISTER: '/api/events/:id/register'
    },
    SOCIAL_ACTIVITY: {
        INDEX: '/api/social-activity',
        SUBMIT: '/api/social-activity/submit',
        VERIFY: '/api/social-activity/verify'
    }
};

// Tournament Creation Wizard — there is no per-club/per-user region field anywhere in this app yet,
// so this is a fixed platform-level value shown read-only in Step 1, not data derived from anything.
export const DEFAULT_REGION = 'Toshkent shahri';

// Tournament Creation Wizard — Step 4 attachment constraints (kept separate from FILE_UPLOAD above,
// which is scoped to a different, smaller-limit flow).
export const TOURNAMENT_FILE_UPLOAD = {
    MAX_SIZE_MB: 30,
    ALLOWED_EXTENSIONS: ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png']
};

// Color Palette
export const COLORS = {
    PRIMARY: '#4F46E5',
    SUCCESS: '#10B981',
    WARNING: '#F59E0B',
    DANGER: '#EF4444',
    INFO: '#3B82F6'
};
