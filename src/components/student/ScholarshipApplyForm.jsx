import React, { useState, useMemo } from 'react';
import {
    Banknote, Calendar, CheckCircle, XCircle, AlertTriangle, ShieldCheck,
    Scale, Sparkles, FileText, Send, Loader2,
} from 'lucide-react';
import Button from '../common/Button';
import { db } from '../../services/db';
import { CRITERIA_OPS, getCriterion, formatAmount } from '../../config/scholarships';
import { evaluateEligibility, computeApplicationScore } from '../../utils/scholarshipEligibility';
import { buildApplicationAttachments } from '../../utils/studentPortfolio';
import { STUDENT_DOC_TYPES } from '../../config/studentDocuments';
import {
    PLACEMENT_LEVEL_ORDER, PLACEMENT_PLACES, placementLabel,
} from '../../config/socialActivityIndex';

// Stipendiya ariza formasi.
//
// Avval bu ScholarshipsModule ichida edi va grantlar ro'yxati bilan birga
// turardi. Grantlar ro'yxati "Imkoniyatlar" tabiga ko'chgach, forma ham
// o'sha yerdan chaqiriladigan bo'ldi - shuning uchun alohida komponent.
// Ikki joydan chaqiriladi, lekin nusxa ko'chirilmaydi.
//
// TALAB QILINADIGAN: `grant`, `profile` (eligibility profili), `studentId`.
const ScholarshipApplyForm = ({ grant, profile, studentId, onDone, onCancel }) => {
    const [declared, setDeclared] = useState({});
    const [attached, setAttached] = useState([]);
    const [preparedDocs, setPreparedDocs] = useState([]);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const settings = useMemo(() => db.getScholarshipSettings(), []);
    // Nom uch manbadan qidiriladi: grant sozlamalari -> standart turlar ro'yxati
    // -> kalitning o'zi. Faqat sozlamalarga tayanilsa, `external_award` kabi
    // standart tur ro'yxatda bo'lmasa xom kalit ko'rinib qolardi.
    const docTypeLabel = (id) =>
        settings.docTypes.find(d => d.id === id)?.label
        || STUDENT_DOC_TYPES[id]?.label
        || id;

    // ME'ZON BO'YICHA HUJJAT TANLASH.
    //
    // Ketma-ketlik: me'zon -> (kerak bo'lsa) bosqich -> o'rin -> shu shartga
    // mos hujjatlar -> galochka. Talaba "maqolalar" me'zonini bosganda faqat
    // maqolalari, "qo'lga kiritgan yutuqlar" ni bosib universitet bosqichi va
    // 1-o'rinni belgilaganda faqat shunga mos diplomlari chiqadi.
    //
    // IKKI MANBA BIR RO'YXATDA: reyestrdagi rasmiy diplom (tizim bergan, QR
    // bilan tekshiriladi) va talabaning o'zi yuklagan tashqi hujjati. Talaba
    // uchun ikkalasi ham "mening yutug'im", shuning uchun ularni ikki joyga
    // ajratish faqat chalkashtirardi - manba yorliq bilan ko'rsatiladi.
    const attachments = useMemo(() => buildApplicationAttachments(db, studentId), [studentId]);

    const allItems = useMemo(
        () => [...attachments.official, ...attachments.uploaded],
        [attachments]
    );

    // Ko'rsatiladigan me'zonlar: grant talab qilganlari + "qo'lga kiritgan
    // yutuqlar". Oxirgisi HAR DOIM chiqadi: rasmiy diplomlar tizimning o'z
    // ma'lumoti va talaba ularni har qanday arizaga biriktira olishi kerak.
    const sections = useMemo(() => {
        const req = grant?.requiredDocs || [];
        const keys = [...req];
        if (!keys.includes('external_award')) keys.push('external_award');
        return keys.map(key => ({
            key,
            required: req.includes(key),
            needsPlacement: !!STUDENT_DOC_TYPES[key]?.needsPlacement,
            items: allItems.filter(i => i.docType === key),
        }));
    }, [grant, allItems]);

    // Bosqich/o'rin filtri me'zon bo'yicha alohida saqlanadi.
    const [placeFilter, setPlaceFilter] = useState({});
    const filterOf = (key) => placeFilter[key] || { level: '', place: '' };
    const setFilter = (key, patch) =>
        setPlaceFilter(f => ({ ...f, [key]: { ...filterOf(key), ...patch } }));

    const isPicked = (item) => item.source === 'official'
        ? attached.includes(item.id)
        : preparedDocs.some(d => d.documentId === item.id);

    const toggle = (sectionKey, item) => {
        if (item.source === 'official') {
            setAttached(a => a.includes(item.id) ? a.filter(x => x !== item.id) : [...a, item.id]);
        } else {
            setPreparedDocs(p => p.some(d => d.documentId === item.id)
                ? p.filter(d => d.documentId !== item.id)
                // Bir me'zonga BIR NECHTA hujjat biriktirilishi mumkin -
                // uchta maqolasi bor talaba bittasini tanlashga majbur
                // bo'lmasligi kerak.
                : [...p, { typeId: sectionKey, documentId: item.id, title: item.title }]);
        }
    };

    // Talab qilingan me'zonlardan hech narsa biriktirilmaganlari.
    const missingRequired = useMemo(
        () => (grant?.requiredDocs || []).filter(key =>
            !preparedDocs.some(d => d.typeId === key)
            && !(key === 'external_award' && attached.length > 0)
        ),
        [grant, preparedDocs, attached]
    );

    // Talaba qiymat kiritgani sari moslik jonli qayta hisoblanadi.
    const liveEligibility = useMemo(
        () => (grant && profile ? evaluateEligibility(grant, profile, declared) : null),
        [grant, profile, declared]
    );
    const liveScore = useMemo(
        () => (grant && profile ? computeApplicationScore(grant, profile, declared) : null),
        [grant, profile, declared]
    );

    const submit = async () => {
        setBusy(true); setError('');
        try {
            await db.createScholarshipApplication({
                studentId,
                grantId: grant.id,
                declared,
                attachedDocumentIds: attached,
                // Endi HAQIQIY hujjatga havola saqlanadi, "tayyorladim"
                // belgisi emas - ko'rib chiquvchi faylni ochib ko'radi.
                uploadedDocs: preparedDocs.map(d => ({
                    typeId: d.typeId,
                    documentId: d.documentId,
                    title: d.title,
                    declaredAt: new Date().toISOString(),
                })),
                note,
                autoScore: liveScore?.score || 0,
                autoSnapshot: liveScore?.parts || null,
                eligibilitySnapshot: liveEligibility?.checks || null,
            });
            onDone?.();
        } catch (e) {
            setError(e.message || String(e));
        } finally {
            setBusy(false);
        }
    };

    if (!grant || !profile) return null;

    return (
        <div className="space-y-5">
            <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h4 className="font-bold text-emerald-900 mb-1 flex items-center">
                        <Banknote className="w-5 h-5 mr-2" /> {formatAmount(grant.amount)}
                    </h4>
                    {grant.description && (
                        <p className="text-emerald-700 text-sm font-medium italic">{grant.description}</p>
                    )}
                    {grant.deadline && (
                        <p className="text-emerald-600 text-xs font-semibold mt-1 flex items-center gap-1">
                            <Calendar size={12} /> Oxirgi muddat: {grant.deadline}
                        </p>
                    )}
                </div>
                {liveScore && (
                    <div className="text-center flex-shrink-0">
                        <p className="text-3xl font-black text-emerald-700">{liveScore.score}</p>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-600">reyting</p>
                    </div>
                )}
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                    <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-semibold text-red-700">{error}</p>
                </div>
            )}

            {/* Avtomatik tekshirilgan me'zonlar */}
            {liveEligibility && liveEligibility.checks.filter(c => c.source === 'auto').length > 0 && (
                <div>
                    <h5 className="font-bold text-gray-900 mb-2 flex items-center text-sm">
                        <ShieldCheck className="w-4 h-4 mr-2 text-emerald-600" /> Avtomatik tekshirildi
                    </h5>
                    <div className="space-y-1.5">
                        {liveEligibility.checks.filter(c => c.source === 'auto').map(c => (
                            <div key={c.key} className={`flex items-center gap-3 p-3 rounded-xl border ${c.ok ? 'bg-emerald-50/60 border-emerald-100' : 'bg-red-50/60 border-red-100'}`}>
                                {c.ok ? <CheckCircle size={16} className="text-emerald-600 flex-shrink-0" />
                                    : <XCircle size={16} className="text-red-500 flex-shrink-0" />}
                                <span className="text-sm font-semibold text-gray-800 flex-1 min-w-0 truncate">{c.label}</span>
                                <span className="text-sm font-black text-gray-900 whitespace-nowrap">{c.actual} {c.unit}</span>
                                <span className="text-[11px] text-gray-400 whitespace-nowrap">
                                    talab {CRITERIA_OPS[c.op]?.symbol} {c.target}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Qo'lda kiritiladigan me'zonlar */}
            {liveEligibility && liveEligibility.checks.filter(c => c.source !== 'auto').length > 0 && (
                <div>
                    <h5 className="font-bold text-gray-900 mb-2 flex items-center text-sm">
                        <Scale className="w-4 h-4 mr-2 text-amber-600" /> Siz kiritishingiz kerak
                    </h5>
                    <div className="space-y-2">
                        {liveEligibility.checks.filter(c => c.source !== 'auto').map(c => {
                            const meta = getCriterion(c.key);
                            return (
                                <div key={c.key} className="flex items-center gap-3 p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-900">{c.label}</p>
                                        <p className="text-[11px] text-gray-500">
                                            Talab: {CRITERIA_OPS[c.op]?.symbol} {c.target} · mas'ul tekshiradi
                                        </p>
                                    </div>
                                    <input
                                        type={meta?.valueType === 'number' ? 'number' : 'text'}
                                        step="any"
                                        value={declared[c.key] ?? ''}
                                        onChange={e => setDeclared(d => ({ ...d, [c.key]: e.target.value }))}
                                        placeholder="qiymat"
                                        className="w-28 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold" />
                                    {c.ok
                                        ? <CheckCircle size={16} className="text-emerald-600 flex-shrink-0" />
                                        : c.unknown
                                            ? <div className="w-4 flex-shrink-0" />
                                            : <XCircle size={16} className="text-red-500 flex-shrink-0" />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ME'ZON -> BOSQICH -> O'RIN -> YUTUQLAR */}
            <div>
                <h5 className="font-bold text-gray-900 mb-1 flex items-center text-sm">
                    <Sparkles className="w-4 h-4 mr-2 text-indigo-600" /> Me'zonlar bo'yicha hujjat biriktiring
                </h5>
                <p className="text-[11px] text-gray-500 mb-2.5">
                    Har me'zon ostida shunga mos hujjatlaringiz chiqadi — keraklisini
                    belgilang. Qayta yuklash shart emas.
                </p>

                <div className="space-y-2">
                    {sections.map(sec => {
                        const f = filterOf(sec.key);
                        // Bosqich va o'rin FILTR, majburiy qadam emas: "Barchasi"
                        // holatida hamma hujjat ko'rinadi. Majburiy qilinsa,
                        // shahar bosqichida 2-o'rin olgan talaba to'g'ri
                        // kombinatsiyani topgunicha bo'sh ro'yxatga urilardi.
                        const visible = sec.needsPlacement
                            ? sec.items.filter(i =>
                                (!f.level || i.level === f.level)
                                && (!f.place || i.place === f.place))
                            : sec.items;
                        const pickedCount = sec.items.filter(isPicked).length;

                        return (
                            <div key={sec.key} className={`rounded-xl border ${
                                pickedCount > 0 ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-gray-200'
                            }`}>
                                <div className="flex items-center gap-2.5 px-3 py-2.5">
                                    {pickedCount > 0
                                        ? <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                                        : <FileText size={16} className="text-gray-400 shrink-0" />}
                                    {/* Bu bo'limda `external_award` ostida talabaning
                                        TASHQI diplomi ham, universitet bergan rasmiy
                                        hujjati ham turadi - shuning uchun sarlavha
                                        "tashqi" emas, umumiy. */}
                                    <span className="text-sm font-bold text-gray-800 flex-1 min-w-0">
                                        {sec.key === 'external_award'
                                            ? "Qo'lga kiritgan yutuqlar"
                                            : docTypeLabel(sec.key)}
                                    </span>
                                    {sec.required && (
                                        <span className="text-[10px] font-black uppercase tracking-wide text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md shrink-0">
                                            majburiy
                                        </span>
                                    )}
                                    <span className="text-[11px] text-gray-400 shrink-0 tabular-nums">
                                        {pickedCount > 0 ? `${pickedCount} ta belgilandi` : `${sec.items.length} ta`}
                                    </span>
                                </div>

                                {/* BOSQICH VA O'RIN */}
                                {sec.needsPlacement && sec.items.length > 0 && (
                                    <div className="px-3 pb-2 space-y-1.5">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-[10px] font-black text-gray-400 uppercase w-14">Bosqich</span>
                                            <button type="button" onClick={() => setFilter(sec.key, { level: '' })}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                                                    !f.level ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-gray-200 bg-white text-gray-600'
                                                }`}>Barchasi</button>
                                            {PLACEMENT_LEVEL_ORDER.map(lv => (
                                                <button key={lv} type="button"
                                                    onClick={() => setFilter(sec.key, { level: lv })}
                                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                                                        f.level === lv ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                                    }`}>{placementLabel(lv)}</button>
                                            ))}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-[10px] font-black text-gray-400 uppercase w-14">O'rin</span>
                                            <button type="button" onClick={() => setFilter(sec.key, { place: '' })}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                                                    !f.place ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-gray-200 bg-white text-gray-600'
                                                }`}>Barchasi</button>
                                            {PLACEMENT_PLACES.map(p => (
                                                <button key={p} type="button"
                                                    onClick={() => setFilter(sec.key, { place: p })}
                                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                                                        f.place === p ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                                    }`}>{p}-o'rin</button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* HUJJATLAR */}
                                {sec.items.length === 0 ? (
                                    <p className="text-[11px] text-gray-500 px-3 pb-3">
                                        Bu me'zon bo'yicha hujjatingiz yo'q. <b>Yutuqlarim</b> bo'limidan
                                        yuklab, keyin shu yerga qaytishingiz mumkin.
                                    </p>
                                ) : visible.length === 0 ? (
                                    <p className="text-[11px] text-gray-500 px-3 pb-3">
                                        Tanlangan bosqich va o'rin bo'yicha hujjat topilmadi.
                                    </p>
                                ) : (
                                    <div className="px-2 pb-2 space-y-1 max-h-56 overflow-y-auto">
                                        {visible.map(item => (
                                            <label key={`${item.source}-${item.id}`}
                                                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg border cursor-pointer transition-colors ${
                                                    isPicked(item) ? 'bg-white border-emerald-300' : 'bg-white border-gray-100 hover:border-indigo-200'
                                                }`}>
                                                <input type="checkbox" checked={isPicked(item)}
                                                    onChange={() => toggle(sec.key, item)}
                                                    className="w-4 h-4 text-emerald-600 rounded border-gray-300 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-bold text-gray-900 truncate">{item.title}</p>
                                                    <p className="text-[10px] text-gray-400 truncate">
                                                        {[
                                                            item.subtitle,
                                                            item.level ? placementLabel(item.level) : null,
                                                            item.place ? `${item.place}-o'rin` : null,
                                                        ].filter(Boolean).join(' · ')}
                                                    </p>
                                                </div>
                                                {/* Manba ajratib ko'rsatiladi: rasmiy hujjatni
                                                    mas'ul QR orqali tekshiradi, yuklanganini esa
                                                    faylni ochib. Ishonchlilik darajasi bir xil emas. */}
                                                {item.source === 'official' ? (
                                                    <span className="text-[9px] font-black uppercase tracking-wide text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded shrink-0">
                                                        rasmiy
                                                    </span>
                                                ) : (
                                                    <span className="text-[9px] font-black uppercase tracking-wide text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                                                        yuklangan
                                                    </span>
                                                )}
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {missingRequired.length > 0 && (
                    <p className="text-[11px] text-amber-700 mt-2 flex items-start gap-1.5 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        <span>
                            {missingRequired.length} ta majburiy me'zon bo'yicha hujjat
                            biriktirilmagan. Ariza baribir yuboriladi, lekin ko'rib chiquvchi
                            ularni so'rashi mumkin.
                        </span>
                    </p>
                )}
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Qo'shimcha izoh
                </label>
                <textarea value={note} onChange={e => setNote(e.target.value)}
                    placeholder="Komissiyaga aytmoqchi bo'lgan qo'shimcha ma'lumot..."
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm h-20 resize-none" />
            </div>

            {liveEligibility?.blockingCount > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 font-semibold">
                        Siz {liveEligibility.blockingCount} ta shartga javob bermayapsiz. Ariza
                        yuborishingiz mumkin, lekin komissiya buni ko'radi.
                    </p>
                </div>
            )}

            <div className="pt-4 border-t border-gray-100 flex gap-4">
                <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>
                    Bekor qilish
                </Button>
                <Button variant="primary" className="flex-1 py-4 shadow-lg shadow-indigo-200"
                    icon={busy ? Loader2 : Send} onClick={submit} disabled={busy}>
                    {busy ? 'Yuborilmoqda...' : 'Ariza yuborish'}
                </Button>
            </div>
        </div>
    );
};

export default ScholarshipApplyForm;
