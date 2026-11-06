import React, { useState } from 'react';
import {
    Trophy, Calendar, Users, ListChecks, Scale, UserPlus, Share2, MoreHorizontal,
    Shield, Zap, RefreshCw, Maximize2, Minimize2, Sun, Moon, MonitorPlay
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

// Ball statistikasi uchun ingichka qator. Ilgari bular ham InfoTile edi va
// sarlavhada jami O'NTA bir xil katak turardi - ko'z qayerga qarashni bilmasdi.
const ScoreStat = ({ label, value }) => (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
        {label}
        <strong className="text-sm font-bold text-white tabular-nums">{value}</strong>
    </span>
);

// Yordamchi boshqaruv tugmalari - faqat belgi, bitta guruh ichida.
const IconButton = ({ icon: Icon, title, onClick, children }) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/15 transition-colors"
    >
        {children || <Icon size={14} />}
    </button>
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
    // Live competition stats (highest/lowest/average/leader score) — moved up here from
    // CompetitionResultsCenter.jsx's own summary-card row so they're visible on every tab, not just
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
    // Musobaqaning O'Z KLUBI koordinatori "Musobaqa sozlamalari" bandini
    // ocha oladi (nomni tahrirlash). Qolgan bandlar avvalgidek adminda.
    canEditBasics,
    onSelectSettingsSection,
    onFinishTournament,
    onDeleteCompetition,
    onAddTeam,
    onShare
}) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    return (
        <div className="p-5 bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 rounded-3xl text-white shadow-md">
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
                    {/* BITTA tavsif qatori. Ilgari bu yerda ikkita qator bor edi va
                        ularda holat UCHINCHI marta takrorlanardi: sarlavha yonidagi
                        yorliq ham, yashil nuqta ham, yonidagi "Faol" yozuvi ham bir
                        xil narsani aytardi. "Musobaqa pasporti" yozuvi ham olib
                        tashlandi - kartochkaning o'zi pasport, uni aytib turish
                        kerak emas. */}
                    <p className="text-xs text-indigo-200 mt-1.5 flex items-center gap-x-2 gap-y-1 flex-wrap">
                        {scoringMethodLabel && <span className="font-semibold text-white">{scoringMethodLabel}</span>}
                        {competitionTypeLabel && (
                            <>
                                <span className="text-indigo-400">·</span>
                                <span>{competitionTypeLabel}</span>
                            </>
                        )}
                        {hasFullAdminAccess() && ownerDisplayName && (
                            <>
                                <span className="text-indigo-400">·</span>
                                <span>Egasi: {ownerDisplayName}</span>
                            </>
                        )}
                    </p>
                </div>
                {/* Tugmalar ikki darajaga bo'lindi: kundalik ishlatiladigan uchtasi
                    yozuvli, qolgani bitta belgi-guruhda. Ilgari sakkiztasi bir
                    qatorda teng ko'rinishda turardi va qaysi biri asosiy ekani
                    bilinmasdi. */}
                <div className="flex flex-wrap items-center gap-2">
                    {onViewLiveScoring && ['ADMINISTRATOR', 'JUDGE', 'COORDINATOR'].includes(role) && (
                        <button
                            type="button"
                            onClick={onViewLiveScoring}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl text-xs font-bold shadow-md hover:brightness-105 transition-all"
                        >
                            <Zap size={14} className="animate-pulse" />
                            Hakamlik
                        </button>
                    )}
                    {/* JONLI EKRAN - zaldagi proyektor uchun. Yozuvsiz qoldirib
                        bo'lmaydi: yonidagi kubok belgisi bilan adashtiriladi. */}
                    {onOpenLiveScreen && (
                        <button
                            type="button"
                            onClick={onOpenLiveScreen}
                            title="Jonli ekran (yangi oynada ochiladi)"
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-colors"
                        >
                            <MonitorPlay size={14} />
                            Jonli ekran
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

                    <div className="flex items-center gap-0.5 bg-white/10 rounded-xl p-0.5">
                        {onRefresh && (
                            <IconButton icon={RefreshCw} title="Natijalarni yangilash" onClick={onRefresh} />
                        )}
                        {onToggleFullscreen && (
                            <IconButton title="Butun ekran" onClick={onToggleFullscreen}>
                                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            </IconButton>
                        )}
                        {onToggleTheme && (
                            <IconButton title={darkMode ? 'Kunduzgi rejim' : 'Tungi rejim'} onClick={onToggleTheme}>
                                {darkMode ? <Sun size={14} className="text-amber-300" /> : <Moon size={14} />}
                            </IconButton>
                        )}
                        <IconButton icon={Share2} title="Ulashish — ochiq havola" onClick={onShare} />
                        <div className="relative">
                            <IconButton
                                icon={MoreHorizontal}
                                title="Sozlamalar — Vakolatlar, Hakamlar, Raundlar boshqaruvi"
                                onClick={() => setIsMenuOpen(v => !v)}
                            />
                            {isMenuOpen && (
                                <CompetitionSettingsMenu
                                    competition={competition}
                                    hasFullAdminAccess={hasFullAdminAccess}
                                    canManageGroups={canManageGroups}
                                    canEditBasics={canEditBasics}
                                    onSelectSection={onSelectSettingsSection}
                                    onFinish={onFinishTournament}
                                    onDelete={onDeleteCompetition}
                                    onClose={() => setIsMenuOpen(false)}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* PASPORT MA'LUMOTI - musobaqaning o'zgarmas hujjat qatori.
                //
                Ilgari bu yerda o'nta bir xil katak turardi va uchtasi ostidagi
                "Asosiy" bo'limida yana qaytarilardi. "Faol hakamlar" esa ikki
                joyda IKKI XIL raqam ko'rsatardi: shu yerda baho qo'ygan hakamlar
                soni, kartochkada ro'yxatdagilardan nechtasi faol ekani. Endi u
                faqat kartochkada - maxraji bilan, ya'ni tushunarli shaklda.
                "Progress %" ham olib tashlandi: yonidagi "1 / 24" ayni o'sha
                narsa, ostida esa jarayon chizig'i turibdi. */}
            <div className="flex flex-wrap gap-2.5 mt-4">
                <InfoTile icon={Calendar} label="Sana" value={dateLabel} />
                <InfoTile icon={Users} label="Ishtirokchilar" value={participantCount} />
                <InfoTile icon={ListChecks} label={questionsLabel} value={stats ? stats.progressLabel : questionsCount} />
                <InfoTile icon={Scale} label="Tie-break" value={tieBreakLabel} />
            </div>

            {/* Ball statistikasi - sarlavhaning mavzusi emas, shuning uchun katak
                emas, ingichka qator. Reyting/Natijalar sahifasida to'liq ko'rinadi. */}
            {stats && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3 pt-3 border-t border-white/15 text-xs text-indigo-200">
                    <ScoreStat label="Eng yuqori" value={stats.highest} />
                    <ScoreStat label="O'rtacha" value={stats.average} />
                    <ScoreStat label="Eng past" value={stats.lowest} />
                    <ScoreStat label="Yetakchi balli" value={stats.leaderScore} />
                </div>
            )}
        </div>
    );
};

export default CompetitionPassportHero;
