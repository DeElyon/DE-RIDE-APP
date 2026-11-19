import { headers } from "next/headers";
import { redirect } from "next/navigation";
import DerideApp from "@/Frontend/deride-app";
import { auth } from "@/lib/auth";

export default async function AppPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");
  return <DerideApp displayName={session.user.name} />;
}
