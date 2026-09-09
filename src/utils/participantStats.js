// ISHTIROKCHILAR STATISTIKASI — tadbir, musobaqa va to'plam uchun bir xil hisob.
//
// Bitta funksiya uchala joyga xizmat qiladi, chunki savol uchalasida ham bir xil:
// "kim qatnashdi va ular qaysi fakultet/kurs/guruh/tyutordan". Har ekran o'zicha
// hisoblasa, ular bir-biridan chetga chiqib ketardi - to'plamdagi jami tadbirlar
// yig'indisiga to'g'ri kelmay qolardi.
//
// MANBA - HAQIQIY YOZUVLAR, taxmin yo'q:
//   ro'yxatdan o'tganlar -> `registrations` (jamoa a'zolari ochib chiqiladi)
//   qatnashganlar        -> `activityAttendance` (status 'present')
// Davomat belgilanmagan bo'lsa `attendanceMarked: false` qaytadi va ekran
// foizni KO'RSATMAYDI. Nolni ko'rsatish "hech kim kelmagan" degan yolg'on
// bo'lardi - loyihadagi umumiy qoida: ma'lumot yo'q bo'lsa nol emas, "yo'q".

// Ma'lumoti yo'q ishtirokchi ham hisobdan tushib qolmasligi kerak: u ALOHIDA
// guruhga yig'iladi, aks holda jami sonlar bir-biriga to'g'ri kelmasdi va
// mas'ul buni sezmasdi ham.
export const UNKNOWN_KEY = "Ko'rsatilmagan";

// Bitta odamni yagona ko'rinishga keltirish. Uch manba ketma-ket sinaladi,
// chunki platformada ikkita alohida shaxs hovuzi bor: sintetik talabalar va
// haqiqiy Supabase akkauntlari (db.getSyncedProfiles izohiga qarang).
const resolvePerson = (id, snapshot, studentById, profileByUsername) => {
    const s = studentById.get(id);
    const p = profileByUsername.get(id);
    return {
        id,
        fullName: snapshot?.fullName || s?.fullName || p?.fullName || id,
        faculty: snapshot?.faculty || s?.faculty || p?.faculty || null,
        course: snapshot?.course ?? s?.course ?? p?.course ?? null,
        group: snapshot?.group || s?.group || p?.studentGroup || p?.group || null,
    };
};

const bucket = (value) => {
    if (value === null || value === undefined || value === '') return UNKNOWN_KEY;
    return String(value);
};

// Bir o'lchov bo'yicha yig'ish. `registered` va `attended` YONMA-YON turadi -
// faqat bittasini ko'rsatish "20 kishi yozildi" degan raqamni haqiqatda kim
// kelganidan ajratib bo'lmaydigan qilardi.
const groupBy = (people, keyOf) => {
    const map = new Map();
    people.forEach(p => {
        const key = bucket(keyOf(p));
        const row = map.get(key) || { key, registered: 0, attended: 0 };
        row.registered += 1;
        if (p.attended) row.attended += 1;
        map.set(key, row);
    });
    return [...map.values()];
};

// Kurs SON bo'yicha tartiblanadi, matn bo'yicha emas: "10-kurs" "2-kurs" dan
// oldin chiqib qolmasin. "Ko'rsatilmagan" har doim oxirida.
const sortCourse = (rows) => [...rows].sort((a, b) => {
    if (a.key === UNKNOWN_KEY) return 1;
    if (b.key === UNKNOWN_KEY) return -1;
    return Number(a.key) - Number(b.key);
});

const sortByCount = (rows) => [...rows].sort((a, b) => {
    if (a.key === UNKNOWN_KEY) return 1;
    if (b.key === UNKNOWN_KEY) return -1;
    return b.registered - a.registered || a.key.localeCompare(b.key);
});

/**
 * @param {object} db
 * @param {Array<{activityId: string, activityType: 'event'|'competition'}>} refs
 */
export const buildParticipantStats = (db, refs) => db.withCachedReads(() => {
    const list = (refs || []).filter(r => r && r.activityId && r.activityType);
    if (list.length === 0) {
        return {
            activities: 0, teams: 0, attendanceMarked: false,
            people: [], byFaculty: [], byCourse: [], byGroup: [], byTutor: [],
        };
    }

    const studentById = new Map(db.getMockStudents().map(s => [s.id, s]));
    const profileByUsername = new Map(db.getSyncedProfiles().map(p => [p.username, p]));
    const tutorOfGroup = new Map(
        db.getTutorGroupAssignments().map(a => [a.groupName, a.tutorUsername])
    );
    // Tyutor loginini F.I.Sh. ga aylantirish - ekranda login turishi mas'ul
    // uchun foydasiz.
    const tutorName = (username) => {
        if (!username) return null;
        const p = profileByUsername.get(username);
        return p?.fullName || studentById.get(username)?.fullName || username;
    };

    // Bir odam bir necha faoliyatda qatnashishi mumkin (ayniqsa to'plamda).
    // U BIR MARTA sanaladi: "45 ishtirokchi" degan raqam odamlar sonini
    // bildirishi kerak, ro'yxatga yozilishlar sonini emas.
    const byPerson = new Map();
    let teams = 0;
    let anyAttendanceRow = false;

    list.forEach(({ activityId, activityType }) => {
        const attendance = db.getActivityAttendanceForActivity(activityId, activityType) || [];
        if (attendance.length > 0) anyAttendanceRow = true;
        const presentIds = new Set(
            attendance.filter(a => a.status === 'present').map(a => String(a.participantId))
        );

        const regs = (db.getRegistrationsForActivity(activityId, activityType) || [])
            .filter(r => r.status === 'registered');

        regs.forEach(reg => {
            // Kim shu yozuv ortida turibdi. Jamoa bo'lsa - a'zolari;
            // tasdiqlangan jamoada haqiqiy ro'yxat, tasdiqlanmaganida esa
            // sardor + qabul qilganlar (ular allaqachon qatnashish niyatini
            // bildirgan, shuning uchun hisobga kiradi).
            let entries;
            if (reg.participantType === 'team') {
                teams += 1;
                if (reg.realTeamId) {
                    entries = (db.getTeamMembers(reg.realTeamId) || [])
                        .map(m => ({ id: m.userId, snapshot: null }));
                } else {
                    entries = [
                        { id: reg.userId, snapshot: reg.participantSnapshot },
                        ...(reg.teamMembers || [])
                            .filter(m => m.status === 'accepted')
                            .map(m => ({ id: m.userId, snapshot: null })),
                    ];
                }
            } else {
                entries = [{ id: reg.userId, snapshot: reg.participantSnapshot }];
            }

            entries.forEach(({ id, snapshot }) => {
                if (!id) return;
                const key = String(id);
                const existing = byPerson.get(key);
                const attended = presentIds.has(key);
                if (existing) {
                    // Bir necha faoliyatda qatnashgan bo'lsa - kamida bittasida
                    // kelgani "qatnashgan" deb hisoblanadi.
                    existing.attended = existing.attended || attended;
                    existing.activityCount += 1;
                    return;
                }
                const person = resolvePerson(key, snapshot, studentById, profileByUsername);
                byPerson.set(key, { ...person, attended, activityCount: 1 });
            });
        });
    });

    const people = [...byPerson.values()].map(p => ({
        ...p,
        tutor: tutorName(tutorOfGroup.get(p.group)),
    }));

    return {
        activities: list.length,
        teams,
        // Davomat umuman kiritilmagan bo'lsa foiz KO'RSATILMAYDI. Bu 0% emas -
        // "hali belgilanmagan" degani, va ikkovi butunlay boshqa narsa.
        attendanceMarked: anyAttendanceRow,
        people,
        byFaculty: sortByCount(groupBy(people, p => p.faculty)),
        byCourse: sortCourse(groupBy(people, p => p.course)),
        byGroup: sortByCount(groupBy(people, p => p.group)),
        byTutor: sortByCount(groupBy(people, p => p.tutor)),
    };
});
