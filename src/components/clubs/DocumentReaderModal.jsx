import React, { useState } from 'react';
import { Printer, History } from 'lucide-react';
import Modal from '../common/Modal';

const formatWhen = (iso) => iso ? new Date(iso).toLocaleString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

// HUJJATNI "O'QIYDIGAN" KO'RINISHDA KO'RSATISH.
//
// Klub hujjatlari jadvalidagi ko'zcha shu oynani ochadi. Faqat platforma
// O'ZI yaratgan matn-asosli hujjatlar uchun (nizom, yillik reja) - ular
// fayl emas, `jsonb` da saqlangan matn, shuning uchun ko'rsatish uchun
// ALOHIDA fayl ochish emas, shu joyning o'zida formatlangan holda
// o'qiladigan qilib chizish kerak. Qo'lda yuklangan haqiqiy fayllar bu
// oynadan o'tmaydi - ular imzolangan havola orqali to'g'ridan-to'g'ri
// yangi tabda ochiladi (brauzerning o'z PDF/rasm ko'ruvchisi).
//
// `sections` - nizom kabi band-band hujjat uchun: [{ title, content }].
// `text` - yillik reja kabi bitta uzluksiz matn uchun.
// `history` - o'tgan tahrirlar ro'yxati (faqat nizom uchun bo'ladi). Bu yer
// HAMMAGA ochiq ko'rinish - shuning uchun tahrir tarixi ham shu yerda,
// admin ekranidagi bilan bir xil (ClubRegulationEditor.jsx).
const DocumentReaderModal = ({ isOpen, onClose, title, subtitle, sections = null, text = null, history = [], isAdmin = false }) => {
    const [viewedVersion, setViewedVersion] = useState(null);
    const shownSections = viewedVersion !== null ? (history[viewedVersion]?.sections || []) : sections;
    // Amaldagi ko'rinishda ESKI MATN band ichida ko'rinmaydi (avval shunday
    // edi - yangi va eski matn bitta paragrafda aralashib qolardi). O'rniga
    // faqat O'ZGARGAN bandlarning ostida kichik "Oldingi tahrir" havolasi
    // chiqadi - bosilganda O'SHA BANDNING eski matni ochiladi/yopiladi.
    // Solishtirish ENG SO'NGGI tarix yozuviga nisbatan (eng yaqin o'zgarish).
    const latestHistory = history.length > 0 ? history[history.length - 1] : null;
    // FAQAT ADMIN uchun - ClubRegulationEditor.jsx dagi bilan bir xil hisob.
    const originalSections = history.length > 0 ? history[0].sections : null;
    const changedBandsCount = originalSections
        ? (sections || []).filter(s => {
            const orig = originalSections.find(o => o.key === s.key);
            return !orig || (orig.content || '') !== (s.content || '');
        }).length
        : 0;
    const [expandedKeys, setExpandedKeys] = useState(() => new Set());
    const toggleOld = (key) => setExpandedKeys(prev => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
    });

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="space-y-4">
                {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}

                {history.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="flex items-center gap-1 text-[11px] font-bold text-gray-400 uppercase">
                            <History size={12} /> Tahrir tarixi:
                        </span>
                        <button
                            type="button" onClick={() => setViewedVersion(null)}
                            className={`text-xs font-bold underline-offset-2 ${viewedVersion === null ? 'text-emerald-600 underline' : 'text-emerald-500 hover:text-emerald-600 hover:underline'}`}
                        >
                            Amaldagi versiya
                        </button>
                        {history.map((h, i) => (
                            <button
                                key={i} type="button" onClick={() => setViewedVersion(i)}
                                title={formatWhen(h.savedAt)}
                                className={`text-xs font-bold underline-offset-2 ${viewedVersion === i ? 'text-red-600 underline' : 'text-red-400 hover:text-red-600 hover:underline'}`}
                            >
                                {i + 1}-tahrir
                            </button>
                        ))}
                    </div>
                )}
                {/* FAQAT ADMINGA - talaba/tashqi ko'ruvchi ko'rmaydi. */}
                {isAdmin && history.length > 0 && (
                    <p className="text-[11px] text-gray-400">
                        Faqat administratorga: dastlabki tasdiqlangan holatga nisbatan{' '}
                        <b className="text-gray-600">{changedBandsCount} ta band</b>da o'zgartirish/qo'shimcha kiritilgan,
                        jami <b className="text-gray-600">{history.length} marta</b> saqlangan.
                    </p>
                )}
                {viewedVersion !== null && (
                    <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                        {viewedVersion + 1}-tahrir ({formatWhen(history[viewedVersion]?.savedAt)}) ko'rsatilmoqda.
                    </p>
                )}

                <div
                    className="bg-white border border-gray-100 rounded-2xl p-6 max-h-[60vh] overflow-y-auto"
                    style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                >
                    {shownSections && shownSections.map((s, i) => {
                        const oldSection = viewedVersion === null
                            ? latestHistory?.sections?.find(h => h.key === s.key)
                            : null;
                        const hasOlderVersion = oldSection && (oldSection.content || '') !== (s.content || '');
                        return (
                            <div key={i} className="mb-5 last:mb-0">
                                <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-1.5">
                                    {i + 1}. {s.title || 'Nomsiz band'}
                                </h4>
                                <p className="text-[15px] text-gray-700 leading-relaxed whitespace-pre-wrap">
                                    {s.content?.trim() || <span className="text-gray-300 italic">bo'sh</span>}
                                </p>
                                {hasOlderVersion && (
                                    <>
                                        <button
                                            type="button" onClick={() => toggleOld(s.key)}
                                            className="text-[11px] font-semibold text-gray-400 hover:text-red-500 underline underline-offset-2 mt-1"
                                            style={{ fontFamily: 'inherit' }}
                                        >
                                            Oldingi tahrir
                                        </button>
                                        {expandedKeys.has(s.key) && (
                                            <p className="text-[13px] text-red-600/80 leading-relaxed whitespace-pre-wrap mt-1.5 pl-3 border-l-2 border-red-200">
                                                {oldSection.content?.trim() || <span className="italic text-red-300">bo'sh</span>}
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })}
                    {text && viewedVersion === null && (
                        <p className="text-[15px] text-gray-700 leading-relaxed whitespace-pre-wrap">{text}</p>
                    )}
                    {!shownSections && !text && (
                        <p className="text-sm text-gray-400 italic">Mazmun kiritilmagan.</p>
                    )}
                </div>

                <button
                    type="button" onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                    <Printer size={14} /> Chop etish / PDF
                </button>
            </div>
        </Modal>
    );
};

export default DocumentReaderModal;
