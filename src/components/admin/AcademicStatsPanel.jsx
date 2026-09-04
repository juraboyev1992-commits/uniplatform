import React, { useMemo } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import Card from '../common/Card';
import { db } from '../../services/db';
import { getAcademicStats, GPA_THRESHOLD } from '../../utils/academicStats';

// AKADEMIK KO'RSATKICHLAR TAHLILI.
//
// QAMROV va NATIJA ataylab alohida ko'rsatiladi: 550 tadan 30 tasining
// GPA'si kiritilgan bo'lsa, "o'rtacha GPA 4.2" degan raqam butun
// universitetning holati emas - shu 30 tasining holati. Buni yashirmaslik
// uchun har joyda qamrov ham yoziladi.
const dash = (v, suffix = '') => (v === null || v === undefined ? '—' : `${v}${suffix}`);

const TONES = {
    emerald: 'bg-emerald-500',
    sky: 'bg-sky-500',
    amber: 'bg-amber-400',
    red: 'bg-red-500',
};

const AcademicStatsPanel = ({ academicYear, version = 0 }) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const stats = useMemo(() => getAcademicStats(db, academicYear), [academicYear, version]);

    const maxBand = Math.max(1, ...stats.distribution.map(b => b.count));

    return (
        <div className="space-y-4">
            {/* --- QAMROV VA NATIJA --- */}
            <Card title="Umumiy holat" subtitle={`${stats.academicYear} o'quv yili`}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-gray-50 px-4 py-3">
                        <p className="text-xs text-gray-500">GPA kiritilgan</p>
                        <p className="text-2xl font-black text-gray-900 tabular-nums">
                            {stats.gpaCovered}
                            <span className="text-sm font-bold text-gray-400 ml-1.5">/ {stats.totalStudents}</span>
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{stats.gpaCoveragePercent}% qamrov</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 px-4 py-3">
                        <p className="text-xs text-gray-500">Qoldirilgan soat kiritilgan</p>
                        <p className="text-2xl font-black text-gray-900 tabular-nums">
                            {stats.missedCovered}
                            <span className="text-sm font-bold text-gray-400 ml-1.5">/ {stats.totalStudents}</span>
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{stats.missedCoveragePercent}% qamrov</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 px-4 py-3">
                        <p className="text-xs text-emerald-700">O'rtacha GPA</p>
                        <p className="text-2xl font-black text-emerald-700 tabular-nums">{dash(stats.averageGpa)}</p>
                        <p className="text-[11px] text-emerald-600/70 mt-0.5">
                            3-mezonda ≈ {dash(stats.averageGpaPoints)} ball
                        </p>
                    </div>
                    <div className="rounded-xl bg-amber-50 px-4 py-3">
                        <p className="text-xs text-amber-700">O'rtacha qoldirilgan</p>
                        <p className="text-2xl font-black text-amber-700 tabular-nums">{dash(stats.averageMissed)}</p>
                        <p className="text-[11px] text-amber-600/70 mt-0.5">soat / semestr</p>
                    </div>
                </div>

                <p className="flex items-start gap-2 text-[11px] text-gray-500 mt-3 leading-relaxed">
                    <Info size={13} className="shrink-0 mt-px text-gray-400" />
                    <span>
                        O'rtacha qiymatlar faqat MA'LUMOTI KIRITILGAN talabalar bo'yicha hisoblangan —
                        ular butun universitetning holati emas.
                        {stats.partialGpa > 0 && (
                            <> {stats.partialGpa} nafar talabaning faqat bitta semestri kiritilgan,
                            ularning yakuniy bali hali to'liq emas.</>
                        )}
                    </span>
                </p>
            </Card>

            {/* --- TAQSIMOT --- */}
            <Card title="GPA taqsimoti" subtitle={`${stats.gpaCovered} nafar talaba bo'yicha`}>
                {stats.gpaCovered === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-400">
                        Bu o'quv yilida hali GPA kiritilmagan.
                    </p>
                ) : (
                    <div className="space-y-2.5">
                        {stats.distribution.map(b => (
                            <div key={b.key} className="flex items-center gap-3">
                                <p className="text-xs text-gray-600 w-56 shrink-0">{b.label}</p>
                                <div className="flex-1 h-5 bg-gray-50 rounded-lg overflow-hidden">
                                    <div
                                        className={`h-full ${TONES[b.tone]} rounded-lg transition-all`}
                                        style={{ width: `${Math.round((b.count / maxBand) * 100)}%` }}
                                    />
                                </div>
                                <p className="text-sm font-bold text-gray-900 tabular-nums w-12 text-right shrink-0">
                                    {b.count}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* --- XAVF GURUHI --- */}
            {(stats.gpaRisk.length > 0 || stats.missedZeroPoint.length > 0) && (
                <Card title="Diqqat talab qiladi" subtitle="Mezon bo'yicha ball olmaydiganlar">
                    <div className="flex gap-2 p-3 mb-3 rounded-lg bg-amber-50 border border-amber-100">
                        <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800 leading-relaxed">
                            Chegara metodikadan olingan, bu yerda belgilanmagan:
                            GPA {GPA_THRESHOLD} dan past bo'lsa 3-mezonda ball berilmaydi;
                            qoldirilgan soat eng yuqori banddan oshsa 6-mezonda ball berilmaydi.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">
                                GPA past ({stats.gpaRisk.length})
                            </h4>
                            {stats.gpaRisk.length === 0 ? (
                                <p className="text-sm text-gray-400 py-4">Bunday talaba yo'q.</p>
                            ) : (
                                <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                                    {stats.gpaRisk.map(r => (
                                        <div key={r.studentId} className="flex items-center justify-between py-2 gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm text-gray-900 truncate">
                                                    {r.student?.fullName || r.studentId}
                                                </p>
                                                <p className="text-[11px] text-gray-400 truncate">
                                                    {r.student?.faculty} · {r.student?.course}-kurs
                                                </p>
                                            </div>
                                            <span className="text-sm font-bold text-red-600 tabular-nums shrink-0">
                                                {r.gpa}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">
                                Qoldirilgan soat ko'p ({stats.missedZeroPoint.length})
                            </h4>
                            {stats.missedZeroPoint.length === 0 ? (
                                <p className="text-sm text-gray-400 py-4">Bunday talaba yo'q.</p>
                            ) : (
                                <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                                    {stats.missedZeroPoint.map(r => (
                                        <div key={r.studentId} className="flex items-center justify-between py-2 gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm text-gray-900 truncate">
                                                    {r.student?.fullName || r.studentId}
                                                </p>
                                                <p className="text-[11px] text-gray-400 truncate">
                                                    {r.student?.faculty} · {r.student?.course}-kurs
                                                </p>
                                            </div>
                                            <span className="text-sm font-bold text-red-600 tabular-nums shrink-0">
                                                {r.hours} soat
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </Card>
            )}

            {/* --- FAKULTETLAR --- */}
            <Card title="Fakultetlar kesimi" subtitle="O'rtacha GPA bo'yicha tartiblangan">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="border-b border-gray-100">
                            <tr>
                                <th className="py-2 text-xs font-semibold text-gray-500 uppercase">Fakultet</th>
                                <th className="py-2 text-xs font-semibold text-gray-500 uppercase text-right">Qamrov</th>
                                <th className="py-2 text-xs font-semibold text-gray-500 uppercase text-right">O'rtacha GPA</th>
                                <th className="py-2 text-xs font-semibold text-gray-500 uppercase text-right">O'rtacha soat</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {stats.faculties.map(f => (
                                <tr key={f.faculty}>
                                    <td className="py-2.5 text-sm text-gray-900">{f.faculty}</td>
                                    <td className="py-2.5 text-sm text-gray-500 text-right tabular-nums">
                                        {f.covered}/{f.students}
                                        <span className="text-[11px] text-gray-400 ml-1">({f.coveragePercent}%)</span>
                                    </td>
                                    <td className="py-2.5 text-sm font-bold text-gray-900 text-right tabular-nums">
                                        {dash(f.averageGpa)}
                                    </td>
                                    <td className="py-2.5 text-sm text-gray-600 text-right tabular-nums">
                                        {dash(f.averageMissed)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="text-[11px] text-gray-400 mt-2">
                    Qamrovi past fakultetning o'rtachasi ishonchsiz — bir necha talabaning
                    ko'rsatkichi butun fakultetni ifodalamaydi.
                </p>
            </Card>
        </div>
    );
};

export default AcademicStatsPanel;
