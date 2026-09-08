import React, { useMemo, useState } from 'react';
import { Search, Crown, Medal } from 'lucide-react';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { getStudentTasRows } from '../../utils/rankingsAnalytics';
import { TAS_MAX_TOTAL } from '../../utils/studentScoring';

// TALABALAR REYTINGI — talabaning o'zi ko'radigan ko'rinish.
//
// FAQAT TO'RTTA USTUN: F.I.Sh., fakultet, kurs, ball. Guruh, talaba ID, jinsi va
// qolgan shaxsiy ma'lumot ATAYLAB yo'q - qoida shunday belgilangan va u bazada ham
// mustahkamlangan (supabase/rls_personal_data.sql: `profiles_directory` ko'rinishi
// shaxsiy ustunlarni xodim bo'lmaganga NULL qilib qaytaradi).
//
// Ya'ni himoya ikki qatlamda: bu yerda ustun chizilmaydi, bazada esa qiymat
// umuman berilmaydi. Birinchisi kifoya emas - kodni o'zgartirgan odam ikkinchisini
// chetlab o'ta olmaydi.

const PAGE = 25;

const rankIcon = (rank) => {
    if (rank === 1) return <Crown size={16} className="text-yellow-500" />;
    if (rank === 2) return <Medal size={16} className="text-gray-400" />;
    if (rank === 3) return <Medal size={16} className="text-amber-700" />;
    return <span className="text-xs font-bold text-gray-400">{rank}</span>;
};

const StudentRankingTab = () => {
    const { user } = useAuth();
    const [query, setQuery] = useState('');
    const [shown, setShown] = useState(PAGE);

    // Bir marta hisoblanadi. `withCachedReads` - ichkarida yuzlab talaba uchun
    // o'nlab db chaqiruvi bor va har biri kesh bo'lmasa butun bazani qayta
    // o'qirdi (services/db.js dagi izohga qarang).
    const ranked = useMemo(() => db.withCachedReads(() => {
        return getStudentTasRows(db)
            .sort((a, b) => b.tas.total - a.tas.total)
            .map((row, i) => ({
                rank: i + 1,
                studentId: row.student.id,
                fullName: row.student.fullName,
                faculty: row.student.faculty || '—',
                course: row.student.course ?? '—',
                total: row.tas.total,
                complete: row.tas.complete,
                measuredCount: row.tas.measuredCount,
                dimensionCount: row.tas.dimensionCount,
            }));
    }), []);

    const me = useMemo(
        () => ranked.find(r => r.studentId === user?.username) || null,
        [ranked, user?.username]
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return ranked;
        return ranked.filter(r =>
            r.fullName?.toLowerCase().includes(q) || r.faculty?.toLowerCase().includes(q));
    }, [ranked, query]);

    return (
        <div className="space-y-4">
            {/* O'Z O'RNI birinchi ko'rinadi: talaba ro'yxatni ochganda birinchi
                savoli "men qayerdaman" bo'ladi, uni 500 qator ichidan qidirmasin. */}
            {me && (
                <div className="bg-gradient-to-r from-indigo-600 to-purple-700 rounded-2xl p-5 text-white">
                    <p className="text-xs font-bold text-white/70 uppercase tracking-wider">Sizning o'rningiz</p>
                    <div className="flex items-baseline gap-3 mt-1">
                        <span className="text-3xl font-black">{me.rank}</span>
                        <span className="text-white/70 text-sm">/ {ranked.length} talaba</span>
                        <span className="ml-auto text-2xl font-black tabular-nums">
                            {me.total}
                            <span className="text-sm font-normal text-white/60"> / {TAS_MAX_TOTAL}</span>
                        </span>
                    </div>
                    {!me.complete && (
                        <p className="text-[11px] text-amber-200 mt-2">
                            {me.dimensionCount} o'lchovdan {me.measuredCount} tasi hisoblandi —
                            GPA va davomat kiritilgach o'rningiz o'zgarishi mumkin.
                        </p>
                    )}
                </div>
            )}

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setShown(PAGE); }}
                    placeholder="Ism yoki fakultet bo'yicha qidirish..."
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                />
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 text-[11px] font-bold text-gray-400 uppercase">
                                <th className="px-4 py-3 text-left w-16">O'rin</th>
                                <th className="px-4 py-3 text-left">Talaba</th>
                                <th className="px-4 py-3 text-left">Fakultet</th>
                                <th className="px-4 py-3 text-center">Kurs</th>
                                <th className="px-4 py-3 text-right">Ball</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filtered.slice(0, shown).map(r => {
                                const isMe = r.studentId === user?.username;
                                return (
                                    <tr key={r.studentId} className={isMe ? 'bg-indigo-50' : 'hover:bg-gray-50/50'}>
                                        <td className="px-4 py-2.5">{rankIcon(r.rank)}</td>
                                        <td className="px-4 py-2.5 font-medium text-gray-900">
                                            {r.fullName}
                                            {isMe && <span className="ml-2 text-[10px] font-black text-indigo-600">SIZ</span>}
                                        </td>
                                        <td className="px-4 py-2.5 text-gray-500 text-xs">{r.faculty}</td>
                                        <td className="px-4 py-2.5 text-center text-gray-600">{r.course}</td>
                                        <td className="px-4 py-2.5 text-right font-black text-indigo-700 tabular-nums">
                                            {r.total}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                                        Topilmadi
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {shown < filtered.length && (
                    <button
                        type="button"
                        onClick={() => setShown(s => s + PAGE)}
                        className="w-full py-3 text-sm font-bold text-indigo-600 hover:bg-indigo-50 border-t border-gray-100"
                    >
                        Yana {Math.min(PAGE, filtered.length - shown)} tasini ko'rsatish
                    </button>
                )}
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
                Reytingda faqat ism, fakultet, kurs va ball ko'rsatiladi. Guruh, talaba ID va
                boshqa shaxsiy ma'lumotlar boshqa talabalarga ko'rinmaydi.
            </p>
        </div>
    );
};

export default StudentRankingTab;
