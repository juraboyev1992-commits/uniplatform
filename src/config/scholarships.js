// Stipendiya moduli konfiguratsiyasi.
//
// Avval bularning hammasi ScholarshipManagement.jsx ichidagi `useState` da yashagan
// (ya'ni sahifa yangilanishi bilan yo'qolardi) yoki umuman mavjud emas edi. Bu yerga
// chiqarilishi tufayli admin paneli ham, talaba moduli ham, moslikni hisoblovchi
// `scholarshipEligibility.js` ham AYNAN bir xil katalogdan foydalanadi.

// ---------------------------------------------------------------------------
// Grant holati
// ---------------------------------------------------------------------------
export const GRANT_STATUS = {
    draft: { label: 'Qoralama', tone: 'bg-gray-100 text-gray-600 border-gray-200', variant: 'secondary' },
    active: { label: 'Faol', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', variant: 'success' },
    closed: { label: 'Yopilgan', tone: 'bg-amber-50 text-amber-700 border-amber-200', variant: 'warning' },
    archived: { label: 'Arxivlangan', tone: 'bg-gray-100 text-gray-400 border-gray-200', variant: 'secondary' },
};

export const GRANT_STATUS_ORDER = ['draft', 'active', 'closed', 'archived'];

// Eski localStorage['uni_grants'] o'zbekcha satrlarni ishlatardi — migratsiyada
// va eski yozuvlarni o'qishda shular tarjima qilinadi.
const LEGACY_GRANT_STATUS = { 'Faol': 'active', 'Yopilgan': 'closed', 'Qoralama': 'draft' };
export const normalizeGrantStatus = (raw) =>
    (GRANT_STATUS[raw] ? raw : LEGACY_GRANT_STATUS[raw]) || 'draft';

// ---------------------------------------------------------------------------
// Ariza holati — endi to'liq bosqichli oqim, avvalgi 3 ta o'zbekcha satr o'rniga.
// `terminal` — qaror chiqarilgan, boshqa o'zgarmaydi.
// `live` — grant kvotasini band qiladi / talaba qayta ariza bera olmaydi.
// ---------------------------------------------------------------------------
export const APPLICATION_STATUS = {
    draft: { label: 'Qoralama', variant: 'secondary', live: true, terminal: false, step: 0 },
    submitted: { label: 'Yuborilgan', variant: 'warning', live: true, terminal: false, step: 1 },
    doc_check: { label: 'Hujjat tekshiruvi', variant: 'warning', live: true, terminal: false, step: 2 },
    evaluation: { label: 'Baholanmoqda', variant: 'primary', live: true, terminal: false, step: 3 },
    // Hujjat ko'rigidan tuzatishga qaytarilgan. Chetlatilgan EMAS: talaba tuzatib
    // qayta yuboradi va zanjirdagi o'z o'rnida qoladi.
    returned: { label: 'Tuzatishga qaytarilgan', variant: 'danger', live: true, terminal: false, step: 2 },
    committee: { label: 'Komissiyada', variant: 'primary', live: true, terminal: false, step: 4 },
    approved: { label: 'Tasdiqlangan', variant: 'success', live: true, terminal: true, step: 5 },
    rejected: { label: 'Rad etilgan', variant: 'danger', live: false, terminal: true, step: 5 },
    // Fakultet bosqichida baholandi, lekin Top N ga kirmadi. "Rad etilgan" emas -
    // hujjatlari joyida, shunchaki kvota yetmadi; statistika va talabaga ko'rsatishda
    // bu farq muhim.
    not_advanced: { label: "Kvotaga kirmadi", variant: 'secondary', live: false, terminal: true, step: 5 },
    withdrawn: { label: 'Qaytarib olingan', variant: 'secondary', live: false, terminal: true, step: 5 },
};

// Bir bosqichli (oddiy) grant uchun oqim - avvalgidek.
export const APPLICATION_FLOW = ['submitted', 'doc_check', 'committee', 'approved'];

// ---------------------------------------------------------------------------
// IKKI BOSQICHLI TANLOV
//
// Fakultet bosqichi: dekanat hujjatni tekshiradi va baholaydi. Admin bu yerda
//   BAHOLASHGA ARALASHMAYDI - faqat kuzatadi (kim baholayapti, qanday ball,
//   qaysi reyting). Bu qoida db qatlamida ham majburlanadi, nafaqat interfeysda.
// Universitet bosqichi: fakultetlardan avtomatik o'tgan Top N nomzodlar,
//   yakuniy qarorni admin/komissiya chiqaradi.
// ---------------------------------------------------------------------------
export const STAGES = {
    faculty: {
        id: 'faculty', label: 'Fakultet bosqichi', short: 'Fakultet',
        tone: 'bg-sky-50 text-sky-700 border-sky-200',
        flow: ['submitted', 'doc_check', 'evaluation'],
    },
    university: {
        id: 'university', label: 'Universitet bosqichi', short: 'Universitet',
        tone: 'bg-violet-50 text-violet-700 border-violet-200',
        flow: ['committee', 'approved'],
    },
};

export const STAGE_ORDER = ['faculty', 'university'];

export const getStage = (id) => STAGES[id] || STAGES.faculty;

export const getStageFlow = (grant, stage) => {
    if (!grant?.twoStage) return APPLICATION_FLOW;
    return getStage(stage).flow;
};

// ---------------------------------------------------------------------------
// BOSQICHLAR ZANJIRI (pipeline)
//
// Har bir grant o'z bosqichlar ketma-ketligini quradi. Ariza topshirish har doim
// zanjirdan OLDIN keladi va sozlanmaydi - u boshlanish nuqtasi.
//
// Turlar:
//   document_review     - hujjat ko'rigi. Ball qo'yilmaydi; nomzod o'tkaziladi,
//                         tuzatishga qaytariladi yoki chetlatiladi.
//   faculty_commission  - fakultet komissiyasi. Reyting HAR FAKULTET ICHIDA
//                         alohida quriladi, kvota ham har fakultetga alohida.
//   commission          - umumiy (universitet) komissiyasi. Bitta umumiy reyting.
//   test                - test bosqichi. Ball testdan keladi, Top N o'tadi.
//   interview           - suhbat. Komissiya me'zonlar bo'yicha ball qo'yadi.
//   final               - yakun. Bu yerda g'olib va sovrindorlar belgilanadi.
// ---------------------------------------------------------------------------
export const STAGE_TYPES = {
    document_review: {
        id: 'document_review', label: "Hujjatlarni ko'rib chiqish", short: 'Hujjat ko\'rigi',
        icon: 'FileCheck', tone: 'bg-amber-50 text-amber-700 border-amber-200',
        scored: false, canReturn: true, perFaculty: false,
        hint: 'Mas\'ul hujjatlarni tekshiradi: o\'tkazadi, tuzatishga qaytaradi yoki chetlatadi',
    },
    faculty_commission: {
        id: 'faculty_commission', label: 'Fakultet komissiyasi', short: 'Fakultet',
        icon: 'Building2', tone: 'bg-sky-50 text-sky-700 border-sky-200',
        scored: true, canReturn: false, perFaculty: true,
        hint: 'Har fakultet o\'z nomzodlarini baholaydi, har fakultetdan Top N o\'tadi',
    },
    commission: {
        id: 'commission', label: 'Universitet komissiyasi', short: 'Komissiya',
        icon: 'Users', tone: 'bg-violet-50 text-violet-700 border-violet-200',
        scored: true, canReturn: false, perFaculty: false,
        hint: 'Umumiy komissiya baholaydi, umumiy reytingdan Top N o\'tadi',
    },
    test: {
        id: 'test', label: 'Test bosqichi', short: 'Test',
        icon: 'ClipboardList', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        scored: true, canReturn: false, perFaculty: false, external: true,
        hint: 'Test natijasi bo\'yicha saralanadi, Top N o\'tadi',
    },
    interview: {
        id: 'interview', label: 'Suhbat bosqichi', short: 'Suhbat',
        icon: 'MessageSquare', tone: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        scored: true, canReturn: false, perFaculty: false,
        hint: 'Komissiya suhbat davomida me\'zonlar bo\'yicha ball qo\'yadi, Top N o\'tadi',
    },
    final: {
        id: 'final', label: 'Yakuniy bosqich', short: 'Yakun',
        icon: 'Trophy', tone: 'bg-rose-50 text-rose-700 border-rose-200',
        scored: false, canReturn: false, perFaculty: false, decidesWinners: true,
        hint: 'G\'olib va sovrindorlar shu yerda tasdiqlanadi',
    },
};

export const STAGE_TYPE_ORDER = [
    'document_review', 'faculty_commission', 'test', 'interview', 'commission', 'final',
];

export const getStageType = (type) => STAGE_TYPES[type] || STAGE_TYPES.commission;

// Bosqich qo'shilganda beriladigan boshlang'ich sozlama.
export const defaultStageConfig = (type) => {
    const base = {
        id: 'stg_' + Math.random().toString(36).slice(2, 9),
        type,
        label: STAGE_TYPES[type]?.label || type,
    };
    switch (type) {
        case 'document_review':
            return { ...base, reviewerScope: 'faculty', allowReturn: true };
        case 'faculty_commission':
            return {
                ...base, quotaPerFaculty: 3, minEvaluations: 1,
                criteria: DEFAULT_EVALUATION_CRITERIA.map(c => ({ ...c })),
            };
        case 'commission':
            return {
                ...base, quota: 10, minEvaluations: 1,
                criteria: DEFAULT_EVALUATION_CRITERIA.map(c => ({ ...c })),
            };
        case 'test':
            return { ...base, quota: 20, maxScore: 100, passScore: 60, testId: '', testName: '' };
        case 'interview':
            return {
                ...base, quota: 5, minEvaluations: 1, passScore: 0,
                criteria: [
                    { key: 'knowledge', label: 'Soha bo\'yicha bilim', max: 40 },
                    { key: 'communication', label: 'Muloqot va o\'zini tutishi', max: 30 },
                    { key: 'motivation', label: 'Motivatsiya va rejalari', max: 30 },
                ],
            };
        case 'final':
            return { ...base, winners: 1, prizePlaces: 3 };
        default:
            return base;
    }
};

// Tayyor andozalar - noldan qurish shart bo'lmasin.
export const PIPELINE_TEMPLATES = [
    {
        id: 'faculty_university',
        label: 'Fakultet → Universitet',
        hint: 'Klassik ikki bosqich: har ikkisida komissiya baholaydi',
        build: () => [
            { ...defaultStageConfig('faculty_commission'), label: 'Fakultet bosqichi' },
            { ...defaultStageConfig('commission'), label: 'Universitet bosqichi' },
            { ...defaultStageConfig('final') },
        ],
    },
    {
        id: 'doc_test_interview',
        label: 'Hujjat → Test → Suhbat',
        hint: 'Fakultet bosqichisiz: hujjat ko\'rigi, test, suhbat va yakun',
        build: () => [
            { ...defaultStageConfig('document_review') },
            { ...defaultStageConfig('test') },
            { ...defaultStageConfig('interview') },
            { ...defaultStageConfig('final') },
        ],
    },
    {
        id: 'doc_commission',
        label: 'Hujjat → Komissiya',
        hint: 'Eng sodda variant',
        build: () => [
            { ...defaultStageConfig('document_review') },
            { ...defaultStageConfig('commission') },
            { ...defaultStageConfig('final') },
        ],
    },
    {
        id: 'full',
        label: 'To\'liq zanjir',
        hint: 'Hujjat → fakultet → test → suhbat → universitet → yakun',
        build: () => [
            { ...defaultStageConfig('document_review') },
            { ...defaultStageConfig('faculty_commission') },
            { ...defaultStageConfig('test') },
            { ...defaultStageConfig('interview') },
            { ...defaultStageConfig('commission') },
            { ...defaultStageConfig('final') },
        ],
    },
];

// ---------------------------------------------------------------------------
// Grantning amaldagi zanjiri.
//
// Eski grantlar buzilmasin: `pipeline` maydoni bo'lmasa, avvalgi `twoStage`
// sozlamalaridan zanjir YASALADI. Ya'ni bu fayl kiritilgunga qadar yaratilgan
// har bir grant avvalgidek ishlashda davom etadi, hech qanday migratsiyasiz.
// ---------------------------------------------------------------------------
export const resolvePipeline = (grant) => {
    if (grant?.pipeline?.length) return grant.pipeline;

    if (grant?.twoStage) {
        return [
            {
                id: 'faculty', type: 'faculty_commission', label: 'Fakultet bosqichi',
                quotaPerFaculty: grant.facultyQuota,
                minEvaluations: grant.minEvaluations,
                criteria: getEvaluationCriteria(grant),
            },
            { id: 'university', type: 'commission', label: 'Universitet bosqichi', quota: grant.quota, minEvaluations: 1, criteria: getEvaluationCriteria(grant) },
            { id: 'final', type: 'final', label: 'Yakuniy bosqich', winners: grant.quota || 1, prizePlaces: 3 },
        ];
    }

    return [
        { id: 'review', type: 'commission', label: 'Ko\'rib chiqish', quota: grant?.quota, minEvaluations: 1, criteria: DEFAULT_EVALUATION_CRITERIA },
        { id: 'final', type: 'final', label: 'Yakuniy qaror', winners: grant?.quota || 1, prizePlaces: 3 },
    ];
};

export const getPipelineStage = (grant, index) => resolvePipeline(grant)[index] || null;

export const stageQuota = (stage) =>
    Number(stage?.type === 'faculty_commission' ? stage?.quotaPerFaculty : stage?.quota) || 0;

// Bosqich ichidagi ariza holati. `status` maydoni shu qiymatlardan birini oladi.
export const STAGE_OUTCOME = {
    pending: { label: 'Kutilmoqda', variant: 'secondary' },
    in_review: { label: "Ko'rib chiqilmoqda", variant: 'warning' },
    returned: { label: 'Tuzatishga qaytarilgan', variant: 'danger' },
    passed: { label: "O'tdi", variant: 'success' },
    eliminated: { label: 'Chetlatildi', variant: 'secondary' },
};

// Fakultet bosqichida Top N ni nima bo'yicha saralash kerak.
export const ADVANCE_METHODS = {
    evaluation: {
        id: 'evaluation', label: 'Dekanat bahosi bo\'yicha',
        hint: 'Faqat baholovchilar qo\'ygan ballarning o\'rtachasi',
    },
    auto: {
        id: 'auto', label: 'Platforma reytingi bo\'yicha',
        hint: 'Faqat avtomatik hisoblangan ball (faollik, diplomlar, GPA...)',
    },
    mixed: {
        id: 'mixed', label: 'Aralash (baho + reyting)',
        hint: 'Ikkalasi belgilangan vazn bilan qo\'shiladi',
    },
};

export const DEFAULT_MIXED_WEIGHT = { evaluation: 70, auto: 30 };

// Teng ball to'planganda ketma-ket qo'llanadi.
export const TIEBREAK_OPTIONS = {
    auto_score: { id: 'auto_score', label: 'Platforma reytingi yuqori' },
    social_score: { id: 'social_score', label: 'Ijtimoiy faollik bali yuqori' },
    prize_place_count: { id: 'prize_place_count', label: 'Sovrinli o\'rinlari ko\'p' },
    evaluation_count: { id: 'evaluation_count', label: 'Ko\'proq baholovchi baholagan' },
    submitted_at: { id: 'submitted_at', label: 'Arizani oldinroq topshirgan' },
};

export const DEFAULT_TIEBREAK = ['auto_score', 'social_score', 'submitted_at'];

export const ADVANCE_MODES = {
    automatic: {
        id: 'automatic', label: 'Avtomatik',
        hint: 'Barcha baholar tushishi bilan tizim Top N ni o\'zi keyingi bosqichga o\'tkazadi',
    },
    manual: {
        id: 'manual', label: 'Admin tasdig\'i bilan',
        hint: 'Tizim ro\'yxatni tayyorlaydi, o\'tkazish tugmasini admin bosadi',
    },
};

// Dekanat nima bo'yicha ball qo'yadi. Grant o'z me'zonlarini belgilashi mumkin.
export const DEFAULT_EVALUATION_CRITERIA = [
    { key: 'documents', label: 'Hujjatlarning to\'liqligi va ishonchliligi', max: 25 },
    { key: 'academic', label: 'O\'quv ko\'rsatkichlari', max: 25 },
    { key: 'activity', label: 'Ijtimoiy va ilmiy faollik', max: 25 },
    { key: 'motivation', label: 'Nomzodning umumiy tavsifi', max: 25 },
];

export const evaluationMaxTotal = (criteria) =>
    (criteria || DEFAULT_EVALUATION_CRITERIA).reduce((s, c) => s + (Number(c.max) || 0), 0);

export const getEvaluationCriteria = (grant) =>
    (grant?.evaluationCriteria && grant.evaluationCriteria.length)
        ? grant.evaluationCriteria
        : DEFAULT_EVALUATION_CRITERIA;

// Grant ikki bosqichli bo'lganda ariza qaysi bosqichdan boshlanadi.
export const initialStatusForStage = (grant, stage = 'faculty') =>
    (grant?.twoStage ? getStage(stage).flow[0] : 'submitted');

const LEGACY_APPLICATION_STATUS = {
    'Kutilmoqda': 'submitted',
    "Ko'rilmoqda": 'doc_check',
    'Tasdiqlangan': 'approved',
    'Rad etilgan': 'rejected',
    'Rad etildi': 'rejected',
};
export const normalizeApplicationStatus = (raw) =>
    (APPLICATION_STATUS[raw] ? raw : LEGACY_APPLICATION_STATUS[raw]) || 'submitted';

export const getApplicationStatusMeta = (raw) =>
    APPLICATION_STATUS[normalizeApplicationStatus(raw)];

// ---------------------------------------------------------------------------
// ME'ZONLAR KATALOGI
//
// `source: 'auto'`  — platformaning o'z ma'lumotidan hisoblanadi. Talaba hech
//                     narsa kiritmaydi, soxtalashtira olmaydi.
// `source: 'manual'`— platformada manba yo'q (GPA, IELTS): talaba o'zi kiritadi,
//                     admin tekshiradi. Aniq ajratib turilishi muhim — mosligni
//                     ko'rsatganda "tasdiqlangan" va "talaba so'zi" bir xil
//                     vaznda ko'rinmasligi kerak.
//
// `op` — solishtirish amali. `gte` (kamida), `lte` (ko'pi bilan), `eq` (aynan),
//        `exists` (mavjud bo'lsa kifoya).
// ---------------------------------------------------------------------------
export const CRITERIA_CATALOG = [
    // --- Avtomatik: ijtimoiy faollik ---
    {
        key: 'social_score', label: 'Ijtimoiy faollik bali', unit: 'ball',
        source: 'auto', valueType: 'number', op: 'gte', defaultTarget: 100,
        hint: 'Ijtimoiy faollik reyestridagi jami tasdiqlangan ball',
    },
    // --- Avtomatik: hujjat reyestridan ---
    {
        key: 'diploma_count', label: 'Darajali diplomlar soni', unit: 'ta',
        source: 'auto', valueType: 'number', op: 'gte', defaultTarget: 1,
        hint: 'Taqdirlash reyestridagi berilgan diplomlar',
    },
    {
        key: 'first_place_count', label: "I o'rin diplomlari soni", unit: 'ta',
        source: 'auto', valueType: 'number', op: 'gte', defaultTarget: 1,
        hint: "Faqat 1-o'rin uchun berilgan diplomlar",
    },
    {
        key: 'prize_place_count', label: "Sovrindorlik (I-III o'rin) soni", unit: 'ta',
        source: 'auto', valueType: 'number', op: 'gte', defaultTarget: 1,
        hint: "1-, 2- va 3-o'rin diplomlari jami",
    },
    {
        key: 'certificate_count', label: 'Sertifikatlar soni', unit: 'ta',
        source: 'auto', valueType: 'number', op: 'gte', defaultTarget: 1,
        hint: 'Berilgan sertifikatlar',
    },
    {
        key: 'thanks_count', label: 'Tashakkurnomalar soni', unit: 'ta',
        source: 'auto', valueType: 'number', op: 'gte', defaultTarget: 1,
        hint: 'Volontyorlik va tashkilotchilik uchun tashakkurnomalar',
    },
    // --- Avtomatik: ishtirok va davomat ---
    {
        key: 'activity_count', label: 'Ishtirok etgan tadbir/musobaqalar', unit: 'ta',
        source: 'auto', valueType: 'number', op: 'gte', defaultTarget: 5,
        hint: 'Joriy yilda davomat yoki ro’yxatdan o’tish bilan tasdiqlangan',
    },
    {
        key: 'club_count', label: "A'zo bo'lgan klublar soni", unit: 'ta',
        source: 'auto', valueType: 'number', op: 'gte', defaultTarget: 1,
        hint: 'Faol klub a’zoliklari',
    },
    {
        key: 'course', label: 'Kurs', unit: '-kurs',
        source: 'auto', valueType: 'number', op: 'gte', defaultTarget: 2,
        hint: 'Talabaning joriy kursi',
    },
    // --- Qo'lda: platformada manba yo'q ---
    {
        key: 'gpa', label: 'GPA balli', unit: '',
        source: 'manual', valueType: 'number', op: 'gte', defaultTarget: 4,
        hint: 'Talaba kiritadi, mas’ul reyting daftarchasi bo’yicha tekshiradi',
    },
    {
        key: 'language_score', label: 'Til sertifikati (IELTS/CEFR)', unit: '',
        source: 'manual', valueType: 'text', op: 'exists', defaultTarget: 'B2',
        hint: 'Sertifikat nusxasi bilan tasdiqlanadi',
    },
    {
        key: 'articles', label: 'Ilmiy maqolalar soni', unit: 'ta',
        source: 'manual', valueType: 'number', op: 'gte', defaultTarget: 1,
        hint: 'Nashr etilgan maqolalar',
    },
    {
        key: 'project', label: 'Loyiha / startap', unit: '',
        source: 'manual', valueType: 'text', op: 'exists', defaultTarget: 'Mavjud',
        hint: 'Prototip yoki taqdimot bilan',
    },
];

export const getCriterion = (key) => CRITERIA_CATALOG.find(c => c.key === key) || null;

export const AUTO_CRITERIA = CRITERIA_CATALOG.filter(c => c.source === 'auto');
export const MANUAL_CRITERIA = CRITERIA_CATALOG.filter(c => c.source === 'manual');

export const CRITERIA_OPS = {
    gte: { label: 'kamida', symbol: '≥' },
    lte: { label: "ko'pi bilan", symbol: '≤' },
    eq: { label: 'aynan', symbol: '=' },
    exists: { label: 'mavjud', symbol: '✓' },
};

// ---------------------------------------------------------------------------
// Talab qilinadigan hujjat turlari — boshlang'ich katalog. Admin Sozlamalar
// tabida o'zgartiradi, natija scholarship_settings jadvalida saqlanadi.
// ---------------------------------------------------------------------------
export const DEFAULT_DOC_TYPES = [
    { id: 'passport', label: 'Pasport nusxasi' },
    { id: 'rating_book', label: 'Reyting daftarchasi' },
    { id: 'cv', label: "CV / Ob'ektivka" },
    { id: 'recommendation', label: 'Tavsiyanoma' },
    { id: 'language_cert', label: 'Til sertifikati' },
    { id: 'articles', label: 'Maqolalar nusxasi' },
];

// ---------------------------------------------------------------------------
// AVTOMATIK BALLASH
//
// Har bir grant o'z vaznlarini belgilashi mumkin (`grant.weights`); belgilanmasa
// shu standart qiymatlar ishlaydi. Yig'indi 100 ga keltiriladi (normalizatsiya),
// shuning uchun vaznlar aniq 100 bo'lishi shart emas.
//
// `cap` — shu me'zon bo'yicha "to'liq ball" hisoblanadigan qiymat. Masalan
// ijtimoiy faollik 300 ball bo'lsa ham 300 dan yuqorisi qo'shimcha ustunlik
// bermaydi, aks holda bitta me'zon butun reytingni yutib yuboradi.
// ---------------------------------------------------------------------------
export const DEFAULT_SCORING_WEIGHTS = {
    social_score: 30,
    prize_place_count: 25,
    activity_count: 20,
    gpa: 25,
};

export const SCORING_CAPS = {
    social_score: 300,
    diploma_count: 5,
    first_place_count: 3,
    prize_place_count: 5,
    certificate_count: 10,
    thanks_count: 5,
    activity_count: 20,
    club_count: 3,
    course: 4,
    gpa: 5,
    articles: 5,
};

export const GRANT_TYPES = ['Bir martalik', 'Oylik', 'Semestrlik', 'Yillik'];

export const GRANT_SCOPES = [
    { id: 'internal', label: 'Ichki (universitet)' },
    { id: 'state', label: 'Davlat' },
    { id: 'private', label: 'Xususiy / homiy' },
];

// "1,500,000" / "1 500 000 so'm" kabi har xil yozilgan summalarni raqamga keltiradi.
export const parseAmount = (raw) => {
    if (typeof raw === 'number') return raw;
    const digits = String(raw ?? '').replace(/[^\d]/g, '');
    return digits ? Number(digits) : 0;
};

export const formatAmount = (raw) => {
    const n = parseAmount(raw);
    if (!n) return '—';
    return n.toLocaleString('ru-RU').replace(/ /g, ' ') + " so'm";
};
