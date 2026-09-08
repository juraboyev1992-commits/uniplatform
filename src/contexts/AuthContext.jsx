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
        await db.syncCoreDataFromSupabase();
        setUser(buildUserFromProfile(profile));
        setClubRoles(db.getUserMemberships(profile.id));
    };

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) loadProfileAndMemberships(session.user).finally(() => setLoading(false));
            else setLoading(false);
        });

        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) loadProfileAndMemberships(session.user);
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
            await db.syncCoreDataFromSupabase();
            setClubRoles(db.getUserMemberships(user.id));
        }
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
        isAuthenticated: !!user,
        loading
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
