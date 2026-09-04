import React, { useState, useEffect, useMemo } from 'react';
import {
    Plus,
    Search,
    Copy,
    Archive,
    ArchiveRestore,
    Pencil,
    Power,
    Award,
    AlertTriangle
} from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import { db, getCurrentAcademicYear } from '../../services/db';

const APPLIES_TO_OPTIONS = [
    { value: 'student', label: 'Talaba' },
    { value: 'club', label: 'Klub' },
    { value: 'team', label: 'Jamoa' }
];

const emptyForm = () => ({
    name: '',
    code: '',
    category: '',
    description: '',
    points: 5,
    appliesTo: 'student',
    isActive: true,
    academicYear: getCurrentAcademicYear(),
    effectiveDate: new Date().toISOString().slice(0, 10)
});

const ScoringSourcesManager = () => {
    const [sources, setSources] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [appliesToFilter, setAppliesToFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | ACTIVE | INACTIVE | ARCHIVED

    const [modalMode, setModalMode] = useState(null); // null | 'create' | 'edit'
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm());
    const [formError, setFormError] = useState('');

    const refresh = () => setSources(db.getScoringSources());
    useEffect(() => { refresh(); }, []);

    const socialCategories = useMemo(() => db.getSocialCriteriaCategories().filter(c => c.isActive && !c.isArchived), []);
    const socialCategoryByKey = useMemo(() => new Map(socialCategories.map(c => [c.key, c])), [socialCategories]);

    const filtered = useMemo(() => {
        let rows = sources;
        if (statusFilter === 'ACTIVE') rows = rows.filter(s => s.isActive && !s.isArchived);
        else if (statusFilter === 'INACTIVE') rows = rows.filter(s => !s.isActive && !s.isArchived);
        else if (statusFilter === 'ARCHIVED') rows = rows.filter(s => s.isArchived);
        else rows = rows.filter(s => !s.isArchived); // ALL (default) hides archived unless explicitly selected

        if (categoryFilter) rows = rows.filter(s => s.category === categoryFilter);
        if (appliesToFilter) rows = rows.filter(s => s.appliesTo === appliesToFilter);
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            rows = rows.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
        }
        return rows.slice().sort((a, b) => a.name.localeCompare(b.name));
    }, [sources, statusFilter, categoryFilter, appliesToFilter, searchQuery]);

    const openCreate = () => {
        setModalMode('create');
        setEditingId(null);
        setForm(emptyForm());
        setFormError('');
    };

    const openEdit = (source) => {
        setModalMode('edit');
        setEditingId(source.id);
        setForm({
            name: source.name,
            code: source.code,
            category: source.category,
            description: source.description || '',
            points: source.points,
            appliesTo: source.appliesTo,
            isActive: source.isActive,
            academicYear: source.academicYear,
            effectiveDate: source.effectiveDate
        });
        setFormError('');
    };

    const closeModal = () => {
        setModalMode(null);
        setEditingId(null);
    };

    const handleDuplicate = (source) => {
        const copy = db.duplicateScoringSource(source.id);
        refresh();
        if (copy) openEdit(copy);
    };

    const toggleActive = (source) => {
        db.updateScoringSource(source.id, { isActive: !source.isActive });
        refresh();
    };

    const handleArchive = (source) => {
        db.archiveScoringSource(source.id);
        refresh();
    };

    const handleRestore = (source) => {
        db.restoreScoringSource(source.id);
        refresh();
    };

    const validate = () => {
        if (!form.name.trim()) return 'Nomi kiritilishi shart';
        if (!form.code.trim()) return 'Kod kiritilishi shart';
        if (!form.category) return 'Kategoriya tanlanishi shart';
        if (!form.appliesTo) return 'Qo\'llanilish doirasi tanlanishi shart';
        if (form.points === '' || Number(form.points) < 0) return 'Ball manfiy bo\'lmasligi kerak';
        if (!form.academicYear.trim()) return 'O\'quv yili kiritilishi shart';
        if (!form.effectiveDate) return 'Amal qilish sanasi tanlanishi shart';

        const codeLower = form.code.trim().toLowerCase();
        const collision = sources.some(s => s.id !== editingId && s.code.toLowerCase() === codeLower);
        if (collision) return `"${form.code}" kodi allaqachon band. Boshqa kod tanlang.`;

        return '';
    };

    const handleSubmit = () => {
        const error = validate();
        if (error) {
            setFormError(error);
            return;
        }

        const payload = {
            name: form.name.trim(),
            code: form.code.trim(),
            category: form.category,
            description: form.description.trim(),
            points: Number(form.points),
            appliesTo: form.appliesTo,
            isActive: form.isActive,
            academicYear: form.academicYear.trim(),
            effectiveDate: form.effectiveDate
        };

        if (modalMode === 'create') {
            db.createScoringSource({ ...payload, isArchived: false });
        } else if (modalMode === 'edit' && editingId) {
            db.updateScoringSource(editingId, payload);
        }

        refresh();
        closeModal();
    };

    return (
        <Card className="p-6 border-none bg-white/80">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-50 rounded-2xl">
                        <Award size={24} className="text-indigo-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Ball manbalari</h3>
                        <p className="text-sm text-gray-500">Ijtimoiy faollik arizalarini tasdiqlashda ishlatiladigan ball manbalarini boshqarish</p>
                    </div>
                </div>
                <Button variant="primary" onClick={openCreate}>
                    <Plus size={18} className="mr-2" /> Yangi manba
                </Button>
            </div>

            <div className="flex flex-col md:flex-row flex-wrap gap-3 mb-5">
                <div className="flex-1 min-w-[220px] relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Nomi yoki kodi bo'yicha qidirish..."
                        className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <select
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                >
                    <option value="">Barcha kategoriyalar</option>
                    {socialCategories.map((c) => (
                        <option key={c.key} value={c.key}>{c.name}</option>
                    ))}
                </select>
                <select
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                    value={appliesToFilter}
                    onChange={(e) => setAppliesToFilter(e.target.value)}
                >
                    <option value="">Barcha doiralar</option>
                    {APPLIES_TO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    <option value="ALL">Faol + Nofaol</option>
                    <option value="ACTIVE">Faol</option>
                    <option value="INACTIVE">Nofaol</option>
                    <option value="ARCHIVED">Arxivlangan</option>
                </select>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-gray-100">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nomi / Kodi</th>
                            <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kategoriya</th>
                            <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Doira</th>
                            <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ball</th>
                            <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">O'quv yili</th>
                            <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Amal qiladi</th>
                            <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Holat</th>
                            <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                        {filtered.map(source => (
                            <tr key={source.id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-5 py-4">
                                    <p className="text-sm font-semibold text-gray-900">{source.name}</p>
                                    <p className="text-xs text-gray-500 font-mono">{source.code}</p>
                                </td>
                                <td className="px-5 py-4 text-sm text-gray-600">{socialCategoryByKey.get(source.category)?.name || source.category}</td>
                                <td className="px-5 py-4 text-sm text-gray-600">
                                    {APPLIES_TO_OPTIONS.find(o => o.value === source.appliesTo)?.label || source.appliesTo}
                                </td>
                                <td className="px-5 py-4 text-sm font-bold text-gray-900">{source.points}</td>
                                <td className="px-5 py-4 text-sm text-gray-500">{source.academicYear}</td>
                                <td className="px-5 py-4 text-sm text-gray-500">{source.effectiveDate}</td>
                                <td className="px-5 py-4">
                                    {source.isArchived ? (
                                        <Badge variant="default">Arxivlangan</Badge>
                                    ) : source.isActive ? (
                                        <Badge variant="success">Faol</Badge>
                                    ) : (
                                        <Badge variant="warning">Nofaol</Badge>
                                    )}
                                </td>
                                <td className="px-5 py-4">
                                    <div className="flex items-center justify-end gap-1">
                                        {!source.isArchived && (
                                            <>
                                                <button
                                                    onClick={() => openEdit(source)}
                                                    title="Tahrirlash"
                                                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDuplicate(source)}
                                                    title="Nusxalash"
                                                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                                                >
                                                    <Copy size={16} />
                                                </button>
                                                <button
                                                    onClick={() => toggleActive(source)}
                                                    title={source.isActive ? 'Faolsizlantirish' : 'Faollashtirish'}
                                                    className={`p-2 rounded-lg transition-colors ${source.isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                                                >
                                                    <Power size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleArchive(source)}
                                                    title="Arxivlash"
                                                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                                >
                                                    <Archive size={16} />
                                                </button>
                                            </>
                                        )}
                                        {source.isArchived && (
                                            <button
                                                onClick={() => handleRestore(source)}
                                                title="Tiklash"
                                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                            >
                                                <ArchiveRestore size={16} />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">Ball manbalari topilmadi</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Create / Edit modal */}
            <Modal
                isOpen={!!modalMode}
                onClose={closeModal}
                title={modalMode === 'create' ? 'Yangi ball manbai' : 'Ball manbasini tahrirlash'}
                size="lg"
            >
                <div className="space-y-4">
                    {formError && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-sm text-rose-700">
                            <AlertTriangle size={16} className="shrink-0" /> {formError}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nomi</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                value={form.name}
                                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Kod</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                value={form.code}
                                onChange={(e) => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Kategoriya</label>
                            <select
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                value={form.category}
                                onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                            >
                                <option value="">Tanlang...</option>
                                {socialCategories.map((c) => (
                                    <option key={c.key} value={c.key}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Qo'llanilish doirasi</label>
                            <select
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                value={form.appliesTo}
                                onChange={(e) => setForm(f => ({ ...f, appliesTo: e.target.value }))}
                            >
                                {APPLIES_TO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Ball</label>
                            <input
                                type="number"
                                min="0"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                value={form.points}
                                onChange={(e) => setForm(f => ({ ...f, points: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">O'quv yili</label>
                            <input
                                type="text"
                                placeholder="2025-2026"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                value={form.academicYear}
                                onChange={(e) => setForm(f => ({ ...f, academicYear: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Amal qilish sanasi</label>
                            <input
                                type="date"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                value={form.effectiveDate}
                                onChange={(e) => setForm(f => ({ ...f, effectiveDate: e.target.value }))}
                            />
                        </div>
                        <div className="flex items-center gap-3 pt-7">
                            <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 ${form.isActive ? 'bg-indigo-600' : 'bg-gray-300'}`}
                            >
                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${form.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                            <span className="text-sm font-semibold text-gray-700">{form.isActive ? 'Faol' : 'Nofaol'}</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tavsif</label>
                        <textarea
                            rows="2"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            value={form.description}
                            onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                        />
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                        <Button variant="secondary" className="flex-1" onClick={closeModal}>Bekor qilish</Button>
                        <Button variant="primary" className="flex-1" onClick={handleSubmit}>
                            {modalMode === 'create' ? 'Yaratish' : 'Saqlash'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </Card>
    );
};

export default ScoringSourcesManager;
