import { CalendarCheck2, ClipboardCheck, ShieldCheck, TrendingUp } from "lucide-react";
import { redirectIfAuthenticated } from "@/lib/auth/guards";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Tizimga kirish" };

const FEATURES = [
  { icon: ClipboardCheck, text: "Bir necha bosishda sinf davomatini belgilash" },
  { icon: TrendingUp, text: "Sinf va maktab bo‘yicha aniq tahlillar" },
  { icon: ShieldCheck, text: "Rollar bo‘yicha xavfsiz ruxsatlar" },
  { icon: CalendarCheck2, text: "Haftalik va oylik hisobotlar, eksport" },
];

export default async function LoginPage() {
  await redirectIfAuthenticated();

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, white 0, transparent 45%), radial-gradient(circle at 80% 70%, white 0, transparent 40%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-lg font-bold">
            MD
          </span>
          <div>
            <p className="text-lg font-semibold">Maktab Davomat</p>
            <p className="text-sm text-primary-foreground/70">Boshqaruv tizimi</p>
          </div>
        </div>

        <div className="relative space-y-6">
          <h1 className="max-w-md text-3xl font-semibold leading-tight">
            Maktab davomatini zamonaviy va ishonchli tarzda boshqaring.
          </h1>
          <ul className="space-y-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <li key={feature.text} className="flex items-center gap-3 text-sm text-primary-foreground/90">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                    <Icon className="h-4 w-4" />
                  </span>
                  {feature.text}
                </li>
              );
            })}
          </ul>
        </div>

        <p className="relative text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} Maktab Davomat. Barcha huquqlar himoyalangan.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
              MD
            </span>
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Tizimga kirish</h1>
            <p className="text-sm text-muted-foreground">
              Hisobingiz maktab administratori tomonidan yaratiladi.
            </p>
          </div>
          <LoginForm />
          <p className="text-center text-xs text-muted-foreground">
            Hisobingiz yo‘qmi? Maktab direktoriga yoki tizim administratoriga murojaat qiling.
          </p>
        </div>
      </div>
    </div>
  );
}