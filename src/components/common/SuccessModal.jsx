import React, { useState } from 'react';
import { CheckCircle2, Copy, Check, ExternalLink } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

// Shown after a tournament is successfully created. Thin wrapper around the existing Modal.jsx.
const SuccessModal = ({ isOpen, onClose, onOpenTournament, shareUrl }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard API unavailable — nothing sensible to fall back to silently; leave button as-is.
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="" size="sm" showCloseButton={false}>
            <div className="text-center space-y-4 py-2">
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto">
                    <CheckCircle2 size={36} />
                </div>
                <div>
                    <h3 className="text-lg font-extrabold text-gray-900">Turnir muvaffaqiyatli yaratildi</h3>
                    <p className="text-sm text-gray-500 mt-1">Turnir muvaffaqiyatli yaratildi va saqlandi.</p>
                </div>
                <div className="flex flex-col gap-2.5 pt-2">
                    <Button variant="primary" icon={ExternalLink} onClick={onOpenTournament} className="w-full justify-center">
                        Turnirni ochish
                    </Button>
                    <Button variant="outline" icon={copied ? Check : Copy} onClick={handleCopy} className="w-full justify-center">
                        {copied ? 'Nusxalandi' : 'Havolani nusxalash'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default SuccessModal;
