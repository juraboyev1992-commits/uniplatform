import React, { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import Button from './Button';
import { getDisplayStages } from '../../config/competitionEngines';

// JAVOB BLANKALARI - jamoalar javobni yozib beradigan kichik varaqchalar.
//
// Bu hakam varaqasidan BOSHQA narsa: hakam bitta katta varaqada hammani
// baholaydi, jamoa esa HAR BIR SAVOLGA alohida varaqcha yozadi va uni
// hakamga topshiradi. Shuning uchun varaqchalar soni jamoalar x savollar
// ga teng bo'ladi va ular A4 ga bir nechtadan joylashtirilib, keyin
// qirqiladi.
//
// SAVOLLAR MODELI (viktorina dvigatellari uchun):
//   `roundsCount`      - jami SAVOLLAR soni (har "xom raund" = bitta savol)
//   `questionsPerRound`- bitta Raunddagi savollar soni (sukut bo'yicha 12)
//   Tur                - Raundlar guruhi, chegaralari `getDisplayStages` dan
//
// Bu arifmetika BU YERDA qayta yozilmaydi: `getDisplayStages` - natijalar
// va "Natija kiritish" tablari ham o'qiydigan yagona manba. Ikki joyda
// ikki xil hisoblansa, blankadagi savol raqami natijalar jadvalidagidan
// farq qilib qolardi.

const FORMATS = [
    { id: '2x6', cols: 2, rows: 6, label: 'A4 — 12 ta blank (2×6)' },
    { id: '2x5', cols: 2, rows: 5, label: 'A4 — 10 ta blank (2×5)' },
    { id: '2x4', cols: 2, rows: 4, label: 'A4 — 8 ta blank (2×4)' },
    { id: '1x4', cols: 1, rows: 4, label: 'A4 — 4 ta blank (1×4, katta)' },
];

// A4 balandligi 297mm, chetlari 14mm -> ~265mm foydali joy.
const USABLE_MM = 262;

const CompetitionAnswerBlanks = ({ competition }) => {
    const perRaund = competition?.questionsPerRound || 12;
    const totalQuestions = Number(competition?.roundsCount) || 0;
    const isTeam = competition?.type === 'team';
    const participants = competition?.participants || [];

    // Turlar. Bo'lmasa - butun musobaqa bitta Tur deb olinadi, aks holda
    // Tur tanlagich bo'sh chiqib, hech narsa chop etilmasdi.
    const stages = useMemo(() => {
        const s = getDisplayStages(competition);
        if (s && s.length) return s;
        return totalQuestions > 0
            ? [{ label: 'Butun musobaqa', roundRange: [1, totalQuestions] }]
            : [];
    }, [competition, totalQuestions]);

    const [selectedTurs, setSelectedTurs] = useState(() => new Set([0]));
    const [format, setFormat] = useState('2x6');
    const [order, setOrder] = useState('question'); // question | team
    const [teamFilter, setTeamFilter] = useState('');

    const fmt = FORMATS.find(f => f.id === format) || FORMATS[0];
    const perPage = fmt.cols * fmt.rows;

    const teams = useMemo(
        () => (teamFilter ? participants.filter(p => p.id === teamFilter) : participants),
        [participants, teamFilter]
    );

    // Tanlangan Turlardagi savollar ro'yxati.
    const questions = useMemo(() => {
        const out = [];
        stages.forEach((st, i) => {
            if (!selectedTurs.has(i)) return;
            const [from, to] = st.roundRange;
            for (let q = from; q <= Math.min(to, totalQuestions); q += 1) {
                out.push({
                    q,
                    turLabel: st.label,
                    turIndex: i + 1,
                    raund: Math.ceil(q / perRaund),
                    savol: q - (Math.ceil(q / perRaund) - 1) * perRaund,
                });
            }
        });
        return out;
    }, [stages, selectedTurs, totalQuestions, perRaund]);

    // Varaqchalar tartibi. "Savol bo'yicha" - hakam bitta savolni hamma
    // jamoadan birdaniga yig'adi; "Jamoa bo'yicha" - har jamoaga o'z
    // dastasi beriladi. Ikkalasi ham amalda ishlatiladi, shuning uchun
    // tanlov bor.
    const slips = useMemo(() => {
        const out = [];
        if (order === 'question') {
            questions.forEach(qq => teams.forEach((t, ti) => out.push({ ...qq, team: t, teamNo: ti + 1 })));
        } else {
            teams.forEach((t, ti) => questions.forEach(qq => out.push({ ...qq, team: t, teamNo: ti + 1 })));
        }
        return out;
    }, [questions, teams, order]);

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

    if (totalQuestions === 0) {
        return (
            <p className="text-xs text-gray-500 p-4 border border-dashed border-gray-200 rounded-xl">
                Bu musobaqada savollar soni belgilanmagan &mdash; javob blankasi
                savollar soniga qarab tuziladi. Musobaqa sozlamalarida raund va
                savollar sonini kiriting.
            </p>
        );
    }

    const slipHeight = `${Math.floor(USABLE_MM / fmt.rows)}mm`;

    return (
        <div className="flex flex-col lg:flex-row gap-4">
            {/* SOZLAMALAR */}
            <div className="no-print lg:w-72 shrink-0 space-y-3">
                <div className="p-3 border border-gray-200 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Turlar</span>
                        <button
                            type="button" onClick={toggleAll}
                            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                            {allSelected ? 'Tanlovni bekor qilish' : 'Hammasini tanlash'}
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

                <div className="p-3 border border-gray-200 rounded-xl">
                    <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">
                        Tartib
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { id: 'question', label: 'Savol bo‘yicha' },
                            { id: 'team', label: 'Jamoa bo‘yicha' },
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
                        {order === 'question'
                            ? 'Bitta savolning hamma jamoadagi varaqchasi ketma-ket — hakam savol bo‘yicha yig‘adi.'
                            : 'Har jamoaning o‘z dastasi — boshida tarqatib chiqiladi.'}
                    </p>
                </div>

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
                        ['Tanlangan turlar', selectedTurs.size],
                        ['Tanlanganlari', teams.length],
                        ['Savollar', questions.length],
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
                        Kamida bitta Tur tanlang.
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
                                    {page.map((s, si) => (
                                        <div
                                            key={`s-${pi}-${si}`}
                                            className="border border-gray-800 flex flex-col"
                                            style={{ height: slipHeight }}
                                        >
                                            <div className="flex items-stretch border-b border-gray-800 text-[10px]">
                                                <div className="px-1.5 py-1 border-r border-gray-800 text-center min-w-[42px]">
                                                    <span className="block text-[8px] text-gray-500 leading-none">
                                                        {isTeam ? 'Jamoa No' : 'No'}
                                                    </span>
                                                    <span className="block font-bold text-sm leading-tight">{s.teamNo}</span>
                                                </div>
                                                <div className="flex-1 px-2 py-1 text-center min-w-0">
                                                    <span className="block font-bold text-xs truncate">
                                                        {isTeam ? s.team.name : s.team.fullName}
                                                    </span>
                                                    {isTeam && (
                                                        <span className="block text-[8px] text-gray-500 leading-none">
                                                            jamoasi
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="px-1.5 py-1 border-l border-gray-800 text-right min-w-[46px]">
                                                    <span className="block text-[8px] text-gray-500 leading-none">
                                                        Tur: <b className="text-gray-800">{s.turIndex}</b>
                                                    </span>
                                                    <span className="block text-[9px] font-bold leading-tight">
                                                        R:{s.raund} S:{s.savol}
                                                    </span>
                                                </div>
                                            </div>
                                            {/* Javob yoziladigan bo'sh joy */}
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
