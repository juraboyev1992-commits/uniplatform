import React, { useState } from 'react';
import {
    Trophy, Calendar, Users, ListChecks, Scale, UserPlus, Share2, MoreHorizontal,
    AlertCircle, BookOpen, User, Clock, Award, Shield, Zap, RefreshCw, Maximize2,
    Minimize2, Sun, Moon
} from 'lucide-react';
import Badge from './Badge';
import CompetitionSettingsMenu from './CompetitionSettingsMenu';

// "Musobaqa Pasporti" hero card — presentational, prop-driven (mirrors CompetitionOverviewTab.jsx's
// convention: no independent db reads/writes here, everything is computed by the parent and passed in
// or reached via callbacks). Sits above the tab bar in TournamentScoring.jsx's workspace view.
const STATUS_LABELS = { upcoming: 'Ochilmagan', ongoing: 'Faol', closed: 'Yakunlangan' };
const STATUS_BADGE_VARIANTS = { upcoming: 'info', ongoing: 'success', closed: 'default' };
const ROLE_LABELS = {
    ADMINISTRATOR: "Administrator (To'liq)",
    MODERATOR: "Moderator (Ko'rish+Eksport)",
    COORDINATOR: "Koordinator (Ko'rish)",
    JUDGE: "Hakam (Faqat ko'rish)",
    PUBLIC: "Mehmon (Ochiq ko'rish)"
};

const InfoTile = ({ icon: Icon, label, value }) => (
    <div className="flex items-center gap-2.5 bg-white/10 rounded-2xl px-3.5 py-2.5">
        <Icon size={16} className="text-indigo-100 shrink-0" />
        <div className="min-w-0">
            <p className="text-[10px] font-semibold text-indigo-200 uppercase tracking-wide truncate">{label}</p>
            <p className="text-sm font-bold text-white truncate">{value}</p>
        </div>
    </div>
);

const CompetitionPassportHero = ({
    competition,
    status,
    ownerDisplayName,
    dateLabel,
    participantCount,
    questionsLabel,
    questionsCount,
    tieBreakLabel,
    // Live competition stats (highest/lowest/average/active judges/progress/leader score) — moved up here
    // from CompetitionResultsCenter.jsx's own summary-card row so they're visible on every tab, not just
    // Natijalar markazi. Optional: null before there's any leaderboard data yet (brand-new competition).
    stats,
    // Moved up from CompetitionResultsCenter.jsx's own header block (role badge, methodology/type
    // subtitle, Status indicator, and the Hakamlik/Refresh/Fullscreen/Live-ekran/Dark-mode buttons) so
    // they're visible on every tab, not just Natijalar markazi.
    role,
    scoringMethodLabel,
    competitionTypeLabel,
    onViewLiveScoring,
    onRefresh,
    isFullscreen,
    onToggleFullscreen,
    onOpenLiveScreen,
    darkMode,
    onToggleTheme,
    hasFullAdminAccess,
    canManageGroups,
    onSelectSettingsSection,
    onFinishTournament,
    onDeleteCompetition,
    onAddTeam,
    onShare
}) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    return (
        <div className="p-6 bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 rounded-3xl text-white shadow-md">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <Trophy size={20} className="text-yellow-300 shrink-0" />
                        <h2 className="text-xl font-black truncate">{competition.name}</h2>
                        {status && (
                            <Badge variant={STATUS_BADGE_VARIANTS[status]} size="sm">
                                {STATUS_LABELS[status]}
                            </Badge>
                        )}
                        {competition.mode === 'professional' && (
                            <Badge variant="primary" size="sm">Professional</Badge>
                        )}
                        {competition.moderationStatus === 'pending' && (
                            <Badge variant="warning" size="sm" title="Talabalarga hali ko'rinmaydi — admin tasdiqlashi kerak">
                                Moderatsiyada
                            </Badge>
                        )}
                        {competition.moderationStatus === 'rejected' && (
                            <Badge variant="danger" size="sm" title={competition.moderationComment || 'Admin tomonidan rad etilgan'}>
                                Rad etilgan
                            </Badge>
                        )}
                        {role && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/10 text-indigo-100">
                                <Shield size={12} />
                                {ROLE_LABELS[role] || role}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-indigo-200 mt-1">
                        Musobaqa pasporti{hasFullAdminAccess() && ownerDisplayName ? ` • Egasi: ${ownerDisplayName}` : ''}
                    </p>
                    {(scoringMethodLabel || competitionTypeLabel) && (
                        <p className="text-xs text-indigo-200 mt-1 flex items-center gap-3 flex-wrap">
                            {scoringMethodLabel && <span>Baholash metodologiyasi: <strong className="text-white">{scoringMethodLabel}</strong></span>}
                            {competitionTypeLabel && <span>Turi: <strong className="text-white">{competitionTypeLabel}</strong></span>}
                            {status && (
                                <span className="inline-flex items-center gap-1.5 font-bold text-white">
                                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                                    {STATUS_LABELS[status]}
                                </span>
                            )}
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {onViewLiveScoring && ['ADMINISTRATOR', 'JUDGE', 'COORDINATOR'].includes(role) && (
                        <button
                            type="button"
                            onClick={onViewLiveScoring}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl text-xs font-bold shadow-md hover:brightness-105 transition-all"
                        >
                            <Zap size={14} className="animate-pulse" />
                            Hakamlik / Live Scoring
                        </button>
                    )}
                    {onRefresh && (
                        <button type="button" onClick={onRefresh} title="Natijalarni yangilash" className="flex items-center justify-center w-9 h-9 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
                            <RefreshCw size={14} />
                        </button>
                    )}
                    {onToggleFullscreen && (
                        <button type="button" onClick={onToggleFullscreen} title="Butun ekran" className="flex items-center justify-center w-9 h-9 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
                            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                    )}
                    {onOpenLiveScreen && (
                        <button type="button" onClick={onOpenLiveScreen} title="Live ekran (yangi oyna)" className="flex items-center justify-center w-9 h-9 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
                            <Trophy size={14} />
                        </button>
                    )}
                    {onToggleTheme && (
                        <button type="button" onClick={onToggleTheme} title={darkMode ? 'Kunduzgi rejim' : 'Tungi rejim'} className="flex items-center justify-center w-9 h-9 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
                            {darkMode ? <Sun size={14} className="text-amber-300" /> : <Moon size={14} />}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onAddTeam}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-colors"
                    >
                        <UserPlus size={14} />
                        Jamoa qo'shish
                    </button>
                    <button
                        type="button"
                        onClick={onShare}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-colors"
                    >
                        <Share2 size={14} />
                        Ulashish
                    </button>
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setIsMenuOpen(v => !v)}
                            className="flex items-center justify-center w-9 h-9 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
                            title="Sozlamalar — Vakolatlar, Hakamlar, Raundlar boshqaruvi"
                        >
                            <MoreHorizontal size={16} />
                        </button>
                        {isMenuOpen && (
                            <CompetitionSettingsMenu
                                competition={competition}
                                hasFullAdminAccess={hasFullAdminAccess}
                                canManageGroups={canManageGroups}
                                onSelectSection={onSelectSettingsSection}
                                onFinish={onFinishTournament}
                                onDelete={onDeleteCompetition}
                                onClose={() => setIsMenuOpen(false)}
                            />
                        )}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-3 mt-5">
                <InfoTile icon={Calendar} label="Sana" value={dateLabel} />
                <InfoTile icon={Users} label="Ishtirokchilar" value={participantCount} />
                <InfoTile icon={ListChecks} label={questionsLabel} value={stats ? stats.progressLabel : questionsCount} />
                <InfoTile icon={Scale} label="Tie-break" value={tieBreakLabel} />
                {stats && (
                    <>
                        <InfoTile icon={Trophy} label="Eng yuqori ball" value={stats.highest} />
                        <InfoTile icon={AlertCircle} label="Eng past ball" value={stats.lowest} />
                        <InfoTile icon={BookOpen} label="O'rtacha ball" value={stats.average} />
                        <InfoTile icon={User} label="Faol hakamlar" value={stats.activeJudges} />
                        <InfoTile icon={Clock} label="Progress" value={`${stats.progressPercent}%`} />
                        <InfoTile icon={Award} label="Yetakchi balli" value={stats.leaderScore} />
                    </>
                )}
            </div>
        </div>
    );
};

export default CompetitionPassportHero;
