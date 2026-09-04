import React, { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { db, POSITION_TYPE_LABELS } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';

// Ariza-only model — the coordinator never invites, a student applies for themselves (spec section 4).
const PositionApplicationModal = ({ isOpen, onClose, position, onSubmitted }) => {
    const { user } = useAuth();
    const [motivation, setMotivation] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!user) return;
        try {
            db.applyForPosition(position.id, user.username, motivation);
            setMotivation('');
            setError('');
            onSubmitted();
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`${POSITION_TYPE_LABELS[position.title] || position.title} — ariza`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Nima uchun bu lavozimga mos kelasiz?</label>
                    <textarea
                        required
                        rows={4}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={motivation}
                        onChange={e => setMotivation(e.target.value)}
                        placeholder="Tajribangiz, motivatsiyangiz haqida yozing..."
                    />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-3 pt-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Bekor qilish</Button>
                    <Button type="submit" variant="primary" className="flex-1">Ariza yuborish</Button>
                </div>
            </form>
        </Modal>
    );
};

export default PositionApplicationModal;
