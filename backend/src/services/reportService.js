import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { q, one, pool } from '../config/db.js';
import { env } from '../config/env.js';
import { dec, fmtDate, fmtShort } from '../utils/format.js';

export const EXPORT_DIR = path.resolve(env.uploadDir, '..', 'exports');

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Indicadores de oportunidad y desempeño de la respuesta (RF-13). */
export async function indicadores() {
  const pe = await one(
    `SELECT AVG(TIMESTAMPDIFF(SECOND, created_at, fecha_validacion))/60 AS m FROM alerta
      WHERE fecha_validacion IS NOT NULL AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')`
  );
  const en = await one(
    `SELECT AVG(TIMESTAMPDIFF(SECOND, a.fecha_validacion, n.primera))/60 AS m FROM alerta a
       JOIN (SELECT alerta_id, MIN(fecha_envio) AS primera FROM alerta_notificacion WHERE fecha_envio IS NOT NULL GROUP BY alerta_id) n
         ON n.alerta_id = a.id
      WHERE a.fecha_validacion IS NOT NULL`
  );
  const t = await one(
    `SELECT SUM(estado = 'Completada' AND updated_at <= plazo) AS ok, SUM(estado IN ('Completada','Vencida')) AS total FROM tarea`
  );
  const v = await one(
    `SELECT SUM(estado IN ('Validada y notificada','Notificada','Cerrada')) AS val, SUM(estado = 'Descartada') AS des FROM alerta`
  );
  const mesLabel = MESES_L[new Date().getMonth()];
  const val = Number(v.val) || 0;
  const des = Number(v.des) || 0;
  const pctVal = val + des ? Math.round((val / (val + des)) * 100) : 0;
  return [
    { clave: 'pred_emision', label: 'Predicción → emisión', value: pe.m != null ? `${Math.round(pe.m)} min` : '—', note: `media ${mesLabel}` },
    { clave: 'emision_notif', label: 'Emisión → notificación', value: en.m != null ? `${Math.max(0, Math.round(en.m))} min` : '—', note: 'antes: hasta 6 h en cadena' },
    { clave: 'tareas_plazo', label: 'Tareas cumplidas a plazo', value: Number(t.total) ? `${Math.round((Number(t.ok) / Number(t.total)) * 100)} %` : '—', note: `${Number(t.ok) || 0} de ${Number(t.total) || 0}` },
    { clave: 'alertas_validadas', label: 'Alertas validadas', value: `${pctVal} %`, note: `${100 - pctVal} % descartadas con sustento` }
  ];
}

/** Alertas emitidas por mes y nivel (últimos 6 meses). */
export async function alertasPorMes() {
  const rows = await q(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS ym, nivel, COUNT(*) AS n FROM alerta
      WHERE created_at >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL 5 MONTH) AND estado <> 'Descartada'
      GROUP BY ym, nivel`
  );
  const out = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const g = (lv) => Number(rows.find((r) => r.ym === ym && r.nivel === lv)?.n || 0);
    out.push({ ym, name: MESES[d.getMonth()], amarilla: g('amarilla'), naranja: g('naranja'), roja: g('roja') });
  }
  return out;
}

async function datosConsolidado() {
  const alertas = await q(
    `SELECT a.codigo, am.nombre AS amenaza, a.lugar, a.nivel, a.probabilidad, a.horizonte, a.estado, a.created_at,
            a.fecha_validacion, u.username AS validado_por
       FROM alerta a JOIN amenaza am ON am.id = a.amenaza_id LEFT JOIN usuario u ON u.id = a.validado_por
      WHERE a.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01') ORDER BY a.created_at DESC`
  );
  const eventos = await q(
    `SELECT e.codigo, e.titulo, e.nivel, e.fecha_inicio, e.impacto, e.estado,
            (SELECT COUNT(*) FROM tarea t WHERE t.evento_id = e.id) AS tareas,
            (SELECT COUNT(*) FROM tarea t WHERE t.evento_id = e.id AND t.estado = 'Completada') AS completadas
       FROM evento e WHERE e.estado = 'En curso' OR e.fecha_inicio >= DATE_FORMAT(NOW(), '%Y-%m-01') ORDER BY e.fecha_inicio DESC`
  );
  return { alertas, eventos, indicadores: await indicadores() };
}

/**
 * Genera el consolidado mensual en PDF, XLSX o CSV y lo registra.
 * @returns {{archivo:string, nombre:string, mime:string}}
 */
export async function exportarConsolidado(formato, usuario) {
  const f = String(formato).toUpperCase();
  if (!['PDF', 'XLSX', 'CSV'].includes(f)) throw new Error('Formato no soportado');
  const now = new Date();
  const titulo = `Consolidado mensual de alertas y eventos · ${MESES_L[now.getMonth()]} ${now.getFullYear()}`;
  const dir = EXPORT_DIR; // fuera de /uploads: solo se descarga con sesión
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `consolidado-${now.toISOString().slice(0, 10)}-${Date.now()}.${f.toLowerCase()}`);
  const d = await datosConsolidado();

  if (f === 'CSV') {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Código', 'Amenaza', 'Lugar', 'Nivel', 'Probabilidad', 'Horizonte', 'Estado', 'Creada', 'Validada por'].map(esc).join(';')];
    d.alertas.forEach((a) =>
      lines.push([a.codigo, a.amenaza, a.lugar, a.nivel.toUpperCase(), dec(a.probabilidad), a.horizonte, a.estado, fmtShort(a.created_at), a.validado_por || ''].map(esc).join(';'))
    );
    fs.writeFileSync(file, '﻿' + lines.join('\r\n'));
  }

  if (f === 'XLSX') {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SADE-IA';
    const head = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B2545' } } };
    const s1 = wb.addWorksheet('Indicadores');
    s1.addRow([titulo]).font = { bold: true, size: 14 };
    s1.addRow([]);
    s1.addRow(['Indicador', 'Valor', 'Nota']).eachCell((c) => Object.assign(c, head));
    d.indicadores.forEach((i) => s1.addRow([i.label, i.value, i.note]));
    s1.columns = [{ width: 34 }, { width: 14 }, { width: 36 }];
    const s2 = wb.addWorksheet('Alertas');
    s2.addRow(['Código', 'Amenaza', 'Lugar', 'Nivel', 'Probabilidad', 'Horizonte', 'Estado', 'Creada', 'Validada por']).eachCell((c) => Object.assign(c, head));
    d.alertas.forEach((a) => s2.addRow([a.codigo, a.amenaza, a.lugar, a.nivel.toUpperCase(), Number(a.probabilidad), a.horizonte, a.estado, a.created_at, a.validado_por || '']));
    s2.columns = [18, 18, 34, 10, 12, 10, 24, 18, 14].map((w) => ({ width: w }));
    s2.getColumn(5).numFmt = '0.00';
    s2.getColumn(8).numFmt = 'dd/mm/yyyy hh:mm';
    const s3 = wb.addWorksheet('Eventos');
    s3.addRow(['Código', 'Evento', 'Nivel', 'Inicio', 'Impacto', 'Estado', 'Tareas', 'Completadas']).eachCell((c) => Object.assign(c, head));
    d.eventos.forEach((e) => s3.addRow([e.codigo, e.titulo, e.nivel.toUpperCase(), e.fecha_inicio, e.impacto, e.estado, e.tareas, e.completadas]));
    s3.columns = [16, 40, 10, 18, 30, 12, 10, 12].map((w) => ({ width: w }));
    s3.getColumn(4).numFmt = 'dd/mm/yyyy hh:mm';
    await wb.xlsx.writeFile(file);
  }

  if (f === 'PDF') {
    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'LETTER', margin: 48, info: { Title: titulo, Author: 'SADE-IA' } });
      const out = fs.createWriteStream(file);
      out.on('finish', resolve);
      out.on('error', reject);
      doc.pipe(out);
      const logo = path.resolve('assets/buho.png');
      if (fs.existsSync(logo)) doc.image(logo, 48, 40, { height: 36 });
      doc.fillColor('#0B2545').fontSize(18).font('Helvetica-Bold').text('SADE-IA', 96, 44);
      doc.fontSize(9).font('Helvetica').fillColor('#4A5A6E').text('Sistema de Apoyo a la Decisión para Emergencias', 96, 66);
      doc.moveDown(2).fillColor('#0E1B2C').fontSize(14).font('Helvetica-Bold').text(titulo, 48);
      doc.fontSize(9).font('Helvetica').fillColor('#4A5A6E').text(`Generado ${fmtDate(now)} ${now.toTimeString().slice(0, 5)} · ${usuario}`);
      doc.moveDown();
      doc.fontSize(12).fillColor('#0B2545').font('Helvetica-Bold').text('Indicadores de oportunidad');
      doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor('#0E1B2C');
      d.indicadores.forEach((i) => doc.text(`• ${i.label}: ${i.value}  (${i.note})`));
      doc.moveDown();
      doc.fontSize(12).fillColor('#0B2545').font('Helvetica-Bold').text(`Alertas del mes (${d.alertas.length})`);
      doc.moveDown(0.3).fontSize(9).font('Helvetica').fillColor('#0E1B2C');
      const COL = { roja: '#C62828', naranja: '#E8661A', amarilla: '#B8900A', verde: '#2E9E5B' };
      d.alertas.forEach((a) => {
        doc.fillColor(COL[a.nivel] || '#0E1B2C').font('Helvetica-Bold').text(`${a.codigo} · ${a.nivel.toUpperCase()}`, { continued: true });
        doc.fillColor('#0E1B2C').font('Helvetica').text(`  ${a.amenaza} · ${a.lugar} · prob. ${dec(a.probabilidad)} · ${a.estado} · ${fmtShort(a.created_at)}`);
      });
      doc.moveDown();
      doc.fontSize(12).fillColor('#0B2545').font('Helvetica-Bold').text(`Eventos (${d.eventos.length})`);
      doc.moveDown(0.3).fontSize(9).font('Helvetica').fillColor('#0E1B2C');
      d.eventos.forEach((e) => doc.text(`${e.codigo} · ${e.titulo} · ${e.nivel.toUpperCase()} · desde ${fmtShort(e.fecha_inicio)} · ${e.impacto || ''} · tareas ${e.completadas}/${e.tareas}`));
      doc.end();
    });
  }

  const nombre = `${titulo}`;
  await pool.query('INSERT INTO reporte_generado (nombre, formato, archivo, generado_por) VALUES (?,?,?,?)', [
    nombre, f, path.basename(file), usuario
  ]);
  const mime = { PDF: 'application/pdf', CSV: 'text/csv; charset=utf-8', XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }[f];
  return { archivo: file, nombre: path.basename(file), mime };
}
