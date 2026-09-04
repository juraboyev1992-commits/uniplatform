import React, { useMemo } from 'react';
import { Users, Trophy, Info } from 'lucide-react';
import { db } from '../../services/db';

// Real team roster + cross-competition history — only ever shows GENUINE data (db.getTeamById /
// getTeamMembers / getTeamCompetitionHistory, the same real persisted layer TeamProfilePage.jsx already
// uses). If `teamId` doesn't resolve to a real team (a competition created before team-type competitions
// started using real club teams, or a legacy mock participant id), shows a plain disclosed message instead
// of fabricating a roster/history that doesn't exist.
const TeamRosterAndHistory = ({ teamId, currentCompetitionId }) => {
    const team = useMemo(() => db.getTeamById(teamId), [teamId]);
    const club = useMemo(() => (team ? db.getClubById(team.clubId) : null), [team]);
    const members = useMemo(() => (team ? db.getTeamMembers(teamId) : []), [team, teamId]);
    const history = useMemo(() => (team ? db.getTeamCompetitionHistory(teamId) : []), [team, teamId]);

    if (!team) {
        return (
            <div className="p-4 bg-gray-50 dark:bg-slate-800/40 rounded-xl flex items-start gap-2.5">
                <Info size={16} className="text-gray-400 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-500 dark:text-slate-400">
                    Bu ishtirokchi uchun to'liq profil mavjud emas — eski musobaqa ma'lumoti, real jamoa tarkibiga bog'lanmagan.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div>
                <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
                    <Users size={16} className="text-indigo-600" /> Jamoa tarkibi{club ? ` — ${club.name}` : ''}
                </h4>
                {members.length === 0 ? (
                    <p className="text-xs text-gray-400">A'zolar hali belgilanmagan.</p>
                ) : (
                    <div className="space-y-1.5">
                        {members.map(m => (
                            <div key={m.id} className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-slate-800/40 rounded-lg text-sm">
                                <span className="text-gray-700 dark:text-gray-200 font-semibold">{m.student?.fullName || m.student?.name || "Noma'lum"}</span>
                                <span className="text-[11px] text-gray-400 uppercase font-bold">{m.role || "a'zo"}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div>
                <h4 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
                    <Trophy size={16} className="text-indigo-600" /> Ishtirok etgan tanlovlar
                </h4>
                {history.length === 0 ? (
                    <p className="text-xs text-gray-400">Boshqa tanlovlarda ishtirok etmagan.</p>
                ) : (
                    <div className="space-y-1.5">
                        {history.map(h => (
                            <div
                                key={h.competitionId}
                                className={`flex items-center justify-between p-2.5 rounded-lg text-sm ${
                                    h.competitionId === currentCompetitionId ? 'bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-200 dark:ring-indigo-800' : 'bg-gray-50 dark:bg-slate-800/40'
                                }`}
                            >
                                <span className="text-gray-700 dark:text-gray-200 font-semibold truncate">{h.name}</span>
                                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 shrink-0 ml-2">
                                    {h.rank != null ? `#${h.rank} · ${h.totalScore} ball` : '—'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TeamRosterAndHistory;
