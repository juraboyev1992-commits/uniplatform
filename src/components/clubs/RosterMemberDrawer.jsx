import React, { useEffect, useMemo, useRef } from 'react';
import { X, UserCheck, History } from 'lucide-react';
import { db, POSITION_TYPE_LABELS, POSITION_BADGE_STYLES } from '../../services/db';
import * as clubAnalytics from '../../utils/clubAnalytics';

// Row-click drawer for the "Klub tarkibi" management table (spec section 11) — same slide-over idiom
// used across the app's admin-facing panels (PositionAssignPanel.jsx, ClubsAnalyticsTab.jsx's
// StudentDrawer). Kept local/self-contained rather than importing the analytics tab's version, since
// this feature pass is scoped to only ClubProfilePage's "Klub tarkibi" tab.
const AUDIT_ACTION_LABELS = {
    ASSIGNED: 'lavozimga tayinlandi', REMOVED: 'lavozimdan olib tashlandi', SUBMITTED: 'lavozimga ariza topshirdi',
    INVITE_INTERVIEW: 'suhbatga taklif qilindi', COORDINATOR_APPROVE: "arizasi koordinator tomonidan tavsiya etildi",
    COORDINATOR_REJECT: "arizasi koordinator tomonidan rad etildi", ADMIN_APPROVE: 'lavozimga admin tomonidan tasdiqlandi',
    ADMIN_REJECT: "arizasi admin tomonidan rad etildi", CANCEL: 'arizani bekor qildi'
};
const describeAuditEntry = (log) =>
    `${POSITION_TYPE_LABELS[log.positionTitle] || log.positionTitle || 'Lavozim'}${log.clubName ? ` (${log.clubName})` : ''} — ${AUDIT_ACTION_LABELS[log.action] || log.action}`;

// Horizontal segmented gauge (0-1/2 green, 3 amber, 4+ red) with a marker at the student's actual
// position count. Plain divs (not recharts) so it renders cleanly inside a narrow drawer.
const WorkloadGauge = ({ count }) => {
    const max = Math.max(6, count + 1);
    const pct = (v) => Math.min(100, (v / max) * 100);
    const twoPct = pct(2), threePct = pct(3);
    return (
        <div>
            <div className="relative h-3 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 flex">
                <div style={{ width: `${twoPct}%` }} className="bg-emerald-400" />
                <div style={{ width: `${threePct - twoPct}%` }} className="bg-amber-400" />
                <div style={{ width: `${100 - threePct}%` }} className="bg-red-400" />
                <div className="absolute top-0 bottom-0 w-0.5 bg-gray-900 dark:bg-white" style={{ left: `${pct(count)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>0</span>
                <span className="font-bold text-gray-600 dark:text-gray-300">Joriy: {count}</span>
                <span>{max}+</span>
            </div>
        </div>
    );
};

// `initialSection='audit'` (from the row menu's "Tarix" action, distinct from "Batafsil") scrolls
// straight to the audit timeline on open instead of showing the same content differently.
const RosterMemberDrawer = ({ studentId, isAdmin, initialSection, onClose }) => {
    const data = useMemo(() => (studentId ? clubAnalytics.getStudentDrawerData(db, studentId) : null), [studentId]);
    const auditRef = useRef(null);

    useEffect(() => {
        if (studentId && initialSection === 'audit' && auditRef.current) {
            auditRef.current.scrollIntoView({ block: 'start' });
        }
    }, [studentId, initialSection]);

    if (!studentId || !data) return null;
    const student = data.activePositions[0]?.student || db.getMockStudents().find(s => s.id === studentId);

    return (
        <div className="fixed inset-0 z-50">
            <div className="fixed inset-0 bg-black/50" onClick={onClose} />
            <div className="fixed inset-y-0 right-0 w-[440px] max-w-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
                <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{student?.fullName || studentId}</h2>
                        <p className="text-xs text-gray-400">{student?.faculty || ''} {student?.course ? `· ${student.course}-kurs` : ''}</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-2">
                    <div>
                        <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Yuklama</h3>
                        <WorkloadGauge count={data.workloadIndex} />
                    </div>

                    <div className="pt-5">
                        <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Barcha faol lavozimlari</h3>
                        {data.activePositions.length === 0 ? (
                            <p className="text-xs text-gray-400">Faol lavozimi yo'q</p>
                        ) : (
                            <div className="space-y-2">
                                {data.activePositions.map(p => (
                                    <div key={`${p.clubId}::${p.positionTitle}`} className="px-3 py-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{p.clubName}</span>
                                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${POSITION_BADGE_STYLES[p.positionTitle] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                                                {POSITION_TYPE_LABELS[p.positionTitle] || p.positionTitle}
                                            </span>
                                        </div>
                                        {p.assignedByName && (
                                            <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                                                <UserCheck size={11} /> Tayinladi: {p.assignedByName}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="pt-5">
                        <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Oxirgi 10 ta faoliyat</h3>
                        {data.recentActivities.length === 0 ? (
                            <p className="text-xs text-gray-400">Faoliyat tarixi topilmadi</p>
                        ) : (
                            <div className="space-y-2">
                                {data.recentActivities.map(a => (
                                    <div key={a.id} className="px-3 py-2 rounded-xl border border-gray-100 dark:border-gray-800">
                                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{a.name}</p>
                                        <p className="text-[11px] text-gray-400">{a.clubName} · {new Date(a.date).toLocaleDateString('uz-UZ')}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="pt-5">
                        <h3 className="text-xs font-bold text-gray-400 uppercase mb-1">Oxirgi faollik sanasi</h3>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                            {data.lastActivityDate ? new Date(data.lastActivityDate).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' }) : "Ma'lumot yo'q"}
                        </p>
                    </div>

                    {/* Raw audit trail stays admin-only, matching the sidebar's existing "faqat admin" rule
                        for this same data (ClubAuditTimeline.jsx) — coordinators still see everything above. */}
                    {isAdmin && (
                        <div ref={auditRef} className="pt-5">
                            <h3 className="text-xs font-bold text-gray-400 uppercase mb-2 flex items-center gap-1.5">
                                <History size={12} /> Audit log
                            </h3>
                            {data.auditLog.length === 0 ? (
                                <p className="text-xs text-gray-400">Audit yozuvlari yo'q</p>
                            ) : (
                                <div className="space-y-2">
                                    {data.auditLog.map(log => (
                                        <div key={log.id} className="relative pl-3 border-l-2 border-indigo-100 dark:border-indigo-900">
                                            <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-indigo-500" />
                                            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-snug">{describeAuditEntry(log)}</p>
                                            <p className="text-[11px] text-gray-400 mt-0.5">{log.reviewerName || log.reviewer} tomonidan — {new Date(log.time).toLocaleString('uz-UZ')}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RosterMemberDrawer;
