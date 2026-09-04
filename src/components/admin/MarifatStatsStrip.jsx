import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import Card from '../common/Card';
import { db } from '../../services/db';
import { getMarifatStats } from '../../utils/marifatStats';

// MA'RIFAT DARSLARINING UMUMIY HOLATI.
//
// Sahifa tepasida, har uchala tabda ko'rinadi - chunki bu savol tabga
// bog'liq emas: "reja bajarilyaptimi".
//
// Auditoriya kesimi yig'ib qo'yilgan: u ko'p qatorli va kundalik ishda
// har doim kerak emas, lekin kerak bo'lganda joyida turadi.
const dash = (v, suffix = '%') => (v === null || v === undefined ? '—' : `${v}${suffix}`);

const MarifatStatsStrip = ({ academicYear, version = 0 }) => {
    const [open, setOpen] = useState(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const stats = useMemo(() => getMarifatStats(db, academicYear), [academicYear, version]);

    if (stats.lessons === 0) return null;

    const warnings = [];
    if (stats.unmarkedLessons > 0) {
        warnings.push(`${stats.unmarkedLessons} ta darsning davomati belgilanmagan`);
    }
    if (stats.audiencesWithoutLessons.length > 0) {
        warnings.push(`${stats.audiencesWithoutLessons.length} ta auditoriyada dars rejalashtirilmagan`);
    }

    return (
        <Card>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                    <p className="text-[11px] text-gray-500">Darslar</p>
                    <p className="text-xl font-black text-gray-900 tabular-nums">{stats.lessons}</p>
                    <p className="text-[11px] text-gray-400">{stats.lockedLessons} qulflangan</p>
                </div>
                <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
                    <p className="text-[11px] text-emerald-700">O'rtacha davomat</p>
                    <p className="text-xl font-black text-emerald-700 tabular-nums">{dash(stats.attendancePercent)}</p>
                    <p className="text-[11px] text-emerald-600/70">{stats.totalPresent} / {stats.totalMarked}</p>
                </div>
                <div className="rounded-xl bg-orange-50 px-3 py-2.5">
                    <p className="text-[11px] text-orange-700">Faol ishtirok</p>
                    <p className="text-xl font-black text-orange-700 tabular-nums">{dash(stats.activePercent)}</p>
                    <p className="text-[11px] text-orange-600/70">kelganlardan</p>
                </div>
                <div className="rounded-xl bg-indigo-50 px-3 py-2.5">
                    <p className="text-[11px] text-indigo-700">Qamrab olingan talaba</p>
                    <p className="text-xl font-black text-indigo-700 tabular-nums">{stats.coveredStudents}</p>
                    <p className="text-[11px] text-indigo-600/70">{stats.coveragePercent}% barchadan</p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                    <p className="text-[11px] text-gray-500">Auditoriyalar</p>
                    <p className="text-xl font-black text-gray-900 tabular-nums">
                        {stats.audiences.length - stats.audiencesWithoutLessons.length}
                        <span className="text-sm font-bold text-gray-400"> / {stats.audiences.length}</span>
                    </p>
                    <p className="text-[11px] text-gray-400">darsi bor</p>
                </div>
            </div>

            {warnings.length > 0 && (
                <p className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2.5 mt-3">
                    <AlertTriangle size={14} className="shrink-0 mt-px text-amber-600" />
                    <span>{warnings.join(' · ')}</span>
                </p>
            )}

            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700"
            >
                Auditoriyalar kesimi {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {open && (
                <div className="overflow-x-auto mt-3">
                    <table className="w-full text-left">
                        <thead className="border-b border-gray-100">
                            <tr>
                                <th className="py-2 text-xs font-semibold text-gray-500 uppercase">Auditoriya</th>
                                <th className="py-2 text-xs font-semibold text-gray-500 uppercase text-right">Talaba</th>
                                <th className="py-2 text-xs font-semibold text-gray-500 uppercase text-right">Dars</th>
                                <th className="py-2 text-xs font-semibold text-gray-500 uppercase text-right">Davomat</th>
                                <th className="py-2 text-xs font-semibold text-gray-500 uppercase text-right">Faollik</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {stats.audiences.map(a => (
                                <tr key={a.key} className={a.lessons === 0 ? 'bg-amber-50/40' : ''}>
                                    <td className="py-2 text-sm text-gray-900">
                                        {a.faculty} · {a.course}-kurs
                                    </td>
                                    <td className="py-2 text-sm text-gray-500 text-right tabular-nums">{a.students}</td>
                                    <td className="py-2 text-sm text-gray-500 text-right tabular-nums">{a.lessons}</td>
                                    <td className="py-2 text-sm font-bold text-gray-900 text-right tabular-nums">
                                        {dash(a.attendancePercent)}
                                    </td>
                                    <td className="py-2 text-sm text-gray-600 text-right tabular-nums">
                                        {dash(a.activePercent)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="text-[11px] text-gray-400 mt-2">
                        Sariq qator — dars rejalashtirilmagan auditoriya. U yerda davomat foizi
                        "0%" emas, <b>—</b>: o'lchanadigan narsa yo'q.
                    </p>
                </div>
            )}
        </Card>
    );
};

export default MarifatStatsStrip;
