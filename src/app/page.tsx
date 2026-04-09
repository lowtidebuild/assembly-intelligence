import { redirect } from "next/navigation";

/**
 * Root page → always redirects to briefing bot (the daily driver).
 *
 * Future: middleware will check industry profile state and redirect
 * new users to /setup instead.
 */
export default function HomePage() {
  redirect("/briefing");
}
