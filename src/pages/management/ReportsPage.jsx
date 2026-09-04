import React, { useMemo, useState } from 'react';
import {
    FileSpreadsheet, Download, Info, Users, Building2, Calendar, Trophy, FileCheck,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import { db } from '../../services/db';
import {
    getPlatformOverview, getFacultyStats, getClubActivityStats, getMonthlyActivity,
} from '../../utils/platformStats';

// RAHBARIYAT HISOBOTLARI.
//
// Bu sahifa ilgari HISOBOT YARATMASDI: "Yaratish" tugmasi `setTimeout` bilan
// ro'yxatga yangi qator qo'shardi ("1.5 MB", "PDF", "Tayyor"), lekin hech
// qanday fayl yo'q edi va "Yuklab olish" hech narsa bermasdi. Ro'yxatdagi
// to'rtta hisobot ham kodga yozib qo'yilgan edi.
//
// Endi har tugma HAQIQIY Excel faylini tayyorlab beradi - platformadagi
// yozuvlardan. Kutish animatsiyasi ham yo'q: ma'lumot brauzerda, uni
// "generatsiya qilish" degan taassurot berish yolg'on bo'lardi.
const ReportsPage = () => {
    const [message, setMessage] = useState('');

    const overview = useMemo(() => getPlatformOverview(db), []);
    const faculties = useMemo(() => getFacultyStats(db), []);
    const clubs = useMemo(() => getClubActivityStats(db), []);
    const monthly = useMemo(() => getMonthlyActivity(db, 12), []);

    const stamp = () => new Date().toISOString().slice(0, 10);

    const save = (sheets, fileName) => {
        const wb = XLSX.utils.book_new();
        sheets.forEach(({ name, rows }) => {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
        });
        XLSX.writeFile(wb, fileName);
        setMessage(`${fileName} yuklab olindi.`);
    };

    const reports = [
        {
            key: 'faculties',
            title: 'Fakultetlar kesimidagi hisobot',
            description: "Har fakultet bo'yicha talabalar, guruhlar, faol talabalar ulushi, qatnashuv va berilgan hujjatlar",
            icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-50',
            rows: faculties.length,
            run: () => save([{
                name: 'Fakultetlar',
                rows: faculties.map(f => ({
                    'Fakultet': f.faculty,
                    'Talabalar': f.students,
                    'Guruhlar': f.groups,
                    'Faol talabalar': f.activeStudents,
                    'Faol talabalar %': f.activePercent,
                    'Jami qatnashuv': f.participations,
                    'Berilgan hujjat': f.documents,
                })),
            }], `Fakultetlar-hisoboti-${stamp()}.xlsx`),
        },
        {
            key: 'clubs',
            title: 'Klublar faoliyati',
            description: "Har klub bo'yicha o'tkazilgan tadbirlar va ulardagi qatnashuv soni",
            icon: Trophy, color: 'text-emerald-600', bg: 'bg-emerald-50',
            rows: clubs.length,
            run: () => save([{
                name: 'Klublar',
                rows: clubs.map(c => ({
                    'Klub': c.name,
                    "Yo'nalish": c.category || '',
                    'Tadbirlar': c.events,
                    'Qatnashuv': c.participations,
                })),
            }], `Klublar-faoliyati-${stamp()}.xlsx`),
        },
        {
            key: 'monthly',
            title: 'Oylik dinamika',
            description: "So'nggi 12 oy: tadbirlar, ro'yxatdan o'tishlar va berilgan hujjatlar",
            icon: Calendar, color: 'text-amber-600', bg: 'bg-amber-50',
            rows: monthly.length,
            run: () => save([{
                name: 'Oylik',
                rows: monthly.map(m => ({
                    'Oy': m.name,
                    'Tadbirlar': m.tadbirlar,
                    "Ro'yxatdan o'tish": m.royxat,
                    'Berilgan hujjat': m.hujjatlar,
                })),
            }], `Oylik-dinamika-${stamp()}.xlsx`),
        },
        {
            key: 'students',
            title: "Talabalar ro'yxati",
            description: 'Fakultet, kurs va guruh kesimida',
            icon: Users, color: 'text-violet-600', bg: 'bg-violet-50',
            rows: overview.students,
            run: () => save([{
                name: 'Talabalar',
                rows: db.getMockStudents().map(s => ({
                    'F.I.Sh.': s.fullName,
                    'Talaba ID': s.studentId || s.id,
                    'Fakultet': s.faculty || '',
                    'Kurs': s.course || '',
                    'Guruh': s.group || '',
                })),
            }], `Talabalar-royxati-${stamp()}.xlsx`),
        },
        {
            key: 'summary',
            title: 'Umumiy sarhisob',
            description: "Platformaning barcha asosiy ko'rsatkichlari bitta faylda",
            icon: FileCheck, color: 'text-cyan-600', bg: 'bg-cyan-50',
            rows: null,
            run: () => save([
                {
                    name: 'Umumiy',
                    rows: [
                        { "Ko'rsatkich": 'Talabalar', 'Qiymat': overview.students },
                        { "Ko'rsatkich": 'Fakultetlar', 'Qiymat': overview.faculties },
                        { "Ko'rsatkich": 'Guruhlar', 'Qiymat': overview.groups },
                        { "Ko'rsatkich": 'Klublar', 'Qiymat': overview.clubs },
                        { "Ko'rsatkich": 'Tadbirlar', 'Qiymat': overview.events },
                        { "Ko'rsatkich": "Rejadagi tadbirlar", 'Qiymat': overview.eventsUpcoming },
                        { "Ko'rsatkich": 'Musobaqalar', 'Qiymat': overview.competitions },
                        { "Ko'rsatkich": "Ro'yxatdan o'tishlar", 'Qiymat': overview.registrations },
                        { "Ko'rsatkich": 'Berilgan hujjatlar', 'Qiymat': overview.documents },
                        { "Ko'rsatkich": 'Xalqaro miqyosdagi faoliyat', 'Qiymat': overview.internationalCount },
                    ],
                },
                {
                    name: 'Fakultetlar',
                    rows: faculties.map(f => ({
                        'Fakultet': f.faculty, 'Talabalar': f.students,
                        'Faol talabalar %': f.activePercent, 'Qatnashuv': f.participations,
                    })),
                },
                {
                    name: 'Klublar',
                    rows: clubs.map(c => ({
                        'Klub': c.name, 'Tadbirlar': c.events, 'Qatnashuv': c.participations,
                    })),
                },
            ], `Umumiy-sarhisob-${stamp()}.xlsx`),
        },
    ];

    return (
        <div className="space-y-6 pb-10">
            <div>
                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Hisobotlar</h1>
                <p className="text-gray-500 mt-1">
                    Platformadagi yozuvlardan tayyorlanadigan Excel hisobotlari
                </p>
            </div>

            {message && (
                <Card className="p-4 border-none bg-emerald-50">
                    <p className="text-xs font-semibold text-emerald-800">{message}</p>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reports.map(r => (
                    <Card key={r.key} className="p-5 border-none">
                        <div className="flex items-start gap-3">
                            <div className={`p-2.5 rounded-xl shrink-0 ${r.bg} ${r.color}`}>
                                <r.icon size={20} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2 flex-wrap">
                                    <h3 className="font-bold text-gray-900 text-sm">{r.title}</h3>
                                    {r.rows != null && (
                                        <Badge variant="default" size="sm">{r.rows} qator</Badge>
                                    )}
                                </div>
                                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{r.description}</p>
                                <Button
                                    variant="outline" size="sm" icon={Download}
                                    className="mt-3"
                                    disabled={r.rows === 0}
                                    onClick={r.run}
                                >
                                    Excel yuklab olish
                                </Button>
                                {r.rows === 0 && (
                                    <p className="text-[11px] text-gray-400 mt-1.5">
                                        Hisobot uchun ma'lumot yo'q.
                                    </p>
                                )}
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            <Card className="p-5 border-none bg-slate-50">
                <p className="text-[11px] text-gray-600 flex items-start gap-1.5">
                    <Info size={12} className="shrink-0 mt-px" />
                    <span>
                        Hisobot tugma bosilgan zahoti tayyorlanadi — ma'lumot brauzerda, kutish
                        kerak emas. Ilgari bu sahifa <b>fayl yaratmasdan</b> ro'yxatga yozuv
                        qo'shardi va "Yuklab olish" hech narsa bermasdi.
                    </span>
                </p>
            </Card>
        </div>
    );
};

export default ReportsPage;
