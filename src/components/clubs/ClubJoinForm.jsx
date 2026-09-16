import React from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react';
import Button from '../common/Button';

// KLUBGA A'ZOLIK ANKETASI - koordinator o'zi tuzadi (Google Form uslubida).
//
// NEGA SHAXSIY MA'LUMOT SO'RALMAYDI: F.I.SH., fakultet, kurs, guruh va
// talaba ID tizimda allaqachon bor. Ularni qaytadan so'rash - xato yozilishi
// (bir odam ikki xil fakultet yozadi), eskirishi va ortiqcha maxfiy ma'lumot
// yig'ilishi demak. Shuning uchun ular anketada FAQAT ko'rsatiladi, kiritish
// maydoni sifatida emas.
//
// Savollar `clubs.data.joinForm` da, javoblar esa `club_join_requests.data`
// ichida saqlanadi - ikkalasi ham mavjud jsonb ustunlar, yangi SQL yo'q.

export const JOIN_FIELD_TYPES = {
    short_text: { label: 'Qisqa javob' },
    long_text: { label: 'Uzun javob' },
    select: { label: 'Bitta variant', hasOptions: true },
    multi: { label: 'Bir nechta variant', hasOptions: true },
    number: { label: 'Raqam' },
    date: { label: 'Sana' },
};

export const emptyJoinForm = () => ({ intro: '', fields: [] });

const makeField = () => ({
    id: 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    label: '', type: 'short_text', required: false, options: [],
});

const inputClass = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm';

// ----------------------------------------------------------------------
// SOZLAGICH - "Sozlash" oynasi ichida, koordinator uchun.
// ----------------------------------------------------------------------
export const JoinFormBuilder = ({ value, onChange }) => {
    const form = value || emptyJoinForm();
    const fields = Array.isArray(form.fields) ? form.fields : [];

    const setFields = (next) => onChange({ ...form, fields: next });
    const patch = (i, changes) => setFields(fields.map((f, idx) => (idx === i ? { ...f, ...changes } : f)));
    const move = (i, dir) => {
        const j = i + dir;
        if (j < 0 || j >= fields.length) return;
        const next = [...fields];
        [next[i], next[j]] = [next[j], next[i]];
        setFields(next);
    };

    return (
        <div className="space-y-3">
            <div>
                <label className="block text-xs font-black text-gray-500 uppercase mb-1">Anketa kirish matni</label>
                <textarea
                    rows={2} className={inputClass}
                    placeholder="Masalan: quyidagi savollarga javob bering, koordinator ko'rib chiqadi."
                    value={form.intro || ''}
                    onChange={e => onChange({ ...form, intro: e.target.value })}
                />
            </div>

            <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 leading-relaxed">
                F.I.SH., fakultet, kurs, guruh va talaba ID <b>so'ralmaydi</b> - ular tizimdan olinadi va
                arizada avtomatik ko'rinadi. Bu yerga faqat tizim bilmaydigan savollarni yozing.
            </p>

            {fields.length === 0 && (
                <p className="text-sm text-gray-400">Hali savol qo'shilmagan. Anketasiz ariza ham ishlayveradi.</p>
            )}

            {fields.map((f, i) => {
                const hasOptions = JOIN_FIELD_TYPES[f.type]?.hasOptions;
                return (
                    <div key={f.id} className="rounded-2xl border border-gray-200 p-3 space-y-2.5">
                        <div className="flex items-start gap-2">
                            <span className="text-xs font-black text-gray-300 mt-2.5 w-4 shrink-0">{i + 1}</span>
                            <input
                                className={inputClass} placeholder="Savol matni"
                                value={f.label}
                                onChange={e => patch(i, { label: e.target.value })}
                            />
                            <div className="flex gap-1 shrink-0">
                                <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                                    className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Yuqoriga">
                                    <ChevronUp size={15} />
                                </button>
                                <button type="button" onClick={() => move(i, 1)} disabled={i === fields.length - 1}
                                    className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Pastga">
                                    <ChevronDown size={15} />
                                </button>
                                <button type="button" onClick={() => setFields(fields.filter((_, idx) => idx !== i))}
                                    className="p-1.5 text-rose-400 hover:text-rose-600" title="O'chirish">
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pl-6">
                            <select
                                className="px-3 py-1.5 border border-gray-200 rounded-xl text-xs bg-white"
                                value={f.type}
                                onChange={e => patch(i, { type: e.target.value })}
                            >
                                {Object.entries(JOIN_FIELD_TYPES).map(([k, t]) => (
                                    <option key={k} value={k}>{t.label}</option>
                                ))}
                            </select>
                            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                                <input
                                    type="checkbox" checked={!!f.required}
                                    onChange={e => patch(i, { required: e.target.checked })}
                                />
                                Majburiy
                            </label>
                        </div>

                        {hasOptions && (
                            <div className="pl-6 space-y-1.5">
                                {(f.options || []).map((opt, oi) => (
                                    <div key={oi} className="flex items-center gap-2">
                                        <input
                                            className={inputClass} placeholder={`Variant ${oi + 1}`}
                                            value={opt}
                                            onChange={e => patch(i, {
                                                options: (f.options || []).map((o, idx) => (idx === oi ? e.target.value : o)),
                                            })}
                                        />
                                        <button type="button" className="p-1.5 text-gray-400 hover:text-rose-600"
                                            onClick={() => patch(i, { options: (f.options || []).filter((_, idx) => idx !== oi) })}>
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                                <Button variant="ghost" size="sm" icon={Plus}
                                    onClick={() => patch(i, { options: [...(f.options || []), ''] })}>
                                    Variant qo'shish
                                </Button>
                            </div>
                        )}
                    </div>
                );
            })}

            <Button variant="outline" size="sm" icon={Plus} onClick={() => setFields([...fields, makeField()])}>
                Savol qo'shish
            </Button>
        </div>
    );
};

// ----------------------------------------------------------------------
// ANKETA - talaba uchun, ariza oynasi ichida.
// ----------------------------------------------------------------------
export const JoinFormFields = ({ form, answers, onChange }) => {
    const fields = (Array.isArray(form?.fields) ? form.fields : []).filter(f => String(f.label || '').trim());
    if (fields.length === 0) return null;

    const set = (id, v) => onChange({ ...answers, [id]: v });

    return (
        <div className="space-y-3">
            {fields.map(f => (
                <div key={f.id}>
                    <label className="block text-xs font-black text-gray-500 uppercase mb-1">
                        {f.label}{f.required && <span className="text-rose-500"> *</span>}
                    </label>

                    {f.type === 'long_text' && (
                        <textarea rows={3} className={inputClass}
                            value={answers[f.id] || ''} onChange={e => set(f.id, e.target.value)} />
                    )}
                    {f.type === 'short_text' && (
                        <input className={inputClass}
                            value={answers[f.id] || ''} onChange={e => set(f.id, e.target.value)} />
                    )}
                    {f.type === 'number' && (
                        <input type="number" className={inputClass}
                            value={answers[f.id] ?? ''} onChange={e => set(f.id, e.target.value)} />
                    )}
                    {f.type === 'date' && (
                        <input type="date" className={inputClass}
                            value={answers[f.id] || ''} onChange={e => set(f.id, e.target.value)} />
                    )}
                    {f.type === 'select' && (
                        <select className={inputClass} value={answers[f.id] || ''} onChange={e => set(f.id, e.target.value)}>
                            <option value="">Tanlang...</option>
                            {(f.options || []).filter(Boolean).map((o, i) => <option key={i} value={o}>{o}</option>)}
                        </select>
                    )}
                    {f.type === 'multi' && (
                        <div className="space-y-1">
                            {(f.options || []).filter(Boolean).map((o, i) => {
                                const picked = Array.isArray(answers[f.id]) ? answers[f.id] : [];
                                return (
                                    <label key={i} className="flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox" checked={picked.includes(o)}
                                            onChange={e => set(f.id, e.target.checked
                                                ? [...picked, o]
                                                : picked.filter(x => x !== o))}
                                        />
                                        {o}
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

// Majburiy savollar to'ldirilganmi. Bo'sh satr qaytsa - hammasi joyida.
export const validateJoinAnswers = (form, answers) => {
    const fields = (Array.isArray(form?.fields) ? form.fields : []).filter(f => String(f.label || '').trim());
    for (const f of fields) {
        if (!f.required) continue;
        const v = answers?.[f.id];
        const empty = Array.isArray(v) ? v.length === 0 : !String(v ?? '').trim();
        if (empty) return `"${f.label}" - bu savolga javob berish majburiy.`;
    }
    return '';
};

// Javoblar SAVOL MATNI bilan birga saqlanadi. Aks holda koordinator keyin
// anketani o'zgartirsa, eski arizalar o'qib bo'lmaydigan holga kelardi -
// faqat identifikator qolib, qaysi savolga javob ekani yo'qolardi.
export const buildAnswerRecords = (form, answers) =>
    (Array.isArray(form?.fields) ? form.fields : [])
        .filter(f => String(f.label || '').trim())
        .map(f => {
            const v = answers?.[f.id];
            return {
                id: f.id, label: f.label, type: f.type,
                value: Array.isArray(v) ? v.join(', ') : String(v ?? '').trim(),
            };
        })
        .filter(a => a.value !== '');
