import { test } from "node:test";
import assert from "node:assert/strict";
import { distributionSpread, scheduleDuty, type SchedulerTeacher } from "@/lib/duty/scheduler";

const dates = (list: string[]) => list;
const teacher = (id: string, name: string, assignedCount = 0, lastAssignedDate: string | null = null): SchedulerTeacher => ({
  id,
  name,
  assignedCount,
  lastAssignedDate,
});

const SEPT = dates([
  "2026-09-01",
  "2026-09-02",
  "2026-09-03",
  "2026-09-04",
  "2026-09-05",
  "2026-09-06",
  "2026-09-07",
  "2026-09-08",
  "2026-09-09",
]);

test("Navbatchilik teng taqsimlanadi (3 o‘qituvchi, 9 kun, kuniga 1)", () => {
  const result = scheduleDuty({
    dates: SEPT,
    perDay: 1,
    teachers: [teacher("t1", "Ali"), teacher("t2", "Bek"), teacher("t3", "Dilnoza")],
    avoidConsecutive: true,
  });
  assert.equal(result.assignments.length, 9);
  assert.equal(result.conflicts.length, 0);
  for (const row of result.distribution) assert.equal(row.total, 3);
  assert.equal(distributionSpread(result.distribution), 0);
});

test("Ketma-ket navbatchilikdan saqlanadi", () => {
  const result = scheduleDuty({
    dates: dates(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]),
    perDay: 1,
    teachers: [teacher("t1", "Ali"), teacher("t2", "Bek")],
    avoidConsecutive: true,
  });
  const byDate = new Map(result.assignments.map((a) => [a.date, a.teacherId]));
  assert.notEqual(byDate.get("2026-09-01"), byDate.get("2026-09-02"));
  assert.notEqual(byDate.get("2026-09-02"), byDate.get("2026-09-03"));
  assert.notEqual(byDate.get("2026-09-03"), byDate.get("2026-09-04"));
});

test("O‘qituvchi yetmasa konflikt qayd etiladi", () => {
  const result = scheduleDuty({
    dates: dates(["2026-09-01", "2026-09-02"]),
    perDay: 2,
    teachers: [teacher("t1", "Ali")],
    avoidConsecutive: false,
  });
  assert.equal(result.conflicts.length, 2);
  assert.equal(result.assignments.length, 2);
});

test("O‘qituvchi umuman bo‘lmasa har bir kun uchun konflikt", () => {
  const result = scheduleDuty({
    dates: dates(["2026-09-01"]),
    perDay: 1,
    teachers: [],
    avoidConsecutive: true,
  });
  assert.equal(result.assignments.length, 0);
  assert.equal(result.conflicts.length, 1);
});

test("Tarix hisobga olinadi: ko‘p navbatchilik qilganlarga kamroq beriladi", () => {
  const result = scheduleDuty({
    dates: dates(["2026-09-01", "2026-09-02", "2026-09-03"]),
    perDay: 1,
    teachers: [teacher("t1", "Ali", 10, "2026-08-31"), teacher("t2", "Bek", 0), teacher("t3", "Dilnoza", 0)],
    avoidConsecutive: true,
  });
  const ali = result.assignments.filter((a) => a.teacherId === "t1").length;
  assert.equal(ali, 0, "eng ko‘p navbatchilik qilgan birinchi tanlanmaydi");
});

test("Faqat tayin o‘qituvchilar mavjud bo‘lsa tanlanadi", () => {
  const result = scheduleDuty({
    dates: dates(["2026-09-01", "2026-09-02", "2026-09-03"]),
    perDay: 1,
    teachers: [
      teacher("t1", "Ali"),
      { ...teacher("t2", "Bek"), unavailableDates: ["2026-09-01", "2026-09-02", "2026-09-03"] },
    ],
    avoidConsecutive: true,
  });
  assert.ok(result.assignments.every((a) => a.teacherId === "t1"));
});

test("Algoritm deterministik", () => {
  const input = {
    dates: SEPT,
    perDay: 2,
    teachers: [teacher("t1", "Ali"), teacher("t2", "Bek"), teacher("t3", "Dilnoza"), teacher("t4", "Zafar")],
    avoidConsecutive: true,
  };
  const first = scheduleDuty(input);
  const second = scheduleDuty(input);
  assert.deepEqual(first.assignments, second.assignments);
});

test("Kuniga 2 nafar bir kunda takrorlanmaydi", () => {
  const result = scheduleDuty({
    dates: dates(["2026-09-01"]),
    perDay: 2,
    teachers: [teacher("t1", "Ali"), teacher("t2", "Bek"), teacher("t3", "Dilnoza")],
    avoidConsecutive: false,
  });
  const ids = result.assignments.map((a) => a.teacherId);
  assert.equal(new Set(ids).size, ids.length);
});
