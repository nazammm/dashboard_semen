// Halaman: Rekap Harian (matriks tanggal x distributor) + Rekap Mingguan vs Target
async function renderRekapHarian(app){
  const [monthly, dists, produk, targetDist] = await Promise.all([
    DataSource.monthlyTotals(), DataSource.distributors(), DataSource.produk(), DataSource.targetDist()
  ]);

  const distCodes = dists.filter(d => d.tag === 'Distributor').map(d => d.dist_code).sort();
  const jenisList = [...new Set(produk.map(p => p.jenis))].sort();
  const productsByJenis = {};
  jenisList.forEach(j => { productsByJenis[j] = produk.filter(p => p.jenis === j).map(p => p.kode); });

  function targetMapForMonth(month){
    const map = {};
    targetDist.filter(r => r.month_num === month).forEach(r => { map[r.dist_code] = Number(r.target || 0); });
    return map;
  }

  // hanya periode mulai Januari 2026
  const periods = [...monthly].map(r => ({ year:r.year, month:r.month }))
    .filter(p => p.year >= 2026)
    .sort((a,b) => a.year-b.year || a.month-b.month);
  const defaultPeriod = periods[periods.length-1] || { year:2026, month:8 };

  const state = { year: defaultPeriod.year, month: defaultPeriod.month, jenis:'all' };

  const filtersHTML = `
    <div class="controls" style="margin-bottom:0;">
      <div class="control"><label for="rBulan">Bulan</label>
        <select id="rBulan">${periods.map(p => `<option value="${p.year}-${p.month}" ${p.year===state.year&&p.month===state.month?'selected':''}>${MONTHS_ID[p.month]} ${p.year}</option>`).join('')}</select>
      </div>
      <div class="control"><label for="rJenis">Jenis Semen</label>
        <select id="rJenis"><option value="all">Semua Jenis</option>${jenisList.map(j=>`<option value="${esc(j)}">${esc(j)}</option>`).join('')}</select>
      </div>
    </div>
  `;

  app.innerHTML = `
    ${pageHeader({
      breadcrumb:['Dashboard','Rekap Harian'],
      eyebrow:'Rekap Transaksi Harian',
      title:'Tonase Harian',
      desc:'Rincian tonase (ton) per hari untuk setiap distributor dalam satu bulan. Hari Minggu dan tanggal merah nasional ditandai.',
      status:'Data tersinkronisasi',
      filtersHTML
    })}
    <div id="rKpis" class="grid g-kpi reveal"></div>
    <div class="table-wrap reveal" style="margin-top:16px;">
      <table id="rTable" class="mono">
        <thead><tr id="rHeadRow"></tr></thead>
        <tbody id="rBody"></tbody>
        <tfoot><tr id="rFootRow"></tr></tfoot>
      </table>
    </div>

    <h2 class="section-title reveal" style="margin-top:34px;">Rekap Mingguan <span class="n">&middot; tonase per minggu vs target bulanan &middot; hanya terpengaruh filter bulan</span></h2>
    <div class="table-wrap reveal">
      <table id="wTable" class="mono">
        <thead><tr id="wHeadRow"></tr></thead>
        <tbody id="wBody"></tbody>
      </table>
    </div>

    <h2 class="section-title reveal" style="margin-top:30px;">Rekap Mingguan vs Target <span class="n">&middot; capaian kumulatif per minggu terhadap ekspektasi pacing hari kerja</span></h2>
    <p class="page-desc" style="margin-top:-4px;max-width:720px;">Ambang tiap minggu dihitung otomatis dari proporsi hari kerja kumulatif (hari selain Minggu &amp; tanggal merah nasional, cuti bersama tetap dihitung hari kerja) terhadap total hari kerja sebulan.</p>
    <div class="legend reveal"><span><i style="background:${COLORS.accent}" aria-hidden="true"></i>Capaian &ge; ambang pacing minggu itu</span><span><i style="background:${COLORS.red}" aria-hidden="true"></i>Di bawah ambang</span></div>
    <div class="table-wrap reveal">
      <table id="pTable" class="mono">
        <thead><tr id="pHeadRow"></tr></thead>
        <tbody id="pBody"></tbody>
      </table>
    </div>
  `;

  async function redraw(){
    const productCodes = state.jenis==='all' ? null : productsByJenis[state.jenis];
    const rows = await dailyMatrix(state.year, state.month, productCodes);

    const valMap = new Map();
    rows.forEach(r => valMap.set(`${r.do_date}|${r.dist_code}`, Number(r.total_qty)));

    const daysInMonth = new Date(state.year, state.month, 0).getDate();
    const colTotal = {}; distCodes.forEach(c => colTotal[c] = 0);
    let grandTotal = 0, activeDays = 0;

    document.getElementById('rHeadRow').innerHTML = `
      <th style="min-width:80px;">Tanggal</th>
      ${distCodes.map(c => `<th class="num">${esc(c)}</th>`).join('')}
      <th class="num" style="background:var(--accent-soft);">TOTAL</th>
    `;

    let bodyHTML = '';
    for(let d=1; d<=daysInMonth; d++){
      const dateObj = new Date(state.year, state.month-1, d);
      const iso = `${state.year}-${String(state.month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const isSunday = dateObj.getDay() === 0;
      const isHoliday = HOLIDAYS_ID_2026.includes(iso);
      const isRedDate = isSunday || isHoliday;
      let rowTotal = 0;
      const cells = distCodes.map(c => {
        const v = valMap.get(`${iso}|${c}`) || 0;
        rowTotal += v; colTotal[c] += v;
        if(!v) return `<td class="num"><span style="color:var(--ink-faint)">–</span></td>`;
        const href = `#transaksi-detail?date=${iso}&dist=${encodeURIComponent(c)}&jenis=${encodeURIComponent(state.jenis)}`;
        return `<td class="num"><a class="cell-link" href="${href}" title="Lihat detail transaksi ${esc(c)} tanggal ${iso}">${fmt(v)}</a></td>`;
      }).join('');
      grandTotal += rowTotal;
      if(rowTotal > 0) activeDays++;
      const dateLabel = `${String(d).padStart(2,'0')}-${MONTHS_ID[state.month]}`;
      const dateCell = rowTotal
        ? `<a class="cell-link" href="#transaksi-detail?date=${iso}&dist=all&jenis=${encodeURIComponent(state.jenis)}" title="Lihat semua transaksi tanggal ${iso}">${dateLabel}</a>`
        : dateLabel;
      bodyHTML += `<tr style="${isRedDate?'background:var(--red-soft);':''}">
        <td class="mono" style="${isRedDate?'color:var(--accent-ink);font-weight:600;':''}">${dateCell}</td>
        ${cells}
        <td class="num mono" style="background:var(--surface-2);font-weight:700;">${rowTotal ? fmt(rowTotal) : '–'}</td>
      </tr>`;
    }
    document.getElementById('rBody').innerHTML = bodyHTML;

    document.getElementById('rFootRow').innerHTML = `
      <td style="font-weight:700;">TOTAL</td>
      ${distCodes.map(c => `<td class="num mono" style="font-weight:700;background:var(--surface-2);">${colTotal[c] ? fmt(colTotal[c]) : '–'}</td>`).join('')}
      <td class="num mono" style="font-weight:800;background:var(--accent-soft);">${fmt(grandTotal)}</td>
    `;

    const topDistCode = Object.entries(colTotal).sort((a,b)=>b[1]-a[1])[0];
    document.getElementById('rKpis').innerHTML = `
      <div class="card"><div class="card-title">Total Tonase &middot; ${MONTHS_ID[state.month]} ${state.year}</div><div class="kpi-value">${fmtCompact(grandTotal)}<span class="unit">ton</span></div></div>
      <div class="card"><div class="card-title">Rata-rata / Hari Aktif</div><div class="kpi-value">${activeDays?fmtCompact(grandTotal/activeDays):'–'}<span class="unit">ton</span></div></div>
      <div class="card"><div class="card-title">Hari Ada Transaksi</div><div class="kpi-value">${fmt(activeDays)}<span class="unit">/ ${daysInMonth} hari</span></div></div>
      <div class="card"><div class="card-title">Distributor Teraktif</div><div class="kpi-value">${topDistCode?esc(topDistCode[0]):'–'}</div><div class="kpi-delta">${topDistCode?fmt(topDistCode[1])+' ton':''}</div></div>
    `;

    await redrawWeekly();
  }

  async function redrawWeekly(){
    // Rekap mingguan & vs-target selalu pakai semua jenis semen. Tidak terpengaruh filter Jenis Semen di halaman ini.
    const rowsAll = await dailyMatrix(state.year, state.month, null);
    const valMapAll = new Map();
    rowsAll.forEach(r => valMapAll.set(`${r.do_date}|${r.dist_code}`, Number(r.total_qty)));

    const buckets = weekBucketsForMonth(state.year, state.month); // bisa 4-6 minggu tergantung bulan
    const nSlots = 6;
    const targetMap = targetMapForMonth(state.month);
    const pad2 = n => String(n).padStart(2,'0');

    const weeklyByDist = {};
    distCodes.forEach(c => {
      weeklyByDist[c] = buckets.map(b => b.days.reduce((s,d) => {
        const iso = `${state.year}-${pad2(state.month)}-${pad2(d)}`;
        return s + (valMapAll.get(`${iso}|${c}`) || 0);
      }, 0));
    });

    const totalWorkingDays = buckets.reduce((s,b) => s + b.workingDays, 0);
    let cumWorking = 0;
    const benchmarks = [];
    for(let i=0;i<nSlots;i++){
      if(i < buckets.length){ cumWorking += buckets[i].workingDays; benchmarks.push(totalWorkingDays>0 ? Math.min(100, cumWorking/totalWorkingDays*100) : 0); }
      else benchmarks.push(benchmarks[i-1] ?? 100);
    }

    // ---- Tabel 1: Rekap Mingguan (tonase) ----
    document.getElementById('wHeadRow').innerHTML = `
      <th style="min-width:70px;">Minggu</th>
      ${distCodes.map(c => `<th class="num">${esc(c)}</th>`).join('')}
      <th class="num" style="background:var(--accent-soft);">TOTAL</th>
    `;
    let wBody = '';
    let targetRowTotal = 0;
    const targetCells = distCodes.map(c => {
      const t = targetMap[c];
      if(t != null) targetRowTotal += t;
      return `<td class="num">${t!=null ? fmt(t) : '<span style="color:var(--ink-faint)">–</span>'}</td>`;
    }).join('');
    wBody += `<tr style="background:var(--accent-soft);font-weight:700;">
      <td>TARGET</td>${targetCells}
      <td class="num" style="font-weight:800;">${fmt(targetRowTotal)}</td>
    </tr>`;

    const colTotal = {}; distCodes.forEach(c => colTotal[c]=0);
    let grand = 0;
    for(let i=0;i<nSlots;i++){
      const has = i < buckets.length;
      let rowTotal = 0;
      const cells = distCodes.map(c => {
        const v = has ? weeklyByDist[c][i] : 0;
        if(has){ colTotal[c] += v; rowTotal += v; }
        return `<td class="num">${has && v ? fmt(v) : '<span style="color:var(--ink-faint)">–</span>'}</td>`;
      }).join('');
      if(has) grand += rowTotal;
      wBody += `<tr><td>M${i+1}</td>${cells}<td class="num" style="background:var(--surface-2);font-weight:700;">${has&&rowTotal?fmt(rowTotal):'–'}</td></tr>`;
    }
    wBody += `<tr style="font-weight:700;border-top:2px solid var(--border-strong);">
      <td>TOTAL</td>
      ${distCodes.map(c => `<td class="num" style="background:var(--surface-2);">${colTotal[c]?fmt(colTotal[c]):'–'}</td>`).join('')}
      <td class="num" style="background:var(--accent-soft);font-weight:800;">${fmt(grand)}</td>
    </tr>`;
    document.getElementById('wBody').innerHTML = wBody;

    // ---- Tabel 2: Rekap Mingguan vs Target (% kumulatif, hijau jika >= ambang pacing) ----
    document.getElementById('pHeadRow').innerHTML = `
      <th style="min-width:120px;">Minggu</th>
      ${distCodes.map(c => `<th class="num">${esc(c)}</th>`).join('')}
      <th class="num" style="background:var(--accent-soft);">TOTAL</th>
    `;
    let pBody = '';
    const cumByDist = {}; distCodes.forEach(c => cumByDist[c]=0);
    let cumTargetTotal = 0; distCodes.forEach(c => { const t=targetMap[c]; if(t!=null) cumTargetTotal += t; });
    for(let i=0;i<nSlots;i++){
      const has = i < buckets.length;
      const bench = benchmarks[i];
      let cumTotalTonase = 0, cumTotalTargetKnown = 0;
      const cells = distCodes.map(c => {
        if(has) cumByDist[c] += weeklyByDist[c][i];
        const t = targetMap[c];
        if(t == null){ return `<td class="num"><span style="color:var(--ink-faint)">–</span></td>`; }
        cumTotalTargetKnown += t; cumTotalTonase += cumByDist[c];
        const p = t>0 ? (cumByDist[c]/t*100) : 0;
        const cls = p >= bench ? 'var(--green)' : 'var(--red)';
        return `<td class="num" style="color:${cls};font-weight:600;">${p.toFixed(2)}%</td>`;
      }).join('');
      const totalP = cumTotalTargetKnown>0 ? (cumTotalTonase/cumTotalTargetKnown*100) : 0;
      const totalCls = totalP >= bench ? 'var(--green)' : 'var(--red)';
      pBody += `<tr><td>%M${i+1} <span style="color:var(--ink-faint);">(${bench.toFixed(1)}%)</span></td>${cells}<td class="num" style="background:var(--surface-2);color:${totalCls};font-weight:700;">${totalP.toFixed(2)}%</td></tr>`;
    }
    document.getElementById('pBody').innerHTML = pBody;
  }

  document.getElementById('rBulan').addEventListener('change', e => {
    const [y,m] = e.target.value.split('-').map(Number);
    state.year = y; state.month = m;
    redraw();
  });
  document.getElementById('rJenis').addEventListener('change', e => { state.jenis = e.target.value; redraw(); });

  redraw();
}
