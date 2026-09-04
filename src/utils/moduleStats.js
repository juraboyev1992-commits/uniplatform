// ===========================================================================
// MODUL KO'RSATKICHLARI
//
// Beshta modulning har birida ro'yxat bor edi, lekin bironta umumiy raqam
// yo'q edi: administrator "nechta bor" ni sanab chiqishi kerak bo'lardi.
//
// Bu yerdagi hisoblar ATAYLAB kichik - ular alohida "Tahlil" tabini emas,
// panelning O'Z boshida turadigan bir qatorni to'ldiradi. Modulning kundalik
// ishi ro'yxat bilan, ko'rsatkich esa unga qo'shimcha.
//
// Umumiy qoida: maxraji yo'q foiz `null` qaytadi, nol emas.
// ===========================================================================
import { CULTURAL_PLACE_TYPES } from '../config/socialActivityIndex';

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);

// ---------------------------------------------------------------------------
// MADANIY TASHRIFLAR (9-mezon)
// ---------------------------------------------------------------------------
export const getCulturalStats = (db, academicYear = null) => {
    const all = db.getCulturalVisits({ academicYear });
    const confirmed = all.filter(v => v.status === 'confirmed');

    // Joy nomi bo'yicha - `placeId` bo'lmasligi mumkin (talaba katalogda yo'q
    // joyni qo'lda yozgan), shuning uchun nom kalit sifatida ishlatiladi.
    const byPlace = new Map();
    confirmed.forEach(v => {
        const name = String(v.placeName || '').trim() || "Nomi ko'rsatilmagan";
        if (!byPlace.has(name)) byPlace.set(name, { name, type: v.placeType || null, visits: 0, students: new Set() });
        const row = byPlace.get(name);
        row.visits++;
        row.students.add(v.studentId);
    });

    const byType = new Map();
    confirmed.forEach(v => {
        const type = v.placeType || 'other';
        byType.set(type, (byType.get(type) || 0) + 1);
    });

    return {
        total: all.length,
        confirmed: confirmed.length,
        pending: all.filter(v => v.status === 'pending').length,
        rejected: all.filter(v => v.status === 'rejected').length,
        students: new Set(confirmed.map(v => v.studentId)).size,
        confirmRate: pct(confirmed.length, all.filter(v => v.status !== 'pending').length),
        places: db.getCulturalPlaces(true).length,
        topPlaces: Array.from(byPlace.values())
            .map(p => ({ ...p, students: p.students.size }))
            .sort((a, b) => b.visits - a.visits)
            .slice(0, 5),
        types: Array.from(byType.entries())
            .map(([key, count]) => ({
                key, count,
                label: CULTURAL_PLACE_TYPES[key]?.label || key,
            }))
            .sort((a, b) => b.count - a.count),
    };
};

// ---------------------------------------------------------------------------
// TERMA JAMOALAR (10-mezon)
// ---------------------------------------------------------------------------
export const getSportStats = (db, academicYear = null) => {
    const teams = db.getSportTeams(academicYear);
    const nominations = db.getSportNominations({ academicYear });
    const approved = nominations.filter(n => n.status === 'approved' && !n.endedAt);

    const byTeam = new Map();
    approved.forEach(n => byTeam.set(n.teamId, (byTeam.get(n.teamId) || 0) + 1));

    const rows = teams.map(t => {
        const size = byTeam.get(t.id) || 0;
        return {
            id: t.id, name: t.name, sport: t.sport || null,
            maxSize: t.maxSize || null, size,
            // Tarkib soni belgilanmagan jamoada to'lganlik foizi YO'Q.
            fillPercent: t.maxSize ? Math.round((size / t.maxSize) * 100) : null,
        };
    });

    return {
        teams: teams.length,
        activeTeams: teams.filter(t => t.isActive !== false).length,
        members: approved.length,
        students: new Set(approved.map(n => n.studentId)).size,
        pending: nominations.filter(n => n.status === 'pending').length,
        rejected: nominations.filter(n => n.status === 'rejected').length,
        // Tarkibi bo'sh jamoalar - e'lon qilingan, lekin hech kim yo'q.
        emptyTeams: rows.filter(r => r.size === 0).length,
        fullTeams: rows.filter(r => r.maxSize && r.size >= r.maxSize).length,
        rows: rows.sort((a, b) => b.size - a.size),
    };
};

// ---------------------------------------------------------------------------
// YOTOQXONALAR
//
// Bandlik foizi ATAYLAB hisoblanmaydi: yotoqxonaning sig'imi platformada
// saqlanmaydi. O'rniga joylashtirilgan talabalar soni ko'rsatiladi - bu
// haqiqiy, o'ylab topilmagan raqam. Sig'im maydoni qo'shilsa, foiz ham
// shu yerda paydo bo'ladi.
// ---------------------------------------------------------------------------
export const getHousingStats = (db, academicYear = null) => {
    const dormitories = db.getDormitories(true);
    const housing = db.getAllStudentHousing(academicYear);
    const totalStudents = db.getMockStudents().length;

    const byDorm = new Map();
    housing.filter(h => h.housingType === 'dormitory' && h.dormitoryId).forEach(h => {
        if (!byDorm.has(h.dormitoryId)) byDorm.set(h.dormitoryId, { residents: 0, rooms: new Set() });
        const row = byDorm.get(h.dormitoryId);
        row.residents++;
        if (h.room) row.rooms.add(h.room);
    });

    const byType = {
        dormitory: housing.filter(h => h.housingType === 'dormitory').length,
        rent: housing.filter(h => h.housingType === 'rent').length,
        family: housing.filter(h => h.housingType === 'family').length,
    };

    return {
        dormitories: dormitories.length,
        activeDormitories: dormitories.filter(d => d.isActive).length,
        // Mas'uli belgilanmagan yotoqxona - 10-mezonda baholovchi topilmaydi.
        withoutResponsible: dormitories.filter(d => d.isActive && !d.responsibleUserId).length,
        recorded: housing.length,
        totalStudents,
        coveragePercent: pct(housing.length, totalStudents),
        byType,
        rows: dormitories.map(d => ({
            id: d.id, name: d.name, isActive: d.isActive,
            hasResponsible: !!d.responsibleUserId,
            residents: byDorm.get(d.id)?.residents || 0,
            rooms: byDorm.get(d.id)?.rooms.size || 0,
        })).sort((a, b) => b.residents - a.residents),
    };
};

// ---------------------------------------------------------------------------
// INTIZOM (4-mezon)
//
// Bu mezon PREZUMPSIYA asosida ishlaydi: yozuvi yo'q talaba to'liq ballga
// ega. Shuning uchun "nechta talabada yozuv bor" - eng muhim raqam, va u
// har doim jami talabalar soniga nisbatan ko'rsatiladi.
// ---------------------------------------------------------------------------
export const getDisciplineStats = (db, academicYear = null) => {
    const violations = db.getDisciplineViolations(null, academicYear);
    const totalStudents = db.getMockStudents().length;

    const byType = new Map();
    const byStudent = new Map();
    violations.forEach(v => {
        byType.set(v.type, (byType.get(v.type) || 0) + 1);
        byStudent.set(v.studentId, (byStudent.get(v.studentId) || 0) + 1);
    });

    const students = new Map(db.getMockStudents().map(s => [s.id, s]));

    return {
        violations: violations.length,
        students: byStudent.size,
        totalStudents,
        cleanStudents: totalStudents - byStudent.size,
        types: Array.from(byType.entries()).map(([key, count]) => ({ key, count })),
        // Takrorlanuvchilar - bir marta emas, tizimli holat.
        repeaters: Array.from(byStudent.entries())
            .filter(([, count]) => count > 1)
            .map(([studentId, count]) => ({
                studentId, count, student: students.get(studentId) || null,
            }))
            .sort((a, b) => b.count - a.count),
    };
};

// ---------------------------------------------------------------------------
// XONALAR BANDLIGI
//
// Bandlik foizi hisoblanmaydi: "ish kuni necha soat" degan qoida
// platformada belgilanmagan, uni bu yerda o'ylab topish esa foizni
// ma'nosiz qilardi. O'lchanadigan narsa - band SOATLAR va nechta voqea.
// ---------------------------------------------------------------------------
export const getVenueStats = (db, days = 30) => {
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    const from = new Date(to);
    from.setDate(from.getDate() - days);
    from.setHours(0, 0, 0, 0);

    const bookings = db.getVenueBookings(from, to);
    const venues = db.getVenues();

    const byVenue = new Map();
    let totalMinutes = 0;
    bookings.forEach(b => {
        const minutes = Math.max(0, (b.end - b.start) / 60000);
        totalMinutes += minutes;
        const label = b.venueLabel;
        if (!byVenue.has(label)) byVenue.set(label, { label, bookings: 0, minutes: 0 });
        const row = byVenue.get(label);
        row.bookings++;
        row.minutes += minutes;
    });

    const used = new Set(byVenue.keys());

    return {
        days,
        venues: venues.length,
        usedVenues: used.size,
        // Katalogda bor, lekin shu davrda umuman ishlatilmagan xonalar.
        idleVenues: venues.filter(v => !used.has(v.label)).length,
        bookings: bookings.length,
        hours: Math.round(totalMinutes / 60),
        rows: Array.from(byVenue.values())
            .map(r => ({ ...r, hours: Math.round(r.minutes / 60) }))
            .sort((a, b) => b.minutes - a.minutes)
            .slice(0, 6),
    };
};
