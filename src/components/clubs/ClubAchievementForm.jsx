import React, { useMemo, useRef, useState } from 'react';
import { X, Upload, FileText, AlertTriangle, Info } from 'lucide-react';
import Button from '../common/Button';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import {
    ACHIEVEMENT_SCOPES, ACHIEVEMENT_SCOPE_ORDER,
    ACHIEVEMENT_LEVELS, ACHIEVEMENT_LEVEL_ORDER,
    ACHIEVEMENT_PLACES, ACHIEVEMENT_PLACE_ORDER,
    validateExternalAchievement,
} from '../../config/clubAchievements';
import { TOURNAMENT_FILE_UPLOAD } from '../../constants';

// TASHQI YUTUQNI KIRITISH.
//
// Faqat TASHQI yutuqlar shu yerdan kiritiladi. Platformadagi musobaqalar
// bo'yicha yutuq berilgan diplomdan o'zi chiqadi va uni qo'lda kiritish
// ikki xil haqiqat yaratardi - shuning uchun bu forma ochilganda buni
// darrov aytadi.
//
// DALIL MAJBURIY. Boshqa yuklashlardan farqli o'laroq bu yerda faylning
// O'ZI saqlanadi (yopiq omborga), chunki tasdiqlovchi uni ochib ko'rishi
// kerak - fayl nomi hech narsani isbotlamaydi.
const ClubAchievementForm = ({ club, onClose, onSaved }) => {
    const { user } = useAuth();
    const fileRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [file, setFile] = useState(null);

    const [form, setForm] = useState({
        scope: 'club',
        teamId: '',
        studentIds: [],
        title: '',
        organizer: '',
        level: 'republic',
        place: 1,
        date: new Date().toISOString().slice(0, 10),
        note: '',
    });
    const set = (patch) => setForm(f => ({ ...f, ...patch }));

    const teams = useMemo(() => db.getClubTeams(club.id), [club.id]);
    const members = useMemo(() => {
        const students = new Map(db.getMockStudents().map(s => [s.id, s]));
        return db.getClubMembers(club.id)
            .map(m => students.get(m.userId))
            .filter(Boolean);
    }, [club.id]);

    const [pickedStudents, setPickedStudents] = useState([]);
    const [memberQuery, setMemberQuery] = useState('');
    const memberResults = useMemo(() => {
        const q = memberQuery.trim().toLowerCase();
        if (!q) return [];
        const picked = new Set(pickedStudents.map(s => s.id));
        return members
            .filter(s => !picked.has(s.id))
            .filter(s => String(s.fullName || '').toLowerCase().includes(q)
                || String(s.studentId || '').toLowerCase().includes(q))
            .slice(0, 8);
    }, [members, memberQuery, pickedStudents]);

    const handleFile = (f) => {
        setError('');
        if (!f) return;
        const ext = '.' + f.name.split('.').pop().toLowerCase();
        if (!TOURNAMENT_FILE_UPLOAD.ALLOWED_EXTENSIONS.includes(ext)) {
            setError(`Ruxsat etilmagan format. Qabul qilinadi: ${TOURNAMENT_FILE_UPLOAD.ALLOWED_EXTENSIONS.join(', ')}`);
            return;
        }
        if (f.size > TOURNAMENT_FILE_UPLOAD.MAX_SIZE_MB * 1024 * 1024) {
            setError(`Fayl hajmi ${TOURNAMENT_FILE_UPLOAD.MAX_SIZE_MB} MB dan oshmasligi kerak.`);
            return;
        }
        setFile(f);
    };

    const handleSubmit = async () => {
        setError('');
        const payload = {
            ...form,
            studentIds: pickedStudents.map(s => s.id),
            evidenceFileName: file?.name || null,
        };
        // Tekshiruv db qatlamidagi bilan AYNAN bir xil funksiyadan -
        // ikki joyda ikki xil qoida bo'lib qolmasin.
        const problem = validateExternalAchievement(payload);
        if (problem) { setError(problem); return; }

        setBusy(true);
        try {
            await db.submitClubAchievement({
                clubId: club.id,
                scope: form.scope,
                teamId: form.teamId || null,
                studentIds: pickedStudents.map(s => s.id),
                title: form.title, organizer: form.organizer,
                level: form.level, place: Number(form.place), date: form.date,
                note: form.note,
                evidenceFile: file,
                submittedBy: user?.username || user?.id,
            });
            onSaved?.();
        } catch (e) {
            setError(e?.message || 'Saqlashda xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">
                <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                    <div>
                        <h3 className="font-black text-gray-900 dark:text-gray-100">Tashqi yutuq qo'shish</h3>
                        <p className="text-xs text-gray-400 mt-0.5">{club.name}</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                    <p className="flex items-start gap-2 text-[11px] text-gray-600 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-3 leading-relaxed">
                        <Info size={13} className="shrink-0 mt-px text-indigo-500" />
                        <span>
                            Bu forma faqat <b>universitetdan tashqarida</b> qozonilgan yutuqlar uchun.
                            Platformada o'tkazilgan musobaqalar bo'yicha yutuq berilgan diplomdan
                            <b> avtomatik</b> chiqadi — uni qo'lda kiritish nusxa yaratadi.
                        </span>
                    </p>

                    {/* KIMGA TEGISHLI */}
                    <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Yutuq kimga tegishli</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {ACHIEVEMENT_SCOPE_ORDER.map(key => {
                                const scope = ACHIEVEMENT_SCOPES[key];
                                const active = form.scope === key;
                                return (
                                    <button
                                        key={key} type="button"
                                        onClick={() => set({ scope: key })}
                                        className={`text-left px-3 py-2.5 rounded-xl border transition-colors ${
                                            active
                                                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                                        }`}
                                    >
                                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{scope.label}</p>
                                        <p className="text-[11px] text-gray-400 leading-snug">{scope.hint}</p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {form.scope === 'team' && (
                        <div>
                            <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Jamoa</label>
                            {teams.length === 0 ? (
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                                    Bu klubda jamoa yo'q. Avval jamoa yarating yoki yutuqni
                                    "Klubning yutug'i" sifatida kiriting.
                                </p>
                            ) : (
                                <select
                                    value={form.teamId}
                                    onChange={e => set({ teamId: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-xl text-sm"
                                >
                                    <option value="">Jamoani tanlang</option>
                                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            )}
                        </div>
                    )}

                    {form.scope === 'member' && (
                        <div>
                            <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">
                                Yutuqni qozongan a'zo(lar)
                            </label>
                            {/* Umumiy StudentPicker ishlatilmadi: u BITTA talaba
                                tanlaydi va butun bazadan qidiradi. Bu yerda esa
                                bir nechta va faqat KLUB A'ZOLARI kerak - yutuq
                                klubga aynan a'zolik orqali bog'lanadi. */}
                            {members.length === 0 ? (
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                                    Bu klubda a'zo yo'q.
                                </p>
                            ) : (
                                <>
                                    <input
                                        type="text" value={memberQuery}
                                        onChange={e => setMemberQuery(e.target.value)}
                                        placeholder="Klub a'zosini qidiring..."
                                        className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-xl text-sm"
                                    />
                                    {pickedStudents.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {pickedStudents.map(s => (
                                                <span key={s.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold">
                                                    {s.fullName}
                                                    <button
                                                        type="button"
                                                        onClick={() => setPickedStudents(p => p.filter(x => x.id !== s.id))}
                                                        className="text-indigo-400 hover:text-red-500"
                                                    >
                                                        <X size={11} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {memberResults.length > 0 && (
                                        <div className="mt-2 max-h-40 overflow-y-auto border border-gray-100 dark:border-gray-700 rounded-xl divide-y divide-gray-50 dark:divide-gray-700">
                                            {memberResults.map(s => (
                                                <button
                                                    key={s.id} type="button"
                                                    onClick={() => {
                                                        setPickedStudents(p => [...p, s]);
                                                        setMemberQuery('');
                                                    }}
                                                    className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                                                >
                                                    <p className="text-sm text-gray-900 dark:text-gray-100">{s.fullName}</p>
                                                    <p className="text-[11px] text-gray-400">
                                                        {s.faculty} · {s.course}-kurs
                                                    </p>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                            <p className="text-[11px] text-gray-400 mt-1">
                                Faqat klub a'zolari ko'rsatilgan — yutuq klubga aynan a'zolik
                                orqali bog'lanadi.
                            </p>
                        </div>
                    )}

                    {/* MUSOBAQA MA'LUMOTI */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Musobaqa yoki tanlov nomi</label>
                            <input
                                type="text" value={form.title}
                                onChange={e => set({ title: e.target.value })}
                                placeholder="Masalan: Respublika debat chempionati"
                                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-xl text-sm"
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Tashkilotchi</label>
                            <input
                                type="text" value={form.organizer}
                                onChange={e => set({ organizer: e.target.value })}
                                placeholder="Tanlovni o'tkazgan tashkilot nomi"
                                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-xl text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Daraja</label>
                            <select
                                value={form.level}
                                onChange={e => set({ level: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-xl text-sm"
                            >
                                {ACHIEVEMENT_LEVEL_ORDER.map(k => (
                                    <option key={k} value={k}>{ACHIEVEMENT_LEVELS[k].label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Natija</label>
                            <select
                                value={form.place}
                                onChange={e => set({ place: Number(e.target.value) })}
                                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-xl text-sm"
                            >
                                {ACHIEVEMENT_PLACE_ORDER.map(p => (
                                    <option key={p} value={p}>{ACHIEVEMENT_PLACES[p].label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Sana</label>
                            <input
                                type="date" value={form.date}
                                onChange={e => set({ date: e.target.value })}
                                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-xl text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">Izoh (ixtiyoriy)</label>
                            <input
                                type="text" value={form.note}
                                onChange={e => set({ note: e.target.value })}
                                placeholder="Qo'shimcha ma'lumot"
                                className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-xl text-sm"
                            />
                        </div>
                    </div>

                    {/* DALIL */}
                    <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1.5">
                            Diplom yoki tasdiqlovchi hujjat
                        </label>
                        <input
                            ref={fileRef} type="file" className="hidden"
                            accept={TOURNAMENT_FILE_UPLOAD.ALLOWED_EXTENSIONS.join(',')}
                            onChange={e => handleFile(e.target.files?.[0])}
                        />
                        {!file ? (
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                className="w-full flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl py-5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                                <Upload size={18} className="text-gray-400" />
                                <span className="text-xs font-semibold text-gray-500">Faylni tanlash uchun bosing</span>
                            </button>
                        ) : (
                            <div className="flex items-center gap-3 p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl">
                                <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                    <FileText size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{file.name}</p>
                                    <p className="text-[11px] text-gray-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                                </div>
                                <button type="button" onClick={() => setFile(null)} className="p-1 text-gray-400 hover:text-red-500 shrink-0">
                                    <X size={14} />
                                </button>
                            </div>
                        )}
                        <p className="text-[11px] text-gray-400 mt-1">
                            Hujjat yopiq omborda saqlanadi — uni faqat klub boshqaruvi va
                            tasdiqlovchi ocha oladi.
                        </p>
                    </div>

                    {error && (
                        <p className="flex items-start gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            <AlertTriangle size={13} className="shrink-0 mt-px" /> {error}
                        </p>
                    )}
                </div>

                <div className="p-5 border-t border-gray-100 dark:border-gray-800 flex gap-3">
                    <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={busy}>
                        Bekor qilish
                    </Button>
                    <Button type="button" variant="primary" className="flex-1" onClick={handleSubmit} disabled={busy}>
                        {busy ? 'Yuborilmoqda...' : 'Tasdiqlashga yuborish'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ClubAchievementForm;
