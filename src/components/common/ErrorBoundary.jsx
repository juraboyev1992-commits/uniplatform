import React from 'react';
import {
    isChunkLoadError,
    isReloadingForNewVersion,
    reloadOnceForNewVersion,
} from '../../utils/chunkReload';

// XATO EKRANI.
//
// Butun ilovani o'raydi (main.jsx), ya'ni bitta sahifadagi xato butun
// platformani shu ekranga almashtiradi. Shuning uchun u foydalanuvchiga
// CHIQISH YO'LINI berishi shart. Ilgari u inglizcha "Something went wrong"
// deb yozardi va sahifani yangilash tugmasi ham yo'q edi - koordinator
// nima qilishini bilmay qolardi.
//
// YANGI VERSIYA HOLATI ALOHIDA: deploy'dan keyin ochiq turgan sahifa eski
// faylni so'raydi va u serverda yo'q. Bu foydalanuvchining xatosi emas,
// shuning uchun xato deb ko'rsatilmaydi - sahifa o'zi bir marta yangilanadi
// (utils/chunkReload.js).
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null, updating: false };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Ushlanmagan xato:', error, errorInfo);
        if (isChunkLoadError(error) && reloadOnceForNewVersion()) {
            this.setState({ updating: true });
            return;
        }
        this.setState({ errorInfo });
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        // `isReloadingForNewVersion` - yangilash `vite:preloadError` orqali
        // allaqachon boshlangan va bu xato uning oqibati (React.lazy bo'sh
        // modul olgan). Sahifa hozir almashadi, xato ekranini ko'rsatish
        // foydalanuvchini bekorga qo'rqitardi.
        if (this.state.updating || isReloadingForNewVersion()) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
                    <p className="text-sm font-semibold text-slate-600">
                        Platformaning yangi versiyasi yuklanmoqda…
                    </p>
                </div>
            );
        }

        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
                <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
                    <h1 className="text-xl font-black text-slate-900">Sahifada xatolik yuz berdi</h1>
                    <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                        Kiritgan ma'lumotlaringiz saqlangan bo'lishi mumkin — oxirgi amalni
                        takrorlashdan oldin sahifani yangilab, tekshirib ko'ring.
                        Xato qaytarilsa, skrinshot olib administratorga yuboring.
                    </p>

                    <div className="flex flex-wrap gap-2 mt-6">
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="px-4 py-2.5 rounded-xl bg-blue-800 hover:bg-blue-900 text-white text-sm font-bold"
                        >
                            Sahifani yangilash
                        </button>
                        <button
                            type="button"
                            onClick={() => window.location.assign('/')}
                            className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50"
                        >
                            Bosh sahifaga qaytish
                        </button>
                    </div>

                    {/* Texnik tafsilot yashirin: foydalanuvchiga keraksiz, lekin
                        skrinshotda administrator uni ochib ko'ra oladi. */}
                    <details className="mt-6">
                        <summary className="text-xs text-slate-400 cursor-pointer">
                            Texnik ma'lumot (administrator uchun)
                        </summary>
                        <p className="mt-2 text-xs font-mono text-slate-600 break-words">
                            {String(this.state.error?.message || this.state.error || '')}
                        </p>
                        {this.state.errorInfo?.componentStack && (
                            <pre className="mt-2 text-[10px] text-slate-400 whitespace-pre-wrap max-h-48 overflow-auto">
                                {this.state.errorInfo.componentStack}
                            </pre>
                        )}
                    </details>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
