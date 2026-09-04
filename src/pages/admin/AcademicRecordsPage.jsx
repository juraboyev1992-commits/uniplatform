import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
    GraduationCap, Upload, Search, Save, AlertTriangle, CheckCircle, XCircle,
    Download, TrendingUp, TrendingDown, Minus, Info, Loader2, Plug
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import AcademicStatsPanel from '../../components/admin/AcademicStatsPanel';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { useTabParam } from '../../hooks/useTabParam';
import { parseAcademicCsv } from '../../services/hemisClient';

// Akademik ko'rsatkichlar (GPA).
//
// Platformada GPA umuman yo'q edi - studentScoring.js tasodifiy `gpaProxy`
// ishlatardi. "Iqtidorli talabalar" moduli akademik o'lchovga tayanadi, shuning
// uchun bu real, semestr bo'yicha saqlanadigan ma'lumot.
//
// HEMIS integratsiyasi yozilgan, lekin hali ulanmagan - shu sababli hozircha
// kiritishning ikki yo'li bor: qo'lda va CSV import.

const currentAcademicYear = () => {
    const now = new Date();
    const y = now.getFullYear();
    // O'quv yili sentyabrda boshlanadi.
    return now.getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
};

const TrendIcon = ({ trend }) => {
    if (trend === 'up') return <TrendingUp size={14} className="text-emerald-600" />;
    if (trend === 'down') return <TrendingDown size={14} className="text-red-500" />;
    if (trend === 'stable') return <Minus size={14} className="text-gray-400" />;
    return null;
};

const AcademicRecordsPage = () => {
    const { user } = useAuth();
    const [tab, setTab] = useTabParam(['records', 'analytics'], 'records');
    const [version, setVersion] = useState(0);
    const bump = useCallback(() => setVersion(v => v + 1), []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [flash, setFlash] = useState('');

    const [academicYear, setAcademicYear] = useState(currentAcademicYear());
    const [semester, setSemester] = useState(1);
    const [q, setQ] = useState('');
    const [facultyFilter, setFacultyFilter] = useState('all');
    const [onlyMissing, setOnlyMissing] = useState(false);

    const students = useMemo(() => db.getMockStudents(), []);
    const faculties = useMemo(
        () => [...new Set(students.map(s => s.faculty).filter(Boolean))].sort(),
        [students]
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const allRecords = useMemo(() => db.getAcademicRecords(), [version]);

    const recordFor = useCallback((studentId) =>
        allRecords.find(r => r.studentId === studentId
            && r.academicYear === academicYear
            && Number(r.semester) === Number(semester)) || null,
        [allRecords, academicYear, semester]);

    // Tahrirlanayotgan qiymatlar - saqlanmaguncha shu yerda turadi.
    const [drafts, setDrafts] = useState({});
    const setDraft = (studentId, value) => setDrafts(d => ({ ...d, [studentId]: value }));

    const rows = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return students
            .filter(s => facultyFilter === 'all' || s.faculty === facultyFilter)
            .filter(s => !needle || `${s.fullName} ${s.studentId || ''} ${s.group || ''}`.toLowerCase().includes(needle))
            .map(s => {
                const rec = recordFor(s.id);
                return {
                    student: s,
                    record: rec,
                    trend: db.getStudentGPATrend(s.id),
                    average: db.getStudentAverageGPA(s.id),
                };
            })
            .filter(r => !onlyMissing || !r.record || r.record.gpa === null)
            .slice(0, 200);   // ro'yxat 550 talaba - bir ekranga hammasi kerak emas
    }, [students, q, facultyFilter, recordFor, onlyMissing]);

    const stats = useMemo(() => {
        const inPeriod = allRecords.filter(r =>
            r.academicYear === academicYear && Number(r.semester) === Number(semester) && r.gpa !== null);
        const avg = inPeriod.length
            ? Math.round((inPeriod.reduce((s, r) => s + r.gpa, 0) / inPeriod.length) * 100) / 100
            : null;
        return {
            filled: inPeriod.length,
            total: students.length,
            average: avg,
            bySource: {
                hemis: inPeriod.filter(r => r.source === 'hemis').length,
                manual: inPeriod.filter(r => r.source === 'manual').length,
                import: inPeriod.filter(r => r.source === 'import').length,
            },
        };
    }, [allRecords, academicYear, semester, students]);

    const run = async (fn, successMsg) => {
        setBusy(true); setError(''); setFlash('');
        try {
            await fn();
            bump();
            if (successMsg) setFlash(successMsg);
        } catch (e) {
            console.error('[akademik] amal bajarilmadi:', e);
            setError(e.message || String(e));
        } finally { setBusy(false); }
    };

    const saveOne = (studentId) => {
        const raw = drafts[studentId];
        if (raw === undefined) return;
        run(async () => {
            await db.setAcademicRecord({
                studentId, academicYear, semester,
                gpa: raw === '' ? null : Number(String(raw).replace(',', '.')),
                source: 'manual', by: user?.username,
            });
            setDrafts(d => { const n = { ...d }; delete n[studentId]; return n; });
        });
    };

    const saveAllDrafts = () => {
        const entries = Object.entries(drafts).filter(([, v]) => v !== undefined && v !== '');
        if (entries.length === 0) { setError("Saqlash uchun o'zgarish yo'q"); return; }
        run(async () => {
            await db.setAcademicRecordsBulk(
                entries.map(([studentId, v]) => ({
                    studentId, academicYear, semester,
                    gpa: Number(String(v).replace(',', '.')),
                })),
                { source: 'manual', by: user?.username }
            );
            setDrafts({});
        }, `${entries.length} ta yozuv saqlandi`);
    };

    // --- CSV import ---
    const fileRef = useRef(null);
    const [importPreview, setImportPreview] = useState(null);

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const parsed = parseAcademicCsv(text);
        setImportPreview(parsed);
        e.target.value = '';
    };

    const confirmImport = () => run(async () => {
        await db.setAcademicRecordsBulk(importPreview.rows, { source: 'import', by: user?.username });
        setImportPreview(null);
    }, `${importPreview.rows.length} ta yozuv import qilindi`);

    const downloadTemplate = () => {
        const csv = '﻿studentId;academicYear;semester;gpa;credits\n'
            + `student_1;${academicYear};${semester};4.2;30\n`;
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url; a.download = 'gpa-andoza.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    const draftCount = Object.values(drafts).filter(v => v !== undefined && v !== '').length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tighter italic flex items-center gap-3">
                        <GraduationCap className="w-7 h-7 text-indigo-600" /> Akademik ko'rsatkichlar
                    </h1>
                    <p className="text-gray-500 font-medium italic">Semestrlik GPA — reyting va iqtidor tahlilining asosi</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" icon={Download} onClick={downloadTemplate} className="font-bold">CSV andoza</Button>
                    <Button variant="outline" icon={Upload} onClick={() => fileRef.current?.click()} className="font-bold">Import</Button>
                    <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
                    {draftCount > 0 && (
                        <Button variant="primary" icon={busy ? Loader2 : Save} onClick={saveAllDrafts} disabled={busy}
                            className="font-bold shadow-lg shadow-indigo-100">
                            {draftCount} ta o'zgarishni saqlash
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                <Plug className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                    <b>HEMIS integratsiyasi hali ulanmagan.</b> Kod yozilgan
                    (<code className="px-1 bg-amber-100 rounded text-xs">supabase/functions/hemis-sync</code>),
                    lekin manzil va token berilmagunicha ishlamaydi. Hozircha GPA qo'lda yoki CSV orqali kiritiladi.
                </p>
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

            {/* Kiritish / Tahlil.
                Kiritish - kunlik ish (GPA va soat kiritish). Tahlil - kiritilgan
                ma'lumotning TAQSIMOTI: fakultet kesimi, xavf guruhi, qamrov.
                Ikkinchisi ilgari umuman yo'q edi - administrator faqat bitta
                talabaning yozuvini ko'ra olardi. */}
            <div className="flex border-b border-gray-200 gap-6">
                {[
                    { id: 'records', label: 'Kiritish' },
                    { id: 'analytics', label: 'Tahlil' },
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`pb-3 font-bold text-sm border-b-2 transition-all ${
                            tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'analytics' && (
                <AcademicStatsPanel academicYear={academicYear} version={version} />
            )}

            {tab === 'records' && (
            <>
            {/* Statistika */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: 'To\'ldirilgan', value: `${stats.filled} / ${stats.total}`, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: "O'rtacha GPA", value: stats.average ?? '—', color: 'text-indigo-600', bg: 'bg-indigo-50' },
                    { label: "Qo'lda kiritilgan", value: stats.bySource.manual, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: 'Import qilingan', value: stats.bySource.import, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                ].map((s, i) => (
                    <Card key={i} className="border-none shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className={`p-4 rounded-2xl ${s.bg}`}>
                                <GraduationCap className={`w-6 h-6 ${s.color}`} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{s.label}</p>
                                <p className="text-2xl font-black text-gray-900">{s.value}</p>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            {/* Filtrlar */}
            <div className="flex flex-wrap gap-2 items-center">
                <input type="text" value={academicYear} onChange={e => setAcademicYear(e.target.value)}
                    placeholder="2026-2027"
                    className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold w-32" />
                <select value={semester} onChange={e => setSemester(Number(e.target.value))}
                    className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold">
                    <option value={1}>1-semestr</option>
                    <option value={2}>2-semestr</option>
                </select>
                <select value={facultyFilter} onChange={e => setFacultyFilter(e.target.value)}
                    className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold max-w-[220px]">
                    <option value="all">Barcha fakultetlar</option>
                    {faculties.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <label className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl cursor-pointer">
                    <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded border-gray-300" />
                    <span className="text-sm font-semibold text-gray-700">Faqat kiritilmaganlar</span>
                </label>
                <div className="relative ml-auto">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Talaba qidirish..."
                        className="pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium w-56" />
                </div>
            </div>

            <Card className="p-0 overflow-hidden shadow-sm border-none">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase tracking-widest border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-5">Talaba</th>
                                <th className="px-6 py-5">Fakultet</th>
                                <th className="px-6 py-5 text-center">GPA ({academicYear}, {semester}-sem)</th>
                                <th className="px-6 py-5 text-center">Manba</th>
                                <th className="px-6 py-5 text-center">O'rtacha</th>
                                <th className="px-6 py-5 text-center">Dinamika</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {rows.length === 0 && (
                                <tr><td colSpan={6} className="px-6 py-16 text-center text-gray-400 font-medium">
                                    Talaba topilmadi
                                </td></tr>
                            )}
                            {rows.map(({ student, record, trend, average }) => {
                                const draft = drafts[student.id];
                                const value = draft !== undefined ? draft : (record?.gpa ?? '');
                                const dirty = draft !== undefined && String(draft) !== String(record?.gpa ?? '');
                                return (
                                    <tr key={student.id} className={dirty ? 'bg-indigo-50/40' : 'hover:bg-gray-50/60'}>
                                        <td className="px-6 py-3">
                                            <p className="font-bold text-gray-900 text-sm">{student.fullName}</p>
                                            <p className="text-[11px] text-gray-400">{student.group} · {student.course}-kurs</p>
                                        </td>
                                        <td className="px-6 py-3 text-xs text-gray-600">{student.faculty}</td>
                                        <td className="px-6 py-3">
                                            <div className="flex items-center justify-center gap-2">
                                                <input type="number" min="0" max="5" step="0.01" value={value}
                                                    onChange={e => setDraft(student.id, e.target.value)}
                                                    onBlur={() => dirty && saveOne(student.id)}
                                                    onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                                                    placeholder="—"
                                                    className={`w-24 px-3 py-2 border rounded-lg text-sm font-bold text-right ${dirty ? 'border-indigo-400 bg-white' : 'border-gray-200 bg-gray-50'}`} />
                                                {dirty && <span className="text-[10px] text-indigo-600 font-bold">saqlanmagan</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            {record ? (
                                                <Badge size="sm" variant={record.source === 'hemis' ? 'success' : record.source === 'import' ? 'primary' : 'secondary'}>
                                                    {record.source === 'hemis' ? 'HEMIS' : record.source === 'import' ? 'Import' : "Qo'lda"}
                                                </Badge>
                                            ) : <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-6 py-3 text-center font-black text-gray-700 text-sm">
                                            {average ?? <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="flex items-center justify-center gap-1">
                                                <TrendIcon trend={trend.trend} />
                                                {trend.trend !== 'unknown' && trend.delta !== 0 && (
                                                    <span className={`text-[11px] font-bold ${trend.delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                        {trend.delta > 0 ? '+' : ''}{trend.delta}
                                                    </span>
                                                )}
                                                {trend.trend === 'unknown' && <span className="text-gray-300 text-xs">—</span>}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {rows.length === 200 && (
                    <p className="px-6 py-3 text-[11px] text-gray-400 bg-gray-50 border-t border-gray-100">
                        Birinchi 200 ta ko'rsatilmoqda — qidiruv yoki fakultet filtri bilan toraytiring.
                    </p>
                )}
            </Card>
            </>
            )}

            {/* Import ko'rib chiqish */}
            <Modal isOpen={!!importPreview} onClose={() => setImportPreview(null)} title="CSV import" size="lg">
                {importPreview && (
                    <div className="space-y-4">
                        <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                            <Info className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-indigo-800">
                                Kutilgan ustunlar: <code className="text-xs bg-indigo-100 px-1 rounded">studentId; academicYear; semester; gpa; credits</code>.
                                Mavjud yozuv ustiga yoziladi (bir talaba + o'quv yili + semestr = bitta qator).
                            </p>
                        </div>

                        {importPreview.errors.length > 0 && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                                <p className="font-bold text-red-800 text-sm mb-2">
                                    {importPreview.errors.length} ta qatorda muammo — ular o'tkazib yuboriladi:
                                </p>
                                <ul className="text-xs text-red-700 space-y-0.5 max-h-32 overflow-y-auto">
                                    {importPreview.errors.slice(0, 20).map((e, i) => <li key={i}>• {e}</li>)}
                                </ul>
                            </div>
                        )}

                        <p className="text-sm font-bold text-gray-700">
                            {importPreview.rows.length} ta yozuv import qilinadi
                        </p>

                        {importPreview.rows.length > 0 && (
                            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-xl">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-gray-50 text-gray-400 font-black uppercase tracking-widest sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2">Talaba ID</th>
                                            <th className="px-3 py-2">O'quv yili</th>
                                            <th className="px-3 py-2">Sem</th>
                                            <th className="px-3 py-2 text-right">GPA</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {importPreview.rows.slice(0, 100).map((r, i) => (
                                            <tr key={i}>
                                                <td className="px-3 py-1.5 font-mono">{r.studentId}</td>
                                                <td className="px-3 py-1.5">{r.academicYear}</td>
                                                <td className="px-3 py-1.5">{r.semester}</td>
                                                <td className="px-3 py-1.5 text-right font-bold">{r.gpa ?? '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <Button variant="secondary" className="flex-1" onClick={() => setImportPreview(null)}>Bekor qilish</Button>
                            <Button variant="primary" className="flex-1" disabled={busy || importPreview.rows.length === 0}
                                icon={busy ? Loader2 : Upload} onClick={confirmImport}>
                                Import qilish
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default AcademicRecordsPage;
