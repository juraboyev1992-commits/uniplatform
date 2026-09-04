import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Award, Shield } from 'lucide-react';
import Button from './Button';
import { getTemplate } from '../../config/documents';

// Yangi (ixtiyoriy) proplar rasmiy hujjatlar tizimi uchun; berilmasa komponent avvalgidek ishlaydi:
//   heading            - "SERTIFIKAT" o'rniga "I DARAJALI DIPLOM" kabi sarlavha
//   registrationNumber - TSUL/2026/DIP/000124 (raqam bloki shuni ko'rsatadi)
//   verifyUrl          - QR shu manzilga olib boradi (ishlaydigan /verify/:token sahifasi)
//   revoked            - bekor qilingan hujjatda ko'rinadigan ogohlantirish
const CertificateGenerator = ({
    studentName = 'Aliyev Sardor',
    clubName = 'IT & Innovatsiyalar',
    role = 'Faol a\'zo',
    placement = null,
    issueDate = new Date().toISOString().split('T')[0],
    certificateId = 'CERT-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
    displayNumber = null,
    heading = 'Sertifikat',
    registrationNumber = null,
    verifyUrl = null,
    revoked = false,
    templateId = 'classic',
    members = []
}) => {
    const tpl = getTemplate(templateId);
    const certificateRef = useRef(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const handleDownload = async () => {
        setIsGenerating(true);
        try {
            const element = certificateRef.current;
            const canvas = await html2canvas(element, {
                scale: 3, // High resolution
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/png');
            // A4 size: 297mm x 210mm (landscape)
            const pdf = new jsPDF('l', 'mm', 'a4');
            pdf.addImage(imgData, 'PNG', 0, 0, 297, 210);
            pdf.save(`${studentName.replace(/\s+/g, '_')}_Sertifikat.pdf`);
        } catch (error) {
            console.error("PDF yaratishda xatolik:", error);
            alert("Sertifikat yaratishda xatolik yuz berdi.");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="flex flex-col items-center gap-6 w-full">
            {/* Download Action */}
            <div className="w-full flex justify-end">
                <Button 
                    variant="primary" 
                    icon={Download} 
                    onClick={handleDownload}
                    disabled={isGenerating}
                    className="bg-indigo-600 hover:bg-indigo-700"
                >
                    {isGenerating ? 'Yuklanmoqda...' : 'PDF Yuklab olish'}
                </Button>
            </div>

            {/* Certificate Preview Wrapper - Fixed aspect ratio for A4 landscape */}
            <div className="w-full max-w-[1000px] bg-gray-100 p-4 rounded-xl overflow-auto flex justify-center">
                {/* Actual Certificate Element (1122x793 px is roughly A4 at 96 DPI) */}
                <div 
                    ref={certificateRef}
                    className="relative bg-white shadow-2xl flex flex-col items-center justify-center"
                    style={{ width: '1122px', height: '793px', fontFamily: 'serif', padding: '40px', overflow: 'hidden' }}
                >
                    {/* Decorative Background */}
                    {/* Ranglar tanlangan shablondan keladi (config/documents.js: CERTIFICATE_TEMPLATES). */}
                    <div className="absolute inset-0 border-[16px] m-8 rounded-lg pointer-events-none" style={{ borderColor: tpl.outerBorder }}></div>
                    <div className="absolute inset-0 border-4 m-[38px] rounded pointer-events-none" style={{ borderColor: tpl.innerBorder }}></div>
                    <div className="absolute top-0 left-0 w-64 h-64 rounded-br-full opacity-10" style={{ backgroundColor: tpl.cornerA }}></div>
                    <div className="absolute bottom-0 right-0 w-64 h-64 rounded-tl-full opacity-10" style={{ backgroundColor: tpl.cornerB }}></div>
                    
                    {/* Logos and Headers */}
                    <div className="flex justify-between w-full px-16 mt-8">
                        <div className="flex flex-col items-center">
                            <Shield className="w-16 h-16 text-indigo-900" />
                            <span className="font-bold text-sm text-indigo-900 mt-2 tracking-widest uppercase">UniPlatform</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <Award className="w-16 h-16 text-amber-500" />
                            <span className="font-bold text-sm text-amber-600 mt-2 tracking-widest uppercase">ClubOS</span>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="text-center flex-1 flex flex-col items-center justify-center mt-[-40px]">
                        <h1 className="text-6xl font-black uppercase tracking-wider mb-6" style={{ fontFamily: 'Georgia, serif', color: tpl.heading }}>{heading}</h1>
                        {registrationNumber ? (
                            <p className="text-sm font-bold text-indigo-700 tracking-widest -mt-4 mb-4">{registrationNumber}</p>
                        ) : displayNumber && (
                            <p className="text-sm font-bold text-indigo-700 tracking-widest -mt-4 mb-4">№ {displayNumber}</p>
                        )}
                        {revoked && (
                            <p className="text-lg font-black text-rose-600 uppercase tracking-widest mb-4 border-2 border-rose-500 px-6 py-1 rounded">
                                Bekor qilingan
                            </p>
                        )}
                        <p className="text-xl text-gray-600 italic mb-8">Ushbu sertifikat tasdiqlaydiki</p>
                        
                        <h2 className="text-5xl font-bold text-gray-900 mb-8 border-b-2 border-gray-300 pb-2 px-12" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                            {studentName}
                        </h2>

                        <p className="text-lg text-gray-700 max-w-2xl leading-relaxed mb-6">
                            universitet faoliyatida va 
                            <span className="font-bold text-indigo-800 mx-2">"{clubName}"</span> 
                            klubidagi munosib ishtiroki hamda
                        </p>
                        <p className="text-2xl font-bold mb-12" style={{ color: tpl.accent }}>
                            {placement ? `Musobaqada ${placement}` : role}
                        </p>
                        <p className="text-lg text-gray-700">sifatida qo'shgan hissasi uchun taqdirlandi.</p>

                        {/* Jamoa nomiga berilgan hujjatda tarkib shu yerda ko'rsatiladi - shunda kimlar
                            g'olib bo'lgani hujjatning o'zidan ko'rinadi. */}
                        {members.length > 0 && (
                            <div className="mt-5 max-w-3xl">
                                <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1.5">
                                    Jamoa tarkibi
                                </p>
                                <div className="flex flex-wrap justify-center gap-x-5 gap-y-1">
                                    {members.map((m, i) => (
                                        <span key={m.userId || i} className="text-base text-gray-800">
                                            {m.officialName}
                                            {m.role === 'captain' && <span className="text-gray-500"> (kapitan)</span>}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer / Signatures */}
                    <div className="w-full px-20 flex justify-between items-end mb-8">
                        <div className="flex flex-col items-center">
                            <div className="w-48 border-b border-gray-800 mb-2"></div>
                            <span className="text-sm font-bold text-gray-800 uppercase">Rektor / Prorektor</span>
                        </div>
                        
                        {/* QR Code Verification */}
                        <div className="flex flex-col items-center bg-white p-2 border border-gray-200 rounded">
                            {/* Haqiqiy hujjatda QR ishlaydigan /verify/:token sahifasiga olib boradi. */}
                            <QRCodeSVG value={verifyUrl || `https://uniplatform.uz/verify/${certificateId}`} size={80} />
                            <span className="text-[10px] mt-1 text-gray-500 font-mono">
                                {registrationNumber || certificateId}
                            </span>
                        </div>

                        <div className="flex flex-col items-center">
                            <div className="w-48 border-b border-gray-800 mb-2 text-center pb-1 font-bold text-gray-700">
                                {issueDate}
                            </div>
                            <span className="text-sm font-bold text-gray-800 uppercase">Sana</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CertificateGenerator;
