import React from 'react';
import { db } from '../../services/db';
import { ATTENDANCE_GRANULARITY_OPTIONS } from '../../config/competitionEngines';
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
                {/* DAVOMAT GRANULLIGI endi keyin ham o'zgartiriladi.
                    //
                    Ilgari u FAQAT yaratish sehrgarida tanlanardi va keyin hech
                    qayerdan o'zgartirib bo'lmasdi. Oqibati: 100 savolli turnirda
                    "Har bosqich uchun" tanlab qo'yilgan bo'lsa, Davomat bo'limida
                    100 marta alohida belgilashdan boshqa yo'l qolmasdi. Endi
                    "Butun turnir uchun" ga o'tkazish mumkin - u holda davomat
                    bir marta belgilanadi.
                    //
                    DIQQAT: rejim o'zgarsa, davomat BOSHQA birlikka yoziladi
                    ("whole"). Eski yozuvlar o'chmaydi, lekin ularni ko'rish
                    uchun rejimni qaytarish kerak. Shuning uchun ogohlantirish
                    yozuvi tagida turibdi. */}
                <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Davomat granulligi</label>
                    <div className="grid grid-cols-2 gap-2">
                        {ATTENDANCE_GRANULARITY_OPTIONS.map(opt => (
                            <button
                                key={opt.id}
                                type="button"
                                title={opt.description}
                                onClick={async () => {
                                    if ((competition.attendanceGranularity || 'per_round') === opt.id) return;
                                    await db.updateCompetition(competition.id, { attendanceGranularity: opt.id });
                                    onCompetitionUpdated?.();
                                }}
                                className={`px-3 py-2.5 rounded-xl text-xs font-bold border text-center transition-all ${
                                    (competition.attendanceGranularity || 'per_round') === opt.id
                                        ? 'border-indigo-600 bg-indigo-600 text-white'
                                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                        "Butun turnir uchun" tanlansa, Davomat bo'limida bosqich tanlash qatori umuman
                        ko'rinmaydi va ishtirok bir marta belgilanadi. Rejim o'zgartirilsa, davomat boshqa
                        birlikka yoziladi — avvalgi rejimda belgilangan yozuvlar o'chmaydi, lekin ularni
                        ko'rish uchun rejimni qaytarish kerak.
                    </p>
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
