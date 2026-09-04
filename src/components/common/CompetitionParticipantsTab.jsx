import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Search, Download, X, GraduationCap, Users2, Award } from 'lucide-react';
import Card from './Card';
import Button from './Button';
import { Pagination, SortableTh } from './RankingsSharedUI';
import TeamRosterAndHistory from './TeamRosterAndHistory';

const PAGE_SIZE = 10;

// Participants tab for the Competition Management workspace (TournamentScoring.jsx).
// Reads competition.participants (a snapshot taken at competition-creation time) joined
// with the live leaderboard for rank/score — no new db.js calls, purely derived from props.
const CompetitionParticipantsTab = ({ competition, leaderboardData, role }) => {
    const isTeamComp = competition.type === 'team';
    const canExport = role === 'ADMINISTRATOR' || role === 'MODERATOR';

    const leaderboardByParticipantId = useMemo(
        () => new Map(leaderboardData.map(l => [l.participant.id, l])),
        [leaderboardData]
    );

    const rows = useMemo(() => competition.participants.map(p => {
        const entry = leaderboardByParticipantId.get(p.id);
        return {
            id: p.id,
            name: isTeamComp ? p.name : p.fullName,
            faculty: p.faculty || null,
            group: p.group || null,
            course: p.course || null,
            membersCount: p.membersCount || null,
            rank: entry ? entry.rank : null,
            totalScore: entry ? entry.totalScore : 0,
            roundScores: entry ? entry.roundScores : {}
        };
    }), [competition.participants, leaderboardByParticipantId, isTeamComp]);

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFaculty, setSelectedFaculty] = useState('');
    const [selectedGroup, setSelectedGroup] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'rank', direction: 'asc' });
    const [currentPage, setCurrentPage] = useState(1);

    const faculties = useMemo(
        () => [...new Set(rows.map(r => r.faculty).filter(Boolean))].sort(),
        [rows]
    );
    const groups = useMemo(() => {
        let g = rows.filter(r => r.faculty);
        if (selectedFaculty) g = g.filter(r => r.faculty === selectedFaculty);
        return [...new Set(g.map(r => r.group).filter(Boolean))].sort();
    }, [rows, selectedFaculty]);

    const filtered = useMemo(() => {
        let result = rows;
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            result = result.filter(r => r.name?.toLowerCase().includes(q));
        }
        if (!isTeamComp && selectedFaculty) result = result.filter(r => r.faculty === selectedFaculty);
        if (!isTeamComp && selectedGroup) result = result.filter(r => r.group === selectedGroup);

        return result.slice().sort((a, b) => {
            let aVal = a[sortConfig.key];
            let bVal = b[sortConfig.key];
            if (aVal == null) aVal = sortConfig.key === 'rank' ? Infinity : (typeof bVal === 'string' ? '' : 0);
            if (bVal == null) bVal = sortConfig.key === 'rank' ? Infinity : (typeof aVal === 'string' ? '' : 0);
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [rows, searchQuery, selectedFaculty, selectedGroup, sortConfig, isTeamComp]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, selectedFaculty, selectedGroup, sortConfig]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const triggerSort = (key) => {
        setSortConfig(prev => prev.key === key
            ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
            : { key, direction: key === 'name' ? 'asc' : (key === 'rank' ? 'asc' : 'desc') });
    };

    const [selectedParticipant, setSelectedParticipant] = useState(null);

    const handleExportExcel = () => {
        const exportRows = filtered.map(r => isTeamComp ? {
            "O'rin": r.rank ?? '—',
            'Jamoa nomi': r.name,
            "A'zolar soni": r.membersCount,
            'Jami ball': r.totalScore
        } : {
            "O'rin": r.rank ?? '—',
            'F.I.Sh.': r.name,
            'Fakultet': r.faculty,
            'Guruh': r.group,
            'Kurs': r.course,
            'Jami ball': r.totalScore
        });
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportRows);
        ws['!cols'] = isTeamComp
            ? [{ wch: 6 }, { wch: 30 }, { wch: 14 }, { wch: 12 }]
            : [{ wch: 6 }, { wch: 30 }, { wch: 25 }, { wch: 12 }, { wch: 8 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Ishtirokchilar');
        XLSX.writeFile(wb, `${competition.name.replace(/\s+/g, '_')}_ishtirokchilar.xlsx`);
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="font-bold text-lg text-gray-900">Musobaqa Ishtirokchilari Ro'yxati</h3>
                    <p className="text-xs text-gray-400">Jami {competition.participants.length} ta ro'yxatdan o'tgan a'zolar</p>
                </div>
                {canExport && (
                    <Button variant="outline" size="sm" onClick={handleExportExcel}>
                        <Download size={14} className="mr-2" /> Excel
                    </Button>
                )}
            </div>

            <Card className="p-4 border-none bg-slate-50">
                <div className="flex flex-col md:flex-row flex-wrap gap-3">
                    <div className="flex-1 min-w-[220px] relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Ishtirokchini qidirish..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white border rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                    </div>
                    {!isTeamComp && (
                        <>
                            <select
                                value={selectedFaculty}
                                onChange={e => { setSelectedFaculty(e.target.value); setSelectedGroup(''); }}
                                className="px-3 py-2 border rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">Barcha fakultetlar</option>
                                {faculties.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                            <select
                                value={selectedGroup}
                                onChange={e => setSelectedGroup(e.target.value)}
                                className="px-3 py-2 border rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">Barcha guruhlar</option>
                                {groups.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                        </>
                    )}
                </div>
            </Card>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <SortableTh label="O'rin" sortKey="rank" sortConfig={sortConfig} onSort={triggerSort} />
                                <SortableTh label={isTeamComp ? 'Jamoa' : 'Talaba'} sortKey="name" sortConfig={sortConfig} onSort={triggerSort} />
                                {isTeamComp ? (
                                    <SortableTh label="A'zolar" sortKey="membersCount" sortConfig={sortConfig} onSort={triggerSort} />
                                ) : (
                                    <>
                                        <SortableTh label="Fakultet" sortKey="faculty" sortConfig={sortConfig} onSort={triggerSort} />
                                        <SortableTh label="Guruh" sortKey="group" sortConfig={sortConfig} onSort={triggerSort} />
                                    </>
                                )}
                                <SortableTh label="Jami ball" sortKey="totalScore" sortConfig={sortConfig} onSort={triggerSort} />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {paginated.map(r => (
                                <tr
                                    key={r.id}
                                    onClick={() => setSelectedParticipant(r)}
                                    className="hover:bg-indigo-50/30 transition-colors cursor-pointer"
                                >
                                    <td className="px-5 py-3 font-bold text-gray-500">{r.rank ? `#${r.rank}` : '—'}</td>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                                                {r.name?.charAt(0)}
                                            </div>
                                            <span className="font-medium text-gray-900">{r.name}</span>
                                        </div>
                                    </td>
                                    {isTeamComp ? (
                                        <td className="px-5 py-3 text-gray-500">{r.membersCount || 4} ta</td>
                                    ) : (
                                        <>
                                            <td className="px-5 py-3 text-gray-500">{r.faculty}</td>
                                            <td className="px-5 py-3 text-gray-500">{r.group}</td>
                                        </>
                                    )}
                                    <td className="px-5 py-3 font-black text-indigo-600">{r.totalScore}</td>
                                </tr>
                            ))}
                            {paginated.length === 0 && (
                                <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-400">Ishtirokchilar topilmadi</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    totalItems={filtered.length}
                    pageSize={PAGE_SIZE}
                />
            </div>

            {selectedParticipant && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity" onClick={() => setSelectedParticipant(null)} />
                    <div className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col z-10">
                        <div className="p-6 border-b flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg">
                                    {selectedParticipant.name?.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-lg leading-tight text-gray-900">{selectedParticipant.name}</h3>
                                    <p className="text-xs text-gray-400">ID: {selectedParticipant.id}</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedParticipant(null)} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {!isTeamComp && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 bg-gray-50 rounded-xl">
                                        <p className="text-xs text-gray-400 flex items-center gap-1"><GraduationCap size={12} /> Fakultet</p>
                                        <p className="text-sm font-semibold text-gray-900 mt-1">{selectedParticipant.faculty}</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-xl">
                                        <p className="text-xs text-gray-400 flex items-center gap-1"><Users2 size={12} /> Guruh / Kurs</p>
                                        <p className="text-sm font-semibold text-gray-900 mt-1">{selectedParticipant.group} • {selectedParticipant.course}-kurs</p>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-indigo-500/5 rounded-xl text-center">
                                    <p className="text-2xl font-black text-indigo-600">{selectedParticipant.totalScore}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Jami ball</p>
                                </div>
                                <div className="p-3 bg-amber-500/5 rounded-xl text-center">
                                    <p className="text-2xl font-black text-amber-600">{selectedParticipant.rank ? `#${selectedParticipant.rank}` : '—'}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">O'rin</p>
                                </div>
                            </div>

                            {isTeamComp && <TeamRosterAndHistory teamId={selectedParticipant.id} currentCompetitionId={competition.id} />}

                            <div>
                                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><Award size={16} className="text-indigo-600" /> Raundlar bo'yicha natijalar</h4>
                                <div className="space-y-1.5">
                                    {Object.entries(selectedParticipant.roundScores || {}).map(([round, score]) => (
                                        <div key={round} className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg text-sm">
                                            <span className="text-gray-600">Raund {round}</span>
                                            <span className={`font-bold ${score != null ? 'text-emerald-600' : 'text-gray-300'}`}>
                                                {score != null ? score : 'Hali yo\'q'}
                                            </span>
                                        </div>
                                    ))}
                                    {Object.keys(selectedParticipant.roundScores || {}).length === 0 && (
                                        <p className="text-xs text-gray-400 text-center py-3">Hali ball kiritilmagan</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t bg-gray-50 flex gap-3">
                            <button
                                onClick={() => setSelectedParticipant(null)}
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

export default CompetitionParticipantsTab;
