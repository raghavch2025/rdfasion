"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { checkAdminPhone } from "@/app/admin/actions";
import { browserDb } from "@/lib/supabase/browser";
import { isValidPhone, normalizePhone } from "@/lib/format";
import { Button, Field, inputClass } from "@/components/ui/Button";
import { admin as s } from "@/strings";

// Phone OTP via Supabase Auth, only for numbers on the admin list.
export function LoginForm() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const p = normalizePhone(phone);
    if (!isValidPhone(p)) return setError("10 digit number");
    setBusy(true);
    const { ok } = await checkAdminPhone(p);
    if (!ok) {
      setBusy(false);
      return setError(s.notAllowed);
    }
    const { error } = await browserDb().auth.signInWithOtp({ phone: `+91${p}` });
    setBusy(false);
    if (error) return setError(error.message);
    setSent(true);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await browserDb().auth.verifyOtp({ phone: `+91${normalizePhone(phone)}`, token: otp.trim(), type: "sms" });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace("/admin");
    router.refresh();
  }

  return sent ? (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-muted">{s.otpSent(normalizePhone(phone))}</p>
      <Field label={s.otp} error={error}>
        <input
          className={inputClass}
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          autoFocus
        />
      </Field>
      <Button type="submit" disabled={busy} className="w-full">
        {s.verify}
      </Button>
      <button type="button" className="min-h-11 text-sm underline" onClick={() => setSent(false)}>
        {s.phone}
      </button>
    </form>
  ) : (
    <form onSubmit={send} className="space-y-4">
      <Field label={s.phone} error={error}>
        <input
          className={inputClass}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={14}
          autoFocus
        />
      </Field>
      <Button type="submit" disabled={busy} className="w-full">
        {s.sendOtp}
      </Button>
    </form>
  );
}
