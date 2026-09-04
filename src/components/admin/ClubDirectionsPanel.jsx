import React, { useMemo, useState } from 'react';
import { Users, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { db } from '../../services/db';
import { INDEX_CRITERIA, CLUB_ACTIVITY } from '../../config/socialActivityIndex';

// "5 muhim tashabbus doirasidagi to'garaklarda faol ishtiroki" (2-mezon) sozlamasi.
//
// NEGA ALOHIDA MAYDON KERAK: metodikaning 5 yo'nalishi platformadagi 8 yo'nalish
// bilan ustma-ust tushmaydi. "Kitobxonlik va adabiyot" platformada "Madaniyat va
// san'at" ichiga qo'shib yuborilgan, "Bandlik" esa umuman yo'q. Avtomatik
// o'girish shu ikki joyda taxminga aylanardi va ball noto'g'ri chiqardi.
//
// Platformadagi 8 yo'nalish o'z joyida qoladi - u katalog va filtr uchun.
const ClubDirectionsPanel = () => {
    const [version, setVersion] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const clubs = useMemo(() => db.getClubs(), [version]);
    const directions = useMemo(() => db.getClubDirections(), [version]);
    const minClubEvents = useMemo(() => db.getMinClubEvents(), [version]);
    const [minDraft, setMinDraft] = useState(minClubEvents);

    const assignedCount = clubs.filter(c => directions[c.id]).length;

    const run = async (fn, ok = '') => {
        setBusy(true); setError(''); setMessage('');
        try { await fn(); setVersion(v => v + 1); if (ok) setMessage(ok); }
        catch (e) { setError(e?.message || 'Xatolik yuz berdi.'); }
        finally { setBusy(false); }
    };

    return (
        <div className="space-y-4">
            <Card>
                <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Users size={17} className="text-indigo-600" /> To'garaklar va yo'nalishlar
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">
                                2-mezon · maksimal {INDEX_CRITERIA.CLUBS.maxPoints} ball
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-extrabold text-gray-900 tabular-nums">
                                {assignedCount}<span className="text-sm text-gray-400"> / {clubs.length}</span>
                            </p>
                            <p className="text-[11px] text-gray-400">yo'nalishi belgilangan</p>
                        </div>
                    </div>

                    {/* Ball qanday hisoblanishini ochiq yozamiz - "nega shuncha
                        ball?" degan savol ko'p tug'iladigan joy. */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                        <p className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                            <Info size={12} /> Ball klubning O'Z tadbirlariga nisbatan foizdan hisoblanadi
                        </p>
                        <p className="text-[11px] text-gray-600 leading-relaxed">
                            Yiliga 2 ta tadbir o'tkazadigan klubning ikkalasiga ham borgan talaba —{' '}
                            <span className="font-bold">100% = 10 ball</span>. Yiliga 10 ta tadbir o'tkazadigan
                            klubning 9 tasiga borgan talaba — <span className="font-bold">90% = 9 ball</span>.
                            Mutlaq tadbir soni emas, muntazamlik hisobga olinadi.
                        </p>
                        <p className="text-[11px] text-gray-600 leading-relaxed">
                            Bir yo'nalishda bir necha klub bo'lsa — <span className="font-bold">eng yuqori foizli</span>{' '}
                            klub olinadi. Yo'nalishlar yig'indisi {INDEX_CRITERIA.CLUBS.maxPoints} ball bilan
                            chegaralangan, ya'ni ikki yo'nalish to'liq ballni beradi va uchinchisi qo'shimcha
                            ball bermaydi.
                        </p>
                        <p className="text-[11px] text-gray-600">
                            Klubning <span className="font-bold">asosiy koordinatori</span> alohida{' '}
                            {INDEX_CRITERIA.CLUBS.founderPoints} ball oladi — bu yolg'iz o'zi to'liq ball.
                        </p>
                    </div>

                    {/* Eng kam tadbir - metodikada yo'q, suiiste'molning oldini olish uchun. */}
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                        <label className="text-xs font-bold text-gray-600">Klub kamida</label>
                        <input
                            type="number" min={1} max={20}
                            className="w-20 px-3 py-2 border border-gray-200 rounded-xl text-sm text-center"
                            value={minDraft}
                            onChange={e => setMinDraft(e.target.value)}
                        />
                        <span className="text-xs text-gray-500">ta tadbir o'tkazgan bo'lsa hisobga olinadi</span>
                        {Number(minDraft) !== Number(minClubEvents) && (
                            <Button
                                variant="primary" size="sm" disabled={busy}
                                onClick={() => run(() => db.setMinClubEvents(minDraft), 'Sozlama saqlandi.')}
                            >
                                Saqlash
                            </Button>
                        )}
                    </div>
                    <p className="text-[11px] text-gray-400">
                        Bitta uchrashuv o'tkazib, unga kelgan hammaga 10 ball berib bo'lmasligi uchun.
                        Maxrajga faqat <span className="font-semibold">davomati belgilangan</span> tadbirlar
                        kiradi — koordinator davomat qo'ymagani talabaning balini pasaytirmaydi.
                    </p>

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

            <Card padding={false}>
                <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-2">
                    <h4 className="font-bold text-sm text-gray-700">Klublar ({clubs.length})</h4>
                    <span className="text-[11px] text-gray-400">
                        Yo'nalish belgilanmagan klub 2-mezonga hisoblanmaydi
                    </span>
                </div>
                <div className="divide-y divide-gray-50 max-h-[32rem] overflow-y-auto">
                    {clubs.map(club => {
                        const current = directions[club.id] || '';
                        return (
                            <div key={club.id} className="flex items-center gap-3 px-4 py-2.5">
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-800 truncate">{club.name}</p>
                                    <p className="text-[11px] text-gray-400 truncate">
                                        {club.category || "Yo'nalishsiz"}
                                    </p>
                                </div>
                                {!current && <Badge variant="warning" size="sm">Belgilanmagan</Badge>}
                                <select
                                    value={current}
                                    disabled={busy}
                                    onChange={e => run(() => db.setClubDirection(club.id, e.target.value || null))}
                                    className="shrink-0 px-2.5 py-1.5 border border-gray-200 rounded-xl text-xs bg-white min-w-[11rem]"
                                >
                                    <option value="">— Hisobga olinmaydi —</option>
                                    {INDEX_CRITERIA.CLUBS.directions.map(d => (
                                        <option key={d.key} value={d.key}>{d.label}</option>
                                    ))}
                                </select>
                            </div>
                        );
                    })}
                    {clubs.length === 0 && (
                        <p className="px-4 py-8 text-center text-sm text-gray-400">Klub topilmadi.</p>
                    )}
                </div>
            </Card>
        </div>
    );
};

export default ClubDirectionsPanel;
