import RunView from "./RunView";

export const dynamic = "force-dynamic";

export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  return (
    <RunView
      runId={id}
      autostart={sp.autostart === "1"}
      vertical={sp.vertical ?? ""}
      region={sp.region ?? "US"}
    />
  );
}
