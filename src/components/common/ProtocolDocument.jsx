import React, { useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import Button from './Button';
import { ORGANIZATION_NAME, PROTOCOL_STATUS } from '../../config/documents';

// Bayonnomaning rasmiy ko'rinishi va PDF eksporti.
// Ko'p sahifali: ishtirokchilar ro'yxati minglab qator bo'lishi mumkin, shuning uchun bitta uzun
// canvas A4 balandligi bo'yicha bo'laklarga bo'lib joylashtiriladi (jsPDF'ning o'zi buni qilmaydi).
const A4_W = 210;
const A4_H = 297;
const MARGIN = 10;

const ProtocolDocument = ({ protocol, participants = [], signers = [] }) => {
    const ref = useRef(null);
    const [busy, setBusy] = useState(false);

    const handleDownload = async () => {
        // html2canvas + jsPDF birgalikda ~640 KB. Ilgari ular oddiy import edi, ya'ni
        // HAR BIR foydalanuvchi, hech qachon PDF yuklamasa ham, sayt ochilishida o'sha
        // 640 KB ni yuklab, tahlil qilishi kerak edi. Endi faqat shu tugma bosilganda
        // so'raladi - brauzer bo'lakni bir marta yuklab, keyin keshdan oladi.
        const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
            import('html2canvas'),
            import('jspdf'),
        ]);

        setBusy(true);
        try {
            const canvas = await html2canvas(ref.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
            const pdf = new jsPDF('p', 'mm', 'a4');
            const contentW = A4_W - MARGIN * 2;
            const contentH = A4_H - MARGIN * 2;
            const pxPerMm = canvas.width / contentW;
            const pageHpx = contentH * pxPerMm;
            const pages = Math.ceil(canvas.height / pageHpx);

            for (let i = 0; i < pages; i++) {
                const sliceH = Math.min(pageHpx, canvas.height - i * pageHpx);
                const slice = document.createElement('canvas');
                slice.width = canvas.width;
                slice.height = sliceH;
                slice.getContext('2d').drawImage(
                    canvas, 0, i * pageHpx, canvas.width, sliceH, 0, 0, canvas.width, sliceH
                );
                if (i > 0) pdf.addPage();
                pdf.addImage(slice.toDataURL('image/png'), 'PNG', MARGIN, MARGIN, contentW, sliceH / pxPerMm);
            }
            pdf.save(`${protocol.registrationNumber.replace(/[\\/]/g, '-')}.pdf`);
        } catch (err) {
            console.error(err);
            alert('PDF yaratishda xatolik yuz berdi.');
        } finally {
            setBusy(false);
        }
    };

    const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('uz-UZ') : '—');
    const isTeamBased = participants.some(p => (p.membersSnapshot || []).length > 0);

    return (
        <div className="space-y-3">
            <div className="flex justify-end">
                <Button variant="primary" icon={busy ? Loader2 : Download} onClick={handleDownload} disabled={busy}>
                    {busy ? 'Tayyorlanmoqda...' : 'PDF yuklab olish'}
                </Button>
            </div>

            <div className="bg-gray-100 p-4 rounded-xl overflow-auto">
                <div
                    ref={ref}
                    className="bg-white mx-auto p-10"
                    style={{ width: '760px', fontFamily: '"Times New Roman", Times, serif', color: '#111' }}
                >
                    {/* Sarlavha */}
                    <div className="text-center border-b-2 border-gray-800 pb-3 mb-5">
                        <p className="text-[13px] font-bold uppercase tracking-wide">{ORGANIZATION_NAME}</p>
                        <h1 className="text-2xl font-black mt-3">BAYONNOMA</h1>
                        <p className="text-sm mt-1">{protocol.registrationNumber}</p>
                        <p className="text-xs text-gray-600 mt-1">
                            Tuzilgan sana: {fmtDate(protocol.protocolDate)}
                        </p>
                    </div>

                    {/* Umumiy ma'lumot */}
                    <table className="w-full text-[13px] mb-5">
                        <tbody>
                            {[
                                ['Tadbir nomi', protocol.title],
                                ['Turi', protocol.activityType === 'competition' ? 'Musobaqa / tanlov' : 'Tadbir'],
                                ["O'tkazilgan sana", fmtDate(protocol.eventDate)],
                                ["O'tkazilgan joy", protocol.location || '—'],
                                ['Tashkilotchi', protocol.clubName || '—'],
                                ['Maqsad', protocol.purpose || '—']
                            ].map(([k, v]) => (
                                <tr key={k} className="align-top">
                                    <td className="py-1 pr-3 font-bold w-48">{k}:</td>
                                    <td className="py-1">{v}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* O'tkazilganlik tasdig'i - bayonnomani taqdirlash vositasigina emas, tadbirning
                        rasmiy yakuniy hujjatiga aylantiradigan qism. */}
                    <p className="text-[13px] leading-relaxed mb-5 text-justify">
                        Tadbir belgilangan sana va joyda o'tkazildi. Unda quyida ko'rsatilgan ishtirokchilar
                        qatnashdi. Ro'yxatdan o'tganlar soni — <b>{protocol.registeredCount}</b> nafar,
                        amalda qatnashganlar — <b>{protocol.attendedCount}</b> nafar,
                        qatnashmaganlar — <b>{protocol.absentCount}</b> nafar
                        {protocol.teamCount > 0 && <>, jamoalar soni — <b>{protocol.teamCount}</b> ta</>}.
                    </p>

                    {protocol.summary && (
                        <div className="text-[13px] leading-relaxed mb-5 text-justify">
                            <p className="font-bold mb-1">Qisqacha ma'lumot:</p>
                            {/* Word-uslubidagi tahrirlagichdan kelgan formatlangan matn. */}
                            <div dangerouslySetInnerHTML={{ __html: protocol.summary }} />
                        </div>
                    )}

                    {/* Ishtirokchilar */}
                    <p className="font-bold text-[13px] mb-2">
                        Ishtirokchilar ro'yxati ({participants.length} ta)
                    </p>
                    <table className="w-full text-[11px] border-collapse mb-6">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="border border-gray-400 p-1 w-8">№</th>
                                <th className="border border-gray-400 p-1 text-left">
                                    {isTeamBased ? 'Jamoa / tarkibi' : 'F.I.Sh.'}
                                </th>
                                <th className="border border-gray-400 p-1 w-28">Fakultet</th>
                                <th className="border border-gray-400 p-1 w-12">Kurs</th>
                                <th className="border border-gray-400 p-1 w-20">Ishtirok</th>
                                <th className="border border-gray-400 p-1 w-14">O'rin</th>
                            </tr>
                        </thead>
                        <tbody>
                            {participants.map((p, i) => (
                                <tr key={p.id || i}>
                                    <td className="border border-gray-400 p-1 text-center">{i + 1}</td>
                                    <td className="border border-gray-400 p-1">
                                        <span className="font-semibold">
                                            {p.officialNameSnapshot || p.fullNameSnapshot}
                                        </span>
                                        {(p.membersSnapshot || []).length > 0 && (
                                            <div className="text-[10px] text-gray-700 mt-0.5 pl-2">
                                                {p.membersSnapshot.map((m, mi) => (
                                                    <div key={m.userId}>
                                                        {mi + 1}. {m.officialName}
                                                        {m.role === 'captain' && ' (kapitan)'}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="border border-gray-400 p-1">{p.facultySnapshot || '—'}</td>
                                    <td className="border border-gray-400 p-1 text-center">{p.courseSnapshot ?? '—'}</td>
                                    <td className="border border-gray-400 p-1 text-center">
                                        {p.attendanceStatus === 'present' ? 'Qatnashdi' : 'Qatnashmadi'}
                                    </td>
                                    <td className="border border-gray-400 p-1 text-center font-bold">
                                        {p.placeSnapshot ?? '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Imzolar */}
                    <p className="font-bold text-[13px] mb-3">Bayonnomani tasdiqlovchilar:</p>
                    <div className="space-y-4">
                        {signers.map(s => (
                            <div key={s.id} className="flex items-end justify-between gap-6 text-[12px]">
                                <div className="flex-1">
                                    <p className="font-bold">{s.role}</p>
                                    <p className="text-gray-600">{s.username}</p>
                                </div>
                                <div className="w-52 text-center">
                                    <div className="border-b border-gray-800 pb-1">
                                        {s.status === 'signed'
                                            ? <span className="text-[11px] font-bold">Tasdiqlandi — {fmtDate(s.signedAt)}</span>
                                            : <span className="text-[11px] text-gray-400">imzo</span>}
                                    </div>
                                    {s.onBehalfOf && (
                                        <p className="text-[9px] text-gray-500 mt-0.5">
                                            {s.signedBy} tomonidan tasdiqlangan
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <p className="text-[10px] text-gray-500 mt-8 pt-3 border-t border-gray-300">
                        Holat: {PROTOCOL_STATUS[protocol.status]?.label || protocol.status}.
                        Ushbu bayonnoma UniPlatform tizimida elektron shaklda tuzilgan va tasdiqlangan.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ProtocolDocument;
