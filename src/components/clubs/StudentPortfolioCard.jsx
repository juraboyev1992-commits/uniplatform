import React, { useMemo } from 'react';
import { AlertTriangle, Briefcase, Calendar, Clock } from 'lucide-react';
import Badge from '../common/Badge';
import { db, POSITION_TYPE_LABELS } from '../../services/db';

// Spec section 3 — what a coordinator/admin should see when reviewing a position application:
// current active/past positions, events organized, volunteer hours, last activity, workload index,
// and the two warning badges (>3 active positions, already head_coordinator elsewhere).
const StudentPortfolioCard = ({ studentId, excludeClubId }) => {
    const portfolio = useMemo(() => db.getStudentPortfolio(studentId), [studentId]);
    const leadershipConflict = useMemo(
        () => (excludeClubId ? db.hasLeadershipConflictElsewhere(studentId, excludeClubId) : portfolio.hasLeadershipConflict),
        [studentId, excludeClubId, portfolio]
    );

    return (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
            {(portfolio.hasHighWorkload || leadershipConflict) && (
                <div className="flex flex-wrap gap-2">
                    {portfolio.hasHighWorkload && (
                        <Badge variant="warning" size="sm"><AlertTriangle size={11} className="mr-1" />Yuqori yuklama</Badge>
                    )}
                    {leadershipConflict && (
                        <Badge variant="danger" size="sm"><AlertTriangle size={11} className="mr-1" />Rahbarlik konflikti</Badge>
                    )}
                </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                    <p className="text-[11px] text-gray-400 font-bold uppercase">Faol lavozimlar</p>
                    <p className="font-bold text-gray-900 dark:text-gray-100">{portfolio.workloadIndex}</p>
                </div>
                <div>
                    <p className="text-[11px] text-gray-400 font-bold uppercase">Tashkil etilgan tadbirlar</p>
                    <p className="font-bold text-gray-900 dark:text-gray-100">{portfolio.eventsOrganizedCount}</p>
                </div>
                <div>
                    <p className="text-[11px] text-gray-400 font-bold uppercase flex items-center gap-1"><Clock size={11} />Volontyorlik (taxminiy)</p>
                    <p className="font-bold text-gray-900 dark:text-gray-100">{portfolio.volunteerHoursEstimate} soat</p>
                </div>
                <div>
                    <p className="text-[11px] text-gray-400 font-bold uppercase flex items-center gap-1"><Calendar size={11} />Oxirgi faollik</p>
                    <p className="font-bold text-gray-900 dark:text-gray-100">
                        {portfolio.lastActivityDate ? new Date(portfolio.lastActivityDate).toLocaleDateString('uz-UZ') : '—'}
                    </p>
                </div>
            </div>
            {portfolio.activePositions.length > 0 && (
                <div>
                    <p className="text-[11px] text-gray-400 font-bold uppercase mb-1 flex items-center gap-1"><Briefcase size={11} />Faol lavozimlar</p>
                    <div className="flex flex-wrap gap-1.5">
                        {portfolio.activePositions.map(p => (
                            <Badge key={p.id} variant="primary" size="sm">
                                {POSITION_TYPE_LABELS[p.positionTitle] || p.positionTitle} · {p.club?.name}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentPortfolioCard;
