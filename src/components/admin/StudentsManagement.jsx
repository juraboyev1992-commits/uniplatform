import React, { useState, useMemo, useRef } from 'react';
import {
    Users, Search, Filter, Download, Eye, ChevronDown, ChevronUp,
    GraduationCap, Award, BookOpen, Calendar, Trophy, BarChart3,
    Mail, Phone, MapPin, Clock, ArrowUpDown, X, UserCheck, TrendingUp
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import ProgressBar from '../common/ProgressBar';
import CopyableId from '../common/CopyableId';
import Pagination from '../common/Pagination';
import ScoreCardExport from '../common/ScoreCardExport';
import TasVerificationFooter from '../common/TasVerificationFooter';
import { db } from '../../services/db';
import { computeStudentTAS, getTasTrendMonths, TAS_TIERS } from '../../utils/studentScoring';
import { getStudentAttendanceParticipationSummary } from '../../utils/rankingsAnalytics';

const TAS_TREND_MONTHS = getTasTrendMonths();
const CURRENT_YEAR = new Date().getFullYear();

const StudentsManagement = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFaculty, setSelectedFaculty] = useState('');
    const [selectedGroup, setSelectedGroup] = useState('');
    // Default view: TAS descending (ties -> Ijtimoiy ball desc -> Oxirgi faollik desc, see the
    // comparator below) — per Reytinglar "Global talabalar" integration; clicking any column header
    // still re-sorts normally exactly as before, this only changes the initial state.
    const [sortField, setSortField] = useState('tasTotal');
    const [sortDir, setSortDir] = useState('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [showFilters, setShowFilters] = useState(false);
    const modalContentRef = useRef(null);

    const allStudents = useMemo(() => {
        const students = db.getMockStudents();
        const socialCategories = db.getSocialCriteriaCategories().filter(c => c.isActive && !c.isArchived);
        // Enrich with random social activity data
        return students.map((s, i) => {
            const criteria = socialCategories.map(c => ({
                ...c,
                score: Math.floor(Math.random() * (c.maxPoints + 1))
            }));
            const tas = computeStudentTAS(db, s.id);
            return {
                ...s,
                socialScore: Math.floor(30 + Math.random() * 70),
                booksRead: Math.floor(Math.random() * 25),
                // Real count (Davomat feature) — replaces what used to be a re-randomized Math.random()
                // on every render. Union of directly-provable registrations + real 'present' attendance
                // marks for the current calendar year (see getStudentAttendanceParticipationSummary).
                eventsAttended: getStudentAttendanceParticipationSummary(db, s.id, CURRENT_YEAR).eventsCount,
                testsCompleted: Math.floor(Math.random() * 15),
                clubsJoined: Math.floor(1 + Math.random() * 4),
                attendance: Math.floor(60 + Math.random() * 40),
                gpa: (2.5 + Math.random() * 1.5).toFixed(2),
                phone: `+998 ${90 + (i % 10)}${String(1000000 + Math.floor(Math.random() * 9000000)).slice(0, 7).replace(/(\d{3})(\d{2})(\d{2})/, ' $1-$2-$3')}`,
                email: `${s.fullName.split(' ').join('.').toLowerCase()}@uni.uz`,
                address: 'Toshkent sh., Mirzo Ulug\'bek tumani',
                enrollmentDate: `2023-09-01`,
                status: Math.random() > 0.1 ? 'active' : 'inactive',
                criteria,
                // Shared with the student's own "Mening profilim" page (ProfilePage.jsx) via
                // computeStudentTAS — same function, same studentId, so both surfaces always agree.
                tas,
                // Flat copy of tas.total so the existing generic `a[sortField]` comparator below can
                // sort by it like any other column, without needing to know about nested objects.
                tasTotal: tas.total
            };
        });
    }, []);

    const faculties = useMemo(() => [...new Set(allStudents.map(s => s.faculty))].sort(), [allStudents]);
    const groups = useMemo(() => {
        let g = allStudents;
        if (selectedFaculty) g = g.filter(s => s.faculty === selectedFaculty);
        return [...new Set(g.map(s => s.group))].sort();
    }, [allStudents, selectedFaculty]);

    const filtered = useMemo(() => {
        let result = [...allStudents];
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(s =>
                s.fullName.toLowerCase().includes(q) ||
                s.studentId.toLowerCase().includes(q) ||
                s.group.toLowerCase().includes(q) ||
                String(s.displayNumber) === q.trim()
            );
        }
        if (selectedFaculty) result = result.filter(s => s.faculty === selectedFaculty);
        if (selectedGroup) result = result.filter(s => s.group === selectedGroup);

        result.sort((a, b) => {
            let aVal = a[sortField];
            let bVal = b[sortField];
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
            // Default view (TAS) tie-break: Ijtimoiy ball desc, then Oxirgi faollik desc — only applies
            // while sorted by tasTotal, every other column keeps its original single-key behavior.
            if (sortField === 'tasTotal') {
                if (a.socialScore !== b.socialScore) return b.socialScore - a.socialScore;
                const aActivity = a.tas.activityHistory[0]?.date || '';
                const bActivity = b.tas.activityHistory[0]?.date || '';
                if (aActivity !== bActivity) return aActivity > bActivity ? -1 : 1;
            }
            return 0;
        });
        return result;
    }, [allStudents, searchQuery, selectedFaculty, selectedGroup, sortField, sortDir]);

    const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
    const rowOffset = pageSize === 'all' ? 0 : (currentPage - 1) * pageSize;
    const paginatedStudents = pageSize === 'all' ? filtered : filtered.slice(rowOffset, rowOffset + pageSize);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    const getScoreColor = (score) => {
        if (score >= 90) return 'text-emerald-600 bg-emerald-50';
        if (score >= 70) return 'text-blue-600 bg-blue-50';
        if (score >= 50) return 'text-amber-600 bg-amber-50';
        return 'text-red-600 bg-red-50';
    };

    const getScoreBadge = (score) => {
        if (score >= 90) return 'excellent';
        if (score >= 70) return 'good';
        if (score >= 50) return 'average';
        return 'poor';
    };

    const handleExport = () => {
        const headers = ['#', 'Talaba №', 'F.I.Sh.', 'Talaba ID', 'Fakultet', 'Guruh', 'Ijtimoiy ball', 'GPA', 'Davomat', 'Holat'];
        const rows = filtered.map((s, i) => [
            i + 1, s.displayNumber, s.fullName, s.studentId, s.faculty, s.group,
            s.socialScore, s.gpa, s.attendance + '%', s.status === 'active' ? 'Faol' : 'Nofaol'
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `talabalar_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
    };

    // Summary stats
    const avgScore = Math.round(filtered.reduce((s, st) => s + st.socialScore, 0) / (filtered.length || 1));
    const activeCount = filtered.filter(s => s.status === 'active').length;
    const topCount = filtered.filter(s => s.socialScore >= 80).length;

    const SortIcon = ({ field }) => {
        if (sortField !== field) return <ArrowUpDown size={14} className="text-gray-300" />;
        return sortDir === 'asc'
            ? <ChevronUp size={14} className="text-indigo-600" />
            : <ChevronDown size={14} className="text-indigo-600" />;
    };

    return (
        <div className="space-y-6 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Talabalar boshqaruvi</h1>
                    <p className="text-gray-500 text-lg mt-1">Barcha talabalarni boshqarish va monitoring</p>
                </div>
                <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
                >
                    <Download size={18} />
                    CSV eksport
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {[
                    { label: 'Jami talabalar', value: filtered.length, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: 'Faol talabalar', value: activeCount, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'O\'rtacha ball', value: avgScore, icon: BarChart3, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: 'Top talabalar (80+)', value: topCount, icon: Trophy, color: 'text-purple-600', bg: 'bg-purple-50' },
                ].map((stat, i) => (
                    <Card key={i} className="p-5 border-none bg-white/80 backdrop-blur-sm shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-2xl ${stat.bg}`}>
                                <stat.icon size={22} className={stat.color} />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                                <p className="text-2xl font-black text-gray-900">{stat.value}</p>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Search and Filters */}
            <Card className="p-5 border-none bg-white/80">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Ism, ID yoki guruh bo'yicha qidirish..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                        />
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all text-sm ${showFilters ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                        <Filter size={16} />
                        Filterlar
                        {(selectedFaculty || selectedGroup) && (
                            <span className="bg-white/30 text-xs px-2 py-0.5 rounded-full">{[selectedFaculty, selectedGroup].filter(Boolean).length}</span>
                        )}
                    </button>
                </div>

                {showFilters && (
                    <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Fakultet</label>
                            <select
                                value={selectedFaculty}
                                onChange={(e) => { setSelectedFaculty(e.target.value); setSelectedGroup(''); setCurrentPage(1); }}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">Barcha fakultetlar</option>
                                {faculties.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Guruh</label>
                            <select
                                value={selectedGroup}
                                onChange={(e) => { setSelectedGroup(e.target.value); setCurrentPage(1); }}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">Barcha guruhlar</option>
                                {groups.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                        </div>
                        {(selectedFaculty || selectedGroup) && (
                            <button
                                onClick={() => { setSelectedFaculty(''); setSelectedGroup(''); setCurrentPage(1); }}
                                className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800 font-medium"
                            >
                                <X size={14} /> Filterlarni tozalash
                            </button>
                        )}
                    </div>
                )}
            </Card>

            {/* Students Table */}
            <Card className="p-0 border-none bg-white/80 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="text-left px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">#</th>
                                <th
                                    className="text-left px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs cursor-pointer hover:text-indigo-600 transition-colors"
                                    onClick={() => handleSort('fullName')}
                                >
                                    <span className="flex items-center gap-2">Talaba <SortIcon field="fullName" /></span>
                                </th>
                                <th className="text-left px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">Guruh</th>
                                <th className="text-left px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">Fakultet</th>
                                <th
                                    className="text-center px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs cursor-pointer hover:text-indigo-600 transition-colors"
                                    onClick={() => handleSort('socialScore')}
                                >
                                    <span className="flex items-center justify-center gap-2">Ijtimoiy ball <SortIcon field="socialScore" /></span>
                                </th>
                                <th
                                    className="text-center px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs cursor-pointer hover:text-indigo-600 transition-colors"
                                    onClick={() => handleSort('gpa')}
                                >
                                    <span className="flex items-center justify-center gap-2">GPA <SortIcon field="gpa" /></span>
                                </th>
                                <th className="text-center px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">Holat</th>
                                <th className="text-center px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">Amallar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {paginatedStudents.map((student, idx) => (
                                <tr key={student.id} className="hover:bg-indigo-50/30 transition-colors">
                                    <td className="px-6 py-4 text-gray-400 font-mono text-xs">{rowOffset + idx + 1}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                                                {student.fullName.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-900">{student.fullName}</p>
                                                <p className="text-xs text-gray-400">
                                                    <CopyableId value={`Talaba #${student.displayNumber}`}>Talaba #{student.displayNumber}</CopyableId>
                                                    {' · '}{student.studentId}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium">{student.group}</span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 text-xs">{student.faculty}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold ${getScoreColor(student.socialScore)}`}>
                                            {student.socialScore}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center font-semibold text-gray-700">{student.gpa}</td>
                                    <td className="px-6 py-4 text-center">
                                        <Badge variant={student.status === 'active' ? 'success' : 'danger'} size="sm">
                                            {student.status === 'active' ? 'Faol' : 'Nofaol'}
                                        </Badge>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button
                                            onClick={() => setSelectedStudent(student)}
                                            className="p-2 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
                                            title="Batafsil ko'rish"
                                        >
                                            <Eye size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-4 border-t border-gray-100">
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        totalItems={filtered.length}
                        pageSize={pageSize}
                        onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
                        pageSizeOptions={[10, 20, 30, 100, 'all']}
                    />
                </div>
            </Card>

            {/* Student Detail Modal */}
            <Modal
                isOpen={!!selectedStudent}
                onClose={() => setSelectedStudent(null)}
                title={selectedStudent?.fullName || 'Talaba ma\'lumotlari'}
                size="xl"
            >
                {selectedStudent && (
                    <div className="space-y-6" ref={modalContentRef}>
                        {/* Top info row */}
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="flex items-center gap-4">
                                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center text-white font-black text-3xl shadow-lg">
                                    {selectedStudent.fullName.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">{selectedStudent.fullName}</h3>
                                    <p className="text-sm text-gray-500">{selectedStudent.studentId}</p>
                                    <Badge variant={selectedStudent.status === 'active' ? 'success' : 'danger'} size="sm" className="mt-1">
                                        {selectedStudent.status === 'active' ? 'Faol' : 'Nofaol'}
                                    </Badge>
                                </div>
                            </div>
                            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[
                                    { icon: GraduationCap, label: 'Fakultet', value: selectedStudent.faculty },
                                    { icon: Users, label: 'Guruh', value: selectedStudent.group },
                                    { icon: Mail, label: 'Email', value: selectedStudent.email },
                                    { icon: Clock, label: 'Qabul yili', value: '2023' },
                                ].map((item, i) => (
                                    <div key={i} className="bg-gray-50 rounded-xl p-3">
                                        <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                                            <item.icon size={12} />
                                            <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
                                        </div>
                                        <p className="text-xs font-semibold text-gray-800 break-words">{item.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Skoring — Talaba Analitik Skori (TAS). Additive: sits above the existing
                            "Score Overview"/"11 mezon" sections below, which are untouched.
                            data-html2canvas-ignore keeps this header row (and the button itself) out of
                            the exported PDF — html2canvas skips any element carrying that attribute,
                            still renders normally on screen, per direct feedback. */}
                        <div className="flex items-center justify-between" data-html2canvas-ignore="true">
                            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Skoring</h3>
                            <ScoreCardExport
                                contentRef={modalContentRef}
                                fileName={`${selectedStudent.fullName}_TAS_hisobot`}
                            />
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="bg-indigo-50 rounded-2xl p-5 flex items-center gap-5">
                                <div className="relative w-28 h-28 shrink-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={[
                                                    { value: selectedStudent.tas.total },
                                                    { value: Math.max(0, 1000 - selectedStudent.tas.total) }
                                                ]}
                                                dataKey="value" startAngle={90} endAngle={-270}
                                                innerRadius={38} outerRadius={50} stroke="none"
                                            >
                                                <Cell fill="#4F46E5" />
                                                <Cell fill="#E0E7FF" />
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-xl font-black text-gray-900">{selectedStudent.tas.total}</span>
                                        <span className="text-[10px] text-gray-400 font-bold">/ 1000</span>
                                    </div>
                                </div>
                                <div className="min-w-0">
                                    <h4 className="font-bold text-gray-900 text-sm">Talaba Analitik Skori (TAS)</h4>
                                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                        Talabaning akademik muvaffaqiyati, ijtimoiy faolligi, liderlik salohiyati va intizomiy ishonchliligini kompleks baholaydigan analitik ko'rsatkich.
                                    </p>
                                    <span className={`inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full text-[11px] font-bold ${selectedStudent.tas.delta >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                        {selectedStudent.tas.delta >= 0 ? '↑' : '↓'} {Math.abs(selectedStudent.tas.delta)} · O'tgan oyga nisbatan
                                    </span>
                                </div>
                            </div>

                            {/* Label+value+bar rows at full card width — a donut used to sit beside this
                                list (matching the TAS card's gauge), but it squeezed the text column down
                                to the point that longer labels ("Ijtimoiy faollik skori", "Ishonchlilik
                                skori") got truncated/hard to read. Dropped in favor of the same clearer,
                                full-width layout ProfilePage.jsx's own Skoring section already uses. */}
                            <div className="bg-gray-50 rounded-2xl p-5">
                                <p className="text-xs font-bold text-gray-700 mb-3">Skor tarkibi</p>
                                <div className="space-y-3">
                                    {[
                                        { label: 'Akademik skori', value: selectedStudent.tas.academicScore, max: 400, dot: 'bg-indigo-600' },
                                        { label: 'Ijtimoiy faollik skori', value: selectedStudent.tas.socialFaollikScore, max: 300, dot: 'bg-emerald-500' },
                                        { label: 'Liderlik skori', value: selectedStudent.tas.leadershipScore, max: 150, dot: 'bg-amber-500' },
                                        { label: 'Ishonchlilik skori', value: selectedStudent.tas.reliabilityScore, max: 150, dot: 'bg-blue-500' }
                                    ].map(row => (
                                        <div key={row.label}>
                                            <div className="flex items-center justify-between text-xs mb-1">
                                                <span className="flex items-center gap-1.5 text-gray-600"><span className={`w-2 h-2 rounded-full shrink-0 ${row.dot}`} />{row.label}</span>
                                                <span className="font-bold text-gray-800 shrink-0">{row.value}/{row.max} ({Math.round((row.value / row.max) * 100)}%)</span>
                                            </div>
                                            <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                                                <div className={`h-full rounded-full ${row.dot}`} style={{ width: `${Math.min(100, Math.round((row.value / row.max) * 100))}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-right text-xs font-bold text-indigo-700 mt-3">Jami: {selectedStudent.tas.total} / 1000</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="bg-white border border-gray-100 rounded-2xl p-4">
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Skor dinamikasi (so'nggi 6 oy)</h4>
                                <ResponsiveContainer width="100%" height={160}>
                                    <LineChart data={selectedStudent.tas.trend.map((v, idx) => ({ month: TAS_TREND_MONTHS[idx], value: v }))}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                                        <Tooltip />
                                        <Line type="monotone" dataKey="value" stroke="#4F46E5" strokeWidth={2.5} dot={{ r: 3 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="bg-white border border-gray-100 rounded-2xl p-4">
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-1.5">
                                    <Trophy size={12} /> Reyting darajalari
                                </h4>
                                <div className="space-y-1.5">
                                    {TAS_TIERS.map(t => (
                                        <div
                                            key={t.label}
                                            className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs ${selectedStudent.tas.tier === t.label ? 'bg-indigo-50 border border-indigo-200 font-bold text-indigo-700' : 'text-gray-500'}`}
                                        >
                                            <span>{t.label}</span>
                                            <span>{t.range}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {selectedStudent.tas.recommendations.length > 0 && (
                            <div className="bg-indigo-50 rounded-2xl p-4" data-html2canvas-ignore="true">
                                <h4 className="text-xs font-bold text-indigo-700 uppercase mb-3">Rivojlanish tavsiyalari</h4>
                                <div className="space-y-2">
                                    {selectedStudent.tas.recommendations.map((r, i) => (
                                        <div key={i} className="flex items-start gap-2.5 bg-white rounded-xl p-3">
                                            <UserCheck size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-gray-800">{r.text}</p>
                                                <p className="text-[11px] text-gray-500 mt-0.5">{r.detail}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Faoliyat tarixi</h4>
                            {selectedStudent.tas.activityHistory.length === 0 ? (
                                <p className="text-xs text-gray-400">Tasdiqlangan faoliyat topilmadi</p>
                            ) : (
                                <div className="space-y-3">
                                    {selectedStudent.tas.activityHistory.map((h, i) => (
                                        <div key={i} className="relative pl-4 border-l-2 border-indigo-100 flex items-center justify-between gap-2">
                                            <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-indigo-500" />
                                            <div className="min-w-0">
                                                <p className="text-xs font-semibold text-gray-800 truncate">{h.title}</p>
                                                <p className="text-[10px] text-gray-400">{new Date(h.date).toLocaleDateString('uz-UZ')}</p>
                                            </div>
                                            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">+{h.delta}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {selectedStudent.tas.achievements.length > 0 && (
                            <div>
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Yutuqlar</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {selectedStudent.tas.achievements.map((a, i) => (
                                        <div key={i} className="flex items-center gap-2.5 bg-amber-50 rounded-xl p-3">
                                            <Award className="text-amber-500 shrink-0" size={20} />
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-gray-800 truncate">{a.title}</p>
                                                <p className="text-[10px] text-gray-400 truncate">{a.subtitle}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Score Overview */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {[
                                { label: 'Ijtimoiy ball', value: selectedStudent.socialScore, color: getScoreColor(selectedStudent.socialScore) },
                                { label: 'GPA', value: selectedStudent.gpa, color: 'text-indigo-600 bg-indigo-50' },
                                { label: 'Kitoblar', value: selectedStudent.booksRead, color: 'text-amber-600 bg-amber-50' },
                                { label: 'Tadbirlar', value: selectedStudent.eventsAttended, color: 'text-emerald-600 bg-emerald-50' },
                                { label: 'Davomat', value: selectedStudent.attendance + '%', color: 'text-blue-600 bg-blue-50' },
                            ].map((item, i) => (
                                <div key={i} className={`rounded-xl p-4 text-center ${item.color}`}>
                                    <p className="text-2xl font-black">{item.value}</p>
                                    <p className="text-[10px] font-bold uppercase tracking-wider mt-1 opacity-70">{item.label}</p>
                                </div>
                            ))}
                        </div>

                        {/* Activity Criteria Breakdown */}
                        <div>
                            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <BarChart3 size={16} className="text-indigo-600" />
                                Ijtimoiy faollik tafsiloti ({selectedStudent.criteria.length} mezon)
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {selectedStudent.criteria.map((c, i) => (
                                    <div key={i} className="flex items-center gap-6">
                                        <div className="flex-1">
                                            <ProgressBar
                                                value={c.score}
                                                max={c.maxPoints}
                                                label={c.name}
                                                color="auto"
                                                size="sm"
                                            />
                                        </div>
                                        <span className="text-xs font-bold text-gray-500 w-12 text-right shrink-0">
                                            {c.score}/{c.maxPoints}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <TasVerificationFooter verifyId={`TAS-${selectedStudent.displayNumber || selectedStudent.studentId}`} />
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default StudentsManagement;
