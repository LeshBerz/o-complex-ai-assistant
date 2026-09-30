/**
 * Минимальный клиент amoCRM API v4 на fetch. Зона amocrm-integrator.
 *
 * live: https://{AMOCRM_SUBDOMAIN}.amocrm.ru, заголовок `Authorization: Bearer {AMOCRM_ACCESS_TOKEN}`
 *       (долгосрочный токен приватной интеграции).
 * mock: читает ответы API из data/amocrm-mock/api/, addNote пишет в logs/amocrm-notes.jsonl и консоль.
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { getAmoConfig, LOGS_DIR, MOCK_DIR, type AmoConfig } from "./config";
import {
  ContactSchema,
  LeadSchema,
  NotesPageSchema,
  PipelineStatusSchema,
  TalkSchema,
  type AddNoteResult,
  type Contact,
  type Lead,
  type NewNote,
  type Note,
  type PipelineStatus,
  type Talk,
} from "./types";

export interface AmoClient {
  getLead(id: number): Promise<Lead>;
  getContact(id: number): Promise<Contact>;
  /** Последние примечания сделки (до 50), от старых к новым */
  getLeadNotes(leadId: number): Promise<Note[]>;
  getTalk(id: number): Promise<Talk>;
  getPipelineStatus(pipelineId: number, statusId: number): Promise<PipelineStatus>;
  addNote(leadId: number, note: NewNote): Promise<AddNoteResult>;
}

export class AmoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AmoApiError";
  }
}

// ---------- live ----------

/** Лимит amoCRM: 7 запросов/с на интеграцию; при превышении — 429 (api/recommendations) */
const RETRY_DELAYS_MS = [1000, 3000];

class LiveAmoClient implements AmoClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async request(
    method: "GET" | "POST",
    pathname: string,
    body?: unknown,
  ): Promise<unknown | null> {
    const url = new URL(pathname, this.baseUrl);
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(body !== undefined && { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });

      if (res.status === 429 && attempt < RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        continue;
      }
      if (res.status === 204) return null;
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 500);
        throw new AmoApiError(`amoCRM ${method} ${url.pathname} → ${res.status}: ${detail}`, res.status);
      }
      return res.json();
    }
  }

  private async get<T>(schema: z.ZodType<T>, pathname: string): Promise<T> {
    const data = await this.request("GET", pathname);
    if (data === null) throw new AmoApiError(`amoCRM GET ${pathname} → 204 (пусто)`, 204);
    return schema.parse(data);
  }

  getLead(id: number) {
    return this.get(LeadSchema, `/api/v4/leads/${id}?with=contacts`);
  }

  getContact(id: number) {
    return this.get(ContactSchema, `/api/v4/contacts/${id}`);
  }

  async getLeadNotes(leadId: number) {
    const data = await this.request(
      "GET",
      `/api/v4/leads/${leadId}/notes?limit=50&order[id]=desc`,
    );
    if (data === null) return [];
    return NotesPageSchema.parse(data)._embedded.notes.reverse();
  }

  getTalk(id: number) {
    return this.get(TalkSchema, `/api/v4/talks/${id}`);
  }

  getPipelineStatus(pipelineId: number, statusId: number) {
    return this.get(
      PipelineStatusSchema,
      `/api/v4/leads/pipelines/${pipelineId}/statuses/${statusId}`,
    );
  }

  async addNote(leadId: number, note: NewNote): Promise<AddNoteResult> {
    const data = (await this.request("POST", `/api/v4/leads/${leadId}/notes`, [note])) as {
      _embedded?: { notes?: { id?: number }[] };
    } | null;
    return { id: data?._embedded?.notes?.[0]?.id ?? null, mode: "live" };
  }
}

// ---------- mock ----------

async function readFixture<T>(schema: z.ZodType<T>, ...segments: string[]): Promise<T> {
  const file = path.join(MOCK_DIR, "api", ...segments);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new AmoApiError(`mock: нет фикстуры ${path.relative(process.cwd(), file)}`, 404);
  }
  return schema.parse(JSON.parse(raw));
}

export const MOCK_NOTES_LOG = path.join(LOGS_DIR, "amocrm-notes.jsonl");

class MockAmoClient implements AmoClient {
  getLead(id: number) {
    return readFixture(LeadSchema, "leads", `${id}.json`);
  }

  getContact(id: number) {
    return readFixture(ContactSchema, "contacts", `${id}.json`);
  }

  async getLeadNotes(leadId: number) {
    try {
      const page = await readFixture(NotesPageSchema, "leads", String(leadId), "notes.json");
      return page._embedded.notes;
    } catch (err) {
      if (err instanceof AmoApiError && err.status === 404) return []; // как 204 в live
      throw err;
    }
  }

  getTalk(id: number) {
    return readFixture(TalkSchema, "talks", `${id}.json`);
  }

  getPipelineStatus(pipelineId: number, statusId: number) {
    return readFixture(
      PipelineStatusSchema,
      "pipelines",
      String(pipelineId),
      "statuses",
      `${statusId}.json`,
    );
  }

  async addNote(leadId: number, note: NewNote): Promise<AddNoteResult> {
    const entry = { ts: new Date().toISOString(), lead_id: leadId, ...note };
    await mkdir(LOGS_DIR, { recursive: true });
    await appendFile(MOCK_NOTES_LOG, JSON.stringify(entry) + "\n", "utf8");
    console.log(`[amocrm:mock] примечание в сделку ${leadId}:\n${note.params.text}`);
    return { id: null, mode: "mock" };
  }
}

export function createAmoClient(config: AmoConfig = getAmoConfig()): AmoClient {
  if (config.mode === "mock") return new MockAmoClient();
  if (!config.baseUrl || !config.accessToken) {
    throw new Error("AMOCRM_MODE=live требует AMOCRM_SUBDOMAIN и AMOCRM_ACCESS_TOKEN");
  }
  return new LiveAmoClient(config.baseUrl, config.accessToken);
}
