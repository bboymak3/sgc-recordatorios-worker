# SGC Recordatorios Worker — Recordatorios automáticos por WhatsApp

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![D1](https://img.shields.io/badge/Cloudflare-D1-0051C3?logo=cloudflare&logoColor=white)
![UltraMsg](https://img.shields.io/badge/WhatsApp-UltraMsg-25D366?logo=whatsapp&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?logo=javascript&logoColor=black)
![Cron](https://img.shields.io/badge/Trigger-Cron-6366F1?logo=clockify&logoColor=white)

Bot de recordatorios automáticos por WhatsApp para citas y revisiones pendientes. Diseñado para enviar avisos **30 / 15 / 7 días antes** del vencimiento del mes de revisión técnica del vehículo, capturando leads desde formularios web y notificándolos vía UltraMsg API.

> ⚠️ **Nota**: Compatible con **multi-tenant** (la tabla tiene `tenant_id`). Funciona en paralelo con [`sgc-saas`](https://github.com/bboymak3/sgc-saas) y [`sgc-citas-worker`](https://github.com/bboymak3/sgc-citas-worker) — comparten el D1 `citas` pero operan sobre tablas con prefijo `sgc_rec_*`.

---

## 🏗️ Arquitectura

```
                    ┌──────────────────┐
                    │  Cron Trigger    │
                    │ (0 9 * * * UTC)  │
                    └────────┬─────────┘
                             │
                             ▼
┌──────────────┐    ┌──────────────────────┐    ┌──────────────────┐
│  HTTP Client │───▶│   SGC Recordatorios  │───▶│  Cloudflare D1   │
│  (web/admin) │    │   Worker (JS)        │    │  DB: citas       │
└──────────────┘    │                      │    │  Tabla: sgc_rec  │
                    │  • save-lead         │◀───│  _recordatorios  │
                    │  • check patente     │    │  _revision       │
                    │  • stats             │    └──────────────────┘
                    │  • trigger reminders │
                    │  • scheduled() cron  │    ┌──────────────────┐
                    └──────────┬───────────┘───▶│  UltraMsg API    │
                               │                │  instance170592  │
                               └───────────────▶│  → WhatsApp      │
                                                └────────┬─────────┘
                                                         │
                                                         ▼
                                                ┌──────────────────┐
                                                │  Cliente final   │
                                                │  (WhatsApp chat) │
                                                └──────────────────┘
```

---

## 🧱 Tech Stack

| Capa | Tecnología |
|---|---|
| **Runtime** | Cloudflare Workers (edge compute) |
| **DB** | Cloudflare D1 (SQLite) |
| **WhatsApp** | UltraMsg API (legacy) — puede migrarse a Evolution API |
| **Triggers** | Cron (configurable en `wrangler.toml`) |
| **Lenguaje** | JavaScript vanilla (sin build) |

---

## 🌐 APIs y Endpoints

| Método | Path | Descripción |
|---|---|---|
| `GET` | `/` | Página info HTML con documentación de endpoints |
| `POST` | `/api/save-lead` | Guarda nuevo lead (teléfono + patente + mes revisión) |
| `GET` | `/api/check?patente=XXXX` | Verifica si patente tiene recordatorio activo |
| `GET` | `/api/stats` | Estadísticas (total registrados, revisan este mes) |
| `GET` | `/api/trigger` | Dispara recordatorios manualmente (requiere header `x-cron-secret`) |
| _(planificado)_ | `scheduled()` handler | Cron automático para envío diario (handler ya implementado en código, falta configurar `[triggers]` en `wrangler.toml`) |

### Connectors externos

- **D1 (DB)** — Cloudflare D1 `citas` (UUID `678b4adc-232d-43db-86ec-230828268161`) → tabla `sgc_rec_recordatorios_revision`
- **UltraMsg API** — envío de WhatsApp (legacy, plan $15/mes o free tier). Endpoint: `https://api.ultramsg.com/{instance}/messages/chat`
- **Cron** — trigger programado (TODO: configurar sección `[triggers]` en `wrangler.toml`)

---

## ⚙️ Funciones principales

| Función | Descripción |
|---|---|
| `handleSaveLead` | Guarda lead en D1 (teléfono, patente, mes revisión). Calcula mes automáticamente desde último carácter de patente o acepta `mes_manual`. |
| `handleCheck` | Verifica si una patente tiene recordatorio activo. Devuelve mes calculado y datos del registro (teléfono enmascarado). |
| `handleStats` | Estadísticas: total de leads activos y cuántos revisan en el mes actual. |
| `handleTriggerReminders` | Dispara el envío de recordatorios manualmente. Valida `secret` contra `CRON_SECRET`. |
| `processReminders` | Procesa todos los recordatorios pendientes. Evalúa ventanas 30/15/7 días antes del mes de revisión y envía si la etapa no fue notificada. |
| `sendWhatsApp` | Envía WhatsApp vía UltraMsg API (`POST /messages/chat`). |
| `jsonResponse` | Helper para respuestas JSON con headers CORS incluidos. |
| `corsResponse` | Helper para respuestas con headers CORS (`Access-Control-Allow-Origin: *`). |
| `calcularMesRevision` | Mapea último carácter de la patente al mes de revisión técnica (Chile). |
| `proximaFechaRevision` | Calcula próxima fecha de revisión (mes/año) desde `mes_revision` y tiempo Chile. |
| `generarMensajeRecordatorio` | Construye el mensaje de WhatsApp según etapa (30d/15d/7d) con emoji y urgencia. |
| `scheduled` (TODO activar) | Handler para cron trigger automático. **Ya implementado en código**, solo falta configurar `[triggers]` en `wrangler.toml`. |

---

## 🗄️ Tabla D1

### `sgc_rec_recordatorios_revision`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | INTEGER PK | Auto-incremental |
| `telefono` | TEXT | Teléfono sanitizado (ej: `56912345678`) |
| `patente` | TEXT | Patente sanitizada (mayúsculas, sin guiones) |
| `ultimo_caracter` | TEXT | Último carácter de la patente (determina mes de revisión) |
| `mes_revision` | INTEGER | Mes de revisión (1–12). Auto-calculado o manual. |
| `es_manual` | INTEGER | `1` si el mes fue ingresado manualmente, `0` si auto-calculado |
| `fecha_registro` | TEXT | Timestamp de registro (`datetime('now', '-4 hours')` para Chile) |
| `ultimo_aviso_enviado` | TEXT | Tracking de etapas enviadas (formato: `30d\|2025,15d\|2025,7d\|2025`) |
| `activo` | INTEGER | `1` = activo, `0` = dado de baja |
| `tenant_id` | TEXT | Identificador de tenant (multi-tenant) |

**Constraint**: `UNIQUE(patente, telefono)` — un lead único por combinación patente+teléfono.

---

## 🔧 Configuración

### Variables (`wrangler.toml`)

| Variable | Descripción | Default en repo |
|---|---|---|
| `CRON_SECRET` | Secreto para endpoint `/api/trigger` | `cambia-esto-por-una-clave-secreta` ⚠️ |
| `ULTRAMSG_INSTANCE` | ID instancia UltraMsg | `instance170592` |
| `ULTRAMSG_TOKEN` | Token API de UltraMsg | _(no commiteado — se setea vía `wrangler secret` o hardcodea)_ |

### Bindings

| Binding | Tipo | Nombre DB |
|---|---|---|
| `DB` | D1 | `citas` (UUID `678b4adc-232d-43db-86ec-230828268161`) |

> Sin secrets en este repo. El token de UltraMsg va en vars (no recomendado) o se hardcodea al deployar. Mejor práctica: `wrangler secret put ULTRAMSG_TOKEN`.

---

## ⏰ Cron Trigger (TODO)

Para activar envíos automáticos diarios, agregar al `wrangler.toml`:

```toml
[triggers]
crons = ["0 9 * * *"]  # Todos los días a las 9am UTC (6am Chile)
```

El handler `scheduled` **ya está implementado** en `index.js`:

```javascript
async scheduled(event, env) {
  console.log("[CRON] Ejecutando recordatorios programados (30d/15d/7d)...");
  try {
    const result = await processReminders(env);
    console.log(`[CRON] Completado: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error("[CRON] Error fatal:", error);
  }
}
```

Una vez agregado el `[triggers]`, hacer `wrangler deploy` y el cron se ejecutará automáticamente según el schedule.

> Cloudflare Workers free tier permite hasta **3 cron triggers** por worker.

---

## 🚀 Deploy

```bash
git clone https://github.com/bboymak3/sgc-recordatorios-worker.git
cd sgc-recordatorios-worker

# Editar wrangler.toml (cambiar CRON_SECRET y verificar ULTRAMSG_INSTANCE)
nano wrangler.toml

# Setear token de UltraMsg como secret
wrangler secret put ULTRAMSG_TOKEN

# Deploy
wrangler deploy
```

**Worker deploy**: <https://sgc-recordatorios.activo.workers.dev>

---

## 💰 Costo

**$0/mes** — Cloudflare Workers free tier:

- 100,000 requests/día
- 10ms CPU por request
- 3 cron triggers
- D1 free tier: 5M rows leídas/día, 100k escritas/día

---

## 📦 Estructura del repo

```
sgc-recordatorios-worker/
├── index.js          # Worker principal (handlers HTTP + scheduled)
├── wrangler.toml     # Configuración de Cloudflare (D1 binding, vars)
├── .gitignore
└── README.md
```

---

## 🔗 Repos relacionados

- [sgc-saas](https://github.com/bboymak3/sgc-saas) — Worker SaaS principal (chat IA, admin, órdenes)
- [sgc-citas-worker](https://github.com/bboymak3/sgc-citas-worker) — Bot WhatsApp con IA para agendamiento de citas
- [sgc-admin-pages](https://github.com/bboymak3/sgc-admin-pages) — Panel admin (Cloudflare Pages)
- [sgc-ordenes-pages](https://github.com/bboymak3/sgc-ordenes-pages) — Sistema de órdenes (Cloudflare Pages)

---

## 📄 Licencia

Propietario — **SGC**. Uso interno. Todos los derechos reservados.

---

## Correcciones (2026-09-29)

- **El worker no funcionaba:** consultaba la tabla `recordatorios_revision`, que no existe; la real es
  `sgc_rec_recordatorios_revision`. Cada registro respondía 500 y las estadísticas daban 0.
- Código fuente en `src/index.js` (se eliminó el bundle) con tests (`npm test`).
- Cron activado en `wrangler.toml` (`0 13 * * *`, 09:00–10:00 en Chile).
- `CRON_SECRET` ahora es un secret (`wrangler secret put CRON_SECRET`); `/api/trigger` acepta `POST` con header
  `X-Cron-Secret` y compara en tiempo constante.
- Envío por **Evolution API** si `EVOLUTION_API_KEY` está configurado (mismo bridge que el bot); UltraMsg queda de respaldo.
- Anti-abuso: `save-lead` limita por IP y envía como máximo una bienvenida por teléfono cada 24 h
  (antes se podía usar para mandar WhatsApp a cualquier número).
- Filtro por `tenant_id` (`TENANT_ID`, por defecto 1) y fecha de Chile con zona horaria real (antes UTC−4 fijo).
