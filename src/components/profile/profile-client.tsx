"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FormField } from "@/components/ui/form-field";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAction } from "@/hooks/use-action";
import {
  changePasswordAction,
  updateAvatarAction,
  updateProfileAction,
} from "@/lib/auth/actions";
import { initials } from "@/lib/utils";

export type ProfileUser = {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  login: string;
  phone: string | null;
  avatarPath: string | null;
  roleNameUz: string;
  schoolName: string | null;
  mustChangePassword: boolean;
};

export function ProfileClient({ user }: { user: ProfileUser }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceChange = searchParams.get("c") === "1" || user.mustChangePassword;

  const [tab, setTab] = React.useState(forceChange ? "security" : "profile");

  const profileAction = useAction();
  const passwordAction = useAction();
  const avatarAction = useAction();

  const [form, setForm] = React.useState({
    firstName: user.firstName,
    lastName: user.lastName,
    middleName: user.middleName ?? "",
    login: user.login,
    phone: user.phone ?? "",
  });

  const [pass, setPass] = React.useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [profileSaved, setProfileSaved] = React.useState(false);
  const [passwordSaved, setPasswordSaved] = React.useState(false);

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const setP = (key: keyof typeof pass, value: string) => setPass((prev) => ({ ...prev, [key]: value }));

  const submitProfile = (event: React.FormEvent) => {
    event.preventDefault();
    setProfileSaved(false);
    profileAction.run(() => updateProfileAction(form), {
      onSuccess: () => {
        setProfileSaved(true);
        router.refresh();
      },
    });
  };

  const submitPassword = (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordSaved(false);
    passwordAction.run(() => changePasswordAction(pass), {
      onSuccess: () => {
        setPasswordSaved(true);
        setPass({ currentPassword: "", newPassword: "", confirmPassword: "" });
        router.refresh();
      },
    });
  };

  const onAvatarSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("avatar", file);
    avatarAction.run(() => updateAvatarAction(fd), {
      onSuccess: () => router.refresh(),
    });
    event.target.value = "";
  };

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-6">
      <TabsList>
        <TabsTrigger value="profile" className="gap-2">
          <UserRound className="h-4 w-4" /> Profil
        </TabsTrigger>
        <TabsTrigger value="security" className="gap-2">
          <KeyRound className="h-4 w-4" /> Xavfsizlik
        </TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profil rasmi</CardTitle>
            <CardDescription>JPEG, PNG yoki WebP, hajmi 2 MB gacha. Rasm avtomatik qayta ishlanadi.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 sm:flex-row">
            <Avatar className="h-20 w-20 text-xl">
              {user.avatarPath && <AvatarImage src={`/api/avatars/${user.avatarPath}`} alt={user.firstName} />}
              <AvatarFallback>{initials(user.firstName, user.lastName)}</AvatarFallback>
            </Avatar>
            <div className="space-y-2 text-center sm:text-left">
              <label htmlFor="avatar-input">
                <Button asChild variant="outline" disabled={avatarAction.pending}>
                  <span className="cursor-pointer">
                    <Camera /> {avatarAction.pending ? "Yuklanmoqda..." : "Rasm yuklash"}
                  </span>
                </Button>
              </label>
              <input
                id="avatar-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={onAvatarSelected}
              />
              {avatarAction.error && <p className="text-xs text-destructive">{avatarAction.error}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shaxsiy ma’lumotlar</CardTitle>
            <CardDescription>
              {user.roleNameUz}
              {user.schoolName ? ` · ${user.schoolName}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitProfile} className="space-y-4">
              {profileAction.error && (
                <Alert variant="destructive">
                  <AlertDescription className="text-foreground">{profileAction.error}</AlertDescription>
                </Alert>
              )}
              {profileSaved && (
                <Alert variant="success">
                  <AlertDescription className="text-foreground">Profil saqlandi.</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Familiya" htmlFor="lastName" required error={profileAction.fieldErrors["lastName"]}>
                  <Input id="lastName" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required />
                </FormField>
                <FormField label="Ism" htmlFor="firstName" required error={profileAction.fieldErrors["firstName"]}>
                  <Input id="firstName" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required />
                </FormField>
                <FormField label="Otasining ismi" htmlFor="middleName" error={profileAction.fieldErrors["middleName"]}>
                  <Input id="middleName" value={form.middleName} onChange={(e) => set("middleName", e.target.value)} />
                </FormField>
                <FormField label="Telefon" htmlFor="phone" error={profileAction.fieldErrors["phone"]}>
                  <Input id="phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+998 ..." />
                </FormField>
                <FormField
                  label="Login"
                  htmlFor="login"
                  required
                  error={profileAction.fieldErrors["login"]}
                  hint="Login tizimda yagona bo‘lishi kerak."
                >
                  <Input id="login" value={form.login} onChange={(e) => set("login", e.target.value)} required />
                </FormField>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={profileAction.pending}>
                  {profileAction.pending ? "Saqlanmoqda..." : "Saqlash"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="security" className="space-y-6">
        {forceChange && (
          <Alert variant="warning">
            <ShieldCheck />
            <AlertTitle>Parolni almashtirish tavsiya etiladi</AlertTitle>
            <AlertDescription className="text-foreground">
              Hisobingiz vaqtinchalik parol bilan ochilgan. Xavfsizlik uchun uni almashtiring.
            </AlertDescription>
          </Alert>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Parolni o‘zgartirish</CardTitle>
            <CardDescription>Parol kamida 8 belgidan iborat bo‘lishi va joriy paroldan farq qilishi kerak.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitPassword} className="space-y-4">
              {passwordAction.error && (
                <Alert variant="destructive">
                  <AlertDescription className="text-foreground">{passwordAction.error}</AlertDescription>
                </Alert>
              )}
              {passwordSaved && (
                <Alert variant="success">
                  <AlertDescription className="text-foreground">
                    Parol yangilandi. Boshqa qurilmalardagi seanslar yakunlandi.
                  </AlertDescription>
                </Alert>
              )}
              <Separator />
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="Joriy parol" htmlFor="currentPassword" required error={passwordAction.fieldErrors["currentPassword"]}>
                  <Input
                    id="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    value={pass.currentPassword}
                    onChange={(e) => setP("currentPassword", e.target.value)}
                    required
                  />
                </FormField>
                <FormField label="Yangi parol" htmlFor="newPassword" required error={passwordAction.fieldErrors["newPassword"]}>
                  <Input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    value={pass.newPassword}
                    onChange={(e) => setP("newPassword", e.target.value)}
                    minLength={8}
                    required
                  />
                </FormField>
                <FormField label="Tasdiqlash" htmlFor="confirmPassword" required error={passwordAction.fieldErrors["confirmPassword"]}>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={pass.confirmPassword}
                    onChange={(e) => setP("confirmPassword", e.target.value)}
                    required
                  />
                </FormField>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={passwordAction.pending}>
                  {passwordAction.pending ? "Saqlanmoqda..." : "Parolni o‘zgartirish"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
