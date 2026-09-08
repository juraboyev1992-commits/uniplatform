import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Ilgari eski build fayllari `dist/assets` da yigilib borardi (1600 dan ortiq fayl).
    // Railway har safar toza konteynerda quradi, shuning uchun bu faqat mahalliy papkani
    // shishirardi - lekin `dist` ni qolda tozalash esdan chiqadi.
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // BUTUN sayt bitta ~4.2 MB faylda edi. Telefon protsessori uni tahlil qilib
        // kompilyatsiya qilguncha bir necha soniya ketardi va sayt "sekin" korinardi.
        //
        // Kutubxonalar alohida bolaklarga ajratiladi. Ikki foydasi bor:
        //   - brauzer ularni parallel yuklaydi;
        //   - kod ozgarganda kutubxona bolaklari O'ZGARMAYDI, yani keshdan olinadi va
        //     qayta yuklanmaydi. Ilgari bitta harf ozgarsa ham 4.2 MB qayta yuklanardi.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // Grafiklar: recharts + d3 oilasi. Faqat bir necha ekranda kerak.
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) return 'charts';
          // Excel eksporti - eng ogir kutubxonalardan biri, kam ishlatiladi.
          if (id.includes('xlsx')) return 'xlsx';
          // PDF/rasm eksporti ATAYLAB bu yerda nomlanmaydi.
          //
          // Ular faqat "PDF yuklab olish" bosilganda `import()` bilan so'raladi. Agar ularni
          // majburan nomlangan bo'lakka qo'ysak, Rollup o'sha bo'lakni umumiy qilib, uni
          // kirish nuqtasiga STATIK bog'lab qo'yadi - dinamik yuklash yo'qoladi va 640 KB
          // yana hammaga yuklanadi (aynan shunday bo'ldi, o'lchab ko'rildi). `undefined`
          // qaytarilsa Rollup o'zi alohida, faqat kerak bo'lganda so'raladigan bo'lak qiladi.
          if (id.includes('html2canvas') || id.includes('jspdf') || id.includes('dompurify') || id.includes('canvg')) return;
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('/react-router')) return 'router';
          // React yadrosi BITTA bo'lakda bo'lishi SHART: `react`, `react-dom` va `scheduler`
          // bir-biriga ichki bog'langan. Ilgari bu yerda faqat `react-dom` nomlanardi, `react`
          // ning o'zi esa pastdagi umumiy `vendor` ga tushib ketardi - natijada react-dom
          // yuklanganda react hali tayyor bo'lmay, sayt oq ekran bilan yiqilardi
          // ("Cannot read properties of undefined (reading '__SECRET_INTERNALS_...')").
          // Shuning uchun aniq paket yo'li bo'yicha tekshiriladi, nom bo'lagi bo'yicha emas.
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          return 'vendor';
        }
      }
    },
    // Bolaklar ajratilgandan keyin ogohlantirish chegarasi realroq bolsin.
    chunkSizeWarningLimit: 900
  },
  server: {
    // `host: true` - barcha tarmoq interfeyslariga bog'lanadi, ya'ni bir xonadagi/bir Wi-Fi dagi
    // boshqa kompyuter ham http://<shu-kompyuter-IP>:3000 orqali kira oladi. Sukut bo'yicha Vite
    // faqat localhost'ni tinglaydi va tashqaridan umuman ko'rinmaydi.
    host: true,
    // Port band bo'lsa 3001 ga sakramasin - manzil har safar o'zgarib ketmasligi uchun.
    port: 3000,
    strictPort: true,
    open: true
  }
})
