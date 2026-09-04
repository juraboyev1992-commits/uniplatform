import React, { useMemo } from 'react';
import { Trophy, CheckCircle2, UserCheck, Crown } from 'lucide-react';
import Card from './Card';
import ProgressBar from './ProgressBar';
import { StatCard } from './RankingsSharedUI';
import { db } from '../../services/db';
import { isMatchBasedEngine } from '../../config/competitionEngines';

// Overview tab for the Competition Management workspace (TournamentScoring.jsx).
// Pure presentational — all data (competition/scoresData/leaderboardData) is already
// loaded/memoized by the parent; this component derives display-only stats from it.
const CompetitionOverviewTab = ({ competition, scoresData, leaderboardData }) => {
    // match_play/debate_match never advance competition.currentRound/roundsCount — their real
    // structure/progress lives in real match records (see TournamentStructureStep.jsx's isMatchBased
    // notice: matches are built post-creation, not something the wizard pre-counts). Real finished/total
    // match counts substitute for "Yakunlangan raundlar" here instead of the always-stale 0/1.
    const isMatchBased = isMatchBasedEngine(competition.scoringMethod);
    // TSUL Court (court_match) stores its matches in the SAME debate_matches table as Munozara.
    const usesDebateMatches = ['debate_match', 'court_match'].includes(competition.scoringMethod);
    const matchProgress = useMemo(() => {
        if (!isMatchBased) return null;
        const matches = usesDebateMatches
            ? db.getDebateMatches(competition.id)
            : db.getCompetitionMatches(competition.id);
        const finished = matches.filter(m => m.status === 'finished').length;
        return { completed: finished, total: matches.length };
    }, [isMatchBased, usesDebateMatches, competition.id]);

    const completedRounds = matchProgress ? matchProgress.completed : Math.max(0, (competition.currentRound || 1) - 1);
    const totalRounds = matchProgress ? matchProgress.total : competition.roundsCount;
    const roundsLabel = isMatchBased
        ? (usesDebateMatches ? "Yakunlangan uchrashuvlar" : "Yakunlangan o'yinlar")
        : 'Yakunlangan raundlar';

    const activeJudges = useMemo(() => {
        const judgesWithActivity = new Set(scoresData.map(s => s.judge));
        return (competition.judges || []).filter(j => judgesWithActivity.has(j)).length;
    }, [scoresData, competition.judges]);

    const currentRoundJudgeProgress = useMemo(() => {
        const judgesActiveThisRound = new Set(
            scoresData.filter(s => s.round === competition.currentRound).map(s => s.judge)
        ).size;
        const totalJudges = (competition.judges || []).length || 1;
        return Math.round((judgesActiveThisRound / totalJudges) * 100);
    }, [scoresData, competition.currentRound, competition.judges]);

    const leader = leaderboardData && leaderboardData.length > 0 && leaderboardData[0].totalScore > 0
        ? leaderboardData[0]
        : null;

    const roundProgressPct = Math.round((completedRounds / (totalRounds || 1)) * 100);

    return (
        <div className="p-6 space-y-6">
            {/* Name/status/trophy/participant-count/round-count already shown in the Passport hero above
                every tab, and "Baholashni boshlash"/"Natijalar markaziga o'tish" shortcuts were dropped
                too — "Natija kiritish" and "Natijalar markazi" already exist as their own top-level tabs,
                so a second way to reach them here was redundant navigation, not a shortcut. */}

            {/* Stat-card row — only stats the Passport hero doesn't already show (Turi/Yakunlangan
                raundlar progress/Faol hakamlar/Yetakchi); Holati and Ishtirokchilar dropped since the
                hero's status badge and "Ishtirokchilar" info tile already cover those. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    icon={Trophy}
                    label="Turi"
                    value={competition.type === 'team' ? 'Jamoaviy' : 'Yakka'}
                    accent="indigo"
                />
                <StatCard
                    icon={CheckCircle2}
                    label={roundsLabel}
                    value={`${completedRounds}/${totalRounds}`}
                    accent="emerald"
                />
                <StatCard
                    icon={UserCheck}
                    label="Faol hakamlar"
                    value={`${activeJudges}/${(competition.judges || []).length}`}
                    accent="amber"
                />
                <StatCard
                    icon={Crown}
                    label="Yetakchi"
                    value={leader ? (leader.participant.name || leader.participant.fullName) : '—'}
                    accent="rose"
                />
            </div>

            {/* Progress */}
            <Card className="p-5 border-none bg-white/80">
                <h4 className="font-bold text-gray-900 text-sm mb-4">Musobaqa Jarayoni</h4>
                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between text-xs font-semibold text-gray-500 mb-1.5">
                            <span>{isMatchBased ? `${roundsLabel} jarayoni` : "Raundlar bo'yicha jarayon"}</span>
                            <span>{completedRounds}/{totalRounds}</span>
                        </div>
                        <ProgressBar value={roundProgressPct} max={100} color="auto" size="md" showPercentage={false} />
                    </div>
                    {!isMatchBased && (
                    <div>
                        <div className="flex justify-between text-xs font-semibold text-gray-500 mb-1.5">
                            <span>Joriy raunddagi hakamlar faolligi</span>
                            <span>{currentRoundJudgeProgress}%</span>
                        </div>
                        <ProgressBar value={currentRoundJudgeProgress} max={100} color="auto" size="md" showPercentage={false} />
                    </div>
                    )}
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-5 border-none bg-slate-50">
                    <h4 className="font-bold text-gray-900 text-sm mb-3">Musobaqa Turi va Formati</h4>
                    <p className="text-xs text-gray-500 leading-relaxed">
                        {competition.type === 'team' ? 'Jamoaviy musobaqa formatida tashkil etilgan.' : 'Yakka tartibda har bir talaba bo\'yicha alohida baholanadi.'}
                    </p>
                </Card>
                <Card className="p-5 border-none bg-slate-50">
                    <h4 className="font-bold text-gray-900 text-sm mb-3">Baholash Usuliyati</h4>
                    <p className="text-xs text-gray-500 leading-relaxed font-semibold text-indigo-600 uppercase">
                        {competition.scoringMethod.replace('_', ' ')}
                    </p>
                </Card>
                <Card className="p-5 border-none bg-slate-50">
                    <h4 className="font-bold text-gray-900 text-sm mb-3">Tartib va Audit Qoidalari</h4>
                    <ul className="text-xs text-gray-500 list-disc list-inside space-y-1">
                        <li>Har bir raund natijasi saqlanishi bilan audit jurnaliga yoziladi.</li>
                        <li>Natijalar real-vaqt rejimida Natijalar Markazida aks etadi.</li>
                        <li>Hakamlar bahosi avtomatik tarzda tekshiriladi.</li>
                    </ul>
                </Card>
            </div>
        </div>
    );
};

export default CompetitionOverviewTab;
