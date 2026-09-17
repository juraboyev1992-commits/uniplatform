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
// `maxUnits` - nechta eng katta birlik ko'rsatilsin. Sukut 3: bir yildan
// uzoq muddatda soniyalarni ko'rsatish o'qishni qiyinlashtiradi va har
// soniyada o'zgarib, ko'zni charchatadi. Muddat yaqinlashganda esa eng
// katta uchta birlik o'z-o'zidan soat/daqiqa/soniyaga aylanadi.
export const formatTimeLeft = (target, { now = Date.now(), maxUnits = 3, suffix = true } = {}) => {
    const ms = msLeft(target, now);
    if (ms === null) return null;
    if (ms <= 0) return "Muddat tugagan";

    const b = breakdown(ms);
    const parts = [];
    for (const key of ['year', 'day', 'hour', 'minute', 'second']) {
        if (parts.length >= maxUnits) break;
        // Boshidagi nollar tashlab yuboriladi ("0 yil 10 kun" emas), lekin
        // o'rtadagilari qoladi ("1 yil 0 kun 3 soat" emas, "1 yil 3 soat"
        // ham noto'g'ri bo'lardi - shuning uchun boshlangandan keyin
        // hammasi yoziladi).
        if (parts.length === 0 && b[key] === 0) continue;
        parts.push(`${b[key]} ${UNIT_LABELS[key]}`);
    }
    if (parts.length === 0) parts.push(`0 ${UNIT_LABELS.second}`);
    return parts.join(' ') + (suffix ? ' qoldi' : '');
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
