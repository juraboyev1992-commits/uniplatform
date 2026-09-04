import React, { useMemo } from 'react';
import {
    BarChart3, Users, Calendar, Trophy, FileCheck, Building2, Info, Globe,
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import { db } from '../../services/db';
import {
    getPlatformOverview, getMonthlyActivity, getFacultyStats, getClubActivityStats,
} from '../../utils/platformStats';

// RAHBARIYAT STATISTIKASI.
//
// Bu sahifa ilgari raqamlarni HAR OCHILGANDA QAYTA GENERATSIYA QILARDI:
// `Math.floor(500 + Math.random() * 50)` ko'rinishidagi qatorlar oylik
// dinamikani, faollik radarini va haftalik issiqlik xaritasini to'ldirardi.
// Ya'ni rahbar ikki marta kirsa ikki xil manzara ko'rardi va u manzaraning
// hech biri haqiqiy emas edi.
//
// Endi hammasi `utils/platformStats.js` orqali haqiqiy yozuvlardan hisoblanadi
// va uchala rahbariyat sahifasi BITTA manbadan o'qiydi.
//
// OLIB TASHLANGANLAR (manbasi yo'q, o'ylab topilmadi):
//   - Haftalik/soatlik issiqlik xaritasi: yozuvlarda aniq vaqt saqlanmaydi
//   - "Ball taqsimoti" (90-100, 70-89, ...): jami talabaning foizi sifatida
//     hisoblanardi, ya'ni raqam emas, taxmin edi
const CHART_COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

const StatisticsPage = () => {
    const overview = useMemo(() => getPlatformOverview(db), []);
    const monthly = useMemo(() => getMonthlyActivity(db, 12), []);
    const faculties = useMemo(() => getFacultyStats(db), []);
    const clubs = useMemo(() => getClubActivityStats(db), []);

    const facultyPie = useMemo(
        () => faculties.map(f => ({ name: f.faculty, value: f.students })),
        [faculties]
    );

    const clubCategories = useMemo(() => {
        const map = new Map();
        clubs.forEach(c => {
            const key = c.category || 'Boshqa';
            map.set(key, (map.get(key) || 0) + 1);
        });
        return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
    }, [clubs]);

    const cards = [
        { label: 'Talabalar', value: overview.students, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { label: 'Klublar', value: overview.clubs, icon: Building2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { label: 'Tadbirlar', value: overview.events, icon: Calendar, color: 'text-amber-600', bg: 'bg-amber-50', note: `${overview.eventsUpcoming} ta rejada` },
        { label: 'Musobaqalar', value: overview.competitions, icon: Trophy, color: 'text-rose-600', bg: 'bg-rose-50' },
        { label: "Ro'yxatdan o'tish", value: overview.registrations, icon: BarChart3, color: 'text-violet-600', bg: 'bg-violet-50' },
        { label: 'Berilgan hujjatlar', value: overview.documents, icon: FileCheck, color: 'text-cyan-600', bg: 'bg-cyan-50' },
        { label: 'Xalqaro faoliyat', value: overview.internationalCount, icon: Globe, color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: 'Fakultetlar', value: overview.faculties, icon: Building2, color: 'text-slate-600', bg: 'bg-slate-50', note: `${overview.groups} guruh` },
    ];

    const hasMonthly = monthly.some(m => m.tadbirlar || m.royxat || m.hujjatlar);

    return (
        <div className="space-y-6 pb-10">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Statistika</h1>
                    <p className="text-gray-500 mt-1">
                        Platformadagi haqiqiy yozuvlardan hisoblangan ko'rsatkichlar
                    </p>
                </div>
                <Badge variant="default">So'nggi 12 oy</Badge>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {cards.map((c, i) => (
                    <Card key={i} className="p-5 border-none">
                        <div className={`p-2.5 rounded-xl inline-flex ${c.bg} ${c.color}`}>
                            <c.icon size={20} />
                        </div>
                        <p className="text-2xl font-black text-gray-900 mt-3">{c.value}</p>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{c.label}</p>
                        {c.note && <p className="text-[11px] text-gray-400 mt-0.5">{c.note}</p>}
                    </Card>
                ))}
            </div>

            <Card className="p-6 border-none">
                <h3 className="font-bold text-gray-900 mb-1">Oylik dinamika</h3>
                <p className="text-xs text-gray-500 mb-4">
                    Tadbirlar, ro'yxatdan o'tishlar va berilgan hujjatlar — sanasi bor yozuvlardan
                </p>
                {hasMonthly ? (
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={monthly}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                <RechartsTooltip contentStyle={{ borderRadius: 12, border: 'none' }} />
                                <Legend />
                                <Area type="monotone" dataKey="royxat" name="Ro'yxatdan o'tish" stroke="#10B981" fill="#10B981" fillOpacity={0.15} strokeWidth={2} />
                                <Area type="monotone" dataKey="tadbirlar" name="Tadbirlar" stroke="#4F46E5" fill="#4F46E5" fillOpacity={0.15} strokeWidth={2} />
                                <Area type="monotone" dataKey="hujjatlar" name="Hujjatlar" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.15} strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <p className="text-sm text-gray-400 py-16 text-center">
                        So'nggi 12 oyda sanasi qayd etilgan faoliyat topilmadi.
                    </p>
                )}
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="p-6 border-none">
                    <h3 className="font-bold text-gray-900 mb-4">Talabalarning fakultetlar bo'yicha taqsimoti</h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={facultyPie} dataKey="value" nameKey="name"
                                    cx="50%" cy="50%" outerRadius={90} label
                                >
                                    {facultyPie.map((_, i) => (
                                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                    ))}
                                </Pie>
                                <RechartsTooltip contentStyle={{ borderRadius: 12, border: 'none' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                <Card className="p-6 border-none">
                    <h3 className="font-bold text-gray-900 mb-1">Fakultetlar bo'yicha faollik</h3>
                    <p className="text-xs text-gray-500 mb-4">
                        Kamida bitta tadbirda qatnashgan talabalar ulushi
                    </p>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={faculties}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="faculty" tick={{ fontSize: 10, fill: '#64748b' }}
                                    interval={0} angle={-15} textAnchor="end" height={70}
                                />
                                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                <RechartsTooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{ borderRadius: 12, border: 'none' }}
                                    formatter={(v) => [`${v}%`, 'Faol talabalar']}
                                />
                                <Bar dataKey="activePercent" radius={[6, 6, 0, 0]} barSize={30}>
                                    {faculties.map((_, i) => (
                                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            {clubCategories.length > 0 && (
                <Card className="p-6 border-none">
                    <h3 className="font-bold text-gray-900 mb-4">Klublar yo'nalishlari bo'yicha</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={clubCategories}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                                <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 12, border: 'none' }} />
                                <Bar dataKey="value" name="Klublar soni" fill="#4F46E5" radius={[6, 6, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            )}

            <Card className="p-5 border-none bg-slate-50">
                <p className="text-[11px] text-gray-600 flex items-start gap-1.5">
                    <Info size={12} className="shrink-0 mt-px" />
                    <span>
                        Har bir raqam platformadagi yozuvdan hisoblanadi va sahifa qayta ochilganda
                        o'zgarmaydi. <b>Haftalik/soatlik faollik xaritasi</b> va <b>ball taqsimoti</b> olib
                        tashlandi — birinchisi uchun yozuvlarda aniq vaqt saqlanmaydi, ikkinchisi esa
                        jami talabaning foizi sifatida taxmin qilinardi.
                    </span>
                </p>
            </Card>
        </div>
    );
};

export default StatisticsPage;
