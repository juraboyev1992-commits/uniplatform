import React, { useMemo, useState } from 'react';
import { Trophy, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { db } from '../../services/db';
import {
    NOTIQ_SLOTS, aggregateNotiqAcrossJudges, computeNotiqMaxScore, DEBATE_MATCH_CRITERIA,
    getCourtSlots, getCourtMatchCriteria
} from '../../config/competitionEngines';

const STATUS_STYLES = {
    "G'olib": 'bg-emerald-100 text-emerald-700',
    'Finalda': 'bg-indigo-100 text-indigo-700',
    'Yarim finalda': 'bg-blue-100 text-blue-700',
    "Pley-offda": 'bg-sky-100 text-sky-700',
    'Guruh bosqichida': 'bg-slate-100 text-slate-600',
    'Chiqib ketdi': 'bg-rose-100 text-rose-600'
};

// Munozara match-based ("debate_match") Reyting tab — sibling to CompetitionRatingTab.jsx's SportStandings,
// self-fetched the same way (a debate_match competition never populates the leaderboardData the parent
// tab otherwise uses). Two tables: team rating (every team, incl. eliminated — Jami ball is never
// discarded) with row-expand to per-match notiq sub-scores, and the cross-match best-speaker leaderboard.
// `allSlots` is the competition's real slot list (Munozara's 6, or a court format's 3/4) — split here by
// side so a 1-sided court match shows its single team's slots instead of looking for Munozara's.
const MatchNotiqBreakdown = ({ matchId, side, calculationMethod, criteria, allSlots, isCourt }) => {
    const lineup = db.getDebateMatchLineup(matchId);
    const scores = db.getDebateNotiqScores(matchId);
    const slots = side === 'inkor'
        ? allSlots.filter(s => s.startsWith('I'))
        : allSlots.filter(s => !s.startsWith('I'));
    return (
        <div className={`grid gap-2 ${isCourt ? 'grid-cols-1 max-w-xs' : 'grid-cols-3'}`}>
            {slots.map(slot => {
                const member = lineup.find(l => l.notiqSlot === slot)?.member;
                const judgeEntries = scores.filter(s => s.notiqSlot === slot).map(s => ({ judge: s.judge, criteriaScores: s.criteriaScores }));
                const { aggregate } = aggregateNotiqAcrossJudges(judgeEntries, slot, calculationMethod, criteria);
                return (
                    <div key={slot} className="p-2 bg-white border rounded-lg text-[11px]">
                        {/* Court: one box per side = the team's own rubric total (no speaker to name).
                            Munozara: one box per notiq slot, showing who spoke it. */}
                        <div className="font-bold text-gray-400">{isCourt ? "Mezonlar bo'yicha jami" : slot}</div>
                        {!isCourt && <div className="font-semibold text-gray-700 truncate">{member?.fullName || '—'}</div>}
                        <div className="font-extrabold text-indigo-600">{aggregate} / {computeNotiqMaxScore(slot, criteria)}</div>
                    </div>
                );
            })}
        </div>
    );
};

const DebateRatingTab = ({ competition }) => {
    const [expandedTeamId, setExpandedTeamId] = useState(null);
    const rating = useMemo(() => db.getDebateTeamRating(competition.id), [competition.id]);
    const leaderboard = useMemo(() => db.getDebateBestSpeakerLeaderboard(competition.id), [competition.id]);
    const calculationMethod = competition.calculationMethod || 'average';
    const isCourt = competition.scoringMethod === 'court_match';
    const allSlots = isCourt ? getCourtSlots(competition) : NOTIQ_SLOTS;
    const criteria = isCourt
        ? getCourtMatchCriteria(competition)
        : (competition.debateMatchCriteria || DEBATE_MATCH_CRITERIA);

    return (
        <div className="p-6 space-y-8">
            <div>
                <h3 className="font-bold text-lg text-gray-900 flex items-center gap-1.5">
                    <Trophy size={17} className="text-amber-500" /> Jamoalar reytingi
                </h3>
                <p className="text-xs text-gray-400">Har bir jamoaning o'ynagan barcha uchrashuvlaridagi jami ball</p>
            </div>

            {rating.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Hali natijalar yo'q.</p>
            ) : (
                <div className="border rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-gray-400 uppercase">
                            <tr>
                                <th className="p-2 w-8"></th>
                                <th className="p-2">Jamoa</th>
                                <th className="p-2 text-center">Uchrashuvlar</th>
                                <th className="p-2 text-center">Jami ball</th>
                                <th className="p-2 text-center">Holat</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {rating.map((row, idx) => (
                                <React.Fragment key={row.participant.id}>
                                    <tr className="hover:bg-slate-50/80">
                                        <td className="p-2 text-center text-gray-400 font-bold">{idx + 1}</td>
                                        <td className="p-2 font-semibold text-gray-800">{row.participant.name}</td>
                                        <td className="p-2 text-center">{row.matchesPlayed}</td>
                                        <td className="p-2 text-center font-extrabold text-indigo-600">{row.totalBall}</td>
                                        <td className="p-2 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLES[row.status] || 'bg-gray-100 text-gray-500'}`}>{row.status}</span>
                                            {row.matchesPlayed > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedTeamId(expandedTeamId === row.participant.id ? null : row.participant.id)}
                                                    className="ml-2 text-gray-400 hover:text-gray-700 align-middle"
                                                >
                                                    {expandedTeamId === row.participant.id ? <ChevronUp size={13} className="inline" /> : <ChevronDown size={13} className="inline" />}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                    {expandedTeamId === row.participant.id && (
                                        <tr>
                                            <td colSpan={5} className="p-3 bg-slate-50/60">
                                                <div className="space-y-3">
                                                    {row.matchBreakdown.map(mb => (
                                                        <div key={mb.matchId} className="space-y-1.5">
                                                            <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-600">
                                                                <span className={mb.side === 'tasdiqlovchi' ? 'text-indigo-600' : 'text-rose-600'}>
                                                                    {/* A court competition names its own sides at creation (sideTLabel/sideILabel);
                                                                        a 1-sided format has no opposing side to name at all. */}
                                                                    {isCourt
                                                                        ? (mb.side === 'tasdiqlovchi' ? (competition.sideTLabel || 'Tomon A') : (competition.sideILabel || 'Tomon B'))
                                                                        : (mb.side === 'tasdiqlovchi' ? 'Tasdiqlovchi' : 'Inkor etuvchi')}
                                                                </span>
                                                                {mb.roundLabel && <span className="text-gray-400">· {mb.roundLabel}</span>}
                                                                <span className="text-gray-400">
                                                                    · {mb.ownScore}{competition.isSingleSided ? '' : ` : ${mb.opponentScore}`}
                                                                </span>
                                                                {mb.won && !competition.isSingleSided && <span className="text-emerald-600 font-bold">G'olib</span>}
                                                            </div>
                                                            <MatchNotiqBreakdown matchId={mb.matchId} side={mb.side} calculationMethod={calculationMethod} criteria={criteria} allSlots={allSlots} isCourt={isCourt} />
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Per-speaker leaderboard is a Munozara concept — TSUL Court is judged per team, so there
                are no individual notiq scores to rank. */}
            {!isCourt && (
                <>
                    <div>
                        <h3 className="font-bold text-lg text-gray-900 flex items-center gap-1.5">
                            <Star size={17} className="text-amber-500" /> Eng yaxshi notiqlar
                        </h3>
                        <p className="text-xs text-gray-400">Barcha uchrashuvlardagi o'rtacha ball bo'yicha</p>
                    </div>
                    {leaderboard.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">Hali natijalar yo'q.</p>
                    ) : (
                        <div className="border rounded-2xl overflow-hidden">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-gray-400 uppercase">
                                    <tr>
                                        <th className="p-2 w-8"></th>
                                        <th className="p-2">Notiq</th>
                                        <th className="p-2 text-center">Uchrashuvlar</th>
                                        <th className="p-2 text-center">Jami ball</th>
                                        <th className="p-2 text-center font-bold">O'rtacha</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {leaderboard.map((row, idx) => (
                                        <tr key={row.memberUserId} className="hover:bg-slate-50/80">
                                            <td className="p-2 text-center text-gray-400 font-bold">{idx + 1}</td>
                                            <td className="p-2 font-semibold text-gray-800">{row.student?.fullName || row.memberUserId}</td>
                                            <td className="p-2 text-center">{row.matchesPlayed}</td>
                                            <td className="p-2 text-center">{row.totalScore}</td>
                                            <td className="p-2 text-center font-extrabold text-amber-600">{row.averageScore}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default DebateRatingTab;
