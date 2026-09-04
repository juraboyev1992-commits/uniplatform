import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Play, ShieldCheck, Trash2, CheckCircle2, Lock } from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import RegistrationStatusBadge from '../activities/RegistrationStatusBadge';
import ActivityRegistrationPanel from '../activities/ActivityRegistrationPanel';
import ActivityAttendancePanel from '../common/ActivityAttendancePanel';
import ActivityTasksPanel from '../common/ActivityTasksPanel';
import ActivityReportPanel from '../common/ActivityReportPanel';
import ActivityFinalizationTab from '../common/ActivityFinalizationTab';
import { db } from '../../services/db';
import {
    PARTICIPATION_ROLES, POINTS_EXPLANATION,
} from '../../config/activityLifecycle';

// Tadbirni O'TKAZISH bo'yicha hamma narsa: ro'yxat, davomat, ball, vazifalar,
// e'lon, hisobot, bayonnoma, vakolat. Yaratish/tahrirlash formasi bu yerda EMAS -
// u EventEditForm'da qoladi.
//
// Ikki joyda ishlatiladi va shakli har birida boshqacha:
//   /admin/events/:id  -> tablar, har tab bitta bo'lim (`sections` bilan)
//   ClubProfilePage    -> oyna ichida, hammasi ketma-ket (`sections` berilmaydi)
//
// Shu sabab `sections` propi bor: berilmasa hammasi chiqadi.
const ALL_SECTIONS = ['registration', 'attendance', 'tasks', 'announce', 'report', 'protocol', 'delegation'];

const EventManagementPanel = ({
    event, user, hasClubRole, isAdmin, isManagement,
    canEditDetails, canManageAttendance, actingUsername, onDataChanged,
    sections = null, showLinkedCompetition = true,
}) => {
    const navigate = useNavigate();
    const [version, setVersion] = useState(0);
    const [delegateUsername, setDelegateUsername] = useState('');
    const [busy, setBusy] = useState(false);
    const [finishError, setFinishError] = useState('');
    const [awardResult, setAwardResult] = useState(null);
    const [announceResult, setAnnounceResult] = useState(null);
    const refresh = () => { setVersion(v => v + 1); onDataChanged?.(); };

    const visible = sections || ALL_SECTIONS;
    const shows = (id) => visible.includes(id);

    // Resolves the real competition attached to an event, if any — either the wizard-created link
    // (linkedCompetitionId) or the older event-scoped link (contextType:'event').
    const linkedCompetition = event
        ? (event.linkedCompetitionId ? db.getCompetitionById(event.linkedCompetitionId) : db.getCompetitions().find(c => c.contextType === 'event' && c.contextId === event.id))
        : null;
    const activity = linkedCompetition || event;
    const activityType = linkedCompetition ? 'competition' : 'event';
    const activityClubId = linkedCompetition
        ? (linkedCompetition.contextType === 'club' ? linkedCompetition.contextId : null)
        : event?.clubId;
    const activityStartDateTime = event && activityType === 'competition'
        ? db.combineDateTime(activity.startDate, activity.startTime)
        : event?.date;
    const registeredCount = event ? db.getRegistrationsForActivity(activity.id, activityType).filter(r => r.status === 'registered').length : 0;

    const attendanceRoster = useMemo(() => (event ? db.getEventAttendanceRoster(event.id) : []), [event?.id, version]);
    // Yakunlashdan OLDIN kim qancha ball olishini ko'rsatish - "yakunlash" tugmasi
    // ko'rinmas natija bermasin.
    const pointsPreview = useMemo(
        () => (event ? db.previewActivityPoints(event.id, 'event') : []),
        [event?.id, version]
    );
    const pointsTotal = pointsPreview.reduce((s, r) => s + r.points, 0);
    const pointsAlreadyAwarded = !!event?.pointsAwardedAt;
    const attendanceLocked = event ? db.isAttendanceUnitLocked(event.id, 'event', 'event', event.id) : false;
    const attendanceLockInfo = event ? db.getActivityAttendanceLock(event.id, 'event', 'event', event.id) : null;
    const existingAttendance = event ? db.getActivityAttendance(event.id, 'event', 'event', event.id) : [];
    const auditEntries = event
        ? db.getActivityAttendanceForActivity(event.id, 'event').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        : [];
    const delegations = event ? db.getEventDelegations(event.id) : [];

    const handleGrantDelegation = () => {
        if (!delegateUsername.trim() || !event) return;
        db.grantEventDelegation(event.id, delegateUsername.trim(), ['attendance'], actingUsername);
        setDelegateUsername('');
        refresh();
    };
    const handleRevokeDelegation = (id) => {
        db.revokeEventDelegation(id, actingUsername);
        refresh();
    };

    // Yakunlash UCH ishni bajaradi: holatni o'zgartiradi, davomatni qulflaydi va
    // davomat asosida BALLNI AVTOMATIK yozadi. Ilgari ball uchun talaba alohida ariza
    // yozishi, admin esa uni qo'lda tasdiqlashi kerak edi - davomat bazada tursa ham.
    const handleFinishEvent = async () => {
        if (!event) return;
        setFinishError('');
        setBusy(true);
        try {
            await db.updateEvent(event.id, { status: 'completed' });
            await db.lockActivityAttendanceUnit(event.id, 'event', 'event', event.id, actingUsername);
            const res = await db.awardActivityPoints(event.id, 'event', { by: actingUsername });
            setAwardResult(res);
            refresh();
        } catch (e) {
            setFinishError(e?.message || 'Yakunlashda xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    const handleAnnounce = async () => {
        if (!event) return;
        setFinishError('');
        setBusy(true);
        try {
            const res = await db.announceActivity(event.id, 'event', { by: actingUsername });
            setAnnounceResult(res);
            refresh();
        } catch (e) {
            setFinishError(e?.message || "E'lon qilishda xatolik yuz berdi.");
        } finally {
            setBusy(false);
        }
    };

    if (!event) return null;

    return (
        <div className="space-y-4">
            {showLinkedCompetition && linkedCompetition && (
                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex flex-col items-center text-center gap-3">
                    <Award className="w-8 h-8 text-indigo-600" />
                    <div>
                        <h4 className="font-bold text-indigo-900 text-sm">{linkedCompetition.name}</h4>
                        <p className="text-xs text-indigo-700 mt-0.5">Ushbu tadbirga biriktirilgan turnirni boshqarish va baholash</p>
                    </div>
                    <Button
                        variant="primary" size="sm" icon={Play} className="bg-indigo-600 text-white w-full"
                        onClick={() => navigate(`/${isAdmin ? 'admin' : 'student'}/competitions/${linkedCompetition.id}`)}
                    >
                        Ish maydoniga o'tish
                    </Button>
                </div>
            )}

            {shows('registration') && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-sm text-gray-700">Ro'yxatdan o'tish holati</h3>
                        <RegistrationStatusBadge activity={activity} startDateTime={activityStartDateTime} registeredCount={registeredCount} />
                    </div>
                    <ActivityRegistrationPanel
                        activity={activity}
                        activityType={activityType}
                        clubId={activityClubId}
                        startDateTime={activityStartDateTime}
                        user={user}
                        isAdmin={isAdmin}
                        isManagement={isManagement}
                        hasClubRole={hasClubRole}
                        onRegistered={refresh}
                    />
                </div>
            )}

            {shows('attendance') && canManageAttendance && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="font-bold text-sm text-gray-700">Davomat</h3>
                        {canEditDetails && event.status !== 'completed' && (
                            <button type="button" disabled={busy} onClick={handleFinishEvent} className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50 rounded-lg disabled:opacity-40">
                                <CheckCircle2 size={12} /> {busy ? 'Yakunlanmoqda...' : 'Yakunlash va ball berish'}
                            </button>
                        )}
                        {event.status === 'completed' && <Badge variant="default" size="sm" className="flex items-center gap-1"><Lock size={10} /> Yakunlangan</Badge>}
                    </div>

                    {/* Yakunlashdan oldin natija ko'rinib tursin. Ball berilgandan keyin
                        takrorlanmaydi - `pointsAwardedAt` shuni kafolatlaydi. */}
                    {pointsPreview.length > 0 && (
                        <div className="px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl">
                            <p className="text-[11px] font-bold text-amber-800">
                                {pointsAlreadyAwarded
                                    ? `Ball berilgan: ${pointsPreview.length} talaba, jami ${pointsTotal} ball`
                                    : `Yakunlanganda ${pointsPreview.length} talabaga jami ${pointsTotal} ball avtomatik yoziladi`}
                            </p>
                            <p className="text-[10px] text-amber-700 mt-0.5">{POINTS_EXPLANATION}</p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                                {pointsPreview.slice(0, 8).map(r => (
                                    <span key={r.participantId} className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${PARTICIPATION_ROLES[r.role]?.tone || ''}`}>
                                        {r.studentName} +{r.points}
                                    </span>
                                ))}
                                {pointsPreview.length > 8 && (
                                    <span className="text-[10px] text-amber-700 font-semibold self-center">
                                        va yana {pointsPreview.length - 8} ta
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                    {finishError && (
                        <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            {finishError}
                        </p>
                    )}
                    {awardResult && (
                        <p className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                            {awardResult.alreadyAwarded
                                ? 'Ball allaqachon berilgan — takrorlanmadi.'
                                : `${awardResult.awarded} talabaga jami ${awardResult.total} ball avtomatik yozildi.`}
                        </p>
                    )}
                    {/* Tashabbuskorlik belgisi (11-mezon) FAQAT ma'naviy-ma'rifiy
                        deb belgilangan tadbirda chiqadi. Tasnif tadbir yaratilganda
                        qilinadi - davomat kiritayotgan odam buni o'ylab
                        o'tirmasligi kerak. */}
                    {!event.isSpiritual && (
                        <p className="text-[11px] text-gray-400">
                            Bu tadbir «ma'naviy-ma'rifiy» deb belgilanmagan, shuning uchun
                            tashabbuskorlik qayd etilmaydi (11-mezon). Kerak bo'lsa tadbirni
                            tahrirlab belgilang.
                        </p>
                    )}
                    <ActivityAttendancePanel
                        showRoles
                        showInitiative={!!event.isSpiritual}
                        roster={attendanceRoster}
                        existingAttendance={existingAttendance}
                        locked={attendanceLocked}
                        lockInfo={attendanceLockInfo}
                        auditEntries={auditEntries}
                        canManage={canManageAttendance}
                        canReopen={isAdmin}
                        onSave={async (entries, reason) => {
                            await db.setActivityAttendanceBulk(event.id, 'event', 'event', event.id, entries, actingUsername, reason);
                            refresh();
                        }}
                        onReopen={async () => {
                            await db.reopenActivityAttendanceUnit(event.id, 'event', 'event', event.id, actingUsername);
                            refresh();
                        }}
                    />
                </div>
            )}

            {/* Vazifalar taqsimoti - tadbirdan OLDIN, tayyorgarlik uchun. */}
            {shows('tasks') && canEditDetails && (
                <ActivityTasksPanel
                    activityId={event.id} activityType="event"
                    canManage={canEditDetails} actingUsername={actingUsername}
                    onChanged={refresh}
                />
            )}

            {/* E'lon - klub a'zolariga xabar. Cheklovlarga mos kelmaydigan
                talabaga xabar bormaydi. Bir marta yuboriladi. */}
            {shows('announce') && canEditDetails && event.status !== 'completed' && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                            <h3 className="font-bold text-sm text-gray-700">E'lon qilish</h3>
                            <p className="text-[11px] text-gray-400">Klub a'zolariga bildirishnoma yuboriladi.</p>
                        </div>
                        {event.announcedAt ? (
                            <Badge variant="success" size="sm">E'lon qilingan</Badge>
                        ) : (
                            <Button variant="outline" size="sm" disabled={busy} onClick={handleAnnounce}>
                                {busy ? 'Yuborilmoqda...' : "E'lon qilish"}
                            </Button>
                        )}
                    </div>
                    {announceResult && (
                        <p className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                            {announceResult.alreadyAnnounced
                                ? "Bu tadbir allaqachon e'lon qilingan."
                                : `${announceResult.sent} talabaga xabar yuborildi.`}
                        </p>
                    )}
                </div>
            )}

            {/* Yakuniy hisobot - raqamlar avtomatik, qo'lda faqat uch matn. */}
            {shows('report') && canEditDetails && (
                event.status === 'completed' ? (
                    <ActivityReportPanel
                        activityId={event.id} activityType="event"
                        canManage={canEditDetails} actingUsername={actingUsername}
                        onChanged={refresh}
                    />
                ) : (
                    <p className="text-xs text-gray-400">
                        Hisobot tadbir yakunlangandan keyin ochiladi.
                    </p>
                )
            )}

            {/* Rasmiy yakun: bayonnoma -> imzo -> tasdiq -> hujjatlar. Bu blok
                musobaqalarda ishlab turgan edi; tadbirga ulanmagan edi, holbuki
                db.getActivityFinalSnapshot tadbirni allaqachon qo'llab-quvvatlaydi. */}
            {shows('protocol') && canEditDetails && (
                event.status === 'completed' ? (
                    <div className="-mx-6">
                        <ActivityFinalizationTab
                            activityType="event"
                            activity={event}
                            canManage={canEditDetails}
                            isAdmin={isAdmin}
                            actingUsername={actingUsername}
                            onChanged={refresh}
                        />
                    </div>
                ) : (
                    <p className="text-xs text-gray-400">
                        Bayonnoma tadbir yakunlangandan keyin tuziladi.
                    </p>
                )
            )}

            {shows('delegation') && canEditDetails && (
                <div className="space-y-3">
                    <h3 className="font-bold text-sm text-gray-700">Vakolat berish (davomat)</h3>
                    <p className="text-[11px] text-gray-400">
                        Boshqa birovga ushbu tadbir uchun faqat davomat belgilash huquqini bering.
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={delegateUsername}
                            onChange={e => setDelegateUsername(e.target.value)}
                            placeholder="Foydalanuvchi nomi (username)"
                            className="flex-1 px-3 py-2 border rounded-xl text-sm"
                        />
                        <button
                            type="button"
                            onClick={handleGrantDelegation}
                            disabled={!delegateUsername.trim()}
                            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-700"
                        >
                            <ShieldCheck size={13} /> Berish
                        </button>
                    </div>
                    {delegations.length > 0 && (
                        <div className="space-y-1.5">
                            {delegations.map(d => (
                                <div key={d.id} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 rounded-lg text-xs">
                                    <span className="font-semibold text-gray-700">{d.granteeUsername}</span>
                                    <button type="button" onClick={() => handleRevokeDelegation(d.id)} className="flex items-center gap-1 text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg">
                                        <Trash2 size={11} /> Bekor qilish
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default EventManagementPanel;
