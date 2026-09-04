import React, { useState, useMemo } from 'react';
import {
    Target, Plus, Trash2, CalendarClock, AlertTriangle, CheckCircle, Clock,
    Paperclip, Loader2, ChevronRight, FileText, Link2, StickyNote, X, Info
} from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import { db } from '../../services/db';
import {
    GOAL_CATEGORIES, GOAL_STATUS, IDP_STATUS, EVIDENCE_TYPES, goalTiming,
    ASSIGNMENT_ROLES,
} from '../../config/talent';
import { computeIdpProgress } from '../../utils/talentScoring';
import { getDocumentTypeLabel } from '../../config/documents';

// Individual rivojlanish rejasi (IDP).
//
// Har bir maqsad SMART: nom, kategoriya, muddat, mas'ul, progress va DALIL.
// Dalil sifatida platformadagi mavjud hujjat biriktiriladi - talaba diplomini
// qayta yuklab o'tirmaydi (spetsifikatsiya §29, §65).

const TIMING_TONE = {
    overdue: 'bg-red-50 text-red-700 border-red-200',
    due_soon: 'bg-amber-50 text-amber-700 border-amber-200',
    open: 'bg-gray-50 text-gray-500 border-gray-200',
    closed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const timingLabel = (t) => {
    if (t.state === 'overdue') return `${Math.abs(t.days)} kun kechikdi`;
    if (t.state === 'due_soon') return `${t.days} kun qoldi`;
    if (t.state === 'closed') return 'Yakunlangan';
    return t.days === null ? 'Muddatsiz' : `${t.days} kun`;
};

const TalentIdpTab = ({ rows, assignableUsers, busy, version, user, run }) => {
    const [selected, setSelected] = useState(null);
    const [q, setQ] = useState('');

    const items = useMemo(() => rows.map(r => {
        const idp = db.getTalentIdp(r.profile.studentId);
        const goals = idp ? db.getTalentGoals(idp.id) : [];
        return { ...r, idp, goals, progress: computeIdpProgress(goals) };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [rows, version]);

    // `selected` faqat QAYSI talaba tanlanganini bildiradi (statik surat
    // emas) - haqiqiy ma'lumot har doim `items`ning O'ZIDAN, joriy holatda
    // olinadi. Ilgari `selected` ro'yxatdan olingan qatorning O'ZINI
    // saqlardi - "IDP yaratish" bosilgach IDP haqiqatan yaratilardi
    // (bazaga yozilardi), lekin oyna eski nusxani ko'rsatishda davom
    // etardi, chunki `selected` `version` o'zgarganda qayta hisoblanmasdi.
    // Natijada tugma "ishlamayotgandek" ko'rinardi.
    const liveSelected = useMemo(
        () => (selected ? items.find(i => i.profile.id === selected.profile.id) || null : null),
        [selected, items]
    );

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return items;
        return items.filter(i => (i.student?.fullName || '').toLowerCase().includes(needle));
    }, [items, q]);

    // Butun dastur bo'yicha muddat holati - kim kechikayotganini bir qarashda ko'rish.
    const deadlineSummary = useMemo(() => {
        const overdue = [];
        const dueSoon = [];
        items.forEach(i => {
            (i.progress.timings || []).forEach(t => {
                if (t.timing.state === 'overdue') overdue.push({ student: i.student, goal: t.goal, timing: t.timing });
                if (t.timing.state === 'due_soon') dueSoon.push({ student: i.student, goal: t.goal, timing: t.timing });
            });
        });
        return {
            overdue: overdue.sort((a, b) => a.timing.days - b.timing.days),
            dueSoon: dueSoon.sort((a, b) => a.timing.days - b.timing.days),
        };
    }, [items]);

    const withIdp = items.filter(i => i.idp).length;

    return (
        <div className="space-y-5">
            {/* Muddatlar xulosasi */}
            {(deadlineSummary.overdue.length > 0 || deadlineSummary.dueSoon.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {deadlineSummary.overdue.length > 0 && (
                        <Card className="border-l-4 border-l-red-500">
                            <p className="font-black text-gray-900 text-sm mb-2 flex items-center gap-2">
                                <AlertTriangle size={16} className="text-red-500" />
                                Muddati o'tgan ({deadlineSummary.overdue.length})
                            </p>
                            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                                {deadlineSummary.overdue.slice(0, 12).map((d, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs px-2.5 py-1.5 bg-red-50 rounded-lg">
                                        <span className="font-bold text-gray-800 truncate flex-1">{d.student?.fullName}</span>
                                        <span className="text-gray-600 truncate flex-1">{d.goal.title}</span>
                                        <span className="text-red-600 font-bold whitespace-nowrap">
                                            {Math.abs(d.timing.days)} kun
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                    {deadlineSummary.dueSoon.length > 0 && (
                        <Card className="border-l-4 border-l-amber-400">
                            <p className="font-black text-gray-900 text-sm mb-2 flex items-center gap-2">
                                <CalendarClock size={16} className="text-amber-500" />
                                Yaqinlashmoqda ({deadlineSummary.dueSoon.length})
                            </p>
                            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                                {deadlineSummary.dueSoon.slice(0, 12).map((d, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs px-2.5 py-1.5 bg-amber-50 rounded-lg">
                                        <span className="font-bold text-gray-800 truncate flex-1">{d.student?.fullName}</span>
                                        <span className="text-gray-600 truncate flex-1">{d.goal.title}</span>
                                        <span className="text-amber-700 font-bold whitespace-nowrap">
                                            {d.timing.days} kun
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>
            )}

            <div className="flex flex-wrap gap-3 items-center">
                <span className="text-sm font-semibold text-gray-600">
                    {withIdp} / {items.length} talabada IDP mavjud
                </span>
                <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Talaba qidirish..."
                    className="ml-auto px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium w-56" />
            </div>

            <div className="space-y-2">
                {filtered.length === 0 && (
                    <Card className="text-center py-16 text-gray-400 font-medium">
                        Dasturda talaba yo'q
                    </Card>
                )}
                {filtered.map(item => {
                    const st = item.idp ? IDP_STATUS[item.idp.status] : null;
                    return (
                        <Card key={item.profile.id} hover
                            className={`cursor-pointer border-l-4 ${item.idp ? 'border-l-violet-500' : 'border-l-gray-200'}`}>
                            <div onClick={() => setSelected(item)} className="flex flex-col md:flex-row justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-black text-gray-900">{item.student?.fullName}</p>
                                        {st && <Badge variant={st.variant} size="sm">{st.label}</Badge>}
                                        {!item.idp && (
                                            <span className="text-[11px] text-amber-600 font-bold">IDP yaratilmagan</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        {item.profile.faculty} · {item.student?.course}-kurs
                                    </p>
                                    {item.idp && (
                                        <div className="flex flex-wrap gap-3 mt-2 text-[11px] font-semibold text-gray-500">
                                            <span>{item.progress.total} ta maqsad</span>
                                            <span className="text-emerald-600">{item.progress.done} bajarilgan</span>
                                            {item.progress.overdue > 0 && (
                                                <span className="text-red-600">{item.progress.overdue} kechikkan</span>
                                            )}
                                            {item.progress.dueSoon > 0 && (
                                                <span className="text-amber-600">{item.progress.dueSoon} yaqinlashmoqda</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-4 flex-shrink-0">
                                    {item.idp && (
                                        <div className="text-center min-w-[64px]">
                                            <p className="text-2xl font-black text-violet-700">{item.progress.progress}%</p>
                                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                                                <div className="h-full bg-violet-500" style={{ width: `${item.progress.progress}%` }} />
                                            </div>
                                        </div>
                                    )}
                                    <ChevronRight size={18} className="text-gray-300" />
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </div>

            <Modal isOpen={!!selected} onClose={() => setSelected(null)}
                title={liveSelected ? `${liveSelected.student?.fullName} — IDP` : ''} size="lg">
                {liveSelected && (
                    <IdpEditor
                        item={liveSelected}
                        assignableUsers={assignableUsers}
                        busy={busy}
                        user={user}
                        run={run}
                        onClose={() => setSelected(null)}
                    />
                )}
            </Modal>
        </div>
    );
};

// ---------------------------------------------------------------------------
// IDP muharriri
// ---------------------------------------------------------------------------
const IdpEditor = ({ item, assignableUsers, busy, user, run }) => {
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState({
        category: 'research', title: '', deadline: '', responsibleId: '', description: '',
    });
    const [evidenceFor, setEvidenceFor] = useState(null);

    const idp = item.idp;
    const goals = item.goals;
    const progress = item.progress;

    const nameOf = useMemo(() => {
        const map = new Map(assignableUsers.map(u => [u.username, u.fullName]));
        return (username) => map.get(username) || username;
    }, [assignableUsers]);

    const createIdp = () => run(async () => {
        await db.createTalentIdp({
            studentId: item.profile.studentId,
            periodFrom: new Date().toISOString().slice(0, 10),
            by: user?.username,
        });
    }, 'IDP yaratildi');

    const activateIdp = () => run(() => db.updateTalentIdp(idp.id, { status: 'active' }, user?.username), 'IDP faollashtirildi');

    const addGoal = () => {
        if (!form.title.trim()) return;
        run(async () => {
            await db.createTalentGoal({
                idpId: idp.id, studentId: item.profile.studentId,
                category: form.category, title: form.title, deadline: form.deadline || null,
                responsibleId: form.responsibleId || null, description: form.description,
                by: user?.username,
            });
            setForm({ category: 'research', title: '', deadline: '', responsibleId: '', description: '' });
            setAdding(false);
        }, "Maqsad qo'shildi");
    };

    const patchGoal = (goalId, patch) => run(() => db.updateTalentGoal(goalId, patch, user?.username));
    const removeGoal = (goalId) => {
        if (!window.confirm("Maqsad o'chirilsinmi?")) return;
        run(() => db.deleteTalentGoal(goalId, user?.username), "Maqsad o'chirildi");
    };

    if (!idp) {
        return (
            <div className="text-center py-12 space-y-4">
                <Target className="w-14 h-14 mx-auto text-gray-200" />
                <div>
                    <p className="font-bold text-gray-600">IDP hali yaratilmagan</p>
                    <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
                        Individual rivojlanish rejasi 2-kursdan bitiruvgacha davom etadi va
                        talabaning aniq stipendiyaga tayyorgarligini boshqaradi.
                    </p>
                </div>
                <Button variant="primary" icon={busy ? Loader2 : Plus} disabled={busy} onClick={createIdp}>
                    IDP yaratish
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Xulosa */}
            <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-2xl">
                <div>
                    <div className="flex items-center gap-2">
                        <Badge variant={IDP_STATUS[idp.status]?.variant} size="sm">
                            {IDP_STATUS[idp.status]?.label}
                        </Badge>
                        {idp.status === 'draft' && (
                            <button onClick={activateIdp} disabled={busy}
                                className="text-[11px] font-bold text-violet-600 hover:text-violet-800">
                                Faollashtirish →
                            </button>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                        {progress.done} / {progress.total} maqsad bajarilgan
                        {progress.overdue > 0 && (
                            <span className="text-red-600 font-bold"> · {progress.overdue} kechikkan</span>
                        )}
                    </p>
                </div>
                <div className="text-center flex-shrink-0">
                    <p className="text-3xl font-black text-violet-700">{progress.progress}%</p>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400">progress</p>
                </div>
            </div>

            {/* Maqsadlar */}
            <div className="space-y-2">
                {goals.length === 0 && (
                    <p className="text-sm text-gray-400 italic text-center py-8">
                        Hali maqsad qo'shilmagan
                    </p>
                )}
                {goals.map(goal => {
                    const cat = GOAL_CATEGORIES[goal.category] || { label: goal.category };
                    const timing = goalTiming(goal);
                    const evidence = goal.evidence || [];
                    return (
                        <div key={goal.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                            <div className="p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <span className="text-[10px] px-2 py-0.5 bg-gray-100 rounded-md font-bold text-gray-600">
                                                {cat.label}
                                            </span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${TIMING_TONE[timing.state]}`}>
                                                {goal.deadline || 'muddatsiz'} · {timingLabel(timing)}
                                            </span>
                                            {goal.responsibleId && (
                                                <span className="text-[10px] text-gray-400">
                                                    Mas'ul: {nameOf(goal.responsibleId)}
                                                </span>
                                            )}
                                        </div>
                                        <p className="font-bold text-gray-900 text-sm">{goal.title}</p>
                                        {goal.description && (
                                            <p className="text-[11px] text-gray-500 mt-0.5">{goal.description}</p>
                                        )}
                                    </div>
                                    <button onClick={() => removeGoal(goal.id)} disabled={busy}
                                        className="text-gray-300 hover:text-red-600 flex-shrink-0">
                                        <Trash2 size={15} />
                                    </button>
                                </div>

                                {/* Status + progress */}
                                <div className="flex items-center gap-3 mt-3">
                                    <select value={goal.status} onChange={e => patchGoal(goal.id, { status: e.target.value })}
                                        disabled={busy}
                                        className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold">
                                        {Object.entries(GOAL_STATUS).map(([k, v]) => (
                                            <option key={k} value={k}>{v.label}</option>
                                        ))}
                                    </select>
                                    <div className="flex-1 flex items-center gap-2">
                                        <input type="range" min="0" max="100" step="5" value={goal.progress}
                                            onChange={e => patchGoal(goal.id, { progress: Number(e.target.value) })}
                                            disabled={busy || goal.status === 'done'}
                                            className="flex-1 accent-violet-600" />
                                        <span className="text-xs font-black text-gray-700 w-10 text-right">
                                            {goal.status === 'done' ? 100 : goal.progress}%
                                        </span>
                                    </div>
                                    <button onClick={() => setEvidenceFor(goal)}
                                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${evidence.length > 0
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300'}`}>
                                        <Paperclip size={12} /> {evidence.length || 'Dalil'}
                                    </button>
                                </div>
                            </div>

                            {evidence.length > 0 && (
                                <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                                    {evidence.map(ev => (
                                        <span key={ev.id} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 bg-emerald-50 border border-emerald-100 rounded-md text-emerald-800 font-semibold">
                                            {ev.type === 'document' ? <FileText size={10} />
                                                : ev.type === 'url' || ev.type === 'doi' ? <Link2 size={10} />
                                                    : <StickyNote size={10} />}
                                            {ev.label}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Maqsad qo'shish */}
            {adding ? (
                <div className="p-4 bg-violet-50 border border-violet-200 rounded-xl space-y-3">
                    <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                        placeholder="Maqsad nomi — masalan: 1 ta ilmiy maqola nashr etish"
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl font-semibold" />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                            className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold">
                            {Object.entries(GOAL_CATEGORIES).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                        <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                            className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold" />
                        <select value={form.responsibleId} onChange={e => setForm(f => ({ ...f, responsibleId: e.target.value }))}
                            className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold">
                            <option value="">Mas'ul tanlanmagan</option>
                            {item.assignments.map(a => (
                                <option key={a.id} value={a.personId}>
                                    {nameOf(a.personId)} ({ASSIGNMENT_ROLES[a.role]?.short})
                                </option>
                            ))}
                            {assignableUsers.map(u => (
                                <option key={u.username} value={u.username}>{u.fullName}</option>
                            ))}
                        </select>
                    </div>

                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Qo'shimcha izoh (ixtiyoriy)"
                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm h-16 resize-none" />

                    <div className="flex gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => setAdding(false)}>Bekor qilish</Button>
                        <Button variant="primary" className="flex-1" disabled={busy || !form.title.trim()}
                            icon={busy ? Loader2 : Plus} onClick={addGoal}>
                            Qo'shish
                        </Button>
                    </div>
                </div>
            ) : (
                <Button variant="outline" icon={Plus} className="w-full" onClick={() => setAdding(true)}>
                    Maqsad qo'shish
                </Button>
            )}

            {/* Dalil modali */}
            <EvidenceModal
                goal={evidenceFor}
                studentId={item.profile.studentId}
                busy={busy}
                user={user}
                run={run}
                onClose={() => setEvidenceFor(null)}
            />
        </div>
    );
};

// ---------------------------------------------------------------------------
// DALIL BIRIKTIRISH
//
// Asosiy imkoniyat: platformadagi MAVJUD hujjatni tanlash. Talaba diplomini
// qayta yuklamaydi va hujjat QR orqali tekshiriladigan bo'lib qoladi.
// ---------------------------------------------------------------------------
const EvidenceModal = ({ goal, studentId, busy, user, run, onClose }) => {
    const [mode, setMode] = useState('document');
    const [urlValue, setUrlValue] = useState('');
    const [noteValue, setNoteValue] = useState('');

    const documents = useMemo(
        () => (db.getStudentDocuments(studentId) || []).filter(d => d.status === 'issued'),
        [studentId]
    );

    if (!goal) return null;

    const attached = new Set((goal.evidence || []).map(e => e.ref));

    const addDocument = (doc) => run(async () => {
        await db.addGoalEvidence(goal.id, {
            type: 'document', ref: doc.id,
            label: `${getDocumentTypeLabel(doc.documentType)} — ${doc.activityName}`,
            by: user?.username,
        });
        onClose();
    }, 'Dalil biriktirildi');

    const addLink = () => {
        if (!urlValue.trim()) return;
        const isDoi = /^10\.\d{4,}/.test(urlValue.trim());
        run(async () => {
            await db.addGoalEvidence(goal.id, {
                type: isDoi ? 'doi' : 'url', ref: urlValue.trim(), label: urlValue.trim(),
                by: user?.username,
            });
            setUrlValue('');
            onClose();
        }, 'Dalil qo\'shildi');
    };

    const addNote = () => {
        if (!noteValue.trim()) return;
        run(async () => {
            await db.addGoalEvidence(goal.id, {
                type: 'note', ref: null, label: noteValue.trim(), by: user?.username,
            });
            setNoteValue('');
            onClose();
        }, 'Izoh qo\'shildi');
    };

    const removeEvidence = (evId) => run(async () => {
        await db.updateTalentGoal(goal.id, {
            evidence: (goal.evidence || []).filter(e => e.id !== evId),
        }, user?.username);
    });

    return (
        <Modal isOpen={!!goal} onClose={onClose} title={`Dalil — ${goal.title}`} size="lg">
            <div className="space-y-4">
                {(goal.evidence || []).length > 0 && (
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                            Biriktirilgan dalillar
                        </p>
                        <div className="space-y-1.5">
                            {goal.evidence.map(ev => (
                                <div key={ev.id} className="flex items-center gap-2 p-2.5 bg-emerald-50/60 border border-emerald-100 rounded-lg">
                                    <span className="text-[10px] px-1.5 py-0.5 bg-white rounded font-bold text-gray-500">
                                        {EVIDENCE_TYPES[ev.type]?.label || ev.type}
                                    </span>
                                    <span className="text-xs font-semibold text-gray-800 flex-1 truncate">{ev.label}</span>
                                    <button onClick={() => removeEvidence(ev.id)} disabled={busy}
                                        className="text-gray-400 hover:text-red-600 flex-shrink-0">
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
                    {[['document', 'Platformadagi hujjat'], ['url', 'Havola / DOI'], ['note', 'Izoh']].map(([id, label]) => (
                        <button key={id} onClick={() => setMode(id)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold ${mode === id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                {mode === 'document' && (
                    <>
                        <div className="flex items-start gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                            <Info size={16} className="text-indigo-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-indigo-800">
                                Talabaning rasmiy hujjatlari — qayta yuklash shart emas. Biriktirilgan
                                hujjat QR orqali tekshirilishi mumkin bo'lib qoladi.
                            </p>
                        </div>
                        {documents.length === 0 ? (
                            <p className="text-sm text-gray-400 italic text-center py-8">
                                Bu talabada hali rasmiy hujjat yo'q
                            </p>
                        ) : (
                            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                                {documents.map(doc => {
                                    const on = attached.has(doc.id);
                                    return (
                                        <button key={doc.id} type="button" disabled={on || busy}
                                            onClick={() => addDocument(doc)}
                                            className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition-all ${on
                                                ? 'bg-gray-50 border-gray-200 opacity-50 cursor-default'
                                                : 'bg-white border-gray-200 hover:border-violet-300'}`}>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-gray-900 truncate">
                                                    {getDocumentTypeLabel(doc.documentType)}
                                                </p>
                                                <p className="text-[11px] text-gray-500 truncate">{doc.activityName}</p>
                                            </div>
                                            <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">
                                                {on ? 'biriktirilgan' : doc.registrationNumber}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}

                {mode === 'url' && (
                    <div className="space-y-2">
                        <input type="text" value={urlValue} onChange={e => setUrlValue(e.target.value)}
                            placeholder="https://... yoki 10.1234/abcd"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium" />
                        <p className="text-[11px] text-gray-400">
                            DOI raqami avtomatik aniqlanadi (10. bilan boshlansa).
                        </p>
                        <Button variant="primary" className="w-full" disabled={busy || !urlValue.trim()} onClick={addLink}>
                            Qo'shish
                        </Button>
                    </div>
                )}

                {mode === 'note' && (
                    <div className="space-y-2">
                        <textarea value={noteValue} onChange={e => setNoteValue(e.target.value)}
                            placeholder="Mas'ul tasdig'i bilan izoh..."
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl h-24 resize-none text-sm" />
                        <Button variant="primary" className="w-full" disabled={busy || !noteValue.trim()} onClick={addNote}>
                            Qo'shish
                        </Button>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default TalentIdpTab;
