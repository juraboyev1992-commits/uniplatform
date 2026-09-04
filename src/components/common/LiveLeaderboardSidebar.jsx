import React, { useMemo } from 'react';
import { Trophy, TrendingUp, Scale, ListChecks } from 'lucide-react';
import { getTieBreakLabel } from '../../config/competitionEngines';

// Persistent right-hand panel shown alongside the scoring view (section 10). Reads ONLY the real
// db.getLeaderboard result already computed by the parent (never CompetitionResultsCenter's separate
// leaderboardRows computation, and never recomputes scores itself) — purely a different slice/sort of
// the same data the rest of the workspace already trusts.
const LiveLeaderboardSidebar = ({ competition, leaderboardData, currentRound }) => {
    const currentRoundRanking = useMemo(() => {
        return [...leaderboardData]
            .filter(row => row.roundScores?.[currentRound] != null)
            .sort((a, b) => (b.roundScores[currentRound] || 0) - (a.roundScores[currentRound] || 0))
            .slice(0, 5);
    }, [leaderboardData, currentRound]);

    const overallTop = useMemo(() => leaderboardData.slice(0, 5), [leaderboardData]);

    const enteredCount = leaderboardData.filter(row => row.roundScores?.[currentRound] != null).length;
    const totalCount = leaderboardData.length;

    const nameOf = (row) => row.participant.name || row.participant.fullName || '—';

    return (
        <div className="w-full lg:w-72 shrink-0 bg-white border-l border-gray-100 p-4 space-y-5">
            <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-bold text-gray-700">
                    <ListChecks size={14} className="text-indigo-500" />
                    Kiritilgan
                </span>
                <span className="font-extrabold text-indigo-600">{enteredCount} / {totalCount}</span>
            </div>

            <div>
                <h4 className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-2">
                    <TrendingUp size={14} className="text-emerald-500" />
                    Joriy raund reytingi
                </h4>
                {currentRoundRanking.length === 0 ? (
                    <p className="text-[11px] text-gray-400">Hali natija kiritilmagan.</p>
                ) : (
                    <div className="space-y-1.5">
                        {currentRoundRanking.map((row, idx) => (
                            <div key={row.participant.id} className="flex items-center justify-between text-xs px-2.5 py-1.5 bg-slate-50 rounded-lg">
                                <span className="font-semibold text-gray-700 truncate">{idx + 1}. {nameOf(row)}</span>
                                <span className="font-bold text-emerald-600 shrink-0 ml-2">{row.roundScores[currentRound]}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div>
                <h4 className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-2">
                    <Trophy size={14} className="text-amber-500" />
                    Umumiy reyting
                </h4>
                <div className="space-y-1.5">
                    {overallTop.map((row) => (
                        <div key={row.participant.id} className="flex items-center justify-between text-xs px-2.5 py-1.5 bg-slate-50 rounded-lg">
                            <span className="font-semibold text-gray-700 truncate">{row.rank}. {nameOf(row)}</span>
                            <span className="font-bold text-indigo-600 shrink-0 ml-2">{row.totalScore}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-gray-400 pt-2 border-t border-gray-50">
                <Scale size={12} />
                Tie-break: {getTieBreakLabel(competition)}
            </div>
        </div>
    );
};

export default LiveLeaderboardSidebar;
