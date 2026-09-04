import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Search, Download, Printer, X, Users2, Award, Calendar, Crown } from 'lucide-react';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import { SortableTh, RankChangeArrow } from '../../components/common/RankingsSharedUI';
import CopyableId from '../../components/common/CopyableId';
import { db } from '../../services/db';

const LOOKBACK_DAYS = 30;

const ROLE_BADGE_VARIANT = {
    head_coordinator: 'excellent',
    coordinator: 'good',
    volunteer: 'average',
    smm: 'average',
    member: 'default'
};
const ROLE_LABEL = {
    head_coordinator: "Rahbar",
    coordinator: 'Muvofiqlashtiruvchi',
    volunteer: 'Volontyor',
    smm: 'SMM',
    member: "A'zo"
};

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

const GlobalClubsRankings = () => {
    const clubs = useMemo(() => db.getClubs(), []);
    const allMemberships = useMemo(() => db.getMemberships(), []);
    const allTransactions = useMemo(() => db.getSocialScoreTransactions(), []);
    const allEvents = useMemo(() => db.getEvents(), []);
    const cutoff = useMemo(() => Date.now() - LOOKBACK_DAYS * 86400000, []);

    const studentTotalsCurrent = useMemo(() => {
        const map = new Map();
        allTransactions.forEach(t => map.set(t.studentId, (map.get(t.studentId) || 0) + t.points));
        return map;
    }, [allTransactions]);

    const studentTotalsLookback = useMemo(() => {
        const map = new Map();
        allTransactions.forEach(t => {
            if (new Date(t.createdAt).getTime() <= cutoff) {
                map.set(t.studentId, (map.get(t.studentId) || 0) + t.points);
            }
        });
        return map;
    }, [allTransactions, cutoff]);

    const membershipsByClub = useMemo(() => {
        const map = new Map();
        allMemberships.forEach(m => {
            if (!map.has(m.clubId)) map.set(m.clubId, []);
            map.get(m.clubId).push(m);
        });
        return map;
    }, [allMemberships]);

    const eventsByClub = useMemo(() => {
        const map = new Map();
        allEvents.forEach(e => {
            if (!map.has(e.clubId)) map.set(e.clubId, []);
            map.get(e.clubId).push(e);
        });
        return map;
    }, [allEvents]);

    const baseRows = useMemo(() => clubs.map(club => {
        const members = membershipsByClub.get(club.id) || [];
        const membersTotalCurrent = members.reduce((s, m) => s + (studentTotalsCurrent.get(m.userId) || 0), 0);
        const membersTotalLookback = members.reduce((s, m) => s + (studentTotalsLookback.get(m.userId) || 0), 0);

        const completedEvents = (eventsByClub.get(club.id) || []).filter(e => e.status === 'completed');
        const eventsTotalCurrent = completedEvents.reduce(
            (sum, e) => sum + (e.participants || []).reduce((s, p) => s + (p.score || 0), 0), 0
        );
        const eventsTotalLookback = completedEvents
            .filter(e => new Date(e.date).getTime() <= cutoff)
            .reduce((sum, e) => sum + (e.participants || []).reduce((s, p) => s + (p.score || 0), 0), 0);

        return {
            ...club,
            memberCount: members.length,
            combinedTotal: membersTotalCurrent + eventsTotalCurrent,
            lookbackTotal: membersTotalLookback + eventsTotalLookback
        };
    }), [clubs, membershipsByClub, eventsByClub, studentTotalsCurrent, studentTotalsLookback, cutoff]);

    const currentRankMap = useMemo(() => assignRanks(baseRows, 'combinedTotal'), [baseRows]);
    const lookbackRankMap = useMemo(() => assignRanks(baseRows, 'lookbackTotal'), [baseRows]);

    const rankedRows = useMemo(() => baseRows.map(r => ({
        ...r,
        rank: currentRankMap.get(r.id),
        rankChange: (lookbackRankMap.get(r.id) || 0) - (currentRankMap.get(r.id) || 0)
    })), [baseRows, currentRankMap, lookbackRankMap]);

    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'combinedTotal', direction: 'desc' });

    const categories = useMemo(() => [...new Set(clubs.map(c => c.category))].sort(), [clubs]);

    const filtered = useMemo(() => {
        let result = rankedRows;
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            result = result.filter(c => c.name.toLowerCase().includes(q) || String(c.displayNumber) === q);
        }
        if (categoryFilter) result = result.filter(c => c.category === categoryFilter);

        return result.slice().sort((a, b) => {
            let aVal = a[sortConfig.key];
            let bVal = b[sortConfig.key];
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [rankedRows, searchQuery, categoryFilter, sortConfig]);

    const triggerSort = (key) => {
        setSortConfig(prev => prev.key === key
            ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
            : { key, direction: key === 'name' || key === 'category' ? 'asc' : 'desc' });
    };

    const [selectedClub, setSelectedClub] = useState(null);
    const breakdown = useMemo(() => selectedClub ? db.getClubScoreBreakdown(selectedClub.id) : null, [selectedClub]);

    const handleExportExcel = () => {
        const rows = filtered.map(c => ({
            "O'rin": c.rank,
            'Klub №': c.displayNumber,
            'Nomi': c.name,
            'Kategoriya': c.category,
            "A'zolar soni": c.memberCount,
            'Jami ball': c.combinedTotal,
            "O'zgarish": c.rankChange > 0 ? `+${c.rankChange}` : String(c.rankChange)
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 6 }, { wch: 8 }, { wch: 30 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Klublar_Reytingi');
        XLSX.writeFile(wb, `klublar_reytingi_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const handlePrint = () => window.print();

    return (
        <div className="space-y-6">
            <div className="hidden print:block">
                <h2 className="text-xl font-bold text-gray-900">Global Klublar Reytingi</h2>
                <p className="text-sm text-gray-500">
                    Sana: {new Date().toLocaleDateString('uz-UZ')}
                    {categoryFilter && ` • Kategoriya: ${categoryFilter}`}
                    {searchQuery && ` • Qidiruv: "${searchQuery}"`}
                </p>
            </div>

            <Card className="p-4 border-none bg-white/80 no-print">
                <div className="flex flex-col md:flex-row flex-wrap gap-3">
                    <div className="flex-1 min-w-[220px] relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Klub nomi bo'yicha qidirish..."
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="">Barcha kategoriyalar</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <Button variant="outline" onClick={handleExportExcel}>
                        <Download size={16} className="mr-2" /> Excel
                    </Button>
                    <Button variant="outline" onClick={handlePrint}>
                        <Printer size={16} className="mr-2" /> PDF (chop etish)
                    </Button>
                </div>
            </Card>

            <Card className="p-0 border-none bg-white/80 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <SortableTh label="O'rin" sortKey="rank" sortConfig={sortConfig} onSort={triggerSort} />
                                <SortableTh label="Nomi" sortKey="name" sortConfig={sortConfig} onSort={triggerSort} />
                                <SortableTh label="Kategoriya" sortKey="category" sortConfig={sortConfig} onSort={triggerSort} />
                                <SortableTh label="A'zolar" sortKey="memberCount" sortConfig={sortConfig} onSort={triggerSort} />
                                <SortableTh label="Jami ball" sortKey="combinedTotal" sortConfig={sortConfig} onSort={triggerSort} />
                                <SortableTh label="O'zgarish" sortKey="rankChange" sortConfig={sortConfig} onSort={triggerSort} />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.map(c => (
                                <tr
                                    key={c.id}
                                    onClick={() => setSelectedClub(c)}
                                    className="hover:bg-indigo-50/30 transition-colors cursor-pointer"
                                >
                                    <td className="px-5 py-3 font-bold text-gray-500">#{c.rank}</td>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 font-bold text-xs">
                                                {c.name.charAt(0)}
                                            </div>
                                            <div>
                                                <span className="font-medium text-gray-900 block">{c.name}</span>
                                                <CopyableId value={`Klub #${c.displayNumber}`} className="text-xs text-gray-400">
                                                    Klub #{c.displayNumber}
                                                </CopyableId>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3"><Badge variant="primary">{c.category}</Badge></td>
                                    <td className="px-5 py-3 text-gray-500">{c.memberCount}</td>
                                    <td className="px-5 py-3 font-black text-indigo-600">{c.combinedTotal}</td>
                                    <td className="px-5 py-3"><RankChangeArrow change={c.rankChange} /></td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">Klublar topilmadi</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {selectedClub && breakdown && (
                <div className="fixed inset-0 z-50 flex justify-end no-print">
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity" onClick={() => setSelectedClub(null)} />
                    <div className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col z-10">
                        <div className="p-6 border-b flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg">
                                    {selectedClub.name.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-lg leading-tight text-gray-900">{selectedClub.name}</h3>
                                    <Badge variant="primary" size="sm">{selectedClub.category}</Badge>
                                </div>
                            </div>
                            <button onClick={() => setSelectedClub(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-xl">{selectedClub.description}</p>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-indigo-500/5 rounded-xl text-center">
                                    <p className="text-2xl font-black text-indigo-600">{breakdown.combinedTotal}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Jami ball</p>
                                </div>
                                <div className="p-3 bg-amber-500/5 rounded-xl text-center">
                                    <p className="text-2xl font-black text-amber-600">#{selectedClub.rank}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">O'rin</p>
                                </div>
                                <div className="p-3 bg-emerald-500/5 rounded-xl text-center">
                                    <p className="text-lg font-black text-emerald-600">{breakdown.membersTotal}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">A'zolar balli</p>
                                </div>
                                <div className="p-3 bg-gray-50 rounded-xl text-center">
                                    <p className="text-lg font-black text-gray-700">{breakdown.eventsTotal}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Tadbirlar balli</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-center gap-2 p-2 bg-gray-50 rounded-xl">
                                <RankChangeArrow change={selectedClub.rankChange} size="lg" />
                                <span className="text-xs text-gray-400">so'nggi {LOOKBACK_DAYS} kunda</span>
                            </div>

                            <div>
                                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    <Users2 size={16} className="text-indigo-600" /> A'zolar ({breakdown.memberCount})
                                </h4>
                                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                                    {breakdown.memberDetails.map(m => (
                                        <div key={m.userId} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg text-sm">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {m.role === 'head_coordinator' && <Crown size={13} className="text-amber-500 shrink-0" />}
                                                <span className="text-gray-800 truncate">{m.fullName}</span>
                                                <Badge variant={ROLE_BADGE_VARIANT[m.role] || 'default'} size="sm">{ROLE_LABEL[m.role] || m.role}</Badge>
                                            </div>
                                            <span className="font-bold text-gray-900 shrink-0 ml-2">{m.score}</span>
                                        </div>
                                    ))}
                                    {breakdown.memberDetails.length === 0 && (
                                        <p className="text-xs text-gray-400 text-center py-3">A'zolar yo'q</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                    <Award size={16} className="text-indigo-600" /> Tasdiqlangan tadbirlar
                                </h4>
                                <div className="space-y-2">
                                    {breakdown.completedEvents.map(e => {
                                        const eventScore = (e.participants || []).reduce((s, p) => s + (p.score || 0), 0);
                                        return (
                                            <div key={e.id} className="p-3 border border-gray-100 rounded-xl">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-semibold text-gray-900">{e.title}</span>
                                                    <span className="text-sm font-bold text-emerald-600">+{eventScore}</span>
                                                </div>
                                                <div className="flex items-center justify-between mt-1">
                                                    <span className="text-xs text-gray-400 flex items-center gap-1">
                                                        <Calendar size={11} /> {new Date(e.date).toLocaleDateString('uz-UZ')}
                                                    </span>
                                                    <span className="text-xs text-gray-400">{(e.participants || []).length} ishtirokchi</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {breakdown.completedEvents.length === 0 && (
                                        <p className="text-xs text-gray-400 text-center py-3">Tasdiqlangan tadbirlar yo'q</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t bg-gray-50 flex gap-3">
                            <button
                                onClick={() => setSelectedClub(null)}
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

export default GlobalClubsRankings;
