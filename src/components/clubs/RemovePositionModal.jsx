import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from '../common/Button';
import Modal from '../common/Modal';
import { db, POSITION_TYPE_LABELS, POSITION_BADGE_STYLES } from '../../services/db';

// Shared confirm+optional-reason flow for ending a position — used both by a roster row's inline chip
// "✕" (single `entries` item, preselected) and the "Amallar" menu's "Lavozimni olib tashlash" (all of
// that student's current positions in this club, picked from a list). Writes to the same
// db.removeFromClubPosition ledger/audit-log either way; `entries` come straight from
// db.getCurrentClubRoster.
const RemovePositionModal = ({ isOpen, onClose, student, entries = [], preselectedKey, clubId, endedByUserId, onRemoved }) => {
    const [selectedKey, setSelectedKey] = useState(preselectedKey || entries[0]?.positionTitle || '');
    const [reason, setReason] = useState('');

    useEffect(() => {
        if (isOpen) {
            setSelectedKey(preselectedKey || entries[0]?.positionTitle || '');
            setReason('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, preselectedKey]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (!selectedKey) return;
        db.removeFromClubPosition({
            clubId, studentId: student.id, positionTitle: selectedKey,
            endedByUserId, endReason: 'cancelled', comment: reason.trim()
        });
        onClose();
        onRemoved();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Lavozimdan olib tashlash" size="sm">
            <div className="space-y-4">
                <p className="text-sm text-gray-600">
                    <span className="font-bold text-gray-900">{student?.fullName || student?.id}</span>ni quyidagi lavozim(lar)dan olib tashlamoqchimisiz?
                </p>

                {entries.length > 1 ? (
                    <div className="flex flex-wrap gap-2">
                        {entries.map(e => (
                            <button
                                key={e.positionTitle}
                                type="button"
                                onClick={() => setSelectedKey(e.positionTitle)}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                                    selectedKey === e.positionTitle
                                        ? `ring-2 ring-offset-1 ring-red-400 ${POSITION_BADGE_STYLES[e.positionTitle] || 'bg-gray-100 text-gray-700'}`
                                        : `opacity-60 hover:opacity-100 ${POSITION_BADGE_STYLES[e.positionTitle] || 'bg-gray-100 text-gray-700'}`
                                }`}
                            >
                                {POSITION_TYPE_LABELS[e.positionTitle] || e.positionTitle}
                            </button>
                        ))}
                    </div>
                ) : (
                    <span className={`inline-flex px-3 py-1.5 rounded-full text-xs font-semibold ${POSITION_BADGE_STYLES[selectedKey] || 'bg-gray-100 text-gray-700'}`}>
                        {POSITION_TYPE_LABELS[selectedKey] || selectedKey}
                    </span>
                )}

                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 text-amber-700 text-xs font-semibold">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" /> Bu amal audit logga yoziladi va bekor qilib bo'lmaydi.
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Sabab (ixtiyoriy)</label>
                    <textarea
                        rows={2}
                        className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm"
                        placeholder="Masalan: muddati tugadi, o'zi so'radi..."
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                    />
                </div>

                <div className="flex gap-3 pt-1">
                    <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Bekor qilish</Button>
                    <Button type="button" variant="danger" className="flex-1" disabled={!selectedKey} onClick={handleConfirm}>Olib tashlash</Button>
                </div>
            </div>
        </Modal>
    );
};

export default RemovePositionModal;
