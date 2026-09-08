// Fungsi bantu bersama: formatting angka, tanggal, capaian, warna, Chart.js defaults, komponen header halaman, animasi
function fmt(n, d=0){ return Number(n||0).toLocaleString('id-ID', {minimumFractionDigits:d, maximumFractionDigits:d}); }
function fmtCompact(n){
  n = Number(n||0);
  if(Math.abs(n) >= 1e6) return (n/1e6).toLocaleString('id-ID',{maximumFractionDigits:1})+' jt';
  if(Math.abs(n) >= 1e3) return (n/1e3).toLocaleString('id-ID',{maximumFractionDigits:1})+' rb';
  return fmt(n);
}
function pct(actual, target){
  actual = Number(actual||0); target = Number(target||0);
  if(target <= 0) return null;
  return (actual/target)*100;
}
function capaianClass(p){ if(p==null) return 'neutral'; return p>=100?'good':p>=80?'warn':'bad'; }
function capaianHTML(actual, target){
  const p = pct(actual, target);
  if(p==null) return `<span class="mono" style="color:var(--ink-faint)">–</span>`;
  const cls = capaianClass(p);
  return `<div class="capaian ${cls}"><div class="capaian-track"><div class="capaian-bar" style="width:${Math.min(100,p)}%"></div></div><span class="capaian-label">${p.toFixed(0)}%</span></div>`;
}
function badgeHTML(text, variant){
  return `<span class="badge ${variant}"><span class="dot" aria-hidden="true"></span>${esc(text)}</span>`;
}
function relDate(dstr){
  if(!dstr) return 'Belum ada';
  const d = new Date(dstr);
  const days = Math.floor((Date.now() - d) / 86400000);
  if(days <= 0) return 'Hari ini';
  if(days === 1) return 'Kemarin';
  if(days < 30) return days + ' hari lalu';
  if(days < 365) return Math.floor(days/30) + ' bulan lalu';
  return Math.floor(days/365) + ' tahun lalu';
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function groupSum(arr, keyFn, valFn){
  const m = new Map();
  for(const row of arr){
    const k = keyFn(row);
    m.set(k, (m.get(k)||0) + (valFn(row)||0));
  }
  return m;
}

/* ======================================================================
   PAGE HEADER: breadcrumb kecil, judul besar, deskripsi, filter, status
   dipakai konsisten di halaman non-hero (Beranda pakai hero sendiri)
====================================================================== */
function pageHeader({ breadcrumb, eyebrow, title, desc, status, filtersHTML }){
  const crumbHTML = breadcrumb.map((b,i) => i===breadcrumb.length-1
    ? `<span class="cur">${esc(b)}</span>`
    : `${esc(b)}<span class="sep" aria-hidden="true">/</span>`
  ).join('');
  return `
    <nav class="breadcrumb" aria-label="Breadcrumb">${crumbHTML}</nav>
    <div class="page-head">
      <div class="page-head-top">
        <div>
          <div class="eyebrow">${esc(eyebrow)}</div>
          <h1 class="page-title">${esc(title)}</h1>
          ${desc ? `<p class="page-desc">${esc(desc)}</p>` : ''}
        </div>
        ${status ? `<div class="page-status" role="status"><span class="dot" aria-hidden="true"></span><span>${esc(status)}</span></div>` : ''}
      </div>
      ${filtersHTML ? `<div style="margin-top:16px;">${filtersHTML}</div>` : ''}
    </div>
  `;
}

/** Ringkasan teks singkat dari sebuah chart untuk screen reader */
function chartSRSummary(labels, values, unit){
  if(!labels || !labels.length) return '';
  const parts = labels.map((l,i) => `${l}: ${fmt(values[i])}${unit?(' '+unit):''}`);
  return `Ringkasan data grafik: ${parts.join('; ')}.`;
}

/* Chart.js shared defaults */
function applyChartDefaults(){
  if(typeof Chart === 'undefined') return;
  Chart.defaults.font.family = "'IBM Plex Mono', monospace";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = '#645E52';
  Chart.defaults.borderColor = '#C6BFAF';
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.plugins.tooltip.backgroundColor = '#211E19';
  Chart.defaults.plugins.tooltip.titleFont = { family: "'IBM Plex Mono', monospace", size: 11, weight: '600' };
  Chart.defaults.plugins.tooltip.bodyFont = { family: "'IBM Plex Mono', monospace", size: 11 };
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 3;
  Chart.defaults.plugins.tooltip.displayColors = true;
  Chart.defaults.plugins.tooltip.boxPadding = 4;
  Chart.defaults.elements.bar.borderRadius = 3;
}

/** Config legend+tooltip donut yang menampilkan persentase secara rapi */
function donutPercentPlugins(unitLabel){
  const unit = unitLabel || 'ton';
  return {
    legend: { display:true, position:'bottom', labels:{ boxWidth:10, font:{size:10.5, family:"'IBM Plex Mono', monospace"}, color:'#645E52',
      generateLabels(chart){
        const ds = chart.data.datasets[0];
        const total = ds.data.reduce((a,b) => a + Number(b||0), 0);
        return chart.data.labels.map((label,i) => {
          const v = Number(ds.data[i]||0);
          const p = total>0 ? (v/total*100) : 0;
          return { text:`${label} (${p.toFixed(1)}%)`, fillStyle: ds.backgroundColor[i], strokeStyle: ds.borderColor||'#F8F6F0', lineWidth:1, index:i };
        });
      }
    }},
    tooltip: { callbacks: { label(c){
      const total = c.dataset.data.reduce((a,b) => a + Number(b||0), 0);
      const p = total>0 ? (c.parsed/total*100) : 0;
      return ` ${c.label}: ${fmt(c.parsed)} ${unit} (${p.toFixed(1)}%)`;
    } } }
  };
}

const COLORS = {
  accent: '#FF5A1F', accentSoft: 'rgba(255,90,31,.16)',
  blue: '#204A63', blueMid: '#3E7899', blueSoft: 'rgba(62,120,153,.16)',
  green: '#3F7A52', red: '#B23B2E', amber: '#B8791A',
  ink: '#211E19', line: '#C6BFAF'
};
const PALETTE = ['#FF5A1F','#204A63','#3F7A52','#B8791A','#8A5FA8','#3E7899','#B23B2E','#6B6153'];

let activeCharts = [];
function newChart(ctx, config){
  const c = new Chart(ctx, config);
  activeCharts.push(c);
  return c;
}
function destroyCharts(){
  activeCharts.forEach(c => c.destroy());
  activeCharts = [];
}
let activeMap = null;
function destroyMap(){
  if(activeMap){ activeMap.remove(); activeMap = null; }
}

/* Scroll reveal */
let revealObserver = null;
function initReveal(){
  if(!revealObserver){
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if(e.isIntersecting){ e.target.classList.add('in-view'); revealObserver.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
  }
  document.querySelectorAll('.reveal:not(.in-view)').forEach(el => revealObserver.observe(el));
}

/* Parallax (hero only) */
function initParallax(){
  if(REDUCED_MOTION) return;
  const grid = document.querySelector('.hero-grid');
  const net = document.querySelector('.hero-net');
  if(!grid && !net) return;
  let ticking = false;
  function onScroll(){
    if(ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      if(grid) grid.style.transform = `translateY(${y*0.18}px)`;
      if(net) net.style.transform = `translateY(${y*0.36}px)`;
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive:true });
  onScroll();
}

/** Diagram jaringan distributor: signature graphic di hero Beranda */
function heroNetworkSVG(){
  const hub = {x:610, y:330};
  const nodes = [
    {c:'NSA', x:900, y:70}, {c:'PKB', x:770, y:145}, {c:'CBS', x:430, y:110},
    {c:'INSA', x:250, y:90}, {c:'JMB', x:470, y:290}, {c:'BMM', x:300, y:560},
    {c:'PM', x:400, y:440}, {c:'BKP', x:195, y:465}, {c:'GMD', x:770, y:415},
    {c:'PTK', x:905, y:520},
  ];
  const lines = nodes.map(n => `<line x1="${hub.x}" y1="${hub.y}" x2="${n.x}" y2="${n.y}" stroke="#FF5A1F" stroke-width="1" stroke-dasharray="1 6" opacity=".55"/>`).join('');
  const dots = nodes.map(n => `
    <circle cx="${n.x}" cy="${n.y}" r="4.5" fill="#0E0D0B" stroke="#FF5A1F" stroke-width="1.4"/>
    <text x="${n.x}" y="${n.y-11}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="12" letter-spacing="1" fill="#C9C3B4" opacity=".85">${n.c}</text>
  `).join('');
  return `<svg class="hero-net" viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${lines}
    <circle cx="${hub.x}" cy="${hub.y}" r="9" fill="#FF5A1F"/>
    <circle cx="${hub.x}" cy="${hub.y}" r="17" fill="none" stroke="#FF5A1F" stroke-width="1" opacity=".5"/>
    ${dots}
  </svg>`;
}

/* ======================================================================
   Hari libur nasional Indonesia 2026 (SKB 3 Menteri). HANYA hari libur nasional,
   cuti bersama sengaja tidak dimasukkan (tetap dihitung hari kerja).
====================================================================== */
const HOLIDAYS_ID_2026 = [
  '2026-01-01','2026-01-16','2026-02-17','2026-03-19','2026-03-21','2026-03-22',
  '2026-04-03','2026-04-05','2026-05-01','2026-05-14','2026-05-27','2026-05-31',
  '2026-06-01','2026-06-16','2026-08-17','2026-08-25','2026-12-25',
];
function isWorkingDay(year, month, day){
  const date = new Date(year, month-1, day);
  if(date.getDay() === 0) return false;
  const iso = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return !HOLIDAYS_ID_2026.includes(iso);
}
function weekBucketsForMonth(year, month){
  const daysInMonth = new Date(year, month, 0).getDate();
  const buckets = [];
  let week = 1;
  for(let d=1; d<=daysInMonth; d++){
    if(!buckets[week-1]) buckets[week-1] = { week, days:[], workingDays:0 };
    buckets[week-1].days.push(d);
    if(isWorkingDay(year, month, d)) buckets[week-1].workingDays++;
    const dow = new Date(year, month-1, d).getDay();
    if(dow === 0) week++;
  }
  return buckets;
}
