import React, { useMemo, useRef, useState } from 'react';
import { Printer, FileText, ClipboardCheck, Gavel } from 'lucide-react';
import Button from './Button';
import {
    getCourtMatchCriteria,
    DEBATE_MATCH_CRITERIA,
} from '../../config/competitionEngines';

// BLANKALAR - qog'ozda to'ldiriladigan varaqalar.
//
// NEGA KERAK: musobaqa zalida internet uzilishi, planshet o'chishi yoki hakam
// ekranga emas, qog'ozga yozishni afzal ko'rishi mumkin. Shunday holatda ish
// to'xtab qolmasligi kerak - hakam qog'ozga yozadi, natija keyin tizimga
// kiritiladi.
//
// MUHIM: blanka BO'SH chiqadi, lekin MUSOBAQANING O'ZIDAN quriladi - nomi,
// sanasi, ishtirokchilari va MEZONLARI shu musobaqanikidir. Umumiy, har
// qanday musobaqaga yaraydigan varaqa foydasiz: hakam mezonlarni qo'lda
// yozib o'tirishi kerak bo'lardi va har biri boshqacha yozardi.

// Mezonlar dvigatelga qarab boshqa-boshqa joyda saqlanadi. Bitta joydan
// o'qiymiz, aks holda blankadagi mezonlar baholash oynasidagidan farq qilib
// qolardi - va aynan shu farq nizoga sabab bo'lardi.
const resolveCriteria = (competition) => {
    const method = competition?.scoringMethod;

    if (method === 'court_match') {
        return getCourtMatchCriteria(competition)
            .filter(c => c.kind !== 'note')
            .map(c => ({ name: c.name, max: c.max }));
    }

    if (method === 'debate_match') {
        // Faqat ball qo'yiladigan qatorlar; ichki (parent) qatorlar
        // qog'ozda alohida ustun bo'lib ketmasin.
        return DEBATE_MATCH_CRITERIA
            .filter(c => c.kind === 'score' && !c.parent)
            .map(c => ({ name: c.name, max: c.max }));
    }

    // Munozara va "mezon asosida" - ikkalasi ham `criteria` da saqlanadi.
    if (competition?.criteria?.length) {
        return competition.criteria.map(c => ({
            name: c.name,
            max: c.maxScore ?? c.max ?? null,
        }));
    }

    return [];
};

// Mezoni yo'q dvigatellarda (Zakovat, aralash viktorina, yagona ball, sport)
// ustunlar raundlar bo'ladi.
const resolveColumns = (competition) => {
    const criteria = resolveCriteria(competition);
    if (criteria.length) return { kind: 'criteria', columns: criteria };

    const rounds = Number(competition?.roundsCount) || 0;
    if (rounds > 1) {
        return {
            kind: 'rounds',
            columns: Array.from({ length: rounds }, (_, i) => ({
                name: `${i + 1}-raund`, max: null,
            })),
        };
    }
    return { kind: 'single', columns: [{ name: 'Ball', max: null }] };
};

const BLANKS = [
    { id: 'scoring', label: 'Hakam baholash varaqasi', icon: Gavel },
    { id: 'attendance', label: 'Ishtirokchilar va davomat', icon: ClipboardCheck },
    { id: 'protocol', label: 'Yakuniy bayonnoma', icon: FileText },
];

// Qog'ozda to'ldiriladigan bo'sh katak.
const Blank = ({ w = '140px' }) => (
    <span
        className="inline-block border-b border-gray-400 align-bottom"
        style={{ width: w, height: '1.1em' }}
    />
);

const CompetitionBlanksTab = ({ competition }) => {
    const [kind, setKind] = useState('scoring');
    const sheetRef = useRef(null);

    const { kind: colKind, columns } = useMemo(
        () => resolveColumns(competition), [competition]
    );

    const isTeam = competition?.type === 'team';
    const participants = competition?.participants || [];

    // Ro'yxat bo'sh bo'lsa ham blanka kerak - ishtirokchi joyida yoziladi.
    // Shuning uchun har doim kamida 15 qator chiqadi.
    const rows = useMemo(() => {
        const named = participants.map(p => (isTeam ? p.name : p.fullName) || '');
        const minRows = 15;
        while (named.length < minRows) named.push('');
        return named;
    }, [participants, isTeam]);

    const totalMax = columns.reduce((s, c) => s + (Number(c.max) || 0), 0);

    const print = () => {
        document.body.classList.add('blank-printing');
        const done = () => {
            document.body.classList.remove('blank-printing');
            window.removeEventListener('afterprint', done);
        };
        window.addEventListener('afterprint', done);
        window.print();
        // `afterprint` ba'zi brauzerlarda ishlamaydi - sinfni baribir olib
        // tashlaymiz, aks holda sahifa oq bo'lib qolardi.
        setTimeout(done, 1000);
    };

    const header = (
        <div className="border-b-2 border-gray-800 pb-3 mb-4">
            <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                Toshkent davlat yuridik universiteti
            </p>
            <h3 className="text-base font-bold text-gray-900 mt-1">
                {BLANKS.find(b => b.id === kind)?.label}
            </h3>
            <p className="text-sm font-semibold text-gray-800 mt-2">
                {competition?.name || <Blank w="260px" />}
            </p>
            <div className="flex flex-wrap gap-x-8 gap-y-1 mt-2 text-xs text-gray-700">
                <span>Sana: {competition?.startDate || <Blank w="110px" />}</span>
                <span>Bosqich / tur: <Blank w="110px" /></span>
                {kind === 'scoring' && <span>Hakam F.I.Sh.: <Blank w="170px" /></span>}
            </div>
        </div>
    );

    const signatures = (
        <div className="mt-6 flex flex-wrap gap-x-12 gap-y-4 text-xs text-gray-700">
            <span>Imzo: <Blank w="150px" /></span>
            <span>Sana: <Blank w="110px" /></span>
        </div>
    );

    return (
        <div className="p-4 space-y-4 overflow-y-auto">
            {/* Boshqaruv - qog'ozga tushmaydi */}
            <div className="no-print flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                    {BLANKS.map(b => (
                        <button
                            key={b.id} type="button" onClick={() => setKind(b.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                                kind === b.id
                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                        >
                            <b.icon size={14} />
                            {b.label}
                        </button>
                    ))}
                </div>
                <Button variant="primary" size="sm" icon={Printer} onClick={print}>
                    Chop etish
                </Button>
            </div>

            <p className="no-print text-[11px] text-gray-500 leading-relaxed">
                Blanka bo&rsquo;sh chiqadi, lekin shu musobaqaning nomi, sanasi,
                ishtirokchilari va mezonlari bilan. Zalda internet uzilsa yoki hakam
                qog&rsquo;ozda ishlashni afzal ko&rsquo;rsa, ish to&rsquo;xtab qolmaydi
                &mdash; natija keyin tizimga kiritiladi.
            </p>

            {/* Varaqaning o'zi */}
            <div
                ref={sheetRef}
                className="blank-sheet bg-white border border-gray-200 rounded-xl p-6 text-gray-900"
            >
                {header}

                {kind === 'scoring' && (
                    <>
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr>
                                    <th className="border border-gray-400 px-2 py-1.5 w-8">№</th>
                                    <th className="border border-gray-400 px-2 py-1.5 text-left">
                                        {isTeam ? 'Jamoa' : 'Ishtirokchi'}
                                    </th>
                                    {columns.map(c => (
                                        <th key={c.name} className="border border-gray-400 px-1 py-1.5 text-center align-bottom">
                                            <span className="block leading-tight">{c.name}</span>
                                            {c.max != null && (
                                                <span className="block text-[10px] font-normal text-gray-500">
                                                    maks. {c.max}
                                                </span>
                                            )}
                                        </th>
                                    ))}
                                    <th className="border border-gray-400 px-2 py-1.5 text-center">
                                        Jami
                                        {totalMax > 0 && (
                                            <span className="block text-[10px] font-normal text-gray-500">
                                                maks. {totalMax}
                                            </span>
                                        )}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((name, i) => (
                                    <tr key={`r-${i}`}>
                                        <td className="border border-gray-400 px-2 py-2 text-center text-gray-500">{i + 1}</td>
                                        <td className="border border-gray-400 px-2 py-2">{name}</td>
                                        {columns.map(c => (
                                            <td key={c.name} className="border border-gray-400 px-2 py-2" />
                                        ))}
                                        <td className="border border-gray-400 px-2 py-2" />
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {colKind === 'single' && (
                            <p className="mt-2 text-[10px] text-gray-500">
                                Bu musobaqada alohida mezonlar belgilanmagan &mdash; bitta umumiy ball qo&rsquo;yiladi.
                            </p>
                        )}
                        {signatures}
                    </>
                )}

                {kind === 'attendance' && (
                    <>
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr>
                                    <th className="border border-gray-400 px-2 py-1.5 w-8">№</th>
                                    <th className="border border-gray-400 px-2 py-1.5 text-left">
                                        {isTeam ? 'Jamoa' : 'F.I.Sh.'}
                                    </th>
                                    <th className="border border-gray-400 px-2 py-1.5 w-28">Fakultet</th>
                                    <th className="border border-gray-400 px-2 py-1.5 w-20">Guruh</th>
                                    <th className="border border-gray-400 px-2 py-1.5 w-16 text-center">Keldi</th>
                                    <th className="border border-gray-400 px-2 py-1.5 w-32">Imzo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {participants.length > 0
                                    ? participants.map((p, i) => (
                                        <tr key={p.id}>
                                            <td className="border border-gray-400 px-2 py-2 text-center text-gray-500">{i + 1}</td>
                                            <td className="border border-gray-400 px-2 py-2">{isTeam ? p.name : p.fullName}</td>
                                            <td className="border border-gray-400 px-2 py-2">{p.faculty || ''}</td>
                                            <td className="border border-gray-400 px-2 py-2">{p.group || ''}</td>
                                            <td className="border border-gray-400 px-2 py-2" />
                                            <td className="border border-gray-400 px-2 py-2" />
                                        </tr>
                                    ))
                                    : rows.map((_, i) => (
                                        <tr key={`a-${i}`}>
                                            <td className="border border-gray-400 px-2 py-2 text-center text-gray-500">{i + 1}</td>
                                            <td className="border border-gray-400 px-2 py-2" />
                                            <td className="border border-gray-400 px-2 py-2" />
                                            <td className="border border-gray-400 px-2 py-2" />
                                            <td className="border border-gray-400 px-2 py-2" />
                                            <td className="border border-gray-400 px-2 py-2" />
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                        <p className="mt-3 text-[11px] text-gray-600">
                            Davomatni belgilagan mas&rsquo;ul shaxs: <Blank w="180px" />
                        </p>
                        {signatures}
                    </>
                )}

                {kind === 'protocol' && (
                    <>
                        <p className="text-xs text-gray-700 mb-3">
                            Musobaqa natijalari bo&rsquo;yicha hakamlar hay&rsquo;ati quyidagi
                            o&rsquo;rinlarni belgiladi:
                        </p>
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr>
                                    <th className="border border-gray-400 px-2 py-1.5 w-16">O&rsquo;rin</th>
                                    <th className="border border-gray-400 px-2 py-1.5 text-left">
                                        {isTeam ? 'Jamoa' : 'Ishtirokchi'}
                                    </th>
                                    <th className="border border-gray-400 px-2 py-1.5 w-28">Fakultet</th>
                                    <th className="border border-gray-400 px-2 py-1.5 w-20 text-center">Ball</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[1, 2, 3, 4, 5, 6].map(place => (
                                    <tr key={place}>
                                        <td className="border border-gray-400 px-2 py-2.5 text-center font-semibold">{place}</td>
                                        <td className="border border-gray-400 px-2 py-2.5" />
                                        <td className="border border-gray-400 px-2 py-2.5" />
                                        <td className="border border-gray-400 px-2 py-2.5" />
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <p className="mt-5 text-xs font-semibold text-gray-800">Hakamlar hay&rsquo;ati:</p>
                        <table className="w-full border-collapse text-xs mt-2">
                            <thead>
                                <tr>
                                    <th className="border border-gray-400 px-2 py-1.5 text-left">F.I.Sh.</th>
                                    <th className="border border-gray-400 px-2 py-1.5 w-40">Lavozimi</th>
                                    <th className="border border-gray-400 px-2 py-1.5 w-32">Imzo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[0, 1, 2, 3].map(i => (
                                    <tr key={`j-${i}`}>
                                        <td className="border border-gray-400 px-2 py-2.5" />
                                        <td className="border border-gray-400 px-2 py-2.5" />
                                        <td className="border border-gray-400 px-2 py-2.5" />
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <p className="mt-5 text-xs text-gray-700">
                            Bosh hakam: <Blank w="200px" /> &nbsp;&nbsp; Imzo: <Blank w="130px" />
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};

export default CompetitionBlanksTab;
