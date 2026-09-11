// Routing hash-based, render nav (dikelompokkan per kategori), dan inisialisasi aplikasi
const ICONS = {
  beranda: '<path d="M3 11 12 4l9 7"/><path d="M5 10v9h14v-9"/><path d="M10 19v-6h4v6"/>',
  performa: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
  rekap: '<rect x="3.5" y="4" width="17" height="16" rx="1"/><path d="M3.5 9h17"/><path d="M8 4v-1.5M16 4v-1.5"/><path d="M7 13h2M11 13h2M15 13h2M7 16.5h2M11 16.5h2"/>',
  timsales: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17.5" cy="9" r="2.3"/><path d="M15.5 20c.3-2.6 2-4.5 4.3-4.9"/>',
  peta: '<path d="M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12Z"/><circle cx="12" cy="9" r="2.4"/>',
  delivery: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18.5" r="1.6"/><circle cx="17.5" cy="18.5" r="1.6"/>'
};

const NAV_GROUPS = [
  { label:'Ringkasan', items:[
    { id:'beranda', label:'Beranda', icon:ICONS.beranda },
  ]},
  { label:'Performa', items:[
    { id:'performa-daerah', label:'Performa Daerah', icon:ICONS.performa },
    { id:'delivery', label:'Delivery', icon:ICONS.delivery },
    { id:'rekap-harian', label:'Rekap Harian', icon:ICONS.rekap },
    { id:'tim-sales', label:'Tim Sales', icon:ICONS.timsales },
  ]},
  { label:'Operasional', items:[
    { id:'peta-toko', label:'Peta Toko', icon:ICONS.peta },
  ]},
];
const PAGES = NAV_GROUPS.flatMap(g => g.items);
const PAGE_LABEL = Object.fromEntries(PAGES.map(p => [p.id, p.label]));

function svgIcon(path){ return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`; }

function renderNav(activeId){
  const nav = document.getElementById('nav');
  nav.innerHTML = NAV_GROUPS.map(g => `
    <div class="nav-group">
      <div class="nav-group-label">${g.label}</div>
      ${g.items.map(p => `<a class="nav-link ${p.id===activeId?'active':''}" href="#${p.id}"${p.id===activeId?' aria-current="page"':''}>${svgIcon(p.icon)}<span>${p.label}</span></a>`).join('')}
    </div>
  `).join('');
  const mob = document.getElementById('mobtop');
  mob.innerHTML = PAGES.map(p => `<a class="${p.id===activeId?'active':''}" href="#${p.id}"${p.id===activeId?' aria-current="page"':''}>${p.label}</a>`).join('');
}

const RENDERERS = {
  'beranda': renderBeranda,
  'performa-daerah': renderPerformaDaerah,
  'delivery': renderDelivery,
  'rekap-harian': renderRekapHarian,
  'tim-sales': renderTimSales,
  'peta-toko': renderPetaToko,
  'transaksi-detail': renderTransaksiDetail,
};
PAGE_LABEL['transaksi-detail'] = 'Detail Transaksi';

async function route(){
  const raw = (location.hash || '#beranda').slice(1);
  const [id, queryStr] = raw.split('?');
  const params = new URLSearchParams(queryStr || '');
  const pageId = RENDERERS[id] ? id : 'beranda';
  renderNav(pageId);
  destroyCharts();
  destroyMap();
  const app = document.getElementById('app');
  app.innerHTML = `<div class="loading" role="status"><div class="spinner" aria-hidden="true"></div>Memuat data…</div>`;
  window.scrollTo({ top:0, behavior:'auto' });
  document.title = `${PAGE_LABEL[pageId] || 'Dashboard'} \u2014 Dashboard Distribusi`;
  try{
    await RENDERERS[pageId](app, params);
    initReveal();
    initParallax();
  }catch(err){
    console.error(err);
    app.innerHTML = `${pageHeader({ breadcrumb:['Dashboard','Kesalahan'], eyebrow:'Kesalahan', title:'Gagal memuat halaman' })}<div class="error-box" role="alert">${esc(err.message || 'Terjadi kesalahan saat mengambil data dari Supabase.')}</div>`;
  }
}

window.addEventListener('hashchange', route);
document.addEventListener('DOMContentLoaded', () => {
  applyChartDefaults();
  route();
  const foot = document.getElementById('sidebar-foot');
  if(foot) foot.textContent = 'SYNC ' + new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
});
