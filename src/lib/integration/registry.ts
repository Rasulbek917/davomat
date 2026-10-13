import { IntegrationProvider } from "@prisma/client";
import { CsvExcelConnector } from "@/lib/integration/connectors/csv-excel";
import { EmaktabApiConnector } from "@/lib/integration/connectors/emaktab-api";
import type { IntegrationConnector } from "@/lib/integration/types";

/**
 * Connector registry.
 *
 * The rest of the application only ever asks for a connector through this
 * module. Adding a new data source therefore means writing one connector and
 * registering it here — no changes to the engine, UI or server actions.
 */
const CONNECTORS: IntegrationConnector[] = [new CsvExcelConnector(), new EmaktabApiConnector()];

const byProvider = new Map<IntegrationProvider, IntegrationConnector>(
  CONNECTORS.map((c) => [c.provider, c]),
);

const byKey = new Map<string, IntegrationConnector>(CONNECTORS.map((c) => [c.key, c]));

export function listConnectors(): IntegrationConnector[] {
  return CONNECTORS;
}

export function getConnector(provider: IntegrationProvider): IntegrationConnector | null {
  return byProvider.get(provider) ?? null;
}

export function getConnectorByKey(key: string): IntegrationConnector | null {
  return byKey.get(key) ?? null;
}

/** Same as {@link getConnector} but throws when a provider has no connector. */
export function requireConnector(provider: IntegrationProvider): IntegrationConnector {
  const connector = getConnector(provider);
  if (!connector) {
    throw new Error(`Integratsiya provayderi uchun konnektor topilmadi: ${provider}`);
  }
  return connector;
}

export const PROVIDER_META: Record<IntegrationProvider, { label: string; description: string; requiresFile: boolean }> = {
  [IntegrationProvider.CSV_EXCEL]: {
    label: "CSV / Excel import",
    description:
      "eMaktab yoki boshqa tizimdan rasmiy ruxsat bilan yuklangan CSV/XLSX faylini import qiladi. Hozircha eng ishonchli usul.",
    requiresFile: true,
  },
  [IntegrationProvider.EMAKTAB_API]: {
    label: "eMaktab rasmiy API",
    description:
      "Rasmiy va hujjatlashtirilgan API mavjud bo‘lgandagina ishlaydi. Manzil va ruxsat ma’lumotlari kiritilishi shart.",
    requiresFile: false,
  },
};
