import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    GraduationCap, Trophy, FileText, Heart, Printer, X, BadgeCheck, Info,
    User, Briefcase, Building2, FolderKanban, Wrench, Languages, Users,
    Medal, Sparkles, ArrowRight, Eye,
} from 'lucide-react';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { buildCv, SOURCE, SOURCE_META } from '../../utils/cvEngine';
import CvPreviewDocument from '../../components/student/CvPreviewDocument';

// CV / PORTFOLIO — talabaning ish maydoni.
//
// IKKI QISM, ATAYLAB ALOHIDA:
//   chapda  - "menda nima bor va nimasi yetishmaydi" (bu sahifa)
//   o'ngda  - "tashqaridagi odam nimani ko'radi" (CvPreviewDocument)
// Ilgari ikkalasi bitta ko'rinishga aralashtirilgan edi va natijada
// na ish maydoni, na hujjat bo'lib chiqdi.
//
// TAKRORLANISH YO'Q: bu sahifa hech narsa saqlamaydi va hech narsani
// boshqarmaydi. Hujjat yuklash, sertifikat berish va imkoniyatlar
// "Yutuq va imkoniyatlar" bo'limida qoladi; bu yerda ular faqat
// KO'RSATILADI va o'sha bo'limga havola beriladi.

const SECTION_ICONS = {
    about: User, education: GraduationCap, experience: Briefcase,
    internships: Building2, projects: FolderKanban, skills: Wrench,
    languages: Languages, certificates: FileText, clubs: Users,
    volunteering: Heart, awards: Trophy, competitions: Medal,
};

const TONES = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
};

const SourceBadge = ({ source }) => {
    const meta = SOURCE_META[source];
    if (!meta) return null;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap ${TONES[meta.tone]}`}>
            <BadgeCheck size={11} /> {meta.label}
        </span>
    );
};

const StatCard = ({ icon: Icon, label, value, unit, hint, source, missing }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-2.5">
            <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-800 flex items-center justify-center shrink-0">
                <Icon size={16} />
            </span>
            <span className="text-xs font-bold text-gray-600">{label}</span>
        </div>
        {value === null || value === undefined ? (
            <>
                <p className="text-2xl font-black text-gray-300 leading-none">—</p>
                <p className="text-[11px] text-gray-400 mt-1.5">{missing || "ma'lumot yo'q"}</p>
            </>
        ) : (
            <>
                <p className="text-2xl font-black text-blue-950 leading-none tabular-nums">
                    {value}
                    {unit && <span className="text-sm font-bold text-gray-400"> / {unit}</span>}
                </p>
                <p className="text-[11px] text-gray-400 mt-1.5">{hint}</p>
                <div className="mt-2.5"><SourceBadge source={source} /></div>
            </>
        )}
    </div>
);

const SectionBlock = ({ id, title, items, timeline = false }) => {
    const Icon = SECTION_ICONS[id] || FileText;
    return (
        <div>
            <h4 className="flex items-center gap-2 font-bold text-blue-950 text-sm mb-3">
                <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-800 flex items-center justify-center shrink-0">
                    <Icon size={13} />
                </span>
                {title}
            </h4>
            <div className={timeline ? '' : 'space-y-2.5'}>
                {items.map((item, i) => (
                    <div
                        key={item.id}
                        className={timeline ? 'relative pl-5 pb-3.5 last:pb-0' : ''}
                    >
                        {timeline && (
                            <>
                                <span className="absolute left-0 top-1.5 w-2 h-2 rounded-full border-2 border-blue-700 bg-white" />
                                {i < items.length - 1 && (
                                    <span className="absolute left-[3px] top-4 bottom-0 w-px bg-gray-100" />
                                )}
                            </>
                        )}
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <p className="text-sm font-bold text-blue-950 leading-snug min-w-0">
                                {item.title}
                            </p>
                            {item.period && (
                                <p className="text-[11px] text-gray-400 shrink-0 tabular-nums">
                                    {item.period}
                                </p>
                            )}
                        </div>
                        {item.subtitle && (
                            <p className="text-xs text-gray-500 mt-0.5">{item.subtitle}</p>
                        )}
                        <div className="flex items-end justify-between gap-3 flex-wrap mt-1">
                            {item.note
                                ? <p className="text-xs text-gray-500 leading-snug">{item.note}</p>
                                : <span />}
                            <SourceBadge source={item.source} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const Ring = ({ percent }) => {
    const r = 27;
    const c = 2 * Math.PI * r;
    return (
        <svg width="68" height="68" viewBox="0 0 68 68" className="shrink-0">
            <circle cx="34" cy="34" r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
            <circle
                cx="34" cy="34" r={r} fill="none" stroke="#1e40af" strokeWidth="7"
                strokeLinecap="round" strokeDasharray={`${(c * percent) / 100} ${c}`}
                transform="rotate(-90 34 34)"
            />
            <text x="34" y="38" textAnchor="middle" className="fill-blue-950"
                style={{ fontSize: '14px', fontWeight: 800 }}>{percent}%</text>
        </svg>
    );
};

const initialsOf = (name) => (name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

const CvPortfolioPage = () => {
    const { user } = useAuth();
    const studentId = user?.username;
    const [version] = useState(0);
    const [previewOpen, setPreviewOpen] = useState(true);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const cv = useMemo(() => (studentId ? buildCv(db, studentId) : null), [studentId, version]);

    // Chop etishda faqat CV chiqadi (uslubi src/index.css da). Panel yopiq
    // bo'lsa avval ochiladi - aks holda chop etiladigan element sahifada
    // umuman bo'lmaydi va bo'sh varaq chiqardi. Belgi `afterprint` da
    // olib tashlanadi: ba'zi brauzerlarda window.print() oyna yopilishini
    // kutmay qaytadi.
    const printCv = () => {
        setPreviewOpen(true);
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

    if (!cv) return null;
    const s = cv.student;

    const leftSections = [
        { id: 'education', title: "Ta'lim", timeline: true },
        { id: 'experience', title: 'Ish tajribasi', timeline: true },
        { id: 'internships', title: 'Amaliyot', timeline: true },
        { id: 'projects', title: 'Loyihalar', timeline: true },
    ].filter(x => cv.sections[x.id].length > 0);

    const rightSections = [
        { id: 'skills', title: "Ko'nikmalar" },
        { id: 'languages', title: 'Tillar' },
        { id: 'certificates', title: 'Sertifikatlar' },
        { id: 'clubs', title: 'Klublar va jamoalar' },
        { id: 'volunteering', title: 'Volontyorlik' },
        { id: 'awards', title: 'Mukofotlar va yutuqlar' },
        { id: 'competitions', title: 'Tanlov va musobaqalar' },
    ].filter(x => cv.sections[x.id].length > 0);

    return (
        <div className="space-y-5">
            {/* SARLAVHA */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-3xl font-black text-blue-950">Mening CV'im</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Akademik, professional va ijtimoiy faoliyatingizni yagona professional
                        profilga jamlang
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setPreviewOpen(v => !v)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                            previewOpen
                                ? 'bg-blue-800 border-blue-800 text-white hover:bg-blue-900'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        <Eye size={15} /> CV ko'rinishi
                    </button>
                    <button
                        type="button"
                        onClick={printCv}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-800 hover:bg-blue-900 text-white text-sm font-bold transition-colors"
                    >
                        <Printer size={15} /> PDF yuklab olish
                    </button>
                </div>
            </div>

            <div className="flex flex-col xl:flex-row gap-5 items-start">
                <div className="flex-1 min-w-0 space-y-4">
                    {/* PROFIL */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <div className="flex items-start gap-5 flex-wrap">
                            <div className="w-[86px] h-[86px] rounded-full bg-blue-50 text-blue-900 flex items-center justify-center text-2xl font-black shrink-0">
                                {initialsOf(s?.fullName)}
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-2xl font-black text-blue-950 leading-tight">
                                    {s?.fullName || studentId}
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    {['TDYU', s?.course ? `${s.course}-bosqich` : null, s?.faculty, s?.group]
                                        .filter(Boolean).join('   |   ')}
                                </p>
                                {cv.manual.bio
                                    ? <p className="text-sm text-gray-600 mt-2.5 max-w-xl leading-relaxed">{cv.manual.bio}</p>
                                    : (
                                        <p className="text-xs text-gray-400 mt-2.5 max-w-xl leading-relaxed">
                                            Qisqacha ma'lumot, ko'nikmalar, tillar va ish tajribasi hali
                                            kiritilmagan — ular platformada saqlanmaydi, shuning uchun
                                            faqat siz kirita olasiz.
                                        </p>
                                    )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <Ring percent={cv.completeness.percent} />
                                <div>
                                    <p className="text-sm font-bold text-blue-950">
                                        CV {cv.completeness.percent}% tayyor
                                    </p>
                                    <p className="text-[11px] text-gray-400">
                                        {cv.completeness.total} bo'limdan {cv.completeness.filled} tasi
                                    </p>
                                    {cv.completeness.missing.length > 0 && (
                                        <p className="text-[11px] text-amber-700 mt-0.5 max-w-[200px] leading-snug">
                                            Yetishmaydi: {cv.completeness.missing.slice(0, 3).join(', ')}
                                            {cv.completeness.missing.length > 3
                                                ? ` va yana ${cv.completeness.missing.length - 3} ta`
                                                : ''}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* KO'RSATKICHLAR */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <StatCard
                            icon={GraduationCap} label="GPA" value={cv.stats.gpa} unit="4.0"
                            hint={cv.stats.gpaYear || "so'nggi semestr"}
                            source={SOURCE.VERIFIED} missing="hali kiritilmagan"
                        />
                        <StatCard
                            icon={Trophy} label="Yutuqlar" value={cv.stats.awards}
                            hint="sovrinli o'rin" source={SOURCE.VERIFIED}
                        />
                        <StatCard
                            icon={FileText} label="Sertifikatlar" value={cv.stats.certificates}
                            hint="olingan hujjat" source={SOURCE.VERIFIED}
                        />
                        <StatCard
                            icon={Users} label="Klublar" value={cv.stats.clubs}
                            hint="a'zolik" source={SOURCE.AUTO}
                        />
                    </div>

                    {/* CHAP USTUN BO'LIMLARI */}
                    {leftSections.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 divide-y divide-gray-50">
                            {leftSections.map((sec, i) => (
                                <div key={sec.id} className={i > 0 ? 'pt-5 mt-5' : ''}>
                                    <SectionBlock
                                        id={sec.id} title={sec.title}
                                        items={cv.sections[sec.id]} timeline={sec.timeline}
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* FAOLIYAT VA TA'SIR */}
                    {cv.impact.length > 0 && (
                        <div className="bg-slate-50 rounded-2xl border border-gray-100 p-5">
                            <h4 className="flex items-center gap-2 font-bold text-blue-950 text-sm">
                                <span className="w-6 h-6 rounded-lg bg-white text-blue-800 flex items-center justify-center shrink-0">
                                    <Sparkles size={13} />
                                </span>
                                Faoliyat va ta'sir
                            </h4>
                            <p className="text-[11px] text-gray-400 mt-1 mb-3">
                                Faqat platformada tasdiqlangan yozuvlardan hisoblanadi
                            </p>
                            <div className="flex flex-wrap gap-x-8 gap-y-3">
                                {cv.impact.map(m => (
                                    <div key={m.key}>
                                        <p className="text-xl font-black text-blue-950 leading-none tabular-nums">
                                            {m.value}
                                        </p>
                                        <p className="text-[10px] text-gray-400 mt-1">{m.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* O'NG USTUN BO'LIMLARI - keng ekranda alohida ustunda,
                        torida esa shu yerda ketma-ket chiqadi. */}
                    {rightSections.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 divide-y divide-gray-50 xl:hidden">
                            {rightSections.map((sec, i) => (
                                <div key={sec.id} className={i > 0 ? 'pt-5 mt-5' : ''}>
                                    <SectionBlock id={sec.id} title={sec.title} items={cv.sections[sec.id]} />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Hujjat boshqaruvi shu sahifada TAKRORLANMAYDI - u
                        "Yutuq va imkoniyatlar" bo'limining ishi. */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <h4 className="font-bold text-blue-950 text-sm mb-1">Hujjat qo'shish</h4>
                        <p className="text-xs text-gray-500 mb-3 max-w-xl leading-relaxed">
                            Rasmiy diplom va sertifikatlar bu yerga o'zi tushadi. Tashqarida olgan
                            hujjatingizni esa "Yutuq va imkoniyatlar" bo'limida yuklaysiz — CV uni
                            avtomatik oladi.
                        </p>
                        <Link
                            to="/student/achievements?tab=achievements"
                            className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-800 hover:text-blue-900"
                        >
                            Yutuq va imkoniyatlar bo'limi <ArrowRight size={14} />
                        </Link>
                    </div>

                    {cv.isEmpty && (
                        <p className="flex items-start gap-2 text-xs text-gray-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                            <Info size={14} className="shrink-0 mt-px text-gray-400" />
                            <span>
                                CV hali bo'sh. U klubga a'zo bo'lganingizda, tadbirda
                                qatnashganingizda va hujjat olganingizda <b>o'zi to'lib boradi</b> —
                                alohida to'ldirish kerak emas.
                            </span>
                        </p>
                    )}
                </div>

                {/* KENG EKRANDA: o'ngda bo'limlar va CV ko'rinishi */}
                <div className="hidden xl:block w-[360px] shrink-0 space-y-4">
                    {rightSections.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 divide-y divide-gray-50">
                            {rightSections.map((sec, i) => (
                                <div key={sec.id} className={i > 0 ? 'pt-5 mt-5' : ''}>
                                    <SectionBlock id={sec.id} title={sec.title} items={cv.sections[sec.id]} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {previewOpen && (
                    <aside className="w-full xl:w-[430px] shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 xl:sticky xl:top-4">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <h3 className="font-black text-blue-950">CV</h3>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button" onClick={printCv}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50"
                                >
                                    <Printer size={13} /> Chop etish
                                </button>
                                <button
                                    type="button" onClick={() => setPreviewOpen(false)} aria-label="Yopish"
                                    className="w-7 h-7 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex items-center justify-center"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>
                        <CvPreviewDocument studentId={studentId} version={version} />
                    </aside>
                )}
            </div>
        </div>
    );
};

export default CvPortfolioPage;
