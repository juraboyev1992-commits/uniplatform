import React, { useState } from 'react';
import { Info, ChevronDown } from 'lucide-react';
import { TAS_DIMENSIONS, TAS_MAX_TOTAL, GPA_MAX, buildTasDimensionDetail } from '../../utils/studentScoring';

// TAS kartochkasining ikkita bloki — "Skoring tarkibi" va "Skoring manbalari". Ikkala ekranda
// (admin panelidagi talaba kartochkasi va talabaning o'z profili) bir xil ko'rinishi shart,
// ayniqsa "ma'lumot yo'q" holati: bitta ekranda "—", boshqasida "0" chiqsa, xuddi shu talaba
// haqida ikki xil xulosa chiqadi. Shuning uchun qatorlar shu yerda, bitta joyda chiziladi.
//
// Har bir qator ikki narsani beradi:
//   (i) belgisi   - "bu ko'rsatkich nimani o'lchaydi" degan qisqa ta'rif (sichqoncha ustiga
//                   kelganda ham chiqadi, ochilgan tafsilotda ham yoziladi);
//   qator ustiga bosish - ball QAYERDAN chiqqani: manba jadvali, oraliq qiymatlar va yakuniy
//                   amal. Maqsad - foydalanuvchi raqamni qo'lda qayta hisoblay olsin.
//
// Tashqi ramka (fon, burchak, chegara) chaqiruvchi ekranda qoladi — ikkalasining dizayni
// boshqacha, faqat ichki mazmun umumiy.

const pct = (value, max) => Math.min(100, Math.round((value / max) * 100));

// Bitta o'lchov qatori. `value === null` - o'lchanmagan: shkala bo'sh qoladi va raqam o'rniga
// sabab yoziladi. Nolinchi shkala ko'rsatib qo'yish "0 ball oldi" degan xato ma'no beradi.
const DimensionRow = ({ tas, dimension }) => {
    const [open, setOpen] = useState(false);
    const value = tas[dimension.field];
    const detail = open ? buildTasDimensionDetail(tas, dimension.key) : null;

    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className="w-full text-left group"
                title="Ball qanday hisoblanganini ko'rish uchun bosing"
            >
                <div className="flex items-center justify-between text-xs mb-1 gap-2">
                    <span className="flex items-center gap-1.5 text-gray-600 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${value == null ? 'bg-gray-300' : dimension.dot}`} />
                        <span className="truncate group-hover:text-gray-900">{dimension.label}</span>
                        {/* Izoh `span` da, `Info` ikonkasida emas: lucide qo'shimcha proplarni
                            <svg> ga atribut qilib beradi, SVG esa `title` ATRIBUTIni tooltip qilib
                            ko'rsatmaydi (unga <title> BOLA elementi kerak). O'rab qo'yilgan span
                            esa brauzerning odatiy izohini beradi. Telefonda tooltip yo'q - shuning
                            uchun ayni matn ochilgan tafsilotda ham takrorlanadi. */}
                        <span className="shrink-0 inline-flex" title={dimension.info}>
                            <Info size={12} className="text-gray-400" />
                        </span>
                        <ChevronDown
                            size={12}
                            className={`text-gray-300 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                        />
                    </span>
                    {value == null ? (
                        <span className="text-[11px] text-gray-400 font-semibold shrink-0">Ma'lumot yo'q</span>
                    ) : (
                        <span className="font-bold text-gray-800 shrink-0 tabular-nums">
                            {value} / {dimension.max} ({pct(value, dimension.max)}%)
                        </span>
                    )}
                </div>
                <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    {value == null
                        ? <div className="h-full w-full bg-[repeating-linear-gradient(45deg,#e5e7eb,#e5e7eb_4px,#f3f4f6_4px,#f3f4f6_8px)]" />
                        : <div className={`h-full rounded-full ${dimension.dot}`} style={{ width: `${pct(value, dimension.max)}%` }} />}
                </div>
            </button>

            {open && detail && (
                <div className="mt-2 mb-1 rounded-xl bg-white border border-gray-200 p-3">
                    <p className="text-[11px] text-gray-600 leading-relaxed">{detail.info}</p>
                    <p className="text-[11px] font-mono text-indigo-700 bg-indigo-50 rounded-lg px-2 py-1 mt-2 inline-block">
                        {detail.formula}
                    </p>
                    <div className="mt-2 space-y-1">
                        {detail.steps.map((step, i) => (
                            <div key={i} className="flex items-start justify-between gap-3 text-[11px]">
                                <span className="text-gray-400 shrink-0">{step.label}</span>
                                {step.value == null
                                    ? <span className="text-gray-300">—</span>
                                    : <span className="text-gray-800 font-semibold text-right">{step.value}</span>}
                            </div>
                        ))}
                    </div>
                    {detail.missing && (
                        <p className="text-[11px] text-amber-600 font-semibold mt-2 pt-2 border-t border-gray-100">
                            {detail.missing}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export const TasBreakdownRows = ({ tas }) => {
    const [totalOpen, setTotalOpen] = useState(false);
    // Yakuniy ball qanday qo'shilgani: faqat HISOBLANGAN o'lchovlar qo'shiladi, hisoblanmagani
    // qo'shiluvdan tushib qoladi (nol sifatida emas) - shuning uchun ular alohida ko'rsatiladi.
    const measured = TAS_DIMENSIONS.filter(d => tas[d.field] != null);
    const skipped = TAS_DIMENSIONS.filter(d => tas[d.field] == null);

    return (
        <>
            <div className="space-y-3">
                {TAS_DIMENSIONS.map(d => (
                    <DimensionRow key={d.key} tas={tas} dimension={d} />
                ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
                Ball qanday chiqqanini ko'rish uchun qator yoki jami ball ustiga bosing.
            </p>
            <div className="mt-2">
                <button
                    type="button"
                    onClick={() => setTotalOpen(o => !o)}
                    aria-expanded={totalOpen}
                    className="w-full flex items-center justify-end gap-1 text-xs font-bold text-indigo-700 tabular-nums hover:text-indigo-900"
                    title="Yakuniy ball qanday yig'ilganini ko'rish uchun bosing"
                >
                    Jami: {tas.total} / {TAS_MAX_TOTAL}
                    <ChevronDown size={12} className={`transition-transform ${totalOpen ? 'rotate-180' : ''}`} />
                </button>

                {totalOpen && (
                    <div className="mt-2 rounded-xl bg-white border border-gray-200 p-3 text-left">
                        <p className="text-[11px] text-gray-600 leading-relaxed">
                            Yakuniy ball to'rtta o'lchovning yig'indisi. Har bir o'lchov o'z manbasidan
                            alohida hisoblanadi va o'z maksimumidan oshmaydi.
                        </p>
                        <div className="mt-2 space-y-1">
                            {measured.map(d => (
                                <div key={d.key} className="flex items-center justify-between gap-3 text-[11px]">
                                    <span className="text-gray-500 truncate">{d.label}</span>
                                    <span className="text-gray-800 font-semibold tabular-nums shrink-0">
                                        {tas[d.field]} / {d.max}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <p className="text-[11px] font-mono text-indigo-700 bg-indigo-50 rounded-lg px-2 py-1 mt-2">
                            {measured.length > 0
                                ? `${measured.map(d => tas[d.field]).join(' + ')} = ${tas.total}`
                                : 'Hali birorta o\'lchov hisoblanmagan'}
                        </p>
                        {skipped.length > 0 && (
                            <p className="text-[11px] text-amber-600 mt-2 pt-2 border-t border-gray-100">
                                Qo'shiluvga kirmadi (ma'lumot yo'q): {skipped.map(d => d.label).join(', ')}.
                                Shu sababli jami ball {tas.measuredMax} balldan hisoblangan, {TAS_MAX_TOTAL} dan emas.
                            </p>
                        )}
                    </div>
                )}

                {/* To'liq bo'lmagan hisobni jim o'tkazib yubormaymiz: 400 ball to'rt o'lchovdan
                    to'rttasi hisoblanganda va ikkitasi hisoblanganda butunlay boshqa ma'no beradi. */}
                {!tas.complete && (
                    <p className="text-[11px] text-amber-600 font-semibold mt-0.5 text-right">
                        {tas.dimensionCount} o'lchovdan {tas.measuredCount} tasi hisoblandi
                        {tas.measuredMax > 0 ? ` (${tas.measuredMax} balldan)` : ''}
                    </p>
                )}
            </div>
        </>
    );
};

// "Skoring manbalari" — har bir o'lchov qaysi haqiqiy yozuvdan chiqqani. Ilgari bu joyda 6 oylik
// "Skor dinamikasi" grafigi turardi, lekin TAS suratlari saqlanmagani uchun u chiziq oxirgi
// baldan orqaga qarab O'YLAB TOPILARDI. Grafik o'rniga tekshirsa bo'ladigan manba ro'yxati:
// "365/400" raqamining qayerdan kelgani ko'rinib turadi.
export const TasSourceList = ({ tas }) => {
    const s = tas.sources;
    const rows = [
        {
            label: 'Akademik',
            value: s.averageGpa == null ? null : `O'rtacha GPA ${s.averageGpa} / ${GPA_MAX}`,
            missing: "GPA kiritilmagan (HEMIS yoki qo'lda)"
        },
        {
            label: 'Ijtimoiy faollik',
            value: s.criteriaMax > 0
                ? `Rasmiy indeks ${s.socialIndexTotal} / ${s.socialIndexMax} · ${s.socialCriteriaTotal} mezondan ${s.socialCriteriaScored} tasi`
                : null,
            missing: 'Rasmiy indeksning ijtimoiy mezonlari hali hisoblanmagan'
        },
        {
            label: 'Liderlik',
            value: `${s.activePositions} ta faol klub lavozimi`,
            missing: null
        },
        {
            label: 'Ishonchlilik',
            value: s.attendanceMarked > 0
                ? `${s.attendanceRate}% davomat · ${s.attendanceMarked} ta belgidan ${s.attendancePresent} tasi`
                : null,
            missing: 'Davomat hali belgilanmagan'
        }
    ];

    return (
        <div className="space-y-2">
            {rows.map(r => (
                <div key={r.label} className="flex items-start justify-between gap-3 text-xs">
                    <span className="text-gray-500 shrink-0">{r.label}</span>
                    {r.value == null
                        ? <span className="text-gray-400 text-right">{r.missing}</span>
                        : <span className="font-semibold text-gray-800 text-right">{r.value}</span>}
                </div>
            ))}
        </div>
    );
};
