import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, CheckCircle2, Users, Trophy, ChevronDown, ChevronUp, Gavel, Shuffle } from 'lucide-react';
import Button from './Button';
import Badge from './Badge';
import { db } from '../../services/db';
import { computeDebateGroupStandings, NOTIQ_SLOTS, getCourtSlots } from '../../config/competitionEngines';
import DebateNotiqScoringPanel from './DebateNotiqScoringPanel';
import ActivityAttendancePanel from './ActivityAttendancePanel';

// Munozara match-based ("debate_match") tab — replaces CompetitionRoundsTab for competitions using this
// engine, sibling to CompetitionMatchesTab.jsx (Sport). Group-creation/team-assignment block reused
// verbatim (db.getCompetitionGroups/setCompetitionGroups is already engine-agnostic). Playoff roundLabel
// is a bounded select (unlike Sport's free text) — team-status derivation in db.getDebateTeamRating needs
// to reliably know which stage a match belongs to.
//
// Every "avtomatik" (Shuffle-icon) action below only fills GAPS — it never reassigns/overwrites a team,
// match, or notiq slot that already has a real (manual or previously-auto) value, same "never override an
// existing assignment" convention UniQuiz's auto-assign-by-faculty already established
// (CompetitionAdvancementPanel.jsx's handleAutoAssignByFaculty). Admin can always freely override any
// individual value afterward through the plain manual controls.
const STAGE_LABELS = { group: 'Guruh bosqichi', playoff: 'Pley-off' };
const PLAYOFF_ROUND_LABELS = ['Chorak final', 'Yarim final', 'Final'];

// Fisher-Yates — pure, no mutation of the input array.
const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

// Fills only the EMPTY notiq slots of ONE match — a slot someone already assigned (manually or by an
// earlier click) is left untouched, and no real member is ever repeated across two slots of the same
// match. A team with fewer than 3 resolvable roster members simply leaves its extra slot(s) unset — no
// error. Shared by both the per-match "Avtomatik notiqlar" button (LineupPanel) and the bulk
// "Barchasi uchun avtomatik notiqlar" button below — same fill logic, just a different loop around it.
// `slots` is the competition's real slot list (Munozara's fixed 6, or a court competition's own 3/4 —
// see resolveSlots below), so a court match fills exactly the slots its scoring grid will show.
const autoAssignLineupForMatch = async (matchId, teamTId, teamIId, actingUsername, slots) => {
    const lineup = db.getDebateMatchLineup(matchId);
    const filledSlots = new Set(lineup.map(l => l.notiqSlot));
    const usedMemberIds = new Set(lineup.map(l => l.memberUserId));
    const tMembers = db.getTeamMembers(teamTId);
    // A 1-sided (Written Memorial / Criminal) match has no opposing team at all.
    const iMembers = teamIId ? db.getTeamMembers(teamIId) : [];
    const fillSide = async (sideSlots, members) => {
        for (const slot of sideSlots.filter(s => !filledSlots.has(s))) {
            const pick = shuffle(members.filter(m => !usedMemberIds.has(m.userId)))[0];
            if (pick) { await db.setDebateMatchLineup(matchId, slot, pick.userId, actingUsername); usedMemberIds.add(pick.userId); }
        }
    };
    await fillSide(slots.filter(s => !s.startsWith('I')), tMembers);
    await fillSide(slots.filter(s => s.startsWith('I')), iMembers);
};

const DebateMatchesTab = ({ competition, hasFullAdminAccess, canManageAttendance, actingUsername }) => {
    // This tab serves both Munozara (debate_match, fixed 6 notiq slots) and TSUL Court (court_match, whose
    // slot set depends on whether the format is 1- or 2-sided). Everything slot-driven below — the lineup
    // grid, auto-assign, and the "every slot scored?" gate on the Yakunlash button — reads THIS, so a court
    // match no longer waits forever for Munozara slots that will never be scored.
    // TSUL Court scores the TEAM against its rubric — there are no individual speaker slots to staff, so
    // the whole notiq-lineup apparatus (per-match "Notiqlar" panel, auto-assign) is hidden for it.
    const isCourt = competition.scoringMethod === 'court_match';
    const slots = isCourt ? getCourtSlots(competition) : NOTIQ_SLOTS;
    const [version, setVersion] = useState(0);
    const [newGroupName, setNewGroupName] = useState('');
    const [matchTeamT, setMatchTeamT] = useState('');
    const [matchTeamI, setMatchTeamI] = useState('');
    const [matchStage, setMatchStage] = useState('group');
    const [matchGroup, setMatchGroup] = useState('');
    const [matchRoundLabel, setMatchRoundLabel] = useState(PLAYOFF_ROUND_LABELS[0]);
    const [expandedMatchId, setExpandedMatchId] = useState(null);
    // Kept separate from expandedMatchId (lineup-only) — a match's bench attendance can be reviewed
    // independently of whether its notiq lineup panel is currently open.
    const [attendanceMatchId, setAttendanceMatchId] = useState(null);
    const [scoringMatchId, setScoringMatchId] = useState(null);
    const [tieMatchId, setTieMatchId] = useState(null);
    const [bulkLineupConfirm, setBulkLineupConfirm] = useState(false);
    // Same "checkbox pick real faculties" idiom as CompetitionAdvancementPanel.jsx's guruh picker — a
    // debate group here is a bracket bucket ("Guruh A/B/C"), not necessarily a faculty, but a coordinator
    // who DOES want to split by faculty shouldn't have to hand-type each name (typo/duplicate risk).
    const [selectedNewFaculties, setSelectedNewFaculties] = useState([]);
    const [selectedTeamIds, setSelectedTeamIds] = useState([]);
    const [bulkTargetGroup, setBulkTargetGroup] = useState('');
    const [hideAssignedTeams, setHideAssignedTeams] = useState(false);
    const [randomConstraints, setRandomConstraints] = useState({ avoidFaculty: true, balanceSizes: true });
    const [groupError, setGroupError] = useState('');

    const refresh = () => setVersion(v => v + 1);

    const groups = useMemo(() => db.getCompetitionGroups(competition.id), [competition.id, version]);
    const matches = useMemo(() => db.getDebateMatches(competition.id), [competition.id, version]);

    const teamName = (id) => competition.participants.find(p => p.id === id)?.name || id;

    // Stable "tartib raqami" — team's own registration order, computed once so it never shifts when
    // "Faqat guruhsizlarni ko'rsatish" is toggled.
    const teamOrderIndex = useMemo(() => {
        const map = new Map();
        competition.participants.forEach((p, idx) => map.set(p.id, idx + 1));
        return map;
    }, [competition.participants]);

    // Every group mutation goes through here so a failed write (Supabase error, duplicate name, ...) shows
    // the real reason instead of the button silently doing nothing — these are all async writes whose
    // rejections were previously unhandled, which is exactly how a broken group-add looks like "nothing
    // happens" rather than an error.
    const runGroupAction = async (fn) => {
        setGroupError('');
        try {
            await fn();
            refresh();
        } catch (err) {
            setGroupError(err?.message || "Guruhni saqlashda noma'lum xatolik yuz berdi.");
        }
    };

    const handleAddGroup = () => runGroupAction(async () => {
        const name = newGroupName.trim();
        if (!name) return;
        if (groups.some(g => g.name.trim().toLowerCase() === name.toLowerCase())) {
            throw new Error(`"${name}" nomli guruh allaqachon mavjud.`);
        }
        await db.setCompetitionGroups(competition.id, [...groups.map(g => ({ name: g.name, participantIds: g.participantIds })), { name, participantIds: [] }]);
        setNewGroupName('');
    });

    // Real, distinct faculties inferred from this competition's own teams (db.inferTeamFaculty — same
    // captain-priority/majority source CompetitionAdvancementPanel.jsx already trusts) minus any faculty
    // a group already exists for.
    const availableFaculties = useMemo(() => {
        const seen = new Set();
        const result = [];
        competition.participants.forEach(p => {
            const faculty = db.inferTeamFaculty(p.id);
            if (!faculty || seen.has(faculty)) return;
            seen.add(faculty);
            if (!groups.some(g => g.name.trim().toLowerCase() === faculty.trim().toLowerCase())) result.push(faculty);
        });
        return result.sort();
    }, [competition.participants, groups]);
    const handleToggleFacultyCheckbox = (faculty) => {
        setSelectedNewFaculties(prev => prev.includes(faculty) ? prev.filter(f => f !== faculty) : [...prev, faculty]);
    };
    const handleAddSelectedFacultyGroups = () => runGroupAction(async () => {
        if (selectedNewFaculties.length === 0) {
            throw new Error("Avval yuqoridagi ro'yxatdan kamida bitta fakultetni tanlang.");
        }
        const next = [...groups.map(g => ({ name: g.name, participantIds: g.participantIds }))];
        selectedNewFaculties.forEach(faculty => next.push({ name: faculty, participantIds: [] }));
        await db.setCompetitionGroups(competition.id, next);
        setSelectedNewFaculties([]);
    });

    const handleAssignTeamToGroup = (teamId, groupName) => runGroupAction(async () => {
        const updated = groups.map(g => ({
            name: g.name,
            participantIds: g.name === groupName
                ? [...g.participantIds.filter(id => id !== teamId), teamId]
                : g.participantIds.filter(id => id !== teamId)
        }));
        await db.setCompetitionGroups(competition.id, updated);
    });

    const toggleTeamSelected = (teamId) => {
        setSelectedTeamIds(prev => prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]);
    };
    // Bulk version of handleAssignTeamToGroup — tick several teams, pick one target group, one click.
    const handleBulkAssignTeams = () => runGroupAction(async () => {
        if (!bulkTargetGroup || selectedTeamIds.length === 0) return;
        const selectedSet = new Set(selectedTeamIds);
        const updated = groups.map(g => ({
            name: g.name,
            participantIds: g.name === bulkTargetGroup
                ? [...g.participantIds.filter(id => !selectedSet.has(id)), ...selectedTeamIds]
                : g.participantIds.filter(id => !selectedSet.has(id))
        }));
        await db.setCompetitionGroups(competition.id, updated);
        setSelectedTeamIds([]);
    });

    // Randomly distributes every team NOT YET in any group evenly across the currently-defined groups
    // ("qura tashlash") — already-assigned teams are left exactly where they are, so this is safe to
    // click again later (e.g. after adding a group, or after a new team registers) without reshuffling
    // teams that were already placed, manually or by a previous click. `avoidFaculty` (checkbox, default
    // on) additionally spreads each real faculty thin across groups instead of letting one group fill up
    // with teams from the same faculty first — same anti-clustering lever
    // CompetitionAdvancementPanel.jsx's own "Aralash: tasodifiy taqsimlash" uses.
    const handleAutoAssignGroups = ({ avoidFaculty, balanceSizes }) => runGroupAction(async () => {
        if (groups.length === 0) throw new Error("Avval kamida bitta guruh qo'shing.");
        const assignedIds = new Set(groups.flatMap(g => g.participantIds));
        const unassignedTeams = shuffle(competition.participants.filter(p => !assignedIds.has(p.id)));
        if (unassignedTeams.length === 0) throw new Error("Taqsimlanmagan jamoa yo'q — barcha jamoalar allaqachon guruhda.");
        const updated = groups.map(g => ({ name: g.name, participantIds: [...g.participantIds] }));
        const counts = new Map(updated.map((g, i) => [i, g.participantIds.length]));
        const facultyCounts = new Map(updated.map((g, i) => [i, new Map()]));
        updated.forEach((g, i) => {
            g.participantIds.forEach(teamId => {
                const f = db.inferTeamFaculty(teamId) || '?';
                const m = facultyCounts.get(i);
                m.set(f, (m.get(f) || 0) + 1);
            });
        });
        unassignedTeams.forEach(team => {
            const facultyKey = avoidFaculty ? (db.inferTeamFaculty(team.id) || '?') : null;
            let bestIdx = 0;
            updated.forEach((g, i) => {
                if (i === 0) return;
                if (facultyKey != null) {
                    const gFac = facultyCounts.get(i).get(facultyKey) || 0;
                    const bestFac = facultyCounts.get(bestIdx).get(facultyKey) || 0;
                    if (gFac !== bestFac) { if (gFac < bestFac) bestIdx = i; return; }
                }
                if (balanceSizes && counts.get(i) < counts.get(bestIdx)) bestIdx = i;
            });
            updated[bestIdx].participantIds.push(team.id);
            counts.set(bestIdx, counts.get(bestIdx) + 1);
            if (facultyKey != null) {
                const m = facultyCounts.get(bestIdx);
                m.set(facultyKey, (m.get(facultyKey) || 0) + 1);
            }
        });
        await db.setCompetitionGroups(competition.id, updated);
    });

    // Team-select options for match creation — when a group-stage match is being set up with a specific
    // group chosen, only THAT group's own teams are offerable (the confirmed bug: previously showed
    // every team in the competition regardless of group). Playoff matches stay unrestricted — a playoff
    // pairing is deliberately cross-group.
    const groupFilteredTeamIds = matchStage === 'group' && matchGroup
        ? (groups.find(g => g.name === matchGroup)?.participantIds || [])
        : null;
    const teamSelectOptions = groupFilteredTeamIds
        ? competition.participants.filter(p => groupFilteredTeamIds.includes(p.id))
        : competition.participants;

    // A previously-picked team can fall outside the newly-filtered option list (stage/group changed) —
    // clear both picks whenever that filter itself changes, rather than silently submitting a stale id.
    useEffect(() => {
        setMatchTeamT('');
        setMatchTeamI('');
    }, [matchStage, matchGroup]);

    const handleCreateMatch = async () => {
        if (!matchTeamT || (!competition.isSingleSided && (!matchTeamI || matchTeamT === matchTeamI))) return;
        await db.createDebateMatch(competition.id, {
            stage: matchStage,
            groupName: matchStage === 'group' ? (matchGroup || null) : null,
            roundLabel: matchStage === 'playoff' ? matchRoundLabel : null,
            teamTId: matchTeamT,
            teamIId: competition.isSingleSided ? null : matchTeamI,
            createdBy: actingUsername
        });
        setMatchTeamT(''); setMatchTeamI('');
        refresh();
    };

    // Auto-generates the rest of a group's round-robin (every unique pair once, T/I role decided by a
    // coin flip) — skips any pair that already has a group-stage match between them (manual or from an
    // earlier click), so it's also safe to re-run after adding a team to the group.
    const handleAutoGenerateGroupMatches = async (groupName) => {
        const group = groups.find(g => g.name === groupName);
        if (!group || group.participantIds.length < 2) return;
        const existingPairs = new Set(
            matches.filter(m => m.stage === 'group' && m.groupName === groupName)
                .map(m => [m.teamTId, m.teamIId].sort().join('|'))
        );
        const teamIds = group.participantIds;
        for (let i = 0; i < teamIds.length; i++) {
            for (let j = i + 1; j < teamIds.length; j++) {
                const pairKey = [teamIds[i], teamIds[j]].sort().join('|');
                if (existingPairs.has(pairKey)) continue;
                const [teamTId, teamIId] = Math.random() < 0.5 ? [teamIds[i], teamIds[j]] : [teamIds[j], teamIds[i]];
                await db.createDebateMatch(competition.id, { stage: 'group', groupName, teamTId, teamIId, createdBy: actingUsername });
            }
        }
        refresh();
    };

    const handleDeleteMatch = async (matchId) => {
        try {
            await db.deleteDebateMatch(matchId);
            refresh();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleFinishMatch = async (matchId, manualWinnerTeamId = null) => {
        try {
            await db.finishDebateMatch(matchId, actingUsername, manualWinnerTeamId);
            setTieMatchId(null);
            refresh();
        } catch (err) {
            if (err.message.includes("qo'lda tanla")) {
                setTieMatchId(matchId);
            } else {
                alert(err.message);
            }
        }
    };

    const allSlotsScored = (matchId) => {
        const scores = db.getDebateNotiqScores(matchId);
        return slots.every(slot => scores.some(s => s.notiqSlot === slot));
    };

    // Bulk variant of the per-match "Avtomatik notiqlar" button — runs the exact same fill-only-empty-
    // slots logic across EVERY not-yet-finished match in one click, instead of opening each match's own
    // Notiqlar panel one at a time. Finished matches are deliberately skipped — backfilling a lineup
    // after a match has already been scored/closed wouldn't reflect who actually spoke.
    const handleAutoAssignAllLineups = async () => {
        for (const m of matches.filter(m => m.status !== 'finished')) {
            await autoAssignLineupForMatch(m.id, m.teamTId, m.teamIId, actingUsername, slots);
        }
        refresh();
        setBulkLineupConfirm(true);
        setTimeout(() => setBulkLineupConfirm(false), 1800);
    };

    const standingsByGroup = useMemo(() => {
        return groups.map(g => ({
            name: g.name,
            rows: computeDebateGroupStandings(
                matches.filter(m => m.groupName === g.name),
                competition.participants.filter(p => g.participantIds.includes(p.id))
            )
        }));
    }, [groups, matches, competition.participants]);

    const groupMatches = matches.filter(m => m.stage === 'group');
    const playoffMatches = matches.filter(m => m.stage === 'playoff');

    const BenchAttendancePanel = ({ match }) => {
        const [aversion, setAversion] = useState(0);
        const roster = db.getDebateMatchBenchRoster(match.id);
        const locked = db.isAttendanceUnitLocked(competition.id, 'competition', 'debate_match_bench', match.id);
        const lockInfo = db.getActivityAttendanceLock(competition.id, 'competition', 'debate_match_bench', match.id);
        const existingAttendance = db.getActivityAttendance(competition.id, 'competition', 'debate_match_bench', match.id);
        const auditEntries = db.getActivityAttendanceForActivity(competition.id, 'competition')
            .filter(a => a.leafUnitType === 'debate_match_bench' && a.leafUnitId === match.id)
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
                    await db.setActivityAttendanceBulk(competition.id, 'competition', 'debate_match_bench', match.id, entries, actingUsername, reason);
                    setAversion(v => v + 1);
                }}
                onReopen={async () => {
                    await db.reopenActivityAttendanceUnit(competition.id, 'competition', 'debate_match_bench', match.id, actingUsername);
                    setAversion(v => v + 1);
                }}
            />
        );
    };

    const LineupPanel = ({ match }) => {
        const [lversion, setLversion] = useState(0);
        const lineup = db.getDebateMatchLineup(match.id);
        const tMembers = db.getTeamMembers(match.teamTId);
        const iMembers = match.teamIId ? db.getTeamMembers(match.teamIId) : [];
        const memberOptions = (slot) => (slot.startsWith('I') ? iMembers : tMembers);

        const handleAssign = async (slot, memberUserId) => {
            await db.setDebateMatchLineup(match.id, slot, memberUserId, actingUsername);
            setLversion(v => v + 1);
        };

        const handleAutoAssignLineup = async () => {
            await autoAssignLineupForMatch(match.id, match.teamTId, match.teamIId, actingUsername, slots);
            setLversion(v => v + 1);
        };

        return (
            <div className="space-y-2">
                <div className="flex justify-end">
                    <button type="button" onClick={handleAutoAssignLineup} className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg">
                        <Shuffle size={12} /> Avtomatik notiqlar
                    </button>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {slots.map(slot => {
                        const current = lineup.find(l => l.notiqSlot === slot)?.memberUserId || '';
                        return (
                            <div key={slot} className="flex items-center gap-1.5 text-xs">
                                <span className={`font-bold w-6 shrink-0 ${slot.startsWith('I') ? 'text-rose-600' : 'text-indigo-600'}`}>{slot}</span>
                                <select
                                    value={current}
                                    onChange={e => handleAssign(slot, e.target.value)}
                                    className="flex-1 px-2 py-1 border rounded-lg text-xs min-w-0"
                                >
                                    <option value="">Tanlanmagan</option>
                                    {memberOptions(slot).map(m => (
                                        <option key={m.userId} value={m.userId}>{m.student?.fullName || m.userId}</option>
                                    ))}
                                </select>
                            </div>
                        );
                    })}
                </div>
            </div>
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

                    {groupError && (
                        <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            {groupError}
                        </p>
                    )}

                    {/* Ro'yxatdan tayyor fakultet tanlash — CompetitionAdvancementPanel.jsx'dagi bir xil
                        checkbox usuli, xato/qo'sh nom xavfisiz bir nechta guruhni bir zumda qo'shadi. */}
                    {availableFaculties.length > 0 && (
                        <div className="p-3 bg-white border border-gray-200 rounded-xl space-y-2">
                            <p className="text-[11px] font-bold text-gray-600">Ro'yxatdan tayyor tanlang (jamoalarning haqiqiy fakultetlari)</p>
                            {/* Plain toggle buttons rather than <label><input type="checkbox">: the whole chip
                                is the click target, with no label-for/checkbox event indirection to get
                                stuck on, and the selected state is unmistakable. */}
                            <div className="flex flex-wrap gap-2">
                                {availableFaculties.map(faculty => {
                                    const isSelected = selectedNewFaculties.includes(faculty);
                                    return (
                                        <button
                                            key={faculty}
                                            type="button"
                                            onClick={() => handleToggleFacultyCheckbox(faculty)}
                                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                                                isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                            }`}
                                        >
                                            {isSelected && <CheckCircle2 size={12} />}
                                            {faculty}
                                        </button>
                                    );
                                })}
                            </div>
                            {/* Never a silently-dead disabled button — if nothing is picked yet, say so. */}
                            <Button
                                variant="outline" size="sm" icon={Plus}
                                onClick={handleAddSelectedFacultyGroups}
                            >
                                Tanlangan {selectedNewFaculties.length > 0 ? `${selectedNewFaculties.length} ta ` : ''}fakultetni guruh sifatida qo'shish
                            </Button>
                        </div>
                    )}

                    {groups.length > 0 && (
                        <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl space-y-2">
                            <p className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                                <Shuffle size={13} /> Tasodifiy taqsimlash — cheklovlar
                            </p>
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={randomConstraints.avoidFaculty}
                                        onChange={e => setRandomConstraints(c => ({ ...c, avoidFaculty: e.target.checked }))}
                                        className="w-3.5 h-3.5"
                                    />
                                    Bir fakultetning jamoalari bitta guruhga to'planib qolmasin
                                </label>
                                <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={randomConstraints.balanceSizes}
                                        onChange={e => setRandomConstraints(c => ({ ...c, balanceSizes: e.target.checked }))}
                                        className="w-3.5 h-3.5"
                                    />
                                    Guruhlar sonini imkon qadar teng ushlab turish
                                </label>
                            </div>
                            <Button variant="outline" size="sm" icon={Shuffle} onClick={() => handleAutoAssignGroups(randomConstraints)}>
                                Guruhsiz jamoalarni tasodifiy taqsimlash
                            </Button>
                        </div>
                    )}

                    {groups.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap p-2.5 bg-white border border-dashed border-gray-200 rounded-xl">
                            <span className="text-[11px] font-semibold text-gray-600 shrink-0">Tanlangan: {selectedTeamIds.length}</span>
                            <select
                                value={bulkTargetGroup}
                                onChange={e => setBulkTargetGroup(e.target.value)}
                                className="px-2 py-1 border rounded-lg text-xs flex-1 min-w-[140px]"
                            >
                                <option value="">Guruh tanlang...</option>
                                {groups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
                            </select>
                            <Button
                                variant="outline" size="sm"
                                disabled={selectedTeamIds.length === 0 || !bulkTargetGroup}
                                onClick={handleBulkAssignTeams}
                            >
                                Tanlanganlarni biriktirish
                            </Button>
                            <label className="flex items-center gap-1.5 text-[11px] text-gray-500 ml-auto cursor-pointer">
                                <input type="checkbox" checked={hideAssignedTeams} onChange={e => setHideAssignedTeams(e.target.checked)} className="w-3.5 h-3.5" />
                                Faqat guruhsizlarni ko'rsatish
                            </label>
                        </div>
                    )}

                    {groups.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
                            {competition.participants
                                .filter(p => !hideAssignedTeams || !groups.some(g => g.participantIds.includes(p.id)))
                                .map(p => {
                                const currentGroup = groups.find(g => g.participantIds.includes(p.id))?.name || '';
                                return (
                                    <div key={p.id} className="flex items-center justify-between gap-2 p-2 bg-slate-50 rounded-lg text-xs">
                                        <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedTeamIds.includes(p.id)}
                                                onChange={() => toggleTeamSelected(p.id)}
                                                className="w-3.5 h-3.5 shrink-0"
                                            />
                                            <span className="text-gray-400 font-mono text-[10px] shrink-0 w-6 text-right">{teamOrderIndex.get(p.id)}.</span>
                                            <span className="font-semibold text-gray-700 truncate">{p.name}</span>
                                        </label>
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
                                <div className="bg-slate-50 px-3 py-2 text-xs font-bold text-gray-600 flex items-center justify-between gap-2">
                                    <span>Guruh {sg.name}</span>
                                    {hasFullAdminAccess() && (
                                        <button type="button" onClick={() => handleAutoGenerateGroupMatches(sg.name)} className="flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg">
                                            <Shuffle size={11} /> Avtomatik uchrashuvlar
                                        </button>
                                    )}
                                </div>
                                <table className="w-full text-left text-xs">
                                    <thead className="text-gray-400 uppercase">
                                        <tr>
                                            <th className="p-2">Jamoa</th>
                                            <th className="p-2 text-center">O'</th>
                                            <th className="p-2 text-center">G'</th>
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
                                                <td className="p-2 text-center text-rose-500">{row.lost}</td>
                                                <td className="p-2 text-center">{row.pointsDifference > 0 ? `+${row.pointsDifference}` : row.pointsDifference}</td>
                                                <td className="p-2 text-center font-extrabold text-indigo-600">{row.points}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
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
                        {matchStage === 'group' ? (
                            <select value={matchGroup} onChange={e => setMatchGroup(e.target.value)} className="px-3 py-2 border rounded-xl text-xs">
                                <option value="">Guruhsiz</option>
                                {groups.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
                            </select>
                        ) : (
                            <select value={matchRoundLabel} onChange={e => setMatchRoundLabel(e.target.value)} className="px-3 py-2 border rounded-xl text-xs">
                                {PLAYOFF_ROUND_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                        )}
                        
                        <select value={matchTeamT} onChange={e => setMatchTeamT(e.target.value)} className="px-3 py-2 border rounded-xl text-xs">
                            <option value="">{competition.sideTLabel || '1-Tomon'} Jamoasi</option>
                            {teamSelectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>

                        {!competition.isSingleSided && (
                            <>
                                <span className="text-xs text-gray-400">vs</span>
                                <select value={matchTeamI} onChange={e => setMatchTeamI(e.target.value)} className="px-3 py-2 border rounded-xl text-xs">
                                    <option value="">{competition.sideILabel || '2-Tomon'} Jamoasi</option>
                                    {teamSelectOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </>
                        )}

                        {matchStage === 'group' && !matchGroup && (
                            <span className="text-[10px] text-amber-500">Guruh tanlansa, faqat o'sha guruh jamoalari ko'rsatiladi</span>
                        )}
                        <Button 
                            variant="primary" 
                            size="sm" 
                            icon={Plus} 
                            disabled={!matchTeamT || (!competition.isSingleSided && (!matchTeamI || matchTeamT === matchTeamI))} 
                            onClick={handleCreateMatch}
                        >
                            Yaratish
                        </Button>
                    </div>
                </div>
            )}

            {!isCourt && hasFullAdminAccess() && matches.some(m => m.status !== 'finished') && (
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" icon={Shuffle} onClick={handleAutoAssignAllLineups}>
                        Barchasi uchun avtomatik notiqlar
                    </Button>
                    <span className="text-[10px] text-gray-400">
                        Har bir uchrashuvning faqat bo'sh notiq joylarini to'ldiradi — allaqachon tanlanganlarga tegmaydi
                    </span>
                    {bulkLineupConfirm && <span className="text-[11px] font-bold text-emerald-600">✓ To'ldirildi</span>}
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
                                        <span className="font-semibold text-sm text-indigo-700 truncate">{teamName(m.teamTId)}</span>
                                        {competition.isSingleSided ? (
                                            m.status === 'finished' ? (
                                                <Badge variant="success" size="sm">Baholandi: {m.scoreT} ball</Badge>
                                            ) : (
                                                <Badge variant="default" size="sm">Baholanmagan</Badge>
                                            )
                                        ) : (
                                            <>
                                                {m.status === 'finished' ? (
                                                    <span className="font-extrabold text-gray-700 shrink-0">{m.scoreT} : {m.scoreI}</span>
                                                ) : (
                                                    <span className="text-xs text-gray-400 shrink-0">vs</span>
                                                )}
                                                <span className="font-semibold text-sm text-rose-700 truncate">{teamName(m.teamIId)}</span>
                                            </>
                                        )}
                                        {m.roundLabel && <Badge variant="default" size="sm">{m.roundLabel}</Badge>}
                                        {m.groupName && <Badge variant="info" size="sm">{m.groupName}</Badge>}
                                        {m.status === 'finished' && m.winnerTeamId && !competition.isSingleSided && (
                                            <Badge variant="success" size="sm">G'olib: {teamName(m.winnerTeamId)}{m.tieBreakManual ? ' (qo\'lda)' : ''}</Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {!isCourt && hasFullAdminAccess() && m.status !== 'finished' && (
                                            <button type="button" onClick={() => setExpandedMatchId(expandedMatchId === m.id ? null : m.id)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 rounded-lg">
                                                {expandedMatchId === m.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Notiqlar
                                            </button>
                                        )}
                                        {canManageAttendance?.() && (
                                            <button type="button" onClick={() => setAttendanceMatchId(attendanceMatchId === m.id ? null : m.id)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 rounded-lg">
                                                {attendanceMatchId === m.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Davomat
                                            </button>
                                        )}
                                        {m.status !== 'finished' && (
                                            <button type="button" onClick={() => setScoringMatchId(m.id)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg">
                                                <Gavel size={12} /> Baholash
                                            </button>
                                        )}
                                        {hasFullAdminAccess() && m.status !== 'finished' && allSlotsScored(m.id) && (
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
                                {tieMatchId === m.id && (
                                    <div className="px-3 pb-3 flex items-center gap-2 text-xs">
                                        <span className="font-semibold text-amber-600">Durang — g'olibni tanlang:</span>
                                        <Button variant="outline" size="sm" onClick={() => handleFinishMatch(m.id, m.teamTId)}>{teamName(m.teamTId)}</Button>
                                        <Button variant="outline" size="sm" onClick={() => handleFinishMatch(m.id, m.teamIId)}>{teamName(m.teamIId)}</Button>
                                    </div>
                                )}
                                {expandedMatchId === m.id && (
                                    <div className="px-3 pb-3">
                                        <LineupPanel match={m} />
                                    </div>
                                )}
                                {attendanceMatchId === m.id && (
                                    <div className="px-3 pb-3">
                                        <BenchAttendancePanel match={m} />
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

            {scoringMatchId && (
                <DebateNotiqScoringPanel
                    competition={competition}
                    match={matches.find(m => m.id === scoringMatchId)}
                    onClose={() => setScoringMatchId(null)}
                    onChanged={refresh}
                />
            )}
        </div>
    );
};

export default DebateMatchesTab;
