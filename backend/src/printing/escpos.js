// Traduce un ticket (bloques de shared/tickets.js) a bytes ESC/POS para la 3nstar RPT004.
// 80 mm · 576 puntos por línea · fuente A de 12 puntos = 48 columnas.
import { rowLines, wrap } from '../../../shared/tickets.js';

const ESC = 0x1b;
const GS = 0x1d;
const FS = 0x1c;
export const CMD = {
  init: [ESC, 0x40],
  codepage850: [ESC, 0x74, 2], // PC850: acentos, ñ, ¿ ¡
  alignLeft: [ESC, 0x61, 0],
  alignCenter: [ESC, 0x61, 1],
  boldOn: [ESC, 0x45, 1],
  boldOff: [ESC, 0x45, 0],
  sizeNormal: [GS, 0x21, 0x00],
  sizeTall: [GS, 0x21, 0x01], // doble alto: mismas columnas, más fácil de leer en cocina
  sizeDouble: [GS, 0x21, 0x11], // doble alto y ancho: títulos
  cut: [GS, 0x56, 0x42, 0x03], // avanza el papel y corta (corte parcial)
  drawer: [ESC, 0x70, 0x00, 0x19, 0xfa], // pulso a la gaveta (pin 2)
  logo: [FS, 0x70, 0x01, 0x00], // logo guardado en la memoria de la impresora (posición 1)
  lf: [0x0a],
};

// Mitad alta de la página de códigos 850 (0x80-0xFF)
const CP850_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´\u00ad±‗¾¶§÷¸°¨·¹³²■\u00a0';
const TO_850 = new Map([...CP850_HIGH].map((ch, i) => [ch, 0x80 + i]));
// Caracteres que no existen en PC850 y su equivalente
const SUBST = {
  '\u202f': ' ', // espacio angosto (en las horas: 11:40 a. m.)
  '\u2009': ' ',
  '\u00a0': ' ',
  '–': '-',
  '—': '-',
  '→': '->',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '…': '...',
  '•': '*',
  '€': 'E',
};

export function encode850(text) {
  const out = [];
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (code >= 0x20 && code < 0x7f) out.push(code);
    else if (SUBST[ch]) out.push(...[...SUBST[ch]].map((c) => c.charCodeAt(0)));
    else if (TO_850.has(ch)) out.push(TO_850.get(ch));
    else {
      // Sin equivalente: la letra sin acento, o "?"
      const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const c = plain.codePointAt(0);
      out.push(c >= 0x20 && c < 0x7f ? c : 0x3f);
    }
  }
  return out;
}

// copies: se repite el ticket completo, con corte entre copias
export function render(ticket, { columns = 48, logo = false, drawer = false, copies = 1 } = {}) {
  const body = [];
  const push = (...cmds) => cmds.forEach((c) => body.push(...c));
  const line = (s) => push(encode850(s), CMD.lf);
  for (const b of ticket.blocks) {
    if (b.t === 'sep') line(b.char.repeat(columns));
    else if (b.t === 'feed') for (let i = 0; i < b.n; i++) push(CMD.lf);
    else if (b.t === 'logo') {
      if (logo) push(CMD.alignCenter, CMD.logo, CMD.lf, CMD.alignLeft);
    } else if (b.t === 'row') {
      push(b.bold ? CMD.boldOn : CMD.boldOff);
      for (const l of rowLines(b.left, b.right, columns)) line(l);
      push(CMD.boldOff);
    } else {
      const cols = b.wide ? Math.floor(columns / 2) : columns;
      push(b.align === 'center' ? CMD.alignCenter : CMD.alignLeft);
      push(b.wide ? CMD.sizeDouble : b.big ? CMD.sizeTall : CMD.sizeNormal);
      push(b.bold ? CMD.boldOn : CMD.boldOff);
      for (const l of wrap(b.text, cols - (b.indent || 0))) line(' '.repeat(b.indent || 0) + l);
      push(CMD.sizeNormal, CMD.boldOff, CMD.alignLeft);
    }
  }
  const one = [...CMD.init, ...CMD.codepage850, ...body, ...CMD.cut];
  const all = [];
  if (drawer) all.push(...CMD.init, ...CMD.drawer);
  for (let i = 0; i < Math.max(1, copies); i++) all.push(...one);
  return Buffer.from(all);
}
