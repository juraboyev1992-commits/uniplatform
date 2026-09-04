import React from 'react';
import { X } from 'lucide-react';
import { db } from '../../services/db';
import TeamRosterAndHistory from './TeamRosterAndHistory';

// Standalone slide-over for places with no existing detail drawer of their own (Reyting tab, Natija
// kiritish grid) — same visual convention as CompetitionParticipantsTab.jsx / CompetitionResultsCenter.jsx's
// own drawers, just wrapping TeamRosterAndHistory instead of duplicating its content.
const TeamDetailDrawer = ({ teamId, competitionId, participantName, onClose }) => {
    if (!teamId) return null;
    const team = db.getTeamById(teamId);
    const displayName = team?.name || participantName || teamId;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity" onClick={onClose} />
            <div className="relative w-full max-w-lg h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col z-10">
                <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shrink-0">
                            {displayName.charAt(0)}
                        </div>
                        <h3 className="font-extrabold text-lg leading-tight text-gray-900 dark:text-gray-100 truncate">{displayName}</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors shrink-0">
                        <X size={20} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                    <TeamRosterAndHistory teamId={teamId} currentCompetitionId={competitionId} />
                </div>
            </div>
        </div>
    );
};

export default TeamDetailDrawer;
