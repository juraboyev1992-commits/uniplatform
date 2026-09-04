import React, { useMemo, useState } from 'react';
import { Plus, UserCheck, Activity, FileBarChart2, X, Search, Trash2, AlertTriangle } from 'lucide-react';
import Button from './Button';
import { StatCard } from './RankingsSharedUI';
import { db } from '../../services/db';

const ONLINE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes — a static snapshot, not a live/polling status

// Differentiated judge roles (additive metadata layered over the existing flat `competition.judges`
// username array, which stays the source of truth for the active-judge switcher / debate penalty panel
// elsewhere in TournamentScoring.jsx — role data here never replaces or reorders that array).
const JUDGE_ROLE_LABELS = {
    chief_judge: 'Bosh hakam',
    result_operator: 'Natija operatori',
    assistant_judge: 'Yordamchi hakam',
    attendance_operator: 'Attendance operatori'
};
const JUDGE_ROLE_OPTIONS = Object.entries(JUDGE_ROLE_LABELS).map(([key, label]) => ({ key, label }));

const formatRelativeTime = (isoString) => {
    if (!isoString) return "Hali faoliyat yo'q";
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Hozirgina';
    if (diffMin < 60) return `${diffMin} daqiqa oldin`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} soat oldin`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} kun oldin`;
    return new Date(isoString).toLocaleDateString('uz-UZ');
};

// Judges tab for the Competition Management workspace (TournamentScoring.jsx).
// Online/offline + activity stats are a plain derived snapshot computed from the already-loaded
// scoresData/auditLogs (both recomputed only when scoresVersion changes, same as the rest of the
// workspace) — no polling, no websocket, no new real-time mechanism.
const CompetitionJudgesTab = ({ competition, scoresData, auditLogs, hasFullAdminAccess, actingUsername, onJudgeAdded }) => {
    const [roleVersion, setRoleVersion] = useState(0);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newRole, setNewRole] = useState('assistant_judge');
    const [search, setSearch] = useState('');
    const [manualMode, setManualMode] = useState(false);
    const [error, setError] = useState('');

    const judgeRoleByUsername = useMemo(() => {
        const roles = db.getCompetitionJudgeRoles(competition.id);
        return new Map(roles.map(r => [r.username, r]));
    }, [competition.id, roleVersion]);

    const currentJudges = competition.judges || [];

    // Real, login-capable accounts (Supabase `profiles`) — a judge who can't sign in can't score, so
    // picking from this list is what the raw username box used to only hope for. Already-added judges are
    // filtered out so the same person can't be added twice.
    const candidates = useMemo(() => {
        const q = search.trim().toLowerCase();
        return db.getSyncedProfiles()
            .filter(p => p.username && !currentJudges.includes(p.username))
            .filter(p => !q
                || p.username.toLowerCase().includes(q)
                || (p.fullName || '').toLowerCase().includes(q))
            .slice(0, 8);
    }, [search, currentJudges, roleVersion]);

    const addJudge = async (username) => {
        const name = (username || '').trim();
        if (!name) return;
        setError('');
        if (currentJudges.includes(name)) {
            setError(`"${name}" allaqachon hakamlar ro'yxatida.`);
            return;
        }
        try {
            await db.setCompetitionJudgeRole(competition.id, name, newRole, actingUsername);
            // Additive append to the existing flat judges array (never removes/reorders existing entries) —
            // that array stays the source of truth for the active-judge switcher / debate penalty panel.
            await db.updateCompetition(competition.id, { judges: [...currentJudges, name] });
            setNewUsername('');
            setSearch('');
            setNewRole('assistant_judge');
            setShowAddForm(false);
            setRoleVersion(v => v + 1);
            onJudgeAdded?.();
        } catch (err) {
            setError(err?.message || "Hakamni qo'shishda xatolik yuz berdi.");
        }
    };

    // Removing a judge never touches scores they already entered — those rows stay, so a leaderboard
    // computed earlier can't silently change. Only their ability to be selected as the active judge goes.
    const handleRemoveJudge = async (username) => {
        setError('');
        try {
            await db.updateCompetition(competition.id, { judges: currentJudges.filter(j => j !== username) });
            await db.removeCompetitionJudgeRole(competition.id, username);
            setRoleVersion(v => v + 1);
            onJudgeAdded?.();
        } catch (err) {
            setError(err?.message || "Hakamni o'chirishda xatolik yuz berdi.");
        }
    };

    const handleChangeRole = async (username, role) => {
        setError('');
        try {
            await db.setCompetitionJudgeRole(competition.id, username, role, actingUsername);
            setRoleVersion(v => v + 1);
        } catch (err) {
            setError(err?.message || "Rolni o'zgartirishda xatolik yuz berdi.");
        }
    };

    const judgeStats = useMemo(() => {
        // No invented placeholder list: an empty roster shows a real empty state instead of four fake
        // judges ('admin'/'talaba'/'hakam_1'/'hakam_2') that don't necessarily exist.
        return currentJudges.map(judgeName => {
            const entries = scoresData.filter(s => s.judge === judgeName);
            const rounds = [...new Set(entries.map(e => e.round))].sort((a, b) => a - b);

            const timestamps = [
                ...entries.map(e => e.date),
                ...auditLogs.filter(l => l.judge === judgeName).map(l => l.time)
            ].filter(Boolean);
            const lastActivity = timestamps.length > 0
                ? timestamps.reduce((max, t) => (new Date(t) > new Date(max) ? t : max), timestamps[0])
                : null;

            const isOnline = lastActivity ? (Date.now() - new Date(lastActivity).getTime()) <= ONLINE_THRESHOLD_MS : false;
            const roleRecord = judgeRoleByUsername.get(judgeName);

            return {
                name: judgeName,
                submissionCount: entries.length,
                rounds,
                lastActivity,
                isOnline,
                // Additive display metadata — unassigned judges (no role record) simply show no badge,
                // exactly like today, rather than blocking on a role being set.
                roleLabel: roleRecord ? JUDGE_ROLE_LABELS[roleRecord.role] : null,
                roleKey: roleRecord ? roleRecord.role : '',
                roleActive: roleRecord ? roleRecord.active : true
            };
        });
    }, [currentJudges, scoresData, auditLogs, judgeRoleByUsername]);

    const onlineCount = judgeStats.filter(j => j.isOnline).length;

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="font-bold text-lg text-gray-900">Hakamlar Hay'ati Tarkibi</h3>
                    <p className="text-xs text-gray-400">
                        Baholash uchun mas'ul hakamlar ro'yxati va faolligi. Ballar{' '}
                        <span className="font-semibold text-gray-500">
                            {competition.calculationMethod === 'average' ? "o'rtacha qiymat" : 'yig\'indi'}
                        </span>{' '}
                        bo'yicha birlashtiriladi (3-qadamdagi "Hisoblash usuli").
                    </p>
                </div>
                {hasFullAdminAccess() && (
                    <Button variant="outline" size="sm" onClick={() => setShowAddForm(v => !v)}>
                        {showAddForm ? <X size={14} className="mr-2" /> : <Plus size={14} className="mr-2" />}
                        {showAddForm ? 'Bekor qilish' : "Hakam qo'shish"}
                    </Button>
                )}
            </div>

            {hasFullAdminAccess() && showAddForm && (
                <div className="p-4 bg-slate-50 rounded-2xl space-y-3">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Roli</label>
                        <select
                            value={newRole}
                            onChange={e => setNewRole(e.target.value)}
                            className="w-full sm:w-64 px-4 py-2 border rounded-xl text-sm"
                        >
                            {JUDGE_ROLE_OPTIONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                        </select>
                    </div>

                    {!manualMode ? (
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Foydalanuvchini tanlang</label>
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Ism yoki username bo'yicha qidiring..."
                                    className="w-full pl-9 pr-4 py-2 border rounded-xl text-sm"
                                />
                            </div>
                            <div className="mt-2 space-y-1">
                                {candidates.length === 0 ? (
                                    <p className="text-[11px] text-gray-400 px-1 py-2">
                                        {search.trim()
                                            ? "Mos foydalanuvchi topilmadi."
                                            : "Ro'yxatda tanlanadigan akkaunt yo'q — pastdagi \"qo'lda kiritish\"dan foydalaning."}
                                    </p>
                                ) : candidates.map(p => (
                                    <button
                                        key={p.username}
                                        type="button"
                                        onClick={() => addJudge(p.username)}
                                        className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-white border border-gray-200 rounded-xl text-left hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
                                    >
                                        <span className="min-w-0">
                                            <span className="block text-sm font-semibold text-gray-800 truncate">{p.fullName || p.username}</span>
                                            <span className="block text-[11px] text-gray-400 truncate">
                                                {p.username}{p.role ? ` · ${p.role}` : ''}
                                            </span>
                                        </span>
                                        <Plus size={14} className="text-indigo-600 shrink-0" />
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => setManualMode(true)}
                                className="mt-2 text-[11px] font-semibold text-gray-500 hover:text-indigo-600 underline"
                            >
                                Ro'yxatda yo'qmi? Username'ni qo'lda kiriting
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                            <div className="flex-1">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Username</label>
                                <input
                                    type="text"
                                    value={newUsername}
                                    onChange={e => setNewUsername(e.target.value)}
                                    placeholder="masalan: hakam_3"
                                    className="w-full px-4 py-2 border rounded-xl text-sm"
                                />
                                <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                                    <AlertTriangle size={11} /> Bunday akkaunt mavjudligi tekshirilmaydi — u tizimga kira olmasa, ball qo'ya olmaydi.
                                </p>
                            </div>
                            <Button variant="primary" size="sm" onClick={() => addJudge(newUsername)} disabled={!newUsername.trim()}>
                                Qo'shish
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => { setManualMode(false); setNewUsername(''); }}>
                                Ro'yxatdan tanlash
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {error && (
                <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard icon={UserCheck} label="Jami hakamlar" value={judgeStats.length} accent="indigo" />
                <StatCard icon={Activity} label="Onlayn hakamlar" value={onlineCount} accent="emerald" />
                <StatCard icon={FileBarChart2} label="Jami baholash yozuvlari" value={scoresData.length} accent="amber" />
            </div>

            {judgeStats.length === 0 && (
                <div className="p-8 text-center border border-dashed border-gray-200 rounded-2xl">
                    <p className="text-sm font-semibold text-gray-500">Hali hakam biriktirilmagan</p>
                    <p className="text-xs text-gray-400 mt-1">
                        "Hakam qo'shish" tugmasi orqali baholovchilarni biriktiring — ular qo'ygan ballar
                        "Hisoblash usuli"ga ko'ra ({competition.calculationMethod === 'average' ? "o'rtacha" : 'jami'}) birlashtiriladi.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {judgeStats.map((j) => (
                    <div key={j.name} className="p-4 bg-gray-50 border rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                                    {j.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm text-gray-800 flex items-center gap-1.5">
                                        {j.name}
                                        {j.roleLabel && (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 uppercase tracking-wide">
                                                {j.roleLabel}
                                            </span>
                                        )}
                                    </h4>
                                    <p className="text-[10px] text-gray-400">
                                        {j.roleActive === false ? 'Faol emas' : 'Rasmiy Hakam'} • UniPlatform Verification
                                    </p>
                                </div>
                            </div>
                            <span className="flex items-center gap-1.5 shrink-0">
                                <span className={`w-2 h-2 rounded-full ${j.isOnline ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    j.isOnline ? 'text-emerald-700 bg-emerald-50' : 'text-gray-500 bg-gray-100'
                                }`}>
                                    {j.isOnline ? 'Online' : 'Offline'}
                                </span>
                                {hasFullAdminAccess() && (
                                    <button
                                        type="button"
                                        title="Hakamlar ro'yxatidan chiqarish"
                                        onClick={() => handleRemoveJudge(j.name)}
                                        className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                )}
                            </span>
                        </div>

                        {hasFullAdminAccess() && (
                            <div>
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Roli</label>
                                <select
                                    value={j.roleKey}
                                    onChange={e => handleChangeRole(j.name, e.target.value)}
                                    className="w-full px-3 py-1.5 border rounded-xl text-xs bg-white"
                                >
                                    <option value="">Rol belgilanmagan</option>
                                    {JUDGE_ROLE_OPTIONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                                </select>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2 bg-white rounded-xl border">
                                <p className="text-gray-400">Faollik ko'rsatilgan raundlar</p>
                                <p className="font-bold text-gray-800 mt-0.5">
                                    {j.rounds.length > 0 ? j.rounds.join(', ') : "Hali yo'q"}
                                </p>
                            </div>
                            <div className="p-2 bg-white rounded-xl border">
                                <p className="text-gray-400">Baholash yozuvlari</p>
                                <p className="font-bold text-gray-800 mt-0.5">{j.submissionCount} ta</p>
                            </div>
                        </div>
                        <p className="text-[11px] text-gray-400">
                            Oxirgi faollik: <span className="font-semibold text-gray-600">{formatRelativeTime(j.lastActivity)}</span>
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CompetitionJudgesTab;
