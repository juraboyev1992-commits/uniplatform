import React, { useEffect, useRef } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignJustify, Undo2 } from 'lucide-react';

// Yengil "Word uslubidagi" tahrirlagich - qo'shimcha kutubxonasiz, contentEditable asosida.
// Bayonnomaning matnli qismi uchun yetarli: qalin/kursiv/tagchiziq, ro'yxatlar, tekislash.
// Natija HTML sifatida saqlanadi va bayonnoma PDF'ida o'sha ko'rinishda chiqadi.
const TOOLS = [
    { cmd: 'bold', icon: Bold, title: 'Qalin' },
    { cmd: 'italic', icon: Italic, title: 'Kursiv' },
    { cmd: 'underline', icon: Underline, title: 'Tagiga chizish' },
    { sep: true },
    { cmd: 'insertUnorderedList', icon: List, title: "Belgili ro'yxat" },
    { cmd: 'insertOrderedList', icon: ListOrdered, title: "Raqamli ro'yxat" },
    { sep: true },
    { cmd: 'justifyLeft', icon: AlignLeft, title: 'Chapga' },
    { cmd: 'justifyCenter', icon: AlignCenter, title: 'Markazga' },
    { cmd: 'justifyFull', icon: AlignJustify, title: 'Eniga' },
    { sep: true },
    { cmd: 'undo', icon: Undo2, title: 'Orqaga' }
];

const RichTextEditor = ({ value, onChange, placeholder = '', minHeight = 140 }) => {
    const ref = useRef(null);

    // Faqat tashqaridan kelgan qiymat haqiqatan boshqacha bo'lsa yozamiz - aks holda har bosishda
    // kursor matn boshiga sakrab ketadi.
    useEffect(() => {
        if (ref.current && ref.current.innerHTML !== (value || '')) {
            ref.current.innerHTML = value || '';
        }
    }, [value]);

    const exec = (cmd) => {
        ref.current?.focus();
        // document.execCommand eskirgan deb belgilangan, lekin barcha brauzerlarda ishlaydi va
        // bu yerda qo'shimcha kutubxona qo'shmaslik uchun ataylab tanlangan.
        document.execCommand(cmd, false, null);
        onChange(ref.current?.innerHTML || '');
    };

    return (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-slate-50 border-b border-gray-200">
                {TOOLS.map((t, i) => t.sep ? (
                    <span key={`s${i}`} className="w-px h-4 bg-gray-300 mx-1" />
                ) : (
                    <button
                        key={t.cmd}
                        type="button"
                        title={t.title}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => exec(t.cmd)}
                        className="p-1.5 rounded hover:bg-gray-200 text-gray-600"
                    >
                        <t.icon size={13} />
                    </button>
                ))}
            </div>
            <div
                ref={ref}
                contentEditable
                suppressContentEditableWarning
                data-placeholder={placeholder}
                onInput={e => onChange(e.currentTarget.innerHTML)}
                className="px-3 py-2 text-sm outline-none prose-sm empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
                style={{ minHeight }}
            />
        </div>
    );
};

export default RichTextEditor;
