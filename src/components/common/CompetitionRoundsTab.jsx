import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Copy, Shuffle, Play, CheckCircle2, ChevronRight, Users, Lock } from 'lucide-react';
import Button from './Button';
import Badge from './Badge';
import Modal from './Modal';
import { db } from '../../services/db';
import { getDisplayStages, getDisplayStageLeafLabel, resolveAttendanceLeafUnitId, isMatchBasedEngine } from '../../config/competitionEngines';
import CompetitionAdvancementPanel from './CompetitionAdvancementPanel';

// TSUL Court case-role options (judge/prosecutor/defense/accused/witness/clerk) — shown per round when
// the "Rollar" action is used. Harmless/unused for non-court competitions (Zakovat, etc.), so it's not
// gated behind a specific preset check — just an optional per-round overlay any competition can ignore.
const CASE_ROLE_LABELS = {
    judge: 'Sudya', prosecutor: 'Prokuror', defense: 'Himoyachi',
    accused: 'Ayblanuvchi', witness: 'Guvoh', clerk: 'Kotib'
};

// "Turlarni boshqarish" — round cards, now nested under real Tur boundaries (getDisplayStages, same
// shared resolver Natija kiritish/Natijalar markazi/Reyting all use) instead of one long flat list.
// A card's `index` (the db.upsertCompetitionRound/getCompetitionRounds KEY) is always the TRUE GLOBAL
// raund-group number — it must match exactly what Natija kiritish's own "Turni qulflash" computes
// (Math.ceil(rawStart/questionsPerRound)), so locking a raund there and editing it here refer to the
// SAME record. `localIndex` (the "N-Raund" label) is display-only and resets per Tur.
const STATUS_LABELS = { draft: 'Qoralama', ready: 'Tayyor', active: 'Faol', finished: 'Yakunlangan' };
const STATUS_VARIANTS = { draft: 'default', ready: 'info', active: 'primary', finished: 'success' };

const CompetitionRoundsTab = ({ competition, hasFullAdminAccess, canManageGroups, actingUsername, onOpenRound, onCompetitionUpdated }) => {
    const [version, setVersion] = useState(0);
    const [editingIndex, setEditingIndex] = useState(null);
    const [editName, setEditName] = useState('');
    const [editDuration, setEditDuration] = useState('');
    const [roleRoundIndex, setRoleRoundIndex] = useState(null);

    const isQuizScoring = competition.scoringMethod === 'correct_answer';
    const questionsPerGroup = competition.questionsPerRound || 12;

    const stages = useMemo(() => getDisplayStages(competition), [competition]);
    const hasStages = isQuizScoring && !!(stages && stages.length > 0);

    // Real Tur boundaries for ANY quiz_mixed competition (UniQuiz's raund-leaf shape, 25-savol's
    // savol-leaf shape, or a free-structure competition built with the Bosqichlar va o'tish qoidalari
    // feature) — was previously scoped to leaf==='raund' only (UniQuiz-shaped), which meant 25-savol's
    // Guruh bosqichlari advancement panel (below, gated on stages.length>1 alone) showed real Tur
    // boundaries while THIS card grid stayed a flat, ungrouped list of all 25 savol — the exact "not in
    // sync" mismatch a 25-savol competition surfaces. Kept as an independent flag from `hasStages`/
    // `isQuizScoring` on purpose, since those drive the correct_answer raund-group card math
    // (questionsPerRound-sized chunks), which doesn't apply here (each card is exactly one raw round/
    // savol, no further grouping) regardless of what that raw unit is actually called.
    const stageLeafLabel = getDisplayStageLeafLabel(competition) || 'raund';
    const isUniQuizStaged = competition.scoringMethod === 'quiz_mixed' && !!(stages && stages.length > 1);
    // Per-boundary advancement panel visibility — separate from isUniQuizStaged (which also drives the
    // round-card grid's UniQuiz-specific rendering and must stay scoped to the exact raund-is-leaf shape).
    // Any quiz_mixed competition with 2+ real Tur can use it now, regardless of leaf shape or whether
    // guruh(lar) exist — computeFacultyAdvancement (db.js) transparently falls back to one implicit
    // "Barchasi" group when no real guruh was created, which is exactly "Kubok" (global elimination, no
    // fakultet/kurs split); creating real guruh(lar) turns the SAME panel into "Bosqichli" (per-guruh
    // elimination) — one mechanism, the admin's own guruh choice (or lack of one) decides which.
    // correct_answer (Zakovat/Breyn-ring) needs the exact same mechanism as quiz_mixed — a Kubok/Liga
    // build with 5 Tur, each an independent Top-N cut into the next, is exactly what this panel already
    // computes generically (computeFacultyAdvancement sums roundScores over each stage's own range,
    // regardless of scoringMethod). Only isQuizScoring/isUniQuizStaged (card-grid rendering) stay scoped
    // to their original single engine each.
    const hasGuruhAdvancement = ['quiz_mixed', 'correct_answer'].includes(competition.scoringMethod) && !!(stages && stages.length > 1);
    // Whether the "Tur tanlash" pill row (and Tur-scoped card filtering) applies at all — correct_answer
    // League/Cup (hasStages) or UniQuiz (isUniQuizStaged). Every other scoring method keeps its original
    // flat, ungrouped card list untouched.
    const showTurSelector = hasStages || isUniQuizStaged;

    const [selectedTurIndex, setSelectedTurIndex] = useState(1);
    useEffect(() => {
        if (!showTurSelector) return;
        const cur = competition.currentRound || 1;
        const idx = stages.findIndex(s => cur >= s.roundRange[0] && cur <= s.roundRange[1]);
        setSelectedTurIndex(idx >= 0 ? idx + 1 : 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [competition.id]);

    // "Yangi raund"/"Nusxalash" only ever append to the very end of the competition (their original
    // behavior too) — only allowed while viewing the LAST Tur, since inserting into an earlier Tur would
    // require renumbering every later Tur's raw round range, which isn't supported. UniQuiz never allows
    // it at all regardless of which Tur is selected — see `canAddRounds` below (its 27-round/3-stage
    // shape is a fixed preset, not admin-extensible; adding a raw round would leave it with no
    // corresponding UNIQUIZ_ROUND_RULES entry).
    const isLastTurSelected = !showTurSelector || selectedTurIndex === stages.length;
    const canAddRounds = !isUniQuizStaged;

    const globalGroupCount = isQuizScoring ? Math.ceil(competition.roundsCount / questionsPerGroup) : competition.roundsCount;
    const currentGlobalGroup = isQuizScoring
        ? Math.max(1, Math.ceil((competition.currentRound || 1) / questionsPerGroup))
        : (competition.currentRound || 1);

    const caseRolesByParticipant = useMemo(() => {
        if (roleRoundIndex == null) return new Map();
        const roles = db.getCompetitionCaseRoles(competition.id, roleRoundIndex);
        return new Map(roles.map(r => [r.participantId, r.role]));
    }, [competition.id, roleRoundIndex, version]);

    const handleSetCaseRole = (participantId, role) => {
        db.setCompetitionCaseRole(competition.id, roleRoundIndex, participantId, role, actingUsername);
        refresh();
    };

    const overlayByIndex = useMemo(() => {
        const rounds = db.getCompetitionRounds(competition.id);
        return new Map(rounds.map(r => [r.index, r]));
    }, [competition.id, version]);

    const buildCard = (globalIndex, localIndex, rawStart, rangeEnd, leafSuffix = 'Raund') => {
        const overlay = overlayByIndex.get(globalIndex);
        const isCompleted = globalIndex < currentGlobalGroup;
        const isActive = globalIndex === currentGlobalGroup;
        const defaultStatus = isCompleted ? 'finished' : isActive ? 'active' : 'ready';
        const defaultQuestionCount = isQuizScoring
            ? Math.min(questionsPerGroup, rangeEnd - rawStart + 1)
            : null;
        return {
            index: globalIndex,
            localIndex,
            rawStart,
            // Canonical terms: a correct_answer round-group is a "Raund" (group of questions), never a
            // "Tur" (stage/phase) — that level is the new Tur selector above the card grid. quiz_mixed's
            // own leaf unit (UniQuiz: raund, 25-savol: savol) overrides the default via leafSuffix.
            name: overlay?.name || `${localIndex}-${leafSuffix}`,
            questionCount: overlay?.questionCount ?? defaultQuestionCount,
            plannedDurationMin: overlay?.plannedDurationMin ?? null,
            status: overlay?.status || defaultStatus,
            locked: !!overlay?.locked,
            displayOrder: overlay?.displayOrder ?? globalIndex
        };
    };

    const cards = useMemo(() => {
        if (isUniQuizStaged) {
            // Each card is exactly ONE raw round/savol (already the leaf unit, no further grouping) —
            // filtered down to the SELECTED Tur's own range, same `index` (=the raw round number itself)
            // as Natija kiritish's own "Turni qulflash" already uses for this preset, so locking a
            // raund/savol here and there refer to the exact same overlay record.
            const stage = stages[selectedTurIndex - 1] || stages[0];
            const [turStart, turEnd] = stage.roundRange;
            const leafSuffix = stageLeafLabel === 'savol' ? 'Savol' : 'Raund';
            return Array.from({ length: turEnd - turStart + 1 }, (_, i) => {
                const rawRound = turStart + i;
                return buildCard(rawRound, i + 1, rawRound, rawRound, leafSuffix);
            }).sort((a, b) => a.displayOrder - b.displayOrder);
        }
        if (!isQuizScoring) {
            return Array.from({ length: competition.roundsCount }, (_, i) => buildCard(i + 1, i + 1, i + 1, competition.roundsCount))
                .sort((a, b) => a.displayOrder - b.displayOrder);
        }
        if (!hasStages) {
            return Array.from({ length: globalGroupCount }, (_, i) => buildCard(i + 1, i + 1, i * questionsPerGroup + 1, competition.roundsCount))
                .sort((a, b) => a.displayOrder - b.displayOrder);
        }
        const stage = stages[selectedTurIndex - 1] || stages[0];
        const [turStart, turEnd] = stage.roundRange;
        const list = [];
        let localIdx = 0;
        for (let start = turStart; start <= turEnd; start += questionsPerGroup) {
            localIdx++;
            const globalIdx = Math.ceil(start / questionsPerGroup);
            list.push(buildCard(globalIdx, localIdx, start, turEnd));
        }
        return list.sort((a, b) => a.displayOrder - b.displayOrder);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isQuizScoring, isUniQuizStaged, hasStages, stages, selectedTurIndex, globalGroupCount, questionsPerGroup, overlayByIndex, currentGlobalGroup, competition.roundsCount]);

    const refresh = () => {
        setVersion(v => v + 1);
        onCompetitionUpdated?.();
    };

    // Extends the LAST Tur's own roundRange (when the competition has REAL wizard-set stages, not just
    // the display-only fallback) so a newly added raund is never left belonging to no Tur at all — the
    // bug this restructure specifically set out to fix.
    const growRoundsCount = async (addedCount) => {
        const newRoundsCount = (competition.roundsCount || 0) + addedCount;
        const updates = { roundsCount: newRoundsCount };
        if (competition.stages && competition.stages.length > 0) {
            updates.stages = competition.stages.map((s, i) =>
                i === competition.stages.length - 1 ? { ...s, roundRange: [s.roundRange[0], newRoundsCount] } : s
            );
        }
        await db.updateCompetition(competition.id, updates);
        return newRoundsCount;
    };

    const handleAddRound = async () => {
        if (!canAddRounds) return;
        if (hasStages && !isLastTurSelected) return;
        const nextGlobalIndex = globalGroupCount + 1;
        await growRoundsCount(isQuizScoring ? questionsPerGroup : 1);
        await db.upsertCompetitionRound(competition.id, nextGlobalIndex, { status: 'draft', displayOrder: nextGlobalIndex });
        refresh();
    };

    const handleDuplicate = async (card) => {
        if (!canAddRounds) return;
        if (hasStages && !isLastTurSelected) return;
        const nextGlobalIndex = globalGroupCount + 1;
        await growRoundsCount(isQuizScoring ? questionsPerGroup : 1);
        await db.upsertCompetitionRound(competition.id, nextGlobalIndex, {
            name: `${card.name} (nusxa)`,
            plannedDurationMin: card.plannedDurationMin,
            status: 'draft',
            displayOrder: nextGlobalIndex
        });
        refresh();
    };

    const handleShuffle = async () => {
        const order = cards.map(c => c.index);
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        for (let pos = 0; pos < order.length; pos++) {
            await db.upsertCompetitionRound(competition.id, order[pos], { displayOrder: pos + 1 });
        }
        refresh();
    };

    const handleActivate = async (card) => {
        await db.updateCompetition(competition.id, { currentRound: card.rawStart });
        await db.upsertCompetitionRound(competition.id, card.index, { status: 'active' });
        refresh();
    };

    // Real teeth, first time — round `status` used to be purely cosmetic. Every TEAM-type competition
    // reads this as a lock trigger (a team score never proves any specific member showed up, regardless
    // of engine — correct_answer/quiz_mixed/criteria_based/single_score all assign the score to the team
    // as a whole); match_play/debate_match are excluded since they have their own dedicated match-finish
    // lock trigger instead (updateMatchResult/finishDebateMatch). Individual-type competitions keep this
    // button exactly as decorative as it always was — a real per-person score already proves attendance.
    const isTeamRoundBased = competition.type === 'team' && !isMatchBasedEngine(competition.scoringMethod);

    const handleFinish = async (card) => {
        await db.upsertCompetitionRound(competition.id, card.index, { status: 'finished' });
        if (isTeamRoundBased) {
            // card.index is the TRUE global Raund-group number (see this file's own header comment) —
            // the same numbering CriteriaRoundAttendanceTab.jsx's own round-group selector must produce,
            // NOT card.rawStart (which is a raw question index for correct_answer, not a round number).
            // Davomat's own lock tables aren't migrated yet — lockActivityAttendanceUnit stays sync/mock.
            const leafUnitId = resolveAttendanceLeafUnitId(competition, card.index, db.getTurSchedule(competition.id));
            await db.lockActivityAttendanceUnit(competition.id, 'competition', 'criteria_round', leafUnitId, actingUsername);
        }
        refresh();
    };

    const startEdit = (card) => {
        setEditingIndex(card.index);
        setEditName(card.name);
        setEditDuration(card.plannedDurationMin || '');
    };

    const saveEdit = async (card) => {
        await db.upsertCompetitionRound(competition.id, card.index, {
            name: editName.trim() || card.name,
            plannedDurationMin: editDuration ? Number(editDuration) : null
        });
        setEditingIndex(null);
        refresh();
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="font-bold text-lg text-gray-900">Turlarni boshqarish</h3>
                    <p className="text-xs text-gray-400">
                        {isQuizScoring
                            ? `Har biri ${questionsPerGroup} tadan savol`
                            : isUniQuizStaged
                                ? `${competition.roundsCount} ${stageLeafLabel}, ${stages.length} Turda — belgilangan tuzilma`
                                : "Musobaqa raundlari"}
                    </p>
                </div>
                {hasFullAdminAccess() && (
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" icon={Shuffle} onClick={handleShuffle}>
                            Aralashtirish
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            icon={Plus}
                            onClick={handleAddRound}
                            disabled={!canAddRounds || (hasStages && !isLastTurSelected)}
                            title={
                                !canAddRounds
                                    ? "Bu turnir turi belgilangan tuzilmaga ega — yangi raund qo'shib bo'lmaydi"
                                    : (hasStages && !isLastTurSelected)
                                        ? "Faqat oxirgi Turga yangi raund qo'shish mumkin"
                                        : undefined
                            }
                        >
                            Yangi raund
                        </Button>
                    </div>
                )}
            </div>

            {showTurSelector && (
                <div className="flex items-center gap-2 flex-wrap pb-4 border-b border-gray-100">
                    <h4 className="text-xs font-bold text-gray-700 shrink-0">Tur tanlash:</h4>
                    <div className="flex gap-1.5 flex-wrap">
                        {stages.map((stage, idx) => (
                            <button
                                key={stage.label}
                                type="button"
                                onClick={() => setSelectedTurIndex(idx + 1)}
                                className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-all border ${
                                    selectedTurIndex === idx + 1
                                        ? 'bg-indigo-700 border-indigo-700 text-white'
                                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                {stage.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {cards.map(card => (
                    <div key={card.index} className="p-4 bg-white border border-gray-100 rounded-2xl space-y-3 hover:shadow-md transition-shadow">
                        {editingIndex === card.index ? (
                            <div className="space-y-2">
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    className="w-full px-3 py-1.5 border rounded-lg text-sm font-bold"
                                />
                                <input
                                    type="number"
                                    value={editDuration}
                                    onChange={e => setEditDuration(e.target.value)}
                                    placeholder="Vaqt (daqiqa)"
                                    className="w-full px-3 py-1.5 border rounded-lg text-xs"
                                />
                                <div className="flex gap-2">
                                    <Button variant="primary" size="sm" onClick={() => saveEdit(card)}>Saqlash</Button>
                                    <Button variant="outline" size="sm" onClick={() => setEditingIndex(null)}>Bekor</Button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-start justify-between gap-2">
                                    <button
                                        type="button"
                                        onClick={() => onOpenRound?.(card.index)}
                                        className="flex items-center gap-1.5 font-bold text-sm text-gray-800 hover:text-indigo-600 transition-colors text-left"
                                    >
                                        {card.name}
                                        <ChevronRight size={14} />
                                    </button>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {card.locked && <Lock size={12} className="text-amber-500" title="Natija kiritishdan qulflangan" />}
                                        <Badge variant={STATUS_VARIANTS[card.status]} size="sm">
                                            {STATUS_LABELS[card.status]}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
                                    {card.questionCount != null && <span>{card.questionCount} ta savol</span>}
                                    {card.plannedDurationMin != null && <span>{card.plannedDurationMin} daqiqa</span>}
                                </div>
                                {hasFullAdminAccess() && (
                                    <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-50">
                                        <button type="button" onClick={() => startEdit(card)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 rounded-lg">
                                            <Edit size={11} /> Tahrirlash
                                        </button>
                                        {canAddRounds && (
                                            <button type="button" onClick={() => handleDuplicate(card)} disabled={hasStages && !isLastTurSelected} className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed">
                                                <Copy size={11} /> Nusxalash
                                            </button>
                                        )}
                                        {!isUniQuizStaged && (
                                            <button type="button" onClick={() => setRoleRoundIndex(card.index)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 rounded-lg">
                                                <Users size={11} /> Rollar
                                            </button>
                                        )}
                                        {card.status !== 'active' && (
                                            <button type="button" onClick={() => handleActivate(card)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg">
                                                <Play size={11} /> Faollashtirish
                                            </button>
                                        )}
                                        {card.status !== 'finished' && (
                                            <button type="button" onClick={() => handleFinish(card)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 rounded-lg">
                                                <CheckCircle2 size={11} /> Yakunlash
                                            </button>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ))}
            </div>

            {hasGuruhAdvancement && (
                <CompetitionAdvancementPanel
                    competition={competition}
                    stages={stages}
                    canManageGroups={canManageGroups || hasFullAdminAccess}
                    actingUsername={actingUsername}
                    onUpdated={refresh}
                />
            )}

            <Modal
                isOpen={roleRoundIndex != null}
                onClose={() => setRoleRoundIndex(null)}
                title={roleRoundIndex != null ? `Rollar — ${cards.find(c => c.index === roleRoundIndex)?.name || `Raund ${roleRoundIndex}`}` : 'Rollar'}
                size="md"
            >
                <div className="space-y-2">
                    {competition.participants.map(p => {
                        const pName = p.name || p.fullName;
                        const currentRole = caseRolesByParticipant.get(p.id) || '';
                        return (
                            <div key={p.id} className="flex items-center justify-between gap-3 p-2.5 bg-slate-50 rounded-xl">
                                <span className="text-sm font-semibold text-gray-700 truncate">{pName}</span>
                                <select
                                    value={currentRole}
                                    onChange={e => handleSetCaseRole(p.id, e.target.value)}
                                    className="px-2.5 py-1.5 border rounded-lg text-xs shrink-0"
                                >
                                    <option value="">Rol tanlanmagan</option>
                                    {Object.entries(CASE_ROLE_LABELS).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>
                        );
                    })}
                </div>
            </Modal>
        </div>
    );
};

export default CompetitionRoundsTab;
