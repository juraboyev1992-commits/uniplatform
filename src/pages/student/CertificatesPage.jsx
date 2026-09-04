import React, { useState, useEffect, useMemo } from 'react';
import { Award, Star, Shield, ShieldCheck, ExternalLink } from 'lucide-react';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import CertificateGenerator from '../../components/common/CertificateGenerator';
import CopyableId from '../../components/common/CopyableId';
import { db } from '../../services/db';
import { useAuth } from '../../contexts/AuthContext';
import { DOCUMENT_GROUPS, DOCUMENT_STATUS, getDocumentType, getDocumentTypeLabel } from '../../config/documents';

const ROLE_LABELS = {
    head_coordinator: 'Bosh Koordinator',
    coordinator: 'Koordinator',
    volunteer: 'Volontyor',
    smm: 'SMM',
    member: "A'zo",
};

// "Mening yutuqlarim" - rasmiy hujjatlar tizimidan kelgan diplom/sertifikat/tashakkurnomalar.
// Eski `certificates` yozuvlari ham yo'qolmaydi: ular alohida "Avvalgi sertifikatlar" bo'limida qoladi.
const StatTile = ({ label, value, tone = 'text-gray-900' }) => (
    <div className="bg-white/15 backdrop-blur rounded-xl px-4 py-2.5 text-center min-w-[92px]">
        <p className={`text-2xl font-black ${tone}`}>{value}</p>
        <p className="text-[10px] uppercase font-bold tracking-widest opacity-80">{label}</p>
    </div>
);

// `embedded` - "Yutuqlar va imtiyozlar" sahifasining tab'i ichida ko'rsatilganda o'z sarlavhasini
// chizmaydi (aks holda ikkita sarlavha ustma-ust tushardi). Alohida sahifa sifatida ochilganda
// avvalgidek to'liq ko'rinadi.
const CertificatesPage = ({ embedded = false }) => {
    const { user } = useAuth();
    const [documents, setDocuments] = useState([]);
    const [legacyCerts, setLegacyCerts] = useState([]);
    const [selected, setSelected] = useState(null);

    useEffect(() => {
        if (!user) return;
        // Faqat SHU talabaga tegishli hujjatlar (db.getStudentDocuments recipientId bo'yicha filtrlaydi).
        const docs = db.getStudentDocuments(user.username);
        setDocuments(docs);
        setLegacyCerts(db.getUserCertificates(user.username));
        if (docs.length > 0) setSelected({ kind: 'document', data: docs[0] });
    }, [user]);

    const stats = useMemo(() => {
        const byPlace = (n) => documents.filter(d => d.place === n && d.status === 'issued').length;
        const byGroup = (g) => documents.filter(d => getDocumentType(d.documentType)?.group === g && d.status === 'issued').length;
        return {
            total: documents.filter(d => d.status === 'issued').length,
            first: byPlace(1), second: byPlace(2), third: byPlace(3),
            certificates: byGroup('certificate'), thanks: byGroup('thanks')
        };
    }, [documents]);

    const grouped = useMemo(() => DOCUMENT_GROUPS.map(g => ({
        ...g,
        items: documents.filter(d => getDocumentType(d.documentType)?.group === g.id)
    })).filter(g => g.items.length > 0), [documents]);

    const verifyUrl = (token) => `${window.location.origin}/verify/${token}`;

    const selectedDoc = selected?.kind === 'document' ? selected.data : null;
    const selectedLegacy = selected?.kind === 'legacy' ? selected.data : null;

    return (
        <div className="space-y-6">
            {embedded ? (
                <div className="flex flex-wrap gap-2">
                    {[
                        ['Jami', stats.total], ["I o'rin", stats.first], ["II o'rin", stats.second],
                        ["III o'rin", stats.third], ['Sertifikat', stats.certificates], ['Tashakkur', stats.thanks]
                    ].map(([label, value]) => (
                        <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-center min-w-[92px]">
                            <p className="text-2xl font-black text-gray-900">{value}</p>
                            <p className="text-[10px] uppercase font-bold tracking-widest text-gray-400">{label}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-gradient-to-r from-amber-500 to-orange-600 rounded-2xl p-8 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold mb-1 flex items-center gap-3">
                            <Award className="w-8 h-8" /> Mening yutuqlarim
                        </h1>
                        <p className="text-amber-100">Rasmiy diplom, sertifikat va tashakkurnomalaringiz — bir joyda</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatTile label="Jami" value={stats.total} />
                        <StatTile label="I o'rin" value={stats.first} />
                        <StatTile label="II o'rin" value={stats.second} />
                        <StatTile label="III o'rin" value={stats.third} />
                        <StatTile label="Sertifikat" value={stats.certificates} />
                        <StatTile label="Tashakkur" value={stats.thanks} />
                    </div>
                </div>
            )}

            {documents.length === 0 && legacyCerts.length === 0 && (
                <div className="flex items-start gap-4 p-5 bg-amber-50 border border-amber-200 rounded-2xl">
                    <Star className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-bold text-amber-800">Hujjat qanday olinadi?</p>
                        <p className="text-sm text-amber-700 mt-1">
                            Tadbir yoki musobaqa yakunlangach bayonnoma tuziladi va mas'ullar uni tasdiqlaydi.
                            Shundan keyin sizga tegishli diplom, sertifikat yoki tashakkurnoma shu yerda paydo bo'ladi.
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-5">
                    {grouped.map(group => (
                        <div key={group.id} className="space-y-2">
                            <h2 className="text-sm font-black uppercase tracking-wider text-gray-500">
                                {group.label} ({group.items.length})
                            </h2>
                            {group.items.map(doc => {
                                const isSel = selectedDoc?.id === doc.id;
                                const st = DOCUMENT_STATUS[doc.status];
                                return (
                                    <button
                                        key={doc.id}
                                        type="button"
                                        onClick={() => setSelected({ kind: 'document', data: doc })}
                                        className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                                            isSel ? 'border-amber-500 bg-amber-50 shadow-md' : 'border-gray-100 bg-white hover:border-amber-200'
                                        }`}
                                    >
                                        <p className="font-bold text-gray-900 text-sm leading-tight">
                                            {getDocumentTypeLabel(doc.documentType)}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-0.5">{doc.activityName}</p>
                                        <p className="text-[10px] text-gray-400 font-mono mt-1">
                                            <CopyableId value={doc.registrationNumber}>{doc.registrationNumber}</CopyableId>
                                        </p>
                                        <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${st?.tone}`}>
                                            {st?.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    ))}

                    {legacyCerts.length > 0 && (
                        <div className="space-y-2">
                            <h2 className="text-sm font-black uppercase tracking-wider text-gray-400">
                                Avvalgi sertifikatlar ({legacyCerts.length})
                            </h2>
                            {legacyCerts.map(cert => (
                                <button
                                    key={cert.id}
                                    type="button"
                                    onClick={() => setSelected({ kind: 'legacy', data: cert })}
                                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                                        selectedLegacy?.id === cert.id ? 'border-amber-500 bg-amber-50' : 'border-gray-100 bg-white hover:border-amber-200'
                                    }`}
                                >
                                    <p className="font-bold text-gray-900 text-sm">{cert.clubName || 'UniPlatform'}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {cert.placement ? `${cert.placement}` : ROLE_LABELS[cert.role] || cert.role}
                                    </p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="lg:col-span-2">
                    <Card className="border-t-4 border-amber-500 overflow-hidden p-0">
                        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Shield className="w-5 h-5 text-indigo-600" />
                                <span className="font-bold text-gray-800">Hujjat ko'rinishi</span>
                            </div>
                            {selectedDoc && (
                                <a
                                    href={verifyUrl(selectedDoc.verificationToken)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
                                >
                                    <ShieldCheck size={13} /> Haqiqiyligini tekshirish <ExternalLink size={11} />
                                </a>
                            )}
                            {selectedDoc?.status === 'revoked' && <Badge variant="danger" size="sm">Bekor qilingan</Badge>}
                        </div>
                        <div className="p-4">
                            {selectedDoc ? (
                                <CertificateGenerator
                                    heading={getDocumentTypeLabel(selectedDoc.documentType)}
                                    studentName={selectedDoc.recipientName || user?.fullName}
                                    clubName={selectedDoc.activityName}
                                    role={selectedDoc.teamName ? `${selectedDoc.teamName} jamoasi a'zosi` : 'Ishtirokchi'}
                                    placement={selectedDoc.place ? `${selectedDoc.place}-o'rin` : null}
                                    issueDate={(selectedDoc.issuedAt || selectedDoc.createdAt || '').slice(0, 10)}
                                    certificateId={selectedDoc.verificationToken}
                                    registrationNumber={selectedDoc.registrationNumber}
                                    verifyUrl={verifyUrl(selectedDoc.verificationToken)}
                                    revoked={selectedDoc.status === 'revoked'}
                                    templateId={selectedDoc.templateId || 'classic'}
                                    members={selectedDoc.members || []}
                                />
                            ) : selectedLegacy ? (
                                <CertificateGenerator
                                    studentName={selectedLegacy.studentName || user?.fullName}
                                    clubName={selectedLegacy.clubName}
                                    role={ROLE_LABELS[selectedLegacy.role] || selectedLegacy.role}
                                    placement={selectedLegacy.placement}
                                    issueDate={selectedLegacy.issueDate}
                                    certificateId={selectedLegacy.id}
                                    displayNumber={selectedLegacy.displayNumber}
                                />
                            ) : (
                                <div className="text-center py-20 text-gray-400">
                                    <Award className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                    <p className="font-medium">Hujjat tanlanmagan</p>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default CertificatesPage;
