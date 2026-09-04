import React, { useMemo, useState } from 'react';
import { X, UserCheck, Star } from 'lucide-react';
import {
    NOTIQ_SLOTS, DEBATE_MATCH_CATEGORIES, DEBATE_MATCH_CRITERIA,
    COURT_MATCH_CATEGORIES, getCourtSlots, getCourtMatchCriteria,
    computeNotiqTotal, computeNotiqMaxScore, aggregateNotiqAcrossJudges
} from '../../config/competitionEngines';
import { db } from '../../services/db';

// One score cell. Keeps its OWN draft string while the judge is typing and only writes on blur/Enter, so:
//   * a half-typed number is never clamped mid-keystroke (typing "12" into a max-15 box used to become
//     "1" then "12"→ok, but into a max-3 box it fought you at every digit),
//   * the box can be emptied (Number('') || 0 previously forced an instant 0, making it impossible to
//     clear or retype a value),
//   * each keystroke no longer triggers a save round-trip — only leaving the cell does.
// The clamp still applies, just at commit time, so nothing out of range can be stored.
const ScoreCell = ({ value, min, max, onCommit }) => {
    const [draft, setDraft] = useState(String(value ?? 0));
    const [editing, setEditing] = useState(false);

    // While not focused, always mirror the stored value (e.g. after switching judge or match).
    const shown = editing ? draft : String(value ?? 0);

    const commit = () => {
        setEditing(false);
        if (draft.trim() === '') { onCommit(0); return; }
        const parsed = Number(draft);
        if (Number.isNaN(parsed)) { onCommit(value ?? 0); return; }
        onCommit(Math.max(min, Math.min(max, parsed)));
    };

    return (
        <input
            type="number"
            min={min}
            max={max}
            value={shown}
            onFocus={() => { setDraft(String(value ?? 0)); setEditing(true); }}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            className="w-14 px-1.5 py-1 border rounded-lg text-center text-xs font-semibold"
        />
    );
};

// `inline`: render just the header + grid, with no full-screen overlay and no close button — used by the
// "Baholash" tab, which already owns its own match picker and page chrome. Default (false) keeps the
// original modal behavior the Raundlar tab's per-match "Baholash" button relies on.
const DebateNotiqScoringPanel = ({ competition, match, onClose, onChanged, inline = false }) => {
    const [activeJudge, setActiveJudge] = useState(competition.judges?.[0] || '');
    const [version, setVersion] = useState(0);

    const isCourt = competition.scoringMethod === 'court_match';
    // Slots and rubric both come from the shared resolvers so this grid can never disagree with the
    // score db.finishDebateMatch actually computes. (This previously read db.TSUL_COURT_*_CRITERIA, which
    // don't exist on db — so an uncustomized court competition rendered an empty criteria table.)
    const slots = isCourt ? getCourtSlots(competition) : NOTIQ_SLOTS;
    const criteria = isCourt
        ? getCourtMatchCriteria(competition)
        : (competition.debateMatchCriteria || DEBATE_MATCH_CRITERIA);
    const categories = isCourt ? COURT_MATCH_CATEGORIES : DEBATE_MATCH_CATEGORIES;

    const lineup = useMemo(() => db.getDebateMatchLineup(match.id), [match.id, version]);
    const memberFor = (slot) => lineup.find(l => l.notiqSlot === slot)?.member || null;

    const allScores = useMemo(() => db.getDebateNotiqScores(match.id), [match.id, version]);
    const rawFor = (slot, judge) => allScores.find(s => s.notiqSlot === slot && s.judge === judge)?.criteriaScores || {};

    const picks = useMemo(() => db.getDebateBestSpeakerPicks(match.id), [match.id, version]);

    const refresh = () => { setVersion(v => v + 1); onChanged?.(); };

    const handleCriteriaChange = async (slot, criterionId, value) => {
        const current = rawFor(slot, activeJudge);
        // Tabbing through cells without editing shouldn't cost a write.
        if ((current[criterionId] ?? 0) === value) return;
        await db.saveDebateNotiqScores(match.id, slot, activeJudge, { ...current, [criterionId]: value });
        refresh();
    };

    const handlePick = async (side, slot) => {
        await db.setDebateBestSpeakerPick(match.id, side, slot, activeJudge);
        refresh();
    };

    const teamName = (id) => competition.participants.find(p => p.id === id)?.name || id;
    const applicable = (crit, slot) => crit.appliesTo === 'all' || !crit.appliesTo || crit.appliesTo.includes(slot);

    const Shell = ({ children }) => (inline
        ? <div className="bg-white rounded-2xl border border-gray-200 w-full flex flex-col overflow-hidden">{children}</div>
        : (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[1400px] max-h-[90vh] flex flex-col overflow-hidden">{children}</div>
            </div>
        )
    );

    return (
        <Shell>
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-b shrink-0">
                    <div>
                        <h3 className="font-bold text-sm text-gray-900">
                            {teamName(match.teamTId)} {!competition.isSingleSided && <><span className="text-gray-400 font-normal">vs</span> {teamName(match.teamIId)}</>}
                        </h3>
                        <p className="text-[11px] text-gray-400">Baholash bayonnomasi</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl">
                            <UserCheck size={14} className="text-indigo-600" />
                            <select
                                value={activeJudge}
                                onChange={e => setActiveJudge(e.target.value)}
                                className="bg-transparent text-xs font-bold text-gray-900 border-none p-0 focus:ring-0 focus:outline-none cursor-pointer"
                            >
                                {(competition.judges || []).map(j => <option key={j} value={j}>{j}</option>)}
                            </select>
                        </div>
                        {!inline && (
                            <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
                                <X size={18} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-auto p-4">
                    <table className="w-full text-left border-collapse text-xs table-fixed">
                        <colgroup>
                            <col className="w-56" />
                            {slots.map(s => <col key={s} className="w-32" />)}
                        </colgroup>
                        <thead className="sticky top-0 bg-white z-10">
                            <tr>
                                <th className="p-2 border-b"></th>
                                {slots.map(slot => {
                                    // TSUL Court scores the TEAM (one column per side), Munozara scores an
                                    // individual notiq (one column per speaker slot) — so the two label the
                                    // same column from different sources: side label + team name vs slot +
                                    // the roster member assigned to that slot.
                                    const isISide = slot.startsWith('I');
                                    const heading = isCourt
                                        ? (competition.isSingleSided
                                            ? (competition.sideTLabel || 'Jamoa')
                                            : (isISide ? (competition.sideILabel || 'Tomon B') : (competition.sideTLabel || 'Tomon A')))
                                        : slot;
                                    const subheading = isCourt
                                        ? teamName(isISide ? match.teamIId : match.teamTId)
                                        : (memberFor(slot)?.fullName || 'Notiq tanlanmagan');
                                    return (
                                        <th key={slot} className="p-2 border-b text-center">
                                            <div className={`text-[10px] font-bold ${isISide ? 'text-rose-600' : slot.startsWith('J') ? 'text-emerald-600' : 'text-indigo-600'}`}>{heading}</div>
                                            <div className="text-[11px] font-semibold text-gray-700 truncate normal-case" title={subheading}>
                                                {subheading}
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map(cat => (
                                <React.Fragment key={cat.id}>
                                    <tr>
                                        <td colSpan={slots.length + 1} className="pt-3 pb-1 px-2 text-[11px] font-bold text-gray-500 uppercase">{cat.label}</td>
                                    </tr>
                                    {criteria.filter(c => c.category === cat.id || isCourt).map(crit => (
                                        <tr key={crit.id} className="border-b border-gray-50">
                                            <td className={`p-2 text-[11px] font-medium text-gray-700 ${crit.parent ? 'pl-6 text-gray-500' : ''}`}>
                                                {crit.name}
                                                <span className="text-gray-300 ml-1">
                                                    ({crit.kind === 'penalty' ? `-${crit.max || crit.maxScore}` : crit.kind === 'bonus' ? `+${crit.max || crit.maxScore}` : crit.max || crit.maxScore})
                                                </span>
                                            </td>
                                            {slots.map(slot => {
                                                if (!applicable(crit, slot)) {
                                                    return <td key={slot} className="p-1 text-center bg-slate-50/60 text-gray-300">—</td>;
                                                }
                                                const raw = rawFor(slot, activeJudge);
                                                const value = raw[crit.id] ?? 0;
                                                const maxVal = crit.max || crit.maxScore || 10;
                                                const min = crit.kind === 'penalty' ? -maxVal : 0;
                                                const max = crit.kind === 'penalty' ? 0 : maxVal;
                                                return (
                                                    <td key={slot} className="p-1 text-center">
                                                        <ScoreCell
                                                            key={`${slot}-${crit.id}-${activeJudge}`}
                                                            value={value}
                                                            min={min}
                                                            max={max}
                                                            onCommit={n => handleCriteriaChange(slot, crit.id, n)}
                                                        />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                            <tr className="bg-slate-50">
                                <td className="p-2 text-[11px] font-bold text-gray-700">Jami (siz)</td>
                                {slots.map(slot => (
                                    <td key={slot} className="p-2 text-center font-extrabold text-indigo-600 text-xs">
                                        {computeNotiqTotal(rawFor(slot, activeJudge), slot, criteria)} / {computeNotiqMaxScore(slot, criteria)}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>

                    {!isCourt && (
                        <div className="grid grid-cols-2 gap-4 mt-6">
                            {[{ side: 'tasdiqlovchi', label: 'Eng yaxshi notiq — Tasdiqlovchi' }, { side: 'inkor', label: 'Eng yaxshi notiq — Inkor etuvchi' }].map(({ side, label }) => {
                                const myPick = picks.find(p => p.side === side && p.judge === activeJudge)?.notiqSlot || '';
                                const sideSlots = side === 'tasdiqlovchi' ? ['T1', 'T2', 'T3'] : ['I1', 'I2', 'I3'];
                                return (
                                    <div key={side} className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 mb-2">
                                            <Star size={13} /> {label}
                                        </div>
                                        <select
                                            value={myPick}
                                            onChange={e => handlePick(side, e.target.value)}
                                            className="w-full px-3 py-2 border rounded-xl text-xs bg-white"
                                        >
                                            <option value="">Tanlanmagan</option>
                                            {sideSlots.map(slot => {
                                                const member = memberFor(slot);
                                                return <option key={slot} value={slot}>{slot} — {member?.fullName || "Notiq tanlanmagan"}</option>;
                                            })}
                                        </select>
                                        <div className="mt-2 space-y-0.5">
                                            {picks.filter(p => p.side === side).map(p => (
                                                <div key={p.judge} className="text-[10px] text-gray-500">{p.judge}: {p.notiqSlot} — {memberFor(p.notiqSlot)?.fullName || ''}</div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
        </Shell>
    );
};

export default DebateNotiqScoringPanel;
