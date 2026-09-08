import { SOCIAL_APPLICATION_STATUS } from '../services/db';
import { computeSocialActivityIndex } from './socialActivityScoring';

// TAS ijtimoiy o'lchovi RASMIY INDEKSdan olinadi (186-son buyruq metodikasi), o'zining alohida
// hisobidan emas. Ilgari ikki qatlam ikki xil manbadan hisoblanardi: indeks 11 mezonni haqiqiy
// yozuvlardan, TAS esa tasdiqlangan arizalar balini mezonlar maksimumiga bo'lib. Natijada bitta
// talaba haqida ikki xil ijtimoiy faollik raqami chiqardi va qaysi biri to'g'ri ekani noma'lum edi.
//
// Bu uch mezon ATAYLAB chiqarib tashlanadi - ular TAS'ning O'Z o'lchovlari:
//   ACADEMIC   -> TAS "Akademik skoring" (GPA)
//   CLUBS      -> TAS "Liderlik skoring" (klub lavozimlari)
//   ATTENDANCE -> TAS "Ishonchlilik skoring" (davomat)
// Ularni qoldirish bitta natijani ikki marta sanash bo'lardi.
const TAS_SOCIAL_EXCLUDED_CRITERIA = ['ACADEMIC', 'CLUBS', 'ATTENDANCE'];

// "Talaba Analitik Skoring (TAS)" — 0-1000 ballik kompozit ko'rsatkich. U ikkita ekranda
// ko'rsatiladi (admin panelidagi talaba kartochkasi — StudentsManagement.jsx, va talabaning
// o'z "Mening profilim" sahifasi) va ikkalasi ham AYNAN bir xil raqamni ko'rsatishi shart —
// shuning uchun hisob shu yagona faylda turadi.
//
// HAR TO'RT O'LCHOV HAQIQIY MANBADAN OLINADI:
//   Akademik      <- db.getStudentAverageGPA()        (academicRecords: HEMIS yoki qo'lda kiritilgan)
//   Ijtimoiy      <- db.getSocialApplications()        (tasdiqlangan arizalar bali / mezonlar maksimumi)
//   Liderlik      <- db.getStudentPortfolio()          (haqiqiy faol klub lavozimlari)
//   Ishonchlilik  <- db.getAttendanceForParticipant()  (haqiqiy 'present'/'absent' belgilari)
//
// Ilgari bu fayl to'rt o'lchovdan uchtasini talaba ID'sidan urug'lantirilgan psevdo-tasodifiy
// son bilan to'ldirardi (gpaProxy = 2.5 + rand()*1.5, attendanceProxy = 60 + rand()*40, har bir
// ijtimoiy mezonga rand()*maxPoints). Bu raqamlar har safar bir xil chiqqani uchun tashqaridan
// haqiqiy ma'lumotdek ko'rinardi. O'shanda GPA/davomat uchun real model yo'q edi; endi bor
// (academicRecords, activityAttendance) va o'lchovlar o'sha manbalarga ulandi.
//
// `null` va 0 BIR XIL EMAS. `null` — "ma'lumot kiritilmagan", 0 — "ma'lumot bor, natija nol".
// Masalan faol klub lavozimi bo'lmagan talabaning liderlik bali haqiqiy 0, GPA'si kiritilmagan
// talabaning akademik bali esa `null`. Hech qanday o'lchov o'ylab topilmaydi.
//
// Shu sababli TAS jami bali TO'LIQ BO'LMASLIGI mumkin. Buni yashirmaymiz: `measuredCount`,
// `measuredMax` va `pending` maydonlari qaysi o'lchov hisoblangani va nimasi yetishmayotganini
// ochiq aytadi (utils/socialActivityScoring.js dagi `scoredCount`/`pending` bilan bir uslubda).

// academicRecords GPA'ni 0..5 oralig'ida saqlaydi (db.setAcademicRecord), rasmiy metodikaning
// gpaTable'i ham 5.0 dan boshlanadi — shuning uchun maxraj 5, ilgarigi 4 emas.
export const GPA_MAX = 5;

// `info` - ko'rsatkich yonidagi (i) belgisida chiqadigan qisqa ta'rif: "bu nima o'lchaydi".
// `formula` - o'sha ta'rifning hisob ko'rinishi. Ikkalasi ham shu yerda turadi, chunki admin
// kartochkasi ham, talaba profili ham AYNAN bir xil izohni ko'rsatishi kerak.
export const TAS_DIMENSIONS = [
    {
        key: 'academic', field: 'academicScore', label: 'Akademik skoring', max: 400, dot: 'bg-indigo-600',
        info: "O'quv ko'rsatkichi. Barcha semestrlar bo'yicha o'rtacha GPA olinadi va 400 ballik shkalaga keltiriladi.",
        formula: "(o'rtacha GPA ÷ 5) × 400"
    },
    {
        key: 'social', field: 'socialFaollikScore', label: 'Ijtimoiy faollik skoring', max: 300, dot: 'bg-emerald-500',
        info: "Rasmiy ijtimoiy faollik indeksining (186-son buyruq) ijtimoiy mezonlari. Akademik, klub va davomat mezonlari bu yerga kirmaydi — ular TAS'ning alohida o'lchovlari.",
        formula: "(hisoblangan mezonlar bali ÷ o'sha mezonlar maksimumi) × 300"
    },
    {
        key: 'leadership', field: 'leadershipScore', label: 'Liderlik skoring', max: 150, dot: 'bg-amber-500',
        info: 'Klublardagi faol rasmiy lavozimlar (koordinator, yordamchi koordinator va boshqalar). Tugagan lavozimlar hisoblanmaydi.',
        formula: 'faol lavozim soni × 50 (eng ko\'pi 150)'
    },
    {
        key: 'reliability', field: 'reliabilityScore', label: 'Ishonchlilik skoring', max: 150, dot: 'bg-blue-500',
        info: 'Tadbir va musobaqalardagi davomat. Belgilangan davomat yozuvlarining necha foizida talaba haqiqatan qatnashgani.',
        formula: '(davomat foizi ÷ 100) × 150'
    }
];

export const TAS_MAX_TOTAL = TAS_DIMENSIONS.reduce((sum, d) => sum + d.max, 0);

export const TAS_TIERS = [
    { label: 'Bronze', range: '0-399' },
    { label: 'Silver', range: '400-599' },
    { label: 'Gold', range: '600-799' },
    { label: 'Platinum', range: '800-1000' }
];

// Shared threshold logic — exported so rankingsAnalytics.js (faculty/course/club averages) can label a
// group's average TAS with the same tiers a student sees on their own score, without duplicating the
// cutoffs in a second place.
export const tierForTotal = (total) =>
    total >= 800 ? 'Platinum' : total >= 600 ? 'Gold' : total >= 400 ? 'Silver' : 'Bronze';

// One suggestion per under-filled category (>20-point gap from its own max), largest gap first, capped
// at 3 — "Rivojlanish tavsiyalari". The point-gain estimate is 40% of the remaining gap, a plausible
// near-term improvement rather than the full (unrealistic) distance to the category's max.
//
// O'lchanmagan (null) o'lchov bu ro'yxatga TUSHMAYDI: "GPA'ngizni oshiring" degan tavsiya GPA umuman
// kiritilmagan talabaga ma'nosiz. Unday holat `pending` ro'yxatida alohida ko'rsatiladi.
const RECOMMENDATION_META = {
    academic: { max: 400, label: "GPA ko'rsatkichini 3.8+ ga yetkazing", dimension: 'Akademik' },
    social: { max: 300, label: 'Kelgusi oyda 2 ta tadbirda ishtirok eting', dimension: 'Faollik' },
    leadership: { max: 150, label: 'Klub koordinatori sifatida faoliyatni kuchaytiring', dimension: 'Liderlik' },
    reliability: { max: 150, label: 'Davomatni yuqori darajada ushlab turing', dimension: 'Ishonchlilik' }
};
const buildRecommendations = (scores) => {
    const rows = Object.entries(RECOMMENDATION_META)
        .filter(([key]) => scores[key] != null)
        .map(([key, meta]) => ({ key, ...meta, value: scores[key], gap: meta.max - scores[key] }));
    return rows
        .filter(r => r.gap > 20)
        .sort((a, b) => b.gap - a.gap)
        .slice(0, 3)
        .map(r => ({ text: r.label, detail: `${r.dimension} ko'rsatkichingiz +${Math.max(5, Math.round(r.gap * 0.4))} ballgacha oshadi` }));
};

// Ma'lumot yetishmagan o'lchov uchun "nima kiritilishi kerak" matni — talabaga ham, adminga ham
// bir xil ko'rsatiladi, chunki ikkisi ham bir xil kamchilikni ko'radi.
const MISSING_REASON = {
    academic: "GPA kiritilmagan (HEMIS yoki qo'lda)",
    social: 'Rasmiy indeksning birorta ijtimoiy mezoni hali hisoblanmagan',
    reliability: 'Davomat belgilanmagan'
};

// Ball ustiga bosilganda ochiladigan "bu raqam qayerdan chiqdi" tafsiloti.
//
// Maqsad - foydalanuvchi ballni QO'LDA QAYTA HISOBLAY olsin: qaysi jadvaldan olingani, oraliq
// qiymatlar va yakuniy amal ketma-ket ko'rsatiladi. Ilgari bu raqamlar tekshirib bo'lmaydigan
// edi (ular urug'lantirilgan tasodifiy sondan chiqardi), shuning uchun tafsilot ham yo'q edi.
//
// Qiymati `null` bo'lgan qadam - o'sha ma'lumot hali yo'q; UI uni "—" qilib chizadi.
export const buildTasDimensionDetail = (tas, key) => {
    const dim = TAS_DIMENSIONS.find(d => d.key === key);
    const s = tas.sources;
    const value = tas[dim.field];
    const steps = [];

    if (key === 'academic') {
        steps.push({ label: 'Manba', value: "Akademik yozuvlar (HEMIS yoki qo'lda kiritilgan GPA)" });
        steps.push({ label: "O'rtacha GPA", value: s.averageGpa == null ? null : `${s.averageGpa} / ${GPA_MAX}` });
        if (s.averageGpa != null) {
            steps.push({ label: 'Hisob', value: `(${s.averageGpa} ÷ ${GPA_MAX}) × ${dim.max} = ${value}` });
        }
    } else if (key === 'social') {
        steps.push({ label: 'Manba', value: 'Rasmiy ijtimoiy faollik indeksi (186-son buyruq)' });
        steps.push({ label: 'Indeksning yakuniy bali', value: `${s.socialIndexTotal} / ${s.socialIndexMax}` });
        steps.push({
            label: 'Hisobga olingan mezonlar',
            value: s.socialCriteriaTotal > 0
                ? `${s.socialCriteriaTotal} tadan ${s.socialCriteriaScored} tasi`
                : null
        });
        // Qaysi mezon qancha bergani ochiq yoziladi - "186 ball qayerdan chiqdi" savoliga
        // yagona to'liq javob shu.
        s.socialCriteriaNames.forEach(name => steps.push({ label: '·', value: name }));
        if (s.criteriaMax > 0) {
            steps.push({ label: 'Hisob', value: `(${s.criteriaEarned} ÷ ${s.criteriaMax}) × ${dim.max} = ${value}` });
        }
    } else if (key === 'leadership') {
        steps.push({ label: 'Manba', value: 'Klub lavozimlari (tayinlov va tasdiqlangan arizalar)' });
        steps.push({ label: 'Faol lavozimlar', value: `${s.activePositions} ta` });
        steps.push({ label: "Klub a'zoligi", value: `${s.clubCount} ta klub` });
        steps.push({
            label: 'Hisob',
            value: `${s.activePositions} × 50 = ${value}`
                + (s.activePositions * 50 > dim.max ? ` (${dim.max} bilan chegaralandi)` : '')
        });
    } else if (key === 'reliability') {
        steps.push({ label: 'Manba', value: 'Tadbir va musobaqalardagi davomat belgilari' });
        steps.push({ label: 'Belgilangan yozuvlar', value: s.attendanceMarked > 0 ? `${s.attendanceMarked} ta` : null });
        steps.push({ label: 'Shundan qatnashgan', value: s.attendanceMarked > 0 ? `${s.attendancePresent} ta` : null });
        steps.push({ label: 'Davomat foizi', value: s.attendanceRate == null ? null : `${s.attendanceRate}%` });
        if (s.attendanceRate != null) {
            steps.push({ label: 'Hisob', value: `(${s.attendanceRate} ÷ 100) × ${dim.max} = ${value}` });
        }
    }

    return {
        key, label: dim.label, info: dim.info, formula: dim.formula, max: dim.max, value, steps,
        missing: (tas.pending.find(p => p.key === key) || {}).missing || null
    };
};

export const computeStudentTAS = (db, studentId) => {
    // --- 1. Akademik: haqiqiy o'rtacha GPA. Yozuv yo'q bo'lsa null.
    const averageGpa = db.getStudentAverageGPA(studentId);
    const academic = averageGpa == null
        ? null
        : Math.round((Math.min(averageGpa, GPA_MAX) / GPA_MAX) * 400);

    // --- 2. Ijtimoiy faollik: RASMIY INDEKSning ijtimoiy mezonlari (yuqoridagi izohga qarang).
    //
    // Maxrajga faqat HISOBLANGAN mezonlar kiradi. Ma'lumoti yo'q mezonning maksimumini maxrajga
    // qo'shish talabani o'zi aybdor bo'lmagan bo'shliq uchun jazolagan bo'lardi — "hali kiritilmagan"
    // va "bajarmagan" bir xil emas.
    const socialIndex = computeSocialActivityIndex(db, studentId);
    const socialCriteria = socialIndex.criteria.filter(c => !TAS_SOCIAL_EXCLUDED_CRITERIA.includes(c.key));
    const scoredSocial = socialCriteria.filter(c => c.points != null);
    const criteriaEarned = scoredSocial.length > 0
        ? Math.round(scoredSocial.reduce((sum, c) => sum + c.points, 0) * 10) / 10
        : null;
    const criteriaMax = scoredSocial.reduce((sum, c) => sum + c.maxPoints, 0);
    const social = criteriaEarned == null || criteriaMax === 0
        ? null
        : Math.round((criteriaEarned / criteriaMax) * 300);

    const socialCategories = db.getSocialCriteriaCategories().filter(c => c.isActive && !c.isArchived);
    const approvedApps = db.getSocialApplications()
        .filter(a => a.studentId === studentId && a.status === SOCIAL_APPLICATION_STATUS.APPROVED)
        .sort((a, b) => new Date(b.reviewedAt || b.submittedAt) - new Date(a.reviewedAt || a.submittedAt));

    // --- 3. Liderlik: haqiqiy faol klub lavozimlari (bu o'lchov avvaldan ham real edi).
    // Lavozim yo'qligi — ma'lumot yetishmasligi emas, haqiqiy 0.
    const portfolio = db.getStudentPortfolio(studentId);
    const activePositions = portfolio.workloadIndex;
    const leadership = Math.min(150, activePositions * 50);

    // --- 4. Ishonchlilik: haqiqiy davomat belgilari. Bironta belgi yo'q bo'lsa null —
    // "hech qachon davomat belgilanmagan" bilan "hech qachon kelmagan" bir xil emas.
    const attendanceRows = db.getAttendanceForParticipant(studentId);
    const presentCount = attendanceRows.filter(a => a.status === 'present').length;
    const attendanceRate = attendanceRows.length === 0
        ? null
        : Math.round((presentCount / attendanceRows.length) * 1000) / 10;
    const reliability = attendanceRate == null ? null : Math.round((attendanceRate / 100) * 150);

    const scores = { academic, social, leadership, reliability };
    const measured = TAS_DIMENSIONS.filter(d => scores[d.key] != null);
    const total = measured.reduce((sum, d) => sum + scores[d.key], 0);
    const measuredMax = measured.reduce((sum, d) => sum + d.max, 0);
    const complete = measured.length === TAS_DIMENSIONS.length;

    // Daraja faqat TO'LIQ hisob uchun beriladi. 450 ball to'rt o'lchovdan to'rttasi hisoblanganda
    // "Silver", ikkitasi hisoblanganda esa umuman boshqa narsani anglatadi — yarim ma'lumot asosida
    // daraja qo'yish talabani noto'g'ri joyga qo'yadi.
    const tier = complete ? tierForTotal(total) : null;

    const activityHistory = approvedApps.slice(0, 5).map(a => ({
        date: a.reviewedAt || a.submittedAt, title: a.activityTitle, delta: a.pointsAwarded || 0
    }));
    const achievements = [...approvedApps]
        .sort((a, b) => (b.pointsAwarded || 0) - (a.pointsAwarded || 0))
        .slice(0, 3)
        .map(a => ({ title: a.activityTitle, subtitle: socialCategories.find(c => c.key === a.criteriaKey)?.name || '' }));

    return {
        total, tier, complete,
        academicScore: academic, socialFaollikScore: social, leadershipScore: leadership, reliabilityScore: reliability,
        measuredCount: measured.length, dimensionCount: TAS_DIMENSIONS.length, measuredMax,
        pending: TAS_DIMENSIONS
            .filter(d => scores[d.key] == null)
            .map(d => ({ key: d.key, label: d.label, missing: MISSING_REASON[d.key] })),
        // Har bir o'lchov nimadan chiqqani — kartochkada "manba" sifatida ko'rsatiladi, tekshirish
        // uchun. Raqamning o'zi yetarli emas: "365/400" qayerdan kelgani ko'rinib turishi kerak.
        sources: {
            averageGpa,
            criteriaEarned, criteriaMax,
            // Rasmiy indeksning o'zi (0-100) - ekranlarda TAS yonida ko'rsatiladi, shunda
            // foydalanuvchi ikkala raqamning bir manbadan ekanini ko'radi.
            socialIndexTotal: socialIndex.total,
            socialIndexMax: socialIndex.maxTotal,
            socialCriteriaScored: scoredSocial.length,
            socialCriteriaTotal: socialCriteria.length,
            socialCriteriaNames: scoredSocial.map(c => `${c.name}: ${c.points}/${c.maxPoints}`),
            activePositions,
            // Portfel baribir yuqorida o'qildi — a'zolik sonini shu yerdan uzatamiz, chaqiruvchi
            // ekranlar 550 ta talaba uchun getStudentPortfolio'ni ikkinchi marta chaqirmasin.
            clubCount: portfolio.memberships.length,
            attendanceRate, attendanceMarked: attendanceRows.length, attendancePresent: presentCount
        },
        // Tarixiy TAS suratlari (snapshot) tizimi hali yo'q, shuning uchun "o'tgan oyga nisbatan"
        // o'zgarishni ham, 6 oylik grafikni ham hisoblab bo'lmaydi. Ilgari bu yerda oxirgi baldan
        // orqaga qarab qurilgan sun'iy o'sish chizig'i turardi. Sun'iy chiziq o'rniga `null`:
        // grafikni ko'rsatadigan ekranlar buni "ma'lumot yo'q" holatiga aylantiradi.
        trend: null,
        delta: null,
        activityHistory, achievements,
        recommendations: buildRecommendations(scores)
    };
};
