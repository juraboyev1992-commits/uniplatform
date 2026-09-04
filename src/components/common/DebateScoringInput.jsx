import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { DEBATE_PENALTY_TYPES } from '../../config/competitionEngines';
import { db } from '../../services/db';

// Live Scoring criteria inputs for one `debate` participant row. Reuses the exact same
// localCriteriaScores/setCriteriaScore mechanism already used by criteria_based (keyed by
// criterion name) — zero changes needed to the save path.
export const DebateCriteriaInputs = ({ competition, participantId, localCriteriaScores, localScores, setCriteriaScore }) => (
    <div className="flex items-center justify-center gap-2 flex-wrap">
        {(competition.criteria || []).map(c => (
            <input
                key={c.id}
                type="number"
                min={0}
                max={c.maxScore}
                title={`${c.name} (0-${c.maxScore})`}
                placeholder={c.name}
                className="w-16 px-2 py-1 border rounded-lg text-center text-xs font-bold"
                value={localCriteriaScores[participantId]?.[c.name] ?? ''}
                onChange={e => setCriteriaScore(participantId, c.name, e.target.value)}
            />
        ))}
        <span className="font-extrabold text-indigo-600 text-xs ml-2">
            Jami: {localScores[participantId] || 0} / 100
        </span>
    </div>
);

// Chief Judge penalty panel — a separate, immediate action (not part of the round-save flow),
// gated by the caller to hasFullAdminAccess() as the closest existing proxy for "Chief Judge" authority.
const DebateChiefJudgePenaltyPanel = ({ competition, appliedBy, onApplied }) => {
    const [participantId, setParticipantId] = useState(competition.participants[0]?.id || '');
    const [penaltyType, setPenaltyType] = useState(DEBATE_PENALTY_TYPES[0].key);
    const [points, setPoints] = useState(5);

    const handleApply = async () => {
        if (!participantId || !points) return;
        await db.addDebatePenalty(competition.id, participantId, penaltyType, points, appliedBy);
        onApplied();
    };

    return (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl space-y-3">
            <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span className="text-xs font-extrabold text-red-700 uppercase tracking-wide">Bosh hakam: Jarima paneli</span>
            </div>
            <div className="flex flex-wrap items-end gap-2">
                <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Ishtirokchi</label>
                    <select
                        className="px-3 py-1.5 border rounded-lg text-xs font-bold text-gray-700 bg-white"
                        value={participantId}
                        onChange={e => setParticipantId(e.target.value)}
                    >
                        {competition.participants.map(p => (
                            <option key={p.id} value={p.id}>{competition.type === 'team' ? p.name : p.fullName}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Qoidabuzarlik turi</label>
                    <select
                        className="px-3 py-1.5 border rounded-lg text-xs font-bold text-gray-700 bg-white"
                        value={penaltyType}
                        onChange={e => setPenaltyType(e.target.value)}
                    >
                        {DEBATE_PENALTY_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Ball (jarima)</label>
                    <input
                        type="number"
                        min={0}
                        className="w-20 px-3 py-1.5 border rounded-lg text-xs font-bold text-center bg-white"
                        value={points}
                        onChange={e => setPoints(e.target.value)}
                    />
                </div>
                <button
                    type="button"
                    onClick={handleApply}
                    className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors"
                >
                    Jarima qo'llash
                </button>
            </div>
        </div>
    );
};

export default DebateChiefJudgePenaltyPanel;
