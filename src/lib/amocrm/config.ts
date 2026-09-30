/**
 * Настройки интеграции с amoCRM из env. Зона amocrm-integrator.
 */
import path from "node:path";

export type AmoMode = "mock" | "live";

export interface AmoConfig {
  mode: AmoMode;
  /** https://{subdomain}.amocrm.ru — только для live */
  baseUrl: string | null;
  accessToken: string | null;
  webhookSecret: string | null;
  /** id доп. поля контакта со списком купленных товаров (id из data/kb/products.json) */
  purchasesFieldId: number | null;
}

export function getAmoConfig(): AmoConfig {
  const mode: AmoMode = process.env.AMOCRM_MODE === "live" ? "live" : "mock";
  const subdomain = process.env.AMOCRM_SUBDOMAIN?.trim() || null;
  const fieldId = Number(process.env.AMOCRM_PURCHASES_FIELD_ID);

  return {
    mode,
    baseUrl: subdomain ? `https://${subdomain}.amocrm.ru` : null,
    accessToken: process.env.AMOCRM_ACCESS_TOKEN?.trim() || null,
    webhookSecret: process.env.AMOCRM_WEBHOOK_SECRET?.trim() || null,
    // В mock-фикстуре контакта это поле 700001
    purchasesFieldId:
      Number.isInteger(fieldId) && fieldId > 0 ? fieldId : mode === "mock" ? 700001 : null,
  };
}

export const MOCK_DIR = path.join(process.cwd(), "data", "amocrm-mock");
export const LOGS_DIR = path.join(process.cwd(), "logs");
