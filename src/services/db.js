// src/services/db.js
import { supabase } from './supabaseClient.js';
import {
    SOCIAL_ACTIVITY_CRITERIA, SOCIAL_AUTOMATIC_SOURCES,
    TEACHING_LANGUAGE_ORDER, normalizeTeachingLanguage,
} from '../constants/index.js';
import {
    computeQuizMixedPoints, computeDebateRoundTotal, UNIQUIZ_ROUND_RULES, getDisplayStages,
    sumRoundScoresInRange, rankByCountback, rankByLastN, DEFAULT_ADVANCEMENT_TIEBREAK,
    NOTIQ_SLOTS, computeNotiqTotal, aggregateNotiqAcrossJudges, computeTeamMatchTotal,
    computeDebateMatchWinner, getEffectivePointsTable, DEBATE_MATCH_CRITERIA,
    getCourtSlots, getCourtMatchCriteria
} from '../config/competitionEngines.js';
import {
    DOCUMENT_TYPES, getDocumentType, getDocumentTypeLabel, resolveDocumentType,
    formatRegistrationNumber, ORGANIZATION_NAME, formatOfficialName, defaultAwardSettings
} from '../config/documents.js';
import {
    normalizeGrantStatus, normalizeApplicationStatus, DEFAULT_DOC_TYPES, CRITERIA_CATALOG,
    initialStatusForStage, getEvaluationCriteria, resolvePipeline, getStageType, stageQuota
} from '../config/scholarships.js';
import {
    buildFacultyBreakdown, canEvaluate, summarizeEvaluations,
    buildPipelineOverview, buildStageBreakdown, stageCriteria
} from '../utils/scholarshipStages.js';
import {
    PARTICIPATION_ROLES, PARTICIPATION_ROLE_ORDER, computeParticipationPoints,
} from '../config/activityLifecycle.js';
import {
    INDEX_CRITERIA, DISCIPLINARY_MAX_DEDUCTION, READING_POLICY, booksToPoints,
    CLUB_ACTIVITY, CLUB_DIRECTION_KEYS, clubPercentToPoints,
    DEADLINES, DEADLINE_ORDER, DISCIPLINE_PARTS,
    APPEAL, PLACEMENT_LEVEL_ORDER, PLACEMENT_PLACES, placementToPoints,
    VOLUNTEERING_SCALE, VOLUNTEERING_CATEGORIES, volunteeringCategoryOf,
    SPORT_POLICY, SPORT_CLAIM_LEVELS, sportClaimPoints,
    CULTURAL_PLACE_TYPES, distanceMeters, culturalFrequency, ACADEMIC_MONTHS,
} from '../config/socialActivityIndex.js';
import {
    PASSPORT_SECTIONS, PASSPORT_FIELD_INDEX, VIEWER_KINDS,
    canViewField, canViewSection, isAccessLogged,
} from '../config/studentPassport.js';
import { normalizeClubContacts } from '../config/clubContacts.js';
import {
    APPLICATION_STATUS, APPLICATION_TRANSITIONS, APPLICATION_ACTIONS, canTransitionApplication,
    REGISTRATION_STATUS, DEFAULT_REGISTRATION_STATUS_FOR_LEGACY_CLUBS,
    OPERATIONAL_STATUS, DEFAULT_OPERATIONAL_STATUS, CREATED_FROM,
    REGULATION_STATUS, CLUB_REGISTRY_PREFIX, CLUB_CERTIFICATE_PREFIX,
} from '../config/clubRegistration.js';
import { FACULTIES } from '../config/faculties.js';
import { normalizeEquipment } from '../config/venueEquipment.js';
import { STUDENT_DOC_TYPES, validateStudentDoc } from '../config/studentDocuments.js';
import {
    PUBLIC_ACHIEVEMENT_STATUS, sortAchievements, validateExternalAchievement,
} from '../config/clubAchievements.js';
import { computeSocialActivityIndex } from '../utils/socialActivityScoring.js';
import {
    COLLECTION_STATUS, mergeScoringConfig, placementPointsFor, participationPointsFor,
    coveragePointsFor, compareByTieBreak, DEFAULT_SCORING_CONFIG,
} from '../config/eventCollections.js';

// Bir talaba bir necha bosqichda belgilangan bo'lsa - eng yuqori roli olinadi.
const LIFECYCLE_ROLE_RANK = Object.fromEntries(
    PARTICIPATION_ROLE_ORDER.map((id, i) => [id, i + 1])
);
const LIFECYCLE_ROLE_LABEL = Object.fromEntries(
    Object.values(PARTICIPATION_ROLES).map(r => [r.id, r.label])
);
const computeLifecyclePoints = computeParticipationPoints;

// One place deciding "which speaker slots and which rubric does THIS competition score against" - a
// court_match competition uses its own (format-dependent) slots/criteria, everything else keeps Munozara's
// fixed 21-row/6-slot sheet exactly as before. Absent/unknown scoringMethod falls through to the Munozara
// defaults, so every pre-existing debate_match row behaves byte-identically to before this existed.
const resolveMatchScoringShape = (comp) => {
    if (comp?.scoringMethod === 'court_match') {
        return { slots: getCourtSlots(comp), criteria: getCourtMatchCriteria(comp) };
    }
    return { slots: NOTIQ_SLOTS, criteria: comp?.debateMatchCriteria || DEBATE_MATCH_CRITERIA };
};

const DB_KEY = 'uniplatform_clubos_db';

import { NOTIFICATION_TYPES, resolveNotificationPrefs } from '../config/notificationTypes.js';

export const SOCIAL_APPLICATION_STATUS = {
    PENDING: 'Pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    RETURNED: 'Returned'
};

// Club position application lifecycle - same idiom as SOCIAL_APPLICATION_STATUS above, but a separate
// enum since these are two unrelated flows (club org-structure positions vs "ijtimoiy faollik" point claims).
export const POSITION_APPLICATION_STATUS = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
    EXPIRED: 'EXPIRED'
};

// The five roles memberships[] already supports, unchanged - official positions map 1:1 onto them.
// Internal positions beyond 'volunteer'/'smm' (media_design, event_coordinator) have no equivalent
// membership.role value, so holders of those keep membership.role='member' - clubPositions is the
// real source of truth for *which* internal position someone holds, memberships stays a safe default.
export const OFFICIAL_POSITION_TYPES = ['head_coordinator', 'assistant_coordinator'];
export const INTERNAL_POSITION_TYPES = ['smm', 'media_design', 'event_coordinator', 'volunteer'];
export const POSITION_TYPE_LABELS = {
    head_coordinator: 'Asosiy koordinator',
    assistant_coordinator: 'Yordamchi koordinator',
    smm: 'SMM menejeri',
    media_design: 'Media/Dizayn',
    event_coordinator: 'Tadbir koordinatori',
    volunteer: 'Volontyor'
};
// Cardinality limits enforced by countActivePositions/the approval path below - 0 means "no limit".
const POSITION_MAX_SLOTS = { head_coordinator: 1, assistant_coordinator: 3 };

// Per-position-type badge colors (professional "Klub tarkibi" workspace spec) - a fixed palette per
// title, deliberately NOT reusing Badge.jsx's shared variant set (which only has 10 generic variants),
// since these need one distinct color per position type. Both light/dark pairs included.
export const POSITION_BADGE_STYLES = {
    head_coordinator: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    assistant_coordinator: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    smm: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
    media_design: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    event_coordinator: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    volunteer: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
};

// Uzbek display labels for POSITION_APPLICATION_STATUS - a separate map (not renaming the enum values
// themselves) so English constants keep driving every comparison in db.js/components.
export const POSITION_APPLICATION_STATUS_LABELS = {
    PENDING: 'Kutilmoqda',
    APPROVED: 'Tasdiqlangan',
    REJECTED: 'Rad etilgan',
    CANCELLED: 'Bekor qilingan',
    EXPIRED: 'Muddati tugagan'
};

// Maps a granted clubPositions.title (position *type*, richer than memberships.role) onto the nearest
// existing memberships.role value - the "powers activate" step: reviewPositionApplication's admin_approve
// calls db.joinClub/updateMembershipRole with whatever this resolves to. assistant_coordinator reuses
// 'coordinator' (the exact value hasClubRole's default already grants coordinator-level access to)
// rather than inventing a new membership.role value every existing hasClubRole() call site would miss.
const POSITION_TO_MEMBERSHIP_ROLE = {
    head_coordinator: 'head_coordinator',
    assistant_coordinator: 'coordinator',
    smm: 'smm',
    volunteer: 'volunteer',
    media_design: 'member',
    event_coordinator: 'member'
};

// Uzbekistan academic year runs Sep-Aug; e.g. a date in Mar 2026 falls in the "2025-2026" academic year
// Berilgan sana qaysi o'quv yiliga tegishli. O'quv yili 1-sentabrda boshlanadi.
export const academicYearOf = (date) => {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    return (d.getMonth() + 1) >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

export const getCurrentAcademicYear = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

// Real, login-capable student account(s) - merged into generateMockStudents()'s output (below) so
// every identity-lookup consumer (StudentPicker, overrideAddParticipant, clubAnalytics,
// rankingsAnalytics, membership/team name resolution, etc.) resolves them correctly, without touching
// any of those ~26 files individually. AuthContext.jsx's login() sources the same fields from here so
// the two can't drift apart. Array (not a single object) so a future 2nd/3rd real student account is
// trivial to add. Deliberately NOT fed to the one-time seed builders below (buildSocialActivitySeed/
// buildScholarshipApplicationsSeed/buildClubSeedExpansion/buildTeamsSeed all call
// generateSyntheticStudents() instead) - those use index arithmetic (i % 9, i % 43, ...) that would
// otherwise sweep a real account into unintended synthetic seed rows (e.g. becoming "coordinator" of a
// random club on fresh install).
export const REAL_STUDENT_USERS = [
    { id: 'talaba', fullName: 'Aliyev Sardor', faculty: 'Axborot texnologiyalari', course: 3, group: 'IT-301', studentId: 'ST2021001', gender: 'male', professionalism: 'amateur' }
];

// Standalone SYNTHETIC-only mock student generator - the pure 550-entry pool, used by the one-time seed
// builders below (never includes REAL_STUDENT_USERS, see comment above). Identity-lookup callers should
// use generateMockStudents() instead (right below), which includes real accounts too.
// First-name -> gender lookup (matches the real names in firstNames below, so a generated student's
// gender never contradicts their own name) - backs the "Jins bo'yicha" registration restriction
// (TournamentRulesStep.jsx), which previously had no real data to check against at all.
const MALE_FIRST_NAMES = new Set(['Ali', 'Vali', 'Sardor', 'Diyor', 'Javohir', 'Otabek', 'Jasur', 'Akmal', 'Bekzod', 'Shahzod', 'Farrux', 'Rustam']);
const FEMALE_FIRST_NAMES = new Set(['Madina', 'Dilnoza', 'Malika', 'Nigora', 'Sevara', 'Zarina', 'Lobar', 'Umida']);

const generateSyntheticStudents = () => {
    // Manba: config/faculties.js - TSUL'ning RASMIY fakultet/bo'lim ro'yxati.
    // Ilgari bu yerda umumiy universitet fakultetlari o'ylab topilgan edi
    // ("Axborot texnologiyalari", "Matematika", "Fizika") - TSUL yuridik
    // universitet, bunday fakultetlar bo'lishi mumkin emas edi.
    const firstNames = ['Ali', 'Vali', 'Sardor', 'Diyor', 'Javohir', 'Madina', 'Dilnoza', 'Malika', 'Nigora', 'Sevara', 'Otabek', 'Jasur', 'Akmal', 'Zarina', 'Bekzod', 'Shahzod', 'Lobar', 'Umida', 'Farrux', 'Rustam'];
    const lastNames = ['Aliyev', 'Karimov', 'Toshmatov', 'Rahimov', 'Yusupov', 'Azizov', 'Sharipov', 'Mahmudov', 'Ismoilov', 'Nurmatov', 'Sultonov', 'Abduvaliyev', 'Ergashev', 'Rustamov', 'Hasanov', 'Fayzullayev', 'Sobirov', 'Qodirov', 'Olimov', 'Karimova'];

    const students = [];
    for (let i = 1; i <= 550; i++) {
        const fName = firstNames[i % firstNames.length];
        const lName = lastNames[(i + 3) % lastNames.length];
        // Fakultet VA guruh ENDI BOG'LANGAN - ikkalasi ham shu talabaning
        // fakultet indeksidan kelib chiqadi. Ilgari ular MUSTAQIL
        // aylanardi (`faculties[i % 6]`, `groups[i % 6]` alohida-alohida),
        // ya'ni "Huquqshunoslik" talabasiga "IT-301" kabi mos kelmaydigan
        // guruh tushib qolishi mumkin edi.
        const facultyIdx = i % FACULTIES.length;
        const fac = FACULTIES[facultyIdx];
        // Magistratura odatda 1-2 yillik, bakalavriat 1-4 kurs - shuning
        // uchun kurs raqami fakultetga qarab cheklanadi ("4-kurs
        // magistratura" kabi mantiqsiz yozuv chiqmasin).
        const course = fac.isGraduate ? (i % 2) + 1 : (i % 4) + 1;
        const group = `${fac.code}-${100 + course}${String(i % 3).padStart(2, '0')}`;
        students.push({
            id: `student_${i}`,
            displayNumber: i,
            fullName: `${lName} ${fName}`,
            faculty: fac.name,
            group,
            course,
            studentId: `ST2023${String(i).padStart(3, '0')}`,
            gender: MALE_FIRST_NAMES.has(fName) ? 'male' : FEMALE_FIRST_NAMES.has(fName) ? 'female' : null,
            // No real-world signal to derive this from (unlike gender-from-name) - a plain deterministic
            // 1-in-5 split, same "deterministic but arbitrary" convention this generator already uses for
            // e.g. course. Disclosed, not fabricated as if it meant anything beyond "some students are
            // marked professional for restriction-testing purposes."
            professionalism: i % 5 === 0 ? 'professional' : 'amateur'
        });
    }
    return students;
};

// Identity-lookup-facing generator (used by db.getMockStudents() and every live db.js method that
// resolves a userId to a display name/faculty) - the synthetic 550 PLUS any real login-capable
// account(s), appended (not prepended, so mock-participant auto-fill like
// TournamentCreateWizard.jsx's `.slice(0, participantCount)` never puts a real account first).
const generateMockStudents = () => {
    const students = generateSyntheticStudents();
    REAL_STUDENT_USERS.forEach(realUser => {
        students.push({ ...realUser, displayNumber: students.length + 1 });
    });

    // Supabase'ga o'tgandan KEYIN yaratilgan haqiqiy akkauntlar ham shu ro'yxatga
    // qo'shiladi.
    //
    // Ilgari bu funksiya faqat 550 ta demo talaba + bitta eski real akkauntni
    // qaytarardi, `profiles` jadvalidagilar esa alohida turardi (getSyncedProfiles).
    // Natijada haqiqiy odam klubga koordinator qilib tayinlanganda ro'yxatda
    // uning ismi o'rniga XOM ID (UUID) ko'rinardi - qidiruv, davomat, jamoa
    // ro'yxati, hisobot, hamma joyda. Bu funksiya "shaxsni aniqlash" uchun
    // ishlatiladigan yagona nuqta (17 ta joyda chaqiriladi), shuning uchun
    // tuzatish shu yerda.
    //
    // Seed quruvchilar bu funksiyani EMAS, generateSyntheticStudents() ni
    // ishlatadi - shuning uchun urug'lantirilgan ma'lumot o'zgarmaydi.
    try {
        const byId = new Map(students.map(s => [s.id, s]));
        (getDB().realProfiles || []).forEach(p => {
            if (!p?.id) return;
            const existing = byId.get(p.id);
            if (existing) {
                // Bazadagi joriy ma'lumot ustun turadi.
                Object.assign(existing, p);
            } else {
                students.push({ ...p, displayNumber: null });
            }
        });
    } catch {
        // localStorage o'qib bo'lmasa demo ro'yxatning o'zi qaytadi - bu
        // funksiya hech qachon yiqilmasligi kerak, uni juda ko'p joy chaqiradi.
    }

    return students;
};

// Sample activity titles per canonical criteria key, used only to build realistic seed applications
const SOCIAL_ACTIVITY_SAMPLE_TITLES = {
    READING: ['Oylik kitobxonlik testidan o\'tish', '10 ta kitobni muddatidan oldin yakunlash'],
    CLUBS: ['IT klubi loyihasida faol ishtirok', 'Madaniyat to\'garagi tadbirini tashkil etish'],
    ACADEMIC: ['Fan olimpiadasida ishtirok', 'Semestr davomida a\'lo baholar'],
    DISCIPLINE: ['Intizom bo\'yicha rahbariyat tavsiyanomasi', 'Dresskodga qat\'iy rioya qilganlik'],
    COMPETITIONS: ['Respublika ko\'rik-tanlovida 2-o\'rin', 'Xalqaro olimpiadada ishtirok'],
    ATTENDANCE: ['Semestr davomida 100% davomat', 'Bir oylik namunali davomat'],
    EDUCATION: ['Ma\'rifat darslarida faol ishtirok', 'Ma\'rifat darsi bo\'yicha taqdimot tayyorlash'],
    VOLUNTEERING: ['Xayriya tadbirida tashkilotchi', 'Ekologik aksiyada ishtirok'],
    CULTURAL: ['Teatr tashrifi bo\'yicha hisobot', 'Muzey ekskursiyasida ishtirok'],
    SPORTS: ['Universitet chempionatida g\'olib', 'Sport musobaqasida 3-o\'rin'],
    OTHER: ['Ijtimoiy tarmoqda universitet tashviqoti', 'Yangi tashabbus bilan chiqish']
};

const SOCIAL_ACTIVITY_REJECT_COMMENTS = [
    'Faoliyat mezon talablariga mos kelmaydi',
    'Taqdim etilgan hujjat faoliyatni to\'liq tasdiqlamaydi',
    'Ko\'rsatilgan sana boshqa hujjatlar bilan mos kelmadi'
];

const SOCIAL_ACTIVITY_RETURN_COMMENTS = [
    'Tasdiqlovchi hujjat sifati past, qayta yuklang',
    'Faoliyat tavsifini batafsilroq yozib qayta yuboring',
    'Hujjatga imzo yoki muhr yetishmayapti, to\'ldirib qayta yuboring'
];

// Builds ~120 seeded social-activity applications + matching audit trail so the admin workspace is demoable immediately
const buildSocialActivitySeed = () => {
    const students = generateSyntheticStudents();
    const criteriaKeys = Object.keys(SOCIAL_ACTIVITY_CRITERIA);
    const reviewerName = 'Karimova Dilnoza';
    const now = Date.now();
    const TOTAL = 120;

    // Deterministic pseudo-shuffle of the status distribution so statuses aren't grouped in blocks
    const statusCounts = { Pending: 24, Approved: 60, Rejected: 18, Returned: 18 };
    const rawStatusSequence = [];
    Object.entries(statusCounts).forEach(([status, count]) => {
        for (let i = 0; i < count; i++) rawStatusSequence.push(status);
    });
    const statusOrder = rawStatusSequence.map((_, i) => i).sort((a, b) => ((a * 53 + 7) % TOTAL) - ((b * 53 + 7) % TOTAL));
    const statusSequence = statusOrder.map(i => rawStatusSequence[i]);

    // ~13 "power users" get 5 applications each; the rest are spread across the mock student pool via a stride
    const powerUserIndices = [3, 17, 42, 88, 121, 156, 203, 250, 301, 355, 402, 470, 511];
    const studentIdxSequence = [];
    powerUserIndices.forEach(idx => {
        for (let k = 0; k < 5; k++) studentIdxSequence.push(idx);
    });
    let strideCursor = 0;
    while (studentIdxSequence.length < TOTAL) {
        studentIdxSequence.push((strideCursor * 7 + 11) % students.length);
        strideCursor++;
    }

    const applications = [];
    const auditLogs = [];

    for (let i = 0; i < TOTAL; i++) {
        const student = students[studentIdxSequence[i] % students.length];
        const status = statusSequence[i];
        const criteriaKey = criteriaKeys[i % criteriaKeys.length];
        const titles = SOCIAL_ACTIVITY_SAMPLE_TITLES[criteriaKey];
        const activityTitle = titles[i % titles.length];

        // Spread submissions over the last ~6 months, recency-weighted (later index = more recent)
        const baseDaysAgo = 180 - Math.floor((i / TOTAL) * 170);
        const jitter = (i * 13) % 20;
        const daysAgo = Math.max(1, baseDaysAgo - jitter);
        const submittedAt = new Date(now - daysAgo * 86400000).toISOString();

        const id = `sapp_${i + 1}`;
        const application = {
            id,
            studentId: student.id,
            studentFullName: student.fullName,
            facultyAtSubmission: student.faculty,
            groupAtSubmission: student.group,
            courseAtSubmission: student.course,
            criteriaKey,
            activityTitle,
            description: `${activityTitle} bo'yicha tasdiqlovchi ma'lumot va batafsil hisobot.`,
            fileName: `hujjat_${id}.pdf`,
            submittedAt,
            status,
            pointsAwarded: null,
            reviewerComment: null,
            reviewedBy: null,
            reviewedAt: null
        };

        auditLogs.push({
            id: `salog_${id}_submit`,
            applicationId: id,
            action: 'SUBMITTED',
            fromStatus: null,
            toStatus: 'Pending',
            reviewer: student.fullName,
            comment: '',
            pointsAwarded: null,
            time: submittedAt
        });

        if (status !== SOCIAL_APPLICATION_STATUS.PENDING) {
            const reviewedAt = new Date(new Date(submittedAt).getTime() + 2 * 86400000).toISOString();
            application.reviewedBy = reviewerName;
            application.reviewedAt = reviewedAt;

            if (status === SOCIAL_APPLICATION_STATUS.APPROVED) {
                application.pointsAwarded = ((i * 3) % 10) + 1;
            } else if (status === SOCIAL_APPLICATION_STATUS.REJECTED) {
                application.reviewerComment = SOCIAL_ACTIVITY_REJECT_COMMENTS[i % SOCIAL_ACTIVITY_REJECT_COMMENTS.length];
            } else if (status === SOCIAL_APPLICATION_STATUS.RETURNED) {
                application.reviewerComment = SOCIAL_ACTIVITY_RETURN_COMMENTS[i % SOCIAL_ACTIVITY_RETURN_COMMENTS.length];
            }

            auditLogs.push({
                id: `salog_${id}_review`,
                applicationId: id,
                action: status.toUpperCase(),
                fromStatus: 'Pending',
                toStatus: status,
                reviewer: reviewerName,
                comment: application.reviewerComment || '',
                pointsAwarded: application.pointsAwarded,
                time: reviewedAt
            });
        }

        applications.push(application);
    }

    return { applications, auditLogs };
};

// Internal helper shared by single-item and bulk review paths - the one place status transitions + audit logging happen
// applySocialApplicationReview sof sinxron helper - uni async qilish uni chaqiradigan
// barcha joyni o'zgartirishni talab qilardi. O'rniga yangi ball yozuvlari shu navbatga
// tushadi, bulkReviewSocialApplications esa ularni bitta so'rov bilan serverga yozadi.
const pendingSocialScoreWrites = [];
// Arizaning O'ZI va tarix yozuvi ham shu navbatga tushadi. `applySocial-
// ApplicationReview` sof sinxron qoladi (uni async qilish uni chaqiradigan
// hamma joyni o'zgartirishni talab qilardi), yozishni esa bulk funksiya
// bitta so'rov bilan bajaradi - ball yozuvlarida allaqachon shu naqsh bor.
const pendingSocialAppWrites = [];
const pendingSocialLogWrites = [];

const applySocialApplicationReview = (dbData, applicationId, action, reviewer, comment) => {
    const idx = dbData.socialActivityApplications.findIndex(a => a.id === applicationId);
    if (idx === -1) return null;

    const application = dbData.socialActivityApplications[idx];
    const fromStatus = application.status;
    const toStatus = action === 'approve' ? SOCIAL_APPLICATION_STATUS.APPROVED
        : action === 'reject' ? SOCIAL_APPLICATION_STATUS.REJECTED
        : SOCIAL_APPLICATION_STATUS.RETURNED;
    const timestamp = new Date().toISOString();

    let pointsAwarded = application.pointsAwarded;
    let scoringSourceId = application.scoringSourceId || null;
    let scoringSourceCode = application.scoringSourceCode || null;

    if (toStatus === SOCIAL_APPLICATION_STATUS.APPROVED) {
        const source = findActiveScoringSourceInternal(dbData, application);
        if (!source) {
            const categoryName = (dbData.socialCriteriaCategories || []).find(c => c.key === application.criteriaKey)?.name || application.criteriaKey;
            throw new Error(
                `"${categoryName}" mezoni uchun faol ball manbai topilmadi. Avval Sozlamalar -> Ijtimoiy faollik bo'limida ball manbasini sozlang.`
            );
        }
        pointsAwarded = source.points;
        scoringSourceId = source.id;
        scoringSourceCode = source.code;

        if (!dbData.socialScoreTransactions) dbData.socialScoreTransactions = [];
        const txn = {
            id: 'satxn_' + Math.random().toString(36).slice(2, 11),
            applicationId,
            studentId: application.studentId,
            studentFullName: application.studentFullName,
            scoringSourceId: source.id,
            scoringSourceCode: source.code,
            scoringSourceName: source.name,
            category: source.category,
            points: source.points,
            academicYear: source.academicYear,
            appliesTo: source.appliesTo,
            createdAt: timestamp,
            createdBy: reviewer
        };
        dbData.socialScoreTransactions.push(txn);
        // Phase 0: ledger endi serverda. Talent Score va stipendiya me'zonlari shu
        // yig'indiga tayanadi, shuning uchun u bitta kompyuterda qolib ketmasligi kerak.
        pendingSocialScoreWrites.push(txn);
    }

    const updated = {
        ...application,
        status: toStatus,
        reviewedBy: reviewer,
        reviewedAt: timestamp,
        reviewerComment: comment || null,
        pointsAwarded,
        scoringSourceId,
        scoringSourceCode
    };
    dbData.socialActivityApplications[idx] = updated;
    pendingSocialAppWrites.push(updated);

    const logEntry = {
        id: 'salog_' + Math.random().toString(36).substr(2, 9),
        applicationId,
        action: toStatus.toUpperCase(),
        fromStatus,
        toStatus,
        reviewer,
        comment: comment || '',
        pointsAwarded: updated.pointsAwarded,
        time: timestamp
    };
    dbData.socialActivityAuditLogs.push(logEntry);
    pendingSocialLogWrites.push(logEntry);

    return updated;
};

// Ariza va tarix yozuvini bazaga yozadigan yagona joy. Jadval yo'q bo'lsa
// TUSHUNARLI xabar beriladi: "saqlandi" deb ko'rsatib, aslida hech qayerga
// yozmaslik - eng yomon holat.
const socialTableError = (error) => {
    const missing = /relation .*social_activity_(applications|audit_logs).* does not exist/i.test(error?.message || '');
    return new Error(missing
        ? 'Ariza saqlanmadi: `social_activity_applications` jadvali topilmadi. '
          + 'Supabase SQL Editor da `supabase/social_activity_applications.sql` ni bir marta ishga tushiring.'
        : 'Ariza saqlanmadi: ' + (error?.message || ''));
};

// Jadval yo'q bo'lsa TUSHUNARLI xabar: "saqlandi" deb ko'rsatib, aslida hech
// qayerga yozmaslik - eng yomon holat.
const competitionDelegationTableError = (error) => {
    const missing = /relation .*competition_delegation.* does not exist/i.test(error?.message || '');
    return new Error(missing
        ? 'Vakolat saqlanmadi: `competition_delegations` jadvali topilmadi. '
          + 'Supabase SQL Editor da `supabase/competition_delegations.sql` ni bir marta ishga tushiring.'
        : 'Vakolat saqlanmadi: ' + (error?.message || ''));
};

// Klub lavozimlari va arizalari uchun yozuvchilar. Jadval yo'q bo'lsa
// TUSHUNARLI xabar beriladi - "saqlandi" deb ko'rsatib, aslida hech qayerga
// yozmaslik eng yomon holat.
const clubPositionTableError = (error) => {
    const missing = /relation .*club_position.* does not exist/i.test(error?.message || '');
    return new Error(missing
        ? 'Saqlanmadi: `club_positions` jadvallari topilmadi. '
          + 'Supabase SQL Editor da `supabase/club_positions.sql` ni bir marta ishga tushiring.'
        : 'Saqlanmadi: ' + (error?.message || ''));
};

const persistClubPosition = async (pos) => {
    const { error } = await supabase.from('club_positions').upsert({
        id: pos.id, club_id: pos.clubId || null, title: pos.title || null,
        status: pos.status || null, data: pos,
    });
    if (error) throw clubPositionTableError(error);
};

const persistClubPositionApplication = async (app) => {
    const { error } = await supabase.from('club_position_applications').upsert({
        id: app.id, position_id: app.positionId || null, club_id: app.clubId || null,
        student_id: app.studentId || null, status: app.status || null, data: app,
    });
    if (error) throw clubPositionTableError(error);
};

// Tarix yozuvi jimgina o'tkazib yuboriladi: u yozilmagani uchun asosiy amal
// bekor bo'lmasligi kerak.
// Intizom, lavozim tayinlash, raund holati va kitobxonlik seanslari uchun
// umumiy yozuvchi. Hammasi bir xil shaklda saqlanadi: butun obyekt `data`
// ichida, qidiruv uchun bir nechta haqiqiy ustun.
//
// Xato JIM YUTILMAYDI - bu yozuvlar rasmiy indeksga va baholashga ta'sir
// qiladi, ya'ni "saqlandi" deb ko'rsatib, aslida saqlamaslik mumkin emas.
const persistRecordRow = async (table, row, extra = {}) => {
    const { error } = await supabase.from(table).upsert({ id: row.id, ...extra, data: row });
    if (error) {
        const missing = /relation .* does not exist/i.test(error.message || '');
        throw new Error(missing
            ? 'Saqlanmadi: `' + table + '` jadvali topilmadi. Supabase SQL Editor da '
              + '`supabase/penalties_positions_sessions.sql` ni bir marta ishga tushiring.'
            : 'Saqlanmadi: ' + (error.message || ''));
    }
};

const persistClubPositionLog = async (log) => {
    try {
        await supabase.from('club_position_audit_logs').insert({
            id: log.id, application_id: log.applicationId || null,
            action: log.action || null, time: log.time || null, data: log,
        });
    } catch (e) { console.warn('Lavozim tarixi yozilmadi:', e.message); }
};

// Ijtimoiy faollik SOZLAMALARI uchun yozuvchilar (ball manbalari, mezonlar,
// bo'limlar). Ular ilgari faqat brauzerda saqlanardi va shu sababli har
// adminda boshqacha bo'lishi mumkin edi - ya'ni ikki admin ayni arizani
// tasdiqlab, har xil ball berardi.
const socialConfigTableError = (error) => {
    const missing = /relation .*(social_scoring_sources|social_criteria_).* does not exist/i.test(error?.message || '');
    return new Error(missing
        ? 'Sozlama saqlanmadi: jadval topilmadi. '
          + 'Supabase SQL Editor da `supabase/social_scoring_config.sql` ni bir marta ishga tushiring.'
        : 'Sozlama saqlanmadi: ' + (error?.message || ''));
};

const persistScoringSource = async (src) => {
    const { error } = await supabase.from('social_scoring_sources').upsert({
        id: src.id, code: src.code || null, category: src.category || null,
        academic_year: src.academicYear || null,
        is_active: src.isActive !== false, is_archived: !!src.isArchived, data: src,
    });
    if (error) throw socialConfigTableError(error);
};

const persistCriteriaCategory = async (cat) => {
    const { error } = await supabase.from('social_criteria_categories').upsert({
        id: cat.id, key: cat.key || null, name: cat.name || null, data: cat,
    });
    if (error) throw socialConfigTableError(error);
};

const persistCriteriaSubcategory = async (sub) => {
    const { error } = await supabase.from('social_criteria_subcategories').upsert({
        id: sub.id, category_id: sub.categoryId || null, name: sub.name || null, data: sub,
    });
    if (error) throw socialConfigTableError(error);
};

// Musobaqa o'tkazish yozuvlari va sertifikatlar uchun yagona yozuvchi.
//
// Ettita jadval bir xil shaklda (`id`, `competition_id`, `data`), shuning
// uchun har biriga alohida funksiya yozilmadi - qo'shimcha ustunlar
// chaqiruvda beriladi.
const competitionOpsTableError = (error) => {
    const missing = /relation .*(competition_participant|competition_advancement|competition_tiebreak|competition_appeal|competition_group_action|competition_case_roles|competition_question_points|competition_scoring_groups|issued_certificates).* does not exist/i.test(error?.message || '');
    return new Error(missing
        ? 'Saqlanmadi: musobaqa jadvallari topilmadi. '
          + 'Supabase SQL Editor da `supabase/competition_operations.sql` ni bir marta ishga tushiring.'
        : 'Saqlanmadi: ' + (error?.message || ''));
};

const persistCompetitionRow = async (table, row, extra = {}) => {
    const { error } = await supabase.from(table).upsert({
        id: row.id, competition_id: row.competitionId || null, ...extra, data: row,
    });
    if (error) throw competitionOpsTableError(error);
};

const socialAppRow = (a) => ({
    id: a.id, student_id: a.studentId || null, criteria_key: a.criteriaKey || null,
    status: a.status || null, submitted_at: a.submittedAt || null, data: a,
});

const flushSocialWrites = async () => {
    if (pendingSocialAppWrites.length > 0) {
        const rows = pendingSocialAppWrites.map(socialAppRow);
        pendingSocialAppWrites.length = 0;
        const { error } = await supabase.from('social_activity_applications').upsert(rows);
        if (error) throw socialTableError(error);
    }
    if (pendingSocialLogWrites.length > 0) {
        const rows = pendingSocialLogWrites.map(l => ({
            id: l.id, application_id: l.applicationId || null,
            action: l.action || null, time: l.time || null, data: l,
        }));
        pendingSocialLogWrites.length = 0;
        const { error } = await supabase.from('social_activity_audit_logs').insert(rows);
        if (error) throw socialTableError(error);
    }
};

// Seeds one default active scoring source per canonical criteria (appliesTo: 'student'), so approvals
// can resolve a configured point value immediately without requiring the admin to configure everything from scratch first.
const buildScoringSourcesSeed = () => {
    const defaults = {
        READING: { points: 5, name: 'Kitobxonlik faoliyati', desc: 'Standart kitobxonlik faoliyati uchun ball' },
        CLUBS: { points: 5, name: 'To\'garak faoliyati', desc: 'Tashabbus to\'garaklaridagi faollik uchun ball' },
        ACADEMIC: { points: 8, name: 'Akademik yutuq', desc: 'Akademik o\'zlashtirish bo\'yicha yutuqlar uchun ball' },
        DISCIPLINE: { points: 3, name: 'Ichki tartib', desc: 'Namunali intizom va odob-axloq uchun ball' },
        COMPETITIONS: { points: 10, name: 'Ko\'rik-tanlov yutug\'i', desc: 'Ko\'rik-tanlov va olimpiadalardagi yutuqlar uchun ball' },
        ATTENDANCE: { points: 2, name: 'Namunali davomat', desc: 'Yuqori davomat ko\'rsatkichi uchun ball' },
        EDUCATION: { points: 4, name: 'Ma\'rifat darsi faolligi', desc: 'Ma\'rifat darslaridagi faol ishtirok uchun ball' },
        VOLUNTEERING: { points: 6, name: 'Volontyorlik faoliyati', desc: 'Volontyorlik ishtirokchiligi uchun ball' },
        CULTURAL: { points: 3, name: 'Madaniy tashrif', desc: 'Madaniy tadbirlarga tashriflar uchun ball' },
        SPORTS: { points: 7, name: 'Sport yutug\'i', desc: 'Sport musobaqalaridagi ishtirok/yutuqlar uchun ball' },
        OTHER: { points: 2, name: 'Boshqa ijtimoiy faollik', desc: 'Boshqa turdagi ijtimoiy faollik uchun ball' }
    };

    const academicYear = getCurrentAcademicYear();
    const effectiveDate = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);

    return Object.entries(defaults).map(([criteriaKey, cfg], i) => ({
        id: `ssrc_${i + 1}`,
        name: cfg.name,
        code: `${criteriaKey.slice(0, 4)}-STD`,
        category: criteriaKey,
        description: cfg.desc,
        points: cfg.points,
        appliesTo: 'student',
        isActive: true,
        isArchived: false,
        academicYear,
        effectiveDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }));
};

// Finds the applicable active scoring source for a given application, matched by criteria category
// (falls back to the most recently effective source if none match the current academic year exactly)
const findActiveScoringSourceInternal = (dbData, application) => {
    const sources = (dbData.scoringSources || []).filter(s =>
        s.category === application.criteriaKey &&
        s.appliesTo === 'student' &&
        s.isActive && !s.isArchived &&
        new Date(s.effectiveDate) <= new Date()
    );
    if (sources.length === 0) return null;

    const currentYear = getCurrentAcademicYear();
    const yearMatches = sources.filter(s => s.academicYear === currentYear);
    const pool = yearMatches.length > 0 ? yearMatches : sources;

    return pool.slice().sort((a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate))[0];
};

// Dynamic, admin-editable replacement for the SOCIAL_ACTIVITY_CRITERIA constant - seeded from it verbatim
// so nothing about today's behavior changes on migration; from here on the constant is only the SEED/
// fallback shape, `socialCriteriaCategories` is the live source of truth going forward (mirrors how
// scoringSources already relates to the criteria keys). `key` is kept identical to the original constant
// key (e.g. 'READING') so every existing lookup by criteriaKey/category keeps working unchanged.
const buildSocialCriteriaCategoriesSeed = () => Object.entries(SOCIAL_ACTIVITY_CRITERIA).map(([key, c], i) => ({
    id: `scat_${i + 1}`,
    key,
    name: c.name,
    maxPoints: c.maxPoints,
    description: c.description,
    isActive: true,
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
}));

const socialActivitySeed = buildSocialActivitySeed();
const scoringSourcesSeed = buildScoringSourcesSeed();
const socialCriteriaCategoriesSeed = buildSocialCriteriaCategoriesSeed();
// Sub-kategoriyalar - hozircha bo'sh: har mezonning haqiqiy sub-kategoriya ro'yxati muhokama orqali
// admin tomonidan "Ijtimoiy faollik" sozlamalaridan (B-bosqich) qo'shiladi, kodda taxmin qilinmaydi.
const socialCriteriaSubcategoriesSeed = [];

// "Stipendiyalar" applications queue (Admin -> Tasdiqlash tab). Grants themselves (title/type/amount/
// deadline/criteria/required docs) still live entirely in ScholarshipManagement.jsx's own local/
// localStorage state - out of scope for this pass, per direct instruction ("grants/criteria/docTypes
// qismlariga tegmayman"). `grantTitle` here is just a plain string matching one of that component's
// default grant titles, same shape the component's own pre-existing mock applications already used.
const SCHOLARSHIP_GRANT_TITLES = ['Iqtidorli talabalar granti', 'Ijtimoiy himoya stipendiyasi', 'Rektor stipendiyasi'];
const buildScholarshipApplicationsSeed = () => {
    const students = generateSyntheticStudents();
    const docNames = ['portfolio.pdf', 'certificate.pdf', 'ariza.pdf', 'tavsiyanoma.pdf', 'cv.pdf'];
    const statuses = ['Kutilmoqda', 'Kutilmoqda', 'Kutilmoqda', 'Tasdiqlangan', 'Rad etilgan'];
    const now = Date.now();
    return Array.from({ length: 8 }).map((_, i) => {
        const student = students[(i * 37 + 5) % students.length];
        const daysAgo = 3 + i * 4;
        const submittedAt = new Date(now - daysAgo * 86400000).toISOString();
        const status = statuses[i % statuses.length];
        return {
            id: 'schapp_' + (i + 1),
            studentId: student.id,
            grantTitle: SCHOLARSHIP_GRANT_TITLES[i % SCHOLARSHIP_GRANT_TITLES.length],
            docName: docNames[i % docNames.length],
            submittedAt,
            status,
            reviewedBy: status === 'Kutilmoqda' ? null : 'admin',
            reviewedAt: status === 'Kutilmoqda' ? null : new Date(now - (daysAgo - 1) * 86400000).toISOString()
        };
    });
};
const scholarshipApplicationsSeed = buildScholarshipApplicationsSeed();

// --- Club/membership/event seed expansion (needed by both fresh installs and the getDB() migration below) ---

const BASE_CLUBS = [
    { id: '1', name: 'Madaniyat va San\'at', description: 'Musiqa, teatr va san\'at yo\'nalishidagi yoshlar', category: 'San\'at', membersCount: 156, headCoordinatorId: 'talaba', pointsModifier: 1.0, createdAt: new Date().toISOString() },
    { id: '2', name: 'Sport: Universitet Chempionlari', description: 'Sog\'lom hayot va sport musobaqalari', category: 'Sport', membersCount: 230, headCoordinatorId: null, pointsModifier: 1.2, createdAt: new Date().toISOString() },
    { id: '3', name: 'IT & Innovatsiyalar', description: 'Dasturlash va zamonaviy texnologiyalar', category: 'IT', membersCount: 189, headCoordinatorId: null, pointsModifier: 1.5, createdAt: new Date().toISOString() },
];

const BASE_MEMBERSHIPS = [
    // { id, userId, clubId, role: 'member' | 'volunteer' | 'smm' | 'coordinator' | 'head_coordinator', joinedAt }
    { id: 'm1', userId: 'talaba', clubId: '1', role: 'head_coordinator', joinedAt: new Date().toISOString() },
    { id: 'm2', userId: 'talaba', clubId: '3', role: 'member', joinedAt: new Date().toISOString() },
];

const BASE_EVENTS = [
    // { id, clubId, title, description, date, status: 'upcoming' | 'ongoing' | 'completed', participants: [{ userId, attended, score, placement }],
    //   location?: string, linkedCompetitionId?: string (set when auto-created from a tournament with an "O'tkazilish joyi" - see TournamentCreateWizard.jsx) }
    {
        id: 'e1', clubId: '3', title: 'Hackathon 2026', description: 'Barcha IT yo\'nalishi talabalari uchun kod yozish musobaqasi',
        date: new Date(Date.now() + 86400000 * 5).toISOString(), status: 'upcoming', participants: []
    },
    {
        id: 'e2', clubId: '1', title: 'Bahorgi Konsert', description: 'Talabalar ishtirokida jonli ijro',
        date: new Date(Date.now() - 86400000 * 2).toISOString(), status: 'completed',
        participants: [
            { userId: 'talaba', attended: true, score: 95, placement: '1st' }
        ]
    }
];

const NEW_CLUB_DEFS = [
    { id: '4', name: 'Kitobxonlik klubi "Ma\'rifat"', description: 'Badiiy adabiyot va kitobxonlik madaniyatini rivojlantirish', category: 'Kitobxonlik', pointsModifier: 1.0 },
    { id: '5', name: 'Volontyorlik markazi', description: 'Ijtimoiy-xayriya tashabbuslari va volontyorlik faoliyati', category: 'Volontyorlik', pointsModifier: 1.1 },
    { id: '6', name: 'Tadbirkorlik va bandlik klubi', description: 'Startap va tadbirkorlik ko\'nikmalarini rivojlantirish', category: 'Biznes', pointsModifier: 1.0 },
    { id: '7', name: 'Notiqlik va intellektual o\'yinlar klubi', description: 'Notiqlik san\'ati, debat va intellektual musobaqalar', category: 'Notiqlik', pointsModifier: 1.2 },
    { id: '8', name: 'Ma\'naviyat va ma\'rifat klubi', description: 'Ma\'naviy-ma\'rifiy tadbirlar va tarbiyaviy ishlar', category: 'Ma\'rifat', pointsModifier: 1.0 },
    // Real, purpose-built clubs for the tournament creation wizard's "Klub" field - distinct from the
    // generic direction-style clubs above (e.g. "Madaniyat va San'at" is a category label, not an
    // actual club, so it's never scoped to any competition-type preset and won't appear there). This
    // is the full official club/project roster, each mapped to its own competition-type preset(s) in
    // src/config/competitionEngines.js (PRESETS) - see the *_CLUB_ID constants there.
    { id: '9', name: 'TSUL Court loyihasi', description: 'Sud jarayoni simulyatsiyasi va yuridik notiqlik musobaqalari', category: 'Yuridik', pointsModifier: 1.2 },
    { id: '10', name: 'TSUL Zakovat loyihasi', description: 'Intellektual o\'yinlar va bilimlar musobaqalari klubi', category: 'Intellektual', pointsModifier: 1.2 },
    { id: '11', name: 'Orator Academy & Munozara klubi', description: 'Notiqlik san\'ati va bahs-munozara musobaqalari klubi', category: 'Notiqlik', pointsModifier: 1.2 },
    { id: '12', name: 'Vokal va cholg\'u ansambli', description: 'Vokal va cholg\'u ijrochiligi yo\'nalishi klubi', category: 'San\'at', pointsModifier: 1.0 },
    { id: '13', name: '"Dance zone" raqs klubi', description: 'Zamonaviy va milliy raqs yo\'nalishi klubi', category: 'San\'at', pointsModifier: 1.0 },
    { id: '14', name: 'Talabalar teatr studiyasi', description: 'Teatr san\'ati va sahna ijrochiligi studiyasi', category: 'San\'at', pointsModifier: 1.0 },
    { id: '15', name: 'TEDxTSUL loyihasi', description: 'Notiqlik va g\'oyalarni taqdim etish loyihasi', category: 'Notiqlik', pointsModifier: 1.1 },
    { id: '16', name: '25-savol', description: 'Tezkor bilim va zakovat viktorinasi loyihasi', category: 'Intellektual', pointsModifier: 1.1 },
    { id: '17', name: 'Quvnoqlar va zukkolar klubi', description: 'KVN uslubidagi hazil-mutoyiba va zukkolik klubi', category: 'Ijodiy', pointsModifier: 1.0 },
    { id: '18', name: 'Discovery club', description: 'Fan va kashfiyotlarni o\'rganish klubi', category: 'Ilmiy', pointsModifier: 1.0 },
    { id: '19', name: '"Zukko kitobxon" loyihasi', description: 'Kitobxonlik va bilimdonlik bo\'yicha talabalar loyihasi', category: 'Kitobxonlik', pointsModifier: 1.0 },
    { id: '20', name: '"G\'afur G\'ulom izdoshlari"', description: 'Adabiyot va ijodkorlik yo\'nalishidagi talabalar klubi', category: 'Adabiyot', pointsModifier: 1.0 },
    { id: '21', name: 'Girls development GDC', description: 'Qizlarni rivojlantirish va liderlik klubi', category: 'Rivojlanish', pointsModifier: 1.0 },
    { id: '22', name: '"Yuksalish sari" klubi', description: 'Shaxsiy va jamoaviy rivojlanish klubi', category: 'Rivojlanish', pointsModifier: 1.0 },
    { id: '23', name: 'CUDC loyihasi', description: 'Talabalar rivojlanish va tashabbuskorlik loyihasi', category: 'Rivojlanish', pointsModifier: 1.0 },
    { id: '24', name: 'Qomus loyihasi', description: 'Umumiy bilimlar va qomusiy savollar loyihasi', category: 'Intellektual', pointsModifier: 1.0 },
    { id: '25', name: '"Zukko yurist" loyihasi', description: 'Yuridik bilim va mahorat bo\'yicha talabalar loyihasi', category: 'Yuridik', pointsModifier: 1.1 },
    { id: '26', name: 'Kompyuter savodxonligi loyihasi', description: 'Raqamli ko\'nikmalar va kompyuter savodxonligi loyihasi', category: 'IT', pointsModifier: 1.0 },
    { id: '27', name: 'TSUL PAC', description: 'Talabalar tashabbuskorlik va faollik loyihasi', category: 'Rivojlanish', pointsModifier: 1.0 },
    { id: '28', name: 'TSUL UP loyihasi', description: 'Talabalar rivojlanish loyihasi', category: 'Rivojlanish', pointsModifier: 1.0 },
    { id: '29', name: 'TSUL UFS', description: 'Talabalar tashabbuskorlik loyihasi', category: 'Rivojlanish', pointsModifier: 1.0 },
    { id: '30', name: 'Voleybol', description: 'Voleybol sport klubi', category: 'Sport', pointsModifier: 1.2 },
    { id: '31', name: 'Basketbol', description: 'Basketbol sport klubi', category: 'Sport', pointsModifier: 1.2 },
    { id: '32', name: 'Futbol', description: 'Futbol sport klubi', category: 'Sport', pointsModifier: 1.2 },
    { id: '33', name: 'Badminton', description: 'Badminton sport klubi', category: 'Sport', pointsModifier: 1.1 },
    { id: '34', name: 'Stol tennisi', description: 'Stol tennisi sport klubi', category: 'Sport', pointsModifier: 1.1 },
    { id: '35', name: 'Fitnes', description: 'Fitnes va jismoniy tayyorgarlik klubi', category: 'Sport', pointsModifier: 1.0 },
    { id: '36', name: 'Armrestling', description: 'Qo\'l kurashi (armrestling) sport klubi', category: 'Sport', pointsModifier: 1.1 },
    { id: '37', name: 'Shaxmat va shashka', description: 'Shaxmat va shashka sport klubi', category: 'Sport', pointsModifier: 1.1 },
    { id: '38', name: 'Yengil atletika', description: 'Yengil atletika sport klubi', category: 'Sport', pointsModifier: 1.1 },
    { id: '39', name: 'Bodibilding', description: 'Bodibilding sport klubi', category: 'Sport', pointsModifier: 1.1 },
    { id: '40', name: 'Kurash', description: 'Milliy kurash sport klubi', category: 'Sport', pointsModifier: 1.2 },
    { id: '41', name: 'Yurist loyihasi', description: 'Yuridik ta\'lim va amaliyot loyihasi', category: 'Yuridik', pointsModifier: 1.0 },
    { id: '42', name: 'Miss leaders', description: 'Qizlar orasida liderlik va mahorat tanlovi', category: 'Rivojlanish', pointsModifier: 1.0 },
    // Added in the "professional competition ecosystem" wave - UniQuiz's own dedicated club/project
    // (7 faculties, 3-stage format). Kept in this same array (not a separate list) so it's covered by
    // NEW_CLUB_DEFS' existing seeding logic; picked up for already-saved DBs by _clubRosterV2 below,
    // since _fullClubRosterV1 already ran for anyone with an existing localStorage DB and won't re-fire.
    { id: '43', name: 'UniQuiz loyihasi', description: "Fakultetlararo ko'p bosqichli intellektual bellashuv", category: 'Intellektual', pointsModifier: 1.2 }
];

// Deterministic (no Math.random) expansion connecting the 550 mock students to the club roster,
// so the Global Klublar leaderboard has real substance instead of ~2 disconnected seed rows.
const buildClubSeedExpansion = (baseClubs) => {
    const students = generateSyntheticStudents();
    const newClubs = NEW_CLUB_DEFS.map(def => ({
        ...def,
        membersCount: 0, // synced by syncClubMemberCounts() after memberships are built
        headCoordinatorId: null,
        createdAt: new Date().toISOString()
    }));
    const allClubIds = [...baseClubs.map(c => c.id), ...newClubs.map(c => c.id)];

    const newMemberships = [];
    let counter = 1;
    students.forEach((student, i) => {
        if (i % 9 >= 5) return; // ~55% of students get a membership
        const clubId = allClubIds[i % allClubIds.length];
        let role = 'member';
        if (i % 50 === 0) role = 'coordinator';
        else if (i % 90 === 3) role = 'volunteer';
        else if (i % 110 === 7) role = 'smm';
        newMemberships.push({
            id: `mseed_${counter++}`,
            userId: student.id,
            clubId,
            role,
            joinedAt: new Date(Date.now() - (i % 300) * 86400000).toISOString()
        });

        if (i % 8 === 0) { // ~12% of joiners get a second membership in a different club
            const secondClubId = allClubIds[(i + 3) % allClubIds.length];
            if (secondClubId !== clubId) {
                newMemberships.push({
                    id: `mseed_${counter++}`,
                    userId: student.id,
                    clubId: secondClubId,
                    role: 'member',
                    joinedAt: new Date(Date.now() - (i % 300) * 86400000).toISOString()
                });
            }
        }
    });

    // Promote one member per new club to head_coordinator (existing clubs already have their own, or none)
    newClubs.forEach(club => {
        const firstMember = newMemberships.find(m => m.clubId === club.id && m.role === 'member');
        if (firstMember) firstMember.role = 'head_coordinator';
    });

    return { newClubs, newMemberships };
};

const syncClubMemberCounts = (clubs, memberships) => {
    clubs.forEach(club => {
        club.membersCount = memberships.filter(m => m.clubId === club.id).length;
    });
};

// Next sequential public display number (Klub #N / Jamoa #N / Tadbir #N / Turnir #N / Sertifikat #N) for a
// newly-created record - purely additive, never reused, independent of the internal id format.
const nextDisplayNumber = (list) => Math.max(0, ...list.map(r => r.displayNumber || 0)) + 1;

// Combines a `yyyy-MM-dd` date input with an optional `HH:mm` time input into the same ISO-ish
// datetime string shape used throughout (e.g. the wizard's auto-created event date). Missing time
// defaults to midnight, matching the app's existing convention for "no time chosen".
const combineDateTime = (date, time) => `${date}T${time || '00:00'}:00`;

// Mirrors RegistrationSettingsFields.jsx's getRegistrationWindowIssues (kept as a small local duplicate
// rather than importing that UI-layer file into db.js) - db.js is the final write-time choke point
// regardless of which UI path calls it, matching findLocationConflict's own defense-in-depth pattern just
// below. `record` is either a competition (startDate+startTime, not yet combined) or an event payload
// (date already combined via combineDateTime by the time it reaches createEvent/updateEvent).
const findRegistrationWindowIssue = (record, { isNew = false } = {}) => {
    const opensAt = record.registrationOpensAt ? new Date(record.registrationOpensAt) : null;
    const closesAt = record.registrationClosesAt ? new Date(record.registrationClosesAt) : null;
    const startAtRaw = record.startDate ? combineDateTime(record.startDate, record.startTime) : (record.date || null);
    const startAt = startAtRaw ? new Date(startAtRaw) : null;

    // Past-dating guard - only on CREATE. A brand-new tadbir/musobaqa can't be scheduled to have already
    // started, nor open its registration before the moment it's being created. Deliberately NOT applied on
    // update: an event that legitimately happened last week must still be editable (rename, mark
    // completed, fix a typo) without its own past date being rejected.
    // Compared at MINUTE granularity (seconds zeroed), so creating at 08:00 and picking 08:00 is valid
    // while 07:59 is not - matching what the form's own datetime-local `min` allows, and avoiding a
    // spurious rejection from the few hundred ms between validating and writing.
    const nowMinute = (() => { const d = new Date(); d.setSeconds(0, 0); return d; })();
    if (isNew && startAt) {
        // A start moment of exactly midnight means "date chosen, time left blank" (combineDateTime's own
        // convention) - judge those by date alone, so creating a same-day event without picking a time
        // isn't rejected just because 00:00 already passed.
        const timeWasChosen = !(startAt.getHours() === 0 && startAt.getMinutes() === 0);
        const todayStart = new Date(nowMinute.getFullYear(), nowMinute.getMonth(), nowMinute.getDate());
        if (timeWasChosen ? startAt < nowMinute : startAt < todayStart) {
            return "Boshlanish sanasi/vaqti o'tmishda bo'lishi mumkin emas.";
        }
    }
    if (isNew && opensAt && opensAt < nowMinute) {
        return "Ro'yxatdan o'tish boshlanish vaqti o'tmishda bo'lishi mumkin emas.";
    }

    if (!record.registrationRequired) return null;
    if (opensAt && closesAt && opensAt > closesAt) {
        return "Ro'yxatdan o'tish boshlanish vaqti tugash vaqtidan keyin bo'lishi mumkin emas.";
    }
    if (closesAt && startAt && closesAt > startAt) {
        return "Ro'yxatdan o'tish tugash vaqti boshlanish sanasi/vaqtidan keyin bo'lishi mumkin emas.";
    }
    if (opensAt && startAt && opensAt > startAt) {
        return "Ro'yxatdan o'tish boshlanish vaqti tadbir/musobaqaning o'z boshlanish vaqtidan keyin bo'lishi mumkin emas.";
    }
    return null;
};

// Location double-booking guard (registration feature): same normalized location string + the exact
// same start datetime (to the minute) as another already-scheduled event counts as a clash. Freeform
// text location, no venue registry exists - so this is a plain case/whitespace-insensitive match, not
// a real interval-overlap check (matches the literal "shu joy shu soatda band" ask, not partial overlaps).
// Pure/read-only - callers decide whether to throw or just warn.
// NOTE: the comment above describes the ORIGINAL behaviour and is superseded by what follows.
// How long a booking with no end time is assumed to hold the room, for overlap purposes only. Plain
// events store just a start moment, so without this two events an hour apart in the same room could
// never be said to clash. Never persisted, purely a comparison window.
const DEFAULT_BOOKING_MINUTES = 60;

const normalizeLocation = (loc) => (loc || '').trim().toLowerCase();

// EVERY thing that occupies a room, in one normalized shape: plain events, competitions, and each
// separately-scheduled Tur of a long-running competition (a 10-Tur tournament running over months holds
// its room on each Tur's own date, not only on the competition's start date). Single source for both the
// room calendar and the double-booking guard, so the calendar can never show a room as free that the
// guard considers busy, or the reverse.
const collectVenueOccupancy = (dbData) => {
    const rows = [];
    const push = (row) => {
        if (!row.venueLabel || !row.start || Number.isNaN(row.start.getTime())) return;
        rows.push({
            ...row,
            end: row.end && !Number.isNaN(row.end.getTime())
                ? row.end
                : new Date(row.start.getTime() + DEFAULT_BOOKING_MINUTES * 60000)
        });
    };

    // Musobaqaga biriktirilgan tadbir NUSXASI o'tkazib yuboriladi.
    //
    // Musobaqa yaratilganda unga kalendarda ko'rinishi uchun alohida tadbir yozuvi
    // ham yaratiladi (TournamentCreateWizard). Ya'ni BITTA voqea bazada IKKI marta
    // turadi. Bu ikki zarar berardi:
    //
    //   1. Xonalar bandligida bir musobaqa ikki qator bo'lib ko'rinardi. Musobaqa
    //      sanasi keyin o'zgartirilsa (updateCompetition nusxaga tegmaydi) - ikki
    //      xil vaqtda, ya'ni bo'sh xona band ko'rinardi.
    //   2. SOXTA TO'QNASHUV: findLocationConflict `sourceId` bo'yicha o'zini
    //      chetlab o'tadi, nusxaning sourceId'si esa boshqa. Natijada bog'langan
    //      tadbirni tahrirlaganda tizim uni O'Z nusxasi bilan to'qnashtirib
    //      "bu joy band: <o'sha tadbir nomi>" deb saqlashni rad etardi.
    //
    // Xonani musobaqaning O'ZI egallaydi - uning ma'lumoti har doim joriy.
    const competitionById = new Map((dbData.competitions || []).map(c => [c.id, c]));

    (dbData.events || []).forEach(e => {
        // Nusxa faqat musobaqaning O'ZI xonani egallayotgan bo'lsagina tashlanadi.
        // Aks holda (musobaqada joy ko'rsatilmagan, nusxada esa bor) bandlik
        // umuman ko'rinmay qolardi - bitta muammoni tuzatib ikkinchisini yasagan
        // bo'lardik.
        const linked = e.linkedCompetitionId ? competitionById.get(e.linkedCompetitionId) : null;
        if (linked?.location) return;
        const start = e.date ? new Date(e.date) : null;
        // `endTime` is 'HH:mm' on the SAME calendar day as the start (events don't span days).
        const end = start && e.endTime
            ? new Date(`${e.date.slice(0, 10)}T${e.endTime}:00`)
            : null;
        push({
            id: `event-${e.id}`, sourceId: e.id, kind: 'event', title: e.title, clubId: e.clubId,
            venueLabel: e.location, start, end,
            moderationStatus: e.moderationStatus || 'approved', createdBy: e.createdBy || null
        });
    });

    (dbData.competitions || []).forEach(c => {
        const clubId = c.contextType === 'club' ? c.contextId : null;
        push({
            id: `competition-${c.id}`, sourceId: c.id, kind: 'competition', title: c.name, clubId,
            venueLabel: c.location,
            start: c.startDate ? new Date(combineDateTime(c.startDate, c.startTime)) : null,
            end: c.startDate && c.endTime ? new Date(combineDateTime(c.startDate, c.endTime)) : null,
            moderationStatus: c.moderationStatus || 'approved', createdBy: c.ownerUsername || null
        });

        // Per-Tur schedule rows. Venue is OPTIONAL there, so a Tur without one simply occupies nothing,
        // exactly like a competition with no location.
        (dbData.competitionTurSchedule || [])
            .filter(t => t.competitionId === c.id && t.venueLabel && t.date)
            .forEach(t => push({
                id: `tur-${c.id}-${t.turIndex}-${t.groupId || 'umumiy'}`, sourceId: c.id, kind: 'tur',
                title: `${c.name} (${t.turIndex}-Tur)`, clubId,
                venueLabel: t.venueLabel,
                start: new Date(combineDateTime(t.date, t.startTime)),
                end: t.endTime ? new Date(combineDateTime(t.date, t.endTime)) : null,
                moderationStatus: c.moderationStatus || 'approved', createdBy: c.ownerUsername || null
            }));
    });

    return rows;
};

// Real interval overlap across ALL occupancy sources. Previously this compared only plain events, and
// only for an EXACTLY equal start minute, so a room booked 09:00-17:00 happily accepted another booking
// at 13:00, and competitions/Turs were invisible to it entirely.
const findLocationConflict = (dbData, location, startDateTime, excludeId = null, endDateTime = null) => {
    const normalized = normalizeLocation(location);
    if (!normalized || !startDateTime) return null;
    const start = new Date(startDateTime);
    if (Number.isNaN(start.getTime())) return null;
    const parsedEnd = endDateTime ? new Date(endDateTime) : null;
    const end = parsedEnd && !Number.isNaN(parsedEnd.getTime()) && parsedEnd > start
        ? parsedEnd
        : new Date(start.getTime() + DEFAULT_BOOKING_MINUTES * 60000);

    // Chetlab o'tiladigan ID'lar TO'PLAMI, bitta ID emas.
    //
    // Musobaqaga biriktirilgan tadbirni tahrirlaganda chaqiruvchi tadbirning
    // ID'sini beradi, xonani esa musobaqa egallaydi (collectVenueOccupancy nusxani
    // o'tkazib yuboradi) - ID'lar boshqa. Shu sabab bog'lanish ikki tomonga ham
    // ochib qo'yiladi, aks holda tadbir o'zining musobaqasi bilan to'qnashardi.
    const excluded = new Set();
    if (excludeId) {
        excluded.add(excludeId);
        const linkedEvent = (dbData.events || []).find(e => e.id === excludeId);
        if (linkedEvent?.linkedCompetitionId) excluded.add(linkedEvent.linkedCompetitionId);
        (dbData.events || [])
            .filter(e => e.linkedCompetitionId === excludeId)
            .forEach(e => excluded.add(e.id));
    }

    return collectVenueOccupancy(dbData).find(o =>
        !excluded.has(o.sourceId)
        && normalizeLocation(o.venueLabel) === normalized
        // A rejected activity isn't happening, so it shouldn't hold a room.
        && o.moderationStatus !== 'rejected'
        && start < o.end && end > o.start
    ) || null;
};

// Team names are unique PLATFORM-WIDE, not just per-club (user-confirmed 2026-08-13: "butun tizimda
// bitta Feniks jamoasi bo'lishi kerak" - one "Feniks" team anywhere in the system, ever). Case/whitespace
// -insensitive so "Feniks" and " feniks " collide too. Does NOT retroactively touch already-seeded teams
// (buildTeamsSeed writes dbData.teams directly, never through db.createTeam) - a coincidental duplicate
// among old seed data is left as-is, but blocks any NEW team from taking an already-used name, including
// one already used by seed data (that's the whole point of the rule, not a bug).
// A name is reserved not only by an already-materialized real team, but by ANY active (non-cancelled)
// team registration that claims it - otherwise two captains could simultaneously submit the same team
// name and only find out days later, whenever one of them happens to reach minTeamSize first
// (materialization, the only other moment this used to check). `excludeRegistrationId` is required by
// _materializeTeamFromRegistration: at that exact moment the registration BEING materialized still holds
// the name, so it must exclude itself or every materialization would spuriously "collide" with its own
// reservation.
const isTeamNameTaken = (dbData, name, excludeTeamId = null, excludeRegistrationId = null) => {
    const normalized = (name || '').trim().toLowerCase();
    if (!normalized) return false;
    const realTeamMatch = (dbData.teams || []).some(t => t.id !== excludeTeamId && (t.name || '').trim().toLowerCase() === normalized);
    if (realTeamMatch) return true;
    return (dbData.registrations || []).some(r =>
        r.id !== excludeRegistrationId && r.participantType === 'team' && r.status !== 'cancelled' &&
        (r.teamName || '').trim().toLowerCase() === normalized
    );
};

// Faculty/course eligibility - shared by every entry point that adds a REAL person to a restricted
// activity's roster: the initial captain/individual registration (registerForActivity), a teammate
// accepting an invite (respondToTeamInvite), and a teammate joining by code (joinTeamByCode). Previously
// only the initial registration enforced this, so a restriction could be silently bypassed by whoever
// the captain invited - this one shared check closes that gap for all three call sites at once instead
// of re-deriving the same two conditions three times. Empty/unset restriction arrays mean no restriction.
const checkEligibility = (activity, participant) => {
    const allowedFaculties = activity.restrictions?.byFaculty || [];
    if (allowedFaculties.length > 0 && participant?.faculty && !allowedFaculties.includes(participant.faculty)) {
        throw new Error(`Bu musobaqa faqat ${allowedFaculties.join(', ')} fakulteti uchun`);
    }
    const allowedCourses = activity.restrictions?.byCourse || [];
    if (allowedCourses.length > 0 && participant?.course != null && !allowedCourses.map(String).includes(String(participant.course))) {
        throw new Error(`Bu musobaqa faqat ${allowedCourses.map(c => c + '-kurs').join(', ')} uchun`);
    }
    // byGender/byProfessionalism are single-value selects (TournamentRulesStep.jsx), not multi-select
    // lists like byFaculty/byCourse above - '' means no restriction. Backed by the real gender/
    // professionalism fields added to generateSyntheticStudents/REAL_STUDENT_USERS specifically for this.
    const requiredGender = activity.restrictions?.byGender || '';
    if (requiredGender && participant?.gender && participant.gender !== requiredGender) {
        throw new Error(`Bu musobaqa faqat ${requiredGender === 'male' ? 'erkaklar' : 'ayollar'} uchun`);
    }
    const requiredProfessionalism = activity.restrictions?.byProfessionalism || '';
    if (requiredProfessionalism && participant?.professionalism && participant.professionalism !== requiredProfessionalism) {
        throw new Error(`Bu musobaqa faqat ${requiredProfessionalism === 'amateur' ? 'havaskorlar' : 'professionallar'} uchun`);
    }
};

// Team composition restriction ("Jamoa tarkibi: faqat bitta fakultetdan" toggle,
// RegistrationSettingsFields.jsx) - anchored to the CAPTAIN's own faculty/course (always
// `reg.participantSnapshot`, since a team registration's `participant` is always the captain - see
// registerForActivity), checked against every new member as they're invited/accepted/joined. Same three
// call sites as checkEligibility above (registerForActivity's invite list, respondToTeamInvite,
// joinTeamByCode). `activity.teamCompositionRule` absent/'mixed' means no restriction.
const checkTeamComposition = (activity, anchor, member) => {
    if (!activity || activity.teamCompositionRule !== 'single_faculty') return;
    if (anchor?.faculty && member?.faculty && anchor.faculty !== member.faculty) {
        throw new Error(`Jamoa tarkibi faqat "${anchor.faculty}" fakultetidan bo'lishi kerak - bu talaba boshqa fakultetdan`);
    }
    if (activity.teamCourseRule === 'single_course' && anchor?.course != null && member?.course != null && String(anchor.course) !== String(member.course)) {
        throw new Error(`Jamoa tarkibi faqat ${anchor.course}-kursdan bo'lishi kerak - bu talaba boshqa kursdan`);
    }
};

// ===========================================================================
// MANFAATLAR TO'QNASHUVI: bir klub doirasida LAVOZIM va ISHTIROK
//
// QOIDA: klubda lavozimda turgan talaba O'SHA klubning musobaqasida
// ishtirokchi bo'la olmaydi - na yakka, na jamoa tarkibida. Sabab oddiy:
// musobaqani tashkil qilayotgan odam o'sha musobaqada qatnashsa, natija
// adolatliligiga savol tug'iladi.
//
// IKKI TOMONLAMA: tekshiruv ikkala uchda ham turadi.
//   1. Lavozimga tayinlashda - talaba shu klub musobaqasida qatnashayotgan
//      bo'lsa, tayinlash to'xtaydi.
//   2. Ro'yxatdan o'tishda - talaba shu klubda lavozimda bo'lsa, ishtirok
//      to'xtaydi.
// Faqat bir tomonni tekshirish qoidani ochiq qoldirardi: taqiqni ikkinchi
// eshikdan aylanib o'tish mumkin bo'lardi.
//
// CHEGARA: faqat YAKUNLANMAGAN musobaqalar hisobga olinadi. Tugagan
// musobaqadagi ishtirok - tarix, uni "musobaqadan chiqib ketish" bilan
// bekor qilib bo'lmaydi, ya'ni bunday to'siqni yechishning iloji yo'q edi.
//
// QAMROV: faqat MUSOBAQALAR. Tadbir (tadbirlar, uchrashuvlar) bunga
// kirmaydi - koordinatorning o'z klubi tadbirida qatnashishi tabiiy va
// hech qanday to'qnashuv yaratmaydi.
// ===========================================================================

// Musobaqa qaysi klubniki. Klubga bog'lanmagan musobaqada to'qnashuv ham yo'q.
const competitionClubId = (comp) =>
    comp?.contextType === 'club' && comp?.contextId ? String(comp.contextId) : null;

const isCompetitionFinished = (comp) => (comp?.currentRound || 1) > (comp?.roundsCount || 1);

// Talabaning shu klubdagi FAOL lavozimlari (tayinlov + a'zolik roli).
const clubPositionsOf = (dbData, studentId, clubId) => {
    const ROLE_TO_POSITION = {
        head_coordinator: 'head_coordinator',
        coordinator: 'assistant_coordinator',
        smm: 'smm',
        volunteer: 'volunteer',
    };
    const titles = new Set();
    (dbData.clubPositionAssignments || [])
        .filter(a => a.studentId === studentId && String(a.clubId) === String(clubId) && a.status === 'active')
        .forEach(a => titles.add(a.positionTitle));
    if (titles.size === 0) {
        const membership = (dbData.memberships || []).find(m =>
            m.userId === studentId && String(m.clubId) === String(clubId));
        const mapped = ROLE_TO_POSITION[membership?.role];
        if (mapped) titles.add(mapped);
    }
    return Array.from(titles);
};

// Talaba shu musobaqada qatnashyaptimi - UCHTA manba tekshiriladi, chunki
// ishtirok uch yo'l bilan yoziladi:
//   1. `registrations` - o'zi ro'yxatdan o'tgan yoki jamoaga taklif qilingan
//   2. `comp.participants` - mas'ul ro'yxatga qo'lda qo'shgan
//   3. jamoa tarkibi - jamoa ishtirokchi bo'lsa, uning HAR a'zosi ishtirokchi
// Faqat bittasiga qarash taqiqni ochiq qoldirardi.
const participationInCompetition = (dbData, studentId, comp) => {
    const registration = (dbData.registrations || []).find(r =>
        r.activityType === 'competition'
        && r.activityId === comp.id
        && r.status !== 'cancelled'
        && (r.userId === studentId
            || (r.teamMembers || []).some(m => m.userId === studentId && m.status !== 'declined')));
    if (registration) {
        return registration.participantType === 'team'
            ? { as: 'team', teamName: registration.teamName || 'Jamoa' }
            : { as: 'individual', teamName: null };
    }

    for (const p of (comp.participants || [])) {
        if (p.id === studentId || p.userId === studentId) return { as: 'individual', teamName: null };
        // Jamoa yozuvi - `id` jamoaning identifikatori, tarkibi alohida turadi.
        const members = (dbData.teamMembers || []).filter(m => m.teamId === p.id);
        if (members.some(m => m.userId === studentId)) {
            return { as: 'team', teamName: p.name || 'Jamoa' };
        }
    }
    return null;
};

// Talabaning shu klub musobaqalaridagi ishtiroki.
const clubCompetitionParticipation = (dbData, studentId, clubId) =>
    (dbData.competitions || [])
        .filter(c => competitionClubId(c) === String(clubId) && !isCompetitionFinished(c))
        .map(c => {
            const involvement = participationInCompetition(dbData, studentId, c);
            return involvement ? { id: c.id, name: c.name, ...involvement } : null;
        })
        .filter(Boolean);

// Xabar matni ikkala tomonda ham bir xil mantiqda tuziladi: NIMA to'sqinlik
// qilyapti va uni QANDAY yechish mumkin. "Ruxsat yo'q" deb qo'ya qolish
// foydalanuvchini nima qilishni bilmay qoldirardi.
const positionConflictMessage = (studentName, clubName, involvement) => {
    const where = involvement
        .map(c => (c.as === 'team' ? `"${c.name}" ("${c.teamName}" jamoasi tarkibida)` : `"${c.name}"`))
        .join(', ');
    return `${studentName || 'Bu talaba'}ni lavozimga tayinlab bo'lmaydi: u "${clubName}" klubining `
        + `${where} musobaqasida ishtirok etmoqda. Tayinlash uchun avval u musobaqa ishtirokchilari `
        + `ro'yxatidan (yoki jamoa tarkibidan) chiqarilishi kerak.`;
};

const participationConflictMessage = (studentName, clubName, positionTitles) => {
    const titles = positionTitles.map(t => POSITION_TYPE_LABELS[t] || t).join(', ');
    return `${studentName || 'Bu talaba'} "${clubName}" klubida ${titles} lavozimida — shuning uchun `
        + `shu klubning musobaqasida ishtirok eta olmaydi. Ishtirok etish uchun avval lavozimdan `
        + `bo'shatilishi kerak.`;
};

// TAYINLASH TOMONI: talabani shu klubda lavozimga qo'yish mumkinmi.
const assertCanHoldClubPosition = (dbData, studentId, clubId, studentName = null) => {
    const involvement = clubCompetitionParticipation(dbData, studentId, clubId);
    if (involvement.length === 0) return;
    const club = (dbData.clubs || []).find(c => String(c.id) === String(clubId));
    throw new Error(positionConflictMessage(studentName, club?.name || 'klub', involvement));
};

// ISHTIROK TOMONI: talabani shu musobaqaga qo'shish mumkinmi.
// Musobaqa klubga bog'lanmagan bo'lsa - tekshiradigan narsa yo'q.
const assertCanJoinClubCompetition = (dbData, studentId, comp, studentName = null) => {
    const clubId = competitionClubId(comp);
    if (!clubId) return;
    const positions = clubPositionsOf(dbData, studentId, clubId);
    if (positions.length === 0) return;
    const club = (dbData.clubs || []).find(c => String(c.id) === String(clubId));
    throw new Error(participationConflictMessage(studentName, club?.name || 'klub', positions));
};

// Registration-window state for both competitions and plain events. `startDateTime` is the record's own
// start moment (event.date, or the caller-combined competition startDate+startTime) - used as the
// implicit close time when none was chosen. The raw building block both isRegistrationOpen (a plain
// boolean gate, used to actually allow/block a registration write) and RegistrationStatusBadge.jsx (a
// 3-way badge: not yet open / open / closed, needs to tell WHICH edge, not just open-or-not) need - kept
// as one shared function so the two can never silently diverge on what "open" means (RegistrationStatusBadge
// used to reimplement this same opensAt/closesAt comparison from scratch).
const getRegistrationWindowState = (record, startDateTime, now = new Date()) => {
    if (!record.registrationRequired) return { state: 'open', opensAt: null, closesAt: null };
    const opensAt = record.registrationOpensAt ? new Date(record.registrationOpensAt) : null;
    const closesAt = new Date(record.registrationClosesAt || startDateTime);
    if (opensAt && now < opensAt) return { state: 'not_open', opensAt, closesAt };
    if (now > closesAt) return { state: 'closed', opensAt, closesAt };
    return { state: 'open', opensAt, closesAt };
};

// `registrationRequired` falsy/undefined means "no gating at all" - the legacy, still-default behavior
// for every record created before this feature existed (getRegistrationWindowState returns 'open' then).
const isRegistrationOpen = (record, startDateTime, now = new Date()) =>
    getRegistrationWindowState(record, startDateTime, now).state === 'open';

// Notifications are Phase 2 Supabase-backed (see the REAL-BACKEND BRIDGE section below) - this inserts
// directly rather than mutating a passed-in dbData snapshot the old synchronous version did. Callers
// await this and don't need their own saveDB() afterward for the notification itself.
const addNotificationToSupabase = async (notif) => {
    const id = 'notif_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
    const { data, error } = await supabase.from('notifications').insert({
        id, user_id: notif.userId, type: notif.type, title: notif.title, message: notif.message,
        ref_id: notif.refId || null, ref_type: notif.refType || null, is_read: false,
        expires_at: notif.expiresAt || null
    }).select().single();
    if (error) throw error;
    return { id: data.id, userId: data.user_id, type: data.type, title: data.title, message: data.message,
        refId: data.ref_id, refType: data.ref_type, isRead: data.is_read, createdAt: data.created_at, expiresAt: data.expires_at };
};

// ~2 completed events per club (drives the "approved club activities" component of getClubScoreBreakdown),
// plus a couple left 'upcoming' for realism.
const buildClubEventsExpansion = (allClubs, allMemberships) => {
    const eventTitles = ['Bahorgi tadbir', 'Ochiq eshiklar kuni', 'Yakuniy tanlov', 'Amaliy trening', 'Uchrashuv-seminar', 'Faol a\'zolar kechasi'];
    const newEvents = [];
    let counter = 3;

    allClubs.forEach(club => {
        const clubMemberIds = allMemberships.filter(m => m.clubId === club.id).map(m => m.userId);
        for (let round = 0; round < 2; round++) {
            const daysAgo = 20 + round * 45 + (parseInt(club.id, 10) * 5);
            const participantsPool = clubMemberIds.slice(0, Math.min(clubMemberIds.length, 5 + round * 5));
            const participants = participantsPool.map((userId, pi) => ({
                userId,
                attended: true,
                score: 10 + ((pi * 7 + round * 3) % 41),
                placement: pi === 0 ? '1st' : pi === 1 ? '2nd' : pi === 2 ? '3rd' : null
            }));
            newEvents.push({
                id: `e${counter++}`,
                clubId: club.id,
                title: `${eventTitles[(parseInt(club.id, 10) + round) % eventTitles.length]} - ${club.name}`,
                description: `${club.name} klubi tomonidan tashkil etilgan tadbir`,
                date: new Date(Date.now() - daysAgo * 86400000).toISOString(),
                status: 'completed',
                participants
            });
        }
    });

    // Leave the 2 most recently generated events as 'upcoming' (no scores yet) for realism
    for (let k = 1; k <= 2 && newEvents.length - k >= 0; k++) {
        const ev = newEvents[newEvents.length - k];
        ev.status = 'upcoming';
        ev.date = new Date(Date.now() + k * 10 * 86400000).toISOString();
        ev.participants = [];
    }

    return newEvents;
};

// Deterministic (no Math.random) real, persisted teams for the Clubs Directory's team profiles -
// distinct from getMockTeams() below, which only generates ephemeral participant placeholders for
// competition creation. 2-4 teams per club; rosters are drawn from that club's REAL memberships first
// (built above), only padded with generic students if a club genuinely has too few members.
const TEAM_NAME_PREFIXES = ['Yulduz', 'Olov', "G'alaba", 'Sharq', 'Zabt', 'Nur', 'Chaqmoq', 'Tong'];
const TEAM_NAME_SUFFIXES = ['jamoasi', 'guruhi', 'ittifoqi', 'jangchilari', 'yulduzlari'];

const buildTeamsSeed = (allClubs, allMemberships) => {
    const students = generateSyntheticStudents();
    const newTeams = [];
    const newTeamMembers = [];
    let teamCounter = 1;
    let memberCounter = 1;

    allClubs.forEach(club => {
        const clubIdNum = parseInt(club.id, 10) || 0;
        const teamCount = 2 + (clubIdNum % 3); // 2-4, deterministic per club
        const clubMembers = allMemberships.filter(m => m.clubId === club.id);

        for (let t = 0; t < teamCount; t++) {
            const teamId = `team_${teamCounter++}`;
            const prefix = TEAM_NAME_PREFIXES[(clubIdNum + t) % TEAM_NAME_PREFIXES.length];
            const suffix = TEAM_NAME_SUFFIXES[(clubIdNum + t * 3) % TEAM_NAME_SUFFIXES.length];
            newTeams.push({
                id: teamId,
                clubId: club.id,
                name: `${prefix} ${suffix}`,
                description: `${club.name} klubining ${t + 1}-jamoasi`,
                foundedAt: new Date(Date.now() - (200 + clubIdNum * 7 + t * 30) * 86400000).toISOString()
            });

            const teamSize = 4 + ((clubIdNum + t) % 3); // 4-6 members
            let roster = clubMembers.slice(t * teamSize, t * teamSize + teamSize);
            if (roster.length === 0 && clubMembers.length > 0) roster = clubMembers.slice(0, teamSize);

            if (roster.length > 0) {
                roster.forEach((m, mi) => {
                    newTeamMembers.push({
                        id: `tm_${memberCounter++}`,
                        teamId,
                        userId: m.userId,
                        role: mi === 0 ? 'captain' : 'member',
                        joinedAt: m.joinedAt
                    });
                });
            } else {
                // Club genuinely has no real members yet - pad with deterministic generic students so
                // the team profile still has a real (if not club-affiliated) roster to show.
                const start = (clubIdNum * 3 + t * teamSize) % students.length;
                for (let mi = 0; mi < teamSize; mi++) {
                    const student = students[(start + mi) % students.length];
                    newTeamMembers.push({
                        id: `tm_${memberCounter++}`,
                        teamId,
                        userId: student.id,
                        role: mi === 0 ? 'captain' : 'member',
                        joinedAt: new Date(Date.now() - (100 + mi * 10) * 86400000).toISOString()
                    });
                }
            }
        }
    });

    return { newTeams, newTeamMembers };
};

// KLUB YUTUQLARI SOXTA MA'LUMOTI O'CHIRILDI.
//
// Bu yerda `buildAchievementsSeed` turardi: har klub o'z ID RAQAMIDAN kelib
// chiqib 1-3 ta yutuq olardi, nomi beshta oldindan yozilgan qatordan
// ("Bahorgi Kubok", "Respublika Chempionati"...), o'rni `clubId % 3` dan,
// sanasi esa "bugundan N kun oldin" formulasidan chiqardi.
//
// Ular bazadagi birorta musobaqa, hujjat yoki natija bilan bog'lanmagan
// edi va klub sahifasida tashqi odam ko'radigan yolg'on bo'lib turardi.
// Ustiga-ustak jamoalar reytingi aynan shu soxta o'rinlardan hisoblanardi.
//
// O'rniga ikkita haqiqiy manba: berilgan rasmiy hujjatlardan avtomatik
// chiqadigan ichki yutuqlar va dalil bilan kiritiladigan tashqi yutuqlar
// (izohi db.getClubAchievements ustida).

const clubSeedExpansion = buildClubSeedExpansion(BASE_CLUBS);
const allClubsSeed = [...BASE_CLUBS, ...clubSeedExpansion.newClubs];
const allMembershipsSeed = [...BASE_MEMBERSHIPS, ...clubSeedExpansion.newMemberships];
syncClubMemberCounts(allClubsSeed, allMembershipsSeed);
const allEventsSeed = [...BASE_EVENTS, ...buildClubEventsExpansion(allClubsSeed, allMembershipsSeed)];
const teamsSeedResult = buildTeamsSeed(allClubsSeed, allMembershipsSeed);
const allTeamsSeed = teamsSeedResult.newTeams;
const allTeamMembersSeed = teamsSeedResult.newTeamMembers;

// Initial Database Schema and Seed Data
const initialData = {
    clubs: allClubsSeed,
    memberships: allMembershipsSeed,
    events: allEventsSeed,
    // Clubs Directory: real, persisted teams/team_members (distinct from the ephemeral getMockTeams()
    // used only by competition creation) and a club/team achievement history.
    teams: allTeamsSeed,
    teamMembers: allTeamMembersSeed,
    // Tashqi yutuqlar (dalil + tasdiqlash bilan). Ichki yutuqlar bu yerda
    // SAQLANMAYDI - ular berilgan hujjatlardan har chaqiruvda hisoblanadi.
    clubAchievements: [],
    // A'zolikka arizalar va a'zolik tarixi (supabase/club_membership.sql).
    clubJoinRequests: [],
    clubMembershipEvents: [],
    // Talaba yuklagan tashqi hujjatlar (supabase/student_documents.sql).
    studentDocuments: [],
    scores: [
        // { id, userId, points, reason, sourceId (eventId or clubId), date }
        { id: 's1', userId: 'talaba', points: 50, reason: 'Bahorgi Konsert 1-o\'rin', sourceId: 'e2', date: new Date().toISOString() }
    ],
    certificates: [
        // { id, userId, title, clubName, role, placement, issueDate, qrCodeHash }
    ],
    // Platform-wide "O'tkazilish joyi" picklist (Sozlamalar -> Joylar) - { id, building, room, label }.
    // Shared by every club (confirmed - not per-club), used by the tournament wizard's location select
    // instead of a free-text field.
    venues: [],
    competitions: [
        {
            id: 'c1',
            name: 'Zakovat Intellektual O\'yini',
            contextType: 'club', // 'club' | 'project' | 'event' | 'competition' | 'tournament'
            contextId: '1',      // Club 1
            type: 'team',        // 'individual' | 'team'
            scoringMethod: 'correct_answer',
            roundsCount: 5,
            currentRound: 1,
            pointsPerRound: 10,
            criteria: [],
            participants: [
                { id: 'team_1', name: 'Alpha Jamoasi #1', membersCount: 5 },
                { id: 'team_2', name: 'Beta Guruh #2', membersCount: 4 },
                { id: 'team_3', name: 'Gamma Klubi #3', membersCount: 6 },
                { id: 'team_4', name: 'Delta Ittifoqi #4', membersCount: 5 },
                { id: 'team_5', name: 'Sigma Jangchilari #5', membersCount: 6 }
            ],
            judges: ['admin', 'talaba'],
            calculationMethod: 'total',
            createdAt: new Date().toISOString()
        },
        {
            id: 'c2',
            name: 'Klublararo Debate Chempionati',
            contextType: 'event',
            contextId: 'e1',
            type: 'team',
            scoringMethod: 'single_score',
            roundsCount: 3,
            currentRound: 1,
            pointsPerRound: 10,
            criteria: [],
            participants: [
                { id: 'team_1', name: 'Alpha Jamoasi #1', membersCount: 5 },
                { id: 'team_2', name: 'Beta Guruh #2', membersCount: 4 },
                { id: 'team_3', name: 'Gamma Klubi #3', membersCount: 6 }
            ],
            judges: ['admin', 'talaba'],
            calculationMethod: 'average',
            createdAt: new Date().toISOString()
        }
    ],
    competitionScores: [],
    competitionAuditLogs: [],
    competitionGroupActionLogs: [], // { id, competitionId, action, details, actingUsername, time } - see logCompetitionGroupAction
    debatePenalties: [], // { id, competitionId, participantId, type, points, appliedBy, date }
    // Professional competition-ecosystem restructure - additive overlay data, sparse by design: any
    // competition with zero matching records here just keeps rendering exactly as it always has.
    // { id, competitionId, granteeUsername, permissions:['result_entry'|'live_scoring'|'attendance'|
    //   'manage_teams'|'judge'|'view_appeals'], grantedBy, grantedAt, revokedBy, revokedAt, active }
    competitionDelegations: [],
    // { id, competitionId, action:'GRANT'|'REVOKE', granteeUsername, permissions, actingUsername, time }
    competitionDelegationAuditLogs: [],
    // Additive metadata layered over the existing flat `competition.judges` username array, which stays
    // the source of truth for the active-judge switcher / debate penalty panel - this only adds a
    // differentiated role + active-state label per judge.
    // { id, competitionId, username, role:'chief_judge'|'result_operator'|'assistant_judge'|
    //   'attendance_operator', active, assignedBy, assignedAt }
    competitionJudgeRoles: [],
    // Sparse overlay over the implicit 1..roundsCount rounds - a round/round-group with no record here
    // renders using today's exact default (name "Raund N", status derived from activeComp.currentRound).
    // Never read by the roundGroupCount/questionButtons "Zakovat" math in TournamentScoring.jsx.
    // { id, competitionId, index, name, questionCount, plannedDurationMin,
    //   status:'draft'|'ready'|'active'|'finished', displayOrder, createdAt, updatedAt }
    competitionRounds: [],
    // Per-question appeals. `proposedValue` is stored in the exact shape saveRoundScores already expects
    // for that competition's scoringMethod, so accepting an appeal can replay it through the real score
    // write path instead of a bypass. { id, competitionId, round, participantId, submittedBy, reason,
    //   proposedValue, status:'pending'|'in_review'|'accepted'|'rejected', decidedBy, decidedAt,
    //   decisionComment, createdAt }
    competitionAppeals: [],
    // { id, appealId, competitionId, fromStatus, toStatus, reviewer, comment, time }
    competitionAppealAuditLogs: [],
    // TSUL Court case-role assignment overlay - same sparse-overlay idiom as competitionJudgeRoles,
    // purely descriptive metadata for display (who's playing which role this round/match), never a new
    // scoring path. { id, competitionId, round, participantId, role:'judge'|'prosecutor'|'defense'|
    //   'accused'|'witness'|'clerk', assignedBy, assignedAt }
    competitionCaseRoles: [],
    // Sport (match_play engine) - completely parallel to competitionScores/getLeaderboard, never written
    // to by a match_play competition. { id, competitionId, stage:'group'|'playoff', groupName,
    //   roundLabel, teamAId, teamBId, scoreA, scoreB, status:'scheduled'|'finished', playedAt, createdBy }
    competitionMatches: [],
    // Manual group assignment overlay. { id, competitionId, name, participantIds }
    competitionGroups: [],
    // Munozara match-based engine (debate_match) - completely parallel to competitionMatches above, but
    // scored per individual "notiq" (speaker) instead of per whole team. competitionGroups is reused
    // verbatim for debate_match's group-stage grouping (already engine-agnostic).
    // { id, competitionId, stage:'group'|'playoff', groupName, roundLabel, teamTId, teamIId,
    //   status:'scheduled'|'finished', playedAt, scoreT, scoreI, winnerTeamId, tieBreakManual, createdBy }
    debateMatches: [],
    // Real-roster lineup for one match's 6 notiq slots. { id, matchId, notiqSlot, memberUserId, assignedBy, assignedAt }
    debateMatchLineups: [],
    // Per-judge, per-notiq raw criteria scores (keyed by DEBATE_MATCH_CRITERIA id - this schema is fixed/
    // shared, not per-competition-defined, unlike criteria_based's name-keyed convention).
    // { id, matchId, notiqSlot, judge, criteriaScores:{[criterionId]:number}, enteredAt, updatedAt }
    debateMatchNotiqScores: [],
    // One best-speaker pick per (matchId, side, judge) - each judge's own independent ballot.
    // { id, matchId, side:'tasdiqlovchi'|'inkor', notiqSlot, judge, pickedAt }
    debateMatchBestSpeakerPicks: [],
    // Davomat (attendance) - genuinely separate from any engine's own scoring/status fields. Needed only
    // for TEAM-scored leaf units (Sport matches, Munozara bench/non-speaking members, jamoaviy
    // criteria_based/single_score rounds) and plain events, where a real member can go unaccounted-for
    // even though the team/notiq got scored. Individually-scored participants never get a row here at
    // all - their score IS the attendance proof (see getXAttendanceRoster functions, which already
    // exclude them). { id, activityId, activityType:'event'|'competition', leafUnitType, leafUnitId,
    //   participantId, teamId, status:'present'|'absent', markedByUserId, markedAt }
    activityAttendance: [],
    // Append-only full history (NOT last-writer-wins, unlike competitionRoundParticipantStatus above) -
    // one entry per real change, or per override-with-reason attempt (even a no-op override, since the
    // attempt itself is the fact worth recording). { id, activityId, activityType, leafUnitType,
    //   leafUnitId, participantId, previousStatus, newStatus, markedByUserId, reason, createdAt }
    activityAttendanceAuditLogs: [],
    // One row per leaf unit once it locks (auto, the instant that match/round/event finishes) -
    // independent of each engine's own status/locked field, which are either too inconsistent
    // (criteria_based/single_score: purely cosmetic) or have no override path at all (Sport/Munozara
    // match status) to reuse directly. { id, activityId, activityType, leafUnitType, leafUnitId,
    //   lockedAt, lockedByUserId, reopenedAt, reopenedByUserId }
    activityAttendanceLocks: [],
    // Event-level delegation - mirrors competitionDelegations' shape exactly, just event-scoped (events
    // have no delegation system at all otherwise). Only the 'attendance' permission key is wired to any
    // UI today. { id, eventId, granteeUsername, permissions:['attendance'], grantedBy, grantedAt,
    //   revokedBy, revokedAt, active }
    eventDelegations: [],
    // Zakovat "Natija kiritish" grid (correct_answer only) - three sparse overlays, same idiom as above.
    // Per-question point-value override + "Savol turi" label, keyed by the absolute global question index
    // (same numbering as competitionScores.round). No points override = getLeaderboard keeps using the
    // flat pointsPerCorrectAnswer; questionType is purely informational, never read by scoring math.
    // { id, competitionId, questionIndex, points, questionType:'standard'|'blitz'|'bonus', updatedAt }
    competitionQuestionPoints: [],
    // "Stol" - competition-wide seat/table number, not per-round. { id, competitionId, participantId,
    //   seatNumber, updatedAt }
    competitionParticipantSeats: [],
    // "Holat" - attendance + per-Raund disqualify, keyed by the same GLOBAL Raund-group index
    // (Math.ceil(round / questionsPerRound)) that competitionRounds already uses for its `index`, so both
    // overlays share one addressing scheme. Disqualify itself is enforced by bulk-voiding that Raund's
    // answers through the existing saveRoundScores path - this flag is just the displayed state.
    // { id, competitionId, roundGroupIndex, participantId, attended, disqualified, updatedAt }
    competitionRoundParticipantStatus: [],
    // "Jadval" tab's "Turlar jadvali" - real per-Tur date/time/responsible-judge, keyed by the Tur's
    // 1-based index (matches `stages[i]`'s position, not roundRange). Sparse overlay, same idiom as above.
    // { id, competitionId, turIndex, date, startTime, endTime, judgeUsername, updatedAt }
    competitionTurSchedule: [],
    // Per-competition "guruh" (group) DEFINITIONS for Tur-boundary advancement - deliberately generic
    // (no "faculty" baked into the shape) so a future correct_answer League/Cup reuse isn't blocked; the
    // UI alone calls it "Fakultet" for UniQuiz. { id, competitionId, label, displayOrder, createdAt, createdBy }
    competitionScoringGroups: [],
    // Which group each participant belongs to - explicit, admin-assigned (never derived from a team's
    // own nonexistent faculty field). One row per (competitionId, participantId).
    // { id, competitionId, participantId, groupId, updatedAt, updatedBy }
    competitionParticipantGroupAssignments: [],
    // Per-Tur-boundary, per-group "top N advance" config. turBoundary: 1 means "1-Tur -> 2-Tur", 2 means
    // "2-Tur -> 3-Tur", etc. { id, competitionId, turBoundary, groupId, topN, updatedAt, updatedBy }
    competitionAdvancementRules: [],
    // Manual "Qo'shimcha savol" (live decisive question) judge resolutions - reused for the primary
    // tiebreak tier, the fallback tier, AND Tur3/Final placement ties. A resolution is only trusted if
    // its sorted tiedParticipantIds still matches the live-recomputed tie set; otherwise stale/unresolved.
    // { id, competitionId, context:'advancement'|'final_placement', turBoundary (null for final_placement),
    //   groupKey (groupId for advancement; a synthetic 'rank_<N>' key for final_placement so independent
    //   ties don't collide), tiedParticipantIds, resolvedOrder, enteredBy, enteredAt }
    competitionTiebreakResolutions: [],
    // FROZEN outcome, written only by "Finalga chiqarish" / "Yakuniy o'rinlarni belgilash". Live/unfrozen
    // state is never stored - always recomputed on demand (see db.computeFacultyAdvancement).
    // { id, competitionId, context:'advancement'|'final_placement', turBoundary,
    //   advancedParticipantIds (flat union, advancement only),
    //   byGroup:[{groupId, participantIds, tiebreakUsed}] (advancement only),
    //   placements:[{rank, participantId}] (final_placement only), frozenAt, frozenBy }
    competitionAdvancementResults: [],
    // Unified registration layer (Tadbirlar/Treninglar/Musobaqalar/Turnirlar) - a Registration record per
    // registrant per activity, parallel to (not a replacement for) the existing comp.participants /
    // event.registrations roster arrays that Live Scoring / Results Center / CompetitionParticipantsTab
    // read directly. { id, activityId, activityType: 'event'|'competition', userId, participantType,
    //   teamName, teamMembers: [{userId, status, invitedAt, respondedAt}], minTeamSize,
    //   status: 'registered'|'waitlisted'|'cancelled', approvalRequired, approvalStatus,
    //   addedByOverride, overrideReason, overrideByUserId, isRepeat, offerExpiresAt, createdAt }
    registrations: [],
    // { id, userId, type, title, message, refId, refType, isRead, createdAt, expiresAt }
    notifications: [],
    // Admin-override audit trail - same shape/idiom as competitionAuditLogs.
    // { id, addedByUserId, addedStudentId, activityId, activityType, reason, createdAt }
    registrationAuditLogs: [],
    // Club org-structure positions + applications (Klub tuzilmasi / Ochiq o'rinlar) - same idiom as the
    // registration layer above: one array per concern, audit log mirrors competitionAuditLogs' shape.
    // { id, clubId, kind:'formal'|'internal', title, slots, filledCount, duration, requirements,
    //   status:'open'|'closed', createdBy, createdAt, displayNumber }
    clubPositions: [],
    // { id, positionId, clubId, studentId, motivation, status, submittedAt, reviewedBy, reviewedAt,
    //   reviewerComment, approvedByAdminId, approvedByAdminAt, addedByOverride }
    clubPositionApplications: [],
    // { id, applicationId, action, fromStatus, toStatus, reviewer, comment, time } - applicationId is
    // null for entries logged by the direct-assign flow below (clubId/studentId/positionTitle/reviewer
    // filled in instead).
    clubPositionAuditLogs: [],
    // Direct admin/coordinator "Lavozimga tayinlash" assignments (professional Klub tarkibi workspace) -
    // parallel to, not a replacement for, the ariza-based clubPositions/clubPositionApplications flow
    // above. { id, clubId, studentId, positionTitle, status:'active'|'ended', assignedBy, assignedAt,
    //   endedAt, endedBy, endReason:'completed'|'cancelled'|'changed'|null, displayNumber }
    clubPositionAssignments: [],
    // "Klub hujjatlari" tab - club charter ("nizom") + other documents. Same disclosed convention as
    // every other upload in this app (SocialActivityIndex/TournamentReviewStep): the file's bytes are
    // never persisted, only the metadata a real backend would keep alongside the stored file.
    // { id, clubId, category:'nizom'|'boshqa', title, fileName, sizeLabel, uploadedBy, uploadedAt,
    //   status:'active'|'replaced'|'removed', displayNumber }
    clubDocuments: [],
    // { id, studentId, grantTitle, docName, submittedAt, status:'Kutilmoqda'|'Tasdiqlangan'|'Rad etilgan',
    //   reviewedBy, reviewedAt, displayNumber }
    scholarshipApplications: scholarshipApplicationsSeed,
    socialActivityApplications: socialActivitySeed.applications,
    socialActivityAuditLogs: socialActivitySeed.auditLogs,
    scoringSources: scoringSourcesSeed,
    socialScoreTransactions: [],
    // Dynamic replacement for the SOCIAL_ACTIVITY_CRITERIA constant - see buildSocialCriteriaCategoriesSeed.
    socialCriteriaCategories: socialCriteriaCategoriesSeed,
    // { id, categoryId, name, calculationMethod:'manual'|'automatic', reviewerRole (manual only, see
    //   SOCIAL_REVIEWER_ROLES), automaticSourceKey (automatic only, see SOCIAL_AUTOMATIC_SOURCES),
    //   isActive, isArchived, createdAt, updatedAt }
    socialCriteriaSubcategories: socialCriteriaSubcategoriesSeed,
    // Fresh installs already get the expanded club roster built above (allClubsSeed) - mark it done so the
    // getDB() migration below doesn't re-run buildClubSeedExpansion() a second time on the next call and
    // duplicate the 5 new clubs (the migration itself is not idempotent, unlike the transaction backfill).
    _clubSeedExpandedV2: true,
    // Fresh installs already get the full 34-club/project roster (NEW_CLUB_DEFS ids 9-42) via allClubsSeed
    // above - mark it done so the getDB() migration below doesn't try to re-add them.
    _fullClubRosterV1: true,
    // Fresh installs already get every NEW_CLUB_DEFS entry (including id 43/UniQuiz) via allClubsSeed too.
    _clubRosterV2: true,
    // Fresh installs already get teams/teamMembers via allTeamsSeed/etc. above.
    _teamsSeededV1: true,
    // Yangi o'rnatishda soxta yutuqlar umuman yaratilmaydi - tozalash kerak emas.
    _fakeAchievementsPurgedV1: true,
    // Fresh installs get displayNumber assigned below (right after this object), so mark it done here too -
    // mirrors _clubSeedExpandedV2/_fullClubRosterV1/_teamsSeededV1.
    _displayNumbersV1: true,
    // Fresh installs already declare registrations/notifications/registrationAuditLogs above as empty arrays.
    _registrationSystemV1: true,
    // Fresh installs already declare clubPositions/clubPositionApplications/clubPositionAuditLogs above as empty arrays.
    _clubStructureV1: true,
    // Fresh installs already declare clubPositionAssignments above as an empty array.
    _clubPositionAssignmentsV1: true,
    // Fresh installs already declare clubDocuments above as an empty array.
    _clubDocumentsV1: true,
    // Fresh installs already declare scholarshipApplications above via scholarshipApplicationsSeed.
    _scholarshipApplicationsV1: true,
    // Fresh installs already declare competitionDelegations/competitionDelegationAuditLogs/
    // competitionJudgeRoles/competitionRounds/competitionAppeals/competitionAppealAuditLogs above as
    // empty arrays.
    _competitionExtV1: true,
    // Fresh installs already declare competitionCaseRoles above as an empty array.
    _competitionCaseRolesV1: true,
    // Fresh installs already declare competitionMatches/competitionGroups above as empty arrays.
    _competitionMatchesV1: true,
    // Fresh installs already declare competitionQuestionPoints/competitionParticipantSeats/
    // competitionRoundParticipantStatus above as empty arrays.
    _competitionQuizGridV1: true,
    // Fresh installs already declare competitionTurSchedule above as an empty array.
    _competitionTurScheduleV1: true,
    // Fresh installs already declare competitionScoringGroups/competitionParticipantGroupAssignments/
    // competitionAdvancementRules/competitionTiebreakResolutions/competitionAdvancementResults above.
    _competitionAdvancementV1: true,
    // Fresh installs' UniQuiz competitions are built via the wizard reading the CURRENT UNIQUIZ_ROUND_RULES
    // constant directly (never a hardcoded literal in seed data), so they already score uniformly.
    _uniquizUniformScoringV1: true,
    // Fresh installs already declare debateMatches/debateMatchLineups/debateMatchNotiqScores/
    // debateMatchBestSpeakerPicks above as empty arrays.
    _debateMatchV1: true,
    // Fresh installs already declare activityAttendance/activityAttendanceAuditLogs/
    // activityAttendanceLocks/eventDelegations above as empty arrays.
    _activityAttendanceV1: true
};

// Public display numbers (Talaba #N / Klub #N / Jamoa #N / Tadbir #N / Turnir #N / Sertifikat #N / Yutuq #N) -
// a purely additive, sequential-per-type field surfaced in UI/search/exports only. Internal ids are untouched
// and keep driving every relation/scoring calculation. Assigned once, in each array's existing seed order.
// `achievements` ro'yxatdan CHIQARILDI: klub yutuqlari endi bu yerda
// saqlanmaydi (soxta ma'lumot o'chirildi), shuning uchun raqamlaydigan
// narsa ham yo'q.
[initialData.clubs, initialData.teams, initialData.events, initialData.competitions, initialData.certificates, initialData.scholarshipApplications]
    .forEach(arr => arr.forEach((record, idx) => { record.displayNumber = idx + 1; }));

// Internal helper to get/set full DB
// DIQQAT: bu funksiya butun bazani localStorage'dan o'qib JSON.parse qiladi va
// migratsiyalarni yuritadi. U kodda 500 dan ortiq joyda chaqiriladi, shuning uchun
// TO'G'RIDAN-TO'G'RI chaqirilmaydi - pastdagi `getDB()` orqali chaqiriladi.
const loadDB = () => {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
        localStorage.setItem(DB_KEY, JSON.stringify(initialData));
        return initialData;
    }
    const parsed = JSON.parse(raw);

    // Migration for DBs saved before the social-activity module existed
    if (!parsed.socialActivityApplications || !parsed.socialActivityAuditLogs) {
        parsed.socialActivityApplications = parsed.socialActivityApplications || socialActivitySeed.applications;
        parsed.socialActivityAuditLogs = parsed.socialActivityAuditLogs || socialActivitySeed.auditLogs;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration for DBs saved before the configurable scoring-sources module existed
    if (!parsed.scoringSources || !parsed.socialScoreTransactions) {
        parsed.scoringSources = parsed.scoringSources || scoringSourcesSeed;
        parsed.socialScoreTransactions = parsed.socialScoreTransactions || [];
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Backfill: applications approved before the scoring-sources module existed set pointsAwarded directly
    // and never went through applySocialApplicationReview, so they never got a socialScoreTransactions row.
    // Without this, getStudentSocialScoreTotal()/Global Rankings would show zero history for most students.
    if (!parsed._socialScoreTransactionsBackfilled) {
        const existingAppIds = new Set((parsed.socialScoreTransactions || []).map(t => t.applicationId));
        (parsed.socialActivityApplications || [])
            .filter(a => a.status === SOCIAL_APPLICATION_STATUS.APPROVED && a.pointsAwarded != null && !existingAppIds.has(a.id))
            .forEach(a => {
                const source = findActiveScoringSourceInternal(parsed, a);
                parsed.socialScoreTransactions.push({
                    id: 'satxn_backfill_' + a.id,
                    applicationId: a.id,
                    studentId: a.studentId,
                    studentFullName: a.studentFullName,
                    scoringSourceId: source?.id || null,
                    scoringSourceCode: source?.code || null,
                    scoringSourceName: source?.name || a.activityTitle,
                    category: a.criteriaKey,
                    points: a.pointsAwarded,
                    academicYear: getCurrentAcademicYear(),
                    appliesTo: 'student',
                    createdAt: a.reviewedAt || a.submittedAt,
                    createdBy: a.reviewedBy || 'system'
                });
            });
        parsed._socialScoreTransactionsBackfilled = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: expand the club roster + memberships + events for DBs saved before the Global Rankings Center
    // (parsed.clubs/memberships are already non-empty on any prior DB, so an emptiness check won't fire here)
    if (!parsed._clubSeedExpandedV2) {
        const expansion = buildClubSeedExpansion(parsed.clubs || []);
        parsed.clubs = [...(parsed.clubs || []), ...expansion.newClubs];
        parsed.memberships = [...(parsed.memberships || []), ...expansion.newMemberships];
        parsed.events = [...(parsed.events || []), ...buildClubEventsExpansion(parsed.clubs, parsed.memberships)];
        syncClubMemberCounts(parsed.clubs, parsed.memberships);
        parsed._clubSeedExpandedV2 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: add the full official 34-club/project roster (NEW_CLUB_DEFS ids 9-42 - TSUL Zakovat
    // loyihasi, Orator Academy & Munozara klubi, TSUL Court loyihasi, etc.) for DBs saved before it
    // existed. Merges only whichever ids are actually missing, so it's safe no matter what partial state
    // the stored club list was already in (an emptiness check alone wouldn't fire here, same reasoning
    // as the migration above - the club list is never empty on any prior DB).
    if (!parsed._fullClubRosterV1) {
        const existingClubIds = new Set((parsed.clubs || []).map(c => c.id));
        const missingClubs = NEW_CLUB_DEFS
            .filter(def => !existingClubIds.has(def.id))
            .map(def => ({ ...def, membersCount: 0, headCoordinatorId: null, createdAt: new Date().toISOString() }));
        parsed.clubs = [...(parsed.clubs || []), ...missingClubs];
        syncClubMemberCounts(parsed.clubs, parsed.memberships || []);
        parsed._fullClubRosterV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: add clubs introduced to NEW_CLUB_DEFS AFTER _fullClubRosterV1 already ran (that guard
    // is one-time and won't re-fire for anyone with an existing DB) - currently just UniQuiz (id 43).
    // Same id-diff-safe merge as _fullClubRosterV1 above; bump this to V3/V4 the next time a club is
    // added this way rather than editing _fullClubRosterV1's already-fired logic.
    if (!parsed._clubRosterV2) {
        const existingClubIds2 = new Set((parsed.clubs || []).map(c => c.id));
        const missingClubs2 = NEW_CLUB_DEFS
            .filter(def => !existingClubIds2.has(def.id))
            .map(def => ({ ...def, membersCount: 0, headCoordinatorId: null, createdAt: new Date().toISOString() }));
        parsed.clubs = [...(parsed.clubs || []), ...missingClubs2];
        syncClubMemberCounts(parsed.clubs, parsed.memberships || []);
        parsed._clubRosterV2 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: add real teams/team_members/achievements (Clubs Directory) for DBs saved before they
    // existed. Brand-new arrays (not present at all on any prior DB), so an emptiness/absence check is
    // sufficient here - unlike the migrations above, there's no "already partially there" case to guard.
    if (!parsed._teamsSeededV1) {
        const teamsResult = buildTeamsSeed(parsed.clubs || [], parsed.memberships || []);
        parsed.teams = teamsResult.newTeams;
        parsed.teamMembers = teamsResult.newTeamMembers;
        parsed._teamsSeededV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migratsiya: SOXTA yutuqlarni o'chirish.
    //
    // Eski `achievements` massivi butunlay to'qib chiqarilgan edi (izohi
    // yuqorida, buildAchievementsSeed o'rnida). Uni saqlab qolishning
    // ma'nosi yo'q: bironta yozuv haqiqiy emas edi va ularni haqiqiysidan
    // ajratish imkoni ham yo'q - hammasi bir xil qolipda yaratilgan.
    //
    // Massivning o'zi QOLDIRILADI (bo'sh holda): eski nusxalarda uni
    // o'qiydigan kod bo'lishi mumkin va `undefined` ni tekshirmagan joy
    // yiqilib qolardi.
    if (!parsed._fakeAchievementsPurgedV1) {
        parsed.achievements = [];
        parsed.clubAchievements = parsed.clubAchievements || [];
        parsed._fakeAchievementsPurgedV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: backfill public display numbers (Klub #N / Jamoa #N / Tadbir #N / Turnir #N / Sertifikat #N /
    // Yutuq #N) for DBs saved before this feature existed. Id-diff-safe (`|| (idx + 1)`) rather than an
    // emptiness check, same reasoning as _fullClubRosterV1 - every one of these arrays is already non-empty
    // on any prior DB except certificates, which may legitimately be empty.
    if (!parsed._displayNumbersV1) {
        [parsed.clubs, parsed.teams, parsed.events, parsed.competitions, parsed.certificates]
            .forEach(arr => (arr || []).forEach((record, idx) => { record.displayNumber = record.displayNumber || (idx + 1); }));
        parsed._displayNumbersV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: add the unified registration layer (registrations/notifications/registrationAuditLogs)
    // for DBs saved before it existed. Brand-new arrays, absence check is sufficient (same reasoning as
    // _teamsSeededV1).
    if (!parsed._registrationSystemV1) {
        parsed.registrations = parsed.registrations || [];
        parsed.notifications = parsed.notifications || [];
        parsed.registrationAuditLogs = parsed.registrationAuditLogs || [];
        parsed._registrationSystemV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: add the club org-structure layer (clubPositions/clubPositionApplications/clubPositionAuditLogs)
    // for DBs saved before it existed. Brand-new arrays, absence check is sufficient (same reasoning as
    // _registrationSystemV1).
    if (!parsed._clubStructureV1) {
        parsed.clubPositions = parsed.clubPositions || [];
        parsed.clubPositionApplications = parsed.clubPositionApplications || [];
        parsed.clubPositionAuditLogs = parsed.clubPositionAuditLogs || [];
        parsed._clubStructureV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: add the direct-assign ledger (clubPositionAssignments) for DBs saved before it existed.
    // Brand-new array, absence check is sufficient (same reasoning as _clubStructureV1).
    if (!parsed._clubPositionAssignmentsV1) {
        parsed.clubPositionAssignments = parsed.clubPositionAssignments || [];
        parsed._clubPositionAssignmentsV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: add the club documents layer ("Klub hujjatlari" tab / nizom upload) for DBs saved
    // before it existed. Brand-new array, absence check is sufficient (same reasoning as
    // _clubPositionAssignmentsV1).
    if (!parsed._clubDocumentsV1) {
        parsed.clubDocuments = parsed.clubDocuments || [];
        parsed._clubDocumentsV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: add the scholarship-applications queue for DBs saved before it existed. Seeded (not an
    // empty array) so existing installs get the same demo data a fresh install would, rather than an
    // empty "Tasdiqlash" list.
    if (!parsed._scholarshipApplicationsV1) {
        parsed.scholarshipApplications = parsed.scholarshipApplications || scholarshipApplicationsSeed;
        parsed._scholarshipApplicationsV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: add the competition-ecosystem overlay layer (delegations/judge roles/round metadata/
    // appeals + their audit logs) for DBs saved before it existed. Brand-new arrays, absence check is
    // sufficient (same reasoning as _clubStructureV1) - every existing competition keeps behaving exactly
    // as before since all of this is sparse overlay data, never required for existing render paths.
    if (!parsed._competitionExtV1) {
        parsed.competitionDelegations = parsed.competitionDelegations || [];
        parsed.competitionDelegationAuditLogs = parsed.competitionDelegationAuditLogs || [];
        parsed.competitionJudgeRoles = parsed.competitionJudgeRoles || [];
        parsed.competitionRounds = parsed.competitionRounds || [];
        parsed.competitionAppeals = parsed.competitionAppeals || [];
        parsed.competitionAppealAuditLogs = parsed.competitionAppealAuditLogs || [];
        parsed._competitionExtV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: add the TSUL Court case-role overlay for DBs saved before it existed. Brand-new array,
    // absence check is sufficient (same reasoning as _competitionExtV1).
    if (!parsed._competitionCaseRolesV1) {
        parsed.competitionCaseRoles = parsed.competitionCaseRoles || [];
        parsed._competitionCaseRolesV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: add the Sport (match_play) match/group overlay for DBs saved before it existed.
    // Brand-new arrays, absence check is sufficient (same reasoning as _competitionCaseRolesV1).
    if (!parsed._competitionMatchesV1) {
        parsed.competitionMatches = parsed.competitionMatches || [];
        parsed.competitionGroups = parsed.competitionGroups || [];
        parsed._competitionMatchesV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: add the Zakovat "Natija kiritish" grid overlays for DBs saved before they existed.
    // Brand-new arrays, absence check is sufficient (same reasoning as _competitionCaseRolesV1).
    if (!parsed._competitionQuizGridV1) {
        parsed.competitionQuestionPoints = parsed.competitionQuestionPoints || [];
        parsed.competitionParticipantSeats = parsed.competitionParticipantSeats || [];
        parsed.competitionRoundParticipantStatus = parsed.competitionRoundParticipantStatus || [];
        parsed._competitionQuizGridV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: add the "Turlar jadvali" schedule overlay for DBs saved before it existed.
    if (!parsed._competitionTurScheduleV1) {
        parsed.competitionTurSchedule = parsed.competitionTurSchedule || [];
        parsed._competitionTurScheduleV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: 2026-08-12 UniQuiz scoring fix - 2-Tur/3-Tur used to have their OWN round-rule mix
    // (risk_optional-heavy / double-placement) instead of 1-Tur's simple standard/placement/vabank shape;
    // user confirmed all 3 Tur should score identically. Backfills any ALREADY-STORED quiz_mixed
    // competition whose roundRules still equals the OLD varying pattern (content match) to the current
    // uniform UNIQUIZ_ROUND_RULES - only rewrites the RULE TYPE per round index, never any already-entered
    // score value. A competition that doesn't match the exact old pattern (e.g. genuinely custom) is left
    // untouched.
    if (!parsed._uniquizUniformScoringV1) {
        const OLD_UNIQUIZ_ROUND_RULES = [
            ...Array(7).fill('standard'), 'placement', 'vabank',
            ...Array(6).fill('standard'), 'risk_optional', 'risk_optional', 'vabank',
            ...Array(5).fill('standard'), 'placement', 'placement', 'vabank', 'vabank'
        ];
        (parsed.competitions || []).forEach(c => {
            if (c.scoringMethod === 'quiz_mixed' && Array.isArray(c.roundRules) &&
                c.roundRules.length === OLD_UNIQUIZ_ROUND_RULES.length &&
                c.roundRules.every((v, i) => v === OLD_UNIQUIZ_ROUND_RULES[i])) {
                c.roundRules = [...UNIQUIZ_ROUND_RULES];
            }
        });
        parsed._uniquizUniformScoringV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: add the UniQuiz per-faculty ("guruh") advancement overlays for DBs saved before they
    // existed. Brand-new arrays, absence check is sufficient (same reasoning as _competitionQuizGridV1).
    if (!parsed._competitionAdvancementV1) {
        parsed.competitionScoringGroups = parsed.competitionScoringGroups || [];
        parsed.competitionParticipantGroupAssignments = parsed.competitionParticipantGroupAssignments || [];
        parsed.competitionAdvancementRules = parsed.competitionAdvancementRules || [];
        parsed.competitionTiebreakResolutions = parsed.competitionTiebreakResolutions || [];
        parsed.competitionAdvancementResults = parsed.competitionAdvancementResults || [];
        parsed._competitionAdvancementV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: add the Munozara match-based engine (debate_match) overlays for DBs saved before they
    // existed. Brand-new arrays, absence check is sufficient (same reasoning as _competitionMatchesV1).
    if (!parsed._debateMatchV1) {
        parsed.debateMatches = parsed.debateMatches || [];
        parsed.debateMatchLineups = parsed.debateMatchLineups || [];
        parsed.debateMatchNotiqScores = parsed.debateMatchNotiqScores || [];
        parsed.debateMatchBestSpeakerPicks = parsed.debateMatchBestSpeakerPicks || [];
        parsed._debateMatchV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    // Migration: add the Davomat (attendance) overlays for DBs saved before they existed. Brand-new
    // arrays, absence check is sufficient (same reasoning as _debateMatchV1).
    if (!parsed._activityAttendanceV1) {
        parsed.activityAttendance = parsed.activityAttendance || [];
        parsed.activityAttendanceAuditLogs = parsed.activityAttendanceAuditLogs || [];
        parsed.activityAttendanceLocks = parsed.activityAttendanceLocks || [];
        parsed.eventDelegations = parsed.eventDelegations || [];
        parsed._activityAttendanceV1 = true;
        localStorage.setItem(DB_KEY, JSON.stringify(parsed));
    }

    return parsed;
};

// O'QISH KESHI — faqat `withCachedReads()` ichida yoqiladi, boshqa vaqtda `getDB()`
// avvalgidek har safar yangi nusxa o'qiydi.
//
// Nega kerak: bitta talabaning rasmiy ijtimoiy faollik indeksi ~30 ta `db.getX()`
// chaqiradi, ularning HAR BIRI butun bazani qayta JSON.parse qiladi. 550 ta talaba
// uchun bu ~16 000 marta parse degani - sahifa muzlab qoladi.
//
// Nega global kesh EMAS: kodning ba'zi joylari `getDB()` natijasini o'zgartirib,
// `saveDB()` chaqirmaydi - hozir bunday o'zgarish keyingi o'qishda o'z-o'zidan
// yo'qoladi. Doimiy kesh o'sha o'zgarishlarni xotirada saqlab qolib, butun ilova
// bo'ylab sezilmas xatolar keltirib chiqarardi. Shuning uchun kesh faqat SOF O'QISH
// bloklarida, qisqa muddatga yoqiladi va blok tugashi bilan majburan tozalanadi.
let readCache = null;

const getDB = () => readCache || loadDB();

// Ichida faqat O'QISH bo'lgan blokni o'rab, baza bir marta o'qilishini ta'minlaydi.
// Ichida yozish (saveDB yoki db.setX) BO'LMASLIGI kerak - aks holda keshdagi nusxa
// bilan diskdagi nusxa ajralib ketadi.
const withCachedReads = (fn) => {
    // Ichma-ich chaqirilsa tashqi blok keshini buzmaymiz.
    if (readCache) return fn();
    readCache = loadDB();
    try {
        return fn();
    } finally {
        readCache = null;
    }
};

const saveDB = (data) => {
    localStorage.setItem(DB_KEY, JSON.stringify(data));
    // Ochiq o'qish bloki bo'lsa, u endi eskirgan - keyingi o'qish diskdan bo'lsin.
    readCache = null;
};

// Ish kunlari: shanba, yakshanba va sozlamadagi bayram kunlari o'tkazib
// yuboriladi. Bayram ro'yxati `integration_settings.social_index.holidays`
// dan keladi - u bo'sh bo'lsa faqat hafta oxirlari hisobga olinadi.
//
// Chegara: bayram ro'yxati juda uzun bo'lsa yoki xato to'ldirilsa sikl
// cho'zilib ketmasin uchun bir yildan uzoqqa bormaydi.
const addWorkingDays = (from, days, holidays = null) => {
    const off = new Set(holidays || db.getHolidays());
    const d = new Date(from);
    let left = days;
    let guard = 0;
    while (left > 0 && guard++ < 400) {
        d.setDate(d.getDate() + 1);
        const wd = d.getDay();
        if (wd === 0 || wd === 6) continue;
        if (off.has(toLocalDateKey(d))) continue;
        left--;
    }
    d.setHours(23, 59, 59, 999);
    return d;
};

// Sana kaliti MAHALLIY vaqt bo'yicha. `toISOString()` UTC ga o'giradi va
// Toshkent vaqtida ertalabki sanani bir kun orqaga surib yuborardi.
const toLocalDateKey = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Talabaning da'vosini tekshirish. 5-mezonda bosqich va o'rin MAJBURIY -
// ularsiz ball hisoblanmaydi, hujjat esa "nomi bor, mazmuni yo'q" bo'lib
// qolardi. Boshqa mezonlarda da'vo talab qilinmaydi.
const normalizeEvidenceClaim = (criterionKey, claim) => {
    // 10-mezon: tashqi a'zolik hujjati QAYSI darajani tasdiqlashini talaba
    // ko'rsatadi. Ball da'vodan chiqadi, da'vo bilan berilmaydi.
    if (criterionKey === 'SPORTS') {
        if (!claim?.level) return null;
        if (!SPORT_CLAIM_LEVELS.includes(claim.level)) throw new Error("Noma'lum a'zolik turi");
        return { level: claim.level, points: sportClaimPoints(claim.level) };
    }
    if (criterionKey !== 'COMPETITIONS') return claim || null;
    const level = claim?.level;
    const place = Number(claim?.place);
    if (!PLACEMENT_LEVEL_ORDER.includes(level)) throw new Error('Musobaqa bosqichini tanlang');
    if (!PLACEMENT_PLACES.includes(place)) throw new Error("Sovrinli o'rinni tanlang");
    return { level, place, points: placementToPoints(level, place) };
};

// ============================================================================================
// REAL-BACKEND BRIDGE - Phase 1 (clubs/memberships/profiles) + Phase 2 (teams/teamMembers/events/
// registrations/registrationAuditLogs/notifications) now live in Supabase (Postgres); competitions
// and everything else are still the original localStorage mock, untouched. Rather than rewrite the
// large number of existing functions that already read these arrays off `dbData` (club position
// applications, student portfolio, rankings, leaderboard-adjacent lookups, getTeamCompetitionHistory
// reading the still-mock `dbData.competitions`, ...), Supabase is synced INTO the same local mirror
// shape those functions already expect - they keep working completely unchanged, always reading the
// last-synced snapshot. Only the functions that WRITE to these tables talk to Supabase directly, then
// re-sync the mirror. Not live/realtime - the mirror refreshes on login/signup and after each of THIS
// user's own mutations, not the instant another user changes something elsewhere (deferred).
//
// Phase 2 identity note: `userId`/`addedByUserId`/etc. on teams/registrations/notifications stay PLAIN
// TEXT, not a `profiles` FK - this mixed identity pool (real Supabase UUIDs for real accounts, synthetic
// `student_N` strings for the 550 mock students) is the same disclosed rough edge from Phase 1; RLS on
// these 5 tables is therefore "any authenticated user can read/write" rather than per-row ownership
// checks (a real per-row auth.uid() check isn't possible when the column isn't actually a UUID for every
// row) - a deliberate, disclosed simplification, not an oversight.
// A'ZOLIK VOQEASINI YOZISH.
//
// Jadval FAQAT QO'SHILADI (supabase/club_membership.sql) - tarixni
// o'zgartirib bo'lmaydi.
//
// Xato JIMGINA YUTILADI va bu ataylab: tarix yozilmagani uchun a'zolikning
// o'zini to'xtatib qo'yish noto'g'ri bo'lardi - asosiy amal allaqachon
// bajarilgan. Jadval yo'q bo'lsa konsolda ogohlantirish qoladi.
const logMembershipEvent = async ({ clubId, userId, action, role = null, previousRole = null, by = null, source = null, reason = '' }) => {
    const id = 'cme_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const record = {
        id, clubId: String(clubId), userId, action,
        role, previousRole, by, source, reason: String(reason || ''),
        createdAt: new Date().toISOString(),
    };
    try {
        const { error } = await supabase.from('club_membership_events').insert({
            id, club_id: record.clubId, user_id: userId, action, data: record,
        });
        if (error) throw error;
        const dbData = getDB();
        (dbData.clubMembershipEvents = dbData.clubMembershipEvents || []).push(record);
        saveDB(dbData);
    } catch (e) {
        console.warn("[klub a'zoligi] tarix yozilmadi - supabase/club_membership.sql ishga tushirilganmi?", e);
    }
    return record;
};

// Logo/muqova uchun hajm chegarasi. Kartada o'nlab rasm bir vaqtda
// ko'rinadi, shuning uchun u hujjat yuklashdagidan qattiqroq.
const CLUB_MEDIA_MAX_MB = 3;

// Ochiq ombordagi fayl uchun to'liq havola. Havola SAQLANMAYDI, faqat
// fayl yo'li saqlanadi - shu bilan loyiha ko'chirilganda ham havolalar
// o'z-o'zidan to'g'ri qoladi.
const clubMediaUrl = (path) => {
    if (!path) return null;
    const { data } = supabase.storage.from('club-media').getPublicUrl(path);
    return data?.publicUrl || null;
};

const mapClubFromSupabase = (row) => ({
    id: row.id, name: row.name, description: row.description, category: row.category,
    headCoordinatorId: row.head_coordinator_id, pointsModifier: row.points_modifier,
    displayNumber: row.display_number, createdAt: row.created_at,
    // Aloqa ma'lumotlari `data` jsonb ustunida - qolgan jadvallardagi bilan
    // bir xil qolip (supabase/club_contacts.sql). Ustun hali qo'shilmagan
    // bo'lsa bo'sh obyekt qaytadi, sahifa esa oddiygina hech narsa
    // ko'rsatmaydi.
    contacts: row.data?.contacts || {},
    // Logo va muqova - ochiq omborda (supabase/club_media.sql). Yo'l
    // saqlanadi, havola esa undan hosil qilinadi: ombor manzili o'zgarsa
    // yoki loyiha ko'chirilsa, saqlangan to'liq havolalar ishlamay
    // qolardi.
    logoUrl: clubMediaUrl(row.data?.media?.logoPath),
    bannerUrl: clubMediaUrl(row.data?.media?.bannerPath),
    media: row.data?.media || {},
    // Qisqa nom - tor joylar uchun (analitika jadvali, teglar). Ilgari u
    // yo'q edi va uzun nomlar TAXMIN bilan qisqartirilardi.
    shortName: row.data?.shortName || null,
    // Holat. Yozuvi yo'q klub FAOL: mavjud klublarning hammasi shunday va
    // ularni ko'chirish kerak emas.
    status: row.data?.status || 'active',
    // A'zolik tartibi. Standart - ochiq: bu bugungi xatti-harakat va uni
    // jimgina o'zgartirish mavjud klublarga a'zo bo'lishni to'xtatib
    // qo'yardi.
    joinPolicy: row.data?.joinPolicy || 'open',
    // Zinapoya talablari. Yozuvi bo'lmasa `null` - shunda `mergeLadder()` platforma
    // boshlang'ich qiymatlarini beradi va mavjud klublarga hech narsa qilish
    // kerak emas.
    ladder: row.data?.ladder || null,
    // Klubning O'Z matni. Bo'sh bo'lsa "Haqida" bo'limi shunday deb
    // ko'rsatadi - yo'nalish bo'yicha umumiy matn bilan to'ldirilmaydi.
    about: row.data?.about || {},
    // KLUB TASHKIL ETISH VA RASMIYLASHTIRISH.
    //
    // Bu modul qo'shilishidan OLDINGI klublarda bu maydonlar yo'q - shuning
    // uchun standart qiymatlar: "allaqachon ro'yxatdan o'tgan, admin
    // to'g'ridan-to'g'ri yaratgan". Ularni qaytadan tekshiruvdan
    // o'tkazishni talab qilish noto'g'ri bo'lardi (config/clubRegistration.js).
    registrationStatus: row.data?.registrationStatus || DEFAULT_REGISTRATION_STATUS_FOR_LEGACY_CLUBS,
    operationalStatus: row.data?.operationalStatus || DEFAULT_OPERATIONAL_STATUS,
    registryNumber: row.data?.registryNumber || null,
    registeredAt: row.data?.registeredAt || null,
    certificateNumber: row.data?.certificateNumber || null,
    createdFrom: row.data?.createdFrom || CREATED_FROM.ADMIN_DIRECT,
    createdBy: row.data?.createdBy || null,
    applicationId: row.data?.applicationId || null,
    clubType: row.data?.clubType || null,
});
const mapMembershipFromSupabase = (row) => ({
    id: row.id, userId: row.user_id, clubId: row.club_id, role: row.role, joinedAt: row.joined_at
});

// `clubs.data` ustuni hali qo'shilmagan bo'lsa, Postgres tushunarsiz
// "column clubs.data does not exist" xatosini beradi. Uni nima qilish
// kerakligini aytadigan xabarga almashtiramiz - jimgina brauzerga saqlab
// qo'yish esa "saqlandi" degan yolg'on bo'lardi.
// INDEKS YOZUVINI SAQLASH.
//
// Bu jadvallar ilgari FAQAT localStorage da edi va shuning uchun talabaning
// dalili tyutorga umuman ko'rinmasdi. Endi har yozuv Supabase'ga ham
// boradi (supabase/student_documents.sql).
//
// Xato JIMGINA YUTILMAYDI: amal to'xtaydi va sabab foydalanuvchiga
// aytiladi. "Yuborildi" deb ko'rsatib, aslida hech kim ko'rmaydigan holat -
// aynan shu yerda tuzatilayotgan xato.
const persistIndexRow = async (table, row) => {
    const { error } = await supabase.from(table).upsert(row);
    if (error) {
        const missingTable = /does not exist|schema cache/i.test(error.message || '');
        throw new Error(missingTable
            ? `Saqlanmadi: \`${table}\` jadvali topilmadi. `
              + 'Supabase SQL Editor da `supabase/student_documents.sql` ni ishga tushiring.'
            : `Saqlanmadi: ${error.message}`);
    }
};

const clubDataColumnError = (error) => {
    const message = String(error?.message || '');
    if (/column .*data.* does not exist/i.test(message) || error?.code === '42703') {
        return new Error(
            "Aloqa ma'lumotlari saqlanmadi: `clubs` jadvalida `data` ustuni yo'q. "
            + 'Supabase SQL Editor da `supabase/club_contacts.sql` ni bir marta ishga tushiring.'
        );
    }
    return error;
};

const clubRegistrationTableError = (error) => {
    const message = String(error?.message || '');
    if (/relation .*club_(applications|application_reviews|regulations|certificates|status_history).* does not exist/i.test(message)) {
        return new Error(
            "Klub rasmiylashtirish jadvali topilmadi. Supabase SQL Editor da "
            + '`supabase/club_registration.sql` ni bir marta ishga tushiring.'
        );
    }
    return error;
};

// ---------------------------------------------------------------------------
// A'ZOLIK ROLINI SAQLASH - klub lavozimi tayinlashning YAGONA yo'li.
//
// IKKITA XATO shu funksiya tufayli qaytarilmaydi:
//
// 1. `memberships.id` Postgres'da UUID turida, lekin bu yerda unga
//    "mpos_1787805940268p56oht" ko'rinishidagi matn berilardi. Baza uni rad
//    etardi: "invalid input syntax for type uuid". Endi YANGI a'zolikda id
//    umuman yuborilmaydi - uni bazaning o'zi yaratadi va qaytaradi
//    (`joinClub` ham aynan shunday ishlaydi).
//
// 2. Rol faqat brauzerdagi nusxaga yozilardi. `memberships` esa Supabase
//    jadvali va `syncCoreDataFromSupabase` uni har sinxronlashda butunlay
//    qayta o'qiydi - natijada tayinlash ishlagandek ko'rinardi, keyingi
//    kirishda esa rol yo'qolardi.
//
// Xato JIMGINA YUTILMAYDI: tayinlash to'xtaydi va sabab aytiladi. "Muvaffaqiyatli"
// deb ko'rsatib, aslida hech narsa o'zgarmasligi - eng yomon turdagi xato.
// ---------------------------------------------------------------------------
const persistMembershipRole = async (dbData, { studentId, clubId, role, joinedAt = null }) => {
    const existing = (dbData.memberships || []).find(m => m.userId === studentId && m.clubId === clubId);

    const fail = (error) => {
        const isRls = String(error.message || '').toLowerCase().includes('row-level security')
            || error.code === '42501';
        throw new Error(isRls
            ? "A'zolik roli saqlanmadi: ma'lumotlar bazasi ruxsat bermadi. "
              + "`supabase/club_membership_policy.sql` ni ishga tushiring."
            : `A'zolik roli saqlanmadi: ${error.message}`);
    };

    if (existing) {
        const { error } = await supabase.from('memberships').update({ role }).eq('id', existing.id);
        if (error) fail(error);
        existing.role = role;
        return existing;
    }

    // `id` ATAYLAB yuborilmaydi - ustun uuid va uni baza o'zi yaratadi.
    const { data, error } = await supabase.from('memberships')
        .insert({ user_id: studentId, club_id: clubId, role, joined_at: joinedAt || new Date().toISOString() })
        .select().single();
    if (error) fail(error);

    const record = mapMembershipFromSupabase(data);
    dbData.memberships = dbData.memberships || [];
    dbData.memberships.push(record);
    const clubIdx = (dbData.clubs || []).findIndex(c => c.id === clubId);
    if (clubIdx > -1) dbData.clubs[clubIdx].membersCount = (dbData.clubs[clubIdx].membersCount || 0) + 1;
    return record;
};
// Same field names as generateSyntheticStudents()'s output (fullName/faculty/course/group/studentId/
// gender/professionalism) - a real profile is a drop-in for anywhere `studentById.get(someId)` is used,
// see getSyncedProfiles below, WITHOUT touching getMockStudents()/generateSyntheticStudents() itself
// (a huge number of not-yet-migrated features depend on that function's exact current output).
const mapProfileFromSupabase = (row) => ({
    id: row.id, fullName: row.full_name, faculty: row.faculty, course: row.course,
    group: row.student_group, studentId: row.student_id, gender: row.gender,
    professionalism: row.professionalism, role: row.role, username: row.username
});
const mapTeamFromSupabase = (row) => ({
    id: row.id, clubId: row.club_id, name: row.name, description: row.description,
    foundedAt: row.founded_at, displayNumber: row.display_number
});
const mapTeamMemberFromSupabase = (row) => ({
    id: row.id, teamId: row.team_id, userId: row.user_id, role: row.role, joinedAt: row.joined_at
});
const mapEventFromSupabase = (row) => ({
    // Tadbir hayot yo'lining maydonlari (turi, darajasi, ball berilgan vaqti) `data`
    // jsonb ichida yashaydi - musobaqadagi bilan bir xil naqsh. Ustunlar HAR DOIM
    // ustun bo'ladi: `data` birinchi yoyiladi, keyin ustunlar uni bosadi.
    ...(row.data || {}),
    id: row.id, clubId: row.club_id, title: row.title, description: row.description, date: row.date,
    status: row.status, location: row.location, locationType: row.location_type,
    linkedCompetitionId: row.linked_competition_id, registrationRequired: row.registration_required,
    registrationType: row.registration_type, maxParticipants: row.max_participants,
    teamMinSize: row.team_min_size, teamMaxSize: row.team_max_size,
    waitlistEnabled: row.waitlist_enabled, approvalRequired: row.approval_required,
    registrationOpensAt: row.registration_opens_at, registrationClosesAt: row.registration_closes_at,
    // 'HH:mm' — the event's own finish time. `date` already holds the start moment; before this column
    // existed an event's room booking had to be assumed a flat hour (DEFAULT_BOOKING_MINUTES).
    endTime: row.end_time,
    participants: row.participants || [], registrations: row.registrations || [],
    displayNumber: row.display_number, createdAt: row.created_at,
    // Admin-created (or actingRole not passed) publishes immediately; anyone else's event starts hidden
    // from students until reviewed in "Tasdiqlash" - same moderationStatus convention as competitions
    // (createCompetition). `moderation_status` defaults to 'approved' in Postgres, so every event that
    // predates this column already reads as approved with zero backfill needed. No owner/reviewer/comment
    // tracking for events yet (those live in extra jsonb keys on competitions, which events don't have -
    // would need its own column(s) to add later).
    moderationStatus: row.moderation_status,
    // Kim yaratgan. IKKI JOYDAN o'qiladi va bu shart: `createEvent` qiymatni
    // `data.createdBy` ichiga yozadi, bu yerda esa faqat `created_by` USTUNI
    // o'qilardi - ustun esa bu bazada yo'q. Natijada yaratuvchi har doim
    // bo'sh chiqardi, garchi u saqlangan bo'lsa ham. Ustun keyinchalik
    // qo'shilsa, u ustunlikka ega bo'ladi.
    createdBy: row.created_by || row.data?.createdBy || null,
    // "Jamoa tarkibi" restriction (RegistrationSettingsFields.jsx) - undefined until the
    // team_composition_rule/team_course_rule columns are added; checkTeamComposition already treats
    // undefined as 'mixed' (no restriction), same graceful-default convention as createdBy above.
    teamCompositionRule: row.team_composition_rule, teamCourseRule: row.team_course_rule
});
const mapRegistrationFromSupabase = (row) => ({
    id: row.id, activityId: row.activity_id, activityType: row.activity_type, userId: row.user_id,
    participantSnapshot: row.participant_snapshot, participantType: row.participant_type,
    teamName: row.team_name, teamMembers: row.team_members || [], minTeamSize: row.min_team_size,
    attachments: row.attachments || [], inviteCode: row.invite_code, status: row.status,
    approvalRequired: row.approval_required, approvalStatus: row.approval_status,
    approvalComment: row.approval_comment,
    approvalReviewedBy: row.approval_reviewed_by, approvalReviewedAt: row.approval_reviewed_at,
    addedByOverride: row.added_by_override,
    overrideReason: row.override_reason, overrideByUserId: row.override_by_user_id,
    isRepeat: row.is_repeat, offerExpiresAt: row.offer_expires_at, realTeamId: row.real_team_id,
    teamConfirmedAt: row.team_confirmed_at, createdAt: row.created_at
});
const mapRegistrationAuditLogFromSupabase = (row) => ({
    id: row.id, addedByUserId: row.added_by_user_id, addedStudentId: row.added_student_id,
    activityId: row.activity_id, activityType: row.activity_type, reason: row.reason, createdAt: row.created_at
});
const mapNotificationFromSupabase = (row) => ({
    id: row.id, userId: row.user_id, type: row.type, title: row.title, message: row.message,
    refId: row.ref_id, refType: row.ref_type, isRead: row.is_read, createdAt: row.created_at,
    expiresAt: row.expires_at
});

// Phase 3 (competitions core) - `competitions` has 30+ loosely-structured fields (criteria, participants,
// judges, roundRules, stages, restrictions, ...) that the mock has always just spread/read as one whole
// object. Column-by-column mapping for something this size is exactly how the teamMinSize/teamMaxSize gap
// happened in Phase 2 - so this and several sibling tables instead store the FULL object in one `data`
// jsonb column, with only the fields genuinely needed for lookups/uniqueness pulled out as real columns.
const mapCompetitionFromSupabase = (row) => ({ ...row.data, id: row.id });
const mapCompetitionScoreFromSupabase = (row) => ({
    id: row.id, competitionId: row.competition_id, round: row.round, judge: row.judge,
    participantId: row.participant_id, value: row.value, criteriaScores: row.criteria_scores || {},
    device: row.device, date: row.date
});
const mapCompetitionAuditLogFromSupabase = (row) => ({
    id: row.id, competitionId: row.competition_id, judge: row.judge, participantId: row.participant_id,
    round: row.round, oldVal: row.old_val, newVal: row.new_val, device: row.device, time: row.time
});
const mapCompetitionRoundFromSupabase = (row) => ({ ...row.data, id: row.id, competitionId: row.competition_id, index: row.index });

// Sport (match_play) + Munozara (debate_match) - same whole-object `data` jsonb pattern as competitions
// above, for the same reason (small but easy-to-forget-a-field flat objects).
const mapCompetitionMatchFromSupabase = (row) => ({ ...row.data, id: row.id, competitionId: row.competition_id });
const mapCompetitionGroupFromSupabase = (row) => ({ ...row.data, id: row.id, competitionId: row.competition_id });
const mapDebateMatchFromSupabase = (row) => ({ ...row.data, id: row.id, competitionId: row.competition_id });
const mapDebateMatchLineupFromSupabase = (row) => ({ ...row.data, id: row.id, matchId: row.match_id });
const mapDebateMatchNotiqScoreFromSupabase = (row) => ({ ...row.data, id: row.id, matchId: row.match_id });
const mapDebateMatchBestSpeakerPickFromSupabase = (row) => ({ ...row.data, id: row.id, matchId: row.match_id });
const mapVenueFromSupabase = (row) => ({ ...row.data, id: row.id });
// Stipendiyalar. Grantlar avval localStorage['uni_grants'] da, arizalar esa faqat mahalliy
// localStorage'da yashagan - ikkalasi ham endi real backendda.
const mapScholarshipGrantFromSupabase = (row) => ({
    ...row.data, id: row.id, title: row.title, status: row.status,
    deadline: row.deadline, createdAt: row.created_at, updatedAt: row.updated_at
});
const mapScholarshipApplicationFromSupabase = (row) => ({
    ...row.data, id: row.id, grantId: row.grant_id, studentId: row.student_id,
    status: row.status, stage: row.stage || 'faculty',
    submittedAt: row.submitted_at, reviewedAt: row.reviewed_at,
    createdAt: row.created_at, updatedAt: row.updated_at
});
// "Iqtidorli talabalar" moduli (Phase 1).
const mapTalentProfileFromSupabase = (row) => ({
    ...row.data, id: row.id, studentId: row.student_id, program: row.program,
    status: row.status, cohortYear: row.cohort_year, entryRoute: row.entry_route,
    potentialGrade: row.potential_grade, talentScore: row.talent_score === null ? null : Number(row.talent_score),
    faculty: row.faculty, enrolledAt: row.enrolled_at, updatedAt: row.updated_at
});
const mapTalentAssignmentFromSupabase = (row) => ({
    ...row.data, id: row.id, studentId: row.student_id, personId: row.person_id,
    role: row.role, active: row.active, assignedAt: row.assigned_at, endedAt: row.ended_at
});
const mapTalentIdpFromSupabase = (row) => ({
    ...row.data, id: row.id, studentId: row.student_id, status: row.status,
    periodFrom: row.period_from, periodTo: row.period_to,
    createdAt: row.created_at, updatedAt: row.updated_at
});
const mapTalentGoalFromSupabase = (row) => ({
    ...row.data, id: row.id, idpId: row.idp_id, studentId: row.student_id,
    category: row.category, title: row.title, deadline: row.deadline, status: row.status,
    progress: row.progress, responsibleId: row.responsible_id, updatedAt: row.updated_at
});
const mapTalentMonitoringFromSupabase = (row) => ({
    ...row.data, id: row.id, studentId: row.student_id, period: row.period,
    periodType: row.period_type, byId: row.by_id, byRole: row.by_role,
    flag: row.flag, createdAt: row.created_at
});
const mapTalentTargetFromSupabase = (row) => ({
    ...row.data, id: row.id, studentId: row.student_id, grantId: row.grant_id,
    awardKey: row.award_key, status: row.status, readiness: Number(row.readiness) || 0,
    applicationId: row.application_id, priority: row.priority, updatedAt: row.updated_at
});
const mapRecognitionCaseFromSupabase = (row) => ({
    ...row.data, id: row.id, studentId: row.student_id, targetId: row.target_id,
    achievement: row.achievement, cycleYear: row.cycle_year, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at
});
const mapRecognitionRecordFromSupabase = (row) => ({
    ...row.data, id: row.id, caseId: row.case_id, personId: row.person_id, role: row.role,
    recognitionType: row.recognition_type, status: row.status, documentId: row.document_id,
    createdAt: row.created_at
});
const mapRecognitionRuleFromSupabase = (row) => ({
    ...row.data, id: row.id, achievementKey: row.achievement_key, role: row.role,
    recognitionType: row.recognition_type
});
// Tadbir hayot yo'li: vazifalar taqsimoti va yakuniy hisobot.
const mapActivityTaskFromSupabase = (row) => ({
    ...row.data, id: row.id, activityId: row.activity_id, activityType: row.activity_type,
    title: row.title, assigneeId: row.assignee_id, role: row.role, status: row.status,
    dueDate: row.due_date, sortOrder: row.sort_order, createdAt: row.created_at
});
const mapActivityReportFromSupabase = (row) => ({
    ...row.data, id: row.id, activityId: row.activity_id, activityType: row.activity_type,
    status: row.status, submittedBy: row.submitted_by, submittedAt: row.submitted_at,
    updatedAt: row.updated_at
});
// Phase 0 poydevori: ijtimoiy faollik ledgeri, davomat va akademik ko'rsatkich.
const mapSocialScoreTxnFromSupabase = (row) => ({
    ...row.data, id: row.id, studentId: row.student_id, applicationId: row.application_id,
    category: row.category, points: Number(row.points) || 0,
    academicYear: row.academic_year, createdAt: row.created_at
});
const mapAttendanceFromSupabase = (row) => ({
    ...row.data, id: row.id, activityId: row.activity_id, activityType: row.activity_type,
    leafUnitType: row.leaf_unit_type, leafUnitId: row.leaf_unit_id,
    participantId: row.participant_id, teamId: row.team_id, status: row.status,
    markedAt: row.marked_at
});
const mapAttendanceLockFromSupabase = (row) => ({
    ...row.data, id: row.id, activityId: row.activity_id, activityType: row.activity_type,
    leafUnitType: row.leaf_unit_type, leafUnitId: row.leaf_unit_id,
    lockedAt: row.locked_at, reopenedAt: row.reopened_at
});
const mapAttendanceAuditFromSupabase = (row) => ({
    ...row.data, id: row.id, activityId: row.activity_id, activityType: row.activity_type,
    participantId: row.participant_id, createdAt: row.created_at
});
// "Ma'rifat darslari" moduli (7-mezon). Tadbirlardan alohida jadval:
// auditoriya (fakultet + kurs) davomat foizining maxrajini belgilaydi.
const mapMarifatLessonFromSupabase = (row) => ({
    ...row.data, id: row.id, academicYear: row.academic_year,
    title: row.title, topic: row.topic, date: row.date,
    faculty: row.faculty, course: Number(row.course), venue: row.venue,
    locked: !!row.locked, createdBy: row.created_by, createdAt: row.created_at,
});
const mapMarifatAttendanceFromSupabase = (row) => ({
    ...row.data, id: row.id, lessonId: row.lesson_id, studentId: row.student_id,
    present: !!row.present, active: !!row.active,
    markedBy: row.marked_by, markedAt: row.marked_at,
});
const mapMarifatActivityScoreFromSupabase = (row) => ({
    ...row.data, id: row.id, studentId: row.student_id, academicYear: row.academic_year,
    points: Number(row.points), comment: row.comment,
    assessedBy: row.assessed_by, assessedAt: row.assessed_at,
});

// Talabaning raqamli pasporti. Bo'limlar `sections` jsonb ichida - HEMIS'da
// ham maydonlar o'zgarib turadi, ularni ustunlarga qotirib qo'yish har safar
// migratsiya talab qilardi.
const mapPassportFromSupabase = (row) => ({
    ...row.data, studentId: row.student_id,
    sections: row.sections || {}, fieldSources: row.field_sources || {},
    updatedBy: row.updated_by, updatedAt: row.updated_at,
});
const mapEnrollmentFromSupabase = (row) => ({
    ...row.data, id: row.id, studentId: row.student_id, academicYear: row.academic_year,
    course: row.course == null ? null : Number(row.course),
    faculty: row.faculty, studentGroup: row.student_group,
    educationForm: row.education_form, status: row.status,
    source: row.source, createdAt: row.created_at,
});
const mapPassportAccessLogFromSupabase = (row) => ({
    id: row.id, studentId: row.student_id, viewerId: row.viewer_id,
    viewerKind: row.viewer_kind, fields: row.fields || [],
    reason: row.reason, createdAt: row.created_at,
});

// Turar joy va yotoqxonalar. Yashash joyi ma'lumoti kelajakda talaba
// ma'lumotlari qatlamidan avtomatik keladi - `source` shuni ajratib turadi.
const mapDormitoryFromSupabase = (row) => ({
    ...row.data, id: row.id, name: row.name, address: row.address,
    responsibleUserId: row.responsible_user_id, isActive: !!row.is_active,
    createdBy: row.created_by, createdAt: row.created_at,
});
const mapStudentHousingFromSupabase = (row) => ({
    ...row.data, id: row.id, studentId: row.student_id, academicYear: row.academic_year,
    housingType: row.housing_type, dormitoryId: row.dormitory_id, room: row.room,
    source: row.source, updatedBy: row.updated_by, updatedAt: row.updated_at,
});

// Terma jamoalar (10-mezon).
const mapSportTeamFromSupabase = (row) => ({
    ...row.data, id: row.id, clubId: row.club_id, name: row.name, sport: row.sport,
    academicYear: row.academic_year,
    maxSize: row.max_size == null ? null : Number(row.max_size),
    isActive: !!row.is_active, createdBy: row.created_by, createdAt: row.created_at,
});
const mapSportNominationFromSupabase = (row) => ({
    ...row.data, id: row.id, teamId: row.team_id, studentId: row.student_id,
    academicYear: row.academic_year, source: row.source, nominatedBy: row.nominated_by,
    motivation: row.motivation, status: row.status,
    reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at,
    reviewComment: row.review_comment, createdAt: row.created_at,
});
const mapSportConductFlagFromSupabase = (row) => ({
    ...row.data, id: row.id, studentId: row.student_id, academicYear: row.academic_year,
    part: row.part, reason: row.reason, recordedBy: row.recorded_by, recordedAt: row.recorded_at,
});

// Madaniy tashriflar (9-mezon).
const mapCulturalPlaceFromSupabase = (row) => ({
    ...row.data, id: row.id, name: row.name, type: row.type, address: row.address,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    isActive: !!row.is_active, createdBy: row.created_by, createdAt: row.created_at,
});
const mapCulturalVisitFromSupabase = (row) => ({
    ...row.data, id: row.id, studentId: row.student_id, academicYear: row.academic_year,
    placeId: row.place_id, placeName: row.place_name, placeType: row.place_type,
    visitedAt: row.visited_at,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    accuracy: row.accuracy_m == null ? null : Number(row.accuracy_m),
    distance: row.distance_m == null ? null : Number(row.distance_m),
    photoPath: row.photo_path, note: row.note, status: row.status,
    reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at,
    reviewComment: row.review_comment, createdAt: row.created_at,
});

const mapAcademicRecordFromSupabase = (row) => ({
    ...row.data, id: row.id, studentId: row.student_id, academicYear: row.academic_year,
    semester: row.semester, gpa: row.gpa === null ? null : Number(row.gpa),
    credits: row.credits === null ? null : Number(row.credits),
    source: row.source, syncedAt: row.synced_at, updatedAt: row.updated_at
});
// Testlar moduli. Avval savollar ham, testlar ham, natijalar ham komponent ichidagi
// `useState` massivlarda edi - ya'ni har brauzerda boshqacha va natijalar umuman
// saqlanmasdi.
const mapQuestionBaseFromSupabase = (row) => ({
    ...row.data, id: row.id, title: row.title, status: row.status, createdAt: row.created_at
});
const mapTestQuestionFromSupabase = (row) => ({
    ...row.data, id: row.id, baseId: row.base_id, subject: row.subject,
    difficulty: row.difficulty, createdAt: row.created_at
});
const mapTestFromSupabase = (row) => ({
    ...row.data, id: row.id, title: row.title, subject: row.subject, status: row.status,
    isPublished: row.is_published, opensAt: row.opens_at, closesAt: row.closes_at,
    createdAt: row.created_at, updatedAt: row.updated_at
});
const mapTestAttemptFromSupabase = (row) => ({
    ...row.data, id: row.id, testId: row.test_id, studentId: row.student_id,
    score: Number(row.score) || 0, maxScore: Number(row.max_score) || 0,
    correct: row.correct, total: row.total, finishedAt: row.finished_at, createdAt: row.created_at
});
const mapScholarshipEvaluationFromSupabase = (row) => ({
    ...row.data, id: row.id, applicationId: row.application_id, grantId: row.grant_id,
    evaluatorId: row.evaluator_id, total: Number(row.total) || 0,
    createdAt: row.created_at, updatedAt: row.updated_at
});
// Bayonnoma / taqdirlash / hujjatlar. Qidiriladigan maydonlar alohida ustunda, qolgani `data` ichida.
const mapProtocolFromSupabase = (row) => ({
    ...row.data, id: row.id, activityType: row.activity_type, activityId: row.activity_id,
    registrationNumber: row.registration_number, status: row.status, revision: row.revision,
    createdAt: row.created_at, updatedAt: row.updated_at
});
const mapProtocolParticipantFromSupabase = (row) => ({ ...row.data, id: row.id, protocolId: row.protocol_id });
const mapProtocolSignerFromSupabase = (row) => ({
    ...row.data, id: row.id, protocolId: row.protocol_id, username: row.username, status: row.status
});
const mapAwardRuleFromSupabase = (row) => ({ ...row.data, id: row.id, scopeType: row.scope_type, scopeId: row.scope_id });
const mapAwardBatchFromSupabase = (row) => ({
    ...row.data, id: row.id, protocolId: row.protocol_id,
    registrationNumber: row.registration_number, status: row.status, createdAt: row.created_at
});
const mapDocumentFromSupabase = (row) => ({
    ...row.data, id: row.id, protocolId: row.protocol_id, batchId: row.batch_id,
    recipientId: row.recipient_id, documentType: row.document_type,
    registrationNumber: row.registration_number, verificationToken: row.verification_token,
    status: row.status, createdAt: row.created_at, updatedAt: row.updated_at
});
const mapDocumentAuditFromSupabase = (row) => ({
    ...row.data, id: row.id, protocolId: row.protocol_id, documentId: row.document_id,
    action: row.action, createdAt: row.created_at
});
const mapEventCollectionFromSupabase = (row) => ({
    id: row.id, name: row.name, description: row.description,
    startDate: row.start_date, endDate: row.end_date, status: row.status,
    coverImage: row.cover_image, createdBy: row.created_by,
    createdAt: row.created_at, updatedAt: row.updated_at,
    scoringConfig: mergeScoringConfig(row.data?.scoringConfig),
    settingsHistory: row.data?.settingsHistory || [],
});
const mapEventCollectionItemFromSupabase = (row) => ({
    id: row.id, collectionId: row.collection_id, activityType: row.activity_type,
    activityId: row.activity_id, contributionType: row.contribution_type,
    addedBy: row.added_by, addedAt: row.added_at,
});
const mapTutorGroupAssignmentFromSupabase = (row) => ({
    id: row.id, tutorUsername: row.tutor_username, groupName: row.group_name,
    active: row.active, assignedBy: row.assigned_by, assignedAt: row.assigned_at, endedAt: row.ended_at,
});
const eventCollectionTableError = (error) => {
    const message = String(error?.message || '');
    if (/relation .*(event_collections|event_collection_items|tutor_group_assignments).* does not exist/i.test(message)) {
        return new Error(
            "Tadbirlar to'plami jadvali topilmadi. Supabase SQL Editor da "
            + '`supabase/event_collections.sql` ni bir marta ishga tushiring.'
        );
    }
    return error;
};
// Tadbirlar to'plami statusi - CompetitionsManagementTab.jsx/EventsCalendar.jsx dagi bilan bir xil
// qoida, shu faylga mahalliy nusxasi.
const classifyCompetitionForCollection = (c) => {
    const isCompleted = (c.currentRound || 1) > (c.roundsCount || 1);
    if (isCompleted) return 'closed';
    const startDateTime = c.startDate ? combineDateTime(c.startDate, c.startTime) : null;
    if (startDateTime && new Date(startDateTime) > new Date()) return 'upcoming';
    return 'ongoing';
};
const classifyEventForCollection = (e) => {
    if (e.status === 'completed') return 'closed';
    if (e.status === 'ongoing') return 'ongoing';
    return 'upcoming';
};

// Umumiy o'lcham (fakultet/tyutor/kurs/guruh) agregatori - to'rttasi ham bir xil
// qoida bilan hisoblanadi, faqat "kalit qanday olinadi" va "umumiy son qayerdan
// keladi" farq qiladi. `includeTeamPlacement=false` FAQAT talaba darajasida
// ishlatiladi (29-band, B varianti: jamoa o'rni shaxsiy ballga kirmaydi).
//
// Jamoaviy faoliyatda bitta jamoaning o'rni bir fakultetga BIR MARTA
// hisoblanadi (necha a'zosi bo'lishidan qat'i nazar) - aks holda ko'p a'zoli
// bir xil fakultetdagi jamoa g'ayritabiiy ko'p ball olardi. Individual
// faoliyatda esa har talabaning o'z o'rni mustaqil - dedup qo'llanmaydi.
const buildDimensionRows = (flatRows, config, keyOf, totalOf, { includeTeamPlacement = true } = {}) => {
    const agg = new Map();
    const placementCreditGiven = new Set();
    flatRows.forEach(row => {
        const key = keyOf(row);
        if (key == null || key === '') return;
        if (!agg.has(key)) {
            agg.set(key, {
                key, uniqueStudents: new Set(), totalParticipation: 0,
                placements: { 1: 0, 2: 0, 3: 0 }, placementPoints: 0, participationPoints: 0,
                // Ball qayerdan kelgani (20-band drill-down, endi fakultet/tyutor/kurs/guruh
                // darajasida ham) - bitta faoliyat bo'yicha BITTA qatorga yig'iladi, aks holda
                // 30 talabali fakultetda bitta trening 30 marta takrorlanib chiqib ketardi.
                activityBreakdown: new Map(), // activityKey -> { title, activityType, activityId, participants, participationPoints, placementPoints, place }
            });
        }
        const bucket = agg.get(key);
        bucket.uniqueStudents.add(row.studentId);
        bucket.totalParticipation += 1;
        const activityKey = `${row.activityType}:${row.activityId}`;
        if (!bucket.activityBreakdown.has(activityKey)) {
            bucket.activityBreakdown.set(activityKey, {
                activityType: row.activityType, activityId: row.activityId, title: row.title,
                participants: 0, participationPoints: 0, placementPoints: 0, place: row.place || null,
            });
        }
        const abEntry = bucket.activityBreakdown.get(activityKey);
        abEntry.participants += 1;

        if (row.contributionType === 'participation' || row.contributionType === 'placement') {
            const pts = participationPointsFor(config);
            bucket.participationPoints += pts;
            abEntry.participationPoints += pts;
        }
        if (row.contributionType === 'placement' && row.place && (includeTeamPlacement || !row.isTeam)) {
            const credit = () => {
                const pts = placementPointsFor(config, row.place);
                bucket.placementPoints += pts;
                abEntry.placementPoints += pts;
                if (row.place <= 3) bucket.placements[row.place] = (bucket.placements[row.place] || 0) + 1;
            };
            if (row.isTeam) {
                const creditKey = `${key}::${row.activityType}:${row.activityId}`;
                if (!placementCreditGiven.has(creditKey)) { placementCreditGiven.add(creditKey); credit(); }
            } else {
                credit();
            }
        }
    });
    return Array.from(agg.values()).map(b => {
        const uniqueCount = b.uniqueStudents.size;
        const total = totalOf(b.key);
        const coveragePercent = (total != null && total > 0) ? (uniqueCount / total) * 100 : null;
        const coveragePoints = coveragePercent != null ? coveragePointsFor(config, coveragePercent) : 0;
        const totalPoints = b.placementPoints + b.participationPoints + coveragePoints;
        return {
            key: b.key, totalPopulation: total, uniqueParticipants: uniqueCount,
            coveragePercent, totalParticipation: b.totalParticipation,
            firstPlaces: b.placements[1] || 0, secondPlaces: b.placements[2] || 0, thirdPlaces: b.placements[3] || 0,
            placementPoints: b.placementPoints, participationPoints: b.participationPoints,
            coveragePoints, bonusPoints: 0, totalPoints,
            coverage: coveragePercent, participation: b.totalParticipation,
            breakdown: Array.from(b.activityBreakdown.values())
                .sort((x, y) => (y.placementPoints + y.participationPoints) - (x.placementPoints + x.participationPoints)),
        };
    }).sort(compareByTieBreak(config.tieBreakOrder));
};

const mapTurScheduleFromSupabase = (row) => ({ ...row.data, id: row.id, competitionId: row.competition_id });
const mapJudgeRoleFromSupabase = (row) => ({ ...row.data, id: row.id, competitionId: row.competition_id });
const mapDebatePenaltyFromSupabase = (row) => ({ ...row.data, id: row.id, competitionId: row.competition_id });
const mapStudentRecognitionFromSupabase = (row) => ({
    id: row.id, kind: row.kind, activityType: row.activity_type, activityId: row.activity_id,
    activityTitle: row.activity_title, studentId: row.student_id, source: row.source, place: row.place,
    participationDescription: row.participation_description, amount: row.amount, prizeTitle: row.prize_title,
    status: row.status, proposedBy: row.proposed_by, proposedAt: row.proposed_at,
    reviewedBy: row.reviewed_by, reviewedAt: row.reviewed_at, reviewComment: row.review_comment,
});
const userManagementError = (error) => {
    const message = String(error?.message || '');
    if (/function .*admin_(create_user|set_user_role|reset_user_password).* does not exist/i.test(message)) {
        return new Error(
            "Foydalanuvchi boshqaruvi funksiyalari topilmadi. Supabase SQL Editor da "
            + '`supabase/admin_user_management.sql` ni bir marta ishga tushiring.'
        );
    }
    return error;
};

const studentRecognitionTableError = (error) => {
    const message = String(error?.message || '');
    if (/relation .*student_recognitions.* does not exist/i.test(message)) {
        return new Error(
            "Rag'bat/mukofot reestri jadvali topilmadi. Supabase SQL Editor da "
            + '`supabase/student_recognitions.sql` ni bir marta ishga tushiring.'
        );
    }
    return error;
};

// membersCount is deliberately NOT a value trusted from the `clubs` row - it's derived fresh from
// the real membership rows on every sync, so it can never drift and a plain member (who can't write
// to `clubs` under RLS) never needs permission to touch it just by joining/leaving.
// Profillar `profiles_directory` ko'rinishidan o'qiladi: u boshqa talabalarning
// F.I.Sh./fakultet/kursini beradi, guruh va talaba ID kabi shaxsiy maydonlarni esa
// xodim bo'lmagan foydalanuvchiga NULL qilib qaytaradi (supabase/rls_personal_data.sql).
//
// Ko'rinish topilmasa eski `profiles` jadvaliga qaytadi. Sababi ketma-ketlik: kod
// deploy bo'lgani bilan SQL hali ishga tushirilmagan bo'lishi mumkin. Bu qaytish
// bo'lmasa o'sha oraliqda real foydalanuvchilar ro'yxatlardan jimgina yo'qolardi -
// sinxronizatsiya xatoni yutib yuboradi va `realProfiles` bo'sh massiv bo'lib qolardi.
const fetchProfileRows = async () => {
    const viaView = await supabase.from('profiles_directory').select('*');
    if (!viaView.error) return viaView;
    return supabase.from('profiles').select('*');
};

const syncCoreDataFromSupabase = async () => {
    // HAMMA SO'ROV BIR VAQTDA.
    //
    // Ilgari bu funksiya ~75 ta so'rovni 15 ta KETMA-KET to'lqinda yuborardi
    // (klublar bloki tugagach venue bloki, u tugagach stipendiya bloki...) -
    // garchi ular bir-biriga hech qanday bog'liqligi bo'lmasa ham. Har bir
    // to'lqin bitta tarmoq davri (round-trip) qo'shar edi, ya'ni bu funksiya
    // (63 joyda, har bir yozish amalidan keyin chaqiriladi) 15 barobar sekin
    // ishlardi kerakligidan. Endi hammasi BITTA Promise.all bilan bir vaqtda
    // yuboriladi; qayta ishlash mantig'i (xatolarni tekshirish, xaritalash,
    // dbData ga yozish) hech o'zgarmadi - faqat QACHON so'ralishi o'zgardi.
    const [
        coreRes, venueRes, schRes, testRes, poydevorRes, marifatRes, culturalRes,
        caResSingle, sdocRes, cjrRes, sportRes, housRes, passportRes, talentRes,
        lifecycleRes, protocolRes, clubRegRes, clubDocRes, eventCollRes, recognitionRes, delegationRes, socialAppRes, compDelegRes, clubPosRes, socialCfgRes, compOpsRes, recordsRes
    ] = await Promise.all([
        Promise.all([
            supabase.from('clubs').select('*'),
            supabase.from('memberships').select('*'),
            // Foydalanuvchining O'Z to'liq profili bundan olinmaydi - uni AuthContext
            // `profiles` jadvalidan o'z qatori bo'yicha o'qiydi (izoh yuqorida).
            fetchProfileRows(),
            supabase.from('teams').select('*'),
            supabase.from('team_members').select('*'),
            supabase.from('events').select('*'),
            supabase.from('registrations').select('*'),
            supabase.from('registration_audit_logs').select('*'),
            supabase.from('notifications').select('*'),
            supabase.from('competitions').select('*'),
            supabase.from('competition_scores').select('*'),
            supabase.from('competition_audit_logs').select('*'),
            supabase.from('competition_rounds').select('*'),
            supabase.from('competition_matches').select('*'),
            supabase.from('competition_groups').select('*'),
            supabase.from('debate_matches').select('*'),
            supabase.from('debate_match_lineups').select('*'),
            supabase.from('debate_match_notiq_scores').select('*'),
            supabase.from('debate_match_best_speaker_picks').select('*'),
            supabase.from('debate_penalties').select('*')
        ]),
        Promise.all([
            supabase.from('venues').select('*'),
            supabase.from('competition_tur_schedule').select('*'),
            supabase.from('competition_judge_roles').select('*')
        ]),
        Promise.all([
            supabase.from('scholarship_grants').select('*'),
            supabase.from('scholarship_applications').select('*'),
            supabase.from('scholarship_settings').select('*').eq('id', 'default'),
            supabase.from('scholarship_evaluations').select('*')
        ]),
        Promise.all([
            supabase.from('question_bases').select('*'),
            supabase.from('test_questions').select('*'),
            supabase.from('tests').select('*'),
            supabase.from('test_attempts').select('*')
        ]),
        Promise.all([
            supabase.from('social_score_transactions').select('*'),
            supabase.from('activity_attendance').select('*'),
            supabase.from('activity_attendance_locks').select('*'),
            supabase.from('activity_attendance_audit_logs').select('*'),
            supabase.from('academic_records').select('*'),
            supabase.from('integration_settings').select('*')
        ]),
        Promise.all([
            supabase.from('marifat_lessons').select('*'),
            supabase.from('marifat_attendance').select('*'),
            supabase.from('marifat_activity_scores').select('*')
        ]),
        Promise.all([
            supabase.from('cultural_places').select('*'),
            supabase.from('cultural_visits').select('*')
        ]),
        supabase.from('club_achievements').select('*'),
        Promise.all([
            supabase.from('student_documents').select('*'),
            supabase.from('social_index_evidence').select('*'),
            supabase.from('social_index_assessments').select('*'),
            supabase.from('social_index_requests').select('*'),
            supabase.from('social_index_appeals').select('*')
        ]),
        Promise.all([
            supabase.from('club_join_requests').select('*'),
            supabase.from('club_membership_events').select('*')
        ]),
        Promise.all([
            supabase.from('sport_teams').select('*'),
            supabase.from('sport_team_nominations').select('*'),
            supabase.from('sport_conduct_flags').select('*')
        ]),
        Promise.all([
            supabase.from('dormitories').select('*'),
            supabase.from('student_housing').select('*')
        ]),
        Promise.all([
            supabase.from('student_passport').select('*'),
            supabase.from('student_enrollment_history').select('*'),
            supabase.from('passport_access_logs').select('*')
        ]),
        Promise.all([
            supabase.from('talent_profiles').select('*'),
            supabase.from('talent_assignments').select('*'),
            supabase.from('talent_idps').select('*'),
            supabase.from('talent_goals').select('*'),
            supabase.from('talent_monitoring').select('*'),
            supabase.from('talent_targets').select('*'),
            supabase.from('recognition_cases').select('*'),
            supabase.from('recognition_records').select('*'),
            supabase.from('recognition_rules').select('*')
        ]),
        Promise.all([
            supabase.from('activity_tasks').select('*'),
            supabase.from('activity_reports').select('*')
        ]),
        Promise.all([
            supabase.from('protocols').select('*'),
            supabase.from('protocol_signers').select('*'),
            supabase.from('award_rules').select('*'),
            supabase.from('award_batches').select('*'),
            supabase.from('documents').select('*'),
            supabase.from('document_audit_logs').select('*')
        ]),
        Promise.all([
            supabase.from('club_applications').select('*'),
            supabase.from('club_application_reviews').select('*'),
            supabase.from('club_regulations').select('*'),
            supabase.from('club_certificates').select('*'),
            supabase.from('club_status_history').select('*')
        ]),
        supabase.from('club_documents').select('*'),
        Promise.all([
            supabase.from('event_collections').select('*'),
            supabase.from('event_collection_items').select('*'),
            supabase.from('tutor_group_assignments').select('*')
        ]),
        supabase.from('student_recognitions').select('*'),
        supabase.from('event_delegations').select('*'),
        Promise.all([
            supabase.from('social_activity_applications').select('*'),
            supabase.from('social_activity_audit_logs').select('*')
        ]),
        supabase.from('competition_delegations').select('*'),
        Promise.all([
            supabase.from('club_positions').select('*'),
            supabase.from('club_position_applications').select('*'),
            supabase.from('club_position_audit_logs').select('*')
        ]),
        Promise.all([
            supabase.from('social_scoring_sources').select('*'),
            supabase.from('social_criteria_categories').select('*'),
            supabase.from('social_criteria_subcategories').select('*')
        ]),
        // Musobaqa o'tkazish yozuvlari (supabase/competition_operations.sql).
        Promise.all([
            supabase.from('competition_participant_groups').select('*'),
            supabase.from('competition_participant_seats').select('*'),
            supabase.from('competition_advancement_rules').select('*'),
            supabase.from('competition_tiebreak_resolutions').select('*'),
            supabase.from('competition_advancement_results').select('*'),
            supabase.from('competition_appeals').select('*'),
            supabase.from('competition_appeal_audit_logs').select('*'),
            supabase.from('competition_group_action_logs').select('*'),
            supabase.from('competition_case_roles').select('*'),
            supabase.from('competition_question_points').select('*'),
            supabase.from('competition_scoring_groups').select('*'),
            supabase.from('issued_certificates').select('*')
        ]),
        // Intizom, lavozim tayinlash, raund holati, kitobxonlik seanslari
        // (supabase/penalties_positions_sessions.sql).
        Promise.all([
            supabase.from('social_index_penalties').select('*'),
            supabase.from('discipline_violations').select('*'),
            supabase.from('club_position_assignments').select('*'),
            supabase.from('competition_round_participant_status').select('*'),
            supabase.from('reading_sessions').select('*')
        ])
    ]);

    const [
        { data: clubRows, error: clubsErr }, { data: membershipRows, error: membershipsErr },
        { data: profileRows, error: profilesErr }, { data: teamRows, error: teamsErr },
        { data: teamMemberRows, error: teamMembersErr }, { data: eventRows, error: eventsErr },
        { data: registrationRows, error: registrationsErr }, { data: auditRows, error: auditErr },
        { data: notificationRows, error: notificationsErr },
        { data: competitionRows, error: competitionsErr }, { data: scoreRows, error: scoresErr },
        { data: compAuditRows, error: compAuditErr }, { data: roundRows, error: roundsErr },
        { data: matchRows, error: matchesErr }, { data: groupRows, error: groupsErr },
        { data: debateMatchRows, error: debateMatchesErr }, { data: debateLineupRows, error: debateLineupsErr },
        { data: debateNotiqScoreRows, error: debateNotiqScoresErr },
        { data: debateBestSpeakerRows, error: debateBestSpeakerErr },
        { data: debatePenaltyRows, error: debatePenaltiesErr }
    ] = coreRes;
    if (clubsErr) throw clubsErr;
    if (membershipsErr) throw membershipsErr;
    if (profilesErr) throw profilesErr;
    if (teamsErr) throw teamsErr;
    if (teamMembersErr) throw teamMembersErr;
    if (eventsErr) throw eventsErr;
    if (registrationsErr) throw registrationsErr;
    if (auditErr) throw auditErr;
    if (notificationsErr) throw notificationsErr;
    if (competitionsErr) throw competitionsErr;
    if (scoresErr) throw scoresErr;
    if (compAuditErr) throw compAuditErr;
    if (roundsErr) throw roundsErr;
    if (matchesErr) throw matchesErr;
    if (groupsErr) throw groupsErr;
    if (debateMatchesErr) throw debateMatchesErr;
    if (debateLineupsErr) throw debateLineupsErr;
    if (debateNotiqScoresErr) throw debateNotiqScoresErr;
    if (debateBestSpeakerErr) throw debateBestSpeakerErr;
    if (debatePenaltiesErr) throw debatePenaltiesErr;

    const memberships = (membershipRows || []).map(mapMembershipFromSupabase);
    const countByClub = new Map();
    memberships.forEach(m => countByClub.set(m.clubId, (countByClub.get(m.clubId) || 0) + 1));
    const clubs = (clubRows || [])
        .map(row => ({ ...mapClubFromSupabase(row), membersCount: countByClub.get(row.id) || 0 }))
        .sort((a, b) => (a.displayNumber || 0) - (b.displayNumber || 0));

    const dbData = getDB();
    dbData.clubs = clubs;
    dbData.memberships = memberships;
    dbData.realProfiles = (profileRows || []).map(mapProfileFromSupabase);
    dbData.teams = (teamRows || []).map(mapTeamFromSupabase);
    dbData.teamMembers = (teamMemberRows || []).map(mapTeamMemberFromSupabase);
    dbData.events = (eventRows || []).map(mapEventFromSupabase).sort((a, b) => (a.displayNumber || 0) - (b.displayNumber || 0));
    dbData.registrations = (registrationRows || []).map(mapRegistrationFromSupabase);
    dbData.registrationAuditLogs = (auditRows || []).map(mapRegistrationAuditLogFromSupabase);
    dbData.notifications = (notificationRows || []).map(mapNotificationFromSupabase);
    dbData.competitions = (competitionRows || []).map(mapCompetitionFromSupabase).sort((a, b) => (a.displayNumber || 0) - (b.displayNumber || 0));
    dbData.competitionScores = (scoreRows || []).map(mapCompetitionScoreFromSupabase);
    dbData.competitionAuditLogs = (compAuditRows || []).map(mapCompetitionAuditLogFromSupabase);
    dbData.competitionRounds = (roundRows || []).map(mapCompetitionRoundFromSupabase);
    // These seven were fetched (and their errors checked) but never actually written into the local
    // mirror — so every read of them (db.getCompetitionGroups/getDebateMatches/getDebateMatchLineup/
    // getDebateNotiqScores/...) always saw an empty array, no matter what had just been written to
    // Supabase. That made every match-based feature look like it silently did nothing: adding a guruh,
    // creating an uchrashuv, assigning a notiq, entering scores.
    dbData.competitionMatches = (matchRows || []).map(mapCompetitionMatchFromSupabase);
    dbData.competitionGroups = (groupRows || []).map(mapCompetitionGroupFromSupabase);
    dbData.debateMatches = (debateMatchRows || []).map(mapDebateMatchFromSupabase);
    dbData.debateMatchLineups = (debateLineupRows || []).map(mapDebateMatchLineupFromSupabase);
    dbData.debateMatchNotiqScores = (debateNotiqScoreRows || []).map(mapDebateMatchNotiqScoreFromSupabase);
    dbData.debateMatchBestSpeakerPicks = (debateBestSpeakerRows || []).map(mapDebateMatchBestSpeakerPickFromSupabase);
    dbData.debatePenalties = (debatePenaltyRows || []).map(mapDebatePenaltyFromSupabase);

    // Uch jadval alohida bloqda qoldi - migratsiya kech qo'shilgani uchun destructure
    // ro'yxati o'zgarmadi. So'rovning o'zi baribir yuqoridagi bitta katta Promise.all
    // ichida - bu yerda faqat NATIJASI o'qiladi, tarmoqqa yangi chiqish yo'q.
    const [
        { data: venueRows, error: venuesErr },
        { data: turScheduleRows, error: turScheduleErr },
        { data: judgeRoleRows, error: judgeRolesErr }
    ] = venueRes;
    if (venuesErr) throw venuesErr;
    if (turScheduleErr) throw turScheduleErr;
    if (judgeRolesErr) throw judgeRolesErr;
    dbData.venues = (venueRows || []).map(mapVenueFromSupabase);
    dbData.competitionTurSchedule = (turScheduleRows || []).map(mapTurScheduleFromSupabase);
    dbData.competitionJudgeRoles = (judgeRoleRows || []).map(mapJudgeRoleFromSupabase);

    // Stipendiya bloki.
    const [
        { data: grantRows, error: grantsErr },
        { data: schAppRows, error: schAppsErr },
        { data: schSettingsRows, error: schSettingsErr },
        { data: schEvalRows, error: schEvalsErr }
    ] = schRes;
    // Ataylab `throw` emas: supabase/scholarships.sql hali ishga tushirilmagan bo'lsa ham butun
    // platforma qulab tushmasligi kerak. Jadval yo'q bo'lsa stipendiya bo'limi mahalliy seed
    // ma'lumot bilan ishlayveradi, konsolda ogohlantirish chiqadi.
    if (grantsErr || schAppsErr || schSettingsErr || schEvalsErr) {
        console.warn(
            '[stipendiya] Supabase jadvallari o\'qilmadi - supabase/scholarships.sql va '
            + 'supabase/scholarships_stages.sql ishga tushirilganmi?',
            grantsErr || schAppsErr || schSettingsErr || schEvalsErr
        );
        // Interfeys buni ko'rsatishi uchun bayroq: jadvalsiz yaratilgan grant hech qayerga
        // yozilmaydi va boshqa kompyuterda ko'rinmaydi - buni admin bilishi SHART.
        dbData.scholarshipBackendReady = false;
    } else {
        dbData.scholarshipBackendReady = true;
        dbData.scholarshipGrants = (grantRows || []).map(mapScholarshipGrantFromSupabase);
        dbData.scholarshipApplications = (schAppRows || []).map(mapScholarshipApplicationFromSupabase);
        dbData.scholarshipSettings = (schSettingsRows || [])[0]?.data || {};
        dbData.scholarshipEvaluations = (schEvalRows || []).map(mapScholarshipEvaluationFromSupabase);
    }

    // Testlar bloki. Stipendiyaning test bosqichi shu ma'lumotdan ball oladi,
    // shuning uchun u ham xuddi shunday "yiqilmaydigan" tarzda o'qiladi.
    const [
        { data: qBaseRows, error: qBasesErr },
        { data: qRows, error: qErr },
        { data: testRows, error: testsErr },
        { data: attemptRows, error: attemptsErr }
    ] = testRes;
    if (qBasesErr || qErr || testsErr || attemptsErr) {
        console.warn(
            '[testlar] Supabase jadvallari o\'qilmadi - supabase/tests.sql ishga tushirilganmi?',
            qBasesErr || qErr || testsErr || attemptsErr
        );
        dbData.testsBackendReady = false;
    } else {
        dbData.questionBases = (qBaseRows || []).map(mapQuestionBaseFromSupabase);
        dbData.testQuestions = (qRows || []).map(mapTestQuestionFromSupabase);
        dbData.tests = (testRows || []).map(mapTestFromSupabase);
        dbData.testAttempts = (attemptRows || []).map(mapTestAttemptFromSupabase);
        dbData.testsBackendReady = true;
    }

    // Phase 0 poydevori: ijtimoiy faollik ledgeri, davomat, akademik ko'rsatkich.
    // Bular Talent moduli va stipendiya me'zonlarining asosiy manbai.
    const [
        { data: sstRows, error: sstErr },
        { data: attRows, error: attErr },
        { data: attLockRows, error: attLockErr },
        { data: attAuditRows, error: attAuditErr },
        { data: acadRows, error: acadErr },
        { data: integrationRows, error: integrationErr }
    ] = poydevorRes;
    if (sstErr || attErr || attLockErr || attAuditErr || acadErr || integrationErr) {
        console.warn(
            '[poydevor] Supabase jadvallari o\'qilmadi - supabase/talent_phase0.sql ishga tushirilganmi?',
            sstErr || attErr || attLockErr || attAuditErr || acadErr || integrationErr
        );
        dbData.foundationBackendReady = false;
    } else {
        dbData.socialScoreTransactions = (sstRows || []).map(mapSocialScoreTxnFromSupabase);
        dbData.activityAttendance = (attRows || []).map(mapAttendanceFromSupabase);
        dbData.activityAttendanceLocks = (attLockRows || []).map(mapAttendanceLockFromSupabase);
        dbData.activityAttendanceAuditLogs = (attAuditRows || []).map(mapAttendanceAuditFromSupabase);
        dbData.academicRecords = (acadRows || []).map(mapAcademicRecordFromSupabase);
        dbData.integrationSettings = Object.fromEntries(
            (integrationRows || []).map(r => [r.id, r.data || {}])
        );
        dbData.foundationBackendReady = true;
    }

    // "Ma'rifat darslari" (7-mezon). ALOHIDA blok: bu jadvallar keyinroq
    // qo'shilgan, shuning uchun `supabase/marifat_lessons.sql` hali ishga
    // tushirilmagan o'rnatmada ham qolgan hammasi ishlashda davom etsin.
    const [
        { data: mlRows, error: mlErr },
        { data: maRows, error: maErr },
        { data: masRows, error: masErr },
    ] = marifatRes;
    if (mlErr || maErr || masErr) {
        console.warn(
            "[ma'rifat] jadvallar o'qilmadi - supabase/marifat_lessons.sql ishga tushirilganmi?",
            mlErr || maErr || masErr
        );
        dbData.marifatBackendReady = false;
    } else {
        dbData.marifatLessons = (mlRows || []).map(mapMarifatLessonFromSupabase);
        dbData.marifatAttendance = (maRows || []).map(mapMarifatAttendanceFromSupabase);
        dbData.marifatActivityScores = (masRows || []).map(mapMarifatActivityScoreFromSupabase);
        dbData.marifatBackendReady = true;
    }

    // Madaniy tashriflar (9-mezon) - alohida blok, o'z SQL fayli bilan.
    const [
        { data: cpRows, error: cpErr },
        { data: cvRows, error: cvErr },
    ] = culturalRes;
    if (cpErr || cvErr) {
        console.warn(
            "[madaniy tashrif] jadvallar o'qilmadi - supabase/cultural_visits.sql ishga tushirilganmi?",
            cpErr || cvErr
        );
        dbData.culturalBackendReady = false;
    } else {
        dbData.culturalPlaces = (cpRows || []).map(mapCulturalPlaceFromSupabase);
        dbData.culturalVisits = (cvRows || []).map(mapCulturalVisitFromSupabase);
        dbData.culturalBackendReady = true;
    }

    // Klub yutuqlari (tashqi) - alohida blok, o'z SQL fayli bilan.
    //
    // Faqat TASHQI yutuqlar o'qiladi. Ichki yutuqlar bu yerda yo'q va
    // bo'lmasligi ham kerak: ular berilgan hujjatlardan hisoblanadi va
    // ularni ikkinchi joyda saqlash ikki xil haqiqat yaratardi.
    const { data: caRows, error: caErr } = caResSingle;
    if (caErr) {
        console.warn(
            "[klub yutuqlari] jadval o'qilmadi - supabase/club_achievements.sql ishga tushirilganmi?",
            caErr
        );
        dbData.clubAchievementsBackendReady = false;
    } else {
        dbData.clubAchievements = (caRows || []).map(row => ({
            ...(row.data || {}), id: row.id, clubId: row.club_id, status: row.status,
        }));
        dbData.clubAchievementsBackendReady = true;
    }

    // TALABA HUJJATLARI VA INDEKSNING YUBORISH QATLAMI.
    //
    // Bu blok KECHIKIB qo'shildi va shuning uchun muhim: bu jadvallar
    // ilgari umuman sinxronlanmasdi. Talabaning dalili, tyutorning bahosi
    // va e'tirozlar faqat o'sha brauzerda qolardi - ya'ni tyutor talabaning
    // hujjatini KO'RA OLMASDI (supabase/student_documents.sql).
    const [
        { data: sdocRows, error: sdocErr },
        { data: sieRows, error: sieErr },
        { data: siaRows, error: siaErr },
        { data: sirRows, error: sirErr },
        { data: sapRows, error: sapErr },
    ] = sdocRes;
    if (sdocErr || sieErr || siaErr || sirErr || sapErr) {
        console.warn(
            "[talaba hujjatlari] jadvallar o'qilmadi - supabase/student_documents.sql ishga tushirilganmi?",
            sdocErr || sieErr || siaErr || sirErr || sapErr
        );
        dbData.studentDocsBackendReady = false;
    } else {
        dbData.studentDocuments = (sdocRows || []).map(row => ({
            ...(row.data || {}), id: row.id, studentId: row.student_id,
            docType: row.doc_type, title: row.title, filePath: row.file_path,
            createdAt: row.created_at,
        }));
        dbData.socialIndexEvidence = (sieRows || []).map(row => ({
            ...(row.data || {}), id: row.id, studentId: row.student_id,
            criterionKey: row.criterion_key, academicYear: row.academic_year,
            status: row.status, documentId: row.document_id,
        }));
        dbData.socialIndexAssessments = (siaRows || []).map(row => ({
            ...(row.data || {}), id: row.id, studentId: row.student_id,
            criterionKey: row.criterion_key, academicYear: row.academic_year,
            points: Number(row.points),
        }));
        dbData.socialIndexRequests = (sirRows || []).map(row => ({
            ...(row.data || {}), id: row.id, studentId: row.student_id,
            criterionKey: row.criterion_key, academicYear: row.academic_year,
        }));
        dbData.socialIndexAppeals = (sapRows || []).map(row => ({
            ...(row.data || {}), id: row.id, evidenceId: row.evidence_id,
            studentId: row.student_id, status: row.status,
        }));
        dbData.studentDocsBackendReady = true;
    }

    // Klubga a'zolik: arizalar va tarix - alohida blok, o'z SQL fayli bilan.
    const [
        { data: cjrRows, error: cjrErr },
        { data: cmeRows, error: cmeErr },
    ] = cjrRes;
    if (cjrErr || cmeErr) {
        console.warn(
            "[klub a'zoligi] jadvallar o'qilmadi - supabase/club_membership.sql ishga tushirilganmi?",
            cjrErr || cmeErr
        );
        dbData.clubMembershipBackendReady = false;
    } else {
        dbData.clubJoinRequests = (cjrRows || []).map(row => ({
            ...(row.data || {}), id: row.id, clubId: row.club_id, userId: row.user_id, status: row.status,
        }));
        dbData.clubMembershipEvents = (cmeRows || []).map(row => ({
            ...(row.data || {}), id: row.id, clubId: row.club_id, userId: row.user_id, action: row.action,
        }));
        dbData.clubMembershipBackendReady = true;
    }

    // Terma jamoalar (10-mezon) - alohida blok, o'z SQL fayli bilan.
    const [
        { data: stRows, error: stErr },
        { data: stnRows, error: stnErr },
        { data: scfRows, error: scfErr },
    ] = sportRes;
    if (stErr || stnErr || scfErr) {
        console.warn(
            "[terma jamoa] jadvallar o'qilmadi - supabase/sport_teams.sql ishga tushirilganmi?",
            stErr || stnErr || scfErr
        );
        dbData.sportBackendReady = false;
    } else {
        dbData.sportTeams = (stRows || []).map(mapSportTeamFromSupabase);
        dbData.sportTeamNominations = (stnRows || []).map(mapSportNominationFromSupabase);
        dbData.sportConductFlags = (scfRows || []).map(mapSportConductFlagFromSupabase);
        dbData.sportBackendReady = true;
    }

    // Turar joy va yotoqxonalar - alohida blok, o'z SQL fayli bilan.
    const [
        { data: dormRows, error: dormErr },
        { data: housRows, error: housErr },
    ] = housRes;
    if (dormErr || housErr) {
        console.warn(
            "[turar joy] jadvallar o'qilmadi - supabase/student_housing.sql ishga tushirilganmi?",
            dormErr || housErr
        );
        dbData.housingBackendReady = false;
    } else {
        dbData.dormitories = (dormRows || []).map(mapDormitoryFromSupabase);
        dbData.studentHousing = (housRows || []).map(mapStudentHousingFromSupabase);
        dbData.housingBackendReady = true;
    }

    // Talabaning raqamli pasporti - alohida blok, o'z SQL fayli bilan.
    const [
        { data: spRows, error: spErr },
        { data: sehRows, error: sehErr },
        { data: palRows, error: palErr },
    ] = passportRes;
    if (spErr || sehErr || palErr) {
        console.warn(
            "[pasport] jadvallar o'qilmadi - supabase/student_passport.sql ishga tushirilganmi?",
            spErr || sehErr || palErr
        );
        dbData.passportBackendReady = false;
    } else {
        dbData.studentPassports = (spRows || []).map(mapPassportFromSupabase);
        dbData.enrollmentHistory = (sehRows || []).map(mapEnrollmentFromSupabase);
        dbData.passportAccessLogs = (palRows || []).map(mapPassportAccessLogFromSupabase);
        dbData.passportBackendReady = true;
    }

    // "Iqtidorli talabalar" moduli bloki.
    const [
        { data: tpRows, error: tpErr },
        { data: taRows, error: taErr },
        { data: tiRows, error: tiErr },
        { data: tgRows, error: tgErr },
        { data: tmRows, error: tmErr },
        { data: ttRows, error: ttErr },
        { data: rcRows, error: rcErr },
        { data: rrRows, error: rrErr },
        { data: rruleRows, error: rruleErr }
    ] = talentRes;
    const talentErr = tpErr || taErr || tiErr || tgErr || tmErr || ttErr || rcErr || rrErr || rruleErr;
    if (talentErr) {
        console.warn(
            '[iqtidorli talabalar] Supabase jadvallari o\'qilmadi - supabase/talent_phase1.sql ishga tushirilganmi?',
            talentErr
        );
        dbData.talentBackendReady = false;
    } else {
        dbData.talentProfiles = (tpRows || []).map(mapTalentProfileFromSupabase);
        dbData.talentAssignments = (taRows || []).map(mapTalentAssignmentFromSupabase);
        dbData.talentIdps = (tiRows || []).map(mapTalentIdpFromSupabase);
        dbData.talentGoals = (tgRows || []).map(mapTalentGoalFromSupabase);
        dbData.talentMonitoring = (tmRows || []).map(mapTalentMonitoringFromSupabase);
        dbData.talentTargets = (ttRows || []).map(mapTalentTargetFromSupabase);
        dbData.recognitionCases = (rcRows || []).map(mapRecognitionCaseFromSupabase);
        dbData.recognitionRecords = (rrRows || []).map(mapRecognitionRecordFromSupabase);
        dbData.recognitionRules = (rruleRows || []).map(mapRecognitionRuleFromSupabase);
        dbData.talentBackendReady = true;
    }

    // Tadbir hayot yo'li bloki.
    const [
        { data: taskRows, error: tasksErr },
        { data: reportRows, error: reportsErr }
    ] = lifecycleRes;
    if (tasksErr || reportsErr) {
        console.warn(
            '[tadbir] Supabase jadvallari o\'qilmadi - supabase/activity_lifecycle.sql ishga tushirilganmi?',
            tasksErr || reportsErr
        );
        dbData.lifecycleBackendReady = false;
    } else {
        dbData.activityTasks = (taskRows || []).map(mapActivityTaskFromSupabase);
        dbData.activityReports = (reportRows || []).map(mapActivityReportFromSupabase);
        dbData.lifecycleBackendReady = true;
    }

    // Bayonnoma/taqdirlash bloki. protocol_participants ataylab BU YERDA to'liq yuklanmaydi — bitta
    // tadbirda mingdan ortiq ishtirokchi bo'lishi mumkin, ularni har sinxronlashda tortish isrof.
    // Ular kerak bo'lganda protokol bo'yicha alohida o'qiladi (db.getProtocolParticipants).
    const [
        { data: protocolRows, error: protocolsErr },
        { data: signerRows, error: signersErr },
        { data: awardRuleRows, error: awardRulesErr },
        { data: batchRows, error: batchesErr },
        { data: documentRows, error: documentsErr },
        { data: docAuditRows, error: docAuditErr }
    ] = protocolRes;
    if (protocolsErr) throw protocolsErr;
    if (signersErr) throw signersErr;
    if (awardRulesErr) throw awardRulesErr;
    if (batchesErr) throw batchesErr;
    if (documentsErr) throw documentsErr;
    if (docAuditErr) throw docAuditErr;
    dbData.protocols = (protocolRows || []).map(mapProtocolFromSupabase);
    dbData.protocolSigners = (signerRows || []).map(mapProtocolSignerFromSupabase);
    dbData.awardRules = (awardRuleRows || []).map(mapAwardRuleFromSupabase);
    dbData.awardBatches = (batchRows || []).map(mapAwardBatchFromSupabase);
    dbData.documents = (documentRows || []).map(mapDocumentFromSupabase);
    dbData.documentAuditLogs = (docAuditRows || []).map(mapDocumentAuditFromSupabase);

    // Klub tashkil etish va rasmiylashtirish - alohida blok, o'z SQL fayli bilan
    // (supabase/club_registration.sql). "Yiqilmaydigan" tarzda o'qiladi - fayl
    // hali ishga tushirilmagan o'rnatmada ham platforma qulab tushmasin.
    const [
        { data: cappRows, error: cappErr },
        { data: crevRows, error: crevErr },
        { data: cregRows, error: cregErr },
        { data: ccertRows, error: ccertErr },
        { data: cshistRows, error: cshistErr },
    ] = clubRegRes;
    if (cappErr || crevErr || cregErr || ccertErr || cshistErr) {
        console.warn(
            "[klub rasmiylashtirish] jadvallar o'qilmadi - supabase/club_registration.sql ishga tushirilganmi?",
            cappErr || crevErr || cregErr || ccertErr || cshistErr
        );
        dbData.clubRegistrationBackendReady = false;
    } else {
        dbData.clubApplications = (cappRows || []).map(row => ({
            ...(row.data || {}), id: row.id, applicantUserId: row.applicant_user_id, status: row.status,
        }));
        dbData.clubApplicationReviews = (crevRows || []).map(row => ({
            id: row.id, applicationId: row.application_id, fromStatus: row.from_status,
            toStatus: row.to_status, action: row.action, comment: row.comment,
            reviewedBy: row.reviewed_by, createdAt: row.created_at,
        }));
        dbData.clubRegulations = (cregRows || []).map(row => ({
            id: row.id, clubId: row.club_id, applicationId: row.application_id,
            status: row.status, sections: row.sections || {},
            // O'tgan tahrirlar - band talabi (band 9 ga qo'shimcha): tasdiqlangan
            // nizom tahrirlansa eskisi o'chirilmaydi, shu yerda saqlanadi.
            history: row.history || [],
            lastEditedBy: row.last_edited_by || null,
            createdAt: row.created_at, updatedAt: row.updated_at,
        }));
        dbData.clubCertificates = (ccertRows || []).map(row => ({
            id: row.id, clubId: row.club_id, certificateNumber: row.certificate_number,
            registryNumber: row.registry_number, status: row.status, issuedBy: row.issued_by,
            issuedAt: row.issued_at, revokedAt: row.revoked_at, revokedReason: row.revoked_reason,
            basisDocument: row.basis_document || {},
        }));
        dbData.clubStatusHistory = (cshistRows || []).map(row => ({
            id: row.id, clubId: row.club_id, statusKind: row.status_kind,
            fromStatus: row.from_status, toStatus: row.to_status, reason: row.reason,
            actor: row.actor, createdAt: row.created_at,
        }));
        dbData.clubRegistrationBackendReady = true;
    }

    // Klub hujjatlari - alohida jadval, o'z SQL fayli bilan
    // (supabase/club_documents.sql). "Yiqilmaydigan" tarzda o'qiladi.
    const { data: cdocRows, error: cdocErr } = clubDocRes;
    if (cdocErr) {
        console.warn(
            "[klub hujjatlari] jadval o'qilmadi - supabase/club_documents.sql ishga tushirilganmi?",
            cdocErr
        );
        dbData.clubDocumentsBackendReady = false;
    } else {
        dbData.clubDocuments = (cdocRows || []).map(row => ({
            ...(row.data || {}), id: row.id, clubId: row.club_id, category: row.category, status: row.status,
        }));
        dbData.clubDocumentsBackendReady = true;
    }

    // Tadbirlar to'plami - alohida blok, o'z SQL fayli bilan
    // (supabase/event_collections.sql). "Yiqilmaydigan" tarzda o'qiladi.
    const [
        { data: ecRows, error: ecErr },
        { data: eciRows, error: eciErr },
        { data: tgaRows, error: tgaErr },
    ] = eventCollRes;
    if (ecErr || eciErr || tgaErr) {
        console.warn(
            "[tadbirlar to'plami] jadvallar o'qilmadi - supabase/event_collections.sql ishga tushirilganmi?",
            ecErr || eciErr || tgaErr
        );
        dbData.eventCollectionsBackendReady = false;
    } else {
        dbData.eventCollections = (ecRows || []).map(mapEventCollectionFromSupabase);
        dbData.eventCollectionItems = (eciRows || []).map(mapEventCollectionItemFromSupabase);
        dbData.tutorGroupAssignments = (tgaRows || []).map(mapTutorGroupAssignmentFromSupabase);
        dbData.eventCollectionsBackendReady = true;
    }

    // Rag'bat puli / mukofot reestri - alohida SQL fayl (supabase/student_recognitions.sql).
    // Ijtimoiy faollik SOZLAMALARI (supabase/social_scoring_config.sql).
    //
    // Jadval BO'SH bo'lsa mahalliy ro'yxat TEGILMAYDI. Sabab: bu jadvallar
    // bo'sh yaratiladi va brauzerdagi mavjud sozlamalar avtomatik ko'chmaydi.
    // Bo'sh ro'yxat bilan almashtirsak, admin ekranida hamma mezon birdan
    // yo'qolib, ariza tasdiqlash butunlay to'xtardi.
    const [
        { data: srcRows, error: srcErr },
        { data: catRows, error: catErr },
        { data: subRows, error: subErr },
    ] = socialCfgRes;
    if (srcErr || catErr || subErr) {
        console.warn(
            "[ijtimoiy faollik sozlamalari] jadvallar o'qilmadi - supabase/social_scoring_config.sql ishga tushirilganmi?",
            srcErr || catErr || subErr
        );
        dbData.socialConfigBackendReady = false;
    } else {
        if ((srcRows || []).length > 0) dbData.scoringSources = srcRows.map(r => ({ ...(r.data || {}), id: r.id }));
        if ((catRows || []).length > 0) dbData.socialCriteriaCategories = catRows.map(r => ({ ...(r.data || {}), id: r.id }));
        if ((subRows || []).length > 0) dbData.socialCriteriaSubcategories = subRows.map(r => ({ ...(r.data || {}), id: r.id }));
        dbData.socialConfigBackendReady = true;
    }

    // Klub lavozimlari va arizalari (supabase/club_positions.sql).
    const [
        { data: posRows, error: posErr },
        { data: posAppRows, error: posAppErr },
        { data: posLogRows, error: posLogErr },
    ] = clubPosRes;
    if (posErr || posAppErr || posLogErr) {
        console.warn(
            "[klub lavozimlari] jadvallar o'qilmadi - supabase/club_positions.sql ishga tushirilganmi?",
            posErr || posAppErr || posLogErr
        );
        dbData.clubPositionsBackendReady = false;
    } else {
        dbData.clubPositions = (posRows || []).map(r => ({ ...(r.data || {}), id: r.id }));
        dbData.clubPositionApplications = (posAppRows || []).map(r => ({ ...(r.data || {}), id: r.id }));
        dbData.clubPositionAuditLogs = (posLogRows || []).map(r => ({ ...(r.data || {}), id: r.id }));
        dbData.clubPositionsBackendReady = true;
    }

    // Musobaqa vakolati (supabase/competition_delegations.sql). Tadbir
    // vakolati bilan bir xil naqsh: jadval yo'q bo'lsa mahalliy ro'yxat
    // tegilmaydi va ilova ishlashda davom etadi.
    const { data: compDelegRows, error: compDelegErr } = compDelegRes;
    if (compDelegErr) {
        console.warn(
            "[musobaqa vakolati] jadval o'qilmadi - supabase/competition_delegations.sql ishga tushirilganmi?",
            compDelegErr
        );
        dbData.competitionDelegationsBackendReady = false;
    } else {
        dbData.competitionDelegations = (compDelegRows || []).map(r => ({
            id: r.id, competitionId: r.competition_id, granteeUsername: r.grantee_username,
            permissions: r.permissions || [], grantedBy: r.granted_by, grantedAt: r.granted_at,
            revokedBy: r.revoked_by, revokedAt: r.revoked_at, active: r.active,
        }));
        dbData.competitionDelegationsBackendReady = true;
    }

    // Ijtimoiy faollik arizalari (supabase/social_activity_applications.sql).
    // Jadval yo'q bo'lsa MAHALLIY ro'yxat tegilmaydi - o'sha brauzerdagi
    // arizalar joyida qoladi va ilova avvalgidek ishlayveradi.
    const [
        { data: socialAppRows, error: socialAppErr },
        { data: socialLogRows, error: socialLogErr },
    ] = socialAppRes;
    if (socialAppErr || socialLogErr) {
        console.warn(
            "[ijtimoiy faollik] jadvallar o'qilmadi - supabase/social_activity_applications.sql ishga tushirilganmi?",
            socialAppErr || socialLogErr
        );
        dbData.socialApplicationsBackendReady = false;
    } else {
        dbData.socialActivityApplications = (socialAppRows || [])
            .map(r => ({ ...(r.data || {}), id: r.id }));
        dbData.socialActivityAuditLogs = (socialLogRows || [])
            .map(r => ({ ...(r.data || {}), id: r.id }));
        dbData.socialApplicationsBackendReady = true;
    }

    // Tadbir vakolati - alohida jadval (supabase/event_delegations.sql).
    // Jadval yo'q bo'lsa ilova ishlashda davom etadi: vakolat ro'yxati bo'sh
    // chiqadi, qolgan hamma narsa o'z holida qoladi.
    const { data: delegRows, error: delegErr } = delegationRes;
    if (delegErr) {
        console.warn(
            "[vakolat] jadval o'qilmadi - supabase/event_delegations.sql ishga tushirilganmi?",
            delegErr
        );
        dbData.eventDelegationsBackendReady = false;
    } else {
        dbData.eventDelegations = (delegRows || []).map(r => ({
            id: r.id, eventId: r.event_id, granteeUsername: r.grantee_username,
            permissions: r.permissions || ['attendance'], grantedBy: r.granted_by,
            grantedAt: r.granted_at, revokedBy: r.revoked_by, revokedAt: r.revoked_at,
            active: r.active,
        }));
        dbData.eventDelegationsBackendReady = true;
    }

    const { data: recRows, error: recErr } = recognitionRes;
    if (recErr) {
        console.warn(
            "[rag'bat/mukofot reestri] jadval o'qilmadi - supabase/student_recognitions.sql ishga tushirilganmi?",
            recErr
        );
        dbData.studentRecognitionsBackendReady = false;
    } else {
        dbData.studentRecognitions = (recRows || []).map(mapStudentRecognitionFromSupabase);
        dbData.studentRecognitionsBackendReady = true;
    }

    // Musobaqa o'tkazish yozuvlari (supabase/competition_operations.sql).
    // Hammasi bir xil shaklda: `data` jsonb ichida butun obyekt, `id` esa
    // ustunda - shuning uchun bitta xaritalash yetarli.
    //
    // Jadval yo'q bo'lsa MAHALLIY ro'yxatlar tegilmaydi: SQL ishga
    // tushirilmagan brauzerda musobaqa avvalgidek ishlashda davom etadi,
    // faqat yozuvlar o'sha kompyuterda qoladi.
    const compOpsErr = compOpsRes.find(r => r.error)?.error;
    if (compOpsErr) {
        console.warn(
            "[musobaqa yozuvlari] jadvallar o'qilmadi - supabase/competition_operations.sql ishga tushirilganmi?",
            compOpsErr
        );
        dbData.competitionOpsBackendReady = false;
    } else {
        const unwrap = (res) => (res.data || []).map(r => ({ ...(r.data || {}), id: r.id }));
        const [
            pGroupsRes, pSeatsRes, advRulesRes, tiebreakRes, advResultsRes,
            appealsRes, appealLogsRes, grpLogsRes, caseRolesRes, qPointsRes,
            scoringGroupsRes, certsRes
        ] = compOpsRes;
        dbData.competitionParticipantGroupAssignments = unwrap(pGroupsRes);
        dbData.competitionParticipantSeats    = unwrap(pSeatsRes);
        dbData.competitionAdvancementRules    = unwrap(advRulesRes);
        dbData.competitionTiebreakResolutions = unwrap(tiebreakRes);
        dbData.competitionAdvancementResults  = unwrap(advResultsRes);
        dbData.competitionAppeals             = unwrap(appealsRes);
        dbData.competitionAppealAuditLogs     = unwrap(appealLogsRes);
        dbData.competitionGroupActionLogs     = unwrap(grpLogsRes);
        dbData.competitionCaseRoles           = unwrap(caseRolesRes);
        dbData.competitionQuestionPoints      = unwrap(qPointsRes);
        dbData.competitionScoringGroups       = unwrap(scoringGroupsRes);
        dbData.certificates                   = unwrap(certsRes);
        dbData.competitionOpsBackendReady = true;
    }

    // Intizom, lavozim tayinlash, raund holati, kitobxonlik seanslari
    // (supabase/penalties_positions_sessions.sql). Jadval yo'q bo'lsa
    // MAHALLIY ro'yxatlar tegilmaydi va ilova avvalgidek ishlayveradi.
    const recordsErr = recordsRes.find(r => r.error)?.error;
    if (recordsErr) {
        console.warn(
            "[intizom/lavozim/seans] jadvallar o'qilmadi - supabase/penalties_positions_sessions.sql ishga tushirilganmi?",
            recordsErr
        );
        dbData.recordsBackendReady = false;
    } else {
        const unwrapRec = (res) => (res.data || []).map(r => ({ ...(r.data || {}), id: r.id }));
        const [sipenRes, discRes, posAsgRes, roundStatusRes, readSessRes] = recordsRes;
        dbData.socialIndexPenalties = unwrapRec(sipenRes);
        dbData.disciplineViolations = unwrapRec(discRes);
        dbData.clubPositionAssignments = unwrapRec(posAsgRes)
            .sort((a, b) => (a.displayNumber || 0) - (b.displayNumber || 0));
        dbData.competitionRoundParticipantStatus = unwrapRec(roundStatusRes);
        dbData.readingSessions = unwrapRec(readSessRes);
        dbData.recordsBackendReady = true;
    }

    saveDB(dbData);
};

// Shared insert helper for the unified `registrations` table - used by registerForActivity,
// registerExistingTeam, overrideAddParticipant, overrideAddTeam, overrideCreateTeam (every path that
// creates a brand-new registration row).
const insertRegistrationToSupabase = async (registration) => {
    const { data, error } = await supabase.from('registrations').insert({
        id: registration.id, activity_id: registration.activityId, activity_type: registration.activityType,
        user_id: registration.userId, participant_snapshot: registration.participantSnapshot,
        participant_type: registration.participantType, team_name: registration.teamName,
        team_members: registration.teamMembers || [], min_team_size: registration.minTeamSize,
        attachments: registration.attachments || [], invite_code: registration.inviteCode,
        status: registration.status, approval_required: registration.approvalRequired,
        approval_status: registration.approvalStatus, added_by_override: registration.addedByOverride,
        override_reason: registration.overrideReason, override_by_user_id: registration.overrideByUserId,
        is_repeat: registration.isRepeat, offer_expires_at: registration.offerExpiresAt,
        real_team_id: registration.realTeamId || null, team_confirmed_at: registration.teamConfirmedAt || null
    }).select().single();
    if (error) throw error;
    return mapRegistrationFromSupabase(data);
};
// Partial-field update helper (camelCase patch -> snake_case Supabase update) - used by every function
// that mutates an EXISTING registration row (respondToTeamInvite/joinTeamByCode/confirmWaitlistOffer/
// cancelRegistration/promoteFromWaitlist).
const updateRegistrationInSupabase = async (id, patch) => {
    const payload = {};
    if (patch.teamMembers !== undefined) payload.team_members = patch.teamMembers;
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.teamConfirmedAt !== undefined) payload.team_confirmed_at = patch.teamConfirmedAt;
    if (patch.offerExpiresAt !== undefined) payload.offer_expires_at = patch.offerExpiresAt;
    if (patch.approvalStatus !== undefined) payload.approval_status = patch.approvalStatus;
    if (patch.approvalComment !== undefined) payload.approval_comment = patch.approvalComment;
    if (patch.approvalReviewedBy !== undefined) payload.approval_reviewed_by = patch.approvalReviewedBy;
    if (patch.approvalReviewedAt !== undefined) payload.approval_reviewed_at = patch.approvalReviewedAt;
    if (patch.realTeamId !== undefined) payload.real_team_id = patch.realTeamId;
    const { data, error } = await supabase.from('registrations').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return mapRegistrationFromSupabase(data);
};
const insertRegistrationAuditLog = async (log) => {
    const id = 'raudit_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
    const { error } = await supabase.from('registration_audit_logs').insert({
        id, added_by_user_id: log.addedByUserId, added_student_id: log.addedStudentId,
        activity_id: log.activityId, activity_type: log.activityType, reason: log.reason
    });
    if (error) throw error;
};

// ============================================================================
// SEANS QO'RIQCHISI
//
// Jadvallarning RLS siyosati `to authenticated` bo'lgani uchun, Supabase seansi
// yo'q bo'lsa (yoki muddati tugab, yangilanmagan bo'lsa) har qanday yozuv
// "42501: new row violates row-level security policy" bilan qaytadi. Bu xabar
// foydalanuvchi uchun mutlaqo tushunarsiz va - eng yomoni - ma'lumot saqlangandek
// tuyulishiga olib keladi.
//
// Shu sababli har bir yozuvdan OLDIN seans tekshiriladi va tushunarli xato
// beriladi. Bu jimgina yo'qoladigan yozuvlarning oldini oladi.
// ============================================================================
const assertAuthenticated = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session) {
        throw new Error(
            "Seansingiz tugagan - ma'lumot saqlanmadi. Tizimdan chiqib, qaytadan kiring."
        );
    }
    const expiresAt = data.session.expires_at ? data.session.expires_at * 1000 : null;
    if (expiresAt && expiresAt < Date.now()) {
        throw new Error(
            "Seansingiz muddati tugagan - ma'lumot saqlanmadi. Tizimdan chiqib, qaytadan kiring."
        );
    }
    return data.session;
};

// ============================================================================
// STIPENDIYA ZANJIRI - ichki yordamchilar
//
// Bularning hammasi bitta joyda: ariza yozuvini Supabase'ga yozish shakli
// (ustunlar va `data` jsonb chegarasi) bir necha funksiyada takrorlanmasin.
// ============================================================================

// Ariza yozuvini yangilaydi: Supabase'ga yozadi va mahalliy nusxani joyida yamaydi.
// saveDB chaqiruvchi tomonda - bir necha arizani ketma-ket yangilaganda har safar
// localStorage'ga yozib o'tirmaslik uchun.
const patchApplication = async (dbData, app, patch) => {
    const now = new Date().toISOString();
    const merged = { ...app, ...patch };
    const {
        id, grantId, studentId, status, stage, stageIndex,
        submittedAt, reviewedAt, createdAt, updatedAt, ...data
    } = merged;

    const { error } = await supabase.from('scholarship_applications').update({
        status,
        stage: stage || 'faculty',
        stage_index: stageIndex ?? 0,
        reviewed_at: ['approved', 'rejected'].includes(status) ? now : (reviewedAt || null),
        updated_at: now,
        data,
    }).eq('id', id);
    if (error) throw error;

    Object.assign(app, patch, { updatedAt: now });
    return app;
};

// Bosqichga kelgan ariza qaysi holatda turadi.
const statusForStage = (stage) => {
    if (!stage) return 'committee';
    if (stage.type === 'document_review') return 'doc_check';
    if (stage.type === 'final') return 'committee';
    return 'evaluation';
};

// Kim shu bosqichda amal qila oladi.
//   fakultet turidagi bosqich -> shu fakultetga biriktirilgan mas'ul
//   qolgan bosqichlar        -> markaziy komissiya a'zosi
// Rol tekshirilmaydi: vakolat manbai biriktiruv (platformada "dekan" roli yo'q).
const canActOnStage = (dbData, app, stage, username) => {
    if (!username) return false;
    const settings = dbData.scholarshipSettings || {};
    const meta = getStageType(stage.type);
    const facultyScoped = meta.perFaculty
        || (stage.type === 'document_review' && (stage.reviewerScope || 'faculty') === 'faculty');

    if (facultyScoped) {
        return (settings.facultyEvaluators || [])
            .some(e => e.username === username && e.faculty === app.faculty);
    }
    return (settings.centralEvaluators || []).some(e => e.username === username);
};

// Bitta arizaning monitoring uchun boyitilgan ko'rinishi.
const buildApplicationRows = (dbData, grant) => {
    const pipeline = resolvePipeline(grant);
    const evaluations = (dbData.scholarshipEvaluations || []).filter(e => e.grantId === grant.id);
    const students = new Map(generateMockStudents().map(s => [s.id, s]));

    return (dbData.scholarshipApplications || [])
        .filter(a => a.grantId === grant.id)
        .map(a => {
            const idx = a.stageIndex ?? 0;
            const stage = pipeline[idx];
            const student = students.get(a.studentId) || null;
            // Baho FAQAT joriy bosqichniki: bir nomzod fakultetda ham, suhbatda ham
            // baholanadi va ular aralashmasligi kerak.
            const stageEvals = evaluations.filter(e =>
                e.applicationId === a.id && (e.stageId || 'faculty') === (stage?.id || 'faculty'));

            // TEST BOSQICHI INTEGRATSIYASI. Bosqichga real test biriktirilgan bo'lsa,
            // ball talabaning shu testdagi ENG YAXSHI urinishidan avtomatik olinadi.
            // Qo'lda kiritilgan ball ustunlik qiladi - mas'ul kerak bo'lsa tuzata oladi
            // (masalan test tizimdan tashqarida o'tkazilgan bo'lsa).
            const testScores = { ...(a.testScores || {}) };
            pipeline.forEach(st => {
                if (st.type !== 'test' || !st.testId) return;
                if (testScores[st.id] !== undefined && testScores[st.id] !== null) return;
                const attempts = (dbData.testAttempts || []).filter(t =>
                    t.studentId === a.studentId && t.testId === st.testId && t.finishedAt);
                if (attempts.length === 0) return;
                const best = attempts.reduce((b, t) => (t.score > b.score ? t : b), attempts[0]);
                // Test o'z shkalasida, bosqich o'z shkalasida - foizga keltirib o'tkaziladi.
                const ratio = best.maxScore > 0 ? best.score / best.maxScore : 0;
                testScores[st.id] = Math.round(ratio * (Number(st.maxScore) || 100));
            });

            return {
                ...a,
                testScores,
                stageIndex: idx,
                studentName: student?.fullName || a.studentId,
                faculty: a.faculty || student?.faculty || "Noma'lum",
                social_score: (dbData.socialScoreTransactions || [])
                    .filter(t => t.studentId === a.studentId)
                    .reduce((s, t) => s + (t.points || 0), 0),
                evaluationSummary: summarizeEvaluations(grant, stageEvals, stage),
            };
        });
};

// Avtomatik o'tkazish: bosqichdagi guruh to'liq baholangan bo'lsa tizim o'zi o'tkazadi.
// Xatolik yuz bersa BAHO YO'QOLMAYDI - u allaqachon saqlangan, admin qo'lda o'tkazadi.
const maybeAutoAdvance = async (dbData, grant, stageIndex, group, stage) => {
    if ((grant?.advanceMode || 'automatic') !== 'automatic') return null;
    const meta = getStageType(stage.type);
    if (!meta.scored) return null;

    const breakdown = buildStageBreakdown(grant, stage, stageIndex, buildApplicationRows(dbData, grant));
    const target = meta.perFaculty
        ? breakdown.groups.find(g => g.group === group)
        : breakdown.groups[0];
    if (!target?.readyToAdvance) return null;

    try {
        return await db.advanceScholarshipPipeline(grant.id, {
            stageIndex, group: meta.perFaculty ? group : null, by: 'system',
        });
    } catch (e) {
        console.warn('[stipendiya] avtomatik o\'tkazish bajarilmadi:', e.message);
        return null;
    }
};

export const db = {
    // Ko'p talabani birdaniga hisoblaydigan ekranlar uchun: `db.withCachedReads(() => ...)`
    // ichida baza bir marta o'qiladi. FAQAT sof o'qish bloklarini o'rash mumkin -
    // ichida yozish bo'lmasligi kerak (batafsil izoh funksiya ta'rifi yonida).
    withCachedReads,
    // Exposed so AuthContext.jsx can populate the clubs/memberships mirror once a session resolves
    // (before that, dbData.clubs/memberships fall back to whatever fresh-install seed shipped -
    // harmless, since a signed-out visitor never mutates anything real).
    syncCoreDataFromSupabase,
    // Real Supabase accounts - a SEPARATE identity pool from the 550 synthetic getMockStudents(), see
    // the migration plan's disclosed "known rough edge". Consumers that resolve a possibly-real userId
    // (e.g. a club's member list, now that real people can join real clubs) should fall back to this
    // when studentById.get(id) misses, rather than showing a blank name.
    getSyncedProfiles: () => getDB().realProfiles || [],

    // CLUBS
    getClubs: () => getDB().clubs,
    getClubById: (id) => getDB().clubs.find(c => c.id === id),

    // TASHKIL ETISH ARIZASIDAGI MA'LUMOT - klub o'ziga tegishli tablarda.
    //
    // Ariza to'ldirishda kiritilgan "Klub rahbari", "A'zolar (taxminiy)",
    // "Faoliyat davri", "Yillik ish reja" - bular klub yozuvining o'ziga
    // NUSXA KO'CHIRILMAYDI, faqat `club.applicationId` orqali manba
    // arizadan o'qib turiladi (manba bitta bo'lishi kerak qoidasi, xuddi
    // ichki klub yutuqlari kabi). Har bir tab (Haqida/Klub tarkibi/
    // Statistika/Klub hujjatlari) shu funksiyani chaqirib, o'ziga
    // tegishli maydonni ko'rsatadi.
    getFoundingApplicationFields: (clubId) => {
        const club = (getDB().clubs || []).find(c => String(c.id) === String(clubId));
        if (!club?.applicationId) return null;
        const application = (getDB().clubApplications || []).find(a => a.id === club.applicationId);
        return application?.fields || null;
    },
    // Admin-only under RLS ("clubs writable by admins") - matches this app's existing club-deletion
    // gating (hasFullAdminAccess-style checks); coordinator-level club EDITING (updateClub) additionally
    // needs the coordinator-aware policy noted in the migration plan follow-up, since ClubProfilePage.jsx
    // lets a club's own coordinator edit it too, not just a platform admin.
    createClub: async (clubData) => {
        // KLUB YARATILDI ≠ KLUB RO'YXATDAN O'TDI.
        //
        // Yangi klub har doim registrationStatus: DRAFT bilan boshlanadi -
        // admin qaysi yo'ldan (bevosita yoki arizadan) yaratgan bo'lishidan
        // qat'i nazar. Rasmiy Registry Number faqat `db.registerClub()`
        // chaqirilganda beriladi (config/clubRegistration.js band 3).
        // `createdFrom`/`createdBy`/`applicationId` audit uchun - klub
        // NIMADAN paydo bo'lganini ko'rsatadi.
        const { data, error } = await supabase.from('clubs').insert({
            id: Date.now().toString(),
            name: clubData.name, description: clubData.description, category: clubData.category,
            points_modifier: clubData.pointsModifier ?? 1.0,
            display_number: nextDisplayNumber(getDB().clubs),
            data: {
                registrationStatus: REGISTRATION_STATUS.DRAFT,
                operationalStatus: DEFAULT_OPERATIONAL_STATUS,
                createdFrom: clubData.createdFrom || CREATED_FROM.ADMIN_DIRECT,
                createdBy: clubData.createdBy || null,
                applicationId: clubData.applicationId || null,
                clubType: clubData.clubType || null,
            },
        }).select().single();
        if (error) throw error;
        await syncCoreDataFromSupabase();
        return mapClubFromSupabase(data);
    },
    updateClub: async (id, updates) => {
        const payload = {};
        if (updates.name !== undefined) payload.name = updates.name;
        if (updates.description !== undefined) payload.description = updates.description;
        if (updates.category !== undefined) payload.category = updates.category;
        if (updates.pointsModifier !== undefined) payload.points_modifier = updates.pointsModifier;
        if (updates.headCoordinatorId !== undefined) payload.head_coordinator_id = updates.headCoordinatorId;

        // ALOQA MA'LUMOTLARI.
        //
        // `data` jsonb BUTUNLIGICHA qayta yoziladi, shuning uchun avval
        // mavjudi o'qiladi va ustiga qo'yiladi. Aks holda kelajakda `data`
        // ichiga qo'shiladigan boshqa har qanday kalit aloqa saqlanganda
        // jimgina o'chib ketardi.
        // `data` ichida saqlanadigan maydonlar. Ular BIRGA yoziladi, chunki
        // `data` butunligicha qayta yoziladi: har birini alohida yozish
        // ikkinchisini o'chirib yuborardi.
        const DATA_FIELDS = [
            'contacts', 'shortName', 'status', 'joinPolicy', 'about',
            // Klub tashkil etish va rasmiylashtirish (config/clubRegistration.js).
            'registrationStatus', 'operationalStatus', 'registryNumber', 'registeredAt',
            'certificateNumber', 'createdFrom', 'createdBy', 'applicationId', 'clubType',
            // Zinapoya talablari (config/clubLadder.js). Har klub o'zinikini
            // belgilaydi: yiliga 2 ta tadbir o'tkazadigan klub bilan har oy tadbir
            // qiladigan klubga bir xil talab qo'yish bajarib bo'lmaydigan bo'lardi.
            'ladder',
        ];
        const touchedDataFields = DATA_FIELDS.filter(f => updates[f] !== undefined);
        if (touchedDataFields.length > 0) {
            const { data: current, error: readError } = await supabase
                .from('clubs').select('data').eq('id', id).single();
            if (readError) throw clubDataColumnError(readError);

            const next = { ...(current?.data || {}) };
            touchedDataFields.forEach(field => {
                if (field === 'contacts') next.contacts = normalizeClubContacts(updates.contacts);
                else if (field === 'shortName') next.shortName = String(updates.shortName || '').trim() || null;
                else next[field] = updates[field];
            });
            payload.data = next;
        }

        const { data, error } = await supabase.from('clubs').update(payload).eq('id', id).select().single();
        if (error) throw clubDataColumnError(error);
        await syncCoreDataFromSupabase();
        return mapClubFromSupabase(data);
    },
    // ----------------------------------------------------------------------
    // KLUB LOGOSI VA MUQOVASI
    //
    // `kind` - 'logo' yoki 'banner'. Ikkalasi BOSHQA-BOSHQA rasm va shunday
    // qolishi kerak: logo kvadrat va kichkina (kartadagi belgi), muqova esa
    // keng va kartaning butun tepasini egallaydi. Bittasini ikkinchisining
    // o'rnida ishlatish ikkalasini ham buzardi.
    //
    // Fayl NOMI emas, faylning O'ZI yuklanadi. Platformadagi ba'zi eski
    // yuklashlar faqat nomni saqlaydi (klub nizomi, masalan) - bu yerda
    // shunday qilib bo'lmaydi, chunki rasm ko'rsatilishi kerak.
    //
    // Fayl yo'li klub va tur bo'yicha QAT'IY: `{clubId}/{kind}.{ext}`.
    // Shuning uchun yangi rasm eskisining ustiga yoziladi va ombor
    // ishlatilmaydigan eski fayllar bilan to'lib ketmaydi.
    uploadClubMedia: async (clubId, kind, file) => {
        await assertAuthenticated();
        if (!['logo', 'banner'].includes(kind)) throw new Error("Noma'lum rasm turi");
        if (!file) throw new Error('Faylni tanlang');
        if (!String(file.type || '').startsWith('image/')) {
            throw new Error('Faqat rasm fayli yuklanadi (JPG, PNG, WEBP)');
        }
        if (file.size > CLUB_MEDIA_MAX_MB * 1024 * 1024) {
            throw new Error(`Rasm hajmi ${CLUB_MEDIA_MAX_MB} MB dan oshmasligi kerak`);
        }

        const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase();
        const path = `${clubId}/${kind}.${ext}`;
        const { error: upErr } = await supabase.storage
            .from('club-media')
            .upload(path, file, { contentType: file.type, upsert: true });
        if (upErr) {
            const missingBucket = /bucket not found/i.test(upErr.message || '');
            throw new Error(missingBucket
                ? "Rasm yuklanmadi: `club-media` ombori topilmadi. "
                  + 'Supabase SQL Editor da `supabase/club_media.sql` ni ishga tushiring.'
                : 'Rasm yuklanmadi: ' + upErr.message);
        }

        // `data` BUTUNLIGICHA qayta yoziladi, shuning uchun avval mavjudi
        // o'qiladi - aks holda aloqa ma'lumotlari o'chib ketardi.
        const { data: current, error: readError } = await supabase
            .from('clubs').select('data').eq('id', clubId).single();
        if (readError) throw clubDataColumnError(readError);

        const media = { ...(current?.data?.media || {}), [`${kind}Path`]: path };
        const { error } = await supabase.from('clubs')
            .update({ data: { ...(current?.data || {}), media } })
            .eq('id', clubId);
        if (error) throw clubDataColumnError(error);

        await syncCoreDataFromSupabase();
        return clubMediaUrl(path);
    },

    // Rasmni olib tashlash - klub yana harf/gradientga qaytadi.
    removeClubMedia: async (clubId, kind) => {
        await assertAuthenticated();
        const { data: current, error: readError } = await supabase
            .from('clubs').select('data').eq('id', clubId).single();
        if (readError) throw clubDataColumnError(readError);

        const path = current?.data?.media?.[`${kind}Path`];
        if (!path) return false;

        await supabase.storage.from('club-media').remove([path]);
        const media = { ...(current.data.media || {}) };
        delete media[`${kind}Path`];

        const { error } = await supabase.from('clubs')
            .update({ data: { ...current.data, media } })
            .eq('id', clubId);
        if (error) throw clubDataColumnError(error);

        await syncCoreDataFromSupabase();
        return true;
    },

    deleteClub: async (id) => {
        const { error } = await supabase.from('clubs').delete().eq('id', id);
        if (error) throw error;
        await syncCoreDataFromSupabase();
    },

    // CLUB DOCUMENTS ("Klub hujjatlari" tab) - bytes are never persisted (no real file-storage backend
    // here), only the metadata a real one would keep alongside the file, same disclosed convention as
    // SocialActivityIndex's fileName field / TournamentReviewStep's attachment widget.
    getClubDocuments: (clubId) =>
        (getDB().clubDocuments || [])
            .filter(d => d.clubId === clubId && d.status === 'active')
            .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)),

    // Faylni ko'rish - vaqtinchalik havola. Ombor yopiq (supabase/club_documents.sql),
    // bir soatdan keyin ishlamay qoladi.
    getClubDocumentUrl: async (filePath) => {
        if (!filePath) return null;
        const { data, error } = await supabase.storage.from('club-documents').createSignedUrl(filePath, 3600);
        if (error) return null;
        return data?.signedUrl || null;
    },

    // Uploading a new 'nizom' replaces the previous one (a club has exactly one current charter -
    // same succession idea as the head_coordinator single-slot rule, the old one is kept as 'replaced'
    // history rather than deleted). 'boshqa' documents just accumulate, no cap.
    //
    // HAQIQIY FAYL YUKLANADI (supabase/club_documents.sql) - ilgari bu funksiya
    // mutlaqo mahalliy edi va faqat NOM/HAJMNI saqlardi, faylning o'zini emas.
    // "Ko'zcha" bosilganda ochiladigan hech narsa yo'q edi.
    uploadClubDocument: async ({ clubId, category, title, file, uploadedByUserId }) => {
        await assertAuthenticated();
        const dbData = getDB();
        if (!dbData.clubDocuments) dbData.clubDocuments = [];

        const id = 'cdoc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const ext = (file.name?.split('.').pop() || 'pdf').toLowerCase();
        const filePath = `${clubId}/${id}.${ext}`;

        const { error: upErr } = await supabase.storage
            .from('club-documents')
            .upload(filePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (upErr) {
            const missingBucket = /bucket not found/i.test(upErr.message || '');
            throw new Error(missingBucket
                ? "Fayl yuklanmadi: `club-documents` ombori topilmadi. "
                  + 'Supabase SQL Editor da `supabase/club_documents.sql` ni bir marta ishga tushiring.'
                : 'Fayl yuklanmadi: ' + upErr.message);
        }

        const doc = {
            id, clubId, category, title: title || file.name, fileName: file.name,
            sizeLabel: `${(file.size / (1024 * 1024)).toFixed(2)} MB`, filePath,
            uploadedBy: uploadedByUserId, uploadedAt: new Date().toISOString(),
            status: 'active', displayNumber: nextDisplayNumber(dbData.clubDocuments),
        };

        const { error } = await supabase.from('club_documents').insert({
            id, club_id: clubId, category, data: doc,
        });
        if (error) throw clubRegistrationTableError(error);

        if (category === 'nizom') {
            const toReplace = dbData.clubDocuments
                .filter(d => d.clubId === clubId && d.category === 'nizom' && d.status === 'active');
            await Promise.all(toReplace.map(d =>
                supabase.from('club_documents').update({ status: 'replaced', data: { ...d, status: 'replaced' } }).eq('id', d.id)
            ));
            toReplace.forEach(d => { d.status = 'replaced'; });
        }
        dbData.clubDocuments.push(doc);
        saveDB(dbData);
        return doc;
    },
    removeClubDocument: async ({ clubId, documentId }) => {
        await assertAuthenticated();
        const dbData = getDB();
        const doc = (dbData.clubDocuments || []).find(d => d.id === documentId && d.clubId === clubId);
        if (doc) {
            const { error } = await supabase.from('club_documents')
                .update({ status: 'removed', data: { ...doc, status: 'removed' } })
                .eq('id', documentId);
            if (error) throw clubRegistrationTableError(error);
            doc.status = 'removed';
            saveDB(dbData);
        }
        return doc || null;
    },

    // MEMBERSHIPS
    getMemberships: () => getDB().memberships,
    getUserMemberships: (userId) => getDB().memberships.filter(m => m.userId === userId),

    // ----------------------------------------------------------------------
    // "MENING KLUBLARIM" - foydalanuvchi qaysi klublarda va qaysi sifatda.
    //
    // IKKI MANBA birlashtiriladi, xuddi `getCurrentClubRoster` dagidek:
    //   a'zolik roli (`memberships.role`) va faol lavozim tayinlovi
    //   (`clubPositionAssignments`). Faqat bittasiga qarash xato bo'lardi -
    //   lavozim tayinlovi rolga to'liq mos kelmaydi (masalan "Media/Dizayn"
    //   a'zolik rolida 'member' bo'lib qoladi, lekin bu odam LAVOZIMDA).
    //
    // `manages` - haqiqiy BOSHQARUV huquqi. U o'ylab topilmaydi: aynan
    // `hasClubRole` ning standart ro'yxati (head_coordinator/coordinator),
    // ya'ni platformada musobaqa va tadbir boshqarishni ochadigan rollar.
    // ----------------------------------------------------------------------
    // ----------------------------------------------------------------------
    // TO'QNASHUVNI OLDINDAN BILISH.
    //
    // Yozish paytidagi tekshiruv (assertCanHoldClubPosition /
    // assertCanJoinClubCompetition) qoidani KAFOLATLAYDI, lekin foydalanuvchi
    // uni faqat tugmani bosgandan keyin ko'radi. Bu ikki funksiya esa aynan
    // shu ma'lumotni oldindan beradi: ro'yxatda kimni tanlab bo'lmasligi
    // darrov ko'rinadi.
    //
    // Ikkalasi ham TEKSHIRUVNI ALMASHTIRMAYDI - u yozish yo'lida qoladi.
    // ----------------------------------------------------------------------
    getClubPositionConflict: (studentId, clubId) => {
        const dbData = getDB();
        const competitions = clubCompetitionParticipation(dbData, studentId, clubId);
        if (competitions.length === 0) return null;
        const club = (dbData.clubs || []).find(c => String(c.id) === String(clubId));
        return {
            competitions,
            clubName: club?.name || null,
            message: positionConflictMessage(
                generateMockStudents().find(s => s.id === studentId)?.fullName,
                club?.name || 'klub', competitions
            ),
        };
    },

    getClubParticipationConflict: (studentId, competitionId) => {
        const dbData = getDB();
        const comp = (dbData.competitions || []).find(c => c.id === competitionId);
        const clubId = competitionClubId(comp);
        if (!clubId) return null;
        const positions = clubPositionsOf(dbData, studentId, clubId);
        if (positions.length === 0) return null;
        const club = (dbData.clubs || []).find(c => String(c.id) === String(clubId));
        return {
            positions,
            clubName: club?.name || null,
            message: participationConflictMessage(
                generateMockStudents().find(s => s.id === studentId)?.fullName,
                club?.name || 'klub', positions
            ),
        };
    },

    getUserClubInvolvement: (userId) => {
        const dbData = getDB();
        const clubById = new Map((dbData.clubs || []).map(c => [c.id, c]));

        const rows = new Map();
        const ensure = (clubId) => {
            if (!rows.has(clubId)) {
                rows.set(clubId, {
                    clubId,
                    club: clubById.get(clubId) || null,
                    role: 'member',
                    positions: [],
                    joinedAt: null,
                });
            }
            return rows.get(clubId);
        };

        (dbData.memberships || [])
            .filter(m => m.userId === userId)
            .forEach(m => {
                const row = ensure(m.clubId);
                row.role = m.role || 'member';
                row.joinedAt = m.joinedAt || null;
            });

        (dbData.clubPositionAssignments || [])
            .filter(a => a.studentId === userId && a.status === 'active')
            .forEach(a => {
                const row = ensure(a.clubId);
                if (!row.positions.includes(a.positionTitle)) row.positions.push(a.positionTitle);
            });

        // Lavozim tayinlovi yo'q, lekin a'zolik roli lavozimni bildiradigan
        // holat - eski yozuvlar shunday. Ular ham lavozim deb ko'rsatiladi.
        const ROLE_TO_POSITION = {
            head_coordinator: 'head_coordinator',
            coordinator: 'assistant_coordinator',
            smm: 'smm',
            volunteer: 'volunteer',
        };

        return Array.from(rows.values())
            .filter(r => r.club) // O'chirilgan klub ko'rsatilmaydi.
            .map(r => {
                const positions = r.positions.length > 0
                    ? r.positions
                    : (ROLE_TO_POSITION[r.role] ? [ROLE_TO_POSITION[r.role]] : []);
                return {
                    ...r,
                    positions,
                    hasPosition: positions.length > 0,
                    manages: ['head_coordinator', 'coordinator'].includes(r.role),
                };
            });
    },
    // Faqat FAOL klublar - tanlash ro'yxatlari uchun (yangi tadbir yoki
    // musobaqa, a'zo bo'lish). Arxivlangan klubda yangi faoliyat
    // boshlanmasligi kerak, lekin uning mavjud yozuvlari o'qilishi kerak -
    // shuning uchun `getClubs()` filtrlanmaydi, bu alohida funksiya.
    getActiveClubs: () => (getDB().clubs || []).filter(c => (c.status || 'active') !== 'archived'),

    getClubMembers: (clubId) => getDB().memberships.filter(m => m.clubId === clubId),
    // userId is now the real Supabase profile UUID (auth.uid()), not the old mock username string -
    // matches the RLS policy "users can join a club" (with check (auth.uid() = user_id)).
    joinClub: async (userId, clubId, role = 'member', { source = 'self', by = null } = {}) => {
        const existing = (getDB().memberships || []).find(m => m.userId === userId && m.clubId === clubId);
        if (existing) return existing;

        // ARIZALI KLUB. Bevosita qo'shilishga ruxsat berilmaydi - aks holda
        // sozlama ko'rinishdagina qolardi va tugmani chetlab o'tgan har
        // qanday yo'l uni buzardi. `source` "arizadan" bo'lsa o'tkaziladi:
        // u yerda qaror allaqachon qabul qilingan.
        const club = (getDB().clubs || []).find(c => String(c.id) === String(clubId));
        if (club?.joinPolicy === 'application' && source === 'self') {
            throw new Error(`"${club.name}" klubiga a'zolik ariza orqali — avval ariza yuboring`);
        }

        const { data, error } = await supabase.from('memberships').insert({ user_id: userId, club_id: clubId, role }).select().single();
        if (error) throw error;
        await logMembershipEvent({ clubId, userId, action: 'joined', role, source, by });
        await syncCoreDataFromSupabase();
        return mapMembershipFromSupabase(data);
    },
    // Mirrors joinClub - membersCount is re-derived automatically by the next sync, nothing to decrement by hand.
    leaveClub: async (userId, clubId, { reason = '', by = null } = {}) => {
        const existing = (getDB().memberships || []).find(m => m.userId === userId && m.clubId === clubId);
        if (!existing) return false;
        const { error } = await supabase.from('memberships').delete().eq('id', existing.id);
        if (error) throw error;
        // A'zolik yozuvi o'chadi, TARIX esa qoladi - "kim qachon chiqdi"
        // degan savolga javob shu yerda.
        await logMembershipEvent({
            clubId, userId, action: 'left', role: existing.role, by, reason,
        });
        await syncCoreDataFromSupabase();
        return true;
    },
    updateMembershipRole: async (id, newRole) => {
        const existing = (getDB().memberships || []).find(m => m.id === id);
        const { data, error } = await supabase.from('memberships').update({ role: newRole }).eq('id', id).select().single();
        if (error) throw error;
        if (existing) {
            await logMembershipEvent({
                clubId: existing.clubId, userId: existing.userId,
                action: 'role_changed', role: newRole, previousRole: existing.role,
            });
        }
        await syncCoreDataFromSupabase();
        return mapMembershipFromSupabase(data);
    },

    // ----------------------------------------------------------------------
    // A'ZOLIK TARIXI
    //
    // Faqat qo'shiladi. Bu KO'RSATKICH emas, DALIL: talaba klubda qancha
    // turgani, qachon chiqqani va roli qachon o'zgargani.
    // ----------------------------------------------------------------------
    getClubMembershipHistory: (clubId) => {
        const students = new Map(generateMockStudents().map(s => [s.id, s]));
        const profiles = new Map((getDB().realProfiles || []).map(p => [p.id, p]));
        return (getDB().clubMembershipEvents || [])
            .filter(e => String(e.clubId) === String(clubId))
            .map(e => ({
                ...e,
                student: students.get(e.userId) || profiles.get(e.userId) || null,
            }))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    getStudentClubHistory: (userId) =>
        (getDB().clubMembershipEvents || [])
            .filter(e => e.userId === userId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),

    // ----------------------------------------------------------------------
    // A'ZOLIKKA ARIZALAR (faqat `joinPolicy: 'application'` klublarda)
    // ----------------------------------------------------------------------
    isClubMembershipBackendReady: () => getDB().clubMembershipBackendReady !== false,

    getClubJoinRequests: (clubId, { status = null } = {}) => {
        const students = new Map(generateMockStudents().map(s => [s.id, s]));
        const profiles = new Map((getDB().realProfiles || []).map(p => [p.id, p]));
        return (getDB().clubJoinRequests || [])
            .filter(r => String(r.clubId) === String(clubId))
            .filter(r => !status || r.status === status)
            .map(r => ({ ...r, student: students.get(r.userId) || profiles.get(r.userId) || null }))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    getMyJoinRequest: (userId, clubId) =>
        (getDB().clubJoinRequests || []).find(r =>
            r.userId === userId && String(r.clubId) === String(clubId) && r.status === 'pending') || null,

    // Barcha ochiq arizalar - koordinator va administrator navbati uchun.
    getPendingJoinRequests: (clubIds = null) => {
        const allowed = clubIds ? new Set(clubIds.map(String)) : null;
        const clubById = new Map((getDB().clubs || []).map(c => [String(c.id), c]));
        const students = new Map(generateMockStudents().map(s => [s.id, s]));
        return (getDB().clubJoinRequests || [])
            .filter(r => r.status === 'pending')
            .filter(r => !allowed || allowed.has(String(r.clubId)))
            .map(r => ({
                ...r,
                club: clubById.get(String(r.clubId)) || null,
                student: students.get(r.userId) || null,
            }))
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    },

    requestToJoinClub: async ({ userId, clubId, motivation = '' }) => {
        await assertAuthenticated();
        const dbData = getDB();
        if ((dbData.memberships || []).some(m => m.userId === userId && String(m.clubId) === String(clubId))) {
            throw new Error("Siz allaqachon bu klub a'zosisiz");
        }
        if (db.getMyJoinRequest(userId, clubId)) {
            throw new Error("Arizangiz allaqachon ko'rib chiqilmoqda");
        }

        const id = 'cjr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const record = {
            id, clubId: String(clubId), userId, status: 'pending',
            motivation: String(motivation || '').trim(),
            createdAt: new Date().toISOString(),
            reviewedBy: null, reviewedAt: null, comment: '',
        };

        const { error } = await supabase.from('club_join_requests').insert({
            id, club_id: record.clubId, user_id: userId, status: 'pending', data: record,
        });
        if (error) throw error;

        (dbData.clubJoinRequests = dbData.clubJoinRequests || []).push(record);
        saveDB(dbData);
        return record;
    },

    // Tasdiqlangan ariza DARHOL a'zolikka aylanadi - ikkinchi qadam
    // ("endi qo'shing") ortiqcha va unutilib qolardi.
    reviewJoinRequest: async ({ requestId, action, comment = '', reviewedBy }) => {
        await assertAuthenticated();
        if (!['approve', 'reject'].includes(action)) throw new Error("Noma'lum amal");
        if (action === 'reject' && !String(comment || '').trim()) {
            throw new Error('Rad etish sababini yozing');
        }

        const dbData = getDB();
        const record = (dbData.clubJoinRequests || []).find(r => r.id === requestId);
        if (!record) throw new Error('Ariza topilmadi');
        if (record.status !== 'pending') throw new Error("Ariza allaqachon ko'rib chiqilgan");

        const status = action === 'approve' ? 'approved' : 'rejected';
        const patch = {
            status, comment: String(comment || '').trim(),
            reviewedBy, reviewedAt: new Date().toISOString(),
        };

        const { error } = await supabase.from('club_join_requests')
            .update({ status, data: { ...record, ...patch }, updated_at: patch.reviewedAt })
            .eq('id', requestId);
        if (error) throw error;

        Object.assign(record, patch);
        saveDB(dbData);

        if (status === 'approved') {
            await db.joinClub(record.userId, record.clubId, 'member', {
                source: 'application', by: reviewedBy,
            });
        }
        return record;
    },

    cancelJoinRequest: async (requestId, userId) => {
        await assertAuthenticated();
        const dbData = getDB();
        const record = (dbData.clubJoinRequests || []).find(r => r.id === requestId);
        if (!record || record.userId !== userId) throw new Error('Ariza topilmadi');
        if (record.status !== 'pending') throw new Error("Ariza allaqachon ko'rib chiqilgan");

        const { error } = await supabase.from('club_join_requests')
            .update({ status: 'cancelled', data: { ...record, status: 'cancelled' } })
            .eq('id', requestId);
        if (error) throw error;
        record.status = 'cancelled';
        saveDB(dbData);
        return true;
    },

    // ----------------------------------------------------------------------
    // KLUBNI ARXIVLASH
    //
    // O'CHIRISH O'RNIGA. `deleteClub` butun tarixni yo'q qiladi: tadbirlar,
    // a'zolik, yutuqlar - hammasi bog'lanmagan holda qoladi. Faoliyatini
    // to'xtatgan klub uchun to'g'ri javob o'chirish emas, arxivlash:
    // sahifasi va tarixi qoladi, ro'yxatlarda ko'rinmaydi.
    // ----------------------------------------------------------------------
    setClubStatus: async (clubId, status) => {
        if (!['active', 'archived'].includes(status)) throw new Error("Noma'lum holat");
        return db.updateClub(clubId, { status });
    },

    // Yangi, nozikroq o'q - eski `status` (active/archived) bilan ARALASHTIRILMAYDI.
    // "Klub arxivlangan" va "klub kuzatuvda/to'xtatilgan" boshqa-boshqa narsa.
    setClubOperationalStatus: async (clubId, operationalStatus, { reason = '', actor } = {}) => {
        if (!Object.values(OPERATIONAL_STATUS).includes(operationalStatus)) {
            throw new Error("Noma'lum faoliyat holati");
        }
        const club = db.getClubById(clubId);
        const from = club?.operationalStatus || DEFAULT_OPERATIONAL_STATUS;
        await db.updateClub(clubId, { operationalStatus });
        await db.logClubStatusChange({
            clubId, statusKind: 'operational', fromStatus: from, toStatus: operationalStatus,
            reason, actor,
        });
        return true;
    },

    // ========================================================================
    // KLUB TASHKIL ETISH VA RASMIYLASHTIRISH
    //
    // Bu blok mavjud klub tizimiga QO'SHILADI - uni almashtirmaydi. Ikkala
    // yo'l (talaba arizasi va admin to'g'ridan-to'g'ri yaratishi) OXIR-
    // OQIBAT bitta `clubs` yozuviga olib keladi (config/clubRegistration.js
    // izohi). Barcha yangi jadvallar `supabase/club_registration.sql` da.
    // ========================================================================

    isClubRegistrationBackendReady: () => getDB().clubRegistrationBackendReady !== false,

    // ------------------------------------------------------------------
    // ARIZALAR
    // ------------------------------------------------------------------
    getMyClubApplications: (userId) =>
        (getDB().clubApplications || [])
            .filter(a => a.applicantUserId === userId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),

    getClubApplication: (id) => (getDB().clubApplications || []).find(a => a.id === id) || null,

    // Admin panelidagi "Clubs -> Applications" ro'yxati.
    getClubApplications: ({ status = null } = {}) => {
        const students = new Map(generateMockStudents().map(s => [s.id, s]));
        const profiles = new Map((getDB().realProfiles || []).map(p => [p.id, p]));
        return (getDB().clubApplications || [])
            .filter(a => !status || a.status === status)
            .map(a => ({
                ...a,
                applicant: students.get(a.applicantUserId) || profiles.get(a.applicantUserId) || null,
            }))
            .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    },

    getClubApplicationReviews: (applicationId) =>
        (getDB().clubApplicationReviews || [])
            .filter(r => r.applicationId === applicationId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),

    // Ariza faqat DRAFT holatda saqlanadi/tahrirlanadi - `submit` bosilgach
    // SUBMITTED bo'ladi va bevosita tahrirlash to'xtaydi (band 10: "noto'g'ri
    // bosqichni chetlab o'tishga yo'l qo'yilmasin").
    saveClubApplicationDraft: async ({ applicationId = null, applicantUserId, fields }) => {
        await assertAuthenticated();
        const dbData = getDB();
        const now = new Date().toISOString();

        if (applicationId) {
            const record = (dbData.clubApplications || []).find(a => a.id === applicationId);
            if (!record) throw new Error('Ariza topilmadi');
            // Ikki holatda tahrirlanadi: hali yuborilmagan (DRAFT) yoki
            // "qayta ishlashga yuborilgan" (REVISION_REQUIRED) - ikkinchisi
            // aynan shu tahrirlash uchun mo'ljallangan holat (band 10 workflow).
            if (![APPLICATION_STATUS.DRAFT, APPLICATION_STATUS.REVISION_REQUIRED].includes(record.status)) {
                throw new Error("Bu ariza hozir tahrirlanmaydi");
            }
            const nextData = { ...record.fields, ...fields };
            const { error } = await supabase.from('club_applications')
                .update({ data: { ...record, fields: nextData, updatedAt: now }, updated_at: now })
                .eq('id', applicationId);
            if (error) throw clubRegistrationTableError(error);
            Object.assign(record, { fields: nextData, updatedAt: now });
            saveDB(dbData);
            return record;
        }

        const id = 'capp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const record = {
            id, applicantUserId, status: APPLICATION_STATUS.DRAFT, fields,
            createdAt: now, updatedAt: now,
        };
        const { error } = await supabase.from('club_applications').insert({
            id, applicant_user_id: applicantUserId, status: APPLICATION_STATUS.DRAFT, data: record,
        });
        if (error) throw clubRegistrationTableError(error);
        (dbData.clubApplications = dbData.clubApplications || []).push(record);
        saveDB(dbData);
        return record;
    },

    deleteClubApplicationDraft: async (applicationId, userId) => {
        await assertAuthenticated();
        const dbData = getDB();
        const record = (dbData.clubApplications || []).find(a => a.id === applicationId);
        if (!record || record.applicantUserId !== userId) throw new Error('Ariza topilmadi');
        if (record.status !== APPLICATION_STATUS.DRAFT) throw new Error("Faqat qoralamani o'chirish mumkin");
        const { error } = await supabase.from('club_applications').delete().eq('id', applicationId);
        if (error) throw error;
        dbData.clubApplications = dbData.clubApplications.filter(a => a.id !== applicationId);
        saveDB(dbData);
        return true;
    },

    // Nom o'xshashligini tekshirish (band 8). Oddiy normalizatsiya + substring -
    // ML emas, lekin "TSUL ART" va "TSUL Art Club" kabi holatlarni ushlaydi.
    // Bu FAQAT ogohlantirish, hech narsani bloklamaydi.
    checkClubNameSimilarity: (name) => {
        const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9а-яёʻʼ]+/gi, ' ').trim();
        const target = norm(name);
        if (!target) return [];
        const targetWords = new Set(target.split(' ').filter(Boolean));
        const overlapScore = (candidate) => {
            const words = new Set(norm(candidate).split(' ').filter(Boolean));
            if (words.size === 0) return 0;
            let shared = 0;
            words.forEach(w => { if (targetWords.has(w)) shared += 1; });
            return shared / Math.max(words.size, targetWords.size);
        };
        const sources = [
            ...(getDB().clubs || []).map(c => ({ name: c.name, kind: 'Faol klub' })),
            ...(getDB().clubApplications || [])
                .filter(a => [APPLICATION_STATUS.SUBMITTED, APPLICATION_STATUS.UNDER_REVIEW,
                    APPLICATION_STATUS.REVISION_REQUIRED, APPLICATION_STATUS.RESUBMITTED,
                    APPLICATION_STATUS.EXPERT_REVIEW, APPLICATION_STATUS.PENDING_APPROVAL].includes(a.status))
                .map(a => ({ name: a.fields?.name, kind: 'Ko\'rib chiqilayotgan ariza' })),
        ];
        return sources
            .map(s => ({ ...s, score: overlapScore(s.name) }))
            .filter(s => s.name && s.score >= 0.5)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
    },

    // Ikki holatdan chaqirilishi mumkin: yangi qoralamadan (DRAFT -> SUBMITTED,
    // amal "submit") yoki qayta ishlashdan keyin (REVISION_REQUIRED ->
    // RESUBMITTED, amal "resubmit"). Qaysi amal kerakligini joriy holatning
    // o'zi hal qiladi - talaba ikkalasi uchun ham bitta "Yuborish" tugmasini
    // bosadi.
    submitClubApplication: async ({ applicationId = null, applicantUserId, fields }) => {
        await assertAuthenticated();
        const draft = await db.saveClubApplicationDraft({ applicationId, applicantUserId, fields });
        const action = draft.status === APPLICATION_STATUS.REVISION_REQUIRED ? 'resubmit' : 'submit';
        return db.reviewClubApplication({
            applicationId: draft.id, action, reviewedBy: applicantUserId,
        });
    },

    // BARCHA STATUS O'TISHLARI SHU YERDAN O'TADI - frontend tugmani
    // yashirishi yetarli emas, chunki noto'g'ri o'tish shu yerda ham
    // rad etiladi (band 10, band 12).
    reviewClubApplication: async ({ applicationId, action, comment = '', reviewedBy }) => {
        await assertAuthenticated();
        const dbData = getDB();
        const record = (dbData.clubApplications || []).find(a => a.id === applicationId);
        if (!record) throw new Error('Ariza topilmadi');

        const actionDef = APPLICATION_ACTIONS.find(a => a.key === action);
        if (!actionDef) throw new Error("Noma'lum amal");
        if (!actionDef.from.includes(record.status)) {
            throw new Error(`"${record.status}" holatidan "${action}" amalini bajarib bo'lmaydi`);
        }
        if (!canTransitionApplication(record.status, actionDef.to)) {
            throw new Error("Bu status o'tishi ruxsat etilmagan");
        }
        if (actionDef.requiresComment && !String(comment || '').trim()) {
            throw new Error('Sababini yozing');
        }

        const now = new Date().toISOString();
        const fromStatus = record.status;
        const { error } = await supabase.from('club_applications')
            .update({ status: actionDef.to, data: { ...record, status: actionDef.to, updatedAt: now }, updated_at: now })
            .eq('id', applicationId);
        if (error) throw clubRegistrationTableError(error);
        Object.assign(record, { status: actionDef.to, updatedAt: now });

        const reviewId = 'crev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const reviewRecord = {
            id: reviewId, applicationId, fromStatus, toStatus: actionDef.to,
            action, comment: String(comment || '').trim(), reviewedBy, createdAt: now,
        };
        const { error: revErr } = await supabase.from('club_application_reviews').insert({
            id: reviewId, application_id: applicationId, from_status: fromStatus, to_status: actionDef.to,
            action, comment: reviewRecord.comment, reviewed_by: reviewedBy,
        });
        if (revErr) throw clubRegistrationTableError(revErr);
        (dbData.clubApplicationReviews = dbData.clubApplicationReviews || []).push(reviewRecord);
        saveDB(dbData);

        return record;
    },

    // ARIZANI KLUBGA AYLANTIRISH (band 5, band 11 "Klubga aylantirish").
    //
    // Faqat APPROVED holatdagi arizadan chaqiriladi. Yakuniy natija - BITTA
    // mavjud `Club` yozuvi, parallel model emas. `createClub` o'zi allaqachon
    // registrationStatus: DRAFT bilan boshlaydi - bu yerda faqat
    // `createdFrom`/`applicationId` to'g'ri ulanadi.
    convertApplicationToClub: async ({ applicationId, adminOverrides = {}, createdBy }) => {
        await assertAuthenticated();
        const application = db.getClubApplication(applicationId);
        if (!application) throw new Error('Ariza topilmadi');
        if (application.status !== APPLICATION_STATUS.APPROVED) {
            throw new Error('Faqat tasdiqlangan arizadan klub yaratish mumkin');
        }
        const f = application.fields || {};
        const club = await db.createClub({
            name: adminOverrides.name || f.name,
            description: adminOverrides.description || f.purpose || '',
            category: adminOverrides.category || f.direction || '',
            pointsModifier: 1.0,
            clubType: f.clubType || null,
            createdFrom: CREATED_FROM.APPLICATION,
            createdBy,
            applicationId,
        });

        const dbData = getDB();
        const record = (dbData.clubApplications || []).find(a => a.id === applicationId);
        if (record) {
            const now = new Date().toISOString();
            const { error } = await supabase.from('club_applications')
                .update({ data: { ...record, resultingClubId: club.id, updatedAt: now }, updated_at: now })
                .eq('id', applicationId);
            if (!error) { record.resultingClubId = club.id; record.updatedAt = now; saveDB(dbData); }
        }

        // NIZOMNI YANGI KLUBGA BOG'LASH.
        //
        // Ariza bosqichida talaba yozgan nizom `club_regulations.application_id`
        // orqali saqlangan, `club_id` esa hali NULL edi (klub hali mavjud
        // emas edi). Klub yaratilgach shu yozuvni klubga ko'chirmasak, u
        // "muallifsiz" qolib ketardi - klub profilidagi "Ro'yxat" tabi va
        // "Klub hujjatlari" tabi uni hech qachon topa olmasdi.
        const regulation = (dbData.clubRegulations || []).find(r => r.applicationId === applicationId);
        if (regulation && !regulation.clubId) {
            const { error: regErr } = await supabase.from('club_regulations')
                .update({ club_id: String(club.id) })
                .eq('id', regulation.id);
            if (regErr) {
                // Jim qoldirilmaydi: bu yerda muvaffaqiyatsizlik "nizom
                // ko'rinmay qoladi" degan chalkash simptomga olib kelardi.
                // `getClubRegulation`/`saveClubRegulation` baribir ariza
                // orqali fallback qiladi (pastda izohi), shuning uchun bu
                // klub yaratilishini TO'XTATMAYDI - faqat konsolda qayd
                // etiladi.
                console.warn('[klub nizomi] klubga bog\'lanmadi, keyinroq fallback orqali topiladi', regErr);
            } else {
                regulation.clubId = String(club.id);
                saveDB(dbData);
            }
        }

        return club;
    },

    // ------------------------------------------------------------------
    // RASMIYLASHTIRISH: RO'YXATDAN O'TKAZISH VA GUVOHNOMA
    // ------------------------------------------------------------------
    getClubStatusHistory: (clubId) =>
        (getDB().clubStatusHistory || [])
            .filter(h => String(h.clubId) === String(clubId))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),

    logClubStatusChange: async ({ clubId, statusKind, fromStatus, toStatus, reason = '', actor }) => {
        const dbData = getDB();
        const id = 'cshist_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const record = {
            id, clubId: String(clubId), statusKind, fromStatus: fromStatus || null, toStatus,
            reason: String(reason || '').trim(), actor, createdAt: new Date().toISOString(),
        };
        const { error } = await supabase.from('club_status_history').insert({
            id, club_id: record.clubId, status_kind: statusKind, from_status: record.fromStatus,
            to_status: toStatus, reason: record.reason, actor,
        });
        if (error) { console.warn('[klub holati tarixi] yozilmadi', error); return null; }
        (dbData.clubStatusHistory = dbData.clubStatusHistory || []).push(record);
        saveDB(dbData);
        return record;
    },

    // "Klub yaratildi" ≠ "Klub rasmiy ro'yxatdan o'tdi" (band 3 ning eng
    // muhim qismi). Bu amal ikkinchisini beradi: Registry Number shu yerda
    // birinchi va oxirgi marta beriladi - qayta chaqirilsa xato qaytaradi.
    registerClub: async ({ clubId, basisDocument = {}, registeredBy }) => {
        await assertAuthenticated();
        const club = db.getClubById(clubId);
        if (!club) throw new Error('Klub topilmadi');
        // HAQIQIY MEZON - reyestr RAQAMINING o'zi, `registrationStatus`
        // matni emas. Bu modul qo'shilishidan oldingi klublar avtomatik
        // ravishda REGISTERED deb belgilangan (qayta tekshiruvdan
        // o'tkazilmasin uchun), lekin ularga hech qachon haqiqiy raqam
        // berilmagan - status matniga qarab bloklash ularni abadiy
        // raqamsiz qoldirardi (club_certificates.registry_number NOT NULL
        // xatosi shundan kelib chiqqan edi).
        if (club.registryNumber) {
            throw new Error("Bu klub allaqachon ro'yxatdan o'tgan");
        }
        const registryNumber = await db.nextRegistrationNumber(CLUB_REGISTRY_PREFIX);
        const registeredAt = new Date().toISOString();
        // `admin_register_club` - SECURITY DEFINER funksiya, o'zi
        // is_platform_admin() ni tekshiradi. Oddiy `updateClub` ATAYLAB
        // ishlatilmaydi: klub koordinatori ham `clubs.data` ga yoza olishi
        // mumkin, bu esa admin tasdig'isiz "ro'yxatdan o'tkazish" imkonini
        // ochib qo'yardi (supabase/club_registration.sql, band 6-izoh).
        const { error: rpcErr } = await supabase.rpc('admin_register_club', {
            p_club_id: String(clubId), p_registry_number: registryNumber, p_registered_at: registeredAt,
        });
        if (rpcErr) throw rpcErr;
        await syncCoreDataFromSupabase();
        await db.logClubStatusChange({
            clubId, statusKind: 'registration', fromStatus: club.registrationStatus,
            toStatus: REGISTRATION_STATUS.REGISTERED,
            reason: basisDocument.note || '', actor: registeredBy,
        });
        return { registryNumber, registeredAt };
    },

    getClubCertificate: (clubId) =>
        (getDB().clubCertificates || [])
            .filter(c => String(c.clubId) === String(clubId))
            .sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt))[0] || null,

    // Guvohnoma FAQAT reyestr raqami bor klubga beriladi (band 9 cheklovi).
    // `registrationStatus` emas, `registryNumber`ning o'zi tekshiriladi -
    // sababi `registerClub` dagi izohda: eski klublar raqamsiz ham
    // "REGISTERED" deb ko'rinishi mumkin.
    issueClubCertificate: async ({ clubId, basisDocument = {}, issuedBy }) => {
        await assertAuthenticated();
        const club = db.getClubById(clubId);
        if (!club) throw new Error('Klub topilmadi');
        if (!club.registryNumber) {
            throw new Error("Guvohnoma faqat ro'yxatdan o'tgan (reyestr raqami bor) klubga beriladi");
        }
        const certificateNumber = await db.nextRegistrationNumber(CLUB_CERTIFICATE_PREFIX);
        const issuedAt = new Date().toISOString();
        const id = 'ccert_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const record = {
            id, clubId: String(clubId), certificateNumber, registryNumber: club.registryNumber,
            status: 'active', issuedBy, issuedAt, basisDocument,
        };
        const { error } = await supabase.from('club_certificates').insert({
            id, club_id: record.clubId, certificate_number: certificateNumber,
            registry_number: club.registryNumber, status: 'active', issued_by: issuedBy,
            basis_document: basisDocument,
        });
        if (error) throw clubRegistrationTableError(error);

        const dbData = getDB();
        (dbData.clubCertificates = dbData.clubCertificates || []).push(record);
        saveDB(dbData);

        // `admin_issue_club_certificate` - registerClub bilan bir xil sabab:
        // haqiqiy backend chegarasi, klub koordinatoriga ochilib qolmaydigan.
        const { error: rpcErr } = await supabase.rpc('admin_issue_club_certificate', {
            p_club_id: String(clubId), p_certificate_number: certificateNumber,
        });
        if (rpcErr) throw rpcErr;
        await syncCoreDataFromSupabase();
        await db.logClubStatusChange({
            clubId, statusKind: 'operational', fromStatus: club.operationalStatus,
            toStatus: OPERATIONAL_STATUS.ACTIVE, reason: 'Guvohnoma berildi', actor: issuedBy,
        });
        return record;
    },

    // ------------------------------------------------------------------
    // NIZOM (band 9)
    // ------------------------------------------------------------------
    // Avval to'g'ridan-to'g'ri klubga bog'langan yozuv qidiriladi. Topilmasa,
    // klubning tashkil etilgan arizasiga qaraladi - `convertApplicationToClub`
    // nizomni klubga bog'lab qo'yishi kerak edi, lekin bu YOZISH amali va
    // istalgan sababga ko'ra (tarmoq, RLS) muvaffaqiyatsiz bo'lishi mumkin.
    // O'QISH bunga tayanmasligi kerak - shu FALLBACK bilan bog'lash
    // muvaffaqiyatsiz bo'lgan taqdirda ham nizom "yo'qolib qolmaydi".
    getClubRegulation: (clubId) => {
        const dbData = getDB();
        const direct = (dbData.clubRegulations || []).find(r => String(r.clubId) === String(clubId));
        if (direct) return direct;
        const club = (dbData.clubs || []).find(c => String(c.id) === String(clubId));
        if (!club?.applicationId) return null;
        return (dbData.clubRegulations || []).find(r => r.applicationId === club.applicationId) || null;
    },

    getApplicationRegulation: (applicationId) =>
        (getDB().clubRegulations || []).find(r => r.applicationId === applicationId) || null,

    // `allowApprovedEdit` - FAQAT admin konteksti shu bilan chaqiradi
    // (ClubRegulationEditor: canApprove=true). Talaba tomonidan chaqirilganda
    // bu doim `false`, shuning uchun tasdiqlangan nizom ular uchun qulflangan
    // qoladi - haqiqiy chegara baribir RLS da (club_regulations_upsert:
    // "status <> 'approved'" faqat egasiga, adminga emas).
    //
    // `savedBy` - tahrir tarixidagi yozuvga kim o'zgartirganini yozadi.
    saveClubRegulation: async ({
        regulationId = null, clubId = null, applicationId = null, sections,
        allowApprovedEdit = false, savedBy = null,
    }) => {
        await assertAuthenticated();
        const dbData = getDB();
        const now = new Date().toISOString();

        const existing = regulationId
            ? (dbData.clubRegulations || []).find(r => r.id === regulationId)
            : (clubId
                ? (dbData.clubRegulations || []).find(r => String(r.clubId) === String(clubId))
                : (dbData.clubRegulations || []).find(r => r.applicationId === applicationId));

        if (existing) {
            const wasApproved = existing.status === REGULATION_STATUS.APPROVED;
            if (wasApproved && !allowApprovedEdit) {
                throw new Error("Tasdiqlangan nizomni to'g'ridan-to'g'ri tahrirlab bo'lmaydi");
            }
            // TASDIQLANGANDAN KEYINGI TAHRIR - eskisi O'CHIRILMAYDI, tarixga
            // qo'shiladi. Shu bilan "avvalgi tahrir"/"yangi tahrir" ikkalasi
            // ham saqlanib qoladi, hammaga (talaba, tashqi ko'ruvchi) ochiq
            // kichik havola orqali ko'rinadi (ClubRegulationEditor.jsx,
            // DocumentReaderModal.jsx).
            const history = wasApproved
                ? [...(existing.history || []), {
                    sections: existing.sections, savedAt: existing.updatedAt || existing.createdAt,
                    savedBy: existing.lastEditedBy || null, revision: (existing.history || []).length + 1,
                }]
                : (existing.history || []);

            // O'Z-O'ZINI TUZATISH: bu yozuv klub kontekstidan (clubId bilan)
            // saqlanayotgan bo'lsa-yu, hali `club_id` bog'lanmagan bo'lsa
            // (masalan `convertApplicationToClub` dagi bog'lash muvaffaqiyatsiz
            // bo'lgan bo'lsa), shu yerda bog'lanadi - keyingi safar ariza
            // orqali fallback qidirishga hojat qolmaydi.
            const payload = { sections, history, updated_at: now, last_edited_by: savedBy || existing.lastEditedBy || null };
            if (clubId && !existing.clubId) payload.club_id = String(clubId);
            const { error } = await supabase.from('club_regulations')
                .update(payload)
                .eq('id', existing.id);
            if (error) throw clubRegistrationTableError(error);
            Object.assign(existing, { sections, history, updatedAt: now, lastEditedBy: payload.last_edited_by });
            if (payload.club_id) existing.clubId = payload.club_id;
            saveDB(dbData);
            return existing;
        }

        const id = 'creg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const record = {
            id, clubId: clubId ? String(clubId) : null, applicationId: applicationId || null,
            status: REGULATION_STATUS.DRAFT, sections: sections || {}, createdAt: now, updatedAt: now,
        };
        const { error } = await supabase.from('club_regulations').insert({
            id, club_id: record.clubId, application_id: record.applicationId,
            status: REGULATION_STATUS.DRAFT, sections: record.sections,
        });
        if (error) throw clubRegistrationTableError(error);
        (dbData.clubRegulations = dbData.clubRegulations || []).push(record);
        saveDB(dbData);
        return record;
    },

    approveClubRegulation: async (regulationId, approvedBy) => {
        await assertAuthenticated();
        const dbData = getDB();
        const record = (dbData.clubRegulations || []).find(r => r.id === regulationId);
        if (!record) throw new Error('Nizom topilmadi');
        const now = new Date().toISOString();
        const { error } = await supabase.from('club_regulations')
            .update({ status: REGULATION_STATUS.APPROVED, updated_at: now })
            .eq('id', regulationId);
        if (error) throw clubRegistrationTableError(error);
        Object.assign(record, { status: REGULATION_STATUS.APPROVED, updatedAt: now, approvedBy });
        saveDB(dbData);
        return record;
    },

    requestClubRegulationRevision: async (regulationId) => {
        await assertAuthenticated();
        const dbData = getDB();
        const record = (dbData.clubRegulations || []).find(r => r.id === regulationId);
        if (!record) throw new Error('Nizom topilmadi');
        const now = new Date().toISOString();
        const { error } = await supabase.from('club_regulations')
            .update({ status: REGULATION_STATUS.REVISION, updated_at: now })
            .eq('id', regulationId);
        if (error) throw clubRegistrationTableError(error);
        Object.assign(record, { status: REGULATION_STATUS.REVISION, updatedAt: now });
        saveDB(dbData);
        return record;
    },

    // ------------------------------------------------------------------
    // OCHIQ TEKSHIRUV (QR) - login talab qilinmaydi.
    // ------------------------------------------------------------------
    verifyClubByRegistryNumber: async (registryNumber) => {
        const { data, error } = await supabase.rpc('verify_club', { p_registry_number: registryNumber });
        if (error) throw error;
        const row = (data || [])[0];
        if (!row) return null;
        return {
            registryNumber: row.registry_number,
            clubName: row.club_name,
            clubType: row.club_type,
            direction: row.direction,
            registrationStatus: row.registration_status,
            registeredAt: row.registered_at,
            certificateNumber: row.certificate_number,
            certificateStatus: row.certificate_status,
        };
    },

    // CLUB POSITIONS (Klub tuzilmasi / Ochiq o'rinlar) - formal (head/assistant coordinator) + internal
    // (SMM/media/event-coordinator/volunteer) positions a club coordinator opens for students to apply to.
    getClubPositions: (clubId) => (getDB().clubPositions || []).filter(p => p.clubId === clubId),
    getPositionById: (id) => (getDB().clubPositions || []).find(p => p.id === id),
    // ASYNC: lavozim endi bazaga yoziladi. Ilgari faqat localStorage da
    // qolardi va boshqa kompyuterdagi talaba ochiq lavozimni ko'rmasdi.
    createClubPosition: async (data) => {
        const dbData = getDB();
        if (!dbData.clubPositions) dbData.clubPositions = [];
        const maxSlots = POSITION_MAX_SLOTS[data.title];
        const requestedSlots = data.slots || 1;
        if (maxSlots && requestedSlots > maxSlots) {
            throw new Error(`"${POSITION_TYPE_LABELS[data.title] || data.title}" uchun eng ko'pi bilan ${maxSlots} ta o'rin bo'lishi mumkin`);
        }
        const newPosition = {
            id: 'pos_' + Date.now().toString(),
            clubId: data.clubId,
            kind: data.kind,
            title: data.title,
            slots: requestedSlots,
            filledCount: 0,
            duration: data.duration || '',
            requirements: data.requirements || '',
            status: 'open',
            createdBy: data.createdBy,
            createdAt: new Date().toISOString(),
            displayNumber: nextDisplayNumber(dbData.clubPositions)
        };
        dbData.clubPositions.push(newPosition);
        await persistClubPosition(newPosition);
        saveDB(dbData);
        return newPosition;
    },
    closeClubPosition: async (id) => {
        const dbData = getDB();
        const idx = (dbData.clubPositions || []).findIndex(p => p.id === id);
        if (idx === -1) return null;
        dbData.clubPositions[idx].status = 'closed';
        await persistClubPosition(dbData.clubPositions[idx]);
        saveDB(dbData);
        return dbData.clubPositions[idx];
    },

    // CLUB POSITION APPLICATIONS - ariza-only model, coordinators never invite. Students apply themselves;
    // getPositionApplications/getClubPositionApplications/getStudentPositionApplications are the 3 read
    // shapes every consumer (review panel / org-structure tab / portfolio) needs.
    getPositionApplications: (positionId) => (getDB().clubPositionApplications || []).filter(a => a.positionId === positionId),
    getClubPositionApplications: (clubId) => (getDB().clubPositionApplications || []).filter(a => a.clubId === clubId),
    getStudentPositionApplications: (studentId) => (getDB().clubPositionApplications || []).filter(a => a.studentId === studentId),
    // ASYNC: ariza endi bazaga yoziladi. Ilgari koordinator boshqa
    // kompyuterda arizani umuman ko'rmasdi.
    applyForPosition: async (positionId, studentId, motivation) => {
        const dbData = getDB();
        const position = (dbData.clubPositions || []).find(p => p.id === positionId);
        if (!position) throw new Error('Lavozim topilmadi');
        if (position.status !== 'open') throw new Error('Bu lavozim uchun ariza qabul qilinmayapti');
        const existing = (dbData.clubPositionApplications || []).find(a =>
            a.positionId === positionId && a.studentId === studentId && a.status === POSITION_APPLICATION_STATUS.PENDING
        );
        if (existing) return existing;

        const application = {
            id: 'posapp_' + Date.now().toString(),
            positionId,
            clubId: position.clubId,
            studentId,
            motivation: motivation || '',
            status: POSITION_APPLICATION_STATUS.PENDING,
            submittedAt: new Date().toISOString(),
            interviewInvitedAt: null,
            interviewInvitedBy: null,
            interviewNotes: null,
            reviewedBy: null,
            reviewedAt: null,
            reviewerComment: null,
            approvedByAdminId: null,
            approvedByAdminAt: null,
            addedByOverride: false
        };
        if (!dbData.clubPositionApplications) dbData.clubPositionApplications = [];
        dbData.clubPositionApplications.push(application);
        if (!dbData.clubPositionAuditLogs) dbData.clubPositionAuditLogs = [];
        const submitLog = {
            id: 'poslog_' + Date.now().toString(),
            applicationId: application.id,
            action: 'SUBMITTED',
            fromStatus: null,
            toStatus: POSITION_APPLICATION_STATUS.PENDING,
            reviewer: studentId,
            comment: '',
            time: application.submittedAt
        };
        dbData.clubPositionAuditLogs.push(submitLog);

        await persistClubPositionApplication(application);
        await persistClubPositionLog(submitLog);

        saveDB(dbData);
        return application;
    },

    // Three-step coordinator stage - portfolio review (UI-only, no db call) -> 'invite_interview'
    // (records interviewInvitedAt/interviewNotes, status stays PENDING) -> 'coordinator_approve'
    // (requires an interview already recorded) or 'coordinator_reject' (allowed any time, no interview
    // required to turn someone down) - then admin gives the final word ('admin_approve'|'admin_reject'),
    // only 'admin_approve' actually grants the role (the "powers activate" step, spec section 2).
    // Status deliberately stays PENDING through the whole coordinator stage - reviewedBy/interviewInvitedAt
    // being set is what the UI reads to show the right sub-stage without inventing new status values.
    // 'cancel' lets the student withdraw their own application.
    // ASYNC: `admin_approve` a'zolik rolini Supabase'ga yozadi (izohi
    // persistMembershipRole ustida). Chaqiruvchi `await` qilishi SHART -
    // aks holda xato yo'qoladi va tasdiqlash muvaffaqiyatli ko'rinadi.
    reviewPositionApplication: async (applicationId, action, reviewer, comment) => {
        const dbData = getDB();
        const idx = (dbData.clubPositionApplications || []).findIndex(a => a.id === applicationId);
        if (idx === -1) throw new Error('Ariza topilmadi');
        const application = dbData.clubPositionApplications[idx];
        const fromStatus = application.status;
        const timestamp = new Date().toISOString();

        if (action === 'invite_interview') {
            application.interviewInvitedAt = timestamp;
            application.interviewInvitedBy = reviewer;
            application.interviewNotes = comment || null;
        } else if (action === 'coordinator_approve') {
            if (!application.interviewInvitedAt) throw new Error("Avval nomzodni suhbatga taklif qiling");
            application.reviewedBy = reviewer;
            application.reviewedAt = timestamp;
            application.reviewerComment = comment || null;
        } else if (action === 'coordinator_reject') {
            application.status = POSITION_APPLICATION_STATUS.REJECTED;
            application.reviewedBy = reviewer;
            application.reviewedAt = timestamp;
            application.reviewerComment = comment || null;
        } else if (action === 'admin_approve') {
            if (!application.reviewedBy) throw new Error("Avval koordinator ko'rib chiqishi kerak");
            const position = (dbData.clubPositions || []).find(p => p.id === application.positionId);
            if (!position) throw new Error('Lavozim topilmadi');
            if (position.slots && position.filledCount >= position.slots) {
                throw new Error("Bu lavozim uchun barcha o'rinlar band");
            }
            // `assignPosition` dagi bilan bir xil to'qnashuv tekshiruvi:
            // arizani tasdiqlash ham lavozimga qo'yish demakdir.
            assertCanHoldClubPosition(
                dbData, application.studentId, position.clubId,
                generateMockStudents().find(s => s.id === application.studentId)?.fullName
            );
            application.status = POSITION_APPLICATION_STATUS.APPROVED;
            application.approvedByAdminId = reviewer;
            application.approvedByAdminAt = timestamp;

            const posIdx = dbData.clubPositions.findIndex(p => p.id === position.id);
            dbData.clubPositions[posIdx].filledCount = (dbData.clubPositions[posIdx].filledCount || 0) + 1;
            // To'lgan o'rinlar soni ham serverga: aks holda boshqa kompyuterda
            // lavozim hali bo'sh ko'rinib, ikkinchi odam ariza berib qo'yardi.
            await persistClubPosition(dbData.clubPositions[posIdx]);

            // Ariza orqali tayinlash ham `assignPosition` bilan BIR XIL yo'ldan
            // yuradi. Ilgari bu yerda a'zolik faqat brauzerga yozilardi va
            // keyingi sinxronlashda yo'qolardi - ya'ni admin arizani
            // tasdiqlardi, talaba esa hech qanday huquq olmasdi.
            const mappedRole = POSITION_TO_MEMBERSHIP_ROLE[position.title] || 'member';
            await persistMembershipRole(dbData, {
                studentId: application.studentId,
                clubId: position.clubId,
                role: mappedRole,
                joinedAt: timestamp,
            });
        } else if (action === 'admin_reject') {
            application.status = POSITION_APPLICATION_STATUS.REJECTED;
            application.reviewerComment = comment || application.reviewerComment;
        } else if (action === 'cancel') {
            application.status = POSITION_APPLICATION_STATUS.CANCELLED;
        } else {
            throw new Error("Noma'lum amal: " + action);
        }

        dbData.clubPositionApplications[idx] = application;
        if (!dbData.clubPositionAuditLogs) dbData.clubPositionAuditLogs = [];
        const reviewLog = {
            id: 'poslog_' + Date.now().toString(),
            applicationId,
            action: action.toUpperCase(),
            fromStatus,
            toStatus: application.status,
            reviewer,
            comment: comment || '',
            time: timestamp
        };
        dbData.clubPositionAuditLogs.push(reviewLog);

        // Arizaning yangi holati ham serverga. Ilgari a'zolik roli ko'char,
        // ariza esa brauzerda qolardi - keyin "bu odam nega koordinator
        // bo'lgan" degan savolga javob topib bo'lmasdi.
        await persistClubPositionApplication(application);
        await persistClubPositionLog(reviewLog);

        saveDB(dbData);
        return application;
    },
    getPositionAuditLogs: (applicationId) => (getDB().clubPositionAuditLogs || []).filter(l => l.applicationId === applicationId),

    // All position-domain audit entries for a club (spec section 8's sidebar timeline) - merges the
    // ariza-flow logs (which only carry applicationId, resolved here via clubPositionApplications) with
    // the direct-assign logs (which already carry clubId directly, see assignPosition/removeFromClubPosition).
    getClubPositionAuditLogs: (clubId) => {
        const dbData = getDB();
        const applicationClubById = new Map((dbData.clubPositionApplications || []).map(a => [a.id, a.clubId]));
        return (dbData.clubPositionAuditLogs || [])
            .filter(l => (l.clubId || applicationClubById.get(l.applicationId)) === clubId)
            .sort((a, b) => new Date(b.time) - new Date(a.time));
    },

    // STUDENT PORTFOLIO (Talaba portfoliosi) - read-only aggregation, writes nothing back. Merges BOTH
    // position sources: ariza-approved clubPositionApplications AND direct-assign clubPositionAssignments
    // (Klub tarkibi workspace) into one normalized { id, positionTitle, club, source } shape, so the
    // ">3 active positions = Yuqori yuklama" warning correctly counts positions regardless of which flow
    // granted them.
    getStudentPortfolio: (studentId) => {
        const dbData = getDB();
        const memberships = (dbData.memberships || []).filter(m => m.userId === studentId);
        const applications = (dbData.clubPositionApplications || []).filter(a => a.studentId === studentId);
        const activeApplications = applications.filter(a => a.status === POSITION_APPLICATION_STATUS.APPROVED);
        const pastApplications = applications.filter(a =>
            a.status === POSITION_APPLICATION_STATUS.CANCELLED || a.status === POSITION_APPLICATION_STATUS.EXPIRED
        );

        const positionsById = new Map((dbData.clubPositions || []).map(p => [p.id, p]));
        const clubsById = new Map((dbData.clubs || []).map(c => [c.id, c]));
        const assignments = (dbData.clubPositionAssignments || []).filter(a => a.studentId === studentId);
        const activeAssignments = assignments.filter(a => a.status === 'active');
        const endedAssignments = assignments.filter(a => a.status === 'ended');

        const activePositions = [
            ...activeApplications.map(a => ({ id: a.id, positionTitle: positionsById.get(a.positionId)?.title, club: clubsById.get(a.clubId), source: 'application' })),
            ...activeAssignments.map(a => ({ id: a.id, positionTitle: a.positionTitle, club: clubsById.get(a.clubId), source: 'assignment' }))
        ];
        const pastPositions = [
            ...pastApplications.map(a => ({ id: a.id, positionTitle: positionsById.get(a.positionId)?.title, club: clubsById.get(a.clubId), source: 'application' })),
            ...endedAssignments.map(a => ({ id: a.id, positionTitle: a.positionTitle, club: clubsById.get(a.clubId), source: 'assignment', endReason: a.endReason }))
        ];

        const coordinatorClubIds = memberships.filter(m => m.role === 'head_coordinator' || m.role === 'coordinator').map(m => m.clubId);
        const eventsOrganizedCount = coordinatorClubIds.reduce((sum, clubId) => sum + db.getClubEvents(clubId).length, 0);

        // No real hours-tracking field exists anywhere in the app yet - disclosed estimate: each approved
        // "VOLUNTEERING" social-activity application stands in for ~4 volunteer hours.
        const approvedVolunteering = (dbData.socialActivityApplications || [])
            .filter(a => a.studentId === studentId && a.criteriaKey === 'VOLUNTEERING' && a.status === 'Approved');
        const volunteerHoursEstimate = approvedVolunteering.length * 4;

        const lastActivityDate = [...memberships.map(m => m.joinedAt), ...applications.map(a => a.submittedAt)]
            .sort((a, b) => new Date(b) - new Date(a))[0] || null;

        const workloadIndex = activePositions.length;

        return {
            studentId,
            memberships,
            activePositions,
            pastPositions,
            eventsOrganizedCount,
            volunteerHoursEstimate,
            lastActivityDate,
            workloadIndex,
            hasHighWorkload: workloadIndex > 3,
            hasLeadershipConflict: memberships.filter(m => m.role === 'head_coordinator').length > 1
        };
    },

    // True if this student already holds 'head_coordinator' in some OTHER club - used to warn a reviewer
    // before approving a second head_coordinator application for the same person (spec section 3).
    hasLeadershipConflictElsewhere: (studentId, excludeClubId) =>
        (getDB().memberships || []).some(m => m.userId === studentId && m.role === 'head_coordinator' && m.clubId !== excludeClubId),

    // ============================================================================================
    // CLUB POSITION ASSIGNMENTS - the direct "Lavozimga tayinlash" flow (professional Klub tarkibi
    // workspace). Admin/coordinator picks a student + a position type and assigns immediately - no
    // ariza/review round-trip (that's what clubPositions/clubPositionApplications above are for).
    // Parallel ledger, kept separate on purpose: applications carry motivation/2-stage-review fields
    // that make no sense for a direct assignment, and mixing the two schemas would make both messier.
    // ============================================================================================
    getClubPositionAssignments: (clubId) => (getDB().clubPositionAssignments || []).filter(a => a.clubId === clubId),
    getActivePositionAssignments: (clubId) =>
        (getDB().clubPositionAssignments || []).filter(a => a.clubId === clubId && a.status === 'active'),

    // Current roster (spec section 4) - merges two sources so pre-existing seeded head/assistant
    // coordinators (granted long before this ledger existed, via buildClubSeedExpansion's membership
    // role, never backed by an assignment record) still show up, alongside every position assigned
    // through the new panel (including smm/media_design/event_coordinator/volunteer, which
    // POSITION_TO_MEMBERSHIP_ROLE can't distinguish from a plain 'member' on the membership record
    // alone). A membership-role entry is skipped if an assignment record already covers that
    // exact (studentId, positionTitle) pair, so nothing is double-counted once the new flow takes over.
    getCurrentClubRoster: (clubId) => {
        const dbData = getDB();
        const students = generateMockStudents();
        const studentById = new Map(students.map(s => [s.id, s]));
        const REVERSE_ROLE = { head_coordinator: 'head_coordinator', coordinator: 'assistant_coordinator', smm: 'smm', volunteer: 'volunteer' };

        const assignments = (dbData.clubPositionAssignments || []).filter(a => a.clubId === clubId && a.status === 'active');
        const covered = new Set(assignments.map(a => `${a.studentId}::${a.positionTitle}`));

        const fromAssignments = assignments.map(a => ({
            key: `${a.studentId}::${a.positionTitle}`,
            clubId,
            positionTitle: a.positionTitle,
            studentId: a.studentId,
            assignmentId: a.id,
            membershipId: null,
            source: 'assignment'
        }));

        const fromMemberships = (dbData.memberships || [])
            .filter(m => m.clubId === clubId && REVERSE_ROLE[m.role])
            .map(m => ({
                key: `${m.userId}::${REVERSE_ROLE[m.role]}`,
                clubId,
                positionTitle: REVERSE_ROLE[m.role],
                studentId: m.userId,
                assignmentId: null,
                membershipId: m.id,
                source: 'membership'
            }))
            .filter(entry => !covered.has(entry.key));

        return [...fromAssignments, ...fromMemberships].map(entry => ({ ...entry, student: studentById.get(entry.studentId) }));
    },

    // Assigns `studentId` to `positionTitle` in `clubId`. Handles the two cardinality rules from the
    // spec: head_coordinator is capped at 1 active holder (the previous one is ENDED with
    // endReason:'changed' and demoted to 'member', not deleted - spec section 6's succession rule) and
    // assistant_coordinator is capped at POSITION_MAX_SLOTS (3), counting both assignment records and
    // legacy membership-role holders via getCurrentClubRoster so the cap can't be bypassed by mixing sources.
    assignPosition: async ({ clubId, positionTitle, studentId, assignedByUserId, comment = '' }) => {
        if (![...OFFICIAL_POSITION_TYPES, ...INTERNAL_POSITION_TYPES].includes(positionTitle)) {
            throw new Error("Noma'lum lavozim turi");
        }
        const dbData = getDB();
        if (!dbData.clubPositionAssignments) dbData.clubPositionAssignments = [];

        const roster = db.getCurrentClubRoster(clubId);
        const timestamp = new Date().toISOString();

        // MANFAATLAR TO'QNASHUVI - hamma narsadan OLDIN tekshiriladi
        // (izohi assertCanHoldClubPosition ustida). Bosh koordinator
        // almashtirilayotgan bo'lsa, avvalgisi allaqachon lavozimdan
        // olingan bo'lardi va to'xtash yarim bajarilgan holat qoldirardi.
        assertCanHoldClubPosition(
            dbData, studentId, clubId,
            generateMockStudents().find(s => s.id === studentId)?.fullName
        );

        if (positionTitle === 'head_coordinator') {
            const currentHead = roster.find(r => r.positionTitle === 'head_coordinator' && r.studentId !== studentId);
            if (currentHead) {
                await db.removeFromClubPosition({
                    clubId, studentId: currentHead.studentId, positionTitle: 'head_coordinator',
                    endedByUserId: assignedByUserId, endReason: 'changed'
                });
            }
        } else if (positionTitle === 'assistant_coordinator') {
            const currentAssistants = roster.filter(r => r.positionTitle === 'assistant_coordinator' && r.studentId !== studentId);
            if (currentAssistants.length >= POSITION_MAX_SLOTS.assistant_coordinator) {
                throw new Error(`Yordamchi koordinator uchun eng ko'pi bilan ${POSITION_MAX_SLOTS.assistant_coordinator} o'rin band bo'lishi mumkin`);
            }
        }

        // Random suffix (same idiom used elsewhere in this file, e.g. socialActivityAuditLogs) guards
        // against id collisions when the UI assigns several positions to one student in one synchronous
        // batch (multi-select "Lavozimga tayinlash" modal) - Date.now() alone can repeat within a loop.
        const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);

        const fresh = getDB();
        const mappedRole = POSITION_TO_MEMBERSHIP_ROLE[positionTitle] || 'member';

        // A'zolik roli Supabase'ga yoziladi va shundan keyingina lavozim
        // tayinlanadi - izohi persistMembershipRole ustida.
        await persistMembershipRole(fresh, {
            studentId, clubId, role: mappedRole, joinedAt: timestamp,
        });

        const assignment = {
            id: 'posasg_' + Date.now().toString() + uniqueSuffix(),
            clubId, studentId, positionTitle,
            status: 'active',
            assignedBy: assignedByUserId,
            assignedAt: timestamp,
            endedAt: null, endedBy: null, endReason: null,
            displayNumber: nextDisplayNumber(fresh.clubPositionAssignments || [])
        };
        if (!fresh.clubPositionAssignments) fresh.clubPositionAssignments = [];
        fresh.clubPositionAssignments.push(assignment);
        if (!fresh.clubPositionAuditLogs) fresh.clubPositionAuditLogs = [];
        const assignLog = {
            id: 'poslog_' + Date.now().toString(36) + uniqueSuffix(),
            applicationId: null, clubId, studentId, positionTitle,
            action: 'ASSIGNED', fromStatus: null, toStatus: 'active',
            reviewer: assignedByUserId, comment, time: timestamp
        };
        fresh.clubPositionAuditLogs.push(assignLog);
        // A'ZOLIK ROLI yuqorida allaqachon serverga yozildi, tayinlashning
        // O'ZI esa yozilmasdi - keyin "bu odamni kim tayinlagan" degan
        // savolga javob qolmasdi. Tarix yozuvi ham xuddi shunday: u
        // sinxronlanadigan ro'yxatda, ya'ni faqat mahalliy qo'shilsa,
        // keyingi sinxronlashda butunlay yo'qolardi.
        await persistRecordRow('club_position_assignments', assignment, {
            club_id: clubId, student_id: studentId,
            position_title: positionTitle, status: 'active',
        });
        await persistClubPositionLog(assignLog);
        saveDB(fresh);

        // ASOSIY KOORDINATOR -> ijtimoiy faollik indeksining 2-mezoni bo'yicha
        // 20 ball. Talaba buni O'ZI bilishi kerak: ball indeksda jimgina paydo
        // bo'lib qolsa, u qayerdan kelganini hech kim tushuntirib bera olmaydi.
        //
        // Xabar yuborish ikkilamchi amal - u muvaffaqiyatsiz bo'lsa ham tayinlash
        // bekor qilinmaydi.
        if (positionTitle === 'head_coordinator') {
            const club = (fresh.clubs || []).find(c => c.id === clubId);
            addNotificationToSupabase({
                userId: studentId,
                type: 'success',
                title: 'Ijtimoiy faollik bali qo\'shildi',
                message: `Siz "${club?.name || 'klub'}" asosiy koordinatori bo'lganingiz uchun `
                    + `"Ijtimoiy faollik indeksi"ning 2-mezoni bo'yicha ${INDEX_CRITERIA.CLUBS.founderPoints} ball hisoblandi.`,
                refId: clubId, refType: 'club',
            }).catch(e => console.warn('[indeks] xabar yuborilmadi:', e.message));
        }

        return assignment;
    },

    // Ends a position - whether it came from the new assignment ledger or a legacy membership-role
    // holder (seeded clubs have coordinators with no backing assignment record). Always reverts the
    // membership role to 'member'; only writes a clubPositionAssignments/history row when there was one
    // to end (a legacy holder removed this way simply has no "tarixiy tarkib" row, since there was
    // nothing tracked about when their tenure started).
    removeFromClubPosition: async ({ clubId, studentId, positionTitle, endedByUserId, endReason = 'cancelled', comment = '' }) => {
        const dbData = getDB();
        const membership = (dbData.memberships || []).find(m => m.userId === studentId && m.clubId === clubId);
        if (membership) {
            membership.role = 'member';
            // `assignPosition` bilan bir xil sabab: rol Supabase'da ham
            // qaytarilishi kerak, aks holda lavozimdan olingan odam keyingi
            // kirishda yana koordinator bo'lib qolardi.
            //
            // `id` bo'yicha emas, (talaba, klub) bo'yicha topiladi: brauzerdagi
            // nusxada eski, uuid bo'lmagan id qolib ketgan bo'lishi mumkin va
            // u bilan so'rov "invalid input syntax for type uuid" beradi.
            supabase.from('memberships').update({ role: 'member' })
                .eq('user_id', studentId).eq('club_id', clubId)
                .then(({ error }) => {
                    if (error) console.warn('[klub lavozimi] rol Supabase\'da qaytarilmadi', error);
                });
        }

        const assignment = (dbData.clubPositionAssignments || [])
            .find(a => a.clubId === clubId && a.studentId === studentId && a.positionTitle === positionTitle && a.status === 'active');
        const timestamp = new Date().toISOString();
        if (assignment) {
            assignment.status = 'ended';
            assignment.endedAt = timestamp;
            assignment.endedBy = endedByUserId;
            assignment.endReason = endReason;
            await persistRecordRow('club_position_assignments', assignment, {
                club_id: clubId, student_id: studentId,
                position_title: positionTitle, status: 'ended',
            });
        }

        if (!dbData.clubPositionAuditLogs) dbData.clubPositionAuditLogs = [];
        const removeLog = {
            id: 'poslog_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            applicationId: null, clubId, studentId, positionTitle,
            action: 'REMOVED', fromStatus: 'active', toStatus: endReason,
            reviewer: endedByUserId, comment, time: timestamp
        };
        dbData.clubPositionAuditLogs.push(removeLog);
        await persistClubPositionLog(removeLog);
        saveDB(dbData);
        return assignment || null;
    },

    // Dual coverage metric (spec: "Haqiqiy qamrov") - unique student count reached by this club's
    // activity, vs. the raw member count which can double-count nothing (memberships are already
    // unique per student) but ignores non-member participants in the club's events/competitions.
    // Deliberately separate from whatever the existing certificate/attendance "Coverage calculation
    // core" already does elsewhere in the app - this is a club-scoped read-only aggregate, writes nothing.
    getClubUniqueCoverage: (clubId) => {
        const dbData = getDB();
        const memberIds = (dbData.memberships || []).filter(m => m.clubId === clubId).map(m => m.userId);
        const clubEvents = (dbData.events || []).filter(e => e.clubId === clubId);
        const eventParticipantIds = clubEvents.flatMap(e => (e.participants || []).map(p => p.userId).filter(Boolean));
        const clubCompetitionIds = new Set(db.getClubCompetitions(clubId).map(c => c.id));
        const registrationParticipantIds = (dbData.registrations || [])
            .filter(r => r.status === 'registered' && (
                (r.activityType === 'event' && clubEvents.some(e => e.id === r.activityId)) ||
                (r.activityType === 'competition' && clubCompetitionIds.has(r.activityId))
            ))
            .map(r => r.userId);

        return new Set([...memberIds, ...eventParticipantIds, ...registrationParticipantIds]).size;
    },

    // Club score = sum of member totals (real socialScoreTransactions ledger) + completed ("approved") club events.
    // Single-entity join across clubs/memberships/mock-students/transactions/events - lives in db.js like getLeaderboard().
    getClubScoreBreakdown: (clubId) => {
        const club = db.getClubById(clubId);
        if (!club) return null;

        const studentById = new Map(db.getMockStudents().map(s => [s.id, s]));
        const memberDetails = db.getClubMembers(clubId).map(m => ({
            userId: m.userId,
            role: m.role,
            fullName: studentById.get(m.userId)?.fullName || m.userId,
            score: db.getStudentSocialScoreTotal(m.userId)
        }));
        const membersTotal = memberDetails.reduce((sum, m) => sum + m.score, 0);

        const completedEvents = db.getClubEvents(clubId).filter(e => e.status === 'completed');
        const eventsTotal = completedEvents.reduce(
            (sum, e) => sum + (e.participants || []).reduce((s, p) => s + (p.score || 0), 0),
            0
        );

        return {
            club,
            memberCount: memberDetails.length,
            memberDetails: memberDetails.sort((a, b) => b.score - a.score),
            membersTotal,
            completedEvents,
            eventsTotal,
            combinedTotal: membersTotal + eventsTotal
        };
    },

    // All clubs ranked by their real getClubScoreBreakdown() total - single source of truth reused by
    // ClubsDirectoryPage and ClubProfilePage so the rank badge is always consistent between them.
    // `includeArchived` ATAYLAB standart bo'yicha `false`: arxivlangan klub
    // ro'yxatlarda ko'rinmasligi kerak. Uning sahifasi va tarixi esa
    // joyida qoladi - havola bo'yicha ochiladi.
    getRankedClubs: ({ includeArchived = false } = {}) => {
        const clubs = (getDB().clubs || [])
            .filter(c => includeArchived || (c.status || 'active') !== 'archived');
        const withScores = clubs.map(c => ({ club: c, score: db.getClubScoreBreakdown(c.id)?.combinedTotal || 0 }));
        withScores.sort((a, b) => b.score - a.score);
        return withScores.map((w, i) => ({ ...w.club, score: w.score, rank: i + 1 }));
    },

    // TEAMS (Clubs Directory - real, persisted teams, distinct from getMockTeams()'s ephemeral
    // per-competition placeholders)
    getTeams: () => getDB().teams || [],
    getClubTeams: (clubId) => (getDB().teams || []).filter(t => t.clubId === clubId),
    getTeamById: (id) => (getDB().teams || []).find(t => t.id === id),
    getTeamMembers: (teamId) => {
        const dbData = getDB();
        const studentById = new Map(db.getMockStudents().map(s => [s.id, s]));
        return (dbData.teamMembers || [])
            .filter(tm => tm.teamId === teamId)
            .map(tm => ({ ...tm, student: studentById.get(tm.userId) || null }));
    },
    // Real teams a user CAPTAINS - used by the "Mavjud jamoa" registration option (registerExistingTeam)
    // so a captain of an already-existing real team doesn't have to recreate it from scratch via
    // invite-by-invite registration every time. Captain-only (not any member) - matches the existing
    // convention that only a captain can register/represent a team (buildParticipant()/handleRegisterTeam).
    getTeamsForUser: (userId, clubId = null) => {
        const dbData = getDB();
        const captainedTeamIds = new Set(
            (dbData.teamMembers || []).filter(m => m.userId === userId && m.role === 'captain').map(m => m.teamId)
        );
        return (dbData.teams || []).filter(t => captainedTeamIds.has(t.id) && (!clubId || t.clubId === clubId));
    },
    // Best-effort faculty inference for a team - teams themselves carry no faculty field (see
    // competitionParticipantGroupAssignments' own comment), so this derives one from real roster data:
    // the captain's faculty if resolvable, else whichever faculty is most common among resolved members,
    // else null (genuinely unknown - caller falls back to manual assignment). Never stored, always
    // recomputed - purely a convenience for auto-matching a team into a competition's "guruh"/faculty
    // groups, not a source of truth.
    inferTeamFaculty: (teamId) => {
        const members = db.getTeamMembers(teamId).filter(m => m.student?.faculty);
        if (members.length === 0) return null;
        const captain = members.find(m => m.role === 'captain');
        if (captain) return captain.student.faculty;
        const counts = new Map();
        members.forEach(m => counts.set(m.student.faculty, (counts.get(m.student.faculty) || 0) + 1));
        return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    },
    // Same captain-priority-then-majority idiom as inferTeamFaculty, for CompetitionAdvancementPanel's
    // "guruh" auto-match when a competition groups by Kurs instead of (or alongside) Fakultet.
    inferTeamCourse: (teamId) => {
        const members = db.getTeamMembers(teamId).filter(m => m.student?.course != null);
        if (members.length === 0) return null;
        const captain = members.find(m => m.role === 'captain');
        if (captain) return captain.student.course;
        const counts = new Map();
        members.forEach(m => counts.set(m.student.course, (counts.get(m.student.course) || 0) + 1));
        return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    },
    // `excludeRegistrationId`: used only by _materializeTeamFromRegistration, which is naming this team
    // after a registration that's still holding the reservation itself - see isTeamNameTaken's own comment.
    createTeam: async (teamData, excludeRegistrationId = null) => {
        const dbData = getDB();
        if (isTeamNameTaken(dbData, teamData.name, null, excludeRegistrationId)) {
            throw new Error(`"${(teamData.name || '').trim()}" nomli jamoa allaqachon ro'yxatdan o'tgan - boshqa nom tanlang`);
        }
        // Random suffix (not just Date.now()) avoids an id collision when several teams are created in
        // the same millisecond - a real risk for createTestTeams' tight sequential loop below.
        const id = 'team_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
        const { data, error } = await supabase.from('teams').insert({
            id, club_id: teamData.clubId, name: teamData.name, description: teamData.description,
            display_number: nextDisplayNumber(dbData.teams)
        }).select().single();
        if (error) throw error;
        await syncCoreDataFromSupabase();
        return mapTeamFromSupabase(data);
    },
    // Admin/QA convenience: bulk-creates `count` real teams (each with a real, resolvable 4-6 member
    // roster drawn from db.getMockStudents(), same size convention buildTeamsSeed already uses) for a
    // club that doesn't yet have enough real teams to test a many-participant tournament (e.g. Munozara's
    // match-based engine with 15-20 teams) - team-type competitions only ever draw from db.getClubTeams,
    // so this exists purely to let an admin quickly reach a usable team count before running the wizard,
    // not a permanent seed mechanism. Generated names always include the club's own name (not just a
    // cyclic prefix/suffix pair) so two different clubs' test batches can never collide under the
    // platform-wide unique-team-name rule (db.createTeam now enforces this - an uncaught collision here
    // would abort the whole loop partway through).
    createTestTeams: async (clubId, count) => {
        const dbData = getDB();
        const club = (dbData.clubs || []).find(c => c.id === clubId);
        const students = db.getMockStudents();
        const existingTeams = dbData.teams || [];
        const existingCount = existingTeams.filter(t => t.clubId === clubId).length;

        // BULK, not one-by-one: db.createTeam/db.addTeamMember each run a full syncCoreDataFromSupabase
        // (20 tables) after every single insert, so the old per-team/per-member loop cost ~25 full
        // re-fetches for 4 teams - slow enough to look broken. Rows are built locally, inserted in two
        // statements, and the mirror is refreshed exactly once at the end. Same resulting data as before.
        const teamRows = [];
        const memberRows = [];
        let nextNum = nextDisplayNumber(existingTeams);
        // Platform-wide unique team name is a real rule (see db.createTeam) - checked here against both
        // existing teams and the names generated earlier in THIS batch, since nothing syncs in between.
        const takenNames = new Set(existingTeams.map(t => (t.name || '').trim().toLowerCase()));

        for (let t = 0; t < count; t++) {
            const idx = existingCount + t;
            const prefix = TEAM_NAME_PREFIXES[idx % TEAM_NAME_PREFIXES.length];
            const suffix = TEAM_NAME_SUFFIXES[(idx * 3) % TEAM_NAME_SUFFIXES.length];
            const base = `${prefix} ${suffix} - ${club?.name || clubId} (Test ${idx + 1})`;
            let name = base;
            let bump = 2;
            while (takenNames.has(name.trim().toLowerCase())) name = `${base} #${bump++}`;
            takenNames.add(name.trim().toLowerCase());

            const teamId = 'team_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
            teamRows.push({
                id: teamId, club_id: clubId, name,
                description: `${club?.name || 'Klub'} uchun test jamoasi`,
                display_number: nextNum++
            });

            const teamSize = 4 + (idx % 3); // 4-6, same convention as buildTeamsSeed
            const rosterStart = (idx * teamSize * 7) % students.length;
            for (let mi = 0; mi < teamSize; mi++) {
                const student = students[(rosterStart + mi) % students.length];
                memberRows.push({
                    id: 'tm_' + Date.now().toString() + Math.random().toString(36).slice(2, 8),
                    team_id: teamId, user_id: student.id, role: mi === 0 ? 'captain' : 'member'
                });
            }
        }

        if (teamRows.length === 0) return [];
        const { error: teamsErr } = await supabase.from('teams').insert(teamRows);
        if (teamsErr) throw teamsErr;
        const { error: membersErr } = await supabase.from('team_members').insert(memberRows);
        if (membersErr) throw membersErr;
        await syncCoreDataFromSupabase();
        return teamRows.map(r => mapTeamFromSupabase(r));
    },
    // Adds one member to a real team - same shape the seed builder (buildTeamsSeed) already produces
    // ({id, teamId, userId, role, joinedAt}), just exposed as a real function so live flows (team
    // registration confirmation) can build a genuine roster instead of a throwaway synthetic object.
    addTeamMember: async (teamId, userId, role = 'member') => {
        const dbData = getDB();
        const existing = (dbData.teamMembers || []).find(tm => tm.teamId === teamId && tm.userId === userId);
        if (existing) return existing;

        // MANFAATLAR TO'QNASHUVI (izohi assertCanJoinClubCompetition ustida).
        //
        // Jamoa YAKUNLANMAGAN klub musobaqasida qatnashayotgan bo'lsa, unga
        // o'sha klubda lavozimdagi talabani qo'shib bo'lmaydi. Bu eng oson
        // aylanib o'tish yo'li edi: musobaqaga to'g'ridan-to'g'ri emas,
        // ishtirok etayotgan jamoa orqali kirish.
        const student = generateMockStudents().find(s => s.id === userId);
        (dbData.competitions || [])
            .filter(c => competitionClubId(c) && !isCompetitionFinished(c))
            .filter(c => (c.participants || []).some(p => p.id === teamId))
            .forEach(c => assertCanJoinClubCompetition(dbData, userId, c, student?.fullName));

        const id = 'tm_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
        const { data, error } = await supabase.from('team_members').insert({ id, team_id: teamId, user_id: userId, role }).select().single();
        if (error) throw error;
        await syncCoreDataFromSupabase();
        return mapTeamMemberFromSupabase(data);
    },
    // Materializes a confirmed team registration into a REAL db.teams/db.teamMembers record (captain +
    // every accepted teammate, with real userIds) instead of the old throwaway synthetic
    // {id:'team_'+Date.now(), name, membersCount} object - that synthetic shape was invisible to
    // getTeamById/getTeamMembers/inferTeamFaculty/getTeamCompetitionHistory (all key off real db.teams
    // ids), so a live-registered team's profile/history/faculty could never be resolved. Shared by
    // respondToTeamInvite and joinTeamByCode (their own surrounding confirm-threshold logic is
    // deliberately kept duplicated/in-sync per this file's existing convention - this piece is complex
    // enough to warrant one shared implementation instead).
    _materializeTeamFromRegistration: async (reg, acceptedCount) => {
        const dbData = getDB();
        const list = reg.activityType === 'competition' ? dbData.competitions : dbData.events;
        const activity = (list || []).find(a => a.id === reg.activityId);
        // Competitions carry clubId via contextType/contextId; plain events carry it directly as
        // `clubId` - using the competition-only field unconditionally meant every team materialized
        // from an EVENT registration got clubId:undefined, silently orphaning it from
        // db.getClubTeams(clubId) (invisible in the club's profile/team list/future team-based
        // competitions).
        const clubId = reg.activityType === 'competition'
            ? (activity?.contextType === 'club' ? activity.contextId : undefined)
            : activity?.clubId;
        const team = await db.createTeam({
            clubId,
            name: reg.teamName || 'Jamoa',
            description: activity ? `"${activity.name}" uchun ro'yxatdan o'tgan jamoa` : "Ro'yxatdan o'tgan jamoa"
        }, reg.id);
        await db.addTeamMember(team.id, reg.userId, 'captain');
        for (const m of (reg.teamMembers || []).filter(m => m.status === 'accepted')) {
            await db.addTeamMember(team.id, m.userId, 'member');
        }
        return { id: team.id, name: team.name, membersCount: acceptedCount };
    },
    // Cross-competition history for a real team - every competition it's listed as a participant in,
    // with its real rank/score from that competition's own db.getLeaderboard (never a second/derived
    // scoring computation). match_play competitions use a parallel, non-leaderboard data path (see
    // computeGroupStandings) - out of scope for this lookup, so they're returned with rank/totalScore
    // both null rather than guessed. Used by TeamRosterAndHistory.jsx.
    getTeamCompetitionHistory: (teamId) => {
        const data = getDB();
        return (data.competitions || [])
            .filter(c => (c.participants || []).some(p => p.id === teamId))
            .map(c => {
                if (c.scoringMethod === 'match_play') {
                    return { competitionId: c.id, name: c.name, rank: null, totalScore: null, startDate: c.startDate };
                }
                const row = db.getLeaderboard(c.id).find(r => r.participant.id === teamId);
                return { competitionId: c.id, name: c.name, rank: row?.rank ?? null, totalScore: row?.totalScore ?? null, startDate: c.startDate };
            });
    },

    // =========================================================================
    // KLUB YUTUQLARI
    //
    // BU YERDA NIMA O'ZGARDI: ilgari yutuqlar TO'QIB CHIQARILGAN edi - har
    // klub o'z id raqamidan kelib chiqib 1-3 ta soxta yozuv olardi va ular
    // bazadagi birorta musobaqa yoki hujjat bilan bog'lanmagan edi.
    //
    // Endi ikkita HAQIQIY manba bor:
    //   ICHKI  - berilgan rasmiy hujjatlardan avtomatik chiqadi. Saqlanmaydi,
    //            har chaqiruvda qayta hisoblanadi: manba bitta bo'lishi kerak,
    //            aks holda reestrda bitta, klub sahifasida boshqa haqiqat
    //            paydo bo'lardi.
    //   TASHQI - `clubAchievements` jadvalida, dalil va tasdiqlash bilan.
    //
    // Izohi src/config/clubAchievements.js va supabase/club_achievements.sql da.
    // =========================================================================
    isClubAchievementsBackendReady: () => getDB().clubAchievementsBackendReady !== false,

    // ICHKI YUTUQLAR - berilgan hujjatlardan.
    //
    // Klubga bog'lanishning IKKI yo'li bor va ikkalasi ham kerak:
    //   1. hujjat KLUB JAMOASIGA berilgan (jamoaning `clubId` si mos)
    //   2. hujjat klub A'ZOSIGA berilgan
    // Faqat ikkinchisiga qarash jamoa yutuqlarini yo'qotardi (jamoa hujjati
    // jamoa nomiga beriladi, a'zoning nomiga emas).
    getDerivedClubAchievements: (clubId) => {
        const dbData = getDB();
        const memberIds = new Set(
            (dbData.memberships || []).filter(m => String(m.clubId) === String(clubId)).map(m => m.userId)
        );
        const clubTeamIds = new Set(
            (dbData.teams || []).filter(t => String(t.clubId) === String(clubId)).map(t => t.id)
        );
        const teamNameById = new Map((dbData.teams || []).map(t => [t.id, t.name]));
        const students = new Map(generateMockStudents().map(s => [s.id, s]));

        // Hujjat qaysi tadbir/musobaqadan - daraja o'sha yerdan olinadi.
        const levelOf = (doc) => {
            if (!doc.sourceId) return null;
            const source = doc.sourceType === 'competition'
                ? (dbData.competitions || []).find(c => String(c.id) === String(doc.sourceId))
                : (dbData.events || []).find(e => String(e.id) === String(doc.sourceId));
            return source?.level || null;
        };

        const rows = [];
        (dbData.documents || []).forEach(doc => {
            if (doc.status !== 'issued') return;
            const place = doc.place == null ? null : Number(doc.place);
            // Sovrinsiz hujjat (tashakkurnoma, ishtirok sertifikati) yutuq
            // emas - u ishtirokni tasdiqlaydi, natijani emas.
            if (![1, 2, 3].includes(place)) return;

            const isClubTeam = doc.isTeam && clubTeamIds.has(doc.recipientId);
            const recipients = [doc.recipientId, ...((doc.members || []).map(m => m.userId))].filter(Boolean);
            const clubRecipients = recipients.filter(id => memberIds.has(id));
            if (!isClubTeam && clubRecipients.length === 0) return;

            rows.push({
                id: `derived_${doc.id}`,
                source: 'internal',
                status: 'approved',
                clubId: String(clubId),
                scope: isClubTeam ? 'team' : 'member',
                teamId: isClubTeam ? doc.recipientId : null,
                teamName: isClubTeam ? (teamNameById.get(doc.recipientId) || doc.teamName || null) : (doc.teamName || null),
                studentIds: isClubTeam ? [] : clubRecipients,
                studentNames: isClubTeam ? [] : clubRecipients.map(id => students.get(id)?.fullName || id),
                title: doc.activityName || 'Musobaqa',
                organizer: doc.organization || ORGANIZATION_NAME,
                level: levelOf(doc),
                place,
                date: doc.issuedAt || doc.createdAt || null,
                // Dalil - hujjatning O'ZI. Uni qayta yuklash shart emas va
                // uning raqami bo'yicha QR orqali tekshirib ko'rish mumkin.
                documentId: doc.id,
                registrationNumber: doc.registrationNumber || null,
                evidenceFileName: null,
            });
        });
        return rows;
    },

    // TASHQI YUTUQLAR - saqlangan yozuvlar.
    getStoredClubAchievements: (clubId, { includeAllStatuses = false } = {}) =>
        (getDB().clubAchievements || [])
            .filter(a => String(a.clubId) === String(clubId))
            .filter(a => includeAllStatuses || a.status === PUBLIC_ACHIEVEMENT_STATUS),

    // IKKALASI BIRGA - klub sahifasi shuni ko'rsatadi.
    //
    // `includeAllStatuses` faqat boshqaruvchi uchun: koordinator o'z
    // klubining kutilayotgan va qaytarilgan yozuvlarini ko'rishi kerak,
    // tashqi odam esa faqat tasdiqlanganini.
    getClubAchievements: (clubId, { includeAllStatuses = false } = {}) => sortAchievements([
        ...db.getDerivedClubAchievements(clubId),
        ...db.getStoredClubAchievements(clubId, { includeAllStatuses }),
    ]),

    // Jamoaning yutuqlari - klubnikiga o'xshash, lekin jamoa doirasida.
    getTeamAchievements: (teamId) => {
        const dbData = getDB();
        const team = (dbData.teams || []).find(t => t.id === teamId);
        if (!team) return [];
        return db.getClubAchievements(team.clubId)
            .filter(a => a.scope === 'team' && String(a.teamId) === String(teamId));
    },

    // Barcha tasdiqlash kutayotgan tashqi yutuqlar - Tasdiqlash navbati uchun.
    getPendingClubAchievements: () => {
        const dbData = getDB();
        const clubById = new Map((dbData.clubs || []).map(c => [String(c.id), c]));
        return (dbData.clubAchievements || [])
            .filter(a => a.status === 'pending')
            .map(a => ({ ...a, club: clubById.get(String(a.clubId)) || null }))
            .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    },

    // Tashqi yutuqni yuborish. Dalil fayli MAJBURIY va u yopiq omborga
    // yuklanadi - "fayl nomi" emas, faylning O'ZI saqlanadi, aks holda
    // tasdiqlovchi tekshiradigan narsa qolmasdi.
    submitClubAchievement: async ({
        clubId, scope, teamId = null, studentIds = [],
        title, organizer, level, place, date,
        evidenceFile = null, note = '', submittedBy,
    }) => {
        await assertAuthenticated();
        const problem = validateExternalAchievement({
            title, organizer, level, place, date, scope, teamId, studentIds,
            evidenceFileName: evidenceFile?.name || null,
        });
        if (problem) throw new Error(problem);

        const dbData = getDB();
        const id = 'cach_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const ext = (evidenceFile.name?.split('.').pop() || 'pdf').toLowerCase();
        const path = `${clubId}/${id}.${ext}`;

        const { error: upErr } = await supabase.storage
            .from('club-achievements')
            .upload(path, evidenceFile, { contentType: evidenceFile.type || 'application/octet-stream', upsert: false });
        if (upErr) throw new Error('Hujjat yuklanmadi: ' + upErr.message);

        const students = new Map(generateMockStudents().map(s => [s.id, s]));
        const record = {
            id, clubId: String(clubId),
            source: 'external', status: 'pending',
            scope,
            teamId: scope === 'team' ? teamId : null,
            teamName: scope === 'team'
                ? ((dbData.teams || []).find(t => t.id === teamId)?.name || null) : null,
            studentIds: scope === 'member' ? studentIds : [],
            studentNames: scope === 'member' ? studentIds.map(sid => students.get(sid)?.fullName || sid) : [],
            title: String(title).trim(),
            organizer: String(organizer).trim(),
            level, place: Number(place), date,
            note: String(note || '').trim(),
            evidenceFileName: evidenceFile.name,
            evidencePath: path,
            submittedBy, submittedAt: new Date().toISOString(),
            reviewedBy: null, reviewedAt: null, comment: '',
        };

        const { error } = await supabase.from('club_achievements').insert({
            id, club_id: record.clubId, status: record.status, data: record,
        });
        if (error) throw error;

        (dbData.clubAchievements = dbData.clubAchievements || []).push(record);
        saveDB(dbData);
        return record;
    },

    // Dalilni ko'rish - vaqtinchalik havola. Ombor yopiq: diplom nusxasi
    // ochiq internetda turmasligi kerak.
    getClubAchievementEvidenceUrl: async (evidencePath) => {
        if (!evidencePath) return null;
        const { data, error } = await supabase.storage
            .from('club-achievements')
            .createSignedUrl(evidencePath, 3600);
        if (error) return null;
        return data?.signedUrl || null;
    },

    // Tasdiqlash. UCHTA amal, ikkita emas - "qaytarish" ataylab bor:
    // hujjat noaniq bo'lsa, uni rad etish o'rniga to'ldirishga qaytarish
    // to'g'riroq. Rad etish va qaytarishda izoh MAJBURIY.
    reviewClubAchievement: async ({ achievementId, action, comment = '', reviewedBy }) => {
        await assertAuthenticated();
        const statusByAction = { approve: 'approved', return: 'returned', reject: 'rejected' };
        const status = statusByAction[action];
        if (!status) throw new Error("Noma'lum amal: " + action);
        if (status !== 'approved' && !String(comment || '').trim()) {
            throw new Error('Sababini yozing — koordinator nima qilishi kerakligini bilishi kerak');
        }

        const dbData = getDB();
        const record = (dbData.clubAchievements || []).find(a => a.id === achievementId);
        if (!record) throw new Error('Yutuq topilmadi');

        const patch = {
            status, comment: String(comment || '').trim(),
            reviewedBy, reviewedAt: new Date().toISOString(),
        };
        const { error } = await supabase.from('club_achievements')
            .update({ status, data: { ...record, ...patch }, updated_at: patch.reviewedAt })
            .eq('id', achievementId);
        if (error) throw error;

        Object.assign(record, patch);
        saveDB(dbData);
        return record;
    },

    deleteClubAchievement: async (achievementId) => {
        await assertAuthenticated();
        const dbData = getDB();
        const record = (dbData.clubAchievements || []).find(a => a.id === achievementId);
        if (!record) return false;

        const { error } = await supabase.from('club_achievements').delete().eq('id', achievementId);
        if (error) throw error;
        // Dalil fayli ham o'chiriladi - yozuvsiz qolgan fayl hech kimga
        // kerak emas va u shaxsiy hujjat.
        if (record.evidencePath) {
            await supabase.storage.from('club-achievements').remove([record.evidencePath]);
        }
        dbData.clubAchievements = dbData.clubAchievements.filter(a => a.id !== achievementId);
        saveDB(dbData);
        return true;
    },

    // EVENTS
    getEvents: () => getDB().events,
    // Approved-only - same reasoning as getClubCompetitions. Missing moderationStatus (any event fetched
    // before the moderation_status column existed) reads as approved.
    getPublicEvents: () => (getDB().events || []).filter(e => (e.moderationStatus || 'approved') === 'approved'),
    getClubEvents: (clubId) => getDB().events.filter(e => e.clubId === clubId && (e.moderationStatus || 'approved') === 'approved'),
    getPendingEventModerations: () => (getDB().events || []).filter(e => e.moderationStatus === 'pending'),
    reviewEventModeration: async (eventId, { action }) => {
        const updated = await db.updateEvent(eventId, { moderationStatus: action === 'approve' ? 'approved' : 'rejected' });
        // Tasdiqlangan payt - talaba uchun tadbir AYNAN SHU DAQIQADA paydo
        // bo'ladi, shuning uchun xabar shu yerda ketadi. Yaratilgan paytda
        // yuborilmagan edi (u paytda tadbir hali ko'rinmasdi).
        if (action === 'approve' && !updated?.linkedCompetitionId) {
            await db.announceActivity(eventId, 'event');
        }
        return updated;
    },
    // --- SPIKERLAR VA TADBIR DASTURI ---
    //
    // Xodim xonani band qilib, tadbir boshlanguncha to'ldiradigan narsalar:
    // chiqish qiluvchilarning F.I.Sh. va lavozimi (stol tablichkasi shundan
    // bosiladi) va dastur fayli.
    //
    // Spikerlar PLATFORMA FOYDALANUVCHILARI EMAS - ular ko'pincha tashqi
    // mehmon (vazirlik xodimi, boshqa universitet vakili). Shuning uchun ular
    // `profiles` bilan bog'lanmaydi, qo'lda yoziladi.
    setEventSpeakers: async (eventId, speakers) => {
        const clean = (speakers || [])
            .map(sp => ({
                id: sp.id || ('spk_' + Math.random().toString(36).slice(2, 9)),
                fullName: (sp.fullName || '').trim(),
                position: (sp.position || '').trim(),
            }))
            // Ikkalasi ham bo'sh qator saqlanmaydi - forma odatda bitta bo'sh
            // qator bilan ochiladi va u yozuvga tushib qolmasligi kerak.
            .filter(sp => sp.fullName || sp.position);
        return db.updateEvent(eventId, { speakers: clean });
    },

    // Dastur fayli. Bitta tadbirda BITTA dastur bo'ladi - yangisi eskisining
    // ustiga yoziladi (`upsert: true`) va eski fayl ombordan o'chiriladi.
    // Versiya tarixi ataylab yuritilmaydi: dastur tadbirgacha bir necha marta
    // o'zgaradi va har o'zgarishni saqlash omborni keraksiz to'ldirardi.
    uploadEventProgram: async ({ eventId, file, uploadedBy }) => {
        await assertAuthenticated();
        if (!file) throw new Error('Fayl tanlanmagan');

        const ext = (file.name?.split('.').pop() || 'pdf').toLowerCase();
        const filePath = `${eventId}/dastur.${ext}`;

        const { error: upErr } = await supabase.storage
            .from('event-documents')
            .upload(filePath, file, { contentType: file.type || 'application/octet-stream', upsert: true });
        if (upErr) {
            const missingBucket = /bucket not found/i.test(upErr.message || '');
            throw new Error(missingBucket
                ? "Fayl yuklanmadi: `event-documents` ombori topilmadi. "
                  + 'Supabase SQL Editor da `supabase/event_documents.sql` ni bir marta ishga tushiring.'
                : 'Fayl yuklanmadi: ' + upErr.message);
        }

        // Eski fayl boshqa kengaytmada bo'lsa (masalan .docx o'rniga .pdf
        // yuklandi) - u ombordagi joyida qolib ketardi. Shuning uchun yangi
        // yozuvdan farq qilsa, eskisi o'chiriladi.
        const previous = (getDB().events || []).find(e => e.id === eventId)?.programFile;
        if (previous?.filePath && previous.filePath !== filePath) {
            try { await supabase.storage.from('event-documents').remove([previous.filePath]); }
            catch (e) { console.warn("Eski dastur fayli o'chirilmadi:", e.message); }
        }

        return db.updateEvent(eventId, {
            programFile: {
                fileName: file.name,
                filePath,
                sizeLabel: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
                uploadedBy: uploadedBy || null,
                uploadedAt: new Date().toISOString(),
            },
        });
    },

    // Ombor YOPIQ, shuning uchun to'g'ridan-to'g'ri havola ishlamaydi -
    // vaqtinchalik imzolangan havola beriladi (bir soat).
    getEventProgramUrl: async (filePath) => {
        if (!filePath) return null;
        const { data, error } = await supabase.storage
            .from('event-documents').createSignedUrl(filePath, 3600);
        if (error) return null;
        return data?.signedUrl || null;
    },

    removeEventProgram: async (eventId) => {
        const current = (getDB().events || []).find(e => e.id === eventId)?.programFile;
        if (current?.filePath) {
            try { await supabase.storage.from('event-documents').remove([current.filePath]); }
            catch (e) { console.warn("Dastur fayli ombordan o'chirilmadi:", e.message); }
        }
        // Yozuv HAR HOLDA tozalanadi: fayl ombordan o'chmasa ham, ilovada
        // "ochib bo'lmaydigan dastur" osilib turmasligi kerak.
        return db.updateEvent(eventId, { programFile: null });
    },

    // Trivial club-scoped competition count, needed by the Clubs Directory card/profile stat row and
    // Statistika tab - competitions don't have their own per-club index, so this filters the flat list.
    // Approved-only (see createCompetition's moderationStatus) since every caller of this is a
    // public/student-facing surface or a public-facing analytics aggregate - a competition still awaiting
    // moderation shouldn't show up on a club's public profile, directory card, or coverage stats.
    getClubCompetitions: (clubId) => (getDB().competitions || [])
        .filter(c => c.contextType === 'club' && c.contextId === clubId && (c.moderationStatus || 'approved') === 'approved'),
    // Public wrapper around the internal findLocationConflict - lets creation forms show a live
    // "this room is already booked" warning before the user even tries to submit.
    checkLocationConflict: (location, startDateTime, excludeEventId = null, endDateTime = null) =>
        findLocationConflict(getDB(), location, startDateTime, excludeEventId, endDateTime),
    combineDateTime,
    // Public wrapper so registration UI (EventsCalendar.jsx) can gate its buttons with the exact
    // same open/close logic registerParticipant/registerForEvent enforce server-side.
    isRegistrationOpen: (record, startDateTime) => isRegistrationOpen(record, startDateTime),
    // Public wrapper for the 3-way state (RegistrationStatusBadge.jsx: not yet open / open / closed).
    getRegistrationWindowState: (record, startDateTime) => getRegistrationWindowState(record, startDateTime),
    createEvent: async (eventData) => {
        // actingRole opt-in, same convention as createCompetition - older callers that don't pass it keep
        // publishing immediately (moderation_status's own Postgres default is 'approved' anyway).
        const { actingRole, actingUsername, ...rest } = eventData;
        const dbData = getDB();
        if (rest.location && rest.date) {
                const conflict = findLocationConflict(
                dbData, rest.location, rest.date, null,
                rest.endTime ? `${String(rest.date).slice(0, 10)}T${rest.endTime}:00` : null
            );
            if (conflict) {
                throw Object.assign(new Error(`"${rest.location}" shu vaqtda band: "${conflict.title}" tadbiri uchun allaqachon band qilingan.`), { status: 409 });
            }
        }
        const windowIssue = findRegistrationWindowIssue(rest, { isNew: true });
        if (windowIssue) throw Object.assign(new Error(windowIssue), { status: 422 });
        const id = Date.now().toString();
        const { data, error } = await supabase.from('events').insert({
            id, club_id: rest.clubId, title: rest.title, description: rest.description,
            date: rest.date, end_time: rest.endTime || null,
            status: rest.status || 'upcoming', location: rest.location,
            location_type: rest.locationType, linked_competition_id: rest.linkedCompetitionId,
            registration_required: rest.registrationRequired, registration_type: rest.registrationType,
            max_participants: rest.maxParticipants, team_min_size: rest.teamMinSize,
            team_max_size: rest.teamMaxSize,
            team_composition_rule: rest.teamCompositionRule || 'mixed', team_course_rule: rest.teamCourseRule || 'mixed',
            waitlist_enabled: rest.waitlistEnabled,
            approval_required: rest.approvalRequired, registration_opens_at: rest.registrationOpensAt || null,
            registration_closes_at: rest.registrationClosesAt || null,
            participants: [], registrations: [], display_number: nextDisplayNumber(dbData.events),
            // TYUTOR ham to'g'ridan-to'g'ri e'lon qiladi. Sabab: uning tadbiri
            // faqat EKSKURSIYA va faqat o'z talabalari uchun bo'ladi, ustiga
            // umumiy kalendarda ko'rinadi va xona bandligiga tushadi. Nazorat
            // OSHKORALIK orqali - har ekskursiya uchun administratorga
            // murojaat qilish tyutorning ishini boshqa odamda tiqib qo'yardi.
            moderation_status: (!actingRole || actingRole === 'ADMINISTRATOR' || actingRole === 'TYUTOR')
                ? 'approved' : 'pending',
            // Tadbir turi va darajasi - ustunga tushmaydigan maydonlar `data` ichida.
            data: {
                ...(rest.eventType ? { eventType: rest.eventType } : {}),
                ...(rest.level ? { level: rest.level } : {}),
                // 11-mezon: tadbir ma'naviy-ma'rifiy sohagami. Tasnif tadbir
                // TURIDAN taxmin qilinmaydi - u shu yerda aniq belgilanadi.
                ...(rest.isSpiritual ? { isSpiritual: true } : {}),
                // Kim yaratgani - oshkoralikning asosi.
                ...(actingUsername ? { createdBy: actingUsername } : {}),
            }
        }).select().single();
        if (error) throw error;
        await syncCoreDataFromSupabase();
        // E'lon FAQAT tasdiqlangan tadbir uchun. Moderatsiyada turgan tadbir
        // talabaga hali ko'rinmaydi (getPublicEvents) - xabar yuborilsa, havola
        // mavjud bo'lmagan sahifaga olib borardi. Tasdiqlangach
        // `reviewEventModeration` o'zi yuboradi.
        //
        // Musobaqaga bog'langan tadbir O'TKAZIB YUBORILADI: u musobaqaning
        // kalendardagi soyasi, ya'ni bitta narsa uchun ikkita xabar kelardi.
        if (data.moderation_status === 'approved' && !data.linked_competition_id) {
            await db.announceActivity(id, 'event');
        }
        return mapEventFromSupabase(data);
    },
    updateEvent: async (id, updates) => {
        // Merge onto the CURRENT row before validating - `updates` here is often partial (callers only
        // ever set the fields they touched), so validating it alone could miss a conflict against an
        // unrelated existing field (e.g. editing just the title on an event whose date was already,
        // separately, misconfigured against its registration window).
        const current = (getDB().events || []).find(e => e.id === id) || {};
        const merged = { ...current, ...updates };
        const windowIssue = findRegistrationWindowIssue(merged);
        if (windowIssue) throw Object.assign(new Error(windowIssue), { status: 422 });

        // Editing could move an event onto a room/time someone else already holds — previously only
        // CREATION was guarded, so a clash introduced by an edit went through unnoticed. Only checked when
        // the edit actually touches scheduling, so unrelated edits (title, description) can't be blocked
        // by a pre-existing clash they didn't cause.
        if (['location', 'date', 'endTime'].some(k => k in updates) && merged.location && merged.date) {
            const conflict = findLocationConflict(
                getDB(), merged.location, merged.date, id,
                merged.endTime ? `${String(merged.date).slice(0, 10)}T${merged.endTime}:00` : null
            );
            if (conflict) {
                throw Object.assign(
                    new Error(`"${merged.location}" shu vaqtda band: "${conflict.title}".`),
                    { status: 409 }
                );
            }
        }
        const payload = {};
        if (updates.title !== undefined) payload.title = updates.title;
        if (updates.description !== undefined) payload.description = updates.description;
        if (updates.date !== undefined) payload.date = updates.date;
        if (updates.endTime !== undefined) payload.end_time = updates.endTime || null;
        if (updates.status !== undefined) payload.status = updates.status;
        if (updates.moderationStatus !== undefined) payload.moderation_status = updates.moderationStatus;
        if (updates.clubId !== undefined) payload.club_id = updates.clubId;
        if (updates.location !== undefined) payload.location = updates.location;
        if (updates.locationType !== undefined) payload.location_type = updates.locationType;
        if (updates.linkedCompetitionId !== undefined) payload.linked_competition_id = updates.linkedCompetitionId;
        if (updates.registrationRequired !== undefined) payload.registration_required = updates.registrationRequired;
        if (updates.registrationType !== undefined) payload.registration_type = updates.registrationType;
        if (updates.maxParticipants !== undefined) payload.max_participants = updates.maxParticipants;
        if (updates.teamMinSize !== undefined) payload.team_min_size = updates.teamMinSize;
        if (updates.teamMaxSize !== undefined) payload.team_max_size = updates.teamMaxSize;
        if (updates.teamCompositionRule !== undefined) payload.team_composition_rule = updates.teamCompositionRule;
        if (updates.teamCourseRule !== undefined) payload.team_course_rule = updates.teamCourseRule;
        if (updates.waitlistEnabled !== undefined) payload.waitlist_enabled = updates.waitlistEnabled;
        if (updates.approvalRequired !== undefined) payload.approval_required = updates.approvalRequired;
        if (updates.registrationOpensAt !== undefined) payload.registration_opens_at = updates.registrationOpensAt || null;
        if (updates.registrationClosesAt !== undefined) payload.registration_closes_at = updates.registrationClosesAt || null;
        if (updates.participants !== undefined) payload.participants = updates.participants;
        if (updates.registrations !== undefined) payload.registrations = updates.registrations;

        // Ustunga tushmaydigan maydonlar - tadbir turi, darajasi, ball sozlamasi,
        // e'lon va ball berilgan vaqtlari - `data` jsonb ichiga yoziladi. Ro'yxat
        // ATAYLAB aniq: noma'lum kalitlar jimgina bazaga tushib ketmasin.
        // `speakers` va `programFile` shu ro'yxatga QO'SHILISHI SHART: bu
        // ro'yxat `data` ustuniga yoziladigan maydonlarning oq ro'yxati va
        // unda bo'lmagan maydon jimgina tashlanardi - saqlagandek ko'rinib,
        // aslida hech narsa yozilmasdi.
        const LIFECYCLE_KEYS = ['eventType', 'level', 'isSpiritual', 'pointOverrides', 'pointsAwardedAt', 'announcedAt', 'speakers', 'programFile'];
        const dataPatch = {};
        LIFECYCLE_KEYS.forEach(k => { if (updates[k] !== undefined) dataPatch[k] = updates[k]; });
        if (Object.keys(dataPatch).length > 0) {
            const currentData = {};
            LIFECYCLE_KEYS.forEach(k => { if (current[k] !== undefined) currentData[k] = current[k]; });
            payload.data = { ...currentData, ...dataPatch };
        }

        const { data, error } = await supabase.from('events').update(payload).eq('id', id).select().single();
        if (error) throw error;
        await syncCoreDataFromSupabase();
        return mapEventFromSupabase(data);
    },

    // Tadbirni o'chirish.
    //
    // Musobaqada `deleteCompetition` bor edi, tadbirda esa yo'q - xato yaratilgan
    // tadbirni faqat tahrirlash mumkin edi.
    //
    // IKKI HOLATDA O'CHIRILMAYDI, chunki o'chirish ORQAGA QAYTMAYDIGAN zarar beradi:
    //   1. Ball berilgan bo'lsa - `social_score_transactions` da talabaning bali
    //      qoladi, lekin uning manbai yo'qoladi. Talaba "bu ball qayerdan?" degan
    //      savolga javob topmaydi.
    //   2. Rasmiy hujjat berilgan bo'lsa - sertifikat/diplomda ko'rsatilgan tadbir
    //      bazada bo'lmay qoladi.
    // Ikkalasida ham to'g'ri yo'l - tadbirni o'chirish emas, "bekor qilindi" deb
    // belgilash. Shuning uchun xato matni shuni aytadi.
    deleteEvent: async (id) => {
        await assertAuthenticated();
        const dbData = getDB();
        const event = (dbData.events || []).find(e => e.id === id);
        if (!event) throw new Error('Tadbir topilmadi');

        if (event.pointsAwardedAt) {
            throw Object.assign(
                new Error("Bu tadbir uchun ball berilgan - o'chirib bo'lmaydi. Buning o'rniga tadbirni bekor qilingan deb belgilang."),
                { status: 409 }
            );
        }
        const protocol = (dbData.protocols || []).find(p => p.activityType === 'event' && p.activityId === id);
        if (protocol) {
            const issued = (dbData.documents || []).filter(d => d.protocolId === protocol.id && d.status === 'issued');
            if (issued.length > 0) {
                throw Object.assign(
                    new Error(`Bu tadbir bo'yicha ${issued.length} ta rasmiy hujjat berilgan - o'chirib bo'lmaydi.`),
                    { status: 409 }
                );
            }
        }

        // Faqat aynan shu tadbirga tegishli yozuvlar. Bog'langan musobaqa (agar
        // bo'lsa) O'CHIRILMAYDI - u o'z hayotiga ega, o'zining sahifasi va
        // natijalari bor; uni o'chirish alohida qaror.
        const { error } = await supabase.from('events').delete().eq('id', id);
        if (error) throw error;
        await Promise.all([
            supabase.from('registrations').delete().eq('activity_id', id).eq('activity_type', 'event'),
            supabase.from('activity_attendance').delete().eq('activity_id', id).eq('activity_type', 'event'),
            supabase.from('activity_attendance_locks').delete().eq('activity_id', id).eq('activity_type', 'event'),
            supabase.from('activity_attendance_audit_logs').delete().eq('activity_id', id).eq('activity_type', 'event'),
            supabase.from('activity_tasks').delete().eq('activity_id', id).eq('activity_type', 'event'),
            supabase.from('activity_reports').delete().eq('activity_id', id).eq('activity_type', 'event'),
            supabase.from('notifications').delete().eq('ref_id', id).eq('ref_type', 'event'),
        ]);

        // Vakolatlar faqat localStorage'da yashaydi (Supabase jadvali yo'q).
        dbData.eventDelegations = (dbData.eventDelegations || []).filter(d => d.eventId !== id);
        saveDB(dbData);

        await syncCoreDataFromSupabase();
        return { deleted: true };
    },

    // SCORING
    getScores: () => getDB().scores,
    getUserTotalScore: (userId) => {
        const scores = getDB().scores.filter(s => s.userId === userId);
        return scores.reduce((sum, s) => sum + s.points, 0);
    },
    addScore: (userId, points, reason, sourceId) => {
        const dbData = getDB();
        const newScore = { id: Date.now().toString(), userId, points, reason, sourceId, date: new Date().toISOString() };
        dbData.scores.push(newScore);
        saveDB(dbData);
        return newScore;
    },

    // CERTIFICATES
    getCertificates: () => getDB().certificates,
    getUserCertificates: (userId) => getDB().certificates.filter(c => c.userId === userId),
    // Sertifikatlarni turli odamlar beradi, shuning uchun ular umumiy bazada
    // turishi shart: aks holda har kim faqat o'zi bergan sertifikatni ko'radi
    // va ayni talabaga ikkinchi marta berilishi hech qayerda sezilmaydi.
    // `id` ham vaqt tamg'asi emas: ikki odam bir soniyada bersa, bittasi
    // ikkinchisining yozuvini almashtirib yuborardi.
    issueCertificate: async (certData) => {
        const dbData = getDB();
        const newCert = {
            ...certData,
            id: 'cert_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            displayNumber: nextDisplayNumber(dbData.certificates),
            issueDate: new Date().toISOString()
        };
        dbData.certificates.push(newCert);
        await persistCompetitionRow('issued_certificates', newCert, {
            student_id: newCert.userId != null ? String(newCert.userId) : null
        });
        saveDB(dbData);
        return newCert;
    },

    // TOURNAMENT SCORING MODULE API
    getCompetitions: () => {
        const data = getDB();
        return data.competitions || [];
    },
    getCompetitionById: (id) => {
        const data = getDB();
        return (data.competitions || []).find(c => c.id === id);
    },
    // Student/public-facing surfaces (EventsCalendar.jsx, ClubProfilePage.jsx, ClubsDirectoryPage.jsx)
    // should use THIS instead of getCompetitions() - hides anything still awaiting moderation or already
    // rejected. Missing moderationStatus (every competition created before this field existed) counts as
    // approved, so nothing already-live silently disappears. Admin-facing views (CompetitionsManagementTab,
    // ApprovalsTab, AdminDashboard) keep using getCompetitions() - they need to see pending ones too.
    getPublicCompetitions: () => {
        const data = getDB();
        return (data.competitions || []).filter(c => (c.moderationStatus || 'approved') === 'approved');
    },
    getPendingCompetitionModerations: () => (getDB().competitions || []).filter(c => c.moderationStatus === 'pending'),
    reviewCompetitionModeration: async (compId, { action, reviewer, comment = '' }) => {
        const updated = await db.updateCompetition(compId, {
            moderationStatus: action === 'approve' ? 'approved' : 'rejected',
            moderationReviewedBy: reviewer,
            moderationReviewedAt: new Date().toISOString(),
            moderationComment: comment
        });
        // Musobaqa talabaga aynan tasdiqlangandan keyin ko'rinadi - e'lon ham
        // shu paytda ketadi.
        if (action === 'approve') await db.announceActivity(compId, 'competition');
        return updated;
    },
    createCompetition: async (compData) => {
        // Mock "backend" authorization boundary: db.js is the single mutation point regardless of
        // which UI calls it, so this is where a coordinator-vs-club check belongs in an app with no
        // real HTTP layer. Opt-in - only enforced when the caller passes actingRole (the wizard does;
        // older/other callers that don't pass it are unaffected, so nothing existing breaks).
        const { actingUsername, actingRole, ...rest } = compData;
        if (actingRole && actingRole !== 'ADMINISTRATOR' && rest.contextType === 'club' && rest.contextId) {
            const memberships = (getDB().memberships || []).filter(m => m.userId === actingUsername);
            const hasClubAccess = memberships.some(m => m.clubId === rest.contextId && ['coordinator', 'head_coordinator'].includes(m.role));
            if (!hasClubAccess) {
                throw Object.assign(new Error('403 Forbidden: club mismatch'), { status: 403 });
            }
        }

        const dbData = getDB();
        if (rest.location && rest.startDate) {
            const conflict = findLocationConflict(
                dbData, rest.location, combineDateTime(rest.startDate, rest.startTime), null,
                rest.endTime ? combineDateTime(rest.startDate, rest.endTime) : null
            );
            if (conflict) {
                throw Object.assign(new Error(`"${rest.location}" shu vaqtda band: "${conflict.title}" tadbiri uchun allaqachon band qilingan.`), { status: 409 });
            }
        }
        const windowIssue = findRegistrationWindowIssue(rest, { isNew: true });
        if (windowIssue) throw Object.assign(new Error(windowIssue), { status: 422 });
        const id = 'comp_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
        const data = {
            ...rest,
            displayNumber: nextDisplayNumber(dbData.competitions),
            currentRound: 1,
            createdAt: new Date().toISOString(),
            // Competition Passport hero card's "Owner" field - previously actingUsername was destructured
            // above only for the authorization check and then discarded. Existing competitions created
            // before this field existed (including the two seeded rows) simply have ownerUsername:
            // undefined - callers must render a fallback, never assume it's set.
            ownerUsername: actingUsername || null,
            // Admin-created (or actingRole not passed - every pre-existing caller) publishes immediately,
            // unchanged from before this existed. Anyone else's competition starts hidden from students
            // until an admin reviews it in "Tasdiqlash" (ApprovalsTab.jsx) - see
            // reviewCompetitionModeration/getPendingCompetitionModerations and getPublicCompetitions.
            moderationStatus: (!actingRole || actingRole === 'ADMINISTRATOR') ? 'approved' : 'pending'
        };
        const { data: row, error } = await supabase.from('competitions').insert({ id, data }).select().single();
        if (error) throw error;
        await syncCoreDataFromSupabase();
        // Faqat tasdiqlangani e'lon qilinadi - tasdiqlanmagani talabaga
        // ko'rinmaydi (getPublicCompetitions), demak havolasi ham ochilmasdi.
        // Moderatsiyadan o'tgach `reviewCompetitionModeration` yuboradi.
        if (data.moderationStatus === 'approved') {
            await db.announceActivity(id, 'competition');
        }
        return mapCompetitionFromSupabase(row);
    },
    // Whole-object JSONB column - merge client-side (fetch current, spread updates, write the WHOLE
    // object back) since Supabase's plain .update() replaces a jsonb column wholesale, it doesn't merge.
    updateCompetition: async (id, updates) => {
        const current = (getDB().competitions || []).find(c => c.id === id);
        if (!current) return null;
        const { id: _drop, ...currentData } = current;
        const newData = { ...currentData, ...updates };
        // Only re-validate when THIS update actually touches a registration-window field - updateCompetition
        // is the generic write path for everything (guruh toggles, tiebreak, scores...), so blindly
        // validating on every call would let a pre-existing (created before this check existed)
        // misconfiguration block an unrelated, innocent action.
        if (['registrationOpensAt', 'registrationClosesAt', 'startDate', 'startTime'].some(k => k in updates)) {
            const windowIssue = findRegistrationWindowIssue(newData);
            if (windowIssue) throw Object.assign(new Error(windowIssue), { status: 422 });
        }
        // Same reasoning as updateEvent: an edit that moves the competition onto an occupied room/time was
        // previously unguarded. Scoped to scheduling edits so routine writes (scores, groups, judges) are
        // never blocked by a clash they didn't introduce.
        if (['location', 'startDate', 'startTime', 'endTime'].some(k => k in updates) && newData.location && newData.startDate) {
            const conflict = findLocationConflict(
                getDB(), newData.location,
                combineDateTime(newData.startDate, newData.startTime), id,
                newData.endTime ? combineDateTime(newData.startDate, newData.endTime) : null
            );
            if (conflict) {
                throw Object.assign(
                    new Error(`"${newData.location}" shu vaqtda band: "${conflict.title}".`),
                    { status: 409 }
                );
            }
        }
        const { data: row, error } = await supabase.from('competitions').update({ data: newData }).eq('id', id).select().single();
        if (error) throw error;
        await syncCoreDataFromSupabase();
        return mapCompetitionFromSupabase(row);
    },
    // Self-registration for open competitions (Tadbirlar Kalendari's "Ishtirok etish / Ro'yxatdan
    // o'tish" flow). `registeredBy` is the acting student's username, used to dedupe (one active
    // registration per student per competition) and to detect "already registered" on re-render.
    // `options.bypassWindow` - for admin "Qo'lda qo'shish"/override paths, which by definition add someone
    // OUTSIDE the normal registration window (that's the whole point of an override). Every self-service
    // path leaves it off and is gated exactly as before.
    //
    // Persists through db.updateCompetition (real Supabase write) rather than a local saveDB: a competition
    // lives in the `competitions` jsonb column, and every caller here follows up with
    // syncCoreDataFromSupabase, which REPLACES dbData.competitions wholesale from the server - so a
    // local-only push silently vanished a moment later, and the added participant never appeared.
    registerParticipant: async (compId, participant, registeredBy, options = {}) => {
        const dbData = getDB();
        const comp = (dbData.competitions || []).find(c => c.id === compId);
        if (!comp) throw new Error('Musobaqa topilmadi');
        if ((comp.moderationStatus || 'approved') !== 'approved') throw new Error("Bu musobaqa hali admin tomonidan tasdiqlanmagan");
        if (!options.bypassWindow) {
            const startDateTime = combineDateTime(comp.startDate, comp.startTime);
            const now = new Date();
            if (!isRegistrationOpen(comp, startDateTime, now)) {
                const opensAt = comp.registrationOpensAt ? new Date(comp.registrationOpensAt) : null;
                throw new Error(opensAt && now < opensAt ? "Ro'yxatdan o'tish hali boshlanmagan" : "Ro'yxatdan o'tish muddati tugagan");
            }
        }
        const participants = comp.participants || [];
        if (participants.some(p => p.registeredBy === registeredBy)) return comp;

        // MANFAATLAR TO'QNASHUVI (izohi assertCanJoinClubCompetition ustida).
        //
        // `participant` ikki xil bo'ladi: yakka talaba yoki JAMOA yozuvi.
        // Jamoada har a'zo alohida tekshiriladi - aks holda lavozimdagi
        // talaba jamoa ichida yashiringancha musobaqaga kirib qolardi.
        const asTeam = (dbData.teams || []).find(t => t.id === participant.id);
        if (asTeam) {
            (dbData.teamMembers || [])
                .filter(m => m.teamId === asTeam.id)
                .forEach(m => {
                    const student = generateMockStudents().find(s => s.id === m.userId);
                    assertCanJoinClubCompetition(dbData, m.userId, comp, student?.fullName);
                });
        } else if (participant.id) {
            assertCanJoinClubCompetition(dbData, participant.id, comp, participant.fullName);
        }

        const nextParticipants = [...participants, { ...participant, registeredBy }];

        // Deliberately NOT db.updateCompetition here: that runs a full 20-table syncCoreDataFromSupabase
        // afterwards, and every caller of this function already syncs once itself — so going through it
        // doubled the round-trips on every registration (painfully visible when adding teams in a loop).
        // The whole-object jsonb merge is the same; the local mirror is patched in place instead of
        // re-fetched, which leaves exactly the state a sync would have produced.
        const { id: _drop, ...currentData } = comp;
        const { error } = await supabase.from('competitions')
            .update({ data: { ...currentData, participants: nextParticipants } })
            .eq('id', compId);
        if (error) throw error;
        comp.participants = nextParticipants;
        saveDB(dbData);
        return comp;
    },
    // Mirrors registerParticipant but for a plain event with no linked competition - kept as a
    // separate `registrations` array (not the pre-existing `participants`, which is attendance/
    // scoring data read by EventManagement.jsx's handleAssignScore and the club-score aggregation
    // in GlobalClubsRankings.jsx - reusing it here would corrupt that unrelated scoring path).
    getEventRegistrations: (eventId) => (getDB().events || []).find(e => e.id === eventId)?.registrations || [],
    registerForEvent: async (eventId, participant, registeredBy) => {
        const event = (getDB().events || []).find(e => e.id === eventId);
        if (!event) throw new Error('Tadbir topilmadi');
        const now = new Date();
        if (!isRegistrationOpen(event, event.date, now)) {
            const opensAt = event.registrationOpensAt ? new Date(event.registrationOpensAt) : null;
            throw new Error(opensAt && now < opensAt ? "Ro'yxatdan o'tish hali boshlanmagan" : "Ro'yxatdan o'tish muddati tugagan");
        }
        const registrations = event.registrations || [];
        const alreadyRegistered = registrations.some(p => p.registeredBy === registeredBy);
        if (alreadyRegistered) return event;
        return db.updateEvent(eventId, {
            registrations: [...registrations, { ...participant, registeredBy, registeredAt: now.toISOString() }]
        });
    },

    // ============================================================================================
    // UNIFIED REGISTRATION LAYER - one Registration model reused identically for events AND
    // competitions (Tadbir/Trening/Seminar/Workshop -> events; Musobaqa/Turnir/Moot court/Munozara ->
    // competitions via their existing presets). Deliberately layered ON TOP of registerParticipant/
    // registerForEvent above rather than replacing them - comp.participants/event.registrations stay
    // the roster Live Scoring & CompetitionResultsCenter read, untouched. This layer adds capacity,
    // waitlist, team invites, approval, and admin-override - none of which existed before.
    // ============================================================================================

    getRegistrationsForActivity: (activityId, activityType) =>
        (getDB().registrations || []).filter(r => r.activityId === activityId && r.activityType === activityType),

    // Unfiltered accessor - needed by cross-club/university-wide analytics (src/utils/clubAnalytics.js)
    // that aggregate across every activity at once rather than one at a time. Read-only, same array the
    // per-activity getter above already exposes.
    getAllRegistrations: () => getDB().registrations || [],

    getRegistrationForUser: (activityId, activityType, userId) =>
        (getDB().registrations || []).find(r =>
            r.activityId === activityId && r.activityType === activityType && r.userId === userId && r.status !== 'cancelled'
        ) || null,

    // The single unified entry point for registering on ANY activity type. `options`:
    // { participantType: 'individual'|'team', teamName, invitedUserIds: [], minTeamSize }.
    // Individual registrations sync the roster (registerParticipant/registerForEvent) immediately;
    // team registrations only sync once accepted invites + captain reach minTeamSize (see
    // respondToTeamInvite) - matches "minimum son to'lsa jamoa aktiv bo'ladi".
    registerForActivity: async (activityId, activityType, participant, registeredBy, options = {}) => {
        const dbData = getDB();
        const list = activityType === 'competition' ? dbData.competitions : dbData.events;
        const activity = (list || []).find(a => a.id === activityId);
        if (!activity) throw new Error(activityType === 'competition' ? 'Musobaqa topilmadi' : 'Tadbir topilmadi');
        if ((activity.moderationStatus || 'approved') !== 'approved') {
            throw new Error(activityType === 'competition' ? "Bu musobaqa hali admin tomonidan tasdiqlanmagan" : "Bu tadbir hali admin tomonidan tasdiqlanmagan");
        }

        const existingActive = (dbData.registrations || []).find(r =>
            r.activityId === activityId && r.activityType === activityType && r.userId === registeredBy && r.status !== 'cancelled'
        );
        if (existingActive) return existingActive;

        const startDateTime = activityType === 'competition' ? combineDateTime(activity.startDate, activity.startTime) : activity.date;
        if (!isRegistrationOpen(activity, startDateTime)) {
            const opensAt = activity.registrationOpensAt ? new Date(activity.registrationOpensAt) : null;
            throw new Error(opensAt && new Date() < opensAt ? "Ro'yxatdan o'tish hali boshlanmagan" : "Ro'yxatdan o'tish muddati tugagan");
        }

        // Faculty/course eligibility (see checkEligibility above) - applies identically to team
        // registration since the `participant` passed here is always the CAPTAIN's own profile (see
        // ActivityRegistrationPanel.jsx's buildParticipant()/handleRegisterTeam), so a captain whose own
        // faculty/course doesn't qualify is blocked from creating the team, same as an individual signup.
        checkEligibility(activity, participant);

        // MANFAATLAR TO'QNASHUVI - musobaqalarda (izohi assertCanJoinClubCompetition
        // ustida). Kapitan ham, taklif qilinganlar ham SHU YERDA tekshiriladi:
        // jamoa yig'ilgandan keyin xato chiqsa, kapitan nima uchun to'xtaganini
        // tushunmasdi.
        if (activityType === 'competition') {
            assertCanJoinClubCompetition(dbData, participant.id, activity, participant.fullName);
            (options.invitedUserIds || []).forEach(userId => {
                const student = generateMockStudents().find(s => s.id === userId);
                assertCanJoinClubCompetition(dbData, userId, activity, student?.fullName);
            });
        }

        // Team composition ("faqat bitta fakultetdan/kursdan") - checked against every INVITED member up
        // front, at team-creation time, rather than only when each invitee later accepts (respondToTeamInvite
        // already re-checks there too, since a captain could otherwise circumvent this by inviting from the
        // roster-picker directly - this is just the earliest, most useful point to fail fast).
        if (options.participantType === 'team' && activity.teamCompositionRule === 'single_faculty' && (options.invitedUserIds || []).length) {
            const studentById = new Map(generateMockStudents().map(s => [s.id, s]));
            for (const uid of options.invitedUserIds) {
                checkTeamComposition(activity, participant, studentById.get(uid));
            }
        }

        // Max team size - teamMaxSize was already captured by the wizard/settings form but never
        // enforced here before; minTeamSize's existing check is untouched.
        if (options.participantType === 'team' && activity.teamMaxSize) {
            const proposedSize = (options.invitedUserIds || []).length + 1; // +1 = the registering captain
            if (proposedSize > activity.teamMaxSize) {
                throw new Error(`Jamoa hajmi ${activity.teamMaxSize} kishidan oshmasligi kerak (hozir ${proposedSize})`);
            }
        }
        // Admin-configured team-size FLOOR (activity.teamMinSize) vs this captain's OWN chosen
        // confirmation threshold (options.minTeamSize, "necha kishi qabul qilsa jamoam faollashadi") -
        // two different things that used to never cross-check: a captain could set their own threshold
        // below the admin's real floor, so admin's "Jamoa min. hajmi" was purely decorative. Now a
        // captain can't set a personal threshold under the admin's configured minimum.
        if (options.participantType === 'team' && activity.teamMinSize && options.minTeamSize && options.minTeamSize < activity.teamMinSize) {
            // Xabar QAYSI MAYDON xato ekanini aniq aytadi. Ilgari u shunchaki
            // "Jamoa kamida N kishidan iborat bo'lishi kerak" derdi va bu
            // adashtirardi: kapitan 5 kishi qo'shib turib shu xabarni ko'rar,
            // a'zolar soni yetarli bo'lgani uchun nima noto'g'ri ekanini
            // topolmasdi. Aslida gap butunlay boshqa maydonda edi.
            throw new Error(
                `"Minimal jamoa hajmi" ${options.minTeamSize} qilib qo'yilgan, lekin tashkilotchi eng kam ` +
                `${activity.teamMinSize} kishini talab qiladi. A'zolar soni yetarli — faqat shu maydonni ` +
                `${activity.teamMinSize} yoki undan katta qiling.`
            );
        }

        // Proactive platform-wide team-name uniqueness check - the REAL db.createTeam (the authoritative
        // guard) only runs much later, once enough teammates accept and the team actually materializes
        // (_materializeTeamFromRegistration). Without this early check, a captain could type a name,
        // wait days for teammates to accept, and only then discover the name was already taken. Checked
        // here so it fails immediately, at submission time, like every other team-registration validation.
        if (options.participantType === 'team' && options.teamName && isTeamNameTaken(dbData, options.teamName)) {
            throw new Error(`"${options.teamName.trim()}" nomli jamoa allaqachon ro'yxatdan o'tgan - boshqa nom tanlang`);
        }

        const activeCount = (dbData.registrations || []).filter(r =>
            r.activityId === activityId && r.activityType === activityType && r.status === 'registered'
        ).length;
        const isFull = activity.maxParticipants != null && activeCount >= activity.maxParticipants;
        if (isFull && !activity.waitlistEnabled) throw new Error("To'lgan - bo'sh joy yo'q");
        const status = isFull ? 'waitlisted' : 'registered';

        const isTeam = options.participantType === 'team';
        // Individual + confirmed seat: sync the roster now via the existing, already-tested entry
        // points. Teams and waitlisted registrations don't touch the roster until confirmed/promoted.
        if (status === 'registered' && !isTeam) {
            if (activityType === 'competition') await db.registerParticipant(activityId, participant, registeredBy);
            else await db.registerForEvent(activityId, participant, registeredBy);
        }

        const registration = {
            id: 'reg_' + Date.now().toString() + Math.random().toString(36).slice(2, 8),
            activityId, activityType, userId: registeredBy,
            participantSnapshot: participant,
            participantType: isTeam ? 'team' : 'individual',
            teamName: isTeam ? (options.teamName || null) : null,
            teamMembers: isTeam ? (options.invitedUserIds || []).map(userId => ({ userId, status: 'pending', invitedAt: new Date().toISOString(), respondedAt: null })) : [],
            minTeamSize: isTeam ? (options.minTeamSize || null) : null,
            // Additive: metadata-only file attachments (same disclosed convention as
            // TournamentReviewStep.jsx/ClubDocumentsTab.jsx - never persists real file bytes) and a
            // short shareable code for teams, so a captain can invite by code instead of only searching
            // teammates one-by-one via StudentPicker (see joinTeamByCode below).
            attachments: options.attachments || [],
            inviteCode: isTeam ? ('TEAM-' + Math.random().toString(36).slice(2, 8).toUpperCase()) : null,
            status,
            approvalRequired: !!activity.approvalRequired,
            approvalStatus: activity.approvalRequired ? 'pending' : null,
            addedByOverride: false,
            overrideReason: null,
            overrideByUserId: null,
            isRepeat: !!options.isRepeat,
            offerExpiresAt: null,
            realTeamId: null,
            teamConfirmedAt: null
        };

        const created = await insertRegistrationToSupabase(registration);
        if (isTeam) {
            const activityTitle = activity.title || activity.name || '';
            for (const m of created.teamMembers) {
                await addNotificationToSupabase({
                    userId: m.userId,
                    type: 'team_invite',
                    title: 'Jamoaga taklif',
                    // Xabar TADBIR NOMINI ham aytadi: "sizni jamoaga taklif
                    // qilishdi" degan xabar qaysi tadbir haqida ekanini
                    // aytmasa, talaba nimaga rozi bo'layotganini bilmaydi.
                    message: `Sizni "${created.teamName || 'jamoa'}" jamoasiga taklif qilishdi`
                        + (activityTitle ? ` — ${activityTitle}.` : '.')
                        + ' Taklifni qabul qilishingiz kutilmoqda.',
                    // `refId` FAOLIYATNI ko'rsatadi, ro'yxat yozuvini emas.
                    // Ilgari bu yerda `refType: 'registration'` turardi, lekin
                    // `notificationLink` da bunday tur umuman yo'q edi - ya'ni
                    // xabar bosilganda HECH NARSA bo'lmasdi va talaba qabul
                    // qilish tugmasini o'zi qidirib topishga majbur edi.
                    // Faoliyat sahifasida esa taklif va tugma allaqachon bor.
                    refId: activityId,
                    refType: activityType,
                });
            }
        }
        await syncCoreDataFromSupabase();
        return created;
    },

    // Self-service sibling of registerForActivity's team path: instead of typing a team name and
    // inviting members one by one (who each have to accept before the roster syncs), a captain of an
    // ALREADY-REAL team (db.getTeamsForUser) attaches that existing team directly. Real member roster,
    // real eligibility (checked against EVERY member, not just the captain - matches the
    // respondToTeamInvite/joinTeamByCode fix), real teamMaxSize/teamMinSize checks against the team's
    // actual size (fixed, not a captain-chosen threshold - there's no "how many need to accept" concept
    // for a team that already exists). Goes through the exact same registration-window/capacity/waitlist
    // rules as registerForActivity - this is not an override/bypass.
    registerExistingTeam: async (activityId, activityType, teamId, registeredBy) => {
        const dbData = getDB();
        const list = activityType === 'competition' ? dbData.competitions : dbData.events;
        const activity = (list || []).find(a => a.id === activityId);
        if (!activity) throw new Error(activityType === 'competition' ? 'Musobaqa topilmadi' : 'Tadbir topilmadi');

        const team = (dbData.teams || []).find(t => t.id === teamId);
        if (!team) throw new Error('Jamoa topilmadi');
        const members = (dbData.teamMembers || []).filter(m => m.teamId === teamId);
        // Built early (not just for the eligibility loop below) so the captain-only error can name the
        // real captain (F.I.Sh. + ID) instead of a generic "faqat kapitan" message - a non-captain member
        // trying to attach the team needs to know WHO to ask, not just that they can't do it themselves.
        const studentById = new Map(db.getMockStudents().map(s => [s.id, s]));
        if (!members.some(m => m.userId === registeredBy && m.role === 'captain')) {
            const captainMember = members.find(m => m.role === 'captain');
            const captainStudent = captainMember ? studentById.get(captainMember.userId) : null;
            const captainLabel = captainStudent
                ? `${captainStudent.fullName} (ID: ${captainStudent.studentId || captainStudent.id})`
                : (captainMember?.userId || "aniqlanmagan");
            throw new Error(`Faqat jamoa kapitani jamoani ro'yxatdan o'tkaza oladi - bu jamoaning kapitani: ${captainLabel}`);
        }

        const existingActive = (dbData.registrations || []).find(r =>
            r.activityId === activityId && r.activityType === activityType && r.userId === registeredBy && r.status !== 'cancelled'
        );
        if (existingActive) return existingActive;

        const startDateTime = activityType === 'competition' ? combineDateTime(activity.startDate, activity.startTime) : activity.date;
        if (!isRegistrationOpen(activity, startDateTime)) {
            const opensAt = activity.registrationOpensAt ? new Date(activity.registrationOpensAt) : null;
            throw new Error(opensAt && new Date() < opensAt ? "Ro'yxatdan o'tish hali boshlanmagan" : "Ro'yxatdan o'tish muddati tugagan");
        }

        members.forEach(m => checkEligibility(activity, studentById.get(m.userId)));

        if (activity.teamMaxSize && members.length > activity.teamMaxSize) {
            throw new Error(`Jamoa hajmi ${activity.teamMaxSize} kishidan oshmasligi kerak (hozir ${members.length})`);
        }
        if (activity.teamMinSize && members.length < activity.teamMinSize) {
            throw new Error(`Jamoa kamida ${activity.teamMinSize} kishidan iborat bo'lishi kerak (hozir ${members.length})`);
        }

        const activeCount = (dbData.registrations || []).filter(r =>
            r.activityId === activityId && r.activityType === activityType && r.status === 'registered'
        ).length;
        const isFull = activity.maxParticipants != null && activeCount >= activity.maxParticipants;
        if (isFull && !activity.waitlistEnabled) throw new Error("To'lgan - bo'sh joy yo'q");
        const status = isFull ? 'waitlisted' : 'registered';

        const participant = { id: team.id, name: team.name, membersCount: members.length };
        if (status === 'registered') {
            if (activityType === 'competition') await db.registerParticipant(activityId, participant, registeredBy);
            else await db.registerForEvent(activityId, participant, registeredBy);
        }

        const registration = {
            id: 'reg_' + Date.now().toString() + Math.random().toString(36).slice(2, 8),
            activityId, activityType, userId: registeredBy,
            participantSnapshot: participant,
            participantType: 'team', teamName: team.name, teamMembers: [], minTeamSize: null,
            // Marks this as an already-real team (vs. the invite-built kind) - confirmWaitlistOffer reads
            // this to materialize the REAL team directly instead of running the accepted-count/minTeamSize
            // logic that only makes sense for a team still being assembled via invites.
            realTeamId: team.id,
            teamConfirmedAt: status === 'registered' ? new Date().toISOString() : null,
            attachments: [], inviteCode: null,
            status,
            approvalRequired: !!activity.approvalRequired,
            approvalStatus: activity.approvalRequired ? 'pending' : null,
            addedByOverride: false, overrideReason: null, overrideByUserId: null,
            isRepeat: false, offerExpiresAt: null
        };

        const created = await insertRegistrationToSupabase(registration);
        await syncCoreDataFromSupabase();
        return created;
    },

    // A team member accepts/declines an invite. Once accepted count (+captain) reaches minTeamSize,
    // the roster is synced for the first time - this is the moment "jamoa aktiv bo'ladi".
    respondToTeamInvite: async (registrationId, userId, accept) => {
        const dbData = getDB();
        const reg = (dbData.registrations || []).find(r => r.id === registrationId);
        if (!reg) throw new Error("Ro'yxatga olish topilmadi");
        const member = (reg.teamMembers || []).find(m => m.userId === userId);
        if (!member) throw new Error("Taklif topilmadi");
        // Same restriction check the captain already goes through (checkEligibility) - previously only
        // enforced at the captain's own registration, so an eligible captain could invite a teammate from
        // any faculty/course into a restricted competition and it would silently go through.
        if (accept) {
            const list = reg.activityType === 'competition' ? dbData.competitions : dbData.events;
            const activity = (list || []).find(a => a.id === reg.activityId);
            const student = generateMockStudents().find(s => s.id === userId);
            if (activity && student) {
                checkEligibility(activity, student);
                checkTeamComposition(activity, reg.participantSnapshot, student);
                // Taklifni qabul qilish ham ishtirok - shu klubda lavozimda
                // bo'lgan talaba jamoa orqali ham kira olmaydi.
                if (reg.activityType === 'competition') {
                    assertCanJoinClubCompetition(dbData, userId, activity, student.fullName);
                }
            }
        }
        const updatedTeamMembers = reg.teamMembers.map(m =>
            m.userId === userId ? { ...m, status: accept ? 'accepted' : 'declined', respondedAt: new Date().toISOString() } : m
        );
        const wasAlreadyConfirmed = reg.teamConfirmedAt != null;
        const acceptedCount = updatedTeamMembers.filter(m => m.status === 'accepted').length + 1; // +1 for the captain
        const nowConfirmed = reg.minTeamSize && acceptedCount >= reg.minTeamSize;
        const shouldMaterialize = accept && nowConfirmed && !wasAlreadyConfirmed && reg.status === 'registered';

        await updateRegistrationInSupabase(registrationId, {
            teamMembers: updatedTeamMembers,
            ...(shouldMaterialize ? { teamConfirmedAt: new Date().toISOString() } : {})
        });

        if (shouldMaterialize) {
            const teamParticipant = await db._materializeTeamFromRegistration({ ...reg, teamMembers: updatedTeamMembers }, acceptedCount);
            if (reg.activityType === 'competition') await db.registerParticipant(reg.activityId, teamParticipant, reg.userId);
            else await db.registerForEvent(reg.activityId, teamParticipant, reg.userId);
            await updateRegistrationInSupabase(registrationId, { realTeamId: teamParticipant.id });
        }

        // SARDORGA xabar. Ilgari u hech narsa olmasdi: jamoasi to'ldimi yoki
        // kimdir rad etdimi - buni bilish uchun o'zi tadbir sahifasini ochib
        // ko'rishi kerak edi. Taklif yuborib qo'yib unutish esa juda oson, va
        // o'shanda jamoa jimgina faollashmay qolardi.
        try {
            const responderName = generateMockStudents().find(s => s.id === userId)?.fullName
                || db.getSyncedProfiles().find(p => p.username === userId)?.fullName
                || userId;
            const teamLabel = reg.teamName || 'jamoangiz';
            await addNotificationToSupabase({
                userId: reg.userId,
                type: shouldMaterialize ? 'success' : (accept ? 'info' : 'warning'),
                title: shouldMaterialize ? 'Jamoa tasdiqlandi' : 'Jamoa taklifiga javob',
                message: shouldMaterialize
                    ? `"${teamLabel}" to'ldi — ${acceptedCount} a'zo. Jamoa ro'yxatga qo'shildi.`
                    : `${responderName} ${accept ? 'taklifni qabul qildi' : 'taklifni rad etdi'}. `
                      + `"${teamLabel}": ${acceptedCount}/${reg.minTeamSize || '?'} a'zo.`,
                refId: reg.activityId,
                refType: reg.activityType,
            });
        } catch (e) {
            // Xabar ketmagani javobni bekor qilmasligi kerak - a'zoning
            // qarori asosiy ish, xabar qo'shimcha.
            console.warn('Sardorga xabar yuborilmadi:', e.message);
        }

        await syncCoreDataFromSupabase();
        return (getDB().registrations || []).find(r => r.id === registrationId);
    },

    // Additive alternative to the StudentPicker-based invite flow above: a captain shares `inviteCode`
    // (generated per-team in registerForActivity) and a teammate joins directly instead of being
    // searched-and-added. Joining this way is immediate acceptance (the joiner opted in themselves),
    // unlike a picker-invite which starts 'pending' until the invitee responds. Enforces the same
    // teamMaxSize check registerForActivity already does, and reuses the exact same roster-sync-on-
    // confirm logic respondToTeamInvite already has (kept in sync deliberately, not shared code, same
    // idiom as this file's other small duplicated checks).
    joinTeamByCode: async (code, participant) => {
        const dbData = getDB();
        const reg = (dbData.registrations || []).find(r => r.inviteCode === code && r.status !== 'cancelled');
        if (!reg) throw new Error("Taklif kodi topilmadi yoki bekor qilingan");
        // `participant` here is always ActivityRegistrationPanel.jsx's buildParticipant() shape
        // ({id: user.username, fullName, faculty, course, ...}) - it has no `.username` field. This used
        // to compare/store `participant.username` (always undefined), so the "already a member" guard
        // never actually matched and every join silently stored `userId: undefined` in teamMembers.
        if (reg.userId === participant.id || (reg.teamMembers || []).some(m => m.userId === participant.id)) {
            return reg; // already captain or already a member - idempotent
        }
        const list = reg.activityType === 'competition' ? dbData.competitions : dbData.events;
        const activity = (list || []).find(a => a.id === reg.activityId);
        checkEligibility(activity || {}, participant);
        checkTeamComposition(activity || {}, reg.participantSnapshot, participant);
        // Kod orqali qo'shilish ham taklifni qabul qilish bilan bir xil -
        // taqiq boshqa eshikdan aylanib o'tilmasin.
        if (activity && reg.activityType === 'competition') {
            assertCanJoinClubCompetition(dbData, participant.id, activity, participant.fullName);
        }
        const proposedSize = (reg.teamMembers || []).length + 1 + 1; // existing members + captain + joiner
        if (activity?.teamMaxSize && proposedSize > activity.teamMaxSize) {
            throw new Error(`Jamoa hajmi ${activity.teamMaxSize} kishidan oshmasligi kerak`);
        }
        const updatedTeamMembers = [...(reg.teamMembers || []), { userId: participant.id, status: 'accepted', invitedAt: new Date().toISOString(), respondedAt: new Date().toISOString() }];
        const wasAlreadyConfirmed = reg.teamConfirmedAt != null;
        const acceptedCount = updatedTeamMembers.filter(m => m.status === 'accepted').length + 1; // +1 captain
        const nowConfirmed = reg.minTeamSize && acceptedCount >= reg.minTeamSize;
        const shouldMaterialize = nowConfirmed && !wasAlreadyConfirmed && reg.status === 'registered';

        await updateRegistrationInSupabase(reg.id, {
            teamMembers: updatedTeamMembers,
            ...(shouldMaterialize ? { teamConfirmedAt: new Date().toISOString() } : {})
        });

        if (shouldMaterialize) {
            const teamParticipant = await db._materializeTeamFromRegistration({ ...reg, teamMembers: updatedTeamMembers }, acceptedCount);
            if (reg.activityType === 'competition') await db.registerParticipant(reg.activityId, teamParticipant, reg.userId);
            else await db.registerForEvent(reg.activityId, teamParticipant, reg.userId);
            await updateRegistrationInSupabase(reg.id, { realTeamId: teamParticipant.id });
        }
        await syncCoreDataFromSupabase();
        return (getDB().registrations || []).find(r => r.id === reg.id);
    },

    // Lazy-evaluated waitlist promotion (called whenever a waitlist is read/rendered - this is a
    // client-only mock app with no real background timer, same style as isRegistrationOpen's
    // on-read evaluation). If the head-of-queue's 24h offer has expired unconfirmed, it's cancelled
    // and the next entry is offered instead.
    promoteFromWaitlist: async (activityId, activityType) => {
        const dbData = getDB();
        const waitlist = (dbData.registrations || [])
            .filter(r => r.activityId === activityId && r.activityType === activityType && r.status === 'waitlisted')
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        if (waitlist.length === 0) return null;

        const head = waitlist[0];
        const now = new Date();
        if (!head.offerExpiresAt) {
            const offerExpiresAt = new Date(now.getTime() + 24 * 3600000).toISOString();
            await updateRegistrationInSupabase(head.id, { offerExpiresAt });
            await addNotificationToSupabase({
                userId: head.userId,
                type: 'waitlist_offer',
                title: "Navbatdan joy bo'shadi",
                message: "Sizga ro'yxatdan o'tish uchun joy taklif qilindi. 24 soat ichida tasdiqlang.",
                refId: head.id,
                refType: 'registration',
                expiresAt: offerExpiresAt
            });
            await syncCoreDataFromSupabase();
            return { ...head, offerExpiresAt };
        }
        if (now > new Date(head.offerExpiresAt)) {
            await updateRegistrationInSupabase(head.id, { status: 'cancelled' });
            await syncCoreDataFromSupabase();
            return db.promoteFromWaitlist(activityId, activityType);
        }
        return head;
    },

    // Turns an offered waitlist slot into a confirmed seat (student clicks "Tasdiqlash" on the offer).
    confirmWaitlistOffer: async (registrationId, participant) => {
        const dbData = getDB();
        const reg = (dbData.registrations || []).find(r => r.id === registrationId);
        if (!reg) throw new Error("Ro'yxatga olish topilmadi");
        if (reg.status !== 'waitlisted') return reg;
        if (reg.offerExpiresAt && new Date() > new Date(reg.offerExpiresAt)) throw new Error('Taklif muddati tugagan');
        await updateRegistrationInSupabase(registrationId, { status: 'registered', offerExpiresAt: null });

        // Team registrations never sync the roster immediately (see registerForActivity's own
        // `status === 'registered' && !isTeam` gate) - a fresh team only syncs once minTeamSize is
        // reached via respondToTeamInvite/joinTeamByCode. This used to skip that rule and push the
        // CAPTAIN'S OWN individual profile as if it were the whole team, losing every real teammate and
        // never creating a resolvable db.teams record. Now it follows the exact same
        // accept-count/materialize logic those two functions already use - a teammate could have already
        // accepted while this registration sat on the waitlist (nothing blocked that), so check right
        // away instead of waiting for another accept that may never come.
        if (reg.participantType === 'team') {
            // An already-real team (registerExistingTeam) has no accept-count/minTeamSize concept - its
            // roster is fixed the moment it's attached, so it materializes unconditionally instead of
            // waiting on an acceptedCount threshold that doesn't apply to it.
            if (reg.realTeamId) {
                if (!reg.teamConfirmedAt) {
                    await updateRegistrationInSupabase(registrationId, { teamConfirmedAt: new Date().toISOString() });
                    const team = db.getTeamById(reg.realTeamId);
                    const teamParticipant = { id: team.id, name: team.name, membersCount: db.getTeamMembers(team.id).length };
                    if (reg.activityType === 'competition') await db.registerParticipant(reg.activityId, teamParticipant, reg.userId);
                    else await db.registerForEvent(reg.activityId, teamParticipant, reg.userId);
                }
                await syncCoreDataFromSupabase();
                return (getDB().registrations || []).find(r => r.id === registrationId);
            }
            const acceptedCount = (reg.teamMembers || []).filter(m => m.status === 'accepted').length + 1; // +1 captain
            const nowConfirmed = reg.minTeamSize && acceptedCount >= reg.minTeamSize;
            if (nowConfirmed && !reg.teamConfirmedAt) {
                await updateRegistrationInSupabase(registrationId, { teamConfirmedAt: new Date().toISOString() });
                const teamParticipant = await db._materializeTeamFromRegistration(reg, acceptedCount);
                if (reg.activityType === 'competition') await db.registerParticipant(reg.activityId, teamParticipant, reg.userId);
                else await db.registerForEvent(reg.activityId, teamParticipant, reg.userId);
                await updateRegistrationInSupabase(registrationId, { realTeamId: teamParticipant.id });
            }
            await syncCoreDataFromSupabase();
            return (getDB().registrations || []).find(r => r.id === registrationId);
        }

        if (reg.activityType === 'competition') await db.registerParticipant(reg.activityId, participant || reg.participantSnapshot, reg.userId);
        else await db.registerForEvent(reg.activityId, participant || reg.participantSnapshot, reg.userId);
        await syncCoreDataFromSupabase();
        return (getDB().registrations || []).find(r => r.id === registrationId);
    },

    // Lets a registration's OWNER (the captain, for a team; the student themself, for individual) release
    // their own not-yet-finalized registration. Concrete gap this closes: unlike a waitlist offer, which
    // auto-expires after 24h (promoteFromWaitlist), a team registration whose invitees never respond (or
    // all decline) previously had no way out at all - it permanently occupied a maxParticipants slot
    // (activeCount counts any status:'registered' row regardless of whether the team ever actually
    // filled). Deliberately scoped to registrations that haven't synced the real roster yet - cancelling
    // one that's already a real participant/materialized team would need to also unwind that roster
    // entry, a separate, bigger operation this doesn't attempt.
    cancelRegistration: async (registrationId, userId) => {
        const reg = (getDB().registrations || []).find(r => r.id === registrationId);
        if (!reg) throw new Error("Ro'yxatga olish topilmadi");
        if (reg.userId !== userId) throw new Error("Faqat o'zingizning ro'yxatingizni bekor qila olasiz");
        if (reg.status === 'cancelled') return reg;
        if (reg.participantType === 'team' && reg.teamConfirmedAt) {
            throw new Error("Jamoa allaqachon tasdiqlangan - bekor qilish uchun tashkilotchiga murojaat qiling");
        }
        if (reg.participantType === 'individual' && reg.status === 'registered') {
            throw new Error("Ro'yxatdan o'tish allaqachon faollashtirilgan - bekor qilish uchun tashkilotchiga murojaat qiling");
        }
        const updated = await updateRegistrationInSupabase(registrationId, { status: 'cancelled' });
        await syncCoreDataFromSupabase();
        return updated;
    },

    // TALABANING JAMOA BO'YICHA OCHIQ HOLATLARI — bitta manba.
    //
    // To'rt joy shu bir xil ma'lumotga tayanadi: kalendardagi belgi, bosh
    // sahifadagi kartochka, menyudagi raqam va faoliyat sahifasidagi ro'yxat.
    // Har biri o'zicha hisoblaganida, ular bir-biridan chetga chiqib ketardi -
    // kalendarda belgi turib, kartochkada ko'rinmasligi mumkin edi.
    //
    // `daysLeft` - ro'yxat YOPILISHIGA qolgan kun. Muddat qo'yilmagan bo'lsa
    // faoliyat boshlanishi olinadi: amalda o'shanda ham ro'yxat yopiladi.
    getTeamAttention: (username) => {
        if (!username) return { asCaptain: [], asInvitee: [] };
        const dbData = getDB();
        const now = Date.now();
        const DAY = 24 * 60 * 60 * 1000;

        const open = (dbData.registrations || []).filter(r =>
            r.participantType === 'team' && r.status !== 'cancelled' && !r.teamConfirmedAt
        );

        const shape = (r) => {
            const list = r.activityType === 'competition' ? dbData.competitions : dbData.events;
            const activity = (list || []).find(a => a.id === r.activityId);
            if (!activity) return null;
            const startsAt = r.activityType === 'competition'
                ? combineDateTime(activity.startDate, activity.startTime)
                : activity.date;
            const deadline = activity.registrationClosesAt || startsAt;
            const ms = deadline ? new Date(deadline).getTime() - now : null;
            const pending = (r.teamMembers || []).filter(m => m.status === 'pending');
            return {
                registrationId: r.id,
                activityId: r.activityId,
                activityType: r.activityType,
                activityTitle: activity.title || activity.name || '',
                teamName: r.teamName || null,
                accepted: (r.teamMembers || []).filter(m => m.status === 'accepted').length + 1,
                need: r.minTeamSize || 0,
                inviteCode: r.inviteCode || null,
                pendingMembers: pending,
                // `null` - muddat noma'lum. Bu 0 emas: "muddat yo'q" va
                // "muddat bugun" butunlay boshqa narsa va ularni aralashtirsak
                // ekranda qizil belgi asossiz chiqib ketardi.
                daysLeft: ms == null ? null : Math.floor(ms / DAY),
            };
        };

        const asCaptain = open
            .filter(r => r.userId === username)
            .map(shape)
            .filter(x => x && x.need > x.accepted);

        const asInvitee = open
            .filter(r => (r.teamMembers || []).some(m => m.userId === username && m.status === 'pending'))
            .map(shape)
            .filter(Boolean);

        return { asCaptain, asInvitee };
    },

    // SARDOR JAVOB BERMAGANLARNI TURTADI.
    //
    // Shu paytgacha sardor jamoasi to'lmaganini BILAR, lekin ilovada hech
    // narsa qila olmasdi: xabar kelardi, ro'yxat ko'rinardi, tugma yo'q edi.
    // Yagona yo'l - ilovadan tashqarida (Telegram, og'zaki) eslatish.
    //
    // KUNIGA BIR MARTA. Cheklov `notifications` jadvalining o'zidan
    // hisoblanadi - yangi ustun qo'shilmaydi. Busiz sardor tugmani ketma-ket
    // bosib, a'zoni bezovta qilib qo'yishi mumkin edi va eslatma o'z
    // ta'sirini yo'qotardi.
    nudgePendingTeamMembers: async (registrationId, actingUsername) => {
        const dbData = getDB();
        const reg = (dbData.registrations || []).find(r => r.id === registrationId);
        if (!reg) throw new Error("Ro'yxatga olish topilmadi");
        if (reg.userId !== actingUsername) throw new Error('Faqat jamoa sardori eslatma yubora oladi');
        if (reg.teamConfirmedAt) throw new Error('Jamoa allaqachon tasdiqlangan');

        const list = reg.activityType === 'competition' ? dbData.competitions : dbData.events;
        const activity = (list || []).find(a => a.id === reg.activityId);
        const title = activity ? (activity.title || activity.name || '') : '';
        const teamLabel = reg.teamName || 'jamoa';
        const NUDGE_TITLE = 'Jamoa taklifi — eslatma';
        const DAY = 24 * 60 * 60 * 1000;

        const pending = (reg.teamMembers || []).filter(m => m.status === 'pending');
        if (pending.length === 0) return { sent: 0, skipped: 0 };

        const recent = new Set(
            (dbData.notifications || [])
                .filter(n => n.title === NUDGE_TITLE && n.refId === reg.activityId
                    && n.createdAt && (Date.now() - new Date(n.createdAt).getTime()) < DAY)
                .map(n => n.userId)
        );

        let sent = 0;
        let skipped = 0;
        for (const m of pending) {
            if (recent.has(m.userId)) { skipped++; continue; }
            try {
                await addNotificationToSupabase({
                    userId: m.userId, type: 'team_invite', title: NUDGE_TITLE,
                    message: `Sardor eslatmoqda: "${teamLabel}" jamoasiga taklifingiz javobsiz`
                        + (title ? ` — ${title}.` : '.'),
                    refId: reg.activityId, refType: reg.activityType,
                });
                sent++;
            } catch (e) {
                console.warn('Eslatma yuborilmadi:', m.userId, e.message);
            }
        }
        if (sent > 0) await syncCoreDataFromSupabase();
        return { sent, skipped };
    },

    // TO'LMAGAN JAMOANI HAL QILISH — ro'yxat yopilgandan keyin.
    //
    // MUAMMO: taklif qilinganlar javob bermasa, jamoa TASDIQLANMAY qolardi va
    // uni hech narsa qo'yib yubormasdi (navbat taklifi 24 soatda o'zi tugaydi,
    // bunda esa muddat umuman yo'q edi). Natijada bo'sh jamoa JOYNI band qilib
    // turardi: `maxParticipants` hisobida sanaladi, ya'ni boshqa odam yozila
    // olmasdi va navbatdagi ko'tarilmasdi. Tadbir o'tib ketgandan keyin ham
    // o'sha yerda osilib qolaverardi - o'chmasdi, arxivga ham tushmasdi.
    //
    // QARORNI IKKI TOMONGA AJRATADI:
    //   qabul qilganlar tashkilotchi belgilagan eng kam songa YETSA -> jamoa
    //       tasdiqlanadi va qatnashadi. Kapitan o'z chegarasini tashkilotchi
    //       talabidan YUQORI qo'ygan bo'lishi mumkin; muddat tugaganda esa
    //       to'g'ri o'lchov tashkilotchining talabi bo'ladi, kapitanning
    //       shaxsiy niyati emas.
    //   YETMASA -> yozuv bekor qilinadi, joy bo'shaydi, navbatdagi ko'tariladi.
    //
    // Har ikki holatda ham SABAB BILAN xabar boradi: jimgina yo'qolgan
    // ro'yxat odamni tadbir kuni kutilmagan holatda qoldiradi.
    //
    // Vaqt bo'yicha emas, KO'RILGANDA ishlaydi (`promoteFromWaitlist` bilan bir
    // xil naqsh): loyihada fon vazifasi yo'q, shuning uchun faoliyat sahifasi
    // ochilganda bir marta chaqiriladi.
    settleStalledTeams: async (activityId, activityType) => {
        const dbData = getDB();
        const list = activityType === 'competition' ? dbData.competitions : dbData.events;
        const activity = (list || []).find(a => a.id === activityId);
        if (!activity) return { confirmed: 0, cancelled: 0 };

        // FAQAT ro'yxat yopilgandan keyin. Ochiq turganda a'zolar hali javob
        // berishlari mumkin - erta bekor qilish ularning huquqini olib qo'yardi.
        const startDateTime = activityType === 'competition'
            ? combineDateTime(activity.startDate, activity.startTime)
            : activity.date;
        if (isRegistrationOpen(activity, startDateTime)) return { confirmed: 0, cancelled: 0 };

        const stalled = (dbData.registrations || []).filter(r =>
            r.activityId === activityId && r.activityType === activityType &&
            r.participantType === 'team' && r.status !== 'cancelled' && !r.teamConfirmedAt
        );
        if (stalled.length === 0) return { confirmed: 0, cancelled: 0 };

        const floor = Math.max(2, Number(activity.teamMinSize) || 2);
        const activityTitle = activity.title || activity.name || '';
        let confirmed = 0;
        let cancelled = 0;

        for (const reg of stalled) {
            const accepted = (reg.teamMembers || []).filter(m => m.status === 'accepted').length + 1;
            const teamLabel = reg.teamName || 'Jamoa';
            try {
                if (accepted >= floor) {
                    await updateRegistrationInSupabase(reg.id, { teamConfirmedAt: new Date().toISOString() });
                    const teamParticipant = await db._materializeTeamFromRegistration(reg, accepted);
                    if (activityType === 'competition') await db.registerParticipant(activityId, teamParticipant, reg.userId);
                    else await db.registerForEvent(activityId, teamParticipant, reg.userId);
                    await updateRegistrationInSupabase(reg.id, { realTeamId: teamParticipant.id });
                    confirmed++;
                    await addNotificationToSupabase({
                        userId: reg.userId, type: 'success', title: 'Jamoa tasdiqlandi',
                        message: `Ro'yxat yopildi. "${teamLabel}" ${accepted} a'zo bilan qatnashadi — ${activityTitle}.`,
                        refId: activityId, refType: activityType,
                    });
                } else {
                    await updateRegistrationInSupabase(reg.id, { status: 'cancelled' });
                    cancelled++;
                    // Kapitanga ham, javob bermaganlarga ham. A'zo o'zi
                    // javobsiz qoldirgani uchun jamoa qatnashmayotganini
                    // bilishi kerak - aks holda sabab noma'lum bo'lib qoladi.
                    const tell = [reg.userId, ...(reg.teamMembers || [])
                        .filter(m => m.status === 'pending').map(m => m.userId)];
                    for (const uid of [...new Set(tell)]) {
                        await addNotificationToSupabase({
                            userId: uid, type: 'warning', title: 'Jamoa to\'lmadi',
                            message: `"${teamLabel}" ${accepted}/${floor} a'zo bilan qoldi, shuning uchun `
                                + `${activityTitle} uchun ro'yxatdan o'tish bekor qilindi.`,
                            refId: activityId, refType: activityType,
                        });
                    }
                }
            } catch (e) {
                // Bitta jamoadagi xato qolganlarini to'xtatmasligi kerak.
                console.warn('Jamoa holati hal qilinmadi:', reg.id, e.message);
            }
        }

        await syncCoreDataFromSupabase();
        // Joy bo'shadi - navbatdagini shu zahoti ko'tarish kerak, aks holda
        // bo'shagan joy tadbirgacha bo'sh yotardi.
        if (cancelled > 0 && activity.waitlistEnabled) {
            await db.promoteFromWaitlist(activityId, activityType);
        }
        return { confirmed, cancelled };
    },

    // Admin/Management/club-coordinator "Qo'lda qo'shish" - bypasses the registration window entirely
    // (that's the point of an override) but still requires a reason and always leaves an audit trail.
    overrideAddParticipant: async (activityId, activityType, studentId, reason, addedByUserId) => {
        if (!reason) throw new Error('Sabab kiritilishi shart');
        const dbData = getDB();
        const list = activityType === 'competition' ? dbData.competitions : dbData.events;
        const activity = (list || []).find(a => a.id === activityId);
        if (!activity) throw new Error(activityType === 'competition' ? 'Musobaqa topilmadi' : 'Tadbir topilmadi');

        const student = generateMockStudents().find(s => s.id === studentId);
        const participant = activityType === 'competition'
            ? { id: studentId, fullName: student?.fullName || studentId, faculty: student?.faculty, course: student?.course, group: student?.group, studentId: student?.studentId }
            : { id: studentId, fullName: student?.fullName || studentId };

        // bypassWindow: an override exists precisely to add someone outside the normal window — without it
        // "Qo'lda qo'shish" failed with "Ro'yxatdan o'tish muddati tugagan" on any closed competition.
        if (activityType === 'competition') await db.registerParticipant(activityId, participant, studentId, { bypassWindow: true });
        else await db.registerForEvent(activityId, participant, studentId);

        const registration = {
            id: 'reg_' + Date.now().toString() + Math.random().toString(36).slice(2, 8),
            activityId, activityType, userId: studentId,
            participantSnapshot: participant,
            participantType: 'individual', teamName: null, teamMembers: [], minTeamSize: null,
            status: 'registered', approvalRequired: false, approvalStatus: null,
            addedByOverride: true, overrideReason: reason, overrideByUserId: addedByUserId,
            isRepeat: false, offerExpiresAt: null
        };
        const created = await insertRegistrationToSupabase(registration);
        await insertRegistrationAuditLog({ addedByUserId, addedStudentId: studentId, activityId, activityType, reason });
        await syncCoreDataFromSupabase();
        return created;
    },

    // Team-aware sibling of overrideAddParticipant, for activities where registrationType is
    // 'team'/'both' (debate_match, match_play, or any manually team-typed criteria_based/single_score
    // competition). overrideAddParticipant always built an individual-shaped participant even here -
    // pushing that into a team engine (e.g. DebateMatchesTab.jsx reads competition.participants expecting
    // {id,name} team objects) silently corrupted the roster. This adds an EXISTING real club team
    // instead (same {id,name,membersCount} shape _materializeTeamFromRegistration already produces) -
    // it does not create a brand-new ad-hoc team; pick "Test uchun jamoa yaratish" (createTestTeams) or
    // the normal club team flow first if the team doesn't exist yet. Immediately treated as confirmed
    // (teamConfirmedAt set) since admin is vouching for it directly, bypassing the normal
    // invite-acceptance threshold.
    overrideAddTeam: async (activityId, activityType, teamId, reason, addedByUserId) => {
        if (!reason) throw new Error('Sabab kiritilishi shart');
        const dbData = getDB();
        const list = activityType === 'competition' ? dbData.competitions : dbData.events;
        const activity = (list || []).find(a => a.id === activityId);
        if (!activity) throw new Error(activityType === 'competition' ? 'Musobaqa topilmadi' : 'Tadbir topilmadi');
        const team = (dbData.teams || []).find(t => t.id === teamId);
        if (!team) throw new Error('Jamoa topilmadi');
        return db._finalizeOverrideTeamRegistration(activityId, activityType, team.id, reason, addedByUserId);
    },

    // Admin creates a brand-new real team (name + members) directly, then adds it - for when no existing
    // db.teams record fits (the sibling gap to overrideAddTeam, which only ever picks an EXISTING team).
    // Mirrors the captain-side "Yangi jamoa" registration flow's shape, just immediate (real db.createTeam
    // + db.addTeamMember, no invite/accept wait) since admin is directly asserting membership - same
    // "admin vouches directly" reasoning overrideAddTeam already uses.
    overrideCreateTeam: async (activityId, activityType, teamName, memberUserIds, reason, addedByUserId) => {
        if (!reason) throw new Error('Sabab kiritilishi shart');
        if (!teamName?.trim()) throw new Error('Jamoa nomi kiritilishi shart');
        if (!memberUserIds || memberUserIds.length === 0) throw new Error("Kamida bitta a'zo tanlanishi shart");
        const dbData = getDB();
        const list = activityType === 'competition' ? dbData.competitions : dbData.events;
        const activity = (list || []).find(a => a.id === activityId);
        if (!activity) throw new Error(activityType === 'competition' ? 'Musobaqa topilmadi' : 'Tadbir topilmadi');
        // Same event-vs-competition clubId resolution fix as _materializeTeamFromRegistration.
        const resolvedClubId = activityType === 'competition'
            ? (activity.contextType === 'club' ? activity.contextId : undefined)
            : activity.clubId;
        const team = await db.createTeam({
            clubId: resolvedClubId, name: teamName.trim(),
            description: activity.name ? `"${activity.name}" uchun qo'lda qo'shilgan jamoa` : "Qo'lda qo'shilgan jamoa"
        });
        for (let idx = 0; idx < memberUserIds.length; idx++) {
            await db.addTeamMember(team.id, memberUserIds[idx], idx === 0 ? 'captain' : 'member');
        }
        return db._finalizeOverrideTeamRegistration(activityId, activityType, team.id, reason, addedByUserId);
    },

    // Shared tail of overrideAddTeam/overrideCreateTeam - registers the real team as a participant and
    // records the override registration + audit log entry. Immediately confirmed (teamConfirmedAt set)
    // since admin is vouching for the team directly, bypassing the normal invite-acceptance threshold.
    _finalizeOverrideTeamRegistration: async (activityId, activityType, teamId, reason, addedByUserId) => {
        const dbData = getDB();
        const team = (dbData.teams || []).find(t => t.id === teamId);
        if (!team) throw new Error('Jamoa topilmadi');
        const membersCount = (dbData.teamMembers || []).filter(m => m.teamId === teamId).length;
        const participant = { id: team.id, name: team.name, membersCount };

        // Same override rationale as overrideAddParticipant above.
        if (activityType === 'competition') await db.registerParticipant(activityId, participant, team.id, { bypassWindow: true });
        else await db.registerForEvent(activityId, participant, team.id);

        const registration = {
            id: 'reg_' + Date.now().toString() + Math.random().toString(36).slice(2, 8),
            activityId, activityType, userId: team.id,
            participantSnapshot: participant,
            participantType: 'team', teamName: team.name, teamMembers: [], minTeamSize: null,
            teamConfirmedAt: new Date().toISOString(),
            status: 'registered', approvalRequired: false, approvalStatus: null,
            addedByOverride: true, overrideReason: reason, overrideByUserId: addedByUserId,
            isRepeat: false, offerExpiresAt: null
        };
        const created = await insertRegistrationToSupabase(registration);
        await insertRegistrationAuditLog({ addedByUserId, addedStudentId: team.id, activityId, activityType, reason });
        await syncCoreDataFromSupabase();
        return created;
    },

    getRegistrationAuditLogs: (activityId, activityType) =>
        (getDB().registrationAuditLogs || []).filter(l => l.activityId === activityId && l.activityType === activityType),

    // ============================================================================================
    // DAVOMAT (ATTENDANCE) - for team/whole-group scoring (Sport match_play, Munozara bench members,
    // team criteria_based/single_score) and for plain events, where a score is never assigned per
    // individual, so nothing else proves a specific registered person actually showed up. Individually
    // scored participation (correct_answer, quiz_mixed, criteria_based individual, Munozara notiqs)
    // already proves attendance via the score itself and is deliberately excluded from every roster
    // resolver below, keeping the common case (nothing to mark) fast and empty.
    // ============================================================================================

    // --- Roster resolvers: one per engine, each returns [{participantId, teamId, student}], already
    // excluding anyone exempt via a real score/lineup assignment. ---

    getEventAttendanceRoster: (eventId) => {
        const studentById = new Map(db.getMockStudents().map(s => [s.id, s]));
        const regs = db.getRegistrationsForActivity(eventId, 'event').filter(r => r.status === 'registered');
        const roster = [];
        regs.forEach(r => {
            if (r.participantType === 'team') {
                if (!r.teamConfirmedAt || !r.realTeamId) return; // team not yet materialized - nobody to mark yet
                db.getTeamMembers(r.realTeamId).forEach(m => roster.push({ participantId: m.userId, teamId: r.realTeamId, student: m.student }));
            } else {
                roster.push({ participantId: r.userId, teamId: null, student: studentById.get(r.userId) || null });
            }
        });
        return roster;
    },

    getMatchPlayAttendanceRoster: (matchId) => {
        const dbData = getDB();
        const match = (dbData.competitionMatches || []).find(m => m.id === matchId);
        if (!match) return [];
        return [
            ...db.getTeamMembers(match.teamAId).map(m => ({ participantId: m.userId, teamId: match.teamAId, student: m.student })),
            ...db.getTeamMembers(match.teamBId).map(m => ({ participantId: m.userId, teamId: match.teamBId, student: m.student }))
        ];
    },

    // Bench = real team roster minus whoever is assigned a notiq slot for this match - exemption is the
    // lineup assignment itself, never whether that slot's score was actually submitted yet.
    getDebateMatchBenchRoster: (matchId) => {
        const dbData = getDB();
        const match = (dbData.debateMatches || []).find(m => m.id === matchId);
        if (!match) return [];
        const lineupUserIds = new Set(db.getDebateMatchLineup(matchId).map(l => l.memberUserId));
        return [
            ...db.getTeamMembers(match.teamTId).filter(m => !lineupUserIds.has(m.userId)).map(m => ({ participantId: m.userId, teamId: match.teamTId, student: m.student })),
            ...db.getTeamMembers(match.teamIId).filter(m => !lineupUserIds.has(m.userId)).map(m => ({ participantId: m.userId, teamId: match.teamIId, student: m.student }))
        ];
    },

    // Team criteria_based/single_score has no per-round team partitioning (every team appears in every
    // round's scoring grid already) - every participating team's full roster, regardless of leaf unit.
    getCriteriaRoundAttendanceRoster: (compId) => {
        const comp = db.getCompetitionById(compId);
        if (!comp) return [];
        return (comp.participants || []).flatMap(p => db.getTeamMembers(p.id).map(m => ({ participantId: m.userId, teamId: p.id, student: m.student })));
    },

    // --- Core CRUD ---

    getActivityAttendance: (activityId, activityType, leafUnitType, leafUnitId) =>
        (getDB().activityAttendance || []).filter(a =>
            a.activityId === activityId && a.activityType === activityType &&
            a.leafUnitType === leafUnitType && String(a.leafUnitId) === String(leafUnitId)
        ),

    // Every leaf unit for an activity at once - feeds reporting (getStudentAttendanceParticipationSummary).
    getActivityAttendanceForActivity: (activityId, activityType) =>
        (getDB().activityAttendance || []).filter(a => a.activityId === activityId && a.activityType === activityType),

    // Barcha qulflar - qulflash holati tahlili uchun (attendanceStats.js).
    // Qayta ochilgani ham qaytadi: `reopenedAt` bo'yicha ajratiladi.
    getAttendanceLocks: () => getDB().activityAttendanceLocks || [],

    isAttendanceUnitLocked: (activityId, activityType, leafUnitType, leafUnitId) =>
        (getDB().activityAttendanceLocks || []).some(l =>
            l.activityId === activityId && l.activityType === activityType &&
            l.leafUnitType === leafUnitType && String(l.leafUnitId) === String(leafUnitId) && !l.reopenedAt
        ),

    getActivityAttendanceLock: (activityId, activityType, leafUnitType, leafUnitId) =>
        (getDB().activityAttendanceLocks || []).find(l =>
            l.activityId === activityId && l.activityType === activityType &&
            l.leafUnitType === leafUnitType && String(l.leafUnitId) === String(leafUnitId)
        ) || null,

    // Idempotent - called automatically the instant a match/round/event finishes (see
    // updateMatchResult/finishDebateMatch below, plus CompetitionRoundsTab.jsx's "Yakunlash" and the
    // events "Tadbirni yakunlash" action). A prior reopen is re-locked in place rather than duplicated.
    // Phase 0 da Supabase'ga ko'chirildi: Talent moduli davomatga tayanadi, u esa
    // brauzerda qolsa har kompyuterda boshqacha bo'lardi. Endi async - chaqiruv
    // joylari `await` qiladi.
    lockActivityAttendanceUnit: async (activityId, activityType, leafUnitType, leafUnitId, lockedByUserId) => {
        const dbData = getDB();
        if (!dbData.activityAttendanceLocks) dbData.activityAttendanceLocks = [];
        const existing = dbData.activityAttendanceLocks.find(l =>
            l.activityId === activityId && l.activityType === activityType &&
            l.leafUnitType === leafUnitType && String(l.leafUnitId) === String(leafUnitId)
        );
        if (existing && !existing.reopenedAt) return existing;

        const now = new Date().toISOString();
        const id = existing?.id
            || 'attlock_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
        const lock = {
            id, activityId, activityType, leafUnitType, leafUnitId,
            lockedAt: now, lockedByUserId, reopenedAt: null, reopenedByUserId: null
        };

        const { error } = await supabase.from('activity_attendance_locks').upsert({
            id, activity_id: activityId, activity_type: activityType,
            leaf_unit_type: leafUnitType, leaf_unit_id: String(leafUnitId),
            locked_at: now, reopened_at: null,
            data: { lockedByUserId, reopenedByUserId: null }
        }, { onConflict: 'activity_id,activity_type,leaf_unit_type,leaf_unit_id' });
        if (error) throw error;

        if (existing) Object.assign(existing, lock);
        else dbData.activityAttendanceLocks.push(lock);
        saveDB(dbData);
        return lock;
    },

    // Admin-only in the UI layer - clears the lock so marking can resume without a reason on every save.
    reopenActivityAttendanceUnit: async (activityId, activityType, leafUnitType, leafUnitId, reopenedByUserId) => {
        const dbData = getDB();
        const lock = (dbData.activityAttendanceLocks || []).find(l =>
            l.activityId === activityId && l.activityType === activityType &&
            l.leafUnitType === leafUnitType && String(l.leafUnitId) === String(leafUnitId) && !l.reopenedAt
        );
        if (!lock) throw new Error('Bu davomat qulflanmagan');

        const now = new Date().toISOString();
        const { error } = await supabase.from('activity_attendance_locks')
            .update({ reopened_at: now, data: { ...lock, reopenedByUserId } })
            .eq('id', lock.id);
        if (error) throw error;

        lock.reopenedAt = now;
        lock.reopenedByUserId = reopenedByUserId;
        saveDB(dbData);
        return lock;
    },

    // entries: [{participantId, teamId, status: 'present'|'absent'}]. Same "reason required once locked"
    // idiom as overrideAddParticipant. Upserts each row; appends an audit-log entry only where the status
    // actually changed or a reason was supplied, so a routine no-op re-save of an already-correct roster
    // doesn't flood the append-only log.
    setActivityAttendanceBulk: async (activityId, activityType, leafUnitType, leafUnitId, entries, markedByUserId, reason = null) => {
        const locked = db.isAttendanceUnitLocked(activityId, activityType, leafUnitType, leafUnitId);
        if (locked && !reason) throw new Error('Sabab kiritilishi shart');
        const dbData = getDB();
        if (!dbData.activityAttendance) dbData.activityAttendance = [];
        if (!dbData.activityAttendanceAuditLogs) dbData.activityAttendanceAuditLogs = [];
        const now = new Date().toISOString();
        const newAudits = [];
        // `role` QO'SHIMCHA va ixtiyoriy: berilmasa yozuv avvalgidek 'participant'
        // bo'ladi. Shu tufayli mavjud chaqiruv joylari va eski yozuvlar buzilmaydi.
        // `initiative` ham QO'SHIMCHA va ixtiyoriy - 11-mezon uchun. Bir
        // tadbirda tashabbuskor odatda yo'q, bo'lsa ham bitta-ikkita. Shuning
        // uchun u alohida jadval emas, davomat yozuvining o'zida turadi:
        // "kim tashkil etdi" savoli aynan davomat belgilanayotganda tug'iladi.
        const results = (entries || []).map(({ participantId, teamId, status, role, initiative }) => {
            const existing = dbData.activityAttendance.find(a =>
                a.activityId === activityId && a.activityType === activityType &&
                a.leafUnitType === leafUnitType && String(a.leafUnitId) === String(leafUnitId) && a.participantId === participantId
            );
            const previousStatus = existing ? existing.status : null;
            let row;
            if (existing) {
                existing.status = status;
                existing.teamId = teamId ?? existing.teamId;
                existing.markedByUserId = markedByUserId;
                existing.markedAt = now;
                // Rol berilmasa mavjud qiymat saqlanadi - ustiga yozilmaydi.
                if (role) existing.role = role;
                // Tashabbuskorlik: `undefined` - tegilmaydi, `null` - olib
                // tashlanadi. Ikkisi bir xil emas.
                if (initiative !== undefined) existing.initiative = initiative || null;
                row = existing;
            } else {
                row = {
                    id: 'attend_' + Date.now().toString() + Math.random().toString(36).slice(2, 8),
                    activityId, activityType, leafUnitType, leafUnitId,
                    participantId, teamId: teamId || null, status, markedByUserId, markedAt: now,
                    role: role || 'participant',
                    initiative: initiative || null
                };
                dbData.activityAttendance.push(row);
            }
            if (previousStatus !== status || reason) {
                const audit = {
                    id: 'attaudit_' + Date.now().toString() + Math.random().toString(36).slice(2, 8),
                    activityId, activityType, leafUnitType, leafUnitId, participantId,
                    previousStatus, newStatus: status, markedByUserId, reason: reason || null, createdAt: now
                };
                dbData.activityAttendanceAuditLogs.push(audit);
                newAudits.push(audit);
            }
            return row;
        });

        // BITTA so'rov bilan yoziladi, har qator uchun alohida emas: bitta raundda
        // 100+ ishtirokchi bo'lishi mumkin va har biriga alohida round-trip qilish
        // davomat kiritishni sudralib boradigan qilib qo'yardi.
        if (results.length > 0) {
            const { error } = await supabase.from('activity_attendance').upsert(
                results.map(r => ({
                    id: r.id, activity_id: activityId, activity_type: activityType,
                    leaf_unit_type: leafUnitType, leaf_unit_id: String(leafUnitId),
                    participant_id: r.participantId, team_id: r.teamId || null,
                    status: r.status, marked_at: now,
                    data: {
                        markedByUserId, role: r.role || 'participant',
                        ...(r.initiative ? { initiative: r.initiative } : {}),
                    }
                })),
                { onConflict: 'activity_id,activity_type,leaf_unit_type,leaf_unit_id,participant_id' }
            );
            if (error) throw error;
        }
        if (newAudits.length > 0) {
            const { error } = await supabase.from('activity_attendance_audit_logs').insert(
                newAudits.map(a => ({
                    id: a.id, activity_id: a.activityId, activity_type: a.activityType,
                    participant_id: a.participantId, created_at: a.createdAt,
                    data: {
                        leafUnitType: a.leafUnitType, leafUnitId: a.leafUnitId,
                        previousStatus: a.previousStatus, newStatus: a.newStatus,
                        markedByUserId: a.markedByUserId, reason: a.reason
                    }
                }))
            );
            if (error) throw error;
        }

        saveDB(dbData);
        return results;
    },

    // --- Event delegation - mirrors competitionDelegations/hasDelegatedPermission (competitionPermissions.js),
    // just event-scoped, so a coordinator can grant someone else attendance-marking rights on an event. ---

    // BAZAGA yoziladi, brauzerga emas. Ilgari u faqat localStorage da
    // saqlanardi va vakolat olgan odam O'Z QURILMASIDA hech narsa
    // ko'rmasdi - ya'ni funksiya bosilardi, lekin ishlamasdi.
    grantEventDelegation: async (eventId, granteeUsername, permissions, grantedBy) => {
        await assertAuthenticated();
        const uname = (granteeUsername || '').trim();
        if (!uname) throw new Error('Foydalanuvchi tanlanmagan');

        // Ayni odamga ayni tadbir uchun ikkinchi vakolat berilmaydi - ro'yxatda
        // bir odam ikki marta chiqib, bekor qilish chalkash bo'lardi.
        const existing = (getDB().eventDelegations || [])
            .find(d => d.eventId === eventId && d.granteeUsername === uname && d.active);
        if (existing) return existing;

        const id = 'evdeleg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const { error } = await supabase.from('event_delegations').insert({
            id, event_id: eventId, grantee_username: uname,
            permissions: permissions || ['attendance'], granted_by: grantedBy, active: true,
        });
        if (error) {
            const missing = /relation .*event_delegations.* does not exist/i.test(error.message || '');
            throw new Error(missing
                ? "Vakolat saqlanmadi: `event_delegations` jadvali topilmadi. "
                  + 'Supabase SQL Editor da `supabase/event_delegations.sql` ni bir marta ishga tushiring.'
                : 'Vakolat saqlanmadi: ' + error.message);
        }
        await syncCoreDataFromSupabase();
        return (getDB().eventDelegations || []).find(d => d.id === id) || null;
    },
    // Yozuv O'CHIRILMAYDI, `active` false bo'ladi: kim qachon vakolat
    // bergani va olganini keyin tekshirish mumkin bo'lishi kerak.
    revokeEventDelegation: async (delegationId, revokedBy) => {
        const { error } = await supabase.from('event_delegations')
            .update({ active: false, revoked_by: revokedBy, revoked_at: new Date().toISOString() })
            .eq('id', delegationId);
        if (error) throw new Error('Vakolat bekor qilinmadi: ' + error.message);
        await syncCoreDataFromSupabase();
        return true;
    },
    getEventDelegations: (eventId) => (getDB().eventDelegations || []).filter(d => d.eventId === eventId && d.active),

    // Cross-activity accessor for reporting (getStudentAttendanceParticipationSummary, rankingsAnalytics.js)
    // - every getActivityAttendance*/getX AttendanceRoster helper above is scoped to one leaf unit or one
    // activity; this is the one place a student's full attendance history is read at once.
    getAttendanceForParticipant: (participantId) => (getDB().activityAttendance || []).filter(a => a.participantId === participantId),

    // Butun davomat yozuvi - umumiy ko'rsatkichlar uchun (utils/platformStats.js).
    // Rahbariyat sahifalari ilgari bunday manba yo'qligi sababli raqamlarni
    // o'ylab topardi.
    getActivityAttendanceAll: () => getDB().activityAttendance || [],

    // Re-registration banner support: has this user registered for anything at this club before?
    hasPriorRegistration: (userId, clubId) => !!db.getLastRegistrationForClub(userId, clubId),
    getLastRegistrationForClub: (userId, clubId) => {
        const dbData = getDB();
        const eventIds = new Set((dbData.events || []).filter(e => e.clubId === clubId).map(e => e.id));
        const compIds = new Set((dbData.competitions || []).filter(c => c.contextType === 'club' && c.contextId === clubId).map(c => c.id));
        const matches = (dbData.registrations || []).filter(r =>
            r.userId === userId && r.status !== 'cancelled' &&
            ((r.activityType === 'event' && eventIds.has(r.activityId)) || (r.activityType === 'competition' && compIds.has(r.activityId)))
        );
        if (matches.length === 0) return null;
        return matches.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    },

    // Real notification store - replaces the two previously-hardcoded mock arrays in Header.jsx and
    // NotificationList.jsx.
    createNotification: async (notif) => {
        const created = await addNotificationToSupabase(notif);
        await syncCoreDataFromSupabase();
        return created;
    },
    getNotificationsForUser: (userId) =>
        (getDB().notifications || []).filter(n => n.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    markNotificationRead: async (id) => {
        const { data, error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id).select().single();
        if (error) throw error;
        await syncCoreDataFromSupabase();
        return mapNotificationFromSupabase(data);
    },
    markAllNotificationsRead: async (userId) => {
        const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId);
        if (error) throw error;
        await syncCoreDataFromSupabase();
    },
    clearNotificationsForUser: async (userId) => {
        const { error } = await supabase.from('notifications').delete().eq('user_id', userId);
        if (error) throw error;
        await syncCoreDataFromSupabase();
    },

    // Cascades only the 3 tables the mock itself ever cascaded (competitions/competitionScores/
    // competitionAuditLogs) - every other competition-ecosystem overlay (rounds, matches, delegations,
    // ...) was ALREADY left orphaned on delete even in the mock, so this isn't a new gap.
    deleteCompetition: async (id) => {
        await Promise.all([
            supabase.from('competitions').delete().eq('id', id),
            supabase.from('competition_scores').delete().eq('competition_id', id),
            supabase.from('competition_audit_logs').delete().eq('competition_id', id)
        ]);
        await syncCoreDataFromSupabase();
    },
    getCompetitionScores: (compId) => {
        const data = getDB();
        return (data.competitionScores || []).filter(s => s.competitionId === compId);
    },
    // Called frequently (live-scoring autosave) - fetches only the rows this exact batch could touch
    // (one round/judge at a time, same as the original), so the "diff against old value" audit-logging
    // behavior is preserved without a full-table read. A value that hasn't actually changed still writes
    // nothing and logs nothing, exactly like the original.
    saveRoundScores: async (compId, round, judge, scoresList, device) => {
        const participantIds = scoresList.map(e => e.participantId);
        const { data: existingRows, error: fetchErr } = await supabase.from('competition_scores')
            .select('*').eq('competition_id', compId).eq('round', round).eq('judge', judge).in('participant_id', participantIds);
        if (fetchErr) throw fetchErr;
        const existingByParticipant = new Map((existingRows || []).map(r => [r.participant_id, r]));
        const timestamp = new Date().toISOString();

        const upsertRows = [];
        const auditRows = [];
        scoresList.forEach(entry => {
            const existing = existingByParticipant.get(entry.participantId);
            const newVal = entry.value;
            const criteriaScores = entry.criteriaScores || {};
            if (existing) {
                if (JSON.stringify(existing.value) !== JSON.stringify(newVal)) {
                    auditRows.push({
                        id: 'log_' + Date.now().toString() + Math.random().toString(36).slice(2, 8),
                        competition_id: compId, judge, time: timestamp, participant_id: entry.participantId,
                        round, old_val: existing.value, new_val: newVal, device: device || 'Web Browser'
                    });
                    upsertRows.push({
                        id: existing.id, competition_id: compId, round, judge, participant_id: entry.participantId,
                        value: newVal, criteria_scores: criteriaScores, date: timestamp, device: device || 'Web Browser'
                    });
                }
            } else {
                const scoreId = 'score_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
                upsertRows.push({
                    id: scoreId, competition_id: compId, round, judge, participant_id: entry.participantId,
                    value: newVal, criteria_scores: criteriaScores, date: timestamp, device: device || 'Web Browser'
                });
                auditRows.push({
                    id: 'log_' + Date.now().toString() + Math.random().toString(36).slice(2, 8),
                    competition_id: compId, judge, time: timestamp, participant_id: entry.participantId,
                    round, old_val: null, new_val: newVal, device: device || 'Web Browser'
                });
            }
        });

        if (upsertRows.length > 0) {
            const { error: upsertErr } = await supabase.from('competition_scores').upsert(upsertRows, { onConflict: 'id' });
            if (upsertErr) throw upsertErr;
        }
        if (auditRows.length > 0) {
            const { error: auditErr } = await supabase.from('competition_audit_logs').insert(auditRows);
            if (auditErr) throw auditErr;
        }
        await syncCoreDataFromSupabase();
        return true;
    },
    getAuditLogs: (compId) => {
        const data = getDB();
        return (data.competitionAuditLogs || []).filter(log => log.competitionId === compId).sort((a, b) => new Date(b.time) - new Date(a.time));
    },
    // Debate engine: Chief Judge penalty ledger (separate from the round-scoring flow - applies immediately)
    addDebatePenalty: async (compId, participantId, type, points, appliedBy) => {
        const id = 'penalty_' + Math.random().toString(36).substr(2, 9);
        const data = { participantId, type, points: Number(points) || 0, appliedBy, date: new Date().toISOString() };
        const { data: row, error } = await supabase.from('debate_penalties')
            .insert({ id, competition_id: compId, data }).select().single();
        if (error) throw error;
        await syncCoreDataFromSupabase();
        return mapDebatePenaltyFromSupabase(row);
    },
    getDebatePenalties: (compId) => {
        const data = getDB();
        return (data.debatePenalties || []).filter(p => p.competitionId === compId);
    },
    removeDebatePenalty: async (id) => {
        const { error } = await supabase.from('debate_penalties').delete().eq('id', id);
        if (error) throw error;
        await syncCoreDataFromSupabase();
    },

    // === Competition ecosystem: per-competition delegation ("Vakolatlar") ===
    getCompetitionDelegations: (compId) => {
        const data = getDB();
        return (data.competitionDelegations || []).filter(d => d.competitionId === compId && d.active);
    },
    // BAZAGA yoziladi. Ilgari faqat localStorage da qolardi va vakolat olgan
    // hakam O'Z QURILMASIDA hech narsa ko'rmasdi - tadbir vakolatidagi bilan
    // aynan bir xil xato (supabase/event_delegations.sql izohiga qarang).
    grantCompetitionDelegation: async (compId, granteeUsername, permissions, grantedBy) => {
        await assertAuthenticated();
        const uname = (granteeUsername || '').trim();
        if (!uname) throw new Error('Foydalanuvchi tanlanmagan');

        // Ayni odamga ayni musobaqa uchun ikkinchi vakolat berilmaydi. Huquq
        // qo'shish kerak bo'lsa avvalgisini bekor qilib, yangisini berish
        // kerak - aks holda ro'yxatda bir odam ikki marta chiqib, qaysi biri
        // amalda ekani noaniq bo'lardi.
        const existing = (getDB().competitionDelegations || [])
            .find(d => d.competitionId === compId && d.granteeUsername === uname && d.active);
        if (existing) return existing;

        const id = 'deleg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const perms = permissions || [];
        const { error } = await supabase.from('competition_delegations').insert({
            id, competition_id: compId, grantee_username: uname,
            permissions: perms, granted_by: grantedBy, active: true,
        });
        if (error) throw competitionDelegationTableError(error);

        // Tarix yozuvi jimgina o'tkazib yuboriladi: u yozilmagani uchun
        // vakolatning O'ZI bekor bo'lmasligi kerak.
        try {
            await supabase.from('competition_delegation_audit_logs').insert({
                id: 'delegLog_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
                competition_id: compId, action: 'GRANT', grantee_username: uname,
                permissions: perms, acting_username: grantedBy,
            });
        } catch (e) { console.warn('Vakolat tarixi yozilmadi:', e.message); }

        await syncCoreDataFromSupabase();
        return (getDB().competitionDelegations || []).find(d => d.id === id) || null;
    },

    revokeCompetitionDelegation: async (id, revokedBy) => {
        const grant = (getDB().competitionDelegations || []).find(d => d.id === id);
        const { error } = await supabase.from('competition_delegations')
            .update({ active: false, revoked_by: revokedBy, revoked_at: new Date().toISOString() })
            .eq('id', id);
        if (error) throw competitionDelegationTableError(error);

        try {
            await supabase.from('competition_delegation_audit_logs').insert({
                id: 'delegLog_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
                competition_id: grant?.competitionId || null, action: 'REVOKE',
                grantee_username: grant?.granteeUsername || null,
                permissions: grant?.permissions || [], acting_username: revokedBy,
            });
        } catch (e) { console.warn('Vakolat tarixi yozilmadi:', e.message); }

        await syncCoreDataFromSupabase();
        return true;
    },

    // Real activity log for "Guruh bosqichlari" - every group/advancement action (by admin OR a delegate
    // with the manage_groups permission) gets one row here, independent of WHO did it, so an admin who
    // delegated this away can still see exactly what was done and when. Separate from
    // competitionDelegationAuditLogs (which only logs GRANT/REVOKE of the delegation itself, not its
    // subsequent use) and from getAuditLogs (which only logs per-round SCORE changes).
    getCompetitionGroupActionLogs: (compId) => {
        const data = getDB();
        return (data.competitionGroupActionLogs || [])
            .filter(l => l.competitionId === compId)
            .sort((a, b) => new Date(b.time) - new Date(a.time));
    },
    logCompetitionGroupAction: async (compId, action, details, actingUsername) => {
        const dbData = getDB();
        if (!dbData.competitionGroupActionLogs) dbData.competitionGroupActionLogs = [];
        const entry = {
            id: 'grpLog_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            competitionId: compId, action, details, actingUsername, time: new Date().toISOString()
        };
        dbData.competitionGroupActionLogs.push(entry);
        await persistCompetitionRow('competition_group_action_logs', entry, { action });
        saveDB(dbData);
        return entry;
    },

    // === Competition ecosystem: differentiated judge roles (additive over the flat `judges` array) ===
    getCompetitionJudgeRoles: (compId) => {
        const data = getDB();
        return (data.competitionJudgeRoles || []).filter(r => r.competitionId === compId);
    },
    setCompetitionJudgeRole: async (compId, username, role, assignedBy) => {
        const dbData = getDB();
        if (!dbData.competitionJudgeRoles) dbData.competitionJudgeRoles = [];
        const existing = dbData.competitionJudgeRoles.find(r => r.competitionId === compId && r.username === username);
        if (existing) {
            const { id, competitionId, ...currentData } = existing;
            const newData = { ...currentData, role, active: true };
            const { error } = await supabase.from('competition_judge_roles').update({ data: newData }).eq('id', id);
            if (error) throw error;
            Object.assign(existing, newData);
        } else {
            const id = 'jrole_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
            const newData = { username, role, active: true, assignedBy, assignedAt: new Date().toISOString() };
            const { error } = await supabase.from('competition_judge_roles')
                .insert({ id, competition_id: compId, data: newData });
            if (error) throw error;
            dbData.competitionJudgeRoles.push({ ...newData, id, competitionId: compId });
        }
        saveDB(dbData);
        return dbData.competitionJudgeRoles.find(r => r.competitionId === compId && r.username === username);
    },
    // Drops a judge's role record. The caller is responsible for also removing the username from the
    // competition's own `judges` array (see CompetitionJudgesTab) — that array stays the source of truth
    // for the active-judge switcher, this is only the role/metadata overlay.
    removeCompetitionJudgeRole: async (compId, username) => {
        const dbData = getDB();
        const existing = (dbData.competitionJudgeRoles || [])
            .find(r => r.competitionId === compId && r.username === username);
        if (!existing) return;
        const { error } = await supabase.from('competition_judge_roles').delete().eq('id', existing.id);
        if (error) throw error;
        dbData.competitionJudgeRoles = dbData.competitionJudgeRoles.filter(r => r.id !== existing.id);
        saveDB(dbData);
    },

    // === Competition ecosystem: round metadata overlay (sparse - never required by the existing
    // roundGroupCount/questionButtons "Zakovat" math in TournamentScoring.jsx) ===
    getCompetitionRounds: (compId) => {
        const data = getDB();
        return (data.competitionRounds || [])
            .filter(r => r.competitionId === compId)
            .sort((a, b) => (a.displayOrder ?? a.index) - (b.displayOrder ?? b.index));
    },
    upsertCompetitionRound: async (compId, index, updates = {}) => {
        const dbData = getDB();
        const existing = (dbData.competitionRounds || []).find(r => r.competitionId === compId && r.index === index);
        const now = new Date().toISOString();
        if (existing) {
            const { id, competitionId, index: _idx, ...existingData } = existing;
            const newData = { ...existingData, ...updates, updatedAt: now };
            const { data: row, error } = await supabase.from('competition_rounds').update({ data: newData }).eq('id', id).select().single();
            if (error) throw error;
            await syncCoreDataFromSupabase();
            return mapCompetitionRoundFromSupabase(row);
        }
        const id = 'cround_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
        const data = {
            name: `Raund ${index}`,
            questionCount: null,
            plannedDurationMin: null,
            status: 'draft',
            displayOrder: index,
            createdAt: now,
            updatedAt: now,
            ...updates
        };
        const { data: row, error } = await supabase.from('competition_rounds')
            .insert({ id, competition_id: compId, index, data }).select().single();
        if (error) throw error;
        await syncCoreDataFromSupabase();
        return mapCompetitionRoundFromSupabase(row);
    },

    // === Competition ecosystem: appeals ("Apellyatsiya") ===
    getCompetitionAppeals: (compId) => {
        const data = getDB();
        return (data.competitionAppeals || [])
            .filter(a => a.competitionId === compId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
    createAppeal: async ({ competitionId, round, participantId, submittedBy, reason, proposedValue = null, proposedCriteriaScores = null }) => {
        const dbData = getDB();
        if (!dbData.competitionAppeals) dbData.competitionAppeals = [];
        const appeal = {
            id: 'appeal_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            competitionId,
            round,
            participantId,
            submittedBy,
            reason,
            proposedValue,
            proposedCriteriaScores,
            status: 'pending',
            decidedBy: null,
            decidedAt: null,
            decisionComment: null,
            createdAt: new Date().toISOString()
        };
        dbData.competitionAppeals.push(appeal);
        await persistCompetitionRow('competition_appeals', appeal, { participant_id: participantId, status: 'pending' });
        saveDB(dbData);
        return appeal;
    },
    // `judge` is the judge-of-record the score correction is attributed to when accepting (the caller
    // decides - e.g. the original judge, or the reviewer acting as judge-of-record; db.js does not assume
    // a single-judge model). Accepting replays the correction through the exact same db.saveRoundScores
    // path every other score write uses, so it gets the identical audit trail - never a bypass write
    // directly into competitionScores.
    decideAppeal: async (appealId, status, reviewer, comment, judge, device) => {
        const dbData = getDB();
        const appeal = (dbData.competitionAppeals || []).find(a => a.id === appealId);
        if (!appeal) throw new Error('Apellyatsiya topilmadi');
        const fromStatus = appeal.status;
        appeal.status = status;
        appeal.decidedBy = reviewer;
        appeal.decidedAt = new Date().toISOString();
        appeal.decisionComment = comment || null;
        if (!dbData.competitionAppealAuditLogs) dbData.competitionAppealAuditLogs = [];
        const logEntry = {
            id: 'appealLog_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            appealId,
            competitionId: appeal.competitionId,
            fromStatus,
            toStatus: status,
            reviewer,
            comment: comment || null,
            time: appeal.decidedAt
        };
        dbData.competitionAppealAuditLogs.push(logEntry);
        // Qaror avval bazaga yoziladi: agar yozilmasa, ariza beruvchi javobni
        // umuman ko'rmaydi, lekin ball allaqachon tuzatilgan bo'lardi.
        await persistCompetitionRow('competition_appeals', appeal, { participant_id: appeal.participantId, status });
        await persistCompetitionRow('competition_appeal_audit_logs', logEntry, { appeal_id: appealId });
        saveDB(dbData);
        if (status === 'accepted' && appeal.proposedValue !== null) {
            db.saveRoundScores(
                appeal.competitionId,
                appeal.round,
                judge || reviewer,
                [{ participantId: appeal.participantId, value: appeal.proposedValue, criteriaScores: appeal.proposedCriteriaScores || {} }],
                device || "Apellyatsiya orqali tuzatildi"
            );
        }
        return appeal;
    },

    // === TSUL Court: case-role assignment overlay ===
    getCompetitionCaseRoles: (compId, round = null) => {
        const data = getDB();
        return (data.competitionCaseRoles || []).filter(r => r.competitionId === compId && (round == null || r.round === round));
    },
    setCompetitionCaseRole: async (compId, round, participantId, role, assignedBy) => {
        const dbData = getDB();
        if (!dbData.competitionCaseRoles) dbData.competitionCaseRoles = [];
        let row = dbData.competitionCaseRoles.find(r => r.competitionId === compId && r.round === round && r.participantId === participantId);
        if (row) {
            row.role = role;
            row.assignedBy = assignedBy;
            row.assignedAt = new Date().toISOString();
        } else {
            row = {
                id: 'caserole_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
                competitionId: compId, round, participantId, role, assignedBy,
                assignedAt: new Date().toISOString()
            };
            dbData.competitionCaseRoles.push(row);
        }
        await persistCompetitionRow('competition_case_roles', row, { participant_id: participantId });
        saveDB(dbData);
        return row;
    },

    // Zakovat "Natija kiritish" grid overlays (correct_answer only) - same upsert-by-key idiom as
    // setCompetitionCaseRole above.
    getCompetitionQuestionPoints: (compId) => {
        const data = getDB();
        return (data.competitionQuestionPoints || []).filter(r => r.competitionId === compId);
    },
    setCompetitionQuestionPoints: async (compId, questionIndex, points) => {
        const dbData = getDB();
        if (!dbData.competitionQuestionPoints) dbData.competitionQuestionPoints = [];
        let row = dbData.competitionQuestionPoints.find(r => r.competitionId === compId && r.questionIndex === questionIndex);
        const now = new Date().toISOString();
        if (row) {
            row.points = points;
            row.updatedAt = now;
        } else {
            row = {
                id: 'qpts_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
                competitionId: compId, questionIndex, points, updatedAt: now
            };
            dbData.competitionQuestionPoints.push(row);
        }
        await persistCompetitionRow('competition_question_points', row);
        saveDB(dbData);
        return row;
    },
    // "Savol turi" - a per-question label ('standard'|'blitz'|'bonus'), purely informational/categorical.
    // Reuses the same competitionQuestionPoints record as the point-value override (same key), never
    // affects scoring math - display/filtering metadata only, same spirit as competitionCaseRoles.
    setCompetitionQuestionType: async (compId, questionIndex, questionType) => {
        const dbData = getDB();
        if (!dbData.competitionQuestionPoints) dbData.competitionQuestionPoints = [];
        let row = dbData.competitionQuestionPoints.find(r => r.competitionId === compId && r.questionIndex === questionIndex);
        const now = new Date().toISOString();
        if (row) {
            row.questionType = questionType;
            row.updatedAt = now;
        } else {
            row = {
                id: 'qpts_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
                competitionId: compId, questionIndex, points: null, questionType, updatedAt: now
            };
            dbData.competitionQuestionPoints.push(row);
        }
        await persistCompetitionRow('competition_question_points', row);
        saveDB(dbData);
        return row;
    },
    getCompetitionParticipantSeats: (compId) => {
        const data = getDB();
        return (data.competitionParticipantSeats || []).filter(r => r.competitionId === compId);
    },
    setParticipantSeat: async (compId, participantId, seatNumber) => {
        const dbData = getDB();
        if (!dbData.competitionParticipantSeats) dbData.competitionParticipantSeats = [];
        let row = dbData.competitionParticipantSeats.find(r => r.competitionId === compId && r.participantId === participantId);
        const now = new Date().toISOString();
        if (row) {
            row.seatNumber = seatNumber;
            row.updatedAt = now;
        } else {
            row = {
                id: 'seat_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
                competitionId: compId, participantId, seatNumber, updatedAt: now
            };
            dbData.competitionParticipantSeats.push(row);
        }
        await persistCompetitionRow('competition_participant_seats', row, { participant_id: participantId });
        saveDB(dbData);
        return row;
    },
    getCompetitionRoundParticipantStatus: (compId, roundGroupIndex) => {
        const data = getDB();
        return (data.competitionRoundParticipantStatus || []).filter(r => r.competitionId === compId && r.roundGroupIndex === roundGroupIndex);
    },
    // ASYNC: raundda kim qatnashgani va kim chetlatilgani baholash paytida
    // qo'yiladi, ya'ni aynan har xil kompyuterdan.
    setParticipantRoundStatus: async (compId, roundGroupIndex, participantId, updates, actor) => {
        const dbData = getDB();
        if (!dbData.competitionRoundParticipantStatus) dbData.competitionRoundParticipantStatus = [];
        let row = dbData.competitionRoundParticipantStatus.find(
            r => r.competitionId === compId && r.roundGroupIndex === roundGroupIndex && r.participantId === participantId
        );
        const now = new Date().toISOString();
        if (row) {
            Object.assign(row, updates, { updatedAt: now, updatedBy: actor });
        } else {
            row = {
                id: 'rpstatus_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
                competitionId: compId, roundGroupIndex, participantId,
                attended: null, disqualified: false,
                ...updates, updatedAt: now, updatedBy: actor
            };
            dbData.competitionRoundParticipantStatus.push(row);
        }
        await persistRecordRow('competition_round_participant_status', row, {
            competition_id: compId, participant_id: participantId,
        });
        saveDB(dbData);
        return row;
    },

    // "Jadval" tab's "Turlar jadvali" - real per-Tur date/time/responsible-judge, keyed by turIndex
    // (1-based, matches `stages[i]`'s position). Same upsert-by-key idiom as the overlays above.
    // `groupId` (default null = "Umumiy", the original single shared slot every existing schedule row
    // already uses) lets a Tur that belongs to a fakultet-kesimida Guruh bosqichi carry a SEPARATE
    // date/time per guruh (CompetitionTurSchedule.jsx's guruh picker) - e.g. IT fakulteti's 1-Tur running
    // a different day than Iqtisod fakulteti's own 1-Tur. Purely informational either way (see
    // TournamentScoring.jsx's scoringGateStatus: schedule only ever gates a NO-guruh competition; a
    // guruh-based one is gated by advancement freeze instead, never by this date), so this is additive
    // display data - nothing scoring-related reads/depends on groupId.
    getTurSchedule: (compId) => {
        const data = getDB();
        return (data.competitionTurSchedule || []).filter(r => r.competitionId === compId);
    },
    // Upsert by (competitionId, turIndex, groupId). Writes to Supabase, then patches the local mirror in
    // place rather than re-fetching all 23 tables — this is called on every keystroke-ish edit in the
    // Jadval tab, same reasoning as saveDebateNotiqScores.
    setTurSchedule: async (compId, turIndex, updates, groupId = null) => {
        const dbData = getDB();
        if (!dbData.competitionTurSchedule) dbData.competitionTurSchedule = [];
        const existing = dbData.competitionTurSchedule
            .find(r => r.competitionId === compId && r.turIndex === turIndex && (r.groupId || null) === groupId);
        const now = new Date().toISOString();

        // Double-booking guard at the WRITE point, not just in the picker UI: a Tur that ends up with a
        // venue+date+time is a real room booking like any other, so it goes through the same check every
        // event and competition does. Excludes this competition's own rows, since a Tur must not be said
        // to clash with its own parent competition or a sibling Tur being edited.
        const merged = { ...(existing || {}), ...updates };
        if (merged.venueLabel && merged.date) {
            const conflict = findLocationConflict(
                dbData, merged.venueLabel,
                combineDateTime(merged.date, merged.startTime),
                compId,
                merged.endTime ? combineDateTime(merged.date, merged.endTime) : null
            );
            if (conflict) {
                throw Object.assign(
                    new Error(`"${merged.venueLabel}" shu vaqtda band: "${conflict.title}".`),
                    { status: 409 }
                );
            }
        }

        if (existing) {
            const { id, competitionId, ...currentData } = existing;
            const newData = { ...currentData, ...updates, updatedAt: now };
            const { error } = await supabase.from('competition_tur_schedule').update({ data: newData }).eq('id', id);
            if (error) throw error;
            Object.assign(existing, newData);
        } else {
            const id = 'turshed_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
            const newData = {
                turIndex, groupId,
                date: null, startTime: null, endTime: null, judgeUsername: null, venueLabel: null,
                ...updates, updatedAt: now
            };
            const { error } = await supabase.from('competition_tur_schedule')
                .insert({ id, competition_id: compId, data: newData });
            if (error) throw error;
            dbData.competitionTurSchedule.push({ ...newData, id, competitionId: compId });
        }
        saveDB(dbData);
        return dbData.competitionTurSchedule.find(r => r.competitionId === compId && r.turIndex === turIndex && (r.groupId || null) === groupId);
    },

    // UniQuiz per-faculty ("guruh") advancement between Tur boundaries. "Guruh" is deliberately generic
    // (the UI alone calls it "Fakultet") so a future correct_answer League/Cup reuse isn't blocked.
    getScoringGroups: (compId) => {
        const data = getDB();
        return (data.competitionScoringGroups || [])
            .filter(g => g.competitionId === compId)
            .sort((a, b) => a.displayOrder - b.displayOrder);
    },
    // `matchFaculty`/`matchCourse` (both optional, default null) are EXPLICIT auto-assign criteria set by
    // the checkbox pickers (as opposed to guessing from `label` text) - a group with matchFaculty AND
    // matchCourse both set only auto-assigns a participant whose real faculty AND course BOTH match (the
    // "Ommaviy huquq fakulteti 1-kurs" compound case, which free-text label parsing alone can't do
    // reliably - see handleAutoAssignByFaculty's groupMatchesParticipant). A group with neither set (every
    // pre-existing group, and any typed via the free-text "Boshqa nom" input) keeps matching by `label`
    // text exactly as before - fully backward compatible.
    // ASYNC: guruhning O'ZI ham bazada bo'lishi shart. Biriktirishlar
    // (competition_participant_groups) allaqachon serverda - agar guruh
    // brauzerda qolsa, ikkinchi hakam mavjud bo'lmagan guruhga
    // biriktirilgan ishtirokchini ko'radi.
    upsertScoringGroup: async (compId, { id, label, matchFaculty = null, matchCourse = null }, actor) => {
        const dbData = getDB();
        if (!dbData.competitionScoringGroups) dbData.competitionScoringGroups = [];
        const now = new Date().toISOString();
        if (id) {
            const existing = dbData.competitionScoringGroups.find(g => g.id === id && g.competitionId === compId);
            if (existing) {
                existing.label = label;
                await persistCompetitionRow('competition_scoring_groups', existing);
                saveDB(dbData);
                return existing;
            }
        }
        const group = {
            id: 'sgroup_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            competitionId: compId, label, matchFaculty, matchCourse,
            displayOrder: dbData.competitionScoringGroups.filter(g => g.competitionId === compId).length + 1,
            createdAt: now, createdBy: actor
        };
        dbData.competitionScoringGroups.push(group);
        await persistCompetitionRow('competition_scoring_groups', group);
        saveDB(dbData);
        return group;
    },
    deleteScoringGroup: async (compId, groupId) => {
        const dbData = getDB();
        const inUse = (dbData.competitionParticipantGroupAssignments || []).some(a => a.competitionId === compId && a.groupId === groupId)
            || (dbData.competitionAdvancementRules || []).some(r => r.competitionId === compId && r.groupId === groupId);
        if (inUse) throw new Error("Bu guruh ishtirokchi yoki qoidaga biriktirilgan - avval ularni olib tashlang");
        // Avval bazadan, keyin mahalliy: aks holda o'chirish keyingi
        // sinxronlashda qaytib kelardi.
        const { error } = await supabase.from('competition_scoring_groups').delete().eq('id', groupId);
        if (error) throw competitionOpsTableError(error);
        dbData.competitionScoringGroups = (dbData.competitionScoringGroups || []).filter(g => !(g.id === groupId && g.competitionId === compId));
        saveDB(dbData);
    },
    getParticipantGroupAssignments: (compId) => {
        const data = getDB();
        return (data.competitionParticipantGroupAssignments || []).filter(a => a.competitionId === compId);
    },
    getParticipantGroupMap: (compId) => {
        const data = getDB();
        const map = new Map();
        (data.competitionParticipantGroupAssignments || [])
            .filter(a => a.competitionId === compId)
            .forEach(a => map.set(a.participantId, a.groupId));
        return map;
    },
    // ASYNC: guruh taqsimoti endi bazaga yoziladi. Musobaqani bir necha
    // hakam har xil kompyuterdan baholaydi va ilgari biri taqsimlagan
    // guruhlarni ikkinchisi umuman ko'rmasdi.
    setParticipantGroup: async (compId, participantId, groupId, actor) => {
        const dbData = getDB();
        if (!dbData.competitionParticipantGroupAssignments) dbData.competitionParticipantGroupAssignments = [];
        const now = new Date().toISOString();
        let row = dbData.competitionParticipantGroupAssignments.find(a => a.competitionId === compId && a.participantId === participantId);
        if (row) {
            row.groupId = groupId; row.updatedAt = now; row.updatedBy = actor;
        } else {
            row = {
                id: 'pgroup_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
                competitionId: compId, participantId, groupId, updatedAt: now, updatedBy: actor
            };
            dbData.competitionParticipantGroupAssignments.push(row);
        }
        await persistCompetitionRow('competition_participant_groups', row, { participant_id: participantId });
        saveDB(dbData);
    },
    getAdvancementRules: (compId, turBoundary = null) => {
        const data = getDB();
        return (data.competitionAdvancementRules || [])
            .filter(r => r.competitionId === compId && (turBoundary === null || r.turBoundary === turBoundary));
    },
    setAdvancementRule: async (compId, turBoundary, groupId, topN, actor) => {
        const dbData = getDB();
        if (!dbData.competitionAdvancementRules) dbData.competitionAdvancementRules = [];
        const now = new Date().toISOString();
        let row = dbData.competitionAdvancementRules.find(
            r => r.competitionId === compId && r.turBoundary === turBoundary && r.groupId === groupId
        );
        if (row) {
            row.topN = topN; row.updatedAt = now; row.updatedBy = actor;
        } else {
            row = {
                id: 'advrule_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
                competitionId: compId, turBoundary, groupId, topN, updatedAt: now, updatedBy: actor
            };
            dbData.competitionAdvancementRules.push(row);
        }
        await persistCompetitionRow('competition_advancement_rules', row);
        saveDB(dbData);
    },
    getTiebreakResolution: (compId, context, turBoundary, groupKey) => {
        const data = getDB();
        return (data.competitionTiebreakResolutions || []).find(
            r => r.competitionId === compId && r.context === context && r.turBoundary === turBoundary && r.groupKey === groupKey
        ) || null;
    },
    recordTiebreakResolution: async (compId, { context, turBoundary, groupKey, tiedParticipantIds, resolvedOrder }, actor) => {
        const dbData = getDB();
        if (!dbData.competitionTiebreakResolutions) dbData.competitionTiebreakResolutions = [];
        const now = new Date().toISOString();
        let row = dbData.competitionTiebreakResolutions.find(
            r => r.competitionId === compId && r.context === context && r.turBoundary === turBoundary && r.groupKey === groupKey
        );
        if (row) {
            row.tiedParticipantIds = tiedParticipantIds; row.resolvedOrder = resolvedOrder;
            row.enteredBy = actor; row.enteredAt = now;
        } else {
            row = {
                id: 'tiebreak_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
                competitionId: compId, context, turBoundary, groupKey, tiedParticipantIds, resolvedOrder,
                enteredBy: actor, enteredAt: now
            };
            dbData.competitionTiebreakResolutions.push(row);
        }
        await persistCompetitionRow('competition_tiebreak_resolutions', row);
        saveDB(dbData);
    },

    // Frozen advancement/final-placement reads - plain lookups, no computation.
    getAdvancementFreeze: (compId, turBoundary) => {
        const data = getDB();
        return (data.competitionAdvancementResults || []).find(
            r => r.competitionId === compId && r.context === 'advancement' && r.turBoundary === turBoundary
        ) || null;
    },
    getFinalPlacementFreeze: (compId) => {
        const data = getDB();
        return (data.competitionAdvancementResults || []).find(
            r => r.competitionId === compId && r.context === 'final_placement'
        ) || null;
    },
    // The single hook TournamentScoring.jsx/CompetitionResultsCenter.jsx call to know which participants
    // may be scored/shown for a given (1-based) stage index. `null` always means "show everyone" - the
    // first stage never has a prior boundary to have frozen, and any competition without a frozen
    // boundary for the PRECEDING stage behaves exactly as before this feature existed.
    getEligibleParticipantIdsForStage: (compId, stageIndex1Based) => {
        if (!stageIndex1Based || stageIndex1Based <= 1) return null;
        const freeze = db.getAdvancementFreeze(compId, stageIndex1Based - 1);
        return freeze ? new Set(freeze.advancedParticipantIds) : null;
    },

    // Resolves one tied cluster {score, participantIds} using the competition's configured tiebreak
    // cascade, scoped to `roundRange` (the boundary's own Tur for advancement, the LAST Tur for final
    // placement). `scoresByParticipant` is a Map(participantId -> roundScores) from db.getLeaderboard.
    // Returns { resolvedOrder: [participantId,...] | null, unresolved: boolean }.
    // Resolves one tied cluster into an ORDERED LIST OF SUB-CLUSTERS (best-to-worst), never a flat
    // participant list - a sub-cluster of size >1 means "still genuinely tied at this granularity" (only
    // possible via the 'split' fallback, where the whole tied residual is meant to be included/ranked
    // together rather than arbitrarily cut). Callers walk `orderedClusters` and decide inclusion
    // themselves (advancement needs a topN cutoff that can legitimately overshoot on a split residual;
    // final placement just assigns every member of a >1 sub-cluster the same rank).
    _resolveTiebreakCluster: (compId, comp, context, turBoundary, groupKey, cluster, roundRange, scoresByParticipant) => {
        const config = comp.advancementTiebreak || DEFAULT_ADVANCEMENT_TIEBREAK;
        const tiedGroup = cluster.participantIds.map(id => ({ participantId: id, roundScores: scoresByParticipant.get(id) || {} }));

        const lookupExtraQuestion = (idsForLookup) => {
            const resolution = db.getTiebreakResolution(compId, context, turBoundary, groupKey);
            const sortedIds = [...idsForLookup].sort();
            if (resolution && JSON.stringify([...resolution.tiedParticipantIds].sort()) === JSON.stringify(sortedIds)) {
                return resolution.resolvedOrder.map(id => ({ participantIds: [id] }));
            }
            return null; // unresolved - needs a live judge decision
        };

        let primaryClusters;
        if (config.primaryMethod === 'countback') primaryClusters = rankByCountback(tiedGroup, roundRange);
        else if (config.primaryMethod === 'lastN') primaryClusters = rankByLastN(tiedGroup, roundRange, config.lastN || DEFAULT_ADVANCEMENT_TIEBREAK.lastN);
        else if (config.primaryMethod === 'extra_question') primaryClusters = lookupExtraQuestion(cluster.participantIds);
        if (!primaryClusters) return { orderedClusters: null, unresolved: true };

        // Apply the fallback tier to any residual (>1) sub-cluster the primary method left tied.
        const orderedClusters = [];
        for (const sub of primaryClusters) {
            if (sub.participantIds.length === 1) { orderedClusters.push({ participantIds: sub.participantIds }); continue; }
            if (config.fallbackMethod === 'split') { orderedClusters.push({ participantIds: sub.participantIds }); continue; }
            const resolved = lookupExtraQuestion(sub.participantIds); // fallbackMethod === 'extra_question'
            if (resolved) orderedClusters.push(...resolved);
            else return { orderedClusters: null, unresolved: true };
        }
        return { orderedClusters, unresolved: false };
    },

    // LIVE preview (no writes) of which participants advance out of `turBoundary` (1 = "1-Tur -> 2-Tur",
    // etc.), ranked per faculty/"guruh" group over that Tur's own roundRange (never the whole-competition
    // total, which db.getLeaderboard/CompetitionResultsCenter's leaderboardRows both compute instead).
    computeFacultyAdvancement: (compId, turBoundary) => {
        const data = getDB();
        const comp = (data.competitions || []).find(c => c.id === compId);
        if (!comp) return null;
        const stages = getDisplayStages(comp);
        const stage = stages?.[turBoundary - 1];
        if (!stage) return null;

        const leaderboard = db.getLeaderboard(compId);
        const scoresByParticipant = new Map(leaderboard.map(row => [row.participant.id, row.roundScores]));

        const eligiblePool = db.getEligibleParticipantIdsForStage(compId, turBoundary);
        const realGroups = db.getScoringGroups(compId);
        const groupMap = db.getParticipantGroupMap(compId);
        const rules = db.getAdvancementRules(compId, turBoundary);

        const poolParticipants = (comp.participants || []).filter(p => !eligiblePool || eligiblePool.has(p.id));
        // No real guruh created ("Kubok" - single global elimination, no fakultet/kurs split) - every
        // participant implicitly belongs to one synthetic "Barchasi" group, so the exact same topN/
        // tiebreak/freeze machinery below works unchanged whether the admin split by guruh or not. Real
        // guruh(lar) present ("Bosqichli") use the actual per-participant assignments as before.
        // `ungroupedBoundaries` (new, optional, additive) lets a SPECIFIC boundary opt out of grouping
        // even when real guruh exist elsewhere in the same competition - e.g. Breyn-ring's real pattern:
        // guruhlash faqat 1-bosqichda (boundary 1), so'ngra hammasi umumiy havzaga qo'shiladi (boundary
        // 2+ ungrouped). Absent/empty array = every boundary respects real guruh, the original UniQuiz
        // behavior (fakultet grouping carried through every boundary) - unchanged for every competition
        // that never sets this field.
        const usingImplicitGroup = realGroups.length === 0 || (comp.ungroupedBoundaries || []).includes(turBoundary);
        const groups = usingImplicitGroup ? [{ id: '__global__', label: 'Barchasi' }] : realGroups;
        const unassignedParticipantIds = usingImplicitGroup
            ? []
            : poolParticipants.filter(p => !groupMap.has(p.id)).map(p => p.id);

        const groupResults = groups.map(group => {
            const pool = usingImplicitGroup ? poolParticipants : poolParticipants.filter(p => groupMap.get(p.id) === group.id);
            const entries = pool
                .map(p => ({ participantId: p.id, score: sumRoundScoresInRange(scoresByParticipant.get(p.id), stage.roundRange) }))
                .sort((a, b) => b.score - a.score);
            const clusters = [];
            entries.forEach(entry => {
                const last = clusters[clusters.length - 1];
                if (last && last.score === entry.score) last.participantIds.push(entry.participantId);
                else clusters.push({ score: entry.score, participantIds: [entry.participantId] });
            });

            const rule = rules.find(r => r.groupId === group.id);
            const topN = rule ? rule.topN : null;
            const ranked = clusters.flatMap(c => c.participantIds);

            let advancing = [];
            let cutoffTieUnresolved = false;
            let tiebreakUsed = null;
            let unresolvedParticipantIds = [];
            // Degenerate case: the WHOLE group shares one identical score (most commonly: nobody has
            // been scored for this Tur yet, so every team sits at 0) - there is no real signal to base
            // an advancement decision on. Without this guard, the 'split' fallback below would treat
            // "everyone tied" as a genuine boundary tie and include the ENTIRE group regardless of
            // topN. Block on it explicitly instead of silently advancing everyone.
            const insufficientData = topN != null && clusters.length === 1 && clusters[0].participantIds.length > topN;
            if (topN != null && !insufficientData) {
                let countBefore = 0;
                for (const cluster of clusters) {
                    if (countBefore >= topN) break;
                    if (countBefore + cluster.participantIds.length <= topN) {
                        advancing.push(...cluster.participantIds);
                        countBefore += cluster.participantIds.length;
                        continue;
                    }
                    // This cluster straddles the cutoff - resolve it via the tiebreak cascade. Walk the
                    // resulting sub-clusters in order; a >1 sub-cluster (only possible via 'split'
                    // fallback) is included WHOLE even if that pushes the count past topN - "teng
                    // bo'linadi" means nobody in a genuinely still-tied group is arbitrarily cut.
                    const result = db._resolveTiebreakCluster(
                        compId, comp, 'advancement', turBoundary, group.id, cluster, stage.roundRange, scoresByParticipant
                    );
                    if (result.unresolved) {
                        cutoffTieUnresolved = true;
                        unresolvedParticipantIds = cluster.participantIds;
                    } else {
                        tiebreakUsed = (comp.advancementTiebreak || DEFAULT_ADVANCEMENT_TIEBREAK).primaryMethod;
                        for (const sub of result.orderedClusters) {
                            if (countBefore >= topN) break;
                            advancing.push(...sub.participantIds);
                            countBefore += sub.participantIds.length;
                        }
                    }
                    break; // clusters after the straddling one always score lower - nothing more to add
                }
            }

            return { groupId: group.id, groupLabel: group.label, topN, ranked, advancing, cutoffTieUnresolved, tiebreakUsed, unresolvedParticipantIds, insufficientData };
        });

        return {
            turBoundary,
            groups: groupResults,
            unassignedParticipantIds,
            allAdvancingParticipantIds: groupResults.flatMap(g => g.advancing)
        };
    },

    freezeAdvancement: async (compId, turBoundary, actor) => {
        const preview = db.computeFacultyAdvancement(compId, turBoundary);
        if (!preview) throw new Error("Musobaqa yoki Tur topilmadi");
        if (preview.unassignedParticipantIds.length > 0) {
            throw new Error("Ba'zi ishtirokchilar hali guruhga biriktirilmagan");
        }
        const blockedGroup = preview.groups.find(g => g.topN == null || g.cutoffTieUnresolved || g.insufficientData);
        if (blockedGroup) {
            throw new Error(
                blockedGroup.topN == null
                    ? `"${blockedGroup.groupLabel}" guruhi uchun topN belgilanmagan`
                    : blockedGroup.insufficientData
                        ? `"${blockedGroup.groupLabel}" guruhida hali natija kiritilmagan - kim o'tishini hozircha aniqlab bo'lmaydi`
                        : `"${blockedGroup.groupLabel}" guruhida teng ball hali hal qilinmagan`
            );
        }
        const dbData = getDB();
        if (!dbData.competitionAdvancementResults) dbData.competitionAdvancementResults = [];
        const now = new Date().toISOString();
        const existingIdx = dbData.competitionAdvancementResults.findIndex(
            r => r.competitionId === compId && r.context === 'advancement' && r.turBoundary === turBoundary
        );
        const record = {
            id: existingIdx > -1 ? dbData.competitionAdvancementResults[existingIdx].id : 'advfreeze_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            competitionId: compId, context: 'advancement', turBoundary,
            advancedParticipantIds: preview.allAdvancingParticipantIds,
            byGroup: preview.groups.map(g => ({ groupId: g.groupId, participantIds: g.advancing, tiebreakUsed: g.tiebreakUsed })),
            frozenAt: now, frozenBy: actor
        };
        if (existingIdx > -1) dbData.competitionAdvancementResults[existingIdx] = record;
        else dbData.competitionAdvancementResults.push(record);
        await persistCompetitionRow('competition_advancement_results', record, { context: 'advancement' });
        saveDB(dbData);
        return record;
    },

    // LIVE preview of the overall Tur3/Final placement - whole-competition totalScore among the LAST
    // boundary's survivors (or everyone, if that boundary was never frozen). Reuses the exact same
    // tiebreak cascade, scoped to the final stage's own roundRange, with a synthetic 'rank_<N>' groupKey
    // per tied cluster so independent ties (e.g. 1st and 5th) never share/overwrite one another's
    // tiebreak-resolution record.
    computeFinalPlacement: (compId) => {
        const data = getDB();
        const comp = (data.competitions || []).find(c => c.id === compId);
        if (!comp) return null;
        const stages = getDisplayStages(comp);
        if (!stages || stages.length === 0) return null;
        const lastStage = stages[stages.length - 1];

        const leaderboard = db.getLeaderboard(compId);
        const scoresByParticipant = new Map(leaderboard.map(row => [row.participant.id, row.roundScores]));
        const eligiblePool = db.getEligibleParticipantIdsForStage(compId, stages.length);
        const pool = eligiblePool ? leaderboard.filter(row => eligiblePool.has(row.participant.id)) : leaderboard;

        const entries = pool.map(row => ({ participantId: row.participant.id, score: row.totalScore })).sort((a, b) => b.score - a.score);
        const clusters = [];
        entries.forEach(entry => {
            const last = clusters[clusters.length - 1];
            if (last && last.score === entry.score) last.participantIds.push(entry.participantId);
            else clusters.push({ score: entry.score, participantIds: [entry.participantId] });
        });

        const placements = [];
        let unresolvedClusters = [];
        let rankCursor = 1;
        clusters.forEach(cluster => {
            if (cluster.participantIds.length === 1) {
                placements.push({ rank: rankCursor, participantId: cluster.participantIds[0] });
            } else {
                const groupKey = 'rank_' + rankCursor;
                const result = db._resolveTiebreakCluster(
                    compId, comp, 'final_placement', null, groupKey, cluster, lastStage.roundRange, scoresByParticipant
                );
                if (result.unresolved) {
                    unresolvedClusters.push({ groupKey, participantIds: cluster.participantIds, startRank: rankCursor });
                    cluster.participantIds.forEach(id => placements.push({ rank: rankCursor, participantId: id }));
                } else {
                    // A >1 sub-cluster here only happens via 'split' fallback - all its members share the
                    // SAME joint rank (e.g. joint-2nd), while singleton sub-clusters get sequential ranks.
                    let rankOffset = 0;
                    result.orderedClusters.forEach(sub => {
                        const rank = rankCursor + rankOffset;
                        sub.participantIds.forEach(id => placements.push({ rank, participantId: id }));
                        rankOffset += sub.participantIds.length;
                    });
                }
            }
            rankCursor += cluster.participantIds.length;
        });

        return { placements, unresolvedClusters };
    },

    freezeFinalPlacement: async (compId, actor) => {
        const preview = db.computeFinalPlacement(compId);
        if (!preview) throw new Error("Musobaqa yoki Turlar topilmadi");
        if (preview.unresolvedClusters.length > 0) throw new Error("Ba'zi o'rinlarda teng ball hali hal qilinmagan");
        const dbData = getDB();
        if (!dbData.competitionAdvancementResults) dbData.competitionAdvancementResults = [];
        const now = new Date().toISOString();
        const existingIdx = dbData.competitionAdvancementResults.findIndex(
            r => r.competitionId === compId && r.context === 'final_placement'
        );
        const record = {
            id: existingIdx > -1 ? dbData.competitionAdvancementResults[existingIdx].id : 'finalfreeze_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            competitionId: compId, context: 'final_placement', turBoundary: null,
            placements: preview.placements,
            frozenAt: now, frozenBy: actor
        };
        if (existingIdx > -1) dbData.competitionAdvancementResults[existingIdx] = record;
        else dbData.competitionAdvancementResults.push(record);
        await persistCompetitionRow('competition_advancement_results', record, { context: 'final_placement' });
        saveDB(dbData);
        return record;
    },

    // Nominations (Best Advocate / Best Memorial / Best Process Performance, etc.) - a manual, holistic
    // admin judgment, not a derived formula. Thin wrapper over the existing db.issueCertificate (first
    // real caller was Phase 8's Results Center certificate wiring) - `category` is just an additional
    // field on the same certificate record, no new storage or engine.
    issueNomination: async (compId, participantId, category, issuedBy) => {
        return db.issueCertificate({
            competitionId: compId,
            userId: participantId,
            title: category,
            category,
            clubName: 'TSUL Court',
            role: 'Nomination',
            placement: null,
            issuedBy
        });
    },

    // === Sport (match_play): matches + groups - completely parallel to competitionScores/getLeaderboard.
    // A match_play competition never calls saveRoundScores/getLeaderboard at all. ===
    getCompetitionMatches: (compId) => {
        const data = getDB();
        return (data.competitionMatches || []).filter(m => m.competitionId === compId);
    },
    createMatch: async (compId, { stage, groupName, roundLabel, teamAId, teamBId, createdBy }) => {
        const id = 'match_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
        const data = {
            stage: stage || 'group', groupName: groupName || null,
            roundLabel: roundLabel || null, teamAId, teamBId,
            scoreA: null, scoreB: null, status: 'scheduled', playedAt: null, createdBy
        };
        const { data: row, error } = await supabase.from('competition_matches')
            .insert({ id, competition_id: compId, data }).select().single();
        if (error) throw error;
        await syncCoreDataFromSupabase();
        return mapCompetitionMatchFromSupabase(row);
    },
    updateMatchResult: async (matchId, scoreA, scoreB, actingUsername = null) => {
        const current = (getDB().competitionMatches || []).find(m => m.id === matchId);
        if (!current) throw new Error('Uchrashuv topilmadi');
        const { id: _drop, competitionId, ...currentData } = current;
        const newData = { ...currentData, scoreA: Number(scoreA) || 0, scoreB: Number(scoreB) || 0, status: 'finished', playedAt: new Date().toISOString() };
        const { error } = await supabase.from('competition_matches').update({ data: newData }).eq('id', matchId);
        if (error) throw error;
        await syncCoreDataFromSupabase();
        await db.lockActivityAttendanceUnit(competitionId, 'competition', 'match_play_match', matchId, actingUsername);
        return (getDB().competitionMatches || []).find(m => m.id === matchId);
    },
    // Only lets a not-yet-played match be removed - a real recorded result can't be silently discarded
    // this way (mirrors the "locked round" spirit of the rest of the competition module).
    deleteMatch: async (matchId) => {
        const match = (getDB().competitionMatches || []).find(m => m.id === matchId);
        if (!match) return;
        if (match.status === 'finished') throw new Error("Yakunlangan uchrashuvni o'chirib bo'lmaydi");
        const { error } = await supabase.from('competition_matches').delete().eq('id', matchId);
        if (error) throw error;
        await syncCoreDataFromSupabase();
    },
    getCompetitionGroups: (compId) => {
        const data = getDB();
        return (data.competitionGroups || []).filter(g => g.competitionId === compId);
    },
    setCompetitionGroups: async (compId, groups) => {
        const { error: delErr } = await supabase.from('competition_groups').delete().eq('competition_id', compId);
        if (delErr) throw delErr;
        const rows = groups.map(g => ({
            id: 'group_' + Date.now().toString() + Math.random().toString(36).slice(2, 8),
            competition_id: compId, data: { name: g.name, participantIds: g.participantIds || [] }
        }));
        if (rows.length > 0) {
            const { error: insErr } = await supabase.from('competition_groups').insert(rows);
            if (insErr) throw insErr;
        }
        await syncCoreDataFromSupabase();
        return (getDB().competitionGroups || []).filter(g => g.competitionId === compId);
    },

    // === Munozara match-based engine (debate_match) - sibling to the Sport block above, but scored per
    // individual notiq (speaker) instead of per whole team. competitionGroups is reused verbatim for
    // group-stage grouping. A debate_match competition never calls saveRoundScores/getLeaderboard. ===
    getDebateMatches: (compId) => {
        const data = getDB();
        return (data.debateMatches || []).filter(m => m.competitionId === compId);
    },
    createDebateMatch: async (compId, { stage, groupName, roundLabel, teamTId, teamIId, createdBy }) => {
        const id = 'debate_match_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
        const data = {
            stage: stage || 'group', groupName: groupName || null,
            roundLabel: roundLabel || null, teamTId, teamIId,
            status: 'scheduled', playedAt: null,
            scoreT: null, scoreI: null, winnerTeamId: null, tieBreakManual: false, createdBy,
            // When this specific pairing is meant to actually happen - separate from `playedAt` (only
            // ever set retroactively once the match is finished). Shown in the "Jadval" tab.
            scheduledDate: null, scheduledStartTime: null, scheduledEndTime: null
        };
        const { data: row, error } = await supabase.from('debate_matches')
            .insert({ id, competition_id: compId, data }).select().single();
        if (error) throw error;
        await syncCoreDataFromSupabase();
        return mapDebateMatchFromSupabase(row);
    },
    // Partial-merge update, same idiom as setTurSchedule - admin/delegate sets whichever of
    // scheduledDate/scheduledStartTime/scheduledEndTime they have, the rest stay whatever they were.
    setDebateMatchSchedule: async (matchId, updates) => {
        const current = (getDB().debateMatches || []).find(m => m.id === matchId);
        if (!current) throw new Error('Uchrashuv topilmadi');
        const { id: _drop, competitionId, ...currentData } = current;
        const newData = { ...currentData, ...updates, scheduleUpdatedAt: new Date().toISOString() };
        const { error } = await supabase.from('debate_matches').update({ data: newData }).eq('id', matchId);
        if (error) throw error;
        await syncCoreDataFromSupabase();
        return (getDB().debateMatches || []).find(m => m.id === matchId);
    },
    // Only lets a not-yet-played match be removed (same "no discarding a real result" rule as
    // deleteMatch), and - unlike Sport's matches, which have no child records - must cascade-delete this
    // match's own lineup/notiq-score/best-speaker rows so they don't become orphaned overlay entries.
    deleteDebateMatch: async (matchId) => {
        const match = (getDB().debateMatches || []).find(m => m.id === matchId);
        if (!match) return;
        if (match.status === 'finished') throw new Error("Yakunlangan uchrashuvni o'chirib bo'lmaydi");
        const results = await Promise.all([
            supabase.from('debate_matches').delete().eq('id', matchId),
            supabase.from('debate_match_lineups').delete().eq('match_id', matchId),
            supabase.from('debate_match_notiq_scores').delete().eq('match_id', matchId),
            supabase.from('debate_match_best_speaker_picks').delete().eq('match_id', matchId)
        ]);
        const failed = results.find(r => r.error);
        if (failed) throw failed.error;
        await syncCoreDataFromSupabase();
    },
    // Resolves each lineup row's real roster member via getTeamMembers's own join idiom (studentById map).
    getDebateMatchLineup: (matchId) => {
        const dbData = getDB();
        const rows = (dbData.debateMatchLineups || []).filter(l => l.matchId === matchId);
        const studentById = new Map(db.getMockStudents().map(s => [s.id, s]));
        return rows.map(l => ({ ...l, member: studentById.get(l.memberUserId) || null }));
    },
    // Upsert by (matchId, notiqSlot) - assigning a new member to an already-filled slot replaces it.
    setDebateMatchLineup: async (matchId, notiqSlot, memberUserId, assignedBy) => {
        const { error: delErr } = await supabase.from('debate_match_lineups')
            .delete().eq('match_id', matchId).eq('data->>notiqSlot', notiqSlot);
        if (delErr) throw delErr;
        const id = 'debate_lineup_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
        const data = { notiqSlot, memberUserId, assignedBy, assignedAt: new Date().toISOString() };
        const { data: row, error } = await supabase.from('debate_match_lineups')
            .insert({ id, match_id: matchId, data }).select().single();
        if (error) throw error;
        await syncCoreDataFromSupabase();
        return mapDebateMatchLineupFromSupabase(row);
    },
    getDebateNotiqScores: (matchId) => {
        const data = getDB();
        return (data.debateMatchNotiqScores || []).filter(s => s.matchId === matchId);
    },
    // Upsert by (matchId, notiqSlot, judge) - same one-judge-one-entry convention saveRoundScores uses.
    // Called on every score edit in the judging grid, so it deliberately does NOT run
    // syncCoreDataFromSupabase (a 20-table re-fetch) — that made each keystroke wait on a full reload and
    // the grid feel frozen. The write goes to Supabase as before; the local mirror is patched in place
    // with exactly the row that was just written, which is the same state a sync would have produced.
    saveDebateNotiqScores: async (matchId, notiqSlot, judge, criteriaScores) => {
        const dbData = getDB();
        if (!dbData.debateMatchNotiqScores) dbData.debateMatchNotiqScores = [];
        const existing = dbData.debateMatchNotiqScores
            .find(s => s.matchId === matchId && s.notiqSlot === notiqSlot && s.judge === judge);
        const timestamp = new Date().toISOString();
        if (existing) {
            const data = { notiqSlot, judge, criteriaScores, enteredAt: existing.enteredAt, updatedAt: timestamp };
            const { error } = await supabase.from('debate_match_notiq_scores').update({ data }).eq('id', existing.id);
            if (error) throw error;
            Object.assign(existing, data);
        } else {
            const id = 'debate_notiq_score_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
            const data = { notiqSlot, judge, criteriaScores, enteredAt: timestamp, updatedAt: timestamp };
            const { error } = await supabase.from('debate_match_notiq_scores').insert({ id, match_id: matchId, data });
            if (error) throw error;
            dbData.debateMatchNotiqScores.push({ ...data, id, matchId });
        }
        saveDB(dbData);
    },
    getDebateBestSpeakerPicks: (matchId) => {
        const data = getDB();
        return (data.debateMatchBestSpeakerPicks || []).filter(p => p.matchId === matchId);
    },
    // Upsert by (matchId, side, judge) - one pick per judge per side per match.
    setDebateBestSpeakerPick: async (matchId, side, notiqSlot, judge) => {
        const { error: delErr } = await supabase.from('debate_match_best_speaker_picks')
            .delete().eq('match_id', matchId).eq('data->>side', side).eq('data->>judge', judge);
        if (delErr) throw delErr;
        const id = 'debate_best_speaker_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
        const data = { side, notiqSlot, judge, pickedAt: new Date().toISOString() };
        const { data: row, error } = await supabase.from('debate_match_best_speaker_picks')
            .insert({ id, match_id: matchId, data }).select().single();
        if (error) throw error;
        await syncCoreDataFromSupabase();
        return mapDebateMatchBestSpeakerPickFromSupabase(row);
    },
    // Freezes a match's final result: computes both teams' totals from every judge's entered notiq
    // scores (via computeTeamMatchTotal/aggregateNotiqAcrossJudges), decides the winner
    // (computeDebateMatchWinner), and - on a genuine tie - requires a human's manualWinnerTeamId instead
    // of guessing (no tiebreak cascade for debate, per the approved design).
    finishDebateMatch: async (matchId, actingUsername, manualWinnerTeamId = null) => {
        const dbData = getDB();
        const match = (dbData.debateMatches || []).find(m => m.id === matchId);
        if (!match) throw new Error('Uchrashuv topilmadi');
        const comp = (dbData.competitions || []).find(c => c.id === match.competitionId);
        const calculationMethod = comp?.calculationMethod || 'average';
        // Engine-aware slots+rubric (see resolveMatchScoringShape) - for Munozara this resolves to exactly
        // the previous NOTIQ_SLOTS/DEBATE_MATCH_CRITERIA pair, so its math is unchanged.
        const { slots, criteria } = resolveMatchScoringShape(comp);
        const allScores = (dbData.debateMatchNotiqScores || []).filter(s => s.matchId === matchId);
        const notiqEntriesBySlot = {};
        slots.forEach(slot => {
            notiqEntriesBySlot[slot] = allScores.filter(s => s.notiqSlot === slot).map(s => ({ judge: s.judge, criteriaScores: s.criteriaScores }));
        });
        // Sides split off the slot list itself rather than fixed literals: a 1-sided court match ('J*'
        // slots) puts everything on side T and leaves side I empty, which is exactly what
        // computeDebateMatchWinner's `!teamIId` branch already expects.
        const tSlots = slots.filter(s => !s.startsWith('I'));
        const iSlots = slots.filter(s => s.startsWith('I'));
        const scoreT = computeTeamMatchTotal(notiqEntriesBySlot, tSlots, calculationMethod, criteria);
        const scoreI = computeTeamMatchTotal(notiqEntriesBySlot, iSlots, calculationMethod, criteria);
        let winnerTeamId = computeDebateMatchWinner(scoreT, scoreI, match.teamTId, match.teamIId);
        let tieBreakManual = false;
        if (winnerTeamId === null) {
            if (manualWinnerTeamId !== match.teamTId && manualWinnerTeamId !== match.teamIId) {
                throw new Error("Durang holatida g'olibni qo'lda tanlash kerak");
            }
            winnerTeamId = manualWinnerTeamId;
            tieBreakManual = true;
        }
        const { id: _drop, competitionId, ...currentData } = match;
        const newData = { ...currentData, scoreT, scoreI, winnerTeamId, tieBreakManual, status: 'finished', playedAt: new Date().toISOString() };
        const { error } = await supabase.from('debate_matches').update({ data: newData }).eq('id', matchId);
        if (error) throw error;
        await syncCoreDataFromSupabase();
        await db.lockActivityAttendanceUnit(match.competitionId, 'competition', 'debate_match_bench', matchId, actingUsername);
        return (getDB().debateMatches || []).find(m => m.id === matchId);
    },
    // Team rating - every participant (a team stays visible with its accumulated Jami ball even after
    // elimination, per the approved design), Jami ball = sum of its own score across every FINISHED match
    // it played (T or I side), plus a per-match breakdown and a 4-value status (matches computeDebateMatchWinner's
    // "no algorithmic tiebreak" stance: status is derived from real match records only, never guessed).
    getDebateTeamRating: (compId) => {
        const dbData = getDB();
        const comp = (dbData.competitions || []).find(c => c.id === compId);
        if (!comp) return [];
        const matches = (dbData.debateMatches || []).filter(m => m.competitionId === compId && m.status === 'finished');
        return (comp.participants || []).map(p => {
            const played = matches.filter(m => m.teamTId === p.id || m.teamIId === p.id);
            const totalBall = played.reduce((sum, m) => sum + (m.teamTId === p.id ? m.scoreT : m.scoreI), 0);
            const matchBreakdown = played.map(m => ({
                matchId: m.id, stage: m.stage, roundLabel: m.roundLabel,
                side: m.teamTId === p.id ? 'tasdiqlovchi' : 'inkor',
                ownScore: m.teamTId === p.id ? m.scoreT : m.scoreI,
                opponentScore: m.teamTId === p.id ? m.scoreI : m.scoreT,
                won: m.winnerTeamId === p.id
            }));
            const finalMatch = played.find(m => m.stage === 'playoff' && m.roundLabel === 'Final');
            const semiMatch = played.find(m => m.stage === 'playoff' && m.roundLabel === 'Yarim final');
            const wasEliminated = played.some(m => m.stage === 'playoff' && m.winnerTeamId && m.winnerTeamId !== p.id);
            let status;
            if (finalMatch) status = finalMatch.winnerTeamId === p.id ? "G'olib" : 'Finalda';
            else if (semiMatch) status = wasEliminated ? 'Chiqib ketdi' : 'Yarim finalda';
            else if (wasEliminated) status = 'Chiqib ketdi';
            else if (played.some(m => m.stage === 'playoff')) status = 'Pley-offda';
            else status = 'Guruh bosqichida';
            return { participant: p, totalBall, matchesPlayed: played.length, matchBreakdown, status };
        }).sort((a, b) => b.totalBall - a.totalBall);
    },
    // Cross-match best-speaker leaderboard - groups every finished match's notiq aggregate scores by the
    // real roster member who spoke that slot (via debateMatchLineups), sorted by average (doesn't
    // penalize a speaker with fewer matches than others).
    getDebateBestSpeakerLeaderboard: (compId) => {
        const dbData = getDB();
        const comp = (dbData.competitions || []).find(c => c.id === compId);
        if (!comp) return [];
        const calculationMethod = comp.calculationMethod || 'average';
        const { slots, criteria } = resolveMatchScoringShape(comp);
        const matches = (dbData.debateMatches || []).filter(m => m.competitionId === compId && m.status === 'finished');
        const studentById = new Map(db.getMockStudents().map(s => [s.id, s]));
        const byMember = new Map(); // memberUserId -> { totalScore, matchesPlayed }
        matches.forEach(m => {
            const lineups = (dbData.debateMatchLineups || []).filter(l => l.matchId === m.id);
            const scores = (dbData.debateMatchNotiqScores || []).filter(s => s.matchId === m.id);
            slots.forEach(slot => {
                const lineup = lineups.find(l => l.notiqSlot === slot);
                if (!lineup) return;
                const judgeEntries = scores.filter(s => s.notiqSlot === slot).map(s => ({ judge: s.judge, criteriaScores: s.criteriaScores }));
                if (judgeEntries.length === 0) return;
                const { aggregate } = aggregateNotiqAcrossJudges(judgeEntries, slot, calculationMethod, criteria);
                const prev = byMember.get(lineup.memberUserId) || { totalScore: 0, matchesPlayed: 0 };
                byMember.set(lineup.memberUserId, { totalScore: prev.totalScore + aggregate, matchesPlayed: prev.matchesPlayed + 1 });
            });
        });
        return [...byMember.entries()]
            .map(([memberUserId, agg]) => ({
                memberUserId, student: studentById.get(memberUserId) || null,
                matchesPlayed: agg.matchesPlayed, totalScore: Math.round(agg.totalScore * 10) / 10,
                averageScore: Math.round((agg.totalScore / agg.matchesPlayed) * 10) / 10
            }))
            .sort((a, b) => b.averageScore - a.averageScore);
    },

    getLeaderboard: (compId) => {
        const data = getDB();
        const comp = (data.competitions || []).find(c => c.id === compId);
        if (!comp) return [];
        
        const scores = (data.competitionScores || []).filter(s => s.competitionId === compId);
        
        // Group scores by participant
        const participantScores = {};
        comp.participants.forEach(p => {
            participantScores[p.id] = {
                participant: p,
                rounds: {}, // roundIndex -> { judgeName -> scoreValue }
                totalScore: 0,
                averageScore: 0,
                qualification: 'none' // 'Winner', 'Qualified', 'Eliminated', 'none'
            };
        });
        
        // Per-question point-value overrides (Natija kiritish grid's "Ball" row, correct_answer only).
        // A question with no override row keeps using the flat pointsPerCorrectAnswer fallback below -
        // byte-identical to every competition that never uses the grid's per-question override.
        const questionPointOverrides = comp.scoringMethod === 'correct_answer'
            ? new Map((data.competitionQuestionPoints || []).filter(r => r.competitionId === compId).map(r => [r.questionIndex, r.points]))
            : null;

        scores.forEach(s => {
            if (!participantScores[s.participantId]) return;

            if (!participantScores[s.participantId].rounds[s.round]) {
                participantScores[s.participantId].rounds[s.round] = {};
            }

            // Score values depend on the competition scoring method
            let numericVal = 0;
            if (comp.scoringMethod === 'correct_answer') {
                // Configured per-competition (set at creation); old competitions without these fields
                // fall back to the original hardcoded behavior (10 / 0) so their results don't change.
                if (s.value === true) {
                    const override = questionPointOverrides.get(s.round);
                    numericVal = override != null ? override : (comp.pointsPerCorrectAnswer ?? 10);
                } else if (s.value === false) {
                    numericVal = -(comp.penaltyPerWrongAnswer ?? 0);
                }
                // Any other/unset value (not yet scored) leaves numericVal at 0 - no change.
            } else if (comp.scoringMethod === 'single_score') {
                numericVal = Number(s.value) || 0;
            } else if (comp.scoringMethod === 'criteria_based') {
                // Sum all criteria values
                numericVal = Object.values(s.criteriaScores || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
            } else if (comp.scoringMethod === 'winner_selection') {
                // 'Winner' = 3, 'Qualified' = 2, 'Eliminated' = 0
                if (s.value === 'Winner') numericVal = 3;
                else if (s.value === 'Qualified') numericVal = 2;
                else numericVal = 0;
            } else if (comp.scoringMethod === 'quiz_mixed') {
                const ruleType = (comp.roundRules && comp.roundRules[s.round - 1]) || 'standard';
                numericVal = computeQuizMixedPoints(ruleType, s.value, getEffectivePointsTable(comp));
            } else if (comp.scoringMethod === 'debate') {
                numericVal = computeDebateRoundTotal(s.criteriaScores);
            }
            
            participantScores[s.participantId].rounds[s.round][s.judge] = numericVal;
        });
        
        // Debate engine: Chief Judge penalties are stored separately from round scores and
        // subtracted from the final total (not per-round).
        const debatePenaltyTotals = {};
        if (comp.scoringMethod === 'debate') {
            (data.debatePenalties || []).filter(p => p.competitionId === compId).forEach(p => {
                debatePenaltyTotals[p.participantId] = (debatePenaltyTotals[p.participantId] || 0) + (Number(p.points) || 0);
            });
        }

        // Calculate totals, averages, and per-round flat scores
        const leaderboardList = Object.values(participantScores).map(pData => {
            const roundsWithScores = Object.keys(pData.rounds);
            let totalVal = 0;
            let roundsCount = comp.roundsCount || 1;
            
            // Build flat per-round score array for spreadsheet columns
            const roundScores = {}; // { roundNumber: numericScore }
            
            for (let r = 1; r <= roundsCount; r++) {
                const roundJudges = pData.rounds[r] || {};
                const judgeNames = Object.keys(roundJudges);
                
                if (judgeNames.length > 0) {
                    const judgeScores = judgeNames.map(j => roundJudges[j]);
                    let roundScoreValue = 0;
                    
                    if (comp.calculationMethod === 'average') {
                        const sum = judgeScores.reduce((a, b) => a + b, 0);
                        roundScoreValue = Math.round((sum / judgeScores.length) * 10) / 10;
                    } else {
                        roundScoreValue = judgeScores.reduce((a, b) => a + b, 0);
                    }
                    totalVal += roundScoreValue;
                    roundScores[r] = roundScoreValue;
                } else {
                    roundScores[r] = null; // No score yet for this round
                }
            }
            
            if (comp.scoringMethod === 'debate') {
                const penalty = debatePenaltyTotals[pData.participant.id] || 0;
                totalVal -= penalty;
                pData.penaltyTotal = penalty;
            }

            pData.totalScore = Math.round(totalVal * 10) / 10;
            pData.averageScore = roundsWithScores.length > 0 ? (totalVal / roundsWithScores.length) : 0;
            pData.roundScores = roundScores; // flat map for table columns
            
            // Determine Qualification for Winner Selection mode
            let latestRound = 1;
            roundsWithScores.forEach(r => {
                const roundNum = Number(r);
                if (roundNum > latestRound) latestRound = roundNum;
            });
            const latestRoundScores = pData.rounds[latestRound] || {};
            const judgesList = Object.keys(latestRoundScores);
            if (judgesList.length > 0) {
                const matchScore = scores.find(s => s.participantId === pData.participant.id && s.round === latestRound);
                if (matchScore && comp.scoringMethod === 'winner_selection') {
                    pData.qualification = matchScore.value;
                }
            }
            
            return pData;
        });
        
        // Sort by totalScore descending
        leaderboardList.sort((a, b) => b.totalScore - a.totalScore);
        
        // Assign ranks (handle ties)
        let currentRank = 1;
        for (let i = 0; i < leaderboardList.length; i++) {
            if (i > 0 && leaderboardList[i].totalScore < leaderboardList[i - 1].totalScore) {
                currentRank = i + 1;
            }
            leaderboardList[i].rank = currentRank;
        }
        
        return leaderboardList;
    },
    
    // MOCK DATA GENERATORS
    getMockStudents: () => generateMockStudents(),
    getMockTeams: () => {
        const teamPrefixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Sigma', 'Omega', 'Zeta', 'Theta', 'Falcon', 'Eagle', 'Phoenix', 'Titan', 'Apex', 'Matrix', 'Infinity', 'Quantum', 'Cyber', 'Stellar', 'Nebula', 'Cosmos'];
        const teamSuffixes = ['Jamoasi', 'Klubi', 'Guruh', 'Ittifoqi', 'Jangchilari', 'Ritsarlari', 'Devs', 'Hunters'];
        
        const teams = [];
        for (let i = 1; i <= 200; i++) {
            const prefix = teamPrefixes[i % teamPrefixes.length];
            const suffix = teamSuffixes[(i + 5) % teamSuffixes.length];
            teams.push({
                id: `team_${i}`,
                name: `${prefix} ${suffix} #${i}`,
                membersCount: (i % 8) + 3 // 3 to 10 members
            });
        }
        return teams;
    },

    // SOCIAL ACTIVITY MODULE (Ijtimoiy faollik)
    getSocialApplications: () => getDB().socialActivityApplications || [],
    getSocialApplicationById: (id) => (getDB().socialActivityApplications || []).find(a => a.id === id),
    // ASYNC: ariza endi bazaga yoziladi. Ilgari u faqat localStorage da
    // qolardi va admin boshqa kompyuterda uni umuman ko'rmasdi.
    createSocialApplication: async (data) => {
        const dbData = getDB();
        if (!dbData.socialActivityApplications) dbData.socialActivityApplications = [];
        if (!dbData.socialActivityAuditLogs) dbData.socialActivityAuditLogs = [];

        const timestamp = new Date().toISOString();
        const newApplication = {
            id: 'sapp_' + Date.now().toString(),
            status: SOCIAL_APPLICATION_STATUS.PENDING,
            pointsAwarded: null,
            reviewerComment: null,
            reviewedBy: null,
            reviewedAt: null,
            ...data,
            submittedAt: timestamp
        };
        dbData.socialActivityApplications.push(newApplication);

        const submitLog = {
            id: 'salog_' + Math.random().toString(36).slice(2, 11),
            applicationId: newApplication.id,
            action: 'SUBMITTED',
            fromStatus: null,
            toStatus: SOCIAL_APPLICATION_STATUS.PENDING,
            reviewer: data.studentFullName,
            comment: '',
            pointsAwarded: null,
            time: timestamp
        };
        dbData.socialActivityAuditLogs.push(submitLog);

        pendingSocialAppWrites.push(newApplication);
        pendingSocialLogWrites.push(submitLog);
        await flushSocialWrites();

        saveDB(dbData);
        return newApplication;
    },
    reviewSocialApplication: async (applicationId, options) => {
        const results = await db.bulkReviewSocialApplications([applicationId], options);
        return results[0] || null;
    },
    // Phase 0 da async bo'ldi: tasdiqlangan arizadan tug'ilgan ball yozuvi endi
    // serverga ham yoziladi. `applySocialApplicationReview` sof sinxron qoladi -
    // u faqat yangi yozuvlarni navbatga qo'yadi, yozishni shu funksiya bajaradi.
    bulkReviewSocialApplications: async (applicationIds, { action, reviewer, comment = '' }) => {
        const dbData = getDB();
        if (!dbData.socialActivityApplications) dbData.socialActivityApplications = [];
        if (!dbData.socialActivityAuditLogs) dbData.socialActivityAuditLogs = [];
        if (!dbData.socialScoreTransactions) dbData.socialScoreTransactions = [];

        pendingSocialScoreWrites.length = 0;
        const updated = applicationIds
            .map(id => applySocialApplicationReview(dbData, id, action, reviewer, comment))
            .filter(Boolean);

        if (pendingSocialScoreWrites.length > 0) {
            const { error } = await supabase.from('social_score_transactions').insert(
                pendingSocialScoreWrites.map(t => ({
                    id: t.id, student_id: t.studentId, application_id: t.applicationId,
                    category: t.category, points: t.points, academic_year: t.academicYear,
                    created_at: t.createdAt,
                    data: {
                        studentFullName: t.studentFullName, scoringSourceId: t.scoringSourceId,
                        scoringSourceCode: t.scoringSourceCode, scoringSourceName: t.scoringSourceName,
                        appliesTo: t.appliesTo, createdBy: t.createdBy
                    }
                }))
            );
            pendingSocialScoreWrites.length = 0;
            if (error) throw error;
        }

        // Arizaning O'ZI va tarix yozuvi ham serverga ketadi. Ilgari faqat ball
        // yozuvi ko'chardi va admin boshqa kompyuterda arizani ko'rmasdi.
        await flushSocialWrites();

        saveDB(dbData);
        return updated;
    },

    // =========================================================================
    // STIPENDIYALAR
    //
    // Butun blok real backendda (scholarship_grants / scholarship_applications /
    // scholarship_settings). Avval grantlar localStorage['uni_grants'] da, me'zonlar
    // esa komponent `useState` ida edi - boshqa kompyuterdan kirgan admin butunlay
    // boshqa ma'lumot ko'rardi. Yozuvlardan keyin mahalliy nusxa joyida yamaladi
    // (patchLocal), 20+ jadvalli to'liq sinxronlash o'rniga - hujjat tizimidagi
    // bilan bir xil idiom.
    // =========================================================================

    // Stipendiya jadvallari Supabase'da bormi (oxirgi sinxronlash bo'yicha). `false` bo'lsa
    // interfeys ogohlantiradi: yozuvlar hech qayerga saqlanmaydi.
    isScholarshipBackendReady: () => getDB().scholarshipBackendReady !== false,

    // --- Grantlar ---
    getScholarshipGrants: () => (getDB().scholarshipGrants || []),

    getScholarshipGrant: (grantId) =>
        (getDB().scholarshipGrants || []).find(g => g.id === grantId) || null,

    // Talaba moduli faqat shularni ko'radi. Muddat/kvota tekshiruvi UI tomonda
    // (getGrantOpenState) - bu yerda faqat holat bo'yicha filtr.
    getActiveScholarshipGrants: () =>
        (getDB().scholarshipGrants || []).filter(g => g.status === 'active'),

    createScholarshipGrant: async (payload) => {
        await assertAuthenticated();
        const id = 'grant_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        const status = normalizeGrantStatus(payload.status);
        const { title, deadline, ...rest } = payload;
        const data = { ...rest, createdBy: payload.createdBy || null };
        const { error } = await supabase.from('scholarship_grants').insert({
            id, title: title || 'Nomsiz grant', status, deadline: deadline || null, data
        });
        if (error) throw error;
        const record = { ...data, id, title, status, deadline: deadline || null, createdAt: new Date().toISOString() };
        const dbData = getDB();
        if (!dbData.scholarshipGrants) dbData.scholarshipGrants = [];
        dbData.scholarshipGrants.push(record);
        saveDB(dbData);
        return record;
    },

    updateScholarshipGrant: async (grantId, patch) => {
        const dbData = getDB();
        const current = (dbData.scholarshipGrants || []).find(g => g.id === grantId);
        if (!current) throw new Error('Grant topilmadi');

        const merged = { ...current, ...patch };
        const { id, title, status, deadline, createdAt, updatedAt, ...data } = merged;
        const { error } = await supabase.from('scholarship_grants').update({
            title: title || 'Nomsiz grant',
            status: normalizeGrantStatus(status),
            deadline: deadline || null,
            updated_at: new Date().toISOString(),
            data
        }).eq('id', grantId);
        if (error) throw error;

        Object.assign(current, merged, { status: normalizeGrantStatus(status) });
        saveDB(dbData);
        return current;
    },

    // Arizasi bor grant o'chirilmaydi - arizalar "yetim" qolib ketmasligi uchun.
    // Bunday holatda mas'ulga arxivlash taklif qilinadi (UI shuni ko'rsatadi).
    deleteScholarshipGrant: async (grantId) => {
        const dbData = getDB();
        const linked = (dbData.scholarshipApplications || []).filter(a => a.grantId === grantId);
        if (linked.length > 0) {
            throw new Error(`Bu grantga ${linked.length} ta ariza bog'langan - o'chirib bo'lmaydi. Uni arxivlang.`);
        }
        const { error } = await supabase.from('scholarship_grants').delete().eq('id', grantId);
        if (error) throw error;
        dbData.scholarshipGrants = (dbData.scholarshipGrants || []).filter(g => g.id !== grantId);
        saveDB(dbData);
    },

    // --- Arizalar ---
    getScholarshipApplications: () => (getDB().scholarshipApplications || []),

    getScholarshipApplicationsForGrant: (grantId) =>
        (getDB().scholarshipApplications || []).filter(a => a.grantId === grantId),

    getStudentScholarshipApplications: (studentId) =>
        (getDB().scholarshipApplications || []).filter(a => a.studentId === studentId),

    // Talaba shu grantga hozir ariza bera oladimi (bir marta - "tirik" ariza bo'lsa yo'q).
    // Supabase tomonda ham qisman unique indeks bor, bu faqat interfeys uchun oldindan tekshiruv.
    getLiveScholarshipApplication: (studentId, grantId) =>
        (getDB().scholarshipApplications || []).find(a =>
            a.studentId === studentId && a.grantId === grantId &&
            ['draft', 'submitted', 'doc_check', 'committee', 'approved'].includes(a.status)
        ) || null,

    // `declared` - talabaning o'zi kiritgan (manual) me'zon qiymatlari.
    // `attachedDocumentIds` - taqdirlash reyestridagi O'Z hujjatlari; qayta yuklanmaydi,
    // faqat havola qilinadi, shuning uchun soxta hujjat imkoniyati yo'q.
    // `autoScore`/`autoSnapshot` - ariza berilgan PAYTDAGI holat muhrlanadi: keyin
    // talabaning bali o'zgarsa ham komissiya qaysi ma'lumot asosida qaror qilganini ko'radi.
    createScholarshipApplication: async ({
        studentId, grantId, declared = {}, attachedDocumentIds = [], uploadedDocs = [],
        note = '', autoScore = 0, autoSnapshot = null, eligibilitySnapshot = null, status = 'submitted'
    }) => {
        if (!studentId) throw new Error('Talaba aniqlanmadi');
        if (!grantId) throw new Error('Grant tanlanmagan');

        const dbData = getDB();
        const grant = (dbData.scholarshipGrants || []).find(g => g.id === grantId);
        if (!grant) throw new Error('Grant topilmadi');

        const existing = (dbData.scholarshipApplications || []).find(a =>
            a.studentId === studentId && a.grantId === grantId &&
            ['draft', 'submitted', 'doc_check', 'committee', 'approved'].includes(a.status)
        );
        if (existing) throw new Error('Siz bu grantga allaqachon ariza bergansiz');

        const id = 'schapp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        const now = new Date().toISOString();
        // Ariza HAR DOIM zanjirning birinchi bosqichidan boshlanadi - zanjir qanday
        // tuzilganidan qat'i nazar (hujjat ko'rigi, fakultet, test... nima bo'lsa ham).
        const pipeline = resolvePipeline(grant);
        const firstStage = pipeline[0];
        const stage = firstStage?.type === 'faculty_commission' ? 'faculty' : 'university';
        const normalized = status === 'draft' ? 'draft' : statusForStage(firstStage);

        // Fakultet nomi ariza ichida muhrlanadi: reyting fakultet kesimida quriladi va
        // talaba keyin boshqa fakultetga o'tsa ham tanlov natijasi o'zgarmasligi kerak.
        const faculty = generateMockStudents().find(s => s.id === studentId)?.faculty || null;

        const data = {
            grantTitle: grant.title, faculty,
            declared, attachedDocumentIds, uploadedDocs, note,
            autoScore, autoSnapshot, eligibilitySnapshot,
            stageResults: [], testScores: {},
            history: [{ at: now, status: normalized, stageIndex: 0, by: studentId, comment: 'Ariza yuborildi' }]
        };

        const { error } = await supabase.from('scholarship_applications').insert({
            id, grant_id: grantId, student_id: studentId, status: normalized, stage, stage_index: 0,
            submitted_at: normalized === 'draft' ? null : now, data
        });
        if (error) {
            // Qisman unique indeks ishga tushsa - takroriy ariza.
            if (error.code === '23505') throw new Error('Siz bu grantga allaqachon ariza bergansiz');
            throw error;
        }

        const record = {
            ...data, id, grantId, studentId, status: normalized, stage, stageIndex: 0,
            submittedAt: normalized === 'draft' ? null : now, createdAt: now
        };
        if (!dbData.scholarshipApplications) dbData.scholarshipApplications = [];
        dbData.scholarshipApplications.push(record);
        saveDB(dbData);
        return record;
    },

    // Bosqichdan bosqichga o'tkazish ham, yakuniy qaror ham shu bitta funksiya orqali -
    // har bir o'zgarish `history` ga yoziladi, ya'ni "kim, qachon, nima uchun" izi qoladi.
    reviewScholarshipApplication: async (applicationId, { status, reviewer, comment = '' }) => {
        const dbData = getDB();
        const app = (dbData.scholarshipApplications || []).find(a => a.id === applicationId);
        if (!app) throw new Error('Ariza topilmadi');

        // Qaytarilgan ariza TALABADA turadi. Qaysi ekrandan chaqirilishidan
        // qat'i nazar, u tuzatib qayta yubormaguncha qaror qabul qilinmaydi -
        // aks holda qaytarish amali ma'nosini yo'qotadi.
        if (app.status === 'returned') {
            throw new Error(
                "Ariza talabaga tuzatish uchun qaytarilgan. Talaba tuzatib qayta "
                + "yuborgandan keyin qaror qabul qilish mumkin."
            );
        }

        // "Bosqich ichida admin baholashga aralashmaydi" - qoida interfeysdagina emas,
        // shu yerda ham majburlanadi. Zanjirning yakuniy bosqichigacha arizaga faqat
        // biriktirilgan komissiya ta'sir qila oladi; admin kuzatadi va bosqichdan
        // o'tkazishni advanceScholarshipPipeline orqali bajaradi.
        const grant = (dbData.scholarshipGrants || []).find(g => g.id === app.grantId);
        const currentStage = grant ? resolvePipeline(grant)[app.stageIndex ?? 0] : null;
        if (currentStage && currentStage.type !== 'final') {
            if (!canActOnStage(dbData, app, currentStage, reviewer)) {
                throw new Error(
                    `"${currentStage.label}" bosqichidagi arizani faqat shu bosqichga biriktirilgan `
                    + "mas'ul ko'rib chiqadi. Admin bu bosqichda kuzatadi va \"Bosqichlar monitoringi\" "
                    + "orqali o'tkazadi."
                );
            }
        }

        const normalized = normalizeApplicationStatus(status);
        const now = new Date().toISOString();
        const history = [...(app.history || []), { at: now, status: normalized, by: reviewer || 'admin', comment }];
        const isDecision = ['approved', 'rejected'].includes(normalized);

        const { id, grantId, studentId, status: _s, submittedAt, reviewedAt, createdAt, updatedAt, ...rest } = app;
        const data = { ...rest, history, reviewedBy: reviewer || 'admin', reviewComment: comment };

        const { error } = await supabase.from('scholarship_applications').update({
            status: normalized,
            reviewed_at: isDecision ? now : (app.reviewedAt || null),
            updated_at: now,
            data
        }).eq('id', applicationId);
        if (error) throw error;

        Object.assign(app, data, { status: normalized, reviewedAt: isDecision ? now : app.reviewedAt });
        saveDB(dbData);
        return app;
    },

    // Talabaning o'zi qaytarib olishi. Qaror chiqarilgan arizani qaytarib bo'lmaydi.
    withdrawScholarshipApplication: async (applicationId, studentId) => {
        const dbData = getDB();
        const app = (dbData.scholarshipApplications || []).find(a => a.id === applicationId);
        if (!app) throw new Error('Ariza topilmadi');
        if (app.studentId !== studentId) throw new Error('Bu ariza sizga tegishli emas');
        if (['approved', 'rejected', 'withdrawn'].includes(app.status)) {
            throw new Error('Qaror chiqarilgan arizani qaytarib bo\'lmaydi');
        }

        const now = new Date().toISOString();
        const history = [...(app.history || []), { at: now, status: 'withdrawn', by: studentId, comment: 'Talaba arizani qaytarib oldi' }];
        const { id, grantId, studentId: _sid, status, submittedAt, reviewedAt, createdAt, updatedAt, ...rest } = app;

        const { error } = await supabase.from('scholarship_applications').update({
            status: 'withdrawn', updated_at: now, data: { ...rest, history }
        }).eq('id', applicationId);
        if (error) throw error;

        Object.assign(app, { history, status: 'withdrawn' });
        saveDB(dbData);
        return app;
    },

    // =====================================================================
    // IKKI BOSQICHLI TANLOV: fakultet baholash + avtomatik o'tkazish
    // =====================================================================

    // =========================================================================
    // "IQTIDORLI TALABALAR" MODULI (Phase 1 — ma'lumot qatlami)
    //
    // Mavjud stipendiya tizimi TEGILMAYDI. Bu blok uning ustiga qo'shiladi:
    //   - talent_targets.grantId  -> mavjud scholarship_grants
    //   - talent_targets.applicationId -> mavjud scholarship_applications
    // Nomzodlik bosqichida REAL ariza yaratiladi va u mavjud komissiya zanjiriga
    // tushadi; ikkinchi komissiya qurilmaydi.
    // =========================================================================

    isTalentBackendReady: () => getDB().talentBackendReady !== false,

    // --- Profillar ---
    getTalentProfiles: () => (getDB().talentProfiles || []),
    getTalentProfile: (studentId) =>
        (getDB().talentProfiles || []).find(p => p.studentId === studentId) || null,

    getTalentProfilesByFaculty: (faculty) =>
        (getDB().talentProfiles || []).filter(p => !faculty || p.faculty === faculty),

    // Talaba ISTALGAN kursda qo'shilishi mumkin (§72) - 1-kurs yagona yo'l emas.
    enrollTalentStudent: async ({ studentId, program = 'year1', entryRoute = 'survey', survey = {}, by = null }) => {
        await assertAuthenticated();
        const dbData = getDB();
        if ((dbData.talentProfiles || []).some(p => p.studentId === studentId)) {
            throw new Error('Bu talaba allaqachon dasturda');
        }
        const student = generateMockStudents().find(s => s.id === studentId);
        if (!student) throw new Error('Talaba topilmadi');

        const id = 'tprof_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const now = new Date().toISOString();
        const data = { survey, declared: {}, notes: '', enrolledBy: by };

        const { error } = await supabase.from('talent_profiles').insert({
            id, student_id: studentId, program, status: 'active',
            cohort_year: new Date().getFullYear(), entry_route: entryRoute,
            potential_grade: null, talent_score: null, faculty: student.faculty || null,
            enrolled_at: now, data
        });
        if (error) throw error;

        const record = {
            ...data, id, studentId, program, status: 'active',
            cohortYear: new Date().getFullYear(), entryRoute, potentialGrade: null,
            talentScore: null, faculty: student.faculty || null, enrolledAt: now
        };
        (dbData.talentProfiles = dbData.talentProfiles || []).push(record);
        saveDB(dbData);
        await db.logTalentAudit({ entity: 'profile', entityId: id, studentId, action: 'enrolled', actorId: by });
        return record;
    },

    updateTalentProfile: async (studentId, patch, by = null) => {
        await assertAuthenticated();
        const dbData = getDB();
        const current = (dbData.talentProfiles || []).find(p => p.studentId === studentId);
        if (!current) throw new Error('Talent profil topilmadi');

        const merged = { ...current, ...patch };
        const {
            id, studentId: _s, program, status, cohortYear, entryRoute, potentialGrade,
            talentScore, faculty, enrolledAt, updatedAt, ...data
        } = merged;

        const { error } = await supabase.from('talent_profiles').update({
            program, status, cohort_year: cohortYear, entry_route: entryRoute,
            potential_grade: potentialGrade || null,
            talent_score: talentScore === null || talentScore === undefined ? null : Number(talentScore),
            faculty: faculty || null, updated_at: new Date().toISOString(), data
        }).eq('id', id);
        if (error) throw error;

        Object.assign(current, merged);
        saveDB(dbData);
        await db.logTalentAudit({ entity: 'profile', entityId: id, studentId, action: 'updated', actorId: by, detail: patch });
        return current;
    },

    // --- Biriktirishlar (mentor / tyutor / ilmiy rahbar) ---
    getTalentAssignments: (studentId = null) =>
        (getDB().talentAssignments || []).filter(a => !studentId || a.studentId === studentId),

    getActiveAssignments: (studentId) =>
        (getDB().talentAssignments || []).filter(a => a.studentId === studentId && a.active),

    // Bir odam bir nechta rolda va bir nechta talabaga biriktirilishi mumkin (§64).
    getMyMentees: (personId, role = null) =>
        (getDB().talentAssignments || [])
            .filter(a => a.active && a.personId === personId && (!role || a.role === role)),

    isTalentMentor: (personId) =>
        (getDB().talentAssignments || []).some(a => a.active && a.personId === personId),

    assignTalentPerson: async ({ studentId, personId, role, by = null, note = '' }) => {
        await assertAuthenticated();
        const dbData = getDB();
        dbData.talentAssignments = dbData.talentAssignments || [];

        // Shu roldagi avvalgi faol biriktiruv yopiladi - bitta rolda bitta mas'ul.
        const previous = dbData.talentAssignments.find(a =>
            a.studentId === studentId && a.role === role && a.active);
        const now = new Date().toISOString();

        if (previous) {
            if (previous.personId === personId) return previous;
            const { error } = await supabase.from('talent_assignments')
                .update({ active: false, ended_at: now }).eq('id', previous.id);
            if (error) throw error;
            previous.active = false;
            previous.endedAt = now;
        }

        const id = 'tassign_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const { error } = await supabase.from('talent_assignments').insert({
            id, student_id: studentId, person_id: personId, role, active: true,
            assigned_at: now, data: { assignedBy: by, note }
        });
        if (error) throw error;

        const record = { id, studentId, personId, role, active: true, assignedAt: now, assignedBy: by, note };
        dbData.talentAssignments.push(record);
        saveDB(dbData);
        await db.logTalentAudit({ entity: 'assignment', entityId: id, studentId, action: `assigned_${role}`, actorId: by, detail: { personId } });
        return record;
    },

    endTalentAssignment: async (assignmentId, by = null) => {
        await assertAuthenticated();
        const dbData = getDB();
        const a = (dbData.talentAssignments || []).find(x => x.id === assignmentId);
        if (!a) throw new Error('Biriktiruv topilmadi');
        const now = new Date().toISOString();
        const { error } = await supabase.from('talent_assignments')
            .update({ active: false, ended_at: now }).eq('id', assignmentId);
        if (error) throw error;
        a.active = false;
        a.endedAt = now;
        saveDB(dbData);
        await db.logTalentAudit({ entity: 'assignment', entityId: assignmentId, studentId: a.studentId, action: 'ended', actorId: by });
        return a;
    },

    // --- IDP ---
    getTalentIdp: (studentId) =>
        (getDB().talentIdps || []).find(i => i.studentId === studentId && i.status !== 'archived') || null,

    getTalentGoals: (idpId) => (getDB().talentGoals || []).filter(g => g.idpId === idpId),
    getStudentGoals: (studentId) => (getDB().talentGoals || []).filter(g => g.studentId === studentId),

    createTalentIdp: async ({ studentId, periodFrom = null, periodTo = null, by = null }) => {
        await assertAuthenticated();
        const dbData = getDB();
        const existing = (dbData.talentIdps || []).find(i => i.studentId === studentId && i.status !== 'archived');
        if (existing) throw new Error('Bu talabaning faol IDP si allaqachon bor');

        const id = 'tidp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const now = new Date().toISOString();
        const { error } = await supabase.from('talent_idps').insert({
            id, student_id: studentId, status: 'draft',
            period_from: periodFrom, period_to: periodTo, data: { createdBy: by }
        });
        if (error) throw error;

        const record = { id, studentId, status: 'draft', periodFrom, periodTo, createdAt: now, createdBy: by };
        (dbData.talentIdps = dbData.talentIdps || []).push(record);
        saveDB(dbData);
        await db.logTalentAudit({ entity: 'idp', entityId: id, studentId, action: 'created', actorId: by });
        return record;
    },

    updateTalentIdp: async (idpId, patch, by = null) => {
        await assertAuthenticated();
        const dbData = getDB();
        const current = (dbData.talentIdps || []).find(i => i.id === idpId);
        if (!current) throw new Error('IDP topilmadi');
        const merged = { ...current, ...patch };
        const { id, studentId, status, periodFrom, periodTo, createdAt, updatedAt, ...data } = merged;
        const { error } = await supabase.from('talent_idps').update({
            status, period_from: periodFrom || null, period_to: periodTo || null,
            updated_at: new Date().toISOString(), data
        }).eq('id', idpId);
        if (error) throw error;
        Object.assign(current, merged);
        saveDB(dbData);
        await db.logTalentAudit({ entity: 'idp', entityId: idpId, studentId: current.studentId, action: 'updated', actorId: by });
        return current;
    },

    // Maqsad SMART: deadline, status, progress, mas'ul, dalil (§15).
    createTalentGoal: async ({ idpId, studentId, category, title, deadline = null, responsibleId = null, description = '', by = null }) => {
        await assertAuthenticated();
        if (!title?.trim()) throw new Error('Maqsad nomini kiriting');

        const id = 'tgoal_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const data = { description, evidence: [], createdBy: by };
        const { error } = await supabase.from('talent_goals').insert({
            id, idp_id: idpId, student_id: studentId, category, title: title.trim(),
            deadline, status: 'planned', progress: 0, responsible_id: responsibleId, data
        });
        if (error) throw error;

        const record = {
            ...data, id, idpId, studentId, category, title: title.trim(),
            deadline, status: 'planned', progress: 0, responsibleId
        };
        const dbData = getDB();
        (dbData.talentGoals = dbData.talentGoals || []).push(record);
        saveDB(dbData);
        await db.logTalentAudit({ entity: 'goal', entityId: id, studentId, action: 'created', actorId: by, detail: { title } });
        return record;
    },

    updateTalentGoal: async (goalId, patch, by = null) => {
        await assertAuthenticated();
        const dbData = getDB();
        const current = (dbData.talentGoals || []).find(g => g.id === goalId);
        if (!current) throw new Error('Maqsad topilmadi');

        const merged = { ...current, ...patch };
        // Bajarilgan maqsad har doim 100% - ikkisi bir-biriga zid bo'lib qolmasin.
        if (merged.status === 'done') merged.progress = 100;
        const { id, idpId, studentId, category, title, deadline, status, progress, responsibleId, updatedAt, ...data } = merged;

        const { error } = await supabase.from('talent_goals').update({
            category, title, deadline: deadline || null, status,
            progress: Math.max(0, Math.min(100, Number(progress) || 0)),
            responsible_id: responsibleId || null,
            updated_at: new Date().toISOString(), data
        }).eq('id', goalId);
        if (error) throw error;

        Object.assign(current, merged);
        saveDB(dbData);
        await db.logTalentAudit({ entity: 'goal', entityId: goalId, studentId: current.studentId, action: 'updated', actorId: by, detail: patch });
        return current;
    },

    deleteTalentGoal: async (goalId, by = null) => {
        await assertAuthenticated();
        const dbData = getDB();
        const goal = (dbData.talentGoals || []).find(g => g.id === goalId);
        const { error } = await supabase.from('talent_goals').delete().eq('id', goalId);
        if (error) throw error;
        dbData.talentGoals = (dbData.talentGoals || []).filter(g => g.id !== goalId);
        saveDB(dbData);
        if (goal) await db.logTalentAudit({ entity: 'goal', entityId: goalId, studentId: goal.studentId, action: 'deleted', actorId: by });
    },

    // Dalil qo'shish. `type: 'document'` bo'lsa MAVJUD hujjat reyestridagi
    // yozuvga havola qilinadi - qayta yuklash talab qilinmaydi (§29, §65).
    addGoalEvidence: async (goalId, { type, ref, label, by = null }) => {
        await assertAuthenticated();
        const dbData = getDB();
        const goal = (dbData.talentGoals || []).find(g => g.id === goalId);
        if (!goal) throw new Error('Maqsad topilmadi');

        const evidence = [...(goal.evidence || []), {
            id: 'ev_' + Date.now().toString(36), type, ref, label,
            addedAt: new Date().toISOString(), addedBy: by
        }];
        return db.updateTalentGoal(goalId, { evidence }, by);
    },

    // --- Monitoring ---
    getTalentMonitoring: (studentId) =>
        (getDB().talentMonitoring || [])
            .filter(m => m.studentId === studentId)
            .sort((a, b) => String(b.period).localeCompare(String(a.period))),

    // Bir davr uchun bir roldan bitta yozuv - qayta yozilsa yangilanadi.
    saveTalentMonitoring: async ({ studentId, period, periodType = 'month', byId, byRole, flag = 'green', ratings = {}, notes = '', problems = '', recommendations = '', nextGoals = '' }) => {
        await assertAuthenticated();
        const dbData = getDB();
        dbData.talentMonitoring = dbData.talentMonitoring || [];

        const existing = dbData.talentMonitoring.find(m =>
            m.studentId === studentId && m.period === period && m.byRole === byRole);
        const id = existing?.id || 'tmon_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const data = { ratings, notes, problems, recommendations, nextGoals };

        const { error } = await supabase.from('talent_monitoring').upsert({
            id, student_id: studentId, period, period_type: periodType,
            by_id: byId, by_role: byRole, flag, data
        }, { onConflict: 'student_id,period,by_role' });
        if (error) throw error;

        const record = { ...data, id, studentId, period, periodType, byId, byRole, flag };
        if (existing) Object.assign(existing, record);
        else dbData.talentMonitoring.push(record);
        saveDB(dbData);
        await db.logTalentAudit({ entity: 'monitoring', entityId: id, studentId, action: 'recorded', actorId: byId, detail: { period, flag } });
        return record;
    },

    // --- Stipendiya maqsadlari (target) ---
    getTalentTargets: (studentId = null) =>
        (getDB().talentTargets || []).filter(t => !studentId || t.studentId === studentId),

    getTalentTargetsForGrant: (grantId) =>
        (getDB().talentTargets || []).filter(t => t.grantId === grantId),

    createTalentTarget: async ({ studentId, grantId = null, awardKey = null, priority = 1, by = null }) => {
        await assertAuthenticated();
        if (!grantId && !awardKey) throw new Error('Grant yoki davlat mukofoti tanlanishi kerak');

        const dbData = getDB();
        const duplicate = (dbData.talentTargets || []).find(t =>
            t.studentId === studentId && t.grantId === grantId && t.awardKey === awardKey && t.status !== 'archived');
        if (duplicate) throw new Error('Bu maqsad allaqachon belgilangan');

        const id = 'ttarget_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const { error } = await supabase.from('talent_targets').insert({
            id, student_id: studentId, grant_id: grantId, award_key: awardKey,
            status: 'not_started', readiness: 0, priority, data: { createdBy: by, history: [] }
        });
        if (error) throw error;

        const record = { id, studentId, grantId, awardKey, status: 'not_started', readiness: 0, priority, history: [] };
        (dbData.talentTargets = dbData.talentTargets || []).push(record);
        saveDB(dbData);
        await db.logTalentAudit({ entity: 'target', entityId: id, studentId, action: 'created', actorId: by, detail: { grantId, awardKey } });
        return record;
    },

    updateTalentTarget: async (targetId, patch, by = null) => {
        await assertAuthenticated();
        const dbData = getDB();
        const current = (dbData.talentTargets || []).find(t => t.id === targetId);
        if (!current) throw new Error('Maqsad topilmadi');

        const merged = { ...current, ...patch };
        if (patch.status && patch.status !== current.status) {
            merged.history = [...(current.history || []), {
                at: new Date().toISOString(), status: patch.status, by: by || 'system'
            }];
        }
        const { id, studentId, grantId, awardKey, status, readiness, applicationId, priority, updatedAt, ...data } = merged;

        const { error } = await supabase.from('talent_targets').update({
            grant_id: grantId, award_key: awardKey, status,
            readiness: Number(readiness) || 0, application_id: applicationId || null,
            priority, updated_at: new Date().toISOString(), data
        }).eq('id', targetId);
        if (error) throw error;

        Object.assign(current, merged);
        saveDB(dbData);
        return current;
    },

    // Tayyorgarlik foizini yangilash - qayta hisoblangan qiymat saqlanadi,
    // shunda monitoring va dashboard uni qayta hisoblab o'tirmaydi.
    setTargetReadiness: async (targetId, readiness, autoStatus = null) => {
        const dbData = getDB();
        const target = (dbData.talentTargets || []).find(t => t.id === targetId);
        if (!target) return null;
        // Qo'lda belgilangan yuqori holatlar avtomatik tushirilmaydi.
        const locked = ['candidate', 'submitted', 'recommended', 'won', 'not_selected', 'archived'];
        const patch = { readiness };
        if (autoStatus && !locked.includes(target.status)) patch.status = autoStatus;
        return db.updateTalentTarget(targetId, patch, 'system');
    },

    // Nomzodlikka uzatish — ENG MUHIM INTEGRATSIYA NUQTASI.
    //
    // Talaba "Ready" holatiga yetganda bu funksiya MAVJUD stipendiya tizimida
    // real ariza yaratadi. Shundan keyin ariza o'sha grantning o'z zanjiriga
    // (hujjat ko'rigi -> komissiya -> yakun) tushadi.
    //
    // Ikkinchi komissiya, ikkinchi hujjat oqimi, ikkinchi arxiv QURILMAYDI:
    // ikkita mexanizm ikkita haqiqat manbai degani bo'lardi.
    promoteTalentTargetToCandidate: async (targetId, { by } = {}) => {
        await assertAuthenticated();
        const dbData = getDB();
        const target = (dbData.talentTargets || []).find(t => t.id === targetId);
        if (!target) throw new Error('Maqsad topilmadi');
        if (!target.grantId) {
            throw new Error(
                "Davlat mukofotlari uchun ariza avtomatik yaratilmaydi - rasmiy nomzodlik "
                + 'vakolatli komissiya qarori bilan belgilanadi.'
            );
        }
        if (target.applicationId) throw new Error('Bu maqsad bo\'yicha ariza allaqachon yaratilgan');

        const grant = (dbData.scholarshipGrants || []).find(g => g.id === target.grantId);
        if (!grant) throw new Error('Grant topilmadi');
        if (grant.status !== 'active') {
            throw new Error(`"${grant.title}" hozir ariza qabul qilmayapti (holati: ${grant.status})`);
        }

        // Mavjud eligibility engine bilan bir xil ma'lumot - talent moduli o'z
        // "readiness" raqamini emas, arizaning o'z hisobini beradi.
        const profile = (dbData.talentProfiles || []).find(p => p.studentId === target.studentId);
        const declared = profile?.declared || {};

        const application = await db.createScholarshipApplication({
            studentId: target.studentId,
            grantId: target.grantId,
            declared,
            attachedDocumentIds: (db.getStudentDocuments(target.studentId) || [])
                .filter(d => d.status === 'issued')
                .map(d => d.id),
            note: "Iqtidorli talabalar dasturi orqali nomzod sifatida uzatildi",
            autoScore: Number(target.readiness) || 0,
        });

        await db.updateTalentTarget(targetId, {
            status: 'candidate', applicationId: application.id,
        }, by);

        await db.logTalentAudit({
            entity: 'target', entityId: targetId, studentId: target.studentId,
            action: 'promoted_to_candidate', actorId: by,
            detail: { grantId: target.grantId, applicationId: application.id },
        });

        return { target, application };
    },

    // Ariza natijasini talent maqsadiga qaytarish. Stipendiya zanjiri qaror
    // chiqargach chaqiriladi - shunda talent moduli natijani "biladi" va
    // g'olib bo'lsa rag'batlantirish jarayoni boshlanadi.
    syncTalentTargetFromApplication: async (targetId) => {
        const dbData = getDB();
        const target = (dbData.talentTargets || []).find(t => t.id === targetId);
        if (!target?.applicationId) return null;

        const app = (dbData.scholarshipApplications || []).find(a => a.id === target.applicationId);
        if (!app) return null;

        // Ariza holatidan maqsad holatiga xarita.
        const map = {
            submitted: 'submitted', doc_check: 'submitted', evaluation: 'submitted',
            committee: 'recommended', approved: 'won',
            not_advanced: 'not_selected', rejected: 'not_selected', withdrawn: 'archived',
        };
        const next = map[app.status];
        if (!next || next === target.status) return target;

        return db.updateTalentTarget(targetId, { status: next }, 'system');
    },

    // Barcha faol maqsadlarni ariza holatiga moslashtirish - dashboard
    // ochilganda chaqiriladi, shunda raqamlar eskirib qolmaydi.
    syncAllTalentTargets: async () => {
        const dbData = getDB();
        const live = (dbData.talentTargets || []).filter(t =>
            t.applicationId && !['won', 'not_selected', 'archived'].includes(t.status));
        let changed = 0;
        for (const t of live) {
            const before = t.status;
            await db.syncTalentTargetFromApplication(t.id);
            if (t.status !== before) changed++;
        }
        return { checked: live.length, changed };
    },

    // =====================================================================
    // RAG'BATLANTIRISH
    //
    // Falsafa: "talaba yutdi = mentor avtomatik pul oladi" DEGANI EMAS.
    // Ketma-ketlik (§37):
    //   1. Talaba natijasi rasmiy tasdiqlanadi (target -> won)
    //   2. Recognition Case ochiladi
    //   3. Tizim mentor jamoasini aniqlaydi (biriktirishlardan)
    //   4. Tizim qoidalar bo'yicha rag'bat TAVSIYA qiladi
    //   5. Mas'ul komissiya ko'rib chiqadi va tasdiqlaydi
    //   6. Hujjat beriladi (mavjud Document -> QR -> Reestr tizimi orqali)
    //
    // Avtomatik jazolash mexanizmi YO'Q (§43).
    // =====================================================================

    getRecognitionRules: () => (getDB().recognitionRules || []),

    getRecognitionRule: (achievementKey, role) => {
        const rules = getDB().recognitionRules || [];
        return rules.find(r => r.achievementKey === achievementKey && r.role === role)
            || rules.find(r => r.achievementKey === 'default' && r.role === role)
            || null;
    },

    saveRecognitionRule: async ({ achievementKey, role, recognitionType }) => {
        await assertAuthenticated();
        const id = `rrule_${achievementKey}_${role}`;
        const { error } = await supabase.from('recognition_rules').upsert({
            id, achievement_key: achievementKey, role, recognition_type: recognitionType, data: {}
        }, { onConflict: 'achievement_key,role' });
        if (error) throw error;

        const dbData = getDB();
        dbData.recognitionRules = dbData.recognitionRules || [];
        const existing = dbData.recognitionRules.find(r => r.achievementKey === achievementKey && r.role === role);
        if (existing) existing.recognitionType = recognitionType;
        else dbData.recognitionRules.push({ id, achievementKey, role, recognitionType });
        saveDB(dbData);
        return { id, achievementKey, role, recognitionType };
    },

    deleteRecognitionRule: async (id) => {
        await assertAuthenticated();
        const { error } = await supabase.from('recognition_rules').delete().eq('id', id);
        if (error) throw error;
        const dbData = getDB();
        dbData.recognitionRules = (dbData.recognitionRules || []).filter(r => r.id !== id);
        saveDB(dbData);
    },

    // Boshlang'ich qoidalar - jadval bo'sh bo'lsagina.
    seedRecognitionRulesIfEmpty: async (defaults) => {
        const dbData = getDB();
        if ((dbData.recognitionRules || []).length > 0) return { seeded: 0 };
        await assertAuthenticated();

        const rows = defaults.map(d => ({
            id: `rrule_${d.achievementKey}_${d.role}`,
            achievement_key: d.achievementKey, role: d.role,
            recognition_type: d.recognitionType, data: {}
        }));
        const { error } = await supabase.from('recognition_rules')
            .upsert(rows, { onConflict: 'achievement_key,role' });
        if (error) throw error;

        dbData.recognitionRules = rows.map(mapRecognitionRuleFromSupabase);
        saveDB(dbData);
        return { seeded: rows.length };
    },

    getRecognitionCases: () => (getDB().recognitionCases || []),
    getRecognitionRecords: (caseId) =>
        (getDB().recognitionRecords || []).filter(r => r.caseId === caseId),

    // Shu shaxs tayyorlagan natijalar - "Mening tayyorlaganlarim" portfeli (§62).
    getPersonRecognitions: (personId) => {
        const records = (getDB().recognitionRecords || []).filter(r => r.personId === personId);
        const cases = new Map((getDB().recognitionCases || []).map(c => [c.id, c]));
        return records.map(r => ({ ...r, case: cases.get(r.caseId) || null }));
    },

    // Case yaratish. Mentor jamoasi biriktirishlardan aniqlanadi; agar
    // biriktirish yopilgan bo'lsa ham hisobga olinadi - natijaga hissa
    // qo'shgan odam keyinchalik boshqa talabaga o'tgani uchun e'tibordan
    // chetda qolmasligi kerak.
    createRecognitionCase: async ({ studentId, targetId = null, achievement, achievementKey = 'default', cycleYear = null, by = null }) => {
        await assertAuthenticated();
        const dbData = getDB();

        const existing = (dbData.recognitionCases || []).find(c =>
            c.studentId === studentId && c.targetId === targetId && c.status !== 'rejected');
        if (existing) throw new Error('Bu natija bo\'yicha rag\'batlantirish holati allaqachon ochilgan');

        const id = 'rcase_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const year = cycleYear || new Date().getFullYear();
        const student = generateMockStudents().find(s => s.id === studentId);

        const { error } = await supabase.from('recognition_cases').insert({
            id, student_id: studentId, target_id: targetId, achievement,
            cycle_year: year, status: 'draft',
            data: {
                achievementKey,
                studentName: student?.fullName || studentId,
                faculty: student?.faculty || null,
                createdBy: by,
            }
        });
        if (error) throw error;

        const record = {
            id, studentId, targetId, achievement, cycleYear: year, status: 'draft',
            achievementKey, studentName: student?.fullName || studentId,
            faculty: student?.faculty || null, createdBy: by,
        };
        (dbData.recognitionCases = dbData.recognitionCases || []).push(record);

        // Mentor jamoasi: shu talabaga biriktirilgan HAMMA odam (faol va yopilgan).
        // Bir odam bir nechta rolda bo'lsa har roli uchun alohida yozuv - hissasi
        // har xil bo'lgani uchun rag'bati ham har xil bo'lishi mumkin (§38).
        const team = (dbData.talentAssignments || []).filter(a => a.studentId === studentId);
        const seen = new Set();
        const rows = [];
        team.forEach(a => {
            const key = `${a.personId}::${a.role}`;
            if (seen.has(key)) return;
            seen.add(key);
            const rule = db.getRecognitionRule(achievementKey, a.role);
            rows.push({
                id: 'rrec_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + rows.length,
                case_id: id, person_id: a.personId, role: a.role,
                recognition_type: rule?.recognitionType || null,
                status: 'proposed', document_id: null,
                data: { active: a.active, assignedAt: a.assignedAt },
            });
        });

        if (rows.length > 0) {
            const { error: rErr } = await supabase.from('recognition_records').insert(rows);
            if (rErr) throw rErr;
            dbData.recognitionRecords = dbData.recognitionRecords || [];
            rows.forEach(r => dbData.recognitionRecords.push(mapRecognitionRecordFromSupabase(r)));
        }

        saveDB(dbData);
        await db.logTalentAudit({
            entity: 'recognition', entityId: id, studentId, action: 'case_created',
            actorId: by, detail: { achievement, teamSize: rows.length },
        });
        return { ...record, records: rows.length };
    },

    updateRecognitionCase: async (caseId, patch, by = null) => {
        await assertAuthenticated();
        const dbData = getDB();
        const current = (dbData.recognitionCases || []).find(c => c.id === caseId);
        if (!current) throw new Error('Rag\'batlantirish holati topilmadi');

        const merged = { ...current, ...patch };
        const { id, studentId, targetId, achievement, cycleYear, status, createdAt, updatedAt, ...data } = merged;
        const { error } = await supabase.from('recognition_cases').update({
            achievement, cycle_year: cycleYear, status,
            updated_at: new Date().toISOString(), data
        }).eq('id', caseId);
        if (error) throw error;

        Object.assign(current, merged);
        saveDB(dbData);
        await db.logTalentAudit({
            entity: 'recognition', entityId: caseId, studentId: current.studentId,
            action: `case_${patch.status || 'updated'}`, actorId: by,
        });
        return current;
    },

    updateRecognitionRecord: async (recordId, patch, by = null) => {
        await assertAuthenticated();
        const dbData = getDB();
        const current = (dbData.recognitionRecords || []).find(r => r.id === recordId);
        if (!current) throw new Error('Yozuv topilmadi');

        const merged = { ...current, ...patch };
        const { id, caseId, personId, role, recognitionType, status, documentId, createdAt, ...data } = merged;
        const { error } = await supabase.from('recognition_records').update({
            recognition_type: recognitionType || null, status,
            document_id: documentId || null, data
        }).eq('id', recordId);
        if (error) throw error;

        Object.assign(current, merged);
        saveDB(dbData);
        return current;
    },

    // HUJJAT BERISH — mavjud Document -> QR -> Reestr tizimi orqali.
    //
    // Bayonnoma dasturiy ravishda yaratiladi va darhol "approved" qilinadi:
    // tasdiqlash allaqachon CASE darajasida bo'lib o'tgan (komissiya ko'rib
    // chiqqan), shuning uchun ikkinchi imzolash zanjiri talab qilinmaydi.
    // Bu ochiq soddalashtirish - agar mentor hujjatlari uchun ham to'liq
    // imzolash kerak bo'lsa, shu joy o'zgaradi.
    issueRecognitionDocuments: async (caseId, { by = null } = {}) => {
        await assertAuthenticated();
        const dbData = getDB();
        const kase = (dbData.recognitionCases || []).find(c => c.id === caseId);
        if (!kase) throw new Error('Rag\'batlantirish holati topilmadi');
        if (kase.status !== 'approved') {
            throw new Error('Hujjat faqat holat tasdiqlangandan keyin beriladi');
        }

        const records = (dbData.recognitionRecords || [])
            .filter(r => r.caseId === caseId && r.status === 'approved' && !r.documentId);
        if (records.length === 0) {
            throw new Error('Hujjat beriladigan tasdiqlangan yozuv yo\'q');
        }

        // Hujjat turi bor yozuvlargina - "reytingga qo'shish" kabi rag'batlar
        // uchun hujjat chiqarilmaydi.
        const { RECOGNITION_TYPES } = await import('../config/talent.js');
        const issuable = records.filter(r => RECOGNITION_TYPES[r.recognitionType]?.documentType);
        if (issuable.length === 0) {
            throw new Error('Tanlangan rag\'bat turlari uchun hujjat ko\'zda tutilmagan');
        }

        // 1. Bayonnoma
        const protocolNumber = await db.nextRegistrationNumber('BAY');
        const protocolId = 'prot_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
        const now = new Date().toISOString();
        const { error: pErr } = await supabase.from('protocols').insert({
            id: protocolId, activity_type: 'recognition', activity_id: caseId,
            registration_number: protocolNumber, status: 'approved', revision: 1,
            data: {
                title: `${kase.studentName} natijasini tayyorlaganlarni rag'batlantirish`,
                purpose: kase.achievement,
                protocolDate: now, approvedAt: now, approvedBy: by,
                summary: `${kase.achievement} — ${kase.studentName}`,
                createdBy: by,
            }
        });
        if (pErr) throw pErr;

        // 2. Hujjatlar to'plami
        const profiles = new Map((db.getSyncedProfiles() || []).map(p => [p.username, p.fullName]));
        const recipients = issuable.map(r => ({
            recipientId: r.personId,
            recipientName: profiles.get(r.personId) || r.personId,
            documentType: RECOGNITION_TYPES[r.recognitionType].documentType,
            activityName: `${kase.achievement} — ${kase.studentName}`,
            role: r.role,
        }));

        const batch = await db.createAwardBatch(protocolId, recipients, by, 'official');
        if (!batch?.id) throw new Error("Taqdirlash to'plamini yaratib bo'lmadi");
        await db.issueDocuments(batch.id, by);
        await syncCoreDataFromSupabase();

        // 3. Yozuvlarni hujjatga bog'lash
        const issuedDocs = (getDB().documents || []).filter(d => d.protocolId === protocolId);
        for (const r of issuable) {
            const doc = issuedDocs.find(d => d.recipientId === r.personId);
            await db.updateRecognitionRecord(r.id, {
                status: 'issued', documentId: doc?.id || null,
            }, by);
        }

        await db.updateRecognitionCase(caseId, { status: 'issued', protocolId }, by);
        await db.logTalentAudit({
            entity: 'recognition', entityId: caseId, studentId: kase.studentId,
            action: 'documents_issued', actorId: by, detail: { count: issuable.length },
        });

        return { issued: issuable.length, protocolId, protocolNumber };
    },

    // G'olib bo'lgan, lekin hali Case ochilmagan maqsadlar - "Rag'batlantirish"
    // bo'limi shularni birinchi ko'rsatadi.
    getPendingRecognitions: () => {
        const dbData = getDB();
        const cases = dbData.recognitionCases || [];
        const students = new Map(generateMockStudents().map(s => [s.id, s]));

        return (dbData.talentTargets || [])
            .filter(t => t.status === 'won')
            .filter(t => !cases.some(c => c.targetId === t.id && c.status !== 'rejected'))
            .map(t => {
                const grant = (dbData.scholarshipGrants || []).find(g => g.id === t.grantId);
                const student = students.get(t.studentId);
                return {
                    target: t,
                    student,
                    studentName: student?.fullName || t.studentId,
                    achievement: grant?.title || t.awardKey || 'Natija',
                    team: (dbData.talentAssignments || []).filter(a => a.studentId === t.studentId),
                };
            });
    },

    // =========================================================================
    // IMKONIYATLAR MOSLIK KESHI
    //
    // Nima uchun kerak: pg_cron muddat eslatmalarini yuboradi, lekin moslik
    // mantiqi JS da (utils/opportunityMatching.js). Uni SQL da qayta yozish
    // ikkita haqiqat manbai degani bo'lardi.
    //
    // Shuning uchun vazifa taqsimlangan:
    //   JS      - kimga nima mos kelishini hisoblaydi va keshga yozadi
    //   pg_cron - keshdan o'qib, muddat yaqinlashganda xabar yuboradi
    //
    // Kesh mahalliy nusxaga sinxronlanmaydi - uni faqat pg_cron o'qiydi.
    // Talaba sahifasi mosliklarni har safar jonli hisoblaydi.
    // =========================================================================

    // Bitta talaba uchun. `matched` - matchOpportunitiesForStudent natijasi
    // (uni chaqiruvchi tomon beradi, chunki bu qatlam utils ga bog'lanmaydi).
    saveOpportunityMatches: async (studentId, matched) => {
        const rows = matched.eligible.map(r => ({
            id: `som_${studentId}_${r.opportunity.id}`.replace(/[^a-zA-Z0-9_:]/g, '_'),
            student_id: studentId,
            opportunity_id: r.opportunity.id,
            source_id: r.opportunity.sourceId,
            kind: r.opportunity.kind,
            title: r.opportunity.title,
            deadline: r.opportunity.deadline || null,
            fit: r.fit,
            state: r.state,
            computed_at: new Date().toISOString(),
            data: { daysLeft: r.daysLeft, gapCount: r.gaps.length },
        }));

        // Endi mos kelmaydiganlar keshdan olib tashlanadi - aks holda eskirgan
        // yozuv bo'yicha xabar yuborilib qolardi.
        const { error: delErr } = await supabase
            .from('student_opportunity_matches')
            .delete()
            .eq('student_id', studentId);
        if (delErr) throw delErr;

        if (rows.length === 0) return { written: 0 };

        const { error } = await supabase
            .from('student_opportunity_matches')
            .upsert(rows, { onConflict: 'student_id,opportunity_id' });
        if (error) throw error;

        return { written: rows.length };
    },

    // Oldingi kesh - "yangi imkoniyat topildi" xabarini faqat HAQIQATAN yangi
    // moslik uchun yuborish kerak, har qayta hisoblashda emas.
    getCachedOpportunityIds: async (studentId) => {
        const { data, error } = await supabase
            .from('student_opportunity_matches')
            .select('opportunity_id')
            .eq('student_id', studentId);
        if (error) throw error;
        return new Set((data || []).map(r => r.opportunity_id));
    },

    // Yangi paydo bo'lgan mosliklar uchun xabar.
    notifyNewOpportunityMatches: async (studentId, matched, previousIds) => {
        const fresh = matched.eligible.filter(r =>
            r.state === 'eligible' && !previousIds.has(r.opportunity.id));
        if (fresh.length === 0) return { sent: 0 };

        // Bittadan ortiq bo'lsa bitta umumlashtirilgan xabar - to'rtta alohida
        // bildirishnoma yuborish bezor qiladi.
        if (fresh.length === 1) {
            const r = fresh[0];
            await db.createNotification({
                userId: studentId, type: 'success',
                title: 'Siz uchun yangi imkoniyat topildi',
                message: `${r.opportunity.title}`
                    + (r.fit !== null ? ` — moslik ${r.fit}%` : '')
                    + (r.opportunity.deadline ? `. Muddat: ${r.opportunity.deadline}` : ''),
                refId: r.opportunity.id, refType: 'opportunity',
            });
        } else {
            await db.createNotification({
                userId: studentId, type: 'success',
                title: `Siz uchun ${fresh.length} ta yangi imkoniyat topildi`,
                message: fresh.slice(0, 3).map(r => r.opportunity.title).join(', ')
                    + (fresh.length > 3 ? ` va yana ${fresh.length - 3} ta` : ''),
                refId: null, refType: 'opportunity',
            });
        }
        return { sent: fresh.length };
    },

    // Oxirgi hisoblash qachon bo'lgani - admin panelida ko'rsatish uchun.
    getOpportunityMatchStats: async () => {
        const { data, error } = await supabase
            .from('student_opportunity_matches')
            .select('student_id, computed_at')
            .order('computed_at', { ascending: false })
            .limit(1000);
        if (error) throw error;
        const students = new Set((data || []).map(r => r.student_id));
        return {
            rows: (data || []).length,
            students: students.size,
            lastComputed: data?.[0]?.computed_at || null,
        };
    },

    // =====================================================================
    // BILDIRISHNOMALAR (§47, §48, §67)
    //
    // Platformada rejalashtiruvchi (cron) yo'q, shuning uchun bildirishnomalar
    // TALAB BO'YICHA yaratiladi - admin dashboardda "Bildirishnoma yuborish"
    // tugmasini bosganda. Bu ochiq soddalashtirish; server tomonida rejalashtirish
    // qo'shilsa faqat chaqiruv joyi o'zgaradi.
    //
    // Takroriy yuborishning oldi olinadi: bir maqsad bo'yicha bir kunda bitta
    // bildirishnoma (refId + sana bo'yicha tekshiriladi).
    // =====================================================================
    runTalentNotifications: async ({ by = null, daysAhead = 14 } = {}) => {
        await assertAuthenticated();
        const dbData = getDB();
        const today = new Date();
        const todayKey = today.toISOString().slice(0, 10);
        const existing = dbData.notifications || [];

        // Shu kun uchun allaqachon yuborilganmi.
        const alreadySent = (userId, refId) => existing.some(n =>
            n.userId === userId && n.refId === refId
            && String(n.createdAt || '').slice(0, 10) === todayKey);

        const queue = [];
        const students = new Map(generateMockStudents().map(s => [s.id, s]));

        // 1. Maqsad muddatlari - talabaga va mas'ulga
        (dbData.talentGoals || []).forEach(goal => {
            if (['done', 'cancelled'].includes(goal.status) || !goal.deadline) return;
            const end = new Date(`${goal.deadline}T23:59:59`);
            const days = Math.ceil((end - today) / 86400000);
            if (days > daysAhead) return;

            const overdue = days < 0;
            const title = overdue ? 'Maqsad muddati o\'tdi' : 'Maqsad muddati yaqinlashmoqda';
            const when = overdue ? `${Math.abs(days)} kun kechikdi` : `${days} kun qoldi`;

            if (!alreadySent(goal.studentId, goal.id)) {
                queue.push({
                    userId: goal.studentId, type: overdue ? 'warning' : 'info', title,
                    message: `"${goal.title}" — ${when}.`,
                    refId: goal.id, refType: 'talent_goal',
                });
            }
            // Mas'ul - agar u talabaning o'zi bo'lmasa
            if (goal.responsibleId && goal.responsibleId !== goal.studentId
                && !alreadySent(goal.responsibleId, goal.id)) {
                const name = students.get(goal.studentId)?.fullName || goal.studentId;
                queue.push({
                    userId: goal.responsibleId, type: overdue ? 'warning' : 'info', title,
                    message: `${name} — "${goal.title}", ${when}.`,
                    refId: goal.id, refType: 'talent_goal',
                });
            }
        });

        // 2. Stipendiya tayyorgarligi - talabaga
        (dbData.talentTargets || []).forEach(target => {
            if (!['ready', 'almost_ready'].includes(target.status)) return;
            if (alreadySent(target.studentId, target.id)) return;
            const grant = (dbData.scholarshipGrants || []).find(g => g.id === target.grantId);
            queue.push({
                userId: target.studentId, type: 'success',
                title: 'Stipendiyaga tayyorgarlik',
                message: `${grant?.title || 'Maqsadingiz'} — siz ${target.readiness}% tayyorsiz.`,
                refId: target.id, refType: 'talent_target',
            });
        });

        // 3. Kuzatuv kutilmoqda - mas'ullarga
        const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        (dbData.talentAssignments || []).filter(a => a.active).forEach(a => {
            const profile = (dbData.talentProfiles || []).find(p => p.studentId === a.studentId);
            if (profile?.program !== 'year1') return;   // oylik kuzatuv faqat 1-kursda
            const done = (dbData.talentMonitoring || []).some(m =>
                m.studentId === a.studentId && m.period === period && m.byRole === a.role);
            if (done) return;
            const refId = `mon_${a.studentId}_${period}_${a.role}`;
            if (alreadySent(a.personId, refId)) return;
            const name = students.get(a.studentId)?.fullName || a.studentId;
            queue.push({
                userId: a.personId, type: 'info', title: 'Oylik kuzatuv kutilmoqda',
                message: `${name} bo'yicha ${period} davri uchun kuzatuv kiritilmagan.`,
                refId, refType: 'talent_monitoring',
            });
        });

        // 4. Rag'batlantirish kutilmoqda - adminga emas, mas'ul komissiyaga
        //    xabar berish uchun alohida rol yo'q, shuning uchun bu yerda
        //    faqat sanaladi va natijada qaytariladi.
        const pendingRecognitions = db.getPendingRecognitions().length;

        for (const n of queue) {
            try { await db.createNotification(n); }
            catch (e) { console.warn('[bildirishnoma] yuborilmadi:', e.message); }
        }

        await db.logTalentAudit({
            entity: 'notification', entityId: null, action: 'batch_sent', actorId: by,
            detail: { sent: queue.length, pendingRecognitions },
        });

        return { sent: queue.length, pendingRecognitions };
    },

    // --- Audit (§55) ---
    logTalentAudit: async ({ entity, entityId, studentId = null, action, actorId = null, detail = null }) => {
        const id = 'taudit_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const { error } = await supabase.from('talent_audit_logs').insert({
            id, entity, entity_id: entityId || null, student_id: studentId,
            action, actor_id: actorId, data: { detail }
        });
        // Audit yozilmagani asosiy amalni bekor qilmasligi kerak.
        if (error) console.warn('[iqtidorli talabalar] audit yozilmadi:', error.message);
        return id;
    },

    getTalentAuditLogs: (studentId = null) =>
        (getDB().talentAuditLogs || []).filter(l => !studentId || l.studentId === studentId),

    // =========================================================================
    // IJTIMOIY FAOLLIK INDEKSI — rasmiy metodika (186-son buyruq, 2025-05-16)
    //
    // Qoida `config/socialActivityIndex.js` da, hisoblash
    // `utils/socialActivityScoring.js` da. Bu yerda faqat SAQLASH:
    //   - qo'lda baholanadigan mezonlar (tyutor/dekan o'rinbosari bahosi)
    //   - intizomiy jazo (15 ballgacha ayirish)
    //   - diskvalifikatsiya (dresskod/odob buzilishi)
    //
    // Mavjud `socialScoreTransactions` ledgeriga TEGILMAYDI - u o'z ishini
    // qilib turaveradi. Bu alohida qatlam, chunki metodika boshqa narsani
    // o'lchaydi: ledger "kim nima qildi" ni, indeks esa "yakuniy 100 ballik
    // baho" ni.
    // =========================================================================

    getSocialIndexAssessments: (studentId = null) =>
        (getDB().socialIndexAssessments || [])
            .filter(a => !studentId || a.studentId === studentId),

    getSocialIndexAssessment: (studentId, criterionKey, academicYear = null) => {
        const year = academicYear || getCurrentAcademicYear();
        return (getDB().socialIndexAssessments || []).find(a =>
            a.studentId === studentId
            && a.criterionKey === criterionKey
            && a.academicYear === year) || null;
    },

    // --- ASOSLOVCHI HUJJATLAR (talaba yuklaydi) ---
    //
    // Ko'rib chiqishda UCHTA amal bor, ikkita emas:
    //   qabul qilish  - hujjat haqiqiy, da'vo to'g'ri
    //   qaytarish     - hujjat haqiqiy, lekin bosqich/o'rin xato ko'rsatilgan
    //   rad etish     - hujjat qabul qilinmaydi
    // Qaytarilganini talaba tuzatib qayta yuboradi, rad etilganiga esa
    // apellyatsiya beradi. Bu ikkisini bitta "rad etish" ga qo'shish
    // talabaning haqiqiy natijasini soxta hujjat bilan tenglashtirardi.
    //
    // Metodikaning 5-bandi: "Talabalar «Ijtimoiy faollik indeksi»ning asoslovchi
    // hujjatlarini har yili 10-iyulga qadar maxsus elektron platformasiga
    // yuklaydi".
    //
    // NEGA YANGI MEXANIZM: platformada allaqachon `createSocialApplication` bor,
    // lekin u ESKI ledgerga ishlaydi (ariza -> tasdiq -> social_score_transactions)
    // va indeks u daftarni O'QIMAYDI. Ya'ni talaba hujjat yuklardi, ball olardi,
    // indeksda esa hech narsa o'zgarmasdi. Eski oqim tegilmadi - u o'z ishini
    // qilaveradi; bu esa indeksning o'z dalil qatlami.
    getIndexEvidence: (studentId = null, criterionKey = null, academicYear = null) => {
        const year = academicYear || getCurrentAcademicYear();
        return (getDB().socialIndexEvidence || []).filter(e =>
            (!studentId || e.studentId === studentId)
            && (!criterionKey || e.criterionKey === criterionKey)
            && e.academicYear === year);
    },

    // `claim` - talabaning DA'VOSI: 5-mezonda bu {level, place}, ya'ni
    // "respublika bosqichi, 1-o'rin". Ball da'vodan CHIQADI, da'vo bilan
    // BERILMAYDI: talaba ball raqamini yozmaydi, uni jadval hisoblaydi.
    // =========================================================================
    // TALABA HUJJATLARI OMBORI
    //
    // Talaba hujjatni BIR MARTA yuklaydi va uni bir necha joyda ishlatadi:
    // 5-mezonga dalil, portfolioda ko'rsatish, stipendiya arizasiga
    // biriktirish. Uchta alohida yuklash yo'li bo'lsa, u har safar qaytadan
    // yuklashi kerak bo'lardi.
    //
    // Faylning O'ZI yopiq omborga yuklanadi - ilgari faqat NOMI saqlanardi
    // va tyutor hujjatni ochib ko'ra olmasdi, ya'ni tekshirish imkonsiz edi.
    // =========================================================================
    isStudentDocsBackendReady: () => getDB().studentDocsBackendReady !== false,

    getStudentDocs: (studentId, { docType = null } = {}) =>
        (getDB().studentDocuments || [])
            .filter(d => d.studentId === studentId)
            .filter(d => !docType || d.docType === docType)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),

    getStudentDocById: (id) =>
        (getDB().studentDocuments || []).find(d => d.id === id) || null,

    // `level` va `place` faqat `needsPlacement` turlari uchun (tashqi diplom).
    // Ular TALABANING DA'VOSI: platforma tashqi tanlovning darajasini bila
    // olmaydi, shuning uchun ularni hujjatga qarab mas'ul tasdiqlaydi.
    // Ro'yxatdagi rasmiy hujjatda esa bular yozuvdan olinadi, so'ralmaydi.
    uploadStudentDoc: async ({
        studentId, docType, title, file, issuer = '', issuedAt = null, note = '',
        level = null, place = null,
    }) => {
        await assertAuthenticated();
        if (!STUDENT_DOC_TYPES[docType]) throw new Error("Noma'lum hujjat turi");
        if (!String(title || '').trim()) throw new Error('Hujjat nomini kiriting');
        const problem = validateStudentDoc(file);
        if (problem) throw new Error(problem);

        const id = 'sdoc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const ext = (file.name?.split('.').pop() || 'pdf').toLowerCase();
        const path = `${studentId}/${id}.${ext}`;

        const { error: upErr } = await supabase.storage
            .from('student-documents')
            .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
        if (upErr) {
            const missingBucket = /bucket not found/i.test(upErr.message || '');
            throw new Error(missingBucket
                ? "Fayl yuklanmadi: `student-documents` ombori topilmadi. "
                  + 'Supabase SQL Editor da `supabase/student_documents.sql` ni ishga tushiring.'
                : 'Fayl yuklanmadi: ' + upErr.message);
        }

        const record = {
            id, studentId, docType, title: String(title).trim(), filePath: path,
            fileName: file.name, size: file.size, mimeType: file.type || null,
            issuer: String(issuer || '').trim(), issuedAt: issuedAt || null,
            note: String(note || '').trim(),
            // Bosqich va o'rin faqat tegishli turda saqlanadi. Til
            // sertifikatida "o'rin" tushunchasi yo'q - uni bo'sh maydon
            // sifatida saqlash keyin filtrda soxta natija berardi.
            level: STUDENT_DOC_TYPES[docType]?.needsPlacement ? (level || null) : null,
            place: STUDENT_DOC_TYPES[docType]?.needsPlacement ? (place ? Number(place) : null) : null,
            createdAt: new Date().toISOString(),
        };

        const { error } = await supabase.from('student_documents').insert({
            id, student_id: studentId, doc_type: docType, title: record.title,
            file_path: path, data: record,
        });
        if (error) throw error;

        const dbData = getDB();
        (dbData.studentDocuments = dbData.studentDocuments || []).push(record);
        saveDB(dbData);
        return record;
    },

    // Faylni ko'rish - vaqtinchalik havola. Ombor yopiq: pasport nusxasi
    // kabi hujjat ochiq internetda turmasligi kerak.
    getStudentDocUrl: async (filePath) => {
        if (!filePath) return null;
        const { data, error } = await supabase.storage
            .from('student-documents')
            .createSignedUrl(filePath, 3600);
        if (error) return null;
        return data?.signedUrl || null;
    },

    deleteStudentDoc: async (docId, studentId) => {
        await assertAuthenticated();
        const dbData = getDB();
        const doc = (dbData.studentDocuments || []).find(d => d.id === docId);
        if (!doc) return false;
        if (doc.studentId !== studentId) throw new Error('Bu hujjat sizniki emas');

        // Dalil sifatida yuborilgan hujjat O'CHIRILMAYDI: tyutor ko'rib
        // chiqayotgan yoki allaqachon qabul qilingan hujjatni yo'qotish
        // qarorni asossiz qoldirardi.
        const usedAsEvidence = (dbData.socialIndexEvidence || []).some(e =>
            e.documentId === docId && e.status !== 'rejected');
        if (usedAsEvidence) {
            throw new Error("Bu hujjat mezon dalili sifatida yuborilgan — avval dalilni olib tashlang");
        }

        const { error } = await supabase.from('student_documents').delete().eq('id', docId);
        if (error) throw error;
        if (doc.filePath) {
            await supabase.storage.from('student-documents').remove([doc.filePath]);
        }
        dbData.studentDocuments = dbData.studentDocuments.filter(d => d.id !== docId);
        saveDB(dbData);
        return true;
    },

    submitIndexEvidence: async ({ studentId, criterionKey, title, description = '', fileName = null, documentId = null, claim = null, academicYear = null }) => {
        await assertAuthenticated();
        if (!INDEX_CRITERIA[criterionKey]) throw new Error("Noma'lum mezon");
        if (!String(title || '').trim()) throw new Error('Hujjat nomini kiriting');

        const normalizedClaim = normalizeEvidenceClaim(criterionKey, claim);

        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();
        const doc = documentId ? db.getStudentDocById(documentId) : null;
        const record = {
            id: 'sidev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            studentId, criterionKey, academicYear: year,
            title: String(title).trim(), description: String(description || '').trim(),
            // Hujjat ombordan biriktirilsa - fayl nomi undan olinadi.
            // `fileName` yolg'iz qolgan eski yo'l ham saqlanadi: u faylsiz
            // yuborilgan eski yozuvlarni buzmaydi.
            documentId: documentId || null,
            fileName: doc?.fileName || fileName || null,
            claim: normalizedClaim,
            status: 'pending',
            submittedAt: new Date().toISOString(),
            reviewedBy: null, reviewedAt: null, comment: '',
            history: [],
        };

        await persistIndexRow('social_index_evidence', {
            id: record.id, student_id: studentId, criterion_key: criterionKey,
            academic_year: year, status: record.status,
            document_id: record.documentId, data: record,
        });

        (dbData.socialIndexEvidence = dbData.socialIndexEvidence || []).push(record);
        saveDB(dbData);
        return record;
    },

    // QAYTARILGAN hujjatni tuzatib qayta yuborish.
    //
    // Faqat `returned` holatida ishlaydi: rad etilgan hujjat qayta
    // yuborilmaydi, unga apellyatsiya beriladi. Aks holda bitta hujjat
    // tyutorga aylanaverib turardi.
    resubmitIndexEvidence: async (evidenceId, studentId, { title, description = '', fileName = null, claim = null } = {}) => {
        await assertAuthenticated();
        const dbData = getDB();
        const row = (dbData.socialIndexEvidence || []).find(e => e.id === evidenceId);
        if (!row) throw new Error('Hujjat topilmadi');
        if (row.studentId !== studentId) throw new Error('Bu hujjat sizniki emas');
        if (row.status !== 'returned') {
            throw new Error(row.status === 'rejected'
                ? "Rad etilgan hujjat qayta yuborilmaydi - apellyatsiya bering"
                : "Faqat qaytarilgan hujjatni tahrirlash mumkin");
        }

        // Oldingi urinish tarixda qoladi - tyutor nima o'zgarganini ko'radi.
        row.history = [...(row.history || []), {
            at: new Date().toISOString(),
            action: 'returned',
            by: row.reviewedBy, comment: row.comment,
            title: row.title, claim: row.claim,
        }];

        if (title != null) row.title = String(title).trim();
        row.description = String(description || '').trim();
        if (fileName) row.fileName = fileName;
        if (claim != null) row.claim = normalizeEvidenceClaim(row.criterionKey, claim);
        row.status = 'pending';
        row.submittedAt = new Date().toISOString();
        row.reviewedBy = null; row.reviewedAt = null; row.comment = '';

        await persistIndexRow('social_index_evidence', {
            id: row.id, student_id: row.studentId, criterion_key: row.criterionKey,
            academic_year: row.academicYear, status: row.status,
            document_id: row.documentId || null, data: row,
        });

        saveDB(dbData);
        return row;
    },

    // Talaba ko'rib chiqilmagan hujjatini olib tashlashi mumkin - xato yuklangan
    // faylni tuzatishning yagona yo'li shu.
    withdrawIndexEvidence: async (evidenceId, studentId) => {
        await assertAuthenticated();
        const dbData = getDB();
        const row = (dbData.socialIndexEvidence || []).find(e => e.id === evidenceId);
        if (!row) throw new Error('Hujjat topilmadi');
        if (row.studentId !== studentId) throw new Error('Bu hujjat sizniki emas');
        if (row.status !== 'pending') throw new Error("Ko'rib chiqilgan hujjatni olib tashlab bo'lmaydi");

        const { error } = await supabase.from('social_index_evidence').delete().eq('id', evidenceId);
        if (error) throw new Error("Olib tashlanmadi: " + error.message);

        dbData.socialIndexEvidence = dbData.socialIndexEvidence.filter(e => e.id !== evidenceId);
        saveDB(dbData);
    },

    reviewIndexEvidence: async ({ evidenceId, action, comment = '', reviewedBy }) => {
        await assertAuthenticated();
        const statusByAction = { accept: 'accepted', return: 'returned', reject: 'rejected' };
        const status = statusByAction[action];
        if (!status) throw new Error("Noma'lum amal: " + action);
        // Qaytarish va rad etish talabaga NIMA QILISHI kerakligini aytishi
        // shart - izohsiz "rad etildi" javobsiz qolgan savol demak.
        if (status !== 'accepted' && !String(comment || '').trim()) {
            throw new Error(status === 'returned'
                ? 'Nimani tuzatish kerakligini yozing'
                : 'Rad etish sababini yozing');
        }

        const dbData = getDB();
        const row = (dbData.socialIndexEvidence || []).find(e => e.id === evidenceId);
        if (!row) throw new Error('Hujjat topilmadi');
        row.status = status;
        row.comment = String(comment || '').trim();
        row.reviewedBy = reviewedBy;
        row.reviewedAt = new Date().toISOString();

        await persistIndexRow('social_index_evidence', {
            id: row.id, student_id: row.studentId, criterion_key: row.criterionKey,
            academic_year: row.academicYear, status: row.status,
            document_id: row.documentId || null, data: row,
        });
        saveDB(dbData);

        const titles = {
            accepted: 'Hujjat qabul qilindi',
            returned: 'Hujjat tuzatish uchun qaytarildi',
            rejected: 'Hujjat rad etildi',
        };
        const tails = {
            accepted: '',
            returned: ' Tuzatib, qayta yuborishingiz mumkin.',
            rejected: ` Rozi bo'lmasangiz ${APPEAL.submitWorkingDays} ish kuni ichida apellyatsiya berishingiz mumkin.`,
        };
        addNotificationToSupabase({
            userId: row.studentId,
            type: status === 'accepted' ? 'success' : 'warning',
            title: titles[status],
            message: `"${row.title}" — ${INDEX_CRITERIA[row.criterionKey]?.name || row.criterionKey}`
                + (row.comment ? `. Izoh: ${row.comment}` : '') + tails[status],
        }).catch(() => {});

        return row;
    },

    // --- APELLYATSIYA ---
    //
    // Metodikaning o'z qoidasi: qarorga 10 ish kuni ichida e'tiroz bildiriladi.
    // E'tirozni RAD ETGAN ODAM EMAS, boshqa mas'ul ko'radi - aks holda
    // apellyatsiya shakldan iborat bo'lib qolardi.
    getEvidenceAppeals: (studentId = null) =>
        (getDB().socialIndexAppeals || [])
            .filter(a => !studentId || a.studentId === studentId)
            .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)),

    appealIndexEvidence: async ({ evidenceId, studentId, reason }) => {
        await assertAuthenticated();
        if (!String(reason || '').trim()) throw new Error("E'tiroz sababini yozing");

        const dbData = getDB();
        const row = (dbData.socialIndexEvidence || []).find(e => e.id === evidenceId);
        if (!row) throw new Error('Hujjat topilmadi');
        if (row.studentId !== studentId) throw new Error('Bu hujjat sizniki emas');
        if (row.status !== 'rejected') throw new Error('Apellyatsiya faqat rad etilgan hujjatga beriladi');

        const appeals = dbData.socialIndexAppeals = dbData.socialIndexAppeals || [];
        if (appeals.some(a => a.evidenceId === evidenceId && a.status === 'pending')) {
            throw new Error("Bu hujjat bo'yicha e'tiroz allaqachon yuborilgan");
        }

        // Muddat rad etilgan kundan hisoblanadi. Ish kunlari - dam olish
        // kunlarisiz; bayramlar hisobga olinmaydi (platformada bayram
        // taqvimi yo'q, buni yashirmaymiz).
        const deadline = addWorkingDays(new Date(row.reviewedAt || Date.now()), APPEAL.submitWorkingDays);
        if (new Date() > deadline) {
            throw new Error(`Apellyatsiya muddati o'tgan (${APPEAL.submitWorkingDays} ish kuni)`);
        }

        const record = {
            id: 'siapl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            evidenceId, studentId,
            criterionKey: row.criterionKey,
            academicYear: row.academicYear,
            rejectedBy: row.reviewedBy, rejectionComment: row.comment,
            reason: String(reason).trim(),
            status: 'pending',
            submittedAt: new Date().toISOString(),
            deadlineAt: deadline.toISOString(),
            decidedBy: null, decidedAt: null, decision: null, decisionComment: '',
        };
        await persistIndexRow('social_index_appeals', {
            id: record.id, evidence_id: evidenceId, student_id: studentId,
            status: record.status, data: record,
        });

        appeals.push(record);
        saveDB(dbData);
        return record;
    },

    decideEvidenceAppeal: async ({ appealId, decision, comment = '', decidedBy }) => {
        await assertAuthenticated();
        if (!['upheld', 'overturned'].includes(decision)) throw new Error("Noma'lum qaror");
        if (!String(comment || '').trim()) throw new Error('Qaror asosini yozing');

        const dbData = getDB();
        const appeal = (dbData.socialIndexAppeals || []).find(a => a.id === appealId);
        if (!appeal) throw new Error("E'tiroz topilmadi");
        if (appeal.status !== 'pending') throw new Error("E'tiroz allaqachon ko'rib chiqilgan");
        // Rad etgan odamning o'zi e'tirozni ko'ra olmaydi.
        if (decidedBy && appeal.rejectedBy && decidedBy === appeal.rejectedBy) {
            throw new Error("E'tirozni rad etgan mas'ulning o'zi ko'rib chiqa olmaydi");
        }

        appeal.status = 'decided';
        appeal.decision = decision;
        appeal.decisionComment = String(comment).trim();
        appeal.decidedBy = decidedBy;
        appeal.decidedAt = new Date().toISOString();

        // E'tiroz qanoatlantirilsa hujjat qabul qilinganga o'tadi va ball
        // o'sha zahoti hisobga tushadi.
        const row = (dbData.socialIndexEvidence || []).find(e => e.id === appeal.evidenceId);
        if (row && decision === 'overturned') {
            row.status = 'accepted';
            row.reviewedBy = decidedBy;
            row.reviewedAt = new Date().toISOString();
            row.comment = `Apellyatsiya asosida qabul qilindi. ${appeal.decisionComment}`;
        }

        await persistIndexRow('social_index_appeals', {
            id: appeal.id, evidence_id: appeal.evidenceId, student_id: appeal.studentId,
            status: appeal.status, data: appeal,
        });
        if (row && decision === 'overturned') {
            await persistIndexRow('social_index_evidence', {
                id: row.id, student_id: row.studentId, criterion_key: row.criterionKey,
                academic_year: row.academicYear, status: row.status,
                document_id: row.documentId || null, data: row,
            });
        }
        saveDB(dbData);

        addNotificationToSupabase({
            userId: appeal.studentId,
            type: decision === 'overturned' ? 'success' : 'warning',
            title: decision === 'overturned' ? "E'tiroz qanoatlantirildi" : "E'tiroz rad etildi",
            message: `${INDEX_CRITERIA[appeal.criterionKey]?.name || appeal.criterionKey}. ${appeal.decisionComment}`,
        }).catch(() => {});

        return appeal;
    },

    // Talabaning eslatmasi. Koordinator oqimdan chiqarilgan, lekin admin ham
    // unutishi mumkin - talabaga turtki berish yo'li qoladi.
    requestCriterionConfirmation: async ({ studentId, criterionKey, academicYear = null }) => {
        await assertAuthenticated();
        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();
        dbData.socialIndexRequests = dbData.socialIndexRequests || [];
        const existing = dbData.socialIndexRequests.find(r =>
            r.studentId === studentId && r.criterionKey === criterionKey && r.academicYear === year);
        if (existing) return existing;

        const record = {
            id: 'sidreq_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            studentId, criterionKey, academicYear: year,
            requestedAt: new Date().toISOString(),
        };

        await persistIndexRow('social_index_requests', {
            id: record.id, student_id: studentId, criterion_key: criterionKey,
            academic_year: year, data: record,
        });

        dbData.socialIndexRequests.push(record);
        saveDB(dbData);
        return record;
    },

    hasConfirmationRequest: (studentId, criterionKey, academicYear = null) => {
        const year = academicYear || getCurrentAcademicYear();
        return (getDB().socialIndexRequests || []).some(r =>
            r.studentId === studentId && r.criterionKey === criterionKey && r.academicYear === year);
    },

    // Tasdiqlash so'rovlari - admin bosh sahifasidagi "nechta ish kutmoqda"
    // ko'rsatkichi uchun. Tasdiqlangani so'rovdan chiqariladi.
    getPendingConfirmationRequests: (academicYear = null) => {
        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();
        const confirmed = new Set(
            (dbData.socialIndexAssessments || [])
                .filter(a => a.academicYear === year)
                .map(a => `${a.studentId}::${a.criterionKey}`)
        );
        return (dbData.socialIndexRequests || [])
            .filter(r => r.academicYear === year
                && !confirmed.has(`${r.studentId}::${r.criterionKey}`));
    },

    // Metodikadagi uchta muddat.
    //
    // Sanalar HAR YILI takrorlanadi. Oxirgi muddat (25-iyul) o'tgan bo'lsa
    // uchalasi ham KEYINGI yilga suriladi: "muddat o'tdi" deb uchta o'lik
    // qatorni ko'rsatib turishning ma'nosi yo'q, talabaga keyingi muddat kerak.
    //
    // Oradagi holat saqlanadi: 12-iyulda 10-iyul o'tgan, qolgan ikkitasi esa
    // hali oldinda - bu to'g'ri va shunday ko'rsatiladi.
    getIndexDeadlines: (now = new Date()) => {
        const build = (year) => DEADLINE_ORDER.map(key => {
            const d = DEADLINES[key];
            const [month, day] = d.day.split('-').map(Number);
            const date = new Date(year, month - 1, day, 23, 59, 59);
            return { key, ...d, date, daysLeft: Math.ceil((date - now) / 86400000) };
        });

        let rows = build(now.getFullYear());
        // Butun davr tugagan bo'lsa - keyingi yil.
        if (rows.every(r => r.daysLeft < 0)) rows = build(now.getFullYear() + 1);

        return rows.map(r => ({
            ...r,
            date: r.date.toISOString(),
            passed: r.daysLeft < 0,
        }));
    },

    // MA'LUMOTNOMA — mezon bo'yicha asoslovchi hujjat.
    //
    // Metodika har mezon uchun asoslovchi hujjat talab qiladi. Avtomatik hisob
    // o'z-o'zicha bunday hujjat yaratmaydi - u faqat raqam. Bu funksiya raqamning
    // ORQASIDAGI dalilni yig'adi: qaysi klub, nechta tadbir, kim davomat
    // belgilagan, davomat qulflanganmi.
    //
    // Koordinator ATAYLAB oqimdan chiqarilgan: u davomatni tadbir kunida
    // belgilagan va o'sha yozuv qulflangan hamda tarixga olingan. Iyulda
    // xotiradan qayta tasdiqlash undan kuchsizroq dalil bo'lardi. Uning ismi
    // hujjatda qoladi, lekin qo'shimcha harakat talab qilinmaydi.
    buildCriterionStatement: (studentId, criterionKey, academicYear = null) => {
        const year = academicYear || getCurrentAcademicYear();
        const criterion = INDEX_CRITERIA[criterionKey];
        if (!criterion) throw new Error("Noma'lum mezon: " + criterionKey);

        const students = new Map(generateMockStudents().map(s => [s.id, s]));
        const student = students.get(studentId) || null;
        const computed = computeSocialActivityIndex(db, studentId, { academicYear: year })
            .criteria.find(c => c.key === criterionKey);
        const confirmation = db.getSocialIndexAssessment(studentId, criterionKey, year);

        // Mezon bo'yicha dalil qatorlari. Hozircha 2-mezon uchun to'liq;
        // qolgan mezonlar shu qolipga tushadi.
        let rows = [];
        if (criterionKey === 'CLUBS') {
            const { perClub } = db.getStudentClubDirectionActivity(studentId, year);
            const dbData = getDB();
            rows = perClub.map(c => {
                // Davomatni kim belgilagani va qulflanganmi - dalilning kuchi.
                const marks = (dbData.activityAttendance || []).filter(a =>
                    a.participantId === studentId && a.status === 'present');
                const markedBy = [...new Set(marks.map(m => m.markedByUserId).filter(Boolean))];
                const locked = (dbData.activityAttendanceLocks || []).length > 0;
                return {
                    ...c,
                    directionLabel: INDEX_CRITERIA.CLUBS.directions.find(d => d.key === c.direction)?.label || null,
                    points: clubPercentToPoints(c.percent),
                    markedBy,
                    locked,
                    // Diqqat talab qiladigan holatlar - admin vaqti istisnolarga
                    // sarflansin, hamma qatorga emas.
                    flags: [
                        !c.enoughEvents && 'Klub kam tadbir o\'tkazgan',
                        c.percent === 100 && c.held <= 2 && 'Kam tadbirda 100%',
                        c.percent < 20 && 'Juda past ishtirok',
                    ].filter(Boolean),
                };
            });
        }

        // 8-mezon: ishtirok yozuvlari ma'lumotnomaga tushadi. Bu yerda birlik
        // KLUB emas, TADBIR - shuning uchun ustunlar ham boshqacha.
        let volunteering = null;
        if (criterionKey === 'VOLUNTEERING') {
            volunteering = db.getStudentVolunteeringActivity(studentId, year);
        }

        // Talaba yuborgan asoslovchi hujjatlar - har mezon uchun.
        // 9, 10, 11-mezonlarda ular YAGONA dalil: avtomatik hisob yo'q,
        // ball mas'ulning bahosidan kelib chiqadi.
        const evidence = db.getIndexEvidence(studentId, criterionKey, year);

        return {
            studentId,
            studentName: student?.fullName || studentId,
            faculty: student?.faculty || null,
            course: student?.course || null,
            group: student?.group || null,
            criterionKey,
            criterionName: criterion.name,
            maxPoints: criterion.maxPoints,
            academicYear: year,
            rows,
            evidence,
            volunteering,
            proposedPoints: computed?.points ?? null,
            // Hisobning tafsiloti - "ball qayerdan chiqdi". 5-mezonda bu
            // tizimning O'ZI bergan diplomlar ro'yxati: tyutor talabaning
            // da'vosini shu bilan solishtiradi.
            detail: computed?.detail || null,
            sourceLabel: computed?.sourceLabel || null,
            // Tasdiqlangan bo'lsa - kim va qachon.
            confirmed: !!confirmation,
            confirmedPoints: confirmation?.points ?? null,
            confirmedBy: confirmation?.assessedBy || null,
            confirmedAt: confirmation?.assessedAt || null,
            comment: confirmation?.comment || '',
            needsAttention: rows.some(r => r.flags.length > 0),
        };
    },

    // Tasdiqlash navbati - hali tasdiqlanmagan, lekin bali hisoblangan talabalar.
    getCriterionConfirmationQueue: (criterionKey, academicYear = null) => {
        const year = academicYear || getCurrentAcademicYear();
        const confirmed = new Set(
            (getDB().socialIndexAssessments || [])
                .filter(a => a.criterionKey === criterionKey && a.academicYear === year)
                .map(a => a.studentId)
        );

        // Faqat DALILI bor talabalar navbatga tushadi - noldan ro'yxat qurish
        // adminni 550 ta bo'sh qator bilan ko'mib tashlardi.
        const active = new Set();

        if (criterionKey === 'CLUBS') {
            const directions = db.getClubDirections();
            if (Object.keys(directions).length > 0) {
                (getDB().activityAttendance || [])
                    .filter(a => a.status === 'present' && (!a.createdAt || academicYearOf(a.createdAt) === year))
                    .forEach(a => active.add(a.participantId));
            }
        }

        // Har qanday mezon uchun: hujjat yuborgan talaba navbatga tushadi.
        db.getIndexEvidence(null, criterionKey, year).forEach(e => active.add(e.studentId));

        return Array.from(active)
            .filter(id => !confirmed.has(id))
            .map(id => db.buildCriterionStatement(id, criterionKey, year))
            // Hisoblangan ball YOKI yuborilgan hujjat bo'lsa ko'rsatiladi.
            .filter(s => s.proposedPoints != null || s.evidence.length > 0)
            .sort((a, b) =>
                (b.needsAttention - a.needsAttention)
                || (b.evidence.filter(e => e.status === 'pending').length - a.evidence.filter(e => e.status === 'pending').length)
                || ((b.proposedPoints || 0) - (a.proposedPoints || 0)));
    },

    // Ma'lumotnomani tasdiqlash. Hisoblangan holat MUHRLANADI: keyin davomat
    // o'zgarsa ham tasdiqlangan hujjatdagi raqam o'zgarmaydi.
    confirmCriterion: async ({ studentId, criterionKey, points = null, comment = '', confirmedBy, academicYear = null }) => {
        const year = academicYear || getCurrentAcademicYear();
        const statement = db.buildCriterionStatement(studentId, criterionKey, year);
        // Qo'lda baholanadigan mezonlarda hisoblangan ball bo'lmaydi - ball
        // butunlay mas'ulning bahosidan keladi. Shuning uchun aniq berilgan
        // qiymat har doim qabul qilinadi.
        const value = points == null ? statement.proposedPoints : Number(points);
        if (value == null || Number.isNaN(value)) {
            throw new Error('Ball ko\'rsatilmagan');
        }

        return db.setSocialIndexAssessment({
            studentId, criterionKey, academicYear: year,
            points: value, comment, assessedBy: confirmedBy,
            snapshot: statement.rows,
            proposedPoints: statement.proposedPoints,
        });
    },

    // Mezon bo'yicha baho qo'yish. Ball metodikadagi shipdan oshsa RAD ETILADI -
    // jimgina kesib qo'yish mas'ulni "men 8 qo'ydim" deb o'ylatib qoldirardi.
    setSocialIndexAssessment: async ({ studentId, criterionKey, points, comment = '', assessedBy, academicYear = null, snapshot = null, proposedPoints = null }) => {
        await assertAuthenticated();
        const criterion = INDEX_CRITERIA[criterionKey];
        if (!criterion) throw new Error("Noma'lum mezon: " + criterionKey);

        const value = Number(points);
        if (Number.isNaN(value) || value < 0) throw new Error('Ball musbat son bo\'lishi kerak');
        if (value > criterion.maxPoints) {
            throw new Error(`"${criterion.name}" uchun maksimal ball ${criterion.maxPoints} (siz ${value} kiritdingiz)`);
        }

        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();
        const now = new Date().toISOString();
        dbData.socialIndexAssessments = dbData.socialIndexAssessments || [];

        const existing = dbData.socialIndexAssessments.find(a =>
            a.studentId === studentId && a.criterionKey === criterionKey && a.academicYear === year);

        const record = {
            id: existing?.id || 'sidx_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            studentId, criterionKey, academicYear: year,
            points: value, comment, assessedBy, assessedAt: now,
            // Tasdiqlash paytidagi holat MUHRLANADI - keyin davomat o'zgarsa ham
            // hujjatdagi raqam o'zgarmaydi.
            snapshot: snapshot || existing?.snapshot || null,
            proposedPoints: proposedPoints ?? existing?.proposedPoints ?? null,
        };

        await persistIndexRow('social_index_assessments', {
            id: record.id, student_id: studentId, criterion_key: criterionKey,
            academic_year: year, points: record.points, data: record,
        });

        if (existing) Object.assign(existing, record);
        else dbData.socialIndexAssessments.push(record);
        saveDB(dbData);
        return record;
    },

    // Intizomiy jazo. Metodika: "15 ballgacha olib tashlanishi mumkin" -
    // "gacha", ya'ni miqdorni mas'ul belgilaydi, tizim o'zi hal qilmaydi.
    getDisciplinaryDeduction: (studentId, academicYear = null) => {
        const year = academicYear || getCurrentAcademicYear();
        const row = (getDB().socialIndexPenalties || []).find(p =>
            p.studentId === studentId && p.academicYear === year);
        return row?.points || 0;
    },

    setDisciplinaryDeduction: async ({ studentId, points, reason, decidedBy, academicYear = null }) => {
        await assertAuthenticated();
        const value = Number(points) || 0;
        if (value < 0 || value > DISCIPLINARY_MAX_DEDUCTION) {
            throw new Error(`Ayiriladigan ball 0 dan ${DISCIPLINARY_MAX_DEDUCTION} gacha bo'lishi kerak`);
        }
        if (value > 0 && !String(reason || '').trim()) {
            throw new Error('Intizomiy jazo sababi ko\'rsatilishi shart');
        }

        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();
        dbData.socialIndexPenalties = dbData.socialIndexPenalties || [];
        const existing = dbData.socialIndexPenalties.find(p =>
            p.studentId === studentId && p.academicYear === year);

        const record = {
            id: existing?.id || 'sipen_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            studentId, academicYear: year, points: value,
            reason: String(reason || '').trim(), decidedBy,
            decidedAt: new Date().toISOString(),
        };
        if (existing) Object.assign(existing, record);
        else dbData.socialIndexPenalties.push(record);
        await persistRecordRow('social_index_penalties', existing || record,
            { student_id: studentId, academic_year: year });
        saveDB(dbData);
        return record;
    },

    // Diskvalifikatsiya - ball kamayishi EMAS. Metodika: ichki tartib va
    // odob-axloq talablari buzilsa talabaning hujjatlari tanlov uchun umuman
    // qabul qilinmaydi. Shuning uchun bu alohida bayroq.
    isSocialIndexDisqualified: (studentId, academicYear = null) => {
        const year = academicYear || getCurrentAcademicYear();
        return (getDB().socialIndexPenalties || []).some(p =>
            p.studentId === studentId && p.academicYear === year && p.disqualified);
    },

    setSocialIndexDisqualification: async ({ studentId, disqualified, reason, decidedBy, academicYear = null }) => {
        await assertAuthenticated();
        if (disqualified && !String(reason || '').trim()) {
            throw new Error('Diskvalifikatsiya sababi ko\'rsatilishi shart');
        }
        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();
        dbData.socialIndexPenalties = dbData.socialIndexPenalties || [];
        const existing = dbData.socialIndexPenalties.find(p =>
            p.studentId === studentId && p.academicYear === year);

        const record = {
            id: existing?.id || 'sipen_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            studentId, academicYear: year,
            points: existing?.points || 0,
            disqualified: !!disqualified,
            disqualificationReason: String(reason || '').trim(),
            reason: existing?.reason || '',
            decidedBy, decidedAt: new Date().toISOString(),
        };
        if (existing) Object.assign(existing, record);
        else dbData.socialIndexPenalties.push(record);
        await persistRecordRow('social_index_penalties', existing || record,
            { student_id: studentId, academic_year: year });
        saveDB(dbData);
        return record;
    },

    // Talabaning to'liq indeksi - metodikadagi 11 mezon bo'yicha.
    getSocialActivityIndex: (studentId, academicYear = null) =>
        computeSocialActivityIndex(db, studentId, {
            academicYear: academicYear || getCurrentAcademicYear(),
        }),

    // --- INTIZOM VA ODOB-AXLOQ (4-mezon) ---
    //
    // Faqat BUZILISH qayd etiladi. Yozuvi yo'q talaba to'liq ballga ega -
    // metodikaning "rioya etishi maksimal ball olishini kafolatlaydi" qoidasi.
    getDisciplineViolations: (studentId = null, academicYear = null) => {
        const year = academicYear || getCurrentAcademicYear();
        return (getDB().disciplineViolations || [])
            .filter(v => (!studentId || v.studentId === studentId) && v.academicYear === year)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    addDisciplineViolation: async ({ studentId, type, date = null, note = '', evidence = '', recordedBy, academicYear = null }) => {
        await assertAuthenticated();
        if (!DISCIPLINE_PARTS[type]) throw new Error("Noma'lum buzilish turi");
        // Dalilsiz yozuv qo'yilmaydi: metodikada har ikkala qoida uchun ham
        // aniq asos talab qilinadi (tushuntirish xati yoki rasmiy hujjat).
        if (!String(evidence || '').trim()) {
            throw new Error(`Asos ko'rsatilishi shart: ${DISCIPLINE_PARTS[type].evidenceLabel}`);
        }

        const dbData = getDB();
        const record = {
            id: 'disc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            studentId, type,
            academicYear: academicYear || getCurrentAcademicYear(),
            date: date || new Date().toISOString().slice(0, 10),
            note: String(note || '').trim(),
            evidence: String(evidence).trim(),
            recordedBy,
            recordedAt: new Date().toISOString(),
        };
        (dbData.disciplineViolations = dbData.disciplineViolations || []).push(record);
        await persistRecordRow('discipline_violations', record, {
            student_id: studentId, academic_year: record.academicYear, type,
        });
        saveDB(dbData);

        // Talaba bilishi kerak - ball jimgina kamayib qolmasin.
        addNotificationToSupabase({
            userId: studentId,
            type: 'warning',
            title: 'Intizom bo\'yicha yozuv',
            message: `${DISCIPLINE_PARTS[type].label} bo'yicha buzilish qayd etildi`
                + (record.note ? `: ${record.note}` : '')
                + '. Bu "Ijtimoiy faollik indeksi"ning 4-mezoniga ta\'sir qiladi.',
        }).catch(() => {});

        return record;
    },

    removeDisciplineViolation: async (id) => {
        await assertAuthenticated();
        // Avval bazadan: faqat mahalliy o'chirilsa, yozuv keyingi
        // sinxronlashda qaytib kelardi.
        const { error } = await supabase.from('discipline_violations').delete().eq('id', id);
        if (error) throw new Error("O'chirilmadi: " + (error.message || ''));
        const dbData = getDB();
        dbData.disciplineViolations = (dbData.disciplineViolations || []).filter(v => v.id !== id);
        saveDB(dbData);
    },

    getDisciplineDeductions: () => {
        const saved = db.getIntegrationSettings('social_index').disciplineDeductions || {};
        return {
            dresscode: Number(saved.dresscode ?? DISCIPLINE_PARTS.dresscode.defaultDeduction),
            ethics: Number(saved.ethics ?? DISCIPLINE_PARTS.ethics.defaultDeduction),
        };
    },

    setDisciplineDeductions: async (patch) => {
        const next = { ...db.getDisciplineDeductions(), ...patch };
        await db.saveIntegrationSettings('social_index', { disciplineDeductions: next });
        return next;
    },

    // --- BAYRAM KUNLARI ---
    //
    // Apellyatsiya muddati ISH KUNLARIDA hisoblanadi. Shanba va yakshanba
    // har doim dam olish kuni (universitetning ish tartibi shunday), bayramlar
    // esa har yili o'zgaradi va ba'zilari ko'chib turadi - shuning uchun ular
    // sozlamada, kodda emas.
    //
    // Ro'yxat bo'sh bo'lsa muddat faqat hafta oxirlarini hisobga oladi:
    // bu avvalgi xatti-harakat, ya'ni sozlanmagan tizim ham ishlayveradi.
    getHolidays: () => {
        const saved = db.getIntegrationSettings('social_index').holidays;
        return Array.isArray(saved) ? saved.slice().sort() : [];
    },

    setHolidays: async (dates) => {
        // Faqat YYYY-MM-DD, takrorlanmaydigan, tartiblangan.
        const clean = [...new Set(
            (dates || [])
                .map(d => String(d).trim())
                .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
        )].sort();
        await db.saveIntegrationSettings('social_index', { holidays: clean });
        return clean;
    },

    addHoliday: async (date) => db.setHolidays([...db.getHolidays(), date]),

    removeHoliday: async (date) => db.setHolidays(db.getHolidays().filter(d => d !== date)),

    // =========================================================================
    // "MA'RIFAT DARSLARI" MODULI (7-mezon)
    //
    // Nega alohida modul: Ma'rifat darsi tadbir emas. U AUDITORIYA kesimida
    // rejalashtiriladi ("1-kurs uchun 6 ta dars"), qatnashish ixtiyoriy emas,
    // va davomat foizi shu auditoriya doirasida hisoblanadi. Tadbir
    // mexanizmiga tiqishtirilsa, tadbirlar ro'yxati buzilardi va maxrajni
    // aniqlashning iloji bo'lmasdi.
    //
    // Ma'lumot Supabase da: `supabase/marifat_lessons.sql`. Jadvallar
    // o'qilmasa (SQL ishga tushirilmagan bo'lsa) modul ishlamaydi va buni
    // ochiq aytadi - jimgina localStorage ga yozib qo'yish "saqlandi" degan
    // yolg'on taassurot berardi.
    // =========================================================================
    isMarifatBackendReady: () => getDB().marifatBackendReady !== false,

    getMarifatLessons: (academicYear = null) => {
        const year = academicYear || getCurrentAcademicYear();
        return (getDB().marifatLessons || [])
            .filter(l => l.academicYear === year)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    getMarifatLesson: (lessonId) =>
        (getDB().marifatLessons || []).find(l => l.id === lessonId) || null,

    saveMarifatLesson: async ({ id = null, title, topic = '', date, faculty, course, venue = '', by = null, academicYear = null }) => {
        await assertAuthenticated();
        if (!String(title || '').trim()) throw new Error('Dars nomini kiriting');
        if (!date) throw new Error('Sanani kiriting');
        // Auditoriyasiz dars foizni hisoblab bo'lmaydigan qiladi - maxraj
        // aynan shu ikki maydondan chiqadi.
        if (!faculty) throw new Error('Fakultetni tanlang');
        if (!course) throw new Error('Kursni tanlang');

        const dbData = getDB();
        dbData.marifatLessons = dbData.marifatLessons || [];
        const existing = id ? dbData.marifatLessons.find(l => l.id === id) : null;
        const record = {
            id: existing?.id || 'mrf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            academicYear: existing?.academicYear || academicYear || getCurrentAcademicYear(),
            title: String(title).trim(),
            topic: String(topic || '').trim(),
            date, faculty, course: Number(course),
            venue: String(venue || '').trim(),
            createdBy: existing?.createdBy || by,
            createdAt: existing?.createdAt || new Date().toISOString(),
            locked: existing?.locked || false,
        };

        const { error } = await supabase.from('marifat_lessons').upsert({
            id: record.id, academic_year: record.academicYear,
            title: record.title, topic: record.topic, date: record.date,
            faculty: record.faculty, course: record.course, venue: record.venue,
            locked: record.locked, created_by: record.createdBy,
            created_at: record.createdAt, updated_at: new Date().toISOString(),
        });
        if (error) throw error;

        if (existing) Object.assign(existing, record);
        else dbData.marifatLessons.push(record);
        saveDB(dbData);
        return record;
    },

    deleteMarifatLesson: async (lessonId) => {
        await assertAuthenticated();
        const dbData = getDB();
        const lesson = (dbData.marifatLessons || []).find(l => l.id === lessonId);
        if (!lesson) throw new Error('Dars topilmadi');
        // Qulflangan davomat - rasmiy yozuv, o'chirilmaydi.
        if (lesson.locked) throw new Error("Davomati qulflangan darsni o'chirib bo'lmaydi");

        const { error } = await supabase.from('marifat_lessons').delete().eq('id', lessonId);
        if (error) throw error;

        dbData.marifatLessons = dbData.marifatLessons.filter(l => l.id !== lessonId);
        dbData.marifatAttendance = (dbData.marifatAttendance || []).filter(a => a.lessonId !== lessonId);
        saveDB(dbData);
    },

    getMarifatAttendance: (lessonId) =>
        (getDB().marifatAttendance || []).filter(a => a.lessonId === lessonId),

    // Davomat + FAOL ISHTIROK belgisi bir yozuvda. Faollik alohida jadval
    // emas: u aynan shu darsdagi ishtirokning sifati.
    markMarifatAttendance: async (lessonId, rows, { by = null } = {}) => {
        await assertAuthenticated();
        const dbData = getDB();
        const lesson = (dbData.marifatLessons || []).find(l => l.id === lessonId);
        if (!lesson) throw new Error('Dars topilmadi');
        if (lesson.locked) throw new Error('Davomat qulflangan');

        dbData.marifatAttendance = dbData.marifatAttendance || [];
        const now = new Date().toISOString();

        // Bitta so'rovda yoziladi: 100+ talabani birma-bir yuborish oynani
        // muzlatib qo'yardi (Excel importidagi xatoning aynan o'zi).
        const prepared = rows.map(r => {
            const existing = dbData.marifatAttendance.find(a =>
                a.lessonId === lessonId && a.studentId === r.studentId);
            return {
                id: existing?.id || 'mrfa_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
                lesson_id: lessonId, student_id: r.studentId,
                present: !!r.present,
                // Kelmagan talaba faol bo'la olmaydi - mantiqiy zid holatni
                // saqlab qo'yish keyin hisobni buzardi.
                active: !!r.present && !!r.active,
                marked_by: by, marked_at: now,
            };
        });

        const { error } = await supabase.from('marifat_attendance')
            .upsert(prepared, { onConflict: 'lesson_id,student_id' });
        if (error) throw error;

        prepared.forEach(p => {
            const rec = mapMarifatAttendanceFromSupabase({ ...p, data: {} });
            const idx = dbData.marifatAttendance.findIndex(a =>
                a.lessonId === lessonId && a.studentId === p.student_id);
            if (idx >= 0) dbData.marifatAttendance[idx] = rec;
            else dbData.marifatAttendance.push(rec);
        });
        saveDB(dbData);
    },

    lockMarifatLesson: async (lessonId, locked = true) => {
        await assertAuthenticated();
        const dbData = getDB();
        const lesson = (dbData.marifatLessons || []).find(l => l.id === lessonId);
        if (!lesson) throw new Error('Dars topilmadi');

        const { error } = await supabase.from('marifat_lessons')
            .update({ locked: !!locked, updated_at: new Date().toISOString() })
            .eq('id', lessonId);
        if (error) throw error;

        lesson.locked = !!locked;
        saveDB(dbData);
        return lesson;
    },

    // Talabaning Ma'rifat darslaridagi ko'rsatkichi.
    //
    // MAXRAJ: talabaning fakulteti va kursi uchun o'tkazilgan, DAVOMATI
    // BELGILANGAN darslar. Davomati umuman belgilanmagan dars maxrajga
    // kirmaydi - 2-mezondagi qoidaning aynan o'zi: talaba boshqa odamning
    // ishi uchun jazolanmasligi kerak.
    getStudentMarifatActivity: (studentId, academicYear = null) => {
        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();
        const student = db.getMockStudents().find(s => s.id === studentId);
        if (!student) return { held: 0, attended: 0, active: 0, percent: null, lessons: [] };

        const attendance = dbData.marifatAttendance || [];
        const lessons = (dbData.marifatLessons || []).filter(l =>
            l.academicYear === year
            && l.faculty === student.faculty
            && Number(l.course) === Number(student.course)
            && attendance.some(a => a.lessonId === l.id));

        let attended = 0;
        let active = 0;
        const rows = lessons.map(l => {
            const mark = attendance.find(a => a.lessonId === l.id && a.studentId === studentId);
            if (mark?.present) attended++;
            if (mark?.active) active++;
            return {
                lessonId: l.id, title: l.title, date: l.date,
                present: !!mark?.present, active: !!mark?.active,
            };
        }).sort((a, b) => new Date(a.date) - new Date(b.date));

        return {
            held: lessons.length,
            attended, active,
            percent: lessons.length > 0 ? Math.round((attended / lessons.length) * 100) : null,
            audience: `${student.faculty}, ${student.course}-kurs`,
            lessons: rows,
        };
    },

    // Faollik bali - VAKOLATLI SHAXS qo'yadi. Tizim faqat taklif beradi;
    // qo'lda kiritilgan qiymat har doim ustun turadi.
    getMarifatActivityScore: (studentId, academicYear = null) => {
        const year = academicYear || getCurrentAcademicYear();
        return (getDB().marifatActivityScores || []).find(s =>
            s.studentId === studentId && s.academicYear === year) || null;
    },

    setMarifatActivityScore: async ({ studentId, points, comment = '', by = null, academicYear = null }) => {
        await assertAuthenticated();
        const max = INDEX_CRITERIA.EDUCATION.activityPoints;
        const value = points === null || points === '' ? null : Number(points);
        if (value != null && (Number.isNaN(value) || value < 0 || value > max)) {
            throw new Error(`Faollik bali 0 dan ${max} gacha bo'lishi kerak`);
        }

        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();
        dbData.marifatActivityScores = dbData.marifatActivityScores || [];
        const existing = dbData.marifatActivityScores.find(s =>
            s.studentId === studentId && s.academicYear === year);

        if (value == null) {
            if (existing?.id) {
                const { error } = await supabase.from('marifat_activity_scores').delete().eq('id', existing.id);
                if (error) throw error;
            }
            dbData.marifatActivityScores = dbData.marifatActivityScores.filter(s => s !== existing);
            saveDB(dbData);
            return null;
        }

        const record = {
            id: existing?.id || 'mrfs_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            studentId, academicYear: year, points: value,
            comment: String(comment || '').trim(),
            assessedBy: by, assessedAt: new Date().toISOString(),
        };

        const { error } = await supabase.from('marifat_activity_scores').upsert({
            id: record.id, student_id: studentId, academic_year: year,
            points: value, comment: record.comment,
            assessed_by: by, assessed_at: record.assessedAt,
        }, { onConflict: 'student_id,academic_year' });
        if (error) throw error;

        if (existing) Object.assign(existing, record);
        else dbData.marifatActivityScores.push(record);
        saveDB(dbData);
        return record;
    },

    // =========================================================================
    // TERMA JAMOALAR (10-mezon)
    //
    // Metodikaning uchta a'zolik turi BIR-BIRINI ISTISNO QILADI. Ikkitasi
    // platformada allaqachon bor (sport klubi davomati, sport musobaqalari),
    // uchinchisi - terma jamoa - shu yerda.
    //
    // YANGI ROL OCHILMADI: jamoani sport yo'nalishidagi klubning koordinatori
    // boshqaradi. Klub yo'nalishlari 2-mezon uchun allaqachon belgilanadi.
    // =========================================================================
    isSportBackendReady: () => getDB().sportBackendReady !== false,

    // Foydalanuvchi sport yo'nalishidagi klub rahbarimi.
    isSportClubLead: (userId) => {
        if (!userId) return false;
        const directions = db.getClubDirections();
        const sportClubIds = Object.keys(directions).filter(id => directions[id] === 'sport');
        if (sportClubIds.length === 0) return false;
        return (getDB().memberships || []).some(m =>
            m.userId === userId
            && sportClubIds.includes(String(m.clubId))
            && ['head_coordinator', 'coordinator'].includes(m.role));
    },

    getSportTeams: (academicYear = null) => {
        const year = academicYear || getCurrentAcademicYear();
        return (getDB().sportTeams || [])
            .filter(t => t.academicYear === year)
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    },

    saveSportTeam: async ({ id = null, clubId = null, name, sport = '', maxSize = null, isActive = true, by = null, academicYear = null }) => {
        await assertAuthenticated();
        if (!String(name || '').trim()) throw new Error('Jamoa nomini kiriting');

        const dbData = getDB();
        dbData.sportTeams = dbData.sportTeams || [];
        const existing = id ? dbData.sportTeams.find(t => t.id === id) : null;
        const record = {
            id: existing?.id || 'sport_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            clubId, name: String(name).trim(), sport: String(sport || '').trim(),
            // MAVSUM: o'tgan yilgi a'zolik jimgina davom etmasligi kerak.
            academicYear: existing?.academicYear || academicYear || getCurrentAcademicYear(),
            maxSize: maxSize === '' || maxSize == null ? null : Number(maxSize),
            isActive: !!isActive,
            createdBy: existing?.createdBy || by,
            createdAt: existing?.createdAt || new Date().toISOString(),
        };

        const { error } = await supabase.from('sport_teams').upsert({
            id: record.id, club_id: record.clubId, name: record.name, sport: record.sport,
            academic_year: record.academicYear, max_size: record.maxSize,
            is_active: record.isActive, created_by: record.createdBy, created_at: record.createdAt,
        });
        if (error) throw error;

        if (existing) Object.assign(existing, record);
        else dbData.sportTeams.push(record);
        saveDB(dbData);
        return record;
    },

    getSportNominations: ({ teamId = null, studentId = null, status = null, academicYear = null } = {}) => {
        const year = academicYear || getCurrentAcademicYear();
        return (getDB().sportTeamNominations || [])
            .filter(n => n.academicYear === year
                && (!teamId || n.teamId === teamId)
                && (!studentId || n.studentId === studentId)
                && (!status || n.status === status))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    // Nomzod tavsiya etish. `source: 'head'` bo'lsa darhol tasdiqlanadi -
    // ko'rib chiqadigan odamning O'ZI qo'shyapti, ikkinchi bosqich ortiqcha.
    nominateToSportTeam: async ({ teamId, studentId, source = 'tutor', nominatedBy = null, motivation = '' }) => {
        await assertAuthenticated();
        const dbData = getDB();
        const team = (dbData.sportTeams || []).find(t => t.id === teamId);
        if (!team) throw new Error('Jamoa topilmadi');

        dbData.sportTeamNominations = dbData.sportTeamNominations || [];
        if (dbData.sportTeamNominations.some(n => n.teamId === teamId && n.studentId === studentId)) {
            throw new Error('Bu talaba shu jamoaga allaqachon tavsiya etilgan');
        }

        // Tarkib soni cheklangan bo'lsa - tasdiqlanganlar sanaladi.
        if (team.maxSize) {
            const approved = dbData.sportTeamNominations.filter(n =>
                n.teamId === teamId && n.status === 'approved' && !n.endedAt).length;
            if (source === 'head' && approved >= team.maxSize) {
                throw new Error(`Tarkib to'lgan (${team.maxSize} ta a'zo)`);
            }
        }

        const now = new Date().toISOString();
        const approved = source === 'head';
        const record = {
            id: 'spnom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            teamId, studentId, academicYear: team.academicYear,
            source, nominatedBy, motivation: String(motivation || '').trim(),
            status: approved ? 'approved' : 'pending',
            reviewedBy: approved ? nominatedBy : null,
            reviewedAt: approved ? now : null,
            reviewComment: '',
            createdAt: now,
        };

        const { error } = await supabase.from('sport_team_nominations').insert({
            id: record.id, team_id: teamId, student_id: studentId,
            academic_year: record.academicYear, source, nominated_by: nominatedBy,
            motivation: record.motivation, status: record.status,
            reviewed_by: record.reviewedBy, reviewed_at: record.reviewedAt,
            created_at: now,
        });
        if (error) throw error;

        dbData.sportTeamNominations.push(record);
        saveDB(dbData);

        addNotificationToSupabase({
            userId: studentId,
            type: approved ? 'success' : 'info',
            title: approved ? "Terma jamoa tarkibiga qo'shildingiz" : 'Terma jamoaga tavsiya etildingiz',
            message: `${team.name}${team.sport ? ` (${team.sport})` : ''}`
                + (approved ? '' : ' — sport klubi rahbari ko\'rib chiqadi.'),
        }).catch(() => {});

        return record;
    },

    reviewSportNomination: async ({ nominationId, action, comment = '', reviewedBy }) => {
        await assertAuthenticated();
        const status = action === 'approve' ? 'approved' : 'rejected';
        if (status === 'rejected' && !String(comment || '').trim()) {
            throw new Error('Rad etish sababini yozing');
        }

        const dbData = getDB();
        const nom = (dbData.sportTeamNominations || []).find(n => n.id === nominationId);
        if (!nom) throw new Error('Nomzod topilmadi');

        const team = (dbData.sportTeams || []).find(t => t.id === nom.teamId);
        if (status === 'approved' && team?.maxSize) {
            const approved = dbData.sportTeamNominations.filter(n =>
                n.teamId === nom.teamId && n.status === 'approved' && !n.endedAt).length;
            if (approved >= team.maxSize) throw new Error(`Tarkib to'lgan (${team.maxSize} ta a'zo)`);
        }

        const now = new Date().toISOString();
        const { error } = await supabase.from('sport_team_nominations').update({
            status, reviewed_by: reviewedBy, reviewed_at: now,
            review_comment: String(comment || '').trim(),
        }).eq('id', nominationId);
        if (error) throw error;

        Object.assign(nom, { status, reviewedBy, reviewedAt: now, reviewComment: String(comment || '').trim() });
        saveDB(dbData);

        addNotificationToSupabase({
            userId: nom.studentId,
            type: status === 'approved' ? 'success' : 'warning',
            title: status === 'approved' ? "Terma jamoa tarkibiga qabul qilindingiz" : 'Terma jamoaga qabul qilinmadingiz',
            message: `${team?.name || ''}${nom.reviewComment ? `. ${nom.reviewComment}` : ''}`,
        }).catch(() => {});

        return nom;
    },

    // Tarkibdan chiqarilgan a'zo hisobga kirmaydi. Yozuv O'CHIRILMAYDI -
    // tarix qoladi va kim chiqargani ko'rinadi.
    isSportTeamMember: (studentId, academicYear = null) =>
        db.getSportNominations({ studentId, status: 'approved', academicYear })
            .some(n => !n.endedAt),

    removeFromSportTeam: async ({ nominationId, reason, by = null }) => {
        await assertAuthenticated();
        if (!String(reason || '').trim()) throw new Error('Chiqarish sababini yozing');

        const dbData = getDB();
        const nom = (dbData.sportTeamNominations || []).find(n => n.id === nominationId);
        if (!nom) throw new Error('Yozuv topilmadi');
        if (nom.status !== 'approved') throw new Error("Faqat tarkibdagi a'zoni chiqarish mumkin");
        if (nom.endedAt) throw new Error('Bu a\'zo allaqachon chiqarilgan');

        const now = new Date().toISOString();
        // Yangi ustun ochilmadi: iz `data` jsonb ichida qoladi.
        const { error } = await supabase.from('sport_team_nominations')
            .update({ data: { endedAt: now, endedBy: by, endReason: String(reason).trim() } })
            .eq('id', nominationId);
        if (error) throw error;

        Object.assign(nom, { endedAt: now, endedBy: by, endReason: String(reason).trim() });
        saveDB(dbData);

        addNotificationToSupabase({
            userId: nom.studentId,
            type: 'warning',
            title: 'Terma jamoa tarkibidan chiqarildingiz',
            message: String(reason).trim(),
        }).catch(() => {});

        return nom;
    },

    // "Muntazam shug'ullanish" chegarasi - metodikada foiz yo'q, universitet
    // belgilaydi.
    getSportSectionMinPercent: () =>
        Number(db.getIntegrationSettings('social_index').sportSectionMinPercent)
        || SPORT_POLICY.defaultSectionMinPercent,

    setSportSectionMinPercent: async (value) => {
        const n = Math.max(1, Math.min(100, Number(value) || SPORT_POLICY.defaultSectionMinPercent));
        await db.saveIntegrationSettings('social_index', { sportSectionMinPercent: n });
        return n;
    },

    // OTM SPORT MUSOBAQALARIDAGI ISHTIROK.
    //
    // Manba - `match_play` dvigatelidagi musobaqalar ("Sport (Guruh +
    // Pley-off)"). Ilgari bu daraja sport KLUBI tadbirlaridagi davomatdan
    // hisoblanardi, ya'ni klub uchrashuviga borgan talaba "musobaqada
    // qatnashgan" bo'lib chiqardi.
    getStudentSportCompetitions: (studentId, academicYear = null) => {
        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();
        const sportComps = new Map((dbData.competitions || [])
            .filter(c => c.scoringMethod === 'match_play')
            .map(c => [String(c.id), c]));
        if (sportComps.size === 0) return [];

        const seen = new Set();
        const rows = [];
        (dbData.activityAttendance || []).forEach(a => {
            if (a.participantId !== studentId || a.status !== 'present') return;
            if (a.activityType !== 'competition') return;
            if (a.createdAt && academicYearOf(a.createdAt) !== year) return;
            const comp = sportComps.get(String(a.activityId));
            if (!comp || seen.has(comp.id)) return;
            seen.add(comp.id);
            rows.push({ id: comp.id, title: comp.title, date: comp.startDate || comp.date || null });
        });
        return rows;
    },

    // NOMZODNING SPORT MANZARASI - rahbar ismni emas, dalilni ko'rsin.
    getSportCandidateProfile: (studentId, academicYear = null) => {
        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();

        // Sport musobaqalaridagi natijalar - tizim bergan hujjatlardan.
        const comps = new Map((dbData.competitions || []).map(c => [c.id, c]));
        const results = (db.getStudentDocuments(studentId) || [])
            .filter(d => d.status === 'issued')
            .map(d => {
                const protocol = d.protocolId ? db.getProtocolById(d.protocolId) : null;
                if (!protocol || protocol.activityType !== 'competition') return null;
                const comp = comps.get(protocol.activityId);
                if (!comp || comp.scoringMethod !== 'match_play') return null;
                return { title: comp.title, place: d.place, date: d.issuedAt || comp.startDate };
            })
            .filter(Boolean);

        // Sport yo'nalishidagi klublardagi davomat.
        const { perClub } = db.getStudentClubDirectionActivity(studentId, year);
        const directions = db.getClubDirections();
        const sportClubs = perClub.filter(c => directions[c.clubId] === 'sport');

        // Avvalgi terma jamoa a'zoliklari - barcha yillar.
        const teams = new Map((dbData.sportTeams || []).map(t => [t.id, t]));
        const history = (dbData.sportTeamNominations || [])
            .filter(n => n.studentId === studentId && n.status === 'approved')
            .map(n => ({
                team: teams.get(n.teamId)?.name || n.teamId,
                sport: teams.get(n.teamId)?.sport || '',
                academicYear: n.academicYear,
            }));

        return { results, sportClubs, history };
    },

    // TIZIMNING TAVSIYASI - rahbar 550 talaba orasidan qidirmasin.
    //
    // Nomzod deb hisoblanadi: sport musobaqasida natijasi bor YOKI sport
    // klubida davomati bor. Allaqachon tavsiya etilganlar ro'yxatdan chiqadi.
    getSuggestedSportCandidates: (teamId, academicYear = null) => {
        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();
        const already = new Set(db.getSportNominations({ teamId, academicYear: year }).map(n => n.studentId));

        const directions = db.getClubDirections();
        const sportClubIds = new Set(Object.keys(directions).filter(id => directions[id] === 'sport'));

        // Sport klublarining tadbirlarida qatnashganlar.
        const clubOfActivity = new Map();
        (dbData.events || []).forEach(e => { if (e.clubId) clubOfActivity.set(`event:${e.id}`, String(e.clubId)); });
        (dbData.competitions || []).forEach(c => {
            if (c.contextType === 'club' && c.contextId) clubOfActivity.set(`competition:${c.id}`, String(c.contextId));
        });

        const scores = new Map(); // studentId -> {attended, results}
        (dbData.activityAttendance || []).forEach(a => {
            if (a.status !== 'present') return;
            if (a.createdAt && academicYearOf(a.createdAt) !== year) return;
            const clubId = clubOfActivity.get(`${a.activityType}:${a.activityId}`);
            if (!clubId || !sportClubIds.has(clubId)) return;
            const cur = scores.get(a.participantId) || { attended: 0, results: 0 };
            cur.attended++;
            scores.set(a.participantId, cur);
        });

        // Sport musobaqalarida sovrinli o'rin olganlar.
        const sportCompIds = new Set((dbData.competitions || [])
            .filter(c => c.scoringMethod === 'match_play').map(c => String(c.id)));
        (dbData.documents || []).forEach(d => {
            if (d.status !== 'issued' || !d.protocolId) return;
            const protocol = db.getProtocolById(d.protocolId);
            if (!protocol || protocol.activityType !== 'competition') return;
            if (!sportCompIds.has(String(protocol.activityId))) return;
            const ids = [d.recipientId, ...(d.members || []).map(m => m.userId)].filter(Boolean);
            ids.forEach(id => {
                const cur = scores.get(id) || { attended: 0, results: 0 };
                cur.results++;
                scores.set(id, cur);
            });
        });

        const students = new Map(db.getMockStudents().map(s => [s.id, s]));
        return Array.from(scores.entries())
            .filter(([id]) => !already.has(id) && students.has(id))
            .map(([id, v]) => ({ student: students.get(id), ...v }))
            // Natijasi borlar oldinda - ular kuchliroq nomzod.
            .sort((a, b) => (b.results - a.results) || (b.attended - a.attended))
            .slice(0, 30);
    },

    // =========================================================================
    // TALABANING RAQAMLI PASPORTI
    //
    // Pasport ma'lumotni TAKRORLAMAYDI: turar joy, davomat, ijtimoiy faollik
    // o'z jadvallarida qoladi va bu yerda faqat O'QILADI. Ikkinchi nusxa
    // saqlansa ikkita raqam bir-biriga zid chiqadi.
    //
    // Ko'rinish KO'RUVCHIGA QARAB o'zgaradi: JSHSHIR, passport, nogironlik va
    // ijtimoiy himoya hammaga ochilmaydi. Maxfiy maydonga qaralganda iz qoladi.
    // =========================================================================
    isPassportBackendReady: () => getDB().passportBackendReady !== false,

    // Ko'ruvchi turini aniqlash. "Ko'rmaslik" xavfsiz standart: ro'yxatda
    // yo'q odam faqat ochiq maydonlarni ko'radi.
    resolvePassportViewer: (viewer, studentId) => {
        if (!viewer) return VIEWER_KINDS.OTHER;
        if (viewer.username === studentId) return VIEWER_KINDS.SELF;
        if (viewer.role === 'ADMINISTRATOR') return VIEWER_KINDS.ADMIN;
        if (db.isScholarshipEvaluator && db.isScholarshipEvaluator(viewer.username)) {
            return VIEWER_KINDS.EVALUATOR;
        }
        // Tyutorlik ROLGA emas, BIRIKTIRUVGA bog'liq - boshqa tyutorning
        // talabasini ko'rish huquqi bermaydi.
        const isMyStudent = (getDB().talentAssignments || []).some(a =>
            a.active && a.role === 'tutor'
            && a.personId === viewer.username && a.studentId === studentId);
        if (isMyStudent) return VIEWER_KINDS.TUTOR;

        const housing = db.getStudentHousing(studentId);
        if (housing?.dormitoryId) {
            const dorm = (getDB().dormitories || []).find(d => d.id === housing.dormitoryId);
            if (dorm?.responsibleUserId === viewer.username) return VIEWER_KINDS.DORM;
        }
        if (viewer.role === 'RAHBARIYAT') return VIEWER_KINDS.MANAGEMENT;
        return VIEWER_KINDS.OTHER;
    },

    getStudentPassportRaw: (studentId) =>
        (getDB().studentPassports || []).find(p => p.studentId === studentId) || null,

    // YIG'MA PASPORT. `viewer` berilsa ko'rinish filtrlanadi.
    getStudentPassport: (studentId, viewer = null) => {
        const dbData = getDB();
        const student = db.getMockStudents().find(s => s.id === studentId)
            || (dbData.realProfiles || []).find(p => p.id === studentId || p.username === studentId);
        const stored = db.getStudentPassportRaw(studentId);
        const sections = stored?.sections || {};
        const sources = stored?.fieldSources || {};

        // Boshqa qatlamlardan keladigan qiymatlar (1-qoida).
        const housing = db.getStudentHousing(studentId);
        const dorm = housing?.dormitoryId
            ? (dbData.dormitories || []).find(d => d.id === housing.dormitoryId)
            : null;
        const computed = {
            'identity.fullName': student?.fullName || null,
            'identity.gender': student?.gender === 'male' ? 'Erkak' : student?.gender === 'female' ? 'Ayol' : null,
            'education.faculty': student?.faculty || null,
            'education.course': student?.course ? `${student.course}-kurs` : null,
            'education.group': student?.group || null,
            'housing.housingType': housing
                ? ({ dormitory: 'Yotoqxona', rent: 'Ijara', family: 'Oilasi bilan' })[housing.housingType]
                : null,
            'housing.dormitory': dorm?.name || null,
            'housing.room': housing?.room || null,
        };

        const viewerKind = viewer ? db.resolvePassportViewer(viewer, studentId) : VIEWER_KINDS.ADMIN;
        const openedSensitive = [];

        const result = PASSPORT_SECTIONS
            .filter(section => canViewSection(viewerKind, section))
            .map(section => ({
                key: section.key,
                label: section.label,
                fields: section.fields.map(field => {
                    const path = `${section.key}.${field.key}`;
                    const visible = canViewField(viewerKind, section.key, field);
                    if (visible && isAccessLogged(field)) openedSensitive.push(path);
                    const value = field.computed
                        ? computed[path] ?? null
                        : sections[section.key]?.[field.key] ?? null;
                    return {
                        ...field, path, visible,
                        // Ko'rinmaydigan maydon QIYMATSIZ qaytadi - "yashirilgan"
                        // yozuvi ko'rinadi, qiymatning o'zi emas.
                        value: visible ? value : null,
                        source: sources[path] || (field.computed ? 'platform' : null),
                    };
                }),
            }));

        return {
            studentId, student: student || null,
            viewerKind, sections: result, openedSensitive,
            updatedAt: stored?.updatedAt || null,
            updatedBy: stored?.updatedBy || null,
        };
    },

    // ----------------------------------------------------------------------
    // TALABANING ALOQA MA'LUMOTI - ro'yxatlardagi ustun uchun.
    //
    // NEGA ALOHIDA: to'liq pasportni har qator uchun yig'ish qimmat va
    // ortiqcha. Bu yerda faqat ikkita maydon o'qiladi.
    //
    // MAXFIYLIK QOIDASI CHETLAB O'TILMAYDI: ko'rinish `canViewField` orqali
    // hal qilinadi, ya'ni ro'yxatda ham pasportdagi bilan bir xil cheklov
    // ishlaydi. Masalan rahbariyat telefon raqamini KO'RMAYDI - va bu
    // yerda ham ko'rmaydi.
    //
    // Iz (`logPassportAccess`) yozilmaydi: telefon va pochta "ichki"
    // darajadagi maydonlar, maxfiy emas - `isAccessLogged` ular uchun
    // yolg'on qaytaradi. Maxfiy maydon bu funksiyadan umuman chiqmaydi.
    // ----------------------------------------------------------------------
    // `restricted` - qiymat BOR, lekin ko'rsatilmadi. Bu "kiritilmagan" dan
    // boshqa narsa va foydalanuvchiga shunday aytiladi: bo'sh chiziqcha
    // ko'rgan odam ma'lumot yo'q deb o'ylab, uni yana so'rab yurardi.
    getStudentContact: (studentId, viewer = null) => {
        const viewerKind = viewer ? db.resolvePassportViewer(viewer, studentId) : VIEWER_KINDS.ADMIN;
        const section = PASSPORT_SECTIONS.find(s => s.key === 'contact');
        const stored = db.getStudentPassportRaw(studentId);
        const values = stored?.sections?.contact || {};

        if (!section || !canViewSection(viewerKind, section)) {
            return { phone: null, email: null, restricted: !!(values.phone || values.email) };
        }

        let restricted = false;
        const read = (key) => {
            const field = section.fields.find(f => f.key === key);
            const blocked = !field
                || !canViewField(viewerKind, 'contact', field)
                // Maxfiy maydon bu yo'l bilan berilmaydi - u iz talab qiladi.
                || isAccessLogged(field);
            if (blocked) {
                if (values[key]) restricted = true;
                return null;
            }
            return values[key] || null;
        };

        const phone = read('phone');
        const email = read('email');
        return { phone, email, restricted };
    },

    // Maxfiy maydon ochilganda iz qoldirish. Cheklovdan muhimroq: cheklovni
    // chetlab o'tish mumkin, izni esa yo'q.
    logPassportAccess: async ({ studentId, viewer, viewerKind, fields, reason = '' }) => {
        if (!fields || fields.length === 0) return null;
        // O'z ma'lumotini ko'rish - iz qoldirilmaydi, bu nazorat emas.
        if (viewerKind === VIEWER_KINDS.SELF) return null;

        const record = {
            id: 'pal_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            studentId, viewerId: viewer?.username || 'anonim', viewerKind,
            fields, reason: String(reason || ''),
            createdAt: new Date().toISOString(),
        };
        const { error } = await supabase.from('passport_access_logs').insert({
            id: record.id, student_id: studentId, viewer_id: record.viewerId,
            viewer_kind: viewerKind, fields, reason: record.reason, created_at: record.createdAt,
        });
        if (error) return null;
        return record;
    },

    getPassportAccessLogs: (studentId) =>
        (getDB().passportAccessLogs || [])
            .filter(l => l.studentId === studentId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),

    // Pasport maydonlarini saqlash. `values` - { "identity.jshshir": "..." }.
    setPassportFields: async ({ studentId, values, source = 'manual', by = null }) => {
        await assertAuthenticated();
        const dbData = getDB();
        dbData.studentPassports = dbData.studentPassports || [];
        const existing = dbData.studentPassports.find(p => p.studentId === studentId);

        const sections = JSON.parse(JSON.stringify(existing?.sections || {}));
        const fieldSources = { ...(existing?.fieldSources || {}) };

        Object.entries(values).forEach(([path, value]) => {
            const meta = PASSPORT_FIELD_INDEX[path];
            // Hisoblanadigan maydon pasportga YOZILMAYDI - u boshqa qatlamning
            // ma'lumoti va u yerda o'zgartiriladi.
            if (!meta || meta.computed) return;
            const [sectionKey, fieldKey] = path.split('.');
            sections[sectionKey] = sections[sectionKey] || {};
            if (value === '' || value == null) delete sections[sectionKey][fieldKey];
            else sections[sectionKey][fieldKey] = value;
            fieldSources[path] = source;
        });

        const now = new Date().toISOString();
        const { error } = await supabase.from('student_passport').upsert({
            student_id: studentId, sections, field_sources: fieldSources,
            updated_by: by, updated_at: now,
        });
        if (error) throw error;

        const record = { studentId, sections, fieldSources, updatedBy: by, updatedAt: now };
        if (existing) Object.assign(existing, record);
        else dbData.studentPassports.push(record);
        saveDB(dbData);
        return record;
    },

    // O'quv tarixi - kurs va guruh yil kesimida.
    getEnrollmentHistory: (studentId) =>
        (getDB().enrollmentHistory || [])
            .filter(h => h.studentId === studentId)
            .sort((a, b) => String(b.academicYear).localeCompare(String(a.academicYear))),

    setEnrollmentRecord: async ({ studentId, academicYear, course, faculty, studentGroup = '', educationForm = '', status = '', source = 'manual' }) => {
        await assertAuthenticated();
        const dbData = getDB();
        dbData.enrollmentHistory = dbData.enrollmentHistory || [];
        const existing = dbData.enrollmentHistory.find(h =>
            h.studentId === studentId && h.academicYear === academicYear);
        const record = {
            id: existing?.id || 'enr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            studentId, academicYear,
            course: course == null || course === '' ? null : Number(course),
            faculty: faculty || null, studentGroup, educationForm, status, source,
            createdAt: existing?.createdAt || new Date().toISOString(),
        };

        const { error } = await supabase.from('student_enrollment_history').upsert({
            id: record.id, student_id: studentId, academic_year: academicYear,
            course: record.course, faculty: record.faculty, student_group: studentGroup,
            education_form: educationForm, status, source, created_at: record.createdAt,
        }, { onConflict: 'student_id,academic_year' });
        if (error) throw error;

        if (existing) Object.assign(existing, record);
        else dbData.enrollmentHistory.push(record);
        saveDB(dbData);
        return record;
    },

    // --- TURAR JOY VA YOTOQXONALAR ---
    //
    // 10-mezonning "toza-ozoda yurish" bandini KIM baholashi talabaning
    // qayerda yashashiga bog'liq: yotoqxonada bo'lsa - mudiri, aks holda
    // tyutori. "Zararli illatlardan xoli" esa har doim tyutorda.
    //
    // ESLATMA: yashash joyi ma'lumoti KELAJAKDA talaba ma'lumotlari
    // qatlamidan avtomatik keladi (`source: 'system'`). Hozircha qo'lda
    // kiritiladi va bu vaqtinchalik holat.
    isHousingBackendReady: () => getDB().housingBackendReady !== false,

    getDormitories: (includeInactive = false) =>
        (getDB().dormitories || [])
            .filter(d => includeInactive || d.isActive)
            .sort((a, b) => String(a.name).localeCompare(String(b.name))),

    saveDormitory: async ({ id = null, name, address = '', responsibleUserId = null, isActive = true, by = null }) => {
        await assertAuthenticated();
        if (!String(name || '').trim()) throw new Error('Yotoqxona nomini kiriting');

        const dbData = getDB();
        dbData.dormitories = dbData.dormitories || [];
        const existing = id ? dbData.dormitories.find(d => d.id === id) : null;
        const record = {
            id: existing?.id || 'dorm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: String(name).trim(), address: String(address || '').trim(),
            responsibleUserId: responsibleUserId || null,
            isActive: !!isActive,
            createdBy: existing?.createdBy || by,
            createdAt: existing?.createdAt || new Date().toISOString(),
        };

        const { error } = await supabase.from('dormitories').upsert({
            id: record.id, name: record.name, address: record.address,
            responsible_user_id: record.responsibleUserId, is_active: record.isActive,
            created_by: record.createdBy, created_at: record.createdAt,
        });
        if (error) throw error;

        if (existing) Object.assign(existing, record);
        else dbData.dormitories.push(record);
        saveDB(dbData);
        return record;
    },

    // Barcha yozuvlar - yotoqxona bandligi tahlili uchun (moduleStats.js).
    getAllStudentHousing: (academicYear = null) => {
        const year = academicYear || getCurrentAcademicYear();
        return (getDB().studentHousing || []).filter(h => h.academicYear === year);
    },

    getStudentHousing: (studentId, academicYear = null) => {
        const year = academicYear || getCurrentAcademicYear();
        return (getDB().studentHousing || []).find(h =>
            h.studentId === studentId && h.academicYear === year) || null;
    },

    setStudentHousing: async ({ studentId, housingType, dormitoryId = null, room = '', source = 'manual', by = null, academicYear = null }) => {
        await assertAuthenticated();
        if (!['dormitory', 'rent', 'family'].includes(housingType)) throw new Error('Turar joy turini tanlang');
        // Yotoqxona ko'rsatilmasa baholovchini aniqlab bo'lmaydi.
        if (housingType === 'dormitory' && !dormitoryId) throw new Error('Yotoqxonani tanlang');

        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();
        dbData.studentHousing = dbData.studentHousing || [];
        const existing = dbData.studentHousing.find(h =>
            h.studentId === studentId && h.academicYear === year);
        const record = {
            id: existing?.id || 'hous_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            studentId, academicYear: year, housingType,
            dormitoryId: housingType === 'dormitory' ? dormitoryId : null,
            room: String(room || '').trim(), source,
            updatedBy: by, updatedAt: new Date().toISOString(),
        };

        const { error } = await supabase.from('student_housing').upsert({
            id: record.id, student_id: studentId, academic_year: year,
            housing_type: housingType, dormitory_id: record.dormitoryId,
            room: record.room, source, updated_by: by, updated_at: record.updatedAt,
        }, { onConflict: 'student_id,academic_year' });
        if (error) throw error;

        if (existing) Object.assign(existing, record);
        else dbData.studentHousing.push(record);
        saveDB(dbData);
        return record;
    },

    // Mudir sifatida biriktirilgan yotoqxonalar. Vakolat ROLGA emas,
    // biriktiruvga bog'liq - mentor/tyutor biriktiruvi bilan bir xil tamoyil.
    getMyDormitories: (userId) =>
        (getDB().dormitories || []).filter(d => d.isActive && d.responsibleUserId === userId),

    isDormResponsible: (userId) =>
        !!userId && (getDB().dormitories || []).some(d => d.isActive && d.responsibleUserId === userId),

    getDormitoryStudents: (dormitoryId, academicYear = null) => {
        const year = academicYear || getCurrentAcademicYear();
        const students = new Map(db.getMockStudents().map(s => [s.id, s]));
        return (getDB().studentHousing || [])
            .filter(h => h.academicYear === year && h.dormitoryId === dormitoryId)
            .map(h => ({ housing: h, student: students.get(h.studentId) }))
            .filter(r => r.student)
            .sort((a, b) => String(a.student.fullName).localeCompare(String(b.student.fullName)));
    },

    // KIM BAHOLAYDI. Qoida metodikadan emas, universitet qaroridan:
    //   zararli illatlardan xoli -> har doim tyutor
    //   toza-ozoda yurish        -> yotoqxonada yashasa mudiri, aks holda tyutor
    getConductAssessor: (studentId, part, academicYear = null) => {
        const year = academicYear || getCurrentAcademicYear();
        const tutorAssignment = (getDB().talentAssignments || [])
            .find(a => a.active && a.studentId === studentId && a.role === 'tutor');
        const tutor = { kind: 'tutor', label: 'Tyutor', userId: tutorAssignment?.personId || null };

        if (part !== 'tidiness') return tutor;

        const housing = db.getStudentHousing(studentId, year);
        if (housing?.housingType !== 'dormitory') return tutor;

        const dorm = (getDB().dormitories || []).find(d => d.id === housing.dormitoryId);
        return {
            kind: 'dormitory',
            label: `Yotoqxona mudiri${dorm?.name ? ` — ${dorm.name}` : ''}`,
            userId: dorm?.responsibleUserId || null,
            dormitory: dorm || null,
        };
    },

    // "Zararli illatlardan xoli" va "toza-ozoda yurish" - PREZUMPSIYA.
    // Yozuvi yo'q talaba to'liq ballga ega; jadval odatda bo'sh turadi.
    // Bekor qilingan belgi hisobga kirmaydi, lekin yozuv qoladi.
    getSportConductFlags: (studentId = null, academicYear = null, includeRemoved = false) => {
        const year = academicYear || getCurrentAcademicYear();
        return (getDB().sportConductFlags || [])
            .filter(f => f.academicYear === year
                && (!studentId || f.studentId === studentId)
                && (includeRemoved || !f.removedAt));
    },

    setSportConductFlag: async ({ studentId, part, reason, by = null, actingRole = null, academicYear = null }) => {
        await assertAuthenticated();
        if (!['no_habits', 'tidiness'].includes(part)) throw new Error("Noma'lum band");
        // Asossiz belgi qo'yilmaydi - bu ball kamaytiradi.
        if (!String(reason || '').trim()) throw new Error('Asosni yozing');

        // VAKOLAT TEKSHIRUVI: har bandning o'z baholovchisi bor. Administrator
        // istisno - u tizimning to'liq mas'uli.
        if (actingRole !== 'ADMINISTRATOR') {
            const assessor = db.getConductAssessor(studentId, part, academicYear);
            if (assessor.userId && by && assessor.userId !== by) {
                throw new Error(`Bu bandni ${assessor.label.toLowerCase()} baholaydi`);
            }
        }

        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();
        dbData.sportConductFlags = dbData.sportConductFlags || [];
        const existing = dbData.sportConductFlags.find(f =>
            f.studentId === studentId && f.academicYear === year && f.part === part);
        const record = {
            id: existing?.id || 'spcf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            studentId, academicYear: year, part,
            reason: String(reason).trim(), recordedBy: by,
            recordedAt: new Date().toISOString(),
        };

        const { error } = await supabase.from('sport_conduct_flags').upsert({
            id: record.id, student_id: studentId, academic_year: year, part,
            reason: record.reason, recorded_by: by, recorded_at: record.recordedAt,
        }, { onConflict: 'student_id,academic_year,part' });
        if (error) throw error;

        if (existing) Object.assign(existing, record);
        else dbData.sportConductFlags.push(record);
        saveDB(dbData);

        // Ball kamayadi - talaba buni bilishi kerak. 4-mezonda ham shunday.
        addNotificationToSupabase({
            userId: studentId,
            type: 'warning',
            title: 'Sog\'lom turmush tarzi bo\'yicha qayd etildi',
            message: `${INDEX_CRITERIA.SPORTS.parts.find(p => p.key === part)?.label || part}: ${record.reason}`,
        }).catch(() => {});

        return record;
    },

    // Belgi O'CHIRILMAYDI, bekor qilinadi: kim va nega olib tashlagani
    // ko'rinib turishi kerak. Iz `data` jsonb ichida - yangi ustun shart emas.
    removeSportConductFlag: async (flagId, { by = null, reason = '' } = {}) => {
        await assertAuthenticated();
        const dbData = getDB();
        const flag = (dbData.sportConductFlags || []).find(f => f.id === flagId);
        if (!flag) throw new Error('Yozuv topilmadi');

        const now = new Date().toISOString();
        const { error } = await supabase.from('sport_conduct_flags')
            .update({ data: { removedAt: now, removedBy: by, removeReason: String(reason || '').trim() } })
            .eq('id', flagId);
        if (error) throw error;

        Object.assign(flag, { removedAt: now, removedBy: by, removeReason: String(reason || '').trim() });
        saveDB(dbData);
        return flag;
    },

    // =========================================================================
    // MADANIY TASHRIFLAR (9-mezon)
    //
    // Talaba HISOBOT YOZMAYDI. Joyga borganda fotosurat oladi, joylashuvi
    // qayd etiladi - ma'lumotnoma shu qaydlardan o'zi shakllanadi.
    //
    // Ball tashriflar SONIGA emas, MUNTAZAMLIGIGA qarab beriladi, shuning
    // uchun eng muhim maydon sana.
    // =========================================================================
    isCulturalBackendReady: () => getDB().culturalBackendReady !== false,

    getCulturalPlaces: (includeInactive = false) =>
        (getDB().culturalPlaces || [])
            .filter(p => includeInactive || p.isActive)
            .sort((a, b) => String(a.name).localeCompare(String(b.name))),

    saveCulturalPlace: async ({ id = null, name, type, address = '', latitude = null, longitude = null, isActive = true, by = null }) => {
        await assertAuthenticated();
        if (!String(name || '').trim()) throw new Error('Joy nomini kiriting');
        if (!CULTURAL_PLACE_TYPES[type]) throw new Error('Joy turini tanlang');

        const dbData = getDB();
        dbData.culturalPlaces = dbData.culturalPlaces || [];
        const existing = id ? dbData.culturalPlaces.find(p => p.id === id) : null;
        const record = {
            id: existing?.id || 'cplace_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: String(name).trim(), type,
            address: String(address || '').trim(),
            latitude: latitude === '' || latitude == null ? null : Number(latitude),
            longitude: longitude === '' || longitude == null ? null : Number(longitude),
            isActive: !!isActive,
            createdBy: existing?.createdBy || by,
            createdAt: existing?.createdAt || new Date().toISOString(),
        };

        const { error } = await supabase.from('cultural_places').upsert({
            id: record.id, name: record.name, type: record.type, address: record.address,
            latitude: record.latitude, longitude: record.longitude,
            is_active: record.isActive, created_by: record.createdBy, created_at: record.createdAt,
        });
        if (error) throw error;

        if (existing) Object.assign(existing, record);
        else dbData.culturalPlaces.push(record);
        saveDB(dbData);
        return record;
    },

    getCulturalVisits: ({ studentId = null, status = null, academicYear = null } = {}) => {
        const year = academicYear || getCurrentAcademicYear();
        return (getDB().culturalVisits || [])
            .filter(v => v.academicYear === year
                && (!studentId || v.studentId === studentId)
                && (!status || v.status === status))
            .sort((a, b) => new Date(b.visitedAt) - new Date(a.visitedAt));
    },

    // Tashrif qayd etish. Fotosurat Supabase Storage ga yuklanadi -
    // fayl NOMI emas, faylning O'ZI saqlanadi, aks holda dalil tekshirilmasdi.
    recordCulturalVisit: async ({
        studentId, placeId = null, placeName, placeType,
        visitedAt = null, latitude = null, longitude = null, accuracy = null,
        photoFile = null, note = '', academicYear = null,
    }) => {
        await assertAuthenticated();
        if (!String(placeName || '').trim()) throw new Error('Joy nomini kiriting');
        if (!CULTURAL_PLACE_TYPES[placeType]) throw new Error('Joy turini tanlang');
        // Fotosuratsiz tashrif dalil emas - metodika aynan fotosuratni talab
        // qiladi, shuning uchun bu tekshiruv yumshatilmaydi.
        if (!photoFile) throw new Error('Fotosurat majburiy — joyda turib suratga oling');

        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();
        const id = 'cvisit_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const when = visitedAt || new Date().toISOString();

        // Katalogdagi joydan masofa - koordinata bo'lsa.
        const place = placeId ? (dbData.culturalPlaces || []).find(p => p.id === placeId) : null;
        const distance = place?.latitude != null && latitude != null
            ? distanceMeters(latitude, longitude, place.latitude, place.longitude)
            : null;

        const ext = (photoFile.name?.split('.').pop() || 'jpg').toLowerCase();
        const path = `${year}/${studentId}/${id}.${ext}`;
        const { error: upErr } = await supabase.storage
            .from('cultural-visits')
            .upload(path, photoFile, { contentType: photoFile.type || 'image/jpeg', upsert: false });
        if (upErr) throw new Error('Fotosurat yuklanmadi: ' + upErr.message);

        const record = {
            id, studentId, academicYear: year,
            placeId, placeName: String(placeName).trim(), placeType,
            visitedAt: when,
            latitude: latitude == null ? null : Number(latitude),
            longitude: longitude == null ? null : Number(longitude),
            accuracy: accuracy == null ? null : Number(accuracy),
            distance, photoPath: path,
            note: String(note || '').trim(),
            status: 'pending',
            reviewedBy: null, reviewedAt: null, reviewComment: '',
            createdAt: new Date().toISOString(),
        };

        const { error } = await supabase.from('cultural_visits').insert({
            id, student_id: studentId, academic_year: year,
            place_id: placeId, place_name: record.placeName, place_type: placeType,
            visited_at: when, latitude: record.latitude, longitude: record.longitude,
            accuracy_m: record.accuracy, distance_m: distance,
            photo_path: path, note: record.note, status: 'pending',
            created_at: record.createdAt,
        });
        if (error) throw error;

        (dbData.culturalVisits = dbData.culturalVisits || []).push(record);
        saveDB(dbData);
        return record;
    },

    // Fotosuratni ko'rish uchun vaqtinchalik havola. Bucket YOPIQ - fayl
    // ochiq internetda turmaydi, havola bir soatdan keyin ishlamay qoladi.
    getCulturalPhotoUrl: async (photoPath) => {
        if (!photoPath) return null;
        const { data, error } = await supabase.storage
            .from('cultural-visits')
            .createSignedUrl(photoPath, 3600);
        if (error) return null;
        return data?.signedUrl || null;
    },

    reviewCulturalVisit: async ({ visitId, action, comment = '', reviewedBy }) => {
        await assertAuthenticated();
        const status = action === 'confirm' ? 'confirmed' : 'rejected';
        if (status === 'rejected' && !String(comment || '').trim()) {
            throw new Error('Rad etish sababini yozing');
        }

        const dbData = getDB();
        const visit = (dbData.culturalVisits || []).find(v => v.id === visitId);
        if (!visit) throw new Error('Tashrif topilmadi');

        const now = new Date().toISOString();
        const { error } = await supabase.from('cultural_visits').update({
            status, reviewed_by: reviewedBy, reviewed_at: now,
            review_comment: String(comment || '').trim(),
        }).eq('id', visitId);
        if (error) throw error;

        Object.assign(visit, {
            status, reviewedBy, reviewedAt: now,
            reviewComment: String(comment || '').trim(),
        });
        saveDB(dbData);
        return visit;
    },

    // Talabaning madaniy tashriflari - MUNTAZAMLIK bilan.
    //
    // Ikki manba: talabaning o'z qaydlari (tasdiqlangan) va universitet
    // uyushtirgan ekskursiyalardagi davomat. Ikkinchisi uchun talaba qayta
    // fotosurat olmasligi kerak - u yerda davomat allaqachon dalil.
    getStudentCulturalActivity: (studentId, academicYear = null) => {
        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();

        const visits = db.getCulturalVisits({ studentId, academicYear: year })
            .filter(v => v.status === 'confirmed')
            .map(v => ({
                source: 'visit', id: v.id,
                title: v.placeName, type: v.placeType,
                date: v.visitedAt, distance: v.distance,
            }));

        // Uyushtirilgan ekskursiyalar.
        const events = new Map((dbData.events || []).map(e => [`event:${e.id}`, e]));
        (dbData.activityAttendance || []).forEach(a => {
            if (a.participantId !== studentId || a.status !== 'present') return;
            if (a.createdAt && academicYearOf(a.createdAt) !== year) return;
            const ev = events.get(`${a.activityType}:${a.activityId}`);
            if (!ev || ev.eventType !== 'excursion') return;
            visits.push({
                source: 'excursion', id: ev.id,
                title: ev.title, type: null, date: ev.date, distance: null,
            });
        });

        visits.sort((a, b) => new Date(a.date) - new Date(b.date));

        const monthKey = (d) => {
            const x = new Date(d);
            return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
        };
        const visitMonths = [...new Set(visits.map(v => monthKey(v.date)))];

        // Hisobot davrining O'TGAN oylari. Kelmagan oy uchun talabani
        // ayblab bo'lmaydi, shuning uchun ular hisobga kirmaydi.
        const [startYear] = String(year).split('-').map(Number);
        const now = new Date();
        const elapsedMonths = [];
        ACADEMIC_MONTHS.forEach(m => {
            const y = m >= 9 ? startYear : startYear + 1;
            const monthStart = new Date(y, m - 1, 1);
            if (monthStart <= now) elapsedMonths.push(`${y}-${String(m).padStart(2, '0')}`);
        });

        const frequency = culturalFrequency(visitMonths, elapsedMonths);

        return {
            visits, visitMonths, elapsedMonths, frequency,
            pending: db.getCulturalVisits({ studentId, academicYear: year })
                .filter(v => v.status === 'pending').length,
        };
    },

    // --- TASHABBUSKORLIK (11-mezon) ---
    //
    // Manba - davomat yozuvidagi `initiative` belgisi. Alohida jadval ochilmadi:
    // "kim tashkil etdi" savoli aynan davomat belgilanayotganda tug'iladi va
    // o'sha paytda javob beriladi.
    getStudentInitiatives: (studentId, academicYear = null) => {
        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();
        const events = new Map((dbData.events || []).map(e => [`event:${e.id}`, e]));
        const comps = new Map((dbData.competitions || []).map(c => [`competition:${c.id}`, c]));

        const rows = [];
        (dbData.activityAttendance || []).forEach(a => {
            if (a.participantId !== studentId || !a.initiative) return;
            if (a.createdAt && academicYearOf(a.createdAt) !== year) return;
            const key = `${a.activityType}:${a.activityId}`;
            const activity = events.get(key) || comps.get(key);
            if (!activity) return;
            rows.push({
                key, initiative: a.initiative,
                title: activity.title,
                date: activity.date || activity.startDate || null,
                markedBy: a.markedByUserId || null,
            });
        });

        rows.sort((a, b) => new Date(b.date) - new Date(a.date));
        return rows;
    },

    // --- VOLONTYORLIK VA JAMOAT ISHLARI (8-mezon) ---
    //
    // IKKI MANBA:
    //   1. Platformadagi yozuv - talaba qaysi tadbirda qaysi ROLDA bo'lgan.
    //      Bu ma'lumot allaqachon yig'ilyapti (davomat + ishtirok roli).
    //   2. Talaba yuklagan hujjat - tashqi tashkilotdagi volontyorlik.
    //      Platformada bunday faoliyat yo'q, shusiz mezonning yarmi ko'rinmasdi.
    //
    // Shkala metodikada YO'Q ("5 ballgacha" deyilgan, taqsimot berilmagan),
    // shuning uchun u sozlamada turadi va universitet qarori deb belgilanadi.
    getVolunteeringScale: () => {
        const saved = db.getIntegrationSettings('social_index').volunteeringScale || {};
        return {
            activeRolePoints: Number(saved.activeRolePoints ?? VOLUNTEERING_SCALE.activeRolePoints),
            participantPoints: Number(saved.participantPoints ?? VOLUNTEERING_SCALE.participantPoints),
            evidencePoints: Number(saved.evidencePoints ?? VOLUNTEERING_SCALE.evidencePoints),
            eventTypes: Array.isArray(saved.eventTypes) ? saved.eventTypes : VOLUNTEERING_SCALE.eventTypes,
            activeRoles: VOLUNTEERING_SCALE.activeRoles,
        };
    },

    setVolunteeringScale: async (patch) => {
        const next = { ...db.getVolunteeringScale(), ...patch };
        await db.saveIntegrationSettings('social_index', { volunteeringScale: next });
        return next;
    },

    getStudentVolunteeringActivity: (studentId, academicYear = null) => {
        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();
        const scale = db.getVolunteeringScale();

        const events = new Map((dbData.events || []).map(e => [`event:${e.id}`, e]));
        const comps = new Map((dbData.competitions || []).map(c => [`competition:${c.id}`, c]));
        const clubs = new Map((dbData.clubs || []).map(c => [c.id, c]));

        const rows = [];
        (dbData.activityAttendance || []).forEach(a => {
            if (a.participantId !== studentId || a.status !== 'present') return;
            if (a.createdAt && academicYearOf(a.createdAt) !== year) return;

            const key = `${a.activityType}:${a.activityId}`;
            const activity = events.get(key) || comps.get(key);
            if (!activity) return;

            const role = a.role || 'participant';
            const isActiveRole = scale.activeRoles.includes(role);
            const typeMatches = scale.eventTypes.includes(activity.eventType);
            // Rol volontyor/tashkilotchi bo'lsa tadbir turi ahamiyatsiz -
            // talaba baribir jamoat ishini bajargan.
            if (!isActiveRole && !typeMatches) return;

            rows.push({
                key,
                title: activity.title,
                date: activity.date,
                eventType: activity.eventType || null,
                role,
                isActiveRole,
                clubId: activity.clubId || null,
                clubName: activity.clubId ? (clubs.get(activity.clubId)?.name || null) : null,
                points: isActiveRole ? scale.activeRolePoints : scale.participantPoints,
            });
        });

        // Talabaning tashqi hujjatlari - faqat QABUL QILINGANLARI.
        const evidence = db.getIndexEvidence(studentId, 'VOLUNTEERING', year)
            .filter(e => e.status === 'accepted');

        rows.sort((a, b) => new Date(b.date) - new Date(a.date));

        // MA'LUMOTNOMA metodikaning tilida gapiradi: "3 ta ma'naviy-ma'rifiy
        // tadbirda, 2 ta umumxalq hasharida volontyor sifatida" - "3 ta
        // seminar, 2 ta hashar" emas. Shuning uchun tadbir turlari hujjatning
        // beshta bandiga guruhlanadi.
        const byCategory = VOLUNTEERING_CATEGORIES.map(cat => {
            const items = rows.filter(r => volunteeringCategoryOf(r.eventType).key === cat.key);
            if (items.length === 0) return null;
            return {
                key: cat.key,
                label: cat.label,
                total: items.length,
                active: items.filter(r => r.isActiveRole).length,
                points: items.reduce((s, r) => s + r.points, 0),
                items,
            };
        }).filter(Boolean);

        const platformPoints = rows.reduce((s, r) => s + r.points, 0);
        const evidenceTotal = evidence.length * scale.evidencePoints;
        const max = INDEX_CRITERIA.VOLUNTEERING.maxPoints;

        return {
            rows, evidence, scale, byCategory,
            // Ma'lumotnomaning matni - hujjatga o'sha holicha ko'chiriladi.
            statementText: byCategory.length === 0 ? null : byCategory
                .map(c => `${c.total} ta ${c.label.toLowerCase()}da`
                    + (c.active > 0 ? ` (${c.active} tasida volontyor/tashkilotchi sifatida)` : ''))
                .join(', ') + ' ishtirok etgan',
            activeCount: rows.filter(r => r.isActiveRole).length,
            participantCount: rows.filter(r => !r.isActiveRole).length,
            platformPoints, evidencePoints: evidenceTotal,
            // Ship ikki qatlamda: bu yerda ham, mezon hisobida ham.
            proposedPoints: Math.min(max, platformPoints + evidenceTotal),
            maxPoints: max,
            // Klub tadbirlari 2-mezonda ham hisobga olinadi. Buni yashirmaslik
            // kerak - "bir ish uchun ikki ball" degan e'tirozga javob shu.
            clubOverlap: rows.filter(r => r.clubId).length,
        };
    },

    // --- TO'GARAKLAR (2-mezon) ---
    //
    // Metodikaning 5 yo'nalishi platformadagi 8 yo'nalish bilan USTMA-UST
    // TUSHMAYDI: "Kitobxonlik va adabiyot" platformada "Madaniyat va san'at"
    // ichiga qo'shib yuborilgan, "Bandlik" esa umuman yo'q. Shuning uchun
    // avtomatik o'girish taxminga aylanardi.
    //
    // Har klubga ALOHIDA maydon berildi. Platformadagi 8 yo'nalish o'z joyida
    // qoladi - u katalog va filtrlash uchun; bu esa faqat metodika hisobi uchun.
    //
    // Yangi ustun OCHILMADI: moslik `integration_settings` da saqlanadi, ya'ni
    // SQL ishga tushirish shart emas va sozlama butun universitet uchun umumiy.
    getClubDirections: () => db.getIntegrationSettings('social_index').clubDirections || {},

    getClubDirection: (clubId) => db.getClubDirections()[clubId] || null,

    setClubDirection: async (clubId, direction) => {
        if (direction && !CLUB_DIRECTION_KEYS.includes(direction)) {
            throw new Error("Noma'lum yo'nalish: " + direction);
        }
        const current = db.getClubDirections();
        const next = { ...current };
        if (direction) next[clubId] = direction;
        else delete next[clubId];
        await db.saveIntegrationSettings('social_index', { clubDirections: next });
        return next;
    },

    getMinClubEvents: () =>
        Number(db.getIntegrationSettings('social_index').minClubEvents)
        || CLUB_ACTIVITY.defaultMinClubEvents,

    setMinClubEvents: async (value) => {
        const n = Math.max(1, Number(value) || CLUB_ACTIVITY.defaultMinClubEvents);
        await db.saveIntegrationSettings('social_index', { minClubEvents: n });
        return n;
    },

    // Talabaning KLUB KESIMIDAGI ishtirok foizi.
    //
    // Maxraj - klubning o'sha o'quv yilida DAVOMATI BELGILANGAN tadbirlari.
    // Davomati umuman belgilanmagan tadbir maxrajga kirmaydi: aks holda
    // koordinatorning davomat qo'ymagani talabaning ballini pasaytirardi, ya'ni
    // talaba boshqa odamning ishi uchun jazolanardi.
    //
    // Manba - HAQIQIY DAVOMAT, a'zolik emas. Sabab: klublarning ko'pi
    // (Munozara, Zakovat, Moot Court kabi musobaqa-markazli klublar) talabalar
    // bilan asosan MUSOBAQAGA RO'YXATDAN O'TISH orqali ishlaydi va `memberships`
    // jadvali ular uchun deyarli to'ldirilmagan.
    getStudentClubDirectionActivity: (studentId, academicYear = null) => {
        const dbData = getDB();
        const year = academicYear || getCurrentAcademicYear();
        const directions = db.getClubDirections();
        const minEvents = db.getMinClubEvents();

        // Faoliyat -> klub. Tadbirda `clubId`, musobaqada esa klub konteksti.
        const clubOfActivity = new Map();
        (dbData.events || []).forEach(e => { if (e.clubId) clubOfActivity.set(`event:${e.id}`, e.clubId); });
        (dbData.competitions || []).forEach(c => {
            if (c.contextType === 'club' && c.contextId) clubOfActivity.set(`competition:${c.id}`, c.contextId);
        });

        // 1-qadam: har klub o'quv yilida nechta tadbirda davomat belgilagan.
        const clubEvents = new Map();      // clubId -> Set(activityKey)
        const studentPresent = new Map();  // clubId -> Set(activityKey)

        (dbData.activityAttendance || []).forEach(a => {
            if (a.createdAt && academicYearOf(a.createdAt) !== year) return;
            const key = `${a.activityType}:${a.activityId}`;
            const clubId = clubOfActivity.get(key);
            if (!clubId || !directions[clubId]) return;

            if (!clubEvents.has(clubId)) clubEvents.set(clubId, new Set());
            clubEvents.get(clubId).add(key);

            if (a.participantId === studentId && a.status === 'present') {
                if (!studentPresent.has(clubId)) studentPresent.set(clubId, new Set());
                studentPresent.get(clubId).add(key);
            }
        });

        // 2-qadam: klub bo'yicha foiz.
        const clubs = new Map((dbData.clubs || []).map(c => [c.id, c]));
        const perClub = [];
        studentPresent.forEach((attendedSet, clubId) => {
            const held = clubEvents.get(clubId)?.size || 0;
            const attended = attendedSet.size;
            perClub.push({
                clubId,
                clubName: clubs.get(clubId)?.name || clubId,
                direction: directions[clubId],
                held,
                attended,
                percent: held > 0 ? Math.round((attended / held) * 100) : 0,
                // Klub kam tadbir o'tkazgan bo'lsa foiz ishonchsiz - bitta
                // uchrashuv o'tkazib hammaga 10 ball berib bo'lmaydi.
                enoughEvents: held >= minEvents,
            });
        });

        // 3-qadam: yo'nalish bo'yicha ENG YUQORI foizli klub.
        // Metodikada birlik - "har bir to'garak", shuning uchun bir klubdagi
        // to'liq faollik boshqasidagi sustlik bilan o'rtachalanmaydi.
        const byDirection = {};
        perClub.forEach(c => {
            if (!c.enoughEvents) return;
            const best = byDirection[c.direction];
            if (!best || c.percent > best.percent) byDirection[c.direction] = c;
        });

        return { perClub, byDirection, minEvents };
    },

    // Talaba biror klubning ASOSIY KOORDINATORImi?
    //
    // Metodikadagi 20 ballik band "to'garak tashkil etganligi VA samarali
    // faoliyati yo'lga qo'yilganligi" deydi. Universitet qaroriga ko'ra bu
    // band asosiy koordinatorga qo'llanadi - u klubni amalda yuritadi.
    getStudentHeadCoordinatorClubs: (studentId) => {
        const dbData = getDB();
        const fromAssignments = (dbData.clubPositionAssignments || [])
            .filter(a => a.studentId === studentId && a.status === 'active' && a.positionTitle === 'head_coordinator')
            .map(a => a.clubId);
        const fromMemberships = (dbData.memberships || [])
            .filter(m => m.userId === studentId && m.role === 'head_coordinator')
            .map(m => m.clubId);
        const ids = [...new Set([...fromAssignments, ...fromMemberships])];
        return ids
            .map(id => (dbData.clubs || []).find(c => c.id === id))
            .filter(Boolean);
    },

    // --- KITOBXONLIK TESTLARI (1-mezon) ---
    //
    // Metodika: 100 ta eng sara badiiy adabiyot ro'yxati platformaga
    // joylashtiriladi va HAR ASAR bo'yicha test tuziladi.
    //
    // Test bo'limi bunga BO'YSUNMAYDI: u yerda huquq, matematika, IT va boshqa
    // fanlardan ham testlar bor va ular indeksga umuman kirmaydi. Faqat
    // `isReadingTest` belgisi qo'yilgan va aniq asarga biriktirilgan testlar
    // kitobxonlik mezoniga hisoblanadi.
    //
    // Alohida jadval OCHILMADI: asar nomi testning o'z `data` jsonb'ida
    // saqlanadi. Sabab - "kitob" va "shu kitob bo'yicha test" metodikada
    // ajralmas, ikkitasini ikki joyda saqlash ularni bir-biridan uzoqlashtirardi.
    // `language` berilsa - faqat o'sha potokning asarlari. Tili belgilanmagan
    // asar HAR IKKALA potokda ko'rinadi: eski yozuvlar shu tufayli yo'qolib
    // qolmaydi va ro'yxatga til qo'shish bosqichma-bosqich bo'lishi mumkin.
    getReadingTests: (language = null) => (getDB().tests || [])
        .filter(t => t.isReadingTest && t.readingBook?.title)
        .filter(t => !language || !t.readingBook.language || t.readingBook.language === language),

    // Talabaning potoki - pasportdagi "Ta'lim tili" maydonidan. Belgilanmagan
    // bo'lsa `null` qaytadi va ro'yxat filtrlanmaydi.
    getStudentTeachingLanguage: (studentId) => {
        const passport = db.getStudentPassportRaw(studentId);
        return normalizeTeachingLanguage(passport?.sections?.education?.language);
    },

    // Asar qo'shilganda unga o'z SAVOLLAR BAZASI ham yaratiladi.
    //
    // Platformada savollar testga emas, bazaga tegishli (`question_bases`),
    // test esa bazadan oladi. Kitobxonlikda bu tabiiy: bir asar = bir baza.
    // Ikkisini alohida yaratishga majburlash "asar qo'shdim, lekin savol
    // qo'sholmayapman" degan holatga olib kelardi.
    // `existingBaseId` berilsa yangi baza ochilmaydi - testlar bo'limida
    // allaqachon tuzilgan savollar bazasi ishlatiladi. Ikki yo'l ham ochiq:
    // asarni noldan qo'shish yoki tayyor bazaga biriktirish.
    createReadingTest: async ({ title, author, language = null, passPercent = READING_POLICY.defaultPassPercent, existingBaseId = null, opensAt = null, closesAt = null }) => {
        await assertAuthenticated();
        if (!String(title || '').trim()) throw new Error('Asar nomini kiriting');
        if (language && !TEACHING_LANGUAGE_ORDER.includes(language)) {
            throw new Error("Noma'lum ta'lim tili");
        }

        const bookTitle = String(title).trim();
        // Takrorlanish TIL kesimida tekshiriladi: bir asar o'zbek va rus
        // potokda alohida ro'yxatda bo'lishi mumkin va bu takror emas.
        const duplicate = db.getReadingTests().find(t =>
            String(t.readingBook.title).trim().toLowerCase() === bookTitle.toLowerCase()
            && (t.readingBook.language || null) === (language || null));
        if (duplicate) throw new Error(`"${bookTitle}" uchun test allaqachon mavjud`);

        const base = existingBaseId
            ? { id: existingBaseId }
            : await db.createQuestionBase({ title: `Kitobxonlik: ${bookTitle}` });

        return db.createTest({
            title: bookTitle,
            subject: 'Kitobxonlik',
            status: 'draft',
            isPublished: false,
            opensAt, closesAt,
            isReadingTest: true,
            readingBook: {
                title: bookTitle,
                author: String(author || '').trim() || null,
                language: language || null,
            },
            baseId: base.id,
            passPercent: Number(passPercent) || READING_POLICY.defaultPassPercent,
        });
    },

    // ----------------------------------------------------------------------
    // KITOBXONLIK: TALABA KESIMI
    //
    // MUAMMO: 12 ta asardan test topshirgan talabaning natijasini ko'rish
    // uchun 12 ta asarni birma-bir ochib chiqish kerak edi. Ro'yxat ASAR
    // kesimida qurilgan, savol esa TALABA haqida.
    //
    // Bu ikki funksiya ro'yxatni teskari o'giradi: kim nechta asar
    // o'qigani va uning har asardagi natijasi.
    // ----------------------------------------------------------------------
    getReadingProgressByStudent: () => {
        const dbData = getDB();
        const readingTests = (dbData.tests || []).filter(t => t.isReadingTest && t.readingBook?.title);
        const testById = new Map(readingTests.map(t => [t.id, t]));
        const students = new Map(generateMockStudents().map(s => [s.id, s]));

        const byStudent = new Map();
        (dbData.testAttempts || []).forEach(a => {
            const test = testById.get(a.testId);
            if (!test || !a.finishedAt) return;
            if (!byStudent.has(a.studentId)) {
                byStudent.set(a.studentId, { attempts: [], passedTests: new Set(), testIds: new Set() });
            }
            const row = byStudent.get(a.studentId);
            row.attempts.push(a);
            row.testIds.add(a.testId);
            // O'tganlik TEST bo'yicha sanaladi, urinish bo'yicha emas: bir
            // asarni ikki marta o'tgan talaba ikkita kitob o'qigan bo'lmaydi.
            const max = Number(a.maxScore) || 0;
            const percent = max > 0 ? (Number(a.score) / max) * 100 : 0;
            if (percent >= (test.passPercent || READING_POLICY.defaultPassPercent)) {
                row.passedTests.add(a.testId);
            }
        });

        return Array.from(byStudent.entries())
            .map(([studentId, row]) => {
                const student = students.get(studentId) || null;
                // Talabaning POTOKIDAGI asarlar soni - maxraj shundan.
                const language = db.getStudentTeachingLanguage(studentId);
                const available = readingTests.filter(t =>
                    !language || !t.readingBook.language || t.readingBook.language === language).length;
                const passed = row.passedTests.size;
                return {
                    studentId, student, language,
                    availableBooks: available,
                    attemptedBooks: row.testIds.size,
                    passedBooks: passed,
                    attempts: row.attempts.length,
                    points: booksToPoints(passed) ?? 0,
                    lastAt: row.attempts.reduce(
                        (latest, a) => (!latest || new Date(a.finishedAt) > new Date(latest) ? a.finishedAt : latest),
                        null
                    ),
                };
            })
            .sort((a, b) => b.passedBooks - a.passedBooks
                || String(a.student?.fullName || '').localeCompare(String(b.student?.fullName || '')));
    },

    // Bitta talabaning HAR ASAR bo'yicha natijasi - bitta ro'yxatda.
    getStudentReadingDetail: (studentId) => {
        const dbData = getDB();
        const language = db.getStudentTeachingLanguage(studentId);
        const readingTests = (dbData.tests || [])
            .filter(t => t.isReadingTest && t.readingBook?.title)
            .filter(t => !language || !t.readingBook.language || t.readingBook.language === language);

        return readingTests.map(t => {
            const attempts = (dbData.testAttempts || [])
                .filter(a => a.testId === t.id && a.studentId === studentId && a.finishedAt)
                .sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt));
            const best = attempts.reduce((b, a) => {
                const pa = (Number(a.maxScore) || 0) > 0 ? Number(a.score) / Number(a.maxScore) : 0;
                const pb = b && (Number(b.maxScore) || 0) > 0 ? Number(b.score) / Number(b.maxScore) : -1;
                return pa > pb ? a : b;
            }, null);
            const passPercent = t.passPercent || READING_POLICY.defaultPassPercent;
            const percent = best && Number(best.maxScore) > 0
                ? Math.round((Number(best.score) / Number(best.maxScore)) * 100)
                : null;
            return {
                test: t,
                title: t.readingBook.title,
                author: t.readingBook.author || null,
                bookLanguage: t.readingBook.language || null,
                published: !!t.isPublished,
                attempts: attempts.length,
                bestAttemptId: best?.id || null,
                // Urinilmagan asarda foiz YO'Q - nol emas.
                percent,
                passPercent,
                passed: percent != null && percent >= passPercent,
                lastAt: attempts[0]?.finishedAt || null,
            };
        }).sort((a, b) => Number(b.passed) - Number(a.passed)
            || String(a.title).localeCompare(String(b.title)));
    },

    // Asarning savollari - ADMIN ro'yxati uchun (aralashtirilmagan, to'liq).
    //
    // Asar testi ikki xil sozlangan bo'lishi mumkin: qo'lda savol qo'shilsa
    // `baseId` orqali, testlar bo'limidagi to'liq oqim orqali sozlansa
    // `blocks` orqali. Ikkalasi ham qo'llab-quvvatlanadi.
    getReadingTestQuestions: (testId) => {
        const dbData = getDB();
        const test = (dbData.tests || []).find(t => t.id === testId);
        if (!test) return [];
        if (Array.isArray(test.blocks) && test.blocks.length > 0) {
            const ids = new Set(test.blocks.map(b => b.baseId).filter(Boolean));
            return (dbData.testQuestions || []).filter(q => ids.has(q.baseId));
        }
        return test.baseId ? db.getTestQuestions(test.baseId) : [];
    },

    addReadingQuestion: async (testId, { text, options, correctIndex, explanation = '' }) => {
        await assertAuthenticated();
        const test = (getDB().tests || []).find(t => t.id === testId);
        if (!test?.baseId) throw new Error('Bu asarning savollar bazasi topilmadi');
        if (!String(text || '').trim()) throw new Error('Savol matnini kiriting');

        const clean = (options || []).map(o => String(o || '').trim()).filter(Boolean);
        if (clean.length < 2) throw new Error('Kamida 2 ta javob varianti kerak');
        if (correctIndex == null || correctIndex < 0 || correctIndex >= clean.length) {
            throw new Error("To'g'ri javobni belgilang");
        }

        return db.createTestQuestion({
            baseId: test.baseId, subject: 'Kitobxonlik', difficulty: 'medium',
            text: String(text).trim(), options: clean, correctIndex: Number(correctIndex), explanation,
        });
    },

    // --- Kutubxona seansi ---
    //
    // "Faqat kutubxonada" rejimi yoqilganda talaba testni o'zi ocha olmaydi:
    // u kutubxonaga keladi, xodim uning uchun seans ochadi. Seans muddatli va
    // BIR MARTALIK - ishlatilgach yopiladi, aks holda bitta ochilgan seans
    // bilan uydan ham topshirib ketish mumkin bo'lardi.
    isReadingLibraryOnly: () =>
        !!(getDB().integrationSettings?.reading?.libraryOnly ?? READING_POLICY.libraryOnlyDefault),

    // Sozlama BAZAGA yoziladi - u butun universitet uchun umumiy qoida, bitta
    // kompyuterning localStorage'ida qolib ketmasligi kerak.
    setReadingLibraryOnly: async (value) => {
        await db.saveIntegrationSettings('reading', { libraryOnly: !!value });
        return !!value;
    },

    openReadingSession: async ({ studentId, testId, openedBy }) => {
        await assertAuthenticated();
        const dbData = getDB();
        dbData.readingSessions = dbData.readingSessions || [];
        const now = Date.now();
        const record = {
            id: 'rsess_' + now.toString(36) + Math.random().toString(36).slice(2, 6),
            studentId, testId, openedBy,
            openedAt: new Date(now).toISOString(),
            expiresAt: new Date(now + READING_POLICY.sessionMinutes * 60000).toISOString(),
            usedAt: null,
        };
        dbData.readingSessions.push(record);
        await persistRecordRow('reading_sessions', record, { student_id: studentId, test_id: testId });
        saveDB(dbData);
        return record;
    },

    getOpenReadingSession: (studentId, testId) => {
        const now = Date.now();
        return (getDB().readingSessions || []).find(s =>
            s.studentId === studentId && s.testId === testId
            && !s.usedAt && new Date(s.expiresAt).getTime() > now) || null;
    },

    // Talaba shu asar testini topshira oladimi? Sabab MATN sifatida qaytadi -
    // "tugma o'chirilgan, nega ekani noma'lum" holati bo'lmasin.
    // UMUMIY test tekshiruvi - fan testlari uchun.
    //
    // Kitobxonlik testidan farqi ikkita: bu yerda "bir marta" qoidasi yo'q
    // (testning o'zida `maxAttempts` belgilanmasa cheklovsiz) va kutubxona
    // seansi talab qilinmaydi. Qolgan hammasi bir xil - shu sabab ikkala
    // modul BITTA imtihon dvigatelidan foydalanadi.
    canTakeTest: (studentId, testId) => {
        const test = (getDB().tests || []).find(t => t.id === testId);
        if (!test) return { allowed: false, reason: 'Test topilmadi' };
        if (!test.isPublished) return { allowed: false, reason: "Test hali e'lon qilinmagan" };

        const now = new Date();
        if (test.opensAt && new Date(test.opensAt) > now) {
            return { allowed: false, reason: 'Test hali ochilmagan' };
        }
        if (test.closesAt && new Date(test.closesAt) < now) {
            return { allowed: false, reason: 'Test muddati tugagan' };
        }

        const questions = db.resolveTestQuestions(testId);
        if (questions.length === 0) {
            return { allowed: false, reason: 'Bu testga hali savol kiritilmagan' };
        }

        const attempts = (getDB().testAttempts || []).filter(a =>
            a.studentId === studentId && a.testId === testId && a.finishedAt);
        const max = Number(test.maxAttempts) || 0;
        if (max > 0 && attempts.length >= max) {
            return {
                allowed: false, alreadyTaken: true,
                reason: `Bu testni ${max} marta topshirish mumkin edi`,
            };
        }

        return { allowed: true, reason: null, questions };
    },

    submitTest: async ({ testId, studentId, answers, questionSeconds = null }) => {
        const check = db.canTakeTest(studentId, testId);
        if (!check.allowed) throw new Error(check.reason);
        return db.submitTestAttempt({ testId, studentId, answers, questionSeconds });
    },

    canTakeReadingTest: (studentId, testId) => {
        const test = (getDB().tests || []).find(t => t.id === testId);
        if (!test) return { allowed: false, reason: 'Test topilmadi' };
        if (!test.isPublished) return { allowed: false, reason: "Test hali e'lon qilinmagan" };

        // Topshirish uchun savollar UMUMIY resolver orqali olinadi - to'liq
        // oqimda belgilangan savollar soni va aralashtirish shu yerda qo'llanadi.
        const questions = db.resolveTestQuestions(testId);
        if (questions.length === 0) return { allowed: false, reason: 'Bu asarga hali savol kiritilmagan' };

        const attempts = (getDB().testAttempts || []).filter(a =>
            a.studentId === studentId && a.testId === testId && a.finishedAt);
        if (attempts.length >= READING_POLICY.maxAttemptsPerBook) {
            return {
                allowed: false, alreadyTaken: true,
                reason: `Bu asar bo'yicha test bir marta topshiriladi (siz allaqachon topshirgansiz)`,
            };
        }

        if (db.isReadingLibraryOnly() && !db.getOpenReadingSession(studentId, testId)) {
            return {
                allowed: false, needsSession: true,
                reason: 'Bu test kutubxonada topshiriladi — xodim seans ochishi kerak',
            };
        }

        return { allowed: true, reason: null, questions };
    },

    // --- TEST SOATI ---
    //
    // Test boshlangan vaqt saqlanadi, shunda sahifa yangilansa ham qolgan vaqt
    // to'g'ri hisoblanadi. Busiz talaba sahifani yangilab vaqtni noldan
    // boshlab olardi.
    //
    // Bu mutlaq himoya EMAS: brauzer xotirasini tozalagan talaba soatni
    // nolga qaytara oladi. To'liq himoya uchun boshlanish vaqti serverda
    // yozilishi kerak. Hozircha bu ochiq soddalashtirish - "faqat kutubxonada"
    // rejimi bilan birga u yetarli darajada nazorat beradi.
    // Boshlangan, lekin yakunlanmagan urinish - `finished_at` bo'sh qator.
    //
    // Alohida jadval OCHILMADI: "testni boshladi" degan fakt urinishning o'zi.
    // Uni boshqa joyda saqlash ikkita haqiqat manbaini yaratardi.
    getOpenAttempt: (studentId, testId) =>
        (getDB().testAttempts || []).find(a =>
            a.studentId === studentId && a.testId === testId && !a.finishedAt) || null,

    // Soat SERVERDA boshlanadi - shunda boshqa kompyuterdan kirilganda ham
    // o'sha vaqt ko'rinadi. Server javob bermasa mahalliy nusxaga tushadi:
    // test boshlanishi hech qanday holatda to'xtab qolmasligi kerak.
    startTestClock: async (studentId, testId) => {
        const existing = db.getOpenAttempt(studentId, testId);
        if (existing) return existing.startedAt;

        const startedAt = new Date().toISOString();
        const id = 'att_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const record = {
            id, testId, studentId, score: 0, maxScore: 0, correct: 0, total: 0,
            finishedAt: null, startedAt, answers: {},
            academicYear: getCurrentAcademicYear(),
        };

        try {
            const { error } = await supabase.from('test_attempts').insert({
                id, test_id: testId, student_id: studentId,
                score: 0, max_score: 0, correct: 0, total: 0,
                finished_at: null,
                data: { startedAt, answers: {}, academicYear: record.academicYear },
            });
            if (error) throw error;
        } catch (e) {
            // Odatda `finished_at` ustuni NOT NULL bo'lgan holat. Bunda soat
            // faqat shu brauzerda ishlaydi - ochiq cheklov, yashirilmaydi.
            console.warn('[test] soat serverga yozilmadi, mahalliy rejim:', e.message);
        }

        const dbData = getDB();
        (dbData.testAttempts = dbData.testAttempts || []).push(record);
        saveDB(dbData);
        return startedAt;
    },

    getTestClock: (studentId, testId) =>
        db.getOpenAttempt(studentId, testId)?.startedAt || null,

    // ASYNC: urinishlar `test_attempts` jadvalida turadi, ya'ni faqat
    // mahalliy o'chirish keyingi sinxronlashda qaytib kelardi va soat
    // aslida hech qachon tozalanmasdi.
    clearTestClock: async (studentId, testId) => {
        const dbData = getDB();
        const open = (dbData.testAttempts || []).filter(a =>
            a.studentId === studentId && a.testId === testId && !a.finishedAt);
        if (open.length === 0) return;
        const { error } = await supabase.from('test_attempts')
            .delete().in('id', open.map(a => a.id));
        if (error) throw new Error("Test soati tozalanmadi: " + (error.message || ''));
        dbData.testAttempts = (dbData.testAttempts || []).filter(a =>
            !(a.studentId === studentId && a.testId === testId && !a.finishedAt));
        saveDB(dbData);
    },

    // Talabaning TUGALLANMAGAN testi (agar bo'lsa).
    //
    // Bu holat oldindan tekshirilmasa jiddiy adolatsizlik kelib chiqadi:
    // talaba A testini boshlab, tugatmasdan B ni ochsa, A ning soati fonda
    // yurib turaveradi. Qaytib kelganda vaqt tugagan bo'ladi va test
    // savollarni ko'rmasdan turib 0% bilan yakunlanadi - bu esa uning
    // YAGONA urinishi edi.
    getUnfinishedTest: (studentId) => {
        const dbData = getDB();
        const clocks = dbData.testClocks || {};
        for (const key of Object.keys(clocks)) {
            const [owner, testId] = key.split('::');
            if (owner !== studentId) continue;

            const finished = (dbData.testAttempts || []).some(a =>
                a.studentId === studentId && a.testId === testId && a.finishedAt);
            if (finished) continue;

            const test = (dbData.tests || []).find(t => t.id === testId);
            if (!test) continue;

            return {
                testId,
                test,
                startedAt: clocks[key],
                secondsLeft: db.getTestSecondsLeft(studentId, testId),
            };
        }
        return null;
    },

    // Boshlangan testning javoblari OCHIQ URINISH ichida saqlanadi.
    //
    // Serverga yozish "olovga otish" tarzida: javob kutilmaydi va xatolik
    // interfeysni to'xtatmaydi. Har belgilangan javobda kutib turish testni
    // sekinlashtirardi; mahalliy nusxa esa baribir darhol yangilanadi.
    saveTestDraft: (studentId, testId, answers) => {
        const dbData = getDB();
        const open = (dbData.testAttempts || []).find(a =>
            a.studentId === studentId && a.testId === testId && !a.finishedAt);
        if (!open) return;

        open.answers = answers;
        saveDB(dbData);

        supabase.from('test_attempts')
            .update({ data: { startedAt: open.startedAt, answers, academicYear: open.academicYear } })
            .eq('id', open.id)
            .then(({ error }) => { if (error) console.warn('[test] javoblar saqlanmadi:', error.message); });
    },

    getTestDraft: (studentId, testId) =>
        db.getOpenAttempt(studentId, testId)?.answers || {},

    clearTestDraft: () => { /* ochiq urinish yopilganda javoblar u bilan qoladi */ },

    // Qolgan vaqt (soniyada). Vaqt chegarasi belgilanmagan bo'lsa `null`.
    getTestSecondsLeft: (studentId, testId) => {
        const test = (getDB().tests || []).find(t => t.id === testId);
        const minutes = Number(test?.timeLimit) || 0;
        if (minutes <= 0) return null;
        const startedAt = db.getTestClock(studentId, testId);
        if (!startedAt) return minutes * 60;
        const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
        return Math.max(0, minutes * 60 - elapsed);
    },

    // Kitobxonlik testini topshirish. Oddiy `submitTestAttempt` dan farqi -
    // yuqoridagi shartlar TEKSHIRILADI va seans yopiladi.
    submitReadingTest: async ({ testId, studentId, answers, questionSeconds = null }) => {
        const check = db.canTakeReadingTest(studentId, testId);
        if (!check.allowed) throw new Error(check.reason);

        const attempt = await db.submitTestAttempt({ testId, studentId, answers, questionSeconds });

        const dbData = getDB();
        const session = (dbData.readingSessions || []).find(s =>
            s.studentId === studentId && s.testId === testId && !s.usedAt);
        if (session) {
            session.usedAt = new Date().toISOString();
            // Seans ISHLATILGANI ham bazaga: aks holda bitta seans bilan
            // boshqa kompyuterda ikkinchi marta testga kirish mumkin edi.
            await persistRecordRow('reading_sessions', session, { student_id: studentId, test_id: testId });
            saveDB(dbData);
        }
        return attempt;
    },

    // Ro'yxatni jadvaldan import qilish. Har qator - bitta asar.
    // Savollar bu bosqichda kiritilmaydi: asar va uning savollari alohida
    // ishlar, ularni bitta faylga tiqish faylni ham, xatolikni ham chalkash
    // qiladi.
    importReadingList: async (rows, { passPercent = READING_POLICY.defaultPassPercent } = {}) => {
        await assertAuthenticated();
        const results = { added: 0, skipped: 0, errors: [] };
        for (const row of rows) {
            const title = String(row.title || row.nomi || row.asar || '').trim();
            if (!title) { results.skipped++; continue; }
            const author = String(row.author || row.muallif || '').trim();
            try {
                await db.createReadingTest({ title, author, passPercent });
                results.added++;
            } catch (e) {
                // Takrorlangan asar xato emas - o'tkazib yuboriladi.
                if (String(e.message).includes('allaqachon mavjud')) results.skipped++;
                else results.errors.push(`${title}: ${e.message}`);
            }
        }
        return results;
    },

    // Ro'yxatning to'ldirilganligi - metodikada 100 ta asar ko'zda tutilgan.
    getReadingListProgress: () => {
        const tests = db.getReadingTests();
        return {
            total: tests.length,
            published: tests.filter(t => t.isPublished).length,
            target: 100,
        };
    },

    // =========================================================================
    // TADBIR HAYOT YO'LI
    //
    // Uch narsani hal qiladi:
    //   1. Davomatdan AVTOMATIK ball - ariza va tasdiqlashsiz
    //   2. Vazifalar taqsimoti - kim nima qilishi
    //   3. Avtomatik hisobot - raqamlar bazadan, qo'lda faqat matn
    //
    // Mavjud hech narsa o'zgarmaydi: yaratish qadamlari, baholash me'zonlari,
    // bosqichlar - hammasi joyida. Bu blok ularning USTIGA qo'shiladi.
    // =========================================================================

    isLifecycleBackendReady: () => getDB().lifecycleBackendReady !== false,

    // Tadbir/musobaqaning qo'shimcha maydonlari (turi, darajasi, ball sozlamasi).
    // Tadbirda `events.data` jsonb ichida, musobaqada `competitions.data` ichida.
    getActivityMeta: (activityId, activityType) => {
        const dbData = getDB();
        const a = activityType === 'competition'
            ? (dbData.competitions || []).find(c => c.id === activityId)
            : (dbData.events || []).find(e => e.id === activityId);
        if (!a) return {};
        return {
            eventType: a.eventType || null,
            // ATAYLAB null qaytadi, 'university' emas: "belgilanmagan" bilan
            // "universitet darajasi deb belgilangan" bir xil narsa emas.
            // Ball hisobida getLevel() o'zi universitetga qaytadi (koeffitsient 1).
            level: a.level || null,
            pointOverrides: a.pointOverrides || {},
            pointsAwardedAt: a.pointsAwardedAt || null,
            announcedAt: a.announcedAt || null,
        };
    },

    setActivityMeta: async (activityId, activityType, patch) => {
        await assertAuthenticated();
        if (activityType === 'competition') {
            return db.updateCompetition(activityId, patch);
        }
        return db.updateEvent(activityId, patch);
    },

    // --- 1. AVTOMATIK BALL ---
    //
    // Bugungacha: davomat bazada -> talaba ariza yozadi -> admin tasdiqlaydi -> ball
    // Endi:       davomat bazada -> ball
    //
    // IDEMPOTENT: `pointsAwardedAt` belgilangan bo'lsa qayta yozilmaydi. Bu muhim -
    // aks holda "Yakunlash" ikki marta bosilsa ball ikki marta qo'shilardi.
    previewActivityPoints: (activityId, activityType) => {
        const dbData = getDB();
        const meta = db.getActivityMeta(activityId, activityType);
        const students = new Map(generateMockStudents().map(s => [s.id, s]));

        const present = (dbData.activityAttendance || []).filter(a =>
            a.activityId === activityId && a.activityType === activityType && a.status === 'present');

        // Bir talaba bir necha bosqichda (raund, match) belgilangan bo'lishi mumkin -
        // ball BIR MARTA beriladi, eng yuqori roli bo'yicha.
        const byParticipant = new Map();
        present.forEach(a => {
            const role = a.role || 'participant';
            const current = byParticipant.get(a.participantId);
            const rank = (r) => LIFECYCLE_ROLE_RANK[r] ?? 1;
            if (!current || rank(role) > rank(current.role)) {
                byParticipant.set(a.participantId, { participantId: a.participantId, role });
            }
        });

        return Array.from(byParticipant.values()).map(r => ({
            ...r,
            studentName: students.get(r.participantId)?.fullName || r.participantId,
            points: computeLifecyclePoints(r.role, meta.level, meta.pointOverrides),
        }));
    },

    awardActivityPoints: async (activityId, activityType, { by = null, force = false } = {}) => {
        await assertAuthenticated();
        const dbData = getDB();
        const meta = db.getActivityMeta(activityId, activityType);

        if (meta.pointsAwardedAt && !force) {
            return { awarded: 0, total: 0, alreadyAwarded: true, at: meta.pointsAwardedAt };
        }

        const activity = activityType === 'competition'
            ? (dbData.competitions || []).find(c => c.id === activityId)
            : (dbData.events || []).find(e => e.id === activityId);
        if (!activity) throw new Error('Faoliyat topilmadi');

        const rows = db.previewActivityPoints(activityId, activityType).filter(r => r.points > 0);
        if (rows.length === 0) {
            await db.setActivityMeta(activityId, activityType, { pointsAwardedAt: new Date().toISOString() });
            return { awarded: 0, total: 0, alreadyAwarded: false };
        }

        const now = new Date().toISOString();
        const title = activity.title || activity.name || 'Tadbir';
        const academicYear = String(new Date().getFullYear());

        const txns = rows.map(r => ({
            id: 'satxn_' + Math.random().toString(36).slice(2, 11),
            studentId: r.participantId,
            studentFullName: r.studentName,
            category: 'ACTIVITY',
            points: r.points,
            academicYear,
            createdAt: now,
            createdBy: by || 'system',
            // Manba aniq yoziladi: ballning qayerdan kelgani ko'rinib tursin.
            scoringSourceName: `${title} (${LIFECYCLE_ROLE_LABEL[r.role] || r.role})`,
            activityId, activityType, participationRole: r.role, auto: true,
        }));

        const { error } = await supabase.from('social_score_transactions').insert(
            txns.map(t => ({
                id: t.id, student_id: t.studentId, application_id: null,
                category: t.category, points: t.points, academic_year: t.academicYear,
                created_at: t.createdAt,
                data: {
                    studentFullName: t.studentFullName, scoringSourceName: t.scoringSourceName,
                    createdBy: t.createdBy, activityId, activityType,
                    participationRole: t.participationRole, auto: true,
                }
            }))
        );
        if (error) throw error;

        if (!dbData.socialScoreTransactions) dbData.socialScoreTransactions = [];
        dbData.socialScoreTransactions.push(...txns);
        saveDB(dbData);

        await db.setActivityMeta(activityId, activityType, { pointsAwardedAt: now });

        // Har bir talabaga xabar - ball qayerdan kelganini bilsin. To'g'ridan-to'g'ri
        // yoziladi va sinxronlash OXIRIDA bir marta bo'ladi: `createNotification`
        // har chaqiruvda butun bazani qayta tortadi, yuz kishilik tadbirda bu yuz marta.
        for (const t of txns) {
            try {
                await addNotificationToSupabase({
                    userId: t.studentId, type: 'success', title: 'Ball qo\'shildi',
                    message: `${title} uchun ${t.points} ball qo'shildi (${LIFECYCLE_ROLE_LABEL[t.participationRole]}).`,
                    refId: activityId, refType: activityType,
                });
            } catch (e) { console.warn('[tadbir] xabar yuborilmadi:', e.message); }
        }
        try { await syncCoreDataFromSupabase(); } catch { /* xabar ko'rinishi keyingi yangilanishda */ }

        return { awarded: txns.length, total: txns.reduce((s, t) => s + t.points, 0), alreadyAwarded: false };
    },

    // --- 2. VAZIFALAR TAQSIMOTI ---
    getActivityTasks: (activityId, activityType) =>
        (getDB().activityTasks || [])
            .filter(t => t.activityId === activityId && t.activityType === activityType)
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),

    createActivityTask: async ({ activityId, activityType, title, assigneeId = null, role = null, dueDate = null, by = null }) => {
        await assertAuthenticated();
        if (!title?.trim()) throw new Error('Vazifa nomini kiriting');

        const dbData = getDB();
        const existing = db.getActivityTasks(activityId, activityType);
        const id = 'atask_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const sortOrder = existing.length;

        const { error } = await supabase.from('activity_tasks').insert({
            id, activity_id: activityId, activity_type: activityType,
            title: title.trim(), assignee_id: assigneeId, role, status: 'todo',
            due_date: dueDate, sort_order: sortOrder, data: { createdBy: by }
        });
        if (error) throw error;

        const record = {
            id, activityId, activityType, title: title.trim(), assigneeId, role,
            status: 'todo', dueDate, sortOrder, createdBy: by
        };
        (dbData.activityTasks = dbData.activityTasks || []).push(record);
        saveDB(dbData);
        return record;
    },

    updateActivityTask: async (taskId, patch) => {
        await assertAuthenticated();
        const dbData = getDB();
        const current = (dbData.activityTasks || []).find(t => t.id === taskId);
        if (!current) throw new Error('Vazifa topilmadi');

        const merged = { ...current, ...patch };
        const { id, activityId, activityType, title, assigneeId, role, status, dueDate, sortOrder, createdAt, ...data } = merged;
        const { error } = await supabase.from('activity_tasks').update({
            title, assignee_id: assigneeId || null, role: role || null, status,
            due_date: dueDate || null, sort_order: sortOrder,
            updated_at: new Date().toISOString(), data
        }).eq('id', taskId);
        if (error) throw error;

        Object.assign(current, merged);
        saveDB(dbData);
        return current;
    },

    deleteActivityTask: async (taskId) => {
        await assertAuthenticated();
        const { error } = await supabase.from('activity_tasks').delete().eq('id', taskId);
        if (error) throw error;
        const dbData = getDB();
        dbData.activityTasks = (dbData.activityTasks || []).filter(t => t.id !== taskId);
        saveDB(dbData);
    },

    // Andozadan bir necha vazifani birdan qo'shish - noldan yozish shart bo'lmasin.
    addTasksFromTemplate: async (activityId, activityType, templates, by = null) => {
        await assertAuthenticated();
        const existing = db.getActivityTasks(activityId, activityType);
        const rows = templates.map((t, i) => ({
            id: 'atask_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + i,
            activity_id: activityId, activity_type: activityType,
            title: t.title, assignee_id: null, role: t.role || null, status: 'todo',
            due_date: null, sort_order: existing.length + i, data: { createdBy: by }
        }));
        const { error } = await supabase.from('activity_tasks').insert(rows);
        if (error) throw error;

        const dbData = getDB();
        dbData.activityTasks = dbData.activityTasks || [];
        rows.forEach(r => dbData.activityTasks.push(mapActivityTaskFromSupabase(r)));
        saveDB(dbData);
        return { added: rows.length };
    },

    // --- 3. AVTOMATIK HISOBOT ---
    //
    // Raqamlarning HAMMASI bazadan hisoblanadi. Qo'lda kiritiladigani faqat
    // uchta matn maydoni: natija, muammo, tavsiya.
    buildActivityReportStats: (activityId, activityType) => {
        const dbData = getDB();
        const activity = activityType === 'competition'
            ? (dbData.competitions || []).find(c => c.id === activityId)
            : (dbData.events || []).find(e => e.id === activityId);
        if (!activity) return null;

        const students = new Map(generateMockStudents().map(s => [s.id, s]));

        const regs = (dbData.registrations || []).filter(r =>
            r.activityId === activityId && r.activityType === activityType && r.status !== 'cancelled');

        const attendance = (dbData.activityAttendance || []).filter(a =>
            a.activityId === activityId && a.activityType === activityType);
        const presentIds = new Set(attendance.filter(a => a.status === 'present').map(a => a.participantId));

        // Rollar kesimi
        const byRole = {};
        attendance.filter(a => a.status === 'present').forEach(a => {
            const role = a.role || 'participant';
            byRole[role] = (byRole[role] || 0) + 1;
        });

        // Fakultetlar kesimi
        const byFaculty = {};
        presentIds.forEach(id => {
            const f = students.get(id)?.faculty || "Noma'lum";
            byFaculty[f] = (byFaculty[f] || 0) + 1;
        });

        const points = (dbData.socialScoreTransactions || []).filter(t =>
            t.activityId === activityId && t.activityType === activityType);

        // Hujjat faoliyatga TO'G'RIDAN-TO'G'RI emas, bayonnoma orqali bog'lanadi.
        const protocol = (dbData.protocols || []).find(p =>
            p.activityType === activityType && p.activityId === activityId);
        const documents = protocol
            ? (dbData.documents || []).filter(d => d.protocolId === protocol.id && d.status === 'issued')
            : [];

        const registered = regs.length;
        const attended = presentIds.size;

        // Davomiylik - tadbirda tugash vaqti bor bo'lsa hisoblanadi.
        let durationMinutes = null;
        if (activityType === 'event' && activity.date && activity.endTime) {
            const start = new Date(activity.date);
            const [h, m] = String(activity.endTime).split(':').map(Number);
            const end = new Date(start);
            end.setHours(h || 0, m || 0, 0, 0);
            const diff = Math.round((end - start) / 60000);
            if (diff > 0) durationMinutes = diff;
        }

        return {
            title: activity.title || activity.name,
            date: activity.date || activity.startDate,
            location: activity.location || null,
            registered,
            attended,
            attendanceRate: registered > 0 ? Math.round((attended / registered) * 100) : null,
            byRole,
            byFaculty: Object.entries(byFaculty)
                .map(([faculty, count]) => ({ faculty, count }))
                .sort((a, b) => b.count - a.count),
            pointsAwarded: points.reduce((s, t) => s + (t.points || 0), 0),
            pointsRecipients: points.length,
            documentsIssued: documents.length,
            durationMinutes,
            computedAt: new Date().toISOString(),
        };
    },

    getActivityReport: (activityId, activityType) =>
        (getDB().activityReports || []).find(r =>
            r.activityId === activityId && r.activityType === activityType) || null,

    saveActivityReport: async (activityId, activityType, { outcome = '', issues = '', recommendations = '', photos = [], status = 'draft', by = null }) => {
        await assertAuthenticated();
        const dbData = getDB();
        const existing = db.getActivityReport(activityId, activityType);
        const now = new Date().toISOString();

        // Raqamlar SAQLASH PAYTIDA muhrlanadi - keyin davomat o'zgarsa ham
        // hisobotda o'sha paytdagi holat qoladi.
        const stats = db.buildActivityReportStats(activityId, activityType);
        const data = { outcome, issues, recommendations, photos, stats, savedBy: by };

        // Mavjudligi BAZADAN tekshiriladi, mahalliy nusxadan emas: boshqa
        // qurilmada yozilgan hisobot bu yerda ko'rinmasligi mumkin, va o'shanda
        // upsert o'rniga ikkinchi qator paydo bo'lardi.
        const { data: found, error: findErr } = await supabase.from('activity_reports')
            .select('id').eq('activity_id', activityId).eq('activity_type', activityType).maybeSingle();
        if (findErr) throw findErr;

        const id = found?.id || existing?.id || 'arep_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const row = {
            activity_id: activityId, activity_type: activityType, status,
            submitted_by: status === 'submitted' ? (by || null) : (existing?.submittedBy || null),
            submitted_at: status === 'submitted' ? now : (existing?.submittedAt || null),
            updated_at: now, data
        };
        const { error } = found
            ? await supabase.from('activity_reports').update(row).eq('id', id)
            : await supabase.from('activity_reports').insert({ id, ...row });
        if (error) throw error;

        const record = {
            ...data, id, activityId, activityType, status,
            submittedBy: status === 'submitted' ? by : existing?.submittedBy,
            submittedAt: status === 'submitted' ? now : existing?.submittedAt,
            updatedAt: now,
        };
        dbData.activityReports = dbData.activityReports || [];
        if (existing) Object.assign(existing, record);
        else dbData.activityReports.push(record);
        saveDB(dbData);
        return record;
    },

    // --- 5. TALABA TOMONI ---
    //
    // Yuqoridagi hamma narsa admin uchun edi: vazifa biriktiriladi, ball beriladi,
    // rol belgilanadi - lekin talaba buni KO'RMAYDI. Vazifalar taqsimoti bir
    // tomonlama bo'lib qolgandi: tashkilotchi ro'yxatni ko'radi, vazifa berilgan
    // odam esa bilmaydi. Quyidagi ikki funksiya shuni yopadi.

    // Menga biriktirilgan vazifalar - faoliyat nomi va sanasi bilan.
    getTasksForAssignee: (username) => {
        if (!username) return [];
        const dbData = getDB();
        const events = new Map((dbData.events || []).map(e => [e.id, e]));
        const comps = new Map((dbData.competitions || []).map(c => [c.id, c]));

        return (dbData.activityTasks || [])
            .filter(t => t.assigneeId === username)
            .map(t => {
                const a = t.activityType === 'competition' ? comps.get(t.activityId) : events.get(t.activityId);
                return {
                    ...t,
                    activityTitle: a?.title || a?.name || null,
                    activityDate: a?.date || a?.startDate || null,
                };
            })
            // Bajarilmaganlar tepada, keyin muddati yaqinlari.
            .sort((a, b) => {
                if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
                return String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'));
            });
    },

    // Mening ishtirokim: qaysi tadbirda qatnashdim, qaysi rolda, qancha ball oldim.
    //
    // Ball `social_score_transactions` dan O'QILADI, qayta hisoblanmaydi - aks holda
    // ekranda ko'rsatilgan raqam bilan haqiqiy ball bir-biriga mos kelmay qolishi
    // mumkin edi (masalan daraja keyin o'zgartirilsa).
    getStudentActivityParticipation: (username) => {
        if (!username) return [];
        const dbData = getDB();
        const events = new Map((dbData.events || []).map(e => [e.id, e]));
        const comps = new Map((dbData.competitions || []).map(c => [c.id, c]));

        const pointsByActivity = new Map();
        (dbData.socialScoreTransactions || [])
            .filter(t => t.studentId === username && t.activityId)
            .forEach(t => {
                const key = `${t.activityType}:${t.activityId}`;
                pointsByActivity.set(key, (pointsByActivity.get(key) || 0) + (t.points || 0));
            });

        // Bir talaba bir faoliyatda bir necha bosqichda belgilangan bo'lishi mumkin -
        // ro'yxatda faoliyat BIR MARTA chiqadi.
        const byActivity = new Map();
        (dbData.activityAttendance || [])
            .filter(a => a.participantId === username && a.status === 'present')
            .forEach(a => {
                const key = `${a.activityType}:${a.activityId}`;
                const role = a.role || 'participant';
                const current = byActivity.get(key);
                const rank = (r) => LIFECYCLE_ROLE_RANK[r] ?? 1;
                if (!current || rank(role) > rank(current.role)) {
                    byActivity.set(key, { activityId: a.activityId, activityType: a.activityType, role });
                }
            });

        return Array.from(byActivity.entries())
            .map(([key, v]) => {
                const a = v.activityType === 'competition' ? comps.get(v.activityId) : events.get(v.activityId);
                if (!a) return null;
                return {
                    ...v,
                    title: a.title || a.name,
                    date: a.date || a.startDate || null,
                    level: a.level || null,
                    eventType: a.eventType || null,
                    // null = ball hali berilmagan (tadbir yakunlanmagan). 0 EMAS -
                    // "hali yo'q" bilan "nol ball" boshqa-boshqa narsa.
                    points: pointsByActivity.has(key) ? pointsByActivity.get(key) : null,
                };
            })
            .filter(Boolean)
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    },

    // Hisoboti yo'q yakunlangan faoliyatlar - admin ekranida ko'rsatish uchun.
    getActivitiesWithoutReport: () => {
        const dbData = getDB();
        const reports = new Set((dbData.activityReports || [])
            .filter(r => r.status === 'submitted')
            .map(r => `${r.activityType}:${r.activityId}`));

        return (dbData.events || [])
            .filter(e => e.status === 'completed' && !reports.has(`event:${e.id}`))
            .map(e => ({ id: e.id, type: 'event', title: e.title, date: e.date }));
    },

    // --- 4. BILDIRISHNOMALAR ---
    //
    // Faoliyat e'loni. Ikki joydan chaqiriladi va IKKALASI HAM shu bitta yo'ldan
    // o'tadi: avtomatik (tadbir yaratilganda yoki tasdiqlanganda - createEvent /
    // createCompetition / reviewEventModeration / reviewCompetitionModeration) va
    // qo'lda ("E'lon qilish" tugmasi, EventManagementPanel.jsx).
    //
    // BUTUN ISH SERVERDA (supabase/announce_activity.sql). Bu yerda faqat
    // chaqiruv. Ilgari qabul qiluvchilar shu yerda, brauzerda yig'ilardi va
    // bunda uchta jiddiy kamchilik bor edi:
    //   1. `notification_preferences` ning RLS'i har kimga faqat O'Z qatorini
    //      ko'rsatadi - ya'ni brauzer boshqalarning tanlovini umuman ko'ra
    //      olmaydi va xabarni o'chirgan odam ham xabar olib qolardi.
    //   2. Ro'yxat `generateMockStudents()` dan olinardi, ya'ni SINTETIK
    //      talabalar bo'yicha. O'sha ro'yxatda yo'q haqiqiy talaba jimgina
    //      tushib qolardi.
    //   3. Har qabul qiluvchiga alohida `insert` - N ta tarmoq chaqiruvi.
    //
    // Qamrov qoidasi ham serverda: xabar ro'yxatdan o'ta oladigan odamga
    // boradi (fakultet/kurs/jins/professionallik cheklovlari `checkEligibility`
    // bilan bir xil o'qiladi).
    //
    // TAKROR YUBORISH XAVFSIZ: server ayni odam + ayni faoliyat bo'yicha
    // ikkinchi marta yozmaydi. Shuning uchun avtomatik e'londan keyin qo'lda
    // bosilsa ham hech kim ikkita xabar olmaydi.
    //
    // JIM XATO — ataylab: e'lon yuborilmagani uchun tadbir yaratilishi bekor
    // bo'lmasligi kerak. Yaratish asosiy ish, xabar qo'shimcha.
    announceActivity: async (activityId, activityType = 'event') => {
        if (!activityId) return { sent: 0, alreadyAnnounced: false };

        const meta = db.getActivityMeta(activityId, activityType);
        const wasAnnounced = !!meta.announcedAt;
        let sent = 0;

        try {
            const { data, error } = await supabase.rpc('announce_activity', {
                p_activity_type: activityType,
                p_activity_id: String(activityId),
            });
            if (error) {
                console.warn("E'lon xabari yuborilmadi:", error.message);
                return { sent: 0, alreadyAnnounced: wasAnnounced, error: error.message };
            }
            sent = data || 0;
        } catch (e) {
            console.warn("E'lon xabari yuborilmadi:", e.message);
            return { sent: 0, alreadyAnnounced: wasAnnounced, error: e.message };
        }

        // Yozuv bo'lgandagina qayta o'qiladi - e'lon ko'pincha takrorlanib
        // chaqiriladi va bo'sh natijada tarmoqqa chiqish keraksiz.
        if (sent > 0) await syncCoreDataFromSupabase();

        // `announcedAt` - "kamida bir marta e'lon qilingan" belgisi, tugma
        // o'rnida nishon ko'rsatish uchun. U TAKRORNI TO'SMAYDI: takror
        // yubormaslikni server o'zi, odam-odam bo'yicha hal qiladi.
        if (!wasAnnounced) {
            try {
                await db.setActivityMeta(activityId, activityType, { announcedAt: new Date().toISOString() });
            } catch (e) {
                console.warn("E'lon belgisi saqlanmadi:", e.message);
            }
        }

        return { sent, alreadyAnnounced: wasAnnounced && sent === 0 };
    },

    // =========================================================================
    // PHASE 0 — POYDEVOR: akademik ko'rsatkich (GPA) va tashqi integratsiya
    //
    // GPA platformada UMUMAN yo'q edi: studentScoring.js tasodifiy `gpaProxy`
    // ishlatardi. Talent moduli akademik o'lchovga tayanadi, shuning uchun bu
    // real, semestr bo'yicha saqlanadigan ma'lumotga aylantirildi.
    // =========================================================================

    isFoundationBackendReady: () => getDB().foundationBackendReady !== false,

    getAcademicRecords: (studentId = null) =>
        (getDB().academicRecords || [])
            .filter(r => !studentId || r.studentId === studentId)
            .sort((a, b) => String(b.academicYear).localeCompare(String(a.academicYear)) || b.semester - a.semester),

    // Talabaning eng so'nggi GPA'si. `null` - ma'lumot yo'q degani; hech qachon
    // o'ylab topilgan raqam qaytarilmaydi (avvalgi gpaProxy'dan asosiy farqi).
    getStudentGPA: (studentId) => {
        const records = (getDB().academicRecords || [])
            .filter(r => r.studentId === studentId && r.gpa !== null && r.gpa !== undefined);
        if (records.length === 0) return null;
        const latest = records.sort((a, b) =>
            String(b.academicYear).localeCompare(String(a.academicYear)) || b.semester - a.semester)[0];
        return { gpa: latest.gpa, academicYear: latest.academicYear, semester: latest.semester, source: latest.source };
    },

    // O'rtacha GPA (butun o'qish davri) - Talent Score akademik o'lchovi uchun.
    // O'QUV YILI bo'yicha GPA - ijtimoiy faollik indeksi shuni ishlatadi.
    //
    // `getStudentAverageGPA` (quyida) butun o'qish davrini o'rtachalaydi va u
    // Talent moduli uchun to'g'ri. Indeks uchun esa NOTO'G'RI: metodika
    // "har o'quv yilining yakuni bo'yicha" baholaydi, ya'ni 3-kurs talabasining
    // 1-kursdagi past bahosi bu yilgi baliga ta'sir qilmasligi kerak.
    //
    // Yil ichida ikki semestr bo'ladi - ular o'rtachalanadi. Bitta semestr
    // kiritilgan bo'lsa o'sha olinadi (yil hali tugamagan bo'lishi mumkin).
    getStudentYearGPA: (studentId, academicYear = null) => {
        const year = academicYear || getCurrentAcademicYear();
        const records = (getDB().academicRecords || []).filter(r =>
            r.studentId === studentId
            && r.academicYear === year
            && r.gpa !== null && r.gpa !== undefined);
        if (records.length === 0) return null;
        const avg = records.reduce((s, r) => s + r.gpa, 0) / records.length;
        return {
            gpa: Math.round(avg * 100) / 100,
            semesters: records.length,
            // Manbani ajratib ko'rsatamiz: HEMIS'dan kelganmi yoki qo'lda
            // kiritilganmi - tekshiruvda bu savol tug'iladi.
            sources: [...new Set(records.map(r => r.source).filter(Boolean))],
        };
    },

    getStudentAverageGPA: (studentId) => {
        const records = (getDB().academicRecords || [])
            .filter(r => r.studentId === studentId && r.gpa !== null && r.gpa !== undefined);
        if (records.length === 0) return null;
        return Math.round((records.reduce((s, r) => s + r.gpa, 0) / records.length) * 100) / 100;
    },

    // GPA dinamikasi: o'smoqda / barqaror / tushmoqda. Monitoringning asosiy signali -
    // past GPA emas, balki TUSHISH tendensiyasi e'tibor talab qiladi.
    getStudentGPATrend: (studentId) => {
        const records = (getDB().academicRecords || [])
            .filter(r => r.studentId === studentId && r.gpa !== null && r.gpa !== undefined)
            .sort((a, b) => String(a.academicYear).localeCompare(String(b.academicYear)) || a.semester - b.semester);
        if (records.length < 2) return { trend: 'unknown', delta: 0, records };
        const delta = Math.round((records[records.length - 1].gpa - records[records.length - 2].gpa) * 100) / 100;
        return {
            trend: delta > 0.1 ? 'up' : delta < -0.1 ? 'down' : 'stable',
            delta, records,
        };
    },

    setAcademicRecord: async ({ studentId, academicYear, semester, gpa, credits = null, source = 'manual', by = null }) => {
        await assertAuthenticated();
        if (!studentId || !academicYear || !semester) throw new Error("Talaba, o'quv yili va semestr kerak");

        const dbData = getDB();
        const existing = (dbData.academicRecords || []).find(r =>
            r.studentId === studentId && r.academicYear === academicYear && Number(r.semester) === Number(semester));
        const id = existing?.id || 'acad_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const now = new Date().toISOString();
        const cleanGpa = gpa === null || gpa === '' ? null : Math.max(0, Math.min(5, Number(gpa)));

        // `data` USTIGA yozilmaydi, ustiga qo'shiladi: bu ustunda GPA'dan
        // tashqari qoldirilgan dars soati ham turadi (6-mezon). Butun
        // obyektni almashtirish o'sha soatni jimgina o'chirib yuborardi.
        const keepData = {
            ...(existing?.missedHours != null ? { missedHours: existing.missedHours } : {}),
            ...(existing?.missedHoursBy ? { missedHoursBy: existing.missedHoursBy } : {}),
            ...(existing?.missedHoursAt ? { missedHoursAt: existing.missedHoursAt } : {}),
        };

        const { error } = await supabase.from('academic_records').upsert({
            id, student_id: studentId, academic_year: academicYear, semester: Number(semester),
            gpa: cleanGpa, credits: credits === null || credits === '' ? null : Number(credits),
            source, synced_at: source === 'hemis' ? now : null, updated_at: now,
            data: { ...keepData, enteredBy: by }
        }, { onConflict: 'student_id,academic_year,semester' });
        if (error) throw error;

        const record = {
            id, studentId, academicYear, semester: Number(semester), gpa: cleanGpa,
            credits, source, enteredBy: by, updatedAt: now, ...keepData
        };
        if (!dbData.academicRecords) dbData.academicRecords = [];
        if (existing) Object.assign(existing, record);
        else dbData.academicRecords.push(record);
        saveDB(dbData);
        return record;
    },

    // --- QOLDIRILGAN DARS SOATI (6-mezon) ---
    //
    // DIQQAT: bu DARS davomati, TADBIR davomati emas. Platformada dars jadvali
    // ham, jurnal ham yo'q - dars davomati HEMIS tomonida. Shuning uchun ikki
    // yo'l qoldirilgan:
    //   hemis  - integratsiya ulanganda avtomatik tushadi
    //   manual - tyutor kiritadi (hozircha yagona ishlaydigan yo'l)
    //
    // Yangi jadval OCHILMADI: soat `academic_records.data` ichida, GPA bilan
    // bir qatorda turadi - bir talaba, bir o'quv yili, bir semestr uchun bitta
    // yozuv. Ya'ni SQL ishga tushirish shart emas.
    setMissedHours: async ({ studentId, academicYear, semester, hours, source = 'manual', by = null }) => {
        await assertAuthenticated();
        if (!studentId || !academicYear || !semester) throw new Error("Talaba, o'quv yili va semestr kerak");
        const clean = hours === null || hours === '' ? null : Math.max(0, Number(hours));
        if (clean != null && Number.isNaN(clean)) throw new Error("Soat noto'g'ri kiritilgan");

        const dbData = getDB();
        const existing = (dbData.academicRecords || []).find(r =>
            r.studentId === studentId && r.academicYear === academicYear && Number(r.semester) === Number(semester));
        const id = existing?.id || 'acad_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const now = new Date().toISOString();

        // GPA tegilmaydi - bu yozuvda u boshqa mas'ulning ma'lumoti.
        const { error } = await supabase.from('academic_records').upsert({
            id, student_id: studentId, academic_year: academicYear, semester: Number(semester),
            gpa: existing?.gpa ?? null,
            credits: existing?.credits ?? null,
            source: existing?.source || 'manual',
            updated_at: now,
            data: {
                ...(existing?.enteredBy ? { enteredBy: existing.enteredBy } : {}),
                missedHours: clean,
                missedHoursBy: by,
                missedHoursSource: source,
                missedHoursAt: now,
            },
        }, { onConflict: 'student_id,academic_year,semester' });
        if (error) throw error;

        const patch = {
            id, studentId, academicYear, semester: Number(semester),
            missedHours: clean, missedHoursBy: by, missedHoursSource: source,
            missedHoursAt: now, updatedAt: now,
        };
        if (!dbData.academicRecords) dbData.academicRecords = [];
        if (existing) Object.assign(existing, patch);
        else dbData.academicRecords.push({ ...patch, gpa: null, credits: null, source: 'manual' });
        saveDB(dbData);
        return patch;
    },

    // Talabaning o'quv yili bo'yicha qoldirilgan soatlari - semestr kesimida.
    getStudentMissedHours: (studentId, academicYear = null) => {
        const year = academicYear || getCurrentAcademicYear();
        return (getDB().academicRecords || [])
            .filter(r => r.studentId === studentId
                && r.academicYear === year
                && r.missedHours != null)
            .map(r => ({
                semester: Number(r.semester),
                hours: Number(r.missedHours),
                by: r.missedHoursBy || null,
                source: r.missedHoursSource || 'manual',
                at: r.missedHoursAt || null,
            }))
            .sort((a, b) => a.semester - b.semester);
    },

    // Ommaviy yozish - HEMIS sinxronlashi va CSV import shu orqali ishlaydi.
    setAcademicRecordsBulk: async (rows, { source = 'import', by = null } = {}) => {
        await assertAuthenticated();
        if (!Array.isArray(rows) || rows.length === 0) return { written: 0 };

        const now = new Date().toISOString();
        const prepared = rows
            .filter(r => r.studentId && r.academicYear && r.semester)
            .map(r => ({
                id: 'acad_' + r.studentId + '_' + r.academicYear + '_' + r.semester,
                student_id: r.studentId, academic_year: r.academicYear, semester: Number(r.semester),
                gpa: r.gpa === null || r.gpa === '' ? null : Math.max(0, Math.min(5, Number(r.gpa))),
                credits: r.credits === null || r.credits === '' ? null : Number(r.credits),
                source, synced_at: source === 'hemis' ? now : null, updated_at: now,
                data: { enteredBy: by }
            }));

        const { error } = await supabase.from('academic_records')
            .upsert(prepared, { onConflict: 'student_id,academic_year,semester' });
        if (error) throw error;

        const dbData = getDB();
        dbData.academicRecords = dbData.academicRecords || [];
        prepared.forEach(p => {
            const rec = mapAcademicRecordFromSupabase(p);
            const idx = dbData.academicRecords.findIndex(r =>
                r.studentId === p.student_id && r.academicYear === p.academic_year
                && Number(r.semester) === p.semester);
            if (idx >= 0) dbData.academicRecords[idx] = rec;
            else dbData.academicRecords.push(rec);
        });
        saveDB(dbData);
        return { written: prepared.length };
    },

    // --- Tashqi integratsiya sozlamalari (HEMIS) ---
    getIntegrationSettings: (key = 'hemis') => (getDB().integrationSettings || {})[key] || {},

    saveIntegrationSettings: async (key, patch) => {
        await assertAuthenticated();
        const dbData = getDB();
        const current = (dbData.integrationSettings || {})[key] || {};
        const next = { ...current, ...patch };
        const { error } = await supabase.from('integration_settings')
            .upsert({ id: key, data: next, updated_at: new Date().toISOString() });
        if (error) throw error;
        dbData.integrationSettings = { ...(dbData.integrationSettings || {}), [key]: next };
        saveDB(dbData);
        return next;
    },

    logIntegrationSync: async ({ integration, status, records = 0, detail = null }) => {
        const id = 'isync_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const now = new Date().toISOString();
        const { error } = await supabase.from('integration_sync_logs').insert({
            id, integration, status, started_at: now, finished_at: now, records,
            data: { detail }
        });
        if (error) console.warn('[integratsiya] log yozilmadi:', error.message);
        return id;
    },

    // Eski brauzerdagi ma'lumotni bir martalik serverga ko'chirish.
    // Server BO'SH bo'lsagina ishlaydi - real ma'lumot ustiga hech qachon yozmaydi.
    migrateFoundationDataToSupabase: async () => {
        await assertAuthenticated();
        const dbData = getDB();
        const result = { socialScore: 0, attendance: 0, skipped: [] };

        // Ijtimoiy faollik ledgeri
        const { count: sstCount, error: sstCntErr } = await supabase
            .from('social_score_transactions').select('id', { count: 'exact', head: true });
        if (sstCntErr) throw sstCntErr;

        if (sstCount === 0) {
            const local = dbData.socialScoreTransactions || [];
            if (local.length > 0) {
                const { error } = await supabase.from('social_score_transactions').upsert(
                    local.map(t => ({
                        id: t.id, student_id: t.studentId, application_id: t.applicationId || null,
                        category: t.category || null, points: Number(t.points) || 0,
                        academic_year: t.academicYear || null, created_at: t.createdAt || new Date().toISOString(),
                        data: {
                            studentFullName: t.studentFullName, scoringSourceId: t.scoringSourceId,
                            scoringSourceCode: t.scoringSourceCode, scoringSourceName: t.scoringSourceName,
                            appliesTo: t.appliesTo, createdBy: t.createdBy, migrated: true
                        }
                    }))
                );
                if (error) throw error;
                result.socialScore = local.length;
            }
        } else result.skipped.push('social_score_transactions');

        // Davomat
        const { count: attCount, error: attCntErr } = await supabase
            .from('activity_attendance').select('id', { count: 'exact', head: true });
        if (attCntErr) throw attCntErr;

        if (attCount === 0) {
            const local = dbData.activityAttendance || [];
            if (local.length > 0) {
                const { error } = await supabase.from('activity_attendance').upsert(
                    local.map(a => ({
                        id: a.id, activity_id: a.activityId, activity_type: a.activityType,
                        leaf_unit_type: a.leafUnitType, leaf_unit_id: String(a.leafUnitId),
                        participant_id: a.participantId, team_id: a.teamId || null,
                        status: a.status, marked_at: a.markedAt || null,
                        data: { markedByUserId: a.markedByUserId, migrated: true }
                    })),
                    { onConflict: 'activity_id,activity_type,leaf_unit_type,leaf_unit_id,participant_id' }
                );
                if (error) throw error;
                result.attendance = local.length;

                const locks = dbData.activityAttendanceLocks || [];
                if (locks.length > 0) {
                    await supabase.from('activity_attendance_locks').upsert(
                        locks.map(l => ({
                            id: l.id, activity_id: l.activityId, activity_type: l.activityType,
                            leaf_unit_type: l.leafUnitType, leaf_unit_id: String(l.leafUnitId),
                            locked_at: l.lockedAt || null, reopened_at: l.reopenedAt || null,
                            data: { lockedByUserId: l.lockedByUserId, reopenedByUserId: l.reopenedByUserId, migrated: true }
                        })),
                        { onConflict: 'activity_id,activity_type,leaf_unit_type,leaf_unit_id' }
                    );
                }
            }
        } else result.skipped.push('activity_attendance');

        return result;
    },

    // =========================================================================
    // TESTLAR MODULI (real backend)
    //
    // Shu paytgacha testlar bo'limi butunlay mock edi. Bu blok - uning ma'lumot
    // qatlami: savollar bazasi, savollar, testlar va urinishlar (natijalar).
    // Stipendiyaning "test bosqichi" aynan shu yerdan ball oladi.
    //
    // TestManagement.jsx / TestsModule.jsx komponentlari hali o'z mahalliy
    // massivlaridan foydalanadi - ularni shu funksiyalarga ulash keyingi qadam.
    // =========================================================================

    isTestsBackendReady: () => getDB().testsBackendReady !== false,

    getQuestionBases: () => (getDB().questionBases || []),

    createQuestionBase: async ({ title, status = 'active' }) => {
        const id = 'qbase_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const { error } = await supabase.from('question_bases').insert({ id, title, status, data: {} });
        if (error) throw error;
        const dbData = getDB();
        (dbData.questionBases = dbData.questionBases || []).push({ id, title, status });
        saveDB(dbData);
        return { id, title, status };
    },

    deleteQuestionBase: async (id) => {
        const { error } = await supabase.from('question_bases').delete().eq('id', id);
        if (error) throw error;
        const dbData = getDB();
        dbData.questionBases = (dbData.questionBases || []).filter(b => b.id !== id);
        saveDB(dbData);
    },

    getTestQuestions: (baseId = null) =>
        (getDB().testQuestions || []).filter(q => !baseId || q.baseId === baseId),

    // ----------------------------------------------------------------------
    // SAVOLNING ISHLATILISHI VA SIFATI
    //
    // Manba - talabalarning HAQIQIY urinishlari. Har urinishda berilgan
    // javoblar saqlanadi (`attempt.answers` = { savolId: tanlanganVariant }),
    // shuning uchun har savol bo'yicha aniq hisoblash mumkin:
    //   necha marta CHIQQAN, nechtasi TO'G'RI javob bergan, oxirgi marta
    //   qachon chiqqan.
    //
    // Bu "necha marta ishlatilgan" degan savolga javob beradi - baza
    // darajasidagi "qaysi testlarda" dan farqli o'laroq, bu SAVOLNING o'zi
    // talaba oldiga necha marta chiqqanini o'lchaydi.
    //
    // Hech narsa taxmin qilinmaydi: chiqmagan savol `shown: 0` bo'ladi va
    // uning to'g'ri javob foizi `null` - nol emas.
    getQuestionUsageStats: () => {
        const dbData = getDB();
        const questions = dbData.testQuestions || [];
        const correctById = new Map(questions.map(q => [q.id, Number(q.correctIndex)]));

        const stats = new Map(questions.map(q => [q.id, {
            questionId: q.id, shown: 0, correct: 0, lastUsedAt: null, testIds: new Set(),
        }]));

        (dbData.testAttempts || []).forEach(attempt => {
            // Tugallanmagan urinish hisobga olinmaydi: talaba savolni ko'rgan
            // bo'lishi mumkin, lekin javobi yakuniy emas.
            if (!attempt.finishedAt) return;
            const answers = attempt.answers || {};
            Object.keys(answers).forEach(questionId => {
                const row = stats.get(questionId);
                if (!row) return; // O'chirilgan savol - urinish tarixida qoladi.
                row.shown++;
                if (Number(answers[questionId]) === correctById.get(questionId)) row.correct++;
                row.testIds.add(attempt.testId);
                if (!row.lastUsedAt || new Date(attempt.finishedAt) > new Date(row.lastUsedAt)) {
                    row.lastUsedAt = attempt.finishedAt;
                }
            });
        });

        const out = new Map();
        stats.forEach((row, id) => {
            out.set(id, {
                ...row,
                testIds: Array.from(row.testIds),
                testCount: row.testIds.size,
                // Maxraji yo'q foiz YO'Q - nol emas.
                correctRate: row.shown > 0 ? Math.round((row.correct / row.shown) * 100) : null,
            });
        });
        return out;
    },

    // Bazadagi savollar soni - ro'yxatlarda ko'rsatish uchun.
    getQuestionBasesWithCounts: () => {
        const questions = getDB().testQuestions || [];
        const counts = new Map();
        questions.forEach(q => counts.set(q.baseId, (counts.get(q.baseId) || 0) + 1));
        return (getDB().questionBases || []).map(b => ({ ...b, questionCount: counts.get(b.id) || 0 }));
    },

    // ----------------------------------------------------------------------
    // SAVOLLAR BAZALARI - TO'LIQ XULOSA.
    //
    // Savollar bazasi ro'yxati ilgari HAR SAVOLNI alohida qator qilib
    // ko'rsatardi. Yuzlab savol bo'lganda u shunchaki uzun ro'yxat edi va
    // undan "qaysi fanda nechta savol bor" degan savolga javob topib
    // bo'lmasdi.
    //
    // Endi ro'yxat BAZALAR kesimida, savollar esa bazaning ichida.
    //
    // `usedByTests` - eng muhim ustun: bazani o'chirishdan oldin uning
    // savollari qaysi testlarda ishlatilayotganini bilish kerak. Aks holda
    // ishlab turgan test jimgina bo'shab qolardi.
    getQuestionBaseSummaries: () => {
        const dbData = getDB();
        const questions = dbData.testQuestions || [];
        const tests = dbData.tests || [];

        // Test bazaga IKKI yo'l bilan bog'lanadi: to'g'ridan-to'g'ri
        // `baseId` (kitobxonlik testi) yoki `blocks` (aralash test).
        const usage = new Map();
        const addUsage = (baseId, test) => {
            if (!baseId) return;
            if (!usage.has(baseId)) usage.set(baseId, []);
            if (!usage.get(baseId).some(t => t.id === test.id)) {
                usage.get(baseId).push({ id: test.id, title: test.title, isReadingTest: !!test.isReadingTest });
            }
        };
        tests.forEach(t => {
            addUsage(t.baseId, t);
            (t.blocks || []).forEach(b => addUsage(b.baseId, t));
        });

        return (dbData.questionBases || []).map(base => {
            const own = questions.filter(q => q.baseId === base.id);
            const byDifficulty = {
                easy: own.filter(q => q.difficulty === 'easy').length,
                medium: own.filter(q => q.difficulty !== 'easy' && q.difficulty !== 'hard').length,
                hard: own.filter(q => q.difficulty === 'hard').length,
            };
            const linkedTests = usage.get(base.id) || [];
            return {
                ...base,
                questionCount: own.length,
                byDifficulty,
                // Bazaning "og'irligi" - qaysi qiyinlik ustun kelayotgani.
                dominantDifficulty: own.length === 0 ? null
                    : Object.entries(byDifficulty).reduce((a, b) => (b[1] > a[1] ? b : a))[0],
                usedByTests: linkedTests,
                // Kitobxonlik bazasi FAN bazasidan farq qiladi: u asar uchun
                // avtomatik yaratiladi va nomi "Kitobxonlik: ..." bilan
                // boshlanadi. Uni qo'lda o'chirish asar testini buzardi.
                isReadingBase: linkedTests.some(t => t.isReadingTest)
                    || String(base.title || '').startsWith('Kitobxonlik:'),
                // Oxirgi savol qachon qo'shilgan - baza yangilanib turibdimi.
                lastQuestionAt: own.reduce(
                    (latest, q) => (!latest || new Date(q.createdAt) > new Date(latest) ? q.createdAt : latest),
                    null
                ),
            };
        });
    },

    // TESTNING HAQIQIY SAVOLLARI.
    //
    // Bugungacha test o'z savollarini BILMASDI: savollar bazaga tegishli edi,
    // test esa bazaga bog'lanmagandi. Natijada test yaratilardi, lekin uni
    // topshirib bo'lmasdi - qaysi savollar chiqishi hech qayerda yozilmagan edi.
    //
    // Ikki shakl qo'llab-quvvatlanadi:
    //   `blocks: [{ baseId, count }]` - bazadan N ta savol (aralash test)
    //   `baseId`                      - bazaning HAMMA savoli (kitobxonlik shunday)
    //
    // Aralashtirish DETERMINISTIK emas: har topshirishda boshqa tartib chiqadi.
    resolveTestQuestions: (testId) => {
        const dbData = getDB();
        const test = (dbData.tests || []).find(t => t.id === testId);
        if (!test) return [];

        const pick = (baseId, count) => {
            const pool = (dbData.testQuestions || []).filter(q => q.baseId === baseId);
            if (!count || count >= pool.length) return pool;
            // Fisher-Yates - faqat kerakli qismini olamiz.
            const copy = pool.slice();
            for (let i = copy.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy.slice(0, count);
        };

        let questions = [];
        if (Array.isArray(test.blocks) && test.blocks.length > 0) {
            test.blocks.forEach(b => { if (b.baseId) questions.push(...pick(b.baseId, Number(b.count) || 0)); });
        } else if (test.baseId) {
            questions = pick(test.baseId, 0);
        }

        if (test.shuffleQuestions !== false) {
            for (let i = questions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [questions[i], questions[j]] = [questions[j], questions[i]];
            }
        }

        // JAVOB VARIANTLARINI ARALASHTIRISH.
        //
        // `shuffleOptions` sozlamasi saqlanardi va tugmasi ham bor edi, lekin
        // hech qayerda o'qilmasdi - ya'ni variantlar hamma talabada bir xil
        // tartibda chiqardi.
        //
        // Muhim tafsilot: variantni shunchaki joyini almashtirish YETARLI EMAS.
        // Ball hisoblashda `answers[q.id]` savolning ASL `correctIndex` i bilan
        // solishtiriladi. Shuning uchun har variant o'zi bilan ASL o'rnini
        // (`value`) olib yuradi va interfeys o'shani yuboradi. Shunda
        // aralashtirish ball hisobiga umuman tegmaydi.
        return questions.map(q => {
            const options = (q.options || []).map((text, index) => ({ text, value: index }));
            if (test.shuffleOptions !== false) {
                for (let i = options.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [options[i], options[j]] = [options[j], options[i]];
                }
            }
            return { ...q, displayOptions: options };
        });
    },

    // Testda nechta savol bo'lishi - ro'yxatda ko'rsatish uchun (aralashtirmasdan).
    getTestQuestionCount: (testId) => {
        const dbData = getDB();
        const test = (dbData.tests || []).find(t => t.id === testId);
        if (!test) return 0;
        const poolSize = (baseId) => (dbData.testQuestions || []).filter(q => q.baseId === baseId).length;

        if (Array.isArray(test.blocks) && test.blocks.length > 0) {
            return test.blocks.reduce((sum, b) => {
                const available = poolSize(b.baseId);
                return sum + Math.min(Number(b.count) || 0, available);
            }, 0);
        }
        return test.baseId ? poolSize(test.baseId) : 0;
    },

    // `options` - variantlar massivi, `correctIndex` - to'g'ri javob indeksi.
    createTestQuestion: async ({ baseId, subject, difficulty = 'medium', text, options = [], correctIndex = 0, explanation = '' }) => {
        const id = 'q_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const data = { text, options, correctIndex, explanation };
        const { error } = await supabase.from('test_questions')
            .insert({ id, base_id: baseId, subject, difficulty, data });
        if (error) throw error;
        const dbData = getDB();
        (dbData.testQuestions = dbData.testQuestions || []).push({ ...data, id, baseId, subject, difficulty });
        saveDB(dbData);
        return { ...data, id, baseId, subject, difficulty };
    },

    // SAVOLLARNI JADVALDAN IMPORT QILISH.
    //
    // Ustunlar ATAYLAB ikki tilda qabul qilinadi (savol/question, variant_a/a...):
    // tayyor fayllar turli manbadan keladi va bittasini majburlash faylni
    // qaytadan yozishga majbur qilardi.
    //
    // To'g'ri javob A/B/C/D yoki 1/2/3/4 shaklida bo'lishi mumkin.
    importTestQuestions: async (baseId, rows) => {
        await assertAuthenticated();
        if (!baseId) throw new Error('Savollar bazasi tanlanmagan');

        const pick = (row, names) => {
            for (const n of names) {
                const key = Object.keys(row).find(k => k.trim().toLowerCase() === n);
                if (key != null && String(row[key]).trim() !== '') return String(row[key]).trim();
            }
            return '';
        };

        const DIFFICULTY = {
            oson: 'easy', easy: 'easy',
            "o'rtacha": 'medium', ortacha: 'medium', medium: 'medium', "o‘rtacha": 'medium',
            qiyin: 'hard', hard: 'hard',
        };

        const results = { added: 0, skipped: 0, errors: [] };
        const prepared = [];

        for (const [i, row] of rows.entries()) {
            const line = i + 2; // sarlavha qatorini hisobga olib
            const text = pick(row, ['savol', 'question', 'savol matni']);
            if (!text) { results.skipped++; continue; }

            const options = [
                pick(row, ['variant_a', 'a', 'javob_a', 'variant a']),
                pick(row, ['variant_b', 'b', 'javob_b', 'variant b']),
                pick(row, ['variant_c', 'c', 'javob_c', 'variant c']),
                pick(row, ['variant_d', 'd', 'javob_d', 'variant d']),
                pick(row, ['variant_e', 'e']),
                pick(row, ['variant_f', 'f']),
            ].filter(Boolean);

            if (options.length < 2) {
                results.errors.push(`${line}-qator: kamida 2 ta variant kerak`);
                continue;
            }

            const raw = pick(row, ["to'g'ri_javob", 'togri_javob', 'correct', 'javob', "to‘g‘ri_javob"]).toUpperCase();
            let correctIndex = -1;
            if (/^[A-F]$/.test(raw)) correctIndex = 'ABCDEF'.indexOf(raw);
            else if (/^\d+$/.test(raw)) correctIndex = Number(raw) - 1;

            if (correctIndex < 0 || correctIndex >= options.length) {
                results.errors.push(`${line}-qator: to'g'ri javob noto'g'ri ("${raw}")`);
                continue;
            }

            prepared.push({
                id: 'q_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + i,
                base_id: baseId,
                subject: (getDB().questionBases || []).find(b => b.id === baseId)?.title || '',
                difficulty: DIFFICULTY[pick(row, ['qiyinlik', 'difficulty']).toLowerCase()] || 'medium',
                data: {
                    text, options, correctIndex,
                    explanation: pick(row, ['izoh', 'explanation']),
                },
            });
        }

        if (prepared.length === 0) return results;

        // BITTA so'rov bilan yoziladi.
        //
        // Ilgari har savol uchun alohida `createTestQuestion` chaqirilardi -
        // 100 ta savol uchun 100 ta so'rov va 100 marta localStorage yozuvi.
        // Bu shunchalik sekin ediki, interfeys qotib qolgandek ko'rinardi va
        // foydalanuvchi "ishlamayapti" deb o'ylardi.
        const { error } = await supabase.from('test_questions').insert(prepared);
        if (error) throw error;

        const dbData = getDB();
        dbData.testQuestions = dbData.testQuestions || [];
        prepared.forEach(r => dbData.testQuestions.push({
            ...r.data, id: r.id, baseId: r.base_id, subject: r.subject, difficulty: r.difficulty,
        }));
        saveDB(dbData);

        results.added = prepared.length;
        return results;
    },

    // Shablon uchun namunaviy qatorlar - foydalanuvchi ustun nomlarini
    // taxmin qilib o'tirmasin.
    getQuestionTemplateRows: () => ([
        {
            savol: 'Asar muallifi kim?',
            variant_a: 'Abdulla Qodiriy',
            variant_b: 'Oybek',
            variant_c: "Cho'lpon",
            variant_d: "G'afur G'ulom",
            "to'g'ri_javob": 'A',
            qiyinlik: "o'rtacha",
            izoh: '',
        },
        {
            savol: 'Asar qaysi yilda yozilgan?',
            variant_a: '1918',
            variant_b: '1925',
            variant_c: '1930',
            variant_d: '1934',
            "to'g'ri_javob": 'B',
            qiyinlik: 'oson',
            izoh: '',
        },
    ]),

    updateTestQuestion: async (id, { text, options, correctIndex, difficulty, explanation }) => {
        const dbData = getDB();
        const current = (dbData.testQuestions || []).find(q => q.id === id);
        if (!current) throw new Error('Savol topilmadi');

        const clean = (options ?? current.options ?? []).map(o => String(o || '').trim()).filter(Boolean);
        if (clean.length < 2) throw new Error('Kamida 2 ta javob varianti kerak');
        const idx = correctIndex == null ? current.correctIndex : Number(correctIndex);
        if (idx < 0 || idx >= clean.length) throw new Error("To'g'ri javobni belgilang");
        if (!String(text ?? current.text ?? '').trim()) throw new Error('Savol matnini kiriting');

        const data = {
            text: String(text ?? current.text).trim(),
            options: clean,
            correctIndex: idx,
            explanation: explanation ?? current.explanation ?? '',
        };
        const { error } = await supabase.from('test_questions')
            .update({ difficulty: difficulty ?? current.difficulty, data }).eq('id', id);
        if (error) throw error;

        Object.assign(current, data, { difficulty: difficulty ?? current.difficulty });
        saveDB(dbData);
        return current;
    },

    deleteTestQuestion: async (id) => {
        const { error } = await supabase.from('test_questions').delete().eq('id', id);
        if (error) throw error;
        const dbData = getDB();
        dbData.testQuestions = (dbData.testQuestions || []).filter(q => q.id !== id);
        saveDB(dbData);
    },

    getTests: () => (getDB().tests || []),
    getTest: (id) => (getDB().tests || []).find(t => t.id === id) || null,

    // Stipendiyaning test bosqichida tanlash uchun: e'lon qilingan, faol testlar.
    getPublishedTests: () => (getDB().tests || []).filter(t => t.isPublished && t.status !== 'draft'),

    createTest: async (payload) => {
        const id = 'test_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const { title, subject, status = 'draft', isPublished = false, opensAt, closesAt, ...data } = payload;
        const { error } = await supabase.from('tests').insert({
            id, title, subject: subject || null, status, is_published: !!isPublished,
            opens_at: opensAt || null, closes_at: closesAt || null, data
        });
        if (error) throw error;
        const record = { ...data, id, title, subject, status, isPublished, opensAt, closesAt };
        const dbData = getDB();
        (dbData.tests = dbData.tests || []).push(record);
        saveDB(dbData);
        return record;
    },

    updateTest: async (testId, patch) => {
        const dbData = getDB();
        const current = (dbData.tests || []).find(t => t.id === testId);
        if (!current) throw new Error('Test topilmadi');
        const merged = { ...current, ...patch };
        const { id, title, subject, status, isPublished, opensAt, closesAt, createdAt, updatedAt, ...data } = merged;
        const { error } = await supabase.from('tests').update({
            title, subject: subject || null, status, is_published: !!isPublished,
            opens_at: opensAt || null, closes_at: closesAt || null,
            updated_at: new Date().toISOString(), data
        }).eq('id', testId);
        if (error) throw error;
        Object.assign(current, merged);
        saveDB(dbData);
        return current;
    },

    deleteTest: async (testId) => {
        const dbData = getDB();
        const attempts = (dbData.testAttempts || []).filter(a => a.testId === testId);
        if (attempts.length > 0) {
            throw new Error(`Bu testda ${attempts.length} ta natija bor - o'chirib bo'lmaydi. Uni yakunlang.`);
        }
        const { error } = await supabase.from('tests').delete().eq('id', testId);
        if (error) throw error;
        dbData.tests = (dbData.tests || []).filter(t => t.id !== testId);
        saveDB(dbData);
    },

    // --- Urinishlar (natijalar) ---
    getTestAttempts: (testId = null) =>
        (getDB().testAttempts || []).filter(a => !testId || a.testId === testId),

    // ----------------------------------------------------------------------
    // URINISHNING TO'LIQ TAFSILOTI
    //
    // Ro'yxatda faqat yakuniy raqam ko'rinadi ("18/20, 90%"). Bu yerda esa
    // urinishning ICHI: qaysi savolga qanday javob berilgan, qaysi variant
    // to'g'ri edi, har savolga qancha vaqt ketgan.
    //
    // NIMA YO'Q, SHUNDAY DEB QAYTADI:
    //   - `questionSeconds` eski urinishlarda yo'q (u keyin qo'shilgan) -
    //     `seconds: null` bo'ladi, nol emas.
    //   - `startedAt` yozilmagan bo'lsa umumiy vaqt ham `null`.
    // Yo'q ma'lumotni nol bilan to'ldirish "0 soniya sarfladi" degan
    // yolg'on bo'lardi.
    getAttemptDetail: (attemptId) => {
        const dbData = getDB();
        const attempt = (dbData.testAttempts || []).find(a => a.id === attemptId);
        if (!attempt) return null;

        const test = (dbData.tests || []).find(t => t.id === attempt.testId) || null;
        const student = generateMockStudents().find(s => s.id === attempt.studentId)
            || (dbData.realProfiles || []).find(p => p.id === attempt.studentId)
            || null;

        const answers = attempt.answers || {};
        const times = attempt.questionSeconds || {};
        const byId = new Map((dbData.testQuestions || []).map(q => [q.id, q]));

        // Savollar TALABA KO'RGAN tartibda: javoblar obyektidagi tartib
        // aynan shu. Bazadagi tartibga qaytarish talaba ko'rgan ketma-ketlikni
        // buzardi (savollar aralashtirilib beriladi).
        const questions = Object.keys(answers).map((questionId, index) => {
            const q = byId.get(questionId);
            const chosen = answers[questionId];
            const correctIndex = q ? Number(q.correctIndex) : null;
            const options = q?.options || [];
            return {
                index: index + 1,
                questionId,
                // Savol o'chirilgan bo'lishi mumkin - urinish tarixida qoladi.
                text: q?.text || "Savol o'chirilgan",
                exists: !!q,
                options,
                chosenIndex: chosen == null ? null : Number(chosen),
                chosenText: options[Number(chosen)]?.text ?? options[Number(chosen)] ?? null,
                correctIndex,
                correctText: correctIndex == null ? null
                    : (options[correctIndex]?.text ?? options[correctIndex] ?? null),
                isCorrect: q ? Number(chosen) === correctIndex : null,
                difficulty: q?.difficulty || null,
                seconds: times[questionId] ?? null,
            };
        });

        const answered = questions.filter(q => q.chosenIndex != null).length;
        const correct = questions.filter(q => q.isCorrect === true).length;
        const wrong = questions.filter(q => q.isCorrect === false).length;

        const totalSeconds = attempt.startedAt && attempt.finishedAt
            ? Math.max(0, Math.round(
                (new Date(attempt.finishedAt) - new Date(attempt.startedAt)) / 1000))
            : null;
        const measuredSeconds = questions.reduce(
            (sum, q) => (q.seconds == null ? sum : sum + q.seconds), 0);
        const hasQuestionTimes = questions.some(q => q.seconds != null);

        return {
            attempt, test, student, questions,
            summary: {
                total: questions.length,
                answered,
                // Javobsiz qolgan savollar - talaba ulgurmagan yoki tashlab
                // ketgan. Ular "noto'g'ri" bilan bir xil emas.
                unanswered: questions.length - answered,
                correct, wrong,
                percent: questions.length > 0 ? Math.round((correct / questions.length) * 100) : null,
                score: attempt.score, maxScore: attempt.maxScore,
                totalSeconds,
                hasQuestionTimes,
                measuredSeconds: hasQuestionTimes ? measuredSeconds : null,
                averageSeconds: hasQuestionTimes && questions.length > 0
                    ? Math.round(measuredSeconds / questions.length) : null,
                slowest: hasQuestionTimes
                    ? questions.filter(q => q.seconds != null)
                        .reduce((a, b) => (b.seconds > a.seconds ? b : a), { seconds: -1 })
                    : null,
            },
        };
    },

    getStudentTestAttempts: (studentId, testId = null) =>
        (getDB().testAttempts || []).filter(a =>
            a.studentId === studentId && (!testId || a.testId === testId)),

    // Talabaning shu testdagi ENG YAXSHI natijasi. Stipendiyaning test bosqichi
    // shu funksiyani chaqiradi - qayta topshirishga ruxsat berilsa ham reyting
    // aniq qoladi.
    getBestTestAttempt: (studentId, testId) => {
        const attempts = (getDB().testAttempts || []).filter(a =>
            a.studentId === studentId && a.testId === testId && a.finishedAt);
        if (attempts.length === 0) return null;
        return attempts.reduce((best, a) => (a.score > best.score ? a : best), attempts[0]);
    },

    // Test yakunlanganda chaqiriladi. Ball SERVER TOMONIDA emas, shu yerda
    // hisoblanadi (savollar mijozda ochilgani uchun) - bu ochiq soddalashtirish,
    // haqiqiy imtihon uchun keyinchalik Postgres funksiyasiga ko'chirilishi kerak.
    // `questionSeconds` - { savolId: sekund }. Har savolga sarflangan vaqt
    // TestRunner da yig'iladi va shu yerda urinish bilan birga saqlanadi.
    // Ilgari faqat testning umumiy vaqti bor edi, ya'ni "qaysi savol qiyin
    // bo'ldi" degan savolga javob yo'q edi. Eski urinishlarda bu maydon
    // bo'lmaydi va tahlilda `—` ko'rinadi - nol emas.
    submitTestAttempt: async ({ testId, studentId, answers = {}, startedAt = null, questionSeconds = null }) => {
        const dbData = getDB();
        const test = (dbData.tests || []).find(t => t.id === testId);
        if (!test) throw new Error('Test topilmadi');

        // Ochiq urinish bo'lsa - YANGISI yaratilmaydi, o'shanisi yopiladi.
        // Aks holda bitta topshirishdan ikkita yozuv qolardi.
        const open = db.getOpenAttempt(studentId, testId);
        if (open) {
            const questionIds = Object.keys(answers);
            const questions = (dbData.testQuestions || []).filter(q => questionIds.includes(q.id));
            const total = questions.length || questionIds.length;
            const correct = questions.filter(q => Number(answers[q.id]) === Number(q.correctIndex)).length;
            const maxScore = Number(test.maxScore) || total || 100;
            const score = total > 0 ? Math.round((correct / total) * maxScore * 100) / 100 : 0;
            const now = new Date().toISOString();

            const { error } = await supabase.from('test_attempts').update({
                score, max_score: maxScore, correct, total, finished_at: now,
                data: {
                    answers, startedAt: open.startedAt, academicYear: open.academicYear,
                    questionSeconds: questionSeconds || open.questionSeconds || null,
                },
            }).eq('id', open.id);
            if (error) throw error;

            Object.assign(open, {
                score, maxScore, correct, total, finishedAt: now, answers,
                questionSeconds: questionSeconds || open.questionSeconds || null,
            });
            saveDB(dbData);
            return open;
        }

        const questionIds = Object.keys(answers);
        const questions = (dbData.testQuestions || []).filter(q => questionIds.includes(q.id));
        const total = questions.length || questionIds.length;
        const correct = questions.filter(q => Number(answers[q.id]) === Number(q.correctIndex)).length;
        const maxScore = Number(test.maxScore) || total || 100;
        const score = total > 0 ? Math.round((correct / total) * maxScore * 100) / 100 : 0;

        const id = 'att_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const now = new Date().toISOString();
        // O'quv yili urinish paytida MUHRLANADI. Ijtimoiy faollik indeksi har
        // o'quv yili bo'yicha alohida hisoblanadi, keyin `finishedAt` dan
        // qayta hisoblash esa o'quv yili chegarasini (1-sentabr) har safar
        // qaytadan aniqlashni talab qilardi.
        const data = {
            answers, startedAt, academicYear: getCurrentAcademicYear(),
            questionSeconds: questionSeconds || null,
        };

        const { error } = await supabase.from('test_attempts').insert({
            id, test_id: testId, student_id: studentId,
            score, max_score: maxScore, correct, total, finished_at: now, data
        });
        if (error) throw error;

        const record = { ...data, id, testId, studentId, score, maxScore, correct, total, finishedAt: now };
        (dbData.testAttempts = dbData.testAttempts || []).push(record);
        saveDB(dbData);
        return record;
    },

    // Mock testlarni bir martalik ko'chirish - jadval BO'SH bo'lsagina ishlaydi.
    // Shu tufayli stipendiyaning test bosqichida darrov tanlanadigan test bo'ladi.
    seedTestsIfEmpty: async () => {
        const dbData = getDB();
        if ((dbData.tests || []).length > 0) return { seeded: 0, reason: 'already_has_data' };

        const bases = [
            'Konstitutsiya huquqi', 'Fuqarolik huquqi', 'Jinoyat huquqi',
            'Matematika', 'Sotsiologiya', 'Web Texnologiyalari',
        ].map((title, i) => ({ id: `qbase_seed_${i + 1}`, title, status: 'active', data: {} }));

        const tests = [
            { title: 'Matematika: Funksiyalar va limitlar', subject: 'Matematika', status: 'active', is_published: true, data: { time: 40, totalLimit: 20, type: 'single' } },
            { title: 'Konstitutsiya huquqi - Final', subject: 'Konstitutsiya huquqi', status: 'active', is_published: true, data: { time: 90, totalLimit: 50, type: 'single' } },
            { title: 'Ijtimoiy faollik asoslari', subject: 'Sotsiologiya', status: 'active', is_published: true, data: { time: 20, totalLimit: 15, type: 'single' } },
            { title: 'Dasturlash: React asoslari', subject: 'Web Texnologiyalari', status: 'active', is_published: true, data: { time: 60, totalLimit: 25, type: 'single' } },
        ].map((t, i) => ({ id: `test_seed_${i + 1}`, ...t }));

        const [{ error: baseErr }, { error: testErr }] = await Promise.all([
            supabase.from('question_bases').upsert(bases),
            supabase.from('tests').upsert(tests),
        ]);
        if (baseErr) throw baseErr;
        if (testErr) throw testErr;

        dbData.questionBases = bases.map(b => ({ ...b.data, id: b.id, title: b.title, status: b.status }));
        dbData.tests = tests.map(t => ({ ...t.data, id: t.id, title: t.title, subject: t.subject, status: t.status, isPublished: t.is_published }));
        saveDB(dbData);
        return { seeded: tests.length, reason: 'ok' };
    },

    // -----------------------------------------------------------------
    // ZANJIR (pipeline) — universal bosqich mexanizmi
    //
    // Bosqichlar endi qat'iy emas: har grant o'z zanjirini quradi (hujjat ko'rigi,
    // fakultet komissiyasi, test, suhbat, universitet komissiyasi, yakun).
    // Ariza `stageIndex` bilan zanjirning qaysi bosqichida turgani saqlanadi.
    // Eski `twoStage` grantlar resolvePipeline orqali avtomatik zanjirga
    // aylantiriladi - hech qanday ma'lumot migratsiyasi kerak emas.
    // -----------------------------------------------------------------

    getScholarshipPipeline: (grantId) => {
        const grant = (getDB().scholarshipGrants || []).find(g => g.id === grantId);
        return grant ? resolvePipeline(grant) : [];
    },

    // Monitoringning yagona manbai. Har bosqich uchun guruh(lar), reyting, kim
    // baholagan, kim o'tadi - hammasi shu yerdan.
    getScholarshipPipelineOverview: (grantId) => {
        const dbData = getDB();
        const grant = (dbData.scholarshipGrants || []).find(g => g.id === grantId);
        if (!grant) return [];
        return buildPipelineOverview(grant, buildApplicationRows(dbData, grant));
    },

    getScholarshipStageBreakdown: (grantId, stageIndex) => {
        const dbData = getDB();
        const grant = (dbData.scholarshipGrants || []).find(g => g.id === grantId);
        if (!grant) return null;
        const stage = resolvePipeline(grant)[stageIndex];
        if (!stage) return null;
        return buildStageBreakdown(grant, stage, stageIndex, buildApplicationRows(dbData, grant));
    },

    // Hujjat ko'rigi bosqichi: o'tkazish / tuzatishga qaytarish / chetlatish.
    // Qaytarilgan ariza ZANJIRDA O'Z O'RNIDA qoladi - talaba tuzatib qayta yuboradi,
    // boshqatdan boshlamaydi.
    reviewScholarshipDocuments: async (applicationId, { action, reviewer, comment = '' }) => {
        const dbData = getDB();
        const app = (dbData.scholarshipApplications || []).find(a => a.id === applicationId);
        if (!app) throw new Error('Ariza topilmadi');

        const grant = (dbData.scholarshipGrants || []).find(g => g.id === app.grantId);
        const stage = resolvePipeline(grant)[app.stageIndex ?? 0];
        if (!stage || stage.type !== 'document_review') {
            throw new Error("Bu ariza hujjat ko'rigi bosqichida emas");
        }
        // Qaytarilgan ariza TALABADA turadi, ko'rib chiquvchida emas.
        // Bosqich o'zgarmagani uchun yuqoridagi tekshiruv uni to'smasdi va
        // ko'rib chiquvchi talaba hech narsani tuzatmasa ham arizani keyingi
        // bosqichga o'tkazib yubora olardi. Qaytarishning o'zi esa ma'nosini
        // yo'qotardi. Faqat "qayta qaytarish" mumkin emas - u allaqachon
        // qaytarilgan.
        if (app.status === 'returned') {
            throw new Error(
                "Ariza talabaga tuzatish uchun qaytarilgan. Talaba tuzatib qayta "
                + "yuborgandan keyin qaror qabul qilish mumkin."
            );
        }
        if (!canActOnStage(dbData, app, stage, reviewer)) {
            throw new Error("Siz bu bosqichda qaror qabul qilishga biriktirilmagansiz");
        }

        const map = {
            pass: { status: 'evaluation', outcome: 'passed', text: "Hujjatlar tasdiqlandi" },
            return: { status: 'returned', outcome: 'returned', text: 'Tuzatish uchun qaytarildi' },
            eliminate: { status: 'not_advanced', outcome: 'eliminated', text: 'Hujjatlar talabga javob bermadi' },
        };
        const decision = map[action];
        if (!decision) throw new Error("Noma'lum amal");

        const now = new Date().toISOString();
        // "pass" - keyingi bosqichga siljitadi; qolgan ikkisi shu bosqichda qoldiradi.
        const nextIndex = action === 'pass' ? (app.stageIndex ?? 0) + 1 : (app.stageIndex ?? 0);
        const nextStage = resolvePipeline(grant)[nextIndex];
        const status = action === 'pass'
            ? (nextStage ? statusForStage(nextStage) : 'committee')
            : decision.status;

        await patchApplication(dbData, app, {
            status, stageIndex: nextIndex,
            stageResults: [...(app.stageResults || []), {
                stageId: stage.id, type: stage.type, label: stage.label,
                outcome: decision.outcome, at: now, by: reviewer,
            }],
            history: [...(app.history || []), {
                at: now, status, stageIndex: nextIndex, by: reviewer,
                comment: comment ? `${decision.text} - ${comment}` : decision.text,
            }],
            reviewComment: comment,
        });

        saveDB(dbData);
        return app;
    },

    // Test bosqichi balli. Test moduli hali o'z ma'lumot qatlamiga ega emas
    // (savollar ham natijalar ham komponent ichida), shuning uchun ball mas'ul
    // tomonidan kiritiladi. Test moduli real backendga ko'chganda faqat SHU
    // funksiya chaqiriladigan joy o'zgaradi, qolgan mexanizm tegilmaydi.
    setScholarshipTestScore: async (applicationId, { stageId, score, by }) => {
        const dbData = getDB();
        const app = (dbData.scholarshipApplications || []).find(a => a.id === applicationId);
        if (!app) throw new Error('Ariza topilmadi');

        const grant = (dbData.scholarshipGrants || []).find(g => g.id === app.grantId);
        const stage = resolvePipeline(grant)[app.stageIndex ?? 0];
        if (!stage || stage.type !== 'test') throw new Error('Bu ariza test bosqichida emas');
        if (!canActOnStage(dbData, app, stage, by)) {
            throw new Error('Siz bu bosqichda ball kiritishga biriktirilmagansiz');
        }

        const max = Number(stage.maxScore) || 100;
        const clean = Math.max(0, Math.min(max, Number(score) || 0));
        const now = new Date().toISOString();

        await patchApplication(dbData, app, {
            status: 'evaluation',
            testScores: { ...(app.testScores || {}), [stage.id]: clean },
            history: [...(app.history || []), {
                at: now, status: 'evaluation', stageIndex: app.stageIndex ?? 0, by,
                comment: `Test balli: ${clean} / ${max}`,
            }],
        });

        saveDB(dbData);
        await maybeAutoAdvance(dbData, grant, app.stageIndex ?? 0, app.faculty, stage);
        return clean;
    },

    // Zanjirdagi bitta bosqichdan keyingisiga o'tkazish.
    // `group` berilsa faqat shu guruh (fakultet), aks holda hammasi.
    advanceScholarshipPipeline: async (grantId, { stageIndex, group = null, by, force = false } = {}) => {
        const dbData = getDB();
        const grant = (dbData.scholarshipGrants || []).find(g => g.id === grantId);
        if (!grant) throw new Error('Grant topilmadi');

        const pipeline = resolvePipeline(grant);
        const stage = pipeline[stageIndex];
        if (!stage) throw new Error('Bosqich topilmadi');
        if (stage.type === 'final') throw new Error("Yakuniy bosqichdan keyin o'tkaziladigan bosqich yo'q");

        const breakdown = buildStageBreakdown(grant, stage, stageIndex, buildApplicationRows(dbData, grant));
        const groups = breakdown.groups.filter(g => !group || g.group === group);

        const notReady = groups.filter(g => !g.readyToAdvance);
        if (notReady.length > 0 && !force) {
            throw new Error(
                `Baholanmagan arizalar bor: ${notReady.map(g => `${g.group} (${g.pending} ta)`).join(', ')}.`
            );
        }

        const nextStage = pipeline[stageIndex + 1];
        const now = new Date().toISOString();
        let advanced = 0, dropped = 0;

        for (const g of groups) {
            for (const row of g.ranked) {
                const app = (dbData.scholarshipApplications || []).find(a => a.id === row.id);
                if (!app) continue;

                const up = row.wouldAdvance;
                const result = {
                    stageId: stage.id, type: stage.type, label: stage.label,
                    score: row.stageScore, rank: row.rank,
                    outcome: up ? 'passed' : 'eliminated', at: now, by: by || 'system',
                };

                await patchApplication(dbData, app, {
                    status: up
                        ? (nextStage ? statusForStage(nextStage) : 'committee')
                        : 'not_advanced',
                    stageIndex: up ? stageIndex + 1 : stageIndex,
                    stageResults: [...(app.stageResults || []), result],
                    history: [...(app.history || []), {
                        at: now, stageIndex: up ? stageIndex + 1 : stageIndex,
                        status: up ? 'evaluation' : 'not_advanced', by: by || 'system',
                        comment: up
                            ? `${stage.label}: ${row.rank}-o'rin (${row.stageScore ?? '—'} ball) - keyingi bosqichga o'tdi`
                            : `${stage.label}: ${row.rank}-o'rin - kvotaga (${g.quota || '∞'}) kirmadi`,
                    }],
                });
                up ? advanced++ : dropped++;
            }
        }

        saveDB(dbData);
        return { advanced, notAdvanced: dropped, stageLabel: stage.label, groups: groups.length };
    },

    // Yakuniy bosqich: g'olib va sovrindorlarni tasdiqlash.
    // `winnerIds` berilmasa oxirgi baholangan bosqich reytingi bo'yicha Top N olinadi.
    finalizeScholarshipGrant: async (grantId, { winnerIds = null, by } = {}) => {
        const dbData = getDB();
        const grant = (dbData.scholarshipGrants || []).find(g => g.id === grantId);
        if (!grant) throw new Error('Grant topilmadi');

        const pipeline = resolvePipeline(grant);
        const finalIndex = pipeline.findIndex(s => s.type === 'final');
        const finalStage = finalIndex >= 0 ? pipeline[finalIndex] : null;
        const winnersCount = Number(finalStage?.winners) || Number(grant.quota) || 1;

        const rows = buildApplicationRows(dbData, grant)
            .filter(a => !['rejected', 'withdrawn', 'not_advanced'].includes(a.status));

        // Yakuniy tartib: oxirgi ballangan bosqich natijasi bo'yicha.
        const lastScore = (a) => {
            const scored = (a.stageResults || []).filter(r => r.score !== null && r.score !== undefined);
            return scored.length ? scored[scored.length - 1].score : (a.autoScore || 0);
        };
        const ordered = [...rows].sort((a, b) => lastScore(b) - lastScore(a));
        const winners = new Set(winnerIds || ordered.slice(0, winnersCount).map(a => a.id));

        const now = new Date().toISOString();
        const cycleYear = Number(grant.cycleYear)
            || (grant.deadline ? new Date(grant.deadline).getFullYear() : new Date().getFullYear());

        let won = 0, lost = 0;
        for (const row of ordered) {
            const app = (dbData.scholarshipApplications || []).find(a => a.id === row.id);
            if (!app) continue;
            const isWinner = winners.has(app.id);
            const place = isWinner ? ordered.filter(o => winners.has(o.id)).findIndex(o => o.id === app.id) + 1 : null;

            await patchApplication(dbData, app, {
                status: isWinner ? 'approved' : 'not_advanced',
                cycleYear,
                finalPlace: place,
                finalScore: lastScore(row),
                stageResults: [...(app.stageResults || []), {
                    stageId: finalStage?.id || 'final', type: 'final',
                    label: finalStage?.label || 'Yakuniy bosqich',
                    score: lastScore(row), rank: place,
                    outcome: isWinner ? 'passed' : 'eliminated', at: now, by: by || 'admin',
                }],
                history: [...(app.history || []), {
                    at: now, status: isWinner ? 'approved' : 'not_advanced', by: by || 'admin',
                    comment: isWinner ? `G'olib deb tasdiqlandi (${place}-o'rin)` : 'Yakuniy bosqichdan o\'tmadi',
                }],
            });
            isWinner ? won++ : lost++;
        }

        // Grant o'zi ham yakunlanadi - bu tanlov sikli yopildi.
        await db.updateScholarshipGrant(grantId, { status: 'closed', cycleYear, finalizedAt: now });

        saveDB(dbData);
        return { winners: won, others: lost, cycleYear };
    },

    // NOMZODLAR ARXIVI. Har bir ariza - qaysi bosqichgacha borgani va nima bilan
    // tugagani bilan. G'oliblar alohida belgilanadi va joriy sikl yopilmaguncha
    // "shu yilgi stipendiantlar" sifatida ajratib ko'rsatiladi.
    getScholarshipArchive: ({ year = null, grantId = null, outcome = null, faculty = null } = {}) => {
        const dbData = getDB();
        const grants = new Map((dbData.scholarshipGrants || []).map(g => [g.id, g]));
        const students = new Map(generateMockStudents().map(s => [s.id, s]));

        return (dbData.scholarshipApplications || [])
            .map(a => {
                const grant = grants.get(a.grantId) || null;
                const pipeline = grant ? resolvePipeline(grant) : [];
                const reached = pipeline[a.stageIndex ?? 0] || null;
                const student = students.get(a.studentId) || null;
                const cycle = Number(a.cycleYear)
                    || (a.submittedAt ? new Date(a.submittedAt).getFullYear() : new Date().getFullYear());

                return {
                    ...a,
                    grant,
                    grantTitle: grant?.title || a.grantTitle || '—',
                    studentName: student?.fullName || a.studentId,
                    faculty: a.faculty || student?.faculty || "Noma'lum",
                    course: student?.course || null,
                    cycleYear: cycle,
                    reachedStageLabel: reached?.label || '—',
                    reachedStageIndex: a.stageIndex ?? 0,
                    totalStages: pipeline.length,
                    isWinner: a.status === 'approved',
                    outcome: a.status === 'approved' ? 'winner'
                        : a.status === 'withdrawn' ? 'withdrawn'
                            : ['not_advanced', 'rejected'].includes(a.status) ? 'eliminated'
                                : 'in_progress',
                };
            })
            .filter(r => (!year || r.cycleYear === Number(year))
                && (!grantId || r.grantId === grantId)
                && (!outcome || r.outcome === outcome)
                && (!faculty || r.faculty === faculty))
            .sort((a, b) => (b.cycleYear - a.cycleYear)
                || Number(b.isWinner) - Number(a.isWinner)
                || (b.reachedStageIndex - a.reachedStageIndex)
                || a.studentName.localeCompare(b.studentName));
    },

    // "Shu yilgi g'olib va sovrindor stipendiantlar" - keyingi sikl yakunlanmaguncha
    // shu ro'yxat amalda qoladi.
    getCurrentStipendiants: (year = new Date().getFullYear()) =>
        db.getScholarshipArchive({ year, outcome: 'winner' }),

    getScholarshipArchiveYears: () => {
        const years = new Set();
        (getDB().scholarshipApplications || []).forEach(a => {
            years.add(Number(a.cycleYear)
                || (a.submittedAt ? new Date(a.submittedAt).getFullYear() : new Date().getFullYear()));
        });
        return Array.from(years).sort((a, b) => b - a);
    },

    getScholarshipEvaluations: () => (getDB().scholarshipEvaluations || []),

    getEvaluationsForApplication: (applicationId) =>
        (getDB().scholarshipEvaluations || []).filter(e => e.applicationId === applicationId),

    getEvaluationsForGrant: (grantId) =>
        (getDB().scholarshipEvaluations || []).filter(e => e.grantId === grantId),

    // Bitta baholovchining bitta arizaga qo'ygan bahosi. Qayta baholasa mavjud yozuv
    // yangilanadi (Supabase tomonda unique indeks buni kafolatlaydi), yangi qator
    // qo'shilmaydi - shuning uchun o'rtacha ball buzilmaydi.
    // Baho endi ZANJIRDAGI BOSQICHGA tegishli: bitta nomzod fakultet komissiyasida
    // ham, suhbatda ham baholanadi va ular aralashib ketmaydi.
    saveScholarshipEvaluation: async (applicationId, { evaluatorId, evaluatorName, scores = {}, comment = '' }) => {
        const dbData = getDB();
        const app = (dbData.scholarshipApplications || []).find(a => a.id === applicationId);
        if (!app) throw new Error('Ariza topilmadi');
        if (['rejected', 'withdrawn', 'not_advanced', 'approved'].includes(app.status)) {
            throw new Error("Bu ariza bo'yicha qaror chiqarilgan");
        }

        const grant = (dbData.scholarshipGrants || []).find(g => g.id === app.grantId);
        const stageIndex = app.stageIndex ?? 0;
        const stage = resolvePipeline(grant)[stageIndex];
        if (!stage) throw new Error('Bosqich topilmadi');
        if (!getStageType(stage.type).scored) {
            throw new Error(`"${stage.label}" bosqichida ball qo'yilmaydi`);
        }
        if (!canActOnStage(dbData, app, stage, evaluatorId)) {
            throw new Error('Siz bu bosqichda baholashga biriktirilmagansiz');
        }

        // Ballar me'zon chegarasidan oshmasin - 25 lik me'zonga 100 qo'yib bo'lmasin.
        const criteria = stageCriteria(grant, stage);
        const clean = {};
        let total = 0;
        criteria.forEach(c => {
            const raw = Number(scores[c.key]);
            const max = Number(c.max) || 0;
            const value = Number.isFinite(raw) ? Math.max(0, Math.min(max, raw)) : 0;
            clean[c.key] = value;
            total += value;
        });

        const now = new Date().toISOString();
        const existing = (dbData.scholarshipEvaluations || []).find(e =>
            e.applicationId === applicationId && e.evaluatorId === evaluatorId
            && (e.stageId || 'faculty') === stage.id);
        const id = existing?.id || 'scheval_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        const data = { evaluatorName: evaluatorName || evaluatorId, scores: clean, comment, updatedAt: now };

        const { error } = await supabase.from('scholarship_evaluations').upsert({
            id, application_id: applicationId, grant_id: app.grantId, stage_id: stage.id,
            evaluator_id: evaluatorId, total, updated_at: now, data
        }, { onConflict: 'application_id,evaluator_id,stage_id' });
        if (error) throw error;

        if (!dbData.scholarshipEvaluations) dbData.scholarshipEvaluations = [];
        if (existing) Object.assign(existing, data, { total });
        else dbData.scholarshipEvaluations.push({
            ...data, id, applicationId, grantId: app.grantId, stageId: stage.id,
            evaluatorId, total, createdAt: now
        });

        // Birinchi baho tushishi bilan holat "Baholanmoqda" ga o'tadi - monitoringda
        // jarayon boshlangani darrov ko'rinsin.
        if (app.status !== 'evaluation') {
            await patchApplication(dbData, app, {
                status: 'evaluation',
                history: [...(app.history || []), {
                    at: now, status: 'evaluation', stageIndex, by: evaluatorId,
                    comment: `${stage.label}: baholash boshlandi`,
                }],
            });
        }

        saveDB(dbData);

        // Guruh to'liq baholangan bo'lsa tizim keyingi bosqichga o'zi o'tkazadi.
        const autoAdvanced = await maybeAutoAdvance(dbData, grant, stageIndex, app.faculty, stage);
        if (autoAdvanced) saveDB(dbData);

        return { id, total, scores: clean, autoAdvanced, stageLabel: stage.label };
    },

    // Eski ikki bosqichli funksiyalar (getScholarshipFacultyBreakdown / advanceScholarshipStage)
    // olib tashlandi: ularning o'rnini zanjir modeli egalladi. Eski grantlar yo'qolmaydi -
    // resolvePipeline ularni avtomatik zanjirga aylantiradi, shuning uchun bitta mexanizm
    // qoldi (ikkita raqobatlashuvchi yo'l bug manbai bo'lardi).

    // Tuzatishga qaytarilgan arizani talaba tuzatib qayta yuboradi. Zanjirdagi
    // o'rni saqlanadi - boshqatdan boshlamaydi, o'sha hujjat ko'rigiga qaytadi.
    resubmitScholarshipApplication: async (applicationId, studentId, { declared, attachedDocumentIds, uploadedDocs, note } = {}) => {
        const dbData = getDB();
        const app = (dbData.scholarshipApplications || []).find(a => a.id === applicationId);
        if (!app) throw new Error('Ariza topilmadi');
        if (app.studentId !== studentId) throw new Error('Bu ariza sizga tegishli emas');
        if (app.status !== 'returned') throw new Error('Bu ariza tuzatishga qaytarilmagan');

        const now = new Date().toISOString();
        await patchApplication(dbData, app, {
            status: 'doc_check',
            declared: declared ?? app.declared,
            attachedDocumentIds: attachedDocumentIds ?? app.attachedDocumentIds,
            uploadedDocs: uploadedDocs ?? app.uploadedDocs,
            note: note ?? app.note,
            history: [...(app.history || []), {
                at: now, status: 'doc_check', stageIndex: app.stageIndex ?? 0, by: studentId,
                comment: 'Talaba hujjatlarni tuzatib qayta yubordi',
            }],
        });
        saveDB(dbData);
        return app;
    },

    // --- Sozlamalar (me'zonlar katalogi + hujjat turlari) ---
    // Avval oddiy useState edi: admin yangi me'zon qo'shsa, sahifa yangilanishi bilan
    // yo'qolardi. Endi bitta 'default' qatorda, butun platforma uchun.
    getScholarshipSettings: () => {
        const stored = getDB().scholarshipSettings || {};
        return {
            // Katalogdagi standart me'zonlar HAR DOIM bor - admin faqat qo'shimcha
            // (custom) me'zon qo'shadi. Shunday qilinmasa avtomatik hisoblash
            // buziladi, chunki `scholarshipEligibility.js` shu kalitlarga tayanadi.
            customCriteria: stored.customCriteria || [],
            docTypes: stored.docTypes || DEFAULT_DOC_TYPES,
            // Fakultet komissiyasi: [{ faculty, username, fullName }]. Vakolat manbai
            // shu biriktiruv - platformada hali "dekan" roli yo'q.
            facultyEvaluators: stored.facultyEvaluators || [],
            // Markaziy komissiya: fakultetga bog'liq bo'lmagan bosqichlar (universitet
            // komissiyasi, test, suhbat, yakun) uchun.
            centralEvaluators: stored.centralEvaluators || [],
        };
    },

    // Shu foydalanuvchi qaysi fakultetlarni baholashga biriktirilgan.
    getMyEvaluatorFaculties: (username) =>
        ((getDB().scholarshipSettings || {}).facultyEvaluators || [])
            .filter(e => e.username === username)
            .map(e => e.faculty),

    isCentralEvaluator: (username) =>
        ((getDB().scholarshipSettings || {}).centralEvaluators || [])
            .some(e => e.username === username),

    // Baholash paneli shu foydalanuvchiga umuman kerakmi.
    isScholarshipEvaluator: (username) => {
        const s = getDB().scholarshipSettings || {};
        return (s.facultyEvaluators || []).some(e => e.username === username)
            || (s.centralEvaluators || []).some(e => e.username === username);
    },

    // Standart katalog + adminning qo'shgan me'zonlari, bitta ro'yxat sifatida.
    getScholarshipCriteria: () => {
        const custom = (getDB().scholarshipSettings || {}).customCriteria || [];
        return [...CRITERIA_CATALOG, ...custom];
    },

    saveScholarshipSettings: async (patch) => {
        const dbData = getDB();
        const current = dbData.scholarshipSettings || {};
        const next = { ...current, ...patch };
        const { error } = await supabase.from('scholarship_settings')
            .upsert({ id: 'default', data: next, updated_at: new Date().toISOString() });
        if (error) throw error;
        dbData.scholarshipSettings = next;
        saveDB(dbData);
        return next;
    },

    // Eski localStorage['uni_grants'] dan bir martalik ko'chirish. Supabase'dagi jadval
    // BO'SH bo'lsagina ishlaydi - ya'ni takror chaqirilsa hech narsa qilmaydi va real
    // ma'lumot ustiga yozilmaydi. Admin stipendiya sahifasini birinchi ochganda chaqiriladi.
    migrateLegacyScholarshipGrants: async () => {
        const dbData = getDB();
        if ((dbData.scholarshipGrants || []).length > 0) return { migrated: 0, reason: 'already_has_data' };

        let legacy = [];
        try {
            legacy = JSON.parse(localStorage.getItem('uni_grants') || '[]');
        } catch { return { migrated: 0, reason: 'parse_error' }; }
        if (!Array.isArray(legacy) || legacy.length === 0) return { migrated: 0, reason: 'nothing_to_migrate' };

        // Ko'chiradigan narsa BOR - demak seans yo'qligi jimgina o'tib ketmasligi kerak,
        // aks holda eski grantlar "ko'chdi" deb o'ylanadi-yu, aslida yo'qoladi.
        await assertAuthenticated();

        const rows = legacy.map((g, i) => {
            const id = 'grant_legacy_' + (g.id ?? i);
            const { id: _i, title, status, deadline, ...rest } = g;
            return {
                id,
                title: title || 'Nomsiz grant',
                status: normalizeGrantStatus(status),
                deadline: deadline || null,
                data: { ...rest, migratedFrom: 'localStorage:uni_grants' }
            };
        });

        const { error } = await supabase.from('scholarship_grants').upsert(rows);
        if (error) throw error;

        dbData.scholarshipGrants = rows.map(r => ({ ...r.data, id: r.id, title: r.title, status: r.status, deadline: r.deadline }));
        saveDB(dbData);
        return { migrated: rows.length, reason: 'ok' };
    },

    // REGISTRATION APPROVAL - finishes the `approvalRequired`/`approvalStatus` fields registerForActivity
    // already writes (event/competition "Tasdiqlash talab etiladi" checkbox) but that nothing previously
    // ever read back. Deliberately minimal: only resolves `approvalStatus` itself, does NOT touch the
    // registration's own `status`/roster/waitlist - the participant stays wherever registerForActivity
    // already placed them (registered/waitlisted). Rejecting here is a recorded admin decision, not an
    // automatic removal - a disclosed simplification, same idiom as this file's other "additive, not a
    // full subsystem" notes, since a real reject-and-free-the-seat flow would need to reach into
    // capacity/waitlist-promotion logic this pass doesn't touch.
    getPendingRegistrationApprovals: () => (getDB().registrations || []).filter(r => r.approvalStatus === 'pending'),
    // ASYNC: `registrations` har sinxronlashda serverdan qayta o'qiladi,
    // shuning uchun faqat brauzerda qo'yilgan tasdiq keyingi sinxronlashda
    // jimgina yo'qolardi va ariza yana "kutilmoqda" ga qaytardi.
    reviewRegistrationApproval: async ({ registrationId, action, reviewerUserId, comment = '' }) => {
        const dbData = getDB();
        const reg = (dbData.registrations || []).find(r => r.id === registrationId);
        if (!reg) throw new Error("Ro'yxatdan o'tish topilmadi");
        const patch = {
            approvalStatus: action === 'approve' ? 'approved' : 'rejected',
            approvalReviewedBy: reviewerUserId,
            approvalReviewedAt: new Date().toISOString(),
            approvalComment: comment
        };
        const saved = await updateRegistrationInSupabase(registrationId, patch);
        Object.assign(reg, patch);
        saveDB(dbData);
        return saved || reg;
    },

    // Cross-club queue of position applications actually ready for the admin's final word - i.e. the
    // coordinator stage is already done (reviewedBy set) and status is still PENDING. Applications still
    // waiting on the coordinator (no reviewedBy yet) are deliberately excluded - those aren't an admin
    // action yet, same distinction PositionApplicationReviewPanel.jsx's own UI already makes.
    getAdminPendingPositionApplications: () => {
        const dbData = getDB();
        const clubById = new Map((dbData.clubs || []).map(c => [c.id, c]));
        const positionById = new Map((dbData.clubPositions || []).map(p => [p.id, p]));
        return (dbData.clubPositionApplications || [])
            .filter(a => a.status === POSITION_APPLICATION_STATUS.PENDING && a.reviewedBy)
            .map(a => ({
                ...a,
                club: clubById.get(a.clubId),
                position: positionById.get(a.positionId)
            }));
    },

    getSocialAuditLogs: (applicationId) =>
        (getDB().socialActivityAuditLogs || [])
            .filter(log => log.applicationId === applicationId)
            .sort((a, b) => new Date(b.time) - new Date(a.time)),
    getAllSocialAuditLogs: () =>
        (getDB().socialActivityAuditLogs || [])
            .slice()
            .sort((a, b) => new Date(b.time) - new Date(a.time)),
    getSocialPointsHistory: () =>
        (getDB().socialActivityApplications || [])
            .filter(a => a.status === SOCIAL_APPLICATION_STATUS.APPROVED && a.pointsAwarded != null)
            .map(a => ({
                applicationId: a.id,
                studentId: a.studentId,
                studentFullName: a.studentFullName,
                source: a.activityTitle,
                criteriaKey: a.criteriaKey,
                points: a.pointsAwarded,
                date: a.reviewedAt,
                approver: a.reviewedBy,
                scoringSourceCode: a.scoringSourceCode || null
            }))
            .sort((a, b) => new Date(b.date) - new Date(a.date)),

    // CONFIGURABLE SCORING SOURCES (Settings -> Ijtimoiy faollik -> Ball manbalari)
    getScoringSources: () => getDB().scoringSources || [],
    getScoringSourceById: (id) => (getDB().scoringSources || []).find(s => s.id === id),
    createScoringSource: async (data) => {
        const dbData = getDB();
        if (!dbData.scoringSources) dbData.scoringSources = [];
        const timestamp = new Date().toISOString();
        const newSource = {
            id: 'ssrc_' + Date.now().toString(),
            isActive: true,
            isArchived: false,
            ...data,
            points: Number(data.points),
            createdAt: timestamp,
            updatedAt: timestamp
        };
        dbData.scoringSources.push(newSource);
        await persistScoringSource(newSource);
        saveDB(dbData);
        return newSource;
    },
    updateScoringSource: async (id, updates) => {
        const dbData = getDB();
        if (!dbData.scoringSources) dbData.scoringSources = [];
        const idx = dbData.scoringSources.findIndex(s => s.id === id);
        if (idx === -1) return null;
        dbData.scoringSources[idx] = {
            ...dbData.scoringSources[idx],
            ...updates,
            points: updates.points != null ? Number(updates.points) : dbData.scoringSources[idx].points,
            updatedAt: new Date().toISOString()
        };
        await persistScoringSource(dbData.scoringSources[idx]);
        saveDB(dbData);
        return dbData.scoringSources[idx];
    },
    duplicateScoringSource: async (id) => {
        const dbData = getDB();
        if (!dbData.scoringSources) dbData.scoringSources = [];
        const source = dbData.scoringSources.find(s => s.id === id);
        if (!source) return null;
        const timestamp = new Date().toISOString();
        const copy = {
            ...source,
            id: 'ssrc_' + Date.now().toString(),
            name: `${source.name} (nusxa)`,
            code: `${source.code}-COPY`,
            isActive: false,
            isArchived: false,
            createdAt: timestamp,
            updatedAt: timestamp
        };
        dbData.scoringSources.push(copy);
        await persistScoringSource(copy);
        saveDB(dbData);
        return copy;
    },
    archiveScoringSource: (id) => db.updateScoringSource(id, { isArchived: true, isActive: false }),
    restoreScoringSource: (id) => db.updateScoringSource(id, { isArchived: false }),
    findActiveScoringSourceForApplication: (application) => findActiveScoringSourceInternal(getDB(), application),

    // IJTIMOIY FAOLLIK KATEGORIYALARI (Settings -> Ijtimoiy faollik) - dynamic replacement for the
    // SOCIAL_ACTIVITY_CRITERIA constant, same CRUD shape as scoringSources above so the two management
    // screens feel consistent. `key` mirrors the original constant's key (e.g. 'READING') so every
    // existing criteriaKey-based lookup elsewhere in the app keeps working unchanged during migration.
    getSocialCriteriaCategories: () => getDB().socialCriteriaCategories || [],
    getSocialCriteriaCategoryById: (id) => (getDB().socialCriteriaCategories || []).find(c => c.id === id),
    createSocialCriteriaCategory: async (data) => {
        const dbData = getDB();
        if (!dbData.socialCriteriaCategories) dbData.socialCriteriaCategories = [];
        const timestamp = new Date().toISOString();
        const newCategory = {
            id: 'scat_' + Date.now().toString(),
            isActive: true,
            isArchived: false,
            ...data,
            maxPoints: Number(data.maxPoints) || 0,
            createdAt: timestamp,
            updatedAt: timestamp
        };
        dbData.socialCriteriaCategories.push(newCategory);
        await persistCriteriaCategory(newCategory);
        saveDB(dbData);
        return newCategory;
    },
    updateSocialCriteriaCategory: async (id, updates) => {
        const dbData = getDB();
        if (!dbData.socialCriteriaCategories) dbData.socialCriteriaCategories = [];
        const idx = dbData.socialCriteriaCategories.findIndex(c => c.id === id);
        if (idx === -1) return null;
        dbData.socialCriteriaCategories[idx] = {
            ...dbData.socialCriteriaCategories[idx],
            ...updates,
            maxPoints: updates.maxPoints != null ? Number(updates.maxPoints) : dbData.socialCriteriaCategories[idx].maxPoints,
            updatedAt: new Date().toISOString()
        };
        await persistCriteriaCategory(dbData.socialCriteriaCategories[idx]);
        saveDB(dbData);
        return dbData.socialCriteriaCategories[idx];
    },
    archiveSocialCriteriaCategory: (id) => db.updateSocialCriteriaCategory(id, { isArchived: true, isActive: false }),
    restoreSocialCriteriaCategory: (id) => db.updateSocialCriteriaCategory(id, { isArchived: false }),

    // IJTIMOIY FAOLLIK SUB-KATEGORIYALARI - har biri bitta kategoriyaga (categoryId) bog'langan. Hisoblash
    // usuli 'manual' bo'lsa reviewerRole (SOCIAL_REVIEWER_ROLES) kim tasdiqlashini belgilaydi; 'automatic'
    // bo'lsa automaticSourceKey (SOCIAL_AUTOMATIC_SOURCES) qaysi real ma'lumotdan hisoblanishini belgilaydi
    // - bu bosqichda faqat sozlama sifatida saqlanadi, real hisoblash keyingi bosqichda ulanadi.
    getSocialCriteriaSubcategories: (categoryId = null) =>
        (getDB().socialCriteriaSubcategories || []).filter(s => !categoryId || s.categoryId === categoryId),
    getSocialCriteriaSubcategoryById: (id) => (getDB().socialCriteriaSubcategories || []).find(s => s.id === id),
    createSocialCriteriaSubcategory: async (data) => {
        const dbData = getDB();
        if (!dbData.socialCriteriaSubcategories) dbData.socialCriteriaSubcategories = [];
        const timestamp = new Date().toISOString();
        const newSubcategory = {
            id: 'ssub_' + Date.now().toString(),
            calculationMethod: 'manual',
            reviewerRole: null,
            automaticSourceKey: null,
            isActive: true,
            isArchived: false,
            ...data,
            createdAt: timestamp,
            updatedAt: timestamp
        };
        dbData.socialCriteriaSubcategories.push(newSubcategory);
        await persistCriteriaSubcategory(newSubcategory);
        saveDB(dbData);
        return newSubcategory;
    },
    updateSocialCriteriaSubcategory: async (id, updates) => {
        const dbData = getDB();
        if (!dbData.socialCriteriaSubcategories) dbData.socialCriteriaSubcategories = [];
        const idx = dbData.socialCriteriaSubcategories.findIndex(s => s.id === id);
        if (idx === -1) return null;
        dbData.socialCriteriaSubcategories[idx] = {
            ...dbData.socialCriteriaSubcategories[idx],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        await persistCriteriaSubcategory(dbData.socialCriteriaSubcategories[idx]);
        saveDB(dbData);
        return dbData.socialCriteriaSubcategories[idx];
    },
    archiveSocialCriteriaSubcategory: (id) => db.updateSocialCriteriaSubcategory(id, { isArchived: true, isActive: false }),
    restoreSocialCriteriaSubcategory: (id) => db.updateSocialCriteriaSubcategory(id, { isArchived: false }),

    // Real automatic points for ONE 'automatic' sub-kategoriya - currently only 'club_attendance' is
    // actually wired (SOCIAL_AUTOMATIC_SOURCES.isReal), computed from real db.activityAttendance
    // 'present' rows this year, deduped per real club-owned event/competition (never Math.random(), never
    // a stored/mutated ledger entry - pure live read, so it's always in sync and never double-counted).
    // Self-contained (doesn't import utils/rankingsAnalytics.js, which itself imports db.js, to avoid a
    // circular import) - mirrors that file's own needsAttendanceProof/resolveClubId logic narrowly for
    // just this one source. Any other automaticSourceKey (or a source not yet marked isReal) returns
    // value:null/isWired:false - disclosed, not faked.
    computeAutomaticSocialPoints: (studentId, subcategoryId) => {
        const dbData = getDB();
        const subcategory = (dbData.socialCriteriaSubcategories || []).find(s => s.id === subcategoryId);
        if (!subcategory || subcategory.calculationMethod !== 'automatic') return null;
        const category = (dbData.socialCriteriaCategories || []).find(c => c.id === subcategory.categoryId);
        const maxPoints = category?.maxPoints ?? 0;
        const sourceDef = SOCIAL_AUTOMATIC_SOURCES.find(s => s.key === subcategory.automaticSourceKey);

        if (subcategory.automaticSourceKey === 'club_attendance' && sourceDef?.isReal) {
            const eventsById = new Map(db.getEvents().map(e => [e.id, e]));
            const competitionsById = new Map(db.getCompetitions().map(c => [c.id, c]));
            const currentYear = new Date().getFullYear();
            const attendedClubActivities = new Set();
            db.getAttendanceForParticipant(studentId)
                .filter(a => a.status === 'present')
                .forEach(a => {
                    const activity = a.activityType === 'competition' ? competitionsById.get(a.activityId) : eventsById.get(a.activityId);
                    if (!activity) return;
                    const dateStr = a.activityType === 'competition' ? db.combineDateTime(activity.startDate, activity.startTime) : activity.date;
                    if (!dateStr || new Date(dateStr).getFullYear() !== currentYear) return;
                    const clubId = a.activityType === 'competition' ? (activity.contextType === 'club' ? activity.contextId : null) : activity.clubId;
                    if (!clubId) return;
                    attendedClubActivities.add(`${a.activityType}_${a.activityId}`);
                });
            const rawCount = attendedClubActivities.size;
            return { subcategoryId, subcategoryName: subcategory.name, categoryName: category?.name, value: Math.min(maxPoints, rawCount), rawCount, maxPoints, isWired: true };
        }

        // Real per-competition placement (db.getLeaderboard's own `rank`, real computed score - same
        // number every Reyting/Natijalar tab already shows) for every competition the student genuinely
        // took part in this year, individually or as a real team roster member (db.getTeamMembers).
        // Tiered by RANK, not by "Xalqaro/Respublika/Viloyat" level - the platform has no such level field
        // on a competition to key off, so this is the closest real signal available; 1-o'rin=5, 2-o'rin=3,
        // 3-o'rin=2, boshqa/ishtirok=1 ball per competition, summed and capped at the category's maxPoints.
        if (subcategory.automaticSourceKey === 'competition_results' && sourceDef?.isReal) {
            const currentYear = new Date().getFullYear();
            const rankPoints = (rank) => (rank === 1 ? 5 : rank === 2 ? 3 : rank === 3 ? 2 : 1);
            let rawPoints = 0;
            let competitionsCounted = 0;
            db.getCompetitions().forEach(comp => {
                const compDateStr = db.combineDateTime(comp.startDate, comp.startTime);
                if (!compDateStr || new Date(compDateStr).getFullYear() !== currentYear) return;
                const isIndividual = comp.type !== 'team';
                const isParticipant = isIndividual
                    ? (comp.participants || []).some(p => p.id === studentId)
                    : (comp.participants || []).some(p => db.getTeamMembers(p.id).some(m => m.userId === studentId));
                if (!isParticipant) return;
                const leaderboard = db.getLeaderboard(comp.id);
                const row = isIndividual
                    ? leaderboard.find(r => r.participant.id === studentId)
                    : leaderboard.find(r => db.getTeamMembers(r.participant.id).some(m => m.userId === studentId));
                if (!row) return;
                rawPoints += rankPoints(row.rank);
                competitionsCounted += 1;
            });
            return { subcategoryId, subcategoryName: subcategory.name, categoryName: category?.name, value: Math.min(maxPoints, rawPoints), rawCount: competitionsCounted, maxPoints, isWired: true };
        }

        // Real distinct club count from db.getUserMemberships - currently DORMANT (SOCIAL_AUTOMATIC_SOURCES
        // marks club_membership isReal:false, so `sourceDef?.isReal` below is false and this branch never
        // runs): many clubs on this platform (Munozara/Zakovat/Moot Court/Vokal/Raqs...) engage students
        // primarily via real competition/event REGISTRATION, not persistent `memberships` rows - raw
        // membership count would silently under-report a genuinely active student there. Kept here,
        // un-deleted, as the starting point for a future registration+attendance-aware formula (closer to
        // getStudentAttendanceParticipationSummary's own broader "real participation" union) rather than
        // rewritten from scratch once that redesign happens.
        if (subcategory.automaticSourceKey === 'club_membership' && sourceDef?.isReal) {
            const distinctClubIds = new Set(db.getUserMemberships(studentId).map(m => m.clubId));
            const rawCount = distinctClubIds.size;
            return { subcategoryId, subcategoryName: subcategory.name, categoryName: category?.name, value: Math.min(maxPoints, rawCount), rawCount, maxPoints, isWired: true };
        }

        return { subcategoryId, subcategoryName: subcategory.name, categoryName: category?.name, value: null, rawCount: null, maxPoints, isWired: false, sourceLabel: sourceDef?.label };
    },
    // Every 'automatic' sub-kategoriya's result for one student at once - feeds the "Avtomatik hisoblangan
    // ballar" section (SocialActivityIndex.jsx) without the caller needing to know which subcategories
    // exist or which ones are actually wired.
    getAutomaticSocialPointsForStudent: (studentId) => {
        const dbData = getDB();
        return (dbData.socialCriteriaSubcategories || [])
            .filter(s => s.calculationMethod === 'automatic' && s.isActive && !s.isArchived)
            .map(s => db.computeAutomaticSocialPoints(studentId, s.id));
    },
    getSocialScoreTransactions: (studentId) =>
        (getDB().socialScoreTransactions || [])
            .filter(t => !studentId || t.studentId === studentId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    getStudentSocialScoreTotal: (studentId) =>
        (getDB().socialScoreTransactions || [])
            .filter(t => t.studentId === studentId)
            .reduce((sum, t) => sum + (t.points || 0), 0),

    // O'tkazilish joyi picklist (Sozlamalar -> Joylar) - platform-wide, admin-managed. Plain mock list,
    // same convention as competitionScoringGroups etc. - not yet on the real Supabase backend.
    getVenues: () => (getDB().venues || []).sort((a, b) => a.building.localeCompare(b.building) || a.room.localeCompare(b.room)),
    // `capacity` - necha kishi sig'adi. IXTIYORIY va ataylab shunday:
    // ko'p xonaning sig'imi rasmiy hujjatda yozilmagan, taxmin qilib
    // yozilgan raqam esa "150 kishilik" deb ishonib, 80 kishi sig'adigan
    // xonaga tadbir qo'yishga olib kelardi. Bo'sh qolsa "ko'rsatilmagan".
    //
    // `equipment` - tayyor ro'yxatdan kalitlar (config/venueEquipment.js),
    // `equipmentNote` esa ro'yxatga tushmagan narsalar uchun erkin matn.
    createVenue: async (building, room, { capacity = null, equipment = [], equipmentNote = '' } = {}) => {
        const id = 'venue_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
        const data = {
            building: building.trim(), room: room.trim(),
            label: `${building.trim()}, ${room.trim()}`,
            capacity: capacity === '' || capacity == null ? null : Math.max(1, Number(capacity)),
            equipment: normalizeEquipment(equipment),
            equipmentNote: String(equipmentNote || '').trim(),
        };
        const { error } = await supabase.from('venues').insert({ id, data });
        if (error) throw error;
        await syncCoreDataFromSupabase();
        return { ...data, id };
    },

    // Mavjud joyni tahrirlash. Sig'im va jihozlar keyin qo'shilgan, ya'ni
    // eski yozuvlarda ular yo'q - ularni qaytadan yaratmasdan to'ldirish
    // mumkin bo'lishi kerak.
    updateVenue: async (id, { building, room, capacity, equipment, equipmentNote } = {}) => {
        const current = (getDB().venues || []).find(v => v.id === id);
        if (!current) throw new Error('Joy topilmadi');

        const nextBuilding = building === undefined ? current.building : String(building).trim();
        const nextRoom = room === undefined ? current.room : String(room).trim();
        const data = {
            building: nextBuilding, room: nextRoom,
            label: `${nextBuilding}, ${nextRoom}`,
            capacity: capacity === undefined
                ? (current.capacity ?? null)
                : (capacity === '' || capacity == null ? null : Math.max(1, Number(capacity))),
            equipment: equipment === undefined
                ? (current.equipment || [])
                : normalizeEquipment(equipment),
            equipmentNote: equipmentNote === undefined
                ? (current.equipmentNote || '')
                : String(equipmentNote || '').trim(),
        };

        const { error } = await supabase.from('venues').update({ data }).eq('id', id);
        if (error) throw error;
        await syncCoreDataFromSupabase();
        return { ...data, id };
    },
    deleteVenue: async (id) => {
        const { error } = await supabase.from('venues').delete().eq('id', id);
        if (error) throw error;
        await syncCoreDataFromSupabase();
    },

    // Every booking of a real venue in [fromDate, toDate], for the room-occupancy calendar. Events and
    // competitions are merged into ONE shape because a room doesn't care which of the two is sitting in
    // it — the calendar only needs "what occupies this room, when, and is it approved yet".
    // `location` is matched by the venue's own label string, which is exactly what both the tournament
    // wizard and the event form now store (see TournamentBasicStep/EventEditForm's venue select).
    // Returns [{ id, kind, title, clubId, venueLabel, start, end, moderationStatus }].
    getVenueBookings: (fromDate, toDate) => {
        const from = new Date(fromDate);
        const to = new Date(toDate);
        return collectVenueOccupancy(getDB())
            .filter(o => o.start >= from && o.start <= to)
            .sort((a, b) => a.start - b.start);
    },

    // Kalendar uchun YAGONA ro'yxat: tadbirlar + musobaqalar + Turlar.
    //
    // Ilgari Tadbirlar kalendari faqat `events` ni o'qirdi, Xonalar bandligi esa
    // uchala manbani. Natijada ikki tab bir xil savolga ikki xil javob berardi:
    //   - Musobaqa Turi (o'z kuni, vaqti va xonasi bor haqiqiy voqea) kalendarda
    //     umuman ko'rinmasdi.
    //   - Musobaqa kalendarga o'zi emas, yaratilishda tayyorlangan tadbir NUSXASI
    //     orqali chiqardi - va nusxa faqat "joyi bor YOKI ro'yxat talab qilinadi"
    //     shartida yaratilardi. Ikkalasi ham yo'q musobaqa ikkala tabda ham
    //     ko'rinmasdi.
    //
    // Endi manba bitta. Nusxa o'tkazib yuboriladi (xuddi collectVenueOccupancy
    // dagidek) - musobaqaning O'ZI ko'rsatiladi, uning ma'lumoti har doim joriy.
    getCalendarEntries: () => {
        const dbData = getDB();
        const entries = [];

        (dbData.events || []).forEach(e => {
            if (e.linkedCompetitionId || !e.date) return;
            entries.push({
                key: `event-${e.id}`, kind: 'event', id: e.id,
                title: e.title, date: e.date, endTime: e.endTime || null,
                location: e.location || null, clubId: e.clubId,
                status: e.status || 'upcoming',
                moderationStatus: e.moderationStatus || 'approved',
            });
        });

        (dbData.competitions || []).forEach(c => {
            if (!c.startDate) return;
            entries.push({
                key: `competition-${c.id}`, kind: 'competition', id: c.id,
                title: c.name, date: combineDateTime(c.startDate, c.startTime),
                endTime: c.endTime || null,
                location: c.location || null,
                clubId: c.contextType === 'club' ? c.contextId : null,
                status: 'upcoming',
                moderationStatus: c.moderationStatus || 'approved',
            });

            (dbData.competitionTurSchedule || [])
                .filter(t => t.competitionId === c.id && t.date)
                .forEach(t => entries.push({
                    key: `tur-${c.id}-${t.turIndex}-${t.groupId || 'umumiy'}`,
                    kind: 'tur', id: c.id,
                    title: `${c.name} (${t.turIndex}-Tur)`,
                    date: combineDateTime(t.date, t.startTime),
                    endTime: t.endTime || null,
                    location: t.venueLabel || null,
                    clubId: c.contextType === 'club' ? c.contextId : null,
                    status: 'upcoming',
                    moderationStatus: c.moderationStatus || 'approved',
                }));
        });

        return entries.sort((a, b) => new Date(a.date) - new Date(b.date));
    },

    // Talaba kalendari uchun: tadbirlar + turnirlar. TURLAR YO'Q.
    //
    // Tur - musobaqaning ichki bosqichi. Adminda u kerak (xona va vaqt taqsimoti),
    // talabada esa yo'q: u qatnashmaydigan musobaqaning o'nlab bosqichi kalendarni
    // to'ldirib yuborardi. Talaba turnirni bosib kiradi va jadvalni ichida ko'radi.
    //
    // Faqat moderatsiyadan o'tganlar (getPublicEvents / getPublicCompetitions
    // bilan bir xil qoida).
    getStudentCalendarEntries: () => {
        const dbData = getDB();
        const entries = [];

        (dbData.events || []).forEach(e => {
            // Musobaqaning tadbir nusxasi tashlanadi - musobaqaning O'ZI quyida
            // qo'shiladi, aks holda bitta turnir kalendarda ikki marta chiqardi.
            if (e.linkedCompetitionId || !e.date) return;
            if ((e.moderationStatus || 'approved') !== 'approved') return;
            entries.push({
                key: `event-${e.id}`, kind: 'event', id: e.id,
                title: e.title, date: e.date, endTime: e.endTime || null,
                location: e.location || null, clubId: e.clubId,
            });
        });

        (dbData.competitions || []).forEach(c => {
            if (!c.startDate) return;
            if ((c.moderationStatus || 'approved') !== 'approved') return;
            entries.push({
                key: `competition-${c.id}`, kind: 'competition', id: c.id,
                title: c.name, date: combineDateTime(c.startDate, c.startTime),
                endTime: c.endTime || null,
                location: c.location || null,
                clubId: c.contextType === 'club' ? c.contextId : null,
                scoringMethod: c.scoringMethod || null,
            });
        });

        return entries.sort((a, b) => new Date(a.date) - new Date(b.date));
    },

    // "Men qatnashayotgan turnirlar" - alohida ro'yxat uchun.
    //
    // Jamoaviy musobaqada talaba jamoa a'zosi sifatida ham hisoblanadi, shuning
    // uchun `teamMembers` ham tekshiriladi - aks holda kapitan bo'lmagan a'zo
    // o'zi qatnashayotgan turnirni ko'rmasdi.
    getStudentCompetitions: (userId) => {
        if (!userId) return [];
        const dbData = getDB();
        const compById = new Map((dbData.competitions || []).map(c => [c.id, c]));

        const mine = new Map();
        (dbData.registrations || []).forEach(r => {
            if (r.activityType !== 'competition' || r.status === 'cancelled') return;
            // Jamoa a'zosi uchun ayni shu shart ishlatiladi: faqat TAKLIFNI QABUL
            // QILGAN a'zo (ClubActivitiesPanel dagi qoida bilan bir xil). Javob
            // berilmagan taklif "mening turnirim" emas.
            const isMine = r.userId === userId
                || (r.teamMembers || []).some(m => m?.userId === userId && m.status === 'accepted');
            if (!isMine) return;
            const c = compById.get(r.activityId);
            if (!c) return;
            mine.set(c.id, {
                id: c.id,
                title: c.name,
                date: c.startDate ? combineDateTime(c.startDate, c.startTime) : null,
                location: c.location || null,
                clubId: c.contextType === 'club' ? c.contextId : null,
                scoringMethod: c.scoringMethod || null,
                registrationStatus: r.status,
                teamName: r.teamName || null,
                // Turlar SONI ko'rsatiladi, ro'yxati emas - jadval turnirning
                // o'z sahifasida.
                turCount: (dbData.competitionTurSchedule || [])
                    .filter(t => t.competitionId === c.id).length,
            });
        });

        return Array.from(mine.values())
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    },

    // "Mening tadbirlarim/turnirlarim" filtri uchun - tadbir VA musobaqa ikkalasida ham
    // ro'yxatdan o'tgan (yoki jamoa a'zosi sifatida taklifni qabul qilgan) faoliyat ID
    // to'plami. getStudentCompetitions bilan bir xil "isMine" qoida, faqat ikkala
    // activityType uchun ham va faqat ID kerak bo'lganda (StudentActivitiesTab.jsx).
    getMyRegisteredActivityIds: (userId) => {
        if (!userId) return { events: new Set(), competitions: new Set() };
        const dbData = getDB();
        const events = new Set();
        const competitions = new Set();
        (dbData.registrations || []).forEach(r => {
            if (r.status === 'cancelled') return;
            const isMine = r.userId === userId
                || (r.teamMembers || []).some(m => m?.userId === userId && m.status === 'accepted');
            if (!isMine) return;
            if (r.activityType === 'event') events.add(r.activityId);
            else if (r.activityType === 'competition') competitions.add(r.activityId);
        });
        return { events, competitions };
    },

    // "Is this room free then?" for creation forms and the Tur schedule — same guard the write path uses,
    // so a form can never say free where saving would refuse. `endDateTime` optional (see
    // DEFAULT_BOOKING_MINUTES).
    checkVenueAvailability: (location, startDateTime, endDateTime = null, excludeId = null) => {
        const conflict = findLocationConflict(getDB(), location, startDateTime, excludeId, endDateTime);
        return conflict
            ? { free: false, conflict }
            : { free: true, conflict: null };
    },

    // ============================================================================================
    // BAYONNOMA / TAQDIRLASH / HUJJATLAR
    // Zanjir: activity -> snapshot -> bayonnoma -> imzo -> tasdiq -> taqdirlash -> hujjat -> reestr.
    // Hujjat FAYL sifatida emas, YOZUV sifatida beriladi (raqam + QR token + ma'lumot); PDF esa
    // yuklab olinayotganda mijoz tomonida yasaladi. Shu sabab 1500 ta hujjat ham bir zumda beriladi.
    // ============================================================================================

    getProtocols: () => getDB().protocols || [],
    getProtocolById: (id) => (getDB().protocols || []).find(p => p.id === id) || null,
    getProtocolForActivity: (activityType, activityId) =>
        (getDB().protocols || []).find(p => p.activityType === activityType && p.activityId === activityId) || null,
    getProtocolSigners: (protocolId) =>
        (getDB().protocolSigners || []).filter(s => s.protocolId === protocolId)
            .sort((a, b) => (a.signOrder || 0) - (b.signOrder || 0)),
    getDocuments: () => getDB().documents || [],
    getDocumentsForProtocol: (protocolId) => (getDB().documents || []).filter(d => d.protocolId === protocolId),
    // Talabaning o'z hujjatlari. Jamoa NOMIGA berilgan hujjat ham qaytadi - u jamoaning har bir
    // a'zosiga tegishli, aks holda jamoaviy diplom hech kimning kabinetida ko'rinmay qolardi.
    getStudentDocuments: (userId) =>
        (getDB().documents || []).filter(d =>
            d.status !== 'draft'
            && (d.recipientId === userId || (d.members || []).some(m => m.userId === userId))
        ),
    getAwardBatches: (protocolId) => (getDB().awardBatches || []).filter(b => b.protocolId === protocolId),
    getDocumentAuditLogs: ({ protocolId = null, documentId = null } = {}) =>
        (getDB().documentAuditLogs || [])
            .filter(l => (protocolId ? l.protocolId === protocolId : true) && (documentId ? l.documentId === documentId : true))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),

    // Ishtirokchilar alohida o'qiladi (sinxronlashda tortilmaydi) - bitta bayonnomada minglab qator
    // bo'lishi mumkin.
    getProtocolParticipants: async (protocolId) => {
        const { data, error } = await supabase.from('protocol_participants').select('*').eq('protocol_id', protocolId);
        if (error) throw error;
        return (data || []).map(mapProtocolParticipantFromSupabase);
    },

    // Raqamni Postgres beradi - ikki admin bir vaqtda chiqarsa ham takrorlanmaydi.
    nextRegistrationNumber: async (prefix) => {
        const year = new Date().getFullYear();
        const { data, error } = await supabase.rpc('next_doc_number', { p_scope: `${prefix}-${year}` });
        if (error) throw error;
        return formatRegistrationNumber(prefix, year, data);
    },

    logDocumentAction: async (action, { protocolId = null, documentId = null, actor = null, details = {} } = {}) => {
        const id = 'dlog_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
        const { error } = await supabase.from('document_audit_logs').insert({
            id, protocol_id: protocolId, document_id: documentId, action,
            data: { actor, details, at: new Date().toISOString() }
        });
        if (error) throw error;
    },

    // Yakuniy holat: statistika + ishtirokchilar ro'yxati. Mavjud manbalardan o'qiydi
    // (registrations / participants / davomat / natijalar) - yangi hisob-kitob o'ylab topilmaydi.
    getActivityFinalSnapshot: (activityType, activityId) => {
        const dbData = getDB();
        const activity = activityType === 'competition'
            ? (dbData.competitions || []).find(c => c.id === activityId)
            : (dbData.events || []).find(e => e.id === activityId);
        if (!activity) throw new Error('Faoliyat topilmadi');

        const regs = (dbData.registrations || []).filter(r =>
            r.activityId === activityId && r.activityType === activityType && r.status !== 'cancelled');
        const studentById = new Map(db.getMockStudents().map(s => [s.id, s]));
        const profileById = new Map(db.getSyncedProfiles().map(p => [p.id, p]));
        const resolve = (id) => studentById.get(id) || profileById.get(id) || null;

        // Musobaqada o'rinlar reytingdan keladi; oddiy tadbirda o'rin tushunchasi yo'q.
        const placeByParticipant = new Map();
        if (activityType === 'competition') {
            try {
                const board = ['debate_match', 'court_match'].includes(activity.scoringMethod)
                    ? db.getDebateTeamRating(activityId).map((r, i) => ({ id: r.participant.id, rank: r.matchesPlayed > 0 ? i + 1 : null }))
                    : db.getLeaderboard(activityId).map((r, i) => ({ id: r.participantId, rank: i + 1 }));
                board.forEach(r => { if (r.rank) placeByParticipant.set(r.id, r.rank); });
            } catch {
                // Reyting hali hisoblanmagan bo'lsa - o'rinlarsiz davom etadi, bayonnoma baribir tuziladi.
            }
        }

        const attendance = db.getActivityAttendanceForActivity?.(activityId, activityType) || [];
        const attendedIds = new Set(attendance.filter(a => a.status === 'present').map(a => a.participantId));

        const participants = (activity.participants || []).map((p, idx) => {
            const student = resolve(p.id) || {};
            const attended = attendedIds.size > 0 ? attendedIds.has(p.id) : true;

            // Jamoaviy ishtirokda bayonnomada jamoa nomi yetarli emas - tarkibi ham ko'rinishi kerak.
            // Ismlar rasmiy ko'rinishda: familiya to'liq, ism/sharif bosh harflar bilan.
            const teamMembers = (dbData.teamMembers || [])
                .filter(m => m.teamId === p.id)
                .map(m => {
                    const st = resolve(m.userId) || {};
                    return {
                        userId: m.userId,
                        officialName: formatOfficialName(st.fullName || m.userId),
                        fullName: st.fullName || m.userId,
                        role: m.role,
                        faculty: st.faculty || null,
                        course: st.course ?? null,
                        group: st.group || null,
                        studentId: st.studentId || null
                    };
                });

            return {
                order: idx + 1,
                participantId: p.id,
                fullNameSnapshot: p.name || student.fullName || p.fullName || p.id,
                officialNameSnapshot: formatOfficialName(p.name || student.fullName || p.fullName || p.id),
                membersSnapshot: teamMembers,
                studentIdSnapshot: student.studentId || null,
                facultySnapshot: student.faculty || db.inferTeamFaculty?.(p.id) || null,
                courseSnapshot: student.course ?? null,
                groupSnapshot: student.group || null,
                teamNameSnapshot: p.membersCount != null ? (p.name || null) : null,
                attendanceStatus: attended ? 'present' : 'absent',
                placeSnapshot: placeByParticipant.get(p.id) ?? null
            };
        });

        const attendedCount = participants.filter(p => p.attendanceStatus === 'present').length;
        const byFaculty = {};
        const byCourse = {};
        participants.forEach(p => {
            if (p.facultySnapshot) byFaculty[p.facultySnapshot] = (byFaculty[p.facultySnapshot] || 0) + 1;
            if (p.courseSnapshot != null) byCourse[p.courseSnapshot] = (byCourse[p.courseSnapshot] || 0) + 1;
        });

        const clubId = activityType === 'competition'
            ? (activity.contextType === 'club' ? activity.contextId : null)
            : activity.clubId;

        return {
            activity,
            title: activityType === 'competition' ? activity.name : activity.title,
            clubId,
            clubName: (dbData.clubs || []).find(c => c.id === clubId)?.name || null,
            eventDate: activityType === 'competition'
                ? combineDateTime(activity.startDate, activity.startTime)
                : activity.date,
            location: activity.location || null,
            registeredCount: regs.length,
            attendedCount,
            absentCount: participants.length - attendedCount,
            teamCount: activity.type === 'team' ? participants.length : 0,
            byFaculty,
            byCourse,
            judges: activity.judges || [],
            participants
        };
    },

    // Bayonnoma LOYIHASI. Mavjud bo'lsa qaytariladi - ikkinchi marta bosilganda dublikat yaratmaydi.
    generateProtocol: async (activityType, activityId, { createdBy, summary = '', purpose = '' } = {}) => {
        const existing = db.getProtocolForActivity(activityType, activityId);
        if (existing) return existing;

        const snap = db.getActivityFinalSnapshot(activityType, activityId);
        const registrationNumber = await db.nextRegistrationNumber('BAY');
        const id = 'prot_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);

        const data = {
            title: snap.title, clubId: snap.clubId, clubName: snap.clubName,
            eventDate: snap.eventDate, location: snap.location,
            protocolDate: new Date().toISOString(),
            summary, purpose,
            registeredCount: snap.registeredCount, attendedCount: snap.attendedCount,
            absentCount: snap.absentCount, teamCount: snap.teamCount,
            byFaculty: snap.byFaculty, byCourse: snap.byCourse, judges: snap.judges,
            createdBy: createdBy || null
        };

        const { error } = await supabase.from('protocols').insert({
            id, activity_type: activityType, activity_id: activityId,
            registration_number: registrationNumber, status: 'draft', revision: 1, data
        });
        if (error) throw error;

        if (snap.participants.length > 0) {
            const rows = snap.participants.map(p => ({
                id: 'pp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
                protocol_id: id, data: p
            }));
            // Katta tadbirlarda minglab qator bo'lishi mumkin - bo'laklab yuboriladi.
            for (let i = 0; i < rows.length; i += 500) {
                const { error: pErr } = await supabase.from('protocol_participants').insert(rows.slice(i, i + 500));
                if (pErr) throw pErr;
            }
        }

        await db.logDocumentAction('protocol_created', { protocolId: id, actor: createdBy, details: { registrationNumber } });
        await syncCoreDataFromSupabase();
        return db.getProtocolById(id);
    },

    updateProtocol: async (protocolId, updates, actor = null) => {
        const current = db.getProtocolById(protocolId);
        if (!current) throw new Error('Bayonnoma topilmadi');
        if (current.status === 'approved') {
            throw new Error("Tasdiqlangan bayonnomani o'zgartirib bo'lmaydi - yangi revision yarating.");
        }
        const { id: _i, activityType: _at, activityId: _ai, registrationNumber: _rn, status: _s,
            revision: _r, createdAt: _c, updatedAt: _u, ...currentData } = current;
        const { error } = await supabase.from('protocols')
            .update({ data: { ...currentData, ...updates }, updated_at: new Date().toISOString() })
            .eq('id', protocolId);
        if (error) throw error;
        await db.logDocumentAction('protocol_updated', { protocolId, actor, details: { fields: Object.keys(updates) } });
        await syncCoreDataFromSupabase();
        return db.getProtocolById(protocolId);
    },

    setProtocolSigners: async (protocolId, signers, actor = null) => {
        const { error: delErr } = await supabase.from('protocol_signers').delete().eq('protocol_id', protocolId);
        if (delErr) throw delErr;
        const rows = signers.map((s, idx) => ({
            id: 'psign_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            protocol_id: protocolId, username: s.username, status: 'pending',
            data: { role: s.role, signOrder: idx + 1, signedAt: null }
        }));
        if (rows.length > 0) {
            const { error } = await supabase.from('protocol_signers').insert(rows);
            if (error) throw error;
        }
        await db.logDocumentAction('protocol_signers_set', { protocolId, actor, details: { count: rows.length } });
        await syncCoreDataFromSupabase();
        return db.getProtocolSigners(protocolId);
    },

    sendProtocolForSignature: async (protocolId, actor = null) => {
        const signers = db.getProtocolSigners(protocolId);
        if (signers.length === 0) throw new Error("Avval imzolovchilarni belgilang.");
        const { error } = await supabase.from('protocols')
            .update({ status: 'pending_signature', updated_at: new Date().toISOString() })
            .eq('id', protocolId);
        if (error) throw error;
        await db.logDocumentAction('protocol_sent_for_signature', { protocolId, actor });
        await syncCoreDataFromSupabase();
        return db.getProtocolById(protocolId);
    },

    // Ichki tizim tasdig'i. Rasmiy E-IMZO kelajakda shu yerga ulanadi - shuning uchun `signatureType`
    // saqlanadi va hozir ochiq-oydin 'internal' deb yoziladi, "rasmiy imzo" deb ko'rsatilmaydi.
    signProtocol: async (protocolId, username, actor = null) => {
        const signer = db.getProtocolSigners(protocolId).find(s => s.username === username);
        if (!signer) throw new Error("Siz bu bayonnomaning imzolovchisi emassiz.");
        if (signer.status === 'signed') return db.getProtocolById(protocolId);

        // `actor` imzolovchidan farq qilsa - bu boshqa birov nomidan qo'yilgan imzo. Buni yashirmasdan
        // yozib qo'yamiz: imzoning kimga tegishli ekani va uni kim qo'yganini audit ajratib ko'rsatadi.
        const onBehalf = actor && actor !== username;
        const { error } = await supabase.from('protocol_signers')
            .update({
                status: 'signed',
                data: {
                    ...signer, signedAt: new Date().toISOString(), signatureType: 'internal',
                    ...(onBehalf ? { signedBy: actor, onBehalfOf: username } : {})
                }
            })
            .eq('id', signer.id);
        if (error) throw error;
        await db.logDocumentAction('protocol_signed', {
            protocolId, actor: actor || username,
            details: { role: signer.role, signer: username, ...(onBehalf ? { onBehalfOf: username } : {}) }
        });
        await syncCoreDataFromSupabase();

        // Hamma imzolagan bo'lsa - bayonnoma avtomatik tasdiqlanadi.
        const all = db.getProtocolSigners(protocolId);
        if (all.length > 0 && all.every(s => s.status === 'signed')) {
            const { error: aErr } = await supabase.from('protocols')
                .update({ status: 'approved', updated_at: new Date().toISOString() })
                .eq('id', protocolId);
            if (aErr) throw aErr;
            await db.logDocumentAction('protocol_approved', { protocolId, actor: actor || username });
            await syncCoreDataFromSupabase();
        }
        return db.getProtocolById(protocolId);
    },

    // Kim qanday hujjat olishi - TAKLIF. Hech narsa yozilmaydi, admin ko'rib chiqib o'zgartiradi.
    // Jamoa g'olib bo'lsa, jamoa a'zolarining HAR BIRIGA alohida hujjat taklif qilinadi (spetsifikatsiya
    // talabi: bitta umumiy PDF bilan cheklanmaslik).
    // `settings` - "Yakunlash" bo'limidagi qisqa sozlamalar (config/documents.js: defaultAwardSettings).
    // Berilmasa standart holat ishlatiladi.
    previewAwardRecipients: async (protocolId, settings = null) => {
        const protocol = db.getProtocolById(protocolId);
        if (!protocol) throw new Error('Bayonnoma topilmadi');
        const cfg = settings || defaultAwardSettings(protocol.activityType);
        const participants = await db.getProtocolParticipants(protocolId);
        const dbData = getDB();
        const studentById = new Map(db.getMockStudents().map(s => [s.id, s]));
        const profileById = new Map(db.getSyncedProfiles().map(p => [p.id, p]));
        const resolve = (id) => studentById.get(id) || profileById.get(id) || {};

        const out = [];
        const seen = new Set();               // bir odam bir necha rolda chiqib qolmasligi uchun
        const push = (base, documentType) => {
            if (!documentType) return;
            const key = `${base.recipientId}::${documentType}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ ...base, documentType });
        };

        // Sovrindorlar bo'yicha tartib: o'rin bor ishtirokchilar, o'sish tartibida.
        const placed = participants
            .filter(p => p.placeSnapshot != null)
            .sort((a, b) => a.placeSnapshot - b.placeSnapshot);
        const podiumPlaces = Object.keys(cfg.places || {}).map(Number);
        const topActiveIds = new Set(
            placed
                .filter(p => !podiumPlaces.includes(p.placeSnapshot))
                .slice(0, Math.max(0, Number(cfg.topActive?.count) || 0))
                .map(p => p.participantId)
        );

        // Bitta ishtirokchi (yakka yoki jamoa) -> kerak bo'lsa jamoa a'zolariga yoyiladi.
        const expand = (p) => {
            const isTeam = (dbData.teams || []).some(t => t.id === p.participantId);
            if (!isTeam) {
                return [{
                    recipientId: p.participantId,
                    recipientName: p.fullNameSnapshot,
                    officialName: p.officialNameSnapshot || formatOfficialName(p.fullNameSnapshot),
                    faculty: p.facultySnapshot, course: p.courseSnapshot, group: p.groupSnapshot,
                    teamName: null
                }];
            }
            const members = (dbData.teamMembers || [])
                .filter(m => m.teamId === p.participantId)
                .map(m => {
                    const st = resolve(m.userId);
                    return {
                        userId: m.userId,
                        fullName: st.fullName || m.userId,
                        officialName: formatOfficialName(st.fullName || m.userId),
                        role: m.role,
                        faculty: st.faculty || null, course: st.course ?? null, group: st.group || null
                    };
                });

            // 'team': jamoa nomiga BITTA hujjat, tarkibi hujjat ichida ko'rsatiladi.
            if (cfg.teamAwardMode !== 'members') {
                return [{
                    recipientId: p.participantId,
                    recipientName: p.fullNameSnapshot,
                    officialName: p.fullNameSnapshot,   // jamoa nomi qisqartirilmaydi
                    faculty: p.facultySnapshot, course: null, group: null,
                    teamName: p.fullNameSnapshot,
                    isTeam: true,
                    members
                }];
            }
            // 'members': har bir a'zoga alohida hujjat, har birida o'z raqami.
            return members.map(m => ({
                recipientId: m.userId,
                recipientName: m.fullName,
                officialName: m.officialName,
                faculty: m.faculty || p.facultySnapshot || null,
                course: m.course, group: m.group,
                teamName: p.fullNameSnapshot,
                isTeam: false,
                members: []
            }));
        };

        participants.forEach(p => {
            const attended = p.attendanceStatus === 'present';
            if (cfg.attendedOnly && !attended && p.placeSnapshot == null) return;

            const base = { place: p.placeSnapshot ?? null, role: 'participant', attended };
            const podiumType = p.placeSnapshot != null ? (cfg.places || {})[p.placeSnapshot] : null;
            const type = podiumType
                || (topActiveIds.has(p.participantId) ? cfg.topActive?.documentType : null)
                || cfg.participants;

            expand(p).forEach(r => push({ ...r, ...base }, type));
        });

        // Hakamlar
        if (cfg.judges) {
            (protocol.judges || []).forEach(j => {
                const st = resolve(j);
                push({
                    recipientId: j, recipientName: st.fullName || j,
                    officialName: formatOfficialName(st.fullName || j),
                    faculty: st.faculty || null, course: st.course ?? null, group: st.group || null,
                    teamName: null, place: null, role: 'judge', attended: true
                }, cfg.judges);
            });
        }

        // Volontyor va tashkilotchilar - klub a'zoligidagi REAL rollardan olinadi, o'ylab topilmaydi.
        const clubMembers = (dbData.memberships || []).filter(m => m.clubId === protocol.clubId);
        const takeByRole = (roles, count, documentType, role) => {
            if (!documentType || !count) return;
            clubMembers
                .filter(m => roles.includes(m.role))
                .slice(0, Number(count) || 0)
                .forEach(m => {
                    const st = resolve(m.userId);
                    push({
                        recipientId: m.userId, recipientName: st.fullName || m.userId,
                        officialName: formatOfficialName(st.fullName || m.userId),
                        faculty: st.faculty || null, course: st.course ?? null, group: st.group || null,
                        teamName: null, place: null, role, attended: true
                    }, documentType);
                });
        };
        takeByRole(['volunteer'], cfg.volunteers?.count, cfg.volunteers?.documentType, 'volunteer');
        takeByRole(['coordinator', 'head_coordinator'], cfg.organizers?.count, cfg.organizers?.documentType, 'organizer');

        return out;
    },

    // Hujjatlarni QORALAMA sifatida yaratadi. Bayonnoma tasdiqlanmagan bo'lsa - umuman ruxsat yo'q
    // (spetsifikatsiyaning asosiy nazorat qoidasi).
    createAwardBatch: async (protocolId, recipients, actor = null, templateId = 'classic') => {
        const protocol = db.getProtocolById(protocolId);
        if (!protocol) throw new Error('Bayonnoma topilmadi');
        if (protocol.status !== 'approved') {
            throw new Error('Taqdirlash faqat bayonnoma tasdiqlangandan keyin shakllantiriladi.');
        }
        if (!recipients?.length) throw new Error("Taqdirlanuvchilar ro'yxati bo'sh.");

        const batchNumber = await db.nextRegistrationNumber('AWARD');
        const batchId = 'batch_' + Date.now().toString() + Math.random().toString(36).slice(2, 8);
        const { error: bErr } = await supabase.from('award_batches').insert({
            id: batchId, protocol_id: protocolId, registration_number: batchNumber,
            status: 'draft', data: { createdBy: actor, total: recipients.length }
        });
        if (bErr) throw bErr;

        // Raqamlar ketma-ket, atomar olinadi - shuning uchun sikl ichida.
        const rows = [];
        for (const r of recipients) {
            const type = getDocumentType(r.documentType);
            if (!type) continue;
            const regNumber = await db.nextRegistrationNumber(type.prefix);
            rows.push({
                id: 'doc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
                protocol_id: protocolId, batch_id: batchId,
                recipient_id: r.recipientId, document_type: r.documentType,
                registration_number: regNumber,
                verification_token: crypto.randomUUID().replace(/-/g, ''),
                status: 'draft',
                data: {
                    recipientName: r.recipientName,
                    officialName: r.officialName || formatOfficialName(r.recipientName),
                    faculty: r.faculty, course: r.course, group: r.group,
                    teamName: r.teamName || null,
                    // Jamoa nomiga berilgan hujjatda tarkib hujjatning o'zida ko'rsatiladi.
                    isTeam: !!r.isTeam,
                    members: r.members || [],
                    place: r.place ?? null, role: r.role,
                    achievement: type.label,
                    activityName: protocol.title, activityType: protocol.activityType,
                    sourceType: protocol.activityType, sourceId: protocol.activityId,
                    protocolNumber: protocol.registrationNumber,
                    organization: ORGANIZATION_NAME,
                    // Tanlangan dizayn hujjat bilan birga saqlanadi - keyin ochilganda ham o'sha ko'rinish.
                    templateId,
                    issuedAt: null
                }
            });
        }
        for (let i = 0; i < rows.length; i += 500) {
            const { error } = await supabase.from('documents').insert(rows.slice(i, i + 500));
            if (error) throw error;
        }

        await db.logDocumentAction('award_batch_created', {
            protocolId, actor, details: { batchNumber, count: rows.length }
        });
        await syncCoreDataFromSupabase();
        return db.getAwardBatches(protocolId).find(b => b.id === batchId);
    },

    // Qoralamadan "berilgan" holatiga. Shu paytdan boshlab hujjat talaba kabinetida va reestrda,
    // QR orqali tekshiriladigan bo'ladi.
    issueDocuments: async (batchId, actor = null) => {
        const batch = (getDB().awardBatches || []).find(b => b.id === batchId);
        if (!batch) throw new Error('Taqdirlash to\'plami topilmadi');
        const issuedAt = new Date().toISOString();
        const docs = (getDB().documents || []).filter(d => d.batchId === batchId && d.status === 'draft');

        for (const d of docs) {
            const { id, protocolId, batchId: _b, recipientId, documentType, registrationNumber,
                verificationToken, status, createdAt, updatedAt, ...data } = d;
            const { error } = await supabase.from('documents')
                .update({ status: 'issued', data: { ...data, issuedAt }, updated_at: issuedAt })
                .eq('id', id);
            if (error) throw error;
        }
        const { error: bErr } = await supabase.from('award_batches')
            .update({ status: 'issued', data: { ...batch, issuedAt, issuedBy: actor } })
            .eq('id', batchId);
        if (bErr) throw bErr;

        await db.logDocumentAction('documents_issued', {
            protocolId: batch.protocolId, actor, details: { batchId, count: docs.length }
        });
        await syncCoreDataFromSupabase();
        return docs.length;
    },

    // O'CHIRILMAYDI - bekor qilinadi. Eski raqam reestrda qoladi, sabab majburiy.
    revokeDocument: async (documentId, reason, actor = null) => {
        if (!reason?.trim()) throw new Error('Bekor qilish sababi majburiy.');
        const doc = (getDB().documents || []).find(d => d.id === documentId);
        if (!doc) throw new Error('Hujjat topilmadi');
        const { id, protocolId, batchId, recipientId, documentType, registrationNumber,
            verificationToken, status, createdAt, updatedAt, ...data } = doc;
        const revokedAt = new Date().toISOString();
        const { error } = await supabase.from('documents')
            .update({ status: 'revoked', data: { ...data, revokedAt, revokedReason: reason.trim() }, updated_at: revokedAt })
            .eq('id', documentId);
        if (error) throw error;
        await db.logDocumentAction('document_revoked', {
            protocolId: doc.protocolId, documentId, actor, details: { reason: reason.trim() }
        });
        await syncCoreDataFromSupabase();
        return db.getDocuments().find(d => d.id === documentId);
    },

    // Public QR tekshiruvi - login talab qilmaydi. Jadval emas, faqat xavfsiz maydonlarni qaytaradigan
    // Postgres funksiyasi chaqiriladi (ichki id/audit oshkor bo'lmaydi).
    verifyDocumentByToken: async (token) => {
        const { data, error } = await supabase.rpc('verify_document', { p_token: token });
        if (error) throw error;
        const row = (data || [])[0];
        if (!row) return null;
        return {
            registrationNumber: row.registration_number,
            documentType: row.document_type,
            documentTypeLabel: getDocumentTypeLabel(row.document_type),
            status: row.status,
            recipientName: row.recipient_name,
            activityName: row.activity_name,
            achievement: row.achievement,
            issuedAt: row.issued_at,
            organization: row.organization
        };
    },

    // Reestr uchun filtrlanadigan ro'yxat. Hujjatlar soni va UNIKAL talabalar soni alohida qaytadi -
    // bitta talaba 10 ta sertifikat olsa qamrov sun'iy oshib ketmasligi uchun.
    getAwardRegistry: ({ documentType = '', group = '', status = '', faculty = '', search = '', year = '' } = {}) => {
        const q = search.trim().toLowerCase();
        const rows = (getDB().documents || []).filter(d => {
            if (documentType && d.documentType !== documentType) return false;
            if (group && getDocumentType(d.documentType)?.group !== group) return false;
            if (status && d.status !== status) return false;
            if (faculty && d.faculty !== faculty) return false;
            if (year && !String(d.issuedAt || d.createdAt || '').startsWith(String(year))) return false;
            if (q) {
                const hay = `${d.recipientName || ''} ${d.registrationNumber || ''} ${d.activityName || ''} ${d.recipientId || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return {
            rows,
            total: rows.length,
            uniqueRecipients: new Set(rows.map(d => d.recipientId)).size
        };
    },

    // ========================================================================
    // TADBIRLAR TO'PLAMI (Event Collections)
    //
    // Mavjud Event/Competition/Ranking/Scoring mexanizmlarini o'zgartirmaydi -
    // ularning ustiga qo'shiladigan universal agregatsiya qatlami (istalgan ko'p
    // tadbirli loyiha uchun: festival, hafталik, oylik va h.k., faqat festivalga
    // bog'lanmagan). Hech qanday "ball" qatorini saqlamaydi - har chaqirilganda
    // joriy natijalardan QAYTA hisoblanadi (sof funksiya), shuning uchun biror
    // musobaqa natijasi o'zgarsa keyingi o'qishda avtomatik yangilanadi va
    // "Qayta hisoblash" mohiyatan shunchaki qayta-sync + qayta-chaqirish -
    // tabiatan idempotent.
    //
    // "Tasdiqlangan natija" (24-band): loyihada alohida "natija holati" maydoni
    // yo'q, shuning uchun eng yaqin mavjud ekvivalent ishlatiladi - musobaqa
    // "yakunlangan" (barcha raund/tur tugagan) bo'lgandagina uning o'rinlari
    // umumiy ballga kiradi, hali davom etayotgani - yo'q.
    // ========================================================================

    isEventCollectionsBackendReady: () => getDB().eventCollectionsBackendReady !== false,

    // --- To'plamlar (CRUD) ---
    getEventCollections: () => (getDB().eventCollections || []).slice()
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),

    getEventCollectionById: (id) => (getDB().eventCollections || []).find(c => c.id === id) || null,

    createEventCollection: async ({ name, description = '', startDate = null, endDate = null, createdBy }) => {
        const id = 'ecol_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const { error } = await supabase.from('event_collections').insert({
            id, name, description, start_date: startDate, end_date: endDate,
            status: COLLECTION_STATUS.DRAFT, created_by: createdBy,
            data: { scoringConfig: DEFAULT_SCORING_CONFIG, settingsHistory: [] },
        });
        if (error) throw eventCollectionTableError(error);
        await db.syncCoreDataFromSupabase();
        return db.getEventCollectionById(id);
    },

    updateEventCollection: async (id, patch = {}) => {
        const row = { updated_at: new Date().toISOString() };
        if (patch.name !== undefined) row.name = patch.name;
        if (patch.description !== undefined) row.description = patch.description;
        if (patch.startDate !== undefined) row.start_date = patch.startDate;
        if (patch.endDate !== undefined) row.end_date = patch.endDate;
        if (patch.status !== undefined) row.status = patch.status;
        if (patch.coverImage !== undefined) row.cover_image = patch.coverImage;
        const { error } = await supabase.from('event_collections').update(row).eq('id', id);
        if (error) throw eventCollectionTableError(error);
        await db.syncCoreDataFromSupabase();
        return db.getEventCollectionById(id);
    },

    // Faqat bog'lanish (event_collection_items, cascade) o'chadi - Event/
    // Competition va ularning barcha natijalari BUTUNLAY tegilmaydi (46-band).
    deleteEventCollection: async (id) => {
        const { error } = await supabase.from('event_collections').delete().eq('id', id);
        if (error) throw eventCollectionTableError(error);
        await db.syncCoreDataFromSupabase();
    },

    // Bitta tadbir/musobaqa qaysi FAOL (yoki yakunlangan) to'plamga tegishli -
    // talaba tarafida kalendar/ro'yxatda "festival nishonchasi" uchun. DRAFT/
    // ARCHIVED to'plamlar talabaga umuman ko'rinmaydi, shuning uchun bu yerda
    // ham chiqmaydi.
    getActiveCollectionForActivity: (activityType, activityId) => {
        const dbData = getDB();
        const item = (dbData.eventCollectionItems || []).find(i => i.activityType === activityType && i.activityId === activityId);
        if (!item) return null;
        const collection = (dbData.eventCollections || []).find(c => c.id === item.collectionId);
        if (!collection || !['ACTIVE', 'COMPLETED'].includes(collection.status)) return null;
        return { id: collection.id, name: collection.name };
    },

    // --- Faoliyatlar (biriktirish) ---
    getEventCollectionItems: (collectionId) =>
        (getDB().eventCollectionItems || []).filter(i => i.collectionId === collectionId),

    // Mavjud (hali shu to'plamga qo'shilmagan) tasdiqlangan tadbir/musobaqalar -
    // "+ Mavjud tadbir/musobaqani qo'shish" pikeri uchun. Yangi Event yaratish
    // shart emas - mavjudlarini tanlab biriktiradi (31-band).
    getAvailableActivitiesForCollection: (collectionId, { activityType = 'event', search = '' } = {}) => {
        const dbData = getDB();
        const already = new Set(
            (dbData.eventCollectionItems || [])
                .filter(i => i.collectionId === collectionId && i.activityType === activityType)
                .map(i => i.activityId)
        );
        const q = search.trim().toLowerCase();
        if (activityType === 'competition') {
            return (dbData.competitions || [])
                .filter(c => !already.has(c.id) && (c.moderationStatus || 'approved') === 'approved')
                .filter(c => !q || c.name.toLowerCase().includes(q))
                .map(c => ({ id: c.id, title: c.name, date: c.startDate ? combineDateTime(c.startDate, c.startTime) : null }));
        }
        return (dbData.events || [])
            .filter(e => !already.has(e.id) && (e.moderationStatus || 'approved') === 'approved' && !e.linkedCompetitionId)
            .filter(e => !q || e.title.toLowerCase().includes(q))
            .map(e => ({ id: e.id, title: e.title, date: e.date }));
    },

    addActivityToCollection: async ({ collectionId, activityType, activityId, contributionType = 'participation', addedBy }) => {
        const id = 'eci_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const { error } = await supabase.from('event_collection_items').insert({
            id, collection_id: collectionId, activity_type: activityType, activity_id: activityId,
            contribution_type: contributionType, added_by: addedBy,
        });
        if (error) throw eventCollectionTableError(error);
        await db.syncCoreDataFromSupabase();
    },

    // To'plamdan chiqarish != tadbirni o'chirish - faqat bog'lanish o'chadi (4-band).
    removeActivityFromCollection: async ({ collectionId, activityType, activityId }) => {
        const { error } = await supabase.from('event_collection_items').delete()
            .eq('collection_id', collectionId).eq('activity_type', activityType).eq('activity_id', activityId);
        if (error) throw eventCollectionTableError(error);
        await db.syncCoreDataFromSupabase();
    },

    updateCollectionItemContribution: async ({ collectionId, activityType, activityId, contributionType }) => {
        const { error } = await supabase.from('event_collection_items')
            .update({ contribution_type: contributionType })
            .eq('collection_id', collectionId).eq('activity_type', activityType).eq('activity_id', activityId);
        if (error) throw eventCollectionTableError(error);
        await db.syncCoreDataFromSupabase();
    },

    // --- Scoring sozlamalari ---
    getEventCollectionScoringConfig: (collectionId) => {
        const c = db.getEventCollectionById(collectionId);
        return mergeScoringConfig(c?.scoringConfig);
    },

    // Eski sozlama yangisidan OLDIN settingsHistory'ga suriladi (ClubRegulationEditor'dagi
    // `history` naqshi bilan bir xil) - 35-band audit talabi shu orqali qondiriladi.
    updateEventCollectionScoringConfig: async ({ collectionId, scoringConfig, changedBy }) => {
        const current = db.getEventCollectionById(collectionId);
        if (!current) throw new Error("To'plam topilmadi");
        const nextHistory = [
            { scoringConfig: current.scoringConfig, changedBy, changedAt: new Date().toISOString() },
            ...(current.settingsHistory || []),
        ];
        const { error } = await supabase.from('event_collections').update({
            data: { scoringConfig, settingsHistory: nextHistory },
            updated_at: new Date().toISOString(),
        }).eq('id', collectionId);
        if (error) throw eventCollectionTableError(error);
        await db.syncCoreDataFromSupabase();
        return db.getEventCollectionById(collectionId);
    },

    // --- Tyutor -> guruh biriktiruvi (platforma darajasida, bironta to'plamga bog'liq emas) ---
    // TYUTOR rolidagi haqiqiy akkauntlar - biriktiruv formasida username qo'lda
    // yozilmasin, ro'yxatdan tanlansin deb.
    getTutorUsers: () => db.getSyncedProfiles().filter(p => p.role === 'TYUTOR'),

    getTutorGroupAssignments: () => (getDB().tutorGroupAssignments || []).filter(a => a.active),

    getGroupsForTutor: (tutorUsername) =>
        (getDB().tutorGroupAssignments || [])
            .filter(a => a.active && a.tutorUsername === tutorUsername).map(a => a.groupName),

    getTutorForGroup: (groupName) =>
        (getDB().tutorGroupAssignments || []).find(a => a.active && a.groupName === groupName)?.tutorUsername || null,

    // Bir guruhda bir vaqtda bitta faol tyutor bo'ladi - avvalgi faol biriktiruv
    // yopiladi (talent_assignments'dagi "faolni yopish" qoidasi bilan bir xil).
    assignTutorToGroup: async ({ tutorUsername, groupName, assignedBy }) => {
        const dbData = getDB();
        const previous = (dbData.tutorGroupAssignments || []).find(a => a.active && a.groupName === groupName);
        if (previous && previous.tutorUsername === tutorUsername) return previous;
        if (previous) {
            const { error } = await supabase.from('tutor_group_assignments')
                .update({ active: false, ended_at: new Date().toISOString() }).eq('id', previous.id);
            if (error) throw eventCollectionTableError(error);
        }
        const id = 'tga_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const { error } = await supabase.from('tutor_group_assignments').insert({
            id, tutor_username: tutorUsername, group_name: groupName, active: true, assigned_by: assignedBy,
        });
        if (error) throw eventCollectionTableError(error);
        await db.syncCoreDataFromSupabase();
    },

    removeTutorGroupAssignment: async (id) => {
        const { error } = await supabase.from('tutor_group_assignments')
            .update({ active: false, ended_at: new Date().toISOString() }).eq('id', id);
        if (error) throw eventCollectionTableError(error);
        await db.syncCoreDataFromSupabase();
    },

    // --- AGREGATSIYA DVIGATELI ---
    //
    // Sof funksiya: hech narsa yozmaydi, joriy mahalliy ko'zguda (getDB()) turgan
    // ma'lumotdan har safar qayta hisoblaydi. Ishtirok VA qamrov ATAYLAB
    // ajratilgan (9/49-band): jami ishtirok - qatnashuvlar yig'indisi, qamrov -
    // NOYOB talaba soni (studentId bo'yicha dedup, 28-band).
    getEventCollectionAnalytics: (collectionId) => {
        const collection = db.getEventCollectionById(collectionId);
        if (!collection) return null;
        const config = mergeScoringConfig(collection.scoringConfig);
        const items = db.getEventCollectionItems(collectionId);
        const dbData = getDB();

        const studentById = new Map(db.getMockStudents().map(s => [s.id, s]));
        const profileById = new Map(db.getSyncedProfiles().map(p => [p.id, p]));
        const resolvePerson = (id) => studentById.get(id) || profileById.get(id) || null;

        const activityRows = [];
        const flatRows = []; // studentId, faculty, course, group, isTeam, place, contributionType, activityType, activityId, date
        const breakdownByStudent = new Map();

        items.forEach(item => {
            const activity = item.activityType === 'competition'
                ? (dbData.competitions || []).find(c => c.id === item.activityId)
                : (dbData.events || []).find(e => e.id === item.activityId);
            if (!activity) return; // faoliyat o'chirilgan bo'lishi mumkin - jim o'tkaziladi
            if ((activity.moderationStatus || 'approved') !== 'approved') return;

            const statusBucket = item.activityType === 'competition'
                ? classifyCompetitionForCollection(activity) : classifyEventForCollection(activity);
            const resultsFinal = item.activityType === 'competition' ? statusBucket === 'closed' : true;
            const title = item.activityType === 'competition' ? activity.name : activity.title;
            const activityDate = item.activityType === 'competition'
                ? (activity.startDate ? combineDateTime(activity.startDate, activity.startTime) : null)
                : activity.date;

            let snap = null;
            if (item.contributionType !== 'none') {
                try { snap = db.getActivityFinalSnapshot(item.activityType, item.activityId); } catch { snap = null; }
            }

            const uniqueInActivity = new Set();
            let participationInActivity = 0;

            if (snap) {
                snap.participants.forEach(p => {
                    const attended = p.attendanceStatus === 'present';
                    if (!attended) return;
                    const isTeam = activity.type === 'team' && (p.membersSnapshot || []).length > 0;
                    const memberRows = isTeam
                        ? p.membersSnapshot.map(m => ({ studentId: m.userId, faculty: m.faculty, course: m.course, group: m.group }))
                        : [{ studentId: p.participantId, faculty: p.facultySnapshot, course: p.courseSnapshot, group: p.groupSnapshot }];

                    memberRows.forEach(m => {
                        if (!m.studentId) return;
                        const place = resultsFinal ? p.placeSnapshot : null;
                        const row = {
                            studentId: m.studentId, faculty: m.faculty || null, course: m.course ?? null, group: m.group || null,
                            isTeam, place, contributionType: item.contributionType,
                            activityType: item.activityType, activityId: item.activityId, date: activityDate, title,
                        };
                        flatRows.push(row);
                        uniqueInActivity.add(m.studentId);
                        participationInActivity += 1;

                        // 29-band, B varianti: jamoa o'rni shaxsiy (talaba) ballga KIRMAYDI - faqat
                        // fakultet/tyutor/kurs/guruh darajasida hisoblanadi (buildDimensionRows'da).
                        const placementPoints = (row.contributionType === 'placement' && row.place && !row.isTeam)
                            ? placementPointsFor(config, row.place) : 0;
                        const participationPts = (row.contributionType === 'placement' || row.contributionType === 'participation')
                            ? participationPointsFor(config) : 0;
                        if (!breakdownByStudent.has(m.studentId)) breakdownByStudent.set(m.studentId, []);
                        breakdownByStudent.get(m.studentId).push({
                            activityType: item.activityType, activityId: item.activityId, title,
                            contributionType: item.contributionType, isTeam, place: row.place,
                            placementPoints, participationPoints: participationPts,
                        });
                    });
                });
            }

            const clubId = item.activityType === 'competition'
                ? (activity.contextType === 'club' ? activity.contextId : null)
                : (activity.clubId || null);

            activityRows.push({
                activityType: item.activityType, activityId: item.activityId, title, date: activityDate,
                statusBucket, contributionType: item.contributionType, resultsFinal,
                participantCount: snap ? snap.participants.length : (activity.participants || []).length,
                uniqueParticipants: uniqueInActivity.size, totalParticipation: participationInActivity,
                clubId, location: activity.location || null,
            });
        });

        // --- Talabalar reytingi ---
        const studentRows = Array.from(breakdownByStudent.entries()).map(([studentId, breakdown]) => {
            const person = resolvePerson(studentId) || {};
            const placementPoints = breakdown.reduce((s, b) => s + b.placementPoints, 0);
            const participationPoints = breakdown.reduce((s, b) => s + b.participationPoints, 0);
            const placements = { 1: 0, 2: 0, 3: 0 };
            breakdown.forEach(b => { if (!b.isTeam && b.place && b.place <= 3) placements[b.place] = (placements[b.place] || 0) + 1; });
            return {
                studentId, fullName: person.fullName || studentId, faculty: person.faculty || null,
                course: person.course ?? null, group: person.group || null,
                participationCount: breakdown.length,
                firstPlaces: placements[1], secondPlaces: placements[2], thirdPlaces: placements[3],
                placementPoints, participationPoints, coveragePoints: 0, bonusPoints: 0,
                totalPoints: placementPoints + participationPoints,
                coverage: null, participation: breakdown.length,
                breakdown,
            };
        }).sort(compareByTieBreak(config.tieBreakOrder));

        // --- Fakultet/kurs/guruh/tyutor umumiy sonlari (qamrov maxraji, 11/49-band) ---
        const allStudents = db.getMockStudents();
        const facultyTotals = new Map();
        const courseTotals = new Map();
        const groupTotals = new Map();
        allStudents.forEach(s => {
            if (s.faculty) facultyTotals.set(s.faculty, (facultyTotals.get(s.faculty) || 0) + 1);
            if (s.course != null) courseTotals.set(String(s.course), (courseTotals.get(String(s.course)) || 0) + 1);
            if (s.group) groupTotals.set(s.group, (groupTotals.get(s.group) || 0) + 1);
        });
        const tutorOfGroup = new Map((dbData.tutorGroupAssignments || []).filter(a => a.active).map(a => [a.groupName, a.tutorUsername]));
        const tutorGroupTotals = new Map();
        (dbData.tutorGroupAssignments || []).filter(a => a.active).forEach(a => {
            tutorGroupTotals.set(a.tutorUsername, (tutorGroupTotals.get(a.tutorUsername) || 0) + (groupTotals.get(a.groupName) || 0));
        });

        const facultyRows = buildDimensionRows(flatRows, config, r => r.faculty, key => facultyTotals.get(key) ?? null);
        const courseRows = buildDimensionRows(flatRows, config, r => (r.course != null ? String(r.course) : null), key => courseTotals.get(key) ?? null);
        const groupRows = buildDimensionRows(flatRows, config, r => r.group, key => groupTotals.get(key) ?? null);
        const tutorRows = buildDimensionRows(flatRows, config, r => tutorOfGroup.get(r.group) || null, key => tutorGroupTotals.get(key) ?? null);

        // --- Kunlar kesimida (33-band) - qamrov kunlar yig'indisi sifatida HISOBLANMAYDI, faqat shu kunning o'zi ---
        const dailyBuckets = new Map();
        flatRows.forEach(r => {
            if (!r.date) return;
            const day = String(r.date).slice(0, 10);
            if (!dailyBuckets.has(day)) dailyBuckets.set(day, { date: day, participation: 0, uniqueStudents: new Set() });
            const b = dailyBuckets.get(day);
            b.participation += 1;
            b.uniqueStudents.add(r.studentId);
        });
        const dailyParticipation = Array.from(dailyBuckets.values())
            .map(b => ({ date: b.date, participation: b.participation, uniqueStudents: b.uniqueStudents.size }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const uniqueStudentsOverall = new Set(flatRows.map(r => r.studentId));
        const totalActiveStudents = allStudents.length;
        const overallCoveragePercent = totalActiveStudents > 0 ? (uniqueStudentsOverall.size / totalActiveStudents) * 100 : null;
        const topBy = (rows, field) => rows.length
            ? rows.reduce((best, r) => ((r[field] || 0) > (best[field] || 0) ? r : best), rows[0]) : null;

        const overview = {
            activityCount: items.length,
            totalParticipation: flatRows.length,
            uniqueStudents: uniqueStudentsOverall.size,
            coveragePercent: overallCoveragePercent,
            facultyCount: facultyRows.length,
            tutorCount: tutorRows.length,
            groupCount: groupRows.length,
            courseCount: courseRows.length,
            placementsAwarded: activityRows.filter(a => a.contributionType === 'placement' && a.resultsFinal).length,
            statusCounts: {
                upcoming: activityRows.filter(a => a.statusBucket === 'upcoming').length,
                ongoing: activityRows.filter(a => a.statusBucket === 'ongoing').length,
                closed: activityRows.filter(a => a.statusBucket === 'closed').length,
            },
            topActivity: activityRows.length
                ? activityRows.reduce((b, a) => (a.uniqueParticipants > b.uniqueParticipants ? a : b), activityRows[0]) : null,
            topFaculty: topBy(facultyRows, 'coveragePercent'),
            topTutor: topBy(tutorRows, 'coveragePercent'),
            topCourse: topBy(courseRows, 'totalPoints'),
            topGroup: topBy(groupRows, 'totalPoints'),
            topStudent: topBy(studentRows, 'totalPoints'),
        };

        return { collection, config, overview, activityRows, studentRows, facultyRows, tutorRows, courseRows, groupRows, dailyParticipation };
    },

    // Sof hisoblash bo'lgani uchun "qayta hisoblash" mohiyatan qayta-sync +
    // qayta-chaqirish - necha marta bosilsa ham natija bir xil (26-band, idempotent).
    recalculateEventCollection: async (collectionId) => {
        await db.syncCoreDataFromSupabase();
        return db.getEventCollectionAnalytics(collectionId);
    },

    // ========================================================================
    // TALABALARNI RAG'BATLANTIRISH VA MUKOFOTLASH REESTRI
    //
    // Oqim: Musobaqada ishtirok -> bayonnoma -> diplom/sertifikat -> shu yerda
    // rag'bat puli/mukofot. Koordinator/tyutor/admin TAKLIF qiladi (pending),
    // admin TASDIQLAYDI - shundagina rasmiy reestrga (Taqdirlash reestri
    // sahifasidagi tab) kiradi.
    // ========================================================================

    isStudentRecognitionsBackendReady: () => getDB().studentRecognitionsBackendReady !== false,

    // Bitta faoliyat (musobaqa) uchun tizim AVTOMATIK aniqlagan g'oliblar - lekin faqat
    // shunga tegishli DARAJALI DIPLOM/SERTIFIKAT allaqachon BERILGAN (documents.status ===
    // 'issued') bo'lsa. Oqim: ishtirok -> bayonnoma -> diplom/sertifikat -> shundan KEYIN
    // rag'bat puli. Shuning uchun manba getLeaderboard emas, `documents` jadvalining o'zi -
    // hujjat hali chiqarilmagan bo'lsa (loyiha/tasdiqlash bosqichida bo'lsa ham), bu yerda
    // umuman ko'rinmaydi, UI "qo'lda kiritish" rejimida qoladi.
    getAutoDetectedWinners: (activityType, activityId, { placesUpTo = 3 } = {}) => {
        const dbData = getDB();
        const issuedDiplomas = (dbData.documents || []).filter(d =>
            d.sourceType === activityType && d.sourceId === activityId && d.status === 'issued' &&
            d.place != null && d.place <= placesUpTo && getDocumentType(d.documentType)?.group === 'diploma'
        );
        const rows = [];
        issuedDiplomas.forEach(d => {
            if (d.isTeam && (d.members || []).length > 0) {
                d.members.forEach(m => {
                    if (!m.userId) return;
                    rows.push({
                        studentId: m.userId, fullName: m.fullName, faculty: m.faculty,
                        place: d.place, isTeam: true, teamName: d.teamName || d.recipientName,
                        participationDescription: `${d.place}-o'rin (${d.teamName || d.recipientName} jamoasi)`,
                    });
                });
            } else if (d.recipientId) {
                rows.push({
                    studentId: d.recipientId, fullName: d.recipientName, faculty: d.faculty,
                    place: d.place, isTeam: false, teamName: null,
                    participationDescription: `${d.place}-o'rin`,
                });
            }
        });
        return rows.sort((a, b) => a.place - b.place);
    },

    getStudentRecognitions: ({ kind = null, status = null, activityId = null } = {}) =>
        (getDB().studentRecognitions || [])
            .filter(r => (!kind || r.kind === kind) && (!status || r.status === status) && (!activityId || r.activityId === activityId))
            .sort((a, b) => new Date(b.proposedAt || 0) - new Date(a.proposedAt || 0)),

    proposeStudentRecognition: async ({
        kind, activityType = null, activityId = null, activityTitle = null, studentId,
        source = 'manual', place = null, participationDescription = null, amount = null,
        prizeTitle = null, proposedBy,
    }) => {
        const id = 'srec_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const { error } = await supabase.from('student_recognitions').insert({
            id, kind, activity_type: activityType, activity_id: activityId, activity_title: activityTitle,
            student_id: studentId, source, place, participation_description: participationDescription,
            amount, prize_title: prizeTitle, status: 'pending', proposed_by: proposedBy,
        });
        if (error) throw studentRecognitionTableError(error);
        await db.syncCoreDataFromSupabase();
    },

    // Faqat o'zi taklif qilgan, hali 'pending' bo'lgan yozuvni o'chira oladi (RLS shuni ta'minlaydi).
    deleteStudentRecognitionProposal: async (id) => {
        const { error } = await supabase.from('student_recognitions').delete().eq('id', id);
        if (error) throw studentRecognitionTableError(error);
        await db.syncCoreDataFromSupabase();
    },

    // Faqat admin - security definer RPC ichida tekshiriladi (SQL faylda).
    reviewStudentRecognition: async ({ id, status, reviewedBy, comment = null }) => {
        const { error } = await supabase.rpc('review_student_recognition', {
            p_id: id, p_status: status, p_reviewed_by: reviewedBy, p_comment: comment,
        });
        if (error) throw studentRecognitionTableError(error);
        await db.syncCoreDataFromSupabase();
    },

    // --- Tasdiqlangan reestrlar (Taqdirlash reestri sahifasidagi tablar uchun) ---
    // Har biri talabaning haqiqiy pasport ma'lumotlari (JSHSHIR/passport/to'lov shakli)
    // bilan BIRLASHTIRILADI - qayta kiritilmaydi, mavjud manbadan o'qiladi
    // (getStudentPassportRaw - rasmiy hujjat, shuning uchun filtrlanmagan holda).
    getApprovedRecognitionRegistry: (kind) => {
        const dbData = getDB();
        const studentById = new Map(db.getMockStudents().map(s => [s.id, s]));
        const profileById = new Map(db.getSyncedProfiles().map(p => [p.id, p]));
        return (dbData.studentRecognitions || [])
            .filter(r => r.kind === kind && r.status === 'approved')
            .map(r => {
                const student = studentById.get(r.studentId) || profileById.get(r.studentId) || {};
                const passport = db.getStudentPassportRaw(r.studentId);
                const sections = passport?.sections || {};
                return {
                    ...r,
                    fullName: student.fullName || r.studentId,
                    faculty: student.faculty || null,
                    course: student.course ?? null,
                    group: student.group || null,
                    jshshir: sections['identity.jshshir'] || null,
                    passportNumber: sections['identity.passport'] || null,
                    paymentForm: sections['education.paymentForm'] || null,
                };
            })
            .sort((a, b) => new Date(b.reviewedAt || 0) - new Date(a.reviewedAt || 0));
    },

    // --- Stipendiya/grant oluvchilar (mavjud stipendiya moduli ustidan o'qish, dublikat emas) ---
    getScholarshipRecipients: () => {
        const dbData = getDB();
        const grantById = new Map((dbData.scholarshipGrants || []).map(g => [g.id, g]));
        const studentById = new Map(db.getMockStudents().map(s => [s.id, s]));
        const profileById = new Map(db.getSyncedProfiles().map(p => [p.id, p]));
        return (dbData.scholarshipApplications || [])
            .filter(a => a.status === 'approved')
            .map(a => {
                const student = studentById.get(a.studentId) || profileById.get(a.studentId) || {};
                const grant = grantById.get(a.grantId) || {};
                return {
                    id: a.id, studentId: a.studentId, fullName: student.fullName || a.studentId,
                    faculty: student.faculty || a.faculty || null, grantTitle: grant.title || a.grantTitle || null,
                    amount: grant.amount || null, approvedAt: a.updatedAt || a.submittedAt || null,
                };
            });
    },

    // --- Ro'yxatdan o'tgan klublar reestri (mavjud klub ro'yxatga olish moduli ustidan o'qish) ---
    getIssuedClubCertificates: () => {
        const dbData = getDB();
        return (dbData.clubs || [])
            .filter(c => !!c.registryNumber)
            .map(c => {
                const cert = (dbData.clubCertificates || []).find(cc => cc.clubId === c.id && cc.status !== 'revoked');
                return {
                    clubId: c.id, clubName: c.name, registryNumber: c.registryNumber,
                    certificateNumber: cert?.certificateNumber || null, issuedAt: cert?.issuedAt || c.registeredAt || null,
                    issuedBy: cert?.issuedBy || null, status: cert?.status || (c.registryNumber ? 'registered' : null),
                };
            });
    },

    // ========================================================================
    // FOYDALANUVCHI AKKAUNTLARINI BOSHQARISH (faqat admin)
    //
    // O'z-o'zidan ro'yxatdan o'tish yopilgan - akkauntni admin yaratadi.
    // Yaratish/rol berish/parol almashtirish `security definer` RPC'lar orqali
    // (supabase/admin_user_management.sql), chunki brauzerdagi `anon` kalit
    // foydalanuvchi yarata olmaydi va `service_role` kalitini mijoz kodiga
    // qo'yish mumkin emas. Har bir RPC ichida `is_platform_admin()` tekshiriladi.
    // ========================================================================

    // --- BILDIRISHNOMA SOZLAMALARI ---
    //
    // Sozlama TUR bo'yicha (config/notificationTypes.js), tab bo'yicha emas - sabab
    // o'sha faylning boshida yozilgan.
    //
    // Hozircha QURILMA bo'yicha saqlanadi, `queueSeen` bilan bir xil sabab: uni
    // akkauntga bog'lash uchun Supabase'da alohida jadval kerak. Jadval qo'shilganda
    // shu ikki funksiyaning ichi almashadi, chaqiruvchi kod tegilmaydi.
    getNotificationPrefs: (username) =>
        resolveNotificationPrefs((getDB().notificationPrefs || {})[username]),

    setNotificationPref: (username, typeId, enabled) => {
        if (!username) return;
        // O'chirib bo'lmaydigan turni o'chirish urinishi JIM RAD ETILADI - UI ham uni
        // ko'rsatmaydi, lekin himoya ikki joyda turgani ma'qul.
        if (NOTIFICATION_TYPES[typeId] && NOTIFICATION_TYPES[typeId].optional === false) return;

        // Avval MAHALLIY yoziladi - tugma darhol javob berishi kerak, tarmoqni
        // kutib turmasligi kerak.
        const dbData = getDB();
        dbData.notificationPrefs = dbData.notificationPrefs || {};
        dbData.notificationPrefs[username] = {
            ...(dbData.notificationPrefs[username] || {}),
            [typeId]: !!enabled,
        };
        saveDB(dbData);

        // Keyin BAZAGA. Bu shart: muddat eslatmalarini pg_cron yuboradi va u
        // brauzerdagi sozlamani ko'ra olmaydi. Faqat mahalliy saqlansa, tugma
        // "ishlayotgandek" ko'rinib, aslida eslatmalarga ta'sir qilmasdi.
        //
        // Jadval hali yaratilmagan bo'lsa (SQL ishga tushirilmagan) - jim
        // o'tkazib yuboriladi, mahalliy sozlama baribir ishlaydi.
        supabase.from('notification_preferences').upsert({
            username, type_id: typeId, enabled: !!enabled, updated_at: new Date().toISOString(),
        }, { onConflict: 'username,type_id' }).then(({ error }) => {
            if (error) console.warn('Bildirishnoma sozlamasi bazaga yozilmadi:', error.message);
        });
    },

    // Xabar yuborishdan OLDIN chaqiriladi. Bitta joyda turadi, chunki tekshiruvni
    // har bir yaratish nuqtasida takrorlash - o'sha nuqtalardan birini unutish demak.
    wantsNotification: (username, typeId) => {
        if (!username || !typeId) return true;
        const t = NOTIFICATION_TYPES[typeId];
        if (t && t.optional === false) return true;
        return db.getNotificationPrefs(username)[typeId] !== false;
    },

    // --- ISH NAVBATI: "o'qildi" belgilari ---
    //
    // Menyudagi qizil raqam JAMI ishni emas, YANGI ishni ko'rsatadi: foydalanuvchi
    // tegishli tabni ochgach raqam yo'qoladi, yangi ariza kelsa qaytadan chiqadi.
    // Shuning uchun har bir navbat uchun "oxirgi marta qachon ko'rilgan" saqlanadi
    // va undan keyin kelgan yozuvlargina sanaladi (utils/workQueue.js).
    //
    // Jami son bo'lim ichida baribir ko'rinib turadi - ya'ni ish unutilmaydi,
    // badge faqat "yangi nima bor" degan savolga javob beradi.
    //
    // QURILMA bo'yicha saqlanadi: "o'qildi" shaxsiy holat va uni serverga yozish
    // uchun alohida jadval kerak bo'lardi. Boshqa qurilmada raqam qaytadan chiqadi.
    getQueueSeenAt: (username) => ((getDB().queueSeen || {})[username] || {}),

    markQueueSeen: (username, keys) => {
        if (!username || !keys || keys.length === 0) return;
        const dbData = getDB();
        dbData.queueSeen = dbData.queueSeen || {};
        const mine = { ...(dbData.queueSeen[username] || {}) };
        const now = new Date().toISOString();
        keys.forEach(k => { mine[k] = now; });
        dbData.queueSeen[username] = mine;
        saveDB(dbData);
    },

    getAllUserAccounts: () => (getDB().realProfiles || [])
        .slice()
        .sort((a, b) => String(a.username || '').localeCompare(String(b.username || ''))),

    adminCreateUser: async ({ username, password, fullName = '', role = 'TALABA' }) => {
        const { data, error } = await supabase.rpc('admin_create_user', {
            p_username: username, p_password: password, p_full_name: fullName, p_role: role,
        });
        if (error) throw userManagementError(error);
        await db.syncCoreDataFromSupabase();
        return data;
    },

    adminSetUserRole: async (userId, role) => {
        const { error } = await supabase.rpc('admin_set_user_role', { p_user_id: userId, p_role: role });
        if (error) throw userManagementError(error);
        await db.syncCoreDataFromSupabase();
    },

    // Bloklash - ASOSIY yo'l. Odam kira olmaydi, lekin hamma yozuvi joyida
    // qoladi: diplomi tekshirilaveradi, indeks hisobi tarixda turadi.
    // Supabase auth'ning o'z `banned_until` mexanizmi ishlatiladi.
    adminSetUserBlocked: async (userId, blocked) => {
        const { error } = await supabase.rpc('admin_set_user_blocked', {
            p_user_id: userId, p_blocked: !!blocked,
        });
        if (error) throw userManagementError(error);
        await syncCoreDataFromSupabase();
    },

    // Akkauntda qanday tarix borligi. O'chirish tugmasi bosilishidan OLDIN
    // ko'rsatiladi: admin nima uchun o'chira olmayotganini bilishi kerak,
    // shunchaki "bo'lmaydi" degan javob uni Supabase konsoliga haydaydi -
    // u yerda esa hech qanday tekshiruv yo'q.
    // Bloklanganlar ro'yxati. Holat `auth.users.banned_until` da turadi, profil
    // yozuvida emas - shuning uchun uni alohida so'rash kerak, aks holda UI kim
    // bloklanganini umuman bilmaydi va tugma har doim "Bloklash" deb turardi.
    adminBlockedUserIds: async () => {
        const { data, error } = await supabase.rpc('admin_blocked_user_ids');
        if (error) throw userManagementError(error);
        return new Set((data || []).map(r => r.user_id));
    },

    adminUserHistory: async (userId) => {
        const { data, error } = await supabase.rpc('admin_user_history', { p_user_id: userId });
        if (error) throw userManagementError(error);
        return data || [];
    },

    // O'chirish - FAQAT tarixi yo'q akkaunt uchun. Tekshiruv serverda ham
    // takrorlanadi (admin_delete_user): UI dagi himoya yetarli emas.
    adminDeleteUser: async (userId) => {
        const { error } = await supabase.rpc('admin_delete_user', { p_user_id: userId });
        if (error) throw userManagementError(error);
        await syncCoreDataFromSupabase();
    },

    adminResetUserPassword: async (userId, password) => {
        const { error } = await supabase.rpc('admin_reset_user_password', {
            p_user_id: userId, p_password: password,
        });
        if (error) throw userManagementError(error);
    },

    // ADMIN UTILS
    resetDB: () => {
        localStorage.removeItem(DB_KEY);
        getDB(); // Reinitialize
    }
};
