// ===========================================================================
// KLUB ALOQA MA'LUMOTLARI VA IJTIMOIY TARMOQLARI
//
// Kanallar ro'yxati SHU YERDA, bitta joyda: klub sahifasi ularni ko'rsatadi,
// sozlash oynasi esa tahrirlaydi. Ikki joyda ikki xil ro'yxat tutilsa, yangi
// tarmoq qo'shilganda biri ikkinchisidan orqada qolardi.
//
// FOYDALANUVCHI TO'LIQ HAVOLA YOZISHI SHART EMAS. "@uniquiz", "uniquiz" yoki
// "https://t.me/uniquiz" - uchalasi ham ishlaydi va bir xil natija beradi.
// Sabab oddiy: koordinator odatda o'z sahifasining NOMINI biladi, to'liq
// manzilini emas, va noto'g'ri yozilgan havola ishlamaydigan tugma berardi.
//
// Manzil O'YLAB TOPILMAYDI: `username` aniqlanmasa, kiritilgan matn o'zi
// havola sifatida ishlatiladi (agar u haqiqatan havola bo'lsa) yoki umuman
// havola qilinmaydi.
// ===========================================================================

const stripAt = (v) => String(v || '').trim().replace(/^@+/, '');

// Berilgan matndan foydalanuvchi nomini ajratadi: to'liq havola bo'lsa
// oxirgi bo'lagini, aks holda matnning o'zini.
const usernameFrom = (value, hosts) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw) || hosts.some(h => raw.toLowerCase().startsWith(h))) {
        try {
            const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
            const path = url.pathname.split('/').filter(Boolean);
            return path.length > 0 ? stripAt(path[path.length - 1]) : '';
        } catch {
            return '';
        }
    }
    return stripAt(raw);
};

const socialChannel = (key, label, hosts, base, placeholder) => ({
    key,
    label,
    kind: 'social',
    placeholder,
    // Ko'rsatiladigan matn - har doim @nom ko'rinishida, manzil emas: uzun
    // havola qatorni buzib yuboradi.
    display: (value) => {
        const username = usernameFrom(value, hosts);
        return username ? `@${username}` : String(value || '').trim();
    },
    href: (value) => {
        const username = usernameFrom(value, hosts);
        if (username) return base + username;
        const raw = String(value || '').trim();
        return /^https?:\/\//i.test(raw) ? raw : null;
    },
});

export const CLUB_CONTACT_CHANNELS = [
    // --- Bevosita aloqa ---
    {
        key: 'phone', label: 'Telefon', kind: 'contact',
        placeholder: '+998 90 123 45 67',
        display: (v) => String(v || '').trim(),
        href: (v) => {
            const digits = String(v || '').replace(/[^\d+]/g, '');
            return digits ? `tel:${digits}` : null;
        },
    },
    {
        key: 'email', label: 'Elektron pochta', kind: 'contact',
        placeholder: 'klub@tsul.uz',
        display: (v) => String(v || '').trim(),
        href: (v) => {
            const raw = String(v || '').trim();
            return raw.includes('@') ? `mailto:${raw}` : null;
        },
    },
    {
        key: 'room', label: 'Xona / manzil', kind: 'contact',
        placeholder: '2-bino, 305-xona',
        display: (v) => String(v || '').trim(),
        // Xona - havola emas, oddiy matn.
        href: () => null,
    },

    // --- Ijtimoiy tarmoqlar ---
    socialChannel('telegram', 'Telegram', ['t.me', 'telegram.me'], 'https://t.me/', '@klub_nomi'),
    socialChannel('instagram', 'Instagram', ['instagram.com'], 'https://instagram.com/', '@klub_nomi'),
    socialChannel('youtube', 'YouTube', ['youtube.com', 'youtu.be'], 'https://youtube.com/@', '@kanal'),
    socialChannel('facebook', 'Facebook', ['facebook.com', 'fb.com'], 'https://facebook.com/', 'sahifa nomi'),
    {
        key: 'website', label: 'Veb-sayt', kind: 'social',
        placeholder: 'https://klub.tsul.uz',
        display: (v) => String(v || '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, ''),
        href: (v) => {
            const raw = String(v || '').trim();
            if (!raw) return null;
            return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        },
    },
];

export const CLUB_CONTACT_KEYS = CLUB_CONTACT_CHANNELS.map(c => c.key);

export const getContactChannel = (key) => CLUB_CONTACT_CHANNELS.find(c => c.key === key) || null;

// Bo'sh maydonlar SAQLANMAYDI - `{ telegram: '' }` "aloqa bor" degan
// yolg'on taassurot berardi va ro'yxatda bo'sh qator chiqarardi.
export const normalizeClubContacts = (raw) => {
    const out = {};
    CLUB_CONTACT_KEYS.forEach(key => {
        const value = String(raw?.[key] || '').trim();
        if (value) out[key] = value;
    });
    return out;
};

// Ko'rsatishga tayyor qatorlar - faqat to'ldirilganlari.
export const listClubContacts = (contacts) =>
    CLUB_CONTACT_CHANNELS
        .filter(c => String(contacts?.[c.key] || '').trim())
        .map(c => ({
            key: c.key,
            label: c.label,
            kind: c.kind,
            value: contacts[c.key],
            text: c.display(contacts[c.key]),
            href: c.href(contacts[c.key]),
        }));
