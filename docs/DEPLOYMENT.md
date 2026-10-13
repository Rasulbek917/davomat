# Joylashtirish qo‘llanmasi (Deployment)

Ushbu hujjat tizimni ishlab chiqarish (production) muhitiga joylashtirishni
tushuntiradi.

## 1. Talablar

- **Node.js 20+** (Next.js 16 talabi)
- **PostgreSQL 15+** (tavsiya: 17)
- `npm` (yoki `pnpm`)
- HTTPS uchun reverse proxy (Nginx, Caddy) yoki platforma (Vercel)

## 2. Muhit o‘zgaruvchilari

`.env.example` ni `.env` ga nusxalab to‘ldiring. **`.env` hech qachon repoga
qo‘shilmaydi.**

| O‘zgaruvchi | Majburiy | Izoh |
| --- | :---: | --- |
| `DATABASE_URL` | ✅ | PostgreSQL ulanish satri |
| `SESSION_SECRET` | ✅ | Kamida 32 belgi; sessiya tokenini imzolash uchun |
| `CREDENTIAL_ENCRYPTION_KEY` | ✅ | 32 baytli (base64) AES-256-GCM kaliti |
| `APP_URL` | ➖ | Absolyut havolalar/eksport uchun; standart `http://localhost:3000` |
| `UPLOAD_DIR` | ➖ | Yuklangan fayllar papkasi; standart `storage/uploads` |
| `APP_TIMEZONE` | ➖ | Standart `Asia/Tashkent` |
| `EMAKTAB_API_BASE_URL` | ➖ | Faqat rasmiy API mavjud bo‘lsa |

Sirli qiymatlarni generatsiya qilish:

```bash
# SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# CREDENTIAL_ENCRYPTION_KEY (32 bayt → base64)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> `SESSION_SECRET` yoki `CREDENTIAL_ENCRYPTION_KEY` o‘zgarsa, barcha mavjud
> sessiyalar yaroqsiz bo‘ladi va saqlangan integratsiya kalitlarini qayta
> kiritish kerak bo‘ladi. Kalitlarni xavfsiz saqlang.

## 3. Ma’lumotlar bazasi

```bash
npm ci
npx prisma generate
npx prisma migrate deploy     # yoki: npm run db:deploy
```

Migratsiyalar versiyalangan (`prisma/migrations`). `migrate deploy` faqat mavjud
migratsiyalarni qo‘llaydi (sxemani o‘zgartirmaydi), shuning uchun production uchun
xavfsiz.

### Super Admin hisobi

To‘liq bo‘lmagan demo seed’ni productionda ishlatmang. Buning o‘rniga birinchi
administratorni yarating (masalan, alohida skript yoki `prisma studio`) va
quyidagi qiymatlarni bering:

- `SEED_SUPERADMIN_LOGIN` / `SEED_SUPERADMIN_PASSWORD` — faqat ishlab chiqish
  uchun namunaviy `seed.ts` ishlatadigan bo‘lsangiz.

Birinchi kirishdan keyin parolni **albatta** almashtiring.

## 4. Yig‘ish va ishga tushirish

```bash
npm run build
npm run start            # standart port 3000
```

Portni o‘zgartirish: `PORT=8080 npm run start`.

## 5. Reverse proxy va HTTPS

Nginx namunasi:

```nginx
server {
    listen 443 ssl http2;
    server_name davomat.example.uz;

    ssl_certificate     /etc/letsencrypt/live/davomat.example.uz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/davomat.example.uz/privkey.pem;

    client_max_body_size 5m;   # avatar yuklashdan katta bo‘lsin

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

`NODE_ENV=production` bo‘lganda sessiya cookie’si `secure` bo‘ladi — shuning uchun
HTTPS majburiy.

## 6. Fayl saqlash va zaxira

- Yuklangan avatarlar `UPLOAD_DIR` (standart `storage/uploads`) da saqlanadi.
  Konteynerda bu papkani **doimiy hajm (volume)** ga ulang, aks holda
  qayta joylashtirishda yo‘qoladi.
- Zaxira nusxalash:
  - **Ma’lumotlar bazasi:** `pg_dump` bilan kunlik.
  - **`UPLOAD_DIR`:** fayl darajasida haftalik.

```bash
pg_dump "$DATABASE_URL" -Fc -f backup_$(date +%F).dump
```

## 7. Xavfsizlikni mustahkamlash

- [ ] Barcha sirli qiymatlarni kuchli va tasodifiy qilib generatsiya qiling
- [ ] Demo hisoblarni va demo ma’lumotlarni o‘chiring
- [ ] HTTPS ni majburiy qiling (HSTS)
- [ ] `DATABASE_URL` faqat kerakli huquqlarga ega bo‘lsin
- [ ] `UPLOAD_DIR` veb-root tashqarisida bo‘lsin (kod shuni talab qiladi)
- [ ] Tizim va `npm` paketlarini yangilab turing
- [ ] Audit jurnalini muntazam ko‘zdan kechiring (`/admin` → so‘nggi harakatlar)

## 8. Konteyner (Docker) namunasi

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
RUN mkdir -p storage/uploads
EXPOSE 3000
CMD ["npm", "run", "start"]
```

`storage/uploads` ni volume qilib ulang. Migratsiyalarni alohida ishga tushiring
(`npx prisma migrate deploy`).

## 9. Monitoring

- Ilova jurnallari: `npm run start` chiqishini to‘plang yoki xizmat menejeri
  (systemd, PM2, Docker) orqali boshqaring.
- Health check uchun `GET /login` 200 qaytarishini tekshirish kifoya.
- Ma’lumotlar bazasi ulanishlari va `SyncLog` xatolarini kuzatib boring.

## 10. Yangilash tartibi

```bash
git pull
npm ci
npx prisma migrate deploy
npm run build
# xizmatni qayta ishga tushiring (systemd/pm2/docker)
```

Katta yangilanishlardan oldin `pg_dump` zaxirasini oling.
