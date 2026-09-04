// Generic per-direction "Haqida" copy (goals/activities/audience) for the Klub profili "Haqida" tab.
// Display-only presentation config, same idiom as clubDirections.js — does NOT touch db.js or any club
// record. Deliberately generic (not fabricated per-club facts) since no club carries this text today;
// keyed by the 8 canonical DIRECTIONS from clubDirections.js, with a safe fallback for 'Boshqa'.
export const CLUB_ABOUT_CONTENT = {
    'Intellektual': {
        goals: "Talabalarning tahliliy fikrlash, bilim va zakovatini rivojlantirish, intellektual musobaqalarda faol ishtirok etishga tayyorlash.",
        activities: "Bilimlar bellashuvi, viktorinalar, intellektual o'yinlar va klublararo turnirlar.",
        audience: "Bilimga, mantiqiy fikrlashga va intellektual musobaqalarga qiziqqan barcha talabalar uchun."
    },
    'Huquqiy': {
        goals: "Yuridik bilim va amaliy ko'nikmalarni oshirish, sud jarayoni simulyatsiyasi va huquqiy notiqlik mahoratini shakllantirish.",
        activities: "Moot Court simulyatsiyalari, huquqiy bahs-munozaralar va amaliy seminarlar.",
        audience: "Huquqshunoslik yo'nalishiga qiziquvchi va amaliy tajriba orttirmoqchi bo'lgan talabalar uchun."
    },
    "Madaniyat va san'at": {
        goals: "Ijodiy salohiyatni ochish, san'at va madaniyat sohasidagi ko'nikmalarni rivojlantirish.",
        activities: "Konsertlar, ko'rgazmalar, sahna chiqishlari va ijodiy mashg'ulotlar.",
        audience: "San'at, ijod va madaniy tadbirlarga qiziquvchi barcha talabalar uchun."
    },
    'Media va nutq': {
        goals: "Notiqlik san'ati, ommaviy nutq va o'z fikrini erkin ifodalash ko'nikmalarini rivojlantirish.",
        activities: "Notiqlik musobaqalari, bahs-munozaralar va ommaviy nutq mashg'ulotlari.",
        audience: "O'z fikrini ishonchli ifodalashni o'rganmoqchi bo'lgan barcha talabalar uchun."
    },
    'Sport': {
        goals: "Sog'lom turmush tarzini targ'ib qilish, jismoniy tayyorgarlik va sport mahoratini oshirish.",
        activities: "Mashg'ulotlar, ichki va tashqi sport musobaqalari, chempionatlar.",
        audience: "Sport bilan shug'ullanishni yoqtiradigan va faol turmush tarzini qo'llab-quvvatlaydigan talabalar uchun."
    },
    'Texnologiya': {
        goals: "Raqamli ko'nikmalar, dasturlash va zamonaviy texnologiyalar sohasidagi bilimlarni rivojlantirish.",
        activities: "Hackathonlar, dasturlash musobaqalari va texnik loyihalar ustida ishlash.",
        audience: "IT va zamonaviy texnologiyalarga qiziquvchi barcha talabalar uchun."
    },
    'Volontyorlik': {
        goals: "Ijtimoiy mas'uliyat va xayriya faoliyatini rivojlantirish, jamiyatga foyda keltiradigan tashabbuslarni qo'llab-quvvatlash.",
        activities: "Xayriya aksiyalari, ekologik tadbirlar va ijtimoiy loyihalar.",
        audience: "Jamiyatga foydali ishlarda ishtirok etishni istagan barcha talabalar uchun."
    },
    'Tadbirkorlik': {
        goals: "Tadbirkorlik ko'nikmalari, startap va shaxsiy rivojlanish salohiyatini oshirish.",
        activities: "Startap loyihalari, treninglar va tadbirkorlik bo'yicha amaliy mashg'ulotlar.",
        audience: "Tadbirkorlik va shaxsiy rivojlanishga qiziquvchi barcha talabalar uchun."
    },
    'Boshqa': {
        goals: "Talabalarning qobiliyatlarini rivojlantirish va faol jamoaviy hayotda ishtirokini qo'llab-quvvatlash.",
        activities: "Muntazam mashg'ulotlar va klub yo'nalishiga oid tadbirlar.",
        audience: "Ushbu yo'nalishga qiziqqan barcha talabalar uchun."
    }
};

export const getClubAboutContent = (direction) => CLUB_ABOUT_CONTENT[direction] || CLUB_ABOUT_CONTENT['Boshqa'];
