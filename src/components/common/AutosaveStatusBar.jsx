import React from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

// Sticky bottom status strip replacing the old manual "Natijalarni Saqlash" button — the actual save
// still happens through the exact same db.saveRoundScores path (see TournamentScoring.jsx's
// handleSaveScores/autosave effect), this only reports its status. Purely presentational.
const AutosaveStatusBar = ({ status, lastSavedAt, judge }) => {
    return (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 px-4 py-2.5 bg-white border-t border-gray-100 text-xs">
            <div className="flex items-center gap-2">
                {status === 'pending' ? (
                    <>
                        <Loader2 size={14} className="text-amber-500 animate-spin" />
                        <span className="font-semibold text-amber-600">Saqlanmoqda...</span>
                    </>
                ) : (
                    <>
                        <CheckCircle2 size={14} className="text-emerald-500" />
                        <span className="font-semibold text-emerald-600">Avtomatik saqlandi</span>
                    </>
                )}
            </div>
            {lastSavedAt && (
                <span className="text-gray-400">
                    Oxirgi o'zgarish: {new Date(lastSavedAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    {judge && ` · ${judge}`}
                </span>
            )}
        </div>
    );
};

export default AutosaveStatusBar;
