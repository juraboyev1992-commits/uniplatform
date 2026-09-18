import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Target } from 'lucide-react';
import Card from '../common/Card';

// ===========================================================================
// "SIZ UCHUN ENG FOYDALI QADAMLAR"
//
// Hisob `utils/opportunityMatching.js: suggestNextSteps()` da - bu yerda
// faqat ko'rsatish. Chaqiruvchi `steps` ni O'ZI beradi: `OpportunitiesPage`
// da moslik allaqachon hisoblangan bo'ladi va uni ikkinchi marta
// hisoblash bekor ish bo'lardi.
//
// NEGA ALOHIDA KOMPONENT: bu blok ilgari faqat `OpportunitiesPage` ichida,
// "Yutuq va imkoniyatlar" bo'limining TAB OSTIDA turardi. Talaba uni
// ko'rishi uchun bo'limga kirib, kerakli tabni topishi kerak edi - ya'ni
// platformadagi eng kuchli "nima qilsam foydali" javobi ko'milib yotardi.
// Endi u bosh sahifada ham chiziladi. JSX ni nusxalash o'rniga komponentga
// chiqarildi: ikki nusxa vaqt o'tib bir-biridan chetga chiqib ketardi.
//
// `compact` - bosh sahifa uchun: joy kamroq, matn qisqaroq va oxirida
// to'liq bo'limga havola.
const NextStepsCard = ({ steps = [], compact = false, to = '/student/achievements' }) => {
    // Qadam yo'q bo'lsa HECH NARSA chizilmaydi. Bo'sh karta "sizga hech
    // narsa kerak emas" degan yolg'on taassurot berardi - aslida bu
    // "hamma mezon bajarilgan" yoki "ma'lumot yetarli emas" degani
    // bo'lishi mumkin, va ikkalasi ham bosh sahifada joy egallashga
    // arzimaydi.
    if (!steps.length) return null;

    return (
        <Card className="border-l-4 border-l-teal-600">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1 flex items-center gap-1.5">
                        <Target size={12} className="text-teal-600" /> Siz uchun eng foydali qadamlar
                    </p>
                    <p className="text-xs text-gray-500 mb-3">
                        Bitta harakat bir nechta imkoniyatni ochadi.
                    </p>
                </div>
                {compact && (
                    <Link
                        to={to}
                        className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900"
                    >
                        Hammasi <ArrowRight size={13} />
                    </Link>
                )}
            </div>

            <ol className="space-y-2.5">
                {steps.map((s, i) => (
                    <li key={s.key} className="flex items-start gap-3">
                        <span className="w-6 h-6 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center text-xs font-black flex-shrink-0">
                            {i + 1}
                        </span>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900">
                                {s.label}
                                {s.maxRemaining > 0 && (
                                    <span className="text-gray-500 font-medium">
                                        {' '}— yana {Math.ceil(s.maxRemaining)} {s.unit}
                                    </span>
                                )}
                            </p>
                            <p className="text-[11px] text-gray-500">
                                {s.unlocks} ta imkoniyatga ta'sir qiladi
                                {s.avgGain > 0 && ` · o'rtacha +${s.avgGain}%`}
                            </p>
                        </div>
                    </li>
                ))}
            </ol>
        </Card>
    );
};

export default NextStepsCard;
