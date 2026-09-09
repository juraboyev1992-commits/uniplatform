import React, { useState, useEffect } from 'react';
import {
    Plus,
    Pencil,
    Archive,
    ArchiveRestore,
    Power,
    ChevronDown,
    ChevronRight,
    Layers,
    AlertTriangle
} from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import { db } from '../../services/db';
import { SOCIAL_AUTOMATIC_SOURCES, SOCIAL_REVIEWER_ROLES } from '../../constants/index.js';

const emptyCategoryForm = () => ({ name: '', maxPoints: 5, description: '', isActive: true });
const emptySubcategoryForm = (categoryId) => ({
    categoryId,
    name: '',
    calculationMethod: 'manual',
    reviewerRole: SOCIAL_REVIEWER_ROLES[0].key,
    automaticSourceKey: SOCIAL_AUTOMATIC_SOURCES[0].key,
    isActive: true
});

// "Mezonlar va sub-kategoriyalar" — Settings → Ijtimoiy faollik. Dynamic replacement for the
// SOCIAL_ACTIVITY_CRITERIA constant (categories, seeded from it — see buildSocialCriteriaCategoriesSeed
// in db.js) plus the new sub-kategoriya layer (e.g. "5 tashabbus to'garaklari" -> "To'garaklarda
// ishtiroki"), each independently configured: hisoblash usuli (qo'lda + kim tasdiqlaydi, yoki avtomatik +
// qaysi real manbadan). Same CRUD/modal idiom as ScoringSourcesManager.jsx (the sibling "Ball manbalari"
// tab) so the two screens feel consistent. Automatic wiring itself is a later phase — this only captures
// the configuration; SOCIAL_AUTOMATIC_SOURCES entries with isReal:false are disclosed as not-yet-working.
const SocialCriteriaManager = () => {
    const [categories, setCategories] = useState([]);
    const [subcategories, setSubcategories] = useState([]);
    const [expandedCategoryIds, setExpandedCategoryIds] = useState(new Set());

    const [categoryModalMode, setCategoryModalMode] = useState(null); // null | 'create' | 'edit'
    const [editingCategoryId, setEditingCategoryId] = useState(null);
    const [categoryForm, setCategoryForm] = useState(emptyCategoryForm());
    const [categoryFormError, setCategoryFormError] = useState('');

    const [subcategoryModalMode, setSubcategoryModalMode] = useState(null);
    const [editingSubcategoryId, setEditingSubcategoryId] = useState(null);
    const [subcategoryForm, setSubcategoryForm] = useState(emptySubcategoryForm(null));
    const [subcategoryFormError, setSubcategoryFormError] = useState('');

    const refresh = () => {
        setCategories(db.getSocialCriteriaCategories());
        setSubcategories(db.getSocialCriteriaSubcategories());
    };
    useEffect(() => { refresh(); }, []);

    const toggleExpand = (id) => {
        setExpandedCategoryIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // --- Category CRUD ---
    const openCreateCategory = () => {
        setCategoryModalMode('create');
        setEditingCategoryId(null);
        setCategoryForm(emptyCategoryForm());
        setCategoryFormError('');
    };
    const openEditCategory = (cat) => {
        setCategoryModalMode('edit');
        setEditingCategoryId(cat.id);
        setCategoryForm({ name: cat.name, maxPoints: cat.maxPoints, description: cat.description || '', isActive: cat.isActive });
        setCategoryFormError('');
    };
    const closeCategoryModal = () => {
        setCategoryModalMode(null);
        setEditingCategoryId(null);
    };
    const submitCategory = async () => {
        if (!categoryForm.name.trim()) { setCategoryFormError('Nomi kiritilishi shart'); return; }
        if (categoryForm.maxPoints === '' || Number(categoryForm.maxPoints) < 0) { setCategoryFormError("Maksimal ball manfiy bo'lmasligi kerak"); return; }

        const payload = {
            name: categoryForm.name.trim(),
            maxPoints: Number(categoryForm.maxPoints),
            description: categoryForm.description.trim(),
            isActive: categoryForm.isActive
        };
        if (categoryModalMode === 'create') await db.createSocialCriteriaCategory({ ...payload, isArchived: false });
        else if (categoryModalMode === 'edit' && editingCategoryId) await db.updateSocialCriteriaCategory(editingCategoryId, payload);

        refresh();
        closeCategoryModal();
    };
    const toggleCategoryActive = async (cat) => { await db.updateSocialCriteriaCategory(cat.id, { isActive: !cat.isActive }); refresh(); };
    const archiveCategory = (cat) => { db.archiveSocialCriteriaCategory(cat.id); refresh(); };
    const restoreCategory = (cat) => { db.restoreSocialCriteriaCategory(cat.id); refresh(); };

    // --- Subcategory CRUD ---
    const openCreateSubcategory = (categoryId) => {
        setSubcategoryModalMode('create');
        setEditingSubcategoryId(null);
        setSubcategoryForm(emptySubcategoryForm(categoryId));
        setSubcategoryFormError('');
    };
    const openEditSubcategory = (sub) => {
        setSubcategoryModalMode('edit');
        setEditingSubcategoryId(sub.id);
        setSubcategoryForm({
            categoryId: sub.categoryId,
            name: sub.name,
            calculationMethod: sub.calculationMethod,
            reviewerRole: sub.reviewerRole || SOCIAL_REVIEWER_ROLES[0].key,
            automaticSourceKey: sub.automaticSourceKey || SOCIAL_AUTOMATIC_SOURCES[0].key,
            isActive: sub.isActive
        });
        setSubcategoryFormError('');
    };
    const closeSubcategoryModal = () => {
        setSubcategoryModalMode(null);
        setEditingSubcategoryId(null);
    };
    const submitSubcategory = async () => {
        if (!subcategoryForm.name.trim()) { setSubcategoryFormError('Nomi kiritilishi shart'); return; }

        const payload = {
            categoryId: subcategoryForm.categoryId,
            name: subcategoryForm.name.trim(),
            calculationMethod: subcategoryForm.calculationMethod,
            reviewerRole: subcategoryForm.calculationMethod === 'manual' ? subcategoryForm.reviewerRole : null,
            automaticSourceKey: subcategoryForm.calculationMethod === 'automatic' ? subcategoryForm.automaticSourceKey : null,
            isActive: subcategoryForm.isActive
        };
        if (subcategoryModalMode === 'create') await db.createSocialCriteriaSubcategory({ ...payload, isArchived: false });
        else if (subcategoryModalMode === 'edit' && editingSubcategoryId) await db.updateSocialCriteriaSubcategory(editingSubcategoryId, payload);

        refresh();
        closeSubcategoryModal();
    };
    const toggleSubcategoryActive = async (sub) => { await db.updateSocialCriteriaSubcategory(sub.id, { isActive: !sub.isActive }); refresh(); };
    const archiveSubcategory = (sub) => { db.archiveSocialCriteriaSubcategory(sub.id); refresh(); };
    const restoreSubcategory = (sub) => { db.restoreSocialCriteriaSubcategory(sub.id); refresh(); };

    const visibleCategories = categories.filter(c => !c.isArchived);
    const archivedCategories = categories.filter(c => c.isArchived);
    const subcategoriesFor = (categoryId) => subcategories.filter(s => s.categoryId === categoryId && !s.isArchived);

    return (
        <Card className="p-6 border-none bg-white/80">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-50 rounded-2xl">
                        <Layers size={24} className="text-indigo-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Mezonlar va sub-kategoriyalar</h3>
                        <p className="text-sm text-gray-500">Har mezon qanday sub-faoliyatlarga bo'linishini va ball qanday hisoblanishini (qo'lda yoki avtomatik) belgilang</p>
                    </div>
                </div>
                <Button variant="primary" onClick={openCreateCategory}>
                    <Plus size={18} className="mr-2" /> Yangi mezon
                </Button>
            </div>

            <div className="space-y-3">
                {visibleCategories.map(cat => {
                    const subs = subcategoriesFor(cat.id);
                    const isExpanded = expandedCategoryIds.has(cat.id);
                    return (
                        <div key={cat.id} className="border border-gray-100 rounded-2xl overflow-hidden">
                            <div className="flex items-center justify-between p-4 bg-gray-50/60">
                                <button type="button" onClick={() => toggleExpand(cat.id)} className="flex items-center gap-2.5 text-left flex-1 min-w-0">
                                    {isExpanded ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-gray-900 truncate">{cat.name}</p>
                                        <p className="text-xs text-gray-500">Maksimal {cat.maxPoints} ball · {subs.length} sub-kategoriya</p>
                                    </div>
                                </button>
                                <div className="flex items-center gap-1 shrink-0">
                                    {!cat.isActive && <Badge variant="warning">Nofaol</Badge>}
                                    <button onClick={() => openEditCategory(cat)} title="Tahrirlash" className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                        <Pencil size={15} />
                                    </button>
                                    <button
                                        onClick={() => toggleCategoryActive(cat)}
                                        title={cat.isActive ? 'Faolsizlantirish' : 'Faollashtirish'}
                                        className={`p-2 rounded-lg transition-colors ${cat.isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                                    >
                                        <Power size={15} />
                                    </button>
                                    <button onClick={() => archiveCategory(cat)} title="Arxivlash" className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                                        <Archive size={15} />
                                    </button>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="p-4 space-y-2">
                                    {subs.length === 0 && (
                                        <p className="text-xs text-gray-400 px-1 pb-1">Hali sub-kategoriya yo'q.</p>
                                    )}
                                    {subs.map(sub => {
                                        const source = SOCIAL_AUTOMATIC_SOURCES.find(s => s.key === sub.automaticSourceKey);
                                        const reviewer = SOCIAL_REVIEWER_ROLES.find(r => r.key === sub.reviewerRole);
                                        return (
                                            <div key={sub.id} className="flex items-center justify-between gap-3 p-3 bg-white border border-gray-100 rounded-xl">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-gray-800 truncate">{sub.name}</p>
                                                    <p className="text-[11px] text-gray-500">
                                                        {sub.calculationMethod === 'automatic' ? (
                                                            <>
                                                                Avtomatik — {source?.label || sub.automaticSourceKey}
                                                                {source?.isReal === false && <span className="text-amber-600 font-semibold"> (hali ishlamaydi)</span>}
                                                            </>
                                                        ) : (
                                                            <>Qo'lda — {reviewer?.label || sub.reviewerRole} tasdiqlaydi</>
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {!sub.isActive && <Badge variant="warning">Nofaol</Badge>}
                                                    <button onClick={() => openEditSubcategory(sub)} title="Tahrirlash" className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button
                                                        onClick={() => toggleSubcategoryActive(sub)}
                                                        title={sub.isActive ? 'Faolsizlantirish' : 'Faollashtirish'}
                                                        className={`p-1.5 rounded-lg transition-colors ${sub.isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                                                    >
                                                        <Power size={13} />
                                                    </button>
                                                    <button onClick={() => archiveSubcategory(sub)} title="Arxivlash" className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                                                        <Archive size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <button
                                        type="button"
                                        onClick={() => openCreateSubcategory(cat.id)}
                                        className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 pt-1"
                                    >
                                        <Plus size={13} /> Sub-kategoriya qo'shish
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
                {visibleCategories.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-10">Mezonlar topilmadi</p>
                )}

                {archivedCategories.length > 0 && (
                    <div className="pt-3 border-t border-gray-100 space-y-2">
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Arxivlangan mezonlar</p>
                        {archivedCategories.map(cat => (
                            <div key={cat.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl">
                                <p className="text-sm text-gray-500">{cat.name}</p>
                                <button onClick={() => restoreCategory(cat)} title="Tiklash" className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                    <ArchiveRestore size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Category modal */}
            <Modal isOpen={!!categoryModalMode} onClose={closeCategoryModal} title={categoryModalMode === 'create' ? 'Yangi mezon' : 'Mezonni tahrirlash'} size="md">
                <div className="space-y-4">
                    {categoryFormError && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-sm text-rose-700">
                            <AlertTriangle size={16} className="shrink-0" /> {categoryFormError}
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nomi</label>
                        <input
                            type="text"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            value={categoryForm.name}
                            onChange={(e) => setCategoryForm(f => ({ ...f, name: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Maksimal ball</label>
                        <input
                            type="number"
                            min="0"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            value={categoryForm.maxPoints}
                            onChange={(e) => setCategoryForm(f => ({ ...f, maxPoints: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tavsif</label>
                        <textarea
                            rows="2"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            value={categoryForm.description}
                            onChange={(e) => setCategoryForm(f => ({ ...f, description: e.target.value }))}
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setCategoryForm(f => ({ ...f, isActive: !f.isActive }))}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 ${categoryForm.isActive ? 'bg-indigo-600' : 'bg-gray-300'}`}
                        >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${categoryForm.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                        <span className="text-sm font-semibold text-gray-700">{categoryForm.isActive ? 'Faol' : 'Nofaol'}</span>
                    </div>
                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                        <Button variant="secondary" className="flex-1" onClick={closeCategoryModal}>Bekor qilish</Button>
                        <Button variant="primary" className="flex-1" onClick={submitCategory}>
                            {categoryModalMode === 'create' ? 'Yaratish' : 'Saqlash'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Subcategory modal */}
            <Modal isOpen={!!subcategoryModalMode} onClose={closeSubcategoryModal} title={subcategoryModalMode === 'create' ? 'Yangi sub-kategoriya' : 'Sub-kategoriyani tahrirlash'} size="md">
                <div className="space-y-4">
                    {subcategoryFormError && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-sm text-rose-700">
                            <AlertTriangle size={16} className="shrink-0" /> {subcategoryFormError}
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nomi</label>
                        <input
                            type="text"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            value={subcategoryForm.name}
                            onChange={(e) => setSubcategoryForm(f => ({ ...f, name: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Hisoblash usuli</label>
                        <div className="grid grid-cols-2 gap-2">
                            {[{ v: 'manual', l: "Qo'lda (hujjat + tasdiqlash)" }, { v: 'automatic', l: 'Avtomatik' }].map(opt => (
                                <label
                                    key={opt.v}
                                    className={`px-4 py-2.5 rounded-xl border text-xs font-semibold text-center cursor-pointer transition-all ${
                                        subcategoryForm.calculationMethod === opt.v ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        className="hidden"
                                        checked={subcategoryForm.calculationMethod === opt.v}
                                        onChange={() => setSubcategoryForm(f => ({ ...f, calculationMethod: opt.v }))}
                                    />
                                    {opt.l}
                                </label>
                            ))}
                        </div>
                    </div>
                    {subcategoryForm.calculationMethod === 'manual' ? (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Kim tasdiqlaydi</label>
                            <select
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                value={subcategoryForm.reviewerRole}
                                onChange={(e) => setSubcategoryForm(f => ({ ...f, reviewerRole: e.target.value }))}
                            >
                                {SOCIAL_REVIEWER_ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                            </select>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Manba</label>
                            <select
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                value={subcategoryForm.automaticSourceKey}
                                onChange={(e) => setSubcategoryForm(f => ({ ...f, automaticSourceKey: e.target.value }))}
                            >
                                {SOCIAL_AUTOMATIC_SOURCES.map(s => (
                                    <option key={s.key} value={s.key}>{s.label}{s.isReal ? '' : ' (hali ishlamaydi)'}</option>
                                ))}
                            </select>
                            <p className="text-[11px] text-gray-400 mt-1.5">
                                {SOCIAL_AUTOMATIC_SOURCES.find(s => s.key === subcategoryForm.automaticSourceKey)?.description}
                            </p>
                        </div>
                    )}
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setSubcategoryForm(f => ({ ...f, isActive: !f.isActive }))}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 ${subcategoryForm.isActive ? 'bg-indigo-600' : 'bg-gray-300'}`}
                        >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${subcategoryForm.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                        <span className="text-sm font-semibold text-gray-700">{subcategoryForm.isActive ? 'Faol' : 'Nofaol'}</span>
                    </div>
                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                        <Button variant="secondary" className="flex-1" onClick={closeSubcategoryModal}>Bekor qilish</Button>
                        <Button variant="primary" className="flex-1" onClick={submitSubcategory}>
                            {subcategoryModalMode === 'create' ? 'Yaratish' : 'Saqlash'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </Card>
    );
};

export default SocialCriteriaManager;
