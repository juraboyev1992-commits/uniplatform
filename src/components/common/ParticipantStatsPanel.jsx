import React, { useMemo, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList,
} from 'recharts';
import { Users, UserCheck, Layers, CalendarDays, Info } from 'lucide-react';
import Card from './Card';
import { db } from '../../services/db';
import { buildParticipantStats, UNKNOWN_KEY } from '../../utils/participantStats';

// ISHTIROKCHILAR STATISTIKASI — tadbir, musobaqa va to'plamda AYNI komponent.
//
// Uchala joyda savol bir xil ("kim qatnashdi va qaysi kesimda"), shuning uchun
// uchta o'xshash ekran yozilmaydi: ular vaqt o'tib bir-biridan chetga chiqib
// ketardi. Faqat kiruvchi ma'lumot farq qiladi - bitta faoliyat yoki to'plamdagi
// hammasi.
//
// Ranglar loyihada allaqachon ishlatilayotgan juftlik (#4F46E5 / #10B981).
// Rang ko'rlik uchun tekshirildi: eng yaqin juftlik ΔE 31.3 (deutan), 37.1
// (normal) - ikkalasi ham me'yordan yuqori. Fon bilan kontrast pastroq
// bo'lgani uchun raqamlar ustunlarda OCHIQ yoziladi va pastda jadval turadi:
// rang yolg'iz tashuvchi bo'lib qolmasin.
const COLOR_REGISTERED = '#4F46E5';
const COLOR_ATTENDED = '#10B981';

const DIMENSIONS = [
    { id: 'faculty', label: 'Fakultet', field: 'byFaculty' },
    { id: 'course', label: 'Kurs', field: 'byCourse' },
    { id: 'group', label: 'Guruh', field: 'byGroup' },
    { id: 'tutor', label: 'Tyutor', field: 'byTutor' },
];

const Tile = ({ icon: Icon, label, value, hint, tone = 'indigo' }) => (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-wide">
            <Icon size={13} className={tone === 'emerald' ? 'text-emerald-500' : 'text-indigo-500'} />
            {label}
        </div>
        <p className="text-2xl font-black text-gray-900 mt-1 tabular-nums">{value}</p>
        {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
);

const ParticipantStatsPanel = ({ refs, subtitle }) => {
    const [dimension, setDimension] = useState('faculty');

    // Massiv IDENTITETIGA emas, mazmuniga bog'lanadi. Chaqiruvchilar `refs` ni
    // ko'pincha to'g'ridan-to'g'ri yozib beradi (har chizishda yangi massiv), va
    // identitetga bog'lansak hisob har renderda qaytadan yurardi. Kalit esa
    // faoliyatlar to'plami o'zgarmasa o'zgarmaydi.
    const refsKey = (refs || [])
        .map(r => `${r.activityType}:${r.activityId}`)
        .sort()
        .join('|');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const stats = useMemo(() => buildParticipantStats(db, refs), [refsKey]);
    const active = DIMENSIONS.find(d => d.id === dimension) || DIMENSIONS[0];
    const rows = stats[active.field] || [];

    const totalPeople = stats.people.length;
    const totalAttended = stats.people.filter(p => p.attended).length;

    if (totalPeople === 0) {
        return (
            <Card title="Ishtirokchilar statistikasi">
                <p className="text-sm text-gray-400 py-6 text-center">
                    Hali hech kim ro'yxatdan o'tmagan — statistika ro'yxat to'lgach paydo bo'ladi.
                </p>
            </Card>
        );
    }

    // Gorizontal ustun ATAYLAB: fakultet, guruh va tyutor nomlari uzun, tik
    // ustunda ular qiyshaytirib yozilar va o'qib bo'lmasdi. Balandlik qator
    // soniga qarab o'sadi - aks holda 12 ta fakultet bir-biriga yopishib qolardi.
    const chartHeight = Math.max(220, rows.length * 42 + 60);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Tile icon={Users} label="Ishtirokchilar" value={totalPeople}
                      hint={stats.activities > 1 ? `${stats.activities} ta faoliyat bo'yicha` : null} />
                <Tile
                    icon={UserCheck} tone="emerald" label="Qatnashgan"
                    // Davomat belgilanmagan bo'lsa NOL EMAS, chiziqcha. "0 kishi
                    // keldi" bilan "hali belgilanmagan" butunlay boshqa narsa va
                    // birinchisi rasmiy ekranda yolg'on bo'lardi.
                    value={stats.attendanceMarked ? totalAttended : '—'}
                    hint={stats.attendanceMarked
                        ? `${Math.round((totalAttended / totalPeople) * 100)}% qatnashdi`
                        : 'Davomat hali belgilanmagan'}
                />
                <Tile icon={Layers} label="Jamoalar" value={stats.teams} />
                <Tile icon={CalendarDays} label="Faoliyatlar" value={stats.activities} />
            </div>

            <Card
                title={`Kesim: ${active.label.toLowerCase()}`}
                subtitle={subtitle || "Ro'yxatdan o'tganlar va qatnashganlar"}
            >
                {/* Filtr bitta qatorda, diagramma USTIDA. */}
                <div className="flex flex-wrap gap-2 mb-4">
                    {DIMENSIONS.map(d => (
                        <button
                            key={d.id}
                            type="button"
                            onClick={() => setDimension(d.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                                dimension === d.id
                                    ? 'bg-gray-900 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {d.label}
                        </button>
                    ))}
                </div>

                {rows.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">Bu kesimda ma'lumot yo'q.</p>
                ) : (
                    <>
                        <div style={{ width: '100%', height: chartHeight }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={rows}
                                    layout="vertical"
                                    margin={{ top: 4, right: 40, left: 8, bottom: 4 }}
                                    barGap={2}
                                >
                                    {/* To'r susaygan: u ma'lumot emas, o'lchov yordamchisi. */}
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                                    <YAxis
                                        type="category" dataKey="key" width={140}
                                        tick={{ fontSize: 11, fill: '#4B5563' }}
                                        interval={0}
                                    />
                                    <Tooltip
                                        cursor={{ fill: '#F9FAFB' }}
                                        contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #E5E7EB' }}
                                    />
                                    {/* Ikki qator bo'lgani uchun afsona MAJBURIY - rang
                                        yolg'iz tashuvchi bo'lib qolmasligi kerak. */}
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Bar
                                        dataKey="registered" name="Ro'yxatdan o'tgan"
                                        fill={COLOR_REGISTERED} radius={[0, 4, 4, 0]} barSize={12}
                                    >
                                        <LabelList dataKey="registered" position="right"
                                                   style={{ fontSize: 11, fill: '#4B5563', fontWeight: 700 }} />
                                    </Bar>
                                    {/* Davomat belgilanmagan bo'lsa bu qator UMUMAN
                                        chizilmaydi: nol uzunlikdagi ustunlar "hech kim
                                        kelmagan" degan taassurot berardi. */}
                                    {stats.attendanceMarked && (
                                        <Bar
                                            dataKey="attended" name="Qatnashgan"
                                            fill={COLOR_ATTENDED} radius={[0, 4, 4, 0]} barSize={12}
                                        >
                                            <LabelList dataKey="attended" position="right"
                                                       style={{ fontSize: 11, fill: '#4B5563', fontWeight: 700 }} />
                                        </Bar>
                                    )}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* JADVAL - diagrammaning muqobili, bezak emas. Rangni
                            ajrata olmaydigan yoki chop etib o'qiydigan odam ham
                            ayni raqamlarga yetadi. */}
                        <div className="overflow-x-auto mt-4">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-[11px] font-bold text-gray-400 uppercase">
                                        <th className="px-3 py-2 text-left">{active.label}</th>
                                        <th className="px-3 py-2 text-right">Ro'yxatdan o'tgan</th>
                                        {stats.attendanceMarked && <th className="px-3 py-2 text-right">Qatnashgan</th>}
                                        {stats.attendanceMarked && <th className="px-3 py-2 text-right">Foiz</th>}
                                        <th className="px-3 py-2 text-right">Ulush</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {rows.map(r => (
                                        <tr key={r.key} className={r.key === UNKNOWN_KEY ? 'text-gray-400' : ''}>
                                            <td className="px-3 py-2">{r.key}</td>
                                            <td className="px-3 py-2 text-right font-bold tabular-nums">{r.registered}</td>
                                            {stats.attendanceMarked && (
                                                <td className="px-3 py-2 text-right tabular-nums">{r.attended}</td>
                                            )}
                                            {stats.attendanceMarked && (
                                                <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                                                    {r.registered > 0 ? `${Math.round((r.attended / r.registered) * 100)}%` : '—'}
                                                </td>
                                            )}
                                            <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                                                {Math.round((r.registered / totalPeople) * 100)}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <p className="text-[11px] text-gray-400 mt-3 flex items-start gap-1.5">
                            <Info size={12} className="shrink-0 mt-0.5" />
                            Ulush — shu faoliyatdagi ishtirokchilarga nisbatan, universitetdagi jami
                            talabalarga emas. Bir odam bir necha faoliyatda qatnashsa bir marta sanaladi.
                            {rows.some(r => r.key === UNKNOWN_KEY) && ` «${UNKNOWN_KEY}» — yozuvida bu ma'lumot ko'rsatilmagan ishtirokchilar.`}
                        </p>
                    </>
                )}
            </Card>
        </div>
    );
};

export default ParticipantStatsPanel;
