// Stipendiya moslik va avtomatik ballash mexanizmi.
//
// Muhim tamoyil: bu yerda HECH QANDAY soxta ma'lumot yaratilmaydi. Har bir
// avtomatik me'zon platformaning o'z real reyestridan o'qiladi:
//   - ijtimoiy faollik   -> socialScoreTransactions (TAS/Reytinglar bilan bir xil manba)
//   - diplom/sertifikat  -> documents (taqdirlash reyestri, QR bilan tekshiriladigan)
//   - ishtirok           -> registrations + activityAttendance
//   - klub a'zoligi      -> memberships
// Manba yo'q me'zonlar (GPA, IELTS) `manual` deb belgilangan — ular talabaning
// o'z so'zi va interfeysda shundayligi ochiq ko'rsatiladi.

import {
    CRITERIA_CATALOG, getCriterion, DEFAULT_SCORING_WEIGHTS, SCORING_CAPS, parseAmount,
} from '../config/scholarships.js';
import { getDocumentType } from '../config/documents.js';
import { getStudentAttendanceParticipationSummary } from './rankingsAnalytics.js';

// ---------------------------------------------------------------------------
// Talabaning real profili — bitta o'qishda barcha avtomatik me'zonlar.
// `db` — services/db.js dagi obyekt (parametr sifatida beriladi, aylanma
// import bo'lmasligi uchun).
// ---------------------------------------------------------------------------
export const buildStudentEligibilityProfile = (db, studentId, opts = {}) => {
    const year = opts.year || new Date().getFullYear();

    const docs = (db.getStudentDocuments(studentId) || []).filter(d => d.status === 'issued');
    const groupOf = (d) => getDocumentType(d.documentType)?.group || 'other';

    const diplomas = docs.filter(d => groupOf(d) === 'diploma');
    const participation = getStudentAttendanceParticipationSummary(db, studentId, year);
    const memberships = db.getUserMemberships(studentId) || [];
    const student = (db.getMockStudents() || []).find(s => s.id === studentId) || null;

    return {
        studentId,
        year,
        student,
        social_score: db.getStudentSocialScoreTotal(studentId) || 0,
        diploma_count: diplomas.length,
        first_place_count: diplomas.filter(d => Number(d.place) === 1).length,
        prize_place_count: diplomas.filter(d => [1, 2, 3].includes(Number(d.place))).length,
        certificate_count: docs.filter(d => groupOf(d) === 'certificate').length,
        thanks_count: docs.filter(d => groupOf(d) === 'thanks').length,
        activity_count: participation.totalCount,
        club_count: memberships.length,
        course: student?.course || 0,
        // Hujjatlar ro'yxati — arizaga ilova qilish uchun (qayta yuklash shart emas).
        documents: docs,
        participation,
    };
};

// ---------------------------------------------------------------------------
// Bitta me'zonni tekshirish.
//
// Qaytadi: { key, label, source, op, target, actual, ok, unknown }
//   ok === true   — mos
//   ok === false  — mos emas
//   unknown       — qiymat noma'lum (manual me'zon, talaba hali kiritmagan)
// ---------------------------------------------------------------------------
const compare = (op, actual, target) => {
    if (op === 'exists') return actual !== null && actual !== undefined && String(actual).trim() !== '';
    const a = Number(actual);
    const t = Number(target);
    if (!Number.isFinite(a) || !Number.isFinite(t)) {
        // Matnli me'zon raqamga aylanmasa — teng-tenglik bo'yicha solishtiramiz.
        return String(actual ?? '').trim().toLowerCase() === String(target ?? '').trim().toLowerCase();
    }
    if (op === 'lte') return a <= t;
    if (op === 'eq') return a === t;
    return a >= t; // gte — standart
};

export const evaluateCriterion = (requirement, profile, declared = {}) => {
    const meta = getCriterion(requirement.key);
    const label = requirement.label || meta?.label || requirement.key;
    const source = meta?.source || 'manual';
    const op = requirement.op || meta?.op || 'gte';
    const target = requirement.value ?? requirement.target ?? meta?.defaultTarget ?? '';

    const actual = source === 'auto'
        ? profile?.[requirement.key]
        : declared?.[requirement.key];

    const unknown = actual === undefined || actual === null || String(actual).trim() === '';

    return {
        key: requirement.key,
        label,
        source,
        op,
        unit: meta?.unit || '',
        hint: meta?.hint || '',
        target,
        actual: unknown ? null : actual,
        unknown,
        ok: unknown ? false : compare(op, actual, target),
    };
};

// ---------------------------------------------------------------------------
// Grantga to'liq moslik.
//
// `eligible` — barcha me'zon mos (noma'lumlar ham to'ldirilgan) degani.
// `blocking` — mos KELMAGAN (ok=false, unknown=false) me'zonlar soni. Bu > 0
//   bo'lsa talaba shartlarga javob bermaydi.
// `missing`  — noma'lum (to'ldirilmagan) me'zonlar. Ular arizani "bloklamaydi",
//   faqat "kiriting" deb turadi.
// ---------------------------------------------------------------------------
export const evaluateEligibility = (grant, profile, declared = {}) => {
    const requirements = grant?.requirements || [];
    const checks = requirements.map(r => evaluateCriterion(r, profile, declared));

    const blocking = checks.filter(c => !c.ok && !c.unknown);
    const missing = checks.filter(c => c.unknown);
    const passed = checks.filter(c => c.ok);

    return {
        checks,
        total: checks.length,
        passedCount: passed.length,
        blockingCount: blocking.length,
        missingCount: missing.length,
        blocking,
        missing,
        // Me'zon umuman belgilanmagan grant hammaga ochiq.
        eligible: blocking.length === 0 && missing.length === 0,
        // Ariza yuborishga to'sqinlik qiladimi (noma'lum me'zon to'sqinlik qilmaydi —
        // talaba uni ariza formasida to'ldiradi).
        blocked: blocking.length > 0,
        percent: checks.length === 0 ? 100 : Math.round((passed.length / checks.length) * 100),
    };
};

// ---------------------------------------------------------------------------
// Avtomatik reyting balli (0..100).
//
// Grant o'z vaznlarini bersa (`grant.weights`) shular, aks holda standart
// DEFAULT_SCORING_WEIGHTS. Faqat qiymati mavjud me'zonlar hisobga olinadi va
// vaznlar shu to'plam ichida normalizatsiya qilinadi — shuning uchun bitta
// me'zon ma'lumoti yo'qligi butun ballni nolga tushirmaydi.
// ---------------------------------------------------------------------------
export const computeApplicationScore = (grant, profile, declared = {}) => {
    const weights = (grant?.weights && Object.keys(grant.weights).length)
        ? grant.weights
        : DEFAULT_SCORING_WEIGHTS;

    const parts = [];
    Object.entries(weights).forEach(([key, weight]) => {
        const w = Number(weight) || 0;
        if (w <= 0) return;
        const meta = getCriterion(key);
        if (!meta) return;

        const raw = meta.source === 'auto' ? profile?.[key] : declared?.[key];
        if (raw === undefined || raw === null || String(raw).trim() === '') return;

        const value = Number(raw);
        if (!Number.isFinite(value)) return;

        const cap = SCORING_CAPS[key] || 100;
        const ratio = Math.max(0, Math.min(1, value / cap));
        parts.push({ key, label: meta.label, weight: w, value, cap, ratio, points: ratio * w });
    });

    const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
    const rawPoints = parts.reduce((s, p) => s + p.points, 0);
    const score = totalWeight > 0 ? Math.round((rawPoints / totalWeight) * 100) : 0;

    return { score, parts, totalWeight, coverage: parts.length };
};

// ---------------------------------------------------------------------------
// Grant kvotasi va byudjeti holati.
// `live` holatdagi (tasdiqlangan + ko'rib chiqilayotgan) arizalar hisoblanadi;
// rad etilgan/qaytarib olingan arizalar o'rinni band qilmaydi.
// ---------------------------------------------------------------------------
export const computeGrantUsage = (grant, applications) => {
    const quota = Number(grant?.quota) || 0;
    const budget = parseAmount(grant?.budget);
    const amount = parseAmount(grant?.amount);

    const approved = applications.filter(a => a.status === 'approved');
    const pending = applications.filter(a => ['submitted', 'doc_check', 'committee'].includes(a.status));

    const spent = approved.length * amount;

    return {
        quota,
        budget,
        approvedCount: approved.length,
        pendingCount: pending.length,
        totalCount: applications.length,
        remainingSlots: quota > 0 ? Math.max(0, quota - approved.length) : null,
        quotaFull: quota > 0 && approved.length >= quota,
        spent,
        remainingBudget: budget > 0 ? Math.max(0, budget - spent) : null,
        budgetFull: budget > 0 && spent >= budget,
    };
};

// ---------------------------------------------------------------------------
// Grant hozir ariza qabul qiladimi?
// Sabab qaytariladi, chunki talabaga "nega bo'lmaydi" deb ko'rsatish kerak.
// ---------------------------------------------------------------------------
export const getGrantOpenState = (grant, usage, now = new Date()) => {
    if (grant.status !== 'active') {
        return { open: false, reason: 'Grant hozir ariza qabul qilmayapti' };
    }
    if (grant.deadline) {
        // Muddat kunning oxirigacha amal qiladi.
        const end = new Date(`${grant.deadline}T23:59:59`);
        if (now > end) return { open: false, reason: `Ariza muddati tugagan (${grant.deadline})` };
    }
    if (grant.opensAt) {
        const start = new Date(`${grant.opensAt}T00:00:00`);
        if (now < start) return { open: false, reason: `Qabul ${grant.opensAt} dan boshlanadi` };
    }
    if (usage?.quotaFull) return { open: false, reason: "Kvota to'lgan" };
    if (usage?.budgetFull) return { open: false, reason: "Byudjet to'liq taqsimlangan" };
    return { open: true, reason: null };
};

export const ALL_CRITERIA_KEYS = CRITERIA_CATALOG.map(c => c.key);
