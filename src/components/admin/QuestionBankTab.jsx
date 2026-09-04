import React, { useMemo, useState } from 'react';
import {
    ChevronRight, ArrowLeft, Trash2, Edit, BookOpen, Layers,
    AlertTriangle, Search, Plus,
} from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import { db } from '../../services/db';
import { verdictFor, needsAttention, QUESTION_QUALITY } from '../../config/questionQuality';

// SAVOLLAR BAZASI.
//
// ILGARI: bitta uzun jadval, har savol alohida qator. Yuzlab savol bo'lganda
// undan "qaysi fanda nechta savol bor" degan savolga javob topib bo'lmasdi
// va kerakli savolni qidirish qiyin edi.
//
// ENDI: ikki qatlam. Yuqorida BAZALAR (fan yoki adabiyot) ro'yxati, bazaning
// ustiga bosilganda esa uning savollari. Savollar bilan ishlash tartibi
// O'ZGARMADI - tahrirlash va o'chirish avvalgidek.
//
// Eng muhim ustun "Testlarda": bazani o'chirishdan oldin uning savollari
// qaysi testlarda ishlatilayotganini bilish kerak, aks holda ishlab turgan
// test jimgina bo'shab qolardi.
const DIFFICULTY_META = {
    easy: { label: 'Oson', variant: 'success' },
    medium: { label: "O'rtacha", variant: 'warning' },
    hard: { label: 'Qiyin', variant: 'danger' },
};

const difficultyOf = (q) =>
    q.difficulty === 'easy' ? 'easy' : q.difficulty === 'hard' ? 'hard' : 'medium';

const formatDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const QuestionBankTab = ({ version, searchTerm = '', onChanged, onEditBase }) => {
    const [openBaseId, setOpenBaseId] = useState(null);
    const [questionQuery, setQuestionQuery] = useState('');
    const [error, setError] = useState('');

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const rawBases = useMemo(() => db.getQuestionBaseSummaries(), [version]);

    // Savolning ishlatilishi va sifati - talabalarning haqiqiy javoblaridan
    // (izohi db.getQuestionUsageStats ustida). Bir marta hisoblanadi va
    // ikkala ko'rinishda ham ishlatiladi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const usageStats = useMemo(() => db.getQuestionUsageStats(), [version]);

    // Har bazada nechta savol ko'rib chiqishni talab qilishi - ro'yxatdan
    // turib ko'rinishi kerak, aks holda administrator har bazani birma-bir
    // ochib chiqardi.
    const bases = useMemo(() => {
        const questions = db.getTestQuestions();
        const attentionByBase = new Map();
        questions.forEach(q => {
            const verdict = verdictFor(usageStats.get(q.id));
            if (!needsAttention(verdict)) return;
            attentionByBase.set(q.baseId, (attentionByBase.get(q.baseId) || 0) + 1);
        });
        return rawBases.map(b => ({ ...b, needsAttentionCount: attentionByBase.get(b.id) || 0 }));
    }, [rawBases, usageStats]);

    const openBase = bases.find(b => b.id === openBaseId) || null;

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const baseQuestions = useMemo(
        () => (openBaseId ? db.getTestQuestions(openBaseId) : [])
            .map(q => {
                const usage = usageStats.get(q.id) || { shown: 0, correct: 0, correctRate: null, lastUsedAt: null };
                return { ...q, usage, verdict: verdictFor(usage) };
            })
            // Diqqat talab qiladiganlar TEPADA: ro'yxat uzun bo'lganda
            // ularni qidirib yurish kerak emas.
            .sort((a, b) => b.verdict.priority - a.verdict.priority),
        [openBaseId, version, usageStats]
    );

    const visibleBases = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return bases
            .filter(b => !q || String(b.title || '').toLowerCase().includes(q))
            .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    }, [bases, searchTerm]);

    const visibleQuestions = useMemo(() => {
        const q = questionQuery.trim().toLowerCase();
        return baseQuestions.filter(x => !q || String(x.text || '').toLowerCase().includes(q));
    }, [baseQuestions, questionQuery]);

    const handleDeleteBase = async (base) => {
        setError('');
        // O'chirish TO'XTATILADI, ogohlantirish bilan emas: ishlab turgan
        // testni buzib qo'yish orqaga qaytarib bo'lmaydigan zarar.
        if (base.usedByTests.length > 0) {
            setError(
                `"${base.title}" bazasini o'chirib bo'lmaydi — u ${base.usedByTests.length} ta testda `
                + `ishlatilmoqda: ${base.usedByTests.map(t => t.title).join(', ')}. `
                + `Avval o'sha testlarni o'zgartiring.`
            );
            return;
        }
        if (!window.confirm(
            `"${base.title}" bazasi va undagi ${base.questionCount} ta savol o'chiriladi. Davom etasizmi?`
        )) return;
        try {
            await db.deleteQuestionBase(base.id);
            if (openBaseId === base.id) setOpenBaseId(null);
            onChanged?.();
        } catch (e) {
            setError(e?.message || "O'chirishda xatolik");
        }
    };

    const handleDeleteQuestion = async (id) => {
        if (!window.confirm("Savolni o'chirasizmi?")) return;
        setError('');
        try {
            await db.deleteTestQuestion(id);
            onChanged?.();
        } catch (e) {
            setError(e?.message || "O'chirishda xatolik");
        }
    };

    // ---------- BAZA ICHI: SAVOLLAR ----------
    if (openBase) {
        return (
            <div className="space-y-4">
                <button
                    type="button"
                    onClick={() => { setOpenBaseId(null); setQuestionQuery(''); }}
                    className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-indigo-600"
                >
                    <ArrowLeft size={15} /> Barcha bazalar
                </button>

                <Card>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                {openBase.isReadingBase
                                    ? <BookOpen size={17} className="text-emerald-600" />
                                    : <Layers size={17} className="text-indigo-600" />}
                                {openBase.title}
                            </h3>
                            <p className="text-xs text-gray-400 mt-0.5">
                                {openBase.questionCount} ta savol · yaratilgan {formatDate(openBase.createdAt)}
                                {openBase.lastQuestionAt && ` · oxirgi savol ${formatDate(openBase.lastQuestionAt)}`}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => onEditBase?.(openBase)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                        >
                            <Plus size={14} /> Savol qo'shish
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-3">
                        {Object.entries(openBase.byDifficulty).map(([key, count]) => (
                            count > 0 && (
                                <Badge key={key} variant={DIFFICULTY_META[key].variant} size="sm">
                                    {DIFFICULTY_META[key].label}: {count}
                                </Badge>
                            )
                        ))}
                    </div>

                    {openBase.usedByTests.length > 0 && (
                        <p className="text-[11px] text-gray-500 mt-3">
                            Ishlatilmoqda: {openBase.usedByTests.map(t => t.title).join(', ')}
                        </p>
                    )}
                </Card>

                {error && (
                    <p className="flex items-start gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                        <AlertTriangle size={14} className="shrink-0 mt-px" /> {error}
                    </p>
                )}

                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Savol matni bo'yicha qidirish..."
                        className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm"
                        value={questionQuery}
                        onChange={e => setQuestionQuery(e.target.value)}
                    />
                </div>

                <Card className="p-0 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 text-gray-400 text-xs font-bold uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">Savol matni</th>
                                    <th className="px-6 py-4 text-center">Qiyinchilik</th>
                                    <th className="px-6 py-4 text-center">Ishlatilgan</th>
                                    <th className="px-6 py-4 text-center">To'g'ri javob</th>
                                    <th className="px-6 py-4">Tavsiya</th>
                                    <th className="px-6 py-4 text-right">Amallar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {visibleQuestions.map(q => {
                                    const meta = DIFFICULTY_META[difficultyOf(q)];
                                    const attention = needsAttention(q.verdict);
                                    return (
                                        <tr
                                            key={q.id}
                                            className={`transition-colors ${attention ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-gray-50/50'}`}
                                        >
                                            <td className="px-6 py-4 font-semibold text-gray-900 max-w-md">{q.text}</td>
                                            <td className="px-6 py-4 text-center">
                                                <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
                                            </td>
                                            {/* ISHLATILGAN - savol talaba oldiga necha
                                                marta chiqqani. Bu bazaning "qaysi
                                                testlarda" ustunidan boshqa narsa. */}
                                            <td className="px-6 py-4 text-center">
                                                <span className={`font-bold tabular-nums ${q.usage.shown === 0 ? 'text-gray-300' : 'text-gray-800'}`}>
                                                    {q.usage.shown}
                                                </span>
                                                {q.usage.lastUsedAt && (
                                                    <p className="text-[10px] text-gray-400">{formatDate(q.usage.lastUsedAt)}</p>
                                                )}
                                            </td>
                                            {/* Chiqmagan savolda foiz YO'Q - nol emas. */}
                                            <td className="px-6 py-4 text-center">
                                                {q.usage.correctRate === null ? (
                                                    <span className="text-gray-300">—</span>
                                                ) : (
                                                    <span className={`font-bold tabular-nums ${
                                                        q.usage.correctRate <= 15 ? 'text-red-600'
                                                            : q.usage.correctRate >= 95 ? 'text-amber-600' : 'text-gray-800'
                                                    }`}>
                                                        {q.usage.correctRate}%
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-start gap-1.5">
                                                    <Badge variant={q.verdict.tone} size="sm">{q.verdict.label}</Badge>
                                                    {attention && (
                                                        <span title={q.verdict.hint}>
                                                            <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                                                        </span>
                                                    )}
                                                </div>
                                                {attention && (
                                                    <p className="text-[10px] text-gray-500 mt-1 max-w-[220px] leading-snug">
                                                        {q.verdict.hint}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        className="p-2 text-gray-400 hover:text-primary-500 transition-colors"
                                                        onClick={() => onEditBase?.(openBase)}
                                                        title="Bazani tahrirlash"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                                        onClick={() => handleDeleteQuestion(q.id)}
                                                        title="Savolni o'chirish"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {visibleQuestions.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">
                                            {baseQuestions.length === 0
                                                ? "Bu bazada hali savol yo'q"
                                                : 'Qidiruvga mos savol topilmadi'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        );
    }

    // ---------- BAZALAR RO'YXATI ----------
    return (
        <div className="space-y-4">
            {error && (
                <p className="flex items-start gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <AlertTriangle size={14} className="shrink-0 mt-px" /> {error}
                </p>
            )}

            <Card className="p-0 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-400 text-xs font-bold uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Fan / adabiyot nomi</th>
                                <th className="px-6 py-4 text-center">Savollar</th>
                                <th className="px-6 py-4">Qiyinlik darajasi</th>
                                <th className="px-6 py-4">Testlarda</th>
                                <th className="px-6 py-4">Ko'rib chiqish</th>
                                <th className="px-6 py-4">Yaratilgan</th>
                                <th className="px-6 py-4 text-right">Amallar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {visibleBases.map(base => (
                                <tr
                                    key={base.id}
                                    onClick={() => setOpenBaseId(base.id)}
                                    className="group hover:bg-gray-50/70 transition-colors cursor-pointer"
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2.5">
                                            {base.isReadingBase
                                                ? <BookOpen size={15} className="text-emerald-600 shrink-0" />
                                                : <Layers size={15} className="text-indigo-500 shrink-0" />}
                                            <div className="min-w-0">
                                                <p className="font-bold text-gray-900 truncate">{base.title}</p>
                                                <p className="text-[11px] text-gray-400">
                                                    {base.isReadingBase ? 'Adabiyot' : 'Fan'}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`font-black tabular-nums ${base.questionCount === 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                                            {base.questionCount}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {base.questionCount === 0 ? (
                                            <span className="text-xs text-gray-300">—</span>
                                        ) : (
                                            <div className="flex flex-wrap gap-1">
                                                {Object.entries(base.byDifficulty).map(([key, count]) => (
                                                    count > 0 && (
                                                        <Badge key={key} variant={DIFFICULTY_META[key].variant} size="sm">
                                                            {DIFFICULTY_META[key].label} {count}
                                                        </Badge>
                                                    )
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {base.usedByTests.length === 0 ? (
                                            <span className="text-xs text-gray-400">Ishlatilmagan</span>
                                        ) : (
                                            <span
                                                className="text-xs font-semibold text-gray-700"
                                                title={base.usedByTests.map(t => t.title).join(', ')}
                                            >
                                                {base.usedByTests.length} ta test
                                            </span>
                                        )}
                                    </td>
                                    {/* Talabalarning javoblariga qarab almashtirish
                                        tavsiya qilingan savollar soni. */}
                                    <td className="px-6 py-4">
                                        {base.needsAttentionCount > 0 ? (
                                            <span className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                                                <AlertTriangle size={13} className="shrink-0" />
                                                {base.needsAttentionCount} ta savol
                                            </span>
                                        ) : (
                                            <span className="text-xs text-gray-300">—</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                                        {formatDate(base.createdAt)}
                                    </td>
                                    <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                                        <div className="flex justify-end items-center gap-1">
                                            <button
                                                className="p-2 text-gray-400 hover:text-primary-500 transition-colors"
                                                onClick={() => onEditBase?.(base)}
                                                title="Savol qo'shish / tahrirlash"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                                onClick={() => handleDeleteBase(base)}
                                                title="Bazani o'chirish"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            <ChevronRight size={16} className="text-gray-300 group-hover:text-indigo-500 transition-colors" />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {visibleBases.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-400">
                                        {bases.length === 0
                                            ? "Hali savollar bazasi yaratilmagan"
                                            : 'Qidiruvga mos baza topilmadi'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <p className="text-[11px] text-gray-400 px-1 leading-relaxed">
                Bazani ochish uchun qatorni bosing. Savollari boshqa testda ishlatilayotgan
                bazani o'chirib bo'lmaydi — avval o'sha testlarni o'zgartirish kerak.
                <br />
                «Ko'rib chiqish» — talabalarning javoblariga qarab almashtirish tavsiya
                qilingan savollar. Xulosa kamida {QUESTION_QUALITY.minAnswersForVerdict} ta
                javobdan keyin chiqadi.
            </p>
        </div>
    );
};

export default QuestionBankTab;
