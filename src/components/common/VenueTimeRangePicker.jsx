import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { db } from '../../services/db';

// Time-RANGE picker written from scratch rather than using <input type="time">, for one reason: the
// browser owns the native popup, so it can never grey out the hours a room is already taken. Here the
// hour and minute columns are ours, so a busy moment is simply not clickable.
//
// An hour greys out only when EVERY minute in it is taken — a room busy 08:00-08:30 still offers 08:35
// onward, which is the whole point of showing availability at this granularity.
const MINUTE_STEP = 5;
// Rooms are only bookable 08:00–24:00; anything earlier stays greyed out permanently, not just when
// something else happens to be booked. Hour 24 exists solely as an END ("runs until midnight") — it has
// no minutes other than :00 and can never be a start.
const WORK_START_MIN = 8 * 60;
const WORK_END_MIN = 24 * 60;
const HOURS = Array.from({ length: 25 }, (_, h) => h); // 0..24
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (h, m) => `${pad(h)}:${pad(m)}`;
const toMin = (t) => {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

const VenueTimeRangePicker = ({
    venueLabel, date, startTime, endTime, onChange, excludeId = null, label = "Soatlar oralig'i"
}) => {
    const wrapRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState('start'); // 'start' | 'end'

    const busy = useMemo(() => {
        if (!venueLabel || !date) return [];
        return db.getVenueBookings(new Date(`${date}T00:00:00`), new Date(`${date}T23:59:59`))
            .filter(b => b.venueLabel === venueLabel
                && b.sourceId !== excludeId
                && b.moderationStatus !== 'rejected')
            .map(b => ({
                from: b.start.getHours() * 60 + b.start.getMinutes(),
                to: b.end.getHours() * 60 + b.end.getMinutes(),
                title: b.title
            }))
            .sort((a, b) => a.from - b.from);
    }, [venueLabel, date, excludeId]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const startMin = toMin(startTime);
    const endMin = toMin(endTime);

    const insideBusy = (m) => busy.find(r => m >= r.from && m < r.to) || null;
    const rangeHitsBusy = (from, to) => busy.find(r => from < r.to && to > r.from) || null;

    // A start must itself be free and inside working hours; an end must be after the start, still within
    // working hours, and with nothing taken in between.
    const isDisabled = (mins) => {
        if (editing === 'start') {
            if (mins < WORK_START_MIN || mins >= WORK_END_MIN) return true;
            return !!insideBusy(mins);
        }
        if (startMin == null) return true;
        if (mins <= WORK_START_MIN || mins > WORK_END_MIN) return true;
        return mins <= startMin || !!rangeHitsBusy(startMin, mins);
    };
    // Grey the hour only when the whole hour is unusable. Hour 24 is a single :00 slot.
    const hourDisabled = (h) => (h === 24
        ? isDisabled(WORK_END_MIN)
        : MINUTES.every(m => isDisabled(h * 60 + m)));
    const minutesForHour = (h) => (h === 24 ? [0] : MINUTES);

    const activeTime = editing === 'start' ? startTime : endTime;
    const activeH = activeTime ? Number(activeTime.split(':')[0]) : null;
    const activeM = activeTime ? Number(activeTime.split(':')[1]) : null;

    const setPart = (h, m) => {
        const val = hhmm(h, m);
        if (editing === 'start') {
            // Changing the start invalidates an end that no longer makes sense.
            const keepEnd = endMin != null && toMin(val) < endMin && !rangeHitsBusy(toMin(val), endMin);
            onChange({ startTime: val, endTime: keepEnd ? endTime : '' });
            setEditing('end');
        } else {
            onChange({ startTime, endTime: val });
        }
    };

    const pickHour = (h) => {
        if (hourDisabled(h)) return;
        // Keep the current minute when it's still valid in the new hour, otherwise take the first free one.
        const options = minutesForHour(h);
        const preferred = activeM != null && options.includes(activeM) && !isDisabled(h * 60 + activeM)
            ? activeM
            : options.find(m => !isDisabled(h * 60 + m));
        if (preferred == null) return;
        setPart(h, preferred);
    };

    const pickMinute = (m) => {
        const h = activeH != null ? activeH : HOURS.find(hh => !hourDisabled(hh));
        if (h == null || !minutesForHour(h).includes(m) || isDisabled(h * 60 + m)) return;
        setPart(h, m);
    };

    const conflict = startMin != null && endMin != null && endMin > startMin
        ? rangeHitsBusy(startMin, endMin)
        : null;
    const orderError = startMin != null && endMin != null && endMin <= startMin;

    const colCls = 'w-16 max-h-52 overflow-y-auto border-r border-gray-100 last:border-r-0';
    const cellCls = (selected, disabled) => `w-full px-2 py-1.5 text-sm text-center transition-colors ${
        disabled
            ? 'text-gray-300 cursor-not-allowed'
            : selected
                ? 'bg-indigo-50 text-indigo-700 font-bold'
                : 'text-gray-700 hover:bg-gray-50'
    }`;

    return (
        <div ref={wrapRef} className="relative">
            <label className="block text-sm text-gray-700 mb-1">
                <span className="text-red-500">*</span> {label}
            </label>

            <div
                className={`flex items-center gap-2 px-3 py-2 border rounded-xl bg-white ${
                    conflict || orderError ? 'border-red-400' : open ? 'border-indigo-500' : 'border-gray-200'
                }`}
            >
                <button
                    type="button"
                    onClick={() => { setEditing('start'); setOpen(true); }}
                    className={`flex-1 text-left text-sm px-1 py-0.5 rounded ${
                        editing === 'start' && open ? 'bg-indigo-50 text-indigo-700 font-semibold' : startTime ? 'text-gray-900' : 'text-gray-400'
                    }`}
                >
                    {startTime || 'Boshlanish'}
                </button>
                <span className="text-gray-400 shrink-0">→</span>
                <button
                    type="button"
                    onClick={() => { setEditing('end'); setOpen(true); }}
                    className={`flex-1 text-left text-sm px-1 py-0.5 rounded ${
                        editing === 'end' && open ? 'bg-indigo-50 text-indigo-700 font-semibold' : endTime ? 'text-gray-900' : 'text-gray-400'
                    }`}
                >
                    {endTime || 'Tugash vaqti'}
                </button>
                <Clock size={15} className="text-gray-400 shrink-0" />
            </div>

            {open && (
                <div className="absolute z-30 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="px-3 py-1.5 border-b border-gray-100 bg-slate-50">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                            {editing === 'start' ? 'Boshlanish vaqti' : 'Tugash vaqti'}
                        </span>
                    </div>
                    <div className="flex">
                        <div className={colCls}>
                            {HOURS.map(h => {
                                const dis = hourDisabled(h);
                                return (
                                    <button
                                        key={h}
                                        type="button"
                                        disabled={dis}
                                        title={dis ? 'Band' : undefined}
                                        onClick={() => pickHour(h)}
                                        className={cellCls(activeH === h, dis)}
                                    >
                                        {pad(h)}
                                    </button>
                                );
                            })}
                        </div>
                        <div className={colCls}>
                            {(activeH != null ? minutesForHour(activeH) : MINUTES).map(m => {
                                const h = activeH != null ? activeH : null;
                                const dis = h == null ? false : isDisabled(h * 60 + m);
                                return (
                                    <button
                                        key={m}
                                        type="button"
                                        disabled={dis}
                                        title={dis ? 'Band' : undefined}
                                        onClick={() => pickMinute(m)}
                                        className={cellCls(activeM === m, dis)}
                                    >
                                        {pad(m)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex justify-end px-2 py-1.5 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}

            {busy.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                    {busy.map((r, i) => (
                        <span key={i} className="px-2 py-1 rounded-lg bg-gray-100 border border-gray-200 text-[10px] font-bold text-gray-500">
                            {hhmm(Math.floor(r.from / 60), r.from % 60)}–{hhmm(Math.floor(r.to / 60), r.to % 60)} · {r.title}
                        </span>
                    ))}
                </div>
            )}

            {orderError && (
                <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600 mt-1.5">
                    <AlertTriangle size={11} /> Tugash vaqti boshlanishdan keyin bo'lishi kerak.
                </p>
            )}
            {conflict && (
                <p className="flex items-start gap-1 text-[11px] font-semibold text-red-600 mt-1.5">
                    <AlertTriangle size={11} className="shrink-0 mt-px" />
                    <span>Bu oraliq band: "{conflict.title}".</span>
                </p>
            )}
            {!conflict && !orderError && startTime && endTime && (
                <p className="text-[11px] font-semibold text-emerald-600 mt-1.5">Bu vaqt bo'sh.</p>
            )}
        </div>
    );
};

export default VenueTimeRangePicker;
