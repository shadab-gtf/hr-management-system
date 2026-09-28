import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AppIcon } from "@/components/ui/app-icon";

export function ErrorState({ reset }: { reset: () => void }) {
  return (
    <section className="error-state" role="alert">
      <AppIcon name="info" size={24} />
      <h1>This view couldn’t load</h1>
      <p>Your information hasn’t changed. Try loading the view again.</p>
      <Button onClick={reset}>Try again</Button>
      <Link href="/">Return to foundation</Link>
    </section>
  );
}
