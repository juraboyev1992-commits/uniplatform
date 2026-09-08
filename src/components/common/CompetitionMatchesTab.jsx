import React, { useMemo, useState } from 'react';
import { Plus, Trash2, CheckCircle2, Users, Trophy, ChevronDown, ChevronUp, ClipboardCheck } from 'lucide-react';
import Button from './Button';
import Badge from './Badge';
import { db } from '../../services/db';
import { computeGroupStandings } from '../../config/competitionEngines';
import ActivityAttendancePanel from './ActivityAttendancePanel';

// Sport (match_play) tab — replaces CompetitionRoundsTab for competitions using the match_play engine.
// Completely parallel data path: reads/writes db.getCompetitionMatches/getCompetitionGroups only, never
// competitionScores/getLeaderboard. Playoff stage is a plain match list (no bracket-tree visualization
// or auto-seeding) — advancement is a manual coordinator decision, per this project's established
// "no automatic bracket computation" principle.
const STAGE_LABELS = { group: 'Guruh bosqichi', playoff: "Pley-off" };

const CompetitionMatchesTab = ({ competition, hasFullAdminAccess, canManageAttendance, actingUsername }) => {
    const [version, setVersion] = useState(0);
    const [newGroupName, setNewGroupName] = useState('');
    const [matchTeamA, setMatchTeamA] = useState('');
    const [matchTeamB, setMatchTeamB] = useState('');
    const [matchStage, setMatchStage] = useState('group');
    const [matchGroup, setMatchGroup] = useState('');
    const [matchRoundLabel, setMatchRoundLabel] = useState('');
    const [scoreDrafts, setScoreDrafts] = useState({});
    // Independent from any score-entry state above — a match's attendance can be reviewed/marked
    // whether or not its score row is currently being edited.
    const [attendanceMatchId, setAttendanceMatchId] = useState(null);

    const refresh = () => setVersion(v => v + 1);

    const groups = useMemo(() => db.getCompetitionGroups(competition.id), [competition.id, version]);
    const matches = useMemo(() => db.getCompetitionMatches(competition.id), [competition.id, version]);

    const teamName = (id) => competition.participants.find(p => p.id === id)?.name || id;

    const handleAddGroup = async () => {
        if (!newGroupName.trim()) return;
        await db.setCompetitionGroups(competition.id, [...groups.map(g => ({ name: g.name, participantIds: g.participantIds })), { name: newGroupName.trim(), participantIds: [] }]);
        setNewGroupName('');
        refresh();
    };

    const handleAssignTeamToGroup = async (teamId, groupName) => {
        const updated = groups.map(g => ({
            name: g.name,
            participantIds: g.name === groupName
                ? [...g.participantIds.filter(id => id !== teamId), teamId]
                : g.participantIds.filter(id => id !== teamId)
        }));
        await db.setCompetitionGroups(competition.id, updated);
        refresh();
    };

    const handleCreateMatch = async () => {
        if (!matchTeamA || !matchTeamB || matchTeamA === matchTeamB) return;
        await db.createMatch(competition.id, {
            stage: matchStage,
            groupName: matchStage === 'group' ? (matchGroup || null) : null,
            roundLabel: matchRoundLabel.trim() || null,
            teamAId: matchTeamA, teamBId: matchTeamB,
            createdBy: actingUsername
        });
        setMatchTeamA(''); setMatchTeamB(''); setMatchRoundLabel('');
        refresh();
    };

    const handleFinishMatch = async (matchId) => {
        const draft = scoreDrafts[matchId] || { scoreA: 0, scoreB: 0 };
        await db.updateMatchResult(matchId, draft.scoreA, draft.scoreB, actingUsername);
        refresh();
    };

    const handleDeleteMatch = async (matchId) => {
        try {
            await db.deleteMatch(matchId);
            refresh();
        } catch (err) {
            alert(err.message);
        }
    };

    const standingsByGroup = useMemo(() => {
        return groups.map(g => ({
            name: g.name,
            rows: computeGroupStandings(
                matches.filter(m => m.groupName === g.name),
                competition.participants.filter(p => g.participantIds.includes(p.id))
            )
        }));
    }, [groups, matches, competition.participants]);

    const groupMatches = matches.filter(m => m.stage === 'group');
    const playoffMatches = matches.filter(m => m.stage === 'playoff');

    const MatchAttendancePanel = ({ match }) => {
        const [aversion, setAversion] = useState(0);
        const roster = db.getMatchPlayAttendanceRoster(match.id);
        const locked = db.isAttendanceUnitLocked(competition.id, 'competition', 'match_play_match', match.id);
        const lockInfo = db.getActivityAttendanceLock(competition.id, 'competition', 'match_play_match', match.id);
        const existingAttendance = db.getActivityAttendance(competition.id, 'competition', 'match_play_match', match.id);
        const auditEntries = db.getActivityAttendanceForActivity(competition.id, 'competition')
            .filter(a => a.leafUnitType === 'match_play_match' && a.leafUnitId === match.id)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return (
            <ActivityAttendancePanel
                key={aversion}
                roster={roster}
                existingAttendance={existingAttendance}
                locked={locked}
                lockInfo={lockInfo}
                auditEntries={auditEntries}
                canManage={canManageAttendance?.() || false}
                canReopen={hasFullAdminAccess()}
                teamNameResolver={teamName}
                onSave={async (entries, reason) => {
                    await db.setActivityAttendanceBulk(competition.id, 'competition', 'match_play_match', match.id, entries, actingUsername, reason);
                    setAversion(v => v + 1);
                }}
                onReopen={async () => {
                    await db.reopenActivityAttendanceUnit(competition.id, 'competition', 'match_play_match', match.id, actingUsername);
                    setAversion(v => v + 1);
                }}
            />
        );
    };

    return (
        <div className="p-6 space-y-8">
            {hasFullAdminAccess() && (
                <div className="space-y-3">
                    <h3 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                        <Users size={15} className="text-indigo-500" /> Guruhlar
                    </h3>
                    <div className="flex flex-wrap gap-2 items-center">
                        {groups.map(g => <Badge key={g.name} variant="default" size="sm">{g.name} ({g.participantIds.length})</Badge>)}
                        <input
                            type="text"
                            value={newGroupName}
                            onChange={e => setNewGroupName(e.target.value)}
                            placeholder="Guruh nomi (masalan: A)"
                            className="px-3 py-1.5 border rounded-lg text-xs w-40"
                        />
                        <Button variant="outline" size="sm" icon={Plus} onClick={handleAddGroup}>Guruh qo'shish</Button>
                    </div>
                    {groups.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {competition.participants.map(p => {
                                const currentGroup = groups.find(g => g.participantIds.includes(p.id))?.name || '';
                                return (
                                    <div key={p.id} className="flex items-center justify-between gap-2 p-2 bg-slate-50 rounded-lg text-xs">
                                        <span className="font-semibold text-gray-700 truncate">{p.name}</span>
                                        <select
                                            value={currentGroup}
                                            onChange={e => handleAssignTeamToGroup(p.id, e.target.value)}
                                            className="px-2 py-1 border rounded-lg text-xs shrink-0"
                                        >
                                            <option value="">Guruhsiz</option>
                                            {groups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
                                        </select>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {standingsByGroup.length > 0 && (
                <div className="space-y-4">
                    <h3 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                        <Trophy size={15} className="text-amber-500" /> Guruh jadvali
                    </h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {standingsByGroup.map(sg => (
                            <div key={sg.name} className="border rounded-2xl overflow-hidden">
                                <div className="bg-slate-50 px-3 py-2 text-xs font-bold text-gray-600">Guruh {sg.name}</div>
                                <div className="overflow-x-auto">
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
                                    <tbody className="divide-y">
                                        {sg.rows.map(row => (
                                            <tr key={row.participant.id}>
                                                <td className="p-2 font-semibold text-gray-800">{row.participant.name}</td>
                                                <td className="p-2 text-center">{row.played}</td>
                                                <td className="p-2 text-center text-emerald-600">{row.won}</td>
                                                <td className="p-2 text-center text-gray-400">{row.drawn}</td>
                                                <td className="p-2 text-center text-rose-500">{row.lost}</td>
                                                <td className="p-2 text-center">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                                                <td className="p-2 text-center font-extrabold text-indigo-600">{row.points}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {hasFullAdminAccess() && (
                <div className="space-y-3">
                    <h3 className="font-bold text-sm text-gray-900">Yangi uchrashuv</h3>
                    <div className="flex flex-wrap gap-2 items-center p-4 bg-slate-50 rounded-2xl">
                        <select value={matchStage} onChange={e => setMatchStage(e.target.value)} className="px-3 py-2 border rounded-xl text-xs">
                            <option value="group">Guruh bosqichi</option>
                            <option value="playoff">Pley-off</option>
                        </select>
                        {matchStage === 'group' && (
                            <select value={matchGroup} onChange={e => setMatchGroup(e.target.value)} className="px-3 py-2 border rounded-xl text-xs">
                                <option value="">Guruhsiz</option>
                                {groups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
                            </select>
                        )}
                        <select value={matchTeamA} onChange={e => setMatchTeamA(e.target.value)} className="px-3 py-2 border rounded-xl text-xs">
                            <option value="">Jamoa A</option>
                            {competition.participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <span className="text-xs text-gray-400">vs</span>
                        <select value={matchTeamB} onChange={e => setMatchTeamB(e.target.value)} className="px-3 py-2 border rounded-xl text-xs">
                            <option value="">Jamoa B</option>
                            {competition.participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <input
                            type="text"
                            value={matchRoundLabel}
                            onChange={e => setMatchRoundLabel(e.target.value)}
                            placeholder="Tur nomi (ixtiyoriy)"
                            className="px-3 py-2 border rounded-xl text-xs w-32"
                        />
                        <Button variant="primary" size="sm" icon={Plus} disabled={!matchTeamA || !matchTeamB || matchTeamA === matchTeamB} onClick={handleCreateMatch}>
                            Yaratish
                        </Button>
                    </div>
                </div>
            )}

            {[{ label: 'Guruh bosqichi uchrashuvlari', list: groupMatches }, { label: 'Pley-off uchrashuvlari', list: playoffMatches }].map(section => (
                section.list.length > 0 && (
                    <div key={section.label} className="space-y-2">
                        <h3 className="font-bold text-sm text-gray-900">{section.label}</h3>
                        {section.list.map(m => (
                            <div key={m.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                                <div className="flex items-center justify-between gap-3 p-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="font-semibold text-sm text-gray-800 truncate">{teamName(m.teamAId)}</span>
                                        {m.status === 'finished' ? (
                                            <span className="font-extrabold text-indigo-600 shrink-0">{m.scoreA} : {m.scoreB}</span>
                                        ) : hasFullAdminAccess() ? (
                                            <div className="flex items-center gap-1 shrink-0">
                                                <input type="number" min="0" className="w-12 px-1.5 py-1 border rounded text-center text-xs"
                                                    onChange={e => setScoreDrafts(prev => ({ ...prev, [m.id]: { ...prev[m.id], scoreA: e.target.value } }))} />
                                                <span className="text-xs text-gray-400">:</span>
                                                <input type="number" min="0" className="w-12 px-1.5 py-1 border rounded text-center text-xs"
                                                    onChange={e => setScoreDrafts(prev => ({ ...prev, [m.id]: { ...prev[m.id], scoreB: e.target.value } }))} />
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-400 shrink-0">vs</span>
                                        )}
                                        <span className="font-semibold text-sm text-gray-800 truncate">{teamName(m.teamBId)}</span>
                                        {m.roundLabel && <Badge variant="default" size="sm">{m.roundLabel}</Badge>}
                                        {m.groupName && <Badge variant="info" size="sm">{m.groupName}</Badge>}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {canManageAttendance?.() && (
                                            <button type="button" onClick={() => setAttendanceMatchId(attendanceMatchId === m.id ? null : m.id)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 rounded-lg">
                                                {attendanceMatchId === m.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Davomat
                                            </button>
                                        )}
                                        {hasFullAdminAccess() && m.status !== 'finished' && (
                                            <button type="button" onClick={() => handleFinishMatch(m.id)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 rounded-lg">
                                                <CheckCircle2 size={12} /> Yakunlash
                                            </button>
                                        )}
                                        {hasFullAdminAccess() && m.status !== 'finished' && (
                                            <button type="button" onClick={() => handleDeleteMatch(m.id)} className="p-1.5 text-gray-400 hover:text-red-500">
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {attendanceMatchId === m.id && (
                                    <div className="px-3 pb-3">
                                        <MatchAttendancePanel match={m} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )
            ))}

            {matches.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">Hali uchrashuvlar yaratilmagan.</p>
            )}
        </div>
    );
};

export default CompetitionMatchesTab;
