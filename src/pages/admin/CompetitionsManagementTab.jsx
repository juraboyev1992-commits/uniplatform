import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Search, Calendar, Clock, MapPin, Users, ChevronRight, ChevronDown,
    CalendarDays, Trophy, RotateCcw, SlidersHorizontal
} from 'lucide-react';
import Badge from '../../components/common/Badge';
import Pagination from '../../components/common/Pagination';
import { db } from '../../services/db';

// "Tanlovlarni boshqarish" — visual layout adapted from a reference tournament-listing page (per direct
// feedback), but every filter/field here is backed by a REAL UniPlatform field, nothing copied blindly:
//   - "Format" (Liga/Kubok)  <- competition.format ('league'|'cup', set by TournamentCreateWizard)
//   - "Yil"                  <- real event.date / competition.startDate years, counted from actual rows
//   - "Klub"                 <- the reference's "Hudud" (region) has no UniPlatform equivalent; a club
//                               is the closest real "who organized this" dimension we have
//   - "Sana oralig'i"        <- real date-range filter over the same date fields
// The reference's "O'yin turi" and "Toifa" (Professional/Oliy ta'lim/...) filters were dropped — nothing
// in db.js backs them, and fabricating a filter with no real data would violate the same
// no-Math.random()-scores principle the rest of this session has followed.
const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 'all'];

const isCompetitionCompleted = (c) => (c.currentRound || 1) > (c.roundsCount || 1);
const classifyCompetition = (c) => {
    if (isCompetitionCompleted(c)) return 'closed';
    const startDateTime = c.startDate ? db.combineDateTime(c.startDate, c.startTime) : null;
    if (startDateTime && new Date(startDateTime) > new Date()) return 'upcoming';
    return 'ongoing';
};
const classifyEvent = (e) => {
    if (e.status === 'completed') return 'closed';
    if (e.status === 'ongoing') return 'ongoing';
    return 'upcoming';
};
const STATUS_LABELS = { upcoming: 'Ochilmagan', ongoing: 'Davom etmoqda', closed: 'Yakunlangan' };
const STATUS_PILL_CLASSES = {
    upcoming: 'bg-blue-50 text-blue-700 border-blue-100',
    ongoing: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    closed: 'bg-rose-50 text-rose-700 border-rose-100'
};
const FORMAT_LABELS = { league: 'Liga', cup: 'Kubok' };

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

const CompetitionsManagementTab = () => {
    const navigate = useNavigate();

    const [subTab, setSubTab] = useState('competitions'); // 'events' | 'competitions'
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [formatFilter, setFormatFilter] = useState([]); // ['league','cup']
    const [yearFilter, setYearFilter] = useState('');
    const [clubFilter, setClubFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [sortDir, setSortDir] = useState('desc'); // 'desc' = Eng yangi, 'asc' = Eng eski
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const events = useMemo(() => db.getEvents(), []);
    const competitions = useMemo(() => db.getCompetitions(), []);
    const clubs = useMemo(() => db.getClubs(), []);
    const clubNameById = useMemo(() => new Map(clubs.map(c => [c.id, c.name])), [clubs]);

    const eventRows = useMemo(() => events.map(e => ({
        id: e.id, kind: 'event', title: e.title, date: new Date(e.date),
        location: e.location, statusBucket: classifyEvent(e),
        participantCount: (e.participants || []).length,
        clubId: e.clubId, clubName: clubNameById.get(e.clubId) || null,
        format: null
    })), [events, clubNameById]);

    const competitionRows = useMemo(() => competitions.map(c => ({
        id: c.id, kind: 'competition', title: c.name,
        date: c.startDate ? new Date(db.combineDateTime(c.startDate, c.startTime)) : null,
        location: c.location, statusBucket: classifyCompetition(c),
        participantCount: (c.participants || []).length,
        clubId: c.contextType === 'club' ? c.contextId : null,
        clubName: c.contextType === 'club' ? (clubNameById.get(c.contextId) || null) : null,
        format: c.format || null
    })), [competitions, clubNameById]);

    const allRows = subTab === 'events' ? eventRows : competitionRows;

    useEffect(() => { setPage(1); }, [subTab, search, statusFilter, formatFilter, yearFilter, clubFilter, dateFrom, dateTo]);

    const yearOptions = useMemo(() => {
        const counts = new Map();
        allRows.forEach(r => {
            if (!r.date) return;
            const y = r.date.getFullYear();
            counts.set(y, (counts.get(y) || 0) + 1);
        });
        return Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
    }, [allRows]);

    const clubOptions = useMemo(() => {
        const ids = new Set(allRows.map(r => r.clubId).filter(Boolean));
        return clubs.filter(c => ids.has(c.id)).sort((a, b) => a.name.localeCompare(b.name));
    }, [allRows, clubs]);

    // Everything except the status filter — feeds the status pill counts, so "Hammasi (N)" always
    // reflects the OTHER active filters (search/format/yil/klub/sana), same as the reference.
    const preStatusRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        return allRows.filter(r => {
            if (q && !r.title.toLowerCase().includes(q) && !(r.clubName || '').toLowerCase().includes(q)) return false;
            if (formatFilter.length > 0 && !formatFilter.includes(r.format)) return false;
            if (yearFilter && (!r.date || String(r.date.getFullYear()) !== yearFilter)) return false;
            if (clubFilter && r.clubId !== clubFilter) return false;
            if (dateFrom && (!r.date || r.date < new Date(dateFrom))) return false;
            if (dateTo && (!r.date || r.date > new Date(`${dateTo}T23:59:59`))) return false;
            return true;
        });
    }, [allRows, search, formatFilter, yearFilter, clubFilter, dateFrom, dateTo]);

    const statusCounts = useMemo(() => {
        const counts = { upcoming: 0, ongoing: 0, closed: 0 };
        preStatusRows.forEach(r => { counts[r.statusBucket] = (counts[r.statusBucket] || 0) + 1; });
        return counts;
    }, [preStatusRows]);

    const filteredRows = useMemo(() => {
        const rows = statusFilter ? preStatusRows.filter(r => r.statusBucket === statusFilter) : preStatusRows;
        return [...rows].sort((a, b) => {
            const aTime = a.date ? a.date.getTime() : 0;
            const bTime = b.date ? b.date.getTime() : 0;
            return sortDir === 'asc' ? aTime - bTime : bTime - aTime;
        });
    }, [preStatusRows, statusFilter, sortDir]);

    const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filteredRows.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const paginatedRows = pageSize === 'all' ? filteredRows : filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const hasActiveFilters = !!(search || statusFilter || formatFilter.length || yearFilter || clubFilter || dateFrom || dateTo);
    const clearFilters = () => {
        setSearch(''); setStatusFilter(''); setFormatFilter([]); setYearFilter('');
        setClubFilter(''); setDateFrom(''); setDateTo('');
    };

    const toggleFormat = (fmt) => setFormatFilter(prev => prev.includes(fmt) ? prev.filter(f => f !== fmt) : [...prev, fmt]);

    const handleOpenRow = (row) => {
        navigate(row.kind === 'event' ? '/admin/events' : `/admin/competitions/${row.id}`);
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6">
            {/* Filters sidebar */}
            <div className="w-full lg:w-64 shrink-0 bg-white rounded-3xl border border-gray-100 shadow-sm p-5 space-y-4 h-fit">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-gray-900 flex items-center gap-1.5"><SlidersHorizontal size={14} /> Filtrlar</h3>
                </div>

                <FilterSection title={subTab === 'events' ? 'Tadbir nomi' : 'Tanlov nomi'}>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Nomi yoki klub bo'yicha qidirish..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                </FilterSection>

                {subTab === 'competitions' && (
                    <FilterSection title="Format">
                        <div className="space-y-1.5">
                            {['league', 'cup'].map(fmt => (
                                <label key={fmt} className="flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer">
                                    <input type="checkbox" checked={formatFilter.includes(fmt)} onChange={() => toggleFormat(fmt)} className="accent-indigo-600" />
                                    {FORMAT_LABELS[fmt]}
                                </label>
                            ))}
                        </div>
                    </FilterSection>
                )}

                <FilterSection title="Yil">
                    <div className="flex flex-wrap gap-1.5">
                        {yearOptions.map(([year, count]) => (
                            <button
                                key={year}
                                type="button"
                                onClick={() => setYearFilter(f => f === String(year) ? '' : String(year))}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                                    yearFilter === String(year) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                {year} ({count})
                            </button>
                        ))}
                        {yearOptions.length === 0 && <p className="text-[11px] text-gray-400">Ma'lumot yo'q</p>}
                    </div>
                </FilterSection>

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

                <FilterSection title="Klub">
                    <select
                        value={clubFilter}
                        onChange={e => setClubFilter(e.target.value)}
                        className="w-full px-2.5 py-2 border border-gray-200 rounded-xl text-xs bg-white"
                    >
                        <option value="">Barcha klublar</option>
                        {clubOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
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
            <div className="flex-1 min-w-0 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-black text-gray-900">Barcha tadbir va musobaqalar</h2>
                        <p className="text-sm text-gray-400">{filteredRows.length} ta {subTab === 'events' ? 'tadbir' : 'tanlov'} topildi</p>
                    </div>
                    <div className="flex bg-gray-100 rounded-xl p-1">
                        <button
                            type="button"
                            onClick={() => setSubTab('events')}
                            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${subTab === 'events' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <CalendarDays size={14} /> Tadbirlar
                        </button>
                        <button
                            type="button"
                            onClick={() => setSubTab('competitions')}
                            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${subTab === 'competitions' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Trophy size={14} /> Tanlovlar
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setStatusFilter('')}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                                !statusFilter ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            Hammasi ({preStatusRows.length})
                        </button>
                        {['ongoing', 'upcoming', 'closed'].map(key => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setStatusFilter(f => f === key ? '' : key)}
                                className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                                    statusFilter === key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                {STATUS_LABELS[key]} ({statusCounts[key] || 0})
                            </button>
                        ))}
                    </div>
                    <select
                        value={sortDir}
                        onChange={e => setSortDir(e.target.value)}
                        className="px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 bg-white outline-none"
                    >
                        <option value="desc">Eng yangi</option>
                        <option value="asc">Eng eski</option>
                    </select>
                </div>

                <div className="space-y-3">
                    {paginatedRows.map(row => (
                        <div
                            key={`${row.kind}_${row.id}`}
                            onClick={() => handleOpenRow(row)}
                            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 hover:shadow-md hover:border-indigo-200 cursor-pointer transition-all"
                        >
                            <div className="w-20 shrink-0">
                                <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold border ${STATUS_PILL_CLASSES[row.statusBucket]}`}>
                                    {STATUS_LABELS[row.statusBucket]}
                                </span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-gray-900 truncate">{row.title}</p>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
                                    {row.date && (
                                        <span className="flex items-center gap-1.5"><Calendar size={12} /> {row.date.toLocaleDateString('uz-UZ')}</span>
                                    )}
                                    {row.date && (row.date.getHours() || row.date.getMinutes()) ? (
                                        <span className="flex items-center gap-1.5"><Clock size={12} /> {row.date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</span>
                                    ) : null}
                                    {row.location && (
                                        <span className="flex items-center gap-1.5 truncate"><MapPin size={12} /> {row.location}</span>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                    {row.clubName && <Badge variant="default" size="sm">{row.clubName}</Badge>}
                                    {row.format && <Badge variant="primary" size="sm">{FORMAT_LABELS[row.format]}</Badge>}
                                </div>
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                                <span className="flex items-center gap-1.5 text-sm text-gray-500">
                                    <Users size={15} /> {row.participantCount}
                                </span>
                                <ChevronRight size={18} className="text-gray-300" />
                            </div>
                        </div>
                    ))}
                    {paginatedRows.length === 0 && (
                        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
                            {subTab === 'events' ? "Tadbirlar topilmadi" : "Tanlovlar topilmadi"}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setPage}
                        pageSize={pageSize}
                        onPageSizeChange={size => { setPageSize(size); setPage(1); }}
                        pageSizeOptions={PAGE_SIZE_OPTIONS}
                        totalItems={filteredRows.length}
                    />
                </div>
            </div>
        </div>
    );
};

export default CompetitionsManagementTab;
