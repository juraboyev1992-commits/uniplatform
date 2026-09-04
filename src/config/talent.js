// "Iqtidorli talabalar" moduli konfiguratsiyasi.
//
// Bu modul mavjud stipendiya tizimining O'RNINI BOSMAYDI - uning ustiga qo'shiladi
// va undan ma'lumot o'qiydi. Shuning uchun bu yerda stipendiya me'zonlari qayta
// ta'riflanmaydi: ular `config/scholarships.js` da qoladi.

// ---------------------------------------------------------------------------
// DASTURLAR
// ---------------------------------------------------------------------------
export const TALENT_PROGRAMS = {
    year1: {
        id: 'year1', label: '1-kurs dasturi', short: '1-kurs',
        tone: 'bg-sky-50 text-sky-700 border-sky-200',
        durationMonths: 6,
        purpose: 'Iqtidorni aniqlash, moslashtirish va rivojlantirish',
        // 1-kursning dastlabki 6 oyida yuqori talablar QO'YILMAYDI (§73).
        allowsScholarshipTargets: false,
    },
    senior: {
        id: 'senior', label: 'Yuqori kurs dasturi', short: 'Yuqori kurs',
        tone: 'bg-violet-50 text-violet-700 border-violet-200',
        durationMonths: null,
        purpose: 'Aniq stipendiya va mukofotga maqsadli tayyorlash',
        allowsScholarshipTargets: true,
    },
};

export const PROFILE_STATUS = {
    active: { label: 'Faol', variant: 'success' },
    paused: { label: 'Vaqtincha to\'xtatilgan', variant: 'warning' },
    graduated: { label: 'Bitirgan', variant: 'secondary' },
    archived: { label: 'Arxivlangan', variant: 'secondary' },
};

// Talaba dasturga qanday kirgan. §72: 1-kurs yagona yo'l EMAS.
export const ENTRY_ROUTES = {
    survey: { label: "So'rovnoma orqali", hint: '1-kurs dastlabki so\'rovnomasi' },
    nomination: { label: 'Tavsiya bilan', hint: 'Tyutor, dekanat yoki ilmiy rahbar tavsiyasi' },
    achievement: { label: 'Yutuq asosida', hint: 'Tanlov, olimpiada yoki ilmiy natija' },
    self: { label: "O'z arizasi bilan", hint: 'Talaba o\'zi qo\'shilgan' },
};

// 6 oylik yakuniy baholash natijasi (§12).
// MUHIM: bu baho talabaning imkoniyatini YOPMAYDI - u keyingi semestrda
// yuqoriga ko'tarilishi mumkin.
export const POTENTIAL_GRADES = {
    A: { label: 'Yuqori salohiyat', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', order: 1 },
    B: { label: 'Rivojlanayotgan', tone: 'bg-sky-50 text-sky-700 border-sky-200', order: 2 },
    C: { label: 'Kuzatuvdagi', tone: 'bg-amber-50 text-amber-700 border-amber-200', order: 3 },
};

// ---------------------------------------------------------------------------
// TALENT DEVELOPMENT SCORE — 100 ball (§22)
//
// MUHIM: bu Ijtimoiy faollik bali (Social Activity Score) BILAN BIR XIL EMAS.
// Ijtimoiy faollik bu yerda atigi 15 ballik bitta o'lchov.
//
// `source: 'auto'`   - platformaning o'z reyestridan hisoblanadi
// `source: 'manual'` - tashqi dalil kerak (til sertifikati, maqola nashri)
// ---------------------------------------------------------------------------
export const TALENT_DIMENSIONS = [
    {
        key: 'academic', label: 'Akademik', max: 25, source: 'auto',
        hint: 'O\'rtacha GPA (academic_records)',
        color: 'bg-indigo-500',
    },
    {
        key: 'research', label: 'Ilmiy faoliyat', max: 25, source: 'manual',
        hint: 'Maqola, konferensiya, tadqiqot - IDP dalillari bilan tasdiqlanadi',
        color: 'bg-violet-500',
    },
    {
        key: 'language', label: 'Til bilimi', max: 15, source: 'manual',
        hint: 'IELTS/CEFR sertifikati',
        color: 'bg-cyan-500',
    },
    {
        key: 'social', label: 'Ijtimoiy faollik', max: 15, source: 'auto',
        hint: 'Ijtimoiy faollik ledgeri (mavjud tizimdan)',
        color: 'bg-emerald-500',
    },
    {
        key: 'leadership', label: 'Liderlik', max: 10, source: 'auto',
        hint: 'Klub koordinatorligi, jamoa sardorligi, tashkilotchilik',
        color: 'bg-amber-500',
    },
    {
        key: 'international', label: 'Xalqaro faoliyat', max: 10, source: 'auto',
        hint: 'Xalqaro tanlov va konferensiyalardagi hujjatlar',
        color: 'bg-rose-500',
    },
];

export const TALENT_SCORE_MAX = TALENT_DIMENSIONS.reduce((s, d) => s + d.max, 0);

export const getDimension = (key) => TALENT_DIMENSIONS.find(d => d.key === key) || null;

// Har bir o'lchov uchun "to'liq ball" hisoblanadigan chegara. Masalan 10 ta
// diplom 3 tasidan ortiq ustunlik bermaydi - aks holda bitta o'lchov butun
// reytingni yutib yuboradi.
export const DIMENSION_CAPS = {
    academic: 5,          // GPA shkalasi
    research: 5,          // tasdiqlangan ilmiy natijalar soni
    language: 9,          // IELTS shkalasi
    social: 300,          // ijtimoiy faollik bali
    leadership: 5,        // rahbarlik rollari soni
    international: 3,     // xalqaro faoliyat soni
};

// ---------------------------------------------------------------------------
// IDP
// ---------------------------------------------------------------------------
export const GOAL_CATEGORIES = {
    academic: { label: 'Akademik', dimension: 'academic', icon: 'GraduationCap' },
    language: { label: 'Til', dimension: 'language', icon: 'Languages' },
    research: { label: 'Ilmiy', dimension: 'research', icon: 'FlaskConical' },
    social: { label: 'Ijtimoiy', dimension: 'social', icon: 'Users' },
    international: { label: 'Xalqaro', dimension: 'international', icon: 'Globe' },
    competition: { label: 'Tanlov', dimension: 'leadership', icon: 'Trophy' },
    scholarship: { label: 'Stipendiya', dimension: null, icon: 'Award' },
    award: { label: 'Davlat mukofoti', dimension: null, icon: 'Medal' },
};

export const GOAL_STATUS = {
    planned: { label: 'Rejalashtirilgan', variant: 'secondary' },
    in_progress: { label: 'Jarayonda', variant: 'warning' },
    done: { label: 'Bajarilgan', variant: 'success' },
    cancelled: { label: 'Bekor qilingan', variant: 'secondary' },
};

export const IDP_STATUS = {
    draft: { label: 'Qoralama', variant: 'secondary' },
    active: { label: 'Faol', variant: 'success' },
    completed: { label: 'Yakunlangan', variant: 'primary' },
    archived: { label: 'Arxivlangan', variant: 'secondary' },
};

// Maqsad muddati bo'yicha holat - "overdue" alohida status emas, hisoblanadi.
export const goalTiming = (goal, now = new Date()) => {
    if (goal.status === 'done' || goal.status === 'cancelled') return { state: 'closed', days: null };
    if (!goal.deadline) return { state: 'open', days: null };
    const end = new Date(`${goal.deadline}T23:59:59`);
    const days = Math.ceil((end - now) / 86400000);
    if (days < 0) return { state: 'overdue', days };
    if (days <= 14) return { state: 'due_soon', days };
    return { state: 'open', days };
};

// ---------------------------------------------------------------------------
// DALILLAR (§29, §66)
// Mavjud hujjat reyestridagi yozuv ham dalil bo'la oladi - qayta yuklash shart emas.
// ---------------------------------------------------------------------------
export const EVIDENCE_TYPES = {
    document: { label: 'Platformadagi hujjat', hint: 'Diplom, sertifikat, tashakkurnoma' },
    url: { label: 'Havola', hint: 'Nashr, loyiha sahifasi' },
    doi: { label: 'DOI', hint: 'Ilmiy maqola raqami' },
    file: { label: 'Fayl', hint: 'PDF, Word, rasm' },
    note: { label: 'Izoh', hint: "Mas'ul tasdig'i bilan" },
};

// ---------------------------------------------------------------------------
// BIRIKTIRISHLAR
// ---------------------------------------------------------------------------
export const ASSIGNMENT_ROLES = {
    tutor: {
        id: 'tutor', label: 'Tyutor', short: 'Tyutor',
        tone: 'bg-amber-50 text-amber-700 border-amber-200',
        scope: 'Moslashuv, akademik monitoring, davomat, oylik suhbat',
    },
    mentor: {
        id: 'mentor', label: 'Talaba-mentor', short: 'Mentor',
        tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        scope: 'Tajriba almashish, klub va tanlovlar, universitet hayoti',
    },
    supervisor: {
        id: 'supervisor', label: 'Ilmiy rahbar', short: 'Ilmiy rahbar',
        tone: 'bg-violet-50 text-violet-700 border-violet-200',
        scope: 'Ilmiy yo\'nalish, adabiyotlar, maqolaga tayyorgarlik',
    },
};

export const ASSIGNMENT_ROLE_ORDER = ['tutor', 'mentor', 'supervisor'];

// ---------------------------------------------------------------------------
// MONITORING
// ---------------------------------------------------------------------------
export const MONITORING_FLAGS = {
    green: { label: 'Yaxshi', tone: 'bg-emerald-500', textTone: 'text-emerald-700', bg: 'bg-emerald-50' },
    yellow: { label: 'Rivojlantirish kerak', tone: 'bg-amber-400', textTone: 'text-amber-700', bg: 'bg-amber-50' },
    red: { label: "E'tibor talab qiladi", tone: 'bg-red-500', textTone: 'text-red-700', bg: 'bg-red-50' },
};

// Monitoring nima uchun - interfeys buni ochiq yozib turadi, chunki bu
// ko'rsatkichlar JAZOLASH uchun emas (§11).
export const MONITORING_PURPOSE =
    "Bu ko'rsatkichlar baholash yoki jazolash uchun emas - ular \"talabaga qayerda yordam kerak?\" "
    + 'degan savolga javob beradi.';

export const MONITORING_ASPECTS = [
    { key: 'academic', label: 'Akademik ko\'rsatkich' },
    { key: 'attendance', label: 'Davomat' },
    { key: 'social', label: 'Ijtimoiy faollik' },
    { key: 'club', label: 'Klub faoliyati' },
    { key: 'competition', label: 'Tanlovlarda ishtirok' },
    { key: 'language', label: 'Til o\'rganish' },
    { key: 'research', label: 'Ilmiy qiziqish' },
    { key: 'meeting', label: 'Uchrashuvlar' },
];

// ---------------------------------------------------------------------------
// STIPENDIYA MAQSADI (target) HOLATLARI (§20)
//
// `candidate` bosqichida MAVJUD stipendiya tizimida real ariza yaratiladi va
// keyingi holatlar o'sha arizaning zanjiridan qaytadi. Ikkinchi komissiya
// qurilmaydi.
// ---------------------------------------------------------------------------
export const TARGET_STATUS = {
    not_started: { label: 'Boshlanmagan', variant: 'secondary', step: 0, terminal: false },
    preparing: { label: 'Tayyorgarlik', variant: 'warning', step: 1, terminal: false },
    almost_ready: { label: 'Deyarli tayyor', variant: 'warning', step: 2, terminal: false },
    ready: { label: 'Tayyor', variant: 'primary', step: 3, terminal: false },
    candidate: { label: 'Nomzod', variant: 'primary', step: 4, terminal: false },
    submitted: { label: 'Topshirilgan', variant: 'primary', step: 5, terminal: false },
    recommended: { label: 'Tavsiya etilgan', variant: 'primary', step: 6, terminal: false },
    won: { label: "G'olib", variant: 'success', step: 7, terminal: true },
    // §21: bu JAZO emas. Tamg'a qo'yilmaydi, keyingi imkoniyat uchun reja beriladi.
    not_selected: { label: 'Bu tanlovda tavsiya etilmadi', variant: 'secondary', step: 7, terminal: true },
    archived: { label: 'Arxivlangan', variant: 'secondary', step: 7, terminal: true },
};

export const TARGET_FLOW = ['preparing', 'almost_ready', 'ready', 'candidate', 'submitted', 'recommended', 'won'];

// Tayyorgarlik foizidan holat. Qo'lda o'zgartirish ham mumkin, lekin sukut
// bo'yicha tizim o'zi belgilaydi.
export const readinessToStatus = (readiness) => {
    if (readiness >= 95) return 'ready';
    if (readiness >= 70) return 'almost_ready';
    if (readiness > 0) return 'preparing';
    return 'not_started';
};

// ---------------------------------------------------------------------------
// RAG'BATLANTIRISH (§36, §63)
// Moddiy rag'bat kodga qotirilmaydi - bu faqat TURLAR ro'yxati, aniq qiymat
// va tartib admin sozlamalaridan boshqariladi.
// ---------------------------------------------------------------------------
export const RECOGNITION_TYPES = {
    appreciation: { label: 'Tashakkurnoma', documentType: 'thanks_general' },
    rector_appreciation: { label: 'Rektor nomidan tashakkurnoma', documentType: 'thanks_general' },
    honor_badge: { label: 'Faxriy yorliq', documentType: 'honor_badge' },
    mentor_certificate: { label: 'Mentor sertifikati', documentType: 'certificate_active' },
    rating_bonus: { label: 'Yil yakuni reytingiga qo\'shish', documentType: null },
    bonus_proposal: { label: 'Moddiy rag\'batga tavsiya', documentType: null },
    best_of_year: { label: 'Yil eng yaxshisi nominatsiyasi', documentType: 'nomination' },
};

export const RECOGNITION_CASE_STATUS = {
    draft: { label: 'Qoralama', variant: 'secondary' },
    review: { label: "Ko'rib chiqilmoqda", variant: 'warning' },
    approved: { label: 'Tasdiqlangan', variant: 'primary' },
    issued: { label: 'Hujjat berilgan', variant: 'success' },
    rejected: { label: 'Rad etilgan', variant: 'danger' },
};

export const RECOGNITION_RECORD_STATUS = {
    proposed: { label: 'Tavsiya qilingan', variant: 'warning' },
    approved: { label: 'Tasdiqlangan', variant: 'primary' },
    issued: { label: 'Berilgan', variant: 'success' },
    declined: { label: 'Rad etilgan', variant: 'secondary' },
};

// Boshlang'ich qoidalar - admin o'zgartiradi.
export const DEFAULT_RECOGNITION_RULES = [
    { achievementKey: 'president_scholarship', role: 'supervisor', recognitionType: 'rector_appreciation' },
    { achievementKey: 'president_scholarship', role: 'tutor', recognitionType: 'appreciation' },
    { achievementKey: 'president_scholarship', role: 'mentor', recognitionType: 'mentor_certificate' },
    { achievementKey: 'named_scholarship', role: 'supervisor', recognitionType: 'appreciation' },
    { achievementKey: 'named_scholarship', role: 'tutor', recognitionType: 'appreciation' },
    { achievementKey: 'named_scholarship', role: 'mentor', recognitionType: 'mentor_certificate' },
    { achievementKey: 'state_award', role: 'supervisor', recognitionType: 'honor_badge' },
    { achievementKey: 'default', role: 'supervisor', recognitionType: 'appreciation' },
    { achievementKey: 'default', role: 'tutor', recognitionType: 'appreciation' },
    { achievementKey: 'default', role: 'mentor', recognitionType: 'mentor_certificate' },
];

// §43: avtomatik jazolash mexanizmi YO'Q. Interfeys buni ochiq yozadi.
export const NO_PUNISHMENT_NOTE =
    "Shogird natijaga erishmagani uchun mentor, tyutor yoki ilmiy rahbarga avtomatik "
    + "salbiy baho, jarima yoki minus qo'llanmaydi. Tizim rag'batlantirishga qurilgan.";

// ---------------------------------------------------------------------------
// DAVLAT MUKOFOTLARI (§51)
// Grant emas - alohida yo'nalish. Rasmiy nomzodlik faqat vakolatli komissiya
// qarori bilan belgilanadi, tizim avtomatik qo'ymaydi.
// ---------------------------------------------------------------------------
export const STATE_AWARDS = [
    { key: 'zulfiya', label: 'Zulfiya nomidagi Davlat mukofoti' },
    { key: 'mard_ogil', label: "Mard o'g'il ko'krak nishoni" },
    { key: 'kelajak_bunyodkori', label: 'Kelajak bunyodkori' },
    { key: 'ulugbek', label: 'Mirzo Ulug\'bek nomidagi stipendiya' },
    { key: 'islom_karimov', label: 'Islom Karimov nomidagi stipendiya' },
    { key: 'president_scholarship', label: 'O\'zbekiston Respublikasi Prezidenti stipendiyasi' },
];

export const getStateAward = (key) => STATE_AWARDS.find(a => a.key === key) || null;
