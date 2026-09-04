import React, { useMemo, useState } from 'react';
import { Trophy, Scale, Medal, Lock, ArrowUpDown } from 'lucide-react';
import { getTieBreakLabel, computeGroupStandings, getDisplayStages } from '../../config/competitionEngines';
import { db } from '../../services/db';
import TeamDetailDrawer from './TeamDetailDrawer';
import DebateRatingTab from './DebateRatingTab';

const PODIUM_ACCENTS = {
    1: { ring: 'ring-amber-400', bg: 'bg-gradient-to-b from-amber-50 to-white dark:from-amber-950/30 dark:to-transparent', icon: 'text-amber-500', order: 'order-2 md:-translate-y-3' },
    2: { ring: 'ring-slate-400', bg: 'bg-gradient-to-b from-slate-50 to-white dark:from-slate-800/40 dark:to-transparent', icon: 'text-slate-400', order: 'order-1' },
    3: { ring: 'ring-orange-400', bg: 'bg-gradient-to-b from-orange-50 to-white dark:from-orange-950/30 dark:to-transparent', icon: 'text-orange-500', order: 'order-3' }
};

// Sum of a participant's already-real roundScores over [start,end] — display-only aggregation (e.g.
// UniQuiz's Stage1/Stage2/Final columns), never a new scoring computation. Skips rounds with no score
// yet (roundScores[r] === null, per db.getLeaderboard's own convention).
const sumRoundRange = (roundScores, [start, end]) => {
    let sum = 0;
    for (let r = start; r <= end; r++) {
        const v = roundScores?.[r];
        if (v != null) sum += v;
    }
    return sum;
};

// "Reyting" tab — a lightweight, always-current standings view, reusing the exact real db.getLeaderboard
// result the parent already computes (never a separate/second leaderboard computation). Distinct from
// "Natijalar markazi" (the full CompetitionResultsCenter — export/certificates/live screen/round
// drill-down); this is just the quick "who's winning right now" view, reachable without opening scoring.
// Sport (match_play) standings — self-fetched (same convention as CompetitionMatchesTab.jsx), since a
// match_play competition never populates the leaderboardData this tab otherwise uses. Read-only view;
// match creation/scoring itself lives in the Raundlar tab's CompetitionMatchesTab.
const SportStandings = ({ competition }) => {
    const groups = useMemo(() => db.getCompetitionGroups(competition.id), [competition.id]);
    const matches = useMemo(() => db.getCompetitionMatches(competition.id), [competition.id]);
    const standingsByGroup = groups.map(g => ({
        name: g.name,
        rows: computeGroupStandings(
            matches.filter(m => m.groupName === g.name),
            competition.participants.filter(p => g.participantIds.includes(p.id))
        )
    }));

    return (
        <div className="p-6 space-y-4">
            <div>
                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Reyting</h3>
                <p className="text-xs text-gray-400">Guruh jadvali — G'alaba 3, Durang 1, Mag'lubiyat 0 ball</p>
            </div>
            {standingsByGroup.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">Hali guruhlar tuzilmagan. "Raundlar" tabida guruh yarating.</p>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {standingsByGroup.map(sg => (
                        <div key={sg.name} className="border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden">
                            <div className="bg-slate-50 dark:bg-gray-800 px-3 py-2 text-xs font-bold text-gray-600 dark:text-gray-300">Guruh {sg.name}</div>
                            <table className="w-full text-left text-xs">
                                <thead className="text-gray-400 uppercase">
                                    <tr>
                                        <th className="p-2">Jamoa</th>
                                        <th className="p-2 text-center">O'</th>
                                        <th className="p-2 text-center">G'</th>
                                        <th className="p-2 text-center">D</th>
                                        <th className="p-2 text-center">M</th>
                                        <th className="p-2 text-center">Farq</th>
                                        <th className="p-2 text-center font-bold">Ochko</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {sg.rows.map(row => (
                                        <tr key={row.participant.id}>
                                            <td className="p-2 font-semibold text-gray-800 dark:text-gray-100">{row.participant.name}</td>
                                            <td className="p-2 text-center">{row.played}</td>
                                            <td className="p-2 text-center text-emerald-600">{row.won}</td>
                                            <td className="p-2 text-center text-gray-400">{row.drawn}</td>
                                            <td className="p-2 text-center text-rose-500">{row.lost}</td>
                                            <td className="p-2 text-center">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                                            <td className="p-2 text-center font-extrabold text-indigo-600 dark:text-indigo-400">{row.points}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const CompetitionRatingTab = ({ competition, leaderboardData, resultsHidden, canBypassResultsHidden }) => {
    const [facultyFilter, setFacultyFilter] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
    const [selectedTeamId, setSelectedTeamId] = useState(null);
    if (competition.scoringMethod === 'match_play') return <SportStandings competition={competition} />;
    if (competition.scoringMethod === 'debate_match') return <DebateRatingTab competition={competition} />;
    // "Natijalarni yashirish" — hides real standings from participants/teams while the coordinator is
    // actively correcting scores; anyone with score-entry access (canBypassResultsHidden) still sees the
    // real table, same as Natija kiritish itself always does.
    if (resultsHidden && !canBypassResultsHidden) {
        return (
            <div className="p-12 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
                    <Lock size={22} className="text-indigo-500" />
                </div>
                <p className="font-bold text-gray-800 dark:text-gray-100">Natijalarga o'zgartirish kiritilmoqda</p>
                <p className="text-sm text-gray-400 max-w-sm">Reyting hozircha yopiq. Tez orada yangilangan natijalar bilan qaytadan ochiladi.</p>
            </div>
        );
    }
    const nameOf = (row) => row.participant.name || row.participant.fullName || '—';
    // Real Tur boundaries — same shared resolver Natija kiritish/Natijalar markazi use (getDisplayStages,
    // competitionEngines.js), so a Zakovat competition without an explicit `competition.stages` field
    // still gets its per-Tur breakdown here (the up-to-12-Tur fallback), not just UniQuiz-style presets
    // that set `stages` directly.
    const stages = useMemo(() => getDisplayStages(competition), [competition]);

    const faculties = useMemo(
        () => [...new Set(leaderboardData.map(r => r.participant.faculty).filter(Boolean))].sort(),
        [leaderboardData]
    );
    const rows = facultyFilter ? leaderboardData.filter(r => r.participant.faculty === facultyFilter) : leaderboardData;
    const podium = rows.filter(r => r.rank <= 3);

    // SR (Savol reytingi) — a real, derived tie-break proxy: how many rounds this participant scored
    // positively on, not a fabricated weight. Only meaningful for quiz-style methods.
    const srOf = (row) => Object.values(row.roundScores || {}).filter(v => v != null && v > 0).length;

    // Table-only sort (podium above always stays in real rank order) — "Jamoa"/"Jami" headers toggle it.
    const triggerSort = (key) => {
        setSortConfig(prev => (
            prev.key === key
                ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
                : { key, direction: key === 'totalScore' ? 'desc' : 'asc' }
        ));
    };
    const sortedRows = useMemo(() => {
        if (!sortConfig.key) return rows;
        return [...rows].sort((a, b) => {
            const aVal = sortConfig.key === 'name' ? nameOf(a) : a.totalScore;
            const bVal = sortConfig.key === 'name' ? nameOf(b) : b.totalScore;
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [rows, sortConfig]);

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Reyting</h3>
                    <p className="text-xs text-gray-400">Joriy umumiy reyting — doim yangilanib boradi</p>
                </div>
                <div className="flex items-center gap-3">
                    {faculties.length > 1 && (
                        <select
                            value={facultyFilter}
                            onChange={e => setFacultyFilter(e.target.value)}
                            className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-lg text-xs"
                        >
                            <option value="">Barcha fakultetlar</option>
                            {faculties.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    )}
                    <span className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Scale size={13} />
                        Tie-break: {getTieBreakLabel(competition)}
                    </span>
                </div>
            </div>

            {podium.length > 0 && (
                <div className="flex flex-col md:flex-row items-stretch md:items-end gap-3">
                    {podium.map(row => {
                        const accent = PODIUM_ACCENTS[row.rank];
                        return (
                            <div
                                key={row.participant.id}
                                className={`flex-1 ${accent.order} ${accent.bg} rounded-3xl ring-2 ${accent.ring} p-4 text-center space-y-1.5`}
                            >
                                <Medal size={22} className={`mx-auto ${accent.icon}`} />
                                <p className="font-black text-sm text-gray-800 dark:text-gray-100 truncate">{nameOf(row)}</p>
                                <p className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">{row.totalScore}</p>
                                <p className="text-[10px] font-bold text-gray-400 uppercase">{row.rank}-o'rin</p>
                            </div>
                        );
                    })}
                </div>
            )}

            {rows.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">Hali natija kiritilmagan.</p>
            ) : (
                <div className="border border-gray-100 dark:border-gray-700 rounded-2xl overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead className="bg-slate-50 dark:bg-gray-800 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">
                            <tr>
                                <th className="p-3 border-b border-gray-100 dark:border-gray-700">#</th>
                                <th
                                    onClick={() => triggerSort('name')}
                                    className="p-3 border-b border-gray-100 dark:border-gray-700 cursor-pointer select-none hover:text-indigo-600 transition-colors"
                                >
                                    <span className="flex items-center gap-1.5">
                                        {competition.type === 'team' ? 'Jamoa' : 'Ishtirokchi'}
                                        <ArrowUpDown size={11} />
                                    </span>
                                </th>
                                {faculties.length > 0 && <th className="p-3 border-b border-gray-100 dark:border-gray-700">Fakultet</th>}
                                <th
                                    onClick={() => triggerSort('totalScore')}
                                    className="p-3 border-b border-gray-100 dark:border-gray-700 text-right cursor-pointer select-none hover:text-indigo-600 transition-colors"
                                >
                                    <span className="flex items-center justify-end gap-1.5">
                                        Jami
                                        <ArrowUpDown size={11} />
                                    </span>
                                </th>
                                {stages && stages.map((s, idx) => (
                                    <th key={s.label} title={s.label} className="p-3 border-b border-gray-100 dark:border-gray-700 text-right whitespace-nowrap">T{idx + 1}</th>
                                ))}
                                {stages && <th className="p-3 border-b border-gray-100 dark:border-gray-700 text-right">SR</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {sortedRows.map(row => (
                                <tr key={row.participant.id} className={row.rank <= 3 ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}>
                                    <td className="p-3 font-bold text-gray-500 dark:text-gray-400 w-12">
                                        {row.rank === 1 ? <Trophy size={16} className="text-amber-500" /> : row.rank}
                                    </td>
                                    <td className="p-3 font-semibold text-gray-800 dark:text-gray-100">
                                        {competition.type === 'team' ? (
                                            <button
                                                type="button"
                                                onClick={() => setSelectedTeamId(row.participant.id)}
                                                className="hover:text-indigo-600 hover:underline transition-colors text-left"
                                            >
                                                {nameOf(row)}
                                            </button>
                                        ) : nameOf(row)}
                                    </td>
                                    {faculties.length > 0 && <td className="p-3 text-xs text-gray-500">{row.participant.faculty || '—'}</td>}
                                    <td className="p-3 text-right font-extrabold text-indigo-600 dark:text-indigo-400">{row.totalScore}</td>
                                    {stages && stages.map(s => (
                                        <td key={s.label} className="p-3 text-right text-gray-600 dark:text-gray-300">{sumRoundRange(row.roundScores, s.roundRange)}</td>
                                    ))}
                                    {stages && <td className="p-3 text-right text-gray-500 dark:text-gray-400">{srOf(row)}</td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {selectedTeamId && (
                <TeamDetailDrawer
                    teamId={selectedTeamId}
                    competitionId={competition.id}
                    onClose={() => setSelectedTeamId(null)}
                />
            )}
        </div>
    );
};

export default CompetitionRatingTab;
