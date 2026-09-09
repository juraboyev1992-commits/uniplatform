import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar as CalendarIcon,
    MapPin,
    Users,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Trophy,
    Search,
    SlidersHorizontal,
    RotateCcw,
    Clock,
    LayoutGrid,
    List,
    Layers
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Pagination from '../../components/common/Pagination';
import ActivityQuickViewModal from './ActivityQuickViewModal';
import RegistrationStatusBadge from '../activities/RegistrationStatusBadge';
import MyActivityPanel from './MyActivityPanel';
import { useTabParam } from '../../hooks/useTabParam';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';

// Ro'yxat ko'rinishi va filtrlar sidebar - admin panelning "Tadbirlarni boshqarish"
// tabidagi (CompetitionsManagementTab.jsx) bilan ATAYLAB bir xil qilib qurilgan,
// talaba tomonida ham xuddi shu tanish tajriba bo'lsin deb. Ruxsat farqi shu
// yerda YO'Q - qator bosilganda kim nima ko'rishi/qila olishi mavjud
// canManageEvent (hasClubRole) tekshiruviga bog'liq: koordinator/bosh
// koordinator boshqaruv ish maydoniga o'tadi, oddiy a'zo ro'yxatdan o'tish
// oynasini ko'radi - yangi ruxsat turi qo'shilmadi.
const KIND_TABS = [
    { id: 'events', label: 'Tadbirlar', icon: CalendarIcon },
    { id: 'competitions', label: 'Musobaqa / Turnirlar', icon: Trophy },
];
const KIND_IDS = KIND_TABS.map(t => t.id);

const FILTER_TABS = {
    events: [
        { id: 'all', label: 'Barcha tadbirlar' },
        { id: 'mine', label: 'Mening tadbirlarim' },
        { id: 'archive', label: 'Arxiv' },
    ],
    competitions: [
        { id: 'all', label: 'Barchasi' },
        { id: 'mine', label: 'Mening musobaqa/turnirlarim' },
        { id: 'archive', label: 'Arxiv' },
    ],
};
const FILTER_IDS = ['all', 'mine', 'archive'];

const VIEW_IDS = ['calendar', 'list'];

const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sha', 'Ya']; // Dushanba..Yakshanba
const MONTH_NAMES = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
];

const ROW_STATUS_LABELS = { upcoming: 'Ochilmagan', ongoing: 'Davom etmoqda', closed: 'Yakunlangan' };
const ROW_STATUS_PILL_CLASSES = {
    upcoming: 'bg-blue-50 text-blue-700 border-blue-100',
    ongoing: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    closed: 'bg-rose-50 text-rose-700 border-rose-100'
};
const FORMAT_LABELS = { league: 'Liga', cup: 'Kubok' };
const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 'all'];

// classifyEvent/classifyCompetition - CompetitionsManagementTab.jsx dagi bilan bir
// xil qoida, shu faylga mahalliy nusxasi (loyihadagi mavjud konvensiya - bir necha
// joyda kichik mahalliy nusxa, umumiy util qilib chiqarilmagan).
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

// Ikkala panelda ham AYNI shu komponent ishlaydi.
//
// Admin tomonida ilgari butunlay boshqa ekran turardi va shu sababli bir xil
// ish ikki xil ko'rinardi: talaba filtr paneli, hisobli tablar va saralash
// bilan ishlar, mas'ul esa boshqa tuzilishdagi kalendarda. Nusxa ko'chirish
// o'rniga komponentning o'zi moslashtirildi - aks holda ikkita shakl vaqt
// o'tib bir-biridan chetga chiqib ketardi.
//
// SUKUT QIYMATLAR TALABA XATTI-HARAKATI: yangi proplarning hech biri
// berilmasa, sahifa avvalgidek ishlaydi.
const EventsCalendar = ({
    // 'student' | 'admin'. Faqat talabaga tegishli bloklarni (o'z vazifalari,
    // jamoa belgilari) yoqib-o'chiradi.
    variant = 'student',
    // Yuqoridagi rangli sarlavha. `undefined` - sukut sarlavha chiziladi,
    // `null` - umuman chizilmaydi (admin o'z sarlavhasini yuqorida ko'rsatadi).
    hero = undefined,
    // Boshlang'ich tab. `/admin/competitions` manzilidan kirilganda musobaqa
    // tabi ochilishi kerak.
    defaultKind = 'events',
    // Qator bosilganda. Berilmasa - talaba mantiqi (koordinator ish maydoniga,
    // qolganlar qisqacha ko'rinish oynasiga).
    onOpenActivity = null,
    // Kalendar/Ro'yxat almashtirgichi yonidagi qo'shimcha tugmalar
    // (masalan "+ Yangi tadbir", "Xonalar bandligi").
    headerActions = null,
    // Ro'yxat va kalendar ostida chiziladigan qo'shimcha blok.
    footer = null,
    // Tashqi o'zgarishdan keyin qayta o'qish uchun (masalan tadbir saqlangach).
    refreshToken = 0,
}) => {
    const navigate = useNavigate();
    const { user, hasClubRole } = useAuth();
    const isAdmin = variant === 'admin';

    const [quickViewEntry, setQuickViewEntry] = useState(null);
    const [monthOffset, setMonthOffset] = useState(0);

    const [kind, setKind] = useTabParam(KIND_IDS, defaultKind, 'kind');
    const [filterTab, setFilterTab] = useTabParam(FILTER_IDS, 'all', 'filter');
    const [view, setView] = useTabParam(VIEW_IDS, 'calendar', 'view');

    const [search, setSearch] = useState('');
    const [formatFilter, setFormatFilter] = useState([]); // ['league','cup']
    const [yearFilter, setYearFilter] = useState('');
    const [clubFilter, setClubFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [sortDir, setSortDir] = useState('asc'); // 'asc' = Eng yaqin, 'desc' = Eng yangi
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const clubs = useMemo(() => db.getClubs(), []);
    const clubNameById = useMemo(() => new Map(clubs.map(c => [c.id, c.name])), [clubs]);
    const myIds = useMemo(() => db.getMyRegisteredActivityIds(user?.username), [user?.username]);

    // JAMOA BELGISI — faqat ALOQADOR odamga: sardorga va javob bermagan
    // a'zoga. Boshqa talabaga birovning jamoasi shovqin, shuning uchun
    // ularning kalendarida hech narsa o'zgarmaydi.
    //
    // Rang QIZIL EMAS, sariq: to'lmagan jamoa xato emas, hali tuzatib
    // bo'ladigan holat (loyihadagi bir xil qoida - LadderChecklist.jsx).
    // Qizil FAQAT muddatga 1 kun yoki kam qolganda: rangning o'zgarishi ham
    // ma'lumot beradi, "endi haqiqatan kech bo'lyapti".
    const teamAlerts = useMemo(() => {
        // Mas'ulga birovning jamoasi haqidagi belgi kerak emas.
        if (isAdmin) return new Map();
        const { asCaptain, asInvitee } = db.getTeamAttention(user?.username);
        const map = new Map();
        const put = (item, role) => {
            // Sardor bir vaqtda a'zo bo'la olmaydi, lekin xarita baribir
            // birinchi yozuvni saqlaydi - sardorlik muhimroq.
            const key = `${item.activityType}-${item.activityId}`;
            if (!map.has(key)) map.set(key, { ...item, role });
        };
        asCaptain.forEach(i => put(i, 'captain'));
        asInvitee.forEach(i => put(i, 'invitee'));
        return map;
    }, [user?.username, isAdmin]);

    const alertFor = (row) => teamAlerts.get(`${row.kind}-${row.id}`) || null;
    const alertIsUrgent = (a) => a?.daysLeft != null && a.daysLeft <= 1;

    // RO'YXATDAN O'TISH OCHIQMI — kalendar katakchasidagi kichik belgi uchun.
    // Talaba ilgari buni faqat har bir tadbirni birma-bir ochib ko'rgandagina
    // bilardi. Belgi FAQAT harakat kutilayotganda chiqadi: ro'yxat talab
    // qilinsa, hozir ochiq bo'lsa, joy bo'lsa va odam hali yozilmagan bo'lsa.
    // "Yopilgan" yoki "hali ochilmagan" holat uchun belgi qo'yilmaydi - undan
    // hozir qiladigan ish yo'q, ya'ni u shovqin.
    const needsRegistration = (row) => {
        const a = row.activity;
        if (!a || !a.registrationRequired || row.isMine) return false;
        if (row.statusBucket === 'closed') return false;
        const { state } = db.getRegistrationWindowState(a, row.startDateTime);
        if (state !== 'open') return false;
        const full = a.maxParticipants != null && row.registeredCount >= a.maxParticipants;
        return !full || !!a.waitlistEnabled;
    };

    const events = useMemo(() => db.getEvents(), [refreshToken]);
    const competitions = useMemo(() => db.getCompetitions(), [refreshToken]);

    // Klub koordinatorining roli STUDENT bo'lib qolaveradi (koordinatorlik -
    // a'zolikdagi rol), shuning uchun tadbir/musobaqa ish maydoni shu rolga ham
    // ochiq - u yerda boshqaradi, oddiy a'zo esa shu yerdan ro'yxatdan o'tadi.
    const canManageEvent = (row) =>
        user?.role === 'ADMINISTRATOR' || (row.clubId && hasClubRole(row.clubId, ['coordinator', 'head_coordinator']));

    // Musobaqaning tadbir nusxasi tashlanadi - musobaqaning O'ZI alohida qatorda
    // qo'shiladi, aks holda bitta turnir ikki marta chiqardi.
    const eventRows = useMemo(() => events
        .filter(e => !e.linkedCompetitionId && e.date && (e.moderationStatus || 'approved') === 'approved')
        .map(e => ({
            key: `event-${e.id}`, kind: 'event', id: e.id, title: e.title,
            date: new Date(e.date), location: e.location || null,
            clubId: e.clubId, clubName: clubNameById.get(e.clubId) || null,
            statusBucket: classifyEvent(e), format: null,
            participantCount: (e.registrations || e.participants || []).length,
            isMine: myIds.events.has(e.id),
            collection: db.getActiveCollectionForActivity('event', e.id),
            // Ro'yxat nishoni uchun XOM yozuv ham kerak: nishon
            // registrationRequired, maxParticipants, opensAt/closesAt va
            // locationType ni o'zi o'qiydi. Qayta yozib chiqilsa, ikki nusxa
            // vaqt o'tib bir-biridan chetga chiqib ketardi.
            activity: e,
            startDateTime: e.date,
            registeredCount: db.getRegistrationsForActivity(e.id, 'event')
                .filter(r => r.status === 'registered').length,
        })), [events, clubNameById, myIds]);

    const competitionRows = useMemo(() => competitions
        .filter(c => (c.moderationStatus || 'approved') === 'approved')
        .map(c => ({
            key: `competition-${c.id}`, kind: 'competition', id: c.id, title: c.name,
            date: c.startDate ? new Date(db.combineDateTime(c.startDate, c.startTime)) : null,
            location: c.location || null,
            clubId: c.contextType === 'club' ? c.contextId : null,
            clubName: c.contextType === 'club' ? (clubNameById.get(c.contextId) || null) : null,
            statusBucket: classifyCompetition(c), format: c.format || null,
            participantCount: (c.participants || []).length,
            isMine: myIds.competitions.has(c.id),
            collection: db.getActiveCollectionForActivity('competition', c.id),
            activity: c,
            startDateTime: c.startDate ? db.combineDateTime(c.startDate, c.startTime) : null,
            registeredCount: db.getRegistrationsForActivity(c.id, 'competition')
                .filter(r => r.status === 'registered').length,
        })), [competitions, clubNameById, myIds]);

    const allRows = kind === 'events' ? eventRows : competitionRows;

    useEffect(() => { setPage(1); }, [kind, filterTab, search, formatFilter, yearFilter, clubFilter, dateFrom, dateTo]);

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

    // Barcha filtrlar (qidiruv/format/yil/klub/sana) - filterTab (Barchasi/
    // Mening/Arxiv) DAN mustaqil, tab tugmalaridagi sonlar shu asosda chiqadi.
    const preFilterTabRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        return allRows.filter(r => {
            const matchesSearch = !q || r.title.toLowerCase().includes(q) || (r.clubName || '').toLowerCase().includes(q);
            if (!matchesSearch) return false;
            if (formatFilter.length > 0 && !formatFilter.includes(r.format)) return false;
            if (yearFilter && (!r.date || String(r.date.getFullYear()) !== yearFilter)) return false;
            if (clubFilter && r.clubId !== clubFilter) return false;
            if (dateFrom && (!r.date || r.date < new Date(dateFrom))) return false;
            if (dateTo && (!r.date || r.date > new Date(`${dateTo}T23:59:59`))) return false;
            return true;
        });
    }, [allRows, search, formatFilter, yearFilter, clubFilter, dateFrom, dateTo]);

    const filterTabCounts = useMemo(() => ({
        all: preFilterTabRows.filter(r => r.statusBucket !== 'closed').length,
        mine: preFilterTabRows.filter(r => r.isMine).length,
        archive: preFilterTabRows.filter(r => r.statusBucket === 'closed').length,
    }), [preFilterTabRows]);

    const filteredRows = useMemo(() => {
        let rows = preFilterTabRows;
        if (filterTab === 'all') rows = rows.filter(r => r.statusBucket !== 'closed');
        else if (filterTab === 'mine') rows = rows.filter(r => r.isMine);
        else if (filterTab === 'archive') rows = rows.filter(r => r.statusBucket === 'closed');
        return [...rows].sort((a, b) => {
            const aTime = a.date ? a.date.getTime() : 0;
            const bTime = b.date ? b.date.getTime() : 0;
            return sortDir === 'asc' ? aTime - bTime : bTime - aTime;
        });
    }, [preFilterTabRows, filterTab, sortDir]);

    const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filteredRows.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const paginatedRows = pageSize === 'all' ? filteredRows : filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const hasActiveFilters = !!(search || formatFilter.length || yearFilter || clubFilter || dateFrom || dateTo);
    const clearFilters = () => {
        setSearch(''); setFormatFilter([]); setYearFilter('');
        setClubFilter(''); setDateFrom(''); setDateTo('');
    };
    const toggleFormat = (fmt) => setFormatFilter(prev => prev.includes(fmt) ? prev.filter(f => f !== fmt) : [...prev, fmt]);

    // Koordinator/bosh koordinator boshqaruv ish maydoniga o'tadi, boshqalar
    // uchun tez ko'rish + ro'yxatdan o'tish oynasi (ActivityQuickViewModal) ochiladi.
    const handleEventClick = (entry) => {
        // Chaqiruvchi o'z mantiqini bergan bo'lsa - o'sha. Admin panelida
        // tadbir qisqacha ma'lumot oynasida ochiladi, talabada esa
        // ro'yxatdan o'tish oynasida: bir xil qator, boshqa ish.
        if (onOpenActivity) { onOpenActivity(entry); return; }
        if (canManageEvent(entry)) {
            navigate(entry.kind === 'competition' ? `/student/competitions/${entry.id}` : `/student/events/${entry.id}`);
            return;
        }
        setQuickViewEntry(entry);
    };

    // Kalendar ko'rinishi joriy filtrlar (qidiruv/format/yil/klub/sana + Barchasi/
    // Mening/Arxiv) qo'llangan qatorlar ustida ishlaydi - Ro'yxat ko'rinishi bilan
    // bir xil ma'lumot to'plami, faqat boshqa taqdimotda.
    const today = new Date();
    const viewDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const viewYear = viewDate.getFullYear();
    const viewMonth = viewDate.getMonth();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    // JS getDay(): 0=Sunday..6=Saturday. Week header starts Monday, so shift to 0=Monday..6=Sunday.
    const leadingBlanks = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

    const eventsByDay = useMemo(() => {
        const map = {};
        filteredRows.forEach(r => {
            if (!r.date) return;
            if (r.date.getFullYear() === viewYear && r.date.getMonth() === viewMonth) {
                const day = r.date.getDate();
                if (!map[day]) map[day] = [];
                map[day].push(r);
            }
        });
        return map;
    }, [filteredRows, viewYear, viewMonth]);

    return (
        <div className="space-y-6">
            {hero === undefined ? (
                <div className="bg-gradient-to-r from-purple-600 to-indigo-700 rounded-2xl p-8 text-white shadow-xl flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">Tadbirlar</h1>
                        <p className="text-purple-100 italic">Universitet hayotidagi barcha qiziqarli voqealardan xabardor bo'ling</p>
                    </div>
                </div>
            ) : hero}

            {/* Menga berilgan vazifalar va o'z ishtirokim. Ikkalasi ham bo'sh bo'lsa
                komponent hech narsa ko'rsatmaydi - bo'sh karta osilib turmasin.
                Mas'ulga ko'rsatilmaydi: bu blok "mendan nima kutilyapti" degan
                savolga javob beradi, u esa boshqa odamlarning ishini boshqaradi. */}
            {!isAdmin && <MyActivityPanel />}

            <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Tadbirlar / Musobaqa-Turnirlar */}
                <div className="inline-flex bg-white p-1 rounded-2xl border border-gray-100 shadow-sm">
                    {KIND_TABS.map(t => {
                        const active = kind === t.id;
                        return (
                            <button
                                key={t.id} type="button" onClick={() => setKind(t.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                                    active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-gray-500 hover:bg-gray-50'
                                }`}
                            >
                                <t.icon size={15} /> {t.label}
                            </button>
                        );
                    })}
                </div>

                {/* Qo'shimcha tugmalar (admin: yaratish, xonalar bandligi) va
                    Kalendar/Ro'yxat almashtirgichi bir qatorda. */}
                <div className="flex items-center gap-2 flex-wrap">
                {headerActions}
                <div className="flex bg-gray-100 rounded-2xl p-1 w-fit">
                    <button
                        type="button"
                        onClick={() => setView('calendar')}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                            view === 'calendar' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                        }`}
                    >
                        <LayoutGrid size={14} /> Kalendar
                    </button>
                    <button
                        type="button"
                        onClick={() => setView('list')}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                            view === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                        }`}
                    >
                        <List size={14} /> Ro'yxat
                    </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Filtrlar sidebar */}
                <div className="w-full lg:w-64 shrink-0 bg-white rounded-3xl border border-gray-100 shadow-sm p-5 space-y-4 h-fit">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black text-gray-900 flex items-center gap-1.5"><SlidersHorizontal size={14} /> Filtrlar</h3>
                    </div>

                    <FilterSection title={kind === 'events' ? 'Tadbir nomi' : 'Musobaqa nomi'}>
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

                    {kind === 'competitions' && (
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

                {/* Asosiy qism */}
                <div className="flex-1 min-w-0 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            {FILTER_TABS[kind].map(t => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setFilterTab(t.id)}
                                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                                        filterTab === t.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    {t.label} ({filterTabCounts[t.id]})
                                </button>
                            ))}
                        </div>
                        {view === 'list' && (
                            <select
                                value={sortDir}
                                onChange={e => setSortDir(e.target.value)}
                                className="px-3.5 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 bg-white outline-none"
                            >
                                <option value="asc">Eng yaqin</option>
                                <option value="desc">Eng yangi</option>
                            </select>
                        )}
                    </div>

                    {view === 'calendar' ? (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <Card className="lg:col-span-3 p-0 overflow-hidden">
                                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                                    <h2 className="text-xl font-bold text-gray-800">{MONTH_NAMES[viewMonth]} {viewYear}</h2>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={() => setMonthOffset(m => m - 1)} />
                                        <Button variant="secondary" size="sm" onClick={() => setMonthOffset(0)}>Bugun</Button>
                                        <Button variant="ghost" size="sm" icon={ChevronRight} onClick={() => setMonthOffset(m => m + 1)} />
                                    </div>
                                </div>
                                <div className="p-4 bg-gray-50/50 min-h-[400px]">
                                    <div className="grid grid-cols-7 gap-px mb-1">
                                        {WEEKDAYS.map(d => (
                                            <div key={d} className="text-center text-xs font-bold text-gray-400 py-2 uppercase">{d}</div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7 gap-2">
                                        {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`blank-${i}`} />)}
                                        {Array.from({ length: daysInMonth }).map((_, i) => {
                                            const dayNum = i + 1;
                                            const isToday = monthOffset === 0 && dayNum === today.getDate();
                                            const dayRows = eventsByDay[dayNum] || [];
                                            return (
                                                <div
                                                    key={dayNum}
                                                    className={`h-24 p-2 rounded-xl border border-gray-100 transition-all overflow-hidden ${
                                                        isToday ? 'bg-indigo-50 border-indigo-200' : 'bg-white hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <span className={`text-sm font-bold ${isToday ? 'text-indigo-600' : 'text-gray-400'}`}>{dayNum}</span>
                                                    {dayRows.slice(0, 2).map(r => {
                                                        const alert = alertFor(r);
                                                        const urgent = alertIsUrgent(alert);
                                                        const openReg = needsRegistration(r);
                                                        return (
                                                            <div
                                                                key={r.key}
                                                                title={[
                                                                    r.collection ? `${r.title} - ${r.collection.name}` : r.title,
                                                                    openReg && "Ro'yxatdan o'tish ochiq",
                                                                    alert && (alert.role === 'captain'
                                                                        ? `Jamoangiz to'lmagan: ${alert.accepted}/${alert.need}`
                                                                        : 'Jamoa taklifiga javob bermagansiz'),
                                                                ].filter(Boolean).join(' — ')}
                                                                className={`mt-1 p-1 text-[10px] text-white rounded truncate cursor-pointer flex items-center gap-1 ${
                                                                    urgent ? 'bg-red-600'
                                                                        : alert ? 'bg-amber-500 ring-1 ring-amber-700'
                                                                        : r.kind === 'competition' ? 'bg-amber-500' : 'bg-indigo-600'
                                                                }`}
                                                                onClick={() => handleEventClick(r)}
                                                            >
                                                                {/* Belgi RANG bilangina berilmaydi: rang ko'rmaydigan
                                                                    odam uchun ham nishon kerak, ustiga musobaqa
                                                                    qatori allaqachon sariq - faqat rang bilan
                                                                    ajratib bo'lmasdi. */}
                                                                {alert && <Users size={9} className="shrink-0" />}
                                                                {!alert && r.collection && <Layers size={9} className="shrink-0" />}
                                                                <span className="truncate">{r.title}</span>
                                                                {/* RO'YXAT OCHIQ - kichik oq nuqta. Matn
                                                                    sig'maydi (katakcha 10px shrift), nuqta
                                                                    esa "bu yerda men uchun ish bor" degan
                                                                    savolga javob beradi. Ma'nosi `title`
                                                                    da yozilgan, ya'ni nuqta yolg'iz
                                                                    tashuvchi emas. */}
                                                                {openReg && (
                                                                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                    {dayRows.length > 2 && (
                                                        <div className="mt-0.5 text-[9px] text-gray-400 font-semibold">+{dayRows.length - 2} yana</div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </Card>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3">
                                {paginatedRows.map(row => (
                                    <div
                                        key={row.key}
                                        onClick={() => handleEventClick(row)}
                                        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 hover:shadow-md hover:border-indigo-200 cursor-pointer transition-all"
                                    >
                                        <div className="w-20 shrink-0">
                                            <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold border ${ROW_STATUS_PILL_CLASSES[row.statusBucket]}`}>
                                                {ROW_STATUS_LABELS[row.statusBucket]}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-gray-900 truncate">{row.title}</p>
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
                                                {row.date && (
                                                    <span className="flex items-center gap-1.5"><CalendarIcon size={12} /> {row.date.toLocaleDateString('uz-UZ')}</span>
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
                                                {row.isMine && <Badge variant="success" size="sm">Men qatnashaman</Badge>}
                                                {/* RO'YXAT HOLATI — ochiq / hali ochilmagan / to'lgan /
                                                    yopilgan, va bo'sh joy soni yoki qolgan vaqt.
                                                    Ro'yxatdan o'tgan odamga ko'rsatilmaydi: uning ishi
                                                    tugagan, "3 ta bo'sh joy" unga hech narsa bermaydi.
                                                    Ro'yxat talab qilinmasa nishon o'zi hech narsa
                                                    chizmaydi (faqat Online/Gibrid bo'lsa - o'shani). */}
                                                {!row.isMine && row.activity && (
                                                    <RegistrationStatusBadge
                                                        activity={row.activity}
                                                        startDateTime={row.startDateTime}
                                                        registeredCount={row.registeredCount}
                                                    />
                                                )}
                                                {/* Ro'yxat ko'rinishida belgi MATN bilan - bu yerda
                                                    joy bor, ya'ni "nima qilishim kerak" degan savolga
                                                    kalendar katakchasidan ko'ra to'liqroq javob beriladi. */}
                                                {(() => {
                                                    const alert = alertFor(row);
                                                    if (!alert) return null;
                                                    const urgent = alertIsUrgent(alert);
                                                    return (
                                                        <Badge variant={urgent ? 'danger' : 'warning'} size="sm">
                                                            {alert.role === 'captain'
                                                                ? `Jamoangiz to'lmagan: ${alert.accepted}/${alert.need}`
                                                                : 'Jamoa taklifi — javob bering'}
                                                            {urgent && (alert.daysLeft <= 0 ? ' · bugun' : ' · ertaga')}
                                                        </Badge>
                                                    );
                                                })()}
                                                {row.collection && (
                                                    <button
                                                        type="button"
                                                        onClick={e => { e.stopPropagation(); navigate(`/student/event-collections/${row.collection.id}`); }}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                                                    >
                                                        <Layers size={11} /> {row.collection.name}
                                                    </button>
                                                )}
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
                                        {kind === 'events' ? "Tadbirlar topilmadi" : "Musobaqalar topilmadi"}
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
                        </>
                    )}
                </div>
            </div>

            {footer}

            {/* Qisqacha ko'rinish oynasi faqat talaba yo'lida ochiladi -
                adminda uning o'rniga o'z oynasi (tafsilot + tahrirlash)
                chaqiruvchi tomonda turadi. */}
            <ActivityQuickViewModal
                entry={quickViewEntry}
                onClose={() => setQuickViewEntry(null)}
                user={user}
                hasClubRole={hasClubRole}
                clubNameById={clubNameById}
            />
        </div>
    );
};

export default EventsCalendar;
