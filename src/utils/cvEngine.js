import { buildStudentPortfolio } from './studentPortfolio';

// CV DVIGATELI — jamlovchi qatlam.
//
// ARXITEKTURA QOIDASI: CV hech narsa SAQLAMAYDI. GPA, klublar,
// tadbirlar, sertifikatlar, yutuqlar va musobaqalar allaqachon o'z
// modullarida turadi; bu fayl ularni O'QIYDI va bitta shaklga keltiradi.
// Nusxalash ikki xil haqiqat yaratardi - hujjat reestrida bir xil, CV da
// boshqacha.
//
// Talaba qo'lda kiritadigan qism (bio, havolalar, ko'nikmalar, tillar,
// ish tajribasi, amaliyot) `student_cv_profile` da turadi va u yerda
// FAQAT platformada manbasi yo'q narsalar saqlanadi.

// MA'LUMOT MANBASI HAR QATORDA KO'RSATILADI.
//
// Farqi haqiqiy: "tasdiqlangan" - ro'yxatga olish raqami bor, QR bilan
// tekshiriladigan hujjat; "avtomatik" - platformaning o'z yozuvi
// (a'zolik, davomat); "talaba kiritgan" - hech kim tekshirmagan.
// Uchalasini bir xil ko'rsatish tasdiqlangan yozuvlarning qadrini
// tushirardi - CV ning butun qiymati aynan shunda.
export const SOURCE = {
    VERIFIED: 'verified',
    AUTO: 'auto',
    MANUAL: 'manual',
};

export const SOURCE_META = {
    [SOURCE.VERIFIED]: { label: 'Tasdiqlangan', tone: 'emerald' },
    [SOURCE.AUTO]: { label: "Avtomatik qo'shildi", tone: 'blue' },
    [SOURCE.MANUAL]: { label: 'Siz kiritgansiz', tone: 'amber' },
};

const yearOf = (d) => {
    if (!d) return null;
    const t = new Date(d);
    return Number.isNaN(t.getTime()) ? null : t.getFullYear();
};

// "2021 – hozir" ko'rinishidagi davr. Tugash sanasi yo'q bo'lsa davom
// etayotgan deb hisoblanadi.
const period = (from, to, ongoing = true) => {
    const a = yearOf(from);
    const b = yearOf(to);
    if (!a && !b) return null;
    if (a && b) return a === b ? String(a) : `${a} – ${b}`;
    if (a) return ongoing ? `${a} – hozir` : String(a);
    return String(b);
};

// CV BO'LIMLARI.
//
// Tartib CV mantig'iga ko'ra: avval kimligi va ta'limi, keyin tajribasi,
// keyin tasdiqlangan yutuqlari. Talaba bo'limni yashira oladi, lekin
// tartibni o'zgartira olmaydi - bu keyingi bosqich.
export const CV_SECTIONS = [
    { id: 'about', label: "Qisqacha ma'lumot" },
    { id: 'education', label: "Ta'lim" },
    { id: 'experience', label: 'Ish tajribasi' },
    { id: 'internships', label: 'Amaliyot' },
    { id: 'projects', label: 'Loyihalar' },
    { id: 'skills', label: "Ko'nikmalar" },
    { id: 'languages', label: 'Tillar' },
    { id: 'certificates', label: 'Sertifikatlar' },
    { id: 'clubs', label: 'Klublar va jamoalar' },
    { id: 'volunteering', label: 'Volontyorlik' },
    { id: 'awards', label: 'Mukofotlar va yutuqlar' },
    { id: 'competitions', label: 'Tanlov va musobaqalar' },
];

// Musobaqalarda talaba qatnashganini aniqlash. `participants` massivi
// musobaqa yozuvining ichida turadi va unda jamoa ham, yakka ishtirokchi
// ham bo'lishi mumkin - shuning uchun ikkala shakl ham tekshiriladi.
const competitionsOf = (db, studentId) => {
    const list = (db.getPublicCompetitions?.() || db.getCompetitions?.() || []);
    return list
        .filter(c => (c.participants || []).some(pt =>
            pt.id === studentId
            || pt.registeredBy === studentId
            || (pt.members || []).some(m => m === studentId || m?.id === studentId)))
        .map(c => ({
            id: c.id,
            title: c.name,
            subtitle: c.contextType === 'club' ? 'Klub musobaqasi' : 'Universitet musobaqasi',
            period: period(c.startDate, c.endDate, false),
            source: SOURCE.AUTO,
        }));
};

export const buildCv = (db, studentId) => {
    const p = buildStudentPortfolio(db, studentId);
    const manual = db.getCvProfile(studentId);
    const s = p.student;

    // --- TA'LIM (pasport va akademik yozuvdan) ---
    const education = s ? [{
        id: 'edu_main',
        title: 'Toshkent davlat yuridik universiteti',
        subtitle: [s.faculty, 'Bakalavriat'].filter(Boolean).join('  |  '),
        note: [
            p.academic.gpa !== null ? `O'rtacha baho: ${p.academic.gpa}` : null,
            s.course ? `${s.course}-bosqich` : null,
            s.group || null,
        ].filter(Boolean).join('  |  '),
        period: p.academic.gpaYear || null,
        source: SOURCE.AUTO,
    }] : [];

    // --- KLUBLAR ---
    const clubs = p.clubs.map(c => ({
        id: c.clubId,
        title: c.name,
        subtitle: c.positions.length > 0 ? c.positions.join(', ') : "A'zo",
        period: period(c.joinedAt, null),
        source: SOURCE.AUTO,
    }));

    // --- RASMIY HUJJATLAR ikkiga bo'linadi ---
    // Sovrinli o'rni bor hujjat - YUTUQ, qolgani SERTIFIKAT. Ikkalasi
    // bitta reestrdan keladi, lekin CV da boshqa bo'limlarda turadi.
    const awards = p.documents.filter(d => d.place).map(d => ({
        id: d.id,
        title: d.title,
        subtitle: [d.place ? `${d.place}-o'rin` : null, d.typeLabel].filter(Boolean).join('  ·  '),
        note: d.registrationNumber ? `№ ${d.registrationNumber}` : null,
        period: yearOf(d.date),
        source: SOURCE.VERIFIED,
    }));

    const certificates = [
        ...p.documents.filter(d => !d.place).map(d => ({
            id: d.id,
            title: d.title,
            subtitle: d.typeLabel,
            note: d.registrationNumber ? `№ ${d.registrationNumber}` : null,
            period: yearOf(d.date),
            source: SOURCE.VERIFIED,
        })),
        // Talaba yuklagan tashqi hujjatlar - AYNI bo'limda, lekin boshqa
        // belgi bilan. Ularni yashirish CV ni kambag'al qilardi, rasmiy
        // deb ko'rsatish esa yolg'on bo'lardi.
        ...p.uploaded.map(d => ({
            id: d.id,
            title: d.title,
            subtitle: d.issuer || 'Tashqi hujjat',
            period: yearOf(d.issuedAt || d.createdAt),
            source: SOURCE.MANUAL,
        })),
    ];

    // --- TALABA KIRITGANLARI ---
    const asManual = (arr, map) => (arr || []).map((x, i) => ({ ...map(x, i), source: SOURCE.MANUAL }));

    const experience = asManual(manual.experience, (x, i) => ({
        id: x.id || `exp_${i}`,
        title: x.role || x.title || '',
        subtitle: x.organization || '',
        note: x.description || null,
        period: period(x.from, x.to, !x.to),
    }));

    const internships = asManual(manual.internships, (x, i) => ({
        id: x.id || `int_${i}`,
        title: x.role || x.title || '',
        subtitle: x.organization || '',
        note: x.description || null,
        period: period(x.from, x.to, !x.to),
    }));

    const projects = asManual(manual.projects, (x, i) => ({
        id: x.id || `prj_${i}`,
        title: x.title || '',
        subtitle: x.organization || x.role || '',
        note: x.description || null,
        period: period(x.from, x.to, !x.to),
    }));

    const competitions = competitionsOf(db, studentId);

    // --- VOLONTYORLIK ---
    // DIQQAT: platforma volontyorlikni SOAT bilan emas, TADBIRLAR SONI
    // bilan o'lchaydi (config/socialActivityIndex.js, 8-mezon). Shuning
    // uchun "156 soat" kabi ko'rsatkich CV da yo'q va bo'lishi ham
    // mumkin emas - manbasi yo'q raqamni yozish o'ylab topish bo'lardi.
    const volunteering = (db.getStudentVolunteeringActivity?.(studentId)?.byCategory || [])
        .map(cat => ({
            id: cat.key,
            title: cat.label,
            subtitle: `${cat.total} ta tadbir`
                + (cat.active > 0 ? `, shundan ${cat.active} tasida faol rol` : ''),
            source: SOURCE.AUTO,
        }));

    const sections = {
        about: manual.bio ? [{ id: 'bio', title: manual.bio, source: SOURCE.MANUAL }] : [],
        education,
        experience,
        internships,
        projects,
        skills: (manual.skills || []).map((sk, i) => ({
            id: sk.id || `skill_${i}`,
            title: sk.name || sk,
            subtitle: sk.level || null,
            source: SOURCE.MANUAL,
        })),
        languages: (manual.languages || []).map((l, i) => ({
            id: l.id || `lang_${i}`,
            title: l.name || l,
            subtitle: l.level || null,
            source: l.certificateId ? SOURCE.VERIFIED : SOURCE.MANUAL,
        })),
        certificates,
        clubs,
        volunteering,
        awards,
        competitions,
    };

    // --- KO'RSATKICHLAR ---
    // Faqat TASDIQLANGAN platforma yozuvidan. Bu "like" yoki sun'iy
    // raqam emas - har biri o'z modulida tekshiriladigan yozuv.
    const impact = [
        { key: 'events', value: p.counts.attendance, label: 'Tadbir va musobaqa' },
        { key: 'clubs', value: p.counts.clubs, label: 'Klub' },
        { key: 'positions', value: p.counts.positions, label: 'Liderlik roli' },
        { key: 'competitions', value: competitions.length, label: 'Tanlov' },
        { key: 'projects', value: projects.length, label: 'Loyiha' },
    ].filter(x => x.value > 0);

    // --- TO'LIQLIK ---
    // Foiz O'YLAB TOPILMAYDI: CV ning nechta bo'limi to'lganini sanaydi.
    // Maxraj ham, yetishmayotganlar ro'yxati ham ko'rsatiladi - aks holda
    // raqam hech narsa anglatmaydi va talaba nima qilishni bilmaydi.
    const checklist = CV_SECTIONS.map(sec => ({
        id: sec.id,
        label: sec.label,
        filled: (sections[sec.id] || []).length > 0,
    }));
    const filled = checklist.filter(c => c.filled).length;

    return {
        student: s,
        manual,
        sections,
        impact,
        stats: {
            gpa: p.academic.gpa,
            gpaYear: p.academic.gpaYear,
            awards: awards.length,
            certificates: certificates.length,
            clubs: p.counts.clubs,
            attendance: p.counts.attendance,
            books: p.counts.books,
            totalBooks: p.counts.totalBooks,
        },
        completeness: {
            percent: Math.round((filled / checklist.length) * 100),
            filled,
            total: checklist.length,
            missing: checklist.filter(c => !c.filled).map(c => c.label),
        },
        isEmpty: Object.values(sections).every(v => v.length === 0),
    };
};
