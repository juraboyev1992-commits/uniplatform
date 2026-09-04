// HEMIS integratsiyasi — akademik ko'rsatkichlarni (GPA) tashqi tizimdan olish.
//
// NIMA UCHUN BRAUZERDAN TO'G'RIDAN-TO'G'RI EMAS:
//   1. Token. HEMIS API kaliti brauzer kodiga tushsa, uni har qanday foydalanuvchi
//      DevTools'dan ko'chirib oladi. Kalit faqat serverda turishi shart.
//   2. CORS. HEMIS serveri uniplatform domenidan so'rov qabul qilishi dargumon.
//
// Shuning uchun oqim: brauzer -> Supabase Edge Function (proksi) -> HEMIS.
// Edge Function kodi: supabase/functions/hemis-sync/index.ts
//
// DIQQAT: bu integratsiya SINALMAGAN — HEMIS manzili va tokeni bo'lmagani uchun
// men uni ishga tushirib ko'ra olmadim. Maydon nomlari (fieldMap) sozlanadigan
// qilib qo'yilgan, chunki HEMIS javobining aniq shakli oldindan ma'lum emas.

import { supabase } from './supabaseClient.js';

// HEMIS javobidagi maydonlarni platformaning maydonlariga moslashtirish.
// Real javob boshqacha bo'lsa - Sozlamalardan o'zgartiriladi, kod tegilmaydi.
export const DEFAULT_FIELD_MAP = {
    studentId: 'student_id_number',
    academicYear: 'education_year',
    semester: 'semester',
    gpa: 'gpa',
    credits: 'credit_sum',
};

// Edge Function'ni chaqiradi. Token u yerda, `HEMIS_TOKEN` maxfiy o'zgaruvchisida.
export const fetchHemisAcademicRecords = async ({ academicYear, semester, faculty = null } = {}) => {
    const { data, error } = await supabase.functions.invoke('hemis-sync', {
        body: { action: 'academic-records', academicYear, semester, faculty },
    });
    if (error) {
        throw new Error(
            `HEMIS bilan bog'lanib bo'lmadi: ${error.message}. `
            + "Edge Function o'rnatilganmi va HEMIS_TOKEN sozlanganmi?"
        );
    }
    if (data?.error) throw new Error(`HEMIS xatosi: ${data.error}`);
    return data?.records || [];
};

// Ulanishni sinash - sozlamalar to'g'riligini tekshirish uchun.
export const testHemisConnection = async () => {
    const { data, error } = await supabase.functions.invoke('hemis-sync', { body: { action: 'ping' } });
    if (error) return { ok: false, message: error.message };
    if (data?.error) return { ok: false, message: data.error };
    return { ok: true, message: data?.message || 'Ulanish muvaffaqiyatli' };
};

// HEMIS javobidagi xom qatorlarni platformaning academic_records shakliga keltiradi.
export const normalizeHemisRecords = (rows, fieldMap = DEFAULT_FIELD_MAP) => {
    const pick = (row, key) => {
        const path = fieldMap[key];
        if (!path) return null;
        // "a.b.c" ko'rinishidagi ichma-ich maydonlarni ham qo'llab-quvvatlaydi.
        return path.split('.').reduce((acc, part) => (acc == null ? null : acc[part]), row);
    };

    return (rows || [])
        .map(row => {
            const gpaRaw = pick(row, 'gpa');
            return {
                studentId: String(pick(row, 'studentId') ?? '').trim(),
                academicYear: String(pick(row, 'academicYear') ?? '').trim(),
                semester: Number(pick(row, 'semester')) || null,
                gpa: gpaRaw === null || gpaRaw === undefined || gpaRaw === '' ? null : Number(gpaRaw),
                credits: pick(row, 'credits') === null ? null : Number(pick(row, 'credits')),
            };
        })
        .filter(r => r.studentId && r.academicYear && r.semester);
};

// CSV/Excel'dan import - HEMIS ulanmagan bo'lsa ham modul ishlab tursin.
// Kutilgan ustunlar: studentId, academicYear, semester, gpa, credits
export const parseAcademicCsv = (text) => {
    const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { rows: [], errors: ["Fayl bo'sh yoki sarlavha qatori yo'q"] };

    const delimiter = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    const required = ['studentId', 'academicYear', 'semester', 'gpa'];
    const missing = required.filter(r => !headers.includes(r));
    if (missing.length > 0) {
        return { rows: [], errors: [`Ustunlar yetishmayapti: ${missing.join(', ')}`] };
    }

    const rows = [];
    const errors = [];
    lines.slice(1).forEach((line, i) => {
        const cells = line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
        const row = Object.fromEntries(headers.map((h, j) => [h, cells[j]]));
        const gpa = row.gpa === '' ? null : Number(String(row.gpa).replace(',', '.'));
        if (gpa !== null && (!Number.isFinite(gpa) || gpa < 0 || gpa > 5)) {
            errors.push(`${i + 2}-qator: GPA noto'g'ri ("${row.gpa}")`);
            return;
        }
        if (!row.studentId || !row.academicYear || !row.semester) {
            errors.push(`${i + 2}-qator: majburiy maydon bo'sh`);
            return;
        }
        rows.push({
            studentId: row.studentId,
            academicYear: row.academicYear,
            semester: Number(row.semester),
            gpa,
            credits: row.credits ? Number(String(row.credits).replace(',', '.')) : null,
        });
    });

    return { rows, errors };
};
