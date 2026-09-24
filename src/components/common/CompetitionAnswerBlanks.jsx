import React, { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import Button from './Button';
import { db } from '../../services/db';
import { getDisplayStages, isMatchBasedEngine } from '../../config/competitionEngines';

// JAVOB BLANKALARI - jamoalar yozib beradigan kichik varaqchalar.
//
// Bu hakam varaqasidan BOSHQA narsa: hakam bitta katta varaqada hammani
// baholaydi, jamoa esa har bir birlikka alohida varaqcha yozib hakamga
// topshiradi. Varaqchalar A4 ga bir nechtadan joylashtiriladi va qirqiladi.
//
// BIRLIK DVIGATELGA QARAB O'ZGARADI. Blank savolga emas, JAMOAGA kerak -
// shuning uchun u hamma musobaqada bor, faqat nima bo'yicha tuzilishi
// har xil:
//
//   savol      - Zakovat, aralash viktorina. Har savolga bitta varaqcha.
//   uchrashuv  - Sport, Munozara (match), TSUL Court. Har uchrashuvda
//                ikkala tomonga bittadan varaqcha.
//   raund      - mezon asosida, yagona ball. Har raundga bitta varaqcha.
//   qo'lda     - yuqoridagilarning hech biri aniqlanmasa: nechta kerakligini
//                foydalanuvchi o'zi aytadi. Taxmin qilib, noto'g'ri sondagi
//                varaqcha chiqargandan ko'ra so'ragan yaxshi.
//
// SAVOLLAR ARIFMETIKASI BU YERDA QAYTA YOZILMAYDI: Tur chegaralari
// `getDisplayStages` dan olinadi - natijalar va "Natija kiritish" tablari
// ham o'qiydigan yagona manba. Ikki joyda ikki xil hisoblansa, blankadagi
// savol raqami natijalar jadvalidagidan farq qilib qolardi.

const FORMATS = [
    { id: '2x6', cols: 2, rows: 6, label: 'A4 — 12 ta blank (2×6)' },
    { id: '2x5', cols: 2, rows: 5, label: 'A4 — 10 ta blank (2×5)' },
    { id: '2x4', cols: 2, rows: 4, label: 'A4 — 8 ta blank (2×4)' },
    { id: '1x4', cols: 1, rows: 4, label: 'A4 — 4 ta blank (1×4, katta)' },
];

// A4 balandligi 297mm, chetlari 14mm -> ~262mm foydali joy.
const USABLE_MM = 262;
const QUESTION_ENGINES = ['correct_answer', 'quiz_mixed'];

const CompetitionAnswerBlanks = ({ competition }) => {
    const perRaund = competition?.questionsPerRound || 12;
    const totalQuestions = Number(competition?.roundsCount) || 0;
    const isTeam = competition?.type === 'team';
    const participants = competition?.participants || [];
    const method = competition?.scoringMethod;

    const matches = useMemo(() => {
        if (!isMatchBasedEngine(method)) return [];
        try { return db.getCompetitionMatches(competition.id) || []; } catch { return []; }
    }, [competition?.id, method]);

    // Qaysi birlik bo'yicha tuziladi.
    const unit = useMemo(() => {
        if (QUESTION_ENGINES.includes(method) && totalQuestions > 0) return 'question';
        if (isMatchBasedEngine(method)) return matches.length > 0 ? 'match' : 'manual';
        if (totalQuestions > 1) return 'round';
        return 'manual';
    }, [method, totalQuestions, matches.length]);

    const stages = useMemo(() => {
        const s = getDisplayStages(competition);
        if (s && s.length) return s;
        return totalQuestions > 0
            ? [{ label: 'Butun musobaqa', roundRange: [1, totalQuestions] }]
            : [];
    }, [competition, totalQuestions]);

    const usesTurs = (unit === 'question' || unit === 'round') && stages.length > 0;

    const [selectedTurs, setSelectedTurs] = useState(() => new Set([0]));
    const [format, setFormat] = useState('2x6');
    const [order, setOrder] = useState('unit'); // unit | team
    const [teamFilter, setTeamFilter] = useState('');
    const [manualCount, setManualCount] = useState(1);

    const fmt = FORMATS.find(f => f.id === format) || FORMATS[0];
    const perPage = fmt.cols * fmt.rows;

    const teams = useMemo(
        () => (teamFilter ? participants.filter(p => p.id === teamFilter) : participants),
        [participants, teamFilter]
    );

    const nameOf = useMemo(() => {
        const m = new Map(participants.map(p => [p.id, isTeam ? p.name : p.fullName]));
        return (id) => m.get(id) || '';
    }, [participants, isTeam]);

    // Birliklar ro'yxati - har biri bitta varaqchaning "sarlavhasi".
    const units = useMemo(() => {
        if (unit === 'question') {
            const out = [];
            stages.forEach((st, i) => {
                if (!selectedTurs.has(i)) return;
                const [from, to] = st.roundRange;
                for (let q = from; q <= Math.min(to, totalQuestions); q += 1) {
                    const raund = Math.ceil(q / perRaund);
                    out.push({
                        key: `q${q}`,
                        turIndex: i + 1,
                        right: `R:${raund} S:${q - (raund - 1) * perRaund}`,
                    });
                }
            });
            return out;
        }

        if (unit === 'round') {
            const out = [];
            stages.forEach((st, i) => {
                if (!selectedTurs.has(i)) return;
                const [from, to] = st.roundRange;
                for (let r = from; r <= Math.min(to, totalQuestions); r += 1) {
                    out.push({ key: `r${r}`, turIndex: i + 1, right: `Raund: ${r}` });
                }
            });
            return out;
        }

        if (unit === 'manual') {
            const n = Math.max(1, Math.min(60, Number(manualCount) || 1));
            return Array.from({ length: n }, (_, i) => ({
                key: `m${i}`, turIndex: null, right: `${i + 1}`,
            }));
        }

        return [];
    }, [unit, stages, selectedTurs, totalQuestions, perRaund, manualCount]);

    // Uchrashuvli dvigatellarda varaqcha JAMOAGA emas, UCHRASHUVDAGI
    // TOMONGA tegishli - shuning uchun u alohida quriladi.
    const slips = useMemo(() => {
        if (unit === 'match') {
            const allowed = teamFilter ? new Set([teamFilter]) : null;
            const out = [];
            matches.forEach((m, mi) => {
                const label = m.roundLabel || m.stage || m.groupName || `${mi + 1}-uchrashuv`;
                [m.teamAId, m.teamBId].filter(Boolean).forEach(tid => {
                    if (allowed && !allowed.has(tid)) return;
                    const other = tid === m.teamAId ? m.teamBId : m.teamAId;
                    out.push({
                        key: `${m.id}-${tid}`,
                        teamName: nameOf(tid),
                        teamNo: participants.findIndex(p => p.id === tid) + 1,
                        turLabel: label,
                        right: other ? `vs ${nameOf(other) || '—'}` : '—',
                    });
                });
            });
            return out;
        }

        const out = [];
        if (order === 'unit') {
            units.forEach(u => teams.forEach((t, ti) => out.push({
                key: `${u.key}-${t.id}`,
                teamName: isTeam ? t.name : t.fullName,
                teamNo: ti + 1,
                turLabel: u.turIndex ? `Tur: ${u.turIndex}` : '',
                right: u.right,
            })));
        } else {
            teams.forEach((t, ti) => units.forEach(u => out.push({
                key: `${t.id}-${u.key}`,
                teamName: isTeam ? t.name : t.fullName,
                teamNo: ti + 1,
                turLabel: u.turIndex ? `Tur: ${u.turIndex}` : '',
                right: u.right,
            })));
        }
        return out;
    }, [unit, units, teams, order, isTeam, matches, teamFilter, nameOf, participants]);

    const pages = useMemo(() => {
        const out = [];
        for (let i = 0; i < slips.length; i += perPage) out.push(slips.slice(i, i + perPage));
        return out;
    }, [slips, perPage]);

    const toggleTur = (i) => setSelectedTurs(prev => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i); else next.add(i);
        return next;
    });

    const allSelected = stages.length > 0 && selectedTurs.size === stages.length;
    const toggleAll = () => setSelectedTurs(
        allSelected ? new Set() : new Set(stages.map((_, i) => i))
    );

    const print = () => {
        document.body.classList.add('blank-printing');
        const done = () => {
            document.body.classList.remove('blank-printing');
            window.removeEventListener('afterprint', done);
        };
        window.addEventListener('afterprint', done);
        window.print();
        setTimeout(done, 1000);
    };

    const slipHeight = `${Math.floor(USABLE_MM / fmt.rows)}mm`;

    const UNIT_NOTE = {
        question: 'Har savolga bitta varaqcha.',
        match: 'Har uchrashuvda ikkala tomonga bittadan varaqcha.',
        round: 'Har raundga bitta varaqcha.',
        manual: 'Bu musobaqada savol yoki uchrashuv aniqlanmadi — nechta kerakligini o‘zingiz belgilang.',
    }[unit];

    return (
        <div className="flex flex-col lg:flex-row gap-4">
            {/* SOZLAMALAR */}
            <div className="no-print lg:w-72 shrink-0 space-y-3">
                <p className="text-[11px] text-gray-500 leading-relaxed px-1">{UNIT_NOTE}</p>

                {usesTurs && (
                    <div className="p-3 border border-gray-200 rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Turlar</span>
                            <button
                                type="button" onClick={toggleAll}
                                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                            >
                                {allSelected ? 'Bekor qilish' : 'Hammasini tanlash'}
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {stages.map((st, i) => (
                                <button
                                    key={st.label + i} type="button" onClick={() => toggleTur(i)}
                                    title={st.label}
                                    className={`w-9 h-9 rounded-lg text-xs font-bold transition-colors ${
                                        selectedTurs.has(i)
                                            ? 'bg-gray-900 text-white'
                                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                    }`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {unit === 'manual' && (
                    <label className="block p-3 border border-gray-200 rounded-xl">
                        <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">
                            Har {isTeam ? 'jamoaga' : 'ishtirokchiga'} nechta blank
                        </span>
                        <input
                            type="number" min="1" max="60" value={manualCount}
                            onChange={e => setManualCount(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs"
                        />
                    </label>
                )}

                <label className="block p-3 border border-gray-200 rounded-xl">
                    <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">
                        Sahifa formati
                    </span>
                    <select
                        value={format} onChange={e => setFormat(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white"
                    >
                        {FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                </label>

                {unit !== 'match' && (
                    <div className="p-3 border border-gray-200 rounded-xl">
                        <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">
                            Tartib
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { id: 'unit', label: unit === 'question' ? 'Savol bo‘yicha' : 'Raund bo‘yicha' },
                                { id: 'team', label: isTeam ? 'Jamoa bo‘yicha' : 'Ishtirokchi bo‘yicha' },
                            ].map(o => (
                                <button
                                    key={o.id} type="button" onClick={() => setOrder(o.id)}
                                    className={`px-2 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                                        order === o.id
                                            ? 'bg-gray-900 text-white'
                                            : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                                    }`}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
                            {order === 'unit'
                                ? 'Bitta birlikning hamma jamoadagi varaqchasi ketma-ket — hakam birga yig‘adi.'
                                : 'Har jamoaning o‘z dastasi — boshida tarqatib chiqiladi.'}
                        </p>
                    </div>
                )}

                <label className="block p-3 border border-gray-200 rounded-xl">
                    <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">
                        {isTeam ? 'Jamoalar' : 'Ishtirokchilar'}
                    </span>
                    <select
                        value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white"
                    >
                        <option value="">Barchasi ({participants.length})</option>
                        {participants.map(p => (
                            <option key={p.id} value={p.id}>{isTeam ? p.name : p.fullName}</option>
                        ))}
                    </select>
                </label>

                {/* HISOB. Chop etishdan oldin nechta varaq chiqishini
                    ko'rsatish shart - 10 sahifa kutilgan joyda 120 chiqsa,
                    buni printerdan emas, shu yerdan bilish kerak. */}
                <dl className="p-3 border border-gray-200 rounded-xl text-[11px] space-y-1">
                    {[
                        [isTeam ? 'Jamoalar' : 'Ishtirokchilar', participants.length],
                        ...(usesTurs ? [['Tanlangan turlar', selectedTurs.size]] : []),
                        ...(unit === 'match' ? [['Uchrashuvlar', matches.length]] : [['Birliklar', units.length]]),
                        ['Jami blanklar', slips.length],
                        ['Sahifalar', pages.length],
                    ].map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between gap-3">
                            <dt className="text-gray-500">{k}:</dt>
                            <dd className="font-bold text-gray-900 tabular-nums">{v}</dd>
                        </div>
                    ))}
                </dl>

                <Button
                    variant="primary" className="w-full" icon={Printer}
                    onClick={print} disabled={pages.length === 0}
                >
                    Chop etish ({pages.length} sahifa)
                </Button>
            </div>

            {/* KO'RIB CHIQISH VA CHOP ETILADIGAN QISM */}
            <div className="flex-1 min-w-0">
                <div className="no-print flex items-center justify-between mb-2 text-[11px] text-gray-400">
                    <span>Ko&rsquo;rib chiqish ({slips.length} ta blank)</span>
                    <span>{pages.length} sahifa</span>
                </div>

                {pages.length === 0 ? (
                    <p className="text-xs text-gray-500 p-4 border border-dashed border-gray-200 rounded-xl">
                        {participants.length === 0
                            ? 'Musobaqada ishtirokchi yo‘q — avval ular ro‘yxatdan o‘tishi kerak.'
                            : usesTurs ? 'Kamida bitta Tur tanlang.' : 'Blank tuzilmadi.'}
                    </p>
                ) : (
                    <div className="blank-print-area space-y-4">
                        {pages.map((page, pi) => (
                            <div
                                key={`p-${pi}`}
                                className="blank-sheet bg-white border border-gray-200 rounded-xl p-3"
                            >
                                <div
                                    className="grid gap-2"
                                    style={{ gridTemplateColumns: `repeat(${fmt.cols}, minmax(0, 1fr))` }}
                                >
                                    {page.map(s => (
                                        <div
                                            key={s.key}
                                            className="border border-gray-800 flex flex-col"
                                            style={{ height: slipHeight }}
                                        >
                                            <div className="flex items-stretch border-b border-gray-800 text-[10px]">
                                                <div className="px-1.5 py-1 border-r border-gray-800 text-center min-w-[42px]">
                                                    <span className="block text-[8px] text-gray-500 leading-none">
                                                        {isTeam ? 'Jamoa No' : 'No'}
                                                    </span>
                                                    <span className="block font-bold text-sm leading-tight">
                                                        {s.teamNo || '—'}
                                                    </span>
                                                </div>
                                                <div className="flex-1 px-2 py-1 text-center min-w-0">
                                                    <span className="block font-bold text-xs truncate">{s.teamName}</span>
                                                    {isTeam && (
                                                        <span className="block text-[8px] text-gray-500 leading-none">
                                                            jamoasi
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="px-1.5 py-1 border-l border-gray-800 text-right min-w-[46px] max-w-[92px]">
                                                    {s.turLabel && (
                                                        <span className="block text-[8px] text-gray-500 leading-none truncate">
                                                            {s.turLabel}
                                                        </span>
                                                    )}
                                                    <span className="block text-[9px] font-bold leading-tight truncate">
                                                        {s.right}
                                                    </span>
                                                </div>
                                            </div>
                                            {/* Yoziladigan bo'sh joy */}
                                            <div className="flex-1" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CompetitionAnswerBlanks;
