import React, { useState, useMemo } from 'react';
import {
    Activity, Info, CheckCircle, Loader2, ChevronRight, TrendingUp, TrendingDown,
    Minus, Calendar, AlertTriangle
} from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import { db } from '../../services/db';
import {
    MONITORING_FLAGS, MONITORING_PURPOSE, MONITORING_ASPECTS,
    ASSIGNMENT_ROLES, TALENT_PROGRAMS,
} from '../../config/talent';

// Monitoring.
//
// 1-kursda OYLIK (tyutor + mentor), 2-kursdan SEMESTRLIK (mentor + ilmiy rahbar
// + fakultet). Davr shakli dasturga qarab o'zi tanlanadi.
//
// MUHIM: bu ko'rsatkichlar baholash yoki jazolash uchun EMAS. Interfeys buni
// har ekranda ochiq yozib turadi - aks holda 🔴 bayroq "yomon talaba" degan
// ma'noda o'qilib qolishi mumkin.

const currentMonthPeriod = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const currentSemesterPeriod = () => {
    const d = new Date();
    const y = d.getFullYear();
    return d.getMonth() >= 8 ? `${y}-${y + 1}/1` : `${y - 1}-${y}/2`;
};

const periodLabel = (period) => {
    if (period.includes('/')) {
        const [years, sem] = period.split('/');
        return `${years}, ${sem}-semestr`;
    }
    const [y, m] = period.split('-');
    const months = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
        'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
    return `${months[Number(m) - 1] || m} ${y}`;
};

const TalentMonitoringTab = ({ rows, assignableUsers, busy, version, user, run }) => {
    const [selected, setSelected] = useState(null);
    const [flagFilter, setFlagFilter] = useState('all');

    const items = useMemo(() => rows.map(r => {
        const history = db.getTalentMonitoring(r.profile.studentId);
        const isYear1 = r.profile.program === 'year1';
        const period = isYear1 ? currentMonthPeriod() : currentSemesterPeriod();
        const currentRecords = history.filter(m => m.period === period);
        const latest = history[0] || null;
        return { ...r, history, period, periodType: isYear1 ? 'month' : 'semester', currentRecords, latest };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [rows, version]);

    const filtered = useMemo(() => {
        if (flagFilter === 'all') return items;
        if (flagFilter === 'missing') return items.filter(i => i.currentRecords.length === 0);
        return items.filter(i => i.latest?.flag === flagFilter);
    }, [items, flagFilter]);

    const stats = useMemo(() => ({
        green: items.filter(i => i.latest?.flag === 'green').length,
        yellow: items.filter(i => i.latest?.flag === 'yellow').length,
        red: items.filter(i => i.latest?.flag === 'red').length,
        missing: items.filter(i => i.currentRecords.length === 0).length,
    }), [items]);

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-3 p-4 bg-sky-50 border border-sky-100 rounded-2xl">
                <Info className="w-5 h-5 text-sky-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-sky-800">{MONITORING_PURPOSE}</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    ['green', 'Yaxshi', stats.green],
                    ['yellow', 'Rivojlantirish kerak', stats.yellow],
                    ['red', "E'tibor talab qiladi", stats.red],
                    ['missing', 'Kuzatuv kiritilmagan', stats.missing],
                ].map(([key, label, value]) => {
                    const active = flagFilter === key;
                    const flag = MONITORING_FLAGS[key];
                    return (
                        <button key={key} onClick={() => setFlagFilter(active ? 'all' : key)}
                            className={`p-4 rounded-2xl border-2 text-left transition-all ${active ? 'border-gray-800 bg-white' : 'border-transparent bg-white hover:border-gray-200'}`}>
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`w-3 h-3 rounded-full ${flag ? flag.tone : 'bg-gray-300'}`} />
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
                            </div>
                            <p className="text-2xl font-black text-gray-900">{value}</p>
                        </button>
                    );
                })}
            </div>

            <div className="space-y-2">
                {filtered.length === 0 && (
                    <Card className="text-center py-16 text-gray-400 font-medium">
                        Talaba topilmadi
                    </Card>
                )}
                {filtered.map(item => {
                    const flag = MONITORING_FLAGS[item.latest?.flag] || null;
                    const prog = TALENT_PROGRAMS[item.profile.program];
                    return (
                        <Card key={item.profile.id} hover className="cursor-pointer"
                            onClick={() => setSelected(item)}>
                            <div className="flex flex-col md:flex-row justify-between gap-4">
                                <div className="flex items-start gap-3 min-w-0">
                                    <span className={`w-3 h-3 rounded-full flex-shrink-0 mt-1.5 ${flag ? flag.tone : 'bg-gray-200'}`} />
                                    <div className="min-w-0">
                                        <p className="font-black text-gray-900">{item.student?.fullName}</p>
                                        <p className="text-xs text-gray-500">
                                            {item.profile.faculty} · {item.student?.course}-kurs ·{' '}
                                            <span className="font-semibold">{prog?.short}</span>
                                        </p>
                                        <p className="text-[11px] text-gray-400 mt-1">
                                            Joriy davr: <b>{periodLabel(item.period)}</b>
                                            {item.currentRecords.length === 0 ? (
                                                <span className="text-amber-600 font-bold"> · kuzatuv kiritilmagan</span>
                                            ) : (
                                                <span> · {item.currentRecords.length} ta yozuv</span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    {item.latest && (
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${flag?.bg} ${flag?.textTone}`}>
                                            {flag?.label}
                                        </span>
                                    )}
                                    <span className="text-[11px] text-gray-400">{item.history.length} yozuv</span>
                                    <ChevronRight size={18} className="text-gray-300" />
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </div>

            <Modal isOpen={!!selected} onClose={() => setSelected(null)}
                title={selected ? `${selected.student?.fullName} — kuzatuv` : ''} size="lg">
                {selected && (
                    <MonitoringEditor
                        item={selected}
                        assignableUsers={assignableUsers}
                        busy={busy}
                        user={user}
                        run={run}
                        onDone={() => setSelected(null)}
                    />
                )}
            </Modal>
        </div>
    );
};

// ---------------------------------------------------------------------------
const MonitoringEditor = ({ item, assignableUsers, busy, user, run, onDone }) => {
    const myRoles = useMemo(
        () => item.assignments.filter(a => a.personId === user?.username).map(a => a.role),
        [item.assignments, user]
    );
    // Admin ham kuzatuv yozishi mumkin - "fakultet" roli ostida.
    const [role, setRole] = useState(myRoles[0] || 'faculty');
    const [period, setPeriod] = useState(item.period);
    const [flag, setFlag] = useState('green');
    const [ratings, setRatings] = useState({});
    const [notes, setNotes] = useState('');
    const [problems, setProblems] = useState('');
    const [recommendations, setRecommendations] = useState('');
    const [nextGoals, setNextGoals] = useState('');

    const nameOf = useMemo(() => {
        const map = new Map(assignableUsers.map(u => [u.username, u.fullName]));
        return (username) => map.get(username) || username;
    }, [assignableUsers]);

    // Shu davr va rol uchun mavjud yozuv - qayta yozilsa yangilanadi.
    const existing = item.history.find(m => m.period === period && m.byRole === role);

    React.useEffect(() => {
        if (existing) {
            setFlag(existing.flag || 'green');
            setRatings(existing.ratings || {});
            setNotes(existing.notes || '');
            setProblems(existing.problems || '');
            setRecommendations(existing.recommendations || '');
            setNextGoals(existing.nextGoals || '');
        } else {
            setFlag('green'); setRatings({}); setNotes('');
            setProblems(''); setRecommendations(''); setNextGoals('');
        }
    }, [existing]);

    const save = () => run(async () => {
        await db.saveTalentMonitoring({
            studentId: item.profile.studentId, period, periodType: item.periodType,
            byId: user?.username, byRole: role, flag,
            ratings, notes, problems, recommendations, nextGoals,
        });
        onDone();
    }, 'Kuzatuv saqlandi');

    // Akademik dinamika - monitoringning eng muhim signali: past GPA emas,
    // TUSHISH tendensiyasi e'tibor talab qiladi.
    const trend = db.getStudentGPATrend(item.profile.studentId);
    const TrendIcon = trend.trend === 'up' ? TrendingUp : trend.trend === 'down' ? TrendingDown : Minus;

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-3 p-3 bg-sky-50 border border-sky-100 rounded-xl">
                <Info size={16} className="text-sky-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-sky-800">{MONITORING_PURPOSE}</p>
            </div>

            {/* Kontekst */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                    ['GPA', db.getStudentAverageGPA(item.profile.studentId) ?? '—'],
                    ['Faollik bali', db.getStudentSocialScoreTotal(item.profile.studentId)],
                    ['Talent Score', item.scored.score],
                    ['Mas\'ullar', item.assignments.length],
                ].map(([label, value]) => (
                    <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                        <p className="text-xl font-black text-gray-900">{value}</p>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400">{label}</p>
                    </div>
                ))}
            </div>

            {trend.trend !== 'unknown' && (
                <div className={`flex items-center gap-2 p-3 rounded-xl border ${trend.trend === 'down' ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                    <TrendIcon size={16} className={trend.trend === 'down' ? 'text-amber-600' : 'text-gray-500'} />
                    <p className="text-xs text-gray-700">
                        Akademik dinamika:{' '}
                        <b>{trend.trend === 'up' ? "o'smoqda" : trend.trend === 'down' ? 'tushmoqda' : 'barqaror'}</b>
                        {' '}({trend.delta > 0 ? '+' : ''}{trend.delta})
                        {trend.trend === 'down' && ' — sabablarini aniqlash tavsiya etiladi'}
                    </p>
                </div>
            )}

            {/* Davr va rol */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                        Davr ({item.periodType === 'month' ? 'oylik' : 'semestrlik'})
                    </label>
                    <input type="text" value={period} onChange={e => setPeriod(e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-sm" />
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                        Kim sifatida
                    </label>
                    <select value={role} onChange={e => setRole(e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-sm">
                        {Object.values(ASSIGNMENT_ROLES).map(r => (
                            <option key={r.id} value={r.id}>{r.label}</option>
                        ))}
                        <option value="faculty">Fakultet / admin</option>
                    </select>
                </div>
            </div>

            {existing && (
                <p className="text-[11px] text-amber-600 font-semibold flex items-center gap-1">
                    <AlertTriangle size={12} /> Bu davr va rol uchun yozuv bor — saqlansa yangilanadi.
                </p>
            )}

            {/* Bayroq */}
            <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                    Umumiy holat
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.entries(MONITORING_FLAGS).map(([k, v]) => (
                        <button key={k} type="button" onClick={() => setFlag(k)}
                            className={`p-3 rounded-xl border-2 transition-all ${flag === k ? 'border-gray-800 ' + v.bg : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                            <span className={`w-3 h-3 rounded-full inline-block mb-1 ${v.tone}`} />
                            <p className={`text-xs font-bold ${flag === k ? v.textTone : 'text-gray-600'}`}>{v.label}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Jihatlar */}
            <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                    Jihatlar bo'yicha
                </label>
                <div className="space-y-1.5">
                    {MONITORING_ASPECTS.map(aspect => (
                        <div key={aspect.key} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                            <span className="text-sm font-semibold text-gray-700 flex-1">{aspect.label}</span>
                            <div className="flex gap-1">
                                {Object.entries(MONITORING_FLAGS).map(([k, v]) => (
                                    <button key={k} type="button"
                                        onClick={() => setRatings(r => ({ ...r, [aspect.key]: k }))}
                                        title={v.label}
                                        className={`w-6 h-6 rounded-md border-2 transition-all ${ratings[aspect.key] === k ? 'border-gray-800 scale-110' : 'border-transparent opacity-40 hover:opacity-70'} ${v.tone}`} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Matnli qismlar */}
            {[
                ['Kuzatuv izohi', notes, setNotes, "Uchrashuvda nimalar muhokama qilindi..."],
                ['Aniqlangan muammolar', problems, setProblems, "Talabaga qayerda yordam kerak..."],
                ['Tavsiyalar', recommendations, setRecommendations, 'Qanday yordam beriladi...'],
                ['Keyingi davr maqsadlari', nextGoals, setNextGoals, 'Nimalarga erishish kerak...'],
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
                icon={busy ? Loader2 : CheckCircle} onClick={save}>
                Kuzatuvni saqlash
            </Button>

            {/* Tarix */}
            {item.history.length > 0 && (
                <div className="pt-4 border-t border-gray-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                        Kuzatuv tarixi
                    </p>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                        {item.history.map(m => {
                            const f = MONITORING_FLAGS[m.flag] || MONITORING_FLAGS.green;
                            return (
                                <div key={m.id} className={`p-3 rounded-xl border ${f.bg} border-gray-100`}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`w-2.5 h-2.5 rounded-full ${f.tone}`} />
                                        <span className="text-xs font-black text-gray-800">{periodLabel(m.period)}</span>
                                        <span className="text-[10px] text-gray-500">
                                            {ASSIGNMENT_ROLES[m.byRole]?.short || 'Fakultet'} · {nameOf(m.byId)}
                                        </span>
                                    </div>
                                    {m.notes && <p className="text-[11px] text-gray-700">{m.notes}</p>}
                                    {m.problems && (
                                        <p className="text-[11px] text-amber-700 mt-0.5">
                                            <b>Muammo:</b> {m.problems}
                                        </p>
                                    )}
                                    {m.recommendations && (
                                        <p className="text-[11px] text-emerald-700 mt-0.5">
                                            <b>Tavsiya:</b> {m.recommendations}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TalentMonitoringTab;
