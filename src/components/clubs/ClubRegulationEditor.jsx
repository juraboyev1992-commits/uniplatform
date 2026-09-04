import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
    FileCheck, Printer, Save, Loader2, ShieldCheck, RotateCcw, Plus, Trash2, Pencil, X, History,
} from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { REGULATION_SECTIONS, REGULATION_STATUS, REGULATION_STATUS_LABELS } from '../../config/clubRegistration';

// KLUB NIZOMI (band 9).
//
// Bu HAM ariza sahifasida (applicationId bilan), HAM klub profilida (clubId
// bilan) ishlatiladi - ikkalasi ham bitta `club_regulations` yozuviga
// yoziladi (db.saveClubRegulation applicationId/clubId ni ajratadi). Shu
// sababli komponent ikkalasidan birini qabul qiladi, ikkalasini emas.
//
// BANDLAR RO'YXAT (ARRAY), OBYEKT EMAS.
//
// `REGULATION_SECTIONS` faqat BOSHLANG'ICH 11 bandning shabloni - yangi
// nizom shundan urug'lanadi. Lekin har klubning tuzilishi bir xil emas,
// shuning uchun talaba/admin o'ziga xos band QO'SHISHI va mavjud band
// NOMINI o'zgartirishi kerak. Buni obyekt shaklida (`{key: matn}`) qilib
// bo'lmaydi - kalitlar oldindan qat'iy bo'lishi kerak edi. Shuning uchun
// saqlash shakli RO'YXAT: `[{ key, title, content }, ...]`, tartib xuddi
// ko'rinadigan tartib.
//
// TASDIQLANGANDAN KEYINGI TAHRIR VA TARIX.
//
// Tasdiqlangan nizom ADMIN uchun butunlay qulflanmaydi (`canApprove`
// bo'lganlarga) - lekin shunchaki ustidan yozilmaydi. Har safar tasdiqlangan
// nizom o'zgartirilsa, ESKI matn `history` ga (o'tgan tahrirlar ro'yxati)
// qo'shiladi va O'CHIRILMAYDI. Har kim (talaba, koordinator, tashqi
// ko'ruvchi) kichik havolani bosib o'tgan tahrirlarni o'qiy oladi -
// bu talaba uchun ham, admin uchun ham BIR XIL ko'rinishda ishlaydi.
//
// PDF EKSPORT: alohida kutubxona qo'shilmadi - portfolio/hujjatlar bilan bir
// xil qaror (window.print), loyihada allaqachon qabul qilingan konventsiya.
const seedSections = () => REGULATION_SECTIONS.map(s => ({ key: s.key, title: s.title, content: '' }));

// Eski (obyekt) shakldan yoki bo'sh holatdan xavfsiz o'tish - hozircha
// hech qanday saqlangan nizom yo'q, lekin kelajakda ma'lumot shakli
// o'zgarib qolsa sahifa qulab tushmasin.
const normalizeSections = (raw) => {
    if (Array.isArray(raw) && raw.length > 0) return raw;
    if (raw && typeof raw === 'object' && Object.keys(raw).length > 0) {
        return REGULATION_SECTIONS.map(s => ({ key: s.key, title: s.title, content: raw[s.key] || '' }));
    }
    return seedSections();
};

const formatWhen = (iso) => iso ? new Date(iso).toLocaleString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

// `forwardRef` + `useImperativeHandle`: sehrgar (ClubApplicationCreatePage)
// "Keyingi" bosilganda ariza maydonlarini avtomatik saqlaydi, lekin nizom
// MUTLAQO BOSHQA yozuv (`club_regulations`) va bu komponent o'z holatini
// (`sections`) tashqariga chiqarmaydi. Ref orqali `save()` ni ochib
// qo'yish orqali sehrgar 3-bosqichdan chiqishdan oldin nizomni ham
// so'raladi - aks holda talaba "Saqlash" tugmasini bosmasdan "Keyingi"
// bossa, yozgan matni yo'qolib qolardi.
const ClubRegulationEditor = forwardRef(({ clubId = null, applicationId = null, canEdit = false, canApprove = false }, ref) => {
    const { user } = useAuth();
    const [regulation, setRegulation] = useState(() =>
        clubId ? db.getClubRegulation(clubId) : db.getApplicationRegulation(applicationId));
    const [sections, setSections] = useState(() => normalizeSections(regulation?.sections));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [savedAt, setSavedAt] = useState(null);
    // HAMMA BAND BIRGA TAHRIRLANADI/QULFLANADI - band-band emas. "Tahrirlash"
    // bosilganda hamma band ochiladi, "Saqlash" bosilganda hammasi birga
    // saqlanib qulflanadi. Erkin, doim ochiq tahrirlash EMAS - talaba
    // tasodifan band ustiga bosib matnni o'zgartirib qo'yishining oldi
    // olinadi, o'zgartirish faqat ATAYLAB "Tahrirlash" bosilganda boshlanadi.
    const [isEditing, setIsEditing] = useState(false);
    // `null` - joriy matn ko'rsatilmoqda. Raqam - o'tgan tahrirlardan
    // qaysi biri ko'rsatilmoqda (history massividagi indeks).
    const [viewedVersion, setViewedVersion] = useState(null);

    useEffect(() => {
        const r = clubId ? db.getClubRegulation(clubId) : db.getApplicationRegulation(applicationId);
        setRegulation(r);
        setSections(normalizeSections(r?.sections));
        setIsEditing(false);
        setViewedVersion(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clubId, applicationId]);

    const isApproved = regulation?.status === REGULATION_STATUS.APPROVED;
    const history = regulation?.history || [];
    // Admin (canApprove) tasdiqlangandan keyin ham tahrirlay oladi - talaba
    // (faqat canEdit) esa yo'q, RLS ham buni orqadan qat'iy cheklaydi
    // (supabase/club_registration.sql: club_regulations_upsert).
    const canToggleEdit = (canEdit && !isApproved) || (canApprove && isApproved);

    const isViewingHistory = viewedVersion !== null;
    const displaySections = isViewingHistory ? (history[viewedVersion]?.sections || []) : sections;
    // O'zgargan bandning ostida kichik "Oldingi tahrir" havolasi (o'qish
    // holatida, ya'ni tahrirlanmayotganda) - DocumentReaderModal.jsx bilan
    // bir xil naqsh, izohi o'sha yerda.
    const latestHistory = history.length > 0 ? history[history.length - 1] : null;
    // FAQAT ADMIN uchun kichik statistika: dastlabki (tasdiqlangan) versiyaga
    // nisbatan nechta band o'zgargan/qo'shilgan va jami nechta marta
    // saqlangan. Talaba yoki tashqi ko'ruvchiga ko'rsatilmaydi - bu ichki
    // nazorat ma'lumoti, hujjatning o'zi emas.
    const originalSections = history.length > 0 ? history[0].sections : null;
    const changedBandsCount = originalSections
        ? sections.filter(s => {
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

    const filledCount = useMemo(
        () => sections.filter(s => String(s.content || '').trim()).length,
        [sections]
    );

    const setSectionContent = (idx, content) =>
        setSections(list => list.map((s, i) => (i === idx ? { ...s, content } : s)));

    const setSectionTitle = (idx, title) =>
        setSections(list => list.map((s, i) => (i === idx ? { ...s, title } : s)));

    const addSection = () =>
        setSections(list => [...list, { key: 'custom_' + Date.now().toString(36), title: '', content: '' }]);

    const removeSection = (idx) =>
        setSections(list => list.filter((_, i) => i !== idx));

    const save = async () => {
        setBusy(true); setError('');
        try {
            const rec = await db.saveClubRegulation({
                regulationId: regulation?.id || null, clubId, applicationId, sections,
                allowApprovedEdit: isApproved, savedBy: user?.username,
            });
            setRegulation(rec);
            setSavedAt(new Date());
            setIsEditing(false);
            return rec;
        } catch (e) {
            setError(e?.message || 'Saqlashda xatolik yuz berdi.');
            throw e;
        } finally {
            setBusy(false);
        }
    };

    // Tahrirlashni bekor qilish - oxirgi SAQLANGAN holatga qaytaradi,
    // ekrandagi yozilmagan o'zgarishlar tashlab yuboriladi.
    const cancelEdit = () => {
        setSections(normalizeSections(regulation?.sections));
        setError('');
        setIsEditing(false);
    };

    // Bo'sh nizomni saqlash uchun majburlamaydi - talaba hali birorta band
    // yozmagan bo'lsa, sehrgar "Keyingi" bosganda xato ko'rsatib to'xtatib
    // qo'ymasligi kerak. Faqat HAQIQATAN o'zgargan (kamida bitta band
    // to'ldirilgan) holatda saqlanadi. Tahrirlash rejasida BO'LMASA ham
    // ishlaydi - sehrgar "Keyingi" bosganda joriy holatni saqlab qo'yishi
    // kerak, tahrirlash tugmasi bosilgan-bosilmaganidan qat'i nazar.
    useImperativeHandle(ref, () => ({
        save: async () => {
            if (!canEdit || isApproved) return;
            const hasContent = sections.some(s => String(s.content || '').trim());
            if (!hasContent && !regulation) return;
            await save();
        },
    }));

    const approve = async () => {
        if (!regulation) return;
        setBusy(true); setError('');
        try {
            const rec = await db.approveClubRegulation(regulation.id, user?.username);
            setRegulation(rec);
        } catch (e) {
            setError(e?.message || 'Tasdiqlashda xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    const requestRevision = async () => {
        if (!regulation) return;
        setBusy(true); setError('');
        try {
            const rec = await db.requestClubRegulationRevision(regulation.id);
            setRegulation(rec);
        } catch (e) {
            setError(e?.message || 'Xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                <div>
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <FileCheck size={17} className="text-indigo-600" /> Klub nizomi
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {filledCount} / {sections.length} band to'ldirilgan
                        {regulation && (
                            <> · <span className="font-semibold">{REGULATION_STATUS_LABELS[regulation.status]}</span></>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button" onClick={() => window.print()}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                    >
                        <Printer size={13} /> Chop etish
                    </button>
                    {canToggleEdit && !isViewingHistory && (
                        isEditing ? (
                            <>
                                <button
                                    type="button" onClick={cancelEdit} disabled={busy}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-500 hover:bg-gray-50"
                                >
                                    <X size={13} /> Bekor qilish
                                </button>
                                <Button variant="primary" size="sm" onClick={save} disabled={busy}>
                                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Saqlash
                                </Button>
                            </>
                        ) : (
                            <Button variant="primary" size="sm" onClick={() => setIsEditing(true)}>
                                <Pencil size={14} /> Tahrirlash
                            </Button>
                        )
                    )}
                </div>
            </div>

            {isApproved && !isViewingHistory && (
                <p className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mb-3">
                    <ShieldCheck size={14} />
                    {canToggleEdit
                        ? 'Bu nizom tasdiqlangan. Tahrirlasangiz, eski matn o\'chmaydi - tahrir tarixida saqlanadi.'
                        : "Bu nizom tasdiqlangan va endi to'g'ridan-to'g'ri tahrirlanmaydi."}
                </p>
            )}

            {/* TAHRIR TARIXI - kichik havolalar, HAMMAGA ko'rinadi (canEdit/
                canApprove'dan qat'i nazar). Faqat tasdiqlangandan keyin
                kamida bir marta tahrirlangan bo'lsa paydo bo'ladi. */}
            {history.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-4 pb-3 border-b border-gray-50">
                    <span className="flex items-center gap-1 text-[11px] font-bold text-gray-400 uppercase">
                        <History size={12} /> Tahrir tarixi:
                    </span>
                    <button
                        type="button" onClick={() => setViewedVersion(null)}
                        className={`text-xs font-bold underline-offset-2 ${!isViewingHistory ? 'text-emerald-600 underline' : 'text-emerald-500 hover:text-emerald-600 hover:underline'}`}
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
            {canApprove && history.length > 0 && (
                <p className="text-[11px] text-gray-400 mb-4 -mt-2.5">
                    Faqat administratorga: dastlabki tasdiqlangan holatga nisbatan{' '}
                    <b className="text-gray-600">{changedBandsCount} ta band</b>da o'zgartirish/qo'shimcha kiritilgan,
                    jami <b className="text-gray-600">{history.length} marta</b> saqlangan.
                </p>
            )}

            {isViewingHistory && (
                <p className="flex items-center justify-between gap-3 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4">
                    <span>
                        {viewedVersion + 1}-tahrir ko'rsatilmoqda ({formatWhen(history[viewedVersion]?.savedAt)}) - faqat o'qish uchun.
                    </span>
                    <button type="button" onClick={() => setViewedVersion(null)} className="underline shrink-0">
                        Joriy holatga qaytish
                    </button>
                </p>
            )}

            <div className="space-y-4">
                {displaySections.map((s, i) => {
                    const oldSection = (!isEditing && !isViewingHistory)
                        ? latestHistory?.sections?.find(h => h.key === s.key)
                        : null;
                    const hasOlderVersion = oldSection && (oldSection.content || '') !== (s.content || '');
                    return (
                    <div key={s.key} className="group">
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-black text-gray-400 shrink-0">{i + 1}.</span>
                            {isEditing && !isViewingHistory ? (
                                <input
                                    value={s.title}
                                    onChange={e => setSectionTitle(i, e.target.value)}
                                    placeholder="Band nomi"
                                    className="flex-1 min-w-0 text-xs font-black text-gray-600 uppercase bg-transparent border-b border-transparent hover:border-gray-200 focus:border-indigo-400 focus:outline-none py-0.5"
                                />
                            ) : (
                                <label className="text-xs font-black text-gray-500 uppercase">{s.title || 'Nomsiz band'}</label>
                            )}
                            {/* Faqat qo'shilgan (standart bo'lmagan) bandlarni o'chirish mumkin -
                                11 ta boshlang'ich band nizom tuzilmasining o'zagi, tasodifan
                                o'chirib qo'yish oson bo'lmasligi kerak. */}
                            {isEditing && !isViewingHistory && !REGULATION_SECTIONS.some(std => std.key === s.key) && (
                                <button
                                    type="button" onClick={() => removeSection(i)}
                                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity shrink-0"
                                    title="Bandni o'chirish"
                                >
                                    <Trash2 size={13} />
                                </button>
                            )}
                        </div>
                        <textarea
                            value={s.content}
                            onChange={e => setSectionContent(i, e.target.value)}
                            disabled={!isEditing || isViewingHistory}
                            rows={3}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm disabled:bg-gray-50 disabled:text-gray-500"
                            placeholder={`${s.title || 'Band'} bo'yicha matn...`}
                        />
                        {hasOlderVersion && (
                            <>
                                <button
                                    type="button" onClick={() => toggleOld(s.key)}
                                    className="text-[11px] font-semibold text-gray-400 hover:text-red-500 underline underline-offset-2 mt-1.5"
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
            </div>

            {isEditing && !isViewingHistory && (
                <button
                    type="button" onClick={addSection}
                    className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 mt-4"
                >
                    <Plus size={14} /> Band qo'shish
                </button>
            )}

            {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
            {savedAt && !error && (
                <p className="text-[11px] text-gray-400 mt-3">Saqlandi: {savedAt.toLocaleTimeString('uz-UZ')}</p>
            )}

            {canApprove && regulation && !isApproved && !isViewingHistory && (
                <div className="flex gap-3 mt-5 pt-4 border-t border-gray-100">
                    <Button variant="outline" icon={RotateCcw} onClick={requestRevision} disabled={busy}>
                        Qayta ko'rib chiqishga qaytarish
                    </Button>
                    <Button variant="primary" icon={ShieldCheck} onClick={approve} disabled={busy}>
                        Nizomni tasdiqlash
                    </Button>
                </div>
            )}
        </Card>
    );
});

ClubRegulationEditor.displayName = 'ClubRegulationEditor';

export default ClubRegulationEditor;
