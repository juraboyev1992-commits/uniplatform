import React, { useMemo } from 'react';
import { AlertTriangle, BookOpen, Info, TrendingDown } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import { db } from '../../services/db';
import { TEACHING_LANGUAGES } from '../../constants/index.js';
import {
    getTestOverview, getTestPerformance, getLanguageStreamStats, getBookPopularity,
} from '../../utils/testStats';

// TESTLAR TAHLILI.
//
// Ilgari testlar bo'yicha yagona raqam "nechta urinish" edi - undan test
// yaxshimi yoki yomonmi bilib bo'lmasdi.
//
// `null` NOL EMAS: hali topshirilmagan testda o'tish foizi `—` bo'ladi,
// "0%" emas. Nol foiz "hamma yiqildi" degani, `—` esa "ma'lumot yo'q".
const dash = (v, suffix = '%') => (v === null || v === undefined ? '—' : `${v}${suffix}`);

const languageLabel = (key) => TEACHING_LANGUAGES[key]?.short || 'Ta\'lim tili belgilanmagan';

const StatBox = ({ label, value, hint, tone = 'gray' }) => {
    const tones = {
        gray: 'bg-gray-50 text-gray-900',
        amber: 'bg-amber-50 text-amber-700',
        emerald: 'bg-emerald-50 text-emerald-700',
        red: 'bg-red-50 text-red-700',
    };
    return (
        <div className={`rounded-xl px-4 py-3 ${tones[tone]}`}>
            <p className="text-xs opacity-70">{label}</p>
            <p className="text-2xl font-black tabular-nums">{value}</p>
            {hint && <p className="text-[11px] opacity-60 mt-0.5">{hint}</p>}
        </div>
    );
};

const TestAnalyticsTab = () => {
    const overview = useMemo(() => getTestOverview(db), []);
    const performance = useMemo(() => getTestPerformance(db), []);
    const streams = useMemo(() => getLanguageStreamStats(db), []);
    const books = useMemo(() => getBookPopularity(db), []);

    const streamGap = Math.abs(streams.available.uz - streams.available.ru);

    return (
        <div className="space-y-6">
            {/* --- UMUMIY --- */}
            <Card title="Umumiy holat" subtitle={`${overview.tests} ta test, shundan ${overview.readingTests} tasi kitobxonlik`}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatBox label="Yakunlangan urinish" value={overview.finished} />
                    <StatBox
                        label="Tashlab ketilgan" value={overview.abandoned} tone="amber"
                        hint={overview.abandonRate !== null ? `${overview.abandonRate}% urinishlardan` : null}
                    />
                    <StatBox
                        label="O'rtacha o'tish" value={dash(overview.averagePassRate)} tone="emerald"
                        hint="topshirilgan testlar bo'yicha"
                    />
                    <StatBox
                        label="Topshirilmagan test" value={overview.untouched}
                        hint="hali hech kim kirmagan"
                    />
                </div>

                {(overview.tooHard.length > 0 || overview.tooEasy.length > 0) && (
                    <div className="mt-4 space-y-2">
                        {overview.tooHard.length > 0 && (
                            <div className="flex gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
                                <TrendingDown size={15} className="text-red-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-red-800 leading-relaxed">
                                    <b>{overview.tooHard.length} ta testdan</b> deyarli hech kim o'ta olmagan
                                    (20% va undan past): {overview.tooHard.map(t => t.title).join(', ')}.
                                    Savollari dasturga mos kelmasligi mumkin.
                                </p>
                            </div>
                        )}
                        {overview.tooEasy.length > 0 && (
                            <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-100">
                                <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-800 leading-relaxed">
                                    <b>{overview.tooEasy.length} ta testdan</b> hamma o'tgan — ular hech
                                    kimni ajratmaydi: {overview.tooEasy.map(t => t.title).join(', ')}.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </Card>

            {/* --- POTOK KESIMI --- */}
            <Card title="Potok kesimi" subtitle="Kitobxonlik testlari bo'yicha">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <div className="rounded-xl border border-gray-100 px-4 py-3">
                        <p className="text-xs text-gray-500">O'zbek potok uchun asarlar</p>
                        <p className="text-2xl font-black text-gray-900 tabular-nums">{streams.available.uz}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 px-4 py-3">
                        <p className="text-xs text-gray-500">Rus potok uchun asarlar</p>
                        <p className="text-2xl font-black text-gray-900 tabular-nums">{streams.available.ru}</p>
                    </div>
                </div>

                {streamGap > 0 && (
                    <p className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4">
                        <AlertTriangle size={14} className="shrink-0 mt-px text-amber-600" />
                        <span>
                            Ikki potok o'rtasida <b>{streamGap} ta</b> asar farqi bor. Ro'yxat teng
                            bo'lmasa, bir potok talabasi 1-mezonda kamroq imkoniyatga ega bo'ladi.
                        </span>
                    </p>
                )}

                {streams.rows.length === 0 ? (
                    <p className="py-6 text-center text-sm text-gray-400">
                        Kitobxonlik testi hali topshirilmagan.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="border-b border-gray-100">
                                <tr>
                                    <th className="py-2 text-xs font-semibold text-gray-500 uppercase">Potok</th>
                                    <th className="py-2 text-xs font-semibold text-gray-500 uppercase text-right">Talaba</th>
                                    <th className="py-2 text-xs font-semibold text-gray-500 uppercase text-right">Urinish</th>
                                    <th className="py-2 text-xs font-semibold text-gray-500 uppercase text-right">O'tgan</th>
                                    <th className="py-2 text-xs font-semibold text-gray-500 uppercase text-right">O'tish %</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {streams.rows.map(r => (
                                    <tr key={r.language}>
                                        <td className="py-2.5 text-sm font-medium text-gray-900">
                                            {languageLabel(r.language)}
                                        </td>
                                        <td className="py-2.5 text-sm text-gray-600 text-right tabular-nums">{r.students}</td>
                                        <td className="py-2.5 text-sm text-gray-600 text-right tabular-nums">{r.attempts}</td>
                                        <td className="py-2.5 text-sm text-gray-600 text-right tabular-nums">{r.passed}</td>
                                        <td className="py-2.5 text-right">
                                            <Badge variant={r.passRate >= 60 ? 'success' : r.passRate >= 30 ? 'warning' : 'danger'} size="sm">
                                                {dash(r.passRate)}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className="flex items-start gap-2 text-[11px] text-gray-500 mt-3">
                    <Info size={13} className="shrink-0 mt-px text-gray-400" />
                    Potok talabaning pasportidagi "Ta'lim tili" maydonidan olinadi. Belgilanmagan
                    talabalar alohida qatorda — ularni o'zbek potokka qo'shib yuborish raqamni buzardi.
                </p>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* --- TESTLAR RO'YXATI --- */}
                <Card title="Testlar bo'yicha" subtitle="Urinishlar soni bo'yicha tartiblangan">
                    {performance.length === 0 ? (
                        <p className="py-8 text-center text-sm text-gray-400">Test yaratilmagan.</p>
                    ) : (
                        <div className="divide-y divide-gray-50 max-h-[28rem] overflow-y-auto">
                            {performance.map(t => (
                                <div key={t.id} className="py-2.5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 truncate">{t.title}</p>
                                            <p className="text-[11px] text-gray-400">
                                                {t.isReading ? 'Kitobxonlik' : (t.subject || 'Fan belgilanmagan')}
                                                {' · '}o'tish chegarasi {t.passPercent}%
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-sm font-bold text-gray-900 tabular-nums">{dash(t.passRate)}</p>
                                            <p className="text-[11px] text-gray-400">
                                                {t.finished} ta yakunlangan
                                                {t.abandoned > 0 && <span className="text-amber-600"> · {t.abandoned} tashlangan</span>}
                                            </p>
                                        </div>
                                    </div>
                                    {t.passRate !== null && (
                                        <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${t.passRate <= 20 ? 'bg-red-400' : t.passRate < 60 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                                                style={{ width: `${t.passRate}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                {/* --- KITOBLAR --- */}
                <Card title="Kitoblar" subtitle="Eng ko'p o'qilganlar">
                    {books.length === 0 ? (
                        <p className="py-8 text-center text-sm text-gray-400">
                            Kitobxonlik ro'yxati hali kiritilmagan.
                        </p>
                    ) : (
                        <div className="divide-y divide-gray-50 max-h-[28rem] overflow-y-auto">
                            {books.map(b => (
                                <div key={b.id} className="flex items-center gap-3 py-2.5">
                                    <BookOpen size={15} className="text-blue-500 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-900 truncate">{b.title}</p>
                                        <p className="text-[11px] text-gray-400 truncate">
                                            {b.author || 'Muallif ko\'rsatilmagan'}
                                            {b.language && ` · ${TEACHING_LANGUAGES[b.language]?.label || b.language}`}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-bold text-gray-900 tabular-nums">{b.passed}</p>
                                        <p className="text-[11px] text-gray-400">{b.readers} o'qigan</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default TestAnalyticsTab;
