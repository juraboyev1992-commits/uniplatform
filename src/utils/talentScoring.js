// Talent Development Score va stipendiyaga tayyorgarlik.
//
// IKKI QOIDA:
//
// 1. HECH NARSA O'YLAB TOPILMAYDI. Ma'lumot yo'q bo'lsa o'lchov `null` bo'ladi va
//    interfeysda "ma'lumot yo'q" deb ko'rsatiladi. Bu avvalgi studentScoring.js
//    dagi `gpaProxy = 2.5 + rand()*1.5` yondashuvining teskarisi.
//
// 2. QAYTA HISOBLANMAYDI. Stipendiyaga tayyorgarlik uchun mavjud
//    `scholarshipEligibility.js` ishlatiladi - ikkinchi engine qurilmaydi.
//    Bu modul faqat uning natijasini "yo'l xaritasi"ga aylantiradi.

import {
    TALENT_DIMENSIONS, DIMENSION_CAPS, TALENT_SCORE_MAX, getDimension,
    readinessToStatus, goalTiming,
} from '../config/talent.js';
import { evaluateEligibility } from './scholarshipEligibility.js';
import { getDocumentType } from '../config/documents.js';

// ---------------------------------------------------------------------------
// O'lchovlarning xom qiymatlari.
//
// `auto` o'lchovlar platformaning o'z reyestrlaridan; `manual` o'lchovlar
// talent profilidagi tasdiqlangan qiymatlardan (ilmiy rahbar/tyutor kiritadi
// va dalil bilan tasdiqlaydi).
// ---------------------------------------------------------------------------
export const collectDimensionValues = (db, studentId, profile = null) => {
    const declared = profile?.declared || {};

    // --- Akademik: real GPA, yo'q bo'lsa null ---
    const avgGpa = db.getStudentAverageGPA(studentId);

    // --- Ijtimoiy faollik: mavjud ledger ---
    const social = db.getStudentSocialScoreTotal(studentId);

    // --- Liderlik: klublardagi rahbarlik rollari ---
    const memberships = db.getUserMemberships(studentId) || [];
    const leadRoles = memberships.filter(m =>
        ['head_coordinator', 'coordinator', 'smm'].includes(m.role)).length;

    // --- Xalqaro: hujjat reyestridagi xalqaro faoliyat ---
    // Endi faoliyatning O'Z darajasi o'qiladi (tadbir/musobaqa yaratishdagi
    // "Darajasi" maydoni). Ilgari bu nomdan taxmin qilinardi - "Xalqaro huquq
    // kechasi" xalqaro hisoblanib, nomida so'z yo'q haqiqiy xalqaro musobaqa
    // hisoblanmay qolardi. Nom bo'yicha tekshiruv daraja BELGILANMAGAN eski
    // yozuvlar uchun zaxira sifatida qoladi.
    const docs = (db.getStudentDocuments(studentId) || []).filter(d => d.status === 'issued');
    const internationalDocs = docs.filter(d => {
        const protocol = d.protocolId ? db.getProtocolById(d.protocolId) : null;
        const level = protocol ? db.getActivityMeta(protocol.activityId, protocol.activityType).level : null;
        if (level) return level === 'international';
        return /xalqaro|international|global|world/i.test(`${d.activityName || ''}`);
    }).length;

    return {
        academic: avgGpa,                                   // null bo'lishi mumkin
        research: declared.research ?? null,                // tasdiqlangan ilmiy natijalar soni
        language: declared.language ?? null,                // IELTS/CEFR ekvivalenti
        social,
        leadership: leadRoles,
        international: internationalDocs,
        _meta: {
            documents: docs,
            memberships,
            gpaDetail: db.getStudentGPA(studentId),
            gpaTrend: db.getStudentGPATrend(studentId),
        },
    };
};

// ---------------------------------------------------------------------------
// Talent Development Score — 100 ball.
//
// Ma'lumoti yo'q o'lchov ballga QO'SHILMAYDI va `coverage` da ko'rsatiladi:
// "76 ball, lekin 2 ta o'lchov bo'yicha ma'lumot yo'q" deyish - "76 ball"
// deyishdan halolroq.
// ---------------------------------------------------------------------------
export const computeTalentScore = (values) => {
    const parts = TALENT_DIMENSIONS.map(dim => {
        const raw = values?.[dim.key];
        const known = raw !== null && raw !== undefined && raw !== '';
        if (!known) {
            return { ...dim, raw: null, known: false, points: 0, ratio: null };
        }
        const cap = DIMENSION_CAPS[dim.key] || 100;
        const ratio = Math.max(0, Math.min(1, Number(raw) / cap));
        return { ...dim, raw: Number(raw), known: true, ratio, points: Math.round(ratio * dim.max) };
    });

    const known = parts.filter(p => p.known);
    const score = parts.reduce((s, p) => s + p.points, 0);
    const knownMax = known.reduce((s, p) => s + p.max, 0);

    return {
        score,
        max: TALENT_SCORE_MAX,
        parts,
        missing: parts.filter(p => !p.known).map(p => p.label),
        coverage: TALENT_SCORE_MAX > 0 ? Math.round((knownMax / TALENT_SCORE_MAX) * 100) : 0,
        // Faqat ma'lumoti bor o'lchovlar bo'yicha foiz - "qanchasi to'ldirilgan"
        // emas, "to'ldirilganida qanday" degan savolga javob.
        relativeScore: knownMax > 0 ? Math.round((score / knownMax) * 100) : null,
    };
};

// ---------------------------------------------------------------------------
// Stipendiyaga tayyorgarlik.
//
// Mavjud eligibility engine chaqiriladi va natija YO'L XARITASIGA aylantiriladi:
// nima bajarilgan, nima yetishmayapti, keyingi qadamlar (§18, §19).
// ---------------------------------------------------------------------------
export const computeReadiness = (grant, eligibilityProfile, declared = {}) => {
    const eligibility = evaluateEligibility(grant, eligibilityProfile, declared);

    // Me'zon belgilanmagan grant - tayyorgarlik o'lchab bo'lmaydi, 100% deb
    // ko'rsatish yolg'on bo'lardi.
    if (eligibility.total === 0) {
        return {
            readiness: null, eligibility, met: [], missing: [], unknown: [],
            nextSteps: ["Bu grant uchun me'zonlar belgilanmagan - mas'ul bilan bog'laning"],
            status: 'not_started',
        };
    }

    const met = eligibility.checks.filter(c => c.ok);
    const missing = eligibility.checks.filter(c => !c.ok && !c.unknown);
    const unknown = eligibility.checks.filter(c => c.unknown);

    // Noma'lum me'zon "bajarilmagan" deb hisoblanadi: talaba uni to'ldirmaguncha
    // tayyorgarlik to'liq emas.
    const readiness = Math.round((met.length / eligibility.total) * 100);

    const nextSteps = [
        ...missing.map(c => {
            const gap = Number(c.target) - Number(c.actual);
            return Number.isFinite(gap) && gap > 0
                ? `${c.label}: yana ${Math.ceil(gap)} ${c.unit || ''} kerak (hozir ${c.actual})`
                : `${c.label}: talab ${c.target} ${c.unit || ''} (hozir ${c.actual ?? '—'})`;
        }),
        ...unknown.map(c => `${c.label}: ma'lumot kiritilmagan`),
    ];

    return {
        readiness, eligibility, met, missing, unknown, nextSteps,
        status: readinessToStatus(readiness),
    };
};

// Bir nechta grant bo'yicha tavsiya — eng mos keladiganidan boshlab (§49).
export const recommendTargets = (grants, eligibilityProfile, declared = {}) =>
    grants
        .map(grant => ({ grant, ...computeReadiness(grant, eligibilityProfile, declared) }))
        .filter(r => r.readiness !== null)
        .sort((a, b) => b.readiness - a.readiness);

// ---------------------------------------------------------------------------
// IDP progressi.
//
// Umumiy foiz maqsadlarning O'RTACHA progressi bo'yicha (bajarilgani 100%),
// bekor qilinganlar hisobga olinmaydi.
// ---------------------------------------------------------------------------
export const computeIdpProgress = (goals = []) => {
    const active = goals.filter(g => g.status !== 'cancelled');
    if (active.length === 0) {
        return { progress: 0, total: 0, done: 0, overdue: 0, dueSoon: 0, byCategory: {} };
    }

    const done = active.filter(g => g.status === 'done');
    const timings = active.map(g => ({ goal: g, timing: goalTiming(g) }));

    const progress = Math.round(
        active.reduce((s, g) => s + (g.status === 'done' ? 100 : Number(g.progress) || 0), 0) / active.length
    );

    const byCategory = {};
    active.forEach(g => {
        if (!byCategory[g.category]) byCategory[g.category] = { total: 0, done: 0 };
        byCategory[g.category].total += 1;
        if (g.status === 'done') byCategory[g.category].done += 1;
    });

    return {
        progress,
        total: active.length,
        done: done.length,
        overdue: timings.filter(t => t.timing.state === 'overdue').length,
        dueSoon: timings.filter(t => t.timing.state === 'due_soon').length,
        byCategory,
        timings,
    };
};

// ---------------------------------------------------------------------------
// AVTOMATIK PORTFOLIO (§28, §65)
//
// Talabaning mavjud faoliyatidan yig'iladi. Hech narsa qayta kiritilmaydi -
// hammasi platformadagi reyestrlardan o'qiladi.
// ---------------------------------------------------------------------------
export const buildTalentPortfolio = (db, studentId, year = new Date().getFullYear()) => {
    const docs = (db.getStudentDocuments(studentId) || []).filter(d => d.status === 'issued');
    const groupOf = (d) => getDocumentType(d.documentType)?.group || 'other';

    const memberships = db.getUserMemberships(studentId) || [];
    const clubs = db.getClubs ? db.getClubs() : [];
    const clubById = new Map(clubs.map(c => [c.id, c]));

    return {
        academic: {
            records: db.getAcademicRecords(studentId),
            current: db.getStudentGPA(studentId),
            average: db.getStudentAverageGPA(studentId),
            trend: db.getStudentGPATrend(studentId),
        },
        documents: {
            all: docs,
            diplomas: docs.filter(d => groupOf(d) === 'diploma'),
            certificates: docs.filter(d => groupOf(d) === 'certificate'),
            thanks: docs.filter(d => groupOf(d) === 'thanks'),
            other: docs.filter(d => groupOf(d) === 'other'),
        },
        social: {
            total: db.getStudentSocialScoreTotal(studentId),
            transactions: db.getSocialScoreTransactions
                ? db.getSocialScoreTransactions(studentId)
                : [],
        },
        clubs: memberships.map(m => ({
            ...m,
            clubName: clubById.get(m.clubId)?.name || m.clubId,
        })),
        attendance: db.getAttendanceForParticipant
            ? (db.getAttendanceForParticipant(studentId) || []).filter(a => a.status === 'present')
            : [],
        year,
    };
};

// ---------------------------------------------------------------------------
// Vakolat: kim kimni ko'radi (§69).
//
// Rolga emas, BIRIKTIRUVGA asoslanadi - platformada mentor/tyutor/ilmiy rahbar
// rollari yo'q. Admin va rahbariyat hammani ko'radi.
// ---------------------------------------------------------------------------
export const getMyMenteeIds = (assignments, personId, role = null) =>
    (assignments || [])
        .filter(a => a.active && a.personId === personId && (!role || a.role === role))
        .map(a => a.studentId);

export const canViewStudent = ({ assignments, personId, studentId, isAdmin, isManagement, faculty, studentFaculty }) => {
    if (isAdmin || isManagement) return true;
    if (personId === studentId) return true;
    if (getMyMenteeIds(assignments, personId).includes(studentId)) return true;
    // Fakultet mas'uli - o'z fakultetini ko'radi.
    if (faculty && studentFaculty && faculty === studentFaculty) return true;
    return false;
};

export const getDimensionLabel = (key) => getDimension(key)?.label || key;

// ---------------------------------------------------------------------------
// NOMZODLARNI AVTOMATIK TAKLIF QILISH
//
// MUHIM CHEKLOV: 1-kurs talabasida platformada hech qanday tarix yo'q - na ball,
// na yutuq, na davomat. Ularni platforma ma'lumoti bo'yicha saralash mumkin emas.
// Shuning uchun ikki rejim:
//
//   senior (2-4 kurs) - platformaning REAL reyestrlaridan: ijtimoiy faollik,
//                       diplomlar, GPA, klub rollari, ishtirok.
//   year1  (1-kurs)   - faqat DASTLABKI SO'ROVNOMA to'ldirilgan bo'lsa: kirish
//                       bali, olimpiadalar, maxsus maktab, til darajasi.
//                       So'rovnomasiz taklif berilmaydi - "ma'lumot yo'q" deyish
//                       tasodifiy ro'yxat ko'rsatishdan yaxshiroq.
// ---------------------------------------------------------------------------

// 1-kurs so'rovnomasidan salohiyat signali. Bu YAKUNIY HUKM emas - shunchaki
// "kimga birinchi navbatda e'tibor qaratish kerak" degan ko'rsatkich.
export const SURVEY_SIGNALS = [
    { key: 'admissionScore', label: 'Kirish bali', weight: 30, cap: 100, type: 'number' },
    { key: 'olympiads', label: 'Olimpiada yutuqlari', weight: 25, cap: 3, type: 'number' },
    { key: 'specialSchool', label: 'Maxsus maktab bitiruvchisi', weight: 15, cap: 1, type: 'bool' },
    { key: 'languageLevel', label: 'Til darajasi', weight: 15, cap: 9, type: 'number' },
    { key: 'schoolAchievements', label: 'Maktabdagi yutuqlar', weight: 10, cap: 5, type: 'number' },
    { key: 'leadershipHistory', label: 'Liderlik tajribasi', weight: 5, cap: 3, type: 'bool' },
];

export const computeSurveyPotential = (survey = {}) => {
    const parts = SURVEY_SIGNALS.map(sig => {
        const raw = survey[sig.key];
        const known = raw !== null && raw !== undefined && raw !== '';
        if (!known) return { ...sig, raw: null, known: false, points: 0 };
        const value = sig.type === 'bool' ? (raw ? 1 : 0) : Number(raw);
        if (!Number.isFinite(value)) return { ...sig, raw, known: false, points: 0 };
        const ratio = Math.max(0, Math.min(1, value / sig.cap));
        return { ...sig, raw: value, known: true, ratio, points: Math.round(ratio * sig.weight) };
    });

    const known = parts.filter(p => p.known);
    const totalWeight = SURVEY_SIGNALS.reduce((s, x) => s + x.weight, 0);
    const knownWeight = known.reduce((s, p) => s + p.weight, 0);

    return {
        score: parts.reduce((s, p) => s + p.points, 0),
        max: totalWeight,
        parts,
        filled: known.length > 0,
        coverage: totalWeight > 0 ? Math.round((knownWeight / totalWeight) * 100) : 0,
    };
};

// 2-4 kurs uchun: platformaning real ma'lumotidan taklif.
// `reasons` - NEGA taklif qilinganini ko'rsatadi; sababsiz ro'yxat foydasiz.
export const suggestSeniorCandidates = (db, { faculty = null, minScore = 30, limit = 50 } = {}) => {
    const enrolled = new Set((db.getTalentProfiles() || []).map(p => p.studentId));

    return (db.getMockStudents() || [])
        .filter(s => s.course >= 2)
        .filter(s => !enrolled.has(s.id))
        .filter(s => !faculty || s.faculty === faculty)
        .map(student => {
            const values = collectDimensionValues(db, student.id);
            const scored = computeTalentScore(values);
            const docs = values._meta.documents;
            const prizes = docs.filter(d => [1, 2, 3].includes(Number(d.place))).length;

            const reasons = [];
            if (values.social >= 100) reasons.push(`Ijtimoiy faollik: ${values.social} ball`);
            if (prizes > 0) reasons.push(`${prizes} ta sovrinli o'rin`);
            if (docs.length > 0) reasons.push(`${docs.length} ta rasmiy hujjat`);
            if (values.leadership > 0) reasons.push(`${values.leadership} ta rahbarlik roli`);
            if (values.academic !== null && values.academic >= 4) reasons.push(`GPA ${values.academic}`);
            if (values.international > 0) reasons.push('Xalqaro faoliyat');

            return { student, values, scored, prizes, reasons, score: scored.score };
        })
        .filter(r => r.score >= minScore && r.reasons.length > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
};

// 1-kurs uchun: FAQAT so'rovnoma to'ldirilgan bo'lsa.
// So'rovnomalar talent profilida saqlanadi, ya'ni talaba avval dasturga
// qo'shilib so'rovnomani to'ldirishi kerak. Dasturga kirmaganlar uchun
// taklif berish mumkin emas va bu ochiq aytiladi.
export const suggestYear1Candidates = (db, { faculty = null, limit = 50 } = {}) => {
    const profiles = db.getTalentProfiles() || [];
    const students = new Map((db.getMockStudents() || []).map(s => [s.id, s]));

    return profiles
        .filter(p => p.program === 'year1' && p.status === 'active')
        .map(p => ({ profile: p, student: students.get(p.studentId), potential: computeSurveyPotential(p.survey) }))
        .filter(r => r.student && r.potential.filled)
        .filter(r => !faculty || r.student.faculty === faculty)
        .sort((a, b) => b.potential.score - a.potential.score)
        .slice(0, limit);
};

// 1-kursda so'rovnomasi to'ldirilmaganlar - ularga eslatma yuborish kerak.
export const getYear1WithoutSurvey = (db) => {
    const students = new Map((db.getMockStudents() || []).map(s => [s.id, s]));
    return (db.getTalentProfiles() || [])
        .filter(p => p.program === 'year1' && p.status === 'active' && !computeSurveyPotential(p.survey).filled)
        .map(p => ({ profile: p, student: students.get(p.studentId) }))
        .filter(r => r.student);
};
