import React, { useMemo, useRef, useState } from 'react';
import {
    Upload, FileText, Trash2, ExternalLink, AlertTriangle, Info, X, Loader2,
} from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Modal from '../common/Modal';
import { db } from '../../services/db';
import {
    STUDENT_DOC_TYPES, STUDENT_DOC_TYPE_ORDER, STUDENT_DOC_ACCEPT,
    STUDENT_DOC_MAX_MB, docTypeLabel, isSensitiveDoc, validateStudentDoc,
} from '../../config/studentDocuments';
import {
    PLACEMENT_LEVEL_ORDER, PLACEMENT_PLACES, placementLabel,
} from '../../config/socialActivityIndex';

// TALABANING TASHQI HUJJATLARI.
//
// Bu bo'lim tizim bergan rasmiy hujjatlar bilan ARALASHTIRILMAYDI: diplom va
// sertifikatlarni universitet chiqaradi va ular QR bilan tekshiriladi,
// bu yerda esa talabaning o'zi yuklaydigan tashqi hujjatlari turadi.
//
// BIR MARTA YUKLANADI, KO'P JOYDA ISHLATILADI: til sertifikati portfolioda
// ham, 5-mezon dalili sifatida ham, stipendiya arizasida ham shu yerdan
// olinadi. Ilgari har joyda qaytadan yuklash kerak bo'lardi.
const formatSize = (bytes) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
};

const formatDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

const StudentDocumentsPanel = ({ studentId, version = 0, onChanged }) => {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [file, setFile] = useState(null);
    const [form, setForm] = useState({
        docType: 'external_award', title: '', issuer: '', issuedAt: '', note: '',
        level: '', place: '',
    });
    const fileRef = useRef(null);

    // Bosqich va o'rin faqat tashqi diplomda so'raladi - til sertifikatida
    // "o'rin" degan tushuncha yo'q.
    const needsPlacement = !!STUDENT_DOC_TYPES[form.docType]?.needsPlacement;

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const docs = useMemo(() => db.getStudentDocs(studentId), [studentId, version]);

    const grouped = useMemo(() => {
        const map = new Map();
        docs.forEach(d => {
            if (!map.has(d.docType)) map.set(d.docType, []);
            map.get(d.docType).push(d);
        });
        return STUDENT_DOC_TYPE_ORDER
            .filter(k => map.has(k))
            .map(k => ({ docType: k, items: map.get(k) }));
    }, [docs]);

    const reset = () => {
        setForm({
            docType: 'external_award', title: '', issuer: '', issuedAt: '', note: '',
            level: '', place: '',
        });
        setFile(null);
        setError('');
    };

    const pickFile = (f) => {
        setError('');
        if (!f) return;
        const problem = validateStudentDoc(f);
        if (problem) { setError(problem); return; }
        setFile(f);
        // Nom bo'sh bo'lsa fayl nomidan taklif qilinadi - talaba uni
        // o'zgartirishi mumkin, lekin bo'sh maydondan boshlash shart emas.
        if (!form.title.trim()) {
            setForm(f2 => ({ ...f2, title: f.name.replace(/\.[^.]+$/, '') }));
        }
    };

    const submit = async () => {
        setError('');
        setBusy(true);
        try {
            await db.uploadStudentDoc({
                studentId,
                docType: form.docType,
                title: form.title,
                file,
                issuer: form.issuer,
                issuedAt: form.issuedAt || null,
                note: form.note,
                level: form.level || null,
                place: form.place || null,
            });
            setOpen(false);
            reset();
            onChanged?.();
        } catch (e) {
            setError(e?.message || 'Yuklashda xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    const openFile = async (doc) => {
        const url = await db.getStudentDocUrl(doc.filePath);
        if (url) window.open(url, '_blank', 'noopener');
        else setError("Faylni ochib bo'lmadi.");
    };

    const remove = async (doc) => {
        if (!window.confirm(`"${doc.title}" o'chirilsinmi?`)) return;
        setError('');
        try {
            await db.deleteStudentDoc(doc.id, studentId);
            onChanged?.();
        } catch (e) {
            setError(e?.message || "O'chirishda xatolik.");
        }
    };

    return (
        <Card>
            <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                <div>
                    <h3 className="font-bold text-gray-900">Yuklangan hujjatlarim</h3>
                    <p className="text-xs text-gray-500 mt-0.5 max-w-xl leading-relaxed">
                        Universitetdan tashqarida olingan hujjatlar: til sertifikati, maqola,
                        tashqi tanlov diplomi. Bir marta yuklaysiz — ular portfolioda,
                        mezon dalilida va stipendiya arizasida ishlatiladi.
                    </p>
                </div>
                <Button variant="primary" size="sm" icon={Upload} onClick={() => { reset(); setOpen(true); }}>
                    Hujjat yuklash
                </Button>
            </div>

            {error && !open && (
                <p className="flex items-start gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3">
                    <AlertTriangle size={13} className="shrink-0 mt-px" /> {error}
                </p>
            )}

            {docs.length === 0 ? (
                <div className="py-8 text-center">
                    <FileText size={26} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500">Hali hujjat yuklanmagan</p>
                    <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                        Til sertifikati yoki tashqi tanlov diplomi bo'lsa, uni shu yerga
                        yuklab qo'ying — keyin ariza berishda qaytadan izlamaysiz.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {grouped.map(({ docType, items }) => {
                        const meta = STUDENT_DOC_TYPES[docType];
                        const Icon = meta?.icon || FileText;
                        return (
                            <div key={docType}>
                                <p className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                                    <Icon size={12} /> {docTypeLabel(docType)}
                                    {isSensitiveDoc(docType) && (
                                        <span className="text-amber-600 normal-case font-semibold">· shaxsiy</span>
                                    )}
                                </p>
                                <div className="space-y-1.5">
                                    {items.map(d => (
                                        <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 hover:border-indigo-200 transition-colors">
                                            <FileText size={15} className="text-indigo-500 shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-gray-900 truncate">{d.title}</p>
                                                <p className="text-[11px] text-gray-400 truncate">
                                                    {[
                                                        d.level ? placementLabel(d.level) : null,
                                                        d.place ? `${d.place}-o'rin` : null,
                                                        d.issuer, formatDate(d.issuedAt), formatSize(d.size),
                                                    ].filter(Boolean).join(' · ')}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => openFile(d)}
                                                className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 shrink-0"
                                                title="Ochish"
                                            >
                                                <ExternalLink size={15} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => remove(d)}
                                                className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 shrink-0"
                                                title="O'chirish"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <Modal isOpen={open} onClose={() => setOpen(false)} title="Hujjat yuklash">
                <div className="space-y-4 min-w-0">
                    <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Hujjat turi</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {STUDENT_DOC_TYPE_ORDER.map(k => {
                                const meta = STUDENT_DOC_TYPES[k];
                                const active = form.docType === k;
                                return (
                                    <button
                                        key={k} type="button"
                                        onClick={() => setForm(f => ({ ...f, docType: k }))}
                                        className={`flex items-start gap-2 text-left px-3 py-2.5 rounded-xl border transition-colors ${
                                            active ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                                        }`}
                                    >
                                        <meta.icon size={15} className={`shrink-0 mt-0.5 ${active ? 'text-indigo-600' : 'text-gray-400'}`} />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-bold text-gray-900">{meta.label}</span>
                                            <span className="block text-[11px] text-gray-400 leading-snug">{meta.hint}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {isSensitiveDoc(form.docType) && (
                        <p className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                            <Info size={13} className="shrink-0 mt-px text-amber-600" />
                            <span>
                                Bu shaxsiy hujjat. U <b>yopiq omborda</b> saqlanadi va faqat
                                arizangizni ko'rib chiqadigan mas'ul ocha oladi.
                            </span>
                        </p>
                    )}

                    {/* BOSQICH VA O'RIN - faqat tashqi diplomda.
                        Buni yuklashda so'rash SHART: keyin stipendiya
                        arizasida "universitet bosqichi, 1-o'rin" deb
                        qidirilganda hujjat topilishi kerak. Ariza vaqtida
                        so'ralsa, bir hujjat har arizada boshqacha
                        belgilanib ketardi. */}
                    {needsPlacement && (
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2.5">
                            <p className="text-[11px] text-gray-600 leading-relaxed">
                                Bosqich va o'rinni belgilang — keyin stipendiya arizasida
                                aynan shu bo'yicha topiladi. Bu <b>sizning ma'lumotingiz</b>,
                                uni mas'ul hujjatga qarab tekshiradi.
                            </p>
                            <div>
                                <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Bosqich</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {PLACEMENT_LEVEL_ORDER.map(lv => (
                                        <button
                                            key={lv} type="button"
                                            onClick={() => setForm(f => ({ ...f, level: f.level === lv ? '' : lv }))}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                                form.level === lv
                                                    ? 'border-indigo-500 bg-indigo-600 text-white'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            {placementLabel(lv)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">O'rin</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {PLACEMENT_PLACES.map(p => (
                                        <button
                                            key={p} type="button"
                                            onClick={() => setForm(f => ({ ...f, place: f.place === p ? '' : p }))}
                                            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                                form.place === p
                                                    ? 'border-indigo-500 bg-indigo-600 text-white'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            {p}-o'rin
                                        </button>
                                    ))}
                                </div>
                                {/* Sovrinsiz ishtirok ham hujjat - uni bloklamaymiz,
                                    lekin 5-mezonga ball bermaydi va buni ochiq aytamiz. */}
                                {!form.place && (
                                    <p className="text-[11px] text-gray-400 mt-1.5">
                                        Sovrinli o'rin bo'lmasa bo'sh qoldiring.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2 min-w-0">
                            <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Nomi</label>
                            <input
                                type="text" value={form.title}
                                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                placeholder="Masalan: IELTS 7.0"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                        <div className="min-w-0">
                            <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Kim bergan</label>
                            <input
                                type="text" value={form.issuer}
                                onChange={e => setForm(f => ({ ...f, issuer: e.target.value }))}
                                placeholder="Tashkilot nomi (ixtiyoriy)"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                        <div className="min-w-0">
                            <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Berilgan sana</label>
                            <input
                                type="date" value={form.issuedAt}
                                onChange={e => setForm(f => ({ ...f, issuedAt: e.target.value }))}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Fayl</label>
                        <input
                            ref={fileRef} type="file" className="hidden"
                            accept={STUDENT_DOC_ACCEPT}
                            onChange={e => pickFile(e.target.files?.[0])}
                        />
                        {!file ? (
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                className="w-full flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 rounded-xl py-6 hover:bg-gray-50 transition-colors"
                            >
                                <Upload size={18} className="text-gray-400" />
                                <span className="text-xs font-semibold text-gray-500">Faylni tanlash uchun bosing</span>
                                <span className="text-[11px] text-gray-400">
                                    {STUDENT_DOC_ACCEPT} · {STUDENT_DOC_MAX_MB} MB gacha
                                </span>
                            </button>
                        ) : (
                            <div className="flex items-center gap-3 p-2.5 border border-gray-200 rounded-xl">
                                <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                    <FileText size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-gray-800 truncate">{file.name}</p>
                                    <p className="text-[11px] text-gray-400">{formatSize(file.size)}</p>
                                </div>
                                <button type="button" onClick={() => setFile(null)} className="p-1 text-gray-400 hover:text-red-500 shrink-0">
                                    <X size={14} />
                                </button>
                            </div>
                        )}
                    </div>

                    {error && (
                        <p className="flex items-start gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            <AlertTriangle size={13} className="shrink-0 mt-px" /> {error}
                        </p>
                    )}

                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => setOpen(false)} disabled={busy}>
                            Bekor qilish
                        </Button>
                        <Button
                            variant="primary" className="flex-1"
                            onClick={submit}
                            disabled={busy || !file || !form.title.trim()}
                        >
                            {busy ? <><Loader2 size={14} className="animate-spin mr-1.5 inline" /> Yuklanmoqda...</> : 'Yuklash'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </Card>
    );
};

export default StudentDocumentsPanel;
