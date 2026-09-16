import { POSITION_TYPE_LABELS, academicYearOf, getCurrentAcademicYear } from '../services/db';

// KLUB A'ZOLARI RO'YXATI - bitta manba, ikki ko'rinish.
//
// Koordinator o'z klubini "Klub tarkibi" ichida ko'radi, administrator esa
// barcha klublarni bir joyda (Klublar katalogi). Ikkalasi ham SHU yerdagi
// qatorlarni ishlatadi, shuning uchun ustunlar va status ta'rifi hech qachon
// ikki xil bo'lib qolmaydi.
//
// NEGA ALOHIDA YORDAMCHI, `clubAnalytics.js` EMAS: u lavozimdagilar haqida
// (kim nimaga javobgar), bu esa BUTUN a'zolik haqida. Ustiga analitikadagi
// `getStudentRecentActivities` har bir talaba uchun butun bazani qaytadan
// skanerlaydi - yuzlab a'zoli admin ro'yxatida bu sezilarli sekinlik berardi.
// Bu yerda faollik BITTA o'tishda yig'iladi.

// A'zolik roli -> ko'rsatiladigan status. Lavozim tayinlovi bo'lsa, u ustun
// turadi (pastdagi `statusOf`).
const MEMBERSHIP_ROLE_LABELS = {
    head_coordinator: POSITION_TYPE_LABELS.head_coordinator,
    coordinator: POSITION_TYPE_LABELS.assistant_coordinator,
    smm: POSITION_TYPE_LABELS.smm,
    volunteer: POSITION_TYPE_LABELS.volunteer,
    member: "A'zo",
};

export const MEMBER_STATUS_ORDER = [
    'head_coordinator', 'assistant_coordinator', 'smm', 'media_design', 'event_coordinator', 'volunteer', 'member',
];

export const MEMBER_STATUS_LABELS = {
    ...POSITION_TYPE_LABELS,
    member: "A'zo",
};

// Talabaning klubdagi FAOLIYAT sanalari: ro'yxatdan o'tishlar, tadbir
// ishtirokchilari va musobaqa ishtirokchilari. Ta'rif `getClubUniqueCoverage`
// dagi bilan bir xil - "qatnashdi" degan so'z platformada bitta ma'noda
// bo'lishi kerak.
//
// Hammasi BITTA o'tishda: `${studentId}::${clubId}` -> [sana, ...].
const buildActivityIndex = (db, clubIds) => {
    const index = new Map();
    const add = (studentId, clubId, date) => {
        if (!studentId || !clubId || !date) return;
        const key = `${studentId}::${clubId}`;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(date);
    };

    const events = db.getEvents().filter(e => clubIds.has(e.clubId));
    const eventClubById = new Map(events.map(e => [e.id, e.clubId]));
    events.forEach(e => (e.participants || []).forEach(p => add(p.userId || p.id, e.clubId, e.date)));

    const competitions = db.getCompetitions()
        .filter(c => c.contextType === 'club' && clubIds.has(c.contextId));
    const compClubById = new Map(competitions.map(c => [c.id, c.contextId]));
    competitions.forEach(c => {
        const date = c.startDate ? db.combineDateTime(c.startDate, c.startTime) : c.createdAt;
        (c.participants || []).forEach(p => add(p.userId || p.id, c.contextId, date));
    });

    (db.getAllRegistrations() || []).forEach(r => {
        if (r.status !== 'registered') return;
        const clubId = r.activityType === 'event'
            ? eventClubById.get(r.activityId)
            : compClubById.get(r.activityId);
        if (!clubId) return;
        // Ro'yxatdan o'tish sanasi emas, TADBIR sanasi ham bo'lishi mumkin;
        // ikkalasi ham "shu o'quv yilida qatnashdi" degan savolga javob
        // beradi, shuning uchun ikkalasi ham qo'shiladi.
        add(r.userId, clubId, r.createdAt);
        (r.teamMembers || [])
            .filter(m => m.status === 'accepted')
            .forEach(m => add(m.userId, clubId, r.createdAt));
    });

    return index;
};

const statusOf = (positions, membershipRole) => {
    // Faol lavozim bo'lsa - o'sha ko'rsatiladi (a'zolik roli ba'zan orqada
    // qolib ketadi: tayinlov `club_position_assignments` da, a'zolik esa
    // hali `member` bo'lishi mumkin).
    if (positions.length > 0) {
        const sorted = [...positions].sort(
            (a, b) => MEMBER_STATUS_ORDER.indexOf(a) - MEMBER_STATUS_ORDER.indexOf(b)
        );
        return sorted[0];
    }
    if (membershipRole && membershipRole !== 'member') {
        const label = MEMBERSHIP_ROLE_LABELS[membershipRole];
        // Roldan lavozim kalitiga qaytarish: 'coordinator' -> yordamchi.
        const key = MEMBER_STATUS_ORDER.find(k => MEMBER_STATUS_LABELS[k] === label);
        if (key) return key;
    }
    return 'member';
};

// Bitta klub (clubId berilsa) yoki BARCHA klublar bo'yicha a'zolar qatorlari.
export const buildClubMemberRows = (db, { clubId = null } = {}) => {
    const currentYear = getCurrentAcademicYear();
    const clubs = db.getClubs().filter(c => !clubId || c.id === clubId);
    const clubIds = new Set(clubs.map(c => c.id));
    if (clubIds.size === 0) return [];

    const studentById = new Map(db.getMockStudents().map(s => [s.id, s]));
    const activityIndex = buildActivityIndex(db, clubIds);

    return clubs.flatMap(club => {
        // Lavozimlar: faqat FAOL tayinlovlar (tasdiqlanmagan tavsiyalar bu
        // yerga tushmaydi - getCurrentClubRoster `active` ni o'qiydi).
        const positionsByStudent = new Map();
        db.getCurrentClubRoster(club.id).forEach(entry => {
            if (!positionsByStudent.has(entry.studentId)) positionsByStudent.set(entry.studentId, []);
            positionsByStudent.get(entry.studentId).push(entry.positionTitle);
        });

        const scoreByStudent = new Map(
            (db.getClubScoreBreakdown(club.id)?.memberDetails || []).map(m => [m.userId, m.score])
        );

        return db.getClubMembers(club.id).map(m => {
            const positions = positionsByStudent.get(m.userId) || [];
            const dates = activityIndex.get(`${m.userId}::${club.id}`) || [];
            const lastActivityAt = dates.length
                ? dates.slice().sort((a, b) => new Date(b) - new Date(a))[0]
                : null;
            const activeYears = new Set(dates.map(d => academicYearOf(d)).filter(Boolean));
            const student = studentById.get(m.userId);

            return {
                key: `${club.id}::${m.userId}`,
                membershipId: m.id,
                studentId: m.userId,
                student: student || null,
                fullName: student?.fullName || m.userId,
                faculty: student?.faculty || null,
                course: student?.course ?? null,
                group: student?.group || null,
                studentCode: student?.studentId || null,
                clubId: club.id,
                clubName: club.name,
                status: statusOf(positions, m.role),
                positions,
                joinedAt: m.joinedAt || null,
                score: scoreByStudent.get(m.userId) || 0,
                lastActivityAt,
                activityCount: dates.length,
                activeThisYear: activeYears.has(currentYear),
                activeYears: Array.from(activeYears).sort(),
            };
        });
    });
};

export const getMemberFilterOptions = (rows) => ({
    faculties: Array.from(new Set(rows.map(r => r.faculty).filter(Boolean))).sort(),
    courses: Array.from(new Set(rows.map(r => r.course).filter(c => c != null))).sort((a, b) => a - b),
    statuses: MEMBER_STATUS_ORDER.filter(s => rows.some(r => r.status === s)),
    clubs: Array.from(new Map(rows.map(r => [r.clubId, r.clubName])).entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    years: Array.from(new Set(rows.flatMap(r => r.activeYears))).sort().reverse(),
});

export const filterMemberRows = (rows, filters = {}) => {
    const q = (filters.search || '').trim().toLowerCase();
    return rows.filter(r => {
        if (filters.clubId && r.clubId !== filters.clubId) return false;
        if (filters.faculty && r.faculty !== filters.faculty) return false;
        if (filters.course && r.course !== Number(filters.course)) return false;
        if (filters.status && r.status !== filters.status) return false;
        if (filters.onlyPositions && r.positions.length === 0) return false;
        // Yil tanlanmagan bo'lsa "shu o'quv yili" nazarda tutiladi.
        if (filters.onlyInactive) {
            const year = filters.year || null;
            const active = year ? r.activeYears.includes(year) : r.activeThisYear;
            if (active) return false;
        } else if (filters.year) {
            if (!r.activeYears.includes(filters.year)) return false;
        }
        if (q) {
            const hay = [r.fullName, r.studentCode, r.faculty, r.group, r.clubName, r.studentId]
                .filter(Boolean).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
};

// Excel uchun tekis obyektlar. Ustun nomlari ekrandagi bilan bir xil -
// faylni ochgan odam nima ko'rayotganini tushunishi kerak.
export const memberRowsToExcelData = (rows, { includeClub = true, contactByStudent = null } = {}) =>
    rows.map(r => {
        const row = {
            'F.I.SH.': r.fullName,
            'Talaba ID': r.studentCode || r.studentId,
            'Fakultet': r.faculty || '',
            'Kurs': r.course ?? '',
            'Guruh': r.group || '',
            'Status': MEMBER_STATUS_LABELS[r.status] || r.status,
            'Ball': r.score,
            "Qo'shilgan": r.joinedAt ? new Date(r.joinedAt).toLocaleDateString('uz-UZ') : '',
            'Oxirgi faollik': r.lastActivityAt ? new Date(r.lastActivityAt).toLocaleDateString('uz-UZ') : '',
            'Shu o\'quv yilida faol': r.activeThisYear ? 'Ha' : "Yo'q",
        };
        if (includeClub) row['Klub'] = r.clubName;
        if (contactByStudent) {
            const c = contactByStudent.get(r.studentId);
            row['Telefon'] = c?.phone || (c?.restricted ? 'ko\'rsatilmadi' : '');
            row['Pochta'] = c?.email || '';
        }
        return row;
    });
