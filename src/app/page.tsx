import { AssistantDemo } from "@/components/assistant-demo";

// ?tour=1 — экскурсия запускается сразу (удобно для записи видео)
export default async function Home({ searchParams }: PageProps<"/">) {
  const { tour } = await searchParams;
  return <AssistantDemo autoStartTour={tour === "1"} />;
}
