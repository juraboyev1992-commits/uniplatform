import React, { useMemo } from 'react';
import { MapPin, CheckCircle2, AlertTriangle } from 'lucide-react';
import { db } from '../../services/db';
import VenueMeta from './VenueMeta';

// Venue select plus a one-line free/busy verdict for the chosen moment. Availability comes from
// db.checkVenueAvailability — the SAME guard the write path uses — so this can never say "bo'sh" where
// saving would refuse.
//
// Deliberately never required: a Tur or competition may legitimately have no room assigned yet.
// `fallbackLabel` (optional) is the competition's own creation-time location, offered as the default for
// a Tur that hasn't picked its own.
//
// Browsing "when else is it free" lives in VenueCalendarPicker, next to the date field — one calendar for
// the whole app rather than a second one buried in here.
const VenuePicker = ({
    value, onChange, date, startTime, endTime, excludeId = null,
    fallbackLabel = '', label = "O'tkazilish joyi", compact = true,
    expectedCount = null,
}) => {
    const venues = useMemo(() => db.getVenues(), []);

    const startAt = date ? `${date}T${startTime || '00:00'}:00` : null;
    const endAt = date && endTime ? `${date}T${endTime}:00` : null;

    // Only meaningful once BOTH a room and a date exist — otherwise there's nothing to check against.
    const availability = useMemo(() => {
        if (!value || !startAt) return null;
        return db.checkVenueAvailability(value, startAt, endAt, excludeId);
    }, [value, startAt, endAt, excludeId]);

    const isLegacy = value && !venues.some(v => v.label === value);
    const inputCls = compact
        ? 'w-full px-2.5 py-1.5 border rounded-lg text-xs'
        : 'w-full px-4 py-3 border border-gray-200 rounded-2xl text-sm';

    return (
        <div>
            {!compact && <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">{label}</label>}
            <select
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                className={`${inputCls} ${availability && !availability.free ? 'border-red-400' : ''}`}
            >
                <option value="">
                    {fallbackLabel ? `Umumiy joy: ${fallbackLabel}` : 'Joy tanlanmagan'}
                </option>
                {venues.map(v => <option key={v.id} value={v.label}>{v.label}</option>)}
                {isLegacy && <option value={value}>{value} (ro'yxatda yo'q)</option>}
            </select>

            {venues.length === 0 && (
                <p className="text-[10px] text-gray-400 mt-1">
                    Joylar ro'yxati bo'sh — Sozlamalar → Joylar bo'limidan qo'shing.
                </p>
            )}

            {/* Tanlangan xonaning sig'imi va jihozlari. Ro'yxatda faqat nom
                ko'rinadi, ya'ni tanlagandan keyin "bu xona sig'adimi" degan
                savol javobsiz qolardi. */}
            <VenueMeta
                venue={venues.find(v => v.label === value)}
                expectedCount={expectedCount}
                compact={compact}
                className="mt-1"
            />

            {availability && (
                availability.free ? (
                    <p className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 mt-1">
                        <CheckCircle2 size={11} /> Bu vaqtda bo'sh
                    </p>
                ) : (
                    <p className="flex items-start gap-1 text-[10px] font-semibold text-red-600 mt-1">
                        <AlertTriangle size={11} className="shrink-0 mt-px" />
                        <span>Band: "{availability.conflict.title}"</span>
                    </p>
                )
            )}

            {value && !date && (
                <p className="flex items-center gap-1 text-[10px] text-gray-400 mt-1">
                    <MapPin size={11} /> Bandligini ko'rish uchun sanani belgilang
                </p>
            )}
        </div>
    );
};

export default VenuePicker;
