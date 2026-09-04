import React, { useState, useEffect } from 'react';
import { Shield, Plus, Edit2, Trash2, Users, Target } from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import CopyableId from '../common/CopyableId';
import { db } from '../../services/db';

const ClubManagement = () => {
    const [clubs, setClubs] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingClub, setEditingClub] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '', category: '', pointsModifier: 1.0 });

    useEffect(() => {
        loadClubs();
    }, []);

    const loadClubs = () => {
        setClubs(db.getClubs());
    };

    const handleOpenModal = (club = null) => {
        if (club) {
            setEditingClub(club);
            setFormData({ name: club.name, description: club.description, category: club.category, pointsModifier: club.pointsModifier });
        } else {
            setEditingClub(null);
            setFormData({ name: '', description: '', category: '', pointsModifier: 1.0 });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (editingClub) {
            await db.updateClub(editingClub.id, formData);
        } else {
            await db.createClub(formData);
        }
        setIsModalOpen(false);
        loadClubs();
    };

    const handleDelete = async (id) => {
        if (window.confirm("Rostdan ham bu klubni o'chirmoqchimisiz?")) {
            await db.deleteClub(id);
            loadClubs();
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tighter flex items-center gap-2">
                    <Shield className="w-8 h-8 text-indigo-600" />
                    Klublarni Boshqarish
                </h1>
                <Button variant="primary" icon={Plus} onClick={() => handleOpenModal()}>
                    Yangi Klub
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {clubs.map(club => (
                    <Card key={club.id} className="flex flex-col h-full border-t-4 border-t-indigo-500">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="font-bold text-lg text-gray-900">{club.name}</h3>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    <CopyableId value={`Klub #${club.displayNumber}`}>Klub #{club.displayNumber}</CopyableId>
                                </p>
                                <Badge variant="secondary" size="sm" className="mt-1">{club.category}</Badge>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleOpenModal(club)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded bg-gray-50 hover:bg-indigo-50 transition-colors">
                                    <Edit2 size={16} />
                                </button>
                                <button onClick={() => handleDelete(club.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded bg-gray-50 hover:bg-red-50 transition-colors">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-6 flex-grow">{club.description}</p>
                        
                        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                            <div className="flex items-center text-sm font-bold text-gray-700">
                                <Users size={16} className="mr-1.5 text-indigo-500" />
                                {club.membersCount || 0} a'zo
                            </div>
                            <div className="flex items-center text-xs font-bold text-gray-500 bg-gray-50 px-2 py-1 rounded-md">
                                <Target size={14} className="mr-1 text-emerald-500" />
                                x{club.pointsModifier} ball
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            <Modal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                title={editingClub ? "Klubni tahrirlash" : "Yangi klub qo'shish"}
                headerClassName="bg-indigo-600 text-white"
            >
                <div className="space-y-4 p-2">
                    <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1">Nomi</label>
                        <input 
                            type="text" 
                            className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1">Tavsifi</label>
                        <textarea 
                            className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
                            rows={3}
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-black text-gray-500 uppercase mb-1">Kategoriya</label>
                            <input 
                                type="text" 
                                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
                                value={formData.category}
                                onChange={e => setFormData({...formData, category: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-black text-gray-500 uppercase mb-1">Ball Ko'paytuvchisi</label>
                            <input 
                                type="number" 
                                step="0.1"
                                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
                                value={formData.pointsModifier}
                                onChange={e => setFormData({...formData, pointsModifier: parseFloat(e.target.value) || 1.0})}
                            />
                        </div>
                    </div>
                    <div className="flex gap-3 pt-4 border-t">
                        <Button variant="outline" className="flex-1 font-bold" onClick={() => setIsModalOpen(false)}>Bekor qilish</Button>
                        <Button variant="primary" className="flex-1 font-bold bg-indigo-600" onClick={handleSave}>Saqlash</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ClubManagement;
