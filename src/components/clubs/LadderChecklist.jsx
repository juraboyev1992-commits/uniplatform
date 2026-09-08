import React from 'react';
import { Check, X, Info } from 'lucide-react';

// Zinapoya talablari ro'yxati. Ikki tomonga ham AYNI ko'rinishda ko'rsatiladi:
// talabaga "nima qilsam ko'tarilaman", koordinatorga "bu nomzod qanday".
//
// ATAYLAB "ruxsat berilmadi" demaydi. Talab bajarilmagani arizani to'xtatmaydi -
// qarorni koordinator yoki admin qabul qiladi. Shuning uchun rang qizil emas,
// SARIQ: bu taqiq emas, ma'lumot.
export const LadderChecklist = ({ rows, meetsAll, audience = 'student' }) => {
    if (!rows || rows.length === 0) return null;

    return (
        <div className={`rounded-xl border p-3 ${meetsAll ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <p className={`text-xs font-bold ${meetsAll ? 'text-emerald-800' : 'text-amber-800'}`}>
                {meetsAll
                    ? 'Talablarga to\'liq javob beradi'
                    : audience === 'student'
                        ? "Ba'zi talablar hali bajarilmagan"
                        : "Nomzod ba'zi talablarga javob bermaydi"}
            </p>

            <div className="mt-2 space-y-1.5">
                {rows.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px]">
                        {r.ok
                            ? <Check size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                            : <X size={13} className="text-amber-600 shrink-0 mt-0.5" />}
                        <div className="min-w-0 flex-1">
                            <span className="text-gray-700">{r.label}: </span>
                            {/* Joriy va kerakli qiymat YONMA-YON - "yetmadi" deyish
                                yetarli emas, qancha yetmagani ko'rinishi kerak. */}
                            <span className={`font-bold ${r.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                                {r.current}
                            </span>
                            <span className="text-gray-400"> / kerak: {r.required}</span>
                            {r.note && <p className="text-gray-500 mt-0.5">{r.note}</p>}
                        </div>
                    </div>
                ))}
            </div>

            <p className="text-[11px] text-gray-500 mt-2 pt-2 border-t border-black/5 flex items-start gap-1.5">
                <Info size={12} className="shrink-0 mt-0.5" />
                {audience === 'student'
                    ? "Talab bajarilmagan bo'lsa ham ariza yuborishingiz mumkin — qarorni koordinator qabul qiladi."
                    : 'Bu ko\'rsatkichlar qaror emas, ma\'lumot. Tasdiqlash sizning ixtiyoringizda.'}
            </p>
        </div>
    );
};

export default LadderChecklist;
