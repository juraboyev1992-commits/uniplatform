import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // `host: true` - barcha tarmoq interfeyslariga bog'lanadi, ya'ni bir xonadagi/bir Wi-Fi dagi
    // boshqa kompyuter ham http://<shu-kompyuter-IP>:3000 orqali kira oladi. Sukut bo'yicha Vite
    // faqat localhost'ni tinglaydi va tashqaridan umuman ko'rinmaydi.
    host: true,
    port: 3000,
    // Port band bo'lsa 3001 ga sakramasin - manzil har safar o'zgarib ketmasligi uchun.
    strictPort: true,
    open: true
  }
})
