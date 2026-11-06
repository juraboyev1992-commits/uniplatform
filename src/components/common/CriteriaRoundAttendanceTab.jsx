import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import Badge from './Badge';
import { db } from '../../services/db';
import { resolveAttendanceLeafUnitId, getAttendanceUnitPlan } from '../../config/competitionEngines';
import ActivityAttendancePanel from './ActivityAttendancePanel';

// The generic "Davomat" tab (TournamentScoring.jsx's 'davomat' tab) for every TEAM-type competition that
// isn't match_play/debate_match (those get their own dedicated per-match toggle instead) — correct_answer/
// quiz_mixed/criteria_based/single_score all assign one shared score to the team, never to each member, so
// none of them proves individual attendance on their own. A genuinely separate tab from "Natija kiritish"
// so an attendance-only delegate (no result_entry/live_scoring) can still reach it.
//
// Owns its OWN round-group selector rather than reusing TournamentScoring.jsx's `currentRound` — that
// state is a RAW round/question index (e.g. 1..144 for a 12x12 Zakovat), not a leaf-unit number, and
// would render one pill per raw question for correct_answer. getAttendanceUnitPlan gives the same
// numbering CompetitionRoundsTab.jsx's cards use (its `card.index`, the TRUE global Raund number) —
// both sides must agree on this since CompetitionRoundsTab's "Yakunlash" is what actually locks a
// given leaf unit.
//
// TANLAGICH TUR BO'YICHA GURUHLANADI. Ilgari bu yerda birliklar tekis ro'yxat
// bo'lib chiqardi va 25-savol ko'rinishidagi turnirda (4 Tur x 25 savol) ekranda
// NIMA EKANI YOZILMAGAN 100 ta raqamli tugma turardi. "Raundlar" bo'limi ayni
// o'sha birliklarni Tur bo'yicha ajratib ko'rsatadi; ikki ekran bir xil narsani
// boshqacha ko'rsatmasligi kerak. Raqamlarning o'zi (va demak saqlangan davomat
// yozuvlari) o'zgarmadi - faqat guruhlandi va nomlandi.
// Shundan oshsa tugmalar devori o'rniga ro'yxat chiqadi. Bitta Tur odatda
// 25 tagacha birlikdan iborat (25-savol ko'rinishi) - shu chegara tugmalar
// qatorini bir-ikki satrda ushlab turadi.
const PILL_LIMIT = 26;

const CriteriaRoundAttendanceTab = ({ competition, canManageAttendance, hasFullAdminAccess, actingUsername }) => {
    const [version, setVersion] = useState(0);
    const [expandedTeamId, setExpandedTeamId] = useState(null);
    const refresh = () => setVersion(v => v + 1);

    const plan = useMemo(() => getAttendanceUnitPlan(competition), [competition]);
    const perUnit = competition.attendanceGranularity !== 'whole_competition'
        && plan.groups.some(g => g.units.length > 0)
        && plan.groups.reduce((n, g) => n + g.units.length, 0) > 1;

    const [selectedTur, setSelectedTur] = useState(1);
    const [selectedRoundGroup, setSelectedRoundGroup] = useState(1);
    // Ochilganda joriy bosqich tanlangan bo'lsin - admin musobaqa qaysi joyda
    // turgan bo'lsa, davomat ham o'sha yerdan boshlanadi.
    useEffect(() => {
        const turIdx = plan.groups.findIndex(g => g.units.some(u => u.index === plan.currentIndex));
        const tur = turIdx >= 0 ? turIdx + 1 : 1;
        setSelectedTur(tur);
        setSelectedRoundGroup(
            turIdx >= 0 ? plan.currentIndex : (plan.groups[0]?.units[0]?.index ?? 1)
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [competition.id]);

    const activeGroup = plan.groups[selectedTur - 1] || plan.groups[0] || { label: null, units: [] };
    const selectedUnit = activeGroup.units.find(u => u.index === selectedRoundGroup)
        || plan.groups.flatMap(g => g.units).find(u => u.index === selectedRoundGroup)
        || null;

    const unitPos = activeGroup.units.findIndex(u => u.index === selectedRoundGroup);
    const stepUnit = (delta) => {
        const next = activeGroup.units[unitPos + delta];
        if (next) setSelectedRoundGroup(next.index);
    };

    const pickTur = (turNumber) => {
        setSelectedTur(turNumber);
        const first = plan.groups[turNumber - 1]?.units[0];
        if (first) setSelectedRoundGroup(first.index);
    };

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
        <div className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                    <h3 className="font-bold text-lg text-gray-900">
                        Davomat
                        {perUnit && selectedUnit && (
                            <span className="text-indigo-600"> — {activeGroup.label ? `${activeGroup.label}, ` : ''}{selectedUnit.label}</span>
                        )}
                    </h3>
                    <p className="text-xs text-gray-400">
                        Jamoaga umumiy ball qo'yilishi a'zolarning ishtirokini alohida tasdiqlamaydi — har bir a'zoning shu bosqichda hozir bo'lganini shu yerda belgilang.
                    </p>
                </div>
                {/* Tur tanlagich - "Raundlar" bo'limidagi bilan bir xil. */}
                {perUnit && plan.groups.length > 1 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {plan.groups.map((g, i) => (
                            <button
                                key={g.label || i}
                                type="button"
                                onClick={() => pickTur(i + 1)}
                                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all border ${
                                    selectedTur === i + 1
                                        ? 'bg-indigo-700 border-indigo-700 text-white'
                                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                {g.label || `${i + 1}-Tur`}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* BIRLIK TANLAGICH.
                //
                Raqamlarning ustida endi ular nima ekani yozilgan - ilgari
                ekranda sababsiz raqamlar qatori turardi.
                //
                Ko'p bo'lsa tugmalar devori emas, ro'yxat. Tur bo'yicha
                guruhlash ko'p holatda yetarli, lekin Tursiz tuzilmada
                (masalan 100 raundli turnir) baribir bitta uzun qator
                qolardi - PILL_LIMIT dan oshsa ro'yxat ko'rinishiga o'tadi,
                shunda shakl musobaqa kattaligidan qat'i nazar bir xil
                bo'ladi. */}
            {perUnit && activeGroup.units.length > 1 && (
                <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                        Qaysi {plan.leafLabel.toLowerCase()} uchun belgilanmoqda
                    </p>
                    {activeGroup.units.length <= PILL_LIMIT ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {activeGroup.units.map(u => (
                                <button
                                    key={u.index}
                                    type="button"
                                    title={u.label}
                                    onClick={() => setSelectedRoundGroup(u.index)}
                                    className={`min-w-[2.25rem] px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all border ${
                                        selectedRoundGroup === u.index
                                            ? 'bg-indigo-700 border-indigo-700 text-white'
                                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    {u.label.split('-')[0]}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => stepUnit(-1)}
                                disabled={unitPos <= 0}
                                className="flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 bg-white text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                                title="Oldingisi"
                            >
                                <ChevronLeft size={15} />
                            </button>
                            <select
                                value={selectedRoundGroup}
                                onChange={e => setSelectedRoundGroup(Number(e.target.value))}
                                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-800 min-w-[10rem]"
                            >
                                {activeGroup.units.map(u => (
                                    <option key={u.index} value={u.index}>{u.label}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => stepUnit(1)}
                                disabled={unitPos >= activeGroup.units.length - 1}
                                className="flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 bg-white text-gray-600 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                                title="Keyingisi"
                            >
                                <ChevronRight size={15} />
                            </button>
                            <span className="text-xs text-gray-400">
                                {unitPos + 1} / {activeGroup.units.length}
                            </span>
                        </div>
                    )}
                </div>
            )}

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
