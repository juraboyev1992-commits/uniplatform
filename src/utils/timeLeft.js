// MUDDATGACHA QOLGAN VAQT - bitta manba.
//
// Ilgari har bo'lim o'zicha hisoblardi va faqat KUN aniqligida:
// `opportunityMatching.js` da `Math.ceil((end - now) / 86400000)`,
// `AdminOverviewInsights` va `TalentIdpTab` da alohida "N kun qoldi",
// `db.js` da ro'yxatdan o'tish uchun yana bittasi. Natijada bir xil muddat
// ikki ekranda bir kun farq bilan ko'rinishi mumkin edi (biri yaxlitlaydi,
// biri kesadi).
//
// Bu yerda hisob BIR MARTA yozilgan va u soniyagacha aniq.

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// Yil = 365 kun. ATAYLAB soddalashtirilgan: kabisa yilini hisobga olish
// "1 yil 10 kun" degan matnni bir kunga aniqroq qiladi, lekin hech kim buni
// sezmaydi. Muhimi - bir xil muddat hamma ekranda BIR XIL ko'rinsin.
const YEAR = 365 * DAY;

export const UNIT_LABELS = {
    year: 'yil',
    day: 'kun',
    hour: 'soat',
    minute: 'daqiqa',
    second: 'soniya',
};

// Muddatgacha necha millisekund qolgani. O'tib ketgan bo'lsa manfiy,
// noto'g'ri yoki bo'sh sana bo'lsa `null` - NOL EMAS: nol "hozir tugadi"
// degani, `null` esa "muddat belgilanmagan".
export const msLeft = (target, now = Date.now()) => {
    if (!target) return null;
    const t = target instanceof Date ? target.getTime() : new Date(target).getTime();
    if (Number.isNaN(t)) return null;
    return t - now;
};

// Millisekundni birliklarga ajratish.
export const breakdown = (ms) => {
    const abs = Math.max(0, Math.abs(ms));
    return {
        year: Math.floor(abs / YEAR),
        day: Math.floor((abs % YEAR) / DAY),
        hour: Math.floor((abs % DAY) / HOUR),
        minute: Math.floor((abs % HOUR) / MINUTE),
        second: Math.floor((abs % MINUTE) / SECOND),
    };
};

// "1 yil 10 kun 3 soat" ko'rinishidagi matn.
//
// Muddatni birliklarga ajratib, TAYYOR QISMLAR ro'yxatini beradi:
// [{ key: 'day', value: 296, label: 'kun' }, ...]. Matn emas, qismlar
// qaytarilishining sababi - ko'rsatishda har birlikni alohida bezash kerak
// (raqam yo'g'on, birlik nomi ochroq, soniya alohida ajralib tursin).
//
// `maxUnits` - nechta eng katta birlik. Sukut 5, ya'ni to'liq:
// "296 kun 4 soat 23 daqiqa 36 soniya". Ilgari 3 edi va uzoq muddatda
// soniya butunlay tushib qolardi - ekranda raqam qimirlamagani uchun sanoq
// ishlamayotganday ko'rinardi.
//
// `null` - muddat belgilanmagan. Bo'sh ro'yxat - muddat o'tib ketgan.
export const timeLeftParts = (target, { now = Date.now(), maxUnits = 5 } = {}) => {
    const ms = msLeft(target, now);
    if (ms === null) return null;
    if (ms <= 0) return [];

    const b = breakdown(ms);
    const parts = [];
    for (const key of ['year', 'day', 'hour', 'minute', 'second']) {
        if (parts.length >= maxUnits) break;
        // Boshidagi nollar tashlab yuboriladi ("0 yil 10 kun" emas), lekin
        // o'rtadagilari qoladi: "1 yil 3 soat" degan yozuv "0 kun" ni
        // yashirib, muddatni noto'g'ri ko'rsatgan bo'lardi.
        if (parts.length === 0 && b[key] === 0) continue;
        parts.push({ key, value: b[key], label: UNIT_LABELS[key] });
    }
    if (parts.length === 0) parts.push({ key: 'second', value: 0, label: UNIT_LABELS.second });
    return parts;
};

// O'sha qismlarning oddiy matn ko'rinishi - bezaksiz joylar uchun.
export const formatTimeLeft = (target, options = {}) => {
    const { suffix = true } = options;
    const parts = timeLeftParts(target, options);
    if (parts === null) return null;
    if (parts.length === 0) return "Muddat tugagan";
    return parts.map(p => `${p.value} ${p.label}`).join(' ') + (suffix ? ' qoldi' : '');
};

// Muddat qanchalik yaqin - rang tanlash uchun.
export const urgencyOf = (target, now = Date.now()) => {
    const ms = msLeft(target, now);
    if (ms === null) return 'none';
    if (ms <= 0) return 'passed';
    if (ms <= DAY) return 'critical';
    if (ms <= 7 * DAY) return 'soon';
    return 'normal';
};

// ---------------------------------------------------------------------------
// UMUMIY TIKER
//
// Har countdown o'z `setInterval` ini ochsa, bitta sahifada o'nlab taymer
// paydo bo'ladi va ular bir-biridan yarim soniya farq bilan yangilanib,
// raqamlar "sakraydi". Bu yerda BITTA interval bor: obunachi qolmasa u
// to'xtaydi, ya'ni ochiq sahifa bo'sh turganda ham ishlab yotmaydi.
// ---------------------------------------------------------------------------
const listeners = new Set();
let timer = null;

const tick = () => {
    const now = Date.now();
    listeners.forEach(fn => {
        try { fn(now); } catch { /* bitta obunachi yiqilsa qolganlari ishlayversin */ }
    });
};

export const subscribeTick = (fn) => {
    listeners.add(fn);
    if (!timer) timer = setInterval(tick, SECOND);
    return () => {
        listeners.delete(fn);
        if (listeners.size === 0 && timer) {
            clearInterval(timer);
            timer = null;
        }
    };
};
