// Halaman: Peta Toko (Leaflet)
async function renderPetaToko(app){
  const tokoAll = await DataSource.toko();
  const hasGeo = (t) => {
    const lat = Number(t.latitude), lng = Number(t.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && !(lat===0 && lng===0);
  };
  const toko = tokoAll.filter(hasGeo);
  const missingGeo = tokoAll.length - toko.length;
  const dists = [...new Set(tokoAll.map(t=>t.dist_code))].sort();
  const withTx = tokoAll.filter(t => t.total_qty > 0).length;

  const filtersHTML = `
    <div class="controls" style="margin-bottom:0;">
      <div class="control"><label for="mDist">Distributor</label><select id="mDist"><option value="all">Semua Distributor</option>${dists.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('')}</select></div>
      <div class="control"><span id="mShowLabel" class="control-group-label">Tampilkan</span>
        <div class="pill-row" role="group" aria-labelledby="mShowLabel">
          <button type="button" class="chip active" data-v="all" aria-pressed="true">Semua Toko</button>
          <button type="button" class="chip" data-v="active" aria-pressed="false">Toko Aktif</button>
          <button type="button" class="chip" data-v="inactive" aria-pressed="false">Toko Nonaktif</button>
        </div>
      </div>
    </div>
  `;

  app.innerHTML = `
    ${pageHeader({
      breadcrumb:['Dashboard','Peta Toko'],
      eyebrow:`Sebaran Geografis \u00b7 ${fmt(toko.length)} titik toko`,
      title:'Peta Toko',
      desc:'Lokasi toko terdaftar di jaringan distribusi, ditandai berdasarkan status transaksi tercatat.',
      status:'Data tersinkronisasi',
      filtersHTML
    })}
    <div class="grid g-kpi reveal">
      <div class="card"><div class="card-title">Total Toko Terdaftar</div><div class="kpi-value">${fmt(tokoAll.length)}</div></div>
      <div class="card"><div class="card-title">Toko Bertransaksi</div><div class="kpi-value">${fmt(withTx)}</div><div class="kpi-delta">${(withTx/tokoAll.length*100).toFixed(1)}% dari total</div></div>
      <div class="card"><div class="card-title">Toko Tanpa Transaksi</div><div class="kpi-value">${fmt(tokoAll.length-withTx)}</div><div class="kpi-delta">Belum tercatat transaksi</div></div>
      <div class="card"><div class="card-title">Distributor Tercakup</div><div class="kpi-value">${fmt(dists.length)}</div></div>
    </div>
    <div class="legend reveal" style="margin:16px 0 6px;">
      <span><i style="background:${COLORS.green}" aria-hidden="true"></i>Toko aktif (ada transaksi)</span>
      <span><i style="background:${COLORS.red}" aria-hidden="true"></i>Toko nonaktif (belum ada transaksi)</span>
    </div>
    ${missingGeo > 0 ? `<div class="reveal" style="font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:var(--ink-faint);margin-bottom:10px;">&middot; ${fmt(missingGeo)} toko belum punya titik koordinat, tidak ditampilkan di peta.</div>` : ''}
    <div class="card reveal plain" style="padding:0;overflow:hidden;">
      <div id="leaflet-map" role="img" aria-label="Peta sebaran lokasi toko"></div>
    </div>
    <div class="reveal" id="mapCaption" style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink-faint);margin-top:8px;"></div>
  `;

  const state = { dist:'all', show:'all' };
  let layerGroup = null;

  const map = L.map('leaflet-map', { scrollWheelZoom:true, preferCanvas:true }).setView([-1.2, 103.2], 6);
  activeMap = map;
  const canvasRenderer = L.canvas({ padding: 0.5 });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 18
  }).addTo(map);

  // Tanpa clustering. Titik ditampilkan langsung (dengan canvas renderer) supaya sebaran asli tetap terlihat.
  function drawMarkers(){
    if(layerGroup) map.removeLayer(layerGroup);
    layerGroup = L.layerGroup();
    const list = toko.filter(t => {
      if(state.dist!=='all' && t.dist_code!==state.dist) return false;
      const active = Number(t.total_qty) > 0;
      if(state.show==='active') return active;
      if(state.show==='inactive') return !active;
      return true;
    });
    list.forEach(t => {
      const active = Number(t.total_qty) > 0;
      const m = L.circleMarker([t.latitude, t.longitude], {
        renderer: canvasRenderer,
        radius: active ? 4.5 : 3.5, weight: 1,
        color: active ? '#2F6B44' : '#8F3823',
        fillColor: active ? COLORS.green : COLORS.red, fillOpacity: .8
      });
      m.bindPopup(`
        <b>${esc(t.cust_name||'Tanpa nama')}</b><br>
        <span style="color:#645E52">${esc(t.dist_name||'')}</span><br>
        Zona: ${esc(t.zona||'–')}<br>
        Status: <strong style="color:${active?COLORS.green:COLORS.red}">${active?'Aktif':'Nonaktif'}</strong><br>
        Tonase total: ${fmt(t.total_qty)} ton<br>
        Jumlah DO: ${fmt(t.num_do)}<br>
        Transaksi terakhir: ${relDate(t.last_transaction)}
      `);
      layerGroup.addLayer(m);
    });
    map.addLayer(layerGroup);
    const capEl = document.getElementById('mapCaption');
    if(capEl) capEl.textContent = `Menampilkan ${fmt(list.length)} titik toko sesuai filter (tanpa pengelompokan, sebaran asli).`;
    if(state.dist!=='all' && list.length){
      const bounds = L.latLngBounds(list.map(t => [t.latitude, t.longitude]));
      map.fitBounds(bounds, { padding:[30,30], maxZoom:11 });
    }
  }
  drawMarkers();

  document.getElementById('mDist').addEventListener('change', e => { state.dist = e.target.value; drawMarkers(); });
  document.querySelectorAll('.chip[data-v]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip[data-v]').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-pressed','false'); });
      chip.classList.add('active'); chip.setAttribute('aria-pressed','true');
      state.show = chip.dataset.v;
      drawMarkers();
    });
  });
}
