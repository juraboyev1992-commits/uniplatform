import React, { useMemo, useState } from 'react';
import { CalendarDays, ArrowLeft, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { uz } from 'date-fns/locale';
import Modal from './Modal';
import Button from './Button';
import { db } from '../../services/db';
import VenueOccupancyCalendar from './VenueOccupancyCalendar';
import VenueTimeRangePicker from './VenueTimeRangePicker';
import VenueMeta from './VenueMeta';

// The single place "qaysi xona, qaysi kun, qaysi soat" is answered. Replaces the browser's own date
// picker: the field below opens the real room-occupancy calendar instead of a bare month grid, so a date
// is never chosen without seeing what the room is already holding.
//
// Two steps in one modal:
//   1. calendar - click a cell's "+" to take that room + day (available even on a day that already has
//      bookings, since a room busy 08:00-11:00 is still free afterwards)
//   2. time - start/end selects whose busy half-hours are disabled for exactly that room and day
const VenueCalendarPicker = ({
    date, venueLabel, startTime, endTime, onPick, excludeId = null,
    placeholder = 'Sana tanlanmagan', disabled = false,
    // Kutilayotgan ishtirokchilar soni - sig'imi yetmasa ogohlantiriladi.
    expectedCount = null,
}) => {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(null); // { venueLabel, date, startTime, endTime }

    // Xona NOMI bo'yicha topiladi: bandlik yozuvlari xonaga `venueLabel`
    // matni orqali bog'lanadi, identifikator orqali emas.
    const venueByLabel = useMemo(
        () => new Map(db.getVenues().map(v => [v.label, v])),
        []
    );

    const openPicker = () => {
        setDraft(null);
        setOpen(true);
    };

    // Same guard the write path uses - the modal can't hand back a slot that saving would refuse.
    const draftConflict = draft?.startTime && draft?.endTime && draft.endTime > draft.startTime
        ? db.checkVenueAvailability(
            draft.venueLabel,
            `${draft.date}T${draft.startTime}:00`,
            `${draft.date}T${draft.endTime}:00`,
            excludeId
        ).conflict
        : null;
    const canConfirm = !!draft?.startTime && !!draft?.endTime
        && draft.endTime > draft.startTime && !draftConflict;

    const confirm = () => {
        if (!canConfirm) return;
        onPick(draft);
        setOpen(false);
    };

    return (
        <>
            {/* Looks like the input it replaces, but opens our calendar rather than the native one. */}
            <button
                type="button"
                disabled={disabled}
                onClick={openPicker}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 border border-gray-200 rounded-2xl text-sm bg-white hover:border-indigo-300 disabled:bg-gray-100 disabled:cursor-not-allowed text-left"
            >
                <span className={date ? 'text-gray-900' : 'text-gray-400'}>
                    {date
                        ? <>
                            {format(new Date(`${date}T00:00:00`), 'd MMMM yyyy', { locale: uz })}
                            {/* &ndash; as an entity rather than a literal – : the source stays pure ASCII,
                                so the dash can't be mangled by a tool reading this file in the wrong
                                encoding, while the browser still renders a proper long dash. */}
                            {startTime && endTime && (
                                <span className="text-gray-500">, {startTime}&ndash;{endTime}</span>
                            )}
                        </>
                        : placeholder}
                </span>
                <CalendarDays size={16} className="text-gray-400 shrink-0" />
            </button>
            {date && venueLabel && (
                <div className="mt-1 space-y-1">
                    <p className="flex items-center gap-1 text-[11px] text-gray-400">
                        <MapPin size={11} /> {venueLabel}
                    </p>
                    {/* Tanlangan xona sig'imi yetmasa - forma yopilgandan
                        keyin ham ko'rinib tursin. */}
                    <VenueMeta venue={venueByLabel.get(venueLabel)} expectedCount={expectedCount} />
                </div>
            )}

            <Modal
                isOpen={open}
                onClose={() => setOpen(false)}
                title={draft ? 'Vaqtni tanlang' : 'Xona va kunni tanlang'}
                size="xl"
            >
                {open && !draft && (
                    <VenueOccupancyCalendar
                        initialDate={date || undefined}
                        highlightVenue={venueLabel || null}
                        expectedCount={expectedCount}
                        onPickSlot={(pickedVenue, day) => setDraft({
                            venueLabel: pickedVenue,
                            date: format(day, 'yyyy-MM-dd'),
                            startTime: '',
                            endTime: ''
                        })}
                    />
                )}

                {open && draft && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-2xl">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-indigo-900 truncate">{draft.venueLabel}</p>
                                <p className="text-xs text-indigo-600">
                                    {format(new Date(`${draft.date}T00:00:00`), 'd MMMM yyyy, EEEE', { locale: uz })}
                                </p>
                                {/* Tanlangan xonaning sig'imi va jihozlari - vaqt
                                    tanlanayotganda ham ko'rinib tursin: tashkilotchi
                                    "proyektor bormidi" deb orqaga qaytmasin. */}
                                <VenueMeta
                                    venue={venueByLabel.get(draft.venueLabel)}
                                    expectedCount={expectedCount}
                                    className="mt-1.5"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => setDraft(null)}
                                className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 shrink-0"
                            >
                                <ArrowLeft size={12} /> Boshqa xona/kun
                            </button>
                        </div>

                        <VenueTimeRangePicker
                            venueLabel={draft.venueLabel}
                            date={draft.date}
                            startTime={draft.startTime}
                            endTime={draft.endTime}
                            excludeId={excludeId}
                            onChange={({ startTime: s, endTime: e }) => setDraft(d => ({ ...d, startTime: s, endTime: e }))}
                        />

                        <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Bekor qilish</Button>
                            <Button variant="primary" size="sm" disabled={!canConfirm} onClick={confirm}>
                                Tasdiqlash
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
};

export default VenueCalendarPicker;
