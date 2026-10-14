"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import type { PeriodPreset } from "@/lib/date";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/ui/stat-card";
import { PeriodFilter } from "@/components/filters/period-filter";
import { Users, Gauge, CalendarCheck, Sparkles } from "lucide-react";
import { formatPercent } from "@/lib/utils";

export type ClassStudentRanking = {
  studentId: string;
  fullName: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  recorded: number;
  rate: number;
};

export function ClassTeacherDashboard({
  className,
  totalStudents,
  rate,
  weekly,
  monthly,
  todayAbsentLateExcused,
  bestStudent,
  worstStudent,
  ranking,
  periodFrom,
  periodTo,
  periodPreset,
  aiHref,
}: {
  className: string;
  totalStudents: number;
  rate: number;
  weekly: number;
  monthly: number;
  todayAbsentLateExcused: Array<{ fullName: string; status: string }>;
  bestStudent: ClassStudentRanking | null;
  worstStudent: ClassStudentRanking | null;
  ranking: ClassStudentRanking[];
  periodFrom: string;
  periodTo: string;
  periodPreset: PeriodPreset;
  daily: { date: string; label: string; rate: number; recorded: number; isSchoolDay: boolean }[];
  /** When set, shows the "AI bilan sinfimni tahlil qilish" shortcut. */
  aiHref?: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const sort = searchParams.get("sort") ?? "rate_desc";

  const handleSort = (s: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", s);
    router.push(`${pathname}?${params.toString()}`);
  };

  const sorted = [...ranking].sort((a, b) => {
    if (sort === "rate_asc") return a.rate - b.rate;
    if (sort === "name") return a.fullName.localeCompare(b.fullName, "uz");
    return b.rate - a.rate;
  });

  const todayCount = todayAbsentLateExcused.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{className}</h1>
          <p className="text-muted-foreground">Sinf rahbari dashboardi</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {aiHref && (
            <Button asChild variant="outline" size="sm">
              <Link href={aiHref}>
                <Sparkles className="h-4 w-4" /> AI bilan sinfimni tahlil qilish
              </Link>
            </Button>
          )}
          <PeriodFilter preset={periodPreset} from={periodFrom} to={periodTo} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="O‘quvchilar" value={totalStudents} icon={Users} tone="primary" />
        <StatCard label="Davomat foizi" value={formatPercent(rate)} icon={Gauge} tone="success" />
        <StatCard label="Haftalik davomat" value={formatPercent(weekly)} icon={CalendarCheck} tone="info" />
        <StatCard label="Oylik davomat" value={formatPercent(monthly)} icon={CalendarCheck} tone="default" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Bugun kelmagan o‘quvchilar</CardTitle>
            <CardDescription>Bugungi davomat holati</CardDescription>
          </CardHeader>
          <CardContent>
            {todayCount === 0 ? (
              <p className="text-sm text-muted-foreground">Bugun barcha o‘quvchilar kelgan</p>
            ) : (
              <ul className="space-y-2">
                {todayAbsentLateExcused.map((s, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span>{s.fullName}</span>
                    <span className="text-muted-foreground">{s.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>🏆 Eng yaxshi davomatli o‘quvchi</CardTitle>
            </CardHeader>
            <CardContent>
              {bestStudent ? (
                <div className="flex items-baseline justify-between">
                  <p className="text-lg font-semibold">{bestStudent.fullName}</p>
                  <p className="text-2xl font-semibold text-success">{formatPercent(bestStudent.rate)}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Yetarli ma’lumot yo‘q</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>⚠️ Eng past davomatli o‘quvchi</CardTitle>
            </CardHeader>
            <CardContent>
              {worstStudent ? (
                <div className="flex items-baseline justify-between">
                  <p className="text-lg font-semibold">{worstStudent.fullName}</p>
                  <p className="text-2xl font-semibold text-warning dark:text-warning">{formatPercent(worstStudent.rate)}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Yetarli ma’lumot yo‘q</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle>O‘quvchilar davomat reytingi</CardTitle>
            <CardDescription>Tanlangan davr bo‘yicha sinf ichidagi reyting</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant={sort === "rate_desc" ? "default" : "outline"} onClick={() => handleSort("rate_desc")}>
              Yaxshi → Yomon
            </Button>
            <Button size="sm" variant={sort === "rate_asc" ? "default" : "outline"} onClick={() => handleSort("rate_asc")}>
              Yomon → Yaxshi
            </Button>
            <Button size="sm" variant={sort === "name" ? "default" : "outline"} onClick={() => handleSort("name")}>
              Ism bo‘yicha
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>O‘rin</TableHead>
                <TableHead>O‘quvchi</TableHead>
                <TableHead className="text-right">Keldi</TableHead>
                <TableHead className="text-right">Kelmadi</TableHead>
                <TableHead className="text-right">Kechikdi</TableHead>
                <TableHead className="text-right">Sababli</TableHead>
                <TableHead className="text-right">Davomat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r, idx) => (
                <TableRow key={r.studentId}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell className="font-medium">{r.fullName}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.present}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.absent}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.late}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.excused}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatPercent(r.rate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
