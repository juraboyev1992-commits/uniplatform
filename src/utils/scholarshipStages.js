// Ikki bosqichli stipendiya tanlovi: fakultet reytingi va avtomatik o'tkazish.
//
// Bu fayl SOF hisob-kitob: hech narsa yozmaydi, db ga tegmaydi. Shu sababli
// admin monitoringi ham, avtomatik o'tkazish ham, dekanat paneli ham AYNAN bir
// xil raqamni ko'rsatadi — reyting ikki joyda ikki xil chiqib qolmaydi.

import {
    getEvaluationCriteria, evaluationMaxTotal, DEFAULT_MIXED_WEIGHT,
    DEFAULT_TIEBREAK, TIEBREAK_OPTIONS, DEFAULT_EVALUATION_CRITERIA,
    resolvePipeline, getStageType, stageQuota,
} from '../config/scholarships.js';

// Bosqichning o'z me'zonlari (zanjir modeli). Grant darajasidagi eski
// `evaluationCriteria` ga tushib qolish - eski grantlar buzilmasin.
export const stageCriteria = (grant, stage) =>
    (stage?.criteria?.length ? stage.criteria : getEvaluationCriteria(grant)) || DEFAULT_EVALUATION_CRITERIA;

export const stageMaxTotal = (grant, stage) => evaluationMaxTotal(stageCriteria(grant, stage));

// ---------------------------------------------------------------------------
// Bitta arizaning baholari xulosasi.
// `evaluations` — shu arizaga tegishli barcha baholovchi yozuvlari.
// Natija 0..100 shkalaga keltiriladi (me'zonlar yig'indisi 100 dan farq qilsa ham).
// ---------------------------------------------------------------------------
export const summarizeEvaluations = (grant, evaluations = [], stage = null) => {
    const criteria = stage ? stageCriteria(grant, stage) : getEvaluationCriteria(grant);
    const max = evaluationMaxTotal(criteria) || 100;

    if (evaluations.length === 0) {
        return { count: 0, average: null, normalized: null, max, criteria, perCriterion: {}, evaluators: [] };
    }

    const totals = evaluations.map(e => Number(e.total) || 0);
    const average = totals.reduce((s, t) => s + t, 0) / totals.length;

    // Me'zon kesimidagi o'rtacha — dekanat qayerda past ball qo'yganini ko'rish uchun.
    const perCriterion = {};
    criteria.forEach(c => {
        const vals = evaluations
            .map(e => Number(e.scores?.[c.key]))
            .filter(v => Number.isFinite(v));
        perCriterion[c.key] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    });

    return {
        count: evaluations.length,
        average: Math.round(average * 10) / 10,
        normalized: Math.round((average / max) * 100),
        max,
        criteria,
        perCriterion,
        evaluators: evaluations.map(e => ({
            id: e.evaluatorId, name: e.evaluatorName || e.evaluatorId,
            total: Number(e.total) || 0, at: e.updatedAt || e.createdAt, comment: e.comment || '',
        })),
    };
};

// ---------------------------------------------------------------------------
// Yakuniy saralash balli — grantning `advanceMethod` sozlamasiga qarab.
// Hamma variantda 0..100.
// ---------------------------------------------------------------------------
export const computeStageScore = (grant, { autoScore = 0, evaluationSummary }) => {
    const method = grant?.advanceMethod || 'evaluation';
    const evalScore = evaluationSummary?.normalized;

    if (method === 'auto') return { value: Math.round(autoScore), parts: { auto: autoScore } };

    if (method === 'evaluation') {
        return { value: evalScore === null || evalScore === undefined ? null : evalScore, parts: { evaluation: evalScore } };
    }

    // mixed — baho hali yo'q bo'lsa saralash balli ham noaniq, chunki keyin o'zgaradi.
    const w = grant?.mixedWeight || DEFAULT_MIXED_WEIGHT;
    if (evalScore === null || evalScore === undefined) {
        return { value: null, parts: { auto: autoScore, evaluation: null } };
    }
    const totalW = (Number(w.evaluation) || 0) + (Number(w.auto) || 0) || 1;
    const value = ((evalScore * (Number(w.evaluation) || 0)) + (autoScore * (Number(w.auto) || 0))) / totalW;
    return { value: Math.round(value), parts: { auto: autoScore, evaluation: evalScore, weight: w } };
};

// ---------------------------------------------------------------------------
// Teng ball to'planganda navbatma-navbat qo'llanadigan qoidalar.
// Qaytadi: manfiy -> a oldinda, musbat -> b oldinda.
// ---------------------------------------------------------------------------
const applyTiebreak = (a, b, keys) => {
    for (const key of keys) {
        if (!TIEBREAK_OPTIONS[key]) continue;
        if (key === 'submitted_at') {
            const av = String(a.submittedAt || '');
            const bv = String(b.submittedAt || '');
            if (av !== bv) return av < bv ? -1 : 1;   // oldinroq topshirgan oldinda
            continue;
        }
        if (key === 'evaluation_count') {
            const d = (b.evaluationSummary?.count || 0) - (a.evaluationSummary?.count || 0);
            if (d !== 0) return d;
            continue;
        }
        // auto_score / social_score / prize_place_count — kattasi oldinda
        const av = Number(a[key] ?? a.profile?.[key] ?? 0);
        const bv = Number(b[key] ?? b.profile?.[key] ?? 0);
        if (av !== bv) return bv - av;
    }
    return 0;
};

// ---------------------------------------------------------------------------
// Bitta fakultetning reytingi.
//
// `rows` — shu fakultetdagi, shu grantga, fakultet bosqichidagi arizalar
//   (har biri { id, studentId, autoScore, submittedAt, profile, evaluationSummary, status }).
//
// Qaytadi: reyting bo'yicha saralangan ro'yxat, har birida:
//   rank          — o'rin (1 dan boshlab)
//   stageScore    — saralash balli (null = hali baholanmagan)
//   wouldAdvance  — hozirgi holatda Top N ga kiradimi
//   ready         — kerakli miqdordagi baho tushganmi
//
// Baholanmaganlar HAR DOIM ro'yxat oxirida — ular tasodifan o'tib ketmasin.
// ---------------------------------------------------------------------------
export const rankFacultyApplications = (grant, rows) => {
    const quota = Number(grant?.facultyQuota) || 0;
    const minEvals = Math.max(1, Number(grant?.minEvaluations) || 1);
    const tiebreak = (grant?.tiebreak && grant.tiebreak.length) ? grant.tiebreak : DEFAULT_TIEBREAK;

    const scored = rows.map(r => {
        const stageScore = computeStageScore(grant, {
            autoScore: r.autoScore || 0,
            evaluationSummary: r.evaluationSummary,
        });
        const ready = (r.evaluationSummary?.count || 0) >= minEvals
            || (grant?.advanceMethod === 'auto');   // faqat platforma reytingi bo'lsa baho kutilmaydi
        return { ...r, stageScore: stageScore.value, stageScoreParts: stageScore.parts, ready };
    });

    scored.sort((a, b) => {
        // Baholanmaganlar oxirida
        const aNull = a.stageScore === null || a.stageScore === undefined;
        const bNull = b.stageScore === null || b.stageScore === undefined;
        if (aNull !== bNull) return aNull ? 1 : -1;
        if (!aNull && a.stageScore !== b.stageScore) return b.stageScore - a.stageScore;
        return applyTiebreak(a, b, tiebreak);
    });

    return scored.map((r, i) => ({
        ...r,
        rank: i + 1,
        wouldAdvance: r.ready && r.stageScore !== null && (quota === 0 || i < quota),
    }));
};

// ---------------------------------------------------------------------------
// Butun grant bo'yicha fakultetlar kesimi + o'tkazishga tayyorlik.
//
// `applications` — shu grantning BARCHA arizalari (ikkala bosqich ham).
// Har bir fakultet uchun:
//   ranked      — reyting
//   pending     — hali yetarli baho tushmagan arizalar soni
//   readyToAdvance — hammasi baholanganmi (shundagina avtomatik o'tkaziladi)
// ---------------------------------------------------------------------------
export const buildFacultyBreakdown = (grant, applications) => {
    const facultyStage = applications.filter(a => (a.stage || 'faculty') === 'faculty');
    const byFaculty = new Map();

    facultyStage.forEach(a => {
        const faculty = a.faculty || a.profile?.student?.faculty || "Noma'lum";
        if (!byFaculty.has(faculty)) byFaculty.set(faculty, []);
        byFaculty.get(faculty).push(a);
    });

    const minEvals = Math.max(1, Number(grant?.minEvaluations) || 1);
    const quota = Number(grant?.facultyQuota) || 0;

    return Array.from(byFaculty.entries()).map(([faculty, rows]) => {
        // Qaror chiqarilganlar (rad etilgan, qaytarib olingan) reytingda qatnashmaydi.
        const active = rows.filter(r => !['rejected', 'withdrawn', 'not_advanced'].includes(r.status));
        const ranked = rankFacultyApplications(grant, active);
        const pending = ranked.filter(r => !r.ready).length;

        return {
            faculty,
            total: rows.length,
            active: active.length,
            ranked,
            pending,
            quota,
            minEvaluations: minEvals,
            readyToAdvance: active.length > 0 && pending === 0,
            advancing: ranked.filter(r => r.wouldAdvance),
        };
    }).sort((a, b) => a.faculty.localeCompare(b.faculty));
};

// ---------------------------------------------------------------------------
// Kim kimni baholay oladi.
//
// Baholovchilar fakultet bo'yicha biriktiriladi (Sozlamalar -> Fakultet komissiyasi).
// Rol tekshirilmaydi ataylab: platformada hali "dekan" roli yo'q, shuning uchun
// biriktiruvning o'zi vakolat manbai. Rol tizimi qo'shilganda bu joy o'zgarmaydi.
// ---------------------------------------------------------------------------
// ===========================================================================
// ZANJIR MODELI (pipeline) — istalgan turdagi bosqich uchun universal saralash.
//
// Yuqoridagi fakultet funksiyalari saqlanib qoldi (eski ikki bosqichli grantlar
// ular orqali ishlaydi); quyidagilar esa har qanday zanjir uchun.
// ===========================================================================

// Bitta arizaning SHU bosqichdagi balli.
//   test      -> testScores[stageId] (tashqi manba)
//   scored    -> baholovchilar o'rtachasi, 0..100 ga keltirilgan
//   scoresiz  -> null (hujjat ko'rigi, yakun)
export const computeStageScoreFor = (grant, stage, row) => {
    const meta = getStageType(stage.type);
    if (!meta.scored) return null;

    if (stage.type === 'test') {
        const raw = row.testScores?.[stage.id];
        if (raw === undefined || raw === null || raw === '') return null;
        const max = Number(stage.maxScore) || 100;
        return Math.round((Number(raw) / max) * 100);
    }

    const summary = row.evaluationSummary;
    if (!summary || summary.count === 0) return null;
    return summary.normalized;
};

// Bosqich uchun nomzod "tayyor" (baholangan) bo'ldimi.
export const isRowReady = (grant, stage, row) => {
    const meta = getStageType(stage.type);
    if (!meta.scored) return true;                       // ball talab qilmaydigan bosqich
    if (stage.type === 'test') {
        const raw = row.testScores?.[stage.id];
        return raw !== undefined && raw !== null && raw !== '';
    }
    const min = Math.max(1, Number(stage.minEvaluations) || 1);
    return (row.evaluationSummary?.count || 0) >= min;
};

// Bitta guruh (umumiy yoki bitta fakultet) ichidagi reyting.
export const rankStageGroup = (grant, stage, rows) => {
    const quota = stageQuota(stage);
    const tiebreak = (grant?.tiebreak && grant.tiebreak.length) ? grant.tiebreak : DEFAULT_TIEBREAK;
    const passScore = Number(stage.passScore) || 0;

    const scored = rows.map(r => ({
        ...r,
        stageScore: computeStageScoreFor(grant, stage, r),
        ready: isRowReady(grant, stage, r),
    }));

    scored.sort((a, b) => {
        const aNull = a.stageScore === null || a.stageScore === undefined;
        const bNull = b.stageScore === null || b.stageScore === undefined;
        if (aNull !== bNull) return aNull ? 1 : -1;
        if (!aNull && a.stageScore !== b.stageScore) return b.stageScore - a.stageScore;
        return applyTiebreak(a, b, tiebreak);
    });

    return scored.map((r, i) => {
        // Ball qo'yilmaydigan bosqichda (hujjat ko'rigi) "o'tish" reyting bilan emas,
        // mas'ulning qaroriga ko'ra bo'ladi - shuning uchun kvota qo'llanmaydi.
        const meta = getStageType(stage.type);
        const meetsPass = !meta.scored || r.stageScore === null || r.stageScore >= passScore;
        return {
            ...r,
            rank: i + 1,
            wouldAdvance: meta.scored
                ? (r.ready && r.stageScore !== null && meetsPass && (quota === 0 || i < quota))
                : r.status === 'passed',
            belowPassScore: meta.scored && r.stageScore !== null && !meetsPass,
        };
    });
};

// Bosqichning to'liq manzarasi.
//
// `perFaculty` turdagi bosqich uchun guruhlar = fakultetlar, aks holda bitta
// "Umumiy" guruh. Bir xil tuzilma qaytadi, shuning uchun interfeys ikkala holatni
// bitta kod bilan chizadi.
export const buildStageBreakdown = (grant, stage, stageIndex, applications) => {
    const meta = getStageType(stage.type);
    const atThisStage = applications.filter(a => (a.stageIndex ?? 0) === stageIndex);
    const active = atThisStage.filter(a => !['rejected', 'withdrawn', 'not_advanced'].includes(a.status));

    const groups = new Map();
    if (meta.perFaculty) {
        active.forEach(a => {
            const key = a.faculty || "Noma'lum";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(a);
        });
    } else if (active.length > 0) {
        groups.set('Umumiy', active);
    }

    const built = Array.from(groups.entries()).map(([name, rows]) => {
        const ranked = rankStageGroup(grant, stage, rows);
        const pending = ranked.filter(r => !r.ready).length;
        return {
            group: name,
            total: rows.length,
            ranked,
            pending,
            quota: stageQuota(stage),
            readyToAdvance: rows.length > 0 && pending === 0,
            advancing: ranked.filter(r => r.wouldAdvance),
        };
    }).sort((a, b) => a.group.localeCompare(b.group));

    return {
        stage, stageIndex, meta,
        groups: built,
        totalActive: active.length,
        totalPending: built.reduce((s, g) => s + g.pending, 0),
        totalAdvancing: built.reduce((s, g) => s + g.advancing.length, 0),
        readyToAdvance: built.length > 0 && built.every(g => g.readyToAdvance),
    };
};

// Butun zanjir bo'yicha manzara - admin monitoringining asosi.
export const buildPipelineOverview = (grant, applications) => {
    const pipeline = resolvePipeline(grant);
    return pipeline.map((stage, i) => buildStageBreakdown(grant, stage, i, applications));
};

export const getEvaluatorFaculties = (settings, username) =>
    (settings?.facultyEvaluators || [])
        .filter(e => e.username === username)
        .map(e => e.faculty);

export const canEvaluate = (settings, username, faculty) =>
    (settings?.facultyEvaluators || [])
        .some(e => e.username === username && e.faculty === faculty);

export const getFacultyEvaluators = (settings, faculty) =>
    (settings?.facultyEvaluators || []).filter(e => e.faculty === faculty);
