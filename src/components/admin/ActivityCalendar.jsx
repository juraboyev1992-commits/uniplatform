import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import {
    format, startOfWeek, addDays, addMonths, startOfMonth, endOfMonth, endOfWeek,
    isSameMonth, isToday,
} from 'date-fns';
import Card from '../common/Card';
import Button from '../common/Button';

// FAOLIYAT KALENDARI — tadbir, musobaqa va Tur bir gridda.
//
// `EventManagement.jsx` ichidan AJRATIB OLINDI. Sabab: aynan shu kalendar
// endi musobaqalar tabida ham kerak bo'ldi, ikkinchi nusxa yozish esa ikki
// gridni bir-biridan chetga chiqib ketishga qo'yib berardi.
//
// Yagona yangilik - QAMROV FILTRI. Ilgari kalendar har doim hammasini
// ko'rsatardi va boshqa yo'l yo'q edi: bitta musobaqada o'nlab Tur bo'lishi
// mumkin, ular esa oy katagini to'ldirib, tadbirlarni ko'rinmas qilib
// qo'yardi. Endi qamrovni tanlash mumkin, sukut qiymati esa chaqiruvchidan
// keladi: tadbirlar tabida "Hammasi", musobaqalar tabida "Musobaqalar".
//
// ARALASH KO'RINISH ATAYLAB SAQLANDI. "Hammasi" - eng muhim holat: tadbir
// va musobaqa bitta xonaga tushib qolgani FAQAT shunda ko'zga tashlanadi.
// Tab bo'yicha qat'iy ajratish sodda bo'lardi, lekin bu tekshiruvni
// yo'qotardi.

const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sha', 'Ya']; // Dushanba..Yakshanba
const MONTH_NAMES = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];
const MONTH_SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

const CALENDAR_VIEWS = [
    { id: 'day', label: 'Kunlik' },
    { id: 'week', label: 'Haftalik' },
    { id: 'month', label: 'Oylik' },
    { id: 'year', label: 'Yillik' },
];

const ENTRY_CHIP = {
    event: 'bg-indigo-600',
    competition: 'bg-amber-500',
    tur: 'bg-violet-500',
};

// Qamrovlar KESISHMAYDI, "Faqat Turlar" dan tashqari - u ataylab ichki
// ko'rinish: "musobaqalar" allaqachon Turni o'z ichiga oladi, chunki Tur
// musobaqaning o'tkazilayotgan kuni. Ba'zan esa faqat bosqichlar jadvali
// kerak bo'ladi - o'shanda bu qamrov ishlatiladi.
const SCOPES = [
    { id: 'all', label: 'Hammasi', match: () => true },
    { id: 'events', label: 'Tadbirlar', match: e => e.kind === 'event' },
    { id: 'competitions', label: 'Musobaqalar', match: e => e.kind === 'competition' || e.kind === 'tur' },
    { id: 'turs', label: 'Faqat Turlar', match: e => e.kind === 'tur' },
];

const ActivityCalendar = ({
    entries = [],
    onOpenEntry,
    // Berilmasa kun katagidagi "+" tugmasi UMUMAN chizilmaydi. Musobaqalar
    // tabida u kerak emas: musobaqa kalendardan yaratilmaydi.
    onCreateAt = null,
    defaultScope = 'all',
    title = null,
}) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [calMode, setCalMode] = useState('month');
    const [scope, setScope] = useState(defaultScope);

    const activeScope = SCOPES.find(s => s.id === scope) || SCOPES[0];
    const visible = useMemo(() => entries.filter(activeScope.match), [entries, activeScope]);

    const entriesOn = (day) => {
        const key = format(day, 'yyyy-MM-dd');
        return visible.filter(e => String(e.date).startsWith(key));
    };

    // Bitta kun katagi - Kunlik/Haftalik/Oylik gridlarning uchalasida ham
    // ayni shu. Yaratish butun katakni bosish bilan emas, burchakdagi "+"
    // bilan: butun katak bosiladigan bo'lsa, band kunga shunchaki qaramoqchi
    // bo'lgan odam ham yaratish oynasini ochib yuborardi.
    const renderDayCell = (day, { inMonth = true, minHeight = 92, maxChips = 2, showTime = false } = {}) => {
        const dayEvents = entriesOn(day);
        const todayCell = isToday(day);
        return (
            <div
                key={day.toISOString()}
                className={`relative p-2 rounded-xl border transition-colors overflow-hidden group/day ${
                    !inMonth ? 'bg-gray-50 border-transparent'
                        : todayCell ? 'bg-indigo-50 border-indigo-200'
                        : 'bg-white border-gray-100 hover:bg-gray-50'
                }`}
                style={{ minHeight }}
            >
                <span className={`text-xs font-bold ${todayCell ? 'text-indigo-600' : inMonth ? 'text-gray-400' : 'text-gray-300'}`}>
                    {format(day, 'd')}
                </span>
                <div className={`mt-1 space-y-1 ${onCreateAt ? 'pr-5' : ''}`}>
                    {dayEvents.slice(0, maxChips).map(e => (
                        <button
                            key={e.key}
                            type="button"
                            title={e.location ? `${e.title} — ${e.location}` : e.title}
                            onClick={() => onOpenEntry?.(e, day)}
                            className={`block w-full text-left px-1.5 py-1 text-[10px] font-semibold text-white rounded-lg truncate ${ENTRY_CHIP[e.kind] || 'bg-indigo-600'}`}
                        >
                            {/* Vaqt faqat keng katakda (Kunlik/Haftalik) - oy
                                katagida u nomni siqib chiqarardi. */}
                            {showTime && e.date?.includes('T') && (
                                <span className="opacity-80 mr-1">
                                    {e.date.slice(11, 16)}{e.endTime ? `-${e.endTime}` : ''}
                                </span>
                            )}
                            {e.title}
                        </button>
                    ))}
                    {dayEvents.length > maxChips && (
                        <div className="text-[10px] text-gray-400 font-semibold px-0.5">+{dayEvents.length - maxChips} yana</div>
                    )}
                </div>
                {onCreateAt && (
                    <button
                        type="button"
                        title="Shu kunga tadbir qo'shish"
                        onClick={() => onCreateAt(day)}
                        className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-sm opacity-0 group-hover/day:opacity-100 focus:opacity-100 transition-opacity"
                    >
                        <Plus size={12} />
                    </button>
                )}
            </div>
        );
    };

    const weekStart = startOfWeek(currentMonth, { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 6);

    // Sarlavha QAYERDALIGINI aytadi, shuning uchun har rejimda boshqacha.
    const rangeLabel = calMode === 'day'
        ? `${format(currentMonth, 'd')} ${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`
        : calMode === 'week'
            ? `${format(weekStart, 'd')} ${MONTH_SHORT[weekStart.getMonth()]} — ${format(weekEnd, 'd')} ${MONTH_SHORT[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`
            : calMode === 'month'
                ? `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`
                : `${currentMonth.getFullYear()}`;

    const step = (dir) => setCurrentMonth(d => {
        if (calMode === 'day') return addDays(d, dir);
        if (calMode === 'week') return addDays(d, dir * 7);
        if (calMode === 'month') return addMonths(d, dir);
        return new Date(d.getFullYear() + dir, d.getMonth(), 1);
    });

    let body = null;
    if (calMode === 'day') {
        const dayEvents = entriesOn(currentMonth);
        body = (
            <>
                <div className="mb-1">
                    <div className="text-center text-[11px] font-bold text-gray-400 py-1.5 uppercase">
                        {WEEKDAYS[(currentMonth.getDay() + 6) % 7]}
                    </div>
                </div>
                {renderDayCell(currentMonth, { minHeight: 200, maxChips: 20, showTime: true })}
                {/* "Yozuv", "tadbir" emas: bu ro'yxatda musobaqa va Tur ham bor. */}
                <p className="text-[11px] text-gray-400 mt-2">
                    {dayEvents.length > 0
                        ? `Shu kuni ${dayEvents.length} ta yozuv bor.`
                        : "Shu kuni hech narsa yo'q."}
                </p>
            </>
        );
    } else if (calMode === 'week') {
        const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
        body = (
            <>
                <div className="grid grid-cols-7 gap-1.5 mb-1">
                    {WEEKDAYS.map(d => <div key={d} className="text-center text-[11px] font-bold text-gray-400 py-1.5 uppercase">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                    {days.map(d => renderDayCell(d, { minHeight: 160, maxChips: 6, showTime: true }))}
                </div>
            </>
        );
    } else if (calMode === 'month') {
        const monthStart = startOfMonth(currentMonth);
        const rows = [];
        let days = [];
        let day = startOfWeek(monthStart, { weekStartsOn: 1 });
        const endDate = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
        while (day <= endDate) {
            for (let i = 0; i < 7; i++) {
                days.push(renderDayCell(day, { inMonth: isSameMonth(day, monthStart) }));
                day = addDays(day, 1);
            }
            rows.push(<div key={day.toISOString()} className="grid grid-cols-7 gap-1.5">{days}</div>);
            days = [];
        }
        body = (
            <>
                <div className="grid grid-cols-7 gap-1.5 mb-1">
                    {WEEKDAYS.map(d => <div key={d} className="text-center text-[11px] font-bold text-gray-400 py-1.5 uppercase">{d}</div>)}
                </div>
                <div className="space-y-1.5">{rows}</div>
            </>
        );
    } else {
        const year = currentMonth.getFullYear();
        body = (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {MONTH_NAMES.map((name, idx) => {
                    // Sanoq TANLANGAN QAMROV bo'yicha: filtr qo'yilgan bo'lsa-yu
                    // raqam hammasini sanasa, oy kartasi yolg'on gapirardi.
                    const count = visible.filter(e => {
                        const d = new Date(e.date);
                        return d.getFullYear() === year && d.getMonth() === idx;
                    }).length;
                    const isCurrent = new Date().getFullYear() === year && new Date().getMonth() === idx;
                    return (
                        <button
                            key={name}
                            type="button"
                            onClick={() => { setCurrentMonth(new Date(year, idx, 1)); setCalMode('month'); }}
                            className={`p-3 rounded-xl border text-left transition-colors ${
                                isCurrent ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-100 hover:bg-gray-50'
                            }`}
                        >
                            <p className={`text-sm font-bold ${isCurrent ? 'text-indigo-700' : 'text-gray-800'}`}>{name}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                                {count > 0 ? `${count} ta yozuv` : "Yozuv yo'q"}
                            </p>
                        </button>
                    );
                })}
            </div>
        );
    }

    return (
        <Card padding={false}>
            <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-gray-900">{title || rangeLabel}</h2>
                <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={() => step(-1)} />
                    <Button variant="secondary" size="sm" onClick={() => setCurrentMonth(new Date())}>Bugun</Button>
                    <Button variant="ghost" size="sm" icon={ChevronRight} onClick={() => step(1)} />
                    <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 ml-1">
                        {CALENDAR_VIEWS.map(v => (
                            <button
                                key={v.id}
                                type="button"
                                onClick={() => setCalMode(v.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                    calMode === v.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                {v.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* QAMROV FILTRI. Har qamrovning yonida SONI turadi - bo'sh qamrovga
                o'tib, "kalendar buzilibdi" deb o'ylamasin. */}
            <div className="px-4 pt-3 flex flex-wrap gap-1.5">
                {SCOPES.map(s => {
                    const count = entries.filter(s.match).length;
                    return (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => setScope(s.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                                scope === s.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {s.label}
                            <span className="ml-1.5 opacity-60">{count}</span>
                        </button>
                    );
                })}
            </div>

            <div className="p-4 bg-gray-50/50">
                {body}
                <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-gray-100">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" /> Klub tadbirlari
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Turnir/Musobaqa
                    </span>
                    {/* Tur - musobaqaning alohida kuni va xonasi bo'lgan bosqichi. */}
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                        <span className="w-2.5 h-2.5 rounded-full bg-violet-500" /> Musobaqa Turi
                    </span>
                    {onCreateAt && (
                        <span className="text-[11px] text-gray-400 ml-auto">
                            Kun katagi ustiga borib <span className="font-semibold">+</span> tugmasi bilan tadbir qo'shasiz.
                        </span>
                    )}
                </div>
            </div>
        </Card>
    );
};

export default ActivityCalendar;
