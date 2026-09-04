// Tadbir va musobaqaning to'liq hayot yo'li uchun konfiguratsiya.
//
// TAMOYIL: hamma narsa QO'SHIMCHA. Mavjud maydonlar, baholash me'zonlari,
// bosqichlar va yaratish qadamlari tegilmaydi. Bu yerdagi har bir maydon
// bo'sh bo'lishi mumkin va bo'sh bo'lganda tizim avvalgidek ishlaydi.

// ---------------------------------------------------------------------------
// ISHTIROK ROLLARI
//
// Bugungacha davomat faqat "keldi / kelmadi" deb yozilardi. Uch soat ishlagan
// volontyor bilan bir soat o'tirgan ishtirokchi bir xil hisoblanardi.
//
// `points` - tadbir yakunlanganda avtomatik yoziladigan asosiy ball.
// Sozlamalardan o'zgartiriladi; bu yerdagilar boshlang'ich qiymat.
// ---------------------------------------------------------------------------
export const PARTICIPATION_ROLES = {
    participant: {
        id: 'participant', label: 'Ishtirokchi', short: 'Ishtirokchi',
        points: 2, order: 1,
        tone: 'bg-slate-50 text-slate-700 border-slate-200',
        documentType: null,
    },
    volunteer: {
        id: 'volunteer', label: 'Volontyor', short: 'Volontyor',
        points: 5, order: 2,
        tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        documentType: 'thanks_general',
    },
    speaker: {
        id: 'speaker', label: 'Ma\'ruzachi', short: 'Ma\'ruzachi',
        points: 6, order: 3,
        tone: 'bg-violet-50 text-violet-700 border-violet-200',
        documentType: 'thanks_general',
    },
    organizer: {
        id: 'organizer', label: 'Tashkilotchi', short: 'Tashkilotchi',
        points: 7, order: 4,
        tone: 'bg-amber-50 text-amber-700 border-amber-200',
        documentType: 'thanks_organizer',
    },
};

export const PARTICIPATION_ROLE_ORDER = ['participant', 'volunteer', 'speaker', 'organizer'];

// Rol belgilanmagan yozuvlar - eski davomat yozuvlari - ishtirokchi hisoblanadi.
// Shu tufayli mavjud ma'lumot buzilmaydi.
export const DEFAULT_PARTICIPATION_ROLE = 'participant';

export const getRole = (id) => PARTICIPATION_ROLES[id] || PARTICIPATION_ROLES.participant;

// ---------------------------------------------------------------------------
// TADBIR TURI
// ---------------------------------------------------------------------------
export const EVENT_TYPES = {
    training: { id: 'training', label: 'Trening' },
    seminar: { id: 'seminar', label: 'Seminar' },
    lecture: { id: 'lecture', label: 'Ma\'ruza' },
    meeting: { id: 'meeting', label: 'Uchrashuv' },
    action: { id: 'action', label: 'Aksiya' },
    // Metodikaning 8-mezoni "umumxalq hasharlari"ni ALOHIDA sanaydi, shuning
    // uchun u aksiyadan ajratilgan: ma'lumotnoma hujjat tilida gapirishi kerak.
    hashar: { id: 'hashar', label: 'Hashar' },
    excursion: { id: 'excursion', label: 'Ekskursiya' },
    conference: { id: 'conference', label: 'Konferensiya' },
    festival: { id: 'festival', label: 'Festival / bayram' },
    volunteering: { id: 'volunteering', label: 'Volontyorlik' },
    other: { id: 'other', label: 'Boshqa' },
};

export const EVENT_TYPE_ORDER = [
    'training', 'seminar', 'lecture', 'meeting', 'action',
    'excursion', 'conference', 'festival', 'volunteering', 'other',
];

// ---------------------------------------------------------------------------
// FAOLIYAT DARAJASI
//
// Ballga koeffitsient beradi. Bundan tashqari "xalqaro faoliyat" ko'rsatkichi
// endi taxmin qilinmaydi: hozirgacha u tadbir NOMIDAN aniqlanardi
// (/xalqaro|international/i), chunki daraja maydoni yo'q edi.
// ---------------------------------------------------------------------------
export const ACTIVITY_LEVELS = {
    faculty: { id: 'faculty', label: 'Fakultet', coefficient: 0.8, order: 1 },
    university: { id: 'university', label: 'Universitet', coefficient: 1, order: 2 },
    city: { id: 'city', label: 'Shahar / viloyat', coefficient: 1.3, order: 3 },
    republic: { id: 'republic', label: 'Respublika', coefficient: 1.6, order: 4 },
    international: { id: 'international', label: 'Xalqaro', coefficient: 2, order: 5 },
};

export const ACTIVITY_LEVEL_ORDER = ['faculty', 'university', 'city', 'republic', 'international'];

// Daraja belgilanmagan bo'lsa universitet darajasi - koeffitsient 1, ya'ni
// eski tadbirlar uchun hisob o'zgarmaydi.
export const DEFAULT_ACTIVITY_LEVEL = 'university';

export const getLevel = (id) => ACTIVITY_LEVELS[id] || ACTIVITY_LEVELS.university;

// ---------------------------------------------------------------------------
// BALL HISOBI
//
//   ball = rol bali × daraja koeffitsienti
//
// Ataylab sodda: murakkab formula tushuntirib bo'lmaydigan raqam beradi va
// talaba "nega men shuncha oldim?" degan savolga javob topmaydi.
// ---------------------------------------------------------------------------
export const computeParticipationPoints = (roleId, levelId, overrides = {}) => {
    const role = getRole(roleId);
    const level = getLevel(levelId);
    const base = Number(overrides[roleId] ?? role.points) || 0;
    return Math.round(base * level.coefficient);
};

export const POINTS_EXPLANATION =
    "Ball rol va faoliyat darajasiga qarab hisoblanadi: rol bali × daraja koeffitsienti.";

// ---------------------------------------------------------------------------
// VAZIFALAR TAQSIMOTI
// ---------------------------------------------------------------------------
export const TASK_STATUS = {
    todo: { id: 'todo', label: 'Bajarilmagan', variant: 'default', tone: 'bg-gray-100 text-gray-600' },
    in_progress: { id: 'in_progress', label: 'Jarayonda', variant: 'warning', tone: 'bg-amber-100 text-amber-700' },
    done: { id: 'done', label: 'Bajarildi', variant: 'success', tone: 'bg-emerald-100 text-emerald-700' },
    blocked: { id: 'blocked', label: 'To\'sqinlik bor', variant: 'danger', tone: 'bg-red-100 text-red-700' },
};

export const TASK_STATUS_ORDER = ['todo', 'in_progress', 'done', 'blocked'];

// Ko'p tadbirda takrorlanadigan vazifalar - noldan yozish shart bo'lmasin.
export const TASK_TEMPLATES = [
    { title: 'Xonani band qilish va tayyorlash', role: 'organizer' },
    { title: 'E\'lon tayyorlash va tarqatish', role: 'organizer' },
    { title: 'Ma\'ruzachi bilan kelishish', role: 'organizer' },
    { title: 'Texnika: proyektor, mikrofon, ulanish', role: 'volunteer' },
    { title: 'Ro\'yxatdan o\'tkazish stoli', role: 'volunteer' },
    { title: 'Foto va video suratga olish', role: 'volunteer' },
    { title: 'Davomat belgilash', role: 'organizer' },
    { title: 'Tadbirdan keyin xonani tartibga keltirish', role: 'volunteer' },
    { title: 'Hisobot tayyorlash', role: 'organizer' },
];

// ---------------------------------------------------------------------------
// YAKUNIY HISOBOT
//
// Eng muhim talab: QO'LDA KIRITISHNI MINIMUMGA TUSHIRISH.
//
// Quyidagi maydonlar tizim tomonidan avtomatik to'ldiriladi va tahrirlanmaydi -
// ular allaqachon bazada bor:
//   ro'yxatdan o'tganlar, kelganlar, davomat foizi, rollar kesimi,
//   fakultetlar kesimi, berilgan ball, berilgan hujjatlar, xona, sana, davomiylik
//
// Qo'lda kiritiladigani faqat uchta: natija, muammo, keyingi tavsiya.
// ---------------------------------------------------------------------------
export const REPORT_AUTO_FIELDS = [
    { key: 'registered', label: "Ro'yxatdan o'tganlar" },
    { key: 'attended', label: 'Qatnashganlar' },
    { key: 'attendanceRate', label: 'Davomat foizi', suffix: '%' },
    { key: 'byRole', label: 'Rollar kesimi' },
    { key: 'byFaculty', label: 'Fakultetlar kesimi' },
    { key: 'pointsAwarded', label: 'Berilgan ball' },
    { key: 'documentsIssued', label: 'Berilgan hujjatlar' },
    { key: 'durationMinutes', label: 'Davomiyligi', suffix: 'daqiqa' },
];

export const REPORT_MANUAL_FIELDS = [
    {
        key: 'outcome', label: 'Erishilgan natija', required: true,
        placeholder: 'Tadbir nima bilan yakunlandi, qanday natijaga erishildi...',
    },
    {
        key: 'issues', label: 'Yuzaga kelgan muammolar', required: false,
        placeholder: 'Nima to\'sqinlik qildi, keyingi safar nimaga e\'tibor berish kerak...',
    },
    {
        key: 'recommendations', label: 'Keyingi safar uchun tavsiya', required: false,
        placeholder: 'Nimani o\'zgartirish kerak...',
    },
];

export const REPORT_STATUS = {
    draft: { label: 'Qoralama', variant: 'default' },
    submitted: { label: 'Topshirilgan', variant: 'success' },
};

// ---------------------------------------------------------------------------
// BILDIRISHNOMALAR
//
// Mexanizm platformada bor, lekin butun tizimda atigi ikki joyda chaqirilardi.
// Quyidagilar tadbir hayot yo'liga ulanadi.
// ---------------------------------------------------------------------------
export const ACTIVITY_NOTIFICATIONS = {
    announced: {
        key: 'announced', type: 'info',
        title: 'Yangi tadbir',
        build: (a) => `${a.title} — ${a.date}. Ro'yxatdan o'tishingiz mumkin.`,
    },
    reminder: {
        key: 'reminder', type: 'info',
        title: 'Ertaga tadbir',
        build: (a) => `${a.title} — ${a.time || ''} ${a.location || ''}`.trim(),
    },
    pointsAwarded: {
        key: 'points', type: 'success',
        title: 'Ball qo\'shildi',
        build: (a) => `${a.title} uchun ${a.points} ball qo'shildi (${a.roleLabel}).`,
    },
    documentIssued: {
        key: 'document', type: 'success',
        title: 'Hujjat berildi',
        build: (a) => `${a.title} uchun ${a.documentLabel} berildi.`,
    },
};

// Tadbirgacha necha kun qolganda eslatma yuboriladi.
export const REMINDER_DAYS = [1];
