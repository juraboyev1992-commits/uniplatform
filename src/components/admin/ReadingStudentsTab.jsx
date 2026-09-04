import React, { useMemo, useState } from 'react';
import {
    ArrowLeft, ChevronRight, Search, CheckCircle2, XCircle, MinusCircle, BookOpen,
} from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import AttemptDetailView from './AttemptDetailView';
import { db } from '../../services/db';
import { INDEX_CRITERIA } from '../../config/socialActivityIndex';
import { TEACHING_LANGUAGES } from '../../constants';

// KITOBXONLIK: TALABA KESIMI.
//
// MUAMMO: ro'yxat ASAR kesimida qurilgan edi. 12 ta asardan test topshirgan
// talabaning natijasini ko'rish uchun 12 ta asarni birma-bir ochib chiqish
// kerak bo'lardi - savol esa talaba haqida edi, asar haqida emas.
//
// Bu ko'rinish ro'yxatni teskari o'giradi: kim nechta asar o'qigani, va
// talabaning ustiga bosilganda uning BARCHA asarlari bitta jadvalda.
const formatDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const ReadingStudentsTab = ({ version = 0 }) => {
    const [openStudentId, setOpenStudentId] = useState(null);
    const [openAttemptId, setOpenAttemptId] = useState(null);
    const [query, setQuery] = useState('');

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const rows = useMemo(() => db.getReadingProgressByStudent(), [version]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const detail = useMemo(
        () => (openStudentId ? db.getStudentReadingDetail(openStudentId) : []),
        [openStudentId, version]
    );

    const openStudent = rows.find(r => r.studentId === openStudentId) || null;

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(r =>
            String(r.student?.fullName || r.studentId).toLowerCase().includes(q)
            || String(r.student?.faculty || '').toLowerCase().includes(q));
    }, [rows, query]);

    // ---------- BITTA URINISH ----------
    if (openAttemptId) {
        return <AttemptDetailView attemptId={openAttemptId} onBack={() => setOpenAttemptId(null)} />;
    }

    // ---------- BITTA TALABA: BARCHA ASARLARI ----------
    if (openStudent) {
        const passed = detail.filter(d => d.passed).length;
        const attempted = detail.filter(d => d.attempts > 0).length;

        return (
            <div className="space-y-4">
                <button
                    type="button"
                    onClick={() => setOpenStudentId(null)}
                    className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-indigo-600"
                >
                    <ArrowLeft size={15} /> Talabalar ro'yxati
                </button>

                <Card>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="text-lg font-black text-gray-900">
                                {openStudent.student?.fullName || openStudent.studentId}
                            </h3>
                            <p className="text-xs text-gray-400">
                                {openStudent.student?.faculty}
                                {openStudent.student?.course && ` · ${openStudent.student.course}-kurs`}
                                {' · '}
                                {openStudent.language
                                    ? TEACHING_LANGUAGES[openStudent.language].short
                                    : "ta'lim tili belgilanmagan"}
                            </p>
                        </div>
                        <div className="flex gap-2.5">
                            <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-center">
                                <p className="text-[11px] text-emerald-700">O'qilgan</p>
                                <p className="text-xl font-black text-emerald-700 tabular-nums">
                                    {passed}<span className="text-sm opacity-60"> / {detail.length}</span>
                                </p>
                            </div>
                            <div className="rounded-xl bg-indigo-50 px-4 py-2.5 text-center">
                                <p className="text-[11px] text-indigo-700">1-mezon bali</p>
                                <p className="text-xl font-black text-indigo-700 tabular-nums">
                                    {openStudent.points}
                                    <span className="text-sm opacity-60"> / {INDEX_CRITERIA.READING.maxPoints}</span>
                                </p>
                            </div>
                        </div>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-2">
                        {attempted} ta asardan test topshirilgan, {passed} tasi muvaffaqiyatli.
                        Ro'yxat talabaning potokidagi asarlardan iborat.
                    </p>
                </Card>

                <Card className="p-0 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-400 text-xs font-bold uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">Asar</th>
                                    <th className="px-6 py-4 text-center">Holat</th>
                                    <th className="px-6 py-4 text-center">Natija</th>
                                    <th className="px-6 py-4 text-center">Urinish</th>
                                    <th className="px-6 py-4">Topshirilgan</th>
                                    <th className="px-6 py-4 w-8" aria-hidden="true"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {detail.map(d => {
                                    const clickable = !!d.bestAttemptId;
                                    return (
                                        <tr
                                            key={d.test.id}
                                            onClick={() => clickable && setOpenAttemptId(d.bestAttemptId)}
                                            className={`transition-colors ${
                                                clickable ? 'hover:bg-indigo-50/50 cursor-pointer' : ''
                                            } ${d.passed ? '' : d.attempts > 0 ? 'bg-rose-50/30' : ''}`}
                                            title={clickable ? "Urinish tafsilotini ko'rish" : ''}
                                        >
                                            <td className="px-6 py-3.5">
                                                <p className="font-semibold text-gray-900">{d.title}</p>
                                                <p className="text-[11px] text-gray-400">
                                                    {d.author || "Muallif ko'rsatilmagan"}
                                                    {!d.published && ' · test e\'lon qilinmagan'}
                                                </p>
                                            </td>
                                            <td className="px-6 py-3.5 text-center">
                                                {d.passed ? (
                                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                                                        <CheckCircle2 size={13} /> O'qilgan
                                                    </span>
                                                ) : d.attempts > 0 ? (
                                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600">
                                                        <XCircle size={13} /> O'tmagan
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                                                        <MinusCircle size={13} /> Topshirilmagan
                                                    </span>
                                                )}
                                            </td>
                                            {/* Urinilmagan asarda foiz YO'Q - nol emas. */}
                                            <td className="px-6 py-3.5 text-center">
                                                {d.percent == null ? (
                                                    <span className="text-gray-300">—</span>
                                                ) : (
                                                    <span className={`font-bold tabular-nums ${d.passed ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                        {d.percent}%
                                                        <span className="text-[10px] text-gray-400 font-normal ml-1">
                                                            (kerak {d.passPercent}%)
                                                        </span>
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-3.5 text-center text-sm text-gray-600 tabular-nums">
                                                {d.attempts || '—'}
                                            </td>
                                            <td className="px-6 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                                                {formatDate(d.lastAt)}
                                            </td>
                                            <td className="px-2 py-3.5 text-gray-300">
                                                {clickable && <ChevronRight size={14} />}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        );
    }

    // ---------- TALABALAR RO'YXATI ----------
    return (
        <div className="space-y-4">
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                    type="text"
                    placeholder="Talaba yoki fakultet bo'yicha qidirish..."
                    className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />
            </div>

            <Card className="p-0 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-400 text-xs font-bold uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Talaba</th>
                                <th className="px-6 py-4 text-center">O'qilgan asarlar</th>
                                <th className="px-6 py-4 text-center">Urinishlar</th>
                                <th className="px-6 py-4 text-center">1-mezon bali</th>
                                <th className="px-6 py-4">Oxirgi test</th>
                                <th className="px-6 py-4 w-8" aria-hidden="true"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {visible.map(r => (
                                <tr
                                    key={r.studentId}
                                    onClick={() => setOpenStudentId(r.studentId)}
                                    className="group hover:bg-indigo-50/50 cursor-pointer transition-colors"
                                >
                                    <td className="px-6 py-3.5">
                                        <p className="font-bold text-gray-900">
                                            {r.student?.fullName || r.studentId}
                                        </p>
                                        <p className="text-[11px] text-gray-400">
                                            {r.student?.faculty}
                                            {r.student?.course && ` · ${r.student.course}-kurs`}
                                            {r.language && ` · ${TEACHING_LANGUAGES[r.language].short}`}
                                        </p>
                                    </td>
                                    <td className="px-6 py-3.5 text-center">
                                        <span className="font-black text-gray-900 tabular-nums">
                                            {r.passedBooks}
                                        </span>
                                        <span className="text-xs text-gray-400"> / {r.availableBooks}</span>
                                    </td>
                                    <td className="px-6 py-3.5 text-center text-sm text-gray-600 tabular-nums">
                                        {r.attempts}
                                        {r.attempts > r.attemptedBooks && (
                                            <span className="text-[10px] text-gray-400 block">
                                                {r.attemptedBooks} ta asarda
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-3.5 text-center">
                                        <Badge variant={r.points > 0 ? 'success' : 'default'} size="sm">
                                            {r.points} / {INDEX_CRITERIA.READING.maxPoints}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                                        {formatDate(r.lastAt)}
                                    </td>
                                    <td className="px-2 py-3.5 text-gray-300 group-hover:text-indigo-500 transition-colors">
                                        <ChevronRight size={14} />
                                    </td>
                                </tr>
                            ))}
                            {visible.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">
                                        {rows.length === 0 ? (
                                            <span className="flex flex-col items-center gap-1.5">
                                                <BookOpen size={22} className="text-gray-300" />
                                                Hali hech kim kitobxonlik testini topshirmagan
                                            </span>
                                        ) : 'Qidiruvga mos talaba topilmadi'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <p className="text-[11px] text-gray-400 px-1">
                Faqat kamida bitta kitobxonlik testini topshirgan talabalar ko'rsatiladi.
                Talabaning ustiga bosib uning barcha asarlarini bitta ro'yxatda ko'ring.
            </p>
        </div>
    );
};

export default ReadingStudentsTab;
