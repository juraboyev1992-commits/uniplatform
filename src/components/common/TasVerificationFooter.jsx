import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck } from 'lucide-react';

// Small QR/verification strip meant to sit INSIDE whatever content block ScoreCardExport.jsx captures
// for its PDF export (StudentsManagement.jsx's admin modal, ProfilePage.jsx's Skoring section) — always
// visible on screen too, not a hidden/separate "preview", so the PDF is a faithful WYSIWYG copy of what
// was on screen. Same illustrative verification-URL convention CertificateGenerator.jsx already uses
// elsewhere (a separate, untouched feature) for consistency.
const TasVerificationFooter = ({ verifyId }) => (
    <div className="flex items-center justify-between gap-3 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-mono">
            <ShieldCheck size={12} /> Tasdiqlash: {verifyId}
        </div>
        <div className="flex flex-col items-center gap-1">
            <QRCodeSVG value={`https://uniplatform.uz/verify/${verifyId}`} size={56} />
            <span className="text-[9px] text-gray-400">{new Date().toLocaleDateString('uz-UZ')}</span>
        </div>
    </div>
);

export default TasVerificationFooter;
