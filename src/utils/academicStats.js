// ===========================================================================
// AKADEMIK KO'RSATKICHLAR TAHLILI
//
// GPA va qoldirilgan soat indeksning 3- va 6-mezonini oziqlantiradi, lekin
// ularning TAQSIMOTI hech qayerda ko'rinmasdi: administrator faqat bitta
// talabaning yozuvini ko'ra olardi.
//
// Ikki narsa ataylab ajratilgan:
//   QAMROV  - nechta talabaning ma'lumoti kiritilgan (ishning bajarilishi)
//   NATIJA  - kiritilganlarning ko'rsatkichi (talabalarning holati)
// Ularni aralashtirish "o'rtacha GPA past" degan noto'g'ri xulosaga olib
// kelardi - aslida shunchaki ma'lumot kiritilmagan bo'lishi mumkin.
//
// GPA 3.5 dan past bo'lsa 3-mezonda ball berilmaydi (metodika) - shuning
// uchun "xavf guruhi" chegarasi shu yerdan olinadi, o'ylab topilmaydi.
// ===========================================================================
import { INDEX_CRITERIA, gpaToPoints, missedHoursToPoints } from '../config/socialActivityIndex';

// Metodikadagi eng past ball beruvchi GPA - jadvalning oxirgi qatori.
export const GPA_THRESHOLD = INDEX_CRITERIA.ACADEMIC.gpaTable[
    INDEX_CRITERIA.ACADEMIC.gpaTable.length - 1
].gpa;

const avg = (nums) => (nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null);
const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

export const getAcademicStats = (db, academicYear) => {
    const students = db.getMockStudents();
    const byId = new Map(students.map(s => [s.id, s]));
    const records = db.getAcademicRecords().filter(r => r.academicYear === academicYear);

    // --- Talaba kesimida: semestrlar o'rtachasi ---
    const perStudent = new Map();
    records.forEach(r => {
        if (!perStudent.has(r.studentId)) perStudent.set(r.studentId, { gpa: [], missed: [] });
        const row = perStudent.get(r.studentId);
        if (r.gpa != null) row.gpa.push(Number(r.gpa));
        if (r.missedHours != null) row.missed.push(Number(r.missedHours));
    });

    const gpaStudents = [];
    const missedStudents = [];
    perStudent.forEach((v, studentId) => {
        if (v.gpa.length > 0) gpaStudents.push({ studentId, gpa: avg(v.gpa), semesters: v.gpa.length });
        if (v.missed.length > 0) missedStudents.push({ studentId, hours: avg(v.missed), semesters: v.missed.length });
    });

    // --- GPA taqsimoti ---
    // Bandlar metodikaning ball jadvaliga bog'langan, tasodifiy tanlanmagan:
    // 3.5 - ball boshlanadigan chegara, 4.5 va 4.0 esa jadvalning o'z qadamlari.
    const bands = [
        { key: 'high', label: '4.5 va yuqori', min: 4.5, tone: 'emerald' },
        { key: 'good', label: '4.0 – 4.49', min: 4.0, tone: 'sky' },
        { key: 'pass', label: `${GPA_THRESHOLD} – 3.99`, min: GPA_THRESHOLD, tone: 'amber' },
        { key: 'risk', label: `${GPA_THRESHOLD} dan past — ball berilmaydi`, min: 0, tone: 'red' },
    ];
    const distribution = bands.map(b => ({ ...b, count: 0 }));
    gpaStudents.forEach(s => {
        const band = distribution.find(b => s.gpa >= b.min);
        if (band) band.count++;
    });

    // --- Fakultet kesimi ---
    const byFaculty = new Map();
    const ensureFaculty = (faculty) => {
        if (!byFaculty.has(faculty)) {
            byFaculty.set(faculty, { faculty, students: 0, gpaValues: [], missedValues: [] });
        }
        return byFaculty.get(faculty);
    };
    students.forEach(s => { if (s.faculty) ensureFaculty(s.faculty).students++; });
    gpaStudents.forEach(s => {
        const faculty = byId.get(s.studentId)?.faculty;
        if (faculty) ensureFaculty(faculty).gpaValues.push(s.gpa);
    });
    missedStudents.forEach(s => {
        const faculty = byId.get(s.studentId)?.faculty;
        if (faculty) ensureFaculty(faculty).missedValues.push(s.hours);
    });

    const faculties = Array.from(byFaculty.values())
        .map(f => ({
            faculty: f.faculty,
            students: f.students,
            covered: f.gpaValues.length,
            // Qamrovi yo'q fakultetda o'rtacha YO'Q - nol emas.
            averageGpa: round2(avg(f.gpaValues)),
            averageMissed: round1(avg(f.missedValues)),
            coveragePercent: f.students > 0 ? Math.round((f.gpaValues.length / f.students) * 100) : 0,
        }))
        .sort((a, b) => (b.averageGpa ?? -1) - (a.averageGpa ?? -1));

    // --- Xavf guruhi: ball bermaydigan GPA yoki ko'p qoldirilgan soat ---
    const missedZeroPoint = missedStudents
        .filter(s => missedHoursToPoints(s.hours) === 0)
        .map(s => ({
            ...s,
            hours: round1(s.hours),
            student: byId.get(s.studentId) || null,
        }))
        .sort((a, b) => b.hours - a.hours);

    const gpaRisk = gpaStudents
        .filter(s => s.gpa < GPA_THRESHOLD)
        .map(s => ({
            ...s,
            gpa: round2(s.gpa),
            student: byId.get(s.studentId) || null,
        }))
        .sort((a, b) => a.gpa - b.gpa);

    return {
        academicYear,
        totalStudents: students.length,
        // QAMROV
        gpaCovered: gpaStudents.length,
        gpaCoveragePercent: students.length > 0
            ? Math.round((gpaStudents.length / students.length) * 100) : 0,
        missedCovered: missedStudents.length,
        missedCoveragePercent: students.length > 0
            ? Math.round((missedStudents.length / students.length) * 100) : 0,
        // NATIJA
        averageGpa: round2(avg(gpaStudents.map(s => s.gpa))),
        averageMissed: round1(avg(missedStudents.map(s => s.hours))),
        averageGpaPoints: gpaStudents.length > 0
            ? round1(avg(gpaStudents.map(s => gpaToPoints(s.gpa))))
            : null,
        distribution,
        faculties,
        gpaRisk,
        missedZeroPoint,
        // Bir semestrgina kiritilganlar - yakuniy baho hali to'liq emas.
        partialGpa: gpaStudents.filter(s => s.semesters < 2).length,
    };
};
