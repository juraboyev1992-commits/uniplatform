import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, UserCheck, Calendar, AlertTriangle } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import {
    PARTICIPATION_ROLES, TASK_STATUS, TASK_STATUS_ORDER, ACTIVITY_LEVELS,
} from '../../config/activityLifecycle';

// Talabaning o'z ishtiroki: menga qanday vazifa berilgan va qayerda qatnashib
// qancha ball oldim.
//
// Bularsiz butun tadbir hayot yo'li FAQAT admin uchun ishlayotgan edi: vazifa
// biriktirilardi, lekin biriktirilgan odam ko'rmasdi; ball yozilardi, lekin talaba
// uni faqat o'tkinchi xabarnomada ko'rardi.

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

// Props:
//   showParticipation - "Ishtirokim" kartasi. Bosh sahifada o'chiriladi: u yerda
//     vazifa MUDDATLI ish, ishtirok tarixi esa shoshilinch emas.
//   onlyOpenTasks - bajarilganlarni yashiradi. Bosh sahifa "nima qilishim kerak"
//     degan savolga javob berishi kerak, arxiv emas.
const MyActivityPanel = ({ showParticipation = true, onlyOpenTasks = false, footerLink = null }) => {
    const { user } = useAuth();
    const [version, setVersion] = useState(0);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');

    const allTasks = useMemo(
        () => db.getTasksForAssignee(user?.username),
        [user?.username, version]
    );
    const participation = useMemo(
        () => (showParticipation ? db.getStudentActivityParticipation(user?.username) : []),
        [user?.username, version, showParticipation]
    );

    const openTasks = allTasks.filter(t => t.status !== 'done');
    const tasks = onlyOpenTasks ? openTasks : allTasks;
    const totalPoints = participation.reduce((s, p) => s + (p.points || 0), 0);

    // Talaba o'z vazifasining holatini o'zi o'zgartira oladi - tashkilotchidan
    // so'rab o'tirmasin. Vazifa MATNINI o'zgartira olmaydi, faqat holatini.
    const setStatus = async (taskId, status) => {
        setBusy(taskId); setError('');
        try {
            await db.updateActivityTask(taskId, { status });
            setVersion(v => v + 1);
        } catch (e) {
            setError(e?.message || 'Holatni saqlashda xatolik yuz berdi.');
        } finally {
            setBusy('');
        }
    };

    if (tasks.length === 0 && participation.length === 0) return null;

    return (
        <div className={`grid grid-cols-1 gap-4 ${showParticipation ? 'lg:grid-cols-2' : ''}`}>
            {tasks.length > 0 && (
                <Card>
                    <div className="p-5 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="font-bold text-sm text-gray-800 flex items-center gap-1.5">
                                <ListChecks size={15} className="text-indigo-500" /> Menga berilgan vazifalar
                            </h3>
                            {openTasks.length > 0 && (
                                <Badge variant="warning" size="sm">{openTasks.length} ta ochiq</Badge>
                            )}
                        </div>

                        {error && (
                            <p className="flex items-start gap-1.5 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                                <AlertTriangle size={12} className="shrink-0 mt-px" /> {error}
                            </p>
                        )}

                        <div className="space-y-1.5">
                            {tasks.map(t => (
                                <div key={t.id} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-100 rounded-xl">
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-xs font-semibold truncate ${t.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                            {t.title}
                                        </p>
                                        <p className="text-[10px] text-gray-400 truncate">
                                            {t.activityTitle || 'Tadbir'}
                                            {t.dueDate && ` · ${fmtDate(t.dueDate)}gacha`}
                                        </p>
                                    </div>
                                    <select
                                        value={t.status}
                                        disabled={busy === t.id}
                                        onChange={e => setStatus(t.id, e.target.value)}
                                        className={`shrink-0 border-0 rounded-lg px-2 py-1 text-[11px] font-bold ${TASK_STATUS[t.status]?.tone || 'bg-gray-100 text-gray-600'}`}
                                    >
                                        {TASK_STATUS_ORDER.map(id => (
                                            <option key={id} value={id}>{TASK_STATUS[id].label}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>

                        {footerLink && (
                            <Link to={footerLink.to} className="block text-[11px] font-bold text-indigo-600 hover:underline">
                                {footerLink.label} →
                            </Link>
                        )}
                    </div>
                </Card>
            )}

            {participation.length > 0 && (
                <Card>
                    <div className="p-5 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="font-bold text-sm text-gray-800 flex items-center gap-1.5">
                                <UserCheck size={15} className="text-emerald-500" /> Ishtirokim
                            </h3>
                            {totalPoints > 0 && (
                                <Badge variant="success" size="sm">{totalPoints} ball</Badge>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            {participation.slice(0, 8).map(p => (
                                <div key={`${p.activityType}:${p.activityId}`} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-100 rounded-xl">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-gray-800 truncate">{p.title}</p>
                                        <p className="text-[10px] text-gray-400 flex items-center gap-1 truncate">
                                            <Calendar size={9} /> {fmtDate(p.date)}
                                            {p.level && ACTIVITY_LEVELS[p.level] && ` · ${ACTIVITY_LEVELS[p.level].label}`}
                                        </p>
                                    </div>
                                    <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${PARTICIPATION_ROLES[p.role]?.tone || ''}`}>
                                        {PARTICIPATION_ROLES[p.role]?.short || p.role}
                                    </span>
                                    {/* null = tadbir hali yakunlanmagan, ball berilmagan.
                                        "0 ball" deb yozish yolg'on bo'lardi. */}
                                    <span className={`shrink-0 text-xs font-extrabold tabular-nums ${p.points == null ? 'text-gray-300' : 'text-emerald-600'}`}>
                                        {p.points == null ? '—' : `+${p.points}`}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {participation.some(p => p.points == null) && (
                            <p className="text-[10px] text-gray-400">
                                "—" belgisi: tadbir hali yakunlanmagan, ball keyinroq yoziladi.
                            </p>
                        )}
                    </div>
                </Card>
            )}
        </div>
    );
};

export default MyActivityPanel;
