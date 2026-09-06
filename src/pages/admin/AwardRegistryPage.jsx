import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Search, Download, ShieldX, ExternalLink, Eye, Gift, GraduationCap, Layers } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import CertificateGenerator from '../../components/common/CertificateGenerator';
import AwardAnalyticsTab from '../../components/admin/AwardAnalyticsTab';
import { db } from '../../services/db';
import { useTabParam } from '../../hooks/useTabParam';
import { useAuth } from '../../contexts/AuthContext';
import { exportRowsToExcel } from '../../utils/exportToExcel';
import {
    DOCUMENT_TYPES, DOCUMENT_GROUPS, DOCUMENT_STATUS,
    getDocumentType, getDocumentTypeLabel, PROTOCOL_STATUS
} from '../../config/documents';

// Universitetdagi barcha rasmiy rag'bat hujjatlarining yagona bazasi.
// MUHIM: hujjatlar soni va UNIKAL talabalar soni alohida ko'rsatiladi - bitta talaba 10 ta sertifikat
// olgan bo'lsa, bu qamrovni sun'iy oshirmasligi kerak.
// "Jamoaviy / Yakka" ustunidagi qiymat. Hujjat faqat ishtirokchilarga emas, hakam, volontyor va
// tashkilotchilarga ham beriladi - ular "yakka ishtirokchi" emas, shuning uchun roli yoziladi.
const ROLE_LABELS = { judge: 'Hakam', volunteer: 'Volontyor', organizer: 'Tashkilotchi' };
const participationLabel = (d) => {
    if (d.role && ROLE_LABELS[d.role]) return ROLE_LABELS[d.role];
    if (d.teamName) return d.teamName;
    return 'Yakka ishtirokchi';
};

const StatCard = ({ label, value, hint }) => (
    <Card className="p-4">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-2xl font-black text-gray-900 mt-0.5">{value}</p>
        {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </Card>
);

const AwardRegistryPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab] = useTabParam(['registry', 'scholarships', 'clubs', 'incentives', 'prizes', 'analytics'], 'registry');
    const [version, setVersion] = useState(0);
    const [filters, setFilters] = useState({ search: '', group: '', documentType: '', status: '', faculty: '' });
    const [detail, setDetail] = useState(null);
    const [previewDoc, setPreviewDoc] = useState(null);
    const [revokeReason, setRevokeReason] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const registry = useMemo(() => db.getAwardRegistry(filters), [filters, version]);
    const protocols = useMemo(() => db.getProtocols(), [version]);

    const faculties = useMemo(
        () => [...new Set(db.getDocuments().map(d => d.faculty).filter(Boolean))].sort(),
        [version]
    );

    const counts = useMemo(() => {
        const all = db.getDocuments();
        const byGroup = (g) => all.filter(d => getDocumentType(d.documentType)?.group === g && d.status === 'issued').length;
        return {
            issued: all.filter(d => d.status === 'issued').length,
            diploma: byGroup('diploma'),
            certificate: byGroup('certificate'),
            thanks: byGroup('thanks'),
            revoked: all.filter(d => d.status === 'revoked').length,
            uniqueStudents: new Set(all.filter(d => d.status === 'issued').map(d => d.recipientId)).size,
            protocols: protocols.length,
            pendingProtocols: protocols.filter(p => p.status === 'pending_signature').length
        };
    }, [version, protocols]);

    const set = (patch) => setFilters(f => ({ ...f, ...patch }));

    const handleRevoke = async () => {
        setError(''); setBusy(true);
        try {
            await db.revokeDocument(detail.id, revokeReason, user?.username || 'admin');
            setRevokeReason('');
            setDetail(null);
            setVersion(v => v + 1);
        } catch (err) {
            setError(err?.message || "Bekor qilishda xatolik yuz berdi.");
        } finally {
            setBusy(false);
        }
    };

    const exportCsv = () => {
        const head = ['№', 'F.I.Sh.', 'Jamoaviy/Yakka', 'Tadbir', 'Hujjat', 'Raqam', 'Sana', 'Holat'];
        const rows = registry.rows.map((d, i) => [
            i + 1, d.officialName || d.recipientName || '', participationLabel(d), d.activityName || '',
            getDocumentTypeLabel(d.documentType), d.registrationNumber,
            (d.issuedAt || d.createdAt || '').slice(0, 10),
            DOCUMENT_STATUS[d.status]?.label || d.status
        ]);
        const csv = [head, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `taqdirlanganlar_reestri_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    return (
        <div className="space-y-6 pb-10">
            <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                        <Trophy className="w-7 h-7" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black">Taqdirlanganlar reestri</h1>
                        <p className="text-white/70 text-sm mt-1">
                            Universitetda berilgan barcha rasmiy diplom, sertifikat va tashakkurnomalar
                        </p>
                    </div>
                </div>
            </div>

            {/* Reestr / Tahlil.
                Reestr - qidirish va hujjat topish. Tahlil - reestrdan savol
                so'rash: qaysi daraja, qaysi fakultet, qanday dinamika. Ilgari
                ikkinchisi umuman yo'q edi. */}
            <div className="flex border-b border-gray-200 gap-6 overflow-x-auto">
                {[
                    { id: 'registry', label: 'Diplom / Sertifikat' },
                    { id: 'scholarships', label: 'Stipendiya / Grant' },
                    { id: 'clubs', label: 'Klublar reestri' },
                    { id: 'incentives', label: "Rag'bat puli" },
                    { id: 'prizes', label: 'Mukofotlar' },
                    { id: 'analytics', label: 'Tahlil' },
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`pb-3 font-bold text-sm border-b-2 transition-all whitespace-nowrap ${
                            tab === t.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'analytics' && <AwardAnalyticsTab />}
            {tab === 'scholarships' && <ScholarshipRecipientsTab />}
            {tab === 'clubs' && <ClubCertificatesTab />}
            {tab === 'incentives' && <RecognitionRegistryTab kind="incentive" onManage={() => navigate('/admin/incentive-awards')} />}
            {tab === 'prizes' && <RecognitionRegistryTab kind="prize" onManage={() => navigate('/admin/incentive-awards')} />}

            {tab === 'registry' && (
            <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Berilgan hujjatlar" value={counts.issued} hint={`${counts.uniqueStudents} nafar unikal talaba`} />
                <StatCard label="Diplomlar" value={counts.diploma} />
                <StatCard label="Sertifikatlar" value={counts.certificate} />
                <StatCard label="Tashakkurnomalar" value={counts.thanks} />
                <StatCard label="Bayonnomalar" value={counts.protocols} hint={`${counts.pendingProtocols} tasi imzo kutmoqda`} />
                <StatCard label="Bekor qilingan" value={counts.revoked} />
            </div>

            <Card className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            value={filters.search}
                            onChange={e => set({ search: e.target.value })}
                            placeholder="F.I.Sh., hujjat raqami yoki tadbir nomi..."
                            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm"
                        />
                    </div>
                    <select value={filters.group} onChange={e => set({ group: e.target.value, documentType: '' })}
                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
                        <option value="">Barcha turlar</option>
                        {DOCUMENT_GROUPS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                    </select>
                    <select value={filters.documentType} onChange={e => set({ documentType: e.target.value })}
                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
                        <option value="">Aniq hujjat turi</option>
                        {DOCUMENT_TYPES.filter(t => !filters.group || t.group === filters.group)
                            .map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    <select value={filters.status} onChange={e => set({ status: e.target.value })}
                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
                        <option value="">Barcha holatlar</option>
                        {Object.entries(DOCUMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    {faculties.length > 0 && (
                        <select value={filters.faculty} onChange={e => set({ faculty: e.target.value })}
                            className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
                            <option value="">Barcha fakultetlar</option>
                            {faculties.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    )}
                    <Button variant="outline" size="sm" icon={Download} onClick={exportCsv}>CSV</Button>
                </div>
                <p className="text-[11px] text-gray-400 mt-2">
                    Topildi: <span className="font-bold text-gray-600">{registry.total}</span> ta hujjat,{' '}
                    <span className="font-bold text-gray-600">{registry.uniqueRecipients}</span> nafar unikal oluvchi.
                </p>
            </Card>

            <Card padding={false}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-gray-400 uppercase">
                            <tr>
                                <th className="p-3 w-10">№</th>
                                <th className="p-3">F.I.Sh.</th>
                                <th className="p-3">Jamoaviy / Yakka</th>
                                <th className="p-3">Tadbir</th>
                                <th className="p-3">Hujjat</th>
                                <th className="p-3">Raqam</th>
                                <th className="p-3">Sana</th>
                                <th className="p-3 text-center">Holat</th>
                                <th className="p-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {registry.rows.length === 0 ? (
                                <tr><td colSpan={9} className="p-10 text-center text-gray-400">Hujjat topilmadi.</td></tr>
                            ) : registry.rows.map((d, i) => (
                                <tr key={d.id} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => { setDetail(d); setError(''); }}>
                                    <td className="p-3 text-gray-400 font-bold">{i + 1}</td>
                                    <td className="p-3 font-semibold text-gray-800">
                                        {d.officialName || d.recipientName}
                                    </td>
                                    <td className="p-3 text-gray-600">
                                        {ROLE_LABELS[d.role]
                                            ? <span className="font-semibold text-amber-700">{ROLE_LABELS[d.role]}</span>
                                            : d.teamName
                                                ? <span className="font-semibold text-indigo-700">{d.teamName}</span>
                                                : <span className="text-gray-400">Yakka ishtirokchi</span>}
                                    </td>
                                    <td className="p-3 text-gray-600">{d.activityName}</td>
                                    <td className="p-3 text-gray-600">{getDocumentTypeLabel(d.documentType)}</td>
                                    <td className="p-3 font-mono text-[10px] text-gray-500">{d.registrationNumber}</td>
                                    <td className="p-3 text-gray-500">{(d.issuedAt || d.createdAt || '').slice(0, 10)}</td>
                                    <td className="p-3 text-center">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${DOCUMENT_STATUS[d.status]?.tone}`}>
                                            {DOCUMENT_STATUS[d.status]?.label}
                                        </span>
                                    </td>
                                    <td className="p-3 text-center">
                                        {/* Qator bosilsa ma'lumotlar oynasi ochiladi, ko'zcha esa hujjatning
                                            o'zini ko'rsatadi - shuning uchun bosilish tarqalishi to'xtatiladi. */}
                                        <button
                                            type="button"
                                            title="Hujjat ko'rinishini ochish"
                                            onClick={(e) => { e.stopPropagation(); setPreviewDoc(d); }}
                                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                                        >
                                            <Eye size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
            </>
            )}

            {/* Hujjatning o'zi - PDF yuklab olish va ishlaydigan QR bilan. */}
            <Modal
                isOpen={!!previewDoc}
                onClose={() => setPreviewDoc(null)}
                title={previewDoc ? getDocumentTypeLabel(previewDoc.documentType) : ''}
                size="xl"
            >
                {previewDoc && (
                    <CertificateGenerator
                        heading={getDocumentTypeLabel(previewDoc.documentType)}
                        studentName={previewDoc.officialName || previewDoc.recipientName}
                        clubName={previewDoc.activityName}
                        role={previewDoc.teamName
                            ? `${previewDoc.teamName} jamoasi`
                            : (ROLE_LABELS[previewDoc.role] || 'Ishtirokchi')}
                        placement={previewDoc.place ? `${previewDoc.place}-o'rin` : null}
                        issueDate={(previewDoc.issuedAt || previewDoc.createdAt || '').slice(0, 10)}
                        certificateId={previewDoc.verificationToken}
                        registrationNumber={previewDoc.registrationNumber}
                        verifyUrl={`${window.location.origin}/verify/${previewDoc.verificationToken}`}
                        revoked={previewDoc.status === 'revoked'}
                        templateId={previewDoc.templateId || 'classic'}
                        members={previewDoc.members || []}
                    />
                )}
            </Modal>

            <Modal isOpen={!!detail} onClose={() => setDetail(null)} title="Hujjat ma'lumotlari" size="md">
                {detail && (
                    <div className="space-y-3">
                        {[
                            ['Oluvchi', detail.recipientName],
                            ['Hujjat turi', getDocumentTypeLabel(detail.documentType)],
                            ['Ro\'yxatga olish raqami', detail.registrationNumber],
                            ['Tadbir / musobaqa', detail.activityName],
                            ['Natija', detail.place ? `${detail.place}-o'rin` : detail.achievement],
                            ['Ishtirok shakli', ROLE_LABELS[detail.role]
                                || (detail.teamName ? `Jamoaviy — ${detail.teamName}` : 'Yakka ishtirokchi')],
                            ['Fakultet', detail.faculty],
                            ['Bayonnoma', detail.protocolNumber],
                            ['Berilgan sana', (detail.issuedAt || '').slice(0, 10)],
                            ['Bekor qilingan', detail.revokedAt ? `${detail.revokedAt.slice(0, 10)} — ${detail.revokedReason}` : null]
                        ].filter(([, v]) => v).map(([k, v]) => (
                            <div key={k} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-1.5 border-b border-gray-100 last:border-0">
                                <span className="text-[11px] font-bold text-gray-400 uppercase sm:w-48 shrink-0">{k}</span>
                                <span className="text-sm font-semibold text-gray-800">{v}</span>
                            </div>
                        ))}

                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={() => { setPreviewDoc(detail); setDetail(null); }}
                                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
                            >
                                <Eye size={12} /> Hujjat ko'rinishi
                            </button>
                            <a
                                href={`${window.location.origin}/verify/${detail.verificationToken}`}
                                target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
                            >
                                <ExternalLink size={12} /> Public tekshiruv sahifasi
                            </a>
                        </div>

                        {detail.status === 'issued' && (
                            <div className="pt-3 border-t border-gray-100 space-y-2">
                                <p className="text-[11px] text-gray-500">
                                    Hujjat o'chirilmaydi — faqat bekor qilinadi. Raqami reestrda saqlanib qoladi.
                                </p>
                                <input
                                    value={revokeReason}
                                    onChange={e => setRevokeReason(e.target.value)}
                                    placeholder="Bekor qilish sababi (majburiy)"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
                                />
                                {error && <p className="text-[11px] font-semibold text-red-600">{error}</p>}
                                <Button
                                    variant="danger" size="sm" icon={ShieldX}
                                    disabled={busy || !revokeReason.trim()}
                                    onClick={handleRevoke}
                                >
                                    {busy ? 'Bajarilmoqda...' : 'Hujjatni bekor qilish'}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};

// Yangi tablarning barchasida bir xil qidiruv+fakultet filtr paneli - asosiy
// "Reestr" tabidagi filtr qatori bilan bir xil uslubda (ATAYLAB - tanish tajriba).
const RegistryFilterBar = ({ search, onSearch, searchPlaceholder, faculty, onFaculty, facultyOptions, extra }) => (
    <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    value={search}
                    onChange={e => onSearch(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
            </div>
            {facultyOptions && (
                <select value={faculty} onChange={e => onFaculty(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
                    <option value="">Barcha fakultetlar</option>
                    {facultyOptions.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
            )}
            {extra}
        </div>
    </Card>
);

// --- Stipendiya / Grant oluvchilar - mavjud stipendiya moduli ustidan o'qish (dublikat emas) ---
const ScholarshipRecipientsTab = () => {
    const allRows = useMemo(() => db.getScholarshipRecipients(), []);
    const [search, setSearch] = useState('');
    const [faculty, setFaculty] = useState('');
    const facultyOptions = useMemo(() => [...new Set(allRows.map(r => r.faculty).filter(Boolean))].sort(), [allRows]);
    const rows = useMemo(() => {
        const q = search.trim().toLowerCase();
        return allRows.filter(r =>
            (!q || r.fullName.toLowerCase().includes(q) || (r.grantTitle || '').toLowerCase().includes(q)) &&
            (!faculty || r.faculty === faculty)
        );
    }, [allRows, search, faculty]);
    const exportXlsx = () => exportRowsToExcel(rows.map((r, i) => ({
        '#': i + 1, 'F.I.Sh.': r.fullName, Fakultet: r.faculty || '', Grant: r.grantTitle || '',
        Miqdor: r.amount || '', Sana: (r.approvedAt || '').slice(0, 10),
    })), { sheetName: 'Stipendiya', fileName: `stipendiya_grant_${new Date().toISOString().slice(0, 10)}.xlsx` });

    return (
        <div className="space-y-4">
            <RegistryFilterBar
                search={search} onSearch={setSearch} searchPlaceholder="F.I.Sh. yoki grant nomi..."
                faculty={faculty} onFaculty={setFaculty} facultyOptions={facultyOptions}
            />
            <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">{rows.length} nafar tasdiqlangan stipendiya/grant oluvchi</p>
                <Button variant="outline" size="sm" icon={Download} onClick={exportXlsx}>Excel</Button>
            </div>
            <Card padding={false}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-gray-400 uppercase">
                            <tr>
                                <th className="p-3 w-10">№</th><th className="p-3">F.I.Sh.</th><th className="p-3">Fakultet</th>
                                <th className="p-3">Grant</th><th className="p-3">Miqdor</th><th className="p-3">Sana</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {rows.length === 0 ? (
                                <tr><td colSpan={6} className="p-10 text-center text-gray-400">Tasdiqlangan grant oluvchi topilmadi.</td></tr>
                            ) : rows.map((r, i) => (
                                <tr key={r.id} className="hover:bg-slate-50/70">
                                    <td className="p-3 text-gray-400 font-bold">{i + 1}</td>
                                    <td className="p-3 font-semibold text-gray-800">{r.fullName}</td>
                                    <td className="p-3 text-gray-600">{r.faculty || '—'}</td>
                                    <td className="p-3 text-gray-600">{r.grantTitle || '—'}</td>
                                    <td className="p-3 text-gray-600">{r.amount || '—'}</td>
                                    <td className="p-3 text-gray-500">{(r.approvedAt || '').slice(0, 10)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

// --- Ro'yxatdan o'tgan klublar reestri - mavjud klub ro'yxatga olish moduli ustidan o'qish ---
const ClubCertificatesTab = () => {
    const allRows = useMemo(() => db.getIssuedClubCertificates(), []);
    const [search, setSearch] = useState('');
    const rows = useMemo(() => {
        const q = search.trim().toLowerCase();
        return allRows.filter(r => !q
            || r.clubName.toLowerCase().includes(q)
            || (r.registryNumber || '').toLowerCase().includes(q)
            || (r.certificateNumber || '').toLowerCase().includes(q));
    }, [allRows, search]);
    const exportXlsx = () => exportRowsToExcel(rows.map((r, i) => ({
        '#': i + 1, Klub: r.clubName, "Ro'yxat raqami": r.registryNumber, 'Guvohnoma raqami': r.certificateNumber || '',
        Sana: (r.issuedAt || '').slice(0, 10),
    })), { sheetName: 'Klublar', fileName: `klublar_reestri_${new Date().toISOString().slice(0, 10)}.xlsx` });

    return (
        <div className="space-y-4">
            <RegistryFilterBar search={search} onSearch={setSearch} searchPlaceholder="Klub nomi yoki ro'yxat raqami..." />
            <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">{rows.length} ta ro'yxatdan o'tgan klub</p>
                <Button variant="outline" size="sm" icon={Download} onClick={exportXlsx}>Excel</Button>
            </div>
            <Card padding={false}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-gray-400 uppercase">
                            <tr>
                                <th className="p-3 w-10">№</th><th className="p-3">Klub</th><th className="p-3">Ro'yxat raqami</th>
                                <th className="p-3">Guvohnoma raqami</th><th className="p-3">Sana</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {rows.length === 0 ? (
                                <tr><td colSpan={5} className="p-10 text-center text-gray-400">Ro'yxatdan o'tgan klub topilmadi.</td></tr>
                            ) : rows.map((r, i) => (
                                <tr key={r.clubId} className="hover:bg-slate-50/70">
                                    <td className="p-3 text-gray-400 font-bold">{i + 1}</td>
                                    <td className="p-3 font-semibold text-gray-800">{r.clubName}</td>
                                    <td className="p-3 font-mono text-[10px] text-gray-500">{r.registryNumber}</td>
                                    <td className="p-3 font-mono text-[10px] text-gray-500">{r.certificateNumber || '—'}</td>
                                    <td className="p-3 text-gray-500">{(r.issuedAt || '').slice(0, 10)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

// --- Rag'bat puli / Mukofot reestri - tasdiqlangan yozuvlar, talaba pasportidagi haqiqiy
// JSHSHIR/passport/to'lov shakli bilan birlashtirilgan (qayta kiritilmagan). ---
const RecognitionRegistryTab = ({ kind, onManage }) => {
    const allRows = useMemo(() => db.getApprovedRecognitionRegistry(kind), [kind]);
    const isIncentive = kind === 'incentive';
    const [search, setSearch] = useState('');
    const [faculty, setFaculty] = useState('');
    const [activityTitle, setActivityTitle] = useState('');
    const facultyOptions = useMemo(() => [...new Set(allRows.map(r => r.faculty).filter(Boolean))].sort(), [allRows]);
    const activityOptions = useMemo(() => [...new Set(allRows.map(r => r.activityTitle).filter(Boolean))].sort(), [allRows]);
    const rows = useMemo(() => {
        const q = search.trim().toLowerCase();
        return allRows.filter(r =>
            (!q || r.fullName.toLowerCase().includes(q)
                || (r.activityTitle || '').toLowerCase().includes(q)
                || (isIncentive ? '' : (r.prizeTitle || '')).toLowerCase().includes(q)) &&
            (!faculty || r.faculty === faculty) &&
            (!activityTitle || r.activityTitle === activityTitle)
        );
    }, [allRows, search, faculty, activityTitle, isIncentive]);
    const exportXlsx = () => exportRowsToExcel(rows.map((r, i) => ({
        'T/r': i + 1, 'F.I.Sh.': r.fullName, Fakulteti: r.faculty || '', Ishtiroki: r.participationDescription || '',
        ...(isIncentive
            ? { "Rag'batlantirish miqdori": r.amount || '' }
            : { Mukofot: r.prizeTitle || '' }),
        "Davlat granti yoki to'lov-kontrakt": r.paymentForm || '', 'Passport ma\'lumoti': r.passportNumber || '', JSHIR: r.jshshir || '',
    })), { sheetName: isIncentive ? "Rag'bat puli" : 'Mukofotlar', fileName: `${isIncentive ? 'ragbat_puli' : 'mukofotlar'}_${new Date().toISOString().slice(0, 10)}.xlsx` });

    // Screenshotdagi rasmiy jadval kabi - faoliyat sarlavhasi bo'yicha guruhlangan.
    const groups = useMemo(() => {
        const map = new Map();
        rows.forEach(r => {
            const key = r.activityTitle || "Bog'lanmagan";
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(r);
        });
        return Array.from(map.entries());
    }, [rows]);

    return (
        <div className="space-y-4">
            <RegistryFilterBar
                search={search} onSearch={setSearch}
                searchPlaceholder={`F.I.Sh., tanlov${isIncentive ? '' : ' yoki mukofot nomi'}...`}
                faculty={faculty} onFaculty={setFaculty} facultyOptions={facultyOptions}
                extra={activityOptions.length > 0 && (
                    <select value={activityTitle} onChange={e => setActivityTitle(e.target.value)}
                        className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white">
                        <option value="">Barcha tanlovlar</option>
                        {activityOptions.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                )}
            />
            <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">{rows.length} nafar tasdiqlangan {isIncentive ? 'rag\'bat puli' : 'mukofot'} oluvchi</p>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" icon={Gift} onClick={onManage}>Taklif qilish / tasdiqlash</Button>
                    <Button variant="outline" size="sm" icon={Download} onClick={exportXlsx}>Excel</Button>
                </div>
            </div>
            {groups.length === 0 ? (
                <Card className="p-10 text-center text-gray-400">Tasdiqlangan yozuv topilmadi.</Card>
            ) : (
                // Rasmiy hujjat kabi BITTA uzluksiz jadval - musobaqa nomi to'liq kenglikda
                // ajratuvchi qator sifatida chiqadi, tartib raqami bo'limlar orasida ham
                // to'xtamay davom etadi (jadval tuzish tabidagi bilan bir xil ko'rinish).
                <Card padding={false}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-gray-400 uppercase">
                                <tr>
                                    <th className="p-3 w-10">T/r</th><th className="p-3">F.I.Sh.</th><th className="p-3">Fakulteti</th>
                                    <th className="p-3">Ishtiroki</th><th className="p-3">{isIncentive ? 'Miqdori' : 'Mukofot'}</th>
                                    <th className="p-3">To'lov shakli</th><th className="p-3">Passport</th><th className="p-3">JSHIR</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {(() => {
                                    let counter = 0;
                                    return groups.map(([title, groupRows]) => (
                                        <React.Fragment key={title}>
                                            <tr>
                                                <td colSpan={8} className="p-2.5 bg-indigo-50 text-center font-bold text-indigo-800">{title}</td>
                                            </tr>
                                            {groupRows.map(r => {
                                                counter += 1;
                                                return (
                                                    <tr key={r.id} className="hover:bg-slate-50/70">
                                                        <td className="p-3 text-gray-400 font-bold">{counter}</td>
                                                        <td className="p-3 font-semibold text-gray-800">{r.fullName}</td>
                                                        <td className="p-3 text-gray-600">{r.faculty || '—'}</td>
                                                        <td className="p-3 text-gray-600">{r.participationDescription || '—'}</td>
                                                        <td className="p-3 text-gray-600 font-semibold">{isIncentive ? (r.amount || '—') : (r.prizeTitle || '—')}</td>
                                                        <td className="p-3 text-gray-500">{r.paymentForm || '—'}</td>
                                                        <td className="p-3 text-gray-500">{r.passportNumber || '—'}</td>
                                                        <td className="p-3 text-gray-500">{r.jshshir || '—'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </React.Fragment>
                                    ));
                                })()}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default AwardRegistryPage;
