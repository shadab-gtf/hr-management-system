import Image from "next/image";
import { AppIcon } from "@/components/ui/app-icon";
import { Alert } from "@/components/ui/display";
import { signInAction } from "@/lib/actions/session";
import { initialsOf } from "@/lib/utils/format";
import { Avatar } from "@/components/ui/avatar";
import type { PersonaOption } from "@/types/session";

export function LoginSection({
  personas,
  next,
  signedOut,
  invalid,
}: {
  personas: PersonaOption[];
  next: string | undefined;
  signedOut: boolean;
  invalid: boolean;
}) {
  const demo = personas.length > 0;
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <Image src="/brand/gtf-logo.png" alt="GTF Technologies" width={500} height={277} sizes="120px" className="auth-logo" priority />
          <h1>Sign in to GTF HR</h1>
          <p className="muted">Attendance, leave, pay and requests — in one place.</p>
        </div>

        {signedOut && (
          <Alert tone="success" live>
            You’ve been signed out.
          </Alert>
        )}
        {invalid && (
          <Alert tone="danger" live>
            Choose a profile to continue.
          </Alert>
        )}

        <form action={signInAction} className="form">
          {next && <input type="hidden" name="next" value={next} />}
          {demo ? (
            <fieldset className="persona-list">
              <legend>Choose a demo profile</legend>
              {personas.map((persona, index) => (
                <label key={persona.id} className="persona-option">
                  <input type="radio" name="persona" value={persona.id} defaultChecked={index === 0} />
                  <Avatar initials={initialsOf(persona.name)} seed={persona.id} />
                  <span className="persona-text">
                    <strong>{persona.title}</strong>
                    <span>
                      {persona.name} · {persona.summary}
                    </span>
                  </span>
                  <AppIcon name="check" className="persona-check" />
                </label>
              ))}
            </fieldset>
          ) : null}
          <button type="submit" className="button button--primary auth-submit">
            <AppIcon name="login" size={20} />
            {demo ? "Continue" : "Continue with GTF single sign-on"}
          </button>
        </form>

        <p className="auth-foot">
          <AppIcon name="shield" size={16} />
          {demo
            ? "Demo mode: all people and records are synthetic. Nothing is sent to a live HR system."
            : "Protected by GTF single sign-on and multi-factor authentication."}
        </p>
      </div>
    </main>
  );
}
