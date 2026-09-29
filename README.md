# SGC Recordatorios Worker

Worker para gestión de recordatorios de revisión vehicular vía WhatsApp.

## 🏗️ Arquitectura

- **Runtime**: Cloudflare Workers
- **DB**: Cloudflare D1 (tabla `sgc_rec_recordatorios_revision`)
- **WhatsApp**: UltraMsg API
- **Cron**: Trigger programado para envío automático

## 📋 Endpoints

| Método | Path | Descripción |
|---|---|---|
| `POST` | `/api/save-lead` | Guarda nuevo lead (teléfono + patente) |
| `GET` | `/api/check?patente=XXXX` | Verifica si una patente tiene recordatorio |
| `GET` | `/api/stats` | Estadísticas de recordatorios |
| `GET` | `/api/trigger` | Dispara recordatorios manualmente (requiere header x-cron-secret) |
| `GET` | `/` | Página info HTML |

## 🔧 Configuración

### Variables (en wrangler.toml)
- `CRON_SECRET`: Secreto para endpoint /api/trigger
- `ULTRAMSG_INSTANCE`: ID de instancia UltraMsg

### Bindings
- `DB`: D1 database `citas`

### Tabla D1
- `sgc_rec_recordatorios_revision`

## 🚀 Deploy

```bash
wrangler deploy
```
