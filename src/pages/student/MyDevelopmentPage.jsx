import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
    Rocket, Target, Trophy, CheckCircle, XCircle, AlertTriangle, Clock,
    TrendingUp, TrendingDown, Minus, Users, Info, CalendarClock, Paperclip,
    ArrowRight, Sparkles
} from 'lucide-react';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import {
    TALENT_DIMENSIONS, TALENT_SCORE_MAX, TALENT_PROGRAMS, POTENTIAL_GRADES,
    ASSIGNMENT_ROLES, GOAL_CATEGORIES, GOAL_STATUS, TARGET_STATUS, TARGET_FLOW,
    goalTiming, getStateAward, MONITORING_FLAGS,
} from '../../config/talent';
import {
    collectDimensionValues, computeTalentScore, computeIdpProgress,
    computeReadiness, buildTalentPortfolio,
} from '../../utils/talentScoring';
import { buildStudentEligibilityProfile } from '../../utils/scholarshipEligibility';
import { formatAmount } from '../../config/scholarships';
import { getDocumentTypeLabel } from '../../config/documents';

// Talaba kabinetidagi "Mening rivojlanishim".
//
// Bu ekran talabaga BIR SAHIFADA javob beradi:
//   - Men qaysi darajadaman?
//   - Maqsadim nima va unga qancha tayyorman?
//   - Nima yetishmayapti va keyingi 3 qadam nima?
//   - Menga kim yordam beryapti?
//
// Ichki komissiya izohlari bu yerda KO'RSATILMAYDI (§54) - talaba faqat o'ziga
// tegishli kriteriya, progress va tavsiyalarni ko'radi.

// `embedded` - "Yutuq va imkoniyatlar" bo'limining tabi ichida ko'rsatilganda
// o'z sarlavhasini chizmaydi.
const MyDevelopmentPage = ({ embedded = false }) => {
    const { user } = useAuth();
    const studentId = user?.username;

    const profile = useMemo(
        () => (studentId ? db.getTalentProfile(studentId) : null),
        [studentId]
    );

    const data = useMemo(() => {
        if (!studentId || !profile) return null;
        const values = collectDimensionValues(db, studentId, profile);
        const scored = computeTalentScore(values);
        const idp = db.getTalentIdp(studentId);
        const goals = idp ? db.getTalentGoals(idp.id) : [];
        const progress = computeIdpProgress(goals);
        const assignments = db.getActiveAssignments(studentId);
        const portfolio = buildTalentPortfolio(db, studentId);
        const monitoring = db.getTalentMonitoring(studentId);

        const eligibilityProfile = buildStudentEligibilityProfile(db, studentId);
        const targets = db.getTalentTargets(studentId).map(t => {
            const grant = t.grantId ? db.getScholarshipGrant(t.grantId) : null;
            return {
                ...t, grant,
                readiness: grant ? computeReadiness(grant, eligibilityProfile, profile.declared || {}) : null,
            };
        }).sort((a, b) => (b.readiness?.readiness || 0) - (a.readiness?.readiness || 0));

        return { values, scored, idp, goals, progress, assignments, portfolio, monitoring, targets };
    }, [studentId, profile]);

    const nameOf = useMemo(() => {
        const map = new Map((db.getSyncedProfiles() || []).map(p => [p.username, p.fullName]));
        return (username) => map.get(username) || username;
    }, []);

    // Dasturda emas - taklif qilinadigan ekran.
    if (!profile) {
        return (
            <div className="space-y-6">
                {!embedded && (
                    <div className="bg-gradient-to-r from-violet-600 to-indigo-700 rounded-2xl p-8 text-white shadow-xl">
                        <h1 className="text-3xl font-bold mb-1 flex items-center gap-3">
                            <Rocket className="w-8 h-8" /> Mening rivojlanishim
                        </h1>
                        <p className="text-violet-100">
                            Stipendiya va davlat mukofotlariga uzoq muddatli tayyorgarlik
                        </p>
                    </div>
                )}

                <Card className="text-center py-16">
                    <Sparkles className="w-14 h-14 mx-auto mb-4 text-gray-200" />
                    <p className="font-bold text-gray-600">Siz hali "Iqtidorli talabalar" dasturida emassiz</p>
                    <p className="text-sm text-gray-400 mt-2 max-w-lg mx-auto">
                        Dasturga fakultet yoki tyutor tavsiyasi bilan qo'shilasiz. Unga qo'shilgach
                        shu yerda individual rivojlanish rejangiz, maqsadlaringiz va stipendiyaga
                        tayyorgarlik darajangiz ko'rinadi.
                    </p>
                    <p className="text-sm text-gray-500 mt-4 max-w-lg mx-auto">
                        Shu paytgacha ham faoliyatingiz hisobga olinadi — tadbir va musobaqalardagi
                        ishtirokingiz, olgan hujjatlaringiz va ijtimoiy faollik balingiz dasturga
                        qo'shilganda avtomatik portfelingizga tushadi.
                    </p>
                    {/* Tab ichida bu tugmalar ortiqcha - Yutuqlarim va Imkoniyatlar
                        tablari shundoq ham tepada turibdi. Ular faqat sahifa alohida
                        ochilganda kerak bo'ladi. */}
                    {!embedded && (
                        <div className="flex justify-center gap-3 mt-6">
                            <Link to="/student/achievements?tab=achievements"
                                className="px-5 py-2.5 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-700">
                                Yutuqlarim
                            </Link>
                            <Link to="/student/achievements"
                                className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:border-violet-300">
                                Imkoniyatlar
                            </Link>
                        </div>
                    )}
                </Card>
            </div>
        );
    }

    const { values, scored, idp, goals, progress, assignments, portfolio, monitoring, targets } = data;
    const prog = TALENT_PROGRAMS[profile.program] || TALENT_PROGRAMS.year1;
    const grade = POTENTIAL_GRADES[profile.potentialGrade];
    const mainTarget = targets[0] || null;
    const trend = portfolio.academic.trend;
    const TrendIcon = trend.trend === 'up' ? TrendingUp : trend.trend === 'down' ? TrendingDown : Minus;

    // Keyingi 3 qadam: asosiy maqsadning yetishmayotganlari + yaqinlashayotgan muddatlar.
    const nextSteps = [
        ...(mainTarget?.readiness?.nextSteps || []),
        ...(progress.timings || [])
            .filter(t => t.timing.state === 'overdue' || t.timing.state === 'due_soon')
            .map(t => `${t.goal.title} — ${t.timing.state === 'overdue'
                ? `${Math.abs(t.timing.days)} kun kechikdi` : `${t.timing.days} kun qoldi`}`),
    ].slice(0, 3);

    return (
        <div className="space-y-6">
            {/* Sarlavha */}
            {embedded ? (
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${prog.tone}`}>{prog.label}</span>
                    {grade && (
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${grade.tone}`}>
                            {profile.potentialGrade} — {grade.label}
                        </span>
                    )}
                    <span className="ml-auto flex gap-2">
                        <span className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-center min-w-[92px]">
                            <span className="block text-2xl font-black text-violet-700">{scored.score}</span>
                            <span className="block text-[10px] uppercase font-bold tracking-widest text-gray-400">
                                / {TALENT_SCORE_MAX}
                            </span>
                        </span>
                        {idp && (
                            <span className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-center min-w-[92px]">
                                <span className="block text-2xl font-black text-violet-700">{progress.progress}%</span>
                                <span className="block text-[10px] uppercase font-bold tracking-widest text-gray-400">IDP</span>
                            </span>
                        )}
                    </span>
                </div>
            ) : (
                <div className="bg-gradient-to-r from-violet-600 to-indigo-700 rounded-2xl p-8 text-white shadow-xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                    <div>
                        <h1 className="text-3xl font-bold mb-1 flex items-center gap-3">
                            <Rocket className="w-8 h-8" /> Mening rivojlanishim
                        </h1>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className="px-2.5 py-1 bg-white/20 rounded-lg text-xs font-bold">{prog.label}</span>
                            {grade && (
                                <span className="px-2.5 py-1 bg-white/20 rounded-lg text-xs font-bold">
                                    {profile.potentialGrade} — {grade.label}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <div className="bg-white/15 backdrop-blur rounded-xl px-5 py-3 text-center">
                            <p className="text-3xl font-black">{scored.score}</p>
                            <p className="text-[10px] uppercase font-bold tracking-widest opacity-80">
                                / {TALENT_SCORE_MAX} rivojlanish
                            </p>
                        </div>
                        {idp && (
                            <div className="bg-white/15 backdrop-blur rounded-xl px-5 py-3 text-center">
                                <p className="text-3xl font-black">{progress.progress}%</p>
                                <p className="text-[10px] uppercase font-bold tracking-widest opacity-80">IDP progress</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Asosiy maqsad */}
            {mainTarget && (
                <Card className="border-l-4 border-l-violet-500">
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">
                                Mening maqsadim
                            </p>
                            <p className="text-xl font-black text-gray-900">
                                {mainTarget.grant?.title || getStateAward(mainTarget.awardKey)?.label}
                            </p>
                            {mainTarget.grant && (
                                <p className="text-sm text-gray-500 mt-0.5">
                                    {formatAmount(mainTarget.grant.amount)}
                                    {mainTarget.grant.deadline ? ` · muddat ${mainTarget.grant.deadline}` : ''}
                                </p>
                            )}
                            <div className="mt-2">
                                <Badge variant={TARGET_STATUS[mainTarget.status]?.variant} size="sm">
                                    {TARGET_STATUS[mainTarget.status]?.label}
                                </Badge>
                            </div>
                        </div>
                        {mainTarget.readiness?.readiness !== null && mainTarget.readiness && (
                            <div className="text-center flex-shrink-0">
                                <p className={`text-5xl font-black ${mainTarget.readiness.readiness >= 95 ? 'text-emerald-600'
                                    : mainTarget.readiness.readiness >= 70 ? 'text-amber-500' : 'text-gray-400'}`}>
                                    {mainTarget.readiness.readiness}%
                                </p>
                                <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400">tayyorman</p>
                            </div>
                        )}
                    </div>

                    {!TARGET_STATUS[mainTarget.status]?.terminal && (
                        <div className="flex gap-0.5 mt-4">
                            {TARGET_FLOW.map(s => (
                                <div key={s} title={TARGET_STATUS[s].label}
                                    className={`h-2 flex-1 rounded-full ${TARGET_STATUS[s].step <= (TARGET_STATUS[mainTarget.status]?.step || 0)
                                        ? 'bg-violet-500' : 'bg-gray-200'}`} />
                            ))}
                        </div>
                    )}

                    {/* §21: bu jazo emas */}
                    {mainTarget.status === 'not_selected' && (
                        <div className="mt-4 p-4 bg-sky-50 border border-sky-200 rounded-xl">
                            <p className="text-sm text-sky-900">
                                <b>Bu tanlovda tavsiya etilmadingiz.</b> Bu yakuniy baho emas —
                                quyidagi qadamlarni bajarib, keyingi imkoniyatga tayyorlanishingiz mumkin.
                                Mentoringiz bilan yangi reja tuzing.
                            </p>
                        </div>
                    )}
                    {mainTarget.status === 'won' && (
                        <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
                            <Trophy className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                            <p className="text-sm text-emerald-900 font-bold">
                                Tabriklaymiz! Siz ushbu stipendiya sohibisiz.
                            </p>
                        </div>
                    )}
                </Card>
            )}

            {/* Keyingi qadamlar */}
            {nextSteps.length > 0 && (
                <Card className="border-l-4 border-l-amber-400">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
                        Keyingi {nextSteps.length} qadam
                    </p>
                    <ol className="space-y-2">
                        {nextSteps.map((s, i) => (
                            <li key={i} className="flex items-start gap-3">
                                <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-black flex-shrink-0">
                                    {i + 1}
                                </span>
                                <span className="text-sm text-gray-800 pt-0.5">{s}</span>
                            </li>
                        ))}
                    </ol>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {/* O'lchovlar */}
                    <Card>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">
                            Rivojlanish ko'rsatkichlari
                        </p>
                        <div className="space-y-3">
                            {scored.parts.map(p => (
                                <div key={p.key} className="space-y-1">
                                    <div className="flex justify-between items-baseline gap-2">
                                        <span className="text-sm font-bold text-gray-800">{p.label}</span>
                                        <span className="text-xs">
                                            {p.known ? (
                                                <><b className="text-gray-900">{p.points}</b><span className="text-gray-400"> / {p.max}</span></>
                                            ) : (
                                                <span className="text-gray-400">ma'lumot yo'q</span>
                                            )}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full ${p.color} transition-all`}
                                            style={{ width: `${p.known ? (p.points / p.max) * 100 : 0}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                        {scored.missing.length > 0 && (
                            <p className="text-[11px] text-gray-400 mt-3">
                                {scored.missing.join(', ')} bo'yicha ma'lumot hali kiritilmagan — mentoringiz
                                bilan bog'laning.
                            </p>
                        )}
                    </Card>

                    {/* IDP maqsadlari */}
                    {idp && goals.length > 0 && (
                        <Card>
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                    Individual rivojlanish rejam
                                </p>
                                <span className="text-xs font-bold text-gray-500">
                                    {progress.done} / {progress.total} bajarilgan
                                </span>
                            </div>
                            <div className="space-y-2">
                                {goals.map(goal => {
                                    const timing = goalTiming(goal);
                                    const cat = GOAL_CATEGORIES[goal.category];
                                    const st = GOAL_STATUS[goal.status];
                                    return (
                                        <div key={goal.id} className={`p-3 rounded-xl border ${timing.state === 'overdue' ? 'bg-red-50/60 border-red-200'
                                            : timing.state === 'due_soon' ? 'bg-amber-50/60 border-amber-200'
                                                : goal.status === 'done' ? 'bg-emerald-50/50 border-emerald-100'
                                                    : 'bg-white border-gray-200'}`}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                                        <span className="text-[10px] px-2 py-0.5 bg-gray-100 rounded-md font-bold text-gray-600">
                                                            {cat?.label || goal.category}
                                                        </span>
                                                        <Badge variant={st?.variant} size="sm">{st?.label}</Badge>
                                                        {(goal.evidence || []).length > 0 && (
                                                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-bold">
                                                                <Paperclip size={10} /> {goal.evidence.length}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="font-bold text-gray-900 text-sm">{goal.title}</p>
                                                    {goal.deadline && (
                                                        <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${timing.state === 'overdue' ? 'text-red-600 font-bold'
                                                            : timing.state === 'due_soon' ? 'text-amber-700 font-bold' : 'text-gray-400'}`}>
                                                            <CalendarClock size={11} />
                                                            {goal.deadline}
                                                            {timing.days !== null && timing.state !== 'closed' && (
                                                                timing.state === 'overdue'
                                                                    ? ` · ${Math.abs(timing.days)} kun kechikdi`
                                                                    : ` · ${timing.days} kun qoldi`
                                                            )}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <p className="text-lg font-black text-gray-700">
                                                        {goal.status === 'done' ? 100 : goal.progress}%
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="h-1.5 bg-white rounded-full overflow-hidden mt-2">
                                                <div className="h-full bg-violet-500"
                                                    style={{ width: `${goal.status === 'done' ? 100 : goal.progress}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    )}

                    {/* Boshqa maqsadlar */}
                    {targets.length > 1 && (
                        <Card>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">
                                Boshqa maqsadlarim
                            </p>
                            <div className="space-y-2">
                                {targets.slice(1).map(t => (
                                    <div key={t.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl">
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-gray-900 truncate">
                                                {t.grant?.title || getStateAward(t.awardKey)?.label}
                                            </p>
                                            <Badge variant={TARGET_STATUS[t.status]?.variant} size="sm">
                                                {TARGET_STATUS[t.status]?.label}
                                            </Badge>
                                        </div>
                                        {t.readiness?.readiness !== null && t.readiness && (
                                            <span className="text-xl font-black text-violet-700 flex-shrink-0">
                                                {t.readiness.readiness}%
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>

                {/* Yon panel */}
                <div className="space-y-6">
                    {/* Mas'ullar */}
                    <Card title="Menga kim yordam beryapti">
                        {assignments.length === 0 ? (
                            <p className="text-sm text-gray-400 italic">Hali biriktirilmagan</p>
                        ) : (
                            <div className="space-y-2">
                                {assignments.map(a => {
                                    const role = ASSIGNMENT_ROLES[a.role];
                                    return (
                                        <div key={a.id} className={`p-3 rounded-xl border ${role?.tone}`}>
                                            <p className="text-[10px] font-black uppercase tracking-widest opacity-70">
                                                {role?.label}
                                            </p>
                                            <p className="font-bold text-gray-900 text-sm mt-0.5">{nameOf(a.personId)}</p>
                                            <p className="text-[11px] text-gray-500 mt-1">{role?.scope}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>

                    {/* Akademik */}
                    <Card title="Akademik ko'rsatkich">
                        {portfolio.academic.records.length === 0 ? (
                            <p className="text-sm text-gray-400 italic">Ma'lumot kiritilmagan</p>
                        ) : (
                            <>
                                <div className="flex items-baseline gap-2 mb-2">
                                    <span className="text-3xl font-black text-gray-900">
                                        {portfolio.academic.average}
                                    </span>
                                    <span className="text-xs text-gray-400">o'rtacha GPA</span>
                                    {trend.trend !== 'unknown' && (
                                        <span className={`ml-auto flex items-center gap-1 text-xs font-bold ${trend.trend === 'up' ? 'text-emerald-600' : trend.trend === 'down' ? 'text-red-500' : 'text-gray-400'}`}>
                                            <TrendIcon size={13} />
                                            {trend.delta > 0 ? '+' : ''}{trend.delta}
                                        </span>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    {portfolio.academic.records.slice(0, 4).map(r => (
                                        <div key={r.id} className="flex justify-between text-xs px-2.5 py-1.5 bg-gray-50 rounded-lg">
                                            <span className="text-gray-600">{r.academicYear}, {r.semester}-sem</span>
                                            <span className="font-black text-gray-900">{r.gpa ?? '—'}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </Card>

                    {/* Portfolio xulosasi */}
                    <Card title="Portfelim">
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                ['Diplom', portfolio.documents.diplomas.length],
                                ['Sertifikat', portfolio.documents.certificates.length],
                                ['Tashakkur', portfolio.documents.thanks.length],
                                ['Faollik bali', portfolio.social.total],
                            ].map(([label, value]) => (
                                <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                                    <p className="text-xl font-black text-gray-900">{value}</p>
                                    <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400">{label}</p>
                                </div>
                            ))}
                        </div>
                        <Link to="/student/achievements?tab=achievements"
                            className="flex items-center justify-center gap-1 mt-3 text-xs font-bold text-violet-600 hover:text-violet-800">
                            Barcha yutuqlarim <ArrowRight size={12} />
                        </Link>
                    </Card>

                    {/* Oxirgi kuzatuv */}
                    {monitoring.length > 0 && (
                        <Card title="Oxirgi kuzatuv">
                            {(() => {
                                const m = monitoring[0];
                                const f = MONITORING_FLAGS[m.flag] || MONITORING_FLAGS.green;
                                return (
                                    <div className={`p-3 rounded-xl ${f.bg}`}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`w-2.5 h-2.5 rounded-full ${f.tone}`} />
                                            <span className="text-xs font-black text-gray-800">{m.period}</span>
                                        </div>
                                        {m.recommendations && (
                                            <p className="text-[11px] text-gray-700 mt-1">
                                                <b>Tavsiya:</b> {m.recommendations}
                                            </p>
                                        )}
                                        {m.nextGoals && (
                                            <p className="text-[11px] text-gray-700 mt-1">
                                                <b>Keyingi maqsadlar:</b> {m.nextGoals}
                                            </p>
                                        )}
                                    </div>
                                );
                            })()}
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MyDevelopmentPage;
