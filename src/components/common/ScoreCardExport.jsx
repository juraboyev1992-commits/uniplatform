import React, { useState } from 'react';
import { Download } from 'lucide-react';
import Button from './Button';

// Exports everything inside `contentRef` (the caller wraps whatever should end up in the PDF — header,
// Skoring, and in the admin modal's case the older Score Overview/11-mezon sections too, per direct
// feedback that the download must include "barcha ma'lumotlar", not just a condensed summary card).
// Same html2canvas+jsPDF technique CertificateGenerator.jsx already uses elsewhere for certificates (a
// separate, untouched feature).
//
// Standard A4 page with real margins, the captured content scaled down (never up) to fit inside the
// printable area and centered — not a custom oversized page, and not a fixed-height page sliced into
// chunks (that earlier approach cut text/cards in half at the page-height boundary). Scaling everything
// to fit on the one A4 page means nothing can ever land on a page seam and get split.
const ScoreCardExport = ({ contentRef, fileName = 'TAS_hisobot' }) => {
    const [isGenerating, setIsGenerating] = useState(false);

    const handleDownload = async () => {
        // html2canvas + jsPDF birgalikda ~640 KB. Ilgari ular oddiy import edi, ya'ni
        // HAR BIR foydalanuvchi, hech qachon PDF yuklamasa ham, sayt ochilishida o'sha
        // 640 KB ni yuklab, tahlil qilishi kerak edi. Endi faqat shu tugma bosilganda
        // so'raladi - brauzer bo'lakni bir marta yuklab, keyin keshdan oladi.
        const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
            import('html2canvas'),
            import('jspdf'),
        ]);

        const element = contentRef?.current;
        if (!element) return;
        setIsGenerating(true);
        try {
            // windowWidth/windowHeight pin html2canvas's internal clone to the element's real rendered
            // size instead of letting it reflow against the ambient window/viewport (which, inside a
            // modal, can be narrower than the content and cause labels to wrap/overflow differently than
            // what's on screen — the "chetga chiqib ketgan" text). scrollX/scrollY:0 stop it from
            // capturing at the page's current scroll offset, which otherwise clips content that's
            // scrolled out of view inside the modal's own overflow-y-auto area ("kesilib ketgan").
            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                width: element.scrollWidth,
                height: element.scrollHeight,
                windowWidth: element.scrollWidth,
                windowHeight: element.scrollHeight,
                scrollX: 0,
                scrollY: 0
            });
            const imgData = canvas.toDataURL('image/png');

            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageWidthMm = pdf.internal.pageSize.getWidth();
            const pageHeightMm = pdf.internal.pageSize.getHeight();
            const marginMm = 10;
            const maxWidthMm = pageWidthMm - marginMm * 2;
            const maxHeightMm = pageHeightMm - marginMm * 2;

            // Fit inside the margin box, preserving aspect ratio — width-constrained first, then
            // shrunk further if it's still taller than the box.
            let drawWidthMm = maxWidthMm;
            let drawHeightMm = (canvas.height * drawWidthMm) / canvas.width;
            if (drawHeightMm > maxHeightMm) {
                drawHeightMm = maxHeightMm;
                drawWidthMm = (canvas.width * drawHeightMm) / canvas.height;
            }
            const x = (pageWidthMm - drawWidthMm) / 2;
            const y = marginMm;

            pdf.addImage(imgData, 'PNG', x, y, drawWidthMm, drawHeightMm);
            pdf.save(`${fileName.replace(/\s+/g, '_')}.pdf`);
        } catch (error) {
            console.error('PDF yaratishda xatolik:', error);
            alert('PDF yuklab olishda xatolik yuz berdi.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Button variant="outline" size="sm" icon={Download} onClick={handleDownload} disabled={isGenerating}>
            {isGenerating ? 'Tayyorlanmoqda...' : 'PDF yuklab olish'}
        </Button>
    );
};

export default ScoreCardExport;
