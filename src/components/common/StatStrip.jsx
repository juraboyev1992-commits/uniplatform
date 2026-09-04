import React from 'react';
import { AlertTriangle } from 'lucide-react';

// PANEL BOSHIDAGI KO'RSATKICH QATORI.
//
// Beshta modul (madaniy tashriflar, sport, yotoqxona, intizom, xonalar) bir
// xil ehtiyojga ega: ro'yxatdan oldin bir necha umumiy raqam. Har birida
// alohida joylashuv yozilsa, ular asta-sekin bir-biridan farq qila boshlardi.
//
// `null` NOL EMAS: qiymati aniqlanmagan ko'rsatkich `—` bo'lib chiqadi.
// Maxraji yo'q foiz (masalan hech kim topshirmagan test yoki sig'imi
// belgilanmagan jamoa) nol foiz emas - u shunchaki o'lchanmagan.
const TONES = {
    gray: 'bg-gray-50 text-gray-900',
    indigo: 'bg-indigo-50 text-indigo-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    teal: 'bg-teal-50 text-teal-700',
    cyan: 'bg-cyan-50 text-cyan-700',
};

const show = (value) => (value === null || value === undefined ? '—' : value);

const StatStrip = ({ items = [], warnings = [], className = '' }) => {
    const visible = items.filter(Boolean);
    if (visible.length === 0) return null;

    return (
        <div className={className}>
            <div className={`grid grid-cols-2 ${visible.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-2.5`}>
                {visible.map(item => (
                    <div key={item.label} className={`rounded-xl px-3 py-2.5 ${TONES[item.tone] || TONES.gray}`}>
                        <p className="text-[11px] opacity-70">{item.label}</p>
                        <p className="text-xl font-black tabular-nums">
                            {show(item.value)}
                            {item.suffix && item.value !== null && item.value !== undefined && (
                                <span className="text-sm font-bold ml-0.5">{item.suffix}</span>
                            )}
                        </p>
                        {item.hint && <p className="text-[11px] opacity-60 mt-0.5">{item.hint}</p>}
                    </div>
                ))}
            </div>

            {/* Ogohlantirishlar - bu diqqat talab qiladigan HOLAT, ya'ni
                raqamning o'zi emas, undan kelib chiqadigan ish. */}
            {warnings.filter(Boolean).length > 0 && (
                <p className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2.5 mt-2.5">
                    <AlertTriangle size={14} className="shrink-0 mt-px text-amber-600" />
                    <span>{warnings.filter(Boolean).join(' · ')}</span>
                </p>
            )}
        </div>
    );
};

export default StatStrip;
