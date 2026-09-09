import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useTabParam } from '../../hooks/useTabParam';
import {
    ArrowLeft, CalendarDays, ChevronRight, Calendar, MapPin, Users,
    UserCheck, ListChecks, FileBarChart2, FileText, ShieldCheck, Settings, PieChart,
} from 'lucide-react';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Card from '../../components/common/Card';
import EventManagementPanel from '../../components/admin/EventManagementPanel';
import ParticipantStatsPanel from '../../components/common/ParticipantStatsPanel';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { EVENT_TYPES, ACTIVITY_LEVELS } from '../../config/activityLifecycle';

// Tadbir boshqaruv sahifasi — musobaqadagi /admin/competitions/:id bilan bir xil shakl.
//
// Nega kalendar oynasidan ko'chirildi: oyna butun bir ish maydoniga aylangan edi.
// Uchta aniq muammo bor edi va uchalasi ham bu sahifada hal bo'ladi:
//   1. Oynaning manzili yo'q — hamkasbga "mana bu tadbirning hisoboti" deb havola
//      yubora olmaysiz. Endi har tab `?tab=` da saqlanadi.
//   2. Davomat vakolati berilgan odam kalendardan to'g'ri kunni qidirishga majbur
//      edi. Endi to'g'ridan-to'g'ri kiradi.
//   3. Hisobot bir o'tirishda tugamaydi (qoralama -> topshirish -> imzo -> tasdiq),
//      yon tomonini bosganda yopiladigan oyna bunga qarshi ishlaydi.
//
// Kalendarda YARATISH va TAHRIRLASH qoladi — kunni bosib tadbir ochish to'g'ri
// harakat, uni buzish shart emas.

const TABS = [
    { id: 'attendance', label: 'Davomat va ball', icon: UserCheck, section: 'attendance' },
    { id: 'tasks', label: 'Vazifalar', icon: ListChecks, section: 'tasks' },
    { id: 'report', label: 'Hisobot', icon: FileBarChart2, section: 'report' },
    { id: 'protocol', label: 'Bayonnoma', icon: FileText, section: 'protocol' },
    { id: 'registration', label: "Ro'yxat", icon: Users, section: 'registration' },
    { id: 'access', label: 'Vakolat', icon: ShieldCheck, section: 'delegation' },
    // Statistika OXIRIDA: u ish emas, natijani o'qish. Ish tablari (davomat,
    // vazifalar, hisobot) oldinda turishi kerak.
    { id: 'stats', label: 'Statistika', icon: PieChart, section: null },
];

const TAB_IDS = TABS.map(t => t.id);

const EventWorkspacePage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { user, hasClubRole } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [version, setVersion] = useState(0);

    const event = useMemo(() => db.getEvents().find(e => e.id === id) || null, [id, version]);
    const club = useMemo(
        () => (event?.clubId ? db.getClubs().find(c => c.id === event.clubId) : null),
        [event]
    );

    // Statistika QAYSI yozuvlardan o'qilishi kerak. Musobaqaga bog'langan
    // tadbirda ro'yxatdan o'tishlar MUSOBAQAGA yoziladi, tadbirga emas
    // (EventManagementPanel ham aynan shunday hal qiladi) - shuni hisobga
    // olmasa, bunday tadbirda statistika har doim bo'sh chiqardi.
    const statsRefs = useMemo(() => {
        if (!event) return [];
        return event.linkedCompetitionId
            ? [{ activityId: event.linkedCompetitionId, activityType: 'competition' }]
            : [{ activityId: event.id, activityType: 'event' }];
    }, [event]);

    // Tab manzilda saqlanadi (havola yuborilganda o'sha tab ochiladi) va har
    // almashtirish tarixga yoziladi — orqaga bosilganda oldingi tabga qaytadi.
    const [tab, selectTab] = useTabParam(TAB_IDS, 'attendance');

    const isAdmin = user?.role === 'ADMINISTRATOR';
    const isManagement = user?.role === 'RAHBARIYAT';

    // Vakolat: admin hammasini, klub koordinatori o'z klubini, davomat vakolati
    // berilgan odam esa FAQAT davomat ro'yxatini boshqaradi.
    const isClubCoordinator = !!(event?.clubId && hasClubRole?.(event.clubId, ['coordinator', 'head_coordinator']));
    const hasAttendanceDelegation = useMemo(
        () => (event ? (db.getEventDelegations(event.id) || []).some(d => d.granteeUsername === user?.username) : false),
        [event, user?.username, version]
    );
    const canEditDetails = isAdmin || isClubCoordinator;
    const canManageAttendance = canEditDetails || hasAttendanceDelegation;

    // Bir sahifa, ikki manzil: admin /admin/events/:id dan, klub koordinatori
    // /student/events/:id dan kiradi. Qaytish HAR DOIM aniq manzilga - brauzer
    // tarixiga emas, chunki havola orqali kelgan bo'lsa tarix bo'sh bo'lishi mumkin.
    // Standart manzil - ro'yxat, lekin masalan "Tadbirlar to'plami"dan "Ish
    // maydoni" tugmasi bilan kirilgan bo'lsa, `location.state.from` orqali
    // aynan O'SHA sahifaga qaytadi (ro'yxatga emas) - aks holda foydalanuvchi
    // "adashib qoladi".
    const isStudentRoute = location.pathname.startsWith('/student/');
    const backToEvents = () => navigate(location.state?.from || (isStudentRoute ? '/student/events' : '/admin/events'));

    if (!event) {
        return (
            <Card>
                <div className="p-10 text-center space-y-3">
                    <p className="text-sm text-gray-500">Tadbir topilmadi.</p>
                    <Button variant="outline" size="sm" icon={ArrowLeft} onClick={backToEvents}>
                        Tadbirlarga qaytish
                    </Button>
                </div>
            </Card>
        );
    }

    if (!canManageAttendance) {
        return (
            <Card>
                <div className="p-10 text-center space-y-3">
                    <p className="text-sm text-gray-500">
                        Bu tadbirni boshqarish huquqingiz yo'q.
                    </p>
                    <Button variant="outline" size="sm" icon={ArrowLeft} onClick={backToEvents}>
                        Tadbirlarga qaytish
                    </Button>
                </div>
            </Card>
        );
    }

    // Davomat vakolati berilgan odamga faqat davomat tabi ko'rinadi — qolgan
    // tablar unga baribir bo'sh chiqardi.
    const visibleTabs = canEditDetails ? TABS : TABS.filter(t => t.id === 'attendance');
    const activeTab = visibleTabs.some(t => t.id === tab) ? tab : 'attendance';
    const activeSection = TABS.find(t => t.id === activeTab)?.section;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Button variant="outline" size="sm" icon={ArrowLeft} onClick={backToEvents} className="rounded-xl">
                            Orqaga
                        </Button>
                        <div>
                            <button
                                type="button"
                                onClick={backToEvents}
                                className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-indigo-600 transition-colors mb-1"
                            >
                                Tadbirlar
                                <ChevronRight size={12} />
                                <span className="text-gray-500">{event.title}</span>
                            </button>
                            <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2 flex-wrap">
                                <CalendarDays className="w-5 h-5 text-indigo-600" />
                                {event.title}
                                <Badge variant={event.status === 'completed' ? 'default' : 'success'} size="sm">
                                    {event.status === 'completed' ? 'Yakunlangan' : 'Rejalashtirilgan'}
                                </Badge>
                            </h1>
                            <p className="text-xs text-gray-400">
                                Tadbirni o'tkazish: davomat, ball, vazifalar, hisobot va rasmiy hujjatlar
                            </p>
                        </div>
                    </div>
                    {/* Tahrirlash formasi kalendarda (admin) yoki klub sahifasida
                        (koordinator). Koordinatorga kalendar havolasi berilmaydi -
                        u yerda tahrirlash oynasi unga ochilmaydi. */}
                    {canEditDetails && !isStudentRoute && (
                        <Button variant="outline" size="sm" icon={Settings} onClick={backToEvents} className="rounded-xl">
                            Tafsilotlarni tahrirlash
                        </Button>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-gray-50 text-xs text-gray-500">
                    {club && (
                        <span className="flex items-center gap-1.5 font-semibold text-gray-600">
                            <Users size={13} className="text-indigo-500" /> {club.name}
                        </span>
                    )}
                    {event.date && (
                        <span className="flex items-center gap-1.5">
                            <Calendar size={13} className="text-indigo-500" />
                            {new Date(event.date).toLocaleString('uz-UZ', {
                                day: '2-digit', month: '2-digit', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                            })}
                        </span>
                    )}
                    {event.location && (
                        <span className="flex items-center gap-1.5">
                            <MapPin size={13} className="text-indigo-500" /> {event.location}
                        </span>
                    )}
                    {event.eventType && EVENT_TYPES[event.eventType] && (
                        <Badge variant="info" size="sm">{EVENT_TYPES[event.eventType].label}</Badge>
                    )}
                    {event.level && ACTIVITY_LEVELS[event.level] && (
                        <Badge variant="default" size="sm">{ACTIVITY_LEVELS[event.level].label}</Badge>
                    )}
                </div>
            </div>

            <div className="-mx-1 px-1 overflow-x-auto">
                <div className="inline-flex bg-white p-1 rounded-2xl border border-gray-100 shadow-sm">
                    {visibleTabs.map(t => {
                        const active = activeTab === t.id;
                        return (
                            <button
                                key={t.id} type="button" onClick={() => selectTab(t.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                                    active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-gray-500 hover:bg-gray-50'
                                }`}
                            >
                                <t.icon size={15} /> {t.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Statistika BUTUN kengligida turadi va boshqaruv panelidan
                tashqarida: u faoliyatni o'tkazish emas, natijani o'qish.
                `EventManagementPanel` ichiga qo'yilsa, uning bo'lim mantiqiga
                (`sections`) sun'iy ravishda bog'lanib qolardi. */}
            {activeTab === 'stats' ? (
                <ParticipantStatsPanel
                    refs={statsRefs}
                    subtitle={`"${event.title}" bo'yicha`}
                />
            ) : (
            <Card>
                <div className="p-6">
                    <EventManagementPanel
                        event={event}
                        user={user}
                        hasClubRole={hasClubRole}
                        isAdmin={isAdmin}
                        isManagement={isManagement}
                        canEditDetails={canEditDetails}
                        canManageAttendance={canManageAttendance}
                        actingUsername={user?.username || 'admin'}
                        onDataChanged={() => setVersion(v => v + 1)}
                        sections={[activeSection]}
                        // E'lon "Davomat va ball" tabida turadi — tadbirdan oldingi
                        // yagona amal, unga alohida tab ochish ortiqcha.
                        showLinkedCompetition={activeTab === 'attendance'}
                    />
                    {activeTab === 'attendance' && canEditDetails && (
                        <div className="mt-6 pt-6 border-t">
                            <EventManagementPanel
                                event={event}
                                user={user}
                                hasClubRole={hasClubRole}
                                isAdmin={isAdmin}
                                isManagement={isManagement}
                                canEditDetails={canEditDetails}
                                canManageAttendance={canManageAttendance}
                                actingUsername={user?.username || 'admin'}
                                onDataChanged={() => setVersion(v => v + 1)}
                                sections={['announce']}
                                showLinkedCompetition={false}
                            />
                        </div>
                    )}
                </div>
            </Card>
            )}
        </div>
    );
};

export default EventWorkspacePage;
