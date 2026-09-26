"use client";
import { useState, useTransition } from "react";
import { updateOrder } from "@/app/admin/actions";
import { Button, Field, inputClass } from "@/components/ui/Button";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";
import { admin as s } from "@/strings";

type Initial = {
  status: OrderStatus;
  final_amount: number | null;
  advance_amount: number | null;
  note: string | null;
  transport_name: string | null;
  lr_number: string | null;
  cancel_reason: string | null;
};

export function OrderForm({ code, initial }: { code: string; initial: Initial }) {
  const [status, setStatus] = useState<OrderStatus>(initial.status);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      action={(fd) =>
        start(async () => {
          const res = await updateOrder(code, fd);
          setMsg(res.ok ? s.saved : res.error);
        })
      }
      className="space-y-3 rounded-lg border border-line p-3"
    >
      <fieldset>
        <legend className="mb-1 font-semibold">{s.status}</legend>
        <div className="grid grid-cols-2 gap-2">
          {ORDER_STATUSES.map((st) => (
            <label
              key={st}
              className={`flex min-h-11 items-center justify-center rounded-lg border font-semibold ${
                status === st ? "border-ink bg-ink text-white" : "border-line"
              }`}
            >
              <input type="radio" name="status" value={st} checked={status === st} onChange={() => setStatus(st)} className="sr-only" />
              {s.statuses[st]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <Field label={s.finalAmount}>
          <input name="final_amount" defaultValue={initial.final_amount ?? ""} inputMode="numeric" className={inputClass} />
        </Field>
        <Field label={s.advanceAmount}>
          <input name="advance_amount" defaultValue={initial.advance_amount ?? ""} inputMode="numeric" className={inputClass} />
        </Field>
      </div>
      <Field label={s.note}>
        <textarea name="note" defaultValue={initial.note ?? ""} rows={2} className={`${inputClass} py-2`} />
      </Field>
      {status === "dispatched" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={s.transport}>
            <input name="transport_name" defaultValue={initial.transport_name ?? ""} className={inputClass} />
          </Field>
          <Field label={s.lr}>
            <input name="lr_number" defaultValue={initial.lr_number ?? ""} className={inputClass} />
          </Field>
        </div>
      )}
      {status !== "dispatched" && (
        <>
          <input type="hidden" name="transport_name" value={initial.transport_name ?? ""} />
          <input type="hidden" name="lr_number" value={initial.lr_number ?? ""} />
        </>
      )}
      {status === "cancelled" && (
        <Field label={s.cancelReason}>
          <select name="cancel_reason" defaultValue={initial.cancel_reason ?? s.cancelReasons[0]} className={inputClass}>
            {s.cancelReasons.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {s.save}
      </Button>
      {msg && <p className="text-center text-sm font-semibold">{msg}</p>}
    </form>
  );
}
