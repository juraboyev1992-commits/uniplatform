import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
    BookOpen, Plus, AlertTriangle, CheckCircle2, Eye, EyeOff,
    Upload, ChevronDown, ChevronRight, Trash2, Lock, Unlock, Pencil,
} from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { db } from '../../services/db';
import { INDEX_CRITERIA, READING_POLICY } from '../../config/socialActivityIndex';
import { TEACHING_LANGUAGES, TEACHING_LANGUAGE_ORDER } from '../../constants';

// "Kitobxonlik madaniyati" (1-mezon) — asarlar, ularning savollari va topshirish tartibi.
//
// Metodika: 100 ta eng sara badiiy adabiyot ro'yxati platformaga joylashtiriladi,
// har asar bo'yicha test tuziladi, talaba ijobiy o'tsa AVTOMATIK ball oladi.
// Ball asar SONIGA qarab: 10-12 → 20, 7-9 → 15, 4-6 → 10.
//
// CHEGARA: bu test modulining o'zi emas. Test bo'limida huquq, matematika va
// boshqa fanlardan testlar bor — ular indeksga umuman kirmaydi. Faqat shu yerda
// yaratilgan, aniq asarga biriktirilgan testlar 1-mezonga hisoblanadi.

const QuestionEditor = ({ testId, onChanged }) => {
    const fileRef = useRef(null);
    const [text, setText] = useState('');
    const [options, setOptions] = useState(['', '', '', '']);
    const [correctIndex, setCorrectIndex] = useState(0);
    const [editingId, setEditingId] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const questions = db.getReadingTestQuestions(testId);

    const setOption = (i, v) => setOptions(prev => prev.map((o, idx) => (idx === i ? v : o)));

    const reset = () => {
        setText(''); setOptions(['', '', '', '']); setCorrectIndex(0); setEditingId(null);
    };

    const startEdit = (q) => {
        setEditingId(q.id);
        setText(q.text || '');
        const opts = (q.options || []).slice();
        while (opts.length < 4) opts.push('');
        setOptions(opts);
        setCorrectIndex(Number(q.correctIndex) || 0);
        setError('');
    };

    const handleAdd = async () => {
        setBusy(true); setError('');
        try {
            if (editingId) {
                await db.updateTestQuestion(editingId, { text, options, correctIndex });
            } else {
                await db.addReadingQuestion(testId, { text, options, correctIndex });
            }
            reset();
            onChanged?.();
        } catch (e) {
            setError(e?.message || 'Savol saqlanmadi');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="px-4 pb-4 space-y-3 bg-slate-50/60">
            {questions.length > 0 && (
                <div className="space-y-2 pt-3 max-h-80 overflow-y-auto pr-1">
                    {questions.map((q, i) => {
                        const isEditing = editingId === q.id;
                        return (
                            <div
                                key={q.id}
                                className={`group rounded-2xl border transition-colors ${
                                    isEditing
                                        ? 'border-sky-300 bg-sky-50/70 ring-1 ring-sky-200'
                                        : 'border-gray-100 bg-white hover:border-gray-200'
                                }`}
                            >
                                <div className="flex items-start gap-3 p-3">
                                    <span className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-extrabold ${
                                        isEditing ? 'bg-sky-600 text-white' : 'bg-gray-100 text-gray-500'
                                    }`}>
                                        {i + 1}
                                    </span>

                                    <div className="flex-1 min-w-0 space-y-2">
                                        <p className="text-sm font-semibold text-gray-900 leading-snug">{q.text}</p>
                                        {/* Variantlar ikki ustunda - chetdan chetga cho'zilmasin. */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                            {(q.options || []).map((opt, oi) => {
                                                const correct = oi === q.correctIndex;
                                                return (
                                                    <div
                                                        key={oi}
                                                        className={`flex items-start gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] ${
                                                            correct
                                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 font-semibold'
                                                                : 'border-gray-100 bg-gray-50/70 text-gray-600'
                                                        }`}
                                                    >
                                                        <span className={`shrink-0 w-4 h-4 rounded-md flex items-center justify-center text-[9px] font-extrabold ${
                                                            correct ? 'bg-emerald-600 text-white' : 'bg-white text-gray-400 border border-gray-200'
                                                        }`}>
                                                            {['A', 'B', 'C', 'D', 'E', 'F'][oi]}
                                                        </span>
                                                        <span className="min-w-0 break-words">{opt}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                        <button
                                            type="button" onClick={() => startEdit(q)}
                                            className="p-1.5 text-sky-600 hover:bg-sky-100 rounded-lg"
                                            title="Tahrirlash"
                                        >
                                            <Pencil size={13} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={async () => { await db.deleteTestQuestion(q.id); onChanged?.(); }}
                                            className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg"
                                            title="Savolni o'chirish"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="space-y-2 pt-1">
                <input
                    type="text" value={text} onChange={e => setText(e.target.value)}
                    placeholder="Savol matni"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {options.map((o, i) => (
                        <label key={i} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs ${
                            correctIndex === i ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'
                        }`}>
                            <input
                                type="radio" name={`correct-${testId}`} checked={correctIndex === i}
                                onChange={() => setCorrectIndex(i)}
                                className="shrink-0"
                            />
                            <input
                                type="text" value={o} onChange={e => setOption(i, e.target.value)}
                                placeholder={`${i + 1}-variant`}
                                className="flex-1 min-w-0 bg-transparent outline-none"
                            />
                        </label>
                    ))}
                </div>
                {error && <p className="text-[11px] font-semibold text-red-600">{error}</p>}
                <div className="flex items-center gap-2 flex-wrap">
                    <Button
                        variant="primary" size="sm" icon={editingId ? undefined : Plus}
                        disabled={busy || !text.trim()} onClick={handleAdd}
                    >
                        {editingId ? "O'zgarishlarni saqlash" : 'Savol qo\'shish'}
                    </Button>
                    {editingId && (
                        <Button variant="outline" size="sm" onClick={reset}>Bekor qilish</Button>
                    )}

                    {/* Ko'p savolni bittalab yozish o'rniga jadvaldan yuklash. */}
                    <input
                        ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                        onChange={async e => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (!f) return;
                            setBusy(true); setError('');
                            try {
                                const test = db.getTests().find(t => t.id === testId);
                                const buffer = await f.arrayBuffer();
                                const wb = XLSX.read(buffer);
                                const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                                const res = await db.importTestQuestions(test.baseId, rows);
                                setError(res.errors.length ? `Xatolar: ${res.errors.slice(0, 3).join('; ')}` : '');
                                onChanged?.();
                            } catch (err) {
                                setError(err?.message || 'Import bajarilmadi');
                            } finally { setBusy(false); }
                        }}
                    />
                    <Button variant="outline" size="sm" icon={Upload} disabled={busy} onClick={() => fileRef.current?.click()}>
                        Jadvaldan yuklash
                    </Button>

                    <span className="text-[11px] text-gray-400">To'g'ri javobni chapdagi doiracha bilan belgilang.</span>
                </div>
            </div>
        </div>
    );
};

const ReadingTestsPanel = () => {
    const navigate = useNavigate();
    const [version, setVersion] = useState(0);
    const [title, setTitle] = useState('');
    const [author, setAuthor] = useState('');
    const [language, setLanguage] = useState('');
    // Ro'yxatni potok bo'yicha ko'rish - 100 ta asar ikki tilda bo'lganda
    // aralash ro'yxat o'qishga yaroqsiz bo'lib qoladi.
    const [listLanguage, setListLanguage] = useState('');
    const [passPercent, setPassPercent] = useState(READING_POLICY.defaultPassPercent);
    const [expanded, setExpanded] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const fileRef = useRef(null);

    const [baseId, setBaseId] = useState('');
    const tests = useMemo(() => db.getReadingTests(listLanguage || null), [version, listLanguage]);
    const progress = useMemo(() => db.getReadingListProgress(), [version]);
    const libraryOnly = useMemo(() => db.isReadingLibraryOnly(), [version]);
    const bases = useMemo(() => db.getQuestionBasesWithCounts(), [version]);

    const refresh = () => setVersion(v => v + 1);

    const run = async (fn, okMessage = '') => {
        setBusy(true); setError(''); setMessage('');
        try {
            await fn();
            refresh();
            if (okMessage) setMessage(okMessage);
        } catch (e) {
            setError(e?.message || 'Xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    const handleImport = (file) => run(async () => {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);
        if (rows.length === 0) throw new Error('Faylda ma\'lumot topilmadi');

        const res = await db.importReadingList(rows, { passPercent });
        setMessage(
            `${res.added} ta asar qo'shildi` +
            (res.skipped ? `, ${res.skipped} tasi o'tkazib yuborildi (takror yoki bo'sh)` : '') +
            (res.errors.length ? `. Xatolar: ${res.errors.slice(0, 3).join('; ')}` : '')
        );
    });

    return (
        <div className="space-y-4">
            <Card>
                <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <BookOpen size={17} className="text-emerald-600" /> Kitobxonlik ro'yxati va testlari
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">
                                1-mezon · maksimal {INDEX_CRITERIA.READING.maxPoints} ball · ball avtomatik beriladi
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-extrabold text-gray-900 tabular-nums">
                                {progress.total}<span className="text-sm text-gray-400"> / {progress.target}</span>
                            </p>
                            <p className="text-[11px] text-gray-400">{progress.published} ta e'lon qilingan</p>
                        </div>
                    </div>

                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-emerald-500 transition-all"
                            style={{ width: `${Math.min(100, Math.round((progress.total / progress.target) * 100))}%` }}
                        />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                        {INDEX_CRITERIA.READING.bands.map(b => (
                            <span key={b.label} className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-semibold text-gray-600">
                                {b.label} → {b.points} ball
                            </span>
                        ))}
                    </div>
                    <p className="text-[11px] text-gray-400">{INDEX_CRITERIA.READING.note}</p>
                </div>
            </Card>

            {/* Topshirish tartibi — metodikaning "ARMga kelib topshiradi" bandi. */}
            <Card>
                <div className="p-5 flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                        <h4 className="font-bold text-sm text-gray-700 flex items-center gap-1.5">
                            {libraryOnly ? <Lock size={14} className="text-amber-500" /> : <Unlock size={14} className="text-gray-400" />}
                            Topshirish tartibi
                        </h4>
                        <p className="text-[11px] text-gray-500 mt-1 max-w-xl">
                            Metodikada test kutubxonada (ARMda) topshiriladi deyilgan. Rejim yoqilsa talaba
                            testni o'zi ocholmaydi — kutubxona xodimi uning uchun seans ochadi
                            ({READING_POLICY.sessionMinutes} daqiqa, bir martalik).
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                            Har asar bo'yicha urinish: <span className="font-bold">{READING_POLICY.maxAttemptsPerBook} marta</span>.
                        </p>
                    </div>
                    <Button
                        variant={libraryOnly ? 'primary' : 'outline'} size="sm" disabled={busy}
                        onClick={() => run(() => db.setReadingLibraryOnly(!libraryOnly))}
                    >
                        {libraryOnly ? 'Faqat kutubxonada — yoqilgan' : "Istalgan joydan — ochiq"}
                    </Button>
                </div>
            </Card>

            <Card>
                <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h4 className="font-bold text-sm text-gray-700">Asar qo'shish</h4>
                        <>
                            <input
                                ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ''; }}
                            />
                            <Button variant="outline" size="sm" icon={Upload} disabled={busy} onClick={() => fileRef.current?.click()}>
                                Excel/CSV dan import
                            </Button>
                        </>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        <input
                            type="text" value={title} onChange={e => setTitle(e.target.value)}
                            placeholder="Asar nomi"
                            className="flex-1 min-w-[180px] px-3 py-2 border border-gray-200 rounded-xl text-sm"
                        />
                        <input
                            type="text" value={author} onChange={e => setAuthor(e.target.value)}
                            placeholder="Muallif"
                            className="w-44 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                        />
                        {/* POTOK. O'zbek va rus potoklari alohida ro'yxat
                            o'qiydi - talabaga o'z potokidagi asarlar ko'rinadi.
                            Belgilanmasa har ikkalasida chiqadi. */}
                        <select
                            value={language} onChange={e => setLanguage(e.target.value)}
                            className="w-36 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                        >
                            <option value="">Har ikkala potok</option>
                            {TEACHING_LANGUAGE_ORDER.map(k => (
                                <option key={k} value={k}>{TEACHING_LANGUAGES[k].short}</option>
                            ))}
                        </select>
                        <div className="flex items-center gap-1.5">
                            <label className="text-[11px] font-bold text-gray-400 uppercase">O'tish</label>
                            <input
                                type="number" min={1} max={100} value={passPercent}
                                onChange={e => setPassPercent(e.target.value)}
                                className="w-16 px-2 py-2 border border-gray-200 rounded-xl text-sm text-center"
                            />
                            <span className="text-xs text-gray-400">%</span>
                        </div>
                        <Button
                            variant="primary" size="sm" icon={Plus} disabled={!title.trim() || busy}
                            onClick={() => run(async () => {
                                await db.createReadingTest({
                                    title, author, language: language || null,
                                    passPercent, existingBaseId: baseId || null,
                                });
                                setTitle(''); setAuthor(''); setBaseId('');
                            }, 'Asar qo\'shildi. Endi unga savol kiriting.')}
                        >
                            Qo'shish
                        </Button>
                    </div>

                    {/* Ikkinchi yo'l: testlar bo'limida allaqachon tuzilgan savollar
                        bazasini shu asarga biriktirish. Bo'sh qoldirilsa asar uchun
                        yangi baza ochiladi. */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <label className="text-[11px] font-bold text-gray-400 uppercase">Savollar bazasi</label>
                        <select
                            value={baseId} onChange={e => setBaseId(e.target.value)}
                            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white"
                        >
                            <option value="">Yangi baza ochilsin (odatiy)</option>
                            {bases.map(b => (
                                <option key={b.id} value={b.id}>{b.title} — {b.questionCount} savol</option>
                            ))}
                        </select>
                    </div>

                    <p className="text-[11px] text-gray-400">
                        Import fayli ustunlari: <span className="font-semibold">title/nomi/asar</span> va{' '}
                        <span className="font-semibold">author/muallif</span>. Savollar import qilinmaydi —
                        ular har asar ostida yoki testlar bo'limidagi bazada tuziladi.
                    </p>

                    {error && (
                        <p className="flex items-start gap-1.5 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            <AlertTriangle size={12} className="shrink-0 mt-px" /> {error}
                        </p>
                    )}
                    {message && (
                        <p className="flex items-start gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                            <CheckCircle2 size={12} className="shrink-0 mt-px" /> {message}
                        </p>
                    )}
                </div>
            </Card>

            <Card padding={false}>
                <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                    <h4 className="font-bold text-sm text-gray-700">Asarlar ({tests.length})</h4>
                    {/* Potok bo'yicha ko'rish - ikki tildagi ro'yxat aralash
                        turganda o'qishga yaroqsiz bo'lib qoladi. */}
                    <div className="flex gap-1">
                        {[{ key: '', label: 'Barchasi' },
                            ...TEACHING_LANGUAGE_ORDER.map(k => ({ key: k, label: TEACHING_LANGUAGES[k].short }))]
                            .map(o => (
                                <button
                                    key={o.key || 'all'}
                                    type="button"
                                    onClick={() => setListLanguage(o.key)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                                        listLanguage === o.key
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    {o.label}
                                </button>
                            ))}
                    </div>
                </div>
                {tests.length === 0 ? (
                    <p className="p-8 text-center text-sm text-gray-400">
                        Hali asar qo'shilmagan. Kitobxonlik mezoni bo'yicha ball berilmaydi.
                    </p>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {tests.map(t => {
                            const questionCount = db.getReadingTestQuestions(t.id).length;
                            const open = expanded === t.id;
                            return (
                                <div key={t.id}>
                                    <div className="flex items-center gap-3 px-4 py-2.5">
                                        <button
                                            type="button"
                                            onClick={() => setExpanded(open ? null : t.id)}
                                            className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                        >
                                            {open ? <ChevronDown size={14} className="text-gray-400 shrink-0" /> : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                                            <span className="min-w-0">
                                                <span className="block text-sm font-semibold text-gray-800 truncate">{t.readingBook.title}</span>
                                                <span className="block text-[11px] text-gray-400 truncate">
                                                    {[
                                                        t.readingBook.author,
                                                        // Potok belgilanmagan asar har ikkalasida chiqadi.
                                                        t.readingBook.language
                                                            ? TEACHING_LANGUAGES[t.readingBook.language]?.short
                                                            : 'har ikkala potok',
                                                        `${questionCount} savol`,
                                                        `o'tish ${t.passPercent || 60}%`,
                                                    ].filter(Boolean).join(' · ')}
                                                </span>
                                            </span>
                                        </button>

                                        {/* Savolsiz testni e'lon qilib bo'lmaydi - talaba
                                            bo'sh testga tushib qolmasin. */}
                                        {questionCount === 0 && (
                                            <Badge variant="warning" size="sm">Savol yo'q</Badge>
                                        )}
                                        {/* Ikkinchi yo'l: testlar bo'limidagi TO'LIQ yaratish
                                            oqimi (baza, savollar soni, ball, aralashtirish,
                                            mo'ljal). Yangi test yaratmaydi — SHU asarning
                                            testini sozlaydi. */}
                                        <button
                                            type="button"
                                            // Endi bu ALOHIDA bo'limga o'tish emas: kitoblar
                                            // ro'yxati o'sha bo'limning tabi bo'lib qoldi.
                                            // Manzil o'zgaradi, sahifa esa o'sha yerda qoladi
                                            // va asar oynasi ochiladi.
                                            onClick={() => navigate(`/admin/library?tab=tests&reading=${t.id}`)}
                                            className="px-2 py-1 rounded-lg text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 whitespace-nowrap"
                                            title="Testlar bo'limidagi to'liq sozlash oqimi"
                                        >
                                            To'liq sozlash
                                        </button>
                                        <Badge variant={t.isPublished ? 'success' : 'default'} size="sm">
                                            {t.isPublished ? "E'lon qilingan" : 'Qoralama'}
                                        </Badge>
                                        <button
                                            type="button" disabled={busy || (!t.isPublished && questionCount === 0)}
                                            onClick={() => run(() => db.updateTest(t.id, {
                                                isPublished: !t.isPublished,
                                                status: !t.isPublished ? 'active' : 'draft',
                                            }))}
                                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed"
                                            title={questionCount === 0 ? 'Avval savol kiriting' : (t.isPublished ? "E'londan olish" : "E'lon qilish")}
                                        >
                                            {t.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                    {open && <QuestionEditor testId={t.id} onChanged={refresh} />}
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
};

export default ReadingTestsPanel;
