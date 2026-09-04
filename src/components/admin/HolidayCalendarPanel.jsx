import React, { useMemo, useState } from 'react';
import { CalendarOff, Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import { db } from '../../services/db';
import { APPEAL } from '../../config/socialActivityIndex';

// BAYRAM KUNLARI TAQVIMI.
//
// Nima uchun kerak: metodikadagi muddatlar ISH KUNLARIDA hisoblanadi
// (apellyatsiya - 10 ish kuni). Shanba va yakshanba har doim dam olish kuni,
// bayramlar esa har yili o'zgaradi va ba'zilari ko'chiriladi - shuning uchun
// ular kodda emas, shu yerda turadi.
//
// Ro'yxat bo'sh bo'lsa tizim ishlayveradi: muddat faqat hafta oxirlarini
// hisobga oladi.
const MONTHS = [
    'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
    'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

const HolidayCalendarPanel = () => {
    const [version, setVersion] = useState(0);
    const [date, setDate] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const holidays = useMemo(() => db.getHolidays(), [version]);

    // Yil kesimida guruhlash - ro'yxat yildan yilga uzayadi.
    const byYear = useMemo(() => {
        const map = new Map();
        holidays.forEach(d => {
            const y = d.slice(0, 4);
            if (!map.has(y)) map.set(y, []);
            map.get(y).push(d);
        });
        return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    }, [holidays]);

    const run = async (fn, ok = '') => {
        setBusy(true); setError(''); setMessage('');
        try { await fn(); setVersion(v => v + 1); if (ok) setMessage(ok); }
        catch (e) { setError(e?.message || 'Xatolik yuz berdi.'); }
        finally { setBusy(false); }
    };

    const format = (d) => {
        const [y, m, day] = d.split('-');
        return `${Number(day)}-${MONTHS[Number(m) - 1]} ${y}`;
    };

    return (
        <Card>
            <div className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <CalendarOff size={17} className="text-slate-600" /> Bayram va dam olish kunlari
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                            Muddatlar ish kunlarida hisoblanadi — apellyatsiya {APPEAL.submitWorkingDays} ish kuni
                        </p>
                    </div>
                    <p className="text-2xl font-extrabold text-gray-900 tabular-nums">{holidays.length}</p>
                </div>

                {/* Hafta oxirlari sozlanmaydi - universitetning ish tartibi. */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <p className="text-[11px] font-bold text-gray-700">Shanba va yakshanba — doimiy dam olish kuni</p>
                    <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
                        Bular sozlanmaydi, tizim ularni har doim o'tkazib yuboradi.
                        Quyida faqat <b>bayram va ko'chirilgan dam olish kunlari</b> ko'rsatiladi.
                    </p>
                </div>

                <div className="flex items-end gap-2 flex-wrap">
                    <div>
                        <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1.5">Sana</label>
                        <input
                            type="date" value={date} onChange={e => setDate(e.target.value)}
                            className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
                        />
                    </div>
                    <Button
                        variant="primary" size="sm" icon={Plus}
                        disabled={busy || !date}
                        onClick={() => run(async () => {
                            await db.addHoliday(date);
                            setDate('');
                        }, 'Kun qo\'shildi.')}
                    >
                        Qo'shish
                    </Button>
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

                {holidays.length === 0 ? (
                    <p className="text-sm text-gray-400 py-3">
                        Bayram kuni kiritilmagan — muddat faqat shanba va yakshanbani hisobga oladi.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {byYear.map(([year, days]) => (
                            <div key={year}>
                                <p className="text-[11px] font-bold uppercase text-gray-400 mb-1.5">{year}-yil</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {days.map(d => (
                                        <span
                                            key={d}
                                            className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700"
                                        >
                                            {format(d)}
                                            <button
                                                type="button" disabled={busy}
                                                onClick={() => run(() => db.removeHoliday(d), 'Kun olib tashlandi.')}
                                                className="p-0.5 text-gray-400 hover:text-rose-600 rounded"
                                                title="Olib tashlash"
                                            >
                                                <Trash2 size={11} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Card>
    );
};

export default HolidayCalendarPanel;
