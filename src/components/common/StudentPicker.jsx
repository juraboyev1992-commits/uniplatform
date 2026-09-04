import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { db } from '../../services/db';

// Type-to-search-and-select student combobox — reuses the same name/studentId/group/displayNumber
// match predicate already used by StudentsManagement.jsx's search filter. Shared by the team-invite
// member picker and the admin-override "Qo'lda qo'shish" picker; no such component existed before.
const StudentPicker = ({ value, onSelect, placeholder = "Ism, ID yoki guruh bo'yicha qidiring...", excludeIds = [] }) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);

    // Demo talabalar + Supabase'ga o'tgandan keyin yaratilgan haqiqiy akkauntlar.
    // Ilgari faqat birinchisi bor edi: haqiqiy talaba qidiruvda umuman chiqmasdi.
    const students = useMemo(() => {
        const byId = new Map();
        db.getMockStudents().forEach(s => byId.set(s.id, s));
        (db.getSyncedProfiles() || []).forEach(p => {
            if (!p?.id) return;
            byId.set(p.id, { ...(byId.get(p.id) || {}), ...p });
        });
        return Array.from(byId.values());
    }, []);

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        // Haqiqiy profilda guruh yoki talaba ID bo'sh bo'lishi mumkin - himoyasiz
        // `.toLowerCase()` butun komponentni yiqitardi.
        const has = (v) => String(v ?? '').toLowerCase().includes(q);
        return students
            .filter(s =>
                !excludeIds.includes(s.id) &&
                (has(s.fullName) || has(s.studentId) || has(s.group) || has(s.username) || String(s.displayNumber ?? '') === q)
            )
            .slice(0, 8);
    }, [students, query, excludeIds]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (student) => {
        onSelect(student);
        setQuery('');
        setOpen(false);
    };

    if (value) {
        return (
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border border-indigo-200 bg-indigo-50 rounded-xl">
                <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{value.fullName || value.username || value.id}</p>
                    <p className="text-xs text-gray-500 truncate">
                        {[value.studentId, value.group].filter(Boolean).join(' · ') || value.username || ''}
                    </p>
                </div>
                <button type="button" onClick={() => onSelect(null)} className="p-1 text-gray-400 hover:text-red-500 shrink-0">
                    <X size={16} />
                </button>
            </div>
        );
    }

    return (
        <div className="relative" ref={containerRef}>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder={placeholder}
                    value={query}
                    onChange={e => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                />
            </div>
            {open && results.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                    {results.map(s => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => handleSelect(s)}
                            className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 transition-colors border-b border-gray-50 last:border-0"
                        >
                            <p className="text-sm font-bold text-gray-900">{s.fullName || s.username || s.id}</p>
                            <p className="text-xs text-gray-400 truncate">
                                {[
                                    s.studentId || null,
                                    s.group || null,
                                    s.displayNumber ? `Talaba #${s.displayNumber}` : null,
                                    s.username || null,
                                ].filter(Boolean).join(' · ')}
                            </p>
                        </button>
                    ))}
                </div>
            )}
            {open && query.trim() && results.length === 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400">
                    Talaba topilmadi
                </div>
            )}
        </div>
    );
};

export default StudentPicker;
