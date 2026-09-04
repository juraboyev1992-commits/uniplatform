// ===========================================================================
// XONA JIHOZLARI
//
// NEGA TAYYOR RO'YXAT: jihoz nomi erkin matnda yozilsa, bir xil narsa har
// xil yozilardi ("proyektor", "проектор", "Proektor") va keyin "proyektori
// bor xonalarni ko'rsat" degan so'rov ishlamay qolardi. Tayyor ro'yxat
// buni oldini oladi.
//
// RO'YXAT TUGAL EMAS: har xonada o'ziga xos narsa bo'lishi mumkin, shuning
// uchun "qo'shimcha" maydoni ham bor va u erkin matn.
//
// Kalitlar O'ZGARMAYDI - ular saqlanadi. Nomini o'zgartirsa bo'ladi,
// kalitni esa yo'q: eski yozuvlar undan topiladi.
// ===========================================================================
import {
    Projector, Monitor, Mic, Volume2, Presentation, Wifi,
    Snowflake, Camera, Laptop, Armchair,
} from 'lucide-react';

export const VENUE_EQUIPMENT = {
    projector: { key: 'projector', label: 'Proyektor', icon: Projector },
    screen: { key: 'screen', label: 'Ekran', icon: Presentation },
    tv: { key: 'tv', label: 'Televizor / monitor', icon: Monitor },
    microphone: { key: 'microphone', label: 'Mikrofon', icon: Mic },
    speakers: { key: 'speakers', label: 'Ovoz kuchaytirgich', icon: Volume2 },
    computer: { key: 'computer', label: 'Kompyuter', icon: Laptop },
    wifi: { key: 'wifi', label: 'Wi-Fi', icon: Wifi },
    conditioner: { key: 'conditioner', label: 'Konditsioner', icon: Snowflake },
    camera: { key: 'camera', label: 'Videokamera', icon: Camera },
    stage: { key: 'stage', label: 'Sahna', icon: Armchair },
};

export const VENUE_EQUIPMENT_ORDER = [
    'projector', 'screen', 'tv', 'microphone', 'speakers',
    'computer', 'wifi', 'conditioner', 'camera', 'stage',
];

export const equipmentLabel = (key) => VENUE_EQUIPMENT[key]?.label || key;

// Saqlashdan oldin tozalash: noma'lum kalit tashlab yuboriladi va tartib
// ro'yxatdagidek bo'ladi - ikki xona bir xil jihozda har xil tartibda
// saqlanmasin.
export const normalizeEquipment = (keys = []) =>
    VENUE_EQUIPMENT_ORDER.filter(k => keys.includes(k));

// Sig'im - MAJBURIY EMAS. Ko'p xonaning sig'imi rasmiy hujjatda yozilmagan
// va uni taxmin qilib yozish keyin "150 kishilik" deb ishonib, 80 kishi
// sig'adigan xonaga tadbir qo'yishga olib kelardi. Bo'sh qoldirilsa
// «ko'rsatilmagan» deb ko'rinadi.
export const formatCapacity = (capacity) =>
    capacity == null || capacity === '' ? null : `${capacity} kishi`;
