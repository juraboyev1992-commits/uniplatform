import React, { useMemo } from 'react';
import {
    ShieldCheck, GraduationCap, BarChart3, Users, Trophy, BookOpen,
    CalendarCheck, Info, Printer,
} from 'lucide-react';
import Card from '../common/Card';
import { db } from '../../services/db';
import { buildStudentPortfolio } from '../../utils/studentPortfolio';
import { INDEX_CRITERIA } from '../../config/socialActivityIndex';

// PORTFOLIO.
//
// Bu ko'rinish hech narsa TUZMAYDI - u platformadagi mavjud yozuvni bir
// joyga yig'adi (izohi utils/studentPortfolio.js da). Shu sababli har
// qatorning ortida tasdiqlangan manba turadi: ro'yxatga olish raqami bor
// hujjat, qulflangan davomat, tyutor tasdiqlagan baho.
//
// `null` NOL EMAS: GPA kiritilmagan bo'lsa "kiritilmagan" deb yoziladi.
// "0.0" deb ko'rsatish talabani past ko'rsatgan yolg'on bo'lardi.
const dash = (v, suffix = '') => (v === null || v === undefined ? null : `${v}${suffix}`);

const Stat = ({ icon: Icon, label, value, hint, missing }) => (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-3.5">
        <div className="flex items-center gap-1.5 text-gray-400 mb-1">
            <Icon size={13} />
            <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
        </div>
        {value === null ? (
            <>
                <p className="text-xl font-black text-gray-300">—</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{missing || "ma'lumot yo'q"}</p>
            </>
        ) : (
            <>
                <p className="text-xl font-black text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
                {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
            </>
        )}
    </div>
);

const PortfolioSummary = ({ studentId, version = 0 }) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const p = useMemo(() => buildStudentPortfolio(db, studentId), [studentId, version]);

    const topDocuments = p.documents.slice(0, 5);

    return (
        <div className="space-y-4">
            <Card>
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                    <div>
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <ShieldCheck size={17} className="text-emerald-600" /> Portfolio
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5 max-w-xl leading-relaxed">
                            Platformadagi yozuvingizdan avtomatik yig'ilgan. Har raqam ortida
                            tasdiqlangan manba turadi — siz hech narsa kiritmaysiz.
                        </p>
                    </div>
                    {/* Chop etish - brauzerning o'z imkoniyati. PDF yaratish
                        alohida kutubxona talab qiladi va u hali qo'shilmagan;
                        "yuklab olish" tugmasini ishlamaydigan holda qo'yish
                        yolg'on bo'lardi. */}
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                    >
                        <Printer size={14} /> Chop etish
                    </button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
                    <Stat
                        icon={GraduationCap} label="GPA"
                        value={dash(p.academic.gpa)}
                        hint={p.academic.gpaYear ? `${p.academic.gpaYear}, ${p.academic.gpaSemester}-semestr` : null}
                        missing="hali kiritilmagan"
                    />
                    <Stat
                        icon={BarChart3} label="Ijtimoiy faollik indeksi"
                        value={p.socialIndex.total === null ? null : `${p.socialIndex.total} / 100`}
                        hint={p.socialIndex.uncomputed > 0
                            ? `${p.socialIndex.uncomputed} ta mezon hali baholanmagan`
                            : null}
                        missing="hisoblanmagan"
                    />
                    <Stat
                        icon={Trophy} label="Rasmiy hujjatlar"
                        value={p.counts.documents}
                        hint={p.counts.prizes > 0 ? `${p.counts.prizes} tasi sovrinli o'rin` : 'sovrinli o\'rin yo\'q'}
                    />
                    <Stat
                        icon={Users} label="Klublar"
                        value={p.counts.clubs}
                        hint={p.counts.positions > 0 ? `${p.counts.positions} tasida lavozimda` : "a'zo"}
                    />
                    <Stat
                        icon={BookOpen} label="O'qilgan asarlar"
                        value={p.counts.books}
                        hint={`${p.counts.totalBooks} tadan`}
                    />
                    <Stat
                        icon={CalendarCheck} label="Ishtirok"
                        value={p.counts.attendance}
                        hint="tadbir va musobaqada"
                    />
                </div>
            </Card>

            {/* KLUBLAR VA LAVOZIMLAR */}
            {p.clubs.length > 0 && (
                <Card>
                    <h4 className="font-bold text-gray-900 mb-2.5">Klub faoliyati</h4>
                    <div className="space-y-1.5">
                        {p.clubs.map(c => (
                            <div key={c.clubId} className="flex items-center justify-between gap-3 py-1.5">
                                <p className="text-sm text-gray-800 truncate">{c.name}</p>
                                <p className="text-xs text-gray-500 shrink-0">
                                    {c.positions.length > 0 ? c.positions.join(', ') : "A'zo"}
                                </p>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* RASMIY HUJJATLAR - eng muhimi tepada */}
            {p.documents.length > 0 && (
                <Card>
                    <div className="flex items-center justify-between gap-3 mb-2.5">
                        <h4 className="font-bold text-gray-900">Rasmiy hujjatlar</h4>
                        <span className="text-[11px] text-gray-400">
                            {p.documents.length} ta · QR bilan tekshiriladi
                        </span>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {topDocuments.map(d => (
                            <div key={d.id} className="flex items-center gap-3 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-gray-900 truncate">{d.title}</p>
                                    <p className="text-[11px] text-gray-400 truncate">
                                        {d.typeLabel}
                                        {d.place ? ` · ${d.place}-o'rin` : ''}
                                        {d.date ? ` · ${new Date(d.date).toLocaleDateString('uz-UZ')}` : ''}
                                    </p>
                                </div>
                                {d.registrationNumber && (
                                    <span className="text-[10px] font-mono text-gray-400 shrink-0">
                                        {d.registrationNumber}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                    {p.documents.length > topDocuments.length && (
                        <p className="text-[11px] text-gray-400 mt-2">
                            Yana {p.documents.length - topDocuments.length} ta — to'liq ro'yxat quyida.
                        </p>
                    )}
                </Card>
            )}

            {p.documents.length === 0 && p.counts.clubs === 0 && (
                <p className="flex items-start gap-2 text-xs text-gray-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    <Info size={14} className="shrink-0 mt-px text-gray-400" />
                    <span>
                        Portfolio hali bo'sh. U klubga a'zo bo'lganingizda, tadbirda
                        qatnashganingizda va hujjat olganingizda <b>o'zi to'lib boradi</b> —
                        alohida to'ldirish kerak emas.
                    </span>
                </p>
            )}
        </div>
    );
};

export default PortfolioSummary;
