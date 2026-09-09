import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar as CalendarIcon, Plus, Users, Clock, MapPin,
    ChevronRight, GraduationCap, Trophy, UsersRound, Zap, TrendingUp
} from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { uz } from 'date-fns/locale';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import CopyableId from '../common/CopyableId';
import EventEditForm from './EventEditForm';
import EventsCalendar from '../student/EventsCalendar';
import { DEFAULT_ACTIVITY_LEVEL, EVENT_TYPES, ACTIVITY_LEVELS } from '../../config/activityLifecycle';
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

// Oy nomlari, hafta kunlari va Kunlik/Haftalik/Oylik/Yillik rejimlari
// ActivityCalendar.jsx ga ko'chdi - ular faqat o'sha gridga tegishli edi.

// Bitta ma'lumot qatori. Qiymat yo'q bo'lsa QATORNING O'ZI chizilmaydi -
// "Joy: —" degan qator ekranni to'ldiradi, lekin hech narsa aytmaydi.
const SummaryRow = ({ icon: Icon, label, value }) => {
    if (value === null || value === undefined || value === '') return null;
    return (
        <div className="flex items-start gap-2 text-sm">
            <Icon size={14} className="text-gray-400 shrink-0 mt-0.5" />
            <span className="text-gray-500 shrink-0">{label}:</span>
            <span className="text-gray-900 font-medium min-w-0">{value}</span>
        </div>
    );
};

// TADBIR HAQIDA QISQACHA — mavjud tadbir bosilganda birinchi ko'rinadigan
// ekran. Uch savolga javob beradi: bu qanday tadbir, ro'yxat qanday ketyapti
// va endi nima qilaman.
const EventSummary = ({ event, club, onOpenWorkspace, onEdit }) => {
    const registered = db.getRegistrationsForActivity(event.id, 'event')
        .filter(r => r.status === 'registered').length;
    const [datePart, timePart] = (event.date || '').split('T');
    const isDone = event.status === 'completed';

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                    <h3 className="text-lg font-extrabold text-gray-900">{event.title}</h3>
                    {event.description && (
                        <p className="text-sm text-gray-500 mt-1 whitespace-pre-line">{event.description}</p>
                    )}
                </div>
                <Badge variant={isDone ? 'default' : 'success'} size="sm">
                    {isDone ? 'Yakunlangan' : 'Rejalashtirilgan'}
                </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 bg-slate-50 rounded-xl p-3">
                <SummaryRow icon={CalendarIcon} label="Sana"
                            value={datePart ? new Date(event.date).toLocaleDateString('uz-UZ') : null} />
                <SummaryRow icon={Clock} label="Vaqt"
                            value={timePart ? `${timePart.slice(0, 5)}${event.endTime ? ` — ${event.endTime}` : ''}` : null} />
                <SummaryRow icon={MapPin} label="Joy" value={event.location} />
                <SummaryRow icon={UsersRound} label="Klub" value={club?.name} />
                <SummaryRow icon={Zap} label="Turi" value={EVENT_TYPES[event.eventType]?.label} />
                <SummaryRow icon={TrendingUp} label="Daraja" value={ACTIVITY_LEVELS[event.level]?.label} />
                {/* Ro'yxat TALAB QILINMASA, "0 kishi" deb yozilmaydi: nol
                    "hech kim yozilmadi" degani, bu yerda esa "ro'yxat umuman
                    yuritilmaydi" - butunlay boshqa narsa. */}
                <SummaryRow
                    icon={Users} label="Ro'yxatdan o'tgan"
                    value={event.registrationRequired
                        ? `${registered} kishi${event.maxParticipants ? ` / ${event.maxParticipants}` : ''}`
                        : "Ro'yxat talab qilinmaydi"}
                />
            </div>

            <div className="space-y-2">
                {/* BOSHQARISH birinchi va asosiy tugma: tadbir ustiga bosgan
                    odam ko'pincha davomat qilish yoki hisobotni ko'rish uchun
                    keladi, tahrirlash uchun emas. */}
                <button
                    type="button"
                    onClick={onOpenWorkspace}
                    className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors text-left"
                >
                    <span>
                        <span className="block text-sm font-bold text-white">Boshqarish sahifasi</span>
                        <span className="block text-[11px] text-indigo-100">
                            Davomat, ball, vazifalar, hisobot, bayonnoma va ro'yxat
                        </span>
                    </span>
                    <ChevronRight size={16} className="text-white shrink-0" />
                </button>

                <Button variant="outline" className="w-full" onClick={onEdit}>
                    Tahrirlash
                </Button>
            </div>
        </div>
    );
};

// `defaultKind` - `/admin/competitions` manzilidan kirilganda musobaqa tabi
// ochilishi uchun. Boshqa hamma narsa avvalgidek.
const EventManagement = ({ defaultKind = 'events' }) => {
    const navigate = useNavigate();
    const { user, hasClubRole } = useAuth();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [isEventModalOpen, setIsEventModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    // Oyna ikki holatda ishlaydi: MAVJUD tadbir bosilganda avval qisqacha
    // ma'lumot ('view'), yangi tadbir yaratilayotganda esa to'g'ridan-to'g'ri
    // forma ('edit').
    //
    // Ilgari mavjud tadbir bosilishi bilan tahrirlash formasi ochilardi. Bu
    // ikki tomondan noto'g'ri edi: eng ko'p uchraydigan ish "bu tadbir qanday
    // edi" deb QARASH, tahrirlash esa kamdan-kam; ustiga to'ldirilgan forma
    // tasodifiy o'zgartirishga ochiq turardi.
    const [modalMode, setModalMode] = useState('edit'); // 'view' | 'edit'
    const [events, setEvents] = useState([]);
    // Kalendar ko'rsatadigan to'liq to'plam: tadbir + musobaqa + Tur.
    // `events` esa tahrirlash oynasi va statistika uchun asl tadbirlar ro'yxati.
    const [calendarEntries, setCalendarEntries] = useState([]);
    const [clubs, setClubs] = useState([]);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [scoreData, setScoreData] = useState({ userId: '', score: 0, placement: '' });
    const [saveError, setSaveError] = useState('');
    // Xonalar bandligi endi alohida tab emas, YONMA-YON ochiladigan blok:
    // u kalendarning muqobili emas, uni to'ldiradi ("qaysi xona bo'sh").
    const [showVenues, setShowVenues] = useState(false);
    // Tadbir saqlangach EventsCalendar ma'lumotni qayta o'qishi uchun.
    const [version, setVersion] = useState(0);
    // Kalendar rejimi (Kunlik/Haftalik/Oylik/Yillik) endi ActivityCalendar
    // ichida saqlanadi - u yerda ishlatiladi, bu yerda emas.

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
        setVersion(v => v + 1);
    };

    const handleOpenModal = (event = null, date = new Date()) => {
        setSaveError('');
        setModalMode(event ? 'view' : 'edit');
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

    // Kun katagi va butun grid ALOHIDA komponentga ko'chirildi
    // (ActivityCalendar.jsx): aynan shu kalendar endi musobaqalar tabida ham
    // kerak, ikkinchi nusxa esa ikki gridni bir-biridan chetga chiqib
    // ketishga qo'yib berardi.
    //
    // Chiqilgan yozuvni ochish: tadbir tahrirlash oynasini, musobaqa va Tur
    // esa musobaqa ish maydonini ochadi.
    const openEntry = (entry, day) => {
        if (entry.kind === 'event') {
            const ev = events.find(e => e.id === entry.id);
            if (ev) handleOpenModal(ev, day);
            return;
        }
        navigate(`/admin/competitions/${entry.id}`);
    };

    // Kalendar, yon panel va ro'yxat ko'rinishlari OLIB TASHLANDI - ularning
    // o'rnini talaba panelidagi bilan ayni komponent (EventsCalendar) egalladi.

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

            {/* BUGUNGI KUN va QISQACHA STATISTIKA.
                Ilgari ular o'ng yon ustunda turardi. Yon ustun olib tashlandi
                (uning o'rnida endi filtrlar paneli), lekin ma'lumotning o'zi
                kerak: mas'ul ekranni ochgan zahoti "bugun nima bor" va
                "umumiy hajm qanday" degan savollarga javob olishi kerak.
                Shuning uchun ular ro'yxat TEPASIDA, keng qatorda turadi -
                uchinchi ustun qo'shilsa, ekran juda tor bo'lib qolardi. */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card padding={false} className="lg:col-span-2">
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <CalendarIcon size={16} className="text-indigo-500" /> Bugungi tadbir va musobaqalar
                        </h3>
                        <Badge variant="primary" size="sm">{todayEvents.length} ta</Badge>
                    </div>
                    <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                        {todayEvents.length === 0 ? (
                            <p className="text-center text-sm text-gray-400 py-6">Bugun hech narsa yo'q</p>
                        ) : todayEvents.map(e => (
                            <button
                                key={e.key}
                                type="button"
                                onClick={() => {
                                    if (e.kind === 'event') {
                                        const ev = events.find(x => x.id === e.id);
                                        if (ev) handleOpenModal(ev);
                                        return;
                                    }
                                    navigate(`/admin/competitions/${e.id}`);
                                }}
                                className="w-full flex items-start gap-3 p-2.5 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors text-left"
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
                            </button>
                        ))}
                    </div>
                </Card>

                <Card>
                    <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
                        <TrendingUp size={16} className="text-indigo-500" /> Qisqacha statistika
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { icon: CalendarIcon, value: events.length, label: 'Tadbirlar' },
                            { icon: Trophy, value: db.getCompetitions().length, label: 'Musobaqalar' },
                            { icon: Users, value: students.length, label: 'Talabalar' },
                            { icon: GraduationCap, value: facultyCount, label: 'Fakultetlar' },
                        ].map(st => (
                            <div key={st.label} className="bg-gray-50 rounded-xl p-3 text-center">
                                <st.icon className="w-4 h-4 text-indigo-500 mx-auto mb-1" />
                                <p className="text-lg font-black text-gray-900">{st.value}</p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase">{st.label}</p>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            {/* KO'RISH QISMI - talaba panelidagi AYNI komponent (EventsCalendar).
                Ilgari bu yerda butunlay boshqa tuzilish turardi: o'z tab qatori,
                o'z kalendari, o'z ro'yxati. Ya'ni bir xil ish ikki panelda ikki
                xil ko'rinardi va mas'ul bir tomonda o'rgangan narsasini
                ikkinchisida qaytadan qidirardi.
                Endi filtr paneli, hisobli tablar, saralash, sahifalash va
                Kalendar/Ro'yxat almashtirgichi - hammasi bir xil.
                Admin FUNKSIYALARI shu yerda qoladi: yaratish, tahrirlash,
                o'chirish va xonalar bandligi qo'shimcha tugmalar orqali. */}
            <EventsCalendar
                variant="admin"
                defaultKind={defaultKind}
                hero={null}
                refreshToken={version}
                onOpenActivity={(entry) => {
                    if (entry.kind === 'event') {
                        const ev = events.find(e => e.id === entry.id);
                        if (ev) handleOpenModal(ev);
                        return;
                    }
                    navigate(`/admin/competitions/${entry.id}`);
                }}
                // "Yangi tadbir" tugmasi BU YERDA YO'Q: u sarlavhaning o'ng
                // tomonida turadi. Ikki joyda bo'lgani foydalanuvchiga ikki xil
                // amal borday tuyulardi, aslida esa bitta ish edi.
                headerActions={
                    <>
                        <button
                            type="button"
                            onClick={() => setShowVenues(v => !v)}
                            className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-colors border ${
                                showVenues
                                    ? 'bg-gray-900 text-white border-gray-900'
                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            Xonalar bandligi
                        </button>
                    </>
                }
                footer={showVenues && (
                    <Card padding={false}>
                        <div className="p-4">
                            <VenueOccupancyCalendar
                                currentUsername={user?.username}
                                onCreateBooking={(venueLabel, day) => {
                                    handleOpenModal(null, day);
                                    // Xona nomi handleOpenModal formani tozalagandan
                                    // KEYIN qo'yiladi, aks holda yo'qolib ketardi.
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
                )}
            />

            <Modal
                isOpen={isEventModalOpen}
                onClose={() => setIsEventModalOpen(false)}
                title={selectedEvent
                    ? <>Tadbir tafsilotlari — <CopyableId value={`Tadbir #${selectedEvent.displayNumber}`} className="text-2xl font-bold">#{selectedEvent.displayNumber}</CopyableId></>
                    : "Yangi tadbir"}
            >
                <div className="space-y-4 p-2">
                    {/* QISQACHA MA'LUMOT — mavjud tadbir bosilganda birinchi
                        ko'rinadigan narsa. Bu yerdan ikki yo'l ochiladi:
                        boshqarish sahifasi (davomat, ball, hisobot) va
                        tahrirlash. Tahrirlash ATAYLAB ikkinchi qadam: forma
                        o'zi ochilib tursa, qaramoqchi bo'lgan odam ham
                        tasodifan biror maydonni o'zgartirib yuborishi mumkin. */}
                    {selectedEvent && modalMode === 'view' && (
                        <EventSummary
                            event={selectedEvent}
                            club={clubs.find(c => c.id === selectedEvent.clubId)}
                            onOpenWorkspace={() => navigate(`/admin/events/${selectedEvent.id}`)}
                            onEdit={() => setModalMode('edit')}
                        />
                    )}

                    {modalMode === 'edit' && (
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
                    )}

                    {/* O'chirish oynaning eng ostida va qizil - tasodifan bosilmasin.
                        Ball berilgan yoki hujjat berilgan tadbirni db qatlami o'zi
                        rad etadi, sababini aytib.
                        FAQAT tahrirlash holatida: qarash uchun ochgan odamning
                        ko'z oldida o'chirish tugmasi turishi kerak emas. */}
                    {selectedEvent && modalMode === 'edit' && (
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
