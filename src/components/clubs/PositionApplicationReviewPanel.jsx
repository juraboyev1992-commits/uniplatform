import React, { useMemo, useState } from 'react';
import { Check, X, MessageCircle, CalendarCheck, AlertTriangle } from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { db, POSITION_TYPE_LABELS, POSITION_APPLICATION_STATUS_LABELS } from '../../services/db';
import { useAuth, ROLES } from '../../contexts/AuthContext';
import { isClubCoordinator } from '../../utils/permissions';
import StudentPortfolioCard from './StudentPortfolioCard';
import { LadderChecklist } from './LadderChecklist';
import { evaluateForPosition } from '../../utils/clubLadder';

// Coordinator stage now has 3 steps (spec): review the applicant's portfolio (below) -> invite to an
// interview -> after the interview, recommend or reject. Only a recommended application moves to the
// admin queue for final approval. Only PENDING applications are actionable here — REJECTED/APPROVED/
// CANCELLED ones are terminal and don't need a reviewer to act on them again.
const PositionApplicationReviewPanel = ({ club, positions, onRefresh }) => {
    const { user, hasClubRole } = useAuth();
    const isAdmin = user?.role === ROLES.ADMIN;
    const isCoordinator = isClubCoordinator(user, hasClubRole, club.id);
    const students = useMemo(() => db.getMockStudents(), []);
    const studentById = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);
    const positionById = useMemo(() => new Map(positions.map(p => [p.id, p])), [positions]);

    const pendingApplications = useMemo(
        () => db.getClubPositionApplications(club.id).filter(a => a.status === 'PENDING'),
        [club.id, positions]
    );

    // Interview-invite note drafts, keyed by application id — local UI state only, submitted via
    // reviewPositionApplication's 'invite_interview' action.
    const [interviewDrafts, setInterviewDrafts] = useState({});
    const [openInterviewFormId, setOpenInterviewFormId] = useState(null);

    const resolveStudent = (studentId) => studentById.get(studentId) || { id: studentId, fullName: studentId };

    // To'qnashuv arizalar ro'yxati bo'yicha bir marta hisoblanadi.
    const conflicts = useMemo(
        () => new Map(pendingApplications.map(a => [a.studentId, db.getClubPositionConflict(a.studentId, club.id)])),
        [pendingApplications, club.id]
    );
    const conflictOf = (studentId) => conflicts.get(studentId) || null;

    // `await` SHART: admin tasdiqlashi a'zolik rolini Supabase'ga yozadi.
    // Kutilmasa, baza rad etgan taqdirda ham ariza tasdiqlangandek ko'rinardi.
    const handleAction = async (applicationId, action, comment = null) => {
        try {
            await db.reviewPositionApplication(applicationId, action, user.username, comment);
            onRefresh();
        } catch (err) {
            window.alert(err.message);
        }
    };

    const handleInviteInterview = async (applicationId) => {
        await handleAction(applicationId, 'invite_interview', interviewDrafts[applicationId] || null);
        setOpenInterviewFormId(null);
        setInterviewDrafts(d => ({ ...d, [applicationId]: '' }));
    };

    if (pendingApplications.length === 0) {
        return (
            <div className="text-center py-8 text-sm text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                Ko'rib chiqiladigan arizalar yo'q
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {pendingApplications.map(app => {
                const position = positionById.get(app.positionId);
                const student = resolveStudent(app.studentId);
                const awaitingAdmin = !!app.reviewedBy;
                const isInterviewed = !!app.interviewInvitedAt;
                return (
                    <div key={app.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <p className="font-bold text-gray-900 dark:text-gray-100">{student.fullName}</p>
                                <p className="text-xs text-gray-400">{POSITION_TYPE_LABELS[position?.title] || position?.title} lavozimiga ariza</p>
                            </div>
                            <Badge variant={awaitingAdmin ? 'info' : isInterviewed ? 'primary' : 'warning'} size="sm">
                                {awaitingAdmin ? "Admin tasdig'ini kutmoqda" : isInterviewed ? 'Suhbat o\'tkazildi' : POSITION_APPLICATION_STATUS_LABELS.PENDING}
                            </Badge>
                        </div>
                        {app.motivation && <p className="text-sm text-gray-600 dark:text-gray-300">{app.motivation}</p>}

                        {/* MANFAATLAR TO'QNASHUVI. Ariza berish cheklanmaydi -
                            talaba buni bilmasligi mumkin. Lekin KO'RIB CHIQADIGAN
                            odam to'siqni ariza ustida ko'rishi kerak: aks holda
                            u tavsiya berardi, admin esa tasdiqlay olmasdi. */}
                        {conflictOf(app.studentId) && (
                            <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/15 text-red-700 dark:text-red-300 text-xs">
                                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold">Bu talabani lavozimga tayinlab bo'lmaydi</p>
                                    <p className="mt-0.5">{conflictOf(app.studentId).message}</p>
                                </div>
                            </div>
                        )}

                        {/* Zinapoya holati. Talaba arizani yuborishdan oldin AYNI shu
                            ro'yxatni ko'rgan - koordinator ham shuni ko'rsin, aks holda
                            ikki tomon boshqa-boshqa ma'lumot asosida gaplashardi.
                            Bu qaror EMAS: talab bajarilmagan bo'lsa ham tasdiqlash mumkin. */}
                        <LadderChecklist
                            {...db.withCachedReads(() => evaluateForPosition(
                                db, app.studentId, club.id,
                                position?.title,
                                club.ladder
                            ))}
                            audience="coordinator"
                        />

                        <StudentPortfolioCard studentId={app.studentId} excludeClubId={club.id} />

                        {isInterviewed && (
                            <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-xs">
                                <CalendarCheck size={14} className="shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold">Suhbatga taklif qilindi — {new Date(app.interviewInvitedAt).toLocaleDateString('uz-UZ')}</p>
                                    {app.interviewNotes && <p className="mt-0.5 text-indigo-600/80 dark:text-indigo-300/80">{app.interviewNotes}</p>}
                                </div>
                            </div>
                        )}

                        {!awaitingAdmin && isCoordinator && !isInterviewed && openInterviewFormId === app.id && (
                            <div className="space-y-2">
                                <textarea
                                    rows={2}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-xl text-sm"
                                    placeholder="Suhbat vaqti/joyi haqida izoh (ixtiyoriy)"
                                    value={interviewDrafts[app.id] || ''}
                                    onChange={e => setInterviewDrafts(d => ({ ...d, [app.id]: e.target.value }))}
                                />
                                <div className="flex gap-2">
                                    <Button variant="primary" size="sm" onClick={() => handleInviteInterview(app.id)}>Taklifni yuborish</Button>
                                    <Button variant="outline" size="sm" onClick={() => setOpenInterviewFormId(null)}>Bekor qilish</Button>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2 pt-1">
                            {!awaitingAdmin && isCoordinator && !isInterviewed && openInterviewFormId !== app.id && (
                                <>
                                    <Button variant="primary" size="sm" icon={MessageCircle} onClick={() => setOpenInterviewFormId(app.id)}>Suhbatga taklif qilish</Button>
                                    <Button variant="outline" size="sm" icon={X} onClick={() => handleAction(app.id, 'coordinator_reject')}>Rad etish</Button>
                                </>
                            )}
                            {!awaitingAdmin && isCoordinator && isInterviewed && (
                                <>
                                    <Button variant="primary" size="sm" icon={Check} onClick={() => handleAction(app.id, 'coordinator_approve')}>Qabul qilish (tavsiya)</Button>
                                    <Button variant="outline" size="sm" icon={X} onClick={() => handleAction(app.id, 'coordinator_reject')}>Rad etish</Button>
                                </>
                            )}
                            {awaitingAdmin && isAdmin && (
                                <>
                                    <Button
                                        variant="primary" size="sm" icon={Check}
                                        disabled={!!conflictOf(app.studentId)}
                                        onClick={() => handleAction(app.id, 'admin_approve')}
                                    >
                                        Tasdiqlash
                                    </Button>
                                    <Button variant="outline" size="sm" icon={X} onClick={() => handleAction(app.id, 'admin_reject')}>Rad etish</Button>
                                </>
                            )}
                            {awaitingAdmin && !isAdmin && (
                                <p className="text-xs text-gray-400">Admin tasdig'ini kutmoqda</p>
                            )}
                            {!awaitingAdmin && !isCoordinator && !isAdmin && (
                                <p className="text-xs text-gray-400">Koordinator ko'rib chiqishini kutmoqda</p>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default PositionApplicationReviewPanel;
