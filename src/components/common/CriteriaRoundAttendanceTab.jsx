import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Users } from 'lucide-react';
import Badge from './Badge';
import { db } from '../../services/db';
import { resolveAttendanceLeafUnitId, getAttendanceRoundGroupCount } from '../../config/competitionEngines';
import ActivityAttendancePanel from './ActivityAttendancePanel';

// The generic "Davomat" tab (TournamentScoring.jsx's 'davomat' tab) for every TEAM-type competition that
// isn't match_play/debate_match (those get their own dedicated per-match toggle instead) — correct_answer/
// quiz_mixed/criteria_based/single_score all assign one shared score to the team, never to each member, so
// none of them proves individual attendance on their own. A genuinely separate tab from "Natija kiritish"
// so an attendance-only delegate (no result_entry/live_scoring) can still reach it.
//
// Owns its OWN round-group selector rather than reusing TournamentScoring.jsx's `currentRound` — that
// state is a RAW round/question index (e.g. 1..144 for a 12x12 Zakovat), not a leaf-unit number, and
// would render one pill per raw question for correct_answer. getAttendanceRoundGroupCount gives the same
// "Raund"-group count CompetitionRoundsTab.jsx's cards use (its `card.index`, the TRUE global Raund
// number) — both sides must agree on this numbering since CompetitionRoundsTab's "Yakunlash" is what
// actually locks a given leaf unit.
const CriteriaRoundAttendanceTab = ({ competition, canManageAttendance, hasFullAdminAccess, actingUsername }) => {
    const [version, setVersion] = useState(0);
    const [expandedTeamId, setExpandedTeamId] = useState(null);
    const refresh = () => setVersion(v => v + 1);

    const roundGroupCount = getAttendanceRoundGroupCount(competition);
    const [selectedRoundGroup, setSelectedRoundGroup] = useState(1);
    useEffect(() => { setSelectedRoundGroup(1); }, [competition.id]);

    const roster = useMemo(() => db.getCriteriaRoundAttendanceRoster(competition.id), [competition.id, version]);
    const turSchedule = useMemo(() => db.getTurSchedule(competition.id), [competition.id, version]);
    const leafUnitId = useMemo(
        () => resolveAttendanceLeafUnitId(competition, selectedRoundGroup, turSchedule),
        [competition, selectedRoundGroup, turSchedule]
    );

    const locked = db.isAttendanceUnitLocked(competition.id, 'competition', 'criteria_round', leafUnitId);
    const lockInfo = db.getActivityAttendanceLock(competition.id, 'competition', 'criteria_round', leafUnitId);
    const existingAttendance = db.getActivityAttendance(competition.id, 'competition', 'criteria_round', leafUnitId);
    const auditEntries = useMemo(
        () => db.getActivityAttendanceForActivity(competition.id, 'competition')
            .filter(a => a.leafUnitType === 'criteria_round' && String(a.leafUnitId) === String(leafUnitId))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
        [competition.id, leafUnitId, version]
    );

    const teamName = (id) => competition.participants.find(p => p.id === id)?.name || id;

    const handleSave = async (entries, reason) => {
        await db.setActivityAttendanceBulk(competition.id, 'competition', 'criteria_round', leafUnitId, entries, actingUsername, reason);
        refresh();
    };

    const handleReopen = async () => {
        await db.reopenActivityAttendanceUnit(competition.id, 'competition', 'criteria_round', leafUnitId, actingUsername);
        refresh();
    };

    const teamsWithRoster = competition.participants.filter(p => roster.some(r => r.teamId === p.id));

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h3 className="font-bold text-lg text-gray-900">Davomat</h3>
                    <p className="text-xs text-gray-400">
                        Jamoaga umumiy ball qo'yilishi a'zolarning ishtirokini alohida tasdiqlamaydi — har bir a'zoning shu bosqichda hozir bo'lganini shu yerda belgilang.
                    </p>
                </div>
                {roundGroupCount > 1 && competition.attendanceGranularity !== 'whole_competition' && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {Array.from({ length: roundGroupCount }, (_, i) => i + 1).map(rNum => (
                            <button
                                key={rNum}
                                type="button"
                                onClick={() => setSelectedRoundGroup(rNum)}
                                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all border ${
                                    selectedRoundGroup === rNum
                                        ? 'bg-indigo-700 border-indigo-700 text-white'
                                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                {rNum}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {teamsWithRoster.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Hali jamoa a'zolari yo'q.</p>
            ) : (
                <div className="space-y-2">
                    {teamsWithRoster.map(team => {
                        const teamLocked = locked; // one shared leaf unit across every team, same lock state
                        const teamRoster = roster.filter(r => r.teamId === team.id);
                        return (
                            <div key={team.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setExpandedTeamId(expandedTeamId === team.id ? null : team.id)}
                                    className="w-full flex items-center justify-between gap-3 p-3 text-left"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Users size={14} className="text-indigo-500 shrink-0" />
                                        <span className="font-semibold text-sm text-gray-800 truncate">{team.name}</span>
                                        <Badge variant="default" size="sm">{teamRoster.length} a'zo</Badge>
                                        {teamLocked && <Badge variant="default" size="sm">Yakunlangan</Badge>}
                                    </div>
                                    {expandedTeamId === team.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                                {expandedTeamId === team.id && (
                                    <div className="px-3 pb-3">
                                        <ActivityAttendancePanel
                                            roster={teamRoster}
                                            existingAttendance={existingAttendance.filter(a => a.teamId === team.id)}
                                            locked={locked}
                                            lockInfo={lockInfo}
                                            auditEntries={auditEntries.filter(a => teamRoster.some(m => m.participantId === a.participantId))}
                                            canManage={canManageAttendance()}
                                            canReopen={hasFullAdminAccess()}
                                            onSave={handleSave}
                                            onReopen={handleReopen}
                                            teamNameResolver={teamName}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CriteriaRoundAttendanceTab;
