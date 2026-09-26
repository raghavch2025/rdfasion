"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { analysePhoto, createDraft, saveDesign, type DesignDetails } from "@/app/admin/actions";
import { browserDb } from "@/lib/supabase/browser";
import { Button, Field, inputClass } from "@/components/ui/Button";
import { CATEGORIES, type Category, type PaletteColour } from "@/lib/types";
import { admin as s } from "@/strings";
import { resizeImage } from "./resize";

type Colour = { name: string; hex: string; photoPath?: string | null; photoPreview?: string };
const DEFAULT_SIZES = ["M", "L", "XL", "XXL"];

async function upload(productId: string, file: File, name: string): Promise<string> {
  const blob = await resizeImage(file);
  const path = `${productId}/${name}-${Date.now().toString(36)}.jpg`;
  const { error } = await browserDb().storage.from("originals").upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

// Photo → auto-detect → colours → generate → approve → sizes/price → publish.
// Approval and publish happen on the design's page after saving.
export function NewDesign({
  palette,
  sizeSets,
  aiReady,
  autofillReady,
}: {
  palette: PaletteColour[];
  sizeSets: Record<string, string[]>;
  aiReady: boolean;
  autofillReady: boolean;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState<string | null>(null);
  const [originalPath, setOriginalPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("tshirt");
  const [printType, setPrintType] = useState<"solid" | "print" | "stripe">("solid");
  const [photoColour, setPhotoColour] = useState("");
  const [colours, setColours] = useState<Colour[]>([]);
  const [custom, setCustom] = useState("");
  const [price, setPrice] = useState("");
  const [moq, setMoq] = useState("6");
  const [sizes, setSizes] = useState(DEFAULT_SIZES.join(", "));
  const [fabric, setFabric] = useState("");
  const [gsm, setGsm] = useState("");

  function pickCategory(c: Category) {
    setCategory(c);
    setSizes((sizeSets[c] ?? DEFAULT_SIZES).join(", "));
  }

  function toggleColour(p: PaletteColour) {
    setColours((cur) => (cur.some((c) => c.name === p.name) ? cur.filter((c) => c.name !== p.name) : [...cur, { name: p.name, hex: p.hex }]));
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPreview(URL.createObjectURL(file));
    try {
      setBusy(s.analysing);
      const id = productId ?? (await createDraft()).id;
      setProductId(id);
      const path = await upload(id, file, "original");
      setOriginalPath(path);
      if (autofillReady) {
        const guess = await analysePhoto(id, path);
        if (guess) {
          setName(guess.name);
          pickCategory(guess.category);
          setPrintType(guess.print_type);
          const match = palette.find((p) => p.name.toLowerCase() === guess.colour.toLowerCase());
          const detected = match ?? { name: guess.colour, hex: "#cccccc" };
          setPhotoColour(detected.name);
          setColours((cur) => (cur.some((c) => c.name === detected.name) ? cur : [detected, ...cur]));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function onColourPhoto(i: number, file: File | undefined) {
    if (!file || !productId) return;
    setBusy(s.colourPhoto);
    try {
      const path = await upload(productId, file, `colour-${i}`);
      setColours((cur) => cur.map((c, k) => (k === i ? { ...c, photoPath: path, photoPreview: URL.createObjectURL(file) } : c)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function save(mode: "ai" | "manual") {
    if (!productId || !originalPath) return;
    setError(null);
    const details: DesignDetails = {
      name,
      category,
      print_type: printType,
      price: Number.parseInt(price, 10),
      moq: Number.parseInt(moq, 10),
      fabric,
      gsm,
      sizes: sizes.split(/[,\s]+/).filter(Boolean),
      originalPath,
      photoColour: photoColour || colours[0]?.name || "",
      colours: colours.map(({ name, hex, photoPath }) => ({ name, hex, photoPath })),
    };
    setBusy(mode === "ai" ? s.generating : s.save);
    const res = await saveDesign(productId, details, mode);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    router.push(`/admin/products/${productId}`);
  }

  const printWithoutPhotos = printType !== "solid" && colours.some((c) => c.name !== photoColour && !c.photoPath);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold">{s.newDesign}</h1>

      <section className="space-y-2">
        <h2 className="font-bold">1. {s.pickPhoto}</h2>
        <label className="flex min-h-40 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-line bg-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview} alt="" className="max-h-80 object-contain" /> : <span className="font-semibold">📷 {s.pickPhoto}</span>}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>
      </section>

      {originalPath && (
        <>
          <section className="space-y-3">
            <h2 className="font-bold">2. {s.designName}</h2>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Boxy fit henley tee" />
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <Chip key={c} on={category === c} onClick={() => pickCategory(c)}>
                  {s.categories[c]}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {(["solid", "print", "stripe"] as const).map((p) => (
                <Chip key={p} on={printType === p} onClick={() => setPrintType(p)}>
                  {s.printTypes[p]}
                </Chip>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-bold">3. {s.pickColours}</h2>
            <div className="flex flex-wrap gap-2">
              {palette.map((p) => (
                <Chip key={p.name} on={colours.some((c) => c.name === p.name)} onClick={() => toggleColour(p)}>
                  <span className="h-5 w-5 rounded-full border border-line" style={{ background: p.hex }} />
                  {p.name}
                </Chip>
              ))}
            </div>
            <div className="flex gap-2">
              <input className={inputClass} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={s.customColour} />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const n = custom.trim();
                  if (n && !colours.some((c) => c.name.toLowerCase() === n.toLowerCase())) setColours([...colours, { name: n, hex: "#cccccc" }]);
                  setCustom("");
                }}
              >
                {s.add}
              </Button>
            </div>
            {colours.length > 0 && (
              <ul className="space-y-2">
                {colours.map((c, i) => (
                  <li key={c.name} className="flex items-center gap-2 rounded-lg border border-line p-2">
                    <span className="h-8 w-8 shrink-0 rounded-full border border-line" style={{ background: c.hex }} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{c.name}</p>
                      <label className="flex items-center gap-1 text-sm">
                        <input type="radio" name="photoColour" checked={photoColour === c.name} onChange={() => setPhotoColour(c.name)} />
                        Photo wala colour
                      </label>
                    </div>
                    {photoColour !== c.name && (
                      <label className="min-h-11 cursor-pointer rounded-lg bg-soft px-2 py-2 text-xs font-semibold">
                        {c.photoPath ? "✓ Photo" : s.colourPhoto}
                        <input type="file" accept="image/*" className="sr-only" onChange={(e) => onColourPhoto(i, e.target.files?.[0])} />
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {printWithoutPhotos && <p className="text-sm font-semibold text-accent">{s.printWarning}</p>}
          </section>

          <section className="space-y-3">
            <h2 className="font-bold">4. {s.price}</h2>
            <div className="grid grid-cols-2 gap-2">
              <Field label={s.price}>
                <input className={inputClass} value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
              </Field>
              <Field label={s.moq}>
                <input className={inputClass} value={moq} onChange={(e) => setMoq(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
              </Field>
            </div>
            <Field label={s.sizeSet}>
              <input className={inputClass} value={sizes} onChange={(e) => setSizes(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={s.fabric}>
                <input className={inputClass} value={fabric} onChange={(e) => setFabric(e.target.value)} placeholder="Cotton" />
              </Field>
              <Field label={s.gsm}>
                <input className={inputClass} value={gsm} onChange={(e) => setGsm(e.target.value)} inputMode="numeric" placeholder="220" />
              </Field>
            </div>
          </section>

          <section className="space-y-2">
            {aiReady && (
              <Button onClick={() => save("ai")} disabled={!!busy} className="w-full">
                {s.generate}
              </Button>
            )}
            <Button onClick={() => save("manual")} disabled={!!busy} variant={aiReady ? "outline" : "primary"} className="w-full">
              {s.saveWithoutAi}
            </Button>
          </section>
        </>
      )}

      {busy && <p className="text-center font-semibold">{busy}</p>}
      {error && <p className="text-center font-semibold text-accent">{error}</p>}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 font-semibold ${on ? "border-ink bg-ink text-white" : "border-line"}`}
    >
      {children}
    </button>
  );
}
