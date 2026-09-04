import React, { useEffect, useRef, useState } from 'react';
import { MoreVertical, UserCircle2, UserMinus } from 'lucide-react';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import { POSITION_TYPE_LABELS, POSITION_BADGE_STYLES } from '../../services/db';
import StudentPortfolioCard from './StudentPortfolioCard';

// Single roster row (professional workspace layout): photo/F.I.Sh./#ID/fakultet/kurs/lavozim badge/
// status badge + "Amallar" (⋮) menu, one row per line (not a card grid) — matches the reference
// HR-workspace mockup. `entry` comes from db.getCurrentClubRoster(clubId): { positionTitle, studentId,
// student, assignmentId, membershipId, source }.
//
// Menu is click-toggled with an outside-click listener (same pattern as StudentPicker.jsx) rather than
// CSS :hover — hover-only menus don't work on touch devices and the spec explicitly requires mobile
// responsiveness.
const ClubRosterCard = ({ entry, onRemove, canRemove }) => {
    const student = entry.student;
    const badgeClass = POSITION_BADGE_STYLES[entry.positionTitle] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';

    const [menuOpen, setMenuOpen] = useState(false);
    const [portfolioOpen, setPortfolioOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        if (!menuOpen) return;
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [menuOpen]);

    return (
        <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/70 dark:hover:bg-gray-900/40 transition-colors">
            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-sm shrink-0">
                {student?.fullName?.charAt(0) || '?'}
            </div>
            <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900 dark:text-gray-100 truncate">{student?.fullName || entry.studentId}</p>
                <p className="text-xs text-gray-400 truncate">
                    {student?.displayNumber ? `#${student.displayNumber}` : ''}{student?.faculty ? ` · ${student.faculty}` : ''}{student?.course ? ` · ${student.course}-kurs` : ''}
                </p>
            </div>
            <span className={`hidden sm:inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 ${badgeClass}`}>
                {POSITION_TYPE_LABELS[entry.positionTitle] || entry.positionTitle}
            </span>
            <Badge variant="success" size="sm" className="shrink-0">Faol</Badge>

            <div className="relative shrink-0" ref={menuRef}>
                <button
                    type="button"
                    title="Amallar"
                    onClick={() => setMenuOpen(o => !o)}
                    className={`p-1.5 rounded-lg transition-colors ${menuOpen ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                >
                    <MoreVertical size={16} />
                </button>
                {menuOpen && (
                    <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-lg py-1 min-w-[200px]">
                        <button
                            type="button"
                            onClick={() => { setMenuOpen(false); setPortfolioOpen(true); }}
                            className="w-full flex items-center gap-2 text-left px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        >
                            <UserCircle2 size={14} /> Portfolioni ko'rish
                        </button>
                        {canRemove && (
                            <>
                                <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                                <button
                                    type="button"
                                    onClick={() => { setMenuOpen(false); onRemove(entry); }}
                                    className="w-full flex items-center gap-2 text-left px-3.5 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                >
                                    <UserMinus size={14} /> Lavozimdan olib tashlash
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            <Modal isOpen={portfolioOpen} onClose={() => setPortfolioOpen(false)} title={student?.fullName || entry.studentId} size="sm">
                <StudentPortfolioCard studentId={entry.studentId} excludeClubId={entry.clubId} />
            </Modal>
        </div>
    );
};

export default ClubRosterCard;
