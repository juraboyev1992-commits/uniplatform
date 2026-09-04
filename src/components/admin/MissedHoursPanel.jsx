import React, { useMemo, useState } from 'react';
import { CalendarX, Save, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import StudentPicker from '../common/StudentPicker';
import { db, getCurrentAcademicYear } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { INDEX_CRITERIA, missedHoursToPoints } from '../../config/socialActivityIndex';

// QOLDIRILGAN DARS SOATI (6-mezon).
//
// DIQQAT: bu DARS davomati, TADBIR davomati EMAS. Platformadagi davomat
// (klub uchrashuvi, tadbir) 2-mezonga ishlaydi va bu yerga aloqasi yo'q.
// Dars davomati HEMIS tomonida - integratsiya ulanmagunicha uni tyutor
// kiritadi.
//
// TYUTOR BALL QO'YMAYDI: u faqat soatni kiritadi, ballni tizim jadval
// bo'yicha hisoblaydi.
const SEMESTERS = [1, 2];

// `scopeStudents` - null bo'lsa hamma talaba (administrator), massiv bo'lsa
// faqat o'sha talabalar orasidan tanlanadi (tyutor o'ziga biriktirilganlar).
const MissedHoursPanel = ({ scopeStudents = null }) => {
    const { user } = useAuth();
    const criterion = INDEX_CRITERIA.ATTENDANCE;
    const [version, setVersion] = useState(0);
    const [student, setStudent] = useState(null);
    const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear());
    const [hours, setHours] = useState({ 1: '', 2: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    // Tanlangan talabaning mavjud yozuvlari - qayta kiritishdan oldin
    // nima borligini ko'rsatish kerak.
    const existing = useMemo(
        () => (student ? db.getStudentMissedHours(student.id, academicYear) : []),
        [student, academicYear, version]
    );

    const existingBySemester = useMemo(
        () => new Map(existing.map(r => [r.semester, r])),
        [existing]
    );

    // Kiritilayotgan qiymat + allaqachon saqlangan qiymat birga hisoblanadi.
    const preview = useMemo(() => {
        const rows = SEMESTERS.map(s => {
            const typed = hours[s];
            const value = typed !== '' && typed != null
                ? Number(typed)
                : existingBySemester.get(s)?.hours;
            if (value == null || Number.isNaN(value)) return null;
            return { semester: s, hours: value, points: missedHoursToPoints(value) };
        }).filter(Boolean);
        if (rows.length === 0) return null;
        const avg = rows.reduce((sum, r) => sum + r.points, 0) / rows.length;
        return { rows, average: Math.round(avg * 10) / 10 };
    }, [hours, existingBySemester]);

    const save = async () => {
        setBusy(true); setError(''); setMessage('');
        try {
            const toWrite = SEMESTERS.filter(s => hours[s] !== '' && hours[s] != null);
            if (toWrite.length === 0) throw new Error('Kamida bitta semestr soatini kiriting');
            for (const s of toWrite) {
                await db.setMissedHours({
                    studentId: student.id, academicYear, semester: s,
                    hours: hours[s], source: 'manual', by: user?.username,
                });
            }
            setHours({ 1: '', 2: '' });
            setVersion(v => v + 1);
            setMessage('Saqlandi — ball avtomatik hisoblandi.');
        } catch (e) {
            setError(e?.message || 'Xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <div className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <CalendarX size={17} className="text-indigo-600" /> Qoldirilgan dars soati
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                            6-mezon · maksimal {criterion.maxPoints} ball
                        </p>
                    </div>
                    <Badge variant="default">Dars davomati</Badge>
                </div>

                {/* Ikki davomatni aralashtirmaslik - eng katta xavf shu. */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                    <p className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                        <Info size={12} /> Bu tadbir davomati emas
                    </p>
                    <p className="text-[11px] text-gray-600 leading-relaxed">
                        Platformadagi davomat (klub uchrashuvi, tadbir) <b>2-mezonga</b> ishlaydi.
                        Bu yerda esa <b>dars</b> davomati — u HEMIS tomonida va integratsiya
                        ulanmaguncha qo'lda kiritiladi. Ball tyutor tomonidan qo'yilmaydi:
                        siz soatni kiritasiz, ballni tizim jadval bo'yicha hisoblaydi.
                    </p>
                </div>

                {/* Metodikaning jadvali - kiritayotgan odam ko'rib tursin. */}
                <div className="flex flex-wrap gap-1.5">
                    {criterion.bands.map(b => (
                        <span key={b.label} className="text-[11px] px-2 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-600">
                            {b.label} → <b>{b.points} ball</b>
                        </span>
                    ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1.5">Talaba *</label>
                        {scopeStudents ? (
                            // Tyutorda erkin qidiruv yo'q: u faqat o'ziga
                            // biriktirilgan talabalarni ko'radi.
                            <select
                                value={student?.id || ''}
                                onChange={e => setStudent(scopeStudents.find(s => s.id === e.target.value) || null)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
                            >
                                <option value="">Tanlang...</option>
                                {scopeStudents.map(s => (
                                    <option key={s.id} value={s.id}>{s.fullName}</option>
                                ))}
                            </select>
                        ) : (
                            <StudentPicker value={student} onSelect={setStudent} />
                        )}
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1.5">O'quv yili</label>
                        <input
                            type="text" value={academicYear} onChange={e => setAcademicYear(e.target.value)}
                            placeholder="2026-2027"
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                        />
                    </div>
                </div>

                {student && (
                    <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {SEMESTERS.map(s => {
                                const saved = existingBySemester.get(s);
                                return (
                                    <div key={s}>
                                        <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1.5">
                                            {s}-semestr — qoldirilgan soat
                                        </label>
                                        <input
                                            type="number" min={0} step={1}
                                            value={hours[s]}
                                            onChange={e => setHours(h => ({ ...h, [s]: e.target.value }))}
                                            placeholder={saved ? String(saved.hours) : 'Kiritilmagan'}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                                        />
                                        {saved && (
                                            <p className="text-[11px] text-gray-400 mt-1">
                                                Saqlangan: {saved.hours} soat → {missedHoursToPoints(saved.hours)} ball
                                                {saved.by ? ` · ${saved.by}` : ''}
                                                {saved.source === 'hemis' ? ' · HEMIS' : ''}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* HISOB OCHIQ KO'RSATILADI: har semestr alohida, keyin
                            o'rtachasi. Metodikada semestrdan yillik ballga
                            o'tish qoidasi yo'q - bu universitet qarori. */}
                        {preview && (
                            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                                <p className="text-[11px] font-bold text-gray-600 mb-1.5">Hisob</p>
                                {preview.rows.map(r => (
                                    <p key={r.semester} className="text-[11px] text-gray-700">
                                        {r.semester}-semestr: {r.hours} soat → <b>{r.points} ball</b>
                                    </p>
                                ))}
                                <p className="text-sm font-extrabold text-indigo-700 mt-1.5">
                                    Yillik ball: {preview.average} / {criterion.maxPoints}
                                    {preview.rows.length < 2 && (
                                        <span className="block text-[11px] font-normal text-amber-700 mt-0.5">
                                            1 semestr ma'lumoti asosida — ikkinchisi kiritilsa o'zgaradi.
                                        </span>
                                    )}
                                </p>
                                <p className="text-[11px] text-gray-400 mt-1.5">
                                    Har semestr alohida baholanadi, so'ng ballarning o'rtachasi olinadi.
                                    Metodikada semestrdan yillik ballga o'tish qoidasi yo'q — bu universitet qarori.
                                </p>
                            </div>
                        )}

                        <Button
                            variant="primary" size="sm" icon={Save}
                            disabled={busy || (hours[1] === '' && hours[2] === '')}
                            onClick={save}
                        >
                            Saqlash
                        </Button>
                    </>
                )}

                {error && (
                    <p className="flex items-start gap-1.5 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                        <AlertTriangle size={12} className="shrink-0 mt-px" /> {error}
                    </p>
                )}
                {message && (
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                        <CheckCircle2 size={12} /> {message}
                    </p>
                )}
            </div>
        </Card>
    );
};

export default MissedHoursPanel;
