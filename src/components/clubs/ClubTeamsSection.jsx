import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { slugify } from '../../utils/slug';
import CopyableId from '../common/CopyableId';
import Pagination from '../common/Pagination';

const RANK_MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };
const PAGE_SIZE_OPTIONS = [10, 20, 30, 100, 'all'];

// Expects `teams` already enriched+ranked by ClubProfilePage: [{ ...team, members, achievementCount, rank }]
const ClubTeamsSection = ({ teams, teamBase }) => {
    const navigate = useNavigate();
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[1]);

    if (teams.length === 0) {
        return (
            <div className="text-center py-10 text-sm text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
                Bu klubda hali jamoalar yo'q
            </div>
        );
    }

    const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(teams.length / pageSize));
    const page = Math.min(currentPage, totalPages);
    const rowOffset = pageSize === 'all' ? 0 : (page - 1) * pageSize;
    const visible = pageSize === 'all' ? teams : teams.slice(rowOffset, rowOffset + pageSize);

    return (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-slate-50 text-[11px] font-bold text-gray-400 uppercase">
                            <th className="px-4 py-3">#</th>
                            <th className="px-4 py-3">ID</th>
                            <th className="px-4 py-3">Jamoa nomi</th>
                            <th className="px-4 py-3">Tashkil topgan</th>
                            <th className="px-4 py-3 text-center">A'zolar</th>
                            <th className="px-4 py-3 text-center">Yutuqlar</th>
                            <th className="px-4 py-3 text-center">Reyting</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {visible.map((t, idx) => (
                            <tr
                                key={t.id}
                                className="hover:bg-slate-50/70 cursor-pointer transition-colors"
                                onClick={() => navigate(`${teamBase}/${slugify(t.name)}`)}
                            >
                                <td className="px-4 py-3 text-gray-400 font-semibold">{rowOffset + idx + 1}</td>
                                <td className="px-4 py-3 text-gray-500">
                                    <CopyableId value={`Jamoa #${t.displayNumber}`}>#{t.displayNumber}</CopyableId>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-xs shrink-0">
                                            {t.name.charAt(0)}
                                        </div>
                                        <span className="font-bold text-gray-900">{t.name}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-gray-500">
                                    {t.foundedAt ? new Date(t.foundedAt).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                </td>
                                <td className="px-4 py-3 text-center font-semibold text-gray-700">{(t.members || []).length}</td>
                                <td className="px-4 py-3 text-center font-semibold text-gray-700">{t.achievementCount}</td>
                                <td className="px-4 py-3 text-center font-bold text-indigo-600">
                                    {t.rank <= 3 ? RANK_MEDALS[t.rank] : `#${t.rank}`}
                                </td>
                                <td className="px-4 py-3 text-right text-indigo-600 font-bold text-xs whitespace-nowrap">Ko'rish &rarr;</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100">
                <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    pageSize={pageSize}
                    onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    totalItems={teams.length}
                />
            </div>
        </div>
    );
};

export default ClubTeamsSection;
