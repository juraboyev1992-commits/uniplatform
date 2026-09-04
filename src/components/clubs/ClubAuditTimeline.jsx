import React, { useMemo } from 'react';
import { db, POSITION_TYPE_LABELS } from '../../services/db';

const formatDateTime = (iso) => new Date(iso).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Builds the human-readable line for one audit entry — same log shape covers both the direct-assign
// flow (clubId/studentId/positionTitle set directly) and the ariza flow (only applicationId, resolved
// by db.getClubPositionAuditLogs before this component ever sees it — studentId/positionTitle are
// looked up from the application/position records here for that older shape).
const describeEntry = (entry, studentById, applicationById, positionById) => {
    let studentId = entry.studentId;
    let positionTitle = entry.positionTitle;
    if (!studentId && entry.applicationId) {
        const app = applicationById.get(entry.applicationId);
        studentId = app?.studentId;
        positionTitle = positionById.get(app?.positionId)?.title;
    }
    const studentName = studentById.get(studentId)?.fullName || studentId || "Noma'lum talaba";
    const positionLabel = POSITION_TYPE_LABELS[positionTitle] || positionTitle || 'lavozim';

    switch (entry.action) {
        case 'ASSIGNED':
            return `${studentName} ${positionLabel} qilib tayinlandi`;
        case 'REMOVED':
            return `${studentName} ${positionLabel} lavozimidan olib tashlandi`;
        case 'SUBMITTED':
            return `${studentName} ${positionLabel} lavozimiga ariza topshirdi`;
        case 'INVITE_INTERVIEW':
            return `${studentName} ${positionLabel} lavozimi bo'yicha suhbatga taklif qilindi`;
        case 'COORDINATOR_APPROVE':
            return `${studentName}ning ${positionLabel} arizasi koordinator tomonidan tavsiya etildi`;
        case 'COORDINATOR_REJECT':
            return `${studentName}ning ${positionLabel} arizasi koordinator tomonidan rad etildi`;
        case 'ADMIN_APPROVE':
            return `${studentName} ${positionLabel} lavozimiga admin tomonidan tasdiqlandi`;
        case 'ADMIN_REJECT':
            return `${studentName}ning ${positionLabel} arizasi admin tomonidan rad etildi`;
        case 'CANCEL':
            return `${studentName} ${positionLabel} arizasini bekor qildi`;
        default:
            return `${studentName} — ${positionLabel} (${entry.action})`;
    }
};

// Admin-only audit timeline (spec section 8) — right sidebar, one line per position-domain event:
// who was assigned/removed/reviewed, to which position, by whom, when.
const ClubAuditTimeline = ({ clubId }) => {
    const students = useMemo(() => db.getMockStudents(), []);
    const studentById = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);
    const applicationById = useMemo(() => new Map(db.getClubPositionApplications(clubId).map(a => [a.id, a])), [clubId]);
    const positionById = useMemo(() => new Map(db.getClubPositions(clubId).map(p => [p.id, p])), [clubId]);
    const entries = useMemo(() => db.getClubPositionAuditLogs(clubId), [clubId]);

    if (entries.length === 0) {
        return <p className="text-xs text-gray-400 text-center py-6">Hozircha audit yozuvlari yo'q</p>;
    }

    return (
        <div className="space-y-4">
            {entries.map(entry => {
                const reviewerName = studentById.get(entry.reviewer)?.fullName || entry.reviewer;
                return (
                    <div key={entry.id} className="relative pl-4 border-l-2 border-indigo-100 dark:border-indigo-900">
                        <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-indigo-500" />
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-snug">
                            {describeEntry(entry, studentById, applicationById, positionById)}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{reviewerName} tomonidan — {formatDateTime(entry.time)}</p>
                    </div>
                );
            })}
        </div>
    );
};

export default ClubAuditTimeline;
