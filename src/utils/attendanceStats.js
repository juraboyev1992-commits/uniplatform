// ===========================================================================
// DAVOMAT TAHLILI
//
// Davomat platformadagi eng katta jadval, lekin u faqat BOSHQA hisoblarning
// manbasi edi - o'zi bo'yicha bironta ko'rsatkich yo'q edi. Uch savolga
// javob beradi:
//
//   1. Ro'yxatdan o'tganlarning nechtasi haqiqatan keldi? (voronka)
//   2. Qaysi tadbirning davomati umuman belgilanmagan? (bajarilmagan ish)
//   3. Kim davomat belgilaydi? (yuklama kimning zimmasida)
//
// HECH NARSA O'YLAB TOPILMAYDI. Ayniqsa voronkada: ro'yxatdan o'tish
// yozuvi bo'lmagan tadbir "0% keldi" deb ko'rsatilmaydi - u voronkadan
// umuman chiqariladi, chunki u yerda o'lchash uchun asos yo'q. Ba'zi
// tadbirlarga ro'yxatdan o'tish talab qilinmaydi va bu xato emas.
// ===========================================================================
import { lastMonths } from './platformStats';

const monthKey = (d) => {
    const x = new Date(d);
    return Number.isNaN(x.getTime()) ? null : `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
};

const activityKey = (type, id) => `${type}:${id}`;

// Tadbir va musobaqalarni bitta ko'rinishga keltiradi - davomat ikkalasida
// ham bir xil ishlaydi, shuning uchun tahlil ham ajratmaydi.
const collectActivities = (db) => {
    const rows = [];
    (db.getEvents() || []).forEach(e => rows.push({
        key: activityKey('event', e.id), id: e.id, type: 'event',
        title: e.title, date: e.date || null, clubId: e.clubId || null,
        finished: e.date ? new Date(e.date) < new Date() : false,
    }));
    (db.getCompetitions() || []).forEach(c => rows.push({
        key: activityKey('competition', c.id), id: c.id, type: 'competition',
        title: c.name, date: c.startDate || null,
        clubId: c.contextType === 'club' ? c.contextId : null,
        finished: (c.currentRound || 1) > (c.roundsCount || 1),
    }));
    return rows;
};

// ---------------------------------------------------------------------------
// VORONKA: ro'yxatdan o'tdi -> keldi
//
// `absent` va `present` yozuvlari IKKALASI ham davomat belgilanganini
// bildiradi. Yozuvi umuman yo'q talaba - "kelmadi" emas, "belgilanmagan":
// bu ikkisi boshqa-boshqa narsa va aralashtirilmaydi.
// ---------------------------------------------------------------------------
export const getAttendanceFunnel = (db) => {
    const activities = new Map(collectActivities(db).map(a => [a.key, a]));
    const attendance = db.getActivityAttendanceAll();

    // Har faoliyat bo'yicha: ro'yxat, belgilangan, kelgan.
    const rows = new Map();
    const ensure = (key) => {
        if (!rows.has(key)) rows.set(key, { key, registered: 0, marked: 0, present: 0 });
        return rows.get(key);
    };

    (db.getAllRegistrations() || []).forEach(r => {
        if (r.status === 'cancelled') return;
        const key = activityKey(r.activityType, r.activityId);
        if (!activities.has(key)) return;
        ensure(key).registered++;
    });

    attendance.forEach(a => {
        const key = activityKey(a.activityType, a.activityId);
        if (!activities.has(key)) return;
        const row = ensure(key);
        row.marked++;
        if (a.status === 'present') row.present++;
    });

    // Ro'yxatdan o'tish yozuvi bor faoliyatlargina voronkaga kiradi.
    const measurable = Array.from(rows.values()).filter(r => r.registered > 0);

    const totals = measurable.reduce((acc, r) => ({
        registered: acc.registered + r.registered,
        marked: acc.marked + r.marked,
        present: acc.present + r.present,
    }), { registered: 0, marked: 0, present: 0 });

    return {
        ...totals,
        activities: measurable.length,
        // Kelmaganlar - ro'yxatdan o'tgan, lekin "present" yozuvi yo'qlar.
        noShow: Math.max(0, totals.registered - totals.present),
        noShowPercent: totals.registered > 0
            ? Math.round(((totals.registered - totals.present) / totals.registered) * 100)
            : null,
        showPercent: totals.registered > 0
            ? Math.round((totals.present / totals.registered) * 100)
            : null,
        // Eng ko'p kelmagan tadbirlar - amaliy ro'yxat, sababini so'rash uchun.
        worst: measurable
            .map(r => ({
                ...r,
                ...activities.get(r.key),
                showPercent: Math.round((r.present / r.registered) * 100),
            }))
            .filter(r => r.registered >= 5) // Ikki kishilik tadbirda foiz ma'nosiz.
            .sort((a, b) => a.showPercent - b.showPercent)
            .slice(0, 10),
    };
};

// ---------------------------------------------------------------------------
// DAVOMATI BELGILANMAGAN FAOLIYATLAR
//
// Bu diagramma emas, BAJARILMAGAN ISH ro'yxati: o'tib ketgan, lekin davomati
// belgilanmagan tadbirlar. Ular jimgina indeksdan tushib qoladi - talaba
// qatnashgan, ammo hech qayerda qayd etilmagan.
// ---------------------------------------------------------------------------
export const getUnmarkedActivities = (db) => {
    const attendance = db.getActivityAttendanceAll();
    const marked = new Set(attendance.map(a => activityKey(a.activityType, a.activityId)));
    const registered = new Map();
    (db.getAllRegistrations() || []).forEach(r => {
        if (r.status === 'cancelled') return;
        const key = activityKey(r.activityType, r.activityId);
        registered.set(key, (registered.get(key) || 0) + 1);
    });

    return collectActivities(db)
        .filter(a => a.finished && !marked.has(a.key))
        // Hech kim ro'yxatdan o'tmagan tadbirda belgilaydigan narsa yo'q.
        .filter(a => (registered.get(a.key) || 0) > 0)
        .map(a => ({ ...a, registered: registered.get(a.key) || 0 }))
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
};

// ---------------------------------------------------------------------------
// KIM BELGILAYDI
//
// Yuklama taqsimoti. Davomat bitta-ikkita odamning zimmasida qolsa, u
// kechikadi - buni oldindan ko'rish uchun.
// ---------------------------------------------------------------------------
export const getMarkerWorkload = (db) => {
    const byMarker = new Map();
    db.getActivityAttendanceAll().forEach(a => {
        const who = a.markedByUserId || null;
        if (!who) return;
        if (!byMarker.has(who)) byMarker.set(who, { userId: who, records: 0, activities: new Set() });
        const row = byMarker.get(who);
        row.records++;
        row.activities.add(activityKey(a.activityType, a.activityId));
    });

    const students = new Map(db.getMockStudents().map(s => [s.id, s.fullName]));
    return Array.from(byMarker.values())
        .map(r => ({
            userId: r.userId,
            name: students.get(r.userId) || r.userId,
            records: r.records,
            activities: r.activities.size,
        }))
        .sort((a, b) => b.records - a.records);
};

// ---------------------------------------------------------------------------
// OYLIK DINAMIKA
// ---------------------------------------------------------------------------
export const getAttendanceTrend = (db, monthCount = 6) => {
    const months = lastMonths(monthCount);
    const index = new Map(months.map(m => [m.key, { name: m.label, kelgan: 0, kelmagan: 0 }]));
    const activities = new Map(collectActivities(db).map(a => [a.key, a]));

    db.getActivityAttendanceAll().forEach(a => {
        const act = activities.get(activityKey(a.activityType, a.activityId));
        // Sana faoliyatnikidan olinadi: davomat keyinroq belgilanishi mumkin,
        // lekin ishtirok TADBIR kunida bo'lgan.
        const k = monthKey(act?.date || a.createdAt);
        if (!k || !index.has(k)) return;
        if (a.status === 'present') index.get(k).kelgan++;
        else index.get(k).kelmagan++;
    });

    return months.map(m => index.get(m.key));
};

// ---------------------------------------------------------------------------
// QULFLASH HOLATI
//
// Qulflangan davomat - o'zgartirib bo'lmaydigan, hisobotga tayyor yozuv.
// Qulflanmagani hali ochiq va o'zgarishi mumkin.
// ---------------------------------------------------------------------------
export const getAttendanceLockStats = (db) => {
    const locks = db.getAttendanceLocks();
    const active = locks.filter(l => !l.reopenedAt);
    return {
        locked: active.length,
        reopened: locks.filter(l => l.reopenedAt).length,
        activities: new Set(active.map(l => activityKey(l.activityType, l.activityId))).size,
    };
};
