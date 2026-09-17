import React, { useMemo } from 'react';
import {
    Mail, Phone, MapPin, Link2, User, GraduationCap, Briefcase, Building2,
    FolderKanban, Wrench, Languages, FileText, Users, Heart, Trophy, Medal,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../../services/db';
import { buildCv, SOURCE } from '../../utils/cvEngine';

// A4 CV — CHOP ETISH KO'RINISHI.
//
// Bu ekrandagi ish maydonidan ALOHIDA. Ish maydoni "menda nima bor va
// nimasi yetishmaydi" ni ko'rsatadi; bu esa tashqaridagi odam qo'liga
// oladigan hujjat. Shu sababli bu yerda tasdiq belgilari, to'liqlik
// foizi va tugmalar YO'Q - ular ish quroli, hujjatning qismi emas.
//
// BO'SH BO'LIM CHIZILMAYDI. "Ish tajribasi: —" degan qator CV ni
// to'ldirmaydi, aksincha tugallanmagan ko'rsatadi.

const SECTION_ICONS = {
    about: User,
    education: GraduationCap,
    experience: Briefcase,
    internships: Building2,
    projects: FolderKanban,
    skills: Wrench,
    languages: Languages,
    certificates: FileText,
    clubs: Users,
    volunteering: Heart,
    awards: Trophy,
    competitions: Medal,
};

const Section = ({ id, title, children }) => {
    const Icon = SECTION_ICONS[id] || FileText;
    return (
        <section className="break-inside-avoid">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-1 mb-2">
                <Icon size={13} className="text-blue-800 shrink-0" />
                <h3 className="text-[10px] font-black tracking-[0.14em] text-blue-900 uppercase">
                    {title}
                </h3>
            </div>
            {children}
        </section>
    );
};

// QR FAQAT TASDIQLANGAN HUJJATDA. Talaba o'zi yuklagan hujjatda
// tekshirish tokeni yo'q, ya'ni QR ham bo'lmaydi - ikkalasini bir xil
// ko'rsatish tashqi o'quvchini chalg'itardi.
//
// Manzil `window.location.origin` dan olinadi: loyihada bir joyda
// `uniplatform.uz` qotirib yozilgan, lekin jonli sayt boshqa domenda -
// bosilgan QR mavjud bo'lmagan manzilga olib borsa, u umuman
// bo'lmaganidan yomonroq.
const Entry = ({ item }) => (
    <div className="py-1 flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-4">
                <p className="text-[12px] font-bold text-slate-900 leading-snug">
                    {item.title}
                    {item.subtitle && (
                        <span className="font-normal text-slate-500"> — {item.subtitle}</span>
                    )}
                </p>
                {item.period && (
                    <p className="text-[10px] text-slate-500 shrink-0 tabular-nums">{item.period}</p>
                )}
            </div>
            {item.note && (
                <p className="text-[10.5px] text-slate-500 leading-snug mt-0.5 pl-3 relative">
                    <span className="absolute left-0 top-[6px] w-1 h-1 rounded-full bg-slate-300" />
                    {item.note}
                </p>
            )}
        </div>
        {item.verifyToken && (
            <span className="shrink-0 flex flex-col items-center gap-0.5">
                <QRCodeSVG value={`${window.location.origin}/verify/${item.verifyToken}`} size={40} />
                <span className="text-[7px] text-slate-400 leading-none">tekshirish</span>
            </span>
        )}
    </div>
);

const Chips = ({ items }) => (
    <div className="flex flex-wrap gap-1.5">
        {items.map(x => (
            <span
                key={x.id}
                className="px-2 py-0.5 rounded-md bg-slate-100 text-[10.5px] font-semibold text-slate-700"
            >
                {x.title}{x.subtitle ? ` (${x.subtitle})` : ''}
            </span>
        ))}
    </div>
);

const initialsOf = (name) => (name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

const CvPreviewDocument = ({ studentId, version = 0, contactOverride = null, showMetrics = true }) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const cv = useMemo(() => buildCv(db, studentId), [studentId, version]);
    const s = cv.student;
    const links = cv.manual.links || {};
    const hidden = new Set(cv.manual.hiddenSections || []);

    // ALOQA IKKI MANBADAN.
    //
    // Talabaning O'Z sahifasida - o'zi kiritgan `links`. Xodim ko'rinishida
    // esa `contactOverride` beriladi va u `db.getStudentContact` dan, ya'ni
    // PASPORT QOIDALARI bo'yicha keladi. Ikkinchi holatda `links` dagi
    // shaxsiy maydonlar ATAYLAB olinmaydi: ular filtrlanmagan va xodim
    // ko'rinishida pasport cheklovini chetlab o'tgan bo'lardi.
    const contacts = (contactOverride
        ? [
            contactOverride.phone ? { icon: Phone, text: contactOverride.phone } : null,
            contactOverride.email ? { icon: Mail, text: contactOverride.email } : null,
        ]
        : [
            links.phone ? { icon: Phone, text: links.phone } : null,
            links.email ? { icon: Mail, text: links.email } : null,
            links.location ? { icon: MapPin, text: links.location } : null,
            links.linkedin ? { icon: Link2, text: links.linkedin } : null,
            links.portfolio ? { icon: Link2, text: links.portfolio } : null,
        ]
    ).filter(Boolean);

    const show = (id) => !hidden.has(id) && (cv.sections[id] || []).length > 0;

    // Atamalar `PortfolioSummary` dagi bilan AYNAN bir xil - bitta raqam
    // ikki joyda ikki xil nomlanmasin.
    const TREND_LABELS = { up: "o'sish", down: 'pasayish', stable: 'barqaror' };
    const st = cv.stats;
    const metrics = [
        st.gpa !== null && st.gpa !== undefined ? {
            key: 'gpa', label: 'GPA', value: st.gpa,
            hint: st.gpaTrend
                ? `${TREND_LABELS[st.gpaTrend]}${st.gpaDelta ? ` ${st.gpaDelta > 0 ? '+' : ''}${st.gpaDelta}` : ''}`
                : null,
        } : null,
        st.socialIndex !== null && st.socialIndex !== undefined ? {
            key: 'index', label: 'Ijtimoiy faollik indeksi', value: `${st.socialIndex} / 100`,
            hint: null,
        } : null,
        st.books > 0 ? {
            key: 'books', label: "O'qilgan asarlar", value: st.books,
            hint: st.totalBooks ? `${st.totalBooks} tadan` : null,
        } : null,
    ].filter(Boolean);

    return (
        <div className="cv-print bg-white rounded-xl border border-slate-200 p-7 space-y-4 print:border-0 print:rounded-none print:p-0">
            {/* SARLAVHA */}
            <header className="flex items-start gap-4 border-b-2 border-blue-900 pb-3">
                <div className="w-[68px] h-[68px] rounded-full bg-blue-50 text-blue-900 flex items-center justify-center text-xl font-black shrink-0">
                    {initialsOf(s?.fullName)}
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-[21px] font-black text-blue-950 leading-tight">
                        {s?.fullName || studentId}
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        {['TDYU', s?.course ? `${s.course}-bosqich` : null, s?.faculty]
                            .filter(Boolean).join('  |  ')}
                    </p>
                    {contacts.length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                            {contacts.map(c => (
                                <span key={c.text} className="flex items-center gap-1.5 text-[10.5px] text-slate-600">
                                    <c.icon size={11} className="text-blue-700 shrink-0" /> {c.text}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </header>

            {/* KO'RSATKICHLAR CHIZIG'I.
                Platformaning eng qimmatli uchta raqami shu paytgacha faqat
                ekranda turardi: ijtimoiy faollik indeksi, o'qilgan asarlar
                va GPA dinamikasi. Ular hujjatda yo'q edi, holbuki aynan
                shular CV ni oddiy qo'lda yozilgan CV dan ajratib turadi.

                HAR BIRI FAQAT HAQIQATAN MAVJUD BO'LSA chiziladi. Bo'sh
                qiymat "0" bo'lib chiqmaydi - nol "faolligi yo'q" degan
                da'vo bo'lardi, holbuki ma'lumot shunchaki hisoblanmagan. */}
            {/* XODIM KO'RINISHIDA BU CHIZIQ O'CHIRILADI (`showMetrics=false`).
                Sababi takrorlanish: admin/rahbariyat modalida GPA, ijtimoiy
                indeks va kitoblar ALLAQACHON bor, ustiga u yerda 186-buyruq
                bo'yicha 11 mezonning tafsiloti, manbasi va jarimasi ham
                ko'rsatiladi - ya'ni o'sha raqamlar boyroq shaklda turadi.
                Talabaning O'Z sahifasida esa hech narsa o'zgarmaydi: sukut
                qiymat `true`. */}
            {showMetrics && metrics.length > 0 && (
                <div className="flex flex-wrap gap-x-6 gap-y-1.5 pb-1">
                    {metrics.map(m => (
                        <div key={m.key} className="flex items-baseline gap-1.5">
                            <span className="text-[9.5px] font-black tracking-[0.1em] text-blue-900 uppercase">
                                {m.label}
                            </span>
                            <span className="text-[11.5px] font-bold text-slate-900 tabular-nums">{m.value}</span>
                            {m.hint && <span className="text-[9.5px] text-slate-500">{m.hint}</span>}
                        </div>
                    ))}
                </div>
            )}

            {cv.isEmpty && (
                <p className="text-[12px] text-slate-500 leading-relaxed">
                    CV hali bo'sh. U klubga a'zo bo'lganingizda, tadbirda qatnashganingizda
                    va hujjat olganingizda o'zi to'lib boradi.
                </p>
            )}

            {show('about') && (
                <Section id="about" title="Qisqacha ma'lumot">
                    <p className="text-[11.5px] text-slate-700 leading-relaxed">
                        {cv.sections.about[0].title}
                    </p>
                </Section>
            )}

            {['education', 'experience', 'internships', 'projects'].map(id => (
                show(id) && (
                    <Section
                        key={id}
                        id={id}
                        title={{
                            education: "Ta'lim",
                            experience: 'Ish tajribasi',
                            internships: 'Amaliyot',
                            projects: 'Loyihalar',
                        }[id]}
                    >
                        {cv.sections[id].map(item => <Entry key={item.id} item={item} />)}
                    </Section>
                )
            ))}

            {show('skills') && (
                <Section id="skills" title="Ko'nikmalar">
                    <Chips items={cv.sections.skills} />
                </Section>
            )}

            {show('languages') && (
                <Section id="languages" title="Tillar">
                    <Chips items={cv.sections.languages} />
                </Section>
            )}

            {['certificates', 'clubs', 'volunteering', 'awards', 'competitions'].map(id => (
                show(id) && (
                    <Section
                        key={id}
                        id={id}
                        title={{
                            certificates: 'Sertifikatlar',
                            clubs: 'Klublar va jamoalar',
                            volunteering: 'Volontyorlik',
                            awards: 'Mukofotlar va yutuqlar',
                            competitions: 'Tanlov va musobaqalar',
                        }[id]}
                    >
                        {cv.sections[id].map(item => <Entry key={item.id} item={item} />)}
                    </Section>
                )
            ))}

            <footer className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
                <p className="text-[9.5px] text-slate-400">
                    Toshkent davlat yuridik universiteti
                </p>
                {/* Rasmiy hujjatlar QR bilan tekshiriladi - CV ning o'zi
                    emas. Shuning uchun bu yerda "tekshirilgan" degan
                    da'vo yo'q: u faqat qatorlar yonidagi belgilarga
                    tegishli va u ish maydonida ko'rinadi. */}
                <p className="text-[9.5px] text-slate-400">
                    UniPlatform · {new Date().toLocaleDateString('uz-UZ')}
                </p>
            </footer>
        </div>
    );
};

export default CvPreviewDocument;
export { SOURCE };
