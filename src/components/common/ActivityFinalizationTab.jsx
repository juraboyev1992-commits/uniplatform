import React, { useEffect, useMemo, useState } from 'react';
import {
    FileText, PenLine, Award, ShieldCheck, Users, CheckCircle2, AlertTriangle, Send, Eye
} from 'lucide-react';
import Button from './Button';
import Badge from './Badge';
import Modal from './Modal';
import RichTextEditor from './RichTextEditor';
import ProtocolDocument from './ProtocolDocument';
import CertificateGenerator from './CertificateGenerator';
import { db } from '../../services/db';
import {
    PROTOCOL_STATUS, DOCUMENT_STATUS, DEFAULT_SIGNER_ROLES,
    getDocumentTypeLabel, DOCUMENT_TYPES, CERTIFICATE_TEMPLATES, defaultAwardSettings
} from '../../config/documents';

const miniLabel = 'block text-[10px] font-bold text-gray-400 uppercase mb-1';
const miniSelect = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs bg-white';

// Faoliyatning rasmiy yakuni: bayonnoma -> imzo -> tasdiq -> taqdirlash -> hujjatlar.
// Mavjud natija/davomat/ishtirokchi mexanizmlariga tegmaydi, faqat ulardan O'QIYDI (db.getActivityFinalSnapshot).
// Asosiy nazorat: bayonnoma tasdiqlanmaguncha hech qanday hujjat berilmaydi.
const Stat = ({ label, value }) => (
    <div className="p-3 bg-white border border-gray-100 rounded-xl">
        <p className="text-[11px] text-gray-400">{label}</p>
        <p className="text-lg font-extrabold text-gray-900 mt-0.5">{value}</p>
    </div>
);

const Step = ({ index, title, done, active, children }) => (
    <div className={`p-4 rounded-2xl border ${active ? 'border-indigo-200 bg-indigo-50/40' : 'border-gray-100 bg-white'}`}>
        <div className="flex items-center gap-2 mb-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold ${
                done ? 'bg-emerald-600 text-white' : active ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
                {done ? <CheckCircle2 size={13} /> : index}
            </span>
            <h4 className="text-sm font-bold text-gray-900">{title}</h4>
        </div>
        <div className="pl-8">{children}</div>
    </div>
);

const ActivityFinalizationTab = ({ activityType, activity, canManage, isAdmin = false, actingUsername, onChanged }) => {
    const [version, setVersion] = useState(0);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [summary, setSummary] = useState('');
    const [purpose, setPurpose] = useState('');
    const [signerRows, setSignerRows] = useState([]);
    const [preview, setPreview] = useState(null);
    const [showAllPreview, setShowAllPreview] = useState(false);
    const [protocolView, setProtocolView] = useState(null); // bayonnoma ishtirokchilari (ko'rish oynasi)
    const [docView, setDocView] = useState(null);           // ko'rilayotgan hujjat
    const [editingText, setEditingText] = useState(false);
    const [awardCfg, setAwardCfg] = useState(() => defaultAwardSettings(activityType));
    const setCfg = (patch) => setAwardCfg(c => ({ ...c, ...patch }));

    const protocol = useMemo(
        () => db.getProtocolForActivity(activityType, activity.id),
        [activityType, activity.id, version]
    );
    const signers = useMemo(
        () => (protocol ? db.getProtocolSigners(protocol.id) : []),
        [protocol, version]
    );
    const documents = useMemo(
        () => (protocol ? db.getDocumentsForProtocol(protocol.id) : []),
        [protocol, version]
    );
    const batches = useMemo(
        () => (protocol ? db.getAwardBatches(protocol.id) : []),
        [protocol, version]
    );
    const auditLogs = useMemo(
        () => (protocol ? db.getDocumentAuditLogs({ protocolId: protocol.id }) : []),
        [protocol, version]
    );

    const snapshot = useMemo(() => {
        try { return db.getActivityFinalSnapshot(activityType, activity.id); }
        catch { return null; }
    }, [activityType, activity.id, version]);

    // Imzolovchilar jadvalini bir marta standart lavozimlar bilan to'ldiramiz.
    useEffect(() => {
        if (signers.length > 0) {
            setSignerRows(signers.map(s => ({ role: s.role, username: s.username })));
        } else if (signerRows.length === 0) {
            setSignerRows((DEFAULT_SIGNER_ROLES[activityType] || []).map(role => ({ role, username: '' })));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signers.length, activityType]);

    const refresh = () => { setVersion(v => v + 1); onChanged?.(); };

    const run = async (key, fn, okMessage = '') => {
        setBusy(key); setError(''); setMessage('');
        try {
            await fn();
            if (okMessage) setMessage(okMessage);
            refresh();
        } catch (err) {
            setError(err?.message || 'Amalni bajarishda xatolik yuz berdi.');
        } finally {
            setBusy('');
        }
    };

    const status = protocol?.status || null;
    const isApproved = status === 'approved';
    const issuedDocs = documents.filter(d => d.status === 'issued');
    const draftDocs = documents.filter(d => d.status === 'draft');

    if (!canManage) {
        return (
            <div className="p-10 text-center text-sm text-gray-400">
                Bu bo'limni faqat koordinator va administrator ko'ra oladi.
            </div>
        );
    }

    return (
        <div className="p-6 space-y-5">
            <div>
                <h3 className="font-bold text-lg text-gray-900 flex items-center gap-1.5">
                    <FileText size={17} className="text-indigo-500" /> Yakunlash
                </h3>
                <p className="text-xs text-gray-400">
                    Rasmiy yakun: bayonnoma tuziladi, mas'ullar imzolaydi, shundan keyingina taqdirlash hujjatlari beriladi.
                </p>
            </div>

            {error && (
                <p className="flex items-start gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    <AlertTriangle size={13} className="shrink-0 mt-px" /> {error}
                </p>
            )}
            {message && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                    <CheckCircle2 size={13} /> {message}
                </p>
            )}

            {/* 1. Yakuniy statistika */}
            <Step index={1} title="Yakuniy statistika" done={!!protocol} active={!protocol}>
                {snapshot ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <Stat label="Ro'yxatdan o'tgan" value={snapshot.registeredCount} />
                        <Stat label="Qatnashgan" value={snapshot.attendedCount} />
                        <Stat label="Qatnashmagan" value={snapshot.absentCount} />
                        <Stat label={activity.type === 'team' ? 'Jamoalar' : 'Ishtirokchilar'} value={snapshot.participants.length} />
                    </div>
                ) : (
                    <p className="text-xs text-gray-400">Ma'lumot topilmadi.</p>
                )}
            </Step>

            {/* 2. Bayonnoma */}
            <Step index={2} title="Bayonnoma" done={!!protocol} active={!protocol}>
                {!protocol ? (
                    <div className="space-y-2">
                        <textarea
                            rows={2}
                            value={purpose}
                            onChange={e => setPurpose(e.target.value)}
                            placeholder="Tadbir maqsadi (ixtiyoriy)"
                            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                        />
                        <div>
                            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                Qisqacha ma'lumot / xulosa
                            </p>
                            <RichTextEditor
                                value={summary}
                                onChange={setSummary}
                                placeholder="Tadbir qanday o'tgani, e'tiborga loyiq jihatlari..."
                            />
                        </div>
                        <Button
                            variant="primary" size="sm" icon={FileText}
                            disabled={busy === 'gen'}
                            onClick={() => run('gen', () => db.generateProtocol(activityType, activity.id, {
                                createdBy: actingUsername, summary, purpose
                            }), 'Bayonnoma loyihasi shakllantirildi.')}
                        >
                            {busy === 'gen' ? 'Shakllantirilmoqda...' : 'Bayonnomani shakllantirish'}
                        </Button>
                        <p className="text-[11px] text-gray-400">
                            Ishtirokchilar ro'yxati va statistika avtomatik to'ldiriladi, qo'lda yozilmaydi.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-gray-800">{protocol.registrationNumber}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${PROTOCOL_STATUS[status]?.tone}`}>
                                {PROTOCOL_STATUS[status]?.label || status}
                            </span>
                            <span className="text-[11px] text-gray-400">
                                {protocol.attendedCount} qatnashgan / {protocol.registeredCount} ro'yxatda
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                variant="outline" size="sm" icon={Eye}
                                disabled={busy === 'openprot'}
                                onClick={() => run('openprot', async () => {
                                    const list = await db.getProtocolParticipants(protocol.id);
                                    setProtocolView(list);
                                })}
                            >
                                {busy === 'openprot' ? 'Ochilmoqda...' : "Bayonnomani ko'rish / PDF"}
                            </Button>
                            {status === 'draft' && (
                                <Button
                                    variant="outline" size="sm" icon={PenLine}
                                    onClick={() => { setSummary(protocol.summary || ''); setPurpose(protocol.purpose || ''); setEditingText(true); }}
                                >
                                    Matnni tahrirlash
                                </Button>
                            )}
                        </div>

                        {editingText && status === 'draft' && (
                            <div className="space-y-2 p-3 bg-white border border-gray-200 rounded-xl">
                                <input
                                    value={purpose}
                                    onChange={e => setPurpose(e.target.value)}
                                    placeholder="Tadbir maqsadi"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                                />
                                <RichTextEditor value={summary} onChange={setSummary} placeholder="Qisqacha ma'lumot / xulosa" />
                                <div className="flex gap-2">
                                    <Button
                                        variant="primary" size="sm"
                                        disabled={busy === 'savetext'}
                                        onClick={() => run('savetext', async () => {
                                            await db.updateProtocol(protocol.id, { summary, purpose }, actingUsername);
                                            setEditingText(false);
                                        }, 'Bayonnoma matni saqlandi.')}
                                    >
                                        Saqlash
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => setEditingText(false)}>Bekor qilish</Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Step>

            {/* 3. Imzolovchilar */}
            {protocol && (
                <Step index={3} title="Mas'ullar va imzolash" done={isApproved} active={!isApproved}>
                    {status === 'draft' ? (
                        <div className="space-y-2">
                            {signerRows.map((row, idx) => (
                                <div key={idx} className="flex flex-wrap items-center gap-2">
                                    <input
                                        value={row.role}
                                        onChange={e => setSignerRows(rows => rows.map((r, i) => i === idx ? { ...r, role: e.target.value } : r))}
                                        placeholder="Lavozim"
                                        className="flex-1 min-w-[160px] px-3 py-1.5 border border-gray-200 rounded-lg text-xs"
                                    />
                                    <input
                                        value={row.username}
                                        onChange={e => setSignerRows(rows => rows.map((r, i) => i === idx ? { ...r, username: e.target.value } : r))}
                                        placeholder="Foydalanuvchi nomi"
                                        className="flex-1 min-w-[160px] px-3 py-1.5 border border-gray-200 rounded-lg text-xs"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setSignerRows(rows => rows.filter((_, i) => i !== idx))}
                                        className="text-[11px] font-semibold text-gray-400 hover:text-red-500"
                                    >
                                        olib tashlash
                                    </button>
                                </div>
                            ))}
                            <div className="flex flex-wrap gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setSignerRows(rows => [...rows, { role: '', username: '' }])}
                                    className="px-3 py-1.5 text-xs font-bold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50"
                                >
                                    + Imzolovchi qo'shish
                                </button>
                                <Button
                                    variant="primary" size="sm" icon={Send}
                                    disabled={busy === 'send'}
                                    onClick={() => run('send', async () => {
                                        const valid = signerRows.filter(r => r.role.trim() && r.username.trim());
                                        if (valid.length === 0) throw new Error("Kamida bitta imzolovchi kiriting.");
                                        await db.setProtocolSigners(protocol.id, valid, actingUsername);
                                        await db.sendProtocolForSignature(protocol.id, actingUsername);
                                    }, "Bayonnoma imzolashga yuborildi.")}
                                >
                                    Mas'ullarga yuborish
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {signers.map(s => (
                                <div key={s.id} className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="font-semibold text-gray-700 min-w-[150px]">{s.role}</span>
                                    <span className="text-gray-500">{s.username}</span>
                                    {s.status === 'signed' ? (
                                        <Badge variant="success" size="sm" className="inline-flex items-center gap-1">
                                            <CheckCircle2 size={10} /> Imzolangan
                                            {s.onBehalfOf && <span className="font-normal opacity-80">({s.signedBy} tomonidan)</span>}
                                        </Badge>
                                    ) : (
                                        <>
                                            <Badge variant="default" size="sm">Kutilmoqda</Badge>
                                            {s.username === actingUsername && (
                                                <Button
                                                    variant="primary" size="sm" icon={PenLine}
                                                    disabled={busy === 'sign'}
                                                    onClick={() => run('sign', () => db.signProtocol(protocol.id, actingUsername, actingUsername), 'Imzolandi.')}
                                                >
                                                    Tasdiqlayman
                                                </Button>
                                            )}
                                            {/* VAQTINCHALIK (test rejimi) - jarayonni oxirigacha sinab ko'rish uchun
                                                admin boshqa mas'ul nomidan imzolay oladi. Audit bunday imzoni
                                                ALOHIDA ko'rsatadi: kimga tegishli va kim qo'ygani yoziladi. */}
                                            {isAdmin && s.username !== actingUsername && (
                                                <button
                                                    type="button"
                                                    disabled={busy === 'sign'}
                                                    onClick={() => run('sign', () => db.signProtocol(protocol.id, s.username, actingUsername), `${s.username} nomidan imzolandi (test).`)}
                                                    className="px-2 py-1 text-[10px] font-bold text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50"
                                                >
                                                    Test: nomidan imzolash
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            ))}
                            {isAdmin && signers.some(s => s.status !== 'signed') && (
                                <div className="pt-2">
                                    <button
                                        type="button"
                                        disabled={busy === 'signall'}
                                        onClick={() => run('signall', async () => {
                                            for (const s of signers.filter(x => x.status !== 'signed')) {
                                                await db.signProtocol(protocol.id, s.username, actingUsername);
                                            }
                                        }, 'Barcha imzolar test rejimida qo\'yildi.')}
                                        className="px-3 py-1.5 text-[11px] font-bold text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50"
                                    >
                                        {busy === 'signall' ? 'Imzolanmoqda...' : 'Test: barchasini imzolash'}
                                    </button>
                                    <p className="text-[10px] text-amber-600 mt-1">
                                        Vaqtinchalik sinov imkoniyati — har bir imzo auditda "kim nomidan, kim qo'ygani" bilan yoziladi.
                                    </p>
                                </div>
                            )}
                            <p className="text-[11px] text-gray-400 pt-1">
                                Bu ichki tizim tasdig'i. Rasmiy elektron raqamli imzo (E-IMZO) keyinchalik shu joyga ulanadi.
                            </p>
                        </div>
                    )}
                </Step>
            )}

            {/* 4. Taqdirlash */}
            {protocol && (
                <Step index={4} title="Taqdirlash" done={issuedDocs.length > 0} active={isApproved && issuedDocs.length === 0}>
                    {!isApproved ? (
                        <p className="text-xs text-gray-400">
                            Bayonnoma tasdiqlangandan keyin ochiladi. Tasdiqlanmagan natija asosida rasmiy hujjat berilmaydi.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {!preview && draftDocs.length === 0 && issuedDocs.length === 0 && (
                                <div className="space-y-3">
                                    {/* Qisqa sozlamalar: kimga qaysi hujjat va nechtasiga. Shu asosda
                                        taqdirlanuvchilar ro'yxati hisoblanadi. */}
                                    <div className="p-3 bg-white border border-gray-200 rounded-xl space-y-2.5">
                                        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                                            Taqdirlash sozlamalari
                                        </p>

                                        {activityType === 'competition' && (
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                {[1, 2, 3].map(place => (
                                                    <div key={place}>
                                                        <label className={miniLabel}>{place}-o'rin</label>
                                                        <select
                                                            value={awardCfg.places?.[place] || ''}
                                                            onChange={e => setCfg({ places: { ...awardCfg.places, [place]: e.target.value } })}
                                                            className={miniSelect}
                                                        >
                                                            <option value="">Berilmasin</option>
                                                            {DOCUMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                                        </select>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                            <div>
                                                <label className={miniLabel}>Faol ishtirokchilar (Top N)</label>
                                                <input
                                                    type="number" min={0}
                                                    value={awardCfg.topActive?.count ?? 0}
                                                    onChange={e => setCfg({ topActive: { ...awardCfg.topActive, count: Number(e.target.value) || 0 } })}
                                                    className={miniSelect}
                                                />
                                            </div>
                                            <div className="sm:col-span-2">
                                                <label className={miniLabel}>Ularga beriladigan hujjat</label>
                                                <select
                                                    value={awardCfg.topActive?.documentType || ''}
                                                    onChange={e => setCfg({ topActive: { ...awardCfg.topActive, documentType: e.target.value } })}
                                                    className={miniSelect}
                                                >
                                                    <option value="">Berilmasin</option>
                                                    {DOCUMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <div>
                                                <label className={miniLabel}>Qolgan ishtirokchilar</label>
                                                <select value={awardCfg.participants || ''} onChange={e => setCfg({ participants: e.target.value })} className={miniSelect}>
                                                    <option value="">Berilmasin</option>
                                                    {DOCUMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className={miniLabel}>Hakamlar</label>
                                                <select value={awardCfg.judges || ''} onChange={e => setCfg({ judges: e.target.value })} className={miniSelect}>
                                                    <option value="">Berilmasin</option>
                                                    {DOCUMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Volontyor va tashkilotchilar klub a'zoligidagi real rollardan olinadi. */}
                                        {[
                                            { key: 'volunteers', label: 'Volontyorlar' },
                                            { key: 'organizers', label: 'Tashkilotchilar' }
                                        ].map(({ key, label }) => (
                                            <div key={key} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                <div>
                                                    <label className={miniLabel}>{label} (nechta)</label>
                                                    <input
                                                        type="number" min={0}
                                                        value={awardCfg[key]?.count ?? 0}
                                                        onChange={e => setCfg({ [key]: { ...awardCfg[key], count: Number(e.target.value) || 0 } })}
                                                        className={miniSelect}
                                                    />
                                                </div>
                                                <div className="sm:col-span-2">
                                                    <label className={miniLabel}>Hujjat turi</label>
                                                    <select
                                                        value={awardCfg[key]?.documentType || ''}
                                                        onChange={e => setCfg({ [key]: { ...awardCfg[key], documentType: e.target.value } })}
                                                        className={miniSelect}
                                                    >
                                                        <option value="">Berilmasin</option>
                                                        {DOCUMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        ))}

                                        {activity.type === 'team' && (
                                            <div>
                                                <label className={miniLabel}>Jamoaviy hujjat kimga yoziladi</label>
                                                <select
                                                    value={awardCfg.teamAwardMode}
                                                    onChange={e => setCfg({ teamAwardMode: e.target.value })}
                                                    className={miniSelect}
                                                >
                                                    <option value="team">Jamoa nomiga bitta hujjat (tarkibi ichida)</option>
                                                    <option value="members">Har bir a'zoga alohida hujjat</option>
                                                </select>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                            <div>
                                                <label className={miniLabel}>Hujjat dizayni</label>
                                                <select value={awardCfg.templateId} onChange={e => setCfg({ templateId: e.target.value })} className={miniSelect}>
                                                    {CERTIFICATE_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                                </select>
                                            </div>
                                            <label className="flex items-end gap-2 text-xs text-gray-600 pb-1.5">
                                                <input
                                                    type="checkbox"
                                                    checked={!!awardCfg.attendedOnly}
                                                    onChange={e => setCfg({ attendedOnly: e.target.checked })}
                                                />
                                                Faqat qatnashganlarga berilsin
                                            </label>
                                        </div>
                                    </div>

                                    <Button
                                        variant="outline" size="sm" icon={Award}
                                        disabled={busy === 'prev'}
                                        onClick={() => run('prev', async () => {
                                            const list = await db.previewAwardRecipients(protocol.id, awardCfg);
                                            setPreview(list);
                                        })}
                                    >
                                        {busy === 'prev' ? 'Hisoblanmoqda...' : 'Taqdirlashni shakllantirish'}
                                    </Button>
                                </div>
                            )}

                            {preview && draftDocs.length === 0 && issuedDocs.length === 0 && (
                                <div className="space-y-2">
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(preview.reduce((acc, r) => {
                                            acc[r.documentType] = (acc[r.documentType] || 0) + 1;
                                            return acc;
                                        }, {})).map(([type, count]) => (
                                            <span key={type} className="px-2.5 py-1 rounded-lg bg-white border border-gray-200 text-[11px] font-bold text-gray-600">
                                                {getDocumentTypeLabel(type)}: {count} ta
                                            </span>
                                        ))}
                                    </div>

                                    {/* Qoidalar TAKLIF beradi, oxirgi qaror adminda: har bir satrda turini
                                        o'zgartirish yoki umuman ro'yxatdan chiqarib tashlash mumkin. */}
                                    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                                        <div className="px-3 py-2 bg-slate-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-[11px] font-bold text-gray-600">
                                                Kimga qaysi hujjat ({preview.length} ta)
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setShowAllPreview(v => !v)}
                                                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                                            >
                                                {showAllPreview ? 'Qisqartirish' : `Hammasini ko'rsatish`}
                                            </button>
                                        </div>
                                        <div className="max-h-64 overflow-auto divide-y">
                                            {(showAllPreview ? preview : preview.slice(0, 25)).map((r, idx) => (
                                                <div key={`${r.recipientId}-${idx}`} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                                                    <span className="text-xs font-semibold text-gray-800 flex-1 min-w-[140px] truncate">
                                                        {r.recipientName}
                                                        {r.place && <span className="text-amber-600 font-bold ml-1.5">{r.place}-o'rin</span>}
                                                        {r.role === 'judge' && <span className="text-gray-400 ml-1.5">hakam</span>}
                                                    </span>
                                                    <select
                                                        value={r.documentType}
                                                        onChange={e => setPreview(list => list.map((x, i) =>
                                                            i === (showAllPreview ? idx : idx) && x.recipientId === r.recipientId
                                                                ? { ...x, documentType: e.target.value } : x))}
                                                        className="px-2 py-1 border border-gray-200 rounded-lg text-[11px] bg-white"
                                                    >
                                                        {DOCUMENT_TYPES.map(t => (
                                                            <option key={t.id} value={t.id}>{t.label}</option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        type="button"
                                                        title="Ro'yxatdan chiqarish"
                                                        onClick={() => setPreview(list => list.filter((_, i) => i !== idx))}
                                                        className="text-[11px] font-semibold text-gray-400 hover:text-red-500"
                                                    >
                                                        olib tashlash
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        {!showAllPreview && preview.length > 25 && (
                                            <p className="px-3 py-1.5 text-[11px] text-gray-400 border-t border-gray-100">
                                                Yana {preview.length - 25} ta...
                                            </p>
                                        )}
                                    </div>

                                    <p className="text-[11px] text-gray-400">
                                        Jamoa g'olib bo'lsa, a'zolarning har biriga alohida hujjat beriladi.
                                    </p>
                                    <Button
                                        variant="primary" size="sm" icon={Award}
                                        disabled={busy === 'batch' || preview.length === 0}
                                        onClick={() => run('batch', async () => {
                                            await db.createAwardBatch(protocol.id, preview, actingUsername, awardCfg.templateId);
                                            setPreview(null);
                                        }, 'Hujjatlar qoralama sifatida yaratildi.')}
                                    >
                                        {busy === 'batch' ? 'Yaratilmoqda...' : `${preview.length} ta hujjatni yaratish`}
                                    </Button>
                                </div>
                            )}

                            {draftDocs.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs text-gray-600">
                                        <span className="font-bold">{draftDocs.length} ta</span> hujjat qoralama holatida. Berilgandan keyin ular talabalar kabinetiga tushadi va QR orqali tekshiriladigan bo'ladi.
                                    </p>
                                    <Button
                                        variant="primary" size="sm" icon={ShieldCheck}
                                        className="bg-emerald-600 hover:bg-emerald-700"
                                        disabled={busy === 'issue'}
                                        onClick={() => run('issue', async () => {
                                            const batch = batches.find(b => b.status !== 'issued');
                                            if (!batch) throw new Error("Beriladigan to'plam topilmadi.");
                                            const n = await db.issueDocuments(batch.id, actingUsername);
                                            setMessage(`${n} ta hujjat berildi va reestrga qo'shildi.`);
                                        })}
                                    >
                                        {busy === 'issue' ? 'Berilmoqda...' : 'Hujjatlarni berish'}
                                    </Button>
                                </div>
                            )}

                            {issuedDocs.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="success" size="sm" className="inline-flex items-center gap-1">
                                        <CheckCircle2 size={11} /> {issuedDocs.length} ta hujjat berilgan
                                    </Badge>
                                    <span className="text-[11px] text-gray-400">
                                        {new Set(issuedDocs.map(d => d.recipientId)).size} nafar unikal oluvchi
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </Step>
            )}

            {/* 5. Berilgan hujjatlar */}
            {issuedDocs.length > 0 && (
                <div className="border border-gray-200 rounded-2xl overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-gray-200 flex items-center gap-1.5">
                        <Users size={14} className="text-gray-400" />
                        <span className="text-xs font-bold text-gray-600">Berilgan hujjatlar</span>
                    </div>
                    <div className="max-h-72 overflow-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-white text-gray-400 uppercase sticky top-0">
                                <tr>
                                    <th className="p-2">Oluvchi</th>
                                    <th className="p-2">Hujjat</th>
                                    <th className="p-2">Raqam</th>
                                    <th className="p-2 text-center">Holat</th>
                                    <th className="p-2"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {issuedDocs.map(d => (
                                    <tr key={d.id} className="hover:bg-slate-50">
                                        <td className="p-2 font-semibold text-gray-800">
                                            {d.officialName || d.recipientName}
                                        </td>
                                        <td className="p-2 text-gray-600">{getDocumentTypeLabel(d.documentType)}</td>
                                        <td className="p-2 font-mono text-[10px] text-gray-500">{d.registrationNumber}</td>
                                        <td className="p-2 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${DOCUMENT_STATUS[d.status]?.tone}`}>
                                                {DOCUMENT_STATUS[d.status]?.label}
                                            </span>
                                        </td>
                                        <td className="p-2 text-right">
                                            <button
                                                type="button"
                                                onClick={() => setDocView(d)}
                                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg"
                                            >
                                                <Eye size={12} /> Ko'rish
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Bayonnomani ko'rish + PDF */}
            <Modal
                isOpen={!!protocolView}
                onClose={() => setProtocolView(null)}
                title={`Bayonnoma — ${protocol?.registrationNumber || ''}`}
                size="xl"
            >
                {protocolView && protocol && (
                    <ProtocolDocument protocol={protocol} participants={protocolView} signers={signers} />
                )}
            </Modal>

            {/* Berilgan hujjatni ko'rish + PDF */}
            <Modal
                isOpen={!!docView}
                onClose={() => setDocView(null)}
                title={docView ? getDocumentTypeLabel(docView.documentType) : ''}
                size="xl"
            >
                {docView && (
                    <CertificateGenerator
                        heading={getDocumentTypeLabel(docView.documentType)}
                        studentName={docView.officialName || docView.recipientName}
                        clubName={docView.activityName}
                        role={docView.teamName ? `${docView.teamName} jamoasi a'zosi` : 'Ishtirokchi'}
                        placement={docView.place ? `${docView.place}-o'rin` : null}
                        issueDate={(docView.issuedAt || docView.createdAt || '').slice(0, 10)}
                        certificateId={docView.verificationToken}
                        registrationNumber={docView.registrationNumber}
                        verifyUrl={`${window.location.origin}/verify/${docView.verificationToken}`}
                        revoked={docView.status === 'revoked'}
                        templateId={docView.templateId || 'classic'}
                        members={docView.members || []}
                    />
                )}
            </Modal>

            {/* 6. Audit */}
            {auditLogs.length > 0 && (
                <div>
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Faoliyat tarixi</p>
                    <div className="space-y-1">
                        {auditLogs.slice(0, 8).map(l => (
                            <p key={l.id} className="text-[11px] text-gray-500">
                                <span className="text-gray-400">{new Date(l.createdAt).toLocaleString('uz-UZ')}</span>
                                {' — '}<span className="font-semibold">{l.actor || 'Tizim'}</span>
                                {' · '}{l.action}
                            </p>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ActivityFinalizationTab;
