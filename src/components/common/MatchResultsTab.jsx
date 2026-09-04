import React, { useMemo } from 'react';
import { Trophy, Medal, Award } from 'lucide-react';
import Badge from './Badge';
import { db } from '../../services/db';

// "Tanlov natijalari" for the match-based engines (Munozara `debate_match`, TSUL Court `court_match`).
// CompetitionResultsCenter is built entirely around per-round competitionScores rows, which these engines
// never write — so this tab used to be a dead end telling the admin to look somewhere else. The real
// standings already exist in db.getDebateTeamRating (the same source the Reyting tab uses); this presents
// them as a FINAL placement: the podium for `placesCount` places, then the full table.
const PLACE_STYLES = [
    { icon: Trophy, wrap: 'bg-amber-50 border-amber-200', badge: 'bg-amber-400 text-white', label: "1-o'rin" },
    { icon: Medal, wrap: 'bg-slate-50 border-slate-200', badge: 'bg-slate-400 text-white', label: "2-o'rin" },
    { icon: Award, wrap: 'bg-orange-50 border-orange-200', badge: 'bg-orange-400 text-white', label: "3-o'rin" }
];

const MatchResultsTab = ({ competition }) => {
    const rating = useMemo(() => db.getDebateTeamRating(competition.id), [competition.id]);
    const matches = useMemo(() => db.getDebateMatches(competition.id), [competition.id]);

    const finishedCount = matches.filter(m => m.status === 'finished').length;
    const placesCount = Math.max(1, Number(competition.placesCount) || 3);
    // Only teams that actually played can place — a registered-but-never-played team sits at 0 ball and
    // would otherwise silently occupy a podium slot in a small competition.
    const ranked = rating.filter(r => r.matchesPlayed > 0);
    const podium = ranked.slice(0, placesCount);

    if (finishedCount === 0) {
        return (
            <div className="p-12 text-center text-gray-400 text-sm">
                Hali birorta uchrashuv yakunlanmagan — natijalar uchrashuvlar yakunlangach shakllanadi.
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div>
                <h3 className="font-bold text-lg text-gray-900 flex items-center gap-1.5">
                    <Trophy size={17} className="text-amber-500" /> Yakuniy natijalar
                </h3>
                <p className="text-xs text-gray-400">
                    {finishedCount} ta yakunlangan uchrashuv bo'yicha jami ball. Uchrashuvlar davom etsa, natija yangilanadi.
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {podium.map((row, idx) => {
                    const style = PLACE_STYLES[idx] || { icon: Award, wrap: 'bg-white border-gray-200', badge: 'bg-gray-300 text-gray-700', label: `${idx + 1}-o'rin` };
                    const Icon = style.icon;
                    return (
                        <div key={row.participant.id} className={`p-4 rounded-2xl border ${style.wrap}`}>
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${style.badge}`}>{style.label}</span>
                                <Icon size={18} className="text-gray-400" />
                            </div>
                            <p className="font-bold text-sm text-gray-900 truncate" title={row.participant.name}>{row.participant.name}</p>
                            <p className="text-2xl font-extrabold text-indigo-600 mt-1">{row.totalBall}</p>
                            <p className="text-[11px] text-gray-400">{row.matchesPlayed} ta uchrashuv</p>
                        </div>
                    );
                })}
            </div>

            <div className="border rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-gray-400 uppercase">
                        <tr>
                            <th className="p-2 w-10">O'rin</th>
                            <th className="p-2">Jamoa</th>
                            <th className="p-2 text-center">Uchrashuvlar</th>
                            <th className="p-2 text-center">Jami ball</th>
                            <th className="p-2 text-center">Holat</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {rating.map((row, idx) => (
                            <tr key={row.participant.id} className={idx < placesCount && row.matchesPlayed > 0 ? 'bg-amber-50/40' : ''}>
                                <td className="p-2 text-center font-bold text-gray-400">{row.matchesPlayed > 0 ? idx + 1 : '—'}</td>
                                <td className="p-2 font-semibold text-gray-800">{row.participant.name}</td>
                                <td className="p-2 text-center">{row.matchesPlayed}</td>
                                <td className="p-2 text-center font-extrabold text-indigo-600">{row.totalBall}</td>
                                <td className="p-2 text-center">
                                    {row.status
                                        ? <Badge variant="default" size="sm">{row.status}</Badge>
                                        : <span className="text-gray-300">—</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default MatchResultsTab;
