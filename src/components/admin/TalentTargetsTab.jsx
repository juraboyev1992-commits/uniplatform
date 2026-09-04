import React, { useState, useMemo } from 'react';
import {
    Target, Plus, Trophy, ArrowUpRight, CheckCircle, XCircle, AlertTriangle,
    Loader2, ChevronRight, Info, Medal, ExternalLink, Trash2
} from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import { db } from '../../services/db';
import { TARGET_STATUS, TARGET_FLOW, STATE_AWARDS, getStateAward } from '../../config/talent';
import { computeReadiness, recommendTargets } from '../../utils/talentScoring';
import { buildStudentEligibilityProfile } from '../../utils/scholarshipEligibility';
import { formatAmount } from '../../config/scholarships';

// Nomzodlar: stipendiya maqsadlari va tayyorgarlik darajasi.
//
// Talaba "Tayyor" holatiga yetganda "Nomzodlikka uzatish" bosiladi va tizim
// MAVJUD stipendiya tizimida real ariza yaratadi. Undan keyingi hamma narsa -
// hujjat ko'rigi, komissiya, yakun - o'sha yerda kechadi. Bu yerda faqat
// natija kuzatiladi.

const TalentTargetsTab = ({ rows, busy, version, user, run }) => {
    const [selected, setSelected] = useState(null);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const grants = useMemo(() => db.getScholarshipGrants(), [version]);
    const grantById = useMemo(() => new Map(grants.map(g => [g.id, g])), [grants]);

    const items = useMemo(() => rows.map(r => {
        const targets = db.getTalentTargets(r.profile.studentId);
        const eligibilityProfile = buildStudentEligibilityProfile(db, r.profile.studentId);
        const declared = r.profile.declared || {};

        const withReadiness = targets.map(t => {
            const grant = t.grantId ? grantById.get(t.grantId) : null;
            const readiness = grant ? computeReadiness(grant, eligibilityProfile, declared) : null;
            return { ...t, grant, readiness };
        });

        return { ...r, targets: withReadiness, eligibilityProfile, declared };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [rows, grantById, version]);

    const stats = useMemo(() => {
        const all = items.flatMap(i => i.targets);
        return {
            total: all.length,
            ready: all.filter(t => t.status === 'ready').length,
            candidates: all.filter(t => ['candidate', 'submitted', 'recommended'].includes(t.status)).length,
            won: all.filter(t => t.status === 'won').length,
            noTarget: items.filter(i => i.targets.length === 0).length,
        };
    }, [items]);

    const syncAll = () => run(async () => {
        const res = await db.syncAllTalentTargets();
        if (res.changed === 0) window.alert("Yangi natija yo'q — barcha maqsadlar joriy holatda.");
        else window.alert(`${res.changed} ta maqsad holati yangilandi.`);
    });

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-3 p-4 bg-violet-50 border border-violet-100 rounded-2xl">
                <Info className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-violet-800">
                    Talaba <b>Tayyor</b> holatiga yetganda "Nomzodlikka uzatish" bosiladi va tizim
                    mavjud stipendiya bo'limida <b>real ariza</b> yaratadi. Undan keyingi hujjat ko'rigi,
                    komissiya va yakuniy qaror o'sha yerda kechadi — bu yerda faqat natija kuzatiladi.
                </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                    ['Jami maqsad', stats.total], ['Tayyor', stats.ready],
                    ['Nomzod', stats.candidates], ["G'olib", stats.won],
                    ['Maqsadsiz', stats.noTarget],
                ].map(([label, value]) => (
                    <Card key={label} className="border-none shadow-sm text-center py-4">
                        <p className="text-2xl font-black text-gray-900">{value}</p>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">{label}</p>
                    </Card>
                ))}
            </div>

            <div className="flex justify-end">
                <Button variant="outline" icon={busy ? Loader2 : ArrowUpRight} disabled={busy} onClick={syncAll}>
                    Ariza natijalarini yangilash
                </Button>
            </div>

            <div className="space-y-2">
                {items.length === 0 && (
                    <Card className="text-center py-16 text-gray-400 font-medium">Dasturda talaba yo'q</Card>
                )}
                {items.map(item => (
                    <Card key={item.profile.id} hover className="cursor-pointer" onClick={() => setSelected(item)}>
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                            <div className="min-w-0">
                                <p className="font-black text-gray-900">{item.student?.fullName}</p>
                                <p className="text-xs text-gray-500">
                                    {item.profile.faculty} · {item.student?.course}-kurs
                                </p>
                                {item.targets.length === 0 ? (
                                    <p className="text-[11px] text-amber-600 font-bold mt-1">Maqsad belgilanmagan</p>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {item.targets.map(t => {
                                            const st = TARGET_STATUS[t.status];
                                            const name = t.grant?.title || getStateAward(t.awardKey)?.label || '—';
                                            return (
                                                <span key={t.id}
                                                    className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg">
                                                    <span className="font-bold text-gray-700 truncate max-w-[180px]">{name}</span>
                                                    {t.readiness?.readiness !== null && t.readiness && (
                                                        <span className="font-black text-violet-700">{t.readiness.readiness}%</span>
                                                    )}
                                                    <Badge variant={st?.variant} size="sm">{st?.label}</Badge>
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <ChevronRight size={18} className="text-gray-300 flex-shrink-0 self-center" />
                        </div>
                    </Card>
                ))}
            </div>

            <Modal isOpen={!!selected} onClose={() => setSelected(null)}
                title={selected ? `${selected.student?.fullName} — maqsadlar` : ''} size="lg">
                {selected && (
                    <TargetsEditor
                        item={selected} grants={grants} busy={busy} user={user} run={run}
                    />
                )}
            </Modal>
        </div>
    );
};

// ---------------------------------------------------------------------------
const TargetsEditor = ({ item, grants, busy, user, run }) => {
    const [adding, setAdding] = useState(false);
    const [newGrant, setNewGrant] = useState('');
    const [newAward, setNewAward] = useState('');

    const activeGrants = grants.filter(g => g.status === 'active');
    const taken = new Set(item.targets.map(t => t.grantId).filter(Boolean));
    const takenAwards = new Set(item.targets.map(t => t.awardKey).filter(Boolean));

    // Tavsiya: qaysi grantga eng mos keladi (§49).
    const recommendations = useMemo(
        () => recommendTargets(
            activeGrants.filter(g => !taken.has(g.id)),
            item.eligibilityProfile,
            item.declared
        ).slice(0, 3),
        [activeGrants, taken, item.eligibilityProfile, item.declared]
    );

    const addTarget = () => run(async () => {
        await db.createTalentTarget({
            studentId: item.profile.studentId,
            grantId: newGrant || null,
            awardKey: newAward || null,
            by: user?.username,
        });
        setNewGrant(''); setNewAward(''); setAdding(false);
    }, 'Maqsad qo\'shildi');

    const promote = (target) => {
        if (!window.confirm(
            `"${target.grant?.title}" grantiga real ariza yaratilsinmi?\n\n`
            + 'Ariza mavjud stipendiya bo\'limida paydo bo\'ladi va komissiya zanjiriga tushadi.'
        )) return;
        run(async () => {
            const res = await db.promoteTalentTargetToCandidate(target.id, { by: user?.username });
            window.alert(`Ariza yaratildi (${res.application.id}). Stipendiyalar bo'limida ko'rishingiz mumkin.`);
        });
    };

    const setStatus = (target, status) => run(
        () => db.updateTalentTarget(target.id, { status }, user?.username)
    );

    const refreshReadiness = (target) => {
        if (!target.readiness) return;
        run(() => db.setTargetReadiness(target.id, target.readiness.readiness, target.readiness.status));
    };

    return (
        <div className="space-y-5">
            {item.targets.length === 0 && !adding && (
                <div className="text-center py-8">
                    <Target className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                    <p className="font-bold text-gray-600">Maqsad belgilanmagan</p>
                    <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
                        Talaba qaysi stipendiya yoki davlat mukofotiga tayyorlanayotganini belgilang —
                        tizim tayyorgarlik darajasini va yetishmayotganlarni o'zi hisoblaydi.
                    </p>
                </div>
            )}

            {/* Mavjud maqsadlar */}
            {item.targets.map(target => {
                const st = TARGET_STATUS[target.status];
                const name = target.grant?.title || getStateAward(target.awardKey)?.label || '—';
                const r = target.readiness;
                const isAward = !target.grantId;

                return (
                    <div key={target.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                        <div className="p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        {isAward ? <Medal size={14} className="text-rose-500" /> : <Trophy size={14} className="text-violet-500" />}
                                        <p className="font-black text-gray-900 text-sm">{name}</p>
                                        <Badge variant={st?.variant} size="sm">{st?.label}</Badge>
                                    </div>
                                    {target.grant && (
                                        <p className="text-xs text-gray-500">
                                            {formatAmount(target.grant.amount)}
                                            {target.grant.deadline ? ` · muddat ${target.grant.deadline}` : ''}
                                        </p>
                                    )}
                                    {target.applicationId && (
                                        <p className="text-[11px] text-indigo-600 font-semibold mt-1 flex items-center gap-1">
                                            <ExternalLink size={11} /> Ariza yaratilgan — Stipendiyalar bo'limida
                                        </p>
                                    )}
                                </div>
                                {r && r.readiness !== null && (
                                    <div className="text-center flex-shrink-0">
                                        <p className={`text-3xl font-black ${r.readiness >= 95 ? 'text-emerald-600' : r.readiness >= 70 ? 'text-amber-600' : 'text-gray-500'}`}>
                                            {r.readiness}%
                                        </p>
                                        <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400">tayyor</p>
                                    </div>
                                )}
                            </div>

                            {/* Bosqich chizig'i */}
                            {!st?.terminal && (
                                <div className="flex gap-0.5 mt-3">
                                    {TARGET_FLOW.map(s => (
                                        <div key={s} title={TARGET_STATUS[s].label}
                                            className={`h-1.5 flex-1 rounded-full ${TARGET_STATUS[s].step <= (st?.step || 0) ? 'bg-violet-500' : 'bg-gray-200'}`} />
                                    ))}
                                </div>
                            )}

                            {/* Yetishmayotganlar — yo'l xaritasi */}
                            {r && r.nextSteps.length > 0 && (
                                <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1.5">
                                        Keyingi qadamlar
                                    </p>
                                    <ul className="space-y-0.5">
                                        {r.nextSteps.map((s, i) => (
                                            <li key={i} className="text-xs text-amber-900 flex items-start gap-1.5">
                                                <span className="font-black">{i + 1}.</span> {s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {r && r.met.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {r.met.map(c => (
                                        <span key={c.key} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md font-semibold">
                                            <CheckCircle size={10} /> {c.label}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* §21: "tavsiya etilmadi" jazo emas */}
                            {target.status === 'not_selected' && (
                                <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                                    <p className="text-xs text-gray-700">
                                        <b>Bu tanlovda tavsiya etilmadi.</b> Bu yakuniy baho emas —
                                        yuqoridagi qadamlarni bajarib, keyingi tanlovga yangi maqsad
                                        belgilash mumkin.
                                    </p>
                                </div>
                            )}

                            {/* Amallar */}
                            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                                <select value={target.status} onChange={e => setStatus(target, e.target.value)}
                                    disabled={busy || !!target.applicationId}
                                    className="px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold disabled:opacity-50">
                                    {Object.entries(TARGET_STATUS).map(([k, v]) => (
                                        <option key={k} value={k}>{v.label}</option>
                                    ))}
                                </select>

                                {r && r.readiness !== null && (
                                    <button onClick={() => refreshReadiness(target)} disabled={busy}
                                        className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:text-violet-700">
                                        Tayyorgarlikni saqlash
                                    </button>
                                )}

                                {!target.applicationId && !isAward && ['ready', 'almost_ready'].includes(target.status) && (
                                    <Button variant="primary" icon={ArrowUpRight} disabled={busy}
                                        onClick={() => promote(target)} className="text-xs py-1.5 px-3 ml-auto">
                                        Nomzodlikka uzatish
                                    </Button>
                                )}
                                {isAward && (
                                    <span className="ml-auto text-[11px] text-gray-400 self-center">
                                        Davlat mukofotiga nomzodlik komissiya qarori bilan
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* Tavsiyalar */}
            {recommendations.length > 0 && !adding && (
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                        Tavsiya etilgan maqsadlar
                    </p>
                    <div className="space-y-1.5">
                        {recommendations.map(rec => (
                            <div key={rec.grant.id} className="flex items-center justify-between gap-3 p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl">
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-900 truncate">{rec.grant.title}</p>
                                    <p className="text-[11px] text-gray-500">
                                        {rec.met.length}/{rec.eligibility.total} shart bajarilgan
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <span className="text-lg font-black text-indigo-700">{rec.readiness}%</span>
                                    <button onClick={() => { setNewGrant(rec.grant.id); setNewAward(''); setAdding(true); }}
                                        className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-lg">
                                        <Plus size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Maqsad qo'shish */}
            {adding ? (
                <div className="p-4 bg-violet-50 border border-violet-200 rounded-xl space-y-3">
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">
                            Stipendiya / grant
                        </label>
                        <select value={newGrant} onChange={e => { setNewGrant(e.target.value); if (e.target.value) setNewAward(''); }}
                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold">
                            <option value="">Tanlanmagan</option>
                            {activeGrants.filter(g => !taken.has(g.id)).map(g => (
                                <option key={g.id} value={g.id}>{g.title}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">
                            yoki davlat mukofoti
                        </label>
                        <select value={newAward} onChange={e => { setNewAward(e.target.value); if (e.target.value) setNewGrant(''); }}
                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-semibold">
                            <option value="">Tanlanmagan</option>
                            {STATE_AWARDS.filter(a => !takenAwards.has(a.key)).map(a => (
                                <option key={a.key} value={a.key}>{a.label}</option>
                            ))}
                        </select>
                        <p className="text-[11px] text-gray-500 mt-1">
                            Davlat mukofotlarida ariza avtomatik yaratilmaydi — uzoq muddatli tayyorgarlik
                            kuzatiladi, rasmiy nomzodlikni vakolatli komissiya belgilaydi.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" className="flex-1" onClick={() => setAdding(false)}>Bekor qilish</Button>
                        <Button variant="primary" className="flex-1" disabled={busy || (!newGrant && !newAward)}
                            icon={busy ? Loader2 : Plus} onClick={addTarget}>
                            Qo'shish
                        </Button>
                    </div>
                </div>
            ) : (
                <Button variant="outline" icon={Plus} className="w-full" onClick={() => setAdding(true)}>
                    Maqsad qo'shish
                </Button>
            )}
        </div>
    );
};

export default TalentTargetsTab;
