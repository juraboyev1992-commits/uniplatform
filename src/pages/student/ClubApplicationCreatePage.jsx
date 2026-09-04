import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Loader2, Send, X, FileSearch, CheckCircle2 } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StepIndicator from '../../components/common/StepIndicator';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { DIRECTIONS } from '../../config/clubDirections';
import { CLUB_TYPES, REGULATION_SECTIONS } from '../../config/clubRegistration';
import ClubRegulationEditor from '../../components/clubs/ClubRegulationEditor';

// "YANGI KLUB TASHKIL ETISH" - BITTA UZLUKSIZ SEHRGAR (wizard).
//
// ILGARI: forma to'ldirilib "Ariza yuborish" bosilgach, talaba boshqa
// ko'rinishga (ariza tafsiloti) uzatilardi va u yerda Nizom kutib turardi -
// talaba buni sezmasdan oynani yopib, qolgan jarayonni unutib qo'yardi.
//
// ENDI: hammasi BITTA ekranda, TournamentCreateWizard.jsx bilan bir xil
// naqsh (StepIndicator + bosqichlar). HAR "Keyingi" bosilganda qoralama
// avtomatik saqlanadi - talaba istalgan bosqichda oynani yopsa ham hech
// narsa yo'qolmaydi, "Arizalarim" dan xuddi shu joydan davom ettiradi.
const STEPS = [
    { id: 1, label: 'Asosiy' },
    { id: 2, label: 'Tashkiliy' },
    { id: 3, label: 'Nizom' },
    { id: 4, label: "Ko'rib chiqish" },
];

// Faqat KO'RIB CHIQISH uchun haqiqatan zarur maydonlar qoldirildi.
// Olib tashlandi: vazifalar (maqsaddan farqi yo'q), faoliyat sohasi
// (yo'nalishni takrorlaydi), maqsadli auditoriya, tashabbuskor (talabaning
// o'zi - profilidan aniq), koordinator va mas'ul bo'linma (buni admin
// ro'yxatdan o'tkazishda hal qiladi, ariza bosqichida emas), faoliyat joyi
// (xona band qilish alohida modulda).
const emptyFields = {
    name: '', clubType: 'klub', direction: DIRECTIONS[0], purpose: '',
    leader: '', estimatedMembers: '', activityPeriod: '', annualPlan: '',
};

const Field = ({ label, children }) => (
    <div>
        <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">{label}</label>
        {children}
    </div>
);

const inputCls = 'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm';

const ClubApplicationCreatePage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { user } = useAuth();

    const [application, setApplication] = useState(() => (id ? db.getClubApplication(id) : null));
    const [fields, setFields] = useState(() => application?.fields || { ...emptyFields, initiator: user?.fullName || '' });
    const [currentStep, setCurrentStep] = useState(1);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [similar, setSimilar] = useState([]);
    // Yuborishdan oldin talaba butun arizani (PDF ko'rinishida) ko'rib
    // chiqishi SHART - "birinchi saqlash va PDF ga o'tkazish, xato-
    // kamchiliklarni ko'rib chiqish, keyin yuborish" tartibi. 4-bosqichga
    // har kirganda qayta talab qilinadi - orqaga qaytib biror joyni
    // o'zgartirgan bo'lishi mumkin.
    const [hasPreviewed, setHasPreviewed] = useState(false);
    // 3-bosqichdagi ClubRegulationEditor o'z holatini tashqariga chiqarmaydi -
    // "Keyingi"/chiqish tugmasi shu ref orqali uni ham saqlashga so'raydi.
    const regulationEditorRef = useRef(null);

    // Faqat DRAFT/REVISION_REQUIRED holatida sehrgar tahrirlash uchun ochiq.
    // Boshqa holatda (ko'rib chiqilmoqda/tasdiqlangan/rad etilgan) tahrirlashning
    // ma'nosi yo'q - talaba to'g'ridan-to'g'ri holat sahifasiga yo'naltiriladi.
    useEffect(() => {
        if (!id) return;
        const app = db.getClubApplication(id);
        if (app && !['DRAFT', 'REVISION_REQUIRED'].includes(app.status)) {
            navigate(`/student/clubs/applications/${id}`, { replace: true });
            return;
        }
        setApplication(app);
        if (app) setFields(app.fields || emptyFields);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const set = (key, value) => setFields(f => ({ ...f, [key]: value }));
    const checkName = (name) => setSimilar(db.checkClubNameSimilarity(name));

    // Har bosqich o'zgarishida avtomatik saqlanadi - band talabi shu: talaba
    // oynani yopsa ham hech narsa unutilmasin.
    const persistDraft = async () => {
        const rec = await db.saveClubApplicationDraft({
            applicationId: application?.id || null, applicantUserId: user?.username, fields,
        });
        setApplication(rec);
        if (!id) navigate(`/student/clubs/create/${rec.id}`, { replace: true });
        return rec;
    };

    const goNext = async () => {
        if (currentStep === 1 && (!fields.name.trim() || !fields.purpose.trim())) {
            setError('Klub nomi va maqsadini kiriting.');
            return;
        }
        setBusy(true); setError('');
        try {
            await persistDraft();
            // 3-bosqichdan (Nizom) chiqishda uni ham saqlaymiz - aks holda
            // "Saqlash" tugmasini bosmagan talabaning yozgani yo'qolardi.
            if (currentStep === 3) await regulationEditorRef.current?.save();
            const next = Math.min(currentStep + 1, STEPS.length);
            if (next === 4) setHasPreviewed(false);
            setCurrentStep(next);
        } catch (e) {
            setError(e?.message || 'Saqlashda xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    const goBack = () => setCurrentStep(s => Math.max(s - 1, 1));

    const exitAndSaveDraft = async () => {
        setBusy(true); setError('');
        try {
            await persistDraft();
            if (currentStep === 3) await regulationEditorRef.current?.save();
            navigate('/student/clubs/applications');
        } catch (e) {
            setError(e?.message || 'Saqlashda xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    // Yuborishdan oldingi majburiy qadam: butun arizani (nizom bilan birga)
    // chop etish/PDF ko'rinishida ko'rib chiqish. Xuddi shu window.print()
    // konventsiyasi (alohida PDF kutubxonasi yo'q) - brauzerning "PDF sifatida
    // saqlash" tanlovi orqali haqiqiy faylga ham aylanadi.
    const previewAsPdf = () => {
        setHasPreviewed(true);
        window.print();
    };

    const submit = async () => {
        setBusy(true); setError('');
        try {
            const draft = await persistDraft();
            const rec = await db.submitClubApplication({
                applicationId: draft.id, applicantUserId: user?.username, fields,
            });
            navigate(`/student/clubs/applications/${rec.id}`, { replace: true });
        } catch (e) {
            setError(e?.message || 'Yuborishda xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    const regulation = useMemo(
        () => application ? db.getApplicationRegulation(application.id) : null,
        [application, currentStep]
    );
    // `sections` endi RO'YXAT (`ClubRegulationEditor.jsx`) - talaba band
    // qo'shishi mumkin, shuning uchun umumiy son ham nizomning o'zidan
    // olinadi, doim 11 emas.
    const regulationSections = Array.isArray(regulation?.sections) ? regulation.sections : [];
    const regulationTotal = regulationSections.length || REGULATION_SECTIONS.length;
    const regulationFilled = regulationSections.filter(s => String(s.content || '').trim()).length;

    return (
        <div className="max-w-3xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 pt-5">
                    <div>
                        <h1 className="text-lg font-black text-gray-900 dark:text-gray-100">Yangi klub tashkil etish</h1>
                        <p className="text-xs text-gray-500 mt-0.5">
                            To'rt bosqich - har birida bosilganda avtomatik saqlanadi.
                        </p>
                    </div>
                    <button
                        type="button" onClick={exitAndSaveDraft} disabled={busy}
                        title="Qoralama sifatida saqlab chiqish"
                        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-xl"
                    >
                        <X size={18} />
                    </button>
                </div>

                <StepIndicator currentStep={currentStep} steps={STEPS} />

                <div className="p-6 space-y-4">
                    {currentStep === 1 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div className="sm:col-span-2">
                                <Field label="Klub nomi">
                                    <input
                                        value={fields.name}
                                        onChange={e => { set('name', e.target.value); checkName(e.target.value); }}
                                        className={inputCls} placeholder="Masalan: TSUL Art Club"
                                    />
                                </Field>
                                {similar.length > 0 && (
                                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-1.5">
                                        O'xshash nomlar topildi: {similar.map(s => `"${s.name}" (${s.kind})`).join(', ')}.
                                        Bu faqat ogohlantirish, ariza baribir yuboriladi.
                                    </p>
                                )}
                            </div>
                            <Field label="Klub turi">
                                <select value={fields.clubType} onChange={e => set('clubType', e.target.value)} className={inputCls}>
                                    {CLUB_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                </select>
                            </Field>
                            <Field label="Yo'nalish">
                                <select value={fields.direction} onChange={e => set('direction', e.target.value)} className={inputCls}>
                                    {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </Field>
                            <div className="sm:col-span-2">
                                <Field label="Maqsad">
                                    <textarea value={fields.purpose} onChange={e => set('purpose', e.target.value)} rows={3} className={inputCls} />
                                </Field>
                            </div>
                        </div>
                    )}

                    {currentStep === 2 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <Field label="Klub rahbari (taklif etiladigan)">
                                <input value={fields.leader} onChange={e => set('leader', e.target.value)} className={inputCls} />
                            </Field>
                            <Field label="Taxminiy a'zolar soni">
                                <input type="number" min="0" value={fields.estimatedMembers} onChange={e => set('estimatedMembers', e.target.value)} className={inputCls} />
                            </Field>
                            <div className="sm:col-span-2">
                                <Field label="Faoliyat davri">
                                    <input value={fields.activityPeriod} onChange={e => set('activityPeriod', e.target.value)} className={inputCls} placeholder="Masalan: 2026-2027 o'quv yili" />
                                </Field>
                            </div>
                            <div className="sm:col-span-2">
                                <Field label="Yillik ish reja">
                                    <textarea value={fields.annualPlan} onChange={e => set('annualPlan', e.target.value)} rows={3} className={inputCls} />
                                </Field>
                            </div>
                        </div>
                    )}

                    {currentStep === 3 && application && (
                        <ClubRegulationEditor ref={regulationEditorRef} applicationId={application.id} canEdit={true} canApprove={false} />
                    )}
                    {currentStep === 3 && !application && (
                        <p className="text-sm text-gray-400 text-center py-8">Avval oldingi bosqichlarni saqlang.</p>
                    )}

                    {currentStep === 4 && (
                        <div className="space-y-4">
                            <Card>
                                <h3 className="font-bold text-gray-900 mb-3">Ariza xulosasi</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                    {[
                                        ['Klub nomi', fields.name], ['Yo\'nalish', fields.direction],
                                        ['Maqsad', fields.purpose], ['Rahbar', fields.leader],
                                        ["A'zolar (taxminiy)", fields.estimatedMembers],
                                        ['Faoliyat davri', fields.activityPeriod],
                                    ].filter(([, v]) => v).map(([label, value]) => (
                                        <div key={label}>
                                            <p className="text-[11px] font-bold text-gray-400 uppercase">{label}</p>
                                            <p className="text-gray-800">{value}</p>
                                        </div>
                                    ))}
                                </div>
                            </Card>

                            {/* NIZOM - to'liq matn bilan, PDF/chop etishda ham shu ko'rinadi. */}
                            {regulationSections.length > 0 && (
                                <Card>
                                    <h3 className="font-bold text-gray-900 mb-1">Nizom</h3>
                                    <p className="text-xs text-gray-500 mb-3">
                                        {regulationFilled} / {regulationTotal} band to'ldirilgan
                                        {regulationFilled < regulationTotal && ' - to\'liq bo\'lmasa ham ariza yuborilaveradi.'}
                                    </p>
                                    <div className="space-y-3">
                                        {regulationSections.map((s, i) => (
                                            <div key={s.key}>
                                                <p className="text-xs font-black text-gray-500 uppercase">{i + 1}. {s.title || 'Nomsiz band'}</p>
                                                <p className="text-sm text-gray-700 whitespace-pre-wrap mt-0.5">
                                                    {s.content?.trim() || <span className="text-gray-300 italic">bo'sh</span>}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            )}

                            {!hasPreviewed && (
                                <p className="flex items-start gap-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-2.5">
                                    <AlertTriangle size={14} className="shrink-0 mt-px" />
                                    Yuborishdan oldin arizani PDF ko'rinishida ko'rib chiqing - xato va kamchiliklarni shu yerda topasiz.
                                </p>
                            )}
                            {hasPreviewed && (
                                <p className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3.5 py-2.5">
                                    <CheckCircle2 size={14} /> Ko'rib chiqildi. Endi yuborishingiz mumkin.
                                </p>
                            )}
                        </div>
                    )}

                    {error && (
                        <p className="flex items-start gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            <AlertTriangle size={13} className="shrink-0 mt-px" /> {error}
                        </p>
                    )}
                </div>

                <div className="px-6 pb-6 space-y-3">
                    {currentStep < STEPS.length ? (
                        <div className="flex gap-3">
                            <Button variant="outline" className="flex-1 justify-center" disabled={currentStep === 1 || busy} onClick={goBack}>
                                Orqaga
                            </Button>
                            <Button variant="primary" className="flex-1 justify-center" onClick={goNext} disabled={busy}>
                                {busy ? <Loader2 size={14} className="animate-spin" /> : null} Keyingi
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="flex gap-3">
                                <Button variant="outline" className="flex-1 justify-center" disabled={busy} onClick={goBack}>
                                    Orqaga
                                </Button>
                                <Button variant="outline" className="flex-1 justify-center" icon={FileSearch} onClick={previewAsPdf} disabled={busy}>
                                    Saqlash va PDF ko'rish
                                </Button>
                            </div>
                            {/* Yuborish FAQAT PDF ko'rib chiqilgandan keyin ochiladi - "birinchi
                                saqlash va PDF, xatolarni ko'rish, keyin yuborish" tartibi. */}
                            <Button
                                variant="primary" className="w-full justify-center"
                                icon={busy ? Loader2 : Send} onClick={submit} disabled={busy || !hasPreviewed}
                            >
                                {busy ? 'Yuborilmoqda...' : application?.status === 'REVISION_REQUIRED' ? 'Qayta yuborish' : 'Ariza yuborish'}
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ClubApplicationCreatePage;
