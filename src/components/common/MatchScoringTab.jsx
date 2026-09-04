import React, { useMemo, useState } from 'react';
import { CheckCircle2, Gavel } from 'lucide-react';
import Badge from './Badge';
import Button from './Button';
import { db } from '../../services/db';
import { NOTIQ_SLOTS, getCourtSlots } from '../../config/competitionEngines';
import DebateNotiqScoringPanel from './DebateNotiqScoringPanel';

// "Baholash" tab for the match-based engines (Munozara `debate_match`, TSUL Court `court_match`).
// Scoring for these used to be reachable ONLY as a modal behind each match row in the Raundlar tab, which
// meant hunting for the right row every time. This puts the same grid (DebateNotiqScoringPanel, rendered
// with `inline`) on its own tab behind a simple match picker — one component, two placements, so the two
// can't drift apart.
const MatchScoringTab = ({ competition, onChanged, canFinish, actingUsername }) => {
    const [version, setVersion] = useState(0);
    const [selectedMatchId, setSelectedMatchId] = useState(null);
    // Set when finishDebateMatch reports a tie it can't resolve — the admin must name the winner.
    const [tieMatchId, setTieMatchId] = useState(null);
    const [finishError, setFinishError] = useState('');

    const matches = useMemo(() => db.getDebateMatches(competition.id), [competition.id, version]);
    const teamName = (id) => competition.participants.find(p => p.id === id)?.name || id;

    const slots = competition.scoringMethod === 'court_match' ? getCourtSlots(competition) : NOTIQ_SLOTS;
    const allSlotsScored = (matchId) => {
        const scores = db.getDebateNotiqScores(matchId);
        return slots.every(slot => scores.some(s => s.notiqSlot === slot));
    };

    // Same call + tie handling the Raundlar tab uses — one db function, so the two entry points can't
    // disagree about what "yakunlash" means.
    const handleFinishMatch = async (matchId, manualWinnerTeamId = null) => {
        setFinishError('');
        try {
            await db.finishDebateMatch(matchId, actingUsername, manualWinnerTeamId);
            setTieMatchId(null);
            setVersion(v => v + 1);
            onChanged?.();
        } catch (err) {
            if (err?.message?.includes("qo'lda tanla")) setTieMatchId(matchId);
            else setFinishError(err?.message || "Uchrashuvni yakunlashda xatolik yuz berdi.");
        }
    };

    // Default to the first not-yet-finished match — the one an admin almost always wants next.
    const activeMatchId = selectedMatchId ?? (matches.find(m => m.status !== 'finished') || matches[0])?.id ?? null;
    const activeMatch = matches.find(m => m.id === activeMatchId) || null;

    const matchLabel = (m) => (competition.isSingleSided
        ? teamName(m.teamTId)
        : `${teamName(m.teamTId)} — ${teamName(m.teamIId)}`);

    if (matches.length === 0) {
        return (
            <div className="p-6">
                <p className="text-sm text-gray-400 text-center py-10">
                    Hali uchrashuv yaratilmagan — avval "Raundlar" bo'limida uchrashuv tuzing.
                </p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-4">
            <div>
                <h3 className="font-bold text-lg text-gray-900 flex items-center gap-1.5">
                    <Gavel size={17} className="text-indigo-500" /> Baholash
                </h3>
                <p className="text-xs text-gray-400">
                    Uchrashuvni tanlang va mezonlar bo'yicha ball qo'ying. Ballar avtomatik saqlanadi.
                </p>
            </div>

            <div className="flex flex-wrap gap-2">
                {matches.map(m => {
                    const isActive = m.id === activeMatchId;
                    return (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => setSelectedMatchId(m.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                                isActive ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            {m.status === 'finished' && <CheckCircle2 size={12} className={isActive ? 'text-white' : 'text-emerald-600'} />}
                            <span className="truncate max-w-[220px]">{matchLabel(m)}</span>
                            {m.groupName && (
                                <span className={`text-[10px] ${isActive ? 'text-indigo-100' : 'text-gray-400'}`}>· {m.groupName}</span>
                            )}
                            {m.roundLabel && (
                                <span className={`text-[10px] ${isActive ? 'text-indigo-100' : 'text-gray-400'}`}>· {m.roundLabel}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {activeMatch && (
                <>
                    {activeMatch.status === 'finished' && (
                        <Badge variant="success" size="sm" className="inline-flex items-center gap-1">
                            <CheckCircle2 size={11} /> Bu uchrashuv yakunlangan — ballar faqat ko'rish uchun
                        </Badge>
                    )}
                    <DebateNotiqScoringPanel
                        inline
                        competition={competition}
                        match={activeMatch}
                        onChanged={() => { setVersion(v => v + 1); onChanged?.(); }}
                    />

                    {/* Finishing lives here too, not only in the Raundlar tab — this is where the admin
                        actually is the moment the last score goes in. */}
                    {canFinish?.() && activeMatch.status !== 'finished' && (
                        <div className="flex flex-wrap items-center gap-3">
                            <Button
                                variant="primary" size="sm" icon={CheckCircle2}
                                className="bg-emerald-600 hover:bg-emerald-700"
                                disabled={!allSlotsScored(activeMatch.id)}
                                onClick={() => handleFinishMatch(activeMatch.id)}
                            >
                                Uchrashuvni yakunlash
                            </Button>
                            {!allSlotsScored(activeMatch.id) && (
                                <span className="text-[11px] text-gray-400">
                                    Yakunlash uchun har bir ustunga kamida bitta ball qo'yilishi kerak.
                                </span>
                            )}
                        </div>
                    )}

                    {tieMatchId === activeMatch.id && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                            <p className="text-xs font-bold text-amber-800">
                                Ballar teng chiqdi — g'olibni qo'lda tanlang:
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {[activeMatch.teamTId, activeMatch.teamIId].filter(Boolean).map(teamId => (
                                    <Button
                                        key={teamId} variant="outline" size="sm"
                                        onClick={() => handleFinishMatch(activeMatch.id, teamId)}
                                    >
                                        {teamName(teamId)}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    )}

                    {finishError && (
                        <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            {finishError}
                        </p>
                    )}
                </>
            )}
        </div>
    );
};

export default MatchScoringTab;
