import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Trophy, RefreshCw, Lock, LogIn, AlertTriangle } from 'lucide-react';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { getDisplayStages, computeGroupStandings, getTurRaundGroups } from '../../config/competitionEngines';

// JONLI EKRAN - zaldagi proyektor uchun.
//
// ILGARI ISHLAMASDI. Sahifa `db.getLeaderboard()` ni chaqirardi, u esa
// BRAUZERDAGI mahalliy nusxadan o'qiydi. Serverga birorta ham so'rov
// yo'q edi: har 5 soniyada taymer `tick` ni oshirib, o'SHA O'ZGARMAGAN
// nusxani qayta o'qirdi. Burchakdagi aylanayotgan belgi "jonli" degan
// taassurot berardi, raqamlar esa oxirgi sinxronizatsiyada qotib qolardi.
// Tizimga kirmagan kompyuterda esa mahalliy nusxa DEMO ma'lumot bo'lardi
// va ekran "Musobaqa topilmadi" deb turardi.
//
// ENDI: sahifa serverdan o'qiydi va TIZIMGA KIRISH talab qiladi -
// musobaqa va ballarni o'qish qoidasi `to authenticated`. Proyektorni
// ulagan odam o'z hisobi bilan kiradi; ish maydonidagi tugma orqali
// ochilsa, yangi oyna o'sha seansni oladi va hech narsa so'ralmaydi.

const REFRESH_MS = 8000;
// Ro'yxat ekranga sig'masa o'zi aylanadi: zalda hech kim sichqoncha
// bilan pastga tushirib o'tirmaydi.
const SCROLL_STEP_PX = 1;
const SCROLL_TICK_MS = 50;
const SCROLL_PAUSE_MS = 2500;
// Proyektorda ustun soni cheksiz emas. Bu chegaradan oshsa savol
// ustunlari olib tashlanadi va o'rniga Raund yig'indisi chiqadi - lekin
// JIM QOLMAYDI, tepada nima bo'lganini yozib qo'yadi. Ilgari shu yerda
// `.slice(-12)` turardi: 2 Raundli (24 savollik) Turda birinchi Raund
// butunlay ko'rinmay ketardi va buni hech narsa aytmasdi.
const MAX_QUESTION_COLUMNS = 26;

const CARD = 'bg-slate-900 rounded-3xl border border-slate-800';

// ---------------------------------------------------------------------------
// SPORT (match_play) - guruh jadvali.
// Reyting tabi (CompetitionRatingTab.jsx) bilan AYNAN bir manba:
// uchrashuvlar + guruhlar -> computeGroupStandings. Ikki joyda ikki xil
// hisob bo'lmasligi uchun o'sha funksiya qayta ishlatiladi.
// ---------------------------------------------------------------------------
const SportBoard = ({ competition, tick }) => {
    const groups = useMemo(() => db.getCompetitionGroups(competition.id), [competition.id, tick]);
    const matches = useMemo(() => db.getCompetitionMatches(competition.id), [competition.id, tick]);
    const byGroup = groups.map(g => ({
        name: g.name,
        rows: computeGroupStandings(
            matches.filter(m => m.groupName === g.name),
            (competition.participants || []).filter(p => g.participantIds.includes(p.id))
        ),
    }));

    if (byGroup.length === 0) {
        return <p className="p-12 text-center text-slate-500 text-xl">Hali guruhlar tuzilmagan.</p>;
    }

    return (
        <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
            {byGroup.map(g => (
                <div key={g.name} className="rounded-2xl border border-slate-800 overflow-hidden">
                    <div className="bg-slate-800 px-4 py-2 text-lg font-black text-slate-200">
                        {g.name} guruhi
                    </div>
                    <table className="w-full text-left">
                        <thead className="text-sm font-bold text-slate-500 uppercase">
                            <tr>
                                <th className="p-3">Jamoa</th>
                                <th className="p-3 text-center">O&rsquo;</th>
                                <th className="p-3 text-center">G&rsquo;</th>
                                <th className="p-3 text-center">D</th>
                                <th className="p-3 text-center">M</th>
                                <th className="p-3 text-center">Farq</th>
                                <th className="p-3 text-center">Ochko</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {g.rows.map(r => (
                                <tr key={r.participant.id}>
                                    <td className="p-3 font-bold text-xl">{r.participant.name}</td>
                                    <td className="p-3 text-center text-lg tabular-nums">{r.played}</td>
                                    <td className="p-3 text-center text-lg tabular-nums text-emerald-400">{r.won}</td>
                                    <td className="p-3 text-center text-lg tabular-nums text-slate-500">{r.drawn}</td>
                                    <td className="p-3 text-center text-lg tabular-nums text-rose-400">{r.lost}</td>
                                    <td className="p-3 text-center text-lg tabular-nums">
                                        {r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}
                                    </td>
                                    <td className="p-3 text-center text-2xl font-black text-amber-400 tabular-nums">
                                        {r.points}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
};

// ---------------------------------------------------------------------------
// MUNOZARA / SUD (debate_match, court_match) - jamoa reytingi.
// Bu dvigatellar ham `competition_scores` ga yozmaydi, ballari
// `debate_matches` da. `db.getDebateTeamRating` - Reyting tabidagi manba.
// ---------------------------------------------------------------------------
const MatchRatingBoard = ({ competition, tick }) => {
    const rows = useMemo(() => db.getDebateTeamRating(competition.id), [competition.id, tick]);
    const played = rows.filter(r => r.matchesPlayed > 0);

    if (played.length === 0) {
        return <p className="p-12 text-center text-slate-500 text-xl">Hali yakunlangan uchrashuv yo&rsquo;q.</p>;
    }

    return (
        <table className="w-full text-left">
            <thead className="bg-slate-800/80 text-sm lg:text-base font-bold text-slate-400 uppercase sticky top-0">
                <tr>
                    <th className="p-4 w-16">#</th>
                    <th className="p-4">Jamoa</th>
                    {/* Jami ball ismdan keyin - bitta ekranda ikki jadval
                        qarama-qarshi tartibda turmasligi uchun. */}
                    <th className="p-4 text-right">Jami ball</th>
                    <th className="p-4 text-center">Uchrashuv</th>
                    <th className="p-4">Holat</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
                {rows.map((r, i) => (
                    <tr key={r.participant.id} className={i === 0 ? 'bg-amber-500/10' : ''}>
                        <td className="p-4 font-black text-2xl lg:text-3xl text-slate-300 tabular-nums">{i + 1}</td>
                        <td className="p-4 font-bold text-xl lg:text-2xl">{r.participant.name}</td>
                        <td className="p-4 text-right font-black text-3xl lg:text-4xl text-amber-400 tabular-nums">
                            {r.matchesPlayed > 0 ? r.totalBall : '–'}
                        </td>
                        <td className="p-4 text-center text-lg tabular-nums">{r.matchesPlayed}</td>
                        <td className="p-4 text-lg text-slate-400">{r.status}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

const CompetitionLiveScreenPage = () => {
    const { competitionId } = useParams();
    const { user, loading: authLoading } = useAuth();

    const [tick, setTick] = useState(0);
    const [updatedAt, setUpdatedAt] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [turIndex, setTurIndex] = useState(null);
    const scrollRef = useRef(null);

    // Serverdan o'qish. Xato bo'lsa ekran bo'shab qolmaydi - oxirgi
    // ko'rsatilgan natija turaveradi va tepada ogohlantirish chiqadi.
    useEffect(() => {
        if (!user) return undefined;
        let alive = true;

        const pull = async () => {
            try {
                await db.refreshCompetitionLive(competitionId);
                if (!alive) return;
                setLoadError('');
                setUpdatedAt(new Date());
                setTick(t => t + 1);
            } catch (e) {
                if (alive) setLoadError(e?.message || 'Yangilanmadi');
            }
        };

        pull();
        const id = setInterval(pull, REFRESH_MS);
        return () => { alive = false; clearInterval(id); };
    }, [competitionId, user]);

    const competition = useMemo(
        () => db.getCompetitionById(competitionId), [competitionId, tick]
    );
    const engine = competition?.scoringMethod;
    const isSport = engine === 'match_play';
    const isMatchRating = engine === 'debate_match' || engine === 'court_match';
    const isScoreGrid = !!competition && !isSport && !isMatchRating;

    const leaderboard = useMemo(
        () => (isScoreGrid ? db.getLeaderboard(competition.id) : []), [isScoreGrid, competition, tick]
    );

    // TURLAR. Ekran joriy Turni o'zi tanlaydi (musobaqa qayerda bo'lsa),
    // lekin tanlovni qo'lda ham o'zgartirish mumkin - zalda "oldingi Tur
    // qanday tugagandi" degan savol tez-tez chiqadi.
    const stages = useMemo(
        () => (isScoreGrid ? (getDisplayStages(competition) || []) : []), [isScoreGrid, competition]
    );
    const currentTur = useMemo(() => {
        if (turIndex != null && turIndex < stages.length) return turIndex;
        const cur = competition?.currentRound || 1;
        const at = stages.findIndex(s => cur >= s.roundRange[0] && cur <= s.roundRange[1]);
        return at >= 0 ? at : 0;
    }, [turIndex, stages, competition?.currentRound]);

    // TANLANGAN TURNING RAUNDLARI. Bir Turda ikki Raund bo'lsa ikkalasi
    // ham ko'rinadi: savol ustunlari Raund sarlavhasi ostiga yig'iladi va
    // har Raundning o'z yig'indisi chiqadi.
    const raundGroups = useMemo(
        () => (isScoreGrid ? getTurRaundGroups(competition, currentTur) : []),
        [isScoreGrid, competition, currentTur]
    );
    // Raund sarlavhasi faqat haqiqatan bir nechta Raund bo'lganda
    // chiqadi - UniQuiz kabi "har yozuv o'zi Raund" musobaqalarda ortiqcha.
    const grouped = raundGroups.length > 1 && !!raundGroups[0].label;
    const questionCount = raundGroups.reduce((n, g) => n + g.rounds.length, 0);
    const overflow = questionCount > MAX_QUESTION_COLUMNS;
    const showQuestions = !overflow || !grouped;
    // Guruhlangan va sig'adigan holatda har Raundga yig'indi ustuni.
    const showSubtotal = grouped && showQuestions;
    // Sig'masa: guruhlangan bo'lsa Raund yig'indisiga o'tadi, guruhlanmagan
    // bo'lsa oxirgi ustunlar qoladi - ikkisi ham tepada yozib aytiladi.
    const flatColumns = useMemo(() => {
        if (!showQuestions) return [];
        const all = raundGroups.flatMap(g => g.rounds);
        return overflow ? all.slice(-MAX_QUESTION_COLUMNS) : all;
    }, [raundGroups, showQuestions, overflow]);
    const trimNote = !overflow ? ''
        : (grouped
            ? "Savol ustunlari sig'madi - Raund yig'indisi ko'rsatilmoqda"
            : `Savol ustunlari sig'madi - oxirgi ${MAX_QUESTION_COLUMNS} tasi ko'rsatilmoqda`);

    // Bir Raundning yig'indisi. Hamma savoli bo'sh bo'lsa 0 EMAS, chiziqcha:
    // 0 ball "belgilangan, lekin noto'g'ri" degani, bo'sh esa "hali
    // baholanmagan" - ikkisi boshqa narsa.
    const sumOf = (row, rounds) => {
        const vals = rounds.map(r => row.roundScores?.[r]).filter(v => v != null);
        if (vals.length === 0) return null;
        return Math.round(vals.reduce((a, b) => a + b, 0) * 10) / 10;
    };

    // HECH NARSA KIRITILMAGANMI. Ishtirokchilar bor, ball yo'q bo'lsa
    // jadval bir ustun nol bo'lib chiqardi - go'yo hammaga 0 qo'yilgan.
    // Bunday manzara noto'g'ri, shuning uchun ochiq aytiladi.
    const nothingScored = isScoreGrid && leaderboard.length > 0
        && leaderboard.every(r => Object.values(r.roundScores || {}).every(v => v == null));

    // Avtomatik aylantirish.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return undefined;
        let down = true;
        let paused = false;
        const id = setInterval(() => {
            if (paused) return;
            if (el.scrollHeight <= el.clientHeight + 4) return;
            el.scrollTop += down ? SCROLL_STEP_PX : -SCROLL_STEP_PX;
            const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
            const atTop = el.scrollTop <= 0;
            if ((down && atEnd) || (!down && atTop)) {
                paused = true;
                down = !down;
                setTimeout(() => { paused = false; }, SCROLL_PAUSE_MS);
            }
        }, SCROLL_TICK_MS);
        return () => clearInterval(id);
    }, [leaderboard.length, questionCount, grouped, tick]);

    const nameOf = (row) => row.participant.name || row.participant.fullName || '—';

    // --- Kirish talab qilinadi ------------------------------------------
    if (authLoading) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center">
                Yuklanmoqda...
            </div>
        );
    }

    if (!user) {
        return (
            <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-8">
                <div className="max-w-md text-center space-y-4">
                    <LogIn size={40} className="text-indigo-400 mx-auto" />
                    <h1 className="text-2xl font-black">Jonli ekran uchun tizimga kiring</h1>
                    <p className="text-slate-400 leading-relaxed">
                        Musobaqa natijalari faqat tizimdagi foydalanuvchilarga ochiq.
                        Proyektorni ulagan kompyuterda bir marta kiring &mdash; shundan
                        keyin ekran o&rsquo;zi yangilanib turadi.
                    </p>
                    <Link
                        to="/login"
                        className="inline-block px-6 py-3 rounded-xl bg-indigo-600 font-bold hover:bg-indigo-700"
                    >
                        Kirish
                    </Link>
                </div>
            </div>
        );
    }

    if (!competition) {
        return (
            <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-8">
                <p className="text-slate-400 text-center">
                    {loadError ? `Yuklanmadi: ${loadError}` : 'Musobaqa topilmadi.'}
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white p-6 lg:p-10 flex flex-col">
            {/* SARLAVHA */}
            <div className="flex items-start justify-between gap-6 shrink-0">
                <div className="flex items-center gap-4 min-w-0">
                    <Trophy size={44} className="text-amber-400 shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-3xl lg:text-5xl font-black truncate">{competition.name}</h1>
                        <p className="text-lg lg:text-xl text-slate-400 mt-1">
                            {isScoreGrid
                                ? <>
                                    {stages[currentTur]?.label || `${competition.currentRound || 1}-savol`}
                                    <span className="text-slate-600"> / {competition.roundsCount} savol</span>
                                </>
                                : 'Umumiy reyting'}
                        </p>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <div className="flex items-center justify-end gap-2 text-slate-400">
                        <RefreshCw size={16} className="animate-spin" style={{ animationDuration: '3s' }} />
                        {/* OXIRGI YANGILANGAN VAQT. Ilgari yo'q edi va ekran
                            qotib qolganini bilib bo'lmasdi. */}
                        <span className="text-base tabular-nums">
                            {updatedAt ? updatedAt.toLocaleTimeString('uz-UZ') : '...'}
                        </span>
                    </div>
                    {loadError && (
                        <p className="text-xs text-amber-400 mt-1 flex items-center justify-end gap-1">
                            <AlertTriangle size={12} /> yangilanmadi
                        </p>
                    )}
                </div>
            </div>

            {/* TUR TANLASH */}
            {trimNote && (
                <p className="mt-4 text-sm text-amber-400/80 shrink-0">{trimNote}</p>
            )}
            {stages.length > 1 && (
                <div className="flex flex-wrap gap-2 mt-6 shrink-0">
                    {stages.map((st, i) => (
                        <button
                            key={`${st.label}_${i}`} type="button" onClick={() => setTurIndex(i)}
                            className={`px-4 py-2 rounded-xl text-base font-bold transition-colors ${
                                i === currentTur
                                    ? 'bg-amber-400 text-slate-950'
                                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}
                        >
                            {st.label}
                        </button>
                    ))}
                </div>
            )}

            {competition.resultsHidden ? (
                <div className={`flex-1 mt-6 ${CARD} flex flex-col items-center justify-center text-center gap-4`}>
                    <Lock size={40} className="text-indigo-400" />
                    <p className="text-3xl font-black">Natijalarga o&rsquo;zgartirish kiritilmoqda</p>
                    <p className="text-lg text-slate-400 max-w-lg">
                        Tez orada yangilangan natijalar bilan qaytadan ochiladi.
                    </p>
                </div>
            ) : (
                <div ref={scrollRef} className={`flex-1 mt-6 ${CARD} overflow-auto`}>
                    {isSport && <SportBoard competition={competition} tick={tick} />}
                    {isMatchRating && <MatchRatingBoard competition={competition} tick={tick} />}
                    {isScoreGrid && (nothingScored || leaderboard.length === 0 ? (
                        <p className="p-12 text-center text-slate-500 text-xl">Hali natija kiritilmagan.</p>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="bg-slate-800/80 text-sm lg:text-base font-bold text-slate-400 uppercase sticky top-0">
                                {/* RAUND SARLAVHASI. Bir Turda 2 Raund bo'lsa
                                    savol ustunlari o'z Raundi ostida turadi -
                                    zalda qaysi savol qaysi Raundga tegishli
                                    ekani ko'rinib turishi kerak. */}
                                {grouped && (
                                    <tr>
                                        <th className="p-4 w-16" rowSpan={showQuestions ? 2 : 1}>#</th>
                                        <th className="p-4" rowSpan={showQuestions ? 2 : 1}>Ishtirokchi</th>
                                        <th className="p-4 text-center border-r border-slate-700" rowSpan={showQuestions ? 2 : 1}>Jami</th>
                                        {raundGroups.map((g, gi) => (
                                            <th
                                                key={`g_${gi}`}
                                                colSpan={showQuestions ? g.rounds.length + 1 : 1}
                                                className={`p-2 text-center text-amber-300/90 ${
                                                    gi > 0 ? 'border-l border-slate-700' : ''
                                                }`}
                                            >
                                                {g.label}
                                            </th>
                                        ))}
                                    </tr>
                                )}
                                {showQuestions && (
                                <tr>
                                    {!grouped && <th className="p-4 w-16">#</th>}
                                    {!grouped && <th className="p-4">Ishtirokchi</th>}
                                    {!grouped && <th className="p-4 text-center border-r border-slate-700">Jami</th>}
                                    {(grouped
                                        ? raundGroups.map((g, gi) => (
                                            <React.Fragment key={`h_${gi}`}>
                                                {g.rounds.map((r, ri) => (
                                                    <th
                                                        key={r}
                                                        className={`p-2 text-center w-12 tabular-nums font-normal ${
                                                            gi > 0 && ri === 0 ? 'border-l border-slate-700' : ''
                                                        }`}
                                                    >
                                                        {r}
                                                    </th>
                                                ))}
                                                <th className="p-2 text-center w-16 text-amber-300/90">Ball</th>
                                            </React.Fragment>
                                        ))
                                        : flatColumns.map(r => (
                                            <th key={r} className="p-2 text-center w-12 tabular-nums font-normal">{r}</th>
                                        ))
                                    )}
                                </tr>
                                )}
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {leaderboard.map(row => (
                                    <tr
                                        key={row.participant.id}
                                        className={row.rank === 1 ? 'bg-amber-500/10' : ''}
                                    >
                                        <td className="p-4 font-black text-2xl lg:text-3xl text-slate-300 tabular-nums">
                                            {row.rank}
                                        </td>
                                        <td className="p-4 font-bold text-xl lg:text-2xl">{nameOf(row)}</td>
                                        <td className="p-4 text-center font-black text-3xl lg:text-4xl text-amber-400 tabular-nums border-r border-slate-700">
                                            {row.totalScore}
                                        </td>
                                        {grouped
                                            ? raundGroups.map((g, gi) => {
                                                const sub = sumOf(row, g.rounds);
                                                return (
                                                    <React.Fragment key={`c_${gi}`}>
                                                        {showQuestions && g.rounds.map((r, ri) => {
                                                            const v = row.roundScores?.[r];
                                                            return (
                                                                <td
                                                                    key={r}
                                                                    className={`p-2 text-center text-base lg:text-lg tabular-nums ${
                                                                        v == null ? 'text-slate-700' : 'text-slate-300'
                                                                    } ${gi > 0 && ri === 0 ? 'border-l border-slate-700' : ''}`}
                                                                >
                                                                    {v == null ? '–' : v}
                                                                </td>
                                                            );
                                                        })}
                                                        <td
                                                            className={`p-2 text-center text-xl lg:text-2xl font-black tabular-nums ${
                                                                sub == null ? 'text-slate-700' : 'text-amber-300'
                                                            } ${!showQuestions && gi > 0 ? 'border-l border-slate-700' : ''}`}
                                                        >
                                                            {sub == null ? '–' : sub}
                                                        </td>
                                                    </React.Fragment>
                                                );
                                            })
                                            : flatColumns.map(r => {
                                                const v = row.roundScores?.[r];
                                                return (
                                                    <td
                                                        key={r}
                                                        className={`p-2 text-center text-base lg:text-lg tabular-nums ${
                                                            v == null ? 'text-slate-700' : 'text-slate-300'
                                                        }`}
                                                    >
                                                        {v == null ? '–' : v}
                                                    </td>
                                                );
                                            })
                                        }
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CompetitionLiveScreenPage;
