import React, { useMemo, useState } from 'react';
import { HeartHandshake, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import { db } from '../../services/db';
import { INDEX_CRITERIA } from '../../config/socialActivityIndex';
import { EVENT_TYPES, PARTICIPATION_ROLES } from '../../config/activityLifecycle';

// 8-MEZON SHKALASI.
//
// Metodika beshta narsani sanaydi, lekin har biriga alohida ball BERMAYDI -
// "5 ballgacha" yaxlit baho. Ya'ni "nechta ishtirok = necha ball" degan
// savolga hujjatda javob yo'q.
//
// Shuning uchun shkala shu yerda turadi va universitet qarori deb ochiq
// belgilanadi. Tizim faqat TAKLIF beradi - ballni mas'ul tasdiqlaydi.
const VolunteeringScalePanel = () => {
    const criterion = INDEX_CRITERIA.VOLUNTEERING;
    const [version, setVersion] = useState(0);
    const [draft, setDraft] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const saved = useMemo(() => db.getVolunteeringScale(), [version]);
    const current = draft || saved;

    const toggleType = (id) => {
        const types = current.eventTypes.includes(id)
            ? current.eventTypes.filter(t => t !== id)
            : [...current.eventTypes, id];
        setDraft({ ...current, eventTypes: types });
    };

    const save = async () => {
        setBusy(true); setError(''); setMessage('');
        try {
            await db.setVolunteeringScale({
                activeRolePoints: Number(current.activeRolePoints),
                participantPoints: Number(current.participantPoints),
                evidencePoints: Number(current.evidencePoints),
                eventTypes: current.eventTypes,
            });
            setDraft(null);
            setVersion(v => v + 1);
            setMessage('Sozlama saqlandi.');
        } catch (e) {
            setError(e?.message || 'Xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    const activeRoleLabels = ['volunteer', 'organizer']
        .map(r => PARTICIPATION_ROLES[r]?.label)
        .filter(Boolean)
        .join(' / ');

    return (
        <Card>
            <div className="p-5 space-y-4">
                <div>
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <HeartHandshake size={17} className="text-pink-600" /> Volontyorlik va jamoat ishlari
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                        8-mezon · maksimal {criterion.maxPoints} ball
                    </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                    <p className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                        <Info size={12} /> Metodikada shkala berilmagan
                    </p>
                    <p className="text-[11px] text-gray-600 leading-relaxed">
                        Hujjat beshta yo'nalishni sanaydi (ma'naviy-ma'rifiy tadbirlar, umumxalq
                        bayramlari, hasharlar, jamoatchilik ishlari, volontyorlik tashabbusi), lekin
                        har biriga alohida ball bermaydi — <b>«{criterion.maxPoints} ballgacha» yaxlit baho</b>.
                        Quyidagi qiymatlar universitet qarori: ular faqat <b>taklif</b> hisoblanadi,
                        yakuniy ballni mas'ul tasdiqlaydi.
                    </p>
                </div>

                <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-600">Bir ishtirok uchun ball</p>
                    {[
                        { key: 'activeRolePoints', label: `${activeRoleLabels} roli` },
                        { key: 'participantPoints', label: 'Oddiy ishtirok' },
                        { key: 'evidencePoints', label: 'Qabul qilingan tashqi hujjat' },
                    ].map(f => (
                        <div key={f.key} className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-700 min-w-[15rem]">{f.label}</span>
                            <input
                                type="number" min={0} max={criterion.maxPoints} step={0.5}
                                value={current[f.key]}
                                onChange={e => setDraft({ ...current, [f.key]: e.target.value })}
                                className="w-20 px-2 py-1.5 border border-gray-200 rounded-xl text-sm text-center"
                            />
                            <span className="text-[11px] text-gray-400">ball</span>
                        </div>
                    ))}
                    <p className="text-[11px] text-gray-400">
                        Yig'indi baribir {criterion.maxPoints} ball bilan cheklanadi.
                    </p>
                </div>

                {/* Qaysi tadbirlar hisoblanadi. Rol volontyor/tashkilotchi
                    bo'lsa tadbir turi ahamiyatsiz - buni ham aytib qo'yamiz. */}
                <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-600">Qaysi tadbir turlari hisobga olinadi</p>
                    <div className="flex flex-wrap gap-1.5">
                        {Object.values(EVENT_TYPES).map(t => {
                            const on = current.eventTypes.includes(t.id);
                            return (
                                <button
                                    key={t.id} type="button"
                                    onClick={() => toggleType(t.id)}
                                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                                        on
                                            ? 'bg-pink-50 border-pink-200 text-pink-700'
                                            : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                                    }`}
                                >
                                    {t.label}
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-gray-400">
                        Talaba <b>{activeRoleLabels}</b> rolida bo'lsa, tadbir turi qanday bo'lishidan
                        qat'i nazar hisobga olinadi — u baribir jamoat ishini bajargan.
                    </p>
                </div>

                {draft && (
                    <Button variant="primary" size="sm" disabled={busy} onClick={save}>
                        Saqlash
                    </Button>
                )}

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
            </div>
        </Card>
    );
};

export default VolunteeringScalePanel;
