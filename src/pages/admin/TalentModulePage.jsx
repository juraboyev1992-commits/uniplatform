import React, { useState, useMemo, useCallback } from 'react';
import {
    Sparkles, Users, Search, Plus, AlertTriangle, CheckCircle, XCircle, Info,
    Loader2, Settings, Eye, UserPlus, Lightbulb, ClipboardList, GraduationCap,
    TrendingUp, TrendingDown, Minus, Award, Building2, Filter
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import {
    TALENT_PROGRAMS, PROFILE_STATUS, ENTRY_ROUTES, POTENTIAL_GRADES,
    TALENT_DIMENSIONS, TALENT_SCORE_MAX, ASSIGNMENT_ROLES, ASSIGNMENT_ROLE_ORDER,
    MONITORING_PURPOSE,
} from '../../config/talent';
import {
    collectDimensionValues, computeTalentScore, buildTalentPortfolio,
    suggestSeniorCandidates, suggestYear1Candidates, getYear1WithoutSurvey,
    computeSurveyPotential, SURVEY_SIGNALS,
} from '../../utils/talentScoring';
import { getDocumentTypeLabel } from '../../config/documents';
import TalentIdpTab from '../../components/admin/TalentIdpTab';
import TalentMonitoringTab from '../../components/admin/TalentMonitoringTab';
import TalentTargetsTab from '../../components/admin/TalentTargetsTab';
import TalentDashboardTab from '../../components/admin/TalentDashboardTab';
import TalentRecognitionTab from '../../components/admin/TalentRecognitionTab';
import { useTabParam } from '../../hooks/useTabParam';

const TABS = [
    ['dashboard', 'Dashboard'],
    ['students', 'Talabalar'],
    ['idp', 'IDP va maqsadlar'],
    ['monitoring', 'Monitoring'],
    ['targets', 'Nomzodlar'],
    ['recognition', "Rag'batlantirish"],
    ['suggestions', 'Takliflar'],
    ['assignments', 'Biriktirishlar'],
];

const TAB_IDS = TABS.map(([id]) => id);

const TalentModulePage = () => {
    const { user } = useAuth();
    const [version, setVersion] = useState(0);
    const bump = useCallback(() => setVersion(v => v + 1), []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [flash, setFlash] = useState('');
    const [tab, setTab] = useTabParam(TAB_IDS, 'dashboard');

    const backendReady = useMemo(() => db.isTalentBackendReady(), [version]);
    const students = useMemo(() => db.getMockStudents(), []);
    const studentById = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);
    const faculties = useMemo(
        () => [...new Set(students.map(s => s.faculty).filter(Boolean))].sort(),
        [students]
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const profiles = useMemo(() => db.getTalentProfiles(), [version]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const assignments = useMemo(() => db.getTalentAssignments(), [version]);

    const assignableUsers = useMemo(() => {
        const list = (db.getSyncedProfiles() || []).filter(p => p.username);
        return list.map(p => ({ username: p.username, fullName: p.fullName || p.username, role: p.role }))
            .sort((a, b) => a.fullName.localeCompare(b.fullName));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [version]);

    const run = async (fn, successMsg) => {
        setBusy(true); setError(''); setFlash('');
        try {
            await fn();
            bump();
            if (successMsg) setFlash(successMsg);
        } catch (e) {
            console.error('[iqtidorli talabalar] amal bajarilmadi:', e);
            setError(e.message || String(e));
        } finally { setBusy(false); }
    };

    // Har bir profil uchun jonli Talent Score.
    const rows = useMemo(() => profiles.map(p => {
        const student = studentById.get(p.studentId);
        const values = collectDimensionValues(db, p.studentId, p);
        const scored = computeTalentScore(values);
        return {
            profile: p,
            student,
            values,
            scored,
            assignments: assignments.filter(a => a.studentId === p.studentId && a.active),
            survey: computeSurveyPotential(p.survey),
        };
    }), [profiles, studentById, assignments]);

    const stats = useMemo(() => ({
        total: rows.length,
        year1: rows.filter(r => r.profile.program === 'year1').length,
        senior: rows.filter(r => r.profile.program === 'senior').length,
        gradeA: rows.filter(r => r.profile.potentialGrade === 'A').length,
        noMentor: rows.filter(r => r.assignments.length === 0).length,
    }), [rows]);

    // --- Filtrlar ---
    const [q, setQ] = useState('');
    const [programFilter, setProgramFilter] = useState('all');
    const [facultyFilter, setFacultyFilter] = useState('all');

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return rows.filter(r => {
            if (programFilter !== 'all' && r.profile.program !== programFilter) return false;
            if (facultyFilter !== 'all' && r.profile.faculty !== facultyFilter) return false;
            if (!needle) return true;
            return `${r.student?.fullName || ''} ${r.student?.group || ''}`.toLowerCase().includes(needle);
        }).sort((a, b) => (b.scored.score - a.scored.score));
    }, [rows, q, programFilter, facultyFilter]);

    // --- Dasturga qo'shish ---
    const [addOpen, setAddOpen] = useState(false);
    const [addQuery, setAddQuery] = useState('');
    const [addSelection, setAddSelection] = useState([]);
    const [addProgram, setAddProgram] = useState('year1');

    const enrolledIds = useMemo(() => new Set(profiles.map(p => p.studentId)), [profiles]);

    const addCandidates = useMemo(() => {
        const needle = addQuery.trim().toLowerCase();
        return students
            .filter(s => !enrolledIds.has(s.id))
            .filter(s => !needle || `${s.fullName} ${s.group} ${s.faculty}`.toLowerCase().includes(needle))
            .slice(0, 60);
    }, [students, enrolledIds, addQuery]);

    const enrollSelected = () => run(async () => {
        for (const studentId of addSelection) {
            await db.enrollTalentStudent({
                studentId, program: addProgram, entryRoute: 'nomination', by: user?.username,
            });
        }
        setAddSelection([]);
        setAddOpen(false);
    }, `${addSelection.length} ta talaba dasturga qo'shildi`);

    // --- Profil ko'rish ---
    const [detail, setDetail] = useState(null);

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-violet-600 to-indigo-700 rounded-2xl p-8 text-white shadow-xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div>
                    <h1 className="text-3xl font-bold mb-1 flex items-center gap-3">
                        <Sparkles className="w-8 h-8" /> Iqtidorli talabalar
                    </h1>
                    <p className="text-violet-100">
                        1-kursdan bitiruvgacha kuzatib borish, tayyorlash va natijaga olib chiqish
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {[
                        ['Jami', stats.total], ['1-kurs', stats.year1], ['Yuqori kurs', stats.senior],
                        ['Yuqori salohiyat', stats.gradeA],
                    ].map(([label, value]) => (
                        <div key={label} className="bg-white/15 backdrop-blur rounded-xl px-4 py-2.5 text-center min-w-[92px]">
                            <p className="text-2xl font-black">{value}</p>
                            <p className="text-[10px] uppercase font-bold tracking-widest opacity-80">{label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {!backendReady && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border-2 border-red-300 rounded-2xl">
                    <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-black text-red-800">Modul jadvallari serverda topilmadi</p>
                        <p className="text-sm text-red-700 mt-1">
                            <code className="px-1.5 py-0.5 bg-red-100 rounded font-mono text-xs">supabase/talent_phase1.sql</code>{' '}
                            ishga tushirilganmi? Tushirilgan bo'lsa — chiqib, qaytadan kiring.
                        </p>
                    </div>
                </div>
            )}

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

            {/* Tablar.
                7 ta tab + filtrlar bitta qatorga sig'maydi, shuning uchun:
                  - tab lentasi o'z ichida gorizontal siljiydi (kesilmaydi)
                  - filtrlar guruhi keyingi qatorga o'tadi
                Sahifaning o'zi hech qachon gorizontal siljimaydi. */}
            <div className="space-y-3">
                <div className="-mx-1 px-1 overflow-x-auto">
                    <div className="inline-flex bg-white p-1 rounded-2xl border border-gray-100 shadow-sm">
                        {TABS.map(([id, label]) => (
                            <button key={id} onClick={() => setTab(id)}
                                className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex-shrink-0 ${tab === id ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'text-gray-500 hover:bg-gray-50'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    {tab === 'students' && (
                        <>
                            <select value={programFilter} onChange={e => setProgramFilter(e.target.value)}
                                className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold">
                                <option value="all">Ikkala dastur</option>
                                {Object.values(TALENT_PROGRAMS).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                            </select>
                            <select value={facultyFilter} onChange={e => setFacultyFilter(e.target.value)}
                                className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold max-w-[200px]">
                                <option value="all">Barcha fakultetlar</option>
                                {faculties.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                            <div className="relative flex-1 min-w-[180px] max-w-xs">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Qidirish..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium" />
                            </div>
                        </>
                    )}
                    <Button variant="primary" icon={UserPlus} onClick={() => setAddOpen(true)}
                        className="font-bold shadow-lg shadow-violet-100 ml-auto flex-shrink-0">
                        Dasturga qo'shish
                    </Button>
                </div>
            </div>

            {/* ============ DASHBOARD ============ */}
            {tab === 'dashboard' && (
                <TalentDashboardTab rows={rows} version={version} busy={busy} user={user} run={run} />
            )}

            {/* ============ TALABALAR ============ */}
            {tab === 'students' && (
                <Card className="p-0 overflow-hidden shadow-sm border-none">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase tracking-widest border-b border-gray-100">
                                <tr>
                                    <th className="px-6 py-5">Talaba</th>
                                    <th className="px-6 py-5">Dastur</th>
                                    <th className="px-6 py-5 text-center">Talent Score</th>
                                    <th className="px-6 py-5">O'lchovlar</th>
                                    <th className="px-6 py-5">Mas'ullar</th>
                                    <th className="px-6 py-5 text-center">Salohiyat</th>
                                    <th className="px-6 py-5 text-right">Amallar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.length === 0 && (
                                    <tr><td colSpan={7} className="px-6 py-16 text-center text-gray-400 font-medium">
                                        Dasturda talaba yo'q — "Dasturga qo'shish" yoki "Takliflar" bo'limidan boshlang
                                    </td></tr>
                                )}
                                {filtered.map(r => {
                                    const prog = TALENT_PROGRAMS[r.profile.program] || TALENT_PROGRAMS.year1;
                                    const grade = POTENTIAL_GRADES[r.profile.potentialGrade];
                                    return (
                                        <tr key={r.profile.id} className="hover:bg-violet-50/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <p className="font-bold text-gray-900 text-sm">{r.student?.fullName || r.profile.studentId}</p>
                                                <p className="text-[11px] text-gray-400">
                                                    {r.profile.faculty} · {r.student?.course}-kurs · {r.student?.group}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${prog.tone}`}>
                                                    {prog.short}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <p className="text-2xl font-black text-violet-700">{r.scored.score}</p>
                                                <p className="text-[10px] text-gray-400">/ {TALENT_SCORE_MAX}</p>
                                                {r.scored.missing.length > 0 && (
                                                    <p className="text-[10px] text-amber-600 font-bold">
                                                        {r.scored.missing.length} o'lchov yo'q
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex gap-1 items-end h-8">
                                                    {r.scored.parts.map(p => (
                                                        <div key={p.key} title={`${p.label}: ${p.known ? `${p.points}/${p.max}` : "ma'lumot yo'q"}`}
                                                            className="w-3 bg-gray-100 rounded-sm relative overflow-hidden" style={{ height: '100%' }}>
                                                            <div className={`absolute bottom-0 left-0 right-0 ${p.known ? p.color : 'bg-gray-200'}`}
                                                                style={{ height: `${p.known ? (p.points / p.max) * 100 : 100}%`, opacity: p.known ? 1 : 0.35 }} />
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {r.assignments.length === 0 ? (
                                                    <span className="text-[11px] text-amber-600 font-bold">biriktirilmagan</span>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1">
                                                        {r.assignments.map(a => (
                                                            <span key={a.id} className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${ASSIGNMENT_ROLES[a.role]?.tone}`}>
                                                                {ASSIGNMENT_ROLES[a.role]?.short}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {grade ? (
                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${grade.tone}`}>
                                                        {r.profile.potentialGrade} · {grade.label}
                                                    </span>
                                                ) : <span className="text-[11px] text-gray-300">baholanmagan</span>}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button onClick={() => setDetail(r)}
                                                    className="p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition-all" title="Profil">
                                                    <Eye size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* ============ IDP ============ */}
            {tab === 'idp' && (
                <TalentIdpTab
                    rows={rows}
                    assignableUsers={assignableUsers}
                    busy={busy}
                    version={version}
                    user={user}
                    run={run}
                />
            )}

            {/* ============ MONITORING ============ */}
            {tab === 'monitoring' && (
                <TalentMonitoringTab
                    rows={rows}
                    assignableUsers={assignableUsers}
                    busy={busy}
                    version={version}
                    user={user}
                    run={run}
                />
            )}

            {/* ============ NOMZODLAR ============ */}
            {tab === 'targets' && (
                <TalentTargetsTab
                    rows={rows}
                    busy={busy}
                    version={version}
                    user={user}
                    run={run}
                />
            )}

            {/* ============ RAG'BATLANTIRISH ============ */}
            {tab === 'recognition' && (
                <TalentRecognitionTab busy={busy} version={version} user={user} run={run} />
            )}

            {/* ============ TAKLIFLAR ============ */}
            {tab === 'suggestions' && (
                <SuggestionsTab
                    faculties={faculties}
                    busy={busy}
                    version={version}
                    onEnroll={(studentId, program) => run(
                        () => db.enrollTalentStudent({ studentId, program, entryRoute: 'achievement', by: user?.username }),
                        'Talaba dasturga qo\'shildi'
                    )}
                />
            )}

            {/* ============ BIRIKTIRISHLAR ============ */}
            {tab === 'assignments' && (
                <AssignmentsTab
                    rows={rows}
                    assignableUsers={assignableUsers}
                    busy={busy}
                    onAssign={(studentId, personId, role) => run(
                        () => db.assignTalentPerson({ studentId, personId, role, by: user?.username }),
                        'Biriktirildi'
                    )}
                    onEnd={(assignmentId) => run(
                        () => db.endTalentAssignment(assignmentId, user?.username),
                        'Biriktiruv yakunlandi'
                    )}
                />
            )}

            {/* Dasturga qo'shish modali */}
            <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Dasturga qo'shish" size="lg">
                <div className="space-y-4">
                    <div className="flex gap-3">
                        <select value={addProgram} onChange={e => setAddProgram(e.target.value)}
                            className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-semibold">
                            {Object.values(TALENT_PROGRAMS).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input type="text" value={addQuery} onChange={e => setAddQuery(e.target.value)}
                                placeholder="Talaba, guruh yoki fakultet..."
                                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium" />
                        </div>
                    </div>

                    <p className="text-xs text-gray-500">
                        {TALENT_PROGRAMS[addProgram].purpose}
                    </p>

                    <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
                        {addCandidates.map(s => {
                            const on = addSelection.includes(s.id);
                            return (
                                <label key={s.id}
                                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${on ? 'bg-violet-50 border-violet-300' : 'bg-white border-gray-200 hover:border-violet-200'}`}>
                                    <input type="checkbox" checked={on}
                                        onChange={() => setAddSelection(sel => on ? sel.filter(x => x !== s.id) : [...sel, s.id])}
                                        className="w-4 h-4 text-violet-600 rounded border-gray-300" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-gray-900 truncate">{s.fullName}</p>
                                        <p className="text-[11px] text-gray-500 truncate">{s.faculty} · {s.course}-kurs · {s.group}</p>
                                    </div>
                                </label>
                            );
                        })}
                        {addCandidates.length === 0 && (
                            <p className="text-sm text-gray-400 italic text-center py-8">Talaba topilmadi</p>
                        )}
                    </div>

                    <div className="flex gap-3 pt-2 border-t border-gray-100">
                        <Button variant="secondary" className="flex-1" onClick={() => setAddOpen(false)}>Bekor qilish</Button>
                        <Button variant="primary" className="flex-1" disabled={busy || addSelection.length === 0}
                            icon={busy ? Loader2 : Plus} onClick={enrollSelected}>
                            {addSelection.length > 0 ? `${addSelection.length} tani qo'shish` : "Qo'shish"}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Talent profil */}
            <Modal isOpen={!!detail} onClose={() => setDetail(null)}
                title={detail?.student?.fullName || ''} size="lg">
                {detail && (
                    <TalentProfileDetail
                        row={detail}
                        busy={busy}
                        assignableUsers={assignableUsers}
                        onSaveSurvey={(survey) => run(
                            () => db.updateTalentProfile(detail.profile.studentId, { survey }, user?.username),
                            "So'rovnoma saqlandi"
                        )}
                        onSaveDeclared={(declared) => run(
                            () => db.updateTalentProfile(detail.profile.studentId, { declared }, user?.username),
                            'Saqlandi'
                        )}
                        onSetGrade={(grade) => run(
                            () => db.updateTalentProfile(detail.profile.studentId, { potentialGrade: grade }, user?.username),
                            'Salohiyat darajasi belgilandi'
                        )}
                        onSetProgram={(program) => run(
                            () => db.updateTalentProfile(detail.profile.studentId, { program }, user?.username),
                            "Dastur o'zgartirildi"
                        )}
                        onAssign={(personId, role) => run(
                            () => db.assignTalentPerson({ studentId: detail.profile.studentId, personId, role, by: user?.username }),
                            'Biriktirildi'
                        )}
                    />
                )}
            </Modal>
        </div>
    );
};

// ---------------------------------------------------------------------------
// TAKLIFLAR
//
// Ikki rejim, chunki 1-kursda platformada hech qanday tarix yo'q:
//   - Yuqori kurs: real reyestrlardan (ball, hujjat, GPA, klub)
//   - 1-kurs: faqat dastlabki so'rovnomadan
// So'rovnoma to'ldirilmagan bo'lsa taklif berilmaydi va buning sababi ochiq
// yoziladi - tasodifiy ro'yxat ko'rsatishdan yaxshiroq.
// ---------------------------------------------------------------------------
const SuggestionsTab = ({ faculties, busy, version, onEnroll }) => {
    const [mode, setMode] = useState('senior');
    const [faculty, setFaculty] = useState('all');

    const seniorList = useMemo(
        () => suggestSeniorCandidates(db, { faculty: faculty === 'all' ? null : faculty }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [faculty, version]
    );
    const year1List = useMemo(
        () => suggestYear1Candidates(db, { faculty: faculty === 'all' ? null : faculty }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [faculty, version]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const noSurvey = useMemo(() => getYear1WithoutSurvey(db), [version]);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap gap-3 items-center">
                <div className="flex bg-white p-1 rounded-xl border border-gray-100 shadow-sm">
                    {[['senior', 'Yuqori kurs (2-4)'], ['year1', '1-kurs']].map(([id, label]) => (
                        <button key={id} onClick={() => setMode(id)}
                            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${mode === id ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                            {label}
                        </button>
                    ))}
                </div>
                <select value={faculty} onChange={e => setFaculty(e.target.value)}
                    className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold max-w-[220px]">
                    <option value="all">Barcha fakultetlar</option>
                    {faculties.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
            </div>

            {mode === 'senior' ? (
                <>
                    <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                        <Lightbulb className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-indigo-800">
                            Bu ro'yxat platformaning <b>real ma'lumotidan</b> tuzilgan: ijtimoiy faollik ballari,
                            berilgan diplom va sertifikatlar, GPA, klublardagi rollar. Har bir taklifning
                            sababi ko'rsatilgan.
                        </p>
                    </div>

                    {seniorList.length === 0 ? (
                        <Card className="text-center py-16">
                            <Lightbulb className="w-14 h-14 mx-auto mb-4 text-gray-200" />
                            <p className="font-bold text-gray-500">Taklif qilinadigan talaba topilmadi</p>
                            <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
                                Yutuq va ballar to'planishi bilan bu ro'yxat o'zi to'ladi.
                            </p>
                        </Card>
                    ) : (
                        <div className="space-y-2">
                            {seniorList.map(({ student, scored, reasons }) => (
                                <Card key={student.id} className="border-l-4 border-l-indigo-500">
                                    <div className="flex flex-col md:flex-row justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className="font-black text-gray-900">{student.fullName}</p>
                                            <p className="text-xs text-gray-500">
                                                {student.faculty} · {student.course}-kurs · {student.group}
                                            </p>
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {reasons.map((r, i) => (
                                                    <span key={i} className="text-[11px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md font-semibold">
                                                        {r}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 flex-shrink-0">
                                            <div className="text-center">
                                                <p className="text-2xl font-black text-indigo-700">{scored.score}</p>
                                                <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400">ball</p>
                                            </div>
                                            <Button variant="primary" icon={Plus} disabled={busy}
                                                onClick={() => onEnroll(student.id, 'senior')}>
                                                Qo'shish
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                <>
                    <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                        <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-800">
                            <b>1-kursda platformada hali tarix yo'q</b> — ball ham, yutuq ham, davomat ham.
                            Shuning uchun bu yerda saralash faqat <b>dastlabki so'rovnoma</b> asosida ishlaydi:
                            kirish bali, olimpiadalar, maxsus maktab, til darajasi. Talaba avval dasturga
                            qo'shilib, so'rovnomani to'ldirishi kerak.
                        </p>
                    </div>

                    {noSurvey.length > 0 && (
                        <Card className="border-l-4 border-l-amber-400">
                            <p className="font-bold text-gray-900 text-sm mb-1">
                                {noSurvey.length} ta 1-kurs talabasining so'rovnomasi to'ldirilmagan
                            </p>
                            <p className="text-xs text-gray-500 mb-3">
                                Ular saralashda qatnashmaydi. So'rovnomani talaba o'zi yoki tyutor to'ldirishi mumkin
                                (talaba profilini oching → "So'rovnoma").
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {noSurvey.slice(0, 20).map(({ profile, student }) => (
                                    <span key={profile.id} className="text-[11px] px-2 py-1 bg-gray-100 rounded-md text-gray-600 font-semibold">
                                        {student.fullName}
                                    </span>
                                ))}
                                {noSurvey.length > 20 && (
                                    <span className="text-[11px] text-gray-400">+{noSurvey.length - 20}</span>
                                )}
                            </div>
                        </Card>
                    )}

                    {year1List.length === 0 ? (
                        <Card className="text-center py-14">
                            <ClipboardList className="w-14 h-14 mx-auto mb-4 text-gray-200" />
                            <p className="font-bold text-gray-500">To'ldirilgan so'rovnoma yo'q</p>
                        </Card>
                    ) : (
                        <div className="space-y-2">
                            {year1List.map(({ student, potential }) => (
                                <Card key={student.id} className="border-l-4 border-l-sky-500">
                                    <div className="flex flex-col md:flex-row justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className="font-black text-gray-900">{student.fullName}</p>
                                            <p className="text-xs text-gray-500">{student.faculty} · {student.group}</p>
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {potential.parts.filter(p => p.known && p.points > 0).map(p => (
                                                    <span key={p.key} className="text-[11px] px-2 py-0.5 bg-sky-50 text-sky-700 rounded-md font-semibold">
                                                        {p.label}: {p.raw}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="text-center flex-shrink-0">
                                            <p className="text-2xl font-black text-sky-700">{potential.score}</p>
                                            <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400">
                                                / {potential.max}
                                            </p>
                                            <p className="text-[10px] text-gray-400">{potential.coverage}% to'ldirilgan</p>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// BIRIKTIRISHLAR
// ---------------------------------------------------------------------------
const AssignmentsTab = ({ rows, assignableUsers, busy, onAssign, onEnd }) => {
    const [roleFilter, setRoleFilter] = useState('all');
    const [pending, setPending] = useState({});   // studentId::role -> username

    // Ism biriktiruv yozuvida saqlanmaydi (username yetarli) - ko'rsatishda
    // profillardan olinadi, ism o'zgarsa avtomatik yangilanadi.
    const nameOf = useMemo(() => {
        const map = new Map(assignableUsers.map(u => [u.username, u.fullName]));
        return (username) => map.get(username) || username;
    }, [assignableUsers]);

    const missing = rows.filter(r => r.assignments.length < 3);

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-3 p-4 bg-violet-50 border border-violet-100 rounded-2xl">
                <Info className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-violet-800">
                    Bir talabani uchala mas'ul ham qo'llab-quvvatlashi mumkin, bir odam esa bir nechta
                    rolda va bir nechta talabaga biriktirilishi mumkin. Vakolat <b>biriktiruvga</b>
                    {' '}bog'liq — platformada hali alohida tyutor/dekan rollari yo'q.
                </p>
            </div>

            <div className="flex gap-2 items-center">
                <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
                    className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold">
                    <option value="all">Barcha rollar</option>
                    {ASSIGNMENT_ROLE_ORDER.map(r => <option key={r} value={r}>{ASSIGNMENT_ROLES[r].label}</option>)}
                </select>
                <span className="text-xs text-gray-500 font-semibold">
                    {missing.length} ta talabada biriktiruv to'liq emas
                </span>
            </div>

            <div className="space-y-3">
                {rows.length === 0 && (
                    <Card className="text-center py-16 text-gray-400 font-medium">
                        Dasturda talaba yo'q
                    </Card>
                )}
                {rows.map(r => (
                    <Card key={r.profile.id}>
                        <div className="flex flex-col lg:flex-row justify-between gap-4">
                            <div className="min-w-0">
                                <p className="font-black text-gray-900">{r.student?.fullName}</p>
                                <p className="text-xs text-gray-500">{r.profile.faculty} · {r.student?.course}-kurs</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 max-w-3xl">
                                {ASSIGNMENT_ROLE_ORDER
                                    .filter(role => roleFilter === 'all' || roleFilter === role)
                                    .map(role => {
                                        const meta = ASSIGNMENT_ROLES[role];
                                        const current = r.assignments.find(a => a.role === role);
                                        const key = `${r.profile.studentId}::${role}`;
                                        return (
                                            <div key={role} className={`p-3 rounded-xl border ${meta.tone}`}>
                                                <p className="text-[10px] font-black uppercase tracking-widest mb-1.5">{meta.label}</p>
                                                {current ? (
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-sm font-bold text-gray-900 truncate">
                                                            {nameOf(current.personId)}
                                                        </span>
                                                        <button onClick={() => onEnd(current.id)} disabled={busy}
                                                            className="text-gray-400 hover:text-red-600 flex-shrink-0">
                                                            <XCircle size={15} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex gap-1.5">
                                                        <select value={pending[key] || ''}
                                                            onChange={e => setPending(p => ({ ...p, [key]: e.target.value }))}
                                                            className="flex-1 min-w-0 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-xs">
                                                            <option value="">Tanlang...</option>
                                                            {assignableUsers.map(u => (
                                                                <option key={u.username} value={u.username}>{u.fullName}</option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            onClick={() => pending[key] && onAssign(r.profile.studentId, pending[key], role)}
                                                            disabled={busy || !pending[key]}
                                                            className="px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-violet-700 disabled:opacity-30">
                                                            <Plus size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// TALENT PROFIL
// ---------------------------------------------------------------------------
const TalentProfileDetail = ({ row, busy, assignableUsers, onSaveSurvey, onSaveDeclared, onSetGrade, onSetProgram, onAssign }) => {
    const [section, setSection] = useState('overview');
    const [survey, setSurvey] = useState(row.profile.survey || {});
    const [declared, setDeclared] = useState(row.profile.declared || {});

    const portfolio = useMemo(
        () => buildTalentPortfolio(db, row.profile.studentId),
        [row.profile.studentId]
    );
    const surveyPotential = computeSurveyPotential(survey);

    const TrendIcon = portfolio.academic.trend.trend === 'up' ? TrendingUp
        : portfolio.academic.trend.trend === 'down' ? TrendingDown : Minus;

    return (
        <div className="space-y-5">
            {/* Sarlavha */}
            <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-2xl">
                <div className="min-w-0">
                    <p className="font-black text-gray-900">{row.student?.fullName}</p>
                    <p className="text-xs text-gray-500">
                        {row.profile.faculty} · {row.student?.course}-kurs · {row.student?.group}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                        <select value={row.profile.program} onChange={e => onSetProgram(e.target.value)} disabled={busy}
                            className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-[11px] font-bold">
                            {Object.values(TALENT_PROGRAMS).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                        <select value={row.profile.potentialGrade || ''} onChange={e => onSetGrade(e.target.value || null)} disabled={busy}
                            className="px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-[11px] font-bold">
                            <option value="">Salohiyat baholanmagan</option>
                            {Object.entries(POTENTIAL_GRADES).map(([k, v]) => (
                                <option key={k} value={k}>{k} — {v.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="text-center flex-shrink-0">
                    <p className="text-4xl font-black text-violet-700">{row.scored.score}</p>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400">/ {TALENT_SCORE_MAX}</p>
                </div>
            </div>

            <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
                {[['overview', 'Ko\'rsatkichlar'], ['portfolio', 'Portfolio'], ['survey', 'So\'rovnoma']].map(([id, label]) => (
                    <button key={id} onClick={() => setSection(id)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold ${section === id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* --- Ko'rsatkichlar --- */}
            {section === 'overview' && (
                <div className="space-y-3">
                    {row.scored.parts.map(p => (
                        <div key={p.key} className="space-y-1">
                            <div className="flex justify-between items-baseline gap-2">
                                <span className="text-sm font-bold text-gray-800">{p.label}</span>
                                <span className="text-xs">
                                    {p.known ? (
                                        <>
                                            <b className="text-gray-900">{p.points}</b>
                                            <span className="text-gray-400"> / {p.max}</span>
                                            <span className="text-gray-400 ml-2">({p.raw})</span>
                                        </>
                                    ) : (
                                        <span className="text-amber-600 font-bold">ma'lumot yo'q</span>
                                    )}
                                </span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full ${p.color} transition-all`}
                                    style={{ width: `${p.known ? (p.points / p.max) * 100 : 0}%` }} />
                            </div>
                            <p className="text-[11px] text-gray-400">{p.hint}</p>
                        </div>
                    ))}

                    {row.scored.missing.length > 0 && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                            <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800">
                                <b>{row.scored.missing.join(', ')}</b> bo'yicha ma'lumot yo'q — bu o'lchovlar
                                ballga qo'shilmadi. Umumiy ball to'ldirilgan {row.scored.coverage}% o'lchov asosida.
                            </p>
                        </div>
                    )}

                    {/* Qo'lda kiritiladigan o'lchovlar */}
                    <div className="pt-3 border-t border-gray-100 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                            Qo'lda kiritiladigan ko'rsatkichlar
                        </p>
                        {TALENT_DIMENSIONS.filter(d => d.source === 'manual').map(d => (
                            <div key={d.key} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-gray-800">{d.label}</p>
                                    <p className="text-[11px] text-gray-400">{d.hint}</p>
                                </div>
                                <input type="number" step="any" value={declared[d.key] ?? ''}
                                    onChange={e => setDeclared(v => ({ ...v, [d.key]: e.target.value }))}
                                    className="w-24 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-right" />
                            </div>
                        ))}
                        <Button variant="primary" disabled={busy} onClick={() => onSaveDeclared(declared)} className="w-full">
                            Saqlash
                        </Button>
                    </div>
                </div>
            )}

            {/* --- Portfolio --- */}
            {section === 'portfolio' && (
                <div className="space-y-4">
                    <p className="text-[11px] text-gray-400">
                        Bu ma'lumotlar platformadagi faoliyatdan avtomatik yig'ildi — qayta kiritish shart emas.
                    </p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {[
                            ['GPA', portfolio.academic.average ?? '—'],
                            ['Diplom', portfolio.documents.diplomas.length],
                            ['Sertifikat', portfolio.documents.certificates.length],
                            ['Faollik bali', portfolio.social.total],
                        ].map(([label, value]) => (
                            <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                                <p className="text-xl font-black text-gray-900">{value}</p>
                                <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400">{label}</p>
                            </div>
                        ))}
                    </div>

                    {portfolio.academic.records.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                                Akademik dinamika
                            </p>
                            <div className="space-y-1">
                                {portfolio.academic.records.map(r => (
                                    <div key={r.id} className="flex items-center gap-3 text-xs px-3 py-2 bg-gray-50 rounded-lg">
                                        <span className="font-semibold text-gray-600 flex-1">
                                            {r.academicYear}, {r.semester}-semestr
                                        </span>
                                        <span className="font-black text-gray-900">{r.gpa ?? '—'}</span>
                                    </div>
                                ))}
                            </div>
                            {portfolio.academic.trend.trend !== 'unknown' && (
                                <p className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1">
                                    <TrendIcon size={12} />
                                    {portfolio.academic.trend.trend === 'up' ? "O'smoqda"
                                        : portfolio.academic.trend.trend === 'down' ? 'Tushmoqda' : 'Barqaror'}
                                    {' '}({portfolio.academic.trend.delta > 0 ? '+' : ''}{portfolio.academic.trend.delta})
                                </p>
                            )}
                        </div>
                    )}

                    {portfolio.documents.all.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                                Rasmiy hujjatlar ({portfolio.documents.all.length})
                            </p>
                            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                {portfolio.documents.all.map(d => (
                                    <div key={d.id} className="flex items-center justify-between gap-2 p-2.5 bg-emerald-50/50 border border-emerald-100 rounded-lg">
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-gray-900 truncate">
                                                {getDocumentTypeLabel(d.documentType)}
                                            </p>
                                            <p className="text-[11px] text-gray-500 truncate">{d.activityName}</p>
                                        </div>
                                        <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">
                                            {d.registrationNumber}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {portfolio.clubs.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Klublar</p>
                            <div className="flex flex-wrap gap-1.5">
                                {portfolio.clubs.map(c => (
                                    <span key={c.id} className="text-[11px] px-2.5 py-1 bg-gray-100 rounded-md text-gray-700 font-semibold">
                                        {c.clubName}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* --- So'rovnoma --- */}
            {section === 'survey' && (
                <div className="space-y-4">
                    <div className="flex items-start gap-3 p-3 bg-sky-50 border border-sky-100 rounded-xl">
                        <Info className="w-5 h-5 text-sky-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-sky-800">
                            1-kursda platformada hali tarix yo'q, shuning uchun salohiyat aynan shu
                            so'rovnomadan aniqlanadi. Bu <b>yakuniy hukm emas</b> — faqat qaysi yo'nalishda
                            rivojlantirish kerakligini ko'rsatuvchi ko'rsatkich.
                        </p>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <span className="text-sm font-bold text-gray-700">Salohiyat ko'rsatkichi</span>
                        <span className="text-2xl font-black text-sky-700">
                            {surveyPotential.score}
                            <span className="text-sm text-gray-400"> / {surveyPotential.max}</span>
                        </span>
                    </div>

                    <div className="space-y-2">
                        {SURVEY_SIGNALS.map(sig => (
                            <div key={sig.key} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-gray-900">{sig.label}</p>
                                    <p className="text-[11px] text-gray-400">Vazn: {sig.weight} ball</p>
                                </div>
                                {sig.type === 'bool' ? (
                                    <input type="checkbox" checked={!!survey[sig.key]}
                                        onChange={e => setSurvey(s => ({ ...s, [sig.key]: e.target.checked }))}
                                        className="w-5 h-5 text-sky-600 rounded border-gray-300" />
                                ) : (
                                    <input type="number" step="any" value={survey[sig.key] ?? ''}
                                        onChange={e => setSurvey(s => ({ ...s, [sig.key]: e.target.value }))}
                                        className="w-24 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-right" />
                                )}
                            </div>
                        ))}
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                            Ilmiy qiziqish yo'nalishi
                        </label>
                        <input type="text" value={survey.researchInterest || ''}
                            onChange={e => setSurvey(s => ({ ...s, researchInterest: e.target.value }))}
                            placeholder="Masalan: Konstitutsiyaviy huquq"
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-medium" />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">
                            Kelajakdagi maqsad
                        </label>
                        <textarea value={survey.futureGoal || ''}
                            onChange={e => setSurvey(s => ({ ...s, futureGoal: e.target.value }))}
                            placeholder="Talaba nimaga erishmoqchi..."
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl h-20 resize-none text-sm" />
                    </div>

                    <Button variant="primary" className="w-full" disabled={busy}
                        icon={busy ? Loader2 : CheckCircle} onClick={() => onSaveSurvey(survey)}>
                        So'rovnomani saqlash
                    </Button>
                </div>
            )}
        </div>
    );
};

export default TalentModulePage;
