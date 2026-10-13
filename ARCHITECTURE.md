# Arxitektura

## 1. Umumiy ko‘rinish

Tizim **Next.js 16 (App Router)** ustida qurilgan. Ma’lumotlar bilan ishlash
asosan **Server Actions** orqali amalga oshiriladi; ma’lumotlar bazasi
**PostgreSQL** va **Prisma 7** (`@prisma/adapter-pg` drayveri) yordamida
boshqariladi.

Asosiy tamoyillar:

1. **Ruxsat serverda tekshiriladi.** Har bir sahifa, server action va route
   handler `src/lib/auth/guards.ts` dagi yordamchilardan foydalanadi.
2. **Barcha so‘rovlar sessiyaga bog‘langan.** `schoolId` hech qachon mijozdan
   olinmaydi — u doim sessiyadan aniqlanadi.
3. **Ma’lumotlar hech qachon o‘chirilmaydi.** O‘quvchi/sinf o‘chirilganda
   `deletedAt` o‘rnatiladi (soft delete).
4. **Statistikalar faqat haqiqiy yozuvlardan** hisoblanadi. Namuna/soxta raqamlar
   yo‘q.

## 2. Katalog tuzilishi

```
prisma/
  schema.prisma          # 23 model, barcha jadvallar
  seed.ts                # idempotent demo ma’lumotlar
src/
  app/
    admin/               # Bosh administrator sahifalari
    dashboard/           # Direktor / xodim sahifalari
    api/                 # Route handlerlar (avatar, hisobot eksporti)
    login/               # Kirish sahifasi
  components/
    ui/                  # UI komponentlar to‘plami (Radix asosida)
    layout/              # App shell, sidebar, nav
    dashboard/           # Sahifalarga xos mijoz komponentlar
    charts/              # Recharts diagrammalar
    settings/            # Umumiy ko‘rinish sozlamalari
  hooks/
    use-action.ts        # Server Action chaqiruvlar uchun yordamchi
  lib/
    actions/             # Server actions (mutatsiyalar)
    attendance/          # Davomat semantikasi va so‘rovlar
    auth/                # Sessiya, guard, parol, cookie
    integration/         # Import tizimi (konnektorlar, engine)
    reports/             # Hisobot yig‘uvchi va eksportchilar
    validation/          # Zod sxemalari
    audit.ts db.ts date.ts env.ts constants.ts crypto.ts errors.ts ...
```

## 3. Rollar va ruxsatlar

Ruxsatlar `src/lib/constants.ts` dagi `PERMISSION` kalitlarida belgilangan.
`*` wildcard faqat bosh administratorga tegishli.

| Ruxsat | Bosh admin | Direktor | O‘rinbosar | O‘qituvchi | Xodim |
| --- | :---: | :---: | :---: | :---: | :---: |
| `schools:manage` | ✅ | — | — | — | — |
| `directors:manage` | ✅ | — | — | — | — |
| `employees:manage` | — | ✅ | — | — | — |
| `classes:read` | — | ✅ | ✅ | ✅ | ✅ |
| `classes:manage` | — | ✅ | — | — | — |
| `students:read` | — | ✅ | ✅ | ✅ | ✅ |
| `students:manage` | — | ✅ | — | — | — |
| `attendance:read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `attendance:write` | — | ✅ | ✅ | ✅ | — |
| `attendance:correct` | — | ✅ | ✅ | — | — |
| `reports:read` | ✅ | ✅ | ✅ | — | — |
| `reports:export` | ✅ | ✅ | ✅ | — | — |
| `integration:read` | ✅ | ✅ | ✅ | — | — |
| `integration:manage` | — | ✅ | — | — | — |
| `duty:read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `duty:manage` | — | ✅ | ✅ | — | — |
| `audit:read` | ✅ | ✅ | — | — | — |

> Bosh administrator (super admin) `*` ruxsatiga ega, lekin **maktabga bog‘langan
> amallarni bajarmaydi** — uni `requireSchoolPermission` rad etadi. U faqat
> platforma darajasidagi ko‘rinish/hisobotlarga ega.

### Maktab izolyatsiyasi

- `requireSchoolPermission(permission)` — foydalanuvchidan ruxsatni so‘raydi va
  `schoolId` ni **sessiyadan** qaytaradi.
- `assertSchoolAccess(user, schoolId)` — boshqa maktab id si bilan kelgan so‘rovni
  rad etadi (gorizontal imtiyoz oshirilishining oldini oladi).
- `schoolScope(user)` — Prisma `where` uchun tayyor filtr qaytaradi.

## 4. Davomat semantikasi

Barcha qoida yagona joyda — `src/lib/attendance/percentage.ts`:

1. **Kim hisobga olinadi:** faqat tanlangan sanada sinfga haqiqatda biriktirilgan
   o‘quvchilar (enrollment asosida).
2. **Keldi hisoblanadi:** `PRESENT + LATE` (kechikkan ham kelgan).
3. **Kelmagan hisoblanadi:** `ABSENT + EXCUSED` (sababli ham — kelmagan).
4. **Davomat foizi** = `attended / recorded`. **Belgilanmagan** o‘quvchi hech
   qachon "kelmagan" deb hisoblanmaydi — u `unrecorded` sifatida alohida
   ko‘rsatiladi.
5. **Qamrov (coverage)** = `recorded / eligible`. Qamrov
   `MIN_COVERAGE_FOR_RANKING = 70%` dan past bo‘lsa, sinf `reliable: false`
   belgilanadi va "eng yaxshi/eng yomon" reytingda cheklov ko‘rsatiladi.
6. Haftalik/oylik hisobotlar **har bir sinfning o‘z o‘qish kunlari**ga va maktab
   taqvimiga (`SchoolCalendar`) tayanadi. Sinf o‘qimaydigan kunda davomat
   talab qilinmaydi va u "kelmagan" deb hisoblanmaydi.

Har bir holat o‘zgarishi `AttendanceChange` jadvaliga yoziladi (audit). Avvaldan
`SUBMITTED` bo‘lgan sessiyani o‘zgartirish uchun `attendance:correct` ruxsati
talab qilinadi.

## 5. Ma’lumotlar modeli

| Jadval | Vazifasi |
| --- | --- |
| `Role` | Rollar va ruxsatlar |
| `School` | Maktablar |
| `User` | Foydalanuvchilar (login, parol xeshi, yuklangan avatar) |
| `Session` | Opaque token sessiyalari (faqat HMAC saqlanadi) |
| `UserPreference` | Mavzu, sidebar, standart smena |
| `EmployeeProfile` | Xodim profili (rolga xos) |
| `SchoolClass` | Sinflar (o‘quv yili bilan, `workingDays` — joriy o‘qish kunlari) |
| `ClassSchedule` | Sinf o‘qish kunlari versiyalari (`effectiveFrom` bilan sanaladi) |
| `Student` | O‘quvchilar (soft delete) |
| `Enrollment` | O‘quvchi ↔ sinf biriktirish |
| `SchoolCalendar` | Ish/dam olish kunlari |
| `AttendanceSession` | Kunlik davomat sessiyasi (sinf+sana+smena) |
| `AttendanceRecord` | Har bir o‘quvchining holati |
| `AttendanceChange` | Holat o‘zgarishlari tarixi |
| `DutySettings` | Navbatchilik sozlamalari (davr, kuniga soni, kunlar) |
| `DutyTeacherEligibility` | Navbatchilikka qatnashish va mavjud emas davrlari |
| `DutyAssignment` | Kunlik navbatchi tayinlovlari (holat, asl o‘qituvchi) |
| `DutyChange` | Navbatchilik o‘zgarishlari tarixi |
| `IntegrationConfig` | Import sozlamalari (shifrlangan kalitlar) |
| `SyncLog` | Import natijalari |
| `ExternalRef` | Tashqi ID ↔ ichki ID mosligi (idempotentlik kaliti) |
| `ImportReviewItem` | Qo‘lda hal qilinadigan noaniq yozuvlar |
| `AuditLog` | Umumiy audit jurnali |

## 6. Autentifikatsiya va sessiya

- Parollar `bcryptjs` bilan xeshlanadi.
- Sessiya tokeni — tasodifiy 32 baytli qiymat, faqat **HMAC-SHA256** xeshi
  bazada saqlanadi. Cookie: `httpOnly`, `sameSite=lax`, productionda `secure`.
- Muddat: oddiy — 12 soat, "eslab qolish" — 30 kun.
- Login urinishlari `rate-limit.ts` orqali cheklanadi; ketma-ket muvaffaqiyatsiz
  urinishlardan keyin hisob vaqtincha bloklanadi.
- Birinchi kirishda parolni almashtirish talab qilinishi mumkin
  (`mustChangePassword` → `<home>/profile?c=1`).

## 7. Server actions

Har bir `src/lib/actions/*.ts` fayli `"use server"` bilan boshlanadi va faqat
**asinxron funksiyalar** eksport qiladi. Naqsh:

```ts
export async function doSomethingAction(raw: unknown): Promise<ActionResult<T>> {
  try {
    const actor = await requireSchoolPermission(PERMISSION.X);
    const input = someSchema.parse(raw);      // Zod
    // ... Prisma bilan ishlash (schoolId = actor.schoolId)
    await recordAudit({ ... });               // audit
    revalidatePath("/dashboard/...");         // kesheni yangilash
    return ok(result);
  } catch (error) {
    return fail(error);                       // xavfsiz xato xabari
  }
}
```

`ActionResult` `{ ok: true, data }` yoki `{ ok: false, error, code?, fields? }`
ko‘rinishida. Mijoz tomonida `useAction()` yordamchisi `pending`, `error`,
`fieldErrors`, `run`, `reset`, `setError` ni beradi.

## 8. Ko‘rinish va mavzu (theme)

- Mavzu `UserPreference.theme` da (`LIGHT` / `DARK` / `SYSTEM`) saqlanadi va
  `davomat_theme` cookie orqali ham yoziladi.
- `ThemeScript` inline skripti gidratatsiyadan oldin `.dark` klassini qo‘llaydi
  (miltillashsiz).
- Sidebar yig‘ilish holati ham saqlanadi; mobil qurilmada chiziladigan (drawer)
  menyu ishlatiladi.

## 9. Integratsiya arxitekturasi

Integratsiya `IntegrationConnector` interfeysiga tayanadi
(`src/lib/integration/types.ts`). Har bir konnektor manba ma’lumotini yagona
`ImportDataset` ko‘rinishiga keltiradi; qolgan qism (import engine, UI, server
actions) manba turidan xabardor emas. Yangi manba qo‘shish uchun faqat bitta
konnektor yozib, `registry.ts` ga ro‘yxatdan o‘tkazish kifoya.

Import dvigateli (`engine.ts`) idempotent:

- moslik `ExternalRef` (tashqi ID) orqali, zaxira sifatida tabiiy kalitlar
  (sinf nomi + o‘quv yili, o‘quvchi F.I.Sh. + tug‘ilgan sana) orqali aniqlanadi;
- hech narsa o‘chirilmaydi;
- noaniqlik jimgina hal qilinmaydi — `ImportReviewItem` ga yoziladi;
- `dryRun` hech narsa yozmasdan bir xil tekshiruvni bajaradi.

Batafsil: [`docs/EMAKTAB_INTEGRATION.md`](./EMAKTAB_INTEGRATION.md).

## 10. Hisobotlar va eksport

`src/lib/reports/aggregate.ts` yagona struktura qaytaradi (maktab, sinf, o‘quvchi,
platforma). `src/app/api/reports/export/route.ts` shu strukturadan CSV/Excel/PDF
yaratadi. Eksport huquqi: maktab/sinf/o‘quvchi uchun `reports:export`; platforma
uchun faqat bosh administrator. Maktab foydalanuvchisi uchun `schoolId` sessiyadan
olinadi.

## 11. Fayl saqlash

- Avatarlar: maksimum 2 MB, JPEG/PNG/WebP, `sharp` bilan 512×512 WebP ga qayta
  ishlanadi va veb-root tashqarisida (`UPLOAD_DIR`) saqlanadi.
- Yuklangan fayllar autentifikatsiyalangan route (`/api/avatars/[...path]`) orqali
  beriladi.

## 12. Xavfsizlik nazorati

- [x] Parollar `bcrypt` bilan xeshlangan
- [x] Sessiya tokenining faqat HMAC xeshi saqlanadi
- [x] Server tomonidagi RBAC (har bir amalda)
- [x] Maktab darajasidagi izolyatsiya
- [x] Login uchun rate-limit va bloklash
- [x] Zod orqali kirish validatsiyasi (SQLi/XSS oldini olish)
- [x] CSRF — Server Actions/cookie `sameSite` himoyasi
- [x] Audit jurnali
- [x] Cheklangan fayl yuklash (tur, hajm, qayta ishlash)
- [x] Maxfiy kalitlar AES-256-GCM bilan shifrlangan
- [x] Manba kodda hech qanday sir yo‘q (`.env` bilan boshqariladi)

## 13. Sinf o‘qish kunlari

Har bir sinf haftaning o‘z kunlarida o‘qiydi (dushanbadan shanbagacha istalgan
kombinatsiya). Bu maktabning umumiy navbatchilik kunlaridan **mustaqil**.

- Sof mantiq `src/lib/attendance/schedule-core.ts` da (bazaga bog‘lanmagan, shu
  sababli birlik testlari bilan qamrab olingan); ma’lumotlar bazasidan yuklash
  `class-schedule.ts` da.
- Jadval **versiyalanadi**: `ClassSchedule.effectiveFrom` sanasidan boshlab amal
  qiladi. Resolver har bir sana uchun `effectiveFrom <= sana` bo‘lgan eng so‘nggi
  versiyani tanlaydi — shu tariqa o‘tgan davr hisobotlari qayta yozilmaydi.
- `SchoolClass.workingDays` — joriy holatning tezkor (denormalizatsiya qilingan)
  nusxasi; versiya umuman bo‘lmasa, zaxira qiymat sifatida ishlatiladi.
- Maktab taqvimidagi dam kuni (`isWorkingDay = false`) sinf kunini bekor qiladi,
  lekin maktab "qo‘shimcha ish kuni" sinfni jadvaldan tashqarida o‘qishga majburlay
  olmaydi.
- `/dashboard/attendance` sahifasida sinf o‘qimaydigan kun tanlansa, ogohlantirish
  ko‘rsatiladi va tizim **hech kimni avtomatik "kelmadi" deb belgilamaydi**.

## 14. Navbatchilik (duty)

- Sof avtoshiy algoritm — `src/lib/duty/scheduler.ts` dagi `scheduleDuty`
  (deterministik, adolatga asoslangan ochko‘z algoritm):
  1. eng kam jami navbatchilik qilganlar oldinda;
  2. keyin ketma-ket kunlardan qochish (`avoidConsecutive` yoqilgan bo‘lsa);
  3. keyin eng uzoq vaqt navbatchilik qilmaganlar;
  4. oxirida ism bo‘yicha barqaror tartib (determinizm).
- Yetarli o‘qituvchi bo‘lmasa, tizim **soxta tayinlov yaratmaydi** — har bir kun
  uchun konflikt qayd etiladi va UI da ko‘rsatiladi.
- Yangi jadval tuzilganda faqat `PLANNED` holatidagi tayinlovlar almashtiriladi;
  `COMPLETED` / `REPLACED` / `CANCELLED` tarixi saqlanadi.
- Har bir o‘zgarish (tayinlash, almashtirish, bekor qilish, holat) `DutyChange`
  jadvaliga yozib boriladi. Almashtirishda asl o‘qituvchi ham saqlanadi.
- `DutySettings.weekdays` navbatchilik kunlari; ular sinflarning o‘qish kunlaridan
  alohida o‘rnatiladi. Maktab taqvimidagi dam kunlari o‘tkazib yuboriladi.
- Ko‘rinish huquqlari: `duty:read` — o‘z jadvalini ko‘rish (o‘qituvchi uchun faqat
  o‘ziniki), `duty:manage` — tuzish/tahrirlash. Bosh administrator
  `/admin/duty` orqali barcha maktablarni faqat o‘qish rejimida ko‘radi.
