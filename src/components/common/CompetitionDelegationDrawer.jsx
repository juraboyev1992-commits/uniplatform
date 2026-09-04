import React, { useMemo, useState } from 'react';
import { ShieldCheck, Trash2 } from 'lucide-react';
import Badge from './Badge';
import { db } from '../../services/db';
import { COMPETITION_DELEGATION_PERMISSIONS } from '../../utils/competitionPermissions';

// Real name for a username — db.getMockStudents() first (id === username), falling back to the real
// Supabase-synced profile pool (db.getSyncedProfiles) for accounts created post-migration, and finally
// the raw username itself if neither hits (matches the fallback chain already used elsewhere, e.g.
// db.js:2230's studentById.get(m.userId)?.fullName || m.userId idiom).
const resolveDisplayName = (username) => {
    const student = db.getMockStudents().find(s => s.id === username);
    if (student) return student.fullName;
    const profile = db.getSyncedProfiles().find(p => p.username === username || p.id === username);
    if (profile) return profile.fullName;
    return username;
};

// Content rendered inside a <Modal> by TournamentScoring.jsx (mirrors this codebase's existing pattern
// of a plain content component driven by the parent's isOpen state, e.g. review-step forms). Owner/
// admin-only — gated by the parent before this is even mounted.
const CompetitionDelegationDrawer = ({ competition, actingUsername, onChanged }) => {
    const [username, setUsername] = useState('');
    const [selectedPermissions, setSelectedPermissions] = useState([]);
    const [version, setVersion] = useState(0);

    const grants = useMemo(
        () => db.getCompetitionDelegations(competition.id),
        [competition.id, version]
    );

    // Vakil bo'la oladiganlar ro'yxati — erkin username kiritish o'rniga, faqat shu musobaqaning
    // hakamlari yoki shu klubning koordinatorlari/xodimlari ("kim vakil bo'la oladi" cheklovi, xato
    // username kiritish yoki aloqasiz odamga vakolat berish xavfini yo'qotadi).
    const candidates = useMemo(() => {
        const seen = new Set();
        const result = [];
        (competition.judges || []).forEach(uname => {
            if (uname && !seen.has(uname)) { seen.add(uname); result.push({ username: uname, via: 'Hakam' }); }
        });
        if (competition.contextType === 'club' && competition.contextId) {
            db.getClubMembers(competition.contextId)
                .filter(m => ['coordinator', 'head_coordinator'].includes(m.role))
                .forEach(m => {
                    if (m.userId && !seen.has(m.userId)) { seen.add(m.userId); result.push({ username: m.userId, via: 'Klub xodimi' }); }
                });
        }
        return result
            .map(c => ({ ...c, displayName: resolveDisplayName(c.username) }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName));
    }, [competition.judges, competition.contextType, competition.contextId]);

    const togglePermission = (key) => {
        setSelectedPermissions(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
    };

    const handleGrant = () => {
        if (!username.trim() || selectedPermissions.length === 0) return;
        db.grantCompetitionDelegation(competition.id, username.trim(), selectedPermissions, actingUsername);
        setUsername('');
        setSelectedPermissions([]);
        setVersion(v => v + 1);
        onChanged?.();
    };

    const handleRevoke = (id) => {
        db.revokeCompetitionDelegation(id, actingUsername);
        setVersion(v => v + 1);
        onChanged?.();
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="font-bold text-gray-900 text-sm mb-3">Yangi vakolat berish</h3>
                <div className="flex flex-col gap-3 p-4 bg-slate-50 rounded-2xl">
                    <select
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        className="w-full px-4 py-2.5 border rounded-xl text-sm"
                    >
                        <option value="">Vakilni tanlang...</option>
                        {candidates.map(c => (
                            <option key={c.username} value={c.username}>{c.displayName} — {c.via}</option>
                        ))}
                    </select>
                    {candidates.length === 0 && (
                        <p className="text-[11px] text-amber-600">
                            Hozircha hakam yoki klub xodimi topilmadi — avval "Hakamlar" bo'limida hakam qo'shing yoki klubga koordinator biriktiring.
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {COMPETITION_DELEGATION_PERMISSIONS.map(p => (
                            <button
                                key={p.key}
                                type="button"
                                onClick={() => togglePermission(p.key)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                    selectedPermissions.includes(p.key)
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={handleGrant}
                        disabled={!username.trim() || selectedPermissions.length === 0}
                        className="self-start flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
                    >
                        <ShieldCheck size={14} />
                        Vakolat berish
                    </button>
                </div>
            </div>

            <div>
                <h3 className="font-bold text-gray-900 text-sm mb-3">Faol vakolatlar ({grants.length})</h3>
                {grants.length === 0 ? (
                    <p className="text-xs text-gray-400">Hozircha hech kimga vakolat berilmagan.</p>
                ) : (
                    <div className="space-y-2">
                        {grants.map(g => (
                            <div key={g.id} className="flex items-center justify-between gap-3 p-3 bg-white border border-gray-100 rounded-xl">
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-800">{resolveDisplayName(g.granteeUsername)}</p>
                                    <p className="text-[10px] text-gray-400">{g.granteeUsername}</p>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {g.permissions.map(key => (
                                            <Badge key={key} variant="default" size="sm">
                                                {COMPETITION_DELEGATION_PERMISSIONS.find(p => p.key === key)?.label || key}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleRevoke(g.id)}
                                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                >
                                    <Trash2 size={13} />
                                    Bekor qilish
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CompetitionDelegationDrawer;
