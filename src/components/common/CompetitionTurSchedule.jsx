import React, { useMemo, useState } from 'react';
import { Calendar, ChevronUp, ChevronDown, Clock, Users, MapPin } from 'lucide-react';
import { db } from '../../services/db';
import VenueCalendarPicker from './VenueCalendarPicker';

// "Jadval" tab's "Turlar jadvali" - one row per Tur (stage), with a real date/start-time/end-time and a
// responsible judge ("Muallif"), persisted via db.js's competitionTurSchedule overlay. Admins (canEdit)
// get real inputs; everyone else (participants/teams) only ever sees a read-only rendering of the same
// data - never inputs, per the confirmed requirement.
//
// Turs are grouped under their Bosqich label (stage.bosqichLabel - the same free-text name set in Tur
// tuzilmasi, e.g. "Saralash"/"Guruh bosqichi"/"Final") purely for display, matching the creation-time
// structure one-to-one. When the competition has real guruh(lar) (Turlarni boshqarish's Guruh bosqichlari
// panel), a "Fakultet/Guruh" picker appears - same idiom as Natija kiritish's own filter - letting each
// guruh carry its OWN date/time per Tur (e.g. IT fakulteti's 1-Tur on a different day than Iqtisod
// fakulteti's). "Umumiy" (no guruh selected) edits the original shared slot, unchanged from before this
// existed - a competition with no guruh never sees the picker and behaves exactly as it always has.
// `unitLabel` - bosqichli musobaqada "tur", bosqichsizida "raund" yoki
// "savol". Nom KO'RINISHDAN kelib chiqadi, saqlanadigan ma'lumot esa bir
// xil: "1-tur" deb yozilgan raundni tashkilotchi tanimay qolardi.
const CompetitionTurSchedule = ({ competition, stages, canEdit, unitLabel = 'tur' }) => {
    const [collapsed, setCollapsed] = useState(false);
    const [version, setVersion] = useState(0);
    const [selectedGroupId, setSelectedGroupId] = useState(null); // null = "Umumiy"

    const facultyGroups = useMemo(() => db.getScoringGroups(competition.id), [competition.id, version]);

    const scheduleByTur = useMemo(() => {
        const rows = db.getTurSchedule(competition.id).filter(r => (r.groupId || null) === selectedGroupId);
        return new Map(rows.map(r => [r.turIndex, r]));
    }, [competition.id, version, selectedGroupId]);

    if (!stages || stages.length === 0) return null;

    // Tur N must not start before Tur N-1 ends (or, for the very first Tur in this scope, before the
    // competition's own startDate/startTime) - and must not end after Tur N+1 starts. `visibleTurs`
    // (below) is already the right sequence to check against: the guruh-scoped chain when a specific
    // guruh is selected, the "Umumiy" chain otherwise - each is validated independently, matching how
    // they're edited independently.
    const combineLocal = (date, time) => (date ? new Date(`${date}T${time || '00:00'}`) : null);
    const getTurBounds = (turIndex) => {
        const idx = visibleTurs.findIndex(v => v.turIndex === turIndex);
        if (idx === -1) return {};
        let minMoment = null;
        if (idx === 0) {
            if (competition.startDate) minMoment = combineLocal(competition.startDate, competition.startTime);
        } else {
            const prevEntry = scheduleByTur.get(visibleTurs[idx - 1].turIndex);
            if (prevEntry?.date) minMoment = combineLocal(prevEntry.date, prevEntry.endTime || prevEntry.startTime);
        }
        let maxMoment = null;
        if (idx < visibleTurs.length - 1) {
            const nextEntry = scheduleByTur.get(visibleTurs[idx + 1].turIndex);
            if (nextEntry?.date) maxMoment = combineLocal(nextEntry.date, nextEntry.startTime);
        }
        return { minMoment, maxMoment };
    };

    const handleChange = async (turIndex, field, value) => {
        if (['date', 'startTime', 'endTime'].includes(field)) {
            const currentEntry = scheduleByTur.get(turIndex) || {};
            const candidate = { ...currentEntry, [field]: value || null };
            const { minMoment, maxMoment } = getTurBounds(turIndex);
            const candidateStart = combineLocal(candidate.date, candidate.startTime);
            const candidateEnd = combineLocal(candidate.date, candidate.endTime || candidate.startTime);
            if (candidateStart && minMoment && candidateStart < minMoment) {
                alert(`Bu Tur ${minMoment.toLocaleString('uz-UZ')} dan oldin boshlanishi mumkin emas (oldingi Tur/musobaqaning o'zi shu vaqtda tugaydi/boshlanadi).`);
                return;
            }
            if (candidateEnd && maxMoment && candidateEnd > maxMoment) {
                alert(`Bu Tur ${maxMoment.toLocaleString('uz-UZ')} dan keyin tugashi mumkin emas (keyingi Tur shu vaqtda boshlanadi).`);
                return;
            }
        }
        try {
            await db.setTurSchedule(competition.id, turIndex, { [field]: value || null }, selectedGroupId);
            setVersion(v => v + 1);
        } catch (err) {
            alert(err?.message || "Jadvalni saqlashda xatolik yuz berdi.");
        }
    };

    const fmtTime = (t) => (t ? t : '-:-');

    // Which Turs actually belong to the guruh-scoped phase vs the shared/merged "Umumiy" (final) phase -
    // read directly from the SAME field CompetitionAdvancementPanel's "Qaysi Turdan boshlab hamma guruh
    // birlashadi?" selector already writes (competition.ungroupedBoundaries), so this reacts to whatever
    // the admin actually configured there instead of guessing. The first boundary marked "ungrouped"
    // (pooled top-N cut) is where guruh(lar) merge into one shared list - every Tur from that boundary's
    // target onward is "Umumiy"; every Tur before it (Tur1 included) stays guruh-scoped. No ungrouped
    // boundary configured yet ("Hali yo'q") = no merge point decided yet = every Tur is still guruh-scoped.
    const boundaryCount = stages.length - 1;
    const ungroupedBoundaries = competition.ungroupedBoundaries || [];
    let pooledFromTur = null;
    for (let b = 1; b <= boundaryCount; b++) {
        if (ungroupedBoundaries.includes(b)) { pooledFromTur = b + 1; break; }
    }
    const isGuruhScopedTur = (turIndex) => pooledFromTur === null || turIndex < pooledFromTur;

    // No guruh at all -> every Tur shows, unchanged from before this feature existed. With guruh(lar):
    // "Umumiy" only shows the merged/final Tur(s); a specific guruh only shows its own guruh-scoped Turs.
    const visibleTurs = facultyGroups.length === 0
        ? stages.map((stage, idx) => ({ stage, turIndex: idx + 1 }))
        : stages
            .map((stage, idx) => ({ stage, turIndex: idx + 1 }))
            .filter(({ turIndex }) => (selectedGroupId === null ? !isGuruhScopedTur(turIndex) : isGuruhScopedTur(turIndex)));

    // Consecutive stages sharing the same Bosqich label become one visual group - matches exactly how
    // they were built in Tur tuzilmasi (bosqich -> turlar), no re-derivation needed beyond grouping by
    // the label already compiled onto each stage.
    const bosqichGroups = [];
    visibleTurs.forEach(({ stage, turIndex }) => {
        const label = stage.bosqichLabel || null;
        const last = bosqichGroups[bosqichGroups.length - 1];
        if (last && last.label === label) {
            last.items.push({ stage, turIndex });
        } else {
            bosqichGroups.push({ label, items: [{ stage, turIndex }] });
        }
    });

    return (
        <div className="border border-gray-200 rounded-2xl overflow-hidden">
            <button
                type="button"
                onClick={() => setCollapsed(c => !c)}
                className="w-full flex items-center justify-between gap-2 px-5 py-4 hover:bg-gray-50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Calendar size={18} className="text-gray-500" />
                    <h3 className="font-bold text-gray-900">
                        {unitLabel === 'tur' ? 'Turlar jadvali' : `${unitLabel[0].toUpperCase()}${unitLabel.slice(1)}lar jadvali`}
                    </h3>
                </div>
                {collapsed ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronUp size={16} className="text-gray-400" />}
            </button>
            {!collapsed && (
                <div className="p-5 pt-0 space-y-5">
                    {facultyGroups.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1.5 text-xs font-bold text-gray-500 shrink-0">
                                <Users size={14} /> Fakultet/Guruh:
                            </span>
                            <div className="flex gap-1.5 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => setSelectedGroupId(null)}
                                    className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all border ${
                                        selectedGroupId === null ? 'bg-indigo-700 border-indigo-700 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    Umumiy
                                </button>
                                {facultyGroups.map(g => (
                                    <button
                                        key={g.id}
                                        type="button"
                                        onClick={() => setSelectedGroupId(g.id)}
                                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all border ${
                                            selectedGroupId === g.id ? 'bg-indigo-700 border-indigo-700 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                        }`}
                                    >
                                        {g.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-gray-400 w-full">
                                {selectedGroupId === null
                                    ? "Umumiy - guruhga bog'lanmagan Turlar (masalan yakuniy/birlashgan Tur) uchun."
                                    : `"${facultyGroups.find(g => g.id === selectedGroupId)?.label}" guruhi uchun sana/vaqt - boshqa guruhlarnikidan mustaqil.`}
                            </p>
                        </div>
                    )}

                    {facultyGroups.length > 0 && visibleTurs.length === 0 && (
                        <p className="text-xs text-gray-400 italic">
                            {selectedGroupId === null
                                ? "Hali umumiy (final) Tur belgilanmagan - Turlarni boshqarish -> Guruh bosqichlari panelida tegishli bosqich chegarasida guruhlashni o'chiring."
                                : "Bu guruh uchun ko'rsatiladigan Tur yo'q."}
                        </p>
                    )}

                    {bosqichGroups.map((bg, bgIdx) => (
                        <div key={bgIdx} className="space-y-2.5">
                            {bg.label && (
                                <h4 className="text-xs font-extrabold text-indigo-500 uppercase tracking-wider">{bg.label}</h4>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {bg.items.map(({ stage, turIndex }) => {
                                    const entry = scheduleByTur.get(turIndex) || {};
                                    return (
                                        <div key={stage.label} className="p-4 border border-gray-100 rounded-2xl space-y-2.5">
                                            <div className="flex items-center gap-2.5 flex-wrap">
                                                <span className="text-xs font-bold text-gray-500 w-16 shrink-0">{turIndex}-{unitLabel}</span>
                                                {canEdit ? (
                                                    <div className="flex-1 min-w-[200px]">
                                                        {/* Same shared room calendar as the creation wizard -
                                                            one place answers "which room, which day". */}
                                                        <VenueCalendarPicker
                                                            date={entry.date}
                                                            venueLabel={entry.venueLabel || competition.location}
                                                            startTime={entry.startTime}
                                                            endTime={entry.endTime}
                                                            excludeId={competition.id}
                                                            expectedCount={competition.maxParticipants ?? null}
                                                            placeholder="Joy va vaqtni tanlang"
                                                            onPick={async ({ venueLabel, date, startTime, endTime }) => {
                                                                await db.setTurSchedule(
                                                                    competition.id, turIndex,
                                                                    { venueLabel, date, startTime, endTime },
                                                                    selectedGroupId
                                                                );
                                                                setVersion(v => v + 1);
                                                            }}
                                                        />
                                                    </div>
                                                ) : (
                                                    <span className="flex items-center gap-3 text-xs text-gray-600">
                                                        <span className="flex items-center gap-1"><Calendar size={12} className="text-gray-400" />{entry.date || 'Belgilanmagan'}</span>
                                                        <span className="flex items-center gap-1"><Clock size={12} className="text-gray-400" />{fmtTime(entry.startTime)}-{fmtTime(entry.endTime)}</span>
                                                    </span>
                                                )}
                                            </div>
                                            {/* O'tkazilish joyi - MAJBURIY EMAS. A long-running tournament's
                                                later Turs can happen months after creation, in a different
                                                room than the one chosen back then, so each Tur carries its
                                                own optional venue. Setting one makes that Tur really hold
                                                the room (see db.collectVenueOccupancy) and show up on the
                                                Xonalar bandligi calendar. */}
                                            {!canEdit && (entry.venueLabel || competition.location) && (
                                                <p className="flex items-center gap-1 text-xs text-gray-600">
                                                    <MapPin size={12} className="text-gray-400" />
                                                    {entry.venueLabel || competition.location}
                                                    {!entry.venueLabel && <span className="text-gray-400">(umumiy joy)</span>}
                                                </p>
                                            )}

                                            {canEdit ? (
                                                <select
                                                    value={entry.judgeUsername || ''}
                                                    onChange={e => handleChange(turIndex, 'judgeUsername', e.target.value)}
                                                    className="w-full px-2.5 py-1.5 border rounded-lg text-xs font-semibold text-indigo-600"
                                                >
                                                    <option value="">Muallif tanlanmagan</option>
                                                    {(competition.judges || []).map(j => <option key={j} value={j}>{j}</option>)}
                                                </select>
                                            ) : (
                                                entry.judgeUsername && (
                                                    <p className="text-xs font-semibold text-indigo-600">Muallif: {entry.judgeUsername}</p>
                                                )
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CompetitionTurSchedule;
