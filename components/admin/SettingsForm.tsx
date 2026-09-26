"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSetting } from "@/app/admin/actions";
import { browserDb } from "@/lib/supabase/browser";
import { Button, Field, inputClass } from "@/components/ui/Button";
import { CATEGORIES, type PaletteColour, type PublicSettings } from "@/lib/types";
import { admin as s } from "@/strings";
import { resizeImage } from "./resize";

type Props = {
  isOwner: boolean;
  shop: PublicSettings;
  palette: PaletteColour[];
  sizeSets: Record<string, string[]>;
  adminPhones: string[];
  ownerPhones: string[];
  baseModels: string[];
  catalogBase: string;
};

export function SettingsForm(props: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [shop, setShop] = useState(props.shop);
  const [palette, setPalette] = useState(props.palette);
  const [sizeSets, setSizeSets] = useState(
    Object.fromEntries(CATEGORIES.map((c) => [c, (props.sizeSets[c] ?? ["M", "L", "XL", "XXL"]).join(", ")])),
  );
  const [admins, setAdmins] = useState(props.adminPhones.join(", "));
  const [owners, setOwners] = useState(props.ownerPhones.join(", "));

  const save = (key: string, value: unknown) =>
    start(async () => {
      const res = await saveSetting(key, value);
      setMsg(res.ok ? `${key}: ${s.saved}` : res.error);
      router.refresh();
    });

  async function uploadModel(file: File | undefined) {
    if (!file) return;
    const blob = await resizeImage(file, 1600, 0.9);
    const path = `models/base-${Date.now().toString(36)}.jpg`;
    const { error } = await browserDb().storage.from("catalog").upload(path, blob, { contentType: "image/jpeg" });
    if (error) return setMsg(error.message);
    save("base_models", [path, ...props.baseModels]);
  }

  const shopField = (k: keyof PublicSettings, label: string, disabled = false) => (
    <Field label={label}>
      <input
        className={inputClass}
        disabled={disabled}
        value={(shop[k] as string) ?? ""}
        onChange={(e) => setShop({ ...shop, [k]: e.target.value })}
      />
    </Field>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-extrabold">{s.settings}</h1>
      {msg && <p className="rounded-lg bg-soft p-2 text-center font-semibold">{msg}</p>}

      <section className="space-y-3">
        <h2 className="font-bold">{s.shopDetails}</h2>
        {shopField("shop_name", "Shop name")}
        {shopField("address", "Address")}
        {shopField("call_number", "Call number (10 digits)")}
        {shopField("second_number", "Second number")}
        {shopField("instagram", "Instagram handle")}
        {shopField("hours", "Shop hours (from Google listing)")}
        {shopField("rating", "Google rating (e.g. 4.6 ★, 120 reviews)")}
        {shopField("whatsapp_number", `${s.whatsappNumber}: 91 + 10 digits`, !props.isOwner)}
        {!props.isOwner && <p className="text-sm text-muted">{s.ownerOnly}</p>}
        <Button disabled={pending} onClick={() => save("public", shop)}>
          {s.save}
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">{s.palette}</h2>
        {palette.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="color"
              value={p.hex}
              onChange={(e) => setPalette(palette.map((x, k) => (k === i ? { ...x, hex: e.target.value } : x)))}
              className="h-11 w-11 shrink-0 rounded"
            />
            <input
              className={inputClass}
              value={p.name}
              onChange={(e) => setPalette(palette.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
            />
            <button className="min-h-11 min-w-11 text-muted" onClick={() => setPalette(palette.filter((_, k) => k !== i))} aria-label="Remove">
              ✕
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPalette([...palette, { name: "", hex: "#cccccc" }])}>
            + Colour
          </Button>
          <Button disabled={pending} onClick={() => save("colour_palette", palette.filter((p) => p.name.trim()))}>
            {s.save}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">{s.sizeSets}</h2>
        {CATEGORIES.map((c) => (
          <Field key={c} label={s.categories[c]}>
            <input className={inputClass} value={sizeSets[c]} onChange={(e) => setSizeSets({ ...sizeSets, [c]: e.target.value })} />
          </Field>
        ))}
        <Button
          disabled={pending}
          onClick={() =>
            save(
              "size_sets",
              Object.fromEntries(Object.entries(sizeSets).map(([k, v]) => [k, v.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean)])),
            )
          }
        >
          {s.save}
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">{s.baseModels}</h2>
        <p className="text-sm text-muted">Two poses (front, three-quarter), plain studio background. The first one is used for try-on.</p>
        <div className="grid grid-cols-3 gap-2">
          {props.baseModels.map((m, i) => (
            <div key={m} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={props.catalogBase + m} alt="" className="aspect-[2/3] w-full rounded bg-soft object-cover" />
              <button
                className="absolute top-1 right-1 min-h-8 rounded bg-white px-2 text-xs"
                onClick={() => save("base_models", props.baseModels.filter((_, k) => k !== i))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line px-3 font-semibold">
          + Upload
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => uploadModel(e.target.files?.[0])} />
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">{s.adminPhones}</h2>
        {!props.isOwner && <p className="text-sm text-muted">{s.ownerOnly}</p>}
        <Field label="Admin numbers (comma separated)">
          <input className={inputClass} value={admins} disabled={!props.isOwner} onChange={(e) => setAdmins(e.target.value)} />
        </Field>
        <Field label="Owner numbers (can change WhatsApp number and admins)">
          <input className={inputClass} value={owners} disabled={!props.isOwner} onChange={(e) => setOwners(e.target.value)} />
        </Field>
        {props.isOwner && (
          <Button
            disabled={pending}
            onClick={() => {
              save("admin_phones", admins.split(/[,\s]+/).filter(Boolean));
              save("owner_phones", owners.split(/[,\s]+/).filter(Boolean));
            }}
          >
            {s.save}
          </Button>
        )}
      </section>
    </div>
  );
}
