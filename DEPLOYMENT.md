# UniPlatform - Deployment Guide

## Ishlab chiqish muhiti (Development)

### Talablar
- Node.js 18 yoki undan yuqori versiya
- npm 9 yoki undan yuqori versiya

### Loyihani ishga tushirish

1. **Bog'liqliklarni o'rnatish:**
```bash
cd uniplatform
npm install
```

2. **Development serverni ishga tushirish:**
```bash
npm run dev
```

Server `http://localhost:3000` da ishga tushadi.

3. **Demo hisoblar:**
- **Talaba:** `talaba` / `password`
- **Administrator:** `admin` / `password`
- **Rahbariyat:** `rahbar` / `password`

## Production build

### Build yaratish

```bash
npm run build
```

Build `dist` papkasida yaratiladi.

### Build ni test qilish

```bash
npm run preview
```

## Backend integratsiyasi

Hozirgi versiya frontend-only va mock data bilan ishlaydi. Backend integratsiya qilish uchun:

### 1. API Service ni yangilash

`src/services/api.js` faylida:

```javascript
const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:8000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});
```

### 2. Environment variables

`.env` fayl yarating:

```env
VITE_API_URL=https://your-backend-api.com/api
```

### 3. Kerakli backend endpoints

Backend quyidagi endpointlarni ta'minlashi kerak:

**Authentication:**
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user

**Students:**
- `GET /api/students` - Students list
- `GET /api/students/:id` - Student detail
- `GET /api/students/:id/activity` - Student activity

**Social Activity:**
- `GET /api/social-activity` - Get activity index
- `POST /api/social-activity/submit` - Submit activity
- `POST /api/social-activity/verify` - Verify activity (admin)

**Tests:**
- `GET /api/tests` - Tests list
- `POST /api/tests` - Create test (admin)
- `POST /api/tests/:id/submit` - Submit test

**Events:**
- `GET /api/events` - Events list
- `POST /api/events` - Create event (admin)
- `POST /api/events/:id/register` - Register for event

**Library:**
- `GET /api/library/books` - Books list
- `POST /api/library/progress` - Update reading progress

## Deployment

### Vercel

1. Vercel hisobiga kirish
2. Loyihani import qilish
3. Build settings:
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`

### Netlify

1. Netlify hisobiga kirish
2. Loyihani import qilish
3. Build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`

### Traditional hosting

1. Build yaratish: `npm run build`
2. `dist` papkasidagi fayllarni serverga yuklash
3. Web server (nginx, apache) ni sozlash

**Nginx konfiguratsiyasi:**

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Database

Backend uchun PostgreSQL tavsiya etiladi. Asosiy jadvallar:

- `users` - Foydalanuvchilar
- `students` - Talabalar
- `social_activity` - Ijtimoiy faollik
- `tests` - Testlar
- `questions` - Savollar
- `books` - Kitoblar
- `events` - Tadbirlar
- `clubs` - Klublar
- `submissions` - Topshiriqlar

## Xavfsizlik

1. **Environment variables** - API kalitlarini `.env` faylda saqlang
2. **HTTPS** - Production da faqat HTTPS ishlatilsin
3. **CORS** - Backend da to'g'ri CORS sozlamalari
4. **Authentication** - JWT token ishlatilsin
5. **Input validation** - Barcha kiritilgan ma'lumotlarni tekshirish

## Monitoring

Production muhitda quyidagilarni monitoring qiling:

- API response time
- Error rates
- User activity
- Database performance

## Qo'llab-quvvatlash

Muammolar yuzaga kelsa:
1. Browser console ni tekshiring
2. Network tab da API so'rovlarini ko'ring
3. Backend loglarini tekshiring

## Yangilanishlar

Yangi versiyalarni deploy qilish:

```bash
git pull origin main
npm install
npm run build
# Upload dist folder to server
```
