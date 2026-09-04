import React from 'react';
import { Users, AlertTriangle } from 'lucide-react';
import { VENUE_EQUIPMENT, formatCapacity } from '../../config/venueEquipment';

// XONANING SIG'IMI VA JIHOZLARI - qisqa ko'rinish.
//
// Bu ma'lumot Sozlamalar → Joylar da kiritiladi, lekin uning asl foydasi
// TANLASH paytida: tashkilotchi xonani tanlayotganda "sig'adimi va
// proyektor bormi" degan savolga javob shu yerda ko'rinishi kerak, aks
// holda ma'lumot kiritilgan joyida yotib qolardi.
//
// `expectedCount` berilsa va sig'imdan oshsa - OGOHLANTIRISH. Taqiq emas:
// sig'im taxminiy bo'lishi mumkin va ba'zi tadbirlarda odamlar navbat
// bilan kiradi. Qaror tashkilotchida.
const VenueMeta = ({ venue, expectedCount = null, compact = false, className = '' }) => {
    if (!venue) return null;

    const capacity = formatCapacity(venue.capacity);
    const equipment = venue.equipment || [];
    const note = venue.equipmentNote || '';
    const tooSmall = venue.capacity != null && expectedCount != null && expectedCount > venue.capacity;

    // Hech narsa kiritilmagan bo'lsa - hech narsa ko'rsatilmaydi. Bo'sh
    // "sig'imi: —" qatori faqat joy egallardi.
    if (!capacity && equipment.length === 0 && !note) return null;

    return (
        <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
            {capacity && (
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold ${
                    tooSmall ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                }`}>
                    <Users size={11} /> {capacity}
                    {tooSmall && <AlertTriangle size={11} />}
                </span>
            )}

            {equipment.map(key => {
                const item = VENUE_EQUIPMENT[key];
                if (!item) return null;
                return compact ? (
                    <span key={key} title={item.label} className="text-gray-400">
                        <item.icon size={12} />
                    </span>
                ) : (
                    <span key={key} className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600 text-[11px]">
                        <item.icon size={11} /> {item.label}
                    </span>
                );
            })}

            {note && !compact && (
                <span className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 text-[11px] italic">
                    {note}
                </span>
            )}

            {tooSmall && (
                <span className="text-[11px] font-semibold text-amber-700">
                    Kutilayotgan {expectedCount} kishi sig'imdan ko'p
                </span>
            )}
        </div>
    );
};

export default VenueMeta;
