import React, { useMemo, useState } from 'react';
import { Plus, Crown, Lock, Clock } from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import { db, POSITION_TYPE_LABELS, INTERNAL_POSITION_TYPES } from '../../services/db';
import { useAuth, ROLES } from '../../contexts/AuthContext';
import { canManageClubStructure } from '../../utils/permissions';
import OpenPositionCard from './OpenPositionCard';
import PositionApplicationReviewPanel from './PositionApplicationReviewPanel';
import ClubRosterCard from './ClubRosterCard';
import ClubRosterTable from './ClubRosterTable';
import ClubHistoryPanel from './ClubHistoryPanel';
import ClubAuditTimeline from './ClubAuditTimeline';

const PUBLIC_POSITION_TITLES = ['head_coordinator', 'assistant_coordinator'];

// "Klub tarkibi" tab — professional university management workspace. Two entry points into the
// position/roster domain coexist, neither replacing the other:
//   1. "Lavozimga tayinlash" (this file, PositionAssignPanel) — admin/coordinator picks a student and
//      assigns immediately. Backed by db.assignPosition/getCurrentClubRoster.
//   2. "Ochiq imkoniyatlar" (OpenPositionCard/PositionApplicationModal, unchanged) — student-initiated
//      ariza the coordinator recommends and admin approves. Backed by clubPositions/clubPositionApplications.
const ClubOrgStructureSection = ({ club, refreshKey, onRefresh }) => {
    const { user, hasClubRole } = useAuth();
    const isAdmin = user?.role === ROLES.ADMIN;
    const canManage = canManageClubStructure(user, hasClubRole, club.id);

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [form, setForm] = useState({ title: INTERNAL_POSITION_TYPES[0], slots: 1, duration: '', requirements: '' });
    const [formError, setFormError] = useState('');

    const roster = useMemo(() => db.getCurrentClubRoster(club.id), [club.id, refreshKey]);
    // Ariza bosqichida "Klub rahbari (taklif etiladigan)" nomi kiritilgan -
    // bu HALI HAQIQIY TAYINLOV EMAS (talaba erkin matn yozgan, platformada
    // ro'yxatdan o'tgan foydalanuvchi bo'lmasligi ham mumkin). Shuning uchun
    // faqat HALI head_coordinator tayinlanmagan paytda, eslatma sifatida
    // ko'rsatiladi - admin buni ko'rib, haqiqiy tayinlovni shu asosda qiladi.
    const foundingFields = db.getFoundingApplicationFields(club.id);
    const hasHeadCoordinator = roster.some(r => r.positionTitle === 'head_coordinator');
    const visibleRoster = useMemo(
        () => (canManage ? roster : roster.filter(r => PUBLIC_POSITION_TITLES.includes(r.positionTitle))),
        [roster, canManage]
    );
    const sortedRoster = useMemo(() => {
        const order = { head_coordinator: 0, assistant_coordinator: 1, smm: 2, media_design: 3, event_coordinator: 4, volunteer: 5 };
        return [...visibleRoster].sort((a, b) => (order[a.positionTitle] ?? 9) - (order[b.positionTitle] ?? 9));
    }, [visibleRoster]);

    const positions = useMemo(() => db.getClubPositions(club.id), [club.id, refreshKey]);
    const applicationCountByPosition = useMemo(() => {
        const map = new Map();
        positions.forEach(p => map.set(p.id, db.getPositionApplications(p.id).length));
        return map;
    }, [positions, refreshKey]);

    const handleCreatePosition = (e) => {
        e.preventDefault();
        try {
            db.createClubPosition({
                clubId: club.id,
                kind: 'internal',
                title: form.title,
                slots: Number(form.slots) || 1,
                duration: form.duration,
                requirements: form.requirements,
                createdBy: user.username
            });
            setIsCreateOpen(false);
            setFormError('');
            setForm({ title: INTERNAL_POSITION_TYPES[0], slots: 1, duration: '', requirements: '' });
            onRefresh();
        } catch (err) {
            setFormError(err.message);
        }
    };

    const handleRemoveFromRoster = (entry) => {
        const fullName = entry.student?.fullName || entry.studentId;
        if (!window.confirm(`"${fullName}"ni "${POSITION_TYPE_LABELS[entry.positionTitle]}" lavozimidan olib tashlamoqchimisiz?`)) return;
        db.removeFromClubPosition({
            clubId: club.id, studentId: entry.studentId, positionTitle: entry.positionTitle,
            endedByUserId: user.username, endReason: 'cancelled'
        });
        onRefresh();
    };

    return (
        <div className="space-y-8">
            {/* Header row — the "Lavozimga tayinlash" entry point now lives inside ClubRosterTable's own
                control panel (canManage-only professional workspace); the public/student view below
                keeps its original simple roster list untouched. */}
            <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Klub tarkibi</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Klubdagi joriy rasmiy va ichki lavozimlar</p>
            </div>

            {/* Roster — full width now (no more side-by-side sidebar competing for space; that layout
                kept getting squeezed since this section already sits inside ClubProfilePage's own
                xl:grid-cols-4 layout, which reserves 1/4 of the viewport for the sticky "Tadbir va
                musobaqalar" panel). Audit log / Tarixiy tarkib moved below the table instead — see next
                block — per direct feedback, rather than relocating them to a different tab. */}
            {canManage ? (
                <ClubRosterTable club={club} roster={sortedRoster} isAdmin={isAdmin} assignedByUserId={user.username} onRefresh={onRefresh} />
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                        <Crown size={16} className="text-amber-500" />
                        <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Klub tarkibi (Joriy)</h4>
                    </div>
                    {!hasHeadCoordinator && foundingFields?.leader && (
                        <p className="flex items-center gap-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 mb-3">
                            <Crown size={13} className="shrink-0" />
                            Arizada taklif etilgan rahbar: <b>{foundingFields.leader}</b> — hali rasman tayinlanmagan.
                        </p>
                    )}
                    {sortedRoster.length === 0 ? (
                        <div className="text-center py-10 text-sm text-gray-400">
                            Hozircha lavozimga tayinlangan a'zolar yo'q
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-50 dark:divide-gray-700 pb-1">
                            {sortedRoster.map(entry => (
                                <ClubRosterCard
                                    key={`${entry.positionTitle}::${entry.studentId}`}
                                    entry={entry}
                                    canRemove={isAdmin}
                                    onRemove={handleRemoveFromRoster}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Audit log + Tarixiy tarkib — below the roster, side by side once there's room (admin-only). */}
            {isAdmin && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2">
                                <Clock size={14} className="text-gray-400" />
                                <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Audit log</h4>
                            </div>
                        </div>
                        <ClubAuditTimeline clubId={club.id} />
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
                            <div className="flex items-center gap-2">
                                <Lock size={14} className="text-gray-400" />
                                <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Tarixiy tarkib (faqat admin uchun)</h4>
                            </div>
                            <Badge variant="default" size="sm">Admin ko'radi</Badge>
                        </div>
                        <div className="p-4 pt-2">
                            <ClubHistoryPanel clubId={club.id} />
                        </div>
                    </div>
                </div>
            )}

            {/* Ariza-based open positions — unchanged, full width */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100">Ochiq imkoniyatlar</h3>
                    {isAdmin && (
                        <Button variant="outline" size="sm" icon={Plus} onClick={() => setIsCreateOpen(true)}>Yangi lavozim ochish</Button>
                    )}
                </div>
                {positions.length === 0 ? (
                    <div className="text-center py-10 text-sm text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                        Hozircha ochiq lavozimlar yo'q
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {positions.map(p => (
                            <OpenPositionCard
                                key={p.id}
                                position={p}
                                applicationCount={applicationCountByPosition.get(p.id) || 0}
                                onRefresh={onRefresh}
                            />
                        ))}
                    </div>
                )}
            </div>

            {canManage && (
                <div>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-3">Arizalarni ko'rib chiqish</h3>
                    <PositionApplicationReviewPanel club={club} positions={positions} onRefresh={onRefresh} />
                </div>
            )}

            <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Yangi lavozim ochish">
                <form onSubmit={handleCreatePosition} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Lavozim</label>
                        <select
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                            value={form.title}
                            onChange={e => setForm({ ...form, title: e.target.value })}
                        >
                            {INTERNAL_POSITION_TYPES.map(t => <option key={t} value={t}>{POSITION_TYPE_LABELS[t]}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">O'rinlar soni</label>
                            <input
                                type="number"
                                min="1"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                                value={form.slots}
                                onChange={e => setForm({ ...form, slots: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Muddat</label>
                            <input
                                type="text"
                                placeholder="masalan: 1 semestr"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                                value={form.duration}
                                onChange={e => setForm({ ...form, duration: e.target.value })}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Talablar</label>
                        <textarea
                            rows={3}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                            value={form.requirements}
                            onChange={e => setForm({ ...form, requirements: e.target.value })}
                        />
                    </div>
                    {formError && <p className="text-sm text-red-600">{formError}</p>}
                    <div className="flex gap-3 pt-2">
                        <Button type="button" variant="outline" className="flex-1" onClick={() => setIsCreateOpen(false)}>Bekor qilish</Button>
                        <Button type="submit" variant="primary" className="flex-1">Ochish</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ClubOrgStructureSection;
