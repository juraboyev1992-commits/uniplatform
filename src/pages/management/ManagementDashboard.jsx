import React, { useMemo } from 'react';
import {
    Users, Award, Building2, Globe, Calendar, Trophy, FileCheck, Info,
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import { db } from '../../services/db';
import {
    getPlatformOverview, getMonthlyActivity, getFacultyStats, getClubActivityStats,
} from '../../utils/platformStats';

// RAHBARIYAT BOSH SAHIFASI.
//
// Bu sahifa ilgari TO'LIQ TO'QIMA edi: "Umumiy faollik 78%", "Grants & Fondlar
// 420.5m", "Strategik maqsadlar 12/15", oylik grafik va fakultetlar ro'yxati -
// hammasi kodga yozib qo'yilgan raqamlar edi. Undan ham yomoni, ko'rsatilgan
// fakultetlar platformada umuman mavjud emas edi (Dasturiy muhandislik,
// Filologiya, Pedagogika), ya'ni rahbar boshqa universitet haqida hisobot
// ko'rib turardi.
//
// Endi har raqam haqiqiy yozuvdan keladi. Manbasi bo'lmagan ko'rsatkichlar
// OLIB TASHLANDI, o'ylab topilmadi:
//   - Grantlar va fondlar: platformada moliya moduli yo'q
//   - Strategik maqsadlar: bunday tushuncha yo'q
const BAR_COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

const ManagementDashboard = () => {
    const overview = useMemo(() => getPlatformOverview(db), []);
    const monthly = useMemo(() => getMonthlyActivity(db, 6), []);
    const faculties = useMemo(() => getFacultyStats(db), []);
    const clubs = useMemo(() => getClubActivityStats(db).slice(0, 6), []);

    const kpis = [
        {
            label: 'Talabalar', value: overview.students.toLocaleString('uz-UZ'),
            note: `${overview.faculties} fakultet · ${overview.groups} guruh`,
            icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50',
        },
        {
            label: 'Klublar', value: overview.clubs,
            note: `${overview.events} tadbir o'tkazilgan`,
            icon: Building2, color: 'text-emerald-600', bg: 'bg-emerald-50',
        },
        {
            label: 'Musobaqalar', value: overview.competitions,
            note: `${overview.documents} ta hujjat berilgan`,
            icon: Trophy, color: 'text-amber-600', bg: 'bg-amber-50',
        },
        {
            // Ilgari bu "Xalqaro hamkorlik: 24" deb yozib qo'yilgan edi.
            // Endi faoliyatning `level` maydonidan sanaladi.
            label: 'Xalqaro miqyosdagi faoliyat', value: overview.internationalCount,
            note: 'tadbir va musobaqalar',
            icon: Globe, color: 'text-blue-600', bg: 'bg-blue-50',
        },
    ];

    const hasMonthly = monthly.some(m => m.tadbirlar || m.royxat || m.hujjatlar);

    return (
        <div className="space-y-6 pb-10">
            <div>
                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Rahbariyat Dashboard</h1>
                <p className="text-gray-500 text-lg mt-1">
                    Universitetning platformadagi haqiqiy ko'rsatkichlari
                </p>
            </div>

            {/* KPI - hammasi haqiqiy yozuvdan */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {kpis.map((kpi, idx) => (
                    <Card key={idx} className="p-6 border-none bg-white/70 backdrop-blur-md shadow-sm">
                        <div className={`p-3 rounded-2xl inline-flex ${kpi.bg} ${kpi.color}`}>
                            <kpi.icon size={24} />
                        </div>
                        <div className="mt-4">
                            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">{kpi.label}</p>
                            <p className="text-2xl font-black text-gray-900 mt-1">{kpi.value}</p>
                            <p className="text-xs text-gray-400 mt-1">{kpi.note}</p>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* OYLIK DINAMIKA - tadbir, ro'yxatdan o'tish va hujjat sanalaridan */}
                <Card className="lg:col-span-2 p-6 border-none">
                    <h3 className="font-bold text-gray-900 mb-1">Oylik dinamika</h3>
                    <p className="text-xs text-gray-500 mb-4">
                        O'tkazilgan tadbirlar, ro'yxatdan o'tishlar va berilgan hujjatlar
                    </p>
                    {hasMonthly ? (
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={monthly}>
                                    <defs>
                                        <linearGradient id="gEvents" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gRegs" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                                    <RechartsTooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                    <Area type="monotone" dataKey="royxat" name="Ro'yxatdan o'tish" stroke="#10B981" fill="url(#gRegs)" strokeWidth={2} />
                                    <Area type="monotone" dataKey="tadbirlar" name="Tadbirlar" stroke="#4F46E5" fill="url(#gEvents)" strokeWidth={2} />
                                    <Area type="monotone" dataKey="hujjatlar" name="Hujjatlar" stroke="#F59E0B" fill="none" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        // Bo'sh grafik chizishdan ko'ra sababini aytish yaxshiroq.
                        <p className="text-sm text-gray-400 py-16 text-center">
                            So'nggi 6 oyda qayd etilgan faoliyat yo'q.
                        </p>
                    )}
                </Card>

                {/* ENG FAOL KLUBLAR - davomat yozuvlaridan */}
                <Card className="p-6 border-none">
                    <h3 className="font-bold text-gray-900 mb-1">Eng faol klublar</h3>
                    <p className="text-xs text-gray-500 mb-4">Tadbirlardagi qatnashuv soni bo'yicha</p>
                    {clubs.length === 0 || clubs.every(c => c.participations === 0) ? (
                        <p className="text-sm text-gray-400 py-10 text-center">
                            Klub tadbirlarida davomat hali belgilanmagan.
                        </p>
                    ) : (
                        <div className="space-y-2.5">
                            {clubs.map((c, i) => (
                                <div key={c.id}>
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <span className="text-xs font-semibold text-gray-700 truncate">{c.name}</span>
                                        <span className="text-xs font-bold text-gray-900 tabular-nums shrink-0">
                                            {c.participations}
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full"
                                            style={{
                                                width: `${clubs[0].participations > 0 ? (c.participations / clubs[0].participations) * 100 : 0}%`,
                                                backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                                            }}
                                        />
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-0.5">{c.events} ta tadbir</p>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>

            {/* FAKULTETLAR - faol talabalar ulushi bo'yicha */}
            <Card className="p-6 border-none">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                    <div>
                        <h3 className="font-bold text-gray-900">Fakultetlar kesimi</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Kamida bitta tadbirda qatnashgan talabalar ulushi
                        </p>
                    </div>
                    <Badge variant="default">{faculties.length} fakultet</Badge>
                </div>

                {faculties.length === 0 ? (
                    <p className="text-sm text-gray-400 py-10 text-center">Fakultet ma'lumoti yo'q.</p>
                ) : (
                    <>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={faculties} layout="vertical" margin={{ left: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: '#64748b' }} />
                                    <YAxis
                                        type="category" dataKey="faculty" width={140}
                                        tick={{ fontSize: 11, fill: '#334155' }}
                                    />
                                    <RechartsTooltip
                                        cursor={{ fill: '#f8fafc' }}
                                        contentStyle={{ borderRadius: 12, border: 'none' }}
                                        formatter={(v) => [`${v}%`, 'Faol talabalar']}
                                    />
                                    <Bar dataKey="activePercent" radius={[0, 6, 6, 0]} barSize={18}>
                                        {faculties.map((_, i) => (
                                            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="text-[10px] uppercase text-gray-400 border-b border-gray-100">
                                        <th className="py-2 font-bold">Fakultet</th>
                                        <th className="py-2 font-bold text-right">Talaba</th>
                                        <th className="py-2 font-bold text-right">Guruh</th>
                                        <th className="py-2 font-bold text-right">Faol talaba</th>
                                        <th className="py-2 font-bold text-right">Qatnashuv</th>
                                        <th className="py-2 font-bold text-right">Hujjat</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {faculties.map(f => (
                                        <tr key={f.faculty}>
                                            <td className="py-2 font-semibold text-gray-800">{f.faculty}</td>
                                            <td className="py-2 text-right tabular-nums">{f.students}</td>
                                            <td className="py-2 text-right tabular-nums">{f.groups}</td>
                                            <td className="py-2 text-right tabular-nums">
                                                {f.activeStudents} <span className="text-gray-400">({f.activePercent}%)</span>
                                            </td>
                                            <td className="py-2 text-right tabular-nums">{f.participations}</td>
                                            <td className="py-2 text-right tabular-nums">{f.documents}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </Card>

            {/* Nima uchun ba'zi ko'rsatkichlar yo'qligini AYTIB qo'yamiz -
                ular jimgina yo'qolgani "unutilgan" degan taassurot berardi. */}
            <Card className="p-5 border-none bg-slate-50">
                <p className="text-[11px] text-gray-600 flex items-start gap-1.5">
                    <Info size={12} className="shrink-0 mt-px" />
                    <span>
                        Bu sahifadagi har bir raqam platformadagi haqiqiy yozuvdan hisoblanadi.
                        <b> Grantlar va moliyaviy ko'rsatkichlar</b> hamda <b>strategik maqsadlar</b> bo'limlari
                        olib tashlandi — platformada bunday ma'lumot yuritilmaydi va ularni ko'rsatish
                        haqiqiy hisobot taassurotini berardi.
                    </span>
                </p>
            </Card>
        </div>
    );
};

export default ManagementDashboard;
