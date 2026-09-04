// ===========================================================================
// KLUB YUTUQLARI
//
// NIMA BU: klubning O'ZI qozongan yutuqlar va klub TARKIBIDAGILARNING
// yutuqlari. Ikkalasi ham klubning yuzi - talaba klub sahifasiga kirganda
// "bu klub nimaga erishgan" degan savolga javob izlaydi, va uning uchun
// klubning o'z sovrini ham, a'zosining sovrini ham bir xil javob beradi.
//
// IKKI MANBA:
//   ICHKI  - platformadagi rasmiy hujjatdan AVTOMATIK chiqadi. Musobaqa
//            yakunlanadi, bayonnoma tasdiqlanadi, diplom beriladi - yutuq
//            o'sha diplomdan tug'iladi. Qo'lda kiritilmaydi va tasdiqlash
//            ham kerak emas: hujjat allaqachon rasmiy.
//   TASHQI - universitetdan tashqarida qozonilgan yutuq. Koordinator
//            kiritadi, DALIL biriktiradi, administrator tasdiqlaydi.
//
// NEGA SHUNDAY: ichki yutuqni qo'lda kiritish ikki xil haqiqat yaratardi -
// reestrda bitta, klub sahifasida boshqa. Tashqi yutuqni esa platforma
// bilishning iloji yo'q, shuning uchun u odam so'ziga tayanadi va aynan
// shuning uchun dalil talab qilinadi.
// ===========================================================================
import { ACTIVITY_LEVELS, ACTIVITY_LEVEL_ORDER } from './activityLifecycle';

// --- KIMGA TEGISHLI ---
//
// Uchta emas, ko'proq bo'lishi mumkin edi, lekin bu uchtasi haqiqiy farqni
// ifodalaydi: yutuqni KIM qozongan.
export const ACHIEVEMENT_SCOPES = {
    club: {
        id: 'club',
        label: 'Klubning yutug\'i',
        hint: 'Klub jamoaviy ravishda qatnashgan va sovrin olgan',
    },
    team: {
        id: 'team',
        label: 'Jamoa yutug\'i',
        hint: 'Klub tarkibidagi jamoa qozongan',
    },
    member: {
        id: 'member',
        label: 'A\'zoning yutug\'i',
        hint: 'Klub a\'zosi shaxsan qozongan',
    },
};
export const ACHIEVEMENT_SCOPE_ORDER = ['club', 'team', 'member'];

// --- MANBA ---
export const ACHIEVEMENT_SOURCES = {
    internal: { id: 'internal', label: 'Platformadagi hujjat', needsReview: false },
    external: { id: 'external', label: 'Tashqi yutuq', needsReview: true },
};

// --- HOLAT (faqat tashqi yutuqlarda) ---
//
// Ichki yutuq holatga ega emas: u hujjatning O'ZI, ya'ni allaqachon
// tasdiqlangan. Unga "kutilmoqda" holatini berish ma'nosiz bo'lardi.
export const ACHIEVEMENT_STATUS = {
    pending: { id: 'pending', label: 'Tasdiqlash kutilmoqda', tone: 'warning' },
    approved: { id: 'approved', label: 'Tasdiqlangan', tone: 'success' },
    returned: { id: 'returned', label: 'Qaytarilgan', tone: 'info' },
    rejected: { id: 'rejected', label: 'Rad etilgan', tone: 'danger' },
};

// Klub sahifasida faqat shu holatdagilar ko'rinadi.
export const PUBLIC_ACHIEVEMENT_STATUS = 'approved';

// --- O'RIN ---
//
// 1-3 o'rin va "sovrindor bo'lmagan ishtirok" ajratilgan: keyingisi ham
// yutuq bo'lishi mumkin (xalqaro bosqichga chiqishning o'zi natija), lekin
// u o'rin emas va shunday ko'rsatilishi kerak.
export const ACHIEVEMENT_PLACES = {
    1: { id: 1, label: "1-o'rin", icon: '🥇', weight: 3 },
    2: { id: 2, label: "2-o'rin", icon: '🥈', weight: 2 },
    3: { id: 3, label: "3-o'rin", icon: '🥉', weight: 1 },
    0: { id: 0, label: 'Sovrinsiz ishtirok', icon: '🎖️', weight: 0 },
};
export const ACHIEVEMENT_PLACE_ORDER = [1, 2, 3, 0];

// --- DARAJA ---
//
// Yangi ro'yxat tuzilmadi: platformada tadbir darajalari allaqachon bor
// (fakultet → universitet → shahar → respublika → xalqaro) va yutuq ham
// aynan shu shkalada o'lchanadi. Ikkinchi nusxa tuzilsa, ular vaqt o'tib
// bir-biridan farq qila boshlardi.
export const ACHIEVEMENT_LEVELS = ACTIVITY_LEVELS;
export const ACHIEVEMENT_LEVEL_ORDER = [...ACTIVITY_LEVEL_ORDER].reverse();

export const placeLabel = (place) => ACHIEVEMENT_PLACES[place]?.label || 'Ishtirok';
export const placeIcon = (place) => ACHIEVEMENT_PLACES[place]?.icon || '🎖️';
export const levelLabel = (level) => ACHIEVEMENT_LEVELS[level]?.label || 'Daraja ko\'rsatilmagan';

// Tartiblash: avval daraja (xalqaro yuqorida), keyin o'rin, keyin sana.
// Klub sahifasida eng kuchli yutuq tepada turishi kerak - sanasi eskiroq
// bo'lsa ham. Xalqaro 2-o'rin fakultet 1-o'rinidan og'irroq.
export const achievementWeight = (a) => {
    const levelOrder = ACHIEVEMENT_LEVELS[a.level]?.order || 0;
    const placeWeight = ACHIEVEMENT_PLACES[a.place]?.weight ?? 0;
    return levelOrder * 10 + placeWeight;
};

export const sortAchievements = (rows) =>
    [...rows].sort((a, b) =>
        achievementWeight(b) - achievementWeight(a)
        || new Date(b.date || 0) - new Date(a.date || 0));

// Tashqi yutuqda majburiy maydonlar. Dalil ATAYLAB majburiy: dalilsiz
// yozuv - bu shunchaki da'vo, va uni tasdiqlovchi tekshira olmaydi.
export const validateExternalAchievement = (form) => {
    if (!String(form.title || '').trim()) return 'Musobaqa yoki tanlov nomini kiriting';
    if (!String(form.organizer || '').trim()) return 'Tashkilotchini kiriting';
    if (!ACHIEVEMENT_LEVELS[form.level]) return 'Darajani tanlang';
    if (form.place == null || !ACHIEVEMENT_PLACES[form.place]) return "O'rinni tanlang";
    if (!form.date) return 'Sanani kiriting';
    if (!ACHIEVEMENT_SCOPES[form.scope]) return 'Yutuq kimga tegishli ekanini tanlang';
    if (form.scope === 'team' && !form.teamId) return 'Jamoani tanlang';
    if (form.scope === 'member' && (form.studentIds || []).length === 0) {
        return "Yutuqni qozongan a'zoni tanlang";
    }
    if (!form.evidenceFileName) return 'Diplom yoki tasdiqlovchi hujjatni yuklang';
    return null;
};
