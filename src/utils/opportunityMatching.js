// Imkoniyatlarni moslashtirish mexanizmi.
//
// UCH QOIDA:
//
// 1. YANGI ENGINE YOZILMAYDI. Talab bo'yicha moslik `scholarshipEligibility.js`
//    dagi mavjud me'zonlar katalogi va profil yig'uvchisiga tayanadi.
//
// 2. DUBLIKAT YO'Q. Grantlar `scholarship_grants` da, musobaqalar `competitions`
//    da qoladi. Bu fayl ularni FAQAT O'QIYDI va bitta shaklga keltiradi.
//
// 3. ESHIK SHARTI FOIZGA KIRMAYDI. Talaba ariza bera olmasa - foiz umuman
//    hisoblanmaydi. "4 tadan 3 tasi bajarilgan = 75%" degani, agar bajarilmagani
//    kurs sharti bo'lsa, yolg'on raqam bo'lardi.

import {
    OPPORTUNITY_KINDS, getKind, defaultConstraints, getCriterionTiming,
    nextPeriodicUpdate, ACHIEVABILITY, MATCH_STATE, URGENT_DAYS,
} from '../config/opportunities.js';
import { evaluateEligibility } from './scholarshipEligibility.js';
import { getCriterion, parseAmount } from '../config/scholarships.js';

// ===========================================================================
// ADAPTER — turli manbalarni bitta shaklga keltirish
// ===========================================================================

// Grant/stipendiya. `scholarship_grants` jadvalidan.
const fromGrant = (grant) => ({
    id: `grant:${grant.id}`,
    sourceId: grant.id,
    sourceTable: 'scholarship_grants',
    kind: grant.opportunityKind || (grant.scope === 'state' ? 'scholarship' : 'grant'),
    title: grant.title,
    description: grant.description || '',
    group: grant.group || null,
    amount: grant.amount,
    deadline: grant.deadline || null,
    opensAt: grant.opensAt || null,
    status: grant.status,
    requirements: grant.requirements || [],
    weights: grant.weights || null,
    hardFilters: grant.hardFilters || {},
    constraints: { ...defaultConstraints(), ...(grant.constraints || {}) },
    documents: grant.requiredDocs || [],
    link: grant.link || null,
    raw: grant,
});

// Musobaqa/olimpiada. `competitions` jadvalidan.
// Bu yerda "talab" yo'q - faqat cheklovlar (restrictions), ular eshik sharti.
//
// DIQQAT: musobaqada saqlanadigan `status` maydoni YO'Q - u sanadan hisoblanadi
// (CompetitionWorkspacePage.jsx dagi classifyCompetition bilan bir xil qoida).
const fromCompetition = (comp, now) => {
    const started = comp.startDate
        ? new Date(`${comp.startDate}T${comp.startTime || '00:00'}:00`) <= now
        : false;
    const completed = (comp.currentRound || 1) > (comp.roundsCount || 1);

    return {
        id: `comp:${comp.id}`,
        sourceId: comp.id,
        sourceTable: 'competitions',
        kind: comp.opportunityKind || 'competition',
        title: comp.name,
        description: comp.description || '',
        group: null,
        amount: null,
        // Musobaqada "muddat" - ro'yxatdan o'tish tugashi. Belgilanmagan bo'lsa
        // musobaqaning o'z boshlanish sanasi.
        deadline: String(comp.registrationClosesAt || comp.startDate || '').slice(0, 10) || null,
        opensAt: String(comp.registrationOpensAt || '').slice(0, 10) || null,
        status: completed ? 'closed' : started ? 'ongoing' : 'active',
        requirements: [],
        weights: null,
        hardFilters: {
            byFaculty: comp.restrictions?.byFaculty || [],
            byCourse: comp.restrictions?.byCourse || [],
            byGender: comp.restrictions?.byGender || '',
            byProfessionalism: comp.restrictions?.byProfessionalism || '',
        },
        constraints: defaultConstraints(),
        documents: [],
        link: null,
        raw: comp,
    };
};

// Barcha manbalarni bitta ro'yxatga. Klublar hozircha kirmaydi - ular
// qiziqish asosidagi boshqa formula bilan hisoblanadi (keyingi bosqich).
export const collectOpportunities = (db, { includeCompetitions = true, now = new Date() } = {}) => {
    const list = (db.getScholarshipGrants() || [])
        .filter(g => ['active', 'closed'].includes(g.status))
        .map(fromGrant);

    if (includeCompetitions) {
        list.push(
            ...(db.getCompetitions() || [])
                .map(c => fromCompetition(c, now))
                .filter(o => o.status !== 'closed')
        );
    }

    return list;
};

// ===========================================================================
// TALABANING TARIXI — cheklovlarni tekshirish uchun
//
// Yangi jadval kerak emas: kim nimani yutgani allaqachon saqlanadi.
// ===========================================================================
export const buildStudentHistory = (db, studentId) => {
    const applications = (db.getScholarshipApplications() || [])
        .filter(a => a.studentId === studentId);

    const targets = (db.getTalentTargets?.(studentId) || []);

    // Yutilgan grantlar - ariza tasdiqlangan yoki talent maqsadi "won".
    const wonGrants = new Map();   // grantId -> { year, source }
    applications.filter(a => a.status === 'approved').forEach(a => {
        wonGrants.set(a.grantId, {
            year: Number(a.cycleYear) || new Date(a.reviewedAt || a.submittedAt || Date.now()).getFullYear(),
            at: a.reviewedAt || a.submittedAt,
        });
    });
    targets.filter(t => t.status === 'won' && t.grantId).forEach(t => {
        if (!wonGrants.has(t.grantId)) {
            wonGrants.set(t.grantId, { year: new Date(t.updatedAt || Date.now()).getFullYear(), at: t.updatedAt });
        }
    });

    // Natijasi hali ma'lum bo'lmagan arizalar - bloklamaydi, ogohlantiradi.
    const pendingGrants = new Set(
        applications
            .filter(a => ['submitted', 'doc_check', 'evaluation', 'committee', 'draft'].includes(a.status))
            .map(a => a.grantId)
    );

    const wonByYear = new Map();
    wonGrants.forEach((info) => {
        wonByYear.set(info.year, (wonByYear.get(info.year) || 0) + 1);
    });

    return { wonGrants, pendingGrants, wonByYear, applications };
};

// ===========================================================================
// ESHIK SHARTLARI
// ===========================================================================

// A. Talabaning o'ziga tegishli — kurs, fakultet, jins, muddat.
const checkStudentFilters = (opp, student, now) => {
    const blocks = [];
    const f = opp.hardFilters || {};

    if (f.byFaculty?.length && student?.faculty && !f.byFaculty.includes(student.faculty)) {
        blocks.push({ type: 'faculty', message: `Faqat ${f.byFaculty.join(', ')} fakulteti uchun` });
    }
    if (f.byCourse?.length && student?.course && !f.byCourse.map(Number).includes(Number(student.course))) {
        blocks.push({ type: 'course', message: `Faqat ${f.byCourse.join(', ')}-kurs uchun` });
    }
    if (f.byGender && student?.gender && f.byGender !== student.gender) {
        blocks.push({ type: 'gender', message: 'Jins bo\'yicha cheklov' });
    }
    if (f.byProfessionalism && student?.professionalism && f.byProfessionalism !== student.professionalism) {
        blocks.push({ type: 'professionalism', message: 'Tayyorgarlik darajasi bo\'yicha cheklov' });
    }

    if (opp.deadline) {
        const end = new Date(`${opp.deadline}T23:59:59`);
        if (end < now) blocks.push({ type: 'deadline', message: `Qabul muddati tugagan (${opp.deadline})` });
    }
    if (opp.opensAt) {
        const start = new Date(`${opp.opensAt}T00:00:00`);
        if (start > now) blocks.push({ type: 'not_open', message: `Qabul ${opp.opensAt} dan boshlanadi` });
    }
    if (opp.status && !['active', 'ongoing'].includes(opp.status)) {
        blocks.push({ type: 'closed', message: 'Hozir ariza qabul qilinmayapti' });
    }

    return blocks;
};

// Zid kelish IKKI TOMONLAMA: A da B yozilgan bo'lsa, B ni tekshirganda ham
// A hisobga olinadi. Admin bir marta kiritadi, tizim ikkalasida ham qo'llaydi.
const findSymmetricConflicts = (opp, allOpportunities) => {
    const direct = new Set(opp.constraints.conflictsWith || []);
    const groups = new Set(opp.constraints.conflictsWithGroups || []);

    allOpportunities.forEach(other => {
        if (other.sourceId === opp.sourceId) return;
        const c = other.constraints || {};
        // Teskari yo'nalish: boshqasi bizni istisno qilgan bo'lsa
        if ((c.conflictsWith || []).includes(opp.sourceId)) direct.add(other.sourceId);
        if (opp.group && (c.conflictsWithGroups || []).includes(opp.group)) direct.add(other.sourceId);
    });

    // Guruh bo'yicha yozilganlarni aniq id larga yoyish
    if (groups.size > 0) {
        allOpportunities.forEach(other => {
            if (other.sourceId !== opp.sourceId && other.group && groups.has(other.group)) {
                direct.add(other.sourceId);
            }
        });
    }

    return direct;
};

// B. Imkoniyatlar o'rtasidagi cheklovlar.
const checkCrossConstraints = (opp, history, allOpportunities, titleOf, now) => {
    const blocks = [];
    const warnings = [];
    const c = opp.constraints || {};

    // 1. Zid keladi
    const conflicts = findSymmetricConflicts(opp, allOpportunities);
    conflicts.forEach(conflictId => {
        if (history.wonGrants.has(conflictId)) {
            blocks.push({
                type: 'conflict',
                message: `Siz "${titleOf(conflictId)}" sohibisiz — bu ikkalasi zid keladi`,
                relatedId: conflictId,
            });
        } else if (history.pendingGrants.has(conflictId)) {
            // Natija hali yo'q - BLOKLAMAYDI. Aks holda birinchisini yutmagan
            // talaba ikkinchisining muddati o'tib ketib, ikkalasidan quruq qoladi.
            warnings.push({
                type: 'pending_conflict',
                message: `Siz "${titleOf(conflictId)}" ga ariza bergansiz. `
                    + 'Ikkalasini ham yutsangiz, bittasini tanlashingiz kerak bo\'ladi.',
            });
        }
    });

    // 2. Bir vaqtda faqat bitta (guruh ichida)
    if (c.exclusiveGroup) {
        const heldInGroup = allOpportunities.find(o =>
            o.sourceId !== opp.sourceId
            && o.group === c.exclusiveGroup
            && history.wonGrants.has(o.sourceId));
        if (heldInGroup) {
            blocks.push({
                type: 'exclusive_group',
                message: `Siz "${heldInGroup.title}" sohibisiz — bu guruhdan bir vaqtda faqat bittasi olinadi`,
                relatedId: heldInGroup.sourceId,
            });
        }
    }

    // 3. Bir marta
    if (c.onceOnly && history.wonGrants.has(opp.sourceId)) {
        blocks.push({ type: 'once_only', message: 'Siz buni allaqachon olgansiz — qayta berilmaydi' });
    }

    // 4. Kutish muddati
    if (c.cooldownYears > 0) {
        const won = history.wonGrants.get(opp.sourceId);
        if (won?.at) {
            const until = new Date(won.at);
            until.setFullYear(until.getFullYear() + Number(c.cooldownYears));
            if (until > now) {
                blocks.push({
                    type: 'cooldown',
                    message: `Qayta ariza berish ${c.cooldownYears} yildan keyin mumkin`,
                    until: until.toISOString().slice(0, 10),
                });
            }
        }
    }

    // 5. Oldindan talab (ochuvchi shart)
    if ((c.requiresPrior || []).length > 0) {
        const has = c.requiresPrior.some(id => history.wonGrants.has(id));
        if (!has) {
            blocks.push({
                type: 'requires_prior',
                message: `Talab: ${c.requiresPrior.map(titleOf).join(' yoki ')}. Sizda hozir yo'q`,
            });
        }
    }

    // 6. Yillik chegara
    if (c.yearlyLimit > 0) {
        const thisYear = now.getFullYear();
        const count = history.wonByYear.get(thisYear) || 0;
        if (count >= c.yearlyLimit) {
            blocks.push({
                type: 'yearly_limit',
                message: `Bu yil allaqachon ${count} ta imkoniyat olgansiz (chegara: ${c.yearlyLimit})`,
            });
        }
    }

    return { blocks, warnings };
};

// ===========================================================================
// YAQINLIK — masofa bilan
//
// "Bor/yo'q" emas, nisbat: yarim yo'lni bosgan talaba boshlamaganidan farq
// qilishi kerak.
// ===========================================================================
export const computeFit = (opp, eligibilityProfile, declared = {}) => {
    if (!opp.requirements?.length) {
        // Talab belgilanmagan (musobaqa, cheklovsiz grant) - foiz o'lchab
        // bo'lmaydi. 100% ko'rsatish yolg'on bo'lardi.
        return { fit: null, checks: [], gaps: [], met: [] };
    }

    const evaluation = evaluateEligibility(opp, eligibilityProfile, declared);
    const weights = opp.weights || {};

    let weightedSum = 0;
    let weightTotal = 0;

    const checks = evaluation.checks.map(c => {
        const target = Number(c.target);
        const actual = Number(c.actual);
        let progress;

        if (c.op === 'exists') {
            progress = c.ok ? 1 : 0;
        } else if (!Number.isFinite(target) || target === 0) {
            progress = c.ok ? 1 : 0;
        } else if (!Number.isFinite(actual)) {
            progress = 0;
        } else if (c.op === 'lte') {
            progress = actual <= target ? 1 : Math.max(0, Math.min(1, target / actual));
        } else {
            progress = Math.max(0, Math.min(1, actual / target));
        }

        const weight = Number(weights[c.key]) || 1;
        weightedSum += progress * weight;
        weightTotal += weight;

        return { ...c, progress, weight, remaining: c.ok ? 0 : Math.max(0, target - (actual || 0)) };
    });

    return {
        fit: weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 100) : null,
        checks,
        met: checks.filter(c => c.ok),
        gaps: checks.filter(c => !c.ok),
        eligibility: evaluation,
    };
};

// ===========================================================================
// ERISHISH QIYINLIGI
//
// Uch xil me'zon uch xil ishlaydi:
//   periodic   - kalendardan aniq hisoblanadi, taxmin emas
//   continuous - muddat kerak emas, faqat masofa
//   project    - taxminiy qiymat; yo'q bo'lsa BAHO BERILMAYDI
// ===========================================================================
export const assessAchievability = (gap, deadline, now = new Date()) => {
    if (!deadline) return { state: 'unknown', reason: null };

    const end = new Date(`${deadline}T23:59:59`);
    const daysLeft = Math.ceil((end - now) / 86400000);
    if (daysLeft < 0) return { state: 'unreachable', reason: 'Muddat tugagan' };

    const meta = getCriterion(gap.key);
    const timing = getCriterionTiming(gap.key);

    if (timing.timing === 'periodic') {
        // Kalendar fakti, taxmin emas.
        const next = nextPeriodicUpdate(timing.period, now);
        if (!next) return { state: 'unknown', reason: null };
        const label = timing.period === 'semester' ? 'semestr yakuni' : "o'quv yili boshlanishi";
        if (next > end) {
            return {
                state: 'unreachable',
                reason: `${meta?.label || gap.key} keyingi marta ${next.toISOString().slice(0, 10)} da yangilanadi `
                    + `(${label}) — bu tanlov muddatidan keyin`,
                nextUpdate: next.toISOString().slice(0, 10),
            };
        }
        return {
            state: 'reachable',
            reason: `${next.toISOString().slice(0, 10)} da yangilanadi (${label})`,
            nextUpdate: next.toISOString().slice(0, 10),
        };
    }

    if (timing.timing === 'continuous') {
        return { state: 'reachable', reason: null };
    }

    // project — taxminiy muddat. Yo'q bo'lsa jim turamiz.
    const months = timing.estimateMonths;
    if (!months) return { state: 'unknown', reason: null };

    const needDays = months * 30 * Math.max(1, gap.remaining || 1);
    if (needDays > daysLeft * 1.5) return { state: 'unreachable', reason: `Taxminan ${Math.round(needDays / 30)} oy kerak` };
    if (needDays > daysLeft) return { state: 'tight', reason: `Taxminan ${Math.round(needDays / 30)} oy kerak` };
    return { state: 'reachable', reason: null };
};

// ===========================================================================
// BITTA IMKONIYATNI BAHOLASH
// ===========================================================================
export const evaluateOpportunity = (opp, ctx) => {
    const { student, eligibilityProfile, declared, history, allOpportunities, titleOf, now } = ctx;
    const at = now || new Date();

    const studentBlocks = checkStudentFilters(opp, student, at);
    const cross = checkCrossConstraints(opp, history, allOpportunities, titleOf, at);
    const blocks = [...studentBlocks, ...cross.blocks];

    const alreadyWon = history.wonGrants.has(opp.sourceId);
    const alreadyApplied = history.pendingGrants.has(opp.sourceId);

    const daysLeft = opp.deadline
        ? Math.ceil((new Date(`${opp.deadline}T23:59:59`) - at) / 86400000)
        : null;

    // ESHIK O'TILMAGAN — foiz umuman hisoblanmaydi.
    if (blocks.length > 0) {
        return {
            opportunity: opp,
            state: MATCH_STATE.blocked.id,
            fit: null,
            blocks,
            warnings: cross.warnings,
            checks: [], gaps: [], met: [],
            daysLeft,
            // Cheklov doimiy emas - qachon bo'shashi ko'rsatiladi
            availableFrom: blocks.find(b => b.until)?.until || null,
        };
    }

    const { fit, checks, gaps, met } = computeFit(opp, eligibilityProfile, declared);
    const gapsWithAchievability = gaps.map(g => ({
        ...g, achievability: assessAchievability(g, opp.deadline, at),
    }));

    return {
        opportunity: opp,
        state: alreadyWon ? MATCH_STATE.won.id
            : alreadyApplied ? MATCH_STATE.applied.id
                : MATCH_STATE.eligible.id,
        fit,
        blocks: [],
        warnings: cross.warnings,
        checks, met,
        gaps: gapsWithAchievability,
        daysLeft,
        urgent: daysLeft !== null && daysLeft >= 0 && daysLeft <= URGENT_DAYS,
        availableFrom: null,
    };
};

// ===========================================================================
// USTUVORLIK — ro'yxat tartibi
//
// Faqat foiz bo'yicha saralash noto'g'ri: muddati 3 kun qolgan 88% lik,
// olti oy vaqti bor 95% likdan muhimroq. Talabaga FOIZ ko'rsatiladi,
// ustuvorlik ichki raqam bo'lib qoladi.
// ===========================================================================
const priorityScore = (r) => {
    if (r.fit === null) return -1;

    const fit = r.fit / 100;

    // Shoshilinchlik: muddat yaqinlashgani sari o'sadi, lekin o'tib ketgan
    // yoki juda uzoq bo'lsa ta'siri kamayadi.
    let urgency = 1;
    if (r.daysLeft !== null) {
        if (r.daysLeft < 0) urgency = 0;
        else if (r.daysLeft <= 7) urgency = 1.6;
        else if (r.daysLeft <= 14) urgency = 1.35;
        else if (r.daysLeft <= 30) urgency = 1.15;
        else if (r.daysLeft > 180) urgency = 0.85;
    }

    // Erishish: bitta ham "ulgurmaysiz" bo'lsa ustuvorlik keskin tushadi.
    const worst = r.gaps.reduce((acc, g) => {
        const s = g.achievability?.state;
        if (s === 'unreachable') return 'unreachable';
        if (s === 'tight' && acc !== 'unreachable') return 'tight';
        return acc;
    }, 'reachable');
    const achieve = worst === 'unreachable' ? 0.35 : worst === 'tight' ? 0.75 : 1;

    return fit * urgency * achieve;
};

// ===========================================================================
// TALABA UCHUN TO'LIQ RO'YXAT
// ===========================================================================
export const matchOpportunitiesForStudent = (db, studentId, {
    eligibilityProfile, declared = {}, includeCompetitions = true, now = new Date(),
} = {}) => {
    const all = collectOpportunities(db, { includeCompetitions, now });
    const student = (db.getMockStudents() || []).find(s => s.id === studentId) || null;
    const history = buildStudentHistory(db, studentId);

    const titleMap = new Map(all.map(o => [o.sourceId, o.title]));
    const titleOf = (id) => titleMap.get(id) || id;

    const ctx = { student, eligibilityProfile, declared, history, allOpportunities: all, titleOf, now };
    const results = all.map(opp => evaluateOpportunity(opp, ctx));

    const eligible = results
        .filter(r => r.state !== MATCH_STATE.blocked.id)
        .sort((a, b) => priorityScore(b) - priorityScore(a));

    const blocked = results
        .filter(r => r.state === MATCH_STATE.blocked.id)
        .sort((a, b) => (a.opportunity.title || '').localeCompare(b.opportunity.title || ''));

    return { eligible, blocked, all: results, history };
};

// ===========================================================================
// KESHNI QAYTA HISOBLASH
//
// pg_cron muddat eslatmalarini keshdan o'qiydi, lekin moslik mantiqi shu
// yerda. Shuning uchun kesh JS tomonidan to'ldiriladi:
//   - grant yaratilganda yoki o'zgartirilganda (yangi imkoniyat paydo bo'ldi)
//   - admin qo'lda "qayta hisoblash" bosganda
//
// 550 talaba × N imkoniyat - bu og'ir amal. Shuning uchun bo'laklab bajariladi
// va jarayon haqida xabar beriladi.
// ===========================================================================
export const recomputeMatchesForStudent = async (db, studentId, {
    eligibilityProfile, declared = {}, notify = true,
} = {}) => {
    const previousIds = notify
        ? await db.getCachedOpportunityIds(studentId)
        : new Set();

    const matched = matchOpportunitiesForStudent(db, studentId, { eligibilityProfile, declared });
    await db.saveOpportunityMatches(studentId, matched);

    let notified = 0;
    if (notify && previousIds.size > 0) {
        // Birinchi hisoblashda xabar yuborilmaydi: kesh bo'sh bo'lgani uchun
        // HAMMA moslik "yangi" ko'rinardi va talaba o'nlab xabar olardi.
        const res = await db.notifyNewOpportunityMatches(studentId, matched, previousIds);
        notified = res.sent;
    }

    return { studentId, matches: matched.eligible.length, notified };
};

// Barcha talabalar uchun. `onProgress` - jarayon ko'rsatkichi uchun.
export const recomputeAllMatches = async (db, {
    buildProfile, getDeclared, notify = true, onProgress = null, batchSize = 25,
} = {}) => {
    const students = db.getMockStudents() || [];
    let processed = 0;
    let totalMatches = 0;
    let totalNotified = 0;
    const errors = [];

    for (let i = 0; i < students.length; i += batchSize) {
        const batch = students.slice(i, i + batchSize);
        for (const s of batch) {
            try {
                const res = await recomputeMatchesForStudent(db, s.id, {
                    eligibilityProfile: buildProfile(s.id),
                    declared: getDeclared ? getDeclared(s.id) : {},
                    notify,
                });
                totalMatches += res.matches;
                totalNotified += res.notified;
            } catch (e) {
                errors.push({ studentId: s.id, message: e.message });
            }
            processed++;
        }
        if (onProgress) onProgress({ processed, total: students.length, totalMatches });
    }

    return { processed, totalMatches, totalNotified, errors };
};

// ===========================================================================
// UMUMIY TAVSIYA — "eng foydali qadamlar"
//
// Barcha imkoniyatlarning yetishmayotganlari bir joyga yig'iladi va qaysi
// bitta harakat eng ko'p eshikni ochishi hisoblanadi. Talaba 12 ta ro'yxat
// o'rniga 3 ta harakatni ko'radi.
// ===========================================================================
export const suggestNextSteps = (matched, limit = 3) => {
    const byKey = new Map();

    matched.eligible.forEach(r => {
        if (r.fit === null) return;
        r.gaps.forEach(g => {
            if (g.achievability?.state === 'unreachable') return;
            if (!byKey.has(g.key)) {
                byKey.set(g.key, {
                    key: g.key,
                    label: g.label,
                    unit: g.unit,
                    maxRemaining: 0,
                    opportunities: [],
                    fitGainSum: 0,
                });
            }
            const entry = byKey.get(g.key);
            entry.maxRemaining = Math.max(entry.maxRemaining, g.remaining || 1);
            entry.opportunities.push(r.opportunity.title);
            // Shu me'zon bajarilsa foiz qanchaga oshadi
            const weightShare = g.weight / (r.checks.reduce((s, c) => s + c.weight, 0) || 1);
            entry.fitGainSum += Math.round(weightShare * (1 - g.progress) * 100);
        });
    });

    return Array.from(byKey.values())
        .map(e => ({
            ...e,
            unlocks: e.opportunities.length,
            avgGain: e.opportunities.length ? Math.round(e.fitGainSum / e.opportunities.length) : 0,
        }))
        .sort((a, b) => b.unlocks - a.unlocks || b.avgGain - a.avgGain)
        .slice(0, limit);
};
