import React, { useMemo } from 'react';
import { UserCheck, Crown } from 'lucide-react';
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
        <div className="p-5 space-y-4">
            {/* Name/status/trophy/participant-count/round-count already shown in the Passport hero above
                every tab, and "Baholashni boshlash"/"Natijalar markaziga o'tish" shortcuts were dropped
                too — "Natija kiritish" and "Natijalar markazi" already exist as their own top-level tabs,
                so a second way to reach them here was redundant navigation, not a shortcut. */}

            {/* Faqat pasport sarlavhasida YO'Q ko'rsatkichlar qoldi.
                //
                "Turi" ham shu yerda edi - sarlavhadagi tavsif qatorida aynan
                o'sha so'z turibdi, shuning uchun olib tashlandi. "Faol hakamlar"
                esa aksincha: u sarlavhadan olib tashlanib shu yerda qoldirildi,
                chunki bu yerdagi shakl maxrajli ("0/4" - ro'yxatda nechta hakam
                bor va nechtasi baho qo'ygan), sarlavhadagisi esa maxrajsiz
                boshqa raqam ko'rsatardi. Bitta ko'rsatkich ikki joyda ikki xil
                hisoblanmasligi kerak. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                {/* Raundlar ko'rsatkichi ilgari ikki marta turardi: tepada
                    "Yakunlangan raundlar 0/24" kartochkasi, bu yerda esa aynan
                    o'sha "0/24" chiziq bilan. Kartochka olib tashlandi - chiziq
                    ko'proq narsa aytadi (nisbatni ko'rsatadi), kartochka esa
                    faqat raqamni takrorlardi. */}
                <h4 className="font-bold text-gray-900 text-sm mb-4">Musobaqa jarayoni</h4>
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

            {/* BU YERDA UCHTA KARTOCHKA BOR EDI - uchovi ham olib tashlandi.
                //
                "Musobaqa Turi va Formati" - "Jamoaviy musobaqa formatida tashkil
                etilgan" degan jumla edi: yonidagi "Jamoaviy" so'zini qayta
                aytishdan boshqa ish qilmasdi.
                "Baholash Usuliyati" - `scoringMethod` ni xom holda, inglizcha
                ko'rsatardi ("CORRECT ANSWER"). To'g'ri, o'zbekcha nomi pasport
                sarlavhasida allaqachon bor.
                "Tartib va Audit Qoidalari" - har bir musobaqada bir xil turadigan
                uchta jumla. Bu musobaqa haqida hech narsa aytmaydi; o'rni -
                yo'riqnoma, ish maydoni emas.
                //
                Uchovi joy egallab, foydalanuvchini "bu yerda nimadir bor" deb
                o'qishga majbur qilardi. Yangi ma'lumot qo'shilsa, u musobaqaning
                O'ZIDAN kelishi kerak, andozadan emas. */}
        </div>
    );
};

export default CompetitionOverviewTab;
