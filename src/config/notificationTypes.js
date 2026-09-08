// XABAR TURLARI — sozlama TAB bo'yicha emas, TUR bo'yicha.
//
// Nega tur: odam "Tasdiqlash tabidan xabar kelsin" deb o'ylamaydi, "yangi musobaqalar
// haqida aytinglar, klub yangiliklari kerak emas" deb o'ylaydi. Ustiga tablar o'zgaradi
// (bo'limlar birlashtirildi, tablar ko'chdi) - sozlama tabga bog'langan bo'lsa har
// o'zgarishda foydalanuvchining tanlovi buzilardi. Tur esa o'z joyini `refType` orqali
// baribir biladi, ya'ni "bosganda to'g'ri joyga borish" ishlayveradi.
//
// `optional: false` - O'CHIRIB BO'LMAYDI. Bular reklama emas, ISH:
// talaba "arizam qaytarildi" xabarini o'chirsa arizasi muddatsiz osilib qoladi;
// mas'ul tasdiqlash navbatini o'chirsa butun oqim to'xtaydi. Shuning uchun ular
// sozlamada ko'rinadi, lekin o'chirilmaydi - sabab ham yozib qo'yiladi.
export const NOTIFICATION_TYPES = {
    new_activity: {
        id: 'new_activity',
        label: 'Yangi musobaqa va tadbirlar',
        description: "E'lon qilinganda xabar keladi",
        optional: true,
        audience: 'student',
    },
    registration_deadline: {
        id: 'registration_deadline',
        label: "Ro'yxatdan o'tish muddati",
        description: "Muddat yopilishiga oz qolganda eslatiladi",
        optional: true,
        audience: 'student',
    },
    activity_reminder: {
        id: 'activity_reminder',
        label: 'Tadbir eslatmasi',
        description: "Ro'yxatdan o'tgan tadbiringizdan bir kun oldin",
        optional: true,
        audience: 'student',
    },
    club_news: {
        id: 'club_news',
        label: 'Klub yangiliklari',
        description: "A'zo bo'lgan klublaringizdagi o'zgarishlar",
        optional: true,
        audience: 'student',
    },
    application_status: {
        id: 'application_status',
        label: 'Arizangiz holati',
        description: 'Ariza qaytarilsa yoki tasdiqlansa — sizdan harakat kutiladi',
        optional: false,
        reason: "Ariza qaytarilganini bilmasangiz, u muddatsiz osilib qoladi",
        audience: 'student',
    },
    approval_queue: {
        id: 'approval_queue',
        label: 'Tasdiqlash navbati',
        description: 'Sizdan tasdiq kutayotgan arizalar',
        optional: false,
        reason: "O'chirilsa tasdiqlash oqimi jimgina to'xtab qoladi",
        audience: 'staff',
    },
};

export const NOTIFICATION_TYPE_ORDER = [
    'new_activity', 'registration_deadline', 'activity_reminder',
    'club_news', 'application_status', 'approval_queue',
];

// Sukut: hammasi yoqilgan. Odam o'zi kerakmasini o'chiradi — teskarisi emas,
// aks holda hech kim hech narsa olmay, tizim "ishlamayapti" deb qabul qilinadi.
export const DEFAULT_NOTIFICATION_PREFS = Object.fromEntries(
    NOTIFICATION_TYPE_ORDER.map(id => [id, true])
);

// O'chirib bo'lmaydigan turlar har doim yoqilgan holatda qaytadi - saqlangan
// sozlamada `false` turgan bo'lsa ham (eski yozuv yoki qo'lda o'zgartirish).
export const resolveNotificationPrefs = (stored) => {
    const out = { ...DEFAULT_NOTIFICATION_PREFS, ...(stored || {}) };
    NOTIFICATION_TYPE_ORDER.forEach(id => {
        if (!NOTIFICATION_TYPES[id].optional) out[id] = true;
    });
    return out;
};

// XABAR -> MANZIL.
//
// `refType`/`refId` maydonlari bazada ALLAQACHON bor edi, lekin hech qayerda
// ishlatilmasdi - bildirishnomani bosish hech narsa qilmasdi. Xarita shu bo'shliqni
// to'ldiradi: har bir xabar o'zi tegishli joyni biladi.
//
// Rol muhim: bitta musobaqa admin uchun ish maydoni, talaba uchun ochiq sahifa.
export const notificationLink = (notif, role) => {
    const id = notif?.refId;
    if (!id) return null;
    const isStaff = role === 'ADMINISTRATOR' || role === 'RAHBARIYAT';
    switch (notif.refType) {
        case 'competition':
            return isStaff ? `/admin/competitions/${id}` : `/musobaqa/${id}`;
        case 'event':
            return isStaff ? `/admin/events/${id}` : `/tadbir/${id}`;
        case 'club':
            return isStaff ? `/admin/clubs-directory/${id}` : `/student/clubs/${id}`;
        case 'application':
            return isStaff
                ? '/admin/social-activity?bolim=ish&jarayon=tasdiqlash'
                : '/student/social-activity?bolim=indeks';
        case 'scholarship':
            return isStaff ? '/admin/talent?tab=applications' : '/student/achievements';
        case 'recognition':
            return isStaff ? '/admin/awards?bolim=jarayon' : '/student/incentive-awards';
        default:
            return null;
    }
};
