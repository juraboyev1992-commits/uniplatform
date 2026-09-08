import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, ChevronDown, ChevronUp, Search, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { db } from '../../services/db';
import { DEBATE_MATCH_REGLAMENT, DEBATE_MATCH_TOTAL_DURATION_MINUTES, computeDebateMatchEndTime } from '../../config/competitionEngines';

const STAGE_LABELS = { group: 'Guruh bosqichi', playoff: 'Pley-off' };
// Order here IS the pill display order — "Davom etayotgan" between "Rejalashtirilgan" and "Yakunlangan".
const STATUS_LABELS = { scheduled: 'Rejalashtirilgan', ongoing: 'Davom etayotgan', finished: 'Yakunlangan' };

// "Davom etayotgan" is never a stored field — matches only ever persist status:'scheduled'|'finished'
// (same as Sport's own match records). It's derived purely from real schedule data (same "classify from
// real dates, don't fabricate a new status field" convention CompetitionsManagementTab.jsx's
// classifyCompetition/classifyEvent already established): a not-yet-finished match whose scheduled
// start..end window contains the current moment counts as ongoing; anything else not-yet-finished is
// still just "scheduled". A match with no real scheduledDate/scheduledStartTime can never be "ongoing" —
// there's nothing to compare against, so it stays "scheduled" until it's actually finished.
const classifyMatchStatus = (m) => {
    if (m.status === 'finished') return 'finished';
    if (m.scheduledDate && m.scheduledStartTime) {
        const start = new Date(db.combineDateTime(m.scheduledDate, m.scheduledStartTime));
        const endTime = m.scheduledEndTime || computeDebateMatchEndTime(m.scheduledStartTime);
        const end = endTime ? new Date(db.combineDateTime(m.scheduledDate, endTime)) : null;
        const now = new Date();
        if (now >= start && (!end || now <= end)) return 'ongoing';
    }
    return 'scheduled';
};

// Collapsible sidebar section — same convention CompetitionsManagementTab.jsx's "Barcha tadbir va
// musobaqalar" filter sidebar already established (per direct feedback: reuse that visual layout here).
const FilterSection = ({ title, children, defaultOpen = true }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border-b border-gray-100 pb-4">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5"
            >
                {title}
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
            </button>
            {open && children}
        </div>
    );
};

// Munozara match-based ("debate_match") "Jadval" tab content — sibling to CompetitionTurSchedule.jsx's
// per-Tur schedule, but per-MATCH: kim kim bilan (T vs I), qachon (real date/start/end time), va har bir
// jamoa nomiga bosilganda o'sha match uchun notiq tartibi (T1..T3 / I1..I3 kimligi) ochiladi. `canEdit`
// (admin OR a delegate with the 'manage_teams' permission — computed by the caller) gets real inputs;
// everyone else only ever sees a read-only rendering of the same data — same convention
// CompetitionTurSchedule.jsx already established.
//
// Filter sidebar layout/style is deliberately copied from CompetitionsManagementTab.jsx's "Barcha tadbir
// va musobaqalar" filters (per direct feedback) — fields adapted to what a MATCH actually has (Bosqich
// instead of Format, Guruh instead of Yil, real scheduledDate range instead of event date; "Klub" dropped
// since a competition's Jadval is already scoped to one club). Status uses the same top-pill-row pattern
// as that reference page (Hammasi/Rejalashtirilgan/Yakunlangan), not a sidebar field.
const DebateMatchSchedule = ({ competition, canEdit }) => {
    const [version, setVersion] = useState(0);
    const [expandedKey, setExpandedKey] = useState(null); // `${matchId}:${side}`
    const [searchQuery, setSearchQuery] = useState('');
    const [stageFilter, setStageFilter] = useState([]); // [] = all, else subset of ['group','playoff']
    const [groupFilter, setGroupFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [statusFilter, setStatusFilter] = useState(''); // '' | 'scheduled' | 'finished'

    const allMatches = useMemo(() => db.getDebateMatches(competition.id), [competition.id, version]);
    const teamName = (id) => competition.participants.find(p => p.id === id)?.name || id;
    // Human-readable breakdown of the fixed reglament, shown as a tooltip next to the auto-computed end
    // time so an admin/vakil can see WHY a match takes 44 minutes, not just trust the number.
    const reglamentTooltip = DEBATE_MATCH_REGLAMENT.map(item => `${item.label} — ${item.minutes} daq.`).join('\n');

    const combineLocal = (date, time) => (date ? new Date(`${date}T${time || '00:00'}`) : null);
    // Pley-off logically follows the ENTIRE guruh bosqichi — a playoff match can't be scheduled before
    // the latest-ending group match, and (symmetrically) a group match can't be pushed past the
    // earliest-starting playoff match. Checked against ALL matches (not the filtered `matches` list),
    // since the constraint is global regardless of what the admin currently has filtered.
    const validateMatchStageOrder = (match, candidateDate, candidateStartTime, candidateEndTime) => {
        const candidateStart = combineLocal(candidateDate, candidateStartTime);
        const candidateEnd = combineLocal(candidateDate, candidateEndTime || candidateStartTime);
        if (match.stage === 'playoff' && candidateStart) {
            const groupEnds = allMatches
                .filter(m => m.stage === 'group' && m.scheduledDate)
                .map(m => combineLocal(m.scheduledDate, m.scheduledEndTime || m.scheduledStartTime))
                .filter(Boolean);
            if (groupEnds.length > 0) {
                const latestGroupEnd = new Date(Math.max(...groupEnds.map(d => d.getTime())));
                if (candidateStart < latestGroupEnd) {
                    return `Pley-off matchi guruh bosqichi tugashidan (${latestGroupEnd.toLocaleString('uz-UZ')}) oldin bo'lishi mumkin emas.`;
                }
            }
        } else if (match.stage === 'group' && candidateEnd) {
            const playoffStarts = allMatches
                .filter(m => m.stage === 'playoff' && m.scheduledDate)
                .map(m => combineLocal(m.scheduledDate, m.scheduledStartTime))
                .filter(Boolean);
            if (playoffStarts.length > 0) {
                const earliestPlayoffStart = new Date(Math.min(...playoffStarts.map(d => d.getTime())));
                if (candidateEnd > earliestPlayoffStart) {
                    return `Guruh bosqichi matchi pley-off boshlanishidan (${earliestPlayoffStart.toLocaleString('uz-UZ')}) keyin bo'lishi mumkin emas.`;
                }
            }
        }
        return null;
    };

    const handleScheduleChange = async (matchId, field, value) => {
        const match = allMatches.find(m => m.id === matchId);
        if (match && field === 'scheduledDate') {
            const error = validateMatchStageOrder(match, value, match.scheduledStartTime, match.scheduledEndTime);
            if (error) { alert(error); return; }
        }
        await db.setDebateMatchSchedule(matchId, { [field]: value || null });
        setVersion(v => v + 1);
    };

    // Boshlanish vaqti kiritilsa, tugash vaqti QO'LDA emas — rasman tasdiqlangan reglament bo'yicha
    // (DEBATE_MATCH_REGLAMENT, jami 44 daqiqa: 6 ta nutq + 4 ta 3-daqiqalik savol-javob) avtomatik
    // hisoblanadi va shu zahoti saqlanadi. Sana o'zgarganda esa vaqtlarning o'zi o'zgarmaydi, faqat
    // scheduledDate yangilanadi.
    const handleStartTimeChange = async (matchId, startTime) => {
        const match = allMatches.find(m => m.id === matchId);
        const scheduledEndTime = computeDebateMatchEndTime(startTime);
        if (match) {
            const error = validateMatchStageOrder(match, match.scheduledDate, startTime, scheduledEndTime);
            if (error) { alert(error); return; }
        }
        await db.setDebateMatchSchedule(matchId, { scheduledStartTime: startTime || null, scheduledEndTime });
        setVersion(v => v + 1);
    };

    const toggleExpand = (matchId, side) => {
        const key = `${matchId}:${side}`;
        setExpandedKey(prev => (prev === key ? null : key));
    };

    const fmtTime = (t) => (t ? t : '—:—');
    const toggleStage = (stage) => setStageFilter(prev => (prev.includes(stage) ? prev.filter(s => s !== stage) : [...prev, stage]));

    useEffect(() => { setGroupFilter(''); }, [stageFilter]);

    const groupNames = useMemo(() => [...new Set(allMatches.filter(m => m.groupName).map(m => m.groupName))].sort(), [allMatches]);
    const query = searchQuery.trim().toLowerCase();

    // Everything except status — feeds the status pill counts (so "Hammasi (N)" reflects the OTHER
    // active filters), same idiom as CompetitionsManagementTab.jsx's preStatusRows/statusCounts split.
    const preStatusMatches = useMemo(() => allMatches.filter(m => {
        if (stageFilter.length > 0 && !stageFilter.includes(m.stage)) return false;
        if (groupFilter && m.groupName !== groupFilter) return false;
        if (dateFrom && (!m.scheduledDate || m.scheduledDate < dateFrom)) return false;
        if (dateTo && (!m.scheduledDate || m.scheduledDate > dateTo)) return false;
        if (query && !teamName(m.teamTId).toLowerCase().includes(query) && !teamName(m.teamIId).toLowerCase().includes(query)) return false;
        return true;
    }), [allMatches, stageFilter, groupFilter, dateFrom, dateTo, query]);

    const statusCounts = useMemo(() => {
        const counts = { scheduled: 0, ongoing: 0, finished: 0 };
        preStatusMatches.forEach(m => { const s = classifyMatchStatus(m); counts[s] = (counts[s] || 0) + 1; });
        return counts;
    }, [preStatusMatches]);

    const matches = statusFilter ? preStatusMatches.filter(m => classifyMatchStatus(m) === statusFilter) : preStatusMatches;

    const hasActiveFilters = !!(searchQuery || stageFilter.length || groupFilter || dateFrom || dateTo || statusFilter);
    const clearFilters = () => {
        setSearchQuery(''); setStageFilter([]); setGroupFilter(''); setDateFrom(''); setDateTo(''); setStatusFilter('');
    };

    const groupMatches = matches.filter(m => m.stage === 'group');
    const playoffMatches = matches.filter(m => m.stage === 'playoff');

    const MatchCard = ({ m }) => {
        const lineup = expandedKey?.startsWith(m.id) ? db.getDebateMatchLineup(m.id) : [];
        const sideSlots = { tasdiqlovchi: ['T1', 'T2', 'T3'], inkor: ['I1', 'I2', 'I3'] };
        return (
            <div className="p-4 border border-gray-100 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                    {m.roundLabel && <span className="px-2 py-0.5 bg-slate-100 text-gray-600 rounded-full text-[10px] font-bold">{m.roundLabel}</span>}
                    {m.groupName && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[10px] font-bold">Guruh {m.groupName}</span>}
                    {m.status === 'finished' && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold">Yakunlangan</span>}
                    {m.status !== 'finished' && classifyMatchStatus(m) === 'ongoing' && (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[10px] font-bold animate-pulse">Davom etayotgan</span>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-wrap text-sm">
                    <button
                        type="button"
                        onClick={() => toggleExpand(m.id, 'tasdiqlovchi')}
                        className="flex items-center gap-1 font-bold text-indigo-700 hover:underline"
                    >
                        {teamName(m.teamTId)} (Tasdiq)
                        {expandedKey === `${m.id}:tasdiqlovchi` ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    {m.status === 'finished' ? (
                        <span className="font-extrabold text-gray-700">{m.scoreT} : {m.scoreI}</span>
                    ) : (
                        <span className="text-xs text-gray-400">vs</span>
                    )}
                    <button
                        type="button"
                        onClick={() => toggleExpand(m.id, 'inkor')}
                        className="flex items-center gap-1 font-bold text-rose-700 hover:underline"
                    >
                        {teamName(m.teamIId)} (Inkor)
                        {expandedKey === `${m.id}:inkor` ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                </div>

                {(expandedKey === `${m.id}:tasdiqlovchi` || expandedKey === `${m.id}:inkor`) && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-2.5 bg-slate-50 rounded-xl">
                        {sideSlots[expandedKey.split(':')[1]].map(slot => {
                            const member = lineup.find(l => l.notiqSlot === slot)?.member;
                            return (
                                <div key={slot} className="text-[11px]">
                                    <div className={`font-bold ${slot.startsWith('T') ? 'text-indigo-600' : 'text-rose-600'}`}>{slot}-notiq</div>
                                    <div className="text-gray-700 truncate">{member?.fullName || 'Belgilanmagan'}</div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                    {canEdit ? (
                        <>
                            <input
                                type="date"
                                value={m.scheduledDate || ''}
                                onChange={e => handleScheduleChange(m.id, 'scheduledDate', e.target.value)}
                                className="px-2.5 py-1.5 border rounded-lg text-xs"
                            />
                            <input
                                type="time"
                                value={m.scheduledStartTime || ''}
                                onChange={e => handleStartTimeChange(m.id, e.target.value)}
                                className="w-24 px-2.5 py-1.5 border rounded-lg text-xs"
                            />
                            <span className="text-xs text-gray-400">—</span>
                            <span className="w-24 px-2.5 py-1.5 border rounded-lg text-xs bg-gray-50 text-gray-500">
                                {fmtTime(m.scheduledEndTime)}
                            </span>
                            <span className="text-[10px] text-gray-400" title={reglamentTooltip}>
                                (avtomatik, {DEBATE_MATCH_TOTAL_DURATION_MINUTES} daqiqalik reglament bo'yicha)
                            </span>
                        </>
                    ) : (
                        <span className="flex items-center gap-3 text-xs text-gray-600">
                            <span className="flex items-center gap-1"><Calendar size={12} className="text-gray-400" />{m.scheduledDate || 'Belgilanmagan'}</span>
                            <span className="flex items-center gap-1"><Clock size={12} className="text-gray-400" />{fmtTime(m.scheduledStartTime)}–{fmtTime(m.scheduledEndTime)}</span>
                        </span>
                    )}
                </div>
            </div>
        );
    };

    if (allMatches.length === 0) {
        return <p className="text-sm text-gray-400 text-center py-8">Hali uchrashuvlar yaratilmagan.</p>;
    }

    return (
        <div className="flex flex-col lg:flex-row gap-6">
            {/* Filters sidebar */}
            <div className="w-full lg:w-64 shrink-0 bg-white rounded-3xl border border-gray-100 shadow-sm p-5 space-y-4 h-fit">
                <h3 className="text-sm font-black text-gray-900 flex items-center gap-1.5"><SlidersHorizontal size={14} /> Filtrlar</h3>

                <FilterSection title="Jamoa nomi">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Qidirish..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                </FilterSection>

                <FilterSection title="Bosqich">
                    <div className="space-y-1.5">
                        {['group', 'playoff'].map(stage => (
                            <label key={stage} className="flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer">
                                <input type="checkbox" checked={stageFilter.includes(stage)} onChange={() => toggleStage(stage)} className="accent-indigo-600" />
                                {STAGE_LABELS[stage]}
                            </label>
                        ))}
                    </div>
                </FilterSection>

                {stageFilter.length !== 1 || stageFilter[0] === 'group' ? (
                    groupNames.length > 0 && (
                        <FilterSection title="Guruh">
                            <div className="flex flex-wrap gap-1.5">
                                {groupNames.map(g => (
                                    <button
                                        key={g}
                                        type="button"
                                        onClick={() => setGroupFilter(f => (f === g ? '' : g))}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                                            groupFilter === g ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                        }`}
                                    >
                                        {g}
                                    </button>
                                ))}
                            </div>
                        </FilterSection>
                    )
                ) : null}

                <FilterSection title="Sana oralig'i">
                    <div className="grid grid-cols-1 gap-2">
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">Boshlanish</label>
                            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs" />
                        </div>
                        <div>
                            <label className="text-[10px] text-gray-400 font-bold">Tugash</label>
                            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs" />
                        </div>
                    </div>
                </FilterSection>

                <button
                    type="button"
                    onClick={clearFilters}
                    disabled={!hasActiveFilters}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    <RotateCcw size={13} /> Tozalash
                </button>
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0 space-y-5">
                <div className="flex items-center gap-2 flex-wrap">
                    {[{ id: '', label: 'Hammasi', count: preStatusMatches.length }, ...Object.entries(STATUS_LABELS).map(([id, label]) => ({ id, label, count: statusCounts[id] || 0 }))].map(s => (
                        <button
                            key={s.id || 'all'}
                            type="button"
                            onClick={() => setStatusFilter(s.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                                statusFilter === s.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            {s.label} ({s.count})
                        </button>
                    ))}
                </div>

                {matches.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">Filtrga mos uchrashuv topilmadi.</p>
                ) : (
                    [{ label: STAGE_LABELS.group, list: groupMatches }, { label: STAGE_LABELS.playoff, list: playoffMatches }].map(section => (
                        section.list.length > 0 && (
                            <div key={section.label} className="space-y-3">
                                <h4 className="font-bold text-sm text-gray-900">{section.label}</h4>
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                                    {section.list.map(m => <MatchCard key={m.id} m={m} />)}
                                </div>
                            </div>
                        )
                    ))
                )}
            </div>
        </div>
    );
};

export default DebateMatchSchedule;
