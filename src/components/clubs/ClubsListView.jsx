import React from 'react';
import { useNavigate } from 'react-router-dom';
import Badge from '../common/Badge';
import { slugify } from '../../utils/slug';
import CopyableId from '../common/CopyableId';

const RANK_MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

// Expects `clubs` already enriched by ClubsDirectoryPage: { ...club, direction, teamCount, achievementCount, rank }
const ClubsListView = ({ clubs, clubBase }) => {
    const navigate = useNavigate();

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-slate-50 text-[11px] font-bold text-gray-400 uppercase">
                            <th className="px-5 py-3">ID</th>
                            <th className="px-5 py-3">Nomi</th>
                            <th className="px-5 py-3">Yo'nalish</th>
                            <th className="px-5 py-3 text-center">A'zolar</th>
                            <th className="px-5 py-3 text-center">Jamoalar</th>
                            <th className="px-5 py-3 text-center">Yutuqlar</th>
                            <th className="px-5 py-3 text-center">Reyting</th>
                            <th className="px-5 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {clubs.map(club => (
                            <tr
                                key={club.id}
                                className="hover:bg-slate-50/70 cursor-pointer transition-colors"
                                onClick={() => navigate(`${clubBase}/${slugify(club.name)}`)}
                            >
                                <td className="px-5 py-3 text-gray-400 font-semibold">
                                    <CopyableId value={`Klub #${club.displayNumber}`}>#{club.displayNumber}</CopyableId>
                                </td>
                                <td className="px-5 py-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                                            {club.name.charAt(0)}
                                        </div>
                                        <span className="font-bold text-gray-900">{club.name}</span>
                                    </div>
                                </td>
                                <td className="px-5 py-3">
                                    <Badge variant="primary" size="sm">{club.direction}</Badge>
                                </td>
                                <td className="px-5 py-3 text-center font-semibold text-gray-700">{club.membersCount || 0}</td>
                                <td className="px-5 py-3 text-center font-semibold text-gray-700">{club.teamCount}</td>
                                <td className="px-5 py-3 text-center font-semibold text-gray-700">{club.achievementCount}</td>
                                <td className="px-5 py-3 text-center font-bold text-indigo-600">
                                    {club.rank <= 3 ? RANK_MEDALS[club.rank] : `#${club.rank}`}
                                </td>
                                <td className="px-5 py-3 text-right text-indigo-600 font-bold text-xs whitespace-nowrap">Batafsil &rarr;</td>
                            </tr>
                        ))}
                        {clubs.length === 0 && (
                            <tr>
                                <td colSpan={8} className="text-center py-14 text-gray-400 text-sm">Hech qanday klub topilmadi</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ClubsListView;
