import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Shield, ShieldX } from 'lucide-react';
import Button from '../common/Button';
import { getTemplate, ORGANIZATION_NAME, ORGANIZATION_SHORT } from '../../config/documents';
import { clubTypeLabel } from '../../config/clubRegistration';

// KLUB RO'YXATDAN O'TGANLIGI TO'G'RISIDA GUVOHNOMA (band 15).
//
// `CertificateGenerator.jsx` bilan BIR XIL vizual naqsh (shablon ranglari,
// QR, html2canvas+jsPDF orqali HAQIQIY PDF yuklab olish) - lekin matni
// butunlay boshqa: u talaba/jamoaning shaxsiy yutug'ini taqdirlaydi, bu esa
// klubning RASMIY MAQOMINI tasdiqlaydi. Ikkalasini bitta komponentga
// qo'shib yuborish matnni sun'iy moslashtirib, ikkalasini ham chalkash
// qilib qo'yardi - shuning uchun alohida.
const ClubCertificate = ({
    clubName, clubType, direction, registryNumber, certificateNumber,
    registeredAt, issuedAt, status = 'active', verifyUrl, templateId = 'official',
}) => {
    const tpl = getTemplate(templateId);
    const ref = useRef(null);
    const [busy, setBusy] = useState(false);
    const isRevoked = status === 'revoked';

    const download = async () => {
        setBusy(true);
        try {
            const canvas = await html2canvas(ref.current, {
                scale: 3, useCORS: true, logging: false, backgroundColor: '#ffffff',
            });
            const pdf = new jsPDF('l', 'mm', 'a4');
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 297, 210);
            pdf.save(`${String(clubName || 'klub').replace(/\s+/g, '_')}_Guvohnoma.pdf`);
        } catch {
            window.alert('Guvohnoma yuklab olishda xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col items-center gap-6 w-full">
            <div className="w-full flex justify-end">
                <Button variant="primary" icon={Download} onClick={download} disabled={busy}>
                    {busy ? 'Yuklanmoqda...' : 'PDF yuklab olish'}
                </Button>
            </div>

            <div className="w-full max-w-[1000px] bg-gray-100 p-4 rounded-xl overflow-auto flex justify-center">
                <div
                    ref={ref}
                    className="relative bg-white shadow-2xl flex flex-col items-center justify-center"
                    style={{ width: '1122px', height: '793px', fontFamily: 'serif', padding: '40px', overflow: 'hidden' }}
                >
                    <div className="absolute inset-0 border-[16px] m-8 rounded-lg pointer-events-none" style={{ borderColor: tpl.outerBorder }} />
                    <div className="absolute inset-0 border-4 m-[38px] rounded pointer-events-none" style={{ borderColor: tpl.innerBorder }} />
                    <div className="absolute top-0 left-0 w-64 h-64 rounded-br-full opacity-10" style={{ backgroundColor: tpl.cornerA }} />
                    <div className="absolute bottom-0 right-0 w-64 h-64 rounded-tl-full opacity-10" style={{ backgroundColor: tpl.cornerB }} />

                    <div className="flex flex-col items-center mt-8">
                        <Shield className="w-14 h-14" style={{ color: tpl.heading }} />
                        <span className="font-bold text-xs tracking-widest uppercase mt-1.5" style={{ color: tpl.heading }}>
                            {ORGANIZATION_SHORT}
                        </span>
                        <span className="text-[11px] text-gray-500 mt-0.5">{ORGANIZATION_NAME}</span>
                    </div>

                    <div className="text-center flex-1 flex flex-col items-center justify-center mt-[-16px]">
                        <h1 className="text-5xl font-black uppercase tracking-wider mb-1" style={{ fontFamily: 'Georgia, serif', color: tpl.heading }}>
                            Guvohnoma
                        </h1>
                        <p className="text-sm text-gray-500 mb-2">
                            Klubni ro'yxatdan o'tkazilganligi to'g'risida
                        </p>
                        <p className="text-sm font-bold tracking-widest mb-6" style={{ color: tpl.accent }}>
                            {certificateNumber}
                        </p>

                        {isRevoked && (
                            <p className="text-lg font-black text-rose-600 uppercase tracking-widest mb-4 border-2 border-rose-500 px-6 py-1 rounded flex items-center gap-2">
                                <ShieldX size={20} /> Bekor qilingan
                            </p>
                        )}

                        <p className="text-lg text-gray-600 italic mb-6">Ushbu guvohnoma tasdiqlaydiki</p>

                        <h2
                            className="text-4xl font-bold text-gray-900 mb-8 border-b-2 border-gray-300 pb-2 px-12 max-w-4xl"
                            style={{ fontFamily: '"Times New Roman", Times, serif' }}
                        >
                            "{clubName}"
                        </h2>

                        <p className="text-lg text-gray-700 max-w-2xl leading-relaxed mb-8">
                            {ORGANIZATION_SHORT} qoshida belgilangan tartibda <b>ro'yxatdan o'tgan</b> va
                            o'z nizomiga muvofiq faoliyat yuritish huquqiga ega ekanligini tasdiqlaydi.
                        </p>

                        <div className="flex items-center gap-10 text-sm">
                            <div className="text-center">
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Turi</p>
                                <p className="font-bold text-gray-800">{clubTypeLabel(clubType) || '—'}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Yo'nalishi</p>
                                <p className="font-bold text-gray-800">{direction || '—'}</p>
                            </div>
                            <div className="text-center">
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Reyestr raqami</p>
                                <p className="font-bold text-gray-800">{registryNumber}</p>
                            </div>
                        </div>
                    </div>

                    <div className="w-full px-20 flex justify-between items-end mb-8">
                        <div className="flex flex-col items-center">
                            <div className="w-48 border-b border-gray-800 mb-2" />
                            <span className="text-sm font-bold text-gray-800 uppercase">Rektor / Prorektor</span>
                        </div>

                        <div className="flex flex-col items-center bg-white p-2 border border-gray-200 rounded">
                            <QRCodeSVG value={verifyUrl} size={80} />
                            <span className="text-[10px] mt-1 text-gray-500 font-mono">{registryNumber}</span>
                        </div>

                        <div className="flex flex-col items-center">
                            <div className="w-48 border-b border-gray-800 mb-2 text-center pb-1 font-bold text-gray-700">
                                {issuedAt ? new Date(issuedAt).toLocaleDateString('uz-UZ') : '—'}
                            </div>
                            <span className="text-sm font-bold text-gray-800 uppercase">Berilgan sana</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClubCertificate;
