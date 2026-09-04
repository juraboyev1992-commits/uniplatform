import React from 'react';
import { Check, X as XIcon } from 'lucide-react';
import { QUIZ_MIXED_POINTS } from '../../config/competitionEngines';

// Live Scoring control for one participant row of a `quiz_mixed` competition (TDYU Quiz / 25-savol).
// The control shown depends entirely on the current round's rule type — `onChange` always replaces
// the whole value for this participant (mirrors toggleCorrectAnswer/setSingleScore's setLocalScores
// pattern), so the save path (handleSaveScores -> db.saveRoundScores) needs no changes.
// `points` — optional per-competition override (competition.pointTables via getEffectivePointsTable),
// defaults to the global QUIZ_MIXED_POINTS so every existing caller that doesn't pass it renders exactly
// as before.
const QuizMixedScoringInput = ({ ruleType, value, onChange, disabled = false, points = QUIZ_MIXED_POINTS }) => {
    if (ruleType === 'standard' || ruleType === 'fixed_bonus') {
        // Simple check/cross toggle, same shape as Zakovat's grid — no "To'g'ri"/"Noto'g'ri" text, the
        // point value is still real (QUIZ_MIXED_POINTS[ruleType]) and shown wherever a total is summed
        // (e.g. QuizMixedScoringGrid's "Jami" column), just not spelled out on every single cell.
        const isCorrect = value === true;
        const isWrong = value === false;
        return (
            <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(isCorrect ? false : true)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center mx-auto transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    isCorrect
                        ? 'bg-emerald-100 text-emerald-600'
                        : isWrong
                            ? 'bg-rose-100 text-rose-600'
                            : 'bg-slate-50 text-gray-300 hover:bg-slate-100'
                }`}
            >
                {isCorrect ? <Check size={16} /> : isWrong ? <XIcon size={16} /> : '–'}
            </button>
        );
    }

    if (ruleType === 'placement') {
        const options = [
            { id: 1, label: `1-o'rin (+${points.placement[1]})` },
            { id: 2, label: `2-o'rin (+${points.placement[2]})` },
            { id: 3, label: `3-o'rin (+${points.placement[3]})` },
            { id: 'other', label: `Boshqa (${points.placement.other})` }
        ];
        return (
            <select
                disabled={disabled}
                className="px-3 py-1.5 border rounded-xl text-xs font-bold text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                value={value ?? 'other'}
                onChange={e => {
                    const v = e.target.value === 'other' ? 'other' : Number(e.target.value);
                    onChange(v);
                }}
            >
                {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
        );
    }

    if (ruleType === 'vabank') {
        // Single-click 4-outcome grid (replaces the old "toggle risk, then toggle correct" two-button
        // flow — same underlying {risk,correct} shape/onChange contract, same computeQuizMixedPoints
        // formula (QUIZ_MIXED_POINTS.vabank), just one click sets both dimensions at once so the scorer
        // can't end up in a half-set state). Default {risk:false,correct:false} for an unset cell
        // matches the exact same fallback the old widget used — "Oddiy ✗" shows as the active option
        // for a not-yet-scored cell, same as before.
        const v = (value && typeof value === 'object') ? value : { risk: false, correct: false };
        const options = [
            { risk: false, correct: false, label: "Oddiy", mark: '✗', points: points.vabank.safeWrong, activeClass: 'bg-slate-500 text-white shadow-sm' },
            { risk: false, correct: true, label: "Oddiy", mark: '✓', points: points.vabank.safeCorrect, activeClass: 'bg-emerald-500 text-white shadow-sm' },
            { risk: true, correct: false, label: "Vabank", mark: '✗', points: points.vabank.riskWrong, activeClass: 'bg-rose-500 text-white shadow-sm' },
            { risk: true, correct: true, label: "Vabank", mark: '✓', points: points.vabank.riskCorrect, activeClass: 'bg-amber-500 text-white shadow-sm' }
        ];
        return (
            <div className="grid grid-cols-2 gap-1 w-full max-w-[176px] mx-auto">
                {options.map(opt => {
                    const isActive = v.risk === opt.risk && v.correct === opt.correct;
                    return (
                        <button
                            key={`${opt.risk}-${opt.correct}`}
                            type="button"
                            disabled={disabled}
                            onClick={() => onChange({ risk: opt.risk, correct: opt.correct })}
                            className={`px-1.5 py-1.5 rounded-lg font-bold text-[10px] leading-tight transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                isActive ? opt.activeClass : 'bg-slate-100 text-gray-500 hover:bg-slate-200'
                            }`}
                        >
                            {opt.label} {opt.mark}
                            <br />
                            {opt.points >= 0 ? `+${opt.points}` : opt.points}
                        </button>
                    );
                })}
            </div>
        );
    }

    if (ruleType === 'risk_optional') {
        const v = (value && typeof value === 'object') ? value : { plus: false, correct: false, blank: false };
        const pointsPreview = v.blank
            ? 0
            : v.plus
                ? (v.correct ? points.risk_optional.plusCorrect : points.risk_optional.plusWrong)
                : (v.correct ? points.risk_optional.minusCorrect : points.risk_optional.minusWrong);
        return (
            <div className="flex items-center justify-center gap-1.5">
                <button
                    type="button"
                    disabled={disabled || v.blank}
                    onClick={() => onChange({ ...v, plus: !v.plus, blank: false })}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        v.plus ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-gray-500 hover:bg-slate-200'
                    }`}
                >
                    {v.plus ? 'Plyus' : 'Minus'}
                </button>
                <button
                    type="button"
                    disabled={disabled || v.blank}
                    onClick={() => onChange({ ...v, correct: !v.correct, blank: false })}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        v.correct ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-100 text-gray-500 hover:bg-slate-200'
                    }`}
                >
                    {v.correct ? "To'g'ri" : "Noto'g'ri"}
                </button>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange({ plus: false, correct: false, blank: !v.blank })}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        v.blank ? 'bg-gray-500 text-white shadow-sm' : 'bg-slate-100 text-gray-500 hover:bg-slate-200'
                    }`}
                >
                    Bo'sh
                </button>
                <span className="text-[10px] font-bold text-gray-400 ml-1">{pointsPreview >= 0 ? `+${pointsPreview}` : pointsPreview}</span>
            </div>
        );
    }

    return null;
};

export default QuizMixedScoringInput;
