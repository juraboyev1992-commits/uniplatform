// YANGI VERSIYA CHIQQANDAN KEYINGI ESKI FAYLLAR.
//
// Sahifalar kerak bo'lganda yuklanadi (App.jsx dagi `lazy`). Har deploy'da
// fayl nomlari o'zgaradi va eskilari serverdan o'chadi. Deploy'dan oldin
// ochilgan sahifa esa hali ham eski nomni so'raydi - natijada butun
// platforma xato ekraniga tushardi, garchi foydalanuvchi hech narsa
// buzmagan bo'lsa ham.
//
// Yechim: sahifani BIR MARTA yangilash - u yangi fayl nomlarini oladi.
//
// CHEKSIZ AYLANISHDAN HIMOYA: fayl haqiqatan ham yo'q bo'lsa (masalan
// deploy chala qolgan), yangilash yordam bermaydi va sahifa o'zini-o'zi
// to'xtovsiz yangilab turardi. Shuning uchun 30 soniya ichida faqat bir
// marta yangilanadi; ikkinchi marta xato oddiy xato ekrani sifatida
// ko'rsatiladi.
//
// Sinovdan o'tgan (2026-09-14): dist nusxasidan lazy fayl o'chirilib,
// headless Chrome'da ochilganda sahifa aynan bir marta yangilandi va keyin
// o'zbekcha xato ekrani chiqdi.

const KEY = 'uniplatform_chunk_reload_at';
const WINDOW_MS = 30000;

// Yangilash buyrug'i berilgan, lekin brauzer hali sahifani almashtirmagan
// oraliq. `vite:preloadError` da `preventDefault` qilinganda React.lazy
// bo'sh modul oladi va "reading 'default'" degan BOSHQA xato tashlaydi -
// uni "yangi versiya" xatosi deb tanib bo'lmaydi. Bu belgi bo'lmasa, sahifa
// yangilanguncha bir lahza xato ekrani ko'rinib o'tardi.
let reloadInProgress = false;

// Brauzerlar bu xatoni turlicha yozadi: Chrome, Firefox va Safari matni
// har xil. Hammasi shu yerda.
export const isChunkLoadError = (err) => {
    const msg = String(err?.message || err || '');
    return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed|ChunkLoadError/i.test(msg);
};

export const isReloadingForNewVersion = () => reloadInProgress;

// `true` - sahifa yangilanmoqda; `false` - yaqinda allaqachon yangilangan,
// ya'ni muammo eski fayllarda emas va xatoni ko'rsatish kerak.
export const reloadOnceForNewVersion = () => {
    if (reloadInProgress) return true;
    try {
        const last = Number(sessionStorage.getItem(KEY) || 0);
        if (Date.now() - last < WINDOW_MS) return false;
        sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
        // sessionStorage yopiq bo'lsa ham bir marta yangilash xavfsiz -
        // himoyasiz qolgan holat faqat maxfiy rejimdagi kam uchraydigan hol.
    }
    reloadInProgress = true;
    window.location.reload();
    return true;
};
