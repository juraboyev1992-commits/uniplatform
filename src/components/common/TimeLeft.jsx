import React, { useEffect, useState } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { formatTimeLeft, urgencyOf, subscribeTick } from '../../utils/timeLeft';

// MUDDATGACHA QOLGAN VAQT - jonli.
//
// Hisob `utils/timeLeft.js` da, bu yerda faqat ko'rsatish. Sekundlar
// umumiy tiker orqali yangilanadi: har countdown o'z intervalini ochsa,
// bitta sahifada o'nlab taymer bo'lib, raqamlar bir-biridan yarim soniya
// farq bilan sakrardi.
//
// `live=false` - ro'yxatlar uchun: 50 qatorli jadvalda har soniyada
// qayta chizish keraksiz, u yerda muddat bir marta hisoblansa yetadi.

const TONES = {
    critical: 'text-rose-700 bg-rose-50 border-rose-200',
    soon: 'text-amber-800 bg-amber-50 border-amber-200',
    normal: 'text-gray-600 bg-gray-50 border-gray-200',
    passed: 'text-gray-400 bg-gray-50 border-gray-200',
};

const TimeLeft = ({
    target,
    maxUnits = 3,
    live = true,
    withIcon = true,
    className = '',
}) => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!live) return undefined;
        return subscribeTick(setNow);
    }, [live]);

    const text = formatTimeLeft(target, { now, maxUnits });
    // Muddat belgilanmagan bo'lsa HECH NARSA chizilmaydi - "0 kun qoldi"
    // deb yozish muddat bor degan yolg'on taassurot berardi.
    if (!text) return null;

    const state = urgencyOf(target, now);
    const Icon = state === 'critical' || state === 'passed' ? AlertTriangle : Clock;

    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-bold whitespace-nowrap ${TONES[state] || TONES.normal} ${className}`}
            title={target ? new Date(target).toLocaleString('uz-UZ') : undefined}
        >
            {withIcon && <Icon size={11} className="shrink-0" />}
            {text}
        </span>
    );
};

export default TimeLeft;
