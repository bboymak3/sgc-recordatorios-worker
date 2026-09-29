# SGC Recordatorios Worker

Bot de recordatorios automáticos por WhatsApp para citas/revisiones pendientes. Multi-nicho: sirve para revisiones técnicas, mantenimientos preventivos, controles médicos, etc.

## 🏗️ Arquitectura

- **Runtime**: Cloudflare Workers (gratis)
- **DB**: Cloudflare D1 (tabla `sgc_rec_recordatorios_revision`)
- **WhatsApp**: UltraMsg API (o Evolution API configurable)
- **Cron**: Trigger programado para envío automático

## ✨ Funcionalidades

### Gestión de leads
- Captura teléfono + patente
- Asociación con mes de revisión
- Activación/desactivación

### Recordatorios automáticos
- Cron job que se ejecuta automáticamente
- Envía recordatorios 30, 15 y 7 días antes del vencimiento
- Plantilla de mensaje personalizable
- Historial de envíos

### Endpoints públicos
- `/api/save-lead` — Captura leads desde formularios web
- `/api/check?patente=XX` — Verifica si una patente tiene recordatorio activo

### Estadísticas
- Total de leads activos
- Cuántos revisan este mes
- Histórico de envíos

## 📋 Endpoints

| Método | Path | Descripción |
|---|---|---|
| `GET` | `/` | Página info HTML |
| `POST` | `/api/save-lead` | Guarda nuevo lead (teléfono + patente + mes revisión) |
| `GET` | `/api/check?patente=XXXX` | Verifica si patente tiene recordatorio |
| `GET` | `/api/stats` | Estadísticas (total, este mes) |
| `GET` | `/api/trigger` | Dispara recordatorios manualmente (requiere header `x-cron-secret`) |

## 🔧 Configuración

### Variables (wrangler.toml)
| Variable | Descripción | Default |
|---|---|---|
| `CRON_SECRET` | Secreto para endpoint `/api/trigger` | - |
| `ULTRAMSG_INSTANCE` | ID instancia UltraMsg | - |

### Bindings
- `DB` — D1 database `citas` (tabla `sgc_rec_*`)

### Tabla D1
- `sgc_rec_recordatorios_revision` — Leads con teléfono, patente, mes de revisión

## 🚀 Deploy

```bash
git clone https://github.com/bboymak3/sgc-recordatorios-worker.git
cd sgc-recordatorios-worker

# Editar wrangler.toml
nano wrangler.toml

# Deploy
wrangler deploy
```

## ⏰ Cron Trigger (opcional)

Para envíos automáticos, agregar al `wrangler.toml`:

```toml
[triggers]
crons = ["0 9 * * *"]  # Todos los días a las 9am UTC
```

Y agregar handler `scheduled` al código:

```javascript
async scheduled(event, env) {
  const result = await processReminders(env);
  console.log('Recordatorios enviados:', result);
}
```

## 📚 Repos relacionados

- [sgc-citas-worker](https://github.com/bboymak3/sgc-citas-worker) — Bot WhatsApp con IA
- [sgc-admin-pages](https://github.com/bboymak3/sgc-admin-pages) — Panel admin
- [sgc-ordenes-pages](https://github.com/bboymak3/sgc-ordenes-pages) — Sistema de órdenes

## 💰 Costo mensual: $0

Cloudflare Workers free tier: 100k requests/día.

## 📄 Licencia

Propietario — SGC
