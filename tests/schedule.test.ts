import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResolver } from "@/lib/attendance/schedule-core";

/** All dates below are UTC date-only values; 2026-10-12 is a Monday. */
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const WEEK = { from: d("2026-10-12"), to: d("2026-10-18") };

test("5 kunlik sinf (Du–Ju) shanba kuni o‘qimaydi", () => {
  const resolver = buildResolver([], new Map([["a", [1, 2, 3, 4, 5]]]));
  assert.equal(resolver.isStudyDay("a", d("2026-10-17")), false, "shanba o‘qish kuni emas");
  assert.equal(resolver.isStudyDay("a", d("2026-10-18")), false, "yakshanba o‘qish kuni emas");
  assert.equal(resolver.countStudyDays("a", WEEK, new Map()), 5);
});

test("6 kunlik sinf (Du–Shan) shanba kuni o‘qiydi", () => {
  const resolver = buildResolver([], new Map([["b", [1, 2, 3, 4, 5, 6]]]));
  assert.equal(resolver.isStudyDay("b", d("2026-10-17")), true, "shanba o‘qish kuni");
  assert.equal(resolver.countStudyDays("b", WEEK, new Map()), 6);
});

test("Ixtiyoriy kunlar (Se–Shan) to‘g‘ri ishlaydi", () => {
  const resolver = buildResolver([], new Map([["c", [2, 3, 4, 5, 6]]]));
  assert.equal(resolver.isStudyDay("c", d("2026-10-12")), false, "dushanba o‘qimaydi");
  assert.equal(resolver.isStudyDay("c", d("2026-10-13")), true, "seshanba o‘qiydi");
  assert.equal(resolver.isStudyDay("c", d("2026-10-17")), true, "shanba o‘qiydi");
});

test("Bir sinf jadvali boshqasiga ta’sir qilmaydi", () => {
  const resolver = buildResolver(
    [],
    new Map([
      ["a", [1, 2, 3, 4, 5]],
      ["b", [1, 2, 3, 4, 5, 6]],
    ]),
  );
  assert.equal(resolver.isStudyDay("a", d("2026-10-17")), false);
  assert.equal(resolver.isStudyDay("b", d("2026-10-17")), true);
});

test("Maktab taqvimi dam kunini o‘qish kunidan chiqaradi", () => {
  const resolver = buildResolver([], new Map([["a", [1, 2, 3, 4, 5]]]));
  const overrides = new Map([["2026-10-14", false]]);
  assert.equal(resolver.isStudyDay("a", d("2026-10-14"), false), false);
  assert.equal(resolver.countStudyDays("a", WEEK, overrides), 4);
});

test("Taqvim 5 kunlik sinfni shanba kuni o‘qishga majburlamaydi", () => {
  const resolver = buildResolver([], new Map([["a", [1, 2, 3, 4, 5]]]));
  // School marks Saturday as an extra working day, but the class does not study.
  assert.equal(resolver.isStudyDay("a", d("2026-10-17"), true), false);
});

test("Jadval versiyalari sanaga qarab tanlanadi", () => {
  const resolver = buildResolver(
    [
      { classId: "a", effectiveFrom: "2026-10-01", effectiveTo: null, weekdays: [1, 2, 3, 4, 5] },
      { classId: "a", effectiveFrom: "2026-10-16", effectiveTo: null, weekdays: [2, 3, 4, 5, 6] },
    ],
    new Map(),
  );
  // Before the change: Monday is a study day.
  assert.equal(resolver.isStudyDay("a", d("2026-10-12")), true);
  // After the change (effective 2026-10-16): Monday is not, Saturday is.
  assert.equal(resolver.isStudyDay("a", d("2026-10-19")), false);
  assert.equal(resolver.isStudyDay("a", d("2026-10-17")), true);
});

test("Jadval bo‘lmasa Du–Ju standart qoidasi qo‘llanadi", () => {
  const resolver = buildResolver([], new Map());
  assert.equal(resolver.countStudyDays("unknown", WEEK, new Map()), 5);
});
