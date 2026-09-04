import React, { useMemo } from 'react';
import {
    Users, Target, Trophy, TrendingUp, Building2, Info, Award, Activity,
    AlertTriangle, GraduationCap, Sparkles
} from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import { db } from '../../services/db';
import {
    TALENT_PROGRAMS, POTENTIAL_GRADES, TARGET_STATUS, MONITORING_FLAGS,
    ASSIGNMENT_ROLES, TALENT_SCORE_MAX, getStateAward,
} from '../../config/talent';
import { computeIdpProgress } from '../../utils/talentScoring';

// Talent Pipeline dashboard.
//
// Rahbariyat uchun asosiy savol "bugun nechta stipendiatimiz bor?" emas, balki
// "kelgusi 1-2 yilda nechta kuchli nomzodimiz bor?" (§25). Shuning uchun
// markazda voronka turadi, yig'indi raqamlar emas.

const FUNNEL = [
    { key: 'enrolled', label: 'Dasturda', color: 'bg-slate-400' },
    { key: 'withIdp', label: 'IDP yaratilgan', color: 'bg-sky-500' },
    { key: 'withTarget', label: 'Maqsad belgilangan', color: 'bg-indigo-500' },
    { key: 'ready', label: 'Tayyor', color: 'bg-violet-500' },
    { key: 'candidate', label: 'Nomzod', color: 'bg-fuchsia-500' },
    { key: 'recommended', label: 'Tavsiya etilgan', color: 'bg-amber-500' },
    { key: 'won', label: "G'olib", color: 'bg-emerald-500' },
];

const TalentDashboardTab = ({ rows, version, busy, user, run }) => {
    const data = useMemo(() => {
        const enriched = rows.map(r => {
            const idp = db.getTalentIdp(r.profile.studentId);
            const goals = idp ? db.getTalentGoals(idp.id) : [];
            const targets = db.getTalentTargets(r.profile.studentId);
            const monitoring = db.getTalentMonitoring(r.profile.studentId);
            return { ...r, idp, goals, progress: computeIdpProgress(goals), targets, monitoring };
        });

        const statusOf = (t) => t.status;
        const hasStatus = (r, list) => r.targets.some(t => list.includes(statusOf(t)));

        const funnel = {
            enrolled: enriched.length,
            withIdp: enriched.filter(r => r.idp).length,
            withTarget: enriched.filter(r => r.targets.length > 0).length,
            ready: enriched.filter(r => hasStatus(r, ['ready', 'candidate', 'submitted', 'recommended', 'won'])).length,
            candidate: enriched.filter(r => hasStatus(r, ['candidate', 'submitted', 'recommended', 'won'])).length,
            recommended: enriched.filter(r => hasStatus(r, ['recommended', 'won'])).length,
            won: enriched.filter(r => hasStatus(r, ['won'])).length,
        };

        // Fakultetlar kesimi
        const byFaculty = new Map();
        enriched.forEach(r => {
            const f = r.profile.faculty || "Noma'lum";
            if (!byFaculty.has(f)) {
                byFaculty.set(f, { faculty: f, total: 0, gradeA: 0, ready: 0, won: 0, avgScore: 0, scoreSum: 0 });
            }
            const e = byFaculty.get(f);
            e.total += 1;
            e.scoreSum += r.scored.score;
            if (r.profile.potentialGrade === 'A') e.gradeA += 1;
            if (hasStatus(r, ['ready', 'candidate', 'submitted', 'recommended', 'won'])) e.ready += 1;
            if (hasStatus(r, ['won'])) e.won += 1;
        });
        const faculties = Array.from(byFaculty.values())
            .map(e => ({ ...e, avgScore: e.total ? Math.round(e.scoreSum / e.total) : 0 }))
            .sort((a, b) => b.total - a.total);

        // Mentor ta'siri (§45). MUHIM: bu reyting EMAS - shunchaki kim nechta
        // shogird bilan ishlayotgani va natijasi. 20 ta shogirdli mentorni
        // 2 ta shogirdlisi bilan oddiy "yutuqlar soni" bo'yicha solishtirish
        // noto'g'ri bo'lardi (§46), shuning uchun nisbat ham ko'rsatiladi.
        const assignments = db.getTalentAssignments().filter(a => a.active);
        const byPerson = new Map();
        assignments.forEach(a => {
            if (!byPerson.has(a.personId)) {
                byPerson.set(a.personId, { personId: a.personId, roles: new Set(), mentees: 0, ready: 0, won: 0 });
            }
            const e = byPerson.get(a.personId);
            e.roles.add(a.role);
            e.mentees += 1;
            const r = enriched.find(x => x.profile.studentId === a.studentId);
            if (r) {
                if (hasStatus(r, ['ready', 'candidate', 'submitted', 'recommended', 'won'])) e.ready += 1;
                if (hasStatus(r, ['won'])) e.won += 1;
            }
        });
        const mentors = Array.from(byPerson.values())
            .map(m => ({
                ...m,
                roles: Array.from(m.roles),
                conversion: m.mentees ? Math.round((m.ready / m.mentees) * 100) : 0,
            }))
            .sort((a, b) => b.conversion - a.conversion || b.mentees - a.mentees);

        // E'tibor talab qiladiganlar
        const attention = enriched
            .map(r => {
                const reasons = [];
                if (r.progress.overdue > 0) reasons.push(`${r.progress.overdue} ta maqsad kechikkan`);
                if (r.monitoring[0]?.flag === 'red') reasons.push("Kuzatuvda e'tibor belgisi");
                const trend = db.getStudentGPATrend(r.profile.studentId);
                if (trend.trend === 'down') reasons.push(`GPA tushmoqda (${trend.delta})`);
                if (r.assignments.length === 0) reasons.push('Mas\'ul biriktirilmagan');
                if (!r.idp && r.profile.program === 'senior') reasons.push('IDP yaratilmagan');
                return { ...r, reasons };
            })
            .filter(r => r.reasons.length > 0)
            .sort((a, b) => b.reasons.length - a.reasons.length);

        return { enriched, funnel, faculties, mentors, attention };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, version]);

    const nameOf = useMemo(() => {
        const map = new Map((db.getSyncedProfiles() || []).map(p => [p.username, p.fullName]));
        return (u) => map.get(u) || u;
    }, []);

    const maxFunnel = Math.max(1, data.funnel.enrolled);

    if (data.enriched.length === 0) {
        return (
            <Card className="text-center py-20">
                <Sparkles className="w-14 h-14 mx-auto mb-4 text-gray-200" />
                <p className="font-bold text-gray-500">Dasturda hali talaba yo'q</p>
                <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
                    "Talabalar" yoki "Takliflar" bo'limidan boshlang — dashboard shundan keyin to'ladi.
                </p>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-3 p-4 bg-violet-50 border border-violet-100 rounded-2xl">
                <Info className="w-5 h-5 text-violet-500 flex-shrink-0" />
                <p className="text-sm text-violet-800 flex-1">
                    Bu ekran <b>"bugun nechta stipendiatimiz bor?"</b> emas,
                    <b> "kelgusi 1–2 yilda nechta kuchli nomzodimiz bor?"</b> degan savolga javob beradi.
                </p>
                {run && (
                    <button onClick={() => run(async () => {
                        const res = await db.runTalentNotifications({ by: user?.username });
                        window.alert(
                            `${res.sent} ta bildirishnoma yuborildi.`
                            + (res.pendingRecognitions > 0
                                ? `\n\n${res.pendingRecognitions} ta natija bo'yicha rag'batlantirish kutilmoqda.`
                                : '')
                        );
                    })} disabled={busy}
                        className="px-4 py-2 bg-white border border-violet-200 rounded-xl text-xs font-bold text-violet-700 hover:bg-violet-100 flex-shrink-0 disabled:opacity-50">
                        Bildirishnomalarni yuborish
                    </button>
                )}
            </div>

            {/* Voronka */}
            <Card>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">
                    Talent Pipeline
                </p>
                <div className="space-y-2">
                    {FUNNEL.map(step => {
                        const value = data.funnel[step.key];
                        const pct = Math.round((value / maxFunnel) * 100);
                        return (
                            <div key={step.key} className="flex items-center gap-3">
                                <span className="text-sm font-bold text-gray-700 w-44 flex-shrink-0">
                                    {step.label}
                                </span>
                                <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden">
                                    <div className={`h-full ${step.color} transition-all flex items-center justify-end px-2`}
                                        style={{ width: `${Math.max(pct, value > 0 ? 6 : 0)}%` }}>
                                        {value > 0 && (
                                            <span className="text-xs font-black text-white">{value}</span>
                                        )}
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-gray-400 w-10 text-right">{pct}%</span>
                            </div>
                        );
                    })}
                </div>
                <p className="text-[11px] text-gray-400 mt-3">
                    Har bosqich — kamida bitta maqsadi shu darajaga yetgan talabalar soni.
                </p>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Fakultetlar */}
                <Card title="Fakultetlar kesimi" className="p-0 overflow-hidden">
                    <div className="p-5 space-y-3">
                        {data.faculties.map(f => (
                            <div key={f.faculty} className="space-y-1.5">
                                <div className="flex justify-between items-baseline gap-3">
                                    <span className="text-sm font-bold text-gray-800 truncate">{f.faculty}</span>
                                    <span className="text-xs text-gray-500 whitespace-nowrap">
                                        <b className="text-gray-900">{f.total}</b> talaba ·
                                        <span className="text-violet-600 font-bold"> {f.ready} nomzod</span>
                                        {f.won > 0 && <span className="text-emerald-600 font-bold"> · {f.won} g'olib</span>}
                                    </span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                                    <div className="h-full bg-emerald-500" style={{ width: `${(f.won / f.total) * 100}%` }} />
                                    <div className="h-full bg-violet-400" style={{ width: `${((f.ready - f.won) / f.total) * 100}%` }} />
                                    <div className="h-full bg-slate-200" style={{ width: `${((f.total - f.ready) / f.total) * 100}%` }} />
                                </div>
                                <p className="text-[11px] text-gray-400">
                                    O'rtacha Talent Score: {f.avgScore} / {TALENT_SCORE_MAX}
                                    {f.gradeA > 0 && ` · ${f.gradeA} ta yuqori salohiyat`}
                                </p>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Mentor ta'siri */}
                <Card title="Mentorlar faoliyati" className="p-0 overflow-hidden">
                    <div className="px-5 pt-4">
                        <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
                            <Info size={12} className="flex-shrink-0 mt-0.5" />
                            Bu <b>reyting emas</b>. 20 ta shogirdli mentorni 2 ta shogirdlisi bilan
                            oddiy yutuq soni bo'yicha solishtirish noto'g'ri bo'lardi — shuning uchun
                            nisbat ham ko'rsatiladi.
                        </p>
                    </div>
                    <div className="p-5 space-y-2">
                        {data.mentors.length === 0 && (
                            <p className="text-sm text-gray-400 italic text-center py-6">
                                Hali biriktiruv yo'q
                            </p>
                        )}
                        {data.mentors.map(m => (
                            <div key={m.personId} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-xl">
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-900 truncate">{nameOf(m.personId)}</p>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                        {m.roles.map(r => (
                                            <span key={r} className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${ASSIGNMENT_ROLES[r]?.tone}`}>
                                                {ASSIGNMENT_ROLES[r]?.short}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 flex-shrink-0 text-center">
                                    <div>
                                        <p className="text-lg font-black text-gray-900">{m.mentees}</p>
                                        <p className="text-[9px] uppercase font-bold tracking-wider text-gray-400">shogird</p>
                                    </div>
                                    <div>
                                        <p className="text-lg font-black text-violet-700">{m.ready}</p>
                                        <p className="text-[9px] uppercase font-bold tracking-wider text-gray-400">nomzod</p>
                                    </div>
                                    <div>
                                        <p className="text-lg font-black text-emerald-600">{m.won}</p>
                                        <p className="text-[9px] uppercase font-bold tracking-wider text-gray-400">g'olib</p>
                                    </div>
                                    <div className="w-12">
                                        <p className="text-sm font-black text-gray-700">{m.conversion}%</p>
                                        <p className="text-[9px] uppercase font-bold tracking-wider text-gray-400">nisbat</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            {/* E'tibor talab qiladiganlar */}
            {data.attention.length > 0 && (
                <Card className="p-0 overflow-hidden border-l-4 border-l-amber-400">
                    <div className="px-5 py-4 border-b border-gray-100">
                        <p className="font-black text-gray-900 flex items-center gap-2">
                            <AlertTriangle size={16} className="text-amber-500" />
                            E'tibor talab qiladi ({data.attention.length})
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                            Bu ro'yxat jazolash uchun emas — bu talabalarga qayerda yordam kerakligini ko'rsatadi.
                        </p>
                    </div>
                    <div className="p-5 space-y-2 max-h-96 overflow-y-auto">
                        {data.attention.map(r => (
                            <div key={r.profile.id} className="flex items-start justify-between gap-3 p-3 bg-amber-50/50 border border-amber-100 rounded-xl">
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-900">{r.student?.fullName}</p>
                                    <p className="text-[11px] text-gray-500">{r.profile.faculty}</p>
                                </div>
                                <div className="flex flex-wrap gap-1 justify-end flex-shrink-0 max-w-[60%]">
                                    {r.reasons.map((reason, i) => (
                                        <span key={i} className="text-[10px] px-2 py-0.5 bg-white border border-amber-200 rounded-md text-amber-800 font-semibold">
                                            {reason}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
};

export default TalentDashboardTab;
