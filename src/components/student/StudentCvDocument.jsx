import React, { useMemo } from 'react';
import { db } from '../../services/db';
import { buildStudentPortfolio } from '../../utils/studentPortfolio';

// CV HUJJATI — chop etishga tayyor ko'rinish.
//
// Bu komponent hech narsa TUZMAYDI va hech narsa SO'RAMAYDI: u
// `buildStudentPortfolio` qaytargan yozuvni rasmiy hujjat shakliga
// keltiradi. Ekrandagi kartochkalar "menda nima bor" degan savolga javob
// beradi, bu esa "buni tashqaridagi odamga qanday ko'rsataman" degan
// savolga.
//
// BALL YO'Q. Ijtimoiy faollik indeksi ataylab chiqarilmagan: u ichki,
// rasmiy o'lchov va uni ish beruvchiga ko'rsatish ma'nosiz. Ball va
// mezonlar "Faollik va skoring" bo'limining ishi.
//
// BO'SH BO'LIM CHIZILMAYDI. Ma'lumoti yo'q bo'lim butunlay tushib qoladi -
// "Ish tajribasi: —" degan qator CV ni to'ldirmaydi, aksincha, uni
// tugallanmagan ko'rsatadi.

const Section = ({ title, children }) => (
    <section className="break-inside-avoid">
        <h3 className="text-[11px] font-black tracking-[0.12em] text-slate-500 uppercase border-b border-slate-200 pb-1 mb-2">
            {title}
        </h3>
        {children}
    </section>
);

// Sana faqat YIL sifatida: CV da to'liq sana ortiqcha shovqin.
const yearOf = (d) => {
    if (!d) return null;
    const t = new Date(d);
    return Number.isNaN(t.getTime()) ? null : t.getFullYear();
};

const Row = ({ left, right, sub }) => (
    <div className="flex items-baseline justify-between gap-4 py-1">
        <div className="min-w-0">
            <p className="text-[13px] text-slate-900 leading-snug">{left}</p>
            {sub && <p className="text-[11px] text-slate-500 leading-snug">{sub}</p>}
        </div>
        {right && <p className="text-[11px] text-slate-500 shrink-0 tabular-nums">{right}</p>}
    </div>
);

const StudentCvDocument = ({ studentId, version = 0 }) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const p = useMemo(() => buildStudentPortfolio(db, studentId), [studentId, version]);

    const s = p.student;
    // Sovrinli o'rinlar va qolgan hujjatlar ajratiladi: CV da yutuq
    // ishtirokdan oldin turadi.
    const awards = p.documents.filter(d => d.place);
    const certificates = p.documents.filter(d => !d.place);

    const facts = [
        p.counts.attendance ? `${p.counts.attendance} tadbir va musobaqada ishtirok` : null,
        p.counts.clubs ? `${p.counts.clubs} ta klub a'zoligi` : null,
        p.counts.positions ? `${p.counts.positions} ta lavozim` : null,
        p.counts.books ? `${p.counts.books} ta badiiy asar o'qilgan` : null,
    ].filter(Boolean);

    const empty = p.documents.length === 0 && p.clubs.length === 0
        && p.uploaded.length === 0 && facts.length === 0;

    return (
        <div className="cv-print bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-5 print:shadow-none print:border-0 print:p-0">
            {/* SARLAVHA */}
            <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-3">
                <div className="min-w-0">
                    <h2 className="text-2xl font-black text-slate-900 leading-tight">
                        {s?.fullName || studentId}
                    </h2>
                    <p className="text-[12px] text-slate-600 mt-1">
                        Toshkent davlat yuridik universiteti
                    </p>
                    <p className="text-[12px] text-slate-500">
                        {[s?.faculty, s?.course ? `${s.course}-kurs` : null, s?.group]
                            .filter(Boolean).join(' · ')}
                    </p>
                </div>
                {p.academic.gpa !== null && (
                    <div className="text-right shrink-0">
                        <p className="text-2xl font-black text-slate-900 tabular-nums">{p.academic.gpa}</p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">O'rtacha baho</p>
                    </div>
                )}
            </header>

            {empty && (
                <p className="text-[13px] text-slate-500 leading-relaxed">
                    CV hali bo'sh. U klubga a'zo bo'lganingizda, tadbirda qatnashganingizda
                    va hujjat olganingizda o'zi to'lib boradi — alohida to'ldirish kerak emas.
                </p>
            )}

            <Section title="Ta'lim">
                <Row
                    left="Toshkent davlat yuridik universiteti"
                    sub={[s?.faculty, s?.course ? `${s.course}-kurs` : null].filter(Boolean).join(' · ')}
                    right={p.academic.gpaYear || null}
                />
            </Section>

            {p.clubs.length > 0 && (
                <Section title="Klublar va jamoalar">
                    {p.clubs.map(c => (
                        <Row
                            key={c.clubId}
                            left={c.name}
                            sub={c.positions.length > 0 ? c.positions.join(', ') : "A'zo"}
                            right={yearOf(c.joinedAt)}
                        />
                    ))}
                </Section>
            )}

            {awards.length > 0 && (
                <Section title="Mukofotlar va yutuqlar">
                    {awards.map(d => (
                        <Row
                            key={d.id}
                            left={d.title}
                            sub={[
                                d.place ? `${d.place}-o'rin` : null,
                                d.typeLabel,
                                // Ro'yxat raqami CV ning eng qimmatli qismi:
                                // uni QR orqali tekshirib ko'rish mumkin.
                                d.registrationNumber ? `№ ${d.registrationNumber}` : null,
                            ].filter(Boolean).join(' · ')}
                            right={yearOf(d.date)}
                        />
                    ))}
                </Section>
            )}

            {certificates.length > 0 && (
                <Section title="Sertifikat va ma'lumotnomalar">
                    {certificates.map(d => (
                        <Row
                            key={d.id}
                            left={d.title}
                            sub={[d.typeLabel, d.registrationNumber ? `№ ${d.registrationNumber}` : null]
                                .filter(Boolean).join(' · ')}
                            right={yearOf(d.date)}
                        />
                    ))}
                </Section>
            )}

            {p.uploaded.length > 0 && (
                <Section title="Tashqi hujjatlar">
                    {/* ATAYLAB ALOHIDA: bular talaba o'zi yuklagan hujjatlar.
                        Yuqoridagilar platformaning rasmiy reestridan va ular
                        QR bilan tekshiriladi. Ikkalasini bir ro'yxatga
                        qo'shish tasdiqlangan yozuvlarning qadrini tushirardi. */}
                    <p className="text-[10px] text-slate-400 mb-1">
                        Talabaning o'zi yuklagan — platforma tomonidan tasdiqlanmagan
                    </p>
                    {p.uploaded.map(d => (
                        <Row
                            key={d.id}
                            left={d.title}
                            sub={[d.issuer, d.place ? `${d.place}-o'rin` : null].filter(Boolean).join(' · ')}
                            right={yearOf(d.issuedAt || d.createdAt)}
                        />
                    ))}
                </Section>
            )}

            {facts.length > 0 && (
                <Section title="Faoliyat">
                    <ul className="list-disc pl-4 space-y-0.5">
                        {facts.map(f => (
                            <li key={f} className="text-[13px] text-slate-800 leading-snug">{f}</li>
                        ))}
                    </ul>
                </Section>
            )}

            <footer className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
                <p className="text-[10px] text-slate-400">
                    Toshkent davlat yuridik universiteti · UniPlatform
                </p>
                <p className="text-[10px] text-slate-400">
                    {new Date().toLocaleDateString('uz-UZ')} holatiga
                </p>
            </footer>
        </div>
    );
};

export default StudentCvDocument;
