import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Trophy, RefreshCw, Lock } from 'lucide-react';
import { db } from '../../services/db';

// Public "live screen" view (spec §11 — "Live ekran uchun public view"), read-only, no auth-gated
// actions. Renders the same real db.getLeaderboard result every other results view already trusts — no
// new/duplicate computation. Meant for a projector/big-screen tab, so it polls lightly for updates
// rather than requiring a manual refresh (this page has no other way to learn about new scores, unlike
// the authenticated workspace which recomputes on its own state changes).
const REFRESH_MS = 5000;

const CompetitionLiveScreenPage = () => {
    const { competitionId } = useParams();
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), REFRESH_MS);
        return () => clearInterval(interval);
    }, []);

    const competition = useMemo(() => db.getCompetitionById(competitionId), [competitionId, tick]);
    const leaderboard = useMemo(() => (competition ? db.getLeaderboard(competition.id) : []), [competition, tick]);

    if (!competition) {
        return (
            <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
                <p className="text-slate-400">Musobaqa topilmadi.</p>
            </div>
        );
    }

    const nameOf = (row) => row.participant.name || row.participant.fullName || '—';

    return (
        <div className="min-h-screen bg-slate-950 text-white p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Trophy size={32} className="text-amber-400" />
                        <div>
                            <h1 className="text-2xl font-black">{competition.name}</h1>
                            <p className="text-sm text-slate-400">
                                Raund {competition.currentRound || 1} / {competition.roundsCount}
                            </p>
                        </div>
                    </div>
                    <RefreshCw size={16} className="text-slate-500 animate-spin" style={{ animationDuration: '3s' }} />
                </div>

                {/* "Natijalarni yashirish" — this page is always public/anonymous (no login, no role), so
                    resultsHidden always wins here, unlike the authenticated workspace where judges/admins
                    keep seeing real numbers regardless. */}
                {competition.resultsHidden ? (
                    <div className="bg-slate-900 rounded-3xl border border-slate-800 p-16 flex flex-col items-center justify-center text-center gap-3">
                        <Lock size={28} className="text-indigo-400" />
                        <p className="text-lg font-bold">Natijalarga o'zgartirish kiritilmoqda</p>
                        <p className="text-sm text-slate-400 max-w-sm">Tez orada yangilangan natijalar bilan qaytadan ochiladi.</p>
                    </div>
                ) : (
                    <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden">
                        <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-800/60 text-xs font-bold text-slate-400 uppercase">
                                <tr>
                                    <th className="p-4">#</th>
                                    <th className="p-4">Ishtirokchi</th>
                                    <th className="p-4 text-right">Ball</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {leaderboard.map(row => (
                                    <tr key={row.participant.id} className={row.rank === 1 ? 'bg-amber-500/10' : ''}>
                                        <td className="p-4 font-black text-lg text-slate-300">{row.rank}</td>
                                        <td className="p-4 font-bold">{nameOf(row)}</td>
                                        <td className="p-4 text-right font-black text-xl text-amber-400">{row.totalScore}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CompetitionLiveScreenPage;
