import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Plus, Calendar, Users, Trophy, ChevronRight } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { COLLECTION_STATUS_LABELS } from '../../config/eventCollections.js';

const STATUS_VARIANTS = { DRAFT: 'default', ACTIVE: 'success', COMPLETED: 'info', ARCHIVED: 'default' };

// "Tadbirlar to'plami" - mavjud Tadbir/Musobaqa modullarini o'zgartirmasdan, ularni
// ixtiyoriy ravishda bitta ko'p-tadbirli loyihaga (festival, hafталik va h.k.)
// birlashtiradigan universal qatlam. Ro'yxat sahifasi - har qatorda umumiy
// statistika (agregatsiya db.getEventCollectionAnalytics'dan, hech narsa saqlab
// qo'yilmaydi, har safar joriy ma'lumotdan qayta hisoblanadi).
const EventCollectionsPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [version, setVersion] = useState(0);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [form, setForm] = useState({ name: '', description: '', startDate: '', endDate: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const backendReady = db.isEventCollectionsBackendReady();

    const rows = useMemo(() => {
        if (!backendReady) return [];
        return db.getEventCollections().map(c => ({
            collection: c,
            analytics: db.getEventCollectionAnalytics(c.id),
        }));
    }, [version, backendReady]);

    const handleCreate = async () => {
        if (!form.name.trim()) { setError('Nomi kiritilishi shart'); return; }
        setSaving(true);
        setError('');
        try {
            const created = await db.createEventCollection({
                name: form.name.trim(), description: form.description.trim(),
                startDate: form.startDate || null, endDate: form.endDate || null,
                createdBy: user?.username || 'admin',
            });
            setIsCreateOpen(false);
            setForm({ name: '', description: '', startDate: '', endDate: '' });
            navigate(`/admin/event-collections/${created.id}`);
        } catch (e) {
            setError(e.message || 'Xatolik yuz berdi');
        } finally {
            setSaving(false);
        }
    };

    const fmtRange = (c) => {
        const f = (d) => d ? new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long' }) : null;
        const s = f(c.startDate), e = f(c.endDate);
        if (s && e) return `${s} - ${e}`;
        return s || e || "Sana belgilanmagan";
    };

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 rounded-2xl p-8 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold mb-2 flex items-center gap-3"><Layers className="w-8 h-8" /> Tadbirlar to'plami</h1>
                    <p className="text-indigo-100">Mavjud tadbir va musobaqalarni bitta loyihaga birlashtirib, umumiy statistika va reyting yuriting</p>
                </div>
                <Button variant="success" icon={Plus} onClick={() => setIsCreateOpen(true)} className="bg-emerald-500 hover:bg-emerald-600 shrink-0">
                    Yangi to'plam
                </Button>
            </div>

            {!backendReady && (
                <Card className="p-6 text-center text-sm text-amber-700 bg-amber-50 border border-amber-200">
                    Tadbirlar to'plami jadvali topilmadi. Supabase SQL Editor da <code className="font-mono font-bold">supabase/event_collections.sql</code> ni bir marta ishga tushiring.
                </Card>
            )}

            {backendReady && rows.length === 0 && (
                <Card className="p-12 text-center text-gray-400">
                    Hozircha tadbirlar to'plami yaratilmagan. "Yangi to'plam" tugmasi bilan boshlang.
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rows.map(({ collection, analytics }) => (
                    <Card
                        key={collection.id}
                        hover
                        className="cursor-pointer transition-all"
                        onClick={() => navigate(`/admin/event-collections/${collection.id}`)}
                    >
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="font-bold text-lg text-gray-900">{collection.name}</h3>
                            <Badge variant={STATUS_VARIANTS[collection.status] || 'default'} size="sm">
                                {COLLECTION_STATUS_LABELS[collection.status] || collection.status}
                            </Badge>
                        </div>
                        <p className="text-xs text-gray-400 flex items-center gap-1.5 mb-4">
                            <Calendar size={12} /> {fmtRange(collection)}
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                            <div>
                                <p className="text-lg font-black text-indigo-600">{analytics?.overview.activityCount ?? 0}</p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Faoliyat</p>
                            </div>
                            <div>
                                <p className="text-lg font-black text-indigo-600">{analytics?.overview.totalParticipation ?? 0}</p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Ishtirok</p>
                            </div>
                            <div>
                                <p className="text-lg font-black text-indigo-600">{analytics?.overview.uniqueStudents ?? 0}</p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Talaba</p>
                            </div>
                            <div>
                                <p className="text-lg font-black text-indigo-600">
                                    {analytics?.overview.coveragePercent != null ? `${analytics.overview.coveragePercent.toFixed(1)}%` : '—'}
                                </p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase">Qamrov</p>
                            </div>
                        </div>
                        <div className="flex justify-end mt-3">
                            <ChevronRight size={18} className="text-gray-300" />
                        </div>
                    </Card>
                ))}
            </div>

            <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Yangi tadbirlar to'plami" size="sm">
                <div className="space-y-4">
                    {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">{error}</p>}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Nomi</label>
                        <input
                            type="text" value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="Masalan: Talabalar festivali 2026"
                            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Tavsif (ixtiyoriy)</label>
                        <textarea
                            value={form.description} rows={2}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Boshlanish</label>
                            <input
                                type="date" value={form.startDate}
                                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Tugash</label>
                            <input
                                type="date" value={form.endDate}
                                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                    </div>
                    <Button variant="primary" className="w-full" disabled={saving} onClick={handleCreate}>
                        {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                    </Button>
                </div>
            </Modal>
        </div>
    );
};

export default EventCollectionsPage;
