import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Info } from 'lucide-react';
import Card from '../common/Card';
import { db } from '../../services/db';
import { getAwardAnalytics, getAwardTrend, getAwardsByClub } from '../../utils/awardStats';

// TAQDIRLASH TAHLILI.
//
// Reestrda hujjatlarni qidirish mumkin edi, lekin ular haqida savol berish
// mumkin emasdi: qaysi darajadagi yutuqlar ko'p, qaysi fakultet oldinda.
//
// Hujjatlar SONI va UNIKAL TALABALAR soni har doim alohida ko'rsatiladi -
// bitta talaba 10 ta sertifikat olgan bo'lsa, bu qamrovni sun'iy oshirmasin
// (reestr sahifasining o'zida ham shu qoida amal qiladi).
const LEVEL_COLORS = ['#4F46E5', '#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#94A3B8'];
const PLACE_COLORS = ['#F59E0B', '#94A3B8', '#B45309', '#CBD5E1'];

const AwardAnalyticsTab = () => {
    const stats = useMemo(() => getAwardAnalytics(db), []);
    const trend = useMemo(() => getAwardTrend(db), []);
    const clubs = useMemo(() => getAwardsByClub(db), []);

    if (stats.total === 0) {
        return (
            <Card>
                <p className="py-12 text-center text-sm text-gray-400">
                    Hali birorta hujjat berilmagan — tahlil uchun ma'lumot yo'q.
                </p>
            </Card>
        );
    }

    const unknownLevel = stats.levels.find(l => l.key === 'unknown');

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* --- DARAJA --- */}
                <Card title="Daraja bo'yicha" subtitle="Hujjat berilgan tadbirning darajasi">
                    <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                            <Pie
                                data={stats.levels} dataKey="count" nameKey="label"
                                cx="50%" cy="50%" outerRadius={85} labelLine={false}
                                label={({ label, percent }) => `${label} ${Math.round(percent * 100)}%`}
                            >
                                {stats.levels.map((entry, i) => (
                                    <Cell key={entry.key} fill={LEVEL_COLORS[i % LEVEL_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                    {unknownLevel && (
                        <p className="flex items-start gap-2 text-[11px] text-gray-500 mt-2">
                            <Info size={13} className="shrink-0 mt-px text-gray-400" />
                            <span>
                                {unknownLevel.count} ta hujjatning tadbiri topilmadi yoki tadbirda
                                daraja belgilanmagan. Ular "universitet" deb hisoblanmadi — bu
                                ma'lumot yo'qligini yashirardi.
                            </span>
                        </p>
                    )}
                </Card>

                {/* --- O'RIN --- */}
                <Card title="O'rin bo'yicha" subtitle={`${stats.total} ta hujjat, ${stats.uniqueStudents} nafar talaba`}>
                    <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                            <Pie
                                data={stats.places} dataKey="count" nameKey="label"
                                cx="50%" cy="50%" innerRadius={45} outerRadius={85} paddingAngle={2}
                            >
                                {stats.places.map((entry, i) => (
                                    <Cell key={entry.key} fill={PLACE_COLORS[i % PLACE_COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </Card>
            </div>

            {/* --- OYLIK DINAMIKA --- */}
            <Card title="Oylik dinamika" subtitle="Oxirgi 12 oyda berilgan hujjatlar">
                <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={trend}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="hujjatlar" name="Hujjatlar" fill="#4F46E5" radius={[6, 6, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* --- FAKULTETLAR --- */}
                <Card title="Fakultetlar kesimi" subtitle="Hujjatlar va unikal talabalar">
                    {stats.faculties.length === 0 ? (
                        <p className="py-8 text-center text-sm text-gray-400">
                            Hujjatlarda fakultet ko'rsatilmagan.
                        </p>
                    ) : (
                        <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                            {stats.faculties.map(f => (
                                <div key={f.faculty} className="flex items-center justify-between py-2.5 gap-3">
                                    <p className="text-sm text-gray-800 truncate">{f.faculty}</p>
                                    <p className="text-xs text-gray-500 shrink-0 tabular-nums">
                                        <b className="text-gray-900">{f.documents}</b> hujjat · {f.students} talaba
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                {/* --- KLUBLAR --- */}
                <Card title="Klublar kesimi" subtitle="Tadbir orqali aniqlanadi">
                    {clubs.length === 0 ? (
                        <p className="py-8 text-center text-sm text-gray-400">
                            Klubga bog'langan tadbirdan hujjat berilmagan.
                        </p>
                    ) : (
                        <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                            {clubs.map(c => (
                                <div key={c.clubId} className="flex items-center justify-between py-2.5 gap-3">
                                    <p className="text-sm text-gray-800 truncate">{c.name}</p>
                                    <p className="text-xs text-gray-500 shrink-0 tabular-nums">
                                        <b className="text-gray-900">{c.documents}</b> hujjat · {c.winners} sovrindor
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>

            {/* --- HUJJAT TURLARI --- */}
            <Card title="Hujjat turlari" subtitle="Berilgan hujjatlar bo'yicha">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {stats.types.map(t => (
                        <div key={t.key} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50">
                            <p className="text-sm text-gray-700 truncate">{t.label}</p>
                            <span className="text-sm font-bold text-gray-900 tabular-nums shrink-0 ml-2">{t.count}</span>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
};

export default AwardAnalyticsTab;
