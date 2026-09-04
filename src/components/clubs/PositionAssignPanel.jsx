import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, AlertTriangle } from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import CopyableId from '../common/CopyableId';
import { db, OFFICIAL_POSITION_TYPES, INTERNAL_POSITION_TYPES, POSITION_TYPE_LABELS, POSITION_BADGE_STYLES } from '../../services/db';

const ALL_POSITION_TYPES = [...OFFICIAL_POSITION_TYPES, ...INTERNAL_POSITION_TYPES];

// Right-side slide-over (spec section 5, extended per the "Klub tarkibi" management-workspace polish
// pass with multi-select chips + an optional preset student), 420px — the direct "Lavozimga tayinlash"
// flow: pick one or more position types (from the fixed registry, never free-typed), search+select a
// student (or start pre-filled via `presetStudent`, e.g. from a roster row's "+" chip or its "Amallar"
// menu), review their current workload, then assign. Separate from the "Ochiq imkoniyatlar" ariza flow
// (OpenPositionCard/PositionApplicationModal) — this is the immediate admin/coordinator-driven path,
// that one stays the student-initiated application path; neither replaces the other.
const PositionAssignPanel = ({ isOpen, onClose, club, assignedByUserId, onAssigned, presetStudent = null }) => {
    const [selectedPositions, setSelectedPositions] = useState([]);
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(presetStudent);
    const [comment, setComment] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) setSelected(presetStudent);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, presetStudent]);

    // Ikki manba birlashtiriladi:
    //   getMockStudents()   - 550 ta demo talaba + eski real akkauntlar
    //   getSyncedProfiles() - Supabase'ga o'tgandan KEYIN yaratilgan haqiqiy akkauntlar
    //
    // Ilgari bu yerda faqat birinchisi bor edi, shuning uchun platformada
    // ro'yxatdan o'tgan haqiqiy talabani qidirganda "topilmadi" chiqardi -
    // u ro'yxatda umuman yo'q edi. ClubProfilePage allaqachon ikkalasini
    // birlashtirib ishlatardi, bu panel esa ortda qolgan.
    const students = useMemo(() => {
        const byId = new Map();
        db.getMockStudents().forEach(s => byId.set(s.id, s));
        // Haqiqiy profil ustun turadi: bir odam ikkala manbada bo'lsa,
        // bazadagi joriy ma'lumoti to'g'riroq.
        (db.getSyncedProfiles() || []).forEach(p => {
            if (!p?.id) return;
            byId.set(p.id, { ...(byId.get(p.id) || {}), ...p });
        });
        return Array.from(byId.values());
    }, []);

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        // Haqiqiy profilda fakultet yoki kurs to'ldirilmagan bo'lishi mumkin -
        // shuning uchun har bir maydon himoyalangan. Himoyasiz `.toLowerCase()`
        // butun panelni yiqitardi.
        const has = (v) => String(v ?? '').toLowerCase().includes(q);
        return students
            .filter(s =>
                has(s.fullName) ||
                has(s.faculty) ||
                has(s.username) ||
                has(s.studentId) ||
                String(s.displayNumber ?? '') === q
            )
            .slice(0, 8);
    }, [students, query]);

    const selectedPortfolio = useMemo(() => (selected ? db.getStudentPortfolio(selected.id) : null), [selected]);

    // MANFAATLAR TO'QNASHUVI - talaba tanlanishi bilan ko'rinadi.
    //
    // Taqiqning o'zi db qatlamida (`assignPosition` uni baribir to'xtatadi),
    // lekin uni faqat "Tayinlash" bosilgandan keyin ko'rsatish foydalanuvchini
    // ortiqcha yurgizardi: sabab tanlash paytidayoq ma'lum.
    const conflict = useMemo(
        () => (selected ? db.getClubPositionConflict(selected.id, club.id) : null),
        [selected, club.id]
    );

    const reset = () => {
        setSelectedPositions([]);
        setQuery('');
        setSelected(presetStudent);
        setComment('');
        setError('');
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const togglePosition = (t) => {
        setSelectedPositions(prev => (prev.includes(t) ? prev.filter(p => p !== t) : [...prev, t]));
    };

    // Assigns every selected position type in one go — each goes through db.assignPosition
    // independently (its own cardinality checks/audit entry), so a partial failure midway (e.g. the
    // assistant_coordinator cap) still keeps whatever already succeeded rather than rolling back.
    // `assignPosition` endi ASINXRON: a'zolik roli Supabase'ga yoziladi va
    // xato bo'lsa tayinlash to'xtaydi. Ilgari yozuv faqat brauzerda qolardi
    // va koordinator hech qanday huquq olmasdi.
    const handleAssign = async () => {
        if (!selected || selectedPositions.length === 0) return;
        setError('');
        if (selectedPositions.includes('head_coordinator')) {
            const roster = db.getCurrentClubRoster(club.id);
            const currentHead = roster.find(r => r.positionTitle === 'head_coordinator' && r.studentId !== selected.id);
            if (currentHead && !window.confirm(
                `"${club.name}" klubida hozirda "${currentHead.student?.fullName || currentHead.studentId}" bosh koordinator. ` +
                `"${selected.fullName}"ni yangi bosh koordinator qilib tayinlasangiz, hozirgisi tarixiy tarkibga o'tkaziladi. Davom etasizmi?`
            )) return;
        }
        try {
            for (const positionTitle of selectedPositions) {
                await db.assignPosition({ clubId: club.id, positionTitle, studentId: selected.id, assignedByUserId, comment: comment.trim() });
            }
            reset();
            onClose();
            onAssigned();
        } catch (err) {
            setError(err.message);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50">
            <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={handleClose} />
            <div className="fixed inset-y-0 right-0 w-[420px] max-w-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
                <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Lavozimga tayinlash</h2>
                    <button type="button" onClick={handleClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Qo'shiladigan lavozimlar</label>
                        <div className="flex flex-wrap gap-2">
                            {ALL_POSITION_TYPES.map(t => {
                                const active = selectedPositions.includes(t);
                                return (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => togglePosition(t)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                                            active
                                                ? `ring-2 ring-offset-1 ring-indigo-400 dark:ring-offset-gray-900 ${POSITION_BADGE_STYLES[t] || 'bg-gray-100 text-gray-700'}`
                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        {POSITION_TYPE_LABELS[t]}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Talabani qidirish</label>
                        {selected ? (
                            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl">
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                                        {selected.fullName || selected.username || selected.id}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {[selected.faculty || null, selected.course ? `${selected.course}-kurs` : null]
                                            .filter(Boolean).join(' · ') || "Ma'lumot to'ldirilmagan"}
                                    </p>
                                </div>
                                <button type="button" onClick={() => setSelected(null)} className="p-1 text-gray-400 hover:text-red-500 shrink-0">
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="Ism, familiya, login, talaba ID yoki fakultet..."
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                />
                                {results.length > 0 && (
                                    <div className="mt-2 border border-gray-100 dark:border-gray-800 rounded-2xl divide-y divide-gray-50 dark:divide-gray-800 max-h-72 overflow-y-auto">
                                        {results.map(s => (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => { setSelected(s); setQuery(''); }}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-left"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
                                                    {(s.fullName || s.username || '?').charAt(0)}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                                                        {s.fullName || s.username || s.id}
                                                    </p>
                                                    {/* Haqiqiy akkauntda bu maydonlar bo'sh bo'lishi mumkin -
                                                        bo'shini ko'rsatmaymiz, "undefined-kurs" chiqmasin. */}
                                                    <p className="text-[11px] text-gray-400 truncate">
                                                        {[
                                                            s.displayNumber ? `#${s.displayNumber}` : null,
                                                            s.faculty || null,
                                                            s.course ? `${s.course}-kurs` : null,
                                                            s.username || null,
                                                        ].filter(Boolean).join(' · ')}
                                                    </p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {query.trim() && results.length === 0 && (
                                    <p className="mt-2 text-xs text-gray-400">Talaba topilmadi</p>
                                )}
                            </div>
                        )}
                    </div>

                    {selected && selectedPortfolio && (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Mavjud faol lavozimlari</label>
                            {selectedPortfolio.hasHighWorkload && (
                                <div className="mb-2 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs font-semibold">
                                    <AlertTriangle size={13} /> Yuqori yuklama — 3 tadan ortiq faol lavozim
                                </div>
                            )}
                            {selectedPortfolio.activePositions.length === 0 ? (
                                <p className="text-xs text-gray-400">Hozircha faol lavozimi yo'q</p>
                            ) : (
                                <div className="space-y-2">
                                    {selectedPortfolio.activePositions.map(p => (
                                        <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-xl border border-gray-100 dark:border-gray-800">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{p.club?.name}</p>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold mt-0.5 ${POSITION_BADGE_STYLES[p.positionTitle] || 'bg-gray-100 text-gray-700'}`}>
                                                    {POSITION_TYPE_LABELS[p.positionTitle] || p.positionTitle}
                                                </span>
                                            </div>
                                            <Badge variant="success" size="sm">Faol</Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* To'qnashuv - tugmani bosishdan OLDIN. Nima to'sqinlik
                        qilayotgani va uni qanday yechish kerakligi bir joyda. */}
                    {conflict && (
                        <div className="flex gap-2.5 p-3.5 rounded-2xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                            <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
                            <div className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
                                <p className="font-bold mb-1">Bu talabani lavozimga tayinlab bo'lmaydi</p>
                                <p>
                                    U shu klubning quyidagi musobaqalarida ishtirok etmoqda:
                                </p>
                                <ul className="mt-1 space-y-0.5">
                                    {conflict.competitions.map(c => (
                                        <li key={c.id} className="font-semibold">
                                            • {c.name}
                                            {c.as === 'team' && (
                                                <span className="font-normal"> — "{c.teamName}" jamoasi tarkibida</span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                                <p className="mt-1.5">
                                    Tayinlash uchun avval u musobaqa ishtirokchilari ro'yxatidan
                                    (yoki jamoa tarkibidan) chiqarilishi kerak.
                                </p>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Izoh (ixtiyoriy)</label>
                        <textarea
                            rows={2}
                            className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-2xl text-sm"
                            placeholder="Tayinlash sababi yoki qo'shimcha izoh..."
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                        />
                    </div>

                    {error && <p className="text-sm text-red-600">{error}</p>}
                </div>

                <div className="p-5 border-t border-gray-100 dark:border-gray-800 flex gap-3">
                    <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>Bekor qilish</Button>
                    <Button
                        type="button" variant="primary" className="flex-1"
                        disabled={!selected || selectedPositions.length === 0 || !!conflict}
                        onClick={handleAssign}
                    >
                        Tayinlash
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default PositionAssignPanel;
