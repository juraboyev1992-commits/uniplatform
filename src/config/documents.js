// Rasmiy hujjatlar tizimi: hujjat turlari, ularning raqam prefiksi va standart taqdirlash qoidalari.
// Bu yerda faqat VOCABULARY va DEFAULT'lar turadi — real yozuvlar db.js orqali Supabase'ga boradi.
// Yangi hujjat turi qo'shish = shu ro'yxatga bitta qator; hech qanday jadval o'zgarmaydi.

export const ORGANIZATION_NAME = 'Toshkent davlat yuridik universiteti';
export const ORGANIZATION_SHORT = 'TSUL';

// `prefix` ro'yxatga olish raqamida ishlatiladi: TSUL/2026/DIP/000124
// `group` reestr va talaba kabinetidagi bo'limlarga bo'lish uchun.
export const DOCUMENT_TYPES = [
    // --- Diplomlar ---
    { id: 'diploma_1', label: 'I darajali diplom', group: 'diploma', prefix: 'DIP', rank: 1 },
    { id: 'diploma_2', label: 'II darajali diplom', group: 'diploma', prefix: 'DIP', rank: 2 },
    { id: 'diploma_3', label: 'III darajali diplom', group: 'diploma', prefix: 'DIP', rank: 3 },
    { id: 'diploma_winner', label: "G'olib diplomi", group: 'diploma', prefix: 'DIP' },
    { id: 'diploma_finalist', label: 'Finalist diplomi', group: 'diploma', prefix: 'DIP' },
    { id: 'diploma_participant', label: 'Ishtirokchi diplomi', group: 'diploma', prefix: 'DIP' },
    // --- Sertifikatlar ---
    { id: 'certificate_participation', label: 'Ishtirok sertifikati', group: 'certificate', prefix: 'CERT' },
    { id: 'certificate_active', label: 'Faol ishtirok sertifikati', group: 'certificate', prefix: 'CERT' },
    { id: 'certificate_training', label: 'Trening sertifikati', group: 'certificate', prefix: 'CERT' },
    { id: 'certificate_course', label: 'Kurs sertifikati', group: 'certificate', prefix: 'CERT' },
    // --- Tashakkurnomalar ---
    { id: 'thanks_general', label: 'Tashakkurnoma', group: 'thanks', prefix: 'THANK' },
    { id: 'thanks_organizer', label: 'Tashkilotchiga tashakkurnoma', group: 'thanks', prefix: 'THANK' },
    { id: 'thanks_judge', label: 'Hakamga tashakkurnoma', group: 'thanks', prefix: 'THANK' },
    { id: 'thanks_coordinator', label: 'Koordinatorga tashakkurnoma', group: 'thanks', prefix: 'THANK' },
    // --- Boshqa ---
    { id: 'honor_badge', label: 'Faxriy yorliq', group: 'other', prefix: 'HON' },
    { id: 'nomination', label: 'Maxsus nominatsiya', group: 'other', prefix: 'NOM' }
];

export const DOCUMENT_GROUPS = [
    { id: 'diploma', label: 'Diplomlar' },
    { id: 'certificate', label: 'Sertifikatlar' },
    { id: 'thanks', label: 'Tashakkurnomalar' },
    { id: 'other', label: 'Boshqa hujjatlar' }
];

export const getDocumentType = (id) => DOCUMENT_TYPES.find(t => t.id === id) || null;
export const getDocumentTypeLabel = (id) => getDocumentType(id)?.label || id;

// Hujjat holatlari — reestr va kabinetdagi rangli belgilar shulardan kelib chiqadi.
export const DOCUMENT_STATUS = {
    draft: { label: 'Qoralama', tone: 'bg-gray-100 text-gray-600' },
    pending: { label: 'Tasdiqlash kutilmoqda', tone: 'bg-amber-100 text-amber-700' },
    issued: { label: 'Berilgan', tone: 'bg-emerald-100 text-emerald-700' },
    revoked: { label: 'Bekor qilingan', tone: 'bg-rose-100 text-rose-700' }
};

export const PROTOCOL_STATUS = {
    draft: { label: 'Loyiha', tone: 'bg-gray-100 text-gray-600' },
    pending_signature: { label: 'Imzolash kutilmoqda', tone: 'bg-violet-100 text-violet-700' },
    approved: { label: 'Tasdiqlangan', tone: 'bg-emerald-100 text-emerald-700' },
    archived: { label: 'Arxivlangan', tone: 'bg-slate-100 text-slate-500' },
    cancelled: { label: 'Bekor qilingan', tone: 'bg-rose-100 text-rose-700' }
};

// Bayonnomani kim imzolashi — activity turiga qarab. `role` faqat bayonnomada ko'rsatiladigan lavozim
// nomi; kimligi (username) admin tomonidan tanlanadi.
export const DEFAULT_SIGNER_ROLES = {
    event: ['Tadbir koordinatori', 'Klub koordinatori', "Mas'ul xodim"],
    competition: ['Hakamlar hay\'ati raisi', 'Musobaqa koordinatori', "Mas'ul xodim"]
};

// Standart taqdirlash qoidalari. `match` — kimga tegishli ekanini aniqlaydi:
//   place: 1|2|3        -> aynan shu o'rinni egallagan
//   placeUpTo: N        -> 1..N oralig'idagi o'rin (finalistlar)
//   role: 'judge'|'organizer'|'participant'
// Birinchi mos kelgan qoida qo'llanadi (tartib muhim).
export const DEFAULT_AWARD_RULES = {
    competition: [
        { match: { place: 1 }, documentType: 'diploma_1' },
        { match: { place: 2 }, documentType: 'diploma_2' },
        { match: { place: 3 }, documentType: 'diploma_3' },
        { match: { role: 'participant' }, documentType: 'certificate_participation' },
        { match: { role: 'judge' }, documentType: 'thanks_judge' },
        { match: { role: 'organizer' }, documentType: 'thanks_organizer' }
    ],
    event: [
        { match: { role: 'participant' }, documentType: 'certificate_participation' },
        { match: { role: 'organizer' }, documentType: 'thanks_organizer' }
    ]
};

// Bir oluvchi uchun qaysi hujjat turi tegishli ekanini aniqlaydi. `rules` bo'lmasa standart qoidalar.
export const resolveDocumentType = (recipient, activityType, rules = null) => {
    const list = rules || DEFAULT_AWARD_RULES[activityType] || DEFAULT_AWARD_RULES.event;
    for (const rule of list) {
        const m = rule.match || {};
        if (m.place != null && recipient.place === m.place) return rule.documentType;
        if (m.placeUpTo != null && recipient.place != null && recipient.place <= m.placeUpTo) return rule.documentType;
        if (m.role && recipient.role === m.role) return rule.documentType;
    }
    return null;
};

// TSUL/2026/DIP/000124
export const formatRegistrationNumber = (prefix, year, seq) =>
    `${ORGANIZATION_SHORT}/${year}/${prefix}/${String(seq).padStart(6, '0')}`;

// Tayyor dizaynlar. Har biri ranglar va ramka uslubi bilan farq qiladi; hujjat yaratishda tanlanadi
// va `document.data.templateId` sifatida saqlanadi, ya'ni keyin ochilganda ham o'sha ko'rinishda chiqadi.
export const CERTIFICATE_TEMPLATES = [
    {
        id: 'classic',
        label: 'Klassik (ko\'k-oltin)',
        outerBorder: '#312e81', innerBorder: '#f59e0b',
        heading: '#312e81', accent: '#d97706',
        cornerA: '#312e81', cornerB: '#f59e0b'
    },
    {
        id: 'minimal',
        label: 'Zamonaviy (sokin)',
        outerBorder: '#0f172a', innerBorder: '#94a3b8',
        heading: '#0f172a', accent: '#475569',
        cornerA: '#0f172a', cornerB: '#cbd5e1'
    },
    {
        id: 'official',
        label: 'Rasmiy (to\'q qizil)',
        outerBorder: '#7f1d1d', innerBorder: '#b45309',
        heading: '#7f1d1d', accent: '#b45309',
        cornerA: '#7f1d1d', cornerB: '#fbbf24'
    }
];

export const getTemplate = (id) =>
    CERTIFICATE_TEMPLATES.find(t => t.id === id) || CERTIFICATE_TEMPLATES[0];

// Taqdirlash sozlamalarining boshlang'ich holati. Admin "Yakunlash" bo'limida shuni o'zgartiradi,
// so'ng shu asosda kimga qaysi hujjat tegishi hisoblanadi.
export const defaultAwardSettings = (activityType) => ({
    places: activityType === 'competition'
        ? { 1: 'diploma_1', 2: 'diploma_2', 3: 'diploma_3' }
        : {},
    // "Faol ishtirokchilar" - o'rin bo'yicha keyingi N nafar (sovrindorlardan tashqari).
    topActive: { count: 0, documentType: 'certificate_active' },
    // Qolgan barcha qatnashganlar. Bo'sh qiymat = hujjat berilmaydi.
    participants: 'certificate_participation',
    judges: 'thanks_judge',
    volunteers: { count: 0, documentType: 'thanks_general' },
    organizers: { count: 0, documentType: 'thanks_organizer' },
    // Faqat haqiqatan qatnashganlarga berilsinmi.
    attendedOnly: true,
    // Jamoaviy ishtirokda hujjat kimga yoziladi:
    //   'team'    - jamoa nomiga BITTA hujjat, tarkibi hujjatning o'zida ko'rsatiladi (standart);
    //   'members' - jamoaning har bir a'zosiga alohida hujjat, har birida o'z raqami bilan.
    teamAwardMode: 'team',
    templateId: 'classic'
});

// Rasmiy hujjatlardagi ism ko'rinishi: familiya TO'LIQ, ism va sharif bosh harflar bilan.
// "Aliyev Sardor Akmalovich" -> "Aliyev S.A."   |   "Aliyev Sardor" -> "Aliyev S."
// Bayonnomadagi jamoa tarkibi shu ko'rinishda yoziladi.
export const formatOfficialName = (fullName) => {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    const [surname, ...rest] = parts;
    return `${surname} ${rest.map(p => `${p[0].toUpperCase()}.`).join('')}`;
};
