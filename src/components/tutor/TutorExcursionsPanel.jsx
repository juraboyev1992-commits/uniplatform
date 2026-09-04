import React, { useMemo, useState } from 'react';
import {
    Compass, Plus, Users, ChevronLeft, AlertTriangle, CheckCircle2, Info, Trash2,
} from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Modal from '../common/Modal';
import ActivityAttendancePanel from '../common/ActivityAttendancePanel';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';

// TYUTORNING EKSKURSIYALARI (9-mezonning ikkinchi manbai).
//
// Tyutor o'zi yaratadi - administratorga murojaat qilmaydi. Cheklovlar:
//   1. Faqat EKSKURSIYA turi. Hashar, bayram, konferensiya universitet
//      miqyosida bo'ladi va administratorda qoladi.
//   2. Auditoriya - faqat o'ziga biriktirilgan talabalar.
//
// Nazorat OSHKORALIK orqali: tadbir umumiy kalendarda ko'rinadi, xona
// bandligiga tushadi, yaratuvchisi qayd etiladi. Ruxsat so'rash orqali
// nazorat qilinsa, tyutorning ishi boshqa odamda tiqilib qolardi.
const TutorExcursionsPanel = ({ students }) => {
    const { user } = useAuth();
    const [version, setVersion] = useState(0);
    const [openId, setOpenId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    // Faqat O'ZI yaratgan ekskursiyalar.
    const excursions = useMemo(
        () => db.getEvents()
            .filter(e => e.eventType === 'excursion' && e.createdBy === user?.username)
            .sort((a, b) => new Date(b.date) - new Date(a.date)),
        [user?.username, version]
    );

    const open = excursions.find(e => e.id === openId) || null;

    const roster = useMemo(
        // ActivityAttendancePanel qatorlarni `{participantId, teamId, student}`
        // shaklida kutadi - ism `student.fullName` dan o'qiladi.
        () => students.map(s => ({
            participantId: s.id,
            teamId: null,
            student: s,
        })),
        [students]
    );

    const existingAttendance = useMemo(
        () => (open ? db.getActivityAttendance(open.id, 'event', 'event', open.id) : []),
        [open, version]
    );

    const run = async (fn, ok = '') => {
        setBusy(true); setError(''); setMessage('');
        try { await fn(); setVersion(v => v + 1); if (ok) setMessage(ok); }
        catch (e) { setError(e?.message || 'Xatolik yuz berdi.'); }
        finally { setBusy(false); }
    };

    const [form, setForm] = useState({ title: '', description: '', date: '', endTime: '', location: '' });

    const create = () => run(async () => {
        await db.createEvent({
            title: form.title,
            description: form.description,
            date: form.date,
            endTime: form.endTime || null,
            location: form.location,
            locationType: 'offline',
            status: 'upcoming',
            registrationRequired: false,
            // Tur QATTIQ belgilangan - tyutor boshqa turdagi tadbir yarata olmaydi.
            eventType: 'excursion',
            level: 'faculty',
            actingRole: user?.role,
            actingUsername: user?.username,
        });
        setShowForm(false);
        setForm({ title: '', description: '', date: '', endTime: '', location: '' });
    }, 'Ekskursiya yaratildi.');

    return (
        <div className="space-y-4">
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

            {!open ? (
                <>
                    <Card>
                        <div className="p-5 space-y-3">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div>
                                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                        <Compass size={17} className="text-teal-600" /> Ekskursiyalar
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Uyushtirilgan tashrif 9-mezonga davomat orqali tushadi
                                    </p>
                                </div>
                                <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowForm(true)}>
                                    Ekskursiya yaratish
                                </Button>
                            </div>

                            {/* Cheklovlar va oshkoralik ochiq aytiladi. */}
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                <p className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                                    <Info size={12} /> Nima yarata olasiz
                                </p>
                                <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
                                    Faqat <b>ekskursiya</b> va faqat <b>o'z talabalaringiz</b> uchun.
                                    Hashar, bayram va universitet miqyosidagi tadbirlarni administrator
                                    yaratadi. Yaratgan ekskursiyangiz umumiy kalendarda ko'rinadi,
                                    xona bandligiga tushadi va sizning ismingiz bilan qayd etiladi.
                                </p>
                            </div>
                        </div>
                    </Card>

                    {excursions.length === 0 ? (
                        <Card>
                            <p className="p-10 text-center text-sm text-gray-400">
                                Hali ekskursiya yaratmagansiz.
                            </p>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {excursions.map(e => {
                                const att = db.getActivityAttendance(e.id, 'event', 'event', e.id);
                                const present = att.filter(a => a.status === 'present').length;
                                return (
                                    <Card key={e.id}>
                                        <div className="p-5">
                                            <h4 className="font-bold text-gray-900">{e.title}</h4>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {new Date(e.date).toLocaleDateString('uz-UZ')}
                                                {e.location ? ` · ${e.location}` : ''}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-2">
                                                {att.length === 0
                                                    ? 'Davomat belgilanmagan'
                                                    : `${present} ta talaba qatnashgan`}
                                            </p>
                                            <div className="flex gap-2 mt-3">
                                                <Button
                                                    variant="outline" size="sm" icon={Users}
                                                    onClick={() => setOpenId(e.id)}
                                                >
                                                    Davomat
                                                </Button>
                                                {att.length === 0 && (
                                                    <button
                                                        type="button" disabled={busy}
                                                        onClick={() => run(() => db.deleteEvent(e.id), "Ekskursiya o'chirildi.")}
                                                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                                                        title="O'chirish"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </>
            ) : (
                <Card>
                    <div className="p-5 space-y-4">
                        <button
                            type="button"
                            onClick={() => setOpenId(null)}
                            className="text-xs font-bold text-indigo-600 flex items-center gap-1"
                        >
                            <ChevronLeft size={14} /> Ekskursiyalarga
                        </button>
                        <div>
                            <h3 className="font-bold text-gray-900">{open.title}</h3>
                            <p className="text-xs text-gray-500 mt-1">
                                {new Date(open.date).toLocaleDateString('uz-UZ')}
                                {open.location ? ` · ${open.location}` : ''}
                            </p>
                        </div>

                        {/* Davomat belgilanishi bilan 9-mezonga tushadi - buni
                            belgilayotgan odam bilishi kerak. */}
                        <p className="text-[11px] text-teal-800 bg-teal-50 border border-teal-100 rounded-xl px-3 py-2">
                            Qatnashgan deb belgilangan talabaning bu tashrifi <b>9-mezonga</b>
                            {' '}avtomatik tushadi — ular alohida fotosurat yuklamaydi.
                        </p>

                        <ActivityAttendancePanel
                            roster={roster}
                            existingAttendance={existingAttendance}
                            locked={false}
                            canManage
                            onSave={async (entries, reason) => {
                                await db.setActivityAttendanceBulk(
                                    open.id, 'event', 'event', open.id,
                                    entries, user?.username, reason
                                );
                                setVersion(v => v + 1);
                            }}
                        />
                    </div>
                </Card>
            )}

            {/* Yaratish formasi */}
            <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Ekskursiya yaratish">
                <div className="space-y-4">
                    {/* Tur o'zgarmas - shuni ko'rsatib qo'yamiz. */}
                    <div className="flex items-center justify-between gap-3 p-3 bg-teal-50 border border-teal-100 rounded-xl">
                        <span className="text-xs text-gray-700">Tadbir turi</span>
                        <Badge variant="success" size="sm">Ekskursiya</Badge>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Nomi *</label>
                        <input
                            type="text" value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="Masalan: Amir Temur muzeyiga tashrif"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Sana va vaqt *</label>
                            <input
                                type="datetime-local" value={form.date}
                                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Tugash vaqti</label>
                            <input
                                type="time" value={form.endTime}
                                onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Joy *</label>
                        <input
                            type="text" value={form.location}
                            onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                            placeholder="Masalan: Amir Temur muzeyi"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Tavsif</label>
                        <textarea
                            rows={2} value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                        />
                    </div>

                    <p className="text-[11px] text-gray-400">
                        Auditoriya — sizga biriktirilgan {students.length} ta talaba. Davomat
                        ro'yxati aynan shulardan tuziladi.
                    </p>

                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
                            Bekor qilish
                        </Button>
                        <Button
                            variant="primary" className="flex-1"
                            disabled={busy || !form.title.trim() || !form.date || !form.location.trim()}
                            onClick={create}
                        >
                            Yaratish
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default TutorExcursionsPanel;
