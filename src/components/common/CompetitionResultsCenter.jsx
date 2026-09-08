import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Trophy, Users, Search, Download,
    Eye, EyeOff, LayoutGrid, ChevronRight, ChevronLeft, SlidersHorizontal, Info,
    User, Award, Calendar, BookOpen, Clock, X, CheckCircle, AlertCircle,
    Printer, FileText, ChevronDown, Check, ArrowUpDown,
    Settings, Minus, Lock
} from 'lucide-react';
import Card from './Card';
import Badge from './Badge';
import ProgressBar from './ProgressBar';
import { getPageRange } from './Pagination';
import { computeQuizMixedPoints, computeDebateRoundTotal, getDisplayStages, getDisplayStageLeafLabel, getEffectivePointsTable } from '../../config/competitionEngines';
import { useTheme } from '../../contexts/ThemeContext';
import { exportRowsToExcel } from '../../utils/exportToExcel';
import ScoreCardExport from './ScoreCardExport';
import CertificateGenerator from './CertificateGenerator';
import Modal from './Modal';
import TeamRosterAndHistory from './TeamRosterAndHistory';
import { db } from '../../services/db';

// TSUL Court-style nominations — a holistic admin judgment, not derived from any score. Generic enough
// to be harmless/usable for other competitions too, not gated behind a specific preset check.
const NOMINATION_CATEGORIES = ['Best Advocate', 'Best Memorial', 'Best Process Performance'];

const CompetitionResultsCenter = ({
    competition,
    scoresData = [],
    auditLogs = [],
    debatePenalties = [],
    userRole = 'PUBLIC', // 'ADMINISTRATOR' | 'MODERATOR' | 'COORDINATOR' | 'JUDGE' | 'PUBLIC'
    resultsHidden = false,
    canBypassResultsHidden = false
}) => {
    // Mode toggles — dark mode now uses the real app-wide theme (useTheme), replacing the previous
    // disconnected local boolean. Every existing `darkMode ? ... : ...` conditional class below is
    // untouched — `darkMode` is still the name in scope, it's just sourced from the shared hook now, so
    // this component's dark mode stays in sync with the clubs pages that already use it (localStorage +
    // cross-instance event sync), instead of resetting every time this component remounts.
    const { isDark: darkMode } = useTheme();
    const [density, setDensity] = useState('medium'); // 'compact' | 'medium' | 'relaxed'
    
    // Core search / filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState({
        faculty: '',
        course: '',
        group: '',
        club: '',
        category: '',
        status: '',
        participationType: '',
    });

    // Column features (pinned, visible, sort)
    // Fakultet/Guruh/Klub default HIDDEN — opt-in via Sozlamalar, not opt-out (only shown when actually
    // needed; the other columns still default visible, unchanged).
    const [visibleColumns, setVisibleColumns] = useState({
        rank: true,
        participant: true,
        faculty: false,
        course: true,
        group: false,
        club: false,
        totalScore: true
    });
    const [pinnedColumns, setPinnedColumns] = useState({
        rank: true,
        participant: true,
        totalScore: false // totalScore can also be pinned
    });
    const [sortConfig, setSortConfig] = useState({ key: 'totalScore', direction: 'desc' });
    const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);

    // Tur selector — same pill UI/vocabulary as Natija kiritish. The table below shows ONLY the selected
    // Tur's Raund columns (local numbering, resets to R1 per Tur), matching Natija kiritish's own
    // Tur->Raund model exactly instead of one long flat list of every Raund across the whole competition.
    const [selectedTurIndex, setSelectedTurIndex] = useState(1);

    // Round → Question expansion (presentation-only; supports multiple simultaneous expansions)
    const [expandedRounds, setExpandedRounds] = useState(new Set());
    const toggleRoundExpand = (roundNum) => {
        setExpandedRounds(prev => {
            const next = new Set(prev);
            if (next.has(roundNum)) next.delete(roundNum);
            else next.add(roundNum);
            return next;
        });
    };

    // debate: per-row (not per-column) criterion-breakdown expansion
    const [expandedDebateRows, setExpandedDebateRows] = useState(new Set());
    const toggleDebateRowExpand = (rowId) => {
        setExpandedDebateRows(prev => {
            const next = new Set(prev);
            if (next.has(rowId)) next.delete(rowId);
            else next.add(rowId);
            return next;
        });
    };

    // Active Drawer State
    const [drawerParticipant, setDrawerParticipant] = useState(null);

    // Virtualization / Pagination state (for handling 5000+ entries)
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50); // High page size for lazy list rendering

    // Tooltip status
    const [hoveredCell, setHoveredCell] = useState(null);

    // Fullscreen ref
    const containerRef = useRef(null);

    // Dynamic Round / Question structure
    const roundsCount = competition?.roundsCount || 5;
    const isQuestionBased = competition?.scoringMethod === 'correct_answer';
    const isQuizMixed = competition?.scoringMethod === 'quiz_mixed';
    const isDebate = competition?.scoringMethod === 'debate';
    // quiz_mixed's real leaf unit varies per competition — UniQuiz-shaped (each raw round IS the leaf, no
    // further Savol split) reads "Raund", 25-savol-shaped (a raw round IS one individual question) reads
    // "Savol" — was previously hardcoded to "Raund"/"R" for every quiz_mixed competition regardless, which
    // is exactly the "doesn't match the real creation-time settings" mismatch this fixes (same
    // stageLeafLabel resolver TournamentScoring.jsx/QuizMixedScoringGrid.jsx already use).
    const quizMixedLeafLabel = isQuizMixed ? getDisplayStageLeafLabel(competition) : null;
    const dynamicColumnPrefix = isQuestionBased || quizMixedLeafLabel === 'savol' ? 'Savol ' : 'Raund ';
    const dynamicColShortPrefix = isQuestionBased || quizMixedLeafLabel === 'savol' ? 'S' : 'R';
    // Zakovat round model: quiz-type (correct_answer) competitions group their raw rounds — each raw
    // round already IS one question, real data, computed by leaderboardRows below — into rounds of
    // `competition.questionsPerRound` questions each (configured at creation time; falls back to 12 for
    // competitions created before that field existed), matching Live Scoring's R1/R2 grouping exactly.
    // Non-quiz competitions are untouched: one group per raw round, exactly as before this fix.
    const ROUND_GROUP_SIZE = competition?.questionsPerRound || 12;
    // Real Tur (stage) boundaries — same shared resolver TournamentScoring.jsx's "Natija kiritish" uses
    // (getDisplayStages, competitionEngines.js), so this tab and the scoring tab always agree on the
    // same Tur grouping for the same competition. `null`/empty for non-staged/non-correct_answer
    // competitions, which keeps every fallback below byte-identical to this file's original behavior.
    const stages = useMemo(() => getDisplayStages(competition), [competition]);
    const hasStages = !!(stages && stages.length > 0);

    // Default the Tur selector to whichever Tur `currentRound` currently falls into (opens on "where the
    // competition actually is" instead of always Tur 1) — only re-syncs when the competition itself
    // changes, so a judge staying on this tab and picking a different Tur to review stays where they put it.
    useEffect(() => {
        if (!hasStages) return;
        const cur = competition?.currentRound || 1;
        const idx = stages.findIndex(s => cur >= s.roundRange[0] && cur <= s.roundRange[1]);
        setSelectedTurIndex(idx >= 0 ? idx + 1 : 1);
    }, [competition?.id]);

    // Expanded-round state doesn't carry meaning across a Tur switch (its keys are small ints local to
    // whichever Tur is currently shown) — reset so switching Tur never "auto-expands" an unrelated Raund.
    useEffect(() => {
        setExpandedRounds(new Set());
    }, [selectedTurIndex]);

    const roundGroups = useMemo(() => {
        if (!isQuestionBased) {
            // quiz_mixed: each raw round is already its own leaf unit (Raund for UniQuiz, Savol for
            // 25-savol/TDYU-as-league) — when staged, filter down to the SELECTED Tur's own roundRange
            // (same Tur pill selector used above/in Natija kiritish) instead of showing every raw round
            // in the whole competition at once, which previously ignored the Tur pill entirely.
            if (hasStages) {
                const stage = stages[selectedTurIndex - 1] || stages[0];
                const [turStart, turEnd] = stage.roundRange;
                // Real per-Raund boundaries (Bosqichli "Tur tuzilmasi" builder — e.g. 25-savol's own
                // individually-set 5/5/5/5/4/1 savol-per-Raund split, see raundBoundaries in
                // compileStructureToRoundRules) — group columns by RAUND (R1, R2, ...), each expandable
                // into its own real Savol sub-columns, mirroring correct_answer's own Raund-group/expand
                // pattern exactly instead of listing every raw savol flat. turRangeStart stays the WHOLE
                // Tur's start (not the Raund's own) so expanded Savol numbers stay Tur-sequential (e.g.
                // Raund5 expands to Savol 21-24, not 1-4) — same convention Natija kiritish already uses.
                if (isQuizMixed && quizMixedLeafLabel === 'savol' && stage.raundBoundaries?.length > 1) {
                    return stage.raundBoundaries.map((rb, i) => ({
                        group: i + 1,
                        rounds: Array.from({ length: rb.roundRange[1] - rb.roundRange[0] + 1 }, (_, j) => rb.roundRange[0] + j),
                        turRangeStart: turStart
                    }));
                }
                return Array.from({ length: turEnd - turStart + 1 }, (_, i) => ({ group: i + 1, rounds: [turStart + i] }));
            }
            return Array.from({ length: roundsCount }, (_, i) => ({ group: i + 1, rounds: [i + 1] }));
        }
        if (!hasStages) {
            const groups = [];
            for (let start = 1; start <= roundsCount; start += ROUND_GROUP_SIZE) {
                const end = Math.min(start + ROUND_GROUP_SIZE - 1, roundsCount);
                groups.push({ group: groups.length + 1, rounds: Array.from({ length: end - start + 1 }, (_, i) => start + i) });
            }
            return groups;
        }
        // Staged: only the SELECTED Tur's own roundRange, chunked into ROUND_GROUP_SIZE-sized Raund-groups
        // — the table shows one Tur at a time (Tur selector above filters it), Raund numbering starts at
        // R1 for whichever Tur is selected, matching Natija kiritish's own Raund pills exactly.
        const stage = stages[selectedTurIndex - 1] || stages[0];
        const [turStart, turEnd] = stage.roundRange;
        const groups = [];
        for (let start = turStart; start <= turEnd; start += ROUND_GROUP_SIZE) {
            const end = Math.min(start + ROUND_GROUP_SIZE - 1, turEnd);
            groups.push({
                group: groups.length + 1, // local to the selected Tur — also IS the display Raund number
                rounds: Array.from({ length: end - start + 1 }, (_, i) => start + i),
                turRangeStart: turStart
            });
        }
        return groups;
    }, [roundsCount, isQuestionBased, isQuizMixed, quizMixedLeafLabel, ROUND_GROUP_SIZE, hasStages, stages, selectedTurIndex]);

    // UniQuiz per-faculty advancement — which participants may still appear once a LATER Tur is
    // selected, after an earlier Tur boundary's advancement was frozen (CompetitionRoundsTab.jsx's
    // advancement panel). `null` always means "show everyone" (every competition without a frozen
    // PRECEDING boundary — i.e. every non-UniQuiz competition, and Tur1 itself — is unaffected). Depends
    // on the whole `competition` object (not just `.id`) because db.js never caches — the parent's
    // `setActiveComp(db.getCompetitionById(...))` refresh after any advancement write produces a new
    // object reference, which is what actually triggers this to recompute.
    const eligibleParticipantIds = useMemo(
        () => (competition && hasStages ? db.getEligibleParticipantIdsForStage(competition.id, selectedTurIndex) : null),
        [competition, hasStages, selectedTurIndex]
    );

    // Single shared resolver for "what should raw round N be called" — used by the CSV/Excel exports,
    // the participant drawer's round-history list, and the hover tooltip, so every place that names a
    // raw round agrees with each other AND with what a judge saw in Natija kiritish while scoring it.
    const resolveRoundLabel = (rawRound) => {
        if (isQuestionBased) {
            if (!hasStages) return `Savol ${rawRound}`;
            const stage = stages.find(s => rawRound >= s.roundRange[0] && rawRound <= s.roundRange[1]) || stages[0];
            const localSavol = rawRound - stage.roundRange[0] + 1;
            const raundNum = Math.ceil(localSavol / ROUND_GROUP_SIZE);
            return `${stage.label} ${raundNum}-Raund Savol${localSavol}`;
        }
        // quiz_mixed with real Tur stages (UniQuiz/25-savol/Erkin tuzilma) — same Tur-scoped labeling as
        // correct_answer above, just using this competition's own real leaf unit (Raund or Savol) instead
        // of always assuming Savol-within-Raund.
        if (isQuizMixed && hasStages) {
            const stage = stages.find(s => rawRound >= s.roundRange[0] && rawRound <= s.roundRange[1]) || stages[0];
            const localIdx = rawRound - stage.roundRange[0] + 1;
            return `${stage.label} ${dynamicColShortPrefix}${localIdx}`;
        }
        return `${dynamicColumnPrefix}${rawRound}`;
    };

    // Real per-group aggregate for one participant row, summarizing the already-computed roundScores
    // for that group's raw rounds — no invented data, just counting/summing what's genuinely there.
    const getGroupStats = (row, groupRounds) => {
        let correct = 0, incorrect = 0, subtotalPoints = 0;
        groupRounds.forEach(r => {
            const val = row.roundScores[r];
            if (val === null || val === undefined) return;
            subtotalPoints += val;
            if (val > 0) correct++; else incorrect++;
        });
        return { correct, incorrect, answered: correct + incorrect, total: groupRounds.length, subtotalPoints };
    };

    // Parse all participants and match scores
    const leaderboardRows = useMemo(() => {
        if (!competition || !competition.participants) return [];

        // Build mapping of scores
        const scoresMap = {}; // participantId -> roundNumber -> { judgeName -> scoreValue, cellScore, rawDetails }
        scoresData.forEach(s => {
            const pId = s.participantId;
            const rnd = s.round;
            if (!scoresMap[pId]) scoresMap[pId] = {};
            if (!scoresMap[pId][rnd]) scoresMap[pId][rnd] = { sum: 0, count: 0, judges: {}, detailList: [] };

            let numericVal = 0;
            if (competition.scoringMethod === 'correct_answer') {
                // Configured per-competition (set at creation); old competitions without these fields
                // fall back to the original hardcoded behavior (10 / 0) so their results don't change.
                if (s.value === true) {
                    numericVal = competition.pointsPerCorrectAnswer ?? 10;
                } else if (s.value === false) {
                    numericVal = -(competition.penaltyPerWrongAnswer ?? 0);
                }
                // Any other/unset value (not yet scored) leaves numericVal at 0 — no change.
            } else if (competition.scoringMethod === 'single_score') {
                numericVal = Number(s.value) || 0;
            } else if (competition.scoringMethod === 'criteria_based') {
                numericVal = Object.values(s.criteriaScores || {}).reduce((acc, val) => acc + (Number(val) || 0), 0);
            } else if (competition.scoringMethod === 'winner_selection') {
                if (s.value === 'Winner') numericVal = 3;
                else if (s.value === 'Qualified') numericVal = 2;
                else numericVal = 0;
            } else if (competition.scoringMethod === 'quiz_mixed') {
                const ruleType = (competition.roundRules && competition.roundRules[s.round - 1]) || 'standard';
                numericVal = computeQuizMixedPoints(ruleType, s.value, getEffectivePointsTable(competition));
            } else if (competition.scoringMethod === 'debate') {
                numericVal = computeDebateRoundTotal(s.criteriaScores);
            }

            scoresMap[pId][rnd].judges[s.judge] = s.value;
            scoresMap[pId][rnd].detailList.push({
                judge: s.judge,
                score: s.value,
                numericValue: numericVal,
                date: s.date,
                device: s.device,
                criteriaScores: s.criteriaScores || {}
            });
            scoresMap[pId][rnd].sum += numericVal;
            scoresMap[pId][rnd].count += 1;
        });

        // debate: Chief Judge penalties are stored separately and subtracted from the final total
        const penaltyByParticipant = {};
        if (isDebate) {
            debatePenalties.forEach(pen => {
                penaltyByParticipant[pen.participantId] = (penaltyByParticipant[pen.participantId] || 0) + (Number(pen.points) || 0);
            });
        }

        // Map participants to final row objects
        const rows = competition.participants.map(p => {
            const pId = p.id;
            const name = competition.type === 'team' ? p.name : p.fullName;
            
            // Core meta
            const faculty = p.faculty || 'Axborot texnologiyalari';
            const course = p.course || '3-kurs';
            const group = p.group || 'IT-301';
            const club = p.club || 'IT & Innovatsiyalar';
            const status = p.status || 'Aktiv';
            
            // Calculate round-by-round and total scores
            const roundScores = {};
            const roundDetails = {};
            let totalVal = 0;

            for (let r = 1; r <= roundsCount; r++) {
                const roundInfo = scoresMap[pId]?.[r];
                if (roundInfo) {
                    let scoreVal = 0;
                    if (competition.calculationMethod === 'average' && roundInfo.count > 0) {
                        scoreVal = Math.round((roundInfo.sum / roundInfo.count) * 10) / 10;
                    } else {
                        scoreVal = roundInfo.sum;
                    }
                    roundScores[r] = scoreVal;
                    roundDetails[r] = roundInfo.detailList;
                    totalVal += scoreVal;
                } else {
                    roundScores[r] = null;
                    roundDetails[r] = [];
                }
            }

            // debate: real per-criterion averages across every judge/round entry actually recorded —
            // no invented values, just averaging what was genuinely stored (mirrors criteria_based's
            // criteriaScores shape, keyed by criterion name).
            let debateCriteriaBreakdown = null;
            let penaltyTotal = 0;
            if (isDebate) {
                const criteriaTotals = {};
                const criteriaCounts = {};
                Object.values(roundDetails).forEach(list => {
                    list.forEach(d => {
                        Object.entries(d.criteriaScores || {}).forEach(([key, val]) => {
                            if (val === '' || val === null || val === undefined) return;
                            criteriaTotals[key] = (criteriaTotals[key] || 0) + Number(val);
                            criteriaCounts[key] = (criteriaCounts[key] || 0) + 1;
                        });
                    });
                });
                debateCriteriaBreakdown = Object.keys(criteriaTotals).map(key => ({
                    name: key,
                    average: Math.round((criteriaTotals[key] / criteriaCounts[key]) * 10) / 10
                }));
                penaltyTotal = penaltyByParticipant[pId] || 0;
                totalVal -= penaltyTotal;
            }

            return {
                id: pId,
                name,
                participantData: p,
                faculty,
                course,
                group,
                club,
                status,
                gender: p.gender || 'Erkak',
                participationType: competition.type === 'team' ? 'Jamoaviy' : 'Yakkalik',
                roundScores,
                roundDetails,
                debateCriteriaBreakdown,
                penaltyTotal,
                totalScore: Math.round(totalVal * 10) / 10
            };
        });

        // Sort by totalScore desc initially
        rows.sort((a, b) => b.totalScore - a.totalScore);

        // Assign ranks (handling ties)
        let currentRank = 1;
        for (let i = 0; i < rows.length; i++) {
            if (i > 0 && rows[i].totalScore < rows[i - 1].totalScore) {
                currentRank = i + 1;
            }
            rows[i].rank = currentRank;
        }

        return rows;
    }, [competition, scoresData, roundsCount, isDebate, debatePenalties]);

    // Apply filters and search
    const filteredRows = useMemo(() => {
        let result = [...leaderboardRows];

        // Search query filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(r =>
                r.name.toLowerCase().includes(q) ||
                r.faculty.toLowerCase().includes(q) ||
                r.group.toLowerCase().includes(q)
            );
        }

        // Advanced filter keys
        if (filters.faculty) result = result.filter(r => r.faculty === filters.faculty);
        if (filters.course) result = result.filter(r => r.course === filters.course);
        if (filters.group) result = result.filter(r => r.group === filters.group);
        if (filters.club) result = result.filter(r => r.club === filters.club);
        if (filters.status) result = result.filter(r => r.status === filters.status);
        if (filters.participationType) result = result.filter(r => r.participationType === filters.participationType);

        // UniQuiz per-faculty advancement — a participant eliminated at an earlier Tur boundary simply
        // has no row for a LATER selected Tur; their earlier-Tur rows are untouched (eligibleParticipantIds
        // is null there, since it's scoped to selectedTurIndex above).
        if (eligibleParticipantIds) result = result.filter(r => eligibleParticipantIds.has(r.id));

        // Sort rows dynamically
        if (sortConfig.key) {
            result.sort((a, b) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];

                if (sortConfig.key.startsWith('round_')) {
                    const rNum = parseInt(sortConfig.key.split('_')[1]);
                    aVal = a.roundScores[rNum] ?? -999;
                    bVal = b.roundScores[rNum] ?? -999;
                }

                if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                if (typeof bVal === 'string') bVal = bVal.toLowerCase();

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [leaderboardRows, searchQuery, filters, sortConfig, eligibleParticipantIds]);

    // Summary statistics cards values
    const statistics = useMemo(() => {
        const total = filteredRows.length;
        if (total === 0) return { highest: 0, lowest: 0, average: 0, completedRounds: 0, activeJudges: 0, leader: '—' };

        const scores = filteredRows.map(r => r.totalScore);
        const highest = Math.max(...scores);
        const lowest = Math.min(...scores);
        const sum = scores.reduce((a, b) => a + b, 0);
        const average = Math.round((sum / total) * 10) / 10;

        // Calculate completed rounds / questions
        let maxCompleted = 0;
        filteredRows.forEach(r => {
            let compCount = 0;
            Object.values(r.roundScores).forEach(score => {
                if (score !== null) compCount++;
            });
            if (compCount > maxCompleted) maxCompleted = compCount;
        });

        // Find leader
        const leaderObj = filteredRows.find(r => r.rank === 1);
        const leader = leaderObj ? `${leaderObj.name} (${leaderObj.totalScore})` : '—';

        // Unique judges list count
        const uniqueJudges = new Set();
        scoresData.forEach(s => {
            if (s.judge) uniqueJudges.add(s.judge);
        });

        return {
            total,
            highest,
            lowest,
            average,
            completedRounds: maxCompleted,
            activeJudges: uniqueJudges.size || 2,
            leader
        };
    }, [filteredRows, scoresData]);

    // Export to CSV helper
    const handleExportCSV = () => {
        if (!competition) return;
        const headers = ['O\'rin', 'Ishtirokchi', 'Fakultet', 'Kurs', 'Guruh', 'Klub', 'Jami ball'];

        for (let i = 1; i <= roundsCount; i++) {
            headers.push(resolveRoundLabel(i));
        }

        const rows = filteredRows.map(r => {
            const dataRow = [r.rank, r.name, r.faculty, r.course, r.group, r.club, r.totalScore];
            for (let i = 1; i <= roundsCount; i++) {
                dataRow.push(r.roundScores[i] === null ? '—' : r.roundScores[i]);
            }
            return dataRow.map(v => `"${v}"`).join(',');
        });

        const csvContent = '\ufeff' + [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${competition.name}_results_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
    };

    // Print Results view helper
    const handlePrint = () => {
        window.print();
    };

    // Real certificate issuance — db.issueCertificate previously had zero callers anywhere in the
    // codebase; this is the first real one. `userId` is whatever id the drawer participant record
    // carries (a mock student's `student_N` id, or a team's own id for team competitions) — same
    // participant identity the rest of this results table already uses, no new identity resolution.
    // Known, disclosed limitation: mock participant ids generally don't match real login usernames, so
    // the issued record may not surface on that identity's own certificates page in this demo dataset —
    // it is still a genuine, persisted record, not a fabricated/decorative one.
    const [issuedCertificate, setIssuedCertificate] = useState(null);
    const handleIssueCertificate = () => {
        if (!drawerParticipant || !competition) return;
        const cert = db.issueCertificate({
            userId: drawerParticipant.id,
            title: `${competition.name} — ${drawerParticipant.rank ? drawerParticipant.rank + '-o\'rin' : 'ishtirokchi'}`,
            clubName: competition.name,
            role: competition.type === 'team' ? "Jamoa a'zosi" : 'Ishtirokchi',
            placement: drawerParticipant.rank || null
        });
        setIssuedCertificate(cert);
    };

    // Nominations (TSUL Court: Best Advocate/Best Memorial/Best Process Performance, but usable for any
    // competition) — a manual, holistic admin judgment, not a derived formula. Thin wrapper over the
    // same db.issueCertificate path (via db.issueNomination), so it's a genuine persisted record too.
    const [nominationCategory, setNominationCategory] = useState(NOMINATION_CATEGORIES[0]);
    const handleIssueNomination = () => {
        if (!drawerParticipant || !competition) return;
        const cert = db.issueNomination(competition.id, drawerParticipant.id, nominationCategory, userRole);
        setIssuedCertificate(cert);
    };

    // Real Excel export — additive alongside the existing CSV export (not a replacement), reusing the
    // exact same filteredRows/roundsCount data the CSV export already builds from.
    const handleExportExcel = () => {
        if (!competition) return;
        const exportRows = filteredRows.map(r => {
            const row = {
                "O'rin": r.rank, 'Ishtirokchi': r.name, 'Fakultet': r.faculty,
                'Kurs': r.course, 'Guruh': r.group, 'Klub': r.club, 'Jami ball': r.totalScore
            };
            for (let i = 1; i <= roundsCount; i++) {
                row[resolveRoundLabel(i)] = r.roundScores[i] === null ? '—' : r.roundScores[i];
            }
            return row;
        });
        exportRowsToExcel(exportRows, {
            sheetName: 'Natijalar',
            fileName: `${competition.name.replace(/\s+/g, '_')}_natijalar.xlsx`
        });
    };

    // Cell score background classes
    const getCellColorClass = (val) => {
        if (val === null) return darkMode ? 'bg-slate-800/40 text-slate-500' : 'bg-gray-50 text-gray-300';
        if (competition?.scoringMethod === 'correct_answer') {
            return val > 0 
                ? (darkMode ? 'bg-emerald-950/40 text-emerald-400' : 'bg-emerald-50 text-emerald-700')
                : (darkMode ? 'bg-red-950/30 text-red-400' : 'bg-red-50 text-red-600');
        }
        
        // General numeric color mapping
        const maxLimit = competition?.pointsPerRound || 10;
        const pct = (val / maxLimit) * 100;
        if (pct >= 90) return darkMode ? 'bg-emerald-950/50 text-emerald-400 font-bold' : 'bg-emerald-50 text-emerald-700 font-bold';
        if (pct >= 70) return darkMode ? 'bg-blue-950/40 text-blue-400 font-semibold' : 'bg-blue-50 text-blue-700 font-semibold';
        if (pct >= 50) return darkMode ? 'bg-amber-950/40 text-amber-400' : 'bg-amber-50 text-amber-600';
        return darkMode ? 'bg-red-950/30 text-red-400' : 'bg-red-50 text-red-600';
    };

    // Sorting trigger
    const triggerSort = (key) => {
        setSortConfig(prev => {
            if (prev.key === key) {
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'desc' };
        });
    };

    // Column options
    const toggleColumnVisibility = (col) => {
        setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
    };

    // Density setting styles
    const densityClasses = {
        compact: 'py-1 px-2 text-xs',
        medium: 'py-2.5 px-4 text-sm',
        relaxed: 'py-4 px-6 text-base'
    };

    // Cumulative left offsets for the sticky columns (rank / participant / total score),
    // so whichever of the three are visible stay pinned together in the correct order.
    const stickyOffsets = useMemo(() => {
        let offset = 0;
        const offsets = {};
        if (visibleColumns.rank) { offsets.rank = offset; offset += 64; }
        if (visibleColumns.participant) { offsets.participant = offset; offset += 224; } // w-56 = 14rem = 224px
        if (visibleColumns.totalScore) { offsets.totalScore = offset; }
        return offsets;
    }, [visibleColumns.rank, visibleColumns.participant, visibleColumns.totalScore]);

    // Which sticky column is currently the last one visible — gets the "edge shadow" divider
    const lastStickyColumn = visibleColumns.totalScore ? 'totalScore' : (visibleColumns.participant ? 'participant' : (visibleColumns.rank ? 'rank' : null));
    const stickyEdgeShadow = 'shadow-[2px_0_6px_rgba(0,0,0,0.06)]';

    // Flat list of scrollable round/question columns to render — a round column, followed by its
    // 12 question sub-columns when expanded. Purely additive to the existing round-count layout;
    // does not affect the sticky rank/participant/totalScore columns rendered before it.
    const columnLayout = useMemo(() => {
        // debate: no question/round cells at all — a single expandable "final breakdown" column
        // (per-row expansion, real criterion averages + penalties, see leaderboardRows above).
        if (isDebate) {
            return [{ type: 'debateBreakdown' }];
        }
        const cols = [];
        roundGroups.forEach(rg => {
            // A group is expandable when it genuinely bundles more than one raw round — correct_answer's
            // Raund-groups always do (ROUND_GROUP_SIZE savol each); quiz_mixed groups only do when a real
            // per-Raund savol split exists (25-savol's own raundBoundaries, see roundGroups above) —
            // UniQuiz-shaped groups (1 raw round each) have nothing further to expand into.
            const isExpandable = isQuestionBased || (isQuizMixed && rg.rounds.length > 1);
            const isExpanded = isExpandable && expandedRounds.has(rg.group);
            if (isExpanded) {
                // Real question columns, inserted BEFORE their parent Raund column (opens to its LEFT,
                // per direct request) — one per raw round in the group (each raw round already IS one
                // real, individually-stored question result — see leaderboardRows above). No
                // generated/derived values. questionNumber is local-to-Tur (resets only at a new Tur,
                // matches Natija kiritish's localSavolLabel exactly) when staged, else local-to-group.
                rg.rounds.forEach((rawRound, idx) => {
                    const questionNumber = hasStages ? (rawRound - rg.turRangeStart + 1) : (idx + 1);
                    cols.push({ type: 'question', group: rg.group, round: rawRound, questionNumber });
                });
            }
            cols.push({ type: 'roundGroup', group: rg.group, rounds: rg.rounds });
        });
        return cols;
    }, [roundGroups, expandedRounds, isQuestionBased, isQuizMixed, isDebate, hasStages]);

    // Paginated subset
    const paginatedSubset = useMemo(() => {
        const startIdx = (currentPage - 1) * pageSize;
        return filteredRows.slice(startIdx, startIdx + pageSize);
    }, [filteredRows, currentPage, pageSize]);

    const totalPages = Math.ceil(filteredRows.length / pageSize);

    // Advanced drop-down lists options
    const filterOptions = useMemo(() => {
        const uniqueFaculties = new Set();
        const uniqueGroups = new Set();
        const uniqueClubs = new Set();
        leaderboardRows.forEach(r => {
            if (r.faculty) uniqueFaculties.add(r.faculty);
            if (r.group) uniqueGroups.add(r.group);
            if (r.club) uniqueClubs.add(r.club);
        });
        return {
            faculties: [...uniqueFaculties].sort(),
            groups: [...uniqueGroups].sort(),
            clubs: [...uniqueClubs].sort(),
        };
    }, [leaderboardRows]);

    // "Natijalarni yashirish" — hides real results from participants/teams while scores are being
    // actively corrected; anyone with score-entry access (canBypassResultsHidden) still sees everything,
    // same as Natija kiritish itself always does.
    if (resultsHidden && !canBypassResultsHidden) {
        return (
            <div className={`flex flex-col h-full items-center justify-center text-center gap-3 p-12 ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${darkMode ? 'bg-indigo-950/40' : 'bg-indigo-50'}`}>
                    <Lock size={22} className="text-indigo-500" />
                </div>
                <p className="font-bold">Natijalarga o'zgartirish kiritilmoqda</p>
                <p className={`text-sm max-w-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tanlov natijalari hozircha yopiq. Tez orada yangilangan natijalar bilan qaytadan ochiladi.</p>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className={`flex flex-col h-full font-sans transition-colors duration-300 ${darkMode ? 'bg-slate-950 text-slate-100 dark-theme' : 'bg-slate-50 text-slate-800'}`}
        >
            {/* Header Block (title/role badge/methodology subtitle/Status/Hakamlik-Refresh-Fullscreen-Live-
                ekran-Dark-mode buttons) moved up into CompetitionPassportHero.jsx — visible on every tab
                now, not just here. `statistics`/`toggleFullscreen`/etc. locals this component still owns
                remain in place, still used elsewhere below.
                Left: Tur selector — same pill UI as Natija kiritish (falls back to the old plain "Joriy
                bosqich" line for non-staged/non-correct_answer competitions, unchanged). Right: Tugallanish
                progressi + Yetakchi jamoa/talaba, grouped together at the edge. */}
            <div className={`p-6 border-b ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'} shadow-sm`}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                    {hasStages ? (
                        <div className="flex items-center gap-2 flex-wrap">
                            <h4 className={`text-xs font-bold shrink-0 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>Tur tanlash:</h4>
                            <div className="flex gap-1.5 flex-wrap">
                                {stages.map((stage, idx) => (
                                    <button
                                        key={stage.label}
                                        type="button"
                                        onClick={() => setSelectedTurIndex(idx + 1)}
                                        className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-all border ${
                                            selectedTurIndex === idx + 1
                                                ? 'bg-indigo-700 border-indigo-700 text-white'
                                                : darkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                        }`}
                                    >
                                        {stage.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Joriy bosqich</p>
                            <p className="text-sm font-bold mt-0.5">{resolveRoundLabel(competition?.currentRound || 1)}</p>
                        </div>
                    )}
                    <div className="flex items-center gap-6 flex-wrap">
                        <div>
                            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Tugallanish progressi</p>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="w-24 bg-gray-200 rounded-full h-2 overflow-hidden">
                                    <div
                                        className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                                        style={{ width: `${Math.round(((competition?.currentRound || 1) / roundsCount) * 100)}%` }}
                                    />
                                </div>
                                <span className="text-xs font-bold">{Math.round(((competition?.currentRound || 1) / roundsCount) * 100)}%</span>
                            </div>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Yetakchi jamoa/talaba</p>
                            <p className="text-sm font-black text-amber-500 truncate max-w-[180px]" title={statistics.leader}>
                                🏆 {statistics.leader.split(' (')[0]}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Table Toolbar */}
            <div className={`mx-6 p-5 rounded-t-2xl border-t border-x ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'} flex flex-wrap gap-4 items-center justify-between`}>
                {/* Left controls */}
                <div className="flex flex-wrap gap-3 items-center flex-1">
                    <div className="relative w-full md:w-72">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Qidirish (Ism, fakultet, guruh)..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={`w-full pl-9 pr-4 py-2 border rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all ${
                                darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-gray-50 border-slate-200'
                            }`}
                        />
                    </div>

                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                            showFilters
                                ? 'bg-indigo-600 text-white border-transparent'
                                : (darkMode ? 'border-slate-800 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-gray-600 hover:bg-gray-50')
                        }`}
                    >
                        <SlidersHorizontal size={14} />
                        Filterlar
                    </button>
                </div>

                {/* Divider between search/filter cluster and view-control cluster */}
                <div className={`hidden lg:block w-px self-stretch ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`} />

                {/* Right controls */}
                <div className="flex flex-wrap gap-2.5 items-center">
                    {/* Unified Settings Dropdown (column visibility + density) */}
                    <div className="relative">
                        <button
                            onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
                            className={`flex items-center gap-1.5 px-3.5 py-2.5 border rounded-xl text-xs font-semibold transition-all ${
                                showSettingsDropdown
                                    ? 'bg-indigo-600 text-white border-transparent'
                                    : (darkMode ? 'border-slate-800 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-gray-600 hover:bg-gray-50')
                            }`}
                        >
                            <Settings size={14} />
                            Sozlamalar
                            <ChevronDown size={12} />
                        </button>
                        {showSettingsDropdown && (
                            <div className={`absolute right-0 mt-2 w-56 rounded-xl shadow-xl border p-2 z-50 space-y-3 ${
                                darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100'
                            }`}>
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1 mb-1 flex items-center gap-1.5">
                                        <LayoutGrid size={11} /> Ustunlar
                                    </p>
                                    {Object.keys(visibleColumns).map(col => (
                                        <label key={col} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-indigo-50/20 cursor-pointer text-xs">
                                            <input
                                                type="checkbox"
                                                checked={visibleColumns[col]}
                                                onChange={() => toggleColumnVisibility(col)}
                                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="capitalize">{col === 'totalScore' ? 'Jami Ball' : col === 'participant' ? 'Ishtirokchi' : col}</span>
                                        </label>
                                    ))}
                                </div>
                                <div className={`pt-2 border-t ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-1 mb-1">Zichlik</p>
                                    {['compact', 'medium', 'relaxed'].map(d => (
                                        <button
                                            key={d}
                                            onClick={() => setDensity(d)}
                                            className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium capitalize hover:bg-indigo-50/20 flex items-center justify-between ${density === d ? 'text-indigo-600 font-bold' : ''}`}
                                        >
                                            {d}
                                            {density === d && <Check size={12} />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* CSV / Excel / PDF export (Only Admin/Moderator) — CSV untouched, Excel/PDF additive */}
                    {(userRole === 'ADMINISTRATOR' || userRole === 'MODERATOR') && (
                        <>
                            <button
                                onClick={handleExportCSV}
                                className={`flex items-center gap-1.5 px-3.5 py-2.5 border border-emerald-600/30 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-all`}
                            >
                                <Download size={14} />
                                CSV
                            </button>
                            <button
                                onClick={handleExportExcel}
                                className={`flex items-center gap-1.5 px-3.5 py-2.5 border border-emerald-600/30 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-all`}
                            >
                                <Download size={14} />
                                Excel
                            </button>
                            <ScoreCardExport contentRef={containerRef} fileName={`${competition.name}_natijalar`} />
                        </>
                    )}

                    {/* Print */}
                    <button
                        onClick={handlePrint}
                        className={`flex items-center gap-1.5 px-3.5 py-2.5 border rounded-xl text-xs font-semibold ${
                            darkMode ? 'border-slate-800 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-gray-600 hover:bg-gray-50'
                        }`}
                        title="Chop etish"
                    >
                        <Printer size={14} />
                        Chop Etish
                    </button>
                </div>
            </div>

            {/* Advanced Filters Block */}
            {showFilters && (
                <div className={`mx-6 p-5 border-x ${darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-gray-50 border-slate-100'} grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 transition-all`}>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Fakultet</label>
                        <select
                            value={filters.faculty}
                            onChange={(e) => setFilters(prev => ({ ...prev, faculty: e.target.value }))}
                            className={`w-full px-3 py-2 border rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                                darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200'
                            }`}
                        >
                            <option value="">Barchasi</option>
                            {filterOptions.faculties.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Guruh</label>
                        <select
                            value={filters.group}
                            onChange={(e) => setFilters(prev => ({ ...prev, group: e.target.value }))}
                            className={`w-full px-3 py-2 border rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                                darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200'
                            }`}
                        >
                            <option value="">Barchasi</option>
                            {filterOptions.groups.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Klub</label>
                        <select
                            value={filters.club}
                            onChange={(e) => setFilters(prev => ({ ...prev, club: e.target.value }))}
                            className={`w-full px-3 py-2 border rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                                darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200'
                            }`}
                        >
                            <option value="">Barchasi</option>
                            {filterOptions.clubs.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Holati</label>
                        <select
                            value={filters.status}
                            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                            className={`w-full px-3 py-2 border rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none ${
                                darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200'
                            }`}
                        >
                            <option value="">Barchasi</option>
                            <option value="Aktiv">Aktiv</option>
                            <option value="Nofaol">Nofaol</option>
                        </select>
                    </div>
                    <div className="col-span-1 sm:col-span-2 lg:col-span-4 flex justify-end">
                        <button
                            onClick={() => {
                                setFilters({ faculty: '', course: '', group: '', club: '', category: '', status: '', participationType: '' });
                                setSearchQuery('');
                            }}
                            className="text-xs text-red-500 hover:text-red-700 font-bold transition-all"
                        >
                            Filtrlarni tozalash
                        </button>
                    </div>
                </div>
            )}

            {/* Results Grid Table */}
            <div className={`mx-6 border-x border-b overflow-hidden ${darkMode ? 'border-slate-800 bg-slate-900/40' : 'border-slate-100 bg-white'}`}>
                <div className="overflow-auto relative" style={{ maxHeight: '580px' }}>
                    <table className="w-full text-left border-collapse table-fixed min-w-full">
                        {/* Table Header */}
                        <thead>
                            <tr className={`border-b ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                                {/* Sticky columns header */}
                                {visibleColumns.rank && (
                                    <th
                                        onClick={() => triggerSort('rank')}
                                        className={`sticky top-0 z-30 cursor-pointer ${darkMode ? 'bg-slate-900' : 'bg-slate-50'} text-xs font-black uppercase tracking-wider w-16 text-center select-none py-3 border-r border-b border-slate-200/40 ${lastStickyColumn === 'rank' ? stickyEdgeShadow : ''}`}
                                        style={{ left: stickyOffsets.rank }}
                                    >
                                        <span className="flex items-center justify-center gap-1"># <ArrowUpDown size={10} /></span>
                                    </th>
                                )}

                                {visibleColumns.participant && (
                                    <th
                                        onClick={() => triggerSort('name')}
                                        className={`sticky top-0 z-30 cursor-pointer ${darkMode ? 'bg-slate-900' : 'bg-slate-50'} text-xs font-black uppercase tracking-wider w-56 text-left select-none px-4 py-3 border-r border-b border-slate-200/40 ${lastStickyColumn === 'participant' ? stickyEdgeShadow : ''}`}
                                        style={{ left: stickyOffsets.participant }}
                                    >
                                        <span className="flex items-center gap-1">Ishtirokchi <ArrowUpDown size={10} /></span>
                                    </th>
                                )}

                                {visibleColumns.totalScore && (
                                    <th
                                        onClick={() => triggerSort('totalScore')}
                                        className={`sticky top-0 z-30 cursor-pointer text-xs font-black uppercase tracking-wider w-28 text-center select-none py-3 border-r border-b border-slate-200/40 bg-amber-500/10 text-amber-600 ${lastStickyColumn === 'totalScore' ? stickyEdgeShadow : ''}`}
                                        style={{ left: stickyOffsets.totalScore }}
                                    >
                                        <span className="flex items-center justify-center gap-1">Jami Ball <ArrowUpDown size={10} /></span>
                                    </th>
                                )}

                                {/* Scrollable metadata columns — sticky vertically (top-0) only, still scroll horizontally */}
                                {visibleColumns.faculty && (
                                    <th className={`sticky top-0 z-30 ${darkMode ? 'bg-slate-900' : 'bg-slate-50'} text-xs font-black uppercase tracking-wider w-44 px-4 py-3 border-r border-b border-slate-200/40`}>Fakultet</th>
                                )}
                                {visibleColumns.group && (
                                    <th className={`sticky top-0 z-30 ${darkMode ? 'bg-slate-900' : 'bg-slate-50'} text-xs font-black uppercase tracking-wider w-24 px-4 py-3 border-r border-b border-slate-200/40`}>Guruh</th>
                                )}
                                {visibleColumns.club && (
                                    <th className={`sticky top-0 z-30 ${darkMode ? 'bg-slate-900' : 'bg-slate-50'} text-xs font-black uppercase tracking-wider w-40 px-4 py-3 border-r border-b border-slate-200/40`}>Klub</th>
                                )}

                                {/* Dynamic round-group columns (+ one expanded detail column per open group) */}
                                {columnLayout.map((col) => {
                                    if (col.type === 'debateBreakdown') {
                                        return (
                                            <th
                                                key="debate-breakdown"
                                                className={`sticky top-0 z-30 text-xs font-bold uppercase tracking-wider w-64 text-left select-none px-4 py-3 border-r border-b border-slate-200/40 ${darkMode ? 'bg-slate-900' : 'bg-slate-50'}`}
                                            >
                                                Mezonlar bo'yicha tafsilot
                                            </th>
                                        );
                                    }

                                    if (col.type === 'roundGroup') {
                                        const isGroupExpandable = isQuestionBased || (isQuizMixed && col.rounds.length > 1);
                                        const isExpanded = isGroupExpandable && expandedRounds.has(col.group);
                                        // Compact "R{n}" — when staged, col.group is already local to the
                                        // SELECTED Tur (the Tur pill selector above filters roundGroups to just
                                        // that Tur, see roundGroups useMemo — now true for quiz_mixed too, not
                                        // just correct_answer), so no Tur prefix is needed here to disambiguate;
                                        // when not staged, the raw/global round number (only place left that
                                        // still needs disambiguating across the whole flat competition). A
                                        // quiz_mixed column bundling more than one raw savol (real Raund
                                        // grouping) always reads "R{n}" too, same as correct_answer — only a
                                        // genuinely flat, one-item column falls back to the leaf-specific prefix.
                                        const label = (isQuestionBased || (isQuizMixed && col.rounds.length > 1))
                                            ? `R${col.group}`
                                            : `${dynamicColShortPrefix}${hasStages ? col.group : col.rounds[0]}`;
                                        return (
                                            <th
                                                key={`rg-${col.group}`}
                                                onClick={isGroupExpandable ? undefined : () => triggerSort(`round_${col.rounds[0]}`)}
                                                className={`sticky top-0 z-30 text-xs font-bold uppercase tracking-wider w-20 text-center select-none py-3 border-r border-b border-slate-200/40 transition-colors ${
                                                    isGroupExpandable ? '' : 'cursor-pointer hover:text-indigo-600'
                                                } ${isExpanded ? (darkMode ? 'bg-indigo-950/30' : 'bg-indigo-50/50') : (darkMode ? 'bg-slate-900' : 'bg-slate-50')}`}
                                            >
                                                <span className="flex items-center justify-center gap-1">
                                                    {label}
                                                    {!isGroupExpandable && <ArrowUpDown size={10} />}
                                                    {isGroupExpandable && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); toggleRoundExpand(col.group); }}
                                                            title={isExpanded ? "Tafsilotni yopish" : "Raund tafsilotini ko'rsatish"}
                                                            className={`ml-0.5 p-0.5 rounded transition-colors ${
                                                                isExpanded ? 'text-indigo-600' : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-gray-400 hover:text-gray-600')
                                                            }`}
                                                        >
                                                            ⤢
                                                        </button>
                                                    )}
                                                </span>
                                            </th>
                                        );
                                    }

                                    // Real question column — one per raw round in the expanded group, visually nested under its round
                                    return (
                                        <th
                                            key={`q-${col.round}`}
                                            className={`animate-fade-in sticky top-0 z-30 text-[10px] font-semibold uppercase tracking-wider w-14 text-center select-none py-3 border-r border-b border-l border-dashed ${
                                                darkMode ? 'border-slate-800 bg-slate-900/60 text-slate-500' : 'border-slate-200 bg-slate-50/60 text-gray-400'
                                            }`}
                                        >
                                            Savol {col.questionNumber}
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>

                        {/* Table Body */}
                        <tbody className="divide-y divide-slate-100/50">
                            {paginatedSubset.map((row) => {
                                // Subtle top-3 tint, layered under the existing hover state (hover still darkens further on top)
                                const topRankTint = row.rank === 1
                                    ? (darkMode ? 'bg-amber-500/5' : 'bg-amber-50/40')
                                    : row.rank === 2
                                        ? (darkMode ? 'bg-slate-500/10' : 'bg-slate-100/50')
                                        : row.rank === 3
                                            ? (darkMode ? 'bg-orange-500/5' : 'bg-orange-50/30')
                                            : (darkMode ? 'bg-slate-900/20' : 'bg-white');
                                const rowBgClass = darkMode
                                    ? `${topRankTint} hover:bg-slate-800/40`
                                    : `${topRankTint} hover:bg-slate-50/70`;

                                return (
                                    <tr 
                                        key={row.id} 
                                        onClick={() => setDrawerParticipant(row)}
                                        className={`transition-colors duration-150 cursor-pointer group ${rowBgClass}`}
                                    >
                                        {/* Sticky Rank cell */}
                                        {visibleColumns.rank && (
                                            <td
                                                className={`sticky z-25 text-center font-bold ${densityClasses[density]} border-r border-slate-200/40 ${
                                                    darkMode ? 'bg-slate-950' : 'bg-white'
                                                } group-hover:bg-slate-50 ${lastStickyColumn === 'rank' ? stickyEdgeShadow : ''}`}
                                                style={{ left: stickyOffsets.rank }}
                                            >
                                                {row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `#${row.rank}`}
                                            </td>
                                        )}

                                        {/* Sticky Name cell */}
                                        {visibleColumns.participant && (
                                            <td
                                                className={`sticky z-25 px-4 font-bold border-r border-slate-200/40 ${densityClasses[density]} ${
                                                    darkMode ? 'bg-slate-950' : 'bg-white'
                                                } group-hover:bg-slate-50 ${lastStickyColumn === 'participant' ? stickyEdgeShadow : ''}`}
                                                style={{ left: stickyOffsets.participant }}
                                            >
                                                <div className="flex items-center gap-2 truncate">
                                                    <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-400 flex items-center justify-center font-extrabold text-[10px] shrink-0">
                                                        {row.name.charAt(0)}
                                                    </div>
                                                    <span className="truncate">{row.name}</span>
                                                </div>
                                            </td>
                                        )}

                                        {/* Sticky Total Score cell */}
                                        {visibleColumns.totalScore && (
                                            <td
                                                className={`sticky z-25 text-center font-black text-amber-500 bg-amber-500/5 border-r border-slate-200/40 ${densityClasses[density]} ${lastStickyColumn === 'totalScore' ? stickyEdgeShadow : ''}`}
                                                style={{ left: stickyOffsets.totalScore }}
                                            >
                                                {row.totalScore}
                                            </td>
                                        )}

                                        {/* Metadata cells */}
                                        {visibleColumns.faculty && (
                                            <td className={`px-4 truncate border-r border-slate-200/40 ${densityClasses[density]} text-slate-500 text-xs`}>
                                                {row.faculty}
                                            </td>
                                        )}
                                        {visibleColumns.group && (
                                            <td className={`px-4 truncate border-r border-slate-200/40 ${densityClasses[density]} text-slate-500 text-xs`}>
                                                {row.group}
                                            </td>
                                        )}
                                        {visibleColumns.club && (
                                            <td className={`px-4 truncate border-r border-slate-200/40 ${densityClasses[density]} text-slate-500 text-xs`}>
                                                {row.club}
                                            </td>
                                        )}

                                        {/* Dynamic Round-Group Score cells (+ one real detail cell per expanded group) */}
                                        {columnLayout.map((col) => {
                                            if (col.type === 'debateBreakdown') {
                                                const isRowExpanded = expandedDebateRows.has(row.id);
                                                return (
                                                    <td
                                                        key={`debate-${row.id}`}
                                                        className={`px-4 align-top border-r border-slate-200/40 ${densityClasses[density]}`}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); toggleDebateRowExpand(row.id); }}
                                                            className={`flex items-center gap-1.5 text-xs font-bold ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}
                                                        >
                                                            {isRowExpanded ? "Yopish" : "Mezonlarni ko'rish"}
                                                            <span className={`transition-transform ${isRowExpanded ? 'rotate-90' : ''}`}>⤢</span>
                                                        </button>
                                                        {isRowExpanded && (
                                                            <div className="flex flex-wrap gap-1.5 mt-2 animate-fade-in">
                                                                {(row.debateCriteriaBreakdown || []).length === 0 && (
                                                                    <span className="text-[11px] text-gray-400">Hali baholanmagan</span>
                                                                )}
                                                                {(row.debateCriteriaBreakdown || []).map(c => (
                                                                    <span
                                                                        key={c.name}
                                                                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                                                                    >
                                                                        {c.name}: {c.average}
                                                                    </span>
                                                                ))}
                                                                {row.penaltyTotal > 0 && (
                                                                    <span className="px-2 py-1 rounded-lg text-[10px] font-bold border border-red-200 bg-red-50 text-red-600">
                                                                        Jarima: -{row.penaltyTotal}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            }

                                            if (col.type === 'roundGroup') {
                                                const isGroupExpandable = isQuestionBased || (isQuizMixed && col.rounds.length > 1);
                                                const isExpanded = isGroupExpandable && expandedRounds.has(col.group);

                                                if (isQuizMixed && col.rounds.length > 1) {
                                                    // Real Raund grouping (25-savol's own raundBoundaries) — sum this Raund's own
                                                    // savol points (row.roundScores, already computed via computeQuizMixedPoints in
                                                    // leaderboardRows above), same real values the expanded Savol sub-columns
                                                    // individually show. No hover breakdown here (it's a sum of several savol, not
                                                    // one) — same as correct_answer's own group-stat cell just below.
                                                    const sum = col.rounds.reduce((s, r) => s + (row.roundScores[r] || 0), 0);
                                                    const answeredCount = col.rounds.filter(r => {
                                                        const raw = row.roundDetails[r]?.[0]?.score;
                                                        return raw !== undefined && raw !== null;
                                                    }).length;
                                                    const toneClass = answeredCount === 0
                                                        ? (darkMode ? 'bg-slate-800/40 text-slate-500' : 'bg-gray-50 text-gray-300')
                                                        : sum > 0
                                                            ? (darkMode ? 'bg-emerald-950/40 text-emerald-400' : 'bg-emerald-50 text-emerald-700')
                                                            : sum < 0
                                                                ? (darkMode ? 'bg-red-950/30 text-red-400' : 'bg-red-50 text-red-600')
                                                                : (darkMode ? 'bg-slate-800/40 text-slate-400' : 'bg-gray-100 text-gray-500');
                                                    return (
                                                        <td
                                                            key={`rg-${row.id}-${col.group}`}
                                                            className={`text-center font-semibold border-r border-slate-200/40 ${densityClasses[density]} ${toneClass} ${isExpanded ? 'ring-1 ring-inset ring-indigo-500/20' : ''}`}
                                                        >
                                                            <span className="text-[11px]">{answeredCount === 0 ? '—' : sum}</span>
                                                        </td>
                                                    );
                                                }

                                                if (isQuizMixed) {
                                                    // quiz_mixed: show the REAL ball this round contributed (row.roundScores, already
                                                    // computed via computeQuizMixedPoints in leaderboardRows above) instead of a
                                                    // qualitative "To'g'ri/Noto'g'ri" label — tone still reflects sign for a quick scan.
                                                    const roundNum = col.rounds[0];
                                                    const raw = row.roundDetails[roundNum]?.[0]?.score;
                                                    const val = row.roundScores[roundNum];
                                                    const hasEntry = raw !== undefined && raw !== null;
                                                    const label = hasEntry && val !== null && val !== undefined ? val : '—';
                                                    const toneClass = !hasEntry
                                                        ? (darkMode ? 'bg-slate-800/40 text-slate-500' : 'bg-gray-50 text-gray-300')
                                                        : val > 0
                                                            ? (darkMode ? 'bg-emerald-950/40 text-emerald-400' : 'bg-emerald-50 text-emerald-700')
                                                            : val < 0
                                                                ? (darkMode ? 'bg-red-950/30 text-red-400' : 'bg-red-50 text-red-600')
                                                                : (darkMode ? 'bg-slate-800/40 text-slate-400' : 'bg-gray-100 text-gray-500');
                                                    return (
                                                        <td
                                                            key={`rg-${row.id}-${col.group}`}
                                                            className={`text-center font-semibold border-r border-slate-200/40 relative ${densityClasses[density]} ${toneClass}`}
                                                            onMouseEnter={(e) => {
                                                                const rect = e.target.getBoundingClientRect();
                                                                setHoveredCell({
                                                                    rowId: row.id,
                                                                    roundNum,
                                                                    label: resolveRoundLabel(roundNum),
                                                                    val: row.roundScores[roundNum],
                                                                    details: row.roundDetails[roundNum] || [],
                                                                    x: rect.left + window.scrollX,
                                                                    y: rect.top + window.scrollY - 120
                                                                });
                                                            }}
                                                            onMouseLeave={() => setHoveredCell(null)}
                                                        >
                                                            <span className="text-[11px]">{label}</span>
                                                        </td>
                                                    );
                                                }

                                                if (!isQuestionBased) {
                                                    // Non-quiz competitions: completely unchanged from before this fix
                                                    const roundNum = col.rounds[0];
                                                    const val = row.roundScores[roundNum];
                                                    const cellColor = getCellColorClass(val);
                                                    return (
                                                        <td
                                                            key={`rg-${row.id}-${col.group}`}
                                                            className={`text-center font-semibold border-r border-slate-200/40 relative ${densityClasses[density]} ${cellColor}`}
                                                            onMouseEnter={(e) => {
                                                                const rect = e.target.getBoundingClientRect();
                                                                setHoveredCell({
                                                                    rowId: row.id,
                                                                    roundNum,
                                                                    label: resolveRoundLabel(roundNum),
                                                                    val,
                                                                    details: row.roundDetails[roundNum] || [],
                                                                    x: rect.left + window.scrollX,
                                                                    y: rect.top + window.scrollY - 120
                                                                });
                                                            }}
                                                            onMouseLeave={() => setHoveredCell(null)}
                                                        >
                                                            {val !== null ? val : '—'}
                                                        </td>
                                                    );
                                                }

                                                // Quiz round-group: real correct/total count from the already-computed roundScores
                                                const stats = getGroupStats(row, col.rounds);
                                                const pct = stats.answered > 0 ? (stats.correct / stats.answered) * 100 : null;
                                                const groupColor = pct === null
                                                    ? (darkMode ? 'bg-slate-800/40 text-slate-500' : 'bg-gray-50 text-gray-300')
                                                    : pct >= 90 ? (darkMode ? 'bg-emerald-950/50 text-emerald-400 font-bold' : 'bg-emerald-50 text-emerald-700 font-bold')
                                                    : pct >= 70 ? (darkMode ? 'bg-blue-950/40 text-blue-400 font-semibold' : 'bg-blue-50 text-blue-700 font-semibold')
                                                    : pct >= 50 ? (darkMode ? 'bg-amber-950/40 text-amber-400' : 'bg-amber-50 text-amber-600')
                                                    : (darkMode ? 'bg-red-950/30 text-red-400' : 'bg-red-50 text-red-600');
                                                return (
                                                    <td
                                                        key={`rg-${row.id}-${col.group}`}
                                                        className={`text-center font-semibold border-r border-slate-200/40 ${densityClasses[density]} ${groupColor} ${isExpanded ? 'ring-1 ring-inset ring-indigo-500/20' : ''}`}
                                                    >
                                                        {stats.answered > 0 ? stats.correct : '—'}
                                                    </td>
                                                );
                                            }

                                            // Real question cell — the raw round IS the real, individually-stored question
                                            // result (see leaderboardRows above); no generated/derived values. Icon-only,
                                            // no numeric value, no true/false, no cell background — just ✓ / − / —.
                                            const roundNum = col.round;
                                            const val = row.roundScores[roundNum];
                                            return (
                                                <td
                                                    key={`q-${row.id}-${roundNum}`}
                                                    className={`animate-fade-in text-center border-r border-l border-dashed ${densityClasses[density]}`}
                                                    onMouseEnter={(e) => {
                                                        const rect = e.target.getBoundingClientRect();
                                                        setHoveredCell({
                                                            rowId: row.id,
                                                            roundNum,
                                                            label: resolveRoundLabel(roundNum),
                                                            val,
                                                            details: row.roundDetails[roundNum] || [],
                                                            x: rect.left + window.scrollX,
                                                            y: rect.top + window.scrollY - 120
                                                        });
                                                    }}
                                                    onMouseLeave={() => setHoveredCell(null)}
                                                >
                                                    <span className="flex items-center justify-center">
                                                        {val === null ? (
                                                            <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>—</span>
                                                        ) : val > 0 ? (
                                                            <Check size={14} strokeWidth={3} className={darkMode ? 'text-emerald-400' : 'text-green-600'} />
                                                        ) : (
                                                            <Minus size={14} strokeWidth={3} className={darkMode ? 'text-red-400' : 'text-red-600'} />
                                                        )}
                                                    </span>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Table Tooltip */}
                {hoveredCell && hoveredCell.details.length > 0 && (
                    <div 
                        className={`fixed z-50 p-4 rounded-xl shadow-2xl border w-64 pointer-events-none text-xs ${
                            darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-gray-800'
                        }`}
                        style={{ left: `${hoveredCell.x}px`, top: `${hoveredCell.y}px` }}
                    >
                        <p className="font-bold border-b pb-1.5 mb-2">{hoveredCell.label} tafsilotlari</p>
                        <div className="space-y-2">
                            {hoveredCell.details.map((d, idx) => (
                                <div key={idx} className="flex flex-col gap-0.5">
                                    <div className="flex justify-between">
                                        <span className="font-semibold text-indigo-500">Hakam: {d.judge}</span>
                                        <span className="font-black text-gray-900 dark:text-white">
                                            {d.score === true ? "To'g'ri"
                                                : d.score === false ? "Noto'g'ri"
                                                : (d.score && typeof d.score === 'object') ? `${d.numericValue >= 0 ? '+' : ''}${d.numericValue}`
                                                : d.score}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-gray-400">Vaqt: {new Date(d.date).toLocaleTimeString()} ({d.device})</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Bottom Summary Row */}
                <div className={`p-4 border-t flex flex-wrap gap-4 text-xs font-bold items-center justify-between ${
                    darkMode ? 'bg-slate-900/60' : 'bg-slate-50'
                }`}>
                    <div className="flex flex-wrap gap-4">
                        <span>Ishtirokchilar: {filteredRows.length} ta</span>
                        <span className="text-emerald-600">Eng yuqori: {statistics.highest}</span>
                        <span className="text-red-500">Eng past: {statistics.lowest}</span>
                        <span className="text-indigo-600">O'rtacha: {statistics.average}</span>
                    </div>
                    <span className="text-gray-400">Gorizontal aylantirish uchun Shift + g'ildirakdan foydalaning</span>
                </div>
            </div>

            {/* Pagination / Lazy view Footer */}
            {totalPages > 1 && (
                <div className="px-6 py-4 flex items-center justify-between">
                    <p className="text-xs text-gray-400">
                        {filteredRows.length} ishtirokchidan { (currentPage - 1) * pageSize + 1 }-{ Math.min(currentPage * pageSize, filteredRows.length) } tasi ko'rsatilmoqda
                    </p>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg border disabled:opacity-40 transition-colors ${
                                darkMode ? 'border-slate-800 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            <ChevronLeft size={15} />
                        </button>
                        {getPageRange(currentPage, totalPages).map((p, i) => p === '...' ? (
                            <span key={`dots-${i}`} className={`w-8 h-8 flex items-center justify-center text-xs select-none ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>&hellip;</span>
                        ) : (
                            <button
                                key={p}
                                onClick={() => setCurrentPage(p)}
                                className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                                    p === currentPage
                                        ? 'border-2 border-indigo-500 text-indigo-500 bg-indigo-500/10'
                                        : darkMode ? 'border border-slate-800 text-slate-300 hover:bg-slate-800' : 'border border-slate-200 text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {p}
                            </button>
                        ))}
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg border disabled:opacity-40 transition-colors ${
                                darkMode ? 'border-slate-800 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            <ChevronRight size={15} />
                        </button>
                    </div>
                </div>
            )}

            {/* Participant Detailed Drawer */}
            {drawerParticipant && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    {/* Backdrop */}
                    <div 
                        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                        onClick={() => setDrawerParticipant(null)}
                    />
                    
                    {/* Drawer Content */}
                    <div className={`relative w-full max-w-lg h-full shadow-2xl flex flex-col z-10 transition-transform ${
                        darkMode ? 'bg-slate-900 border-l border-slate-800 text-slate-100' : 'bg-white text-gray-800'
                    }`}>
                        {/* Drawer Header */}
                        <div className="p-6 border-b flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-lg">
                                    {drawerParticipant.name.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-lg leading-tight">{drawerParticipant.name}</h3>
                                    <p className="text-xs text-gray-400">ID: {drawerParticipant.id}</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setDrawerParticipant(null)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Drawer Scrollable Area */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Profile details */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 bg-gray-50 dark:bg-slate-800/40 rounded-xl">
                                    <p className="text-[10px] text-gray-400 font-bold uppercase">Fakultet</p>
                                    <p className="text-sm font-semibold mt-0.5">{drawerParticipant.faculty}</p>
                                </div>
                                <div className="p-3 bg-gray-50 dark:bg-slate-800/40 rounded-xl">
                                    <p className="text-[10px] text-gray-400 font-bold uppercase">Guruh</p>
                                    <p className="text-sm font-semibold mt-0.5">{drawerParticipant.group}</p>
                                </div>
                                <div className="p-3 bg-gray-50 dark:bg-slate-800/40 rounded-xl">
                                    <p className="text-[10px] text-gray-400 font-bold uppercase">Kurs</p>
                                    <p className="text-sm font-semibold mt-0.5">{drawerParticipant.course}</p>
                                </div>
                                <div className="p-3 bg-gray-50 dark:bg-slate-800/40 rounded-xl">
                                    <p className="text-[10px] text-gray-400 font-bold uppercase">Klub</p>
                                    <p className="text-sm font-semibold mt-0.5">{drawerParticipant.club}</p>
                                </div>
                            </div>

                            {/* Performance metrics */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 border-t pt-4 border-slate-200/50">
                                <div className="p-3 rounded-xl bg-amber-500/5 text-center">
                                    <p className="text-2xl font-black text-amber-500">{drawerParticipant.totalScore}</p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Jami Ball</p>
                                </div>
                                <div className="p-3 rounded-xl bg-indigo-500/5 text-center">
                                    <p className="text-2xl font-black text-indigo-500">{drawerParticipant.rank}</p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">O'rin (Rank)</p>
                                </div>
                                <div className="p-3 rounded-xl bg-emerald-500/5 text-center">
                                    <p className="text-2xl font-black text-emerald-500">
                                        {Math.round((Object.values(drawerParticipant.roundScores).filter(v => v !== null).reduce((a, b) => a + b, 0) / roundsCount) * 10) / 10}
                                    </p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">O'rtacha Ball</p>
                                </div>
                            </div>

                            {competition?.type === 'team' && (
                                <TeamRosterAndHistory teamId={drawerParticipant.id} currentCompetitionId={competition.id} />
                            )}

                            {/* Round History list */}
                            <div className="space-y-3">
                                <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Clock size={14} className="text-indigo-600" />
                                    Raundlar tarixi tafsiloti
                                </h4>
                                <div className="divide-y border rounded-xl overflow-hidden">
                                    {Array.from({ length: roundsCount }, (_, i) => {
                                        const rNum = i + 1;
                                        const score = drawerParticipant.roundScores[rNum];
                                        return (
                                            <div key={i} className="p-3 flex items-center justify-between hover:bg-gray-50/50">
                                                <span className="font-semibold text-sm">{resolveRoundLabel(rNum)}</span>
                                                <span className={`px-3 py-1 rounded-lg text-sm font-bold ${
                                                    score === null ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-600'
                                                }`}>
                                                    {score !== null ? `${score} ball` : '—'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Certificates / Awards simulation */}
                            <div className="space-y-3">
                                <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Award size={14} className="text-indigo-600" />
                                    Mukofotlar va Sertifikatlar
                                </h4>
                                <button
                                    type="button"
                                    onClick={handleIssueCertificate}
                                    className="w-full p-4 rounded-xl border border-dashed border-gray-200 flex items-center gap-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors text-left"
                                >
                                    <div className="p-2.5 bg-yellow-100 text-yellow-700 rounded-lg shrink-0">
                                        <Trophy size={16} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-xs">Sertifikat yaratish</p>
                                        <p className="text-[10px] text-gray-400">
                                            {drawerParticipant.rank ? `${drawerParticipant.rank}-o'rin uchun sertifikat chiqarish` : 'Ishtirok sertifikatini chiqarish'}
                                        </p>
                                    </div>
                                </button>
                                {userRole === 'ADMINISTRATOR' && (
                                    <div className="flex gap-2">
                                        <select
                                            value={nominationCategory}
                                            onChange={e => setNominationCategory(e.target.value)}
                                            className="flex-1 px-3 py-2 border rounded-xl text-xs"
                                        >
                                            {NOMINATION_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={handleIssueNomination}
                                            className="px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors shrink-0"
                                        >
                                            Nominatsiya berish
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Drawer Footer */}
                        <div className="p-4 border-t bg-gray-50 dark:bg-slate-900/60 flex gap-3">
                            <button 
                                onClick={() => setDrawerParticipant(null)}
                                className="w-full py-2.5 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 rounded-xl text-sm font-bold hover:brightness-95 transition-all"
                            >
                                Yopish
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {issuedCertificate && (
                <Modal isOpen={true} onClose={() => setIssuedCertificate(null)} title="Sertifikat" size="lg">
                    <CertificateGenerator
                        studentName={drawerParticipant?.name}
                        clubName={issuedCertificate.clubName}
                        role={issuedCertificate.role}
                        placement={issuedCertificate.placement}
                        issueDate={issuedCertificate.issueDate}
                        certificateId={issuedCertificate.id}
                        displayNumber={issuedCertificate.displayNumber}
                    />
                </Modal>
            )}
        </div>
    );
};

export default CompetitionResultsCenter;
