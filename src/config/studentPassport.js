// ===========================================================================
// TALABANING RAQAMLI PASPORTI
//
// Tuzilma HEMIS'ning "Talabaning raqamli pasporti" ekranidan olingan - bir xil
// bo'limlar va bir xil maydonlar. Sabab oddiy: ma'lumot kelajakda o'sha
// tizimdan keladi va ikkita boshqa-boshqa shakl bo'lsa moslashtirish har safar
// qo'lda qilinadi.
//
// UCH QOIDA:
//
// 1. PASPORT MA'LUMOTNI TAKRORLAMAYDI. Turar joy `student_housing` dan,
//    stipendiya o'z modulidan, davomat o'z jadvalidan o'qiladi. Pasport
//    YIG'UVCHI ko'rinish, ikkinchi nusxa emas - aks holda ikkita raqam
//    bir-biriga zid chiqadi.
//
// 2. HAR MAYDONNING MANBASI SAQLANADI: hemis | manual | import | platform.
//    "Fakultet qayerdan kelgan?" degan savolga javob bo'lishi kerak.
//
// 3. MAXFIYLIK MAYDON DARAJASIDA. JSHSHIR, passport, nogironlik, ijtimoiy
//    himoya - bular oddiy ma'lumot emas. Pasport ko'ruvchiga qarab
//    O'ZGARADI, hammaga bir xil ochilmaydi.
// ===========================================================================

// Maxfiylik darajalari.
//
//   open      - platforma ichida ochiq (ism, mutaxassislik)
//   internal  - xodimlar ko'radi (kurs, aloqa, o'quv ma'lumotlari)
//   sensitive - cheklangan (JSHSHIR, passport, nogironlik, ijtimoiy himoya)
//
// Talabaning O'ZI har doim hammasini ko'radi - bu uning ma'lumoti.
export const SENSITIVITY = {
    OPEN: 'open',
    INTERNAL: 'internal',
    SENSITIVE: 'sensitive',
};

// Manba - ma'lumot qayerdan kelgani.
export const FIELD_SOURCES = {
    hemis: { key: 'hemis', label: 'HEMIS' },
    manual: { key: 'manual', label: "Qo'lda kiritilgan" },
    import: { key: 'import', label: 'Import' },
    platform: { key: 'platform', label: 'Platforma hisobi' },
};

// ---------------------------------------------------------------------------
// BO'LIMLAR VA MAYDONLAR
//
// `computed: true` - maydon pasport jadvalida SAQLANMAYDI, boshqa qatlamdan
// o'qiladi (1-qoida). Ular tahrirlanmaydi ham: manbasiga borib o'zgartiriladi.
// ---------------------------------------------------------------------------
export const PASSPORT_SECTIONS = [
    {
        key: 'identity',
        label: "Talaba ma'lumotlari",
        fields: [
            { key: 'fullName', label: 'F.I.Sh.', sensitivity: SENSITIVITY.OPEN, computed: true },
            { key: 'studentId', label: 'Talaba ID', sensitivity: SENSITIVITY.INTERNAL },
            { key: 'jshshir', label: 'JSHSHIR', sensitivity: SENSITIVITY.SENSITIVE },
            { key: 'passport', label: 'Passport', sensitivity: SENSITIVITY.SENSITIVE },
            { key: 'gender', label: 'Jinsi', sensitivity: SENSITIVITY.INTERNAL, computed: true },
            { key: 'birthDate', label: "Tug'ilgan sana", sensitivity: SENSITIVITY.INTERNAL, type: 'date' },
        ],
    },
    {
        key: 'contact',
        label: "Kontakt ma'lumotlari",
        fields: [
            // Yashash manzili shaxsiy ma'lumot - xodimlarga ham cheklangan.
            { key: 'address', label: 'Manzil', sensitivity: SENSITIVITY.SENSITIVE },
            { key: 'phone', label: 'Telefon', sensitivity: SENSITIVITY.INTERNAL },
            { key: 'email', label: 'Email', sensitivity: SENSITIVITY.INTERNAL },
        ],
    },
    {
        key: 'education',
        label: "Oliy ta'lim ma'lumotlari",
        fields: [
            { key: 'university', label: 'OTM', sensitivity: SENSITIVITY.OPEN },
            { key: 'speciality', label: 'Mutaxassislik', sensitivity: SENSITIVITY.OPEN },
            { key: 'faculty', label: 'Fakultet', sensitivity: SENSITIVITY.OPEN, computed: true },
            { key: 'paymentForm', label: "To'lov shakli", sensitivity: SENSITIVITY.INTERNAL },
            { key: 'educationType', label: "Ta'lim turi", sensitivity: SENSITIVITY.INTERNAL },
            { key: 'educationForm', label: "Ta'lim shakli", sensitivity: SENSITIVITY.INTERNAL },
            { key: 'course', label: 'Kurs', sensitivity: SENSITIVITY.OPEN, computed: true },
            { key: 'group', label: 'Guruh', sensitivity: SENSITIVITY.OPEN, computed: true },
            { key: 'language', label: "Ta'lim tili", sensitivity: SENSITIVITY.INTERNAL },
            { key: 'admissionYear', label: 'Qabul yili', sensitivity: SENSITIVITY.INTERNAL },
            { key: 'status', label: 'Holati', sensitivity: SENSITIVITY.INTERNAL },
            { key: 'dtmScore', label: 'Umumiy DTM ball', sensitivity: SENSITIVITY.INTERNAL, type: 'number' },
        ],
    },
    {
        key: 'housing',
        label: 'Turar joy',
        // Butun bo'lim BOSHQA QATLAMDAN o'qiladi (`student_housing`).
        // 10-mezonda baholovchini aynan shu belgilaydi.
        computedSection: 'housing',
        fields: [
            { key: 'housingType', label: 'Turar joy', sensitivity: SENSITIVITY.INTERNAL, computed: true },
            { key: 'dormitory', label: 'Yotoqxona', sensitivity: SENSITIVITY.INTERNAL, computed: true },
            { key: 'room', label: 'Xona', sensitivity: SENSITIVITY.INTERNAL, computed: true },
        ],
    },
    {
        key: 'social',
        label: 'Ijtimoiy himoya',
        // ENG MAXFIY BO'LIM. Stipendiya va imtiyozlar uchun hal qiluvchi,
        // lekin uni ko'rish huquqi hammada bo'lmasligi kerak.
        fields: [
            { key: 'orphan', label: 'Yetim', sensitivity: SENSITIVITY.SENSITIVE, type: 'bool' },
            { key: 'disability', label: 'Nogironlik', sensitivity: SENSITIVITY.SENSITIVE },
            { key: 'lowIncome', label: "Kam ta'minlangan oila", sensitivity: SENSITIVITY.SENSITIVE, type: 'bool' },
            { key: 'guardianship', label: "Vasiylik ma'lumotlari", sensitivity: SENSITIVITY.SENSITIVE },
            { key: 'youthRegistry', label: 'Yoshlar daftari', sensitivity: SENSITIVITY.SENSITIVE, type: 'bool' },
            { key: 'womenRegistry', label: 'Ayollar daftari', sensitivity: SENSITIVITY.SENSITIVE, type: 'bool' },
            { key: 'socialRegistry', label: 'Ijtimoiy himoya reestri', sensitivity: SENSITIVITY.SENSITIVE, type: 'bool' },
        ],
    },
    {
        key: 'extra',
        label: "Qo'shimcha",
        fields: [
            // Sport razryadi 10-mezonga bevosita aloqador.
            { key: 'sportRank', label: 'Sport razryadi', sensitivity: SENSITIVITY.INTERNAL },
            { key: 'contract', label: "Shartnoma ma'lumotlari", sensitivity: SENSITIVITY.INTERNAL },
            { key: 'secondaryEducation', label: "O'rta ta'lim ma'lumotlari", sensitivity: SENSITIVITY.INTERNAL },
            { key: 'vocationalEducation', label: "Kasbiy ta'lim ma'lumotlari", sensitivity: SENSITIVITY.INTERNAL },
        ],
    },
];

export const PASSPORT_FIELD_INDEX = PASSPORT_SECTIONS.reduce((acc, s) => {
    s.fields.forEach(f => { acc[`${s.key}.${f.key}`] = { ...f, section: s.key, sectionLabel: s.label }; });
    return acc;
}, {});

// ---------------------------------------------------------------------------
// KIM NIMANI KO'RADI
//
// Vakolat rolga VA biriktiruvga bog'liq. Ro'yxat ataylab qisqa: har yangi
// ko'ruvchi turini shu yerga qo'shish kerak, aks holda u hech narsa ko'rmaydi.
// "Ko'rmaslik" xavfsiz standart - qarama-qarshisi emas.
// ---------------------------------------------------------------------------
export const VIEWER_KINDS = {
    SELF: 'self',                 // talabaning o'zi
    ADMIN: 'admin',               // administrator
    TUTOR: 'tutor',               // biriktirilgan tyutor
    DORM: 'dorm',                 // yotoqxona mudiri
    EVALUATOR: 'evaluator',       // stipendiya komissiyasi
    MANAGEMENT: 'management',     // rahbariyat
    OTHER: 'other',
};

// Har ko'ruvchi qaysi darajagacha ko'radi.
const VISIBILITY = {
    [VIEWER_KINDS.SELF]: [SENSITIVITY.OPEN, SENSITIVITY.INTERNAL, SENSITIVITY.SENSITIVE],
    [VIEWER_KINDS.ADMIN]: [SENSITIVITY.OPEN, SENSITIVITY.INTERNAL, SENSITIVITY.SENSITIVE],
    // Stipendiya komissiyasiga ijtimoiy himoya KERAK - ariza aynan shunga
    // asoslanadi. Lekin JSHSHIR va passport kerak emas (pastda istisno).
    [VIEWER_KINDS.EVALUATOR]: [SENSITIVITY.OPEN, SENSITIVITY.INTERNAL, SENSITIVITY.SENSITIVE],
    [VIEWER_KINDS.TUTOR]: [SENSITIVITY.OPEN, SENSITIVITY.INTERNAL],
    [VIEWER_KINDS.MANAGEMENT]: [SENSITIVITY.OPEN, SENSITIVITY.INTERNAL],
    // Yotoqxona mudirining ishi bitta: turar joy. Qolganini ko'rishga
    // ehtiyoji yo'q, demak ko'rmaydi.
    [VIEWER_KINDS.DORM]: [SENSITIVITY.OPEN],
    [VIEWER_KINDS.OTHER]: [SENSITIVITY.OPEN],
};

// Ba'zi maydonlar darajasidan qat'i nazar cheklangan.
// Stipendiya komissiyasiga ijtimoiy himoya kerak, shaxsni tasdiqlovchi
// hujjat raqami esa kerak emas - u qarorga hech qanday ta'sir qilmaydi.
const FIELD_EXCEPTIONS = {
    [VIEWER_KINDS.EVALUATOR]: ['identity.jshshir', 'identity.passport'],
    [VIEWER_KINDS.MANAGEMENT]: ['contact.address', 'contact.phone'],
};

export const canViewField = (viewerKind, sectionKey, field) => {
    const allowed = VISIBILITY[viewerKind] || VISIBILITY[VIEWER_KINDS.OTHER];
    if (!allowed.includes(field.sensitivity)) return false;
    const blocked = FIELD_EXCEPTIONS[viewerKind] || [];
    if (blocked.includes(`${sectionKey}.${field.key}`)) return false;
    // Yotoqxona mudiri turar joy bo'limini ko'radi - bu uning ishi.
    return true;
};

// Yotoqxona mudiri uchun istisno: turar joy bo'limi ochiq.
export const canViewSection = (viewerKind, section) => {
    if (viewerKind === VIEWER_KINDS.DORM) {
        return ['identity', 'housing'].includes(section.key);
    }
    return true;
};

// Maxfiy maydonga qaralganda IZ QOLADI. Bu cheklovdan ham muhimroq:
// cheklovni chetlab o'tish mumkin, izni esa yo'q.
export const isAccessLogged = (field) => field.sensitivity === SENSITIVITY.SENSITIVE;
