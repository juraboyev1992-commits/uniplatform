import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Target, ArrowRight, Lock } from 'lucide-react';
import { db } from '../../services/db';
import { OPPORTUNITY_KINDS } from '../../config/opportunities';
import { buildStudentEligibilityProfile } from '../../utils/scholarshipEligibility';
import { matchOpportunitiesForStudent } from '../../utils/opportunityMatching';

// CV SAHIFASIDAGI "IMKONIYATLARGA MOSLIK" BLOKI.
//
// NEGA YANGI ENGINE YOZILMADI: moslik `utils/opportunityMatching.js` da
// allaqachon hisoblanadi va u ehtiyotkor - talab belgilanmagan imkoniyatda
// foiz bermaydi, `null` qaytaradi ("100% ko'rsatish yolg'on bo'lardi").
// Bu yerda o'sha natijaning eng yuqori uchtasi ko'rsatiladi, xolos.
//
// NEGA FAQAT FOIZ EMAS: quruq "87%" talabaga nima qilishni aytmaydi.
// Shuning uchun har qatorda eng katta YETISHMOVCHILIK ham chiqadi -
// "Yana 0.3 ball kerak". Raqam ham, sabab ham e'lon qilingan talabga
// bog'lanadi, ya'ni tekshirib bo'ladi.

const FitBar = ({ percent }) => (
    <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
            className={`h-full rounded-full ${
                percent >= 90 ? 'bg-emerald-500' : percent >= 60 ? 'bg-teal-500' : 'bg-amber-400'
            }`}
            style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
    </div>
);

const CvOpportunityMatch = ({ studentId, version = 0 }) => {
    const top = useMemo(() => {
        if (!studentId) return [];
        const eligibilityProfile = buildStudentEligibilityProfile(db, studentId);
        if (!eligibilityProfile) return [];
        const declared = db.getTalentProfile?.(studentId)?.declared || {};
        const matched = matchOpportunitiesForStudent(db, studentId, { eligibilityProfile, declared });
        // `eligible` allaqachon ustuvorlik bo'yicha saralangan. Foizi
        // hisoblanmaganlar (talabi e'lon qilinmagan imkoniyatlar) bu blokka
        // tushmaydi - ular haqida aytadigan aniq gap yo'q.
        return (matched.eligible || []).filter(r => r.fit !== null).slice(0, 3);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId, version]);

    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <div>
                <h4 className="flex items-center gap-2 font-bold text-blue-950 text-sm">
                    <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-800 flex items-center justify-center shrink-0">
                        <Target size={13} />
                    </span>
                    Imkoniyatlarga moslik
                </h4>
                <p className="text-[11px] text-gray-400 mt-1">
                    E'lon qilingan talablar bo'yicha hisoblanadi — g'olib bo'lish ehtimoli emas
                </p>
            </div>

            {top.length === 0 ? (
                <p className="text-xs text-gray-400 leading-relaxed">
                    Hozircha foizi hisoblanadigan imkoniyat yo'q. U stipendiya, grant yoki
                    tanlov e'lon qilinib, unga talablar belgilanganda paydo bo'ladi.
                </p>
            ) : (
                <div className="space-y-3">
                    {top.map(r => {
                        const kind = OPPORTUNITY_KINDS[r.opportunity.kind];
                        // Eng katta yetishmovchilik: qolgan masofasi kattasi.
                        const gap = (r.gaps || [])
                            .filter(g => g.remaining > 0)
                            .sort((a, b) => (b.remaining / (b.target || 1)) - (a.remaining / (a.target || 1)))[0];
                        return (
                            <div key={r.opportunity.id} className="space-y-1.5">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-blue-950 leading-snug truncate">
                                            {r.opportunity.title}
                                        </p>
                                        {kind && (
                                            <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${kind.tone}`}>
                                                {kind.label}
                                            </span>
                                        )}
                                    </div>
                                    <span className={`text-lg font-black tabular-nums shrink-0 ${
                                        r.fit >= 90 ? 'text-emerald-600' : r.fit >= 60 ? 'text-teal-700' : 'text-gray-400'
                                    }`}>
                                        {r.fit}%
                                    </span>
                                </div>
                                <FitBar percent={r.fit} />
                                {gap && (
                                    <p className="text-[11px] text-gray-500">
                                        <span className="font-semibold text-gray-700">{gap.label}:</span>
                                        {' '}yana {Math.ceil(gap.remaining)} {gap.unit || ''} kerak
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <Link
                to="/student/achievements"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-800 hover:text-blue-900"
            >
                Barcha imkoniyatlar <ArrowRight size={14} />
            </Link>

            {/* KASB BO'YICHA MOSLIK - HALI ISHLAMAYDI.
                Maydon ataylab o'chirilgan holda turibdi: yozilgan matndan
                foiz chiqarish uchun o'sha kasb NIMANI talab qilishi haqida
                manba kerak, platformada esa vakansiya ma'lumotlari ham,
                ko'nikmalar taksonomiyasi ham yo'q. Ishlayotgandek ko'rsatib,
                o'ylab topilgan raqam berish - eng yomon variant. */}
            <div className="pt-3 border-t border-gray-100">
                <label className="block text-[11px] font-black text-gray-400 uppercase mb-1.5">
                    Kasb bo'yicha moslik
                </label>
                <div className="flex gap-2">
                    <input
                        type="text" disabled
                        placeholder="Masalan: huquqshunos, yurist-maslahatchi..."
                        className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
                    />
                    <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-400 text-xs font-bold shrink-0">
                        <Lock size={13} /> Tayyor emas
                    </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                    Bu bo'lim vakansiya platformalari bilan integratsiya qilinganda yoki kasb uchun
                    talab qilinadigan ko'nikmalar rasmiy ravishda kiritilganda ishlaydi. Shundan
                    keyin moslik yuqoridagi imkoniyatlar bilan bir xil usulda — e'lon qilingan
                    talabga solishtirib hisoblanadi.
                </p>
            </div>
        </div>
    );
};

export default CvOpportunityMatch;
