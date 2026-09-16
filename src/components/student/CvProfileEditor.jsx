import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Loader2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { db } from '../../services/db';
import { CV_SECTIONS } from '../../utils/cvEngine';

// CV NING QO'LDA KIRITILADIGAN QISMI.
//
// NEGA KERAK: CV ning 12 bo'limidan 6 tasi (qisqacha ma'lumot, ish
// tajribasi, amaliyot, loyihalar, ko'nikmalar, tillar) platformada
// manbasi YO'Q narsalar. Ular faqat shu yerdan kiritiladi. Ilgari
// `db.saveCvProfile` mavjud edi, lekin uni chaqiradigan oyna yo'q edi -
// natijada sahifa "faqat siz kirita olasiz" deb yozib, kiritadigan joyni
// bermasdi va to'liqlik halqasi 50% dan oshmasdi.
//
// BU YERGA FAQAT MANBASI YO'Q NARSA KIRADI. GPA, klublar, sertifikatlar,
// yutuqlar va musobaqalar o'z modullaridan avtomatik keladi - ularni bu
// yerda qo'lda yozdirish ikki xil haqiqat yaratardi.

const input = 'w-full px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
const label = 'block text-xs font-black text-gray-500 uppercase mb-1';

const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// Takrorlanuvchi ro'yxat (ko'nikma, til, tajriba, amaliyot, loyiha).
// Maydonlar ta'rifi `fields` orqali beriladi - har biri uchun alohida
// komponent yozish bir xil kodni besh marta takrorlash bo'lardi.
const RepeatList = ({ title, hint, items, fields, onChange, addLabel }) => {
    const add = () => onChange([...items, { id: uid('r'), ...Object.fromEntries(fields.map(f => [f.key, ''])) }]);
    const patch = (i, k, v) => onChange(items.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
    const remove = (i) => onChange(items.filter((_, idx) => idx !== i));

    return (
        <div className="space-y-2.5">
            <div>
                <h4 className="text-sm font-black text-blue-950">{title}</h4>
                {hint && <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{hint}</p>}
            </div>

            {items.length === 0 && (
                <p className="text-xs text-gray-400">Hali qo'shilmagan.</p>
            )}

            {items.map((it, i) => (
                <div key={it.id || i} className="rounded-2xl border border-gray-200 p-3">
                    <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {fields.map(f => (
                                <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
                                    <label className={label}>{f.label}</label>
                                    {f.type === 'textarea' ? (
                                        <textarea
                                            rows={2} className={input} placeholder={f.placeholder || ''}
                                            value={it[f.key] || ''}
                                            onChange={e => patch(i, f.key, e.target.value)}
                                        />
                                    ) : (
                                        <input
                                            type={f.type || 'text'} className={input} placeholder={f.placeholder || ''}
                                            value={it[f.key] || ''}
                                            onChange={e => patch(i, f.key, e.target.value)}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                        <button
                            type="button" onClick={() => remove(i)} title="O'chirish"
                            className="p-1.5 text-rose-400 hover:text-rose-600 shrink-0"
                        >
                            <Trash2 size={15} />
                        </button>
                    </div>
                </div>
            ))}

            <Button variant="outline" size="sm" icon={Plus} onClick={add}>{addLabel}</Button>
        </div>
    );
};

const CvProfileEditor = ({ isOpen, studentId, onClose, onSaved }) => {
    // Oyna har ochilganda joriy qiymatdan boshlanadi. `isOpen` bog'liqlikda
    // turadi: saqlamay yopib, qayta ochgan odam eski tahririni emas,
    // saqlangan haqiqatni ko'rishi kerak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const initial = useMemo(() => db.getCvProfile(studentId), [studentId, isOpen]);

    const [bio, setBio] = useState(initial.bio);
    const [links, setLinks] = useState(initial.links || {});
    const [skills, setSkills] = useState(initial.skills || []);
    const [languages, setLanguages] = useState(initial.languages || []);
    const [experience, setExperience] = useState(initial.experience || []);
    const [internships, setInternships] = useState(initial.internships || []);
    const [projects, setProjects] = useState(initial.projects || []);
    const [hidden, setHidden] = useState(initial.hiddenSections || []);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    // Oyna yopilib qayta ochilganda holatni joriy qiymatga qaytarish.
    const [openedWith, setOpenedWith] = useState(isOpen);
    if (isOpen !== openedWith) {
        setOpenedWith(isOpen);
        if (isOpen) {
            setBio(initial.bio);
            setLinks(initial.links || {});
            setSkills(initial.skills || []);
            setLanguages(initial.languages || []);
            setExperience(initial.experience || []);
            setInternships(initial.internships || []);
            setProjects(initial.projects || []);
            setHidden(initial.hiddenSections || []);
            setError('');
        }
    }

    const toggleHidden = (id) =>
        setHidden(h => (h.includes(id) ? h.filter(x => x !== id) : [...h, id]));

    // Bo'sh qatorlar saqlanmaydi: nomi yo'q ko'nikma yoki tashkiloti va
    // lavozimi yo'q tajriba CV da bo'sh satr bo'lib chiqardi.
    const clean = (arr, keys) => arr.filter(x => keys.some(k => String(x[k] || '').trim()));

    const save = async () => {
        setBusy(true); setError('');
        try {
            await db.saveCvProfile(studentId, {
                bio: String(bio || '').trim(),
                links: Object.fromEntries(
                    Object.entries(links).map(([k, v]) => [k, String(v || '').trim()]).filter(([, v]) => v)
                ),
                skills: clean(skills, ['name']),
                languages: clean(languages, ['name']),
                experience: clean(experience, ['role', 'organization']),
                internships: clean(internships, ['role', 'organization']),
                projects: clean(projects, ['title']),
                hiddenSections: hidden,
            });
            onSaved?.();
            onClose?.();
        } catch (e) {
            setError(e?.message || 'Saqlanmadi.');
        } finally {
            setBusy(false);
        }
    };

    const periodFields = [
        { key: 'role', label: 'Lavozim' },
        { key: 'organization', label: 'Tashkilot' },
        { key: 'from', label: 'Boshlangan', type: 'month' },
        { key: 'to', label: 'Tugagan (bo\'sh = hozir)', type: 'month' },
        { key: 'description', label: 'Qisqacha', type: 'textarea', wide: true },
    ];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="CV ma'lumotlarini tahrirlash">
            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
                <p className="text-xs text-gray-500 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 leading-relaxed">
                    Bu yerga faqat platformada <b>manbasi yo'q</b> narsalar kiritiladi. GPA, klublar,
                    sertifikatlar, yutuqlar va musobaqalar CV ga o'z bo'limlaridan avtomatik tushadi —
                    ularni qo'lda yozish kerak emas.
                </p>

                <div>
                    <label className={label}>Qisqacha ma'lumot</label>
                    <textarea
                        rows={3} className={input}
                        placeholder="O'zingiz, qiziqishlaringiz va maqsadingiz haqida 2-3 gap"
                        value={bio} onChange={e => setBio(e.target.value)}
                    />
                </div>

                <div>
                    <h4 className="text-sm font-black text-blue-950 mb-2">Aloqa va havolalar</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                            { key: 'phone', label: 'Telefon', placeholder: '+998 ...' },
                            { key: 'email', label: 'Elektron pochta', type: 'email' },
                            { key: 'location', label: 'Manzil', placeholder: 'Toshkent' },
                            { key: 'linkedin', label: 'LinkedIn' },
                            { key: 'portfolio', label: 'Shaxsiy sayt / portfolio', wide: true },
                        ].map(f => (
                            <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
                                <label className={label}>{f.label}</label>
                                <input
                                    type={f.type || 'text'} className={input} placeholder={f.placeholder || ''}
                                    value={links[f.key] || ''}
                                    onChange={e => setLinks({ ...links, [f.key]: e.target.value })}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <RepeatList
                    title="Ko'nikmalar" addLabel="Ko'nikma qo'shish" items={skills} onChange={setSkills}
                    hint="Masalan: Huquqiy tahlil — yuqori daraja"
                    fields={[
                        { key: 'name', label: 'Nomi' },
                        { key: 'level', label: 'Daraja (ixtiyoriy)', placeholder: "boshlang'ich / o'rta / yuqori" },
                    ]}
                />

                <RepeatList
                    title="Tillar" addLabel="Til qo'shish" items={languages} onChange={setLanguages}
                    hint="Sertifikatingiz bo'lsa, uni 'Yutuq va imkoniyatlar' bo'limiga yuklang — CV uni tasdiqlangan deb ko'rsatadi."
                    fields={[
                        { key: 'name', label: 'Til' },
                        { key: 'level', label: 'Daraja', placeholder: 'B2, C1, ona tili...' },
                    ]}
                />

                <RepeatList
                    title="Ish tajribasi" addLabel="Ish joyi qo'shish"
                    items={experience} onChange={setExperience} fields={periodFields}
                />

                <RepeatList
                    title="Amaliyot" addLabel="Amaliyot qo'shish"
                    items={internships} onChange={setInternships} fields={periodFields}
                />

                <RepeatList
                    title="Loyihalar" addLabel="Loyiha qo'shish" items={projects} onChange={setProjects}
                    fields={[
                        { key: 'title', label: 'Loyiha nomi' },
                        { key: 'organization', label: 'Tashkilot / rol' },
                        { key: 'from', label: 'Boshlangan', type: 'month' },
                        { key: 'to', label: "Tugagan (bo'sh = hozir)", type: 'month' },
                        { key: 'description', label: 'Qisqacha', type: 'textarea', wide: true },
                    ]}
                />

                <div>
                    <h4 className="text-sm font-black text-blue-950 mb-1">CV da ko'rinmasin</h4>
                    <p className="text-[11px] text-gray-400 mb-2 leading-relaxed">
                        Belgilangan bo'lim chop etiladigan CV dan chiqarib tashlanadi. Ish maydonida
                        u baribir ko'rinib turadi — bu faqat hujjat ko'rinishiga tegishli.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {CV_SECTIONS.map(sec => {
                            const off = hidden.includes(sec.id);
                            return (
                                <button
                                    key={sec.id} type="button" onClick={() => toggleHidden(sec.id)}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                                        off ? 'bg-gray-200 text-gray-500' : 'bg-blue-50 text-blue-800'
                                    }`}
                                >
                                    {off ? <EyeOff size={12} /> : <Eye size={12} />} {sec.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {error && (
                    <p className="flex items-start gap-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
                        <AlertTriangle size={14} className="shrink-0 mt-px" /> {error}
                    </p>
                )}
            </div>

            <div className="flex gap-3 pt-4 mt-1 border-t border-gray-100">
                <Button variant="outline" className="flex-1" onClick={onClose} disabled={busy}>
                    Bekor qilish
                </Button>
                <Button variant="primary" className="flex-1" onClick={save} disabled={busy}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : null} Saqlash
                </Button>
            </div>
        </Modal>
    );
};

export default CvProfileEditor;
