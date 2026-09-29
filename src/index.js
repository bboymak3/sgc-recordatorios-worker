// ============================================================
// SGC Recordatorios - avisos de revisión técnica por WhatsApp
//
//   POST /api/save-lead     registra teléfono + patente (formulario web)
//   POST /api/unsubscribe   da de baja
//   GET  /api/check         consulta si una patente está registrada
//   GET  /api/stats         totales
//   POST /api/trigger       ejecuta el envío manualmente (X-Cron-Secret)
//   scheduled()             cron diario (wrangler.toml [triggers])
//
// Tabla: sgc_rec_recordatorios_revision (D1 "citas"), tenant_id = TENANT_ID.
// Envío: Evolution API si está configurada; si no, UltraMsg (legacy).
// ============================================================

export const MESES_REVISION = { "1": 4, "2": 5, "3": 6, "4": 7, "5": 8, "6": 9, "7": 10, "8": 11, "9": 1, "0": 2 };
export const MESES_NOMBRES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const ETAPAS = [{ dias: 30, etiqueta: "30d" }, { dias: 15, etiqueta: "15d" }, { dias: 7, etiqueta: "7d" }];
const TABLE = "sgc_rec_recordatorios_revision";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Cron-Secret"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

function tenantId(env) {
  const n = parseInt(env.TENANT_ID || "1", 10);
  return Number.isFinite(n) ? n : 1;
}

export function calcularMesRevision(ultimoChar) {
  return MESES_REVISION[String(ultimoChar).toUpperCase().trim()] ?? null;
}
export function sanitizarTelefono(tel) {
  return String(tel || "").replace(/[^0-9]/g, "");
}
export function sanitizarPatente(pat) {
  return String(pat || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function enmascararTelefono(tel) {
  return tel.length < 5 ? "****" : "****" + tel.slice(-4);
}

// Fecha "de calendario" actual en Chile como Date UTC a medianoche
export function hoyChile(now = new Date()) {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function proximaFechaRevision(mesRevision, hoy) {
  const y = hoy.getUTCFullYear();
  let fecha = new Date(Date.UTC(y, mesRevision - 1, 1));
  if (fecha.getTime() <= hoy.getTime()) fecha = new Date(Date.UTC(y + 1, mesRevision - 1, 1));
  return { fecha, year: fecha.getUTCFullYear() };
}

export function etapaEnviada(ultimoAviso, etiqueta, year) {
  if (!ultimoAviso) return false;
  return ultimoAviso.split(",").includes(`${etiqueta}|${year}`);
}

function agregarEtapa(ultimoAviso, etiqueta, year) {
  const key = `${etiqueta}|${year}`;
  // Formato viejo "MM-YYYY" o vacío: se reemplaza
  if (!ultimoAviso || /^\d{2}-\d{4}$/.test(ultimoAviso)) return key;
  return ultimoAviso + "," + key;
}

// Etapa que corresponde enviar hoy (o null)
export function etapaParaHoy(diasRestantes, ultimoAviso, year) {
  if (diasRestantes < 0 || diasRestantes > 30) return null;
  // La etapa más urgente que aplica y aún no se envió
  const aplicables = ETAPAS.filter((e) => diasRestantes <= e.dias).sort((a, b) => a.dias - b.dias);
  const etapa = aplicables[0];
  return etapa && !etapaEnviada(ultimoAviso, etapa.etiqueta, year) ? etapa : null;
}

export function generarMensajeRecordatorio(env, patente, nombreMes, year, diasRestantes, etiqueta) {
  const negocio = env.BUSINESS_NAME || "Global Pro Automotriz";
  const contacto = env.BUSINESS_CONTACT || "+56 9 390 26185";
  const web = env.BUSINESS_WEB || "mecanico247.com";
  const urgencia = {
    "30d": `📅 Faltan aproximadamente *${diasRestantes} días* para el inicio de tu mes de revisión técnica.`,
    "15d": `⚠️ *¡Solo faltan ${diasRestantes} días!* Se acerca tu mes de revisión técnica.`,
    "7d": `🚨 *¡URGENTE! Faltan solo ${diasRestantes} días* para tu revisión técnica.`
  }[etiqueta];
  return `*Recordatorio de ${negocio}*

${urgencia}

Vehículo: *patente ${patente}, revisión en ${nombreMes} ${year}*

¿Te gustaría agendar una revisión preventiva a domicilio para ir a la segura?

Responde a este mensaje o escríbenos al ${contacto} 📲
Web: ${web}`;
}

export async function sendWhatsApp(env, telefono, mensaje) {
  const phone = sanitizarTelefono(telefono);
  if (phone.length < 11) return { success: false, error: "Teléfono inválido" };
  try {
    if (env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY) {
      const instance = env.EVOLUTION_INSTANCE_NAME || "make peueba";
      const res = await fetch(`${env.EVOLUTION_API_URL}/message/sendText/${encodeURIComponent(instance)}`, {
        method: "POST",
        headers: { "apikey": env.EVOLUTION_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ number: phone, text: mensaje })
      });
      if (res.ok) return { success: true };
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.message || `HTTP ${res.status}` };
    }
    if (!env.ULTRAMSG_INSTANCE || !env.ULTRAMSG_TOKEN) return { success: false, error: "WhatsApp no configurado" };
    const res = await fetch(`https://api.ultramsg.com/${env.ULTRAMSG_INSTANCE}/messages/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: env.ULTRAMSG_TOKEN, to: phone, body: mensaje, priority: "10" }).toString()
    });
    const data = await res.json().catch(() => ({}));
    return data.status === "success" || data.sent ? { success: true } : { success: false, error: data.message || data.error || "Error UltraMsg" };
  } catch (error) {
    console.error("Error WhatsApp:", error);
    return { success: false, error: "Error de conexión" };
  }
}

// Límite de frecuencia "best effort" con la Cache API
async function allowOnce(bucket, id, seconds) {
  if (typeof caches === "undefined" || !caches.default) return true;
  const key = new Request(`https://ratelimit.internal/${bucket}/${encodeURIComponent(id)}`);
  if (await caches.default.match(key)) return false;
  await caches.default.put(key, new Response("1", { headers: { "Cache-Control": `max-age=${seconds}` } }));
  return true;
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || !a.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function handleSaveLead(request, env) {
  const body = await request.json().catch(() => ({}));
  const telefono = sanitizarTelefono(body.telefono);
  const patente = sanitizarPatente(body.patente);
  if (!telefono || !patente) return json({ success: false, error: "Teléfono y patente son requeridos" }, 400);
  if (patente.length < 5 || patente.length > 8) return json({ success: false, error: "Patente inválida" }, 400);
  if (telefono.length < 11 || telefono.length > 15) return json({ success: false, error: "Teléfono inválido (ej: +56912345678)" }, 400);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!(await allowOnce("save-lead-ip", ip, 10))) return json({ success: false, error: "Espera unos segundos antes de reintentar" }, 429);

  const ultimoChar = patente.charAt(patente.length - 1);
  const manual = parseInt(body.mes_manual, 10);
  let mesRevision;
  let esManual = 0;
  if (manual >= 1 && manual <= 12) {
    mesRevision = manual;
    esManual = 1;
  } else {
    mesRevision = calcularMesRevision(ultimoChar);
    if (!mesRevision) {
      return json({
        success: false,
        error: `No se pudo calcular el mes automáticamente: el último carácter '${ultimoChar}' no es un dígito. Selecciona el mes manualmente.`,
        ultimo_caracter: ultimoChar,
        necesita_manual: true
      }, 400);
    }
  }

  const tid = tenantId(env);
  const existentes = await env.DB.prepare(
    `SELECT id, telefono FROM ${TABLE} WHERE patente = ? AND activo = 1 AND tenant_id = ?`
  ).bind(patente, tid).all();
  const rows = existentes.results || [];
  const mismo = rows.find((r) => r.telefono === telefono);
  if (mismo) {
    await env.DB.prepare(
      `UPDATE ${TABLE} SET mes_revision = ?, es_manual = ?, ultimo_caracter = ?, activo = 1, ultimo_aviso_enviado = '' WHERE id = ?`
    ).bind(mesRevision, esManual, ultimoChar, mismo.id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO ${TABLE} (telefono, patente, ultimo_caracter, mes_revision, es_manual, fecha_registro, ultimo_aviso_enviado, activo, tenant_id) ` +
      `VALUES (?, ?, ?, ?, ?, datetime('now', '-4 hours'), '', 1, ?)`
    ).bind(telefono, patente, ultimoChar, mesRevision, esManual, tid).run();
  }

  // Bienvenida: como máximo una por teléfono cada 24 h (evita usar el formulario para spamear números)
  if (await allowOnce("welcome", telefono, 86400)) {
    await sendWhatsApp(env, telefono,
      `¡Hola! 🚗 Te registraste en los recordatorios de ${env.BUSINESS_NAME || "Global Pro Automotriz"}.\n\n` +
      `Te avisaremos *30*, *15* y *7 días* antes de tu revisión técnica (patente ${patente}, mes de ${MESES_NOMBRES[mesRevision]}).\n\n` +
      `Si necesitas un mecánico a domicilio, ¡escríbenos! 📲\nWhatsApp: ${env.BUSINESS_CONTACT || "+56 9 390 26185"}\nWeb: ${env.BUSINESS_WEB || "mecanico247.com"}`);
  }

  const esNuevo = !mismo;
  const otro = rows.find((r) => r.telefono !== telefono);
  return json({
    success: true,
    patente,
    telefono,
    mes_revision: mesRevision,
    nombre_mes: MESES_NOMBRES[mesRevision],
    es_manual: esManual === 1,
    es_nuevo: esNuevo,
    ya_registrado: !esNuevo,
    telefono_existente: otro ? enmascararTelefono(otro.telefono) : null,
    mensaje: esNuevo
      ? "¡Registrado! Recibirás 3 avisos por WhatsApp (30, 15 y 7 días antes)."
      : "¡Actualizado! Ya estabas registrado. Recibirás 3 avisos (30, 15 y 7 días antes)."
  });
}

async function handleUnsubscribe(request, env) {
  const body = await request.json().catch(() => ({}));
  const telefono = sanitizarTelefono(body.telefono);
  if (!telefono) return json({ success: false, error: "Teléfono requerido" }, 400);
  const patente = body.patente ? sanitizarPatente(body.patente) : null;
  const tid = tenantId(env);
  if (patente) {
    await env.DB.prepare(`UPDATE ${TABLE} SET activo = 0 WHERE telefono = ? AND patente = ? AND tenant_id = ?`).bind(telefono, patente, tid).run();
  } else {
    await env.DB.prepare(`UPDATE ${TABLE} SET activo = 0 WHERE telefono = ? AND tenant_id = ?`).bind(telefono, tid).run();
  }
  return json({ success: true, mensaje: "Has sido dado de baja. No recibirás más recordatorios." });
}

async function handleCheck(url, env) {
  const patente = sanitizarPatente(url.searchParams.get("patente"));
  if (!patente) return json({ success: false, error: "Parámetro 'patente' requerido" }, 400);
  const ultimoChar = patente.charAt(patente.length - 1);
  const mesAuto = calcularMesRevision(ultimoChar);
  const existing = await env.DB.prepare(
    `SELECT telefono, mes_revision, es_manual, fecha_registro FROM ${TABLE} WHERE patente = ? AND activo = 1 AND tenant_id = ? LIMIT 1`
  ).bind(patente, tenantId(env)).first();
  return json({
    success: true,
    patente,
    ultimo_caracter: ultimoChar,
    mes_revision: mesAuto,
    nombre_mes: mesAuto ? MESES_NOMBRES[mesAuto] : null,
    es_auto: mesAuto !== null,
    necesita_manual: mesAuto === null,
    registrado: !!existing,
    registro: existing ? {
      encontrado: true,
      telefono: enmascararTelefono(existing.telefono),
      mes_revision: existing.mes_revision,
      nombre_mes: MESES_NOMBRES[existing.mes_revision],
      es_manual: existing.es_manual === 1,
      fecha_registro: existing.fecha_registro
    } : null
  });
}

export async function processReminders(env, { now = new Date(), delayMs = 1000 } = {}) {
  const hoy = hoyChile(now);
  const { results } = await env.DB.prepare(`SELECT * FROM ${TABLE} WHERE activo = 1 AND tenant_id = ?`).bind(tenantId(env)).all();
  const leads = results || [];
  let sent = 0;
  let errors = 0;
  const detalles = [];
  for (const lead of leads) {
    const { fecha, year } = proximaFechaRevision(lead.mes_revision, hoy);
    const diasRestantes = Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
    const etapa = etapaParaHoy(diasRestantes, lead.ultimo_aviso_enviado, year);
    if (!etapa) continue;
    const mensaje = generarMensajeRecordatorio(env, lead.patente, MESES_NOMBRES[lead.mes_revision], year, diasRestantes, etapa.etiqueta);
    const r = await sendWhatsApp(env, lead.telefono, mensaje);
    if (r.success) {
      await env.DB.prepare(`UPDATE ${TABLE} SET ultimo_aviso_enviado = ? WHERE id = ?`)
        .bind(agregarEtapa(lead.ultimo_aviso_enviado, etapa.etiqueta, year), lead.id).run();
      sent++;
      detalles.push(`${lead.patente}: ${etapa.etiqueta} enviada (${diasRestantes}d restantes)`);
    } else {
      console.error(`[CRON] Error enviando a ${enmascararTelefono(lead.telefono)}: ${r.error}`);
      errors++;
    }
    if (delayMs) await new Promise((res) => setTimeout(res, delayMs));
  }
  console.log(`[CRON] ${sent} enviados, ${errors} errores, ${leads.length} procesados`);
  return { sent, errors, total: leads.length, detalles };
}

const HOME_HTML = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>SGC Recordatorios - API</title>
<style>body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#e8e8e8;padding:2rem;line-height:1.6}.c{max-width:760px;margin:0 auto}h1{color:#22c55e}code{background:#222;padding:2px 6px;border-radius:3px;color:#4ade80}</style></head>
<body><div class="c"><h1>SGC Recordatorios</h1>
<p><code>POST /api/save-lead</code> registra teléfono + patente · <code>POST /api/unsubscribe</code> baja ·
<code>GET /api/check?patente=</code> · <code>GET /api/stats</code> · <code>POST /api/trigger</code> (header X-Cron-Secret).</p>
<p>El envío automático corre por Cron Trigger diario (avisos 30, 15 y 7 días antes del mes de revisión).</p></div></body></html>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    try {
      if (url.pathname === "/api/save-lead" && request.method === "POST") return await handleSaveLead(request, env);
      if (url.pathname === "/api/unsubscribe" && request.method === "POST") return await handleUnsubscribe(request, env);
      if (url.pathname === "/api/check" && request.method === "GET") return await handleCheck(url, env);
      if (url.pathname === "/api/trigger" && (request.method === "POST" || request.method === "GET")) {
        if (!env.CRON_SECRET) return json({ success: false, error: "CRON_SECRET no configurado" }, 503);
        const provided = request.headers.get("X-Cron-Secret") || url.searchParams.get("secret") || "";
        if (!timingSafeEqual(provided, env.CRON_SECRET)) return json({ success: false, error: "No autorizado" }, 403);
        return json({ success: true, ...(await processReminders(env)) });
      }
      if (url.pathname === "/api/stats" && request.method === "GET") {
        const tid = tenantId(env);
        const mes = hoyChile().getUTCMonth() + 1;
        const [total, esteMes] = await Promise.all([
          env.DB.prepare(`SELECT COUNT(*) AS c FROM ${TABLE} WHERE activo = 1 AND tenant_id = ?`).bind(tid).first(),
          env.DB.prepare(`SELECT COUNT(*) AS c FROM ${TABLE} WHERE mes_revision = ? AND activo = 1 AND tenant_id = ?`).bind(mes, tid).first()
        ]);
        return json({ success: true, total_registrados: total.c, revisan_este_mes: esteMes.c });
      }
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(HOME_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
      return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
    } catch (error) {
      console.error("Error:", url.pathname, error);
      return json({ success: false, error: "Error interno del servidor" }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(processReminders(env).catch((e) => console.error("[CRON] Error fatal:", e)));
  }
};
