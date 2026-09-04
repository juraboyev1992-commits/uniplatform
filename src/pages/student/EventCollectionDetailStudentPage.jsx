import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Layers, Calendar, Users, TrendingUp, Trophy, ChevronRight, Clock, MapPin
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import ActivityQuickViewModal from '../../components/student/ActivityQuickViewModal';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { COLLECTION_STATUS_LABELS } from '../../config/eventCollections.js';

const ROW_STATUS_LABELS = { upcoming: 'Ochilmagan', ongoing: 'Davom etmoqda', closed: 'Yakunlangan' };
const ROW_STATUS_PILL_CLASSES = {
    upcoming: 'bg-blue-50 text-blue-700 border-blue-100',
    ongoing: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    closed: 'bg-rose-50 text-rose-700 border-rose-100'
};
const SCOPE_IDS = ['students', 'faculties', 'tutors', 'courses', 'groups'];
const SCOPES = [
    { id: 'students', label: 'Talabalar' },
    { id: 'faculties', label: 'Fakultetlar' },
    { id: 'tutors', label: 'Tyutorlar' },
    { id: 'courses', label: 'Kurslar' },
    { id: 'groups', label: 'Guruhlar' },
];
const fmtPct = (v) => v == null ? '—' : `${v.toFixed(1)}%`;

// Admin tomonidagi EventCollectionDetailPage.jsx bilan bir xil ma'lumot manbai
// (db.getEventCollectionAnalytics) - faqat O'QISH uchun ko'rinish: sozlamalar,
// faoliyat qo'shish/o'chirish, "Reytingga ta'siri"ni o'zgartirish yo'q. Har bir
// faoliyat bosilganda ODATDAGIDEK (ActivityQuickViewModal orqali) ro'yxatdan
// o'tish oynasi ochiladi - to'plam registratsiyani o'zgartirmaydi.
const EventCollectionDetailStudentPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, hasClubRole } = useAuth();
    const [tab, setTab] = useState('activities'); // 'activities' | 'ranking'
    const [scope, setScope] = useState('students');
    const [quickViewEntry, setQuickViewEntry] = useState(null);

    const analytics = useMemo(() => db.getEventCollectionAnalytics(id), [id]);
    const clubs = useMemo(() => db.getClubs(), []);
    const clubNameById = useMemo(() => new Map(clubs.map(c => [c.id, c.name])), [clubs]);

    const canManageEvent = (row) =>
        user?.role === 'ADMINISTRATOR' || (row.clubId && hasClubRole(row.clubId, ['coordinator', 'head_coordinator']));

    if (!analytics || (analytics.collection.status !== 'ACTIVE' && analytics.collection.status !== 'COMPLETED')) {
        return (
            <Card className="p-12 text-center text-gray-400">
                Loyiha topilmadi.
                <div className="mt-4"><Button variant="outline" onClick={() => navigate('/student/event-collections')}>Orqaga</Button></div>
            </Card>
        );
    }
    const { collection, overview, activityRows, studentRows, facultyRows, tutorRows, courseRows, groupRows } = analytics;

    const myRow = useMemo(
        () => studentRows.find(r => r.studentId === user?.username) || null,
        [studentRows, user?.username]
    );
    const myRank = myRow ? studentRows.findIndex(r => r.studentId === user?.username) + 1 : null;

    const scopeRows = ({ students: studentRows, faculties: facultyRows, tutors: tutorRows, courses: courseRows, groups: groupRows })[scope];
    const scopeLabel = (r) => scope === 'students' ? r.fullName : (scope === 'courses' ? `${r.key}-kurs` : (r.key || "Noma'lum"));

    const handleActivityClick = (row) => {
        const entry = { kind: row.activityType === 'competition' ? 'competition' : 'event', id: row.activityId, clubId: row.clubId };
        if (canManageEvent(entry)) {
            navigate(
                `/student/${row.activityType === 'competition' ? 'competitions' : 'events'}/${row.activityId}`,
                { state: { from: `/student/event-collections/${id}` } }
            );
            return;
        }
        setQuickViewEntry(entry);
    };

    const fmtRange = () => {
        const f = (d) => d ? new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long' }) : null;
        const s = f(collection.startDate), e = f(collection.endDate);
        if (s && e) return `${s} - ${e}`;
        return s || e || "Sana belgilanmagan";
    };

    return (
        <div className="space-y-4">
            <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 rounded-2xl p-8 text-white shadow-xl">
                <Button variant="outline" size="sm" icon={ArrowLeft} onClick={() => navigate('/student/event-collections')} className="!bg-white/10 !border-white/30 !text-white hover:!bg-white/20 mb-4">
                    Orqaga
                </Button>
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-3"><Layers className="w-7 h-7" /> {collection.name}</h1>
                <p className="text-indigo-100 flex items-center gap-1.5"><Calendar size={14} /> {fmtRange()}</p>
                {collection.description && <p className="text-indigo-100 mt-2 max-w-2xl">{collection.description}</p>}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="p-4 text-center"><p className="text-2xl font-black text-gray-900">{overview.activityCount}</p><p className="text-[11px] text-gray-400 font-bold uppercase mt-0.5">Faoliyatlar</p></Card>
                <Card className="p-4 text-center"><p className="text-2xl font-black text-gray-900">{overview.totalParticipation}</p><p className="text-[11px] text-gray-400 font-bold uppercase mt-0.5">Jami ishtirok</p></Card>
                <Card className="p-4 text-center"><p className="text-2xl font-black text-gray-900">{overview.uniqueStudents}</p><p className="text-[11px] text-gray-400 font-bold uppercase mt-0.5">Talabalar</p></Card>
                <Card className="p-4 text-center"><p className="text-2xl font-black text-gray-900">{fmtPct(overview.coveragePercent)}</p><p className="text-[11px] text-gray-400 font-bold uppercase mt-0.5">Qamrov</p></Card>
            </div>

            {/* Mening natijam */}
            <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
                {myRow ? (
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-xs font-bold text-amber-700 uppercase">Mening natijam</p>
                            <p className="text-lg font-black text-gray-900 mt-0.5">{myRank}-o'rin - {myRow.totalPoints} ball</p>
                            <p className="text-sm text-gray-600 mt-0.5">{myRow.participationCount} ta faoliyatda ishtirok etdingiz{myRow.firstPlaces + myRow.secondPlaces + myRow.thirdPlaces > 0 ? `, ${myRow.firstPlaces + myRow.secondPlaces + myRow.thirdPlaces} ta o'rin egallagansiz` : ''}</p>
                        </div>
                        <Trophy className="w-10 h-10 text-amber-500 shrink-0" />
                    </div>
                ) : (
                    <p className="text-sm text-gray-600">Siz hali ushbu loyihaning hech bir faoliyatida ishtirok etmagansiz - pastdagi ro'yxatdan tanlab ro'yxatdan o'ting.</p>
                )}
            </Card>

            <div className="inline-flex bg-white p-1 rounded-2xl border border-gray-100 shadow-sm">
                {[['activities', 'Faoliyatlar'], ['ranking', 'Reyting']].map(([id2, label]) => (
                    <button key={id2} type="button" onClick={() => setTab(id2)}
                        className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === id2 ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-gray-500 hover:bg-gray-50'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'activities' && (
                <div className="space-y-3">
                    {activityRows.map(row => (
                        <div
                            key={`${row.activityType}_${row.activityId}`}
                            onClick={() => handleActivityClick(row)}
                            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 hover:shadow-md hover:border-indigo-200 cursor-pointer transition-all"
                        >
                            <div className="w-24 shrink-0">
                                <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold border ${ROW_STATUS_PILL_CLASSES[row.statusBucket]}`}>
                                    {ROW_STATUS_LABELS[row.statusBucket]}
                                </span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-gray-900 truncate">{row.title}</p>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
                                    {row.date && <span className="flex items-center gap-1.5"><Clock size={12} /> {new Date(row.date).toLocaleDateString('uz-UZ')}</span>}
                                    {row.location && <span className="flex items-center gap-1.5 truncate"><MapPin size={12} /> {row.location}</span>}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                    <Badge variant={row.activityType === 'competition' ? 'primary' : 'default'} size="sm">
                                        {row.activityType === 'competition' ? 'Musobaqa' : 'Tadbir'}
                                    </Badge>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                                <span className="flex items-center gap-1.5 text-sm text-gray-500"><Users size={15} /> {row.totalParticipation}</span>
                                <ChevronRight size={18} className="text-gray-300" />
                            </div>
                        </div>
                    ))}
                    {activityRows.length === 0 && (
                        <Card className="p-12 text-center text-gray-400">Hali faoliyat biriktirilmagan</Card>
                    )}
                </div>
            )}

            {tab === 'ranking' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                        {SCOPES.map(s => (
                            <button key={s.id} type="button" onClick={() => setScope(s.id)}
                                className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${scope === s.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                                {s.label}
                            </button>
                        ))}
                    </div>
                    <Card className="p-0 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-[11px] font-bold text-gray-400 uppercase">
                                        <th className="px-4 py-3">№</th>
                                        <th className="px-4 py-3">{scope === 'students' ? 'Talaba' : 'Nomi'}</th>
                                        {scope !== 'students' && <th className="px-4 py-3 text-center">Qamrov</th>}
                                        <th className="px-4 py-3 text-center">Ishtirok</th>
                                        <th className="px-4 py-3 text-center">1</th>
                                        <th className="px-4 py-3 text-center">2</th>
                                        <th className="px-4 py-3 text-center">3</th>
                                        <th className="px-4 py-3 text-right">Ball</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {scopeRows.map((r, i) => {
                                        const isMe = scope === 'students' && r.studentId === user?.username;
                                        return (
                                            <tr key={scope === 'students' ? r.studentId : (r.key || `_${i}`)} className={isMe ? 'bg-amber-50' : ''}>
                                                <td className="px-4 py-3 text-gray-400 font-semibold">{i + 1}</td>
                                                <td className="px-4 py-3 font-bold text-gray-900">{scopeLabel(r)}{isMe ? ' (siz)' : ''}</td>
                                                {scope !== 'students' && <td className="px-4 py-3 text-center font-semibold text-indigo-600">{fmtPct(r.coveragePercent)}</td>}
                                                <td className="px-4 py-3 text-center text-gray-500">{r.participationCount ?? r.totalParticipation}</td>
                                                <td className="px-4 py-3 text-center">{r.firstPlaces || ''}</td>
                                                <td className="px-4 py-3 text-center">{r.secondPlaces || ''}</td>
                                                <td className="px-4 py-3 text-center">{r.thirdPlaces || ''}</td>
                                                <td className="px-4 py-3 text-right font-black text-gray-900">{r.totalPoints}</td>
                                            </tr>
                                        );
                                    })}
                                    {scopeRows.length === 0 && (
                                        <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">Ma'lumot yo'q</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            <ActivityQuickViewModal
                entry={quickViewEntry}
                onClose={() => setQuickViewEntry(null)}
                user={user}
                hasClubRole={hasClubRole}
                clubNameById={clubNameById}
            />
        </div>
    );
};

export default EventCollectionDetailStudentPage;
