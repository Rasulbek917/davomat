"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "@/components/theme";
import { useAction } from "@/hooks/use-action";
import { updatePreferenceAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

type ThemeChoice = "LIGHT" | "DARK" | "SYSTEM";
type Slot = "FULL_DAY" | "MORNING" | "AFTERNOON";

const THEME_OPTIONS: { value: ThemeChoice; label: string; description: string; icon: typeof Sun }[] = [
  { value: "LIGHT", label: "Yorug‘", description: "Kunduzgi mavzu", icon: Sun },
  { value: "DARK", label: "Tungi", description: "Qorong‘i mavzu", icon: Moon },
  { value: "SYSTEM", label: "Tizim", description: "Qurilma sozlamasiga mos", icon: Monitor },
];

const SLOT_LABEL: Record<Slot, string> = {
  FULL_DAY: "To‘liq kun",
  MORNING: "Birinchi smena",
  AFTERNOON: "Ikkinchi smena",
};

/**
 * Theme + attendance-slot preferences. Shared by the school settings page and
 * the Super Admin settings page, since both are per-user preferences.
 */
export function AppearanceSettings({
  initialTheme,
  attendanceSlot,
  showSlot = true,
}: {
  initialTheme: ThemeChoice;
  attendanceSlot: Slot;
  showSlot?: boolean;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme(initialTheme);
  const prefAction = useAction();
  const [slot, setSlot] = React.useState<Slot>(attendanceSlot);
  const [saved, setSaved] = React.useState(false);

  const chooseTheme = (next: ThemeChoice) => {
    setSaved(false);
    setTheme(next);
    prefAction.run(() => updatePreferenceAction({ theme: next }), {
      onSuccess: () => {
        setSaved(true);
        router.refresh();
      },
    });
  };

  const changeSlot = (next: Slot) => {
    setSlot(next);
    setSaved(false);
    prefAction.run(() => updatePreferenceAction({ theme, attendanceSlot: next }), {
      onSuccess: () => {
        setSaved(true);
        router.refresh();
      },
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Mavzu</CardTitle>
          <CardDescription>Tanlov hisobingizga saqlanadi va barcha qurilmalarda qo‘llanadi.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => chooseTheme(option.value)}
                  disabled={prefAction.pending}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-accent/40",
                    active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border",
                  )}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="flex-1">
                    <span className="flex items-center gap-2 font-medium">
                      {option.label}
                      {active && <Check className="h-4 w-4 text-primary" />}
                    </span>
                    <span className="block text-xs text-muted-foreground">{option.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {prefAction.error && (
            <Alert variant="destructive">
              <AlertDescription className="text-foreground">{prefAction.error}</AlertDescription>
            </Alert>
          )}
          {saved && !prefAction.error && (
            <Alert variant="success">
              <AlertDescription className="text-foreground">Saqlandi.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {showSlot && (
        <Card>
          <CardHeader>
            <CardTitle>Davomat standarti</CardTitle>
            <CardDescription>Yangi davomat belgilashda tanlanadigan standart smena.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormField label="Standart smena" htmlFor="slot">
              <Select value={slot} onValueChange={(value) => changeSlot(value as Slot)}>
                <SelectTrigger id="slot" className="sm:max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SLOT_LABEL) as Slot[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {SLOT_LABEL[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </CardContent>
        </Card>
      )}
    </>
  );
}
