// Real-data aggregations for the "Reytinglar" page (Fakultetlar / Kurslar / Global klublar /
// Kategoriyalar tabs) — built entirely on top of computeStudentTAS (studentScoring.js, untouched logic)
// and existing db.js getters. No new persisted data model, no Math.random() score fabrication anywhere
// in this file (the RankingsPage.jsx tabs that previously used Math.random() are what this replaces).
import { computeStudentTAS } from './studentScoring';

// "Faol" (active) — a student counts as active when they have at least one real APPROVED social
// activity submission (db.getSocialApplications()). Deliberately not "tas.total > 0": TAS is a
// composite of four separate dimensions, so a student with only a GPA on file already scores
// several hundred points without having taken part in anything — that would make "active" mean
// almost every student, which is useless as a filter.
const isStudentActive = (db, studentId) =>
    db.getSocialApplications().some(a => a.studentId === studentId && a.status === 'Approved');

// One pass over every student, computing TAS + activity + real participation counts once — every
// per-group aggregator below (faculty/course/club/category) takes these same rows rather than `db`
// directly, so RankingsPage.jsx can compute this once (in its own useMemo) and hand it to all four tabs
// instead of recomputing computeStudentTAS for all ~550 students four separate times.
export const getStudentTasRows = (db) => {
    const students = db.getMockStudents();
    const allRegs = db.getAllRegistrations() || [];
    const participationsByStudent = new Map();
    const addParticipation = (userId) => participationsByStudent.set(userId, (participationsByStudent.get(userId) || 0) + 1);
    allRegs.forEach(r => {
        if (r.status !== 'registered') return;
        addParticipation(r.userId);
        (r.teamMembers || []).filter(m => m.status === 'accepted').forEach(m => addParticipation(m.userId));
    });

    return students.map(student => ({
        student,
        tas: computeStudentTAS(db, student.id),
        isActive: isStudentActive(db, student.id),
        participations: participationsByStudent.get(student.id) || 0
    }));
};

// Every TEAM-type competition assigns its score to the team as a whole (one competitionScores row per
// team per round — true for correct_answer/quiz_mixed/criteria_based/single_score alike; match_play/
// debate_match are also always team-type, per their locked `participantType`), so a real registration
// alone never proves any specific member showed up — only db.js's activityAttendance ('present' rows,
// see the Davomat feature) does. Individual-type competitions keep this file's existing "registered =
// real participation" convention (getStudentTasRows above), since a score there is already provably
// per-person. Plain events never auto-prove individual attendance via registration alone — Davomat is
// the only real signal for them, matching the whole point of that feature.
const needsAttendanceProof = (activity, activityType) => activityType === 'event' || activity.type === 'team';

// End-of-year "N ta tadbirga, M ta musobaqaga ishtirok etgan" report — real-data-only union of (a)
// directly-provable registrations (see needsAttendanceProof) and (b) db.activityAttendance 'present'
// rows for the given calendar year, deduped by activity so a person marked present at two different
// leaf units of the same competition (e.g. two rounds) is still counted once. Replaces
// StudentsManagement.jsx's fabricated `eventsAttended: Math.floor(Math.random()*12)`.
export const getStudentAttendanceParticipationSummary = (db, studentId, year) => {
    const eventsById = new Map(db.getEvents().map(e => [e.id, e]));
    const competitionsById = new Map(db.getCompetitions().map(c => [c.id, c]));
    const isInYear = (dateStr) => !!dateStr && new Date(dateStr).getFullYear() === year;
    const resolveActivity = (activityId, activityType) => (activityType === 'competition' ? competitionsById.get(activityId) : eventsById.get(activityId));
    const resolveDate = (activity, activityType) => (activityType === 'competition' ? db.combineDateTime(activity.startDate, activity.startTime) : activity.date);
    const resolveClubId = (activity, activityType) => (activityType === 'competition' ? (activity.contextType === 'club' ? activity.contextId : null) : activity.clubId);

    const counted = new Map(); // `${activityType}_${activityId}` -> { activityType, clubId }

    (db.getAllRegistrations() || []).forEach(r => {
        if (r.status !== 'registered') return;
        const isDirectRegistrant = r.userId === studentId;
        const isAcceptedTeammate = (r.teamMembers || []).some(m => m.userId === studentId && m.status === 'accepted');
        if (!isDirectRegistrant && !isAcceptedTeammate) return;
        const activity = resolveActivity(r.activityId, r.activityType);
        if (!activity || !isInYear(resolveDate(activity, r.activityType)) || needsAttendanceProof(activity, r.activityType)) return;
        counted.set(`${r.activityType}_${r.activityId}`, { activityType: r.activityType, clubId: resolveClubId(activity, r.activityType) });
    });

    (db.getAttendanceForParticipant(studentId) || []).filter(a => a.status === 'present').forEach(a => {
        const activity = resolveActivity(a.activityId, a.activityType);
        if (!activity || !isInYear(resolveDate(activity, a.activityType))) return;
        counted.set(`${a.activityType}_${a.activityId}`, { activityType: a.activityType, clubId: resolveClubId(activity, a.activityType) });
    });

    const rows = Array.from(counted.values());
    const byClub = new Map();
    rows.forEach(r => { if (r.clubId) byClub.set(r.clubId, (byClub.get(r.clubId) || 0) + 1); });

    return {
        year,
        totalCount: rows.length,
        eventsCount: rows.filter(r => r.activityType === 'event').length,
        competitionsCount: rows.filter(r => r.activityType === 'competition').length,
        byClub: Array.from(byClub.entries()).map(([clubId, count]) => ({ clubId, count }))
    };
};

const groupAndRank = (rows, keyFn) => {
    const groups = new Map();
    rows.forEach(row => {
        const key = keyFn(row);
        if (key == null) return;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    });
    const result = Array.from(groups.entries()).map(([key, list]) => {
        const avgTas = Math.round(list.reduce((s, r) => s + r.tas.total, 0) / list.length);
        const activeCount = list.filter(r => r.isActive).length;
        const totalParticipations = list.reduce((s, r) => s + r.participations, 0);
        return {
            key,
            studentCount: list.length,
            activeCount,
            totalParticipations,
            avgTas,
            // O'sish foizi hisoblanmaydi: u talabaning TAS `delta`sidan chiqardi, `delta` esa
            // tarixiy TAS suratlaridan chiqishi kerak — bunday suratlar tizimi hali yo'q
            // (studentScoring.js, `delta: null`). Ilgari bu yerdagi raqam sun'iy 6 oylik
            // chiziqdan olingan edi. `null` — GrowthBadge uni "—" deb chizadi.
            growthPct: null,
            // "Faollik indeksi" (spec): (qatnashuvlar / faol talabalar) * (o'rtacha TAS / 100) — rewards
            // groups where the genuinely active students are ALSO participating a lot and scoring high,
            // rather than just having a big headcount.
            activityIndex: activeCount > 0 ? Math.round((totalParticipations / activeCount) * (avgTas / 100) * 10) / 10 : 0
        };
    });
    result.sort((a, b) => b.avgTas - a.avgTas);
    return result.map((r, i) => ({ ...r, rank: i + 1 }));
};

export const getFacultyRankings = (rows) =>
    groupAndRank(rows, r => r.student.faculty).map(r => ({ ...r, faculty: r.key }));

export const getCourseRankings = (rows) =>
    groupAndRank(rows, r => r.student.course).map(r => ({ ...r, course: r.key }));

// Same "Jami qatnashuvlar" convention already used by src/utils/clubAnalytics.js's
// clubTotalParticipations (event.participants + competition.participants, team-based competitions
// counted as teams not individuals) — kept as a small local copy rather than importing clubAnalytics.js,
// since that file's version is filter-aware (faculty/course/clubId scoping) and this only ever needs the
// unfiltered per-club total.
const clubTotalParticipations = (db, clubId) => {
    const events = db.getClubEvents(clubId);
    const competitions = db.getClubCompetitions(clubId);
    return events.reduce((s, e) => s + (e.participants || []).length, 0)
        + competitions.reduce((s, c) => s + (c.participants || []).length, 0);
};

export const getClubTasRankings = (db, rows) => {
    const rowByStudentId = new Map(rows.map(r => [r.student.id, r]));
    const clubs = db.getClubs();

    const ranked = clubs.map(club => {
        const members = db.getClubMembers(club.id);
        const memberRows = members.map(m => rowByStudentId.get(m.userId)).filter(Boolean);
        const avgTas = memberRows.length ? Math.round(memberRows.reduce((s, r) => s + r.tas.total, 0) / memberRows.length) : 0;
        return {
            club,
            memberCount: members.length,
            activeMembers: memberRows.filter(r => r.isActive).length,
            avgTas,
            growthPct: null,
            activities: db.getClubEvents(club.id).length + db.getClubCompetitions(club.id).length,
            totalParticipations: clubTotalParticipations(db, club.id),
            achievements: db.getClubAchievements(club.id).length
        };
    });
    ranked.sort((a, b) => b.avgTas - a.avgTas);
    return ranked.map((r, i) => ({ ...r, rank: i + 1 }));
};

// The platform's "Besh tashabbus" framing (see constants/index.js SOCIAL_ACTIVITY_CRITERIA.CLUBS —
// "5 muhim tashabbus to'garaklari: Madaniyat, sport, IT, kitobxonlik, bandlik") doesn't correspond to a
// real 1:1 field anywhere — club.category has many more real values (San'at, Sport, IT, Kitobxonlik,
// Volontyorlik, Biznes, Notiqlik, Ma'rifat, Yuridik, Intellektual, ...). This bucket map is the most
// faithful real grouping available: the 4 categories with an obvious 1:1 match, everything else folded
// into "Bandlik" (employment/initiative clubs — Biznes, Volontyorlik, and the rest) rather than
// inventing extra buckets the spec didn't ask for.
export const TASHABBUS_CATEGORIES = ['Madaniyat', 'Sport', 'IT', 'Kitobxonlik', 'Bandlik'];
const CATEGORY_BUCKET_MAP = { "San'at": 'Madaniyat', Sport: 'Sport', IT: 'IT', Kitobxonlik: 'Kitobxonlik' };
const bucketForCategory = (category) => CATEGORY_BUCKET_MAP[category] || 'Bandlik';

export const getCategoryRankings = (db, rows) => {
    const rowByStudentId = new Map(rows.map(r => [r.student.id, r]));
    const clubs = db.getClubs();

    const clubsByBucket = new Map(TASHABBUS_CATEGORIES.map(c => [c, []]));
    clubs.forEach(club => clubsByBucket.get(bucketForCategory(club.category)).push(club));

    return TASHABBUS_CATEGORIES.map(name => {
        const bucketClubs = clubsByBucket.get(name) || [];
        const memberIds = new Set();
        let totalParticipations = 0;
        bucketClubs.forEach(club => {
            db.getClubMembers(club.id).forEach(m => memberIds.add(m.userId));
            totalParticipations += clubTotalParticipations(db, club.id);
        });
        const memberRows = Array.from(memberIds).map(id => rowByStudentId.get(id)).filter(Boolean);
        const avgTas = memberRows.length ? Math.round(memberRows.reduce((s, r) => s + r.tas.total, 0) / memberRows.length) : 0;
        return {
            name,
            clubCount: bucketClubs.length,
            studentCount: memberIds.size,
            activeStudents: memberRows.filter(r => r.isActive).length,
            totalParticipations,
            avgTas,
            growthPct: null
        };
    });
};
