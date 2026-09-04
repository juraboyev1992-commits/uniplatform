import { useSearchParams } from 'react-router-dom';

// Tabni MANZILDA saqlaydi va har almashtirishda tarixga yozuv qo'shadi.
//
// MUAMMO: platformadagi tablarning deyarli hammasi oddiy `useState` da turardi -
// manzilda iz qolmasdi. Ikkitasi manzilga yozardi, lekin `{ replace: true }`
// bilan, ya'ni yangi yozuv qo'shmay borini almashtirardi.
//
// Natijada foydalanuvchi bo'lim ichida bir necha tabni bosib chiqadi, brauzerning
// "orqaga" tugmasini bosadi va BUTUN BO'LIMDAN chiqib ketadi - chunki brauzer
// uchun oxirgi harakat "bu bo'limga kirish" bo'lgan. Tab almashtirishlar
// brauzerga ko'rinmasdi.
//
// Endi orqaga bosish oxirgi KO'RINGAN harakatni bekor qiladi: oldingi tabga
// qaytaradi, bo'limning boshiga yetgandagina undan chiqadi.
//
// Ikki qoida ataylab:
//   1. Standart tab manzildan O'CHIRILADI (`?tab=` qo'shilmaydi) - toza manzil,
//      va bo'limga kirish har doim bir xil ko'rinadi.
//   2. Boshqa parametrlar SAQLANADI - avval `setSearchParams({ tab: id })`
//      deyilardi, bu esa manzildagi qolgan hamma narsani jimgina o'chirardi.
export const useTabParam = (tabIds, defaultTab, key = 'tab') => {
    const [searchParams, setSearchParams] = useSearchParams();

    const raw = searchParams.get(key);
    const tab = tabIds.includes(raw) ? raw : defaultTab;

    const setTab = (next) => {
        if (next === tab) return; // Bir tabni qayta bosish tarixni to'ldirmasin.
        const params = new URLSearchParams(searchParams);
        if (next === defaultTab) params.delete(key);
        else params.set(key, next);
        setSearchParams(params); // replace EMAS - tarixga qo'shiladi.
    };

    return [tab, setTab];
};

export default useTabParam;
