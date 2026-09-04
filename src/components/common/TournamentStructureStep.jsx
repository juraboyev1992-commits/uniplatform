import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Sparkles, Calendar, ChevronDown, X, Info, CheckCircle2 } from 'lucide-react';
import { QUIZ_MIXED_ROUND_TYPES, DEBATE_CRITERIA, DEBATE_MATCH_CRITERIA, DEBATE_MATCH_CATEGORIES, QUIZ_MIXED_POINTS, STAGE_LABEL_PRESETS, TUR_SCOPES, compileStructureToRoundRules, getCourtMatchCriteria, COURT_MATCH_CATEGORIES, isMatchBasedEngine } from '../../config/competitionEngines';
import { db } from '../../services/db';

// Default per-Tur date when the admin hasn't overridden it — Tur 1 = the competition's own Step 1
// startDate, every later Tur spaced 10 kun apart. Purely a display/pre-fill default (never persisted
// unless the admin actually edits a Tur's date), matching leagueTurSchedule's "sparse override" shape.
const addDays = (isoDate, days) => {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
};

const combineLocal = (date, time) => (date ? new Date(`${date}T${time || '00:00'}`) : null);

// Same ordering rule CompetitionTurSchedule.jsx enforces post-creation (Jadval tab), applied here at
// creation time too — a competition should never be CREATED with an already-invalid per-Tur sequence.
// `getDefaultDate(idx)` resolves the same "10 kundan oralatib" fallback the two per-Tur-schedule blocks
// below already use, so an untouched sibling Tur is still checked against its real effective date, not
// just an explicitly-set override.
const validateTurScheduleOverride = (turIdx, candidate, allOverrides, turCount, startDate, startTime, getDefaultDate) => {
    const resolvedEntry = (idx) => {
        const o = allOverrides?.[idx] || {};
        return { date: o.date ?? getDefaultDate(idx), startTime: o.startTime, endTime: o.endTime };
    };
    let minMoment = null;
    if (turIdx === 1) {
        if (startDate) minMoment = combineLocal(startDate, startTime);
    } else {
        const prev = resolvedEntry(turIdx - 1);
        if (prev.date) minMoment = combineLocal(prev.date, prev.endTime || prev.startTime);
    }
    let maxMoment = null;
    if (turIdx < turCount) {
        const next = resolvedEntry(turIdx + 1);
        if (next.date) maxMoment = combineLocal(next.date, next.startTime);
    }
    const candidateStart = combineLocal(candidate.date, candidate.startTime);
    const candidateEnd = combineLocal(candidate.date, candidate.endTime || candidate.startTime);
    if (candidateStart && minMoment && candidateStart < minMoment) {
        return `Bu Tur ${minMoment.toLocaleString('uz-UZ')} dan oldin boshlanishi mumkin emas.`;
    }
    if (candidateEnd && maxMoment && candidateEnd > maxMoment) {
        return `Bu Tur ${maxMoment.toLocaleString('uz-UZ')} dan keyin tugashi mumkin emas.`;
    }
    return null;
};

// "Turlar soni" — a calendar-month-style 1..30 grid instead of a plain vertical <select> list, opened
// from a single button. Picking a number just sets one field (onSelect); the grid closes itself.
const TurCountPicker = ({ value, onSelect }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex flex-col items-center gap-1 px-6 py-4 border-2 border-indigo-200 rounded-2xl text-indigo-600 hover:bg-indigo-50 transition-colors min-w-[160px]"
            >
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-indigo-400">
                    <Calendar size={13} /> Turlar soni
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="text-3xl font-black leading-none">{value}</span>
                    <ChevronDown size={16} className={`text-indigo-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                </span>
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 z-20 mt-1.5 p-3 bg-white border border-gray-200 rounded-2xl shadow-xl grid grid-cols-6 gap-1.5 w-80">
                        {Array.from({ length: 30 }, (_, i) => i + 1).map(n => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => { onSelect(n); setOpen(false); }}
                                className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors ${
                                    n === value ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-indigo-50'
                                }`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

// Point-table field layout for the free-structure editor's "Ball jadvali" — mirrors QUIZ_MIXED_POINTS'
// exact shape so a per-competition `data.pointTables` override reads/writes the same keys
// computeQuizMixedPoints already consumes (see competitionEngines.js).
const POINT_FIELDS = [
    { category: 'standard', fields: [{ key: 'correct', label: "To'g'ri" }, { key: 'wrong', label: "Noto'g'ri" }] },
    { category: 'placement', fields: [{ key: '1', label: '1-o\'rin' }, { key: '2', label: '2-o\'rin' }, { key: '3', label: '3-o\'rin' }, { key: 'other', label: 'Boshqa' }] },
    { category: 'vabank', fields: [{ key: 'riskCorrect', label: '+ bilan, to\'g\'ri' }, { key: 'riskWrong', label: '+ bilan, noto\'g\'ri' }, { key: 'safeCorrect', label: '+siz, to\'g\'ri' }, { key: 'safeWrong', label: '+siz, noto\'g\'ri' }] },
    { category: 'risk_optional', fields: [{ key: 'plusCorrect', label: 'Plyus, to\'g\'ri' }, { key: 'plusWrong', label: 'Plyus, noto\'g\'ri' }, { key: 'minusCorrect', label: 'Minus, to\'g\'ri' }, { key: 'minusWrong', label: 'Minus, noto\'g\'ri' }, { key: 'blank', label: "Bo'sh" }] },
    { category: 'fixed_bonus', fields: [{ key: 'correct', label: "To'g'ri" }, { key: 'wrong', label: "Noto'g'ri" }] }
];
const POINT_CATEGORY_LABELS = { standard: 'Standart', placement: 'Joylashuv', vabank: 'Vabank', risk_optional: 'Plyus/Minus', fixed_bonus: 'Belgilangan bonus' };

const inputClass = "w-full px-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm";
const labelClass = "block text-xs font-bold text-gray-700 uppercase mb-1.5";

// Step 2 of the tournament creation wizard — participant mode + format-dependent round structure.
// Round structure only has real meaning for engines that don't already have a fixed structure:
// quiz_mixed's rounds are entirely defined by its preset (shown read-only, see QUIZ_MIXED_ROUND_TYPES
// preview below); correct_answer keeps the same roundsCount/questionsPerRound model the rest of the
// app (Live Scoring, Results Center round-grouping) already relies on, just edited as a real per-round
// list here. debate/criteria_based/single_score just need a round *count* (matches/rounds), no
// per-round question count — that concept doesn't apply to them.
const TournamentStructureStep = ({ data, onChange, selectedPreset, isAdmin = false }) => {
    const [isEditingCriteria, setIsEditingCriteria] = useState(false);
    const engine = selectedPreset?.scoringEngine;
    const isQuizMixed = engine === 'quiz_mixed';
    const isCorrectAnswer = engine === 'correct_answer';
    // Sport (match_play), Munozara (debate_match) and TSUL Court (court_match) never read `roundsCount` at all.
    const isMatchBased = isMatchBasedEngine(engine);
    const questionsApply = isCorrectAnswer; // only correct_answer's rounds are made of "questions"

    // Admin/QA convenience: team-type competitions always draw ALL of the selected club's real teams
    // (db.getClubTeams, capped at 50 — there's no participant-count picker in this wizard), so testing a
    // many-team scenario (e.g. Munozara's match-based engine with 15-20 teams) needs that many real teams
    // to already exist for the club BEFORE this competition is created. Surfaced here rather than buried
    // in club management since this is exactly where the gap becomes visible.
    const [teamsVersion, setTeamsVersion] = useState(0);
    const [testTeamCount, setTestTeamCount] = useState(15);
    const realTeamCount = useMemo(
        () => (data.type === 'team' && data.clubId ? db.getClubTeams(data.clubId).length : 0),
        [data.type, data.clubId, teamsVersion]
    );
    const [testTeamsSuccessMsg, setTestTeamsSuccessMsg] = useState('');
    const handleCreateTestTeams = async () => {
        const n = Math.max(1, Math.min(50, Number(testTeamCount) || 0));
        try {
            await db.createTestTeams(data.clubId, n);
            setTeamsVersion(v => v + 1);
            setTestTeamsSuccessMsg(`${n} ta jamoa test rejimda qo'shildi`);
            setTimeout(() => setTestTeamsSuccessMsg(''), 2500);
        } catch (err) {
            alert(err.message);
        }
    };

    // Erkin tuzilma (free structure) — Bosqich->Tur->Raund builder for quiz_mixed, an alternative to the
    // fixed preset shape above. Every update is immutable find+map, mirroring the addTur/addRaund/
    // updateRaund pattern already used by the Kubok builder below — same idiom, one level deeper.
    const structure = data.structure;
    const setStructure = (bosqichlar) => onChange({ structure: { bosqichlar } });
    const findBosqich = (bosqichId) => structure.bosqichlar.find(b => b.id === bosqichId);
    const findTur = (bosqichId, turId) => findBosqich(bosqichId).turlar.find(t => t.id === turId);
    const updateBosqich = (bosqichId, patch) => setStructure(structure.bosqichlar.map(b => (b.id === bosqichId ? { ...b, ...patch } : b)));
    const updateTur = (bosqichId, turId, patch) => updateBosqich(bosqichId, { turlar: findBosqich(bosqichId).turlar.map(t => (t.id === turId ? { ...t, ...patch } : t)) });

    const addBosqich = () => {
        const nextId = (structure.bosqichlar[structure.bosqichlar.length - 1]?.id || 0) + 1;
        setStructure([...structure.bosqichlar, {
            id: nextId, label: `${nextId}-bosqich`,
            turlar: [{ id: 1, label: '1-Tur', ruleType: 'standard', raundlar: [{ id: 1, label: '1-Raund', ruleType: 'standard', savolCount: 12 }] }]
        }]);
    };
    const removeBosqich = (bosqichId) => {
        if (structure.bosqichlar.length <= 1) return;
        setStructure(structure.bosqichlar.filter(b => b.id !== bosqichId));
    };
    const addStructTur = (bosqichId) => {
        const bosqich = findBosqich(bosqichId);
        const nextId = (bosqich.turlar[bosqich.turlar.length - 1]?.id || 0) + 1;
        updateBosqich(bosqichId, { turlar: [...bosqich.turlar, { id: nextId, label: `${nextId}-Tur`, ruleType: 'standard', raundlar: [{ id: 1, label: '1-Raund', ruleType: null, savolCount: 12 }] }] });
    };
    const removeStructTur = (bosqichId, turId) => {
        const bosqich = findBosqich(bosqichId);
        if (bosqich.turlar.length <= 1) return;
        updateBosqich(bosqichId, { turlar: bosqich.turlar.filter(t => t.id !== turId) });
    };
    const addStructRaund = (bosqichId, turId) => {
        const tur = findTur(bosqichId, turId);
        const nextId = (tur.raundlar[tur.raundlar.length - 1]?.id || 0) + 1;
        updateTur(bosqichId, turId, { raundlar: [...tur.raundlar, { id: nextId, label: `${nextId}-Raund`, ruleType: null, savolCount: 1 }] });
    };
    const removeStructRaund = (bosqichId, turId, raundId) => {
        const tur = findTur(bosqichId, turId);
        if (tur.raundlar.length <= 1) return;
        updateTur(bosqichId, turId, { raundlar: tur.raundlar.filter(r => r.id !== raundId) });
    };
    const updateStructRaund = (bosqichId, turId, raundId, patch) => {
        const tur = findTur(bosqichId, turId);
        updateTur(bosqichId, turId, { raundlar: tur.raundlar.map(r => (r.id === raundId ? { ...r, ...patch } : r)) });
    };
    const totalSavolCount = structure.bosqichlar.reduce((sum, b) =>
        sum + b.turlar.reduce((s2, t) => s2 + t.raundlar.reduce((s3, r) => s3 + (Number(r.savolCount) || 0), 0), 0), 0);

    // Real Tur boundaries for quiz_mixed (25-savol/UniQuiz have their own preset.defaults.stages even
    // without Kubok/Liga; a free-structure competition compiles its own from data.structure) — used only
    // to drive the per-Tur sana cards below, same read-only preview compileStructureToRoundRules already
    // produces for the payload itself.
    const quizMixedStages = isQuizMixed
        ? (data.useFreeStructure ? compileStructureToRoundRules(structure).stages : (selectedPreset?.defaults?.stages || []))
        : [];

    // "Bosqichlimi yoki Turnirmi?" — Bosqichli (default) keeps today's full Bosqich->Tur->Raund UI, every
    // setting (including per-Tur "Ishtirokchilar doirasi") unchanged. Oddiy turnir collapses everything
    // into ONE hidden bosqich AND resets every Tur's scope to 'all' — a plain tournament has no staged
    // qualification, so "kimlar o'rtasida o'tkaziladi" isn't a real question here; hamma ishtirok etadi,
    // so the scope selector is hidden (renderTurCard) and any previously-set value doesn't linger unseen
    // in the payload. Turlar/Raund/Savol themselves are untouched — still fully configurable either way.
    const setHasStages = (next) => {
        if (!next) {
            // Oddiy turnir starts from a single shared Raund andozasi (the first existing Tur's own
            // Raund list) applied to exactly 1 Tur — admin grows Turlar soni from here via TurCountPicker
            // (setFlatTurCount below), same "Tur andozasi" idiom Liga already uses.
            const firstTur = structure.bosqichlar[0]?.turlar[0];
            const template = (firstTur?.raundlar || [{ id: 1, savolCount: 12 }]).map(r => ({ ...r }));
            onChange({
                hasStages: next,
                structure: {
                    bosqichlar: [{
                        ...structure.bosqichlar[0], label: '',
                        turlar: [{ id: 1, label: '1-Tur', ruleType: firstTur?.ruleType || 'standard', scope: 'all', raundlar: template }]
                    }]
                }
            });
            return;
        }
        onChange({ hasStages: next });
    };

    // Oddiy turnir mode only (data.hasStages === false) — ONE shared Raund andozasi (each Raund still
    // its own savol soni) applied identically to N Turlar, mirroring Liga's leagueRoundTemplate pattern
    // exactly instead of per-Tur individually-different editing. The first Tur is the canonical template;
    // every mutation re-stamps that same template onto all N Turlar so they never drift apart.
    const flatTemplate = structure.bosqichlar[0].turlar[0]?.raundlar || [{ id: 1, savolCount: 12 }];
    const flatTurCount = structure.bosqichlar[0].turlar.length;
    const restampFlatTemplate = (template) => {
        const newTurlar = structure.bosqichlar[0].turlar.map(t => ({ ...t, raundlar: template.map(r => ({ ...r })) }));
        onChange({ structure: { bosqichlar: [{ ...structure.bosqichlar[0], turlar: newTurlar }] } });
    };
    const setFlatTurCount = (n) => {
        const baseTur = structure.bosqichlar[0].turlar[0];
        const newTurlar = Array.from({ length: n }, (_, i) => ({
            id: i + 1, label: `${i + 1}-Tur`, ruleType: baseTur?.ruleType || 'standard', scope: 'all',
            raundlar: flatTemplate.map(r => ({ ...r }))
        }));
        onChange({ structure: { bosqichlar: [{ ...structure.bosqichlar[0], turlar: newTurlar }] } });
    };
    const addFlatTemplateRaund = () => {
        const nextId = (flatTemplate[flatTemplate.length - 1]?.id || 0) + 1;
        restampFlatTemplate([...flatTemplate, { id: nextId, ruleType: null, savolCount: 12 }]);
    };
    const removeFlatTemplateRaund = (raundId) => {
        if (flatTemplate.length <= 1) return;
        restampFlatTemplate(flatTemplate.filter(r => r.id !== raundId));
    };
    const updateFlatTemplateRaund = (raundId, patch) => {
        restampFlatTemplate(flatTemplate.map(r => (r.id === raundId ? { ...r, ...patch } : r)));
    };
    // Tur qoidasi — barcha N ta Turga bir xilda qo'llanadi (ular baribir andoza orqali bir xil), har
    // Raund alohida qoida tanlamasa shundan meros oladi — renderTurCard/QUIZ_MIXED_ROUND_TYPES bilan bir
    // xil "bo'sh = meros" konvensiyasi.
    const flatTurRuleType = structure.bosqichlar[0].turlar[0]?.ruleType || 'standard';
    const setFlatTurRuleType = (ruleType) => {
        const newTurlar = structure.bosqichlar[0].turlar.map(t => ({ ...t, ruleType }));
        onChange({ structure: { bosqichlar: [{ ...structure.bosqichlar[0], turlar: newTurlar }] } });
    };
    const flatTemplateQuestions = flatTemplate.reduce((sum, r) => sum + (Number(r.savolCount) || 0), 0);

    // Shared between the Bosqich-grouped view and the flat "Yo'q — oddiy turnir" view — identical Tur
    // card either way, only what wraps it (bosqich chrome vs none) differs.
    const renderTurCard = (bosqich, tur) => (
        <div key={tur.id} className="ml-3 p-2.5 bg-indigo-50/40 rounded-lg border border-indigo-100 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
                <input
                    type="text"
                    value={tur.label}
                    onChange={e => updateTur(bosqich.id, tur.id, { label: e.target.value })}
                    className="w-24 px-2.5 py-1.5 border rounded-lg text-xs font-bold"
                />
                <select
                    value={tur.ruleType || 'standard'}
                    onChange={e => updateTur(bosqich.id, tur.id, { ruleType: e.target.value })}
                    className="px-2.5 py-1.5 border rounded-lg text-xs"
                    title="Bu Turdagi Raundlar shu qoidani meros oladi (o'zi alohida tanlamasa)"
                >
                    {QUIZ_MIXED_ROUND_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                {/* Bosqichli holatdagina ma'noli — Oddiy turnirda hamma har bir Turda ishtirok etaveradi,
                    "kimlar o'rtasida o'tkaziladi" degan savolning o'zi yo'q. */}
                {data.hasStages !== false && (
                    <select
                        value={tur.scope || 'all'}
                        onChange={e => updateTur(bosqich.id, tur.id, { scope: e.target.value })}
                        className="px-2.5 py-1.5 border rounded-lg text-xs text-indigo-700"
                        title="Ushbu Tur kimlar o'rtasida o'tkaziladi? (faqat ma'lumot uchun)"
                    >
                        {TUR_SCOPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                )}
                <button type="button" onClick={() => addStructRaund(bosqich.id, tur.id)} className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700">
                    <Plus size={11} /> Raund
                </button>
                <button
                    type="button"
                    onClick={() => removeStructTur(bosqich.id, tur.id)}
                    disabled={bosqich.turlar.length <= 1}
                    className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <Trash2 size={12} />
                </button>
            </div>
            {data.hasStages !== false && tur.scope && tur.scope !== 'all' && (
                <p className="text-[10px] text-indigo-400 pl-0.5">
                    {TUR_SCOPES.find(s => s.id === tur.scope)?.description} <b>Faqat ma'lumot uchun</b> — haqiqiy guruhlash/saralash musobaqa yaratilgandan keyin "Guruh bosqichlari" panelida sozlanadi.
                </p>
            )}

            {tur.raundlar.map(raund => (
                <div key={raund.id} className="ml-4 flex items-center gap-2 flex-wrap p-1.5">
                    <input
                        type="text"
                        value={raund.label}
                        onChange={e => updateStructRaund(bosqich.id, tur.id, raund.id, { label: e.target.value })}
                        className="w-20 px-2 py-1 border rounded-lg text-[11px]"
                    />
                    <select
                        value={raund.ruleType || ''}
                        onChange={e => updateStructRaund(bosqich.id, tur.id, raund.id, { ruleType: e.target.value || null })}
                        className="px-2 py-1 border rounded-lg text-[11px]"
                        title="Bo'sh = Turdan meros oladi"
                    >
                        <option value="">(Turdan meros)</option>
                        {QUIZ_MIXED_ROUND_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-gray-500">
                        Savol:
                        <input
                            type="number"
                            min={1}
                            value={raund.savolCount}
                            onChange={e => updateStructRaund(bosqich.id, tur.id, raund.id, { savolCount: Math.max(1, Number(e.target.value) || 1) })}
                            className="w-14 px-1.5 py-1 border rounded-lg text-[11px] text-center"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={() => removeStructRaund(bosqich.id, tur.id, raund.id)}
                        disabled={tur.raundlar.length <= 1}
                        className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <Trash2 size={11} />
                    </button>
                </div>
            ))}
        </div>
    );

    const pointsDraft = data.pointTables || QUIZ_MIXED_POINTS;
    const updatePointField = (category, key, value) => {
        onChange({ pointTables: { ...pointsDraft, [category]: { ...pointsDraft[category], [key]: Number(value) || 0 } } });
    };

    // Cup structure: a list of Tur, each containing 1+ Raund — a Zakovat cup can be e.g. 10 Tur with
    // 1-3 Raund each, so a Tur is never assumed to be exactly one Raund entry.
    const addTur = () => {
        const nextId = (data.cupTurs[data.cupTurs.length - 1]?.id || 0) + 1;
        // Default starting point for a new Tur — 2 Raund of 12 Savol each — same rule as the very first
        // Tur (buildInitialData); admin adjusts up/down from here with Raund/Savol qo'shish.
        onChange({ cupTurs: [...data.cupTurs, { id: nextId, raunds: [{ id: 1, questionsCount: 12 }, { id: 2, questionsCount: 12 }] }] });
    };
    const removeTur = (turId) => {
        if (data.cupTurs.length <= 1) return;
        onChange({ cupTurs: data.cupTurs.filter(t => t.id !== turId) });
    };
    const addRaund = (turId) => {
        onChange({
            cupTurs: data.cupTurs.map(t => {
                if (t.id !== turId) return t;
                const nextId = (t.raunds[t.raunds.length - 1]?.id || 0) + 1;
                return { ...t, raunds: [...t.raunds, { id: nextId, questionsCount: 12 }] };
            })
        });
    };
    const removeRaund = (turId, raundId) => {
        onChange({
            cupTurs: data.cupTurs.map(t => {
                if (t.id !== turId || t.raunds.length <= 1) return t;
                return { ...t, raunds: t.raunds.filter(r => r.id !== raundId) };
            })
        });
    };
    const updateRaund = (turId, raundId, questionsCount) => {
        onChange({
            cupTurs: data.cupTurs.map(t => (
                t.id !== turId ? t : { ...t, raunds: t.raunds.map(r => (r.id === raundId ? { ...r, questionsCount: Number(questionsCount) } : r)) }
            ))
        });
    };

    const totalCupTurs = data.cupTurs.length;
    const totalCupRaunds = data.cupTurs.reduce((sum, t) => sum + t.raunds.length, 0);
    const totalCupQuestions = data.cupTurs.reduce((sum, t) => sum + t.raunds.reduce((s, r) => s + (Number(r.questionsCount) || 0), 0), 0);

    // Liga's "Tur andozasi" — ONE shared Raund pattern (each Raund can still have its own savol count,
    // e.g. 1-raund 10ta, 2-raund 12ta, 3-raund 9ta) applied identically to every Tur in the season —
    // unlike Kubok, a league's Turs are repeated playthroughs of the same weekly format, not individually
    // distinct stages, so there's no per-Tur editing here, just one andoza + a separate Turlar soni.
    const leagueTemplate = data.leagueRoundTemplate;
    const addLeagueRaund = () => {
        const nextId = (leagueTemplate[leagueTemplate.length - 1]?.id || 0) + 1;
        onChange({ leagueRoundTemplate: [...leagueTemplate, { id: nextId, questionsCount: 12 }] });
    };
    const removeLeagueRaund = (raundId) => {
        if (leagueTemplate.length <= 1) return;
        onChange({ leagueRoundTemplate: leagueTemplate.filter(r => r.id !== raundId) });
    };
    const updateLeagueRaund = (raundId, questionsCount) => {
        onChange({ leagueRoundTemplate: leagueTemplate.map(r => (r.id === raundId ? { ...r, questionsCount: Number(questionsCount) } : r)) });
    };
    const leagueTemplateQuestions = leagueTemplate.reduce((sum, r) => sum + (Number(r.questionsCount) || 0), 0);
    const leagueTurCount = Number(data.leagueTours) || 1;

    return (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
            <div>
                <h3 className="text-lg font-bold text-gray-900">2. Turnir tuzilmasi</h3>
                <p className="text-sm text-gray-500">Ishtirokchilar turi va raund tuzilmasini belgilang</p>
            </div>

            {/* Ishtirokchilar turi (Yakka/Jamoaviy) moved to Step 1 — it needs to be known BEFORE
                RegistrationSettingsFields there locks "Ishtirok shakli" to it; asking it here too, one
                step later, meant Step 1 was rendering off a value the admin hadn't actually confirmed
                yet. Only the test-team convenience (needs data.type, but is otherwise Step-2-appropriate
                — it's about testing the structure being built here) stays. */}
            {data.type === 'team' && data.clubId && (
                <div className="pb-5 border-b border-dashed border-gray-200 flex items-start justify-between gap-6">
                    <div className="max-w-xs flex-1 min-w-0 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                        <p className="text-[11px] text-gray-500">
                            Bu klubda hozircha <span className="font-bold text-gray-700">{realTeamCount} ta</span> real jamoa mavjud — musobaqa
                            aynan shu jamoalar bilan yaratiladi (maksimal 50 tagacha).
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                            <input
                                type="number"
                                min={1}
                                max={50}
                                value={testTeamCount}
                                onChange={e => setTestTeamCount(e.target.value)}
                                className="w-20 px-2 py-1.5 border rounded-lg text-xs"
                            />
                            <button
                                type="button"
                                onClick={handleCreateTestTeams}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50"
                            >
                                <Sparkles size={13} /> ta test jamoa qo'shish
                            </button>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1.5">
                            Sinov uchun — real a'zolari bilan jamoalar darhol yaratiladi (masalan 15-20 tasini sinash uchun).
                        </p>
                        {testTeamsSuccessMsg && (
                            <p className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 mt-2">
                                <CheckCircle2 size={13} /> {testTeamsSuccessMsg}
                            </p>
                        )}
                    </div>

                    {/* Admin-only — coordinator doesn't get to redefine the season's Tur count/dates.
                        Separate, bigger control on the right, not squeezed next to the test-team button. */}
                    {isAdmin && isCorrectAnswer && data.format !== 'cup' && (
                        <div className="shrink-0">
                            <TurCountPicker value={leagueTurCount} onSelect={n => onChange({ leagueTours: n })} />
                        </div>
                    )}
                </div>
            )}

            {isQuizMixed && (
                <div className="space-y-4">
                    <div className="flex gap-2 bg-gray-100 rounded-2xl p-1 w-fit">
                        {[{ id: false, label: 'Andoza bo\'yicha' }, { id: true, label: 'Erkin tuzilma' }].map(opt => (
                            <button
                                key={String(opt.id)}
                                type="button"
                                onClick={() => onChange({ useFreeStructure: opt.id })}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                                    data.useFreeStructure === opt.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {!data.useFreeStructure ? (
                        <div className="p-5 bg-purple-50/50 border border-purple-100 rounded-2xl space-y-3">
                            <div>
                                <h4 className="text-xs font-extrabold text-purple-700 uppercase tracking-wider">Tur tuzilmasi ({selectedPreset.label})</h4>
                                <p className="text-[11px] text-purple-400 mt-0.5">Bu turnir turi uchun tuzilma andoza orqali belgilangan va o'zgartirilmaydi. Boshqacha tuzilma kerak bo'lsa — "Erkin tuzilma"ni tanlang.</p>
                            </div>
                            {/* Presetning o'z defaults.stages'i bo'yicha Tur-tur guruhlangan ko'rinish (25-savol/
                                UniQuiz) — mavjud selectedPreset.defaults.roundRules/stages'dan boshqa hech narsa
                                o'qilmaydi, faqat "Tur tuzilmasi" nomlanishiga mos ravishda ko'rsatiladi. Preset
                                o'z stages'iga ega bo'lmasa (TDYU Quiz), avvalgidek yagona R1..RN ro'yxati. */}
                            {selectedPreset.defaults.stages ? (
                                <div className="space-y-2">
                                    {selectedPreset.defaults.stages.map((stage, sIdx) => {
                                        const [from, to] = stage.roundRange;
                                        const rulesInStage = selectedPreset.defaults.roundRules.slice(from - 1, to);
                                        const uniform = rulesInStage.every(r => r === rulesInStage[0]);
                                        const leafLabel = selectedPreset.defaults.stageLeafLabel === 'savol' ? 'savol' : 'raund';
                                        return (
                                            <div key={sIdx} className="p-3 bg-white rounded-xl border border-purple-100">
                                                <p className="text-xs font-bold text-purple-700">{stage.label}</p>
                                                {uniform ? (
                                                    <p className="text-[11px] text-purple-400 mt-1">
                                                        {rulesInStage.length} ta {leafLabel} — {QUIZ_MIXED_ROUND_TYPES.find(t => t.id === rulesInStage[0])?.label || rulesInStage[0]}
                                                    </p>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                        {rulesInStage.map((rule, i) => (
                                                            <span key={i} className="px-2 py-1 bg-purple-50 border border-purple-200 rounded-lg text-[10px] font-bold text-purple-700">
                                                                {leafLabel === 'savol' ? 'S' : 'R'}{from + i}: {QUIZ_MIXED_ROUND_TYPES.find(t => t.id === rule)?.label || rule}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {selectedPreset.defaults.roundRules.map((rule, idx) => (
                                        <span key={idx} className="px-3 py-1.5 bg-white border border-purple-200 rounded-lg text-xs font-bold text-purple-700">
                                            R{idx + 1}: {QUIZ_MIXED_ROUND_TYPES.find(t => t.id === rule)?.label || rule}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl">
                                <label className="block text-[11px] font-bold text-indigo-700 uppercase mb-1.5">Saralash guruhlari (baholashda)</label>
                                <p className="text-[11px] text-indigo-400 mb-2">
                                    Bitta musobaqa ichida, har fakultet/kurs uchun alohida saralash o'yini bo'lsin desangiz tanlang — masalan 5-7 ta fakultet, har biri o'z ichida saralanadi, keyin Finalga o'tadi. Ishtirokchilarga ko'rinmaydi, faqat yaratish va baholashda ishlatiladi.
                                    <b> Diqqat</b>: bu kim ro'yxatdan o'ta olishini emas — allaqachon ro'yxatdan o'tganlar QANDAY saralanishini belgilaydi. Kim ro'yxatdan o'ta olishini 3-qadamdagi "Cheklovlar" hal qiladi.
                                </p>
                                <div className="flex gap-2">
                                    {[{ id: 'none', label: "Yo'q — yagona ro'yxat" }, { id: 'faculty', label: 'Fakultet kesimida' }, { id: 'course', label: 'Kurs kesimida' }].map(opt => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => onChange({ groupingMode: opt.id })}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                                                data.groupingMode === opt.id ? 'bg-indigo-600 text-white' : 'bg-white border border-indigo-200 text-indigo-600'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                                {data.groupingMode !== 'none' && (
                                    <p className="text-[10px] text-indigo-400 mt-2">
                                        Musobaqa yaratilgach, har bir haqiqiy {data.groupingMode === 'faculty' ? 'fakultet' : 'kurs'} uchun guruh avtomatik yaratiladi va ishtirokchilar shu zahoti biriktiriladi — buni "Turlarni boshqarish" ichidagi "Guruh bosqichlari" panelida ko'rasiz.
                                    </p>
                                )}
                            </div>

                            <div className="p-5 bg-purple-50/50 border border-purple-100 rounded-2xl space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-xs font-extrabold text-purple-700 uppercase tracking-wider">Tur tuzilmasi</h4>
                                        <p className="text-[11px] text-purple-400 mt-0.5">Musobaqadagi turlarni, ularning raundlari va savollarini belgilang. Zarur bo'lsa, turlarni bosqichlarga ajrating.</p>
                                    </div>
                                    <span className="text-xs font-bold text-purple-600 shrink-0">Jami: {totalSavolCount} savol</span>
                                </div>

                                {/* Musobaqa yaratilgandan keyin hech qayerda (Turlarni boshqarish'ning
                                    "Tahrirlash"i faqat nom/vaqtni o'zgartiradi) har bir Raund/Savolning
                                    baholash qoidasini (standart/vabank/plyus-minus/bonus) qayta sozlash
                                    imkoniyati yo'q — shuning uchun bu yerdagi tanlov aslida qat'iy. */}
                                <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                    <Info size={15} className="text-amber-600 shrink-0 mt-0.5" />
                                    <p className="text-[11px] font-semibold text-amber-700">
                                        Diqqat: har bir Raund/Savolning baholash qoidasini (Standart/Vabank/Plyus-Minus/Bonus) e'tibor bilan tanlang — musobaqa yaratilgandan keyin bu qoidalarni o'zgartirib bo'lmaydi.
                                    </p>
                                </div>

                                {/* Bosqichlimi yoki Turnirmi? — Bosqichli: mavjud Bosqich->Tur->Raund UI, har
                                    Turning "Ishtirokchilar doirasi" ham (o'zgarishsiz). Turnir: bosqich
                                    chrome'i va "Ishtirokchilar doirasi" butunlay yashiriladi (hamma har Turda
                                    ishtirok etadi) — faqat Tur/Raund/Savol qoladi, ma'lumot ostida hamon
                                    bitta yashirin bosqich sifatida saqlanadi. */}
                                <div className="flex gap-2 bg-white rounded-xl p-1 w-fit border border-purple-100">
                                    {[{ v: true, l: 'Bosqichli' }, { v: false, l: 'Oddiy turnir' }].map(opt => (
                                        <button
                                            key={String(opt.v)}
                                            type="button"
                                            onClick={() => setHasStages(opt.v)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                                (data.hasStages !== false) === opt.v ? 'bg-purple-600 text-white' : 'text-gray-500 hover:bg-purple-50'
                                            }`}
                                        >
                                            {opt.l}
                                        </button>
                                    ))}
                                </div>

                                {data.hasStages !== false ? (
                                    <>
                                        {structure.bosqichlar.map(bosqich => (
                                            <div key={bosqich.id} className="p-3 bg-white rounded-xl border border-purple-100 space-y-3">
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={bosqich.label}
                                                            onChange={e => updateBosqich(bosqich.id, { label: e.target.value })}
                                                            className="flex-1 px-3 py-1.5 border rounded-lg text-xs font-bold"
                                                        />
                                                        <button type="button" onClick={() => addStructTur(bosqich.id)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 shrink-0">
                                                            <Plus size={12} /> Tur
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeBosqich(bosqich.id)}
                                                            disabled={structure.bosqichlar.length <= 1}
                                                            className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                    {/* Quick-picks — bosqich.label stays a free-text field, these just pre-fill it. */}
                                                    <div className="flex flex-wrap gap-1">
                                                        {STAGE_LABEL_PRESETS.map(preset => (
                                                            <button
                                                                key={preset}
                                                                type="button"
                                                                onClick={() => updateBosqich(bosqich.id, { label: preset })}
                                                                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors ${
                                                                    bosqich.label === preset ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-500 hover:bg-purple-100'
                                                                }`}
                                                            >
                                                                {preset}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {bosqich.turlar.map(tur => renderTurCard(bosqich, tur))}
                                            </div>
                                        ))}

                                        <div>
                                            <button type="button" onClick={addBosqich} className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700">
                                                <Plus size={14} /> Bosqich qo'shish
                                            </button>
                                            {structure.bosqichlar.length <= 1 && (
                                                <p className="text-[10px] text-gray-400 mt-1">Bosqich shart emas — kerak bo'lmasa yuqoridagi yagona bo'lim ichida turlarni qo'shib ketaveradi.</p>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div className="p-3 bg-white rounded-xl border border-purple-100 space-y-3">
                                        <div className="flex items-center justify-between flex-wrap gap-3">
                                            <span className="text-xs font-bold text-gray-500 uppercase">Turlar soni</span>
                                            <TurCountPicker value={flatTurCount} onSelect={setFlatTurCount} />
                                        </div>

                                        {/* Bitta umumiy Tur andozasi — Zakovat Liga'sining leagueRoundTemplate'i
                                            bilan bir xil idioma: har Raund o'z savol soni VA baholash qoidasiga
                                            ega (standart/vabank/plyus-minus/bonus...), andoza barcha N ta Turga
                                            bir xilda qo'llaniladi (Turlar individual farqlanmaydi). */}
                                        <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100 space-y-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-[10px] text-indigo-400 flex-1 min-w-[160px]">
                                                    Har bir raund uchun savollar soni va baholash qoidasini belgilang. Bu andoza barcha {flatTurCount} ta turga avtomatik qo'llaniladi.
                                                </p>
                                                <label className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 shrink-0">
                                                    Tur qoidasi:
                                                    <select
                                                        value={flatTurRuleType}
                                                        onChange={e => setFlatTurRuleType(e.target.value)}
                                                        className="px-2 py-1 border rounded-lg text-[11px]"
                                                        title="Raund alohida qoida tanlamasa shundan meros oladi"
                                                    >
                                                        {QUIZ_MIXED_ROUND_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                                    </select>
                                                </label>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {flatTemplate.map((r, idx) => (
                                                    <div key={r.id} className="relative w-28 shrink-0 p-2.5 bg-white rounded-xl border border-gray-200 text-center space-y-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => removeFlatTemplateRaund(r.id)}
                                                            disabled={flatTemplate.length <= 1}
                                                            className="absolute top-1 right-1 text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                        <p className="text-[9px] font-extrabold text-indigo-600 tracking-wide">{idx + 1}-RAUND</p>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            value={r.savolCount}
                                                            onChange={e => updateFlatTemplateRaund(r.id, { savolCount: Number(e.target.value) })}
                                                            className="w-full text-lg font-black text-gray-800 text-center bg-transparent outline-none border-b border-transparent focus:border-indigo-300"
                                                        />
                                                        <p className="text-[9px] text-gray-400 -mt-1">ta savol</p>
                                                        <select
                                                            value={r.ruleType || ''}
                                                            onChange={e => updateFlatTemplateRaund(r.id, { ruleType: e.target.value || null })}
                                                            className="w-full px-1 py-1 border rounded-lg text-[10px]"
                                                            title="Bo'sh = Tur qoidasidan meros oladi"
                                                        >
                                                            <option value="">(Tur qoidasi)</option>
                                                            {QUIZ_MIXED_ROUND_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                                        </select>
                                                    </div>
                                                ))}
                                                <button
                                                    type="button"
                                                    onClick={addFlatTemplateRaund}
                                                    className="w-28 shrink-0 p-2.5 rounded-xl border-2 border-dashed border-indigo-200 text-indigo-400 hover:text-indigo-600 hover:border-indigo-400 flex flex-col items-center justify-center gap-1"
                                                >
                                                    <Plus size={14} />
                                                    <span className="text-[8px] font-extrabold uppercase leading-tight text-center">Raund<br />qo'shish</span>
                                                </button>
                                            </div>
                                            <div className="flex gap-3 text-[11px] font-bold text-gray-500 pt-1">
                                                <span>Har turda: <span className="text-indigo-600">{flatTemplate.length} raund / {flatTemplateQuestions} savol</span></span>
                                                <span>Jami: <span className="text-indigo-600">{flatTurCount * flatTemplateQuestions} savol</span></span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-5 bg-amber-50/50 border border-amber-100 rounded-2xl space-y-3">
                                <div>
                                    <h4 className="text-xs font-extrabold text-amber-700 uppercase tracking-wider">Ball jadvali</h4>
                                    <p className="text-[11px] text-amber-500 mt-0.5">Yuqorida ishlatilgan qoida turlari uchun ball qiymatlari — bo'sh qoldirilsa standart qiymat ishlatiladi.</p>
                                </div>
                                {POINT_FIELDS.map(({ category, fields }) => (
                                    <div key={category} className="flex items-center gap-3 flex-wrap">
                                        <span className="text-[11px] font-bold text-gray-500 w-32 shrink-0">{POINT_CATEGORY_LABELS[category]}</span>
                                        {fields.map(f => (
                                            <label key={f.key} className="flex items-center gap-1 text-[11px] text-gray-500">
                                                {f.label}
                                                <input
                                                    type="number"
                                                    value={pointsDraft[category][f.key]}
                                                    onChange={e => updatePointField(category, f.key, e.target.value)}
                                                    className="w-14 px-1.5 py-1 border rounded-lg text-[11px] text-center"
                                                />
                                            </label>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Har Turning sanasi — Zakovat Liga'sining o'sha "sparse override" mexanizmi
                        (data.leagueTurSchedule) aynan shu ko'rinishda ko'chirilgan: 25-savol/UniQuiz o'zining
                        haqiqiy Tur chegaralariga ega (Kubok/Liga format tushunchasisiz ham), shuning uchun
                        bularga ham real sana kerak bo'lishi mumkin. Admin-only, ixtiyoriy — to'ldirilmasa
                        Step 1'dagi sanadan boshlab har Tur 10 kundan oralatib avtomatik hisoblanadi. */}
                    {isAdmin && quizMixedStages.length > 1 && (
                        <div className="space-y-2 pt-2">
                            <label className={labelClass}>Har Turning sanasi (ixtiyoriy)</label>
                            <p className="text-[11px] text-gray-400 -mt-1">To'ldirilmasa, 1-Tur — Step 1'dagi sana, keyingi har biri 10 kundan oralatib avtomatik belgilanadi.</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {quizMixedStages.map((stage, i) => {
                                    const turIdx = i + 1;
                                    const override = data.leagueTurSchedule?.[turIdx] || {};
                                    const defaultDate = addDays(data.startDate, i * 10);
                                    const setOverride = (patch) => {
                                        const candidate = { ...override, ...patch };
                                        const getDefault = (idx) => addDays(data.startDate, (idx - 1) * 10);
                                        const error = validateTurScheduleOverride(turIdx, candidate, data.leagueTurSchedule, quizMixedStages.length, data.startDate, data.startTime, getDefault);
                                        if (error) { alert(error); return; }
                                        onChange({ leagueTurSchedule: { ...data.leagueTurSchedule, [turIdx]: candidate } });
                                    };
                                    return (
                                        <div key={turIdx} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-gray-100">
                                            {/* Faqat Tur nomi — bosqich nomi bu yerda kerak emas (u tuzilma
                                                sozlamalarida qoladi), sana/vaqt har doim Turga tegishli. */}
                                            <span className="text-xs font-bold text-gray-600 w-24 shrink-0 truncate" title={stage.turLabel || stage.label}>{stage.turLabel || stage.label}</span>
                                            <input
                                                type="date"
                                                value={override.date ?? defaultDate}
                                                onChange={e => setOverride({ date: e.target.value })}
                                                className="flex-1 min-w-0 px-2 py-1.5 border rounded-lg text-xs"
                                            />
                                            <input
                                                type="time"
                                                value={override.startTime || ''}
                                                onChange={e => setOverride({ startTime: e.target.value })}
                                                className="w-24 px-2 py-1.5 border rounded-lg text-xs"
                                            />
                                            <input
                                                type="time"
                                                value={override.endTime || ''}
                                                onChange={e => setOverride({ endTime: e.target.value })}
                                                className="w-24 px-2 py-1.5 border rounded-lg text-xs"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {engine === 'debate' && (
                <div className="p-5 bg-rose-50/50 border border-rose-100 rounded-2xl space-y-3">
                    <div>
                        <h4 className="text-xs font-extrabold text-rose-700 uppercase tracking-wider">Baholash mezonlari (jami 100 ball)</h4>
                        <p className="text-[11px] text-rose-400 mt-0.5">Munozara mezonlari standart bo'lib, tahrirlanmaydi.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {DEBATE_CRITERIA.map(c => (
                            <span key={c.name} className="px-3 py-1.5 bg-white border border-rose-200 rounded-lg text-xs font-bold text-rose-700">
                                {c.name}: 0-{c.max}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {isCorrectAnswer && (
                <div className="p-5 bg-amber-50/50 border border-amber-100 rounded-2xl space-y-4">
                    <div>
                        <h4 className="text-xs font-extrabold text-amber-700 uppercase tracking-wider">Ball va jarima</h4>
                        <p className="text-[11px] text-amber-500 mt-0.5">Bo'sh qoldirilsa standart qiymat (to'g'ri +1, noto'g'ri 0) ishlatiladi.</p>
                    </div>

                    {/* Big stepper cards, same idiom SettingsPage.jsx's ball-tizimi tab already uses —
                        easier to read/adjust at a glance than a bare number input with a tiny label. */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-emerald-100">
                            <span className="text-xs font-bold text-gray-600">To'g'ri javob uchun ball</span>
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={() => onChange({ pointsPerCorrectAnswer: (Number(data.pointsPerCorrectAnswer) || 0) - 1 })} className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100 font-bold">−</button>
                                <input
                                    type="number"
                                    value={data.pointsPerCorrectAnswer}
                                    onChange={e => onChange({ pointsPerCorrectAnswer: Number(e.target.value) || 0 })}
                                    className="w-14 py-1.5 border rounded-xl text-center text-base font-extrabold text-emerald-600"
                                />
                                <button type="button" onClick={() => onChange({ pointsPerCorrectAnswer: (Number(data.pointsPerCorrectAnswer) || 0) + 1 })} className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100 font-bold">+</button>
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-rose-100">
                            <span className="text-xs font-bold text-gray-600">Noto'g'ri javob uchun jarima</span>
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={() => onChange({ penaltyPerWrongAnswer: Math.max(0, (Number(data.penaltyPerWrongAnswer) || 0) - 1) })} className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100 font-bold">−</button>
                                <input
                                    type="number"
                                    min={0}
                                    value={data.penaltyPerWrongAnswer}
                                    onChange={e => onChange({ penaltyPerWrongAnswer: Number(e.target.value) || 0 })}
                                    className="w-14 py-1.5 border rounded-xl text-center text-base font-extrabold text-rose-600"
                                />
                                <button type="button" onClick={() => onChange({ penaltyPerWrongAnswer: (Number(data.penaltyPerWrongAnswer) || 0) + 1 })} className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100 font-bold">+</button>
                            </div>
                        </div>
                    </div>

                    {/* Qoidabuzarlik jarimasi — tavsif + (admin-only) haqiqiy son, bitta kartada birga. */}
                    <div className="p-4 bg-white rounded-2xl border border-gray-100 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <label className="text-[11px] font-bold text-gray-500 uppercase">Qoidabuzarlik jarimasi (ixtiyoriy)</label>
                            {isAdmin && (
                                <label className="flex items-center gap-2 text-[11px] font-bold text-gray-500 shrink-0">
                                    Ball miqdori:
                                    <input
                                        type="number"
                                        value={data.ruleViolationPenalty}
                                        onChange={e => onChange({ ruleViolationPenalty: Number(e.target.value) || 0 })}
                                        className="w-16 px-2 py-1 border rounded-lg text-center text-xs font-extrabold text-rose-600"
                                    />
                                </label>
                            )}
                        </div>
                        <textarea
                            rows={2}
                            value={data.penaltyRuleNote}
                            onChange={e => onChange({ penaltyRuleNote: e.target.value })}
                            placeholder="Masalan: yolg'on javob uchun -1, boshqa jamoaning savolini o'g'irlab olsa -2..."
                            className="w-full px-3 py-2 border rounded-xl text-xs"
                        />
                    </div>
                </div>
            )}

            {/* Klassik has no real use for Tur/bosqich grouping (confirmed — "Klassikni qoldiramiz", no
                advancement needed), so its Kubok view drops the Tur wrapper entirely: a flat Raund list,
                always operating on the one implicit Tur (data.cupTurs[0]) underneath. Breyn-ring (and any
                other correct_answer preset) keeps the real Tur/bosqich builder below — it needs multiple
                Tur, each its own Top-N advancement boundary. */}
            {isCorrectAnswer && data.format === 'cup' && selectedPreset?.id === 'zakovat' && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <label className={labelClass}>Raundlar ro'yxati</label>
                        <button type="button" onClick={() => addRaund(data.cupTurs[0].id)} className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700">
                            <Plus size={14} /> Raund qo'shish
                        </button>
                    </div>
                    <div className="space-y-2">
                        {data.cupTurs[0].raunds.map((r, rIdx) => (
                            <div key={r.id} className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-gray-100">
                                <span className="font-bold text-xs text-gray-700 w-16 shrink-0">Raund {rIdx + 1}</span>
                                <input
                                    type="number"
                                    min="1"
                                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                                    placeholder="Savollar soni"
                                    value={r.questionsCount}
                                    onChange={e => updateRaund(data.cupTurs[0].id, r.id, e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => removeRaund(data.cupTurs[0].id, r.id)}
                                    disabled={data.cupTurs[0].raunds.length <= 1}
                                    className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-4 text-xs font-bold text-gray-500 pt-1">
                        <span>Jami raundlar: <span className="text-indigo-600">{totalCupRaunds}</span></span>
                        <span>Jami savollar: <span className="text-indigo-600">{totalCupQuestions}</span></span>
                    </div>
                </div>
            )}

            {isCorrectAnswer && data.format === 'cup' && selectedPreset?.id !== 'zakovat' && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <label className={labelClass}>Turlar ro'yxati</label>
                        <button type="button" onClick={addTur} className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700">
                            <Plus size={14} /> Tur qo'shish
                        </button>
                    </div>
                    <div className="space-y-3">
                        {data.cupTurs.map((tur, turIdx) => (
                            <div key={tur.id} className="p-3 bg-indigo-50/40 rounded-2xl border border-indigo-100 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-sm text-indigo-700">{turIdx + 1}-Tur</span>
                                    <div className="flex items-center gap-3">
                                        <button type="button" onClick={() => addRaund(tur.id)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700">
                                            <Plus size={12} /> Raund qo'shish
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removeTur(tur.id)}
                                            disabled={data.cupTurs.length <= 1}
                                            className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {tur.raunds.map((r, rIdx) => (
                                        <div key={r.id} className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-gray-100">
                                            <span className="font-bold text-xs text-gray-700 w-16 shrink-0">Raund {rIdx + 1}</span>
                                            {questionsApply && (
                                                <input
                                                    type="number"
                                                    min="1"
                                                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                                                    placeholder="Savollar soni"
                                                    value={r.questionsCount}
                                                    onChange={e => updateRaund(tur.id, r.id, e.target.value)}
                                                />
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => removeRaund(tur.id, r.id)}
                                                disabled={tur.raunds.length <= 1}
                                                className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-4 text-xs font-bold text-gray-500 pt-1">
                        <span>Jami turlar: <span className="text-indigo-600">{totalCupTurs}</span></span>
                        <span>Jami raundlar: <span className="text-indigo-600">{totalCupRaunds}</span></span>
                        {questionsApply && <span>Jami savollar: <span className="text-indigo-600">{totalCupQuestions}</span></span>}
                    </div>
                </div>
            )}

            {isCorrectAnswer && data.format !== 'cup' && (
                <div className="space-y-3">
                    {/* "Umumiy turlar soni" duplicates the "Turlar soni" katta tugma above for an admin —
                        shown here only when that tugma itself isn't (coordinator, who has no other way
                        to set it), so exactly one control per field per user, never both. */}
                    {!isAdmin && (
                        <div className="max-w-[160px]">
                            <label className={labelClass}>Umumiy turlar soni</label>
                            <input type="number" min="1" className={inputClass} value={data.leagueTours} onChange={e => onChange({ leagueTours: e.target.value })} />
                        </div>
                    )}

                    {/* Tur andozasi — ONE shared Raund pattern (each Raund still its own savol soni, e.g.
                        1-raund 10ta, 2-raund 12ta, 3-raund 9ta) applied identically to every Tur in the
                        mavsum, instead of a per-Tur individually different structure like Kubok — a
                        league's Turs repeat the same weekly format, they aren't distinct elimination
                        stages. */}
                    <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100 space-y-3">
                        <div className="flex items-center gap-2">
                            <Calendar size={16} className="text-indigo-600 shrink-0" />
                            <h4 className="text-xs font-extrabold text-indigo-700 uppercase tracking-wider">Tur andozasi</h4>
                        </div>
                        <p className="text-[11px] text-indigo-400 -mt-1">
                            Har bir tur uchun raundlar va savollar sonini belgilang. Bu andoza barcha {leagueTurCount} ta turga avtomatik qo'llaniladi.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            {leagueTemplate.map((r, idx) => (
                                <div key={r.id} className="relative w-28 shrink-0 p-3 bg-white rounded-2xl border border-gray-200 text-center">
                                    <button
                                        type="button"
                                        onClick={() => removeLeagueRaund(r.id)}
                                        disabled={leagueTemplate.length <= 1}
                                        className="absolute top-1.5 right-1.5 text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <X size={13} />
                                    </button>
                                    <p className="text-[10px] font-extrabold text-indigo-600 tracking-wide">{idx + 1}-RAUND</p>
                                    <input
                                        type="number"
                                        min="1"
                                        value={r.questionsCount}
                                        onChange={e => updateLeagueRaund(r.id, e.target.value)}
                                        className="w-full mt-1.5 text-xl font-black text-gray-800 text-center bg-transparent outline-none border-b border-transparent focus:border-indigo-300"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-0.5">ta savol</p>
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={addLeagueRaund}
                                className="w-28 shrink-0 p-3 rounded-2xl border-2 border-dashed border-indigo-200 text-indigo-400 hover:text-indigo-600 hover:border-indigo-400 flex flex-col items-center justify-center gap-1"
                            >
                                <Plus size={16} />
                                <span className="text-[9px] font-extrabold uppercase leading-tight text-center">Raund<br />qo'shish</span>
                            </button>
                        </div>
                        <div className="flex gap-4 text-xs font-bold text-gray-500 pt-1">
                            <span>Har turda: <span className="text-indigo-600">{leagueTemplate.length} raund / {leagueTemplateQuestions} savol</span></span>
                            <span>Jami mavsum: <span className="text-indigo-600">{leagueTurCount * leagueTemplateQuestions} savol</span></span>
                        </div>
                    </div>

                    {/* Per-Tur sana — admin-only, "Turlar soni" tanlanganda avtomatik shu miqdorda
                        kartochka chiqadi. Har biri ixtiyoriy: to'ldirilmasa, Step 1'ning sanasidan
                        boshlab har Tur 10 kundan oralatib avtomatik hisoblanadi. */}
                    {isAdmin && (
                        <div className="space-y-2 pt-2">
                            <label className={labelClass}>Har Turning sanasi (ixtiyoriy)</label>
                            <p className="text-[11px] text-gray-400 -mt-1">To'ldirilmasa, 1-Tur — Step 1'dagi sana, keyingi har biri 10 kundan oralatib avtomatik belgilanadi.</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {Array.from({ length: leagueTurCount }, (_, i) => i + 1).map(turIdx => {
                                    const override = data.leagueTurSchedule?.[turIdx] || {};
                                    const getDefault = (idx) => addDays(data.startDate, (idx - 1) * 10);
                                    const defaultDate = getDefault(turIdx);
                                    const setOverride = (patch) => {
                                        const candidate = { ...override, ...patch };
                                        const error = validateTurScheduleOverride(turIdx, candidate, data.leagueTurSchedule, leagueTurCount, data.startDate, data.startTime, getDefault);
                                        if (error) { alert(error); return; }
                                        onChange({ leagueTurSchedule: { ...data.leagueTurSchedule, [turIdx]: candidate } });
                                    };
                                    return (
                                        <div key={turIdx} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-gray-100">
                                            <span className="text-xs font-bold text-gray-600 w-14 shrink-0">{turIdx}-Tur</span>
                                            <input
                                                type="date"
                                                value={override.date ?? defaultDate}
                                                onChange={e => setOverride({ date: e.target.value })}
                                                className="flex-1 px-2 py-1.5 border rounded-lg text-xs min-w-0"
                                            />
                                            <input
                                                type="time"
                                                value={override.startTime || ''}
                                                onChange={e => setOverride({ startTime: e.target.value })}
                                                className="w-24 px-2 py-1.5 border rounded-lg text-xs"
                                            />
                                            <input
                                                type="time"
                                                value={override.endTime || ''}
                                                onChange={e => setOverride({ endTime: e.target.value })}
                                                className="w-24 px-2 py-1.5 border rounded-lg text-xs"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* debate/criteria_based/single_score — none of these read a Tur/stage grouping, only a flat
                round count (the old Kubok/Liga Tur-builder used to render here too, letting the admin
                build Tur structure that was then silently discarded at save time). */}
            {!isQuizMixed && !isCorrectAnswer && !isMatchBased && (
                <div className="max-w-xs">
                    <label className={labelClass}>Raundlar soni</label>
                    <input
                        type="number"
                        min="1"
                        className={inputClass}
                        value={data.simpleRoundsCount}
                        onChange={e => onChange({ simpleRoundsCount: Math.max(1, Number(e.target.value) || 1) })}
                    />
                </div>
            )}

            {/* Baholash shartlari (criteria_based) — the conditions teams actually compete on. These used
                to be fixed per preset (a hardcoded `criteriaInput` string), so a plain "3 ta shart" contest
                could only exist if some club template happened to define exactly those three. Now the admin
                writes them here; the preset's own list is just the starting point. Judges score each row,
                and the per-judge results are combined by Step 3's "Hisoblash usuli". */}
            {engine === 'criteria_based' && (() => {
                const fallback = (selectedPreset?.defaults?.criteria
                    || (selectedPreset?.defaults?.criteriaInput || '').split(',').filter(c => c.trim())
                        .map((c, idx) => ({ id: `crit_${idx}`, name: c.trim(), maxScore: 10 })));
                const list = data.criteriaList || fallback;
                const setList = (next) => onChange({ criteriaList: next });
                const totalMax = list.reduce((sum, c) => sum + (Number(c.maxScore) || 0), 0);

                return (
                    <div className="p-5 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h4 className="text-xs font-extrabold text-indigo-700 uppercase tracking-wider">
                                    Baholash shartlari
                                </h4>
                                <p className="text-[11px] text-indigo-500 mt-0.5">
                                    Jamoalar shu shartlar bo'yicha bellashadi. Har bir hakam har bir shartga ball qo'yadi.
                                </p>
                            </div>
                            <span className="text-[11px] font-bold text-indigo-700 bg-white border border-indigo-200 rounded-lg px-2.5 py-1 shrink-0">
                                Maks: {totalMax} ball
                            </span>
                        </div>

                        <div className="space-y-2">
                            {list.map((c, idx) => (
                                <div key={c.id} className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold text-gray-400 w-5 shrink-0">{idx + 1}.</span>
                                    <input
                                        type="text"
                                        value={c.name}
                                        placeholder="Shart nomi"
                                        onChange={e => setList(list.map(x => x.id === c.id ? { ...x, name: e.target.value } : x))}
                                        className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                                    />
                                    <input
                                        type="number"
                                        min="1"
                                        value={c.maxScore}
                                        title="Maksimal ball"
                                        onChange={e => setList(list.map(x => x.id === c.id ? { ...x, maxScore: Math.max(1, Number(e.target.value) || 1) } : x))}
                                        className="w-20 px-2 py-2 border border-gray-200 rounded-xl text-sm text-center bg-white"
                                    />
                                    <button
                                        type="button"
                                        title="Shartni o'chirish"
                                        disabled={list.length <= 1}
                                        onClick={() => setList(list.filter(x => x.id !== c.id))}
                                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setList([...list, { id: `crit_${Date.now()}`, name: 'Yangi shart', maxScore: 10 }])}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50"
                            >
                                <Plus size={13} /> Shart qo'shish
                            </button>
                            {data.criteriaList && (
                                <button
                                    type="button"
                                    onClick={() => onChange({ criteriaList: null })}
                                    className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700"
                                >
                                    Andozaga qaytarish
                                </button>
                            )}
                        </div>
                    </div>
                );
            })()}

            {isMatchBased && (
                <div className="space-y-4">
                    <div className="p-4 bg-slate-50 border border-gray-100 rounded-2xl flex items-start gap-2.5">
                        <Info size={15} className="text-gray-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-gray-500">
                            Bu turnir turida raundlar soni oldindan belgilanmaydi — jamoalar ro'yxatdan o'tgach,
                            "Turlarni boshqarish" bo'limida guruh/pley-off bosqichlari va uchrashuvlar admin tomonidan tuziladi.
                        </p>
                    </div>

                    {engine === 'court_match' && (
                        <div className="p-5 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-4">
                            <div>
                                <h4 className="text-xs font-extrabold text-indigo-700 uppercase tracking-wider">
                                    TSUL Court O'yin Formatini Sozlash
                                </h4>
                                <p className="text-[11px] text-indigo-500 mt-0.5">
                                    Uchrashuvlarda nechta tomon ishtirok etishi va ularning nomlanishini belgilang.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>O'yin formati</label>
                                    <select
                                        className={inputClass}
                                        value={data.isSingleSided ? 'single' : 'double'}
                                        onChange={e => onChange({
                                            isSingleSided: e.target.value === 'single',
                                            sideTLabel: e.target.value === 'single' ? 'Jamoa' : (data.sideTLabel || 'Claimant'),
                                            sideILabel: e.target.value === 'single' ? '' : (data.sideILabel || 'Respondent')
                                        })}
                                    >
                                        <option value="double">Ikki tomonlama uchrashuv (Qarama-qarshi)</option>
                                        <option value="single">Yakkaxon uchrashuv (Faqat bitta jamoa)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className={labelClass}>1-Tomon nomi (Masalan: Claimant)</label>
                                    <input
                                        type="text"
                                        className={inputClass}
                                        value={data.sideTLabel || 'Claimant'}
                                        onChange={e => onChange({ sideTLabel: e.target.value })}
                                        placeholder="Tomon nomi..."
                                    />
                                </div>

                                {!data.isSingleSided && (
                                    <div>
                                        <label className={labelClass}>2-Tomon nomi (Masalan: Respondent)</label>
                                        <input
                                            type="text"
                                            className={inputClass}
                                            value={data.sideILabel || 'Respondent'}
                                            onChange={e => onChange({ sideILabel: e.target.value })}
                                            placeholder="Qarshi tomon nomi..."
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Har notiq real hakam ekraniga (DebateNotiqScoringPanel.jsx) kirmasdan oldin ham qaysi
                mezonga qancha ball berilishini ko'rib qo'yishi uchun — standart holatda DEBATE_MATCH_CRITERIA
                (21 band, tahrirlanmaydi), lekin "Tahrirlash" bosilsa SHU MUSOBAQAGA XOS nusxa
                (data.debateMatchCriteria) ochiladi — ball/nom o'zgartirish, band qo'shish/o'chirish mumkin.
                Standart holatga qaytarish ham bor. Butun hisoblash zanjiri (getCriteriaForNotiq/
                computeNotiqTotal/computeNotiqMaxScore/aggregateNotiqAcrossJudges, DebateNotiqScoringPanel.jsx,
                db.js'ning finishDebateMatch/getDebateBestSpeakerLeaderboard) buni competition.debateMatchCriteria
                orqali xuddi shunday o'qiydi — bu yerda ko'rsatilgan/tahrirlangan ro'yxat aynan
                ishlatiladigani. ATIX/Dixatomiya kichik bandlari ota-bandi ostida sal xiraroq rangda
                ko'rsatiladi — bular alohida emas, o'sha katta mezonning tarkibiy qismi. */}
            {['debate_match', 'court_match'].includes(engine) && (() => {
                const isCourt = engine === 'court_match';
                // Shared resolver — same function db.finishDebateMatch and DebateNotiqScoringPanel use, so
                // what's shown/edited here is exactly what will be scored. (This block previously built the
                // default sheet inline from TSUL_COURT_*_CRITERIA, which it never imported — a runtime
                // ReferenceError the moment a court competition reached Step 2.)
                const activeCriteria = isCourt
                    ? getCourtMatchCriteria(data)
                    : (data.debateMatchCriteria || DEBATE_MATCH_CRITERIA);
                const isCustomized = isCourt ? !!data.courtMatchCriteria : !!data.debateMatchCriteria;
                const updateCriterion = (id, patch) => {
                    if (isCourt) {
                        onChange({ courtMatchCriteria: activeCriteria.map(c => c.id === id ? { ...c, ...patch } : c) });
                    } else {
                        onChange({ debateMatchCriteria: activeCriteria.map(c => c.id === id ? { ...c, ...patch } : c) });
                    }
                };
                const deleteCriterion = (id) => {
                    if (isCourt) {
                        onChange({ courtMatchCriteria: activeCriteria.filter(c => c.id !== id) });
                    } else {
                        onChange({ debateMatchCriteria: activeCriteria.filter(c => c.id !== id) });
                    }
                };
                const addCriterion = (categoryId) => {
                    const newItem = { id: `custom_${Date.now()}`, category: categoryId, name: 'Yangi band', max: 10, kind: 'score', appliesTo: 'all' };
                    if (isCourt) {
                        onChange({ courtMatchCriteria: [...activeCriteria, newItem] });
                    } else {
                        onChange({ debateMatchCriteria: [...activeCriteria, newItem] });
                    }
                };
                const startEditing = () => {
                    if (!isCustomized) {
                        if (isCourt) {
                            // Deep-copied so editing the new per-competition rubric never mutates the
                            // shared standard sheet (same reason the debate branch below spreads each row).
                            onChange({ courtMatchCriteria: getCourtMatchCriteria(data).map(c => ({ ...c })) });
                        } else {
                            onChange({ debateMatchCriteria: DEBATE_MATCH_CRITERIA.map(c => ({ ...c })) });
                        }
                    }
                    setIsEditingCriteria(true);
                };
                const resetToStandard = () => {
                    if (isCourt) {
                        onChange({ courtMatchCriteria: null });
                    } else {
                        onChange({ debateMatchCriteria: null });
                    }
                    setIsEditingCriteria(false);
                };

                const categories = isCourt ? COURT_MATCH_CATEGORIES : DEBATE_MATCH_CATEGORIES;

                return (
                    <div className="p-5 bg-rose-50/50 border border-rose-100 rounded-2xl space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h4 className="text-xs font-extrabold text-rose-700 uppercase tracking-wider">
                                    Baholash mezonlari ({activeCriteria.length} band)
                                    {isCustomized && <span className="ml-2 text-[10px] font-bold text-indigo-600">Moslashtirilgan</span>}
                                </h4>
                                <p className="text-[11px] text-rose-400 mt-0.5">
                                    {isEditingCriteria
                                        ? "Ball/nomni o'zgartiring, band qo'shing yoki o'chiring — faqat shu musobaqaga tegishli bo'ladi."
                                        : "Mezonlar standart. Qizil — jarima, yashil — bonus band; qolganlari asosiy ball."}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {isCustomized && (
                                    <button type="button" onClick={resetToStandard} className="text-[11px] font-bold text-gray-400 hover:text-gray-600">
                                        Standartga qaytarish
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => (isEditingCriteria ? setIsEditingCriteria(false) : startEditing())}
                                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white border border-rose-200 text-rose-700 hover:bg-rose-50"
                                >
                                    {isEditingCriteria ? 'Tayyor' : 'Tahrirlash'}
                                </button>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {categories.map(cat => (
                                <div key={cat.id}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <p className="text-[11px] font-bold text-rose-600">{cat.label}</p>
                                        {isEditingCriteria && (
                                            <button type="button" onClick={() => addCriterion(cat.id)} className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700">
                                                <Plus size={11} /> Band qo'shish
                                            </button>
                                        )}
                                    </div>
                                    {isEditingCriteria ? (
                                        <div className="space-y-1.5">
                                            {activeCriteria.filter(c => c.category === cat.id).map(c => (
                                                <div key={c.id} className="flex items-center gap-1.5 p-2 bg-white border border-rose-100 rounded-lg">
                                                    <input
                                                        type="text"
                                                        value={c.name}
                                                        onChange={e => updateCriterion(c.id, { name: e.target.value })}
                                                        className={`flex-1 min-w-0 px-2 py-1 border rounded text-[11px] ${c.parent ? 'ml-4' : ''}`}
                                                    />
                                                    <select
                                                        value={c.kind}
                                                        onChange={e => updateCriterion(c.id, { kind: e.target.value })}
                                                        className="px-1.5 py-1 border rounded text-[10px] shrink-0"
                                                    >
                                                        <option value="score">Asosiy</option>
                                                        <option value="penalty">Jarima</option>
                                                        <option value="bonus">Bonus</option>
                                                    </select>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={c.max}
                                                        onChange={e => updateCriterion(c.id, { max: Math.max(0, Number(e.target.value) || 0) })}
                                                        className="w-14 px-1.5 py-1 border rounded text-[11px] text-center shrink-0"
                                                    />
                                                    <button type="button" onClick={() => deleteCriterion(c.id)} className="p-1 text-gray-300 hover:text-red-500 shrink-0">
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap gap-1.5">
                                            {activeCriteria.filter(c => c.category === cat.id).map(c => (
                                                <span
                                                    key={c.id}
                                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                                                        c.kind === 'penalty' ? 'bg-red-50 border-red-200 text-red-600'
                                                            : c.kind === 'bonus' ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                                                            : c.parent ? 'bg-white/60 border-rose-100 text-rose-500'
                                                            : 'bg-white border-rose-200 text-rose-700'
                                                    }`}
                                                >
                                                    {c.parent ? `↳ ${c.name}` : c.name}: 0-{c.max}
                                                    {c.appliesTo !== 'all' ? ` (${c.appliesTo.join('/')})` : ''}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default TournamentStructureStep;
