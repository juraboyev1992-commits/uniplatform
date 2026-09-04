import React, { useMemo } from 'react';
import { Calendar, CheckCircle, Coins, Info } from 'lucide-react';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import {
    PARTICIPATION_ROLES, ACTIVITY_LEVELS, EVENT_TYPES, POINTS_EXPLANATION,
} from '../../config/activityLifecycle';

// Talabaning tadbir va musobaqalardagi davomati.
//
// AVVAL bu sahifa BUTUNLAY TO'QIMA edi: "Oliy Matematika 18/22", "Web Dasturlash
// 28/28" degan qo'lda yozilgan fanlar ro'yxati turardi. Talaba o'zi haqida
// o'ylab topilgan ma'lumotni ko'rardi - bu bo'sh sahifadan ham yomon, chunki
// yolg'onligi bilinmaydi.
//
// Platformada dars davomati YO'Q (u HEMIS tomonida) - shuning uchun bu sahifa
// endi o'zi haqiqatan biladigan narsani ko'rsatadi: tadbir va musobaqalardagi
// ishtirok, rol va shu ishtirokdan kelgan ball.

const fmtDate = (d) => (d
    ? new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—');

const AttendanceModule = () => {
    const { user } = useAuth();

    const participation = useMemo(
        () => db.getStudentActivityParticipation(user?.username),
        [user?.username]
    );

    const totalPoints = participation.reduce((s, p) => s + (p.points || 0), 0);
    const awaiting = participation.filter(p => p.points == null).length;

    // Rollar kesimi - "men ko'proq nima qilaman" degan savolga javob.
    const byRole = useMemo(() => {
        const acc = {};
        participation.forEach(p => { acc[p.role] = (acc[p.role] || 0) + 1; });
        return Object.entries(acc).sort((a, b) => b[1] - a[1]);
    }, [participation]);

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-cyan-600 to-blue-700 rounded-2xl p-8 text-white shadow-xl flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Ishtirokim</h1>
                    <p className="text-cyan-100 italic">
                        Tadbir va musobaqalardagi qatnashuvingiz, roli va undan kelgan ball
                    </p>
                </div>
                <div className="flex gap-3">
                    <div className="bg-white/20 backdrop-blur-md p-4 rounded-2xl border border-white/30 text-center min-w-[110px]">
                        <p className="text-sm opacity-80 mb-1">Tadbirlar</p>
                        <p className="text-3xl font-bold tabular-nums">{participation.length}</p>
                    </div>
                    <div className="bg-white/20 backdrop-blur-md p-4 rounded-2xl border border-white/30 text-center min-w-[110px]">
                        <p className="text-sm opacity-80 mb-1">Ball</p>
                        <p className="text-3xl font-bold tabular-nums">{totalPoints}</p>
                    </div>
                </div>
            </div>

            {participation.length === 0 ? (
                <Card>
                    <div className="p-10 text-center space-y-2">
                        <Calendar className="w-8 h-8 text-gray-300 mx-auto" />
                        <p className="text-sm font-semibold text-gray-600">Hali hech qanday tadbirda qatnashmagansiz</p>
                        <p className="text-xs text-gray-400">
                            Tadbirlar kalendaridan ro'yxatdan o'ting — qatnashganingiz shu yerda ko'rinadi.
                        </p>
                    </div>
                </Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="lg:col-span-2 p-0 overflow-hidden">
                        <div className="p-4 border-b border-gray-100">
                            <h2 className="font-bold text-gray-800 flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-emerald-500" /> Qatnashgan tadbirlarim
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-[11px] uppercase text-gray-400 border-b border-gray-100">
                                        <th className="px-4 py-2 font-bold">Tadbir</th>
                                        <th className="px-4 py-2 font-bold">Sana</th>
                                        <th className="px-4 py-2 font-bold">Rol</th>
                                        <th className="px-4 py-2 font-bold text-right">Ball</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {participation.map(p => (
                                        <tr key={`${p.activityType}:${p.activityId}`} className="border-b border-gray-50 last:border-0">
                                            <td className="px-4 py-2.5">
                                                <p className="font-semibold text-gray-800">{p.title}</p>
                                                <p className="text-[10px] text-gray-400">
                                                    {p.eventType && EVENT_TYPES[p.eventType] ? EVENT_TYPES[p.eventType].label : (p.activityType === 'competition' ? 'Musobaqa' : 'Tadbir')}
                                                    {p.level && ACTIVITY_LEVELS[p.level] && ` · ${ACTIVITY_LEVELS[p.level].label}`}
                                                </p>
                                            </td>
                                            <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(p.date)}</td>
                                            <td className="px-4 py-2.5">
                                                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${PARTICIPATION_ROLES[p.role]?.tone || ''}`}>
                                                    {PARTICIPATION_ROLES[p.role]?.short || p.role}
                                                </span>
                                            </td>
                                            {/* null = tadbir hali yakunlanmagan. "0" deb yozish
                                                yolg'on bo'lardi - ball hali hisoblanmagan. */}
                                            <td className={`px-4 py-2.5 text-right font-extrabold tabular-nums ${p.points == null ? 'text-gray-300' : 'text-emerald-600'}`}>
                                                {p.points == null ? '—' : `+${p.points}`}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    <div className="space-y-4">
                        {byRole.length > 0 && (
                            <Card>
                                <div className="p-5 space-y-2">
                                    <h3 className="font-bold text-gray-800 text-sm">Rollarim</h3>
                                    {byRole.map(([role, count]) => (
                                        <div key={role} className="flex items-center justify-between gap-2">
                                            <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold border ${PARTICIPATION_ROLES[role]?.tone || ''}`}>
                                                {PARTICIPATION_ROLES[role]?.label || role}
                                            </span>
                                            <span className="text-sm font-extrabold text-gray-700 tabular-nums">{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        )}

                        <Card className="bg-indigo-50 border-none">
                            <div className="p-5">
                                <h4 className="font-bold text-indigo-900 text-sm mb-2 flex items-center gap-1.5">
                                    <Coins size={14} /> Ball qanday hisoblanadi
                                </h4>
                                <p className="text-xs text-indigo-700 leading-relaxed">{POINTS_EXPLANATION}</p>
                                <p className="text-[11px] text-indigo-600 mt-2">
                                    Masalan: volontyor (5) × xalqaro daraja (2) = 10 ball.
                                </p>
                            </div>
                        </Card>

                        {awaiting > 0 && (
                            <Card className="bg-amber-50 border-none">
                                <div className="p-5">
                                    <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                                        <Info size={13} /> {awaiting} ta tadbir hali yakunlanmagan
                                    </p>
                                    <p className="text-[11px] text-amber-700 mt-1">
                                        Ular yakunlangach ball avtomatik yoziladi.
                                    </p>
                                </div>
                            </Card>
                        )}
                    </div>
                </div>
            )}

            {/* Dars davomati ATAYLAB yo'q: u platformada saqlanmaydi, HEMIS tomonida.
                Uni bu yerda "hisoblab" ko'rsatish to'qima bo'lardi - avvalgi holat
                aynan shunday edi. */}
            <Card>
                <div className="p-4 flex items-start gap-2">
                    <Info size={14} className="text-gray-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                        Bu sahifa <span className="font-semibold">darsdan tashqari</span> faoliyatdagi ishtirokni ko'rsatadi.
                        Dars davomati universitetning HEMIS tizimida yuritiladi va bu yerda aks etmaydi.
                    </p>
                </div>
            </Card>
        </div>
    );
};

export default AttendanceModule;
