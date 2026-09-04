// ===========================================================================
// KLUB TASHKIL ETISH VA RASMIYLASHTIRISH - konfiguratsiya
//
// Bu modul mavjud klub tizimini (clubs, memberships, join requests, position
// applications) ALMASHTIRMAYDI - u ustiga qo'shiladi. Yakuniy natija baribir
// bitta mavjud `clubs` yozuvi: yo talaba arizasi orqali, yo admin to'g'ridan-
// to'g'ri yaratib, ikkalasi ham shu bitta jadvalga yig'iladi.
//
// IKKI O'QLI HOLAT (RO'YXATDAN O'TISH va FAOLIYAT alohida):
//   registrationStatus - klub RASMIYLASHTIRISH jarayonining qaysi bosqichida
//   operationalStatus  - klub HOZIR ishlayaptimi
// Bular aralashtirilmasin: "yaratildi" va "rasmiy ro'yxatdan o'tdi" bir xil
// tushuncha emas (talab qilingan qoida).
//
// Mavjud `clubs.data.status` maydoni ('active'/'archived') TEGILMAYDI - u
// eski arxivlash tugmasi bilan ishlashda davom etadi. `operationalStatus`
// unga PARALLEL yangi, nozikroq o'q.
// ===========================================================================

// ---------------------------------------------------------------------------
// ARIZA STATUSLARI VA RUXSAT ETILGAN O'TISHLAR
//
// Har status faqat ro'yxatida ko'rsatilgan statusga o'tishi mumkin. Bu
// ro'yxat backendda (`db.reviewClubApplication`) HAM tekshiriladi - frontend
// tugmani yashirish yetarli emas, chunki so'rov to'g'ridan-to'g'ri API'ga
// yuborilishi mumkin.
// ---------------------------------------------------------------------------
export const APPLICATION_STATUS = {
    DRAFT: 'DRAFT',
    SUBMITTED: 'SUBMITTED',
    UNDER_REVIEW: 'UNDER_REVIEW',
    REVISION_REQUIRED: 'REVISION_REQUIRED',
    RESUBMITTED: 'RESUBMITTED',
    EXPERT_REVIEW: 'EXPERT_REVIEW',
    PENDING_APPROVAL: 'PENDING_APPROVAL',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
};

export const APPLICATION_STATUS_LABELS = {
    DRAFT: 'Qoralama',
    SUBMITTED: 'Yuborildi',
    UNDER_REVIEW: "Ko'rib chiqilmoqda",
    REVISION_REQUIRED: 'Qayta ishlash talab etiladi',
    RESUBMITTED: 'Qayta yuborildi',
    EXPERT_REVIEW: 'Ekspertizada',
    PENDING_APPROVAL: 'Tasdiqlashni kutmoqda',
    APPROVED: 'Tasdiqlandi',
    REJECTED: 'Rad etildi',
};

// Kimdan kimga o'tish mumkin. APPROVED va REJECTED - yakuniy holatlar.
export const APPLICATION_TRANSITIONS = {
    DRAFT: ['SUBMITTED'],
    SUBMITTED: ['UNDER_REVIEW', 'REJECTED'],
    UNDER_REVIEW: ['REVISION_REQUIRED', 'EXPERT_REVIEW', 'PENDING_APPROVAL', 'REJECTED'],
    REVISION_REQUIRED: ['RESUBMITTED'],
    RESUBMITTED: ['UNDER_REVIEW', 'EXPERT_REVIEW', 'PENDING_APPROVAL', 'REJECTED'],
    EXPERT_REVIEW: ['PENDING_APPROVAL', 'REVISION_REQUIRED', 'REJECTED'],
    PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'REVISION_REQUIRED'],
    APPROVED: [],
    REJECTED: [],
};

// Har o'tish uchun harakat kaliti (admin panelidagi tugma nomi va
// izoh talabini shundan aniqlaymiz).
export const APPLICATION_ACTIONS = [
    { key: 'submit', from: ['DRAFT'], to: 'SUBMITTED', label: 'Yuborish', requiresComment: false },
    { key: 'start_review', from: ['SUBMITTED', 'RESUBMITTED'], to: 'UNDER_REVIEW', label: "Ko'rib chiqishni boshlash", requiresComment: false },
    { key: 'request_revision', from: ['UNDER_REVIEW', 'EXPERT_REVIEW', 'PENDING_APPROVAL'], to: 'REVISION_REQUIRED', label: 'Qayta ishlashga yuborish', requiresComment: true },
    { key: 'resubmit', from: ['REVISION_REQUIRED'], to: 'RESUBMITTED', label: 'Qayta yuborish', requiresComment: false },
    { key: 'send_expert_review', from: ['UNDER_REVIEW', 'RESUBMITTED'], to: 'EXPERT_REVIEW', label: 'Ekspertizaga yuborish', requiresComment: false },
    { key: 'send_approval', from: ['UNDER_REVIEW', 'RESUBMITTED', 'EXPERT_REVIEW'], to: 'PENDING_APPROVAL', label: 'Tasdiqlashga yuborish', requiresComment: false },
    { key: 'approve', from: ['PENDING_APPROVAL'], to: 'APPROVED', label: 'Tasdiqlash', requiresComment: false },
    { key: 'reject', from: ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED', 'EXPERT_REVIEW', 'PENDING_APPROVAL'], to: 'REJECTED', label: 'Rad etish', requiresComment: true },
];

export const canTransitionApplication = (fromStatus, toStatus) =>
    (APPLICATION_TRANSITIONS[fromStatus] || []).includes(toStatus);

// ---------------------------------------------------------------------------
// KLUBNING RO'YXATDAN O'TISH HOLATI (registrationStatus)
//
// Har ikki yo'l (ariza orqali va admin to'g'ridan-to'g'ri) bir xil bosqichdan
// o'tadi: Club yozuvi yaratiladi -> RO'YXATDAN O'TKAZILADI -> GUVOHNOMA
// BERILADI. Mavjud klublar (bu modul qo'shilishidan oldingi) REGISTERED deb
// hisoblanadi - ularni qaytadan tekshiruvdan o'tkazish shart emas (band 18).
// ---------------------------------------------------------------------------
export const REGISTRATION_STATUS = {
    DRAFT: 'DRAFT',
    PENDING_REGISTRATION: 'PENDING_REGISTRATION',
    REGISTERED: 'REGISTERED',
    REVOKED: 'REVOKED',
};

export const REGISTRATION_STATUS_LABELS = {
    DRAFT: 'Yaratildi (rasmiylashtirilmagan)',
    PENDING_REGISTRATION: 'Rasmiylashtirish kutilmoqda',
    REGISTERED: "Ro'yxatdan o'tgan",
    REVOKED: 'Bekor qilingan',
};

// Mavjud (bu modul qo'shilishidan oldingi) klublar uchun standart qiymat -
// ularda `registrationStatus` maydoni umuman yo'q, shuning uchun mapper shu
// qiymatni qo'yadi. "Ko'rmaslik xavfsiz" qoidasining aksi: bu yerda "allaqachon
// rasmiy" xavfsiz standart, chunki ular haqiqatan ham yillar davomida faoliyat
// yuritib kelgan klublar.
export const DEFAULT_REGISTRATION_STATUS_FOR_LEGACY_CLUBS = REGISTRATION_STATUS.REGISTERED;

export const OPERATIONAL_STATUS = {
    ACTIVE: 'ACTIVE',
    MONITORING: 'MONITORING',
    INACTIVE: 'INACTIVE',
    SUSPENDED: 'SUSPENDED',
    TERMINATED: 'TERMINATED',
};

export const OPERATIONAL_STATUS_LABELS = {
    ACTIVE: 'Faol',
    MONITORING: 'Kuzatuvda',
    INACTIVE: 'Nofaol',
    SUSPENDED: 'To\'xtatilgan',
    TERMINATED: 'Tugatilgan',
};

export const DEFAULT_OPERATIONAL_STATUS = OPERATIONAL_STATUS.ACTIVE;

// Klub qayerdan yaratilgani - audit uchun. Mavjud klublarning barchasi
// ADMIN_DIRECT deb belgilanadi: bu modul qo'shilishidan oldin ular baribir
// admin panelidan yaratilgan edi.
export const CREATED_FROM = {
    APPLICATION: 'APPLICATION',
    ADMIN_DIRECT: 'ADMIN_DIRECT',
};

// ---------------------------------------------------------------------------
// KLUB TURI
// ---------------------------------------------------------------------------
export const CLUB_TYPES = [
    { id: 'klub', label: 'Klub' },
    { id: 'togarak', label: "To'garak" },
    { id: 'loyiha', label: 'Loyiha' },
    { id: 'intellektual', label: 'Intellektual' },
    { id: 'sport', label: 'Sport' },
    { id: 'madaniyat', label: "Madaniyat/San'at" },
    { id: 'boshqa', label: 'Boshqa' },
];
export const clubTypeLabel = (id) => CLUB_TYPES.find(t => t.id === id)?.label || id;

// ---------------------------------------------------------------------------
// NIZOM SHABLONI - 11 band
//
// Har band `{ key, title, placeholder }`. Matnning o'zi klub tomonidan
// yoziladi - bu faqat TUZILMA, tayyor matn emas: har klubning maqsadi va
// tartibi boshqacha, shablon soxta bir xil matn to'ldirmaydi.
// ---------------------------------------------------------------------------
export const REGULATION_SECTIONS = [
    { key: 'general', title: 'Umumiy qoidalar' },
    { key: 'purpose', title: 'Maqsad va vazifalar' },
    { key: 'directions', title: 'Faoliyat yo\'nalishlari' },
    { key: 'membership', title: "A'zolik tartibi" },
    { key: 'rights_duties', title: "A'zolarning huquq va majburiyatlari" },
    { key: 'governance', title: 'Klub boshqaruvi' },
    { key: 'activity', title: 'Faoliyatni tashkil etish' },
    { key: 'funding', title: 'Moliyalashtirish' },
    { key: 'reporting', title: 'Hisobot va monitoring' },
    { key: 'reorganization', title: "Qayta tashkil etish/tugatish" },
    { key: 'final', title: 'Yakuniy qoidalar' },
];

export const REGULATION_STATUS = {
    DRAFT: 'draft',
    REVISION: 'revision',
    APPROVED: 'approved',
};
export const REGULATION_STATUS_LABELS = {
    draft: 'Qoralama',
    revision: "Qayta ko'rib chiqilmoqda",
    approved: 'Tasdiqlangan',
};

// ---------------------------------------------------------------------------
// REYESTR RAQAMI PREFIKSLARI
//
// Mavjud `db.nextRegistrationNumber(prefix)` (documents/protocols allaqachon
// ishlatadi) qayta ishlatiladi - parallel raqamlash mexanizmi qurilmaydi.
// Format ham platformadagi bilan bir xil: TSUL/2026/CLUB/000001
// (config/documents.js: formatRegistrationNumber).
// ---------------------------------------------------------------------------
export const CLUB_REGISTRY_PREFIX = 'CLUB';
export const CLUB_CERTIFICATE_PREFIX = 'CLUBCERT';
