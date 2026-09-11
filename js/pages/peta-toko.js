// Halaman: Peta Toko (Leaflet). Data dijadwalkan MTD (bulan berjalan), KPI reaktif terhadap filter distributor.
async function renderPetaToko(app){
  const monthly = await DataSource.monthlyTotals();
  const months2026 = monthly.filter(r=>r.year===2026).map(r=>r.month);
  const year = 2026, month = months2026.length ? Math.max(...months2026) : 8;

  const tokoAll = await DataSource.tokoMonthly(year, month);
  const hasGeo = (t) => {
    const lat = Number(t.latitude), lng = Number(t.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && !(lat===0 && lng===0);
  };
  const dists = [...new Set(tokoAll.map(t=>t.dist_code))].sort();

  const filtersHTML = `
    <div class="controls" style="margin-bottom:0;">
      <div class="control"><label for="mDist">Distributor</label><select id="mDist"><option value="all">Semua Distributor</option>${dists.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('')}</select></div>
      <div class="control"><span id="mShowLabel" class="control-group-label">Tampilkan</span>
        <div class="pill-row" role="group" aria-labelledby="mShowLabel">
          <button type="button" class="chip active" data-v="all" aria-pressed="true">Semua Toko</button>
          <button type="button" class="chip" data-v="active" aria-pressed="false">Aktif Bulan Ini</button>
          <button type="button" class="chip" data-v="inactive" aria-pressed="false">Nonaktif Bulan Ini</button>
        </div>
      </div>
    </div>
  `;

  app.innerHTML = `
    ${pageHeader({
      breadcrumb:['Dashboard','Peta Toko'],
      eyebrow:`Sebaran Geografis \u00b7 ${MONTHS_ID[month]} ${year} (MTD)`,
      title:'Peta Toko',
      desc:'Lokasi toko terdaftar di jaringan distribusi, status aktif/nonaktif berdasarkan transaksi bulan berjalan.',
      status:'Data tersinkronisasi',
      filtersHTML
    })}
    <div class="grid g-kpi reveal" id="mapKpis"></div>
    <div class="reveal" id="missingGeoPanel" style="display:none;margin-top:14px;"></div>

    <div class="map-wrap reveal" style="margin-top:16px;">
      <div class="map-search">
        <input type="text" id="mSearch" placeholder="Cari nama atau kode toko&hellip;" autocomplete="off" aria-label="Cari toko berdasarkan nama atau kode">
        <div id="mSearchResults" class="map-search-results" hidden></div>
      </div>
      <div class="map-legend">
        <span><i style="background:${COLORS.green}" aria-hidden="true"></i>Aktif bulan ini</span>
        <span><i style="background:${COLORS.red}" aria-hidden="true"></i>Nonaktif bulan ini</span>
      </div>
      <button type="button" id="mReset" class="map-reset-btn" title="Kembalikan tampilan peta">${svgIcon('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>')}</button>
      <div id="leaflet-map" role="img" aria-label="Peta sebaran lokasi toko"></div>
    </div>
    <div class="reveal" id="mapCaption" style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink-faint);margin-top:8px;"></div>
  `;

  const state = { dist:'all', show:'all' };
  let layerGroup = null;
  const defaultView = { center:[-1.2, 103.2], zoom:6 };

  const map = L.map('leaflet-map', { scrollWheelZoom:true, preferCanvas:true }).setView(defaultView.center, defaultView.zoom);
  activeMap = map;
  const canvasRenderer = L.canvas({ padding: 0.5 });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 18
  }).addTo(map);

  function filteredList(){
    return tokoAll.filter(t => {
      if(state.dist!=='all' && t.dist_code!==state.dist) return false;
      const active = Number(t.total_qty) > 0;
      if(state.show==='active') return active;
      if(state.show==='inactive') return !active;
      return true;
    });
  }

  function renderKpis(){
    const scoped = state.dist==='all' ? tokoAll : tokoAll.filter(t=>t.dist_code===state.dist);
    const active = scoped.filter(t => Number(t.total_qty) > 0).length;
    const missing = scoped.filter(t => !hasGeo(t));
    document.getElementById('mapKpis').innerHTML = `
      <div class="card"><div class="card-title">Total Toko${state.dist==='all'?' Terdaftar':' \u00b7 '+state.dist}</div><div class="kpi-value">${fmt(scoped.length)}</div></div>
      <div class="card"><div class="card-title">Aktif Bulan Ini</div><div class="kpi-value">${fmt(active)}</div><div class="kpi-delta">${scoped.length?(active/scoped.length*100).toFixed(1):'0.0'}% dari toko ini</div></div>
      <div class="card"><div class="card-title">Nonaktif Bulan Ini</div><div class="kpi-value">${fmt(scoped.length-active)}</div><div class="kpi-delta">Belum ada transaksi ${MONTHS_ID[month]}</div></div>
      <button type="button" class="card card-btn" id="mMissingCard" aria-expanded="false"><div class="card-title">Tanpa Titik Koordinat</div><div class="kpi-value">${fmt(missing.length)}</div><div class="kpi-delta">Klik untuk lihat daftar &darr;</div></button>
    `;
    document.getElementById('mMissingCard').addEventListener('click', () => toggleMissingPanel(missing));
  }

  function toggleMissingPanel(missing){
    const panel = document.getElementById('missingGeoPanel');
    const btn = document.getElementById('mMissingCard');
    const isOpen = panel.style.display !== 'none';
    if(isOpen){ panel.style.display = 'none'; btn.setAttribute('aria-expanded','false'); return; }
    btn.setAttribute('aria-expanded','true');
    panel.style.display = 'block';
    panel.innerHTML = `
      <div class="table-wrap">
        <div style="padding:12px 16px;border-bottom:1px solid var(--line);font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--ink-faint);">
          ${fmt(missing.length)} toko belum punya titik koordinat${state.dist==='all'?'':' \u00b7 '+state.dist}
        </div>
        <table>
          <caption class="sr-only">Daftar toko tanpa titik koordinat</caption>
          <thead><tr><th>Toko</th><th>Distributor</th><th>Zona</th><th class="num">Transaksi Terakhir</th></tr></thead>
          <tbody>
            ${missing.slice(0,500).map(t => `
              <tr>
                <td>${esc(t.cust_name||t.cust_code)}<br><span class="mono" style="color:var(--ink-faint);font-size:11px;">${esc(t.cust_code)}</span></td>
                <td><span class="tag-code">${esc(t.dist_code)}</span> ${esc(t.dist_name||'')}</td>
                <td>${esc(t.zona||'\u2013')}</td>
                <td class="num mono">${relDate(t.last_transaction)}</td>
              </tr>
            `).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--ink-faint);padding:20px;">Semua toko sudah punya titik koordinat.</td></tr>`}
          </tbody>
        </table>
        ${missing.length>500?`<div style="padding:10px 16px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--ink-faint);">Menampilkan 500 dari ${fmt(missing.length)} toko.</div>`:''}
      </div>
    `;
  }

  function popupHTML(t){
    const active = Number(t.total_qty) > 0;
    return `
      <b>${esc(t.cust_name||'Tanpa nama')}</b><br>
      <span style="color:#645E52">${esc(t.dist_name||'')}</span><br>
      Zona: ${esc(t.zona||'\u2013')}<br>
      Status: <strong style="color:${active?COLORS.green:COLORS.red}">${active?'Aktif':'Nonaktif'} bulan ini</strong><br>
      Tonase ${MONTHS_ID[month]}: ${fmt(t.total_qty,1)} ton<br>
      Jumlah DO: ${fmt(t.num_do)}<br>
      Transaksi terakhir: ${relDate(t.last_transaction)}
    `;
  }

  function drawMarkers(){
    if(layerGroup) map.removeLayer(layerGroup);
    layerGroup = L.layerGroup();
    const list = filteredList().filter(hasGeo);
    list.forEach(t => {
      const active = Number(t.total_qty) > 0;
      const m = L.circleMarker([t.latitude, t.longitude], {
        renderer: canvasRenderer,
        radius: active ? 4.5 : 3.5, weight: 1,
        color: active ? '#2F6B44' : '#8F3823',
        fillColor: active ? COLORS.green : COLORS.red, fillOpacity: .8
      });
      m.bindPopup(popupHTML(t));
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

  function redraw(){
    renderKpis();
    document.getElementById('missingGeoPanel').style.display = 'none';
    drawMarkers();
  }

  document.getElementById('mDist').addEventListener('change', e => { state.dist = e.target.value; redraw(); });
  document.querySelectorAll('.chip[data-v]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip[data-v]').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-pressed','false'); });
      chip.classList.add('active'); chip.setAttribute('aria-pressed','true');
      state.show = chip.dataset.v;
      redraw();
    });
  });
  document.getElementById('mReset').addEventListener('click', () => map.setView(defaultView.center, defaultView.zoom));

  // Pencarian nama/kode toko — cari di seluruh data (bukan cuma yang lolos filter), supaya toko tanpa koordinat pun tetap bisa ditemukan
  const searchInput = document.getElementById('mSearch');
  const resultsBox = document.getElementById('mSearchResults');
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if(q.length < 2){ resultsBox.hidden = true; resultsBox.innerHTML = ''; return; }
    const matches = tokoAll.filter(t =>
      (t.cust_name||'').toLowerCase().includes(q) || (t.cust_code||'').toLowerCase().includes(q)
    ).slice(0,8);
    if(!matches.length){
      resultsBox.innerHTML = `<div class="map-search-empty">Tidak ditemukan.</div>`;
      resultsBox.hidden = false;
      return;
    }
    resultsBox.innerHTML = matches.map((t,i) => {
      const geo = hasGeo(t);
      return `<button type="button" class="map-search-item${geo?'':' no-geo'}" data-idx="${i}" ${geo?'':'disabled'}>
        <span class="msi-name">${esc(t.cust_name||t.cust_code)}</span>
        <span class="msi-meta">${esc(t.dist_code)}${geo?'':' \u00b7 tanpa koordinat'}</span>
      </button>`;
    }).join('');
    resultsBox.hidden = false;
    resultsBox.querySelectorAll('.map-search-item').forEach((btn,i) => {
      btn.addEventListener('click', () => {
        const t = matches[i];
        map.setView([t.latitude, t.longitude], 15);
        L.popup().setLatLng([t.latitude, t.longitude]).setContent(popupHTML(t)).openOn(map);
        resultsBox.hidden = true; searchInput.value = t.cust_name||t.cust_code;
      });
    });
  });
  document.addEventListener('click', (e) => {
    if(!e.target.closest('.map-search')) resultsBox.hidden = true;
  });

  redraw();
}
