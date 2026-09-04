import React, { useState } from 'react';
import {
    Shirt,
    Trash2,
    Plus,
    RefreshCw,
    CheckCircle,
    Clock,
    Info,
    Tag,
    Briefcase
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';

const WardrobeModule = () => {
    const [items, setItems] = useState([
        { id: 1, name: 'Oq ko\'ylak', type: 'Rasmiy', status: 'Toza', purpose: 'O\'quv mashg\'ulotlari', lastUsed: '2024-05-22' },
        { id: 2, name: 'Qora shim', type: 'Rasmiy', status: 'Yuvilmoqda', purpose: 'O\'quv mashg\'ulotlari', lastUsed: '2024-05-21' },
        { id: 3, name: 'Kostyum (To\'q ko\'k)', type: 'Kostyum-shim', status: 'Toza', purpose: 'Tadbirlar va imtihonlar', lastUsed: '2024-05-15' },
        { id: 4, name: 'Universitet logotipi tushirilgan Hoodie', type: 'Kundalik', status: 'Toza', purpose: 'Sport va to\'garaklar', lastUsed: '2024-05-20' },
    ]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newItem, setNewItem] = useState({ name: '', type: 'Rasmiy', status: 'Toza', purpose: '' });

    const addItem = () => {
        if (newItem.name) {
            setItems([...items, { ...newItem, id: Date.now(), lastUsed: new Date().toISOString().split('T')[0] }]);
            setIsModalOpen(false);
            setNewItem({ name: '', type: 'Rasmiy', status: 'Toza', purpose: '' });
        }
    };

    const deleteItem = (id) => {
        setItems(items.filter(item => item.id !== id));
    };

    const updateStatus = (id, newStatus) => {
        setItems(items.map(item => item.id === id ? { ...item, status: newStatus } : item));
    };

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-slate-600 to-slate-800 rounded-2xl p-8 text-white shadow-xl flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Garderob Boshqaruvi</h1>
                    <p className="text-slate-200 italic">Universitet dress-kodiga amal qilish va kiyimlaringizni tartibga soling</p>
                </div>
                <Button
                    variant="primary"
                    className="bg-white text-slate-900 border-none hover:bg-slate-100"
                    icon={Plus}
                    onClick={() => setIsModalOpen(true)}
                >
                    Kiyim qo'shish
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-blue-50 border-none flex flex-col items-center justify-center py-6">
                    <p className="text-3xl font-bold text-blue-900">{items.length}</p>
                    <p className="text-sm text-blue-700 font-medium">Jami kiyimlar</p>
                </Card>
                <Card className="bg-green-50 border-none flex flex-col items-center justify-center py-6">
                    <p className="text-3xl font-bold text-green-900">{items.filter(i => i.status === 'Toza').length}</p>
                    <p className="text-sm text-green-700 font-medium">Tayyor (Toza)</p>
                </Card>
                <Card className="bg-yellow-50 border-none flex flex-col items-center justify-center py-6">
                    <p className="text-3xl font-bold text-yellow-900">{items.filter(i => i.status === 'Yuvilmoqda').length}</p>
                    <p className="text-sm text-yellow-700 font-medium">Yuvilmoqda</p>
                </Card>
                <Card className="bg-indigo-50 border-none flex flex-col items-center justify-center py-6">
                    <p className="text-sm text-indigo-700 font-medium text-center">Dress-kodga muvofiqlik</p>
                    <p className="text-2xl font-bold text-indigo-900">A'lo</p>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map(item => (
                    <Card key={item.id} className="relative group overflow-hidden">
                        <div className="flex items-start justify-between mb-4">
                            <div className={`p-3 rounded-xl ${item.status === 'Toza' ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
                                <Shirt className="w-6 h-6" />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => deleteItem(item.id)}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <h3 className="text-lg font-bold text-gray-900 mb-1">{item.name}</h3>
                        <div className="flex gap-2 mb-4">
                            <Badge variant="secondary" size="sm">{item.type}</Badge>
                            <Badge variant={item.status === 'Toza' ? 'success' : 'warning'} size="sm">
                                {item.status}
                            </Badge>
                        </div>

                        <div className="space-y-2 text-sm text-gray-600 mb-6">
                            <div className="flex items-center">
                                <Briefcase className="w-4 h-4 mr-2 text-gray-400" />
                                <span className="font-medium">{item.purpose}</span>
                            </div>
                            <div className="flex items-center">
                                <Clock className="w-4 h-4 mr-2 text-gray-400" />
                                So'nggi foydalanish: {item.lastUsed}
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100 flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 text-xs"
                                icon={RefreshCw}
                                onClick={() => updateStatus(item.id, item.status === 'Toza' ? 'Yuvilmoqda' : 'Toza')}
                            >
                                Holatni o'zgartirish
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>

            <Card className="bg-slate-50 border-none">
                <div className="flex items-start gap-4">
                    <div className="p-3 bg-white rounded-2xl shadow-sm">
                        <Info className="w-6 h-6 text-slate-600" />
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-900">Dress-kod eslatmasi</h4>
                        <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                            Universitet hududida akademik dress-kodga amal qilish majburiydir (Oq ko'ylak, qora shim/yubka).
                            Dushanba va Payshanba kunlari rasmiy kiyinish talab etiladi.
                        </p>
                    </div>
                </div>
            </Card>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Yangi kiyim qo'shish"
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Kiyim nomi</label>
                        <input
                            type="text"
                            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-slate-500"
                            placeholder="Masalan: Oq ko'ylak"
                            value={newItem.name}
                            onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Turi</label>
                            <select
                                className="w-full px-4 py-2 border border-gray-200 rounded-xl"
                                value={newItem.type}
                                onChange={e => setNewItem({ ...newItem, type: e.target.value })}
                            >
                                <option>Rasmiy</option>
                                <option>Kostyum-shim</option>
                                <option>Kundalik</option>
                                <option>Sport</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Holati</label>
                            <select
                                className="w-full px-4 py-2 border border-gray-200 rounded-xl"
                                value={newItem.status}
                                onChange={e => setNewItem({ ...newItem, status: e.target.value })}
                            >
                                <option>Toza</option>
                                <option>Yuvilmoqda</option>
                                <option>Dazmollash kerak</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Maqsadi</label>
                        <input
                            type="text"
                            className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-slate-500"
                            placeholder="Masalan: Mashg'ulotlar uchun"
                            value={newItem.purpose}
                            onChange={e => setNewItem({ ...newItem, purpose: e.target.value })}
                        />
                    </div>
                    <div className="flex gap-3 pt-4">
                        <Button variant="secondary" className="flex-1" onClick={() => setIsModalOpen(false)}>Bekor qilish</Button>
                        <Button variant="primary" className="flex-1 bg-slate-800" onClick={addItem}>Saqlash</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default WardrobeModule;
