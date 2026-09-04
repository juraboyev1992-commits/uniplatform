import React from 'react';
import { FORMATS, getDefaultScoringMode, SCORING_MODES, PRESETS, getPresetMode, ZAKOVAT_CLUB_ID, QUIZ25_CLUB_ID, UNIQUIZ_CLUB_ID } from '../../config/competitionEngines';

// Clubs whose competitions are always open, with no per-competition visibility choice to make -
// each club's own explicit convention, confirmed one at a time as this club-by-club review reaches it.
const ALWAYS_OPEN_CLUBS = [ZAKOVAT_CLUB_ID, QUIZ25_CLUB_ID, UNIQUIZ_CLUB_ID];
import { DEFAULT_REGION } from '../../constants';
import RegistrationSettingsFields from '../activities/RegistrationSettingsFields';
import VenueCalendarPicker from './VenueCalendarPicker';
import { ACTIVITY_LEVELS, ACTIVITY_LEVEL_ORDER, DEFAULT_ACTIVITY_LEVEL } from '../../config/activityLifecycle';

const inputClass = "w-full px-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm";
const labelClass = "block text-xs font-bold text-gray-700 uppercase mb-1.5";

// Step 1 of the tournament creation wizard - name, club (role-gated), club-scoped "Turnir turi",
// format, visibility, region/location, and scheduling.
const TournamentBasicStep = ({ data, onChange, clubs, isClubLocked, availablePresets, locationConflict }) => {
    // Format (Kubok/Liga/Chempionat/Saralash+final) only actually drives anything for correct_answer
    // (always) and for a quiz_mixed preset that has NEITHER its own fixed stages (UniQuiz/25-savol)
    // NOR the free-structure builder turned on - see TournamentCreateWizard.jsx's buildCompetitionPayload,
    // which never reads data.format at all outside those cases. Disabling it elsewhere (rather than
    // leaving it silently ignored, as a real test session found confusing) makes that visible up front.
    const selectedPreset = availablePresets.find(p => p.id === data.presetId);
    const presetHasOwnStages = !!selectedPreset?.defaults?.stages;
    // Zakovat (and every other all-professional club) has zero "Oddiy" presets - landing there left
    // "Turnir turi" empty with no explanation (real bug, found live; TournamentCreateWizard.jsx's own
    // useEffect already auto-corrects the mode once, but the toggle itself still let an admin click back
    // into a dead end). Disabling "Oddiy" here whenever the current club can't use it closes that off
    // at the source instead of just recovering from it after the fact.
    const clubHasSimplePreset = !data.clubId || PRESETS.some(p => p.clubId === data.clubId && getPresetMode(p) === 'simple');
    const formatMatters = !selectedPreset
        || selectedPreset.scoringEngine === 'correct_answer'
        || (selectedPreset.scoringEngine === 'quiz_mixed' && !presetHasOwnStages && !data.useFreeStructure);
    return (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
            <div>
                <h3 className="text-lg font-bold text-gray-900">1. Asosiy ma'lumotlar</h3>
                <p className="text-sm text-gray-500">Turnirning nomi, klubi va asosiy tavsiflari</p>
            </div>

            <div>
                <label className={labelClass}>Rejim</label>
                <div className="flex gap-3">
                    {[
                        { id: 'simple', label: 'Oddiy (Simple)', hint: "Ko'pchilik klublar uchun - Vokal, Raqs, Ijodiy tanlovlar va h.k.", enabled: clubHasSimplePreset },
                        { id: 'professional', label: 'Professional', hint: "Zakovat, 25-savol, Debat, Moot Court, Sport kabi maxsus formatlar", enabled: true }
                    ].map(m => (
                        <label
                            key={m.id}
                            className={`flex-1 px-4 py-3 rounded-2xl border transition-all ${!m.enabled ? 'opacity-40 cursor-not-allowed bg-gray-50' : 'cursor-pointer'} ${
                                data.mode === m.id ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            <input
                                type="radio"
                                className="hidden"
                                disabled={!m.enabled}
                                checked={data.mode === m.id}
                                onChange={() => m.enabled && onChange({ mode: m.id, presetId: '' })}
                            />
                            <p className={`text-sm font-bold ${data.mode === m.id ? 'text-indigo-700' : 'text-gray-700'}`}>{m.label}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">{m.hint}{!m.enabled ? " - bu klubda yo'q" : ''}</p>
                        </label>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                    <label className={labelClass}>Turnir nomi <span className="text-red-500">*</span></label>
                    <input
                        type="text"
                        maxLength={100}
                        required
                        className={inputClass}
                        placeholder="Masalan: Zakovat Bahor Bosqichi 2026"
                        value={data.name}
                        onChange={e => onChange({ name: e.target.value })}
                    />
                    <p className="text-[11px] text-gray-400 mt-1 text-right">{data.name.length} / 100</p>
                </div>

                <div>
                    <label className={labelClass}>Klub <span className="text-red-500">*</span></label>
                    <select
                        className={`${inputClass} ${isClubLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'}`}
                        value={data.clubId}
                        disabled={isClubLocked}
                        onChange={e => onChange({ clubId: e.target.value, presetId: '' })}
                    >
                        <option value="">Klubni tanlang</option>
                        {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>

                <div>
                    <label className={labelClass}>Turnir turi <span className="text-red-500">*</span></label>
                    <select
                        className={inputClass}
                        value={data.presetId}
                        disabled={!data.clubId}
                        onChange={e => {
                            const preset = availablePresets.find(p => p.id === e.target.value);
                            onChange({
                                presetId: e.target.value,
                                calculationMethod: preset?.defaults?.calculationMethod || 'total',
                                // Step 3's "Baholash rejimi" block is pre-filled here; admin can still
                                // change it there - see TournamentRulesStep.jsx.
                                scoringMode: getDefaultScoringMode(preset),
                                // A preset that fixes participantType (Klassik/Breyn-ring -> team,
                                // Shaxsiy o'yin -> individual) must actually apply it - the "Ishtirokchilar
                                // turi" select below shows as locked/disabled either way, but data.type
                                // itself was never being synced to match (real gap, found during Zakovat
                                // review) - a stale value from a PREVIOUS preset choice would otherwise
                                // silently survive under the disabled dropdown.
                                ...(preset?.participantType ? { type: preset.participantType } : {})
                            });
                        }}
                    >
                        <option value="">{data.clubId ? 'Turnir turini tanlang' : 'Avval klubni tanlang'}</option>
                        {/* Single pass, preserving PRESETS' own order - a disabled ("tez orada") preset
                            stays visually in its real position (e.g. 3rd) instead of always sorting to
                            the bottom, so the admin sees it's coming without it looking selectable. */}
                        {availablePresets.map(p => (
                            <option key={p.id} value={p.id} disabled={!p.implemented}>
                                {p.label}{!p.implemented ? ' (tez orada)' : ''}
                            </option>
                        ))}
                    </select>
                    {selectedPreset && (
                        <p className="text-[11px] text-gray-400 mt-1.5">
                            Baholash: <span className="font-semibold text-gray-500">{SCORING_MODES.find(m => m.id === data.scoringMode)?.label}</span> - 3-qadamda o'zgartirish mumkin.
                        </p>
                    )}
                </div>

                {/* Preset already fixes participantType (e.g. Zakovat's Klassik/Breyn-ring are always
                    team) - nothing left to actually choose, so the field is dropped entirely rather than
                    shown disabled (was pure visual noise for those presets). Only rendered when the
                    preset genuinely leaves it open. */}
                {!selectedPreset?.participantType && (
                    <div>
                        <label className={labelClass}>Ishtirokchilar turi</label>
                        <select
                            className={inputClass}
                            value={data.type}
                            onChange={e => onChange({ type: e.target.value })}
                        >
                            <option value="team">Jamoaviy</option>
                            <option value="individual">Yakka Tartibda (Talabalar)</option>
                        </select>
                    </div>
                )}

                {/* Musobaqa darajasi. Ishtirok baliga koeffitsient beradi va "xalqaro
                    faoliyat" ko'rsatkichini aniqlaydi - ilgari u musobaqa NOMIDAN
                    taxmin qilinardi. Belgilanmasa universitet darajasi (koeffitsient 1),
                    ya'ni eski musobaqalarda hisob o'zgarmaydi. */}
                <div>
                    <label className={labelClass}>Darajasi</label>
                    <select
                        className={inputClass}
                        value={data.level || DEFAULT_ACTIVITY_LEVEL}
                        onChange={e => onChange({ level: e.target.value })}
                    >
                        {ACTIVITY_LEVEL_ORDER.map(id => (
                            <option key={id} value={id}>
                                {ACTIVITY_LEVELS[id].label} (×{ACTIVITY_LEVELS[id].coefficient})
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className={labelClass}>Format <span className="text-red-500">*</span></label>
                    <select
                        disabled={!formatMatters}
                        className={`${inputClass} ${!formatMatters ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
                        value={data.format}
                        onChange={e => onChange({ format: e.target.value })}
                    >
                        {FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                    {!formatMatters && (
                        <p className="text-[11px] text-gray-400 mt-1.5">Bu turnir turi o'z tuzilmasidan foydalanadi - Format bu yerda ta'sir qilmaydi.</p>
                    )}
                </div>

                {/* ALWAYS_OPEN_CLUBS' own convention: every competition is open, no per-competition choice
                    needed - data.visibility keeps its 'open' default (buildInitialData), just not asked here. */}
                {!ALWAYS_OPEN_CLUBS.includes(data.clubId) && (
                    <div>
                        <label className={labelClass}>Turnir ko'rinuvchanligi</label>
                        <div className="flex gap-3">
                            {[{ id: 'open', label: 'Ochiq' }, { id: 'closed', label: 'Yopiq' }].map(v => (
                                <label
                                    key={v.id}
                                    className={`flex-1 px-4 py-3 rounded-2xl border text-sm font-semibold text-center cursor-pointer transition-all ${
                                        data.visibility === v.id ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                    }`}
                                >
                                    <input type="radio" className="hidden" checked={data.visibility === v.id} onChange={() => onChange({ visibility: v.id })} />
                                    {v.label}
                                </label>
                            ))}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1.5">
                            {data.visibility === 'open'
                                ? "Ochiq: moderatsiyadan so'ng bosh sahifada ko'rinadi"
                                : 'Yopiq: faqat havola orqali kiriladi'}
                        </p>
                    </div>
                )}

                <div>
                    <label className={labelClass}>Hudud</label>
                    <input type="text" disabled className={`${inputClass} bg-gray-100 text-gray-500`} value={DEFAULT_REGION} />
                </div>

                {/* Kubok (bir martalik) = one date window for the whole competition (unchanged meaning).
                    Liga (mavsumiy) reuses the SAME startDate/startTime/endTime fields, just relabeled —
                    they now mean the 1-Tur's own window; later Tur get their own dates in Step 2.
                    Room, day and time are chosen together in one calendar rather than as three separate
                    fields, which is what stops two activities landing in one room at one time. */}
                <div className="md:col-span-2">
                    <label className={labelClass}>
                        {formatMatters && data.format === 'league' ? '1-Tur: joy va vaqt' : "O'tkazilish joyi va vaqti"} <span className="text-red-500">*</span>
                    </label>
                    <VenueCalendarPicker
                        date={data.startDate}
                        venueLabel={data.location}
                        startTime={data.startTime}
                        endTime={data.endTime}
                        // Ishtirokchilar chegarasi belgilangan bo'lsa,
                        // sig'imi yetmaydigan xona ogohlantiriladi.
                        expectedCount={data.maxParticipants ?? null}
                        placeholder="Xona, kun va vaqtni tanlash uchun bosing"
                        onPick={({ venueLabel, date, startTime, endTime }) =>
                            onChange({ location: venueLabel, startDate: date, startTime, endTime })}
                    />
                    {locationConflict && (
                        <p className="text-[11px] text-red-500 font-semibold mt-1.5">
                            Bu joy shu vaqtda band: "{locationConflict.title}".
                        </p>
                    )}
                </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
                <RegistrationSettingsFields
                    values={data}
                    onChange={onChange}
                    locationConflict={locationConflict}
                    lockedRegistrationType={data.type}
                    hideTypeRow={!selectedPreset?.participantType}
                    isNew
                />
            </div>
        </div>
    );
};

export default TournamentBasicStep;
