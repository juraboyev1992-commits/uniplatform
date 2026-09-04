import React from 'react';
import { Play, Trash2 } from 'lucide-react';
import Badge from './Badge';
import CopyableId from './CopyableId';

// Table/list view for the competition selection list, mirroring the Clubs Directory's
// katalog/ro'yxat toggle pattern (see ClubsListView.jsx). Presentational only — opening a
// workspace or deleting a competition still goes through TournamentScoring's own handlers.
const CompetitionsListView = ({ competitions, methodLabels, canDelete, onDelete, onOpen }) => {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-slate-50 text-[11px] font-bold text-gray-400 uppercase">
                            <th className="px-5 py-3">#</th>
                            <th className="px-5 py-3">ID</th>
                            <th className="px-5 py-3">Nomi</th>
                            <th className="px-5 py-3">Turi</th>
                            <th className="px-5 py-3">Baholash usuli</th>
                            <th className="px-5 py-3 text-center">Ishtirokchilar</th>
                            <th className="px-5 py-3 text-center">Raundlar</th>
                            <th className="px-5 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {competitions.map((comp, idx) => (
                            <tr key={comp.id} className="hover:bg-slate-50/70 cursor-pointer transition-colors" onClick={() => onOpen(comp)}>
                                <td className="px-5 py-3 text-gray-400 font-semibold">{idx + 1}</td>
                                <td className="px-5 py-3 text-gray-500">
                                    <CopyableId value={`Turnir #${comp.displayNumber}`}>#{comp.displayNumber}</CopyableId>
                                </td>
                                <td className="px-5 py-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                                            {comp.name.charAt(0)}
                                        </div>
                                        <span className="font-bold text-gray-900">{comp.name}</span>
                                    </div>
                                </td>
                                <td className="px-5 py-3">
                                    <Badge variant="secondary" size="sm">{comp.type === 'team' ? 'Jamoa' : 'Individual'}</Badge>
                                </td>
                                <td className="px-5 py-3">
                                    <Badge variant="primary" size="sm">{methodLabels[comp.scoringMethod] || comp.scoringMethod}</Badge>
                                </td>
                                <td className="px-5 py-3 text-center font-semibold text-gray-700">{comp.participants.length}</td>
                                <td className="px-5 py-3 text-center font-semibold text-gray-700">{comp.roundsCount}</td>
                                <td className="px-5 py-3 text-right">
                                    <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                                        {canDelete && (
                                            <button
                                                onClick={() => onDelete(comp.id)}
                                                className="p-1.5 text-gray-400 hover:text-red-500 rounded bg-gray-50 hover:bg-red-50 transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => onOpen(comp)}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors"
                                        >
                                            <Play size={12} /> Kirish
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {competitions.length === 0 && (
                            <tr>
                                <td colSpan={8} className="text-center py-14 text-gray-400 text-sm">Musobaqalar topilmadi</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default CompetitionsListView;
