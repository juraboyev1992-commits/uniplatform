import React, { useMemo, useState } from 'react';
import {
    Lightbulb, Plus, Users, Lock, Unlock, Trash2, ChevronLeft,
    AlertTriangle, CheckCircle2, Star, Search, Save, Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import MarifatStatsStrip from '../../components/admin/MarifatStatsStrip';
import { db, getCurrentAcademicYear } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { useTabParam } from '../../hooks/useTabParam';
import {
    INDEX_CRITERIA, MARIFAT, educationAttendanceToPoints,
} from '../../config/socialActivityIndex';

// "MA'RIFAT DARSLARI" MODULI (ijtimoiy faollik indeksining 7-mezoni).
//
// Nega tadbirlardan alohida: Ma'rifat darsi AUDITORIYA kesimida
// rejalashtiriladi ("1-kurs uchun 6 ta dars"), va ball aynan shu auditoriya
// doirasidagi davomat foizidan chiqadi. Tadbirlar ro'yxatiga qo'shilsa
// maxrajni aniqlashning iloji bo'lmasdi.
//
// Ball ikki qismdan: davomat (6 ballgacha, tizim hisoblaydi) va faollik
// (4 ballgacha, vakolatli shaxs qo'yadi).
const MarifatLessonsPage = () => {
    const { user } = useAuth();
    const criterion = INDEX_CRITERIA.EDUCATION;
    const [tab, setTab] = useTabParam(['darslar', 'jurnal', 'faollik'], 'darslar');
    const [version, setVersion] = useState(0);
    const [openLessonId, setOpenLessonId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const academicYear = getCurrentAcademicYear();
    const lessons = useMemo(() => db.getMarifatLessons(academicYear), [academicYear, version]);
    const students = useMemo(() => db.getMockStudents(), []);
    const faculties = useMemo(
        () => [...new Set(students.map(s => s.faculty).filter(Boolean))].sort(),
        [students]
    );

    const run = async (fn, ok = '') => {
        setBusy(true); setError(''); setMessage('');
        try { await fn(); setVersion(v => v + 1); if (ok) setMessage(ok); }
        catch (e) { setError(e?.message || 'Xatolik yuz berdi.'); }
        finally { setBusy(false); }
    };

    // --- Dars yaratish/tahrirlash ---
    const [form, setForm] = useState({ id: null, title: '', topic: '', date: '', faculty: '', course: '', venue: '' });
    const openForm = (lesson = null) => {
        setForm(lesson
            ? { ...lesson, course: String(lesson.course) }
            : { id: null, title: '', topic: '', date: new Date().toISOString().slice(0, 10), faculty: '', course: '', venue: '' });
        setShowForm(true);
        setError('');
    };

    const saveLesson = () => run(async () => {
        await db.saveMarifatLesson({ ...form, by: user?.username, academicYear });
        setShowForm(false);
    }, 'Dars saqlandi.');

    // --- Davomat ---
    const openLesson = useMemo(
        () => lessons.find(l => l.id === openLessonId) || null,
        [lessons, openLessonId]
    );
    const [marks, setMarks] = useState({});
    const [rosterSearch, setRosterSearch] = useState('');
    // 'all' | 'unmarked' | 'absent' - belgilashni tekshirib chiqish uchun.
    const [rosterFilter, setRosterFilter] = useState('all');

    // TO'LIQ auditoriya - qidiruv va filtrdan QAT'I NAZAR. Saqlash aynan shundan
    // yoziladi.
    //
    // Ilgari saqlash ko'rinib turgan (qidiruv bilan filtrlangan) ro'yxatdan
    // yozardi. Ma'lumot o'chmasdi (upsert), lekin qidiruvdan keyin saqlagan mas'ul
    // qolgan talabalarga umuman YOZUV QOLDIRMASDI - ular jurnalda "kelmagan" bo'lib
    // chiqardi, holbuki ular haqida hech kim hech narsa aytmagan edi.
    const fullRoster = useMemo(() => {
        if (!openLesson) return [];
        return students
            .filter(s => s.faculty === openLesson.faculty && Number(s.course) === Number(openLesson.course))
            .sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
    }, [students, openLesson]);

    const saved = useMemo(
        () => (openLesson ? new Map(db.getMarifatAttendance(openLesson.id).map(a => [a.studentId, a])) : new Map()),
        [openLesson, version]
    );

    const markOf = (studentId) => marks[studentId] || saved.get(studentId) || { present: false, active: false };

    // "Belgilanmagan" - saqlangan yozuvi ham, joriy belgisi ham yo'q talaba. Bu
    // "kelmagan" BILAN BIR XIL EMAS: kelmagani ataylab belgilangan, belgilanmagani
    // esa shunchaki e'tibordan chetda qolgan.
    const isUnmarked = (studentId) => !marks[studentId] && !saved.has(studentId);

    // Ekranda ko'rinadigan ro'yxat: qidiruv + filtr.
    const roster = useMemo(() => {
        const q = rosterSearch.trim().toLowerCase();
        return fullRoster
            .filter(s => !q || s.fullName?.toLowerCase().includes(q))
            .filter(s => {
                if (rosterFilter === 'unmarked') return isUnmarked(s.id);
                if (rosterFilter === 'absent') return !markOf(s.id).present;
                return true;
            });
    }, [fullRoster, rosterSearch, rosterFilter, marks, saved]);

    const setMark = (studentId, patch) => setMarks(m => ({
        ...m,
        [studentId]: { ...markOf(studentId), ...patch },
    }));

    // Qatorning istalgan joyiga bosish "qatnashdi" ni almashtiradi - auditoriyada
    // telefon bilan kichkina katakchani nishonga olish qiyin.
    const togglePresent = (studentId) => {
        const cur = markOf(studentId);
        setMark(studentId, { present: !cur.present, active: !cur.present ? cur.active : false });
    };

    const saveAttendance = () => run(async () => {
        // TO'LIQ ro'yxat yoziladi - shunda hech kim yozuvsiz qolmaydi.
        const rows = fullRoster.map(s => ({ studentId: s.id, ...markOf(s.id) }));
        await db.markMarifatAttendance(openLesson.id, rows, { by: user?.username });
        setMarks({});
    }, 'Davomat saqlandi.');

    const presentCount = fullRoster.filter(s => markOf(s.id).present).length;
    const activeCount = fullRoster.filter(s => markOf(s.id).active).length;
    const unmarkedCount = fullRoster.filter(s => isUnmarked(s.id)).length;
    // Saqlanmagan o'zgarish bormi - oynani yopishdan oldin ogohlantirish uchun.
    const isDirty = Object.keys(marks).length > 0;

    // Oynani yopish: saqlanmagan belgi bo'lsa tasdiq so'raladi. Ilgari yopish
    // belgilarni jimgina yo'q qilardi.
    const closeLesson = () => {
        if (isDirty && !window.confirm("Saqlanmagan belgilar bor. Ular yo'qoladi. Yopilsinmi?")) return;
        setOpenLessonId(null);
        setMarks({});
        setRosterSearch('');
        setRosterFilter('all');
    };

    // --- Jurnal ---
    const [journalFaculty, setJournalFaculty] = useState('');
    const [journalCourse, setJournalCourse] = useState('');

    const journal = useMemo(() => {
        if (tab !== 'jurnal' || !journalFaculty || !journalCourse) return null;

        // Maxrajga faqat DAVOMATI BELGILANGAN darslar kiradi - hisobdagi
        // qoidaning aynan o'zi, aks holda jurnaldagi foiz indeksdagidan
        // farq qilib qolardi.
        const all = db.getMarifatLessons(academicYear)
            .filter(l => l.faculty === journalFaculty && Number(l.course) === Number(journalCourse));
        const withAttendance = all
            .map(l => ({ ...l, attendance: db.getMarifatAttendance(l.id) }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        const lessons = withAttendance.filter(l => l.attendance.length > 0);
        // Davomati umuman belgilanmagan darslar. Ular hisobga KIRMAYDI (yuqoridagi
        // izohga qarang), lekin JIM YASHIRINIB ham qolmasligi kerak: aks holda
        // o'tkazib yuborilgan dars jurnalda umuman ko'rinmay, hech kim uni
        // belgilashni eslamaydi.
        const unmarkedLessons = withAttendance.filter(l => l.attendance.length === 0);

        const rows = students
            .filter(s => s.faculty === journalFaculty && Number(s.course) === Number(journalCourse))
            .sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)))
            .map(s => {
                const marks = new Map();
                let attended = 0;
                lessons.forEach(l => {
                    const m = l.attendance.find(a => a.studentId === s.id);
                    if (m) marks.set(l.id, m);
                    if (m?.present) attended++;
                });
                const percent = lessons.length > 0 ? Math.round((attended / lessons.length) * 100) : 0;
                const attendancePoints = educationAttendanceToPoints(percent);
                const activityPoints = db.getMarifatActivityScore(s.id, academicYear)?.points ?? null;
                return {
                    student: s, marks, attended, percent, attendancePoints, activityPoints,
                    total: attendancePoints + (activityPoints || 0),
                };
            });

        return { lessons, rows, unmarkedLessons };
    }, [tab, journalFaculty, journalCourse, students, academicYear, version]);

    const exportJournal = () => {
        if (!journal) return;
        // Excelda belgi emas, SO'Z yoziladi: "✓" hujjatda o'qilmaydi va
        // rasmiy hisobotga tushmaydi.
        const sheet = journal.rows.map(r => {
            const row = { 'Talaba': r.student.fullName };
            journal.lessons.forEach((l, i) => {
                const m = r.marks.get(l.id);
                row[`${i + 1}. ${new Date(l.date).toLocaleDateString('uz-UZ')}`] =
                    m?.active ? 'faol' : m?.present ? 'qatnashdi' : 'kelmadi';
            });
            row['Qatnashgan'] = r.attended;
            row['Jami dars'] = journal.lessons.length;
            row['Foiz'] = r.percent;
            row['Davomat bali'] = r.attendancePoints;
            row['Faollik bali'] = r.activityPoints ?? '';
            row['Jami ball'] = r.total;
            return row;
        });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), 'Jurnal');
        XLSX.writeFile(wb, `Marifat-jurnal-${journalFaculty}-${journalCourse}kurs-${academicYear}.xlsx`);
    };

    // --- Faollik bali ---
    const [scoreSearch, setScoreSearch] = useState('');
    const [scoreDraft, setScoreDraft] = useState({});

    // Faollik bali kiritish uchun - darsda qatnashgan talabalar.
    const scoreRows = useMemo(() => {
        if (tab !== 'faollik') return [];
        const q = scoreSearch.trim().toLowerCase();
        const attended = new Set((db.getMarifatLessons(academicYear) || [])
            .flatMap(l => db.getMarifatAttendance(l.id))
            .filter(a => a.present)
            .map(a => a.studentId));
        return students
            .filter(s => attended.has(s.id))
            .filter(s => !q || s.fullName?.toLowerCase().includes(q))
            .map(s => {
                const stats = db.getStudentMarifatActivity(s.id, academicYear);
                const manual = db.getMarifatActivityScore(s.id, academicYear);
                return {
                    student: s, stats, manual,
                    proposed: MARIFAT.proposedActivityPoints(stats.active, stats.attended),
                };
            })
            .sort((a, b) => (b.stats.active - a.stats.active) || (b.stats.attended - a.stats.attended));
    }, [tab, students, academicYear, scoreSearch, version]);

    return (
        <div className="space-y-6 font-sans">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
                        <Lightbulb className="w-7 h-7 text-orange-500" />
                        Ma'rifat darslari
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Ijtimoiy faollik indeksining 7-mezoni · davomat {criterion.maxPoints - criterion.activityPoints} ball
                        + faollik {criterion.activityPoints} ball
                    </p>
                </div>
                <div className="flex flex-wrap bg-slate-100 p-1.5 rounded-xl gap-1 self-start md:self-auto">
                    {[
                        { id: 'darslar', label: 'Darslar' },
                        { id: 'jurnal', label: 'Jurnal' },
                        { id: 'faollik', label: 'Faollik bali' },
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

            {/* SQL ishga tushirilmagan bo'lsa - ochiq aytiladi. Jimgina
                brauzerga yozib qo'yish "saqlandi" degan yolg'on beradi. */}
            {!db.isMarifatBackendReady() && (
                <p className="flex items-start gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <AlertTriangle size={14} className="shrink-0 mt-px" />
                    Modul jadvallari topilmadi. Supabase SQL Editor da{' '}
                    <code className="font-mono">supabase/marifat_lessons.sql</code> ni bir marta
                    ishga tushiring — undan keyin darslar va davomat saqlanadi.
                </p>
            )}

            {error && (
                <p className="flex items-start gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <AlertTriangle size={14} className="shrink-0 mt-px" /> {error}
                </p>
            )}
            {message && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                    <CheckCircle2 size={14} /> {message}
                </p>
            )}

            {/* Umumiy holat - reja bajarilyaptimi. Bu savol tabga bog'liq
                emas, shuning uchun har uchala tabda ko'rinadi. Dars ochilganda
                yashiriladi: u yerda diqqat bitta darsda. */}
            {!openLesson && <MarifatStatsStrip academicYear={academicYear} version={version} />}

            {/* ================= DARSLAR ================= */}
            {tab === 'darslar' && !openLesson && (
                <>
                    <div className="flex justify-between items-center gap-3 flex-wrap">
                        <p className="text-sm text-gray-500">
                            {academicYear} o'quv yilida {lessons.length} ta dars
                        </p>
                        <Button variant="primary" icon={Plus} onClick={() => openForm()}>
                            Dars qo'shish
                        </Button>
                    </div>

                    {lessons.length === 0 ? (
                        <Card>
                            <p className="p-10 text-center text-sm text-gray-400">
                                Hali dars kiritilmagan. Dars qo'shing va auditoriyasini belgilang —
                                davomat foizi aynan shu auditoriya doirasida hisoblanadi.
                            </p>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {lessons.map(l => {
                                const att = db.getMarifatAttendance(l.id);
                                const present = att.filter(a => a.present).length;
                                return (
                                    <Card key={l.id}>
                                        <div className="p-5">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <h3 className="font-bold text-gray-900">{l.title}</h3>
                                                    {l.topic && <p className="text-xs text-gray-500 mt-0.5">{l.topic}</p>}
                                                    <p className="text-xs text-gray-500 mt-1.5">
                                                        {new Date(l.date).toLocaleDateString('uz-UZ')}
                                                        {l.venue ? ` · ${l.venue}` : ''}
                                                    </p>
                                                </div>
                                                {l.locked
                                                    ? <Badge variant="success" size="sm">Qulflangan</Badge>
                                                    : <Badge variant="default" size="sm">Ochiq</Badge>}
                                            </div>

                                            {/* AUDITORIYA - eng muhim maydon: foizning maxraji shu. */}
                                            <p className="mt-3 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5 inline-block">
                                                {l.faculty}, {l.course}-kurs
                                            </p>

                                            <p className="text-xs text-gray-500 mt-3">
                                                {att.length === 0
                                                    ? 'Davomat belgilanmagan'
                                                    : `${present} ta talaba qatnashgan`}
                                            </p>

                                            <div className="flex gap-2 mt-3 flex-wrap">
                                                <Button
                                                    variant="outline" size="sm" icon={Users}
                                                    onClick={() => { setOpenLessonId(l.id); setMarks({}); }}
                                                >
                                                    Davomat
                                                </Button>
                                                {!l.locked && (
                                                    <>
                                                        <Button variant="ghost" size="sm" onClick={() => openForm(l)}>
                                                            Tahrirlash
                                                        </Button>
                                                        <button
                                                            type="button" disabled={busy}
                                                            onClick={() => run(() => db.deleteMarifatLesson(l.id), "Dars o'chirildi.")}
                                                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                                                            title="O'chirish"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* ================= DAVOMAT ================= */}
            {tab === 'darslar' && openLesson && (
                <Card padding={false}>
                    <div className="p-5 border-b border-gray-100">
                        <button
                            type="button"
                            onClick={closeLesson}
                            className="text-xs font-bold text-indigo-600 flex items-center gap-1 mb-3"
                        >
                            <ChevronLeft size={14} /> Darslar ro'yxatiga
                        </button>
                        <h3 className="font-bold text-gray-900">{openLesson.title}</h3>
                        <p className="text-xs text-gray-500 mt-1">
                            {openLesson.faculty}, {openLesson.course}-kurs ·{' '}
                            {new Date(openLesson.date).toLocaleDateString('uz-UZ')}
                        </p>

                        <div className="flex items-center gap-3 mt-3 flex-wrap">
                            <span className="text-xs text-gray-600">
                                Ro'yxatda: <b>{roster.length}</b> talaba
                            </span>
                            <span className="text-xs text-gray-600">
                                Qatnashgan: <b>{presentCount}</b>
                            </span>
                            <span className="text-xs text-rose-700">
                                Kelmagan: <b>{roster.length - presentCount}</b>
                            </span>
                            <span className="text-xs text-amber-700">
                                Faol: <b>{activeCount}</b>
                            </span>
                            {/* "Belgilanmagan" ATAYLAB alohida ko'rsatiladi: u "kelmagan"
                                bilan bir xil emas. Kelmagani - qaror, belgilanmagani -
                                e'tibordan chetda qolgan talaba. */}
                            {unmarkedCount > 0 && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                                    Belgilanmagan: {unmarkedCount}
                                </span>
                            )}
                            {isDirty && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold">
                                    Saqlanmagan
                                </span>
                            )}
                            {/* Ro'yxatni bir bosishda to'ldirish - 100+ talabani
                                birma-bir belgilash real ishda bajarilmaydi. */}
                            {!openLesson.locked && (
                                <div className="flex gap-1.5 ml-auto">
                                    <button
                                        type="button"
                                        onClick={() => setMarks(Object.fromEntries(
                                            roster.map(s => [s.id, { ...markOf(s.id), present: true }])
                                        ))}
                                        className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100"
                                    >
                                        Hammasi qatnashdi
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMarks(Object.fromEntries(
                                            roster.map(s => [s.id, { present: false, active: false }])
                                        ))}
                                        className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 text-[11px] font-bold hover:bg-gray-200"
                                    >
                                        Tozalash
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* FAOL belgisi - faollik balining yagona manbai. */}
                        <p className="text-[11px] text-gray-400 mt-2">
                            «Faol» belgisi darsda faol qatnashgan talabani bildiradi. Yillik faollik bali
                            shu belgilar asosida taklif etiladi — yakuniy ballni vakolatli shaxs qo'yadi.
                        </p>
                    </div>

                    <div className="p-4 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="relative sm:max-w-sm flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text" value={rosterSearch} onChange={e => setRosterSearch(e.target.value)}
                                placeholder="Talaba qidirish..."
                                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                        {/* Belgilashni TEKSHIRIB CHIQISH uchun. "Hammasi qatnashdi" bosilgandan
                            keyin kim qolib ketganini ko'rishning yo'li yo'q edi. */}
                        <div className="flex gap-1.5 flex-wrap">
                            {[
                                ['all', `Hammasi (${fullRoster.length})`],
                                ['unmarked', `Belgilanmagan (${unmarkedCount})`],
                                ['absent', `Kelmaganlar (${fullRoster.length - presentCount})`],
                            ].map(([id, label]) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setRosterFilter(id)}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                                        rosterFilter === id
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {roster.length === 0 ? (
                        <p className="p-8 text-center text-sm text-gray-400">
                            Bu auditoriyada talaba topilmadi.
                        </p>
                    ) : (
                        <div className="divide-y divide-gray-50 max-h-[28rem] overflow-y-auto">
                            {roster.map(s => {
                                const m = markOf(s.id);
                                const unmarked = isUnmarked(s.id);
                                return (
                                    <div
                                        key={s.id}
                                        className={`flex items-center gap-3 px-5 py-1 ${unmarked ? 'bg-amber-50/60' : ''}`}
                                    >
                                        {/* BUTUN QATOR bosiladi. Auditoriyada telefon bilan kichkina
                                            katakchani nishonga olish qiyin - eng ko'p takrorlanadigan
                                            harakat eng katta nishon bo'lishi kerak. */}
                                        <button
                                            type="button"
                                            disabled={openLesson.locked}
                                            onClick={() => togglePresent(s.id)}
                                            className={`flex-1 min-w-0 flex items-center gap-3 text-left py-2.5 rounded-lg
                                                ${openLesson.locked ? 'cursor-default' : 'hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500'}`}
                                        >
                                            <input
                                                type="checkbox" className="rounded accent-indigo-600 pointer-events-none shrink-0"
                                                readOnly
                                                disabled={openLesson.locked}
                                                checked={m.present}
                                            />
                                            <span className="min-w-0 text-sm text-gray-800 truncate">
                                                {s.fullName}
                                            </span>
                                            {unmarked && (
                                                <span className="ml-auto shrink-0 text-[10px] font-bold text-amber-700">
                                                    belgilanmagan
                                                </span>
                                            )}
                                        </button>
                                        <label className={`flex items-center gap-1.5 text-xs cursor-pointer ${m.present ? 'text-amber-700' : 'text-gray-300'}`}>
                                            <input
                                                type="checkbox" className="rounded accent-amber-500"
                                                disabled={openLesson.locked || !m.present}
                                                checked={m.active}
                                                onChange={e => setMark(s.id, { active: e.target.checked })}
                                            />
                                            <Star size={12} /> Faol
                                        </label>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="p-4 border-t border-gray-100 flex gap-2 flex-wrap">
                        {!openLesson.locked && (
                            <Button variant="primary" size="sm" icon={Save} disabled={busy} onClick={saveAttendance}>
                                Davomatni saqlash
                            </Button>
                        )}
                        <Button
                            variant="outline" size="sm"
                            icon={openLesson.locked ? Unlock : Lock}
                            disabled={busy}
                            onClick={() => run(
                                () => db.lockMarifatLesson(openLesson.id, !openLesson.locked),
                                openLesson.locked ? 'Qulf ochildi.' : 'Davomat qulflandi.'
                            )}
                        >
                            {openLesson.locked ? 'Qulfni ochish' : 'Qulflash'}
                        </Button>
                    </div>
                </Card>
            )}

            {/* ================= JURNAL =================
                Yil yakunidagi asosiy hujjat. Ball bo'yicha bahs chiqsa javob
                shu yerda: kim qaysi darsda bo'lgan, foizi qancha, ball qanday
                chiqqan. Auditoriya kesimida - chunki maxraj ham shunday. */}
            {tab === 'jurnal' && (
                <>
                    <Card>
                        <div className="p-5 space-y-3">
                            <h3 className="font-bold text-gray-900">Davomat jurnali</h3>
                            <p className="text-xs text-gray-500">
                                Auditoriyani tanlang — jurnal aynan shu doirada tuziladi,
                                chunki davomat foizi ham shu doirada hisoblanadi.
                            </p>
                            <div className="flex gap-3 flex-wrap">
                                <select
                                    value={journalFaculty} onChange={e => setJournalFaculty(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                                >
                                    <option value="">Fakultet tanlang...</option>
                                    {faculties.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                                <select
                                    value={journalCourse} onChange={e => setJournalCourse(e.target.value)}
                                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                                >
                                    <option value="">Kurs tanlang...</option>
                                    {[1, 2, 3, 4].map(c => <option key={c} value={String(c)}>{c}-kurs</option>)}
                                </select>
                                {journal && journal.lessons.length > 0 && (
                                    <Button variant="outline" size="sm" icon={Download} onClick={exportJournal}>
                                        Excel
                                    </Button>
                                )}
                            </div>
                        </div>
                    </Card>

                    {journal && (
                        journal.lessons.length === 0 ? (
                            <Card>
                                <p className="p-10 text-center text-sm text-gray-400">
                                    Bu auditoriya uchun davomati belgilangan dars yo'q.
                                </p>
                            </Card>
                        ) : (
                            <Card padding={false}>
                                <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                                    <p className="text-sm font-bold text-gray-800">
                                        {journalFaculty}, {journalCourse}-kurs
                                        <span className="font-normal text-gray-500">
                                            {' '}· {journal.lessons.length} ta dars · {journal.rows.length} ta talaba
                                        </span>
                                    </p>
                                    <p className="text-[11px] text-gray-400">
                                        ✓ qatnashgan · <span className="text-amber-600">★</span> faol · — kelmagan
                                    </p>
                                </div>

                                {journal.unmarkedLessons.length > 0 && (
                                    <div className="mx-4 mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                                        <p className="text-xs font-bold text-amber-800">
                                            {journal.unmarkedLessons.length} ta darsning davomati belgilanmagan
                                        </p>
                                        <p className="text-[11px] text-amber-700 mt-0.5">
                                            Ular jadvalga ham, foiz hisobiga ham kirmaydi. Belgilangunicha
                                            talabalarning foizi shu darslarsiz hisoblanadi.
                                        </p>
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {journal.unmarkedLessons.map(l => (
                                                <button
                                                    key={l.id}
                                                    type="button"
                                                    onClick={() => { setTab('darslar'); setOpenLessonId(l.id); setMarks({}); }}
                                                    className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
                                                >
                                                    {new Date(l.date).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' })} · {l.title}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Keng jadval - o'z ichida gorizontal suriladi.
                                    Talaba ustuni yopishqoq: 12 ta dars bo'lsa ham
                                    kimning qatori ekani yo'qolmasin. */}
                                <div className="overflow-x-auto">
                                    <table className="text-xs border-collapse">
                                        <thead>
                                            <tr className="bg-gray-50 border-b border-gray-100">
                                                <th className="sticky left-0 z-10 bg-gray-50 text-left px-4 py-3 font-bold text-gray-500 uppercase text-[10px] min-w-[13rem]">
                                                    Talaba
                                                </th>
                                                {journal.lessons.map((l, i) => (
                                                    <th
                                                        key={l.id}
                                                        title={l.title}
                                                        className="px-2 py-3 font-bold text-gray-500 text-[10px] whitespace-nowrap"
                                                    >
                                                        {i + 1}
                                                        <span className="block font-normal text-[9px] text-gray-400">
                                                            {new Date(l.date).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' })}
                                                        </span>
                                                    </th>
                                                ))}
                                                <th className="px-3 py-3 font-bold text-gray-500 uppercase text-[10px] whitespace-nowrap border-l border-gray-200">Qatnashgan</th>
                                                <th className="px-3 py-3 font-bold text-gray-500 uppercase text-[10px]">Foiz</th>
                                                <th className="px-3 py-3 font-bold text-gray-500 uppercase text-[10px]">Davomat</th>
                                                <th className="px-3 py-3 font-bold text-gray-500 uppercase text-[10px]">Faollik</th>
                                                <th className="px-3 py-3 font-bold text-indigo-600 uppercase text-[10px]">Jami</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {journal.rows.map(r => (
                                                <tr key={r.student.id} className="hover:bg-gray-50/50">
                                                    <td className="sticky left-0 z-10 bg-white px-4 py-2 font-medium text-gray-800 whitespace-nowrap">
                                                        {r.student.fullName}
                                                    </td>
                                                    {journal.lessons.map(l => {
                                                        const m = r.marks.get(l.id);
                                                        return (
                                                            <td key={l.id} className="px-2 py-2 text-center">
                                                                {m?.active
                                                                    ? <span className="text-amber-500 font-bold">★</span>
                                                                    : m?.present
                                                                        ? <span className="text-emerald-600 font-bold">✓</span>
                                                                        : <span className="text-gray-300">—</span>}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-3 py-2 text-center tabular-nums border-l border-gray-100">
                                                        {r.attended} / {journal.lessons.length}
                                                    </td>
                                                    <td className="px-3 py-2 text-center tabular-nums font-semibold">{r.percent}%</td>
                                                    <td className="px-3 py-2 text-center tabular-nums">{r.attendancePoints}</td>
                                                    <td className="px-3 py-2 text-center tabular-nums">
                                                        {r.activityPoints != null
                                                            ? r.activityPoints
                                                            : <span className="text-gray-300" title="Faollik bali kiritilmagan">—</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-center tabular-nums font-extrabold text-indigo-700">
                                                        {r.total}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="p-4 border-t border-gray-100">
                                    {/* Faollik bali kiritilmagan bo'lsa "Jami" hali
                                        yakuniy emas - buni aytib qo'yish kerak. */}
                                    <p className="text-[11px] text-gray-400">
                                        «Jami» — davomat bali (6 ballgacha) va faollik bali (4 ballgacha) yig'indisi.
                                        Faollik bali kiritilmagan talabalarda u hali yakuniy emas.
                                    </p>
                                </div>
                            </Card>
                        )
                    )}
                </>
            )}

            {/* ================= FAOLLIK BALI ================= */}
            {tab === 'faollik' && (
                <>
                    <Card>
                        <div className="p-5 space-y-2">
                            <h3 className="font-bold text-gray-900">Faollik bali</h3>
                            {/* Metodikadagi teshikni ochiq aytamiz. */}
                            <p className="text-xs text-gray-600 leading-relaxed">
                                Metodikada faollik bali uchun <b>{criterion.activityPoints} ball</b> ajratilgan,
                                lekin uning qanday o'lchanishi va kim qo'yishi <b>ko'rsatilmagan</b>.
                                Shuning uchun ballni <b>vakolatli shaxs</b> qo'yadi — tizim faqat taklif beradi:
                                talabaning qatnashgan darslaridan nechtasida «faol» deb belgilangani nisbatidan.
                            </p>
                            <div className="relative max-w-sm pt-1">
                                <Search className="absolute left-3 top-1/2 translate-y-0 text-gray-400" size={16} />
                                <input
                                    type="text" value={scoreSearch} onChange={e => setScoreSearch(e.target.value)}
                                    placeholder="Talaba qidirish..."
                                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm"
                                />
                            </div>
                        </div>
                    </Card>

                    <Card padding={false}>
                        {scoreRows.length === 0 ? (
                            <p className="p-10 text-center text-sm text-gray-400">
                                Hali hech kimning davomati belgilanmagan.
                            </p>
                        ) : (
                            <div className="divide-y divide-gray-50">
                                {scoreRows.map(({ student, stats, manual, proposed }) => {
                                    const draft = scoreDraft[student.id];
                                    const value = draft !== undefined ? draft : (manual?.points ?? '');
                                    return (
                                        <div key={student.id} className="flex items-center gap-3 px-5 py-3 flex-wrap">
                                            <div className="flex-1 min-w-[12rem]">
                                                <p className="text-sm font-semibold text-gray-900">{student.fullName}</p>
                                                <p className="text-[11px] text-gray-500">
                                                    {stats.audience} · {stats.held} darsdan {stats.attended} tasida qatnashgan
                                                    {' · '}
                                                    <span className="text-amber-700 font-semibold">{stats.active} tasida faol</span>
                                                    {stats.percent != null && (
                                                        <> · davomat {stats.percent}% → {educationAttendanceToPoints(stats.percent)} ball</>
                                                    )}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[11px] text-gray-400">Taklif</p>
                                                <p className="text-sm font-bold text-indigo-600 tabular-nums">
                                                    {proposed ?? '—'}
                                                </p>
                                            </div>
                                            <input
                                                type="number" min={0} max={criterion.activityPoints} step={0.5}
                                                value={value}
                                                onChange={e => setScoreDraft(d => ({ ...d, [student.id]: e.target.value }))}
                                                placeholder={proposed != null ? String(proposed) : '0'}
                                                className="w-20 px-2 py-1.5 border border-gray-200 rounded-xl text-sm text-center"
                                            />
                                            <Button
                                                variant="outline" size="sm" disabled={busy}
                                                onClick={() => run(async () => {
                                                    await db.setMarifatActivityScore({
                                                        studentId: student.id,
                                                        points: value === '' ? proposed : value,
                                                        by: user?.username, academicYear,
                                                    });
                                                    setScoreDraft(d => ({ ...d, [student.id]: undefined }));
                                                }, 'Faollik bali saqlandi.')}
                                            >
                                                Saqlash
                                            </Button>
                                            {manual && (
                                                <Badge variant="success" size="sm">
                                                    {manual.points} ball · {manual.assessedBy}
                                                </Badge>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>
                </>
            )}

            {/* Dars formasi */}
            <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={form.id ? 'Darsni tahrirlash' : "Ma'rifat darsi qo'shish"}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Dars nomi *</label>
                        <input
                            type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="Masalan: Ma'naviy meros va yoshlar tarbiyasi"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Mavzu</label>
                        <textarea
                            rows={2} value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                        />
                    </div>

                    {/* AUDITORIYA majburiy: davomat foizining maxraji shundan chiqadi. */}
                    <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl space-y-3">
                        <p className="text-[11px] font-bold text-gray-700">
                            Auditoriya — dars kimlar uchun o'tkaziladi
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <select
                                value={form.faculty} onChange={e => setForm(f => ({ ...f, faculty: e.target.value }))}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                            >
                                <option value="">Fakultet...</option>
                                {faculties.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                            <select
                                value={form.course} onChange={e => setForm(f => ({ ...f, course: e.target.value }))}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                            >
                                <option value="">Kurs...</option>
                                {[1, 2, 3, 4].map(c => <option key={c} value={String(c)}>{c}-kurs</option>)}
                            </select>
                        </div>
                        <p className="text-[11px] text-gray-500">
                            Davomat foizi aynan shu doirada hisoblanadi: talaba o'z fakulteti va kursi uchun
                            o'tkazilgan darslarning nechtasiga qatnashgani. Boshqa kursning darsiga
                            bormagani uchun ball yo'qotmaydi.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Sana *</label>
                            <input
                                type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Joy</label>
                            <input
                                type="text" value={form.venue} onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
                                placeholder="Masalan: 305-xona"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                    </div>

                    {error && (
                        <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            {error}
                        </p>
                    )}

                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
                            Bekor qilish
                        </Button>
                        <Button variant="primary" className="flex-1" disabled={busy} onClick={saveLesson}>
                            Saqlash
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default MarifatLessonsPage;
