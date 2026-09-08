import { SOCIAL_APPLICATION_STATUS } from '../services/db';
import { RECOGNITION_STATUS } from '../config/studentRecognitions.js';

// ISH NAVBATI — menyudagi qizil raqamlar shu yerdan chiqadi.
//
// TAMOYIL: badge STATISTIKA EMAS, CHAQIRUV. Raqam "bu bo'limda 24 ta ariza bor"
// degani emas, "SIZDAN 24 ta ish kutilyapti" degani. Shuning uchun har bir navbat
// rolga/vakolatga bog'langan: koordinator o'zi tega olmaydigan arizani ko'rmaydi.
// Aks holda odam badge'ni bosib, hech narsa qila olmagach, unga ishonmay qo'yadi.
//
// "O'QILDI" MODELI: badge JAMI ishni emas, YANGI ishni ko'rsatadi. Foydalanuvchi
// tegishli tabni ochgach raqam yo'qoladi; yangi ariza kelsa qaytadan chiqadi.
// Buning uchun har bir element sanasi (`at`) va navbatning oxirgi ko'rilgan vaqti
// solishtiriladi. Jami son baribir bo'lim ichida ko'rinib turadi, ya'ni ish
// unutilmaydi — badge faqat "yangi nima bor" savoliga javob beradi.
//
// Har bir navbat:
//   key      - "o'qildi" belgisi shu kalit bo'yicha saqlanadi
//   path     - bosilganda ochiladigan manzil (bo'lim + tab)
//   menuPath - menyudagi qaysi element ustida raqam chiqishi
//   items    - kutilayotgan yozuvlar
//   at       - yozuvning sanasi (yangi/eski ekanini shu hal qiladi)

const at = (...fields) => (item) => {
    for (const f of fields) if (item?.[f]) return item[f];
    return null;
};

// Bir navbatni tavsiflash. `items` HAR DOIM massiv bo'lishi kerak - getter yo'q
// bo'lsa bo'sh massiv (eski nusxada funksiya bo'lmasligi mumkin).
const q = (key, menuPath, path, label, items, atOf) => ({
    key, menuPath, path, label,
    items: Array.isArray(items) ? items : [],
    at: atOf,
});

const safe = (fn, fallback = []) => {
    try { const v = fn(); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
};

// --- ADMIN ---
const adminQueues = (db) => [
    q('social_apps', '/admin/social-activity', '/admin/social-activity?bolim=ish&jarayon=tasdiqlash',
        'Ijtimoiy faollik arizalari',
        safe(() => db.getSocialApplications().filter(a => a.status === SOCIAL_APPLICATION_STATUS.PENDING)),
        at('submittedAt', 'createdAt')),

    q('index_evidence', '/admin/social-activity', '/admin/social-activity?bolim=ish&jarayon=tasdiqlash',
        'Asoslovchi hujjatlar',
        safe(() => db.getIndexEvidence().filter(e => e.status === 'pending')),
        at('uploadedAt', 'createdAt')),

    q('scholarship_apps', '/admin/talent', '/admin/talent?tab=applications',
        'Stipendiya arizalari',
        safe(() => db.getScholarshipApplications().filter(a => a.status === 'Kutilmoqda')),
        at('submittedAt', 'createdAt')),

    q('recognition', '/admin/awards', '/admin/awards?bolim=jarayon&jarayon=pending',
        "Rag'bat takliflari",
        safe(() => db.getStudentRecognitions({ status: RECOGNITION_STATUS.PENDING })),
        at('proposedAt', 'createdAt')),

    q('positions', '/admin/clubs-directory', '/admin/clubs-directory',
        'Klub lavozimiga arizalar',
        safe(() => db.getAdminPendingPositionApplications()),
        at('submittedAt', 'createdAt')),

    q('registrations', '/admin/events', '/admin/events',
        "Ro'yxatdan o'tish so'rovlari",
        safe(() => db.getPendingRegistrationApprovals()),
        at('createdAt', 'registeredAt')),

    q('marifat_unmarked', '/admin/marifat', '/admin/marifat',
        'Davomati belgilanmagan darslar',
        safe(() => db.getMarifatLessons().filter(l => (db.getMarifatAttendance(l.id) || []).length === 0)),
        at('date', 'createdAt')),
];

// --- TYUTOR ---
const tutorQueues = (db) => [
    q('confirm_requests', '/tutor/workspace', '/tutor/workspace',
        "Mezon tasdiqlash so'rovlari",
        safe(() => db.getPendingConfirmationRequests()),
        at('requestedAt', 'createdAt')),

    q('marifat_unmarked_tutor', '/tutor/marifat', '/tutor/marifat',
        'Davomati belgilanmagan darslar',
        safe(() => db.getMarifatLessons().filter(l => (db.getMarifatAttendance(l.id) || []).length === 0)),
        at('date', 'createdAt')),
];

// --- TALABA ---
// Talabaga faqat O'ZIDAN harakat kutilayotgan narsa ko'rsatiladi. "Arizam ko'rib
// chiqilmoqda" harakat emas - u kutish, va uni badge qilib qo'yish odamni behuda
// bezovta qiladi.
const studentQueues = (db, user) => {
    const me = user?.username;
    if (!me) return [];
    const mine = safe(() => db.getSocialApplications().filter(a => a.studentId === me));
    const regs = safe(() => db.getAllRegistrations().filter(r => r.status !== 'cancelled'));

    // MENGA kelgan, javob kutayotgan jamoa takliflari. Bu aynan navbatning
    // ta'rifiga to'g'ri keladi: mendan harakat kutilyapti va men uni qila olaman.
    const teamInvites = regs.flatMap(r => {
        const m = (r.teamMembers || []).find(x => x.userId === me && x.status === 'pending');
        return m ? [{ id: r.id, invitedAt: m.invitedAt || r.createdAt }] : [];
    });

    // MEN SARDOR bo'lgan, hali to'lmagan jamoalar. Sana - oxirgi javob vaqti:
    // shu sabab kimdir qabul qilsa yoki rad etsa raqam QAYTA chiqadi. Agar
    // sana ro'yxatdan o'tgan kun bo'lganida, sardor bir marta ko'rgach badge
    // butunlay yo'qolib, jamoasi jimgina to'lmay qolardi.
    const myPendingTeams = regs
        .filter(r => r.userId === me && r.participantType === 'team' && !r.teamConfirmedAt)
        .map(r => {
            const answered = (r.teamMembers || []).map(m => m.respondedAt).filter(Boolean).sort();
            return { id: r.id, changedAt: answered[answered.length - 1] || r.createdAt };
        });

    return [
        q('my_returned', '/student/social-activity', '/student/social-activity?bolim=indeks',
            "Qaytarilgan arizalaringiz",
            mine.filter(a => a.status === SOCIAL_APPLICATION_STATUS.RETURNED),
            at('reviewedAt', 'submittedAt')),

        q('team_invites', '/student/events', '/student/events',
            'Jamoa takliflari', teamInvites, at('invitedAt')),

        q('my_team_pending', '/student/events', '/student/events',
            "To'lmagan jamoangiz", myPendingTeams, at('changedAt')),
    ];
};

// --- KLUB KOORDINATORI (TALABA rolining ustidagi vakolat) ---
const coordinatorQueues = (db) => [
    q('incentive_pending', '/student/incentive-awards', '/student/incentive-awards?jarayon=pending',
        "Rag'bat takliflari",
        safe(() => db.getStudentRecognitions({ status: RECOGNITION_STATUS.PENDING })),
        at('proposedAt', 'createdAt')),
];

// Rolga qarab navbatlar to'plami.
export const buildWorkQueues = (db, user, { isClubManager = false } = {}) => {
    const role = user?.role;
    if (role === 'ADMINISTRATOR') return adminQueues(db);
    if (role === 'TYUTOR') return tutorQueues(db);
    if (role === 'TALABA') {
        return [...studentQueues(db, user), ...(isClubManager ? coordinatorQueues(db) : [])];
    }
    // RAHBARIYAT: kuzatuvchi rol, tasdiqlash navbati yo'q.
    return [];
};

// Menyu elementi -> yangi ishlar soni.
//
// Bo'lim raqami o'z tablarining YIG'INDISI: odam menyuda raqamni ko'rib bo'limga
// kiradi, keyin qaysi tabda ish borligini qidirmasligi kerak.
export const getMenuBadges = (db, user, { isClubManager = false } = {}) => {
    if (!user?.username) return {};
    const seen = db.getQueueSeenAt(user.username);
    const badges = {};
    buildWorkQueues(db, user, { isClubManager }).forEach(queue => {
        const since = seen[queue.key];
        const fresh = queue.items.filter(item => {
            if (!since) return true;              // hech qachon ochilmagan - hammasi yangi
            const t = queue.at(item);
            if (!t) return false;                 // sanasi yo'q - "yangi" deb hisoblamaymiz
            return new Date(t) > new Date(since);
        }).length;
        if (fresh > 0) badges[queue.menuPath] = (badges[queue.menuPath] || 0) + fresh;
    });
    return badges;
};

// Joriy manzilga tegishli navbatlarni "o'qildi" deb belgilash.
// Manzil navbatning `path` idagi bo'lim va (bo'lsa) tab bilan mos kelishi kerak -
// shunchaki bo'limga kirish boshqa tabdagi ishni o'qilgan qilib qo'ymasligi kerak.
export const queueKeysForLocation = (db, user, pathname, search, { isClubManager = false } = {}) => {
    if (!user?.username) return [];
    const params = new URLSearchParams(search || '');
    return buildWorkQueues(db, user, { isClubManager })
        .filter(queue => {
            const [qPath, qQuery] = queue.path.split('?');
            if (qPath !== pathname) return false;
            if (!qQuery) return true;
            // Navbat tab talab qilsa - manzildagi tab aynan o'sha bo'lishi kerak.
            return [...new URLSearchParams(qQuery).entries()]
                .every(([k, v]) => params.get(k) === v);
        })
        .map(queue => queue.key);
};
