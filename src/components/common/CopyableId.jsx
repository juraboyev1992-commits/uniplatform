import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

// Click-to-copy wrapper for the public display numbers (Klub #12, Talaba #45, Turnir #31, ...) sprinkled
// across the app. Copies the exact visible label to the clipboard and shows a brief checkmark.
// Wraps in a <button> (not a <span onClick>) for keyboard/a11y support, and always stops propagation
// since most of these labels sit inside otherwise-clickable rows/cards that navigate elsewhere.
const CopyableId = ({ value, className = '', iconSize = 11, children }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async (e) => {
        e.stopPropagation();
        if (!navigator.clipboard) return;
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        } catch {
            // Clipboard API unavailable (e.g. insecure context) — nothing to fall back to.
        }
    };

    return (
        <button
            type="button"
            onClick={handleCopy}
            title="Nusxalash uchun bosing"
            className={`inline-flex items-center gap-1 hover:text-indigo-600 transition-colors cursor-pointer group align-middle ${className}`}
        >
            {children}
            {copied
                ? <Check size={iconSize} className="text-emerald-500 shrink-0" />
                : <Copy size={iconSize} className="opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />}
        </button>
    );
};

export default CopyableId;
