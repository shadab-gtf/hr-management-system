import Image from "next/image";
import { AppIcon } from "@/components/ui/app-icon";
import { Alert } from "@/components/ui/display";
import { signInAction } from "@/lib/actions/session";
import { initialsOf } from "@/lib/utils/format";
import { Avatar } from "@/components/ui/avatar";
import type { PersonaOption } from "@/types/session";

const loginErrors: Record<string, string> = {
  credentials: "That email and password don’t match an active account.",
  rate: "Too many attempts. Wait a minute and try again.",
  account: "This sign-in isn’t linked to an active employee. Contact HR.",
  persona: "Choose one of the demo profiles to continue.",
};

export function LoginSection({
  personas,
  next,
  signedOut,
  invalid,
  passwordLogin = false,
  error,
}: {
  /** Demo profiles (mock mode only); ids are the mock persona keys, including the super admin. */
  personas: (Omit<PersonaOption, "id"> & { id: string })[];
  next: string | undefined;
  signedOut: boolean;
  invalid: boolean;
  passwordLogin?: boolean;
  error?: string;
}) {
  const demo = personas.length > 0;
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-brand">
          <Image
            src="/brand/gtf-logo.png"
            alt="GTF Technologies"
            width={500}
            height={277}
            sizes="120px"
            className="auth-logo"
            priority
          />
          <h1>Sign in to GTF HR</h1>
          <p className="muted">
            Attendance, leave, pay and requests — in one place.
          </p>
        </div>

        {signedOut && (
          <Alert tone="success" live>
            You’ve been signed out.
          </Alert>
        )}
        {passwordLogin && error && error !== "persona" && (
          <Alert tone="danger" live>
            {loginErrors[error] ?? loginErrors.credentials}
          </Alert>
        )}
        {invalid && (
          <Alert tone="danger" live>
            Choose a profile to continue.
          </Alert>
        )}

        <form action={signInAction} className="form">
          {next && <input type="hidden" name="next" value={next} />}
          {passwordLogin ? (
            <>
              <div className="form-field">
                <label htmlFor="login-email">Work email</label>
                <input
                  id="login-email"
                  className="input"
                  name="email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  className="input"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  minLength={8}
                  required
                />
              </div>
            </>
          ) : demo ? (
            <fieldset className="persona-list">
              <legend>Choose a demo profile</legend>
              {personas.map((persona, index) => (
                <label key={persona.id} className="persona-option">
                  <input
                    type="radio"
                    name="persona"
                    value={persona.id}
                    defaultChecked={index === 0}
                  />
                  <Avatar
                    initials={initialsOf(persona.name)}
                    seed={persona.id}
                  />
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
            {passwordLogin
              ? "Sign in"
              : demo
                ? "Continue"
                : "Continue with GTF single sign-on"}
          </button>
        </form>

        <p className="auth-foot">
          <AppIcon name="shield" size={16} />
          {passwordLogin
            ? "Signed-in sessions are stored in secure, httpOnly cookies. Access follows your HR role."
            : demo
              ? "Demo mode: all people and records are synthetic. Nothing is sent to a live HR system."
              : "Protected by GTF single sign-on and multi-factor authentication."}
        </p>
      </div>
    </main>
  );
}
