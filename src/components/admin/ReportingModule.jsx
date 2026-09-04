import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
    FileSpreadsheet, Download, Info, Users, Building2, Calendar, Trophy,
    FileCheck, BarChart3, BookOpen, Upload, Layers,
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { db } from '../../services/db';
import {
    getPlatformOverview, getFacultyStats, getClubActivityStats, getMonthlyActivity,
} from '../../utils/platformStats';
import { INDEX_CRITERIA, INDEX_CRITERIA_ORDER } from '../../config/socialActivityIndex';
import DeduplicatorPanel from './DeduplicatorPanel';

// HISOBOTLAR.
//
// Bu bo'lim ilgari O'YLAB TOPILGAN ma'lumot ustida ishlardi: "Demo ma'lumot
// yuklash" tugmasi generatsiya qilingan ismlarni (`Math.random()` bilan
// tartibi almashtirilgan) qatorlarga solardi va ro'yxatdagi to'rtta hisobot
// ham kodga yozib qo'yilgan edi ("Bugun, 10:30 da tayyorlangan").
//
// Ikkita narsa ajratildi:
//   1. HISOBOTLAR - endi haqiqiy yozuvlardan Excel tayyorlaydi.
//   2. RO'YXAT TOZALASH - `services/deduplicator.js` haqiqiy va ishlaydigan
//      algoritm (ism variantlarini taqqoslab birlashtiradi). U saqlandi,
//      lekin endi HAQIQIY fayl yuklanadi, demo ma'lumot emas.
const ReportingModule = () => {
    const [tab, setTab] = useState('hisobotlar');
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

    // INDEKS HISOBOTI eng qimmatlisi, lekin eng og'iri: har talabaning
    // indeksi alohida hisoblanadi. Shuning uchun u tugma bosilgandagina
    // ishga tushadi va sahifa ochilishida hisoblanmaydi.
    const buildIndexReport = () => {
        const students = db.getMockStudents();
        const rows = students.map(s => {
            const index = db.getSocialActivityIndex(s.id);
            const row = {
                'F.I.Sh.': s.fullName,
                'Fakultet': s.faculty || '',
                'Kurs': s.course || '',
                'Guruh': s.group || '',
                'Jami ball': index.total,
                'Hisoblangan mezon': `${index.scoredCount} / ${index.totalCount}`,
            };
            INDEX_CRITERIA_ORDER.forEach((key, i) => {
                const c = index.criteria.find(x => x.key === key);
                // Hisoblanmagan mezon 0 emas, BO'SH qoladi - Excelda ham
                // "nol ball" va "hisoblanmagan" bir xil ko'rinmasligi kerak.
                row[`${i + 1}. ${INDEX_CRITERIA[key].name}`] = c?.points != null ? c.points : '';
            });
            return row;
        });
        save([{ name: 'Indeks', rows }], `Ijtimoiy-faollik-indeksi-${stamp()}.xlsx`);
    };

    const reports = [
        {
            key: 'index',
            title: 'Ijtimoiy faollik indeksi',
            description: "Har talaba bo'yicha 11 mezon va jami ball. Hisoblanmagan mezon bo'sh qoladi.",
            icon: BarChart3, color: 'text-indigo-600', bg: 'bg-indigo-50',
            note: `${overview.students} talaba · hisoblash biroz vaqt oladi`,
            run: buildIndexReport,
        },
        {
            key: 'faculties',
            title: 'Fakultetlar kesimi',
            description: "Talabalar, guruhlar, faol talabalar ulushi, qatnashuv va hujjatlar",
            icon: Building2, color: 'text-emerald-600', bg: 'bg-emerald-50',
            note: `${faculties.length} fakultet`,
            run: () => save([{
                name: 'Fakultetlar',
                rows: faculties.map(f => ({
                    'Fakultet': f.faculty, 'Talabalar': f.students, 'Guruhlar': f.groups,
                    'Faol talabalar': f.activeStudents, 'Faol talabalar %': f.activePercent,
                    'Jami qatnashuv': f.participations, 'Berilgan hujjat': f.documents,
                })),
            }], `Fakultetlar-${stamp()}.xlsx`),
        },
        {
            key: 'clubs',
            title: 'Klublar faoliyati',
            description: "O'tkazilgan tadbirlar va ulardagi qatnashuv",
            icon: Trophy, color: 'text-amber-600', bg: 'bg-amber-50',
            note: `${clubs.length} klub`,
            run: () => save([{
                name: 'Klublar',
                rows: clubs.map(c => ({
                    'Klub': c.name, "Yo'nalish": c.category || '',
                    'Tadbirlar': c.events, 'Qatnashuv': c.participations,
                })),
            }], `Klublar-${stamp()}.xlsx`),
        },
        {
            key: 'reading',
            title: 'Kitobxonlik',
            description: "Asarlar ro'yxati va ular bo'yicha topshirilgan testlar",
            icon: BookOpen, color: 'text-teal-600', bg: 'bg-teal-50',
            note: `${db.getReadingTests().length} ta asar`,
            run: () => {
                const tests = db.getReadingTests();
                save([{
                    name: 'Asarlar',
                    rows: tests.map(t => {
                        const attempts = (db.getTestAttempts ? db.getTestAttempts() : [])
                            .filter(a => a.testId === t.id && a.finishedAt);
                        const passed = attempts.filter(a =>
                            a.maxScore > 0 && (a.score / a.maxScore) * 100 >= (t.passPercent || 60));
                        return {
                            'Asar': t.readingBook.title,
                            'Muallif': t.readingBook.author || '',
                            "Ta'lim tili": t.readingBook.language || 'har ikkalasi',
                            "E'lon qilingan": t.isPublished ? 'ha' : "yo'q",
                            'Topshirganlar': attempts.length,
                            "O'tganlar": passed.length,
                        };
                    }),
                }], `Kitobxonlik-${stamp()}.xlsx`);
            },
        },
        {
            key: 'monthly',
            title: 'Oylik dinamika',
            description: "So'nggi 12 oy: tadbirlar, ro'yxatdan o'tishlar, hujjatlar",
            icon: Calendar, color: 'text-violet-600', bg: 'bg-violet-50',
            note: '12 oy',
            run: () => save([{
                name: 'Oylik',
                rows: monthly.map(m => ({
                    'Oy': m.name, 'Tadbirlar': m.tadbirlar,
                    "Ro'yxatdan o'tish": m.royxat, 'Berilgan hujjat': m.hujjatlar,
                })),
            }], `Oylik-dinamika-${stamp()}.xlsx`),
        },
        {
            key: 'students',
            title: "Talabalar ro'yxati",
            description: 'Fakultet, kurs va guruh kesimida',
            icon: Users, color: 'text-slate-600', bg: 'bg-slate-50',
            note: `${overview.students} talaba`,
            run: () => save([{
                name: 'Talabalar',
                rows: db.getMockStudents().map(s => ({
                    'F.I.Sh.': s.fullName, 'Talaba ID': s.studentId || s.id,
                    'Fakultet': s.faculty || '', 'Kurs': s.course || '', 'Guruh': s.group || '',
                })),
            }], `Talabalar-${stamp()}.xlsx`),
        },
    ];

    return (
        <div className="space-y-6 font-sans">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                        <FileSpreadsheet className="w-7 h-7 text-indigo-600" /> Hisobotlar
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Platformadagi yozuvlardan tayyorlanadigan Excel hisobotlari
                    </p>
                </div>
                <div className="flex flex-wrap bg-slate-100 p-1.5 rounded-xl gap-1 self-start md:self-auto">
                    {[
                        { id: 'hisobotlar', label: 'Hisobotlar' },
                        { id: 'tozalash', label: "Ro'yxat tozalash" },
                    ].map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`px-4 py-2 rounded-lg text-xs font-extrabold transition-all ${
                                tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {tab === 'hisobotlar' && (
                <>
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
                                            {r.note && <Badge variant="default" size="sm">{r.note}</Badge>}
                                        </div>
                                        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{r.description}</p>
                                        <Button
                                            variant="outline" size="sm" icon={Download}
                                            className="mt-3" onClick={r.run}
                                        >
                                            Excel yuklab olish
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>

                    <Card className="p-5 border-none bg-slate-50">
                        <p className="text-[11px] text-gray-600 flex items-start gap-1.5">
                            <Info size={12} className="shrink-0 mt-px" />
                            <span>
                                Hisobot tugma bosilgan zahoti tayyorlanadi. Indeks hisobotida
                                <b> hisoblanmagan mezon bo'sh qoladi</b> — Excelda ham "nol ball" va
                                "hisoblanmagan" bir xil ko'rinmasligi kerak.
                            </span>
                        </p>
                    </Card>
                </>
            )}

            {tab === 'tozalash' && <DeduplicatorPanel />}
        </div>
    );
};

export default ReportingModule;
