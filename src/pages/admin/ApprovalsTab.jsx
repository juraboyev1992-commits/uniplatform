import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    CheckCircle, XCircle, Search, Award, Briefcase, Ticket, Banknote,
    Clock, AlertTriangle, Trophy, Calendar, FileText, Landmark, Dumbbell,
    MessageSquare, ArrowRight, Users
} from 'lucide-react';
import Badge from '../../components/common/Badge';
import Pagination from '../../components/common/Pagination';
import { db, POSITION_TYPE_LABELS } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { getApplicationStatusMeta } from '../../config/scholarships';

// "Tasdiqlash" — one real, working queue for every "submitted -> pending -> admin decides" workflow in
// the app (per direct feedback after the admin-panel approval-process audit): ijtimoiy faollik
// arizalari, klub lavozimi arizalari (admin's final stage only — coordinator stage stays in
// PositionApplicationReviewPanel.jsx, untouched), ro'yxatdan o'tish tasdiqlash (a previously-dead
// `approvalRequired`/`approvalStatus` field — see the new db.reviewRegistrationApproval), va stipendiya
// arizalari (now real, see db.js scholarshipApplications). Every action here calls the SAME db.js
// functions the dedicated pages (SocialActivityManagement.jsx, PositionApplicationReviewPanel.jsx,
// ScholarshipManagement.jsx) already use — this tab doesn't replace them, it's a cross-category glance +
// quick-action surface on top of the same real data.
const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 'all'];

const KIND_META = {
    social: { label: 'Ijtimoiy faollik', icon: Award, tone: 'text-indigo-600 bg-indigo-50' },
    position: { label: 'Klub lavozimi', icon: Briefcase, tone: 'text-amber-600 bg-amber-50' },
    registration: { label: "Ro'yxatdan o'tish", icon: Ticket, tone: 'text-blue-600 bg-blue-50' },
    scholarship: { label: 'Stipendiya', icon: Banknote, tone: 'text-emerald-600 bg-emerald-50' },
    competition_moderation: { label: 'Musobaqa', icon: Trophy, tone: 'text-purple-600 bg-purple-50' },
    event_moderation: { label: 'Tadbir', icon: Calendar, tone: 'text-rose-600 bg-rose-50' }
};
const KIND_ORDER = ['social', 'position', 'registration', 'scholarship', 'competition_moderation', 'event_moderation'];

// ---------------------------------------------------------------------------
// INDEKS NAVBATLARI
//
// Bu to'rt oqim shu yerda BIR BOSISHDA tasdiqlanmaydi - ataylab. Ularda qaror
// hujjatni yoki fotosuratni KO'RIB chiqishni talab qiladi: "qabul qilaman"
// tugmasini dalilni ochmasdan bosish tasdiqlashni rasmiyatchilikka
// aylantirardi. Shuning uchun bu yerda faqat NAVBAT ko'rinadi - nechta ish
// kutmoqda va qayerda ko'rib chiqiladi.
//
// Ilgari bu navbatlar Sozlamalar ichida yashiringan edi va administrator
// ularni umuman ko'rmasligi mumkin edi.
// ---------------------------------------------------------------------------
const SOCIAL_SETTINGS_LINK = '/admin/settings?tab=social-activity';

const useIndexQueues = (refreshKey) => useMemo(() => ([
    {
        key: 'evidence',
        label: 'Asoslovchi hujjatlar',
        hint: 'Talaba yuklagan hujjat — haqiqiyligi va mezonga mosligi tekshiriladi',
        icon: FileText,
        tone: 'text-sky-600 bg-sky-50',
        count: db.getIndexEvidence().filter(e => e.status === 'pending').length,
        to: SOCIAL_SETTINGS_LINK,
    },
    {
        key: 'requests',
        label: "Mezon tasdiqlash so'rovlari",
        hint: "Talaba ma'lumotnomasini tasdiqlashni so'ragan",
        icon: Users,
        tone: 'text-indigo-600 bg-indigo-50',
        count: (db.getPendingConfirmationRequests() || []).length,
        to: SOCIAL_SETTINGS_LINK,
    },
    {
        key: 'cultural',
        label: 'Madaniy tashriflar',
        hint: 'Fotosurat va geolokatsiya ko\'rib chiqiladi',
        icon: Landmark,
        tone: 'text-teal-600 bg-teal-50',
        count: db.getCulturalVisits({ status: 'pending' }).length,
        to: SOCIAL_SETTINGS_LINK,
    },
    {
        key: 'sport',
        label: 'Terma jamoa nomzodlari',
        hint: 'Tyutor tavsiya etgan nomzodlar',
        icon: Dumbbell,
        tone: 'text-cyan-600 bg-cyan-50',
        count: db.getSportNominations({ status: 'pending' }).length,
        to: SOCIAL_SETTINGS_LINK,
    },
    {
        key: 'appeals',
        label: "E'tirozlar",
        hint: "Rad etilgan hujjatga bildirilgan e'tiroz — rad etgan mas'ul ko'ra olmaydi",
        icon: MessageSquare,
        tone: 'text-rose-600 bg-rose-50',
        count: db.getEvidenceAppeals().filter(a => a.status === 'pending').length,
        to: SOCIAL_SETTINGS_LINK,
    },
    // Klub yutuqlari - o'z klubi sahifasida ko'rib chiqiladi, chunki qaror
    // dalil hujjatini OCHIB ko'rishni talab qiladi.
    {
        key: 'clubAchievements',
        label: 'Klublarning tashqi yutuqlari',
        hint: 'Diplom nusxasi tekshiriladi',
        icon: Trophy,
        tone: 'text-amber-600 bg-amber-50',
        count: (db.getPendingClubAchievements() || []).length,
        to: '/admin/clubs-directory',
    },
    {
        key: 'joinRequests',
        label: "Klub a'zoligiga arizalar",
        hint: 'Ariza orqali a\'zo qabul qiladigan klublarda',
        icon: Users,
        tone: 'text-purple-600 bg-purple-50',
        count: (db.getPendingJoinRequests() || []).length,
        to: '/admin/clubs-directory',
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
]), [refreshKey]);

const activityTitleFor = (registration) => {
    if (registration.activityType === 'competition') {
        return db.getCompetitionById(registration.activityId)?.name || "Noma'lum musobaqa";
    }
    return db.getEvents().find(e => e.id === registration.activityId)?.title || "Noma'lum tadbir";
};

const ApprovalsTab = () => {
    const { user } = useAuth();
    const [refreshKey, setRefreshKey] = useState(0);
    const [error, setError] = useState('');
    const refresh = () => { setError(''); setRefreshKey(k => k + 1); };

    const [kindFilter, setKindFilter] = useState('');
    const [search, setSearch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const students = useMemo(() => db.getMockStudents(), []);
    const studentById = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);
    const socialCategoryByKey = useMemo(() => new Map(db.getSocialCriteriaCategories().map(c => [c.key, c])), []);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const socialRows = useMemo(() => db.getSocialApplications()
        .filter(a => a.status === 'Pending')
        .map(a => ({
            id: a.id, kind: 'social',
            title: a.activityTitle,
            subtitle: socialCategoryByKey.get(a.criteriaKey)?.name || a.criteriaKey,
            studentName: a.studentFullName,
            submittedAt: a.submittedAt,
            onApprove: async () => {
                try { await db.reviewSocialApplication(a.id, { action: 'approve', reviewer: user.username }); refresh(); }
                catch (err) { setError(err.message); }
            },
            onReject: async () => {
                const reason = window.prompt("Rad etish sababi (ixtiyoriy):") || '';
                try { await db.reviewSocialApplication(a.id, { action: 'reject', reviewer: user.username, comment: reason }); refresh(); }
                catch (err) { setError(err.message); }
            }
        })), [refreshKey]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const positionRows = useMemo(() => db.getAdminPendingPositionApplications().map(a => ({
        id: a.id, kind: 'position',
        title: POSITION_TYPE_LABELS[a.position?.title] || a.position?.title || 'Lavozim',
        subtitle: a.club?.name || '',
        studentName: studentById.get(a.studentId)?.fullName || a.studentId,
        submittedAt: a.submittedAt,
        // MANFAATLAR TO'QNASHUVI. Ariza berish CHEKLANMAYDI - talaba
        // bilmasligi mumkin. Lekin tasdiqlaydigan odam buni ariza ustida
        // ko'rishi kerak, aks holda u tugmani bosib, keyin xatoni o'qib,
        // sababini qidirib yurardi.
        warning: db.getClubPositionConflict(a.studentId, a.clubId)?.message || null,
        // `await` SHART: tasdiqlash a'zolik rolini Supabase'ga yozadi va
        // xatosi shu yerda ushlanishi kerak.
        onApprove: async () => {
            try { await db.reviewPositionApplication(a.id, 'admin_approve', user.username, ''); refresh(); }
            catch (err) { setError(err.message); }
        },
        onReject: async () => {
            const reason = window.prompt("Rad etish sababi (ixtiyoriy):") || '';
            try { await db.reviewPositionApplication(a.id, 'admin_reject', user.username, reason); refresh(); }
            catch (err) { setError(err.message); }
        }
    })), [refreshKey, studentById]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const registrationRows = useMemo(() => db.getPendingRegistrationApprovals().map(r => ({
        id: r.id, kind: 'registration',
        title: activityTitleFor(r),
        subtitle: r.activityType === 'competition' ? 'Musobaqa' : 'Tadbir',
        studentName: r.participantSnapshot?.fullName || studentById.get(r.userId)?.fullName || r.userId,
        submittedAt: r.createdAt,
        onApprove: async () => {
            try {
                await db.reviewRegistrationApproval({ registrationId: r.id, action: 'approve', reviewerUserId: user.username });
            } catch (e) { alert(e.message); return; }
            refresh();
        },
        onReject: async () => {
            const reason = window.prompt("Rad etish sababi (ixtiyoriy):") || '';
            try {
                await db.reviewRegistrationApproval({ registrationId: r.id, action: 'reject', reviewerUserId: user.username, comment: reason });
            } catch (e) { alert(e.message); return; }
            refresh();
        }
    })), [refreshKey, studentById]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Stipendiya arizalari endi bosqichli oqimga ega (yuborilgan -> hujjat tekshiruvi -> komissiya)
    // va reviewScholarshipApplication async. Bu yerdagi tezkor navbat qaror CHIQARILMAGAN barcha
    // arizalarni ko'rsatadi; to'liq ko'rib chiqish Stipendiyalar bo'limida.
    const scholarshipRows = useMemo(() => db.getScholarshipApplications()
        .filter(a => !getApplicationStatusMeta(a.status).terminal)
        .map(a => ({
            id: a.id, kind: 'scholarship',
            title: a.grantTitle,
            subtitle: getApplicationStatusMeta(a.status).label,
            studentName: studentById.get(a.studentId)?.fullName || a.studentId,
            submittedAt: a.submittedAt,
            onApprove: async () => { await db.reviewScholarshipApplication(a.id, { status: 'approved', reviewer: user.username }); refresh(); },
            onReject: async () => { await db.reviewScholarshipApplication(a.id, { status: 'rejected', reviewer: user.username }); refresh(); }
        })), [refreshKey, studentById]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const competitionModerationRows = useMemo(() => db.getPendingCompetitionModerations().map(c => ({
        id: c.id, kind: 'competition_moderation',
        title: c.name,
        subtitle: c.ownerUsername ? `Yaratuvchi: ${studentById.get(c.ownerUsername)?.fullName || c.ownerUsername}` : '',
        studentName: studentById.get(c.ownerUsername)?.fullName || c.ownerUsername || "Noma'lum",
        submittedAt: c.createdAt,
        onApprove: () => {
            db.reviewCompetitionModeration(c.id, { action: 'approve', reviewer: user.username });
            refresh();
        },
        onReject: () => {
            const reason = window.prompt("Rad etish sababi (ixtiyoriy):") || '';
            db.reviewCompetitionModeration(c.id, { action: 'reject', reviewer: user.username, comment: reason });
            refresh();
        }
    })), [refreshKey, studentById]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const eventModerationRows = useMemo(() => db.getPendingEventModerations().map(e => ({
        id: e.id, kind: 'event_moderation',
        title: e.title,
        subtitle: db.getClubs().find(c => c.id === e.clubId)?.name || '',
        // e.createdBy is undefined until the events.created_by column exists — falls back to the club
        // name (same info "subtitle" has) so the row never looks broken either way.
        studentName: (e.createdBy && (studentById.get(e.createdBy)?.fullName || e.createdBy))
            || db.getClubs().find(c => c.id === e.clubId)?.name || "Noma'lum klub",
        submittedAt: e.createdAt,
        onApprove: () => {
            db.reviewEventModeration(e.id, { action: 'approve' });
            refresh();
        },
        onReject: () => {
            db.reviewEventModeration(e.id, { action: 'reject' });
            refresh();
        }
    })), [refreshKey, studentById]);

    const allRows = useMemo(
        () => [...socialRows, ...positionRows, ...registrationRows, ...scholarshipRows, ...competitionModerationRows, ...eventModerationRows],
        [socialRows, positionRows, registrationRows, scholarshipRows, competitionModerationRows, eventModerationRows]
    );

    const kindCounts = useMemo(() => {
        const counts = { social: 0, position: 0, registration: 0, scholarship: 0, competition_moderation: 0, event_moderation: 0 };
        allRows.forEach(r => { counts[r.kind] = (counts[r.kind] || 0) + 1; });
        return counts;
    }, [allRows]);

    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        let rows = allRows;
        if (kindFilter) rows = rows.filter(r => r.kind === kindFilter);
        if (q) rows = rows.filter(r =>
            r.title.toLowerCase().includes(q) ||
            r.studentName.toLowerCase().includes(q) ||
            (r.subtitle || '').toLowerCase().includes(q)
        );
        if (dateFrom) rows = rows.filter(r => new Date(r.submittedAt) >= new Date(dateFrom));
        if (dateTo) rows = rows.filter(r => new Date(r.submittedAt) <= new Date(`${dateTo}T23:59:59`));
        return [...rows].sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
    }, [allRows, kindFilter, search, dateFrom, dateTo]);

    const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filteredRows.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const paginatedRows = pageSize === 'all' ? filteredRows : filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const handleKindFilter = (kind) => { setKindFilter(kind); setPage(1); };

    const indexQueues = useIndexQueues(refreshKey);
    const indexQueueTotal = indexQueues.reduce((s, q) => s + q.count, 0);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-xl font-black text-gray-900">Tasdiqlash</h2>
                    <p className="text-sm text-gray-400">
                        Admin tasdiqlashi kerak bo'lgan {allRows.length + indexQueueTotal} ta jarayon
                        {indexQueueTotal > 0 && ` — shundan ${indexQueueTotal} tasi indeks bo'yicha`}
                    </p>
                </div>
            </div>

            {error && (
                <p className="flex items-center gap-2 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    <AlertTriangle size={14} /> {error}
                </p>
            )}

            {/* Indeks navbatlari — bu yerda sanaladi, qaror esa dalilni ko'rish
                mumkin bo'lgan joyda qabul qilinadi. */}
            {indexQueueTotal > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="text-sm font-bold text-gray-900">Ijtimoiy faollik indeksi navbatlari</h3>
                            <p className="text-xs text-gray-400">
                                Qaror hujjat yoki fotosuratni ko'rishni talab qiladi — shuning uchun
                                ko'rib chiqish o'z bo'limida
                            </p>
                        </div>
                        <span className="text-lg font-black text-amber-600 tabular-nums">{indexQueueTotal}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {indexQueues.filter(q => q.count > 0).map(q => (
                            <Link
                                key={q.key}
                                to={q.to}
                                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/40 transition-colors"
                            >
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${q.tone}`}>
                                    <q.icon size={16} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-bold text-gray-900 truncate">{q.label}</p>
                                        <span className="text-sm font-black text-gray-900 tabular-nums">{q.count}</span>
                                    </div>
                                    <p className="text-[11px] text-gray-400 truncate">{q.hint}</p>
                                </div>
                                <ArrowRight size={14} className="text-gray-300 shrink-0" />
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* Turi bo'yicha filtr — har birining tabiatidan kelib chiqib alohida hisoblanadi */}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => handleKindFilter('')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                        !kindFilter ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                >
                    Hammasi ({allRows.length})
                </button>
                {KIND_ORDER.map(kind => (
                    <button
                        key={kind}
                        type="button"
                        onClick={() => handleKindFilter(kind)}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                            kindFilter === kind ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                        {KIND_META[kind].label} ({kindCounts[kind] || 0})
                    </button>
                ))}
            </div>

            {/* Qidiruv + sana oralig'i */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[220px]">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Talaba yoki nomi bo'yicha qidirish..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                        className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>
                <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm" title="Sanadan" />
                <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm" title="Sanagacha" />
            </div>

            {/* Ro'yxat */}
            <div className="space-y-2">
                {paginatedRows.map(row => {
                    const meta = KIND_META[row.kind];
                    return (
                        <div key={`${row.kind}_${row.id}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.tone}`}>
                                <meta.icon size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-bold text-gray-900 truncate">{row.title}</p>
                                    <Badge variant="default" size="sm">{meta.label}</Badge>
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5 truncate">
                                    {row.studentName}{row.subtitle ? ` · ${row.subtitle}` : ''}
                                </p>
                                <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                                    <Clock size={11} /> {row.submittedAt ? new Date(row.submittedAt).toLocaleDateString('uz-UZ') : '—'}
                                </p>
                                {/* To'siq - tasdiqlash tugmasidan OLDIN ko'rinadi. */}
                                {row.warning && (
                                    <p className="flex items-start gap-1.5 text-[11px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5 mt-1.5">
                                        <AlertTriangle size={12} className="shrink-0 mt-px" />
                                        <span>{row.warning}</span>
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={row.onApprove}
                                    disabled={!!row.warning}
                                    title={row.warning || ''}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                                >
                                    <CheckCircle size={14} /> Tasdiqlash
                                </button>
                                <button
                                    onClick={row.onReject}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 transition-colors"
                                >
                                    <XCircle size={14} /> Rad etish
                                </button>
                            </div>
                        </div>
                    );
                })}
                {paginatedRows.length === 0 && (
                    <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
                        Tasdiqlash kutayotgan jarayonlar yo'q
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
    );
};

export default ApprovalsTab;
