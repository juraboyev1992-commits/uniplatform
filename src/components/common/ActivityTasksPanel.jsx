import React, { useMemo, useState } from 'react';
import { ListChecks, Plus, Trash2, Sparkles, AlertTriangle } from 'lucide-react';
import Button from './Button';
import StudentPicker from './StudentPicker';
import { db } from '../../services/db';
import { TASK_STATUS, TASK_STATUS_ORDER, TASK_TEMPLATES, PARTICIPATION_ROLES, PARTICIPATION_ROLE_ORDER } from '../../config/activityLifecycle';

// Vazifalar taqsimoti - kim nima qilishi.
//
// Tadbirni bir kishi tashkil qilmaydi, lekin bugungacha tizimda "kim nima qiladi"
// degan savolga javob yo'q edi: hamma narsa yaratuvchining boshida qolardi.
//
// Andoza tugmasi ataylab bor: to'qqizta vazifa deyarli har tadbirda takrorlanadi,
// ularni har safar qaytadan yozish - bekorga qilingan ish.
const ActivityTasksPanel = ({ activityId, activityType, canManage, actingUsername, onChanged }) => {
    const [version, setVersion] = useState(0);
    const [title, setTitle] = useState('');
    // Tanlangan odamning O'ZI saqlanadi, faqat identifikatori emas: forma
    // ochiq turganda uning ismi ko'rinib turishi kerak.
    const [assignee, setAssignee] = useState(null);
    const [role, setRole] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const tasks = useMemo(
        () => db.getActivityTasks(activityId, activityType),
        [activityId, activityType, version]
    );

    const refresh = () => { setVersion(v => v + 1); onChanged?.(); };

    const run = async (fn) => {
        setBusy(true); setError('');
        try { await fn(); refresh(); }
        catch (e) { setError(e?.message || 'Xatolik yuz berdi.'); }
        finally { setBusy(false); }
    };

    const handleAdd = () => run(async () => {
        await db.createActivityTask({
            activityId, activityType, title,
            // USERNAME saqlanadi, uuid emas. Tanlovda ikki xil hovuz
            // qo'shiladi (sintetik talabalar va haqiqiy akkauntlar) va
            // ikkinchisida `id` - uuid. Uni yozib qo'ysak, ro'yxatda odam
            // ismi o'rniga uuid ko'rinardi.
            assigneeId: assignee ? (assignee.username || assignee.id) : null,
            role: role || null,
            dueDate: dueDate || null,
            by: actingUsername,
        });
        setTitle(''); setAssignee(null); setRole(''); setDueDate('');
    });

    // Yozuvda login turadi, ekranda esa F.I.Sh. kerak. Ikkala hovuzdan ham
    // qidiriladi: haqiqiy akkauntlar sintetik talabalardan alohida
    // ro'yxatda (db.getSyncedProfiles izohiga qarang).
    const nameOf = useMemo(() => {
        const byKey = new Map();
        db.getMockStudents().forEach(st => byKey.set(st.id, st.fullName));
        (db.getSyncedProfiles() || []).forEach(pr => {
            if (pr.username && pr.fullName) byKey.set(pr.username, pr.fullName);
            if (pr.id && pr.fullName) byKey.set(pr.id, pr.fullName);
        });
        // Topilmasa loginning o'zi qaytadi - bo'sh qoldirish "mas'ul yo'q"
        // degan noto'g'ri taassurot berardi.
        return (key) => byKey.get(key) || key;
    }, [version]);

    const done = tasks.filter(t => t.status === 'done').length;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-bold text-sm text-gray-700 flex items-center gap-1.5">
                    <ListChecks size={15} className="text-indigo-500" /> Vazifalar taqsimoti
                </h3>
                {tasks.length > 0 && (
                    <span className="text-[11px] font-bold text-gray-400">
                        {done} / {tasks.length} bajarildi
                    </span>
                )}
            </div>

            {tasks.length > 0 && (
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${Math.round((done / tasks.length) * 100)}%` }}
                    />
                </div>
            )}

            {error && (
                <p className="flex items-start gap-1.5 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    <AlertTriangle size={12} className="shrink-0 mt-px" /> {error}
                </p>
            )}

            {tasks.length === 0 ? (
                <p className="text-xs text-gray-400">Hali vazifa qo'shilmagan.</p>
            ) : (
                <div className="space-y-1.5">
                    {tasks.map(t => (
                        <div key={t.id} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-100 rounded-xl">
                            <div className="flex-1 min-w-0">
                                <p className={`text-xs font-semibold truncate ${t.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                    {t.title}
                                </p>
                                <p className="text-[10px] text-gray-400 truncate">
                                    {t.assigneeId ? nameOf(t.assigneeId) : 'mas\'ul belgilanmagan'}
                                    {t.role && ` · ${PARTICIPATION_ROLES[t.role]?.short || t.role}`}
                                    {t.dueDate && ` · ${t.dueDate}`}
                                </p>
                            </div>
                            {canManage ? (
                                <>
                                    <select
                                        value={t.status}
                                        disabled={busy}
                                        onChange={e => run(() => db.updateActivityTask(t.id, { status: e.target.value }))}
                                        className={`shrink-0 border-0 rounded-lg px-2 py-1 text-[11px] font-bold ${TASK_STATUS[t.status]?.tone || 'bg-gray-100 text-gray-600'}`}
                                    >
                                        {TASK_STATUS_ORDER.map(id => (
                                            <option key={id} value={id}>{TASK_STATUS[id].label}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button" disabled={busy}
                                        onClick={() => run(() => db.deleteActivityTask(t.id))}
                                        className="shrink-0 text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </>
                            ) : (
                                <span className={`shrink-0 px-2 py-1 rounded-lg text-[11px] font-bold ${TASK_STATUS[t.status]?.tone || 'bg-gray-100 text-gray-600'}`}>
                                    {TASK_STATUS[t.status]?.label || t.status}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {canManage && (
                <div className="space-y-2 pt-1">
                    <div className="flex gap-2 flex-wrap">
                        <input
                            type="text" value={title} onChange={e => setTitle(e.target.value)}
                            placeholder="Vazifa nomi"
                            className="flex-1 min-w-[140px] px-3 py-2 border border-gray-200 rounded-xl text-xs"
                        />
                        {/* Ilgari bu yerda oddiy matn maydoni turardi va LOGINNI
                            QO'LDA yozish kerak edi. Loginni esa hech kim yoddan
                            bilmaydi: mas'ul boshqa oynadan izlab topib, nusxalab
                            kelishi kerak edi. Endi ism, talaba ID, guruh yoki
                            login bo'yicha qidiriladi. */}
                        <div className="w-full sm:w-64">
                            <StudentPicker
                                value={assignee}
                                onSelect={setAssignee}
                                placeholder="Mas'ulni qidiring..."
                            />
                        </div>
                        <select
                            value={role} onChange={e => setRole(e.target.value)}
                            className="px-2 py-2 border border-gray-200 rounded-xl text-xs bg-white"
                        >
                            <option value="">Rol —</option>
                            {PARTICIPATION_ROLE_ORDER.map(id => (
                                <option key={id} value={id}>{PARTICIPATION_ROLES[id].short}</option>
                            ))}
                        </select>
                        <input
                            type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                            className="px-2 py-2 border border-gray-200 rounded-xl text-xs"
                        />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <Button variant="primary" size="sm" icon={Plus} disabled={!title.trim() || busy} onClick={handleAdd}>
                            Qo'shish
                        </Button>
                        {tasks.length === 0 && (
                            <Button
                                variant="outline" size="sm" icon={Sparkles} disabled={busy}
                                onClick={() => run(() => db.addTasksFromTemplate(activityId, activityType, TASK_TEMPLATES, actingUsername))}
                            >
                                Andozadan {TASK_TEMPLATES.length} ta vazifa
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ActivityTasksPanel;
