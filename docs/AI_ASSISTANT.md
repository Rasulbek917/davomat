# AI yordamchi

Bu hujjat “AI + eMaktab” moduli qanday ishlashi va uni sozlash bosqichlarini
tushuntiradi.

## Nima qiladi

- **eMaktab ulanishi** — rasmiy API uchun login/parol va manzilni saqlaydi.
  Parol AES-256-GCM bilan shifrlanadi va **hech qachon** frontendga
  qaytarilmaydi (faqat maskalangan `login` ko‘rsatiladi).
- **Rasmiy fayl importi** — eMaktab’dan rasmiy ruxsat bilan yuklangan CSV/XLSX
  faylni import qiladi. Import idempotent: takroriy yuklash dublikat yaratmaydi.
- **Sinxronlash natijasi va tarixi** — sinflar/o‘quvchilar bo‘yicha yangi,
  yangilangan, o‘zgarmagan va xato ko‘rsatkichlari hamda so‘nggi sinxronlashlar.
- **AI chat va tahlil** — davomat, o‘quvchilar va importlar bo‘yicha savollarga
  javob beradi; tayyor tugmalar: “Bugungi holat”, “Davomat tahlili”, “Import
  tahlili”, “Hisobot”.

## Xavfsizlik tamoyillari

- AI **faqat serverda** ishlaydi. `AI_API_KEY` serverda saqlanadi va mijozga
  hech qachon yuborilmaydi.
- AI bazaga to‘g‘ridan-to‘g‘ri kirmaydi — faqat RBAC bilan cheklangan **tool**
  qatlami orqali **o‘qiydi**. Yozish/o‘chirish amali yo‘q.
- Har bir so‘rovda o‘lcham sessiyadan olinadi: direktor — o‘z maktabi,
  sinf rahbari — **faqat o‘zi biriktirilgan sinf**. Boshqa sinfni so‘rash
  backendda rad etiladi (UI’ni yashirish yetarli hisoblanmaydi).
- Raqamlar faqat mavjud davomat servislari (`classStatsForRange`, `computeStats`,
  `rankClasses`, …) orqali hisoblanadi — AI o‘z formulasi bilan raqam
  to‘qiy olmaydi.
- **Prompt-injection** himoyasi: tool natijalari “ma’lumot, ko‘rsatma emas”
  sifatida JSON konvertda uzatiladi; login/parol/token so‘ralsa ham
  ko‘rsatilmaydi.
- **Rate-limit va xarajat nazorati**: daqiqalik oyna (`8` so‘rov/daqiqa) va
  foydalanuvchi bo‘yicha kunlik limit (`AI_DAILY_REQUEST_LIMIT`).
- So‘rovlar va xatolar audit jurnaliga yoziladi (maxfiy ma’lumotsiz).

## Sozlash

1. `.env` (production uchun Vercel muhit o‘zgaruvchilari) ga kalitni qo‘shing:

   ```bash
   AI_API_KEY="sk-..."                       # OpenAI yoki mos API kaliti
   AI_BASE_URL="https://api.openai.com/v1"   # ixtiyoriy (mos endpoint)
   AI_MODEL="gpt-4o-mini"                    # ixtiyoriy
   AI_MAX_OUTPUT_TOKENS="900"                # ixtiyoriy
   AI_DAILY_REQUEST_LIMIT="150"              # ixtiyoriy
   ```

   `AI_API_KEY` bo‘sh bo‘lsa AI o‘chiq bo‘ladi: chat “sozlanmagan” holatini
   ko‘rsatadi, qolgan funksiyalar ishlashda davom etadi.

2. `ai:use` ruxsatini rollarga yozing (yangi o‘rnatishlarda `npm run setup`
   ichidagi seed buni o‘zi qiladi; mavjud bazada qo‘lda):

   ```bash
   npm run db:sync-permissions
   ```

   Bu `DIRECTOR`, `DEPUTY_DIRECTOR` va `TEACHER` rollariga `ai:use` qo‘shadi,
   boshqa ma’lumotga tegmaydi.

3. Ilovani qayta ishga tushiring va **Direktor** panelidagi **“AI + eMaktab”**
   bo‘limiga kiring. Super administrator uchun shu bo‘lim `/admin/ai` da,
   lekin u yerda maktab tanlanadi va ulanish boshqaruvi direktor zimmasida
   qoladi (super admin uchun faqat tahlil/o‘qish).

## eMaktab kanallari

- **Rasmiy API** mavjud bo‘lsa — “eMaktab ulanishi” bo‘limida login/parol va
  base URL kiritiladi.
- **Rasmiy API yo‘q bo‘lsa** — “Rasmiy fayl orqali import” orqali eMaktab’dan
  rasmiy ruxsat bilan yuklangan CSV/XLSX fayl yuklanadi.

Tizim eMaktab veb-interfeysini **yuklab olmaydi (scraping)** va
autentifikatsiya, CAPTCHA yoki MFA himoyasini **chetlab o‘tmaydi**.
