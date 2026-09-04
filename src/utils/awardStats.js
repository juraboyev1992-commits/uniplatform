// ===========================================================================
// TAQDIRLASH TAHLILI
//
// Reestrda hujjatlarni QIDIRISH mumkin edi, lekin ular haqida savol berish
// mumkin emasdi: qaysi darajadagi yutuqlar ko'p, qaysi fakultet oldinda,
// hujjatlar yil davomida qanday taqsimlangan.
//
// DARAJA hujjatning o'zida saqlanmaydi - u TADBIRning xususiyati. Shuning
// uchun hujjat `sourceType`/`sourceId` orqali o'z tadbiriga bog'lanadi.
// Tadbiri topilmagan yoki darajasi belgilanmagan hujjat "belgilanmagan"
// guruhiga tushadi va shu ochiq ko'rsatiladi - taxmin qilinmaydi.
// ===========================================================================
import { getDocumentType, getDocumentTypeLabel } from '../config/documents';
import { ACTIVITY_LEVELS, ACTIVITY_LEVEL_ORDER } from '../config/activityLifecycle';
import { lastMonths } from './platformStats';

const monthKey = (d) => {
    const x = new Date(d);
    return Number.isNaN(x.getTime()) ? null : `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
};

// Darajalar ro'yxati ACTIVITY_LEVELS dan olinadi - ikkinchi nusxa tuzilsa,
// tadbirga daraja qo'shilganda tahlil undan orqada qolardi. "Belgilanmagan"
// esa faqat shu yerda: u daraja emas, MA'LUMOT YO'QLIGI.
export const UNKNOWN_LEVEL = 'unknown';
export const LEVEL_KEYS = [...[...ACTIVITY_LEVEL_ORDER].reverse(), UNKNOWN_LEVEL];
export const levelLabel = (key) =>
    key === UNKNOWN_LEVEL ? 'Daraja belgilanmagan' : (ACTIVITY_LEVELS[key]?.label || key);

// Hujjat -> tadbir darajasi.
//
// DIQQAT: bu yerda DEFAULT_ACTIVITY_LEVEL ataylab QO'LLANILMAYDI. Ball
// hisoblashda darajasi yo'q tadbir "universitet" deb olinadi (eski yozuvlar
// buzilmasin uchun), lekin TAHLILDA uni universitet deb ko'rsatish yolg'on
// bo'lardi - ma'lumot yo'qligini yashirardi.
const buildLevelResolver = (db) => {
    const events = new Map((db.getEvents() || []).map(e => [String(e.id), e.level || null]));
    const comps = new Map((db.getCompetitions() || []).map(c => [String(c.id), c.level || null]));
    return (doc) => {
        if (!doc.sourceId) return UNKNOWN_LEVEL;
        const level = doc.sourceType === 'competition'
            ? comps.get(String(doc.sourceId))
            : events.get(String(doc.sourceId));
        return level && ACTIVITY_LEVELS[level] ? level : UNKNOWN_LEVEL;
    };
};

// Hujjatdan hamma oluvchi - jamoa hujjatida tarkib ham hisoblanadi.
const recipientsOf = (doc) =>
    [doc.recipientId, ...((doc.members || []).map(m => m.userId))].filter(Boolean);

export const getAwardAnalytics = (db) => {
    const issued = (db.getDocuments() || []).filter(d => d.status === 'issued');
    const levelOf = buildLevelResolver(db);
    const students = new Map(db.getMockStudents().map(s => [s.id, s]));

    // --- Daraja bo'yicha ---
    const byLevel = new Map();
    // --- O'rin bo'yicha ---
    const byPlace = new Map();
    // --- Hujjat turi bo'yicha ---
    const byType = new Map();
    // --- Fakultet bo'yicha ---
    const byFaculty = new Map();

    issued.forEach(d => {
        const level = levelOf(d);
        byLevel.set(level, (byLevel.get(level) || 0) + 1);

        const place = d.place != null ? Number(d.place) : null;
        const placeKey = place && place >= 1 && place <= 3 ? String(place) : 'other';
        byPlace.set(placeKey, (byPlace.get(placeKey) || 0) + 1);

        byType.set(d.documentType, (byType.get(d.documentType) || 0) + 1);

        // Fakultet hujjatda saqlanadi; bo'lmasa talabaning yozuvidan olinadi.
        const faculty = d.faculty || students.get(d.recipientId)?.faculty || null;
        if (faculty) {
            if (!byFaculty.has(faculty)) byFaculty.set(faculty, { faculty, documents: 0, students: new Set() });
            const row = byFaculty.get(faculty);
            row.documents++;
            recipientsOf(d).forEach(id => row.students.add(id));
        }
    });

    return {
        total: issued.length,
        uniqueStudents: new Set(issued.flatMap(recipientsOf)).size,
        levels: LEVEL_KEYS
            .map(key => ({ key, label: levelLabel(key), count: byLevel.get(key) || 0 }))
            .filter(r => r.count > 0),
        places: [
            { key: '1', label: '1-o\'rin', count: byPlace.get('1') || 0 },
            { key: '2', label: '2-o\'rin', count: byPlace.get('2') || 0 },
            { key: '3', label: '3-o\'rin', count: byPlace.get('3') || 0 },
            { key: 'other', label: "O'rinsiz (ishtirok, hakam, volontyor)", count: byPlace.get('other') || 0 },
        ].filter(r => r.count > 0),
        types: Array.from(byType.entries())
            .map(([key, count]) => ({
                key, count,
                label: getDocumentTypeLabel(key),
                group: getDocumentType(key)?.group || null,
            }))
            .sort((a, b) => b.count - a.count),
        faculties: Array.from(byFaculty.values())
            .map(r => ({ ...r, students: r.students.size }))
            .sort((a, b) => b.documents - a.documents),
    };
};

// ---------------------------------------------------------------------------
// OYLIK DINAMIKA
// ---------------------------------------------------------------------------
export const getAwardTrend = (db, monthCount = 12) => {
    const months = lastMonths(monthCount);
    const index = new Map(months.map(m => [m.key, { name: m.label, hujjatlar: 0 }]));

    (db.getDocuments() || []).forEach(d => {
        if (d.status !== 'issued') return;
        const k = monthKey(d.issuedAt || d.createdAt);
        if (k && index.has(k)) index.get(k).hujjatlar++;
    });

    return months.map(m => index.get(m.key));
};

// ---------------------------------------------------------------------------
// ENG KO'P TAQDIRLANGAN KLUBLAR
//
// Klub hujjatda ko'rsatilmaydi - u TADBIR orqali aniqlanadi.
// ---------------------------------------------------------------------------
export const getAwardsByClub = (db) => {
    const clubs = new Map((db.getClubs() || []).map(c => [String(c.id), c.name]));
    const clubOfEvent = new Map();
    (db.getEvents() || []).forEach(e => { if (e.clubId) clubOfEvent.set(String(e.id), String(e.clubId)); });
    (db.getCompetitions() || []).forEach(c => {
        if (c.contextType === 'club' && c.contextId) clubOfEvent.set(String(c.id), String(c.contextId));
    });

    const rows = new Map();
    (db.getDocuments() || []).forEach(d => {
        if (d.status !== 'issued' || !d.sourceId) return;
        const clubId = clubOfEvent.get(String(d.sourceId));
        if (!clubId) return;
        if (!rows.has(clubId)) {
            rows.set(clubId, { clubId, name: clubs.get(clubId) || clubId, documents: 0, winners: 0 });
        }
        const row = rows.get(clubId);
        row.documents++;
        if ([1, 2, 3].includes(Number(d.place))) row.winners++;
    });

    return Array.from(rows.values()).sort((a, b) => b.documents - a.documents);
};
