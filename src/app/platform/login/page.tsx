import { notFound } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { currentHost } from "@/lib/school";

export default async function PlatformLogin() {
  if ((await currentHost()).area !== "admin") notFound();
  return <LoginForm title="Platform admin" subtitle="Manage schools on the platform" redirectTo="/tenants" />;
}
