import React from 'react';
import { db } from '../../services/db';
import CompetitionJudgesTab from './CompetitionJudgesTab';
import CompetitionDelegationDrawer from './CompetitionDelegationDrawer';
import CompetitionRoundsTab from './CompetitionRoundsTab';

// Renders exactly ONE settings section's content — which section, and how big its modal is, is decided
// by the caller (TournamentScoring.jsx), triggered from CompetitionSettingsMenu.jsx's small popover.
// Each section delegates to the exact same existing component the old separate tabs used — this is a
// navigation consolidation only, no scoring/permission/data logic was rewritten.
const CompetitionSettingsPanel = ({
    section, competition, scoresData, auditLogs, hasFullAdminAccess, canManageGroups, actingUsername,
    onCompetitionUpdated, onOpenRound
}) => {
    if (section === 'general') {
        return (
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Musobaqa Nomi</label>
                    <input
                        type="text"
                        value={competition.name}
                        onChange={async e => {
                            await db.updateCompetition(competition.id, { name: e.target.value });
                            onCompetitionUpdated?.();
                        }}
                        className="w-full px-4 py-2 border rounded-xl text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Raundlar Soni</label>
                    <input
                        type="number"
                        value={competition.roundsCount}
                        disabled
                        className="w-full px-4 py-2 border bg-gray-50 text-gray-400 rounded-xl text-sm"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Bosqichlar sonini faqat turnir yaratilishidan oldin o'zgartirish mumkin.</p>
                </div>
            </div>
        );
    }
    if (section === 'judges') {
        return (
            <CompetitionJudgesTab
                competition={competition}
                scoresData={scoresData}
                auditLogs={auditLogs}
                hasFullAdminAccess={hasFullAdminAccess}
                actingUsername={actingUsername}
                onJudgeAdded={onCompetitionUpdated}
            />
        );
    }
    if (section === 'delegation') {
        return <CompetitionDelegationDrawer competition={competition} actingUsername={actingUsername} />;
    }
    if (section === 'rounds') {
        return (
            <CompetitionRoundsTab
                competition={competition}
                hasFullAdminAccess={hasFullAdminAccess}
                canManageGroups={canManageGroups}
                actingUsername={actingUsername}
                onCompetitionUpdated={onCompetitionUpdated}
                onOpenRound={onOpenRound}
            />
        );
    }
    return null;
};

export default CompetitionSettingsPanel;
