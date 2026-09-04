import React, { useState, useMemo, useEffect } from 'react';
import {
    Star, Trophy, Award, Users, Info, CheckCircle, XCircle, Loader2, Plus,
    FileText, Settings, ChevronRight, AlertTriangle, ShieldCheck, Download
} from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import { db } from '../../services/db';
import {
    RECOGNITION_TYPES, RECOGNITION_CASE_STATUS, RECOGNITION_RECORD_STATUS,
    DEFAULT_RECOGNITION_RULES, ASSIGNMENT_ROLES, ASSIGNMENT_ROLE_ORDER,
    NO_PUNISHMENT_NOTE, STATE_AWARDS,
} from '../../config/talent';

// Rag'batlantirish.
//
// Spetsifikatsiyaning eng muhim qismi (§33-§39): talabaning yutug'i faqat
// uning emas, uni tayyorlagan ilmiy rahbar, tyutor va mentor mehnatining ham
// natijasi. Lekin rag'bat AVTOMATIK berilmaydi - tizim tavsiya qiladi,
// komissiya tasdiqlaydi, keyin hujjat chiqariladi.

const TalentRecognitionTab = ({ busy, version, user, run }) => {
    const [view, setView] = useState('cases');
    const [detail, setDetail] = useState(null);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const pending = useMemo(() => db.getPendingRecognitions(), [version]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const cases = useMemo(() => db.getRecognitionCases(), [version]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const rules = useMemo(() => db.getRecognitionRules(), [version]);

    const nameOf = useMemo(() => {
        const map = new Map((db.getSyncedProfiles() || []).map(p => [p.username, p.fullName]));
        return (u) => map.get(u) || u;
    }, []);

    // Qoidalar bo'sh bo'lsa boshlang'ich to'plamni bir martalik yozamiz.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await db.seedRecognitionRulesIfEmpty(DEFAULT_RECOGNITION_RULES);
                if (!cancelled && res.seeded > 0) window.location.reload();
            } catch (e) {
                console.warn('[rag\'bat] qoidalarni yozib bo\'lmadi:', e.message);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const openCase = (p) => {
        // Yutuq kaliti: davlat mukofoti bo'lsa uning kaliti, aks holda grant
        // nomidan taxminiy kalit. Qoida topilmasa 'default' ishlaydi.
        const key = p.target.awardKey
            || (/prezident|president/i.test(p.achievement) ? 'president_scholarship'
                : /nomidagi|named/i.test(p.achievement) ? 'named_scholarship' : 'default');
        run(async () => {
            await db.createRecognitionCase({
                studentId: p.target.studentId, targetId: p.target.id,
                achievement: p.achievement, achievementKey: key,
                cycleYear: new Date().getFullYear(), by: user?.username,
            });
        }, "Rag'batlantirish holati ochildi");
    };

    const casesWithRecords = useMemo(
        () => cases.map(c => ({ ...c, records: db.getRecognitionRecords(c.id) }))
            .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [cases, version]
    );

    const stats = useMemo(() => {
        const recs = casesWithRecords.flatMap(c => c.records);
        return {
            pending: pending.length,
            cases: cases.length,
            proposed: recs.filter(r => r.status === 'proposed').length,
            issued: recs.filter(r => r.status === 'issued').length,
        };
    }, [pending, cases, casesWithRecords]);

    const exportCsv = () => {
        const rows = [
            ['Yil', 'Xodim/mentor', 'Rol', 'Talaba', 'Natija', "Rag'bat", 'Holat'],
            ...casesWithRecords.flatMap(c => c.records.map(r => [
                c.cycleYear, nameOf(r.personId), ASSIGNMENT_ROLES[r.role]?.label || r.role,
                c.studentName, c.achievement,
                RECOGNITION_TYPES[r.recognitionType]?.label || '—',
                RECOGNITION_RECORD_STATUS[r.status]?.label || r.status,
            ])),
        ];
        const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `ragbatlantirish-reestri-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <Info className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm text-emerald-800 font-bold">
                        Talabaning yutug'i — uni tayyorlagan jamoaning ham natijasi.
                    </p>
                    <p className="text-xs text-emerald-700 mt-1">{NO_PUNISHMENT_NOTE}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    ['Kutilmoqda', stats.pending], ['Holatlar', stats.cases],
                    ['Tavsiya qilingan', stats.proposed], ['Hujjat berilgan', stats.issued],
                ].map(([label, value]) => (
                    <Card key={label} className="border-none shadow-sm text-center py-4">
                        <p className="text-2xl font-black text-gray-900">{value}</p>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">{label}</p>
                    </Card>
                ))}
            </div>

            <div className="flex flex-wrap gap-2 items-center">
                <div className="flex bg-white p-1 rounded-xl border border-gray-100 shadow-sm">
                    {[['cases', 'Holatlar'], ['registry', 'Reestr'], ['rules', 'Qoidalar']].map(([id, label]) => (
                        <button key={id} onClick={() => setView(id)}
                            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${view === id ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                            {label}
                        </button>
                    ))}
                </div>
                {view === 'registry' && (
                    <Button variant="outline" icon={Download} onClick={exportCsv} className="ml-auto font-bold">CSV</Button>
                )}
            </div>

            {/* --- HOLATLAR --- */}
            {view === 'cases' && (
                <div className="space-y-4">
                    {/* Kutilayotgan natijalar */}
                    {pending.length > 0 && (
                        <Card className="border-l-4 border-l-amber-400">
                            <p className="font-black text-gray-900 text-sm mb-1 flex items-center gap-2">
                                <Trophy size={16} className="text-amber-500" />
                                Rag'batlantirish kutilmoqda ({pending.length})
                            </p>
                            <p className="text-xs text-gray-500 mb-3">
                                Bu talabalar natijaga erishgan, lekin ularni tayyorlagan jamoa hali
                                rag'batlantirilmagan.
                            </p>
                            <div className="space-y-2">
                                {pending.map(p => (
                                    <div key={p.target.id} className="flex items-center justify-between gap-3 p-3 bg-amber-50/60 border border-amber-100 rounded-xl">
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-gray-900">{p.studentName}</p>
                                            <p className="text-[11px] text-gray-600">{p.achievement}</p>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {p.team.length === 0 ? (
                                                    <span className="text-[10px] text-red-600 font-bold">
                                                        Mentor jamoasi aniqlanmagan — biriktirish yo'q
                                                    </span>
                                                ) : p.team.map(a => (
                                                    <span key={a.id} className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${ASSIGNMENT_ROLES[a.role]?.tone}`}>
                                                        {ASSIGNMENT_ROLES[a.role]?.short}: {nameOf(a.personId)}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <Button variant="primary" icon={Plus} disabled={busy || p.team.length === 0}
                                            onClick={() => openCase(p)} className="text-xs py-1.5 px-3 flex-shrink-0">
                                            Holat ochish
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {casesWithRecords.length === 0 && pending.length === 0 && (
                        <Card className="text-center py-16">
                            <Star className="w-14 h-14 mx-auto mb-4 text-gray-200" />
                            <p className="font-bold text-gray-500">Hali rag'batlantirish holati yo'q</p>
                            <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
                                Talaba stipendiya yoki mukofotga erishganda ("Nomzodlar" bo'limida
                                holat "G'olib" bo'lganda) bu yerda avtomatik paydo bo'ladi.
                            </p>
                        </Card>
                    )}

                    {casesWithRecords.map(c => {
                        const st = RECOGNITION_CASE_STATUS[c.status];
                        return (
                            <Card key={c.id} hover className="cursor-pointer" onClick={() => setDetail(c)}>
                                <div className="flex flex-col md:flex-row justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <Trophy size={15} className="text-emerald-600" />
                                            <p className="font-black text-gray-900">{c.studentName}</p>
                                            <Badge variant={st?.variant} size="sm">{st?.label}</Badge>
                                            <span className="text-[11px] text-gray-400">{c.cycleYear}-yil</span>
                                        </div>
                                        <p className="text-sm text-gray-600">{c.achievement}</p>
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {c.records.map(r => (
                                                <span key={r.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${ASSIGNMENT_ROLES[r.role]?.tone}`}>
                                                    {ASSIGNMENT_ROLES[r.role]?.short}: {nameOf(r.personId)}
                                                    {r.status === 'issued' && <ShieldCheck size={10} />}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className="text-gray-300 flex-shrink-0 self-center" />
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* --- REESTR --- */}
            {view === 'registry' && (
                <Card className="p-0 overflow-hidden shadow-sm border-none">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase tracking-widest border-b border-gray-100">
                                <tr>
                                    <th className="px-6 py-5">Yil</th>
                                    <th className="px-6 py-5">Xodim / mentor</th>
                                    <th className="px-6 py-5">Rol</th>
                                    <th className="px-6 py-5">Talaba</th>
                                    <th className="px-6 py-5">Natija</th>
                                    <th className="px-6 py-5">Rag'bat</th>
                                    <th className="px-6 py-5">Holat</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {casesWithRecords.flatMap(c => c.records).length === 0 && (
                                    <tr><td colSpan={7} className="px-6 py-16 text-center text-gray-400 font-medium">
                                        Reestrda yozuv yo'q
                                    </td></tr>
                                )}
                                {casesWithRecords.flatMap(c => c.records.map(r => ({ c, r }))).map(({ c, r }) => {
                                    const rst = RECOGNITION_RECORD_STATUS[r.status];
                                    return (
                                        <tr key={r.id} className={r.status === 'issued' ? 'bg-emerald-50/30' : ''}>
                                            <td className="px-6 py-4 text-xs font-black text-gray-500">{c.cycleYear}</td>
                                            <td className="px-6 py-4 font-bold text-gray-900 text-sm">{nameOf(r.personId)}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${ASSIGNMENT_ROLES[r.role]?.tone}`}>
                                                    {ASSIGNMENT_ROLES[r.role]?.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-600">{c.studentName}</td>
                                            <td className="px-6 py-4 text-xs font-semibold text-gray-700">{c.achievement}</td>
                                            <td className="px-6 py-4 text-xs text-gray-700">
                                                {RECOGNITION_TYPES[r.recognitionType]?.label || '—'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge variant={rst?.variant} size="sm">{rst?.label}</Badge>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* --- QOIDALAR --- */}
            {view === 'rules' && (
                <RecognitionRules rules={rules} busy={busy} run={run} />
            )}

            <Modal isOpen={!!detail} onClose={() => setDetail(null)}
                title={detail ? `${detail.studentName} — rag'batlantirish` : ''} size="lg">
                {detail && (
                    <CaseDetail
                        kase={detail} busy={busy} user={user} run={run} nameOf={nameOf}
                        onDone={() => setDetail(null)}
                    />
                )}
            </Modal>
        </div>
    );
};

// ---------------------------------------------------------------------------
const CaseDetail = ({ kase, busy, user, run, nameOf, onDone }) => {
    const records = useMemo(() => db.getRecognitionRecords(kase.id), [kase.id]);
    const st = RECOGNITION_CASE_STATUS[kase.status];

    const setRecordType = (recordId, recognitionType) =>
        run(() => db.updateRecognitionRecord(recordId, { recognitionType }, user?.username));

    const setRecordStatus = (recordId, status) =>
        run(() => db.updateRecognitionRecord(recordId, { status }, user?.username));

    const setCaseStatus = (status) =>
        run(() => db.updateRecognitionCase(kase.id, { status }, user?.username));

    const issue = () => {
        if (!window.confirm(
            "Tasdiqlangan yozuvlar uchun rasmiy hujjat chiqarilsinmi?\n\n"
            + 'Hujjatlar taqdirlash reestriga tushadi va QR orqali tekshiriladigan bo\'ladi.'
        )) return;
        run(async () => {
            const res = await db.issueRecognitionDocuments(kase.id, { by: user?.username });
            window.alert(`${res.issued} ta hujjat berildi. Bayonnoma: ${res.protocolNumber}`);
            onDone();
        });
    };

    const approvedCount = records.filter(r => r.status === 'approved').length;
    const issuedCount = records.filter(r => r.status === 'issued').length;

    return (
        <div className="space-y-5">
            <div className="p-4 bg-gray-50 rounded-2xl">
                <div className="flex items-center gap-2 mb-1">
                    <Trophy size={16} className="text-emerald-600" />
                    <p className="font-black text-gray-900">{kase.studentName}</p>
                    <Badge variant={st?.variant} size="sm">{st?.label}</Badge>
                </div>
                <p className="text-sm text-gray-600">{kase.achievement}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                    {kase.faculty} · {kase.cycleYear}-yil
                </p>
            </div>

            <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                    Tayyorlagan jamoa
                </p>
                <div className="space-y-2">
                    {records.length === 0 && (
                        <p className="text-sm text-gray-400 italic">Jamoa a'zolari topilmadi</p>
                    )}
                    {records.map(r => {
                        const role = ASSIGNMENT_ROLES[r.role];
                        const rst = RECOGNITION_RECORD_STATUS[r.status];
                        const type = RECOGNITION_TYPES[r.recognitionType];
                        const locked = r.status === 'issued';
                        return (
                            <div key={r.id} className={`p-3 rounded-xl border ${role?.tone}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-70">
                                            {role?.label}
                                        </p>
                                        <p className="font-bold text-gray-900 text-sm">{nameOf(r.personId)}</p>
                                        <p className="text-[11px] text-gray-500 mt-0.5">{role?.scope}</p>
                                    </div>
                                    <Badge variant={rst?.variant} size="sm">{rst?.label}</Badge>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 mt-3">
                                    <select value={r.recognitionType || ''} disabled={busy || locked}
                                        onChange={e => setRecordType(r.id, e.target.value || null)}
                                        className="flex-1 min-w-[180px] px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold disabled:opacity-60">
                                        <option value="">Rag'bat turi tanlanmagan</option>
                                        {Object.entries(RECOGNITION_TYPES).map(([k, v]) => (
                                            <option key={k} value={k}>
                                                {v.label}{v.documentType ? '' : ' (hujjatsiz)'}
                                            </option>
                                        ))}
                                    </select>

                                    {!locked && (
                                        <>
                                            {r.status !== 'approved' && (
                                                <button onClick={() => setRecordStatus(r.id, 'approved')}
                                                    disabled={busy || !r.recognitionType}
                                                    className="px-2.5 py-1.5 bg-white border border-emerald-200 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-50 disabled:opacity-40">
                                                    Tasdiqlash
                                                </button>
                                            )}
                                            {r.status !== 'declined' && (
                                                <button onClick={() => setRecordStatus(r.id, 'declined')} disabled={busy}
                                                    className="px-2.5 py-1.5 bg-white border border-gray-200 text-gray-500 rounded-lg text-xs font-bold hover:bg-gray-50">
                                                    Rad etish
                                                </button>
                                            )}
                                        </>
                                    )}
                                    {locked && type?.documentType && (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                                            <ShieldCheck size={12} /> Hujjat berilgan
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Jarayon */}
            <div className="pt-4 border-t border-gray-100 space-y-3">
                <p className="text-[11px] text-gray-500">
                    {approvedCount} ta tasdiqlangan · {issuedCount} ta hujjat berilgan
                </p>

                <div className="flex flex-wrap gap-2">
                    {kase.status === 'draft' && (
                        <Button variant="outline" className="flex-1" disabled={busy}
                            onClick={() => setCaseStatus('review')}>
                            Komissiyaga yuborish
                        </Button>
                    )}
                    {kase.status === 'review' && (
                        <>
                            <Button variant="outline" className="flex-1" disabled={busy}
                                onClick={() => setCaseStatus('rejected')}>
                                Rad etish
                            </Button>
                            <Button variant="primary" className="flex-1" disabled={busy || approvedCount === 0}
                                onClick={() => setCaseStatus('approved')}>
                                Tasdiqlash
                            </Button>
                        </>
                    )}
                    {kase.status === 'approved' && (
                        <Button variant="primary" icon={busy ? Loader2 : FileText} className="flex-1"
                            disabled={busy || approvedCount === 0} onClick={issue}>
                            Rasmiy hujjatlarni berish
                        </Button>
                    )}
                    {kase.status === 'issued' && (
                        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl w-full">
                            <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                            <p className="text-sm text-emerald-800 font-semibold">
                                Hujjatlar berildi — taqdirlash reestrida va oluvchilarning kabinetida ko'rinadi.
                            </p>
                        </div>
                    )}
                </div>

                {kase.status === 'approved' && approvedCount === 0 && (
                    <p className="text-[11px] text-amber-600 font-semibold flex items-center gap-1">
                        <AlertTriangle size={12} /> Hujjat berish uchun kamida bitta yozuv tasdiqlanishi kerak.
                    </p>
                )}
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
const RecognitionRules = ({ rules, busy, run }) => {
    const [achievementKey, setAchievementKey] = useState('default');

    const keys = useMemo(() => {
        const fromRules = [...new Set(rules.map(r => r.achievementKey))];
        const fromAwards = STATE_AWARDS.map(a => a.key);
        return [...new Set(['default', ...fromAwards, ...fromRules])];
    }, [rules]);

    const labelOf = (key) => key === 'default'
        ? 'Standart (boshqa barcha natijalar)'
        : STATE_AWARDS.find(a => a.key === key)?.label || key;

    const setRule = (role, recognitionType) => run(
        () => db.saveRecognitionRule({ achievementKey, role, recognitionType }),
        'Qoida saqlandi'
    );

    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                <Settings className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-indigo-800">
                    Qaysi natija uchun qaysi rolga qanday rag'bat <b>tavsiya</b> qilinishini shu yerda
                    belgilaysiz. Aniq moddiy rag'batlar kodga yozilmagan — ular shu sozlamalar orqali
                    boshqariladi va har holatda komissiya tomonidan tasdiqlanadi.
                </p>
            </div>

            <select value={achievementKey} onChange={e => setAchievementKey(e.target.value)}
                className="px-4 py-3 bg-white border border-gray-200 rounded-xl font-bold text-sm w-full md:max-w-lg">
                {keys.map(k => <option key={k} value={k}>{labelOf(k)}</option>)}
            </select>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {ASSIGNMENT_ROLE_ORDER.map(role => {
                    const meta = ASSIGNMENT_ROLES[role];
                    const rule = rules.find(r => r.achievementKey === achievementKey && r.role === role);
                    const fallback = rules.find(r => r.achievementKey === 'default' && r.role === role);
                    return (
                        <div key={role} className={`p-4 rounded-xl border ${meta.tone}`}>
                            <p className="text-[10px] font-black uppercase tracking-widest mb-2">{meta.label}</p>
                            <select value={rule?.recognitionType || ''} disabled={busy}
                                onChange={e => setRule(role, e.target.value)}
                                className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold">
                                <option value="">
                                    {fallback && achievementKey !== 'default'
                                        ? `Standart: ${RECOGNITION_TYPES[fallback.recognitionType]?.label}`
                                        : 'Tanlanmagan'}
                                </option>
                                {Object.entries(RECOGNITION_TYPES).map(([k, v]) => (
                                    <option key={k} value={k}>{v.label}</option>
                                ))}
                            </select>
                            <p className="text-[11px] text-gray-500 mt-2">{meta.scope}</p>
                        </div>
                    );
                })}
            </div>

            <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                    Barcha qoidalar ({rules.length})
                </p>
                <div className="space-y-1.5">
                    {rules.map(r => (
                        <div key={r.id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg text-xs">
                            <span className="font-bold text-gray-700 flex-1 truncate">{labelOf(r.achievementKey)}</span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${ASSIGNMENT_ROLES[r.role]?.tone}`}>
                                {ASSIGNMENT_ROLES[r.role]?.short}
                            </span>
                            <span className="font-semibold text-gray-900 w-56 truncate text-right">
                                {RECOGNITION_TYPES[r.recognitionType]?.label || r.recognitionType}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TalentRecognitionTab;
