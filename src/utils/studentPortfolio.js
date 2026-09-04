// ===========================================================================
// TALABA PORTFOLIOSI
//
// Portfolio TUZILMAYDI - u allaqachon mavjud. Platformada talabaning butun
// yozuvi bor: GPA, ijtimoiy faollik indeksi, klub lavozimlari, musobaqa
// natijalari, berilgan hujjatlar, o'qilgan kitoblar, ishtirok qilgan
// tadbirlar. Bu funksiya ularni bir joyga yig'adi, xolos.
//
// SHU SABABLI U KUCHLI: har qatorning ortida tasdiqlangan yozuv turadi -
// ro'yxatga olish raqami bor hujjat, qulflangan davomat, tyutor tasdiqlagan
// baho. Talaba qo'lda yozgan CV'da bunday kafolat yo'q.
//
// IKKI TOIFA ATAYLAB AJRATILGAN:
//   `verified` - platformaning O'Z yozuvi. Talaba unga ta'sir qila olmaydi.
//   `uploaded` - talaba yuklagan tashqi hujjat. U ham qimmatli, lekin
//                ishonchlilik darajasi boshqa va shunday ko'rsatilishi kerak.
//
// Hech narsa to'qib chiqarilmaydi: ma'lumot yo'q bo'lsa maydon `null`
// qaytadi va ko'rinishda "kiritilmagan" deb yoziladi, nol emas.
// ===========================================================================
import { INDEX_CRITERIA } from '../config/socialActivityIndex';
import { getDocumentType, getDocumentTypeLabel } from '../config/documents';
import { POSITION_TYPE_LABELS } from '../services/db';
import {
    isReadingTest, isPassingAttempt, computeSocialActivityIndex,
} from './socialActivityScoring';

const safe = (fn, fallback = null) => {
    try { return fn(); } catch { return fallback; }
};

export const buildStudentPortfolio = (db, studentId) => {
    const student = db.getMockStudents().find(s => s.id === studentId)
        || (db.getSyncedProfiles() || []).find(p => p.id === studentId || p.username === studentId)
        || null;

    // --- AKADEMIK ---
    const gpa = safe(() => db.getStudentGPA(studentId));
    const gpaTrend = safe(() => db.getStudentGPATrend(studentId), { trend: 'unknown', records: [] });

    // --- IJTIMOIY FAOLLIK INDEKSI ---
    // Indeksning to'liq hisobi qimmat, shuning uchun faqat YAKUNIY raqam
    // olinadi. Mezonlar bo'yicha tafsilot o'z bo'limida.
    const index = safe(() => computeSocialActivityIndex(db, studentId));

    // --- KLUBLAR VA LAVOZIMLAR ---
    const involvement = safe(() => db.getUserClubInvolvement(studentId), []) || [];
    const clubs = involvement.map(i => ({
        clubId: i.clubId,
        name: i.club?.name || i.clubId,
        positions: (i.positions || []).map(p => POSITION_TYPE_LABELS[p] || p),
        hasPosition: i.hasPosition,
        manages: i.manages,
        joinedAt: i.joinedAt,
    }));

    // --- RASMIY HUJJATLAR ---
    // Faqat BERILGAN hujjatlar. Bekor qilingani portfolioga kirmaydi -
    // u endi haqiqiy emas.
    //
    // BOSQICH hujjatning o'zida yozilmaydi - u tadbir yoki musobaqaning
    // "Darajasi" maydonidan olinadi. Daraja belgilanmagan bo'lsa `null`
    // qoladi: uni "universitet" deb to'ldirish ma'lumot yo'qligini
    // yashirardi va stipendiya filtrida soxta natija berardi.
    const levelOfSource = (() => {
        const events = new Map((safe(() => db.getEvents(), []) || []).map(e => [String(e.id), e.level || null]));
        const comps = new Map((safe(() => db.getCompetitions(), []) || []).map(c => [String(c.id), c.level || null]));
        return (d) => {
            if (!d.sourceId) return null;
            return (d.sourceType === 'competition'
                ? comps.get(String(d.sourceId))
                : events.get(String(d.sourceId))) || null;
        };
    })();

    const documents = (db.getStudentDocuments(studentId) || [])
        .filter(d => d.status === 'issued')
        .map(d => ({
            id: d.id,
            title: d.activityName || getDocumentTypeLabel(d.documentType),
            documentType: d.documentType,
            typeLabel: getDocumentTypeLabel(d.documentType),
            group: getDocumentType(d.documentType)?.group || null,
            place: d.place == null ? null : Number(d.place),
            level: levelOfSource(d),
            date: d.issuedAt || d.createdAt || null,
            registrationNumber: d.registrationNumber || null,
            verificationToken: d.verificationToken || null,
        }))
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    const prizeCount = documents.filter(d => [1, 2, 3].includes(d.place)).length;

    // --- KITOBXONLIK ---
    const readingTests = db.getTests().filter(isReadingTest);
    const readBooks = readingTests.filter(t =>
        (db.getStudentTestAttempts(studentId, t.id) || []).some(a => isPassingAttempt(a, t))
    ).map(t => ({ title: t.readingBook.title, author: t.readingBook.author || null }));

    // --- ISHTIROK ---
    const attendance = safe(
        () => db.getAttendanceForParticipant(studentId).filter(a => a.status === 'present').length,
        0
    );

    // --- TALABA YUKLAGAN HUJJATLAR ---
    const uploaded = (db.getStudentDocs(studentId) || []).map(d => ({
        id: d.id, docType: d.docType, title: d.title,
        fileName: d.fileName, filePath: d.filePath,
        issuer: d.issuer || null, issuedAt: d.issuedAt || null,
        // Tashqi diplomda bosqich va o'rin talabaning DA'VOSI (yuklashda
        // kiritiladi), rasmiy hujjatda esa yozuvdan olinadi. Ikkalasi bir
        // ro'yxatda chiqadi, lekin manbasi ajratib ko'rsatiladi.
        level: d.level || null,
        place: d.place == null ? null : Number(d.place),
        createdAt: d.createdAt,
    }));

    return {
        student,
        academic: {
            gpa: gpa?.gpa ?? null,
            gpaYear: gpa?.academicYear || null,
            gpaSemester: gpa?.semester ?? null,
            trend: gpaTrend?.trend || 'unknown',
            history: gpaTrend?.records || [],
        },
        socialIndex: {
            total: index?.total ?? null,
            maxTotal: index ? 100 : null,
            // Baholanmagan mezonlar - portfolioda "hali to'liq emas" degan
            // haqiqatni yashirmaslik uchun.
            uncomputed: index
                ? (index.criteria || []).filter(c => c.points == null).length
                : null,
        },
        clubs,
        documents,
        counts: {
            documents: documents.length,
            prizes: prizeCount,
            clubs: clubs.length,
            positions: clubs.filter(c => c.hasPosition).length,
            books: readBooks.length,
            totalBooks: readingTests.length,
            attendance,
            uploaded: uploaded.length,
        },
        readBooks,
        uploaded,
        criteriaMax: INDEX_CRITERIA,
    };
};

// Stipendiya arizasi uchun: talabaning biriktirishga tayyor hujjatlari.
//
// IKKI MANBADAN: platformaning o'z hujjatlari (avtomatik, tasdiqlangan) va
// talaba yuklaganlari. Ariza formasi ikkalasini bir ro'yxatda ko'rsatadi -
// talaba uchun ular bir xil "mening hujjatim".
//
// HAR IKKALASI BIR SHAKLGA KELTIRILADI (`source`, `docType`, `level`,
// `place`) - shunda ariza formasi "universitet bosqichi, 1-o'rin" deb
// filtrlaganda ikkala manbani bir xil qidira oladi. Ilgari rasmiy hujjatda
// bosqich umuman yo'q edi va u filtrga tushmasdi.
export const buildApplicationAttachments = (db, studentId) => {
    const portfolio = buildStudentPortfolio(db, studentId);
    return {
        official: portfolio.documents.map(d => ({
            source: 'official',
            id: d.id,
            // Reyestrdagi diplom "qo'lga kiritilgan yutuq" me'zoniga tegishli -
            // talaba uni yuklamaydi, tizim bergan.
            docType: 'external_award',
            title: d.title,
            subtitle: d.typeLabel,
            level: d.level || null,
            place: d.place == null ? null : Number(d.place),
            date: d.date,
            registrationNumber: d.registrationNumber,
        })),
        uploaded: portfolio.uploaded.map(d => ({
            source: 'uploaded',
            id: d.id,
            docType: d.docType,
            title: d.title,
            subtitle: d.issuer || d.fileName,
            level: d.level || null,
            place: d.place == null ? null : Number(d.place),
            date: d.issuedAt || d.createdAt,
            filePath: d.filePath,
            fileName: d.fileName,
        })),
    };
};
