import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Layers, RefreshCw, Download, Plus, Trash2, Calendar, Users,
    Trophy, TrendingUp, GraduationCap, UserCheck, ChevronRight, X, Info, LogIn
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { useTabParam } from '../../hooks/useTabParam';
import { exportRowsToExcel } from '../../utils/exportToExcel';
import {
    COLLECTION_STATUS, COLLECTION_STATUS_LABELS, CONTRIBUTION_TYPES, CONTRIBUTION_TYPE_LABELS,
    TIE_BREAK_FIELDS, DEFAULT_TIE_BREAK_ORDER, mergeScoringConfig,
} from '../../config/eventCollections.js';

const TAB_IDS = ['overview', 'activities', 'ranking', 'settings'];
const TABS = [
    { id: 'overview', label: "Umumiy ko'rinish" },
    { id: 'activities', label: 'Faoliyatlar' },
    { id: 'ranking', label: 'Reyting' },
    { id: 'settings', label: 'Sozlamalar' },
];
const SCOPE_IDS = ['students', 'faculties', 'tutors', 'courses', 'groups'];
const SCOPES = [
    { id: 'students', label: 'Talabalar' },
    { id: 'faculties', label: 'Fakultetlar' },
    { id: 'tutors', label: 'Tyutorlar' },
    { id: 'courses', label: 'Kurslar' },
    { id: 'groups', label: 'Guruhlar' },
];
const STATUS_VARIANTS = { DRAFT: 'default', ACTIVE: 'success', COMPLETED: 'info', ARCHIVED: 'default' };
const ROW_STATUS_LABELS = { upcoming: 'Ochilmagan', ongoing: 'Davom etmoqda', closed: 'Yakunlangan' };
const ROW_STATUS_VARIANTS = { upcoming: 'info', ongoing: 'success', closed: 'default' };
const fmtPct = (v) => v == null ? '—' : `${v.toFixed(1)}%`;
const fmtNum = (v) => (v || 0).toLocaleString('uz-UZ');

// Ko'p-tadbirli loyiha (festival, hafталik va h.k.) - mavjud Tadbir/Musobaqa
// modullarini o'zgartirmasdan, ularni ixtiyoriy ravishda birlashtirib umumiy
// statistika/reyting ko'rsatadigan qatlam. Hech narsa oldindan hisoblab
// saqlanmaydi - har ochilganda db.getEventCollectionAnalytics joriy
// ma'lumotdan qayta hisoblaydi (shuning uchun "Qayta hisoblash" faqat qayta-sync).
const EventCollectionDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [tab, setTab] = useTabParam(TAB_IDS, 'overview');
    const [scope, setScope] = useTabParam(SCOPE_IDS, 'students', 'scope');
    const [version, setVersion] = useState(0);
    const bump = () => setVersion(v => v + 1);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const analytics = useMemo(() => db.getEventCollectionAnalytics(id), [id, version]);

    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [drill, setDrill] = useState(null); // { row, scope } yoki null - talaba HAM, fakultet/tyutor/kurs/guruh HAM

    if (!analytics) {
        return (
            <Card className="p-12 text-center text-gray-400">
                To'plam topilmadi.
                <div className="mt-4"><Button variant="outline" onClick={() => navigate('/admin/event-collections')}>Orqaga</Button></div>
            </Card>
        );
    }
    const { collection, config, overview, activityRows, studentRows, facultyRows, tutorRows, courseRows, groupRows, dailyParticipation } = analytics;

    // Tyutor username -> ko'rinadigan ism (mavjud bo'lsa).
    const tutorNameByUsername = useMemo(() => {
        const map = new Map();
        db.getTutorUsers().forEach(p => map.set(p.username, p.fullName || p.username));
        return map;
    }, [version]);

    const handleRecalculate = async () => {
        setBusy(true); setError('');
        try { await db.recalculateEventCollection(id); bump(); }
        catch (e) { setError(e.message || 'Xatolik yuz berdi'); }
        finally { setBusy(false); }
    };

    const currentScopeRows = ({
        students: studentRows,
        faculties: facultyRows,
        tutors: tutorRows,
        courses: courseRows,
        groups: groupRows,
    })[scope];

    const scopeLabel = (key) => {
        if (scope === 'tutors') return tutorNameByUsername.get(key) || key || "Biriktirilmagan";
        if (scope === 'courses') return `${key}-kurs`;
        return key || "Noma'lum";
    };

    const handleExport = () => {
        if (scope === 'students') {
            exportRowsToExcel(studentRows.map((r, i) => ({
                '#': i + 1, 'F.I.Sh.': r.fullName, Fakultet: r.faculty || '', Kurs: r.course ?? '',
                Guruh: r.group || '', Ishtirok: r.participationCount,
                '1-o\'rin': r.firstPlaces, '2-o\'rin': r.secondPlaces, '3-o\'rin': r.thirdPlaces,
                Ball: r.totalPoints,
            })), { sheetName: 'Talabalar', fileName: `${collection.name} - Talabalar - ${new Date().toLocaleDateString('uz-UZ')}.xlsx` });
            return;
        }
        exportRowsToExcel(currentScopeRows.map((r, i) => ({
            '#': i + 1, Nomi: scopeLabel(r.key), 'Jami talaba': r.totalPopulation ?? '',
            'Unikal ishtirokchi': r.uniqueParticipants, 'Qamrov %': r.coveragePercent != null ? r.coveragePercent.toFixed(1) : '',
            'Jami ishtirok': r.totalParticipation, '1-o\'rin': r.firstPlaces, '2-o\'rin': r.secondPlaces, '3-o\'rin': r.thirdPlaces,
            Ball: r.totalPoints,
        })), { sheetName: SCOPES.find(s => s.id === scope)?.label || 'Reyting', fileName: `${collection.name} - ${scope} - ${new Date().toLocaleDateString('uz-UZ')}.xlsx` });
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 min-w-0">
                    <Button variant="outline" size="sm" icon={ArrowLeft} onClick={() => navigate('/admin/event-collections')} className="rounded-xl shrink-0">
                        Orqaga
                    </Button>
                    <div className="min-w-0">
                        <p className="font-bold text-gray-900 truncate flex items-center gap-2">
                            <Layers size={16} className="text-indigo-500 shrink-0" /> {collection.name}
                            <Badge variant={STATUS_VARIANTS[collection.status] || 'default'} size="sm">
                                {COLLECTION_STATUS_LABELS[collection.status]}
                            </Badge>
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" icon={RefreshCw} onClick={handleRecalculate} disabled={busy}>
                        {busy ? 'Hisoblanmoqda...' : 'Qayta hisoblash'}
                    </Button>
                </div>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}

            <div className="inline-flex bg-white p-1 rounded-2xl border border-gray-100 shadow-sm overflow-x-auto max-w-full">
                {TABS.map(t => (
                    <button
                        key={t.id} type="button" onClick={() => setTab(t.id)}
                        className={`px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                            tab === t.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-gray-500 hover:bg-gray-50'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'overview' && (
                <OverviewTab overview={overview} dailyParticipation={dailyParticipation} scopeLabel={scopeLabel} tutorNameByUsername={tutorNameByUsername} />
            )}

            {tab === 'activities' && (
                <ActivitiesTab
                    collectionId={id} activityRows={activityRows} busy={busy} setBusy={setBusy} setError={setError}
                    bump={bump} isPickerOpen={isPickerOpen} setIsPickerOpen={setIsPickerOpen} user={user}
                    navigate={navigate}
                />
            )}

            {tab === 'ranking' && (
                <RankingTab
                    scope={scope} setScope={setScope} rows={currentScopeRows} scopeLabel={scopeLabel}
                    onExport={handleExport} onRowClick={(row) => setDrill({ row, scope })} tutorNameByUsername={tutorNameByUsername}
                    onManageTutors={() => setTab('settings')}
                />
            )}

            {tab === 'settings' && (
                <SettingsTab
                    collection={collection} config={config} collectionId={id} bump={bump}
                    busy={busy} setBusy={setBusy} setError={setError} user={user}
                    tutorNameByUsername={tutorNameByUsername}
                />
            )}

            {drill && (
                <Modal isOpen onClose={() => setDrill(null)} title={drill.scope === 'students' ? drill.row.fullName : scopeLabel(drill.row.key)} size="sm">
                    {drill.scope === 'students'
                        ? <StudentDrillDown row={drill.row} />
                        : <DimensionDrillDown row={drill.row} />}
                </Modal>
            )}
        </div>
    );
};

// ============================================================================
const KpiCard = ({ icon: Icon, label, value }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
        <Icon size={18} className="mx-auto text-indigo-500 mb-1.5" />
        <p className="text-2xl font-black text-gray-900">{value}</p>
        <p className="text-[11px] text-gray-400 font-bold uppercase mt-0.5">{label}</p>
    </div>
);

const TopCallout = ({ label, name, sub }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <p className="text-[11px] text-gray-400 font-bold uppercase">{label}</p>
        <p className="font-bold text-gray-900 mt-1 truncate">{name || '—'}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
);

const OverviewTab = ({ overview, dailyParticipation, scopeLabel, tutorNameByUsername }) => (
    <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={Calendar} label="Faoliyatlar" value={fmtNum(overview.activityCount)} />
            <KpiCard icon={Users} label="Jami ishtirok" value={fmtNum(overview.totalParticipation)} />
            <KpiCard icon={UserCheck} label="Unikal talabalar" value={fmtNum(overview.uniqueStudents)} />
            <KpiCard icon={TrendingUp} label="Umumiy qamrov" value={fmtPct(overview.coveragePercent)} />
            <KpiCard icon={GraduationCap} label="Fakultetlar" value={fmtNum(overview.facultyCount)} />
            <KpiCard icon={Users} label="Tyutorlar" value={fmtNum(overview.tutorCount)} />
            <KpiCard icon={Users} label="Guruhlar" value={fmtNum(overview.groupCount)} />
            <KpiCard icon={Trophy} label="Berilgan o'rinlar" value={fmtNum(overview.placementsAwarded)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TopCallout label="Eng ko'p ishtirokchi jalb qilgan faoliyat" name={overview.topActivity?.title} sub={overview.topActivity ? `${overview.topActivity.uniqueParticipants} unikal ishtirokchi` : null} />
            <TopCallout label="Eng yuqori qamrovli fakultet" name={overview.topFaculty?.key} sub={overview.topFaculty ? fmtPct(overview.topFaculty.coveragePercent) : null} />
            <TopCallout label="Eng yuqori qamrovli tyutor" name={overview.topTutor ? (tutorNameByUsername.get(overview.topTutor.key) || overview.topTutor.key) : null} sub={overview.topTutor ? fmtPct(overview.topTutor.coveragePercent) : null} />
            <TopCallout label="Eng faol kurs" name={overview.topCourse ? `${overview.topCourse.key}-kurs` : null} sub={overview.topCourse ? `${overview.topCourse.totalPoints} ball` : null} />
            <TopCallout label="Eng faol guruh" name={overview.topGroup?.key} sub={overview.topGroup ? `${overview.topGroup.totalPoints} ball` : null} />
            <TopCallout label="Eng ko'p ball to'plagan talaba" name={overview.topStudent?.fullName} sub={overview.topStudent ? `${overview.topStudent.totalPoints} ball` : null} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
                { key: 'ongoing', label: 'Faol', color: 'text-emerald-600' },
                { key: 'upcoming', label: 'Kutilayotgan', color: 'text-blue-600' },
                { key: 'closed', label: 'Tugallangan', color: 'text-rose-600' },
            ].map(s => (
                <div key={s.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                    <p className={`text-2xl font-black ${s.color}`}>{overview.statusCounts[s.key] || 0}</p>
                    <p className="text-[11px] text-gray-400 font-bold uppercase mt-0.5">{s.label} faoliyat</p>
                </div>
            ))}
        </div>

        {dailyParticipation.length > 0 && (
            <Card>
                <h3 className="font-bold text-gray-900 mb-3">Kunlar kesimida ishtirok</h3>
                <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer>
                        <BarChart data={dailyParticipation}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="participation" name="Jami ishtirok" fill="#6366f1" radius={[6, 6, 0, 0]} />
                            <Bar dataKey="uniqueStudents" name="Unikal talaba" fill="#a5b4fc" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>
        )}
    </div>
);

// ============================================================================
const ActivitiesTab = ({ collectionId, activityRows, busy, setBusy, setError, bump, isPickerOpen, setIsPickerOpen, user, navigate }) => {
    const handleRemove = async (row) => {
        if (!window.confirm(`"${row.title}" to'plamdan chiqarilsinmi? Tadbir/musobaqaning o'zi va natijalari o'zgarmaydi.`)) return;
        setBusy(true); setError('');
        try {
            await db.removeActivityFromCollection({ collectionId, activityType: row.activityType, activityId: row.activityId });
            bump();
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    };

    const handleContributionChange = async (row, contributionType) => {
        setBusy(true); setError('');
        try {
            await db.updateCollectionItemContribution({ collectionId, activityType: row.activityType, activityId: row.activityId, contributionType });
            bump();
        } catch (e) { setError(e.message); } finally { setBusy(false); }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button variant="success" size="sm" icon={Plus} onClick={() => setIsPickerOpen(true)} className="bg-emerald-500 hover:bg-emerald-600">
                    Mavjud tadbir/musobaqani qo'shish
                </Button>
            </div>

            <Card className="p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-[11px] font-bold text-gray-400 uppercase">
                                <th className="px-4 py-3">Nomi</th>
                                <th className="px-4 py-3">Turi</th>
                                <th className="px-4 py-3">Sana</th>
                                <th className="px-4 py-3">Holati</th>
                                <th className="px-4 py-3 text-center">Ishtirok</th>
                                <th className="px-4 py-3 text-center">Unikal</th>
                                <th className="px-4 py-3">Reytingga ta'siri</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {activityRows.map(row => (
                                <tr key={`${row.activityType}_${row.activityId}`} className="hover:bg-slate-50/70">
                                    <td className="px-4 py-3 font-bold text-gray-900">{row.title}</td>
                                    <td className="px-4 py-3">
                                        <Badge variant={row.activityType === 'competition' ? 'primary' : 'default'} size="sm">
                                            {row.activityType === 'competition' ? 'Musobaqa' : 'Tadbir'}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-gray-500">{row.date ? new Date(row.date).toLocaleDateString('uz-UZ') : '—'}</td>
                                    <td className="px-4 py-3">
                                        <Badge variant={ROW_STATUS_VARIANTS[row.statusBucket]} size="sm">{ROW_STATUS_LABELS[row.statusBucket]}</Badge>
                                    </td>
                                    <td className="px-4 py-3 text-center font-semibold text-gray-700">{row.totalParticipation}</td>
                                    <td className="px-4 py-3 text-center font-semibold text-gray-700">{row.uniqueParticipants}</td>
                                    <td className="px-4 py-3">
                                        <select
                                            value={row.contributionType} disabled={busy}
                                            onChange={e => handleContributionChange(row, e.target.value)}
                                            className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
                                        >
                                            {Object.values(CONTRIBUTION_TYPES).map(ct => (
                                                <option key={ct} value={ct}>{CONTRIBUTION_TYPE_LABELS[ct]}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <button
                                                onClick={() => navigate(
                                                    `/admin/${row.activityType === 'competition' ? 'competitions' : 'events'}/${row.activityId}`,
                                                    { state: { from: `/admin/event-collections/${collectionId}?tab=activities` } }
                                                )}
                                                title="Ish maydoniga o'tish"
                                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-indigo-600 hover:text-white hover:bg-indigo-600 rounded-lg bg-indigo-50 transition-colors"
                                            >
                                                <LogIn size={13} /> Ish maydoni
                                            </button>
                                            <button onClick={() => handleRemove(row)} disabled={busy} title="To'plamdan chiqarish" className="p-1.5 text-gray-400 hover:text-red-500 rounded bg-gray-50 hover:bg-red-50 transition-colors">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {activityRows.length === 0 && (
                                <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">Hali faoliyat biriktirilmagan</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {isPickerOpen && (
                <ActivityPickerModal
                    collectionId={collectionId} onClose={() => setIsPickerOpen(false)}
                    onAdded={() => { setIsPickerOpen(false); bump(); }} user={user} setError={setError}
                />
            )}
        </div>
    );
};

const ActivityPickerModal = ({ collectionId, onClose, onAdded, user, setError }) => {
    const [activityType, setActivityType] = useState('event');
    const [search, setSearch] = useState('');
    const [contributionType, setContributionType] = useState('participation');
    // Tadbir va musobaqa uchun ALOHIDA to'plam - turini almashtirganda avvalgi
    // tanlanganlar o'chib qolmasin (bir nechta musobaqa, keyin bir nechta tadbir
    // tanlab, hammasini BIR YO'LA qo'shish mumkin bo'lsin).
    const [selectedEvents, setSelectedEvents] = useState(() => new Set());
    const [selectedCompetitions, setSelectedCompetitions] = useState(() => new Set());
    const [adding, setAdding] = useState(false);

    const selected = activityType === 'event' ? selectedEvents : selectedCompetitions;
    const setSelected = activityType === 'event' ? setSelectedEvents : setSelectedCompetitions;
    const totalSelected = selectedEvents.size + selectedCompetitions.size;

    const candidates = useMemo(
        () => db.getAvailableActivitiesForCollection(collectionId, { activityType, search }),
        [collectionId, activityType, search]
    );

    const toggle = (id) => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const toggleAll = () => setSelected(prev =>
        prev.size === candidates.length ? new Set() : new Set(candidates.map(c => c.id))
    );

    const handleAddSelected = async () => {
        if (totalSelected === 0) return;
        setAdding(true);
        try {
            // Ketma-ket - ba'zi biriktiruvlar muvaffaqiyatli, birortasi xato bersa ham
            // qaysi biri qo'shilganini yo'qotmaslik uchun (Promise.all bo'lsa hammasi
            // bekor bo'lgandek ko'rinardi, aslida ba'zilari yozilgan bo'lardi).
            for (const activityId of selectedEvents) {
                await db.addActivityToCollection({ collectionId, activityType: 'event', activityId, contributionType, addedBy: user?.username || 'admin' });
            }
            for (const activityId of selectedCompetitions) {
                await db.addActivityToCollection({ collectionId, activityType: 'competition', activityId, contributionType, addedBy: user?.username || 'admin' });
            }
            onAdded();
        } catch (e) { setError(e.message); } finally { setAdding(false); }
    };

    return (
        <Modal isOpen onClose={onClose} title="Mavjud tadbir/musobaqani qo'shish" size="md">
            <div className="space-y-4">
                <div className="flex gap-2">
                    <div className="flex bg-gray-100 rounded-xl p-1">
                        {[['event', 'Tadbir'], ['competition', 'Musobaqa']].map(([v, l]) => {
                            const count = v === 'event' ? selectedEvents.size : selectedCompetitions.size;
                            return (
                                <button key={v} type="button" onClick={() => setActivityType(v)}
                                    className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${activityType === v ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>
                                    {l}{count > 0 ? ` (${count})` : ''}
                                </button>
                            );
                        })}
                    </div>
                    <select value={contributionType} onChange={e => setContributionType(e.target.value)} className="px-2.5 py-2 border border-gray-200 rounded-xl text-xs bg-white flex-1">
                        {Object.values(CONTRIBUTION_TYPES).map(ct => (
                            <option key={ct} value={ct}>{CONTRIBUTION_TYPE_LABELS[ct]}</option>
                        ))}
                    </select>
                </div>
                <p className="text-xs text-gray-400 -mt-1">Tanlangan barchasi shu bitta "Reytingga ta'siri" bilan qo'shiladi - keyin Faoliyatlar jadvalida har birini alohida ham o'zgartirish mumkin.</p>
                <input
                    type="text" placeholder="Qidirish..." value={search} onChange={e => setSearch(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
                {candidates.length > 0 && (
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={selected.size === candidates.length} onChange={toggleAll} className="accent-indigo-600" />
                        Barchasini tanlash ({candidates.length})
                    </label>
                )}
                <div className="max-h-72 overflow-y-auto space-y-1.5">
                    {candidates.map(c => (
                        <label key={c.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="accent-indigo-600 shrink-0" />
                            <div className="min-w-0">
                                <p className="font-semibold text-sm text-gray-900 truncate">{c.title}</p>
                                {c.date && <p className="text-xs text-gray-400">{new Date(c.date).toLocaleDateString('uz-UZ')}</p>}
                            </div>
                        </label>
                    ))}
                    {candidates.length === 0 && <p className="text-center py-8 text-sm text-gray-400">Topilmadi</p>}
                </div>
                <Button variant="primary" className="w-full" disabled={totalSelected === 0 || adding} onClick={handleAddSelected}>
                    {adding ? 'Qo\'shilmoqda...' : `Tanlanganlarni qo'shish${totalSelected ? ` (${totalSelected})` : ''}`}
                </Button>
            </div>
        </Modal>
    );
};

// ============================================================================
const RankingTab = ({ scope, setScope, rows, scopeLabel, onExport, onRowClick, tutorNameByUsername, onManageTutors }) => {
    const [search, setSearch] = useState('');
    const q = search.trim().toLowerCase();
    const filteredRows = q
        ? rows.filter(r => (scope === 'students' ? r.fullName : scopeLabel(r.key)).toLowerCase().includes(q)
            || (scope === 'students' && (r.faculty || '').toLowerCase().includes(q))
            || (scope === 'students' && (r.group || '').toLowerCase().includes(q))
            || (scope === 'students' && (r.studentId || '').toLowerCase().includes(q)))
        : rows;

    return (
    <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
                {SCOPES.map(s => (
                    <button key={s.id} type="button" onClick={() => { setScope(s.id); setSearch(''); }}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                            scope === s.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}>
                        {s.label}
                    </button>
                ))}
            </div>
            <div className="flex gap-2">
                <input
                    type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder={scope === 'students' ? "F.I.Sh. yoki Student ID..." : "Qidirish..."}
                    className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs w-48"
                />
                {scope === 'tutors' && (
                    <Button variant="outline" size="sm" onClick={onManageTutors}>Guruh biriktiruvlari</Button>
                )}
                <Button variant="outline" size="sm" icon={Download} onClick={onExport}>Excel</Button>
            </div>
        </div>

        <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-slate-50 text-[11px] font-bold text-gray-400 uppercase">
                            <th className="px-4 py-3">№</th>
                            <th className="px-4 py-3">{scope === 'students' ? 'Talaba' : 'Nomi'}</th>
                            {scope === 'students' && <><th className="px-4 py-3">Fakultet</th><th className="px-4 py-3">Kurs</th><th className="px-4 py-3">Guruh</th></>}
                            {scope !== 'students' && <><th className="px-4 py-3 text-center">Jami talaba</th><th className="px-4 py-3 text-center">Unikal</th><th className="px-4 py-3 text-center">Qamrov</th></>}
                            <th className="px-4 py-3 text-center">Ishtirok</th>
                            <th className="px-4 py-3 text-center">1</th>
                            <th className="px-4 py-3 text-center">2</th>
                            <th className="px-4 py-3 text-center">3</th>
                            <th className="px-4 py-3 text-right">Ball</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {filteredRows.map((r, i) => (
                            <tr key={scope === 'students' ? r.studentId : (r.key || `_${i}`)}
                                className="hover:bg-slate-50/70 cursor-pointer"
                                onClick={() => onRowClick(r)}
                            >
                                <td className="px-4 py-3 text-gray-400 font-semibold">{i + 1}</td>
                                <td className="px-4 py-3 font-bold text-gray-900">
                                    {scope === 'students' ? r.fullName : scopeLabel(r.key)}
                                </td>
                                {scope === 'students' && <>
                                    <td className="px-4 py-3 text-gray-500">{r.faculty || '—'}</td>
                                    <td className="px-4 py-3 text-gray-500">{r.course ?? '—'}</td>
                                    <td className="px-4 py-3 text-gray-500">{r.group || '—'}</td>
                                </>}
                                {scope !== 'students' && <>
                                    <td className="px-4 py-3 text-center text-gray-500">{r.totalPopulation ?? '—'}</td>
                                    <td className="px-4 py-3 text-center text-gray-500">{r.uniqueParticipants}</td>
                                    <td className="px-4 py-3 text-center font-semibold text-indigo-600">{fmtPct(r.coveragePercent)}</td>
                                </>}
                                <td className="px-4 py-3 text-center text-gray-500">{r.participationCount ?? r.totalParticipation}</td>
                                <td className="px-4 py-3 text-center">{r.firstPlaces || ''}</td>
                                <td className="px-4 py-3 text-center">{r.secondPlaces || ''}</td>
                                <td className="px-4 py-3 text-center">{r.thirdPlaces || ''}</td>
                                <td className="px-4 py-3 text-right font-black text-gray-900">{r.totalPoints}</td>
                            </tr>
                        ))}
                        {filteredRows.length === 0 && (
                            <tr><td colSpan={10} className="text-center py-12 text-gray-400 text-sm">Ma'lumot topilmadi</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    </div>
    );
};

const StudentDrillDown = ({ row }) => (
    <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-center mb-2">
            <div className="bg-gray-50 rounded-xl p-2.5"><p className="text-lg font-black text-gray-900">{row.participationCount}</p><p className="text-[10px] text-gray-400 font-bold uppercase">Ishtirok</p></div>
            <div className="bg-gray-50 rounded-xl p-2.5"><p className="text-lg font-black text-gray-900">{row.firstPlaces + row.secondPlaces + row.thirdPlaces}</p><p className="text-[10px] text-gray-400 font-bold uppercase">O'rinlar</p></div>
            <div className="bg-indigo-50 rounded-xl p-2.5"><p className="text-lg font-black text-indigo-600">{row.totalPoints}</p><p className="text-[10px] text-gray-400 font-bold uppercase">Jami ball</p></div>
        </div>
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {row.breakdown.map((b, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate">{b.title}{b.isTeam ? ' (jamoa)' : ''}</p>
                        <p className="text-xs text-gray-400">
                            {b.place ? `${b.place}-o'rin` : 'Ishtirok'}
                            {b.isTeam && b.place && ' — jamoa balliga kiradi, shaxsiy balga kiritilmadi'}
                        </p>
                    </div>
                    <span className="font-bold text-gray-900 shrink-0">+{b.placementPoints + b.participationPoints}</span>
                </div>
            ))}
        </div>
    </div>
);

// Fakultet/tyutor/kurs/guruh uchun ham xuddi shu drill-down (20-band): qaysi
// faoliyatdan qancha ball kelgani, bitta faoliyat bo'yicha bitta qatorga
// yig'ilgan holda (aks holda ko'p a'zoli faoliyat necha marta takrorlanib chiqardi).
const DimensionDrillDown = ({ row }) => (
    <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-center mb-2">
            <div className="bg-gray-50 rounded-xl p-2.5"><p className="text-lg font-black text-gray-900">{row.uniqueParticipants}</p><p className="text-[10px] text-gray-400 font-bold uppercase">Unikal talaba</p></div>
            <div className="bg-gray-50 rounded-xl p-2.5"><p className="text-lg font-black text-gray-900">{fmtPct(row.coveragePercent)}</p><p className="text-[10px] text-gray-400 font-bold uppercase">Qamrov</p></div>
            <div className="bg-indigo-50 rounded-xl p-2.5"><p className="text-lg font-black text-indigo-600">{row.totalPoints}</p><p className="text-[10px] text-gray-400 font-bold uppercase">Jami ball</p></div>
        </div>
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {(row.breakdown || []).map((b, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate">{b.title}</p>
                        <p className="text-xs text-gray-400">{b.participants} ishtirokchi{b.place ? ` — ${b.place}-o'rin` : ''}</p>
                    </div>
                    <span className="font-bold text-gray-900 shrink-0">+{b.placementPoints + b.participationPoints}</span>
                </div>
            ))}
            {(!row.breakdown || row.breakdown.length === 0) && (
                <p className="text-center py-8 text-sm text-gray-400">Ma'lumot yo'q</p>
            )}
        </div>
        {row.coveragePoints > 0 && (
            <div className="flex items-center justify-between px-3 py-2.5 text-sm bg-emerald-50 rounded-xl">
                <span className="font-semibold text-emerald-800">Qamrov bonusi</span>
                <span className="font-bold text-emerald-800">+{row.coveragePoints}</span>
            </div>
        )}
    </div>
);

// ============================================================================
const SettingsTab = ({ collection, config, collectionId, bump, busy, setBusy, setError, user, tutorNameByUsername }) => {
    const [form, setForm] = useState({
        name: collection.name, description: collection.description || '',
        startDate: collection.startDate || '', endDate: collection.endDate || '', status: collection.status,
    });
    const [scoring, setScoring] = useState(config);
    const [isTutorModalOpen, setIsTutorModalOpen] = useState(false);

    const saveGeneral = async () => {
        setBusy(true); setError('');
        try { await db.updateEventCollection(collectionId, form); bump(); }
        catch (e) { setError(e.message); } finally { setBusy(false); }
    };

    const saveScoring = async () => {
        setBusy(true); setError('');
        try { await db.updateEventCollectionScoringConfig({ collectionId, scoringConfig: scoring, changedBy: user?.username || 'admin' }); bump(); }
        catch (e) { setError(e.message); } finally { setBusy(false); }
    };

    const placementEntries = Object.entries(scoring.placementPoints).sort((a, b) => Number(a[0]) - Number(b[0]));
    const nextPlaceNumber = placementEntries.length ? Math.max(...placementEntries.map(([k]) => Number(k))) + 1 : 1;

    const moveTieBreak = (index, dir) => {
        const order = [...scoring.tieBreakOrder];
        const j = index + dir;
        if (j < 0 || j >= order.length) return;
        [order[index], order[j]] = [order[j], order[index]];
        setScoring(s => ({ ...s, tieBreakOrder: order }));
    };

    return (
        <div className="space-y-4">
            <Card>
                <h3 className="font-bold text-gray-900 mb-4">Umumiy</h3>
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Nomi</label>
                        <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Tavsif</label>
                        <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Boshlanish</label>
                            <input type="date" value={form.startDate || ''} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Tugash</label>
                            <input type="date" value={form.endDate || ''} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Status</label>
                            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
                                {Object.values(COLLECTION_STATUS).map(s => <option key={s} value={s}>{COLLECTION_STATUS_LABELS[s]}</option>)}
                            </select>
                        </div>
                    </div>
                    <Button variant="primary" size="sm" disabled={busy} onClick={saveGeneral}>Saqlash</Button>
                </div>
            </Card>

            <Card>
                <h3 className="font-bold text-gray-900 mb-4">Reyting - o'rinlar bo'yicha ball</h3>
                <div className="space-y-2">
                    {placementEntries.map(([place, points]) => (
                        <div key={place} className="flex items-center gap-2">
                            <span className="w-20 text-sm font-semibold text-gray-600">{place}-o'rin</span>
                            <input type="number" value={points}
                                onChange={e => setScoring(s => ({ ...s, placementPoints: { ...s.placementPoints, [place]: Number(e.target.value) } }))}
                                className="w-24 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm" />
                            <button onClick={() => setScoring(s => { const p = { ...s.placementPoints }; delete p[place]; return { ...s, placementPoints: p }; })}
                                className="p-1.5 text-gray-400 hover:text-red-500 rounded"><X size={14} /></button>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => setScoring(s => ({ ...s, placementPoints: { ...s.placementPoints, [nextPlaceNumber]: 1 } }))}
                        className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 mt-1"
                    >
                        <Plus size={13} /> O'rin qo'shish
                    </button>
                </div>
            </Card>

            <Card>
                <h3 className="font-bold text-gray-900 mb-4">Ishtirok va qamrov</h3>
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-semibold text-gray-600 w-56">Ishtirok uchun ball</label>
                        <input type="number" value={scoring.participationPoints}
                            onChange={e => setScoring(s => ({ ...s, participationPoints: Number(e.target.value) }))}
                            className="w-24 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm" />
                    </div>
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-semibold text-gray-600 w-56">Qamrov hisobga olinsin</label>
                        <input type="checkbox" checked={scoring.coverage.enabled}
                            onChange={e => setScoring(s => ({ ...s, coverage: { ...s.coverage, enabled: e.target.checked } }))}
                            className="w-5 h-5 accent-indigo-600" />
                    </div>
                    {scoring.coverage.enabled && (
                        <>
                            <div className="flex items-center gap-3">
                                <label className="text-sm font-semibold text-gray-600 w-56">Maksimal ball (100% qamrovda)</label>
                                <input type="number" value={scoring.coverage.maxPoints}
                                    onChange={e => setScoring(s => ({ ...s, coverage: { ...s.coverage, maxPoints: Number(e.target.value) } }))}
                                    className="w-24 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm" />
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="text-sm font-semibold text-gray-600 w-56">Hisoblash usuli</label>
                                <select value={scoring.coverage.mode}
                                    onChange={e => setScoring(s => ({ ...s, coverage: { ...s.coverage, mode: e.target.value } }))}
                                    className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white">
                                    <option value="proportional">Qamrov foiziga proporsional</option>
                                    <option value="tiered">Qamrov bosqichlari</option>
                                    <option value="statistics_only">Faqat statistik ko'rsatkich (ball bermaydi)</option>
                                </select>
                            </div>
                        </>
                    )}
                </div>
            </Card>

            <Card>
                <h3 className="font-bold text-gray-900 mb-2">Teng ball holatida tartib</h3>
                <p className="text-xs text-gray-400 mb-3">Yuqoridagi tartib bo'yicha solishtiriladi - birinchisi teng bo'lsa, keyingisiga o'tiladi.</p>
                <div className="space-y-1.5">
                    {scoring.tieBreakOrder.map((field, i) => (
                        <div key={field} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                            <span className="w-5 text-xs font-bold text-gray-400">{i + 1}.</span>
                            <span className="flex-1 text-sm font-semibold text-gray-700">{TIE_BREAK_FIELDS[field] || field}</span>
                            <button disabled={i === 0} onClick={() => moveTieBreak(i, -1)} className="p-1 text-gray-400 hover:text-indigo-600 disabled:opacity-30">↑</button>
                            <button disabled={i === scoring.tieBreakOrder.length - 1} onClick={() => moveTieBreak(i, 1)} className="p-1 text-gray-400 hover:text-indigo-600 disabled:opacity-30">↓</button>
                        </div>
                    ))}
                </div>
                <div className="mt-4">
                    <Button variant="primary" size="sm" disabled={busy} onClick={saveScoring}>Reyting sozlamalarini saqlash</Button>
                </div>
            </Card>

            {collection.settingsHistory?.length > 0 && (
                <Card>
                    <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-1.5"><Info size={15} /> Sozlama tarixi</h3>
                    <div className="space-y-1.5 text-xs text-gray-500">
                        {collection.settingsHistory.slice(0, 10).map((h, i) => (
                            <p key={i}>{new Date(h.changedAt).toLocaleString('uz-UZ')} — <span className="font-semibold">{h.changedBy || 'admin'}</span> tomonidan o'zgartirildi</p>
                        ))}
                    </div>
                </Card>
            )}

            <Card>
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-gray-900">Tyutor - guruh biriktiruvlari</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Platforma darajasida - barcha to'plamlar uchun umumiy</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setIsTutorModalOpen(true)}>Boshqarish</Button>
                </div>
            </Card>

            {isTutorModalOpen && (
                <TutorGroupModal onClose={() => setIsTutorModalOpen(false)} bump={bump} user={user} setError={setError} tutorNameByUsername={tutorNameByUsername} />
            )}
        </div>
    );
};

const TutorGroupModal = ({ onClose, bump, user, setError, tutorNameByUsername }) => {
    const [assignments, setAssignments] = useState(() => db.getTutorGroupAssignments());
    const tutors = useMemo(() => db.getTutorUsers(), []);
    const [tutorUsername, setTutorUsername] = useState('');
    const [groupName, setGroupName] = useState('');
    const [saving, setSaving] = useState(false);

    const refresh = () => setAssignments(db.getTutorGroupAssignments());

    const handleAssign = async () => {
        if (!tutorUsername || !groupName.trim()) return;
        setSaving(true);
        try {
            await db.assignTutorToGroup({ tutorUsername, groupName: groupName.trim(), assignedBy: user?.username || 'admin' });
            setGroupName('');
            refresh(); bump();
        } catch (e) { setError(e.message); } finally { setSaving(false); }
    };

    const handleRemove = async (a) => {
        setSaving(true);
        try { await db.removeTutorGroupAssignment(a.id); refresh(); bump(); }
        catch (e) { setError(e.message); } finally { setSaving(false); }
    };

    return (
        <Modal isOpen onClose={onClose} title="Tyutor - guruh biriktiruvlari" size="md">
            <div className="space-y-4">
                <div className="flex items-end gap-2">
                    <div className="flex-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Tyutor</label>
                        <select value={tutorUsername} onChange={e => setTutorUsername(e.target.value)}
                            className="w-full mt-1 px-2.5 py-2 border border-gray-200 rounded-xl text-sm bg-white">
                            <option value="">Tanlang...</option>
                            {tutors.map(t => <option key={t.id} value={t.username}>{t.fullName || t.username}</option>)}
                        </select>
                    </div>
                    <div className="flex-1">
                        <label className="text-xs font-bold text-gray-500 uppercase">Guruh</label>
                        <input type="text" value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Masalan: OH-10101"
                            className="w-full mt-1 px-2.5 py-2 border border-gray-200 rounded-xl text-sm" />
                    </div>
                    <Button variant="primary" size="sm" disabled={saving} onClick={handleAssign}>Biriktirish</Button>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-xl">
                    {assignments.map(a => (
                        <div key={a.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                            <span><span className="font-semibold">{tutorNameByUsername.get(a.tutorUsername) || a.tutorUsername}</span> → {a.groupName}</span>
                            <button onClick={() => handleRemove(a)} disabled={saving} className="p-1.5 text-gray-400 hover:text-red-500 rounded"><Trash2 size={14} /></button>
                        </div>
                    ))}
                    {assignments.length === 0 && <p className="text-center py-8 text-sm text-gray-400">Hali biriktiruv yo'q</p>}
                </div>
            </div>
        </Modal>
    );
};

export default EventCollectionDetailPage;
