import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CheckCircle2, Database, ArrowRight } from 'lucide-react';
import Card from '../common/Card';
import { db } from '../../services/db';
import { criterionVisual } from '../../config/criterionVisuals';
import { getIndexReadiness, getPendingWorkload, getSystemHealth } from '../../utils/indexReadiness';

// ===========================================================================
// ADMINISTRATOR BOSH SAHIFASIGA QO'SHIMCHA
//
// Bosh sahifada avval faqat "nechta talaba, nechta tadbir" turardi - ya'ni
// platforma HAJMI. Lekin administratorning kundalik savoli boshqa:
//   "bugun nima qilishim kerak" va "indeks iyulga tayyor bo'ladimi".
//
// Shu uchta blok aynan shunga javob beradi. Hech qanday eski blok
// o'chirilmagan - bular ularning yoniga qo'shiladi.
//
// HAMMASI ARZON: bu yerda birorta talabaning indeksi hisoblanmaydi, faqat
// jadvallar ustidan bir marta yurib chiqiladi. Sabab - 550 ta talabaning
// indeksini sahifa ochilishida hisoblash sahifani muzlatib qo'yardi.
// ===========================================================================

// --- MUDDATLAR ---
// Sanalar metodikadan (10/15/25-iyul), tizimda allaqachon bor edi, lekin
// faqat sozlamalar ichida ko'rinardi.
// Har bir muddat qaysi ish bilan bog'liq — bosilganda o'sha joyga olib boradi.
// Muddat o'zi harakat emas, u ESLATMA; foydalanuvchining keyingi savoli har doim
// "shu ish qayerda bajariladi?" bo'ladi.
const DEADLINE_TARGET = {
    // Talaba hujjat yuklaydi -> admin uni arizalar ro'yxatida ko'radi.
    upload: '/admin/social-activity?bolim=ish&jarayon=arizalar',
    // Mas'ul tasdiqlaydi -> tasdiqlash navbati.
    confirm: '/admin/social-activity?bolim=ish&jarayon=tasdiqlash',
    // Komissiya baholaydi -> indeks holati (mezon bo'yicha tafsilot shu yerda).
    evaluate: '/admin/social-activity?bolim=ish&jarayon=talabalar',
};

export const DeadlineStrip = () => {
    const navigate = useNavigate();
    const deadlines = useMemo(() => db.getIndexDeadlines(), []);
    if (deadlines.length === 0) return null;

    // Eng yaqin O'TMAGAN muddat ta'kidlanadi.
    const nextIdx = deadlines.findIndex(d => !d.passed);

    return (
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
                <CalendarClock size={15} className="text-indigo-600" />
                <h3 className="text-sm font-bold text-gray-900">Indeks muddatlari</h3>
                <span className="text-xs text-gray-400">metodika bo'yicha belgilangan sanalar</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {deadlines.map((d, i) => {
                    const isNext = i === nextIdx;
                    const target = DEADLINE_TARGET[d.key];
                    return (
                        <button
                            key={d.key}
                            type="button"
                            disabled={!target}
                            onClick={() => target && navigate(target)}
                            title={target ? 'Shu bosqich ustida ishlash' : undefined}
                            className={`text-left w-full rounded-xl border px-3 py-2.5 transition-shadow
                                ${target ? 'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500' : 'cursor-default'}
                                ${d.passed
                                    ? 'border-gray-100 bg-gray-50'
                                    : isNext
                                        ? 'border-indigo-200 bg-indigo-50'
                                        : 'border-gray-200 bg-white'}`}
                        >
                            <p className={`text-xs font-bold ${d.passed ? 'text-gray-400' : 'text-gray-900'}`}>
                                {new Date(d.date).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long' })}
                            </p>
                            <p className={`text-xs mt-0.5 ${d.passed ? 'text-gray-400' : 'text-gray-600'}`}>{d.label}</p>
                            <p className={`text-[11px] mt-1 font-semibold ${d.passed
                                ? 'text-gray-400'
                                : d.daysLeft <= 7 ? 'text-red-600' : 'text-indigo-600'}`}>
                                {d.passed ? "muddat o'tgan" : `${d.daysLeft} kun qoldi`}
                            </p>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

// --- INDEKS TAYYORLIGI ---
export const IndexReadinessCard = () => {
    const readiness = useMemo(() => getIndexReadiness(db), []);

    return (
        <Card
            title="Indeks tayyorligi"
            subtitle={`${readiness.academicYear} · har mezon bo'yicha ma'lumoti bor talabalar`}
        >
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                Bu ball emas — hisoblash uchun MANBA bormi, shuni ko'rsatadi. Foizi past mezon
                iyulga qadar to'ldirilishi kerak, aks holda talaba o'sha mezon bo'yicha
                <span className="font-semibold"> baholanmagan</span> qoladi (nol ball emas).
            </p>
            <div className="space-y-2.5">
                {readiness.criteria.map(c => {
                    const { icon: Icon, color, bg } = criterionVisual(c.key);
                    const low = c.percent < 25;
                    return (
                        <div key={c.key} className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                                <Icon size={14} className={color} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                    <p className="text-xs font-semibold text-gray-800 truncate">
                                        {c.order}. {c.name}
                                    </p>
                                    <p className={`text-xs font-bold tabular-nums shrink-0 ${low ? 'text-red-600' : 'text-gray-700'}`}>
                                        {c.students}/{readiness.total}
                                    </p>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${low ? 'bg-red-400' : c.percent < 60 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                                        style={{ width: `${c.percent}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
};

// --- KUTAYOTGAN ISHLAR ---
export const PendingWorkloadCard = ({ onOpenApprovals }) => {
    const workload = useMemo(() => getPendingWorkload(db), []);
    const active = workload.rows.filter(r => r.count > 0);

    return (
        <Card title="Javob kutayotgan ishlar" subtitle={`Jami ${workload.total} ta`}>
            {active.length === 0 ? (
                <div className="py-8 text-center">
                    <CheckCircle2 size={28} className="mx-auto text-emerald-500 mb-2" />
                    <p className="text-sm text-gray-500">Hamma ariza ko'rib chiqilgan</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {active.map(r => (
                        <div key={r.key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50">
                            <p className="text-sm text-gray-700">{r.label}</p>
                            <span className="text-sm font-bold text-amber-600 tabular-nums">{r.count}</span>
                        </div>
                    ))}
                </div>
            )}
            <button
                onClick={onOpenApprovals}
                className="w-full mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700"
            >
                Tasdiqlash bo'limiga o'tish <ArrowRight size={13} />
            </button>
        </Card>
    );
};

// --- TIZIM HOLATI ---
// Ulanmagan modul jimgina ishlamay turardi: ma'lumot brauzerda saqlanardi,
// keyingi sinxronlashda esa yo'qolardi. Endi buni bosh sahifada ko'rish mumkin.
export const SystemHealthCard = () => {
    const modules = useMemo(() => getSystemHealth(db), []);
    const missing = modules.filter(m => !m.ready);

    return (
        <Card title="Tizim holati" subtitle={`${modules.length - missing.length}/${modules.length} modul bazaga ulangan`}>
            {missing.length > 0 && (
                <div className="flex gap-2 p-3 mb-3 rounded-lg bg-amber-50 border border-amber-100">
                    <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 leading-relaxed">
                        Ulanmagan modulda kiritilgan ma'lumot faqat shu brauzerda qoladi va
                        keyingi sinxronlashda yo'qoladi. Quyidagi SQL fayl Supabase'da bir marta
                        ishga tushirilishi kerak.
                    </p>
                </div>
            )}
            <div className="space-y-1.5">
                {modules.map(m => (
                    <div key={m.key} className="flex items-start gap-2.5 py-1.5">
                        {m.ready
                            ? <CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                            : <Database size={15} className="text-amber-500 shrink-0 mt-0.5" />}
                        <div className="min-w-0">
                            <p className="text-sm text-gray-800">{m.label}</p>
                            <p className="text-xs text-gray-400">
                                {m.ready ? m.detail : <code className="text-amber-700">{m.sql}</code>}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
};
