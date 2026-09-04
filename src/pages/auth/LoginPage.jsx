import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { LogIn, UserPlus, Loader } from 'lucide-react';
import Button from '../../components/common/Button';

// Phase 1 real-backend migration: the old 3 hardcoded demo accounts (talaba/admin/rahbar, password
// 'password') no longer exist — real Supabase Auth accounts replace them. Added a signup mode since
// there was previously no way to create an account at all (only the 3 fixed demo logins). Every new
// signup defaults to TALABA; becoming ADMINISTRATOR/RAHBARIYAT is a manual one-time step an existing
// admin does directly in Supabase's Table Editor (see the migration plan) — no self-service UI for that
// here, by design.
const LoginPage = () => {
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
            if (mode === 'signup') {
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

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo and Title */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-2xl shadow-2xl mb-4">
                        <span className="text-4xl font-bold gradient-text">U</span>
                    </div>
                    <h1 className="text-4xl font-bold text-white mb-2">UniPlatform</h1>
                    <p className="text-primary-100">Universitet Boshqaruv Tizimi</p>
                </div>

                {/* Login Card */}
                <div className="bg-white rounded-2xl shadow-2xl p-8">
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

                    {error && (
                        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-600">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode === 'signup' && (
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
                </div>

                {/* Footer */}
                <p className="text-center text-primary-100 text-sm mt-6">
                    © 2024 UniPlatform. Barcha huquqlar himoyalangan.
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
