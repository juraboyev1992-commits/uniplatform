# UniPlatform - Texnik hujjatlar

## Tizim arxitekturasi

UniPlatform frontend-only React ilovasi bo'lib, kelajakda backend bilan integratsiya qilish uchun mo'ljallangan.

### Texnologik stek
- **React 18** - UI kutubxonasi
- **Vite** - Build tool
- **Tailwind CSS** - Stil berish uchun
- **React Router 6** - Navigatsiya
- **Context API** - Holatni boshqarish (AuthContext)
- **Recharts** - Grafiklar va diagrammalar
- **Lucide React** - Ikonkalar

## Loyiha strukturasi

```
src/
├── components/
│   ├── admin/       # Administrator qismiga tegishli komponentlar
│   ├── common/      # Umumiy foydalaniladigan komponentlar (Button, Card, Modal)
│   ├── layout/      # Sahifa qoliplari (Header, Sidebar, DashboardLayout)
│   └── student/     # Talaba qismiga tegishli komponentlar
├── contexts/        # React Context'lar (AuthContext)
├── pages/
│   ├── admin/       # Administrator sahifalari
│   ├── common/      # Umumiy sahifalar (Profile, Notifications)
│   ├── management/  # Rahbariyat sahifalari
│   ├── student/     # Talaba sahifalari
│   └── auth/        # Login sahifasi
├── utils/           # Yordamchi funksiyalar
└── App.jsx          # Asosiy routing va ilova kirish nuqtasi
```

## Rolga asoslangan kirish (RBAC)

Tizimda uchta asosiy rol mavjud:
1. `STUDENT` (Talaba)
2. `ADMIN` (Administrator)
3. `MANAGEMENT` (Rahbariyat)

Kirishni nazorat qilish `ProtectedRoute` komponenti orqali amalga oshiriladi. Har bir rol uchun alohida dashboard va ruxsatlar mavjud.

## Ma'lumotlar oqimi

Hozirgi vaqtda ma'lumotlar har bir komponent ichida mock data (soxta ma'lumotlar) ko'rinishida saqlanadi. Kelajakda `src/services/api.js` orqali real backendga ulanishi kerak.

## Stilistik ko'rsatmalar

Loyiha Tailwind CSS asosida qurilgan. Asosiy ranglar:
- `primary`: Indigo (#4F46E5)
- `secondary`: Slate
- `success`: Emerald
- `danger`: Rose
- `warning`: Amber

Glassmorphism va gradientlar loyihaning zamonaviy ko'rinishini ta'minlaydi.

## Grafiklar

`Recharts` kutubxonasi tahliliy ma'lumotlarni ko'rsatish uchun ishlatiladi:
- `AreaChart` - Dinamika uchun
- `BarChart` - Solishtirish uchun
- `PieChart` - Taqsimot uchun
- `RadarChart` - Ko'rsatkichlar uchun

---
© 2024 UniPlatform Technical Team
