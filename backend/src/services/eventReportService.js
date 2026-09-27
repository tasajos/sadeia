import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { q, one, pool } from '../config/db.js';
import { EXPORT_DIR } from './reportService.js';
import { recursosDeTareas } from './taskService.js';
import { dec, fmtDate, fmtShort, fmtTime, parseJson } from '../utils/format.js';

/**
 * Informe del evento en PDF (al cerrarlo, o a pedido mientras está en curso): datos del evento,
 * cursos de acción con sus decisiones, tareas con su avance y recursos, recursos comprometidos,
 * reportes ciudadanos vinculados y la cronología de acciones registradas en la bitácora.
 */
const C = { azul: '#0B2545', azul7: '#0F559C', tinta: '#0E1B2C', gris: '#4A5A6E', gris3: '#8394A8', borde: '#D6DFEA', fondo: '#F3F8FD', naranja: '#F7931E' };
const NIVEL = { roja: '#C62828', naranja: '#E8661A', amarilla: '#B8900A', verde: '#2E9E5B' };
const ESTADO = { Completada: '#1E6B3E', Vencida: '#C62828', 'En curso': '#0F559C', Pendiente: '#B85A0E', Aprobada: '#1E6B3E', Modificada: '#B85A0E', Descartada: '#4A5A6E' };
const TIPO_REC = { unidad: 'Unidad', vehiculo: 'Vehículo', equipamiento: 'Equipamiento', personal: 'Personal', material: 'Material' };
const OPERACIONES = {
  REGISTRAR_EVENTO: 'Registro del evento', ACTUALIZAR_EVENTO: 'Actualización de la situación', CERRAR_EVENTO: 'Cierre del evento',
  GENERAR_RECOMENDACIONES: 'Recálculo de recomendaciones', PROPONER_ACCION: 'Acción propuesta', APROBAR_RECOMENDACION: 'Acción aprobada',
  MODIFICAR_RECOMENDACION: 'Acción modificada', DESCARTAR_RECOMENDACION: 'Acción descartada', DESHACER_DECISION: 'Decisión revertida',
  CREAR_TAREA: 'Tarea asignada', EDITAR_TAREA: 'Tarea editada', ACTUALIZAR_TAREA: 'Avance de tarea', MOVILIZAR_RECURSO: 'Recurso movilizado',
  RETORNAR_RECURSO: 'Recurso retornado', ASIGNAR_RECURSO: 'Recurso asignado', LIBERAR_RECURSO: 'Recurso liberado'
};

const duracion = (a, b) => {
  const min = Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  return d ? `${d} d ${h} h` : h ? `${h} h ${min % 60} min` : `${min} min`;
};

async function datos(eventoId) {
  const e = await one(
    `SELECT e.*, am.nombre AS amenaza, a.codigo AS alerta_codigo, ur.nombre AS registrado_por_nombre
       FROM evento e JOIN amenaza am ON am.id = e.amenaza_id LEFT JOIN alerta a ON a.id = e.alerta_id
       LEFT JOIN usuario ur ON ur.id = e.registrado_por WHERE e.id = ?`, [eventoId]
  );
  if (!e) return null;
  const [recs, tareas, recursos, reportes] = await Promise.all([
    q(`SELECT rc.*, u.nombre AS decidido_por_nombre FROM recomendacion rc LEFT JOIN usuario u ON u.id = rc.decidido_por
        WHERE rc.evento_id = ? ORDER BY rc.orden`, [e.id]),
    q(`SELECT t.*, i.sigla, i.nombre AS institucion FROM tarea t JOIN institucion i ON i.id = t.institucion_id
        WHERE t.evento_id = ? ORDER BY i.nombre, t.codigo`, [e.id]),
    q(`SELECT ar.cantidad, ar.estado, ar.fecha, ar.fecha_liberacion, rc.nombre, rc.unidad, i.sigla
         FROM asignacion_recurso ar JOIN recurso rc ON rc.id = ar.recurso_id JOIN institucion i ON i.id = rc.institucion_id
        WHERE ar.evento_id = ? ORDER BY ar.fecha`, [e.id]),
    q(`SELECT codigo, titulo, lugar, prioridad, estado, created_at FROM reporte_ciudadano WHERE evento_id = ? ORDER BY created_at`, [e.id])
  ]);
  const ids = tareas.map((t) => t.id);
  const avances = ids.length ? await q(
    `SELECT a.tarea_id, a.avance, a.observacion, a.fecha, u.nombre AS usuario FROM tarea_avance a JOIN usuario u ON u.id = a.usuario_id
      WHERE a.tarea_id IN (?) ORDER BY a.fecha`, [ids]
  ) : [];
  const movilizados = await recursosDeTareas(ids);
  // Cronología: acciones de la bitácora sobre el evento y sus tareas
  const codigos = [e.codigo, ...tareas.map((t) => t.codigo)];
  const bitacora = await q(
    `SELECT fecha_hora, usuario, operacion, objeto, detalle FROM bitacora
      WHERE operacion <> 'DESCARGAR_INFORME' AND (${codigos.map(() => 'objeto LIKE ?').join(' OR ')}) ORDER BY fecha_hora LIMIT 400`,
    codigos.map((c) => `${c}%`)
  );
  const cierre = bitacora.find((b) => b.operacion === 'CERRAR_EVENTO');
  return { e, recs, tareas, recursos, reportes, avances, movilizados, bitacora, cierre };
}

/** Genera el PDF y lo registra en "Reportes generados". Devuelve la ruta y el nombre del archivo. */
export async function informeEvento(eventoId, usuario) {
  const d = await datos(eventoId);
  if (!d) return null;
  const { e } = d;
  const cerrado = e.estado === 'Cerrado';
  const now = new Date();
  const titulo = `${cerrado ? 'Informe de cierre' : 'Informe de situación'} · ${e.codigo}`;
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const archivo = `informe-${e.codigo.toLowerCase()}-${cerrado ? 'cierre' : 'situacion'}-${Date.now()}.pdf`;
  const file = path.join(EXPORT_DIR, archivo);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 48, bottom: 56, left: 48, right: 48 }, bufferPages: true, info: { Title: `${titulo} · ${e.titulo}`, Author: 'SADE-IA' } });
    const out = fs.createWriteStream(file);
    out.on('finish', resolve);
    out.on('error', reject);
    doc.pipe(out);
    // La fuente estándar (WinAnsi) no tiene flechas ni "≈": se reemplazan para que no salgan símbolos rotos
    const limpiar = (s) => (typeof s === 'string' ? s.replace(/→/g, '->').replace(/≈/g, '~').replace(/[^\u0000-ÿ–—‘’“”•…]/g, '') : s);
    const text = doc.text.bind(doc);
    const heightOfString = doc.heightOfString.bind(doc);
    doc.text = (s, ...a) => text(limpiar(s), ...a);
    doc.heightOfString = (s, ...a) => heightOfString(limpiar(s), ...a);
    const W = doc.page.width - 96;
    const X = 48;
    const bottom = () => doc.page.height - 56;
    const espacio = (h) => { if (doc.y + h > bottom()) doc.addPage(); };

    // ---------- Encabezado ----------
    const eaen = path.resolve('assets/eaen.png');
    const buho = path.resolve('assets/buho.png');
    if (fs.existsSync(eaen)) doc.image(eaen, X, 40, { height: 56 });
    if (fs.existsSync(buho)) doc.image(buho, X + W - 38, 44, { height: 46 });
    doc.fillColor(C.azul).font('Helvetica-Bold').fontSize(17).text('SADE-IA', X + 58, 46);
    doc.font('Helvetica').fontSize(8.5).fillColor(C.gris).text('Sistema de Apoyo a la Decisión para Emergencias', X + 58, 66);
    doc.text('E.A.E.N. "Cnl. Eduardo Avaroa" · Gestión de Riesgos', X + 58, 78);
    doc.moveTo(X, 106).lineTo(X + W, 106).lineWidth(2).strokeColor(C.naranja).stroke();
    doc.y = 118;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.naranja).text(titulo.toUpperCase(), X, doc.y, { characterSpacing: 1 });
    doc.moveDown(0.2).font('Helvetica-Bold').fontSize(18).fillColor(C.tinta).text(e.titulo, { width: W });
    doc.moveDown(0.2).font('Helvetica').fontSize(8.5).fillColor(C.gris)
      .text(`Generado el ${fmtDate(now)} a las ${fmtTime(now)} por ${usuario}`);
    doc.moveDown(0.8);

    // ---------- Datos del evento ----------
    const seccion = (t) => {
      espacio(40);
      doc.moveDown(0.6).font('Helvetica-Bold').fontSize(11.5).fillColor(C.azul).text(t, X, doc.y, { width: W });
      doc.moveTo(X, doc.y + 2).lineTo(X + W, doc.y + 2).lineWidth(0.6).strokeColor(C.borde).stroke();
      doc.moveDown(0.5);
    };
    const campos = [
      ['Código', e.codigo], ['Amenaza', e.amenaza], ['Severidad', e.nivel.toUpperCase()],
      ['Ubicación', `${e.lugar} · ${e.departamento || ''}`], ['Coordenadas', e.lat != null ? `${dec(e.lat, 5)}, ${dec(e.lng, 5)}${e.ubicacion_aprox ? ' (aprox.)' : ''}` : '—'],
      ['Área afectada', e.radio_km ? `radio ${dec(e.radio_km, 1)} km` : '—'], ['Impacto estimado', e.impacto || '—'],
      ['Alerta de origen', e.alerta_codigo || '—'], ['Registrado por', e.registrado_por_nombre || '—'],
      ['Inicio', fmtShort(e.fecha_inicio)], ['Cierre', e.fecha_cierre ? fmtShort(e.fecha_cierre) : 'En curso'],
      ['Duración', duracion(e.fecha_inicio, e.fecha_cierre || now)], ...(d.cierre ? [['Cerrado por', d.cierre.usuario]] : [])
    ];
    seccion('1. Datos del evento');
    const colW = W / 3;
    for (let i = 0; i < campos.length; i += 3) {
      espacio(30);
      const y = doc.y;
      let h = 0;
      campos.slice(i, i + 3).forEach(([k, v], j) => {
        doc.font('Helvetica').fontSize(7.5).fillColor(C.gris3).text(k.toUpperCase(), X + j * colW, y, { width: colW - 10 });
        const color = k === 'Severidad' ? NIVEL[e.nivel] : C.tinta;
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(color).text(String(v), X + j * colW, y + 10, { width: colW - 10 });
        h = Math.max(h, doc.y - y);
      });
      doc.y = y + h + 6;
    }
    const obsCierre = parseJson(d.cierre?.detalle, {})?.observacion;
    if (obsCierre) {
      espacio(40);
      doc.font('Helvetica').fontSize(7.5).fillColor(C.gris3).text('OBSERVACIÓN DE CIERRE', X, doc.y);
      doc.font('Helvetica').fontSize(9.5).fillColor(C.tinta).text(obsCierre, X, doc.y + 2, { width: W });
      doc.moveDown(0.4);
    }

    // ---------- Resumen ----------
    const dec_ = d.recs.reduce((m, r) => ((m[r.estado] = (m[r.estado] || 0) + 1), m), {});
    const hechas = d.tareas.filter((t) => t.estado === 'Completada').length;
    const aTiempo = d.tareas.filter((t) => t.estado === 'Completada' && new Date(t.updated_at) <= new Date(t.plazo)).length;
    const prom = d.tareas.length ? Math.round(d.tareas.reduce((s, t) => s + Number(t.avance), 0) / d.tareas.length) : 0;
    const nMov = Object.values(d.movilizados).reduce((s, l) => s + l.length, 0);
    seccion('2. Resumen de la respuesta');
    const kpis = [
      ['Cursos de acción', `${d.recs.length}`, `${dec_.Aprobada || 0} aprobados · ${dec_.Modificada || 0} modificados · ${dec_.Descartada || 0} descartados`],
      ['Tareas completadas', `${hechas} / ${d.tareas.length}`, `${aTiempo} a plazo · avance promedio ${prom} %`],
      ['Instituciones', `${new Set(d.tareas.map((t) => t.institucion_id)).size}`, 'con tareas asignadas'],
      ['Recursos', `${d.recursos.length + nMov}`, `${d.recursos.length} comprometidos · ${nMov} movilizados`],
      ['Reportes', `${d.reportes.length}`, 'ciudadanos vinculados al evento']
    ];
    espacio(64);
    const kw = W / kpis.length;
    const ky = doc.y;
    kpis.forEach(([l, v, n], i) => {
      const x = X + i * kw;
      doc.roundedRect(x, ky, kw - 6, 58, 4).fillColor(C.fondo).fill();
      doc.font('Helvetica').fontSize(7).fillColor(C.gris).text(l.toUpperCase(), x + 7, ky + 7, { width: kw - 20 });
      doc.font('Helvetica-Bold').fontSize(15).fillColor(C.azul).text(v, x + 7, ky + 18, { width: kw - 20 });
      doc.font('Helvetica').fontSize(6.5).fillColor(C.gris).text(n, x + 7, ky + 38, { width: kw - 16 });
    });
    doc.y = ky + 66;

    // ---------- Tabla genérica ----------
    const tabla = (cols, filas) => {
      const head = () => {
        espacio(22);
        const y = doc.y;
        doc.rect(X, y, W, 16).fillColor(C.azul).fill();
        let x = X;
        cols.forEach((c) => { doc.font('Helvetica-Bold').fontSize(7).fillColor('#FFFFFF').text(c.t, x + 4, y + 5, { width: c.w * W - 8 }); x += c.w * W; });
        doc.y = y + 16;
      };
      head();
      filas.forEach((f, n) => {
        doc.font('Helvetica').fontSize(8);
        const h = Math.max(...cols.map((c, i) => doc.heightOfString(String(f[i] ?? '—'), { width: c.w * W - 8 }))) + 8;
        if (doc.y + h > bottom()) { doc.addPage(); head(); }
        const y = doc.y;
        if (n % 2) doc.rect(X, y, W, h).fillColor(C.fondo).fill();
        let x = X;
        cols.forEach((c, i) => {
          const v = String(f[i] ?? '—');
          doc.font(c.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(c.color ? c.color(v) || C.tinta : C.tinta).text(v, x + 4, y + 4, { width: c.w * W - 8 });
          x += c.w * W;
        });
        doc.y = y + h;
      });
      doc.moveDown(0.4);
    };

    // ---------- Cursos de acción ----------
    seccion('3. Cursos de acción y decisiones');
    if (d.recs.length) {
      tabla(
        [{ t: '#', w: 0.05, bold: true }, { t: 'ACCIÓN', w: 0.4 }, { t: 'INSTITUCIÓN', w: 0.15 }, { t: 'DECISIÓN', w: 0.13, bold: true, color: (v) => ESTADO[v] }, { t: 'DECIDIDO POR', w: 0.27 }],
        d.recs.map((r) => [
          r.orden, r.titulo_modificado ? `${r.titulo_modificado}\n(original: ${r.titulo})` : r.titulo, r.instituciones, r.estado,
          r.decidido_por_nombre ? `${r.decidido_por_nombre} · ${fmtShort(r.fecha_decision)}` : 'Sin decisión'
        ])
      );
    } else doc.font('Helvetica').fontSize(9).fillColor(C.gris).text('No se registraron cursos de acción.');

    // ---------- Tareas ----------
    seccion('4. Tareas ejecutadas por las instituciones');
    if (!d.tareas.length) doc.font('Helvetica').fontSize(9).fillColor(C.gris).text('No se asignaron tareas.');
    d.tareas.forEach((t) => {
      espacio(70);
      const y = doc.y;
      doc.rect(X, y, 3, 30).fillColor(ESTADO[t.estado] || C.gris).fill();
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.tinta).text(`${t.codigo} · ${t.titulo}`, X + 10, y, { width: W - 110 });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(ESTADO[t.estado] || C.gris).text(`${t.estado} · ${t.avance} %`, X + W - 100, y, { width: 100, align: 'right' });
      doc.font('Helvetica').fontSize(8).fillColor(C.gris)
        .text(`${t.institucion} (${t.sigla}) · responsable: ${t.responsable || '—'} · plazo ${fmtShort(t.plazo)}${t.estado === 'Completada' ? ` · completada ${fmtShort(t.updated_at)}` : ''}`, X + 10, doc.y + 2, { width: W - 10 });
      doc.moveDown(0.3);
      const av = d.avances.filter((a) => a.tarea_id === t.id);
      av.forEach((a) => {
        espacio(14);
        doc.font('Helvetica-Bold').fontSize(8).fillColor(C.azul7).text(`${fmtShort(a.fecha)} · ${a.avance} %`, X + 16, doc.y, { continued: true, width: W - 16 });
        doc.font('Helvetica').fillColor(C.tinta).text(`  ${a.usuario}${a.observacion ? ` — ${a.observacion}` : ''}`);
      });
      const mov = d.movilizados[t.id] || [];
      if (mov.length) {
        espacio(14);
        doc.font('Helvetica-Bold').fontSize(8).fillColor(C.gris).text('Recursos movilizados: ', X + 16, doc.y, { continued: true, width: W - 16 });
        doc.font('Helvetica').fillColor(C.tinta).text(mov.map((m) => `${TIPO_REC[m.tipo]} ${['equipamiento', 'material'].includes(m.tipo) ? `${m.cantidad} ${m.unidad || ''} ` : ''}${m.descripcion}`).join(' · '));
      }
      if (!av.length && !mov.length) doc.font('Helvetica-Oblique').fontSize(8).fillColor(C.gris3).text('Sin reportes de avance.', X + 16);
      doc.moveDown(0.6);
    });

    // ---------- Recursos comprometidos ----------
    if (d.recursos.length) {
      seccion('5. Recursos comprometidos por la coordinación');
      tabla(
        [{ t: 'RECURSO', w: 0.4, bold: true }, { t: 'INSTITUCIÓN', w: 0.15 }, { t: 'CANTIDAD', w: 0.15 }, { t: 'ASIGNADO', w: 0.15 }, { t: 'ESTADO', w: 0.15 }],
        d.recursos.map((r) => [r.nombre, r.sigla, `${r.cantidad} ${r.unidad}`, fmtShort(r.fecha), r.estado])
      );
    }

    // ---------- Reportes ciudadanos ----------
    if (d.reportes.length) {
      seccion(`${d.recursos.length ? 6 : 5}. Reportes ciudadanos vinculados`);
      tabla(
        [{ t: 'CÓDIGO', w: 0.16, bold: true }, { t: 'REPORTE', w: 0.4 }, { t: 'PRIORIDAD', w: 0.14 }, { t: 'ESTADO', w: 0.15 }, { t: 'RECIBIDO', w: 0.15 }],
        d.reportes.map((r) => [r.codigo, `${r.titulo}${r.lugar ? `\n${r.lugar}` : ''}`, r.prioridad, r.estado, fmtShort(r.created_at)])
      );
    }

    // ---------- Cronología ----------
    seccion('Cronología de acciones (bitácora)');
    if (d.bitacora.length) {
      tabla(
        [{ t: 'FECHA Y HORA', w: 0.18 }, { t: 'USUARIO', w: 0.14, bold: true }, { t: 'ACCIÓN', w: 0.25 }, { t: 'DETALLE', w: 0.43 }],
        d.bitacora.map((b) => [fmtShort(b.fecha_hora), b.usuario, OPERACIONES[b.operacion] || b.operacion, b.objeto])
      );
    } else doc.font('Helvetica').fontSize(9).fillColor(C.gris).text('Sin registros.');

    // ---------- Pie de página ----------
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // el pie va dentro del margen: sin esto pdfkit agrega páginas en blanco
      const yb = doc.page.height - 40;
      doc.moveTo(X, yb - 6).lineTo(X + W, yb - 6).lineWidth(0.5).strokeColor(C.borde).stroke();
      doc.font('Helvetica').fontSize(7).fillColor(C.gris3)
        .text(`SADE-IA · ${titulo} · documento generado automáticamente a partir de los registros del sistema`, X, yb, { width: W - 60, lineBreak: false });
      doc.text(`Página ${i + 1} de ${range.count}`, X + W - 60, yb, { width: 60, align: 'right', lineBreak: false });
    }
    doc.end();
  });

  await pool.query('INSERT INTO reporte_generado (nombre, formato, archivo, generado_por) VALUES (?,?,?,?)',
    [`${titulo} · ${e.titulo}`.slice(0, 200), 'PDF', archivo, usuario]);
  return { file, archivo };
}

/** Último informe de cierre generado para un evento (se genera al cerrarlo). */
export async function informeCierreGuardado(codigo) {
  const g = await one("SELECT archivo FROM reporte_generado WHERE archivo LIKE ? ORDER BY id DESC LIMIT 1", [`informe-${codigo.toLowerCase()}-cierre-%`]);
  const file = g ? path.join(EXPORT_DIR, path.basename(g.archivo)) : null;
  return file && fs.existsSync(file) ? { file, archivo: g.archivo } : null;
}
