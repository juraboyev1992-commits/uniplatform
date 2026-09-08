import React, { useMemo } from 'react';
import { Info } from 'lucide-react';
import { SCORING_MODES, TIEBREAK_PRIMARY_LABELS, TIEBREAK_FALLBACK_LABELS } from '../../config/competitionEngines';
import { db } from '../../services/db';

const inputClass = "w-full px-4 py-3 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm";
const labelClass = "block text-xs font-bold text-gray-700 uppercase mb-1.5";

const COURSES = [1, 2, 3, 4];

// Tay-brek tizimi (Liga kesimida) — decides the overall Liga (season) champion when multiple teams end
// tied on total ball. Separate concept from CompetitionAdvancementPanel's own per-boundary tie-break.
const LIGA_TIEBREAK_OPTIONS = [
    { id: 'placement', label: "Yuqori o'rni bo'yicha", description: 'Turlar davomida egallagan yuqori o\'rinlariga qaraladi.' },
    { id: 'extra_question', label: "Qo'shimcha savol", description: "Reyting bali teng kelgan jamoalar o'rtasida qo'shimcha savol beriladi." },
    { id: 'points', label: 'Ochkolari bo\'yicha', description: 'Barcha turlarda jamoalar topgan umumiy savollar soniga qaraladi.' },
    { id: 'question_ranking', label: 'Jami savol reytingi bo\'yicha', description: "Barcha turlarda jamoalar to'plagan umumiy savollar reytingiga qaraladi." }
];
// Tay-brek (Turlar kesimida) — same idea, scoped to ONE Tur. Only 2 of the 4 Liga methods make sense at
// this granularity (confirmed) — "Yuqori o'rni bo'yicha"/"Jami savol reytingi" are inherently cross-Tur.
const TUR_TIEBREAK_OPTIONS = [
    { id: 'extra_question', label: "Qo'shimcha savol", description: "Shu Turda teng kelgan jamoalar o'rtasida qo'shimcha savol beriladi." },
    { id: 'points', label: "Ochkolari bo'yicha", description: "Shu Turda jamoalar topgan umumiy savollar soniga qaraladi." }
];

const Toggle = ({ checked, onChange, label }) => (
    <label className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-gray-100 cursor-pointer">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${checked ? 'bg-indigo-600' : 'bg-gray-300'}`}
        >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        </span>
    </label>
);

// Step 3 — scoring mode, calculation method, places count, roster/transfer rules, and eligibility
// restrictions. Team min/max size lives ONLY in Step 1's RegistrationSettingsFields.jsx (the single
// canonical "Ro'yxatdan o'tish" block, correctly gated to team-type activities only) — a second, ungated
// copy used to live here too (shown even for individual competitions) and has been removed; both wrote
// the same data.teamMinSize/teamMaxSize fields, so nothing about that data is lost.
const ATTENDANCE_GRANULARITY_OPTIONS = [
    { id: 'per_round', label: 'Har raund/tur uchun', description: "Davomat har bir raund/tur yakunida alohida belgilanadi." },
    { id: 'whole_competition', label: 'Butun turnir uchun', description: "Davomat turnir davomida bir marta belgilanadi." }
];

const TournamentRulesStep = ({ data, onChange, showAttendanceGranularity = false, isCorrectAnswer = false, turCount = 1, isQuizMixed = false, isMatchEngine = false, advancementStages = [] }) => {
    const setRestriction = (patch) => onChange({ restrictions: { ...data.restrictions, ...patch } });
    const toggleInList = (key, value) => {
        const list = data.restrictions[key];
        setRestriction({ [key]: list.includes(value) ? list.filter(v => v !== value) : [...list, value] });
    };

    const setAdvancementTopN = (turBoundary, topN) => onChange({
        advancementPlan: { ...data.advancementPlan, [turBoundary]: { ...data.advancementPlan[turBoundary], topN } }
    });
    const advancementBoundaryCount = advancementStages.length - 1;

    // Real faculty list (was a hand-typed 6-entry constant that didn't match the actual student data at
    // all — "Zakovat" review caught this) — derived from db.getMockStudents(), same source
    // CompetitionAdvancementPanel.jsx's own faculty auto-match already trusts.
    const faculties = useMemo(
        () => [...new Set(db.getMockStudents().map(s => s.faculty).filter(Boolean))].sort(),
        []
    );

    const setRankingTurRow = (turIdx, patch) => onChange({
        rankingPerTurTable: { ...data.rankingPerTurTable, [turIdx]: { ...data.rankingPerTurTable?.[turIdx], ...patch } }
    });

    return (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-7">
            <div>
                <h3 className="text-lg font-bold text-gray-900">3. Hisob-kitob va cheklovlar</h3>
                <p className="text-sm text-gray-500">
                    {isMatchEngine
                        ? "Hisoblash usuli, o'rinlar va ishtirok qoidalari — baholash mezonlari 2-qadamda sozlanadi"
                        : "Baholash rejimi, hisoblash usuli va ishtirok qoidalari"}
                </p>
            </div>

            {/* correct_answer (Zakovat/Breyn-ring) presets already lock the scoring engine at Step 1 —
                letting the admin override it here to a whole different family (debate/criteria_based/...)
                doesn't make sense for them, so the selector is hidden entirely for this engine. quiz_mixed
                (25-savol/UniQuiz) gets its own "Bosqichlar va o'tish qoidalari" below instead — same
                reasoning, the preset already fixes the engine, this slot is put to better use for them.
                Munozara/TSUL Court (isMatchEngine) are hidden for the strongest version of that reason:
                their real machinery (uchrashuvlar, notiq slotlari, hakam bayonnomasi) only exists under
                their own engine, so switching away from it here would silently produce a broken
                competition — the rubric itself stays fully editable in Step 2 instead. */}
            {!isCorrectAnswer && !isQuizMixed && !isMatchEngine && (
                <div>
                    <label className={labelClass}>Baholash rejimi (Scoring mode)</label>
                    <p className="text-[11px] text-gray-400 mb-2">
                        Turnir turi tanlanganda avtomatik tavsiya qilinadi — bu yerda kerak bo'lsa o'zgartirishingiz mumkin.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {SCORING_MODES.map(mode => (
                            <button
                                key={mode.id}
                                type="button"
                                disabled={!mode.implemented}
                                title={mode.description}
                                onClick={() => onChange({ scoringMode: mode.id })}
                                className={`px-3 py-2.5 rounded-xl text-xs font-bold border text-center transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                    data.scoringMode === mode.id
                                        ? 'border-indigo-600 bg-indigo-600 text-white'
                                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {mode.label}
                                {!mode.implemented && <span className="block text-[9px] font-semibold opacity-80 mt-0.5">(tez orada)</span>}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {!isCorrectAnswer && !isQuizMixed && (
                <div className="max-w-xs">
                    <label className={labelClass}>Hisoblash usuli</label>
                    {/* Match engines: this is specifically how the SAME notiq's scores from several hakams
                        combine (aggregateNotiqAcrossJudges) — worth spelling out, since "Jami/O'rtacha"
                        alone reads ambiguously when there are both several hakams and several notiqs. */}
                    {isMatchEngine && (
                        <p className="text-[11px] text-gray-400 mb-2">
                            Bir notiqni bir necha hakam baholaganda ularning ballari qanday birlashtirilishi.
                            Odatda "O'rtacha" tanlanadi.
                        </p>
                    )}
                    <select
                        className={inputClass}
                        value={data.calculationMethod}
                        onChange={e => onChange({ calculationMethod: e.target.value })}
                    >
                        <option value="total">Jami Yig'indi Ball</option>
                        <option value="average">O'rtacha Ball (Average)</option>
                    </select>
                </div>
            )}

            {/* Bosqichlar va o'tish qoidalari (quiz_mixed only — 25-savol/UniQuiz) — real: writes into the
                exact same db.setAdvancementRule/advancementTiebreak fields CompetitionAdvancementPanel.jsx
                already reads post-creation (see TournamentCreateWizard.jsx's handleCreate), not a separate
                preview. Only Top N + tie-break are offered here because those are the only advancement
                methods with a real, working engine today — Ball/Foiz/Aralash/Qo'lda thresholds and
                cross-stage score basis don't exist yet, so they're deliberately left out rather than
                shown as if they worked. */}
            {isQuizMixed && (
                <div className="space-y-4">
                    <div>
                        <label className={labelClass}>Bosqichlar va o'tish qoidalari</label>
                        <p className="text-[11px] text-gray-400 mb-2">
                            Har bosqichdan keyingisiga nechta jamoa/kishi o'tishini oldindan belgilang — musobaqa yaratilgach bu "Guruh bosqichlari" panelida aynan shu holda ko'rinadi, xohlasangiz keyin ham o'zgartirishingiz mumkin.
                        </p>
                    </div>

                    {advancementBoundaryCount < 1 ? (
                        <p className="text-xs text-gray-400 p-3 bg-slate-50 rounded-xl border border-gray-100">
                            Bu turnir turi bitta bosqichdan iborat — o'tish qoidasi kerak emas.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {Array.from({ length: advancementBoundaryCount }, (_, i) => i + 1).map(turBoundary => (
                                <div key={turBoundary} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-gray-100">
                                    <span className="flex-1 text-xs font-bold text-gray-600 min-w-0 truncate">
                                        {advancementStages[turBoundary - 1]?.label} &rarr; {advancementStages[turBoundary]?.label}
                                    </span>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[11px] font-semibold text-gray-500">Nechta o'tadi:</span>
                                        {/* "Hamma" — admin ro'yxatdan nechta jamoa/kishi o'tishini hali bilmasa
                                            ham, "keyinchalik nechtaligidan qat'i nazar hammasi o'tsin" deb
                                            belgilashi mumkin. Real qiymat sifatida katta sentinel songa
                                            (handleCreate'da) aylanadi — computeFacultyAdvancement'ning o'zi
                                            "topN puldan katta bo'lsa hamma o'tadi" degan mavjud xatti-harakatidan
                                            foydalanadi, yangi kod yo'li ochilmaydi. */}
                                        <button
                                            type="button"
                                            onClick={() => setAdvancementTopN(turBoundary, 'all')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                                data.advancementPlan[turBoundary]?.topN === 'all' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                            }`}
                                        >
                                            Hamma
                                        </button>
                                        <input
                                            type="number"
                                            min="1"
                                            placeholder="—"
                                            value={typeof data.advancementPlan[turBoundary]?.topN === 'number' ? data.advancementPlan[turBoundary].topN : ''}
                                            onChange={e => setAdvancementTopN(turBoundary, e.target.value === '' ? undefined : Number(e.target.value))}
                                            className="w-16 px-2 py-1.5 border rounded-lg text-center text-sm font-bold"
                                        />
                                    </div>
                                </div>
                            ))}
                            <p className="text-[10px] text-gray-400">Bo'sh qoldirilsa, o'sha bosqich uchun N keyinroq panelda belgilanadi. "Hamma" — ro'yxatdan nechta jamoa/kishi o'tganidan qat'i nazar, barchasi keyingi bosqichga o'tadi.</p>
                        </div>
                    )}

                    {advancementBoundaryCount >= 1 && (
                        <>
                            {/* Ball keyingi bosqichga o'tadimi — hozircha faqat sozlama sifatida saqlanadi
                                (Reyting ball bilan bir xil pattern). "Yo'q" tanlansa ham Natijalar markazi
                                (CompetitionResultsCenter.jsx)ning umumiy ball formulasi hali o'zgarmaydi —
                                bu keyingi, alohida bosqichda haqiqiy ulanadi. */}
                            <div className="p-3 bg-slate-50 rounded-xl border border-gray-100 space-y-2">
                                <label className={labelClass}>Ball keyingi bosqichga o'tadimi?</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[{ v: true, l: 'Ha' }, { v: false, l: "Yo'q" }].map(opt => (
                                        <label
                                            key={String(opt.v)}
                                            className={`px-4 py-2.5 rounded-xl border text-xs font-semibold text-center cursor-pointer transition-all ${
                                                data.advancementBallCarriesOver === opt.v ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                            }`}
                                        >
                                            <input type="radio" className="hidden" checked={data.advancementBallCarriesOver === opt.v} onChange={() => onChange({ advancementBallCarriesOver: opt.v })} />
                                            {opt.l}
                                        </label>
                                    ))}
                                </div>
                                {!data.advancementBallCarriesOver && (
                                    <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-xl">
                                        <Info size={13} className="text-amber-600 shrink-0 mt-0.5" />
                                        <p className="text-[10px] font-semibold text-amber-700">
                                            Bu tanlov hozircha faqat sozlamani saqlaydi — har bosqichni 0'dan boshlash mantig'i keyingi bosqichda ishlab chiqiladi. Hozircha ball har doim keyingisiga o'tib boraveradi.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Yagona, REAL tay-brek qoidasi — Zakovatning "Turlar kesimida" / "Liga
                                kesimida" ikki-alohida-blok andozasi bu yerga ko'chirilganda chalkashtirgan
                                edi: creator ikkita MUSTAQIL qoida borday tuyulardi, aslida esa
                                computeFacultyAdvancement (har chegarada, mas. 1-Tur->2-Tur) VA
                                computeFinalPlacement (yakuniy o'rinlar) IKKALASI HAM bitta xil
                                comp.advancementTiebreak maydonini o'qiydi — shuning uchun bitta qoida,
                                aniq izoh bilan: qayerlarda ishlatilishini ochiq aytadi, ikkita soxta-alohida
                                blok qilib ko'rsatmaydi. */}
                            <div className="p-3 bg-slate-50 rounded-xl border border-gray-100 space-y-3">
                                <div>
                                    <label className={labelClass}>Tay-brek usuli</label>
                                    <p className="text-[11px] text-gray-400 mb-2">
                                        Bitta qoida — HAM bosqichlar orasida (masalan 1-Tur &rarr; 2-Tur o'tishda), HAM musobaqa yakunidagi o'rinlarni aniqlashda teng ball chiqsa shu bilan hal qilinadi.
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {Object.entries(TIEBREAK_PRIMARY_LABELS).map(([k, l]) => (
                                        <label
                                            key={k}
                                            className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                                data.advancementTiebreakMethod === k ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                                            }`}
                                        >
                                            <input type="radio" className="hidden" checked={data.advancementTiebreakMethod === k} onChange={() => onChange({ advancementTiebreakMethod: k })} />
                                            <p className={`text-xs font-bold ${data.advancementTiebreakMethod === k ? 'text-indigo-700' : 'text-gray-700'}`}>{l}</p>
                                        </label>
                                    ))}
                                </div>
                                {data.advancementTiebreakMethod === 'lastN' && (
                                    <label className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                        Oxirgi nechta savol:
                                        <input
                                            type="number"
                                            min="1"
                                            value={data.advancementTiebreakLastN}
                                            onChange={e => onChange({ advancementTiebreakLastN: Number(e.target.value) || 1 })}
                                            className="w-16 px-2 py-1.5 border rounded-lg text-center text-xs"
                                        />
                                    </label>
                                )}

                                <div>
                                    <label className={labelClass}>Yuqoridagi usul bilan ham teng qolsa</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                                        {[
                                            { id: 'split', desc: "Hech kim adolatsiz kesib tashlanmaydi — teng qolganlarning hammasi birga o'tkaziladi. Avtomatik, admin aralashuvi shart emas." },
                                            { id: 'extra_question', desc: "Admin real qo'shimcha savol/playoff o'tkazadi va natijasini qo'lda kiritadi — kiritilmaguncha bosqich yakunlanmaydi." }
                                        ].map(opt => (
                                            <label
                                                key={opt.id}
                                                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                                    data.advancementTiebreakFallback === opt.id ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                                                }`}
                                            >
                                                <input type="radio" className="hidden" checked={data.advancementTiebreakFallback === opt.id} onChange={() => onChange({ advancementTiebreakFallback: opt.id })} />
                                                <p className={`text-xs font-bold ${data.advancementTiebreakFallback === opt.id ? 'text-indigo-700' : 'text-gray-700'}`}>{TIEBREAK_FALLBACK_LABELS[opt.id]}</p>
                                                <p className="text-[10px] text-gray-400 mt-0.5">{opt.desc}</p>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Faqat "Qo'shimcha savol" (asosiy yoki fallback) tanlanganda ko'rinadi —
                                    faqat yakuniy o'rinlar uchun: bosqichlar orasidagi o'tishda "kim o'tadi"
                                    Top N bilan allaqachon hal bo'ladi, "nechta o'ringacha" degan savol faqat
                                    Final'da bir nechta jamoa medal/o'rin uchun teng qolganda ma'noga ega. */}
                                {(data.advancementTiebreakMethod === 'extra_question' || data.advancementTiebreakFallback === 'extra_question') && (
                                    <div className="pt-1 space-y-2">
                                        <label className={labelClass}>Yakuniy o'rinlarda qo'shimcha savol nechta o'ringacha o'ynaladi?</label>
                                        <div className="flex gap-3">
                                            {[1, 2, 3].map(n => (
                                                <label
                                                    key={n}
                                                    className={`flex-1 px-4 py-2.5 rounded-xl border text-xs font-semibold text-center cursor-pointer transition-all ${
                                                        data.finalTiebreakPlacesCount === n ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <input type="radio" className="hidden" checked={data.finalTiebreakPlacesCount === n} onChange={() => onChange({ finalTiebreakPlacesCount: n })} />
                                                    Ilk {n} o'rin
                                                </label>
                                            ))}
                                        </div>
                                        <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-xl">
                                            <Info size={13} className="text-amber-600 shrink-0 mt-0.5" />
                                            <p className="text-[10px] font-semibold text-amber-700">
                                                Bu tanlov hozircha faqat sozlamani saqlaydi — real cheklash keyingi bosqichda ishlab chiqiladi. Bosqichlar orasidagi o'tishda esa tay-brek yuqoridagi "Nechta o'tadi" chegarasi bilan birga real ishlaydi.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* correct_answer (Zakovat) — replaces Hisoblash usuli + Nechta o'rin uchun with a single
                "Ballarni hisoblash formati" choice. Tay-brek (Qo'shimcha savol/Oxirgi N savol/...) is
                deliberately NOT duplicated here — that's the exact same setting CompetitionAdvancementPanel
                already configures post-creation (confirmed: bosqichdan-bosqichga ham, yakuniy o'rinlar
                uchun ham bitta joyda), no need for a second copy at creation time. */}
            {isCorrectAnswer && (
                <div className="space-y-4">
                    <div>
                        <label className={labelClass}>Ballarni hisoblash formati</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                                data.ballFormat === 'points' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                            }`}>
                                <input type="radio" className="hidden" checked={data.ballFormat === 'points'} onChange={() => onChange({ ballFormat: 'points' })} />
                                <p className={`text-sm font-bold ${data.ballFormat === 'points' ? 'text-indigo-700' : 'text-gray-700'}`}>Ochkolar bo'yicha</p>
                                <p className="text-[11px] text-gray-400 mt-1">
                                    To'g'ri javob uchun <b>+{data.pointsPerCorrectAnswer}</b> ball, noto'g'ri uchun <b>{data.penaltyPerWrongAnswer > 0 ? `-${data.penaltyPerWrongAnswer}` : '0'}</b> ball (2-qadamda sozlangan).
                                </p>
                            </label>
                            <label className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                                data.ballFormat === 'ranking' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                            }`}>
                                <input type="radio" className="hidden" checked={data.ballFormat === 'ranking'} onChange={() => onChange({ ballFormat: 'ranking' })} />
                                <p className={`text-sm font-bold ${data.ballFormat === 'ranking' ? 'text-indigo-700' : 'text-gray-700'}`}>Reyting ball</p>
                                <p className="text-[11px] text-gray-400 mt-1">
                                    Har bir tur uchun jamoalar egallagan o'rniga qarab tegishli reyting bali beriladi.
                                </p>
                            </label>
                        </div>
                    </div>

                    {data.ballFormat === 'ranking' && (
                        <div className="p-4 bg-slate-50 rounded-2xl border border-gray-100 space-y-4">
                            <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                                <Info size={15} className="text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-[11px] font-semibold text-amber-700">
                                    Bu rejim hozircha faqat sozlamalarni saqlaydi — real ball hisoblash formulasi keyingi bosqichda ishlab chiqiladi.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <div>
                                    <label className={labelClass}>Maksimal ball</label>
                                    <input type="number" className={inputClass} value={data.rankingMaxBall} onChange={e => onChange({ rankingMaxBall: Number(e.target.value) || 0 })} />
                                </div>
                                <div>
                                    <label className={labelClass}>Minimal ball</label>
                                    <input type="number" className={inputClass} value={data.rankingMinBall} onChange={e => onChange({ rankingMinBall: Number(e.target.value) || 0 })} />
                                </div>
                                <div>
                                    <label className={labelClass}>Navbatchi jamoa reytingi</label>
                                    <input type="number" className={inputClass} value={data.rankingByeBall} onChange={e => onChange({ rankingByeBall: Number(e.target.value) || 0 })} />
                                </div>
                            </div>

                            <div>
                                <label className={labelClass}>Reyting ball qo'llanishi</label>
                                <div className="flex gap-3">
                                    {[{ v: false, l: 'Barcha turlar uchun bir xil' }, { v: true, l: 'Turlar kesimida alohida' }].map(opt => (
                                        <label
                                            key={String(opt.v)}
                                            className={`flex-1 px-4 py-2.5 rounded-xl border text-xs font-semibold text-center cursor-pointer transition-all ${
                                                data.rankingPerTur === opt.v ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                            }`}
                                        >
                                            <input type="radio" className="hidden" checked={data.rankingPerTur === opt.v} onChange={() => onChange({ rankingPerTur: opt.v })} />
                                            {opt.l}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {data.rankingPerTur && (
                                <div className="border rounded-xl overflow-hidden">
                                    <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-white text-gray-400 uppercase text-[10px]">
                                            <tr>
                                                <th className="p-2 text-left">Tur</th>
                                                <th className="p-2 text-left">Maksimal ball</th>
                                                <th className="p-2 text-left">Minimal ball</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y bg-white">
                                            {Array.from({ length: turCount }, (_, i) => i + 1).map(turIdx => {
                                                const row = data.rankingPerTurTable?.[turIdx] || {};
                                                return (
                                                    <tr key={turIdx}>
                                                        <td className="p-2 font-bold text-gray-600">{turIdx}-Tur</td>
                                                        <td className="p-2">
                                                            <input
                                                                type="number"
                                                                value={row.maxBall ?? data.rankingMaxBall}
                                                                onChange={e => setRankingTurRow(turIdx, { maxBall: Number(e.target.value) || 0 })}
                                                                className="w-20 px-2 py-1 border rounded-lg text-center"
                                                            />
                                                        </td>
                                                        <td className="p-2">
                                                            <input
                                                                type="number"
                                                                value={row.minBall ?? data.rankingMinBall}
                                                                onChange={e => setRankingTurRow(turIdx, { minBall: Number(e.target.value) || 0 })}
                                                                className="w-20 px-2 py-1 border rounded-lg text-center"
                                                            />
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Turlar kesimida — applies whenever there's more than one Tur at all (Kubok's own
                        multi-Tur Breyn-ring shape included), not just Liga. */}
                    <div>
                        <label className={labelClass}>Tay-brek (Turlar kesimida)</label>
                        <p className="text-[11px] text-gray-400 mb-2">
                            Bitta Turning o'zida ikkita jamoa teng ball olsa, o'sha Tur ichida kim yuqori turishi qanday hal qilinadi?
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {TUR_TIEBREAK_OPTIONS.map(opt => (
                                <label
                                    key={opt.id}
                                    title={opt.description}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                        data.turTiebreakMethod === opt.id ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    <input type="radio" className="hidden" checked={data.turTiebreakMethod === opt.id} onChange={() => onChange({ turTiebreakMethod: opt.id })} />
                                    <p className={`text-xs font-bold ${data.turTiebreakMethod === opt.id ? 'text-indigo-700' : 'text-gray-700'}`}>{opt.label}</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">{opt.description}</p>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Liga (mavsumiy) only — Kubok (bir martalik) has no "season" to tie-break across. */}
                    {data.format !== 'cup' && (
                        <div>
                            <label className={labelClass}>Tay-brek tizimi (Liga kesimida)</label>
                            <p className="text-[11px] text-gray-400 mb-2">
                                Liga yakunida bir nechta jamoada ballar teng kelib qolsa, g'olib qanday aniqlanadi?
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {LIGA_TIEBREAK_OPTIONS.map(opt => (
                                    <label
                                        key={opt.id}
                                        title={opt.description}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                            data.ligaTiebreakMethod === opt.id ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                                        }`}
                                    >
                                        <input type="radio" className="hidden" checked={data.ligaTiebreakMethod === opt.id} onChange={() => onChange({ ligaTiebreakMethod: opt.id })} />
                                        <p className={`text-xs font-bold ${data.ligaTiebreakMethod === opt.id ? 'text-indigo-700' : 'text-gray-700'}`}>{opt.label}</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5">{opt.description}</p>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {showAttendanceGranularity && (
                <div>
                    <label className={labelClass}>Davomat granulligi</label>
                    <p className="text-[11px] text-gray-400 mb-2">
                        Jamoaga umumiy ball qo'yilgani ishtirokni tasdiqlamaydi — a'zolarning aynan qaysi
                        bosqichda hozir bo'lganini alohida belgilash uchun. Turnir davomida real sana
                        jadvali kiritilgach, "Har kun uchun" varianti ham qo'shiladi (Jadval bo'limi).
                    </p>
                    <div className="grid grid-cols-2 gap-2 max-w-md">
                        {ATTENDANCE_GRANULARITY_OPTIONS.map(opt => (
                            <button
                                key={opt.id}
                                type="button"
                                title={opt.description}
                                onClick={() => onChange({ attendanceGranularity: opt.id })}
                                className={`px-3 py-2.5 rounded-xl text-xs font-bold border text-center transition-all ${
                                    data.attendanceGranularity === opt.id
                                        ? 'border-indigo-600 bg-indigo-600 text-white'
                                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* quiz_mixed gets its own, scoped "Qo'shimcha savol nechta o'ringacha o'ynaladi?" above
                (only when extra_question is actually the active tiebreak) instead of this generic,
                always-on placesCount picker — showing both was a literal duplicate once extra_question
                was selected. */}
            {!isCorrectAnswer && !isQuizMixed && (
                <div>
                    <label className={labelClass}>Nechta o'rin uchun?</label>
                    <div className="flex gap-3">
                        {[1, 2, 3].map(n => (
                            <label
                                key={n}
                                className={`flex-1 px-4 py-3 rounded-2xl border text-sm font-semibold text-center cursor-pointer transition-all ${
                                    data.placesCount === n ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                }`}
                            >
                                <input type="radio" className="hidden" checked={data.placesCount === n} onChange={() => onChange({ placesCount: n })} />
                                Ilk {n} o'rin
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {/* Jamoa-only — Yakka turdagi musobaqalarda jamoa a'zoligi/tarkibi degan tushunchaning o'zi
                yo'q, shuning uchun bu butun blok ma'nosiz bo'lardi. */}
            {data.type === 'team' && (
                <>
                    <div className="space-y-2.5">
                        <label className={labelClass}>Muhim qoidalar</label>
                        <Toggle
                            label="Turnir davomida yangi jamoalar qo'shilishiga ruxsat"
                            checked={data.allowNewTeamsDuringTournament}
                            onChange={v => onChange({ allowNewTeamsDuringTournament: v })}
                        />
                        <Toggle
                            label="Turnir davomida tarkibni o'zgartirishga ruxsat"
                            checked={data.allowRosterChangesDuringTournament}
                            onChange={v => onChange({ allowRosterChangesDuringTournament: v })}
                        />
                        <Toggle
                            label="Talaba jamoani mustaqil tark eta oladi"
                            checked={data.allowStudentSelfLeaveTeam}
                            onChange={v => onChange({ allowStudentSelfLeaveTeam: v })}
                        />
                        <div className="p-3 bg-slate-50 rounded-xl border border-gray-100 flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-gray-700">Bir talaba uchun maksimal transferlar soni</span>
                            <input
                                type="number"
                                min="0"
                                className="w-20 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                                value={data.maxTransfersPerStudent}
                                onChange={e => onChange({ maxTransfersPerStudent: Number(e.target.value) })}
                            />
                        </div>
                    </div>

                    <div className="flex items-start gap-2.5 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                        <Info size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                        <p className="text-xs font-semibold text-indigo-700">
                            Bir talaba ushbu turnir doirasida faqat bitta aktiv jamoada bo'lishi mumkin.
                        </p>
                    </div>
                </>
            )}

            <div className="space-y-3">
                <label className={labelClass}>Cheklovlar</label>
                <p className="text-[11px] text-gray-400 -mt-2">Kim ro'yxatdan o'ta olishini belgilaydi. Ro'yxatdan o'tganlar keyin QANDAY saralanishi — Aralash viktorinada 2-qadamdagi "Saralash guruhlari".</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1.5">Kurs bo'yicha</p>
                        <div className="flex flex-wrap gap-1.5">
                            {COURSES.map(c => (
                                <button
                                    type="button"
                                    key={c}
                                    onClick={() => toggleInList('byCourse', c)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                                        data.restrictions.byCourse.includes(c) ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-200 text-gray-600'
                                    }`}
                                >
                                    {c}-kurs
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1.5">Jins bo'yicha</p>
                        <select className={inputClass} value={data.restrictions.byGender} onChange={e => setRestriction({ byGender: e.target.value })}>
                            <option value="">Cheklovsiz</option>
                            <option value="male">Faqat erkaklar</option>
                            <option value="female">Faqat ayollar</option>
                        </select>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1.5">Professionallik bo'yicha</p>
                        <select className={inputClass} value={data.restrictions.byProfessionalism} onChange={e => setRestriction({ byProfessionalism: e.target.value })}>
                            <option value="">Cheklovsiz</option>
                            <option value="amateur">Faqat havaskorlar</option>
                            <option value="professional">Faqat professionallar</option>
                        </select>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1.5">Fakultet bo'yicha</p>
                        <div className="flex flex-wrap gap-1.5">
                            {faculties.map(f => (
                                <button
                                    type="button"
                                    key={f}
                                    onClick={() => toggleInList('byFaculty', f)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                                        data.restrictions.byFaculty.includes(f) ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-200 text-gray-600'
                                    }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">Boshqa cheklov</p>
                    <textarea
                        className={inputClass}
                        rows={2}
                        placeholder="Qo'shimcha cheklovlarni kiriting..."
                        value={data.restrictions.other}
                        onChange={e => setRestriction({ other: e.target.value })}
                    />
                </div>
            </div>
        </div>
    );
};

export default TournamentRulesStep;
