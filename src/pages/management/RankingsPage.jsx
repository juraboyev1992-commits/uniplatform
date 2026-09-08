import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
    Trophy, Medal, Crown, Award, Users, GraduationCap, BookOpen, Building2,
    ArrowUp, ArrowDown, Minus, CheckCircle2, Clock, Sparkles, Info, Activity, Download
} from 'lucide-react';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import GlobalClubsRankings from './GlobalClubsRankings';
import StudentsManagement from '../../components/admin/StudentsManagement';
import { db } from '../../services/db';
import { TAS_TIERS, tierForTotal } from '../../utils/studentScoring';
import { useTabParam } from '../../hooks/useTabParam';
import {
    getStudentTasRows, getFacultyRankings, getCourseRankings, getClubTasRankings,
    getCategoryRankings, TASHABBUS_CATEGORIES
} from '../../utils/rankingsAnalytics';

// Professional refactor of the "Reytinglar" hub (per direct spec): unifies Fakultet/Kurs/Talaba/Klub/
// Kategoriya rankings into one real-data-driven center, built on computeStudentTAS + the existing
// socialScoreTransactions ledger (src/utils/rankingsAnalytics.js does the aggregation, computeStudentTAS
// itself is untouched). "Guruhlar" tab replaced with "Kurslar" (1-4) per spec. "Global talabalar" embeds
// the existing StudentsManagement.jsx component verbatim (search/filters/pagination/export/student
// modal/TAS Skoring all unchanged) instead of a new table, so this becomes the one place to browse
// students — see Sidebar.jsx for the matching "Talabalar" menu-item removal (route itself still works).

const TIER_BADGE_VARIANT = { Platinum: 'primary', Gold: 'excellent', Silver: 'info', Bronze: 'warning' };

const GrowthBadge = ({ pct }) => {
    if (pct == null) return <span className="text-xs text-gray-300">—</span>;
    const Icon = pct > 0 ? ArrowUp : pct < 0 ? ArrowDown : Minus;
    const color = pct > 0 ? 'text-emerald-600' : pct < 0 ? 'text-red-500' : 'text-gray-400';
    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${color}`}>
            <Icon size={12} /> {pct > 0 ? '+' : ''}{pct}%
        </span>
    );
};

const getMedalIcon = (rank) => {
    if (rank === 1) return <Crown size={18} className="text-yellow-500" />;
    if (rank === 2) return <Medal size={18} className="text-gray-400" />;
    if (rank === 3) return <Medal size={18} className="text-amber-700" />;
    return <span className="text-sm font-bold text-gray-400">{rank}</span>;
};
const getMedalBg = (rank) => {
    if (rank === 1) return 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200';
    if (rank === 2) return 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200';
    if (rank === 3) return 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200';
    return 'bg-white border-gray-100';
};
// Gold/Silver/Bronze left-edge accent for the top 3 rows of any ranked list — layered on top of
// getMedalBg's soft background tint so the top 3 read as a deliberate accent, not just a slightly
// different shade.
const getRankAccentBorder = (rank) => {
    if (rank === 1) return 'border-l-4 border-l-yellow-400';
    if (rank === 2) return 'border-l-4 border-l-gray-400';
    if (rank === 3) return 'border-l-4 border-l-amber-600';
    return '';
};

// Same small badge pair shown in the page header (spec section 5: repeated at the top of every ranking
// tab except "Global talabalar", which gets its own dedicated header per spec section 1).
const TabInfoBadges = ({ generatedAt }) => (
    <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[11px] font-bold">
            <CheckCircle2 size={12} /> Real ma'lumot asosida
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-500 rounded-lg text-[11px] font-bold">
            <Clock size={12} /> Oxirgi yangilanish: {generatedAt.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
        </span>
    </div>
);

// Flat indigo-gradient fill bar — used instead of the shared ProgressBar.jsx's percentage-tiered
// red/amber/green coloring (that component is also used inside StudentsManagement.jsx's untouched 11-
// mezon bars, so it's left alone; this is a small local-only bar for Reytinglar's own rows).
const IndigoBar = ({ value, max }) => (
    <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600"
            style={{ width: `${Math.min(100, Math.max(0, (value / max) * 100))}%` }}
        />
    </div>
);

// Leader KPI card (spec section 3) — one shape reused for the top faculty/course/club.
const LeaderKpiCard = ({ icon: Icon, tone, title, name, avgTas, growthPct, footLabel }) => {
    const tones = {
        indigo: 'from-indigo-500 to-indigo-700',
        emerald: 'from-emerald-500 to-emerald-700',
        amber: 'from-amber-500 to-amber-700'
    };
    return (
        <Card className="p-0 border-none overflow-hidden bg-white/80 h-full flex flex-col">
            <div className={`bg-gradient-to-br ${tones[tone]} p-4 flex items-center gap-3 text-white`}>
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                    <Icon size={20} />
                </div>
                <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">{title}</p>
                    <p className="font-bold truncate">{name || '—'}</p>
                </div>
            </div>
            <div className="p-4 flex-1 flex items-center justify-between">
                <div>
                    <p className="text-2xl font-black text-gray-900">{avgTas ?? 0}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">o'rtacha TAS</p>
                </div>
                <div className="text-right">
                    <GrowthBadge pct={growthPct} />
                    <p className="text-[10px] text-gray-400 mt-1">{footLabel}</p>
                </div>
            </div>
        </Card>
    );
};

const RANKING_TAB_IDS = ['faculty', 'course', 'students', 'clubs', 'category'];

// `embedded` — admin panelida bu sahifa "Ijtimoiy faollik va reyting" bo'limining "Tahlil"
// guruhi sifatida chiziladi va o'z sarlavhasini yashiradi. Rahbariyat panelida esa u
// hozirgidek MUSTAQIL sahifa bo'lib qolaveradi (u yerda "Ijtimoiy faollik" bo'limi yo'q),
// shuning uchun komponentning o'zi ikkala holatda ham ishlashi kerak.
const RankingsPage = ({ embedded = false }) => {
    const [activeTab, setActiveTab] = useTabParam(RANKING_TAB_IDS, 'faculty');

    // "Oxirgi yangilanish" — real render timestamp (no server "last updated" concept in a client-only
    // mock app; this is the moment the numbers below were actually computed, not a fabricated date).
    const generatedAt = useMemo(() => new Date(), []);

    const studentRows = useMemo(() => getStudentTasRows(db), []);
    const facultyRankings = useMemo(() => getFacultyRankings(studentRows), [studentRows]);
    const courseRankings = useMemo(() => getCourseRankings(studentRows), [studentRows]);
    const clubRankings = useMemo(() => getClubTasRankings(db, studentRows), [studentRows]);
    const categoryRankings = useMemo(() => getCategoryRankings(db, studentRows), [studentRows]);

    const topFaculty = facultyRankings[0];
    const topCourse = courseRankings[0];
    const topClub = clubRankings[0];

    // Excel export for "Global talabalar" (spec follow-up: StudentsManagement.jsx only has a CSV button
    // and stays untouched, so this is a separate, independent export sitting in the wrapper header
    // instead — built from the same `studentRows` already computed above for the Fakultet/Kurs tabs,
    // sorted by TAS to match that tab's own default view).
    const handleExportStudentsExcel = () => {
        const sorted = [...studentRows].sort((a, b) => b.tas.total - a.tas.total);
        const rows = sorted.map((r, i) => ({
            "O'rin": i + 1,
            'Talaba №': r.student.displayNumber,
            'F.I.Sh.': r.student.fullName,
            'Fakultet': r.student.faculty,
            'Kurs': r.student.course,
            'TAS (jami)': r.tas.total,
            'Daraja': r.tas.tier,
            'Akademik skoring': r.tas.academicScore,
            "Ijtimoiy faollik skoring": r.tas.socialFaollikScore,
            'Liderlik skoring': r.tas.leadershipScore,
            'Ishonchlilik skoring': r.tas.reliabilityScore
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 30 }, { wch: 25 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Global talabalar');
        XLSX.writeFile(wb, `global_talabalar_reytingi_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const tabs = [
        { id: 'faculty', label: 'Fakultetlar', icon: GraduationCap },
        { id: 'course', label: 'Kurslar', icon: BookOpen },
        // "Global talabalar" emas: bu ro'yxatning ishi — saralash, filtr, eksport, ya'ni
        // REYTING. Ishchi ko'rinish ("Indeks holati") esa Ish jarayoni guruhida turadi.
        { id: 'students', label: 'Talabalar reytingi', icon: Trophy },
        { id: 'clubs', label: 'Global klublar', icon: Building2 },
        { id: 'category', label: 'Kategoriyalar', icon: Award }
    ];

    return (
        <div className="space-y-6 pb-10">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                {/* Birlashtirilgan bo'lim ichida sarlavha tashqi sahifada turadi — bu yerda
                    takrorlanmaydi, lekin "manba"/"oxirgi yangilanish" belgilari qoladi:
                    ular raqamlarning qayerdan kelgani va qachonligini aytadi. */}
                {!embedded && (
                    <div>
                        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Reytinglar</h1>
                        <p className="text-gray-500 text-lg mt-1">Talabalar, kurslar, fakultetlar va klublar reytingi</p>
                    </div>
                )}
                <div className="flex flex-wrap gap-2">
                    <div className="px-4 py-2 bg-emerald-50 rounded-xl">
                        <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700"><CheckCircle2 size={13} /> Real ma'lumot asosida</p>
                        <p className="text-[10px] text-emerald-600/80 mt-0.5">Manba: rasmiy ijtimoiy faollik indeksi + akademik yozuv + davomat</p>
                    </div>
                    <div className="px-4 py-2 bg-gray-50 rounded-xl">
                        <p className="flex items-center gap-1.5 text-xs font-bold text-gray-600"><Clock size={13} /> Oxirgi yangilanish</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{generatedAt.toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                </div>
            </div>

            {/* Top 3 KPI (spec section 3) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <LeaderKpiCard
                    icon={GraduationCap} tone="indigo" title="Yetakchi fakultet"
                    name={topFaculty?.faculty} avgTas={topFaculty?.avgTas} growthPct={topFaculty?.growthPct}
                    footLabel={`${topFaculty?.activeCount ?? 0} faol talaba`}
                />
                <LeaderKpiCard
                    icon={BookOpen} tone="emerald" title="Yetakchi kurs"
                    name={topCourse ? `${topCourse.course}-kurs` : null} avgTas={topCourse?.avgTas} growthPct={topCourse?.growthPct}
                    footLabel={`${topCourse?.activeCount ?? 0} faol talaba`}
                />
                <LeaderKpiCard
                    icon={Trophy} tone="amber" title="Yetakchi klub"
                    name={topClub?.club?.name} avgTas={topClub?.avgTas} growthPct={topClub?.growthPct}
                    footLabel={`${topClub?.activeMembers ?? 0} faol a'zo`}
                />
            </div>

            {/* Tabs */}
            <div className="flex bg-gray-100 rounded-xl p-1 overflow-x-auto">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-3 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Fakultetlar (spec section 5) */}
            {activeTab === 'faculty' && (
                <div className="space-y-3">
                    <TabInfoBadges generatedAt={generatedAt} />
                    {facultyRankings.map(fac => (
                        <Card key={fac.faculty} className={`p-5 border ${getMedalBg(fac.rank)} ${getRankAccentBorder(fac.rank)} hover:shadow-md transition-all`}>
                            <div className="flex flex-wrap items-center gap-5">
                                <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center shrink-0">
                                    {getMedalIcon(fac.rank)}
                                </div>
                                <div className="flex-1 min-w-[160px]">
                                    <div className="flex items-center gap-3">
                                        <h3 className="font-bold text-gray-900">{fac.faculty}</h3>
                                        <Badge variant={TIER_BADGE_VARIANT[tierForTotal(fac.avgTas)]} size="sm">{tierForTotal(fac.avgTas)}</Badge>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-4 mt-1 text-xs text-gray-500">
                                        <span className="flex items-center gap-1"><Users size={12} />{fac.activeCount}/{fac.studentCount} faol talaba</span>
                                        <span>{fac.totalParticipations} jami qatnashuv</span>
                                        <span className="flex items-center gap-1"><Activity size={12} />Faollik indeksi: <strong className="text-gray-700">{fac.activityIndex}</strong></span>
                                        <GrowthBadge pct={fac.growthPct} />
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-3xl font-black text-indigo-600">{fac.avgTas}</p>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase">o'rtacha TAS</p>
                                </div>
                                <div className="hidden md:block w-40 shrink-0">
                                    <IndigoBar value={fac.avgTas} max={1000} />
                                </div>
                            </div>
                        </Card>
                    ))}
                    {facultyRankings.length === 0 && <p className="text-center text-sm text-gray-400 py-10">Ma'lumot topilmadi</p>}
                </div>
            )}

            {/* Kurslar (spec section 6) — replaces the old "Guruhlar" tab */}
            {activeTab === 'course' && (
                <div className="space-y-3">
                    <TabInfoBadges generatedAt={generatedAt} />
                    <Card className="p-0 border-none bg-white/80 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="text-left px-6 py-3 font-bold text-gray-500 uppercase tracking-wider text-xs">O'rin</th>
                                        <th className="text-left px-6 py-3 font-bold text-gray-500 uppercase tracking-wider text-xs">Kurs</th>
                                        <th className="text-center px-6 py-3 font-bold text-gray-500 uppercase tracking-wider text-xs">O'rtacha TAS</th>
                                        <th className="text-center px-6 py-3 font-bold text-gray-500 uppercase tracking-wider text-xs">Faol talabalar</th>
                                        <th className="text-center px-6 py-3 font-bold text-gray-500 uppercase tracking-wider text-xs">Jami qatnashuvlar</th>
                                        <th className="text-center px-6 py-3 font-bold text-gray-500 uppercase tracking-wider text-xs">Faollik indeksi</th>
                                        <th className="text-center px-6 py-3 font-bold text-gray-500 uppercase tracking-wider text-xs">O'sish</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {courseRankings.map(c => (
                                        <tr key={c.course} className={`hover:bg-indigo-50/30 transition-colors ${c.rank <= 3 ? getMedalBg(c.rank) : ''} ${getRankAccentBorder(c.rank)}`}>
                                            <td className="px-6 py-4">
                                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">{getMedalIcon(c.rank)}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-gray-900">{c.course}-kurs</span>
                                                    <Badge variant={TIER_BADGE_VARIANT[tierForTotal(c.avgTas)]} size="sm">{tierForTotal(c.avgTas)}</Badge>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center"><span className="font-black text-indigo-600 text-lg">{c.avgTas}</span></td>
                                            <td className="px-6 py-4 text-center text-gray-600">{c.activeCount}/{c.studentCount}</td>
                                            <td className="px-6 py-4 text-center text-gray-600">{c.totalParticipations}</td>
                                            <td className="px-6 py-4 text-center text-gray-600 font-semibold">{c.activityIndex}</td>
                                            <td className="px-6 py-4 text-center"><GrowthBadge pct={c.growthPct} /></td>
                                        </tr>
                                    ))}
                                    {courseRankings.length === 0 && (
                                        <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-400">Ma'lumot topilmadi</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {/* Global talabalar (spec section 7) — the existing StudentsManagement.jsx page, embedded
                verbatim. Nothing inside it is touched: search, filters, pagination, export, row click ->
                student modal, and the TAS "Skoring" section inside that modal all behave exactly as on
                the old standalone /admin/students route (which still works, see Sidebar.jsx). Only a
                wrapper header sits above it (polish patch, doesn't reach into the component itself). */}
            {activeTab === 'students' && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Global talabalar reytingi</h2>
                            <p className="text-sm text-gray-500 mt-0.5">Talabalar TAS va ijtimoiy faollik ko'rsatkichlari asosida saralanadi</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="success" size="sm">Real ma'lumot</Badge>
                            <Badge variant="primary" size="sm">TAS integratsiyasi</Badge>
                            <button
                                type="button"
                                onClick={handleExportStudentsExcel}
                                title="TAS reytingi bo'yicha saralangan Excel fayl (StudentsManagement ichidagi CSV eksportdan mustaqil)"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors"
                            >
                                <Download size={13} /> Excel eksport
                            </button>
                        </div>
                    </div>
                    <StudentsManagement />
                </div>
            )}

            {/* Global klublar (spec section 8) — new TAS-aware card grid on top of the existing,
                untouched GlobalClubsRankings.jsx table (its own real ledger/membership/event-based
                ranking logic is unchanged) so both the new "o'rtacha TAS" metric and the original
                sortable/exportable table are available. */}
            {activeTab === 'clubs' && (
                <div className="space-y-6">
                    <TabInfoBadges generatedAt={generatedAt} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {clubRankings.slice(0, 6).map(c => (
                            <Card key={c.club.id} className={`p-4 border ${getMedalBg(c.rank)} ${getRankAccentBorder(c.rank)}`}>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center shrink-0">{getMedalIcon(c.rank)}</div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-bold text-gray-900 text-sm truncate">{c.club.name}</p>
                                        <Badge variant={TIER_BADGE_VARIANT[tierForTotal(c.avgTas)]} size="sm">{tierForTotal(c.avgTas)} · {c.avgTas} TAS</Badge>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-center">
                                    <div>
                                        <p className="text-sm font-black text-gray-900">{c.activeMembers}/{c.memberCount}</p>
                                        <p className="text-[9px] text-gray-400 font-bold uppercase">Faol a'zo</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-gray-900">{c.activities}</p>
                                        <p className="text-[9px] text-gray-400 font-bold uppercase">Faoliyat</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-gray-900">{c.achievements}</p>
                                        <p className="text-[9px] text-gray-400 font-bold uppercase">Yutuq</p>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                    <GlobalClubsRankings />
                </div>
            )}

            {/* Kategoriyalar (spec section 9) — real "Besh tashabbus" club-category buckets */}
            {activeTab === 'category' && (
                <div className="space-y-4">
                    <TabInfoBadges generatedAt={generatedAt} />
                    <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                        <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-700 font-medium">
                            <strong>Bandlik</strong> kategoriyasi tarkibiga biznes, volontyorlik, notiqlik va boshqa mos yo'nalishlar ham kiritilgan.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                    {categoryRankings.map(cat => (
                        <Card key={cat.name} className="p-5 border-none bg-white/80 hover:shadow-md transition-all">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                                    <Sparkles size={18} className="text-indigo-600" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-gray-900 text-sm">{cat.name}</h4>
                                    <p className="text-[10px] text-gray-400">{cat.clubCount} ta klub · o'rtacha TAS {cat.avgTas}</p>
                                </div>
                                <GrowthBadge pct={cat.studentCount > 0 ? cat.growthPct : null} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-gray-50 rounded-xl text-center">
                                    <p className="text-xl font-black text-gray-900">{cat.activeStudents}</p>
                                    <p className="text-[9px] text-gray-400 font-bold uppercase">Faol talaba</p>
                                </div>
                                <div className="p-3 bg-gray-50 rounded-xl text-center">
                                    <p className="text-xl font-black text-gray-900">{cat.totalParticipations}</p>
                                    <p className="text-[9px] text-gray-400 font-bold uppercase">Jami qatnashuv</p>
                                </div>
                            </div>
                        </Card>
                    ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default RankingsPage;
