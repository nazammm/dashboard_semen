// Halaman: Detail Transaksi. Drill-down dari Rekap Harian atau Tim Sales, bukan halaman nav utama.
async function renderTransaksiDetail(app, params){
  const salesman = params.get('salesman');
  const date = params.get('date');

  let rows, title, scopeDesc, breadcrumb, backHref, backLabel, salesmanTrend = null;

  if(salesman){
    // Mode: drill-down dari Tim Sales (Papan Peringkat), berdasarkan salesman + bulan
    const year = +(params.get('year') || 2026);
    const month = +(params.get('month') || 1);
    const name = params.get('name') || salesman;
    rows = await DataSource.transaksiDetailBySalesman(salesman, year, month);
    title = `${name} \u00b7 ${MONTHS_ID[month]} ${year}`;
    scopeDesc = `Salesman ${name}`;
    breadcrumb = ['Dashboard','Tim Sales','Detail Transaksi'];
    backHref = '#tim-sales';
    backLabel = 'Kembali ke Tim Sales';

    // Tren bulanan salesman ini sepanjang tahun (data v_salesman_performance sudah ter-cache, tanpa query tambahan)
    const perfRows = await DataSource.salesman();
    const mine = perfRows.filter(r => r.salesman_code === salesman).sort((a,b) => a.month-b.month);
    salesmanTrend = {
      months: mine.map(r => r.month),
      actualTA: mine.map(r => Number(r.actual_ta||0)),
      targetTA: mine.map(r => r.target_ta>0 ? Number(r.target_ta) : null),
      actualTonase: mine.map(r => Number(r.actual_tonase||0)),
      targetTonase: mine.map(r => r.target_tonase>0 ? Number(r.target_tonase) : null),
    };
  } else if(date){
    // Mode: drill-down dari Rekap Harian, berdasarkan tanggal + distributor
    const dist = params.get('dist') || 'all';
    const jenis = params.get('jenis') || 'all';
    const produk = await DataSource.produk();
    const productCodes = jenis!=='all' ? produk.filter(p=>p.jenis===jenis).map(p=>p.kode) : null;
    rows = await DataSource.transaksiDetail(date, dist, productCodes);
    const dateObj = new Date(date+'T00:00:00');
    title = dateObj.toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
    scopeDesc = `${dist!=='all' ? `Distributor ${dist}` : 'Semua distributor'}${jenis!=='all' ? ' \u00b7 Jenis '+jenis : ''}`;
    breadcrumb = ['Dashboard','Rekap Harian','Detail Transaksi'];
    backHref = '#rekap-harian';
    backLabel = 'Kembali ke Rekap Harian';
  } else {
    app.innerHTML = `${pageHeader({ breadcrumb:['Dashboard','Detail Transaksi'], eyebrow:'Detail Transaksi', title:'Parameter tidak lengkap' })}<div class="error-box" role="alert">Halaman ini hanya bisa diakses lewat klik dari Rekap Harian atau Tim Sales.</div>`;
    return;
  }

  const totalTonase = rows.reduce((a,r)=>a+Number(r.tonase||0),0);
  const totalQty = rows.reduce((a,r)=>a+Number(r.order_qty||0),0);

  app.innerHTML = `
    ${pageHeader({
      breadcrumb,
      eyebrow:'Detail Transaksi',
      title,
      desc: `${scopeDesc} \u00b7 ${fmt(rows.length)} baris transaksi`,
    })}
    <div class="reveal" style="margin-bottom:18px;">
      <a href="${backHref}" class="btn">&larr; ${backLabel}</a>
    </div>
    <div class="grid g-kpi reveal">
      <div class="card"><div class="card-title">Total Tonase</div><div class="kpi-value">${fmt(totalTonase,2)}<span class="unit">ton</span></div></div>
      <div class="card"><div class="card-title">Total Qty</div><div class="kpi-value">${fmt(totalQty)}<span class="unit">zak</span></div></div>
      <div class="card"><div class="card-title">Jumlah Baris</div><div class="kpi-value">${fmt(rows.length)}</div></div>
    </div>
    ${salesmanTrend ? `
    <div class="grid g-2 reveal" style="margin-top:14px;">
      <div class="card">
        <h2 class="card-title">Tren Toko Aktif per Bulan</h2>
        <div class="legend"><span><i style="background:${COLORS.accent}" aria-hidden="true"></i>Aktual</span><span><i style="background:${COLORS.blueMid}" aria-hidden="true"></i>Target</span></div>
        <div class="chart-box"><canvas id="chartSalesmanTA" role="img" aria-describedby="chartSalesmanTASR"></canvas></div>
        <p id="chartSalesmanTASR" class="sr-only"></p>
      </div>
      <div class="card">
        <h2 class="card-title">Tren Tonase per Bulan</h2>
        <div class="legend"><span><i style="background:${COLORS.accent}" aria-hidden="true"></i>Aktual</span><span><i style="background:${COLORS.blueMid}" aria-hidden="true"></i>Target</span></div>
        <div class="chart-box"><canvas id="chartSalesmanTonase" role="img" aria-describedby="chartSalesmanTonaseSR"></canvas></div>
        <p id="chartSalesmanTonaseSR" class="sr-only"></p>
      </div>
    </div>
    ` : ''}
    <div class="table-wrap reveal" style="margin-top:16px;">
      <table>
        <caption class="sr-only">Detail transaksi ${esc(title)}, ${esc(scopeDesc)}</caption>
        <thead><tr>
          <th>Tanggal</th>
          <th>Distributor</th>
          <th>Toko</th>
          <th>Produk</th>
          <th>Sales</th>
          <th class="num">Qty (zak)</th>
          <th class="num">Tonase</th>
          <th>No DO</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="mono">${esc(r.do_date)}</td>
              <td><span class="tag-code">${esc(r.dist_code)}</span> ${esc(r.distributor_name||'')}</td>
              <td>${esc(r.customer_name || r.customer_code)}</td>
              <td>${esc(r.product_name || r.product_code)}</td>
              <td>${esc(r.salesman_name || r.salesman_code || '–')}</td>
              <td class="num mono">${fmt(r.order_qty)}</td>
              <td class="num mono">${fmt(r.tonase,2)}</td>
              <td class="mono">${esc(r.do_no||'–')}</td>
            </tr>
          `).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--ink-faint);padding:24px;">Tidak ada transaksi untuk kombinasi filter ini.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  if(salesmanTrend){
    const labels = salesmanTrend.months.map(m => MONTHS_ID[m]);
    document.getElementById('chartSalesmanTASR').textContent = chartSRSummary(labels, salesmanTrend.actualTA, 'toko aktif');
    newChart(document.getElementById('chartSalesmanTA'), {
      type:'bar',
      data:{ labels, datasets:[
        { label:'Aktual', data:salesmanTrend.actualTA, backgroundColor:COLORS.accent, maxBarThickness:26 },
        { label:'Target', data:salesmanTrend.targetTA, type:'line', borderColor:COLORS.blueMid, borderDash:[4,3], borderWidth:2, pointRadius:2, fill:false, tension:.3 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        scales:{ y:{ grid:{color:COLORS.line} }, x:{ grid:{display:false} } },
        plugins:{ tooltip:{ callbacks:{ label:c=>` ${c.dataset.label}: ${fmt(c.parsed.y)}` } } } }
    });

    document.getElementById('chartSalesmanTonaseSR').textContent = chartSRSummary(labels, salesmanTrend.actualTonase, 'ton');
    newChart(document.getElementById('chartSalesmanTonase'), {
      type:'bar',
      data:{ labels, datasets:[
        { label:'Aktual', data:salesmanTrend.actualTonase, backgroundColor:COLORS.accent, maxBarThickness:26 },
        { label:'Target', data:salesmanTrend.targetTonase, type:'line', borderColor:COLORS.blueMid, borderDash:[4,3], borderWidth:2, pointRadius:2, fill:false, tension:.3 },
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        scales:{ y:{ grid:{color:COLORS.line}, ticks:{ callback:v=>fmtCompact(v) } }, x:{ grid:{display:false} } },
        plugins:{ tooltip:{ callbacks:{ label:c=>` ${c.dataset.label}: ${fmt(c.parsed.y)} ton` } } } }
    });
  }
}
