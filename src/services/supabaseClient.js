import { createClient } from '@supabase/supabase-js';

// Phase 1 of the real-backend migration (see plan) — real auth + clubs/memberships live in Supabase;
// everything else in db.js still reads/writes localStorage, unchanged, until later phases migrate it too.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY topilmadi — .env.local faylini tekshiring.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// FAQAT dev rejimida: brauzer konsolidan seansni tekshirish uchun.
// RLS xatolarini ("new row violates row-level security policy") tashxislashda kerak -
// so'rov `authenticated` roli ostida ketyaptimi yoki `anon` bo'lib qolganmi, shu bilan
// aniqlanadi. Prodakshn bundle'ga tushmaydi.
if (import.meta.env.DEV && typeof window !== 'undefined') {
    window.supabase = supabase;
    window.sessionRole = async () => {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return { role: 'SEANS YO\'Q (anon)', session: null };
        const payload = JSON.parse(atob(data.session.access_token.split('.')[1]));
        return {
            role: payload.role,
            username: payload.user_metadata?.username,
            expiresAt: new Date(payload.exp * 1000).toLocaleString(),
            expired: payload.exp * 1000 < Date.now(),
        };
    };
}
