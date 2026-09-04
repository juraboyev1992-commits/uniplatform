// ===========================================================================
// PLATFORMANING UMUMIY KO'RSATKICHLARI
//
// NEGA BITTA JOYDA: rahbariyatning uchta sahifasi (Bosh sahifa, Statistika,
// Fakultetlar) bir xil savollarga javob beradi, lekin ularning har biri
// o'zicha hisoblardi - va uchalasi ham `Math.random()` bilan. Natijada bitta
// ko'rsatkich uch xil raqam ko'rsatardi va sahifa har ochilganda o'zgarardi.
//
// QOIDA: bu yerda hech narsa O'YLAB TOPILMAYDI. Manbasi bo'lmagan ko'rsatkich
// umuman qaytarilmaydi - `null` yoki yo'q. "Ma'lumot yo'q" deb ko'rsatish
// o'ylab topilgan raqamdan yaxshiroq.
//
// Nimalar ATAYLAB yo'q:
//   - Grantlar va fondlar: platformada moliya moduli yo'q
//   - Strategik maqsadlar: bunday tushuncha yo'q
//   - Soatlik faollik: yozuvlarda aniq vaqt saqlanmaydi
// ===========================================================================

const MONTH_ABBR = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

const monthKey = (d) => {
    const x = new Date(d);
    return Number.isNaN(x.getTime()) ? null : `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
};

// Oxirgi N oy - bo'sh oylar ham qaytadi, aks holda grafik uzilib ko'rinardi.
export const lastMonths = (count = 6, now = new Date()) => {
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        out.push({
            key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: MONTH_ABBR[d.getMonth()],
        });
    }
    return out;
};

// ---------------------------------------------------------------------------
// UMUMIY RAQAMLAR
// ---------------------------------------------------------------------------
export const getPlatformOverview = (db) => {
    const students = db.getMockStudents();
    const clubs = db.getClubs() || [];
    const events = db.getEvents() || [];
    const competitions = db.getCompetitions() || [];
    const registrations = db.getAllRegistrations() || [];
    const documents = (db.getDocuments() || []).filter(d => d.status === 'issued');

    const now = new Date();
    const isPast = (d) => d && new Date(d) < now;

    // Xalqaro miqyosdagi faoliyat - `level` maydonidan. Bu maydon tadbir va
    // musobaqa yaratishda belgilanadi, ya'ni haqiqiy ma'lumot.
    const internationalCount = [...events, ...competitions]
        .filter(a => a.level === 'international').length;

    return {
        students: students.length,
        faculties: new Set(students.map(s => s.faculty).filter(Boolean)).size,
        groups: new Set(students.map(s => s.group).filter(Boolean)).size,
        clubs: clubs.length,
        events: events.length,
        eventsPast: events.filter(e => isPast(e.date)).length,
        eventsUpcoming: events.filter(e => !isPast(e.date)).length,
        competitions: competitions.length,
        registrations: registrations.filter(r => r.status !== 'cancelled').length,
        documents: documents.length,
        internationalCount,
    };
};

// ---------------------------------------------------------------------------
// OYLIK DINAMIKA
//
// Uchta chiziq: tadbirlar, ro'yxatdan o'tishlar, berilgan hujjatlar. Uchalasi
// ham sanasi bor haqiqiy yozuvlardan.
// ---------------------------------------------------------------------------
export const getMonthlyActivity = (db, monthCount = 6) => {
    const months = lastMonths(monthCount);
    const index = new Map(months.map(m => [m.key, { name: m.label, tadbirlar: 0, royxat: 0, hujjatlar: 0 }]));

    (db.getEvents() || []).forEach(e => {
        const k = monthKey(e.date);
        if (k && index.has(k)) index.get(k).tadbirlar++;
    });
    (db.getAllRegistrations() || []).forEach(r => {
        if (r.status === 'cancelled') return;
        const k = monthKey(r.registeredAt || r.createdAt);
        if (k && index.has(k)) index.get(k).royxat++;
    });
    (db.getDocuments() || []).forEach(d => {
        if (d.status !== 'issued') return;
        const k = monthKey(d.issuedAt || d.createdAt);
        if (k && index.has(k)) index.get(k).hujjatlar++;
    });

    return months.map(m => index.get(m.key));
};

// ---------------------------------------------------------------------------
// FAKULTETLAR KESIMI
//
// Faollik o'lchovi - ISHTIROK yozuvlari (davomat + ro'yxatdan o'tish), ball
// emas. Sabab: ball uchta parallel tizimda uch xil hisoblanadi, ishtirok esa
// bitta va bir ma'noli.
// ---------------------------------------------------------------------------
export const getFacultyStats = (db) => {
    const students = db.getMockStudents();
    const byId = new Map(students.map(s => [s.id, s]));

    const stats = new Map();
    students.forEach(s => {
        if (!s.faculty) return;
        if (!stats.has(s.faculty)) {
            stats.set(s.faculty, {
                faculty: s.faculty, students: 0, groups: new Set(),
                participations: 0, activeStudents: new Set(), documents: 0,
            });
        }
        const row = stats.get(s.faculty);
        row.students++;
        if (s.group) row.groups.add(s.group);
    });

    (db.getActivityAttendanceAll ? db.getActivityAttendanceAll() : []).forEach(a => {
        if (a.status !== 'present') return;
        const s = byId.get(a.participantId);
        if (!s?.faculty || !stats.has(s.faculty)) return;
        stats.get(s.faculty).participations++;
        stats.get(s.faculty).activeStudents.add(a.participantId);
    });

    (db.getDocuments() || []).forEach(d => {
        if (d.status !== 'issued') return;
        const ids = [d.recipientId, ...((d.members || []).map(m => m.userId))].filter(Boolean);
        ids.forEach(id => {
            const s = byId.get(id);
            if (s?.faculty && stats.has(s.faculty)) stats.get(s.faculty).documents++;
        });
    });

    return Array.from(stats.values())
        .map(r => ({
            ...r,
            groups: r.groups.size,
            activeStudents: r.activeStudents.size,
            // Faol talabalar ulushi - fakultetlarni SOLISHTIRISH uchun yagona
            // adolatli o'lchov (katta fakultetda ishtirok ko'p bo'lishi tabiiy).
            activePercent: r.students > 0
                ? Math.round((r.activeStudents.size / r.students) * 100)
                : 0,
        }))
        .sort((a, b) => b.activePercent - a.activePercent);
};

// ---------------------------------------------------------------------------
// KLUBLAR KESIMI - eng faol klublar
// ---------------------------------------------------------------------------
export const getClubActivityStats = (db) => {
    const clubs = db.getClubs() || [];
    const events = db.getEvents() || [];
    const attendance = db.getActivityAttendanceAll ? db.getActivityAttendanceAll() : [];

    const eventsByClub = new Map();
    events.forEach(e => {
        if (!e.clubId) return;
        if (!eventsByClub.has(String(e.clubId))) eventsByClub.set(String(e.clubId), []);
        eventsByClub.get(String(e.clubId)).push(e);
    });

    const attendedByActivity = new Map();
    attendance.forEach(a => {
        if (a.status !== 'present') return;
        const k = `${a.activityType}:${a.activityId}`;
        attendedByActivity.set(k, (attendedByActivity.get(k) || 0) + 1);
    });

    return clubs
        .map(c => {
            const clubEvents = eventsByClub.get(String(c.id)) || [];
            const participations = clubEvents.reduce(
                (sum, e) => sum + (attendedByActivity.get(`event:${e.id}`) || 0), 0
            );
            return {
                id: c.id, name: c.name, category: c.category || null,
                events: clubEvents.length, participations,
            };
        })
        .sort((a, b) => b.participations - a.participations);
};
