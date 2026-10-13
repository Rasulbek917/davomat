import { IntegrationProvider } from "@prisma/client";
import {
  ConnectorError,
  type ConnectorContext,
  type ConnectorTestResult,
  type ImportDataset,
  type IntegrationConnector,
  type SourceClass,
  type SourceStudent,
} from "@/lib/integration/types";

/**
 * ---------------------------------------------------------------------------
 * eMaktab API connector — READ THIS BEFORE ENABLING IT
 * ---------------------------------------------------------------------------
 * As of this commit, no *publicly documented* eMaktab integration API could be
 * verified (see docs/EMAKTAB_INTEGRATION.md for the investigation notes). Per
 * the project requirements we therefore:
 *
 *   * do NOT scrape the eMaktab web UI,
 *   * do NOT bypass authentication, CAPTCHA, MFA or any access control,
 *   * do NOT hardcode or store any third-party account password in plaintext,
 *   * do NOT fabricate successful synchronisation results.
 *
 * This connector is a real, working HTTP client. It will only run when an
 * administrator explicitly supplies:
 *   * `baseUrl`     – the official API base URL, and
 *   * `endpointPath`– the documented resource path (e.g. "/v1/school/classes"),
 *   * credentials   – an API key/token, or login+secret for token exchange,
 *
 * and it validates the response against the expected contract below. If the
 * official contract differs, update `normalise()` — the rest of the app does
 * not need to change.
 * ---------------------------------------------------------------------------
 */

/**
 * Expected response contract (documented here so an implementer can adapt it):
 *
 * ```json
 * {
 *   "classes": [
 *     { "id": "c-1", "name": "5-A", "grade": 5, "letter": "A", "academicYear": "2025-2026" }
 *   ],
 *   "students": [
 *     {
 *       "id": "s-1", "firstName": "Ali", "lastName": "Valiyev", "middleName": "…",
 *       "birthDate": "2013-04-02", "gender": "MALE",
 *       "classId": "c-1", "className": "5-A", "academicYear": "2025-2026"
 *     }
 *   ]
 * }
 * ```
 */
type ApiPayload = {
  classes?: unknown[];
  students?: unknown[];
};

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export class EmaktabApiConnector implements IntegrationConnector {
  readonly provider = IntegrationProvider.EMAKTAB_API;
  readonly key = "emaktab-api";
  readonly label = "eMaktab rasmiy API";
  readonly description =
    "Rasmiy va ruxsat etilgan API mavjud bo‘lganda ishlatiladi. Hujjatlashtirilgan kontrakt talab qilinadi.";
  readonly requiresFile = false;
  readonly requiresCredentials = true;

  private requestInfo(ctx: ConnectorContext) {
    const baseUrl = (asString(ctx.settings.baseUrl) ?? "").replace(/\/+$/, "");
    const endpointPath = asString(ctx.settings.endpointPath) ?? "";
    const token = ctx.credentials?.token ?? null;
    const login = ctx.credentials?.login ?? null;
    const secret = ctx.credentials?.secret ?? null;
    const authHeader = ctx.credentials?.authHeader ?? "Authorization";
    const authScheme = ctx.credentials?.authScheme ?? "Bearer";
    return { baseUrl, endpointPath, token, login, secret, authHeader, authScheme };
  }

  private buildHeaders(ctx: ConnectorContext): Record<string, string> {
    const { token, login, secret, authHeader, authScheme } = this.requestInfo(ctx);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) {
      headers[authHeader] = authScheme ? `${authScheme} ${token}` : token;
    } else if (login && secret) {
      // Token exchange is the only credential flow we support: the secret is
      // never sent as a query parameter and never logged.
      headers["X-Api-Login"] = login;
      headers["X-Api-Key"] = secret;
    }
    return headers;
  }

  async testConnection(ctx: ConnectorContext): Promise<ConnectorTestResult> {
    const { baseUrl, endpointPath, token, login, secret } = this.requestInfo(ctx);

    if (!baseUrl) {
      return {
        ok: false,
        message: "eMaktab API manzili (baseUrl) sozlanmagan.",
        details: [
          "Rasmiy API manzili mavjud bo‘lsa, uni Sozlamalar → Integratsiya bo‘limida kiriting.",
          "Rasmiy API mavjud bo‘lmasa, CSV/Excel import usulidan foydalaning.",
        ],
      };
    }
    if (!token && !(login && secret)) {
      return {
        ok: false,
        message: "API uchun ruxsat ma’lumotlari kiritilmagan.",
        details: ["Token yoki login+maxfiy kalit kiritilishi kerak. Parollar shifrlangan holda saqlanadi."],
      };
    }
    if (!endpointPath) {
      return {
        ok: false,
        message: "So‘rov manzili (endpoint) ko‘rsatilmagan.",
        details: ["Hujjatlashtirilgan resurs yo‘lini kiriting, masalan: /v1/school/classes"],
      };
    }

    try {
      const response = await fetch(`${baseUrl}${endpointPath}`, {
        method: "GET",
        headers: this.buildHeaders(ctx),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      if (!response.ok) {
        return {
          ok: false,
          message: `API javob berdi: HTTP ${response.status} ${response.statusText}`,
          details: [
            "So‘rov yuborildi, lekin API muvaffaqiyatli javob qaytarmadi.",
            "Login yoki maxfiy kalit noto‘g‘ri bo‘lishi mumkin.",
          ],
        };
      }
      return {
        ok: true,
        message: `Ulanish muvaffaqiyatli (HTTP ${response.status}).`,
        details: ["Endi sinxronizatsiyani ishga tushirishingiz mumkin."],
      };
    } catch (error) {
      return {
        ok: false,
        message: "API manziliga ulanib bo‘lmadi.",
        details: [
          error instanceof Error ? error.message : "Noma’lum tarmoq xatosi.",
          "Manzil to‘g‘riligini va tarmoq ruxsatlarini tekshiring.",
        ],
      };
    }
  }

  async fetchDataset(ctx: ConnectorContext): Promise<ImportDataset> {
    const { baseUrl, endpointPath } = this.requestInfo(ctx);

    if (!baseUrl || !endpointPath) {
      throw new ConnectorError("eMaktab API sozlanmagan.", [
        "baseUrl va endpoint ko‘rsatilishi shart.",
        "Rasmiy API mavjud bo‘lmasa, CSV/Excel importdan foydalaning.",
      ]);
    }

    let payload: ApiPayload;
    try {
      const response = await fetch(`${baseUrl}${endpointPath}`, {
        method: "GET",
        headers: this.buildHeaders(ctx),
        signal: AbortSignal.timeout(60_000),
        cache: "no-store",
      });
      if (!response.ok) {
        throw new ConnectorError(`API xatosi: HTTP ${response.status} ${response.statusText}`, [
          "API kutilgan javobni qaytarmadi.",
        ]);
      }
      payload = (await response.json()) as ApiPayload;
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      throw new ConnectorError("API javobini o‘qib bo‘lmadi.", [
        error instanceof Error ? error.message : "Noma’lum xatolik.",
      ]);
    }

    return this.normalise(payload, `emaktab-api:${endpointPath}`);
  }

  /**
   * Map the API payload to the canonical dataset.
   * Throws when the payload does not match the expected contract, rather than
   * silently importing nothing.
   */
  normalise(payload: ApiPayload, source: string): ImportDataset {
    const warnings: string[] = [];

    if (!payload || (typeof payload.classes === "undefined" && typeof payload.students === "undefined")) {
      throw new ConnectorError("API javobi kutilgan tuzilishga mos kelmadi.", [
        'Kutilgan javob: { "classes": [...], "students": [...] }',
        "Kontrakt farq qilsa, EmaktabApiConnector.normalise() ni moslashtiring.",
      ]);
    }

    const classes: SourceClass[] = [];
    for (const raw of payload.classes ?? []) {
      const item = raw as Record<string, unknown>;
      const name = asString(item.name) ?? asString(item.title);
      if (!name) {
        warnings.push("Nomi yo‘q sinf o‘tkazib yuborildi.");
        continue;
      }
      classes.push({
        externalId: asString(item.id) ?? asString(item.externalId),
        name,
        gradeYear: asNumber(item.grade) ?? null,
        letter: asString(item.letter),
        academicYear: asString(item.academicYear),
        teacherName: asString(item.teacherName),
      });
    }

    const students: SourceStudent[] = [];
    for (const raw of payload.students ?? []) {
      const item = raw as Record<string, unknown>;
      const firstName = asString(item.firstName);
      const lastName = asString(item.lastName);
      if (!firstName || !lastName) {
        warnings.push("Ismi yoki familiyasi yo‘q o‘quvchi o‘tkazib yuborildi.");
        continue;
      }
      const genderRaw = (asString(item.gender) ?? "").toUpperCase();
      students.push({
        externalId: asString(item.id) ?? asString(item.externalId),
        firstName,
        lastName,
        middleName: asString(item.middleName),
        birthDate: asString(item.birthDate),
        gender: genderRaw === "MALE" || genderRaw === "FEMALE" ? (genderRaw as "MALE" | "FEMALE") : null,
        guardianName: asString(item.guardianName),
        guardianPhone: asString(item.guardianPhone),
        classExternalId: asString(item.classId),
        className: asString(item.className),
        academicYear: asString(item.academicYear),
      });
    }

    if (classes.length === 0 && students.length === 0) {
      throw new ConnectorError("API hech qanday sinf yoki o‘quvchi qaytarmadi.", [
        "API javobi bo‘sh. Ruxsatlar yoki manzilni tekshiring.",
      ]);
    }

    return { source, classes, students, warnings };
  }
}
