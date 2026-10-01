import { AssistantDemo } from "@/components/assistant-demo";
import { buildKbSummary } from "@/components/kb/kb-summary";

// ?tour=1 — экскурсия запускается сразу (удобно для записи видео)
export default async function Home({ searchParams }: PageProps<"/">) {
  const { tour } = await searchParams;
  return <AssistantDemo kb={buildKbSummary()} autoStartTour={tour === "1"} />;
}
