import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, ShoppingBag, AlertTriangle, Check, History, X } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';

// ===========================================================================
// TALABA DO'KONI
//
// Tanga davomatdan yig'iladi (tadbir va Ma'rifat darsi) va shu yerda
// sarflanadi. Tanga ijtimoiy faollik INDEKSI EMAS: indeks rasmiy o'lchov va
// u stipendiya hal qiladi, shuning uchun sovg'a olish uni hech qachon
// kamaytirmaydi. Bu ekranda ham shu ochiq yozilgan - aks holda talaba
// "sovg'a olsam stipendiyam tushadimi" deb qo'rqib, umuman ishlatmaydi.
//
// UCH QOIDA:
//   1. Yetmaydigan mahsulot YASHIRILMAYDI - "yana N tanga kerak" deb
//      ko'rsatiladi. Yashirilsa, do'kon bo'sh ko'rinib maqsad yo'qoladi.
//   2. Narx yonida "≈ N hafta" - raqamning ma'nosi.
//   3. Buyurtmadan keyin KOD chiqadi va u ro'yxatda turaveradi: kodni
//      yo'qotgan odam mahsulotini ololmay qolmasin.
// ===========================================================================

const ShopPage = () => {
    const { user } = useAuth();
    const username = user?.username || null;

    const [items, setItems] = useState(null);
    const [balance, setBalance] = useState(null);
    const [weeklyRate, setWeeklyRate] = useState(null);
    const [orders, setOrders] = useState([]);
    const [ledger, setLedger] = useState([]);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState(null);
    const [busy, setBusy] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const load = useCallback(async () => {
        if (!username) return;
        setError('');
        try {
            const [it, bal, wr, ord, led] = await Promise.all([
                db.getShopItems({ activeOnly: true }),
                db.getCoinBalance(username),
                db.getCoinWeeklyRate(),
                db.getShopOrders({ studentId: username }),
                db.getCoinLedger(username, 30),
            ]);
            setItems(it); setBalance(bal); setWeeklyRate(wr); setOrders(ord); setLedger(led);
        } catch (e) {
            setError(e?.message || 'Xatolik yuz berdi');
            setItems([]);
        }
    }, [username]);

    useEffect(() => { load(); }, [load]);

    const order = (item) => {
        setBusy(true); setError(''); setNotice(null);
        db.createShopOrder(item.id)
            .then(async (o) => {
                setNotice(o);
                await load();
            })
            .catch(e => setError(e?.message || 'Xatolik yuz berdi'))
            .finally(() => setBusy(false));
    };

    const cancel = (orderId) => {
        setBusy(true); setError('');
        db.cancelShopOrder(orderId)
            .then(load)
            .catch(e => setError(e?.message || 'Xatolik yuz berdi'))
            .finally(() => setBusy(false));
    };

    const weeksFor = (price) => (weeklyRate > 0 ? Math.max(1, Math.round(price / weeklyRate)) : null);
    const pending = useMemo(() => orders.filter(o => o.status === 'pending'), [orders]);

    return (
        <div className="space-y-6">
            {/* BALANS */}
            <Card className="border-2 border-amber-100">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Tanga balansingiz</p>
                        <div className="flex items-baseline gap-2 mt-1">
                            <Coins className="w-6 h-6 text-amber-500" />
                            <span className="text-4xl font-black text-amber-600 tabular-nums">
                                {balance === null ? "—" : balance}
                            </span>
                            <span className="text-sm font-bold text-amber-600">tanga</span>
                        </div>
                        {/* Eng muhim jumla: indeks kamaymaydi. */}
                        <p className="text-xs text-gray-500 mt-2 max-w-md">
                            Tanga tadbir va Ma'rifat darsidagi qatnashuvdan yig'iladi. Sovg'a olish
                            ijtimoiy faollik indeksingizga <b>ta'sir qilmaydi</b> — u alohida hisob.
                        </p>
                    </div>
                    <Button variant="outline" size="sm" icon={History} onClick={() => setShowHistory(v => !v)}>
                        {showHistory ? 'Yopish' : 'Tanga tarixi'}
                    </Button>
                </div>

                {showHistory && (
                    <div className="mt-4 border-t border-gray-100 pt-3 max-h-64 overflow-y-auto divide-y divide-gray-50">
                        {ledger.length === 0 ? (
                            <p className="text-xs text-gray-400 py-3">Hali tanga yozuvi yo'q.</p>
                        ) : ledger.map(l => (
                            <div key={l.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                                <span className="text-gray-600 min-w-0 truncate">{l.reason}</span>
                                <span className={`font-black tabular-nums shrink-0 ${l.delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {l.delta > 0 ? '+' : ''}{l.delta}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {error && (
                <p className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
                </p>
            )}

            {/* YANGI BUYURTMA KODI */}
            {notice && (
                <Card className="border-2 border-emerald-200 bg-emerald-50">
                    <p className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                        <Check size={16} /> Buyurtma qabul qilindi — {notice.itemName}
                    </p>
                    <p className="text-xs text-emerald-800 mt-1">
                        Mahsulotni olish uchun shu kodni ko'rsating:
                    </p>
                    <p className="text-3xl font-black tracking-widest text-emerald-900 mt-2">{notice.pickupCode}</p>
                    <p className="text-[11px] text-emerald-700 mt-2">
                        Kodni yodlab olishingiz shart emas — u pastdagi «Kutilayotgan buyurtmalar» ro'yxatida turadi.
                    </p>
                </Card>
            )}

            {/* KUTILAYOTGAN BUYURTMALAR */}
            {pending.length > 0 && (
                <Card>
                    <h3 className="font-bold text-gray-900">Kutilayotgan buyurtmalar</h3>
                    <div className="mt-3 space-y-2">
                        {pending.map(o => (
                            <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 border border-gray-200 rounded-xl px-3 py-2.5">
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-900 truncate">{o.itemName}</p>
                                    <p className="text-[11px] text-gray-500">{o.pricePaid} tanga</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-lg font-black tracking-widest text-indigo-700">{o.pickupCode}</span>
                                    <Button variant="ghost" size="sm" icon={X} disabled={busy}
                                            onClick={() => cancel(o.id)}>
                                        Bekor qilish
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-2">
                        Bekor qilsangiz tanga to'liq qaytariladi.
                    </p>
                </Card>
            )}

            {/* MAHSULOTLAR */}
            <div>
                <h2 className="text-lg font-black text-gray-900 flex items-center gap-2 mb-3">
                    <ShoppingBag size={18} className="text-indigo-600" /> Do'kon
                </h2>

                {items === null ? (
                    <Card><p className="p-8 text-center text-sm text-gray-400">O'qilmoqda...</p></Card>
                ) : items.length === 0 ? (
                    <Card>
                        <p className="p-8 text-center text-sm text-gray-400">
                            Hozircha mahsulot yo'q. Tangangiz saqlanib turadi — mahsulot
                            qo'shilganda shu yerda ko'rinadi.
                        </p>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {items.map(item => {
                            const weeks = weeksFor(item.price);
                            const short = balance === null ? null : item.price - balance;
                            const canBuy = balance !== null && short <= 0 && item.stock > 0;
                            return (
                                <Card key={item.id}>
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="font-bold text-gray-900 min-w-0 truncate">{item.name}</h3>
                                        {item.category && <Badge variant="default" size="sm">{item.category}</Badge>}
                                    </div>
                                    {item.description && (
                                        <p className="text-xs text-gray-500 mt-2 line-clamp-2">{item.description}</p>
                                    )}

                                    <div className="flex items-baseline gap-2 mt-3">
                                        <span className="text-2xl font-black text-amber-600 tabular-nums">{item.price}</span>
                                        <span className="text-xs font-bold text-amber-600">tanga</span>
                                        {weeks && <span className="text-[11px] text-gray-400">≈ {weeks} hafta</span>}
                                    </div>

                                    {/* Yetmasa - YASHIRILMAYDI, qancha qolgani aytiladi. */}
                                    {item.stock === 0 ? (
                                        <p className="text-xs font-semibold text-rose-600 mt-2">Zaxira tugagan</p>
                                    ) : short > 0 ? (
                                        <p className="text-xs font-semibold text-gray-500 mt-2">
                                            Yana <b className="text-gray-800">{short}</b> tanga kerak
                                        </p>
                                    ) : (
                                        <p className="text-xs font-semibold text-emerald-600 mt-2">
                                            Zaxirada: {item.stock} dona
                                        </p>
                                    )}

                                    <Button
                                        variant={canBuy ? 'primary' : 'outline'}
                                        className="w-full mt-3"
                                        disabled={!canBuy || busy}
                                        onClick={() => order(item)}
                                    >
                                        {item.stock === 0 ? 'Zaxira yo’q' : short > 0 ? 'Tanga yetmaydi' : 'Buyurtma berish'}
                                    </Button>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ShopPage;
