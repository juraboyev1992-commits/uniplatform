// Supabase Edge Function — HEMIS proksi.
//
// NIMA UCHUN KERAK:
//   Brauzerdan HEMIS'ga to'g'ridan-to'g'ri murojaat qilish mumkin emas:
//     - API token brauzer kodiga tushib, har kimga ko'rinib qoladi;
//     - HEMIS serveri CORS bo'yicha uniplatform domenini rad etishi mumkin.
//   Shu funksiya token bilan HEMIS'ga o'zi murojaat qiladi va faqat kerakli
//   ma'lumotni qaytaradi.
//
// O'RNATISH:
//   1. supabase secrets set HEMIS_TOKEN="..." HEMIS_BASE_URL="https://hemis.example.uz"
//   2. supabase functions deploy hemis-sync
//
// DIQQAT: bu kod SINALMAGAN — HEMIS manzili va tokeni bo'lmagani uchun uni
// haqiqiy javob bilan tekshirib ko'rish imkoni bo'lmadi. `endpoint` va javob
// shakli real HEMIS hujjatiga qarab moslashtirilishi kerak.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

    const token = Deno.env.get('HEMIS_TOKEN');
    const baseUrl = Deno.env.get('HEMIS_BASE_URL');

    if (!token || !baseUrl) {
        return json({ error: 'HEMIS_TOKEN yoki HEMIS_BASE_URL sozlanmagan' }, 400);
    }

    let body: Record<string, unknown> = {};
    try {
        body = await req.json();
    } catch {
        return json({ error: "So'rov tanasi JSON emas" }, 400);
    }

    const action = String(body.action || '');

    // Sozlamalar to'g'riligini tekshirish.
    if (action === 'ping') {
        try {
            const res = await fetch(`${baseUrl}/api/v1/health`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return json({
                message: res.ok
                    ? `HEMIS javob berdi (HTTP ${res.status})`
                    : `HEMIS HTTP ${res.status} qaytardi`,
                ok: res.ok,
            });
        } catch (e) {
            return json({ error: `Ulanib bo'lmadi: ${(e as Error).message}` }, 502);
        }
    }

    if (action === 'academic-records') {
        const { academicYear, semester, faculty } = body as {
            academicYear?: string; semester?: number; faculty?: string;
        };

        const params = new URLSearchParams();
        if (academicYear) params.set('education_year', String(academicYear));
        if (semester) params.set('semester', String(semester));
        if (faculty) params.set('faculty', String(faculty));
        params.set('limit', '2000');

        try {
            // Endpoint nomi real HEMIS hujjatiga qarab o'zgartirilishi mumkin.
            const res = await fetch(`${baseUrl}/api/v1/data/student-list?${params}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            });

            if (!res.ok) {
                return json({ error: `HEMIS HTTP ${res.status}` }, 502);
            }

            const payload = await res.json();
            // HEMIS odatda { data: { items: [...] } } shaklida qaytaradi; boshqa
            // variantlar ham qamrab olingan.
            const records = payload?.data?.items ?? payload?.items ?? payload?.data ?? payload;

            return json({ records: Array.isArray(records) ? records : [] });
        } catch (e) {
            return json({ error: (e as Error).message }, 502);
        }
    }

    return json({ error: `Noma'lum amal: ${action}` }, 400);
});
