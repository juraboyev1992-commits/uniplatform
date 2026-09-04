// ===========================================================================
// TSUL (Toshkent davlat yuridik universiteti) FAKULTETLARI - RASMIY RO'YXAT
//
// YAGONA MANBA. Ilgari bu ro'yxat umuman yo'q edi - demo ma'lumot generatori
// (src/services/db.js: generateSyntheticStudents) o'zi o'ylab topgan, umumiy
// universitet fakultetlarini ("Axborot texnologiyalari", "Matematika",
// "Fizika") ishlatardi. TSUL - YURIDIK universitet, bunday fakultetlar
// bo'lishi mumkin emas edi.
//
// Bu ro'yxat FOYDALANUVCHI tomonidan berilgan, TSUL ma'muriyatidan.
//
// `isDepartment: true` - "fakultet" emas, "bo'lim" (Qo'shma ta'lim
// dasturlari, Magistratura). Funksional jihatdan xuddi fakultet kabi -
// talaba shu yerga tegishli bo'ladi - lekin nomlanishi boshqacha, shuning
// uchun interfeysda "Fakultet/bo'lim" kabi umumiyroq so'z kerak bo'lsa,
// shu belgidan foydalaniladi.
//
// `isGraduate: true` - Magistratura. Bakalavriat kabi 1-4 kurs emas,
// odatda 1-2 yillik - demo generatorida kurs raqami shunga qarab
// cheklanadi (aks holda "4-kurs magistratura" kabi mantiqsiz yozuv
// chiqardi).
// ===========================================================================
export const FACULTIES = [
    { id: 'ommaviy_huquq', name: 'Ommaviy huquq fakulteti', code: 'OH' },
    { id: 'biznes_huquq', name: 'Biznes huquqi va sud himoyasi fakulteti', code: 'BH' },
    { id: 'jinoiy_sudlov', name: 'Jinoiy odil sudlov fakulteti', code: 'JOS' },
    { id: 'xalqaro_huquq', name: 'Xalqaro huquq va qiyosiy huquqshunoslik fakulteti', code: 'XH' },
    { id: 'sohalararo', name: "Huquqni sohalararo o'rganish fakulteti", code: 'HSO' },
    { id: 'qoshma_talim', name: "Qo'shma ta'lim dasturlari bo'limi", code: 'QTD', isDepartment: true },
    { id: 'magistratura', name: "Magistratura bo'limi", code: 'MAG', isDepartment: true, isGraduate: true },
];

export const FACULTY_NAMES = FACULTIES.map(f => f.name);

export const getFacultyByName = (name) => FACULTIES.find(f => f.name === name) || null;
export const getFacultyByCode = (code) => FACULTIES.find(f => f.code === code) || null;
