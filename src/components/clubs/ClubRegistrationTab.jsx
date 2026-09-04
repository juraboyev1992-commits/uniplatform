import React, { useState } from 'react';
import {
    ShieldCheck, FileBadge2, QrCode, History, Loader2, AlertTriangle, ExternalLink,
    FileCheck, ChevronRight,
} from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import {
    REGISTRATION_STATUS, REGISTRATION_STATUS_LABELS, OPERATIONAL_STATUS_LABELS,
    REGULATION_STATUS_LABELS, CREATED_FROM,
} from '../../config/clubRegistration';
import ClubCertificate from './ClubCertificate';

const formatDate = (iso) => iso ? new Date(iso).toLocaleString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

// KLUB PROFILIDAGI "RO'YXAT" TABI (band 14, 15, 17).
//
// Ko'rish - koordinator ham, administrator ham (canView). Ro'yxatdan
// o'tkazish va guvohnoma berish - FAQAT administrator (isAdmin), chunki bu
// rasmiy davlat/universitet hujjati chiqarish amali.
const ClubRegistrationTab = ({ club, isAdmin, onRefresh, onGoToDocuments }) => {
    const { user } = useAuth();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [basisNote, setBasisNote] = useState('');
    const [basisOrderNumber, setBasisOrderNumber] = useState('');

    const certificate = db.getClubCertificate(club.id);
    const history = db.getClubStatusHistory(club.id);
    // Nizomning O'ZI (tahrirlash, ko'rish, tarix) endi faqat "Klub
    // hujjatlari" tabida - u yerda talaba/tashqi ko'ruvchi ham ko'ra oladi,
    // admin esa xuddi shu yerdan tahrirlaydi ham. Bu yerda faqat QISQA
    // holat va o'sha tabga o'tish havolasi qoladi - takrorlanmasin.
    const regulation = db.getClubRegulation(club.id);
    const regulationSections = Array.isArray(regulation?.sections) ? regulation.sections : [];
    const regulationFilled = regulationSections.filter(s => String(s.content || '').trim()).length;

    const doRegister = async () => {
        setBusy(true); setError('');
        try {
            await db.registerClub({
                clubId: club.id,
                basisDocument: { orderNumber: basisOrderNumber, note: basisNote },
                registeredBy: user?.username,
            });
            onRefresh?.();
        } catch (e) {
            setError(e?.message || 'Xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    const doIssueCertificate = async () => {
        setBusy(true); setError('');
        try {
            await db.issueClubCertificate({
                clubId: club.id,
                basisDocument: { orderNumber: basisOrderNumber, note: basisNote },
                issuedBy: user?.username,
            });
            onRefresh?.();
        } catch (e) {
            setError(e?.message || 'Xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-5">
            <Card>
                <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                    <div>
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <ShieldCheck size={17} className="text-indigo-600" /> Ro'yxatdan o'tish holati
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {club.createdFrom === CREATED_FROM.APPLICATION ? 'Ariza orqali yaratilgan' : 'Admin tomonidan bevosita yaratilgan'}
                            {club.createdAt ? ` · ${formatDate(club.createdAt)}` : ''}
                        </p>
                    </div>
                    <span className={`px-3 py-1.5 rounded-full text-xs font-black uppercase ${
                        club.registrationStatus === REGISTRATION_STATUS.REGISTERED
                            ? 'bg-emerald-100 text-emerald-700'
                            : club.registrationStatus === REGISTRATION_STATUS.REVOKED
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-amber-100 text-amber-700'
                    }`}>
                        {REGISTRATION_STATUS_LABELS[club.registrationStatus]}
                    </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-gray-100 p-3.5">
                        <p className="text-[11px] font-bold text-gray-400 uppercase">Reyestr raqami</p>
                        <p className="text-sm font-black text-gray-900 mt-0.5">{club.registryNumber || '—'}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 p-3.5">
                        <p className="text-[11px] font-bold text-gray-400 uppercase">Faoliyat holati</p>
                        <p className="text-sm font-black text-gray-900 mt-0.5">{OPERATIONAL_STATUS_LABELS[club.operationalStatus]}</p>
                    </div>
                </div>

                {/* Tugma REYESTR RAQAMI yo'qligiga qarab ko'rinadi, status
                    matniga emas - eski klublar raqamsiz ham "REGISTERED"
                    deb ko'rinishi mumkin (db.js: registerClub izohi). */}
                {isAdmin && !club.registryNumber && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                        <p className="text-xs text-gray-500">
                            "Asos hujjati" (band 17) - buyruq/qaror raqami. Ixtiyoriy, lekin klub nima
                            asosida rasmiylashtirilganini ko'rsatadi.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input
                                value={basisOrderNumber} onChange={e => setBasisOrderNumber(e.target.value)}
                                placeholder="Buyruq/qaror raqami" className="px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                            <input
                                value={basisNote} onChange={e => setBasisNote(e.target.value)}
                                placeholder="Izoh (ixtiyoriy)" className="px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm"
                            />
                        </div>
                        <Button variant="primary" onClick={doRegister} disabled={busy}>
                            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Ro'yxatdan o'tkazish
                        </Button>
                    </div>
                )}
                {error && (
                    <p className="flex items-start gap-1.5 text-xs font-semibold text-red-600 mt-3">
                        <AlertTriangle size={13} className="shrink-0 mt-px" /> {error}
                    </p>
                )}
            </Card>

            <Card>
                <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <FileBadge2 size={17} className="text-indigo-600" /> Elektron guvohnoma
                </h3>
                {certificate ? (
                    <div className="space-y-3">
                        <a
                            href={`/verify/club/${club.registryNumber}`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:underline"
                        >
                            <QrCode size={13} /> Ochiq tekshiruv sahifasi <ExternalLink size={11} />
                        </a>
                        {/* Haqiqiy rasmiy ko'rinishdagi guvohnoma - talaba/jamoa
                            sertifikatlari bilan bir xil naqsh (CertificateGenerator.jsx):
                            shablon ranglari, QR, va html2canvas+jsPDF orqali
                            HAQIQIY PDF fayl. Oddiy matn maydonlari emas. */}
                        <ClubCertificate
                            clubName={club.name}
                            clubType={club.clubType}
                            direction={club.category}
                            registryNumber={club.registryNumber}
                            certificateNumber={certificate.certificateNumber}
                            registeredAt={club.registeredAt}
                            issuedAt={certificate.issuedAt}
                            status={certificate.status}
                            verifyUrl={`${window.location.origin}/verify/club/${club.registryNumber}`}
                        />
                    </div>
                ) : (
                    <>
                        <p className="text-sm text-gray-500 mb-3">
                            {club.registryNumber
                                ? "Klub ro'yxatdan o'tgan, lekin guvohnoma hali berilmagan."
                                : "Guvohnoma faqat ro'yxatdan o'tgan (reyestr raqami bor) klubga beriladi."}
                        </p>
                        {isAdmin && club.registryNumber && (
                            <Button variant="primary" onClick={doIssueCertificate} disabled={busy}>
                                {busy ? <Loader2 size={14} className="animate-spin" /> : null} Guvohnoma berish
                            </Button>
                        )}
                    </>
                )}
            </Card>

            <Card>
                <button
                    type="button" onClick={onGoToDocuments}
                    className="w-full flex items-center justify-between gap-3 text-left"
                >
                    <div className="flex items-center gap-2.5 min-w-0">
                        <FileCheck size={17} className="text-indigo-600 shrink-0" />
                        <div className="min-w-0">
                            <h3 className="font-bold text-gray-900">Klub nizomi</h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {regulation
                                    ? `${regulationFilled} / ${regulationSections.length || 0} band to'ldirilgan · ${REGULATION_STATUS_LABELS[regulation.status] || regulation.status}`
                                    : "Hali yozilmagan"}
                                {' '}— "Klub hujjatlari" tabida ko'rish va tahrirlash
                            </p>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-300 shrink-0" />
                </button>
            </Card>

            <Card>
                <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <History size={16} className="text-gray-400" /> Holat tarixi
                </h3>
                {history.length === 0 ? (
                    <p className="text-sm text-gray-400">Hali o'zgarish bo'lmagan.</p>
                ) : (
                    <div className="space-y-3">
                        {history.map(h => (
                            <div key={h.id} className="pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                                <p className="text-sm font-semibold text-gray-800">
                                    [{h.statusKind === 'registration' ? "Ro'yxat" : 'Faoliyat'}]{' '}
                                    {h.fromStatus || 'boshlanish'} → {h.toStatus}
                                </p>
                                {h.reason && <p className="text-xs text-gray-500 mt-0.5">{h.reason}</p>}
                                <p className="text-[11px] text-gray-400 mt-0.5">{h.actor} · {formatDate(h.createdAt)}</p>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
};

export default ClubRegistrationTab;
