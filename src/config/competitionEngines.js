// Central registry for the unified Competition & Tournament architecture.
// Additive only — existing scoringMethod-driven competitions (correct_answer,
// single_score, criteria_based, winner_selection) are untouched by this file.

// Davomat (attendance) leaf-unit resolution for jamoaviy criteria_based/single_score competitions —
// shared by CompetitionRoundsTab.jsx (locks on "Yakunlash") and CriteriaRoundAttendanceTab.jsx (reads
// the same id back), so both always agree on which leaf unit a given round belongs to.
// `competition.attendanceGranularity`: 'per_round' (default) | 'per_day' | 'whole_competition'.
// `turScheduleRows` = db.getTurSchedule(competition.id) — passed in rather than fetched here since this
// file is pure config with no db.js import. 'per_day' never fabricates a date: if the round's Tur has no
// real scheduled date yet, it falls back to the same 'whole' bucket 'whole_competition' uses.
// How many 'per_round' leaf units a team competition actually has, in the SAME numbering
// CompetitionRoundsTab.jsx's cards already use as their `index` (the true global "Raund" group number,
// also the competitionRounds overlay's own key) — correct_answer groups `roundsCount` raw questions into
// chunks of `questionsPerRound` (Zakovat's `roundsCount` is a raw QUESTION count, not a round count), every
// other round/stage-based engine (quiz_mixed, criteria_based, single_score, ...) has no such grouping, so
// `roundsCount` IS already the round count. match_play/debate_match never call this — they address leaf
// units by matchId instead (see getMatchPlayAttendanceRoster/getDebateMatchBenchRoster).
export const getAttendanceRoundGroupCount = (competition) => {
    if (competition.scoringMethod === 'correct_answer') {
        return Math.max(1, Math.ceil((competition.roundsCount || 1) / (competition.questionsPerRound || 12)));
    }
    return competition.roundsCount || 1;
};

export const resolveAttendanceLeafUnitId = (competition, roundIndex, turScheduleRows = []) => {
    const granularity = competition.attendanceGranularity || 'per_round';
    if (granularity === 'whole_competition') return 'whole';
    if (granularity === 'per_day') {
        const stages = competition.stages || [];
        const turIdx = stages.findIndex(s => roundIndex >= s.roundRange[0] && roundIndex <= s.roundRange[1]);
        const sched = turIdx >= 0 ? turScheduleRows.find(s => s.turIndex === turIdx + 1) : null;
        return sched?.date || 'whole';
    }
    return String(roundIndex);
};

export const SCORING_ENGINES = [
    { id: 'correct_answer', label: "To'g'ri javob (Zakovat)", implemented: true, description: "Har bir savol uchun to'g'ri/noto'g'ri belgilanadi, ballar avtomatik hisoblanadi." },
    { id: 'quiz_mixed', label: 'Aralash viktorina (TDYU Quiz)', implemented: true, description: "Har bir raund o'ziga xos qoidaga ega: standart, joylashuv, vabank, plyus/minus, belgilangan bonus." },
    { id: 'debate', label: 'Munozara (Debate)', implemented: true, description: "6 mezon bo'yicha hakam bahosi (jami 100 ball) + Bosh hakam jarima paneli." },
    { id: 'criteria_based', label: 'Mezon asosida (Criteria-based)', implemented: true, description: "Admin belgilagan mezonlar bo'yicha hakam bahosi." },
    { id: 'single_score', label: 'Yagona ball', implemented: true, description: 'Hakam bitta raqamli ball qo\'yadi.' },
    { id: 'match_play', label: 'Sport (Guruh + Pley-off)', implemented: true, description: "Jamoalar bir-biriga qarshi o'ynaydi, guruh jadvali (G'/D/M/farq/ochko) va pley-off uchrashuvlari." },
    { id: 'debate_match', label: 'Munozara (Match asosida)', implemented: true, description: "Jamoalar bir-biriga qarshi bahslashadi, har bir notiq alohida 21 mezon bo'yicha baholanadi, guruh jadvali va pley-off." },
    { id: 'court_match', label: 'TSUL Court (Match asosida)', implemented: true, description: "Moot Court uchrashuvlari. Tomonlar erkin nomlanadi va yakkaxon yoki qarama-qarshi uchrashuvlar o'tkaziladi." }
];

// Live Scoring "scoring mode" — a coarser, admin-facing family grouping surfaced in the tournament
// creation wizard's Step 3 (Hisob-kitob va cheklovlar). `quiz_mixed` is NOT a separate mode
// here — it's a structured variant of "To'g'ri javob" (its roundRules come from the preset, unchanged),
// so both correct_answer and quiz_mixed presets suggest the 'correct_answer' mode. Live Scoring itself
// still branches on `scoringMethod`/`scoringEngine` exactly as before — nothing there was rewritten;
// `scoringMode` only decides WHICH scoringMethod/scoringEngine gets resolved onto the competition.
export const SCORING_MODES = [
    { id: 'correct_answer', label: "To'g'ri javob", implemented: true, description: "Zakovat/TDYU Quiz uslubidagi savol-javob musobaqalari." },
    { id: 'debate', label: 'Debat', implemented: true, description: 'Hakamlar mezon bo\'yicha baho beradigan munozara musobaqalari.' },
    { id: 'criteria_based', label: 'Mezonli baholash', implemented: true, description: 'Erkin belgilangan mezonlar bo\'yicha hakam bahosi.' },
    { id: 'single_score', label: 'Yagona umumiy ball', implemented: true, description: 'Hakam bitta raqamli ball qo\'yadi.' },
    // Voleybol/basketbol/futbol/badminton/stol tennisi now use the real 'match_play' mode below. The
    // remaining sport placeholders (fitness/armrestling/shaxmat/yengil atletika/bodibilding/kurash —
    // individual-leaderboard, real-elimination-bracket, or Swiss-pairing formats) still map to this
    // implemented:false 'sport' entry, unchanged — those genuinely aren't built yet.
    { id: 'sport', label: 'Sport (boshqa)', implemented: false, description: 'Bracket/Shveytsariya asosidagi boshqa sport musobaqalari (hali ishlab chiqilmagan).' },
    { id: 'match_play', label: 'Sport (Guruh + Pley-off)', implemented: true, description: "Jamoalar bir-biriga qarshi o'ynaydi, guruh jadvali va pley-off uchrashuvlari." },
    { id: 'debate_match', label: 'Munozara (Match asosida)', implemented: true, description: "Jamoalar bir-biriga qarshi bahslashadi, har bir notiq alohida baholanadi, guruh jadvali va pley-off." },
    { id: 'court_match', label: 'TSUL Court (Match/Memorial)', implemented: true, description: "Moot Court uchrashuvlari, yakkaxon yoki qarama-qarshi o'yinlar shaklida." }
];

// The scoring_mode a given "Turnir turi" (preset) auto-suggests in Step 1 — admin can still override
// it in Step 3. Sport presets are always implemented:false single_score placeholders (see PRESETS
// below), which is how a plain "single_score" club project is told apart from a sport placeholder.
export function getDefaultScoringMode(preset) {
    if (!preset) return 'correct_answer';
    if (preset.scoringEngine === 'correct_answer' || preset.scoringEngine === 'quiz_mixed') return 'correct_answer';
    if (preset.scoringEngine === 'debate') return 'debate';
    if (preset.scoringEngine === 'debate_match') return 'debate_match';
    if (preset.scoringEngine === 'court_match') return 'court_match';
    if (preset.scoringEngine === 'criteria_based') return 'criteria_based';
    if (preset.scoringEngine === 'match_play') return 'match_play';
    if (preset.scoringEngine === 'single_score') return preset.implemented ? 'single_score' : 'sport';
    return 'correct_answer';
}

// Simple/Professional mode classification (wizard Step 1). Derived from each preset's existing
// scoringEngine/tournamentEngine/clubId — no new field was added to all 35 PRESETS entries, this is a
// pure read-only classification so it can never drift out of sync with what a preset actually does.
// "Professional" = named multi-round/bracket formats (Zakovat/25-savol/Debate/Moot Court/Sport/Esport);
// "Simple" = everything else (generic single_score/criteria_based clubs — Vocal/Dance/Art/etc., matching
// the spec's "80% of competitions" bucket).
const PROFESSIONAL_SCORING_ENGINES = ['correct_answer', 'quiz_mixed', 'debate'];
export function getPresetMode(preset) {
    if (!preset) return 'simple';
    if (PROFESSIONAL_SCORING_ENGINES.includes(preset.scoringEngine)) return 'professional';
    if (preset.tournamentEngine && preset.tournamentEngine !== 'none') return 'professional';
    if (preset.clubId === MOOT_COURT_CLUB_ID) return 'professional';
    return 'simple';
}

export const TOURNAMENT_ENGINES = [
    { id: 'none', label: 'Yagona reyting', implemented: true, description: "Barcha ishtirokchilar bitta umumiy reytingda." },
    { id: 'knockout', label: 'Pley-off (Knockout)', implemented: false, description: 'Bitta mag\'lubiyat bilan chiqib ketish turniri.' },
    { id: 'group_playoff', label: 'Guruh + Pley-off', implemented: false, description: "Guruh bosqichi va keyin pley-off." },
    { id: 'swiss', label: 'Shveytsariya tizimi', implemented: false, description: 'Shaxmat uslubidagi turnir tizimi.' }
];

// Fixed point tables for quiz_mixed, exactly as specified.
export const QUIZ_MIXED_POINTS = {
    standard: { correct: 1, wrong: 0 },
    placement: { 1: 6, 2: 4, 3: 3, other: 0 },
    vabank: { riskCorrect: 3, riskWrong: -2, safeCorrect: 1, safeWrong: 0 },
    risk_optional: { plusCorrect: 2, plusWrong: -2, minusCorrect: 1, minusWrong: -1, blank: 0 },
    fixed_bonus: { correct: 5, wrong: 0 }
};

export const QUIZ_MIXED_ROUND_TYPES = [
    { id: 'standard', label: 'Standart' },
    { id: 'placement', label: 'Joylashuv (1-2-3-o\'rin)' },
    { id: 'vabank', label: 'Vabank' },
    { id: 'risk_optional', label: 'Plyus/Minus' },
    { id: 'fixed_bonus', label: 'Belgilangan bonus' }
];

// Computes point contribution for one quiz_mixed answer given its round's rule type.
// value shape depends on ruleType:
//   standard/fixed_bonus: boolean (true = correct, false = wrong)
//   placement: 1 | 2 | 3 | 'other'
//   vabank: { risk: boolean, correct: boolean }
//   risk_optional: { plus: boolean, correct: boolean, blank: boolean }
// `points` — optional per-competition override of QUIZ_MIXED_POINTS (same shape), e.g.
// `competition.pointTables`. Every existing call site passes only (ruleType, value) and keeps reading the
// original global constant — this param is additive, never a breaking change for old competitions that
// have no `pointTables` field of their own.
export function computeQuizMixedPoints(ruleType, value, points = QUIZ_MIXED_POINTS) {
    if (value === null || value === undefined) return 0;
    switch (ruleType) {
        case 'standard':
            return value === true ? points.standard.correct : points.standard.wrong;
        case 'fixed_bonus':
            return value === true ? points.fixed_bonus.correct : points.fixed_bonus.wrong;
        case 'placement':
            return points.placement[value] ?? points.placement.other;
        case 'vabank': {
            if (!value || typeof value !== 'object') return 0;
            const { risk, correct } = value;
            if (risk) return correct ? points.vabank.riskCorrect : points.vabank.riskWrong;
            return correct ? points.vabank.safeCorrect : points.vabank.safeWrong;
        }
        case 'risk_optional': {
            if (!value || typeof value !== 'object') return 0;
            if (value.blank) return 0;
            const { plus, correct } = value;
            if (plus) return correct ? points.risk_optional.plusCorrect : points.risk_optional.plusWrong;
            return correct ? points.risk_optional.minusCorrect : points.risk_optional.minusWrong;
        }
        default:
            return 0;
    }
}

// Per-competition effective point table — `competition.pointTables` (new, optional, same shape as
// QUIZ_MIXED_POINTS) overrides the global default when present; absent entirely for every competition
// created before this feature, so they keep reading the exact original constant.
export const getEffectivePointsTable = (competition) => competition?.pointTables || QUIZ_MIXED_POINTS;

function buildRoundRules(pattern) {
    // pattern: array of { type, count }
    const rules = [];
    pattern.forEach(({ type, count }) => {
        for (let i = 0; i < count; i++) rules.push(type);
    });
    return rules;
}

// Free-form authoring model for the quiz-family engines (correct_answer/quiz_mixed), replacing the need
// for a new hardcoded preset every time a club wants its own Tur/Raund/Savol shape. A `structure` tree is
// ONLY ever read here, at save time — every existing scoring/display consumer (computeQuizMixedPoints,
// db.getLeaderboard, QuizMixedScoringGrid, TournamentScoring's Tur selector, CompetitionResultsCenter)
// keeps reading the exact flat `roundRules`/`stages` shape it always has; this function is the one place
// that turns the tree into that flat shape. A competition with no `structure` field (every competition
// created before this feature, or one built from a hand-written `roundRules` the old way) is simply never
// touched by this — it's purely additive.
//
// Shape:
//   structure.bosqichlar: [{ id, label, turlar: [{ id, label, ruleType?, scope?, raundlar: [
//     { id, label, ruleType?, savolCount, savolOverrides?: [{ index, ruleType }] }
//   ]}]}]
// `ruleType` at any level is optional — an unset Raund/Savol inherits its Tur's ruleType; an unset Tur (or
// the whole tree) falls back to 'standard', same default every other part of this codebase already uses.
// `savolCount` defaults to 1 (a Raund IS its own leaf, matching UniQuiz's shape) — set higher to subdivide
// a Raund into individually-scoreable Savol (matching 25-savol's shape), with `savolOverrides` for the
// rare savol that needs a different rule than the rest of its Raund.
// `tur.scope` (TUR_SCOPES below) is purely descriptive — "who plays this Tur" (Barchasi/Fakultet/Guruh/
// Oldingi bosqichdan o'tganlar/Qo'lda tanlanganlar) — NOT an advancement rule and NOT enforced against
// registrants; it only rides along into the compiled stage as a label/hint for Natija kiritish and the
// Musobaqa profile to display. Real participant filtering/advancement stays exactly where it already
// lives — groupingMode + CompetitionAdvancementPanel.jsx — untouched by this. Absent (old competitions,
// or Turs built before this field existed) reads as 'all', identical to today's behavior.
export function compileStructureToRoundRules(structure) {
    const roundRules = [];
    const stages = [];
    (structure?.bosqichlar || []).forEach(bosqich => {
        (bosqich.turlar || []).forEach(tur => {
            const turStart = roundRules.length + 1;
            const turRuleType = tur.ruleType || 'standard';
            // Per-Raund boundaries WITHIN this Tur — savol numbering runs sequentially across a Tur's own
            // Raundlar (1-Raund savol 1-5, 2-Raund savol 6-10, ...), never resetting mid-Tur, exactly
            // matching how the admin built it in Tur tuzilmasi. Only meaningful when a Tur genuinely has
            // more than one Raund with its own individually-set savolCount (the free-structure "Bosqichli"
            // builder) — Natija kiritish (TournamentScoring.jsx) reads this to show a real Raund selector
            // within the selected Tur instead of dumping every one of that Tur's savol as columns at once.
            const raundBoundaries = [];
            (tur.raundlar || []).forEach((raund, rIdx) => {
                const raundStart = roundRules.length + 1;
                const raundRuleType = raund.ruleType || turRuleType;
                const savolCount = raund.savolCount || 1;
                const overrides = new Map((raund.savolOverrides || []).map(o => [o.index, o.ruleType]));
                for (let i = 0; i < savolCount; i++) {
                    roundRules.push(overrides.get(i) || raundRuleType);
                }
                raundBoundaries.push({ label: raund.label || `${rIdx + 1}-Raund`, roundRange: [raundStart, roundRules.length] });
            });
            if (roundRules.length >= turStart) {
                // Empty bosqich.label = "Yo'q — oddiy turnir" (TournamentStructureStep.jsx's hasStages
                // toggle) — the tree still has one hidden bosqich underneath, but its label is blank on
                // purpose, so the stage is just the Tur's own label, no "— " prefix hanging off nothing.
                stages.push({
                    label: bosqich.label ? `${bosqich.label} — ${tur.label}` : tur.label, roundRange: [turStart, roundRules.length],
                    bosqichLabel: bosqich.label, turLabel: tur.label, scope: tur.scope || 'all', raundBoundaries
                });
            }
        });
    });
    return { roundRules, stages };
}

// Bosqich name quick-picks — NOT a closed enum, `bosqich.label` stays a free-text field underneath (the
// "Boshqa" chip just means "type your own"); these are only starting suggestions for the UI's chip row.
export const STAGE_LABEL_PRESETS = ['Saralash', 'Guruh bosqichi', 'Chorak final', 'Yarim final', 'Final', "Pley-off"];

// "Ishtirokchilar doirasi" — see the compileStructureToRoundRules comment above: informational only.
export const TUR_SCOPES = [
    { id: 'all', label: 'Barcha ishtirokchilar', description: "Musobaqadagi barcha ro'yxatdan o'tganlar shu Turda ishtirok etadi." },
    { id: 'faculty', label: 'Fakultet doirasida', description: "Har fakultet o'z ichida alohida o'ynaydi (masalan har fakultetning o'z 1-Turi)." },
    { id: 'group', label: 'Guruh doirasida', description: "Musobaqa yaratilgandan keyin belgilanadigan guruhlar ichida alohida o'ynaladi." },
    { id: 'previous_stage', label: "Oldingi bosqichdan o'tganlar", description: "Faqat avvalgi bosqichdan saralanib chiqqanlar ishtirok etadi." },
    { id: 'manual', label: "Qo'lda tanlanganlar", description: "Ishtirokchilar musobaqa yaratilgandan keyin qo'lda tanlab biriktiriladi." }
];

export const TDYU_QUIZ_ROUND_RULES = buildRoundRules([
    { type: 'standard', count: 7 },
    { type: 'placement', count: 1 },
    { type: 'vabank', count: 1 }
]);

export const QUIZ_25_ROUND_RULES = buildRoundRules([
    { type: 'standard', count: 20 },
    { type: 'risk_optional', count: 4 },
    { type: 'fixed_bonus', count: 1 }
]);
// Real Tur (stage/phase) boundaries: 1-Tur = savol 1-20, 2-Tur = savol 21-24, 3-Tur = savol 25. Same
// display-consumed-only `stages` mechanism as UNIQUIZ_STAGES below — never read by scoring math, only
// by the Natija kiritish selector (TournamentScoring.jsx) and CompetitionRatingTab.jsx's stage columns.
export const QUIZ_25_STAGES = [
    { label: '1-Tur', roundRange: [1, 20] },
    { label: '2-Tur', roundRange: [21, 24] },
    { label: '3-Tur', roundRange: [25, 25] }
];

// UniQuiz: 3 stages x 9 rounds = 27 total, every stage using the SAME round-rule pattern (confirmed by
// user 2026-08-12: 2-Tur/3-Tur score exactly like 1-Tur, not their own distinct mix) — Raund1-7 standard
// (1 ball to'g'ri javob uchun), Raund8 placement (1-2-3-o'rin, see QUIZ_MIXED_POINTS.placement), Raund9
// vabank (see QUIZ_MIXED_POINTS.vabank). All types are ones computeQuizMixedPoints already scores.
const UNIQUIZ_STAGE_PATTERN = [{ type: 'standard', count: 7 }, { type: 'placement', count: 1 }, { type: 'vabank', count: 1 }];
export const UNIQUIZ_ROUND_RULES = [
    ...buildRoundRules(UNIQUIZ_STAGE_PATTERN), // Stage 1: Saralash
    ...buildRoundRules(UNIQUIZ_STAGE_PATTERN), // Stage 2: Fakultet bosqichi
    ...buildRoundRules(UNIQUIZ_STAGE_PATTERN) // Stage 3: Final
];
// Display-only round-range grouping — consumed by CompetitionRatingTab.jsx/CompetitionResultsCenter.jsx
// to sum a participant's already-real roundScores over each range; never read by any scoring math.
export const UNIQUIZ_STAGES = [
    { label: '1-Tur Saralash', roundRange: [1, 9] },
    { label: '2-Tur Fakultet bosqichi', roundRange: [10, 18] },
    { label: '3-Tur Final', roundRange: [19, 27] }
];

// Fixed debate criteria — sums to 100. Keyed by `name` (not a separate `key`) so the existing
// criteria_based storage convention (competition.criteria = [{id, name, maxScore}], criteriaScores
// keyed by criterion name) can be reused verbatim for debate's Live Scoring inputs and totals.
export const DEBATE_CRITERIA = [
    { name: 'Argumentatsiya', max: 30 },
    { name: 'Rebuttal / Inkor', max: 20 },
    { name: 'Nutq mahorati', max: 20 },
    { name: 'Struktura va ATIX', max: 15 },
    { name: 'Savol-javob', max: 10 },
    { name: 'Vaqt intizomi', max: 5 }
];

// Second, alternative rubric (52-point total) for clubs/coordinators who judge on a 52-point sheet
// instead of the original 100-point one above. Additive — DEBATE_CRITERIA and every preset already
// using it are completely untouched; this is consumed only by the new `munozara_52` preset. The
// per-criterion split is proportionally scaled from the existing 100-point breakdown (30/20/20/15/10/5)
// as a reasonable starting point — adjust against a real TSUL 52-point judging sheet if one differs.
export const DEBATE_CRITERIA_52 = [
    { name: 'Argumentatsiya', max: 16 },
    { name: 'Rebuttal / Inkor', max: 10 },
    { name: 'Nutq mahorati', max: 10 },
    { name: 'Struktura va ATIX', max: 8 },
    { name: 'Savol-javob', max: 5 },
    { name: 'Vaqt intizomi', max: 3 }
];

// TSUL Court — Civil (Claimant vs Respondent): Memorial(30) + Oral(70) = 100. Additive alongside the
// existing generic Moot Court presets (oral_rounds/written_memorial/team_moot) below, which keep using
// their own flat-10-per-criterion criteriaInput convention untouched.
export const TSUL_COURT_CIVIL_CRITERIA = [
    { name: "Memorial: Yozma tahlil sifati", max: 15 },
    { name: "Memorial: Huquqiy manbalar bilan ishlash", max: 15 },
    { name: 'Oral: Notiqlik mahorati', max: 20 },
    { name: 'Oral: Savol-javobga tayyorgarlik', max: 20 },
    { name: "Oral: Dalillarni taqdim etish", max: 20 },
    { name: 'Oral: Vaqt intizomi', max: 10 }
];

// TSUL Court — Criminal (Mock Trial, single case for all teams, roles: judge/prosecutor/defense/
// accused/witness/clerk — see db.getCompetitionCaseRoles/setCompetitionCaseRole): 100-point single rubric.
export const TSUL_COURT_CRIMINAL_CRITERIA = [
    { name: 'Huquqiy bilim va tahlil', max: 25 },
    { name: 'Protsessual qoidalarga rioya', max: 20 },
    { name: 'Notiqlik va argumentatsiya', max: 20 },
    { name: 'Dalillar bilan ishlash', max: 20 },
    { name: 'Jamoaviy hamkorlik', max: 15 }
];

// ---------------------------------------------------------------------------------------------------
// TSUL Court (`court_match`) shared resolvers — the single source of truth for "which speaker slots does
// this court competition have" and "which criteria rows does it score against", so db.js's match-finishing
// math and every UI (DebateNotiqScoringPanel/DebateMatchesTab/DebateRatingTab) can never disagree.
// Previously each caller re-derived these inline (and db.js didn't know about court_match AT ALL, which is
// why finishing a court match scored 0 — it bucketed scores by Munozara's NOTIQ_SLOTS and filtered them
// against Munozara's 21-row rubric, neither of which a court match uses).
// ---------------------------------------------------------------------------------------------------

// TSUL Court is scored PER TEAM, not per speaker: a judge fills the rubric once for the whole team
// (TSUL_COURT_*_CRITERIA are team-level rows — "Jamoaviy hamkorlik", "Memorial: Yozma tahlil sifati", ...,
// none of which describe an individual speaker). So a court match has exactly ONE scoring column per side:
// one for a 1-sided format (Written Memorial / Criminal — a team performs alone), two for a 2-sided one
// (Civil / Oral Rounds / Team Moot). This is the key difference from Munozara, which really does score
// 6 individual notiqs. Ids keep the T*/I* prefix convention so the shared side-splitting logic
// (slot.startsWith('I')) in finishDebateMatch/lineup code keeps working unchanged.
export const COURT_SLOTS_SINGLE = ['J1'];
export const COURT_SLOTS_DOUBLE = ['T1', 'I1'];

// Engines whose real structure is a set of MATCH records built after creation (uchrashuvlar/guruh/pley-off)
// rather than a fixed `roundsCount` of scored rounds. Every consumer that needs to ask "is this
// match-based?" reads this one list — it used to be re-typed inline in half a dozen files, and court_match
// (added last) was silently missing from most of them, which is why a TSUL Court competition still showed a
// meaningless "Jami raundlar" figure and offered round-based controls it doesn't use.
export const MATCH_BASED_ENGINES = ['match_play', 'debate_match', 'court_match'];
export const isMatchBasedEngine = (scoringMethodOrEngine) => MATCH_BASED_ENGINES.includes(scoringMethodOrEngine);

export function getCourtSlots(competition) {
    return competition?.isSingleSided ? COURT_SLOTS_SINGLE : COURT_SLOTS_DOUBLE;
}

// Normalizes the flat {name, max} preset sheets above into the same richer row shape
// DEBATE_MATCH_CRITERIA uses (id/category/kind/appliesTo), so computeNotiqTotal's applicable-id filtering
// and the scoring grid's category grouping both work on court criteria without special-casing.
export function buildCourtCriteriaFromSheet(sheet) {
    return (sheet || []).map((c, idx) => ({
        id: `crit_${idx}`, category: 'court', name: c.name, max: c.max, kind: 'score', appliesTo: 'all'
    }));
}

export const COURT_MATCH_CATEGORIES = [{ id: 'court', label: 'Baholash mezonlari' }];

// The effective rubric for one court competition: the admin's own customization if they made one
// (competition.courtMatchCriteria, TournamentStructureStep.jsx's "Tahrirlash" editor), otherwise the
// standard sheet for its format. Never returns an empty array for a valid court competition.
export function getCourtMatchCriteria(competition) {
    if (competition?.courtMatchCriteria?.length) return competition.courtMatchCriteria;
    return buildCourtCriteriaFromSheet(
        competition?.isSingleSided ? TSUL_COURT_CRIMINAL_CRITERIA : TSUL_COURT_CIVIL_CRITERIA
    );
}

export const DEBATE_PENALTY_TYPES = [
    { key: 'time_violation', label: 'Vaqt qoidabuzarligi' },
    { key: 'procedural_violation', label: 'Protsedura qoidabuzarligi' },
    { key: 'personal_attack', label: 'Shaxsga tegish' },
    { key: 'other', label: 'Boshqa qoidabuzarlik' }
];

// Sum of all entered criteria values for one judge/round entry (mirrors criteria_based's totalling).
export function computeDebateRoundTotal(criteriaScores) {
    return Object.values(criteriaScores || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

// ---------------------------------------------------------------------------------------------------
// Munozara (Debate) MATCH-BASED engine (`debate_match`) — a completely separate, new engine, NOT an
// extension of `debate`/DEBATE_CRITERIA/DEBATE_CRITERIA_52/computeDebateRoundTotal above (those stay
// 100% untouched, still used by munozara/parlament/bp/lincoln_douglas/munozara_52). Judging here happens
// per individual "notiq" (speaker) — 3 per side x 2 sides per match — against a real, fixed 21-row/
// 3-category criteria sheet transcribed from an actual TSUL "Hakamlik bayonnomasi" judge protocol,
// user-confirmed. Sibling to Sport's match_play engine (real match records, group + playoff).
// ---------------------------------------------------------------------------------------------------

// 3 Tasdiqlovchi (affirmative) + 3 Inkor etuvchi (negative) speaker slots per match.
export const NOTIQ_SLOTS = ['T1', 'T2', 'T3', 'I1', 'I2', 'I3'];

export const DEBATE_MATCH_CATEGORIES = [
    { id: 'nutq_mohiyati', label: 'Nutq mohiyati' },
    { id: 'nutq_tuzilishi', label: 'Nutqning tuzilishi' },
    { id: 'nutq_usullari', label: 'Nutq usullari' }
];

// Position-gated groups: ATIX (Argumentlash + A/T/I/X) only scored for T1/T2/I3 (the notiqs who open
// argumentation); Dixatomiya (+ Kesishuv nuqtalari + Pozitsiyaning himoyalanishi) only scored for
// T3/I1/I2 (the notiqs who handle rebuttal/synthesis). Every other row applies to all 6 slots.
const ATIX_SLOTS = ['T1', 'T2', 'I3'];
const DIXATOMIYA_SLOTS = ['T3', 'I1', 'I2'];

// 21 rows, exactly as transcribed off the judge protocol sheet (user-confirmed). `kind: 'score'` rows
// count toward a notiq's max (see computeNotiqMaxScore below); `penalty`/`bonus` rows do not — they
// adjust the total but aren't part of the sheet's own point ceiling. `parent` marks the 4 ATIX sub-items
// and 2 Dixatomiya sub-items as nested under their header row (display grouping only, doesn't affect
// totalling — every row with kind:'score' is summed flat, same as computeDebateRoundTotal does).
export const DEBATE_MATCH_CRITERIA = [
    // Nutq mohiyati
    { id: 'malumot_aniqlik', category: 'nutq_mohiyati', name: "Ma'lumotning aniqlik darajasi", max: 3, kind: 'score', appliesTo: 'all' },
    { id: 'dalil_mavzuga_moslik', category: 'nutq_mohiyati', name: 'Dalillarning mavzuga mosligi', max: 2, kind: 'score', appliesTo: 'all' },
    { id: 'nutq_oziga_xoslik', category: 'nutq_mohiyati', name: "Nutqning o'ziga xosligi", max: 2, kind: 'score', appliesTo: 'all' },
    { id: 'mavzu_ozlashtirish', category: 'nutq_mohiyati', name: "Mavzuni o'zlashtirilishi", max: 2, kind: 'score', appliesTo: 'all' },
    { id: 'argumentlash', category: 'nutq_mohiyati', name: 'Argumentlash (ATIX)', max: 2, kind: 'score', appliesTo: ATIX_SLOTS },
    { id: 'atix_a', category: 'nutq_mohiyati', name: 'A (Argument)', max: 1, kind: 'score', appliesTo: ATIX_SLOTS, parent: 'argumentlash' },
    { id: 'atix_t', category: 'nutq_mohiyati', name: 'T (Tushuntirish)', max: 2, kind: 'score', appliesTo: ATIX_SLOTS, parent: 'argumentlash' },
    { id: 'atix_i', category: 'nutq_mohiyati', name: 'I (Isbot)', max: 3, kind: 'score', appliesTo: ATIX_SLOTS, parent: 'argumentlash' },
    { id: 'atix_x', category: 'nutq_mohiyati', name: 'X (Xulosa)', max: 2, kind: 'score', appliesTo: ATIX_SLOTS, parent: 'argumentlash' },
    { id: 'dixatomiya', category: 'nutq_mohiyati', name: 'Dixatomiya', max: 7, kind: 'score', appliesTo: DIXATOMIYA_SLOTS },
    { id: 'kesishuv_nuqtalari', category: 'nutq_mohiyati', name: 'Kesishuv nuqtalari', max: 3, kind: 'score', appliesTo: DIXATOMIYA_SLOTS, parent: 'dixatomiya' },
    { id: 'pozitsiya_himoyalanishi', category: 'nutq_mohiyati', name: 'Pozitsiyaning himoyalanishi', max: 5, kind: 'score', appliesTo: DIXATOMIYA_SLOTS, parent: 'dixatomiya' },
    { id: 'xato_hurmatsizlik', category: 'nutq_mohiyati', name: "Yo'l qo'yilgan xatolar va hurmatsizlik", max: 2, kind: 'penalty', appliesTo: 'all' },
    { id: 'savollar_bilan_ishlash', category: 'nutq_mohiyati', name: 'Savollar bilan ishlash', max: 2, kind: 'score', appliesTo: 'all' },
    // Nutqning tuzilishi
    { id: 'notiq_vazifalari', category: 'nutq_tuzilishi', name: "Notiqning vazifalarini bajarishi", max: 3, kind: 'score', appliesTo: 'all' },
    { id: 'nutq_mantiqiyligi', category: 'nutq_tuzilishi', name: 'Nutqning mantiqiyligi', max: 3, kind: 'score', appliesTo: 'all' },
    { id: 'nutq_tartibliligi', category: 'nutq_tuzilishi', name: 'Nutqning tartibliligi va aniqligi', max: 3, kind: 'score', appliesTo: 'all' },
    { id: 'reglamentga_amal', category: 'nutq_tuzilishi', name: 'Reglamentga amal qilinishi', max: 1, kind: 'score', appliesTo: 'all' },
    // Nutq usullari
    { id: 'nutq_madaniyati', category: 'nutq_usullari', name: 'Nutq madaniyati', max: 3, kind: 'score', appliesTo: 'all' },
    { id: 'ozini_tutish_madaniyati', category: 'nutq_usullari', name: "O'zini tutish madaniyati", max: 3, kind: 'score', appliesTo: 'all' },
    { id: 'takrorlanmas_fikrlar', category: 'nutq_usullari', name: 'Takrorlanmas fikrlar', max: 2, kind: 'bonus', appliesTo: 'all' }
];

// Which criteria rows apply to a given notiq slot (position-gating resolved). `criteria` defaults to the
// standard 21-row protocol sheet but accepts a per-competition override
// (competition.debateMatchCriteria — see TournamentStructureStep.jsx's "Tahrirlash" editor) so a club that
// customized its own rubric gets that instead, everywhere this is called from.
export function getCriteriaForNotiq(slot, criteria = DEBATE_MATCH_CRITERIA) {
    return criteria.filter(c => c.appliesTo === 'all' || c.appliesTo.includes(slot));
}

// The sheet's real point ceiling for a slot — 37 for an ATIX slot (T1/T2/I3), 42 for a Dixatomiya slot
// (T3/I1/I2) with the standard sheet — derived from the schema itself (never hardcoded), summing only
// kind:'score' rows. Recomputes correctly for a custom `criteria` override too.
export function computeNotiqMaxScore(slot, criteria = DEBATE_MATCH_CRITERIA) {
    return getCriteriaForNotiq(slot, criteria).filter(c => c.kind === 'score').reduce((sum, c) => sum + c.max, 0);
}

// position-gated total with a default fallback to plain criteria-sum for court_match.
export function computeNotiqTotal(rawCriteriaScores, slot, criteria = DEBATE_MATCH_CRITERIA) {
    const applicableIds = new Set(getCriteriaForNotiq(slot, criteria).map(c => c.id));
    const filtered = {};
    Object.entries(rawCriteriaScores || {}).forEach(([critId, v]) => {
        // For court_match, we might use simple criteria where appliesTo defaults to 'all' or is absent.
        if (applicableIds.has(critId) || applicableIds.size === 0) filtered[critId] = v;
    });
    return computeDebateRoundTotal(filtered);
}

// Combines every judge's independent scoring of one notiq into a single aggregate, using the exact same
// sum/average formula db.getLeaderboard already uses for judge aggregation (Math.round((sum/count)*10)/10
// for 'average', plain sum otherwise) — `judgeEntries` = [{judge, criteriaScores}], one per judge who has
// scored this notiq. Returns per-judge totals alongside the aggregate so the UI can show both.
export function aggregateNotiqAcrossJudges(judgeEntries, slot, calculationMethod, criteria = DEBATE_MATCH_CRITERIA) {
    const perJudge = (judgeEntries || []).map(e => ({ judge: e.judge, total: computeNotiqTotal(e.criteriaScores, slot, criteria) }));
    if (perJudge.length === 0) return { perJudge, aggregate: 0 };
    const sum = perJudge.reduce((s, e) => s + e.total, 0);
    const aggregate = calculationMethod === 'average' ? Math.round((sum / perJudge.length) * 10) / 10 : sum;
    return { perJudge, aggregate };
}

// One team's total for a single match = sum of its 3 notiqs' own (already judge-aggregated) totals.
// `notiqEntriesBySlot` = Map/object of slot -> judgeEntries (see aggregateNotiqAcrossJudges). `criteria`
// threads through to computeNotiqTotal's applicable-id filtering — a competition with a customized rubric
// (competition.debateMatchCriteria) MUST pass its own criteria here, or a real match winner/score could
// be computed against the wrong (standard-sheet) criterion ids.
export function computeTeamMatchTotal(notiqEntriesBySlot, slots, calculationMethod, criteria = DEBATE_MATCH_CRITERIA) {
    return slots.reduce((sum, slot) => {
        const judgeEntries = notiqEntriesBySlot[slot] || [];
        return sum + aggregateNotiqAcrossJudges(judgeEntries, slot, calculationMethod, criteria).aggregate;
    }, 0);
}

// Pure comparison — higher team total wins. No tiebreak cascade (unlike UniQuiz advancement): a real
// tie on a debate scoresheet is rare and, per design, resolved by a human (manual winner pick), not an
// algorithm — returns null so the caller (db.finishDebateMatch) knows to require that manual input.
export function computeDebateMatchWinner(scoreT, scoreI, teamTId, teamIId) {
    // Single-sided match has teamIId as null/empty
    if (!teamIId) return teamTId;
    if (scoreT > scoreI) return teamTId;
    if (scoreI > scoreT) return teamIId;
    return null;
}

// Debate's own sibling to computeGroupStandings above — same 3-1-0 points / tiebreak-order shape, but
// reading debateMatches' teamTId/teamIId/scoreT/scoreI fields (Tasdiqlovchi/Inkor etuvchi) instead of
// Sport's teamAId/teamBId/scoreA/scoreB. Only `stage === 'group'` + `status === 'finished'` matches count.
export function computeDebateGroupStandings(matches, participants) {
    const table = new Map(participants.map(p => [p.id, {
        participant: p, played: 0, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0, points: 0
    }]));
    (matches || [])
        .filter(m => m.stage === 'group' && m.status === 'finished')
        .forEach(m => {
            const t = table.get(m.teamTId);
            const i = m.teamIId ? table.get(m.teamIId) : null;
            if (!t) return;
            t.played += 1;
            t.pointsFor += m.scoreT;
            if (i) {
                i.played += 1;
                t.pointsAgainst += m.scoreI || 0;
                i.pointsFor += m.scoreI || 0;
                i.pointsAgainst += m.scoreT;
                if (m.winnerTeamId === m.teamTId) { t.won += 1; t.points += 3; i.lost += 1; }
                else if (m.winnerTeamId === m.teamIId) { i.won += 1; i.points += 3; t.lost += 1; }
            } else {
                // Single-sided match: gets 3 points for finishing
                t.won += 1;
                t.points += 3;
            }
        });
    return [...table.values()]
        .map(row => ({ ...row, pointsDifference: row.pointsFor - row.pointsAgainst }))
        .sort((a, b) => b.points - a.points || b.pointsDifference - a.pointsDifference || b.pointsFor - a.pointsFor);
}

// Munozara match-based ("debate_match") official reglament — the fixed speech/cross-examination timeline
// one full match takes, user-provided verbatim. Kept as an ordered, labeled timeline (not a bare minute
// count) so the total is transparent/auditable and the "Jadval" tab schedule UI can show WHY a match
// takes 44 minutes, not just the number. `minutes` values are real durations from the reglament, never
// guessed or rounded.
export const DEBATE_MATCH_REGLAMENT = [
    { kind: 'speech', slot: 'T1', label: "Tasdiqlovchi 1-notiq nutqi", minutes: 6 },
    { kind: 'cross_exam', slot: 'T1', questioner: 'I3', label: "Inkor 3-notiq — Tasdiq 1-notiqqa savol", minutes: 3 },
    { kind: 'speech', slot: 'I1', label: "Inkor 1-notiq nutqi", minutes: 6 },
    { kind: 'cross_exam', slot: 'I1', questioner: 'T3', label: "Tasdiq 3-notiq — Inkor 1-notiqqa savol", minutes: 3 },
    { kind: 'speech', slot: 'T2', label: "Tasdiqlovchi 2-notiq nutqi", minutes: 5 },
    { kind: 'cross_exam', slot: 'T2', questioner: 'I1', label: "Inkor 1-notiq — Tasdiq 2-notiqqa savol", minutes: 3 },
    { kind: 'speech', slot: 'I2', label: "Inkor 2-notiq nutqi", minutes: 5 },
    { kind: 'cross_exam', slot: 'I2', questioner: 'T1', label: "Tasdiq 1-notiq — Inkor 2-notiqqa savol", minutes: 3 },
    { kind: 'speech', slot: 'T3', label: "Tasdiqlovchi 3-notiq nutqi", minutes: 5 },
    { kind: 'speech', slot: 'I3', label: "Inkor 3-notiq nutqi", minutes: 5 }
];

// Real total = 6+3+6+3+5+3+5+3+5+5 = 44 minutes — derived from DEBATE_MATCH_REGLAMENT above, never
// hardcoded separately (so editing the reglament array alone keeps the total correct).
export const DEBATE_MATCH_TOTAL_DURATION_MINUTES = DEBATE_MATCH_REGLAMENT.reduce((sum, item) => sum + item.minutes, 0);

// Given a "HH:MM" start time, returns the "HH:MM" end time after the full reglament duration — wraps
// past midnight (mod 24h) rather than tracking a separate end-date, same scope as the rest of the
// scheduling UI (a single time-of-day field, no multi-day span concept).
export function computeDebateMatchEndTime(startTime) {
    if (!startTime) return null;
    const [h, m] = startTime.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    const totalStartMinutes = h * 60 + m;
    const totalEndMinutes = (totalStartMinutes + DEBATE_MATCH_TOTAL_DURATION_MINUTES) % (24 * 60);
    const endH = Math.floor(totalEndMinutes / 60);
    const endM = totalEndMinutes % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

// Sport (match_play): real group-stage standings from db.getCompetitionMatches — completely parallel to
// db.getLeaderboard, never touching it. Only `stage === 'group'` + `status === 'finished'` matches count
// (playoff matches never affect the group table, matching real sports rules). 3-1-0 points, sorted
// Points desc -> Goal Difference desc -> Goals For desc (standard tiebreak order).
export function computeGroupStandings(matches, participants) {
    const table = new Map(participants.map(p => [p.id, {
        participant: p, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0
    }]));
    (matches || [])
        .filter(m => m.stage === 'group' && m.status === 'finished')
        .forEach(m => {
            const a = table.get(m.teamAId);
            const b = table.get(m.teamBId);
            if (!a || !b) return;
            a.played += 1; b.played += 1;
            a.goalsFor += m.scoreA; a.goalsAgainst += m.scoreB;
            b.goalsFor += m.scoreB; b.goalsAgainst += m.scoreA;
            if (m.scoreA > m.scoreB) { a.won += 1; a.points += 3; b.lost += 1; }
            else if (m.scoreA < m.scoreB) { b.won += 1; b.points += 3; a.lost += 1; }
            else { a.drawn += 1; b.drawn += 1; a.points += 1; b.points += 1; }
        });
    return [...table.values()]
        .map(row => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
        .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
}

// UniQuiz per-faculty ("guruh") advancement — tiebreak helpers. `roundScores` is db.getLeaderboard's
// per-participant flat map ({rawRound: numericScore|null}, ABSOLUTE round numbers). `roundRange` is a
// stage's [start,end] from getDisplayStages. Neither db.getLeaderboard nor CompetitionResultsCenter's
// leaderboardRows sum a SINGLE stage's own range (both always sum the whole competition) — this is that
// missing piece, kept here (pure, data-in/data-out) rather than db.js since it's not a storage concern.
export function sumRoundScoresInRange(roundScores, roundRange) {
    if (!roundScores || !roundRange) return 0;
    const [start, end] = roundRange;
    let total = 0;
    for (let r = start; r <= end; r++) {
        const v = roundScores[r];
        if (typeof v === 'number') total += v;
    }
    return total;
}

export const DEFAULT_ADVANCEMENT_TIEBREAK = { primaryMethod: 'countback', lastN: 3, fallbackMethod: 'split' };

// Shared with CompetitionAdvancementPanel.jsx (post-creation "Guruh bosqichlari" panel) and
// TournamentRulesStep.jsx (creation-time "Bosqichlar va o'tish qoidalari") — one label set so both
// places describe the exact same real primaryMethod/fallbackMethod values identically.
export const TIEBREAK_PRIMARY_LABELS = {
    countback: "Oxirgi farqli savol",
    lastN: "Oxirgi N savoldagi natija",
    extra_question: "Qo'shimcha savol"
};
export const TIEBREAK_FALLBACK_LABELS = {
    split: "O'rinlar teng bo'linadi",
    extra_question: "Qo'shimcha savol"
};

// Groups a sorted list of {participantId, score} into clusters of equal score, best-to-worst — the
// shared "still tied at this granularity" return shape both tiebreak methods below produce.
function clusterByScore(entries) {
    const clusters = [];
    entries.forEach(entry => {
        const last = clusters[clusters.length - 1];
        if (last && last.score === entry.score) last.participantIds.push(entry.participantId);
        else clusters.push({ score: entry.score, participantIds: [entry.participantId] });
    });
    return clusters;
}

// "Oxirgi farqli savol" (countback): walks roundRange backward from the end, comparing each tied
// participant's CUMULATIVE score from roundRange[0] through the current round r. The tied group's full
// range gave equal totals (that's why they're tied) — the first r (starting from the end) where the
// cumulative-through-r values actually differ is the most recent point one side pulled ahead, and that
// ordering wins. If no such r exists (every round was identical for all of them), returns one full
// cluster — still genuinely tied, nothing to resolve here.
export function rankByCountback(tiedGroup, roundRange) {
    if (!tiedGroup || tiedGroup.length === 0) return [];
    const [start, end] = roundRange;
    for (let r = end; r >= start; r--) {
        const cumulative = tiedGroup.map(p => {
            let sum = 0;
            for (let i = start; i <= r; i++) {
                const v = p.roundScores?.[i];
                if (typeof v === 'number') sum += v;
            }
            return { participantId: p.participantId, score: sum };
        });
        const distinctScores = new Set(cumulative.map(c => c.score));
        if (distinctScores.size > 1) {
            cumulative.sort((a, b) => b.score - a.score);
            return clusterByScore(cumulative);
        }
    }
    return [{ score: null, participantIds: tiedGroup.map(p => p.participantId) }];
}

// "Oxirgi N savoldagi natija": sums only the last N raw rounds of roundRange (clamped to roundRange[0]
// if the range is shorter than N) per participant, sorts desc, clusters ties. Same shape as rankByCountback.
export function rankByLastN(tiedGroup, roundRange, n) {
    if (!tiedGroup || tiedGroup.length === 0) return [];
    const [start, end] = roundRange;
    const lastNStart = Math.max(start, end - n + 1);
    const entries = tiedGroup
        .map(p => ({ participantId: p.participantId, score: sumRoundScoresInRange(p.roundScores, [lastNStart, end]) }))
        .sort((a, b) => b.score - a.score);
    return clusterByScore(entries);
}

// Club ids these presets are scoped to (src/services/db.js club roster). Each is a real, purpose-built
// club — not a generic direction/category like "Madaniyat va San'at" (club '1'), which has no presets
// scoped to it and therefore never appears as a selectable club in the tournament creation wizard.
// This is the university's full official club/project roster (34 clubs).
export const MOOT_COURT_CLUB_ID = '9';
export const ZAKOVAT_CLUB_ID = '10';
export const MUNOZARA_CLUB_ID = '11';
export const VOKAL_CLUB_ID = '12';
export const RAQS_CLUB_ID = '13';
export const TEATR_CLUB_ID = '14';
export const TEDX_CLUB_ID = '15';
export const QUIZ25_CLUB_ID = '16';
export const UNIQUIZ_CLUB_ID = '43';

// Clubs whose competition type is a single, unspecialized "Yagona ball" (single_score) contest — the
// engine already fully works, it's just not a dedicated multi-round format like Zakovat/Munozara/etc.
// { clubId, presetId, label } — label reuses the club's own theme so the dropdown reads naturally.
const GENERIC_SINGLE_SCORE_CLUBS = [
    { clubId: '17', presetId: 'kvn', label: 'KVN uslubidagi bellashuv' },
    { clubId: '18', presetId: 'discovery', label: 'Discovery musobaqasi' },
    { clubId: '21', presetId: 'gdc', label: 'GDC musobaqasi' },
    { clubId: '22', presetId: 'yuksalish', label: "Yuksalish musobaqasi" },
    { clubId: '23', presetId: 'cudc', label: 'CUDC musobaqasi' },
    { clubId: '27', presetId: 'tsul_pac', label: 'TSUL PAC musobaqasi' },
    { clubId: '28', presetId: 'tsul_up', label: 'TSUL UP musobaqasi' },
    { clubId: '29', presetId: 'tsul_ufs', label: 'TSUL UFS musobaqasi' }
];

// Sports clubs — real match-based scoring (group standings, brackets) isn't built yet (match_play /
// group_playoff / swiss are future phases, see PHASE1 notes), so every sport is a placeholder.
const SPORT_CLUBS = [
    { clubId: '30', presetId: 'volleyball', label: 'Voleybol', tournamentEngine: 'group_playoff' },
    { clubId: '31', presetId: 'basketball', label: 'Basketbol', tournamentEngine: 'group_playoff' },
    { clubId: '32', presetId: 'football', label: 'Futbol', tournamentEngine: 'group_playoff' },
    { clubId: '33', presetId: 'badminton', label: 'Badminton', tournamentEngine: 'group_playoff' },
    { clubId: '34', presetId: 'table_tennis', label: 'Stol tennisi', tournamentEngine: 'group_playoff' },
    { clubId: '35', presetId: 'fitness', label: 'Fitnes', tournamentEngine: 'none' },
    { clubId: '36', presetId: 'armrestling', label: 'Armrestling', tournamentEngine: 'knockout' },
    { clubId: '37', presetId: 'chess', label: 'Shaxmat va shashka', tournamentEngine: 'swiss' },
    { clubId: '38', presetId: 'athletics', label: 'Yengil atletika', tournamentEngine: 'none' },
    { clubId: '39', presetId: 'bodybuilding', label: 'Bodibilding', tournamentEngine: 'none' },
    { clubId: '40', presetId: 'kurash', label: 'Kurash', tournamentEngine: 'knockout' }
];

export const PRESETS = [
    // --- Universal, club-agnostic type (no clubId) — offered to EVERY club ---
    // Every other preset below is bound to one purpose-built club, which meant a club without its own
    // preset simply could not create a competition at all, and even a club that had one could not run a
    // plain "N shart, N hakam, eng ko'p ball yig'gan g'olib" contest without a matching template existing.
    // This is that plain shape: criteria_based (judges score each criterion, aggregated by the
    // competition's own calculationMethod), with the criteria themselves defined by the admin in Step 2
    // rather than baked in here — `criteriaInput` is only the starting suggestion.
    {
        id: 'umumiy', label: 'Umumiy musobaqa (shartlar bo\'yicha)', implemented: true,
        scoringEngine: 'criteria_based', scoringMethod: 'criteria_based', tournamentEngine: 'none',
        defaults: { roundsCount: 1, calculationMethod: 'average', criteriaInput: 'Bilim, Mahorat, Taqdimot' }
    },

    // --- Zakovat club (10): quiz-family types, all correct_answer/quiz_mixed (already fully working) ---
    {
        id: 'zakovat', label: "Zakovat (Klassik)", implemented: true, clubId: ZAKOVAT_CLUB_ID, participantType: 'team',
        scoringEngine: 'correct_answer', scoringMethod: 'correct_answer', tournamentEngine: 'none',
        defaults: { roundsCount: 12, questionsPerRound: 12, pointsPerCorrectAnswer: 1, penaltyPerWrongAnswer: 0 }
    },
    {
        id: 'breyn_ring', label: 'Breyn-ring', implemented: true, clubId: ZAKOVAT_CLUB_ID, participantType: 'team',
        scoringEngine: 'correct_answer', scoringMethod: 'correct_answer', tournamentEngine: 'none',
        defaults: { roundsCount: 12, questionsPerRound: 12, pointsPerCorrectAnswer: 1, penaltyPerWrongAnswer: 0 }
    },
    // Kept in the list (so admins know it's coming) but disabled — its real format (beyond just being
    // Klassik-but-individual) hasn't been worked out yet.
    {
        id: 'shaxsiy_oyin', label: "Shaxsiy o'yin", implemented: false, clubId: ZAKOVAT_CLUB_ID,
        scoringEngine: 'correct_answer', scoringMethod: 'correct_answer', tournamentEngine: 'none', participantType: 'individual',
        defaults: { roundsCount: 12, questionsPerRound: 12, pointsPerCorrectAnswer: 1, penaltyPerWrongAnswer: 0 }
    },
    {
        id: 'tdyu_quiz', label: 'TDYU Quiz', implemented: true, clubId: ZAKOVAT_CLUB_ID,
        scoringEngine: 'quiz_mixed', scoringMethod: 'quiz_mixed', tournamentEngine: 'none',
        defaults: { roundRules: TDYU_QUIZ_ROUND_RULES }
    },

    // --- 25-savol club (16): its own dedicated club/project, not a Zakovat sub-type ---
    {
        id: 'quiz_25', label: '25-savol', implemented: true, clubId: QUIZ25_CLUB_ID,
        scoringEngine: 'quiz_mixed', scoringMethod: 'quiz_mixed', tournamentEngine: 'none',
        // stageLeafLabel:'savol' — each stage's items are individual questions (no intermediate Raund
        // grouping level), so Natija kiritish shows Tur -> Savol only, per the canonical terminology.
        defaults: { roundRules: QUIZ_25_ROUND_RULES, stages: QUIZ_25_STAGES, stageLeafLabel: 'savol' }
    },

    // --- UniQuiz club (43): 3-stage (Saralash/Fakultet bosqichi/Final) x 9-round format. One
    // competition spans all 27 rounds back-to-back — "stage totals carry to the final" is just summing
    // the same real roundScores over each stage's range (see UNIQUIZ_STAGES), no separate scoring path. ---
    {
        id: 'uniquiz', label: 'UniQuiz', implemented: true, clubId: UNIQUIZ_CLUB_ID,
        scoringEngine: 'quiz_mixed', scoringMethod: 'quiz_mixed', tournamentEngine: 'none',
        // stageLeafLabel:'raund' — each stage's 9 items are themselves called Raund (per spec: "9 rounds
        // per stage"), so Natija kiritish shows Tur -> Raund, with the actual scoring entry living inside
        // the selected Raund (there is no further real per-Raund Savol split in the data model yet).
        defaults: { roundRules: UNIQUIZ_ROUND_RULES, stages: UNIQUIZ_STAGES, stageLeafLabel: 'raund' }
    },

    // --- Orator Academy & Munozara club (11): debate-family types, all the debate engine ---
    {
        id: 'munozara', label: 'Munozara', implemented: true, clubId: MUNOZARA_CLUB_ID,
        scoringEngine: 'debate', scoringMethod: 'debate', tournamentEngine: 'none',
        defaults: { roundsCount: 1, calculationMethod: 'average', criteria: DEBATE_CRITERIA.map((c, idx) => ({ id: `crit_${idx}`, name: c.name, maxScore: c.max })) }
    },
    {
        id: 'parlament', label: 'Parlament', implemented: true, clubId: MUNOZARA_CLUB_ID,
        scoringEngine: 'debate', scoringMethod: 'debate', tournamentEngine: 'none',
        defaults: { roundsCount: 1, calculationMethod: 'average', criteria: DEBATE_CRITERIA.map((c, idx) => ({ id: `crit_${idx}`, name: c.name, maxScore: c.max })) }
    },
    {
        id: 'bp', label: 'BP (British Parliamentary)', implemented: true, clubId: MUNOZARA_CLUB_ID,
        scoringEngine: 'debate', scoringMethod: 'debate', tournamentEngine: 'none',
        defaults: { roundsCount: 1, calculationMethod: 'average', criteria: DEBATE_CRITERIA.map((c, idx) => ({ id: `crit_${idx}`, name: c.name, maxScore: c.max })) }
    },
    {
        id: 'lincoln_douglas', label: 'Lincoln-Douglas', implemented: true, clubId: MUNOZARA_CLUB_ID,
        scoringEngine: 'debate', scoringMethod: 'debate', tournamentEngine: 'none',
        defaults: { roundsCount: 1, calculationMethod: 'average', criteria: DEBATE_CRITERIA.map((c, idx) => ({ id: `crit_${idx}`, name: c.name, maxScore: c.max })) }
    },
    {
        // Alternative 52-point rubric — same `debate` scoring engine, same DebateCriteriaInputs/
        // DebateChiefJudgePenaltyPanel components, zero new scoring code. Additive alongside (not a
        // replacement for) the 100-point munozara/parlament/bp/lincoln_douglas presets above.
        id: 'munozara_52', label: 'Munozara (52-ball rubrika)', implemented: true, clubId: MUNOZARA_CLUB_ID,
        scoringEngine: 'debate', scoringMethod: 'debate', tournamentEngine: 'none',
        defaults: { roundsCount: 1, calculationMethod: 'average', criteria: DEBATE_CRITERIA_52.map((c, idx) => ({ id: `crit_${idx}`, name: c.name, maxScore: c.max })) }
    },
    {
        // New match-based Munozara engine (debate_match) — real jamoa-vs-jamoa matches (Tasdiqlovchi vs
        // Inkor etuvchi), per-notiq scoring against DEBATE_MATCH_CRITERIA, group + playoff, sibling to
        // Sport's match_play. Additive alongside the 4 debate/munozara_52 presets above — completely
        // separate scoringEngine, zero shared storage shape.
        id: 'munozara_match', label: 'Munozara (Match asosida)', implemented: true, clubId: MUNOZARA_CLUB_ID, participantType: 'team',
        scoringEngine: 'debate_match', scoringMethod: 'debate_match', tournamentEngine: 'group_playoff',
        defaults: { calculationMethod: 'average' }
    },

    // --- TEDxTSUL club (15): its own dedicated club/project ---
    {
        id: 'tedx', label: 'TEDxTSUL', implemented: true, clubId: TEDX_CLUB_ID,
        scoringEngine: 'criteria_based', scoringMethod: 'criteria_based', tournamentEngine: 'none', participantType: 'individual',
        defaults: { roundsCount: 1, calculationMethod: 'average', criteriaInput: "Nutq mahorati, Kontent sifati, Auditoriya bilan aloqa" }
    },

    // --- TSUL Court club (9): court_match format (flexible sides and matchups) ---
    {
        id: 'oral_rounds', label: 'Oral Rounds', implemented: true, clubId: MOOT_COURT_CLUB_ID,
        scoringEngine: 'court_match', scoringMethod: 'court_match', tournamentEngine: 'knockout',
        defaults: { roundsCount: 3, calculationMethod: 'average', isSingleSided: false, sideTLabel: 'Claimant', sideILabel: 'Respondent', criteriaInput: "Huquqiy bilim, Notiqlik mahorati, Hujjat bilan ishlash, Sud tartib-qoidasi, Tayyorgarlik va pozitsiya" }
    },
    {
        id: 'written_memorial', label: 'Written Memorial', implemented: true, clubId: MOOT_COURT_CLUB_ID,
        scoringEngine: 'court_match', scoringMethod: 'court_match', tournamentEngine: 'none',
        defaults: { roundsCount: 1, calculationMethod: 'average', isSingleSided: true, sideTLabel: 'Jamoa', sideILabel: '', criteriaInput: "Huquqiy bilim, Hujjat bilan ishlash, Tayyorgarlik va pozitsiya" }
    },
    {
        id: 'team_moot', label: 'Team Moot', implemented: true, clubId: MOOT_COURT_CLUB_ID,
        scoringEngine: 'court_match', scoringMethod: 'court_match', tournamentEngine: 'knockout',
        defaults: { roundsCount: 3, calculationMethod: 'average', isSingleSided: false, sideTLabel: 'Prosecutor', sideILabel: 'Defense', criteriaInput: "Huquqiy bilim, Notiqlik mahorati, Hujjat bilan ishlash, Sud tartib-qoidasi, Tayyorgarlik va pozitsiya" }
    },
    {
        // TSUL Court — Civil: Claimant vs Respondent, Memorial(30)+Oral(70)=100. Additive, alongside
        // (not replacing) oral_rounds/written_memorial/team_moot above. 4 stages = 4 rounds, one per
        // stage — same display-only `stages` mechanism CompetitionRatingTab.jsx already reads for UniQuiz.
        id: 'tsul_court_civil', label: 'TSUL Court — Civil (Fuqarolik)', implemented: true, clubId: MOOT_COURT_CLUB_ID,
        scoringEngine: 'court_match', scoringMethod: 'court_match', tournamentEngine: 'knockout',
        defaults: {
            roundsCount: 4, calculationMethod: 'average', isSingleSided: false, sideTLabel: 'Claimant', sideILabel: 'Respondent',
            criteria: TSUL_COURT_CIVIL_CRITERIA.map((c, idx) => ({ id: `crit_${idx}`, name: c.name, maxScore: c.max })),
            stages: [
                { label: 'Onlayn test (Saralash)', roundRange: [1, 1] },
                { label: 'Chorak final', roundRange: [2, 2] },
                { label: 'Yarim final', roundRange: [3, 3] },
                { label: 'Final', roundRange: [4, 4] }
            ]
        }
    },
    {
        // TSUL Court — Criminal: one team performs the full process per case (judge/prosecutor/defense/
        // accused/witness/clerk — see db.getCompetitionCaseRoles), same case for all teams, 100-point
        // single rubric.
        id: 'tsul_court_criminal', label: 'TSUL Court — Criminal (Jinoyat)', implemented: true, clubId: MOOT_COURT_CLUB_ID,
        scoringEngine: 'court_match', scoringMethod: 'court_match', tournamentEngine: 'knockout',
        defaults: {
            roundsCount: 4, calculationMethod: 'average', isSingleSided: true, sideTLabel: 'Sudlanuvchi Jamoa', sideILabel: '',
            criteria: TSUL_COURT_CRIMINAL_CRITERIA.map((c, idx) => ({ id: `crit_${idx}`, name: c.name, maxScore: c.max })),
            stages: [
                { label: 'Onlayn test (Saralash)', roundRange: [1, 1] },
                { label: 'Chorak final', roundRange: [2, 2] },
                { label: 'Yarim final', roundRange: [3, 3] },
                { label: 'Final', roundRange: [4, 4] }
            ]
        }
    },

    // --- Performing-arts clubs — each is now its own real club (not merged into one "TSUL ART") ---
    {
        id: 'vokal', label: 'Vokal', implemented: true, clubId: VOKAL_CLUB_ID,
        scoringEngine: 'criteria_based', scoringMethod: 'criteria_based', tournamentEngine: 'none',
        defaults: { roundsCount: 1, calculationMethod: 'average', criteriaInput: "Ovoz sifati, Repertuar, Sahna madaniyati" }
    },
    {
        id: 'raqs', label: 'Raqs', implemented: true, clubId: RAQS_CLUB_ID,
        scoringEngine: 'criteria_based', scoringMethod: 'criteria_based', tournamentEngine: 'none',
        defaults: { roundsCount: 1, calculationMethod: 'average', criteriaInput: "Texnika, Sinxronlik, Sahna madaniyati" }
    },
    {
        id: 'teatr', label: 'Teatr', implemented: true, clubId: TEATR_CLUB_ID,
        scoringEngine: 'criteria_based', scoringMethod: 'criteria_based', tournamentEngine: 'none',
        defaults: { roundsCount: 1, calculationMethod: 'average', criteriaInput: "Ijro mahorati, Rejissura, Sahna madaniyati" }
    },

    // --- Reading/literary/knowledge projects ---
    {
        id: 'zukko_kitobxon', label: 'Zukko kitobxon', implemented: true, clubId: '19',
        scoringEngine: 'correct_answer', scoringMethod: 'correct_answer', tournamentEngine: 'none',
        defaults: { roundsCount: 12, questionsPerRound: 12, pointsPerCorrectAnswer: 1, penaltyPerWrongAnswer: 0 }
    },
    {
        id: 'gafur_gulom_izdoshlari', label: "G'afur G'ulom izdoshlari", implemented: true, clubId: '20',
        scoringEngine: 'criteria_based', scoringMethod: 'criteria_based', tournamentEngine: 'none',
        defaults: { roundsCount: 1, calculationMethod: 'average', criteriaInput: "Ijodkorlik, Mahorat, Taqdimot" }
    },
    {
        id: 'qomus', label: 'Qomus', implemented: true, clubId: '24',
        scoringEngine: 'correct_answer', scoringMethod: 'correct_answer', tournamentEngine: 'none',
        defaults: { roundsCount: 12, questionsPerRound: 12, pointsPerCorrectAnswer: 1, penaltyPerWrongAnswer: 0 }
    },
    {
        id: 'zukko_yurist', label: 'Zukko yurist', implemented: true, clubId: '25',
        scoringEngine: 'criteria_based', scoringMethod: 'criteria_based', tournamentEngine: 'knockout',
        defaults: { roundsCount: 3, calculationMethod: 'average', criteriaInput: "Huquqiy bilim, Mantiq, Nutq mahorati" }
    },
    {
        id: 'kompyuter_savodxonligi', label: 'Kompyuter savodxonligi', implemented: true, clubId: '26',
        scoringEngine: 'correct_answer', scoringMethod: 'correct_answer', tournamentEngine: 'none',
        defaults: { roundsCount: 12, questionsPerRound: 12, pointsPerCorrectAnswer: 1, penaltyPerWrongAnswer: 0 }
    },
    {
        id: 'yurist_loyihasi', label: 'Yurist loyihasi', implemented: true, clubId: '41',
        scoringEngine: 'criteria_based', scoringMethod: 'criteria_based', tournamentEngine: 'knockout',
        defaults: { roundsCount: 3, calculationMethod: 'average', criteriaInput: "Huquqiy bilim, Amaliy ko'nikma, Taqdimot" }
    },
    {
        id: 'miss_leaders', label: 'Miss leaders', implemented: true, clubId: '42',
        scoringEngine: 'criteria_based', scoringMethod: 'criteria_based', tournamentEngine: 'none',
        defaults: { roundsCount: 1, calculationMethod: 'average', criteriaInput: "Liderlik, Notiqlik, Ijodkorlik, Tashqi ko'rinish" }
    },

    // --- Generic single-type clubs/projects (single_score — already a fully working engine) ---
    ...GENERIC_SINGLE_SCORE_CLUBS.map(c => ({
        id: c.presetId, label: c.label, implemented: true, clubId: c.clubId,
        scoringEngine: 'single_score', scoringMethod: 'single_score', tournamentEngine: 'none',
        defaults: { roundsCount: 1, calculationMethod: 'total' }
    })),

    // --- Sport clubs: the 5 group_playoff sports now use the real match_play engine (see
    // db.getCompetitionMatches/computeGroupStandings) — additive, participantType locked to 'team'
    // since match_play is inherently team-vs-team. The remaining 6 (knockout/swiss/none-tournamentEngine
    // sports) are genuinely different formats not built in this pass — left as placeholders, untouched. ---
    ...SPORT_CLUBS.filter(c => c.tournamentEngine === 'group_playoff').map(c => ({
        id: c.presetId, label: c.label, implemented: true, clubId: c.clubId, participantType: 'team',
        scoringEngine: 'match_play', scoringMethod: 'match_play', tournamentEngine: c.tournamentEngine,
        defaults: {}
    })),
    ...SPORT_CLUBS.filter(c => c.tournamentEngine !== 'group_playoff').map(c => ({
        id: c.presetId, label: c.label, implemented: false, clubId: c.clubId,
        scoringEngine: 'single_score', tournamentEngine: c.tournamentEngine
    }))
];

// New, purely structural field — independent of scoringEngine (per the wizard spec: "Yo'nalish degan
// alohida maydon bo'lmasin. Breyn-ring va Oral Rounds allaqachon Turnir turi hisoblanadi").
// Chempionat/Saralash+final used to be listed too, but were never anything but aliases of Liga
// (identical code path, `data.format !== 'cup'`) — no competition ever actually branched on them, so they
// were pure UI noise. Kubok = bir martalik (single overall date window); Liga = mavsumiy (per-Tur dates).
export const FORMATS = [
    { id: 'cup', label: 'Kubok (bir martalik)' },
    { id: 'league', label: 'Liga (mavsumiy)' }
];

// Competition Passport hero card's "Tie-break" display. Deliberately a derived LABEL, not a numeric/
// configurable tie-break system — db.getLeaderboard's tie handling (same-rank-on-tie) is unaffected by
// this and stays exactly as it is. Never fabricate a value here; unrecognized/missing calculationMethod
// falls back to the same neutral copy the leaderboard itself defaults to ('total').
export const getTieBreakLabel = (comp) => {
    if (!comp) return "Yig'indi bo'yicha";
    return comp.calculationMethod === 'average' ? "O'rtacha bo'yicha" : "Yig'indi bo'yicha";
};

// Real Tur (stage) boundaries to use for display purposes anywhere in the app — wizard-computed
// `competition.stages` always wins (League/Cup structure captured at creation time, or a preset's own
// fixed stages like 25-savol/UniQuiz); a correct_answer (Zakovat) competition without one gets a computed
// fallback that groups its existing flat Raund-groups into up to MAX_DISPLAY_TURS Tur. Purely a display
// aggregation — never persisted, never read by scoring math (db.getLeaderboard, computeQuizMixedPoints,
// etc. are all untouched). Shared by TournamentScoring.jsx's Tur selector and CompetitionResultsCenter.jsx's
// round-group labeling, so both always agree on the exact same Tur boundaries for the same competition.
export const MAX_DISPLAY_TURS = 12;

// quiz_mixed presets with a FIXED stage structure (UniQuiz, 25-savol) only get `stages`/`stageLeafLabel`
// copied onto the competition record at creation time (buildCompetitionPayload) — a competition created
// BEFORE that copy existed has neither field, even though its `roundRules` (always present, essential to
// its own scoring) exactly matches one of these known patterns. Matched by comparing `roundRules` content,
// never by roundsCount alone (ambiguous/fragile) — so old data resolves to the exact same real Tur
// breakdown a newly-created competition of the same preset gets, with zero new fields to backfill.
const QUIZ_MIXED_FIXED_STAGE_PATTERNS = [
    { roundRules: UNIQUIZ_ROUND_RULES, stages: UNIQUIZ_STAGES, stageLeafLabel: 'raund' },
    { roundRules: QUIZ_25_ROUND_RULES, stages: QUIZ_25_STAGES, stageLeafLabel: 'savol' }
];
const matchFixedQuizMixedPattern = (competition) => {
    if (!Array.isArray(competition?.roundRules)) return null;
    const match = QUIZ_MIXED_FIXED_STAGE_PATTERNS.find(p =>
        p.roundRules.length === competition.roundRules.length && p.roundRules.every((v, i) => v === competition.roundRules[i])
    );
    if (!match) return null;
    // A competition can share the exact same flat roundRules TYPE sequence as a known preset (e.g. the
    // same 20 standard + 4 risk_optional + 1 fixed_bonus composition 25-savol uses) while genuinely
    // customizing its own Tur/Raund structure via the free-structure "Tur tuzilmasi" builder — either by
    // changing the Tur COUNT (e.g. splitting into 4 Tur instead of 3), or by keeping the SAME 3 Tur but
    // adding real Raund sub-groups WITHIN them (e.g. Tur1's 20 savol split into several Raund — see
    // raundBoundaries in compileStructureToRoundRules). roundRules content alone can't tell any of this
    // apart from "an unmodified 25-savol instance". Either signal — a different stage count, OR a stored
    // stage that carries real raundBoundaries (more than one Raund) — means the admin genuinely built
    // something, so trust competition.stages as-is instead of silently overriding it back to the generic
    // 3-Tur/9-Tur shape (which has neither concept).
    if (Array.isArray(competition.stages) && competition.stages.length > 0) {
        const stageCountDiffers = competition.stages.length !== match.stages.length;
        const hasRealRaundGrouping = competition.stages.some(s => Array.isArray(s.raundBoundaries) && s.raundBoundaries.length > 1);
        if (stageCountDiffers || hasRealRaundGrouping) return null;
    }
    return match;
};

export const getDisplayStages = (competition) => {
    if (!competition) return null;
    // A fixed-preset match (UniQuiz/25-savol) ALWAYS wins, even over a stored `competition.stages` copy —
    // unlike correct_answer's League/Cup stages (genuinely competition-specific, chosen by the admin at
    // creation time and meant to stay exactly as set), these presets' stages are a single, non-custom,
    // identical-for-every-competition structure — so a competition whose `stages` was copied before a
    // label fix (e.g. adding the "N-Tur" prefix) always reflects the CURRENT preset definition instead of
    // a stale frozen-in-time copy.
    const fixedMatch = matchFixedQuizMixedPattern(competition);
    if (fixedMatch) return fixedMatch.stages;
    if (competition.stages && competition.stages.length > 0) return competition.stages;
    if (competition.scoringMethod === 'correct_answer') {
        const perRaund = competition.questionsPerRound || 12;
        const raundCount = Math.ceil((competition.roundsCount || 0) / perRaund);
        if (raundCount <= 1) return null;
        const raundsPerTur = Math.max(1, Math.ceil(raundCount / MAX_DISPLAY_TURS));
        const turCount = Math.ceil(raundCount / raundsPerTur);
        const perTur = raundsPerTur * perRaund;
        return Array.from({ length: turCount }, (_, i) => {
            const start = i * perTur + 1;
            const end = Math.min(start + perTur - 1, competition.roundsCount);
            return { label: `${i + 1}-Tur`, roundRange: [start, end] };
        });
    }
    return null;
};

// Companion to getDisplayStages — same fallback-matching logic (and same "fixed match always wins" rule)
// for the OTHER field a competition needs to fully resolve its Tur/Raund/Savol structure.
export const getDisplayStageLeafLabel = (competition) => {
    if (!competition) return null;
    const fixedMatch = matchFixedQuizMixedPattern(competition);
    if (fixedMatch) return fixedMatch.stageLeafLabel;
    if (competition.stageLeafLabel) return competition.stageLeafLabel;
    return competition.scoringMethod === 'correct_answer' ? 'raund' : 'savol';
};

