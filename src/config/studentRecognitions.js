// Rag'bat puli va mukofot taklifi/tasdiqlash oqimi - konstantalar.

export const RECOGNITION_KIND = { INCENTIVE: 'incentive', PRIZE: 'prize' };
export const RECOGNITION_KIND_LABELS = {
    incentive: "Rag'bat puli",
    prize: 'Mukofot',
};

export const RECOGNITION_STATUS = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' };
export const RECOGNITION_STATUS_LABELS = {
    pending: 'Tasdiqlanishi kutilmoqda',
    approved: 'Tasdiqlangan',
    rejected: 'Rad etilgan',
};

// Placement/scoring bo'lmagan tanlovlar uchun ham tanlash mumkin bo'lgan
// tayyor mukofot nomlari - erkin matn maydonini to'ldirish uchun taklif,
// majburiy ro'yxat emas (shuning uchun UI'da "boshqa" varianti ham bo'ladi).
export const PRIZE_TITLE_SUGGESTIONS = [
    "Faxriy yorliq",
    "Davlat mukofoti nomzodi",
    "Rektor faxriy yorlig'i",
    "Eng faol talaba",
    "Yil talabasi",
];
