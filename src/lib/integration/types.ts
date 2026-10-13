import type { IntegrationProvider } from "@prisma/client";

/**
 * ---------------------------------------------------------------------------
 * Integration architecture
 * ---------------------------------------------------------------------------
 * The application never talks to a data source directly. Instead it depends on
 * the {@link IntegrationConnector} interface. Adding a supported connector
 * later (for example an officially documented eMaktab API) means implementing
 * this interface and registering it in `registry.ts` — no other code changes.
 *
 * The canonical intermediate representation is {@link ImportDataset}. Every
 * connector must normalise its source data into it.
 * ---------------------------------------------------------------------------
 */

export type SourceClass = {
  externalId?: string | null;
  /** Human name as it appears in the source, e.g. "5-A" or "5 A". */
  name: string;
  gradeYear?: number | null;
  letter?: string | null;
  academicYear?: string | null;
  teacherName?: string | null;
};

export type SourceStudent = {
  externalId?: string | null;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  /** ISO date `YYYY-MM-DD`. */
  birthDate?: string | null;
  gender?: "MALE" | "FEMALE" | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  /** Preferred link to a class: the external class identifier. */
  classExternalId?: string | null;
  /** Fallback link by class name when no external id is available. */
  className?: string | null;
  academicYear?: string | null;
};

export type ImportDataset = {
  /** Human readable origin, stored on the SyncLog (e.g. "csv:oquvchilar.csv"). */
  source: string;
  classes: SourceClass[];
  students: SourceStudent[];
  /** Non-fatal issues discovered while reading the source. */
  warnings: string[];
};

export type ConnectorTestResult =
  | { ok: true; message: string; details?: string[] }
  | { ok: false; message: string; details?: string[] };

export type ConnectorContext = {
  schoolId: string;
  settings: Record<string, unknown>;
  /** Decrypted credentials, or null when none are stored. */
  credentials: Record<string, string> | null;
  /** Present for file-based connectors. */
  file?: { buffer: Buffer; filename: string };
};

export interface IntegrationConnector {
  readonly provider: IntegrationProvider;
  readonly key: string;
  readonly label: string;
  readonly description: string;
  /** Whether this connector requires an uploaded file to run. */
  readonly requiresFile: boolean;
  /** Whether this connector needs stored credentials to run. */
  readonly requiresCredentials: boolean;
  testConnection(ctx: ConnectorContext): Promise<ConnectorTestResult>;
  fetchDataset(ctx: ConnectorContext): Promise<ImportDataset>;
}

export class ConnectorError extends Error {
  readonly details: string[];
  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = "ConnectorError";
    this.details = details;
  }
}
