import React, { useMemo, useState } from 'react';
import { Search, X, Plus, MapPin } from 'lucide-react';

// JOY TANLASH - qidiruv bilan.
//
// Katalogda 120 dan ortiq joy bor. Oddiy `select` da ular bitta uzun
// ro'yxat bo'lib qolardi: telefonda o'nlab element orasidan aylantirib
// topish qiyin, kompyuterda esa ro'yxat ekrandan chiqib ketadi.
//
// Ro'yxat chaqiruvchi tomonda ALLAQACHON tur va hudud bo'yicha suzilgan
// keladi - bu yerdagi qidiruv uchinchi suzgich.
//
// RO'YXAT INLINE chiziladi, absolute EMAS: oyna ichida absolute ro'yxat
// qirqilib qolishi yoki modal ustiga chiqib ketishi mumkin. Inline ro'yxat
// kontentni pastga suradi - xunukroq, lekin hamma joyda ishlaydi.

// Qidiruvga tayyorlash: apostrofning uch-to'rt xil shakli bitta qiymatga
// keltiriladi, aks holda "Go'ri Amir" va "Go‘ri Amir" topilmay qoladi.
const norm = (v) => String(v || '')
    .replace(/[‘’ʻʼ`]/g, "'")
    .toLowerCase().trim();

const MAX_SHOWN = 30;

const CulturalPlacePicker = ({ places, placeId, placeName, onChange }) => {
    const [query, setQuery] = useState('');

    const selected = places.find(p => p.id === placeId) || null;

    const matches = useMemo(() => {
        const q = norm(query);
        if (!q) return places;
        return places.filter(p => (
            norm(p.name).includes(q) || norm(p.district).includes(q)
        ));
    }, [places, query]);

    // Tanlangan joy - qidiruv o'rniga ko'rsatiladi.
    if (selected) {
        return (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border border-teal-200 bg-teal-50 rounded-xl">
                <span className="text-sm font-semibold text-teal-900 min-w-0 truncate">
                    {selected.name}
                    {selected.district && (
                        <span className="font-normal text-teal-700"> — {selected.district}</span>
                    )}
                </span>
                <button
                    type="button"
                    onClick={() => { onChange({ placeId: '', placeName: '' }); setQuery(''); }}
                    className="shrink-0 text-teal-700 hover:text-teal-900"
                    aria-label="Boshqa joy tanlash"
                >
                    <X size={16} />
                </button>
            </div>
        );
    }

    // Ro'yxatda yo'q joy - talaba nomini o'zi yozgan.
    if (placeName) {
        return (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border border-amber-200 bg-amber-50 rounded-xl">
                <span className="text-sm font-semibold text-amber-900 min-w-0 truncate">
                    {placeName}
                    <span className="font-normal text-amber-700"> — yangi joy</span>
                </span>
                <button
                    type="button"
                    onClick={() => { onChange({ placeId: '', placeName: '' }); setQuery(''); }}
                    className="shrink-0 text-amber-700 hover:text-amber-900"
                    aria-label="Bekor qilish"
                >
                    <X size={16} />
                </button>
            </div>
        );
    }

    const typed = query.trim();

    return (
        <div className="space-y-2">
            <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    type="text" value={query} onChange={e => setQuery(e.target.value)}
                    placeholder={places.length > 0
                        ? 'Joy nomini yozing yoki ro‘yxatdan tanlang...'
                        : 'Joy nomini yozing...'}
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                />
            </div>

            {matches.length > 0 && (
                <div className="border border-gray-200 rounded-xl divide-y divide-gray-50 max-h-56 overflow-y-auto">
                    {matches.slice(0, MAX_SHOWN).map(p => (
                        <button
                            type="button" key={p.id}
                            onClick={() => { onChange({ placeId: p.id, placeName: '' }); setQuery(''); }}
                            className="w-full flex items-start gap-2 px-3.5 py-2 text-left hover:bg-gray-50"
                        >
                            <MapPin size={13} className="shrink-0 mt-0.5 text-gray-400" />
                            <span className="text-sm text-gray-800 min-w-0">
                                {p.name}
                                {p.district && (
                                    <span className="text-gray-400"> — {p.district}</span>
                                )}
                            </span>
                        </button>
                    ))}
                    {matches.length > MAX_SHOWN && (
                        <p className="px-3.5 py-2 text-[11px] text-gray-400">
                            Yana {matches.length - MAX_SHOWN} ta &mdash; qidiruvni aniqlashtiring.
                        </p>
                    )}
                </div>
            )}

            {/* Ro'yxatda yo'q joyni qo'shish. Tugma FAQAT nom yozilganda
                chiqadi: bo'sh nom bilan joy qo'shib bo'lmaydi. */}
            {typed && (
                <button
                    type="button"
                    onClick={() => onChange({ placeId: '', placeName: typed })}
                    className="w-full flex items-center gap-2 px-3.5 py-2.5 border border-dashed border-gray-300 rounded-xl text-left hover:border-teal-400 hover:bg-teal-50/40"
                >
                    <Plus size={14} className="shrink-0 text-teal-600" />
                    <span className="text-sm text-gray-700 min-w-0 truncate">
                        &laquo;{typed}&raquo; &mdash; yangi joy sifatida qo&rsquo;shish
                    </span>
                </button>
            )}

            {places.length > 0 && matches.length === 0 && !typed && (
                <p className="text-[11px] text-gray-400">Katalogda joy topilmadi.</p>
            )}
        </div>
    );
};

export default CulturalPlacePicker;
