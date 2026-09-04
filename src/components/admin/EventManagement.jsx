import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar as CalendarIcon, Plus, Users, Clock, MapPin,
    ChevronLeft, ChevronRight, GraduationCap, Trophy, UsersRound, Zap, TrendingUp
} from 'lucide-react';
import { format, startOfWeek, addDays, addMonths, startOfMonth, endOfMonth, endOfWeek, isSameMonth, isToday, isSameDay } from 'date-fns';
import { uz } from 'date-fns/locale';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import CopyableId from '../common/CopyableId';
import EventEditForm from './EventEditForm';
import { DEFAULT_ACTIVITY_LEVEL } from '../../config/activityLifecycle';
import VenueOccupancyCalendar from '../common/VenueOccupancyCalendar';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { getRegistrationWindowIssues } from '../activities/RegistrationSettingsFields';

const EMPTY_FORM = {
    title: '', description: '', date: '', time: '', endTime: '', clubId: '', location: '', locationType: 'physical',
    registrationRequired: false, registrationType: 'individual', maxParticipants: null,
    teamMinSize: null, teamMaxSize: null, teamCompositionRule: 'mixed', teamCourseRule: 'mixed',
    waitlistEnabled: false, approvalRequired: false, registrationOpensAt: '', registrationClosesAt: '',
    // Tadbir turi va darajasi. Daraja avtomatik ballga koeffitsient beradi va
    // "xalqaro faoliyat" ko'rsatkichini aniqlaydi - bugungacha u tadbir NOMIDAN
    // taxmin qilinardi, chunki bunday maydon yo'q edi.
    eventType: '', level: DEFAULT_ACTIVITY_LEVEL,
    // 11-mezon: tadbir ma'naviy-ma'rifiy sohagami. Tizim buni tadbir turidan
    // TAXMIN QILMAYDI - seminar huquqiy ham, ma'naviy ham bo'lishi mumkin.
    // Tasnifni tadbirni yaratayotgan odam bir marta belgilaydi.
    isSpiritual: false
};

const WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sha', 'Ya']; // same abbreviation set as student/EventsCalendar.jsx
const MONTH_NAMES = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
];
// Short forms for the week-range label ("17 Avg - 23 Avg 2026").
const MONTH_SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

const CALENDAR_VIEWS = [
    { id: 'day', label: 'Kunlik' },
    { id: 'week', label: 'Haftalik' },
    { id: 'month', label: 'Oylik' },
    { id: 'year', label: 'Yillik' }
];

const EventManagement = () => {
    const navigate = useNavigate();
    const { user, hasClubRole } = useAuth();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [isEventModalOpen, setIsEventModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [events, setEvents] = useState([]);
    // Kalendar ko'rsatadigan to'liq to'plam: tadbir + musobaqa + Tur.
    // `events` esa tahrirlash oynasi va statistika uchun asl tadbirlar ro'yxati.
    const [calendarEntries, setCalendarEntries] = useState([]);
    const [clubs, setClubs] = useState([]);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [scoreData, setScoreData] = useState({ userId: '', score: 0, placement: '' });
    const [saveError, setSaveError] = useState('');
    const [calendarView, setCalendarView] = useState('month');
    // Kunlik/Haftalik/Oylik/Yillik for the Tadbirlar calendar itself. `currentMonth` doubles as the anchor
    // date for every mode (not just months) — navigation steps by day/week/month/year accordingly.
    const [calMode, setCalMode] = useState('month');

    const locationConflict = useMemo(() => {
        if (!formData.location.trim() || !formData.date) return null;
        return db.checkLocationConflict(formData.location, db.combineDateTime(formData.date, formData.time), selectedEvent?.id);
    }, [formData.location, formData.date, formData.time, selectedEvent]);

    // Right-sidebar data (spec: "Bugungi tadbirlar" list + "Tadbirlar bo'yicha statistika" cards) —
    // pure derivations from the same `events`/`clubs` state already loaded above, no new db.js reads.
    const todayEvents = useMemo(
        () => calendarEntries
            .filter(e => isSameDay(new Date(e.date), new Date()))
            .sort((a, b) => new Date(a.date) - new Date(b.date)),
        [calendarEntries]
    );
    const pendingReports = useMemo(() => db.getActivitiesWithoutReport(), [events]);
    const students = useMemo(() => db.getMockStudents(), []);
    const facultyCount = useMemo(() => new Set(students.map(s => s.faculty)).size, [students]);

    // FAOL / ARXIV RO'YXATLARI - kalendar faqat "qachon" savoliga javob beradi,
    // lekin "yaqinda nima bor" yoki "o'tganlarni qidirish" uchun uzoq oy-oy
    // sirg'anish kerak edi. `status` allaqachon bor (upcoming/completed) -
    // shu asosda ikkita to'g'ridan-to'g'ri ro'yxat: kelayotganlar (eng
    // yaqini birinchi) va yakunlanganlar (eng so'nggisi birinchi).
    const activeEvents = useMemo(
        () => events.filter(e => e.status !== 'completed' && e.status !== 'cancelled')
            .sort((a, b) => new Date(a.date) - new Date(b.date)),
        [events]
    );
    const archivedEvents = useMemo(
        () => events.filter(e => e.status === 'completed' || e.status === 'cancelled')
            .sort((a, b) => new Date(b.date) - new Date(a.date)),
        [events]
    );

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        setEvents(db.getEvents());
        setCalendarEntries(db.getCalendarEntries());
        // Arxivlangan klub tanlash ro'yxatida ko'rinmaydi: unda yangi
        // tadbir boshlanmasligi kerak.
        setClubs(db.getActiveClubs());
    };

    const handleOpenModal = (event = null, date = new Date()) => {
        setSaveError('');
        if (event) {
            const [datePart, timePart] = event.date.split('T');
            setSelectedEvent(event);
            setFormData({
                title: event.title, description: event.description, date: datePart,
                time: timePart ? timePart.slice(0, 5) : '', endTime: event.endTime || '',
                clubId: event.clubId, location: event.location || '', locationType: event.locationType || 'physical',
                registrationRequired: !!event.registrationRequired,
                registrationType: event.registrationType || 'individual',
                maxParticipants: event.maxParticipants ?? null,
                teamMinSize: event.teamMinSize ?? null,
                teamMaxSize: event.teamMaxSize ?? null,
                teamCompositionRule: event.teamCompositionRule || 'mixed',
                teamCourseRule: event.teamCourseRule || 'mixed',
                waitlistEnabled: !!event.waitlistEnabled,
                approvalRequired: !!event.approvalRequired,
                registrationOpensAt: event.registrationOpensAt || '',
                registrationClosesAt: event.registrationClosesAt || '',
                eventType: event.eventType || '',
                level: event.level || DEFAULT_ACTIVITY_LEVEL,
                isSpiritual: !!event.isSpiritual
            });
        } else {
            setSelectedEvent(null);
            setFormData({ ...EMPTY_FORM, date: format(date, 'yyyy-MM-dd'), clubId: clubs[0]?.id || '' });
        }
        setIsEventModalOpen(true);
    };

    const handleSaveEvent = async () => {
        setSaveError('');
        // Now a real FK to clubs — a mock-era gap (an empty clubId used to save silently) surfaces as a
        // hard Postgres error otherwise. Caught here with a clear message instead.
        if (!formData.clubId) {
            setSaveError('Klubni tanlang.');
            return;
        }
        const combinedDate = db.combineDateTime(formData.date, formData.time);
        if (locationConflict) {
            setSaveError(`"${formData.location}" shu vaqtda band: "${locationConflict.title}" tadbiri uchun allaqachon band qilingan.`);
            return;
        }
        // isNew only when genuinely creating — editing an event that already happened must stay possible.
        const windowIssues = getRegistrationWindowIssues(formData, { isNew: !selectedEvent });
        if (windowIssues.length > 0) {
            setSaveError(windowIssues[0]);
            return;
        }
        const payload = {
            title: formData.title,
            description: formData.description,
            date: combinedDate,
            endTime: formData.endTime || null,
            clubId: formData.clubId,
            location: formData.location,
            locationType: formData.locationType,
            registrationRequired: formData.registrationRequired,
            registrationType: formData.registrationRequired ? formData.registrationType : undefined,
            maxParticipants: formData.registrationRequired ? formData.maxParticipants : null,
            // Pre-existing gap (predates the backend migration) — RegistrationSettingsFields.jsx has
            // captured these since the team-registration wave shipped, but this payload builder never
            // forwarded them, so activity.teamMinSize/teamMaxSize was always undefined and
            // registerForActivity's size checks silently never fired for plain events.
            teamMinSize: formData.registrationRequired ? formData.teamMinSize : null,
            teamMaxSize: formData.registrationRequired ? formData.teamMaxSize : null,
            teamCompositionRule: formData.registrationRequired ? formData.teamCompositionRule : 'mixed',
            teamCourseRule: formData.registrationRequired ? formData.teamCourseRule : 'mixed',
            waitlistEnabled: formData.registrationRequired ? !!formData.waitlistEnabled : false,
            approvalRequired: formData.registrationRequired ? !!formData.approvalRequired : false,
            registrationOpensAt: formData.registrationRequired ? formData.registrationOpensAt : '',
            registrationClosesAt: formData.registrationRequired ? formData.registrationClosesAt : '',
            eventType: formData.eventType || null,
            level: formData.level || DEFAULT_ACTIVITY_LEVEL,
            isSpiritual: !!formData.isSpiritual
        };
        try {
            if (selectedEvent) {
                await db.updateEvent(selectedEvent.id, payload);
            } else {
                // This page is currently admin-only (App.jsx's /admin/events route), so actingRole always
                // resolves to ADMINISTRATOR today — passed anyway so nothing needs revisiting if a
                // coordinator ever gets a path to this same form.
                await db.createEvent({ ...payload, status: 'upcoming', actingRole: user?.role, actingUsername: user?.username });
            }
            setIsEventModalOpen(false);
            loadData();
        } catch (err) {
            setSaveError(err?.message || "Tadbirni saqlashda xatolik yuz berdi.");
        }
    };

    // O'chirish ikki bosqichli: birinchi bosish tasdiqlashni so'raydi. Modal
    // ichida `confirm()` ishlatmaymiz - u brauzerga bog'liq va oynani bloklaydi.
    const [deleteArmed, setDeleteArmed] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    const handleDeleteEvent = async () => {
        if (!selectedEvent) return;
        if (!deleteArmed) { setDeleteArmed(true); setDeleteError(''); return; }
        try {
            await db.deleteEvent(selectedEvent.id);
            setIsEventModalOpen(false);
            setDeleteArmed(false);
            loadData();
        } catch (err) {
            setDeleteError(err?.message || "Tadbirni o'chirishda xatolik yuz berdi.");
            setDeleteArmed(false);
        }
    };

    const handleAssignScore = async () => {
        if (!selectedEvent || !scoreData.userId) return;

        // Update the event participant
        const updatedParticipants = [...(selectedEvent.participants || [])];
        const pIndex = updatedParticipants.findIndex(p => p.userId === scoreData.userId);

        if (pIndex > -1) {
            updatedParticipants[pIndex] = { ...updatedParticipants[pIndex], ...scoreData, attended: true };
        } else {
            updatedParticipants.push({ ...scoreData, attended: true });
        }

        await db.updateEvent(selectedEvent.id, { participants: updatedParticipants });

        // Add score to user's global points
        const club = db.getClubById(selectedEvent.clubId);
        const pointsWithModifier = Math.round(scoreData.score * (club?.pointsModifier || 1.0));
        db.addScore(scoreData.userId, pointsWithModifier, `${selectedEvent.title} tadbiri natijasi`, selectedEvent.id);

        alert(`Natija saqlandi: ${pointsWithModifier} ball berildi.`);
        setScoreData({ userId: '', score: 0, placement: '' });
        loadData();
        setSelectedEvent(db.getEvents().find(e => e.id === selectedEvent.id)); // refresh local state
    };

    const renderHero = () => (
        <div className="relative bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl overflow-hidden">
            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                        <CalendarIcon className="w-7 h-7" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black">Tadbirlar Kalendari</h1>
                        <p className="text-white/70 text-sm mt-1">Universitet hayotidagi barcha qiziqarli voqealardan xabardor bo'ling</p>
                    </div>
                </div>
                <Button
                    variant="secondary"
                    className="bg-white text-indigo-700 hover:bg-white/90 shrink-0"
                    icon={Plus}
                    onClick={() => handleOpenModal(null, new Date())}
                >
                    Yangi Tadbir
                </Button>
            </div>
        </div>
    );

    // Month grid — same underlying date-fns logic as before (currentMonth/selectedDate state was
    // already declared but had no UI to drive it; prev/next/"Bugun" controls added below are new,
    // purely additive UI for state that already existed). "Kun"/"Hafta" toggle buttons render but stay
    // disabled — no day/week view exists yet, and a clickable-but-inert button would be worse than an
    // honestly-disabled one.
    // Kalendar endi tadbir, musobaqa va Turlarni birga ko'rsatadi - Xonalar
    // bandligi tabi bilan bir xil to'plam (db.getCalendarEntries). Ilgari bu yerda
    // faqat `events` bor edi: Turlar umuman ko'rinmasdi, musobaqa esa yaratilishda
    // tayyorlangan tadbir nusxasi orqali chiqardi (nusxa hamma vaqt ham
    // yaratilmasdi).
    const entriesOn = (day) => {
        const key = format(day, 'yyyy-MM-dd');
        return calendarEntries.filter(e => String(e.date).startsWith(key));
    };

    // Chiqilgan yozuvni ochish: tadbir tahrirlash oynasini, musobaqa va Tur esa
    // musobaqa ish maydonini ochadi.
    const openEntry = (entry, day) => {
        if (entry.kind === 'event') {
            const ev = events.find(e => e.id === entry.id);
            if (ev) handleOpenModal(ev, day);
            return;
        }
        navigate(`/admin/competitions/${entry.id}`);
    };

    const ENTRY_CHIP = {
        event: 'bg-indigo-600',
        competition: 'bg-amber-500',
        tur: 'bg-violet-500',
    };

    // One day cell, shared by the Kunlik/Haftalik/Oylik grids. Creating is a "+" in the corner rather than
    // a click anywhere on the cell — the old whole-cell click fired whenever someone merely wanted to look
    // at a busy day, and it matches how the room-occupancy calendar already works.
    const renderDayCell = (day, { inMonth = true, minHeight = 92, maxChips = 2, showTime = false } = {}) => {
        const dayEvents = entriesOn(day);
        const todayCell = isToday(day);
        return (
            <div
                key={day.toISOString()}
                className={`relative p-2 rounded-xl border transition-colors overflow-hidden group/day ${
                    !inMonth ? 'bg-gray-50 border-transparent' :
                    todayCell ? 'bg-indigo-50 border-indigo-200' :
                    'bg-white border-gray-100 hover:bg-gray-50'
                }`}
                style={{ minHeight }}
            >
                <span className={`text-xs font-bold ${todayCell ? 'text-indigo-600' : inMonth ? 'text-gray-400' : 'text-gray-300'}`}>
                    {format(day, 'd')}
                </span>
                <div className="mt-1 space-y-1 pr-5">
                    {dayEvents.slice(0, maxChips).map(e => (
                        <button
                            key={e.key}
                            type="button"
                            title={e.location ? `${e.title} — ${e.location}` : e.title}
                            onClick={() => openEntry(e, day)}
                            className={`block w-full text-left px-1.5 py-1 text-[10px] font-semibold text-white rounded-lg truncate ${ENTRY_CHIP[e.kind] || 'bg-indigo-600'}`}
                        >
                            {/* Time only where the cell is roomy enough (Kunlik/Haftalik) — in a month cell
                                it would just crowd out the title. */}
                            {showTime && e.date?.includes('T') && (
                                <span className="opacity-80 mr-1">
                                    {e.date.slice(11, 16)}{e.endTime ? `-${e.endTime}` : ''}
                                </span>
                            )}
                            {e.title}
                        </button>
                    ))}
                    {dayEvents.length > maxChips && (
                        <div className="text-[10px] text-gray-400 font-semibold px-0.5">+{dayEvents.length - maxChips} yana</div>
                    )}
                </div>
                <button
                    type="button"
                    title="Shu kunga tadbir qo'shish"
                    onClick={() => { setSelectedDate(day); handleOpenModal(null, day); }}
                    className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-sm opacity-0 group-hover/day:opacity-100 focus:opacity-100 transition-opacity"
                >
                    <Plus size={12} />
                </button>
            </div>
        );
    };

    const renderCalendar = () => {
        const weekStart = startOfWeek(currentMonth, { weekStartsOn: 1 });
        const weekEnd = addDays(weekStart, 6);

        // The header label is what tells you WHERE you are, so each mode gets its own.
        const rangeLabel = calMode === 'day'
            ? `${format(currentMonth, 'd')} ${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`
            : calMode === 'week'
                ? `${format(weekStart, 'd')} ${MONTH_SHORT[weekStart.getMonth()]} — ${format(weekEnd, 'd')} ${MONTH_SHORT[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`
                : calMode === 'month'
                    ? `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`
                    : `${currentMonth.getFullYear()}`;

        const step = (dir) => setCurrentMonth(d => {
            if (calMode === 'day') return addDays(d, dir);
            if (calMode === 'week') return addDays(d, dir * 7);
            if (calMode === 'month') return addMonths(d, dir);
            return new Date(d.getFullYear() + dir, d.getMonth(), 1);
        });

        let body = null;

        if (calMode === 'day') {
            // Same shape as the week grid, one column wide: weekday header above, full-width cell below,
            // so switching Haftalik -> Kunlik reads as a zoom rather than a different screen.
            const dayEvents = entriesOn(currentMonth);
            body = (
                <>
                    <div className="mb-1">
                        <div className="text-center text-[11px] font-bold text-gray-400 py-1.5 uppercase">
                            {WEEKDAYS[(currentMonth.getDay() + 6) % 7]}
                        </div>
                    </div>
                    {renderDayCell(currentMonth, { minHeight: 200, maxChips: 20, showTime: true })}
                    <p className="text-[11px] text-gray-400 mt-2">
                        {dayEvents.length > 0
                            ? `Shu kuni ${dayEvents.length} ta tadbir bor.`
                            : "Shu kuni tadbir yo'q."}
                    </p>
                </>
            );
        } else if (calMode === 'week') {
            const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
            body = (
                <>
                    <div className="grid grid-cols-7 gap-1.5 mb-1">
                        {WEEKDAYS.map(d => <div key={d} className="text-center text-[11px] font-bold text-gray-400 py-1.5 uppercase">{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                        {days.map(d => renderDayCell(d, { minHeight: 160, maxChips: 6, showTime: true }))}
                    </div>
                </>
            );
        } else if (calMode === 'month') {
            const monthStart = startOfMonth(currentMonth);
            const rows = [];
            let days = [];
            let day = startOfWeek(monthStart, { weekStartsOn: 1 });
            const endDate = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
            while (day <= endDate) {
                for (let i = 0; i < 7; i++) {
                    days.push(renderDayCell(day, { inMonth: isSameMonth(day, monthStart) }));
                    day = addDays(day, 1);
                }
                rows.push(<div key={day.toISOString()} className="grid grid-cols-7 gap-1.5">{days}</div>);
                days = [];
            }
            body = (
                <>
                    <div className="grid grid-cols-7 gap-1.5 mb-1">
                        {WEEKDAYS.map(d => <div key={d} className="text-center text-[11px] font-bold text-gray-400 py-1.5 uppercase">{d}</div>)}
                    </div>
                    <div className="space-y-1.5">{rows}</div>
                </>
            );
        } else {
            // Yillik: 12 month cards with their real event counts — clicking one drills into that month.
            const year = currentMonth.getFullYear();
            body = (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {MONTH_NAMES.map((name, idx) => {
                        const count = calendarEntries.filter(e => {
                            const d = new Date(e.date);
                            return d.getFullYear() === year && d.getMonth() === idx;
                        }).length;
                        const isCurrent = new Date().getFullYear() === year && new Date().getMonth() === idx;
                        return (
                            <button
                                key={name}
                                type="button"
                                onClick={() => { setCurrentMonth(new Date(year, idx, 1)); setCalMode('month'); }}
                                className={`p-3 rounded-xl border text-left transition-colors ${
                                    isCurrent ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-100 hover:bg-gray-50'
                                }`}
                            >
                                <p className={`text-sm font-bold ${isCurrent ? 'text-indigo-700' : 'text-gray-800'}`}>{name}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                    {count > 0 ? `${count} ta tadbir` : 'Tadbir yo\'q'}
                                </p>
                            </button>
                        );
                    })}
                </div>
            );
        }

        return (
            <Card className="lg:col-span-2" padding={false}>
                <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-gray-900">{rangeLabel}</h2>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={() => step(-1)} />
                        <Button variant="secondary" size="sm" onClick={() => setCurrentMonth(new Date())}>Bugun</Button>
                        <Button variant="ghost" size="sm" icon={ChevronRight} onClick={() => step(1)} />
                        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 ml-1">
                            {CALENDAR_VIEWS.map(v => (
                                <button
                                    key={v.id}
                                    type="button"
                                    onClick={() => setCalMode(v.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                        calMode === v.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    {v.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="p-4 bg-gray-50/50">
                    {body}
                    <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-gray-100">
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" /> Klub tadbirlari
                        </span>
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Turnir/Musobaqa
                        </span>
                        {/* Tur - musobaqaning alohida kuni va xonasi bo'lgan bosqichi.
                            Ilgari u faqat "Xonalar bandligi" tabida ko'rinardi. */}
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
                            <span className="w-2.5 h-2.5 rounded-full bg-violet-500" /> Musobaqa Turi
                        </span>
                        <span className="text-[11px] text-gray-400 ml-auto">
                            Kun katagi ustiga borib <span className="font-semibold">+</span> tugmasi bilan tadbir qo'shasiz.
                        </span>
                    </div>
                </div>
            </Card>
        );
    };

    // Right sidebar: today's events, live stats, and shortcut buttons into other already-existing admin
    // flows (competitions/clubs pages) — no new data model, everything derived from `events`/`clubs`/
    // `students` already loaded above.
    const renderSidebar = () => (
        <div className="space-y-6">
            <Card padding={false}>
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <CalendarIcon size={16} className="text-indigo-500" /> Bugungi tadbirlar
                    </h3>
                    <Badge variant="primary" size="sm">{todayEvents.length} ta</Badge>
                </div>
                <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
                    {todayEvents.length === 0 ? (
                        <p className="text-center text-sm text-gray-400 py-6">Bugun tadbirlar yo'q</p>
                    ) : todayEvents.map(e => (
                        <div
                            key={e.key}
                            onClick={() => openEntry(e, new Date(e.date))}
                            className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${e.kind === 'event' ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600'}`}>
                                {e.kind === 'event' ? <Users size={16} /> : <Trophy size={16} />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-bold text-gray-900 truncate">{e.title}</p>
                                    <Badge variant={e.kind === 'event' ? 'default' : 'primary'} size="sm">
                                        {e.kind === 'event' ? 'Tadbir' : e.kind === 'tur' ? 'Tur' : 'Musobaqa'}
                                    </Badge>
                                </div>
                                <p className="text-[11px] text-gray-400 flex items-center gap-1.5 mt-0.5">
                                    <span className="flex items-center gap-1"><Clock size={10} /> {format(new Date(e.date), 'HH:mm')}</span>
                                    {e.location && <span className="flex items-center gap-1 truncate"><MapPin size={10} /> {e.location}</span>}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            <Card>
                <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
                    <TrendingUp size={16} className="text-indigo-500" /> Tadbirlar bo'yicha statistika
                </h3>
                <div className="grid grid-cols-2 gap-3">
                    {[
                        { icon: CalendarIcon, value: events.length, label: 'Tadbirlar' },
                        { icon: Users, value: students.length, label: 'Talabalar' },
                        { icon: GraduationCap, value: facultyCount, label: 'Fakultetlar' },
                        { icon: Trophy, value: clubs.length, label: 'Klublar' }
                    ].map(s => (
                        <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                            <s.icon className="w-4 h-4 text-indigo-500 mx-auto mb-1" />
                            <p className="text-lg font-black text-gray-900">{s.value}</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase">{s.label}</p>
                        </div>
                    ))}
                </div>
            </Card>

            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-5 text-white shadow-lg">
                <h3 className="font-bold flex items-center gap-2 mb-4">
                    <Zap size={16} /> Tezkor amallar
                </h3>
                <div className="space-y-2.5">
                    <button
                        type="button"
                        onClick={() => handleOpenModal(null, new Date())}
                        className="w-full flex items-center gap-3 bg-white/10 hover:bg-white/20 transition-colors rounded-2xl px-4 py-3 text-left"
                    >
                        <span className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0"><Plus size={16} /></span>
                        <span className="text-sm font-bold">Yangi tadbir yaratish</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/admin/competitions')}
                        className="w-full flex items-center gap-3 bg-white/10 hover:bg-white/20 transition-colors rounded-2xl px-4 py-3 text-left"
                    >
                        <span className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0"><Trophy size={16} /></span>
                        <span className="text-sm font-bold">Yangi turnir yaratish</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/admin/clubs-directory')}
                        className="w-full flex items-center gap-3 bg-white/10 hover:bg-white/20 transition-colors rounded-2xl px-4 py-3 text-left"
                    >
                        <span className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0"><UsersRound size={16} /></span>
                        <span className="text-sm font-bold">Klub tashkil etish</span>
                    </button>
                </div>
            </div>
        </div>
    );


    // FAOL/ARXIV RO'YXATI - tekis, tez ko'rinadigan ro'yxat. Kalendardan
    // farqi: bu yerda oyma-oy siljitish shart emas, "hozir nima bor" yoki
    // "eskilardan qidirish" darhol ko'rinadi.
    const renderEventList = (list, emptyText) => (
        <Card padding={false}>
            {list.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-16">{emptyText}</p>
            ) : (
                <div className="divide-y divide-gray-50">
                    {list.map(e => {
                        const club = e.clubId ? db.getClubById(e.clubId) : null;
                        const isPast = e.status === 'completed';
                        const isCancelled = e.status === 'cancelled';
                        return (
                            <button
                                key={e.id} type="button" onClick={() => handleOpenModal(e)}
                                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
                            >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                    isCancelled ? 'bg-red-50 text-red-500' : isPast ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-600'
                                }`}>
                                    <CalendarIcon size={17} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-gray-900 truncate">{e.title}</p>
                                    <p className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5">
                                        <span>{format(new Date(e.date), 'dd MMM yyyy, HH:mm', { locale: uz })}</span>
                                        {e.location && <span className="flex items-center gap-1 truncate"><MapPin size={10} /> {e.location}</span>}
                                        {club && <span className="truncate">· {club.name}</span>}
                                    </p>
                                </div>
                                <Badge variant={isCancelled ? 'danger' : isPast ? 'default' : 'success'} size="sm">
                                    {isCancelled ? 'Bekor qilindi' : isPast ? 'Yakunlangan' : 'Faol'}
                                </Badge>
                            </button>
                        );
                    })}
                </div>
            )}
        </Card>
    );

    return (
        <div className="space-y-6">
            {renderHero()}

            {/* Yakunlangan, lekin hisoboti topshirilmagan tadbirlar. Ilgari tadbir
                "completed" bo'lgach izsiz yo'qolardi - kim qatnashgani, nima natija
                bergani hech qayerda so'ralmasdi. */}
            {pendingReports.length > 0 && (
                <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-2xl">
                    <p className="text-xs font-bold text-amber-800">
                        {pendingReports.length} ta yakunlangan tadbirning hisoboti topshirilmagan
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {pendingReports.slice(0, 6).map(r => {
                            const ev = events.find(e => e.id === r.id);
                            return (
                                <button key={r.id} type="button" disabled={!ev}
                                    onClick={() => ev && handleOpenModal(ev)}
                                    className="px-2 py-1 bg-white border border-amber-200 rounded-lg text-[11px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
                                    {r.title}
                                </button>
                            );
                        })}
                        {pendingReports.length > 6 && (
                            <span className="text-[11px] text-amber-700 font-semibold self-center">
                                va yana {pendingReports.length - 6} ta
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Two ways to read the same data: the month grid answers "what's happening", the room grid
                answers "which room is free when" (rows = real venues from Sozlamalar → Joylar). */}
            <div className="flex bg-gray-100 rounded-xl p-0.5 w-fit flex-wrap">
                {[
                    { id: 'month', label: 'Tadbirlar kalendari' },
                    { id: 'active', label: 'Faol tadbirlar', count: activeEvents.length },
                    { id: 'archive', label: 'Arxiv', count: archivedEvents.length },
                    { id: 'venues', label: 'Xonalar bandligi' },
                ].map(v => (
                    <button
                        key={v.id}
                        type="button"
                        onClick={() => setCalendarView(v.id)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                            calendarView === v.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        {v.label}
                        {v.count > 0 && <span className="ml-1.5 opacity-60">{v.count}</span>}
                    </button>
                ))}
            </div>

            {calendarView === 'venues' ? (
                <Card padding={false}>
                    <div className="p-4">
                        <VenueOccupancyCalendar
                            currentUsername={user?.username}
                            onCreateBooking={(venueLabel, day) => {
                                handleOpenModal(null, day);
                                // Prefill the room the admin clicked in — the modal's own form state is
                                // reset by handleOpenModal, so this has to run after it.
                                setFormData(prev => ({ ...prev, location: venueLabel }));
                            }}
                            onOpenBooking={(booking) => {
                                if (booking.kind === 'event') {
                                    const ev = events.find(e => e.id === booking.id);
                                    if (ev) handleOpenModal(ev);
                                } else {
                                    navigate(`/admin/competitions/${booking.id}`);
                                }
                            }}
                        />
                    </div>
                </Card>
            ) : calendarView === 'active' ? (
                renderEventList(activeEvents, "Hozircha faol tadbir yo'q")
            ) : calendarView === 'archive' ? (
                renderEventList(archivedEvents, "Arxivda tadbir yo'q")
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    {renderCalendar()}
                    {renderSidebar()}
                </div>
            )}

            <Modal
                isOpen={isEventModalOpen}
                onClose={() => setIsEventModalOpen(false)}
                title={selectedEvent
                    ? <>Tadbir tafsilotlari — <CopyableId value={`Tadbir #${selectedEvent.displayNumber}`} className="text-2xl font-bold">#{selectedEvent.displayNumber}</CopyableId></>
                    : "Yangi tadbir"}
            >
                <div className="space-y-4 p-2">
                    <EventEditForm
                        event={selectedEvent}
                        formData={formData}
                        onChange={patch => setFormData(prev => ({ ...prev, ...patch }))}
                        clubs={clubs}
                        locationConflict={locationConflict}
                        saveError={saveError}
                        onSave={handleSaveEvent}
                        onCancel={() => setIsEventModalOpen(false)}
                        user={user}
                        hasClubRole={hasClubRole}
                        isAdmin={user?.role === 'ADMINISTRATOR'}
                        isManagement={user?.role === 'RAHBARIYAT'}
                        canEditDetails
                        canManageAttendance
                        actingUsername={user?.username || 'admin'}
                        onDataChanged={() => { loadData(); if (selectedEvent) setSelectedEvent(db.getEvents().find(e => e.id === selectedEvent.id) || selectedEvent); }}
                        // Kalendar oynasi endi FAQAT yaratish va tahrirlash uchun.
                        // O'tkazish - davomat, ball, vazifalar, hisobot, bayonnoma -
                        // /admin/events/:id sahifasida. Sabab: oynaning manzili yo'q
                        // (havola yubora olmaysiz), vakolat olgan odam kalendardan kun
                        // qidiradi, hisobot esa bir o'tirishda tugamaydi.
                        showManagement={false}
                        headerExtra={selectedEvent && (
                            <button
                                type="button"
                                onClick={() => navigate(`/admin/events/${selectedEvent.id}`)}
                                className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-colors text-left"
                            >
                                <span>
                                    <span className="block text-sm font-bold text-indigo-900">Boshqarish sahifasi</span>
                                    <span className="block text-[11px] text-indigo-700">
                                        Davomat, ball, vazifalar, hisobot va bayonnoma
                                    </span>
                                </span>
                                <ChevronRight size={16} className="text-indigo-600 shrink-0" />
                            </button>
                        )}
                    />

                    {/* O'chirish oynaning eng ostida va qizil - tasodifan bosilmasin.
                        Ball berilgan yoki hujjat berilgan tadbirni db qatlami o'zi
                        rad etadi, sababini aytib. */}
                    {selectedEvent && (
                        <div className="border-t pt-4 space-y-2">
                            {deleteError && (
                                <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                                    {deleteError}
                                </p>
                            )}
                            <button
                                type="button"
                                onClick={handleDeleteEvent}
                                onBlur={() => setDeleteArmed(false)}
                                className={`w-full px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                                    deleteArmed
                                        ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                                        : 'text-red-600 border-red-200 hover:bg-red-50'
                                }`}
                            >
                                {deleteArmed ? "Tasdiqlang: tadbir butunlay o'chiriladi" : "Tadbirni o'chirish"}
                            </button>
                        </div>
                    )}

                    {/* Legacy participant/score list — handleAssignScore-owned, untouched by the Davomat
                        feature (that reads the unified registrations layer instead, see EventEditForm). */}
                    {selectedEvent && (
                        <div className="border-t pt-4">
                            <h3 className="font-bold text-sm text-gray-700 mb-2 flex items-center gap-2">Tadbir ishtirokchilari ({selectedEvent.participants?.length || 0})</h3>
                            {selectedEvent.participants?.map((p, i) => (
                                <div key={i} className="flex justify-between items-center text-sm border-b py-1">
                                    <span>User: {p.userId}</span>
                                    <div className="flex gap-2">
                                        {p.placement && <Badge variant="success" size="sm">{p.placement}</Badge>}
                                        <Badge variant="primary" size="sm">{p.score} ball</Badge>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default EventManagement;
