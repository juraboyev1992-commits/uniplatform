import React, { useEffect, useRef, useState } from 'react';
import { Timer, Award, XCircle } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { db } from '../../services/db';

// UMUMIY IMTIHON DVIGATELI.
//
// Bitta savol - bitta ekran, oldinga/orqaga yurish, savol raqamlari, taymer,
// javoblarni saqlab borish va uzilib qolganda davom ettirish.
//
// NEGA ALOHIDA KOMPONENT: kitobxonlik testi va fan testi bir xil imtihon,
// faqat kirish sharti boshqa (kitobxonlikda "bir marta" qoidasi va kutubxona
// seansi bor). Ikkita imtihon oynasi bo'lsa, birida tuzatilgan taymer xatosi
// ikkinchisida qolib ketardi - shuning uchun mantiq bitta joyda turadi.
//
// `canTake` va `submitAnswers` - tashqaridan beriladi, farq faqat shu.
const TestRunner = ({
    active,              // { test, questions } | null
    onClose,
    onFinished,          // (attempt, test, auto) => void
    submitAnswers,       // async ({ testId, studentId, answers }) => attempt
    studentId,
    passPercent,
}) => {
    const [answers, setAnswers] = useState({});
    const [current, setCurrent] = useState(0);

    // HAR SAVOLGA SARFLANGAN VAQT.
    //
    // Ilgari faqat testning umumiy vaqti saqlanardi, ya'ni "qaysi savol
    // qiyin bo'ldi" degan savolga javob yo'q edi. Endi savoldan savolga
    // o'tishda o'tgan vaqt o'sha savolga qo'shib boriladi.
    //
    // Sekundlarda va YIG'INDI sifatida: talaba savolga qaytib kelishi
    // mumkin va har tashrif alohida emas, umumiy vaqtga qo'shiladi.
    const [questionSeconds, setQuestionSeconds] = useState({});
    const enteredAtRef = useRef(Date.now());

    // Joriy savolda o'tgan vaqtni hisobga qo'shadi va sanoqni qaytadan
    // boshlaydi. Savol almashganda va test topshirilganda chaqiriladi.
    const flushQuestionTime = (questionId) => {
        const now = Date.now();
        const spent = Math.max(0, Math.round((now - enteredAtRef.current) / 1000));
        enteredAtRef.current = now;
        if (!questionId || spent === 0) return;
        setQuestionSeconds(prev => ({ ...prev, [questionId]: (prev[questionId] || 0) + spent }));
    };
    const [secondsLeft, setSecondsLeft] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    // Test ochilganda saqlangan javoblar va qolgan vaqt tiklanadi.
    useEffect(() => {
        if (!active) return;
        setAnswers(db.getTestDraft(studentId, active.test.id));
        setCurrent(0);
        setSecondsLeft(db.getTestSecondsLeft(studentId, active.test.id));
        setQuestionSeconds({});
        enteredAtRef.current = Date.now();
        setError('');
    }, [active, studentId]);

    const submit = async ({ auto = false } = {}) => {
        if (!active || busy) return;
        setBusy(true); setError('');
        try {
            // Oxirgi savolda o'tirgan vaqt ham hisobga kirsin.
            const lastId = active.questions[current]?.id;
            const now = Date.now();
            const lastSpent = Math.max(0, Math.round((now - enteredAtRef.current) / 1000));
            const finalTimes = lastId && lastSpent > 0
                ? { ...questionSeconds, [lastId]: (questionSeconds[lastId] || 0) + lastSpent }
                : questionSeconds;

            const attempt = await submitAnswers({
                testId: active.test.id, studentId, answers,
                questionSeconds: finalTimes,
            });
            onFinished(attempt, active.test, auto);
        } catch (e) {
            setError(e?.message || 'Testni topshirishda xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    // VAQT HISOBLAGICHI.
    //
    // Har soniyada qolgan vaqt QAYTA HISOBLANADI (oddiy kamaytirish emas):
    // brauzer yorlig'i fonga o'tganda taymer sekinlashadi va sanoq haqiqiy
    // vaqtdan orqada qolib ketardi.
    useEffect(() => {
        if (!active) return;
        const testId = active.test.id;
        const tick = () => {
            const left = db.getTestSecondsLeft(studentId, testId);
            setSecondsLeft(left);
            if (left === 0) submit({ auto: true });
        };
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active?.test.id]);

    // Javoblar har o'zgarishda saqlanadi - oynani yopib qaytsa yo'qolmasin.
    useEffect(() => {
        if (!active) return;
        db.saveTestDraft(studentId, active.test.id, answers);
    }, [answers, active, studentId]);

    if (!active) return null;

    const total = active.questions.length;
    const q = active.questions[current];
    const chosen = answers[q?.id];
    const isLast = current === total - 1;
    const answeredCount = Object.keys(answers).length;

    const formatClock = (s) => {
        if (s == null) return null;
        const m = Math.floor(s / 60);
        return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };

    return (
        <Modal isOpen={!!active} onClose={onClose} title={active.test.title} size="lg">
            <div className="space-y-4">
                <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                    <span className="font-bold text-gray-700">
                        {current + 1} / {total}-savol
                    </span>
                    <span className="flex items-center gap-3">
                        {secondsLeft != null && (
                            <span className={`flex items-center gap-1 font-bold tabular-nums px-2 py-1 rounded-lg ${
                                secondsLeft <= 60
                                    ? 'bg-rose-100 text-rose-700 animate-pulse'
                                    : secondsLeft <= 300
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-gray-100 text-gray-600'
                            }`}>
                                <Timer size={12} /> {formatClock(secondsLeft)}
                            </span>
                        )}
                        <span className="text-gray-400">
                            {answeredCount} ta javob
                            {passPercent ? ` · o'tish ${passPercent}%` : ''}
                        </span>
                    </span>
                </div>

                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-indigo-500 transition-all"
                        style={{ width: `${Math.round(((current + 1) / total) * 100)}%` }}
                    />
                </div>

                {/* Savol raqamlari - istalgan savolga o'tish va javobsizlarini
                    bir qarashda ko'rish. */}
                <div className="flex flex-wrap gap-1">
                    {active.questions.map((item, i) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => { flushQuestionTime(q?.id); setCurrent(i); }}
                            className={`w-7 h-7 rounded-lg text-[11px] font-bold transition-colors ${
                                i === current
                                    ? 'bg-indigo-600 text-white'
                                    : answers[item.id] != null
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                            }`}
                        >
                            {i + 1}
                        </button>
                    ))}
                </div>

                <div className="pt-2 space-y-3 min-h-[16rem]">
                    <p className="text-base font-semibold text-gray-900 leading-snug">{q?.text}</p>

                    <div className="space-y-2">
                        {/* `displayOptions` - aralashtirilgan tartib, lekin har
                            variant o'zining ASL o'rnini (`value`) olib yuradi.
                            Shu sabab aralashtirish ball hisobiga tegmaydi. */}
                        {(q?.displayOptions || (q?.options || []).map((text, i) => ({ text, value: i })))
                            .map((opt, oi) => (
                                <label
                                    key={opt.value}
                                    className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm cursor-pointer transition-colors ${
                                        chosen === opt.value
                                            ? 'border-indigo-300 bg-indigo-50'
                                            : 'border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    <input
                                        type="radio" name={q.id}
                                        className="mt-0.5 shrink-0"
                                        checked={chosen === opt.value}
                                        onChange={() => setAnswers(prev => ({ ...prev, [q.id]: opt.value }))}
                                    />
                                    <span className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-extrabold ${
                                        chosen === opt.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
                                    }`}>
                                        {['A', 'B', 'C', 'D', 'E', 'F'][oi]}
                                    </span>
                                    <span className="min-w-0">{opt.text}</span>
                                </label>
                            ))}
                    </div>
                </div>

                {error && (
                    <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                        {error}
                    </p>
                )}

                <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                    <Button
                        variant="outline"
                        disabled={current === 0}
                        onClick={() => { flushQuestionTime(q?.id); setCurrent(c => Math.max(0, c - 1)); }}
                    >
                        ← Oldingi
                    </Button>

                    {isLast ? (
                        <Button
                            variant="primary" className="flex-1"
                            disabled={busy || answeredCount < total}
                            onClick={() => submit()}
                        >
                            {busy ? 'Yuborilmoqda...'
                                : answeredCount < total
                                    ? `Yana ${total - answeredCount} ta savol qoldi`
                                    : 'Testni yakunlash'}
                        </Button>
                    ) : (
                        <Button
                            variant="primary" className="flex-1"
                            onClick={() => { flushQuestionTime(q?.id); setCurrent(c => Math.min(total - 1, c + 1)); }}
                        >
                            Keyingi →
                        </Button>
                    )}
                </div>

                {isLast && answeredCount < total && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        Javobsiz savollar bor — yuqoridagi raqamlardan kulrang bo'lganlariga qayting.
                    </p>
                )}
            </div>
        </Modal>
    );
};

// Natija oynasi - ikkala modulda ham bir xil.
export const TestResultModal = ({ finished, onClose, passPercent }) => {
    if (!finished) return null;
    const { attempt, auto } = finished;
    const percent = attempt.maxScore > 0
        ? Math.round((attempt.score / attempt.maxScore) * 100)
        : 0;
    const passed = passPercent ? percent >= passPercent : null;

    return (
        <Modal isOpen={!!finished} onClose={onClose} title="Natija">
            <div className="space-y-4 text-center">
                <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center ${
                    passed === false ? 'bg-rose-100 text-rose-500' : 'bg-emerald-100 text-emerald-600'
                }`}>
                    {passed === false ? <XCircle size={30} /> : <Award size={30} />}
                </div>

                {auto && (
                    <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        Vaqt tugadi — test avtomatik yakunlandi.
                    </p>
                )}

                <div>
                    <p className="text-3xl font-extrabold text-gray-900 tabular-nums">
                        {attempt.score} / {attempt.maxScore}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">{percent}%</p>
                </div>

                {passed != null && (
                    <p className={`text-sm font-bold ${passed ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {passed ? "O'tdingiz" : `O'tish uchun ${passPercent}% kerak edi`}
                    </p>
                )}

                <Button variant="primary" className="w-full" onClick={onClose}>
                    Yopish
                </Button>
            </div>
        </Modal>
    );
};

export default TestRunner;
