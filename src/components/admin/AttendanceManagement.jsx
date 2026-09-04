import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    CheckSquare, Users, Calendar, Info, Search, ArrowRight, BookOpen,
} from 'lucide-react';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Pagination from '../../components/common/Pagination';
import MissedHoursPanel from './MissedHoursPanel';
import AttendanceAnalyticsTab from './AttendanceAnalyticsTab';
import { db } from '../../services/db';
import { useTabParam } from '../../hooks/useTabParam';
import { PAGINATION } from '../../constants/index.js';
import { INDEX_CRITERIA, missedHoursToPoints } from '../../config/socialActivityIndex';

// DAVOMAT.
//
// Bu sahifa ilgari BESHTA O'YLAB TOPILGAN TALABANI ko'rsatardi ("Haydarova
// Shohida — 88/90") va ular platformada mavjud bo'lmagan fakultetlarga
// tegishli edi. Hech qanday yozuv o'qilmasdi, hech narsa saqlanmasdi.
//
// Platformada IKKITA HAQIQIY davomat bor va ular BOSHQA-BOSHQA narsa:
//
//   DARS davomati    - qoldirilgan soat, indeksning 6-mezoni. Manba HEMIS
//                      tomonida, ulanmagunicha tyutor kiritadi.
//   TADBIR davomati  - klub uchrashuvi, musobaqa, Ma'rifat darsi. Tadbirning
//                      o'z ish maydonida belgilanadi.
//
// Ikkisini aralashtirish talabaga tadbirga borgani uchun dars bali berardi,
// shuning uchun ular ALOHIDA tabda turadi.
//
// Uchinchi tab - TAHLIL. Davomat platformadagi eng katta jadval edi, lekin
// undan bironta ko'rsatkich chiqarilmasdi: ro'yxatdan o'tib kelmaganlar,
// davomati belgilanmay qolgan tadbirlar va yuklama taqsimoti hech qayerda
// ko'rinmasdi.
const TABS = [
    { id: 'dars', label: 'Dars davomati' },
    { id: 'tadbir', label: 'Tadbir davomati' },
    { id: 'tahlil', label: 'Tahlil' },
];

const AttendanceManagement = () => {
    const [tab, setTab] = useTabParam(TABS.map(t => t.id), 'dars');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = PAGINATION.DEFAULT_PAGE_SIZE;

    const students = useMemo(() => db.getMockStudents(), []);

    // --- Dars davomati: kiritilgan soatlar ---
    const missedRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        return students
            .map(s => ({ student: s, semesters: db.getStudentMissedHours(s.id) }))
            .filter(r => r.semesters.length > 0)
            .filter(r => !q || r.student.fullName?.toLowerCase().includes(q))
            .map(r => {
                const points = r.semesters.map(x => missedHoursToPoints(x.hours));
                const avg = points.reduce((a, b) => a + b, 0) / points.length;
                return { ...r, points: Math.round(avg * 10) / 10 };
            })
            .sort((a, b) => a.points - b.points);
    }, [students, search]);

    const totalPages = Math.max(1, Math.ceil(missedRows.length / pageSize));
    const paginated = missedRows.slice((page - 1) * pageSize, page * pageSize);

    // --- Tadbir davomati: faoliyatlar kesimida ---
    const activityRows = useMemo(() => {
        const attendance = db.getActivityAttendanceAll();
        const events = new Map((db.getEvents() || []).map(e => [`event:${e.id}`, e]));
        const comps = new Map((db.getCompetitions() || []).map(c => [`competition:${c.id}`, c]));

        const byActivity = new Map();
        attendance.forEach(a => {
            const key = `${a.activityType}:${a.activityId}`;
            if (!byActivity.has(key)) byActivity.set(key, { key, present: 0, total: 0 });
            const row = byActivity.get(key);
            row.total++;
            if (a.status === 'present') row.present++;
        });

        const q = search.trim().toLowerCase();
        return Array.from(byActivity.values())
            .map(r => {
                const activity = events.get(r.key) || comps.get(r.key);
                if (!activity) return null;
                return {
                    ...r,
                    id: activity.id,
                    type: r.key.startsWith('competition') ? 'competition' : 'event',
                    title: activity.title,
                    date: activity.date || activity.startDate || null,
                    percent: r.total > 0 ? Math.round((r.present / r.total) * 100) : 0,
                };
            })
            .filter(Boolean)
            .filter(r => !q || r.title.toLowerCase().includes(q))
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    }, [search]);

    return (
        <div className="space-y-6 font-sans">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                        <CheckSquare className="w-7 h-7 text-indigo-600" /> Davomat
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Dars davomati va tadbirlardagi qatnashuv
                    </p>
                </div>
                <div className="flex flex-wrap bg-slate-100 p-1.5 rounded-xl gap-1 self-start md:self-auto">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all ${
                                tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Ikki davomatni ajratib turish - eng katta chalkashlik manbai. */}
            <Card className="border-l-4 border-l-indigo-400">
                <p className="text-xs text-gray-600 flex items-start gap-2">
                    <Info size={14} className="text-indigo-500 shrink-0 mt-px" />
                    <span>
                        <b>Dars davomati</b> — qoldirilgan soat, indeksning 6-mezoni.
                        <b> Tadbir davomati</b> — klub uchrashuvi va musobaqalardagi qatnashuv,
                        u 2, 8 va 9-mezonlarga ishlaydi. Ikkisi boshqa-boshqa narsa va
                        bir-birini almashtirmaydi.
                    </span>
                </p>
            </Card>

            {/* Tahlil tabida qidiruv yo'q - u yerda ro'yxat emas, ko'rsatkich. */}
            {tab !== 'tahlil' && (
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text" value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                        placeholder={tab === 'dars' ? 'Talaba qidirish...' : 'Tadbir qidirish...'}
                        className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm"
                    />
                </div>
            )}

            {/* ---------- TAHLIL ---------- */}
            {tab === 'tahlil' && <AttendanceAnalyticsTab />}

            {/* ---------- DARS DAVOMATI ---------- */}
            {tab === 'dars' && (
                <>
                    <MissedHoursPanel />

                    <Card padding={false}>
                        <div className="p-4 border-b border-gray-100">
                            <h3 className="font-bold text-sm text-gray-700">
                                Kiritilgan ma'lumot ({missedRows.length} talaba)
                            </h3>
                        </div>
                        {missedRows.length === 0 ? (
                            <p className="p-10 text-center text-sm text-gray-400">
                                Hali hech kimning qoldirilgan dars soati kiritilmagan.
                            </p>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-gray-50 border-b border-gray-100">
                                            <tr>
                                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Talaba</th>
                                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Fakultet / Kurs</th>
                                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Semestrlar</th>
                                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-right">6-mezon bali</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {paginated.map(r => (
                                                <tr key={r.student.id} className="hover:bg-gray-50/50">
                                                    <td className="px-6 py-3 text-sm font-medium text-gray-900">
                                                        {r.student.fullName}
                                                    </td>
                                                    <td className="px-6 py-3 text-sm text-gray-500">
                                                        {r.student.faculty} · {r.student.course}-kurs
                                                    </td>
                                                    <td className="px-6 py-3 text-xs text-gray-600">
                                                        {r.semesters.map(s => (
                                                            <span key={s.semester} className="inline-block mr-3">
                                                                {s.semester}-semestr: <b>{s.hours}</b> soat
                                                            </span>
                                                        ))}
                                                        {r.semesters.length < 2 && (
                                                            <span className="text-amber-600">· 1 semestr ma'lumoti</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-3 text-right">
                                                        <Badge
                                                            variant={r.points >= 4 ? 'success' : r.points >= 2 ? 'warning' : 'danger'}
                                                            size="sm"
                                                        >
                                                            {r.points} / {INDEX_CRITERIA.ATTENDANCE.maxPoints}
                                                        </Badge>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <Pagination
                                    currentPage={page} totalPages={totalPages} onPageChange={setPage}
                                    totalItems={missedRows.length} pageSize={pageSize}
                                />
                            </>
                        )}
                    </Card>
                </>
            )}

            {/* ---------- TADBIR DAVOMATI ---------- */}
            {tab === 'tadbir' && (
                <Card padding={false}>
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                        <h3 className="font-bold text-sm text-gray-700">
                            Davomati belgilangan faoliyatlar ({activityRows.length})
                        </h3>
                        <p className="text-[11px] text-gray-400">
                            Davomat faoliyatning o'z ish maydonida belgilanadi
                        </p>
                    </div>
                    {activityRows.length === 0 ? (
                        <div className="p-10 text-center space-y-2">
                            <Calendar size={26} className="mx-auto text-gray-300" />
                            <p className="text-sm font-semibold text-gray-700">Davomat belgilanmagan</p>
                            <p className="text-xs text-gray-500">
                                Tadbir yoki musobaqa ish maydonida davomat belgilanganda shu yerda ko'rinadi.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-50 max-h-[36rem] overflow-y-auto">
                            {activityRows.map(r => (
                                <div key={r.key} className="flex items-center gap-3 px-5 py-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 truncate">{r.title}</p>
                                        <p className="text-[11px] text-gray-500">
                                            {r.date ? new Date(r.date).toLocaleDateString('uz-UZ') : ''}
                                            {' · '}
                                            {r.type === 'competition' ? 'Musobaqa' : 'Tadbir'}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-bold text-gray-900 tabular-nums">
                                            {r.present} / {r.total}
                                        </p>
                                        <p className="text-[11px] text-gray-400">{r.percent}% qatnashgan</p>
                                    </div>
                                    <Link
                                        to={r.type === 'competition' ? `/admin/competitions/${r.id}` : `/admin/events/${r.id}`}
                                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg shrink-0"
                                        title="Ish maydoniga o'tish"
                                    >
                                        <ArrowRight size={16} />
                                    </Link>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
};

export default AttendanceManagement;
