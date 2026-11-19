import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AuthForm from "@/Frontend/auth-form";
import { auth } from "@/lib/auth";

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) redirect("/app");
  return <AuthForm mode="sign-in" />;
}
