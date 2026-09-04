// ===========================================================================
// KLUB NOMINI QISQARTIRISH
//
// Tor joylarda (analitika jadvali, teglar) uzun klub nomi qatorni buzadi.
//
// ILGARI qanday edi: ikkita faylda bir xil funksiya nusxasi turardi va
// ikkalasi ham TAXMIN qilardi - nomdan "klubi", "loyihasi", "markazi"
// so'zlarini kesib tashlab, qolganini uzunlik bo'yicha qirqardi. Natijada
// "Orator Academy va Munozara klubi" → "Orator Academ…" bo'lib qolardi.
//
// ENDI: klubning O'Z qisqa nomi bor (sozlamalarda kiritiladi). U bo'lsa
// aynan o'shanisi ishlatiladi - taxminga o'rin qolmaydi. Bo'lmasa eski
// qoida zaxira sifatida ishlaydi, lekin endi bitta joyda.
// ===========================================================================

// Nomga qo'shilib ketadigan, ma'no bermaydigan so'zlar.
const FILLER_WORDS = /\s*(klubi|klub|loyihasi|loyiha|markazi|ansambli|studiyasi|jamoasi)\b/gi;

export const shortenClubName = (club, maxLen = 14) => {
    // Ham obyekt, ham oddiy nom qabul qiladi: chaqiruv joylarining bir
    // qismida faqat nom mavjud (masalan lavozim yozuvidagi `clubName`).
    const explicit = typeof club === 'object' ? club?.shortName : null;
    if (explicit) return explicit;

    const name = typeof club === 'object' ? club?.name : club;
    if (!name) return '';

    const cleaned = String(name).replace(FILLER_WORDS, '').trim() || String(name);
    return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
};

// Nomlar bo'yicha qidirish uchun: klub obyektlaridan nom → qisqa nom
// jadvali. Jadvalda faqat NOM bo'lganda qisqa nomni topish uchun kerak.
export const buildShortNameIndex = (clubs = []) =>
    new Map(clubs.filter(c => c?.name).map(c => [c.name, c.shortName || null]));

export const shortenByName = (name, index, maxLen = 14) => {
    const explicit = index?.get(name);
    return explicit || shortenClubName(name, maxLen);
};
