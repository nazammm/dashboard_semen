// Halaman: Tim Sales
async function renderTimSales(app){
  const rows = await DataSource.salesman();
  const dists = [...new Set(rows.map(r=>r.dist_code))].sort();
  const monthsWithActual = [...new Set(rows.filter(r=>r.actual_num_do>0).map(r=>r.month))];
  const defaultMonth = monthsWithActual.length ? Math.max(...monthsWithActual) : 1;

  const filters = { dist:'all', month:defaultMonth, onlyReal:true, topN:10 };
  let sortKey = 'capaian_avg', sortDir = -1;

  const filtersHTML = `
    <div class="controls" style="margin-bottom:0;">
      <div class="control"><label for="sDist">Distributor</label><select id="sDist"><option value="all">Semua Distributor</option>${dists.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('')}</select></div>
      <div class="control"><label for="sMonth">Bulan</label><select id="sMonth">${MONTHS_ID.slice(1).map((m,i)=>`<option value="${i+1}" ${i+1===defaultMonth?'selected':''}>${m} 2026</option>`).join('')}</select></div>
      <div class="control"><span id="sRealLabel" class="control-group-label">Status</span>
        <button type="button" class="chip active" id="sReal" aria-pressed="true" aria-labelledby="sRealLabel sReal">Hanya Salesman Aktif</button>
      </div>
    </div>
  `;

  app.innerHTML = `
    ${pageHeader({
      breadcrumb:['Dashboard','Tim Sales'],
      eyebrow:'Realisasi vs Target',
      title:'Tim Sales',
      desc:'Capaian Toko Aktif (TA) dan tonase tiap salesman terhadap target bulanan, dibandingkan dengan realisasi aktual dari data transaksi.',
      status:'Sumber: salesman_status_target',
      filtersHTML
    })}
    <div id="tsKpis" class="grid g-kpi reveal"></div>
    <div class="grid g-2" style="margin-top:14px;">
      <div class="card reveal">
        <h2 class="card-title" id="topSalesTitle">10 Salesman Teratas &middot; Point</h2>
        <div class="chart-box tall"><canvas id="chartTopSales" role="img" aria-describedby="chartTopSR"></canvas></div>
        <p id="chartTopSR" class="sr-only"></p>
      </div>
      <div class="card reveal">
        <h2 class="card-title">Sebaran Capaian TA (%)</h2>
        <div class="chart-box tall"><canvas id="chartDistrib" role="img" aria-describedby="chartDistSR"></canvas></div>
        <p id="chartDistSR" class="sr-only"></p>
      </div>
    </div>
    <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <h2 class="section-title reveal" style="margin-bottom:14px;">Papan Peringkat</h2>
      <div class="pill-row reveal" role="group" aria-label="Jumlah baris yang ditampilkan">
        <button type="button" class="chip active" data-n="10" aria-pressed="true">Top 10</button>
        <button type="button" class="chip" data-n="25" aria-pressed="false">Top 25</button>
        <button type="button" class="chip" data-n="50" aria-pressed="false">Top 50</button>
      </div>
    </div>
    <div class="table-wrap reveal">
      <table id="tsTable">
        <caption class="sr-only">Papan peringkat performa salesman berdasarkan Point</caption>
        <thead><tr>
          <th data-k="salesman_name">Salesman</th>
          <th data-k="dist_code">Distributor</th>
          <th data-k="capaian_avg" aria-sort="descending">Point</th>
          <th class="num" data-k="actual_ta">TA Aktual</th>
          <th class="num" data-k="target_ta">Target TA</th>
          <th data-k="capaian_ta">Capaian TA</th>
          <th class="num" data-k="actual_tonase">Tonase Aktual</th>
          <th class="num" data-k="target_tonase">Target Tonase</th>
          <th data-k="capaian_tonase">Capaian Tonase</th>
        </tr></thead>
        <tbody id="tsTbody"></tbody>
      </table>
    </div>
  `;

  function getFiltered(){
    return rows.filter(r =>
      r.month === filters.month &&
      (filters.dist==='all' || r.dist_code===filters.dist) &&
      (!filters.onlyReal || r.status==='Sales Real')
    ).map(r => {
      const capaian_ta = pct(r.actual_ta, r.target_ta) ?? -1;
      const capaian_tonase = pct(r.actual_tonase, r.target_tonase) ?? -1;
      const parts = [];
      if(r.target_ta > 0) parts.push(capaian_ta);
      if(r.target_tonase > 0) parts.push(capaian_tonase);
      const capaian_avg = parts.length ? parts.reduce((a,b)=>a+b,0)/parts.length : -1;
      return { ...r, capaian_ta, capaian_tonase, capaian_avg };
    });
  }

  function redraw(){
    destroyCharts();
    const list = getFiltered();
    const withTargetTonase = list.filter(r => r.target_tonase > 0);
    const withTargetTA = list.filter(r => r.target_ta > 0);
    const avgTA = withTargetTA.length ? withTargetTA.reduce((a,r)=>a+r.capaian_ta,0)/withTargetTA.length : null;
    const avgTonase = withTargetTonase.length ? withTargetTonase.reduce((a,r)=>a+r.capaian_tonase,0)/withTargetTonase.length : null;
    const aboveTarget = withTargetTonase.filter(r=>r.capaian_tonase>=100).length;

    document.getElementById('tsKpis').innerHTML = `
      <div class="card"><div class="card-title">Salesman Ditampilkan</div><div class="kpi-value">${fmt(list.length)}</div><div class="kpi-delta">${MONTHS_ID[filters.month]} 2026${filters.onlyReal?' &middot; status aktif':''}</div></div>
      <div class="card"><div class="card-title">Rata-rata Capaian TA</div><div class="kpi-value">${avgTA==null?'–':avgTA.toFixed(0)+'%'}</div><div class="kpi-delta">Toko aktif vs target</div></div>
      <div class="card"><div class="card-title">Rata-rata Capaian Tonase</div><div class="kpi-value">${avgTonase==null?'–':avgTonase.toFixed(0)+'%'}</div><div class="kpi-delta">vs target ${MONTHS_ID[filters.month]} 2026</div></div>
      <div class="card"><div class="card-title">Capai/Lampaui Target</div><div class="kpi-value">${fmt(aboveTarget)}<span class="unit">/ ${fmt(withTargetTonase.length)}</span></div><div class="kpi-delta">Berdasarkan target tonase bulan ini</div></div>
    `;

    const rankable = list.filter(r => r.capaian_avg >= 0);
    const top10 = [...rankable].sort((a,b)=>b.capaian_avg-a.capaian_avg).slice(0,filters.topN);
    const topSalesTitle = document.getElementById('topSalesTitle');
    if(topSalesTitle) topSalesTitle.textContent = `${filters.topN} Salesman Teratas \u00b7 Point`;
    document.getElementById('chartTopSR').textContent = chartSRSummary(top10.map(r=>r.salesman_name), top10.map(r=>r.capaian_avg), '% sales rank');
    newChart(document.getElementById('chartTopSales'), {
      type:'bar',
      data:{ labels: top10.map(r=>r.salesman_name.length>16?r.salesman_name.slice(0,15)+'…':r.salesman_name),
        datasets:[{ data: top10.map(r=>r.capaian_avg), backgroundColor: top10.map(r=>r.capaian_avg>=100?COLORS.accent:COLORS.blueMid), maxBarThickness:22 }] },
      options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false,
        scales:{ x:{ grid:{color:COLORS.line}, ticks:{ callback:v=>v+'%' } }, y:{ grid:{display:false} } },
        plugins:{ tooltip:{ callbacks:{
          title:c=>top10[c[0].dataIndex].salesman_name,
          label:c=>` Point: ${c.parsed.x.toFixed(1)}%  (TA ${top10[c[0].dataIndex].capaian_ta.toFixed(0)}% + Tonase ${top10[c[0].dataIndex].capaian_tonase.toFixed(0)}%) / 2` } } } }
    });

    const buckets = ['0-49%','50-79%','80-99%','100-119%','120%+'];
    const bucketCounts = [0,0,0,0,0];
    withTargetTA.forEach(r => {
      const p = r.capaian_ta;
      if(p<50) bucketCounts[0]++; else if(p<80) bucketCounts[1]++; else if(p<100) bucketCounts[2]++; else if(p<120) bucketCounts[3]++; else bucketCounts[4]++;
    });
    document.getElementById('chartDistSR').textContent = chartSRSummary(buckets, bucketCounts, 'salesman');
    newChart(document.getElementById('chartDistrib'), {
      type:'bar',
      data:{ labels: buckets, datasets:[{ data: bucketCounts, backgroundColor:[COLORS.red,COLORS.amber,'#A8ADB7',COLORS.accent,'#5B6472'], maxBarThickness:44 }] },
      options:{ responsive:true, maintainAspectRatio:false,
        scales:{ y:{ grid:{color:COLORS.line}, ticks:{ precision:0 } }, x:{ grid:{display:false} } },
        plugins:{ tooltip:{ callbacks:{ label:c=>` ${fmt(c.parsed.y)} salesman` } } } }
    });

    list.sort((a,b) => {
      const av=a[sortKey], bv=b[sortKey];
      if(typeof av === 'string') return sortDir * av.localeCompare(bv);
      return sortDir * ((av??-1)-(bv??-1));
    });
    const shown = list.slice(0, filters.topN);
    document.getElementById('tsTbody').innerHTML = shown.map(r => `
      <tr>
        <td><a class="cell-link" href="#transaksi-detail?salesman=${encodeURIComponent(r.salesman_code)}&year=2026&month=${filters.month}&name=${encodeURIComponent(r.salesman_name)}" title="Lihat detail transaksi ${esc(r.salesman_name)} bulan ${MONTHS_ID[filters.month]}">${esc(r.salesman_name)}</a></td>
        <td><span class="tag-code">${esc(r.dist_code)}</span></td>
        <td>${r.capaian_avg>=0 ? `<span class="capaian-label" style="width:auto;color:${r.capaian_avg>=100?'var(--green)':r.capaian_avg>=80?'var(--amber)':'var(--red)'};">${r.capaian_avg.toFixed(1)}%</span>` : '<span style="color:var(--ink-faint)">–</span>'}</td>
        <td class="num mono">${fmt(r.actual_ta)}</td>
        <td class="num mono">${r.target_ta?fmt(r.target_ta):'–'}</td>
        <td>${capaianHTML(r.actual_ta, r.target_ta)}</td>
        <td class="num mono">${fmt(r.actual_tonase)}</td>
        <td class="num mono">${r.target_tonase?fmt(r.target_tonase):'–'}</td>
        <td>${capaianHTML(r.actual_tonase, r.target_tonase)}</td>
      </tr>
    `).join('') || `<tr><td colspan="9" style="text-align:center;color:var(--ink-faint);padding:24px;">Tidak ada data untuk filter ini.</td></tr>`;
  }

  document.getElementById('sDist').addEventListener('change', e => { filters.dist = e.target.value; redraw(); });
  document.getElementById('sMonth').addEventListener('change', e => { filters.month = +e.target.value; redraw(); });
  document.getElementById('sReal').addEventListener('click', (e) => {
    filters.onlyReal = !filters.onlyReal;
    e.target.classList.toggle('active');
    e.target.setAttribute('aria-pressed', String(filters.onlyReal));
    redraw();
  });
  document.querySelectorAll('.pill-row .chip[data-n]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.pill-row .chip[data-n]').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-pressed','false'); });
      chip.classList.add('active'); chip.setAttribute('aria-pressed','true');
      filters.topN = +chip.dataset.n;
      redraw();
    });
  });
  document.querySelectorAll('#tsTable thead th[data-k]').forEach(th => {
    th.setAttribute('tabindex','0'); th.setAttribute('role','button');
    const activate = () => {
      const k = th.dataset.k;
      sortDir = (sortKey===k) ? -sortDir : -1;
      sortKey = k;
      document.querySelectorAll('#tsTable thead th[data-k]').forEach(h => h.removeAttribute('aria-sort'));
      th.setAttribute('aria-sort', sortDir===1?'ascending':'descending');
      redraw();
    };
    th.addEventListener('click', activate);
    th.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); activate(); } });
  });

  redraw();
}
