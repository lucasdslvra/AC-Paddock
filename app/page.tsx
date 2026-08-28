import { Suspense } from "react";
import { LoginView } from "./LoginView";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <LoginView />
    </Suspense>
  );
}
