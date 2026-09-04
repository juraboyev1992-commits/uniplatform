import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Search, Filter, Download, Printer, X, Award, GraduationCap, Users2, Calendar, FileText } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { Pagination, SortableTh, RankChangeArrow } from '../../components/common/RankingsSharedUI';
import CopyableId from '../../components/common/CopyableId';
import { db } from '../../services/db';
import { PAGINATION } from '../../constants/index.js';

const LOOKBACK_DAYS = 30;

// Ties handled the same way as db.getLeaderboard(): equal scores share a rank, next rank skips accordingly
const assignRanks = (rows, scoreKey) => {
    const sorted = rows.slice().sort((a, b) => b[scoreKey] - a[scoreKey]);
    const rankMap = new Map();
    let rank = 1;
    sorted.forEach((row, i) => {
        if (i > 0 && sorted[i][scoreKey] < sorted[i - 1][scoreKey]) rank = i + 1;
        rankMap.set(row.id, rank);
    });
    return rankMap;
};

const GlobalStudentsRankings = () => {
    const students = useMemo(() => db.getMockStudents(), []);
    const allTransactions = useMemo(() => db.getSocialScoreTransactions(), []);

    const totalsByStudent = useMemo(() => {
        const map = new Map();
        allTransactions.forEach(t => map.set(t.studentId, (map.get(t.studentId) || 0) + t.points));
        return map;
    }, [allTransactions]);

    const lookbackTotalsByStudent = useMemo(() => {
        const cutoff = Date.now() - LOOKBACK_DAYS * 86400000;
        const map = new Map();
        allTransactions.forEach(t => {
            if (new Date(t.createdAt).getTime() <= cutoff) {
                map.set(t.studentId, (map.get(t.studentId) || 0) + t.points);
            }
        });
        return map;
    }, [allTransactions]);

    const baseRows = useMemo(() => students.map(s => ({
        ...s,
        totalScore: totalsByStudent.get(s.id) || 0,
        lookbackScore: lookbackTotalsByStudent.get(s.id) || 0
    })), [students, totalsByStudent, lookbackTotalsByStudent]);

    const currentRankMap = useMemo(() => assignRanks(baseRows, 'totalScore'), [baseRows]);
    const lookbackRankMap = useMemo(() => assignRanks(baseRows, 'lookbackScore'), [baseRows]);

    const rankedRows = useMemo(() => baseRows.map(r => ({
        ...r,
        rank: currentRankMap.get(r.id),
        rankChange: (lookbackRankMap.get(r.id) || 0) - (currentRankMap.get(r.id) || 0)
    })), [baseRows, currentRankMap, lookbackRankMap]);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFaculty, setSelectedFaculty] = useState('');
    const [selectedGroup, setSelectedGroup] = useState('');
    const [selectedCourse, setSelectedCourse] = useState('');
    const [minScore, setMinScore] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: 'totalScore', direction: 'desc' });
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = PAGINATION.DEFAULT_PAGE_SIZE;

    const faculties = useMemo(() => [...new Set(students.map(s => s.faculty))].sort(), [students]);
    const groups = useMemo(() => {
        let g = students;
        if (selectedFaculty) g = g.filter(s => s.faculty === selectedFaculty);
        return [...new Set(g.map(s => s.group))].sort();
    }, [students, selectedFaculty]);

    const filtered = useMemo(() => {
        let result = rankedRows;
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            result = result.filter(s => s.fullName.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q) || String(s.displayNumber) === q);
        }
        if (selectedFaculty) result = result.filter(s => s.faculty === selectedFaculty);
        if (selectedGroup) result = result.filter(s => s.group === selectedGroup);
        if (selectedCourse) result = result.filter(s => String(s.course) === selectedCourse);
        if (minScore !== '') result = result.filter(s => s.totalScore >= Number(minScore));

        return result.slice().sort((a, b) => {
            let aVal = a[sortConfig.key];
            let bVal = b[sortConfig.key];
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [rankedRows, searchQuery, selectedFaculty, selectedGroup, selectedCourse, minScore, sortConfig]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, selectedFaculty, selectedGroup, selectedCourse, minScore, sortConfig]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const triggerSort = (key) => {
        setSortConfig(prev => prev.key === key
            ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
            : { key, direction: key === 'fullName' || key === 'faculty' || key === 'group' ? 'asc' : 'desc' });
    };

    const hasActiveFilters = selectedFaculty || selectedGroup || selectedCourse || minScore !== '';
    const clearFilters = () => {
        setSelectedFaculty(''); setSelectedGroup(''); setSelectedCourse(''); setMinScore('');
    };

    // Drawer
    const [selectedStudent, setSelectedStudent] = useState(null);
    const studentTransactions = useMemo(() => {
        if (!selectedStudent) return [];
        return allTransactions
            .filter(t => t.studentId === selectedStudent.id)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }, [selectedStudent, allTransactions]);
    const socialCategories = useMemo(() => db.getSocialCriteriaCategories().filter(c => c.isActive && !c.isArchived), []);
    const categoryBreakdown = useMemo(() => {
        const map = {};
        studentTransactions.forEach(t => { map[t.category] = (map[t.category] || 0) + t.points; });
        return socialCategories.map(c => ({ key: c.key, name: c.name, points: map[c.key] || 0 }));
    }, [studentTransactions, socialCategories]);

    const handleExportExcel = () => {
        const rows = filtered.map(s => ({
            "O'rin": s.rank,
            'Talaba №': s.displayNumber,
            'F.I.Sh.': s.fullName,
            'Talaba ID': s.studentId,
            'Fakultet': s.faculty,
            'Guruh': s.group,
            'Kurs': s.course,
            'Jami ball': s.totalScore,
            "O'zgarish": s.rankChange > 0 ? `+${s.rankChange}` : String(s.rankChange)
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 6 }, { wch: 8 }, { wch: 30 }, { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Talabalar_Reytingi');
        XLSX.writeFile(wb, `talabalar_reytingi_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const handlePrint = () => window.print();

    return (
        <div className="space-y-6">
            {/* Print-only report header */}
            <div className="hidden print:block">
                <h2 className="text-xl font-bold text-gray-900">Global Talabalar Reytingi</h2>
                <p className="text-sm text-gray-500">
                    Sana: {new Date().toLocaleDateString('uz-UZ')}
                    {selectedFaculty && ` • Fakultet: ${selectedFaculty}`}
                    {selectedGroup && ` • Guruh: ${selectedGroup}`}
                    {selectedCourse && ` • Kurs: ${selectedCourse}-kurs`}
                    {searchQuery && ` • Qidiruv: "${searchQuery}"`}
                </p>
            </div>

            <div className="no-print space-y-6">
                {/* Toolbar */}
                <Card className="p-4 border-none bg-white/80">
                    <div className="flex flex-col md:flex-row flex-wrap gap-3">
                        <div className="flex-1 min-w-[220px] relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="Ism yoki talaba ID bo'yicha qidirish..."
                                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => setShowFilters(f => !f)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                                showFilters || hasActiveFilters ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            <Filter size={16} /> Filtrlar
                            {hasActiveFilters && (
                                <span className="bg-white/30 text-xs px-2 py-0.5 rounded-full">
                                    {[selectedFaculty, selectedGroup, selectedCourse, minScore !== '' ? '1' : ''].filter(Boolean).length}
                                </span>
                            )}
                        </button>
                        <Button variant="outline" onClick={handleExportExcel}>
                            <Download size={16} className="mr-2" /> Excel
                        </Button>
                        <Button variant="outline" onClick={handlePrint}>
                            <Printer size={16} className="mr-2" /> PDF (chop etish)
                        </Button>
                    </div>

                    {showFilters && (
                        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-3">
                            <select
                                value={selectedFaculty}
                                onChange={(e) => { setSelectedFaculty(e.target.value); setSelectedGroup(''); }}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">Barcha fakultetlar</option>
                                {faculties.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                            <select
                                value={selectedGroup}
                                onChange={(e) => setSelectedGroup(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">Barcha guruhlar</option>
                                {groups.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                            <select
                                value={selectedCourse}
                                onChange={(e) => setSelectedCourse(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">Barcha kurslar</option>
                                {[1, 2, 3, 4].map(c => <option key={c} value={c}>{c}-kurs</option>)}
                            </select>
                            <input
                                type="number"
                                min="0"
                                placeholder="Min. ball"
                                value={minScore}
                                onChange={(e) => setMinScore(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                            />
                            {hasActiveFilters && (
                                <button onClick={clearFilters} className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800 font-medium">
                                    <X size={14} /> Filtrlarni tozalash
                                </button>
                            )}
                        </div>
                    )}
                </Card>

                {/* Interactive table */}
                <Card className="p-0 border-none bg-white/80 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <SortableTh label="O'rin" sortKey="rank" sortConfig={sortConfig} onSort={triggerSort} />
                                    <SortableTh label="Talaba" sortKey="fullName" sortConfig={sortConfig} onSort={triggerSort} />
                                    <SortableTh label="Fakultet" sortKey="faculty" sortConfig={sortConfig} onSort={triggerSort} />
                                    <SortableTh label="Guruh" sortKey="group" sortConfig={sortConfig} onSort={triggerSort} />
                                    <SortableTh label="Kurs" sortKey="course" sortConfig={sortConfig} onSort={triggerSort} />
                                    <SortableTh label="Jami ball" sortKey="totalScore" sortConfig={sortConfig} onSort={triggerSort} />
                                    <SortableTh label="O'zgarish" sortKey="rankChange" sortConfig={sortConfig} onSort={triggerSort} />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {paginated.map(s => (
                                    <tr
                                        key={s.id}
                                        onClick={() => setSelectedStudent(s)}
                                        className="hover:bg-indigo-50/30 transition-colors cursor-pointer"
                                    >
                                        <td className="px-5 py-3 font-bold text-gray-500">#{s.rank}</td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                                                    {s.fullName.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900">{s.fullName}</p>
                                                    <p className="text-xs text-gray-400">
                                                        <CopyableId value={`Talaba #${s.displayNumber}`}>Talaba #{s.displayNumber}</CopyableId>
                                                        {' · '}{s.studentId}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-gray-500">{s.faculty}</td>
                                        <td className="px-5 py-3 text-gray-500">{s.group}</td>
                                        <td className="px-5 py-3 text-gray-500">{s.course}</td>
                                        <td className="px-5 py-3 font-black text-indigo-600">{s.totalScore}</td>
                                        <td className="px-5 py-3"><RankChangeArrow change={s.rankChange} /></td>
                                    </tr>
                                ))}
                                {paginated.length === 0 && (
                                    <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-gray-400">Talabalar topilmadi</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        totalItems={filtered.length}
                        pageSize={pageSize}
                    />
                </Card>
            </div>

            {/* Print-only full table (all filtered rows, not just current page) */}
            <table className="hidden print:table w-full text-sm">
                <thead>
                    <tr>
                        <th className="text-left px-2 py-2 border-b">O'rin</th>
                        <th className="text-left px-2 py-2 border-b">Talaba</th>
                        <th className="text-left px-2 py-2 border-b">Fakultet</th>
                        <th className="text-left px-2 py-2 border-b">Guruh</th>
                        <th className="text-left px-2 py-2 border-b">Kurs</th>
                        <th className="text-left px-2 py-2 border-b">Jami ball</th>
                        <th className="text-left px-2 py-2 border-b">O'zgarish</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(s => (
                        <tr key={s.id}>
                            <td className="px-2 py-1 border-b">#{s.rank}</td>
                            <td className="px-2 py-1 border-b">{s.fullName} ({s.studentId})</td>
                            <td className="px-2 py-1 border-b">{s.faculty}</td>
                            <td className="px-2 py-1 border-b">{s.group}</td>
                            <td className="px-2 py-1 border-b">{s.course}</td>
                            <td className="px-2 py-1 border-b">{s.totalScore}</td>
                            <td className="px-2 py-1 border-b">{s.rankChange > 0 ? `+${s.rankChange}` : s.rankChange}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Profile drawer */}
            {selectedStudent && (
                <div className="fixed inset-0 z-50 flex justify-end no-print">
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity" onClick={() => setSelectedStudent(null)} />
                    <div className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col z-10">
                        <div className="p-6 border-b flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg">
                                    {selectedStudent.fullName.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-lg leading-tight text-gray-900">{selectedStudent.fullName}</h3>
                                    <p className="text-xs text-gray-400">ID: {selectedStudent.studentId}</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedStudent(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-gray-50 rounded-xl">
                                    <p className="text-xs text-gray-400 flex items-center gap-1"><GraduationCap size={12} /> Fakultet</p>
                                    <p className="text-sm font-semibold text-gray-900 mt-1">{selectedStudent.faculty}</p>
                                </div>
                                <div className="p-3 bg-gray-50 rounded-xl">
                                    <p className="text-xs text-gray-400 flex items-center gap-1"><Users2 size={12} /> Guruh / Kurs</p>
                                    <p className="text-sm font-semibold text-gray-900 mt-1">{selectedStudent.group} • {selectedStudent.course}-kurs</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-3 bg-indigo-500/5 rounded-xl text-center">
                                    <p className="text-2xl font-black text-indigo-600">{selectedStudent.totalScore}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Jami ball</p>
                                </div>
                                <div className="p-3 bg-amber-500/5 rounded-xl text-center">
                                    <p className="text-2xl font-black text-amber-600">#{selectedStudent.rank}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">O'rin</p>
                                </div>
                                <div className="p-3 bg-gray-50 rounded-xl text-center flex flex-col items-center justify-center">
                                    <RankChangeArrow change={selectedStudent.rankChange} size="lg" />
                                    <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">{LOOKBACK_DAYS} kunda</p>
                                </div>
                            </div>

                            <div>
                                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><Award size={16} className="text-indigo-600" /> Mezonlar bo'yicha taqsimot</h4>
                                <div className="space-y-1.5">
                                    {categoryBreakdown.map(c => (
                                        <div key={c.key} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg text-sm">
                                            <span className="text-gray-600">{c.name}</span>
                                            <span className={`font-bold ${c.points > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>{c.points}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><FileText size={16} className="text-indigo-600" /> Tranzaksiyalar tarixi</h4>
                                {studentTransactions.length === 0 ? (
                                    <p className="text-xs text-gray-400 text-center py-4">Hozircha tranzaksiyalar yo'q</p>
                                ) : (
                                    <div className="space-y-2">
                                        {studentTransactions.map(t => (
                                            <div key={t.id} className="p-3 border border-gray-100 rounded-xl">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-semibold text-gray-900">{t.scoringSourceName}</span>
                                                    <span className="text-sm font-bold text-emerald-600">+{t.points}</span>
                                                </div>
                                                <div className="flex items-center justify-between mt-1">
                                                    <span className="text-xs text-gray-400 flex items-center gap-1">
                                                        <Calendar size={11} /> {new Date(t.createdAt).toLocaleDateString('uz-UZ')}
                                                    </span>
                                                    <span className="text-xs text-gray-400">{t.createdBy}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-4 border-t bg-gray-50 flex gap-3">
                            <button
                                onClick={() => setSelectedStudent(null)}
                                className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition-colors"
                            >
                                Yopish
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GlobalStudentsRankings;
