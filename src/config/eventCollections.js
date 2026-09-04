// TADBIRLAR TO'PLAMI - konstantalar va sof (side-effectsiz) hisoblash funksiyalari.
// db.js shu yerdagi DEFAULT_SCORING_CONFIG/placementPointsFor/... orqali agregatsiya
// qiladi - shu bilan "qaysi qoida qayerda yozilgan" bitta joyda qoladi.

export const COLLECTION_STATUS = {
    DRAFT: 'DRAFT',
    ACTIVE: 'ACTIVE',
    COMPLETED: 'COMPLETED',
    ARCHIVED: 'ARCHIVED',
};
export const COLLECTION_STATUS_LABELS = {
    DRAFT: 'Loyiha',
    ACTIVE: 'Faol',
    COMPLETED: 'Yakunlangan',
    ARCHIVED: 'Arxivlangan',
};

export const CONTRIBUTION_TYPES = {
    PLACEMENT: 'placement',
    PARTICIPATION: 'participation',
    STATISTICS_ONLY: 'statistics_only',
    NONE: 'none',
};
export const CONTRIBUTION_TYPE_LABELS = {
    placement: "Reyting + statistika (o'rin balli beradi)",
    participation: 'Faqat statistika (ishtirok balli)',
    statistics_only: 'Faqat statistika (ball bermaydi)',
    none: 'Hisobga olinmasin',
};

export const TIE_BREAK_FIELDS = {
    totalPoints: 'Umumiy ball',
    firstPlaces: '1-o\'rinlar soni',
    secondPlaces: '2-o\'rinlar soni',
    thirdPlaces: '3-o\'rinlar soni',
    coverage: 'Unikal qamrov',
    participation: 'Jami ishtirok',
};
export const DEFAULT_TIE_BREAK_ORDER = ['totalPoints', 'firstPlaces', 'secondPlaces', 'thirdPlaces', 'coverage', 'participation'];

// Placement ballari ob'ekt - kalit o'rin raqami (string, chunki JSON kalitlari
// har doim string). Admin "+ O'rin qo'shish" bilan istagancha o'rin qo'sha oladi.
export const DEFAULT_SCORING_CONFIG = {
    placementPoints: { 1: 10, 2: 7, 3: 5, 4: 3, 5: 2, 6: 1 },
    participationPoints: 1,
    coverage: { enabled: true, maxPoints: 20, mode: 'proportional' }, // mode: 'proportional' | 'tiered' | 'statistics_only'
    coverageTiers: [ // mode==='tiered' bo'lsa ishlatiladi
        { minPercent: 100, points: 20 },
        { minPercent: 50, points: 10 },
        { minPercent: 25, points: 5 },
    ],
    tieBreakOrder: DEFAULT_TIE_BREAK_ORDER,
};

// Saqlangan config to'liq bo'lmasligi mumkin (eski to'plam, yoki admin faqat
// bir qismini o'zgartirgan) - shuning uchun har doim DEFAULT ustiga chuqur
// birlashtiriladi, aks holda yangi maydon qo'shilganda eski to'plamlar buziladi.
export const mergeScoringConfig = (stored) => {
    const s = stored || {};
    return {
        placementPoints: { ...DEFAULT_SCORING_CONFIG.placementPoints, ...(s.placementPoints || {}) },
        participationPoints: s.participationPoints ?? DEFAULT_SCORING_CONFIG.participationPoints,
        coverage: { ...DEFAULT_SCORING_CONFIG.coverage, ...(s.coverage || {}) },
        coverageTiers: s.coverageTiers || DEFAULT_SCORING_CONFIG.coverageTiers,
        tieBreakOrder: (s.tieBreakOrder && s.tieBreakOrder.length > 0) ? s.tieBreakOrder : DEFAULT_TIE_BREAK_ORDER,
    };
};

export const placementPointsFor = (config, place) => {
    if (!place) return 0;
    const v = config.placementPoints?.[String(place)] ?? config.placementPoints?.[place];
    return Number(v) || 0;
};

export const participationPointsFor = (config) => Number(config.participationPoints) || 0;

// percent: 0-100. coverage bonusi FAQAT fakultet/tyutor/kurs/guruh darajasida
// ma'noga ega (individual talabaning "o'z qamrovi" tushunchasi yo'q - shuning
// uchun studentRows'da coveragePoints doim 0).
export const coveragePointsFor = (config, percent) => {
    if (!config.coverage?.enabled || percent == null) return 0;
    const max = Number(config.coverage.maxPoints) || 0;
    if (config.coverage.mode === 'tiered') {
        const tiers = [...(config.coverageTiers || [])].sort((a, b) => b.minPercent - a.minPercent);
        const hit = tiers.find(t => percent >= t.minPercent);
        return hit ? Number(hit.points) || 0 : 0;
    }
    if (config.coverage.mode === 'statistics_only') return 0;
    // proportional (default)
    return Math.round((percent / 100) * max * 100) / 100;
};

export const compareByTieBreak = (order) => (a, b) => {
    for (const field of order) {
        const diff = (b[field] || 0) - (a[field] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
};
