// Service worker at the site root. Its only job is push: every push shows a
// notification (browsers penalise silent pushes), and tapping it opens the board.
// It does not cache pages, so the board is always the live one.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Pantry Live";
  const options = {
    body: data.body || "Something you asked about is on the shelf.",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: data.tag || "pantry-live",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const tab of tabs) {
      if (new URL(tab.url).origin === self.location.origin && "focus" in tab) {
        await tab.navigate(url).catch(() => {});
        return tab.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
