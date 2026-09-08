import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Calendar, UsersRound, Trophy, UserPlus, UserMinus, Settings, Trash2, Activity, Repeat, Play, Pause, Award, Share2, ChevronRight, Archive, Clock, Send, History } from 'lucide-react';
import { OPERATIONAL_STATUS } from '../../config/clubRegistration';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import { db } from '../../services/db';
import { mergeLadder, LADDER_FIELD_LABELS } from '../../config/clubLadder';
import { useAuth, ROLES } from '../../contexts/AuthContext';
import { isClubCoordinator } from '../../utils/permissions';
import { hasEventDelegatedPermission } from '../../utils/competitionPermissions';
import { getClubDirection } from '../../config/clubDirections';
import { CLUB_CONTACT_CHANNELS } from '../../config/clubContacts';
import { ACHIEVEMENT_PLACES } from '../../config/clubAchievements';
import { shortenClubName } from '../../utils/clubName';
import { DEFAULT_ACTIVITY_LEVEL } from '../../config/activityLifecycle';
import { useTabParam } from '../../hooks/useTabParam';
import { findBySlugOrId } from '../../utils/slug';
import { getClubsRoutes } from '../../utils/clubsRoutes';
import ClubTeamsSection from './ClubTeamsSection';
import ClubOrgStructureSection from './ClubOrgStructureSection';
import ClubStatisticsTab from './ClubStatisticsTab';
import ClubAboutTab from './ClubAboutTab';
import ClubAchievementsTab from './ClubAchievementsTab';
import ClubMediaUploader from './ClubMediaUploader';
import ClubMembershipHistory from './ClubMembershipHistory';
import ClubDocumentsTab from './ClubDocumentsTab';
import ClubRegistrationTab from './ClubRegistrationTab';
import ClubActivitiesPanel from './ClubActivitiesPanel';
import UpcomingActivitiesPreview from './UpcomingActivitiesPreview';
import CopyableId from '../common/CopyableId';
import ActivityRegistrationPanel from '../activities/ActivityRegistrationPanel';
import RegistrationStatusBadge from '../activities/RegistrationStatusBadge';
import EventEditForm from '../admin/EventEditForm';

// Per the professional "Klub tarkibi" management-workspace spec: "Koordinatorlar" and "A'zolar" are no
// longer separate tabs — Klub tarkibi now covers the whole roster (public sees only the coordinators,
// coordinator/admin see internal positions too). ClubCoordinatorsSection.jsx/ClubMembersSection.jsx are
// left on disk, just unrouted from here (same convention as every other retired-tab file in this app).
// "Tadbirlar"/"Musobaqalar" were merged into one persistent right-side panel per direct feedback
// (ClubActivitiesPanel.jsx) instead of being switchable tabs — ClubEventsTab.jsx/ClubCompetitionsTab.jsx
// are left on disk, unrouted, same convention.
// 'stats' is filtered out of `visibleTabs` for plain students below (public-facing "klub pasporti" is
// deliberately simpler than the admin/coordinator analytics view) — kept here in the full list so
// admin/coordinator still get it, and so an existing ?tab=stats deep link still validates.
const TABS = [
    { id: 'about', label: 'Haqida' },
    { id: 'structure', label: 'Klub tarkibi' },
    { id: 'teams', label: 'Jamoalar' },
    { id: 'achievements', label: 'Yutuqlar' },
    { id: 'stats', label: 'Statistika' },
    { id: 'documents', label: 'Klub hujjatlari' },
    // Ro'yxatdan o'tish/guvohnoma - koordinator/admin uchun, xuddi 'stats' kabi
    // pastda `visibleTabs` da oddiy talaba/tashqi ko'ruvchidan yashiriladi.
    { id: 'registration', label: "Ro'yxat" }
];

const TAB_IDS = TABS.map(t => t.id);

const ClubProfilePage = () => {
    const { slug } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const { user, hasClubRole } = useAuth();

    const routes = getClubsRoutes(location.pathname);
    const isAdmin = user?.role === ROLES.ADMIN;

    // Tab manzilda saqlanadi VA yoziladi. Ilgari u manzildan faqat O'QILARDI
    // (havola ochilganda kerakli tab chiqsin uchun), keyin esa `useState` da
    // qolib ketardi - ya'ni tab almashtirish brauzer uchun umuman sodir
    // bo'lmagan hisoblanardi va orqaga bosilganda klub sahifasidan chiqib
    // ketilardi.
    const [activeTab, setActiveTab] = useTabParam(TAB_IDS, 'about');
    const [refreshKey, setRefreshKey] = useState(0);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', description: '', category: '', pointsModifier: 1.0, contacts: {} });
    // Saqlash xatosi oynada ko'rsatiladi. Ilgari `updateClub` xatosi hech
    // qayerda ushlanmasdi va oyna jimgina ochiq qolardi.
    const [editError, setEditError] = useState('');
    // Registration modal — opened from either UpcomingActivitiesPreview or ClubActivitiesPanel (both
    // pass {type:'event'|'competition', raw:<the real event/competition object>}). Renders the exact
    // same ActivityRegistrationPanel EventsCalendar.jsx/EventManagement.jsx already use, rather than a
    // 3rd bespoke registration surface — was previously a dead end (see those two components' own
    // updated comments) with no working registration entry point from inside a club's own page at all.
    const [selectedActivity, setSelectedActivity] = useState(null);

    const students = useMemo(() => db.getMockStudents(), []);
    // Real Supabase members (Phase 1) are a separate identity pool from the 550 synthetic
    // getMockStudents() — merged here so a real member's name resolves correctly instead of blank.
    const studentById = useMemo(
        () => new Map([...students, ...db.getSyncedProfiles()].map(s => [s.id, s])),
        [students, refreshKey]
    );

    // Arxivlangan klub ham OCHILADI: uning sahifasi va tarixi qoladi,
    // faqat ro'yxatlarda ko'rinmaydi. Aks holda havola "topilmadi" berardi.
    const rankedClubs = useMemo(() => db.getRankedClubs({ includeArchived: true }), [refreshKey]);
    const club = useMemo(() => findBySlugOrId(rankedClubs, slug), [rankedClubs, slug]);

    // getClubScoreBreakdown already computes each real member's social-score total, sorted descending —
    // reused here (rather than recomputed) so every member/coordinator row gets a genuine individual
    // rank instead of repeating the club's own rank on every row.
    const scoreByUserId = useMemo(() => {
        if (!club) return new Map();
        const breakdown = db.getClubScoreBreakdown(club.id);
        return new Map((breakdown?.memberDetails || []).map(m => [m.userId, m.score]));
    }, [club, refreshKey]);

    const members = useMemo(() => {
        if (!club) return [];
        const raw = db.getClubMembers(club.id).map(m => ({
            ...m,
            student: studentById.get(m.userId),
            score: scoreByUserId.get(m.userId) || 0
        }));
        return [...raw].sort((a, b) => b.score - a.score).map((m, i) => ({ ...m, individualRank: i + 1 }));
    }, [club, studentById, scoreByUserId, refreshKey]);

    const teams = useMemo(() => {
        if (!club) return [];
        const raw = db.getClubTeams(club.id).map(t => {
            const teamMembers = db.getTeamMembers(t.id);
            // Jamoa ochkosi HAQIQIY yutuqlardan hisoblanadi. Ilgari u soxta
            // ma'lumotdan chiqardi, ya'ni jamoalar reytingi to'qib
            // chiqarilgan o'rinlar bo'yicha saralanardi.
            const achievements = db.getTeamAchievements(t.id);
            const points = achievements.reduce((sum, a) => sum + (ACHIEVEMENT_PLACES[a.place]?.weight || 0), 0);
            return { ...t, clubName: club.name, members: teamMembers, achievementCount: achievements.length, points };
        });
        return [...raw].sort((a, b) => b.points - a.points).map((t, i) => ({ ...t, rank: i + 1 }));
    }, [club, refreshKey]);

    const clubDocuments = useMemo(() => (club ? db.getClubDocuments(club.id) : []), [club, refreshKey]);
    const clubEvents = useMemo(() => (club ? db.getClubEvents(club.id) : []), [club]);
    const clubCompetitions = useMemo(() => (club ? db.getClubCompetitions(club.id) : []), [club, refreshKey]);
    const uniqueCoverage = useMemo(() => (club ? db.getClubUniqueCoverage(club.id) : 0), [club, refreshKey]);
    // "Faoliyatlar" = tadbirlar + musobaqalar umumiy soni. "Jami qatnashuvlar" = barcha activity
    // participations (takroriy ham hisoblanadi) — reads the existing participants[] rosters already
    // kept in sync by registerParticipant/registerForEvent, no new db.js function needed.
    const activitiesCount = clubEvents.length + clubCompetitions.length;
    const totalParticipations = useMemo(
        () => clubEvents.reduce((sum, e) => sum + (e.participants?.length || 0), 0)
            + clubCompetitions.reduce((sum, c) => sum + (c.participants?.length || 0), 0),
        [clubEvents, clubCompetitions]
    );
    const isMember = useMemo(() => !!user && members.some(m => m.userId === user.id), [members, user]);
    // "Sozlash" (spec): admin OR this specific club's own coordinator. "A'zo bo'lish" (spec): plain
    // students only — admin/rahbariyat/coordinator viewing a club they manage shouldn't see a join button.
    const canManageThisClub = !!club && (isAdmin || isClubCoordinator(user, hasClubRole, club.id));
    const canJoinAsStudent = user?.role === ROLES.STUDENT;

    // YUTUQLAR.
    //
    // Ikki manba db qatlamida birlashtiriladi (izohi db.getClubAchievements
    // ustida): berilgan rasmiy hujjatlardan avtomatik chiqadigan ichki
    // yutuqlar + dalil bilan tasdiqlangan tashqi yutuqlar.
    //
    // Sertifikatlar OLIB TASHLANDI: ular `clubName` bo'yicha filtrlanardi,
    // lekin sertifikat berilganda o'sha maydonga MUSOBAQA nomi yozilardi —
    // ya'ni filtr amalda hech qachon ishlamasdi.
    //
    // Boshqaruvchi tasdiqlanmagan yozuvlarni ham ko'radi, tashqi odam esa
    // faqat tasdiqlanganini.
    const achievementItems = useMemo(
        () => (club ? db.getClubAchievements(club.id, { includeAllStatuses: canManageThisClub }) : []),
        [club, canManageThisClub, refreshKey]
    );
    // "Statistika" tab + the fuller 5-card admin KPI row stay coordinator/admin-only — public/student
    // view gets the simplified 4-card set below (spec: "boshqaruv statistikasi emas, klub pasporti").
    const visibleTabs = canManageThisClub ? TABS : TABS.filter(t => t.id !== 'stats' && t.id !== 'registration');
    const effectiveActiveTab = (['stats', 'registration'].includes(activeTab) && !canManageThisClub) ? 'about' : activeTab;
    // Admin/coordinator's stat-card row is compacted into small corner badges on the tab bar itself
    // (per direct feedback) instead of a separate row: A'zolar -> Klub tarkibi, Jamoalar -> Jamoalar,
    // Yutuqlar -> Yutuqlar, Haqiqiy qamrov -> Statistika (which also shows the full number in its own
    // stat-card row, see ClubStatisticsTab.jsx).
    const TAB_BADGE_COUNTS = {
        structure: members.length,
        teams: teams.length,
        achievements: achievementItems.length,
        stats: uniqueCoverage,
        documents: clubDocuments.length
    };

    const handleJoin = async () => {
        if (!user || !club) return;
        // Real Supabase FK/RLS keys off the profile UUID (user.id), not the display username.
        await db.joinClub(user.id, club.id, 'member');
        setRefreshKey(k => k + 1);
    };

    const handleLeave = async () => {
        if (!user || !club) return;
        if (!window.confirm(`"${club.name}" klubi a'zoligidan chiqmoqchimisiz?`)) return;
        await db.leaveClub(user.id, club.id);
        setRefreshKey(k => k + 1);
    };

    const handleOpenEdit = () => {
        if (!club) return;
        setEditError('');
        setEditForm({
            name: club.name, description: club.description || '', category: club.category,
            pointsModifier: club.pointsModifier, contacts: { ...(club.contacts || {}) },
            shortName: club.shortName || '',
            joinPolicy: club.joinPolicy || 'open',
            ladder: mergeLadder(club.ladder),
            about: { ...(club.about || {}) },
        });
        setIsEditOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!club) return;
        setEditError('');
        try {
            await db.updateClub(club.id, editForm);
            setIsEditOpen(false);
            setRefreshKey(k => k + 1);
        } catch (err) {
            // `clubs.data` ustuni yo'q bo'lsa - qaysi SQL faylni ishga
            // tushirish kerakligi shu xabarda yozilgan.
            setEditError(err?.message || 'Saqlashda xatolik yuz berdi.');
        }
    };

    // --- A'ZOLIKKA ARIZA ---
    const myJoinRequest = useMemo(
        () => (user && club ? db.getMyJoinRequest(user.id || user.username, club.id) : null),
        [user, club, refreshKey]
    );
    const [joinRequestOpen, setJoinRequestOpen] = useState(false);
    const [joinMotivation, setJoinMotivation] = useState('');
    const [joinError, setJoinError] = useState('');

    const handleSubmitJoinRequest = async () => {
        setJoinError('');
        try {
            await db.requestToJoinClub({
                userId: user.id || user.username, clubId: club.id, motivation: joinMotivation,
            });
            setJoinRequestOpen(false);
            setJoinMotivation('');
            setRefreshKey(k => k + 1);
        } catch (err) {
            setJoinError(err?.message || 'Ariza yuborilmadi.');
        }
    };

    // Koordinator/admin uchun - ko'rib chiqilmagan arizalar.
    const pendingJoinRequests = useMemo(
        () => (club && canManageThisClub ? db.getClubJoinRequests(club.id, { status: 'pending' }) : []),
        [club, canManageThisClub, refreshKey]
    );

    const handleReviewJoin = async (requestId, action) => {
        let comment = '';
        if (action === 'reject') {
            comment = window.prompt('Rad etish sababi:') || '';
            if (!comment.trim()) return;
        }
        try {
            await db.reviewJoinRequest({
                requestId, action, comment, reviewedBy: user?.username || user?.id,
            });
            setRefreshKey(k => k + 1);
        } catch (err) {
            window.alert(err?.message || 'Xatolik yuz berdi.');
        }
    };

    const handleSetStatus = async (status) => {
        setEditError('');
        try {
            await db.setClubStatus(club.id, status);
            setRefreshKey(k => k + 1);
        } catch (err) {
            setEditError(err?.message || 'Holatni o\'zgartirib bo\'lmadi.');
        }
    };

    // VAQTINCHALIK OFF/ON - "Arxivlash" bilan ARALASHTIRILMAYDI (izohi
    // config/clubRegistration.js da: "ikki o'qli holat"). Arxivlash - xato
    // yaratilgan yoki butunlay yopilgan klub uchun, kamdan-kam qaytariladi.
    // Bu esa `operationalStatus` - klub faoliyati vaqtincha to'xtatilganda
    // (masalan ta'til, rahbar almashinuvi) ishlatiladi va istalgan payt
    // "Faollashtirish" bilan qaytariladi. Bonus: bu o'zgarish "Holat
    // tarixi"ga ham yoziladi (db.setClubOperationalStatus ichida) - eski
    // arxivlash esa hech qanday audit izsiz qolardi.
    const isInactive = club.operationalStatus === OPERATIONAL_STATUS.INACTIVE;
    const handleQuickToggleStatus = async () => {
        try {
            await db.setClubOperationalStatus(
                club.id,
                isInactive ? OPERATIONAL_STATUS.ACTIVE : OPERATIONAL_STATUS.INACTIVE,
                { reason: isInactive ? "Qaytadan faollashtirildi" : "Vaqtincha to'xtatildi", actor: user?.username }
            );
            setRefreshKey(k => k + 1);
        } catch (err) {
            window.alert(err?.message || 'Holatni o\'zgartirib bo\'lmadi.');
        }
    };

    const handleDeleteClub = async () => {
        if (!club) return;
        if (!window.confirm(`"${club.name}" klubini butunlay o'chirmoqchimisiz? Bu amalni orqaga qaytarib bo'lmaydi.`)) return;
        await db.deleteClub(club.id);
        navigate(routes.list);
    };

    // Same normalized activity/activityType/clubId/startDateTime derivation EventsCalendar.jsx uses.
    const selectedActivityType = selectedActivity?.type || null;
    const selectedActivityRaw = selectedActivity?.raw || null;
    const selectedActivityClubId = selectedActivityRaw
        ? (selectedActivityType === 'competition'
            ? (selectedActivityRaw.contextType === 'club' ? selectedActivityRaw.contextId : null)
            : selectedActivityRaw.clubId)
        : null;
    const selectedActivityStartDateTime = selectedActivityRaw
        ? (selectedActivityType === 'competition' ? db.combineDateTime(selectedActivityRaw.startDate, selectedActivityRaw.startTime) : selectedActivityRaw.date)
        : null;
    const refreshSelectedActivity = () => {
        if (!selectedActivity) return;
        const fresh = selectedActivityType === 'competition'
            ? db.getCompetitionById(selectedActivityRaw.id)
            : db.getEvents().find(e => e.id === selectedActivityRaw.id);
        setSelectedActivity(prev => (prev ? { ...prev, raw: fresh } : prev));
        setRefreshKey(k => k + 1);
    };

    // Full event management inline in this same modal — sidesteps the routing gap where no
    // coordinator-reachable event-management page exists anywhere except admin-only /admin/events
    // (this modal is already reachable by student-role coordinators). Mirrors EventManagement.jsx's own
    // formData shape exactly so EventEditForm's onSave/onChange contract stays identical either way.
    const [eventEditFormData, setEventEditFormData] = useState(null);
    const [eventEditSaveError, setEventEditSaveError] = useState('');
    useEffect(() => {
        if (selectedActivityType !== 'event' || !selectedActivityRaw) { setEventEditFormData(null); return; }
        const [datePart, timePart] = (selectedActivityRaw.date || '').split('T');
        setEventEditSaveError('');
        setEventEditFormData({
            title: selectedActivityRaw.title, description: selectedActivityRaw.description || '',
            date: datePart || '', time: timePart ? timePart.slice(0, 5) : '',
            endTime: selectedActivityRaw.endTime || '',
            clubId: selectedActivityRaw.clubId, location: selectedActivityRaw.location || '',
            locationType: selectedActivityRaw.locationType || 'physical',
            registrationRequired: !!selectedActivityRaw.registrationRequired,
            registrationType: selectedActivityRaw.registrationType || 'individual',
            maxParticipants: selectedActivityRaw.maxParticipants ?? null,
            teamMinSize: selectedActivityRaw.teamMinSize ?? null,
            teamMaxSize: selectedActivityRaw.teamMaxSize ?? null,
            teamCompositionRule: selectedActivityRaw.teamCompositionRule || 'mixed',
            teamCourseRule: selectedActivityRaw.teamCourseRule || 'mixed',
            waitlistEnabled: !!selectedActivityRaw.waitlistEnabled,
            approvalRequired: !!selectedActivityRaw.approvalRequired,
            registrationOpensAt: selectedActivityRaw.registrationOpensAt || '',
            registrationClosesAt: selectedActivityRaw.registrationClosesAt || '',
            // Tadbir turi va darajasi. Bularsiz forma tadbir XALQARO bo'lsa ham
            // "Universitet" deb ko'rsatardi - noto'g'ri ko'rsatish eng yomon turdagi
            // xato, chunki foydalanuvchi buni sezmaydi.
            eventType: selectedActivityRaw.eventType || '',
            level: selectedActivityRaw.level || DEFAULT_ACTIVITY_LEVEL
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedActivityType, selectedActivityRaw?.id]);

    const eventEditLocationConflict = useMemo(() => {
        if (!eventEditFormData?.location?.trim() || !eventEditFormData?.date) return null;
        return db.checkLocationConflict(eventEditFormData.location, db.combineDateTime(eventEditFormData.date, eventEditFormData.time), selectedActivityRaw?.id);
    }, [eventEditFormData, selectedActivityRaw]);

    const handleSaveEventEdit = async () => {
        setEventEditSaveError('');
        if (eventEditLocationConflict) {
            setEventEditSaveError(`"${eventEditFormData.location}" shu vaqtda band: "${eventEditLocationConflict.title}" tadbiri uchun allaqachon band qilingan.`);
            return;
        }
        const payload = {
            title: eventEditFormData.title, description: eventEditFormData.description,
            date: db.combineDateTime(eventEditFormData.date, eventEditFormData.time),
            endTime: eventEditFormData.endTime || null,
            clubId: eventEditFormData.clubId, location: eventEditFormData.location, locationType: eventEditFormData.locationType,
            registrationRequired: eventEditFormData.registrationRequired,
            registrationType: eventEditFormData.registrationRequired ? eventEditFormData.registrationType : undefined,
            maxParticipants: eventEditFormData.registrationRequired ? eventEditFormData.maxParticipants : null,
            teamMinSize: eventEditFormData.registrationRequired ? eventEditFormData.teamMinSize : null,
            teamMaxSize: eventEditFormData.registrationRequired ? eventEditFormData.teamMaxSize : null,
            teamCompositionRule: eventEditFormData.registrationRequired ? eventEditFormData.teamCompositionRule : 'mixed',
            teamCourseRule: eventEditFormData.registrationRequired ? eventEditFormData.teamCourseRule : 'mixed',
            waitlistEnabled: eventEditFormData.registrationRequired ? !!eventEditFormData.waitlistEnabled : false,
            approvalRequired: eventEditFormData.registrationRequired ? !!eventEditFormData.approvalRequired : false,
            registrationOpensAt: eventEditFormData.registrationRequired ? eventEditFormData.registrationOpensAt : '',
            registrationClosesAt: eventEditFormData.registrationRequired ? eventEditFormData.registrationClosesAt : '',
            eventType: eventEditFormData.eventType || null,
            level: eventEditFormData.level || DEFAULT_ACTIVITY_LEVEL
        };
        try {
            await db.updateEvent(selectedActivityRaw.id, payload);
            refreshSelectedActivity();
        } catch (err) {
            setEventEditSaveError(err?.message || "Tadbirni saqlashda xatolik yuz berdi.");
        }
    };

    // Attendance-only delegate (granted via EventEditForm's own "Vakolat berish" control) sees the
    // Davomat checklist here too, even though they aren't a real club coordinator and so can't edit the
    // event's own fields (canEditDetails stays gated to canManageThisClub specifically).
    const canManageSelectedEventAttendance = selectedActivityType === 'event' && selectedActivityRaw
        && (canManageThisClub || hasEventDelegatedPermission(user, selectedActivityRaw, 'attendance'));

    if (!club) {
        return (
            <div className="text-center py-20">
                <p className="text-gray-400 mb-4">Klub topilmadi</p>
                <Button variant="outline" icon={ArrowLeft} onClick={() => navigate(routes.list)}>Klublar ro'yxatiga qaytish</Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Button variant="outline" size="sm" icon={ArrowLeft} onClick={() => navigate(routes.list)}>
                Klublar ro'yxati
            </Button>

            {/* Main content (left) + persistent Tadbir/Musobaqa panel (right, sticky) — merged from what
                used to be two separate "Tadbirlar"/"Musobaqalar" tabs, per direct feedback. */}
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
            <div className="xl:col-span-3 space-y-6">
            {/* Hero */}
            <div className="relative bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl overflow-hidden">
                {/* Muqova rasmi - gradientning USTIGA qo'yiladi, o'rniga emas:
                    rasm yuklanmagan klubda gradient qoladi, yuklanganida esa
                    matn o'qilishi uchun ustiga qorong'i parda tushadi. */}
                {club.bannerUrl && (
                    <>
                        <img src={club.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-r from-gray-900/85 via-gray-900/65 to-gray-900/40" />
                    </>
                )}
                <div className="relative flex flex-col md:flex-row md:items-center gap-5">
                    <div className="w-20 h-20 rounded-3xl bg-white text-indigo-600 flex items-center justify-center font-black text-3xl shrink-0 shadow-lg overflow-hidden">
                        {club.logoUrl
                            ? <img src={club.logoUrl} alt={club.name} className="w-full h-full object-cover" />
                            : club.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <Badge variant="default">{getClubDirection(club.category)}</Badge>
                            <span className="text-xs font-bold text-white/80">#{club.rank} reyting</span>
                            <CopyableId value={`Klub #${club.displayNumber}`} className="text-xs font-bold text-white/60 hover:text-white">
                                Klub #{club.displayNumber}
                            </CopyableId>
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black">{club.name}</h1>
                        {club.createdAt && (
                            <p className="text-white/70 text-xs mt-1 flex items-center gap-1.5">
                                <Calendar size={12} /> {new Date(club.createdAt).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' })} dan beri
                            </p>
                        )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                        {isAdmin && club.status !== 'archived' && (
                            isInactive ? (
                                <Button
                                    variant="secondary" className="bg-emerald-500/90 text-white border-none hover:bg-emerald-500"
                                    icon={Play} onClick={handleQuickToggleStatus}
                                >
                                    Faollashtirish
                                </Button>
                            ) : (
                                <Button
                                    variant="secondary" className="bg-white/10 text-white border-none hover:bg-amber-500/80"
                                    icon={Pause} onClick={handleQuickToggleStatus}
                                >
                                    Nofaol qilish
                                </Button>
                            )
                        )}
                        {canManageThisClub && (
                            <Button variant="secondary" className="bg-white/10 text-white border-none hover:bg-white/20" icon={Settings} onClick={handleOpenEdit}>
                                Sozlash
                            </Button>
                        )}
                        {isMember ? (
                            <Button variant="secondary" className="bg-white/10 text-white border-none hover:bg-red-500/80" icon={UserMinus} onClick={handleLeave}>
                                A'zolikdan chiqish
                            </Button>
                        ) : canJoinAsStudent && club.status !== 'archived' && (
                            // ARIZALI KLUBDA tugma boshqacha: talaba darhol
                            // a'zo bo'lmaydi, ariza yuboradi. Ariza yuborilgan
                            // bo'lsa tugma o'rniga holat ko'rinadi - qayta
                            // bosish faqat takroriy xato berardi.
                            myJoinRequest ? (
                                <Button variant="secondary" className="bg-white/15 text-white border-none" icon={Clock} disabled>
                                    Ariza ko'rib chiqilmoqda
                                </Button>
                            ) : club.joinPolicy === 'application' ? (
                                <Button variant="secondary" className="bg-white text-indigo-700 hover:bg-white/90" icon={Send} onClick={() => setJoinRequestOpen(true)}>
                                    A'zolikka ariza
                                </Button>
                            ) : (
                                <Button variant="secondary" className="bg-white text-indigo-700 hover:bg-white/90" icon={UserPlus} onClick={handleJoin}>
                                    A'zo bo'lish
                                </Button>
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* ARXIV BELGISI - sahifa ochiq qoladi, lekin holat darrov
                ko'rinishi kerak: aks holda odam faoliyatdagi klub deb
                o'ylab ariza berardi. */}
            {club.status === 'archived' && (
                <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-amber-50 border border-amber-200">
                    <Archive size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-900">
                        <p className="font-bold">Bu klub arxivda</p>
                        <p className="text-xs mt-0.5">
                            Klub faoliyati to'xtatilgan. Sahifa va butun tarixi saqlangan,
                            lekin klub ro'yxatlarda ko'rinmaydi va unga a'zo bo'lib bo'lmaydi.
                        </p>
                    </div>
                </div>
            )}

            {/* NOFAOL BELGISI - arxivdan ALOHIDA. Klub ro'yxatlarda ko'rinishda
                davom etadi, a'zolik ham ochiq - faqat "hozircha faoliyat
                yuritmayapti" degan vaqtinchalik holat, kim ko'rsa ham bilib
                tursin. */}
            {isInactive && club.status !== 'archived' && (
                <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <Pause size={16} className="text-slate-500 shrink-0 mt-0.5" />
                    <div className="text-sm text-slate-800">
                        <p className="font-bold">Bu klub hozircha nofaol</p>
                        <p className="text-xs mt-0.5">
                            Klub vaqtincha faoliyat yuritmayapti. Sahifasi va a'zoligi ochiq -
                            xohlagan payt qayta faollashtirilishi mumkin.
                        </p>
                    </div>
                </div>
            )}

            {/* TEZ AMALLAR - koordinator uchun. Ilgari tadbir yoki musobaqa
                yaratish uchun boshqa bo'limga o'tish kerak edi, holbuki
                qaror aynan klub sahifasida tug'iladi. */}
            {canManageThisClub && club.status !== 'archived' && (
                <div className="flex flex-wrap gap-2">
                    <Button variant="primary" size="sm" icon={Calendar} onClick={() => navigate('/admin/events')}>
                        Tadbir yaratish
                    </Button>
                    <Button variant="outline" size="sm" icon={Trophy} onClick={() => navigate('/admin/competitions')}>
                        Musobaqa yaratish
                    </Button>
                    <Button variant="outline" size="sm" icon={UsersRound} onClick={() => setActiveTab('teams')}>
                        Jamoa qo'shish
                    </Button>
                    <Button variant="outline" size="sm" icon={UserPlus} onClick={() => setActiveTab('structure')}>
                        Lavozimga tayinlash
                    </Button>
                </div>
            )}

            {/* A'ZOLIKKA ARIZALAR - faqat kutayotganlari bo'lsa. */}
            {canManageThisClub && pendingJoinRequests.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 p-4">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
                        <UserPlus size={16} className="text-indigo-600" />
                        A'zolikka arizalar
                        <span className="text-xs font-black text-indigo-600">{pendingJoinRequests.length}</span>
                    </h3>
                    <p className="text-[11px] text-gray-400 mb-3">
                        Bu klub a'zolarni ariza orqali qabul qiladi. Tasdiqlangan ariza darhol
                        a'zolikka aylanadi.
                    </p>
                    <div className="divide-y divide-gray-50 dark:divide-gray-700">
                        {pendingJoinRequests.map(r => (
                            <div key={r.id} className="flex items-start gap-3 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                        {r.student?.fullName || r.userId}
                                    </p>
                                    <p className="text-[11px] text-gray-400">
                                        {r.student?.faculty}{r.student?.course ? ` · ${r.student.course}-kurs` : ''}
                                        {' · '}{new Date(r.createdAt).toLocaleDateString('uz-UZ')}
                                    </p>
                                    {r.motivation && (
                                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{r.motivation}</p>
                                    )}
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => handleReviewJoin(r.id, 'approve')}
                                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600"
                                    >
                                        Qabul qilish
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleReviewJoin(r.id, 'reject')}
                                        className="px-2.5 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-bold hover:bg-red-200"
                                    >
                                        Rad etish
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Spec section 9 — student-only preview; opens the registration modal directly (see selectedActivity) */}
            {!canManageThisClub && (
                <UpcomingActivitiesPreview
                    events={clubEvents}
                    competitions={clubCompetitions}
                    onSelectActivity={setSelectedActivity}
                />
            )}

            {/* Stat row — public/student keeps the simplified 4-card "klub pasporti" set. Admin/coordinator's
                fuller numbers (A'zolar/Jamoalar/Yutuqlar/Haqiqiy qamrov) moved onto the tab bar itself as
                small corner badges (per direct feedback) instead of a separate card row — same info, more
                compact. Full detail (incl. Tadbirlar/Musobaqalar/Faollik reytingi) still lives in the
                "Statistika" tab, which also now includes Haqiqiy qamrov. */}
            {!canManageThisClub && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { icon: UsersRound, value: teams.length, label: 'Jamoalar' },
                        { icon: Activity, value: activitiesCount, label: 'Faoliyatlar' },
                        { icon: Repeat, value: totalParticipations, label: 'Jami qatnashuvlar' },
                        { icon: Trophy, value: achievementItems.length, label: 'Yutuqlar' }
                    ].map(s => (
                        <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 text-center">
                            <s.icon className="w-5 h-5 text-indigo-500 mx-auto mb-1.5" />
                            <p className="text-xl font-black text-gray-900 dark:text-gray-100">{s.value}</p>
                            <p className="text-[11px] text-gray-400 font-bold uppercase">{s.label}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Tabs — sticky right below the app header (h-16/top-0) so it stays visible while scrolling */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                <div className="sticky top-16 z-30 flex overflow-x-auto border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-t-2xl">
                    {visibleTabs.map(tab => {
                        const badgeValue = canManageThisClub ? TAB_BADGE_COUNTS[tab.id] : undefined;
                        return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`inline-flex items-center gap-1.5 px-5 py-3.5 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${
                                effectiveActiveTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            {tab.label}
                            {badgeValue != null && badgeValue > 0 && (
                                <span className={`min-w-[18px] h-[18px] px-1 text-[10px] rounded-full flex items-center justify-center font-bold ${
                                    effectiveActiveTab === tab.id ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300'
                                }`}>
                                    {badgeValue}
                                </span>
                            )}
                        </button>
                        );
                    })}
                </div>

                <div className="p-6">
                    {effectiveActiveTab === 'about' && (
                        <ClubAboutTab
                            club={club}
                            canManage={canManageThisClub}
                            onEditContacts={handleOpenEdit}
                        />
                    )}
                    {effectiveActiveTab === 'structure' && (
                        <div className="space-y-4">
                            <ClubOrgStructureSection
                                club={club}
                                refreshKey={refreshKey}
                                onRefresh={() => setRefreshKey(k => k + 1)}
                            />
                            {/* Tarix tarkib bilan bir joyda: "hozir kim bor"
                                va "kim bo'lgan" bitta savolning ikki tomoni. */}
                            <ClubMembershipHistory clubId={club.id} version={refreshKey} />
                        </div>
                    )}
                    {effectiveActiveTab === 'teams' && <ClubTeamsSection teams={teams} teamBase={routes.teamBase} />}
                    {effectiveActiveTab === 'achievements' && (
                        <ClubAchievementsTab
                            club={club}
                            items={achievementItems}
                            canManage={canManageThisClub}
                            isAdmin={isAdmin}
                            onChanged={() => setRefreshKey(k => k + 1)}
                        />
                    )}
                    {effectiveActiveTab === 'stats' && canManageThisClub && (
                        <ClubStatisticsTab
                            club={club}
                            memberCount={members.length}
                            teamCount={teams.length}
                            eventCount={clubEvents.length}
                            achievementCount={achievementItems.length}
                        />
                    )}
                    {effectiveActiveTab === 'documents' && (
                        <ClubDocumentsTab
                            club={club}
                            documents={clubDocuments}
                            canManage={canManageThisClub}
                            isAdmin={isAdmin}
                            onRefresh={() => setRefreshKey(k => k + 1)}
                        />
                    )}

                    {effectiveActiveTab === 'registration' && canManageThisClub && (
                        <ClubRegistrationTab
                            club={club}
                            isAdmin={isAdmin}
                            onRefresh={() => setRefreshKey(k => k + 1)}
                            onGoToDocuments={() => setActiveTab('documents')}
                        />
                    )}
                </div>
            </div>
            </div>

            <ClubActivitiesPanel events={clubEvents} competitions={clubCompetitions} onSelectActivity={setSelectedActivity} />
            </div>

            {/* A'ZOLIKKA ARIZA. Motivatsiya IXTIYORIY: uni majburiy qilish
                arizani to'sib qo'yardi, holbuki koordinator baribir
                talabaning portfoliosini ko'radi. */}
            <Modal isOpen={joinRequestOpen} onClose={() => setJoinRequestOpen(false)} title="A'zolikka ariza">
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        <b>{club.name}</b> klubi a'zolarni ariza orqali qabul qiladi.
                        Arizangizni klub koordinatori ko'rib chiqadi.
                    </p>
                    <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1">
                            Nega bu klubga qo'shilmoqchisiz? (ixtiyoriy)
                        </label>
                        <textarea
                            rows={3}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                            placeholder="Qiziqishlaringiz, tajribangiz yoki kutayotgan natijangiz..."
                            value={joinMotivation}
                            onChange={e => setJoinMotivation(e.target.value)}
                        />
                    </div>
                    {joinError && (
                        <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            {joinError}
                        </p>
                    )}
                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => setJoinRequestOpen(false)}>
                            Bekor qilish
                        </Button>
                        <Button variant="primary" className="flex-1" onClick={handleSubmitJoinRequest}>
                            Arizani yuborish
                        </Button>
                    </div>
                </div>
            </Modal>

            {canManageThisClub && (
                <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Klubni sozlash">
                    {/* `min-w-0` - ichidagi keng element (rasm, uzun nom)
                        konteynerni cho'zib, kontentni oynadan chiqarib
                        yubormasin. */}
                    <div className="space-y-4 min-w-0">
                        {/* Rasmlar DARHOL saqlanadi - "Saqlash" tugmasini
                            kutmaydi. Sabab: fayl yuklash o'z-o'zidan yakunlangan
                            amal, uni forma bilan bog'lash koordinator rasm
                            yuklab, keyin oynani yopsa uni yo'qotardi. */}
                        <div className="space-y-3 pb-3 border-b">
                            <ClubMediaUploader
                                kind="banner" clubId={club.id}
                                currentUrl={club.bannerUrl}
                                onUploaded={() => setRefreshKey(k => k + 1)}
                            />
                            <ClubMediaUploader
                                kind="logo" clubId={club.id}
                                currentUrl={club.logoUrl}
                                fallbackText={club.name.charAt(0)}
                                onUploaded={() => setRefreshKey(k => k + 1)}
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-black text-gray-500 uppercase mb-1">Nomi</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
                                value={editForm.name}
                                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-black text-gray-500 uppercase mb-1">Tavsifi</label>
                            <textarea
                                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
                                rows={3}
                                value={editForm.description}
                                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                            />
                        </div>
                        {/* QISQA NOM - tor joylar uchun. Ilgari uzun nomlar
                            taxmin bilan qisqartirilardi (analitika jadvali). */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="min-w-0">
                                <label className="block text-xs font-black text-gray-500 uppercase mb-1">
                                    Qisqa nom (ixtiyoriy)
                                </label>
                                <input
                                    type="text"
                                    placeholder={shortenClubName(club.name)}
                                    className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
                                    value={editForm.shortName}
                                    onChange={e => setEditForm({ ...editForm, shortName: e.target.value })}
                                />
                                {/* Qisqa nom NIMAGA kerakligini ko'rsatib
                                    aytish kerak: uning ta'siri faqat tor
                                    ustunlarda ko'rinadi va sozlamadan
                                    turib buni tushunish qiyin. */}
                                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed break-words">
                                    Tor ustunlarda to'liq nom sig'maydi va qirqiladi:
                                    {' '}<span className="font-semibold text-gray-600">«{shortenClubName(club.name)}»</span>.
                                    Bu yerga o'zingiz yozsangiz, o'sha ko'rinadi.
                                </p>
                            </div>
                            <div className="min-w-0">
                                <label className="block text-xs font-black text-gray-500 uppercase mb-1">A'zolik tartibi</label>
                                <select
                                    className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium bg-white"
                                    value={editForm.joinPolicy}
                                    onChange={e => setEditForm({ ...editForm, joinPolicy: e.target.value })}
                                >
                                    <option value="open">Ochiq</option>
                                    <option value="application">Ariza orqali</option>
                                </select>
                                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                                    {editForm.joinPolicy === 'application'
                                        ? "Talaba ariza yuboradi, koordinator qabul qiladi yoki rad etadi."
                                        : "Talaba «A'zo bo'lish» tugmasini bosishi bilan a'zo bo'ladi."}
                                </p>
                            </div>
                        </div>

                        {/* ZINAPOYA TALABLARI.
                            Har klub o'zinikini belgilaydi: yiliga 2 ta tadbir o'tkazadigan
                            klub bilan har oy tadbir qiladigan klubga bir xil talab qo'yish
                            bajarib bo'lmaydigan bo'lardi.
                            Bu talablar arizani BLOKLAMAYDI - ular talabaga ham, koordinatorga
                            ham ko'rsatiladi, qaror esa koordinatorda qoladi. */}
                        <div className="space-y-3 pt-4 border-t">
                            <div>
                                <p className="text-xs font-black text-gray-500 uppercase">Lavozim talablari</p>
                                <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                                    Talaba lavozimga ariza berayotganda bu ko'rsatkichlar unga ko'rsatiladi.
                                    Talab bajarilmagan bo'lsa ham ariza yuborilaveradi — qarorni siz qabul qilasiz.
                                </p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {[
                                    ['attendancePercent', '%'],
                                    ['organizerCount', 'marta'],
                                    ['internalMonths', 'oy'],
                                    ['organizerCountAssistant', 'marta'],
                                    ['assistantMonths', 'oy'],
                                    ['minClubEvents', 'ta tadbir'],
                                ].map(([field, unit]) => (
                                    <div key={field} className="min-w-0">
                                        <label className="block text-[11px] font-bold text-gray-500 mb-1">
                                            {LADDER_FIELD_LABELS[field]}
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-24 px-3 py-2 border rounded-xl text-sm"
                                                value={editForm.ladder?.[field] ?? ''}
                                                onChange={e => setEditForm({
                                                    ...editForm,
                                                    ladder: {
                                                        ...editForm.ladder,
                                                        // Bo'sh qoldirilsa platforma qiymatiga qaytadi.
                                                        [field]: e.target.value === '' ? undefined : Number(e.target.value),
                                                    },
                                                })}
                                            />
                                            <span className="text-xs text-gray-400">{unit}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* KLUBNING O'Z MATNI. Ilgari "Haqida" bo'limida
                            yo'nalish bo'yicha umumiy matn turardi va u barcha
                            shu yo'nalishdagi klublarda bir xil edi. */}
                        <div className="space-y-3 pt-2 border-t">
                            <h4 className="text-xs font-black text-gray-500 uppercase">Haqida bo'limi</h4>
                            {[
                                { key: 'goals', label: 'Maqsadlar', placeholder: 'Klub nimaga erishishni maqsad qilgan?' },
                                { key: 'activities', label: "Qanday faoliyatlar o'tkaziladi", placeholder: 'Mashg\'ulotlar, musobaqalar, loyihalar...' },
                                { key: 'audience', label: "Kimlar uchun mo'ljallangan", placeholder: 'Qaysi talabalarni kutasiz?' },
                            ].map(f => (
                                <div key={f.key}>
                                    <label className="block text-[11px] font-bold text-gray-500 mb-1">{f.label}</label>
                                    <textarea
                                        rows={2}
                                        placeholder={f.placeholder}
                                        className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm"
                                        value={editForm.about?.[f.key] || ''}
                                        onChange={e => setEditForm({
                                            ...editForm,
                                            about: { ...(editForm.about || {}), [f.key]: e.target.value },
                                        })}
                                    />
                                </div>
                            ))}
                            <p className="text-[11px] text-gray-400">
                                Bo'sh qoldirilgan bo'lim klub sahifasida ko'rinmaydi.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="min-w-0">
                                <label className="block text-xs font-black text-gray-500 uppercase mb-1">Kategoriya</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
                                    value={editForm.category}
                                    onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-500 uppercase mb-1">Ball Ko'paytuvchisi</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
                                    value={editForm.pointsModifier}
                                    onChange={e => setEditForm({ ...editForm, pointsModifier: parseFloat(e.target.value) || 1.0 })}
                                />
                            </div>
                        </div>

                        {/* ALOQA VA IJTIMOIY TARMOQLAR.
                            Alohida oyna ochilmadi: koordinator uchun bu ham
                            klub sozlamasi, uni boshqa joydan qidirish ortiqcha.
                            Maydonlar ro'yxati clubContacts.js dan keladi. */}
                        <div className="pt-2 border-t">
                            <h4 className="text-xs font-black text-gray-500 uppercase mb-1">Aloqa va ijtimoiy tarmoqlar</h4>
                            <p className="text-[11px] text-gray-400 mb-3">
                                To'liq havola yozish shart emas — "@klub_nomi" ham yetarli.
                                Bo'sh qoldirilgan maydon sahifada ko'rinmaydi.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {CLUB_CONTACT_CHANNELS.map(ch => (
                                    <div key={ch.key}>
                                        <label className="block text-[11px] font-bold text-gray-500 mb-1">{ch.label}</label>
                                        <input
                                            type="text"
                                            placeholder={ch.placeholder}
                                            className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                                            value={editForm.contacts?.[ch.key] || ''}
                                            onChange={e => setEditForm({
                                                ...editForm,
                                                contacts: { ...(editForm.contacts || {}), [ch.key]: e.target.value },
                                            })}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {editError && (
                            <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                                {editError}
                            </p>
                        )}

                        {/* ARXIVLASH O'CHIRISHDAN OLDIN turadi va ko'proq
                            joy egallaydi - deyarli har doim kerak bo'ladigan
                            amal aynan shu. O'chirish tadbirlar, a'zolik va
                            yutuqlarni bog'lanmagan holda qoldiradi. */}
                        {isAdmin && (
                            <div className="pt-3 border-t space-y-2">
                                <h4 className="text-xs font-black text-gray-500 uppercase">Klub holati</h4>
                                {club.status === 'archived' ? (
                                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
                                        <p className="text-xs text-amber-800">
                                            Klub arxivda — ro'yxatlarda ko'rinmaydi, sahifasi va tarixi saqlangan.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => handleSetStatus('active')}
                                            className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 shrink-0"
                                        >
                                            Qaytarish
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => handleSetStatus('archived')}
                                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-amber-200 text-amber-700 text-sm font-bold hover:bg-amber-50"
                                    >
                                        <Archive size={15} /> Arxivga o'tkazish
                                    </button>
                                )}
                                <p className="text-[11px] text-gray-400">
                                    Arxivlash tarixni saqlaydi. O'chirish esa tadbirlar, a'zolik va
                                    yutuqlarni bog'lanmagan holda qoldiradi — uni faqat xato bilan
                                    yaratilgan klub uchun ishlating.
                                </p>
                            </div>
                        )}

                        <div className="flex gap-3 pt-4 border-t">
                            {isAdmin && (
                                <Button variant="outline" className="flex-1 font-bold text-red-600 border-red-200 hover:bg-red-50" icon={Trash2} onClick={handleDeleteClub}>
                                    Klubni o'chirish
                                </Button>
                            )}
                            <Button variant="outline" className="flex-1 font-bold" onClick={() => setIsEditOpen(false)}>Bekor qilish</Button>
                            <Button variant="primary" className="flex-1 font-bold bg-indigo-600" onClick={handleSaveEdit}>Saqlash</Button>
                        </div>
                    </div>
                </Modal>
            )}

            {selectedActivity && selectedActivityRaw && (
                <Modal isOpen={!!selectedActivity} onClose={() => setSelectedActivity(null)} title={selectedActivityRaw.name || selectedActivityRaw.title}>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
                            <span className="text-xs text-gray-500 flex items-center gap-1.5">
                                <Calendar size={13} />
                                {selectedActivityStartDateTime ? new Date(selectedActivityStartDateTime).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                            </span>
                            <div className="flex items-center gap-2">
                                <RegistrationStatusBadge
                                    activity={selectedActivityRaw}
                                    startDateTime={selectedActivityStartDateTime}
                                    registeredCount={db.getRegistrationsForActivity(selectedActivityRaw.id, selectedActivityType).filter(r => r.status === 'registered').length}
                                />
                                <button
                                    type="button"
                                    title="Ochiq havolani nusxalash — login shart emas"
                                    onClick={() => {
                                        const path = selectedActivityType === 'competition' ? 'musobaqa' : 'tadbir';
                                        const url = `${window.location.origin}/${path}/${selectedActivityRaw.id}`;
                                        if (navigator.share) {
                                            navigator.share({ title: selectedActivityRaw.name || selectedActivityRaw.title, url }).catch(() => {});
                                        } else if (navigator.clipboard) {
                                            navigator.clipboard.writeText(url).then(() => alert('Havola nusxalandi'));
                                        }
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                >
                                    <Share2 size={14} />
                                </button>
                            </div>
                        </div>
                        {selectedActivityType === 'competition' && canManageThisClub && (
                            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex flex-col items-center text-center gap-3">
                                <Award className="w-8 h-8 text-indigo-600" />
                                <div>
                                    <h4 className="font-bold text-indigo-900 text-sm">Musobaqani boshqarish</h4>
                                    <p className="text-xs text-indigo-700 mt-0.5">Natijalar, raundlar va davomatni boshqarish uchun ish maydoniga o'ting</p>
                                </div>
                                <Button
                                    variant="primary" size="sm" icon={Play} className="bg-indigo-600 text-white w-full"
                                    onClick={() => navigate(`/${isAdmin ? 'admin' : 'student'}/competitions/${selectedActivityRaw.id}`)}
                                >
                                    Boshqarish
                                </Button>
                            </div>
                        )}

                        {selectedActivityType === 'event' && (canManageThisClub || canManageSelectedEventAttendance) && eventEditFormData ? (
                            <EventEditForm
                                event={selectedActivityRaw}
                                formData={eventEditFormData}
                                onChange={patch => setEventEditFormData(prev => ({ ...prev, ...patch }))}
                                clubs={[club]}
                                lockClub
                                locationConflict={eventEditLocationConflict}
                                saveError={eventEditSaveError}
                                onSave={handleSaveEventEdit}
                                user={user}
                                hasClubRole={hasClubRole}
                                isAdmin={isAdmin}
                                isManagement={user?.role === 'RAHBARIYAT'}
                                canEditDetails={canManageThisClub}
                                canManageAttendance={canManageSelectedEventAttendance}
                                actingUsername={user?.username || 'admin'}
                                onDataChanged={refreshSelectedActivity}
                                // Koordinatorda ham endi alohida ish maydoni bor, shuning
                                // uchun bu oyna ham admindagi kabi faqat tahrirlash uchun
                                // qoladi. Davomat vakolati berilgan odamga forma ochilmaydi -
                                // unga faqat quyidagi havola ko'rinadi va u to'g'ri joyga olib boradi.
                                showManagement={false}
                                headerExtra={(
                                    <button
                                        type="button"
                                        onClick={() => navigate(`/${isAdmin ? 'admin' : 'student'}/events/${selectedActivityRaw.id}`)}
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
                        ) : (
                            <ActivityRegistrationPanel
                                activity={selectedActivityRaw}
                                activityType={selectedActivityType}
                                clubId={selectedActivityClubId}
                                startDateTime={selectedActivityStartDateTime}
                                user={user}
                                isAdmin={isAdmin}
                                isManagement={user?.role === 'RAHBARIYAT'}
                                hasClubRole={hasClubRole}
                                onRegistered={refreshSelectedActivity}
                            />
                        )}
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default ClubProfilePage;
