// ===========================================================================
// SAVOL SIFATI VA ALMASHTIRISH TAVSIYASI
//
// Savol yaxshimi yoki yomonmi - buni faqat TALABALARNING JAVOBLARI aytadi.
// Bu yerdagi qoidalar aynan shu javoblardan chiqadi.
//
// CHEGARALAR O'YLAB TOPILGAN EMAS, LEKIN METODIKADAN HAM EMAS: metodikada
// savol sifati haqida hech narsa yozilmagan. Ular test tuzish amaliyotidan
// olingan universitet qarori va shuning uchun BITTA joyda, ochiq turadi -
// kerak bo'lsa o'zgartiriladi.
//
// TAVSIYA MAJBURLAMAYDI. Tizim savolni o'zi almashtirmaydi va o'chirmaydi -
// u faqat "buni ko'rib chiqing" deydi. Qaror savol muallifida: ba'zan
// hamma to'g'ri javob beradigan savol ataylab shunday tuzilgan bo'ladi.
// ===========================================================================

export const QUESTION_QUALITY = {
    // Ishonchli xulosa uchun kerakli eng kam javob soni. Bundan kam bo'lsa
    // foiz tasodifiy chiqadi: 2 ta javobning 1 tasi to'g'ri bo'lsa "50%"
    // deb ko'rsatish aldash bo'lardi.
    minAnswersForVerdict: 10,

    // Hamma to'g'ri javob beradigan savol HECH KIMNI AJRATMAYDI - u test
    // natijasiga ta'sir qilmaydi va o'rin egallaydi.
    tooEasyPercent: 95,

    // Deyarli hech kim to'g'ri javob bermasa, ikki ehtimol bor va ikkalasi
    // ham ko'rib chiqishni talab qiladi: savol dasturdan tashqarida yoki
    // JAVOB KALITI XATO. Ikkinchisi ko'proq uchraydi.
    tooHardPercent: 15,

    // Bir savol juda ko'p chiqsa, u talabalar orasida tarqaladi.
    overusedShownCount: 100,
};

// Tavsiya turlari. Har biri NIMA QILISH kerakligini aytadi - "yomon savol"
// deb qo'ya qolish foydalanuvchini nima qilishni bilmay qoldirardi.
export const QUESTION_VERDICTS = {
    ok: {
        id: 'ok', label: 'Yaxshi', tone: 'success', priority: 0,
        hint: 'Savol talabalarni ajratib turibdi',
    },
    unused: {
        id: 'unused', label: 'Ishlatilmagan', tone: 'default', priority: 1,
        hint: 'Bu savol hali hech kimga chiqmagan — uning sifati noma\'lum',
    },
    tooFew: {
        id: 'tooFew', label: "Ma'lumot kam", tone: 'default', priority: 1,
        hint: 'Xulosa chiqarish uchun javoblar yetarli emas',
    },
    tooEasy: {
        id: 'tooEasy', label: 'Juda oson', tone: 'warning', priority: 2,
        hint: 'Deyarli hamma to\'g\'ri javob beradi — savol hech kimni ajratmaydi, murakkablashtiring yoki almashtiring',
    },
    overused: {
        id: 'overused', label: "Ko'p ishlatilgan", tone: 'warning', priority: 3,
        hint: 'Savol juda ko\'p marta chiqqan — javobi tarqalgan bo\'lishi mumkin, almashtiring',
    },
    tooHard: {
        id: 'tooHard', label: 'Juda qiyin', tone: 'danger', priority: 4,
        hint: 'Deyarli hech kim to\'g\'ri javob bermayapti — javob kaliti xato bo\'lishi mumkin, tekshiring',
    },
};

// Savolga BITTA xulosa beriladi - eng muhimi. Bir vaqtda "juda qiyin" ham,
// "ko'p ishlatilgan" ham bo'lishi mumkin, lekin ikkita belgi qatorda
// shovqin yaratardi va qaysi biri muhimligi ko'rinmasdi.
export const verdictFor = (usage) => {
    if (!usage || usage.shown === 0) return QUESTION_VERDICTS.unused;
    if (usage.shown < QUESTION_QUALITY.minAnswersForVerdict) return QUESTION_VERDICTS.tooFew;
    if (usage.correctRate <= QUESTION_QUALITY.tooHardPercent) return QUESTION_VERDICTS.tooHard;
    if (usage.shown >= QUESTION_QUALITY.overusedShownCount) return QUESTION_VERDICTS.overused;
    if (usage.correctRate >= QUESTION_QUALITY.tooEasyPercent) return QUESTION_VERDICTS.tooEasy;
    return QUESTION_VERDICTS.ok;
};

// Almashtirish tavsiya qilinadigan xulosalar.
export const NEEDS_ATTENTION = ['tooEasy', 'tooHard', 'overused'];

export const needsAttention = (verdict) => NEEDS_ATTENTION.includes(verdict?.id);
