import React from 'react';

const inputClass = "w-full px-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm";
const smallInputClass = "w-full px-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none";

// Competitions store their own start moment as startDate+startTime, plain events as date+time — this
// reads whichever pair `values` actually has (same normalization TournamentBasicStep.jsx and
// EventEditForm.jsx already imply by both passing their own record straight through as `values`) and
// returns it in the same 'YYYY-MM-DDTHH:mm' shape a <input type="datetime-local"> value/max expects.
const effectiveStartDateTime = (values) => {
    const date = values.startDate || values.date;
    if (!date) return null;
    const time = values.startTime || values.time || '00:00';
    return `${date}T${time}`;
};

// Shared source of truth for the registration-window ordering rules — called both for this component's
// own inline error display and by the two real callers (TournamentCreateWizard.jsx's getStepIssues,
// EventManagement.jsx's handleSaveEvent) so a misconfigured window is caught before save in every path,
// not just here. Returns a plain array of Uzbek issue strings (empty = valid).
export const getRegistrationWindowIssues = (values, { isNew = false } = {}) => {
    const issues = [];
    const opensAt = values.registrationOpensAt ? new Date(values.registrationOpensAt) : null;
    const closesAt = values.registrationClosesAt ? new Date(values.registrationClosesAt) : null;
    const startAtRaw = effectiveStartDateTime(values);
    const startAt = startAtRaw ? new Date(startAtRaw) : null;

    // Past-dating guard, mirroring db.js's findRegistrationWindowIssue — creation only (an already-held
    // tadbir must stay editable). Midnight = "time left blank", so those are judged by date alone.
    // Minute granularity, same as db.js — picking the current minute is valid, the one before it isn't.
    const nowMinute = (() => { const d = new Date(); d.setSeconds(0, 0); return d; })();
    if (isNew && startAt) {
        const timeWasChosen = !(startAt.getHours() === 0 && startAt.getMinutes() === 0);
        const todayStart = new Date(nowMinute.getFullYear(), nowMinute.getMonth(), nowMinute.getDate());
        if (timeWasChosen ? startAt < nowMinute : startAt < todayStart) {
            issues.push("Boshlanish sanasi/vaqti o'tmishda bo'lishi mumkin emas.");
        }
    }
    if (isNew && opensAt && opensAt < nowMinute) {
        issues.push("Ro'yxatdan o'tish boshlanish vaqti o'tmishda bo'lishi mumkin emas.");
    }

    if (!values.registrationRequired) return issues;
    if (opensAt && closesAt && opensAt > closesAt) {
        issues.push("Ro'yxatdan o'tish boshlanish vaqti tugash vaqtidan keyin bo'lishi mumkin emas.");
    }
    if (closesAt && startAt && closesAt > startAt) {
        issues.push("Ro'yxatdan o'tish tugash vaqti boshlanish sanasi/vaqtidan keyin bo'lishi mumkin emas.");
    }
    if (opensAt && startAt && opensAt > startAt) {
        issues.push("Ro'yxatdan o'tish boshlanish vaqti tadbir/musobaqaning o'z boshlanish vaqtidan keyin bo'lishi mumkin emas.");
    }
    return issues;
};

const LOCATION_TYPES = [
    { id: 'physical', label: 'Jismoniy' },
    { id: 'online', label: 'Online' },
    { id: 'hybrid', label: 'Gibrid' },
    { id: 'tbd', label: 'Aniqlanmagan' }
];

// The ONE "Ro'yxatdan o'tish" creation-time block — reused identically by the tournament wizard
// (TournamentBasicStep.jsx) and the plain-event creation form (EventManagement.jsx), replacing what
// used to be two separately hand-written, slowly-diverging copies of the same UI. `compact` switches
// to EventManagement's tighter modal spacing; the fields and behavior are otherwise identical.
// `lockedRegistrationType` ('individual'|'team'): tournaments already fix their participant type in
// Step 1 (Asosiy) — the scoring engine depends on it — so registration mode here must follow that
// choice, not be independently editable (which could contradict it). Plain events have no such
// constraint and get the free individual/team/both selector.
// `hideTypeRow`: when the caller already shows an editable Yakka/Jamoaviy control elsewhere on the same
// screen (TournamentBasicStep's own "Ishtirokchilar turi" toggle, for presets that don't lock it),
// repeating that same value here — even read-only — is pure duplication, not a second real question.
// Team-size fields still key off lockedRegistrationType regardless, since that logic is unaffected.
const RegistrationSettingsFields = ({ values, onChange, locationConflict, compact = false, lockedRegistrationType = null, hideTypeRow = false, isNew = false }) => {
    const input = compact ? smallInputClass : inputClass;
    const label = compact ? "block text-xs font-bold text-gray-500 mb-1" : "block text-xs font-bold text-gray-700 uppercase mb-1.5";
    const startAt = effectiveStartDateTime(values);
    const windowIssues = getRegistrationWindowIssues(values, { isNew });
    // 'YYYY-MM-DDTHH:mm' for the datetime-local `min` — blocks past picks in the native picker on create.
    // Local time (not toISOString, which would shift by the UTC offset and allow a past slot).
    const nowLocal = (() => {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    })();

    return (
        <div className="space-y-4">
            <div>
                <label className={label}>Joy turi</label>
                <div className="flex gap-2 flex-wrap">
                    {LOCATION_TYPES.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => onChange({ locationType: t.id })}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                                (values.locationType || 'physical') === t.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                {locationConflict && (
                    <p className="text-[11px] text-red-500 font-semibold mt-1.5">
                        Bu joy shu vaqtda band: "{locationConflict.title}" tadbiri uchun allaqachon band qilingan.
                    </p>
                )}
            </div>

            <div className="pt-2 border-t border-gray-100">
                <label className={label}>Ro'yxatdan o'tish kerakmi?</label>
                <div className="flex gap-3">
                    {[{ id: true, label: 'Kerak' }, { id: false, label: 'Kerak emas' }].map(v => (
                        <label
                            key={String(v.id)}
                            className={`flex-1 px-4 py-2.5 rounded-2xl border text-sm font-semibold text-center cursor-pointer transition-all ${
                                values.registrationRequired === v.id ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            <input type="radio" className="hidden" checked={values.registrationRequired === v.id} onChange={() => onChange({ registrationRequired: v.id })} />
                            {v.label}
                        </label>
                    ))}
                </div>
            </div>

            {values.registrationRequired && (
                <div className="space-y-4 border-l-2 border-indigo-100 pl-4">
                    {!hideTypeRow && (
                        <div>
                            <label className={label}>Ishtirok shakli</label>
                            {lockedRegistrationType ? (
                                <div className={`${input} bg-gray-100 text-gray-500 flex items-center justify-between`}>
                                    <span>{lockedRegistrationType === 'team' ? 'Jamoaviy' : 'Yakka'}</span>
                                    <span className="text-[10px] text-gray-400">Turnir turiga bog'liq</span>
                                </div>
                            ) : (
                                <select className={input} value={values.registrationType || 'individual'} onChange={e => onChange({ registrationType: e.target.value })}>
                                    <option value="individual">Yakka</option>
                                    <option value="team">Jamoaviy</option>
                                    <option value="both">Ikkalasi ham</option>
                                </select>
                            )}
                        </div>
                    )}

                    {(lockedRegistrationType === 'team' || values.registrationType === 'team' || values.registrationType === 'both') && (
                        <div>
                            <label className={label}>Jamoa tarkibi</label>
                            <div className="flex gap-3">
                                {[{ id: 'mixed', label: 'Aralash' }, { id: 'single_faculty', label: 'Faqat bitta fakultetdan' }].map(v => (
                                    <label
                                        key={v.id}
                                        className={`flex-1 px-4 py-2.5 rounded-2xl border text-sm font-semibold text-center cursor-pointer transition-all ${
                                            (values.teamCompositionRule || 'mixed') === v.id ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            className="hidden"
                                            checked={(values.teamCompositionRule || 'mixed') === v.id}
                                            onChange={() => onChange(v.id === 'mixed' ? { teamCompositionRule: 'mixed', teamCourseRule: 'mixed' } : { teamCompositionRule: v.id })}
                                        />
                                        {v.label}
                                    </label>
                                ))}
                            </div>
                            {values.teamCompositionRule === 'single_faculty' && (
                                <div className="mt-2.5">
                                    <label className={label}>Kurslar bo'yicha</label>
                                    <div className="flex gap-3">
                                        {[{ id: 'mixed', label: 'Aralash kurslar' }, { id: 'single_course', label: 'Faqat bitta kursdan' }].map(v => (
                                            <label
                                                key={v.id}
                                                className={`flex-1 px-3.5 py-2 rounded-xl border text-xs font-semibold text-center cursor-pointer transition-all ${
                                                    (values.teamCourseRule || 'mixed') === v.id ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    className="hidden"
                                                    checked={(values.teamCourseRule || 'mixed') === v.id}
                                                    onChange={() => onChange({ teamCourseRule: v.id })}
                                                />
                                                {v.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <p className="text-[11px] text-gray-400 mt-1.5">
                                "Faqat bitta fakultetdan" tanlansa, kapitan bilan boshqa fakultetdan (yoki kursdan) bo'lgan a'zo jamoaga qo'shila olmaydi.
                            </p>
                        </div>
                    )}

                    {(lockedRegistrationType === 'team' || values.registrationType === 'team' || values.registrationType === 'both') && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={label}>Jamoa min. hajmi</label>
                                <input
                                    type="number"
                                    min={1}
                                    className={input}
                                    placeholder="Cheklanmagan"
                                    value={values.teamMinSize ?? ''}
                                    onChange={e => onChange({ teamMinSize: e.target.value === '' ? null : Number(e.target.value) })}
                                />
                            </div>
                            <div>
                                <label className={label}>Jamoa maks. hajmi</label>
                                <input
                                    type="number"
                                    min={1}
                                    className={input}
                                    placeholder="Cheklanmagan"
                                    value={values.teamMaxSize ?? ''}
                                    onChange={e => onChange({ teamMaxSize: e.target.value === '' ? null : Number(e.target.value) })}
                                />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={label}>Maksimal ishtirokchilar</label>
                            <input
                                type="number"
                                min={1}
                                className={input}
                                placeholder="Cheklanmagan"
                                value={values.maxParticipants ?? ''}
                                onChange={e => onChange({ maxParticipants: e.target.value === '' ? null : Number(e.target.value) })}
                            />
                        </div>
                        <div className="flex flex-col justify-center gap-3">
                            <div>
                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                                    <input type="checkbox" checked={!!values.waitlistEnabled} onChange={e => onChange({ waitlistEnabled: e.target.checked })} />
                                    Kutish ro'yxati
                                </label>
                                <p className="text-[11px] text-gray-400 mt-0.5 ml-6">
                                    "Maksimal ishtirokchilar" to'lganda, keyingi ro'yxatdan o'tuvchilar rad etilmaydi — kutish navbatiga tushadi. Kimdir bekor qilsa, navbatdagiga bo'sh joy avtomatik taklif qilinadi.
                                </p>
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                                    <input type="checkbox" checked={!!values.approvalRequired} onChange={e => onChange({ approvalRequired: e.target.checked })} />
                                    Tasdiqlash talab qilinsin
                                </label>
                                <p className="text-[11px] text-gray-400 mt-0.5 ml-6">
                                    Yoqilsa, ro'yxatdan o'tish darhol tasdiqlanmaydi — admin/koordinator qo'lda ko'rib chiqib tasdiqlashi yoki rad etishi kerak. Yoqilmasa, ro'yxatdan o'tgan zahoti haqiqiy ishtirokchi hisoblanadi.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={label}>Ro'yxatdan o'tish boshlanishi <span className="text-red-500">*</span></label>
                            <input
                                type="datetime-local"
                                required
                                min={isNew ? nowLocal : undefined}
                                max={values.registrationClosesAt || startAt || undefined}
                                className={input}
                                value={values.registrationOpensAt || ''}
                                onChange={e => onChange({ registrationOpensAt: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className={label}>Ro'yxatdan o'tish tugashi</label>
                            <input
                                type="datetime-local"
                                min={values.registrationOpensAt || (isNew ? nowLocal : undefined)}
                                max={startAt || undefined}
                                className={input}
                                value={values.registrationClosesAt || ''}
                                onChange={e => onChange({ registrationClosesAt: e.target.value })}
                            />
                            <p className="text-[11px] text-gray-400 mt-1">Bo'sh qoldirilsa, faoliyat boshlanish vaqtida avtomatik yopiladi.</p>
                        </div>
                    </div>
                    {windowIssues.length > 0 && (
                        <div className="p-3 bg-red-50 border border-red-100 rounded-xl space-y-1">
                            {windowIssues.map((issue, i) => (
                                <p key={i} className="text-[11px] font-semibold text-red-600">{issue}</p>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default RegistrationSettingsFields;
