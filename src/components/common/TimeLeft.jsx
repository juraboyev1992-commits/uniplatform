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

// IKKI XIL KUCH, IKKI XIL VAZIFA.
//
// Inline yorliq ro'yxatlar va matn oqimi ichida turadi - u yerda to'q fon
// shovqin bo'lardi, shuning uchun ochiq qoladi.
//
// Blokli ko'rinish esa kartaning butun mazmuni bo'lgan joylarda ishlatiladi
// va u YERDA ko'zga tashlanishi SHART. Ilgari u ham ochiq (`bg-*-50`) edi:
// oq kartada deyarli ko'rinmasdi, admin kartasi esa o'zi `bg-indigo-50`
// bo'lgani uchun bloklar fonga qo'shilib ketardi. Endi to'ldirilgan va to'q.
//
// Shoshilinchlik farqi ikkalasida ham saqlanadi - hammasini bir xil baland
// qilib bo'lmaydi: shunda haqiqatan shoshilinch muddat ajralib turmaydi.
const BADGE_TONES = {
    critical: 'text-rose-800 bg-rose-50 border-rose-200',
    soon: 'text-amber-900 bg-amber-50 border-amber-200',
    normal: 'text-gray-700 bg-gray-50 border-gray-200',
    passed: 'text-gray-400 bg-gray-50 border-gray-200',
};

const BADGE_UNIT = {
    critical: 'text-rose-500',
    soon: 'text-amber-600',
    normal: 'text-gray-400',
    passed: 'text-gray-300',
};

const BLOCK_TONES = {
    critical: 'bg-rose-600 border-rose-700 text-white shadow-sm',
    soon: 'bg-amber-500 border-amber-600 text-white shadow-sm',
    normal: 'bg-slate-800 border-slate-900 text-white shadow-sm',
    passed: 'bg-gray-200 border-gray-300 text-gray-500',
};

const BLOCK_UNIT = {
    critical: 'text-rose-100',
    soon: 'text-amber-50',
    normal: 'text-slate-400',
    passed: 'text-gray-400',
};

// Nuqta bloklardan TASHQARIDA, oq fonda turadi - shuning uchun uning rangi
// ikkala ko'rinishda ham bir xil va to'q.
const DOT_TONES = {
    critical: 'bg-rose-600',
    soon: 'bg-amber-500',
    normal: 'bg-emerald-500',
    passed: 'bg-gray-300',
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
    const title = target ? new Date(target).toLocaleString('uz-UZ') : undefined;
    const ticking = live && state !== 'passed';

    // Muddat o'tib ketgan - sanaladigan narsa yo'q, faqat holat yoziladi.
    if (parts.length === 0) {
        return (
            <span
                title={title}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-bold whitespace-nowrap ${BADGE_TONES.passed} ${className}`}
            >
                <AlertTriangle size={11} className="shrink-0" />
                Muddat tugagan
            </span>
        );
    }

    const Dot = () => (ticking
        ? <span className={`tl-dot shrink-0 h-2 w-2 rounded-full ${DOT_TONES[state] || DOT_TONES.normal}`} aria-hidden="true" />
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
                        className={`inline-flex flex-col items-center justify-center rounded-lg border px-2 py-1.5 min-w-[2.75rem] ${BLOCK_TONES[state] || BLOCK_TONES.normal}`}
                    >
                        <span className="text-base font-black leading-none tabular-nums">
                            {p.key === 'day' || p.key === 'year' ? p.value : String(p.value).padStart(2, '0')}
                        </span>
                        <span className={`mt-1 text-[9px] font-bold uppercase tracking-wide leading-none ${BLOCK_UNIT[state] || BLOCK_UNIT.normal}`}>
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
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-bold whitespace-nowrap ${BADGE_TONES[state] || BADGE_TONES.normal} ${className}`}
        >
            {withIcon && <Dot />}
            <span className="inline-flex items-baseline gap-1">
                {parts.map(p => (
                    <span key={p.key} className="inline-flex items-baseline gap-0.5">
                        <span className="tabular-nums">{p.value}</span>
                        <span className={`font-semibold ${BADGE_UNIT[state] || BADGE_UNIT.normal}`}>{p.label}</span>
                    </span>
                ))}
            </span>
            <span className={`font-semibold ${BADGE_UNIT[state] || BADGE_UNIT.normal}`}>qoldi</span>
        </span>
    );
};

export default TimeLeft;
