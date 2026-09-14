import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../services/db';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth AuthContext ichida ishlatilishi kerak');
    }
    return context;
};

// Rollar
// DIQQAT: bu ro'yxat `constants/index.js` dagi USER_ROLES bilan bir xil
// bo'lishi SHART - ikkalasi ham qo'lda yozilgan (tarixiy takrorlanish).
// Bittasiga rol qo'shib, ikkinchisini unutish jimgina buzilishga olib keladi.
export const ROLES = {
    STUDENT: 'TALABA',
    ADMIN: 'ADMINISTRATOR',
    MANAGEMENT: 'RAHBARIYAT',
    TUTOR: 'TYUTOR'
};

// Supabase Auth is email/phone-based; this app's UI and every `user.username` reference throughout the
// codebase (dozens of call sites, never touched by this Phase 1 migration) is username-based — bridge
// with a synthetic address so nothing else has to change. Real password-reset-by-email isn't meaningful
// for these synthetic addresses; an accepted Phase 1 limitation, not a bug.
const usernameToEmail = (username) => `${username.trim().toLowerCase()}@uniplatform.local`;

// Maps a `profiles` row (snake_case, from Supabase) onto the exact shape the rest of the app already
// expects from `user` (camelCase — user.role/user.username/user.fullName etc.), so no other file needs
// to change. `id` is now the real Supabase auth UUID (nothing in the app reads `user.id` today, confirmed
// via a full-codebase grep before this change) — `username` stays the plain string identity everything
// else keys on.
const buildUserFromProfile = (profile) => ({
    id: profile.id,
    username: profile.username,
    fullName: profile.full_name,
    role: profile.role,
    faculty: profile.faculty,
    course: profile.course,
    group: profile.student_group,
    studentId: profile.student_id,
    gender: profile.gender,
    professionalism: profile.professionalism,
    avatar: null
});

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [clubRoles, setClubRoles] = useState([]); // Array of memberships
    // Sinxronlash yiqilgan bo'lsa - xato matni, aks holda null.
    // DashboardLayout shunga qarab "ma'lumot to'liq yuklanmadi" ogohlantirishini
    // va "Qayta urinish" tugmasini ko'rsatadi.
    const [syncError, setSyncError] = useState(null);

    // SINXRONLASH FOYDALANUVCHINI TASHQARIDA QOLDIRMASLIGI KERAK.
    //
    // Kirishda ~30 ta jadval yuklanadi va ulardan bittasi yiqilsa (masalan
    // internet bir lahza uzilsa) butun sinxronlash xato tashlaydi. Ilgari bu
    // xato to'g'ridan-to'g'ri kirish jarayonini to'xtatardi: parol TO'G'RI
    // bo'lsa ham koordinator kira olmasdi, sahifa yangilanganda esa tizimdan
    // chiqarib yuborilardi - va nima uchunligi hech qayerda yozilmasdi.
    //
    // Endi xato ushlanadi, foydalanuvchi baribir kiradi va ekranda aniq
    // ogohlantirish chiqadi. Eski ma'lumotni jimgina ko'rsatish yolg'on
    // bo'lardi, kirgizmaslik esa haddan ortiq - o'rtasi shu.
    const syncSafely = async () => {
        try {
            await db.syncCoreDataFromSupabase();
            setSyncError(null);
            return true;
        } catch (e) {
            console.error('[sinxronlash] yiqildi:', e);
            setSyncError(e?.message || String(e));
            return false;
        }
    };

    const loadProfileAndMemberships = async (authUser) => {
        const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', authUser.id).single();
        if (error || !profile) {
            // Signed in with Supabase but the profiles row hasn't landed yet (the on_auth_user_created
            // trigger can lag a beat right after signUp) — treat as signed-out rather than crash; the
            // caller retries via onAuthStateChange once the row exists.
            setUser(null);
            setClubRoles([]);
            return;
        }
        // Bir martalik qisqa qayta urinish: vaqtinchalik uzilishlarning
        // ko'pchiligi shu bilan o'tib ketadi va foydalanuvchi ogohlantirishni
        // umuman ko'rmaydi.
        if (!(await syncSafely())) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            await syncSafely();
        }
        setUser(buildUserFromProfile(profile));
        setClubRoles(db.getUserMemberships(profile.id));
    };

    useEffect(() => {
        // `finally` hamma yo'lda: seansni o'qish yoki profilni yuklash qanday
        // tugashidan qat'i nazar yuklanish ekrani yopiladi. Ilgari seans
        // o'qishning o'zi xato bersa, sahifa cheksiz aylanib qolardi.
        supabase.auth.getSession()
            .then(({ data: { session } }) => (
                session?.user ? loadProfileAndMemberships(session.user) : null
            ))
            .catch(e => console.error('[kirish] seans yoki profil yuklanmadi:', e))
            .finally(() => setLoading(false));

        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                loadProfileAndMemberships(session.user)
                    .catch(e => console.error('[kirish] profil yuklanmadi:', e));
            }
            else {
                setUser(null);
                setClubRoles([]);
            }
        });

        return () => listener.subscription.unsubscribe();
    }, []);

    const login = async (username, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
        if (error) throw new Error("Login yoki parol noto'g'ri");
        await loadProfileAndMemberships(data.user);
        return data.user;
    };

    // New — Phase 1 adds real signup (the old system only had 3 hardcoded demo logins). Every new
    // account defaults to TALABA (see the `profiles` table's own default) — becoming ADMINISTRATOR/
    // RAHBARIYAT is a manual one-time step in Supabase's Table Editor, by design (no self-service
    // privilege escalation).
    const signUp = async (username, password, fullName) => {
        const cleanUsername = username.trim().toLowerCase();
        const { data, error } = await supabase.auth.signUp({
            email: usernameToEmail(cleanUsername),
            password,
            options: { data: { username: cleanUsername, full_name: fullName } }
        });
        if (error) throw new Error(error.message);
        if (data.user) await loadProfileAndMemberships(data.user);
        return data.user;
    };

    const logout = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setClubRoles([]);
        setSyncError(null);
    };

    const hasRole = (role) => {
        return user?.role === role;
    };

    const hasAnyRole = (roles) => {
        return roles.includes(user?.role);
    };

    // Check if user has a specific role in a specific club
    const hasClubRole = (clubId, roles = ['head_coordinator', 'coordinator']) => {
        if (user?.role === ROLES.ADMIN) return true; // Admins have full access
        const membership = clubRoles.find(m => m.clubId === clubId);
        if (!membership) return false;
        return roles.includes(membership.role);
    };

    // Foydalanuvchi ISTALGAN klubda koordinatormi? Klub koordinatorligi ROL emas - u TALABA
    // rolining ustidagi klub a'zoligi, shuning uchun `user.role` dan bilib bo'lmaydi.
    //
    // Nima uchun kerak: rag'bat taklifi kabi bo'limlar aynan shu vakolatga bog'liq. Ilgari
    // ular menyuda HAMMA talabaga ko'rinardi va vakolati yo'q talaba ochganda bo'sh sahifa
    // bilan qolardi - nima uchun bo'shligi ham tushuntirilmasdi.
    const isClubManager = user?.role === ROLES.ADMIN
        || clubRoles.some(m => ['coordinator', 'head_coordinator'].includes(m.role));

    // Refresh memberships (call this after joining/leaving a club)
    const refreshClubRoles = async () => {
        if (user) {
            await syncSafely();
            setClubRoles(db.getUserMemberships(user.id));
        }
    };

    // Ogohlantirishdagi "Qayta urinish" tugmasi uchun.
    const retrySync = async () => {
        const ok = await syncSafely();
        if (ok && user) setClubRoles(db.getUserMemberships(user.id));
        return ok;
    };

    const value = {
        user,
        clubRoles,
        login,
        signUp,
        logout,
        hasRole,
        hasAnyRole,
        hasClubRole,
        isClubManager,
        refreshClubRoles,
        syncError,
        retrySync,
        isAuthenticated: !!user,
        loading
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
