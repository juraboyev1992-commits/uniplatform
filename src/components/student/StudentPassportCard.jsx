import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Lock, Info, Pencil, Save, X, ShieldAlert, User } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import {
    FIELD_SOURCES, SENSITIVITY, VIEWER_KINDS, PASSPORT_FIELD_INDEX,
} from '../../config/studentPassport';

// TALABANING RAQAMLI PASPORTI.
//
// Bir xil komponent uch joyda ishlaydi: talaba kabinetida, tyutorda va
// adminda. Farqni ROL emas, `db.getStudentPassport` qaytargan ko'rinish
// belgilaydi - filtrlash ma'lumot qatlamida bo'ladi, oynada emas.
//
// Ko'rinmaydigan maydon YASHIRILMAYDI, "yopiq" deb ko'rsatiladi: maydonning
// borligini bilish bilan qiymatini bilish boshqa narsa, va bo'sh joy
// "ma'lumot yo'q" degan noto'g'ri taassurot berardi.
const VIEWER_LABELS = {
    [VIEWER_KINDS.SELF]: "O'z ma'lumotingiz",
    [VIEWER_KINDS.ADMIN]: 'Administrator ko\'rinishi',
    [VIEWER_KINDS.TUTOR]: 'Tyutor ko\'rinishi',
    [VIEWER_KINDS.DORM]: 'Yotoqxona mudiri ko\'rinishi',
    [VIEWER_KINDS.EVALUATOR]: 'Stipendiya komissiyasi ko\'rinishi',
    [VIEWER_KINDS.MANAGEMENT]: 'Rahbariyat ko\'rinishi',
    [VIEWER_KINDS.OTHER]: 'Cheklangan ko\'rinish',
};

const StudentPassportCard = ({ studentId, canEdit = false }) => {
    const { user } = useAuth();
    const [version, setVersion] = useState(0);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const passport = useMemo(
        () => db.getStudentPassport(studentId, user),
        [studentId, user, version]
    );

    // MAXFIY MAYDONGA QARALGANDA IZ QOLADI. Cheklovdan muhimroq: cheklovni
    // chetlab o'tish mumkin, izni esa yo'q.
    useEffect(() => {
        if (!passport?.openedSensitive?.length) return;
        db.logPassportAccess({
            studentId,
            viewer: user,
            viewerKind: passport.viewerKind,
            fields: passport.openedSensitive,
        }).catch(() => {});
        // Bir marta - qayta render izni takrorlamasin.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studentId, passport?.viewerKind]);

    const startEdit = () => {
        const values = {};
        passport.sections.forEach(s => s.fields.forEach(f => {
            if (!f.computed && f.visible) values[f.path] = f.value ?? '';
        }));
        setDraft(values);
        setEditing(true);
        setError('');
    };

    const save = async () => {
        setBusy(true); setError('');
        try {
            await db.setPassportFields({
                studentId, values: draft, source: 'manual', by: user?.username,
            });
            setEditing(false);
            setVersion(v => v + 1);
        } catch (e) {
            setError(e?.message || 'Xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    const renderValue = (field) => {
        if (!field.visible) {
            return (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400">
                    <Lock size={10} /> Yopiq
                </span>
            );
        }
        if (field.value == null || field.value === '') {
            // HEMIS'dagidek: bo'sh joy emas, aniq javob.
            return <span className="text-[11px] text-gray-400">Ma'lumot yo'q</span>;
        }
        if (field.type === 'bool') {
            return <Badge variant={field.value ? 'success' : 'default'} size="sm">
                {field.value ? 'Ha' : "Yo'q"}
            </Badge>;
        }
        return <span className="text-sm text-gray-900">{String(field.value)}</span>;
    };

    const student = passport.student;

    return (
        <Card padding={false}>
            {/* Sarlavha */}
            <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center">
                        <User size={22} className="text-indigo-500" />
                    </div>
                    <div>
                        <h3 className="font-extrabold text-gray-900 flex items-center gap-2">
                            <CreditCard size={17} className="text-indigo-600" />
                            {student?.fullName || studentId}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {student?.faculty}
                            {student?.course ? ` · ${student.course}-kurs` : ''}
                            {student?.group ? ` · ${student.group}` : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="default" size="sm">{VIEWER_LABELS[passport.viewerKind]}</Badge>
                    {canEdit && !editing && (
                        <Button variant="outline" size="sm" icon={Pencil} onClick={startEdit}>
                            Tahrirlash
                        </Button>
                    )}
                    {editing && (
                        <>
                            <Button variant="outline" size="sm" icon={X} onClick={() => setEditing(false)}>
                                Bekor
                            </Button>
                            <Button variant="primary" size="sm" icon={Save} disabled={busy} onClick={save}>
                                Saqlash
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Maxfiylik haqida ogohlantirish - ko'ruvchi nima bo'layotganini bilsin. */}
            {passport.viewerKind !== VIEWER_KINDS.SELF && passport.openedSensitive.length > 0 && (
                <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100">
                    <p className="text-[11px] text-amber-900 flex items-start gap-1.5">
                        <ShieldAlert size={12} className="shrink-0 mt-px" />
                        Bu ko'rinishda maxfiy maydonlar ochiq. Ularga qaralgani qayd etildi.
                    </p>
                </div>
            )}

            {error && (
                <p className="mx-5 mt-3 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    {error}
                </p>
            )}

            {/* Bo'limlar */}
            <div className="divide-y divide-gray-50">
                {passport.sections.map(section => (
                    <div key={section.key} className="p-5">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-600 mb-2.5">
                            {section.label}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                            {section.fields.map(field => (
                                <div key={field.path} className="flex items-baseline justify-between gap-3 py-1 border-b border-gray-50 last:border-0">
                                    <span className="text-[11px] text-gray-500 shrink-0">
                                        {field.label}
                                        {field.sensitivity === SENSITIVITY.SENSITIVE && (
                                            <Lock size={9} className="inline ml-1 text-amber-500" />
                                        )}
                                    </span>
                                    <span className="text-right min-w-0">
                                        {editing && !field.computed && field.visible ? (
                                            field.type === 'bool' ? (
                                                <input
                                                    type="checkbox"
                                                    className="rounded accent-indigo-600"
                                                    checked={!!draft[field.path]}
                                                    onChange={e => setDraft(d => ({ ...d, [field.path]: e.target.checked }))}
                                                />
                                            ) : (
                                                <input
                                                    type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                                                    value={draft[field.path] ?? ''}
                                                    onChange={e => setDraft(d => ({ ...d, [field.path]: e.target.value }))}
                                                    className="w-40 px-2 py-1 border border-gray-200 rounded-lg text-sm text-right"
                                                />
                                            )
                                        ) : (
                                            <>
                                                {renderValue(field)}
                                                {/* Manba - "bu qayerdan kelgan?" savoliga javob. */}
                                                {field.visible && field.value != null && field.value !== '' && field.source && (
                                                    <span className="block text-[10px] text-gray-300">
                                                        {FIELD_SOURCES[field.source]?.label || field.source}
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Boshqa qatlamdan keladigan bo'lim - qayerdan o'zgartirilishini aytamiz. */}
                        {section.key === 'housing' && (
                            <p className="text-[11px] text-gray-400 mt-2 flex items-start gap-1.5">
                                <Info size={11} className="shrink-0 mt-px" />
                                Turar joy ma'lumoti alohida qatlamda saqlanadi va shu yerdan
                                tahrirlanmaydi — u 10-mezonda baholovchini belgilaydi.
                            </p>
                        )}
                    </div>
                ))}
            </div>

            {passport.updatedAt && (
                <div className="px-5 py-3 border-t border-gray-100">
                    <p className="text-[10px] text-gray-400">
                        Oxirgi o'zgarish: {new Date(passport.updatedAt).toLocaleString('uz-UZ')}
                        {passport.updatedBy ? ` · ${passport.updatedBy}` : ''}
                    </p>
                </div>
            )}
        </Card>
    );
};

export default StudentPassportCard;
