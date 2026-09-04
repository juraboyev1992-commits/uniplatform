import React, { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Lock, Unlock, History } from 'lucide-react';
import Button from './Button';
import Badge from './Badge';
import { PARTICIPATION_ROLES, PARTICIPATION_ROLE_ORDER, DEFAULT_PARTICIPATION_ROLE } from '../../config/activityLifecycle';
import { INITIATIVE_TYPES, initiativePoints } from '../../config/socialActivityIndex';

// Shared, engine-agnostic attendance checklist — mounted at every attachment point (Sport match,
// Munozara bench, jamoaviy criteria_based/single_score round, event) with only the roster/lock/save
// wiring differing per caller. Opt-out UX: every roster member starts pre-checked ("hozir"), the marker
// only unchecks absentees — the common "everyone showed up" case is a single click regardless of roster
// size, since this always renders one leaf unit (one match/round/event) at a time, never the whole
// tournament at once.
//
// Props:
//   roster: [{participantId, teamId, student}] — from one of db.js's getXAttendanceRoster resolvers.
//   existingAttendance: [{participantId, status}] — db.getActivityAttendance(...) for this exact leaf unit.
//   locked: bool — db.isAttendanceUnitLocked(...) for this exact leaf unit.
//   lockInfo: {lockedAt, lockedByUserId} | null
//   auditEntries: [{participantId, previousStatus, newStatus, markedByUserId, reason, createdAt}] — this
//     leaf unit's own slice of db.getActivityAttendanceForActivity(...), newest-first.
//   canManage: bool — gates the checklist/save controls at all (a plain registrant never sees this).
//   canReopen: bool — admin-only "Qayta ochish" (reopen-after-lock) capability.
//   onSave(entries, reason): entries = [{participantId, teamId, status}] for the WHOLE roster (Save
//     always sends every roster row, not just changed ones — matches setActivityAttendanceBulk's upsert
//     shape). Reason is required by the caller only when `locked` is true.
//   onReopen(): void
//   showRoles: bool — ishtirok rolini (ishtirokchi/volontyor/ma'ruzachi/tashkilotchi) belgilash
//     imkonini beradi. ATAYLAB ixtiyoriy: musobaqa ilova nuqtalarida (match, raund) rol tushunchasi
//     yo'q, shuning uchun u yerlarda hech narsa o'zgarmaydi. Yoqilmagan bo'lsa saqlashda rol ham
//     yuborilmaydi va db qatlami eski yozuvning rolini o'zgarishsiz qoldiradi.
const ActivityAttendancePanel = ({
    roster, existingAttendance = [], locked, lockInfo = null, auditEntries = [],
    canManage, canReopen = false, onSave, onReopen, teamNameResolver = null,
    showRoles = false, showInitiative = false
}) => {
    const statusByParticipant = useMemo(() => new Map(existingAttendance.map(a => [a.participantId, a.status])), [existingAttendance]);
    const roleByParticipant = useMemo(() => new Map(existingAttendance.map(a => [a.participantId, a.role || DEFAULT_PARTICIPATION_ROLE])), [existingAttendance]);
    const initiativeByParticipant = useMemo(() => new Map(existingAttendance.map(a => [a.participantId, a.initiative || ''])), [existingAttendance]);

    // Opt-out default: no existing record yet -> 'present'. Local draft only commits on "Saqlash".
    const [draft, setDraft] = useState(() => new Map(roster.map(r => [r.participantId, statusByParticipant.get(r.participantId) || 'present'])));
    const [roleDraft, setRoleDraft] = useState(() => new Map(roster.map(r => [r.participantId, roleByParticipant.get(r.participantId) || DEFAULT_PARTICIPATION_ROLE])));
    const [initiativeDraft, setInitiativeDraft] = useState(() => new Map(roster.map(r => [r.participantId, initiativeByParticipant.get(r.participantId) || ''])));
    const [reason, setReason] = useState('');
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    const toggle = (participantId) => {
        if (locked || !canManage) return;
        setDraft(prev => {
            const next = new Map(prev);
            next.set(participantId, prev.get(participantId) === 'present' ? 'absent' : 'present');
            return next;
        });
        setSaved(false);
    };

    const handleSave = () => {
        if (locked && !reason.trim()) { setError('Sabab kiritilishi shart'); return; }
        setError('');
        const entries = roster.map(r => ({
            participantId: r.participantId, teamId: r.teamId,
            status: draft.get(r.participantId) || 'present',
            ...(showRoles ? { role: roleDraft.get(r.participantId) || DEFAULT_PARTICIPATION_ROLE } : {}),
            // Yoqilmagan bo'lsa yuborilmaydi ham - db qatlami mavjud qiymatni
            // o'zgarishsiz qoldiradi (rol bilan bir xil naqsh).
            ...(showInitiative ? { initiative: initiativeDraft.get(r.participantId) || null } : {}),
        }));
        try {
            onSave(entries, locked ? reason.trim() : null);
            setReason('');
            setSaved(true);
            setTimeout(() => setSaved(false), 1800);
        } catch (err) {
            setError(err?.message || 'Xatolik yuz berdi.');
        }
    };

    const groupedByTeam = useMemo(() => {
        const hasTeams = roster.some(r => r.teamId);
        if (!hasTeams) return [{ teamId: null, members: roster }];
        const byTeam = new Map();
        roster.forEach(r => {
            const key = r.teamId || '__no_team__';
            if (!byTeam.has(key)) byTeam.set(key, []);
            byTeam.get(key).push(r);
        });
        return Array.from(byTeam.entries()).map(([teamId, members]) => ({ teamId: teamId === '__no_team__' ? null : teamId, members }));
    }, [roster]);

    if (roster.length === 0) {
        return <p className="text-xs text-gray-400 text-center py-4">Davomat uchun ishtirokchi yo'q (barchasi baholangan yoki hali hech kim ro'yxatdan o'tmagan).</p>;
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                    {locked ? (
                        <Badge variant="default" size="sm" className="flex items-center gap-1"><Lock size={11} /> Yakunlangan</Badge>
                    ) : (
                        <Badge variant="success" size="sm" className="flex items-center gap-1"><Unlock size={11} /> Ochiq</Badge>
                    )}
                    {lockInfo?.lockedAt && (
                        <span className="text-[10px] text-gray-400">
                            {new Date(lockInfo.lockedAt).toLocaleString('uz-UZ')} — {lockInfo.lockedByUserId}
                        </span>
                    )}
                </div>
                {locked && canReopen && (
                    <button type="button" onClick={onReopen} className="text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg">
                        Qayta ochish
                    </button>
                )}
            </div>

            <div className="space-y-3">
                {groupedByTeam.map(group => (
                    <div key={group.teamId || 'flat'} className="space-y-1.5">
                        {group.teamId && <p className="text-[11px] font-bold text-gray-400 uppercase">{teamNameResolver ? teamNameResolver(group.teamId) : group.teamId}</p>}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {group.members.map(m => {
                                const status = draft.get(m.participantId) || 'present';
                                const isPresent = status === 'present';
                                const role = roleDraft.get(m.participantId) || DEFAULT_PARTICIPATION_ROLE;
                                return (
                                    <div
                                        key={m.participantId}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs transition-colors ${
                                            isPresent
                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                : 'border-rose-200 bg-rose-50 text-rose-700'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            disabled={locked || !canManage}
                                            onClick={() => toggle(m.participantId)}
                                            className="flex items-center justify-between gap-2 flex-1 min-w-0 text-left disabled:cursor-not-allowed"
                                        >
                                            <span className="font-semibold truncate">{m.student?.fullName || m.participantId}</span>
                                            {isPresent ? <CheckCircle2 size={14} className="shrink-0" /> : <XCircle size={14} className="shrink-0" />}
                                        </button>
                                        {/* Rol faqat KELGAN ishtirokchida ma'noga ega - kelmagan odamning
                                            roli ball ham, hujjat ham bermaydi. */}
                                        {showRoles && isPresent && (
                                            <select
                                                value={role}
                                                disabled={locked || !canManage}
                                                onChange={e => {
                                                    const value = e.target.value;
                                                    setRoleDraft(prev => new Map(prev).set(m.participantId, value));
                                                    setSaved(false);
                                                }}
                                                className="shrink-0 bg-white border border-emerald-200 rounded-lg px-1.5 py-1 text-[11px] font-semibold text-gray-600 disabled:bg-gray-50 disabled:cursor-not-allowed"
                                            >
                                                {PARTICIPATION_ROLE_ORDER.map(id => (
                                                    <option key={id} value={id}>{PARTICIPATION_ROLES[id].short}</option>
                                                ))}
                                            </select>
                                        )}
                                        {/* TASHABBUSKORLIK (11-mezon). Bir tadbirda
                                            odatda yo'q yoki bitta-ikkita - shuning
                                            uchun standart holat "belgilanmagan".
                                            Kelmagan odam tashabbuskor bo'la olmaydi. */}
                                        {showInitiative && isPresent && (
                                            <select
                                                value={initiativeDraft.get(m.participantId) || ''}
                                                disabled={locked || !canManage}
                                                onChange={e => {
                                                    const value = e.target.value;
                                                    setInitiativeDraft(prev => new Map(prev).set(m.participantId, value));
                                                    setSaved(false);
                                                }}
                                                title="Tashabbuskorlik (11-mezon)"
                                                className={`shrink-0 border rounded-lg px-1.5 py-1 text-[11px] font-semibold disabled:bg-gray-50 disabled:cursor-not-allowed ${
                                                    initiativeDraft.get(m.participantId)
                                                        ? 'bg-violet-50 border-violet-300 text-violet-700'
                                                        : 'bg-white border-emerald-200 text-gray-400'
                                                }`}
                                            >
                                                <option value="">Tashabbus —</option>
                                                {INITIATIVE_TYPES.map(t => (
                                                    <option key={t.key} value={t.key}>
                                                        {t.label} ({initiativePoints(t.key)} ball)
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {canManage && (
                <div className="space-y-2">
                    {locked && (
                        <input
                            type="text"
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="Sababini kiriting (yakunlangan davomatni o'zgartirish uchun shart)..."
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs"
                        />
                    )}
                    {error && <p className="text-[11px] font-semibold text-red-500">{error}</p>}
                    <div className="flex items-center gap-2">
                        <Button variant="primary" size="sm" onClick={handleSave}>Saqlash</Button>
                        {saved && <span className="text-[11px] font-bold text-emerald-600">✓ Saqlandi</span>}
                    </div>
                </div>
            )}

            {auditEntries.length > 0 && (
                <details className="text-[11px] text-gray-400">
                    <summary className="cursor-pointer font-semibold flex items-center gap-1 select-none"><History size={11} /> Tarix ({auditEntries.length})</summary>
                    <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto">
                        {auditEntries.map(a => {
                            const who = roster.find(r => r.participantId === a.participantId)?.student?.fullName || a.participantId;
                            return (
                                <div key={a.id || `${a.participantId}_${a.createdAt}`} className="px-2 py-1 bg-slate-50 rounded-lg">
                                    <span className="font-semibold">{who}</span>: {a.previousStatus || 'belgilanmagan'} → {a.newStatus}
                                    {' '}({a.markedByUserId}, {new Date(a.createdAt).toLocaleString('uz-UZ')})
                                    {a.reason && <span className="italic"> — {a.reason}</span>}
                                </div>
                            );
                        })}
                    </div>
                </details>
            )}
        </div>
    );
};

export default ActivityAttendancePanel;
