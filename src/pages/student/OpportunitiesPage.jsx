import React, { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
    Target, Clock, AlertTriangle, CheckCircle, XCircle, Info, Lock, ArrowRight,
    Award, Banknote, BadgeCheck, Trophy, Medal, Users, Lightbulb, CircleDot, Gift
} from 'lucide-react';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import {
    OPPORTUNITY_KINDS, OPPORTUNITY_KIND_ORDER, PRIMARY_OPPORTUNITY_KINDS,
    getKind, getGroupLabel,
    MATCH_STATE, FULL_MATCH_DISCLAIMER, ACHIEVABILITY,
    isCompetitive, BENEFIT_WORDING, OPPORTUNITY_WORDING,
} from '../../config/opportunities';
import { matchOpportunitiesForStudent, suggestNextSteps } from '../../utils/opportunityMatching';
import { buildStudentEligibilityProfile } from '../../utils/scholarshipEligibility';
import { CRITERIA_OPS, formatAmount } from '../../config/scholarships';
import ScholarshipApplyForm from '../../components/student/ScholarshipApplyForm';

// Talaba kabinetidagi "Imkoniyatlar".
//
// Ro'yxatda faqat NOM va FOIZ. Tafsilot "Batafsil" bosilganda ochiladi -
// o'n ikkita imkoniyatda har birining beshta sharti ko'rinsa, ekran o'qib
// bo'lmaydigan holga keladi.
//
// Eshik shartidan o'tmaganlar foizsiz, alohida guruhda: yashirilmaydi, lekin
// aralashtirilmaydi ham.

const KIND_ICONS = { Award, Banknote, BadgeCheck, Trophy, Medal, Users, Gift };

// `embedded` - "Yutuq va imkoniyatlar" bo'limining tabi ichida ko'rsatilganda
// o'z sarlavhasini chizmaydi; ko'rsatkichlar tab ustidagi umumiy sarlavhaga chiqadi.
const OpportunitiesPage = ({ embedded = false }) => {
    const { user } = useAuth();
    const studentId = user?.username;

    const [kindFilter, setKindFilter] = useState('all');
    const [detail, setDetail] = useState(null);
    const [applying, setApplying] = useState(false);
    const [flash, setFlash] = useState('');
    const [version, setVersion] = useState(0);
    const bump = useCallback(() => setVersion(v => v + 1), []);

    const data = useMemo(() => {
        if (!studentId) return null;
        const eligibilityProfile = buildStudentEligibilityProfile(db, studentId);
        const talentProfile = db.getTalentProfile?.(studentId);
        const matched = matchOpportunitiesForStudent(db, studentId, {
            eligibilityProfile,
            declared: talentProfile?.declared || {},
        });
        return { matched, steps: suggestNextSteps(matched, 3), eligibilityProfile };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId, version]);

    if (!data) return null;

    const { matched, steps, eligibilityProfile } = data;

    const visible = kindFilter === 'all'
        ? matched.eligible
        : matched.eligible.filter(r => r.opportunity.kind === kindFilter);

    const counts = useMemo(() => {
        const map = { all: matched.eligible.length };
        OPPORTUNITY_KIND_ORDER.forEach(k => {
            map[k] = matched.eligible.filter(r => r.opportunity.kind === k).length;
        });
        return map;
    }, [matched]);

    const visibleKinds = useMemo(
        () => OPPORTUNITY_KIND_ORDER.filter(k =>
            PRIMARY_OPPORTUNITY_KINDS.includes(k) || counts[k] > 0),
        [counts]
    );

    const urgent = matched.eligible.filter(r => r.urgent && r.state === MATCH_STATE.eligible.id);

    return (
        <div className="space-y-6">
            {embedded ? (
                <p className="text-sm text-gray-500">
                    <b className="text-gray-900">Stipendiya, grant, imtiyoz, tanlov va olimpiadalar</b> —
                    ma'lumotlaringizga qarab tanlangan. Hozir{' '}
                    <b className="text-gray-900">{matched.eligible.length} tasi</b> sizga mos keladi
                    {urgent.length > 0 && (
                        <span className="text-amber-700 font-bold"> · {urgent.length} tasi shoshilinch</span>
                    )}.
                </p>
            ) : (
                <div className="bg-gradient-to-r from-teal-700 to-cyan-800 rounded-2xl p-8 text-white shadow-xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                    <div>
                        <h1 className="text-3xl font-bold mb-1 flex items-center gap-3">
                            <Target className="w-8 h-8" /> Imkoniyatlar
                        </h1>
                        <p className="text-teal-100">
                            Sizning ma'lumotlaringizga qarab tanlangan grant, stipendiya va tanlovlar
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <div className="bg-white/15 backdrop-blur rounded-xl px-5 py-3 text-center">
                            <p className="text-3xl font-black">{matched.eligible.length}</p>
                            <p className="text-[10px] uppercase font-bold tracking-widest opacity-80">mos</p>
                        </div>
                        {urgent.length > 0 && (
                            <div className="bg-amber-400/25 backdrop-blur rounded-xl px-5 py-3 text-center">
                                <p className="text-3xl font-black">{urgent.length}</p>
                                <p className="text-[10px] uppercase font-bold tracking-widest opacity-90">shoshilinch</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {flash && (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                    <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <p className="text-sm font-semibold text-emerald-800">{flash}</p>
                    <button onClick={() => setFlash('')} className="ml-auto text-emerald-400 hover:text-emerald-600">
                        <XCircle size={18} />
                    </button>
                </div>
            )}

            {/* Shoshilinch muddatlar */}
            {urgent.length > 0 && (
                <Card className="border-l-4 border-l-amber-400">
                    <p className="font-black text-gray-900 text-sm mb-2 flex items-center gap-2">
                        <Clock size={16} className="text-amber-500" /> Muddat yaqinlashmoqda
                    </p>
                    <div className="space-y-1.5">
                        {urgent.map(r => (
                            <div key={r.opportunity.id}
                                className="flex items-center gap-3 px-3 py-2 bg-amber-50 rounded-lg text-sm">
                                <span className="font-bold text-gray-900 flex-1 truncate">
                                    {r.opportunity.title}
                                </span>
                                {r.fit !== null && <span className="font-black text-gray-700">{r.fit}%</span>}
                                <span className="text-amber-700 font-bold whitespace-nowrap">
                                    {r.daysLeft} kun qoldi
                                </span>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Eng foydali qadamlar */}
            {steps.length > 0 && (
                <Card className="border-l-4 border-l-teal-600">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">
                        Siz uchun eng foydali qadamlar
                    </p>
                    <p className="text-xs text-gray-500 mb-3">
                        Bitta harakat bir nechta imkoniyatni ochadi.
                    </p>
                    <ol className="space-y-2.5">
                        {steps.map((s, i) => (
                            <li key={s.key} className="flex items-start gap-3">
                                <span className="w-6 h-6 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center text-xs font-black flex-shrink-0">
                                    {i + 1}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-900">
                                        {s.label}
                                        {s.maxRemaining > 0 && (
                                            <span className="text-gray-500 font-medium">
                                                {' '}— yana {Math.ceil(s.maxRemaining)} {s.unit}
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-[11px] text-gray-500">
                                        {s.unlocks} ta imkoniyatga ta'sir qiladi
                                        {s.avgGain > 0 && ` · o'rtacha +${s.avgGain}%`}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </Card>
            )}

            {/* Filtr */}
            <div className="-mx-1 px-1 overflow-x-auto">
                <div className="inline-flex bg-white p-1 rounded-2xl border border-gray-100 shadow-sm">
                    <button onClick={() => setKindFilter('all')}
                        className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${kindFilter === 'all' ? 'bg-teal-700 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                        Hammasi ({counts.all})
                    </button>
                    {/* ASOSIY TURLAR har doim ko'rinadi (soni bilan), qolganlari
                        faqat mavjud bo'lsa. Ilgari hammasi `> 0` sharti bilan
                        filtrlanardi va talaba stipendiya bo'limi umuman
                        yo'qdek ko'rardi - "hozircha yo'q" bilan "umuman yo'q"
                        boshqa-boshqa narsa. */}
                    {visibleKinds.map(k => (
                        <button key={k} onClick={() => setKindFilter(k)}
                            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${kindFilter === k ? 'bg-teal-700 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                            {OPPORTUNITY_KINDS[k].label} ({counts[k]})
                        </button>
                    ))}
                </div>
            </div>

            {/* FOIZ NIMANI ANGLATADI - doimiy, kichik izoh. Telefondan
                kiruvchi talaba uchun (kursor yo'q, pastdagi hover izohini
                ko'ra olmaydi) - shuning uchun bu yerda HAM, har raqamning
                o'zida HAM (title) tushuntiriladi. */}
            <p className="flex items-start gap-1.5 text-[11px] text-gray-400 px-1">
                <Info size={12} className="shrink-0 mt-px" />
                Foiz — profilingiz shartlarga qanchalik mos kelishini ko'rsatadi, g'olib bo'lish ehtimolini emas.
            </p>

            {/* Ro'yxat — faqat nom va foiz */}
            <Card className="p-0 overflow-hidden">
                {visible.length === 0 && (
                    <div className="text-center py-16">
                        <Target className="w-14 h-14 mx-auto mb-4 text-gray-200" />
                        <p className="font-bold text-gray-500">Hozircha mos imkoniyat yo'q</p>
                        <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
                            Tadbir va musobaqalarda qatnashib, yutuq to'plaganingiz sari bu ro'yxat to'ladi.
                        </p>
                    </div>
                )}
                {visible.map(r => {
                    const kind = getKind(r.opportunity.kind);
                    const Icon = KIND_ICONS[kind.icon] || Award;
                    return (
                        <button key={r.opportunity.id} type="button" onClick={() => setDetail(r)}
                            className="w-full flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-teal-50/40 transition-colors text-left">
                            <span className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${kind.tone}`}>
                                <Icon size={17} />
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    {/* Turi HAR QATORDA yoziladi. "Imkoniyat" - bu tur nomi,
                                        "Stipendiya"/"Grant" esa narsaning o'zi. Talaba aynan
                                        shu so'zlarni qidiradi, shuning uchun ular filtr
                                        tugmasida ko'milib qolmasligi kerak. */}
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${kind.tone}`}>
                                        {kind.label}
                                    </span>
                                    <p className="font-bold text-gray-900 text-[15px]">{r.opportunity.title}</p>
                                    {r.state === MATCH_STATE.applied.id && (
                                        <Badge variant="primary" size="sm">Ariza berilgan</Badge>
                                    )}
                                    {r.state === MATCH_STATE.won.id && (
                                        <Badge variant="success" size="sm">Olingan</Badge>
                                    )}
                                </div>
                                <p className={`text-xs mt-0.5 ${r.urgent ? 'text-amber-700 font-bold' : 'text-gray-400'}`}>
                                    {/* Imtiyozda muddat va raqobat yo'q - o'rniga mohiyati yoziladi */}
                                    {!isCompetitive(r.opportunity.kind)
                                        ? (r.fit === 100 ? BENEFIT_WORDING.qualified : 'Shartlar to\'liq bajarilmagan')
                                        : r.opportunity.deadline
                                            ? (r.urgent ? `${r.daysLeft} kun qoldi` : `Muddat: ${r.opportunity.deadline}`)
                                            : 'Muddat belgilanmagan'}
                                    {r.opportunity.group && ` · ${getGroupLabel(r.opportunity.group)}`}
                                </p>
                            </div>
                            {/* Imtiyozda foiz "yutish ehtimoli" degani emas - shuning uchun
                                belgi bilan ko'rsatiladi, raqam bilan emas */}
                            {!isCompetitive(r.opportunity.kind) ? (
                                r.fit === 100 ? (
                                    <span className="flex items-center gap-1.5 text-sm font-black text-emerald-600 flex-shrink-0">
                                        <CheckCircle size={18} /> Tegishli
                                    </span>
                                ) : (
                                    <span className="text-sm font-bold text-amber-600 flex-shrink-0 tabular-nums">
                                        {r.met.length}/{r.checks.length} shart
                                    </span>
                                )
                            ) : r.fit !== null ? (
                                <span
                                    className={`text-2xl font-black tabular-nums flex-shrink-0 ${r.fit >= 90 ? 'text-emerald-600' : r.fit >= 60 ? 'text-teal-700' : 'text-gray-400'}`}
                                    title="Shartlarga moslik foizi - g'olib bo'lish ehtimoli emas"
                                >
                                    {r.fit}%
                                </span>
                            ) : (
                                <span className="text-xs text-gray-400 flex-shrink-0">talabsiz</span>
                            )}
                            <ArrowRight size={16} className="text-gray-300 flex-shrink-0" />
                        </button>
                    );
                })}
            </Card>

            {/* Eshik shartidan o'tmaganlar */}
            {matched.blocked.length > 0 && (
                <Card className="p-0 overflow-hidden border border-gray-200">
                    <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                        <Lock size={15} className="text-gray-400" />
                        <p className="font-black text-gray-700 text-sm">
                            Hozircha mos emas ({matched.blocked.length})
                        </p>
                        <span className="text-[11px] text-gray-400 ml-auto">
                            Sabab har birida yozilgan
                        </span>
                    </div>
                    {matched.blocked.map(r => (
                        <div key={r.opportunity.id}
                            className="flex items-start gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0">
                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-gray-100 text-gray-500 border border-gray-200">
                                        {getKind(r.opportunity.kind).label}
                                    </span>
                                    <p className="font-bold text-gray-700 text-sm">{r.opportunity.title}</p>
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {r.blocks.map(b => b.message).join(' · ')}
                                </p>
                                {r.availableFrom && (
                                    <p className="text-[11px] text-teal-700 font-semibold mt-0.5">
                                        Bo'shaydi: {r.availableFrom}
                                    </p>
                                )}
                            </div>
                            <span className="text-[11px] font-bold text-gray-400 flex-shrink-0 mt-0.5">
                                mos emas
                            </span>
                        </div>
                    ))}
                </Card>
            )}

            <Modal isOpen={!!detail} onClose={() => { setDetail(null); setApplying(false); }}
                title={detail?.opportunity.title || ''} size="lg">
                {detail && (
                    applying ? (
                        // Ariza formasi shu oynaning O'ZIDA ochiladi - talaba
                        // sahifadan chiqib ketmaydi va moslikni ko'rib turgan
                        // holida ariza to'ldiradi.
                        <ScholarshipApplyForm
                            grant={detail.opportunity.raw}
                            profile={eligibilityProfile}
                            studentId={studentId}
                            onCancel={() => setApplying(false)}
                            onDone={() => {
                                setApplying(false);
                                setDetail(null);
                                setFlash('Arizangiz yuborildi. Holatini "Arizalarim" tabida kuzatib boring.');
                                bump();
                            }}
                        />
                    ) : (
                        <OpportunityDetail result={detail} onApply={() => setApplying(true)} />
                    )
                )}
            </Modal>
        </div>
    );
};

// ---------------------------------------------------------------------------
// BATAFSIL — bandma-band mos kelish
// ---------------------------------------------------------------------------
const OpportunityDetail = ({ result, onApply }) => {
    const opp = result.opportunity;
    const kind = getKind(opp.kind);
    const settings = db.getScholarshipSettings();
    // Imtiyozda raqobat yo'q - matnlar ham, tugma ham boshqacha.
    const competitive = isCompetitive(opp.kind);
    const words = competitive ? OPPORTUNITY_WORDING : BENEFIT_WORDING;

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-4 p-4 bg-gray-50 rounded-2xl">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${kind.tone}`}>
                            {kind.label}
                        </span>
                        {opp.group && (
                            <span className="text-[11px] text-gray-500">{getGroupLabel(opp.group)}</span>
                        )}
                    </div>
                    {opp.amount && (
                        <p className="text-lg font-black text-gray-900">{formatAmount(opp.amount)}</p>
                    )}
                    {opp.description && (
                        <p className="text-sm text-gray-600 mt-1">{opp.description}</p>
                    )}
                    {competitive && opp.deadline && (
                        <p className={`text-xs mt-1.5 font-semibold ${result.urgent ? 'text-amber-700' : 'text-gray-500'}`}>
                            Muddat: {opp.deadline}
                            {result.daysLeft !== null && result.daysLeft >= 0 && ` · ${result.daysLeft} kun qoldi`}
                        </p>
                    )}
                    {!competitive && (
                        <p className="text-xs text-sky-700 mt-1.5 font-semibold">{BENEFIT_WORDING.hint}</p>
                    )}
                </div>
                {!competitive ? (
                    <div className="text-center flex-shrink-0">
                        {result.fit === 100 ? (
                            <>
                                <CheckCircle size={32} className="text-emerald-600 mx-auto" />
                                <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-700 mt-1">
                                    tegishli
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-3xl font-black text-amber-600 tabular-nums">
                                    {result.met.length}/{result.checks.length}
                                </p>
                                <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400">shart</p>
                            </>
                        )}
                    </div>
                ) : result.fit !== null && (
                    <div className="text-center flex-shrink-0" title="Shartlarga moslik foizi - g'olib bo'lish ehtimoli emas">
                        <p className={`text-4xl font-black tabular-nums ${result.fit >= 90 ? 'text-emerald-600' : 'text-teal-700'}`}>
                            {result.fit}%
                        </p>
                        <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400">moslik</p>
                    </div>
                )}
            </div>

            {/* Ogohlantirishlar */}
            {result.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertTriangle size={17} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-900">{w.message}</p>
                </div>
            ))}

            {/* Bandma-band */}
            {result.checks.length > 0 ? (
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                        {words.criteriaTitle}
                    </p>
                    <div className="space-y-1.5">
                        {result.checks.map(c => {
                            const gap = result.gaps.find(g => g.key === c.key);
                            const ach = gap?.achievability;
                            const partial = !c.ok && c.progress > 0;
                            return (
                                <div key={c.key}
                                    className={`p-3 rounded-xl border ${c.ok ? 'bg-emerald-50/60 border-emerald-100'
                                        : partial ? 'bg-amber-50/50 border-amber-100'
                                            : 'bg-red-50/50 border-red-100'}`}>
                                    <div className="flex items-center gap-3">
                                        <span className="flex-shrink-0">
                                            {c.ok ? <CheckCircle size={16} className="text-emerald-600" />
                                                : partial ? <CircleDot size={16} className="text-amber-600" />
                                                    : <XCircle size={16} className="text-red-500" />}
                                        </span>
                                        <span className="text-sm font-semibold text-gray-800 flex-1 min-w-0 truncate">
                                            {c.label}
                                        </span>
                                        <span className="text-sm font-black text-gray-900 tabular-nums whitespace-nowrap">
                                            {c.unknown ? '—' : c.actual} {c.unit}
                                        </span>
                                        <span className="text-[11px] text-gray-400 whitespace-nowrap">
                                            talab {CRITERIA_OPS[c.op]?.symbol} {c.target}
                                        </span>
                                    </div>

                                    {!c.ok && (
                                        <div className="mt-2 pl-7 flex flex-wrap items-center gap-2">
                                            {gap?.remaining > 0 && (
                                                <span className="text-[11px] font-bold text-gray-600">
                                                    Yana {Math.ceil(gap.remaining)} {c.unit} kerak
                                                </span>
                                            )}
                                            {ach?.state && ach.state !== 'unknown' && ACHIEVABILITY[ach.state]?.label && (
                                                <span className={`text-[11px] font-bold ${ACHIEVABILITY[ach.state].tone}`}>
                                                    · {ACHIEVABILITY[ach.state].label}
                                                </span>
                                            )}
                                            {ach?.reason && (
                                                <span className="text-[11px] text-gray-500">· {ach.reason}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <p className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded-xl">
                    Bu imkoniyat uchun maxsus talab belgilanmagan — barcha talabalar
                    qatnasha oladi.
                </p>
            )}

            {/* Kerakli hujjatlar */}
            {opp.documents.length > 0 && (
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                        Kerakli hujjatlar
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {opp.documents.map(id => (
                            <span key={id} className="text-[11px] px-2.5 py-1 bg-gray-100 rounded-lg text-gray-700 font-semibold">
                                {settings.docTypes.find(d => d.id === id)?.label || id}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* 100% yutish degani emas. Bu FAQAT raqobatli imkoniyatga tegishli -
                imtiyozda raqobat yo'q, shart bajarilsa beriladi. */}
            {competitive && result.fit === 100 && (
                <div className="flex items-start gap-3 p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
                    <Info size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-600">{FULL_MATCH_DISCLAIMER}</p>
                </div>
            )}

            <div className="pt-4 border-t border-gray-100 flex flex-wrap gap-3">
                {!competitive ? (
                    result.fit === 100 ? (
                        <button type="button" onClick={onApply}
                            className="flex-1 min-w-[160px] px-5 py-3 bg-sky-700 text-white rounded-xl font-bold text-sm hover:bg-sky-800">
                            {BENEFIT_WORDING.action}
                        </button>
                    ) : (
                        <p className="flex-1 text-sm text-gray-500">
                            Barcha shartlar bajarilgach bu imtiyoz sizga tegishli bo'ladi.
                        </p>
                    )
                ) : opp.sourceTable === 'scholarship_grants' ? (
                    result.state === MATCH_STATE.applied.id ? (
                        <Link to="/student/achievements?tab=applications"
                            className="flex-1 min-w-[160px] text-center px-5 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:border-teal-300">
                            Arizamni ko'rish
                        </Link>
                    ) : result.state === MATCH_STATE.won.id ? (
                        <p className="flex-1 text-sm font-bold text-emerald-700 flex items-center gap-2">
                            <CheckCircle size={16} /> Siz bu stipendiya sohibisiz
                        </p>
                    ) : (
                        // Ariza formasi shu oynaning o'zida ochiladi - talaba
                        // sahifadan chiqib ketmaydi.
                        <button type="button" onClick={onApply}
                            className="flex-1 min-w-[160px] px-5 py-3 bg-teal-700 text-white rounded-xl font-bold text-sm hover:bg-teal-800">
                            Ariza topshirish
                        </button>
                    )
                ) : (
                    <Link to={`/musobaqa/${opp.sourceId}`}
                        className="flex-1 min-w-[160px] text-center px-5 py-3 bg-teal-700 text-white rounded-xl font-bold text-sm hover:bg-teal-800">
                        Batafsil va ro'yxatdan o'tish
                    </Link>
                )}
            </div>
        </div>
    );
};

export default OpportunitiesPage;
