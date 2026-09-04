import React, { useState } from 'react';
import { FlaskConical, CheckCircle2 } from 'lucide-react';
import { db } from '../../services/db';

// ⚠️ VAQTINCHALIK (TEST REJIMI) — real ro'yxatdan o'tish oqimi to'liq ishlagach BUTUNLAY O'CHIRILADI.
//
// O'chirish uchun: (1) shu faylni o'chiring, (2) TournamentScoring.jsx'dagi import va <TestTeamsQuickAdd .../>
// qatorini olib tashlang. Boshqa hech joyga tegmaydi — ataylab shunday, hech qanday umumiy kodga
// aralashmaydi.
//
// Nima qiladi: mavjud db.createTestTeams (sehrgardagi "test rejimda jamoa qo'shish" bilan BIR XIL funksiya)
// orqali klubda N ta real jamoa yaratadi, so'ng ularni db.overrideAddTeam orqali SHU musobaqaga qo'shadi —
// ya'ni qo'lda qo'shishning aynan o'sha auditli yo'li, alohida/parallel roster mantiqi emas.
const TestTeamsQuickAdd = ({ competition, clubId, actingUsername, onAdded }) => {
    const [count, setCount] = useState(4);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    if (!clubId) {
        return (
            <div className="mt-4 pt-3 border-t border-dashed border-amber-200">
                <p className="text-[11px] text-gray-400">
                    Test jamoalar faqat klubga biriktirilgan musobaqalar uchun yaratiladi.
                </p>
            </div>
        );
    }

    const handleAdd = async () => {
        const n = Math.max(1, Math.min(20, Number(count) || 0));
        setBusy(true);
        setError('');
        setMessage('');
        try {
            const teams = await db.createTestTeams(clubId, n);
            let added = 0;
            for (const team of teams) {
                try {
                    await db.overrideAddTeam(competition.id, 'competition', team.id, 'Test rejimi', actingUsername || 'admin');
                    added += 1;
                } catch {
                    // Bitta jamoa qo'shilmasa (masalan allaqachon ro'yxatda) — qolganlari davom etadi.
                }
            }
            setMessage(`${added} ta jamoa test rejimda qo'shildi`);
            onAdded?.();
        } catch (err) {
            setError(err?.message || "Test jamoalarni qo'shishda xatolik yuz berdi.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-4 pt-3 border-t border-dashed border-amber-200">
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-amber-700 uppercase tracking-wide">
                <FlaskConical size={13} /> Test rejimi — vaqtinchalik
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5 mb-2">
                Sinov uchun real a'zolari bilan jamoalar yaratib, shu musobaqaga darhol qo'shadi.
                Real ro'yxatdan o'tish ishlagach bu bo'lim olib tashlanadi.
            </p>
            <div className="flex items-center gap-2">
                <input
                    type="number"
                    min={1}
                    max={20}
                    value={count}
                    onChange={e => setCount(e.target.value)}
                    className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-center"
                />
                <button
                    type="button"
                    onClick={handleAdd}
                    disabled={busy}
                    className="px-3 py-1.5 text-xs font-bold text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {busy ? "Qo'shilmoqda..." : "Test rejimda qo'shish"}
                </button>
            </div>
            {message && (
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 mt-2">
                    <CheckCircle2 size={13} /> {message}
                </p>
            )}
            {error && (
                <p className="text-[11px] font-semibold text-red-600 mt-2">{error}</p>
            )}
        </div>
    );
};

export default TestTeamsQuickAdd;
