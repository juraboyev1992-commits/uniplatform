import { FACULTIES, FACULTY_NAMES } from '../config/faculties';

// ===========================================================================
// EXCELDAN FOYDALANUVCHI IMPORT QILISH - TEKSHIRUV MANTIG'I
//
// Bu fayl ATAYLAB toza: u na Excel kutubxonasini, na bazani biladi. Kirishi -
// oddiy obyektlar massivi, chiqishi - tekshirilgan qatorlar va xatolar.
// Sababi: import oqimida eng ko'p xato qiladigan joy aynan tekshiruv, va uni
// UI ichiga yozib qo'ysak, har tekshirish uchun brauzerda fayl yuklash
// kerak bo'lardi.
//
// QOIDA: xato qator JIMGINA TASHLAB KETILMAYDI. Har qator uchun sabab
// yoziladi va ekranda ko'rsatiladi - 200 qatorli fayldan 3 tasi tushib
// qolsa, admin buni bilishi shart.
// ===========================================================================

export const ROLE_VALUES = ['TALABA', 'TYUTOR', 'RAHBARIYAT', 'ADMINISTRATOR'];

// Excel sarlavhalari. `aliases` - odam qo'lda yozganda yo'l qo'yiladigan
// shakllar: "F.I.Sh.", "fish", "ism familiya" - hammasi bitta ustun.
export const IMPORT_COLUMNS = [
    { key: 'username', header: 'login', aliases: ['username', 'foydalanuvchi'] },
    { key: 'fullName', header: 'fish', aliases: ['f.i.sh.', 'fio', 'ism familiya', 'toliq ism'] },
    { key: 'password', header: 'parol', aliases: ['password'] },
    { key: 'role', header: 'rol', aliases: ['role', 'lavozim'] },
    { key: 'faculty', header: 'fakultet', aliases: ['fakulteti', 'faculty', 'bolim'] },
    { key: 'course', header: 'kurs', aliases: ['kursi', 'course'] },
    { key: 'group', header: 'guruh', aliases: ['guruhi', 'group'] },
    { key: 'studentId', header: 'talaba_id', aliases: ['talaba id', 'student_id', 'hemis id', 'hemis'] },
    { key: 'gender', header: 'jinsi', aliases: ['jins', 'gender'] },
    { key: 'phone', header: 'telefon', aliases: ['telefon raqami', 'phone', 'tel'] },
    { key: 'email', header: 'email', aliases: ['e-mail', 'pochta'] },
];

// Sarlavhani taqqoslash uchun soddalashtirish: registr, ortiqcha bo'shliq,
// tagchiziq va nuqta e'tiborga olinmaydi - "F.I.Sh." va "fish" bir xil.
export const normalizeHeader = (raw) => String(raw ?? '')
    .toLowerCase()
    .replace(/[\s._-]+/g, ' ')
    .trim();

const HEADER_INDEX = (() => {
    const map = new Map();
    IMPORT_COLUMNS.forEach(col => {
        map.set(normalizeHeader(col.header), col.key);
        (col.aliases || []).forEach(a => map.set(normalizeHeader(a), col.key));
    });
    return map;
})();

// Excel varag'idan kelgan xom qatorlarni bizning kalitlarga o'giradi.
// Notanish ustunlar tashlanadi, LEKIN nomlari qaytariladi: admin "fakultet"
// o'rniga "fakultat" deb yozgan bo'lsa, ustun jimgina yo'qolmasin.
export const mapSheetRows = (rawRows) => {
    const unknownHeaders = new Set();
    const rows = (rawRows || []).map((raw, i) => {
        const row = { _line: i + 2 }; // +2: 1-qator sarlavha, Excel 1 dan sanaydi
        Object.entries(raw || {}).forEach(([header, value]) => {
            const key = HEADER_INDEX.get(normalizeHeader(header));
            if (!key) {
                if (String(header || '').trim()) unknownHeaders.add(String(header).trim());
                return;
            }
            row[key] = typeof value === 'string' ? value.trim() : value;
        });
        return row;
    });
    return { rows, unknownHeaders: Array.from(unknownHeaders) };
};

const GENDER_MAP = {
    male: 'male', erkak: 'male', e: 'male', m: 'male',
    female: 'female', ayol: 'female', a: 'female', f: 'female', qiz: 'female',
};

const ROLE_ALIASES = { ADMIN: 'ADMINISTRATOR', RAHBAR: 'RAHBARIYAT', TUTOR: 'TYUTOR', STUDENT: 'TALABA' };

const normalizeRole = (raw) => {
    const v = String(raw ?? '').trim();
    if (!v) return 'TALABA';
    const upper = v.toUpperCase();
    if (ROLE_VALUES.includes(upper)) return upper;
    return ROLE_ALIASES[upper] || null;
};

// Fakultet nomini solishtirishga tayyorlash.
//
// NEGA KERAK: Excel va Word oddiy apostrofni (') AVTOMATIK ravishda egri
// apostrofga (’) almashtiradi. Ro'yxatda "Huquqni sohalararo o'rganish
// fakulteti" oddiy apostrof bilan yozilgan, foydalanuvchining faylida esa
// egrisi bo'ladi - va aynan mos kelishni talab qiladigan taqqoslash uni
// "noma'lum fakultet" deb rad etardi. Apostrofsiz to'rtta fakultet
// ishlaverardi, shuning uchun xato faqat ba'zi qatorlarda chiqib,
// tushunarsiz ko'rinardi.
//
// Ayni paytda ortiqcha bo'sh joy ham yig'iladi: qo'lda to'ldirilgan
// katakda ikki probel yoki oxiridagi probel odatiy hol.
const facultyKey = (v) => String(v ?? '')
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// Nomning oxiridagi "fakulteti" / "bo'limi" bo'lmasa ham tanilsin -
// ro'yxatdan ko'chirganda oxirgi so'z tushib qolishi mumkin.
const facultyStem = (v) => facultyKey(v).replace(/\s+(fakulteti|bo'limi)$/, '');

// ENG YAQIN NOMNI TAKLIF QILISH.
//
// NEGA: "noma'lum fakultet" xabari muammoni KO'RSATMAYDI. Faylda
// "soahalararo" deb yozilgan bo'lsa (a va h o'rin almashgan), odam uni
// ro'yxat bilan yonma-yon qo'yib ham darrov payqamaydi - men ham
// payqamadim va avval apostrofdan deb o'yladim. Endi tizim aynan qaysi
// nomni nazarda tutgan bo'lishi mumkinligini aytadi.
//
// TAKLIF XOLOS, avtomatik tuzatilmaydi: yaqin ikki nom bir-biriga
// almashib ketsa, talaba butunlay boshqa fakultetga yozilardi va buni
// hech kim sezmasdi. Qaror odamda.
const editDistance = (a, b) => {
    if (a === b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
        const cur = [i];
        for (let j = 1; j <= b.length; j += 1) {
            cur[j] = Math.min(
                prev[j] + 1,
                cur[j - 1] + 1,
                prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
        prev = cur;
    }
    return prev[b.length];
};

export const closestFaculty = (raw) => {
    const key = facultyKey(raw);
    if (key.length < 3) return null;

    // Nomning bir bo'lagi yozilgan bo'lsa ("Huquqni sohalararo") - masofa
    // katta chiqadi, chunki qolgan so'zlar yetishmaydi. Shuning uchun avval
    // ichki moslikni ko'ramiz. FAQAT BITTA nomga to'g'ri kelsa: ikkitasiga
    // to'g'ri kelsa qaysi biri ekani noma'lum va taklif chalg'itadi.
    if (key.length >= 8) {
        const inside = FACULTY_NAMES.filter(n => facultyKey(n).includes(key));
        if (inside.length === 1) return inside[0];
    }

    let best = null;
    let bestDist = Infinity;
    FACULTY_NAMES.forEach(n => {
        const d = editDistance(key, facultyKey(n));
        if (d < bestDist) { bestDist = d; best = n; }
    });
    // Chegara uzunlikka bog'liq: qisqa nomda ikki xato ko'p, uzunda kam.
    // 25% dan uzoq bo'lsa - bu boshqa nom, taklif qilish chalg'itadi.
    return bestDist <= Math.max(2, Math.round(key.length * 0.25)) ? best : null;
};

// Fakultet nomi to'liq yoziladi, lekin qisqartma (OH, JOS) ham qabul
// qilinadi. Qaytadi: nom | null (bo'sh) | undefined (noto'g'ri qiymat).
const normalizeFaculty = (raw) => {
    const v = String(raw ?? '').trim();
    if (!v) return null;

    const key = facultyKey(v);
    const exact = FACULTY_NAMES.find(n => facultyKey(n) === key);
    if (exact) return exact;

    const byCode = FACULTIES.find(f => f.code.toLowerCase() === key);
    if (byCode) return byCode.name;

    const stem = facultyStem(v);
    const byStem = FACULTY_NAMES.find(n => facultyStem(n) === stem);
    return byStem || undefined;
};

export const suggestImportPassword = () => {
    // O'qishga oson: bosh harf yo'q, adashtiradigan belgi yo'q (0/O, 1/l).
    const letters = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    let out = '';
    for (let i = 0; i < 5; i += 1) out += letters[Math.floor(Math.random() * letters.length)];
    for (let i = 0; i < 3; i += 1) out += digits[Math.floor(Math.random() * digits.length)];
    return out;
};

// Bitta qatorni tekshiradi.
//
// `existingUsernames` - bazada allaqachon bor loginlar (kichik harfda). Ular
// XATO EMAS: mavjud yozuv yangilanadi (parolga ham, rolga ham tegilmaydi),
// shuning uchun ular uchun parol ham, F.I.Sh. ham majburiy emas.
export const validateImportRow = (row, { existingUsernames = new Set(), seenInFile = new Set() } = {}) => {
    const errors = [];
    const warnings = [];

    const username = String(row.username ?? '').trim().toLowerCase();
    if (!username) errors.push("Login bo'sh");
    else if (!/^[a-z0-9._-]+$/.test(username)) {
        errors.push("Loginda faqat lotin harflari, raqam va . _ - bo'lishi mumkin");
    } else if (seenInFile.has(username)) {
        errors.push('Bu login faylda takrorlangan');
    }

    const isExisting = !!username && existingUsernames.has(username);

    const fullName = String(row.fullName ?? '').trim();
    if (!fullName && !isExisting) errors.push("F.I.Sh. bo'sh");

    const role = normalizeRole(row.role);
    if (role === null) errors.push(`Noma'lum rol: "${row.role}" (${ROLE_VALUES.join(', ')})`);

    let password = String(row.password ?? '').trim();
    if (!isExisting) {
        if (!password) {
            password = suggestImportPassword();
            warnings.push('Parol yozilmagan - avtomatik yaratildi');
        } else if (password.length < 6) {
            errors.push("Parol kamida 6 ta belgidan iborat bo'lishi kerak");
        }
    } else if (password) {
        // Mavjud foydalanuvchining paroli ATAYLAB o'zgartirilmaydi: import
        // faylida qolib ketgan eski parol odamni tizimdan chiqarib yuborishi
        // mumkin. Parolni almashtirish alohida, ataylab bajariladigan amal.
        password = '';
        warnings.push("Login mavjud - parol o'zgartirilmadi");
    }

    const faculty = normalizeFaculty(row.faculty);
    if (faculty === undefined) {
        const guess = closestFaculty(row.faculty);
        errors.push(
            `Noma'lum fakultet: "${row.faculty}"`
            + (guess ? ` — balki "${guess}"?` : '')
        );
    }

    let course = null;
    const rawCourse = row.course;
    if (rawCourse !== undefined && rawCourse !== null && String(rawCourse).trim() !== '') {
        const n = Number(String(rawCourse).replace(/[^0-9]/g, ''));
        if (!Number.isInteger(n) || n < 1 || n > 6) errors.push(`Kurs 1-6 oralig'ida bo'lishi kerak: "${rawCourse}"`);
        else course = n;
    }

    // TALABA uchun fakultet va kurs MAJBURIY. Ularsiz talaba Ma'rifat darsi
    // ro'yxatiga umuman tushmaydi (ro'yxat fakultet+kurs bo'yicha yig'iladi)
    // va fakultet cheklovlari unga ishlamaydi.
    if (role === 'TALABA') {
        if (!faculty && !isExisting) errors.push('Talaba uchun fakultet majburiy');
        if (course === null && !isExisting) errors.push('Talaba uchun kurs majburiy');
        if ((!faculty || course === null) && isExisting) {
            warnings.push("Fakultet yoki kurs bo'sh - mavjud qiymat saqlanib qoladi");
        }
    }

    let gender = null;
    const rawGender = String(row.gender ?? '').trim().toLowerCase();
    if (rawGender) {
        gender = GENDER_MAP[rawGender] || null;
        if (!gender) errors.push(`Jinsi "erkak" yoki "ayol" bo'lishi kerak: "${row.gender}"`);
    }

    const phone = String(row.phone ?? '').trim();
    if (phone && !/^[0-9+()\s-]{7,20}$/.test(phone)) {
        warnings.push("Telefon raqami g'alati ko'rinishda - o'zgartirilmay yoziladi");
    }

    const email = String(row.email ?? '').trim();
    if (email && !email.includes('@')) errors.push(`Email noto'g'ri: "${email}"`);

    return {
        line: row._line,
        ok: errors.length === 0,
        errors,
        warnings,
        isExisting,
        value: {
            username,
            fullName,
            password,
            role: role || 'TALABA',
            faculty: faculty || null,
            course,
            group: String(row.group ?? '').trim() || null,
            studentId: String(row.studentId ?? '').trim() || null,
            gender,
            phone: phone || null,
            email: email || null,
        },
    };
};

export const validateImportRows = (rows, { existingUsernames = new Set() } = {}) => {
    const seenInFile = new Set();
    const results = [];
    (rows || []).forEach(row => {
        const res = validateImportRow(row, { existingUsernames, seenInFile });
        if (res.value.username) seenInFile.add(res.value.username);
        results.push(res);
    });
    return {
        results,
        okCount: results.filter(r => r.ok).length,
        errorCount: results.filter(r => !r.ok).length,
        createCount: results.filter(r => r.ok && !r.isExisting).length,
        updateCount: results.filter(r => r.ok && r.isExisting).length,
    };
};

// ---------------------------------------------------------------------------
// SHABLON
//
// Ikki varaq: ma'lumot (bitta namuna qator bilan) va yo'riqnoma. Namuna qator
// ATAYLAB qoldirilgan - bo'sh jadval "bu yerga nima yozaman" degan savol
// tug'diradi, namunani o'chirish esa oson.
// ---------------------------------------------------------------------------
export const templateDataRows = () => ([
    {
        login: 'aliyev.sardor',
        fish: "Aliyev Sardor Alisher o'g'li",
        parol: '',
        rol: 'TALABA',
        fakultet: FACULTY_NAMES[0],
        kurs: 2,
        guruh: '201-guruh',
        talaba_id: '',
        jinsi: 'erkak',
        telefon: '+998901234567',
        email: 'sardor@example.com',
    },
]);

export const templateHelpRows = () => ([
    { Ustun: 'login', Majburiy: 'HA', Izoh: 'Faqat lotin harflari, raqam va . _ - belgilari. Tizimga kirish uchun ishlatiladi.' },
    { Ustun: 'fish', Majburiy: 'HA (yangi uchun)', Izoh: "To'liq ism-sharif." },
    { Ustun: 'parol', Majburiy: "YO'Q", Izoh: "Bo'sh qoldirsangiz avtomatik yaratiladi va natija faylida ko'rsatiladi. Kamida 6 belgi. Login mavjud bo'lsa parol O'ZGARTIRILMAYDI." },
    { Ustun: 'rol', Majburiy: "YO'Q", Izoh: `Bo'sh bo'lsa TALABA. Mumkin: ${ROLE_VALUES.join(', ')}.` },
    { Ustun: 'fakultet', Majburiy: 'Talaba uchun HA', Izoh: "Pastdagi ro'yxatdan aynan ko'chiring (qisqartma ham bo'ladi)." },
    { Ustun: 'kurs', Majburiy: 'Talaba uchun HA', Izoh: '1 dan 6 gacha raqam.' },
    { Ustun: 'guruh', Majburiy: "YO'Q", Izoh: 'Masalan: 201-guruh. Tyutor talabaga GURUH orqali biriktiriladi.' },
    { Ustun: 'talaba_id', Majburiy: "YO'Q", Izoh: 'HEMIS dagi talaba raqami.' },
    { Ustun: 'jinsi', Majburiy: "YO'Q", Izoh: 'erkak yoki ayol.' },
    { Ustun: 'telefon', Majburiy: "YO'Q", Izoh: 'Raqamli pasportga yoziladi.' },
    { Ustun: 'email', Majburiy: "YO'Q", Izoh: "Raqamli pasportga yoziladi. Tizimga kirish uchun EMAS - kirish login bilan." },
    { Ustun: '', Majburiy: '', Izoh: '' },
    { Ustun: 'MUHIM', Majburiy: '', Izoh: "Login allaqachon mavjud bo'lsa yangi foydalanuvchi yaratilmaydi - faqat bo'sh ma'lumotlari to'ldiriladi, paroli va roli tegilmaydi. Shuning uchun bitta faylni bir necha marta yuklash xavfsiz." },
    { Ustun: '', Majburiy: '', Izoh: '' },
    { Ustun: 'FAKULTETLAR', Majburiy: 'kod', Izoh: "to'liq nomi" },
    ...FACULTIES.map(f => ({ Ustun: '', Majburiy: f.code, Izoh: f.name })),
]);
