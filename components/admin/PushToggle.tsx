"use client";
import { useEffect, useState } from "react";
import { savePushSubscription } from "@/app/admin/actions";
import { admin as s } from "@/strings";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Web Push for new orders on the admin's phone. The service worker is only
// registered here, on admin pages; buyers never see an install prompt.
export function PushToggle({ vapidKey }: { vapidKey: string }) {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "blocked">("off");
  useEffect(() => {
    if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
    if (Notification.permission === "denied") return setState("blocked");
    navigator.serviceWorker.getRegistration("/admin/").then(async (reg) => {
      if (reg && (await reg.pushManager.getSubscription())) setState("on");
    });
  }, [vapidKey]);

  async function enable() {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setState("blocked");
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/admin/" });
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) }));
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const res = await savePushSubscription(json);
    setState(res.ok ? "on" : "off");
  }

  if (state === "unsupported") return null;
  if (state === "on") return <p className="text-sm text-ok">{s.notificationsOn}</p>;
  if (state === "blocked") return <p className="text-sm text-muted">{s.notificationsBlocked}</p>;
  return (
    <button onClick={enable} className="min-h-11 rounded-lg border border-line px-3 text-sm font-semibold">
      {s.enableNotifications}
    </button>
  );
}
