import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost" | "danger";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-white active:bg-accent-dark",
  outline: "border border-ink bg-white text-ink active:bg-soft",
  ghost: "bg-soft text-ink active:bg-line",
  danger: "border border-accent bg-white text-accent",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className = "",
  href,
  children,
  external,
  ...rest
}: { variant?: Variant; className?: string; href: string; children: ReactNode; external?: boolean } & Omit<
  ComponentProps<"a">,
  "href"
>) {
  const cls = `${base} ${variants[variant]} ${className}`;
  if (external || /^(tel:|https?:)/.test(href)) {
    return (
      <a href={href} className={cls} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block">
        <span className="mb-1 block font-semibold">{label}</span>
        {children}
      </label>
      {hint && !error && <p className="mt-1 text-sm text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-sm font-semibold text-accent">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "block min-h-11 w-full rounded-lg border border-line bg-white px-3 text-base text-ink placeholder:text-muted focus:border-ink focus:outline-none";
