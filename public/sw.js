// Service worker for the admin pages (new-order notifications) and Papa's
// upload link (receives photos shared from WhatsApp). Not registered on
// buyer pages.

// Share target: keep the shared photos in Cache Storage and open the upload
// page, which uploads them straight to storage (a single request to the
// server would hit Vercel's 4.5 MB limit). Everything else goes to the network.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const m = url.pathname.match(/^\/u\/([^/]+)\/share\/?$/);
  if (event.request.method !== "POST" || !m) return;
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const files = form.getAll("photos").filter((f) => f && typeof f === "object" && f.size > 0);
        const text = [form.get("title"), form.get("text")].filter((v) => typeof v === "string" && v).join(" ");
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const cache = await caches.open("share-inbox");
        await Promise.all(
          files.map((f, i) =>
            cache.put(`/share-inbox/${id}/${String(i).padStart(3, "0")}`, new Response(f, { headers: { "content-type": f.type || "image/jpeg" } })),
          ),
        );
        if (text) await cache.put(`/share-inbox/${id}/text`, new Response(text, { headers: { "content-type": "text/plain" } }));
        return Response.redirect(`/u/${m[1]}?inbox=${id}`, 303);
      } catch (e) {
        return Response.redirect(`/u/${m[1]}`, 303);
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Naya order", body: "", url: "/admin" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: { url: data.url },
      tag: data.url,
      badge: "/favicon.ico",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
