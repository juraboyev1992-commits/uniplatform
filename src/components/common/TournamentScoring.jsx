import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Trophy, Users, User, Shield, Clock, Plus, Search, Check, Play, Pause, RotateCcw, 
    ArrowLeft, ArrowRight, Save, History, Award, BookOpen, Layers, Edit, Trash2, 
    Keyboard, HelpCircle, UserCheck, AlertTriangle, Download, Maximize2, Minimize2,
    RefreshCw, Filter, ChevronUp, ChevronDown, Minus, Calendar, LayoutDashboard,
    Share2, Compass, GitMerge, FileBarChart2, BarChart3, CheckCircle, AlertCircle, Zap,
    SlidersHorizontal, ArrowUpDown, LayoutGrid, List, Lock, ClipboardCheck, Gavel, PieChart
} from 'lucide-react';
import Card from './Card';
import Button from './Button';
import Badge from './Badge';
import Modal from './Modal';
import ProgressBar from './ProgressBar';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import CompetitionResultsCenter from './CompetitionResultsCenter';
import CompetitionOverviewTab from './CompetitionOverviewTab';
import CompetitionParticipantsTab from './CompetitionParticipantsTab';
import QuizMixedScoringInput from './QuizMixedScoringInput';
import DebateChiefJudgePenaltyPanel, { DebateCriteriaInputs } from './DebateScoringInput';
import TournamentCreateWizard from './TournamentCreateWizard';
import CompetitionsListView from './CompetitionsListView';
import CopyableId from './CopyableId';
import CompetitionPassportHero from './CompetitionPassportHero';
import CompetitionSettingsPanel from './CompetitionSettingsPanel';
import AutosaveStatusBar from './AutosaveStatusBar';
import LiveLeaderboardSidebar from './LiveLeaderboardSidebar';
import CompetitionRatingTab from './CompetitionRatingTab';
import CompetitionAppealsTab from './CompetitionAppealsTab';
import QuizScoringGrid from './QuizScoringGrid';
import QuizMixedScoringGrid from './QuizMixedScoringGrid';
import CompetitionTurSchedule from './CompetitionTurSchedule';
import CompetitionMatchesTab from './CompetitionMatchesTab';
import DebateMatchesTab from './DebateMatchesTab';
import MatchScoringTab from './MatchScoringTab';
import MatchResultsTab from './MatchResultsTab';
import ActivityFinalizationTab from './ActivityFinalizationTab';
import ActivityTasksPanel from './ActivityTasksPanel';
import ActivityReportPanel from './ActivityReportPanel';
import ActivityPointsPanel from './ActivityPointsPanel';
import DebateMatchSchedule from './DebateMatchSchedule';
import CriteriaRoundAttendanceTab from './CriteriaRoundAttendanceTab';
import ActivityRegistrationPanel from '../activities/ActivityRegistrationPanel';
import ParticipantStatsPanel from './ParticipantStatsPanel';
// ⚠️ VAQTINCHALIK — real ro'yxatdan o'tish ishlagach shu import va uning ishlatilgan joyi o'chiriladi.
import TestTeamsQuickAdd from './TestTeamsQuickAdd';
import { hasDelegatedPermission } from '../../utils/competitionPermissions';
import { QUIZ_MIXED_ROUND_TYPES, getTieBreakLabel, getDisplayStages, getDisplayStageLeafLabel, getEffectivePointsTable } from '../../config/competitionEngines';
import { useTheme } from '../../contexts/ThemeContext';

const SCORING_METHOD_LABELS = {
    correct_answer: "To'g'ri javob",
    single_score: 'Yagona ball',
    criteria_based: 'Mezon asosida',
    winner_selection: "G'olibni tanlash",
    quiz_mixed: 'Aralash test',
    debate: 'Bahs-munozara'
};

const SETTINGS_SECTION_TITLES = {
    general: 'Musobaqa sozlamalari',
    judges: 'Hakamlar',
    delegation: 'Vakolatlar',
    rounds: 'Turlarni boshqarish'
};

const TournamentScoring = ({ 
    contextType = null, 
    contextId = null, 
    competitionId = null,
    title = "Musobaqalar va Natijalar" 
}) => {
    const { user, hasClubRole } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    // Opening/creating a competition from the bare-routed workspace (CompetitionWorkspacePage.jsx,
    // mounted at /admin/competitions with no :id) used to only flip local React state (setActiveComp) —
    // the URL never changed, so there was never a real, shareable, deep-linkable per-competition URL to
    // copy from the address bar (confirmed live: a student pasting a URL "copied from the admin's address
    // bar" just got the bare list URL and bounced to their dashboard). Keeping the URL in sync with
    // `activeComp` fixes that — but ONLY for that bare-routed usage. When embedded with a contextType
    // (ClubsModule.jsx mounts this with contextType="club" directly inside a club tab, no wrapping page/
    // route of its own), navigating would yank the user out to the standalone /competitions/:id page and
    // lose the club tab entirely with no way back — so embedded usage keeps the old state-only behavior.
    //
    // Bu yerda `replace` EMAS, oddiy o'tish ishlatiladi. Ilgari `{ replace: true }`
    // edi va u ro'yxatning tarix yozuvini O'CHIRIB yuborardi: ro'yxatdan musobaqa
    // ochilganda manzil almashardi, lekin brauzer uchun bu "ro'yxatga kirish"ning
    // o'rniga yozilardi. Natijada ish maydonida orqaga bosilganda ro'yxatga emas,
    // ro'yxatdan OLDINGI joyga - boshqa bo'limga yoki bosh sahifaga - qaytilardi.
    //
    // Musobaqani ochish - foydalanuvchining haqiqiy harakati, shuning uchun u
    // tarixda o'z yozuviga ega bo'lishi kerak.
    const syncUrlToActiveComp = (comp) => {
        if (!comp || contextType) return;
        const prefix = location.pathname.startsWith('/student/') ? '/student' : '/admin';
        const target = `${prefix}/competitions/${comp.id}`;
        // Allaqachon shu manzilda bo'lsak (havola orqali to'g'ridan-to'g'ri
        // kirilgan holat) takroriy yozuv qo'shilmaydi - aks holda orqaga bosish
        // bir marta "hech narsa qilmagandek" ko'rinardi.
        if (location.pathname === target) return;
        navigate(target);
    };

    // Determine detailed role and permissions
    const getUserRole = () => {
        if (!user) return 'PUBLIC';
        if (user.role === 'ADMINISTRATOR') return 'ADMINISTRATOR';
        if (user.role === 'MODERATOR') return 'MODERATOR';
        if (user.role === 'COORDINATOR' || (contextType === 'club' && hasClubRole(contextId, ['head_coordinator', 'coordinator']))) return 'COORDINATOR';
        if (user.role === 'JUDGE' || user.username === 'talaba') return 'JUDGE';
        return 'PUBLIC';
    };

    const role = getUserRole();

    // Delegation grants a CAPABILITY, not a role — getUserRole()'s ADMINISTRATOR/MODERATOR/COORDINATOR/
    // JUDGE/PUBLIC derivation above is never touched by it. Both checks below only gain an additive
    // OR-term; a delegated user's `role` still reads exactly as it did before.
    const hasScoringAccess = () => {
        return ['ADMINISTRATOR', 'MODERATOR', 'COORDINATOR', 'JUDGE'].includes(role)
            || hasDelegatedPermission(user, activeComp, 'result_entry')
            || hasDelegatedPermission(user, activeComp, 'live_scoring');
    };

    const hasFullAdminAccess = () => {
        return role === 'ADMINISTRATOR';
    };

    // Attendance is its own delegatable capability, separate from scoring access — an attendance-only
    // delegate (no result_entry/live_scoring) still needs to reach the Davomat tab/toggles even though
    // they'd never see "Natija kiritish".
    const canManageAttendance = () => {
        return ['ADMINISTRATOR', 'MODERATOR', 'COORDINATOR', 'JUDGE'].includes(role)
            || hasDelegatedPermission(user, activeComp, 'attendance');
    };

    // "Guruh bosqichlari" (CompetitionAdvancementPanel.jsx) — delegatable so this doesn't all fall on
    // admin. Unlike hasScoringAccess/canManageAttendance, NOT auto-granted to MODERATOR/COORDINATOR/JUDGE
    // by role alone — it's admin-only until explicitly delegated per competition, since it includes the
    // irreversible "Finalga chiqarish" action.
    const canManageGroups = () => {
        return hasFullAdminAccess() || hasDelegatedPermission(user, activeComp, 'manage_groups');
    };

    // MUSOBAQANING O'Z KLUBI koordinatorimi.
    //
    // `getUserRole()` dagi COORDINATOR tekshiruvidan FARQ QILADI: u sahifa
    // qaysi yo'ldan ochilganiga (`contextType`/`contextId`) tayanadi, va u
    // faqat klub sahifasidan kirilganda to'ldiriladi. Musobaqa havolasi
    // orqali to'g'ridan-to'g'ri kirilganda bo'sh bo'ladi va koordinator
    // o'z musobaqasida ham begonaday ko'rinardi.
    //
    // Bu yerda klub MUSOBAQANING O'ZIDAN olinadi, shuning uchun kirish
    // yo'lidan qat'i nazar bir xil ishlaydi.
    const isOwningClubCoordinator = () =>
        activeComp?.contextType === 'club'
        && !!activeComp.contextId
        && hasClubRole(activeComp.contextId, ['head_coordinator', 'coordinator']);

    // TURLAR JADVALI - har Turning sanasi, vaqti va mas'ul hakami.
    //
    // Bu BAHOLASH emas, TASHKILIY ish: musobaqani o'tkazayotgan odam uni
    // o'zi belgilashi kerak. Ilgari faqat administratorga ochiq edi, ya'ni
    // koordinator o'z musobaqasining jadvalini tuza olmasdi va har
    // o'zgarish uchun adminni kutardi.
    //
    // Munozara/sud jadvali allaqachon `manage_teams` delegatsiyasiga ochiq
    // edi - endi ikkalasi bir xil qoidada.
    const canManageSchedule = () =>
        hasFullAdminAccess()
        || isOwningClubCoordinator()
        || hasDelegatedPermission(user, activeComp, 'manage_teams');

    // State management
    const [competitions, setCompetitions] = useState([]);
    const [activeComp, setActiveComp] = useState(null);
    const [isConfiguring, setIsConfiguring] = useState(false);
    const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'participants' | 'scoring' | 'results' | 'brackets' | 'schedule' | 'judges' | 'analytics' | 'settings'
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Real app-wide theme (used by the hero's dark/light toggle, ported from CompetitionResultsCenter.jsx
    // — same shared hook, same synced state, not a disconnected local copy).
    const { isDark: darkMode, toggleTheme } = useTheme();

    // Fullscreen toggle — ported up from CompetitionResultsCenter.jsx's own header (button moved into the
    // hero, so its scope is now the whole workspace, not just the Natijalar markazi panel).
    const workspaceRef = useRef(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const toggleFullscreen = () => {
        if (!isFullscreen) {
            workspaceRef.current?.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    };
    useEffect(() => {
        const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Competition selection list — catalog/list toggle + filters (independent of Live Scoring's
    // own `searchQuery`, which filters participants inside an already-open workspace).
    const [compListSearch, setCompListSearch] = useState('');
    const [compListView, setCompListView] = useState('grid'); // 'grid' (katalog) | 'list' (ro'yxat)
    const [compTypeFilter, setCompTypeFilter] = useState('');
    const [compMethodFilter, setCompMethodFilter] = useState('');

    // Real-time synchronization key for Results Center & Analytics
    const [scoresVersion, setScoresVersion] = useState(0);

    // Live Scoring state
    const [currentRound, setCurrentRound] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFacultyFilter, setSelectedFacultyFilter] = useState('all');
    const [selectedSingleRaund, setSelectedSingleRaund] = useState(null); // null = "Hammasi" (all raunds)
    const [selectedRaundIdx, setSelectedRaundIdx] = useState(1); // 1-based, into selectedStage.raundBoundaries
    const [activeJudge, setActiveJudge] = useState(user?.username || 'admin');
    const [device, setDevice] = useState('Hakam Plansheti');
    const [localScores, setLocalScores] = useState({});
    const [localCriteriaScores, setLocalCriteriaScores] = useState({});

    // Autosave (replaces the old manual "Natijalarni Saqlash" button — see handleSaveScores/flush below)
    const [autosaveStatus, setAutosaveStatus] = useState('idle'); // 'idle' | 'pending' | 'saved'
    const [lastAutosaveAt, setLastAutosaveAt] = useState(null);
    const autosaveTimeoutRef = useRef(null);
    const hasPendingEditsRef = useRef(false);
    const justLoadedRef = useRef(false);

    // Timer
    const [timerSeconds, setTimerSeconds] = useState(0);
    const [timerActive, setTimerActive] = useState(false);
    const timerIntervalRef = useRef(null);

    // Audit logs
    const [auditLogs, setAuditLogs] = useState([]);

    // Competition Passport hero card's consolidated "Sozlamalar" menu — which single section's modal is
    // open (null | 'general' | 'judges' | 'delegation' | 'rounds'), picked from CompetitionSettingsMenu.
    const [settingsSection, setSettingsSection] = useState(null);
    // Hero's "Jamoa qo'shish" modal — hosts the shared ActivityRegistrationPanel.
    const [isAddTeamOpen, setIsAddTeamOpen] = useState(false);

    // Load competitions on mount or ID change
    useEffect(() => {
        loadCompetitions();
    }, [contextType, contextId, competitionId]);

    const loadCompetitions = () => {
        setLoading(true);
        setError(null);
        try {
            const list = db.getCompetitions();
            let filtered = list;

            if (competitionId) {
                filtered = list.filter(c => c.id === competitionId);
            } else if (contextType && contextId) {
                filtered = list.filter(c => c.filterContext === contextType && c.contextId === contextId);
            }
            
            setCompetitions(filtered);

            if (competitionId && filtered.length > 0) {
                setActiveComp(filtered[0]);
                setCurrentRound(filtered[0].currentRound || 1);
            } else if (!competitionId && !contextType && activeComp) {
                // Manzilda `:id` yo'q - bu RO'YXAT sahifasi, ochiq musobaqa yopiladi.
                //
                // Busiz shunday bo'lardi: `/competitions/:id` dan `/competitions` ga
                // qaytilganda React Router bir xil komponentni qayta yaratmaydi, ya'ni
                // `activeComp` holati saqlanib qolardi. Manzil ro'yxatniki bo'lsa ham
                // ekranda O'SHA boshqaruv paneli turaverardi - "orqaga bosdim, yana
                // o'sha oyna" degani. Ustiga esa "Turnirlar ro'yxati" tugmasi paydo
                // bo'lardi (u faqat `!competitionId` da chiqadi) va foydalanuvchi
                // ro'yxatga yetish uchun IKKINCHI marta bosishga majbur bo'lardi.
                //
                // Bu shart faqat marshrutli holatga tegishli: `contextType` bilan
                // ichkariga joylashtirilgan ko'rinishda (klub tabi) musobaqa
                // butunlay ichki holat orqali ochiladi va uni yopish kerak emas.
                setActiveComp(null);
            } else if (filtered.length > 0 && !activeComp) {
                // If only 1 competition found, make it active
                if (filtered.length === 1) {
                    setActiveComp(filtered[0]);
                    setCurrentRound(filtered[0].currentRound || 1);
                }
            }
        } catch (err) {
            console.error("Error loading competitions:", err);
            setError("Musobaqa ma'lumotlarini yuklashda xatolik yuz berdi.");
        } finally {
            setLoading(false);
        }
    };

    // Load active competition details & audit logs
    useEffect(() => {
        if (activeComp) {
            loadRoundScores();
            loadAuditLogs();
        }
    }, [activeComp, currentRound, activeJudge, scoresVersion]);

    // Timer effect
    useEffect(() => {
        if (timerActive) {
            timerIntervalRef.current = setInterval(() => {
                setTimerSeconds(s => s + 1);
            }, 1000);
        } else {
            clearInterval(timerIntervalRef.current);
        }
        return () => clearInterval(timerIntervalRef.current);
    }, [timerActive]);

    // Keyboard shortcuts for Live Scoring
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!activeComp || isConfiguring || activeTab !== 'scoring') return;

            // Save shortcut (Ctrl+S or Cmd+S)
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSaveScores();
                return;
            }

            // Navigation between rounds (Alt + ArrowRight / ArrowLeft)
            if (e.altKey && e.key === 'ArrowRight') {
                e.preventDefault();
                if (currentRound < activeComp.roundsCount) handleRoundChange(currentRound + 1);
            }
            if (e.altKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                if (currentRound > 1) handleRoundChange(currentRound - 1);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeComp, isConfiguring, activeTab, currentRound, localScores, localCriteriaScores, activeJudge]);

    const loadRoundScores = () => {
        if (!activeComp) return;
        const allScores = db.getCompetitionScores(activeComp.id);
        const roundScores = allScores.filter(s => s.round === currentRound && s.judge === activeJudge);
        
        const scoresMap = {};
        const criteriaScoresMap = {};
        
        activeComp.participants.forEach(p => {
            if (activeComp.scoringMethod === 'correct_answer') {
                // null = "Bekor" (not yet decided) — db.getLeaderboard already treats any value other
                // than the literal booleans true/false as 0-contribution/"not yet scored" (see its
                // correct_answer branch), so this is a pure UI-default fix, not a scoring-math change:
                // a cell nobody has touched yet no longer silently reads as "incorrect".
                scoresMap[p.id] = null;
            } else if (activeComp.scoringMethod === 'single_score') {
                scoresMap[p.id] = '';
            } else if (activeComp.scoringMethod === 'criteria_based') {
                scoresMap[p.id] = 0;
                criteriaScoresMap[p.id] = {};
                (activeComp.criteria || []).forEach(c => {
                    criteriaScoresMap[p.id][c.name] = '';
                });
            } else if (activeComp.scoringMethod === 'winner_selection') {
                scoresMap[p.id] = 'none';
            } else if (activeComp.scoringMethod === 'quiz_mixed') {
                scoresMap[p.id] = null; // shape depends on the current round's rule type
            } else if (activeComp.scoringMethod === 'debate') {
                scoresMap[p.id] = 0;
                criteriaScoresMap[p.id] = {};
                (activeComp.criteria || []).forEach(c => {
                    criteriaScoresMap[p.id][c.name] = '';
                });
            }
        });

        roundScores.forEach(s => {
            scoresMap[s.participantId] = s.value;
            if (s.criteriaScores) {
                criteriaScoresMap[s.participantId] = s.criteriaScores;
            }
        });

        setLocalScores(scoresMap);
        setLocalCriteriaScores(criteriaScoresMap);
        // Marks the very next localScores/localCriteriaScores change (the one this call itself just
        // triggered) as "freshly loaded from db", not a real user edit — so the autosave effect below
        // doesn't immediately reschedule a pointless save right after switching round/judge.
        justLoadedRef.current = true;
    };

    const loadAuditLogs = () => {
        if (!activeComp) return;
        const logs = db.getAuditLogs(activeComp.id);
        setAuditLogs(logs);
    };

    // Competition creation now happens entirely inside TournamentCreateWizard.jsx (4-step wizard),
    // which ports this exact construction logic itself — see that file's buildCompetitionPayload().

    // Persists whatever is currently in localScores/localCriteriaScores for the active round+judge —
    // db.saveRoundScores itself (and its audit-log-on-diff behavior) is completely unchanged, this is
    // still the exact same call the old manual "Natijalarni Saqlash" button made. What's REMOVED is that
    // button's extra side effect of force-advancing activeComp.currentRound + an alert() on every save:
    // now that saves happen continuously (autosave, ~1s after each edit) rather than as one deliberate
    // "I'm done with this round" click, auto-advancing on every save would bump the round after the very
    // first cell a judge touches. Moving to the next round is now an explicit action — the existing
    // round-selector pills (unchanged) or the Raundlar tab's "Faollashtirish" (Phase 5) — not an implicit
    // side effect of saving.
    // Async now (real Supabase write), but every call site already fired this without awaiting (autosave
    // timeout / unmount cleanup / flushPendingSave) — kept that way deliberately, so this stays a plain
    // fire-and-forget trigger from the caller's perspective, nothing else needed to change.
    const handleSaveScores = async () => {
        if (!activeComp) return;

        const scoresToSave = Object.keys(localScores).map(pId => ({
            participantId: pId,
            value: localScores[pId],
            criteriaScores: localCriteriaScores[pId] || {}
        }));

        await db.saveRoundScores(activeComp.id, currentRound, activeJudge, scoresToSave, device);

        setScoresVersion(v => v + 1);
        setLastAutosaveAt(new Date().toISOString());
        loadRoundScores();
        loadAuditLogs();
    };

    // Flushes any pending debounced save immediately and synchronously, using THIS render's closure
    // (fresh localScores/currentRound/activeJudge) — called from synchronous event handlers only
    // (round/judge switch), never from a delayed effect cleanup, so there's no stale-closure risk.
    const flushPendingSave = () => {
        if (!hasPendingEditsRef.current) return;
        if (autosaveTimeoutRef.current) {
            clearTimeout(autosaveTimeoutRef.current);
            autosaveTimeoutRef.current = null;
        }
        handleSaveScores();
        hasPendingEditsRef.current = false;
        setAutosaveStatus('saved');
    };

    // Debounced autosave — ~1s after the last edit to localScores/localCriteriaScores. Skips the one
    // change cycle immediately following loadRoundScores() (see justLoadedRef), so switching round/judge
    // doesn't itself trigger a pointless "save" of data that was just loaded unchanged.
    useEffect(() => {
        if (!activeComp || activeTab !== 'scoring') return;
        if (justLoadedRef.current) {
            justLoadedRef.current = false;
            return;
        }
        hasPendingEditsRef.current = true;
        setAutosaveStatus('pending');
        autosaveTimeoutRef.current = setTimeout(() => {
            handleSaveScores();
            hasPendingEditsRef.current = false;
            setAutosaveStatus('saved');
        }, 1000);
        return () => clearTimeout(autosaveTimeoutRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localScores, localCriteriaScores]);

    // Flush-on-unmount, via a "latest ref" updated every render (avoids the stale-closure trap an
    // unmount-only effect would otherwise have, since its cleanup closure is fixed at mount time).
    const handleSaveScoresRef = useRef(handleSaveScores);
    handleSaveScoresRef.current = handleSaveScores;
    useEffect(() => {
        return () => {
            if (hasPendingEditsRef.current) handleSaveScoresRef.current();
        };
    }, []);

    const handleRoundChange = (roundNum) => {
        flushPendingSave();
        setCurrentRound(roundNum);
    };

    const handleDeleteCompetition = async (id) => {
        if (window.confirm("Haqiqatan ham bu musobaqani o'chirmoqchimisiz? Barcha natijalar o'chib ketadi!")) {
            setSettingsSection(null);
            await db.deleteCompetition(id);
            setActiveComp(null);
            loadCompetitions();
        }
    };

    // "Turnirni yakunlash" — reuses the exact same completion convention already read everywhere else
    // (AdminDashboard.jsx / CompetitionsManagementTab.jsx / CompetitionWorkspacePage.jsx / this file's own
    // round-pill coloring): currentRound > roundsCount. No new status field, so every existing list/badge
    // that already derives "Yakunlangan" from this picks it up automatically.
    const handleFinishTournament = async () => {
        if (!activeComp) return;
        if (!window.confirm("Turnirni yakunlangan deb belgilamoqchimisiz?")) return;
        await db.updateCompetition(activeComp.id, { currentRound: (activeComp.roundsCount || 1) + 1 });
        setActiveComp(db.getCompetitionById(activeComp.id));
    };

    const setSingleScore = (pId, val) => {
        const numVal = val === '' ? '' : Number(val);
        setLocalScores(prev => ({
            ...prev,
            [pId]: numVal
        }));
    };

    const setCriteriaScore = (pId, critName, val) => {
        const numVal = val === '' ? '' : Number(val);
        setLocalCriteriaScores(prev => {
            const updatedParticipant = {
                ...(prev[pId] || {}),
                [critName]: numVal
            };
            
            const sum = Object.values(updatedParticipant).reduce((acc, v) => acc + (Number(v) || 0), 0);
            
            setLocalScores(scoresPrev => ({
                ...scoresPrev,
                [pId]: sum
            }));

            return {
                ...prev,
                [pId]: updatedParticipant
            };
        });
    };

    const setWinnerSelection = (pId, status) => {
        setLocalScores(prev => ({
            ...prev,
            [pId]: status
        }));
    };

    // quiz_mixed: the value shape (boolean / placement rank / {risk,correct} / {plus,correct,blank})
    // depends on the current round's rule type — QuizMixedScoringInput builds the right shape and this
    // just replaces it wholesale, exactly like toggleCorrectAnswer/setSingleScore/setWinnerSelection do.
    const setQuizMixedValue = (pId, val) => {
        setLocalScores(prev => ({
            ...prev,
            [pId]: val
        }));
    };

    const formatTime = (totalSeconds) => {
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    // No pagination in the scoring tab — all participants render in one scroll (see the table wrapper's
    // max-height + overflow-y-auto below) rather than paged 25-at-a-time. Pagination.jsx itself is
    // untouched and still used elsewhere in the app.

    // quiz_mixed: which rule type governs the currently-selected round (falls back to 'standard' if
    // roundRules is missing/short, though every quiz_mixed competition is preset-created with a full list).
    const currentQuizRuleType = activeComp?.roundRules?.[currentRound - 1] || 'standard';

    // Zakovat round model: quiz-type (correct_answer) competitions group their raw rounds (= questions)
    // into rounds of `questionsPerRound` (configured at creation time — see the Raund Konfiguratsiyasi
    // section of the creation form below; falls back to 12 for competitions created before that field
    // existed, so existing data keeps behaving exactly as before). `selectedRoundGroup` is derived from
    // `currentRound`, never separate state, so it can't desync — clicking a question button (unchanged
    // handleRoundChange) always keeps it in sync.
    const QUESTIONS_PER_ROUND_GROUP = activeComp?.questionsPerRound || 12;
    const isQuizScoring = activeComp?.scoringMethod === 'correct_answer';

    // Canonical terms used throughout Natija kiritish: Tur = stage/phase, Raund = a group of questions,
    // Savol = one individual question. Tur support now covers BOTH quiz_mixed presets with real stage
    // boundaries (25-savol, UniQuiz) AND correct_answer (Zakovat) League/Cup competitions, whose wizard-time
    // leagueTours/cupRounds structure is preserved as real `stages` (see TournamentCreateWizard.jsx). A
    // Zakovat league genuinely has Tur -> Raund -> Savol (e.g. 10-12 Tur/season, each with 1-2+ Raund of
    // 12+ Savol) — the Raund-group math below (unchanged formulas) now simply operates WITHIN the selected
    // Tur's range instead of across the whole competition. Any competition without `stages` (older data,
    // or one created outside League/Cup) falls back to the exact flat/no-Tur behavior it already had.
    // Display-only fallback for correct_answer (Zakovat) competitions that don't have real `stages` yet
    // (older data, or anything created before the League/Cup wizard started computing Tur boundaries) —
    // groups the existing flat Raund-groups into up to 12 Tur, so the Tur/Raund selector still shows up
    // instead of silently falling back to one long flat Raund list. Purely computed at render time from
    // roundsCount/questionsPerRound, never written to the competition record, never read by scoring math
    // — a real `stages` array from the wizard (if present) always takes priority over this fallback.
    // getDisplayStages (competitionEngines.js) is the single shared source of truth for Tur boundaries —
    // CompetitionResultsCenter.jsx uses the exact same function, so both always agree on the same Tur
    // grouping for the same competition.
    const stages = useMemo(() => getDisplayStages(activeComp), [activeComp]);
    const hasStages = !!(stages && stages.length > 0);
    const selectedStage = hasStages
        ? (stages.find(s => currentRound >= s.roundRange[0] && currentRound <= s.roundRange[1]) || stages[0])
        : null;
    // 'raund': the stage's items are themselves called Raund — UniQuiz (no further per-Raund Savol split
    // in the data model) and correct_answer League/Cup (WHICH DOES have a further Savol split, via the
    // Raund-group math below — correct_answer always shows that level regardless of this flag). 'savol'
    // (default): the stage's items are individual questions, flat, no Raund level (25-savol, TDYU Quiz
    // played as League/Cup).
    const stageLeafLabel = hasStages ? getDisplayStageLeafLabel(activeComp) : null;
    // Any quiz_mixed competition with real Tur stages (UniQuiz's raund-leaf shape, 25-savol's savol-leaf
    // shape, or a free-structure competition) gets the same spreadsheet-grid convenience QuizScoringGrid
    // already gives Zakovat, via QuizMixedScoringGrid (participants x column-per-item of the selected Tur,
    // each cell the existing QuizMixedScoringInput widget — already handles every QUIZ_MIXED_ROUND_TYPES
    // rule, standard/placement/vabank/risk_optional/fixed_bonus alike, so 25-savol's own risk_optional/
    // fixed_bonus rounds score correctly too) instead of the old one-item-at-a-time table. Was previously
    // restricted to stageLeafLabel==='raund' only (UniQuiz) — that excluded 25-savol for no real reason
    // (the grid never assumed a raund-leaf shape, it just renders `questionButtons` as columns either
    // way), which is what made 25-savol's own "Turlarni boshqarish"/Natija kiritish feel out of sync with
    // the real per-Tur boundaries the rest of the app (Guruh bosqichlari panel, CompetitionRoundsTab) had
    // already started respecting. Scoring itself (computeQuizMixedPoints/roundRules) is untouched — only
    // which entry layout a competition routes through changes.
    const isQuizMixedStaged = activeComp?.scoringMethod === 'quiz_mixed' && hasStages;

    // UniQuiz per-faculty ("guruh") advancement — a judge-side Fakultet filter (pure convenience, never
    // hides anything) plus the REAL eligibility filter (which participants may still be scored once an
    // earlier Tur boundary's advancement has been frozen in CompetitionRoundsTab.jsx's advancement
    // panel). `null` eligibleParticipantIds always means "show everyone" — every competition without a
    // frozen boundary for the PRECEDING stage (i.e. every non-UniQuiz competition, and UniQuiz's own
    // Tur1) is completely unaffected.
    useEffect(() => { setSelectedFacultyFilter('all'); }, [activeComp?.id]);
    const facultyGroups = useMemo(() => (activeComp ? db.getScoringGroups(activeComp.id) : []), [activeComp?.id, scoresVersion]);
    const participantGroupMap = useMemo(() => (activeComp ? db.getParticipantGroupMap(activeComp.id) : new Map()), [activeComp?.id, scoresVersion]);
    const currentStageIndex1Based = hasStages ? stages.findIndex(s => s === selectedStage) + 1 : 1;
    const eligibleParticipantIds = useMemo(
        () => (activeComp && hasStages ? db.getEligibleParticipantIdsForStage(activeComp.id, currentStageIndex1Based) : null),
        [activeComp?.id, currentStageIndex1Based, scoresVersion]
    );

    // Gates NATIJA KIRITISH ONLY (never Reyting/Tanlov natijalari) for a UniQuiz Tur beyond the first —
    // two independent scenarios, per explicit user confirmation:
    // (A) this competition genuinely uses per-faculty advancement (facultyGroups.length > 0) — until the
    //     PRECEDING boundary is frozen ("Finalga chiqarish" in Turlarni boshqarish), who's even IN this
    //     Tur isn't decided yet, so scoring is fully blocked with an explanatory message (not just an
    //     empty/filtered grid, which would look like "nobody scored yet" rather than "not decided yet").
    // (B) no advancement groups configured at all (participants just carry over automatically, no
    //     elimination) — gated by the EXISTING "Jadval" tab's real per-Tur schedule instead
    //     (db.getTurSchedule) — blocked only if that Tur has a real scheduled start time that hasn't
    //     arrived yet; no schedule set at all falls through to today's fully-open default, unchanged.
    const scoringGateStatus = useMemo(() => {
        if (!activeComp || !isQuizMixedStaged || currentStageIndex1Based <= 1) return { blocked: false };
        if (facultyGroups.length > 0) {
            const freeze = db.getAdvancementFreeze(activeComp.id, currentStageIndex1Based - 1);
            return freeze ? { blocked: false } : { blocked: true, reason: 'advancement' };
        }
        const schedule = db.getTurSchedule(activeComp.id).find(s => s.turIndex === currentStageIndex1Based);
        if (schedule?.date) {
            const startDateTime = new Date(db.combineDateTime(schedule.date, schedule.startTime));
            if (startDateTime > new Date()) return { blocked: true, reason: 'schedule', startDateTime };
        }
        return { blocked: false };
    }, [activeComp, isQuizMixedStaged, currentStageIndex1Based, facultyGroups, scoresVersion]);

    const filteredParticipants = activeComp
        ? activeComp.participants.filter(p => {
            const name = activeComp.type === 'team' ? p.name : p.fullName;
            const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesFaculty = selectedFacultyFilter === 'all' || participantGroupMap.get(p.id) === selectedFacultyFilter;
            const isEligible = !eligibleParticipantIds || eligibleParticipantIds.has(p.id);
            return matchesSearch && matchesFaculty && isEligible;
        })
        : [];

    // Range the Raund-group/Savol math below operates within: the selected Tur if one exists, else the
    // whole competition (identical to the original formulas when hasStages is false — see verification).
    const groupRangeStart = hasStages ? selectedStage.roundRange[0] : 1;
    const groupRangeEnd = hasStages ? selectedStage.roundRange[1] : (activeComp?.roundsCount || 1);

    const roundGroupCount = activeComp ? Math.ceil((groupRangeEnd - groupRangeStart + 1) / QUESTIONS_PER_ROUND_GROUP) : 1;
    const selectedRoundGroup = Math.max(1, Math.ceil((currentRound - groupRangeStart + 1) / QUESTIONS_PER_ROUND_GROUP));
    const questionButtons = !activeComp
        ? []
        : isQuizScoring
            ? Array.from(
                { length: Math.min(QUESTIONS_PER_ROUND_GROUP, groupRangeEnd - (groupRangeStart + (selectedRoundGroup - 1) * QUESTIONS_PER_ROUND_GROUP) + 1) },
                (_, i) => groupRangeStart + (selectedRoundGroup - 1) * QUESTIONS_PER_ROUND_GROUP + i
              )
            : hasStages
                ? Array.from(
                    { length: selectedStage.roundRange[1] - selectedStage.roundRange[0] + 1 },
                    (_, i) => selectedStage.roundRange[0] + i
                  )
                : Array.from({ length: activeComp.roundsCount }, (_, i) => i + 1);

    // UniQuiz Natija kiritish convenience: below the Tur pills, a Raund selector narrows the grid down
    // to just ONE raund column ("Hammasi" shows every raund of the Tur, unchanged default). Resets to
    // "Hammasi" whenever the selected Tur changes, so a judge never lands on a stale single-raund view
    // after switching Tur. `questionButtons` is already exactly the selected Tur's own raund range.
    useEffect(() => { setSelectedSingleRaund(null); }, [currentStageIndex1Based]);

    // Real per-Tur Raund groups (Bosqichli "Tur tuzilmasi" builder: each Tur its own N Raund, each Raund
    // its own individually-set savol count — see compileStructureToRoundRules's raundBoundaries) — savol
    // numbering stays sequential WITHIN the Tur (1-Raund savol 1-5, 2-Raund savol 6-10, ...), never resets
    // mid-Tur; only the RAUND number itself resets per Tur (1-Raund, 2-Raund... starting over in each new
    // Tur, since Raundlar are independent per Tur). Absent (25-savol/UniQuiz's fixed single-level presets,
    // or a Tur with only one Raund) falls through to the existing single-raw-item narrowing below.
    const raundBoundaries = (isQuizMixedStaged && selectedStage?.raundBoundaries?.length > 1) ? selectedStage.raundBoundaries : null;
    useEffect(() => { setSelectedRaundIdx(1); }, [currentStageIndex1Based]);
    const displayedRoundNumbers = raundBoundaries
        ? Array.from(
            { length: raundBoundaries[selectedRaundIdx - 1].roundRange[1] - raundBoundaries[selectedRaundIdx - 1].roundRange[0] + 1 },
            (_, i) => raundBoundaries[selectedRaundIdx - 1].roundRange[0] + i
          )
        : (isQuizMixedStaged && selectedSingleRaund != null) ? [selectedSingleRaund] : questionButtons;

    // Top-badge / status-line label for the currently selected item. correct_answer and quiz_mixed
    // competitions operate on individual questions (Savol) unless the preset explicitly says its stage's
    // leaf unit is a Raund (UniQuiz); every other scoring method (debate/criteria_based/single_score/
    // winner_selection/match_play) already operates one whole round at a time, so it stays "Raund".
    const currentItemLabel = activeComp?.scoringMethod === 'correct_answer'
        ? 'Savol'
        : activeComp?.scoringMethod === 'quiz_mixed'
            ? (stageLeafLabel === 'raund' ? 'Raund' : 'Savol')
            : 'Raund';

    // "Turni qulflash" state — lock reuses the existing competitionRounds overlay (same `locked` field
    // CompetitionRoundsTab's cards would show). correct_answer keys it by the GLOBAL Raund-group index
    // (one lock covers `questionsPerRound` Savol at once); UniQuiz (quiz_mixed staged) has no such
    // grouping — CompetitionRoundsTab already gives it one record PER RAW ROUND (see that file's
    // `!isQuizScoring` card branch) — so "lock the Tur" there means locking every raw round in the
    // selected Tur's own range (`questionButtons`, already computed as exactly that range below) at
    // once; "is the Tur locked" is true only once ALL of them are.
    const roundGroupIndex = isQuizScoring ? Math.ceil((questionButtons[0] || 1) / QUESTIONS_PER_ROUND_GROUP) : null;
    const isRoundLocked = useMemo(() => {
        if (!activeComp) return false;
        if (isQuizScoring) return !!db.getCompetitionRounds(activeComp.id).find(r => r.index === roundGroupIndex)?.locked;
        if (isQuizMixedStaged && questionButtons.length > 0) {
            const overlay = db.getCompetitionRounds(activeComp.id);
            return questionButtons.every(r => !!overlay.find(o => o.index === r)?.locked);
        }
        return false;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeComp, isQuizScoring, isQuizMixedStaged, roundGroupIndex, questionButtons, scoresVersion]);
    const handleToggleRoundLock = async () => {
        if (!activeComp) return;
        if (isQuizScoring) {
            await db.upsertCompetitionRound(activeComp.id, roundGroupIndex, { locked: !isRoundLocked });
        } else if (isQuizMixedStaged) {
            const nextLocked = !isRoundLocked;
            for (const r of questionButtons) {
                await db.upsertCompetitionRound(activeComp.id, r, { locked: nextLocked });
            }
        }
        setScoresVersion(v => v + 1);
    };
    // "Natijalarni yashirish" hides results from PARTICIPANTS/teams (Reyting tab, Natijalar markazi, the
    // public live screen) while whoever has score-entry access keeps seeing real numbers everywhere,
    // including Natija kiritish itself — never masked there. Persisted on the competition record (not
    // local UI state) since it has to affect other views/tabs, not just this one judge's browser.
    const resultsHidden = !!activeComp?.resultsHidden;
    const handleToggleResultsHidden = async () => {
        if (!activeComp) return;
        await db.updateCompetition(activeComp.id, { resultsHidden: !resultsHidden });
        setActiveComp(db.getCompetitionById(activeComp.id));
    };

    const leaderboardData = useMemo(
        () => (activeComp ? db.getLeaderboard(activeComp.id) : []),
        [activeComp, scoresVersion, auditLogs]
    );

    // Compute dynamic scores for Results Center component
    const scoresData = useMemo(
        () => (activeComp ? db.getCompetitionScores(activeComp.id) : []),
        [activeComp, scoresVersion]
    );

    // debate: Chief Judge penalty ledger for Results Center's final-score breakdown
    const debatePenaltiesData = useMemo(
        () => (activeComp && activeComp.scoringMethod === 'debate' ? db.getDebatePenalties(activeComp.id) : []),
        [activeComp, scoresVersion]
    );

    // Competition Passport hero card's derived display values. Small local status classification,
    // matching the same convention already used in AdminDashboard.jsx / CompetitionsManagementTab.jsx /
    // CompetitionWorkspacePage.jsx (per-file duplication rather than a shared module).
    const heroProps = useMemo(() => {
        if (!activeComp) return null;
        const isCompleted = (activeComp.currentRound || 1) > (activeComp.roundsCount || 1);
        const startDateTime = activeComp.startDate ? db.combineDateTime(activeComp.startDate, activeComp.startTime) : null;
        const status = isCompleted ? 'closed' : (startDateTime && new Date(startDateTime) > new Date()) ? 'upcoming' : 'ongoing';
        return {
            status,
            ownerDisplayName: activeComp.ownerUsername || "Noma'lum",
            dateLabel: startDateTime
                ? new Date(startDateTime).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Belgilanmagan',
            participantCount: (activeComp.participants || []).length,
            // match_play/debate_match never set a real roundsCount (their structure is a post-creation
            // admin action, see TournamentStructureStep.jsx's isMatchBased notice) — showing it as "Jami
            // raundlar" here would just be whatever the wizard's now-hidden dead field happened to hold.
            // Real match count (db.getCompetitionMatches/db.getDebateMatches) instead.
            questionsLabel: activeComp.scoringMethod === 'correct_answer'
                ? 'Jami savollar'
                : ['debate_match', 'court_match'].includes(activeComp.scoringMethod) ? 'Jami uchrashuvlar'
                : activeComp.scoringMethod === 'match_play' ? 'Jami o\'yinlar'
                : 'Jami raundlar',
            questionsCount: ['debate_match', 'court_match'].includes(activeComp.scoringMethod) ? db.getDebateMatches(activeComp.id).length
                : activeComp.scoringMethod === 'match_play' ? db.getCompetitionMatches(activeComp.id).length
                : (activeComp.roundsCount || 0),
            tieBreakLabel: getTieBreakLabel(activeComp)
        };
    }, [activeComp]);

    // Hero's live stat tiles (highest/lowest/average/active judges/progress/leader score) — moved up
    // from CompetitionResultsCenter.jsx's own summary-card row per direct request, so they're visible on
    // every tab, not just Natijalar markazi. Same real formulas that row used (ported, not re-derived),
    // ONE unfabricated fix: activeJudges/roundsCount no longer fall back to a fake "2"/"5" when unset —
    // they just show the real (possibly zero) count. Uses the whole-competition leaderboardData, not any
    // tab-local search/filter, since this is a competition-wide summary.
    const heroStats = useMemo(() => {
        if (!activeComp || leaderboardData.length === 0) return null;
        const scores = leaderboardData.map(r => r.totalScore);
        const highest = Math.max(...scores);
        const lowest = Math.min(...scores);
        const average = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
        let maxCompleted = 0;
        leaderboardData.forEach(r => {
            const compCount = Object.values(r.roundScores || {}).filter(v => v !== null).length;
            if (compCount > maxCompleted) maxCompleted = compCount;
        });
        const roundsCount = activeComp.roundsCount || 0;
        const uniqueJudges = new Set(scoresData.filter(s => s.judge).map(s => s.judge));
        const leaderScore = leaderboardData.find(r => r.rank === 1)?.totalScore || 0;
        return {
            highest, lowest, average,
            progressLabel: `${maxCompleted} / ${roundsCount}`,
            progressPercent: roundsCount > 0 ? Math.round((maxCompleted / roundsCount) * 100) : 0,
            activeJudges: uniqueJudges.size,
            leaderScore
        };
    }, [activeComp, leaderboardData, scoresData]);

    // Competition selection list — real distinct scoringMethod values present in `competitions`,
    // so the filter pills never show an engine type that has zero competitions using it.
    const methodsPresent = useMemo(
        () => [...new Set(competitions.map(c => c.scoringMethod))],
        [competitions]
    );
    // Musobaqani uyushtirgan klub nomi bo'yicha ham qidirish mumkin bo'lsin -
    // klub ID emas, nomini yozadi foydalanuvchi.
    const clubNameById = useMemo(() => new Map(db.getClubs().map(c => [c.id, c.name])), [competitions]);
    const filteredCompetitions = useMemo(() => {
        const q = compListSearch.trim().toLowerCase();
        return competitions.filter(c => {
            const clubName = c.contextType === 'club' ? (clubNameById.get(c.contextId) || '') : '';
            const matchesSearch = !q || c.name.toLowerCase().includes(q) || String(c.displayNumber) === q || clubName.toLowerCase().includes(q);
            const matchesType = !compTypeFilter || c.type === compTypeFilter;
            const matchesMethod = !compMethodFilter || c.scoringMethod === compMethodFilter;
            return matchesSearch && matchesType && matchesMethod;
        });
    }, [competitions, compListSearch, compTypeFilter, compMethodFilter, clubNameById]);
    const totalParticipants = useMemo(
        () => competitions.reduce((sum, c) => sum + (c.participants?.length || 0), 0),
        [competitions]
    );

    // Loading State UI
    if (loading) {
        return (
            <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100 min-h-[400px] flex flex-col items-center justify-center space-y-4">
                <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin" />
                <div>
                    <h3 className="font-extrabold text-lg text-gray-800">Musobaqa ma'lumotlari yuklanmoqda...</h3>
                    <p className="text-xs text-gray-400">Iltimos, kuting</p>
                </div>
            </div>
        );
    }

    // Error State UI
    if (error) {
        return (
            <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-red-100 min-h-[400px] flex flex-col items-center justify-center space-y-4">
                <AlertCircle className="w-12 h-12 text-red-500" />
                <div>
                    <h3 className="font-extrabold text-lg text-gray-800">Xatolik yuz berdi</h3>
                    <p className="text-xs text-red-500 mt-1">{error}</p>
                </div>
                <Button variant="primary" onClick={loadCompetitions} icon={RefreshCw}>
                    Qayta Urinish
                </Button>
            </div>
        );
    }

    return (
        <div ref={workspaceRef} className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden font-sans">
            {/* Top Navigation Header — only shown when there's no active competition (list/creation
                view); once a competition is open, <CompetitionPassportHero> below replaces it so there
                isn't a redundant double title banner. */}
            {!activeComp && (
                <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 p-6 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
                            <Trophy className="w-8 h-8 text-yellow-300 animate-bounce" />
                            {title}
                        </h2>
                        <p className="text-indigo-100 text-sm mt-1">
                            Musobaqalar va baholash ekosistemasi
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {!isConfiguring && hasScoringAccess() && (
                            <Button
                                variant="success"
                                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                                icon={Plus}
                                onClick={() => setIsConfiguring(true)}
                            >
                                Yangi Musobaqa
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Main Body */}
            {isConfiguring ? (
                /* TOURNAMENT CREATION WIZARD (4-step) */
                <TournamentCreateWizard
                    contextType={contextType}
                    contextId={contextId}
                    onCancel={() => setIsConfiguring(false)}
                    onCreated={(created) => {
                        loadCompetitions();
                        setActiveComp(created);
                        syncUrlToActiveComp(created);
                        setIsConfiguring(false);
                        setTimerSeconds(0);
                        setTimerActive(false);
                        setActiveTab('overview');
                    }}
                />
            ) : activeComp ? (
                /* COMPETITION MANAGEMENT WORKSPACE */
                <div className="flex flex-col min-h-[650px] bg-slate-50 border-t border-gray-100">

                    <div className="p-4 pb-0 space-y-3">
                        {/* Only shown when TournamentScoring owns its own internal list (embedded usage,
                            e.g. ClubsModule.jsx's contextType/contextId flow) — when opened via a fixed
                            `competitionId` (routed usage, CompetitionWorkspacePage.jsx), that page's own
                            real "Orqaga" button already navigates back to the competitions list, so this
                            would just be a redundant, dead-end control (resetting local state without
                            changing the URL). Shown regardless of how many competitions exist — with only
                            1 (or 0 after a delete), `loadCompetitions()` auto-opens that lone competition,
                            and without this the whole list/"Yangi Musobaqa" header stays permanently
                            hidden (it only renders when `!activeComp`) with no way back. This used to be
                            masked by the mock backend always seeding several demo competitions at once;
                            a real account naturally starts with very few. */}
                        {!competitionId && competitions.length >= 1 && (
                            <button
                                type="button"
                                onClick={() => { setActiveComp(null); loadCompetitions(); }}
                                className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-indigo-600 transition-colors"
                            >
                                <ArrowLeft size={13} />
                                Turnirlar ro'yxati
                            </button>
                        )}
                        {/* Musobaqa Pasporti — replaces the old plain title banner for the workspace view */}
                        {heroProps && (
                            <CompetitionPassportHero
                                competition={activeComp}
                                {...heroProps}
                                stats={heroStats}
                                hasFullAdminAccess={hasFullAdminAccess}
                                canManageGroups={canManageGroups}
                                onSelectSettingsSection={setSettingsSection}
                                onFinishTournament={handleFinishTournament}
                                onDeleteCompetition={() => handleDeleteCompetition(activeComp.id)}
                                // Opens the REAL registration panel (same one events/club pages use), whose
                                // "Qo'lda qo'shish" attaches an existing club team or creates a new one on
                                // the spot. Match-based engines (Munozara/TSUL Court) start with an empty
                                // roster by design, and this used to be a dead placeholder alert — leaving
                                // no way at all to get teams into such a competition from its workspace.
                                onAddTeam={() => setIsAddTeamOpen(true)}
                                onShare={() => {
                                    // The real public, no-login page (PublicActivityPage.jsx) — NOT
                                    // window.location.href, which was whatever protected admin/student
                                    // workspace URL happened to be open, useless to anyone without an
                                    // account or the right role.
                                    const url = `${window.location.origin}/musobaqa/${activeComp.id}`;
                                    if (navigator.share) {
                                        navigator.share({ title: activeComp.name, url }).catch(() => {});
                                    } else if (navigator.clipboard) {
                                        navigator.clipboard.writeText(url).then(() => alert('Havola nusxalandi'));
                                    }
                                }}
                                role={role}
                                scoringMethodLabel={SCORING_METHOD_LABELS[activeComp.scoringMethod] || activeComp.scoringMethod}
                                competitionTypeLabel={activeComp.type === 'team' ? 'Jamoaviy' : 'Yakka tartibda'}
                                onViewLiveScoring={hasScoringAccess() ? () => setActiveTab('scoring') : null}
                                onRefresh={loadRoundScores}
                                onOpenLiveScreen={() => window.open(`/live/${activeComp.id}`, '_blank')}
                                isFullscreen={isFullscreen}
                                onToggleFullscreen={toggleFullscreen}
                                darkMode={darkMode}
                                onToggleTheme={toggleTheme}
                            />
                        )}
                    </div>

                    {/* Consolidated "Sozlamalar" — the "⋯" button opens a SMALL popover menu
                        (CompetitionSettingsMenu, rendered inside the hero) rather than a big modal;
                        picking one item here opens ONE small, appropriately-sized modal for just that
                        section — not one giant multi-section window. Replaces the previous separate
                        Hakamlar/Tahlillar/Sozlamalar tabs and the standalone "Vakolatlar" hero button.
                        Every section reuses the exact same component the old tabs rendered — this is a
                        navigation consolidation, not a rewrite of judges/delegation/round logic. */}
                    <Modal
                        isOpen={!!settingsSection}
                        onClose={() => setSettingsSection(null)}
                        title={SETTINGS_SECTION_TITLES[settingsSection] || 'Sozlamalar'}
                        size={settingsSection === 'general' || settingsSection === 'delegation' ? 'md' : 'lg'}
                    >
                        {settingsSection && (
                            <CompetitionSettingsPanel
                                section={settingsSection}
                                competition={activeComp}
                                scoresData={scoresData}
                                auditLogs={auditLogs}
                                hasFullAdminAccess={hasFullAdminAccess}
                                canManageGroups={canManageGroups}
                                actingUsername={user?.username || 'admin'}
                                onCompetitionUpdated={() => {
                                    setActiveComp(db.getCompetitionById(activeComp.id));
                                    // Guruh bosqichlari (CompetitionAdvancementPanel, inside this same settings
                                    // modal) creates/assigns scoring groups in a separate table — facultyGroups/
                                    // participantGroupMap/eligibleParticipantIds below are memoized on
                                    // scoresVersion, not on activeComp, so without this bump a newly-created
                                    // guruh never appears in Natija kiritish's Fakultet filter until a full
                                    // page reload remounts the component.
                                    setScoresVersion(v => v + 1);
                                }}
                                onOpenRound={(index) => {
                                    const startIndex = activeComp.scoringMethod === 'correct_answer'
                                        ? (index - 1) * (activeComp.questionsPerRound || 12) + 1
                                        : index;
                                    handleRoundChange(startIndex);
                                    setActiveTab('scoring');
                                    setSettingsSection(null);
                                }}
                            />
                        )}
                    </Modal>

                    {/* "Jamoa qo'shish" — reuses the shared ActivityRegistrationPanel verbatim (the same
                        component EventEditForm/ClubProfilePage/PublicActivityPage render), so manual adds
                        go through the real, audited db.overrideAddTeam/overrideCreateTeam path instead of a
                        second, parallel roster-editing implementation. */}
                    <Modal
                        isOpen={isAddTeamOpen}
                        onClose={() => setIsAddTeamOpen(false)}
                        title="Jamoa qo'shish"
                        size="md"
                    >
                        {isAddTeamOpen && (
                            <ActivityRegistrationPanel
                                activity={activeComp}
                                activityType="competition"
                                clubId={activeComp.contextType === 'club' ? activeComp.contextId : null}
                                startDateTime={activeComp.startDate ? db.combineDateTime(activeComp.startDate, activeComp.startTime) : null}
                                user={user}
                                isAdmin={role === 'ADMINISTRATOR'}
                                // getUserRole() emits 'MODERATOR' for the management tier (never
                                // 'RAHBARIYAT') — a coordinator is covered separately by hasClubRole below.
                                isManagement={role === 'MODERATOR'}
                                hasClubRole={hasClubRole}
                                onRegistered={() => {
                                    setActiveComp(db.getCompetitionById(activeComp.id));
                                    // Groups/lineups downstream memoize on scoresVersion, not on activeComp —
                                    // without this bump a just-added team wouldn't appear in the Guruhlar/
                                    // uchrashuv pickers until a full reload.
                                    setScoresVersion(v => v + 1);
                                }}
                            />
                        )}
                        {/* ⚠️ VAQTINCHALIK — real ro'yxatdan o'tish ishlagach shu blok o'chiriladi. */}
                        {isAddTeamOpen && hasFullAdminAccess() && (
                            <TestTeamsQuickAdd
                                competition={activeComp}
                                clubId={activeComp.contextType === 'club' ? activeComp.contextId : null}
                                actingUsername={user?.username || 'admin'}
                                onAdded={() => {
                                    setActiveComp(db.getCompetitionById(activeComp.id));
                                    setScoresVersion(v => v + 1);
                                }}
                            />
                        )}
                    </Modal>

                    {/* Top Navigation Tabs — sticky so it stays reachable while scrolling a tall tab body.
                        Streamlined per direct feedback: Hakamlar/Tahlillar/Sozlamalar moved into the
                        consolidated Sozlamalar panel above (Tahlillar was analyzed and dropped — its 3
                        stat cards duplicated Asosiy's overview tiles, and its "chart dashboard" block was
                        purely decorative, never a real chart). Brackets only shows for competitions that
                        actually use a knockout tournamentEngine — showing a mock bracket for a Zakovat
                        quiz competition made no sense. Raundlar stays a top-level tab only for Sport
                        (match_play, where it's the PRIMARY interface — match/group management); for every
                        other format its round-card admin actions moved into Sozlamalar too, since round
                        navigation itself already lives inside "Natija kiritish"'s round-selector pills. */}
                    <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 flex items-center justify-between gap-3 shrink-0 mt-4">
                        <nav className="flex items-center gap-1 overflow-x-auto">
                            {[
                                { id: 'overview', label: 'Asosiy', icon: LayoutDashboard },
                                { id: 'participants', label: 'Jamoalar', icon: Users },
                                { id: 'reyting', label: 'Reyting', icon: BarChart3 },
                                // Munozara match-based (debate_match) is a second match-based engine, sibling
                                // to Sport (match_play) — same "Raundlar tab is the primary interface, no
                                // separate Natija kiritish" reasoning (its scores are entered per-notiq inside
                                // DebateNotiqScoringPanel, opened from the Raundlar tab's DebateMatchesTab).
                                ...(['match_play', 'debate_match', 'court_match'].includes(activeComp.scoringMethod) ? [{ id: 'raundlar', label: 'Raundlar', icon: Layers }] : []),
                                // Munozara/TSUL Court get their own "Baholash" tab (MatchScoringTab) instead
                                // of "Natija kiritish": same per-match grid that the Raundlar tab opens in a
                                // modal, but reachable directly with a match picker rather than by finding
                                // the right match row first. Sport (match_play) has no criteria grid — its
                                // score is a plain number entered on the match row itself — so it's excluded.
                                ...(hasScoringAccess() && ['debate_match', 'court_match'].includes(activeComp.scoringMethod)
                                    ? [{ id: 'baholash', label: 'Baholash', icon: Gavel }] : []),
                                ...(hasScoringAccess() && !['match_play', 'debate_match', 'court_match'].includes(activeComp.scoringMethod) ? [{ id: 'scoring', label: 'Natija kiritish', icon: Zap }] : []),
                                // Own tab (not a section inside "Natija kiritish") so an attendance-only delegate
                                // — granted 'attendance' but not result_entry/live_scoring — can still reach it.
                                // Every TEAM-type competition assigns its score to the team as a whole (one
                                // competitionScores row per team per round, regardless of engine — correct_answer/
                                // quiz_mixed/criteria_based/single_score all share this), so a team score alone
                                // never proves any specific member showed up. Excludes match_play/debate_match,
                                // which have their own dedicated per-match Davomat toggle inside "Raundlar" instead.
                                ...(activeComp.type === 'team' && !['match_play', 'debate_match', 'court_match'].includes(activeComp.scoringMethod) && canManageAttendance()
                                    ? [{ id: 'davomat', label: 'Davomat', icon: ClipboardCheck }] : []),
                                { id: 'results', label: 'Tanlov natijalari', icon: Trophy },
                                // Rasmiy yakun: bayonnoma -> imzo -> taqdirlash -> hujjatlar.
                                ...(hasFullAdminAccess() || role === 'COORDINATOR'
                                    ? [{ id: 'yakunlash', label: 'Yakunlash', icon: FileBarChart2 }] : []),
                                { id: 'apellyatsiya', label: 'Apellyatsiya', icon: AlertTriangle },
                                { id: 'blankalar', label: 'Blankalar', icon: FileBarChart2 },
                                ...(activeComp.tournamentEngine === 'knockout' ? [{ id: 'brackets', label: 'Brackets (Setka)', icon: GitMerge }] : []),
                                { id: 'schedule', label: 'Jadval', icon: Clock },
                                // Statistika OXIRIDA: u musobaqani o'tkazish emas,
                                // natijani o'qish. Ish tablari oldinda qoladi.
                                { id: 'statistika', label: 'Statistika', icon: PieChart },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
                                        activeTab === tab.id
                                            ? 'border-indigo-600 text-indigo-700'
                                            : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200'
                                    }`}
                                >
                                    <tab.icon size={15} />
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                        <div
                            className="hidden lg:flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 shrink-0"
                            title="Natijalar doimiy zaxiralab boriladi hamda hakamlar faoliyati audit qilinadi."
                        >
                            <Shield size={12} className="text-indigo-400" />
                            UniPlatform Secure
                        </div>
                    </div>

                    {/* Right Workspace Content */}
                    <div className="flex-1 min-w-0 bg-white overflow-hidden flex flex-col justify-between">
                        
                        {/* 1. OVERVIEW TAB (delegated to CompetitionOverviewTab.jsx) */}
                        {activeTab === 'overview' && (
                            <CompetitionOverviewTab
                                competition={activeComp}
                                scoresData={scoresData}
                                leaderboardData={leaderboardData}
                            />
                        )}

                        {/* 2. PARTICIPANTS TAB (delegated to CompetitionParticipantsTab.jsx) */}
                        {activeTab === 'participants' && (
                            <CompetitionParticipantsTab
                                competition={activeComp}
                                leaderboardData={leaderboardData}
                                role={role}
                            />
                        )}

                        {/* 3. LIVE SCORING TAB (Original existing scoring logic preserved) */}
                        {activeTab === 'scoring' && (
                            <>
                            <div className="flex flex-col lg:flex-row flex-1">
                                <div className="flex-1 p-6 border-r border-gray-100 min-w-0 space-y-6">
                                    {/* Top Round Progress & Details */}
                                    <div className="bg-slate-50 rounded-xl p-4 flex flex-wrap justify-between items-center gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="bg-indigo-600 text-white font-black text-xl px-4 py-2.5 rounded-lg">
                                                {currentItemLabel} {currentRound} / {activeComp.roundsCount}
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-gray-500 uppercase">Joriy Holat</p>
                                                <p className="text-sm font-semibold text-gray-900">
                                                    {activeComp.scoringMethod === 'correct_answer'
                                                        ? (() => {
                                                            const correctPts = activeComp.pointsPerCorrectAnswer ?? 10;
                                                            const penaltyPts = activeComp.penaltyPerWrongAnswer ?? 0;
                                                            return penaltyPts > 0
                                                                ? `To'g'ri: +${correctPts} ball, Noto'g'ri: -${penaltyPts} ball`
                                                                : `To'g'ri javob uchun: +${correctPts} ball`;
                                                        })()
                                                        : activeComp.scoringMethod === 'quiz_mixed'
                                                            ? `${currentItemLabel} turi: ${QUIZ_MIXED_ROUND_TYPES.find(t => t.id === currentQuizRuleType)?.label || currentQuizRuleType}`
                                                            : activeComp.scoringMethod === 'debate'
                                                                ? "Mezon bo'yicha baholash (jami 100 ball)"
                                                                : 'Ball kiritish faol'
                                                    }
                                                </p>
                                            </div>
                                        </div>

                                        {/* Timer Controls */}
                                        <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border">
                                            <Clock className="w-4 h-4 text-indigo-500" />
                                            <span className="font-mono font-bold text-gray-700 text-sm">{formatTime(timerSeconds)}</span>
                                            <button 
                                                type="button"
                                                onClick={() => setTimerActive(!timerActive)}
                                                className="p-1 hover:bg-slate-100 rounded text-slate-600"
                                            >
                                                {timerActive ? <Pause size={14} /> : <Play size={14} />}
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => { setTimerSeconds(0); setTimerActive(false); }}
                                                className="p-1 hover:bg-slate-100 rounded text-slate-600"
                                            >
                                                <RotateCcw size={14} />
                                            </button>
                                        </div>
                                        
                                        {/* Device info */}
                                        <div className="text-xs text-gray-400">
                                            Qurilma: <input type="text" className="bg-transparent border-b outline-none font-bold text-gray-500 w-24" value={device} onChange={e=>setDevice(e.target.value)}/>
                                        </div>
                                    </div>

                                    {/* Active Judge & Multi-Judge Switcher */}
                                    <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex flex-wrap justify-between items-center gap-4">
                                        <div className="flex items-center gap-2">
                                            <UserCheck className="w-5 h-5 text-indigo-600" />
                                            <div>
                                                <span className="text-xs text-indigo-600 font-bold block">Baholayotgan hakam</span>
                                                <select 
                                                    value={activeJudge} 
                                                    onChange={(e) => { flushPendingSave(); setActiveJudge(e.target.value); }}
                                                    className="bg-transparent text-sm font-bold text-gray-900 border-none p-0 focus:ring-0 focus:outline-none cursor-pointer"
                                                >
                                                    {activeComp.judges.map(j => (
                                                        <option key={j} value={j}>{j === user?.username ? `${j} (Siz)` : j}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                            <Keyboard className="w-4 h-4 text-indigo-500" />
                                            <span className="text-xs font-bold text-indigo-700">Tezkor tugmalar: Enter - Saqlash, ArrowUp/Down - Qatorlar</span>
                                        </div>
                                    </div>

                                    {/* Chief Judge penalty panel (debate only) — a separate, immediate action,
                                        gated to full admin access as the closest existing proxy for "Chief Judge" */}
                                    {activeComp.scoringMethod === 'debate' && hasFullAdminAccess() && (
                                        <DebateChiefJudgePenaltyPanel
                                            competition={activeComp}
                                            appliedBy={activeJudge}
                                            onApplied={() => setScoresVersion(v => v + 1)}
                                        />
                                    )}

                                    {/* Fakultet ("guruh") filter — pure judge-side convenience for narrowing a
                                        long Tur1/2 roster while scoring, unrelated to the REAL eligibility
                                        filter already baked into filteredParticipants above. Only appears once
                                        an admin has actually created groups in Turlarni boshqarish's advancement
                                        panel — invisible/no-op otherwise, defaults to "Barchasi". */}
                                    {isQuizMixedStaged && facultyGroups.length > 0 && (
                                        <div className="flex items-center gap-2 flex-wrap pb-1">
                                            <h4 className="font-bold text-gray-800 text-sm shrink-0">Fakultet:</h4>
                                            <div className="flex gap-1.5 flex-wrap">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedFacultyFilter('all')}
                                                    className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-all border ${
                                                        selectedFacultyFilter === 'all'
                                                            ? 'bg-indigo-700 border-indigo-700 text-white'
                                                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    Barchasi
                                                </button>
                                                {facultyGroups.map(g => (
                                                    <button
                                                        key={g.id}
                                                        type="button"
                                                        onClick={() => setSelectedFacultyFilter(g.id)}
                                                        className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-all border ${
                                                            selectedFacultyFilter === g.id
                                                                ? 'bg-indigo-700 border-indigo-700 text-white'
                                                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        {g.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Tur (stage/phase) selector — shown for any competition with real stage
                                        boundaries: quiz_mixed presets with fixed stages (25-savol, UniQuiz) and
                                        correct_answer (Zakovat) League/Cup competitions (a Zakovat league is
                                        genuinely Tur -> Raund -> Savol: e.g. 10-12 Tur/season, each with 1-2+
                                        Raund of 12+ Savol — see TournamentCreateWizard.jsx). Picking a Tur jumps
                                        to its first item; the Raund-group/pill rows below then narrow to just
                                        that Tur's range. */}
                                    {hasStages && (
                                        <div className="flex items-center justify-between gap-3 pb-1 flex-wrap">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h4 className="font-bold text-gray-800 text-sm shrink-0">Tur tanlash:</h4>
                                                <div className="flex gap-1.5 flex-wrap">
                                                    {stages.map(stage => (
                                                        <button
                                                            key={stage.label}
                                                            type="button"
                                                            onClick={() => handleRoundChange(stage.roundRange[0])}
                                                            className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-all border ${
                                                                selectedStage === stage
                                                                    ? 'bg-indigo-700 border-indigo-700 text-white'
                                                                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                                            }`}
                                                        >
                                                            {stage.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 px-3.5 py-2 bg-indigo-50 rounded-xl shrink-0">
                                                <Trophy size={14} className="text-indigo-400" />
                                                <span className="text-xs font-bold text-indigo-700">
                                                    Tanlangan tur: {selectedStage.label} ({selectedStage.roundRange[0]}–{selectedStage.roundRange[1]}-{stageLeafLabel === 'raund' ? 'raundlar' : 'savollar'})
                                                </span>
                                                {(isQuizScoring || isQuizMixedStaged) && <Lock size={12} className={isRoundLocked ? 'text-indigo-600' : 'text-indigo-300'} />}
                                            </div>
                                        </div>
                                    )}

                                    {/* Real Raund groups within the selected Tur (Bosqichli "Tur tuzilmasi"
                                        builder) — numbering resets per Tur (1-Raund, 2-Raund...), each pill
                                        narrows the grid to exactly that Raund's own savol columns (savol
                                        numbers themselves stay sequential within the Tur, see raundBoundaries
                                        above). Replaces the single-raw-item selector below for this shape —
                                        picking a Raund here already narrows to a manageable column count. */}
                                    {isQuizMixedStaged && raundBoundaries && (
                                        <div className="flex items-center gap-2 flex-wrap pb-1">
                                            <h4 className="font-bold text-gray-800 text-sm shrink-0">Raund tanlash:</h4>
                                            <div className="flex gap-1.5 flex-wrap">
                                                {raundBoundaries.map((rb, i) => (
                                                    <button
                                                        key={i}
                                                        type="button"
                                                        onClick={() => setSelectedRaundIdx(i + 1)}
                                                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all border ${
                                                            selectedRaundIdx === i + 1
                                                                ? 'bg-indigo-700 border-indigo-700 text-white'
                                                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                                        }`}
                                                        title={`${rb.roundRange[0]}–${rb.roundRange[1]}-savol`}
                                                    >
                                                        {i + 1}-Raund
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* UniQuiz-only: narrows the grid to ONE raund column at a time (judge-side
                                        entry convenience) — "Hammasi" (default) shows every raund of the Tur,
                                        unchanged. Prev/Next step through the Tur's own raunds in order. */}
                                    {isQuizMixedStaged && !raundBoundaries && (
                                        <div className="flex items-center gap-2 flex-wrap pb-1">
                                            <h4 className="font-bold text-gray-800 text-sm shrink-0">Raund tanlash:</h4>
                                            <div className="flex gap-1.5 flex-wrap">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedSingleRaund(null)}
                                                    className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all border ${
                                                        selectedSingleRaund === null
                                                            ? 'bg-indigo-700 border-indigo-700 text-white'
                                                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    Hammasi
                                                </button>
                                                {questionButtons.map((r, i) => (
                                                    <button
                                                        key={r}
                                                        type="button"
                                                        onClick={() => setSelectedSingleRaund(r)}
                                                        className={`w-9 h-9 rounded-lg font-bold text-xs transition-all shrink-0 border ${
                                                            selectedSingleRaund === r
                                                                ? 'bg-indigo-700 border-indigo-700 text-white'
                                                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        {i + 1}
                                                    </button>
                                                ))}
                                            </div>
                                            {selectedSingleRaund != null && (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        disabled={questionButtons.indexOf(selectedSingleRaund) <= 0}
                                                        onClick={() => setSelectedSingleRaund(questionButtons[questionButtons.indexOf(selectedSingleRaund) - 1])}
                                                        className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                                                        title="Oldingi raund"
                                                    >
                                                        <ArrowLeft size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={questionButtons.indexOf(selectedSingleRaund) >= questionButtons.length - 1}
                                                        onClick={() => setSelectedSingleRaund(questionButtons[questionButtons.indexOf(selectedSingleRaund) + 1])}
                                                        className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                                                        title="Keyingi raund"
                                                    >
                                                        <ArrowRight size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* correct_answer (Zakovat): the whole Raund-group navigator + per-question
                                        table below is replaced by the spreadsheet-style QuizScoringGrid (all of
                                        the current Raund's Savol as columns, click-to-cycle cells) — see that
                                        file for why it doesn't reuse the debounced-autosave machinery below
                                        (that machinery is scoped to ONE `currentRound` at a time; the grid spans
                                        many at once). Every other scoring method keeps the original UI, untouched. */}
                                    {isQuizScoring ? (
                                        <QuizScoringGrid
                                            competition={activeComp}
                                            participants={filteredParticipants}
                                            activeJudge={activeJudge}
                                            device={device}
                                            questionButtons={questionButtons}
                                            selectedRoundGroup={selectedRoundGroup}
                                            roundGroupCount={roundGroupCount}
                                            currentRound={currentRound}
                                            turRangeStart={groupRangeStart}
                                            questionsPerRoundGroup={QUESTIONS_PER_ROUND_GROUP}
                                            locked={isRoundLocked}
                                            hideResults={resultsHidden}
                                            onToggleLock={handleToggleRoundLock}
                                            onToggleHideResults={handleToggleResultsHidden}
                                            onSelectRoundGroup={(groupNum) => handleRoundChange(groupRangeStart + (groupNum - 1) * QUESTIONS_PER_ROUND_GROUP)}
                                            onScoresChanged={() => { setScoresVersion(v => v + 1); loadAuditLogs(); }}
                                        />
                                    ) : isQuizMixedStaged ? (
                                        scoringGateStatus.blocked ? (
                                            <div className="flex flex-col items-center justify-center gap-3 p-12 text-center border rounded-2xl bg-slate-50">
                                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-indigo-50">
                                                    <Lock size={22} className="text-indigo-400" />
                                                </div>
                                                {scoringGateStatus.reason === 'advancement' ? (
                                                    <>
                                                        <p className="font-bold text-gray-700">Bu Turga hali kim o'tishi aniqlanmagan</p>
                                                        <p className="text-sm text-gray-400 max-w-sm">
                                                            Avval oldingi bosqichda "Turlarni boshqarish" panelida "Finalga chiqarish"ni bosing.
                                                        </p>
                                                    </>
                                                ) : (
                                                    <>
                                                        <p className="font-bold text-gray-700">Bu Tur/Final muddati hali kelmagan</p>
                                                        <p className="text-sm text-gray-400 max-w-sm">
                                                            Boshlanish vaqti: {scoringGateStatus.startDateTime?.toLocaleString('uz-UZ')}
                                                        </p>
                                                    </>
                                                )}
                                            </div>
                                        ) : (
                                        <QuizMixedScoringGrid
                                            competition={activeComp}
                                            participants={filteredParticipants}
                                            activeJudge={activeJudge}
                                            device={device}
                                            roundNumbers={displayedRoundNumbers}
                                            totalRoundNumbers={questionButtons}
                                            columnSuffix={stageLeafLabel === 'raund' ? 'R' : 'savol'}
                                            locked={isRoundLocked}
                                            hideResults={resultsHidden}
                                            onToggleLock={handleToggleRoundLock}
                                            onToggleHideResults={handleToggleResultsHidden}
                                            onScoresChanged={() => { setScoresVersion(v => v + 1); loadAuditLogs(); }}
                                        />
                                        )
                                    ) : (
                                    <>
                                    {/* Round selector navigation — pills are color-coded by real progress
                                        (yakunlangan/joriy/hali emas), same convention as the Jadval tab's
                                        round list, so the person entering results can't lose track of which
                                        round is already saved vs. still open. The currently viewed round
                                        (`currentRound`, which can differ from the official active round when
                                        someone navigates back to check a completed one) gets a ring outline
                                        on top of its status color instead of a separate color. Label and each
                                        pill's title follow `currentItemLabel` (Savol/Raund) so the same UI
                                        reads correctly whether it's listing questions or rounds. */}
                                    <div className="border-b pb-4 space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <h4 className="font-bold text-gray-800 text-sm">{currentItemLabel} tanlash:</h4>
                                            <div className="flex items-center gap-3 text-[10px] text-gray-400">
                                                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />Yakunlangan</span>
                                                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />Joriy</span>
                                                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-300" />Hali emas</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 overflow-x-auto">
                                            {questionButtons.map(rNum => {
                                                const isOfficialActive = rNum === (activeComp.currentRound || 1);
                                                const isCompleted = rNum < (activeComp.currentRound || 1);
                                                const isSelected = currentRound === rNum;
                                                const statusClass = isCompleted
                                                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                                    : isOfficialActive
                                                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                                        : 'bg-slate-100 text-gray-500 hover:bg-slate-200';
                                                // UniQuiz-style Raund pills (quiz_mixed, stageLeafLabel:'raund')
                                                // show a number LOCAL to the selected Tur ("1-9 with names" —
                                                // e.g. stage 2's items read 1..9, not 10..18), plus the real
                                                // roundRules type as a "name" in the tooltip. Every Savol pill
                                                // row (25-savol, TDYU-as-league/cup, and correct_answer's own
                                                // Savol-within-Raund row — which already has its own "N-Raund"
                                                // group selector above, so this row stays GLOBAL like it always
                                                // was) keeps GLOBAL numbering (savol #21 really is #21).
                                                const pillLabel = !isQuizScoring && hasStages && stageLeafLabel === 'raund'
                                                    ? rNum - selectedStage.roundRange[0] + 1
                                                    : rNum;
                                                const ruleTypeName = activeComp.scoringMethod === 'quiz_mixed'
                                                    ? QUIZ_MIXED_ROUND_TYPES.find(t => t.id === activeComp.roundRules?.[rNum - 1])?.label
                                                    : null;
                                                const statusTitle = isCompleted ? `Yakunlangan ${currentItemLabel.toLowerCase()}` : isOfficialActive ? `Joriy faol ${currentItemLabel.toLowerCase()}` : `Hali boshlanmagan ${currentItemLabel.toLowerCase()}`;
                                                return (
                                                    <button
                                                        key={rNum}
                                                        type="button"
                                                        onClick={() => handleRoundChange(rNum)}
                                                        title={ruleTypeName ? `${statusTitle} — ${ruleTypeName}` : statusTitle}
                                                        className={`w-9 h-9 rounded-lg font-bold text-sm transition-all shrink-0 ${statusClass} ${isSelected ? 'ring-2 ring-offset-1 ring-indigo-500' : ''}`}
                                                    >
                                                        {pillLabel}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Search Bar */}
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        {/* Ilgari `onChange` ichida `setCurrentPage(1)` ham chaqirilardi,
                                            lekin bu ko'rinishdan sahifalash olib tashlangan (pastdagi
                                            izohga qarang) va o'sha funksiya endi mavjud emas edi —
                                            qidiruv maydoniga yozilishi bilan sahifa yiqilardi. */}
                                        <input
                                            type="text"
                                            className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-xl text-sm focus:bg-white"
                                            placeholder="Qidiruv... Ism yoki Jamoa nomi"
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                        />
                                    </div>

                                    {/* Participant Table for Scoring — no pagination: every participant renders
                                        in this one scrollable area (per spec §9). */}
                                    <div className="border rounded-2xl overflow-hidden">
                                        <div className="max-h-[600px] overflow-y-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead className="bg-slate-50 sticky top-0 z-10 text-xs font-bold text-gray-500 uppercase">
                                                    <tr>
                                                        <th className="p-3 border-b">#</th>
                                                        <th className="p-3 border-b">Ishtirokchi</th>
                                                        <th className="p-3 border-b text-center">Natija / Ball</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y text-sm">
                                                    {filteredParticipants.map((p, idx) => {
                                                        const globalIndex = idx + 1;
                                                        const pName = activeComp.type === 'team' ? p.name : p.fullName;

                                                        return (
                                                            <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                                                                <td className="p-3 font-bold text-gray-400 text-xs w-12 text-center">{globalIndex}</td>
                                                                <td className="p-3 font-semibold text-gray-800">
                                                                    {pName}
                                                                </td>
                                                                <td className="p-4 text-center">
                                                                    {activeComp.scoringMethod === 'single_score' && (
                                                                        <input 
                                                                            type="number"
                                                                            className="w-24 px-3 py-1.5 border rounded-xl text-center font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500"
                                                                            value={localScores[p.id] ?? ''}
                                                                            onChange={e => setSingleScore(p.id, e.target.value)}
                                                                            placeholder="0"
                                                                        />
                                                                    )}

                                                                    {activeComp.scoringMethod === 'winner_selection' && (
                                                                        <select
                                                                            className="px-3 py-1.5 border rounded-xl text-xs font-bold text-gray-700"
                                                                            value={localScores[p.id] ?? 'none'}
                                                                            onChange={e => setWinnerSelection(p.id, e.target.value)}
                                                                        >
                                                                            <option value="none">Tanlanmagan</option>
                                                                            <option value="Winner">G'olib (Winner)</option>
                                                                            <option value="Qualified">O'tdi (Qualified)</option>
                                                                            <option value="Eliminated">Chiqib ketdi (Eliminated)</option>
                                                                        </select>
                                                                    )}

                                                                    {activeComp.scoringMethod === 'criteria_based' && (
                                                                        <div className="flex items-center justify-center gap-2">
                                                                            {(activeComp.criteria || []).map(c => (
                                                                                <input 
                                                                                    key={c.id}
                                                                                    type="number"
                                                                                    title={c.name}
                                                                                    placeholder={c.name}
                                                                                    className="w-16 px-2 py-1 border rounded-lg text-center text-xs font-bold"
                                                                                    value={localCriteriaScores[p.id]?.[c.name] ?? ''}
                                                                                    onChange={e => setCriteriaScore(p.id, c.name, e.target.value)}
                                                                                />
                                                                            ))}
                                                                            <span className="font-extrabold text-indigo-600 text-xs ml-2">
                                                                                Sum: {localScores[p.id] || 0}
                                                                            </span>
                                                                        </div>
                                                                    )}

                                                                    {activeComp.scoringMethod === 'quiz_mixed' && (
                                                                        <QuizMixedScoringInput
                                                                            ruleType={currentQuizRuleType}
                                                                            value={localScores[p.id]}
                                                                            onChange={val => setQuizMixedValue(p.id, val)}
                                                                            points={getEffectivePointsTable(activeComp)}
                                                                        />
                                                                    )}

                                                                    {activeComp.scoringMethod === 'debate' && (
                                                                        <DebateCriteriaInputs
                                                                            competition={activeComp}
                                                                            participantId={p.id}
                                                                            localCriteriaScores={localCriteriaScores}
                                                                            localScores={localScores}
                                                                            setCriteriaScore={setCriteriaScore}
                                                                        />
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                    </div>
                                    </>
                                    )}
                                </div>
                                <LiveLeaderboardSidebar
                                    competition={activeComp}
                                    leaderboardData={leaderboardData}
                                    currentRound={currentRound}
                                />
                            </div>
                            <AutosaveStatusBar status={autosaveStatus} lastSavedAt={lastAutosaveAt} judge={activeJudge} />
                            </>
                        )}

                        {/* 4. RESULTS CENTER TAB (Reusing CompetitionResultsCenter component intact) */}
                        {activeTab === 'results' && (
                            activeComp.scoringMethod === 'match_play' ? (
                                // CompetitionResultsCenter is built entirely around the quiz/round-score
                                // data shape (competitionScores) — a match_play competition never writes
                                // there, so forcing it through would show empty/meaningless data rather
                                // than a real error. Point to the tabs that actually carry sport data.
                                <div className="p-12 text-center text-gray-400 text-sm">
                                    Sport musobaqalari uchun natijalar "Reyting" (guruh jadvali) va "Raundlar" (uchrashuvlar) tablarida ko'rsatiladi.
                                </div>
                            ) : ['debate_match', 'court_match'].includes(activeComp.scoringMethod) ? (
                                // Real final placement computed from finished matches (db.getDebateTeamRating),
                                // instead of the dead-end notice that used to sit here — these engines never
                                // write the per-round competitionScores rows CompetitionResultsCenter needs.
                                <MatchResultsTab competition={activeComp} />
                            ) : (
                                <CompetitionResultsCenter
                                    competition={activeComp}
                                    scoresData={scoresData}
                                    auditLogs={auditLogs}
                                    debatePenalties={debatePenaltiesData}
                                    userRole={role}
                                    resultsHidden={resultsHidden}
                                    canBypassResultsHidden={hasScoringAccess()}
                                />
                            )
                        )}

                        {/* 5. BRACKETS TAB */}
                        {activeTab === 'brackets' && (
                            <div className="p-6 space-y-6">
                                <div>
                                    <h3 className="font-bold text-lg text-gray-900">Musobaqa Setkasi (Single Elimination Bracket)</h3>
                                    <p className="text-xs text-gray-400">Jamoalar va talabalar o'rtasidagi to'g'ridan-to'g'ri matchlar tuzilishi</p>
                                </div>
                                <div className="flex flex-col md:flex-row items-center justify-around gap-8 py-8 overflow-x-auto min-h-[400px]">
                                    {/* Quarterfinals */}
                                    <div className="space-y-8 min-w-[200px]">
                                        <p className="text-xs font-bold text-center text-gray-400">CHORAK FINAL</p>
                                        {[
                                            { t1: activeComp.participants[0], t2: activeComp.participants[4], s1: 10, s2: 8 },
                                            { t1: activeComp.participants[1], t2: activeComp.participants[3], s1: 6, s2: 9 }
                                        ].map((match, i) => (
                                            <div key={i} className="space-y-1 p-3 bg-gray-50 border rounded-xl shadow-sm">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="font-semibold truncate max-w-[120px]">{match.t1?.name || match.t1?.fullName || 'Ishtirokchi #1'}</span>
                                                    <span className="font-bold text-indigo-600">{match.s1}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs border-t pt-1 mt-1">
                                                    <span className="font-semibold truncate max-w-[120px]">{match.t2?.name || match.t2?.fullName || 'Ishtirokchi #2'}</span>
                                                    <span className="font-bold text-indigo-600">{match.s2}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Semifinal */}
                                    <div className="space-y-16 min-w-[200px]">
                                        <p className="text-xs font-bold text-center text-gray-400">YARIM FINAL</p>
                                        <div className="space-y-1 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl shadow-sm">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="font-bold text-indigo-900 truncate max-w-[120px]">{activeComp.participants[0]?.name || activeComp.participants[0]?.fullName || 'Alpha'}</span>
                                                <span className="font-bold text-indigo-700">12</span>
                                            </div>
                                            <div className="flex justify-between items-center text-xs border-t border-indigo-100 pt-1 mt-1">
                                                <span className="font-bold text-indigo-900 truncate max-w-[120px]">{activeComp.participants[3]?.name || activeComp.participants[3]?.fullName || 'Beta'}</span>
                                                <span className="font-bold text-indigo-700">14</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Final Match */}
                                    <div className="space-y-8 min-w-[200px] text-center">
                                        <p className="text-xs font-bold text-gray-400">FINAL</p>
                                        <div className="p-5 bg-gradient-to-r from-yellow-500 to-amber-500 text-white rounded-2xl shadow-lg border border-yellow-400 space-y-3">
                                            <div className="text-2xl">🏆</div>
                                            <div>
                                                <p className="font-black text-sm">{activeComp.participants[0]?.name || activeComp.participants[0]?.fullName || 'Alpha'}</p>
                                                <p className="text-[10px] opacity-80 mt-0.5">Musobaqa chempioni</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 6. SCHEDULE TAB */}
                        {activeTab === 'schedule' && (
                            <div className="p-6 space-y-6">
                                <div>
                                    <h3 className="font-bold text-lg text-gray-900">Musobaqa Bosqichlari Jadvali</h3>
                                    <p className="text-xs text-gray-400">Bosqichlar o'tkazilish vaqti va tartibi</p>
                                </div>
                                {['debate_match', 'court_match'].includes(activeComp.scoringMethod) && (
                                    <DebateMatchSchedule
                                        competition={activeComp}
                                        canEdit={canManageSchedule()}
                                    />
                                )}
                                {!['debate_match', 'court_match'].includes(activeComp.scoringMethod) && hasStages && (
                                    <CompetitionTurSchedule
                                        competition={activeComp}
                                        stages={stages}
                                        canEdit={canManageSchedule()}
                                    />
                                )}
                                {/* BOSQICHSIZ MUSOBAQA.
                                    Ilgari bu yerda har raund uchun O'YLAB TOPILGAN vaqt
                                    ko'rsatilardi: "Boshlanish vaqti: Rejalashtirilgan,
                                    14:10" - u raund raqamini o'nga ko'paytirish yo'li
                                    bilan hosil qilinardi va hech qanday yozuvga
                                    tayanmasdi. Ya'ni tashkilotchi jadval belgilagan
                                    deb o'ylardi, aslida esa hech narsa saqlanmagan edi.

                                    Endi bosqichsiz musobaqa ham AYNAN SHU jadvaldan
                                    foydalanadi - raundlar Tur o'rnida turadi. Ma'lumot
                                    bir joyda saqlanadi va tahrirlash huquqi ham bir xil. */}
                                {!['debate_match', 'court_match'].includes(activeComp.scoringMethod) && !hasStages && (
                                    <CompetitionTurSchedule
                                        competition={activeComp}
                                        stages={Array.from({ length: activeComp.roundsCount || 0 }, (_, i) => ({
                                            label: activeComp.scoringMethod === 'correct_answer'
                                                ? `Savol #${i + 1}` : `Raund #${i + 1}`,
                                            bosqichLabel: null,
                                        }))}
                                        unitLabel={activeComp.scoringMethod === 'correct_answer' ? 'savol' : 'raund'}
                                        canEdit={canManageSchedule()}
                                    />
                                )}
                            </div>
                        )}

                        {/* 7. STATISTIKA TAB
                            Eski "Tahlillar" tabi ataylab olib tashlangan edi: undagi uchta
                            katak "Asosiy" dagi ko'rsatkichlarni takrorlardi va "diagrammalar
                            paneli" deb yozilgan blokda hech qanday diagramma yo'q edi.
                            Bu tab uning o'rnini bosmaydi - u boshqa savolga javob beradi:
                            ishtirokchilar QAYSI fakultet, kurs, guruh va tyutordan.
                            Ma'lumot haqiqiy yozuvlardan (ro'yxatdan o'tishlar + davomat)
                            olinadi, hisob esa tadbir va to'plam bilan AYNI (utils/participantStats.js) -
                            shuning uchun to'plamdagi yig'indi alohida musobaqalarnikiga to'g'ri keladi. */}
                        {activeTab === 'statistika' && (
                            <div className="p-6">
                                <ParticipantStatsPanel
                                    refs={[{ activityId: activeComp.id, activityType: 'competition' }]}
                                    subtitle={`"${activeComp.name}" bo'yicha`}
                                />
                            </div>
                        )}

                        {/* Hakamlar/Tahlillar/Sozlamalar tabs were consolidated into the "Sozlamalar"
                            panel (see the Modal above, opened via the Passport hero's "⋯" button) —
                            CompetitionJudgesTab/CompetitionDelegationDrawer/round-admin actions now render
                            there instead of as separate top-level tabs. Tahlillar (Analytics) was analyzed
                            and dropped entirely rather than moved: its 3 stat cards duplicated Asosiy's
                            overview tiles (participants/rounds-completed/audit-count) and its "chart
                            dashboard" block was decorative only — no real chart was ever rendered there. */}
                        {activeTab === 'reyting' && (
                            <CompetitionRatingTab
                                competition={activeComp}
                                leaderboardData={leaderboardData}
                                resultsHidden={resultsHidden}
                                canBypassResultsHidden={hasScoringAccess()}
                            />
                        )}
                        {activeTab === 'raundlar' && activeComp.scoringMethod === 'match_play' && (
                            <CompetitionMatchesTab
                                competition={activeComp}
                                hasFullAdminAccess={hasFullAdminAccess}
                                canManageAttendance={canManageAttendance}
                                actingUsername={user?.username || 'admin'}
                            />
                        )}
                        {activeTab === 'yakunlash' && (
                            <>
                                {/* Vazifalar taqsimoti va avtomatik hisobot - bayonnomadan
                                    OLDIN. Bayonnoma rasmiy hujjat, hisobot esa ichki tahlil:
                                    ikkalasi bir-birini almashtirmaydi. */}
                                <div className="p-6 pb-0 space-y-5">
                                    <ActivityTasksPanel
                                        activityId={activeComp.id} activityType="competition"
                                        canManage={hasFullAdminAccess() || role === 'COORDINATOR'}
                                        actingUsername={user?.username || 'admin'}
                                        onChanged={() => setScoresVersion(v => v + 1)}
                                    />
                                    <div className="border-t pt-5">
                                        <ActivityPointsPanel
                                            activityId={activeComp.id} activityType="competition"
                                            canManage={hasFullAdminAccess() || role === 'COORDINATOR'}
                                            actingUsername={user?.username || 'admin'}
                                            onChanged={() => setScoresVersion(v => v + 1)}
                                        />
                                    </div>
                                    <div className="border-t pt-5">
                                        <ActivityReportPanel
                                            activityId={activeComp.id} activityType="competition"
                                            canManage={hasFullAdminAccess() || role === 'COORDINATOR'}
                                            actingUsername={user?.username || 'admin'}
                                            onChanged={() => setScoresVersion(v => v + 1)}
                                        />
                                    </div>
                                </div>
                                <ActivityFinalizationTab
                                    activityType="competition"
                                    activity={activeComp}
                                    canManage={hasFullAdminAccess() || role === 'COORDINATOR'}
                                    isAdmin={hasFullAdminAccess()}
                                    actingUsername={user?.username || 'admin'}
                                    onChanged={() => setScoresVersion(v => v + 1)}
                                />
                            </>
                        )}
                        {activeTab === 'baholash' && ['debate_match', 'court_match'].includes(activeComp.scoringMethod) && (
                            <MatchScoringTab
                                competition={activeComp}
                                canFinish={hasFullAdminAccess}
                                actingUsername={user?.username || 'admin'}
                                onChanged={() => setScoresVersion(v => v + 1)}
                            />
                        )}
                        {activeTab === 'raundlar' && ['debate_match', 'court_match'].includes(activeComp.scoringMethod) && (
                            <DebateMatchesTab
                                competition={activeComp}
                                hasFullAdminAccess={hasFullAdminAccess}
                                canManageAttendance={canManageAttendance}
                                actingUsername={user?.username || 'admin'}
                            />
                        )}
                        {activeTab === 'davomat' && (
                            <CriteriaRoundAttendanceTab
                                competition={activeComp}
                                canManageAttendance={canManageAttendance}
                                hasFullAdminAccess={hasFullAdminAccess}
                                actingUsername={user?.username || 'admin'}
                            />
                        )}
                        {activeTab === 'apellyatsiya' && (
                            <CompetitionAppealsTab
                                competition={activeComp}
                                hasFullAdminAccess={hasFullAdminAccess}
                                actingUsername={user?.username || 'admin'}
                                onScoreCorrected={() => setScoresVersion(v => v + 1)}
                            />
                        )}
                        {activeTab === 'blankalar' && (
                            <div className="p-12 text-center text-gray-400 text-sm">
                                Blankalar — tez orada.
                            </div>
                        )}

                    </div>
                </div>
            ) : (
                /* COMPETITION SELECTION LIST */
                <div className="p-6 space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 gap-4">
                        <div>
                            <h3 className="font-bold text-lg text-gray-900">Faol Turnirlar va Musobaqalar</h3>
                            <p className="text-sm text-gray-500">Baholash uchun musobaqani tanlang yoki yangisini qo'shing</p>
                        </div>
                        <div className="flex gap-3">
                            {[
                                { value: competitions.length, label: 'Musobaqa' },
                                { value: totalParticipants, label: 'Ishtirokchi' }
                            ].map(s => (
                                <div key={s.label} className="px-4 py-2.5 bg-slate-50 rounded-2xl border border-gray-100 text-center min-w-[76px]">
                                    <p className="text-lg font-black text-indigo-600">{s.value}</p>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase">{s.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Baholash usuli pills — faqat mavjud musobaqalarda haqiqatan ishlatilgan usullar */}
                    {methodsPresent.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            <button
                                type="button"
                                onClick={() => setCompMethodFilter('')}
                                className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-colors ${
                                    compMethodFilter === '' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                Barchasi
                            </button>
                            {methodsPresent.map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setCompMethodFilter(m)}
                                    className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-colors ${
                                        compMethodFilter === m ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    {SCORING_METHOD_LABELS[m] || m}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                        <div className="relative w-full sm:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="Nomi yoki klub bo'yicha qidirish..."
                                value={compListSearch}
                                onChange={e => setCompListSearch(e.target.value)}
                            />
                        </div>

                        <div className="flex bg-gray-100 rounded-2xl p-1 w-fit">
                            <button
                                type="button"
                                onClick={() => setCompTypeFilter('')}
                                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                                    compTypeFilter === '' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                                }`}
                            >
                                Barchasi
                            </button>
                            <button
                                type="button"
                                onClick={() => setCompTypeFilter('team')}
                                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                                    compTypeFilter === 'team' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                                }`}
                            >
                                Jamoa
                            </button>
                            <button
                                type="button"
                                onClick={() => setCompTypeFilter('individual')}
                                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                                    compTypeFilter === 'individual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                                }`}
                            >
                                Individual
                            </button>
                        </div>

                        {/* Katalog / Ro'yxat ko'rinishi almashtirgichi */}
                        <div className="flex bg-gray-100 rounded-2xl p-1 w-fit">
                            <button
                                type="button"
                                onClick={() => setCompListView('grid')}
                                title="Katalog ko'rinishi"
                                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                                    compListView === 'grid' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                                }`}
                            >
                                <LayoutGrid size={14} /> Katalog
                            </button>
                            <button
                                type="button"
                                onClick={() => setCompListView('list')}
                                title="Ro'yxat ko'rinishi"
                                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                                    compListView === 'list' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                                }`}
                            >
                                <List size={14} /> Ro'yxat
                            </button>
                        </div>
                    </div>

                    {compListView === 'list' ? (
                        <CompetitionsListView
                            competitions={filteredCompetitions}
                            methodLabels={SCORING_METHOD_LABELS}
                            canDelete={hasFullAdminAccess()}
                            onDelete={handleDeleteCompetition}
                            onOpen={comp => { setActiveComp(comp); syncUrlToActiveComp(comp); setCurrentRound(comp.currentRound || 1); setActiveTab('overview'); }}
                        />
                    ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredCompetitions.map(comp => (
                            <Card key={comp.id} className="border-l-4 border-l-indigo-600 hover:shadow-md transition-shadow flex flex-col justify-between h-full">
                                <div>
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h4 className="font-extrabold text-lg text-gray-900 leading-tight">{comp.name}</h4>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                <CopyableId value={`Turnir #${comp.displayNumber}`}>Turnir #{comp.displayNumber}</CopyableId>
                                            </p>
                                        </div>
                                        {hasFullAdminAccess() && (
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => handleDeleteCompetition(comp.id)}
                                                    className="p-1.5 text-gray-400 hover:text-red-500 rounded bg-gray-50 hover:bg-red-50 transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        <Badge variant="secondary" size="sm">{comp.type === 'team' ? 'Jamoa' : 'Individual'}</Badge>
                                        <Badge variant="primary" size="sm">{comp.scoringMethod.replace('_', ' ').toUpperCase()}</Badge>
                                        <Badge variant="success" size="sm">{comp.participants.length} ta ishtirokchi</Badge>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center pt-4 border-t border-gray-100 mt-4">
                                    <span className="text-xs text-gray-400">
                                        {comp.scoringMethod === 'debate_match' ? `Uchrashuvlar: ${db.getDebateMatches(comp.id).length} ta`
                                            : comp.scoringMethod === 'match_play' ? `O'yinlar: ${db.getCompetitionMatches(comp.id).length} ta`
                                            : `Raundlar: ${comp.roundsCount} ta`}
                                    </span>
                                    <Button 
                                        variant="primary" 
                                        size="sm" 
                                        icon={Play}
                                        onClick={() => { setActiveComp(comp); syncUrlToActiveComp(comp); setCurrentRound(comp.currentRound || 1); setActiveTab('overview'); }}
                                    >
                                        Ish maydoniga o'tish
                                    </Button>
                                </div>
                            </Card>
                        ))}

                        {filteredCompetitions.length === 0 && (
                            <div className="col-span-2 text-center py-16 bg-slate-50 rounded-2xl border border-dashed">
                                <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                <h4 className="font-bold text-gray-600">Musobaqalar topilmadi</h4>
                                <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
                                    {competitions.length === 0
                                        ? "Hali hech qanday musobaqa yaratilmagan. Yuqoridagi tugma orqali yangi musobaqa qo'shing."
                                        : "Filtrga mos musobaqa topilmadi."}
                                </p>
                                {competitions.length === 0 && hasScoringAccess() && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-4 border-gray-300 text-gray-600"
                                        onClick={() => setIsConfiguring(true)}
                                    >
                                        Birinchi musobaqani yaratish
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TournamentScoring;
