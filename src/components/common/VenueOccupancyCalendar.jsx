import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, MapPin } from 'lucide-react';
import { format, addDays, startOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday } from 'date-fns';
import { uz } from 'date-fns/locale';
import StatStrip from './StatStrip';
import VenueMeta from './VenueMeta';
import { getVenueStats } from '../../utils/moduleStats';
import { db } from '../../services/db';

// Room-occupancy calendar: rows are real venues (Sozlamalar → Joylar), columns are days, and each cell
// shows what occupies that room that day. Complements — doesn't replace — EventManagement's month
// calendar, which answers "what's happening" rather than "which room is free".
//
// Bookings come from db.getVenueBookings, which merges events and competitions into one shape and matches
// them to a venue by its label string (what both creation forms store).

const VIEWS = [
    { id: 'day', label: 'Kunlik', days: 1 },
    { id: 'week', label: 'Haftalik', days: 7 },
    { id: 'month', label: 'Oylik', days: null }
];

// Mirrors the moderation states an activity can be in — the same vocabulary ApprovalsTab uses.
const STATUS_STYLES = {
    approved: { chip: 'bg-emerald-50 border-emerald-200 text-emerald-800', dot: 'bg-emerald-500', label: 'Tasdiqlangan' },
    pending: { chip: 'bg-amber-50 border-amber-200 text-amber-800', dot: 'bg-amber-500', label: 'Kutilmoqda' },
    rejected: { chip: 'bg-rose-50 border-rose-200 text-rose-700', dot: 'bg-rose-500', label: 'Rad etilgan' }
};

// Pill-shaped on/off switch: keeps the status's own colour and wording, and adds an unmistakable
// switch track so "yoqilgan/o'chirilgan" reads at a glance rather than from a subtle opacity change.
// `activeClass` is the pill's own palette when on; off is always the same neutral grey.
const FilterSwitch = ({ on, onToggle, label, activeClass, dotClass }) => (
    <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        title={on ? "Yoqilgan — bosib o'chiring" : 'O\'chirilgan — bosib yoqing'}
        className={`flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-full border text-[11px] font-bold transition-colors ${
            on ? activeClass : 'bg-gray-50 border-gray-200 text-gray-400'
        }`}
    >
        {dotClass && <span className={`w-1.5 h-1.5 rounded-full ${on ? dotClass : 'bg-gray-300'}`} />}
        {label}
        {/* Track uses a neutral translucent black rather than `bg-current` — it has to read correctly on
            all four pill palettes (emerald/amber/rose/indigo) without a per-status override. */}
        <span className={`relative w-7 h-4 rounded-full transition-colors shrink-0 ${on ? 'bg-black/20' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
        </span>
    </button>
);

// `initialDate` opens the calendar on a specific week/day (used when it's shown while picking a venue for
// a Tur, so the admin lands on the date they're actually scheduling). `highlightVenue` dims every other
// room so the one being chosen stands out, without hiding the rest — the whole point of showing this
// during selection is to answer "if not here/now, then when?".
const VenueOccupancyCalendar = ({
    onCreateBooking, onOpenBooking, currentUsername,
    initialDate = null, highlightVenue = null, onPickSlot = null,
    // Kutilayotgan ishtirokchilar soni - sig'imi yetmaydigan xona
    // belgilanadi. Berilmasa hech narsa o'zgarmaydi.
    expectedCount = null,
}) => {
    const [view, setView] = useState('week');
    const [anchor, setAnchor] = useState(initialDate ? new Date(initialDate) : new Date());
    const [buildingFilter, setBuildingFilter] = useState('');
    // Which statuses are switched ON. All three start on — the calendar's default is "show everything".
    const [activeStatuses, setActiveStatuses] = useState(['approved', 'pending', 'rejected']);
    // Deliberately OFF by default: the room calendar is a shared, whole-university view first — narrowing
    // it to one person is an opt-in the admin turns on when they want it.
    const [onlyMine, setOnlyMine] = useState(false);

    const venues = useMemo(() => db.getVenues(), []);
    const buildings = useMemo(() => [...new Set(venues.map(v => v.building))].sort(), [venues]);
    const visibleVenues = useMemo(
        () => (buildingFilter ? venues.filter(v => v.building === buildingFilter) : venues),
        [venues, buildingFilter]
    );

    // The visible day columns for the current view.
    const days = useMemo(() => {
        if (view === 'day') return [anchor];
        if (view === 'week') {
            const start = startOfWeek(anchor, { weekStartsOn: 1 }); // Dushanba
            return Array.from({ length: 7 }, (_, i) => addDays(start, i));
        }
        return eachDayOfInterval({ start: startOfMonth(anchor), end: endOfMonth(anchor) });
    }, [view, anchor]);

    const bookings = useMemo(
        () => db.getVenueBookings(days[0], addDays(days[days.length - 1], 1)),
        [days]
    );

    const clubById = useMemo(() => new Map(db.getClubs().map(c => [c.id, c])), []);
    // Kalendar ko'rinayotgan davrga bog'liq, xulosa esa har doim oxirgi
    // 30 kun - "oy ko'rinishida oy, hafta ko'rinishida hafta" qilinsa,
    // raqamlar tugma bosilgan sari sakrab, taqqoslab bo'lmas edi.
    const venueStats = useMemo(() => getVenueStats(db, 30), []);

    const step = (dir) => {
        if (view === 'day') setAnchor(a => addDays(a, dir));
        else if (view === 'week') setAnchor(a => addDays(a, dir * 7));
        else setAnchor(a => new Date(a.getFullYear(), a.getMonth() + dir, 1));
    };

    const toggleStatus = (key) =>
        setActiveStatuses(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]);

    const cellBookings = (venueLabel, day) => bookings.filter(b =>
        b.venueLabel === venueLabel
        && isSameDay(b.start, day)
        && activeStatuses.includes(b.moderationStatus)
        && (!onlyMine || (currentUsername && b.createdBy === currentUsername))
    );

    const rangeLabel = view === 'month'
        ? format(anchor, 'LLLL yyyy', { locale: uz })
        : view === 'day'
            ? format(anchor, 'd MMMM yyyy', { locale: uz })
            : `${format(days[0], 'd MMM', { locale: uz })} — ${format(days[6], 'd MMM yyyy', { locale: uz })}`;

    if (venues.length === 0) {
        return (
            <div className="p-10 text-center border border-dashed border-gray-200 rounded-2xl">
                <MapPin size={22} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm font-semibold text-gray-500">Hali birorta joy qo'shilmagan</p>
                <p className="text-xs text-gray-400 mt-1">
                    Xonalar bandligini ko'rish uchun avval <span className="font-semibold">Sozlamalar → Joylar</span>
                    {' '}bo'limidan bino va xonalarni qo'shing.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* OXIRGI 30 KUNNING XULOSASI.
                Kalendar "qachon band" ni ko'rsatadi, lekin "umuman qanchalik
                ishlatilyapti" degan savolga javob bermasdi.
                BANDLIK FOIZI ATAYLAB YO'Q: "ish kuni necha soat" degan qoida
                platformada belgilanmagan, uni bu yerda o'ylab topish esa
                foizni ma'nosiz qilardi. O'lchanadigan narsa - band SOATLAR. */}
            <StatStrip
                items={[
                    { label: 'Band qilingan soat', value: venueStats.hours, tone: 'indigo', hint: 'oxirgi 30 kun' },
                    { label: 'Voqealar', value: venueStats.bookings, tone: 'gray' },
                    { label: 'Ishlatilgan xona', value: venueStats.usedVenues, tone: 'emerald', hint: `${venueStats.venues} tadan` },
                    { label: 'Bo\'sh turgan xona', value: venueStats.idleVenues, tone: venueStats.idleVenues > 0 ? 'amber' : 'gray' },
                ]}
            />

            {venueStats.rows.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {venueStats.rows.map(r => (
                        <span key={r.label} className="px-2.5 py-1 rounded-lg bg-gray-50 text-gray-700 text-xs font-semibold">
                            {r.label}
                            <span className="opacity-60 ml-1.5 tabular-nums">{r.hours} soat · {r.bookings} voqea</span>
                        </span>
                    ))}
                </div>
            )}

            {/* Boshqaruv paneli */}
            <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-bold text-gray-900 capitalize mr-1">{rangeLabel}</h3>
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => step(-1)} className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                        <ChevronLeft size={15} />
                    </button>
                    <button type="button" onClick={() => step(1)} className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                        <ChevronRight size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setAnchor(new Date())}
                        className="ml-1 px-2.5 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                        Bugun
                    </button>
                </div>

                <div className="flex bg-gray-100 rounded-xl p-0.5">
                    {VIEWS.map(v => (
                        <button
                            key={v.id}
                            type="button"
                            onClick={() => setView(v.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                view === v.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {v.label}
                        </button>
                    ))}
                </div>

                {buildings.length > 1 && (
                    <select
                        value={buildingFilter}
                        onChange={e => setBuildingFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white"
                    >
                        <option value="">Barcha binolar</option>
                        {buildings.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                )}

                <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                    {Object.entries(STATUS_STYLES).map(([key, s]) => (
                        <FilterSwitch
                            key={key}
                            on={activeStatuses.includes(key)}
                            onToggle={() => toggleStatus(key)}
                            label={s.label}
                            activeClass={s.chip}
                            dotClass={s.dot}
                        />
                    ))}
                    <FilterSwitch
                        on={onlyMine}
                        onToggle={() => setOnlyMine(v => !v)}
                        label="Mening arizalarim"
                        activeClass="bg-indigo-50 border-indigo-200 text-indigo-700"
                    />
                </div>
            </div>

            {/* Jadval */}
            <div className="border border-gray-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{ minWidth: view === 'month' ? `${180 + days.length * 92}px` : undefined }}>
                        <thead>
                            <tr className="bg-slate-50">
                                <th className="sticky left-0 z-10 bg-slate-50 text-left p-3 border-b border-gray-200 w-44">
                                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Xona</span>
                                </th>
                                {days.map(d => (
                                    <th key={d.toISOString()} className="p-2 border-b border-l border-gray-200 text-center min-w-[92px]">
                                        <div className="text-[10px] font-semibold text-gray-400 uppercase">
                                            {format(d, 'EEEEEE', { locale: uz })}
                                        </div>
                                        <div className={`text-base font-extrabold ${isToday(d) ? 'text-indigo-600' : 'text-gray-800'}`}>
                                            {format(d, 'd')}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {visibleVenues.map(venue => {
                                const isDimmed = highlightVenue && venue.label !== highlightVenue;
                                return (
                                <tr key={venue.id} className={`group/row ${isDimmed ? 'opacity-45' : ''}`}>
                                    <td className="sticky left-0 z-10 bg-white group-hover/row:bg-slate-50/70 p-3 border-b border-gray-100 align-top">
                                        <p className={`text-xs font-bold leading-tight ${venue.label === highlightVenue ? 'text-indigo-700' : 'text-gray-800'}`}>
                                            {venue.room}
                                        </p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">{venue.building}</p>
                                        {/* Sig'im va jihozlar - xonani tanlash aynan shu
                                            ustunda bo'ladi. `compact`: jadval ustuni tor,
                                            shuning uchun jihozlar faqat ikonka bilan. */}
                                        <VenueMeta venue={venue} expectedCount={expectedCount} compact className="mt-1" />
                                    </td>
                                    {days.map(day => {
                                        const items = cellBookings(venue.label, day);
                                        return (
                                            <td
                                                key={day.toISOString()}
                                                className="relative p-1.5 border-b border-l border-gray-100 align-top group/cell hover:bg-indigo-50/30 transition-colors"
                                            >
                                                {items.length === 0 && (
                                                    <p className="text-[11px] text-gray-300 text-center py-3">bo'sh</p>
                                                )}

                                                {/* Always offered, even when the cell already has bookings:
                                                    a room busy 08:00–11:00 is still free for the rest of the
                                                    day, so "this cell has something in it" must not mean
                                                    "this day is taken". */}
                                                {(onPickSlot || onCreateBooking) && (
                                                    <button
                                                        type="button"
                                                        title={onPickSlot
                                                            ? "Shu xona va kunda vaqt tanlash"
                                                            : "Shu xona va sanaga tadbir qo'shish"}
                                                        onClick={() => (onPickSlot || onCreateBooking)(venue.label, day)}
                                                        className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-sm opacity-0 group-hover/cell:opacity-100 focus:opacity-100 transition-opacity"
                                                    >
                                                        <Plus size={12} />
                                                    </button>
                                                )}

                                                {items.length > 0 && (
                                                    <div className="space-y-1 pr-5">
                                                        {items.map(b => {
                                                            const s = STATUS_STYLES[b.moderationStatus] || STATUS_STYLES.approved;
                                                            const club = b.clubId ? clubById.get(b.clubId) : null;
                                                            return (
                                                                <button
                                                                    key={`${b.kind}-${b.id}`}
                                                                    type="button"
                                                                    onClick={() => onOpenBooking?.(b)}
                                                                    title={`${b.title}${club ? ` · ${club.name}` : ''} · ${s.label}`}
                                                                    className={`w-full text-left px-2 py-1.5 rounded-lg border ${s.chip} hover:brightness-95 transition`}
                                                                >
                                                                    <span className="block text-[10px] font-extrabold leading-tight">
                                                                        {format(b.start, 'HH:mm')}{b.end ? `–${format(b.end, 'HH:mm')}` : ''}
                                                                    </span>
                                                                    <span className="block text-[10px] font-semibold truncate leading-tight mt-0.5">
                                                                        {b.title}
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <p className="text-[11px] text-gray-400">
                {onPickSlot
                    ? "Bo'sh katak ustiga borib bosing — o'sha xona va sana darhol tanlanadi."
                    : <>Xonalar <span className="font-semibold">Sozlamalar → Joylar</span> bo'limidan boshqariladi. Bo'sh katak ustiga borib <span className="font-semibold">+</span> tugmasi bilan o'sha xona va sanaga darhol tadbir qo'shasiz.</>}
            </p>
        </div>
    );
};

export default VenueOccupancyCalendar;
