import React, { useState, useMemo, useCallback } from 'react';
import {
    Users, Target, AlertTriangle, CheckCircle, XCircle, CalendarClock, Info,
    Loader2, ChevronRight, TrendingUp, TrendingDown, Minus, Trophy, Activity,
    Award, Paperclip
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import {
    ASSIGNMENT_ROLES, TALENT_PROGRAMS, POTENTIAL_GRADES, TALENT_SCORE_MAX,
    GOAL_STATUS, GOAL_CATEGORIES, TARGET_STATUS, MONITORING_FLAGS,
    MONITORING_PURPOSE, NO_PUNISHMENT_NOTE, goalTiming, getStateAward,
} from '../../config/talent';
import {
    collectDimensionValues, computeTalentScore, computeIdpProgress, computeReadiness,
} from '../../utils/talentScoring';
import { buildStudentEligibilityProfile } from '../../utils/scholarshipEligibility';

// "Mening shogirdlarim" — mentor, tyutor va ilmiy rahbar uchun yagona ish maydoni.
//
// Vakolat ROLGA emas, BIRIKTIRUVGA bog'liq: kim biriktirilgan bo'lsa, o'sha
// faqat o'z shogirdlarini ko'radi (§69). Platformada hali tyutor/ilmiy rahbar
// rollari yo'q, shuning uchun sahifa har uch rol uchun bitta.
//
// MUHIM: bu ekran mentorni BAHOLAMAYDI va jazolamaydi (§43). U shogirdga
// qayerda yordam kerakligini ko'rsatish uchun.

const MyMenteesPage = () => {
    const { user } = useAuth();
    const [version, setVersion] = useState(0);
    const bump = useCallback(() => setVersion(v => v + 1), []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [flash, setFlash] = useState('');
    const [selected, setSelected] = useState(null);
    const [roleFilter, setRoleFilter] = useState('all');

    const run = async (fn, successMsg) => {
        setBusy(true); setError(''); setFlash('');
        try {
            await fn();
            bump();
            if (successMsg) setFlash(successMsg);
        } catch (e) {
            console.error('[shogirdlar] amal bajarilmadi:', e);
            setError(e.message || String(e));
        } finally { setBusy(false); }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const myAssignments = useMemo(() => db.getMyMentees(user?.username), [user, version]);

    const students = useMemo(() => new Map(db.getMockStudents().map(s => [s.id, s])), []);
    const nameOf = useMemo(() => {
        const map = new Map((db.getSyncedProfiles() || []).map(p => [p.username, p.fullName]));
        return (u) => map.get(u) || u;
    }, []);

    const mentees = useMemo(() => {
        // Bitta talabaga bir necha rolda biriktirilgan bo'lishim mumkin - talaba
        // ro'yxatda BIR MARTA chiqadi, rollari birga ko'rsatiladi.
        const byStudent = new Map();
        myAssignments.forEach(a => {
            if (!byStudent.has(a.studentId)) byStudent.set(a.studentId, { studentId: a.studentId, roles: [] });
            byStudent.get(a.studentId).roles.push(a.role);
        });

        return Array.from(byStudent.values()).map(entry => {
            const profile = db.getTalentProfile(entry.studentId);
            const student = students.get(entry.studentId);
            const values = collectDimensionValues(db, entry.studentId, profile);
            const scored = computeTalentScore(values);
            const idp = db.getTalentIdp(entry.studentId);
            const goals = idp ? db.getTalentGoals(idp.id) : [];
            const progress = computeIdpProgress(goals);
            const monitoring = db.getTalentMonitoring(entry.studentId);

            const eligibilityProfile = buildStudentEligibilityProfile(db, entry.studentId);
            const targets = db.getTalentTargets(entry.studentId).map(t => {
                const grant = t.grantId ? db.getScholarshipGrant(t.grantId) : null;
                return {
                    ...t, grant,
                    readiness: grant ? computeReadiness(grant, eligibilityProfile, profile?.declared || {}) : null,
                };
            }).sort((a, b) => (b.readiness?.readiness || 0) - (a.readiness?.readiness || 0));

            return {
                ...entry, profile, student, values, scored, idp, goals, progress,
                monitoring, targets,
                trend: db.getStudentGPATrend(entry.studentId),
                // Mening mas'ulligimdagi maqsadlar - alohida ajratiladi.
                myGoals: goals.filter(g => g.responsibleId === user?.username),
            };
        }).sort((a, b) => b.progress.overdue - a.progress.overdue
            || (a.student?.fullName || '').localeCompare(b.student?.fullName || ''));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [myAssignments, students, user, version]);

    const filtered = useMemo(
        () => roleFilter === 'all' ? mentees : mentees.filter(m => m.roles.includes(roleFilter)),
        [mentees, roleFilter]
    );

    const stats = useMemo(() => ({
        total: mentees.length,
        overdue: mentees.reduce((s, m) => s + m.progress.overdue, 0),
        dueSoon: mentees.reduce((s, m) => s + m.progress.dueSoon, 0),
        ready: mentees.filter(m => m.targets.some(t => ['ready', 'candidate', 'submitted', 'recommended'].includes(t.status))).length,
        won: mentees.filter(m => m.targets.some(t => t.status === 'won')).length,
    }), [mentees]);

    const myRoles = useMemo(
        () => [...new Set(myAssignments.map(a => a.role))],
        [myAssignments]
    );

    if (myAssignments.length === 0) {
        return (
            <Card className="text-center py-20">
                <Users className="w-14 h-14 mx-auto mb-4 text-gray-200" />
                <p className="font-bold text-gray-500">Sizga hali shogird biriktirilmagan</p>
                <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
                    Mentor, tyutor yoki ilmiy rahbar sifatida ishlash uchun admin sizni
                    "Iqtidorli talabalar" bo'limidan talabaga biriktirishi kerak.
                </p>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-8 text-white shadow-xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div>
                    <h1 className="text-3xl font-bold mb-1 flex items-center gap-3">
                        <Users className="w-8 h-8" /> Mening shogirdlarim
                    </h1>
                    <p className="text-emerald-100">
                        {myRoles.map(r => ASSIGNMENT_ROLES[r]?.label).filter(Boolean).join(' · ')}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {[
                        ['Shogird', stats.total], ['Kechikkan', stats.overdue],
                        ['Nomzod', stats.ready], ["G'olib", stats.won],
                    ].map(([label, value]) => (
                        <div key={label} className="bg-white/15 backdrop-blur rounded-xl px-4 py-2.5 text-center min-w-[88px]">
                            <p className="text-2xl font-black">{value}</p>
                            <p className="text-[10px] uppercase font-bold tracking-widest opacity-80">{label}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <Info className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-800">{NO_PUNISHMENT_NOTE}</p>
            </div>

            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <p className="text-sm font-semibold text-red-700">{error}</p>
                    <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><XCircle size={18} /></button>
                </div>
            )}
            {flash && (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                    <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <p className="text-sm font-semibold text-emerald-800">{flash}</p>
                    <button onClick={() => setFlash('')} className="ml-auto text-emerald-400 hover:text-emerald-600"><XCircle size={18} /></button>
                </div>
            )}

            {/* Mening tayyorlaganlarim - professional portfel (§62) */}
            <MyRecognitions personId={user?.username} version={version} />

            {myRoles.length > 1 && (
                <div className="flex bg-white p-1 rounded-xl border border-gray-100 shadow-sm w-fit">
                    <button onClick={() => setRoleFilter('all')}
                        className={`px-5 py-2 rounded-lg text-sm font-bold ${roleFilter === 'all' ? 'bg-gray-800 text-white' : 'text-gray-500'}`}>
                        Hammasi
                    </button>
                    {myRoles.map(r => (
                        <button key={r} onClick={() => setRoleFilter(r)}
                            className={`px-5 py-2 rounded-lg text-sm font-bold ${roleFilter === r ? 'bg-gray-800 text-white' : 'text-gray-500'}`}>
                            {ASSIGNMENT_ROLES[r]?.label}
                        </button>
                    ))}
                </div>
            )}

            <div className="space-y-2">
                {filtered.map(m => {
                    const prog = TALENT_PROGRAMS[m.profile?.program];
                    const grade = POTENTIAL_GRADES[m.profile?.potentialGrade];
                    const mainTarget = m.targets[0];
                    const lastFlag = MONITORING_FLAGS[m.monitoring[0]?.flag];
                    const TrendIcon = m.trend.trend === 'up' ? TrendingUp
                        : m.trend.trend === 'down' ? TrendingDown : Minus;
                    return (
                        <Card key={m.studentId} hover className={`cursor-pointer border-l-4 ${m.progress.overdue > 0 ? 'border-l-red-500'
                            : m.progress.dueSoon > 0 ? 'border-l-amber-400' : 'border-l-emerald-500'}`}
                            onClick={() => setSelected(m)}>
                            <div className="flex flex-col lg:flex-row justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <p className="font-black text-gray-900">{m.student?.fullName}</p>
                                        {m.roles.map(r => (
                                            <span key={r} className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${ASSIGNMENT_ROLES[r]?.tone}`}>
                                                {ASSIGNMENT_ROLES[r]?.short}
                                            </span>
                                        ))}
                                        {grade && (
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${grade.tone}`}>
                                                {m.profile.potentialGrade}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        {m.profile?.faculty} · {m.student?.course}-kurs · {prog?.short}
                                    </p>

                                    <div className="flex flex-wrap gap-3 mt-2 text-[11px] font-semibold">
                                        <span className="text-gray-500">
                                            Talent: <b className="text-gray-900">{m.scored.score}</b>/{TALENT_SCORE_MAX}
                                        </span>
                                        {m.idp && (
                                            <span className="text-gray-500">
                                                IDP: <b className="text-gray-900">{m.progress.progress}%</b>
                                                {' '}({m.progress.done}/{m.progress.total})
                                            </span>
                                        )}
                                        {m.progress.overdue > 0 && (
                                            <span className="text-red-600">{m.progress.overdue} kechikkan</span>
                                        )}
                                        {m.progress.dueSoon > 0 && (
                                            <span className="text-amber-600">{m.progress.dueSoon} yaqinlashmoqda</span>
                                        )}
                                        {m.myGoals.length > 0 && (
                                            <span className="text-violet-600">
                                                {m.myGoals.length} ta menda mas'ul
                                            </span>
                                        )}
                                        {m.trend.trend !== 'unknown' && (
                                            <span className={`flex items-center gap-0.5 ${m.trend.trend === 'down' ? 'text-red-500' : 'text-gray-500'}`}>
                                                <TrendIcon size={12} /> GPA {m.trend.delta > 0 ? '+' : ''}{m.trend.delta}
                                            </span>
                                        )}
                                    </div>

                                    {mainTarget && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <Target size={12} className="text-violet-500" />
                                            <span className="text-[11px] text-gray-600 truncate">
                                                {mainTarget.grant?.title || getStateAward(mainTarget.awardKey)?.label}
                                            </span>
                                            {mainTarget.readiness?.readiness !== null && mainTarget.readiness && (
                                                <span className="text-[11px] font-black text-violet-700">
                                                    {mainTarget.readiness.readiness}%
                                                </span>
                                            )}
                                            <Badge variant={TARGET_STATUS[mainTarget.status]?.variant} size="sm">
                                                {TARGET_STATUS[mainTarget.status]?.label}
                                            </Badge>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-3 flex-shrink-0">
                                    {lastFlag && (
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${lastFlag.bg} ${lastFlag.textTone}`}>
                                            {lastFlag.label}
                                        </span>
                                    )}
                                    <ChevronRight size={18} className="text-gray-300" />
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </div>

            <Modal isOpen={!!selected} onClose={() => setSelected(null)}
                title={selected?.student?.fullName || ''} size="lg">
                {selected && (
                    <MenteeDetail
                        mentee={selected} user={user} busy={busy} run={run}
                        nameOf={nameOf} onDone={() => setSelected(null)}
                    />
                )}
            </Modal>
        </div>
    );
};

// ---------------------------------------------------------------------------
// "Mening tayyorlaganlarim" — mentorning professional portfeli (§62).
// Faqat natija chiqqan bo'lsa ko'rinadi; bo'sh holda ekranni band qilmaydi.
// ---------------------------------------------------------------------------
const MyRecognitions = ({ personId, version }) => {
    const recognitions = useMemo(
        () => (personId ? db.getPersonRecognitions(personId) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [personId, version]
    );

    if (recognitions.length === 0) return null;

    const issued = recognitions.filter(r => r.status === 'issued');
    const byAchievement = new Map();
    recognitions.forEach(r => {
        const key = r.case?.achievement || 'Natija';
        byAchievement.set(key, (byAchievement.get(key) || 0) + 1);
    });

    return (
        <Card className="border-l-4 border-l-amber-400">
            <div className="flex items-center gap-2 mb-3">
                <Trophy size={18} className="text-amber-500" />
                <p className="font-black text-gray-900">Mening tayyorlaganlarim</p>
                <span className="text-xs text-gray-400">({recognitions.length} natija)</span>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
                {Array.from(byAchievement.entries()).map(([label, count]) => (
                    <span key={label} className="px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-lg text-xs font-bold text-amber-900">
                        {label} — {count}
                    </span>
                ))}
            </div>

            <div className="space-y-1.5">
                {recognitions.map(r => (
                    <div key={r.id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${ASSIGNMENT_ROLES[r.role]?.tone}`}>
                            {ASSIGNMENT_ROLES[r.role]?.short}
                        </span>
                        <span className="text-sm font-bold text-gray-900 flex-1 truncate">
                            {r.case?.studentName || '—'}
                        </span>
                        <span className="text-xs text-gray-500 truncate max-w-[200px]">
                            {r.case?.achievement}
                        </span>
                        {r.status === 'issued' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 flex-shrink-0">
                                <Award size={12} /> Rag'batlantirilgan
                            </span>
                        ) : (
                            <span className="text-[11px] text-gray-400 flex-shrink-0">jarayonda</span>
                        )}
                    </div>
                ))}
            </div>

            {issued.length > 0 && (
                <p className="text-[11px] text-gray-400 mt-3">
                    Rasmiy rag'bat hujjatlaringiz "Yutuqlarim" bo'limida, QR orqali tekshiriladi.
                </p>
            )}
        </Card>
    );
};

// ---------------------------------------------------------------------------
const MenteeDetail = ({ mentee, user, busy, run, nameOf, onDone }) => {
    const [section, setSection] = useState('goals');
    const myRole = mentee.roles[0];

    // Kuzatuv yozish
    const isYear1 = mentee.profile?.program === 'year1';
    const d = new Date();
    const defaultPeriod = isYear1
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        : (d.getMonth() >= 8 ? `${d.getFullYear()}-${d.getFullYear() + 1}/1` : `${d.getFullYear() - 1}-${d.getFullYear()}/2`);

    const [period] = useState(defaultPeriod);
    const [flag, setFlag] = useState('green');
    const [notes, setNotes] = useState('');
    const [problems, setProblems] = useState('');
    const [recommendations, setRecommendations] = useState('');
    const [nextGoals, setNextGoals] = useState('');

    const existing = mentee.monitoring.find(m => m.period === period && m.byRole === myRole);

    React.useEffect(() => {
        if (existing) {
            setFlag(existing.flag || 'green');
            setNotes(existing.notes || '');
            setProblems(existing.problems || '');
            setRecommendations(existing.recommendations || '');
            setNextGoals(existing.nextGoals || '');
        }
    }, [existing]);

    const saveMonitoring = () => run(async () => {
        await db.saveTalentMonitoring({
            studentId: mentee.studentId, period, periodType: isYear1 ? 'month' : 'semester',
            byId: user?.username, byRole: myRole, flag,
            notes, problems, recommendations, nextGoals,
        });
        onDone();
    }, 'Kuzatuv saqlandi');

    const patchGoal = (goalId, patch) => run(() => db.updateTalentGoal(goalId, patch, user?.username));

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-2xl">
                <div className="min-w-0">
                    <p className="font-black text-gray-900">{mentee.student?.fullName}</p>
                    <p className="text-xs text-gray-500">
                        {mentee.profile?.faculty} · {mentee.student?.course}-kurs · {mentee.student?.group}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {mentee.roles.map(r => (
                            <span key={r} className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${ASSIGNMENT_ROLES[r]?.tone}`}>
                                Men — {ASSIGNMENT_ROLES[r]?.label}
                            </span>
                        ))}
                    </div>
                </div>
                <div className="text-center flex-shrink-0">
                    <p className="text-3xl font-black text-emerald-700">{mentee.scored.score}</p>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400">
                        / {TALENT_SCORE_MAX}
                    </p>
                </div>
            </div>

            <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
                {[['goals', 'Maqsadlar'], ['targets', 'Nomzodlik'], ['monitoring', 'Kuzatuv']].map(([id, label]) => (
                    <button key={id} onClick={() => setSection(id)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold ${section === id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* --- Maqsadlar --- */}
            {section === 'goals' && (
                <div className="space-y-2">
                    {!mentee.idp && (
                        <p className="text-sm text-gray-400 italic text-center py-8">
                            IDP hali yaratilmagan — admin yoki fakultet yaratadi
                        </p>
                    )}
                    {mentee.goals.map(goal => {
                        const timing = goalTiming(goal);
                        const isMine = goal.responsibleId === user?.username;
                        const st = GOAL_STATUS[goal.status];
                        return (
                            <div key={goal.id} className={`p-3 rounded-xl border ${timing.state === 'overdue' ? 'bg-red-50/60 border-red-200'
                                : timing.state === 'due_soon' ? 'bg-amber-50/60 border-amber-200'
                                    : 'bg-white border-gray-200'}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                            <span className="text-[10px] px-2 py-0.5 bg-gray-100 rounded-md font-bold text-gray-600">
                                                {GOAL_CATEGORIES[goal.category]?.label || goal.category}
                                            </span>
                                            <Badge variant={st?.variant} size="sm">{st?.label}</Badge>
                                            {isMine && (
                                                <span className="text-[10px] px-2 py-0.5 bg-violet-100 text-violet-700 rounded-md font-bold">
                                                    Men mas'ulman
                                                </span>
                                            )}
                                            {(goal.evidence || []).length > 0 && (
                                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-bold">
                                                    <Paperclip size={10} /> {goal.evidence.length}
                                                </span>
                                            )}
                                        </div>
                                        <p className="font-bold text-gray-900 text-sm">{goal.title}</p>
                                        {goal.deadline && (
                                            <p className={`text-[11px] mt-0.5 ${timing.state === 'overdue' ? 'text-red-600 font-bold'
                                                : timing.state === 'due_soon' ? 'text-amber-700 font-bold' : 'text-gray-400'}`}>
                                                {goal.deadline}
                                                {timing.days !== null && timing.state !== 'closed' && (
                                                    timing.state === 'overdue'
                                                        ? ` · ${Math.abs(timing.days)} kun kechikdi`
                                                        : ` · ${timing.days} kun qoldi`
                                                )}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Faqat o'zim mas'ul bo'lgan maqsadni o'zgartiraman */}
                                {isMine && (
                                    <div className="flex items-center gap-3 mt-3">
                                        <select value={goal.status} onChange={e => patchGoal(goal.id, { status: e.target.value })}
                                            disabled={busy}
                                            className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold">
                                            {Object.entries(GOAL_STATUS).map(([k, v]) => (
                                                <option key={k} value={k}>{v.label}</option>
                                            ))}
                                        </select>
                                        <input type="range" min="0" max="100" step="5" value={goal.progress}
                                            onChange={e => patchGoal(goal.id, { progress: Number(e.target.value) })}
                                            disabled={busy || goal.status === 'done'}
                                            className="flex-1 accent-emerald-600" />
                                        <span className="text-xs font-black text-gray-700 w-10 text-right">
                                            {goal.status === 'done' ? 100 : goal.progress}%
                                        </span>
                                    </div>
                                )}
                                {!isMine && goal.responsibleId && (
                                    <p className="text-[11px] text-gray-400 mt-2">
                                        Mas'ul: {nameOf(goal.responsibleId)}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* --- Nomzodlik --- */}
            {section === 'targets' && (
                <div className="space-y-3">
                    {mentee.targets.length === 0 && (
                        <p className="text-sm text-gray-400 italic text-center py-8">
                            Maqsad belgilanmagan
                        </p>
                    )}
                    {mentee.targets.map(t => {
                        const r = t.readiness;
                        return (
                            <div key={t.id} className="p-4 bg-white border border-gray-200 rounded-xl">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-black text-gray-900 text-sm">
                                            {t.grant?.title || getStateAward(t.awardKey)?.label}
                                        </p>
                                        <Badge variant={TARGET_STATUS[t.status]?.variant} size="sm">
                                            {TARGET_STATUS[t.status]?.label}
                                        </Badge>
                                    </div>
                                    {r?.readiness !== null && r && (
                                        <p className="text-2xl font-black text-violet-700 flex-shrink-0">{r.readiness}%</p>
                                    )}
                                </div>
                                {r && r.nextSteps.length > 0 && (
                                    <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">
                                            Shogirdga yordam kerak
                                        </p>
                                        <ul className="space-y-0.5">
                                            {r.nextSteps.map((s, i) => (
                                                <li key={i} className="text-xs text-amber-900">• {s}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* --- Kuzatuv --- */}
            {section === 'monitoring' && (
                <div className="space-y-4">
                    <div className="flex items-start gap-3 p-3 bg-sky-50 border border-sky-100 rounded-xl">
                        <Info size={16} className="text-sky-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-sky-800">{MONITORING_PURPOSE}</p>
                    </div>

                    <p className="text-xs font-bold text-gray-600">
                        Davr: {period} · {ASSIGNMENT_ROLES[myRole]?.label} sifatida
                        {existing && <span className="text-amber-600"> (mavjud yozuv yangilanadi)</span>}
                    </p>

                    <div className="grid grid-cols-3 gap-2">
                        {Object.entries(MONITORING_FLAGS).map(([k, v]) => (
                            <button key={k} type="button" onClick={() => setFlag(k)}
                                className={`p-3 rounded-xl border-2 transition-all ${flag === k ? 'border-gray-800 ' + v.bg : 'border-gray-200 bg-white'}`}>
                                <span className={`w-3 h-3 rounded-full inline-block mb-1 ${v.tone}`} />
                                <p className={`text-xs font-bold ${flag === k ? v.textTone : 'text-gray-600'}`}>{v.label}</p>
                            </button>
                        ))}
                    </div>

                    {[
                        ['Uchrashuv izohi', notes, setNotes, 'Nimalar muhokama qilindi...'],
                        ['Aniqlangan muammolar', problems, setProblems, 'Qayerda yordam kerak...'],
                        ['Tavsiyalarim', recommendations, setRecommendations, 'Qanday yordam beraman...'],
                        ['Keyingi maqsadlar', nextGoals, setNextGoals, 'Nimalarga erishish kerak...'],
                    ].map(([label, value, setter, placeholder]) => (
                        <div key={label}>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                                {label}
                            </label>
                            <textarea value={value} onChange={e => setter(e.target.value)} placeholder={placeholder}
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm h-16 resize-none" />
                        </div>
                    ))}

                    <Button variant="primary" className="w-full" disabled={busy}
                        icon={busy ? Loader2 : CheckCircle} onClick={saveMonitoring}>
                        Kuzatuvni saqlash
                    </Button>

                    {mentee.monitoring.length > 0 && (
                        <div className="pt-3 border-t border-gray-100">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                                Avvalgi kuzatuvlar
                            </p>
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                {mentee.monitoring.map(m => {
                                    const f = MONITORING_FLAGS[m.flag] || MONITORING_FLAGS.green;
                                    return (
                                        <div key={m.id} className={`p-2.5 rounded-lg ${f.bg}`}>
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${f.tone}`} />
                                                <span className="text-[11px] font-black text-gray-800">{m.period}</span>
                                                <span className="text-[10px] text-gray-500">
                                                    {ASSIGNMENT_ROLES[m.byRole]?.short || 'Fakultet'}
                                                </span>
                                            </div>
                                            {m.notes && <p className="text-[11px] text-gray-700 mt-1">{m.notes}</p>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default MyMenteesPage;
