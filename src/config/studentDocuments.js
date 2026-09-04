// ===========================================================================
// TALABA HUJJATLARI - STANDART TURLAR
//
// Bular talabaning O'ZI yuklaydigan TASHQI hujjatlari. Universitet bergan
// rasmiy hujjatlar (diplom, sertifikat, tashakkurnoma) bu yerda emas: ular
// `documents` jadvalida, ro'yxatga olish raqami va QR bilan, va ularni
// talaba yuklamaydi - tizim beradi.
//
// NEGA TAYYOR RO'YXAT: hujjat turi erkin matnda yozilsa, stipendiya
// arizasidagi "til sertifikati kerak" degan talab talabaning "IELTS"
// deb nomlagan faylini topa olmasdi. Tayyor turlar ikkalasini bog'laydi.
//
// Kalitlar `scholarships.js` dagi DEFAULT_DOC_TYPES bilan MOS: stipendiya
// arizasi o'sha kalitlar bilan ishlaydi va ikkinchi ro'yxat tuzilsa,
// ariza talabi bilan yuklangan hujjat bir-birini topa olmasdi.
// ===========================================================================
// DIQQAT: `IdCard`, `FileUser` va `MessageSquareQuote` bu kutubxona
// versiyasida YO'Q - ular o'rniga mavjud ikonkalar olingan. Yo'q nomni
// import qilish butun qurilishni to'xtatadi.
import {
    CreditCard, BookMarked, ScrollText, Quote, Languages,
    FileText, Award, Paperclip,
} from 'lucide-react';

export const STUDENT_DOC_TYPES = {
    passport: {
        key: 'passport', label: 'Pasport nusxasi', icon: CreditCard,
        hint: 'Pasportning shaxsiy ma\'lumotlar sahifasi',
        sensitive: true,
    },
    rating_book: {
        key: 'rating_book', label: 'Reyting daftarchasi', icon: BookMarked,
        hint: 'Semestrlar bo\'yicha baholar',
        // Platformada GPA bor, lekin rasmiy daftarcha nusxasi baribir
        // talab qilinishi mumkin - shuning uchun yuklash qoldiriladi.
        sensitive: false,
    },
    cv: {
        key: 'cv', label: "CV / Ob'ektivka", icon: ScrollText,
        hint: 'Platformadagi ma\'lumotlaringizdan avtomatik tuzilishi ham mumkin',
        sensitive: false,
    },
    recommendation: {
        key: 'recommendation', label: 'Tavsiyanoma', icon: Quote,
        hint: 'Koordinator, tyutor yoki ustoz imzosi bilan',
        sensitive: false,
    },
    language_cert: {
        key: 'language_cert', label: 'Til sertifikati', icon: Languages,
        hint: 'IELTS, TOEFL, CEFR va boshqalar',
        sensitive: false,
    },
    articles: {
        key: 'articles', label: 'Maqolalar', icon: FileText,
        hint: 'Nashr etilgan ilmiy maqola yoki tezis',
        sensitive: false,
    },
    // Tashqi yutuq - universitetdan tashqarida olingan diplom. Ijtimoiy
    // faollik indeksining 5-mezonida aynan shu ishlatiladi.
    //
    // `needsPlacement` - bu turdagi hujjatda BOSQICH va O'RIN so'raladi.
    // Sabab: platformadagi hujjatda ular yozuvda turadi (musobaqa darajasi,
    // yakuniy o'rin), tashqi hujjatda esa faqat talabaning o'zi ayta oladi.
    // Bu DA'VO - uni mas'ul hujjatga qarab tekshiradi.
    external_award: {
        key: 'external_award', label: 'Tashqi diplom yoki sertifikat', icon: Award,
        hint: 'Boshqa tashkilot o\'tkazgan tanlov, olimpiada yoki musobaqa',
        sensitive: false,
        needsPlacement: true,
    },
    other: {
        key: 'other', label: 'Boshqa hujjat', icon: Paperclip,
        hint: 'Ro\'yxatga tushmagan hujjat',
        sensitive: false,
    },
};

export const STUDENT_DOC_TYPE_ORDER = [
    'external_award', 'language_cert', 'articles', 'recommendation',
    'cv', 'rating_book', 'passport', 'other',
];

export const docTypeLabel = (key) => STUDENT_DOC_TYPES[key]?.label || key;
export const docTypeIcon = (key) => STUDENT_DOC_TYPES[key]?.icon || Paperclip;
export const isSensitiveDoc = (key) => !!STUDENT_DOC_TYPES[key]?.sensitive;

// Yuklash chegaralari. Hujjatlar rasm emas - PDF ham bo'ladi, shuning
// uchun chegara logodan kattaroq.
export const STUDENT_DOC_MAX_MB = 8;
export const STUDENT_DOC_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx';

export const validateStudentDoc = (file) => {
    if (!file) return 'Faylni tanlang';
    if (file.size > STUDENT_DOC_MAX_MB * 1024 * 1024) {
        return `Fayl hajmi ${STUDENT_DOC_MAX_MB} MB dan oshmasligi kerak`;
    }
    const ext = '.' + String(file.name || '').split('.').pop().toLowerCase();
    if (!STUDENT_DOC_ACCEPT.split(',').includes(ext)) {
        return `Ruxsat etilmagan format. Qabul qilinadi: ${STUDENT_DOC_ACCEPT}`;
    }
    return null;
};
