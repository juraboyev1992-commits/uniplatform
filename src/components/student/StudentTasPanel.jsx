import React, { useMemo, useRef } from 'react';
import { Trophy, UserCheck } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import ScoreCardExport from '../common/ScoreCardExport';
import TasVerificationFooter from '../common/TasVerificationFooter';
import { TasBreakdownRows, TasSourceList } from '../common/TasBreakdown';
import { db } from '../../services/db';
import { computeStudentTAS, TAS_TIERS, TAS_MAX_TOTAL } from '../../utils/studentScoring';

// Talabaning o'z skoringi (TAS). Ilgari bu blok to'g'ridan-to'g'ri "Mening profilim"
// sahifasining ichida yozilgan edi — ya'ni talabaning eng muhim raqami ism, telefon va
// bildirishnoma sozlamalari orasida, menyuda ko'rinmaydigan joyda turardi. Endi u alohida
// komponent: "Ijtimoiy faollik va skoring" bo'limining o'z tabida chiziladi, profil esa
// faqat shaxsiy ma'lumot uchun qoladi.
//
// Admin panelidagi talaba kartochkasi ham AYNAN shu hisobni (computeStudentTAS) va shu
// ko'rinish bloklarini (TasBreakdownRows / TasSourceList) ishlatadi, shuning uchun talaba
// va admin bir xil raqamni bir xil izoh bilan ko'radi.
const StudentTasPanel = ({ studentId, displayName }) => {
    const tas = useMemo(() => (studentId ? computeStudentTAS(db, studentId) : null), [studentId]);
    const skoringRef = useRef(null);

    if (!tas) return null;

    return (
        <div className="space-y-4" ref={skoringRef}>
            <div className="flex items-center justify-between" data-html2canvas-ignore="true">
                <h3 className="text-lg font-bold text-gray-900">Skoring</h3>
                <ScoreCardExport
                    contentRef={skoringRef}
                    fileName={`${displayName || studentId}_TAS_hisobot`}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-5 text-white flex items-center gap-5 shadow-lg">
                    <div className="relative w-28 h-28 shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={[{ value: tas.total }, { value: Math.max(0, TAS_MAX_TOTAL - tas.total) }]}
                                    dataKey="value" startAngle={90} endAngle={-270}
                                    innerRadius={38} outerRadius={50} stroke="none"
                                >
                                    <Cell fill="#ffffff" />
                                    <Cell fill="rgba(255,255,255,0.2)" />
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-xl font-black">{tas.total}</span>
                            <span className="text-[10px] text-white/70 font-bold">/ {TAS_MAX_TOTAL}</span>
                        </div>
                    </div>
                    <div className="min-w-0">
                        <h4 className="font-bold text-sm">Talaba Analitik Skoring (TAS)</h4>
                        <p className="text-xs text-white/70 mt-1 leading-relaxed">
                            TAS — talabaning akademik muvaffaqiyati, ijtimoiy faolligi, liderlik salohiyati va intizomiy ishonchliligini kompleks baholaydigan analitik ko'rsatkich.
                        </p>
                        {/* "O'tgan oyga nisbatan" belgisi olib tashlandi: oldingi oyning bali
                            hech qayerda saqlanmaydi, shuning uchun u sun'iy chiziqdan
                            hisoblanardi. O'rniga hisobning to'liqligi ko'rsatiladi. */}
                        <span className={`inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full text-[11px] font-bold ${tas.complete ? 'bg-emerald-400/90 text-emerald-950' : 'bg-amber-300/90 text-amber-950'}`}>
                            {tas.complete
                                ? "To'rt o'lchov ham hisoblandi"
                                : `${tas.dimensionCount} o'lchovdan ${tas.measuredCount} tasi hisoblandi`}
                        </span>
                    </div>
                </div>

                <div className="bg-white/80 rounded-3xl p-5 border border-gray-100">
                    <p className="text-xs font-bold text-gray-700 mb-2">Skor tarkibi</p>
                    <TasBreakdownRows tas={tas} />
                </div>
            </div>

            {/* Ilgari bu joyda "Skor dinamikasi (so'nggi 6 oy)" grafigi turardi. Ball
                suratlari (snapshot) saqlanmagani uchun oldingi oylarning bali ma'lum emas
                edi — chiziq oxirgi baldan orqaga qarab o'ylab topilardi. O'rniga har bir
                o'lchov qaysi yozuvdan chiqqani ko'rsatiladi: talaba o'z balini tekshira
                oladi va nima yetishmayotganini ko'radi. */}
            <div className="bg-white/80 rounded-3xl p-5 border border-gray-100">
                <p className="text-xs font-bold text-gray-700 mb-3">Skor manbalari</p>
                <TasSourceList tas={tas} />
                {tas.pending.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-[11px] font-bold text-amber-600 mb-1">Hisoblanmagan o'lchovlar</p>
                        {tas.pending.map(p => (
                            <p key={p.key} className="text-[11px] text-gray-500">{p.label} — {p.missing}</p>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white/80 rounded-3xl p-5 border border-gray-100">
                    <p className="text-xs font-bold text-gray-700 mb-3 flex items-center gap-1.5"><Trophy size={13} className="text-amber-500" /> Reyting darajalari</p>
                    <div className="space-y-1.5">
                        {TAS_TIERS.map(t => (
                            <div
                                key={t.label}
                                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs ${tas.tier === t.label ? 'bg-indigo-50 border border-indigo-200 font-bold text-indigo-700' : 'text-gray-500'}`}
                            >
                                <span>{t.label}</span>
                                <span>{t.range}</span>
                            </div>
                        ))}
                    </div>
                    {!tas.complete && (
                        <p className="text-[11px] text-amber-600 mt-2">
                            Daraja hali belgilanmadi — barcha o'lchovlar hisoblanishi kerak.
                        </p>
                    )}
                </div>

                {tas.recommendations.length > 0 && (
                    <div className="bg-indigo-50 rounded-3xl p-5" data-html2canvas-ignore="true">
                        <p className="text-xs font-bold text-indigo-700 mb-3">Rivojlanish tavsiyalari</p>
                        <div className="space-y-2">
                            {tas.recommendations.map((r, i) => (
                                <div key={i} className="flex items-start gap-2.5 bg-white rounded-xl p-3">
                                    <UserCheck size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-800">{r.text}</p>
                                        <p className="text-[11px] text-gray-500 mt-0.5">{r.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-white/80 rounded-3xl p-5 border border-gray-100">
                <p className="text-xs font-bold text-gray-700 mb-3">Faoliyat tarixi</p>
                {tas.activityHistory.length === 0 ? (
                    <p className="text-xs text-gray-400">Tasdiqlangan faoliyat topilmadi</p>
                ) : (
                    <div className="space-y-3">
                        {tas.activityHistory.map((h, i) => (
                            <div key={i} className="relative pl-4 border-l-2 border-indigo-100 flex items-center justify-between gap-2">
                                <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-indigo-500" />
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-gray-800 truncate">{h.title}</p>
                                    <p className="text-[10px] text-gray-400">{new Date(h.date).toLocaleDateString('uz-UZ')}</p>
                                </div>
                                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">+{h.delta}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <TasVerificationFooter verifyId={`TAS-${studentId}`} />
        </div>
    );
};

export default StudentTasPanel;
