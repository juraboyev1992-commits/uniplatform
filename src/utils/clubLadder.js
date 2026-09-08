import { mergeLadder, stepForPosition, LADDER_STEPS } from '../config/clubLadder';

// Zinapoya tekshiruvi — HAQIQIY yozuvlardan.
//
// Nimani o'lchaydi:
//   qatnashuv       - davomat yozuvida `present` belgisi bor tadbirlar
//   tashkilotchilik - davomat yozuvida roli `organizer` bo'lgan tadbirlar
//   lavozimda vaqt  - tayinlov `assignedAt` dan bugungacha
//
// MUHIM FARQ: ro'yxatdan o'tish ≠ qatnashish. Talaba yozilib kelmasligi mumkin.
// Zinapoya faqat DAVOMAT bo'yicha yuradi, aks holda tugma bosib ko'tarilish mumkin
// bo'lib qolardi.

const monthsBetween = (fromIso, to = new Date()) => {
    if (!fromIso) return 0;
    const from = new Date(fromIso);
    if (Number.isNaN(from.getTime())) return 0;
    return Math.max(0, (to - from) / (1000 * 60 * 60 * 24 * 30.44));
};

// Talabaning shu klubdagi xom ko'rsatkichlari.
export const getClubLadderStats = (db, studentId, clubId) => {
    const clubEvents = (db.getClubEvents(clubId) || []);
    const clubEventIds = new Set(clubEvents.map(e => e.id));

    const attendance = (db.getAttendanceForParticipant(studentId) || [])
        .filter(a => a.activityType === 'event' && clubEventIds.has(a.activityId));

    const attendedCount = attendance.filter(a => a.status === 'present').length;
    // Tashkilotchilik faqat HAQIQATAN qatnashgan tadbirda hisoblanadi: rolini
    // "tashkilotchi" deb belgilab, o'zi kelmagan holat hissa emas.
    const organizerCount = attendance.filter(a => a.status === 'present' && a.role === 'organizer').length;

    const heldEvents = clubEvents.length;
    const attendancePercent = heldEvents > 0
        ? Math.round((attendedCount / heldEvents) * 100)
        : null;

    const assignments = (db.getClubPositionAssignments(clubId) || [])
        .filter(a => a.studentId === studentId);

    // Bosqich bo'yicha eng UZOQ turgan vaqt (bir necha marta tayinlangan bo'lishi mumkin).
    const monthsInStep = (stepId) => assignments
        .filter(a => stepForPosition(a.positionTitle) === stepId)
        .reduce((max, a) => Math.max(max, monthsBetween(a.assignedAt, a.endedAt ? new Date(a.endedAt) : new Date())), 0);

    return {
        heldEvents, attendedCount, attendancePercent, organizerCount,
        internalMonths: monthsInStep('internal'),
        assistantMonths: monthsInStep('assistant_coordinator'),
    };
};

// Bitta bosqich uchun talablar ro'yxati: har biri "bajarildi / bajarilmadi" va
// joriy qiymati bilan. Talaba "nima qilsam ko'tarilaman" degan savolga javob
// ko'rishi uchun har doim JORIY va KERAKLI qiymat yonma-yon ko'rsatiladi.
export const evaluateLadderStep = (stats, ladder, stepId) => {
    const cfg = mergeLadder(ladder);
    const rows = [];

    const add = (label, ok, current, required, note) =>
        rows.push({ label, ok, current, required, note });

    if (stepId === 'internal') {
        // Klub hali kam tadbir o'tkazgan bo'lsa foiz ma'nosiz - shuni ochiq aytamiz,
        // "bajarilmadi" deb ko'rsatib talabani ayblamaymiz.
        if (stats.heldEvents < cfg.minClubEvents) {
            add('Klub tadbirlarida qatnashuv', false,
                `${stats.attendedCount} / ${stats.heldEvents}`,
                `${cfg.attendancePercent}%`,
                `Klub hali ${cfg.minClubEvents} ta tadbir o'tkazmagan — foiz hisoblanmaydi`);
        } else {
            add('Klub tadbirlarida qatnashuv',
                stats.attendancePercent >= cfg.attendancePercent,
                `${stats.attendancePercent}% (${stats.attendedCount}/${stats.heldEvents})`,
                `${cfg.attendancePercent}%`);
        }
        add('Tashkilotchi sifatida qatnashgan',
            stats.organizerCount >= cfg.organizerCount,
            `${stats.organizerCount} marta`, `${cfg.organizerCount} marta`);
    }

    if (stepId === 'assistant_coordinator') {
        add('Ichki lavozimda',
            stats.internalMonths >= cfg.internalMonths,
            `${Math.floor(stats.internalMonths)} oy`, `${cfg.internalMonths} oy`);
        add('Tashkilotchi sifatida qatnashgan',
            stats.organizerCount >= cfg.organizerCountAssistant,
            `${stats.organizerCount} marta`, `${cfg.organizerCountAssistant} marta`);
    }

    if (stepId === 'head_coordinator') {
        add('Yordamchi koordinatorlikda',
            stats.assistantMonths >= cfg.assistantMonths,
            `${Math.floor(stats.assistantMonths)} oy`, `${cfg.assistantMonths} oy`);
    }

    return {
        stepId,
        rows,
        // "Hammasi bajarildi" - BLOKLASH uchun emas, ko'rsatish uchun. Qaror
        // koordinator/adminda (config/clubLadder.js dagi tamoyilga qarang).
        meetsAll: rows.length > 0 && rows.every(r => r.ok),
    };
};

// Lavozim turi bo'yicha to'g'ridan-to'g'ri baholash - ariza formasi shuni chaqiradi.
export const evaluateForPosition = (db, studentId, clubId, positionTitle, ladder) => {
    const stats = getClubLadderStats(db, studentId, clubId);
    return { stats, ...evaluateLadderStep(stats, ladder, stepForPosition(positionTitle)) };
};

// Butun zinapoya - talaba o'z holatini ko'rishi uchun (klub sahifasida).
export const evaluateWholeLadder = (db, studentId, clubId, ladder) => {
    const stats = getClubLadderStats(db, studentId, clubId);
    return {
        stats,
        steps: LADDER_STEPS.map(s => ({
            ...s,
            ...evaluateLadderStep(stats, ladder, s.id),
        })),
    };
};
