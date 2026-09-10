import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Trophy, Sparkles, GraduationCap, ArrowRight, Info, Eye, ShieldCheck,
    ExternalLink, FileText, Printer, X,
} from 'lucide-react';
import { useTabParam } from '../../hooks/useTabParam';
import Card from '../../components/common/Card';
import Modal from '../../components/common/Modal';
import CertificateGenerator from '../../components/common/CertificateGenerator';
import PortfolioSummary from '../../components/student/PortfolioSummary';
import StudentCvDocument from '../../components/student/StudentCvDocument';
import StudentDocumentsPanel from '../../components/student/StudentDocumentsPanel';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { getDocumentType, getDocumentTypeLabel, DOCUMENT_STATUS } from '../../config/documents';
import { buildStudentEligibilityProfile } from '../../utils/scholarshipEligibility';
import { matchOpportunitiesForStudent } from '../../utils/opportunityMatching';

// Hujjat faqat ishtirokchilarga emas, hakam/volontyor/tashkilotchilarga ham beriladi.
const ROLE_LABELS = { judge: 'Hakam', volunteer: 'Volontyor', organizer: 'Tashkilotchi' };

// Talaba kabinetidagi "CV / Portfolio" bo'limi.
//
// NEGA AYNAN SHU SAHIFA CV BO'LDI: u allaqachon yarim CV edi - portfolio
// qisqartmasi, rasmiy hujjatlar reestri, talaba yuklagan hujjatlar va
// sertifikat generatori shu yerda turardi. Yangi to'rtinchi bo'lim ochish
// bitta talaba haqidagi ma'lumotni yana bir joyga ko'chirardi; loyihada
// bu xato bir marta admin panelida uchragan va bo'limlar birlashtirilgan.
//
// CHEGARA: bu sahifada BALL ko'rsatilmaydi. Ball va mezonlar "Faollik va
// skoring" bo'limining ishi. Bu yerda o'sha yozuvlar ball emas, tarjimai
// hol qatori sifatida chiqadi. Ikkalasi bir xil narsani ikki xil raqam
// bilan ko'rsatmasligi kerak.
//
// Ikkita tab:
//   1. CV - shu talabaning tasdiqlangan yozuvlari, chop etishga tayyor.
//   2. Imtiyoz va imkoniyatlar - universitet bo'ylab grant yo'nalishlari.
const TABS = [
    { id: 'mine', label: 'CV', icon: FileText },
    { id: 'general', label: 'Imtiyoz va imkoniyatlar', icon: Sparkles }
];
const TAB_IDS = TABS.map(t => t.id);

// `embedded` - "Yutuq va imkoniyatlar" bo'limining tabi ichida ko'rsatilganda
// o'z sarlavhasi va ichki tablarini chizmaydi (aks holda ikki qavat tab bo'lardi).
const AchievementsPage = ({ embedded = false }) => {
    const { user } = useAuth();
    // Tab URL da turadi: aks holda brauzerning Orqaga tugmasi foydalanuvchini
    // bo'limdan butunlay chiqarib yuborardi.
    //
    // Kalit ATAYLAB `cvtab`: bu sahifa AchievementsHubPage ichida ham
    // ko'rsatiladi va u ham `tab` parametrini ishlatadi. Bir xil kalit
    // bo'lsa ikkalasi bir-birining tanlovini buzib turardi.
    const [tab, setTab] = useTabParam(TAB_IDS, 'mine', 'cvtab');
    const [previewDoc, setPreviewDoc] = useState(null);
    const [cvOpen, setCvOpen] = useState(false);

    // Chop etishda faqat CV chiqadi (uslubi src/index.css da). Belgi
    // `afterprint` da olib tashlanadi: ba'zi brauzerlarda window.print()
    // oyna yopilishini kutmay qaytadi va darhol o'chirilsa chop etish
    // bo'sh sahifa bilan tugardi.
    //
    // CV paneli yopiq bo'lsa avval ochiladi - aks holda chop etiladigan
    // element sahifada umuman bo'lmaydi va bo'sh varaq chiqadi.
    const printCv = () => {
        setCvOpen(true);
        window.requestAnimationFrame(() => {
            document.body.classList.add('cv-printing');
            const cleanup = () => {
                document.body.classList.remove('cv-printing');
                window.removeEventListener('afterprint', cleanup);
            };
            window.addEventListener('afterprint', cleanup);
            window.print();
        });
    };
    // Hujjat yuklangandan keyin portfolio ham yangilanishi kerak - ikkalasi
    // bitta sanoqqa bog'langan.
    const [version, setVersion] = useState(0);

    // FAQAT shu talabaning hujjatlari - db.getStudentDocuments recipientId va jamoa tarkibi bo'yicha
    // filtrlaydi, boshqalarnikini hech qachon qaytarmaydi.
    const myDocs = useMemo(
        () => (user ? db.getStudentDocuments(user.username) : []),
        [user, version]
    );

    const stats = useMemo(() => {
        const issued = myDocs.filter(d => d.status === 'issued');
        const byPlace = (n) => issued.filter(d => d.place === n).length;
        const byGroup = (g) => issued.filter(d => getDocumentType(d.documentType)?.group === g).length;
        return {
            total: issued.length,
            first: byPlace(1), second: byPlace(2), third: byPlace(3),
            certificates: byGroup('certificate'), thanks: byGroup('thanks')
        };
    }, [myDocs]);

    const diplomaCount = myDocs.filter(d =>
        d.status === 'issued' && getDocumentType(d.documentType)?.group === 'diploma').length;
    // Ijtimoiy faollik bali - mavjud ledger'dan (socialScoreTransactions) o'qiladi, qayta hisoblanmaydi.
    const socialScore = useMemo(
        () => (user ? (db.getStudentSocialScoreTotal?.(user.username) ?? null) : null),
        [user]
    );

    // Faol grantlar + SHU talabaning ularga mosligi. Avval bu yerda faqat arizalardan
    // yig'ilgan nomlar ro'yxati turardi; endi real grant reyestri va real moslik tekshiruvi -
    // "men qaysi grantga hozir mos kelaman" degan savolga to'g'ridan-to'g'ri javob.
    const eligibilityProfile = useMemo(
        () => (user ? buildStudentEligibilityProfile(db, user.username) : null),
        [user]
    );

    // To'liq ro'yxat "Imkoniyatlar" bo'limiga ko'chdi - bu yerda faqat soni
    // ko'rsatiladi va havola beriladi. Bir narsa ikki joyda turmasligi kerak.
    const activeOpportunities = useMemo(() => {
        if (!eligibilityProfile || !user?.username) return 0;
        const talentProfile = db.getTalentProfile?.(user.username);
        const matched = matchOpportunitiesForStudent(db, user.username, {
            eligibilityProfile,
            declared: talentProfile?.declared || {},
        });
        return matched.eligible.length;
    }, [eligibilityProfile, user]);

    return (
        <div className="space-y-6">
            {!embedded && (
                <>
                    {/* SARLAVHA.
                        Maketda uchta tugma bor: tahrirlash, PDF va ulashish.
                        Bu yerda faqat ISHLAYDIGANLARI qo'yildi - tahrirlash
                        uchun talaba o'zi kiritadigan maydonlar hali yo'q,
                        ulashish esa ommaviy havola va maxfiylik sozlamasini
                        talab qiladi. Ishlamaydigan tugma qo'yish maketga
                        o'xshatadi, lekin foydalanuvchini aldaydi. */}
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h1 className="text-3xl font-black text-slate-900">Mening CV'im</h1>
                            <p className="text-sm text-gray-500 mt-1">
                                Sizning akademik, professional va ijtimoiy faoliyatingizning yagona markazi
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setCvOpen(v => !v)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                                    cvOpen
                                        ? 'bg-blue-700 border-blue-700 text-white hover:bg-blue-800'
                                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                <FileText size={15} /> CV ko'rinishi
                            </button>
                            <button
                                type="button"
                                onClick={printCv}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold transition-colors"
                            >
                                <Printer size={15} /> PDF yuklab olish
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                        {TABS.map(t => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setTab(t.id)}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${tab === t.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <t.icon size={15} /> {t.label}
                            </button>
                        ))}
                    </div>
                </>
            )}

            {tab === 'mine' && (
                <div className="flex flex-col xl:flex-row gap-5 items-start">
                {/* IKKI PANEL - maketdagidek: chapda ish maydoni, o'ngda CV
                    hujjati. Panel yopilganda asosiy qism butun kenglikni
                    egallaydi. */}
                <div className="flex-1 min-w-0 space-y-6">
                    {/* PORTFOLIO - eng tepada.
                        Talaba bu bo'limga "menda nima bor" degan savol bilan
                        keladi. Hujjatlar jadvali javobning bir qismi, portfolio
                        esa butun manzarani beradi: GPA, indeks, klublar,
                        o'qilgan asarlar. */}
                    <PortfolioSummary studentId={user?.username} version={version} />

                    {/* Talaba yuklaydigan tashqi hujjatlar. Tizim bergan rasmiy
                        hujjatlardan ALOHIDA turadi - ularning ishonchlilik
                        darajasi boshqa va aralashtirilmasligi kerak. */}
                    <StudentDocumentsPanel
                        studentId={user?.username}
                        version={version}
                        onChanged={() => setVersion(v => v + 1)}
                    />

                    <div>
                        <h3 className="font-bold text-gray-900 mb-2">Rasmiy hujjatlarim</h3>
                        <div className="flex flex-wrap gap-2">
                            {[
                                ['Jami', stats.total], ["I o'rin", stats.first], ["II o'rin", stats.second],
                                ["III o'rin", stats.third], ['Sertifikat', stats.certificates], ['Tashakkur', stats.thanks]
                            ].map(([label, value]) => (
                                <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-center min-w-[96px]">
                                    <p className="text-2xl font-black text-gray-900">{value}</p>
                                    <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400">{label}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Reestr ko'rinishi - admin reestri bilan bir xil uslubda, lekin FAQAT shu
                        talabaning hujjatlari (db.getStudentDocuments o'zi filtrlaydi). */}
                    <Card padding={false}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-gray-400 uppercase">
                                    <tr>
                                        <th className="p-3 w-10">№</th>
                                        <th className="p-3">Hujjat</th>
                                        <th className="p-3">Tadbir / musobaqa</th>
                                        <th className="p-3">Ishtirok shakli</th>
                                        <th className="p-3">Raqam</th>
                                        <th className="p-3">Sana</th>
                                        <th className="p-3 text-center">Holat</th>
                                        <th className="p-3 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {myDocs.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="p-10 text-center text-gray-400">
                                                Hali rasmiy hujjat berilmagan. Tadbir yoki musobaqa yakunlanib,
                                                bayonnoma tasdiqlangach hujjatlaringiz shu yerda paydo bo'ladi.
                                            </td>
                                        </tr>
                                    ) : myDocs.map((d, i) => (
                                        <tr key={d.id} className="hover:bg-slate-50/70">
                                            <td className="p-3 text-gray-400 font-bold">{i + 1}</td>
                                            <td className="p-3 font-semibold text-gray-800">
                                                {getDocumentTypeLabel(d.documentType)}
                                            </td>
                                            <td className="p-3 text-gray-600">{d.activityName}</td>
                                            <td className="p-3 text-gray-600">
                                                {ROLE_LABELS[d.role]
                                                    ? <span className="font-semibold text-amber-700">{ROLE_LABELS[d.role]}</span>
                                                    : d.teamName
                                                        ? <span className="font-semibold text-indigo-700">{d.teamName}</span>
                                                        : <span className="text-gray-400">Yakka ishtirokchi</span>}
                                            </td>
                                            <td className="p-3 font-mono text-[10px] text-gray-500">{d.registrationNumber}</td>
                                            <td className="p-3 text-gray-500">{(d.issuedAt || d.createdAt || '').slice(0, 10)}</td>
                                            <td className="p-3 text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${DOCUMENT_STATUS[d.status]?.tone}`}>
                                                    {DOCUMENT_STATUS[d.status]?.label}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center">
                                                <button
                                                    type="button"
                                                    title="Hujjat ko'rinishini ochish"
                                                    onClick={() => setPreviewDoc(d)}
                                                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                                                >
                                                    <Eye size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    <Card className="p-5">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-1">
                            <GraduationCap size={17} className="text-indigo-600" /> Menga ochilgan imkoniyatlar
                        </h3>
                        <p className="text-xs text-gray-400 mb-3">
                            Quyidagilar sizning rasmiy hujjatlaringiz asosida hisoblangan.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="p-3 bg-slate-50 border border-gray-100 rounded-xl">
                                <p className="text-[11px] text-gray-400">Rasmiy hujjatlar</p>
                                <p className="text-xl font-extrabold text-gray-900">{stats.total}</p>
                            </div>
                            <div className="p-3 bg-slate-50 border border-gray-100 rounded-xl">
                                <p className="text-[11px] text-gray-400">Shundan diplomlar</p>
                                <p className="text-xl font-extrabold text-gray-900">{diplomaCount}</p>
                            </div>
                            <div className="p-3 bg-slate-50 border border-gray-100 rounded-xl">
                                <p className="text-[11px] text-gray-400">Ijtimoiy faollik bali</p>
                                <p className="text-xl font-extrabold text-gray-900">
                                    {socialScore != null ? socialScore : '—'}
                                </p>
                            </div>
                        </div>
                        <p className="flex items-start gap-1.5 text-[11px] text-gray-400 mt-3">
                            <Info size={12} className="shrink-0 mt-px" />
                            Imtiyozlarni avtomatik biriktirish (grant, stipendiya, tavsiyanoma) keyingi
                            bosqichda ulanadi — hozircha bu bo'lim hisob-kitobni ko'rsatadi.
                        </p>
                    </Card>
                </div>

                {cvOpen && (
                    <aside className="cv-panel w-full xl:w-[430px] shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 xl:sticky xl:top-4">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <h3 className="font-black text-gray-900">CV</h3>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={printCv}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50"
                                >
                                    <Printer size={13} /> Chop etish
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCvOpen(false)}
                                    aria-label="Yopish"
                                    className="w-7 h-7 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex items-center justify-center"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                        <StudentCvDocument studentId={user?.username} version={version} />
                    </aside>
                )}
                </div>
            )}

            <Modal
                isOpen={!!previewDoc}
                onClose={() => setPreviewDoc(null)}
                title={previewDoc ? getDocumentTypeLabel(previewDoc.documentType) : ''}
                size="xl"
            >
                {previewDoc && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <a
                                href={`${window.location.origin}/verify/${previewDoc.verificationToken}`}
                                target="_blank" rel="noreferrer"
                                className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
                            >
                                <ShieldCheck size={13} /> Haqiqiyligini tekshirish <ExternalLink size={11} />
                            </a>
                            {previewDoc.status === 'revoked' && (
                                <span className="text-xs font-bold text-rose-600">Bu hujjat bekor qilingan</span>
                            )}
                        </div>
                        <CertificateGenerator
                            heading={getDocumentTypeLabel(previewDoc.documentType)}
                            studentName={previewDoc.officialName || previewDoc.recipientName}
                            clubName={previewDoc.activityName}
                            role={previewDoc.teamName
                                ? `${previewDoc.teamName} jamoasi`
                                : (ROLE_LABELS[previewDoc.role] || 'Ishtirokchi')}
                            placement={previewDoc.place ? `${previewDoc.place}-o'rin` : null}
                            issueDate={(previewDoc.issuedAt || previewDoc.createdAt || '').slice(0, 10)}
                            certificateId={previewDoc.verificationToken}
                            registrationNumber={previewDoc.registrationNumber}
                            verifyUrl={`${window.location.origin}/verify/${previewDoc.verificationToken}`}
                            revoked={previewDoc.status === 'revoked'}
                            templateId={previewDoc.templateId || 'classic'}
                            members={previewDoc.members || []}
                        />
                    </div>
                )}
            </Modal>

            {!embedded && tab === 'general' && (
                <div className="space-y-4">
                    <Card className="p-5 border-l-4 border-l-teal-600">
                        <h3 className="font-bold text-gray-900 mb-1">Siz mos keladigan imkoniyatlar</h3>
                        <p className="text-sm text-gray-500 mb-3">
                            Grant, stipendiya va tanlovlar yutuqlaringizga qarab avtomatik
                            tanlanadi — moslik darajasi va nima yetishmayotgani bilan.
                        </p>
                        {activeOpportunities > 0 && (
                            <p className="text-sm font-bold text-teal-700 mb-3">
                                Hozir sizga {activeOpportunities} ta imkoniyat mos keladi.
                            </p>
                        )}
                        <Link
                            to="/student/opportunities"
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-teal-700 text-white rounded-xl text-sm font-bold hover:bg-teal-800"
                        >
                            Imkoniyatlar bo'limi <ArrowRight size={14} />
                        </Link>
                    </Card>

                    <Card className="p-5">
                        <h3 className="font-bold text-gray-900 mb-1">Yutuqlar nima beradi?</h3>
                        <ul className="text-sm text-gray-600 space-y-1.5 mt-2 list-disc pl-5">
                            <li>Rasmiy diplom va sertifikatlar shaxsiy portfelingizga yoziladi va QR orqali istalgan vaqtda tekshiriladi.</li>
                            <li>Tadbir va musobaqalardagi ishtirok ijtimoiy faollik baliga ta'sir qiladi.</li>
                            <li>Portfel grant, stipendiya va tavsiyanoma uchun asos sifatida ishlatiladi.</li>
                        </ul>
                        <p className="flex items-start gap-1.5 text-[11px] text-gray-400 mt-3">
                            <Info size={12} className="shrink-0 mt-px" />
                            Bu bo'lim kengaytirilmoqda — imtiyozlarning to'liq ro'yxati va shartlari keyin qo'shiladi.
                        </p>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default AchievementsPage;
