import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserPlus, CheckCircle2, Clock, Shield, X, Paperclip, Hourglass, XCircle, AlertTriangle } from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import StudentPicker from '../common/StudentPicker';
import CopyableId from '../common/CopyableId';
import { db, POSITION_TYPE_LABELS } from '../../services/db';
import { TOURNAMENT_FILE_UPLOAD } from '../../constants';

const OVERRIDE_REASONS = ['Kechikib keldi', 'Texnik muammo', 'Rasmiy ruxsat', 'Tashkilotchi qarori', 'Boshqa'];

// A static (non-interactive) status line, styled like every other action button in this panel so the
// visual rhythm stays consistent — 4 near-identical `<Button disabled>` blocks (registered/waitlisted/
// closed/full) used to each hand-repeat this same shape.
const StatusPill = ({ icon, variant = 'secondary', children }) => (
    <Button variant={variant} className="w-full py-3" disabled icon={icon}>{children}</Button>
);

// The ONE registration action area — reused identically inside EventsCalendar.jsx (student) and
// EventManagement.jsx (admin/coordinator) for both events and competitions. Only the admin-override
// section is permission-gated (canOverride); everything else — register, waitlist, team invites,
// re-registration — renders the same way for every role, per "bir xil ko'rinish, faqat ruxsatlar
// farq qilsin". Never touches comp.participants/event.registrations directly — everything goes
// through db.registerForActivity/respondToTeamInvite/confirmWaitlistOffer/overrideAddParticipant.
const ActivityRegistrationPanel = ({ activity, activityType, clubId, startDateTime, user, isAdmin, isManagement, hasClubRole, onRegistered }) => {
    const [refreshKey, setRefreshKey] = useState(0);
    const [error, setError] = useState('');
    const [teamName, setTeamName] = useState('');
    const [invitees, setInvitees] = useState([]);
    // Admin's configured floor (activity.teamMinSize) is now really enforced server-side
    // (registerForActivity) — default the captain's own choice to it so the input doesn't start below
    // a value that would just get rejected on submit.
    const [minTeamSize, setMinTeamSize] = useState(activity.teamMinSize || 2);
    // Tashkilotchi belgilagan eng kam hajm. `useState` yuqorida FAQAT BIR MARTA
    // ishlaydi - agar panel `activity` to'liq yuklanmasidan oldin chizilgan
    // bo'lsa, maydon 2 bo'lib qotib qolardi va keyin yuborishda serverda rad
    // etilardi. Kapitan esa 5 kishi qo'shib turib "jamoa kamida 4 kishi bo'lsin"
    // xabarini ko'rar, xato qayerdaligini topolmasdi. Shu sabab qiymat
    // ma'lum bo'lgan zahoti ko'tariladi.
    const teamFloor = Math.max(2, Number(activity.teamMinSize) || 2);
    useEffect(() => {
        setMinTeamSize(v => Math.max(Number(v) || 2, teamFloor));
    }, [teamFloor]);
    const [pickerValue, setPickerValue] = useState(null);
    const [chosenMode, setChosenMode] = useState(null); // for registrationType 'both': 'individual'|'team'
    // 'new' = today's invite-by-invite flow (unchanged); 'existing' = attach an already-real team the
    // captain leads (db.getTeamsForUser) directly, no invite/accept wait — see registerExistingTeam.
    const [teamSourceMode, setTeamSourceMode] = useState('new');
    const [existingTeamId, setExistingTeamId] = useState('');
    // Pre-filled from ?invite=CODE (the shareable link CopyableId now generates next to "Taklif kodi") —
    // someone who opens that link straight from WhatsApp/Telegram/etc. lands here with the code already
    // typed in, only needs to press "Qo'shilish" (still requires being logged in first, same as any
    // other registration action — PublicActivityPage.jsx handles that redirect).
    const [searchParams] = useSearchParams();
    const [joinCode, setJoinCode] = useState(() => (searchParams.get('invite') || '').toUpperCase());
    // Metadata-only attachment (same disclosed convention as TournamentReviewStep.jsx/ClubDocumentsTab.jsx
    // — file bytes are never persisted, only name/size, matching what a real backend would keep alongside
    // the stored file). Optional — most activities won't require it.
    const [attachment, setAttachment] = useState(null);
    const [attachmentError, setAttachmentError] = useState('');
    const handleAttachmentFile = (file) => {
        if (!file) return;
        setAttachmentError('');
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!TOURNAMENT_FILE_UPLOAD.ALLOWED_EXTENSIONS.includes(ext)) {
            setAttachmentError(`Ruxsat etilmagan format. Qabul qilinadi: ${TOURNAMENT_FILE_UPLOAD.ALLOWED_EXTENSIONS.join(', ')}`);
            return;
        }
        if (file.size > TOURNAMENT_FILE_UPLOAD.MAX_SIZE_MB * 1024 * 1024) {
            setAttachmentError(`Fayl hajmi ${TOURNAMENT_FILE_UPLOAD.MAX_SIZE_MB} MB dan oshmasligi kerak.`);
            return;
        }
        setAttachment({ name: file.name, sizeLabel: `${(file.size / 1024 / 1024).toFixed(2)} MB` });
    };
    const [showOverride, setShowOverride] = useState(false);
    const [overrideStudent, setOverrideStudent] = useState(null);
    const [overrideTeamId, setOverrideTeamId] = useState('');
    // 'existing' = attach an already-real team (overrideAddTeam); 'new' = admin creates a brand-new real
    // team on the spot (overrideCreateTeam) — the sibling gap overrideAddTeam alone left open.
    const [overrideTeamSourceMode, setOverrideTeamSourceMode] = useState('existing');
    const [overrideNewTeamName, setOverrideNewTeamName] = useState('');
    const [overrideNewTeamMembers, setOverrideNewTeamMembers] = useState([]);
    const [overrideReason, setOverrideReason] = useState(OVERRIDE_REASONS[0]);
    // Whether "Qo'lda qo'shish" should offer team (vs individual) — competitions carry `type`, events
    // only ever carry `registrationType`. A pure team-only activity (debate_match/match_play, or any
    // team-typed competition) has no individual option at all; 'both' offers a toggle.
    const activitySupportsTeam = activity.type === 'team' || activity.registrationType === 'team' || activity.registrationType === 'both';
    const activityIsTeamOnly = activity.type === 'team' || activity.registrationType === 'team';
    const [overrideMode, setOverrideMode] = useState(activityIsTeamOnly ? 'team' : 'individual');
    const overrideClubTeams = useMemo(
        () => (activitySupportsTeam ? (clubId ? db.getClubTeams(clubId) : db.getTeams()) : []),
        [activitySupportsTeam, clubId, refreshKey]
    );

    // Lazy waitlist-promotion evaluation — same on-read idea as isRegistrationOpen, just triggered once
    // whenever this panel mounts (e.g. the activity's detail modal opens), not on a real timer.
    useEffect(() => {
        // Tartib muhim: avval to'lmagan jamoalar hal qilinadi (ro'yxat yopilgan
        // bo'lsa), keyin navbat ko'tariladi - aks holda bekor qilingan jamoadan
        // bo'shagan joy shu yurishda ishlatilmay qolardi. `settleStalledTeams`
        // ro'yxat hali ochiq bo'lsa hech narsa qilmaydi.
        db.settleStalledTeams(activity.id, activityType)
            .then(() => activity.waitlistEnabled
                ? db.promoteFromWaitlist(activity.id, activityType)
                : null)
            .then(() => setRefreshKey(k => k + 1))
            .catch(e => console.warn('Ro\'yxat holati yangilanmadi:', e.message));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const registrations = useMemo(
        () => db.getRegistrationsForActivity(activity.id, activityType),
        [activity.id, activityType, refreshKey]
    );
    const registeredCount = registrations.filter(r => r.status === 'registered').length;
    // Ism yechuvchi: yozuvlarda faqat `userId` (login) turadi, ekranda esa
    // F.I.Sh. kerak - mas'ul odam loginlar ro'yxatidan kimligini topa olmaydi.
    // IKKALA ro'yxatdan qidiriladi. Haqiqiy Supabase akkauntlari sintetik 550
    // talabadan ALOHIDA hovuzda turadi (db.getSyncedProfiles izohiga qarang) -
    // faqat getMockStudents() ga qaralsa, aynan haqiqiy odamning ismi topilmay,
    // ekranda login ko'rinib qolardi.
    const nameOf = useMemo(() => {
        const byId = new Map(db.getMockStudents().map(s => [s.id, s.fullName]));
        db.getSyncedProfiles().forEach(p => {
            if (p.username && p.fullName) byId.set(p.username, p.fullName);
        });
        return (id) => byId.get(id) || id;
    }, [refreshKey]);
    // HAMMASI ko'rsatiladi, bekor qilinganlar ham - faqat belgisi bilan.
    // Sabab: to'lmagan jamoa muddat tugagach avtomatik bekor qilinadi
    // (db.settleStalledTeams), va agar u ro'yxatdan jimgina yo'qolib qolsa,
    // mas'ul "jamoa qayerga ketdi" degan savol bilan qolardi - ya'ni bu
    // ro'yxat qo'shilishidan oldingi holatga qaytardik.
    const staffRoster = useMemo(
        () => [...registrations].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)),
        [registrations]
    );
    const myRegistration = user ? registrations.find(r => r.userId === user.username && r.status !== 'cancelled') : null;
    const myPendingInvite = user
        ? registrations.find(r => (r.teamMembers || []).some(m => m.userId === user.username && m.status === 'pending'))
        : null;

    const bump = () => { setRefreshKey(k => k + 1); onRegistered?.(); };

    // Real teams THIS user captains for this club — powers the "Mavjud jamoa" option. Empty for a
    // university-wide (non-club-scoped) activity or a captain with no existing team yet, in which case
    // the toggle simply doesn't show (falls back to "Yangi jamoa" only, today's unchanged behavior).
    const myCaptainedTeams = useMemo(
        () => (user && clubId ? db.getTeamsForUser(user.username, clubId) : []),
        [user, clubId, refreshKey]
    );

    const canOverride = !!user && (isAdmin || isManagement || (clubId && hasClubRole?.(clubId, ['coordinator', 'head_coordinator'])));
    const registrationOpen = db.isRegistrationOpen(activity, startDateTime);
    const effectiveMode = activity.registrationType === 'both' ? chosenMode : activity.registrationType;

    const buildParticipant = () => ({
        id: user.username,
        fullName: user.fullName,
        faculty: user.faculty,
        course: user.course,
        group: user.group,
        studentId: user.studentId,
        gender: user.gender,
        professionalism: user.professionalism
    });

    const handleRegisterIndividual = async () => {
        if (!user) return;
        setError('');
        try {
            await db.registerForActivity(activity.id, activityType, buildParticipant(), user.username, { participantType: 'individual', attachments: attachment ? [attachment] : [] });
            bump();
        } catch (err) {
            setError(err?.message || "Ro'yxatdan o'tishda xatolik yuz berdi.");
        }
    };

    const handleRegisterTeam = async () => {
        if (!user || !teamName.trim() || invitees.length === 0) return;
        setError('');
        try {
            await db.registerForActivity(activity.id, activityType, buildParticipant(), user.username, {
                participantType: 'team',
                teamName: teamName.trim(),
                invitedUserIds: invitees.map(s => s.id),
                // Pastki chegara HAR DOIM saqlanadi. Ilgari faqat `Math.min`
                // bor edi va u qiymatni pasaytirar, natijada server rad etardi.
                minTeamSize: Math.max(teamFloor, Math.min(minTeamSize, invitees.length + 1)),
                attachments: attachment ? [attachment] : []
            });
            setTeamName(''); setInvitees([]);
            bump();
        } catch (err) {
            setError(err?.message || "Ro'yxatdan o'tishda xatolik yuz berdi.");
        }
    };

    const handleRegisterExistingTeam = async () => {
        if (!user || !existingTeamId) return;
        setError('');
        try {
            await db.registerExistingTeam(activity.id, activityType, existingTeamId, user.username);
            setExistingTeamId('');
            bump();
        } catch (err) {
            setError(err?.message || "Ro'yxatdan o'tishda xatolik yuz berdi.");
        }
    };

    const handleCancelRegistration = async () => {
        if (!myRegistration) return;
        setError('');
        try {
            await db.cancelRegistration(myRegistration.id, user.username);
            bump();
        } catch (err) {
            setError(err?.message || 'Xatolik yuz berdi.');
        }
    };

    // Additive alternative to searching every teammate via StudentPicker: a captain shares their team's
    // `inviteCode` (generated per-registration in db.js), a teammate pastes it here to join directly.
    const handleJoinByCode = async () => {
        if (!user || !joinCode.trim()) return;
        setError('');
        try {
            await db.joinTeamByCode(joinCode.trim().toUpperCase(), buildParticipant());
            setJoinCode('');
            bump();
        } catch (err) {
            setError(err?.message || "Kod bilan qo'shilishda xatolik yuz berdi.");
        }
    };

    const handleReRegister = async () => {
        if (!user || !clubId) return;
        const last = db.getLastRegistrationForClub(user.username, clubId);
        if (!last) return;
        setError('');
        try {
            await db.registerForActivity(activity.id, activityType, last.participantSnapshot || buildParticipant(), user.username, {
                participantType: last.participantType, teamName: last.teamName,
                invitedUserIds: (last.teamMembers || []).map(m => m.userId), minTeamSize: last.minTeamSize, isRepeat: true
            });
            bump();
        } catch (err) {
            setError(err?.message || "Ro'yxatdan o'tishda xatolik yuz berdi.");
        }
    };

    const handleConfirmOffer = async () => {
        if (!myRegistration) return;
        setError('');
        try {
            await db.confirmWaitlistOffer(myRegistration.id, buildParticipant());
            bump();
        } catch (err) {
            setError(err?.message || 'Xatolik yuz berdi.');
        }
    };

    const handleRespondInvite = async (accept) => {
        if (!myPendingInvite || !user) return;
        setError('');
        try {
            await db.respondToTeamInvite(myPendingInvite.id, user.username, accept);
            bump();
        } catch (err) {
            setError(err?.message || 'Xatolik yuz berdi.');
        }
    };

    const handleOverrideSubmit = async () => {
        if (!overrideReason) return;
        setError('');
        try {
            if (overrideMode === 'team') {
                if (overrideTeamSourceMode === 'new') {
                    if (!overrideNewTeamName.trim() || overrideNewTeamMembers.length === 0) return;
                    await db.overrideCreateTeam(activity.id, activityType, overrideNewTeamName.trim(), overrideNewTeamMembers.map(s => s.id), overrideReason, user?.username || 'admin');
                    setOverrideNewTeamName(''); setOverrideNewTeamMembers([]);
                } else {
                    if (!overrideTeamId) return;
                    await db.overrideAddTeam(activity.id, activityType, overrideTeamId, overrideReason, user?.username || 'admin');
                    setOverrideTeamId('');
                }
            } else {
                if (!overrideStudent) return;
                await db.overrideAddParticipant(activity.id, activityType, overrideStudent.id, overrideReason, user?.username || 'admin');
                setOverrideStudent(null);
            }
            setShowOverride(false);
            bump();
        } catch (err) {
            setError(err?.message || 'Xatolik yuz berdi.');
        }
    };

    const showPriorBanner = user && clubId && !myRegistration && registrationOpen && db.hasPriorRegistration(user.username, clubId);
    const isFull = activity.maxParticipants != null && registeredCount >= activity.maxParticipants;
    // A stalled team registration (invitees never responded/all declined) has no way out otherwise —
    // unlike a waitlist offer, which auto-expires after 24h, nothing releases it. Only the captain, and
    // only before the team is actually confirmed, can release it (see db.cancelRegistration).
    const canCancelStalledTeam = myRegistration?.participantType === 'team' && myRegistration.status === 'registered' && !myRegistration.teamConfirmedAt;

    // Proactive eligibility notice — shown BEFORE the student tries to register/create a team, not just
    // as an error after clicking. Same restrictions.byFaculty/byCourse/byGender/byProfessionalism fields
    // the actual db.js check enforces (see checkEligibility), so this can never drift out of sync with
    // what's really allowed.
    const allowedFaculties = activity.restrictions?.byFaculty || [];
    const allowedCourses = activity.restrictions?.byCourse || [];
    const requiredGender = activity.restrictions?.byGender || '';
    const requiredProfessionalism = activity.restrictions?.byProfessionalism || '';
    const hasEligibilityRestriction = allowedFaculties.length > 0 || allowedCourses.length > 0 || !!requiredGender || !!requiredProfessionalism;
    const userIsIneligible = !!user && (
        (allowedFaculties.length > 0 && user.faculty && !allowedFaculties.includes(user.faculty)) ||
        (allowedCourses.length > 0 && user.course != null && !allowedCourses.map(String).includes(String(user.course))) ||
        (requiredGender && user.gender && user.gender !== requiredGender) ||
        (requiredProfessionalism && user.professionalism && user.professionalism !== requiredProfessionalism)
    );

    // MANFAATLAR TO'QNASHUVI: klubda lavozimda turgan talaba o'sha klubning
    // musobaqasida ishtirok eta olmaydi (izohi db.js dagi
    // assertCanJoinClubCompetition ustida). Yuqoridagi cheklovlar bilan bir
    // xil qolip: taqiq db qatlamida, bu yerda esa uni OLDINDAN aytish.
    const positionConflict = useMemo(
        () => (user && activityType === 'competition'
            ? db.getClubParticipationConflict(user.id || user.username, activity.id)
            : null),
        [user, activityType, activity.id]
    );

    return (
        <div className="space-y-3">
            {positionConflict && !myRegistration && (
                <div className="flex gap-2 text-xs rounded-xl px-3 py-2.5 border text-red-700 bg-red-50 border-red-100">
                    <AlertTriangle size={14} className="shrink-0 mt-px" />
                    <span>
                        <b>Bu musobaqada ishtirok eta olmaysiz.</b> Siz "{positionConflict.clubName}"
                        klubida {positionConflict.positions.map(p => POSITION_TYPE_LABELS[p] || p).join(', ')}
                        {' '}lavozimidasiz — musobaqani tashkil etuvchi o'zi qatnasha olmaydi.
                        Ishtirok etish uchun avval lavozimdan bo'shatilishingiz kerak.
                    </span>
                </div>
            )}

            {hasEligibilityRestriction && !myRegistration && !myPendingInvite && registrationOpen && (
                <div className={`text-xs font-semibold rounded-xl px-3 py-2 border ${
                    userIsIneligible ? 'text-red-600 bg-red-50 border-red-100' : 'text-indigo-700 bg-indigo-50 border-indigo-100'
                }`}>
                    Bu musobaqa faqat
                    {[
                        allowedFaculties.length > 0 ? `${allowedFaculties.join(', ')} fakulteti` : null,
                        allowedCourses.length > 0 ? allowedCourses.map(c => c + '-kurs').join(', ') : null,
                        requiredGender ? (requiredGender === 'male' ? 'erkaklar' : 'ayollar') : null,
                        requiredProfessionalism ? (requiredProfessionalism === 'amateur' ? 'havaskorlar' : 'professionallar') : null
                    ].filter(Boolean).join(', ')}
                    {' '}uchun.
                    {userIsIneligible && ' Siz bu talablarga mos kelmaysiz.'}
                </div>
            )}

            {error && (
                <p className="text-xs font-semibold text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
            )}

            {/* Pending team invite for the current user (they were invited by someone else's registration) */}
            {myPendingInvite && (
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-2">
                    <p className="text-sm font-bold text-indigo-900">
                        Sizni "{myPendingInvite.teamName || 'jamoa'}" jamoasiga taklif qilishdi
                    </p>
                    <div className="flex gap-2">
                        <Button variant="primary" size="sm" className="flex-1" onClick={() => handleRespondInvite(true)}>Qabul qilish</Button>
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => handleRespondInvite(false)}>Rad etish</Button>
                    </div>
                </div>
            )}

            {activity.registrationRequired && !myRegistration && showPriorBanner && (
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-amber-800">Siz o'tgan safar qatnashgansiz</p>
                    <Button variant="outline" size="sm" onClick={handleReRegister}>Qayta ro'yxatdan o'tish</Button>
                </div>
            )}

            {activity.registrationRequired && !myRegistration && !myPendingInvite && registrationOpen && (
                <div>
                    <input
                        id={`reg-attachment-${activity.id}`}
                        type="file"
                        className="hidden"
                        accept={TOURNAMENT_FILE_UPLOAD.ALLOWED_EXTENSIONS.join(',')}
                        onChange={e => handleAttachmentFile(e.target.files?.[0])}
                    />
                    <label
                        htmlFor={`reg-attachment-${activity.id}`}
                        className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-200 rounded-xl text-xs text-gray-500 hover:border-indigo-300 cursor-pointer"
                    >
                        <Paperclip size={13} />
                        {attachment ? attachment.name : "Hujjat biriktirish (ixtiyoriy)"}
                        {attachment && (
                            <button type="button" onClick={(e) => { e.preventDefault(); setAttachment(null); }} className="ml-auto text-gray-400 hover:text-red-500">
                                <X size={13} />
                            </button>
                        )}
                    </label>
                    {attachmentError && <p className="text-[11px] text-red-500 mt-1">{attachmentError}</p>}
                </div>
            )}

            {!activity.registrationRequired ? null : myRegistration ? (
                myRegistration.status === 'registered' ? (
                    myRegistration.approvalStatus === 'rejected' ? (
                        <div className="space-y-2">
                            <StatusPill icon={XCircle} variant="danger">Arizangiz rad etildi</StatusPill>
                            {myRegistration.approvalComment && (
                                <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">{myRegistration.approvalComment}</p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {myRegistration.approvalStatus === 'pending' ? (
                                <StatusPill icon={Hourglass} variant="secondary">Ko'rib chiqilmoqda — tasdiqlash kutilmoqda</StatusPill>
                            ) : (
                                <StatusPill icon={CheckCircle2} variant="success">Siz ro'yxatdan o'tgansiz</StatusPill>
                            )}
                            {myRegistration.participantType === 'team' && myRegistration.inviteCode && (
                                <div className="text-[11px] text-gray-400 px-1 flex items-center gap-2 flex-wrap">
                                    <span>Taklif kodi: <span className="font-mono font-bold text-gray-600">{myRegistration.inviteCode}</span></span>
                                    <CopyableId
                                        value={`${window.location.origin}/${activityType === 'competition' ? 'musobaqa' : 'tadbir'}/${activity.id}?invite=${myRegistration.inviteCode}`}
                                        className="text-indigo-500 font-semibold"
                                    >
                                        Havolani nusxalash
                                    </CopyableId>
                                    <span>— a'zolar shu kod yoki havola bilan qo'shilishi mumkin</span>
                                </div>
                            )}
                            {myRegistration.participantType === 'team' && !myRegistration.teamConfirmedAt && (
                                <div className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2 space-y-2">
                                    <div>
                                        Jamoa hali to'liq tasdiqlanmagan: {myRegistration.teamMembers.filter(m => m.status === 'accepted').length + 1} / {myRegistration.minTeamSize} a'zo qabul qildi
                                        <ul className="mt-1 space-y-0.5">
                                            {myRegistration.teamMembers.map(m => (
                                                <li key={m.userId} className="flex items-center justify-between">
                                                    <span>{m.userId}</span>
                                                    <Badge size="sm" variant={m.status === 'accepted' ? 'success' : m.status === 'declined' ? 'danger' : 'default'}>
                                                        {m.status === 'accepted' ? 'Qabul qildi' : m.status === 'declined' ? 'Rad etdi' : 'Kutilmoqda'}
                                                    </Badge>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    {canCancelStalledTeam && (
                                        <button type="button" onClick={handleCancelRegistration} className="text-[11px] font-bold text-red-500 hover:underline">
                                            Ro'yxatdan o'tishni bekor qilish
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                ) : (
                    <div className="space-y-2">
                        {myRegistration.offerExpiresAt ? (
                            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-2">
                                <p className="text-sm font-bold text-emerald-800 flex items-center gap-1.5"><Clock size={14} /> Sizga joy taklif qilindi!</p>
                                <p className="text-xs text-emerald-700">Tasdiqlash muddati: {new Date(myRegistration.offerExpiresAt).toLocaleString('uz-UZ')}</p>
                                <Button variant="primary" size="sm" className="w-full" onClick={handleConfirmOffer}>Tasdiqlash</Button>
                            </div>
                        ) : (
                            <StatusPill>Navbatda kutmoqdasiz</StatusPill>
                        )}
                    </div>
                )
            ) : !registrationOpen ? (
                <StatusPill>
                    {activity.registrationOpensAt && new Date() < new Date(activity.registrationOpensAt)
                        ? "Ro'yxatdan o'tish hali boshlanmagan"
                        : "Ro'yxatdan o'tish muddati tugagan"}
                </StatusPill>
            ) : isFull && !activity.waitlistEnabled ? (
                <StatusPill>To'lgan</StatusPill>
            ) : effectiveMode === 'team' || (activity.registrationType === 'both' && chosenMode === 'team') ? (
                <div className="space-y-3">
                    {myCaptainedTeams.length > 0 && (
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setTeamSourceMode('new')} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold ${teamSourceMode === 'new' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>Yangi jamoa</button>
                            <button type="button" onClick={() => setTeamSourceMode('existing')} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold ${teamSourceMode === 'existing' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>Mavjud jamoa</button>
                        </div>
                    )}
                    {teamSourceMode === 'existing' && myCaptainedTeams.length > 0 ? (
                        <>
                            <select
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-2xl text-sm"
                                value={existingTeamId}
                                onChange={e => setExistingTeamId(e.target.value)}
                            >
                                <option value="">Jamoangizni tanlang...</option>
                                {myCaptainedTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                            <p className="text-[11px] text-gray-400 px-1">Jamoaning haqiqiy tarkibi (klub bo'limidagi) o'zgarishsiz shu musobaqaga biriktiriladi — qayta a'zo qo'shish shart emas.</p>
                            {isFull && activity.waitlistEnabled && (
                                <p className="text-[11px] text-amber-600 font-semibold px-1">Joy to'lgan — jamoangiz navbatga qo'shiladi</p>
                            )}
                            {activity.registrationType === 'both' && (
                                <button type="button" onClick={() => setChosenMode(null)} className="text-xs text-gray-400 hover:text-gray-600">&larr; Orqaga</button>
                            )}
                            <Button variant={isFull ? 'outline' : 'primary'} className="w-full py-3" icon={UserPlus} disabled={!existingTeamId} onClick={handleRegisterExistingTeam}>
                                {isFull ? "Jamoani navbatga qo'shish" : "Jamoani ro'yxatdan o'tkazish"}
                            </Button>
                        </>
                    ) : (
                        <>
                            <input
                                type="text"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                placeholder="Jamoangiz nomini kiriting"
                                value={teamName}
                                onChange={e => setTeamName(e.target.value)}
                            />
                            <p className="text-[11px] text-gray-400 px-1">
                                Siz jamoa sardori bo'lasiz — o'zingizni pastdagi a'zolar ro'yxatiga qo'shishingiz shart emas.
                                {activity.teamMaxSize && ` Jamoa (siz bilan) ko'pi bilan ${activity.teamMaxSize} kishidan iborat bo'lishi mumkin.`}
                            </p>
                            {(!activity.teamMaxSize || invitees.length + 1 < activity.teamMaxSize) ? (
                                <StudentPicker
                                    value={null}
                                    excludeIds={[user?.username, ...invitees.map(s => s.id)].filter(Boolean)}
                                    onSelect={s => { if (s) setInvitees(prev => [...prev, s]); }}
                                    placeholder="A'zolarni qidiring va qo'shing..."
                                />
                            ) : (
                                <p className="text-[11px] text-amber-600 font-semibold px-1">
                                    Jamoa maksimal hajmiga ({activity.teamMaxSize} kishi) yetdi.
                                </p>
                            )}
                            {invitees.length > 0 && (
                                <div className="space-y-1.5">
                                    {invitees.map(s => (
                                        <div key={s.id} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-lg text-xs">
                                            <span className="font-semibold text-gray-700">{s.fullName}</span>
                                            <button type="button" onClick={() => setInvitees(prev => prev.filter(x => x.id !== s.id))} className="text-gray-400 hover:text-red-500">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div>
                                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Minimal jamoa hajmi (kapitan bilan)</label>
                                <input
                                    type="number"
                                    min={teamFloor}
                                    max={Math.max(invitees.length + 1, teamFloor)}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-xl text-sm"
                                    value={minTeamSize}
                                    onChange={e => setMinTeamSize(Number(e.target.value) || teamFloor)}
                                />
                                {/* Maydonning MA'NOSI va TALABI yozib qo'yiladi. Bu maydon
                                    a'zolar soni emas - "necha kishi qabul qilsa jamoam
                                    faollashadi" degani, va aynan shu farq tushunilmagani
                                    uchun xato adashtirardi. */}
                                <p className="text-[11px] text-gray-400 mt-1">
                                    Necha kishi taklifni qabul qilsa, jamoa faollashadi.
                                    {activity.teamMinSize ? ` Tashkilotchi eng kam ${activity.teamMinSize} kishini talab qiladi.` : ''}
                                </p>
                                {/* Taklif qilinganlar chegaradan kam bo'lsa - jamoa hech qachon
                                    faollashmaydi. Buni YUBORISHDAN OLDIN aytish kerak, keyin emas. */}
                                {invitees.length + 1 < teamFloor && (
                                    <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-2">
                                        Hozir {invitees.length + 1} kishi (siz bilan). Jamoa faollashishi uchun
                                        kamida {teamFloor} kishi kerak — yana {teamFloor - invitees.length - 1} ta a'zo qo'shing
                                        yoki ular taklif kodi bilan qo'shilsin.
                                    </p>
                                )}
                            </div>
                            {isFull && activity.waitlistEnabled && (
                                <p className="text-[11px] text-amber-600 font-semibold px-1">Joy to'lgan — jamoangiz navbatga qo'shiladi</p>
                            )}
                            {activity.registrationType === 'both' && (
                                <button type="button" onClick={() => setChosenMode(null)} className="text-xs text-gray-400 hover:text-gray-600">&larr; Orqaga</button>
                            )}
                            <Button variant={isFull ? 'outline' : 'primary'} className="w-full py-3" icon={UserPlus} disabled={!teamName.trim() || invitees.length === 0} onClick={handleRegisterTeam}>
                                {isFull ? "Jamoani navbatga qo'shish" : "Jamoani ro'yxatdan o'tkazish"}
                            </Button>
                        </>
                    )}
                </div>
            ) : effectiveMode === 'individual' ? (
                <Button variant={isFull ? 'outline' : 'primary'} className="w-full py-3" icon={UserPlus} onClick={handleRegisterIndividual}>
                    {isFull ? "Navbatga qo'shilish" : 'Qatnashaman'}
                </Button>
            ) : activity.registrationType === 'both' && !chosenMode ? (
                <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setChosenMode('individual')}>Yakka</Button>
                    <Button variant="outline" className="flex-1" onClick={() => setChosenMode('team')}>Jamoaviy</Button>
                </div>
            ) : null}

            {activity.registrationRequired && !myRegistration && !myPendingInvite && registrationOpen && (activity.registrationType === 'team' || activity.registrationType === 'both') && (
                <div className="flex gap-2 pt-1">
                    <input
                        type="text"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs uppercase"
                        placeholder="TEAM-XXXXXX kodi bilan qo'shilish"
                        value={joinCode}
                        onChange={e => setJoinCode(e.target.value)}
                    />
                    <Button variant="outline" size="sm" disabled={!joinCode.trim()} onClick={handleJoinByCode}>Qo'shilish</Button>
                </div>
            )}

            {canOverride && (
                <div className="pt-3 border-t border-gray-100">
                    {!showOverride ? (
                        <button type="button" onClick={() => setShowOverride(true)} className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-indigo-600">
                            <Shield size={13} /> Qo'lda qo'shish
                        </button>
                    ) : (
                        <div className="space-y-2.5 bg-gray-50 rounded-2xl p-3">
                            {activitySupportsTeam && !activityIsTeamOnly && (
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setOverrideMode('individual')} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold ${overrideMode === 'individual' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>Talaba</button>
                                    <button type="button" onClick={() => setOverrideMode('team')} className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold ${overrideMode === 'team' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>Jamoa</button>
                                </div>
                            )}
                            {overrideMode === 'team' ? (
                                <>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => setOverrideTeamSourceMode('existing')} className={`flex-1 px-3 py-1.5 rounded-lg text-[11px] font-bold ${overrideTeamSourceMode === 'existing' ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-gray-500 border border-gray-200'}`}>Mavjud jamoa</button>
                                        <button type="button" onClick={() => setOverrideTeamSourceMode('new')} className={`flex-1 px-3 py-1.5 rounded-lg text-[11px] font-bold ${overrideTeamSourceMode === 'new' ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-gray-500 border border-gray-200'}`}>Yangi jamoa yaratish</button>
                                    </div>
                                    {overrideTeamSourceMode === 'new' ? (
                                        <>
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                                                placeholder="Jamoa nomi"
                                                value={overrideNewTeamName}
                                                onChange={e => setOverrideNewTeamName(e.target.value)}
                                            />
                                            <StudentPicker
                                                value={null}
                                                excludeIds={overrideNewTeamMembers.map(s => s.id)}
                                                onSelect={s => { if (s) setOverrideNewTeamMembers(prev => [...prev, s]); }}
                                                placeholder="A'zolarni qidiring va qo'shing (birinchisi kapitan bo'ladi)..."
                                            />
                                            {overrideNewTeamMembers.length > 0 && (
                                                <div className="space-y-1.5">
                                                    {overrideNewTeamMembers.map((s, idx) => (
                                                        <div key={s.id} className="flex items-center justify-between px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs">
                                                            <span className="font-semibold text-gray-700">{s.fullName} {idx === 0 && <span className="text-indigo-500 font-bold">(kapitan)</span>}</span>
                                                            <button type="button" onClick={() => setOverrideNewTeamMembers(prev => prev.filter(x => x.id !== s.id))} className="text-gray-400 hover:text-red-500">
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <select
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                                            value={overrideTeamId}
                                            onChange={e => setOverrideTeamId(e.target.value)}
                                        >
                                            <option value="">Jamoani tanlang...</option>
                                            {overrideClubTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    )}
                                </>
                            ) : (
                                <StudentPicker value={overrideStudent} onSelect={setOverrideStudent} placeholder="Talabani qidiring (ID, F.I.Sh., guruh)..." />
                            )}
                            <select
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                                value={overrideReason}
                                onChange={e => setOverrideReason(e.target.value)}
                            >
                                {OVERRIDE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" className="flex-1" onClick={() => { setShowOverride(false); setOverrideStudent(null); setOverrideTeamId(''); setOverrideNewTeamName(''); setOverrideNewTeamMembers([]); }}>Bekor qilish</Button>
                                <Button
                                    variant="primary" size="sm" className="flex-1"
                                    disabled={overrideMode === 'team' ? (overrideTeamSourceMode === 'new' ? (!overrideNewTeamName.trim() || overrideNewTeamMembers.length === 0) : !overrideTeamId) : !overrideStudent}
                                    onClick={handleOverrideSubmit}
                                >
                                    Qo'shish
                                </Button>
                            </div>
                        </div>
                    )}

                    {registrations.some(r => r.addedByOverride) && (
                        <div className="mt-2 space-y-1">
                            {registrations.filter(r => r.addedByOverride).map(r => (
                                <div key={r.id} className="flex items-center justify-between text-[11px] text-gray-500 px-1">
                                    <span>{r.participantSnapshot?.fullName || r.participantSnapshot?.name || r.userId}</span>
                                    <Badge size="sm" variant="warning">Override orqali qo'shilgan</Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* KIM RO'YXATDAN O'TGAN — mas'ul uchun.
                Ilgari bu ro'yxat umuman chizilmasdi: panelda faqat SON turardi
                ("5 ta ro'yxatdan o'tgan"), ismlar esa hech qayerda ko'rinmasdi.
                Jamoa esa bundan ham yomon holatda edi - u davomat ro'yxatiga
                faqat TASDIQLANGANDAN keyin tushadi (getEventAttendanceRoster:
                `if (!r.teamConfirmedAt || !r.realTeamId) return`), ya'ni a'zolar
                taklifni qabul qilmaguncha jamoa mas'ul uchun butunlay
                ko'rinmas edi - go'yo hech kim ro'yxatdan o'tmagandek.
                Aynan shu holat "jamoa adminga ko'rinmayapti" bo'lib chiqqan. */}
            {canOverride && staffRoster.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                    <h4 className="text-[11px] font-bold text-gray-500 uppercase">
                        Ro'yxatdan o'tganlar ({staffRoster.length})
                    </h4>
                    {staffRoster.map(r => {
                        const isTeam = r.participantType === 'team';
                        const accepted = (r.teamMembers || []).filter(m => m.status === 'accepted').length + 1;
                        const need = r.minTeamSize || 0;
                        const isCancelled = r.status === 'cancelled';
                        return (
                            <div key={r.id} className={`border rounded-xl px-3 py-2 space-y-1.5 ${isCancelled ? 'border-gray-100 bg-gray-50 opacity-70' : 'border-gray-100'}`}>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className={`text-sm font-semibold ${isCancelled ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
                                        {isTeam
                                            ? (r.teamName || 'Nomsiz jamoa')
                                            : (r.participantSnapshot?.fullName || nameOf(r.userId))}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        {isCancelled && <Badge size="sm" variant="danger">Bekor qilindi</Badge>}
                                        {!isCancelled && r.status === 'waitlisted' && <Badge size="sm" variant="warning">Navbatda</Badge>}
                                        {!isCancelled && isTeam && (r.teamConfirmedAt
                                            ? <Badge size="sm" variant="success">Jamoa tasdiqlangan</Badge>
                                            : <Badge size="sm" variant="default">Kutilmoqda: {accepted}/{need || '?'}</Badge>)}
                                        {!isCancelled && !isTeam && r.status === 'registered' && <Badge size="sm" variant="success">Ro'yxatda</Badge>}
                                        {r.addedByOverride && <Badge size="sm" variant="warning">Override</Badge>}
                                    </div>
                                </div>
                                {isTeam && (
                                    <div className="text-[11px] text-gray-500 space-y-0.5">
                                        <div className="flex items-center justify-between">
                                            <span>{r.participantSnapshot?.fullName || nameOf(r.userId)}</span>
                                            <Badge size="sm" variant="success">Sardor</Badge>
                                        </div>
                                        {(r.teamMembers || []).map(m => (
                                            <div key={m.userId} className="flex items-center justify-between">
                                                <span>{nameOf(m.userId)}</span>
                                                <Badge size="sm" variant={m.status === 'accepted' ? 'success' : m.status === 'declined' ? 'danger' : 'default'}>
                                                    {m.status === 'accepted' ? 'Qabul qildi' : m.status === 'declined' ? 'Rad etdi' : 'Kutilmoqda'}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {/* Nima yetishmayotgani AYTIB QO'YILADI - mas'ul "nega
                                    davomatda yo'q" degan savolga javobni shu yerdan topsin. */}
                                {isTeam && !r.teamConfirmedAt && !isCancelled && (
                                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                                        Jamoa hali tasdiqlanmagan — {need > accepted ? `yana ${need - accepted} kishi qabul qilishi kerak` : 'tasdiqlanish kutilmoqda'}.
                                        Shu sababli a'zolari davomat ro'yxatida chiqmaydi.
                                        Ro'yxat yopilguncha to'lmasa, avtomatik bekor qilinadi va joy bo'shaydi.
                                    </p>
                                )}
                                {isTeam && isCancelled && (
                                    <p className="text-[11px] text-gray-500">
                                        Ro'yxat yopilganda jamoa to'lmagani uchun bekor qilindi — joy bo'shatildi.
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ActivityRegistrationPanel;
