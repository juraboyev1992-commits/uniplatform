import React, { useMemo, useRef, useState } from 'react';
import { Lock, Unlock, Eye, EyeOff, Upload, Download, UserCheck, Ban, Check, X as XIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import Button from './Button';
import Modal from './Modal';
import TeamDetailDrawer from './TeamDetailDrawer';
import { db } from '../../services/db';

// Zakovat (correct_answer) "Natija kiritish" grid — a spreadsheet view of every Savol in the currently
// selected Raund at once (rows = teams, columns = questions, click-to-cycle cells), replacing the old
// one-question-at-a-time table for this scoring method only. Every other scoring method keeps rendering
// through TournamentScoring.jsx's original table, untouched. Writes go straight through the existing
// db.saveRoundScores per cell (see file header comment in TournamentScoring.jsx for why: this grid spans
// many `round` values at once, so the existing single-round debounced-autosave machinery doesn't fit).
//
// Lock and "Natijalarni yashirish" state/toggle logic live in the parent (TournamentScoring.jsx, since
// resultsHidden is persisted on the competition and read by OTHER tabs too — Reyting, Natijalar markazi,
// the public live screen); only the BUTTONS render here (below the Raund/Savol turi row). Whoever is
// entering scores always sees real numbers in THIS grid regardless of `hideResults` — that flag only
// hides results from participants/teams elsewhere, never from the person doing the scoring, so it's used
// here purely to drive the button's own active/inactive styling, never to mask a value.
//
// Cell click is 2-state (unanswered <-> to'g'ri) — there's no explicit "noto'g'ri" click target, since
// most Zakovat rounds don't penalize wrong answers (penaltyPerWrongAnswer defaults to 0, same net effect
// as leaving a cell unanswered). A `false` value can still exist in older data (still rendered as a red X
// for backward compatibility) and still counts as a penalty in getLeaderboard if penaltyPerWrongAnswer>0
// for that competition — clicking such a cell just moves it to "to'g'ri" like any other cell.
const cycleValue = (current) => (current === true ? null : true);

const QUESTION_TYPE_OPTIONS = [
    { id: 'standard', label: 'Standart' },
    { id: 'blitz', label: 'Blits' },
    { id: 'bonus', label: 'Bonus' }
];

const QuizScoringGrid = ({
    competition, participants, activeJudge, device,
    questionButtons, selectedRoundGroup, roundGroupCount, currentRound, turRangeStart,
    questionsPerRoundGroup, locked, hideResults,
    onSelectRoundGroup, onScoresChanged, onToggleLock, onToggleHideResults
}) => {
    const [version, setVersion] = useState(0);
    const [selectedTeamId, setSelectedTeamId] = useState(null);
    const [editingPointsIdx, setEditingPointsIdx] = useState(null);
    const [csvPreview, setCsvPreview] = useState(null); // { rows, matchedCount, unmatchedIds }
    const [csvError, setCsvError] = useState('');
    const fileInputRef = useRef(null);

    const roundGroupIndex = Math.ceil((questionButtons[0] || 1) / questionsPerRoundGroup);
    // Savol numbers shown to the judge reset at the start of each Tur and count up across that Tur's
    // Raunds (Tur1-Raund1: 1-12, Tur1-Raund2: 13-24, Tur2-Raund1: 1-12 again, ...) rather than staying
    // global across the whole competition — this is the numbering the admin actually thinks in when they
    // set up "N Tur x M Raund x K Savol" at creation time.
    const localSavolLabel = (q) => q - turRangeStart + 1;

    const scoresByQuestion = useMemo(() => {
        const all = db.getCompetitionScores(competition.id).filter(s => s.judge === activeJudge && questionButtons.includes(s.round));
        const map = new Map(); // questionIndex -> Map(participantId -> value)
        questionButtons.forEach(q => map.set(q, new Map()));
        all.forEach(s => map.get(s.round)?.set(s.participantId, s.value));
        return map;
    }, [competition.id, activeJudge, questionButtons, version]);

    const questionMeta = useMemo(() => {
        const overrides = db.getCompetitionQuestionPoints(competition.id);
        return new Map(overrides.map(r => [r.questionIndex, r]));
    }, [competition.id, version]);

    const seatByParticipant = useMemo(() => {
        return new Map(db.getCompetitionParticipantSeats(competition.id).map(r => [r.participantId, r.seatNumber]));
    }, [competition.id, version]);

    const statusByParticipant = useMemo(() => {
        return new Map(db.getCompetitionRoundParticipantStatus(competition.id, roundGroupIndex).map(r => [r.participantId, r]));
    }, [competition.id, roundGroupIndex, version]);

    // "SR" here is the SAME real tie-break metric CompetitionRatingTab.jsx already shows on the Reyting
    // tab (count of positively-scored rounds across the WHOLE competition) — reused via db.getLeaderboard,
    // not a fabricated per-raund number, so it stays consistent with the one place "SR" already means
    // something in this app.
    const leaderboardByParticipant = useMemo(
        () => new Map(db.getLeaderboard(competition.id).map(r => [r.participant.id, r])),
        [competition.id, version]
    );
    const srFor = (participantId) => Object.values(leaderboardByParticipant.get(participantId)?.roundScores || {}).filter(v => v != null && v > 0).length;

    const pointValueFor = (q) => questionMeta.get(q)?.points ?? (competition.pointsPerCorrectAnswer ?? 10);
    const typeValueFor = (q) => questionMeta.get(q)?.questionType || 'standard';
    const penaltyValue = competition.penaltyPerWrongAnswer ?? 0;

    const totalFor = (participantId) => questionButtons.reduce((sum, q) => {
        const v = scoresByQuestion.get(q)?.get(participantId);
        if (v === true) return sum + pointValueFor(q);
        if (v === false) return sum - penaltyValue;
        return sum;
    }, 0);

    const handleCellClick = async (participantId, questionIndex) => {
        if (locked) return;
        const current = scoresByQuestion.get(questionIndex)?.get(participantId);
        const next = cycleValue(current);
        await db.saveRoundScores(competition.id, questionIndex, activeJudge, [{ participantId, value: next, criteriaScores: {} }], device);
        setVersion(v => v + 1);
        onScoresChanged?.();
    };

    const handleSeatChange = async (participantId, value) => {
        try {
            await db.setParticipantSeat(competition.id, participantId, value === '' ? null : Number(value));
        } catch (e) { alert(e.message); return; }
        setVersion(v => v + 1);
    };

    const handlePointsChange = async (questionIndex, value) => {
        if (value === '') { setEditingPointsIdx(null); return; }
        try {
            await db.setCompetitionQuestionPoints(competition.id, questionIndex, Number(value));
        } catch (e) { alert(e.message); return; }
        setEditingPointsIdx(null);
        setVersion(v => v + 1);
        onScoresChanged?.();
    };

    const handleTypeChange = async (questionIndex, questionType) => {
        try {
            await db.setCompetitionQuestionType(competition.id, questionIndex, questionType);
        } catch (e) { alert(e.message); return; }
        setVersion(v => v + 1);
    };

    const handleToggleAttended = async (participantId) => {
        if (locked) return;
        const current = statusByParticipant.get(participantId)?.attended;
        try {
            await db.setParticipantRoundStatus(competition.id, roundGroupIndex, participantId, { attended: current === true ? false : true }, activeJudge);
        } catch (e) { alert(e.message); return; }
        setVersion(v => v + 1);
    };

    const handleToggleDisqualify = async (participantId) => {
        if (locked) return;
        const current = !!statusByParticipant.get(participantId)?.disqualified;
        if (!current) {
            if (!window.confirm("Bu ishtirokchini shu raund uchun diskvalifikatsiya qilmoqchimisiz? Uning bu raunddagi barcha javoblari bekor qilinadi.")) return;
            for (const q of questionButtons) {
                await db.saveRoundScores(competition.id, q, activeJudge, [{ participantId, value: null, criteriaScores: {} }], device);
            }
        }
        try {
            await db.setParticipantRoundStatus(competition.id, roundGroupIndex, participantId, { disqualified: !current }, activeJudge);
        } catch (e) { alert(e.message); return; }
        setVersion(v => v + 1);
        onScoresChanged?.();
    };

    const participantName = (p) => (competition.type === 'team' ? p.name : p.fullName);

    // --- CSV import/export --------------------------------------------------------------------------
    // Format: ParticipantId,Ishtirokchi,Stol,<1..N> — ParticipantId is the authoritative match key (never
    // the name); columns 1..N map by position to questionButtons[i] (Raund-local, portable across Raunds).
    // Cell values: 1=To'g'ri, 0=Noto'g'ri, empty=Bekor.
    const buildCsvRows = () => {
        const header = ['ParticipantId', 'Ishtirokchi', 'Stol', ...questionButtons.map(q => localSavolLabel(q))];
        const rows = participants.map(p => {
            const cells = questionButtons.map(q => {
                const v = scoresByQuestion.get(q)?.get(p.id);
                return v === true ? '1' : v === false ? '0' : '';
            });
            return [p.id, `"${participantName(p) || ''}"`, seatByParticipant.get(p.id) ?? '', ...cells];
        });
        return [header, ...rows];
    };

    const downloadTemplate = () => {
        const rows = buildCsvRows();
        const csvContent = '﻿' + rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${competition.name || 'raund'}_${roundGroupIndex}-raund.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleCsvFile = (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setCsvError('');
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const wb = XLSX.read(ev.target.result, { type: 'array' });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                if (raw.length < 2) throw new Error("Faylda ma'lumot topilmadi");
                const dataRows = raw.slice(1).filter(r => r[0]);
                const participantIds = new Set(participants.map(p => p.id));
                const unmatchedIds = dataRows.map(r => String(r[0])).filter(id => !participantIds.has(id));
                setCsvPreview({ rows: dataRows, matchedCount: dataRows.length - unmatchedIds.length, unmatchedIds });
            } catch (err) {
                setCsvError(err.message || 'Faylni o\'qishda xatolik yuz berdi');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const commitCsvImport = async () => {
        if (!csvPreview) return;
        for (const row of csvPreview.rows) {
            const participantId = String(row[0]);
            if (!participants.some(p => p.id === participantId)) continue;
            const seat = row[2];
            if (seat !== '' && seat != null) await db.setParticipantSeat(competition.id, participantId, Number(seat));
            for (let i = 0; i < questionButtons.length; i++) {
                const q = questionButtons[i];
                const cell = row[3 + i];
                const value = cell === 1 || cell === '1' ? true : cell === 0 || cell === '0' ? false : null;
                await db.saveRoundScores(competition.id, q, activeJudge, [{ participantId, value, criteriaScores: {} }], device);
            }
        }
        setCsvPreview(null);
        setVersion(v => v + 1);
        onScoresChanged?.();
    };

    return (
        <div className="space-y-4">
            {locked && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-700">
                    <Lock size={14} /> Bu raund qulflangan — natijalarni o'zgartirish uchun avval yuqoridan qulfdan chiqaring.
                </div>
            )}
            {csvError && (
                <div className="px-4 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700">{csvError}</div>
            )}

            {/* Raund selector + Savol turi (currently active savol's type) + CSV import/template */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex gap-1.5 flex-wrap">
                    {Array.from({ length: roundGroupCount }, (_, i) => i + 1).map(groupNum => (
                        <button
                            key={groupNum}
                            type="button"
                            onClick={() => onSelectRoundGroup(groupNum)}
                            className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-all border ${
                                selectedRoundGroup === groupNum
                                    ? 'bg-indigo-700 border-indigo-700 text-white'
                                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            {groupNum}-Raund
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2.5 flex-wrap">
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-600">
                        Savol turi:
                        <select
                            value={typeValueFor(currentRound)}
                            onChange={e => handleTypeChange(currentRound, e.target.value)}
                            disabled={locked}
                            className="px-2.5 py-1.5 border rounded-lg text-xs font-bold text-gray-700 bg-white"
                        >
                            {QUESTION_TYPE_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                    </label>
                    <button type="button" title="Shablon yuklab olish" onClick={downloadTemplate} className="p-2 rounded-lg bg-slate-100 text-gray-500 hover:bg-slate-200">
                        <Download size={14} />
                    </button>
                    <button type="button" title="CSV Import" onClick={() => fileInputRef.current?.click()} disabled={locked} className="p-2 rounded-lg bg-slate-100 text-gray-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed">
                        <Upload size={14} />
                    </button>
                    <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
                </div>
            </div>

            {/* Turni qulflash / Natijalarni yashirish — sit right below the Raund/Savol turi row */}
            <div className="flex items-center gap-2 flex-wrap">
                <button
                    type="button"
                    onClick={onToggleLock}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 transition-colors"
                >
                    {locked ? <Unlock size={14} /> : <Lock size={14} />}
                    {locked ? 'Turni qulfdan chiqarish' : 'Turni qulflash'}
                </button>
                <button
                    type="button"
                    onClick={onToggleHideResults}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                        hideResults ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50'
                    }`}
                >
                    {hideResults ? <EyeOff size={14} /> : <Eye size={14} />}
                    Natijalarni yashirish
                </button>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-[11px] text-gray-500 flex-wrap">
                <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-emerald-100 text-emerald-600 flex items-center justify-center"><Check size={11} /></span>To'g'ri javob</span>
                <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-slate-100 text-gray-400 flex items-center justify-center">–</span>Javob kiritilmagan</span>
            </div>

            {/* Grid */}
            <div className="border rounded-2xl overflow-hidden">
                <div className="max-h-[600px] overflow-auto">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead className="bg-slate-50 sticky top-0 z-10 text-xs font-bold text-gray-500 uppercase">
                            <tr>
                                <th className="p-2 border-b w-16">Holat</th>
                                <th className="p-2 border-b w-16">Stol</th>
                                <th className="p-3 border-b">Jamoa</th>
                                {questionButtons.map(q => (
                                    <th key={q} className="p-2 border-b text-center w-12">{localSavolLabel(q)}</th>
                                ))}
                                <th className="p-3 border-b text-center">Jami</th>
                                <th className="p-3 border-b text-center">SR</th>
                            </tr>
                            <tr className="bg-slate-50/60">
                                <th className="p-1 border-b" colSpan={3}>
                                    <span className="text-[10px] font-bold text-gray-400 normal-case">Ball</span>
                                </th>
                                {questionButtons.map(q => (
                                    <th key={q} className="p-1 border-b text-center">
                                        {editingPointsIdx === q ? (
                                            <input
                                                type="number"
                                                autoFocus
                                                defaultValue={pointValueFor(q)}
                                                onBlur={e => handlePointsChange(q, e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingPointsIdx(null); }}
                                                className="w-10 px-1 py-0.5 border rounded text-center text-[11px]"
                                            />
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => !locked && setEditingPointsIdx(q)}
                                                className="block w-full text-[11px] font-bold text-amber-600 hover:underline"
                                            >
                                                {pointValueFor(q)}
                                            </button>
                                        )}
                                    </th>
                                ))}
                                <th className="p-1 border-b" colSpan={2} />
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {participants.map(p => {
                                const status = statusByParticipant.get(p.id);
                                const disqualified = !!status?.disqualified;
                                return (
                                    <tr key={p.id} className={`hover:bg-slate-50/80 transition-colors ${disqualified ? 'opacity-50' : ''}`}>
                                        <td className="p-1.5">
                                            <div className="flex items-center gap-0.5">
                                                <button
                                                    type="button"
                                                    title="Ishtirok etdi"
                                                    onClick={() => handleToggleAttended(p.id)}
                                                    disabled={locked}
                                                    className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                                                        status?.attended === true ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-gray-400 hover:bg-emerald-50'
                                                    }`}
                                                >
                                                    <UserCheck size={11} />
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Diskvalifikatsiya"
                                                    onClick={() => handleToggleDisqualify(p.id)}
                                                    disabled={locked}
                                                    className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                                                        disqualified ? 'bg-rose-500 text-white' : 'bg-slate-100 text-gray-400 hover:bg-rose-50'
                                                    }`}
                                                >
                                                    <Ban size={11} />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="p-1.5">
                                            <input
                                                type="number"
                                                defaultValue={seatByParticipant.get(p.id) ?? ''}
                                                onBlur={e => handleSeatChange(p.id, e.target.value)}
                                                disabled={locked}
                                                className="w-12 px-1.5 py-1 border rounded-lg text-center text-xs"
                                                placeholder="-"
                                            />
                                        </td>
                                        <td className="p-2 font-semibold text-gray-800 whitespace-nowrap">
                                            {competition.type === 'team' ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedTeamId(p.id)}
                                                    className="hover:text-indigo-600 hover:underline transition-colors text-left"
                                                >
                                                    {participantName(p)}
                                                </button>
                                            ) : participantName(p)}
                                        </td>
                                        {questionButtons.map(q => {
                                            const value = scoresByQuestion.get(q)?.get(p.id);
                                            return (
                                                <td key={q} className="p-1 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCellClick(p.id, q)}
                                                        disabled={locked}
                                                        className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-colors ${
                                                            value === true
                                                                ? 'bg-emerald-100 text-emerald-600'
                                                                : value === false
                                                                    ? 'bg-rose-100 text-rose-600'
                                                                    : 'bg-slate-50 text-gray-300 hover:bg-slate-100'
                                                        }`}
                                                    >
                                                        {value === true ? <Check size={15} /> : value === false ? <XIcon size={15} /> : '–'}
                                                    </button>
                                                </td>
                                            );
                                        })}
                                        <td className="p-2 text-center font-extrabold text-indigo-600 text-xs">
                                            {totalFor(p.id)}
                                        </td>
                                        <td className="p-2 text-center font-extrabold text-amber-600 text-xs">
                                            {srFor(p.id)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal isOpen={!!csvPreview} onClose={() => setCsvPreview(null)} title="CSV import" size="sm">
                {csvPreview && (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                            <span className="font-bold text-gray-900">{csvPreview.rows.length}</span> qator topildi,{' '}
                            <span className="font-bold text-emerald-600">{csvPreview.matchedCount}</span> ta ishtirokchi mos keldi.
                        </p>
                        {csvPreview.unmatchedIds.length > 0 && (
                            <p className="text-xs text-rose-600">
                                Mos kelmagan ID lar ({csvPreview.unmatchedIds.length}): {csvPreview.unmatchedIds.slice(0, 5).join(', ')}
                                {csvPreview.unmatchedIds.length > 5 ? '...' : ''}
                            </p>
                        )}
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="sm" onClick={() => setCsvPreview(null)}>Bekor qilish</Button>
                            <Button variant="primary" size="sm" onClick={commitCsvImport} disabled={csvPreview.matchedCount === 0}>
                                Tasdiqlash va yuklash
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

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

export default QuizScoringGrid;
