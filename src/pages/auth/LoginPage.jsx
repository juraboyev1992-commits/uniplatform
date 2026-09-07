import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LogIn, UserPlus, Loader, ShieldCheck, Briefcase, UserCheck, ArrowLeft } from 'lucide-react';
import Button from '../../components/common/Button';

// Har rol uchun ALOHIDA kirish sahifasi (bitta komponent, `variant` bilan):
//   /            -> talaba: kirish + ro'yxatdan o'tish (asosiy sahifa)
//   /admin       -> administrator: faqat kirish
//   /rahbariyat  -> rahbariyat:    faqat kirish
//   /tyutor      -> tyutor:        faqat kirish
//
// MUHIM: bu bo'linish faqat KIRISH NUQTASI, huquq emas. Rol har doim bazadagi
// `profiles.role` dan keladi - qaysi sahifadan kirilganidan qat'i nazar, foydalanuvchi
// o'z rolining paneliga tushadi. Ya'ni /admin sahifasidan kirgan talaba baribir
// talaba panelini ko'radi; bu sahifalar hech kimga qo'shimcha huquq bermaydi.
//
// Ro'yxatdan o'tish FAQAT talaba sahifasida bor: xodim akkauntlari qo'lda beriladi
// (o'zicha admin bo'lib olish yo'li yo'q - migratsiya rejasidagi qaror).
const VARIANTS = {
    student: {
        title: 'UniPlatform',
        subtitle: 'Universitet Boshqaruv Tizimi',
        // O'z-o'zidan ro'yxatdan o'tish YOPILGAN: akkauntni administrator yaratadi
        // (Sozlamalar -> Foydalanuvchilar) va login/parolni foydalanuvchiga beradi.
        // Qayta ochish kerak bo'lsa - shu qiymatni `true` qilish kifoya, signUp
        // oqimi va formasi joyida turibdi.
        allowSignup: false,
        icon: null,
        badge: null,
        shell: 'bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700',
        footText: 'text-primary-100',
    },
    admin: {
        title: 'Administrator',
        subtitle: 'Boshqaruv paneliga kirish',
        allowSignup: false,
        icon: ShieldCheck,
        badge: 'Administrator kirishi',
        shell: 'bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950',
        footText: 'text-slate-400',
    },
    management: {
        title: 'Rahbariyat',
        subtitle: 'Rahbariyat paneliga kirish',
        allowSignup: false,
        icon: Briefcase,
        badge: 'Rahbariyat kirishi',
        shell: 'bg-gradient-to-br from-slate-800 via-slate-900 to-emerald-950',
        footText: 'text-slate-400',
    },
    tutor: {
        title: 'Tyutor',
        subtitle: 'Tyutor ish maydoniga kirish',
        allowSignup: false,
        icon: UserCheck,
        badge: 'Tyutor kirishi',
        shell: 'bg-gradient-to-br from-slate-800 via-slate-900 to-amber-950',
        footText: 'text-slate-400',
    },
};

const LoginPage = ({ variant = 'student' }) => {
    const cfg = VARIANTS[variant] || VARIANTS.student;
    const { login, signUp } = useAuth();
    const [mode, setMode] = useState('login'); // 'login' | 'signup'
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (mode === 'signup' && cfg.allowSignup) {
                await signUp(username, password, fullName);
            } else {
                await login(username, password);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const Icon = cfg.icon;

    return (
        <div className={`min-h-screen ${cfg.shell} flex items-center justify-center p-4`}>
            <div className="w-full max-w-md">
                {/* Logo va sarlavha */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-2xl shadow-2xl mb-4">
                        {Icon
                            ? <Icon className="w-9 h-9 text-slate-800" />
                            : <span className="text-4xl font-bold gradient-text">U</span>}
                    </div>
                    <h1 className="text-4xl font-bold text-white mb-2">{cfg.title}</h1>
                    <p className={cfg.footText}>{cfg.subtitle}</p>
                </div>

                {/* Kirish kartasi */}
                <div className="bg-white rounded-2xl shadow-2xl p-8">
                    {cfg.badge && (
                        <div className="mb-6 text-center">
                            <span className="inline-block px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-wide">
                                {cfg.badge}
                            </span>
                        </div>
                    )}

                    {cfg.allowSignup && (
                        <div className="flex items-center gap-2 mb-6 bg-gray-100 rounded-xl p-1">
                            <button
                                type="button"
                                onClick={() => { setMode('login'); setError(''); }}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${mode === 'login' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
                            >
                                Tizimga kirish
                            </button>
                            <button
                                type="button"
                                onClick={() => { setMode('signup'); setError(''); }}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${mode === 'signup' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
                            >
                                Ro'yxatdan o'tish
                            </button>
                        </div>
                    )}

                    {error && (
                        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-600">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode === 'signup' && cfg.allowSignup && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Ism familiya
                                </label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                    placeholder="Ism familiyangizni kiriting"
                                    required
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Foydalanuvchi nomi
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                placeholder="Foydalanuvchi nomini kiriting"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Parol
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                placeholder={mode === 'signup' ? 'Kamida 6 ta belgi' : 'Parolni kiriting'}
                                minLength={mode === 'signup' ? 6 : undefined}
                                required
                            />
                        </div>

                        <Button
                            type="submit"
                            variant="primary"
                            className="w-full"
                            disabled={loading}
                            icon={loading ? Loader : mode === 'signup' ? UserPlus : LogIn}
                        >
                            {loading ? 'Yuklanmoqda...' : mode === 'signup' ? "Ro'yxatdan o'tish" : 'Kirish'}
                        </Button>
                    </form>

                    {!cfg.allowSignup && (
                        <p className="mt-5 text-center text-xs text-gray-400">
                            {variant === 'student'
                                ? "Akkaunt universitet ma'muriyati tomonidan beriladi. Login yoki parolni bilmasangiz, mas'ul xodimga murojaat qiling."
                                : 'Xodim akkaunti universitet administratori tomonidan beriladi.'}
                        </p>
                    )}
                </div>

                {/* Xodim sahifalaridan talaba sahifasiga qaytish */}
                {variant !== 'student' && (
                    <div className="text-center mt-6">
                        <Link
                            to="/"
                            className={`inline-flex items-center gap-1.5 text-sm ${cfg.footText} hover:text-white transition-colors`}
                        >
                            <ArrowLeft className="w-4 h-4" /> Talabalar uchun kirish
                        </Link>
                    </div>
                )}

                <p className={`text-center ${cfg.footText} text-sm mt-6`}>
                    © 2026 UniPlatform. Barcha huquqlar himoyalangan.
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
