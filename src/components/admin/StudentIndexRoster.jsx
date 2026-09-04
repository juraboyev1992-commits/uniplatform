import React, { useEffect, useMemo, useState } from 'react';
import { Search, Eye, FileText, CheckCircle2, Clock, XCircle, Minus, ChevronDown, ChevronRight, User, X, CreditCard } from 'lucide-react';
import Modal from '../common/Modal';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Pagination from '../common/Pagination';
import { db, getCurrentAcademicYear } from '../../services/db';
import { PAGINATION } from '../../constants/index.js';
import {
    needsConfirmation, INDEX_TOTAL_MAX, INDEX_CRITERIA, INDEX_CRITERIA_ORDER,
} from '../../config/socialActivityIndex';

import { criterionVisual } from '../../config/criterionVisuals';
import StudentPassportCard from '../student/StudentPassportCard';

// TALABALAR KESIMI — 11 mezon bo'yicha holat.
//
// Indeks talaba kesimida HISOBLANADI, saqlanmaydi: davomat, GPA, test natijasi
// o'zgarsa raqam ham o'zgarishi kerak. Shuning uchun bu yerda ham har safar
// jonli hisoblanadi.
//
// AMMO: 550 ta talabaning indeksini bir vaqtda hisoblash mumkin emas - har
// hisob localStorage ni qayta o'qiydi. Shuning uchun indeks FAQAT joriy
// sahifadagi talabalar uchun hisoblanadi. Umumiy reyting alohida bo'limda.
const EVIDENCE_STATUS = {
    pending: { label: 'Ko\'rib chiqilmoqda', variant: 'warning', icon: Clock },
    accepted: { label: 'Qabul qilindi', variant: 'success', icon: CheckCircle2 },
    returned: { label: 'Qaytarildi', variant: 'warning', icon: Clock },
    rejected: { label: 'Rad etildi', variant: 'danger', icon: XCircle },
};

// Foizga qarab rang - butun sahifada bir xil til: chiziqda ham, halqada ham.
const scoreColor = (percent) =>
    percent >= 80 ? '#10b981'
        : percent >= 50 ? '#6366f1'
            : percent > 0 ? '#f59e0b'
                : '#fb7185';

// TALABA FOTOSI.
//
// Platformada hozircha talaba fotosi saqlanmaydi - profilda ham, sintetik
// ma'lumotda ham bunday maydon yo'q. Shuning uchun foto BO'LSA ko'rsatiladi,
// bo'lmasa bosh harflar chiqadi. Maydon keyin qo'shilsa (`photoUrl` yoki
// `avatarUrl`) bu yer o'zgarishsiz ishlab ketadi.
const StudentPhoto = ({ student }) => {
    const [failed, setFailed] = useState(false);
    const src = student.photoUrl || student.avatarUrl || null;
    const initials = String(student.fullName || '')
        .split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

    return (
        <div className="flex flex-col items-center gap-2">
            {src && !failed ? (
                <img
                    src={src} alt={student.fullName} onError={() => setFailed(true)}
                    className="w-24 h-28 object-cover rounded-2xl border border-gray-200 bg-white"
                />
            ) : (
                <div className="w-24 h-28 rounded-2xl border border-gray-200 bg-white flex flex-col items-center justify-center gap-1">
                    <span className="text-2xl font-extrabold text-indigo-500">{initials || '?'}</span>
                    <User size={14} className="text-gray-300" />
                </div>
            )}
            <p className="text-[10px] text-gray-400 font-bold tabular-nums">{student.id}</p>
        </div>
    );
};

// UMUMIY BALL - yarim doira ko'rsatkich.
//
// Shkala (0 · 25 · 50 · 75 · 100) ATAYLAB chiziladi: "72,5" raqamining o'zi
// nimaga nisbatan ekanini aytmaydi. Metodikada maksimal 100 ball, shuni
// ko'rsatib turish kerak.
const Gauge = ({ value, max }) => {
    const W = 240, STROKE = 16;
    const R = (W - STROKE) / 2;
    const cx = W / 2, cy = R + STROKE / 2;
    const C = Math.PI * R;
    const percent = Math.max(0, Math.min(100, (value / max) * 100));
    const arc = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;

    // Shkala yozuvlari - 180 daraja bo'ylab teng taqsimlangan.
    const ticks = [0, 25, 50, 75, 100].map(t => {
        const a = Math.PI - (t / 100) * Math.PI;
        return { t, x: cx + (R + 16) * Math.cos(a), y: cy - (R + 16) * Math.sin(a) };
    });

    return (
        <svg width={W} height={cy + 34} viewBox={`0 0 ${W} ${cy + 34}`} className="shrink-0 overflow-visible">
            <path d={arc} fill="none" stroke="#e5e7eb" strokeWidth={STROKE} strokeLinecap="round" />
            <path
                d={arc} fill="none" stroke={scoreColor(percent)} strokeWidth={STROKE} strokeLinecap="round"
                strokeDasharray={`${(percent / 100) * C} ${C}`}
            />
            {ticks.map(({ t, x, y }) => (
                <text
                    key={t} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
                    fontSize="10" fill="#9ca3af" className="font-bold tabular-nums"
                >
                    {t}
                </text>
            ))}
            <text
                x={cx} y={cy - 22} textAnchor="middle"
                fontSize="34" fill="#111827" className="font-extrabold tabular-nums"
            >
                {value.toFixed(1)}
            </text>
            <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fill="#6b7280" className="font-bold">
                / {max} ball
            </text>
        </svg>
    );
};

// Kichik ko'rsatkichlar - "qayerdan shakllangan" javobini bir qatorda beradi.
const Fact = ({ label, value }) => (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-gray-50 last:border-0">
        <span className="text-[11px] text-gray-500">{label}</span>
        <span className="text-[11px] font-semibold text-gray-800 tabular-nums text-right">{value}</span>
    </div>
);

// BALL QAYERDAN SHAKLLANGAN.
//
// Har mezonning hisob manbai boshqa, shuning uchun umumiy jadval bo'lishi
// mumkin emas: GPA bitta raqamdan, klub bali klublar kesimidan, intizom esa
// AYIRISH orqali chiqadi. Har biri o'z tilida ko'rsatiladi.
const CriterionDetail = ({ criterion }) => {
    const d = criterion.detail;
    if (!d) return null;

    switch (criterion.key) {
        case 'ACADEMIC':
            return (
                <div>
                    <Fact label="O'quv yili GPA" value={d.gpa} />
                    {d.semesters > 1 && <Fact label="Semestrlar soni" value={`${d.semesters} ta (o'rtachasi)`} />}
                    {Array.isArray(d.sources) && d.sources.length > 0 && (
                        <Fact label="Manba" value={d.sources.includes('hemis') ? 'HEMIS' : "Qo'lda kiritilgan"} />
                    )}
                    <p className="text-[11px] text-gray-400 mt-2">
                        Ball metodikaning rasmiy GPA jadvali bo'yicha: 5,0 → 10 ball … 3,5 → 5 ball.
                    </p>
                </div>
            );

        case 'READING':
            return (
                <div>
                    <Fact label="Testdan o'tilgan asarlar" value={`${d.booksPassed} ta`} />
                    <Fact label="Platformadagi kitobxonlik testlari" value={`${d.availableTests} ta`} />
                    <p className="text-[11px] text-gray-400 mt-2">
                        Ball ASAR soniga qarab beriladi — bir asarni qayta topshirish sonni oshirmaydi.
                    </p>
                </div>
            );

        case 'COMPETITIONS':
            return (
                <div>
                    {/* BARCHA natijalar ko'rsatiladi, faqat g'olibi emas.
                        Metodikada natijalarni qo'shish qoidasi yo'q - eng
                        yuqorisi olinadi. Qolganlari yo'qolgani emas, shunchaki
                        hisobga kirmagani; buni ochiq ko'rsatish kerak. */}
                    {d.candidates?.length > 0 ? (
                        d.candidates
                            .slice()
                            .sort((a, b) => b.points - a.points)
                            .map((c, i) => (
                                <Fact
                                    key={c.documentId || c.evidenceId}
                                    label={
                                        (c.origin === 'internal' ? 'Platformada: ' : 'Tashqi hujjat: ')
                                        + (INDEX_CRITERIA.COMPETITIONS.placement[c.level]?.label || c.level)
                                        + `, ${c.place}-o'rin`
                                    }
                                    value={i === 0 ? `${c.points} ball · hisobga olindi` : `${c.points} ball`}
                                />
                            ))
                    ) : (
                        <Fact label="Sovrinli o'rin hujjatlari" value={`${d.documents || 0} ta`} />
                    )}
                    {d.waiting?.length > 0 && (
                        <p className="text-[11px] text-amber-700 mt-2">
                            {d.waiting.length} ta hujjat ko'rib chiqilmoqda — tasdiqlansa ball o'zgarishi mumkin.
                        </p>
                    )}
                    {/* Yashirilmaydigan soddalashtirish. */}
                    {d.officialListChecked === false && (
                        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mt-2">
                            Metodikaning "faqat vazirlik ro'yxatidagi tanlovlar" sharti hozircha
                            tekshirilmaydi — platformada bunday ro'yxat yo'q.
                        </p>
                    )}
                </div>
            );

        case 'CLUBS':
            if (d.manual) {
                return (
                    <div>
                        <Fact label="Baholadi" value={d.assessedBy || "Mas'ul"} />
                        {d.comment && <Fact label="Izoh" value={d.comment} />}
                        <p className="text-[11px] text-gray-400 mt-2">
                            Qo'lda qo'yilgan baho avtomatik hisobdan ustun turadi — metodikada ball
                            to'garak rahbarining ma'lumotnomasi asosida beriladi.
                        </p>
                    </div>
                );
            }
            if (d.headCoordinatorOf) {
                return (
                    <div>
                        <Fact label="Asosiy koordinator" value={d.headCoordinatorOf.join(', ')} />
                        <p className="text-[11px] text-gray-400 mt-2">
                            To'garak tashkil etgan talaba maksimal ball oladi.
                        </p>
                    </div>
                );
            }
            return (
                <div className="space-y-3">
                    {d.perDirection?.length > 0 && (
                        <div>
                            <p className="text-[11px] font-bold text-gray-600 mb-1">Yo'nalishlar bo'yicha ball</p>
                            {d.perDirection.map(x => (
                                <Fact
                                    key={x.key}
                                    label={`${x.label} — ${x.clubName}`}
                                    value={`${x.attended}/${x.held} (${x.percent}%) → ${x.points} ball`}
                                />
                            ))}
                        </div>
                    )}
                    {d.perClub?.length > 0 && (
                        <div>
                            <p className="text-[11px] font-bold text-gray-600 mb-1">Klublar kesimida davomat</p>
                            {d.perClub.map(c => (
                                <Fact
                                    key={c.clubId}
                                    label={c.clubName + (c.enoughEvents ? '' : ' (kam tadbir — hisobga olinmaydi)')}
                                    value={`${c.attended}/${c.held} · ${c.percent}%`}
                                />
                            ))}
                            <p className="text-[11px] text-gray-400 mt-2">
                                Ball yo'nalish kesimida: har yo'nalishdan eng yuqori foizli klub olinadi.
                                Klub hisobot davrida kamida {d.minEvents} ta tadbir o'tkazgan bo'lishi kerak.
                            </p>
                        </div>
                    )}
                </div>
            );

        case 'OTHER':
            if (d.manual) {
                return (
                    <div>
                        <Fact label="Baholadi" value={d.assessedBy || "Mas'ul"} />
                        {d.comment && <Fact label="Izoh" value={d.comment} />}
                    </div>
                );
            }
            return (
                <div>
                    {d.perBand?.map(b => (
                        <Fact
                            key={b.key}
                            label={b.label}
                            value={`${b.points} ball${b.count > 1 ? ` · ${b.count} ta tadbirda` : ''}`}
                        />
                    ))}
                    {d.initiatives?.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                            {d.initiatives.map((i, idx) => (
                                <p key={idx} className="text-[11px] text-gray-500">
                                    • {i.title}
                                    {i.date ? ` · ${new Date(i.date).toLocaleDateString('uz-UZ')}` : ''}
                                    {i.markedBy ? ` · ${i.markedBy}` : ''}
                                </p>
                            ))}
                        </div>
                    )}
                    {/* Har band BIR MARTA sanaladi - buni aytib qo'yish kerak,
                        aks holda "ikkita tadbir nega 4 ball bermadi" savoli
                        tug'iladi. */}
                    <p className="text-[11px] text-gray-400 mt-2">
                        Metodika bandlarga ball beradi, tadbirlar soniga emas — bir band
                        necha marta qayd etilsa ham bir marta hisoblanadi.
                        {d.cappedFrom && ` Yig'indi ${d.cappedFrom} ball chiqdi, ship 5.`}
                    </p>
                </div>
            );

        case 'SPORTS':
            if (d.manual) {
                return (
                    <div>
                        <Fact label="Baholadi" value={d.assessedBy || "Mas'ul"} />
                        {d.comment && <Fact label="Izoh" value={d.comment} />}
                    </div>
                );
            }
            return (
                <div>
                    <Fact
                        label="A'zolik darajasi"
                        value={d.membership ? `${d.membership.label} → ${d.membership.points} ball` : 'qayd etilmagan'}
                    />
                    {/* Barcha topilgan darajalar - "nega aynan bu olindi"
                        savoliga javob. Ular QO'SHILMAYDI, eng yuqorisi olinadi. */}
                    {d.candidates?.length > 1 && (
                        <>
                            {d.candidates
                                .filter(c => c !== d.membership)
                                .map((c, i) => (
                                    <Fact
                                        key={i}
                                        label={`Boshqa daraja${c.origin === 'external' ? ' (tashqi hujjat)' : ''}`}
                                        value={`${c.label} → ${c.points} ball · hisobga kirmadi`}
                                    />
                                ))}
                        </>
                    )}
                    {d.conduct?.map(c => (
                        <Fact
                            key={c.key}
                            label={c.label}
                            value={c.flagged ? `0 ball — ${c.reason}` : `${c.points} ball`}
                        />
                    ))}
                    {/* Ship urgani ochiq ko'rsatiladi - aks holda "nega 9 emas,
                        5?" degan savol javobsiz qolardi. */}
                    {d.cappedFrom && (
                        <p className="text-[11px] text-amber-700 mt-2">
                            Yig'indi {d.cappedFrom} ball chiqdi, lekin mezonning shipi 5 ball —
                            a'zolik turlaridan eng yuqorisi olingan holda ham ortiqchasi hisobga olinmaydi.
                        </p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-2">
                        A'zolik turlari bir-birini istisno qiladi; qolgan ikki band buzilish qayd
                        etilmasa to'liq beriladi.
                    </p>
                </div>
            );

        case 'CULTURAL':
            if (d.manual) {
                return (
                    <div>
                        <Fact label="Baholadi" value={d.assessedBy || "Mas'ul"} />
                        {d.comment && <Fact label="Izoh" value={d.comment} />}
                    </div>
                );
            }
            return (
                <div>
                    <Fact label="Tasdiqlangan tashrif" value={`${d.visits?.length || 0} ta`} />
                    <Fact
                        label="Tashrif bo'lgan oylar"
                        value={`${d.visitMonths?.length || 0} / ${d.elapsedMonths?.length || 0}`}
                    />
                    {d.frequency && (
                        <Fact label="Muntazamlik" value={`${d.frequency.label} → ${d.frequency.points} ball`} />
                    )}
                    {d.pending > 0 && (
                        <Fact label="Tasdiqlanmagan" value={`${d.pending} ta tashrif`} />
                    )}
                    {d.frequency?.gaps?.length > 0 && (
                        <p className="text-[11px] text-amber-700 mt-2">
                            Tashrif bo'lmagan oylar: {d.frequency.gaps.join(', ')}
                        </p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-2">
                        Ball tashriflar soniga emas, muntazamligiga qarab beriladi.
                    </p>
                </div>
            );

        case 'VOLUNTEERING':
            if (d.manual) {
                return (
                    <div>
                        <Fact label="Baholadi" value={d.assessedBy || "Mas'ul"} />
                        {d.comment && <Fact label="Izoh" value={d.comment} />}
                    </div>
                );
            }
            return (
                <div>
                    {/* Ma'lumotnoma matni - metodikaning tilida. */}
                    {d.statementText && (
                        <p className="text-[11px] text-gray-700 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-2 mb-2 leading-relaxed">
                            {d.statementText}.
                        </p>
                    )}
                    {d.byCategory?.map(c => (
                        <Fact
                            key={c.key}
                            label={c.label + (c.active > 0 ? ` (${c.active} tasida volontyor/tashkilotchi)` : '')}
                            value={`${c.total} ta → ${c.points} ball`}
                        />
                    ))}
                    {d.evidence?.length > 0 && (
                        <Fact label="Qabul qilingan tashqi hujjat" value={`${d.evidence.length} ta → ${d.evidencePoints} ball`} />
                    )}
                    <p className="text-[11px] text-amber-700 mt-2">
                        Bu ball hali <b>taklif</b> — metodikada shkala berilmagan, yakuniy ballni mas'ul tasdiqlaydi.
                    </p>
                    {d.clubOverlap > 0 && (
                        <p className="text-[11px] text-gray-400 mt-1">
                            {d.clubOverlap} ta tadbir 2-mezonda ham hisobga olingan — ular boshqa narsani
                            o'lchaydi, takrorlanish emas.
                        </p>
                    )}
                </div>
            );

        case 'EDUCATION':
            return (
                <div>
                    <Fact label="Auditoriya" value={d.audience || '—'} />
                    <Fact label="O'tkazilgan darslar" value={`${d.held} ta`} />
                    <Fact label="Qatnashgan" value={`${d.attended} ta (${d.percent}%)`} />
                    <Fact label="Davomat bali" value={`${d.attendancePoints} ball`} />
                    <Fact label="Faol deb belgilangan" value={`${d.active} darsda`} />
                    {/* Faollik bali TIZIM tomonidan qo'yilmaydi - metodikada
                        uning ta'rifi yo'q, shuning uchun vakolatli shaxs kiritadi. */}
                    <Fact
                        label="Faollik bali"
                        value={d.activityPoints != null
                            ? `${d.activityPoints} / ${d.activityMax} ball · ${d.manual?.assessedBy || "mas'ul"}`
                            : `kiritilmagan (taklif: ${d.proposedActivity ?? '—'})`}
                    />
                    <p className="text-[11px] text-gray-400 mt-2">
                        Maxraj — talabaning fakulteti va kursi uchun o'tkazilgan, davomati
                        belgilangan darslar. Faollik balini vakolatli shaxs qo'yadi:
                        metodikada uning o'lchovi ko'rsatilmagan.
                    </p>
                </div>
            );

        case 'ATTENDANCE':
            return (
                <div>
                    {d.perSemester?.map(s => (
                        <Fact
                            key={s.semester}
                            label={`${s.semester}-semestr · ${s.source === 'hemis' ? 'HEMIS' : s.by || "qo'lda"}`}
                            value={`${s.hours} soat → ${s.points} ball`}
                        />
                    ))}
                    <p className="text-[11px] text-gray-400 mt-2">
                        Har semestr alohida baholanadi, so'ng ballarning o'rtachasi olinadi.
                        {d.semesters < 2 && ' Hozircha 1 semestr ma\'lumoti bor.'}
                    </p>
                </div>
            );

        case 'DISCIPLINE':
            return (
                <div>
                    {/* Bu mezon QO'SHILMAYDI, AYIRILADI - shuni ko'rsatish kerak. */}
                    {d.perPart?.map(p => (
                        <Fact
                            key={p.key}
                            label={p.label}
                            value={p.count === 0
                                ? `${p.maxPoints} ball (buzilish yo'q)`
                                : `${p.maxPoints} − ${p.deducted} = ${p.points} ball (${p.count} ta buzilish)`}
                        />
                    ))}
                    {d.violations?.length > 0 && (
                        <div className="mt-2 space-y-1">
                            {d.violations.map(v => (
                                <p key={v.id} className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1.5">
                                    {v.date} — {v.evidence}
                                    {v.note ? ` · ${v.note}` : ''}
                                </p>
                            ))}
                        </div>
                    )}
                    <p className="text-[11px] text-gray-400 mt-2">
                        Talaba to'liq balldan boshlaydi; ball faqat qayd etilgan buzilish uchun kamayadi.
                    </p>
                </div>
            );

        default:
            // Qo'lda baholanadigan mezonlar.
            return (
                <div>
                    {d.assessedBy && <Fact label="Baholadi" value={d.assessedBy} />}
                    {d.assessedAt && (
                        <Fact label="Sana" value={new Date(d.assessedAt).toLocaleDateString('uz-UZ')} />
                    )}
                    {d.comment && <Fact label="Izoh" value={d.comment} />}
                </div>
            );
    }
};

// MEZON BO'YICHA FILTR - holatlar.
//
// Faqat ARZON holatlar taklif etiladi: har biri bitta jadvalni (hujjatlar yoki
// baholar) o'qish bilan javob beradi. "Hisoblanmagan mezon" ataylab yo'q -
// unga javob berish uchun 550 ta talabaning butun indeksini hisoblash kerak,
// bu esa sahifani muzlatib qo'yadi (getDB har chaqiruvda localStorage ni
// qaytadan o'qiydi). Bunday ro'yxat kerak bo'lsa alohida hisobot qilinadi.
const CRITERION_STATUSES = [
    { key: 'evidence', label: 'Hujjat yuborgan' },
    { key: 'pending', label: 'Hujjati ko\'rib chiqilmagan' },
    { key: 'returned', label: 'Hujjati qaytarilgan' },
    { key: 'rejected', label: 'Hujjati rad etilgan' },
    { key: 'confirmed', label: 'Tasdiqlangan' },
    { key: 'unconfirmed', label: 'Hujjat bor, tasdiqlanmagan' },
];

const StudentIndexRoster = () => {
    const [search, setSearch] = useState('');
    const [faculty, setFaculty] = useState('');
    const [course, setCourse] = useState('');
    const [criterionKey, setCriterionKey] = useState('');
    const [criterionStatus, setCriterionStatus] = useState('');
    const [page, setPage] = useState(1);
    const [detailId, setDetailId] = useState(null);
    const [openCriterion, setOpenCriterion] = useState(null);
    const [passportOpen, setPassportOpen] = useState(false);
    const pageSize = PAGINATION.DEFAULT_PAGE_SIZE;

    const students = useMemo(() => db.getMockStudents(), []);
    const faculties = useMemo(
        () => [...new Set(students.map(s => s.faculty).filter(Boolean))].sort(),
        [students]
    );

    // Mezon holati bo'yicha talabalar to'plami - ikki jadvaldan o'qiladi,
    // indeks hisoblanmaydi.
    const criterionMatchIds = useMemo(() => {
        if (!criterionKey || !criterionStatus) return null;
        const year = getCurrentAcademicYear();
        const evidence = db.getIndexEvidence(null, criterionKey);
        const confirmed = new Set(
            db.getSocialIndexAssessments()
                .filter(a => a.criterionKey === criterionKey && a.academicYear === year)
                .map(a => a.studentId)
        );

        switch (criterionStatus) {
            case 'evidence':
                return new Set(evidence.map(e => e.studentId));
            case 'pending':
            case 'returned':
            case 'rejected':
                return new Set(evidence.filter(e => e.status === criterionStatus).map(e => e.studentId));
            case 'confirmed':
                return confirmed;
            case 'unconfirmed':
                return new Set(evidence.map(e => e.studentId).filter(id => !confirmed.has(id)));
            default:
                return null;
        }
    }, [criterionKey, criterionStatus]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return students.filter(s =>
            (!q || s.fullName?.toLowerCase().includes(q) || String(s.id).toLowerCase().includes(q))
            && (!faculty || s.faculty === faculty)
            && (!course || String(s.course) === course)
            && (!criterionMatchIds || criterionMatchIds.has(s.id))
        );
    }, [students, search, faculty, course, criterionMatchIds]);

    useEffect(() => { setPage(1); }, [search, faculty, course, criterionKey, criterionStatus]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const paginated = useMemo(
        () => filtered.slice((page - 1) * pageSize, page * pageSize),
        [filtered, page, pageSize]
    );

    // Faqat ko'rinib turgan qator uchun hisoblanadi.
    const rows = useMemo(() => paginated.map(s => {
        const index = db.getSocialActivityIndex(s.id);
        const evidence = db.getIndexEvidence(s.id);
        const confirmed = index.criteria.filter(
            c => needsConfirmation(c.key) && db.getSocialIndexAssessment(s.id, c.key)
        ).length;
        const needsConfirm = index.criteria.filter(c => needsConfirmation(c.key)).length;
        return { student: s, index, evidence, confirmed, needsConfirm };
    }), [paginated]);

    // Boshqa talabaga o'tganda ochiq mezon yopiladi - aks holda oldingi
    // talabaning ochiq bandi yangisida ham ochiq qolib chalkashtirardi.
    // Mezon bo'yicha filtrlanayotgan bo'lsa, panel darrov o'sha mezonni
    // ochadi - foydalanuvchi allaqachon shu mezonni qidirayotgani ma'lum.
    const openStudent = (id) => {
        setDetailId(id);
        setOpenCriterion(id ? criterionKey || null : null);
        // Boshqa talabaga o'tganda pasport oynasi ochiq qolmasin.
        setPassportOpen(false);
    };

    const detail = rows.find(r => r.student.id === detailId) || null;

    return (
        <div className="space-y-6">
            <Card className="p-4 bg-white/50 backdrop-blur-sm">
                <div className="flex flex-col md:flex-row flex-wrap gap-3">
                    <div className="flex-1 min-w-[220px] relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Talaba ismi yoki ID bo'yicha qidirish..."
                            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <select
                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                        value={faculty} onChange={e => setFaculty(e.target.value)}
                    >
                        <option value="">Barcha fakultetlar</option>
                        {faculties.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <select
                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                        value={course} onChange={e => setCourse(e.target.value)}
                    >
                        <option value="">Barcha kurslar</option>
                        {[1, 2, 3, 4].map(c => <option key={c} value={String(c)}>{c}-kurs</option>)}
                    </select>
                    {/* MEZON FILTRI. Mezon tanlansa jadvalga o'sha mezonning
                        ustuni qo'shiladi; holat ham tanlansa ro'yxat qisqaradi. */}
                    <select
                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                        value={criterionKey}
                        onChange={e => { setCriterionKey(e.target.value); if (!e.target.value) setCriterionStatus(''); }}
                    >
                        <option value="">Barcha mezonlar</option>
                        {INDEX_CRITERIA_ORDER.map((key, i) => (
                            <option key={key} value={key}>{i + 1}. {INDEX_CRITERIA[key].name}</option>
                        ))}
                    </select>
                    <select
                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white disabled:bg-gray-50 disabled:text-gray-300"
                        value={criterionStatus}
                        disabled={!criterionKey}
                        onChange={e => setCriterionStatus(e.target.value)}
                        title={criterionKey ? '' : 'Avval mezonni tanlang'}
                    >
                        <option value="">Mezon holati — barchasi</option>
                        {CRITERION_STATUSES.map(s => (
                            <option key={s.key} value={s.key}>{s.label}</option>
                        ))}
                    </select>
                </div>

                {criterionKey && (
                    <p className="text-[11px] text-gray-400 mt-3">
                        {criterionStatus
                            ? `${filtered.length} ta talaba topildi.`
                            : 'Jadvalga shu mezonning ustuni qo\'shildi. Ro\'yxatni qisqartirish uchun holatni ham tanlang.'}
                        {' '}
                        Holat ro'yxatida «hisoblanmagan» yo'q — unga javob berish uchun barcha
                        talabaning indeksini qaytadan hisoblash kerak bo'lardi.
                    </p>
                )}
            </Card>

            {/* RO'YXAT + YONMA-YON PANEL.
                Batafsil ko'rinish modal emas: ro'yxat ko'rinib turgani uchun
                talabadan talabaga o'tish uchun oynani yopish kerak emas.
                Panel ochilganda ikkilamchi ustunlar yashiriladi - jadval
                torayadi, lekin ism va ball joyida qoladi. */}
            <div className={detail ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 items-start' : ''}>
            <div className={`bg-white rounded-2xl border border-gray-100 overflow-hidden ${detail ? 'hidden lg:block' : ''}`}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Talaba</th>
                                <th className={`px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider ${detail ? 'hidden' : ''}`}>Fakultet / Kurs</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Indeks</th>
                                {criterionKey && (
                                    <th className="px-6 py-4 text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                                        {INDEX_CRITERIA_ORDER.indexOf(criterionKey) + 1}-mezon
                                    </th>
                                )}
                                <th className={`px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider ${detail ? 'hidden xl:table-cell' : ''}`}>Hisoblangan mezon</th>
                                <th className={`px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider ${detail ? 'hidden' : ''}`}>Tasdiqlangan</th>
                                <th className={`px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider ${detail ? 'hidden' : ''}`}>Hujjat</th>
                                <th className="px-6 py-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {rows.map(({ student, index, evidence, confirmed, needsConfirm }) => {
                                const pendingDocs = evidence.filter(e => e.status === 'pending').length;
                                const active = student.id === detailId;
                                return (
                                    <tr
                                        key={student.id}
                                        className={`transition-colors ${active ? 'bg-indigo-50' : 'hover:bg-gray-50/50'}`}
                                    >
                                        <td className="px-6 py-4">
                                            {/* Familya ustiga bosish - batafsil ko'rinish. */}
                                            <button
                                                type="button"
                                                onClick={() => openStudent(student.id)}
                                                className="flex items-center gap-3 text-left group"
                                            >
                                                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs shrink-0">
                                                    {student.fullName?.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-600">
                                                        {student.fullName}
                                                    </p>
                                                    <p className="text-xs text-gray-500">{student.id}</p>
                                                </div>
                                            </button>
                                        </td>
                                        <td className={`px-6 py-4 text-sm text-gray-500 ${detail ? 'hidden' : ''}`}>
                                            {student.faculty} <span className="text-gray-300">•</span> {student.course}-kurs
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-lg font-extrabold text-gray-900 tabular-nums">
                                                    {index.total.toFixed(1)}
                                                </span>
                                                <span className="text-xs text-gray-400">/ {index.maxTotal}</span>
                                            </div>
                                            <div className="mt-1 h-1.5 w-24 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-indigo-500 rounded-full"
                                                    style={{ width: `${(index.total / index.maxTotal) * 100}%` }}
                                                />
                                            </div>
                                        </td>
                                        {/* Tanlangan mezonning bali - sahifadagi qatorlar uchun
                                            allaqachon hisoblangan indeksdan olinadi. */}
                                        {criterionKey && (() => {
                                            const c = index.criteria.find(x => x.key === criterionKey);
                                            const hasC = c && c.points != null;
                                            const docs = evidence.filter(e => e.criterionKey === criterionKey);
                                            const pendingC = docs.filter(e => e.status === 'pending').length;
                                            return (
                                                <td className="px-6 py-4">
                                                    <p className={`text-sm font-extrabold tabular-nums ${hasC ? 'text-gray-900' : 'text-gray-300'}`}>
                                                        {hasC ? c.points : '—'}
                                                        <span className="text-xs text-gray-400 font-bold"> / {c?.maxPoints}</span>
                                                    </p>
                                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                                        {docs.length > 0
                                                            ? `${docs.length} hujjat${pendingC > 0 ? ` · ${pendingC} kutilmoqda` : ''}`
                                                            : 'hujjat yo\'q'}
                                                    </p>
                                                </td>
                                            );
                                        })()}
                                        {/* Nechta mezon hisoblangani ballning o'zi qadar muhim:
                                            11 dan 3 tasi hisoblangan 40 ball boshqa ma'no beradi. */}
                                        <td className={`px-6 py-4 text-sm text-gray-600 tabular-nums ${detail ? 'hidden xl:table-cell' : ''}`}>
                                            {index.scoredCount} / {index.totalCount}
                                        </td>
                                        <td className={`px-6 py-4 text-sm text-gray-600 tabular-nums ${detail ? 'hidden' : ''}`}>
                                            {confirmed} / {needsConfirm}
                                        </td>
                                        <td className={`px-6 py-4 text-sm ${detail ? 'hidden' : ''}`}>
                                            {evidence.length === 0 ? (
                                                <span className="text-gray-300">—</span>
                                            ) : (
                                                <span className="text-gray-600">
                                                    {evidence.length}
                                                    {pendingDocs > 0 && (
                                                        <span className="ml-1.5 text-[11px] font-bold text-amber-600">
                                                            {pendingDocs} kutilmoqda
                                                        </span>
                                                    )}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => openStudent(student.id)}
                                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                title="Batafsil"
                                            >
                                                <Eye size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={criterionKey ? 8 : 7} className="px-6 py-10 text-center text-sm text-gray-400">
                                        Talaba topilmadi
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    totalItems={filtered.length}
                    pageSize={pageSize}
                />
            </div>

            {/* BATAFSIL — 11 mezon, har birining holati va hujjatlari.
                Uzun ro'yxat bo'ylab pastga tushilganda panel ekranda qoladi. */}
            {detail && (
                <aside className="bg-white rounded-2xl border border-gray-100 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] overflow-y-auto">
                    <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100 sticky top-0 bg-white z-10">
                        <h3 className="font-bold text-gray-900">Ijtimoiy faollik indeksi</h3>
                        <button
                            type="button"
                            onClick={() => openStudent(null)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Yopish"
                        >
                            <X size={18} />
                        </button>
                    </div>
                    <div className="p-5 space-y-5">
                        <div className="rounded-2xl overflow-hidden border border-gray-100">
                            {/* ISM - oynaning eng katta yozuvi.
                                Bu ekran bitta talaba haqida, shuning uchun kim
                                haqida ekani birinchi o'qiladigan narsa bo'lishi kerak. */}
                            <div className="bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 px-6 py-5 flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <h3 className="text-white font-extrabold text-2xl sm:text-3xl uppercase tracking-wide leading-tight">
                                        {detail.student.fullName}
                                    </h3>
                                    <p className="text-indigo-100 text-xs font-semibold mt-1.5">
                                        {detail.student.faculty} • {detail.student.course}-kurs
                                        {detail.student.group ? ` • ${detail.student.group}` : ''}
                                    </p>
                                </div>
                                {/* Pasport ismning yonida - "kim bu talaba" savoli
                                    aynan shu yerda tug'iladi. Oynada ochiladi:
                                    bu ekran skoring uchun. */}
                                <button
                                    type="button"
                                    onClick={() => setPassportOpen(true)}
                                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-[11px] font-bold text-white transition-colors"
                                >
                                    <CreditCard size={13} /> Talaba pasporti
                                </button>
                            </div>

                            <div className="flex items-center justify-center gap-6 p-4 bg-slate-50 flex-wrap">
                                <StudentPhoto student={detail.student} />
                                <Gauge value={detail.index.total} max={INDEX_TOTAL_MAX} />
                                <div className="space-y-2.5">
                                    <div className="flex flex-wrap gap-2">
                                        <div className="px-3 py-2 bg-white rounded-xl border border-gray-100">
                                            <p className="text-sm font-extrabold text-gray-900 tabular-nums">
                                                {detail.index.scoredCount} / {detail.index.totalCount}
                                            </p>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase">Hisoblangan</p>
                                        </div>
                                        <div className="px-3 py-2 bg-white rounded-xl border border-gray-100">
                                            <p className="text-sm font-extrabold text-gray-900 tabular-nums">
                                                {detail.confirmed} / {detail.needsConfirm}
                                            </p>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase">Tasdiqlangan</p>
                                        </div>
                                        <div className="px-3 py-2 bg-white rounded-xl border border-gray-100">
                                            <p className="text-sm font-extrabold text-gray-900 tabular-nums">
                                                {detail.evidence.length}
                                            </p>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase">Hujjat</p>
                                        </div>
                                    </div>
                                        {detail.index.deduction > 0 && (
                                        <p className="text-xs font-bold text-rose-600">
                                            Intizomiy jazo: −{detail.index.deduction} ball
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {detail.index.criteria.map((c, i) => {
                                const docs = detail.evidence.filter(e => e.criterionKey === c.key);
                                const assessment = db.getSocialIndexAssessment(detail.student.id, c.key);
                                const needs = needsConfirmation(c.key);
                                const has = c.points != null;
                                const open = openCriterion === c.key;
                                const percent = has ? (c.points / c.maxPoints) * 100 : 0;
                                const visual = criterionVisual(c.key);
                                return (
                                    <div
                                        key={c.key}
                                        id={`sai-crit-${c.key}`}
                                        className={`border rounded-xl transition-colors ${open ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-100'}`}
                                    >
                                        {/* Mezon ustiga bosish - ballning kelib chiqishi va hujjatlar. */}
                                        <button
                                            type="button"
                                            onClick={() => setOpenCriterion(open ? null : c.key)}
                                            className="w-full text-left p-3.5"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex items-start gap-2.5">
                                                    {/* Ikonka butun platformada bir xil -
                                                        criterionVisuals.js dan keladi. */}
                                                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${visual.bg}`}>
                                                        <visual.icon size={15} className={visual.color} />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                                                            <span className="text-gray-300">{i + 1}.</span>
                                                            <span className="min-w-0">{c.name}</span>
                                                            {open
                                                                ? <ChevronDown size={13} className="text-indigo-500 shrink-0" />
                                                                : <ChevronRight size={13} className="text-gray-300 shrink-0" />}
                                                        </p>
                                                        {/* Ballning orqasidagi asos - "nega shuncha". */}
                                                        <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">
                                                            {has
                                                                ? (c.sourceLabel || 'Avtomatik hisoblangan')
                                                                : (c.missing || "Ma'lumot yo'q")}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    {/* Hisoblanmagan mezon "0" emas, "—".
                                                        Nol ball olish va hisoblanmaslik boshqa narsa. */}
                                                    <p className={`text-base font-extrabold tabular-nums ${has ? 'text-gray-900' : 'text-gray-300'}`}>
                                                        {has ? c.points : '—'}
                                                        <span className="text-xs text-gray-400 font-bold"> / {c.maxPoints}</span>
                                                    </p>
                                                    <div className="mt-1">
                                                        {!has ? (
                                                            <Badge variant="default" size="sm">
                                                                <Minus size={10} className="inline mr-0.5" /> Hisoblanmagan
                                                            </Badge>
                                                        ) : !needs ? (
                                                            <Badge variant="info" size="sm">Avtomatik</Badge>
                                                        ) : assessment ? (
                                                            <Badge variant="success" size="sm">Tasdiqlangan</Badge>
                                                        ) : (
                                                            <Badge variant="warning" size="sm">Tasdiqlanmagan</Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* MEZON PROGRESSI. Hisoblanmagan mezonda chiziq
                                                bo'sh EMAS, yo'lakcha ko'rinmaydi - aks holda
                                                "nol ball" degan taassurot berardi. */}
                                            <div className="mt-2.5 flex items-center gap-2">
                                                <div className={`h-2 flex-1 rounded-full overflow-hidden ${has ? 'bg-gray-100' : 'bg-transparent border border-dashed border-gray-200'}`}>
                                                    {has && (
                                                        <div
                                                            className={`h-full rounded-full ${
                                                                percent >= 80 ? 'bg-emerald-500'
                                                                    : percent >= 50 ? 'bg-indigo-500'
                                                                        : percent > 0 ? 'bg-amber-500'
                                                                            : 'bg-rose-400'
                                                            }`}
                                                            style={{ width: `${Math.max(percent, percent > 0 ? 3 : 0)}%` }}
                                                        />
                                                    )}
                                                </div>
                                                <span className={`text-[10px] font-bold tabular-nums w-9 text-right ${has ? 'text-gray-500' : 'text-gray-300'}`}>
                                                    {has ? `${Math.round(percent)}%` : '—'}
                                                </span>
                                                {docs.length > 0 && (
                                                    <span className="text-[10px] font-bold text-indigo-500 flex items-center gap-0.5">
                                                        <FileText size={10} /> {docs.length}
                                                    </span>
                                                )}
                                            </div>
                                        </button>

                                        {open && (
                                            <div className="px-3.5 pb-3.5 space-y-3">
                                                {/* BALL QAYERDAN SHAKLLANGAN */}
                                                <div className="bg-white border border-gray-100 rounded-xl p-3">
                                                    <p className="text-[11px] font-bold text-gray-600 mb-1.5">
                                                        Ball qanday shakllandi
                                                    </p>
                                                    {c.detail ? (
                                                        <CriterionDetail criterion={c} />
                                                    ) : (
                                                        <p className="text-[11px] text-gray-500">
                                                            {has
                                                                ? (c.sourceLabel || 'Tafsilot mavjud emas')
                                                                : (c.missing || "Bu mezon bo'yicha ma'lumot yo'q")}
                                                        </p>
                                                    )}
                                                    {assessment?.assessedBy && (
                                                        <p className="text-[11px] text-gray-400 mt-2 pt-2 border-t border-gray-50">
                                                            Tasdiqladi: {assessment.assessedBy}
                                                            {assessment.assessedAt
                                                                ? ` • ${new Date(assessment.assessedAt).toLocaleDateString('uz-UZ')}`
                                                                : ''}
                                                            {assessment.comment ? ` • ${assessment.comment}` : ''}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* TALABANING HUJJATLARI - shu mezon bo'yicha */}
                                                <div className="bg-white border border-gray-100 rounded-xl p-3">
                                                    <p className="text-[11px] font-bold text-gray-600 mb-1.5">
                                                        Asoslovchi hujjatlar
                                                    </p>
                                                    {docs.length === 0 ? (
                                                        <p className="text-[11px] text-gray-400">
                                                            Bu mezon bo'yicha hujjat yuklanmagan.
                                                        </p>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            {docs.map(d => {
                                                                const meta = EVIDENCE_STATUS[d.status] || EVIDENCE_STATUS.pending;
                                                                return (
                                                                    <div key={d.id} className="flex items-start gap-2">
                                                                        <FileText size={13} className="text-gray-400 shrink-0 mt-0.5" />
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className="text-xs font-medium text-gray-800">{d.title}</p>
                                                                            {d.description && (
                                                                                <p className="text-[11px] text-gray-500 mt-0.5">{d.description}</p>
                                                                            )}
                                                                            <p className="text-[11px] text-gray-400 mt-0.5">
                                                                                {d.fileName || 'Fayl biriktirilmagan'}
                                                                                {' • '}
                                                                                {new Date(d.submittedAt).toLocaleDateString('uz-UZ')}
                                                                                {d.reviewedBy ? ` • ${d.reviewedBy}` : ''}
                                                                            </p>
                                                                            {d.comment && (
                                                                                <p className="text-[11px] text-gray-500 italic mt-0.5">{d.comment}</p>
                                                                            )}
                                                                        </div>
                                                                        <Badge variant={meta.variant} size="sm">{meta.label}</Badge>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </aside>
            )}
            </div>

            {/* TALABA PASPORTI — alohida oynada. Ijtimoiy faollik ekrani
                skoring uchun; pasport kerak bo'lganda ochiladi. */}
            <Modal
                isOpen={passportOpen && !!detail}
                onClose={() => setPassportOpen(false)}
                title="Talaba pasporti"
                size="lg"
            >
                {detail && <StudentPassportCard studentId={detail.student.id} canEdit />}
            </Modal>
        </div>
    );
};

export default StudentIndexRoster;
