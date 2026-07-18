/*
  offline.js — Reemplaza al backend Flask en la versión Android/offline.
  Intercepta window.fetch para las rutas /api/* y responde con datos locales:
   - /api/units, /api/units/<n>  -> desde window.CONTENT (content.js)
   - /api/progress (GET/POST)    -> localStorage
   - /api/check (POST)           -> comparación local (igual que el backend)
  Debe cargarse ANTES del script principal del dashboard.
*/
(function () {
  const origFetch = window.fetch ? window.fetch.bind(window) : null;
  const KEY = "ela1_progress";
  const DEFAULT = { xp: 0, streak: 0, lastActive: null, completed: {} };

  // Normalización idéntica a normalize_phrase() del backend Python.
  function norm(t) {
    if (!t) return "";
    t = ("" + t).trim().toLowerCase();
    t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    t = t.replace(/[’']/g, "");
    t = t.replace(/[^a-z0-9\s]/g, " ");
    t = t.replace(/\s+/g, " ").trim();
    return t;
  }
  function json(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  const units = () => window.CONTENT || [];

  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const method = ((init && init.method) || "GET").toUpperCase();
      const path = url.replace(/^https?:\/\/[^/]+/, "");

      // Cualquier cosa que no sea /api/ se sirve normal (assets locales).
      if (path.indexOf("/api/") === -1) {
        return origFetch ? origFetch(input, init) : Promise.reject(new Error("offline"));
      }

      const m = path.match(/\/api\/units\/(\d+)/);
      if (m) {
        const u = units().find((x) => x.number === parseInt(m[1], 10));
        return Promise.resolve(u ? json(u) : json({ error: "not_found" }, 404));
      }
      if (path.indexOf("/api/units") === 0) {
        return Promise.resolve(json(units().map((u) => ({
          number: u.number, title: u.title, subtitle: u.subtitle,
          icon: u.icon, color: u.color, objectives: u.objectives,
        }))));
      }
      if (path.indexOf("/api/progress") === 0) {
        if (method === "POST") {
          let b = {};
          try { b = JSON.parse((init && init.body) || "{}"); } catch (e) {}
          const safe = {
            xp: +b.xp || 0, streak: +b.streak || 0,
            lastActive: b.lastActive || null,
            completed: (b.completed && typeof b.completed === "object") ? b.completed : {},
          };
          localStorage.setItem(KEY, JSON.stringify(safe));
          return Promise.resolve(json({ ok: true, progress: safe }));
        }
        let p = DEFAULT;
        try { const s = localStorage.getItem(KEY); if (s) p = JSON.parse(s); } catch (e) {}
        return Promise.resolve(json(p));
      }
      if (path.indexOf("/api/check") === 0) {
        let b = {};
        try { b = JSON.parse((init && init.body) || "{}"); } catch (e) {}
        const ok = !!b.expected && norm(b.answer) === norm(b.expected);
        return Promise.resolve(json({ correct: ok }));
      }
      if (path.indexOf("/api/users") === 0) {
        return Promise.resolve(json({ error: "forbidden" }, 403));
      }
      return Promise.resolve(json({ error: "not_found" }, 404));
    } catch (e) {
      return Promise.resolve(json({ error: String(e) }, 500));
    }
  };
})();
