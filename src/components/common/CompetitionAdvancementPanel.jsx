import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Trophy, ArrowRight, AlertTriangle, Lock, CheckCircle2, Wand2, Shuffle, History, ChevronDown, ChevronUp } from 'lucide-react';
import Button from './Button';
import Badge from './Badge';
import { db } from '../../services/db';
import { DEFAULT_ADVANCEMENT_TIEBREAK, TIEBREAK_PRIMARY_LABELS, TIEBREAK_FALLBACK_LABELS } from '../../config/competitionEngines';

// Matches a free-text group label (e.g. "Axborot texnologiyalari fakulteti") against a real faculty
// string (e.g. "Axborot texnologiyalari", the short-form convention db.getMockStudents() uses) —
// strips the "fakultet(i)"/"institut(i)" suffix words and compares case/whitespace-insensitively, with
// substring matching as a fallback for partial typing.
const normalizeFacultyText = (s) => (s || '')
    .toLowerCase()
    .replace(/\bfakultet(i)?\b/g, '')
    .replace(/\binstitut(i)?\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const facultyLabelsMatch = (a, b) => {
    const na = normalizeFacultyText(a);
    const nb = normalizeFacultyText(b);
    if (!na || !nb) return false;
    return na === nb || na.includes(nb) || nb.includes(na);
};

// Matches a free-text group label ("1-kurs", "I kurs", "1 kurs talabalari") against a real numeric
// course (1-4) — pulls out the first digit or a roman-numeral I-IV and compares. Kept independent of
// facultyLabelsMatch (a group can be by fakultet OR kurs, never both at once, admin's label decides
// which one actually matches — a label with no digit/numeral in it never matches a course).
const ROMAN_COURSE = { i: 1, ii: 2, iii: 3, iv: 4 };
const extractCourseNumber = (s) => {
    const text = (s || '').toLowerCase();
    const digitMatch = text.match(/\d+/);
    if (digitMatch) return Number(digitMatch[0]);
    const romanMatch = text.match(/\b(i|ii|iii|iv)\b/);
    return romanMatch ? ROMAN_COURSE[romanMatch[1]] : null;
};
const courseLabelsMatch = (label, course) => {
    if (course == null) return false;
    const n = extractCourseNumber(label);
    return n != null && n === Number(course);
};

// "Faoliyat tarixi" — same name-resolution idiom as CompetitionDelegationDrawer.jsx's resolveDisplayName
// (mock student pool first, real Supabase-synced profile pool as fallback, raw username as last resort).
const resolveActorName = (username) => {
    const student = db.getMockStudents().find(s => s.id === username);
    if (student) return student.fullName;
    const profile = db.getSyncedProfiles().find(p => p.username === username || p.id === username);
    if (profile) return profile.fullName;
    return username;
};
const GROUP_ACTION_LABELS = {
    CREATE_GROUP: 'Guruh qo\'shildi',
    DELETE_GROUP: 'Guruh o\'chirildi',
    ASSIGN: 'Biriktirildi',
    BULK_ASSIGN: 'Ommaviy biriktirildi',
    AUTO_ASSIGN: 'Avtomatik biriktirildi',
    RANDOM_ASSIGN: 'Tasodifiy taqsimlandi',
    SET_TOP_N: 'Top-N belgilandi',
    SET_TIEBREAK: "Tay-brek o'zgartirildi",
    SET_MERGE_POINT: 'Birlashish nuqtasi belgilandi',
    RESOLVE_TIEBREAK: 'Tengma-teng hal qilindi',
    FREEZE: 'Yakunlandi'
};

// UniQuiz per-faculty ("guruh") advancement — sits inside "Turlarni boshqarish" (CompetitionRoundsTab.jsx)
// for competitions matching isUniQuizStaged there. Owns: guruh (group) management, per-boundary topN
// rules, the tiebreak-mode mini-form, a LIVE ranking preview per group (db.computeFacultyAdvancement,
// never persisted until "Finalga chiqarish" is pressed), inline tie-resolution when a cutoff straddles a
// tied cluster, and the same flow one more time for Tur3/Final placement ("Yakuniy o'rinlar" tab).
const CompetitionAdvancementPanel = ({ competition, stages, canManageGroups, actingUsername, onUpdated }) => {
    const [version, setVersion] = useState(0);
    const [selectedBoundary, setSelectedBoundary] = useState(1); // 1..stages.length-1, or 'final'
    const [newGroupLabel, setNewGroupLabel] = useState('');
    const [selectedNewFaculties, setSelectedNewFaculties] = useState([]);
    const [splitByCourseToo, setSplitByCourseToo] = useState(false);
    const [selectedNewCourses, setSelectedNewCourses] = useState([]);
    const [selectedPureCourses, setSelectedPureCourses] = useState([]);
    const [randomConstraints, setRandomConstraints] = useState({ avoidFaculty: true, avoidCourse: true, balanceSizes: true });
    const [selectedParticipantIds, setSelectedParticipantIds] = useState([]);
    const [bulkTargetGroupId, setBulkTargetGroupId] = useState('');
    const [hideAssigned, setHideAssigned] = useState(false);
    const [tiebreakDraft, setTiebreakDraft] = useState(competition.advancementTiebreak || DEFAULT_ADVANCEMENT_TIEBREAK);
    const [pickOrder, setPickOrder] = useState([]); // in-progress "Qo'shimcha savol" judge ordering
    const [tiebreakSaved, setTiebreakSaved] = useState(false);
    const [showActivityLog, setShowActivityLog] = useState(false);

    const refresh = () => {
        setVersion(v => v + 1);
        onUpdated?.();
    };

    // Real activity log — every mutating action here (by admin OR a manage_groups delegate) gets one row,
    // so admin can always see what was actually done regardless of who did it (transparency requirement
    // for delegating this away). See db.js's logCompetitionGroupAction/getCompetitionGroupActionLogs.
    const logAction = (action, details) => {
        db.logCompetitionGroupAction(competition.id, action, details, actingUsername);
    };
    const groupLabelById = (groupId) => (db.getScoringGroups(competition.id).find(g => g.id === groupId)?.label) || groupId;

    // A group created via the checkbox pickers carries EXPLICIT matchFaculty/matchCourse — no text
    // guessing needed, and (unlike label text) a group can require BOTH at once ("Ommaviy huquq fakulteti
    // 1-kurs" — only a 1st-year Ommaviy huquq student matches, not every course at that faculty). A group
    // with neither set (every legacy group, and anything typed via the free-text "Boshqa nom" input) falls
    // back to the original label-text guess, unchanged.
    const groupMatchesParticipant = (group, inferredFaculty, inferredCourse) => {
        if (group.matchFaculty != null || group.matchCourse != null) {
            const facultyOk = group.matchFaculty == null || facultyLabelsMatch(group.matchFaculty, inferredFaculty);
            const courseOk = group.matchCourse == null || (inferredCourse != null && Number(group.matchCourse) === Number(inferredCourse));
            return facultyOk && courseOk;
        }
        return facultyLabelsMatch(group.label, inferredFaculty) || courseLabelsMatch(group.label, inferredCourse);
    };

    // Best-effort auto-assignment — matches each still-unassigned participant's inferred faculty/course
    // (db.inferTeamFaculty/inferTeamCourse for jamoa competitions; the participant's own real
    // `faculty`/`course` fields for individual ones) against each guruh's criteria, so admin doesn't have
    // to hand-pick every team one by one. NEVER overrides an existing assignment — manual correction/
    // override always wins, matching the explicit "hozirgi holat ham qolaversin" requirement. Reads fresh
    // from db.js directly (not the memoized `groups`/`groupMap`) so it can run synchronously right after a
    // group is created, before the next render recomputes those memos.
    const handleAutoAssignByFaculty = () => {
        const freshGroups = db.getScoringGroups(competition.id);
        const freshGroupMap = db.getParticipantGroupMap(competition.id);
        if (freshGroups.length === 0) return 0;
        let assignedCount = 0;
        competition.participants.forEach(p => {
            if (freshGroupMap.get(p.id)) return;
            const inferredFaculty = competition.type === 'team' ? db.inferTeamFaculty(p.id) : p.faculty;
            const inferredCourse = competition.type === 'team' ? db.inferTeamCourse(p.id) : p.course;
            const matchedGroup = freshGroups.find(g => groupMatchesParticipant(g, inferredFaculty, inferredCourse));
            if (matchedGroup) {
                db.setParticipantGroup(competition.id, p.id, matchedGroup.id, actingUsername);
                assignedCount++;
            }
        });
        if (assignedCount > 0) logAction('AUTO_ASSIGN', `${assignedCount} ta ishtirokchi fakultet/kurs bo'yicha avtomatik biriktirildi`);
        return assignedCount;
    };

    // "Aralash jamoalar" — real fakultet/kurs matnisiz, mavjud guruhlar orasida taqsimlash. Har bir shart
    // MUSTAQIL yoqib/o'chiriladigan checkbox (randomConstraints state, pastda UI'da ko'rinadi):
    //   avoidFaculty  — bir fakultetning jamoalari bitta guruhga to'planib qolmasin
    //   avoidCourse   — avoidFaculty bilan birga: bir xil fakultet+kurs ham alohida hisoblansin (nozikroq)
    //   balanceSizes  — guruhlar sonini imkon qadar teng ushlab turish
    // Barchasi o'chirilsa — sof tasodifiy (hech qanday cheklovsiz) taqsimlash bo'ladi.
    const shuffleArray = (arr) => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    };
    const handleRandomBalancedAssign = ({ avoidFaculty, avoidCourse, balanceSizes }) => {
        const freshGroups = db.getScoringGroups(competition.id);
        if (freshGroups.length < 2) return 'need_groups';
        const freshGroupMap = db.getParticipantGroupMap(competition.id);
        const unassigned = competition.participants.filter(p => !freshGroupMap.get(p.id));
        if (unassigned.length === 0) return 0;

        // The "crowding key" a group's running count is checked against before assigning — null means no
        // anti-clustering signal at all (pure random/balance-only). Bucketing (for queue interleaving)
        // uses the same key so a large source doesn't drain in one uninterrupted run.
        const crowdKey = (p) => {
            if (!avoidFaculty && !avoidCourse) return null;
            const faculty = avoidFaculty ? ((competition.type === 'team' ? db.inferTeamFaculty(p.id) : p.faculty) || '?') : '*';
            const course = avoidCourse ? ((competition.type === 'team' ? db.inferTeamCourse(p.id) : p.course) ?? '?') : '*';
            return `${faculty}::${course}`;
        };
        const buckets = new Map();
        shuffleArray(unassigned).forEach(p => {
            const key = crowdKey(p) ?? '__all__';
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key).push(p);
        });
        const bucketQueues = shuffleArray([...buckets.values()]);

        const counts = new Map(freshGroups.map(g => [g.id, 0]));
        // Per-group, per-crowdKey running counts — the actual anti-clustering lever when avoidFaculty
        // and/or avoidCourse is on. Target group is chosen by MINIMIZING how many of this team's own
        // key that group already has first, only falling back to overall group size (if balanceSizes is
        // on) as a tie-break — so a big source gets spread thin across every group before any one group
        // is allowed a second team from it, instead of just balancing totals.
        const crowdCounts = new Map(freshGroups.map(g => [g.id, new Map()]));
        let assignedCount = 0;
        let remaining = unassigned.length;
        while (remaining > 0) {
            for (const queue of bucketQueues) {
                if (queue.length === 0) continue;
                const p = queue.shift();
                const key = crowdKey(p);
                const target = shuffleArray(freshGroups).reduce((best, g) => {
                    if (key != null) {
                        const gC = crowdCounts.get(g.id).get(key) || 0;
                        const bestC = crowdCounts.get(best.id).get(key) || 0;
                        if (gC !== bestC) return gC < bestC ? g : best;
                    }
                    if (balanceSizes) return counts.get(g.id) < counts.get(best.id) ? g : best;
                    return best;
                });
                db.setParticipantGroup(competition.id, p.id, target.id, actingUsername);
                counts.set(target.id, counts.get(target.id) + 1);
                if (key != null) {
                    const tc = crowdCounts.get(target.id);
                    tc.set(key, (tc.get(key) || 0) + 1);
                }
                assignedCount++;
                remaining--;
            }
        }
        if (assignedCount > 0) {
            const parts = [];
            if (avoidFaculty) parts.push('fakultet');
            if (avoidCourse) parts.push('kurs');
            const constraintLabel = parts.length > 0 ? `(${parts.join('+')} to'planishi oldini olib)` : '(cheklovsiz)';
            logAction('RANDOM_ASSIGN', `${assignedCount} ta ishtirokchi tasodifiy taqsimlandi ${constraintLabel}`);
        }
        return assignedCount;
    };

    const participantName = (id) => {
        const p = competition.participants.find(pp => pp.id === id);
        if (!p) return id;
        return competition.type === 'team' ? p.name : p.fullName;
    };

    const actionLogs = useMemo(() => db.getCompetitionGroupActionLogs(competition.id), [competition.id, version]);
    const groups = useMemo(() => db.getScoringGroups(competition.id), [competition.id, version]);
    const groupMap = useMemo(() => db.getParticipantGroupMap(competition.id), [competition.id, version]);
    const groupCounts = useMemo(() => {
        const counts = new Map();
        competition.participants.forEach(p => {
            const gid = groupMap.get(p.id);
            if (gid) counts.set(gid, (counts.get(gid) || 0) + 1);
        });
        return counts;
    }, [competition.participants, groupMap]);
    // Stable "tartib raqami" — the team's own registration order in `competition.participants` (1-based),
    // computed BEFORE any list filtering below so it never shifts when "Faqat guruhsizlarni ko'rsatish" is
    // toggled on/off.
    const participantOrderIndex = useMemo(() => {
        const map = new Map();
        competition.participants.forEach((p, idx) => map.set(p.id, idx + 1));
        return map;
    }, [competition.participants]);
    const isFinal = selectedBoundary === 'final';

    const rules = useMemo(
        () => (!isFinal ? db.getAdvancementRules(competition.id, selectedBoundary) : []),
        [competition.id, selectedBoundary, isFinal, version]
    );

    const preview = useMemo(() => {
        if (isFinal) return db.computeFinalPlacement(competition.id);
        return db.computeFacultyAdvancement(competition.id, selectedBoundary);
    }, [competition.id, selectedBoundary, isFinal, version]);

    const freeze = useMemo(
        () => (isFinal ? db.getFinalPlacementFreeze(competition.id) : db.getAdvancementFreeze(competition.id, selectedBoundary)),
        [competition.id, selectedBoundary, isFinal, version]
    );

    // A frozen boundary's group/topN/tiebreak config is read-only — the outcome is already locked in.
    const isConfigLocked = !!freeze;

    // Per-boundary opt-out of guruh grouping (Breyn-ring's real pattern: guruhlash faqat 1-bosqichda,
    // keyingi bosqichlar umumiy havza) — see computeFacultyAdvancement's ungroupedBoundaries handling.
    // Absent/empty = every boundary respects real guruh (original UniQuiz behavior), unchanged default.
    // "Qaysi Turdan boshlab hammasi birlashadi?" — a single, plain-language control over the SAME
    // competition.ungroupedBoundaries field the advancement math already reads (computeFacultyAdvancement
    // etc. — untouched). Real guruh(fakultet) bosqichlari almost always merge at exactly one point (guruh
    // a'zoligi butun musobaqa uchun bitta, qayta bo'linmaydi), so one clear question replaces having to
    // click through every boundary pill and toggle an abstract "guruhlash ishlatilsinmi?" flag one by one —
    // the previous mechanism, which is exactly what caused a real mis-click (wrong boundary toggled).
    // `mergeFromTur` = null means "hali belgilanmagan" (every Tur still guruh-scoped, ungroupedBoundaries
    // empty) — matches CompetitionTurSchedule.jsx's own identical derivation for the Jadval tab.
    const mergeFromTur = (() => {
        const ungrouped = competition.ungroupedBoundaries || [];
        if (ungrouped.length === 0) return null;
        return Math.min(...ungrouped) + 1;
    })();
    const anyBoundaryFrozen = Array.from({ length: stages.length - 1 }, (_, i) => i + 1)
        .some(b => db.getAdvancementFreeze(competition.id, b));
    const handleSetMergeFromTur = async (turIndex) => {
        const next = turIndex === null ? [] : [turIndex - 1];
        await db.updateCompetition(competition.id, { ungroupedBoundaries: next });
        logAction('SET_MERGE_POINT', turIndex === null ? "Birlashish nuqtasi: hali yo'q" : `Birlashish nuqtasi: ${turIndex}-turdan`);
        refresh();
    };

    const handleAddGroup = () => {
        if (!newGroupLabel.trim()) return;
        db.upsertScoringGroup(competition.id, { label: newGroupLabel.trim() }, actingUsername);
        logAction('CREATE_GROUP', `Guruh qo'shildi: "${newGroupLabel.trim()}"`);
        setNewGroupLabel('');
        handleAutoAssignByFaculty(); // the new group's label might now match previously-unassigned teams
        refresh();
    };

    // Real, distinct faculties inferred from THIS competition's own participants (same source
    // handleAutoAssignByFaculty already trusts) minus any faculty a group already exists for — a
    // checkbox picker over this list can't typo a name or duplicate an existing group, unlike the
    // free-text input above/below it (kept for kurs labels and any name that isn't a real faculty).
    const availableFaculties = useMemo(() => {
        const seen = new Set();
        const result = [];
        competition.participants.forEach(p => {
            const faculty = competition.type === 'team' ? db.inferTeamFaculty(p.id) : p.faculty;
            if (!faculty || seen.has(faculty)) return;
            seen.add(faculty);
            if (!groups.some(g => facultyLabelsMatch(g.label, faculty))) result.push(faculty);
        });
        return result.sort();
    }, [competition.participants, competition.type, groups]);

    // Unfiltered — every real faculty regardless of whether a (plain) group already exists for it. Needed
    // for the "kurslar bo'yicha ham ajratish" compound mode: a faculty that already has a PLAIN group (no
    // matchCourse) should still be pickable to additionally create its per-kurs compound groups — using
    // `availableFaculties` there would hide the whole faculty list the moment every faculty had any group
    // at all, exactly the bug that made this checkbox picker disappear once faculties were already added.
    const allFaculties = useMemo(() => {
        const seen = new Set();
        const result = [];
        competition.participants.forEach(p => {
            const faculty = competition.type === 'team' ? db.inferTeamFaculty(p.id) : p.faculty;
            if (!faculty || seen.has(faculty)) return;
            seen.add(faculty);
            result.push(faculty);
        });
        return result.sort();
    }, [competition.participants, competition.type]);

    // Every real, distinct course among this competition's participants — used both as the faculty
    // picker's "kurslar bo'yicha ham ajratish" sub-option (unfiltered, since the SAME course combined with
    // a DIFFERENT faculty is still a distinct, valid group) and as the standalone pure-kurs picker below
    // (filtered to courses that don't already have a pure — no faculty — group).
    const allCourses = useMemo(() => {
        const seen = new Set();
        const result = [];
        competition.participants.forEach(p => {
            const course = competition.type === 'team' ? db.inferTeamCourse(p.id) : p.course;
            if (course == null || seen.has(course)) return;
            seen.add(course);
            result.push(course);
        });
        return result.sort((a, b) => a - b);
    }, [competition.participants, competition.type]);
    const availablePureCourses = useMemo(
        () => allCourses.filter(c => !groups.some(g => g.matchCourse === c && g.matchFaculty == null)),
        [allCourses, groups]
    );

    const handleToggleFacultyCheckbox = (faculty) => {
        setSelectedNewFaculties(prev => prev.includes(faculty) ? prev.filter(f => f !== faculty) : [...prev, faculty]);
    };
    const handleToggleNewCourseCheckbox = (course) => {
        setSelectedNewCourses(prev => prev.includes(course) ? prev.filter(c => c !== course) : [...prev, course]);
    };
    const handleTogglePureCourseCheckbox = (course) => {
        setSelectedPureCourses(prev => prev.includes(course) ? prev.filter(c => c !== course) : [...prev, course]);
    };

    // With "kurslar bo'yicha ham ajratish" ON and at least one kurs ticked, creates the FULL combination
    // (har tanlangan fakultet x har tanlangan kurs) as compound, explicitly-matched groups — e.g. 2
    // fakultet x 2 kurs ticked = 4 groups, each requiring BOTH to match on auto-assign. Off (or no kurs
    // ticked) behaves exactly as before: one group per fakultet alone.
    const handleAddSelectedFacultyGroups = () => {
        if (selectedNewFaculties.length === 0) return;
        let created = 0;
        if (splitByCourseToo && selectedNewCourses.length > 0) {
            selectedNewFaculties.forEach(faculty => {
                selectedNewCourses.forEach(course => {
                    db.upsertScoringGroup(competition.id, { label: `${faculty} — ${course}-kurs`, matchFaculty: faculty, matchCourse: course }, actingUsername);
                    created++;
                });
            });
        } else {
            selectedNewFaculties.forEach(faculty => {
                db.upsertScoringGroup(competition.id, { label: faculty, matchFaculty: faculty }, actingUsername);
                created++;
            });
        }
        logAction('CREATE_GROUP', `${created} ta fakultet guruhi qo'shildi (${selectedNewFaculties.join(', ')})`);
        setSelectedNewFaculties([]);
        setSelectedNewCourses([]);
        handleAutoAssignByFaculty();
        refresh();
    };

    // Standalone — kurs bo'yicha, fakultetga bog'liq bo'lmagan guruh(lar) (masalan "hamma fakultetning
    // 1-kursi bitta guruhda saralansin" holati uchun).
    const handleAddSelectedPureCourseGroups = () => {
        if (selectedPureCourses.length === 0) return;
        selectedPureCourses.forEach(course => {
            db.upsertScoringGroup(competition.id, { label: `${course}-kurs`, matchCourse: course }, actingUsername);
        });
        logAction('CREATE_GROUP', `${selectedPureCourses.length} ta kurs guruhi qo'shildi (${selectedPureCourses.join(', ')})`);
        setSelectedPureCourses([]);
        handleAutoAssignByFaculty();
        refresh();
    };

    const handleDeleteGroup = (groupId) => {
        try {
            const label = groupLabelById(groupId);
            db.deleteScoringGroup(competition.id, groupId);
            logAction('DELETE_GROUP', `Guruh o'chirildi: "${label}"`);
            refresh();
        } catch (e) {
            alert(e.message);
        }
    };

    const handleAssignGroup = (participantId, groupId) => {
        db.setParticipantGroup(competition.id, participantId, groupId || null, actingUsername);
        logAction('ASSIGN', `${participantName(participantId)} → ${groupId ? groupLabelById(groupId) : "guruhsiz"}`);
        refresh();
    };

    // Bulk version of the same call — for 30-50 jamoa, ticking several rows and assigning them all to one
    // guruh in a single click is far faster than opening each row's own dropdown one at a time (which is
    // still there, unchanged, for one-off corrections).
    const handleBulkAssignGroup = () => {
        if (!bulkTargetGroupId || selectedParticipantIds.length === 0) return;
        selectedParticipantIds.forEach(pid => db.setParticipantGroup(competition.id, pid, bulkTargetGroupId, actingUsername));
        logAction('BULK_ASSIGN', `${selectedParticipantIds.length} ta ishtirokchi → ${groupLabelById(bulkTargetGroupId)}`);
        setSelectedParticipantIds([]);
        refresh();
    };
    const toggleParticipantSelected = (pid) => {
        setSelectedParticipantIds(prev => prev.includes(pid) ? prev.filter(id => id !== pid) : [...prev, pid]);
    };

    const handleSetTopN = (groupId, value) => {
        const n = value === '' ? null : Number(value);
        if (n !== null && (!Number.isFinite(n) || n < 0)) return;
        db.setAdvancementRule(competition.id, selectedBoundary, groupId, n, actingUsername);
        logAction('SET_TOP_N', `${groupLabelById(groupId)}: top-${n ?? '—'} (bosqich ${selectedBoundary})`);
        refresh();
    };

    const handleSaveTiebreak = async () => {
        await db.updateCompetition(competition.id, { advancementTiebreak: tiebreakDraft });
        logAction('SET_TIEBREAK', "Tay-brek sozlamasi o'zgartirildi");
        refresh();
        setTiebreakSaved(true);
        setTimeout(() => setTiebreakSaved(false), 1800);
    };

    const handlePickParticipant = (id) => {
        setPickOrder(prev => (prev.includes(id) ? prev : [...prev, id]));
    };

    const handleSaveResolution = (groupKey, tiedParticipantIds) => {
        if (pickOrder.length !== tiedParticipantIds.length) return;
        db.recordTiebreakResolution(
            competition.id,
            { context: isFinal ? 'final_placement' : 'advancement', turBoundary: isFinal ? null : selectedBoundary, groupKey, tiedParticipantIds, resolvedOrder: pickOrder },
            actingUsername
        );
        logAction('RESOLVE_TIEBREAK', `Tengma-teng natija hal qilindi (${tiedParticipantIds.length} ishtirokchi)`);
        setPickOrder([]);
        refresh();
    };

    const handleFreeze = () => {
        try {
            if (isFinal) db.freezeFinalPlacement(competition.id, actingUsername);
            else db.freezeAdvancement(competition.id, selectedBoundary, actingUsername);
            logAction('FREEZE', isFinal ? "Yakuniy o'rinlar chiqarildi" : `Finalga chiqarildi (bosqich ${selectedBoundary})`);
            refresh();
        } catch (e) {
            alert(e.message);
        }
    };

    const boundaryCount = stages.length - 1;
    if (boundaryCount < 1) return null;

    const unassignedNames = (preview?.unassignedParticipantIds || []).map(participantName);
    const anyGroupBlocked = !isFinal && preview?.groups?.some(g => g.topN == null || g.cutoffTieUnresolved || g.insufficientData);
    const finalBlocked = isFinal && preview?.unresolvedClusters?.length > 0;
    const freezeDisabled = isConfigLocked || (preview?.unassignedParticipantIds?.length > 0) || anyGroupBlocked || finalBlocked;

    return (
        <div className="border-t border-gray-100 pt-6 space-y-5">
            <div>
                <h3 className="font-bold text-lg text-gray-900">Guruh bosqichlari — Turlararo saralash</h3>
                <p className="text-xs text-gray-400">Fakultet yoki kurs bo'yicha — har guruh uchun alohida top-N va saralanish holati</p>
            </div>

            {/* Boundary/"Yakuniy o'rinlar" tab row */}
            <div className="flex items-center gap-1.5 flex-wrap">
                {Array.from({ length: boundaryCount }, (_, i) => i + 1).map(b => (
                    <button
                        key={b}
                        type="button"
                        onClick={() => { setSelectedBoundary(b); setPickOrder([]); }}
                        className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-all border flex items-center gap-1.5 ${
                            selectedBoundary === b
                                ? 'bg-indigo-700 border-indigo-700 text-white'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        {stages[b - 1]?.label} <ArrowRight size={11} /> {stages[b]?.label}
                        {db.getAdvancementFreeze(competition.id, b) && <Lock size={11} />}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => { setSelectedBoundary('final'); setPickOrder([]); }}
                    className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-all border flex items-center gap-1.5 ${
                        selectedBoundary === 'final'
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    <Trophy size={11} /> Yakuniy o'rinlar
                    {db.getFinalPlacementFreeze(competition.id) && <Lock size={11} />}
                </button>
            </div>

            <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-2">
                <p className="text-xs font-semibold text-gray-700">
                    Qaysi Turdan boshlab hamma guruh (fakultet) bitta umumiy ro'yxatga birlashadi?
                    <span className="block text-[10px] font-normal text-gray-400 mt-0.5">
                        Tanlangan Turgacha har guruh o'z ichida alohida saralanadi; tanlangan Tur va undan keyingisi — hammasi birga, umumiy reyting bo'yicha.
                    </span>
                </p>
                <div className="flex gap-1.5 flex-wrap">
                    <button
                        type="button"
                        disabled={anyBoundaryFrozen || !canManageGroups()}
                        onClick={() => handleSetMergeFromTur(null)}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all border disabled:opacity-40 disabled:cursor-not-allowed ${
                            mergeFromTur === null ? 'bg-indigo-700 border-indigo-700 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        Hali yo'q
                    </button>
                    {Array.from({ length: stages.length - 1 }, (_, i) => i + 2).map(turIndex => (
                        <button
                            key={turIndex}
                            type="button"
                            disabled={anyBoundaryFrozen || !canManageGroups()}
                            onClick={() => handleSetMergeFromTur(turIndex)}
                            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all border disabled:opacity-40 disabled:cursor-not-allowed ${
                                mergeFromTur === turIndex ? 'bg-indigo-700 border-indigo-700 text-white' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            {turIndex}-turdan
                        </button>
                    ))}
                </div>
                {anyBoundaryFrozen && (
                    <p className="text-[10px] text-amber-600 font-semibold">Allaqachon "Finalga chiqarish" bosilgan chegara(lar) bor — bu sozlama endi o'zgartirilmaydi.</p>
                )}
            </div>

            {/* Guruhlarni boshqarish */}
            <div className="p-4 bg-slate-50 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-gray-700">Guruhlarni boshqarish</h4>
                {groups.length === 0 && (
                    <p className="text-[11px] text-gray-500">
                        Hech qanday guruh yo'q — barcha ishtirokchilar <b>bitta umumiy</b> ro'yxatda saralanadi (Kubok uslubi). Fakultet/kurs bo'yicha alohida saralash kerak bo'lsa, pastdan guruh qo'shing (Bosqichli uslubga o'tadi).
                    </p>
                )}
                <div className="flex flex-wrap gap-2">
                    {groups.map(g => (
                        <span key={g.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border rounded-xl text-xs font-bold text-gray-700">
                            {g.label}
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-md text-[10px] font-extrabold">
                                {groupCounts.get(g.id) || 0}
                            </span>
                            {canManageGroups() && (
                                <button type="button" onClick={() => handleDeleteGroup(g.id)} className="text-gray-300 hover:text-red-500">
                                    <Trash2 size={11} />
                                </button>
                            )}
                        </span>
                    ))}
                </div>
                {canManageGroups() && allFaculties.length > 0 && (
                    <div className="p-3 bg-white border border-gray-200 rounded-xl space-y-2">
                        <p className="text-[11px] font-bold text-gray-600">Ro'yxatdan tayyor tanlang (ishtirokchilarning haqiqiy fakultetlari)</p>
                        {availableFaculties.length === 0 && !splitByCourseToo && (
                            <p className="text-[10px] text-gray-400">
                                Har bir fakultet uchun allaqachon guruh bor. Kurs bo'yicha ham aniqroq ajratish kerak bo'lsa, pastdagi belgini yoqing.
                            </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {(splitByCourseToo ? allFaculties : availableFaculties).map(faculty => (
                                <label
                                    key={faculty}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                                        selectedNewFaculties.includes(faculty) ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedNewFaculties.includes(faculty)}
                                        onChange={() => handleToggleFacultyCheckbox(faculty)}
                                        className="w-3.5 h-3.5"
                                    />
                                    {faculty}
                                </label>
                            ))}
                        </div>

                        {allCourses.length > 0 && (
                            <div className="pt-2 border-t border-gray-100 space-y-2">
                                <label className="flex items-center gap-2 text-[11px] font-semibold text-gray-600 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={splitByCourseToo}
                                        onChange={e => { setSplitByCourseToo(e.target.checked); if (!e.target.checked) setSelectedNewCourses([]); }}
                                        className="w-3.5 h-3.5"
                                    />
                                    Kurslar bo'yicha ham ajratilsinmi? (masalan "Ommaviy huquq fakulteti — 1-kurs")
                                </label>
                                {splitByCourseToo && (
                                    <div className="flex flex-wrap gap-2 pl-5">
                                        {allCourses.map(course => (
                                            <label
                                                key={course}
                                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                                                    selectedNewCourses.includes(course) ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedNewCourses.includes(course)}
                                                    onChange={() => handleToggleNewCourseCheckbox(course)}
                                                    className="w-3.5 h-3.5"
                                                />
                                                {course}-kurs
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <Button
                            variant="outline" size="sm" icon={Plus}
                            disabled={selectedNewFaculties.length === 0}
                            onClick={handleAddSelectedFacultyGroups}
                        >
                            {splitByCourseToo && selectedNewCourses.length > 0
                                ? `Tanlangan ${selectedNewFaculties.length} fakultet × ${selectedNewCourses.length} kursni guruh sifatida qo'shish`
                                : `Tanlangan ${selectedNewFaculties.length > 0 ? `${selectedNewFaculties.length} ta ` : ''}fakultetni guruh sifatida qo'shish`}
                        </Button>
                    </div>
                )}

                {canManageGroups() && availablePureCourses.length > 0 && (
                    <div className="p-3 bg-white border border-gray-200 rounded-xl space-y-2">
                        <p className="text-[11px] font-bold text-gray-600">Kurs kesimida (fakultetsiz — masalan hamma fakultetning 1-kursi birga)</p>
                        <div className="flex flex-wrap gap-2">
                            {availablePureCourses.map(course => (
                                <label
                                    key={course}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                                        selectedPureCourses.includes(course) ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedPureCourses.includes(course)}
                                        onChange={() => handleTogglePureCourseCheckbox(course)}
                                        className="w-3.5 h-3.5"
                                    />
                                    {course}-kurs
                                </label>
                            ))}
                        </div>
                        <Button
                            variant="outline" size="sm" icon={Plus}
                            disabled={selectedPureCourses.length === 0}
                            onClick={handleAddSelectedPureCourseGroups}
                        >
                            Tanlangan {selectedPureCourses.length > 0 ? `${selectedPureCourses.length} ta ` : ''}kursni guruh sifatida qo'shish
                        </Button>
                    </div>
                )}

                {canManageGroups() && (
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newGroupLabel}
                            onChange={e => setNewGroupLabel(e.target.value)}
                            placeholder="Boshqa nom (masalan: yo'nalish, yoki erkin guruh nomi)"
                            className="flex-1 px-3 py-1.5 border rounded-lg text-xs"
                        />
                        <Button variant="outline" size="sm" icon={Plus} onClick={handleAddGroup}>Guruh qo'shish</Button>
                    </div>
                )}
                <p className="text-[10px] text-gray-400">
                    Erkin nomli guruhlar (masalan akademik yo'nalish bo'yicha — platformada bunday ma'lumot hali real saqlanmagani uchun avtomatik aniqlanmaydi) faqat pastdan qo'lda biriktiriladi. Fakultet/kurs checkbox orqali qo'shilganlar esa aniq mos kelsa avtomatik biriktiriladi.
                </p>
                {groups.length > 0 && canManageGroups() && (
                    <>
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-200 flex-wrap">
                            <span className="text-[11px] text-gray-500">Ro'yxatni fakultet/kurs bo'yicha qayta tekshirish</span>
                            <Button
                                variant="ghost" size="sm" icon={Wand2}
                                onClick={() => {
                                    const n = handleAutoAssignByFaculty();
                                    refresh();
                                    if (n === 0) alert("Mos fakultet/kurs topilmadi yoki barcha ishtirokchilar allaqachon biriktirilgan — qolganlarini pastdan qo'lda tanlang.");
                                }}
                            >
                                Avtomatik biriktirish
                            </Button>
                        </div>

                        {/* Aralash jamoalar — real fakultet/kursga qarab MOS keladigan guruhga emas, mavjud
                            guruhlar orasida taqsimlaydi. Har bir shart o'z checkboxi — natijaga qanday
                            ta'sir qilishini bosishdan oldin ko'rib, kerakligini o'zi tanlaydi. */}
                        <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl space-y-2">
                            <p className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                                <Shuffle size={13} /> Aralash taqsimlash — cheklovlar
                            </p>
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={randomConstraints.avoidFaculty}
                                        onChange={e => setRandomConstraints(c => ({ ...c, avoidFaculty: e.target.checked, avoidCourse: e.target.checked ? c.avoidCourse : false }))}
                                        className="w-3.5 h-3.5"
                                    />
                                    Bir fakultetning jamoalari bitta guruhga to'planib qolmasin
                                </label>
                                <label className={`flex items-center gap-2 text-[11px] cursor-pointer ${randomConstraints.avoidFaculty ? 'text-gray-600' : 'text-gray-300 cursor-not-allowed'}`}>
                                    <input
                                        type="checkbox"
                                        checked={randomConstraints.avoidCourse}
                                        disabled={!randomConstraints.avoidFaculty}
                                        onChange={e => setRandomConstraints(c => ({ ...c, avoidCourse: e.target.checked }))}
                                        className="w-3.5 h-3.5"
                                    />
                                    Bir xil fakultet + kurs ham alohida hisoblansin (nozikroq)
                                </label>
                                <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={randomConstraints.balanceSizes}
                                        onChange={e => setRandomConstraints(c => ({ ...c, balanceSizes: e.target.checked }))}
                                        className="w-3.5 h-3.5"
                                    />
                                    Guruhlar sonini imkon qadar teng ushlab turish
                                </label>
                            </div>
                            <Button
                                variant="outline" size="sm" icon={Shuffle}
                                onClick={() => {
                                    const n = handleRandomBalancedAssign(randomConstraints);
                                    if (n === 'need_groups') { alert("Kamida 2 ta guruh kerak."); return; }
                                    refresh();
                                    if (n === 0) alert('Guruhsiz ishtirokchi qolmagan.');
                                    else alert(`${n} ta ishtirokchi guruhlar orasida taqsimlandi.`);
                                }}
                            >
                                Tanlangan shartlar bilan taqsimlash
                            </Button>
                        </div>

                        {/* Bulk assign — tick several rows below, pick a guruh here, one click assigns all of
                            them at once (instead of opening each row's own dropdown one by one). */}
                        <div className="flex items-center gap-2 flex-wrap p-2.5 bg-white border border-dashed border-gray-200 rounded-xl">
                            <span className="text-[11px] font-semibold text-gray-600 shrink-0">
                                Tanlangan: {selectedParticipantIds.length}
                            </span>
                            <select
                                value={bulkTargetGroupId}
                                onChange={e => setBulkTargetGroupId(e.target.value)}
                                className="px-2 py-1 border rounded-lg text-xs flex-1 min-w-[140px]"
                            >
                                <option value="">Guruh tanlang...</option>
                                {groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                            </select>
                            <Button
                                variant="outline" size="sm"
                                disabled={selectedParticipantIds.length === 0 || !bulkTargetGroupId}
                                onClick={handleBulkAssignGroup}
                            >
                                Tanlanganlarni biriktirish
                            </Button>
                            <label className="flex items-center gap-1.5 text-[11px] text-gray-500 ml-auto cursor-pointer">
                                <input type="checkbox" checked={hideAssigned} onChange={e => setHideAssigned(e.target.checked)} className="w-3.5 h-3.5" />
                                Faqat guruhsizlarni ko'rsatish
                            </label>
                        </div>

                        <div className="space-y-1.5 max-h-80 overflow-y-auto">
                            {competition.participants
                                .filter(p => !hideAssigned || !groupMap.get(p.id))
                                .map(p => {
                                const inferredFaculty = competition.type === 'team' ? db.inferTeamFaculty(p.id) : p.faculty;
                                const inferredCourse = competition.type === 'team' ? db.inferTeamCourse(p.id) : p.course;
                                const inferredHint = [inferredFaculty, inferredCourse != null ? `${inferredCourse}-kurs` : null].filter(Boolean).join(', ');
                                return (
                                    <div key={p.id} className="flex items-center justify-between gap-3 text-xs">
                                        <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedParticipantIds.includes(p.id)}
                                                onChange={() => toggleParticipantSelected(p.id)}
                                                className="w-3.5 h-3.5 shrink-0"
                                            />
                                            <span className="text-gray-400 font-mono text-[10px] shrink-0 w-6 text-right">
                                                {participantOrderIndex.get(p.id)}.
                                            </span>
                                            <span className="font-semibold text-gray-700 truncate">
                                                {participantName(p.id)}
                                                {inferredHint && !groupMap.get(p.id) && (
                                                    <span className="ml-1.5 text-[10px] font-normal text-gray-400">({inferredHint})</span>
                                                )}
                                            </span>
                                        </label>
                                        <select
                                            value={groupMap.get(p.id) || ''}
                                            onChange={e => handleAssignGroup(p.id, e.target.value)}
                                            className="px-2 py-1 border rounded-lg text-xs shrink-0"
                                        >
                                            <option value="">Guruh tanlanmagan</option>
                                            {groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                                        </select>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* Tay-brek sozlamalari */}
            <div className="p-4 bg-slate-50 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-gray-700">Tay-brek (teng ball hal qilish)</h4>
                {isConfigLocked && (
                    <p className="text-[11px] text-amber-600 flex items-center gap-1"><Lock size={11} /> Bu bosqich uchun natija allaqachon belgilangan — sozlamalar qulflangan</p>
                )}
                <div className="flex flex-wrap gap-4 text-xs">
                    <div>
                        <label className="block font-bold text-gray-500 mb-1">Asosiy usul</label>
                        <select
                            disabled={isConfigLocked || !canManageGroups()}
                            value={tiebreakDraft.primaryMethod}
                            onChange={e => setTiebreakDraft(d => ({ ...d, primaryMethod: e.target.value }))}
                            className="px-2 py-1.5 border rounded-lg"
                        >
                            {Object.entries(TIEBREAK_PRIMARY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                    </div>
                    {tiebreakDraft.primaryMethod === 'lastN' && (
                        <div>
                            <label className="block font-bold text-gray-500 mb-1">N (nechta savol)</label>
                            <input
                                type="number"
                                min={1}
                                disabled={isConfigLocked || !canManageGroups()}
                                value={tiebreakDraft.lastN}
                                onChange={e => setTiebreakDraft(d => ({ ...d, lastN: Number(e.target.value) || 1 }))}
                                className="w-20 px-2 py-1.5 border rounded-lg"
                            />
                        </div>
                    )}
                    <div>
                        <label className="block font-bold text-gray-500 mb-1">Agar shu ham teng bo'lsa</label>
                        <select
                            disabled={isConfigLocked || !canManageGroups()}
                            value={tiebreakDraft.fallbackMethod}
                            onChange={e => setTiebreakDraft(d => ({ ...d, fallbackMethod: e.target.value }))}
                            className="px-2 py-1.5 border rounded-lg"
                        >
                            {Object.entries(TIEBREAK_FALLBACK_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                    </div>
                    {!isConfigLocked && canManageGroups() && (
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={handleSaveTiebreak}>Saqlash</Button>
                            {tiebreakSaved && (
                                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 animate-fade-in">
                                    <CheckCircle2 size={12} /> Saqlandi
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {unassignedNames.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs font-semibold text-amber-700 flex items-center gap-2">
                    <AlertTriangle size={14} /> Guruhga biriktirilmagan: {unassignedNames.join(', ')}
                </div>
            )}

            {/* Live ranking preview */}
            {!isFinal && preview?.groups?.map(g => (
                <div key={g.groupId} className="border rounded-2xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-white border-b flex items-center justify-between gap-3 flex-wrap">
                        <span className="font-bold text-sm text-gray-800">{g.groupLabel}</span>
                        {canManageGroups() && !isConfigLocked ? (
                            <div className="flex items-center gap-2 text-xs">
                                <span className="text-gray-500">Top N:</span>
                                <input
                                    type="number"
                                    min={0}
                                    value={g.topN ?? ''}
                                    onChange={e => handleSetTopN(g.groupId, e.target.value)}
                                    className="w-16 px-2 py-1 border rounded-lg text-center"
                                />
                            </div>
                        ) : (
                            <Badge variant="info" size="sm">Top {g.topN ?? '—'}</Badge>
                        )}
                    </div>
                    {g.insufficientData && (
                        <div className="p-3 bg-slate-50 border-b text-[11px] font-semibold text-gray-500 flex items-center gap-2">
                            <AlertTriangle size={12} /> Hali natija kiritilmagan — barcha jamoalar teng, kim o'tishi hozircha aniqlanmaydi
                        </div>
                    )}
                    <div className="divide-y">
                        {g.ranked.map((pid, idx) => {
                            const isAdvancing = g.advancing.includes(pid);
                            return (
                                <div key={pid} className="flex items-center justify-between px-4 py-2 text-xs">
                                    <span className="flex items-center gap-2">
                                        <span className="text-gray-400 font-bold w-5">{idx + 1}</span>
                                        <span className="font-semibold text-gray-800">{participantName(pid)}</span>
                                    </span>
                                    {g.insufficientData ? (
                                        <Badge variant="default" size="sm">Kutilmoqda</Badge>
                                    ) : isAdvancing ? (
                                        <Badge variant="success" size="sm">O'tadi</Badge>
                                    ) : (
                                        <Badge variant="default" size="sm">Chiqib ketadi</Badge>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {g.cutoffTieUnresolved && (
                        <div className="p-3 bg-red-50 border-t border-red-100 space-y-2">
                            <p className="text-[11px] font-bold text-red-700 flex items-center gap-1">
                                <AlertTriangle size={12} /> Teng ball — kim o'tishini tartib bilan bosib belgilang
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {g.unresolvedParticipantIds.map(pid => (
                                    <button
                                        key={pid}
                                        type="button"
                                        onClick={() => handlePickParticipant(pid)}
                                        disabled={pickOrder.includes(pid)}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                                            pickOrder.includes(pid) ? 'bg-indigo-100 border-indigo-200 text-indigo-400' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                        }`}
                                    >
                                        {pickOrder.includes(pid) ? `${pickOrder.indexOf(pid) + 1}. ` : ''}{participantName(pid)}
                                    </button>
                                ))}
                            </div>
                            {canManageGroups() && (
                                <Button
                                    variant="outline" size="sm"
                                    disabled={pickOrder.length !== g.unresolvedParticipantIds.length}
                                    onClick={() => handleSaveResolution(g.groupId, g.unresolvedParticipantIds)}
                                >
                                    Tartibni saqlash
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            ))}

            {isFinal && preview && (
                <div className="border rounded-2xl overflow-hidden">
                    <div className="divide-y">
                        {preview.placements.sort((a, b) => a.rank - b.rank).map(p => (
                            <div key={p.participantId} className="flex items-center justify-between px-4 py-2 text-xs">
                                <span className="flex items-center gap-2">
                                    <span className="text-gray-400 font-bold w-6">
                                        {p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `#${p.rank}`}
                                    </span>
                                    <span className="font-semibold text-gray-800">{participantName(p.participantId)}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                    {preview.unresolvedClusters.map(cluster => (
                        <div key={cluster.groupKey} className="p-3 bg-red-50 border-t border-red-100 space-y-2">
                            <p className="text-[11px] font-bold text-red-700 flex items-center gap-1">
                                <AlertTriangle size={12} /> {cluster.startRank}-o'rin uchun teng ball — tartib bilan bosib belgilang
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {cluster.participantIds.map(pid => (
                                    <button
                                        key={pid}
                                        type="button"
                                        onClick={() => handlePickParticipant(pid)}
                                        disabled={pickOrder.includes(pid)}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                                            pickOrder.includes(pid) ? 'bg-indigo-100 border-indigo-200 text-indigo-400' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                        }`}
                                    >
                                        {pickOrder.includes(pid) ? `${pickOrder.indexOf(pid) + 1}. ` : ''}{participantName(pid)}
                                    </button>
                                ))}
                            </div>
                            {canManageGroups() && (
                                <Button
                                    variant="outline" size="sm"
                                    disabled={pickOrder.length !== cluster.participantIds.length}
                                    onClick={() => handleSaveResolution(cluster.groupKey, cluster.participantIds)}
                                >
                                    Tartibni saqlash
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {canManageGroups() && (
                <div className="flex items-center gap-3">
                    <Button
                        variant="primary"
                        icon={isConfigLocked ? CheckCircle2 : Trophy}
                        disabled={freezeDisabled}
                        onClick={handleFreeze}
                        title={freezeDisabled && !isConfigLocked ? "Avval barcha guruhlarga topN belgilang, teng ballarni hal qiling va hamma ishtirokchini guruhga biriktiring" : undefined}
                    >
                        {isConfigLocked ? "Natija belgilangan" : isFinal ? "Yakuniy o'rinlarni belgilash" : "Finalga chiqarish"}
                    </Button>
                    {isConfigLocked && <span className="text-[11px] text-gray-400">{new Date(freeze.frozenAt).toLocaleString('uz-UZ')} — {freeze.frozenBy}</span>}
                </div>
            )}

            {/* Faoliyat tarixi — kim (admin yoki manage_groups vakili) nima qilgani, "ma'lumotlar oshkor
                bo'lishining oldini olish" maqsadida: vakolat berilgan bo'lsa ham, admin har doim buni
                ko'rib turadi. */}
            {canManageGroups() && (
                <div className="border-t border-gray-100 pt-4">
                    <button
                        type="button"
                        onClick={() => setShowActivityLog(v => !v)}
                        className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-gray-700"
                    >
                        <History size={14} />
                        Faoliyat tarixi ({actionLogs.length})
                        {showActivityLog ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    {showActivityLog && (
                        <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto">
                            {actionLogs.length === 0 ? (
                                <p className="text-[11px] text-gray-400">Hali hech qanday harakat qayd etilmagan.</p>
                            ) : (
                                actionLogs.map(log => (
                                    <div key={log.id} className="flex items-start justify-between gap-3 text-[11px] p-2 bg-slate-50 rounded-lg">
                                        <div className="min-w-0">
                                            <span className="font-bold text-gray-700">{resolveActorName(log.actingUsername)}</span>
                                            <span className="text-gray-400"> — {GROUP_ACTION_LABELS[log.action] || log.action}: </span>
                                            <span className="text-gray-600">{log.details}</span>
                                        </div>
                                        <span className="text-gray-400 shrink-0">{new Date(log.time).toLocaleString('uz-UZ')}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CompetitionAdvancementPanel;
