import React, { useMemo, useState } from 'react';
import { Plus, AlertTriangle, Check, X, Clock } from 'lucide-react';
import Button from './Button';
import Badge from './Badge';
import { db } from '../../services/db';

const STATUS_LABELS = { pending: 'Kutilmoqda', in_review: "Ko'rib chiqilmoqda", accepted: 'Qabul qilindi', rejected: 'Rad etildi' };
const STATUS_VARIANTS = { pending: 'warning', in_review: 'info', accepted: 'success', rejected: 'danger' };

// Methods where the proposed correction can be safely auto-replayed through db.saveRoundScores in the
// exact value shape it expects (boolean for correct_answer, plain number for single_score). Other
// scoring methods (criteria_based/debate need a criteriaScores object, winner_selection/quiz_mixed need
// their own specific shapes) are left status-only here rather than guessing a wrong-shaped correction —
// same "don't fabricate/guess data" principle used throughout this session.
const AUTO_CORRECTABLE_METHODS = ['correct_answer', 'single_score'];

const CompetitionAppealsTab = ({ competition, hasFullAdminAccess, actingUsername, onScoreCorrected }) => {
    const [version, setVersion] = useState(0);
    const [statusFilter, setStatusFilter] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [formRound, setFormRound] = useState(1);
    const [formParticipantId, setFormParticipantId] = useState(competition.participants[0]?.id || '');
    const [formReason, setFormReason] = useState('');
    const [formProposed, setFormProposed] = useState('true');

    const isAutoCorrectable = AUTO_CORRECTABLE_METHODS.includes(competition.scoringMethod);

    const appeals = useMemo(() => {
        const all = db.getCompetitionAppeals(competition.id);
        return statusFilter ? all.filter(a => a.status === statusFilter) : all;
    }, [competition.id, version, statusFilter]);

    const participantName = (pId) => {
        const p = competition.participants.find(x => x.id === pId);
        return p ? (p.name || p.fullName) : pId;
    };

    const refresh = () => {
        setVersion(v => v + 1);
        onScoreCorrected?.();
    };

    const handleSubmit = () => {
        if (!formReason.trim()) return;
        let proposedValue = null;
        if (isAutoCorrectable) {
            proposedValue = competition.scoringMethod === 'correct_answer'
                ? (formProposed === 'true' ? true : formProposed === 'false' ? false : null)
                : Number(formProposed) || 0;
        }
        db.createAppeal({
            competitionId: competition.id,
            round: Number(formRound),
            participantId: formParticipantId,
            submittedBy: actingUsername,
            reason: formReason.trim(),
            proposedValue
        });
        setFormReason('');
        setShowForm(false);
        refresh();
    };

    const handleDecide = (appeal, status) => {
        const comment = status === 'rejected' ? (window.prompt("Rad etish sababi (ixtiyoriy):") || '') : null;
        db.decideAppeal(appeal.id, status, actingUsername, comment, actingUsername);
        refresh();
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-3">
                <div>
                    <h3 className="font-bold text-lg text-gray-900">Apellyatsiya</h3>
                    <p className="text-xs text-gray-400">Savol kesimida e'tirozlar va ularning ko'rib chiqilishi</p>
                </div>
                <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowForm(v => !v)}>
                    {showForm ? 'Bekor qilish' : 'Yangi apellyatsiya'}
                </Button>
            </div>

            {showForm && (
                <div className="p-4 bg-slate-50 rounded-2xl space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Raund/Savol</label>
                            <input type="number" min="1" value={formRound} onChange={e => setFormRound(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Ishtirokchi</label>
                            <select value={formParticipantId} onChange={e => setFormParticipantId(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm">
                                {competition.participants.map(p => (
                                    <option key={p.id} value={p.id}>{p.name || p.fullName}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Sabab</label>
                        <textarea value={formReason} onChange={e => setFormReason(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-xl text-sm" placeholder="Nima uchun e'tiroz bildirilmoqda..." />
                    </div>
                    {isAutoCorrectable ? (
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Taklif qilingan tuzatish</label>
                            {competition.scoringMethod === 'correct_answer' ? (
                                <select value={formProposed} onChange={e => setFormProposed(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm">
                                    <option value="true">To'g'ri</option>
                                    <option value="false">Noto'g'ri</option>
                                    <option value="">Bekor</option>
                                </select>
                            ) : (
                                <input type="number" value={formProposed} onChange={e => setFormProposed(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm" />
                            )}
                        </div>
                    ) : (
                        <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                            Bu baholash usuli ("{competition.scoringMethod}") uchun avtomatik ball tuzatish qo'llab-quvvatlanmaydi — apellyatsiya faqat holat sifatida qayd etiladi, ballni hakam qo'lda tuzatadi.
                        </p>
                    )}
                    <Button variant="primary" size="sm" onClick={handleSubmit} disabled={!formReason.trim()}>Yuborish</Button>
                </div>
            )}

            <div className="flex gap-2 flex-wrap">
                {['', 'pending', 'in_review', 'accepted', 'rejected'].map(s => (
                    <button
                        key={s || 'all'}
                        type="button"
                        onClick={() => setStatusFilter(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            statusFilter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                        {s ? STATUS_LABELS[s] : 'Barchasi'}
                    </button>
                ))}
            </div>

            {appeals.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">Apellyatsiyalar yo'q.</p>
            ) : (
                <div className="space-y-3">
                    {appeals.map(a => (
                        <div key={a.id} className="p-4 bg-white border border-gray-100 rounded-2xl space-y-2">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                                    <span className="font-bold text-sm text-gray-800">
                                        Raund {a.round} • {participantName(a.participantId)}
                                    </span>
                                </div>
                                <Badge variant={STATUS_VARIANTS[a.status]} size="sm">{STATUS_LABELS[a.status]}</Badge>
                            </div>
                            <p className="text-xs text-gray-500">{a.reason}</p>
                            <p className="text-[10px] text-gray-400">
                                {a.submittedBy} tomonidan • {new Date(a.createdAt).toLocaleString('uz-UZ')}
                                {a.decidedBy && ` · Qaror: ${a.decidedBy}, ${new Date(a.decidedAt).toLocaleString('uz-UZ')}`}
                            </p>
                            {a.decisionComment && <p className="text-[11px] text-gray-500 italic">"{a.decisionComment}"</p>}
                            {hasFullAdminAccess() && (a.status === 'pending' || a.status === 'in_review') && (
                                <div className="flex gap-1.5 pt-1">
                                    {a.status === 'pending' && (
                                        <button type="button" onClick={() => handleDecide(a, 'in_review')} className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 rounded-lg">
                                            <Clock size={11} /> Ko'rib chiqishga olish
                                        </button>
                                    )}
                                    <button type="button" onClick={() => handleDecide(a, 'accepted')} className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 rounded-lg">
                                        <Check size={11} /> Qabul qilish
                                    </button>
                                    <button type="button" onClick={() => handleDecide(a, 'rejected')} className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 rounded-lg">
                                        <X size={11} /> Rad etish
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CompetitionAppealsTab;
