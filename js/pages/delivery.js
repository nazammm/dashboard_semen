// Halaman: Delivery. Tabel delivery berdiri sendiri, tidak dikaitkan tabel lain, sama seperti cement_targets untuk Performa Daerah.
async function renderDelivery(app){
  const rows = await DataSource.delivery();
  const regions = [...new Set(rows.map(r=>r.region))].sort();
  const subRegions = [...new Set(rows.map(r=>r.sub_region))].sort();
  const types = [...new Set(rows.map(r=>r.type_cement))].sort();

  const filters = { region:'all', subRegion:'all', type:'all' };
  let sortKey = 'month_num', sortDir = 1;

  const filtersHTML = `
    <div class="controls" style="margin-bottom:0;">
      <div class="control"><label for="dRegion">Region</label><select id="dRegion"><option value="all">Semua Region</option>${regions.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></div>
      <div class="control"><label for="dSubRegion">Sub Region</label><select id="dSubRegion"><option value="all">Semua Sub Region</option>${subRegions.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></div>
      <div class="control"><label for="dType">Tipe Semen</label><select id="dType"><option value="all">Semua Tipe</option>${types.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></div>
    </div>
  `;

  app.innerHTML = `
    ${pageHeader({
      breadcrumb:['Dashboard','Delivery'],
      eyebrow:'Rangkuman Delivery Regional',
      title:'Delivery',
      desc:'Realisasi pengiriman (delivery) terhadap target 2026, dibandingkan dengan realisasi periode yang sama tahun 2025.',
      status:'Sumber: delivery',
      filtersHTML
    })}

    <div id="dvKpis" class="grid g-kpi reveal"></div>

    <div class="card reveal" style="margin-top:14px;">
      <h2 class="card-title">Delivery per Bulan (Ton)</h2>
      <div class="legend"><span><i style="background:${COLORS.accent}" aria-hidden="true"></i>Realisasi 2026</span><span><i style="background:${COLORS.blueMid}" aria-hidden="true"></i>Target 2026</span><span><i style="background:${COLORS.ink};opacity:.35" aria-hidden="true"></i>Realisasi 2025</span></div>
      <div class="chart-box tall"><canvas id="chartDelivery" role="img" aria-describedby="chartDeliverySR"></canvas></div>
      <p id="chartDeliverySR" class="sr-only"></p>
    </div>

    <h2 class="section-title reveal">Rincian per Bulan</h2>
    <div class="table-wrap reveal">
      <table id="dvTable">
        <caption class="sr-only">Rincian realisasi delivery per bulan terhadap target</caption>
        <thead><tr>
          <th data-k="month_num" aria-sort="ascending">Bulan</th>
          <th class="num" data-k="target_2026">Target</th>
          <th data-k="capaian">Capaian</th>
          <th class="num" data-k="realisasi_2026">Realisasi 2026 (Ton)</th>
          <th class="num" data-k="growth">YoY vs 2025</th>
          <th class="num" data-k="realisasi_2025">Realisasi 2025 (Ton)</th>
        </tr></thead>
        <tbody id="dvTbody"></tbody>
      </table>
    </div>
  `;

  function computeAgg(list){
    const sum = (f) => list.reduce((a,r)=>a+Number(r[f]||0),0);
    return {
      realisasi_2026: sum('realisasi_2026'), target_2026: sum('target_2026'), realisasi_2025: sum('realisasi_2025'),
    };
  }

  function applyFilters(){
    return rows.filter(r =>
      (filters.region==='all' || r.region===filters.region) &&
      (filters.subRegion==='all' || r.sub_region===filters.subRegion) &&
      (filters.type==='all' || r.type_cement===filters.type)
    );
  }

  function redraw(){
    destroyCharts();
    const filtered = applyFilters();
    const agg = computeAgg(filtered);
    const growth = agg.realisasi_2025>0 ? ((agg.realisasi_2026-agg.realisasi_2025)/agg.realisasi_2025*100) : null;

    document.getElementById('dvKpis').innerHTML = `
      <div class="card"><div class="card-title">Realisasi 2026</div><div class="kpi-value">${fmtCompact(agg.realisasi_2026)}<span class="unit">ton</span></div><div class="kpi-delta">${capaianHTML(agg.realisasi_2026, agg.target_2026)}</div></div>
      <div class="card"><div class="card-title">Target 2026</div><div class="kpi-value">${fmtCompact(agg.target_2026)}<span class="unit">ton</span></div><div class="kpi-delta">Akumulasi target tahunan</div></div>
      <div class="card"><div class="card-title">Pertumbuhan vs 2025</div><div class="kpi-value" style="color:${growth==null?'inherit':growth>=0?'var(--green)':'var(--red)'}">${growth==null?'–':(growth>=0?'+':'')+growth.toFixed(1)+'%'}</div><div class="kpi-delta">Realisasi tahun berjalan</div></div>
      <div class="card"><div class="card-title">Realisasi 2025</div><div class="kpi-value">${fmtCompact(agg.realisasi_2025)}<span class="unit">ton</span></div><div class="kpi-delta">Pembanding</div></div>
    `;

    const byMonth = {};
    for(let m=1;m<=12;m++) byMonth[m] = { r26:0, t26:0, r25:0 };
    filtered.forEach(r => {
      const b = byMonth[r.month_num]; if(!b) return;
      b.r26 += Number(r.realisasi_2026||0); b.t26 += Number(r.target_2026||0); b.r25 += Number(r.realisasi_2025||0);
    });
    const labels = MONTHS_ID.slice(1);
    const r26Series = labels.map((_,i)=>byMonth[i+1].r26);
    document.getElementById('chartDeliverySR').textContent = chartSRSummary(labels, r26Series, 'ton realisasi 2026');
    newChart(document.getElementById('chartDelivery'), {
      type:'bar',
      data:{ labels, datasets:[
        { label:'Realisasi 2026', data:r26Series, backgroundColor:COLORS.accent, maxBarThickness:26, order:2 },
        { label:'Realisasi 2025', data:labels.map((_,i)=>byMonth[i+1].r25), backgroundColor:'rgba(33,30,25,.22)', borderRadius:3, maxBarThickness:26, order:3 },
        { label:'Target 2026', data:labels.map((_,i)=>byMonth[i+1].t26), type:'line', borderColor:COLORS.blueMid, backgroundColor:COLORS.blueMid, borderDash:[4,3], borderWidth:2, pointRadius:2, fill:false, tension:.3, order:1 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        scales:{ y:{ grid:{color:COLORS.line}, ticks:{ callback:v=>fmtCompact(v) } }, x:{ grid:{display:false} } },
        plugins:{ tooltip:{ callbacks:{ label:c=>` ${c.dataset.label}: ${fmt(c.parsed.y)}` } } } }
    });

    const byMonthRow = {};
    filtered.forEach(r => {
      if(!byMonthRow[r.month_num]) byMonthRow[r.month_num] = { month_num:r.month_num, realisasi_2026:0, target_2026:0, realisasi_2025:0 };
      const b = byMonthRow[r.month_num];
      b.realisasi_2026 += Number(r.realisasi_2026||0); b.target_2026 += Number(r.target_2026||0); b.realisasi_2025 += Number(r.realisasi_2025||0);
    });
    let monthRows = Object.values(byMonthRow).map(b => ({ ...b,
      capaian: pct(b.realisasi_2026, b.target_2026) ?? -1,
      growth: b.realisasi_2025>0 ? (b.realisasi_2026-b.realisasi_2025)/b.realisasi_2025*100 : -9999,
    }));
    monthRows.sort((a,b) => sortDir * (a[sortKey]-b[sortKey] || a.month_num-b.month_num));
    document.getElementById('dvTbody').innerHTML = monthRows.map(r => `
      <tr>
        <td><strong>${MONTHS_ID[r.month_num]}</strong></td>
        <td class="num mono">${fmt(r.target_2026)}</td>
        <td>${capaianHTML(r.realisasi_2026, r.target_2026)}</td>
        <td class="num mono">${fmt(r.realisasi_2026)}</td>
        <td class="num mono" style="color:${r.growth>=0?'var(--green)':'var(--red)'}">${r.growth===-9999?'–':(r.growth>=0?'+':'')+r.growth.toFixed(1)+'%'}</td>
        <td class="num mono">${fmt(r.realisasi_2025)}</td>
      </tr>
    `).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--ink-faint);padding:24px;">Tidak ada data untuk filter ini.</td></tr>`;
  }

  document.getElementById('dRegion').addEventListener('change', e => { filters.region = e.target.value; redraw(); });
  document.getElementById('dSubRegion').addEventListener('change', e => { filters.subRegion = e.target.value; redraw(); });
  document.getElementById('dType').addEventListener('change', e => { filters.type = e.target.value; redraw(); });
  document.querySelectorAll('#dvTable thead th[data-k]').forEach(th => {
    th.setAttribute('tabindex','0'); th.setAttribute('role','button');
    const activate = () => {
      const k = th.dataset.k;
      sortDir = (sortKey===k) ? -sortDir : -1;
      sortKey = k;
      document.querySelectorAll('#dvTable thead th[data-k]').forEach(h => h.removeAttribute('aria-sort'));
      th.setAttribute('aria-sort', sortDir===1?'ascending':'descending');
      redraw();
    };
    th.addEventListener('click', activate);
    th.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); activate(); } });
  });

  redraw();
}
