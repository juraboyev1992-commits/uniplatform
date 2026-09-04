// ===========================================================================
// MA'RIFAT DARSLARI TAHLILI (7-mezon)
//
// Darslar ro'yxati bor edi, lekin ulardan bironta umumiy ko'rsatkich
// chiqarilmasdi: nechta dars o'tildi, qaysi auditoriya qamrab olinmagan,
// o'rtacha davomat qanday.
//
// AUDITORIYA - fakultet + kurs juftligi. Ball aynan shu doiradagi davomat
// foizidan chiqadi, shuning uchun tahlil ham shu kesimda quriladi.
//
// Darsi umuman rejalashtirilmagan auditoriya "0% davomat" emas: u yerda
// o'lchanadigan narsa yo'q. Bu ikkisi alohida ko'rsatiladi.
// ===========================================================================

export const getMarifatStats = (db, academicYear) => {
    const lessons = db.getMarifatLessons(academicYear);
    const students = db.getMockStudents();

    // --- Barcha auditoriyalar (fakultet + kurs) ---
    const audiences = new Map();
    students.forEach(s => {
        if (!s.faculty || !s.course) return;
        const key = `${s.faculty}::${s.course}`;
        if (!audiences.has(key)) {
            audiences.set(key, { key, faculty: s.faculty, course: Number(s.course), students: 0, lessons: 0, present: 0, marked: 0, active: 0 });
        }
        audiences.get(key).students++;
    });

    let totalMarked = 0;
    let totalPresent = 0;
    let totalActive = 0;
    let lockedLessons = 0;
    const attended = new Set();

    lessons.forEach(l => {
        if (l.locked) lockedLessons++;
        const key = `${l.faculty}::${Number(l.course)}`;
        const audience = audiences.get(key);
        if (audience) audience.lessons++;

        db.getMarifatAttendance(l.id).forEach(a => {
            totalMarked++;
            if (audience) audience.marked++;
            if (a.present) {
                totalPresent++;
                attended.add(a.studentId);
                if (audience) audience.present++;
            }
            if (a.active) {
                totalActive++;
                if (audience) audience.active++;
            }
        });
    });

    const rows = Array.from(audiences.values())
        .map(a => ({
            ...a,
            // Darsi yo'q auditoriyada foiz YO'Q - nol emas.
            attendancePercent: a.marked > 0 ? Math.round((a.present / a.marked) * 100) : null,
            activePercent: a.present > 0 ? Math.round((a.active / a.present) * 100) : null,
        }))
        .sort((a, b) => a.faculty.localeCompare(b.faculty) || a.course - b.course);

    return {
        academicYear,
        lessons: lessons.length,
        lockedLessons,
        openLessons: lessons.length - lockedLessons,
        // Davomati umuman belgilanmagan darslar - bajarilmagan ish.
        unmarkedLessons: lessons.filter(l => db.getMarifatAttendance(l.id).length === 0).length,
        totalMarked,
        totalPresent,
        attendancePercent: totalMarked > 0 ? Math.round((totalPresent / totalMarked) * 100) : null,
        activeRecords: totalActive,
        activePercent: totalPresent > 0 ? Math.round((totalActive / totalPresent) * 100) : null,
        coveredStudents: attended.size,
        totalStudents: students.length,
        coveragePercent: students.length > 0 ? Math.round((attended.size / students.length) * 100) : 0,
        audiences: rows,
        // Darsi umuman rejalashtirilmagan auditoriyalar.
        audiencesWithoutLessons: rows.filter(r => r.lessons === 0),
    };
};
