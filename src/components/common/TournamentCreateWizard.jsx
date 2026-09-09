import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import Button from './Button';
import StepIndicator from './StepIndicator';
import TournamentBasicStep from './TournamentBasicStep';
import TournamentStructureStep from './TournamentStructureStep';
import TournamentRulesStep from './TournamentRulesStep';
import TournamentReviewStep from './TournamentReviewStep';
import SuccessModal from './SuccessModal';
import { PRESETS, DEBATE_CRITERIA, getDefaultScoringMode, getPresetMode, compileStructureToRoundRules, isMatchBasedEngine } from '../../config/competitionEngines';
import { getRegistrationWindowIssues } from '../activities/RegistrationSettingsFields';

// Fallback criteria for a criteria_based override away from a preset that has no criteriaInput of its
// own (e.g. Step 3's "Baholash rejimi" switched from a quiz/debate/single_score preset to "Mezonli
// baholash") — the existing criteria_based engine logic itself is untouched, this just feeds it a
// sensible default.
const GENERIC_CRITERIA_FALLBACK = 'Mahorat, Sifat, Taqdimot';
// "Hamma o'tadi" (Step 3's advancement Top N "Hamma" tugmasi) resolves to this — comfortably above any
// realistic team/participant pool, so computeFacultyAdvancement's own topN cutoff logic never actually
// cuts anyone off.
const ADVANCEMENT_ALL_SENTINEL = 100000;
import { DEFAULT_REGION } from '../../constants';

const STEPS = [
    { id: 'basic', label: 'Asosiy' },
    { id: 'structure', label: 'Tuzilma' },
    { id: 'rules', label: 'Qoidalar' },
    { id: 'review', label: 'Tavsif' }
];

const DRAFT_KEY = 'uniplatform_tournament_draft';

const buildInitialData = (initialClubId) => ({
    name: '',
    clubId: initialClubId || '',
    // Simple/Professional mode — gates which "Turnir turi" presets Step 1 shows (see availablePresets
    // below). Defaults to 'simple' per spec ("80% of competitions should work in Simple mode").
    mode: 'simple',
    presetId: '',
    // Live Scoring's "Baholash rejimi" — auto-suggested when Turnir turi is picked (Step 1), editable
    // in Step 3. See getDefaultScoringMode() in competitionEngines.js for the suggestion rule.
    scoringMode: 'correct_answer',
    format: 'cup',
    // Musobaqa darajasi — ishtirok baliga koeffitsient beradi (activityLifecycle.js).
    level: 'university',
    visibility: 'open',
    location: '',
    startDate: '',
    startTime: '',
    endTime: '',
    registrationRequired: true,
    // No `registrationType` field here — RegistrationSettingsFields.jsx always renders it locked to
    // `data.type` for tournaments (see TournamentBasicStep.jsx's lockedRegistrationType prop), and
    // buildCompetitionPayload derives the created competition's own registrationType from `data.type`
    // too, so a separate wizard-state copy was dead — never read anywhere.
    maxParticipants: null,
    waitlistEnabled: false,
    approvalRequired: false,
    registrationOpensAt: '',
    registrationClosesAt: '',
    locationType: 'physical',

    type: 'team',
    participantCount: 50,

    // Cup format's real structure: a list of Tur, each Tur containing 1+ Raund (own questionsCount) —
    // matches League's Tur->Raund->Savol model instead of flattening every Raund into its own Tur.
    // Default starting point (both Kubok and Liga): 2 Raund of 12 Savol each — admin adds more as needed.
    cupTurs: [{ id: 1, raunds: [{ id: 1, questionsCount: 12 }, { id: 2, questionsCount: 12 }] }],
    leagueTours: 1,
    // Liga's "Tur andozasi" — one shared Raund pattern (own questionsCount per Raund) repeated
    // identically across every Tur of the season, unlike Kubok's per-Tur individually-built cupTurs.
    leagueRoundTemplate: [{ id: 1, questionsCount: 12 }, { id: 2, questionsCount: 12 }],
    // Sparse per-Tur date override for Liga (mavsumiy) — { [turIndex]: { date, startTime, endTime } }.
    // A Tur with no entry here falls back to Step 1's own startDate + (turIndex-1)*10 kun (admin-only UI,
    // see TournamentStructureStep.jsx) — filling any of them in is optional, never required to proceed.
    leagueTurSchedule: {},
    // Extra numeric penalty amount tied to the free-text "Jarima qoidasi tavsifi" (penaltyRuleNote) —
    // that note describes rule-violation scenarios (lying, stealing another team's question) which are
    // DIFFERENT from the plain per-question wrong-answer penalty above; this gives that description a
    // real number of its own instead of being purely descriptive. Admin-only, like the Tur schedule.
    ruleViolationPenalty: 0,
    // Plain round count for debate/criteria_based/single_score/match_play/debate_match — these never
    // read a Tur/stage grouping (only correct_answer's own Kubok/Liga builder computes real
    // computedStages), so building fake "Turlar" for them was pure busywork that got silently discarded.
    simpleRoundsCount: 1,

    // correct_answer (Zakovat/Breyn-ring) ball/jarima — used to be hardcoded to 1/0 regardless of what a
    // preset's own `defaults.pointsPerCorrectAnswer`/`penaltyPerWrongAnswer` said (dead fields). Now real,
    // admin-editable wizard state; `penaltyRuleNote` is a free-text explanation shown alongside the
    // number wherever judges/admins need to know WHY (e.g. "yolg'on javob uchun -1", "boshqa jamoaning
    // savolini o'g'irlab olsa -2") — the number alone doesn't communicate the real rule.
    pointsPerCorrectAnswer: 1,
    penaltyPerWrongAnswer: 0,
    penaltyRuleNote: '',

    // Ballarni hisoblash formati (correct_answer only) — replaces the old calculationMethod/placesCount
    // pair for this engine specifically (other engines keep those exactly as before, see
    // TournamentRulesStep.jsx). 'points' (Ochkolar bo'yicha) = today's real, already-scoring behavior —
    // raw pointsPerCorrectAnswer/penaltyPerWrongAnswer summed. 'ranking' (Reyting ball) = NEW, not yet
    // wired into real scoring math (db.getLeaderboard) — this only captures the admin's configuration at
    // creation time; the actual per-Tur-placement -> ball computation is a separate follow-up.
    ballFormat: 'points',
    rankingMaxBall: 12,
    rankingMinBall: 1,
    // Ball given to a team that hasn't been ranked yet in a given Tur (bye/not-yet-played) — 0 by default,
    // distinct from rankingMinBall (the worst REAL rank still gets rankingMinBall, not this).
    rankingByeBall: 0,
    // false = bitta Maksimal/Minimal ball butun turnirga; true = har Tur o'z Maksimal/Minimal balliga ega
    // (rankingPerTurTable, sparse {[turIndex]: {maxBall, minBall}}).
    rankingPerTur: false,
    rankingPerTurTable: {},

    // Tay-brek tizimi (Liga kesimida) — correct_answer + Liga (mavsumiy) format only. Decides the OVERALL
    // season winner when multiple teams end tied — separate from CompetitionAdvancementPanel's own
    // tie-break (that one resolves a single boundary/final-placement cutoff, this one is season-wide and
    // configured up front since "Liga" itself is a wizard-level concept that panel doesn't know about).
    // Not yet wired into real scoring math — captured here for the next implementation pass.
    ligaTiebreakMethod: 'placement',
    // Tay-brek (Turlar kesimida) — same idea, scoped to ONE Tur (two teams tied within that Tur's own
    // ranking) rather than the whole season. Only "Qo'shimcha savol"/"Ochkolari bo'yicha" make sense at
    // this granularity — "Yuqori o'rni bo'yicha"/"Jami savol reytingi" are inherently cross-Tur comparisons.
    turTiebreakMethod: 'points',

    // Free-form Bosqich->Tur->Raund structure (quiz-family engines only) — an alternative to picking a
    // fixed preset shape. Off by default so every existing preset (Zakovat/25-savol/UniQuiz/TDYU-Quiz)
    // keeps behaving exactly as before; a coordinator opts in from Step 2 when they need their own counts.
    useFreeStructure: false,
    // "Saralash bosqichlari bormi?" (TournamentStructureStep.jsx) — Ha (default, unchanged behavior) shows
    // today's full Bosqich->Tur->Raund UI; Yo'q collapses it to a flat Tur/Raund/Savol list (still one
    // hidden bosqich underneath, just with no chrome/label shown — see compileStructureToRoundRules).
    hasStages: true,
    structure: { bosqichlar: [{ id: 1, label: '1-bosqich', turlar: [{ id: 1, label: '1-Tur', ruleType: 'standard', raundlar: [{ id: 1, label: '1-Raund', ruleType: 'standard', savolCount: 12 }] }] }] },
    // Per-competition override of the 6 quiz_mixed point tables — null = use the platform default
    // (QUIZ_MIXED_POINTS). Only ever saved onto the competition when useFreeStructure is on.
    pointTables: null,
    // 'none' | 'faculty' | 'course' — an explicit choice (not just a UniQuiz-shape side-effect) that this
    // competition should be run as separate qualifying "games" per faculty/course inside the SAME
    // competition (same tur/raund structure and questions, but advancement to the next Tur is decided
    // per group, not globally) — the real UniQuiz pattern, generalized. Admin/judge-only concept: never
    // shown to participants, only in the creation wizard and the scoring workspace's advancement panel.
    groupingMode: 'none',

    // Hisoblash usuli — the same "Jami Yig'indi Ball" / "O'rtacha Ball" control from the original
    // single-page form; pre-filled from the selected preset's default and editable in Step 3.
    calculationMethod: 'total',

    // Davomat granulligi — faqat jamoaviy criteria_based/single_score musobaqalarda ma'noga ega
    // (TournamentRulesStep.jsx'da shu turlar uchungina ko'rsatiladi). Boshqa barcha motorlarda o'z
    // qulflash birligiga ega (match/notiq lineup) va bu maydonni o'qimaydi.
    attendanceGranularity: 'per_round',

    placesCount: 3,
    teamMinSize: 4,
    teamMaxSize: 6,
    teamCompositionRule: 'mixed',
    teamCourseRule: 'mixed',
    // criteria_based "Baholash shartlari" (Step 2). null = preset's own list is used as-is.
    criteriaList: null,
    allowNewTeamsDuringTournament: true,
    allowRosterChangesDuringTournament: true,
    maxTransfersPerStudent: 2,
    allowStudentSelfLeaveTeam: true,
    restrictions: { byCourse: [], byGender: '', byProfessionalism: '', byFaculty: [], other: '' },

    // Bosqichlar va o'tish qoidalari (quiz_mixed only, e.g. UniQuiz/25-savol) — captured here at creation
    // time but written into the SAME real fields CompetitionAdvancementPanel.jsx already reads/writes
    // (db.setAdvancementRule + competition.advancementTiebreak), right after db.createCompetition
    // succeeds (see handleCreate) — not a separate/parallel config, just pre-filling the real one so the
    // admin doesn't have to re-enter it in the panel afterward. Sparse: { [turBoundary]: { topN } }.
    advancementPlan: {},
    // Ball keyingi bosqichga o'tadimi — hozircha faqat sozlama sifatida saqlanadi (Reyting ball bilan bir
    // xil pattern): "Yo'q" tanlansa ham CompetitionResultsCenter.jsx'ning umumiy ball formulasi
    // o'zgarmaydi (u himoyalangan joy) — bu keyingi, alohida ish sifatida ulanadi.
    advancementBallCarriesOver: true,
    // quiz_mixed'ning o'z, YAGONA va REAL tay-brek qoidasi — comp.advancementTiebreak'ning aynan o'zi
    // (computeFacultyAdvancement HAM, computeFinalPlacement HAM shu bitta maydonni o'qiydi, shuning uchun
    // ikkita alohida "Turlar kesimida"/"Liga kesimida" blok emas, bitta qoida — TournamentRulesStep.jsx).
    // Zakovatning o'z turTiebreakMethod/ligaTiebreakMethod maydonlari buni bilan aralashtirilmaydi.
    advancementTiebreakMethod: 'countback',
    advancementTiebreakLastN: 3,
    advancementTiebreakFallback: 'split',
    // "Qo'shimcha savol" tanlanganda ko'rinadigan "Nechta o'rin uchun" (faqat Yakuniy o'rinlar uchun) —
    // hozircha faqat sozlama, computeFinalPlacement hali buni cheklamaydi.
    finalTiebreakPlacesCount: 3,

    description: '',
    attachment: null
});

// Orchestrates the 4-step tournament creation wizard. Owns all field state and, on final submit,
// ports the exact competition-construction logic the old single-page form used (preset -> scoringMethod/
// scoringEngine/roundRules/criteria derivation, quiz round-count math) — extended with the new wizard
// fields — so nothing about how competitions actually get scored changes.
const TournamentCreateWizard = ({ contextType = null, contextId = null, onCreated, onCancel }) => {
    const { user, clubRoles } = useAuth();

    const role = user?.role === 'ADMINISTRATOR' ? 'ADMINISTRATOR' : 'COORDINATOR_OR_OTHER';
    const isAdmin = role === 'ADMINISTRATOR';
    const coordinatorClubIds = useMemo(
        () => (clubRoles || []).filter(m => ['coordinator', 'head_coordinator'].includes(m.role)).map(m => m.clubId),
        [clubRoles]
    );

    // Only clubs that actually have a competition type scoped to them are real, selectable "klub"
    // options here — generic direction/category clubs (e.g. "Madaniyat va San'at") have zero presets
    // and would otherwise show up as a selectable club with an empty, unusable "Turnir turi" list.
    const allClubs = db.getClubs();
    const clubsWithPresets = allClubs.filter(c => PRESETS.some(p => p.clubId === c.id));
    const visibleClubs = isAdmin ? clubsWithPresets : clubsWithPresets.filter(c => coordinatorClubIds.includes(c.id));
    const isClubLocked = !isAdmin; // coordinators never get the full club list, per the 403 policy in db.js

    const initialClubId = (contextType === 'club' && contextId)
        ? contextId
        : (!isAdmin && coordinatorClubIds.length === 1 ? coordinatorClubIds[0] : '');

    const [currentStep, setCurrentStep] = useState(1);
    const [data, setData] = useState(() => buildInitialData(initialClubId));
    const [errorMsg, setErrorMsg] = useState('');
    const [stepError, setStepError] = useState('');
    const [successComp, setSuccessComp] = useState(null);

    const updateData = (patch) => setData(prev => ({ ...prev, ...patch }));

    // Professional mode sees every preset scoped to the club (simple + professional); Simple mode is
    // restricted to non-professional presets only, so a coordinator picking "Simple" never has to look
    // at Zakovat/Debate/Moot-Court-style options they didn't ask for.
    // A preset with no `clubId` is universal — offered to every club, so a club without its own
    // purpose-built template can still run a plain "N shart, N hakam" competition.
    const availablePresets = useMemo(
        () => PRESETS.filter(p => (!p.clubId || p.clubId === data.clubId) && (data.mode === 'professional' || getPresetMode(p) === 'simple')),
        [data.clubId, data.mode]
    );
    // Some clubs (Zakovat, 25-savol, UniQuiz, TDYU-Quiz, Munozara, Moot Court, every Sport club) have NO
    // "Simple" presets at all — every one of their types classifies as "professional" (see getPresetMode).
    // Picking such a club while still on the default "Oddiy" mode left "Turnir turi" empty with no
    // explanation (real bug, found live). Auto-correcting to "Professional" the moment Simple would show
    // zero options — never the reverse, so a club that genuinely does have Simple presets keeps defaulting
    // to Simple exactly as designed.
    useEffect(() => {
        if (data.mode === 'simple' && data.clubId) {
            const hasSimplePreset = PRESETS.some(p => (!p.clubId || p.clubId === data.clubId) && getPresetMode(p) === 'simple');
            if (!hasSimplePreset) updateData({ mode: 'professional' });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.clubId]);
    const selectedPreset = useMemo(() => PRESETS.find(p => p.id === data.presetId), [data.presetId]);

    // TSUL Court (court_match) presets each describe their OWN real format — Written Memorial/Criminal are
    // performed by one team alone, Civil/Oral Rounds/Team Moot are Claimant-vs-Respondent — but nothing
    // seeded those defaults into the wizard's own state, so Step 2's "O'yin formati" always opened on
    // "Ikki tomonlama" and an admin picking Written Memorial had to notice and fix it by hand. Seeds only
    // on preset change; the admin's own edits afterwards are never overwritten.
    useEffect(() => {
        if (!selectedPreset || selectedPreset.scoringEngine !== 'court_match') return;
        const d = selectedPreset.defaults || {};
        updateData({
            isSingleSided: !!d.isSingleSided,
            sideTLabel: d.sideTLabel || 'Tomon A',
            sideILabel: d.isSingleSided ? '' : (d.sideILabel || 'Tomon B')
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.presetId]);
    const selectedClub = useMemo(() => allClubs.find(c => c.id === data.clubId), [allClubs, data.clubId]);

    // Same resolution rule buildCompetitionPayload uses (Step 3 override wins over the preset default),
    // computed here too so Step 3 can gate the "Davomat granulligi" selector at render time — only
    // meaningful for jamoaviy criteria_based/single_score, where the team gets one shared score and
    // individual show-up isn't otherwise provable.
    const isAttendanceGranularityRelevant = useMemo(() => {
        if (!selectedPreset || data.type !== 'team') return false;
        const isOverridden = data.scoringMode !== getDefaultScoringMode(selectedPreset);
        const resolvedScoringEngine = isOverridden ? data.scoringMode : selectedPreset.scoringEngine;
        return ['criteria_based', 'single_score'].includes(resolvedScoringEngine);
    }, [selectedPreset, data.type, data.scoringMode]);

    // Preview of this competition's real Tur/stage boundaries, BEFORE creation — mirrors exactly the
    // same two sources buildCompetitionPayload's isQuizMixed branch reads (compiled free structure, or
    // the preset's own fixed stages) — so Step 3's "Bosqichlar va o'tish qoidalari" boundary rows match
    // 1:1 what the competition will actually have once created. Empty for every non-quiz_mixed engine.
    const isQuizMixedPreset = selectedPreset?.scoringEngine === 'quiz_mixed';
    const previewStages = useMemo(() => {
        if (!isQuizMixedPreset) return [];
        if (data.useFreeStructure) return compileStructureToRoundRules(data.structure).stages;
        return selectedPreset.defaults?.stages || [];
    }, [isQuizMixedPreset, selectedPreset, data.useFreeStructure, data.structure]);

    // Live "this room is already booked at that time" warning — recomputed whenever location/date/time
    // change, so Step 1 can show it before the user even tries to submit (db.createEvent/createCompetition
    // enforce the same check server-side as a last line of defense — see db.js).
    const locationConflict = useMemo(() => {
        if (!data.location.trim() || !data.startDate) return null;
        return db.checkLocationConflict(data.location, db.combineDateTime(data.startDate, data.startTime));
    }, [data.location, data.startDate, data.startTime]);

    // Returns a list of missing/invalid field labels for the given step (empty = step is valid).
    // Driving the Next button off this (rather than a silent `disabled`) means a click always does
    // something — a disabled button with no explanation just looks broken to the user.
    const getStepIssues = (step) => {
        const issues = [];
        if (step === 1) {
            if (!data.name.trim()) issues.push("Turnir nomi");
            if (!data.clubId) issues.push("Klub");
            if (!data.presetId) issues.push("Turnir turi");
            if (!data.startDate) issues.push("Turnir sanasi");
            // Start AND end time are required: without a real interval a booking can't be checked against
            // the room's other bookings (it would fall back to an assumed 1-hour block), and the half-hour
            // availability strip has nothing to select.
            if (!data.startTime) issues.push("Boshlanish vaqti");
            if (!data.endTime) issues.push("Tugash vaqti");
            if (data.startTime && data.endTime && data.endTime <= data.startTime) {
                issues.push("Tugash vaqti boshlanishdan keyin bo'lishi kerak");
            }
            if (data.registrationRequired && !data.registrationOpensAt) issues.push("Ro'yxatdan o'tish boshlanish vaqti");
            // The wizard only ever creates, never edits — so the past-dating guard always applies here.
            issues.push(...getRegistrationWindowIssues(data, { isNew: true }));
            if (locationConflict) issues.push("O'tkazilish joyi (band)");
        } else if (step === 2) {
            const isQuizMixedPreset = selectedPreset?.scoringEngine === 'quiz_mixed';
            const isCorrectAnswerPreset = selectedPreset?.scoringEngine === 'correct_answer';
            const presetHasOwnStages = !!selectedPreset?.defaults?.stages;
            if (isQuizMixedPreset && data.useFreeStructure) {
                const hasSavol = (data.structure?.bosqichlar || []).some(b =>
                    (b.turlar || []).some(t => (t.raundlar || []).some(r => (r.savolCount || 0) > 0))
                );
                if (!hasSavol) issues.push("Kamida bitta savol (Erkin tuzilma)");
            } else if (isQuizMixedPreset && presetHasOwnStages) {
                // UniQuiz/25-savol-style — fixed by the preset, nothing to validate here.
            } else if (isCorrectAnswerPreset || (isQuizMixedPreset && !presetHasOwnStages)) {
                // Cup/League fields drive turCount for: correct_answer always, and quiz_mixed presets
                // WITHOUT their own fixed stages (TDYU-Quiz-style).
                if (data.format === 'cup' && data.cupTurs.every(t => t.raunds.length === 0)) issues.push("Kamida bitta raund");
                if (data.format !== 'cup' && !(Number(data.leagueTours) > 0 && data.leagueRoundTemplate.length > 0)) {
                    issues.push("Turlar soni va tur andozasi");
                }
            } else if (!isMatchBasedEngine(selectedPreset?.scoringEngine)) {
                // debate/criteria_based/single_score — plain round count only, no Tur/stage concept (see
                // simpleRoundsCount). match_play/debate_match are excluded — their real structure is a
                // post-creation admin action (TournamentStructureStep.jsx's isMatchBased notice), nothing
                // to validate here.
                if (!(Number(data.simpleRoundsCount) > 0)) issues.push("Raundlar soni");
            }
        }
        return issues;
    };

    const goNext = () => {
        const issues = getStepIssues(currentStep);
        if (issues.length > 0) {
            setStepError(`Quyidagi maydonlarni to'ldiring: ${issues.join(', ')}`);
            return;
        }
        setStepError('');
        setCurrentStep(s => Math.min(4, s + 1));
    };
    const goBack = () => { setStepError(''); setCurrentStep(s => Math.max(1, s - 1)); };

    const handleSaveDraft = () => {
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
            alert("Qoralama saqlandi.");
        } catch {
            alert("Qoralamani saqlashda xatolik yuz berdi.");
        }
    };

    const buildCompetitionPayload = () => {
        const preset = selectedPreset;

        // Step 3's "Baholash rejimi" — if the admin left it at what Step 1 auto-suggested, the engine
        // resolves exactly as before (preset.scoringEngine, e.g. still 'quiz_mixed' with its roundRules
        // untouched). If they overrode it to a different family, THAT family becomes the engine instead
        // — existing quiz_mixed/debate/criteria_based logic elsewhere is not touched either way, this
        // only decides which of them gets wired onto the competition.
        const isOverridden = data.scoringMode !== getDefaultScoringMode(preset);
        const resolvedScoringEngine = isOverridden ? data.scoringMode : preset.scoringEngine;
        const resolvedScoringMethod = isOverridden ? data.scoringMode : preset.scoringMethod;

        const isQuizMethod = resolvedScoringEngine === 'correct_answer';
        const isQuizMixed = resolvedScoringEngine === 'quiz_mixed';
        const isDebate = resolvedScoringEngine === 'debate';
        const isCriteriaBased = resolvedScoringEngine === 'criteria_based';
        const isDebateMatch = resolvedScoringEngine === 'debate_match';
        const isCourtMatch = resolvedScoringEngine === 'court_match';

        // Team-type competitions now draw from the REAL, persisted club team roster (db.getClubTeams —
        // same data TeamProfilePage.jsx already shows) instead of ephemeral mock teams, so a team's name
        // can resolve to its real roster/cross-competition history (TeamRosterAndHistory.jsx). Falls back
        // to mock teams only when the club genuinely has none yet (disclosed — not fabricated, just the
        // pre-existing placeholder behavior for a club that hasn't set up real teams). Individual-type
        // competitions are unchanged.
        //
        // Munozara (debate_match) is a deliberate exception, confirmed by the user: its real flow is
        // "musobaqa yaratiladi -> jamoalar SHU musobaqaga ro'yxatdan o'tadi (restrictions/teamMaxSize
        // asosida) -> admin jamoalar soniga qarab guruh yaratadi va taqsimlaydi" — i.e. real registration
        // is the PRIMARY way teams enter this competition, not a pre-fixed roster snapshotted at creation
        // time. Pre-seeding from db.getClubTeams here would mean nothing is ever left to register for
        // (registerForActivity only APPENDS onto whatever's already in comp.participants, it never
        // replaces it — DebateMatchesTab.jsx's own "Guruhlar"/"Jamoalarni tasodifiy taqsimlash" then
        // works against however many teams actually registered). Admin can still add a team directly
        // without going through registration via "Qo'lda qo'shish" (ActivityRegistrationPanel.jsx). Sport
        // (match_play) intentionally keeps the old pre-seeded behavior — same open question could apply
        // there too, but wasn't part of what was asked to change.
        // court_match shares Munozara's registration-first flow for the same reason — its real structure
        // (uchrashuvlar/guruhlar) is built post-creation from whoever actually registered.
        const realClubTeams = (data.type === 'team' && !isDebateMatch && !isCourtMatch) ? db.getClubTeams(data.clubId) : [];
        const selectedParticipants = (isDebateMatch || isCourtMatch)
            ? []
            : data.type === 'team'
                ? (realClubTeams.length > 0
                    ? realClubTeams.slice(0, data.participantCount)
                    : db.getMockTeams().slice(0, data.participantCount))
                : db.getMockStudents().slice(0, data.participantCount);

        // Tur (stage/phase) boundaries — real league/cup structure ("10-12 Tur per season, each Tur has
        // 1-2+ Raund, each Raund has 12+ Savol") preserved as `computedStages` instead of being flattened
        // away into just a total roundsCount, as it silently was before. A preset that already defines
        // its OWN fixed stage boundaries (quiz_25's Tur1/2/3, uniquiz's Saralash/Fakultet/Final) is never
        // overridden by this — those ignore the league/cup wizard fields entirely, exactly as before.
        const presetHasOwnStages = !!preset.defaults?.stages;
        let roundsCount, questionsPerRound, roundRules, computedStages, freeStructureLeafLabel;

        if (isQuizMixed && data.useFreeStructure) {
            // Free-form Bosqich->Tur->Raund builder (TournamentStructureStep.jsx) — compiles straight to
            // the same flat roundRules/stages shape every existing consumer already reads, so nothing
            // downstream (scoring, leaderboard, Tur selector, Results Center) needs to know this
            // competition wasn't built from a fixed preset.
            const compiled = compileStructureToRoundRules(data.structure);
            roundRules = compiled.roundRules;
            roundsCount = roundRules.length;
            computedStages = compiled.stages;
            // 'raund' (UniQuiz-shaped — CompetitionRoundsTab.jsx's isUniQuizStaged, which unlocks the
            // per-guruh advancement panel below, keys off exactly this) when every Raund is its own leaf
            // (savolCount 1 throughout, no further Savol split); 'savol' when any Raund was subdivided
            // (25-savol-shaped). Not a UI choice — it's a real fact about the tree the admin built.
            const allRaundlar = (data.structure.bosqichlar || []).flatMap(b => (b.turlar || []).flatMap(t => t.raundlar || []));
            freeStructureLeafLabel = allRaundlar.every(r => (r.savolCount || 1) === 1) ? 'raund' : 'savol';
        } else if (isQuizMixed) {
            if (presetHasOwnStages) {
                roundRules = preset.defaults.roundRules;
                roundsCount = roundRules.length;
            } else {
                // A quiz_mixed preset without its own stages (TDYU Quiz) played as a League/Cup: its fixed
                // per-Tur rule pattern (e.g. 7 standard + 1 placement + 1 vabank) repeats once per Tur —
                // each Tur is one full playthrough of that pattern, not a subdivision of it. quiz_mixed
                // never gets a further Raund sub-level (unlike correct_answer below) since there's no
                // uniform-questions-per-round concept for it — Tur -> Savol only.
                const turCount = data.format === 'cup' ? (data.cupTurs.length || 1) : (Number(data.leagueTours) || 1);
                const perTur = preset.defaults.roundRules.length;
                roundRules = Array.from({ length: turCount }, () => preset.defaults.roundRules).flat();
                roundsCount = roundRules.length;
                computedStages = Array.from({ length: turCount }, (_, i) => ({
                    label: `${i + 1}-Tur`, roundRange: [i * perTur + 1, (i + 1) * perTur]
                }));
            }
        } else if (isQuizMethod && data.format === 'cup') {
            // Cup's real structure (see TournamentStructureStep.jsx): a list of Tur, each Tur containing
            // 1+ Raund of its own (own questionsCount) — a Tur is NOT the same thing as a single Raund
            // entry (a Zakovat cup can have e.g. 10 Tur with 1-3 Raund each, not 1 Tur per Raund).
            const nonEmptyTurs = data.cupTurs.filter(t => t.raunds.length > 0);
            const allRaunds = nonEmptyTurs.flatMap(t => t.raunds);
            // Existing Results Center round-grouping assumes a uniform per-round question count;
            // the first Raund's count is used as that representative size.
            questionsPerRound = Number(allRaunds[0]?.questionsCount) || 12;
            roundsCount = allRaunds.reduce((sum, r) => sum + (Number(r.questionsCount) || 0), 0);
            // Each Tur's range spans all of its own Raund entries' questions; the existing Raund-group
            // selector further subdivides each Tur's range using questionsPerRound.
            let cursor = 1;
            computedStages = nonEmptyTurs.map((tur, idx) => {
                const turQuestions = tur.raunds.reduce((sum, r) => sum + (Number(r.questionsCount) || 0), 0);
                const stage = { label: `${idx + 1}-Tur`, roundRange: [cursor, cursor + turQuestions - 1] };
                cursor += turQuestions;
                return stage;
            });
        } else if (isQuizMethod) {
            // League's "Tur andozasi" (see TournamentStructureStep.jsx): ONE shared Raund pattern (own
            // questionsCount per Raund) repeated identically across every Tur of the season — unlike
            // Kubok's cupTurs, a league Tur is not individually built, it's the same weekly format N times.
            const template = data.leagueRoundTemplate.length > 0 ? data.leagueRoundTemplate : [{ questionsCount: 12 }];
            const perTurQuestions = template.reduce((sum, r) => sum + (Number(r.questionsCount) || 0), 0);
            const turCount = Number(data.leagueTours) || 1;
            questionsPerRound = Number(template[0]?.questionsCount) || 12;
            roundsCount = perTurQuestions * turCount;
            let cursor = 1;
            computedStages = Array.from({ length: turCount }, (_, i) => {
                const stage = { label: `${i + 1}-Tur`, roundRange: [cursor, cursor + perTurQuestions - 1] };
                cursor += perTurQuestions;
                return stage;
            });
        } else {
            // debate/criteria_based/single_score/match_play/debate_match — none of these ever read a
            // Tur/stage grouping (only correct_answer's own Kubok/Liga above computes real
            // computedStages), so they get a single plain round count instead of the Kubok/Liga UI, which
            // used to build Tur structure here too even though it was always silently discarded.
            roundsCount = Math.max(1, Number(data.simpleRoundsCount) || 1);
        }

        // criteria_based presets normally list a comma-separated `criteriaInput` string, each criterion
        // getting a flat 10-point max (existing behavior, untouched for every preset that only sets
        // criteriaInput). A preset MAY instead provide an explicit, already-shaped `defaults.criteria`
        // array ({id,name,maxScore} — the exact same convention every debate preset already uses) when
        // it needs specific per-criterion weights that don't fit the flat-10 rule — e.g. TSUL Court's
        // Memorial(30)+Oral(70)=100 split. This also fixes a latent bug: the debate branch below used to
        // ALWAYS hardcode the 100-point DEBATE_CRITERIA regardless of which debate preset was actually
        // selected, silently ignoring each preset's own defaults.criteria (invisible before now because
        // every debate preset happened to reuse the same 100-point set — until munozara_52 didn't).
        const criteriaList = isCriteriaBased
            // Step 2's own "Baholash shartlari" editor wins when the admin actually edited it; otherwise
            // the preset's shaped list, otherwise its flat-10 criteriaInput string, exactly as before.
            ? (data.criteriaList?.length ? data.criteriaList : (preset.defaults?.criteria
                || (preset.defaults?.criteriaInput || GENERIC_CRITERIA_FALLBACK).split(',').map((c, idx) => ({ id: `crit_${idx}`, name: c.trim(), maxScore: 10 }))))
            : isDebate
                ? (preset.defaults?.criteria || DEBATE_CRITERIA.map((c, idx) => ({ id: `crit_${idx}`, name: c.name, maxScore: c.max })))
                : [];

        return {
            name: data.name,
            // Informational only — read by the Competition Passport hero's mode badge, doesn't gate any
            // existing scoring/wizard behavior.
            mode: data.mode,
            contextType: 'club',
            contextId: data.clubId,
            type: data.type,
            // Faoliyat darajasi — ishtirok bali koeffitsienti va "xalqaro faoliyat"
            // ko'rsatkichi shundan o'qiladi (activityLifecycle.js).
            level: data.level || 'university',
            scoringMethod: resolvedScoringMethod,
            scoringEngine: resolvedScoringEngine,
            // Saved on the competition record so Live Scoring's engine resolution traces back to what
            // was actually picked/confirmed in Step 3 — see SCORING_MODES in competitionEngines.js.
            scoringMode: data.scoringMode,
            tournamentEngine: preset.tournamentEngine || 'none',
            roundsCount,
            questionsPerRound: isQuizMethod ? questionsPerRound : undefined,
            pointsPerCorrectAnswer: isQuizMethod ? (Number(data.pointsPerCorrectAnswer) || 0) : undefined,
            penaltyPerWrongAnswer: isQuizMethod ? (Number(data.penaltyPerWrongAnswer) || 0) : undefined,
            penaltyRuleNote: isQuizMethod ? data.penaltyRuleNote : undefined,
            ruleViolationPenalty: isQuizMethod ? (Number(data.ruleViolationPenalty) || 0) : undefined,
            // Har Turning sanasi — Zakovat's Liga-only field, reused as-is (same sparse {[turIndex]:
            // {date,startTime,endTime}} shape) for quiz_mixed's own multi-Tur presets (25-savol/UniQuiz),
            // which have real Tur boundaries too even without a Kubok/Liga format concept.
            leagueTurSchedule: ((isQuizMethod && data.format !== 'cup') || isQuizMixed) ? data.leagueTurSchedule : undefined,
            // Ballarni hisoblash formati — correct_answer only, see buildInitialData's own comment.
            ballFormat: isQuizMethod ? data.ballFormat : undefined,
            rankingMaxBall: (isQuizMethod && data.ballFormat === 'ranking') ? Number(data.rankingMaxBall) || 0 : undefined,
            rankingMinBall: (isQuizMethod && data.ballFormat === 'ranking') ? Number(data.rankingMinBall) || 0 : undefined,
            rankingByeBall: (isQuizMethod && data.ballFormat === 'ranking') ? Number(data.rankingByeBall) || 0 : undefined,
            rankingPerTur: (isQuizMethod && data.ballFormat === 'ranking') ? !!data.rankingPerTur : undefined,
            rankingPerTurTable: (isQuizMethod && data.ballFormat === 'ranking' && data.rankingPerTur) ? data.rankingPerTurTable : undefined,
            // Zakovat-only — quiz_mixed has its own, single, real advancementTiebreak* fields instead (see
            // buildInitialData's comment + handleCreate below), not this Zakovat vocabulary.
            ligaTiebreakMethod: (isQuizMethod && data.format !== 'cup') ? data.ligaTiebreakMethod : undefined,
            turTiebreakMethod: isQuizMethod ? data.turTiebreakMethod : undefined,
            // Bosqichlar va o'tish qoidalari (quiz_mixed only) — captured as data even where not yet real
            // (see buildInitialData's own comment) so a future implementation pass has something to read;
            // disclosed to the admin in Step 3 as such.
            advancementBallCarriesOver: isQuizMixed ? !!data.advancementBallCarriesOver : undefined,
            finalTiebreakPlacesCount: isQuizMixed ? (Number(data.finalTiebreakPlacesCount) || 3) : undefined,
            roundRules,
            // Display-only stage (Tur) groupings — preset-fixed (UniQuiz: Saralash/Fakultet bosqichi/Final,
            // 25-savol: 1/2/3-Tur) or computed above from the wizard's own League/Cup/Erkin tuzilma structure
            // (Zakovat, TDYU-Quiz-style, or a 25-savol/UniQuiz competition built via "Erkin tuzilma" —
            // leagueTours/cupRounds/data.structure all become real Tur boundaries instead of being
            // flattened away). computedStages MUST win whenever it was actually computed — a preset having
            // its OWN defaults.stages (25-savol/UniQuiz) does NOT mean the admin used it "Andoza bo'yicha"
            // this time; `preset.defaults?.stages` only applies as the fallback for that unmodified case
            // (real bug found live: the old `preset.defaults?.stages || computedStages` order meant ANY
            // Erkin-tuzilma-built 25-savol/UniQuiz competition silently reverted to the generic fixed
            // andoza on save, discarding the admin's real custom Tur/Raund/Savol counts entirely). Never
            // read by roundGroupCount/leaderboard math, purely display — consumed by Natija kiritish's Tur
            // selector and CompetitionRatingTab.jsx/CompetitionResultsCenter.jsx.
            stages: computedStages || preset.defaults?.stages || undefined,
            // 'savol' | 'raund' — what a stage's individual items should be called in Natija kiritish.
            // Same priority-order fix as `stages` above — freeStructureLeafLabel (computed from the
            // admin's real Erkin tuzilma tree) must win over preset.defaults.stageLeafLabel, not the
            // reverse, for the exact same reason.
            stageLeafLabel: freeStructureLeafLabel || preset.defaults?.stageLeafLabel || (computedStages ? (isQuizMethod ? 'raund' : 'savol') : undefined),
            // Per-competition override of the quiz_mixed point tables (Vabank va h.k.) — only ever set
            // when the free-structure builder was used; every preset-based competition has no
            // `pointTables` field at all, so computeQuizMixedPoints keeps reading the platform default.
            pointTables: (isQuizMixed && data.useFreeStructure && data.pointTables) ? data.pointTables : undefined,
            // Informational — CompetitionRoundsTab.jsx reads this to decide whether to show the per-guruh
            // advancement panel, instead of relying only on the indirect "quiz_mixed + raund-leaf + 2+ Tur"
            // shape check (which is how UniQuiz's own preset gets it, unchanged).
            groupingMode: (isQuizMixed && data.useFreeStructure && data.groupingMode !== 'none') ? data.groupingMode : undefined,
            criteria: criteriaList,
            // Per-competition override of DEBATE_MATCH_CRITERIA (TournamentStructureStep.jsx's
            // "Tahrirlash" editor) — undefined (not saved) unless the admin actually customized it, so
            // every existing/new debate_match competition keeps using the standard 21-row sheet by
            // default (getCriteriaForNotiq/computeNotiqTotal/etc. all fall back to it themselves too).
            debateMatchCriteria: data.debateMatchCriteria || undefined,
            // TSUL Court (court_match) Tomon sozlamalari — collected by TournamentStructureStep.jsx's
            // "Tomon sozlamalari" block but previously never persisted here, so every court competition
            // silently read back as 2-sided with empty labels and an empty rubric. Only written for
            // court_match; every other engine leaves these undefined exactly as before.
            isSingleSided: isCourtMatch ? (data.isSingleSided ?? !!preset.defaults?.isSingleSided) : undefined,
            sideTLabel: isCourtMatch ? (data.sideTLabel || preset.defaults?.sideTLabel || 'Tomon A') : undefined,
            sideILabel: isCourtMatch && !data.isSingleSided ? (data.sideILabel || preset.defaults?.sideILabel || 'Tomon B') : undefined,
            // Same "undefined unless genuinely customized" convention as debateMatchCriteria above — the
            // read side (getCourtMatchCriteria) falls back to the preset's own standard sheet.
            courtMatchCriteria: data.courtMatchCriteria || undefined,
            participants: selectedParticipants,
            judges: ['admin', 'talaba', 'hakam_1', 'hakam_2'],
            calculationMethod: data.calculationMethod,
            // Only meaningful for jamoaviy criteria_based/single_score (see TournamentRulesStep.jsx) —
            // saved regardless for every other engine too since it's a harmless unread default there.
            attendanceGranularity: data.attendanceGranularity,

            format: data.format,
            visibility: data.visibility,
            region: DEFAULT_REGION,
            location: data.location,
            locationType: data.locationType,
            startDate: data.startDate,
            startTime: data.startTime,
            endTime: data.endTime,
            registrationRequired: data.registrationRequired,
            // Tournaments register in whatever mode they're scored in (data.type, fixed in Step 2) —
            // never an independently-chosen registrationType, which could otherwise contradict it.
            registrationType: data.registrationRequired ? data.type : undefined,
            maxParticipants: data.registrationRequired ? data.maxParticipants : null,
            waitlistEnabled: data.registrationRequired ? !!data.waitlistEnabled : false,
            approvalRequired: data.registrationRequired ? !!data.approvalRequired : false,
            registrationOpensAt: data.registrationRequired ? data.registrationOpensAt : '',
            registrationClosesAt: data.registrationRequired ? data.registrationClosesAt : '',
            placesCount: data.placesCount,
            teamMinSize: data.teamMinSize,
            teamMaxSize: data.teamMaxSize,
            teamCompositionRule: data.teamCompositionRule || 'mixed',
            teamCourseRule: data.teamCourseRule || 'mixed',
            allowNewTeamsDuringTournament: data.allowNewTeamsDuringTournament,
            allowRosterChangesDuringTournament: data.allowRosterChangesDuringTournament,
            maxTransfersPerStudent: data.maxTransfersPerStudent,
            allowStudentSelfLeaveTeam: data.allowStudentSelfLeaveTeam,
            restrictions: data.restrictions,
            description: data.description,

            // Consumed + stripped by db.createCompetition's mock "backend" 403 check — never persisted.
            actingUsername: user?.username,
            actingRole: role === 'ADMINISTRATOR' ? 'ADMINISTRATOR' : 'COORDINATOR'
        };
    };

    const handleCreate = async () => {
        setErrorMsg('');
        const issues = [...getStepIssues(1), ...getStepIssues(2)];
        if (issues.length > 0 || !selectedPreset) {
            setErrorMsg(`Turnirni yaratishdan oldin quyidagilarni to'ldiring: ${issues.join(', ') || "Turnir turi"}`);
            return;
        }
        if (data.scoringMode === 'sport') {
            // Defensive guard — the Step 3 "Sport" option is rendered disabled, so this shouldn't be
            // reachable, but sport scoring genuinely doesn't exist yet (see PHASE1 notes).
            setErrorMsg("Sport rejimi hali ishlab chiqilmagan. Iltimos, boshqa baholash rejimini tanlang.");
            return;
        }
        try {
            const created = await db.createCompetition(buildCompetitionPayload());
            // O'tkazilish joyi belgilangan BO'LSA yoki ro'yxatdan o'tish talab qilinsa, turnir avtomatik
            // tarzda Tadbirlar kalendariga (EventManagement.jsx / student's EventsCalendar.jsx) chiqishi
            // uchun tegishli event yozuvi ham yaratiladi — registratsiya talab qilinganda joy bo'sh
            // bo'lsa ham talabalar buni kalendarda ko'rib ro'yxatdan o'ta olishi kerak, shuning uchun
            // shart faqat "joy bor" emas, "joy BOR YOKI ro'yxatdan o'tish kerak" bo'lishi kerak.
            // Musobaqa yaratish muvaffaqiyatli bo'lgach bajariladigan ikkilamchi amal — agar shu qadam
            // biror sababdan muvaffaqiyatsiz bo'lsa ham, turnirning o'zi baribir yaratilgan bo'ladi,
            // shuning uchun xatolik bloklab qo'ymasligi kerak.
            if (data.location.trim() || data.registrationRequired) {
                try {
                    await db.createEvent({
                        clubId: data.clubId,
                        title: data.name,
                        description: data.description || selectedPreset?.label || '',
                        date: db.combineDateTime(data.startDate, data.startTime),
                        status: 'upcoming',
                        location: data.location,
                        locationType: data.locationType,
                        linkedCompetitionId: created.id,
                        // Mirrors the competition's OWN moderation outcome (created.moderationStatus) —
                        // a still-pending competition shouldn't have its auto-linked calendar entry leak
                        // it into the public calendar before an admin actually approves it.
                        actingRole: created.moderationStatus === 'pending' ? 'COORDINATOR' : 'ADMINISTRATOR',
                        actingUsername: user?.username
                    });
                } catch {
                    // Non-fatal — the competition itself was already created successfully.
                }
            }
            // Guruhlash mezoni (Fakultet/Kurs) tanlangan bo'lsa — har bir haqiqiy fakultet/kurs qiymati
            // uchun bitta guruh avtomatik yaratiladi va har bir ishtirokchi shu zahoti o'z guruhiga
            // biriktiriladi, xuddi CompetitionAdvancementPanel.jsx'ning "Avtomatik biriktirish" tugmasi
            // qiladigandek — admin bosqichga kirgach qo'lda hech narsa yaratishi shart bo'lmaydi. Non-fatal
            // — muvaffaqiyatsiz bo'lsa ham, turnirning o'zi baribir yaratilgan bo'ladi, admin keyin panel
            // ichidan qo'lda ham tuzatishi mumkin.
            if (data.groupingMode !== 'none') {
                try {
                    const isTeam = created.type === 'team';
                    const valueFor = (p) => (data.groupingMode === 'faculty'
                        ? (isTeam ? db.inferTeamFaculty(p.id) : p.faculty)
                        : (isTeam ? db.inferTeamCourse(p.id) : p.course));
                    const labelFor = (v) => (data.groupingMode === 'course' ? `${v}-kurs` : v);
                    const distinctValues = [...new Set(created.participants.map(valueFor).filter(v => v != null))];
                    const groupIdByValue = new Map();
                    distinctValues.forEach(v => {
                        const group = db.upsertScoringGroup(created.id, { label: labelFor(v) }, user?.username);
                        groupIdByValue.set(v, group.id);
                    });
                    for (const p of created.participants) {
                        const v = valueFor(p);
                        if (v != null && groupIdByValue.has(v)) {
                            await db.setParticipantGroup(created.id, p.id, groupIdByValue.get(v), user?.username);
                        }
                    }
                } catch {
                    // Non-fatal — admin can create/assign guruhlar by hand from the advancement panel.
                }
            }
            // Bosqichlar va o'tish qoidalari (Step 3, quiz_mixed only) — writes into the SAME real
            // db.setAdvancementRule field CompetitionAdvancementPanel.jsx reads, so whatever Top N was
            // configured here shows up there identically, not a separate preview. Real groups (if
            // groupingMode was set above) are re-fetched fresh rather than reusing groupIdByValue (out of
            // scope here) — db.getScoringGroups(created.id) is exactly what computeFacultyAdvancement
            // itself calls, so this always matches its own "realGroups.length === 0 -> implicit
            // '__global__' group" fallback. Tay-brek usuli — ONE real value (comp.advancementTiebreak),
            // written here so it's set the moment the competition exists; both computeFacultyAdvancement
            // (per-boundary) and computeFinalPlacement (yakuniy o'rinlar) read this exact same field, which
            // is exactly why Step 3 now presents it as one rule instead of two separate ones.
            if (isQuizMixedPreset && previewStages.length > 1) {
                try {
                    await db.updateCompetition(created.id, {
                        advancementTiebreak: {
                            primaryMethod: data.advancementTiebreakMethod,
                            lastN: Number(data.advancementTiebreakLastN) || 3,
                            fallbackMethod: data.advancementTiebreakFallback
                        }
                    });
                } catch {
                    // Non-fatal — falls back to DEFAULT_ADVANCEMENT_TIEBREAK, editable later from the panel.
                }
                // "Hamma" (rule.topN === 'all') — admin doesn't know the real registered count yet at
                // creation time, so it resolves to a sentinel comfortably above any realistic pool size;
                // computeFacultyAdvancement's own existing "topN >= pool size -> every cluster fits ->
                // everyone advances" behavior does the rest — no new code path, same real function.
                const resolveTopN = (rawTopN) => (rawTopN === 'all' ? ADVANCEMENT_ALL_SENTINEL : Number(rawTopN));
                const hasAnyTopN = Object.values(data.advancementPlan || {}).some(r => r?.topN === 'all' || Number(r?.topN) > 0);
                if (hasAnyTopN) {
                    try {
                        const realGroups = db.getScoringGroups(created.id);
                        const targetGroupIds = realGroups.length > 0 ? realGroups.map(g => g.id) : ['__global__'];
                        for (const [turBoundary, rule] of Object.entries(data.advancementPlan)) {
                            if (rule?.topN !== 'all' && !(Number(rule?.topN) > 0)) continue;
                            const topN = resolveTopN(rule.topN);
                            for (const groupId of targetGroupIds) {
                                await db.setAdvancementRule(created.id, Number(turBoundary), groupId, topN, user?.username);
                            }
                        }
                    } catch {
                        // Non-fatal — admin can set Top N by hand from the advancement panel.
                    }
                }
            }
            setSuccessComp(created);
        } catch (err) {
            setErrorMsg(err?.status === 403
                ? "Sizga bu klub uchun turnir yaratishga ruxsat berilmagan."
                : (err?.message || "Turnirni yaratishda xatolik yuz berdi."));
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <StepIndicator currentStep={currentStep} steps={STEPS} />

            {(errorMsg || stepError) && (
                <div className="mx-6 mt-4 flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-100 rounded-2xl text-sm font-semibold text-red-600">
                    <AlertTriangle size={16} className="shrink-0" />
                    {errorMsg || stepError}
                </div>
            )}

            <div className="p-6">
                {currentStep === 1 && (
                    <TournamentBasicStep
                        data={data}
                        onChange={updateData}
                        clubs={visibleClubs}
                        isClubLocked={isClubLocked && visibleClubs.length <= 1}
                        availablePresets={availablePresets}
                        locationConflict={locationConflict}
                    />
                )}
                {currentStep === 2 && (
                    <TournamentStructureStep data={data} onChange={updateData} selectedPreset={selectedPreset} isAdmin={isAdmin} />
                )}
                {currentStep === 3 && (
                    <TournamentRulesStep
                        data={data}
                        onChange={updateData}
                        showAttendanceGranularity={isAttendanceGranularityRelevant}
                        isCorrectAnswer={selectedPreset?.scoringEngine === 'correct_answer'}
                        turCount={data.format === 'cup' ? data.cupTurs.length : (Number(data.leagueTours) || 1)}
                        isQuizMixed={isQuizMixedPreset}
                        // Munozara/TSUL Court: the whole engine (uchrashuvlar, notiq slotlari, hakam
                        // bayonnomasi) is fixed by the preset — offering a "Baholash rejimi" switcher here
                        // would let an admin silently break it, so that one control is hidden for them.
                        isMatchEngine={['debate_match', 'court_match'].includes(selectedPreset?.scoringEngine)}
                        advancementStages={previewStages}
                    />
                )}
                {currentStep === 4 && (
                    <TournamentReviewStep data={data} onChange={updateData} club={selectedClub} preset={selectedPreset} />
                )}
            </div>

            <div className="flex gap-3 px-6 pb-6">
                <Button variant="outline" className="flex-1 justify-center" disabled={currentStep === 1} onClick={goBack}>
                    Avvalgisi
                </Button>
                {currentStep < 4 ? (
                    <Button variant="primary" className="flex-1 justify-center bg-indigo-600" onClick={goNext}>
                        Keyingisi
                    </Button>
                ) : (
                    <>
                        <Button variant="outline" className="flex-1 justify-center" onClick={handleSaveDraft}>
                            Qoralama saqlash
                        </Button>
                        <Button variant="primary" className="flex-1 justify-center bg-indigo-600" onClick={handleCreate}>
                            Turnirni yaratish
                        </Button>
                    </>
                )}
            </div>

            {onCancel && currentStep === 1 && (
                <div className="px-6 pb-6 text-center">
                    <button type="button" onClick={onCancel} className="text-xs font-semibold text-gray-400 hover:text-gray-600">
                        Bekor qilish
                    </button>
                </div>
            )}

            <SuccessModal
                isOpen={!!successComp}
                onClose={() => successComp && onCreated?.(successComp)}
                onOpenTournament={() => onCreated?.(successComp)}
                shareUrl={successComp ? `${window.location.origin}/admin/competitions/${successComp.id}` : ''}
            />
        </div>
    );
};

export default TournamentCreateWizard;
