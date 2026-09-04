import React, { useMemo, useState } from 'react';
import Badge from '../common/Badge';
import Pagination from '../common/Pagination';
import { db, POSITION_TYPE_LABELS } from '../../services/db';

const END_REASON_LABELS = { completed: 'Yakunlangan', cancelled: 'Bekor qilingan', changed: "O'zgartirilgan" };
const END_REASON_VARIANTS = { completed: 'success', cancelled: 'danger', changed: 'warning' };
const PAGE_SIZE_OPTIONS = [10, 20, 30, 'all'];

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

// "Tarixiy tarkib" (spec section 7) — admin-only. Only assignment-ledger records ever get a history
// row (legacy membership-only holders replaced before this ledger existed have nothing to show —
// disclosed, not hidden, per db.js's removeFromClubPosition comment).
const ClubHistoryPanel = ({ clubId }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

    const students = useMemo(() => db.getMockStudents(), []);
    const studentById = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);

    const history = useMemo(
        () => db.getClubPositionAssignments(clubId)
            .filter(a => a.status === 'ended')
            .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))
            .map(a => ({ ...a, student: studentById.get(a.studentId) })),
        [clubId, studentById]
    );

    if (history.length === 0) {
        return (
            <div className="text-center py-8 text-sm text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                Tarixiy yozuvlar yo'q
            </div>
        );
    }

    const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(history.length / pageSize));
    const page = Math.min(currentPage, totalPages);
    const rowOffset = pageSize === 'all' ? 0 : (page - 1) * pageSize;
    const visible = pageSize === 'all' ? history : history.slice(rowOffset, rowOffset + pageSize);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-gray-900 text-[11px] font-bold text-gray-400 uppercase">
                            <th className="px-4 py-3">Talaba</th>
                            <th className="px-4 py-3">Lavozim</th>
                            <th className="px-4 py-3">Davr</th>
                            <th className="px-4 py-3">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                        {visible.map(h => (
                            <tr key={h.id} className="hover:bg-slate-50/70 dark:hover:bg-gray-900/50 transition-colors">
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
                                            {h.student?.fullName?.charAt(0) || '?'}
                                        </div>
                                        <span className="font-bold text-gray-900 dark:text-gray-100">{h.student?.fullName || h.studentId}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{POSITION_TYPE_LABELS[h.positionTitle] || h.positionTitle}</td>
                                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDate(h.assignedAt)} – {formatDate(h.endedAt)}</td>
                                <td className="px-4 py-3">
                                    <Badge variant={END_REASON_VARIANTS[h.endReason] || 'default'} size="sm">{END_REASON_LABELS[h.endReason] || h.endReason}</Badge>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700">
                <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    pageSize={pageSize}
                    onPageSizeChange={size => { setPageSize(size); setCurrentPage(1); }}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    totalItems={history.length}
                />
            </div>
        </div>
    );
};

export default ClubHistoryPanel;
