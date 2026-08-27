import { ModDetailView } from "./ModDetailView";

export default async function ModDetailPage(props: PageProps<"/mods/[id]">) {
  const { id } = await props.params;
  return <ModDetailView id={id} />;
}
