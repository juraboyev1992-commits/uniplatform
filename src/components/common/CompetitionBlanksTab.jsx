import React, { useMemo, useRef, useState } from 'react';
import { Printer, FileText, ClipboardCheck, Gavel, Download, Loader2 } from 'lucide-react';
import Button from './Button';
import { db } from '../../services/db';
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
            .map(c => ({ id: c.id || c.name, name: c.name, max: c.max }));
    }

    if (method === 'debate_match') {
        // Faqat ball qo'yiladigan qatorlar; ichki (parent) qatorlar
        // qog'ozda alohida ustun bo'lib ketmasin.
        return DEBATE_MATCH_CRITERIA
            .filter(c => c.kind === 'score' && !c.parent)
            .map(c => ({ id: c.id, name: c.name, max: c.max }));
    }

    // Munozara va "mezon asosida" - ikkalasi ham `criteria` da saqlanadi.
    if (competition?.criteria?.length) {
        return competition.criteria.map((c, i) => ({
            id: c.id || `c${i}`,
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
                id: `r${i + 1}`, name: `${i + 1}-raund`, max: null,
            })),
        };
    }
    return { kind: 'single', columns: [{ id: 'ball', name: 'Ball', max: null }] };
};

// Jamoa a'zolari. Ishtirokchi `id` si jamoa `id` si bilan bir xil bo'lmasligi
// mumkin - u holda bo'sh qatorlar chiqadi, ya'ni varaqa baribir ishlaydi.
const teamMemberNames = (participant) => {
    try {
        const rows = db.getTeamMembers(participant.id) || [];
        return rows.map(m => m.student?.fullName || m.student?.name || '').filter(Boolean);
    } catch {
        return [];
    }
};

const BLANKS = [
    { id: 'scoring', label: 'Hakam baholash varaqasi', icon: Gavel },
    { id: 'attendance', label: 'Ishtirokchilar va davomat', icon: ClipboardCheck },
    { id: 'protocol', label: 'Yakuniy bayonnoma', icon: FileText },
];

const Blank = ({ w = '140px' }) => (
    <span
        className="inline-block border-b border-gray-400 align-bottom"
        style={{ width: w, height: '1.1em' }}
    />
);

const Field = ({ label, children }) => (
    <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold text-gray-400 uppercase">{label}</span>
        {children}
    </label>
);

const SELECT = 'px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white min-w-[140px]';

const CompetitionBlanksTab = ({ competition }) => {
    const [kind, setKind] = useState('scoring');
    const [stage, setStage] = useState('');
    const [judge, setJudge] = useState('');
    const [perJudge, setPerJudge] = useState(false);
    const [withNames, setWithNames] = useState(true);
    const [withMembers, setWithMembers] = useState(false);
    const [blankRows, setBlankRows] = useState(15);
    const [busy, setBusy] = useState(false);
    const areaRef = useRef(null);

    const { kind: colKind, columns } = useMemo(
        () => resolveColumns(competition), [competition]
    );

    const isTeam = competition?.type === 'team';
    const participants = competition?.participants || [];
    const judges = competition?.judges || [];
    const rounds = Number(competition?.roundsCount) || 0;
    const totalMax = columns.reduce((s, c) => s + (Number(c.max) || 0), 0);

    // Har bir hakamga alohida nusxa - aks holda bitta varaqani nusxalab,
    // ustiga ism yozib chiqish kerak bo'lardi.
    const sheets = perJudge && judges.length > 0 ? judges : [judge || ''];

    // Ismlar bilan chiqarish faqat ishtirokchi bo'lsa ma'noli.
    const useNames = withNames && participants.length > 0;

    const rowCount = Math.max(1, Math.min(60, Number(blankRows) || 15));

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

    const downloadPdf = async () => {
        if (busy) return;
        setBusy(true);
        try {
            // Kutubxonalar ~640 KB - faqat shu tugma bosilganda so'raladi.
            const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
                import('html2canvas'), import('jspdf'),
            ]);
            const nodes = areaRef.current?.querySelectorAll('.blank-sheet') || [];
            if (nodes.length === 0) return;

            const pdf = new jsPDF('p', 'mm', 'a4');
            const pw = pdf.internal.pageSize.getWidth();
            const ph = pdf.internal.pageSize.getHeight();
            const margin = 10;

            for (let i = 0; i < nodes.length; i += 1) {
                // eslint-disable-next-line no-await-in-loop
                const canvas = await html2canvas(nodes[i], { scale: 2, backgroundColor: '#ffffff' });
                const img = canvas.toDataURL('image/jpeg', 0.92);
                const maxW = pw - margin * 2;
                const maxH = ph - margin * 2;
                // Kichiklashtiriladi, kattalashtirilmaydi - matn bulanmasin.
                const ratio = Math.min(maxW / canvas.width, maxH / canvas.height, 1);
                const w = canvas.width * ratio;
                const h = canvas.height * ratio;
                if (i > 0) pdf.addPage();
                pdf.addImage(img, 'JPEG', (pw - w) / 2, margin, w, h);
            }
            const safe = (competition?.name || 'musobaqa')
                // Faqat fayl nomida TAQIQLANGAN belgilar olib tashlanadi.
                // Butun bir alifboni kesib tashlash emas - musobaqa nomi
                // o'zbekcha va u faylda ko'rinib turishi kerak.
                .replace(/[\/:*?"<>|]+/g, '').trim();
            pdf.save(`${safe || 'musobaqa'} - blanka.pdf`);
        } finally {
            setBusy(false);
        }
    };

    const renderHeader = (judgeName) => (
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
                <span>Bosqich / tur: {stage || <Blank w="110px" />}</span>
                {kind === 'scoring' && (
                    <span>Hakam F.I.Sh.: {judgeName || <Blank w="170px" />}</span>
                )}
            </div>
        </div>
    );

    const signatures = (
        <div className="mt-6 flex flex-wrap gap-x-12 gap-y-4 text-xs text-gray-700">
            <span>Imzo: <Blank w="150px" /></span>
            <span>Sana: <Blank w="110px" /></span>
        </div>
    );

    const scoringRows = useNames
        ? participants.map(p => (isTeam ? p.name : p.fullName) || '')
        : Array.from({ length: rowCount }, () => '');

    const renderSheet = (judgeName, idx) => (
        <div
            key={`sheet-${idx}`}
            className="blank-sheet bg-white border border-gray-200 rounded-xl p-6 text-gray-900"
        >
            {renderHeader(judgeName)}

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
                                    <th key={c.id} className="border border-gray-400 px-1 py-1.5 text-center align-bottom">
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
                            {scoringRows.map((name, i) => (
                                <tr key={`r-${i}`}>
                                    <td className="border border-gray-400 px-2 py-2 text-center text-gray-500">{i + 1}</td>
                                    <td className="border border-gray-400 px-2 py-2">{name}</td>
                                    {columns.map(c => (
                                        <td key={c.id} className="border border-gray-400 px-2 py-2" />
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
                                    {isTeam && !withMembers ? 'Jamoa' : 'F.I.Sh.'}
                                </th>
                                <th className="border border-gray-400 px-2 py-1.5 w-28">Fakultet</th>
                                <th className="border border-gray-400 px-2 py-1.5 w-20">Guruh</th>
                                <th className="border border-gray-400 px-2 py-1.5 w-16 text-center">Keldi</th>
                                <th className="border border-gray-400 px-2 py-1.5 w-32">Imzo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {useNames
                                ? participants.flatMap((p, i) => {
                                    const head = (
                                        <tr key={p.id}>
                                            <td className="border border-gray-400 px-2 py-2 text-center text-gray-500">{i + 1}</td>
                                            <td className="border border-gray-400 px-2 py-2 font-semibold">
                                                {isTeam ? p.name : p.fullName}
                                            </td>
                                            <td className="border border-gray-400 px-2 py-2">{p.faculty || ''}</td>
                                            <td className="border border-gray-400 px-2 py-2">{p.group || ''}</td>
                                            <td className="border border-gray-400 px-2 py-2" />
                                            <td className="border border-gray-400 px-2 py-2" />
                                        </tr>
                                    );
                                    if (!isTeam || !withMembers) return [head];

                                    // JAMOA A'ZOLARI. Davomat jamoaga emas, HAR BIR
                                    // talabaga qo'yiladi - jamoa g'olib bo'lgani
                                    // bilan a'zosi kelmagan bo'lishi mumkin.
                                    const names = teamMemberNames(p);
                                    const count = names.length || Number(p.membersCount) || 3;
                                    const memberRows = Array.from({ length: count }, (_, k) => (
                                        <tr key={`${p.id}-m${k}`}>
                                            <td className="border border-gray-400 px-2 py-2 text-center text-gray-400">
                                                {i + 1}.{k + 1}
                                            </td>
                                            <td className="border border-gray-400 px-2 py-2 pl-5">{names[k] || ''}</td>
                                            <td className="border border-gray-400 px-2 py-2" />
                                            <td className="border border-gray-400 px-2 py-2" />
                                            <td className="border border-gray-400 px-2 py-2" />
                                            <td className="border border-gray-400 px-2 py-2" />
                                        </tr>
                                    ));
                                    return [head, ...memberRows];
                                })
                                : Array.from({ length: rowCount }, (_, i) => (
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
                            {(judges.length > 0 ? judges : ['', '', '', '']).map((j, i) => (
                                <tr key={`j-${i}`}>
                                    <td className="border border-gray-400 px-2 py-2.5">{j}</td>
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
    );

    return (
        <div className="p-4 space-y-4 overflow-y-auto">
            {/* Boshqaruv - qog'ozga tushmaydi */}
            <div className="no-print space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
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
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" icon={busy ? Loader2 : Download} onClick={downloadPdf} disabled={busy}>
                            {busy ? 'Tayyorlanmoqda...' : 'PDF'}
                        </Button>
                        <Button variant="primary" size="sm" icon={Printer} onClick={print}>
                            Chop etish
                        </Button>
                    </div>
                </div>

                {/* SOZLASH. Blanka har safar bir xil chiqmasligi kerak:
                    bosqich, hakam va qatorlar soni har musobaqada boshqacha. */}
                <div className="flex flex-wrap items-end gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl">
                    <Field label="Bosqich / tur">
                        <select value={stage} onChange={e => setStage(e.target.value)} className={SELECT}>
                            <option value="">Bo&rsquo;sh qoldirilsin</option>
                            {Array.from({ length: rounds }, (_, i) => (
                                <option key={i} value={`${i + 1}-raund`}>{i + 1}-raund</option>
                            ))}
                            <option value="Saralash">Saralash</option>
                            <option value="Yarim final">Yarim final</option>
                            <option value="Final">Final</option>
                        </select>
                    </Field>

                    {kind === 'scoring' && (
                        <Field label="Hakam">
                            <select
                                value={judge} onChange={e => setJudge(e.target.value)}
                                className={SELECT} disabled={perJudge}
                            >
                                <option value="">Bo&rsquo;sh qoldirilsin</option>
                                {judges.map(j => <option key={j} value={j}>{j}</option>)}
                            </select>
                        </Field>
                    )}

                    <Field label="Ishtirokchilar">
                        <select
                            value={withNames ? 'names' : 'blank'}
                            onChange={e => setWithNames(e.target.value === 'names')}
                            className={SELECT}
                        >
                            <option value="names">Ro&rsquo;yxat bilan ({participants.length})</option>
                            <option value="blank">Bo&rsquo;sh varaqa</option>
                        </select>
                    </Field>

                    {!useNames && (
                        <Field label="Qator soni">
                            <input
                                type="number" min="1" max="60" value={blankRows}
                                onChange={e => setBlankRows(e.target.value)}
                                className={`${SELECT} min-w-[90px]`}
                            />
                        </Field>
                    )}

                    {kind === 'scoring' && judges.length > 0 && (
                        <label className="flex items-center gap-2 text-xs text-gray-700 pb-2 cursor-pointer">
                            <input
                                type="checkbox" checked={perJudge}
                                onChange={e => setPerJudge(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                            />
                            Har bir hakamga alohida ({judges.length} nusxa)
                        </label>
                    )}

                    {kind === 'attendance' && isTeam && (
                        <label className="flex items-center gap-2 text-xs text-gray-700 pb-2 cursor-pointer">
                            <input
                                type="checkbox" checked={withMembers}
                                onChange={e => setWithMembers(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                            />
                            Jamoa a&rsquo;zolari alohida qator
                        </label>
                    )}
                </div>

                <p className="text-[11px] text-gray-500 leading-relaxed">
                    Blanka bo&rsquo;sh chiqadi, lekin shu musobaqaning nomi, sanasi,
                    ishtirokchilari va mezonlari bilan. Zalda internet uzilsa yoki hakam
                    qog&rsquo;ozda ishlashni afzal ko&rsquo;rsa, ish to&rsquo;xtab qolmaydi
                    &mdash; natija keyin tizimga kiritiladi.
                </p>
            </div>

            {/* Varaqalar */}
            <div ref={areaRef} className="blank-print-area space-y-4">
                {sheets.map((j, i) => renderSheet(j, i))}
            </div>
        </div>
    );
};

export default CompetitionBlanksTab;
