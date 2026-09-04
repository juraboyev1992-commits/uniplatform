import React, { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import Badge from '../common/Badge';
import CopyableId from '../common/CopyableId';
import Pagination from '../common/Pagination';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { canManageClubStructure } from '../../utils/permissions';

const PAGE_SIZE_OPTIONS = [10, 20, 30, 100, 'all'];

// Promote/demote ladder for the "Amallar" column — mirrors the formal-position cardinality described in
// ClubOrgStructureSection ('Yordamchi koordinator' maps onto the existing 'coordinator' membership role).
const ROLE_LADDER = ['member', 'coordinator', 'head_coordinator'];

// Expects `members` already resolved+ranked by ClubProfilePage: [{ userId, role, student, score, individualRank }].
// Membership existence is the only "faol a'zo" (active member) signal this app has — there's no stored
// active flag — so every listed member is shown as active, matching the app's existing convention.
// `club`/`onRefresh` are optional — omitting them just hides the new "Amallar" column, so any other
// caller of this component keeps working exactly as before.
const ClubMembersSection = ({ members, club, onRefresh }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[1]);
    const { user, hasClubRole } = useAuth();
    const canManage = !!club && canManageClubStructure(user, hasClubRole, club.id);

    const handlePromote = async (membershipId, currentRole) => {
        const idx = ROLE_LADDER.indexOf(currentRole);
        const nextRole = ROLE_LADDER[Math.min(idx + 1, ROLE_LADDER.length - 1)];
        if (nextRole === currentRole) return;
        await db.updateMembershipRole(membershipId, nextRole);
        onRefresh?.();
    };

    const handleDemote = async (membershipId, currentRole) => {
        const idx = ROLE_LADDER.indexOf(currentRole);
        const nextRole = ROLE_LADDER[Math.max(idx - 1, 0)];
        if (nextRole === currentRole) return;
        await db.updateMembershipRole(membershipId, nextRole);
        onRefresh?.();
    };

    if (members.length === 0) {
        return (
            <div className="text-center py-10 text-sm text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
                Bu klubda hali a'zolar yo'q
            </div>
        );
    }

    const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(members.length / pageSize));
    const page = Math.min(currentPage, totalPages);
    const rowOffset = pageSize === 'all' ? 0 : (page - 1) * pageSize;
    const visible = pageSize === 'all' ? members : members.slice(rowOffset, rowOffset + pageSize);

    return (
        <div className="space-y-4">
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
                                {canManage && <th className="px-4 py-3 text-center">Amallar</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {visible.map((m, idx) => (
                                <tr key={m.userId} className="hover:bg-slate-50/70 transition-colors">
                                    <td className="px-4 py-3 text-gray-400 font-semibold">{rowOffset + idx + 1}</td>
                                    <td className="px-4 py-3 text-gray-500">
                                        {m.student?.displayNumber
                                            ? <CopyableId value={`Talaba #${m.student.displayNumber}`}>#{m.student.displayNumber}</CopyableId>
                                            : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                                                {m.student?.fullName?.charAt(0) || '?'}
                                            </div>
                                            <span className="font-bold text-gray-900">{m.student?.fullName || m.userId}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">{m.student?.faculty || '—'}</td>
                                    <td className="px-4 py-3 text-gray-600">{m.student?.course ? `${m.student.course}-kurs` : '—'}</td>
                                    <td className="px-4 py-3"><Badge variant="success" size="sm">Faol a'zo</Badge></td>
                                    <td className="px-4 py-3 text-center font-bold text-indigo-600">#{m.individualRank}</td>
                                    {canManage && (
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    type="button"
                                                    title="Rolni oshirish"
                                                    disabled={!ROLE_LADDER.includes(m.role) || m.role === ROLE_LADDER[ROLE_LADDER.length - 1]}
                                                    onClick={() => handlePromote(m.id, m.role)}
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:hover:bg-transparent"
                                                >
                                                    <ChevronUp size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Rolni pasaytirish"
                                                    disabled={!ROLE_LADDER.includes(m.role) || m.role === ROLE_LADDER[0]}
                                                    onClick={() => handleDemote(m.id, m.role)}
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent"
                                                >
                                                    <ChevronDown size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    )}
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
                        totalItems={members.length}
                    />
                </div>
            </div>
        </div>
    );
};

export default ClubMembersSection;
