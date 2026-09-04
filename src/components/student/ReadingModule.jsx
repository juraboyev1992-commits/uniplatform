import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Library, Search, CheckCircle2, Clock, BookOpen, ArrowRight, Info,
} from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import ProgressBar from '../common/ProgressBar';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { INDEX_CRITERIA, booksToPoints } from '../../config/socialActivityIndex';
import { TEACHING_LANGUAGES } from '../../constants';

// KUTUBXONA — metodikaning "100 ta eng sara badiiy adabiyot" ro'yxati.
//
// Bu bo'lim ilgari kodga yozib qo'yilgan kitoblar ro'yxatini ko'rsatardi:
// muqova, sahifa soni, "o'qilmoqda 45%" kabi ko'rsatkichlar — hammasi
// to'qima edi va hech qaysi kitob platformadagi test bilan bog'lanmagandi.
//
// Bu HAQIQIY kutubxona emas: kitob berish-qaytarish, ombor, band qilish yo'q
// va kerak emas. Bu — indeksning 1-mezoni uchun ASARLAR RO'YXATI: talaba
// qaysi asarni o'qigani (ya'ni testdan o'tgani) shu yerda ko'rinadi.
//
// Ro'yxat POTOK bo'yicha ajratiladi: o'zbek va rus potoklari alohida asarlar
// o'qiydi.
const ReadingModule = ({ embedded = false }) => {
    const { user } = useAuth();
    const username = user?.username;
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all'); // all | passed | todo

    const myLanguage = useMemo(
        () => db.getStudentTeachingLanguage(username),
        [username]
    );

    const books = useMemo(() => {
        return db.getReadingTests(myLanguage).map(t => {
            const attempts = db.getStudentTestAttempts(username, t.id).filter(a => a.finishedAt);
            const best = attempts.length
                ? attempts.reduce((b, a) => (a.score > b.score ? a : b), attempts[0])
                : null;
            const pass = t.passPercent || 60;
            const percent = best && best.maxScore > 0
                ? Math.round((best.score / best.maxScore) * 100)
                : null;
            return {
                test: t,
                title: t.readingBook.title,
                author: t.readingBook.author,
                language: t.readingBook.language || null,
                published: !!t.isPublished,
                percent,
                passed: percent != null && percent >= pass,
                attempted: attempts.length > 0,
            };
        });
    }, [username, myLanguage]);

    const passedCount = books.filter(b => b.passed).length;
    const points = booksToPoints(passedCount) ?? 0;

    const visible = books
        .filter(b => {
            if (filter === 'passed') return b.passed;
            if (filter === 'todo') return !b.passed;
            return true;
        })
        .filter(b => {
            const q = query.trim().toLowerCase();
            if (!q) return true;
            return b.title.toLowerCase().includes(q)
                || String(b.author || '').toLowerCase().includes(q);
        })
        .sort((a, b) => a.title.localeCompare(b.title));

    return (
        <div className="space-y-6">
            {/* `embedded` izohi ReadingTestsModule da. */}
            {!embedded && (
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-8 text-white shadow-xl flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                        <Library className="w-8 h-8" /> Kutubxona
                    </h1>
                    <p className="text-emerald-100">
                        Tavsiya etilgan badiiy adabiyot ro'yxati
                    </p>
                    <p className="text-emerald-100/80 text-xs mt-1.5">
                        {myLanguage
                            ? `${TEACHING_LANGUAGES[myLanguage].short} uchun ro'yxat`
                            : "Ta'lim tilingiz belgilanmagan — barcha asarlar ko'rsatilmoqda"}
                    </p>
                </div>
                <div className="bg-white/20 backdrop-blur-md p-4 rounded-2xl border border-white/30 text-center min-w-[140px]">
                    <p className="text-sm opacity-80 mb-1">O'qilgan asarlar</p>
                    <p className="text-3xl font-bold tabular-nums">
                        {passedCount}<span className="text-lg opacity-70"> / {books.length}</span>
                    </p>
                    <p className="text-xs opacity-80 mt-1">
                        {points} / {INDEX_CRITERIA.READING.maxPoints} ball
                    </p>
                </div>
            </div>
            )}

            {/* Ball qanday berilishini AYTIB qo'yamiz - "o'qidim, nega ball
                yo'q" degan savol shundan tug'iladi. */}
            <Card className="border-l-4 border-l-emerald-400">
                <p className="text-xs text-gray-600 flex items-start gap-2">
                    <Info size={14} className="text-emerald-600 shrink-0 mt-px" />
                    <span>
                        Asar <b>o'qilgan</b> hisoblanishi uchun uning testidan o'tish kerak —
                        ro'yxatda belgilash ball bermaydi. Ball asarlar soniga qarab beriladi:
                        {' '}{INDEX_CRITERIA.READING.bands.map(b => `${b.min}-${b.max} ta → ${b.points} ball`).join(', ')}.
                    </span>
                </p>
            </Card>

            {books.length > 0 && (
                <Card>
                    <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-gray-600">Ro'yxat bo'yicha o'zlashtirish</span>
                        <span className="font-bold text-gray-900 tabular-nums">
                            {passedCount} / {books.length}
                        </span>
                    </div>
                    <ProgressBar
                        value={books.length > 0 ? (passedCount / books.length) * 100 : 0}
                        max={100} color="auto" size="md"
                    />
                </Card>
            )}

            <div className="flex gap-3 flex-wrap">
                <div className="flex-1 min-w-[220px] relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text" value={query} onChange={e => setQuery(e.target.value)}
                        placeholder="Asar yoki muallif bo'yicha qidirish..."
                        className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm"
                    />
                </div>
                {[
                    { key: 'all', label: 'Barchasi' },
                    { key: 'passed', label: "O'qilgan" },
                    { key: 'todo', label: 'Qolgan' },
                ].map(f => (
                    <button
                        key={f.key}
                        type="button"
                        onClick={() => setFilter(f.key)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold ${
                            filter === f.key
                                ? 'bg-emerald-600 text-white'
                                : 'bg-white border border-gray-200 text-gray-600'
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {books.length === 0 ? (
                <Card>
                    <div className="p-10 text-center space-y-2">
                        <BookOpen size={28} className="mx-auto text-gray-300" />
                        <p className="text-sm font-semibold text-gray-700">Ro'yxat hali to'ldirilmagan</p>
                        <p className="text-xs text-gray-500">
                            Asarlar qo'shilganda shu yerda ko'rinadi.
                        </p>
                    </div>
                </Card>
            ) : visible.length === 0 ? (
                <Card>
                    <p className="p-10 text-center text-sm text-gray-400">Asar topilmadi.</p>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visible.map(b => (
                        <Card key={b.test.id} className={b.passed ? 'border-emerald-200' : ''}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h3 className="font-bold text-gray-900 text-sm leading-snug">{b.title}</h3>
                                    {b.author && (
                                        <p className="text-xs text-gray-500 mt-0.5">{b.author}</p>
                                    )}
                                </div>
                                {b.passed ? (
                                    <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                                ) : b.attempted ? (
                                    <Clock size={16} className="text-amber-500 shrink-0" />
                                ) : null}
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-2">
                                {b.passed ? (
                                    <Badge variant="success" size="sm">O'qilgan · {b.percent}%</Badge>
                                ) : b.attempted ? (
                                    <Badge variant="warning" size="sm">Test o'tilmagan · {b.percent}%</Badge>
                                ) : b.published ? (
                                    <Badge variant="default" size="sm">Test topshirilmagan</Badge>
                                ) : (
                                    <Badge variant="default" size="sm">Test tayyorlanmoqda</Badge>
                                )}

                                {b.published && !b.passed && (
                                    <Link
                                        to="/student/library?tab=kitobxonlik"
                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline shrink-0"
                                    >
                                        Testga o'tish <ArrowRight size={11} />
                                    </Link>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ReadingModule;
