import { SOCIAL_APPLICATION_STATUS } from '../services/db';

// "Talaba Analitik Skori (TAS)" — composite 0-1000 score shown on two separate surfaces (the admin's
// student-detail modal in StudentsManagement.jsx, and the student's own "Mening profilim" page) that
// MUST show identical numbers for the same student. Pulled into a shared util for exactly that reason.
//
// Two of the four components are 100% real, already-existing data (never randomized):
//   - Liderlik skori  <- db.getStudentPortfolio(studentId).workloadIndex (real active club positions)
//   - Faoliyat tarixi / Yutuqlar <- db.getSocialApplications() approved entries (real submissions)
// The other two (Akademik, Ijtimoiy faollik) and Ishonchlilik have no real persisted GPA/attendance
// model anywhere in db.js yet, so they're backed by a deterministic-per-student pseudo-random proxy
// (seeded from the student id, NOT Math.random()) — same idiom StudentsManagement.jsx's own mock
// enrichment already uses, just made stable across the two surfaces instead of per-mount-random.
const seededRandom = (seedStr) => {
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) {
        h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return () => {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    };
};

const MONTH_ABBR = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
export const getTasTrendMonths = () => {
    const now = new Date();
    const labels = [];
    for (let i = 5; i >= 0; i--) {
        labels.push(MONTH_ABBR[new Date(now.getFullYear(), now.getMonth() - i, 1).getMonth()]);
    }
    return labels;
};

export const TAS_TIERS = [
    { label: 'Bronze', range: '0-399' },
    { label: 'Silver', range: '400-599' },
    { label: 'Gold', range: '600-799' },
    { label: 'Platinum', range: '800-1000' }
];

// Shared threshold logic — exported so rankingsAnalytics.js (faculty/course/club averages) can label a
// group's average TAS with the same tiers a student sees on their own score, without duplicating the
// cutoffs in a second place.
export const tierForTotal = (total) =>
    total >= 800 ? 'Platinum' : total >= 600 ? 'Gold' : total >= 400 ? 'Silver' : 'Bronze';

// One suggestion per under-filled category (>20-point gap from its own max), largest gap first, capped
// at 3 — "Rivojlanish tavsiyalari". The point-gain estimate is 40% of the remaining gap, a plausible
// near-term improvement rather than the full (unrealistic) distance to the category's max.
const RECOMMENDATION_META = {
    academic: { max: 400, label: "GPA ko'rsatkichini 3.8+ ga yetkazing", dimension: 'Akademik' },
    social: { max: 300, label: 'Kelgusi oyda 2 ta tadbirda ishtirok eting', dimension: 'Faollik' },
    leadership: { max: 150, label: 'Klub koordinatori sifatida faoliyatni kuchaytiring', dimension: 'Liderlik' },
    reliability: { max: 150, label: 'Davomatni yuqori darajada ushlab turing', dimension: 'Ishonchlilik' }
};
const buildRecommendations = (scores) => {
    const rows = Object.entries(RECOMMENDATION_META).map(([key, meta]) => ({
        key, ...meta, value: scores[key], gap: meta.max - scores[key]
    }));
    return rows
        .filter(r => r.gap > 20)
        .sort((a, b) => b.gap - a.gap)
        .slice(0, 3)
        .map(r => ({ text: r.label, detail: `${r.dimension} scoringiz +${Math.max(5, Math.round(r.gap * 0.4))} ballgacha oshadi` }));
};

export const computeStudentTAS = (db, studentId) => {
    const rand = seededRandom(studentId);
    const socialCategories = db.getSocialCriteriaCategories().filter(c => c.isActive && !c.isArchived);
    const criteria = socialCategories.map(c => ({ ...c, score: Math.floor(rand() * (c.maxPoints + 1)) }));
    const criteriaMax = criteria.reduce((sum, c) => sum + c.maxPoints, 0);
    const criteriaSum = criteria.reduce((sum, c) => sum + c.score, 0);
    const gpaProxy = 2.5 + rand() * 1.5;
    const attendanceProxy = 60 + rand() * 40;
    const workloadIndex = db.getStudentPortfolio(studentId).workloadIndex;

    const academic = Math.round((Math.min(gpaProxy, 4) / 4) * 400);
    const social = Math.round((criteriaSum / criteriaMax) * 300);
    const leadership = Math.min(150, workloadIndex * 50);
    const reliability = Math.round((attendanceProxy / 100) * 150);
    const total = academic + social + leadership + reliability;
    const tier = tierForTotal(total);

    // 6-month trend ending at `total` — no historical score-snapshot system exists yet, so earlier
    // months are a plausible synthetic ramp (disclosed simplification; the activity/achievement lists
    // below ARE real, unlike this trend).
    const trend = [];
    let running = Math.max(50, total - Math.floor(60 + rand() * 100));
    for (let m = 0; m < 5; m++) {
        trend.push(Math.round(running));
        running += (total - running) / (5 - m) + (rand() * 10 - 5);
    }
    trend.push(total);
    const delta = total - trend[trend.length - 2];

    const approvedApps = db.getSocialApplications()
        .filter(a => a.studentId === studentId && a.status === SOCIAL_APPLICATION_STATUS.APPROVED)
        .sort((a, b) => new Date(b.reviewedAt || b.submittedAt) - new Date(a.reviewedAt || a.submittedAt));
    const activityHistory = approvedApps.slice(0, 5).map(a => ({
        date: a.reviewedAt || a.submittedAt, title: a.activityTitle, delta: a.pointsAwarded || 0
    }));
    const achievements = [...approvedApps]
        .sort((a, b) => (b.pointsAwarded || 0) - (a.pointsAwarded || 0))
        .slice(0, 3)
        .map(a => ({ title: a.activityTitle, subtitle: socialCategories.find(c => c.key === a.criteriaKey)?.name || '' }));

    return {
        total, tier,
        academicScore: academic, socialFaollikScore: social, leadershipScore: leadership, reliabilityScore: reliability,
        trend, delta, activityHistory, achievements,
        recommendations: buildRecommendations({ academic, social, leadership, reliability })
    };
};
