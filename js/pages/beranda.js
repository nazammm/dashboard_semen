// Halaman: Beranda
async function renderBeranda(app){
  const [dists, distMonthly, transMonthly, produk, targetDist] = await Promise.all([
    DataSource.distributors(), DataSource.distMonthlyTotals(), DataSource.transaksiMonthly(), DataSource.produk(), DataSource.targetDist()
  ]);
  const distOptions = dists.filter(d => d.tag === 'Distributor').sort((a,b) => a.dist_code.localeCompare(b.dist_code));
  const jenisList = [...new Set(produk.map(p => p.jenis))].sort();
  const productsByJenis = {};
  jenisList.forEach(j => { productsByJenis[j] = produk.filter(p => p.jenis === j).map(p => p.kode); });

  // Peringkat distributor bulan berjalan (tetap, tidak terpengaruh filter dropdown di bawahnya)
  const distNameByCode = Object.fromEntries(distOptions.map(d => [d.dist_code, d.dist_name]));
  const monthsAll2026 = [...new Set(distMonthly.filter(r=>r.year===2026).map(r=>r.month))];
  const heroMonth = monthsAll2026.length ? Math.max(...monthsAll2026) : 8;
  const heroRanking = distMonthly
    .filter(r => r.year===2026 && r.month===heroMonth && distNameByCode[r.dist_code])
    .map(r => ({ dist_code:r.dist_code, dist_name:distNameByCode[r.dist_code], tonase:Number(r.total_qty||0) }))
    .sort((a,b) => b.tonase-a.tonase)
    .slice(0,5);
  const heroTop = heroRanking[0] || { dist_code:'–', dist_name:'Belum ada data', tonase:0 };

  const state = { dist:'all', jenis:'all', period:'ytd', topN:10 };

  app.innerHTML = `
    <section class="hero">
      <div class="hero-grid" aria-hidden="true"></div>
      ${heroNetworkSVG()}
      <div class="hero-inner">
        <nav class="breadcrumb" aria-label="Breadcrumb">Dashboard<span class="sep" aria-hidden="true">/</span><span class="cur">Beranda</span></nav>
        <div class="hero-flex">
          <div class="hero-main">
            <div class="eyebrow">Peringkat Distributor &middot; ${MONTHS_ID[heroMonth]} 2026</div>
            <h1>${esc(heroTop.dist_code)}<br>memimpin bulan ini.</h1>
            <p class="lead">${esc(heroTop.dist_name)} mencatat tonase tertinggi ${MONTHS_ID[heroMonth]} 2026, sebesar ${fmt(heroTop.tonase,1)} ton. Pilih distributor, jenis semen, dan periode di bawah untuk melihat rincian performa keseluruhan.</p>
            <div class="controls" style="margin-top:28px;margin-bottom:0;">
              <div class="control"><label for="bDist" style="color:#8F8874;">Distributor</label>
                <select id="bDist" style="min-width:190px;"><option value="all">Semua Distributor</option>${distOptions.map(d=>`<option value="${esc(d.dist_code)}">${esc(d.dist_code)} \u00b7 ${esc(d.dist_name)}</option>`).join('')}</select>
              </div>
              <div class="control"><label for="bJenis" style="color:#8F8874;">Jenis Semen</label>
                <select id="bJenis"><option value="all">Semua Jenis</option>${jenisList.map(j=>`<option value="${esc(j)}">${esc(j)}</option>`).join('')}</select>
              </div>
              <div class="control"><span id="bPeriodLabel" class="control-group-label" style="color:#8F8874;">Periode</span>
                <div class="pill-row" role="group" aria-labelledby="bPeriodLabel">
                  <button type="button" class="chip active" data-p="ytd" aria-pressed="true" style="background:var(--accent);color:#fff;border-color:var(--accent);">YTD</button>
                  <button type="button" class="chip" data-p="mtd" aria-pressed="false" style="background:#2A2621;color:#EDE9DF;border-color:#443F35;">MTD</button>
                </div>
              </div>
            </div>
            <div class="hero-kpis" id="heroKpis"></div>
          </div>
          <aside class="hero-leaderboard" aria-label="Peringkat distributor berdasarkan tonase bulan ini">
            <div class="hlb-title">Top 5 Tonase &middot; ${MONTHS_ID[heroMonth]} 2026</div>
            <ol class="hlb-list">
              ${heroRanking.map((d,i) => `
                <li class="${i===0?'hlb-first':''}">
                  <span class="hlb-rank">${i+1}</span>
                  <span class="hlb-name">${esc(d.dist_code)}<small>${esc(d.dist_name)}</small></span>
                  <span class="hlb-val">${fmt(d.tonase,1)}<small>ton</small></span>
                </li>
              `).join('') || `<li class="hlb-empty">Belum ada data bulan ini.</li>`}
            </ol>
          </aside>
        </div>
      </div>
    </section>

    <div class="grid g-kpi reveal" id="secondaryKpis"></div>

    <div class="grid g-2-asym" style="margin-top:16px;">
      <div class="card reveal">
        <h2 class="card-title" id="trendTitle">Tren Tonase Bulanan</h2>
        <div class="legend"><span><i style="background:${COLORS.accent}" aria-hidden="true"></i>2026</span><span><i style="background:${COLORS.blueMid}" aria-hidden="true"></i>2025</span></div>
        <div class="chart-box tall"><canvas id="chartTrend" role="img" aria-describedby="chartTrendSR"></canvas></div>
        <p id="chartTrendSR" class="sr-only"></p>
      </div>
      <div class="card reveal">
        <h2 class="card-title" id="productTitle">Bauran Produk</h2>
        <div class="chart-box tall"><canvas id="chartProduct" role="img" aria-label="Diagram donat bauran produk"></canvas></div>
      </div>
    </div>

    <div class="grid g-2-asym" style="margin-top:16px;">
      <div class="card reveal">
        <h2 class="card-title" id="targetTrendTitle">Tren Tonase Aktual vs Target</h2>
        <div class="legend"><span><i style="background:${COLORS.accent}" aria-hidden="true"></i>Aktual</span><span><i style="background:${COLORS.blueMid}" aria-hidden="true"></i>Target (Target Dist)</span></div>
        <div class="chart-box tall"><canvas id="chartActualTarget" role="img" aria-describedby="chartATSR"></canvas></div>
        <p id="chartATSR" class="sr-only"></p>
      </div>
      <div class="card reveal">
        <h2 class="card-title" id="deliveryTitle">Delivery Type</h2>
        <div class="chart-box tall"><canvas id="chartDelivery" role="img" aria-label="Diagram donat tipe pengiriman"></canvas></div>
      </div>
    </div>

    <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:38px;">
      <h2 class="section-title reveal" style="margin:0;">Top Customer <span class="n" id="topCustSub">&middot; berdasarkan tonase</span></h2>
      <div class="pill-row reveal" role="group" aria-label="Jumlah baris yang ditampilkan">
        <button type="button" class="chip active" data-n="10" aria-pressed="true">Top 10</button>
        <button type="button" class="chip" data-n="25" aria-pressed="false">Top 25</button>
        <button type="button" class="chip" data-n="50" aria-pressed="false">Top 50</button>
      </div>
    </div>
    <div class="table-wrap reveal">
      <table>
        <caption class="sr-only">Daftar toko dengan tonase tertinggi sesuai filter aktif</caption>
        <thead><tr>
          <th class="num" style="width:44px;">#</th>
          <th>Toko / Customer</th>
          <th>Distributor</th>
          <th class="num">Jumlah DO</th>
          <th class="num">Tonase</th>
        </tr></thead>
        <tbody id="topCustBody"><tr><td colspan="5" style="text-align:center;color:var(--ink-faint);padding:20px;">Memuat…</td></tr></tbody>
      </table>
    </div>
  `;

  function monthsPresent(year, distCode){
    const src = distCode==='all' ? distMonthly : distMonthly.filter(r=>r.dist_code===distCode);
    return [...new Set(src.filter(r=>r.year===year).map(r=>r.month))];
  }
  function monthAgg(year, month, distCode, productCodes){
    let src = transMonthly.filter(r=>r.year===year && r.month===month);
    if(distCode!=='all') src = src.filter(r=>r.dist_code===distCode);
    if(productCodes) src = src.filter(r=>productCodes.includes(r.product_code));
    return src.reduce((a,r)=>a+Number(r.total_qty||0), 0);
  }

  async function redraw(){
    destroyCharts();
    const distCode = state.dist;
    const productCodes = state.jenis==='all' ? null : productsByJenis[state.jenis];
    const months2026 = monthsPresent(2026, distCode);
    const maxMonth = months2026.length ? Math.max(...months2026) : 8;
    const [sm, em] = state.period==='mtd' ? [maxMonth, maxMonth] : [1, maxMonth];
    const periodLabel = state.period==='mtd' ? `${MONTHS_ID[maxMonth]} 2026 (MTD)` : `Jan\u2013${MONTHS_ID[maxMonth]} 2026 (YTD)`;

    const [cur, prev] = await Promise.all([
      periodSummary(distCode==='all'?null:distCode, 2026, sm, em, productCodes),
      periodSummary(distCode==='all'?null:distCode, 2025, sm, em, productCodes),
    ]);
    const growth = Number(prev.total_qty) > 0 ? ((Number(cur.total_qty)-Number(prev.total_qty))/Number(prev.total_qty)*100) : null;
    const avgPerDO = Number(cur.num_do) > 0 ? Number(cur.total_qty)/Number(cur.num_do) : null;

    document.getElementById('heroKpis').innerHTML = `
      <div class="hero-kpi"><div class="lbl">Tonase &middot; ${periodLabel}</div><div class="val mono">${fmtCompact(cur.total_qty)}<small>ton</small></div></div>
      <div class="hero-kpi"><div class="lbl">Pertumbuhan vs 2025</div><div class="val mono">${growth==null?'–':(growth>=0?'+':'')+growth.toFixed(1)+'%'} <small>${growth==null?'':(growth>=0?'▲':'▼')}</small></div></div>
      <div class="hero-kpi"><div class="lbl">Delivery Order</div><div class="val mono">${fmt(cur.num_do)}</div></div>
      <div class="hero-kpi"><div class="lbl">Rata-rata / DO</div><div class="val mono">${avgPerDO==null?'–':avgPerDO.toFixed(1)}<small>ton</small></div></div>
    `;

    const totalStoresRegistered = await DataSource.tokoCount();
    const coverage = totalStoresRegistered > 0 ? (Number(cur.num_active_stores)/totalStoresRegistered*100) : null;
    document.getElementById('secondaryKpis').innerHTML = `
      <div class="card"><div class="card-title">Toko Aktif &middot; ${periodLabel}</div><div class="kpi-value">${fmt(cur.num_active_stores)}</div><div class="kpi-delta">Toko dengan transaksi</div></div>
      <div class="card"><div class="card-title">Cakupan Toko Aktif</div><div class="kpi-value">${coverage==null?'–':coverage.toFixed(1)+'%'}</div><div class="kpi-delta">Dari ${fmt(totalStoresRegistered)} toko terdaftar</div></div>
      <div class="card"><div class="card-title">Order Qty &middot; ${periodLabel}</div><div class="kpi-value">${fmtCompact(cur.order_qty)}<span class="unit">zak</span></div></div>
      <div class="card"><div class="card-title">Tonase Periode Sama 2025</div><div class="kpi-value">${fmtCompact(prev.total_qty)}<span class="unit">ton</span></div><div class="kpi-delta">Pembanding</div></div>
    `;

    const jenisSuffix = state.jenis==='all' ? '' : ' \u00b7 '+state.jenis;
    document.getElementById('trendTitle').textContent = `Tren Tonase Bulanan \u00b7 2025 vs 2026${distCode==='all'?'':' \u00b7 '+distCode}${jenisSuffix}`;
    document.getElementById('productTitle').textContent = `Bauran Produk \u00b7 ${periodLabel}`;
    document.getElementById('topCustSub').textContent = `\u00b7 berdasarkan tonase \u00b7 ${periodLabel}${distCode==='all'?'':' \u00b7 '+distCode}${jenisSuffix}`;

    const monthsLabels = MONTHS_ID.slice(1);
    const series2026 = monthsLabels.map((_,i) => monthAgg(2026, i+1, distCode, productCodes) || null);
    const series2025 = monthsLabels.map((_,i) => monthAgg(2025, i+1, distCode, productCodes) || null);
    document.getElementById('chartTrendSR').textContent = chartSRSummary(monthsLabels, series2026, 'ton (2026)');
    newChart(document.getElementById('chartTrend'), {
      type:'line',
      data:{ labels:monthsLabels, datasets:[
        { label:'2026', data:series2026, borderColor:COLORS.accent, backgroundColor:COLORS.accentSoft, fill:true, tension:.35, pointRadius:3, pointBackgroundColor:COLORS.accent, borderWidth:2.5 },
        { label:'2025', data:series2025, borderColor:COLORS.blueMid, borderDash:[5,4], fill:false, tension:.35, pointRadius:2.5, pointBackgroundColor:COLORS.blueMid, borderWidth:2 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        scales:{ y:{ grid:{color:COLORS.line}, ticks:{ callback:v=>fmtCompact(v) } }, x:{ grid:{display:false} } },
        plugins:{ tooltip:{ callbacks:{ label:c=>` ${c.dataset.label}: ${fmt(c.parsed.y)} ton` } } }
      }
    });

    let prodRows = transMonthly.filter(r => r.year===2026 && r.month>=sm && r.month<=em && (distCode==='all' || r.dist_code===distCode));
    if(productCodes) prodRows = prodRows.filter(r => productCodes.includes(r.product_code));
    const prodMap = groupSum(prodRows, r => r.product_name, r => Number(r.total_qty));
    const prodEntries = [...prodMap.entries()].sort((a,b) => b[1]-a[1]);
    newChart(document.getElementById('chartProduct'), {
      type:'doughnut',
      data:{ labels: prodEntries.map(e=>e[0]), datasets:[{ data: prodEntries.map(e=>e[1]), backgroundColor: PALETTE, borderColor:'#F8F6F0', borderWidth:2 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'62%', plugins: donutPercentPlugins('ton') }
    });

    document.getElementById('targetTrendTitle').textContent = `Tren Tonase Aktual vs Target${distCode==='all'?'':' \u00b7 '+distCode}`;
    document.getElementById('deliveryTitle').textContent = `Delivery Type \u00b7 ${periodLabel}`;

    const targetByMonth = {};
    targetDist.forEach(r => {
      if(distCode!=='all' && r.dist_code!==distCode) return;
      targetByMonth[r.month_num] = (targetByMonth[r.month_num]||0) + Number(r.target||0);
    });
    const actualSeries = monthsLabels.map((_,i) => monthAgg(2026, i+1, distCode, null) || 0);
    const targetSeries = monthsLabels.map((_,i) => targetByMonth[i+1] || null);
    document.getElementById('chartATSR').textContent = chartSRSummary(monthsLabels, actualSeries, 'ton aktual');
    newChart(document.getElementById('chartActualTarget'), {
      type:'bar',
      data:{ labels:monthsLabels, datasets:[
        { label:'Aktual', data:actualSeries, backgroundColor:COLORS.accent, borderRadius:3, maxBarThickness:26, order:2 },
        { label:'Target', data:targetSeries, type:'line', borderColor:COLORS.blueMid, borderDash:[5,4], borderWidth:2.5, pointRadius:2.5, fill:false, tension:.3, order:1 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        scales:{ y:{ grid:{color:COLORS.line}, ticks:{ callback:v=>fmtCompact(v) } }, x:{ grid:{display:false} } },
        plugins:{ tooltip:{ callbacks:{ label:c=>` ${c.dataset.label}: ${fmt(c.parsed.y)} ton` } } }
      }
    });

    const delivery = await deliveryTypeBreakdown(distCode==='all'?null:distCode, 2026, sm, em, productCodes);
    const deliverySorted = [...delivery].sort((a,b) => Number(b.total_qty)-Number(a.total_qty));
    const topDelivery = deliverySorted.slice(0,6);
    const restSum = deliverySorted.slice(6).reduce((a,r) => a+Number(r.total_qty), 0);
    const deliveryLabels = topDelivery.map(r=>r.delivery_type);
    const deliveryValues = topDelivery.map(r=>Number(r.total_qty));
    if(restSum > 0){ deliveryLabels.push('Lainnya'); deliveryValues.push(restSum); }
    newChart(document.getElementById('chartDelivery'), {
      type:'doughnut',
      data:{ labels: deliveryLabels, datasets:[{ data: deliveryValues, backgroundColor: PALETTE, borderColor:'#F8F6F0', borderWidth:2 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'62%', plugins: donutPercentPlugins('ton') }
    });

    const top = await topCustomers(distCode==='all'?null:distCode, 2026, sm, em, productCodes, state.topN);
    document.getElementById('topCustBody').innerHTML = top.map((c,i) => `
      <tr>
        <td class="num mono">${i+1}</td>
        <td>${esc(c.cust_name || c.customer_code)}</td>
        <td><span class="tag-code">${esc(c.dist_code)}</span> ${esc(c.dist_name||'')}</td>
        <td class="num mono">${fmt(c.num_do)}</td>
        <td class="num mono">${fmt(c.total_qty)}</td>
      </tr>
    `).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--ink-faint);padding:20px;">Tidak ada data untuk filter ini.</td></tr>`;
  }

  document.getElementById('bDist').addEventListener('change', e => { state.dist = e.target.value; redraw(); });
  document.getElementById('bJenis').addEventListener('change', e => { state.jenis = e.target.value; redraw(); });

  document.querySelectorAll('.hero .pill-row .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.hero .pill-row .chip').forEach(c => {
        c.classList.remove('active'); c.setAttribute('aria-pressed','false');
        c.style.background='#2A2621'; c.style.color='#EDE9DF'; c.style.borderColor='#443F35';
      });
      chip.classList.add('active'); chip.setAttribute('aria-pressed','true');
      chip.style.background = COLORS.accent; chip.style.color = '#fff'; chip.style.borderColor = COLORS.accent;
      state.period = chip.dataset.p;
      redraw();
    });
  });
  document.querySelectorAll('.pill-row .chip[data-n]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.pill-row .chip[data-n]').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-pressed','false'); });
      chip.classList.add('active'); chip.setAttribute('aria-pressed','true');
      state.topN = +chip.dataset.n;
      redraw();
    });
  });

  redraw();
}
