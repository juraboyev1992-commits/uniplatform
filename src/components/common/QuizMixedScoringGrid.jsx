import React, { useMemo, useState } from 'react';
import { Lock, Unlock, Eye, EyeOff } from 'lucide-react';
import { QUIZ_MIXED_ROUND_TYPES, computeQuizMixedPoints, getEffectivePointsTable } from '../../config/competitionEngines';
import QuizMixedScoringInput from './QuizMixedScoringInput';
import { db } from '../../services/db';

// UniQuiz-style (quiz_mixed with real Tur stages) "Natija kiritish" grid — same spreadsheet SHAPE as
// QuizScoringGrid.jsx (Zakovat) for entry convenience, but each Raund is the leaf scoring unit here (no
// further Savol split — see stageLeafLabel in TournamentScoring.jsx), so columns are Raund1..RaundN of the
// currently selected Tur, and each cell is the EXACT existing QuizMixedScoringInput widget — the same
// component the old one-round-at-a-time table already used, so every rule type (standard/placement/
// vabank/risk_optional/fixed_bonus) keeps its real, unchanged computeQuizMixedPoints scoring. Writes go
// straight through db.saveRoundScores per cell — the grid spans many `round` values at once, same reason
// QuizScoringGrid.jsx doesn't reuse the single-round debounced-autosave machinery (see that file).
// `locked`/`onToggleLock`/`hideResults`/`onToggleHideResults` mirror QuizScoringGrid.jsx's own Turni
// qulflash/Natijalarni yashirish controls exactly — TournamentScoring.jsx computes both states the same
// way for this grid (batch-locking every raw round in the selected Tur at once, since CompetitionRoundsTab
// already gives UniQuiz one lock record per raw round, not per group). hideResults never masks anything
// HERE (whoever has scoring access always sees real numbers in Natija kiritish) — it only affects
// participant-facing views elsewhere, same established rule as QuizScoringGrid.
const QuizMixedScoringGrid = ({
    competition, participants, activeJudge, device, roundNumbers, totalRoundNumbers, onScoresChanged,
    locked = false, hideResults = false, onToggleLock, onToggleHideResults, columnSuffix = 'R'
}) => {
    const [version, setVersion] = useState(0);

    // `roundNumbers` = which raund columns are actually RENDERED (a judge can narrow this to a single
    // raund via TournamentScoring.jsx's Raund selector). `allRoundNumbers` = the whole Tur's own range,
    // used for fetching scores and computing "Jami" so the total stays a real running total for the
    // whole Tur even when only one column is visible — falls back to `roundNumbers` if the caller
    // doesn't pass a separate `totalRoundNumbers` (keeps this component usable standalone).
    const allRoundNumbers = totalRoundNumbers || roundNumbers;

    const scoresByRound = useMemo(() => {
        const all = db.getCompetitionScores(competition.id).filter(s => s.judge === activeJudge && allRoundNumbers.includes(s.round));
        const map = new Map(); // roundIndex -> Map(participantId -> value)
        allRoundNumbers.forEach(r => map.set(r, new Map()));
        all.forEach(s => map.get(s.round)?.set(s.participantId, s.value));
        return map;
    }, [competition.id, activeJudge, allRoundNumbers, version]);

    const handleChange = async (participantId, round, value) => {
        if (locked) return;
        await db.saveRoundScores(competition.id, round, activeJudge, [{ participantId, value, criteriaScores: {} }], device);
        setVersion(v => v + 1);
        onScoresChanged?.();
    };

    const participantName = (p) => (competition.type === 'team' ? p.name : p.fullName);
    const ruleTypeOf = (round) => (competition.roundRules && competition.roundRules[round - 1]) || 'standard';
    const ruleTypeLabel = (round) => QUIZ_MIXED_ROUND_TYPES.find(t => t.id === ruleTypeOf(round))?.label || ruleTypeOf(round);

    // Sizing each column to what its own widget actually needs (instead of a uniform width) — UniQuiz's
    // 7 narrow standard (checkmark-only) + 1 placement + 1 vabank per Tur was the original case; 25-savol's
    // risk_optional (3-button Plyus/Minus + To'g'ri/Noto'g'ri + Bo'sh row, see QuizMixedScoringInput) needs
    // similar room to placement, wider than a plain checkmark cell.
    const colWidthClass = (round) => {
        const rt = ruleTypeOf(round);
        if (rt === 'vabank') return 'w-52';
        if (rt === 'risk_optional') return 'w-44';
        if (rt === 'placement') return 'w-32';
        return 'w-14';
    };

    // Real per-participant total across the WHOLE Tur (allRoundNumbers) — same computeQuizMixedPoints
    // db.getLeaderboard already uses for the competition-wide total, just summed over this Tur's own
    // Raund range. Deliberately NOT scoped to the currently-displayed `roundNumbers` — narrowing the
    // grid to a single raund shouldn't make "Jami" collapse to just that one raund's value.
    const pointsTable = getEffectivePointsTable(competition);
    const totalFor = (participantId) => allRoundNumbers.reduce(
        (sum, r) => sum + computeQuizMixedPoints(ruleTypeOf(r), scoresByRound.get(r)?.get(participantId), pointsTable),
        0
    );

    return (
        <div className="space-y-3">
            {/* Turni qulflash / Natijalarni yashirish — same row/style QuizScoringGrid.jsx uses */}
            <div className="flex items-center gap-2 flex-wrap">
                <button
                    type="button"
                    onClick={onToggleLock}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 transition-colors"
                >
                    {locked ? <Unlock size={14} /> : <Lock size={14} />}
                    {locked ? 'Turni qulfdan chiqarish' : 'Turni qulflash'}
                </button>
                <button
                    type="button"
                    onClick={onToggleHideResults}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                        hideResults ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50'
                    }`}
                >
                    {hideResults ? <EyeOff size={14} /> : <Eye size={14} />}
                    Natijalarni yashirish
                </button>
            </div>

            <div className="border rounded-2xl overflow-hidden">
            <div className="max-h-[600px] overflow-auto">
                <table className="table-fixed text-left border-collapse text-sm">
                    <thead className="bg-slate-50 sticky top-0 z-10 text-xs font-bold text-gray-500 uppercase">
                        <tr>
                            <th className="p-2 border-b border-r border-gray-200 w-28 text-left">Jamoa</th>
                            {roundNumbers.map((r) => {
                                const rt = ruleTypeOf(r);
                                // Local label always reflects the round's real position within the WHOLE
                                // Tur (allRoundNumbers), not its position within the currently-displayed
                                // subset — so narrowing to a single raund still shows e.g. "5-R", not "1-R".
                                const localIdx = allRoundNumbers.indexOf(r) + 1;
                                return (
                                    <th key={r} className={`p-1.5 border-b border-r border-gray-200 text-center ${colWidthClass(r)}`}>
                                        <div className="text-[10px]">{localIdx}-{columnSuffix}</div>
                                        {rt !== 'standard' && (
                                            <div className="text-[8px] font-semibold text-gray-400 normal-case truncate">{ruleTypeLabel(r)}</div>
                                        )}
                                    </th>
                                );
                            })}
                            <th className="p-2 border-b text-center w-14">Jami</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {participants.map(p => (
                            <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="p-2 border-r border-gray-100 font-semibold text-gray-800 truncate" title={participantName(p)}>{participantName(p)}</td>
                                {roundNumbers.map(r => {
                                    const value = scoresByRound.get(r)?.get(p.id);
                                    return (
                                        <td key={r} className={`p-1 border-r border-gray-100 text-center ${colWidthClass(r)}`}>
                                            <QuizMixedScoringInput
                                                ruleType={ruleTypeOf(r)}
                                                value={value}
                                                onChange={(v) => handleChange(p.id, r, v)}
                                                disabled={locked}
                                                points={pointsTable}
                                            />
                                        </td>
                                    );
                                })}
                                <td className="p-2 text-center font-extrabold text-indigo-600 text-xs">{totalFor(p.id)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            </div>
        </div>
    );
};

export default QuizMixedScoringGrid;
