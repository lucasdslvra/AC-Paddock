import { Suspense } from "react";
import { fetchGuildWidgetName } from "@/lib/discord";
import { LoginView } from "./LoginView";

export default async function Home() {
  const guildName = await fetchGuildWidgetName();

  return (
    <Suspense fallback={null}>
      <LoginView guildName={guildName} />
    </Suspense>
  );
}
