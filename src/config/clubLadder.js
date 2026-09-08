// KLUB ZINAPOYASI — a'zolikdan koordinatorlikka.
//
// NEGA KERAK: a'zolik hozir hech narsani ochmasdi. Talaba tugmani bosardi, "a'zo"
// bo'lardi va uning uchun hech narsa o'zgarmasdi. Zinapoya a'zolikka MA'NO beradi:
// u birinchi qadam, keyingisi esa ko'rinib turadi.
//
// TAMOYIL: tizim TEKSHIRADI, odam QAROR QILADI. Talablar arizani BLOKLAMAYDI -
// ular ikkala tomonga ko'rsatiladi (talabaga "nima qilsam ko'tarilaman", koordinatorga
// "bu nomzod qanday") va yakuniy qarorni koordinator yoki admin qabul qiladi.
// Shuning uchun bu yerda "ruxsat berilmadi" degan tushuncha yo'q, faqat "javob
// beradi / bermaydi".
//
// BALLGA ALOQASI YO'Q. A'zolik uchun ham, lavozim uchun ham ijtimoiy faollik bali
// berilmaydi. Rasmiy metodika (186-son buyruq) klub balini QATNASHUV bo'yicha
// o'lchaydi va bu ataylab - a'zolikka ball bog'lasak, talaba 10 ta klubga yozilib,
// hech qayerga bormay ball yig'gan bo'lardi.

// Ichki lavozimlar TENG turadi: ular turli ISHLAR, turli darajalar emas.
export const LADDER_STEPS = [
    {
        id: 'internal',
        label: 'Ichki lavozim',
        note: 'SMM, Media/Dizayn, Tadbir koordinatori, Volontyor — hammasi bir bosqichda',
        requires: ['attendancePercent', 'organizerCount'],
    },
    {
        id: 'assistant_coordinator',
        label: 'Yordamchi koordinator',
        requires: ['internalMonths', 'organizerCountAssistant'],
    },
    {
        id: 'head_coordinator',
        label: 'Asosiy koordinator',
        requires: ['assistantMonths'],
    },
];

// Boshlang'ich qiymatlar. HAR KLUB O'ZGARTIRA OLADI - yiliga 2 ta tadbir
// o'tkazadigan klub bilan har oy tadbir qiladigan klubga bir xil talab qo'yish
// noto'g'ri bo'lardi.
export const DEFAULT_LADDER = {
    attendancePercent: 70,        // klub tadbirlarining necha foizida qatnashgan
    organizerCount: 2,            // necha marta TASHKILOTCHI bo'lgan
    internalMonths: 6,            // ichki lavozimda necha oy
    organizerCountAssistant: 4,   // yordamchi uchun tashkilotchilik soni
    assistantMonths: 6,           // yordamchi koordinatorlikda necha oy
    // Klub shuncha tadbir o'tkazmaguncha FOIZ hisoblanmaydi.
    // Sabab metodikadan olingan (CLUB_ACTIVITY.defaultMinClubEvents): 1 ta tadbir
    // o'tkazgan klubda o'sha bitta tadbirga kelgan odam darrov 100% ga chiqib
    // qolardi. Bir xil muammo - bir xil yechim.
    minClubEvents: 2,
};

export const LADDER_FIELD_LABELS = {
    attendancePercent: 'Klub tadbirlarida qatnashuv',
    organizerCount: 'Tashkilotchi sifatida qatnashgan',
    internalMonths: 'Ichki lavozimda',
    organizerCountAssistant: 'Tashkilotchi sifatida qatnashgan',
    assistantMonths: 'Yordamchi koordinatorlikda',
    minClubEvents: "Foiz hisoblanishi uchun klub tadbirlari soni",
};

export const mergeLadder = (stored) => ({ ...DEFAULT_LADDER, ...(stored || {}) });

// Lavozim turi -> zinapoya bosqichi. Ichki lavozimlarning hammasi bitta bosqich.
export const stepForPosition = (positionTitle) => {
    if (positionTitle === 'head_coordinator') return 'head_coordinator';
    if (positionTitle === 'assistant_coordinator') return 'assistant_coordinator';
    return 'internal';
};
