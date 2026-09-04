import React, { useMemo, useState } from 'react';
import { Shield, Trophy, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Modal from '../common/Modal';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';

// TYUTORNING TERMA JAMOAGA TAVSIYASI (10-mezon).
//
// Tyutor ball qo'ymaydi va tarkibga qo'shmaydi - u faqat TAVSIYA etadi.
// Yakuniy qarorni sport klubi rahbari qabul qiladi.
//
// Tavsiya etishdan oldin talabaning sport manzarasi ochiladi: tizimda qayd
// etilgan natijalari, sport klubidagi davomati, avvalgi a'zoliklari. Ya'ni
// tavsiya xotiradan emas, DALILDAN kelib chiqadi.
const TutorSportNominationPanel = ({ students }) => {
    const { user } = useAuth();
    const [version, setVersion] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [pickFor, setPickFor] = useState(null);
    const [teamId, setTeamId] = useState('');
    const [motivation, setMotivation] = useState('');

    const teams = useMemo(() => db.getSportTeams().filter(t => t.isActive), [version]);

    const profile = useMemo(
        () => (pickFor ? db.getSportCandidateProfile(pickFor.id) : null),
        [pickFor, version]
    );

    // Har talabaning joriy holati - takroriy tavsiya bermaslik uchun.
    const statusOf = useMemo(() => {
        const map = new Map();
        students.forEach(s => {
            const noms = db.getSportNominations({ studentId: s.id });
            map.set(s.id, noms[0] || null);
        });
        return map;
    }, [students, version]);

    const submit = async () => {
        setBusy(true); setError(''); setMessage('');
        try {
            await db.nominateToSportTeam({
                teamId, studentId: pickFor.id,
                source: 'tutor', nominatedBy: user?.username,
                motivation,
            });
            setPickFor(null); setTeamId(''); setMotivation('');
            setVersion(v => v + 1);
            setMessage('Tavsiya yuborildi — sport klubi rahbari ko\'rib chiqadi.');
        } catch (e) {
            setError(e?.message || 'Xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <div className="p-5 space-y-4">
                <div>
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Shield size={17} className="text-cyan-600" /> Terma jamoaga tavsiya
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                        10-mezon · terma jamoa a'zoligi eng yuqori daraja (5 ball)
                    </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <p className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                        <Info size={12} /> Siz tavsiya etasiz, qarorni klub rahbari qabul qiladi
                    </p>
                    <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
                        Tavsiya etishdan oldin talabaning sport manzarasini ko'ring — tizimdagi
                        natijalari va sport klubidagi davomati avtomatik ko'rsatiladi va rahbarga
                        ham shu ma'lumot bilan boradi.
                    </p>
                </div>

                {error && (
                    <p className="flex items-start gap-1.5 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                        <AlertTriangle size={12} className="shrink-0 mt-px" /> {error}
                    </p>
                )}
                {message && (
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                        <CheckCircle2 size={12} /> {message}
                    </p>
                )}

                {teams.length === 0 ? (
                    <p className="text-sm text-gray-400 py-3">
                        Bu o'quv yili uchun terma jamoa yaratilmagan — tavsiya etib bo'lmaydi.
                    </p>
                ) : (
                    <div className="space-y-1">
                        {students.map(s => {
                            const nom = statusOf.get(s.id);
                            return (
                                <div key={s.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">{s.fullName}</p>
                                        <p className="text-[11px] text-gray-400">
                                            {s.faculty} · {s.course}-kurs
                                        </p>
                                    </div>
                                    {nom ? (
                                        <Badge
                                            variant={nom.status === 'approved' ? 'success'
                                                : nom.status === 'rejected' ? 'danger' : 'warning'}
                                            size="sm"
                                        >
                                            {nom.status === 'approved' ? 'Tarkibda'
                                                : nom.status === 'rejected' ? 'Rad etilgan' : "Ko'rib chiqilmoqda"}
                                        </Badge>
                                    ) : (
                                        <Button
                                            variant="outline" size="sm"
                                            onClick={() => { setPickFor(s); setTeamId(teams[0]?.id || ''); setError(''); }}
                                        >
                                            Tavsiya etish
                                        </Button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* TAVSIYA OYNASI — sport manzarasi bilan birga */}
            <Modal
                isOpen={!!pickFor}
                onClose={() => { setPickFor(null); setError(''); }}
                title={pickFor ? `${pickFor.fullName} — terma jamoaga tavsiya` : ''}
            >
                {pickFor && profile && (
                    <div className="space-y-4">
                        {/* Dalil - tavsiyaning asosi. */}
                        <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl space-y-2">
                            <div>
                                <p className="text-[11px] font-bold uppercase text-gray-400">Sport natijalari</p>
                                {profile.results.length === 0 ? (
                                    <p className="text-[11px] text-gray-400">Tizimda natija qayd etilmagan.</p>
                                ) : profile.results.map((r, i) => (
                                    <p key={i} className="text-xs text-gray-700 flex items-center gap-1.5">
                                        <Trophy size={11} className="text-amber-500" />
                                        {r.title} — {r.place}-o'rin
                                    </p>
                                ))}
                            </div>
                            <div>
                                <p className="text-[11px] font-bold uppercase text-gray-400">Sport klubidagi davomat</p>
                                {profile.sportClubs.length === 0 ? (
                                    <p className="text-[11px] text-gray-400">Qatnashuvi yo'q.</p>
                                ) : profile.sportClubs.map(c => (
                                    <p key={c.clubId} className="text-xs text-gray-700">
                                        {c.clubName} — {c.attended}/{c.held} ({c.percent}%)
                                    </p>
                                ))}
                            </div>
                            {profile.history.length > 0 && (
                                <div>
                                    <p className="text-[11px] font-bold uppercase text-gray-400">Avvalgi a'zoliklar</p>
                                    {profile.history.map((h, i) => (
                                        <p key={i} className="text-xs text-gray-700">
                                            {h.team} — {h.academicYear}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Jamoa *</label>
                            <select
                                value={teamId} onChange={e => setTeamId(e.target.value)}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                            >
                                {teams.map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}{t.sport ? ` (${t.sport})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Tavsiya asosi</label>
                            <textarea
                                rows={3} value={motivation} onChange={e => setMotivation(e.target.value)}
                                placeholder="Nega bu talabani tavsiya etyapsiz..."
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>

                        {error && (
                            <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                                {error}
                            </p>
                        )}

                        <div className="flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={() => setPickFor(null)}>
                                Bekor qilish
                            </Button>
                            <Button variant="primary" className="flex-1" disabled={busy || !teamId} onClick={submit}>
                                {busy ? 'Yuborilmoqda...' : 'Tavsiya etish'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </Card>
    );
};

export default TutorSportNominationPanel;
