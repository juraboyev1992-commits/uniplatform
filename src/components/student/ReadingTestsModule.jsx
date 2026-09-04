import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    BookOpen, CheckCircle2, Lock, AlertTriangle, Award, ChevronRight, XCircle, Timer,
} from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Modal from '../common/Modal';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { INDEX_CRITERIA, READING_POLICY } from '../../config/socialActivityIndex';
import { booksToPoints } from '../../config/socialActivityIndex';
import { TEACHING_LANGUAGES } from '../../constants';
import { isPassingAttempt } from '../../utils/socialActivityScoring';

// Talaba uchun kitobxonlik testlari — ijtimoiy faollik indeksining 1-mezoni.
//
// Metodika: talaba o'qigan asari bo'yicha test topshiradi, ijobiy baholansa
// AVTOMATIK ball oladi. Ball asar soniga qarab: 10-12 → 20, 7-9 → 15, 4-6 → 10.
//
// Test BIR MARTA topshiriladi (universitet qarori) — shuning uchun boshlashdan
// oldin talaba buni aniq ko'rishi kerak, keyin "bilmadim" deb qolmasin.

const ReadingTestsModule = ({ embedded = false }) => {
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [version, setVersion] = useState(0);
    const [active, setActive] = useState(null);   // { test, questions }
    const [answers, setAnswers] = useState({});
    const [current, setCurrent] = useState(0);    // ekrandagi savol raqami
    const [secondsLeft, setSecondsLeft] = useState(null);
    const [blocked, setBlocked] = useState(null);   // tugallanmagan boshqa test

    const [confirming, setConfirming] = useState(null);
    const [finished, setFinished] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    // `username` E'LONI YUQORIGA KO'CHIRILDI.
    //
    // Ilgari u quyiroqda turardi, lekin undan OLDIN `useMemo` ichida
    // ishlatilardi. `const` e'londan oldin o'qib bo'lmaydi, shuning uchun
    // sahifa ochilishi bilan yiqilardi va kitobxonlik testlari bo'limi
    // umuman ishlamasdi.
    const username = user?.username;

    // Sahifa ochilganda tugallanmagan test bo'lsa darhol ko'rsatiladi -
    // talaba uni unutib qo'ymasin, chunki vaqt yurib turibdi.
    const unfinished = useMemo(
        () => db.getUnfinishedTest(username),
        [username, version]
    );

    // Talabaning POTOKI - pasportdagi "Ta'lim tili" maydonidan. Belgilanmagan
    // bo'lsa filtrlanmaydi: talabani ro'yxatsiz qoldirgandan ko'ra ortiqcha
    // ko'rsatgan yaxshiroq.
    const myLanguage = useMemo(
        () => db.getStudentTeachingLanguage(username),
        [username]
    );

    const books = useMemo(() => {
        const tests = db.getReadingTests(myLanguage).filter(t => t.isPublished);
        return tests.map(t => {
            const attempts = db.getStudentTestAttempts(username, t.id).filter(a => a.finishedAt);
            const best = attempts.length
                ? attempts.reduce((b, a) => (a.score > b.score ? a : b), attempts[0])
                : null;
            return {
                test: t,
                attempt: best,
                passed: best ? isPassingAttempt(best, t) : false,
                check: db.canTakeReadingTest(username, t.id),
            };
        });
    }, [username, version, myLanguage]);

    const passedCount = books.filter(b => b.passed).length;
    const points = booksToPoints(passedCount) ?? 0;
    const nextBand = INDEX_CRITERIA.READING.bands
        .slice().reverse().find(b => b.min > passedCount);

    // BIR VAQTDA BITTA TEST.
    //
    // Tugallanmagan testning soati fonda yurib turadi. Ikkinchisini boshlashga
    // ruxsat berish talabani birinchisidan ayirardi - u qaytib kelganda vaqt
    // tugagan bo'lardi va yagona urinishi 0% bilan yopilardi.
    const startTest = (book) => {
        setError('');

        const unfinished = db.getUnfinishedTest(username);
        if (unfinished && unfinished.testId !== book.test.id) {
            setBlocked(unfinished);
            return;
        }

        const check = db.canTakeReadingTest(username, book.test.id);
        if (!check.allowed) { setError(check.reason); return; }
        setConfirming({ test: book.test, questions: check.questions });
    };

    // Tugallanmagan testga QAYTISH - javoblari bilan.
    const resumeTest = (testId) => {
        setBlocked(null);
        setError('');
        const check = db.canTakeReadingTest(username, testId);
        if (!check.allowed) { setError(check.reason); return; }
        const test = db.getTests().find(t => t.id === testId);
        setActive({ test, questions: check.questions });
        setAnswers(db.getTestDraft(username, testId));
        setCurrent(0);
        setSecondsLeft(db.getTestSecondsLeft(username, testId));
    };

    const reallyStart = async () => {
        setBusy(true);
        try {
            // Soat SERVERDA boshlanadi - boshqa kompyuterdan kirilganda ham
            // o'sha vaqt ko'rinadi.
            await db.startTestClock(username, confirming.test.id);
            setSecondsLeft(db.getTestSecondsLeft(username, confirming.test.id));
            setActive(confirming);
            setAnswers(db.getTestDraft(username, confirming.test.id));
            setCurrent(0);
            setConfirming(null);
        } catch (e) {
            setError(e?.message || 'Testni boshlashda xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    // `auto` - vaqt tugagani uchun avtomatik yakunlash. Bunda javobsiz
    // savollar bo'lsa ham yuboriladi: vaqt tugadi, boshqa iloji yo'q.
    const submit = async ({ auto = false } = {}) => {
        if (!active || busy) return;
        setBusy(true); setError('');
        try {
            const attempt = await db.submitReadingTest({
                testId: active.test.id, studentId: username, answers,
            });
            setFinished({ attempt, test: active.test, auto });
            setActive(null);
            setSecondsLeft(null);
            setVersion(v => v + 1);
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
            const left = db.getTestSecondsLeft(username, testId);
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
        db.saveTestDraft(username, active.test.id, answers);
    }, [answers, active, username]);

    // Har sahifadagi eslatmadan "Davom ettirish" bosilganda shu yerga
    // `?resume=<testId>` bilan kelinadi va test darhol ochiladi - talaba
    // ro'yxatdan qidirib o'tirmasin, vaqt yurib turibdi.
    useEffect(() => {
        const id = searchParams.get('resume');
        if (!id || active) return;
        setSearchParams({}, { replace: true });
        resumeTest(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    const formatClock = (s) => {
        if (s == null) return null;
        const m = Math.floor(s / 60);
        return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };

    const answeredCount = active ? Object.keys(answers).length : 0;

    return (
        <div className="space-y-6">
            {/* `embedded` - bo'lim jamlovchi sahifa ichida ochilganda o'z
                sarlavhasini ko'rsatmaydi: u yerda sahifaning umumiy sarlavhasi
                allaqachon bor va ikkita katta sarlavha ketma-ket kelardi. */}
            {!embedded && (
                <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-8 text-white shadow-xl flex flex-wrap justify-between items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                            <BookOpen className="w-8 h-8" /> Kitobxonlik
                        </h1>
                        <p className="text-emerald-100 italic">
                            O'qigan asaringiz bo'yicha testdan o'ting — ball avtomatik qo'shiladi
                        </p>
                        {/* Talaba qaysi ro'yxatni ko'rayotganini BILISHI kerak,
                            aks holda "mening asarim yo'q" degan savol tug'iladi. */}
                        <p className="text-emerald-100/80 text-xs mt-1.5">
                            {myLanguage
                                ? `${TEACHING_LANGUAGES[myLanguage].short} uchun asarlar ro'yxati`
                                : "Ta'lim tilingiz belgilanmagan — barcha asarlar ko'rsatilmoqda"}
                        </p>
                    </div>
                    <div className="bg-white/20 backdrop-blur-md p-4 rounded-2xl border border-white/30 text-center min-w-[130px]">
                        <p className="text-sm opacity-80 mb-1">Ijtimoiy faollik</p>
                        <p className="text-3xl font-bold tabular-nums">
                            {points}<span className="text-lg opacity-70"> / {INDEX_CRITERIA.READING.maxPoints}</span>
                        </p>
                    </div>
                </div>
            )}

            <Card>
                <div className="p-5 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-800">
                            {passedCount} ta asar bo'yicha testdan o'tgansiz
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {INDEX_CRITERIA.READING.bands.filter(b => b.points > 0).map(b => (
                                <span key={b.label} className={`px-2 py-1 rounded-lg text-[11px] font-semibold border ${
                                    passedCount >= b.min && passedCount <= b.max
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                        : 'bg-slate-50 border-slate-200 text-gray-500'
                                }`}>
                                    {b.label} → {b.points}
                                </span>
                            ))}
                        </div>
                    </div>
                    {nextBand && (
                        <p className="text-xs text-gray-500">
                            Yana <span className="font-bold text-emerald-600">{nextBand.min - passedCount} ta</span> asar
                            bo'yicha o'tsangiz — {nextBand.points} ball.
                        </p>
                    )}
                </div>
            </Card>

            {error && (
                <p className="flex items-start gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    <AlertTriangle size={13} className="shrink-0 mt-px" /> {error}
                </p>
            )}

            {/* TUGALLANMAGAN TEST — sahifaning tepasida, e'tibordan qochmaydi.
                Vaqt yurib turgani uchun buni pastga yashirib bo'lmaydi. */}
            {unfinished && !active && (
                <Card className="border-l-4 border-l-amber-500 bg-amber-50/40">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
                                <Timer size={15} /> Tugallanmagan test bor
                            </p>
                            <p className="text-xs text-amber-800 mt-1">
                                <span className="font-bold">{unfinished.test.readingBook?.title || unfinished.test.title}</span>
                                {unfinished.secondsLeft != null && (
                                    unfinished.secondsLeft > 0
                                        ? <> — vaqt yurib turibdi, <span className="font-bold">{formatClock(unfinished.secondsLeft)}</span> qoldi.</>
                                        : <> — <span className="font-bold">vaqt tugagan</span>.</>
                                )}
                            </p>
                        </div>
                        <Button variant="primary" size="sm" onClick={() => resumeTest(unfinished.testId)}>
                            {unfinished.secondsLeft === 0 ? 'Ochish va yakunlash' : 'Davom ettirish'}
                        </Button>
                    </div>
                </Card>
            )}

            {books.length === 0 ? (
                <Card>
                    <div className="p-10 text-center space-y-2">
                        <BookOpen className="w-8 h-8 text-gray-300 mx-auto" />
                        <p className="text-sm font-semibold text-gray-600">Hozircha test e'lon qilinmagan</p>
                        <p className="text-xs text-gray-400">Asarlar ro'yxati to'ldirilgach shu yerda paydo bo'ladi.</p>
                    </div>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {books.map(b => (
                        <Card key={b.test.id} className={`border-l-4 ${
                            b.passed ? 'border-l-emerald-500' : b.attempt ? 'border-l-rose-400' : 'border-l-gray-200'
                        }`}>
                            <div className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="font-bold text-gray-900 leading-tight">{b.test.readingBook.title}</h3>
                                    {b.passed && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
                                    {b.attempt && !b.passed && <XCircle size={16} className="text-rose-400 shrink-0" />}
                                </div>
                                {b.test.readingBook.author && (
                                    <p className="text-xs text-gray-400">{b.test.readingBook.author}</p>
                                )}

                                {b.attempt ? (
                                    <div className="pt-1">
                                        <Badge variant={b.passed ? 'success' : 'danger'} size="sm">
                                            {b.passed ? "O'tdingiz" : "O'ta olmadingiz"} — {Math.round((b.attempt.score / b.attempt.maxScore) * 100)}%
                                        </Badge>
                                        <p className="text-[11px] text-gray-400 mt-1.5">
                                            Test bir marta topshiriladi.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="pt-1">
                                        {b.check.allowed ? (
                                            <Button variant="primary" size="sm" icon={ChevronRight} onClick={() => startTest(b)}>
                                                Testni boshlash
                                            </Button>
                                        ) : (
                                            <p className="flex items-start gap-1.5 text-[11px] text-gray-400">
                                                {b.check.needsSession ? <Lock size={11} className="shrink-0 mt-0.5" /> : null}
                                                {b.check.reason}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Ikkinchi testni boshlashga urinish */}
            <Modal isOpen={!!blocked} onClose={() => setBlocked(null)} title="Avval boshlangan testni yakunlang">
                {blocked && (
                    <div className="space-y-4">
                        <p className="flex items-start gap-2 text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-3">
                            <Timer size={16} className="shrink-0 mt-0.5" />
                            <span>
                                Sizda tugallanmagan test bor:{' '}
                                <span className="font-bold">{blocked.test.readingBook?.title || blocked.test.title}</span>.
                                {blocked.secondsLeft != null && blocked.secondsLeft > 0 && (
                                    <> Uning vaqti <span className="font-bold">yurib turibdi</span> — {formatClock(blocked.secondsLeft)} qoldi.</>
                                )}
                            </span>
                        </p>
                        <p className="text-xs text-gray-600">
                            Bir vaqtda faqat bitta test topshiriladi. Ikkinchisini boshlasangiz birinchisining
                            vaqti behuda o'tib ketardi va u sizning yagona urinishingiz edi.
                        </p>
                        <div className="flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={() => setBlocked(null)}>
                                Yopish
                            </Button>
                            <Button variant="primary" className="flex-1" onClick={() => resumeTest(blocked.testId)}>
                                {blocked.secondsLeft === 0 ? 'Ochish va yakunlash' : 'Davom ettirish'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Boshlashdan oldin ogohlantirish - bir martalik ekani aniq aytiladi. */}
            <Modal isOpen={!!confirming} onClose={() => setConfirming(null)} title="Testni boshlaysizmi?">
                {confirming && (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-700">
                            <span className="font-bold">{confirming.test.readingBook.title}</span> — {confirming.questions.length} ta savol
                            {Number(confirming.test.timeLimit) > 0
                                ? `, ${confirming.test.timeLimit} daqiqa.`
                                : ', vaqt cheklanmagan.'}
                        </p>
                        {Number(confirming.test.timeLimit) > 0 && (
                            <p className="flex items-start gap-2 text-xs font-semibold text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2.5">
                                <Timer size={14} className="shrink-0 mt-px" />
                                Vaqt tugaganda test <span className="underline">avtomatik yakunlanadi</span> —
                                javob berilmagan savollar xato hisoblanadi. Sahifani yangilasangiz ham vaqt davom etadi.
                            </p>
                        )}
                        <p className="flex items-start gap-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                            <AlertTriangle size={14} className="shrink-0 mt-px" />
                            Bu test <span className="underline">bir marta</span> topshiriladi. Boshlagandan keyin
                            qayta urinish imkoni bo'lmaydi. O'tish uchun kamida {confirming.test.passPercent || READING_POLICY.defaultPassPercent}%
                            to'g'ri javob kerak.
                        </p>
                        <div className="flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={() => setConfirming(null)}>Bekor qilish</Button>
                            <Button variant="primary" className="flex-1" disabled={busy} onClick={reallyStart}>
                                {busy ? 'Boshlanmoqda...' : 'Boshlash'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Test oynasi — BIR EKRANDA BITTA SAVOL.
                Hamma savolni bitta uzun ro'yxatda ko'rsatish diqqatni bo'ladi va
                talaba qaysi savolda ekanini yo'qotadi. */}
            <Modal
                isOpen={!!active}
                onClose={() => {
                    // Yopish TESTNI TO'XTATMAYDI - vaqt yurib turaveradi.
                    // Buni aytmaslik talabani aldash bo'lardi.
                    const left = secondsLeft;
                    if (left == null || window.confirm(
                        `Testni yopmoqchimisiz?\n\nVaqt TO'XTAMAYDI — ${formatClock(left)} qolgan va u yurib turaveradi.\n`
                        + 'Javoblaringiz saqlanadi, qaytib davom ettirishingiz mumkin.'
                    )) {
                        setActive(null);
                    }
                }}
                title={active?.test.readingBook.title || ''}
                size="lg"
            >
                {active && (() => {
                    const total = active.questions.length;
                    const q = active.questions[current];
                    const isLast = current === total - 1;
                    const chosen = answers[q.id];

                    return (
                        <div className="space-y-4">
                            {/* Jarayon: qaysi savol, nechtasiga javob berilgan */}
                            <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
                                <span className="font-bold text-gray-700">
                                    {current + 1}-savol <span className="text-gray-400">/ {total}</span>
                                </span>
                                <span className="flex items-center gap-3">
                                    {/* Vaqt chegarasi belgilangan bo'lsagina ko'rinadi.
                                        Oxirgi daqiqada qizarib, e'tiborni tortadi. */}
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
                                        {answeredCount} ta javob · o'tish {active.test.passPercent || READING_POLICY.defaultPassPercent}%
                                    </span>
                                </span>
                            </div>

                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-500 transition-all"
                                    style={{ width: `${Math.round(((current + 1) / total) * 100)}%` }}
                                />
                            </div>

                            {/* Savol raqamlari — istalgan savolga o'tish va
                                javobsizlarini bir qarashda ko'rish. */}
                            <div className="flex flex-wrap gap-1">
                                {active.questions.map((item, i) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setCurrent(i)}
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
                                <p className="text-base font-semibold text-gray-900 leading-snug">{q.text}</p>

                                <div className="space-y-2">
                                    {/* `displayOptions` — aralashtirilgan tartib, lekin har
                                        variant o'zining ASL o'rnini (`value`) olib yuradi.
                                        Shu sabab aralashtirish ball hisobiga tegmaydi. */}
                                    {(q.displayOptions || (q.options || []).map((text, i) => ({ text, value: i })))
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
                                    onClick={() => setCurrent(c => Math.max(0, c - 1))}
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
                                        onClick={() => setCurrent(c => Math.min(total - 1, c + 1))}
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
                    );
                })()}
            </Modal>

            {/* Natija */}
            <Modal isOpen={!!finished} onClose={() => setFinished(null)} title="Natija">
                {finished && (() => {
                    const percent = Math.round((finished.attempt.score / finished.attempt.maxScore) * 100);
                    const passed = isPassingAttempt(finished.attempt, finished.test);
                    return (
                        <div className="space-y-4 text-center">
                            <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center ${
                                passed ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-500'
                            }`}>
                                {passed ? <Award size={30} /> : <XCircle size={30} />}
                            </div>
                            {finished.auto && (
                                <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                    Vaqt tugadi — test avtomatik yakunlandi.
                                </p>
                            )}
                            <p className="text-3xl font-extrabold text-gray-900 tabular-nums">{percent}%</p>
                            <p className="text-sm text-gray-600">
                                {finished.attempt.correct} / {finished.attempt.total} to'g'ri javob
                            </p>
                            <p className={`text-sm font-bold ${passed ? 'text-emerald-600' : 'text-rose-500'}`}>
                                {passed
                                    ? "Tabriklaymiz — bu asar hisobingizga qo'shildi."
                                    : "Afsuski, o'ta olmadingiz. Bu asar hisobga olinmaydi."}
                            </p>
                            <Button variant="primary" className="w-full" onClick={() => setFinished(null)}>Yopish</Button>
                        </div>
                    );
                })()}
            </Modal>
        </div>
    );
};

export default ReadingTestsModule;
