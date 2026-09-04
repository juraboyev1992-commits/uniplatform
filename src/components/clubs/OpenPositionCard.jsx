import React, { useMemo, useState } from 'react';
import { Users, Clock } from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { db, POSITION_TYPE_LABELS, POSITION_APPLICATION_STATUS_LABELS } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { canManageClubStructure } from '../../utils/permissions';
import PositionApplicationModal from './PositionApplicationModal';

// One "Ochiq imkoniyat" card (spec section 4): title, slots, duration, requirements, application count,
// apply button. Coordinator/admin get a "Yopish" action instead of an apply button.
const OpenPositionCard = ({ position, applicationCount, onRefresh }) => {
    const { user, hasClubRole } = useAuth();
    const [isApplyOpen, setIsApplyOpen] = useState(false);
    const canManage = canManageClubStructure(user, hasClubRole, position.clubId);
    const isClosed = position.status !== 'open';
    const isFull = position.slots > 0 && position.filledCount >= position.slots;

    const myApplication = useMemo(
        () => (user ? db.getPositionApplications(position.id).find(a => a.studentId === user.username && a.status === 'PENDING') : null),
        [user, position.id, applicationCount]
    );

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
                <h4 className="font-bold text-gray-900 dark:text-gray-100">{POSITION_TYPE_LABELS[position.title] || position.title}</h4>
                <Badge variant={isClosed ? 'default' : isFull ? 'warning' : 'success'} size="sm">
                    {isClosed ? 'Yopilgan' : isFull ? "To'lgan" : 'Ochiq'}
                </Badge>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1"><Users size={12} /> {position.filledCount || 0}/{position.slots} o'rin</span>
                {position.duration && <span className="flex items-center gap-1"><Clock size={12} /> {position.duration}</span>}
                <span>{applicationCount} ta ariza</span>
            </div>
            {position.requirements && <p className="text-sm text-gray-500 dark:text-gray-400">{position.requirements}</p>}

            {canManage ? (
                !isClosed && (
                    <Button variant="outline" size="sm" onClick={() => { db.closeClubPosition(position.id); onRefresh(); }}>
                        Yopish
                    </Button>
                )
            ) : myApplication ? (
                <Badge variant="info" size="sm">
                    {myApplication.interviewInvitedAt
                        ? "Suhbatga taklif qilindingiz"
                        : `Ariza yuborilgan · ${POSITION_APPLICATION_STATUS_LABELS[myApplication.status]}`}
                </Badge>
            ) : (
                !isClosed && !isFull && user && (
                    <Button variant="primary" size="sm" className="w-full" onClick={() => setIsApplyOpen(true)}>
                        Ariza topshirish
                    </Button>
                )
            )}

            <PositionApplicationModal
                isOpen={isApplyOpen}
                onClose={() => setIsApplyOpen(false)}
                position={position}
                onSubmitted={() => { setIsApplyOpen(false); onRefresh(); }}
            />
        </div>
    );
};

export default OpenPositionCard;
