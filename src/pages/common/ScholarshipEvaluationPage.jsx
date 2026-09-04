import React, { useState, useMemo, useCallback } from 'react';
import {
    Scale, CheckCircle, XCircle, AlertTriangle, ShieldCheck, FileText,
    Loader2, Eye, Info, Users, Award, RotateCcw, ClipboardList, ArrowRight
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import {
    getApplicationStatusMeta, CRITERIA_OPS, formatAmount,
    resolvePipeline, getStageType, stageQuota,
} from '../../config/scholarships';
import { buildStudentEligibilityProfile, evaluateEligibility } from '../../utils/scholarshipEligibility';
import { summarizeEvaluations, stageCriteria, stageMaxTotal } from '../../utils/scholarshipStages';
import { getDocumentTypeLabel } from '../../config/documents';

// Komissiya paneli — fakultet mas'ullari ham, markaziy komissiya ham shu yerda ishlaydi.
//
// Vakolat ROLGA emas, BIRIKTIRUVGA bog'liq (Stipendiyalar → Sozlamalar):
//   - fakultet turidagi bosqich  -> shu fakultetga biriktirilgan mas'ul
//   - qolgan bosqichlar          -> markaziy komissiya a'zosi
// Platformada hali "dekan" roli yo'q; rol tizimi qo'shilganda bu sahifa
// o'zgarishsiz ishlayveradi.
const ScholarshipEvaluationPage = () => {
    const { user } = useAuth();
    const [version, setVersion] = useState(0);
    const bump = useCallback(() => setVersion(v => v + 1), []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const myFaculties = useMemo(() => db.getMyEvaluatorFaculties(user?.username) || [], [user, version]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const isCentral = useMemo(() => db.isCentralEvaluator(user?.username), [user, version]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const settings = useMemo(() => db.getScholarshipSettings(), [version]);

    const [target, setTarget] = useState(null);
    const [scores, setScores] = useState({});
    const [testScore, setTestScore] = useState('');
    const [comment, setComment] = useState('');

    // Menga tegishli arizalar: zanjirning joriy bosqichi men ishlay oladigan tur bo'lsa.
    const rows = useMemo(() => {
        if (!user?.username) return [];
        const students = new Map(db.getMockStudents().map(s => [s.id, s]));
        const grants = new Map(db.getScholarshipGrants().map(g => [g.id, g]));
        const evaluations = db.getScholarshipEvaluations();

        return db.getScholarshipApplications()
            .map(a => {
                const grant = grants.get(a.grantId);
                if (!grant) return null;
                if (['rejected', 'withdrawn', 'not_advanced', 'approved', 'returned', 'draft'].includes(a.status)) return null;

                const pipeline = resolvePipeline(grant);
                const stageIndex = a.stageIndex ?? 0;
                const stage = pipeline[stageIndex];
                if (!stage || stage.type === 'final') return null;

                const student = students.get(a.studentId) || null;
                const faculty = a.faculty || student?.faculty || "Noma'lum";
                const meta = getStageType(stage.type);

                // Vakolat: fakultet doirasidagi bosqichmi yoki markaziymi.
                const facultyScoped = meta.perFaculty
                    || (stage.type === 'document_review' && (stage.reviewerScope || 'faculty') === 'faculty');
                const allowed = facultyScoped ? myFaculties.includes(faculty) : isCentral;
                if (!allowed) return null;

                const stageEvals = evaluations.filter(e =>
                    e.applicationId === a.id && (e.stageId || 'faculty') === stage.id);
                const profile = buildStudentEligibilityProfile(db, a.studentId);

                return {
                    ...a,
                    grant, pipeline, stage, stageIndex, meta, faculty, student,
                    studentName: student?.fullName || a.studentId,
                    profile,
                    eligibility: evaluateEligibility(grant, profile, a.declared || {}),
                    summary: summarizeEvaluations(grant, stageEvals, stage),
                    myEvaluation: stageEvals.find(e => e.evaluatorId === user.username) || null,
                    myTestScore: a.testScores?.[stage.id],
                };
            })
            .filter(Boolean)
            .sort((a, b) => Number(!!a.myEvaluation) - Number(!!b.myEvaluation)
                || String(a.submittedAt || '').localeCompare(String(b.submittedAt || '')));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, myFaculties, isCentral, version]);

    // Bosqich bo'yicha guruhlash - komissiya bir vaqtda bir necha bosqichda ishlashi mumkin.
    const byStage = useMemo(() => {
        const map = new Map();
        rows.forEach(r => {
            const key = `${r.grantId}::${r.stage.id}`;
            if (!map.has(key)) map.set(key, { grant: r.grant, stage: r.stage, meta: r.meta, rows: [] });
            map.get(key).rows.push(r);
        });
        return Array.from(map.values());
    }, [rows]);

    const pendingCount = rows.filter(r =>
        r.meta.scored
            ? (r.stage.type === 'test' ? r.myTestScore === undefined : !r.myEvaluation)
            : true
    ).length;

    const open = (row) => {
        setTarget(row);
        setScores(row.myEvaluation?.scores || {});
        setTestScore(row.myTestScore ?? '');
        setComment(row.myEvaluation?.comment || '');
        setError('');
    };

    const criteria = target && target.meta.scored && target.stage.type !== 'test'
        ? stageCriteria(target.grant, target.stage) : [];
    const maxTotal = target ? stageMaxTotal(target.grant, target.stage) : 0;
    const currentTotal = criteria.reduce((s, c) => s + (Number(scores[c.key]) || 0), 0);

    const act = async (fn, successMsg) => {
        setBusy(true); setError('');
        try {
            const res = await fn();
            setTarget(null);
            bump();
            if (res?.autoAdvanced) {
                window.alert(
                    `Bosqich yakunlandi.\n\n${res.autoAdvanced.advanced} ta nomzod keyingi bosqichga o'tdi, `
                    + `${res.autoAdvanced.notAdvanced} ta kvotaga kirmadi.`
                );
            } else if (successMsg) {
                window.alert(successMsg);
            }
        } catch (e) {
            console.error('[stipendiya] amal bajarilmadi:', e);
            setError(e.message || String(e));
        } finally { setBusy(false); }
    };

    const saveEvaluation = () => act(() => db.saveScholarshipEvaluation(target.id, {
        evaluatorId: user.username,
        evaluatorName: user.fullName || user.username,
        scores, comment,
    }));

    const saveTestScore = () => act(() => db.setScholarshipTestScore(target.id, {
        stageId: target.stage.id, score: testScore, by: user.username,
    }));

    const reviewDocs = (action) => act(
        () => db.reviewScholarshipDocuments(target.id, { action, reviewer: user.username, comment }),
        action === 'return' ? 'Ariza talabaga tuzatish uchun qaytarildi.' : null
    );

    if (myFaculties.length === 0 && !isCentral) {
        return (
            <Card className="text-center py-20">
                <Scale className="w-14 h-14 mx-auto mb-4 text-gray-200" />
                <p className="font-bold text-gray-500">Siz baholashga biriktirilmagansiz</p>
                <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
                    Stipendiya arizalarini ko'rib chiqish uchun admin sizni fakultet komissiyasiga
                    yoki markaziy komissiyaga biriktirishi kerak
                    (Stipendiyalar → Sozlamalar).
                </p>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-sky-600 to-blue-700 rounded-2xl p-8 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold mb-1 flex items-center gap-3">
                        <Scale className="w-8 h-8" /> Stipendiya arizalari
                    </h1>
                    <p className="text-sky-100">
                        {[myFaculties.join(', '), isCentral ? 'Markaziy komissiya' : ''].filter(Boolean).join(' · ')}
                    </p>
                </div>
                <div className="flex gap-2">
                    <div className="bg-white/15 backdrop-blur rounded-xl px-5 py-3 text-center">
                        <p className="text-3xl font-black">{pendingCount}</p>
                        <p className="text-[10px] uppercase font-bold tracking-widest opacity-80">kutilmoqda</p>
                    </div>
                    <div className="bg-white/15 backdrop-blur rounded-xl px-5 py-3 text-center">
                        <p className="text-3xl font-black">{rows.length}</p>
                        <p className="text-[10px] uppercase font-bold tracking-widest opacity-80">jami</p>
                    </div>
                </div>
            </div>

            {error && !target && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <p className="text-sm font-semibold text-red-700">{error}</p>
                </div>
            )}

            {byStage.length === 0 ? (
                <Card className="text-center py-16">
                    <CheckCircle className="w-14 h-14 mx-auto mb-4 text-emerald-200" />
                    <p className="font-bold text-gray-500">Ko'rib chiqish uchun ariza yo'q</p>
                </Card>
            ) : byStage.map(group => (
                <div key={`${group.grant.id}::${group.stage.id}`} className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-black border ${group.meta.tone}`}>
                            {group.stage.label}
                        </span>
                        <span className="text-sm font-bold text-gray-700">{group.grant.title}</span>
                        {stageQuota(group.stage) > 0 && (
                            <span className="text-xs text-gray-500">
                                Top {stageQuota(group.stage)} o'tadi
                            </span>
                        )}
                        <span className="text-xs text-gray-400">{group.rows.length} nomzod</span>
                    </div>

                    {group.rows.map(row => {
                        const sm = getApplicationStatusMeta(row.status);
                        const done = row.stage.type === 'test'
                            ? row.myTestScore !== undefined && row.myTestScore !== null
                            : !!row.myEvaluation;
                        const scoredStage = row.meta.scored;
                        return (
                            <Card key={row.id} className={`border-l-4 ${done ? 'border-l-emerald-500' : 'border-l-amber-400'}`}>
                                <div className="flex flex-col lg:flex-row justify-between gap-4">
                                    <div className="flex items-start gap-4 min-w-0">
                                        <div className="w-11 h-11 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-black text-lg flex-shrink-0">
                                            {row.studentName[0]}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <h3 className="font-black text-gray-900">{row.studentName}</h3>
                                                <Badge variant={sm.variant} size="sm">{sm.label}</Badge>
                                                {done && scoredStage && (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                                        <CheckCircle size={11} />
                                                        {row.stage.type === 'test'
                                                            ? `Test balli: ${row.myTestScore}`
                                                            : `Sizning bahoyingiz: ${row.myEvaluation.total}`}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500">
                                                {row.student ? `${row.faculty} · ${row.student.course}-kurs · ${row.student.group}` : row.faculty}
                                            </p>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                Bosqich {row.stageIndex + 1} / {row.pipeline.length} · {(row.submittedAt || '').slice(0, 10)}
                                            </p>

                                            <div className="flex flex-wrap gap-3 mt-2 text-[11px] font-semibold">
                                                <span className="text-gray-500">
                                                    Platforma reytingi: <b className="text-gray-900">{row.autoScore ?? 0}</b>
                                                </span>
                                                <span className="text-gray-500">
                                                    Rasmiy hujjatlar: <b className="text-gray-900">{(row.attachedDocumentIds || []).length}</b>
                                                </span>
                                                {row.eligibility.total > 0 && (
                                                    <span className={row.eligibility.blocked ? 'text-red-600' : 'text-emerald-600'}>
                                                        Shartlar: {row.eligibility.passedCount}/{row.eligibility.total}
                                                    </span>
                                                )}
                                                {scoredStage && row.summary.count > 0 && (
                                                    <span className="text-gray-500">
                                                        O'rtacha: <b className="text-gray-900">{row.summary.average}</b> ({row.summary.count} ta)
                                                    </span>
                                                )}
                                            </div>

                                            {/* Oldingi bosqichlar natijasi */}
                                            {(row.stageResults || []).length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                    {row.stageResults.map((sr, i) => (
                                                        <span key={i} className="text-[10px] px-2 py-0.5 bg-gray-100 rounded-md text-gray-600 font-semibold">
                                                            {sr.label}
                                                            {sr.score !== null && sr.score !== undefined ? `: ${sr.score}` : ''}
                                                            {sr.rank ? ` (${sr.rank}-o'rin)` : ''}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <Button
                                            variant={done ? 'outline' : 'primary'}
                                            icon={done ? Eye : row.stage.type === 'document_review' ? FileText : row.stage.type === 'test' ? ClipboardList : Scale}
                                            onClick={() => open(row)}>
                                            {row.stage.type === 'document_review' ? "Ko'rib chiqish"
                                                : row.stage.type === 'test' ? (done ? "Ballni o'zgartirish" : 'Test ballini kiritish')
                                                    : done ? "Bahoni o'zgartirish" : 'Baholash'}
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            ))}

            {/* Ko'rib chiqish modali */}
            <Modal isOpen={!!target} onClose={() => setTarget(null)}
                title={target ? `${target.studentName} — ${target.stage.label}` : ''} size="lg">
                {target && (
                    <div className="space-y-5">
                        <div className="p-4 bg-gray-50 rounded-2xl flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <p className="font-black text-gray-900">{target.grant.title}</p>
                                <p className="text-xs text-gray-500">
                                    {formatAmount(target.grant.amount)}
                                    {stageQuota(target.stage) > 0 ? ` · Top ${stageQuota(target.stage)} o'tadi` : ''}
                                </p>
                            </div>
                            {target.meta.scored && target.stage.type !== 'test' && (
                                <div className="text-center flex-shrink-0">
                                    <p className="text-3xl font-black text-sky-700">{currentTotal}</p>
                                    <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400">/ {maxTotal}</p>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                                <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                                <p className="text-sm font-semibold text-red-700">{error}</p>
                            </div>
                        )}

                        {/* Rasmiy hujjatlar */}
                        <div>
                            <h4 className="text-sm font-black uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2">
                                <ShieldCheck size={15} className="text-emerald-600" /> Rasmiy hujjatlar
                            </h4>
                            {(target.attachedDocumentIds || []).length === 0 ? (
                                <p className="text-xs text-gray-400 italic p-3 bg-gray-50 rounded-xl">
                                    Nomzod rasmiy hujjat biriktirmagan
                                </p>
                            ) : (
                                <div className="space-y-1.5">
                                    {target.attachedDocumentIds.map(id => {
                                        const doc = (target.profile.documents || []).find(d => d.id === id);
                                        if (!doc) return <p key={id} className="text-xs text-gray-400 italic">Hujjat topilmadi</p>;
                                        return (
                                            <div key={id} className="flex items-center justify-between p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-gray-900 truncate">{getDocumentTypeLabel(doc.documentType)}</p>
                                                    <p className="text-[11px] text-gray-500 truncate">{doc.activityName}</p>
                                                </div>
                                                <a href={`/verify/${doc.verificationToken}`} target="_blank" rel="noreferrer"
                                                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex-shrink-0 ml-3">
                                                    QR orqali tekshirish →
                                                </a>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Talab qilingan hujjatlar */}
                        {(target.grant.requiredDocs || []).length > 0 && (
                            <div>
                                <h4 className="text-sm font-black uppercase tracking-wider text-gray-500 mb-2">Talab qilingan hujjatlar</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    {target.grant.requiredDocs.map(id => {
                                        const label = settings.docTypes.find(d => d.id === id)?.label || id;
                                        const ok = (target.uploadedDocs || []).some(u => u.typeId === id);
                                        return (
                                            <div key={id} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-semibold ${ok ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                                                {ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                                                <span className="truncate">{label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Shartlarga moslik */}
                        {target.eligibility.total > 0 && (
                            <div>
                                <h4 className="text-sm font-black uppercase tracking-wider text-gray-500 mb-2">Grant shartlari</h4>
                                <div className="space-y-1.5">
                                    {target.eligibility.checks.map(c => (
                                        <div key={c.key} className={`flex items-center gap-3 p-2.5 rounded-lg border text-sm ${c.ok ? 'bg-emerald-50/60 border-emerald-100' : c.unknown ? 'bg-gray-50 border-gray-200' : 'bg-red-50/60 border-red-100'}`}>
                                            {c.ok ? <CheckCircle size={15} className="text-emerald-600 flex-shrink-0" />
                                                : c.unknown ? <AlertTriangle size={15} className="text-gray-400 flex-shrink-0" />
                                                    : <XCircle size={15} className="text-red-500 flex-shrink-0" />}
                                            <span className="font-semibold text-gray-800 flex-1 min-w-0 truncate">{c.label}</span>
                                            <span className="text-[11px] text-gray-500">
                                                {c.source === 'auto' ? 'avtomatik' : 'nomzod kiritgan'}
                                            </span>
                                            <span className="font-black text-gray-900 whitespace-nowrap">
                                                {c.unknown ? '—' : `${c.actual} ${c.unit}`}
                                            </span>
                                            <span className="text-[11px] text-gray-400 whitespace-nowrap">
                                                / {CRITERIA_OPS[c.op]?.symbol} {c.target}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {target.note && (
                            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Nomzod izohi</p>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{target.note}</p>
                            </div>
                        )}

                        {/* --- Bosqich turiga qarab amal --- */}

                        {/* Test balli */}
                        {target.stage.type === 'test' && (
                            <div className="border-t border-gray-100 pt-4">
                                <h4 className="text-sm font-black uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                                    <ClipboardList size={15} className="text-emerald-600" /> Test natijasi
                                </h4>
                                {target.stage.testName && (
                                    <p className="text-xs text-gray-500 mb-2">Test: <b>{target.stage.testName}</b></p>
                                )}
                                <div className="flex items-center gap-3">
                                    <input type="number" min="0" max={target.stage.maxScore || 100}
                                        value={testScore} onChange={e => setTestScore(e.target.value)}
                                        placeholder="ball"
                                        className="w-32 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-lg font-black text-right" />
                                    <span className="text-sm text-gray-400">/ {target.stage.maxScore || 100}</span>
                                    {target.stage.passScore > 0 && (
                                        <span className="text-xs text-gray-500 ml-auto">
                                            O'tish balli: <b>{target.stage.passScore}</b>
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] text-gray-500 mt-2 flex items-start gap-1">
                                    <Info size={12} className="flex-shrink-0 mt-0.5" />
                                    {target.stage.testId
                                        ? "Bu bosqichga platformadagi test biriktirilgan — nomzod testni topshirsa ball avtomatik tushadi. Bu yerdagi qiymat uni qo'lda tuzatadi."
                                        : "Bosqichga test biriktirilmagan — ball qo'lda kiritiladi."}
                                </p>
                            </div>
                        )}

                        {/* Baholash */}
                        {target.meta.scored && target.stage.type !== 'test' && (
                            <div className="border-t border-gray-100 pt-4">
                                <h4 className="text-sm font-black uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                                    <Award size={15} className="text-sky-600" /> Baho
                                </h4>
                                <div className="space-y-2">
                                    {criteria.map(c => {
                                        const val = scores[c.key] ?? '';
                                        const num = Number(val) || 0;
                                        return (
                                            <div key={c.key} className="flex items-center gap-3 p-3 bg-sky-50/50 rounded-xl border border-sky-100">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-gray-900">{c.label}</p>
                                                    <div className="h-1.5 bg-white rounded-full overflow-hidden mt-1.5 max-w-xs">
                                                        <div className="h-full bg-sky-500 transition-all"
                                                            style={{ width: `${c.max ? Math.min(100, (num / c.max) * 100) : 0}%` }} />
                                                    </div>
                                                </div>
                                                <input type="number" min="0" max={c.max} value={val}
                                                    onChange={e => setScores(s => ({ ...s, [c.key]: e.target.value }))}
                                                    className="w-20 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-right" />
                                                <span className="text-[11px] text-gray-400 w-12">/ {c.max}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <textarea value={comment} onChange={e => setComment(e.target.value)}
                            placeholder="Izoh (ixtiyoriy, monitoringda va tarixda ko'rinadi)..."
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm h-20 resize-none" />

                        {/* Boshqa baholovchilar */}
                        {target.summary.evaluators.filter(e => e.id !== user?.username).length > 0 && (
                            <div>
                                <h4 className="text-sm font-black uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2">
                                    <Users size={15} /> Boshqa baholovchilar
                                </h4>
                                <div className="space-y-1">
                                    {target.summary.evaluators.filter(e => e.id !== user?.username).map(e => (
                                        <div key={e.id} className="flex items-center gap-3 text-xs px-3 py-2 bg-gray-50 rounded-lg">
                                            <span className="font-bold text-gray-700 flex-1">{e.name}</span>
                                            <span className="font-black text-gray-900">{e.total} ball</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Amal tugmalari */}
                        <div className="pt-4 border-t border-gray-100 flex flex-wrap gap-3">
                            <Button variant="secondary" className="flex-1 min-w-[120px]" onClick={() => setTarget(null)} disabled={busy}>
                                Bekor qilish
                            </Button>

                            {target.stage.type === 'document_review' ? (
                                <>
                                    <Button variant="outline" icon={RotateCcw} className="flex-1 min-w-[150px]"
                                        disabled={busy} onClick={() => reviewDocs('return')}>
                                        Tuzatishga qaytarish
                                    </Button>
                                    <Button variant="danger" className="flex-1 min-w-[120px]"
                                        disabled={busy} onClick={() => reviewDocs('eliminate')}>
                                        Chetlatish
                                    </Button>
                                    <Button variant="primary" icon={ArrowRight} className="flex-1 min-w-[150px]"
                                        disabled={busy} onClick={() => reviewDocs('pass')}>
                                        Keyingi bosqichga
                                    </Button>
                                </>
                            ) : target.stage.type === 'test' ? (
                                <Button variant="primary" className="flex-1 min-w-[150px] shadow-lg shadow-sky-200"
                                    icon={busy ? Loader2 : CheckCircle} disabled={busy} onClick={saveTestScore}>
                                    {busy ? 'Saqlanmoqda...' : 'Test ballini saqlash'}
                                </Button>
                            ) : (
                                <Button variant="primary" className="flex-1 min-w-[150px] shadow-lg shadow-sky-200"
                                    icon={busy ? Loader2 : CheckCircle} disabled={busy} onClick={saveEvaluation}>
                                    {busy ? 'Saqlanmoqda...' : 'Bahoni saqlash'}
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default ScholarshipEvaluationPage;
