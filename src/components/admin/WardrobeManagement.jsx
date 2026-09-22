import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Plus, Edit, Search, Package, Coins, ShoppingBag, Users,
    EyeOff, Eye, AlertTriangle, Save,
} from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';

// ===========================================================================
// DO'KON BOSHQARUVI
//
// Ilgari bu ekran butunlay MAKET edi: uchta mahsulot `useState` ichida
// qattiq yozilgan, statistika esa qattiq matn ('536', '185,400', '+24%').
// Mahsulot o'chirsangiz sahifa yangilanishi bilan qaytib kelardi.
//
// Endi hammasi bazadan: mahsulotlar `shop_items`, tanga esa `coin_ledger`
// (supabase/coins_phase1.sql, coins_phase2_shop.sql).
//
// IKKI QOIDA:
//
//   1. O'YLAB TOPILGAN RAQAM YO'Q. "Oylik o'sish" kabi ko'rsatkich ataylab
//      olib tashlandi: buyurtma hali yozilmaydi (3-bosqich), ya'ni sotuvni
//      hisoblab bo'lmaydi. Yo'q narsani ko'rsatgandan ko'ra ko'rsatmagan
//      yaxshi. Ma'lumot o'qilmasa - "Ma'lumot yo'q", nol emas.
//
//   2. NARX YONIDA UNING MA'NOSI. "500 tanga" o'z-o'zidan hech narsa
//      anglatmaydi. Yonida "≈ 4 hafta" yozilsa, admin narxni belgilashda
//      nima qilayotganini ko'radi. Miqyos qoidalardan hisoblanadi
//      (`coin_weekly_rate`), ya'ni qoida o'zgarsa baho ham o'zgaradi.
// ===========================================================================

const EMPTY_ITEM = {
    id: null, name: '', category: '', price: 100, stock: 0,
    description: '', imageUrl: '', active: true,
};

const StatCard = ({ icon: Icon, label, value, hint, tone = 'text-indigo-600', bg = 'bg-indigo-50' }) => (
    <Card className="h-full">
        <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl ${bg}`}>
                <Icon className={`w-5 h-5 ${tone}`} />
            </div>
            <div className="min-w-0">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
                <p className="text-2xl font-black text-gray-900 leading-none mt-1 tabular-nums">{value}</p>
                {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
            </div>
        </div>
    </Card>
);

const WardrobeManagement = () => {
    const { user } = useAuth();
    const [items, setItems] = useState(null);      // null = hali o'qilmadi
    const [stats, setStats] = useState(null);
    const [weeklyRate, setWeeklyRate] = useState(null);
    const [rules, setRules] = useState([]);
    const [ruleDraft, setRuleDraft] = useState({});
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [form, setForm] = useState(null);        // null = oyna yopiq
    const [orders, setOrders] = useState([]);
    // `pickupCode` - ATAYLAB shunday nomlangan: `code` degan nom qoida
    // kodi (coin_rules.code) bilan chalkashardi va `saveRule(code)`
    // ichida qaysi biri ekanini o'qib bilib bo'lmasdi.
    const [pickupCode, setPickupCode] = useState('');
    const [fulfilled, setFulfilled] = useState(null);

    const load = useCallback(async () => {
        setError('');
        try {
            const [it, st, wr, rl, ord] = await Promise.all([
                db.getShopItems(),
                db.getCoinStats(),
                db.getCoinWeeklyRate(),
                db.getCoinRules(),
                db.getShopOrders({ status: 'pending' }),
            ]);
            setItems(it); setStats(st); setWeeklyRate(wr); setRules(rl); setOrders(ord);
            setRuleDraft(Object.fromEntries(rl.map(r => [r.code, String(r.amount)])));
        } catch (e) {
            // Jadval yo'q bo'lsa - aniq ayt. "Xatolik yuz berdi" degan xabar
            // adminni Supabase konsoliga haydaydi, u yerda esa sabab
            // yozilmagan.
            const msg = String(e?.message || '');
            setError(/relation .*(shop_items|coin_ledger|coin_rules)/i.test(msg)
                ? "Do'kon jadvallari yaratilmagan: supabase/coins_phase1.sql va coins_phase2_shop.sql ni ishga tushiring."
                : (msg || 'Xatolik yuz berdi'));
            setItems([]);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const run = async (fn) => {
        setBusy(true); setError('');
        try { await fn(); await load(); }
        catch (e) { setError(e?.message || 'Xatolik yuz berdi'); }
        finally { setBusy(false); }
    };

    const categories = useMemo(
        () => Array.from(new Set((items || []).map(i => i.category).filter(Boolean))).sort(),
        [items]
    );

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (items || []).filter(i =>
            (!q || i.name.toLowerCase().includes(q))
            && (!category || i.category === category)
        );
    }, [items, search, category]);

    // Narx necha haftalik faollikka teng. Qoidalar o'zgarsa - baho o'zgaradi.
    const weeksFor = (price) => {
        if (!weeklyRate || weeklyRate <= 0) return null;
        return Math.max(1, Math.round(price / weeklyRate));
    };

    const totalStock = (items || []).reduce((s, i) => s + (i.stock || 0), 0);
    const nothing = "Ma'lumot yo'q";

    const saveItem = () => run(async () => {
        await db.saveShopItem(form, user?.username);
        setForm(null);
    });

    // KOD BO'YICHA OLDINDAN TOPISH.
    //
    // Xodim kodni kiritganda NIMA BERISHINI oldin ko'rishi kerak, keyin
    // emas. Ilgari tugma bosilishi bilan buyurtma "berildi" bo'lib,
    // mahsulot nomi FAQAT SHUNDAN KEYIN chiqardi - ya'ni xodim nimani
    // berayotganini bilmasdan tasdiqlardi.
    //
    // Yangi so'rov kerak emas: kutilayotgan buyurtmalar allaqachon
    // yuklangan, shu ro'yxatdan topiladi.
    const typed = pickupCode.trim().toUpperCase();
    const matched = typed.length >= 4
        ? orders.find(o => o.pickupCode === typed) || null
        : null;

    const saveRule = (code) => run(async () => {
        await db.saveCoinRule(code, ruleDraft[code]);
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                        <ShoppingBag className="w-7 h-7 text-indigo-600" />
                        Do'kon boshqaruvi
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">
                        Tanga evaziga beriladigan mahsulotlar. Tanga faqat davomatdan yig'iladi.
                    </p>
                </div>
                <Button variant="primary" icon={Plus} onClick={() => setForm({ ...EMPTY_ITEM })}>
                    Mahsulot qo'shish
                </Button>
            </div>

            {error && (
                <p className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
                </p>
            )}

            {/* STATISTIKA - faqat haqiqatan hisoblanadigani */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={Package} label="Mahsulotlar" value={items ? items.length : nothing}
                          hint={items ? `${items.filter(i => i.active).length} tasi faol` : null} />
                <StatCard icon={ShoppingBag} label="Zaxirada" value={items ? totalStock : nothing}
                          hint="jami dona" tone="text-emerald-600" bg="bg-emerald-50" />
                <StatCard icon={Coins} label="Tarqatilgan tanga"
                          value={stats ? stats.distributed.toLocaleString('uz-UZ') : nothing}
                          hint={stats?.sampled ? 'oxirgi 10 000 yozuv' : 'boshidan beri'}
                          tone="text-amber-600" bg="bg-amber-50" />
                <StatCard icon={Users} label="Tangasi bor talabalar"
                          value={stats ? stats.students : nothing}
                          tone="text-sky-600" bg="bg-sky-50" />
            </div>

            {/* QOIDALAR - tanga qayerdan keladi */}
            <Card>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h3 className="font-bold text-gray-900">Tanga qoidalari</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Davomat belgilanganda avtomatik yoziladi. Qoidani o'zgartirsangiz,
                            u faqat KEYINGI davomatga ta'sir qiladi — yig'ilgan tanga qayta
                            hisoblanmaydi.
                        </p>
                    </div>
                    {weeklyRate != null && (
                        <Badge variant="default" size="sm">
                            Muntazam talaba haftasiga ≈ {weeklyRate} tanga
                        </Badge>
                    )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                    {rules.map(r => (
                        <div key={r.code} className="border border-gray-200 rounded-xl p-3">
                            <p className="text-xs font-semibold text-gray-700">{r.label}</p>
                            <div className="flex gap-2 mt-2">
                                <input
                                    type="number" min="0"
                                    value={ruleDraft[r.code] ?? ''}
                                    onChange={e => setRuleDraft(d => ({ ...d, [r.code]: e.target.value }))}
                                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm tabular-nums"
                                />
                                <Button variant="outline" size="sm" icon={Save} disabled={busy}
                                        onClick={() => saveRule(r.code)}>
                                    Saqlash
                                </Button>
                            </div>
                        </div>
                    ))}
                    {rules.length === 0 && (
                        <p className="text-xs text-gray-400 sm:col-span-3">{nothing}</p>
                    )}
                </div>
            </Card>

            {/* BERISH - kod bilan.
                Bu ekranning eng ko'p ishlatiladigan qismi: talaba keladi,
                kodni aytadi, xodim kiritadi. Shuning uchun u mahsulotlar
                ro'yxatidan YUQORIDA turadi. */}
            <Card className="border-l-4 border-l-emerald-600">
                <h3 className="font-bold text-gray-900">Mahsulotni berish</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                    Kodni kiriting — nima berish kerakligi ko'rinadi. Tasdiqlashni
                    mahsulotni topshirgandan KEYIN bosing: kod bir marta ishlaydi.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                    <input
                        value={pickupCode}
                        onChange={e => { setPickupCode(e.target.value.toUpperCase()); setFulfilled(null); }}
                        placeholder="Masalan: A3F9C1"
                        className="px-4 py-2.5 border border-gray-200 rounded-xl text-lg font-black tracking-widest uppercase w-48"
                    />
                    {/* Tasdiqlash tugmasi buyurtma TOPILMAGUNCHA chiqmaydi:
                        ko'rmasdan bosish imkoniyatining o'zi bo'lmasin. */}
                    {matched && (
                        <Button
                            variant="primary" disabled={busy}
                            onClick={() => run(async () => {
                                const o = await db.fulfilShopOrder(typed);
                                setFulfilled(o); setPickupCode('');
                            })}
                        >
                            Topshirdim — tasdiqlash
                        </Button>
                    )}
                </div>

                {/* TOPILGAN BUYURTMA - kattaroq, chunki xodim aynan shuni o'qiydi. */}
                {matched && (
                    <div className="mt-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                            Berilishi kerak
                        </p>
                        <p className="text-xl font-black text-emerald-900 mt-1">{matched.itemName}</p>
                        <p className="text-xs text-emerald-800 mt-0.5">
                            Talaba: <b>{matched.studentId}</b> · {matched.pricePaid} tanga ·
                            {' '}buyurtma {new Date(matched.createdAt).toLocaleDateString('uz-UZ')}
                        </p>
                    </div>
                )}

                {/* Topilmadi - lekin sabab har xil bo'lishi mumkin, shuning uchun
                    "yo'q" deyilmaydi: allaqachon berilgan yoki bekor qilingan
                    buyurtma ham kutilayotganlar ro'yxatida bo'lmaydi. */}
                {typed.length >= 4 && !matched && !fulfilled && (
                    <p className="mt-3 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        Bu kod kutilayotgan buyurtmalar orasida yo'q. Ehtimol u allaqachon
                        berilgan, bekor qilingan yoki kod xato kiritilgan.
                    </p>
                )}
                {fulfilled && (
                    <p className="mt-3 text-sm font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                        Berildi: {fulfilled.itemName} — {fulfilled.studentId}
                    </p>
                )}

                {orders.length > 0 && (
                    <div className="mt-4 border-t border-gray-100 pt-3">
                        <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-2">
                            Kutilayotgan buyurtmalar ({orders.length})
                        </p>
                        <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
                            {orders.map(o => (
                                <div key={o.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                                    <span className="min-w-0 truncate">
                                        <b className="text-gray-900">{o.studentId}</b>
                                        <span className="text-gray-500"> · {o.itemName} · {o.pricePaid} tanga</span>
                                    </span>
                                    <span className="font-black tracking-widest text-indigo-700 shrink-0">{o.pickupCode}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Card>

            {/* FILTR */}
            <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Mahsulot nomi bo'yicha qidirish..."
                        className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                    />
                </div>
                <select
                    value={category} onChange={e => setCategory(e.target.value)}
                    className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                >
                    <option value="">Barcha turlar</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>

            {/* MAHSULOTLAR */}
            {items === null ? (
                <Card><p className="p-8 text-center text-sm text-gray-400">O'qilmoqda...</p></Card>
            ) : visible.length === 0 ? (
                <Card>
                    <p className="p-8 text-center text-sm text-gray-400">
                        {items.length === 0
                            ? "Hali mahsulot qo'shilmagan. Birinchi mahsulotni qo'shing — talabalar tangani allaqachon yig'yapti."
                            : 'Bu filtrga mos mahsulot yo’q.'}
                    </p>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {visible.map(item => {
                        const weeks = weeksFor(item.price);
                        return (
                            <Card key={item.id} className={item.active ? '' : 'opacity-60'}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-gray-900 truncate">{item.name}</h3>
                                        {item.category && (
                                            <Badge variant="default" size="sm" className="mt-1">{item.category}</Badge>
                                        )}
                                    </div>
                                    {!item.active && <Badge variant="default" size="sm">Yashirilgan</Badge>}
                                </div>

                                {item.description && (
                                    <p className="text-xs text-gray-500 mt-2 line-clamp-2">{item.description}</p>
                                )}

                                <div className="flex items-baseline gap-2 mt-3">
                                    <span className="text-2xl font-black text-amber-600 tabular-nums">{item.price}</span>
                                    <span className="text-xs font-bold text-amber-600">tanga</span>
                                    {/* NARXNING MA'NOSI - shusiz raqam hech narsa aytmaydi. */}
                                    {weeks && (
                                        <span className="text-[11px] text-gray-400">≈ {weeks} hafta faollik</span>
                                    )}
                                </div>

                                <p className={`text-xs mt-2 font-semibold ${item.stock === 0 ? 'text-rose-600' : 'text-gray-500'}`}>
                                    {item.stock === 0 ? 'Zaxira tugagan' : `Zaxirada: ${item.stock} dona`}
                                </p>

                                <div className="flex gap-2 mt-3">
                                    <Button variant="outline" size="sm" icon={Edit}
                                            onClick={() => setForm({ ...item })}>
                                        Tahrirlash
                                    </Button>
                                    <Button
                                        variant="ghost" size="sm" disabled={busy}
                                        icon={item.active ? EyeOff : Eye}
                                        onClick={() => run(() => db.setShopItemActive(item.id, !item.active))}
                                    >
                                        {item.active ? 'Yashirish' : "Ko'rsatish"}
                                    </Button>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* MAHSULOT OYNASI */}
            <Modal
                isOpen={!!form}
                onClose={() => setForm(null)}
                title={form?.id ? 'Mahsulotni tahrirlash' : "Yangi mahsulot"}
            >
                {form && (
                    <div className="p-2 space-y-3">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Nomi</label>
                            <input
                                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                                placeholder="Masalan: Universitet logotipli hoodie"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Turi</label>
                                <input
                                    value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                                    placeholder="Kiyim, Kanselyariya..."
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Zaxira (dona)</label>
                                <input
                                    type="number" min="0" value={form.stock}
                                    onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm tabular-nums"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Narxi (tanga)</label>
                            <input
                                type="number" min="0" value={form.price}
                                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm tabular-nums"
                            />
                            {/* Narx yozilayotgan paytda uning ma'nosi ko'rinib tursin -
                                keyin emas, aynan qaror qabul qilinayotganda. */}
                            {weeksFor(Number(form.price) || 0) && (
                                <p className="text-[11px] text-gray-500 mt-1">
                                    Bu ≈ {weeksFor(Number(form.price) || 0)} haftalik muntazam faollik.
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Tavsif</label>
                            <textarea
                                rows={2} value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Rasm havolasi</label>
                            <input
                                value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                                placeholder="https://..."
                            />
                        </div>

                        <div className="flex gap-3 pt-1">
                            <Button variant="outline" className="flex-1" onClick={() => setForm(null)}>
                                Bekor qilish
                            </Button>
                            <Button variant="primary" className="flex-1" disabled={busy} onClick={saveItem}>
                                {busy ? 'Saqlanmoqda...' : 'Saqlash'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default WardrobeManagement;
