import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
    Building2, Activity, Repeat, Users, GitBranch, TrendingUp, TrendingDown, Minus,
    Search, Download, X, AlertTriangle, Clock, ShieldAlert, Briefcase, Award, FileWarning, Filter, RotateCcw, UserCheck, History, ChevronRight,
    Phone, Mail
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Pagination from '../../components/common/Pagination';
import CopyableId from '../../components/common/CopyableId';
import { SkeletonCard } from '../../components/common/Skeleton';
import { db, POSITION_TYPE_LABELS, POSITION_BADGE_STYLES, OFFICIAL_POSITION_TYPES, INTERNAL_POSITION_TYPES } from '../../services/db';
import * as clubAnalytics from '../../utils/clubAnalytics';
import { useAuth } from '../../contexts/AuthContext';
import { buildShortNameIndex, shortenByName } from '../../utils/clubName';

const ALL_POSITION_TYPES = [...OFFICIAL_POSITION_TYPES, ...INTERNAL_POSITION_TYPES];
// Short labels for the compact "Lavozimdagi talabalar" table only (scoped here, not a rename of the
// shared POSITION_TYPE_LABELS used everywhere else in the app — e.g. ClubRosterCard/PositionAssignPanel
// still show the full "Asosiy koordinator"/"Yordamchi koordinator" names).
const SHORT_POSITION_LABELS = {
    head_coordinator: 'Bosh koord.',
    assistant_coordinator: 'Yordamchi',
    smm: 'SMM',
    media_design: 'Media',
    event_coordinator: 'Tadbir koord.',
    volunteer: 'Volontyor'
};
// Display-only club-name shortener for the same compact table's "Klublar" badges — strips the generic
// trailing words the 42-club roster commonly uses, then hard-truncates as a fallback. Never touches the
// stored club.name itself.
const AUDIT_ACTION_LABELS = {
    ASSIGNED: 'lavozimga tayinlandi', REMOVED: 'lavozimdan olib tashlandi', SUBMITTED: 'lavozimga ariza topshirdi',
    INVITE_INTERVIEW: 'suhbatga taklif qilindi', COORDINATOR_APPROVE: "arizasi koordinator tomonidan tavsiya etildi",
    COORDINATOR_REJECT: "arizasi koordinator tomonidan rad etildi", ADMIN_APPROVE: 'lavozimga admin tomonidan tasdiqlandi',
    ADMIN_REJECT: "arizasi admin tomonidan rad etildi", CANCEL: 'arizani bekor qildi'
};

const DONUT_COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#94A3B8'];
const TREND_META = {
    up: { icon: TrendingUp, label: "o'smoqda", className: 'text-emerald-600' },
    down: { icon: TrendingDown, label: 'pasaymoqda', className: 'text-red-500' },
    flat: { icon: Minus, label: 'barqaror', className: 'text-gray-400' }
};
const WORKLOAD_META = {
    low: { dot: 'bg-emerald-500', variant: 'success', label: 'Normal' },
    medium: { dot: 'bg-amber-500', variant: 'warning', label: 'Yuqori' },
    high: { dot: 'bg-red-500', variant: 'danger', label: 'Kritik' }
};
const TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50, 'all'];

// Filtr tanlagichlarining ko'rinishi - beshtasi bir xil bo'lishi uchun bitta
// joyda. Tailwind sinf qatorlari to'liq yozilgan (interpolatsiya emas):
// qurilish paytidagi skaner faqat tayyor qatorlarni topadi.
const FILTER_SELECT_CLASS = 'px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-2xl text-sm max-w-[190px]';

// Full static class strings per tone (not string-interpolated) — Tailwind's build-time scanner only
// picks up literal class-name tokens, so `bg-${tone}-50` would silently produce no CSS in production.
const KPI_TONE_CLASSES = {
    indigo: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    blue: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    purple: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
};

// KPI cards are clickable when `metric` is given — opens the shared MetricDrawer below with that
// KPI's breakdown (spec follow-up: "faol klublar ustiga bosganda qaysilar ekanligi ko'rinishi kerak").
const KpiCard = ({ icon: Icon, value, label, tone = 'indigo', metric, onOpen }) => {
    const [bg1, bg2, text1, text2] = (KPI_TONE_CLASSES[tone] || KPI_TONE_CLASSES.indigo).split(' ');
    const clickable = !!metric;
    return (
        <button
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onOpen(metric)}
            className={`text-left w-full bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 transition-all ${clickable ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer' : 'cursor-default'}`}
        >
            <div className={`w-10 h-10 rounded-2xl ${bg1} ${bg2} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${text1} ${text2}`} />
            </div>
            <p className="text-2xl font-black text-gray-900 dark:text-gray-100">{value}</p>
            <p className="text-xs text-gray-400 font-bold uppercase mt-0.5">{label}</p>
        </button>
    );
};

const DrawerShell = ({ title, subtitle, onClose, children }) => (
    <div className="fixed inset-0 z-50">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="fixed inset-y-0 right-0 w-[440px] max-w-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
                <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h2>
                    {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
                </div>
                <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <X size={18} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">{children}</div>
        </div>
    </div>
);

// Horizontal segmented gauge (0-1/2 green, 3 amber, 4+ red zones) with a marker at the student's actual
// position count — the drawer's "yuklama diagrammasi". Plain divs, not a recharts widget, since it needs
// to render cleanly inside a narrow 440px drawer without ResponsiveContainer sizing quirks.
const WorkloadGauge = ({ count }) => {
    const max = Math.max(6, count + 1);
    const pct = (v) => Math.min(100, (v / max) * 100);
    const twoPct = pct(2), threePct = pct(3);
    return (
        <div>
            <div className="relative h-3 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 flex">
                <div style={{ width: `${twoPct}%` }} className="bg-emerald-400" />
                <div style={{ width: `${threePct - twoPct}%` }} className="bg-amber-400" />
                <div style={{ width: `${100 - threePct}%` }} className="bg-red-400" />
                <div className="absolute top-0 bottom-0 w-0.5 bg-gray-900 dark:bg-white" style={{ left: `${pct(count)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>0</span>
                <span className="font-bold text-gray-600 dark:text-gray-300">Joriy: {count}</span>
                <span>{max}+</span>
            </div>
        </div>
    );
};

const describeAuditEntry = (log) =>
    `${POSITION_TYPE_LABELS[log.positionTitle] || log.positionTitle || 'Lavozim'}${log.clubName ? ` (${log.clubName})` : ''} — ${AUDIT_ACTION_LABELS[log.action] || log.action}`;

// Right-side drawer for one position-holding student (spec section 7, enriched per direct feedback with
// a workload gauge + cross-club audit trail) — same slide-over idiom as PositionAssignPanel.jsx (Klub
// tarkibi tab) for visual consistency across admin-facing panels.
const StudentDrawer = ({ studentId, onClose }) => {
    const data = useMemo(() => (studentId ? clubAnalytics.getStudentDrawerData(db, studentId) : null), [studentId]);
    if (!studentId || !data) return null;
    const student = data.activePositions[0]?.student;

    return (
        <DrawerShell title={student?.fullName || studentId} subtitle={`${student?.faculty || ''} ${student?.course ? `· ${student.course}-kurs` : ''}`} onClose={onClose}>
            <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Yuklama</h3>
                <WorkloadGauge count={data.workloadIndex} />
            </div>

            <div className="pt-5">
                <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Barcha faol lavozimlari</h3>
                {data.activePositions.length === 0 ? (
                    <p className="text-xs text-gray-400">Faol lavozimi yo'q</p>
                ) : (
                    <div className="space-y-2">
                        {data.activePositions.map(p => (
                            <div key={`${p.clubId}::${p.positionTitle}`} className="px-3 py-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{p.clubName}</span>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${POSITION_BADGE_STYLES[p.positionTitle] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                                        {POSITION_TYPE_LABELS[p.positionTitle] || p.positionTitle}
                                    </span>
                                </div>
                                {p.assignedByName && (
                                    <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                                        <UserCheck size={11} /> Tayinladi: {p.assignedByName}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="pt-5">
                <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Oxirgi 10 ta faoliyat</h3>
                {data.recentActivities.length === 0 ? (
                    <p className="text-xs text-gray-400">Faoliyat tarixi topilmadi</p>
                ) : (
                    <div className="space-y-2">
                        {data.recentActivities.map(a => (
                            <div key={a.id} className="px-3 py-2 rounded-xl border border-gray-100 dark:border-gray-800">
                                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{a.name}</p>
                                <p className="text-[11px] text-gray-400">{a.clubName} · {new Date(a.date).toLocaleDateString('uz-UZ')}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="pt-5">
                <h3 className="text-xs font-bold text-gray-400 uppercase mb-1">Oxirgi faollik sanasi</h3>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {data.lastActivityDate ? new Date(data.lastActivityDate).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' }) : "Ma'lumot yo'q"}
                </p>
            </div>

            <div className="pt-5">
                <h3 className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-1.5">
                    <History size={12} /> Audit log
                </h3>
                {data.auditLog.length === 0 ? (
                    <p className="text-xs text-gray-400">Audit yozuvlari yo'q</p>
                ) : (
                    <div className="space-y-2">
                        {data.auditLog.map(log => (
                            <div key={log.id} className="relative pl-3 border-l-2 border-indigo-100 dark:border-indigo-900">
                                <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-indigo-500" />
                                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-snug">{describeAuditEntry(log)}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">{log.reviewerName || log.reviewer} tomonidan — {new Date(log.time).toLocaleString('uz-UZ')}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </DrawerShell>
    );
};

const METRIC_TITLES = {
    activeClubs: 'Faol klublar',
    activities: 'Jami faoliyatlar',
    participations: 'Jami qatnashuvlar (klublar kesimida)',
    uniqueParticipants: 'Haqiqiy ishtirokchilar',
    crossClubOverlap: 'Cross-club overlap — 2+ klubda faol talabalar',
    bucketOne: '1 klubda faol talabalar',
    bucketTwo: '2 klubda faol talabalar',
    bucketThree: '3 klubda faol talabalar',
    bucketFourPlus: '4+ klubda faol talabalar'
};
const BUCKET_METRIC_TO_KEY = { bucketOne: 'one', bucketTwo: 'two', bucketThree: 'three', bucketFourPlus: 'fourPlus' };
const DRAWER_PAGE_SIZE = 20;

// Search predicate per metric shape — clubs match by name, students match by name/faculty. Keeps the
// drawer usable once the underlying list grows past a few dozen rows (e.g. "1 klubda faol" already has
// 250+ entries with only 550 mock students; a real ~1500-student university would be worse without this).
const drawerRowMatches = (metric, row, q) => {
    if (!q) return true;
    if (metric === 'activeClubs' || metric === 'participations') return row.clubName.toLowerCase().includes(q);
    if (metric === 'activities') return row.name.toLowerCase().includes(q) || (row.clubName || '').toLowerCase().includes(q);
    return row.fullName.toLowerCase().includes(q) || (row.faculty || '').toLowerCase().includes(q);
};

// One shared drawer for all top-KPI + cross-club-bucket drill-downs — content switches on `metric`,
// data comes straight from the matching clubAnalytics.js breakdown function (already filter-aware).
// Search + pagination built in (DRAWER_PAGE_SIZE) so it stays usable as the student body grows.
const MetricDrawer = ({ metric, filters, onClose }) => {
    const [drawerSearch, setDrawerSearch] = useState('');
    const [drawerPage, setDrawerPage] = useState(1);

    const allRows = useMemo(() => {
        if (!metric) return [];
        if (BUCKET_METRIC_TO_KEY[metric]) return clubAnalytics.getCrossClubBucketBreakdown(db, filters, BUCKET_METRIC_TO_KEY[metric]);
        switch (metric) {
            case 'activeClubs': return clubAnalytics.getActiveClubsBreakdown(db, filters);
            case 'activities': return clubAnalytics.getActivitiesBreakdown(db, filters);
            case 'participations': return clubAnalytics.getParticipationsBreakdown(db, filters);
            case 'uniqueParticipants': return clubAnalytics.getUniqueParticipantsBreakdown(db, filters);
            case 'crossClubOverlap': return clubAnalytics.getCrossClubOverlapBreakdown(db, filters);
            default: return [];
        }
    }, [metric, filters]);

    // Reset search/page whenever a different KPI card is opened.
    useEffect(() => { setDrawerSearch(''); setDrawerPage(1); }, [metric]);

    const rows = useMemo(() => {
        const q = drawerSearch.trim().toLowerCase();
        return allRows.filter(r => drawerRowMatches(metric, r, q));
    }, [allRows, metric, drawerSearch]);

    const totalPages = Math.max(1, Math.ceil(rows.length / DRAWER_PAGE_SIZE));
    const page = Math.min(drawerPage, totalPages);
    const visibleRows = rows.slice((page - 1) * DRAWER_PAGE_SIZE, page * DRAWER_PAGE_SIZE);

    if (!metric) return null;

    return (
        <DrawerShell title={METRIC_TITLES[metric]} subtitle={`${allRows.length} ta natija`} onClose={onClose}>
            {allRows.length > 8 && (
                <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Qidirish..."
                        value={drawerSearch}
                        onChange={e => { setDrawerSearch(e.target.value); setDrawerPage(1); }}
                    />
                </div>
            )}

            {rows.length === 0 && <p className="text-xs text-gray-400">Natija topilmadi</p>}

            {metric === 'activeClubs' && visibleRows.map(r => (
                <div key={r.clubId} className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{r.clubName}</span>
                    <div className="flex gap-3 text-xs text-gray-400">
                        <span>{r.membersCount} a'zo</span>
                        <span>{r.activities} faoliyat</span>
                    </div>
                </div>
            ))}

            {metric === 'activities' && visibleRows.map(a => (
                <div key={a.id} className="px-3 py-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{a.name}</p>
                        <Badge variant={a.type === 'competition' ? 'primary' : 'default'} size="sm">{a.type === 'competition' ? 'Musobaqa' : 'Tadbir'}</Badge>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">{a.clubName} · {new Date(a.date).toLocaleDateString('uz-UZ')}</p>
                </div>
            ))}

            {metric === 'participations' && visibleRows.map(r => (
                <div key={r.clubId} className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{r.clubName}</span>
                    <span className="text-sm font-bold text-indigo-600">{r.participations}</span>
                </div>
            ))}

            {metric === 'uniqueParticipants' && visibleRows.map(r => (
                <div key={r.studentId} className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{r.fullName}</p>
                        <p className="text-[11px] text-gray-400">{r.faculty} {r.course ? `· ${r.course}-kurs` : ''}</p>
                    </div>
                    <Badge variant={r.clubsCount >= 2 ? 'primary' : 'default'} size="sm">{r.clubsCount} klub</Badge>
                </div>
            ))}

            {(metric === 'crossClubOverlap' || BUCKET_METRIC_TO_KEY[metric]) && visibleRows.map(r => (
                <div key={r.studentId} className="px-3 py-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{r.fullName}</p>
                        {r.faculty && <span className="text-[11px] text-gray-400 shrink-0">{r.faculty}{r.course ? ` · ${r.course}-kurs` : ''}</span>}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">{r.clubs.join(', ')}</p>
                </div>
            ))}

            {rows.length > DRAWER_PAGE_SIZE && (
                <div className="pt-2">
                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={setDrawerPage}
                        pageSize={DRAWER_PAGE_SIZE}
                        pageSizeOptions={[DRAWER_PAGE_SIZE]}
                        totalItems={rows.length}
                    />
                </div>
            )}
        </DrawerShell>
    );
};

// KLUB ARIZALARI QATORI (band 21/22) - klub tashkil etish/rasmiylashtirish
// modulining o'z tor kesimi. Qolgan katta analitikadan ATAYLAB ajratilgan:
// bu funnel - talaba/tashabbuskor arizasi kimlarga tegishli emas, faqat
// admin arizalarni ko'rib chiqishda kerak. `useNavigate` bilan "Arizalar"
// bosilsa to'g'ridan-to'g'ri ko'rib chiqish sahifasiga o'tadi.
const ClubApplicationsFunnelStrip = () => {
    const navigate = useNavigate();
    const apps = useMemo(() => db.getClubApplications(), []);
    const inReview = apps.filter(a => ['SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUIRED', 'RESUBMITTED', 'EXPERT_REVIEW', 'PENDING_APPROVAL'].includes(a.status)).length;
    const approved = apps.filter(a => a.status === 'APPROVED').length;
    const rejected = apps.filter(a => a.status === 'REJECTED').length;
    const registered = useMemo(() => db.getClubs().filter(c => c.registrationStatus === 'REGISTERED').length, []);

    const items = [
        { label: 'Jami arizalar', value: apps.length },
        { label: "Ko'rib chiqilmoqda", value: inReview },
        { label: 'Tasdiqlangan', value: approved },
        { label: 'Rad etilgan', value: rejected },
        { label: "Ro'yxatdan o'tgan klublar", value: registered },
    ];

    return (
        <button
            type="button" onClick={() => navigate('/admin/clubs/applications')}
            className="w-full text-left bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 flex flex-wrap items-center gap-x-8 gap-y-2 hover:border-indigo-200 transition-colors"
        >
            <span className="text-xs font-black text-gray-400 uppercase tracking-wide">Klub arizalari</span>
            {items.map(it => (
                <span key={it.label} className="text-sm">
                    <span className="font-black text-gray-900 dark:text-gray-100 tabular-nums">{it.value}</span>{' '}
                    <span className="text-gray-500">{it.label}</span>
                </span>
            ))}
        </button>
    );
};

// "Klublar analitikasi" — admin/rahbariyat-only derived analytics workspace (spec, 12 sections). Every
// number is computed by src/utils/clubAnalytics.js from existing db.js data — no new data model, no
// changes to registration/scoring/attendance/certificate logic anywhere in the app.
const ClubsAnalyticsTab = () => {
    // Ko'ruvchi KIMLIGI kerak: aloqa ustuni pasportdagi maxfiylik qoidasiga
    // bo'ysunadi va u ko'ruvchiga qarab hal qilinadi (bu sahifani ham
    // administrator, ham rahbariyat ochadi).
    const { user } = useAuth();
    // Klubning O'Z qisqa nomi bo'lsa taxmin qilinmaydi (izohi
    // utils/clubName.js da). Jadvalda faqat nom bor, shuning uchun
    // nom → qisqa nom jadvali kerak.
    const clubShortNames = useMemo(() => buildShortNameIndex(db.getClubs()), []);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const t = setTimeout(() => setLoading(false), 350);
        return () => clearTimeout(t);
    }, []);

    // Global scope filters — every section below recomputes against these (spec follow-up: "barcha
    // klublar kesimida, yoki qaysidur klub kesimida... fakultet kesimida, kurs kesimida ko'rish").
    const [clubId, setClubId] = useState('');
    const [faculty, setFaculty] = useState('');
    const [course, setCourse] = useState('');
    const filters = useMemo(() => ({
        clubId: clubId || undefined,
        faculty: faculty || undefined,
        course: course || undefined
    }), [clubId, faculty, course]);
    const hasActiveFilters = !!(clubId || faculty || course);

    const allClubs = useMemo(() => db.getClubs(), []);
    const facultyOptions = useMemo(() => clubAnalytics.getFacultyOptions(db), []);
    const courseOptions = useMemo(() => clubAnalytics.getCourseOptions(), []);

    const kpis = useMemo(() => clubAnalytics.getUniversityKPIs(db, filters), [filters]);
    const trend = useMemo(() => clubAnalytics.getParticipationTrend(db, filters), [filters]);
    const donut = useMemo(() => clubAnalytics.getClubShareDonut(db, filters), [filters]);
    const clubTable = useMemo(() => clubAnalytics.getClubAnalyticsTable(db, filters), [filters]);
    const crossClubBuckets = useMemo(() => clubAnalytics.getCrossClubBuckets(db, filters), [filters]);
    const orgKpis = useMemo(() => clubAnalytics.getOrgAnalyticsKPIs(db, filters), [filters]);
    const holdersTable = useMemo(() => clubAnalytics.getPositionHoldersTable(db, filters), [filters]);
    const alerts = useMemo(() => clubAnalytics.getAnalyticsAlerts(db, filters), [filters]);

    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState('participations');
    const [sortDir, setSortDir] = useState('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(TABLE_PAGE_SIZE_OPTIONS[0]);
    const [selectedStudentId, setSelectedStudentId] = useState(null);
    const [openMetric, setOpenMetric] = useState(null);

    const [holdersSearch, setHoldersSearch] = useState('');
    const [holdersPositionFilter, setHoldersPositionFilter] = useState('');
    // Qo'shimcha filtrlar. Lavozim turi yagona filtr edi, lekin amaliy
    // savollar boshqacha: "shu klubda kim lavozimda", "qaysi 1-kurschilar
    // rahbarlikda", "kim ortiqcha yuklangan".
    const [holdersClubFilter, setHoldersClubFilter] = useState('');
    const [holdersFacultyFilter, setHoldersFacultyFilter] = useState('');
    const [holdersCourseFilter, setHoldersCourseFilter] = useState('');
    const [holdersWorkloadFilter, setHoldersWorkloadFilter] = useState('');
    const [holdersPage, setHoldersPage] = useState(1);

    // Filtr ro'yxatlari JADVALNING O'ZIDAN chiqariladi, umumiy ma'lumotnomadan
    // emas: tanlab bo'lmaydigan variant ko'rsatish foydalanuvchini aldaydi.
    const holdersFilterOptions = useMemo(() => {
        const clubs = new Set();
        const faculties = new Set();
        const courses = new Set();
        holdersTable.forEach(h => {
            h.entries.forEach(e => { if (e.clubName) clubs.add(e.clubName); });
            if (h.student?.faculty) faculties.add(h.student.faculty);
            if (h.student?.course) courses.add(Number(h.student.course));
        });
        return {
            clubs: Array.from(clubs).sort(),
            faculties: Array.from(faculties).sort(),
            courses: Array.from(courses).sort((a, b) => a - b),
        };
    }, [holdersTable]);

    const holdersFiltersActive = !!(holdersSearch || holdersPositionFilter || holdersClubFilter
        || holdersFacultyFilter || holdersCourseFilter || holdersWorkloadFilter);

    const resetHoldersFilters = () => {
        setHoldersSearch(''); setHoldersPositionFilter(''); setHoldersClubFilter('');
        setHoldersFacultyFilter(''); setHoldersCourseFilter(''); setHoldersWorkloadFilter('');
        setHoldersPage(1);
    };

    const filteredHoldersTable = useMemo(() => {
        const q = holdersSearch.trim().toLowerCase();
        let rows = holdersTable;
        if (q) rows = rows.filter(h => (h.student?.fullName || h.studentId).toLowerCase().includes(q) || (h.student?.faculty || '').toLowerCase().includes(q));
        if (holdersPositionFilter) rows = rows.filter(h => h.entries.some(e => e.positionTitle === holdersPositionFilter));
        if (holdersClubFilter) rows = rows.filter(h => h.entries.some(e => e.clubName === holdersClubFilter));
        if (holdersFacultyFilter) rows = rows.filter(h => h.student?.faculty === holdersFacultyFilter);
        if (holdersCourseFilter) rows = rows.filter(h => String(h.student?.course) === holdersCourseFilter);
        if (holdersWorkloadFilter) rows = rows.filter(h => h.workloadLevel === holdersWorkloadFilter);
        return rows;
    }, [holdersTable, holdersSearch, holdersPositionFilter, holdersClubFilter,
        holdersFacultyFilter, holdersCourseFilter, holdersWorkloadFilter]);
    const holdersTotalPages = Math.max(1, Math.ceil(filteredHoldersTable.length / TABLE_PAGE_SIZE_OPTIONS[0]));
    const holdersCurrentPage = Math.min(holdersPage, holdersTotalPages);
    const visibleHoldersTable = filteredHoldersTable.slice(
        (holdersCurrentPage - 1) * TABLE_PAGE_SIZE_OPTIONS[0], holdersCurrentPage * TABLE_PAGE_SIZE_OPTIONS[0]
    );

    // Aloqa faqat KO'RINAYOTGAN qatorlar uchun o'qiladi. Butun ro'yxat uchun
    // o'qish 550 ta pasportni ochish demakdir va sahifani sekinlashtirardi.
    const holdersContacts = useMemo(
        () => new Map(visibleHoldersTable.map(h => [h.studentId, db.getStudentContact(h.studentId, user)])),
        [visibleHoldersTable, user]
    );

    const filteredTable = useMemo(() => {
        const q = search.trim().toLowerCase();
        const rows = q ? clubTable.filter(r => r.clubName.toLowerCase().includes(q) || String(r.displayNumber) === q) : clubTable;
        const sorted = [...rows].sort((a, b) => {
            let av = a[sortField], bv = b[sortField];
            if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [clubTable, search, sortField, sortDir]);

    const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filteredTable.length / pageSize));
    const page = Math.min(currentPage, totalPages);
    const visibleTable = pageSize === 'all' ? filteredTable : filteredTable.slice((page - 1) * pageSize, page * pageSize);

    const handleSort = (field) => {
        if (sortField === field) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortField(field); setSortDir('desc'); }
    };

    const handleResetFilters = () => { setClubId(''); setFaculty(''); setCourse(''); };

    const handleExportCSV = () => {
        const headers = ['Klub', 'Faoliyatlar', 'Jami qatnashuvlar', "Haqiqiy ishtirokchilar", 'Samaradorlik (%)', 'Trend'];
        const rows = filteredTable.map(r => [r.clubName, r.activities, r.participations, r.uniqueParticipants, r.efficiency, TREND_META[r.trend].label]);
        const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `klublar_analitikasi_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
    };

    const handleExportXLSX = () => {
        const data = filteredTable.map(r => ({
            Klub: r.clubName, Faoliyatlar: r.activities, 'Jami qatnashuvlar': r.participations,
            "Haqiqiy ishtirokchilar": r.uniqueParticipants, 'Samaradorlik (%)': r.efficiency, Trend: TREND_META[r.trend].label
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Klublar analitikasi');
        XLSX.writeFile(wb, `klublar_analitikasi_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <SkeletonCard className="h-64" />
                    <SkeletonCard className="h-64" />
                </div>
                <SkeletonCard className="h-80" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <ClubApplicationsFunnelStrip />
            {/* Global scope filters */}
            <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase pr-1">
                    <Filter size={14} /> Kesim
                </div>
                <select
                    value={clubId}
                    onChange={e => setClubId(e.target.value)}
                    className="px-3.5 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-xl text-sm"
                >
                    <option value="">Barcha klublar</option>
                    {allClubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select
                    value={faculty}
                    onChange={e => setFaculty(e.target.value)}
                    className="px-3.5 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-xl text-sm"
                >
                    <option value="">Barcha fakultetlar</option>
                    {facultyOptions.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <select
                    value={course}
                    onChange={e => setCourse(e.target.value)}
                    className="px-3.5 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-xl text-sm"
                >
                    <option value="">Barcha kurslar</option>
                    {courseOptions.map(c => <option key={c} value={c}>{c}-kurs</option>)}
                </select>
                {hasActiveFilters && (
                    <button type="button" onClick={handleResetFilters} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <RotateCcw size={13} /> Tozalash
                    </button>
                )}
            </div>

            {/* 2. University-wide KPIs (clickable — opens breakdown drawer) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <KpiCard icon={Building2} value={kpis.activeClubsCount} label="Faol klublar" metric="activeClubs" onOpen={setOpenMetric} />
                <KpiCard icon={Activity} value={kpis.totalActivities} label="Jami faoliyatlar" tone="emerald" metric="activities" onOpen={setOpenMetric} />
                <KpiCard icon={Repeat} value={kpis.totalParticipations} label="Jami qatnashuvlar" tone="amber" metric="participations" onOpen={setOpenMetric} />
                <KpiCard icon={Users} value={kpis.uniqueParticipants} label="Haqiqiy ishtirokchilar" tone="blue" metric="uniqueParticipants" onOpen={setOpenMetric} />
                <KpiCard icon={GitBranch} value={kpis.crossClubOverlap} label="Cross-club overlap" tone="purple" metric="crossClubOverlap" onOpen={setOpenMetric} />
            </div>

            {/* 3/4. Main table (left, prominent) + trend/donut charts stacked as a right sidebar — per
                direct feedback, swapped from the original stacked-full-width order so the table gets
                the primary position right under the KPIs and the charts fill the sidebar space next to it. */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
                <div className="xl:col-span-2">
                    <Card title="Klublar bo'yicha qamrov" subtitle="Faoliyat, qatnashuv va samaradorlik ko'rsatkichlari">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <div className="relative w-full sm:w-72">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="Klub qidirish..."
                                    value={search}
                                    onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                                />
                            </div>
                            <div className="flex gap-2">
                                <button type="button" onClick={handleExportCSV} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
                                    <Download size={14} /> CSV
                                </button>
                                <button type="button" onClick={handleExportXLSX} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
                                    <Download size={14} /> XLSX
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-gray-900 text-[11px] font-bold text-gray-400 uppercase">
                                        {[
                                            { field: 'clubName', label: 'Klub' },
                                            { field: 'activities', label: 'Faoliyatlar' },
                                            { field: 'participations', label: 'Jami qatnashuvlar' },
                                            { field: 'uniqueParticipants', label: 'Haqiqiy ishtirokchilar' },
                                            { field: 'efficiency', label: 'Samaradorlik' }
                                        ].map(col => (
                                            <th key={col.field} className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSort(col.field)}>
                                                {col.label} {sortField === col.field && (sortDir === 'asc' ? '↑' : '↓')}
                                            </th>
                                        ))}
                                        <th className="px-4 py-3">Trend</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                    {visibleTable.map(row => {
                                        const trendMeta = TREND_META[row.trend];
                                        return (
                                            <tr key={row.clubId} className="hover:bg-slate-50/70 dark:hover:bg-gray-900/50 transition-colors">
                                                <td className="px-4 py-3 font-bold text-gray-900 dark:text-gray-100">{row.clubName}</td>
                                                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.activities}</td>
                                                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.participations}</td>
                                                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.uniqueParticipants}</td>
                                                <td className="px-4 py-3 font-bold text-indigo-600">{row.efficiency}%</td>
                                                <td className={`px-4 py-3 font-semibold flex items-center gap-1.5 ${trendMeta.className}`}>
                                                    <trendMeta.icon size={14} /> {trendMeta.label}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {visibleTable.length === 0 && (
                                        <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Klub topilmadi</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="pt-3">
                            <Pagination
                                currentPage={page}
                                totalPages={totalPages}
                                onPageChange={setCurrentPage}
                                pageSize={pageSize}
                                onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
                                pageSizeOptions={TABLE_PAGE_SIZE_OPTIONS}
                                totalItems={filteredTable.length}
                            />
                        </div>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card title="Qatnashuv trendi" subtitle="Oylar bo'yicha jami qatnashuvlar">
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={trend}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="month" />
                                <YAxis allowDecimals={false} />
                                <Tooltip />
                                <Line type="monotone" dataKey="count" stroke="#4F46E5" strokeWidth={3} dot={{ r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </Card>
                    <Card title="Klublar ulushi" subtitle="Qatnashuvlar bo'yicha taqsimot">
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie data={donut} cx="50%" cy="50%" labelLine={false} outerRadius={75} innerRadius={42} dataKey="value">
                                    {donut.map((entry, index) => <Cell key={entry.name} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />)}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </Card>
                </div>
            </div>

            {/* 5. Cross-club overlap breakdown */}
            <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3">Cross-club faollik</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard icon={Users} value={crossClubBuckets.one} label="1 klubda faol" metric="bucketOne" onOpen={setOpenMetric} />
                    <KpiCard icon={Users} value={crossClubBuckets.two} label="2 klubda faol" tone="blue" metric="bucketTwo" onOpen={setOpenMetric} />
                    <KpiCard icon={Users} value={crossClubBuckets.three} label="3 klubda faol" tone="amber" metric="bucketThree" onOpen={setOpenMetric} />
                    <KpiCard icon={Users} value={crossClubBuckets.fourPlus} label="4+ klubda faol" tone="purple" metric="bucketFourPlus" onOpen={setOpenMetric} />
                </div>
            </div>

            {/* 6. Tashkiliy analitika */}
            <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Tashkiliy analitika</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Lavozimlar, yuklama va arizalar bo'yicha ko'rsatkichlar</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <KpiCard icon={Briefcase} value={orgKpis.positionHolders} label="Lavozimdagi talabalar" />
                    <KpiCard icon={Award} value={orgKpis.activePositions} label="Faol lavozimlar" tone="emerald" />
                    <KpiCard icon={Activity} value={orgKpis.avgWorkload} label="O'rtacha yuklama" tone="blue" />
                    <KpiCard icon={FileWarning} value={orgKpis.pendingApplications} label="Tasdiqlanmagan arizalar" tone="amber" />
                    <KpiCard icon={Clock} value={orgKpis.passivePositions} label="Passiv lavozimlar" tone="purple" />
                </div>
            </div>

            {/* 7. Position holders — compact management table (UI/UX refactor only; sorting/search/
                pagination/export and every underlying calculation are unchanged). Flat table-row layout
                per direct feedback, replacing an earlier profile-card iteration that was too heavy for
                an admin analytics table. */}
            <Card title="Lavozimdagi talabalar" subtitle="Qatorni bosib to'liq ma'lumotni ko'ring">
                <div className="flex flex-wrap items-center gap-2.5 mb-4">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Talaba qidirish..."
                            value={holdersSearch}
                            onChange={e => { setHoldersSearch(e.target.value); setHoldersPage(1); }}
                        />
                    </div>
                    <select
                        value={holdersPositionFilter}
                        onChange={e => { setHoldersPositionFilter(e.target.value); setHoldersPage(1); }}
                        className={FILTER_SELECT_CLASS}
                    >
                        <option value="">Barcha lavozimlar</option>
                        {ALL_POSITION_TYPES.map(t => <option key={t} value={t}>{POSITION_TYPE_LABELS[t]}</option>)}
                    </select>
                    <select
                        value={holdersClubFilter}
                        onChange={e => { setHoldersClubFilter(e.target.value); setHoldersPage(1); }}
                        className={FILTER_SELECT_CLASS}
                    >
                        <option value="">Barcha klublar</option>
                        {holdersFilterOptions.clubs.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select
                        value={holdersFacultyFilter}
                        onChange={e => { setHoldersFacultyFilter(e.target.value); setHoldersPage(1); }}
                        className={FILTER_SELECT_CLASS}
                    >
                        <option value="">Barcha fakultetlar</option>
                        {holdersFilterOptions.faculties.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <select
                        value={holdersCourseFilter}
                        onChange={e => { setHoldersCourseFilter(e.target.value); setHoldersPage(1); }}
                        className={FILTER_SELECT_CLASS}
                    >
                        <option value="">Barcha kurslar</option>
                        {holdersFilterOptions.courses.map(c => <option key={c} value={String(c)}>{c}-kurs</option>)}
                    </select>
                    <select
                        value={holdersWorkloadFilter}
                        onChange={e => { setHoldersWorkloadFilter(e.target.value); setHoldersPage(1); }}
                        className={FILTER_SELECT_CLASS}
                    >
                        <option value="">Har qanday yuklama</option>
                        {Object.entries(WORKLOAD_META).map(([key, meta]) => (
                            <option key={key} value={key}>{meta.label}</option>
                        ))}
                    </select>

                    {holdersFiltersActive && (
                        <button
                            type="button"
                            onClick={resetHoldersFilters}
                            className="px-3 py-2.5 text-xs font-bold text-gray-500 hover:text-indigo-600"
                        >
                            Tozalash ({filteredHoldersTable.length})
                        </button>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-gray-900 text-[11px] font-bold text-gray-400 uppercase">
                                <th className="px-4 py-3">Talaba</th>
                                <th className="px-4 py-3">Aloqa</th>
                                <th className="px-4 py-3">Lavozim turi</th>
                                <th className="px-4 py-3">Klublar</th>
                                <th className="px-4 py-3 text-center">Faoliyatlar</th>
                                <th className="px-4 py-3">Oxirgi faollik</th>
                                <th className="px-4 py-3 text-right">Yuklama</th>
                                <th className="px-2 py-3" aria-hidden="true"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                            {visibleHoldersTable.map(h => {
                                const meta = WORKLOAD_META[h.workloadLevel];
                                const distinctPositions = Array.from(new Set(h.entries.map(e => e.positionTitle)));
                                const distinctClubNames = Array.from(new Set(h.entries.map(e => e.clubName)));
                                const visibleClubNames = distinctClubNames.slice(0, 2);
                                const extraClubCount = distinctClubNames.length - visibleClubNames.length;
                                return (
                                    <tr
                                        key={h.studentId}
                                        onClick={() => setSelectedStudentId(h.studentId)}
                                        className="group hover:bg-slate-50/70 dark:hover:bg-gray-900/50 transition-colors cursor-pointer"
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
                                                    {h.student?.fullName?.charAt(0) || '?'}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-gray-900 dark:text-gray-100 truncate">{h.student?.fullName || h.studentId}</p>
                                                    <p className="text-[11px] text-gray-400 truncate">
                                                        {h.student?.displayNumber && (
                                                            <CopyableId value={`Talaba #${h.student.displayNumber}`}>#{h.student.displayNumber}</CopyableId>
                                                        )}
                                                        {h.student?.course ? ` · ${h.student.course}-kurs` : ''}{h.student?.faculty ? ` · ${h.student.faculty}` : ''}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        {/* Aloqa - pasportdagi bilan BIR XIL cheklovga
                                            bo'ysunadi (izohi db.getStudentContact ustida).
                                            Kiritilmagan bo'lsa `—`, ko'rish huquqi
                                            yo'q bo'lsa ham `—`: ikkalasi ham "bu
                                            yerda raqam yo'q" degani. */}
                                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                            {(() => {
                                                const contact = holdersContacts.get(h.studentId);
                                                if (!contact?.phone && !contact?.email) {
                                                    return contact?.restricted ? (
                                                        <span
                                                            title="Ma'lumot mavjud, lekin sizning ko'rish huquqingiz cheklangan"
                                                            className="text-[11px] text-gray-400 italic"
                                                        >
                                                            yopiq
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-300 dark:text-gray-600">—</span>
                                                    );
                                                }
                                                return (
                                                    <div className="space-y-0.5">
                                                        {contact.phone && (
                                                            <a
                                                                href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}
                                                                className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 hover:text-indigo-600 whitespace-nowrap"
                                                            >
                                                                <Phone size={11} className="shrink-0 text-gray-400" />
                                                                {contact.phone}
                                                            </a>
                                                        )}
                                                        {contact.email && (
                                                            <a
                                                                href={`mailto:${contact.email}`}
                                                                title={contact.email}
                                                                className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-indigo-600"
                                                            >
                                                                <Mail size={11} className="shrink-0 text-gray-400" />
                                                                <span className="truncate max-w-[150px]">{contact.email}</span>
                                                            </a>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1">
                                                {distinctPositions.map(title => (
                                                    <span
                                                        key={title}
                                                        title={POSITION_TYPE_LABELS[title] || title}
                                                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${POSITION_BADGE_STYLES[title] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}
                                                    >
                                                        {SHORT_POSITION_LABELS[title] || POSITION_TYPE_LABELS[title] || title}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap items-center gap-1">
                                                {visibleClubNames.map(name => (
                                                    <span
                                                        key={name}
                                                        title={name}
                                                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                                                    >
                                                        {shortenByName(name, clubShortNames)}
                                                    </span>
                                                ))}
                                                {extraClubCount > 0 && (
                                                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                                                        +{extraClubCount}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{h.activitiesCount}</td>
                                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                            {h.lastActivityDate ? new Date(h.lastActivityDate).toLocaleDateString('uz-UZ') : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <Badge variant={meta.variant} size="sm">
                                                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${meta.dot}`} />
                                                {meta.label}
                                            </Badge>
                                        </td>
                                        <td className="px-2 py-3 text-gray-300 dark:text-gray-600 group-hover:text-indigo-500 transition-colors">
                                            <ChevronRight size={16} />
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredHoldersTable.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                                        {holdersFiltersActive
                                            ? "Filtrlarga mos talaba topilmadi"
                                            : "Hozircha lavozimdagi talabalar yo'q"}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {filteredHoldersTable.length > TABLE_PAGE_SIZE_OPTIONS[0] && (
                    <div className="pt-3">
                        <Pagination
                            currentPage={holdersCurrentPage}
                            totalPages={holdersTotalPages}
                            onPageChange={setHoldersPage}
                            pageSize={TABLE_PAGE_SIZE_OPTIONS[0]}
                            pageSizeOptions={[TABLE_PAGE_SIZE_OPTIONS[0]]}
                            totalItems={filteredHoldersTable.length}
                        />
                    </div>
                )}
            </Card>

            {/* 8. Alerts */}
            <Card title="Ogohlantirishlar">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                        <div className="flex items-center gap-2 mb-2 text-red-600 dark:text-red-400">
                            <ShieldAlert size={16} /> <span className="font-bold text-sm">Yuqori yuklama (4+ rol)</span>
                        </div>
                        {alerts.highWorkload.length === 0 ? (
                            <p className="text-xs text-gray-400">Yo'q</p>
                        ) : (
                            <ul className="space-y-1">
                                {alerts.highWorkload.slice(0, 5).map(h => (
                                    <li key={h.studentId} className="text-xs text-gray-600 dark:text-gray-300">{h.student?.fullName || h.studentId} — {h.positionsCount} rol</li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
                        <div className="flex items-center gap-2 mb-2 text-amber-600 dark:text-amber-400">
                            <Clock size={16} /> <span className="font-bold text-sm">Passiv lavozim (60 kun)</span>
                        </div>
                        {alerts.passivePositions.length === 0 ? (
                            <p className="text-xs text-gray-400">Yo'q</p>
                        ) : (
                            <ul className="space-y-1">
                                {alerts.passivePositions.slice(0, 5).map(h => (
                                    <li key={h.studentId} className="text-xs text-gray-600 dark:text-gray-300">{h.student?.fullName || h.studentId}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30">
                        <div className="flex items-center gap-2 mb-2 text-purple-600 dark:text-purple-400">
                            <AlertTriangle size={16} /> <span className="font-bold text-sm">Vakolat to'planishi (2+ klubda rahbarlik)</span>
                        </div>
                        {alerts.authorityConcentration.length === 0 ? (
                            <p className="text-xs text-gray-400">Yo'q</p>
                        ) : (
                            <ul className="space-y-1">
                                {alerts.authorityConcentration.slice(0, 5).map(h => (
                                    <li key={h.studentId} className="text-xs text-gray-600 dark:text-gray-300">{h.student?.fullName || h.studentId} — {h.leadershipClubs.join(', ')}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </Card>

            <StudentDrawer studentId={selectedStudentId} onClose={() => setSelectedStudentId(null)} />
            <MetricDrawer metric={openMetric} filters={filters} onClose={() => setOpenMetric(null)} />
        </div>
    );
};

export default ClubsAnalyticsTab;
