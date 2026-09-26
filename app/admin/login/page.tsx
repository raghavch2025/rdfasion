import { LoginForm } from "@/components/admin/LoginForm";

export const metadata = { title: "Admin login · RD Fashion", robots: { index: false } };

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm px-4 pt-16">
      <h1 className="mb-6 text-2xl font-extrabold">
        RD <span className="text-accent">Fashion</span> Admin
      </h1>
      <LoginForm />
    </main>
  );
}
