import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Users,
    Clock,
    Calendar,
    Trophy,
    CheckCircle,
    XCircle,
    MapPin
} from 'lucide-react';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import ClubsAnalyticsTab from './ClubsAnalyticsTab';
import CompetitionsManagementTab from './CompetitionsManagementTab';
import ApprovalsTab from './ApprovalsTab';
import {
    DeadlineStrip, IndexReadinessCard, PendingWorkloadCard, SystemHealthCard,
} from '../../components/admin/AdminOverviewInsights';
import { getPendingWorkload } from '../../utils/indexReadiness';
import useTabParam from '../../hooks/useTabParam';
import { db } from '../../services/db';
import { useAuth, ROLES } from '../../contexts/AuthContext';

const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'];
const MONTH_ABBR = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

// Shared with CompetitionsManagementTab.jsx's own copy — kept as a small local duplicate here too
// (same convention used throughout this codebase for tiny per-file classification helpers) since this
// file only needs it for the Overview tab's "Faol musobaqalar" glance widget.
const isCompetitionCompleted = (c) => (c.currentRound || 1) > (c.roundsCount || 1);
const classifyCompetition = (c) => {
    if (isCompetitionCompleted(c)) return 'closed';
    const startDateTime = c.startDate ? db.combineDateTime(c.startDate, c.startTime) : null;
    if (startDateTime && new Date(startDateTime) > new Date()) return 'upcoming';
    return 'ongoing';
};
const COMPETITION_STATUS_LABELS = { ongoing: 'Davom etmoqda', upcoming: 'Ochilmagan', closed: 'Yakunlangan' };
const COMPETITION_STATUS_VARIANTS = { ongoing: 'warning', upcoming: 'info', closed: 'default' };

// Bosiladigan ko'rsatkich kartochkasi.
//
// `Card` oddiy `div` chizadi, shuning uchun klaviatura bilan ishlash QO'LDA qo'shiladi:
// `role="button"` + `tabIndex` + Enter/Bo'sh joy. Busiz kartochka faqat sichqoncha bilan
// ochilardi - klaviaturada yuradigan foydalanuvchi uchun tugma umuman yo'qdek bo'lardi.
const StatCard = ({ label, value, sub, icon: Icon, accent, iconWrap, iconColor, hint, onOpen }) => (
    <Card
        hover
        className={`border-l-4 ${accent} transition-shadow focus:outline-none focus:ring-2 focus:ring-indigo-500`}
        role="button"
        tabIndex={0}
        title={hint}
        aria-label={`${label}: ${value}. ${hint}`}
        onClick={onOpen}
        onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
        }}
    >
        <div className="flex items-center justify-between">
            <div className="min-w-0">
                <p className="text-sm text-gray-600 mb-1">{label}</p>
                <p className="text-3xl font-bold text-gray-900">{value}</p>
                {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
            </div>
            <div className={`w-12 h-12 ${iconWrap} rounded-lg flex items-center justify-center shrink-0`}>
                <Icon className={`w-6 h-6 ${iconColor}`} />
            </div>
        </div>
        <p className="text-[11px] text-indigo-600 font-semibold mt-3">{hint} →</p>
    </Card>
);

// Overview tab (spec: "Tahlil & Monitoring") — real data throughout, deliberately NOT re-showing
// per-student/per-faculty rankings here (that's Reytinglar's job, with far richer TAS/tier/search
// tooling — duplicating it here would just be a second, weaker copy). This tab's job is a quick pulse
// + items that need action right now (pending applications), not deep analysis.
const AdminDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    // Route-level ProtectedRoute already restricts /admin/* to ROLES.ADMIN — this in-component check is
    // additive/defensive (spec: admin + rahbariyat should see "Klublar analitikasi"), not a replacement
    // for that routing guard, which this change does not touch.
    const canViewClubsAnalytics = user?.role === ROLES.ADMIN || user?.role === ROLES.MANAGEMENT;
    // Tab MANZILDA: "orqaga" tugmasi oldingi tabga qaytaradi, butun bo'limdan
    // chiqarib yubormaydi. Boshqa bo'limlar shu tartibga o'tgan edi, bu esa
    // qolib ketgandi.
    const [activeAdminTab, setActiveAdminTab] = useTabParam(
        ['overview', 'clubsAnalytics', 'competitions', 'approvals'], 'overview');
    const [refreshKey, setRefreshKey] = useState(0);
    const [reviewError, setReviewError] = useState('');

    const students = useMemo(() => db.getMockStudents(), []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const applications = useMemo(() => db.getSocialApplications(), [refreshKey]);
    const events = useMemo(() => db.getEvents(), []);
    const competitions = useMemo(() => db.getCompetitions(), []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const transactions = useMemo(() => db.getSocialScoreTransactions(), [refreshKey]);

    const pendingApplications = useMemo(
        () => applications.filter(a => a.status === 'Pending').sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt)),
        [applications]
    );
    // "Tasdiqlash kutilmoqda" kartasi avval FAQAT eski ijtimoiy faollik
    // arizalarini sanardi va deyarli doim 0 ko'rsatardi - holbuki hujjatlar,
    // e'tirozlar, sport nomzodlari va madaniy tashriflar javob kutib turardi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const pendingTotal = useMemo(() => getPendingWorkload(db).total, [refreshKey]);

    const upcomingEvents = useMemo(
        () => events.filter(e => new Date(e.date) >= new Date()).sort((a, b) => new Date(a.date) - new Date(b.date)),
        [events]
    );
    const competitionsWithStatus = useMemo(
        () => competitions.map(c => ({ ...c, statusBucket: classifyCompetition(c) })),
        [competitions]
    );
    const activeCompetitions = useMemo(
        () => competitionsWithStatus.filter(c => c.statusBucket !== 'closed'),
        [competitionsWithStatus]
    );

    // "Faollik dinamikasi" — real 6-month sum of socialScoreTransactions points (the actual ledger every
    // student's Ijtimoiy faollik skoring is built from), not a placeholder curve.
    const activityTrend = useMemo(() => {
        const now = new Date();
        const months = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({ year: d.getFullYear(), monthIdx: d.getMonth(), label: MONTH_ABBR[d.getMonth()] });
        }
        return months.map(m => ({
            month: m.label,
            score: transactions
                .filter(t => { const d = new Date(t.createdAt); return d.getFullYear() === m.year && d.getMonth() === m.monthIdx; })
                .reduce((sum, t) => sum + (t.points || 0), 0)
        }));
    }, [transactions]);

    const socialCategoriesByKey = useMemo(() => {
        const map = {};
        db.getSocialCriteriaCategories().forEach(c => { map[c.key] = c; });
        return map;
    }, []);

    // "Mezonlar bo'yicha taqsimot" — real per-criterion point totals from the same ledger.
    const criteriaDistribution = useMemo(() => {
        const totals = {};
        transactions.forEach(t => { totals[t.category] = (totals[t.category] || 0) + (t.points || 0); });
        return Object.entries(totals)
            .map(([key, value]) => ({ name: socialCategoriesByKey[key]?.name || key, value }))
            .filter(d => d.value > 0)
            .sort((a, b) => b.value - a.value);
    }, [transactions, socialCategoriesByKey]);

    const handleApprove = async (applicationId) => {
        setReviewError('');
        try {
            await db.reviewSocialApplication(applicationId, { action: 'approve', reviewer: user.username });
            setRefreshKey(k => k + 1);
        } catch (err) {
            setReviewError(err.message);
        }
    };
    const handleReject = async (applicationId) => {
        const reason = window.prompt("Rad etish sababi (ixtiyoriy):") || '';
        try {
            await db.reviewSocialApplication(applicationId, { action: 'reject', reviewer: user.username, comment: reason });
            setRefreshKey(k => k + 1);
        } catch (err) {
            setReviewError(err.message);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 rounded-2xl p-8 text-white shadow-xl">
                <h1 className="text-3xl font-bold mb-2">Administrator Paneli</h1>
                <p className="text-indigo-100">
                    Talabalar faolligini monitoring qilish va boshqarish
                </p>
            </div>

            {/* Admin Tabs */}
            <div className="flex border-b border-gray-200 gap-6 mb-6">
                <button
                    onClick={() => setActiveAdminTab('overview')}
                    className={`pb-3 font-bold text-sm border-b-2 transition-all ${activeAdminTab === 'overview' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
                >
                    Tahlil & Monitoring
                </button>
                {canViewClubsAnalytics && (
                    <button
                        onClick={() => setActiveAdminTab('clubsAnalytics')}
                        className={`pb-3 font-bold text-sm border-b-2 transition-all ${activeAdminTab === 'clubsAnalytics' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
                    >
                        Klublar analitikasi
                    </button>
                )}
                <button
                    onClick={() => setActiveAdminTab('competitions')}
                    className={`pb-3 font-bold text-sm border-b-2 transition-all ${activeAdminTab === 'competitions' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
                >
                    Tanlovlarni boshqarish
                </button>
                <button
                    onClick={() => setActiveAdminTab('approvals')}
                    className={`pb-3 font-bold text-sm border-b-2 transition-all ${activeAdminTab === 'approvals' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
                >
                    Tasdiqlash
                </button>
            </div>

            {activeAdminTab === 'overview' && (
                <>
                    {/* Quick Stats — all real. Har biri o'z bo'limiga OLIB BORADI: raqamni
                        ko'rgan odamning keyingi savoli har doim "kimlar?" bo'ladi, ilgari esa
                        u menyudan qaytadan qidirishi kerak edi. */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            label="Jami talabalar"
                            value={students.length}
                            icon={Users}
                            accent="border-l-blue-500"
                            iconWrap="bg-blue-100"
                            iconColor="text-blue-500"
                            hint="Talabalar reytingini ochish"
                            onOpen={() => navigate('/admin/social-activity?bolim=tahlil&tab=students')}
                        />
                        <StatCard
                            label="Tasdiqlash kutilmoqda"
                            value={pendingTotal}
                            sub="barcha oqimlar bo'yicha"
                            icon={Clock}
                            accent="border-l-yellow-500"
                            iconWrap="bg-yellow-100"
                            iconColor="text-yellow-500"
                            hint="Tasdiqlash navbatini ochish"
                            onOpen={() => navigate('/admin/social-activity?bolim=ish&jarayon=tasdiqlash')}
                        />
                        <StatCard
                            label="Yaqin tadbirlar"
                            value={upcomingEvents.length}
                            icon={Calendar}
                            accent="border-l-purple-500"
                            iconWrap="bg-purple-100"
                            iconColor="text-purple-500"
                            hint="Tadbirlar bo'limini ochish"
                            onOpen={() => navigate('/admin/events')}
                        />
                        <StatCard
                            label="Faol musobaqalar"
                            value={activeCompetitions.length}
                            icon={Trophy}
                            accent="border-l-green-500"
                            iconWrap="bg-green-100"
                            iconColor="text-green-500"
                            hint="Musobaqalar bo'limini ochish"
                            onOpen={() => navigate('/admin/competitions')}
                        />
                    </div>

                    {/* Muddatlar — metodikadagi 10/15/25-iyul. Sanalar tizimda
                        allaqachon bor edi (db.getIndexDeadlines), lekin faqat
                        sozlamalar ichida ko'rinardi. */}
                    <DeadlineStrip />

                    {/* Indeks tayyorligi + javob kutayotgan ishlar + tizim holati.
                        Uchalasi ham ARZON hisob: birorta talabaning indeksi
                        hisoblanmaydi, faqat jadvallar ustidan bir marta yuriladi. */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <IndexReadinessCard />
                        <PendingWorkloadCard onOpenApprovals={() => setActiveAdminTab('approvals')} />
                        <SystemHealthCard />
                    </div>

                    {/* Charts — ESKI ledger (social_score_transactions) ustida.
                        Bu rasmiy 100 ballik indeks EMAS, undan oldingi ballar
                        tizimi. Ataylab qoldirilgan: tarixiy ma'lumot shu yerda
                        va u boshqa hech qayerda ko'rsatilmaydi. */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card title="Faollik dinamikasi" subtitle="Oxirgi 6 oy — eski ballar tizimi (indeks emas)">
                            <ResponsiveContainer width="100%" height={250}>
                                <BarChart data={activityTrend}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="month" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="score" fill="#4F46E5" radius={[8, 8, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>

                        <Card title="Mezonlar bo'yicha taqsimot" subtitle="Eski ballar tizimidagi manbalar">
                            {criteriaDistribution.length === 0 ? (
                                <div className="h-[250px] flex items-center justify-center text-sm text-gray-400">Hozircha ma'lumot yo'q</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={250}>
                                    <PieChart>
                                        <Pie
                                            data={criteriaDistribution}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="value"
                                        >
                                            {criteriaDistribution.map((entry, index) => (
                                                <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </Card>
                    </div>

                    {/* Pending approvals (real, actionable) + upcoming events/competitions glance (real,
                        link out to their own full-management pages rather than re-implementing them here) */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card title="Tasdiqlash kutilmoqda" subtitle="Yangi arizalar">
                            {reviewError && <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{reviewError}</p>}
                            <div className="space-y-3 max-h-[420px] overflow-y-auto">
                                {pendingApplications.slice(0, 8).map((item) => (
                                    <div
                                        key={item.id}
                                        className="p-3 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-all"
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <div>
                                                <p className="font-medium text-gray-900">{item.studentFullName}</p>
                                                <p className="text-sm text-gray-600">{item.activityTitle}</p>
                                            </div>
                                            <Badge variant="warning" size="sm">Kutilmoqda</Badge>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-gray-500">{socialCategoriesByKey[item.criteriaKey]?.name || item.criteriaKey}</span>
                                            <span className="text-gray-400">{new Date(item.submittedAt).toLocaleDateString('uz-UZ')}</span>
                                        </div>
                                        <div className="flex space-x-2 mt-3">
                                            <button
                                                onClick={() => handleApprove(item.id)}
                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
                                            >
                                                <CheckCircle size={14} /> Tasdiqlash
                                            </button>
                                            <button
                                                onClick={() => handleReject(item.id)}
                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
                                            >
                                                <XCircle size={14} /> Rad etish
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {pendingApplications.length === 0 && (
                                    <p className="text-center text-sm text-gray-400 py-8">Hozircha tasdiqlash kutayotgan ariza yo'q</p>
                                )}
                            </div>
                            {pendingApplications.length > 8 && (
                                <button
                                    onClick={() => navigate('/admin/social-activity')}
                                    className="w-full mt-3 text-xs font-bold text-indigo-600 hover:text-indigo-700 text-center"
                                >
                                    Yana {pendingApplications.length - 8} ta — barchasini ko'rish
                                </button>
                            )}
                        </Card>

                        <div className="space-y-6">
                            <Card title="Yaqin tadbirlar" subtitle={`${upcomingEvents.length} ta rejalashtirilgan`}>
                                <div className="space-y-2">
                                    {upcomingEvents.slice(0, 4).map(e => (
                                        <div key={e.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-gray-900 truncate">{e.title}</p>
                                                <p className="text-xs text-gray-400 flex items-center gap-1.5">
                                                    <Calendar size={11} /> {new Date(e.date).toLocaleDateString('uz-UZ')}
                                                    {e.location && <><MapPin size={11} className="ml-1" /> {e.location}</>}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                    {upcomingEvents.length === 0 && <p className="text-center text-sm text-gray-400 py-6">Yaqin tadbirlar yo'q</p>}
                                </div>
                                <button
                                    onClick={() => navigate('/admin/events')}
                                    className="w-full mt-3 text-xs font-bold text-indigo-600 hover:text-indigo-700 text-center"
                                >
                                    Barcha tadbirlarni boshqarish →
                                </button>
                            </Card>

                            <Card title="Faol musobaqalar" subtitle={`${activeCompetitions.length} ta davom etmoqda / ochilmagan`}>
                                <div className="space-y-2">
                                    {activeCompetitions.slice(0, 4).map(c => (
                                        <div
                                            key={c.id}
                                            onClick={() => navigate(`/admin/competitions/${c.id}`)}
                                            className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                                        >
                                            <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                                            <Badge variant={COMPETITION_STATUS_VARIANTS[c.statusBucket]} size="sm">{COMPETITION_STATUS_LABELS[c.statusBucket]}</Badge>
                                        </div>
                                    ))}
                                    {activeCompetitions.length === 0 && <p className="text-center text-sm text-gray-400 py-6">Faol musobaqa yo'q</p>}
                                </div>
                                <button
                                    onClick={() => setActiveAdminTab('competitions')}
                                    className="w-full mt-3 text-xs font-bold text-indigo-600 hover:text-indigo-700 text-center"
                                >
                                    Barcha musobaqalarni boshqarish →
                                </button>
                            </Card>
                        </div>
                    </div>
                </>
            )}

            {activeAdminTab === 'clubsAnalytics' && canViewClubsAnalytics && (
                <ClubsAnalyticsTab />
            )}

            {/* Real tadbirlar (db.getEvents()) + musobaqalar (db.getCompetitions()) — full filter/sort/
                pagination workspace, extracted into its own file for readability. Musobaqa qatori haqiqiy
                /admin/competitions/:id workspace'ga (TournamentScoring/CompetitionResultsCenter, tegilmagan)
                olib boradi; tadbir qatori /admin/events'ga. Avvalgi "Loyihalar"/"Tanlovlar Boshqaruvi"/
                "Turnirlar" 3 ta tabi shu bittasiga birlashtirildi — ular soxta context-id ("p_smart_campus",
                "tour_general") bilan ishlar, hech qanday real yozuvga bog'lanmagan edi. */}
            {activeAdminTab === 'competitions' && <CompetitionsManagementTab />}

            {/* Unified "Tasdiqlash" queue (per direct feedback after the approval-process audit) — every
                real submitted->pending->admin-decides workflow in one place: ijtimoiy faollik, klub
                lavozimi (admin's final stage), ro'yxatdan o'tish tasdiqlash (previously-dead field, now
                wired), stipendiya arizalari (now real). See ApprovalsTab.jsx for details/disclosures. */}
            {activeAdminTab === 'approvals' && <ApprovalsTab />}
        </div>
    );
};

export default AdminDashboard;
