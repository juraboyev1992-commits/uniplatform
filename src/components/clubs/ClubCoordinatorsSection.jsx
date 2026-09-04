import React, { useState } from 'react';
import Badge from '../common/Badge';
import CopyableId from '../common/CopyableId';
import Pagination from '../common/Pagination';

const ROLE_LABELS = { head_coordinator: 'Asosiy', coordinator: 'Yordamchi', volunteer: 'Volontyor', smm: 'SMM', member: "A'zo" };
const ROLE_VARIANTS = { head_coordinator: 'primary', coordinator: 'default', volunteer: 'success', smm: 'warning' };
const PAGE_SIZE_OPTIONS = [10, 20, 30, 100, 'all'];

// Expects `coordinators` already resolved+ranked by ClubProfilePage: [{ userId, role, student, score, individualRank }]
const ClubCoordinatorsSection = ({ coordinators }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[1]);

    if (coordinators.length === 0) {
        return (
            <div className="text-center py-10 text-sm text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
                Koordinatorlar hali belgilanmagan
            </div>
        );
    }

    const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(coordinators.length / pageSize));
    const page = Math.min(currentPage, totalPages);
    const rowOffset = pageSize === 'all' ? 0 : (page - 1) * pageSize;
    const visible = pageSize === 'all' ? coordinators : coordinators.slice(rowOffset, rowOffset + pageSize);

    return (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-slate-50 text-[11px] font-bold text-gray-400 uppercase">
                            <th className="px-4 py-3">#</th>
                            <th className="px-4 py-3">ID</th>
                            <th className="px-4 py-3">Ism Familya</th>
                            <th className="px-4 py-3">Fakultet</th>
                            <th className="px-4 py-3">Kurs</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-center">Reyting</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {visible.map((c, idx) => (
                            <tr key={c.userId} className="hover:bg-slate-50/70 transition-colors">
                                <td className="px-4 py-3 text-gray-400 font-semibold">{rowOffset + idx + 1}</td>
                                <td className="px-4 py-3 text-gray-500">
                                    {c.student?.displayNumber
                                        ? <CopyableId value={`Talaba #${c.student.displayNumber}`}>#{c.student.displayNumber}</CopyableId>
                                        : '—'}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                                            {c.student?.fullName?.charAt(0) || '?'}
                                        </div>
                                        <span className="font-bold text-gray-900">{c.student?.fullName || c.userId}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-gray-600">{c.student?.faculty || '—'}</td>
                                <td className="px-4 py-3 text-gray-600">{c.student?.course ? `${c.student.course}-kurs` : '—'}</td>
                                <td className="px-4 py-3">
                                    <Badge variant={ROLE_VARIANTS[c.role] || 'default'} size="sm">{ROLE_LABELS[c.role] || c.role}</Badge>
                                </td>
                                <td className="px-4 py-3 text-center font-bold text-indigo-600">#{c.individualRank}</td>
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
                    totalItems={coordinators.length}
                />
            </div>
        </div>
    );
};

export default ClubCoordinatorsSection;
