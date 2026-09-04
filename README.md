# UniPlatform

Universitet Boshqaruv Tizimi - To'liq universitet talabalar va ma'muriyat boshqaruv platformasi

## Loyiha haqida

UniPlatform - bu zamonaviy, keng ko'lamli universitet boshqaruv tizimi bo'lib, akademik jarayon, testlar, kutubxona, tadbirlar, klublar, stipendiyalar, davomat va eng asosiysi - talabalar ijtimoiy faolligini yagona raqamli ekotizimda boshqarish va tahlil qilishni ta'minlaydi.

## Asosiy xususiyatlar

### Rollar
- **Talaba** - Shaxsiy dashboard, testlar, kutubxona, tadbirlar, ijtimoiy faollik kuzatuvi
- **Administrator** - Testlar yaratish, tadbirlar boshqaruvi, faollik monitoring
- **Rahbariyat** - Kengaytirilgan statistika va monitoring

### Ijtimoiy Faollik Indeksi (100 ball)
1. Kitobxonlik madaniyati - 20 ball
2. 5 muhim tashabbus to'garaklari - 20 ball
3. Akademik o'zlashtirish - 10 ball
4. Ichki tartib va odob-axloq - 5 ball
5. Ko'rik-tanlov va olimpiadalar - 10 ball
6. Davomat - 5 ball
7. Ma'rifat darslari - 10 ball
8. Volontyorlik - 5 ball
9. Madaniy tashriflar - 5 ball
10. Sport va sog'lom turmush - 5 ball
11. Boshqa ijtimoiy faollik - 5 ball

## Texnologiyalar

- **Frontend**: React 18 + Vite
- **Styling**: Tailwind CSS v3
- **Routing**: React Router v6
- **Charts**: Recharts
- **Icons**: Lucide React
- **State Management**: React Context API

## O'rnatish

### Talablar
- Node.js 18+ va npm

### Qadamlar

1. Loyihani yuklab oling
2. Bog'liqliklarni o'rnating:
```bash
npm install
```

3. Development serverni ishga tushiring:
```bash
npm run dev
```

4. Brauzerda ochish: `http://localhost:3000`

## Demo hisoblar

Tizimga kirish uchun quyidagi demo hisoblardan foydalaning:

| Foydalanuvchi | Parol | Rol |
|---------------|-------|-----|
| talaba | password | Talaba |
| admin | password | Administrator |
| rahbar | password | Rahbariyat |

## Loyiha strukturasi

```
uniplatform/
├── src/
│   ├── components/
│   │   ├── common/          # Umumiy komponentlar
│   │   └── layout/          # Layout komponentlari
│   ├── contexts/            # React Context
│   ├── pages/
│   │   ├── auth/            # Autentifikatsiya
│   │   ├── student/         # Talaba sahifalari
│   │   └── admin/           # Admin sahifalari
│   ├── App.jsx
│   └── main.jsx
├── public/
├── index.html
└── package.json
```

## Ishlab chiqish

Production build yaratish:
```bash
npm run build
```

Build natijasini ko'rish:
```bash
npm run preview
```

## Litsenziya

© 2024 UniPlatform. Barcha huquqlar himoyalangan.
