import React from 'react';
import { Settings, UserCheck, ShieldCheck, Layers, CheckCircle2, Trash2 } from 'lucide-react';
import { isMatchBasedEngine } from '../../config/competitionEngines';

// Small popover menu opened by the Passport hero's "⋯" button — matches the compact dropdown-menu
// pattern (icon + label rows, red for destructive) rather than a big modal. Picking a section opens its
// own appropriately-sized dedicated modal (see TournamentScoring.jsx); "Turnirni yakunlash"/"bekor
// qilish" are direct actions with no modal at all, same as the original menu.
const isFinished = (c) => (c.currentRound || 1) > (c.roundsCount || 1);

const CompetitionSettingsMenu = ({ competition, hasFullAdminAccess, canManageGroups, onSelectSection, onFinish, onDelete, onClose }) => {
    const isAdmin = hasFullAdminAccess();
    // A "Guruh bosqichlarini boshqarish" delegate (not admin) only needs "Turlarni boshqarish" open — every
    // other section here (general settings, judges, granting further delegations, finish/delete) stays
    // strictly admin-only, so this menu still renders for them but with just that one row.
    const canOpenRounds = isAdmin || (canManageGroups && canManageGroups());
    if (!isAdmin && !canOpenRounds) return null;
    // Both match-based engines (Sport/match_play, Munozara/debate_match) manage rounds via their own
    // Raundlar tab (matches, not generic round cards) — "Turlarni boshqarish" is meaningless for either.
    const usesMatchBasedEngine = isMatchBasedEngine(competition.scoringMethod);

    const pick = (fn) => { fn(); onClose(); };

    return (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-20 text-left">
            {isAdmin && (
                <>
                    <button type="button" onClick={() => pick(() => onSelectSection('general'))} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                        <Settings size={16} className="text-gray-400" />
                        Musobaqa sozlamalari
                    </button>
                    <button type="button" onClick={() => pick(() => onSelectSection('judges'))} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-50">
                        <UserCheck size={16} className="text-gray-400" />
                        Hakamlar
                    </button>
                    <button type="button" onClick={() => pick(() => onSelectSection('delegation'))} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-50">
                        <ShieldCheck size={16} className="text-gray-400" />
                        Turnirga vakil qo'shish
                    </button>
                </>
            )}
            {canOpenRounds && !usesMatchBasedEngine && (
                <button type="button" onClick={() => pick(() => onSelectSection('rounds'))} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-50">
                    <Layers size={16} className="text-gray-400" />
                    Turlarni boshqarish
                </button>
            )}
            {isAdmin && !isFinished(competition) && (
                <button type="button" onClick={() => pick(onFinish)} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-50">
                    <CheckCircle2 size={16} />
                    Turnirni yakunlash
                </button>
            )}
            {isAdmin && (
                <button type="button" onClick={() => pick(onDelete)} className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors border-t border-gray-50">
                    <Trash2 size={16} />
                    Turnirni bekor qilish
                </button>
            )}
        </div>
    );
};

export default CompetitionSettingsMenu;
