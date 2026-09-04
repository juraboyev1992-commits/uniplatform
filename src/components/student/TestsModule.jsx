import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    ClipboardList, Clock, CheckCircle2, AlertTriangle, Play, Info, BookOpen,
} from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Modal from '../common/Modal';
import TestRunner, { TestResultModal } from './TestRunner';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { TEACHING_LANGUAGES } from '../../constants';

// TALABANING TESTLAR BO'LIMI.
//
// Bu bo'lim ilgari TO'LIQ TO'QIMA edi: kodga yozib qo'yilgan uchta test va
// ularning savollari. Admin haqiqiy test tuzardi, savollar bazasini Excel'dan
// yuklardi - lekin talaba ularni ko'rmasdi, chunki bu ekran boshqa,
// mavjud bo'lmagan testlarni ko'rsatardi.
//
// Endi haqiqiy testlar ro'yxati. Imtihonning O'ZI `TestRunner` da - bitta
// dvigatel kitobxonlik testida ham, fan testida ham ishlaydi.
//
// KITOBXONLIK testlari bu yerda KO'RINMAYDI: ular alohida bo'limda va
// ijtimoiy faollik indeksining 1-mezoniga ishlaydi. Ikkisini aralashtirish
// "qaysi test ballga kiradi" degan savolni chalkashtirardi.
const TestsModule = ({ embedded = false }) => {
    const { user } = useAuth();
    const username = user?.username;
    const [searchParams, setSearchParams] = useSearchParams();
    const [version, setVersion] = useState(0);
    const [active, setActive] = useState(null);
    const [confirming, setConfirming] = useState(null);
    const [finished, setFinished] = useState(null);
    const [blocked, setBlocked] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const myLanguage = useMemo(
        () => db.getStudentTeachingLanguage(username),
        [username]
    );

    // Faqat e'lon qilingan FAN testlari. Til belgilangan bo'lsa - o'z potoki
    // (tili ko'rsatilmagan test har ikkalasida chiqadi).
    const tests = useMemo(() => {
        return (db.getTests() || [])
            .filter(t => t.isPublished && !t.isReadingTest)
            .filter(t => !myLanguage || !t.language || t.language === myLanguage)
            .map(t => {
                const attempts = db.getStudentTestAttempts(username, t.id).filter(a => a.finishedAt);
                const best = attempts.length
                    ? attempts.reduce((b, a) => (a.score > b.score ? a : b), attempts[0])
                    : null;
                return {
                    test: t,
                    attempts: attempts.length,
                    best,
                    questionCount: db.getTestQuestionCount(t.id),
                    check: db.canTakeTest(username, t.id),
                };
            })
            .sort((a, b) => String(a.test.subject || '').localeCompare(String(b.test.subject || '')));
    }, [username, version, myLanguage]);

    const subjects = useMemo(
        () => [...new Set(tests.map(t => t.test.subject).filter(Boolean))],
        [tests]
    );
    const [subject, setSubject] = useState('');
    const visible = subject ? tests.filter(t => t.test.subject === subject) : tests;

    const start = (row) => {
        setError('');
        // Boshqa test yarim yo'lda qolgan bo'lsa yangisini boshlab bo'lmaydi -
        // uning vaqti yurib turibdi.
        const unfinished = db.getUnfinishedTest(username);
        if (unfinished && unfinished.testId !== row.test.id) {
            setBlocked(unfinished);
            return;
        }
        if (!row.check.allowed) { setError(row.check.reason); return; }
        setConfirming({ test: row.test, questions: row.check.questions });
    };

    const reallyStart = async () => {
        setBusy(true);
        try {
            // Soat SERVERDA boshlanadi - boshqa kompyuterdan kirilganda ham
            // o'sha vaqt ko'rinadi.
            await db.startTestClock(username, confirming.test.id);
            setActive(confirming);
            setConfirming(null);
        } catch (e) {
            setError(e?.message || 'Testni boshlashda xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    // "Davom ettirish" eslatmasidan `?resume=<testId>` bilan kelinadi.
    React.useEffect(() => {
        const id = searchParams.get('resume');
        if (!id || active) return;
        setSearchParams({}, { replace: true });
        const check = db.canTakeTest(username, id);
        if (!check.allowed) { setError(check.reason); return; }
        const test = (db.getTests() || []).find(t => t.id === id);
        if (test) setActive({ test, questions: check.questions });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    return (
        <div className="space-y-6">
            {/* `embedded` izohi ReadingTestsModule da. */}
            {!embedded && (
                <div className="bg-gradient-to-r from-indigo-600 to-violet-700 rounded-2xl p-8 text-white shadow-xl">
                    <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                        <ClipboardList className="w-8 h-8" /> Testlar
                    </h1>
                    <p className="text-indigo-100">
                        Fanlar bo'yicha testlar
                    </p>
                    <p className="text-indigo-100/80 text-xs mt-1.5">
                        {myLanguage
                            ? `${TEACHING_LANGUAGES[myLanguage].short} uchun testlar`
                            : "Ta'lim tilingiz belgilanmagan — barcha testlar ko'rsatilmoqda"}
                    </p>
                </div>
            )}

            {/* Kitobxonlik testlari alohida ekanini AYTIB qo'yamiz.
                Jamlovchi sahifada bu izoh KERAK EMAS: u yerda ikkalasi
                yonma-yon tab bo'lib turadi va farqi tabning o'zida ko'rinadi. */}
            {!embedded && (
                <Card className="border-l-4 border-l-emerald-400">
                    <p className="text-xs text-gray-600 flex items-start gap-2">
                        <BookOpen size={14} className="text-emerald-600 shrink-0 mt-px" />
                        <span>
                            <b>Kitobxonlik testlari</b> bu yerda emas, alohida bo'limda —
                            ular ijtimoiy faollik indeksining 1-mezoniga ball beradi.
                            Bu yerdagi fan testlari indeksga kirmaydi.
                        </span>
                    </p>
                </Card>
            )}

            {error && (
                <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    {error}
                </p>
            )}

            {subjects.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                    <button
                        type="button"
                        onClick={() => setSubject('')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                            subject === '' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600'
                        }`}
                    >
                        Barchasi
                    </button>
                    {subjects.map(s => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setSubject(s)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                                subject === s ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600'
                            }`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}

            {visible.length === 0 ? (
                <Card>
                    <div className="p-10 text-center space-y-2">
                        <ClipboardList size={28} className="mx-auto text-gray-300" />
                        <p className="text-sm font-semibold text-gray-700">Hozircha test yo'q</p>
                        <p className="text-xs text-gray-500">
                            E'lon qilingan test paydo bo'lganda shu yerda ko'rinadi.
                        </p>
                    </div>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {visible.map(row => {
                        const { test, best, attempts, questionCount, check } = row;
                        const percent = best && best.maxScore > 0
                            ? Math.round((best.score / best.maxScore) * 100)
                            : null;
                        return (
                            <Card key={test.id}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-gray-900">{test.title}</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {[
                                                test.subject,
                                                `${questionCount} savol`,
                                                test.testTimeLimit ? `${test.testTimeLimit} daqiqa` : null,
                                            ].filter(Boolean).join(' · ')}
                                        </p>
                                    </div>
                                    {best && (
                                        <Badge variant={percent >= (test.passPercent || 60) ? 'success' : 'warning'} size="sm">
                                            {percent}%
                                        </Badge>
                                    )}
                                </div>

                                {attempts > 0 && (
                                    <p className="text-[11px] text-gray-400 mt-2">
                                        {attempts} marta topshirilgan
                                        {best && ` · eng yaxshi natija ${best.score}/${best.maxScore}`}
                                    </p>
                                )}

                                <div className="mt-3">
                                    {check.allowed ? (
                                        <Button variant="primary" size="sm" icon={Play} onClick={() => start(row)}>
                                            {attempts > 0 ? 'Qayta topshirish' : 'Boshlash'}
                                        </Button>
                                    ) : (
                                        <p className="text-[11px] font-semibold text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                                            {check.reason}
                                        </p>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Boshlashdan oldin tasdiq - vaqt boshlanadi, buni talaba bilishi kerak. */}
            <Modal isOpen={!!confirming} onClose={() => setConfirming(null)} title="Testni boshlash">
                {confirming && (
                    <div className="space-y-4">
                        <p className="text-sm font-bold text-gray-900">{confirming.test.title}</p>
                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl space-y-1">
                            <p className="text-[11px] text-amber-900 flex items-start gap-1.5">
                                <Clock size={12} className="shrink-0 mt-px" />
                                <span>
                                    Boshlaganingizdan so'ng <b>vaqt yurishni boshlaydi</b> va oynani
                                    yopsangiz ham to'xtamaydi. Javoblaringiz saqlanadi — qaytib
                                    kelib davom ettirishingiz mumkin.
                                </span>
                            </p>
                        </div>
                        <p className="text-xs text-gray-600">
                            {confirming.questions.length} ta savol
                            {confirming.test.testTimeLimit ? ` · ${confirming.test.testTimeLimit} daqiqa` : ''}
                        </p>
                        <div className="flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={() => setConfirming(null)}>
                                Bekor qilish
                            </Button>
                            <Button variant="primary" className="flex-1" disabled={busy} onClick={reallyStart}>
                                {busy ? 'Boshlanmoqda...' : 'Boshlash'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Boshqa test yarim yo'lda qolgan - vaqti yurib turibdi. */}
            <Modal isOpen={!!blocked} onClose={() => setBlocked(null)} title="Tugallanmagan test bor">
                {blocked && (
                    <div className="space-y-4">
                        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-1.5">
                            <AlertTriangle size={13} className="shrink-0 mt-px" />
                            <span>
                                Siz boshlagan boshqa test hali tugatilmagan va uning
                                <b> vaqti yurib turibdi</b>. Avval o'shani yakunlang.
                            </span>
                        </p>
                        <p className="text-sm font-semibold text-gray-900">{blocked.test?.title}</p>
                        <div className="flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={() => setBlocked(null)}>
                                Yopish
                            </Button>
                            <Button
                                variant="primary" className="flex-1"
                                onClick={() => {
                                    const check = db.canTakeTest(username, blocked.testId);
                                    setBlocked(null);
                                    if (!check.allowed) { setError(check.reason); return; }
                                    const test = (db.getTests() || []).find(t => t.id === blocked.testId);
                                    if (test) setActive({ test, questions: check.questions });
                                }}
                            >
                                Davom ettirish
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            <TestRunner
                active={active}
                studentId={username}
                passPercent={active?.test?.passPercent || null}
                submitAnswers={db.submitTest}
                onClose={() => setActive(null)}
                onFinished={(attempt, test, auto) => {
                    setFinished({ attempt, test, auto });
                    setActive(null);
                    setVersion(v => v + 1);
                }}
            />

            <TestResultModal
                finished={finished}
                passPercent={finished?.test?.passPercent || null}
                onClose={() => setFinished(null)}
            />
        </div>
    );
};

export default TestsModule;
