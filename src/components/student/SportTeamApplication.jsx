import React, { useMemo, useState } from 'react';
import { Shield, Trophy, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Modal from '../common/Modal';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';

// TALABANING TERMA JAMOAGA ARIZASI (10-mezon).
//
// Sportchi talaba tyutorni kutib o'tirmasligi kerak - o'zi ariza beradi.
// Qarorni baribir sport klubi rahbari qabul qiladi, ya'ni bu yo'l nazoratni
// zaiflashtirmaydi, faqat kutishni yo'qotadi.
const SportTeamApplication = () => {
    const { user } = useAuth();
    const [version, setVersion] = useState(0);
    const [open, setOpen] = useState(false);
    const [teamId, setTeamId] = useState('');
    const [motivation, setMotivation] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const teams = useMemo(() => db.getSportTeams().filter(t => t.isActive), [version]);
    const mine = useMemo(
        () => db.getSportNominations({ studentId: user.username }),
        [user.username, version]
    );
    const profile = useMemo(
        () => db.getSportCandidateProfile(user.username),
        [user.username, version]
    );

    // Jamoa yaratilmagan bo'lsa bo'limni umuman ko'rsatmaymiz - talabaga
    // hech narsa qila olmaydigan tugma ko'rsatishning ma'nosi yo'q.
    if (teams.length === 0 && mine.length === 0) return null;

    const submit = async () => {
        setBusy(true); setError(''); setMessage('');
        try {
            await db.nominateToSportTeam({
                teamId, studentId: user.username,
                source: 'self', nominatedBy: user.username, motivation,
            });
            setOpen(false); setTeamId(''); setMotivation('');
            setVersion(v => v + 1);
            setMessage("Ariza yuborildi — sport klubi rahbari ko'rib chiqadi.");
        } catch (e) {
            setError(e?.message || 'Xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    const available = teams.filter(t => !mine.some(n => n.teamId === t.id));

    return (
        <Card>
            <div className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <Shield size={17} className="text-cyan-600" /> Terma jamoa
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                            10-mezon · tarkibga qabul qilinsangiz 5 ball
                        </p>
                    </div>
                    {available.length > 0 && (
                        <Button
                            variant="primary" size="sm"
                            onClick={() => { setTeamId(available[0].id); setOpen(true); setError(''); }}
                        >
                            Ariza berish
                        </Button>
                    )}
                </div>

                {message && (
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                        <CheckCircle2 size={12} /> {message}
                    </p>
                )}

                {mine.length === 0 ? (
                    <p className="text-[11px] text-gray-500">
                        Terma jamoa tarkibiga tyutoringiz tavsiya etishi, klub rahbari qo'shishi
                        yoki o'zingiz ariza berishingiz mumkin.
                    </p>
                ) : (
                    <div className="space-y-1.5">
                        {mine.map(n => {
                            const team = teams.find(t => t.id === n.teamId);
                            return (
                                <div key={n.id} className="flex items-start justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0">
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-gray-800">
                                            {team?.name || n.teamId}
                                        </p>
                                        {n.reviewComment && (
                                            <p className="text-[11px] text-gray-500 mt-0.5">{n.reviewComment}</p>
                                        )}
                                    </div>
                                    <Badge
                                        variant={n.status === 'approved' ? 'success'
                                            : n.status === 'rejected' ? 'danger' : 'warning'}
                                        size="sm"
                                    >
                                        {n.status === 'approved' ? 'Tarkibda'
                                            : n.status === 'rejected' ? 'Rad etilgan' : "Ko'rib chiqilmoqda"}
                                    </Badge>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <Modal isOpen={open} onClose={() => { setOpen(false); setError(''); }} title="Terma jamoaga ariza">
                <div className="space-y-4">
                    {/* Talaba o'z dalilini ko'rib tursin - rahbarga ham shu boradi. */}
                    <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                        <p className="text-[11px] font-bold uppercase text-gray-400 mb-1">
                            Tizimdagi sport natijalaringiz
                        </p>
                        {profile.results.length === 0 ? (
                            <p className="text-[11px] text-gray-400">
                                Hozircha natija qayd etilmagan — ariza berishingiz mumkin, lekin
                                qaror klub rahbarida.
                            </p>
                        ) : profile.results.map((r, i) => (
                            <p key={i} className="text-xs text-gray-700 flex items-center gap-1.5">
                                <Trophy size={11} className="text-amber-500" />
                                {r.title} — {r.place}-o'rin
                            </p>
                        ))}
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Jamoa *</label>
                        <select
                            value={teamId} onChange={e => setTeamId(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                        >
                            {available.map(t => (
                                <option key={t.id} value={t.id}>
                                    {t.name}{t.sport ? ` (${t.sport})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">
                            Sport tayyorgarligingiz haqida
                        </label>
                        <textarea
                            rows={3} value={motivation} onChange={e => setMotivation(e.target.value)}
                            placeholder="Qaysi sport turi, qancha vaqt shug'ullanasiz, qanday natijalaringiz bor..."
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                        />
                    </div>

                    {error && (
                        <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            {error}
                        </p>
                    )}

                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                            Bekor qilish
                        </Button>
                        <Button variant="primary" className="flex-1" disabled={busy || !teamId} onClick={submit}>
                            {busy ? 'Yuborilmoqda...' : 'Yuborish'}
                        </Button>
                    </div>
                </div>
            </Modal>
        </Card>
    );
};

export default SportTeamApplication;
