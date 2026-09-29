var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var MESES_REVISION = {
  "1": 4,
  // 1 -> Abril
  "2": 5,
  // 2 -> Mayo
  "3": 6,
  // 3 -> Junio
  "4": 7,
  // 4 -> Julio
  "5": 8,
  // 5 -> Agosto
  "6": 9,
  // 6 -> Septiembre
  "7": 10,
  // 7 -> Octubre
  "8": 11,
  // 8 -> Noviembre
  "9": 1,
  // 9 -> Enero
  "0": 2
  // 0 -> Febrero
};
var MESES_NOMBRES = [
  "",
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre"
];
var ETAPAS_RECORDATORIO = [
  { dias: 30, etiqueta: "30d" },
  { dias: 15, etiqueta: "15d" },
  { dias: 7, etiqueta: "7d" }
];
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}
__name(jsonResponse, "jsonResponse");
__name2(jsonResponse, "jsonResponse");
function corsResponse(body, init) {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    headers.set(k, v);
  }
  return new Response(body, { ...init, headers });
}
__name(corsResponse, "corsResponse");
__name2(corsResponse, "corsResponse");
function calcularMesRevision(ultimoChar) {
  const c = ultimoChar.toUpperCase().trim();
  return MESES_REVISION[c] ?? null;
}
__name(calcularMesRevision, "calcularMesRevision");
__name2(calcularMesRevision, "calcularMesRevision");
function sanitizarTelefono(tel) {
  return tel.replace(/[\s\-\+\(\)\.]/g, "");
}
__name(sanitizarTelefono, "sanitizarTelefono");
__name2(sanitizarTelefono, "sanitizarTelefono");
function sanitizarPatente(pat) {
  return pat.toUpperCase().replace(/[\s\.\-·\-]/g, "");
}
__name(sanitizarPatente, "sanitizarPatente");
__name2(sanitizarPatente, "sanitizarPatente");
function getChileTime() {
  const now = /* @__PURE__ */ new Date();
  return new Date(now.getTime() - 4 * 60 * 60 * 1e3);
}
__name(getChileTime, "getChileTime");
__name2(getChileTime, "getChileTime");
function etapaKey(etiqueta, year) {
  return `${etiqueta}|${year}`;
}
__name(etapaKey, "etapaKey");
__name2(etapaKey, "etapaKey");
function etapaEnviada(ultimoAviso, etiqueta, year) {
  if (!ultimoAviso) return false;
  if (ultimoAviso.includes(etiqueta + "|" + year)) return true;
  if (/^\d{2}-\d{4}$/.test(ultimoAviso)) return true;
  return false;
}
__name(etapaEnviada, "etapaEnviada");
__name2(etapaEnviada, "etapaEnviada");
function agregarEtapa(ultimoAviso, etiqueta, year) {
  const key = etapaKey(etiqueta, year);
  if (!ultimoAviso || ultimoAviso === "") return key;
  if (/^\d{2}-\d{4}$/.test(ultimoAviso)) return key;
  return ultimoAviso + "," + key;
}
__name(agregarEtapa, "agregarEtapa");
__name2(agregarEtapa, "agregarEtapa");
function proximaFechaRevision(mesRevision, chileTime) {
  const currentYear = chileTime.getUTCFullYear();
  let revisionDate = new Date(Date.UTC(currentYear, mesRevision - 1, 1));
  if (revisionDate.getTime() <= chileTime.getTime()) {
    revisionDate = new Date(Date.UTC(currentYear + 1, mesRevision - 1, 1));
  }
  return { fecha: revisionDate, year: revisionDate.getUTCFullYear() };
}
__name(proximaFechaRevision, "proximaFechaRevision");
__name2(proximaFechaRevision, "proximaFechaRevision");
function enmascararTelefono(tel) {
  if (tel.length < 5) return "****";
  return "****" + tel.slice(-4);
}
__name(enmascararTelefono, "enmascararTelefono");
__name2(enmascararTelefono, "enmascararTelefono");
async function sendWhatsApp(telefono, mensaje, env) {
  try {
    const phone = sanitizarTelefono(telefono);
    if (phone.length < 11) {
      return { success: false, error: "Telefono invalido" };
    }
    const params = new URLSearchParams({
      token: env.ULTRAMSG_TOKEN,
      to: phone,
      body: mensaje,
      priority: "10"
    });
    const response = await fetch(
      `https://api.ultramsg.com/${env.ULTRAMSG_INSTANCE}/messages/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
      }
    );
    const data = await response.json();
    if (data.status === "success") {
      return { success: true };
    }
    console.error("UltraMsg error:", data);
    return { success: false, error: data.message || "Error desconocido" };
  } catch (error) {
    console.error("Error WhatsApp:", error);
    return { success: false, error: "Error de conexion" };
  }
}
__name(sendWhatsApp, "sendWhatsApp");
__name2(sendWhatsApp, "sendWhatsApp");
async function handleSaveLead(request, env) {
  try {
    const body = await request.json();
    const { telefono, patente, mes_manual } = body;
    if (!telefono || !patente) {
      return jsonResponse(
        { success: false, error: "Telefono y patente son requeridos" },
        400
      );
    }
    const patenteClean = sanitizarPatente(patente);
    if (patenteClean.length < 5) {
      return jsonResponse(
        { success: false, error: "Patente invalida (minimo 5 caracteres)" },
        400
      );
    }
    const telefonoClean = sanitizarTelefono(telefono);
    if (telefonoClean.length < 11) {
      return jsonResponse(
        { success: false, error: "Telefono invalido (ej: +56912345678)" },
        400
      );
    }
    const ultimoChar = patenteClean.charAt(patenteClean.length - 1);
    let mesRevision;
    let esManual = 0;
    if (mes_manual && mes_manual >= 1 && mes_manual <= 12) {
      mesRevision = mes_manual;
      esManual = 1;
    } else {
      const autoMes = calcularMesRevision(ultimoChar);
      if (!autoMes) {
        return jsonResponse({
          success: false,
          error: "No se pudo calcular el mes automaticamente. El ultimo caracter '" + ultimoChar + "' no es un digito valido. Selecciona el mes manualmente.",
          ultimo_caracter: ultimoChar,
          necesita_manual: true
        }, 400);
      }
      mesRevision = autoMes;
      esManual = 0;
    }
    const existente = await env.DB.prepare(
      "SELECT id, telefono, mes_revision, activo FROM recordatorios_revision WHERE patente = ? AND activo = 1"
    ).bind(patenteClean).first();
    let esNuevo = true;
    if (existente) {
      esNuevo = false;
      if (existente.telefono === telefonoClean) {
        await env.DB.prepare(
          `UPDATE recordatorios_revision 
		     SET mes_revision = ?, es_manual = ?, ultimo_caracter = ?, activo = 1, ultimo_aviso_enviado = ''
		     WHERE id = ?`
        ).bind(mesRevision, esManual, ultimoChar, existente.id).run();
      } else {
        try {
          await env.DB.prepare(
            `INSERT INTO recordatorios_revision 
		   (telefono, patente, ultimo_caracter, mes_revision, es_manual, fecha_registro, ultimo_aviso_enviado, activo)
		   VALUES (?, ?, ?, ?, ?, datetime('now', '-4 hours'), '', 1)`
          ).bind(telefonoClean, patenteClean, ultimoChar, mesRevision, esManual).run();
          esNuevo = true;
        } catch (e) {
          if (e.message && e.message.includes("UNIQUE")) {
            await env.DB.prepare(
              `UPDATE recordatorios_revision 
		     SET mes_revision = ?, es_manual = ?, ultimo_caracter = ?, activo = 1, ultimo_aviso_enviado = ''
		     WHERE patente = ? AND telefono = ?`
            ).bind(mesRevision, esManual, ultimoChar, patenteClean, telefonoClean).run();
          } else {
            throw e;
          }
        }
      }
    } else {
      try {
        await env.DB.prepare(
          `INSERT INTO recordatorios_revision 
       (telefono, patente, ultimo_caracter, mes_revision, es_manual, fecha_registro, ultimo_aviso_enviado, activo)
       VALUES (?, ?, ?, ?, ?, datetime('now', '-4 hours'), '', 1)`
        ).bind(telefonoClean, patenteClean, ultimoChar, mesRevision, esManual).run();
      } catch (e) {
        if (e.message && e.message.includes("UNIQUE")) {
          await env.DB.prepare(
            `UPDATE recordatorios_revision 
       SET mes_revision = ?, es_manual = ?, ultimo_caracter = ?, activo = 1, ultimo_aviso_enviado = ''
       WHERE patente = ? AND telefono = ?`
          ).bind(mesRevision, esManual, ultimoChar, patenteClean, telefonoClean).run();
          esNuevo = false;
        } else {
          throw e;
        }
      }
    }
    const msgBienvenida = "\xA1Hola! \u{1F697} Te has registrado en Global Pro Automotriz.\n\nTe recordaremos con avisos a *30 d\xEDas*, *15 d\xEDas* y *7 d\xEDas* antes de tu revisi\xF3n t\xE9cnica (patente " + patenteClean + ", mes de " + MESES_NOMBRES[mesRevision] + ").\n\nSi necesitas un mec\xE1nico a domicilio, \xA1escr\xEDbenos! \u{1F4F2}\nWhatsApp: +56 9 390 26185\nWeb: mecanico247.com";
    await sendWhatsApp(telefonoClean, msgBienvenida, env);
    return jsonResponse({
      success: true,
      patente: patenteClean,
      telefono: telefonoClean,
      mes_revision: mesRevision,
      nombre_mes: MESES_NOMBRES[mesRevision],
      es_manual: esManual === 1,
      es_nuevo: esNuevo,
      ya_registrado: !esNuevo && existente !== null,
      telefono_existente: existente ? enmascararTelefono(existente.telefono) : null,
      mensaje: esNuevo ? "\xA1Registrado! Recibir\xE1s 3 avisos por WhatsApp (30, 15 y 7 d\xEDas antes)." : "\xA1Actualizado! Ya estabas registrado. Recibir\xE1s 3 avisos (30, 15 y 7 d\xEDas antes)."
    });
  } catch (error) {
    console.error("Error en save-lead:", error);
    return jsonResponse({ success: false, error: "Error interno del servidor" }, 500);
  }
}
__name(handleSaveLead, "handleSaveLead");
__name2(handleSaveLead, "handleSaveLead");
async function handleUnsubscribe(request, env) {
  try {
    const body = await request.json();
    const { telefono, patente } = body;
    if (!telefono) {
      return jsonResponse({ success: false, error: "Telefono requerido" }, 400);
    }
    const telefonoClean = sanitizarTelefono(telefono);
    const patenteClean = patente ? sanitizarPatente(patente) : null;
    if (patenteClean) {
      await env.DB.prepare(
        "UPDATE recordatorios_revision SET activo = 0 WHERE telefono = ? AND patente = ?"
      ).bind(telefonoClean, patenteClean).run();
    } else {
      await env.DB.prepare(
        "UPDATE recordatorios_revision SET activo = 0 WHERE telefono = ?"
      ).bind(telefonoClean).run();
    }
    return jsonResponse({
      success: true,
      mensaje: "Has sido dado de baja. No recibir\xE1s m\xE1s recordatorios."
    });
  } catch (error) {
    console.error("Error en unsubscribe:", error);
    return jsonResponse({ success: false, error: "Error interno" }, 500);
  }
}
__name(handleUnsubscribe, "handleUnsubscribe");
__name2(handleUnsubscribe, "handleUnsubscribe");
async function handleCheck(url, env) {
  try {
    const patente = url.searchParams.get("patente");
    if (!patente) {
      return jsonResponse({ success: false, error: "Parametro 'patente' requerido" }, 400);
    }
    const patenteClean = sanitizarPatente(patente);
    const ultimoChar = patenteClean.charAt(patenteClean.length - 1);
    const mesAuto = calcularMesRevision(ultimoChar);
    let registro = null;
    try {
      const existing = await env.DB.prepare(
        "SELECT id, telefono, mes_revision, es_manual, fecha_registro, activo FROM recordatorios_revision WHERE patente = ? AND activo = 1"
      ).bind(patenteClean).first();
      if (existing) {
        registro = {
          encontrado: true,
          telefono: enmascararTelefono(existing.telefono),
          mes_revision: existing.mes_revision,
          nombre_mes: MESES_NOMBRES[existing.mes_revision],
          es_manual: existing.es_manual === 1,
          fecha_registro: existing.fecha_registro
        };
      }
    } catch {
    }
    return jsonResponse({
      success: true,
      patente: patenteClean,
      ultimo_caracter: ultimoChar,
      mes_revision: mesAuto,
      nombre_mes: mesAuto ? MESES_NOMBRES[mesAuto] : null,
      es_auto: mesAuto !== null,
      necesita_manual: mesAuto === null,
      registrado: registro?.encontrado ?? false,
      registro
    });
  } catch (error) {
    return jsonResponse({ success: false, error: "Error interno" }, 500);
  }
}
__name(handleCheck, "handleCheck");
__name2(handleCheck, "handleCheck");
async function handleTriggerReminders(url, env) {
  const secret = url.searchParams.get("secret");
  if (secret !== env.CRON_SECRET) {
    return jsonResponse({ success: false, error: "No autorizado" }, 403);
  }
  const result = await processReminders(env);
  return jsonResponse({ success: true, ...result });
}
__name(handleTriggerReminders, "handleTriggerReminders");
__name2(handleTriggerReminders, "handleTriggerReminders");
async function processReminders(env) {
  const chileTime = getChileTime();
  const currentMonth = chileTime.getUTCMonth() + 1;
  const currentYear = chileTime.getUTCFullYear();
  console.log(
    `[CRON] Procesando recordatorios - ${chileTime.toISOString()} Chile approx`
  );
  const { results } = await env.DB.prepare(
    "SELECT * FROM recordatorios_revision WHERE activo = 1"
  ).all();
  const leads = results;
  let sent = 0;
  let errors = 0;
  const detalles = [];
  for (const lead of leads) {
    const { fecha: revisionDate, year: revisionYear } = proximaFechaRevision(
      lead.mes_revision,
      chileTime
    );
    const diffMs = revisionDate.getTime() - chileTime.getTime();
    const diasRestantes = Math.ceil(diffMs / (1e3 * 60 * 60 * 24));
    let etapaActual = null;
    if (diasRestantes <= 30 && diasRestantes > 15) {
      etapaActual = ETAPAS_RECORDATORIO.find((e) => e.etiqueta === "30d") || null;
    } else if (diasRestantes <= 15 && diasRestantes > 7) {
      etapaActual = ETAPAS_RECORDATORIO.find((e) => e.etiqueta === "15d") || null;
    } else if (diasRestantes <= 7 && diasRestantes >= 0) {
      etapaActual = ETAPAS_RECORDATORIO.find((e) => e.etiqueta === "7d") || null;
    }
    if (!etapaActual && diasRestantes <= 30 && diasRestantes >= 0) {
      for (const etapa of ETAPAS_RECORDATORIO) {
        if (!etapaEnviada(lead.ultimo_aviso_enviado, etapa.etiqueta, revisionYear)) {
          if (diasRestantes <= etapa.dias) {
            etapaActual = etapa;
            break;
          }
        }
      }
    }
    if (!etapaActual) continue;
    if (etapaEnviada(lead.ultimo_aviso_enviado, etapaActual.etiqueta, revisionYear)) {
      continue;
    }
    const mensaje = generarMensajeRecordatorio(
      lead.patente,
      MESES_NOMBRES[lead.mes_revision],
      revisionYear,
      diasRestantes,
      etapaActual.etiqueta
    );
    const result = await sendWhatsApp(lead.telefono, mensaje, env);
    if (result.success) {
      const nuevoTracking = agregarEtapa(
        lead.ultimo_aviso_enviado,
        etapaActual.etiqueta,
        revisionYear
      );
      await env.DB.prepare(
        "UPDATE recordatorios_revision SET ultimo_aviso_enviado = ? WHERE id = ?"
      ).bind(nuevoTracking, lead.id).run();
      sent++;
      detalles.push(`${lead.patente}: ${etapaActual.etiqueta} enviada (${diasRestantes}d restantes)`);
    } else {
      console.error(
        `[CRON] Error enviando a ${lead.telefono}: ${result.error}`
      );
      errors++;
    }
    await new Promise((resolve) => setTimeout(resolve, 1e3));
  }
  console.log(
    `[CRON] Resultado: ${sent} enviados, ${errors} errores, ${leads.length} total procesados`
  );
  return { sent, errors, total: leads.length, detalles };
}
__name(processReminders, "processReminders");
__name2(processReminders, "processReminders");
function generarMensajeRecordatorio(patente, nombreMes, year, diasRestantes, etiqueta) {
  const baseInfo = `patente ${patente}, revision en ${nombreMes} ${year}`;
  let urgencia = "";
  let emoji = "\u{1F697}";
  switch (etiqueta) {
    case "30d":
      urgencia = `Faltan aproximadamente *${diasRestantes} d\xEDas* para el inicio de tu mes de revisi\xF3n t\xE9cnica.`;
      emoji = "\u{1F4C5}";
      break;
    case "15d":
      urgencia = `\u23F0 *\xA1Solo faltan ${diasRestantes} d\xEDas*! Se acerca tu mes de revisi\xF3n t\xE9cnica.`;
      emoji = "\u26A0\uFE0F";
      break;
    case "7d":
      urgencia = `\u{1F534} *\xA1URGENTE! Faltan solo ${diasRestantes} d\xEDas* para tu revisi\xF3n t\xE9cnica.`;
      emoji = "\u{1F6A8}";
      break;
  }
  return `${emoji} *Recordatorio de Global Pro Automotriz*

${urgencia}

Veh\xEDculo: *${baseInfo}*

\xBFTe gustar\xEDa agendar una revisi\xF3n preventiva a domicilio para ir a la segura?

Responde a este mensaje o escr\xEDbenos al +56 9 390 26185 \u{1F4F2}
Web: mecanico247.com`;
}
__name(generarMensajeRecordatorio, "generarMensajeRecordatorio");
__name2(generarMensajeRecordatorio, "generarMensajeRecordatorio");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return corsResponse(null, { status: 204 });
    }
    if (url.pathname === "/api/save-lead" && request.method === "POST") {
      return handleSaveLead(request, env);
    }
    if (url.pathname === "/api/unsubscribe" && request.method === "POST") {
      return handleUnsubscribe(request, env);
    }
    if (url.pathname === "/api/check" && request.method === "GET") {
      return handleCheck(url, env);
    }
    if (url.pathname === "/api/trigger" && request.method === "GET") {
      return handleTriggerReminders(url, env);
    }
    if (url.pathname === "/api/stats") {
      try {
        const total = await env.DB.prepare(
          "SELECT COUNT(*) as count FROM recordatorios_revision WHERE activo = 1"
        ).first();
        const esteMes = await env.DB.prepare(
          "SELECT COUNT(*) as count FROM recordatorios_revision WHERE mes_revision = ? AND activo = 1"
        ).bind((/* @__PURE__ */ new Date()).getMonth() + 1).first();
        return jsonResponse({
          success: true,
          total_registrados: total?.count || 0,
          revisan_este_mes: esteMes?.count || 0
        });
      } catch {
        return jsonResponse({ success: true, total_registrados: 0, revisan_este_mes: 0 });
      }
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SGC Recordatorios - API</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e8e8e8; padding: 2rem; line-height: 1.6; }
  .container { max-width: 800px; margin: 0 auto; }
  h1 { color: #22c55e; border-bottom: 2px solid #22c55e; padding-bottom: 0.5rem; }
  h2 { color: #16a34a; margin-top: 2rem; }
  .endpoint { background: #1a1a1a; border-left: 3px solid #22c55e; padding: 1rem; margin: 0.5rem 0; border-radius: 4px; }
  .method { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; margin-right: 8px; }
  .GET { background: #16a34a; color: #fff; }
  .POST { background: #2563eb; color: #fff; }
  code { background: #2a2a2a; padding: 2px 6px; border-radius: 3px; font-size: 0.9rem; color: #4ade80; }
  .note { background: #1e3a5f; padding: 1rem; border-radius: 4px; margin-top: 1rem; }
</style>
</head>
<body>
<div class="container">
  <h1>SGC Recordatorios</h1>
  <p>Worker API para gesti\xF3n de recordatorios de revisi\xF3n vehicular.</p>
  
  <h2>Endpoints disponibles</h2>
  
  <div class="endpoint">
    <span class="method POST">POST</span><code>/api/save-lead</code>
    <p>Guarda un nuevo lead (tel\xE9fono + patente) para recordatorios.</p>
  </div>
  
  <div class="endpoint">
    <span class="method GET">GET</span><code>/api/check?patente=XXXX</code>
    <p>Verifica si una patente tiene recordatorio activo.</p>
  </div>
  
  <div class="endpoint">
    <span class="method GET">GET</span><code>/api/stats</code>
    <p>Estad\xEDsticas: total registrados y revisan este mes.</p>
  </div>
  
  <div class="endpoint">
    <span class="method GET">GET</span><code>/api/trigger</code>
    <p>Dispara manualmente el env\xEDo de recordatorios (requiere header x-cron-secret).</p>
  </div>
  
  <div class="note">
    <strong>\u{1F4A1} Nota:</strong> Este worker tambi\xE9n se ejecuta autom\xE1ticamente v\xEDa Cron Trigger 
    para enviar recordatorios 30, 15 y 7 d\xEDas antes del mes de revisi\xF3n.
  </div>
  
  <p style="margin-top: 2rem; color: #888; font-size: 0.85rem;">
    Worker: sgc-recordatorios \xB7 D1: citas \xB7 Tabla: sgc_rec_recordatorios_revision
  </p>
</div>
</body>
</html>`;
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", ...CORS_HEADERS }
      });
    }
    return corsResponse("Not Found", { status: 404 });
  },
  async scheduled(event, env) {
    console.log("[CRON] Ejecutando recordatorios programados (30d/15d/7d)...");
    try {
      const result = await processReminders(env);
      console.log(`[CRON] Completado: ${JSON.stringify(result)}`);
    } catch (error) {
      console.error("[CRON] Error fatal:", error);
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
