// ===========================================================================
// INDEKS TAYYORLIGI, KUTAYOTGAN ISHLAR VA TIZIM HOLATI
//
// Administrator bosh sahifasi uchun uchta savolga javob beradi:
//   1. Qaysi mezon bo'yicha ma'lumot yig'ilgan, qaysi biri bo'sh?
//   2. Qayerda kimdir javob kutmoqda?
//   3. Qaysi modul bazaga ulangan, qaysi biri hali yo'q?
//
// NEGA INDEKSNING O'ZI HISOBLANMAYDI:
//   550 ta talabaning indeksini sahifa ochilishida hisoblab bo'lmaydi - har
//   hisob localStorage'ni qaytadan o'qiydi va sahifa muzlab qolardi. Shuning
//   uchun bu yerda faqat ARZON o'lchov: har mezon bo'yicha MA'LUMOTI BOR
//   talabalar soni, jadvallar ustidan bir marta yurib chiqib. To'liq indeks
//   kerak bo'lsa - Hisobotlar bo'limidagi Excel.
//
// "Ma'lumoti bor" - "ball oldi" degani EMAS. Bu shunchaki hisoblash uchun
// manba mavjudligini bildiradi; talaba noldan ball olishi ham mumkin.
// ===========================================================================
import { INDEX_CRITERIA, INDEX_CRITERIA_ORDER } from '../config/socialActivityIndex';
import { academicYearOf, getCurrentAcademicYear } from '../services/db';
import { isReadingTest, isPassingAttempt } from './socialActivityScoring';

const uniq = (arr) => new Set(arr.filter(Boolean)).size;

// Davomat yozuvi shu o'quv yiliniki emasmi? Sanasi yo'q eski yozuv
// chiqarib tashlanmaydi - aks holda tarixiy ma'lumot ko'rinmay qolardi.
const inYear = (row, year) => !row.createdAt || academicYearOf(row.createdAt) === year;

export const getIndexReadiness = (db, academicYear = null) => {
    const year = academicYear || getCurrentAcademicYear();
    const total = db.getMockStudents().length;

    // --- Har manba BIR MARTA o'qiladi ---
    const attendance = db.getActivityAttendanceAll().filter(a => inYear(a, year));
    const academic = db.getAcademicRecords().filter(r => r.academicYear === year);
    const assessments = db.getSocialIndexAssessments().filter(a => a.academicYear === year);
    const evidence = db.getIndexEvidence(null, null, year);

    // Tadbir/musobaqa qidirish jadvali - davomat yozuvi ularga havola qiladi.
    const activityById = new Map();
    (db.getEvents() || []).forEach(e => activityById.set(`event:${e.id}`, e));
    (db.getCompetitions() || []).forEach(c => activityById.set(`competition:${c.id}`, c));
    const activityOf = (a) => activityById.get(`${a.activityType}:${a.activityId}`);

    // Tadbir qaysi klubniki - 2- va 10-mezon uchun kerak.
    const clubOf = (act) => {
        if (!act) return null;
        if (act.clubId) return String(act.clubId);
        if (act.contextType === 'club' && act.contextId) return String(act.contextId);
        return null;
    };

    // 1. KITOBXONLIK - testdan muvaffaqiyatli o'tganlar.
    const readingTests = new Map(db.getTests().filter(isReadingTest).map(t => [t.id, t]));
    const readingPassed = db.getTestAttempts()
        .filter(a => readingTests.has(a.testId) && isPassingAttempt(a, readingTests.get(a.testId)))
        .map(a => a.studentId);

    // 2. TO'GARAKLAR - yo'nalishi belgilangan klub tadbirlaridagi ishtirok.
    const directions = db.getClubDirections();
    const clubActive = attendance
        .filter(a => a.status === 'present')
        .filter(a => {
            const clubId = clubOf(activityOf(a));
            return clubId && directions[clubId];
        })
        .map(a => a.participantId);

    // 3. AKADEMIK - joriy o'quv yili GPA'si.
    const gpaStudents = academic.filter(r => r.gpa != null).map(r => r.studentId);

    // 5. MUSOBAQALAR - tizim bergan hujjat yoki qabul qilingan tashqi hujjat.
    const docStudents = (db.getDocuments() || [])
        .filter(d => d.status === 'issued' && [1, 2, 3].includes(Number(d.place)))
        .flatMap(d => [d.recipientId, ...((d.members || []).map(m => m.userId))]);
    const compEvidence = evidence
        .filter(e => e.criterionKey === 'COMPETITIONS' && e.status === 'accepted')
        .map(e => e.studentId);

    // 6. DARS DAVOMATI - kiritilgan qoldirilgan soat.
    const missedStudents = academic.filter(r => r.missedHours != null).map(r => r.studentId);

    // 7. MA'RIFAT DARSLARI - davomati belgilanganlar.
    const marifatStudents = db.getMarifatLessons(year)
        .flatMap(l => db.getMarifatAttendance(l.id).map(a => a.studentId));

    // 8. VOLONTYORLIK - mos rol yoki mos tadbir turi. Shkala sozlanadigan,
    //    shuning uchun konstanta emas, bazadagi joriy qiymat o'qiladi.
    const scale = db.getVolunteeringScale();
    const volunteerStudents = attendance
        .filter(a => a.status === 'present')
        .filter(a => {
            const act = activityOf(a);
            if (!act) return false;
            return scale.activeRoles.includes(a.role || 'participant')
                || scale.eventTypes.includes(act.eventType);
        })
        .map(a => a.participantId);

    // 9. MADANIY TASHRIFLAR - faqat tasdiqlanganlari.
    const culturalStudents = db.getCulturalVisits({ status: 'confirmed', academicYear: year })
        .map(v => v.studentId);

    // 10. SPORT - terma jamoa a'zoligi yoki sport klubidagi ishtirok.
    const sportTeamStudents = db.getSportNominations({ status: 'approved', academicYear: year })
        .map(n => n.studentId);
    const sportClubStudents = attendance
        .filter(a => a.status === 'present')
        .filter(a => directions[clubOf(activityOf(a))] === 'sport')
        .map(a => a.participantId);

    // 11. TASHABBUSKORLIK - davomatdagi belgi.
    const initiativeStudents = attendance.filter(a => a.initiative).map(a => a.participantId);

    const counts = {
        READING: uniq(readingPassed),
        CLUBS: uniq(clubActive),
        ACADEMIC: uniq(gpaStudents),
        // 4-mezon PREZUMPSIYA asosida ishlaydi: intizomiy yozuvi yo'q talaba
        // ham to'liq ballga ega, ya'ni bu mezonda ma'lumot hamma uchun bor.
        DISCIPLINE: total,
        COMPETITIONS: uniq([...docStudents, ...compEvidence]),
        ATTENDANCE: uniq(missedStudents),
        EDUCATION: uniq(marifatStudents),
        VOLUNTEERING: uniq(volunteerStudents),
        CULTURAL: uniq(culturalStudents),
        SPORTS: uniq([...sportTeamStudents, ...sportClubStudents]),
        OTHER: uniq(initiativeStudents),
    };

    // Qo'lda qo'yilgan baho ham manba hisoblanadi - u avtomatik hisobni
    // bekor qiladi, demak yozuvi yo'q talaba ham baholangan bo'lishi mumkin.
    INDEX_CRITERIA_ORDER.forEach(key => {
        const manual = uniq(assessments.filter(a => a.criterionKey === key).map(a => a.studentId));
        counts[key] = Math.max(counts[key], manual);
    });

    return {
        total,
        academicYear: year,
        criteria: INDEX_CRITERIA_ORDER.map((key, i) => ({
            key,
            order: i + 1,
            name: INDEX_CRITERIA[key].name,
            maxPoints: INDEX_CRITERIA[key].maxPoints,
            students: counts[key],
            percent: total > 0 ? Math.round((counts[key] / total) * 100) : 0,
        })),
    };
};

// ---------------------------------------------------------------------------
// KUTAYOTGAN ISHLAR - hamma manbadan.
//
// Bosh sahifadagi "Tasdiqlash kutilmoqda" ilgari FAQAT eski ijtimoiy faollik
// arizalarini sanardi va ko'pincha 0 ko'rsatardi - holbuki hujjatlar,
// e'tirozlar, sport nomzodlari va madaniy tashriflar boshqa bo'limlarda
// javob kutib turardi. Endi hammasi bitta ro'yxatda.
// ---------------------------------------------------------------------------
export const getPendingWorkload = (db) => {
    const rows = [
        {
            key: 'social',
            label: 'Ijtimoiy faollik arizalari',
            count: db.getSocialApplications().filter(a => a.status === 'Pending').length,
        },
        {
            key: 'positions',
            label: 'Klub lavozimiga arizalar',
            count: (db.getAdminPendingPositionApplications() || []).length,
        },
        {
            key: 'registrations',
            label: "Ro'yxatdan o'tish so'rovlari",
            count: (db.getPendingRegistrationApprovals() || []).length,
        },
        {
            key: 'scholarships',
            label: 'Stipendiya arizalari',
            count: db.getScholarshipApplications().filter(a => a.status === 'Kutilmoqda').length,
        },
        {
            key: 'moderation',
            label: 'Tadbir va musobaqa moderatsiyasi',
            count: (db.getPendingCompetitionModerations() || []).length
                + (db.getPendingEventModerations() || []).length,
        },
        // --- Indeks oqimlari ---
        {
            key: 'evidence',
            label: 'Asoslovchi hujjatlar',
            count: db.getIndexEvidence().filter(e => e.status === 'pending').length,
        },
        {
            key: 'requests',
            label: "Mezon tasdiqlash so'rovlari",
            count: (db.getPendingConfirmationRequests() || []).length,
        },
        {
            key: 'appeals',
            label: "E'tirozlar",
            count: db.getEvidenceAppeals().filter(a => a.status === 'pending').length,
        },
        {
            key: 'sport',
            label: 'Terma jamoa nomzodlari',
            count: db.getSportNominations({ status: 'pending' }).length,
        },
        {
            key: 'cultural',
            label: 'Madaniy tashriflar',
            count: db.getCulturalVisits({ status: 'pending' }).length,
        },
        {
            key: 'clubAchievements',
            label: 'Klublarning tashqi yutuqlari',
            count: (db.getPendingClubAchievements() || []).length,
        },
        {
            key: 'joinRequests',
            label: "Klub a'zoligiga arizalar",
            count: (db.getPendingJoinRequests() || []).length,
        },
    ];

    return { rows, total: rows.reduce((s, r) => s + r.count, 0) };
};

// ---------------------------------------------------------------------------
// TIZIM HOLATI
//
// Har modul o'z jadvallarini o'qiy oladimi. Ilgari buni faqat brauzer
// konsolidan bilish mumkin edi va administrator moduldan foydalanmaguncha
// SQL ishga tushirilmaganini sezmasdi.
// ---------------------------------------------------------------------------
export const getSystemHealth = (db) => [
    {
        key: 'foundation',
        label: 'Ijtimoiy faollik poydevori',
        detail: 'Davomat, akademik yozuv, mezon baholari',
        ready: db.isFoundationBackendReady(),
        sql: 'supabase/talent_phase0.sql',
    },
    {
        key: 'tests',
        label: 'Testlar va kitobxonlik',
        detail: '1-mezon manbasi',
        ready: db.isTestsBackendReady(),
        sql: 'supabase/tests.sql',
    },
    {
        key: 'marifat',
        label: "Ma'rifat darslari",
        detail: '7-mezon',
        ready: db.isMarifatBackendReady(),
        sql: 'supabase/marifat_lessons.sql',
    },
    {
        key: 'cultural',
        label: 'Madaniy tashriflar',
        detail: '9-mezon · fotosurat ombori bilan',
        ready: db.isCulturalBackendReady(),
        sql: 'supabase/cultural_visits.sql',
    },
    {
        key: 'sport',
        label: 'Terma jamoalar',
        detail: '10-mezon',
        ready: db.isSportBackendReady(),
        sql: 'supabase/sport_teams.sql',
    },
    {
        key: 'housing',
        label: 'Turar joy va yotoqxonalar',
        detail: '10-mezonda baholovchini aniqlaydi',
        ready: db.isHousingBackendReady(),
        sql: 'supabase/student_housing.sql',
    },
    {
        key: 'passport',
        label: 'Talabaning raqamli pasporti',
        detail: "Ta'lim tili va maxfiylik izi",
        ready: db.isPassportBackendReady(),
        sql: 'supabase/student_passport.sql',
    },
    {
        key: 'clubAchievements',
        label: 'Klub yutuqlari',
        detail: 'Tashqi yutuqlar · dalil ombori bilan',
        ready: db.isClubAchievementsBackendReady(),
        sql: 'supabase/club_achievements.sql',
    },
    {
        key: 'clubMembership',
        label: "Klub a'zoligi",
        detail: "Arizalar va a'zolik tarixi",
        ready: db.isClubMembershipBackendReady(),
        sql: 'supabase/club_membership.sql',
    },
    {
        key: 'studentDocs',
        label: 'Talaba hujjatlari',
        detail: "Dalillar, baholar, e'tirozlar · fayl ombori bilan",
        ready: db.isStudentDocsBackendReady(),
        sql: 'supabase/student_documents.sql',
    },
];
