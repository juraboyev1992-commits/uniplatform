// Clubs Directory "Yo'nalishlar" — a display-only grouping layer over the free-text `club.category`
// values already seeded on all 42 clubs (src/services/db.js). Existing category strings are NOT
// renamed; this just buckets them into the 8 canonical directions for filtering/display.
export const DIRECTIONS = [
    'Intellektual',
    'Huquqiy',
    "Madaniyat va san'at",
    'Media va nutq',
    'Sport',
    'Texnologiya',
    'Volontyorlik',
    'Tadbirkorlik'
];

const CATEGORY_TO_DIRECTION = {
    'Intellektual': 'Intellektual',
    "Ma'rifat": 'Intellektual',
    'Yuridik': 'Huquqiy',
    "San'at": "Madaniyat va san'at",
    'Kitobxonlik': "Madaniyat va san'at",
    'Adabiyot': "Madaniyat va san'at",
    'Ijodiy': "Madaniyat va san'at",
    'Notiqlik': 'Media va nutq',
    'Sport': 'Sport',
    'IT': 'Texnologiya',
    'Ilmiy': 'Texnologiya',
    'Volontyorlik': 'Volontyorlik',
    'Biznes': 'Tadbirkorlik',
    'Rivojlanish': 'Tadbirkorlik'
};

// Handles both legacy category strings (mapped above) and clubs created directly with one of the 8
// canonical direction names as their category (e.g. via the directory's own "Klub qo'shish" form).
export const getClubDirection = (category) => {
    if (DIRECTIONS.includes(category)) return category;
    return CATEGORY_TO_DIRECTION[category] || 'Boshqa';
};
