// "Ijtimoiy faollik indeksi"ni hisoblash.
//
// Qoida `config/socialActivityIndex.js` da (rasmiy metodika), hisoblash bu yerda,
// ma'lumot esa o'z joyida qoladi. Mavjud jadval, funksiya va bog'lanishlarga
// tegilmaydi - bu qatlam faqat O'QIYDI.
//
// IKKI QAT'IY QOIDA:
//
// 1. HECH NARSA O'YLAB TOPILMAYDI. Manba yo'q bo'lsa mezon `points: null`
//    bo'ladi va interfeysda "ma'lumot yo'q" deb ko'rsatiladi - 0 ball EMAS.
//    "Nol ball oldi" bilan "hali hisoblanmagan" butunlay boshqa narsa, va
//    ularni aralashtirish talabaga nisbatan adolatsizlik bo'lardi.
//
// 2. HAR MEZON O'Z SHIPIGA URIB TURADI. Metodikada har mezonning maksimali
//    qat'iy, jami esa 100. Ilgari ledger shunchaki qo'shib ketardi.

import {
    INDEX_CRITERIA, INDEX_CRITERIA_ORDER, INDEX_TOTAL_MAX,
    DISCIPLINARY_MAX_DEDUCTION, capCriterionPoints,
    gpaToPoints, booksToPoints, placementToPoints, clubPercentToPoints,
    disciplinePoints, DISCIPLINE_PARTS, DISCIPLINE_PART_ORDER,
    missedHoursToPoints, educationAttendanceToPoints, MARIFAT,
    INITIATIVE_KEYS, initiativePoints,
} from '../config/socialActivityIndex.js';

// Mezon natijasining yagona shakli. `points: null` = hisoblab bo'lmadi.
const result = (key, points, { detail = null, sourceLabel = null, missing = null } = {}) => ({
    key,
    name: INDEX_CRITERIA[key].name,
    maxPoints: INDEX_CRITERIA[key].maxPoints,
    source: INDEX_CRITERIA[key].source,
    points: points == null ? null : capCriterionPoints(key, points),
    detail,
    sourceLabel,
    // Nima yetishmayotgani - talabaga "nima qilishim kerak" deb aytish uchun.
    missing,
});

// ---------------------------------------------------------------------------
// 3-mezon: AKADEMIK O'ZLASHTIRISH (GPA)
//
// Metodika: platforma HEMIS ga ulanadi, ball har semestr yakunida avtomatik
// qo'yiladi. Bizda GPA `academic_records` da - qo'lda yoki HEMIS orqali
// kiritiladi. Yozuv bo'lmasa GPA `null` qaytadi va biz ham `null` qaytaramiz.
// ---------------------------------------------------------------------------
export const scoreAcademic = (db, studentId, { academicYear = null } = {}) => {
    // O'QUV YILI bo'yicha, butun o'qish davri bo'yicha EMAS. Metodika indeksni
    // "har o'quv yilining yakuni bo'yicha" baholaydi - oldingi kurslardagi past
    // baho bu yilgi ballni pasaytirmasligi kerak.
    const year = db.getStudentYearGPA(studentId, academicYear);
    if (!year) {
        return result('ACADEMIC', null, {
            missing: 'Shu o\'quv yili uchun GPA kiritilmagan (HEMIS yoki qo\'lda)',
        });
    }
    const points = gpaToPoints(year.gpa);
    return result('ACADEMIC', points, {
        detail: year,
        sourceLabel: `GPA ${year.gpa}`
            + (year.semesters > 1 ? ` (${year.semesters} semestr o'rtachasi)` : '')
            + (year.sources.includes('hemis') ? ' · HEMIS' : ''),
    });
};

// ---------------------------------------------------------------------------
// 1-mezon: KITOBXONLIK MADANIYATI
//
// Metodika: 100 ta eng sara badiiy adabiyot ro'yxati platformaga joylashtiriladi,
// HAR ASAR bo'yicha test tuziladi, talaba testdan o'tsa avtomatik ball oladi.
//
// MUHIM: test bo'limi faqat kitobxonlik uchun emas. U yerda huquq, matematika,
// IT va boshqa fanlardan ham testlar bor va ular bu mezonga UMUMAN kirmaydi.
// Faqat "kitobxonlik testi" deb belgilangan va aniq bir asarga biriktirilgan
// testlar hisoblanadi.
//
// Ball KITOB soniga qarab beriladi, test soniga emas - bir asarni qayta
// topshirish sonni oshirmaydi.
// ---------------------------------------------------------------------------
export const READING_DEFAULT_PASS_PERCENT = 60;

export const isReadingTest = (test) => !!(test?.isReadingTest && test?.readingBook?.title);

export const testPassPercent = (test) =>
    Number(test?.passPercent) > 0 ? Number(test.passPercent) : READING_DEFAULT_PASS_PERCENT;

export const isPassingAttempt = (attempt, test) => {
    if (!attempt?.finishedAt) return false;
    const max = Number(attempt.maxScore) || 0;
    if (max <= 0) return false;
    return (Number(attempt.score) / max) * 100 >= testPassPercent(test);
};

export const scoreReading = (db, studentId, { academicYear = null } = {}) => {
    const tests = db.getTests().filter(isReadingTest);
    if (tests.length === 0) {
        return result('READING', null, {
            missing: 'Kitobxonlik testlari hali yaratilmagan',
        });
    }

    const testById = new Map(tests.map(t => [t.id, t]));
    const attempts = db.getStudentTestAttempts(studentId)
        .filter(a => testById.has(a.testId));

    // Bir kitob - bir marta. Kalit sifatida asar nomi olinadi, chunki bir
    // asarga bir necha test tuzilgan bo'lishi mumkin.
    const passedBooks = new Set();
    attempts.forEach(a => {
        const test = testById.get(a.testId);
        if (!isPassingAttempt(a, test)) return;
        if (academicYear && a.academicYear && a.academicYear !== academicYear) return;
        passedBooks.add(String(test.readingBook.title).trim().toLowerCase());
    });

    const count = passedBooks.size;
    return result('READING', booksToPoints(count), {
        detail: { booksPassed: count, availableTests: tests.length },
        sourceLabel: `${count} ta asar bo'yicha testdan o'tilgan`,
        missing: count < 4 ? `Ball uchun kamida 4 ta asar kerak (hozir ${count} ta)` : null,
    });
};

// ---------------------------------------------------------------------------
// 5-mezon: KO'RIK-TANLOV, OLIMPIADA VA SPORT MUSOBAQALARI
//
// Metodika: ball BOSQICH × O'RIN bo'yicha, asoslovchi hujjat (diplom/sertifikat)
// asosida. Bosqich kalitlari musobaqa yaratishdagi "Darajasi" maydoni bilan
// bir xil, shuning uchun qo'shimcha moslashtirish kerak emas.
//
// Manba - HUJJAT REYESTRI: berilgan diplomda ham o'rin, ham musobaqa bor.
// Talabaning arizasi emas, chunki hujjat rasmiy va uni tizimning o'zi bergan.
//
// Metodikaning "faqat vazirlik ro'yxatidagi tanlovlar" sharti hozircha
// TEKSHIRILMAYDI - platformada bunday ro'yxat yo'q. Bu ochiq soddalashtirish,
// yashirilmaydi: natijada `officialListChecked: false` qaytadi.
// ---------------------------------------------------------------------------
export const scoreCompetitions = (db, studentId, { academicYear = null } = {}) => {
    // IKKI MANBA.
    //
    // 1. Platformaning O'ZI bergan hujjat - tasdiq talab qilmaydi, chunki uni
    //    tizim bayonnoma asosida bergan.
    // 2. Talaba yuklagan TASHQI hujjat - respublika olimpiadasi, xalqaro
    //    tanlov. Bunday natijalar platformada yo'q, shuning uchun ularsiz
    //    metodikaning asosiy qismi ishlamay qolardi. Faqat tyutor QABUL
    //    QILGAN hujjat hisobga olinadi.
    const candidates = [];

    (db.getStudentDocuments(studentId) || [])
        .filter(d => d.status === 'issued' && [1, 2, 3].includes(Number(d.place)))
        .forEach(d => {
            const protocol = d.protocolId ? db.getProtocolById(d.protocolId) : null;
            const level = protocol
                ? db.getActivityMeta(protocol.activityId, protocol.activityType).level
                : null;
            if (!level) return;
            const points = placementToPoints(level, d.place);
            if (points == null) return;
            candidates.push({
                points, level, place: Number(d.place),
                origin: 'internal', documentId: d.id,
            });
        });

    const external = db.getIndexEvidence
        ? db.getIndexEvidence(studentId, 'COMPETITIONS', academicYear)
        : [];
    external.filter(e => e.status === 'accepted' && e.claim?.level).forEach(e => {
        const points = placementToPoints(e.claim.level, e.claim.place);
        if (points == null) return;
        candidates.push({
            points, level: e.claim.level, place: Number(e.claim.place),
            origin: 'external', evidenceId: e.id, title: e.title,
            acceptedBy: e.reviewedBy,
        });
    });

    // Kutilayotgan hujjat "ball yo'q" degani emas, "hali ko'rilmagan" degani.
    const waiting = external.filter(e => ['pending', 'returned'].includes(e.status));

    if (candidates.length === 0) {
        return result('COMPETITIONS', null, {
            detail: { officialListChecked: false, waiting, external },
            missing: waiting.length > 0
                ? `${waiting.length} ta hujjat ko'rib chiqilmoqda`
                : 'Sovrinli o\'rin uchun rasmiy hujjat topilmadi',
        });
    }

    // Eng yuqori ball beradigan natija olinadi - metodikada natijalarni
    // QO'SHISH qoidasi yo'q. Ya'ni uchta diplom uchta ball bermaydi.
    const best = candidates.reduce((a, b) => (b.points > a.points ? b : a));

    return result('COMPETITIONS', best.points, {
        detail: { ...best, officialListChecked: false, candidates, waiting, external },
        sourceLabel: `${INDEX_CRITERIA.COMPETITIONS.placement[best.level].label}, ${best.place}-o'rin`
            + (best.origin === 'external' ? ' (tashqi hujjat)' : ''),
    });
};

// ---------------------------------------------------------------------------
// 2-mezon: 5 MUHIM TASHABBUS TO'GARAKLARIDA FAOL ISHTIROK
//
// Ball birligi - YO'NALISH. Har yo'nalish 10 ballgacha, jami 20 bilan
// chegaralangan. Shu sabab "talaba 10 klubning 40 ta tadbirida qatnashsa nima
// bo'ladi" degan savol o'z-o'zidan hal bo'ladi: yig'indi baribir 20 dan
// oshmaydi, uchinchi yo'nalish esa qo'shimcha ball bermaydi.
//
// Ikki manba:
//   1. Asosiy koordinatorlik -> 20 ball (metodikaning "to'garak tashkil etgan"
//      bandi; universitet qaroriga ko'ra koordinatorga qo'llanadi)
//   2. Yo'nalishlar bo'yicha davomat -> har biri 10 ballgacha
//
// Koordinatorlik yolg'iz o'zi maksimal ballni beradi, shuning uchun u birinchi
// tekshiriladi - keraksiz hisob qilinmaydi.
//
// Koordinator bahosi (`socialIndexAssessments`) HAR DOIM ustun turadi:
// metodikada ball "to'garak rahbarining ma'lumotnomasi asosida" beriladi, ya'ni
// oxirgi so'z odamda.
// ---------------------------------------------------------------------------
export const scoreClubs = (db, studentId, { academicYear = null } = {}) => {
    // Koordinator qo'lda baho qo'ygan bo'lsa - o'sha.
    const manual = db.getSocialIndexAssessment
        ? db.getSocialIndexAssessment(studentId, 'CLUBS', academicYear)
        : null;
    if (manual && manual.points != null) {
        return result('CLUBS', manual.points, {
            detail: { manual: true, assessedBy: manual.assessedBy, comment: manual.comment },
            sourceLabel: manual.assessedBy ? `Baholadi: ${manual.assessedBy}` : 'Qo\'lda baholangan',
        });
    }

    const headClubs = db.getStudentHeadCoordinatorClubs
        ? db.getStudentHeadCoordinatorClubs(studentId)
        : [];
    if (headClubs.length > 0) {
        return result('CLUBS', INDEX_CRITERIA.CLUBS.founderPoints, {
            detail: { headCoordinatorOf: headClubs.map(c => c.name) },
            sourceLabel: `Asosiy koordinator: ${headClubs.map(c => c.name).join(', ')}`,
        });
    }

    const directions = db.getClubDirections ? db.getClubDirections() : {};
    if (Object.keys(directions).length === 0) {
        return result('CLUBS', null, {
            missing: 'Klublarga "5 tashabbus yo\'nalishi" belgilanmagan',
        });
    }

    const { perClub, byDirection, minEvents } = db.getStudentClubDirectionActivity(studentId, academicYear);

    const perDirection = INDEX_CRITERIA.CLUBS.directions
        .map(d => {
            const best = byDirection[d.key];
            if (!best) return null;
            return {
                key: d.key,
                label: d.label,
                clubName: best.clubName,
                attended: best.attended,
                held: best.held,
                percent: best.percent,
                points: clubPercentToPoints(best.percent),
            };
        })
        .filter(Boolean);

    if (perDirection.length === 0) {
        // Qatnashuv bor, lekin klublar kam tadbir o'tkazgan bo'lishi mumkin -
        // buni "qatnashmagan" deb ko'rsatish noto'g'ri bo'lardi.
        const partial = perClub.filter(c => !c.enoughEvents);
        return result('CLUBS', null, {
            detail: { perClub, minEvents },
            missing: partial.length > 0
                ? `Klublar hisobot davrida kamida ${minEvents} ta tadbir o'tkazmagan`
                : 'Klub tadbirlarida qatnashuv qayd etilmagan',
        });
    }

    // Eng yuqori ball beruvchi yo'nalishlar oldinda - ship 20 ga urganda
    // talabaning eng kuchli tomonlari hisobga olinsin.
    perDirection.sort((a, b) => b.points - a.points);
    const total = perDirection.reduce((s, d) => s + d.points, 0);

    return result('CLUBS', total, {
        detail: { perDirection, perClub, minEvents },
        sourceLabel: perDirection
            .map(d => `${d.clubName} — ${d.held} ta tadbirdan ${d.attended} tasi (${d.percent}%)`)
            .join('; '),
    });
};

// ---------------------------------------------------------------------------
// 4-mezon: ICHKI TARTIB VA ODOB-AXLOQ
//
// Metodikaning mantig'i teskari: bu to'planadigan emas, KAFOLATLANGAN ball.
//   "Talabaning dresskod qoidalarini buzmasligi ... maksimal ball olishini
//    KAFOLATLAYDI"
//
// Shuning uchun boshlang'ich qiymat - to'liq 5 ball, va u faqat qayd etilgan
// buzilish uchun kamayadi. Yozuvi yo'q talaba to'liq ballga ega bo'ladi va
// bu `null` EMAS: "ma'lumot yo'q" degani bu yerda "qoidani buzmagan" degani,
// chunki qayd etish faqat buzilganda bo'ladi.
//
// Har qism alohida hisoblanadi: dresskodni bir necha marta buzish odob-axloq
// balini yeb qo'ymaydi.
// ---------------------------------------------------------------------------
export const scoreDiscipline = (db, studentId, { academicYear = null } = {}) => {
    const violations = db.getDisciplineViolations(studentId, academicYear);
    const deductions = db.getDisciplineDeductions();
    const points = disciplinePoints(violations, deductions);

    const perPart = DISCIPLINE_PART_ORDER.map(key => {
        const part = DISCIPLINE_PARTS[key];
        const count = violations.filter(v => v.type === key).length;
        const per = Number(deductions[key] ?? part.defaultDeduction) || 0;
        return {
            key, label: part.label, maxPoints: part.maxPoints, count,
            deducted: Math.min(part.maxPoints, count * per),
            points: Math.max(0, part.maxPoints - count * per),
        };
    });

    return result('DISCIPLINE', points, {
        detail: { perPart, violations, deductions },
        sourceLabel: violations.length === 0
            ? 'Buzilish qayd etilmagan'
            : `${violations.length} ta buzilish qayd etilgan`,
    });
};

// ---------------------------------------------------------------------------
// 6-mezon: DARSLARGA TO'LIQ, KECHIKMASDAN KELISHI
//
// DIQQAT: bu DARS davomati, TADBIR davomati EMAS. Platformadagi
// `activity_attendance` klub va tadbir davomati - u 2-mezonga ishlaydi va bu
// yerga UMUMAN aloqasi yo'q. Ikkisini aralashtirib yuborish talabaga tadbirga
// borgani uchun dars bali berardi.
//
// Manba: `academic_records.data.missedHours` - HEMIS ulanganda avtomatik,
// hozircha tyutor kiritadi.
//
// SEMESTRDAN YILGA. Metodika ballni SEMESTR kesimida beradi, indeks esa
// YILLIK. Bu yerda hujjatda qoida yo'q, shuning uchun universitet qarori:
// har semestr alohida baholanadi, keyin ballarning O'RTACHASI olinadi.
//
// Nega soatlarni qo'shib bir marta baholamaymiz: jadval SEMESTR uchun tuzilgan.
// Ikki semestrda 16 soatdan qoldirgan talaba har semestrda 3 balldan olishi
// kerak, yig'indi 32 soat esa jadvalda 0 ball - ya'ni qo'shish qoidani buzardi.
// ---------------------------------------------------------------------------
export const scoreAttendance = (db, studentId, { academicYear = null } = {}) => {
    const rows = db.getStudentMissedHours
        ? db.getStudentMissedHours(studentId, academicYear)
        : [];

    if (rows.length === 0) {
        return result('ATTENDANCE', null, {
            missing: 'Qoldirilgan dars soati kiritilmagan',
        });
    }

    const perSemester = rows.map(r => ({
        ...r,
        points: missedHoursToPoints(r.hours),
    }));
    const average = perSemester.reduce((s, r) => s + r.points, 0) / perSemester.length;

    return result('ATTENDANCE', Math.round(average * 10) / 10, {
        detail: { perSemester, semesters: perSemester.length },
        sourceLabel: perSemester
            .map(r => `${r.semester}-semestr: ${r.hours} soat → ${r.points} ball`)
            .join('; ')
            // Yarim ma'lumot yashirilmaydi: bir semestrdan chiqarilgan yillik
            // ball ikki semestrdan chiqarilganidan kuchsizroq dalil.
            + (perSemester.length < 2 ? ' (1 semestr ma\'lumoti asosida)' : ''),
    });
};

// ---------------------------------------------------------------------------
// 7-mezon: "MA'RIFAT DARSLARI"DAGI FAOL ISHTIROK
//
// Ball IKKI QISMDAN iborat va ular ALOHIDA hisoblanadi:
//   davomat foizi -> 6 ballgacha (metodikaning jadvali)
//   faollik       -> 4 ballgacha (vakolatli shaxs qo'yadi)
//
// Foizning maxraji - talabaning FAKULTETI VA KURSI uchun o'tkazilgan darslar.
// Ma'rifat darslari auditoriya kesimida rejalashtiriladi, shuning uchun boshqa
// kursning darsiga bormagani uchun talaba ball yo'qotmasligi kerak.
//
// FAOLLIK BALI METODIKADA TA'RIFLANMAGAN: qanday o'lchanishi ham, kim qo'yishi
// ham aytilmagan. Shuning uchun uni tizim O'ZI qo'ymaydi - vakolatli shaxs
// kiritadi, tizim esa faqat taklif beradi. Kiritilmagan bo'lsa faollik qismi
// ball bermaydi va buni ochiq aytamiz.
// ---------------------------------------------------------------------------
export const scoreEducation = (db, studentId, { academicYear = null } = {}) => {
    if (!db.getStudentMarifatActivity) {
        return scoreManual(db, studentId, 'EDUCATION', { academicYear });
    }

    const stats = db.getStudentMarifatActivity(studentId, academicYear);
    const manual = db.getMarifatActivityScore
        ? db.getMarifatActivityScore(studentId, academicYear)
        : null;

    if (stats.held === 0) {
        return result('EDUCATION', null, {
            detail: { ...stats, manual },
            missing: "Auditoriyangiz uchun davomati belgilangan Ma'rifat darsi yo'q",
        });
    }

    const attendancePoints = educationAttendanceToPoints(stats.percent);
    const proposedActivity = MARIFAT.proposedActivityPoints(stats.active, stats.attended);
    const activityPoints = manual?.points ?? null;

    return result('EDUCATION', attendancePoints + (activityPoints || 0), {
        detail: {
            ...stats, manual,
            attendancePoints, activityPoints, proposedActivity,
            activityMax: INDEX_CRITERIA.EDUCATION.activityPoints,
        },
        sourceLabel: `${stats.held} darsdan ${stats.attended} tasi (${stats.percent}%) → ${attendancePoints} ball`
            + (activityPoints != null
                ? `; faollik ${activityPoints} ball`
                : '; faollik bali hali kiritilmagan'),
    });
};

// ---------------------------------------------------------------------------
// 8-mezon: VOLONTYORLIK VA JAMOAT ISHLARIDAGI FAOLLIK
//
// Ikki manba: platformadagi ishtirok yozuvi (rol bilan) va talabaning tashqi
// hujjati. Ikkalasi bitta ma'lumotnomaga tushadi.
//
// MAS'ULNING BAHOSI HAR DOIM USTUN: metodika bu mezonni ataylab odamga
// qoldirgan ("5 ballgacha" yaxlit baho, taqsimot berilmagan). Tizim faqat
// taklif beradi - shuning uchun tasdiqlanmagan ball ham ko'rsatiladi, lekin
// u TAKLIF ekani ochiq turadi.
// ---------------------------------------------------------------------------
export const scoreVolunteering = (db, studentId, { academicYear = null } = {}) => {
    const manual = db.getSocialIndexAssessment
        ? db.getSocialIndexAssessment(studentId, 'VOLUNTEERING', academicYear)
        : null;

    const stats = db.getStudentVolunteeringActivity
        ? db.getStudentVolunteeringActivity(studentId, academicYear)
        : null;

    if (manual && manual.points != null) {
        return result('VOLUNTEERING', manual.points, {
            detail: { ...(stats || {}), manual: true, assessedBy: manual.assessedBy, comment: manual.comment },
            sourceLabel: manual.assessedBy ? `Baholadi: ${manual.assessedBy}` : "Qo'lda baholangan",
        });
    }

    if (!stats || (stats.rows.length === 0 && stats.evidence.length === 0)) {
        return result('VOLUNTEERING', null, {
            detail: stats,
            missing: 'Volontyorlik yoki jamoat ishlaridagi ishtirok qayd etilmagan',
        });
    }

    return result('VOLUNTEERING', stats.proposedPoints, {
        detail: stats,
        // Ma'lumotnomaning o'z matni - "3 ta seminar" emas, metodikaning tilida.
        sourceLabel: (stats.statementText || `${stats.evidence.length} ta hujjat`)
            + (stats.evidence.length > 0 && stats.statementText
                ? `; ${stats.evidence.length} ta tashqi hujjat` : '')
            + ' — taklif etilgan ball',
    });
};

// ---------------------------------------------------------------------------
// 9-mezon: TEATR, MUZEY, XIYOBON, KINO, TARIXIY QADAMJOLARGA TASHRIFLAR
//
// Ball tashriflar SONIGA emas, MUNTAZAMLIGIGA qarab beriladi. Bir oyda o'nta
// tashrif 1 ball, olti oy davomida oyiga bittadan esa 5 ball - shuning uchun
// hisobga sanalar kiradi, yig'indi emas.
//
// Faqat TASDIQLANGAN tashrif hisoblanadi: metodika fotosurat va geolokatsiyani
// dalil deb belgilagan, dalilni esa odam ko'rishi kerak.
// ---------------------------------------------------------------------------
export const scoreCultural = (db, studentId, { academicYear = null } = {}) => {
    const manual = db.getSocialIndexAssessment
        ? db.getSocialIndexAssessment(studentId, 'CULTURAL', academicYear)
        : null;
    if (manual && manual.points != null) {
        return result('CULTURAL', manual.points, {
            detail: { manual: true, assessedBy: manual.assessedBy, comment: manual.comment },
            sourceLabel: manual.assessedBy ? `Baholadi: ${manual.assessedBy}` : "Qo'lda baholangan",
        });
    }

    if (!db.getStudentCulturalActivity) {
        return scoreManual(db, studentId, 'CULTURAL', { academicYear });
    }

    const stats = db.getStudentCulturalActivity(studentId, academicYear);

    if (stats.visits.length === 0) {
        return result('CULTURAL', null, {
            detail: stats,
            missing: stats.pending > 0
                ? `${stats.pending} ta tashrif tasdiqlanmagan`
                : 'Madaniy tashrif qayd etilmagan',
        });
    }

    return result('CULTURAL', stats.frequency?.points ?? 0, {
        detail: stats,
        sourceLabel: `${stats.visits.length} ta tashrif, ${stats.visitMonths.length} ta oyda`
            + ` — ${stats.frequency?.label || ''}`
            + (stats.pending > 0 ? `; ${stats.pending} tasi tasdiqlanmagan` : ''),
    });
};

// ---------------------------------------------------------------------------
// 10-mezon: SPORT VA SOG'LOM TURMUSH TARZI
//
// Uch qismdan iborat va ular BIR XIL ISHLAMAYDI:
//
//   A'ZOLIK (eng yuqorisi olinadi, qo'shilmaydi):
//     terma jamoa a'zoligi                          5
//     sport klubi/seksiyada muntazam shug'ullanish  3
//     OTM sport musobaqalarida faol ishtirok        1
//
//   QO'SHILADIGAN ikki band:
//     zararli illatlardan xoli                      2
//     toza-ozoda yurish                             2
//
// Yig'indi 5 bilan cheklanadi. Bu ATAYLAB ko'rsatiladi: terma jamoa a'zosi
// uchun qolgan ikki band ballga hech narsa qo'shmaydi (5+2+2 -> 5) va buni
// qo'lda hisoblaydigan odam albatta adashardi.
//
// Ikki qo'shiladigan band PREZUMPSIYA asosida: talaba to'liq balldan
// boshlaydi, ball faqat QAYD ETILGAN holat uchun kamayadi (4-mezondagi
// mantiqning aynan o'zi). Metodikada ularning o'lchovi ko'rsatilmagan.
// ---------------------------------------------------------------------------
export const scoreSports = (db, studentId, { academicYear = null } = {}) => {
    const manual = db.getSocialIndexAssessment
        ? db.getSocialIndexAssessment(studentId, 'SPORTS', academicYear)
        : null;
    if (manual && manual.points != null) {
        return result('SPORTS', manual.points, {
            detail: { manual: true, assessedBy: manual.assessedBy, comment: manual.comment },
            sourceLabel: manual.assessedBy ? `Baholadi: ${manual.assessedBy}` : "Qo'lda baholangan",
        });
    }
    if (!db.isSportTeamMember) return scoreManual(db, studentId, 'SPORTS', { academicYear });

    const parts = INDEX_CRITERIA.SPORTS.parts;
    const pointsOf = (key) => parts.find(p => p.key === key)?.points || 0;

    // --- A'ZOLIK DARAJASI ---
    //
    // Barcha nomzod darajalar yig'iladi, keyin ENG YUQORISI olinadi. Ilgari
    // ular ketma-ket `if/else` bilan tekshirilardi va bu ikki xatoga olib
    // kelgandi: 1-ball darajasi sport KLUBI davomatidan hisoblanardi (sport
    // MUSOBAQASIDAN emas), tashqi hujjat esa umuman o'qilmasdi.
    const candidates = [];

    if (db.isSportTeamMember(studentId, academicYear)) {
        const nom = db.getSportNominations({ studentId, status: 'approved', academicYear })
            .find(n => !n.endedAt);
        const team = db.getSportTeams(academicYear).find(t => t.id === nom?.teamId);
        candidates.push({
            key: 'national_team', origin: 'platform',
            label: `Terma jamoa: ${team?.name || ''}${team?.sport ? ` (${team.sport})` : ''}`,
            points: pointsOf('national_team'),
        });
    }

    // Sport yo'nalishidagi klubda muntazam shug'ullanish. Chegara sozlamadan:
    // metodikada "muntazam" so'zi bor, foiz yo'q.
    const directions = db.getClubDirections ? db.getClubDirections() : {};
    const minPercent = db.getSportSectionMinPercent ? db.getSportSectionMinPercent() : 50;
    const { perClub } = db.getStudentClubDirectionActivity(studentId, academicYear);
    const sportClubs = perClub.filter(c => directions[c.clubId] === 'sport');
    const regular = sportClubs.find(c => c.enoughEvents && c.percent >= minPercent);
    if (regular) {
        candidates.push({
            key: 'section', origin: 'platform',
            label: `${regular.clubName} — ${regular.held} tadbirdan ${regular.attended} tasi (${regular.percent}%)`,
            points: pointsOf('section'),
        });
    }

    // OTM SPORT MUSOBAQALARI - `match_play` dvigatelidagi musobaqalar.
    const sportComps = db.getStudentSportCompetitions
        ? db.getStudentSportCompetitions(studentId, academicYear)
        : [];
    if (sportComps.length > 0) {
        candidates.push({
            key: 'competition', origin: 'platform',
            label: `${sportComps.length} ta sport musobaqasida ishtirok`,
            points: pointsOf('competition'),
        });
    }

    // TASHQI A'ZOLIK HUJJATI - faqat QABUL QILINGANI va da'vosi bo'lgani.
    // Universitetdan tashqaridagi terma jamoa yoki sport klubi shu yo'l bilan
    // hisobga tushadi.
    const evidence = db.getIndexEvidence
        ? db.getIndexEvidence(studentId, 'SPORTS', academicYear).filter(e => e.status === 'accepted')
        : [];
    evidence.forEach(e => {
        if (!e.claim?.level) return;
        const points = pointsOf(e.claim.level);
        if (!points) return;
        candidates.push({
            key: e.claim.level, origin: 'external',
            label: `${e.title} (tashqi hujjat)`,
            points, evidenceId: e.id,
        });
    });

    const membership = candidates.length > 0
        ? candidates.reduce((a, b) => (b.points > a.points ? b : a))
        : null;

    // --- Prezumpsiya asosidagi ikki band ---
    const flags = db.getSportConductFlags(studentId, academicYear);
    const conduct = ['no_habits', 'tidiness'].map(key => {
        const flag = flags.find(f => f.part === key);
        const part = parts.find(p => p.key === key);
        return {
            key, label: part?.label || key,
            points: flag ? 0 : (part?.points || 0),
            flagged: !!flag, reason: flag?.reason || null,
        };
    });

    if (!membership && conduct.every(c => c.flagged)) {
        return result('SPORTS', null, {
            detail: { membership: null, conduct, flags },
            missing: 'Sport faoliyati qayd etilmagan',
        });
    }

    const raw = (membership?.points || 0) + conduct.reduce((s, c) => s + c.points, 0);
    const capped = Math.min(raw, INDEX_CRITERIA.SPORTS.maxPoints);

    return result('SPORTS', capped, {
        detail: {
            membership, conduct, raw,
            // Barcha topilgan darajalar - "nega bu daraja olindi" savoliga javob.
            candidates, sportComps, evidence,
            minPercent,
            // Ship urdimi - ochiq ko'rsatiladi.
            cappedFrom: raw > capped ? raw : null,
        },
        sourceLabel: (membership ? membership.label : "A'zolik qayd etilmagan")
            + (raw > capped ? ` · ${raw} → ${capped} (ship)` : ''),
    });
};

// ---------------------------------------------------------------------------
// 11-mezon: MA'NAVIY-MA'RIFIY SOHADAGI BOSHQA FAOLLIK
//
// Uchala band ham TASHKIL ETISH haqida - talaba tadbirga borgani uchun emas,
// uni tashabbus qilgani uchun ball oladi. Shuning uchun manba ham alohida
// ariza emas: tadbir odatdagidek o'tkaziladi, davomat belgilanadi, mas'ul
// o'sha yerda tashabbuskorni belgilaydi.
//
// HAR BAND BIR MARTA sanaladi. Metodika bandlarga ball beradi ("xiyobonda
// tadbir tashkil etish - 2 ball"), tadbirlar soniga emas - ikkita xiyobon
// tadbiri 4 ball bermaydi. Uchala band ham bo'lsa 3+2+1=6, ship esa 5.
// ---------------------------------------------------------------------------
export const scoreOther = (db, studentId, { academicYear = null } = {}) => {
    const manual = db.getSocialIndexAssessment
        ? db.getSocialIndexAssessment(studentId, 'OTHER', academicYear)
        : null;
    if (manual && manual.points != null) {
        return result('OTHER', manual.points, {
            detail: { manual: true, assessedBy: manual.assessedBy, comment: manual.comment },
            sourceLabel: manual.assessedBy ? `Baholadi: ${manual.assessedBy}` : "Qo'lda baholangan",
        });
    }
    if (!db.getStudentInitiatives) return scoreManual(db, studentId, 'OTHER', { academicYear });

    const initiatives = db.getStudentInitiatives(studentId, academicYear);
    if (initiatives.length === 0) {
        return result('OTHER', null, {
            detail: { initiatives: [], perBand: [] },
            missing: 'Tashabbuskorlik qayd etilmagan',
        });
    }

    const perBand = INITIATIVE_KEYS
        .map(key => {
            const rows = initiatives.filter(i => i.initiative === key);
            if (rows.length === 0) return null;
            return {
                key,
                label: INDEX_CRITERIA.OTHER.parts.find(p => p.key === key)?.label || key,
                points: initiativePoints(key),
                count: rows.length,
                rows,
            };
        })
        .filter(Boolean);

    const raw = perBand.reduce((s, b) => s + b.points, 0);
    const capped = Math.min(raw, INDEX_CRITERIA.OTHER.maxPoints);

    return result('OTHER', capped, {
        detail: {
            initiatives, perBand, raw,
            cappedFrom: raw > capped ? raw : null,
        },
        sourceLabel: `${initiatives.length} ta tadbirda tashabbuskorlik qayd etilgan`
            + (raw > capped ? ` · ${raw} → ${capped} (ship)` : ''),
    });
};

// ---------------------------------------------------------------------------
// QO'LDA BAHOLANADIGAN MEZONLAR
//
// Metodika ularni ataylab odamga qoldiradi (tyutor, dekan o'rinbosari, mas'ul
// professor). Tizim ularni O'ZI hisoblamaydi - faqat kiritilgan bahoni o'qiydi.
//
// Baho `socialIndexAssessments` da saqlanadi (db qatlami). Yo'q bo'lsa `null`.
// ---------------------------------------------------------------------------
export const scoreManual = (db, studentId, key, { academicYear = null } = {}) => {
    const assessment = db.getSocialIndexAssessment
        ? db.getSocialIndexAssessment(studentId, key, academicYear)
        : null;

    if (!assessment || assessment.points == null) {
        return result(key, null, {
            missing: `${INDEX_CRITERIA[key].name} bo'yicha baho hali kiritilmagan`,
        });
    }
    return result(key, assessment.points, {
        detail: { assessedBy: assessment.assessedBy, assessedAt: assessment.assessedAt, comment: assessment.comment },
        sourceLabel: assessment.assessedBy ? `Baholadi: ${assessment.assessedBy}` : null,
    });
};

// ---------------------------------------------------------------------------
// BUTUN INDEKS
//
// Har mezon o'z manbasidan hisoblanadi, o'z shipiga uriladi, keyin jami olinadi.
// Jami HAM 100 bilan chegaralanadi - nazariy jihatdan oshib ketmasligi kerak,
// lekin ship ikki qatlamda tekshiriladi: qoida shunday ekan, uni bitta joyning
// to'g'ri ishlashiga ishonib qo'yib bo'lmaydi.
// ---------------------------------------------------------------------------
export const computeSocialActivityIndex = (db, studentId, { academicYear = null } = {}) => {
    const criteria = INDEX_CRITERIA_ORDER.map(key => {
        switch (key) {
            case 'ACADEMIC': return scoreAcademic(db, studentId, { academicYear });
            case 'READING': return scoreReading(db, studentId, { academicYear });
            case 'COMPETITIONS': return scoreCompetitions(db, studentId, { academicYear });
            case 'CLUBS': return scoreClubs(db, studentId, { academicYear });
            case 'DISCIPLINE': return scoreDiscipline(db, studentId, { academicYear });
            case 'ATTENDANCE': return scoreAttendance(db, studentId, { academicYear });
            case 'EDUCATION': return scoreEducation(db, studentId, { academicYear });
            case 'VOLUNTEERING': return scoreVolunteering(db, studentId, { academicYear });
            case 'CULTURAL': return scoreCultural(db, studentId, { academicYear });
            case 'SPORTS': return scoreSports(db, studentId, { academicYear });
            case 'OTHER': return scoreOther(db, studentId, { academicYear });
            // Qolganlari qo'lda baholanadi yoki manbasi hali ulanmagan.
            default: return scoreManual(db, studentId, key, { academicYear });
        }
    });

    const scored = criteria.filter(c => c.points != null);
    const rawTotal = scored.reduce((sum, c) => sum + c.points, 0);

    // Intizomiy jazo - 15 ballgacha ayirish. Miqdorni mas'ul belgilaydi.
    const penalty = db.getDisciplinaryDeduction
        ? (db.getDisciplinaryDeduction(studentId, academicYear) || 0)
        : 0;
    const deduction = Math.min(Math.max(0, penalty), DISCIPLINARY_MAX_DEDUCTION);

    // Diskvalifikatsiya: metodikada dresskod/odob talablari buzilsa talabaning
    // hujjatlari tanlov uchun UMUMAN QABUL QILINMAYDI. Bu ball kamayishi emas -
    // nomzodlik bekor bo'ladi, shuning uchun alohida bayroq.
    const disqualified = db.isSocialIndexDisqualified
        ? !!db.isSocialIndexDisqualified(studentId, academicYear)
        : false;

    const total = Math.max(0, Math.min(rawTotal - deduction, INDEX_TOTAL_MAX));

    return {
        studentId,
        academicYear,
        criteria,
        // Hisoblangan mezonlar bo'yicha yig'indi.
        total: Math.round(total * 10) / 10,
        rawTotal: Math.round(rawTotal * 10) / 10,
        deduction,
        disqualified,
        maxTotal: INDEX_TOTAL_MAX,
        // Nechta mezon hisoblandi - indeksning to'liqligi. Bu ATAYLAB
        // ko'rsatiladi: 40 ball 11 mezondan 3 tasi hisoblanganda va 11 tasi
        // hisoblanganda butunlay boshqa ma'no beradi.
        scoredCount: scored.length,
        totalCount: criteria.length,
        // Ma'lumoti yetishmayotgan mezonlar - "nima qilishim kerak" ro'yxati.
        pending: criteria.filter(c => c.points == null).map(c => ({ key: c.key, name: c.name, missing: c.missing })),
    };
};
