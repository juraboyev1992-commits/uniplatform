import React from 'react';
import Button from '../common/Button';
import RegistrationSettingsFields from '../activities/RegistrationSettingsFields';
import VenueCalendarPicker from '../common/VenueCalendarPicker';
import EventManagementPanel from './EventManagementPanel';
import {
    EVENT_TYPES, EVENT_TYPE_ORDER, ACTIVITY_LEVELS, ACTIVITY_LEVEL_ORDER,
    DEFAULT_ACTIVITY_LEVEL,
} from '../../config/activityLifecycle';

// Tadbirni YARATISH va TAHRIRLASH formasi.
//
// O'tkazish bo'yicha hamma narsa - davomat, ball, vazifalar, hisobot, bayonnoma -
// EventManagementPanel.jsx ga ko'chirildi. Sabab: kalendardagi oyna butun bir ish
// maydoniga aylanib ketgan edi - manzili yo'q (havola yubora olmaysiz), vakolat
// olgan odam kalendardan kun qidirishga majbur, hisobot esa bir o'tirishda
// tugamaydi. Endi u /admin/events/:id sahifasida, musobaqa bilan bir xil shaklda.
//
// `showManagement` esa ClubProfilePage uchun: koordinatorda alohida sahifaga yo'l
// yo'q, shuning uchun u yerda hammasi avvalgidek bitta oynada qoladi (default true).
//
// canEditDetails formani ochadi (koordinator/admin). canManageAttendance kengroq -
// faqat 'attendance' vakolati berilgan odam ham davomat ro'yxatini ko'radi.
const EventEditForm = ({
    event, formData, onChange, clubs, lockClub = false, locationConflict, saveError,
    onSave, onCancel, user, hasClubRole, isAdmin, isManagement,
    canEditDetails, canManageAttendance, actingUsername, onDataChanged,
    showManagement = true, headerExtra = null,
}) => {
    return (
        <div className="space-y-4">
            {/* Chaqiruvchi shu yerga o'zining tugmasini qo'yadi — kalendar oynasi
                "Boshqarish sahifasi"ni shu joyga joylaydi. */}
            {headerExtra}
            {canEditDetails && (
                <>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Tadbir nomi</label>
                        <input type="text" className="w-full px-4 py-2 border rounded-xl" value={formData.title} onChange={e => onChange({ title: e.target.value })} />
                    </div>
                    {/* Tur va daraja. Daraja avtomatik ballga koeffitsient beradi, shu bilan
                        birga "xalqaro faoliyat" ko'rsatkichini ANIQLAYDI - bugungacha u tadbir
                        nomidan taxmin qilinardi, chunki bunday maydon yo'q edi. */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Tadbir turi</label>
                            <select className="w-full px-3 py-2 border rounded-xl text-sm bg-white"
                                value={formData.eventType || ''} onChange={e => onChange({ eventType: e.target.value })}>
                                <option value="">-- Tanlanmagan --</option>
                                {EVENT_TYPE_ORDER.map(id => <option key={id} value={id}>{EVENT_TYPES[id].label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Darajasi</label>
                            <select className="w-full px-3 py-2 border rounded-xl text-sm bg-white"
                                value={formData.level || DEFAULT_ACTIVITY_LEVEL} onChange={e => onChange({ level: e.target.value })}>
                                {ACTIVITY_LEVEL_ORDER.map(id => (
                                    <option key={id} value={id}>
                                        {ACTIVITY_LEVELS[id].label} (×{ACTIVITY_LEVELS[id].coefficient})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {/* MA'NAVIY-MA'RIFIY TADBIR (11-mezon).
                        Tizim buni tadbir TURIDAN taxmin qilmaydi: seminar
                        huquqiy ham, ma'naviy ham bo'lishi mumkin. Tasnifni
                        tadbirni biladigan odam bir marta belgilaydi, keyin
                        davomatda tashabbuskorlik belgisi shu asosda ochiladi. */}
                    <label className="flex items-start gap-2.5 p-3 rounded-xl border border-violet-100 bg-violet-50 cursor-pointer">
                        <input
                            type="checkbox"
                            className="mt-0.5 rounded accent-violet-600"
                            checked={!!formData.isSpiritual}
                            onChange={e => onChange({ isSpiritual: e.target.checked })}
                        />
                        <span className="min-w-0">
                            <span className="block text-xs font-bold text-gray-800">
                                Ma'naviy-ma'rifiy tadbir
                            </span>
                            <span className="block text-[11px] text-gray-600 mt-0.5">
                                Belgilansa, davomat kiritishda tashabbuskorlikni qayd etish mumkin
                                bo'ladi — ijtimoiy faollik indeksining 11-mezoni.
                            </span>
                        </span>
                    </label>
                    {!lockClub && (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Klubni tanlang</label>
                            <select className="w-full px-4 py-2 border rounded-xl" value={formData.clubId} onChange={e => onChange({ clubId: e.target.value })}>
                                <option value="">-- Klub tanlang --</option>
                                {(clubs || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                    )}
                    {/* Room, day and time chosen together in the ONE shared room calendar — the same
                        component the tournament wizard and the Tur schedule use, so every kind of activity
                        competes for rooms in one place instead of three separate date/time/venue fields
                        that couldn't see each other. */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">
                            O'tkazilish joyi va vaqti
                        </label>
                        <VenueCalendarPicker
                            date={formData.date}
                            venueLabel={formData.location}
                            startTime={formData.time}
                            endTime={formData.endTime}
                            excludeId={event?.id || null}
                            // Ishtirokchilar chegarasi belgilangan bo'lsa,
                            // sig'imi yetmaydigan xona ogohlantiriladi.
                            expectedCount={formData.maxParticipants ?? null}
                            placeholder="Xona, kun va vaqtni tanlash uchun bosing"
                            onPick={({ venueLabel, date, startTime, endTime }) =>
                                onChange({ location: venueLabel, date, time: startTime, endTime })}
                        />
                        {locationConflict && (
                            <p className="text-[11px] text-red-500 font-semibold mt-1.5">
                                Bu joy shu vaqtda band: "{locationConflict.title}".
                            </p>
                        )}
                    </div>
                    <div className="pt-2 border-t">
                        {/* `event` is null only while creating — an already-held event stays fully editable. */}
                        <RegistrationSettingsFields values={formData} onChange={onChange} locationConflict={locationConflict} compact isNew={!event} />
                    </div>
                    {saveError && (
                        <p className="text-xs font-semibold text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{saveError}</p>
                    )}
                    <div className="flex gap-3 pt-2">
                        {onCancel && <Button variant="outline" className="flex-1" onClick={onCancel}>Yopish</Button>}
                        <Button variant="primary" className="flex-1 bg-indigo-600" onClick={onSave}>Saqlash</Button>
                    </div>
                </>
            )}

            {showManagement && event && (
                <div className="mt-6 pt-6 border-t">
                    <EventManagementPanel
                        event={event}
                        user={user}
                        hasClubRole={hasClubRole}
                        isAdmin={isAdmin}
                        isManagement={isManagement}
                        canEditDetails={canEditDetails}
                        canManageAttendance={canManageAttendance}
                        actingUsername={actingUsername}
                        onDataChanged={onDataChanged}
                    />
                </div>
            )}
        </div>
    );
};

export default EventEditForm;
