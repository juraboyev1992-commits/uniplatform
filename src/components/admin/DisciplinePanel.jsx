import React, { useMemo, useState } from 'react';
import { ShieldAlert, Plus, Trash2, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import StudentPicker from '../common/StudentPicker';
import StatStrip from '../common/StatStrip';
import { getDisciplineStats } from '../../utils/moduleStats';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import {
    INDEX_CRITERIA, DISCIPLINE_PARTS, DISCIPLINE_PART_ORDER,
} from '../../config/socialActivityIndex';

// "Ichki tartib qoidalari va Odob-axloq kodeksiga rioya etishi" (4-mezon).
//
// BU YERDA BALL QO'YILMAYDI — faqat BUZILISH qayd etiladi.
//
// Metodikaning mantig'i teskari: "talabaning dresskod qoidalarini buzmasligi ...
// uning MAKSIMAL BALL olishini KAFOLATLAYDI". Ya'ni har talaba 5 balldan turadi
// va faqat qayd etilgan buzilish uchun kamayadi. Qolgan talabalarga tegish
// shart emas — ularning yozuvi yo'q, demak qoidani buzmagan.
//
// Shu sababli bu ekran 550 ta talabani emas, faqat MUAMMOLARNI ko'rsatadi.
const DisciplinePanel = () => {
    const { user } = useAuth();
    const [version, setVersion] = useState(0);
    const [student, setStudent] = useState(null);
    const [type, setType] = useState('dresscode');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [evidence, setEvidence] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const criterion = INDEX_CRITERIA.DISCIPLINE;
    const violations = useMemo(() => db.getDisciplineViolations(), [version]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const stats = useMemo(() => getDisciplineStats(db), [version]);
    const deductions = useMemo(() => db.getDisciplineDeductions(), [version]);
    const [draft, setDraft] = useState(null);
    const current = draft || deductions;

    const students = useMemo(
        () => new Map(db.getMockStudents().map(s => [s.id, s])),
        []
    );

    const run = async (fn, ok = '') => {
        setBusy(true); setError(''); setMessage('');
        try { await fn(); setVersion(v => v + 1); if (ok) setMessage(ok); }
        catch (e) { setError(e?.message || 'Xatolik yuz berdi.'); }
        finally { setBusy(false); }
    };

    const handleAdd = () => run(async () => {
        await db.addDisciplineViolation({
            studentId: student.id, type, date, evidence, note,
            recordedBy: user?.username,
        });
        setStudent(null); setEvidence(''); setNote('');
    }, 'Buzilish qayd etildi.');

    return (
        <div className="space-y-4">
            <Card>
                <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <ShieldAlert size={17} className="text-rose-600" /> Intizom va odob-axloq
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">
                                4-mezon · maksimal {criterion.maxPoints} ball
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-extrabold text-gray-900 tabular-nums">{violations.length}</p>
                            <p className="text-[11px] text-gray-400">buzilish qayd etilgan</p>
                        </div>
                    </div>

                    {/* Bu mezon PREZUMPSIYA asosida ishlaydi, shuning uchun
                        eng ma'noli raqam - yozuvi YO'Q talabalar soni: aynan
                        ular to'liq ballga ega. Buzilish soni o'zi bu holatni
                        ko'rsatmasdi. */}
                    <StatStrip
                        items={[
                            { label: 'Buzilish qayd etilgan', value: stats.violations, tone: stats.violations > 0 ? 'red' : 'gray' },
                            { label: 'Yozuvi bor talaba', value: stats.students, tone: 'amber', hint: `${stats.totalStudents} tadan` },
                            { label: "To'liq ballga ega", value: stats.cleanStudents, tone: 'emerald', hint: 'yozuvi yo\'q' },
                            { label: 'Takrorlanuvchilar', value: stats.repeaters.length, tone: stats.repeaters.length > 0 ? 'red' : 'gray' },
                        ]}
                        warnings={[
                            stats.repeaters.length > 0
                                && `${stats.repeaters.length} nafar talabada bir nechta buzilish bor — bu bir martalik holat emas`,
                        ]}
                    />

                    {stats.types.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {stats.types.map(t => (
                                <span key={t.key} className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-xs font-semibold">
                                    {DISCIPLINE_PARTS[t.key]?.label || t.key}
                                    <span className="opacity-60 ml-1.5 tabular-nums">{t.count}</span>
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                        <p className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                            <Info size={12} /> Bu yerda ball qo'yilmaydi — faqat buzilish qayd etiladi
                        </p>
                        <p className="text-[11px] text-gray-600 leading-relaxed">
                            Metodikaga ko'ra qoidaga rioya etish <span className="font-bold">maksimal ball olishni
                            kafolatlaydi</span>. Shuning uchun har talaba {criterion.maxPoints} balldan turadi va
                            ball faqat qayd etilgan buzilish uchun kamayadi. Qolgan talabalarga tegish shart emas —
                            yozuvi yo'q talaba qoidani buzmagan hisoblanadi.
                        </p>
                    </div>

                    {/* Ayirma miqdori - universitet qarori, metodikada yo'q. */}
                    <div className="space-y-2 pt-1">
                        <p className="text-xs font-bold text-gray-600">Bir buzilish uchun ayirma</p>
                        {DISCIPLINE_PART_ORDER.map(key => {
                            const part = DISCIPLINE_PARTS[key];
                            return (
                                <div key={key} className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-gray-700 min-w-[15rem]">
                                        {part.label} <span className="text-gray-400">({part.maxPoints} ball)</span>
                                    </span>
                                    <span className="text-xs text-gray-400">−</span>
                                    <input
                                        type="number" min={0} max={part.maxPoints} step={0.5}
                                        className="w-20 px-2 py-1.5 border border-gray-200 rounded-xl text-sm text-center"
                                        value={current[key]}
                                        onChange={e => setDraft({ ...current, [key]: e.target.value })}
                                    />
                                    <span className="text-[11px] text-gray-400">
                                        ball · {Math.ceil(part.maxPoints / (Number(current[key]) || part.maxPoints))} ta buzilishdan keyin 0
                                    </span>
                                </div>
                            );
                        })}
                        {draft && (
                            <Button
                                variant="primary" size="sm" disabled={busy}
                                onClick={() => run(async () => {
                                    await db.setDisciplineDeductions({
                                        dresscode: Number(current.dresscode),
                                        ethics: Number(current.ethics),
                                    });
                                    setDraft(null);
                                }, 'Sozlama saqlandi.')}
                            >
                                Saqlash
                            </Button>
                        )}
                        <p className="text-[11px] text-gray-400">
                            Metodikada «2 ballgacha», «3 ballgacha» deyilgan, aniq shkala berilmagan —
                            miqdorni universitet belgilaydi.
                        </p>
                    </div>

                    {error && (
                        <p className="flex items-start gap-1.5 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            <AlertTriangle size={12} className="shrink-0 mt-px" /> {error}
                        </p>
                    )}
                    {message && (
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                            <CheckCircle2 size={12} /> {message}
                        </p>
                    )}
                </div>
            </Card>

            <Card>
                <div className="p-5 space-y-3">
                    <h4 className="font-bold text-sm text-gray-700">Buzilish qayd etish</h4>

                    <div>
                        <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1.5">Talaba *</label>
                        <StudentPicker value={student} onSelect={setStudent} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1.5">Qoida *</label>
                            <select
                                value={type} onChange={e => { setType(e.target.value); setEvidence(''); }}
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                            >
                                {DISCIPLINE_PART_ORDER.map(key => (
                                    <option key={key} value={key}>{DISCIPLINE_PARTS[key].label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1.5">Sana</label>
                            <input
                                type="date" value={date} onChange={e => setDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                    </div>

                    {/* Dalilsiz yozuv qo'yilmaydi - metodikada har ikkala qoida
                        uchun ham aniq asos talab qilinadi. */}
                    <div>
                        <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1.5">
                            Asos * — {DISCIPLINE_PARTS[type].evidenceLabel}
                        </label>
                        <input
                            type="text" value={evidence} onChange={e => setEvidence(e.target.value)}
                            placeholder={type === 'dresscode'
                                ? "Masalan: 12.03.2026 sanali tushuntirish xati"
                                : "Masalan: 15.03.2026 dagi 47-sonli buyruq, hayfsan"}
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1.5">Izoh</label>
                        <textarea
                            rows={2} value={note} onChange={e => setNote(e.target.value)}
                            placeholder="Holat qisqacha tavsifi..."
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                        />
                    </div>

                    <Button
                        variant="primary" size="sm" icon={Plus}
                        disabled={busy || !student || !evidence.trim()}
                        onClick={handleAdd}
                    >
                        Qayd etish
                    </Button>
                    <p className="text-[11px] text-gray-400">
                        Qayd etilgach talabaga xabar boradi — ball jimgina kamayib qolmasligi kerak.
                    </p>
                </div>
            </Card>

            <Card padding={false}>
                <div className="p-4 border-b border-gray-100">
                    <h4 className="font-bold text-sm text-gray-700">
                        Qayd etilgan buzilishlar ({violations.length})
                    </h4>
                </div>
                {violations.length === 0 ? (
                    <p className="p-8 text-center text-sm text-gray-400">
                        Buzilish qayd etilmagan — barcha talabalar to'liq {criterion.maxPoints} ballga ega.
                    </p>
                ) : (
                    <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                        {violations.map(v => {
                            const part = DISCIPLINE_PARTS[v.type];
                            return (
                                <div key={v.id} className="flex items-start gap-3 px-4 py-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-900 truncate">
                                            {students.get(v.studentId)?.fullName || v.studentId}
                                        </p>
                                        <p className="text-[11px] text-gray-500 mt-0.5">
                                            {part?.label} · {v.date}
                                        </p>
                                        <p className="text-[11px] text-gray-500 mt-0.5">
                                            <span className="font-semibold">Asos:</span> {v.evidence}
                                        </p>
                                        {v.note && <p className="text-[11px] text-gray-400 mt-0.5 italic">{v.note}</p>}
                                    </div>
                                    <Badge variant="danger" size="sm">
                                        −{current[v.type]} ball
                                    </Badge>
                                    <button
                                        type="button" disabled={busy}
                                        onClick={() => run(() => db.removeDisciplineViolation(v.id), 'Yozuv olib tashlandi.')}
                                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg shrink-0"
                                        title="Yozuvni olib tashlash"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
};

export default DisciplinePanel;
