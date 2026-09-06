import React, { useMemo, useState } from 'react';
import { Gift, Award, CheckCircle2, XCircle, Trash2, Users, Search, Plus, Table2 } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import StudentPicker from '../../components/common/StudentPicker';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { useTabParam } from '../../hooks/useTabParam';
import {
    RECOGNITION_KIND, RECOGNITION_KIND_LABELS, RECOGNITION_STATUS_LABELS, PRIZE_TITLE_SUGGESTIONS,
} from '../../config/studentRecognitions.js';

// Oqim: Musobaqada ishtirok -> bayonnoma -> diplom/sertifikat -> shu yerda rag'bat puli/mukofot.
// Koordinator/tyutor/admin TAKLIF qiladi (pending), admin TASDIQLAYDI - shundagina Taqdirlash
// reestridagi rasmiy jadvalga kiradi. Musobaqada haqiqiy natija hisoblangan bo'lsa, g'oliblar
// tizim tomonidan AVTOMATIK aniqlanadi (db.getAutoDetectedWinners - getLeaderboard bilan bir xil
// manba) - koordinator faqat ko'rib chiqib, pul miqdorini yozib tasdiqqa yuboradi.
const IncentiveAwardsPage = () => {
    const { user, hasClubRole } = useAuth();
    const isAdmin = user?.role === 'ADMINISTRATOR';
    const [tab, setTab] = useTabParam(['propose', 'builder', 'pending'], 'propose');
    const [version, setVersion] = useState(0);
    const bump = () => setVersion(v => v + 1);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const backendReady = db.isStudentRecognitionsBackendReady();

    // --- Taklif qilish ---
    const [kind, setKind] = useState(RECOGNITION_KIND.INCENTIVE);
    const [competitionId, setCompetitionId] = useState('');
    const [selectedAmounts, setSelectedAmounts] = useState({}); // studentId -> { checked, amount }
    const [manualStudent, setManualStudent] = useState(null);
    const [manualDesc, setManualDesc] = useState('');
    const [manualAmount, setManualAmount] = useState('');
    const [prizeStudent, setPrizeStudent] = useState(null);
    const [prizeTitle, setPrizeTitle] = useState('');
    const [prizeActivityId, setPrizeActivityId] = useState('');
    const [prizeDesc, setPrizeDesc] = useState('');

    // --- Jadval tuzish (screenshotdagi rasmiy hujjat ko'rinishini to'g'ridan-to'g'ri quradi) ---
    // Sarlavha - mavjud musobaqadan tanlanadi YOKI qo'lda yoziladi. Talaba StudentPicker orqali
    // qidirib qo'shiladi - fakultet/pasport/JSHSHIR/to'lov shakli AVTOMATIK pasport modulidan
    // o'qib to'ldiriladi (qayta kiritilmaydi), faqat "Ishtiroki" va "Miqdor" qo'lda yoziladi.
    //
    // Sarlavha HAR BIR TALABAGA QO'SHILAYOTGAN PAYTDA yozib olinadi (rows[].activityTitle) -
    // birgina umumiy sarlavha emas. Shuning uchun bir nechta musobaqa ketma-ket tanlab, har biriga
    // o'z g'oliblarini qo'shib, hammasini BITTA jadvalda (bir necha bo'lim/guruh sifatida) yig'ish
    // mumkin - screenshotdagi rasmiy hujjat aynan shunday, bir nechta tanlov bo'limidan iborat edi.
    const [builderTitleMode, setBuilderTitleMode] = useState('select'); // 'select' | 'manual'
    const [builderCompetitionId, setBuilderCompetitionId] = useState('');
    const [builderManualTitle, setBuilderManualTitle] = useState('');
    const [builderRows, setBuilderRows] = useState([]); // { tempId, student, activityTitle, activityType, activityId, participationDescription, amount, jshshir, passportNumber, paymentForm }

    const myCompetitions = useMemo(() => {
        const all = db.getCompetitions();
        if (isAdmin) return all;
        return all.filter(c => c.contextType === 'club' && hasClubRole(c.contextId, ['coordinator', 'head_coordinator']));
    }, [isAdmin, version]);

    const currentBuilderTitle = builderTitleMode === 'select'
        ? (myCompetitions.find(c => c.id === builderCompetitionId)?.name || '')
        : builderManualTitle.trim();

    const addBuilderStudent = (student) => {
        if (!student || !currentBuilderTitle) return;
        const passport = db.getStudentPassportRaw(student.id);
        const sections = passport?.sections || {};
        setBuilderRows(rows => [...rows, {
            tempId: 'row_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            student, activityTitle: currentBuilderTitle,
            activityType: builderTitleMode === 'select' && builderCompetitionId ? 'competition' : null,
            activityId: builderTitleMode === 'select' ? (builderCompetitionId || null) : null,
            participationDescription: '', amount: '',
            jshshir: sections['identity.jshshir'] || '', passportNumber: sections['identity.passport'] || '',
            paymentForm: sections['education.paymentForm'] || '',
        }]);
    };
    const updateBuilderRow = (tempId, patch) => setBuilderRows(rows => rows.map(r => r.tempId === tempId ? { ...r, ...patch } : r));
    const removeBuilderRow = (tempId) => setBuilderRows(rows => rows.filter(r => r.tempId !== tempId));

    // Bitta bo'lim (sarlavha) bo'yicha guruhlangan - screenshotdagi ko'p bo'limli jadval kabi.
    const builderGroups = useMemo(() => {
        const map = new Map();
        builderRows.forEach(r => {
            if (!map.has(r.activityTitle)) map.set(r.activityTitle, []);
            map.get(r.activityTitle).push(r);
        });
        return Array.from(map.entries());
    }, [builderRows]);

    const handleSubmitBuilder = async () => {
        setError(''); setBusy(true);
        try {
            if (builderRows.length === 0) throw new Error("Kamida bitta talaba qo'shing");
            for (const r of builderRows) {
                await db.proposeStudentRecognition({
                    kind: RECOGNITION_KIND.INCENTIVE,
                    activityType: r.activityType, activityId: r.activityId,
                    activityTitle: r.activityTitle, studentId: r.student.id, source: 'manual',
                    participationDescription: r.participationDescription || null, amount: r.amount || null,
                    proposedBy: user?.username || 'admin',
                });
            }
            setBuilderCompetitionId(''); setBuilderManualTitle(''); setBuilderRows([]);
            bump(); setTab('pending');
        } catch (e) { setError(e.message || 'Xatolik yuz berdi'); } finally { setBusy(false); }
    };

    const selectedCompetition = useMemo(() => myCompetitions.find(c => c.id === competitionId) || null, [myCompetitions, competitionId]);
    const autoWinners = useMemo(
        () => competitionId ? db.getAutoDetectedWinners('competition', competitionId) : [],
        [competitionId, version]
    );

    const toggleWinner = (studentId, patch) => setSelectedAmounts(s => ({
        ...s, [studentId]: { checked: false, amount: '', ...s[studentId], ...patch },
    }));

    const resetProposeForm = () => {
        setCompetitionId(''); setSelectedAmounts({}); setManualStudent(null); setManualDesc(''); setManualAmount('');
        setPrizeStudent(null); setPrizeTitle(''); setPrizeActivityId(''); setPrizeDesc('');
    };

    const handleSubmitIncentives = async () => {
        setError(''); setBusy(true);
        try {
            const winnerEntries = Object.entries(selectedAmounts).filter(([, v]) => v.checked);
            if (winnerEntries.length === 0 && !manualStudent) throw new Error("Kamida bitta talaba tanlang");
            for (const [studentId, v] of winnerEntries) {
                const w = autoWinners.find(w => w.studentId === studentId);
                await db.proposeStudentRecognition({
                    kind: RECOGNITION_KIND.INCENTIVE, activityType: 'competition', activityId: competitionId,
                    activityTitle: selectedCompetition?.name || null, studentId, source: 'auto', place: w?.place || null,
                    participationDescription: w?.participationDescription || null, amount: v.amount || null,
                    proposedBy: user?.username || 'admin',
                });
            }
            if (manualStudent) {
                await db.proposeStudentRecognition({
                    kind: RECOGNITION_KIND.INCENTIVE, activityType: competitionId ? 'competition' : null,
                    activityId: competitionId || null, activityTitle: selectedCompetition?.name || null,
                    studentId: manualStudent.id, source: 'manual', participationDescription: manualDesc || null,
                    amount: manualAmount || null, proposedBy: user?.username || 'admin',
                });
            }
            resetProposeForm(); bump(); setTab('pending');
        } catch (e) { setError(e.message || 'Xatolik yuz berdi'); } finally { setBusy(false); }
    };

    const handleSubmitPrize = async () => {
        setError(''); setBusy(true);
        try {
            if (!prizeStudent || !prizeTitle.trim()) throw new Error("Talaba va mukofot nomini kiriting");
            const activity = prizeActivityId ? myCompetitions.find(c => c.id === prizeActivityId) : null;
            await db.proposeStudentRecognition({
                kind: RECOGNITION_KIND.PRIZE, activityType: activity ? 'competition' : null,
                activityId: activity?.id || null, activityTitle: activity?.name || null,
                studentId: prizeStudent.id, source: 'manual', prizeTitle: prizeTitle.trim(),
                participationDescription: prizeDesc || null, proposedBy: user?.username || 'admin',
            });
            resetProposeForm(); bump(); setTab('pending');
        } catch (e) { setError(e.message || 'Xatolik yuz berdi'); } finally { setBusy(false); }
    };

    // --- Kutilayotgan / tasdiqlash ---
    const pending = useMemo(() => {
        const all = db.getStudentRecognitions({ status: 'pending' });
        if (isAdmin) return all;
        return all.filter(r => r.proposedBy === user?.username);
    }, [isAdmin, user?.username, version]);

    const studentName = (id) => {
        const s = db.getMockStudents().find(x => x.id === id) || db.getSyncedProfiles().find(p => p.id === id);
        return s?.fullName || id;
    };

    const handleReview = async (id, status) => {
        setBusy(true); setError('');
        try {
            const comment = status === 'rejected' ? (window.prompt("Rad etish sababi (ixtiyoriy):") || '') : null;
            await db.reviewStudentRecognition({ id, status, reviewedBy: user?.username || 'admin', comment });
            bump();
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Taklif o'chirilsinmi?")) return;
        setBusy(true); setError('');
        try { await db.deleteStudentRecognitionProposal(id); bump(); }
        catch (e) { setError(e.message); } finally { setBusy(false); }
    };

    return (
        <div className="space-y-6 pb-10">
            <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-3xl p-8 text-white shadow-xl">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                        <Gift className="w-7 h-7" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black">Rag'bat puli va mukofot taklifi</h1>
                        <p className="text-white/70 text-sm mt-1">Musobaqa g'oliblarini rag'batlantirishga taklif qiling - admin tasdiqlagach reestrga tushadi</p>
                    </div>
                </div>
            </div>

            {!backendReady && (
                <Card className="p-6 text-center text-sm text-amber-700 bg-amber-50 border border-amber-200">
                    Jadval topilmadi. Supabase SQL Editor da <code className="font-mono font-bold">supabase/student_recognitions.sql</code> ni ishga tushiring.
                </Card>
            )}

            <div className="flex border-b border-gray-200 gap-6">
                {[['propose', 'Taklif qilish'], ['builder', 'Jadval tuzish'], ['pending', `Kutilayotgan (${pending.length})`]].map(([id, label]) => (
                    <button key={id} onClick={() => setTab(id)}
                        className={`pb-3 font-bold text-sm border-b-2 transition-all ${tab === id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}

            {tab === 'propose' && (
                <div className="space-y-6">
                    <div className="flex bg-gray-100 rounded-2xl p-1 w-fit">
                        {Object.entries(RECOGNITION_KIND_LABELS).map(([k, l]) => (
                            <button key={k} type="button" onClick={() => setKind(k)}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${kind === k ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>
                                {l}
                            </button>
                        ))}
                    </div>

                    {kind === RECOGNITION_KIND.INCENTIVE && (
                        <Card className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Musobaqa</label>
                                <select value={competitionId} onChange={e => { setCompetitionId(e.target.value); setSelectedAmounts({}); }}
                                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
                                    <option value="">Tanlang...</option>
                                    {myCompetitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                            {competitionId && (
                                autoWinners.length > 0 ? (
                                    <div className="space-y-2">
                                        <p className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5"><Users size={13} /> Diplom/sertifikat berilgan g'oliblar</p>
                                        {autoWinners.map(w => {
                                            const sel = selectedAmounts[w.studentId] || {};
                                            return (
                                                <div key={w.studentId} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-slate-50">
                                                    <input type="checkbox" checked={!!sel.checked}
                                                        onChange={e => toggleWinner(w.studentId, { checked: e.target.checked })}
                                                        className="w-5 h-5 accent-indigo-600 shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-bold text-sm text-gray-900">{w.fullName}</p>
                                                        <p className="text-xs text-gray-500">{w.participationDescription} {w.faculty ? `— ${w.faculty}` : ''}</p>
                                                    </div>
                                                    <input type="text" placeholder="Miqdor (masalan: 600'000 so'm)" value={sel.amount || ''}
                                                        onChange={e => toggleWinner(w.studentId, { amount: e.target.value })}
                                                        className="w-56 px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                                        Bu musobaqada hali darajali diplom/sertifikat berilmagan - avval bayonnoma va hujjatlar chiqarilishi kerak, yoki pastda qo'lda qo'shing.
                                    </p>
                                )
                            )}

                            <div className="pt-3 border-t border-gray-100 space-y-2">
                                <p className="text-xs font-bold text-gray-500 uppercase">Qo'lda qo'shish (ixtiyoriy)</p>
                                <StudentPicker value={manualStudent} onSelect={setManualStudent} />
                                <input type="text" placeholder="Ishtirok tavsifi (masalan: 1-o'rin -66 kg vaznda)" value={manualDesc}
                                    onChange={e => setManualDesc(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                                <input type="text" placeholder="Miqdor" value={manualAmount} onChange={e => setManualAmount(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                            </div>

                            <Button variant="primary" disabled={busy} onClick={handleSubmitIncentives}>
                                {busy ? 'Yuborilmoqda...' : 'Tasdiqqa yuborish'}
                            </Button>
                        </Card>
                    )}

                    {kind === RECOGNITION_KIND.PRIZE && (
                        <Card className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Talaba</label>
                                <StudentPicker value={prizeStudent} onSelect={setPrizeStudent} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Mukofot nomi</label>
                                <input type="text" list="prize-suggestions" value={prizeTitle} onChange={e => setPrizeTitle(e.target.value)}
                                    placeholder="Masalan: Faxriy yorliq" className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                                <datalist id="prize-suggestions">
                                    {PRIZE_TITLE_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                                </datalist>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Tegishli musobaqa (ixtiyoriy)</label>
                                <select value={prizeActivityId} onChange={e => setPrizeActivityId(e.target.value)}
                                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
                                    <option value="">Bog'lanmagan</option>
                                    {myCompetitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Izoh (ixtiyoriy)</label>
                                <input type="text" value={prizeDesc} onChange={e => setPrizeDesc(e.target.value)}
                                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                            </div>
                            <Button variant="primary" disabled={busy} onClick={handleSubmitPrize}>
                                {busy ? 'Yuborilmoqda...' : 'Tasdiqqa yuborish'}
                            </Button>
                        </Card>
                    )}
                </div>
            )}

            {tab === 'builder' && (
                <div className="space-y-4">
                    <Card className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Tanlov / musobaqa nomi</label>
                            <div className="flex bg-gray-100 rounded-xl p-1 w-fit mt-1 mb-2">
                                {[['select', 'Ro\'yxatdan tanlash'], ['manual', "Qo'lda yozish"]].map(([m, l]) => (
                                    <button key={m} type="button" onClick={() => setBuilderTitleMode(m)}
                                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${builderTitleMode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>
                                        {l}
                                    </button>
                                ))}
                            </div>
                            {builderTitleMode === 'select' ? (
                                <select value={builderCompetitionId} onChange={e => setBuilderCompetitionId(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
                                    <option value="">Tanlang...</option>
                                    {myCompetitions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            ) : (
                                <input type="text" value={builderManualTitle} onChange={e => setBuilderManualTitle(e.target.value)}
                                    placeholder="Masalan: Talabalar festivali doirasida ... tanlov g'oliblari"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                            )}
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Talaba qo'shish</label>
                            <div className="mt-1">
                                <StudentPicker
                                    value={null} onSelect={addBuilderStudent}
                                    excludeIds={builderRows.filter(r => r.activityTitle === currentBuilderTitle).map(r => r.student.id)}
                                    placeholder={currentBuilderTitle ? "Ism, ID yoki guruh bo'yicha qidiring..." : "Avval yuqorida tanlov nomini belgilang"}
                                />
                            </div>
                            {!currentBuilderTitle && <p className="text-[11px] text-amber-600 mt-1">Talaba qo'shish uchun avval tanlov nomini belgilang.</p>}
                            {currentBuilderTitle && builderGroups.some(([t]) => t === currentBuilderTitle) && (
                                <p className="text-[11px] text-gray-400 mt-1">
                                    "{currentBuilderTitle}" bo'limiga qo'shilmoqda - boshqa tanlovni tanlab, yangi bo'lim boshlashingiz mumkin.
                                </p>
                            )}
                        </div>
                    </Card>

                    {builderGroups.length > 0 ? (
                        <>
                            <Card padding={false}>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-50 text-gray-400 uppercase">
                                            <tr>
                                                <th className="p-3 w-10">T/r</th><th className="p-3">F.I.Sh.</th><th className="p-3">Fakulteti</th>
                                                <th className="p-3 w-56">Ishtiroki</th><th className="p-3 w-56">Rag'batlantirish miqdori</th>
                                                <th className="p-3">To'lov shakli</th><th className="p-3">Passport</th><th className="p-3">JSHIR</th>
                                                <th className="p-3 w-10" />
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {(() => {
                                                let counter = 0;
                                                return builderGroups.map(([title, groupRows]) => (
                                                    <React.Fragment key={title}>
                                                        <tr>
                                                            <td colSpan={9} className="p-2.5 bg-indigo-50 text-center font-bold text-indigo-800">
                                                                {title}
                                                            </td>
                                                        </tr>
                                                        {groupRows.map(r => {
                                                            counter += 1;
                                                            return (
                                                                <tr key={r.tempId}>
                                                                    <td className="p-3 text-gray-400 font-bold">{counter}</td>
                                                                    <td className="p-3 font-semibold text-gray-800">{r.student.fullName}</td>
                                                                    <td className="p-3 text-gray-600">{r.student.faculty || '—'}</td>
                                                                    <td className="p-2">
                                                                        <input type="text" value={r.participationDescription}
                                                                            onChange={e => updateBuilderRow(r.tempId, { participationDescription: e.target.value })}
                                                                            placeholder="1-o'rin -66 kg vaznda" className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
                                                                    </td>
                                                                    <td className="p-2">
                                                                        <input type="text" value={r.amount}
                                                                            onChange={e => updateBuilderRow(r.tempId, { amount: e.target.value })}
                                                                            placeholder="600'000 (olti yuz ming) so'm" className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs" />
                                                                    </td>
                                                                    <td className="p-3 text-gray-500">{r.paymentForm || '—'}</td>
                                                                    <td className="p-3 text-gray-500">{r.passportNumber || '—'}</td>
                                                                    <td className="p-3 text-gray-500">{r.jshshir || '—'}</td>
                                                                    <td className="p-3">
                                                                        <button onClick={() => removeBuilderRow(r.tempId)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg"><Trash2 size={14} /></button>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </React.Fragment>
                                                ));
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                            <div className="flex justify-end">
                                <Button variant="primary" disabled={busy} onClick={handleSubmitBuilder}>
                                    {busy ? 'Yuborilmoqda...' : `Tasdiqqa yuborish (${builderRows.length})`}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <Card className="p-10 text-center text-sm text-gray-400">
                            Yuqorida sarlavhani belgilang va talaba qidirib qo'shing - jadval shu yerda shakllanadi.
                        </Card>
                    )}
                </div>
            )}

            {tab === 'pending' && (
                <Card padding={false}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-gray-400 uppercase">
                                <tr>
                                    <th className="p-3">Talaba</th>
                                    <th className="p-3">Turi</th>
                                    <th className="p-3">Tavsif</th>
                                    <th className="p-3">Miqdor / Mukofot</th>
                                    <th className="p-3">Taklif qildi</th>
                                    <th className="p-3 text-center">Amal</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {pending.length === 0 ? (
                                    <tr><td colSpan={6} className="p-10 text-center text-gray-400">Kutilayotgan taklif yo'q.</td></tr>
                                ) : pending.map(r => (
                                    <tr key={r.id} className="hover:bg-slate-50/70">
                                        <td className="p-3 font-semibold text-gray-800">{studentName(r.studentId)}</td>
                                        <td className="p-3"><Badge variant={r.kind === 'incentive' ? 'success' : 'primary'} size="sm">{RECOGNITION_KIND_LABELS[r.kind]}</Badge></td>
                                        <td className="p-3 text-gray-600">{r.activityTitle || ''}{r.participationDescription ? ` — ${r.participationDescription}` : ''}</td>
                                        <td className="p-3 text-gray-600 font-semibold">{r.kind === 'incentive' ? (r.amount || '—') : (r.prizeTitle || '—')}</td>
                                        <td className="p-3 text-gray-500">{r.proposedBy}</td>
                                        <td className="p-3">
                                            <div className="flex items-center justify-center gap-1.5">
                                                {isAdmin ? (
                                                    <>
                                                        <button title="Tasdiqlash" disabled={busy} onClick={() => handleReview(r.id, 'approved')}
                                                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"><CheckCircle2 size={16} /></button>
                                                        <button title="Rad etish" disabled={busy} onClick={() => handleReview(r.id, 'rejected')}
                                                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"><XCircle size={16} /></button>
                                                    </>
                                                ) : (
                                                    <button title="O'chirish" disabled={busy} onClick={() => handleDelete(r.id)}
                                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default IncentiveAwardsPage;
