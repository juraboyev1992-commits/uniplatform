import React, { useMemo, useState } from 'react';
import { Building, Plus, AlertTriangle, CheckCircle2, Info, UserCog } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Modal from '../common/Modal';
import StudentPicker from '../common/StudentPicker';
import StatStrip from '../common/StatStrip';
import { getHousingStats } from '../../utils/moduleStats';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';

// YOTOQXONALAR VA TALABANING TURAR JOYI.
//
// Nima uchun kerak: 10-mezonning "toza-ozoda yurish" bandini yotoqxonada
// yashovchilar uchun MUDIR baholaydi, qolganlar uchun tyutor. Ya'ni turar joy
// ma'lumoti bo'lmasa baholovchini aniqlab bo'lmaydi.
//
// YANGI ROL OCHILMADI: mudir sifatida mavjud akkaunt biriktiriladi.
//
// ESLATMA: yashash joyi ma'lumoti KELAJAKDA tizimning talaba ma'lumotlari
// qatlamidan avtomatik keladi. Hozircha qo'lda kiritiladi.
const HOUSING_TYPES = [
    { key: 'dormitory', label: 'Yotoqxona' },
    { key: 'rent', label: 'Ijara' },
    { key: 'family', label: 'Oilasi bilan' },
];

const DormitoriesPanel = () => {
    const { user } = useAuth();
    const [version, setVersion] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [showDormForm, setShowDormForm] = useState(false);
    const [showHousingForm, setShowHousingForm] = useState(false);

    const dorms = useMemo(() => db.getDormitories(true), [version]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const stats = useMemo(() => getHousingStats(db), [version]);
    const profiles = useMemo(() => db.getSyncedProfiles() || [], []);

    const run = async (fn, ok = '') => {
        setBusy(true); setError(''); setMessage('');
        try { await fn(); setVersion(v => v + 1); if (ok) setMessage(ok); }
        catch (e) { setError(e?.message || 'Xatolik yuz berdi.'); }
        finally { setBusy(false); }
    };

    const [dormForm, setDormForm] = useState({ id: null, name: '', address: '', responsibleUserId: '' });
    const [housing, setHousing] = useState({ student: null, housingType: '', dormitoryId: '', room: '' });

    return (
        <div className="space-y-4">
            <Card>
                <div className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Building size={17} className="text-slate-600" /> Yotoqxonalar va turar joy
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">
                                10-mezonda baholovchini aniqlash uchun
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline" size="sm" icon={Plus}
                                onClick={() => {
                                    setDormForm({ id: null, name: '', address: '', responsibleUserId: '' });
                                    setShowDormForm(true);
                                }}
                            >
                                Yotoqxona
                            </Button>
                            <Button
                                variant="primary" size="sm" icon={Plus}
                                onClick={() => {
                                    setHousing({ student: null, housingType: '', dormitoryId: '', room: '' });
                                    setShowHousingForm(true);
                                }}
                            >
                                Turar joy kiritish
                            </Button>
                        </div>
                    </div>

                    {/* Turar joy QAMROVI - eng muhim raqam. Ma'lumoti yo'q
                        talabaning ozodalik bandini kim baholashi aniqlanmaydi,
                        ya'ni u 10-mezonda baholanmay qoladi. */}
                    <StatStrip
                        items={[
                            { label: 'Yotoqxonalar', value: stats.dormitories, tone: 'gray', hint: `${stats.activeDormitories} ta faol` },
                            { label: 'Turar joyi kiritilgan', value: stats.recorded, tone: 'indigo', hint: `${stats.totalStudents} tadan` },
                            { label: 'Qamrov', value: stats.coveragePercent, suffix: '%', tone: 'emerald' },
                            { label: 'Yotoqxonada yashaydi', value: stats.byType.dormitory, tone: 'cyan' },
                        ]}
                        warnings={[
                            stats.withoutResponsible > 0
                                && `${stats.withoutResponsible} ta faol yotoqxonada mudir biriktirilmagan — u yerdagi talabalarni kim baholashi aniqlanmaydi`,
                        ]}
                    />

                    {/* Vaqtinchalik holat ochiq aytiladi. */}
                    <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                        <p className="text-[11px] text-amber-900 leading-relaxed flex items-start gap-1.5">
                            <Info size={12} className="shrink-0 mt-px" />
                            <span>
                                Talabaning yashash joyi haqidagi ma'lumot <b>kelajakda tizimning
                                o'zidan</b> avtomatik olinadi. Hozircha u qo'lda kiritiladi —
                                bu vaqtinchalik holat.
                            </span>
                        </p>
                    </div>

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

                    {dorms.length === 0 ? (
                        <p className="text-sm text-gray-400 py-3">
                            Yotoqxona kiritilmagan. Kiritilmasa yotoqxonada yashovchi talabalarning
                            ozodalik bandini ham tyutor baholaydi.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {dorms.map(d => {
                                const residents = db.getDormitoryStudents(d.id);
                                return (
                                    <div key={d.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-gray-900">{d.name}</p>
                                            {d.address && <p className="text-[11px] text-gray-400">{d.address}</p>}
                                            <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1">
                                                <UserCog size={10} />
                                                {d.responsibleUserId
                                                    ? `Mudir: ${d.responsibleUserId}`
                                                    : 'Mudir biriktirilmagan'}
                                                {' · '}
                                                {residents.length} ta talaba
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <Badge variant={d.responsibleUserId ? 'success' : 'warning'} size="sm">
                                                {d.responsibleUserId ? 'Biriktirilgan' : 'Mudirsiz'}
                                            </Badge>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDormForm({
                                                        id: d.id, name: d.name, address: d.address,
                                                        responsibleUserId: d.responsibleUserId || '',
                                                    });
                                                    setShowDormForm(true);
                                                }}
                                                className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-200 text-[11px] font-bold text-gray-600"
                                            >
                                                Tahrirlash
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Card>

            {/* YOTOQXONA FORMASI */}
            <Modal isOpen={showDormForm} onClose={() => setShowDormForm(false)} title="Yotoqxona">
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Nomi *</label>
                        <input
                            type="text" value={dormForm.name}
                            onChange={e => setDormForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="Masalan: 1-sonli talabalar turar joyi"
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Manzil</label>
                        <input
                            type="text" value={dormForm.address}
                            onChange={e => setDormForm(f => ({ ...f, address: e.target.value }))}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Mudir</label>
                        <select
                            value={dormForm.responsibleUserId}
                            onChange={e => setDormForm(f => ({ ...f, responsibleUserId: e.target.value }))}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                        >
                            <option value="">Biriktirilmagan</option>
                            {profiles.map(p => (
                                <option key={p.username} value={p.username}>
                                    {p.fullName} ({p.username})
                                </option>
                            ))}
                        </select>
                        {/* Yangi rol emas, biriktiruv - buni aytib qo'yamiz. */}
                        <p className="text-[11px] text-gray-400 mt-1.5">
                            Mudir sifatida mavjud akkaunt biriktiriladi — alohida rol ochilmaydi.
                            Biriktirilgan odam o'z yotoqxonasidagi talabalarni ko'radi.
                        </p>
                    </div>

                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => setShowDormForm(false)}>
                            Bekor qilish
                        </Button>
                        <Button
                            variant="primary" className="flex-1"
                            disabled={busy || !dormForm.name.trim()}
                            onClick={() => run(async () => {
                                await db.saveDormitory({
                                    ...dormForm,
                                    responsibleUserId: dormForm.responsibleUserId || null,
                                    by: user?.username,
                                });
                                setShowDormForm(false);
                            }, 'Saqlandi.')}
                        >
                            Saqlash
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* TURAR JOY FORMASI */}
            <Modal isOpen={showHousingForm} onClose={() => setShowHousingForm(false)} title="Talabaning turar joyi">
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Talaba *</label>
                        <StudentPicker
                            value={housing.student}
                            onSelect={s => setHousing(h => ({ ...h, student: s }))}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase">Turar joy turi *</label>
                        <select
                            value={housing.housingType}
                            onChange={e => setHousing(h => ({ ...h, housingType: e.target.value }))}
                            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                        >
                            <option value="">Tanlang...</option>
                            {HOUSING_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                    </div>

                    {housing.housingType === 'dormitory' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <select
                                value={housing.dormitoryId}
                                onChange={e => setHousing(h => ({ ...h, dormitoryId: e.target.value }))}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
                            >
                                <option value="">Yotoqxona...</option>
                                {db.getDormitories().map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                            <input
                                type="text" value={housing.room}
                                onChange={e => setHousing(h => ({ ...h, room: e.target.value }))}
                                placeholder="Xona raqami"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                    )}

                    <p className="text-[11px] text-gray-400">
                        Yotoqxonada yashovchi talabaning «toza-ozoda yurish» bandini yotoqxona
                        mudiri baholaydi; ijara yoki oilasi bilan yashovchilarniki tyutorda qoladi.
                    </p>

                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => setShowHousingForm(false)}>
                            Bekor qilish
                        </Button>
                        <Button
                            variant="primary" className="flex-1"
                            disabled={busy || !housing.student || !housing.housingType
                                || (housing.housingType === 'dormitory' && !housing.dormitoryId)}
                            onClick={() => run(async () => {
                                await db.setStudentHousing({
                                    studentId: housing.student.id,
                                    housingType: housing.housingType,
                                    dormitoryId: housing.dormitoryId || null,
                                    room: housing.room,
                                    source: 'manual', by: user?.username,
                                });
                                setShowHousingForm(false);
                            }, 'Turar joy saqlandi.')}
                        >
                            Saqlash
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default DormitoriesPanel;
