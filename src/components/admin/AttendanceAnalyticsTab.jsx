import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { AlertTriangle, ArrowRight, Info, Lock } from 'lucide-react';
import Card from '../common/Card';
import { db } from '../../services/db';
import {
    getAttendanceFunnel, getUnmarkedActivities, getMarkerWorkload,
    getAttendanceTrend, getAttendanceLockStats,
} from '../../utils/attendanceStats';

// DAVOMAT TAHLILI.
//
// Uchta savolga javob beradi va uchalasi ham amaliy:
//   - ro'yxatdan o'tganlarning nechtasi keldi
//   - qaysi tadbirning davomati belgilanmay qolgan
//   - davomat yuklamasi kimning zimmasida
//
// Hisob-kitob attendanceStats.js da - shu bilan Hisobotlar va Excel ham
// aynan shu raqamni beradi, ikkinchi nusxa hisob paydo bo'lmaydi.
const AttendanceAnalyticsTab = () => {
    const funnel = useMemo(() => getAttendanceFunnel(db), []);
    const unmarked = useMemo(() => getUnmarkedActivities(db), []);
    const markers = useMemo(() => getMarkerWorkload(db), []);
    const trend = useMemo(() => getAttendanceTrend(db), []);
    const locks = useMemo(() => getAttendanceLockStats(db), []);

    const activityLink = (a) =>
        a.type === 'competition' ? `/admin/competitions/${a.id}` : `/admin/events/${a.id}`;

    return (
        <div className="space-y-6">
            {/* --- VORONKA --- */}
            <Card
                title="Ro'yxatdan o'tdi → keldi"
                subtitle={`${funnel.activities} ta faoliyat bo'yicha`}
            >
                {funnel.registered === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-400">
                        Ro'yxatdan o'tish yozuvi bo'lgan faoliyat hali yo'q — voronka uchun asos yo'q.
                    </p>
                ) : (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="rounded-xl bg-gray-50 px-4 py-3">
                                <p className="text-xs text-gray-500">Ro'yxatdan o'tgan</p>
                                <p className="text-2xl font-black text-gray-900 tabular-nums">{funnel.registered}</p>
                            </div>
                            <div className="rounded-xl bg-emerald-50 px-4 py-3">
                                <p className="text-xs text-emerald-700">Kelgan</p>
                                <p className="text-2xl font-black text-emerald-700 tabular-nums">
                                    {funnel.present}
                                    <span className="text-sm font-bold ml-1.5">{funnel.showPercent}%</span>
                                </p>
                            </div>
                            <div className="rounded-xl bg-amber-50 px-4 py-3">
                                <p className="text-xs text-amber-700">Kelmagan</p>
                                <p className="text-2xl font-black text-amber-700 tabular-nums">
                                    {funnel.noShow}
                                    <span className="text-sm font-bold ml-1.5">{funnel.noShowPercent}%</span>
                                </p>
                            </div>
                        </div>

                        <p className="flex items-start gap-2 text-[11px] text-gray-500 mt-3 leading-relaxed">
                            <Info size={13} className="shrink-0 mt-px text-gray-400" />
                            <span>
                                Faqat ro'yxatdan o'tish yozuvi BOR faoliyatlar hisobga olingan —
                                ro'yxatsiz tadbirda o'lchash uchun asos yo'q va u "0% keldi" deb
                                ko'rsatilmaydi. Davomati belgilangan yozuvlar: {funnel.marked} ta.
                            </span>
                        </p>

                        {funnel.worst.length > 0 && (
                            <div className="mt-5">
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">
                                    Eng ko'p kelmagan faoliyatlar
                                </h4>
                                <div className="divide-y divide-gray-50">
                                    {funnel.worst.map(a => (
                                        <div key={a.key} className="flex items-center gap-3 py-2">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-gray-900 truncate">{a.title}</p>
                                                <p className="text-[11px] text-gray-400">
                                                    {a.date ? new Date(a.date).toLocaleDateString('uz-UZ') : '—'}
                                                    {' · '}{a.type === 'competition' ? 'Musobaqa' : 'Tadbir'}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-sm font-bold text-gray-900 tabular-nums">
                                                    {a.present} / {a.registered}
                                                </p>
                                                <p className={`text-[11px] font-semibold ${a.showPercent < 50 ? 'text-red-600' : 'text-amber-600'}`}>
                                                    {a.showPercent}% keldi
                                                </p>
                                            </div>
                                            <Link to={activityLink(a)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg shrink-0">
                                                <ArrowRight size={15} />
                                            </Link>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[11px] text-gray-400 mt-2">
                                    5 tadan kam ro'yxatdan o'tgan faoliyatlar chiqarilgan — u yerda foiz
                                    tasodifiy chiqadi.
                                </p>
                            </div>
                        )}
                    </>
                )}
            </Card>

            {/* --- BELGILANMAGAN DAVOMAT --- */}
            <Card
                title="Davomati belgilanmagan faoliyatlar"
                subtitle="O'tib ketgan, lekin davomat yozuvi yo'q"
            >
                {unmarked.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-400">
                        Barcha o'tgan faoliyatlarning davomati belgilangan.
                    </p>
                ) : (
                    <>
                        <div className="flex gap-2 p-3 mb-3 rounded-lg bg-amber-50 border border-amber-100">
                            <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-800 leading-relaxed">
                                Bu {unmarked.length} ta faoliyatda talabalar ro'yxatdan o'tgan, lekin
                                davomat belgilanmagan. Ular indeksga <b>umuman kirmaydi</b> — talaba
                                qatnashgan bo'lsa ham hech qayerda qayd etilmagan.
                            </p>
                        </div>
                        <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                            {unmarked.map(a => (
                                <div key={a.key} className="flex items-center gap-3 py-2.5">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-900 truncate">{a.title}</p>
                                        <p className="text-[11px] text-gray-400">
                                            {a.date ? new Date(a.date).toLocaleDateString('uz-UZ') : '—'}
                                            {' · '}{a.registered} ta ro'yxatdan o'tgan
                                        </p>
                                    </div>
                                    <Link
                                        to={activityLink(a)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 shrink-0"
                                    >
                                        Belgilash <ArrowRight size={13} />
                                    </Link>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* --- OYLIK DINAMIKA --- */}
                <Card title="Oylik dinamika" subtitle="Faoliyat sanasi bo'yicha">
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={trend}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="kelgan" name="Kelgan" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="kelmagan" name="Kelmagan" stackId="a" fill="#F59E0B" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </Card>

                {/* --- KIM BELGILAYDI --- */}
                <Card title="Davomat yuklamasi" subtitle="Kim belgilagan">
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                        <Lock size={13} className="text-gray-400" />
                        Qulflangan: <b className="text-gray-700">{locks.locked}</b>
                        {locks.reopened > 0 && <>· qayta ochilgan: <b className="text-amber-600">{locks.reopened}</b></>}
                        · {locks.activities} ta faoliyatda
                    </div>
                    {markers.length === 0 ? (
                        <p className="py-8 text-center text-sm text-gray-400">
                            Davomat yozuvlarida belgilagan shaxs ko'rsatilmagan.
                        </p>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {markers.slice(0, 12).map(m => (
                                <div key={m.userId} className="flex items-center justify-between py-1.5">
                                    <p className="text-sm text-gray-800 truncate">{m.name}</p>
                                    <p className="text-xs text-gray-500 shrink-0 tabular-nums">
                                        <b className="text-gray-900">{m.records}</b> yozuv · {m.activities} faoliyat
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default AttendanceAnalyticsTab;
