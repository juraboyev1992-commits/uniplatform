import React, { useMemo, useRef, useState } from 'react';
import { Upload, FileText, Trash2, Eye, Pencil, RefreshCw, ScrollText, CalendarClock, AlertTriangle, Loader2 } from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Modal from '../common/Modal';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { TOURNAMENT_FILE_UPLOAD } from '../../constants';
import { REGULATION_STATUS_LABELS } from '../../config/clubRegistration';
import DocumentReaderModal from './DocumentReaderModal';
import ClubRegulationEditor from './ClubRegulationEditor';

// "Klub hujjatlari" - JADVAL. Uch xil manba BITTA ro'yxatga birlashtiriladi:
//   1. Tuzilgan nizom (band-band matn, `club_regulations`)
//   2. Ariza bosqichida yozilgan yillik reja (matn, arizaning o'zidan)
//   3. Qo'lda yuklangan haqiqiy fayllar (`club_documents`, endi HAQIQIY
//      ombor - ilgari faqat nom/hajm saqlanardi, fayl mazmuni yo'q edi)
//
// KO'ZCHA ikkitа xil ishlaydi:
//   - Nizom/yillik reja - platformaning O'Z matni, fayl emas. Shu yerning
//     o'zida "o'qiydigan" ko'rinishda ochiladi (DocumentReaderModal).
//   - Yuklangan fayl - HAQIQIY fayl, imzolangan havola orqali yangi tabda
//     ochiladi (brauzerning o'z PDF/rasm ko'ruvchisi - "pdf holda ko'rinish").
const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const ClubDocumentsTab = ({ club, documents, canManage, isAdmin = false, onRefresh }) => {
    const { user } = useAuth();
    const [fileError, setFileError] = useState('');
    const [busy, setBusy] = useState(false);
    const [reader, setReader] = useState(null); // { title, subtitle, sections } | { title, subtitle, text }
    const [editingRegulation, setEditingRegulation] = useState(false);
    // O'chirish endi native `window.confirm` emas - ba'zi muhitlarda
    // (embedded webview) u umuman ko'rinmasligi yoki jimgina rad
    // etilishi mumkin. O'zimizning oynamiz doim ko'rinadi.
    const [confirmDoc, setConfirmDoc] = useState(null);
    const fileInputRef = useRef(null);
    const pendingCategoryRef = useRef('boshqa');

    const structuredRegulation = db.getClubRegulation(club.id);
    const foundingFields = db.getFoundingApplicationFields(club.id);

    const uploadedFiles = documents.filter(d => d.filePath);

    const rows = useMemo(() => {
        const list = [];
        if (structuredRegulation) {
            list.push({
                key: 'regulation', type: 'regulation', title: 'Klub nizomi', typeLabel: 'Nizom',
                status: REGULATION_STATUS_LABELS[structuredRegulation.status] || structuredRegulation.status,
                date: structuredRegulation.updatedAt, sections: structuredRegulation.sections,
                history: structuredRegulation.history || [],
            });
        }
        if (foundingFields?.annualPlan) {
            list.push({
                key: 'annualPlan', type: 'text', title: 'Yillik ish reja', typeLabel: 'Yillik reja',
                status: '—', date: club.createdAt, text: foundingFields.annualPlan,
            });
        }
        uploadedFiles.forEach(d => {
            list.push({
                key: d.id, type: 'file', title: d.title || d.fileName,
                typeLabel: d.category === 'nizom' ? 'Nizom fayli' : 'Boshqa hujjat',
                status: d.sizeLabel || '—', date: d.uploadedAt, doc: d,
            });
        });
        return list;
    }, [structuredRegulation, foundingFields, uploadedFiles, club.createdAt]);

    const validateFile = (file) => {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!TOURNAMENT_FILE_UPLOAD.ALLOWED_EXTENSIONS.includes(ext)) {
            return `Ruxsat etilmagan format. Qabul qilinadi: ${TOURNAMENT_FILE_UPLOAD.ALLOWED_EXTENSIONS.join(', ')}`;
        }
        if (file.size > TOURNAMENT_FILE_UPLOAD.MAX_SIZE_MB * 1024 * 1024) {
            return `Fayl hajmi ${TOURNAMENT_FILE_UPLOAD.MAX_SIZE_MB} MB dan oshmasligi kerak.`;
        }
        return '';
    };

    const handlePick = (category) => {
        pendingCategoryRef.current = category;
        fileInputRef.current?.click();
    };

    const handleUpload = async (file) => {
        setFileError('');
        if (!file) return;
        const err = validateFile(file);
        if (err) { setFileError(err); return; }
        setBusy(true);
        try {
            await db.uploadClubDocument({
                clubId: club.id, category: pendingCategoryRef.current, title: file.name, file,
                uploadedByUserId: user.username,
            });
            onRefresh();
        } catch (e) {
            setFileError(e?.message || 'Yuklashda xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    const confirmRemove = async () => {
        if (!confirmDoc) return;
        setBusy(true);
        try {
            await db.removeClubDocument({ clubId: club.id, documentId: confirmDoc.id });
            setConfirmDoc(null);
            onRefresh();
        } catch (e) {
            setFileError(e?.message || "O'chirishda xatolik.");
        } finally {
            setBusy(false);
        }
    };

    const openRow = async (row) => {
        if (row.type === 'regulation') {
            setReader({ title: row.title, subtitle: `Holati: ${row.status}`, sections: row.sections, history: row.history });
        } else if (row.type === 'text') {
            setReader({ title: row.title, subtitle: null, text: row.text });
        } else {
            const url = await db.getClubDocumentUrl(row.doc.filePath);
            if (url) window.open(url, '_blank', 'noopener');
            else setFileError("Faylni ochib bo'lmadi.");
        }
    };

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Klub hujjatlari</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Nizom, yillik reja va boshqa rasmiy hujjatlar</p>
                </div>
                {canManage && (
                    <div className="flex gap-2">
                        <button
                            type="button" onClick={() => handlePick('nizom')} disabled={busy}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                        >
                            <RefreshCw size={13} /> Nizom faylini almashtirish
                        </button>
                        <button
                            type="button" onClick={() => handlePick('boshqa')} disabled={busy}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
                        >
                            <Upload size={13} /> Hujjat qo'shish
                        </button>
                    </div>
                )}
                <input
                    ref={fileInputRef} type="file" className="hidden"
                    accept={TOURNAMENT_FILE_UPLOAD.ALLOWED_EXTENSIONS.join(',')}
                    onChange={e => handleUpload(e.target.files?.[0])}
                />
            </div>

            {fileError && <p className="text-sm text-red-600">{fileError}</p>}

            {rows.length === 0 ? (
                <div className="text-center py-10 text-sm text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                    Hozircha klub hujjati yo'q
                </div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-gray-700">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900/40 text-left">
                                <th className="px-4 py-2.5 text-[11px] font-bold text-gray-400 uppercase">Nomi</th>
                                <th className="px-4 py-2.5 text-[11px] font-bold text-gray-400 uppercase">Turi</th>
                                <th className="px-4 py-2.5 text-[11px] font-bold text-gray-400 uppercase">Holati / Hajmi</th>
                                <th className="px-4 py-2.5 text-[11px] font-bold text-gray-400 uppercase">Sana</th>
                                <th className="px-4 py-2.5 text-[11px] font-bold text-gray-400 uppercase text-right">Amallar</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                            {rows.map(row => (
                                <tr key={row.key} className="bg-white dark:bg-gray-800">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            {row.type === 'file'
                                                ? <FileText size={15} className="text-gray-400 shrink-0" />
                                                : <ScrollText size={15} className="text-indigo-500 shrink-0" />}
                                            <span className="font-semibold text-gray-800 dark:text-gray-200 truncate">{row.title}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Badge variant={row.type === 'file' ? 'default' : 'info'} size="sm">{row.typeLabel}</Badge>
                                    </td>
                                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{row.status}</td>
                                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                                        <span className="flex items-center gap-1"><CalendarClock size={12} /> {formatDate(row.date)}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            {/* TAHRIRLASH - ko'zchadan OLDIN, faqat nizom qatorida va
                                                boshqara oladigan odamga. Bosilganda ClubRegulationEditor
                                                oynada ochiladi - tasdiqlangan bo'lsa ham (admin uchun),
                                                izohi ClubRegulationEditor.jsx da. */}
                                            {canManage && row.type === 'regulation' && (
                                                <button
                                                    type="button" onClick={() => setEditingRegulation(true)}
                                                    title="Tahrirlash"
                                                    className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                            )}
                                            <button
                                                type="button" onClick={() => openRow(row)}
                                                title="Ko'rish"
                                                className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                                            >
                                                <Eye size={16} />
                                            </button>
                                            {canManage && row.type === 'file' && (
                                                <button
                                                    type="button" onClick={() => setConfirmDoc(row.doc)}
                                                    title="O'chirish"
                                                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {reader && (
                <DocumentReaderModal
                    isOpen={!!reader} onClose={() => setReader(null)}
                    title={reader.title} subtitle={reader.subtitle}
                    sections={reader.sections} text={reader.text} history={reader.history} isAdmin={isAdmin}
                />
            )}

            {editingRegulation && (
                <Modal isOpen={editingRegulation} onClose={() => setEditingRegulation(false)} title="Klub nizomini tahrirlash">
                    <ClubRegulationEditor clubId={club.id} canEdit={canManage} canApprove={isAdmin} />
                </Modal>
            )}

            <Modal isOpen={!!confirmDoc} onClose={() => setConfirmDoc(null)} title="Hujjatni o'chirish">
                <div className="space-y-4">
                    <p className="flex items-start gap-2 text-sm text-gray-700">
                        <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                        <span>
                            <b>"{confirmDoc?.title}"</b> hujjatini o'chirmoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi.
                        </span>
                    </p>
                    <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => setConfirmDoc(null)} disabled={busy}>
                            Bekor qilish
                        </Button>
                        <Button variant="danger" className="flex-1" onClick={confirmRemove} disabled={busy}>
                            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Ha, o'chirish
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ClubDocumentsTab;
