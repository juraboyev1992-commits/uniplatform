// ===========================================================================
// TESTLAR TAHLILI
//
// Testlar bo'yicha yagona ko'rsatkich "nechta urinish" edi. Undan test
// yaxshimi yoki yomonmi bilib bo'lmaydi. Bu yerda uch narsa o'lchanadi:
//
//   1. TESTNING SIFATI - o'tish foizi. Hamma yiqilgan test noto'g'ri
//      tuzilgan yoki savollari dasturga mos emas; hamma o'tgan test esa
//      hech narsani ajratmaydi.
//   2. TASHLAB KETILGAN URINISHLAR - boshlangan, lekin yakunlanmagan.
//      Ko'p bo'lsa - vaqt yetmayapti yoki test uzun.
//   3. POTOK KESIMI - o'zbek va rus guruhlari bir xil imkoniyatga egami.
//      Kitoblar va testlar potok bo'yicha ajratilgan, natijalar esa
//      solishtirilmagan edi.
//
// O'YLAB TOPILMAYDI: urinishi yo'q test "0% o'tish" emas, `null` - hali
// hech kim topshirmagan test yomon test degani emas.
// ===========================================================================
import { isReadingTest, isPassingAttempt, testPassPercent } from './socialActivityScoring';

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);

// ---------------------------------------------------------------------------
// TEST KESIMI
// ---------------------------------------------------------------------------
export const getTestPerformance = (db) => {
    const tests = db.getTests();
    const attempts = db.getTestAttempts();

    const byTest = new Map();
    attempts.forEach(a => {
        if (!byTest.has(a.testId)) byTest.set(a.testId, []);
        byTest.get(a.testId).push(a);
    });

    return tests
        .map(t => {
            const all = byTest.get(t.id) || [];
            const finished = all.filter(a => a.finishedAt);
            const passed = finished.filter(a => isPassingAttempt(a, t));
            const scores = finished
                .filter(a => Number(a.maxScore) > 0)
                .map(a => (Number(a.score) / Number(a.maxScore)) * 100);

            return {
                id: t.id,
                title: t.title,
                subject: t.subject || null,
                isReading: isReadingTest(t),
                book: isReadingTest(t) ? t.readingBook.title : null,
                language: isReadingTest(t) ? (t.readingBook.language || null) : null,
                passPercent: testPassPercent(t),
                attempts: all.length,
                finished: finished.length,
                abandoned: all.length - finished.length,
                students: new Set(all.map(a => a.studentId)).size,
                // Urinishi yo'q testda foiz YO'Q - nol emas.
                passRate: pct(passed.length, finished.length),
                averageScore: scores.length > 0
                    ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length)
                    : null,
            };
        })
        .sort((a, b) => b.attempts - a.attempts);
};

// ---------------------------------------------------------------------------
// UMUMIY RAQAMLAR
// ---------------------------------------------------------------------------
export const getTestOverview = (db) => {
    const rows = getTestPerformance(db);
    const attempted = rows.filter(r => r.finished > 0);

    const totals = rows.reduce((acc, r) => ({
        attempts: acc.attempts + r.attempts,
        finished: acc.finished + r.finished,
        abandoned: acc.abandoned + r.abandoned,
    }), { attempts: 0, finished: 0, abandoned: 0 });

    return {
        tests: rows.length,
        readingTests: rows.filter(r => r.isReading).length,
        untouched: rows.filter(r => r.attempts === 0).length,
        ...totals,
        abandonRate: pct(totals.abandoned, totals.attempts),
        // O'rtacha o'tish - faqat topshirilgan testlar bo'yicha.
        averagePassRate: attempted.length > 0
            ? Math.round(attempted.reduce((s, r) => s + r.passRate, 0) / attempted.length)
            : null,
        // Diqqat talab qiladiganlar: hech kim o'tmagan yoki hamma o'tgan.
        tooHard: attempted.filter(r => r.passRate !== null && r.passRate <= 20 && r.finished >= 5),
        tooEasy: attempted.filter(r => r.passRate === 100 && r.finished >= 5),
    };
};

// ---------------------------------------------------------------------------
// POTOK KESIMI
//
// Talabaning potoki pasportdagi "Ta'lim tili" maydonidan olinadi. Belgilanmagan
// talaba `null` guruhga tushadi va shu ochiq ko'rsatiladi - uni o'zbek potokka
// qo'shib yuborish raqamni buzardi.
// ---------------------------------------------------------------------------
export const getLanguageStreamStats = (db) => {
    const readingTests = new Map(db.getTests().filter(isReadingTest).map(t => [t.id, t]));
    const attempts = db.getTestAttempts().filter(a => readingTests.has(a.testId) && a.finishedAt);

    // Talaba tili bir marta aniqlanadi - har urinishda emas.
    const languageOf = new Map();
    const streamOf = (studentId) => {
        if (!languageOf.has(studentId)) {
            languageOf.set(studentId, db.getStudentTeachingLanguage(studentId) || 'belgilanmagan');
        }
        return languageOf.get(studentId);
    };

    const groups = new Map();
    const ensure = (key) => {
        if (!groups.has(key)) {
            groups.set(key, { language: key, attempts: 0, passed: 0, students: new Set(), books: new Set() });
        }
        return groups.get(key);
    };

    attempts.forEach(a => {
        const row = ensure(streamOf(a.studentId));
        const test = readingTests.get(a.testId);
        row.attempts++;
        row.students.add(a.studentId);
        if (isPassingAttempt(a, test)) {
            row.passed++;
            row.books.add(test.readingBook.title);
        }
    });

    // Har potok uchun mavjud kitoblar soni - imkoniyat tengmi degan savolga
    // javob. Tili belgilanmagan asar har ikkala potokda ko'rinadi.
    const available = { uz: 0, ru: 0 };
    readingTests.forEach(t => {
        const lang = t.readingBook.language;
        if (!lang || lang === 'uz') available.uz++;
        if (!lang || lang === 'ru') available.ru++;
    });

    return {
        available,
        rows: Array.from(groups.values())
            .map(r => ({
                language: r.language,
                attempts: r.attempts,
                passed: r.passed,
                students: r.students.size,
                booksPassed: r.books.size,
                passRate: pct(r.passed, r.attempts),
            }))
            .sort((a, b) => b.attempts - a.attempts),
    };
};

// ---------------------------------------------------------------------------
// KITOBLAR REYTINGI
// ---------------------------------------------------------------------------
export const getBookPopularity = (db) => {
    const readingTests = db.getTests().filter(isReadingTest);
    const attempts = db.getTestAttempts();

    const byTest = new Map();
    attempts.forEach(a => {
        if (!a.finishedAt) return;
        if (!byTest.has(a.testId)) byTest.set(a.testId, []);
        byTest.get(a.testId).push(a);
    });

    return readingTests
        .map(t => {
            const rows = byTest.get(t.id) || [];
            const passed = rows.filter(a => isPassingAttempt(a, t));
            return {
                id: t.id,
                title: t.readingBook.title,
                author: t.readingBook.author || null,
                language: t.readingBook.language || null,
                readers: new Set(rows.map(a => a.studentId)).size,
                passed: new Set(passed.map(a => a.studentId)).size,
                passRate: pct(passed.length, rows.length),
            };
        })
        .sort((a, b) => b.readers - a.readers);
};
