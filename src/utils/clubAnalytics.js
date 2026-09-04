// Derived analytics for the admin "Klublar analitikasi" tab. Pure functions only — every number here
// is computed on the fly from data db.js already exposes (clubs, events, competitions, registrations,
// clubPositions/clubPositionApplications, clubPositionAssignments, getStudentPortfolio,
// getClubUniqueCoverage). No new persisted data model; this file is a read-only aggregation layer.
//
// Every exported function accepts an optional `filters = { clubId, faculty, course }` object (all
// optional/nullable). `clubId` structurally narrows which clubs/events/competitions/registrations are
// considered at all; `faculty`/`course` narrow which STUDENTS count, applied per-participant via
// `matches()`. Passing no filters reproduces the original unfiltered numbers exactly.
//
// Methodology notes (deliberate, disclosed simplifications — not bugs):
// - "Jami qatnashuvlar" (total participations, duplicates counted) uses event.participants.length +
//   competition.participants.length, the exact same convention already shipped on ClubProfilePage's
//   own "Jami qatnashuvlar" KPI card — kept consistent rather than inventing a second definition.
//   For team-based competitions, `participants` holds team entries (not individual student ids), so
//   those can't be individually matched against a faculty/course filter — they're counted as-is
//   regardless of faculty/course (a disclosed limitation of the underlying data shape, not this file).
// - "Haqiqiy ishtirokchilar" / cross-club overlap needs real individual student ids, which team-based
//   `competition.participants` can't provide. Built instead from the unified `registrations[]` layer
//   (top-level registrant id + accepted teamMembers) unioned with event.participants (always individual
//   ids) and club memberships — the most complete individual-student picture derivable from existing data.
// - When `clubId` is set, cross-club-overlap-style metrics are computed strictly WITHIN that club's own
//   scope (by design — the filter narrows the analysis universe for every metric uniformly), so overlap
//   naturally reads near-zero for a single selected club. That is expected, not a bug.

const DAY_MS = 86400000;

const studentMatches = (studentById, filters, studentId) => {
    if (!filters?.faculty && !filters?.course) return true;
    const s = studentById.get(studentId);
    if (!s) return false;
    if (filters.faculty && s.faculty !== filters.faculty) return false;
    if (filters.course && s.course !== Number(filters.course)) return false;
    return true;
};

const clubDirectClub = (activityType, activityId, eventClubById, compClubById) =>
    activityType === 'event' ? eventClubById.get(activityId) : compClubById.get(activityId);

// The shared, filter-aware scope every other function builds on.
const buildLookups = (db, filters = {}) => {
    const studentById = new Map(db.getMockStudents().map(s => [s.id, s]));
    const matches = (studentId) => studentMatches(studentById, filters, studentId);

    let clubs = db.getClubs();
    if (filters.clubId) clubs = clubs.filter(c => c.id === filters.clubId);
    const clubIdSet = new Set(clubs.map(c => c.id));

    const events = db.getEvents().filter(e => clubIdSet.has(e.clubId));
    const competitions = db.getCompetitions().filter(c => c.contextType === 'club' && clubIdSet.has(c.contextId));

    const eventsByClub = new Map();
    const compsByClub = new Map();
    events.forEach(e => {
        if (!eventsByClub.has(e.clubId)) eventsByClub.set(e.clubId, []);
        eventsByClub.get(e.clubId).push(e);
    });
    competitions.forEach(c => {
        if (!compsByClub.has(c.contextId)) compsByClub.set(c.contextId, []);
        compsByClub.get(c.contextId).push(c);
    });

    const eventClubById = new Map(events.map(e => [e.id, e.clubId]));
    const compClubById = new Map(competitions.map(c => [c.id, c.contextId]));
    const eventIdSet = new Set(events.map(e => e.id));
    const compIdSet = new Set(competitions.map(c => c.id));

    const registrations = (db.getAllRegistrations() || []).filter(r =>
        r.status === 'registered' &&
        ((r.activityType === 'event' && eventIdSet.has(r.activityId)) || (r.activityType === 'competition' && compIdSet.has(r.activityId)))
    );

    return { clubs, events, competitions, eventsByClub, compsByClub, eventClubById, compClubById, registrations, studentById, matches, filters };
};

// Map<studentId, Set<clubId>> — the shared building block for unique-participant / cross-club metrics.
const buildStudentClubMap = (lookups) => {
    const map = new Map();
    const add = (studentId, clubId) => {
        if (!studentId || !clubId || !lookups.matches(studentId)) return;
        if (!map.has(studentId)) map.set(studentId, new Set());
        map.get(studentId).add(clubId);
    };
    lookups.events.forEach(e => (e.participants || []).forEach(p => add(p.userId, e.clubId)));
    lookups.registrations.forEach(r => {
        const clubId = clubDirectClub(r.activityType, r.activityId, lookups.eventClubById, lookups.compClubById);
        add(r.userId, clubId);
        (r.teamMembers || []).filter(m => m.status === 'accepted').forEach(m => add(m.userId, clubId));
    });
    return map;
};

const clubTotalParticipations = (lookups, clubId) =>
    (lookups.eventsByClub.get(clubId) || []).reduce((sum, e) => sum + (e.participants || []).filter(p => lookups.matches(p.userId)).length, 0)
    + (lookups.compsByClub.get(clubId) || []).reduce((sum, c) => sum + (c.participants || []).length, 0);

// Mirrors db.getClubUniqueCoverage's definition (members ∪ event participants ∪ registration
// participants) but filter-aware and scoped to an already-filtered `lookups`.
const clubUniqueParticipantIds = (db, lookups, clubId) => {
    const ids = new Set();
    db.getClubMembers(clubId).forEach(m => { if (lookups.matches(m.userId)) ids.add(m.userId); });
    (lookups.eventsByClub.get(clubId) || []).forEach(e => (e.participants || []).forEach(p => { if (lookups.matches(p.userId)) ids.add(p.userId); }));
    lookups.registrations
        .filter(r => clubDirectClub(r.activityType, r.activityId, lookups.eventClubById, lookups.compClubById) === clubId)
        .forEach(r => {
            if (lookups.matches(r.userId)) ids.add(r.userId);
            (r.teamMembers || []).filter(m => m.status === 'accepted' && lookups.matches(m.userId)).forEach(m => ids.add(m.userId));
        });
    return ids;
};

// ================================================================================================
// Filter option sources
// ================================================================================================
export const getFacultyOptions = (db) => Array.from(new Set(db.getMockStudents().map(s => s.faculty))).sort();
export const getCourseOptions = () => [1, 2, 3, 4];

// ================================================================================================
// 2. University-wide KPI cards
// ================================================================================================
export const getUniversityKPIs = (db, filters = {}) => {
    const lookups = buildLookups(db, filters);
    const activeClubsCount = lookups.clubs.filter(c => (c.membersCount || 0) > 0).length;
    const totalActivities = lookups.events.length + lookups.competitions.length;
    const totalParticipations = lookups.clubs.reduce((sum, c) => sum + clubTotalParticipations(lookups, c.id), 0);
    const studentClubMap = buildStudentClubMap(lookups);
    const uniqueParticipants = studentClubMap.size;
    const crossClubOverlap = Array.from(studentClubMap.values()).filter(set => set.size >= 2).length;

    return { activeClubsCount, totalActivities, totalParticipations, uniqueParticipants, crossClubOverlap };
};

// ================================================================================================
// KPI drill-down breakdowns (spec follow-up: clicking a KPI card shows what's behind it)
// ================================================================================================
export const getActiveClubsBreakdown = (db, filters = {}) => {
    const lookups = buildLookups(db, filters);
    return lookups.clubs
        .filter(c => (c.membersCount || 0) > 0)
        .map(c => ({
            clubId: c.id, clubName: c.name, membersCount: c.membersCount || 0,
            activities: (lookups.eventsByClub.get(c.id)?.length || 0) + (lookups.compsByClub.get(c.id)?.length || 0)
        }))
        .sort((a, b) => b.activities - a.activities);
};

export const getActivitiesBreakdown = (db, filters = {}) => {
    const lookups = buildLookups(db, filters);
    const clubById = new Map(lookups.clubs.map(c => [c.id, c]));
    const fromEvents = lookups.events.map(e => ({ id: 'e_' + e.id, type: 'event', name: e.title, clubName: clubById.get(e.clubId)?.name, date: e.date }));
    const fromComps = lookups.competitions.map(c => ({
        id: 'c_' + c.id, type: 'competition', name: c.name, clubName: clubById.get(c.contextId)?.name,
        date: c.startDate ? db.combineDateTime(c.startDate, c.startTime) : c.createdAt
    }));
    return [...fromEvents, ...fromComps].filter(a => a.date).sort((a, b) => new Date(b.date) - new Date(a.date));
};

export const getParticipationsBreakdown = (db, filters = {}) => {
    const lookups = buildLookups(db, filters);
    return lookups.clubs
        .map(c => ({ clubId: c.id, clubName: c.name, participations: clubTotalParticipations(lookups, c.id) }))
        .filter(r => r.participations > 0)
        .sort((a, b) => b.participations - a.participations);
};

export const getUniqueParticipantsBreakdown = (db, filters = {}) => {
    const lookups = buildLookups(db, filters);
    const studentClubMap = buildStudentClubMap(lookups);
    return Array.from(studentClubMap.entries()).map(([studentId, clubIdSet]) => {
        const student = lookups.studentById.get(studentId);
        return {
            studentId, fullName: student?.fullName || studentId, faculty: student?.faculty, course: student?.course,
            clubsCount: clubIdSet.size
        };
    }).sort((a, b) => b.clubsCount - a.clubsCount);
};

export const getCrossClubOverlapBreakdown = (db, filters = {}) => {
    const lookups = buildLookups(db, filters);
    const studentClubMap = buildStudentClubMap(lookups);
    const clubNameById = new Map(lookups.clubs.map(c => [c.id, c.name]));
    return Array.from(studentClubMap.entries())
        .filter(([, clubIdSet]) => clubIdSet.size >= 2)
        .map(([studentId, clubIdSet]) => {
            const student = lookups.studentById.get(studentId);
            return {
                studentId, fullName: student?.fullName || studentId, faculty: student?.faculty,
                clubs: Array.from(clubIdSet).map(id => clubNameById.get(id)).filter(Boolean)
            };
        })
        .sort((a, b) => b.clubs.length - a.clubs.length);
};

// Same shape as getCrossClubOverlapBreakdown, but for one exact bucket from getCrossClubBuckets
// ('one'|'two'|'three'|'fourPlus') — backs the drill-down drawer for the 4 "Cross-club faollik" cards.
export const getCrossClubBucketBreakdown = (db, filters = {}, bucket = 'one') => {
    const lookups = buildLookups(db, filters);
    const studentClubMap = buildStudentClubMap(lookups);
    const clubNameById = new Map(lookups.clubs.map(c => [c.id, c.name]));
    const matchesBucket = (size) => {
        if (bucket === 'one') return size === 1;
        if (bucket === 'two') return size === 2;
        if (bucket === 'three') return size === 3;
        return size >= 4; // 'fourPlus'
    };
    return Array.from(studentClubMap.entries())
        .filter(([, clubIdSet]) => matchesBucket(clubIdSet.size))
        .map(([studentId, clubIdSet]) => {
            const student = lookups.studentById.get(studentId);
            return {
                studentId, fullName: student?.fullName || studentId, faculty: student?.faculty, course: student?.course,
                clubs: Array.from(clubIdSet).map(id => clubNameById.get(id)).filter(Boolean)
            };
        })
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
};

// ================================================================================================
// 3. Participation trend (6-month line) + club-share donut
// ================================================================================================
const MONTH_LABELS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

export const getParticipationTrend = (db, filters = {}) => {
    const lookups = buildLookups(db, filters);
    const registrations = lookups.registrations.filter(r => lookups.matches(r.userId));
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ label: MONTH_LABELS[d.getMonth()], year: d.getFullYear(), monthIdx: d.getMonth() });
    }
    return months.map(m => ({
        month: m.label,
        count: registrations.filter(r => {
            const d = new Date(r.createdAt);
            return d.getFullYear() === m.year && d.getMonth() === m.monthIdx;
        }).length
    }));
};

export const getClubShareDonut = (db, filters = {}, topN = 6) => {
    const lookups = buildLookups(db, filters);
    const rows = lookups.clubs
        .map(c => ({ name: c.name, value: clubTotalParticipations(lookups, c.id) }))
        .filter(r => r.value > 0)
        .sort((a, b) => b.value - a.value);
    const top = rows.slice(0, topN);
    const restTotal = rows.slice(topN).reduce((sum, r) => sum + r.value, 0);
    if (restTotal > 0) top.push({ name: 'Boshqalar', value: restTotal });
    return top;
};

// ================================================================================================
// 4. Main "Klublar bo'yicha qamrov" table
// ================================================================================================
const getClubTrend = (lookups, clubId) => {
    const now = Date.now();
    const clubEventIds = new Set((lookups.eventsByClub.get(clubId) || []).map(e => e.id));
    const clubCompIds = new Set((lookups.compsByClub.get(clubId) || []).map(c => c.id));
    const regs = lookups.registrations.filter(r =>
        lookups.matches(r.userId) &&
        ((r.activityType === 'event' && clubEventIds.has(r.activityId)) || (r.activityType === 'competition' && clubCompIds.has(r.activityId)))
    );
    const recent = regs.filter(r => now - new Date(r.createdAt).getTime() <= 30 * DAY_MS).length;
    const prior = regs.filter(r => {
        const age = now - new Date(r.createdAt).getTime();
        return age > 30 * DAY_MS && age <= 60 * DAY_MS;
    }).length;
    if (recent === 0 && prior === 0) return 'flat';
    if (recent > prior * 1.1) return 'up';
    if (recent < prior * 0.9) return 'down';
    return 'flat';
};

export const getClubAnalyticsTable = (db, filters = {}) => {
    const lookups = buildLookups(db, filters);
    return lookups.clubs.map(club => {
        const activities = (lookups.eventsByClub.get(club.id)?.length || 0) + (lookups.compsByClub.get(club.id)?.length || 0);
        const participations = clubTotalParticipations(lookups, club.id);
        const uniqueParticipants = clubUniqueParticipantIds(db, lookups, club.id).size;
        const efficiency = participations > 0 ? Math.round((uniqueParticipants / participations) * 1000) / 10 : 0;
        return {
            clubId: club.id,
            clubName: club.name,
            displayNumber: club.displayNumber,
            activities,
            participations,
            uniqueParticipants,
            efficiency,
            trend: getClubTrend(lookups, club.id)
        };
    });
};

// ================================================================================================
// 5. Cross-club overlap buckets
// ================================================================================================
export const getCrossClubBuckets = (db, filters = {}) => {
    const lookups = buildLookups(db, filters);
    const studentClubMap = buildStudentClubMap(lookups);
    const buckets = { one: 0, two: 0, three: 0, fourPlus: 0 };
    studentClubMap.forEach(set => {
        if (set.size === 1) buckets.one++;
        else if (set.size === 2) buckets.two++;
        else if (set.size === 3) buckets.three++;
        else if (set.size >= 4) buckets.fourPlus++;
    });
    return buckets;
};

// ================================================================================================
// 6/7. Org analytics KPIs + "Lavozimdagi talabalar" table (shared roster build)
// ================================================================================================
const buildRosterEntries = (db, filters = {}) => {
    const studentById = new Map(db.getMockStudents().map(s => [s.id, s]));
    const matches = (studentId) => studentMatches(studentById, filters, studentId);
    let clubs = db.getClubs();
    if (filters.clubId) clubs = clubs.filter(c => c.id === filters.clubId);
    return clubs.flatMap(club => db.getCurrentClubRoster(club.id)
        .filter(entry => matches(entry.studentId))
        .map(entry => ({ ...entry, clubId: club.id, clubName: club.name })));
};

export const getOrgAnalyticsKPIs = (db, filters = {}) => {
    const rosterEntries = buildRosterEntries(db, filters);
    const uniqueHolders = new Set(rosterEntries.map(e => e.studentId));
    const activePositions = rosterEntries.length;
    const avgWorkload = uniqueHolders.size ? Math.round((activePositions / uniqueHolders.size) * 10) / 10 : 0;

    const studentById = new Map(db.getMockStudents().map(s => [s.id, s]));
    let clubs = db.getClubs();
    if (filters.clubId) clubs = clubs.filter(c => c.id === filters.clubId);
    const pendingApplications = clubs
        .flatMap(c => db.getClubPositionApplications(c.id))
        .filter(a => a.status === 'PENDING' && studentMatches(studentById, filters, a.studentId))
        .length;

    const now = Date.now();
    const passivePositions = rosterEntries.filter(e => {
        const lastActivityDate = db.getStudentPortfolio(e.studentId).lastActivityDate;
        return !lastActivityDate || (now - new Date(lastActivityDate).getTime()) > 60 * DAY_MS;
    }).length;

    return { positionHolders: uniqueHolders.size, activePositions, avgWorkload, pendingApplications, passivePositions };
};

export const getPositionHoldersTable = (db, filters = {}) => {
    const rosterEntries = buildRosterEntries(db, filters);
    const byStudent = new Map();
    rosterEntries.forEach(entry => {
        if (!byStudent.has(entry.studentId)) byStudent.set(entry.studentId, []);
        byStudent.get(entry.studentId).push(entry);
    });

    return Array.from(byStudent.entries()).map(([studentId, entries]) => {
        const portfolio = db.getStudentPortfolio(studentId);
        const clubIds = new Set(entries.map(e => e.clubId));
        return {
            studentId,
            student: entries[0].student,
            positionsCount: entries.length,
            clubsCount: clubIds.size,
            activitiesCount: portfolio.eventsOrganizedCount,
            lastActivityDate: portfolio.lastActivityDate,
            workloadLevel: entries.length >= 4 ? 'high' : entries.length === 3 ? 'medium' : 'low',
            entries
        };
    }).sort((a, b) => b.positionsCount - a.positionsCount);
};

// ================================================================================================
// Drawer — last 10 organized-or-participated activities for one student
// ================================================================================================
export const getStudentRecentActivities = (db, studentId, limit = 10) => {
    const clubById = new Map(db.getClubs().map(c => [c.id, c]));
    const events = db.getEvents();
    const competitions = db.getCompetitions().filter(c => c.contextType === 'club');
    const items = [];
    const seen = new Set();

    const registrations = (db.getAllRegistrations() || []).filter(r =>
        r.status === 'registered' && (r.userId === studentId || (r.teamMembers || []).some(m => m.userId === studentId && m.status === 'accepted'))
    );
    registrations.forEach(r => {
        if (r.activityType === 'event') {
            const e = events.find(x => x.id === r.activityId);
            if (e && !seen.has('e_' + e.id)) {
                seen.add('e_' + e.id);
                items.push({ id: 'e_' + e.id, type: 'event', name: e.title, date: e.date, clubName: clubById.get(e.clubId)?.name });
            }
        } else {
            const c = competitions.find(x => x.id === r.activityId);
            if (c && !seen.has('c_' + c.id)) {
                seen.add('c_' + c.id);
                const date = c.startDate ? db.combineDateTime(c.startDate, c.startTime) : c.createdAt;
                items.push({ id: 'c_' + c.id, type: 'competition', name: c.name, date, clubName: clubById.get(c.contextId)?.name });
            }
        }
    });
    events.forEach(e => {
        if (!seen.has('e_' + e.id) && (e.participants || []).some(p => p.userId === studentId)) {
            seen.add('e_' + e.id);
            items.push({ id: 'e_' + e.id, type: 'event', name: e.title, date: e.date, clubName: clubById.get(e.clubId)?.name });
        }
    });

    return items.filter(i => i.date).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);
};

// Resolves a raw actor id (either a mock student id like 'student_42', or a plain mock-login username
// like 'admin'/'coord_test') to a display name. No matching student record just means it already IS a
// display-worthy string (username), so it's returned as-is.
const resolveActorName = (db, actorId) => {
    if (!actorId) return null;
    const student = db.getMockStudents().find(s => s.id === actorId);
    return student ? student.fullName : actorId;
};

// Cross-club position-domain audit trail for one student (spec follow-up: drawer "audit log"). Reuses
// db.getClubPositionAuditLogs per club (which already resolves ariza-flow's applicationId-only entries
// to a clubId) and keeps only the entries that are actually about this student.
export const getStudentPositionAuditLog = (db, studentId) => {
    const clubs = db.getClubs();
    const clubById = new Map(clubs.map(c => [c.id, c]));
    const applicationsByClub = new Map(clubs.map(c => [c.id, db.getClubPositionApplications(c.id)]));

    return clubs
        .flatMap(club => db.getClubPositionAuditLogs(club.id).map(log => ({ ...log, clubId: club.id })))
        .map(log => {
            let resolvedStudentId = log.studentId;
            let positionTitle = log.positionTitle;
            if (!resolvedStudentId && log.applicationId) {
                const app = (applicationsByClub.get(log.clubId) || []).find(a => a.id === log.applicationId);
                resolvedStudentId = app?.studentId;
                if (app) positionTitle = db.getPositionById(app.positionId)?.title;
            }
            return { ...log, resolvedStudentId, positionTitle, clubName: clubById.get(log.clubId)?.name, reviewerName: resolveActorName(db, log.reviewer) };
        })
        .filter(log => log.resolvedStudentId === studentId)
        .sort((a, b) => new Date(b.time) - new Date(a.time));
};

export const getStudentDrawerData = (db, studentId) => {
    const rosterEntries = buildRosterEntries(db).filter(e => e.studentId === studentId);
    const portfolio = db.getStudentPortfolio(studentId);

    // "Tayinlagan foydalanuvchi" per position — only resolvable for assignment-sourced entries (direct
    // "Lavozimga tayinlash"); legacy membership-sourced positions predate this ledger and have no record
    // of who granted them, so assignedByName stays null there (disclosed, not hidden).
    const activePositions = rosterEntries.map(entry => {
        if (entry.source !== 'assignment' || !entry.assignmentId) return { ...entry, assignedByName: null };
        const assignment = db.getClubPositionAssignments(entry.clubId).find(a => a.id === entry.assignmentId);
        return { ...entry, assignedByName: assignment ? resolveActorName(db, assignment.assignedBy) : null };
    });

    return {
        activePositions,
        clubs: Array.from(new Set(rosterEntries.map(e => e.clubName))),
        recentActivities: getStudentRecentActivities(db, studentId, 10),
        lastActivityDate: portfolio.lastActivityDate,
        auditLog: getStudentPositionAuditLog(db, studentId),
        workloadIndex: rosterEntries.length
    };
};

// ================================================================================================
// 8. Alerts
// ================================================================================================
export const getAnalyticsAlerts = (db, filters = {}) => {
    const holders = getPositionHoldersTable(db, filters);
    const now = Date.now();
    const highWorkload = holders.filter(h => h.positionsCount >= 4);
    const passivePositions = holders.filter(h => !h.lastActivityDate || (now - new Date(h.lastActivityDate).getTime()) > 60 * DAY_MS);
    const authorityConcentration = holders
        .map(h => ({ ...h, leadershipClubs: h.entries.filter(e => e.positionTitle === 'head_coordinator' || e.positionTitle === 'assistant_coordinator').map(e => e.clubName) }))
        .filter(h => new Set(h.leadershipClubs).size >= 2);

    return { highWorkload, passivePositions, authorityConcentration };
};
