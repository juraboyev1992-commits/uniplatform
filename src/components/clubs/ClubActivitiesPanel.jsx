import React, { useMemo, useState } from 'react';
import { Calendar, MapPin, Search, CheckCircle2 } from 'lucide-react';
import Badge from '../common/Badge';
import { db } from '../../services/db';
import { useAuth, ROLES } from '../../contexts/AuthContext';

// "Tadbirlar" and "Musobaqalar" merged into one persistent right-side panel (per direct feedback,
// replacing what used to be two separate tabs — ClubEventsTab.jsx/ClubCompetitionsTab.jsx stay on disk,
// unrouted, same convention as every other retired-tab file in this app). Items are clickable
// (onSelectActivity, wired by ClubProfilePage.jsx to open the SAME ActivityRegistrationPanel modal
// EventsCalendar.jsx/EventManagement.jsx already use — this used to be a dead end: nothing here opened
// registration at all, and the "Yaqinlashayotgan tadbirlar" preview card's click-through pointed at
// nonexistent tab ids). Groups by the activity's own lifecycle into exactly 3 buckets, not registration state:
//   - "Davom etmoqda": event.status === 'ongoing', or a competition that has started (now >= startDate)
//     and isn't finished yet (currentRound <= roundsCount — same completion formula
//     CompetitionOverviewTab.jsx already uses elsewhere, reused here rather than reinvented).
//   - "Ochilmagan": event.status === 'upcoming', or a competition whose startDate is still in the future.
//   - "Yopilgan": event.status === 'completed', or a competition where currentRound > roundsCount.
const STATUS_LABELS = { ongoing: 'Davom etmoqda', upcoming: 'Ochilmagan', closed: 'Yopilgan' };
const STATUS_ORDER = ['ongoing', 'upcoming', 'closed'];
const STATUS_VARIANTS = { ongoing: 'warning', upcoming: 'info', closed: 'default' };

const isCompetitionCompleted = (c) => (c.currentRound || 1) > (c.roundsCount || 1);

const classifyEvent = (e) => {
    if (e.status === 'completed') return 'closed';
    if (e.status === 'ongoing') return 'ongoing';
    return 'upcoming';
};

const classifyCompetition = (c) => {
    if (isCompetitionCompleted(c)) return 'closed';
    const startDateTime = c.startDate ? db.combineDateTime(c.startDate, c.startTime) : null;
    if (startDateTime && new Date(startDateTime) > new Date()) return 'upcoming';
    return 'ongoing';
};

// True if the logged-in user is registered for this activity — checks the unified registrations layer
// (own registration, or accepted team-member slot on someone else's team registration) and falls back
// to the legacy participants[] roster for pre-registration-layer seed data (e.g. event e2's 'talaba' entry).
const isUserParticipating = (user, activityId, activityType, rawActivity) => {
    if (!user) return false;
    if (db.getRegistrationForUser(activityId, activityType, user.username)) return true;
    const allRegs = db.getRegistrationsForActivity(activityId, activityType);
    if (allRegs.some(r => (r.teamMembers || []).some(m => m.userId === user.username && m.status === 'accepted'))) return true;
    return (rawActivity.participants || []).some(p => p.userId === user.username);
};

const ClubActivitiesPanel = ({ events, competitions, onSelectActivity }) => {
    const { user } = useAuth();
    // Admin/Rahbariyat are managing the club, not participating in it — the "am I registered" indicator
    // and its filter are student-only (this also covers club coordinators, since coordinator is a
    // club-level role layered on top of the STUDENT app role, not a separate top-level role).
    const isStudentRole = user?.role === ROLES.STUDENT;
    const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'event' | 'competition'
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'ongoing' | 'upcoming' | 'closed'
    const [onlyMine, setOnlyMine] = useState(false);
    const [search, setSearch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const merged = useMemo(() => {
        const fromEvents = events.map(e => ({
            id: `event_${e.id}`, activityId: e.id, type: 'event', name: e.title, date: e.date, location: e.location,
            bucket: classifyEvent(e), isMine: isStudentRole && isUserParticipating(user, e.id, 'event', e), raw: e
        }));
        const fromCompetitions = competitions.map(c => ({
            id: `comp_${c.id}`, activityId: c.id, type: 'competition', name: c.name,
            date: c.startDate ? db.combineDateTime(c.startDate, c.startTime) : c.createdAt,
            location: c.location, bucket: classifyCompetition(c), isMine: isStudentRole && isUserParticipating(user, c.id, 'competition', c), raw: c
        }));
        return [...fromEvents, ...fromCompetitions];
    }, [events, competitions, user, isStudentRole]);

    const filtered = useMemo(() => {
        let rows = merged;
        if (typeFilter !== 'all') rows = rows.filter(r => r.type === typeFilter);
        if (statusFilter !== 'all') rows = rows.filter(r => r.bucket === statusFilter);
        if (onlyMine) rows = rows.filter(r => r.isMine);
        const q = search.trim().toLowerCase();
        if (q) rows = rows.filter(r => r.name.toLowerCase().includes(q));
        if (dateFrom) rows = rows.filter(r => r.date && new Date(r.date) >= new Date(dateFrom));
        if (dateTo) rows = rows.filter(r => r.date && new Date(r.date) <= new Date(`${dateTo}T23:59:59`));
        return rows;
    }, [merged, typeFilter, statusFilter, onlyMine, search, dateFrom, dateTo]);

    const grouped = useMemo(() => {
        const groups = { ongoing: [], upcoming: [], closed: [] };
        filtered.forEach(r => groups[r.bucket]?.push(r));
        Object.values(groups).forEach(list => list.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0)));
        return groups;
    }, [filtered]);

    // Which status sections to render — all 3 normally, or just the one selected via the status filter.
    const visibleStatusKeys = statusFilter === 'all' ? STATUS_ORDER : [statusFilter];

    const hasActiveFilters = typeFilter !== 'all' || statusFilter !== 'all' || onlyMine || !!search || !!dateFrom || !!dateTo;

    return (
        <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto space-y-4">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Tadbir va musobaqalar</h3>

            <div className="space-y-2">
                <div className="flex gap-1.5">
                    {[{ id: 'all', label: 'Hammasi' }, { id: 'event', label: 'Tadbir' }, { id: 'competition', label: 'Musobaqa' }].map(t => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTypeFilter(t.id)}
                            className={`flex-1 px-2 py-1.5 rounded-xl text-[11px] font-bold transition-colors ${
                                typeFilter === t.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {[{ id: 'all', label: 'Hammasi' }, ...STATUS_ORDER.map(key => ({ id: key, label: STATUS_LABELS[key] }))].map(s => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => setStatusFilter(s.id)}
                            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors ${
                                statusFilter === s.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'
                            }`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
                {isStudentRole && (
                    <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-gray-50 dark:bg-gray-900 cursor-pointer">
                        <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} className="accent-indigo-600" />
                        <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">Faqat men ishtirok etayotganlar</span>
                    </label>
                )}
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Nomi bo'yicha qidirish..."
                        className="w-full pl-8 pr-3 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        title="Sanadan"
                        className="px-2 py-1.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-xl text-[11px]"
                    />
                    <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        title="Sanagacha"
                        className="px-2 py-1.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-xl text-[11px]"
                    />
                </div>
                {hasActiveFilters && (
                    <button
                        type="button"
                        onClick={() => { setTypeFilter('all'); setStatusFilter('all'); setOnlyMine(false); setSearch(''); setDateFrom(''); setDateTo(''); }}
                        className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
                    >
                        Filtrlarni tozalash
                    </button>
                )}
            </div>

            {visibleStatusKeys.map(key => (
                <div key={key}>
                    <div className="flex items-center gap-1.5 mb-2">
                        <Badge variant={STATUS_VARIANTS[key]} size="sm">{STATUS_LABELS[key]}</Badge>
                        <span className="text-[11px] text-gray-400">{grouped[key].length}</span>
                    </div>
                    {grouped[key].length === 0 ? (
                        <p className="text-[11px] text-gray-400 pb-2">Yo'q</p>
                    ) : (
                        <div className="space-y-2">
                            {grouped[key].map(item => (
                                <div
                                    key={item.id}
                                    role={onSelectActivity ? 'button' : undefined}
                                    tabIndex={onSelectActivity ? 0 : undefined}
                                    onClick={() => onSelectActivity?.(item)}
                                    onKeyDown={e => { if (onSelectActivity && (e.key === 'Enter' || e.key === ' ')) onSelectActivity(item); }}
                                    className={`px-3 py-2 rounded-xl border transition-colors ${onSelectActivity ? 'cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/40 dark:hover:bg-indigo-900/10' : ''} ${item.isMine ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-gray-100 dark:border-gray-800'}`}
                                >
                                    <div className="flex items-center justify-between gap-1.5 mb-0.5">
                                        <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">{item.name}</p>
                                        <Badge variant={item.type === 'competition' ? 'primary' : 'default'} size="sm">
                                            {item.type === 'competition' ? 'Musobaqa' : 'Tadbir'}
                                        </Badge>
                                    </div>
                                    {item.isMine && (
                                        <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mb-0.5">
                                            <CheckCircle2 size={11} /> Siz ishtirokdasiz
                                        </p>
                                    )}
                                    {item.date && (
                                        <p className="text-[11px] text-gray-400 flex items-center gap-1">
                                            <Calendar size={10} /> {new Date(item.date).toLocaleDateString('uz-UZ')}
                                        </p>
                                    )}
                                    {item.location && (
                                        <p className="text-[11px] text-gray-400 flex items-center gap-1 truncate">
                                            <MapPin size={10} /> {item.location}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default ClubActivitiesPanel;
