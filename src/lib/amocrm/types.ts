/**
 * Схемы ответов amoCRM API v4 — только поля, которые мы используем.
 * Сверено с https://www.amocrm.ru/developers/content/crm_platform/ (leads-api, contacts-api,
 * events-and-notes, talks-api, leads_pipelines). Лишние поля пропускаются (looseObject).
 */
import { z } from "zod";

const CustomFieldValueSchema = z.looseObject({
  field_id: z.number(),
  field_name: z.string().nullish(),
  field_code: z.string().nullish(),
  field_type: z.string().nullish(),
  values: z.array(z.looseObject({ value: z.unknown() })),
});
export type CustomFieldValue = z.infer<typeof CustomFieldValueSchema>;

/** GET /api/v4/leads/{id}?with=contacts */
export const LeadSchema = z.looseObject({
  id: z.number(),
  name: z.string().nullish(),
  price: z.number().nullish(),
  status_id: z.number(),
  pipeline_id: z.number(),
  custom_fields_values: z.array(CustomFieldValueSchema).nullish(),
  _embedded: z
    .looseObject({
      contacts: z
        .array(z.looseObject({ id: z.number(), is_main: z.boolean().optional() }))
        .optional(),
    })
    .optional(),
});
export type Lead = z.infer<typeof LeadSchema>;

/** GET /api/v4/contacts/{id} */
export const ContactSchema = z.looseObject({
  id: z.number(),
  name: z.string().nullish(),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  custom_fields_values: z.array(CustomFieldValueSchema).nullish(),
});
export type Contact = z.infer<typeof ContactSchema>;

export const NoteSchema = z.looseObject({
  id: z.number(),
  entity_id: z.number(),
  created_at: z.number(),
  note_type: z.string(),
  params: z.looseObject({ text: z.string().optional() }).nullish(),
});
export type Note = z.infer<typeof NoteSchema>;

/** GET /api/v4/leads/{id}/notes (при пустом списке amoCRM отвечает 204 без тела) */
export const NotesPageSchema = z.looseObject({
  _embedded: z.looseObject({ notes: z.array(NoteSchema) }),
});

/** GET /api/v4/talks/{id} */
export const TalkSchema = z.looseObject({
  talk_id: z.number(),
  contact_id: z.number().nullish(),
  entity_id: z.number().nullish(),
  entity_type: z.string().nullish(),
});
export type Talk = z.infer<typeof TalkSchema>;

/** GET /api/v4/leads/pipelines/{pipeline_id}/statuses/{id} */
export const PipelineStatusSchema = z.looseObject({
  id: z.number(),
  name: z.string(),
  pipeline_id: z.number(),
});
export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;

/** POST /api/v4/leads/{id}/notes — тело: массив примечаний */
export interface NewNote {
  note_type: "common";
  params: { text: string };
}

/** Что вернул addNote: id созданного примечания (в mock — null) */
export interface AddNoteResult {
  id: number | null;
  mode: "mock" | "live";
}
