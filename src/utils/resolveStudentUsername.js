import { db } from '../services/db';

// ===========================================================================
// TALABANI LOGIN (username) GA KELTIRISH
//
// Loyihada talaba UCH XIL identifikator bilan yuriydi:
//   * profil UUID           - `profiles.id`, `memberships.user_id`
//   * login (username)      - `notifications`, `student_passport`,
//                             `student_cv_profile` - RLS aynan shuni
//                             `current_username()` bilan solishtiradi
//   * mock/sintetik `id`    - 'student_42' yoki eski yozuvlarda loginning o'zi
//
// Shuning uchun "talabaning ID si" degan narsa yo'q - qaysi jadval bilan
// ishlayotganingga qarab boshqa qiymat kerak. Bu yordamchi qaysi biri
// berilganidan qat'i nazar LOGINni qaytaradi.
//
// Nima uchun kerak bo'ldi: `StudentPassportCard` ga admin ro'yxati UUID
// uzatardi (`detail.student.id`), talabaning o'z sahifasi esa loginni
// (`user.username`). Natijada admin kiritgan pasport ma'lumoti login emas,
// UUID kaliti bilan saqlanib, talabaning o'ziga ham, `getStudentContact` ga
// ham ko'rinmay qolardi.
// ===========================================================================
export const resolveStudentUsername = (studentId, student = null) => {
    if (student?.username) return student.username;
    const raw = studentId || student?.id || null;
    if (!raw) return null;
    const profiles = db.getSyncedProfiles() || [];
    const hit = profiles.find(p => p.username === raw || p.id === raw);
    // Topilmasa XOM QIYMAT qaytadi: sintetik talabada (`student_42`) yoki
    // eski yozuvda (id ning o'zi login) boshqa qiymat yo'q va uni yo'qotib
    // qo'yish - kartani butunlay bo'sh qoldirish demak.
    return hit?.username || raw;
};

export default resolveStudentUsername;
