import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { timeLeftParts, urgencyOf, subscribeTick } from '../../utils/timeLeft';

// MUDDATGACHA QOLGAN VAQT - jonli.
//
// Hisob `utils/timeLeft.js` da, bu yerda faqat ko'rsatish.
//
// UCH TA DIZAYN QARORI:
//
// 1. JONLI NUQTA. Soniya raqami har soniyada o'zgaradi, lekin "296 kun
//    4 soat 23 daqiqa 36 soniya" degan uzun satrda ko'z oxirgi raqamni
//    ilg'amaydi va sanoq qotib qolganday tuyuladi. Chapdagi nuqta har
//    soniyada bir marta urib turadi - sanoq tirikligi bir qarashda
//    ko'rinadi. Animatsiya CSS da (`index.css`, `.tl-dot`), React qayta
//    chizishiga bog'liq emas.
//
// 2. TEKIS RAQAMLAR (`tabular-nums`). Raqamlar har xil kenglikda bo'lsa,
//    39 dan 40 ga o'tganda butun satr chapga-o'ngga sakraydi. Bu sanoqda
//    ayniqsa bezovta qiladi - soniya har soniyada o'zgaradi.
//
// 3. RAQAM va BIRLIK har xil bezaladi: raqam yo'g'on va to'q, birlik nomi
//    ochroq. Ilgari hammasi bir xil qalinlikda edi va "296 kun 4 soat 23
//    daqiqa" bir uzun so'zday o'qilardi.
//
// `live=false` - ro'yxatlar uchun: 50 qatorli jadvalda har soniyada qayta
// chizish keraksiz. U holda soniya butunlay ko'rsatilmaydi (pastga qarang).

const TONES = {
    critical: { wrap: 'text-rose-800 bg-rose-50 border-rose-200', unit: 'text-rose-500', dot: 'bg-rose-500' },
    soon: { wrap: 'text-amber-900 bg-amber-50 border-amber-200', unit: 'text-amber-600', dot: 'bg-amber-500' },
    normal: { wrap: 'text-gray-700 bg-gray-50 border-gray-200', unit: 'text-gray-400', dot: 'bg-emerald-500' },
    passed: { wrap: 'text-gray-400 bg-gray-50 border-gray-200', unit: 'text-gray-300', dot: 'bg-gray-300' },
};

const TimeLeft = ({
    target,
    maxUnits = 5,
    live = true,
    variant = 'badge',
    withIcon = true,
    className = '',
}) => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!live) return undefined;
        return subscribeTick(setNow);
    }, [live]);

    // Soniya faqat JONLI sanoqda ko'rsatiladi. `live=false` da u yangilanmaydi,
    // ya'ni "36 soniya qoldi" bir daqiqadan keyin ochiq yolg'on bo'lardi -
    // shuning uchun u yerda eng kichik birlik daqiqada to'xtaydi.
    const units = live ? maxUnits : Math.min(maxUnits, 3);
    const parts = timeLeftParts(target, { now, maxUnits: units });

    // Muddat belgilanmagan bo'lsa HECH NARSA chizilmaydi - "0 kun qoldi"
    // deb yozish muddat bor degan yolg'on taassurot berardi.
    if (parts === null) return null;

    const state = urgencyOf(target, now);
    const tone = TONES[state] || TONES.normal;
    const title = target ? new Date(target).toLocaleString('uz-UZ') : undefined;
    const ticking = live && state !== 'passed';

    // Muddat o'tib ketgan - sanaladigan narsa yo'q, faqat holat yoziladi.
    if (parts.length === 0) {
        return (
            <span
                title={title}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-bold whitespace-nowrap ${TONES.passed.wrap} ${className}`}
            >
                <AlertTriangle size={11} className="shrink-0" />
                Muddat tugagan
            </span>
        );
    }

    const Dot = () => (ticking
        ? <span className={`tl-dot shrink-0 h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
        : <AlertTriangle size={11} className="shrink-0" />);

    // BLOKLI ko'rinish - muddat sahifadagi asosiy ma'lumot bo'lgan joylar
    // uchun (muddatlar kartasi, tadbir boshlanishi). Har birlik alohida
    // katakda, raqam katta: bir qarashda o'qiladi.
    if (variant === 'blocks') {
        return (
            <span className={`inline-flex items-center gap-1 ${className}`} title={title}>
                {withIcon && <Dot />}
                {parts.map(p => (
                    <span
                        key={p.key}
                        className={`inline-flex flex-col items-center justify-center rounded-lg border px-1.5 py-1 min-w-[2.5rem] ${tone.wrap}`}
                    >
                        <span className="text-sm font-black leading-none tabular-nums">
                            {p.key === 'day' || p.key === 'year' ? p.value : String(p.value).padStart(2, '0')}
                        </span>
                        <span className={`mt-0.5 text-[9px] font-bold uppercase tracking-wide leading-none ${tone.unit}`}>
                            {p.label}
                        </span>
                    </span>
                ))}
            </span>
        );
    }

    return (
        <span
            title={title}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-bold whitespace-nowrap ${tone.wrap} ${className}`}
        >
            {withIcon && <Dot />}
            <span className="inline-flex items-baseline gap-1">
                {parts.map(p => (
                    <span key={p.key} className="inline-flex items-baseline gap-0.5">
                        <span className="tabular-nums">{p.value}</span>
                        <span className={`font-semibold ${tone.unit}`}>{p.label}</span>
                    </span>
                ))}
            </span>
            <span className={`font-semibold ${tone.unit}`}>qoldi</span>
        </span>
    );
};

export default TimeLeft;
