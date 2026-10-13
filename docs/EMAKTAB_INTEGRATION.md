# eMaktab integratsiyasi

Bu hujjat eMaktab (yoki boshqa maktab axborot tizimi) ma’lumotlarini tizimga
xavfsiz va idempotent tarzda olib kirishni tushuntiradi.

## 1. Asosiy tamoyillar

Loyiha talablariga ko‘ra tizim quyidagilarni **qilmaydi**:

- eMaktab veb-interfeysini avtomatik yuklab olmaydi (scraping yo‘q);
- autentifikatsiya, CAPTCHA, MFA yoki boshqa himoyani chetlab o‘tmaydi;
- uchinchi tomon parolini **ochiq holda saqlamaydi** (barcha maxfiy kalitlar
  AES-256-GCM bilan shifrlanadi);
- muvaffaqiyatli sinxronizatsiyani **soxtalashtirmaydi** — har bir `SyncLog` faqat
  haqiqiy natijadan yoziladi.

Integratsiya sozlanmagan bo‘lsa, foydalanuvchiga aniq yo‘l-yo‘riq ko‘rsatiladi,
"muvaffaqiyatli" degan yolg‘on holat ko‘rsatilmaydi.

Ma’lum bir holatda **qaysi usuldan foydalanish** tavsiya etiladi:

| Holat | Tavsiya |
| --- | --- |
| Rasmiy, hujjatlashtirilgan eMaktab API yo‘q | **CSV/Excel import** (tavsiya etiladi) |
| Rasmiy API mavjud va ruxsat berilgan | **eMaktab API** konnektori |
| Hech biri yo‘q | Import qilmang; faqat qo‘lda kiritish |

## 2. Integratsiya qatlami arxitekturasi

```
IntegrationConnector (interfeys)
   ├── CsvExcelConnector   (requiresFile = true)
   └── EmaktabApiConnector (requiresCredentials = true)
             │
             ▼
      ImportDataset  ←  yagona oraliq ko‘rinish
             │
             ▼
      runImport()  →  SyncLog + ImportReviewItem (+ ExternalRef)
```

- `src/lib/integration/types.ts` — interfeys va `ImportDataset` tuzilishi.
- `src/lib/integration/registry.ts` — konnektorlar reyestri (`PROVIDER_META`).
- `src/lib/integration/engine.ts` — idempotent import dvigateli.
- `src/lib/integration/connectors/*` — aniq manba konnektorlari.

Yangi manba qo‘shish uchun faqat yangi konnektor yozib, `registry.ts` ga
ro‘yxatdan o‘tkazish kifoya — engine, UI va server actionlar o‘zgarmaydi.

## 3. CSV / Excel import

### 3.1. Fayl talablari

- Format: `.csv`, `.txt` (ajratuvchi: `,`, `;` yoki tab) yoki `.xlsx`.
  Eski `.xls` qo‘llab-quvvatlanmaydi — Excel’da `.xlsx` yoki `.csv` sifatida
  saqlang.
- CSV’da standart ajratuvchi — vergul; sozlamada o‘zgartirish mumkin.
- Birinchi qator odatda sarlavha (sozlamada o‘chirish mumkin).

### 3.2. Ustun nomlari

Ustun nomlari o‘zbek, rus va ingliz tillaridagi sinonimlarga moslanadi (registrga
sezgir emas). **Majburiy ustunlar:** ism va familiya; hamda sinf (nomi yoki id).

| Maydon | Qabul qilinadigan sarlavhalar (namuna) |
| --- | --- |
| Ism | `first_name`, `ism`, `ismi`, `name`, `имя` |
| Familiya | `last_name`, `familiya`, `sharif`, `surname`, `фамилия` |
| Otasining ismi | `middle_name`, `otasining_ismi`, `patronymic`, `отчество` |
| Tug‘ilgan sana | `birth_date`, `tugilgan_sana`, `dob`, `дата_рождения` |
| Jinsi | `gender`, `jinsi`, `sex`, `пол` |
| Sinf | `class`, `sinf`, `sinf_nomi`, `класс` |
| Sinf id | `class_id`, `sinf_id`, `sinf kodi` |
| O‘quv yili | `academic_year`, `oquv_yili`, `учебный_год` |
| O‘quvchi (tashqi) id | `external_id`, `id`, `student_id`, `pinfl` |
| Ota-ona | `guardian_name`, `ota_ona`, `parent_name` |
| Ota-ona telefoni | `guardian_phone`, `telefon`, `phone` |

Sana formatlari: `YYYY-MM-DD`, `DD.MM.YYYY`, `DD/MM/YYYY` yoki ISO.
Jins: `M/F`, `o‘g‘il/qiz`, `erkak/ayol`, `муж/жен`.

### 3.3. Qadamlar

1. **Sozlamalar → Integratsiya** bo‘limiga o‘ting
   (`/dashboard/integration`).
2. **"CSV / Excel import"** kartasida **"Sozlama qo‘shish"** tugmasini bosing:
   nom, ajratuvchi, standart o‘quv yili va "birinchi qator — sarlavha" belgisini
   kiriting.
3. **"Ulanishni sinash"** — fayl tanlab, o‘qilishini tekshiring (bu hali hech
   narsa yozmaydi).
4. **"Sinov import (dry-run)"** — hech narsa yozmasdan natijani ko‘ring.
5. **"Import qilish"** — haqiqiy import. Natija `SyncLog` ga yoziladi.

### 3.4. Namuna fayl va hajm chegarasi

- Tayyor namuna: [`public/namunalar/emaktab-oquvchilar.csv`](../public/namunalar/emaktab-oquvchilar.csv)
  — interfeysdagi fayl maydoni ostidagi **"namuna faylni yuklab oling"** havolasi orqali
  ham yuklab olish mumkin. (Namunadagi barcha ism-familiyalar **o‘ylab topilgan**, haqiqiy
  o‘quvchi ma’lumoti emas.)
- Fayl **server action** orqali yuboriladi. Next.js standart chegarsi 1 MB edi va haqiqiy
  maktab eksporti oshib ketardi; shu sababli `next.config.ts` da
  `experimental.serverActions.bodySizeLimit = "10mb"` qilib oshirilgan. Undan katta fayl
  kerak bo‘lsa, shu qiymatni oshiring. Fayl serverda **xotirada** qayta ishlanadi va diskda
  saqlanmaydi.

## 4. Idempotentlik kafolatlari

Bir xil faylni bir necha marta import qilish **dublikat yaratmaydi**:

1. **Tashqi ID orqali.** `ExternalRef` jadvali tashqi ID ↔ ichki ID mosligini
   saqlaydi. Kalit `source = "schoolId|provider"` ko‘rinishida nomlanadi, shuning
   uchun ikki maktab bir xil faylni import qilsa ham to‘qnashmaydi.
2. **Tabiiy kalit orqali (zaxira).** Tashqi ID bo‘lmasa: sinf nomi + o‘quv yili;
   o‘quvchi F.I.Sh. + tug‘ilgan sana.
3. **Noaniqlik jimgina hal qilinmaydi.** Agar bir nechta mos yozuv topilsa,
   qator `ImportReviewItem` ga yoziladi va foydalanuvchi qo‘lda qaror qabul
   qiladi (`CREATE_NEW`, `LINK_EXISTING`, `IGNORE`).
4. **Hech narsa o‘chirilmaydi.** Manbada yo‘qolgan o‘quvchi shunchaki oxirgi
   holatida qoladi.

## 5. eMaktab API konnektori

> Bu konnektor **haqiqiy HTTP klient**, ammo u faqat administrator rasmiy API
> manzili, resurs yo‘li va ruxsat ma’lumotlarini kiritganda ishlaydi. Hozircha
> ochiq hujjatlashtirilgan eMaktab API tasdiqlanmagan — shuning uchun **CSV/Excel
> import tavsiya etiladi**.

Sozlamalar:

| Maydon | Izoh |
| --- | --- |
| `baseUrl` | Rasmiy API bazaviy manzili (mas. `https://api.emaktab.uz`) |
| `endpointPath` | Hujjatlashtirilgan resurs yo‘li (mas. `/v1/school/classes`) |
| Login / token nomi | `X-Api-Login` sarlavhasi yoki token egasi |
| Maxfiy kalit / token | AES-256-GCM bilan shifrlanadi; tahrirlashda bo‘sh qoldirilsa avvalgisi saqlanadi |

**Kutilayotgan javob kontrakti** (`EmaktabApiConnector.normalise()`):

```json
{
  "classes": [
    { "id": "c-1", "name": "5-A", "grade": 5, "letter": "A", "academicYear": "2025-2026" }
  ],
  "students": [
    {
      "id": "s-1", "firstName": "Ali", "lastName": "Valiyev", "middleName": "…",
      "birthDate": "2013-04-02", "gender": "MALE",
      "classId": "c-1", "className": "5-A", "academicYear": "2025-2026"
    }
  ]
}
```

Kontrakt farq qilsa, faqat `normalise()` ni moslashtirish kifoya — engine va UI
o‘zgarmaydi. Javob kutilgan tuzilishga mos kelmasa, import **soxta natija
yozmasdan** xato qaytaradi.

## 6. Maxfiylik va xavfsizlik

- Maxfiy kalit hech qachon ochiq saqlanmaydi yoki mijozga yuborilmaydi; UI faqat
  niqoblangan ko‘rinishni (`credentialHint`) ko‘rsatadi.
- API so‘rovida parol query parametri sifatida yuborilmaydi va jurnalga
  yozilmaydi.
- Fayl importi serverda qayta ishlanadi; fayl turi va o‘lchami cheklangan.
- Har bir sozlash, sinxronizatsiya va tekshiruv qarori `AuditLog` ga yoziladi.

## 7. Muammolarni bartaraf etish

| Xabar | Sabab va yechim |
| --- | --- |
| `Faylda majburiy ustunlar topilmadi` | Ism/familiya ustunlari yo‘q. Sarlavhalarni tekshiring. |
| `Sinf ustuni topilmadi` | `class`/`sinf` yoki `class_id` ustuni kerak. |
| `Fayl bo‘sh yoki o‘qib bo‘lmadi` | Fayl bo‘sh yoki ajratuvchi noto‘g‘ri tanlangan. |
| `Eski .xls formati qo‘llab-quvvatlanmaydi` | Faylni `.xlsx`/`.csv` ga o‘giring. |
| `Tekshirish` bo‘limida yozuvlar paydo bo‘ldi | Bir xil ismli yoki tug‘ilgan sanasi mos kelmagan o‘quvchilar. Har biri uchun qaror qabul qiling. |
| API test `HTTP 401/403` | Ruxsat ma’lumotlari noto‘g‘ri yoki ruxsat yo‘q. |
| API test `kutilgan tuzilishga mos kelmadi` | API kontrakti boshqacha — `normalise()` ni moslashtiring. |
