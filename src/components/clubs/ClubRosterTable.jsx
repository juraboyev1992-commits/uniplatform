import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, X, MoreVertical, Eye, History, ShieldCheck, UserPlus, UserMinus } from 'lucide-react';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import CopyableId from '../common/CopyableId';
import { db, OFFICIAL_POSITION_TYPES, INTERNAL_POSITION_TYPES, POSITION_TYPE_LABELS, POSITION_BADGE_STYLES } from '../../services/db';
import * as clubAnalytics from '../../utils/clubAnalytics';
import { shortenByName } from '../../utils/clubName';
import PositionAssignPanel from './PositionAssignPanel';
import RemovePositionModal from './RemovePositionModal';
import RosterMemberDrawer from './RosterMemberDrawer';
import StudentPortfolioCard from './StudentPortfolioCard';

const ALL_POSITION_TYPES = [...OFFICIAL_POSITION_TYPES, ...INTERNAL_POSITION_TYPES];
const DAY_MS = 86400000;

// Qisqartirish qoidasi utils/clubName.js ga ko'chirildi - ilgari u ikkita
// faylda nusxalangan edi va klubning o'z qisqa nomini bilmasdi.
const shortenClubName = (name) => shortenByName(name, null, 12);

const formatRelativeTime = (iso) => {
    if (!iso) return "faollik yo'q";
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
    if (days <= 0) return 'bugun';
    if (days === 1) return '1 kun oldin';
    if (days < 30) return `${days} kun oldin`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} oy oldin`;
    return `${Math.floor(months / 12)} yil oldin`;
};

// Faol/Passiv — same 60-day-no-activity threshold clubAnalytics.js's getAnalyticsAlerts already uses
// for "passive positions" university-wide, reused here for a single club's roster. A third "Ta'til"
// bucket isn't implemented: no per-student leave/on-vacation field exists anywhere in db.js, and
// fabricating one would misrepresent real data rather than disclose a limitation.
const isPassive = (lastActivityDate) => !lastActivityDate || (Date.now() - new Date(lastActivityDate).getTime()) > 60 * DAY_MS;

const MENU_WIDTH = 210;

// "Amallar" menyusi PORTAL orqali <body> ga chiziladi.
//
// Ilgari u oddiy `absolute` div edi va OCHILARDI, lekin KO'RINMASDI: jadvalni
// o'rab turgan `overflow-x-auto` konteyneri uni qirqib tashlardi. CSS qoidasi
// shunday - `overflow-x: auto` qo'yilsa, `overflow-y` ham `visible` bo'lib
// qololmaydi va `auto` ga aylanadi, ya'ni konteyner PASTDAN ham qirqadi.
// Menyu esa qator ostida ochilardi. Tashqaridan qaraganda "tugma ishlamayapti".
//
// Konteynerga `overflow: visible` berish yechim emas - gorizontal aylantirish
// ataylab qo'yilgan (tor ekranda ustunlar siqilib ketmasin).
const RowActionsMenu = ({ isAdmin, onDetails, onHistory, onPortfolio, onAssignMore, onRemove }) => {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);
    const btnRef = useRef(null);
    const menuRef = useRef(null);

    // Menyu `fixed` joylashadi, shuning uchun o'rni tugmaning ekrandagi haqiqiy
    // o'rnidan olinadi. Pastda joy yetmasa - tepaga ochiladi.
    const place = useCallback(() => {
        const el = btnRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const menuH = menuRef.current?.offsetHeight || 200;
        const openUp = r.bottom + menuH + 8 > window.innerHeight && r.top > menuH;
        setPos({
            top: openUp ? r.top - menuH - 4 : r.bottom + 4,
            left: Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
        });
    }, []);

    useEffect(() => {
        if (!open) { setPos(null); return; }
        place();
        const handleClickOutside = (e) => {
            if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        const handleKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        // Sahifa yoki jadval aylantirilsa menyu tugmadan ajralib qolmasin.
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKey);
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKey);
            window.removeEventListener('scroll', place, true);
            window.removeEventListener('resize', place);
        };
    }, [open, place]);

    const item = (icon, label, onClick, danger = false) => (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onClick(); }}
            className={`w-full flex items-center gap-2 text-left px-3.5 py-2 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-700/50 ${danger ? 'text-red-600' : 'text-gray-700 dark:text-gray-200'}`}
        >
            {icon} {label}
        </button>
    );

    return (
        <div className="shrink-0">
            <button
                ref={btnRef}
                type="button"
                title="Amallar"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
                className={`p-1.5 rounded-lg transition-colors ${open ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
                <MoreVertical size={16} />
            </button>
            {open && createPortal(
                <div
                    ref={menuRef}
                    role="menu"
                    onClick={e => e.stopPropagation()}
                    style={{
                        position: 'fixed',
                        top: pos?.top ?? -9999,
                        left: pos?.left ?? -9999,
                        width: MENU_WIDTH,
                        // O'rni hisoblanmaguncha ko'rsatmaymiz - aks holda menyu
                        // bir lahza noto'g'ri joyda "sakrab" ko'rinadi.
                        visibility: pos ? 'visible' : 'hidden',
                    }}
                    className="z-[100] bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-lg py-1"
                >
                    {item(<Eye size={14} />, 'Batafsil', onDetails)}
                    {isAdmin && item(<History size={14} />, 'Tarix', onHistory)}
                    {item(<ShieldCheck size={14} />, 'Vakolatlarni ko\'rish', onPortfolio)}
                    <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                    {item(<UserPlus size={14} />, 'Tayinlash', onAssignMore)}
                    {isAdmin && item(<UserMinus size={14} />, 'Lavozimni olib tashlash', onRemove, true)}
                </div>,
                document.body
            )}
        </div>
    );
};

// Professional roles-management table for the "Klub tarkibi" internal workspace (admin/coordinator
// only — the public/student roster view stays the untouched ClubRosterCard list in
// ClubOrgStructureSection.jsx). Groups db.getCurrentClubRoster's one-entry-per-position rows by
// student, mirroring the shape src/utils/clubAnalytics.js's getPositionHoldersTable already uses for
// the admin analytics tab's compact table, for visual/behavioral consistency across the app.
const ClubRosterTable = ({ club, roster, isAdmin, assignedByUserId, onRefresh }) => {
    const [search, setSearch] = useState('');
    const [positionFilter, setPositionFilter] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState(null);
    const [drawerSection, setDrawerSection] = useState(null);
    const [portfolioStudentId, setPortfolioStudentId] = useState(null);
    const [assignState, setAssignState] = useState({ open: false, presetStudent: null });
    const [removeState, setRemoveState] = useState({ open: false, student: null, entries: [], preselectedKey: null });

    const grouped = useMemo(() => {
        const map = new Map();
        roster.forEach(entry => {
            if (!map.has(entry.studentId)) map.set(entry.studentId, []);
            map.get(entry.studentId).push(entry);
        });
        return Array.from(map.entries()).map(([studentId, entries]) => ({ studentId, student: entries[0].student, entries }));
    }, [roster]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        let rows = grouped;
        if (q) {
            rows = rows.filter(r =>
                (r.student?.fullName || r.studentId).toLowerCase().includes(q) ||
                (r.student?.faculty || '').toLowerCase().includes(q) ||
                String(r.student?.displayNumber || '') === q
            );
        }
        if (positionFilter) rows = rows.filter(r => r.entries.some(e => e.positionTitle === positionFilter));
        return rows;
    }, [grouped, search, positionFilter]);

    const openAssign = (student) => setAssignState({ open: true, presetStudent: student });
    const closeAssign = () => setAssignState({ open: false, presetStudent: null });

    const openRemove = (student, entries, preselectedKey) => setRemoveState({ open: true, student, entries, preselectedKey });
    const closeRemove = () => setRemoveState({ open: false, student: null, entries: [], preselectedKey: null });

    return (
        <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 p-4 pb-3 border-b border-gray-50 dark:border-gray-700">
                <div>
                    <h4 className="font-bold text-gray-900 dark:text-gray-100">Lavozimdagi talabalar</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Klubdagi rasmiy va ichki lavozimlarni boshqaring</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="ID, ism, fakultet..."
                            className="pl-8 pr-3 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-xl text-xs w-44 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    <select
                        value={positionFilter}
                        onChange={e => setPositionFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-xl text-xs"
                    >
                        <option value="">Barcha lavozimlar</option>
                        {ALL_POSITION_TYPES.map(t => <option key={t} value={t}>{POSITION_TYPE_LABELS[t]}</option>)}
                    </select>
                    <button
                        type="button"
                        onClick={() => openAssign(null)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                    >
                        <Plus size={14} /> Lavozimga tayinlash
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                {/* table-fixed + explicit per-column widths — table-layout:auto (the default) only
                    treats a <th>'s width as a hint and still shrinks a column below it whenever another
                    column's content (here "Talaba"'s name/faculty text) wants the space, which is what
                    was squeezing "Lavozimlar" down to one chip's width and forcing the "+" button onto
                    its own line. table-fixed makes every column's width authoritative; overflow-x-auto
                    on the wrapper handles narrow viewports via horizontal scroll instead of compressing. */}
                <table className="w-full min-w-[920px] table-fixed text-left text-sm">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-gray-900 text-[11px] font-bold text-gray-400 uppercase">
                            <th className="px-4 py-3 w-[210px]">Talaba</th>
                            <th className="px-4 py-3 w-[240px]">Lavozimlar</th>
                            <th className="px-4 py-3 w-[150px]">Klublar</th>
                            <th className="px-4 py-3 w-[150px]">Faollik</th>
                            <th className="px-4 py-3 w-[90px]">Holat</th>
                            <th className="px-2 py-3 w-[40px]" aria-hidden="true"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                        {filtered.map(row => {
                            const portfolio = db.getStudentPortfolio(row.studentId);
                            const otherClubs = clubAnalytics.getStudentDrawerData(db, row.studentId).clubs.filter(name => name !== club.name);
                            const visibleOtherClubs = otherClubs.slice(0, 2);
                            const extraClubCount = otherClubs.length - visibleOtherClubs.length;
                            const totalActivities = portfolio.eventsOrganizedCount + clubAnalytics.getStudentRecentActivities(db, row.studentId, 500).length;
                            const passive = isPassive(portfolio.lastActivityDate);

                            return (
                                <tr
                                    key={row.studentId}
                                    onClick={() => { setSelectedStudentId(row.studentId); setDrawerSection(null); }}
                                    className="hover:bg-slate-50/70 dark:hover:bg-gray-900/50 transition-colors cursor-pointer"
                                >
                                    <td className="px-4 py-3 align-top">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs shrink-0">
                                                {(row.student?.fullName || row.student?.username)?.charAt(0) || '?'}
                                            </div>
                                            <div className="min-w-0">
                                                {/* Ism topilmasa loginni ko'rsatamiz - xom ID (UUID)
                                                    foydalanuvchiga hech narsa aytmaydi. */}
                                                <p className="font-bold text-gray-900 dark:text-gray-100 truncate">
                                                    {row.student?.fullName || row.student?.username || row.studentId}
                                                </p>
                                                <p className="text-[11px] text-gray-400 truncate">
                                                    {row.student?.displayNumber && (
                                                        <span onClick={e => e.stopPropagation()}><CopyableId value={`Talaba #${row.student.displayNumber}`}>#{row.student.displayNumber}</CopyableId></span>
                                                    )}
                                                    {row.student?.course ? ` · ${row.student.course}-kurs` : ''}{row.student?.faculty ? ` · ${row.student.faculty}` : ''}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                        <div className="flex flex-wrap items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                            {row.entries.map(entry => (
                                                <span
                                                    key={entry.positionTitle}
                                                    className={`inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${POSITION_BADGE_STYLES[entry.positionTitle] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}
                                                >
                                                    {POSITION_TYPE_LABELS[entry.positionTitle] || entry.positionTitle}
                                                    {isAdmin && (
                                                        <button
                                                            type="button"
                                                            title="Lavozimdan olib tashlash"
                                                            onClick={() => openRemove(row.student, row.entries, entry.positionTitle)}
                                                            className="p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                                                        >
                                                            <X size={11} />
                                                        </button>
                                                    )}
                                                </span>
                                            ))}
                                            <button
                                                type="button"
                                                title="Qo'shimcha lavozim qo'shish"
                                                onClick={() => openAssign(row.student)}
                                                className="w-6 h-6 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-900/40 dark:hover:text-indigo-300 transition-colors"
                                            >
                                                <Plus size={13} />
                                            </button>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                        {otherClubs.length === 0 ? (
                                            <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
                                        ) : (
                                            <div className="flex flex-wrap items-center gap-1" title={otherClubs.join(', ')}>
                                                {visibleOtherClubs.map(name => (
                                                    <span key={name} className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                                                        {shortenClubName(name)}
                                                    </span>
                                                ))}
                                                {extraClubCount > 0 && (
                                                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">+{extraClubCount}</span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 align-top text-gray-600 dark:text-gray-300 text-xs leading-relaxed">
                                        <span className="font-semibold text-gray-800 dark:text-gray-200">{totalActivities} faoliyat</span>
                                        <span className="text-gray-400"> · {formatRelativeTime(portfolio.lastActivityDate)}</span>
                                    </td>
                                    <td className="px-4 py-3 align-top">
                                        <Badge variant={passive ? 'warning' : 'success'} size="sm">
                                            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${passive ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                            {passive ? 'Passiv' : 'Faol'}
                                        </Badge>
                                    </td>
                                    <td className="px-2 py-3 align-top" onClick={e => e.stopPropagation()}>
                                        <RowActionsMenu
                                            isAdmin={isAdmin}
                                            onDetails={() => { setSelectedStudentId(row.studentId); setDrawerSection(null); }}
                                            onHistory={() => { setSelectedStudentId(row.studentId); setDrawerSection('audit'); }}
                                            onPortfolio={() => setPortfolioStudentId(row.studentId)}
                                            onAssignMore={() => openAssign(row.student)}
                                            onRemove={() => openRemove(row.student, row.entries, null)}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                        {filtered.length === 0 && (
                            <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">Hozircha lavozimga tayinlangan a'zolar yo'q</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <PositionAssignPanel
                isOpen={assignState.open}
                onClose={closeAssign}
                club={club}
                assignedByUserId={assignedByUserId}
                presetStudent={assignState.presetStudent}
                onAssigned={onRefresh}
            />

            <RemovePositionModal
                isOpen={removeState.open}
                onClose={closeRemove}
                student={removeState.student}
                entries={removeState.entries}
                preselectedKey={removeState.preselectedKey}
                clubId={club.id}
                endedByUserId={assignedByUserId}
                onRemoved={onRefresh}
            />

            <RosterMemberDrawer
                studentId={selectedStudentId}
                isAdmin={isAdmin}
                initialSection={drawerSection}
                onClose={() => { setSelectedStudentId(null); setDrawerSection(null); }}
            />

            <Modal isOpen={!!portfolioStudentId} onClose={() => setPortfolioStudentId(null)} title={db.getMockStudents().find(s => s.id === portfolioStudentId)?.fullName || ''} size="sm">
                {portfolioStudentId && <StudentPortfolioCard studentId={portfolioStudentId} excludeClubId={club.id} />}
            </Modal>
        </div>
    );
};

export default ClubRosterTable;
