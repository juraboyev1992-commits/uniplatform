import React, { useState, useEffect, useMemo } from 'react';
import {
    TrendingUp,
    Search,
    Building2,
    Calendar,
    CheckCircle,
    XCircle,
    RotateCcw,
    Eye,
    FileText,
    Award,
    History,
    Users,
    GraduationCap,
    ClipboardList,
    AlertTriangle
} from 'lucide-react';
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis,
    CartesianGrid
} from 'recharts';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import Pagination from '../common/Pagination';
import StudentIndexRoster from './StudentIndexRoster';
import { useAuth } from '../../contexts/AuthContext';
import { db, SOCIAL_APPLICATION_STATUS } from '../../services/db';
import { SOCIAL_REVIEWER_ROLES, PAGINATION } from '../../constants/index.js';

const TABS = [
    { id: 'talabalar', label: 'Talabalar' },
    { id: 'arizalar', label: 'Arizalar' },
    { id: 'tasdiqlash', label: 'Tasdiqlash' },
    { id: 'monitoring', label: 'Monitoring' },
    { id: 'ball-tarixi', label: 'Ball tarixi' },
    { id: 'audit', label: 'Audit' }
];

const STATUS_META = {
    Pending: { label: 'Kutilmoqda', variant: 'primary' },
    Approved: { label: 'Tasdiqlangan', variant: 'success' },
    Rejected: { label: 'Rad etilgan', variant: 'danger' },
    Returned: { label: 'Qaytarilgan', variant: 'warning' }
};

const ACTION_META = {
    SUBMITTED: { label: 'Yuborildi', variant: 'default' },
    APPROVED: { label: 'Tasdiqlandi', variant: 'success' },
    REJECTED: { label: 'Rad etildi', variant: 'danger' },
    RETURNED: { label: 'Qaytarildi', variant: 'warning' }
};

const STAT_ACCENTS = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600'
};

// --- Small presentational leaf components (declared outside the main component so they aren't recreated every render) ---

const StatusBadge = ({ status }) => {
    const meta = STATUS_META[status] || { label: status, variant: 'default' };
    return <Badge variant={meta.variant}>{meta.label}</Badge>;
};

const StatCard = ({ icon: Icon, label, value, accent = 'indigo' }) => (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${STAT_ACCENTS[accent] || STAT_ACCENTS.indigo}`}>
            <Icon size={22} />
        </div>
        <div>
            <p className="text-2xl font-extrabold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{label}</p>
        </div>
    </div>
);

// Shared search/filter/pagination logic for the Arizalar (full history) and Tasdiqlash (locked-to-pending) tabs
const useApplicationsTable = (applications, { lockedStatuses = null } = {}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [facultyFilter, setFacultyFilter] = useState('');
    const [criteriaFilter, setCriteriaFilter] = useState('');
    const [monthFilter, setMonthFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = PAGINATION.DEFAULT_PAGE_SIZE;

    const filtered = useMemo(() => {
        let rows = applications;
        if (lockedStatuses) rows = rows.filter(a => lockedStatuses.includes(a.status));
        else if (statusFilter !== 'ALL') rows = rows.filter(a => a.status === statusFilter);
        if (facultyFilter) rows = rows.filter(a => a.facultyAtSubmission === facultyFilter);
        if (criteriaFilter) rows = rows.filter(a => a.criteriaKey === criteriaFilter);
        if (monthFilter) rows = rows.filter(a => a.submittedAt.slice(0, 7) === monthFilter);
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            rows = rows.filter(a => a.studentFullName.toLowerCase().includes(q) || a.studentId.toLowerCase().includes(q));
        }
        return rows.slice().sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [applications, statusFilter, facultyFilter, criteriaFilter, monthFilter, searchQuery]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, statusFilter, facultyFilter, criteriaFilter, monthFilter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const paginated = useMemo(
        () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        [filtered, currentPage, pageSize]
    );

    return {
        searchQuery, setSearchQuery,
        statusFilter, setStatusFilter,
        facultyFilter, setFacultyFilter,
        criteriaFilter, setCriteriaFilter,
        monthFilter, setMonthFilter,
        currentPage, setCurrentPage,
        totalPages, filtered, paginated, pageSize
    };
};

const SocialActivityManagement = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('talabalar');
    const [applications, setApplications] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);

    const refreshData = () => {
        setApplications(db.getSocialApplications());
        setAuditLogs(db.getAllSocialAuditLogs());
    };

    useEffect(() => {
        refreshData();
    }, []);

    // Rules of Hooks: both tables are computed unconditionally on every render, never inside a conditional tab block
    const arizalarTable = useApplicationsTable(applications);
    const tasdiqlashTable = useApplicationsTable(applications, { lockedStatuses: [SOCIAL_APPLICATION_STATUS.PENDING] });

    // Sub-kategoriya + "kim tasdiqlaydi" — informational display only (see subcategoryReviewInfo below):
    // this app's real USER_ROLES are just TALABA/ADMINISTRATOR/RAHBARIYAT, no distinct Tyutor/Dekan login,
    // so SOCIAL_REVIEWER_ROLES can't be enforced as an actual access gate yet — it's shown so whoever IS
    // reviewing here knows who was really supposed to, not silently hidden.
    const subcategoriesById = useMemo(() => {
        const map = new Map();
        db.getSocialCriteriaSubcategories().forEach(s => map.set(s.id, s));
        return map;
    }, []);
    const socialCategoryByKey = useMemo(() => {
        const map = new Map();
        db.getSocialCriteriaCategories().forEach(c => map.set(c.key, c));
        return map;
    }, []);
    const subcategoryReviewInfo = (application) => {
        const sub = application.subcategoryId ? subcategoriesById.get(application.subcategoryId) : null;
        if (!sub) return null;
        const reviewer = SOCIAL_REVIEWER_ROLES.find(r => r.key === sub.reviewerRole);
        return { name: sub.name, reviewerLabel: reviewer?.label || sub.reviewerRole };
    };

    const pendingCount = useMemo(
        () => applications.filter(a => a.status === SOCIAL_APPLICATION_STATUS.PENDING).length,
        [applications]
    );

    const facultyOptions = useMemo(
        () => [...new Set(applications.map(a => a.facultyAtSubmission))].filter(Boolean).sort(),
        [applications]
    );
    const monthOptions = useMemo(
        () => [...new Set(applications.map(a => a.submittedAt.slice(0, 7)))].sort().reverse(),
        [applications]
    );

    // Bulk selection for Tasdiqlash, scoped to the current page only
    const [selectedIds, setSelectedIds] = useState(new Set());
    useEffect(() => {
        setSelectedIds(new Set());
    }, [tasdiqlashTable.currentPage, tasdiqlashTable.searchQuery, tasdiqlashTable.facultyFilter, tasdiqlashTable.criteriaFilter]);

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const toggleSelectAllOnPage = () => {
        const pageIds = tasdiqlashTable.paginated.map(a => a.id);
        const allSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allSelected) pageIds.forEach(id => next.delete(id));
            else pageIds.forEach(id => next.add(id));
            return next;
        });
    };

    // Review modal — shared by single-row ("Ko'rib chiqish") and bulk toolbar actions; one confirm handler for both
    const [reviewModal, setReviewModal] = useState(null); // { ids: string[], action: null|'approve'|'reject'|'return' }
    const [reviewComment, setReviewComment] = useState('');
    const [reviewError, setReviewError] = useState('');

    const openReview = (ids, action = null) => {
        setReviewModal({ ids, action });
        setReviewComment('');
        setReviewError('');
    };
    const closeReview = () => setReviewModal(null);

    // Calculation preview: for each application pending approval, resolve its configured scoring source live
    // (no hardcoded points anywhere here — everything comes from Settings → Ijtimoiy faollik → Ball manbalari)
    const approvalPreview = useMemo(() => {
        if (!reviewModal || reviewModal.action !== 'approve') return null;
        return applications
            .filter(a => reviewModal.ids.includes(a.id))
            .map(a => {
                const source = db.findActiveScoringSourceForApplication(a);
                const currentTotal = db.getStudentSocialScoreTotal(a.studentId);
                return {
                    applicationId: a.id,
                    studentFullName: a.studentFullName,
                    criteriaKey: a.criteriaKey,
                    source,
                    currentTotal
                };
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reviewModal, applications]);

    const approvalHasMissingSource = !!approvalPreview && approvalPreview.some(p => !p.source);
    const approvalTotalPoints = approvalPreview ? approvalPreview.reduce((sum, p) => sum + (p.source?.points || 0), 0) : 0;

    const confirmReview = async () => {
        if (!reviewModal || !reviewModal.action) return;
        try {
            await db.bulkReviewSocialApplications(reviewModal.ids, {
                action: reviewModal.action,
                reviewer: user.fullName,
                comment: reviewComment
            });
            refreshData();
            setSelectedIds(new Set());
            closeReview();
        } catch (err) {
            setReviewError(err.message || 'Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
        }
    };

    const reviewCommentRequired = reviewModal && reviewModal.action && reviewModal.action !== 'approve';
    const canConfirmReview = reviewModal && reviewModal.action
        && (!reviewCommentRequired || reviewComment.trim().length > 0)
        && (reviewModal.action !== 'approve' || !approvalHasMissingSource);

    // Read-only detail modal for Arizalar
    const [viewApplication, setViewApplication] = useState(null);

    // Monitoring: faculty / course / monthly / top-student aggregates, computed client-side from denormalized snapshot fields
    const monitoringStats = useMemo(() => {
        const byFaculty = {};
        const byCourse = {};
        const byMonth = {};
        const byStudent = {};

        applications.forEach(a => {
            const faculty = a.facultyAtSubmission || 'Noma\'lum';
            if (!byFaculty[faculty]) byFaculty[faculty] = { faculty, total: 0, approvedCount: 0, totalPoints: 0 };
            byFaculty[faculty].total++;

            const course = a.courseAtSubmission || 0;
            const courseKey = `${course}-kurs`;
            if (!byCourse[courseKey]) byCourse[courseKey] = { course, courseKey, total: 0, approvedCount: 0, totalPoints: 0 };
            byCourse[courseKey].total++;

            const month = a.submittedAt.slice(0, 7);
            if (!byMonth[month]) byMonth[month] = { month, count: 0, approvedPoints: 0 };
            byMonth[month].count++;

            if (a.status === SOCIAL_APPLICATION_STATUS.APPROVED) {
                byFaculty[faculty].approvedCount++;
                byFaculty[faculty].totalPoints += a.pointsAwarded || 0;
                byCourse[courseKey].approvedCount++;
                byCourse[courseKey].totalPoints += a.pointsAwarded || 0;
                byMonth[month].approvedPoints += a.pointsAwarded || 0;

                if (!byStudent[a.studentId]) {
                    byStudent[a.studentId] = {
                        studentId: a.studentId,
                        studentFullName: a.studentFullName,
                        facultyAtSubmission: a.facultyAtSubmission,
                        totalPoints: 0,
                        count: 0
                    };
                }
                byStudent[a.studentId].totalPoints += a.pointsAwarded || 0;
                byStudent[a.studentId].count++;
            }
        });

        return {
            facultyStats: Object.values(byFaculty).sort((a, b) => b.total - a.total),
            courseStats: Object.values(byCourse).sort((a, b) => a.course - b.course),
            monthlyStats: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)),
            topStudents: Object.values(byStudent).sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 10)
        };
    }, [applications]);

    // Ball tarixi: derived straight from approved applications (no second write path into an unrelated ledger)
    const pointsHistory = useMemo(() => {
        return applications
            .filter(a => a.status === SOCIAL_APPLICATION_STATUS.APPROVED && a.pointsAwarded != null)
            .map(a => ({
                applicationId: a.id,
                studentFullName: a.studentFullName,
                source: a.activityTitle,
                criteriaKey: a.criteriaKey,
                points: a.pointsAwarded,
                date: a.reviewedAt,
                approver: a.reviewedBy
            }))
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [applications]);

    const [ballSearch, setBallSearch] = useState('');
    const [ballPage, setBallPage] = useState(1);
    const filteredPointsHistory = useMemo(
        () => pointsHistory.filter(p => p.studentFullName.toLowerCase().includes(ballSearch.trim().toLowerCase())),
        [pointsHistory, ballSearch]
    );
    const ballPageSize = PAGINATION.DEFAULT_PAGE_SIZE;
    const ballTotalPages = Math.max(1, Math.ceil(filteredPointsHistory.length / ballPageSize));
    const paginatedPointsHistory = filteredPointsHistory.slice((ballPage - 1) * ballPageSize, ballPage * ballPageSize);
    useEffect(() => { setBallPage(1); }, [ballSearch]);

    // Audit: global change history across all applications
    const applicationsById = useMemo(
        () => Object.fromEntries(applications.map(a => [a.id, a])),
        [applications]
    );
    const [auditActionFilter, setAuditActionFilter] = useState('ALL');
    const [auditPage, setAuditPage] = useState(1);
    const filteredAuditLogs = useMemo(
        () => auditActionFilter === 'ALL' ? auditLogs : auditLogs.filter(l => l.action === auditActionFilter),
        [auditLogs, auditActionFilter]
    );
    const auditPageSize = PAGINATION.DEFAULT_PAGE_SIZE;
    const auditTotalPages = Math.max(1, Math.ceil(filteredAuditLogs.length / auditPageSize));
    const paginatedAuditLogs = filteredAuditLogs.slice((auditPage - 1) * auditPageSize, auditPage * auditPageSize);
    useEffect(() => { setAuditPage(1); }, [auditActionFilter]);

    return (
        <div className="space-y-6 font-sans">
            {/* Header + tab nav */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                        <TrendingUp className="w-7 h-7 text-indigo-600" />
                        Ijtimoiy Faollik Boshqaruvi
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Arizalar, tasdiqlash, monitoring, ball tarixi va audit — yagona boshqaruv maydonida</p>
                </div>

                <div className="flex flex-wrap bg-slate-100 p-1.5 rounded-xl gap-1 self-start md:self-auto">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                                activeTab === tab.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            {tab.label}
                            {tab.id === 'tasdiqlash' && pendingCount > 0 && (
                                <span className="bg-amber-400 text-slate-900 text-[10px] px-1.5 py-0.5 rounded-full font-black">
                                    {pendingCount}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* TAB: TALABALAR — 11 mezon bo'yicha indeks holati (186-sonli buyruq metodikasi).
                Bu Arizalar/Ball tarixidan MUSTAQIL: u yerda eski ariza ledgeri,
                bu yerda rasmiy indeks. Ikkalasi hali parallel turibdi. */}
            {activeTab === 'talabalar' && <StudentIndexRoster />}

            {/* TAB: ARIZALAR (full read-only history) */}
            {activeTab === 'arizalar' && (
                <div className="space-y-6">
                    <Card className="p-4 bg-white/50 backdrop-blur-sm">
                        <div className="flex flex-col md:flex-row flex-wrap gap-3">
                            <div className="flex-1 min-w-[220px] relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Talaba ismi yoki ID bo'yicha qidirish..."
                                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                                    value={arizalarTable.searchQuery}
                                    onChange={(e) => arizalarTable.setSearchQuery(e.target.value)}
                                />
                            </div>
                            <select
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                                value={arizalarTable.statusFilter}
                                onChange={(e) => arizalarTable.setStatusFilter(e.target.value)}
                            >
                                <option value="ALL">Barcha holatlar</option>
                                {Object.entries(STATUS_META).map(([key, meta]) => (
                                    <option key={key} value={key}>{meta.label}</option>
                                ))}
                            </select>
                            <select
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                                value={arizalarTable.facultyFilter}
                                onChange={(e) => arizalarTable.setFacultyFilter(e.target.value)}
                            >
                                <option value="">Barcha fakultetlar</option>
                                {facultyOptions.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                            <select
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                                value={arizalarTable.criteriaFilter}
                                onChange={(e) => arizalarTable.setCriteriaFilter(e.target.value)}
                            >
                                <option value="">Barcha mezonlar</option>
                                {[...socialCategoryByKey.values()].map((c) => (
                                    <option key={c.key} value={c.key}>{c.name}</option>
                                ))}
                            </select>
                            <select
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                                value={arizalarTable.monthFilter}
                                onChange={(e) => arizalarTable.setMonthFilter(e.target.value)}
                            >
                                <option value="">Barcha oylar</option>
                                {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </Card>

                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Talaba</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Faoliyat</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fakultet / Kurs</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sana</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Holat</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {arizalarTable.paginated.map(a => (
                                        <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                                                        {a.studentFullName.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">{a.studentFullName}</p>
                                                        <p className="text-xs text-gray-500">{a.studentId}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="text-sm text-gray-900">{a.activityTitle}</p>
                                                <p className="text-xs text-indigo-500 font-medium">{socialCategoryByKey.get(a.criteriaKey)?.name}</p>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                {a.facultyAtSubmission} <span className="text-gray-300">•</span> {a.courseAtSubmission}-kurs
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                                    <Calendar size={14} />
                                                    {new Date(a.submittedAt).toLocaleDateString('uz-UZ')}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4"><StatusBadge status={a.status} /></td>
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => setViewApplication(a)}
                                                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                >
                                                    <Eye size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {arizalarTable.paginated.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">Arizalar topilmadi</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <Pagination
                            currentPage={arizalarTable.currentPage}
                            totalPages={arizalarTable.totalPages}
                            onPageChange={arizalarTable.setCurrentPage}
                            totalItems={arizalarTable.filtered.length}
                            pageSize={arizalarTable.pageSize}
                        />
                    </div>
                </div>
            )}

            {/* TAB: TASDIQLASH (actionable pending queue) */}
            {activeTab === 'tasdiqlash' && (
                <div className="space-y-6">
                    <Card className="p-4 bg-white/50 backdrop-blur-sm">
                        <div className="flex flex-col md:flex-row flex-wrap gap-3">
                            <div className="flex-1 min-w-[220px] relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Talaba ismi yoki ID bo'yicha qidirish..."
                                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                                    value={tasdiqlashTable.searchQuery}
                                    onChange={(e) => tasdiqlashTable.setSearchQuery(e.target.value)}
                                />
                            </div>
                            <select
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                                value={tasdiqlashTable.facultyFilter}
                                onChange={(e) => tasdiqlashTable.setFacultyFilter(e.target.value)}
                            >
                                <option value="">Barcha fakultetlar</option>
                                {facultyOptions.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                            <select
                                className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                                value={tasdiqlashTable.criteriaFilter}
                                onChange={(e) => tasdiqlashTable.setCriteriaFilter(e.target.value)}
                            >
                                <option value="">Barcha mezonlar</option>
                                {[...socialCategoryByKey.values()].map((c) => (
                                    <option key={c.key} value={c.key}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    </Card>

                    {selectedIds.size > 0 && (
                        <div className="flex flex-wrap items-center gap-3 bg-indigo-600 text-white px-5 py-3 rounded-2xl shadow-md">
                            <span className="text-sm font-bold">{selectedIds.size} ta ariza tanlandi</span>
                            <div className="flex gap-2 ml-auto">
                                <Button size="sm" variant="success" onClick={() => openReview([...selectedIds], 'approve')}>
                                    <CheckCircle size={16} className="mr-1.5" /> Tasdiqlash
                                </Button>
                                <Button size="sm" variant="outline" className="border-white text-white hover:bg-white/10" onClick={() => openReview([...selectedIds], 'return')}>
                                    <RotateCcw size={16} className="mr-1.5" /> Qaytarish
                                </Button>
                                <Button size="sm" variant="danger" onClick={() => openReview([...selectedIds], 'reject')}>
                                    <XCircle size={16} className="mr-1.5" /> Rad etish
                                </Button>
                                <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => setSelectedIds(new Set())}>
                                    Bekor qilish
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-4 py-4">
                                            <input
                                                type="checkbox"
                                                className="rounded accent-indigo-600"
                                                checked={tasdiqlashTable.paginated.length > 0 && tasdiqlashTable.paginated.every(a => selectedIds.has(a.id))}
                                                onChange={toggleSelectAllOnPage}
                                            />
                                        </th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Talaba</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Faoliyat</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sana</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Harakatlar</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {tasdiqlashTable.paginated.map(a => (
                                        <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-4 py-4">
                                                <input
                                                    type="checkbox"
                                                    className="rounded accent-indigo-600"
                                                    checked={selectedIds.has(a.id)}
                                                    onChange={() => toggleSelect(a.id)}
                                                />
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                                                        {a.studentFullName.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">{a.studentFullName}</p>
                                                        <p className="text-xs text-gray-500">{a.studentId}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="text-sm text-gray-900">{a.activityTitle}</p>
                                                <p className="text-xs text-indigo-500 font-medium">{socialCategoryByKey.get(a.criteriaKey)?.name}</p>
                                                {subcategoryReviewInfo(a) && (
                                                    <p className="text-[11px] text-gray-400 mt-0.5">{subcategoryReviewInfo(a).name} · {subcategoryReviewInfo(a).reviewerLabel} tasdiqlaydi</p>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                                    <Calendar size={14} />
                                                    {new Date(a.submittedAt).toLocaleDateString('uz-UZ')}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => openReview([a.id], null)}
                                                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                >
                                                    <Eye size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {tasdiqlashTable.paginated.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">Kutilayotgan arizalar yo'q</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <Pagination
                            currentPage={tasdiqlashTable.currentPage}
                            totalPages={tasdiqlashTable.totalPages}
                            onPageChange={tasdiqlashTable.setCurrentPage}
                            totalItems={tasdiqlashTable.filtered.length}
                            pageSize={tasdiqlashTable.pageSize}
                        />
                    </div>
                </div>
            )}

            {/* TAB: MONITORING */}
            {activeTab === 'monitoring' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <StatCard icon={ClipboardList} label="Jami arizalar" value={applications.length} accent="indigo" />
                        <StatCard icon={CheckCircle} label="Tasdiqlangan" value={applications.filter(a => a.status === 'Approved').length} accent="emerald" />
                        <StatCard icon={RotateCcw} label="Qaytarilgan" value={applications.filter(a => a.status === 'Returned').length} accent="amber" />
                        <StatCard icon={XCircle} label="Rad etilgan" value={applications.filter(a => a.status === 'Rejected').length} accent="rose" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="p-6 bg-white/80 border-none">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-6">
                                <Building2 size={20} className="text-indigo-600" />
                                Fakultetlar bo'yicha faollik
                            </h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={monitoringStats.facultyStats}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="faculty" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" height={60} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                        <RechartsTooltip
                                            cursor={{ fill: '#f8fafc' }}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Bar dataKey="total" name="Jami arizalar" fill="#4F46E5" radius={[4, 4, 0, 0]} barSize={30} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>

                        <Card className="p-6 bg-white/80 border-none">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-6">
                                <GraduationCap size={20} className="text-emerald-600" />
                                Kurslar bo'yicha faollik
                            </h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={monitoringStats.courseStats}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="courseKey" tick={{ fontSize: 12, fill: '#64748b' }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                        <RechartsTooltip
                                            cursor={{ fill: '#f8fafc' }}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Bar dataKey="total" name="Jami arizalar" fill="#10B981" radius={[4, 4, 0, 0]} barSize={40} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                    </div>

                    <Card className="p-6 bg-white/80 border-none">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-6">
                            <TrendingUp size={20} className="text-indigo-600" />
                            Oylik faollik dinamikasi
                        </h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={monitoringStats.monthlyStats}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                    <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                    <Line type="monotone" dataKey="count" name="Arizalar soni" stroke="#4F46E5" strokeWidth={3} dot={{ fill: '#4F46E5', r: 4 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    <Card className="p-0 overflow-hidden bg-white/80 border-none">
                        <div className="p-6 border-b border-gray-100">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Users size={20} className="text-indigo-600" />
                                Eng faol talabalar
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Reyting</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Talaba</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fakultet</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tasdiqlangan arizalar</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Jami ball</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {monitoringStats.topStudents.map((s, i) => (
                                        <tr key={s.studentId} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                                                    i === 0 ? 'bg-amber-100 text-amber-600' :
                                                    i === 1 ? 'bg-slate-100 text-slate-500' :
                                                    i === 2 ? 'bg-orange-100 text-orange-600' :
                                                    'bg-gray-50 text-gray-400'
                                                }`}>
                                                    #{i + 1}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 font-bold">
                                                        {s.studentFullName.charAt(0)}
                                                    </div>
                                                    <span className="text-sm font-semibold text-gray-900">{s.studentFullName}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">{s.facultyAtSubmission}</td>
                                            <td className="px-6 py-4 text-sm text-gray-500">{s.count}</td>
                                            <td className="px-6 py-4 text-sm font-bold text-gray-900">{s.totalPoints}</td>
                                        </tr>
                                    ))}
                                    {monitoringStats.topStudents.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">Hali tasdiqlangan ariza yo'q</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB: BALL TARIXI */}
            {activeTab === 'ball-tarixi' && (
                <div className="space-y-6">
                    <Card className="p-4 bg-white/50 backdrop-blur-sm">
                        <div className="relative max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="Talaba ismi bo'yicha qidirish..."
                                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                                value={ballSearch}
                                onChange={(e) => setBallSearch(e.target.value)}
                            />
                        </div>
                    </Card>

                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Talaba</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Manba</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ball</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sana</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tasdiqlovchi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {paginatedPointsHistory.map(p => (
                                        <tr key={p.applicationId} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900">{p.studentFullName}</td>
                                            <td className="px-6 py-4">
                                                <p className="text-sm text-gray-900">{p.source}</p>
                                                <p className="text-xs text-indigo-500 font-medium">{socialCategoryByKey.get(p.criteriaKey)?.name}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-600">
                                                    <Award size={14} /> +{p.points}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500">{new Date(p.date).toLocaleDateString('uz-UZ')}</td>
                                            <td className="px-6 py-4 text-sm text-gray-500">{p.approver}</td>
                                        </tr>
                                    ))}
                                    {paginatedPointsHistory.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-10 text-center text-sm text-gray-400">Ball tarixi topilmadi</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <Pagination
                            currentPage={ballPage}
                            totalPages={ballTotalPages}
                            onPageChange={setBallPage}
                            totalItems={filteredPointsHistory.length}
                            pageSize={ballPageSize}
                        />
                    </div>
                </div>
            )}

            {/* TAB: AUDIT */}
            {activeTab === 'audit' && (
                <div className="space-y-6">
                    <Card className="p-4 bg-white/50 backdrop-blur-sm">
                        <select
                            className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                            value={auditActionFilter}
                            onChange={(e) => setAuditActionFilter(e.target.value)}
                        >
                            <option value="ALL">Barcha harakatlar</option>
                            {Object.entries(ACTION_META).map(([key, meta]) => (
                                <option key={key} value={key}>{meta.label}</option>
                            ))}
                        </select>
                    </Card>

                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Vaqt</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Talaba</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Harakat</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Holat o'zgarishi</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Bajaruvchi</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Izoh</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {paginatedAuditLogs.map(log => {
                                        const app = applicationsById[log.applicationId];
                                        const meta = ACTION_META[log.action] || { label: log.action, variant: 'default' };
                                        return (
                                            <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4 text-sm text-gray-500">
                                                    {new Date(log.time).toLocaleString('uz-UZ')}
                                                </td>
                                                <td className="px-6 py-4 text-sm font-medium text-gray-900">{app?.studentFullName || '—'}</td>
                                                <td className="px-6 py-4"><Badge variant={meta.variant}>{meta.label}</Badge></td>
                                                <td className="px-6 py-4 text-sm text-gray-500">
                                                    {log.fromStatus ? `${log.fromStatus} → ${log.toStatus}` : `→ ${log.toStatus}`}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-500">{log.reviewer}</td>
                                                <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={log.comment}>{log.comment || '—'}</td>
                                            </tr>
                                        );
                                    })}
                                    {paginatedAuditLogs.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">Audit yozuvlari topilmadi</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <Pagination
                            currentPage={auditPage}
                            totalPages={auditTotalPages}
                            onPageChange={setAuditPage}
                            totalItems={filteredAuditLogs.length}
                            pageSize={auditPageSize}
                        />
                    </div>
                </div>
            )}

            {/* Read-only detail modal (Arizalar) */}
            {viewApplication && (
                <Modal isOpen={!!viewApplication} onClose={() => setViewApplication(null)} title="Ariza tafsilotlari">
                    <div className="space-y-5">
                        <div className="flex items-start gap-4 p-4 bg-indigo-50 rounded-2xl">
                            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-indigo-600">
                                <FileText size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">{viewApplication.activityTitle}</h3>
                                <p className="text-sm text-gray-500">{socialCategoryByKey.get(viewApplication.criteriaKey)?.name}</p>
                                {subcategoryReviewInfo(viewApplication) && (
                                    <p className="text-xs text-indigo-500 font-medium mt-0.5">
                                        {subcategoryReviewInfo(viewApplication).name} — {subcategoryReviewInfo(viewApplication).reviewerLabel} tasdiqlashi kerak
                                    </p>
                                )}
                            </div>
                            <StatusBadge status={viewApplication.status} />
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div><p className="text-gray-500">Talaba</p><p className="font-semibold text-gray-900">{viewApplication.studentFullName}</p></div>
                            <div><p className="text-gray-500">Fakultet / Kurs</p><p className="font-semibold text-gray-900">{viewApplication.facultyAtSubmission} • {viewApplication.courseAtSubmission}-kurs</p></div>
                            <div><p className="text-gray-500">Yuborilgan sana</p><p className="font-semibold text-gray-900">{new Date(viewApplication.submittedAt).toLocaleDateString('uz-UZ')}</p></div>
                            {viewApplication.reviewedAt && (
                                <div><p className="text-gray-500">Ko'rib chiqilgan sana</p><p className="font-semibold text-gray-900">{new Date(viewApplication.reviewedAt).toLocaleDateString('uz-UZ')}</p></div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-gray-700">Tavsif:</h4>
                            <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-xl">{viewApplication.description || '—'}</p>
                        </div>

                        {viewApplication.fileName && (
                            <div className="p-4 border border-dashed border-gray-200 rounded-2xl flex items-center gap-3">
                                <div className="p-2 bg-gray-100 rounded-lg"><FileText size={20} className="text-gray-500" /></div>
                                <span className="text-sm font-medium text-gray-700">{viewApplication.fileName}</span>
                            </div>
                        )}

                        {viewApplication.status === 'Approved' && (
                            <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                                <Award size={16} /> {viewApplication.pointsAwarded} ball berildi ({viewApplication.reviewedBy})
                            </div>
                        )}
                        {(viewApplication.status === 'Rejected' || viewApplication.status === 'Returned') && viewApplication.reviewerComment && (
                            <div className="p-3 bg-rose-50 rounded-xl text-sm text-rose-700">
                                <span className="font-semibold">{viewApplication.reviewedBy}:</span> {viewApplication.reviewerComment}
                            </div>
                        )}
                    </div>
                </Modal>
            )}

            {/* Review modal — shared by single-row and bulk actions in Tasdiqlash */}
            {reviewModal && (
                <Modal
                    isOpen={!!reviewModal}
                    onClose={closeReview}
                    title={reviewModal.ids.length === 1 ? 'Arizani ko\'rib chiqish' : `${reviewModal.ids.length} ta ariza`}
                >
                    <div className="space-y-5">
                        {reviewError && (
                            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-sm text-rose-700">
                                <AlertTriangle size={16} className="shrink-0" /> {reviewError}
                            </div>
                        )}

                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {applications.filter(a => reviewModal.ids.includes(a.id)).map(a => (
                                <div key={a.id} className="p-3 bg-gray-50 rounded-xl">
                                    <p className="text-sm font-semibold text-gray-900">{a.studentFullName}</p>
                                    <p className="text-xs text-gray-500">{a.activityTitle} • {socialCategoryByKey.get(a.criteriaKey)?.name}</p>
                                    {reviewModal.ids.length === 1 && a.description && (
                                        <p className="text-xs text-gray-600 mt-2">{a.description}</p>
                                    )}
                                    {reviewModal.ids.length === 1 && a.fileName && (
                                        <p className="text-xs text-indigo-600 mt-1 flex items-center gap-1"><FileText size={12} /> {a.fileName}</p>
                                    )}
                                </div>
                            ))}
                        </div>

                        {!reviewModal.action ? (
                            <div className="flex gap-3 pt-2 border-t border-gray-100">
                                <Button variant="primary" className="flex-1" onClick={() => { setReviewError(''); setReviewModal(m => ({ ...m, action: 'approve' })); }}>
                                    <CheckCircle size={18} className="mr-2" /> Tasdiqlash
                                </Button>
                                <Button variant="outline" className="flex-1 border-amber-200 text-amber-600 hover:bg-amber-50" onClick={() => { setReviewError(''); setReviewModal(m => ({ ...m, action: 'return' })); }}>
                                    <RotateCcw size={18} className="mr-2" /> Qaytarish
                                </Button>
                                <Button variant="outline" className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => { setReviewError(''); setReviewModal(m => ({ ...m, action: 'reject' })); }}>
                                    <XCircle size={18} className="mr-2" /> Rad etish
                                </Button>
                            </div>
                        ) : (
                            <>
                                {reviewModal.action === 'approve' ? (
                                    <div className="space-y-3">
                                        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                            <Award size={16} className="text-indigo-600" /> Ball hisob-kitobi
                                        </h4>
                                        <div className="space-y-2 max-h-56 overflow-y-auto">
                                            {approvalPreview.map(p => (
                                                <div
                                                    key={p.applicationId}
                                                    className={`p-3 rounded-xl border text-sm ${p.source ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-200'}`}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="font-semibold text-gray-900">{p.studentFullName}</span>
                                                        {p.source ? (
                                                            <span className="font-bold text-emerald-700 whitespace-nowrap">+{p.source.points} ball</span>
                                                        ) : (
                                                            <span className="font-bold text-rose-600 whitespace-nowrap">Manba topilmadi</span>
                                                        )}
                                                    </div>
                                                    {p.source ? (
                                                        <>
                                                            <p className="text-xs text-gray-500 mt-1">
                                                                {p.source.name} ({p.source.code}) • {p.source.academicYear}
                                                            </p>
                                                            <p className="text-xs text-gray-400 mt-1">
                                                                Joriy jami ball: {p.currentTotal} → {p.currentTotal + p.source.points}
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <p className="text-xs text-rose-600 mt-1">
                                                            "{socialCategoryByKey.get(p.criteriaKey)?.name}" mezoni uchun faol ball manbai sozlanmagan
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        {approvalPreview.length > 1 && (
                                            <div className="flex justify-between text-sm font-bold text-gray-900 pt-2 border-t border-gray-100">
                                                <span>Jami beriladigan ball</span>
                                                <span>{approvalTotalPoints}</span>
                                            </div>
                                        )}
                                        {approvalHasMissingSource && (
                                            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                                                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                                Ba'zi arizalar uchun faol ball manbai topilmadi. Tasdiqlashdan oldin Sozlamalar → Ijtimoiy faollik bo'limida tegishli ball manbasini faollashtiring.
                                            </div>
                                        )}
                                        <textarea
                                            className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                            rows="2"
                                            placeholder="Izoh (ixtiyoriy)"
                                            value={reviewComment}
                                            onChange={(e) => setReviewComment(e.target.value)}
                                        />
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-700">
                                            Izoh ({reviewModal.action === 'reject' ? 'rad etish sababi' : 'qaytarish sababi'}, majburiy)
                                        </label>
                                        <textarea
                                            className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                            rows="3"
                                            placeholder="Sababni yozing..."
                                            value={reviewComment}
                                            onChange={(e) => setReviewComment(e.target.value)}
                                        />
                                    </div>
                                )}

                                <div className="flex gap-3 pt-4 border-t border-gray-100">
                                    <Button variant="secondary" className="flex-1" onClick={() => setReviewModal(m => ({ ...m, action: null }))}>
                                        Orqaga
                                    </Button>
                                    <Button
                                        variant={reviewModal.action === 'approve' ? 'primary' : 'danger'}
                                        className="flex-1"
                                        disabled={!canConfirmReview}
                                        onClick={confirmReview}
                                    >
                                        {reviewModal.action === 'approve' ? 'Tasdiqlash' : reviewModal.action === 'reject' ? 'Rad etish' : 'Qaytarish'}
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default SocialActivityManagement;
