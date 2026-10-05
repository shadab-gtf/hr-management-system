import { redirect } from "next/navigation";

/** Friendly alias: /auth/reset → forgot password. */
export default function ResetPage() {
  redirect("/auth/forgot-password");
}
