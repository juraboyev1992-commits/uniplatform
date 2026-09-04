import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const Modal = ({
    isOpen,
    onClose,
    title,
    children,
    size = 'md',
    showCloseButton = true
}) => {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }

        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const sizes = {
        sm: 'max-w-md',
        md: 'max-w-2xl',
        lg: 'max-w-4xl',
        xl: 'max-w-6xl',
        full: 'max-w-full mx-4'
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black bg-opacity-50 transition-opacity animate-fade-in"
                onClick={onClose}
            />

            {/* Modal.
                BALANDLIK CHEGARALANGAN: oyna ekran balandligining 90% idan
                oshmaydi va ichidagi matn o'z ichida siljiydi.

                Ilgari oyna kontent qancha bo'lsa shuncha cho'zilardi va uzun
                forma ekrandan chiqib ketardi - sarlavha ham, pastdagi
                "Saqlash" tugmasi ham ko'rinmay qolardi. Butun sahifani
                siljitish yordam bermasdi, chunki fon `fixed`.

                Sarlavha va kontent alohida: sarlavha JOYIDA qoladi, faqat
                kontent siljiydi - foydalanuvchi qaysi oynada ekanini
                yo'qotmasin. */}
            <div className="flex min-h-full items-center justify-center p-4">
                <div
                    className={`
            relative bg-white rounded-2xl shadow-2xl w-full ${sizes[size]}
            max-h-[90vh] flex flex-col animate-scale-in
          `}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    {(title || showCloseButton) && (
                        <div className="flex items-center justify-between gap-3 p-6 border-b border-gray-200 shrink-0">
                            {title && (
                                <h2 className="text-2xl font-bold text-gray-900 min-w-0 truncate">{title}</h2>
                            )}
                            {showCloseButton && (
                                <button
                                    onClick={onClose}
                                    className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100 shrink-0"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            )}
                        </div>
                    )}

                    {/* Content */}
                    <div className="p-6 overflow-y-auto">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Modal;
