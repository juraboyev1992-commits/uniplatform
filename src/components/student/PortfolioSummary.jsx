import React, { useMemo } from 'react';
import {
    GraduationCap, Users, Trophy, BookOpen, CalendarCheck, Info,
    BadgeCheck, Briefcase, Layers, Award, FileText, Star, Sparkles,
} from 'lucide-react';
import { db } from '../../services/db';
import { buildStudentPortfolio } from '../../utils/studentPortfolio';

// CV / PORTFOLIO KO'RINISHI.
//
// Bu ko'rinish hech narsa TUZMAYDI - u platformadagi mavjud yozuvni bir
// joyga yig'adi (izohi utils/studentPortfolio.js da). Shu sababli har
// qatorning ortida tasdiqlangan manba turadi: ro'yxatga olish raqami bor
// hujjat, qulflangan davomat, tyutor tasdiqlagan baho.
//
// `null` NOL EMAS: GPA kiritilmagan bo'lsa "kiritilmagan" deb yoziladi.
// "0.0" deb ko'rsatish talabani past ko'rsatgan yolg'on bo'lardi.
//
// BALL YO'Q. Ijtimoiy faollik indeksi ataylab chiqarilmagan: u ichki,
// rasmiy o'lchov va "Faollik va skoring" bo'limining ishi. Bir narsa ikki
// bo'limda ikki xil raqam bilan ko'rinmasligi kerak.
//
// BO'SH BO'LIM CHIZILMAYDI. Ma'lumoti yo'q bo'lim butunlay tushib qoladi.
// Maketda ko'nikma, til va ish tajribasi bo'limlari ham bor - ular uchun
// platformada hozircha MANBA YO'Q, shuning uchun ular chizilmaydi. Bo'sh
// bo'limni ko'rsatish CV ni to'ldirmaydi, tugallanmagan ko'rsatadi.

const dash = (v) => (v === null || v === undefined ? null : v);

// Yashil tasdiq belgisi. Ikki xil matn: "Tasdiqlangan" - odam tekshirgan,
// "Avtomatik" - platformaning o'z yozuvidan olingan. Farqi muhim, shuning
// uchun bitta umumiy so'z bilan almashtirilmadi.
const Verified = ({ label = 'Avtomatik' }) => (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold whitespace-nowrap">
        <BadgeCheck size={11} /> {label}
    </span>
);

const StatCard = ({ icon: Icon, label, value, unit, hint, badge, missing }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                <Icon size={16} />
            </span>
            <span className="text-xs font-bold text-gray-600">{label}</span>
        </div>
        {value === null ? (
            <>
                <p className="text-2xl font-black text-gray-300 leading-none">—</p>
                <p className="text-[11px] text-gray-400 mt-1.5">{missing || "ma'lumot yo'q"}</p>
            </>
        ) : (
            <>
                <p className="text-2xl font-black text-gray-900 leading-none tabular-nums">
                    {value}
                    {unit && <span className="text-sm font-bold text-gray-400"> / {unit}</span>}
                </p>
                <p className="text-[11px] text-gray-400 mt-1.5">{hint}</p>
            </>
        )}
        {value !== null && badge && <div className="mt-2"><Verified label={badge} /></div>}
    </div>
);

const SectionCard = ({ icon: Icon, title, action, children }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
            <h4 className="flex items-center gap-2 font-bold text-gray-900 text-sm">
                <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                    <Icon size={13} />
                </span>
                {title}
            </h4>
            {action}
        </div>
        {children}
    </div>
);

// Vaqt chizig'idagi yozuv - chap chetida nuqta va ustun chizig'i.
const TimelineItem = ({ title, subtitle, note, right, badge, last }) => (
    <div className="relative pl-5 pb-3 last:pb-0">
        <span className="absolute left-0 top-1.5 w-2 h-2 rounded-full border-2 border-blue-600 bg-white" />
        {!last && <span className="absolute left-[3px] top-4 bottom-0 w-px bg-gray-100" />}
        <div className="flex items-start justify-between gap-3 flex-wrap">
            <p className="text-sm font-bold text-gray-900 leading-snug">{title}</p>
            {right && <p className="text-[11px] text-gray-400 shrink-0 tabular-nums">{right}</p>}
        </div>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        <div className="flex items-center justify-between gap-3 flex-wrap mt-1">
            {note && <p className="text-xs text-gray-500 leading-snug">{note}</p>}
            {badge && <Verified label={badge} />}
        </div>
    </div>
);

const yearOf = (d) => {
    if (!d) return null;
    const t = new Date(d);
    return Number.isNaN(t.getTime()) ? null : t.getFullYear();
};

// CV TO'LIQLIGI.
//
// Foiz o'ylab topilmaydi - u SANALADIGAN narsa: CV ning nechta bo'limi
// to'lgan. Maxraj ko'rinib turadi va nima yetishmayotgani ro'yxat bilan
// aytiladi, aks holda raqam hech narsa anglatmaydi.
const completeness = (p) => {
    const parts = [
        { key: "Ta'lim", ok: !!p.student },
        { key: "O'rtacha baho", ok: p.academic.gpa !== null },
        { key: 'Klub faoliyati', ok: p.clubs.length > 0 },
        { key: 'Rasmiy hujjatlar', ok: p.documents.length > 0 },
        { key: 'Tadbirlarda ishtirok', ok: p.counts.attendance > 0 },
        { key: "O'qilgan asarlar", ok: p.counts.books > 0 },
    ];
    const done = parts.filter(x => x.ok).length;
    return {
        percent: Math.round((done / parts.length) * 100),
        done,
        total: parts.length,
        missing: parts.filter(x => !x.ok).map(x => x.key),
    };
};

const Ring = ({ percent }) => {
    const r = 26;
    const c = 2 * Math.PI * r;
    return (
        <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0">
            <circle cx="32" cy="32" r={r} fill="none" stroke="#e5e7eb" strokeWidth="6" />
            <circle
                cx="32" cy="32" r={r} fill="none" stroke="#1d4ed8" strokeWidth="6"
                strokeLinecap="round" strokeDasharray={`${(c * percent) / 100} ${c}`}
                transform="rotate(-90 32 32)"
            />
            <text x="32" y="36" textAnchor="middle" className="fill-gray-900"
                style={{ fontSize: '14px', fontWeight: 800 }}>
                {percent}%
            </text>
        </svg>
    );
};

const initialsOf = (name) => (name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

const PortfolioSummary = ({ studentId, version = 0, onOpenCv }) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const p = useMemo(() => buildStudentPortfolio(db, studentId), [studentId, version]);

    const s = p.student;
    const comp = completeness(p);
    const awards = p.documents.filter(d => d.place);
    const certificates = p.documents.filter(d => !d.place);

    const impact = [
        { icon: CalendarCheck, value: p.counts.attendance, label: 'Tadbir va musobaqa' },
        { icon: Users, value: p.counts.clubs, label: 'Klub' },
        { icon: Star, value: p.counts.positions, label: 'Lavozim' },
        { icon: Trophy, value: p.counts.prizes, label: "Sovrinli o'rin" },
        { icon: BookOpen, value: p.counts.books, label: "O'qilgan asar" },
    ].filter(x => x.value > 0);

    return (
        <div className="space-y-4">
            {/* SHAXSIY MA'LUMOT */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-start gap-5 flex-wrap">
                    {/* Foto o'rniga bosh harflar: platformada talaba surati
                        saqlanmaydi va bo'sh doira qo'yish sahifani buzardi. */}
                    <div className="w-20 h-20 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-2xl font-black shrink-0">
                        {initialsOf(s?.fullName)}
                    </div>

                    <div className="min-w-0 flex-1">
                        <h3 className="text-2xl font-black text-gray-900 leading-tight">
                            {s?.fullName || studentId}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                            {['TDYU', s?.course ? `${s.course}-kurs` : null, s?.faculty, s?.group]
                                .filter(Boolean).join('  ·  ')}
                        </p>
                        <p className="text-xs text-gray-400 mt-2 max-w-xl leading-relaxed">
                            Bu sahifadagi hamma narsa platformadagi yozuvingizdan avtomatik
                            yig'iladi. Siz hech narsa kiritmaysiz va hech narsani
                            tasdiqlatishingiz shart emas.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <Ring percent={comp.percent} />
                        <div>
                            <p className="text-sm font-bold text-gray-900">CV to'liqligi</p>
                            <p className="text-[11px] text-gray-400">
                                {comp.total} bo'limdan {comp.done} tasi to'lgan
                            </p>
                            {comp.missing.length > 0 && (
                                <p className="text-[11px] text-amber-700 mt-0.5 max-w-[190px] leading-snug">
                                    Yetishmaydi: {comp.missing.join(', ')}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {onOpenCv && (
                    <div className="mt-4 pt-4 border-t border-gray-50">
                        <button
                            type="button"
                            onClick={onOpenCv}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold transition-colors"
                        >
                            <FileText size={15} /> CV ko'rinishi va chop etish
                        </button>
                    </div>
                )}
            </div>

            {/* RAQAMLAR */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard
                    icon={GraduationCap} label="O'rtacha baho"
                    value={dash(p.academic.gpa)}
                    hint={p.academic.gpaYear || "so'nggi semestr"}
                    badge="Tasdiqlangan" missing="hali kiritilmagan"
                />
                <StatCard
                    icon={Trophy} label="Rasmiy hujjatlar"
                    value={p.counts.documents}
                    hint={p.counts.prizes > 0 ? `${p.counts.prizes} tasi sovrinli o'rin` : "sovrinli o'rin yo'q"}
                    badge="Avtomatik"
                />
                <StatCard
                    icon={Users} label="Klublar"
                    value={p.counts.clubs}
                    hint={p.counts.positions > 0 ? `${p.counts.positions} tasida lavozimda` : "a'zo"}
                    badge="Avtomatik"
                />
                <StatCard
                    icon={CalendarCheck} label="Ishtirok"
                    value={p.counts.attendance}
                    hint="tadbir va musobaqada"
                    badge="Avtomatik"
                />
            </div>

            {/* IKKI USTUN */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                <div className="lg:col-span-2 space-y-4">
                    <SectionCard icon={GraduationCap} title="Ta'lim">
                        <TimelineItem
                            last
                            title="Toshkent davlat yuridik universiteti"
                            subtitle={[s?.faculty, s?.course ? `${s.course}-kurs` : null, s?.group]
                                .filter(Boolean).join('  |  ')}
                            note={p.academic.gpa !== null ? `O'rtacha baho: ${p.academic.gpa}` : null}
                            right={p.academic.gpaYear || null}
                            badge="Avtomatik"
                        />
                    </SectionCard>

                    {p.clubs.length > 0 && (
                        <SectionCard icon={Users} title="Klublar va jamoalar">
                            {p.clubs.map((c, i) => (
                                <TimelineItem
                                    key={c.clubId}
                                    last={i === p.clubs.length - 1}
                                    title={c.name}
                                    subtitle={c.positions.length > 0 ? c.positions.join(', ') : "A'zo"}
                                    right={yearOf(c.joinedAt)}
                                    badge="Avtomatik"
                                />
                            ))}
                        </SectionCard>
                    )}

                    {impact.length > 0 && (
                        <SectionCard icon={Sparkles} title="Faoliyat va ta'sir">
                            <p className="text-[11px] text-gray-400 -mt-2 mb-3">
                                Faolligingiz raqamlar bilan
                            </p>
                            <div className="flex flex-wrap gap-x-6 gap-y-3">
                                {impact.map(m => (
                                    <div key={m.label} className="flex items-center gap-2">
                                        <m.icon size={15} className="text-gray-400 shrink-0" />
                                        <div>
                                            <p className="text-lg font-black text-gray-900 leading-none tabular-nums">
                                                {m.value}
                                            </p>
                                            <p className="text-[10px] text-gray-400 mt-0.5">{m.label}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </SectionCard>
                    )}
                </div>

                <div className="space-y-4">
                    {awards.length > 0 && (
                        <SectionCard icon={Award} title="Mukofotlar va yutuqlar">
                            <div className="space-y-2.5">
                                {awards.slice(0, 5).map(d => (
                                    <div key={d.id} className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-gray-900 truncate">{d.title}</p>
                                            <p className="text-[10px] text-gray-400">
                                                {[d.place ? `${d.place}-o'rin` : null, yearOf(d.date)]
                                                    .filter(Boolean).join('  ·  ')}
                                            </p>
                                        </div>
                                        <Verified label="Tasdiqlangan" />
                                    </div>
                                ))}
                            </div>
                            {awards.length > 5 && (
                                <p className="text-[11px] text-gray-400 mt-2.5">
                                    Yana {awards.length - 5} ta — to'liq ro'yxat quyida.
                                </p>
                            )}
                        </SectionCard>
                    )}

                    {certificates.length > 0 && (
                        <SectionCard icon={FileText} title="Sertifikat va ma'lumotnomalar">
                            <div className="space-y-2.5">
                                {certificates.slice(0, 5).map(d => (
                                    <div key={d.id} className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-gray-900 truncate">{d.title}</p>
                                            <p className="text-[10px] text-gray-400 truncate">
                                                {[d.typeLabel, yearOf(d.date)].filter(Boolean).join('  ·  ')}
                                            </p>
                                        </div>
                                        <Verified label="Tasdiqlangan" />
                                    </div>
                                ))}
                            </div>
                            {certificates.length > 5 && (
                                <p className="text-[11px] text-gray-400 mt-2.5">
                                    Yana {certificates.length - 5} ta — to'liq ro'yxat quyida.
                                </p>
                            )}
                        </SectionCard>
                    )}

                    {p.uploaded.length > 0 && (
                        <SectionCard icon={Briefcase} title="Tashqi hujjatlar">
                            {/* ATAYLAB ALOHIDA va tasdiq belgisisiz: bular
                                talabaning o'zi yuklagan hujjatlari. Yuqoridagilar
                                rasmiy reestrdan va QR bilan tekshiriladi. */}
                            <p className="text-[10px] text-gray-400 -mt-2 mb-2.5">
                                O'zingiz yuklagan — platforma tasdiqlamagan
                            </p>
                            <div className="space-y-2">
                                {p.uploaded.slice(0, 5).map(d => (
                                    <div key={d.id} className="min-w-0">
                                        <p className="text-xs font-bold text-gray-900 truncate">{d.title}</p>
                                        <p className="text-[10px] text-gray-400 truncate">
                                            {[d.issuer, yearOf(d.issuedAt || d.createdAt)]
                                                .filter(Boolean).join('  ·  ')}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </SectionCard>
                    )}

                    {p.counts.books > 0 && (
                        <SectionCard icon={BookOpen} title="Kitobxonlik">
                            <p className="text-2xl font-black text-gray-900 leading-none tabular-nums">
                                {p.counts.books}
                                <span className="text-sm font-bold text-gray-400"> / {p.counts.totalBooks}</span>
                            </p>
                            <p className="text-[11px] text-gray-400 mt-1.5">
                                asar bo'yicha test topshirilgan
                            </p>
                        </SectionCard>
                    )}
                </div>
            </div>

            {p.documents.length === 0 && p.counts.clubs === 0 && (
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
    );
};

export default PortfolioSummary;
