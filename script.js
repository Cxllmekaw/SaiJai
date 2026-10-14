'use strict';

// ใช้ key เดิม เพื่อให้ข้อมูลจากเว็บ Blood Pressure Tracker และ BloomCare ยังอ่านได้
const STORAGE_KEY = 'bloodPressure';
const AI_CHAT_KEY = 'saiJaiKhunJaiDeeChat';
const el = (id) => document.getElementById(id);

const form = el('recordForm');
const dateInput = el('dateInput');
const timeInput = el('timeInput');
const sysInput = el('sysInput');
const diaInput = el('diaInput');
const pulseInput = el('pulseInput');
const noteInput = el('noteInput');

const assistantMessages = el('assistantMessages');
const assistantForm = el('assistantForm');
const assistantInput = el('assistantInput');
const clearChatBtn = el('clearChatBtn');
const quickQuestions = document.querySelectorAll('.quick-chip');

let records = [];
let showAll = false;
let toastTimer;
let storageAvailable = true;
let aiTypingTimer;

function pad(n) { return String(n).padStart(2, '0'); }
function localDate(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function localTime(d = new Date()) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function resetDateTime() {
  const now = new Date();
  dateInput.value = localDate(now);
  dateInput.max = localDate(now);
  timeInput.value = localTime(now);
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T12:00:00');
  return !Number.isNaN(d.getTime()) && localDate(d) === value;
}
function validTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
function displayDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!validDate(value)) return value;
  return new Intl.DateTimeFormat('th-TH', options).format(new Date(value + 'T12:00:00'));
}
function timestamp(r) { return `${r.date}T${r.time}:00`; }
function sortRecords() { records.sort((a, b) => timestamp(b).localeCompare(timestamp(a))); }
function normalise(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const date = String(raw.date ?? '');
  const time = String(raw.time ?? '00:00').slice(0, 5);
  const sys = Number(raw.sys), dia = Number(raw.dia), pulse = Number(raw.pulse);
  if (!validDate(date) || !validTime(time) || ![sys, dia, pulse].every(Number.isFinite)) return null;
  if ([sys, dia, pulse].some(value => !Number.isInteger(value) || value < 0 || value > 999)) return null;
  return { id: String(raw.id || `legacy-${index}`), date, time, sys, dia, pulse, note: String(raw.note ?? '').slice(0, 300) };
}
function notify(message, isError = false) {
  const toast = el('toast');
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3700);
}
function loadRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) throw new Error('Not an array');
    records = parsed.map(normalise).filter(Boolean);
    sortRecords();
  } catch (error) {
    records = [];
    storageAvailable = false;
    notify('อ่านข้อมูลในเบราว์เซอร์ไม่สำเร็จ กรุณาตรวจสอบการตั้งค่าพื้นที่เก็บข้อมูล', true);
  }
}
function persist() {
  if (!storageAvailable) {
    notify('บันทึกไม่ได้ เพราะไม่สามารถอ่านพื้นที่จัดเก็บเดิมอย่างปลอดภัย', true);
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch (error) {
    notify('บันทึกไม่สำเร็จ กรุณาตรวจสอบพื้นที่จัดเก็บของเบราว์เซอร์', true);
    return false;
  }
}
function avg(key) {
  return records.length ? Math.round(records.reduce((sum, r) => sum + r[key], 0) / records.length) : '—';
}
function renderSummary() {
  const latest = records[0];
  el('latestSys').textContent = latest ? latest.sys : '—';
  el('latestDia').textContent = latest ? latest.dia : '—';
  el('latestPulse').textContent = latest ? latest.pulse : '—';
  el('avgSys').textContent = avg('sys');
  el('avgDia').textContent = avg('dia');
  el('recordCount').textContent = records.length.toLocaleString('th-TH');
  el('latestTime').textContent = latest ? `บันทึกเมื่อ ${displayDate(latest.date)} เวลา ${latest.time} น.` : 'ยังไม่มีข้อมูลที่บันทึก';
}
function svg(tag, attrs = {}, label) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (label !== undefined) node.textContent = label;
  return node;
}
function renderChart() {
  const chart = el('pressureChart');
  const empty = el('chartEmpty');
  const range = el('chartRange').value;
  const selected = (range === 'all' ? records : records.slice(0, Number(range))).slice().reverse();
  chart.replaceChildren();
  chart.hidden = !selected.length;
  chart.style.display = selected.length ? 'block' : 'none';
  empty.hidden = selected.length > 0;
  el('chartCaption').textContent = selected.length ? `แสดง ${selected.length} รายการ เรียงตามวันและเวลาที่บันทึก · ใช้ดูแนวโน้มเท่านั้น` : 'กราฟจะปรากฏเมื่อมีข้อมูล';
  if (!selected.length) return;

  const W = 690, H = 296, L = 44, R = 17, T = 24, B = 46;
  const bottom = H - B;
  const values = selected.flatMap(r => [r.sys, r.dia]);
  let low = Math.max(0, Math.floor((Math.min(...values) - 12) / 10) * 10);
  let high = Math.ceil((Math.max(...values) + 12) / 10) * 10;
  if (high <= low) high = low + 20;
  const x = (i) => L + (selected.length === 1 ? (W - L - R) / 2 : (W - L - R) * i / (selected.length - 1));
  const y = (v) => T + (high - v) * (bottom - T) / (high - low);
  const textAttrs = { 'font-family': 'Prompt, sans-serif', 'font-size': '11', fill: '#B7A8B4' };
  for (let i = 0; i <= 4; i++) {
    const val = low + (high - low) * i / 4;
    const yy = y(val);
    chart.append(svg('line', { x1: L, y1: yy, x2: W - R, y2: yy, stroke: '#F3E9EF', 'stroke-dasharray': '4 6' }));
    chart.append(svg('text', { ...textAttrs, x: L - 10, y: yy + 4, 'text-anchor': 'end' }, String(Math.round(val))));
  }
  const labelIndexes = [...new Set([0, Math.floor((selected.length - 1) / 4), Math.floor((selected.length - 1) / 2), Math.floor((selected.length - 1) * 3 / 4), selected.length - 1])];
  labelIndexes.forEach(i => chart.append(svg('text', { ...textAttrs, x: x(i), y: H - 17, 'text-anchor': 'middle' }, displayDate(selected[i].date, { day: 'numeric', month: 'short' }))));

  [{ key: 'sys', color: '#EAA0B9' }, { key: 'dia', color: '#AD94DF' }].forEach(series => {
    const coords = selected.map((record, i) => [x(i), y(record[series.key])]);
    if (coords.length > 1) chart.append(svg('polyline', {
      points: coords.map(p => p.map(n => n.toFixed(2)).join(',')).join(' '),
      stroke: series.color, 'stroke-width': 3.3, fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));
    coords.forEach(([xx, yy], i) => {
      const dot = svg('circle', { cx: xx, cy: yy, r: selected.length > 25 ? 3.3 : 5, fill: series.color, stroke: '#fff', 'stroke-width': 2 });
      dot.append(svg('title', {}, `${series.key.toUpperCase()}: ${selected[i][series.key]} mmHg • ${displayDate(selected[i].date)} ${selected[i].time}`));
      chart.append(dot);
    });
  });
}
function cell(value, className = '') {
  const td = document.createElement('td');
  td.textContent = String(value);
  if (className) td.className = className;
  return td;
}
function renderHistory() {
  const tbody = el('historyBody');
  tbody.replaceChildren();
  el('historyEmpty').hidden = records.length > 0;
  (showAll ? records : records.slice(0, 5)).forEach(record => {
    const tr = document.createElement('tr');
    tr.append(
      cell(`${displayDate(record.date)} · ${record.time} น.`),
      cell(record.sys), cell(record.dia), cell(record.pulse)
    );
    const note = cell(record.note || '—', 'note-cell');
    note.title = record.note || 'ไม่มีหมายเหตุ';
    tr.append(note);
    const action = document.createElement('td');
    const del = document.createElement('button');
    del.className = 'delete-btn';
    del.type = 'button';
    del.textContent = '×';
    del.title = 'ลบรายการ';
    del.setAttribute('aria-label', `ลบบันทึกวันที่ ${displayDate(record.date)} เวลา ${record.time}`);
    del.addEventListener('click', () => removeRecord(record.id));
    action.append(del);
    tr.append(action);
    tbody.append(tr);
  });
  el('historyCount').textContent = `ทั้งหมด ${records.length.toLocaleString('th-TH')} รายการ`;
  el('showAllBtn').hidden = records.length <= 5;
  el('showAllBtn').textContent = showAll ? 'ดูน้อยลง ↑' : `ดูทั้งหมด ${records.length} รายการ ↓`;
}
function render() {
  renderSummary();
  renderChart();
  renderHistory();
}
function removeRecord(id) {
  if (!window.confirm('ต้องการลบบันทึกนี้ใช่ไหม? การลบจะไม่สามารถกู้คืนได้')) return;
  const original = records;
  records = records.filter(record => record.id !== id);
  if (!persist()) { records = original; return; }
  render();
  notify('ลบบันทึกเรียบร้อยแล้ว ♡');
}
function getError() {
  if (!validDate(dateInput.value) || !validTime(timeInput.value)) return 'กรุณาระบุวันที่และเวลาให้ถูกต้อง';
  if (timestamp({ date: dateInput.value, time: timeInput.value }) > `${localDate()}T${localTime()}:00`) return 'ไม่สามารถเลือกวันที่หรือเวลาในอนาคตได้';
  for (const [input, label, min, max] of [
    [sysInput, 'ความดันตัวบน', 40, 350], [diaInput, 'ความดันตัวล่าง', 20, 250], [pulseInput, 'ชีพจร', 20, 250]
  ]) {
    const value = Number(input.value);
    if (!input.value.trim() || !Number.isInteger(value) || value < min || value > max) return `กรุณากรอก${label}เป็นจำนวนเต็มระหว่าง ${min}–${max}`;
  }
  if (Number(sysInput.value) <= Number(diaInput.value)) return 'กรุณาตรวจสอบอีกครั้ง: ความดันตัวบนควรมากกว่าตัวล่าง';
  return '';
}
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const error = getError();
  el('formError').hidden = !error;
  el('formError').textContent = error;
  if (error) return;
  const record = {
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `sj-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    date: dateInput.value,
    time: timeInput.value,
    sys: Number(sysInput.value),
    dia: Number(diaInput.value),
    pulse: Number(pulseInput.value),
    note: noteInput.value.trim()
  };
  const original = records;
  records = [...records, record];
  sortRecords();
  if (!persist()) { records = original; return; }
  form.reset();
  resetDateTime();
  render();
  notify('บันทึกสำเร็จแล้ว ขอบคุณที่ใส่ใจตัวเอง ♡');
  saveChatState();
});

el('showAllBtn').addEventListener('click', () => { showAll = !showAll; renderHistory(); });
el('chartRange').addEventListener('change', renderChart);

// Prevent CSV formula injection when opening user notes in a spreadsheet program.
function csvCell(value) {
  let s = String(value ?? '');
  if (/^\s*[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
el('exportBtn').addEventListener('click', () => {
  if (!records.length) { notify('ยังไม่มีข้อมูลสำหรับส่งออก', true); return; }
  const rows = [['Date', 'Time', 'SYS (mmHg)', 'DIA (mmHg)', 'Pulse (bpm)', 'Note'], ...records.map(r => [r.date, r.time, r.sys, r.dia, r.pulse, r.note])];
  const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `SaiJai-Health-${localDate()}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  notify('ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว ♡');
});

function getTrendDirection() {
  if (records.length < 2) return '';
  const [latest, previous] = records;
  const sysDiff = latest.sys - previous.sys;
  const diaDiff = latest.dia - previous.dia;
  const pulseDiff = latest.pulse - previous.pulse;
  const describe = (value, label) => {
    if (value === 0) return `${label}ใกล้เคียงเดิม`;
    return `${label}${Math.abs(value)} ${value > 0 ? 'สูงขึ้น' : 'ลดลง'}`;
  };
  return `เมื่อเทียบกับครั้งก่อน: ${describe(sysDiff, 'SYS ')} · ${describe(diaDiff, 'DIA ')} · ${describe(pulseDiff, 'ชีพจร ')}`;
}

function normaliseQuestion(text) {
  return text.toLowerCase().trim();
}

function getLatestSummaryText() {
  if (!records.length) {
    return 'ตอนนี้ยังไม่มีข้อมูลที่บันทึกไว้เลยค่ะ ลองเพิ่มค่าความดันครั้งแรกก่อน แล้วคุณใจดีจะช่วยสรุปให้ได้ทั้งค่าล่าสุด ค่าเฉลี่ย และแนวโน้มเบื้องต้นนะคะ ♡';
  }
  const latest = records[0];
  const averageSys = avg('sys');
  const averageDia = avg('dia');
  const averagePulse = records.length ? Math.round(records.reduce((sum, r) => sum + r.pulse, 0) / records.length) : '—';
  const notePart = latest.note ? `
หมายเหตุล่าสุด: ${latest.note}` : '';
  const trend = getTrendDirection();
  return `สรุปข้อมูลล่าสุดของคุณตอนนี้นะคะ

• ค่าล่าสุด: ${latest.sys}/${latest.dia} mmHg
• ชีพจรล่าสุด: ${latest.pulse} bpm
• บันทึกเมื่อ: ${displayDate(latest.date)} เวลา ${latest.time} น.
• ค่าเฉลี่ยทั้งหมด: ${averageSys}/${averageDia} mmHg
• ชีพจรเฉลี่ย: ${averagePulse} bpm
• จำนวนบันทึกทั้งหมด: ${records.length} รายการ${notePart}${trend ? `
• ${trend}` : ''}

คุณใจดีช่วยสรุปให้ดูง่าย ๆ ได้ แต่ถ้าค่าดูผิดปกติบ่อย ๆ หรือมีอาการร่วม เช่น เวียนหัว แน่นหน้าอก ปวดศีรษะมาก ควรปรึกษาแพทย์นะคะ`; 
}

function getAssistantReply(question) {
  const q = normaliseQuestion(question);

  if (!q) return 'พิมพ์คำถามมาได้เลยนะคะ คุณใจดีพร้อมช่วยตอบอย่างอ่อนโยนเสมอ ♡';

  if (/(สรุป|ข้อมูลล่าสุด|ค่าล่าสุด|ของฉัน|บันทึกของฉัน|แนวโน้ม)/.test(q)) {
    return getLatestSummaryText();
  }

  if (/(sys|dia|ตัวบน|ตัวล่าง)/.test(q) && /(คือ|อะไร|แปล)/.test(q)) {
    return `SYS คือค่าความดันตัวบน เป็นแรงดันตอนหัวใจบีบตัวค่ะ ส่วน DIA คือค่าความดันตัวล่าง เป็นแรงดันตอนหัวใจคลายตัว

สรุปง่าย ๆ
• SYS = ตัวบน
• DIA = ตัวล่าง

เวลาบันทึกใน Sai Jai เราจะเห็นเป็นรูปแบบ เช่น 120/80 mmHg โดย 120 คือ SYS และ 80 คือ DIA นะคะ`;
  }

  if (/(ปกติ|มาตรฐาน|เท่าไหร่)/.test(q) && /(ความดัน|bp|blood pressure|ค่าความดัน)/.test(q)) {
    return `โดยทั่วไปสำหรับผู้ใหญ่ ค่าความดันที่มักพบว่าอยู่ในเกณฑ์ปกติจะใกล้เคียงประมาณ 120/80 mmHg ค่ะ

แต่การแปลผลจริงควรดูหลายอย่างร่วมกัน เช่น
• อายุ
• โรคประจำตัว
• เวลาที่วัด
• วัดซ้ำหลายครั้งหรือไม่

ถ้าค่าสูงหรือต่ำผิดปกติบ่อย ๆ ควรจดบันทึกไว้แล้วนำไปปรึกษาแพทย์นะคะ`;
  }

  if (/(วัด|แม่น|ถูกต้อง|ยังไง|อย่างไร)/.test(q) && /(ความดัน|bp|blood pressure)/.test(q)) {
    return `วิธีวัดความดันให้แม่นขึ้นแบบง่าย ๆ ค่ะ

1) พักอย่างน้อย 5 นาที ก่อนวัด
2) งดชา กาแฟ บุหรี่ และออกกำลังกายหนักก่อนวัดสักพัก
3) นั่งหลังพิง เก้าอี้ เท้าวางราบ ไม่ไขว่ห้าง
4) วางแขนให้อยู่ระดับเดียวกับหัวใจ
5) พันผ้าพันแขนให้พอดี
6) วัดในเวลาใกล้เคียงกันแต่ละวัน
7) ถ้าวัดครั้งแรกสูง ลองพักแล้ววัดซ้ำอีก 1–2 ครั้ง

ถ้าต้องการ คุณสามารถถามต่อว่า “ควรวัดเวลาไหนดีที่สุด” ได้เลยนะคะ ♡`;
  }

  if (/(สูง|เกิน|ขึ้นสูง|ความดันสูง)/.test(q)) {
    return `ถ้าค่าความดันดูสูงกว่าปกติ สิ่งที่ทำได้เบื้องต้นคือ

• นั่งพักให้สบาย 5–10 นาที
• วัดซ้ำอีกครั้งอย่างถูกวิธี
• บันทึกค่า เวลา และอาการร่วม เช่น ปวดหัว เวียนหัว แน่นหน้าอก

ถ้าค่าสูงมาก หรือมีอาการผิดปกติร่วมด้วย ควรติดต่อบุคลากรทางการแพทย์ทันทีนะคะ เพราะคุณใจดีให้ได้เพียงข้อมูลทั่วไป ไม่สามารถวินิจฉัยโรคได้ ♡`;
  }

  if (/(ต่ำ|ความดันต่ำ)/.test(q)) {
    return `ถ้าความดันดูต่ำกว่าปกติและมีอาการ เช่น เวียนหัว หน้ามืด อ่อนแรง ควรนั่งหรือนอนพักก่อน และดื่มน้ำถ้าไม่มีข้อห้ามค่ะ

ถ้าอาการไม่ดีขึ้น เป็นบ่อย หรือมีอาการมาก ควรไปพบแพทย์นะคะ โดยเฉพาะถ้ามีอาการหน้ามืดจนเกือบเป็นลม`;
  }

  if (/(ชีพจร|pulse)/.test(q)) {
    return `ชีพจรคือจำนวนครั้งที่หัวใจเต้นต่อนาที หรือ bpm ค่ะ การอ่านค่าชีพจรควรดูร่วมกับอาการและบริบท เช่น พักผ่อนอยู่ ออกกำลังกาย หรือกำลังกังวลอยู่

ใน Sai Jai เราเก็บค่าชีพจรไว้คู่กับความดัน เพื่อให้เห็นภาพรวมของสุขภาพได้ดีขึ้นนะคะ`;
  }

  if (/(ใช้งาน|ใช้ยังไง|เว็บนี้|บันทึกยังไง|csv|ส่งออก)/.test(q)) {
    return `วิธีใช้ Sai Jai แบบเร็ว ๆ ค่ะ

• ไปที่ส่วน “บันทึกค่าความดัน” แล้วกรอกวันที่ เวลา SYS DIA และชีพจร
• กดปุ่มบันทึก เพื่อเก็บข้อมูลลงในเบราว์เซอร์ของเครื่องนี้
• ดูค่าล่าสุดและค่าเฉลี่ยได้ที่ด้านบน
• ดูแนวโน้มได้จากกราฟ
• ดูย้อนหลังหรือลบรายการได้ในส่วนประวัติ
• กด “ส่งออก CSV” เพื่อดาวน์โหลดข้อมูลเก็บไว้ได้

ถ้าต้องการ คุณใจดีช่วยอธิบายทีละขั้นตอนได้ด้วยนะคะ`;
  }

  if (/(สวัสดี|hello|hi|หวัดดี)/.test(q)) {
    return `สวัสดีค่า เราคือ “คุณใจดี” AI ผู้ช่วยตัวน้อยของ Sai Jai ♡ ถามเรื่องความดัน การดูแลตัวเองเบื้องต้น หรือวิธีใช้เว็บนี้ได้เลยนะคะ`;
  }

  return `คุณใจดีพอเข้าใจคำถามแล้วนะคะ แต่ยังตอบได้ดีที่สุดในเรื่องต่อไปนี้ค่ะ

• ค่าความดันปกติเท่าไหร่
• วิธีวัดความดันให้แม่น
• SYS / DIA คืออะไร
• ถ้าค่าสูงหรือต่ำควรทำอย่างไรเบื้องต้น
• สรุปข้อมูลล่าสุดของฉัน
• วิธีใช้เว็บ Sai Jai

ลองพิมพ์สั้น ๆ ใหม่อีกนิดได้เลยนะคะ ♡`;
}

function createAvatar(role) {
  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  if (role === 'assistant') {
    const img = document.createElement('img');
    img.src = 'khunjaidee-avatar.svg';
    img.alt = 'คุณใจดี';
    avatar.append(img);
  } else {
    avatar.textContent = 'คุณ';
    avatar.style.fontSize = '11px';
    avatar.style.fontWeight = '700';
    avatar.style.color = '#7F6E8D';
    avatar.style.background = '#F4EDFF';
    avatar.style.borderColor = '#E4D8FB';
  }
  return avatar;
}

function addMessage(role, text, meta) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  if (role === 'assistant') row.append(createAvatar(role));

  const bubble = document.createElement('div');
  bubble.className = role === 'assistant' ? 'assistant-bubble' : 'user-bubble';
  if (meta) {
    const metaEl = document.createElement('span');
    metaEl.className = 'message-meta';
    metaEl.textContent = meta;
    bubble.append(metaEl);
  }
  bubble.append(document.createTextNode(text));
  row.append(bubble);

  if (role === 'user') row.append(createAvatar(role));

  assistantMessages.append(row);
  assistantMessages.scrollTop = assistantMessages.scrollHeight;
}

function serializeChat() {
  return [...assistantMessages.querySelectorAll('.message-row')].map(row => {
    const role = row.classList.contains('user') ? 'user' : 'assistant';
    const bubble = row.querySelector('.user-bubble, .assistant-bubble');
    const meta = bubble.querySelector('.message-meta')?.textContent || '';
    const text = bubble.childNodes[bubble.childNodes.length - 1]?.textContent || bubble.textContent;
    return { role, meta, text };
  });
}

function saveChatState() {
  try {
    localStorage.setItem(AI_CHAT_KEY, JSON.stringify(serializeChat().slice(-20)));
  } catch (_) {
    // ignore storage errors for chat history
  }
}

function loadChatState() {
  assistantMessages.replaceChildren();
  let loaded = false;
  try {
    const raw = JSON.parse(localStorage.getItem(AI_CHAT_KEY) || '[]');
    if (Array.isArray(raw) && raw.length) {
      raw.forEach(item => {
        if (item && (item.role === 'user' || item.role === 'assistant') && typeof item.text === 'string') {
          addMessage(item.role, item.text, item.meta || (item.role === 'assistant' ? 'คุณใจดี AI' : 'คำถามของคุณ'));
          loaded = true;
        }
      });
    }
  } catch (_) {
    // ignore parse errors and fall back to welcome
  }
  if (!loaded) {
    addMessage('assistant',
      'สวัสดีค่า เราคือ “คุณใจดี” AI ของ Sai Jai ♡\n\nถามได้เลยนะคะ เช่น\n• ค่าความดันปกติเท่าไหร่\n• วิธีวัดความดันให้แม่น\n• SYS DIA คืออะไร\n• สรุปข้อมูลล่าสุดของฉัน\n\nเราจะช่วยตอบแบบอ่านง่ายและนุ่มนวลค่ะ',
      'คุณใจดี AI');
    saveChatState();
  }
}

function askAssistant(question) {
  const trimmed = question.trim();
  if (!trimmed) return;
  addMessage('user', trimmed, 'คำถามของคุณ');
  assistantInput.value = '';
  saveChatState();

  clearTimeout(aiTypingTimer);
  aiTypingTimer = setTimeout(() => {
    const reply = getAssistantReply(trimmed);
    addMessage('assistant', reply, 'คุณใจดี AI');
    saveChatState();
  }, 380);
}

assistantForm.addEventListener('submit', (event) => {
  event.preventDefault();
  askAssistant(assistantInput.value);
});

quickQuestions.forEach(button => {
  button.addEventListener('click', () => askAssistant(button.textContent || ''));
});

clearChatBtn.addEventListener('click', () => {
  if (!window.confirm('ต้องการล้างแชตกับคุณใจดีใช่ไหม?')) return;
  localStorage.removeItem(AI_CHAT_KEY);
  loadChatState();
  notify('ล้างแชตของคุณใจดีแล้ว ♡');
});

function init() {
  resetDateTime();
  el('todayText').textContent = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  loadRecords();
  render();
  loadChatState();
}

init();
