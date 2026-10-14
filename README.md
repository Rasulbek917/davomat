# Maktab Davomat — maktab davomatini boshqarish tizimi

O‘zbekiston maktablari uchun mo‘ljallangan, uchta rolga asoslangan davomat
boshqaruv tizimi: **Bosh administrator**, **Direktor** va **Xodim**. Interfeys
to‘liq o‘zbek tilida (lotin), vaqt mintaqasi — `Asia/Tashkent`, yorug‘ va tungi
mavzularni qo‘llab-quvvatlaydi, kompyuter va telefondan birdek qulay ishlaydi.

## Imkoniyatlar

- **Rollar va ruxsatlar (RBAC)** — har bir amal serverda ham tekshiriladi. UI’ni
  yashirish hech qachon xavfsizlik chorasi hisoblanmaydi.
- **Maktab darajasidagi izolyatsiya** — direktor faqat o‘z maktabi
  ma’lumotlarini ko‘radi. `schoolId` har doim sessiyadan olinadi, hech qachon
  so‘rovdan emas.
- **Davomat** — Keldi / Kelmagan / Kechikdi / Sababli kelmadi holatlari, guruh
  bo‘lib belgilash, o‘zgarishlar tarixi (audit), takroriy yozuvlarning oldini
  olish, saqlanmagan o‘zgarishlar haqida ogohlantirish.
- **Sinfning individual o‘qish kunlari** — har bir sinf haftaning o‘z kunlarida
  o‘qiydi (dushanbadan shanbagacha istalgan kombinatsiya). Jadval o‘zgarishi
  “amal qilish sanasi” bilan versiyalanadi, shu sababli o‘tgan davr hisobotlari
  qayta yozilmaydi. Maktab taqvimi dam kunini o‘qish kunidan chiqara oladi,
  lekin sinfni o‘z jadvalidan tashqarida o‘qishga majburlay olmaydi.
- **Navbatchilik (duty)** — o‘qituvchilar navbatchiligini adolatli avtomatik
  taqsimlash (kam navbatchilik qilganlarga ustuvorlik, ketma-ketlikdan qochish),
  saqlashdan oldin ko‘rib chiqish, qo‘lda tayinlash / almashtirish / bekor
  qilish (sabab bilan), holatlar (Rejalashtirilgan/Bajarildi/Almashtirildi/Bekor
  qilindi), kalendar va ro‘yxat ko‘rinishlari hamda adolat statistikasi.
- **Analitika va hisobotlar** — foizlar faqat haqiqiy yozuvlardan hisoblanadi.
  Belgilanmagan o‘quvchi avtomatik "kelmagan" deb hisoblanmaydi; qamrov
  (coverage) alohida ko‘rsatiladi. Hisobotlarni Excel/CSV/PDF ga eksport qilish.
- **eMaktab integratsiyasi** — rasmiy CSV/Excel import (idempotent: takroriy
  import dublikat yaratmaydi) va rasmiy API mavjud bo‘lsa — konnektor orqali
  sinxronizatsiya. Tizim eMaktab veb-interfeysini yuklab olmaydi va
  autentifikatsiya/CAPTCHA/MFA himoyasini chetlab o‘tmaydi.
- **Xavfsizlik** — parollar `bcrypt` bilan xeshlanadi, sessiya tokeni faqat HMAC
  ko‘rinishida saqlanadi, login uchun rate-limit, o‘zgarishlar auditi,
  cheklangan fayl yuklash, maxfiy kalitlar AES-256-GCM bilan shifrlanadi.
- **AI yordamchi va eMaktab paneli** — “AI + eMaktab” bo‘limida eMaktab
  ulanishini boshqarish (login/parol shifrlangan holda, hech qachon qaytarilmaydi),
  rasmiy fayl importi, sinxronlash natijasi va tarixi hamda davomat bo‘yicha AI
  tahlil mavjud. AI faqat serverda ishlaydi, real bazadan RBAC bilan
  cheklangan “tool” qatlami orqali o‘qiydi (yozmaydi), `AI_API_KEY` faqat
  serverda saqlanadi, so‘rovlar rate-limit qilinadi va auditlanadi.

## Texnologiyalar

| Qatlam | Texnologiya |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Actions, Turbopack) |
| UI | React 19, Tailwind CSS v4, Radix UI, Lucide, Recharts |
| Ma’lumotlar bazasi | PostgreSQL 17, Prisma 7 (`@prisma/adapter-pg`) |
| Validatsiya | Zod v4, React Hook Form |
| Hisobot eksporti | ExcelJS, pdf-lib |
| Rasmlar | sharp (512×512 WebP ga qayta ishlanadi) |

## Tez boshlash

```bash
# 1. Bog‘liqliklarni o‘rnatish
npm install

# 2. Muhit o‘zgaruvchilarini sozlash
copy .env.example .env   # Windows
# cp .env.example .env   # macOS / Linux
# .env ichida DATABASE_URL, SESSION_SECRET, CREDENTIAL_ENCRYPTION_KEY ni to‘ldiring
# AI yordamchi uchun (ixtiyoriy): AI_API_KEY, AI_BASE_URL, AI_MODEL

# 3. Bazani tayyorlash (migratsiya + demo ma’lumotlar)
npm run setup

# 4. Serverni ishga tushirish
npm run dev
```

So‘ngra [http://localhost:3000](http://localhost:3000) manzilini oching.

### Demo hisoblar (faqat ishlab chiqish uchun)

| Rol | Login | Parol |
| --- | --- | --- |
| Bosh administrator | `superadmin` | `ChangeMe!2026` |
| Direktor (1-maktab) | `direktor1` | `Demo!2026` |
| Direktor (2-maktab) | `direktor2` | `Demo!2026` |
| Xodim | `orinbosar-demo-01`, `oqituvchi-demo-01`, `xodim-demo-01` | `Demo!2026` |

> Ishlab chiqarishga chiqarishdan oldin barcha demo parollarni almashtiring va
> demo ma’lumotlarni o‘chiring.

## NPM skriptlari

| Skript | Vazifasi |
| --- | --- |
| `npm run dev` | Ishlab chiqish serveri |
| `npm run build` / `npm run start` | Ishlab chiqarish uchun yig‘ish / ishga tushirish |
| `npm run typecheck` | TypeScript tekshiruvi |
| `npm run lint` | ESLint |
| `npm test` | Birlik testlari (jadval resolveri, navbatchilik taqsimoti) |
| `npm run db:migrate` | Migratsiya yaratish/qo‘llash |
| `npm run db:deploy` | Migratsiyalarni qo‘llash (production) |
| `npm run db:seed` | Demo ma’lumotlarni yuklash (idempotent) |
| `npm run db:sync-permissions` | Rollarga yangi ruxsatlarni qo‘shish (masalan `ai:use`) |
| `npm run db:studio` | Prisma Studio |

## Hujjatlar

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — arxitektura, rollar, davomat semantikasi
- [`docs/EMAKTAB_INTEGRATION.md`](./docs/EMAKTAB_INTEGRATION.md) — eMaktab integratsiyasi
- [`docs/AI_ASSISTANT.md`](./docs/AI_ASSISTANT.md) — AI yordamchi va sozlash
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — joylashtirish qo‘llanmasi
