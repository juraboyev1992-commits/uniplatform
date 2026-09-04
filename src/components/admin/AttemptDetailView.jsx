import React, { useMemo } from 'react';
import { CheckCircle2, XCircle, MinusCircle, Clock, ArrowLeft, Info } from 'lucide-react';
import Badge from '../common/Badge';
import { db } from '../../services/db';

// URINISHNING ICHI.
//
// Ro'yxatda faqat yakuniy raqam ko'rinardi ("18/20, 90%"). Bu yerda esa
// talaba nima qilgani to'liq ko'rinadi: qaysi savolga qaysi variantni
// tanlagan, to'g'ri javob qaysi edi va har savolga qancha vaqt ketgan.
//
// YO'Q MA'LUMOT NOL BILAN TO'LDIRILMAYDI: savol vaqti keyin qo'shilgan
// imkoniyat, shuning uchun eski urinishlarda u `—` ko'rinadi. "0 soniya
// sarfladi" deb yozish yolg'on bo'lardi.
const formatDuration = (seconds) => {
    if (seconds == null) return '—';
    if (seconds < 60) return `${seconds} son`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s === 0 ? `${m} daq` : `${m} daq ${s} son`;
};

const StatBox = ({ label, value, hint, tone = 'gray' }) => {
    const tones = {
        gray: 'bg-gray-50 text-gray-900',
        emerald: 'bg-emerald-50 text-emerald-700',
        rose: 'bg-rose-50 text-rose-700',
        amber: 'bg-amber-50 text-amber-700',
        indigo: 'bg-indigo-50 text-indigo-700',
    };
    return (
        <div className={`rounded-xl px-3 py-2.5 ${tones[tone]}`}>
            <p className="text-[11px] opacity-70">{label}</p>
            <p className="text-xl font-black tabular-nums">{value}</p>
            {hint && <p className="text-[11px] opacity-60 mt-0.5">{hint}</p>}
        </div>
    );
};

const AttemptDetailView = ({ attemptId, onBack }) => {
    const detail = useMemo(() => db.getAttemptDetail(attemptId), [attemptId]);

    if (!detail) {
        return <p className="py-10 text-center text-sm text-gray-400">Urinish topilmadi.</p>;
    }

    const { attempt, test, student, questions, summary } = detail;

    return (
        <div className="space-y-4">
            {onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-indigo-600"
                >
                    <ArrowLeft size={15} /> Ro'yxatga qaytish
                </button>
            )}

            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-lg font-black text-gray-900">
                        {student?.fullName || attempt.studentId}
                    </h3>
                    <p className="text-xs text-gray-400">
                        {test?.title || 'Test'}
                        {student?.faculty && ` · ${student.faculty}`}
                        {student?.course && ` · ${student.course}-kurs`}
                    </p>
                </div>
                <p className="text-xs text-gray-400 text-right">
                    {attempt.finishedAt
                        ? new Date(attempt.finishedAt).toLocaleString('uz-UZ')
                        : 'Yakunlanmagan'}
                </p>
            </div>

            {/* --- XULOSA --- */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
                <StatBox
                    label="To'g'ri" value={summary.correct} tone="emerald"
                    hint={`${summary.total} tadan`}
                />
                <StatBox label="Noto'g'ri" value={summary.wrong} tone="rose" />
                {/* Javobsiz qolgan savol NOTO'G'RI bilan bir xil emas:
                    talaba ulgurmagan yoki tashlab ketgan bo'lishi mumkin. */}
                <StatBox
                    label="Javobsiz" value={summary.unanswered}
                    tone={summary.unanswered > 0 ? 'amber' : 'gray'}
                />
                <StatBox
                    label="Foiz" value={summary.percent == null ? '—' : `${summary.percent}%`}
                    tone="indigo" hint={`${summary.score} / ${summary.maxScore} ball`}
                />
                <StatBox
                    label="Umumiy vaqt" value={formatDuration(summary.totalSeconds)}
                    hint={summary.averageSeconds != null
                        ? `o'rtacha ${formatDuration(summary.averageSeconds)} / savol`
                        : null}
                />
            </div>

            {!summary.hasQuestionTimes && (
                <p className="flex items-start gap-2 text-[11px] text-gray-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                    <Info size={13} className="shrink-0 mt-px text-gray-400" />
                    <span>
                        Bu urinishda <b>savol bo'yicha vaqt yozilmagan</b> — u keyinroq
                        qo'shilgan imkoniyat. Yangi topshiriqlarda har savolga sarflangan
                        vaqt ko'rinadi.
                    </span>
                </p>
            )}

            {summary.hasQuestionTimes && summary.slowest?.seconds > 0 && (
                <p className="text-[11px] text-gray-500">
                    Eng ko'p vaqt ketgan savol: <b>{summary.slowest.index}-savol</b>
                    {' '}({formatDuration(summary.slowest.seconds)})
                </p>
            )}

            {/* --- SAVOLLAR --- */}
            <div className="space-y-2">
                {questions.map(q => {
                    const unanswered = q.chosenIndex == null;
                    const border = unanswered ? 'border-amber-200 bg-amber-50/40'
                        : q.isCorrect ? 'border-emerald-200 bg-emerald-50/30'
                            : 'border-rose-200 bg-rose-50/30';
                    return (
                        <div key={q.questionId} className={`rounded-2xl border p-4 ${border}`}>
                            <div className="flex items-start gap-3">
                                <span className="shrink-0 mt-0.5">
                                    {unanswered
                                        ? <MinusCircle size={17} className="text-amber-500" />
                                        : q.isCorrect
                                            ? <CheckCircle2 size={17} className="text-emerald-600" />
                                            : <XCircle size={17} className="text-rose-600" />}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <p className="font-semibold text-gray-900">
                                            <span className="text-gray-400 mr-1.5">{q.index}.</span>
                                            {q.text}
                                        </p>
                                        <span className="flex items-center gap-1 text-[11px] text-gray-500 shrink-0">
                                            <Clock size={11} /> {formatDuration(q.seconds)}
                                        </span>
                                    </div>

                                    {/* Barcha variantlar ko'rsatiladi: talaba nimani
                                        tanlagani va to'g'risi qaysi ekani bir qarashda
                                        ko'rinsin. */}
                                    {q.options.length > 0 ? (
                                        <div className="mt-2 space-y-1">
                                            {q.options.map((opt, i) => {
                                                const text = opt?.text ?? opt;
                                                const isChosen = i === q.chosenIndex;
                                                const isRight = i === q.correctIndex;
                                                return (
                                                    <div
                                                        key={i}
                                                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
                                                            isRight ? 'bg-emerald-100 text-emerald-900 font-semibold'
                                                                : isChosen ? 'bg-rose-100 text-rose-900 font-semibold'
                                                                    : 'text-gray-500'
                                                        }`}
                                                    >
                                                        <span className="w-4 shrink-0 text-center opacity-60">
                                                            {String.fromCharCode(65 + i)}
                                                        </span>
                                                        <span className="min-w-0 flex-1">{text}</span>
                                                        {isChosen && (
                                                            <Badge variant={isRight ? 'success' : 'danger'} size="sm">
                                                                Tanlagan
                                                            </Badge>
                                                        )}
                                                        {isRight && !isChosen && (
                                                            <Badge variant="success" size="sm">To'g'ri javob</Badge>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-gray-400 mt-1.5">
                                            Savol variantlari saqlanmagan
                                            {q.chosenIndex != null && ` · tanlangan: ${String.fromCharCode(65 + q.chosenIndex)}`}
                                        </p>
                                    )}

                                    {unanswered && (
                                        <p className="text-[11px] text-amber-700 mt-1.5">
                                            Javob berilmagan
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default AttemptDetailView;
