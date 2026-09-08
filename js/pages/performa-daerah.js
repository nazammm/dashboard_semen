// Halaman: Performa Daerah (cement_targets)
async function renderPerformaDaerah(app){
  const rows = await DataSource.cementTargets();
  const regions = [...new Set(rows.map(r=>r.region))].sort();
  const distributors = [...new Set(rows.map(r=>r.distributor))].sort();
  const types = [...new Set(rows.map(r=>r.type_cement))].sort();

  const filters = { region:'all', distributor:'all', type:'all' };
  let sortKey = 'month_num', sortDir = 1;

  const filtersHTML = `
    <div class="controls" style="margin-bottom:0;">
      <div class="control"><label for="fRegion">Region</label><select id="fRegion"><option value="all">Semua Region</option>${regions.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></div>
      <div class="control"><label for="fDist">Distributor</label><select id="fDist"><option value="all">Semua Distributor</option>${distributors.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></div>
      <div class="control"><label for="fType">Tipe Semen</label><select id="fType"><option value="all">Semua Tipe</option>${types.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></div>
    </div>
  `;

  app.innerHTML = `
    ${pageHeader({
      breadcrumb:['Dashboard','Performa Daerah'],
      eyebrow:'Rangkuman Regional',
      title:'Performa Daerah',
      desc:'Realisasi Delivery Order dan Toko Aktif terhadap target 2026, dibandingkan dengan realisasi periode yang sama tahun 2025.',
      status:'Sumber: cement_targets',
      filtersHTML
    })}

    <div id="pdKpis" class="grid g-kpi reveal"></div>

    <div class="grid g-2" style="margin-top:14px;">
      <div class="card reveal">
        <h2 class="card-title">Delivery Order per Bulan (Ton)</h2>
        <div class="legend"><span><i style="background:${COLORS.accent}" aria-hidden="true"></i>Realisasi 2026</span><span><i style="background:${COLORS.blueMid}" aria-hidden="true"></i>Target 2026</span><span><i style="background:${COLORS.ink};opacity:.35" aria-hidden="true"></i>Realisasi 2025</span></div>
        <div class="chart-box tall"><canvas id="chartDO" role="img" aria-describedby="chartDOSR"></canvas></div>
        <p id="chartDOSR" class="sr-only"></p>
      </div>
      <div class="card reveal">
        <h2 class="card-title">Toko Aktif per Bulan</h2>
        <div class="legend" id="taLegend"><span><i style="background:${COLORS.accent}" aria-hidden="true"></i>Realisasi</span><span><i style="background:${COLORS.blueMid}" aria-hidden="true"></i>Target</span></div>
        <div class="chart-box tall"><canvas id="chartTA" role="img" aria-describedby="chartTASR"></canvas></div>
        <p id="chartTASR" class="sr-only"></p>
      </div>
    </div>

    <h2 class="section-title reveal">Rincian per Bulan</h2>
    <div class="table-wrap reveal">
      <table id="pdTable">
        <caption class="sr-only">Rincian capaian DO dan Toko Aktif per bulan terhadap target</caption>
        <thead><tr>
          <th data-k="month_num" aria-sort="ascending">Bulan</th>
          <th class="num" data-k="target_do_2026">Target DO</th>
          <th data-k="capaian_do">Capaian DO</th>
          <th class="num" data-k="do_2026">DO 2026 (Ton)</th>
          <th class="num" data-k="growth_do">YoY vs 2025</th>
          <th class="num" data-k="ta_2026">Toko Aktif</th>
          <th class="num" data-k="target_ta_2026">Target TA</th>
          <th data-k="capaian_ta">Capaian TA</th>
        </tr></thead>
        <tbody id="pdTbody"></tbody>
      </table>
    </div>
  `;

  function computeAgg(list){
    const sum = (f) => list.reduce((a,r)=>a+Number(r[f]||0),0);
    return {
      do_2026: sum('do_2026'), target_do_2026: sum('target_do_2026'), do_2025: sum('do_2025'),
      ta_2026: sum('ta_distinct_2026'), target_ta_2026: sum('target_ta_2026'), ta_2025: sum('ta_distinct_2025'),
    };
  }

  function applyFilters(){
    return rows.filter(r =>
      (filters.region==='all' || r.region===filters.region) &&
      (filters.distributor==='all' || r.distributor===filters.distributor) &&
      (filters.type==='all' || r.type_cement===filters.type)
    );
  }

  function redraw(){
    destroyCharts();
    const filtered = applyFilters();
    const agg = computeAgg(filtered);
    const growth = agg.do_2025>0 ? ((agg.do_2026-agg.do_2025)/agg.do_2025*100) : null;

    document.getElementById('pdKpis').innerHTML = `
      <div class="card"><div class="card-title">Realisasi DO 2026</div><div class="kpi-value">${fmtCompact(agg.do_2026)}<span class="unit">ton</span></div><div class="kpi-delta">${capaianHTML(agg.do_2026, agg.target_do_2026)}</div></div>
      <div class="card"><div class="card-title">Target DO 2026</div><div class="kpi-value">${fmtCompact(agg.target_do_2026)}<span class="unit">ton</span></div><div class="kpi-delta">Akumulasi target tahunan</div></div>
      <div class="card"><div class="card-title">Pertumbuhan vs 2025</div><div class="kpi-value" style="color:${growth==null?'inherit':growth>=0?'var(--green)':'var(--red)'}">${growth==null?'–':(growth>=0?'+':'')+growth.toFixed(1)+'%'}</div><div class="kpi-delta">Realisasi DO tahun berjalan</div></div>
      <div class="card"><div class="card-title">Toko Aktif 2026</div><div class="kpi-value">${fmt(agg.ta_2026)}</div><div class="kpi-delta">${capaianHTML(agg.ta_2026, agg.target_ta_2026)}</div></div>
    `;

    const byMonth = {};
    for(let m=1;m<=12;m++) byMonth[m] = { do26:0, tdo:0, do25:0, ta26:0, tta:0 };
    const isAllTypes = filters.type === 'all';
    const taField = isAllTypes ? 'ta_distinct_2026' : 'ta_2026';
    filtered.forEach(r => {
      const b = byMonth[r.month_num]; if(!b) return;
      b.do26 += Number(r.do_2026||0); b.tdo += Number(r.target_do_2026||0); b.do25 += Number(r.do_2025||0);
      b.ta26 += Number(r[taField]||0); b.tta += Number(r.target_ta_2026||0);
    });
    const labels = MONTHS_ID.slice(1);
    const do26Series = labels.map((_,i)=>byMonth[i+1].do26);
    document.getElementById('chartDOSR').textContent = chartSRSummary(labels, do26Series, 'ton realisasi 2026');
    newChart(document.getElementById('chartDO'), {
      type:'bar',
      data:{ labels, datasets:[
        { label:'Realisasi 2026', data:do26Series, backgroundColor:COLORS.accent, maxBarThickness:26, order:2 },
        { label:'Realisasi 2025', data:labels.map((_,i)=>byMonth[i+1].do25), backgroundColor:'rgba(33,30,25,.22)', borderRadius:3, maxBarThickness:26, order:3 },
        { label:'Target 2026', data:labels.map((_,i)=>byMonth[i+1].tdo), type:'line', borderColor:COLORS.blueMid, backgroundColor:COLORS.blueMid, borderDash:[4,3], borderWidth:2, pointRadius:2, fill:false, tension:.3, order:1 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        scales:{ y:{ grid:{color:COLORS.line}, ticks:{ callback:v=>fmtCompact(v) } }, x:{ grid:{display:false} } },
        plugins:{ tooltip:{ callbacks:{ label:c=>` ${c.dataset.label}: ${fmt(c.parsed.y)}` } } } }
    });
    const ta26Series = labels.map((_,i)=>byMonth[i+1].ta26);
    document.getElementById('chartTASR').textContent = chartSRSummary(labels, ta26Series, 'toko aktif');
    document.getElementById('taLegend').innerHTML = isAllTypes
      ? `<span><i style="background:${COLORS.accent}" aria-hidden="true"></i>Realisasi</span><span><i style="background:${COLORS.blueMid}" aria-hidden="true"></i>Target</span>`
      : `<span><i style="background:${COLORS.accent}" aria-hidden="true"></i>Realisasi (${esc(filters.type)}, tanpa target)</span>`;
    const taDatasets = [
      { label:'Realisasi', data:ta26Series, backgroundColor:COLORS.accent, maxBarThickness:26 },
    ];
    if(isAllTypes){
      taDatasets.push({ label:'Target', data:labels.map((_,i)=>byMonth[i+1].tta), type:'line', borderColor:COLORS.blueMid, borderDash:[4,3], borderWidth:2, pointRadius:2, fill:false, tension:.3 });
    }
    newChart(document.getElementById('chartTA'), {
      type:'bar',
      data:{ labels, datasets:taDatasets },
      options:{ responsive:true, maintainAspectRatio:false,
        scales:{ y:{ grid:{color:COLORS.line} }, x:{ grid:{display:false} } },
        plugins:{ tooltip:{ callbacks:{ label:c=>` ${c.dataset.label}: ${fmt(c.parsed.y)}` } } } }
    });

    const byMonthRow = {};
    filtered.forEach(r => {
      if(!byMonthRow[r.month_num]) byMonthRow[r.month_num] = { month_num:r.month_num, do_2026:0, target_do_2026:0, do_2025:0, ta_2026:0, target_ta_2026:0 };
      const b = byMonthRow[r.month_num];
      b.do_2026 += Number(r.do_2026||0); b.target_do_2026 += Number(r.target_do_2026||0); b.do_2025 += Number(r.do_2025||0);
      b.ta_2026 += Number(r.ta_distinct_2026||0); b.target_ta_2026 += Number(r.target_ta_2026||0);
    });
    let monthRows = Object.values(byMonthRow).map(b => ({ ...b,
      capaian_do: pct(b.do_2026, b.target_do_2026) ?? -1,
      capaian_ta: pct(b.ta_2026, b.target_ta_2026) ?? -1,
      growth_do: b.do_2025>0 ? (b.do_2026-b.do_2025)/b.do_2025*100 : -9999,
    }));
    monthRows.sort((a,b) => sortDir * (a[sortKey]-b[sortKey] || a.month_num-b.month_num));
    document.getElementById('pdTbody').innerHTML = monthRows.map(r => `
      <tr>
        <td><strong>${MONTHS_ID[r.month_num]}</strong></td>
        <td class="num mono">${fmt(r.target_do_2026)}</td>
        <td>${capaianHTML(r.do_2026, r.target_do_2026)}</td>
        <td class="num mono">${fmt(r.do_2026)}</td>
        <td class="num mono" style="color:${r.growth_do>=0?'var(--green)':'var(--red)'}">${r.growth_do===-9999?'–':(r.growth_do>=0?'+':'')+r.growth_do.toFixed(1)+'%'}</td>
        <td class="num mono">${fmt(r.ta_2026)}</td>
        <td class="num mono">${fmt(r.target_ta_2026)}</td>
        <td>${capaianHTML(r.ta_2026, r.target_ta_2026)}</td>
      </tr>
    `).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--ink-faint);padding:24px;">Tidak ada data untuk filter ini.</td></tr>`;
  }

  document.getElementById('fRegion').addEventListener('change', e => { filters.region = e.target.value; redraw(); });
  document.getElementById('fDist').addEventListener('change', e => { filters.distributor = e.target.value; redraw(); });
  document.getElementById('fType').addEventListener('change', e => { filters.type = e.target.value; redraw(); });
  document.querySelectorAll('#pdTable thead th[data-k]').forEach(th => {
    th.setAttribute('tabindex','0'); th.setAttribute('role','button');
    const activate = () => {
      const k = th.dataset.k;
      sortDir = (sortKey===k) ? -sortDir : -1;
      sortKey = k;
      document.querySelectorAll('#pdTable thead th[data-k]').forEach(h => h.removeAttribute('aria-sort'));
      th.setAttribute('aria-sort', sortDir===1?'ascending':'descending');
      redraw();
    };
    th.addEventListener('click', activate);
    th.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); activate(); } });
  });

  redraw();
}
