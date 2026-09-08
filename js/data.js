// Data layer: fetch helper (paginated) + definisi sumber data (views) dari Supabase
async function sbGet(path){
  const res = await fetch(SUPABASE_URL + path, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if(!res.ok){ throw new Error(`Gagal memuat data (${res.status})`); }
  return res.json();
}

async function sbGetAll(view, query){
  const pageSize = 1000;
  let offset = 0, out = [];
  while(true){
    const sep = query.includes('?') ? '&' : '?';
    const rows = await sbGet(`${view}${query}${sep}limit=${pageSize}&offset=${offset}`);
    out = out.concat(rows);
    if(rows.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

async function sbRpc(fn, args){
  const res = await fetch(SUPABASE_URL + 'rpc/' + fn, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });
  if(!res.ok){ throw new Error(`Gagal memuat data (${res.status})`); }
  return res.json();
}

/** Ringkasan periode akurat (distinct DO & toko aktif dihitung langsung oleh database, aman untuk kombinasi filter apapun) */
function periodSummary(distCode, year, startMonth, endMonth, productCodes){
  const pcKey = productCodes && productCodes.length ? productCodes.slice().sort().join(',') : 'all';
  const key = `period:${distCode||'all'}:${year}:${startMonth}:${endMonth}:${pcKey}`;
  return getData(key, async () => {
    const rows = await sbRpc('dashboard_period_summary', {
      p_dist_code: distCode || null, p_year: year, p_start_month: startMonth, p_end_month: endMonth,
      p_product_codes: (productCodes && productCodes.length) ? productCodes : null
    });
    return rows[0] || { total_qty:0, order_qty:0, bonus_qty:0, num_do:0, num_active_stores:0, num_lines:0 };
  });
}

/** Ranking toko/customer berdasarkan tonase untuk kombinasi filter (distributor/periode/jenis semen) apapun */
function topCustomers(distCode, year, startMonth, endMonth, productCodes, limit){
  const pcKey = productCodes && productCodes.length ? productCodes.slice().sort().join(',') : 'all';
  const key = `topcust:${distCode||'all'}:${year}:${startMonth}:${endMonth}:${pcKey}:${limit}`;
  return getData(key, () => sbRpc('dashboard_top_customers', {
    p_dist_code: distCode || null, p_year: year, p_start_month: startMonth, p_end_month: endMonth,
    p_product_codes: (productCodes && productCodes.length) ? productCodes : null, p_limit: limit
  }));
}

async function sbCount(view){
  const res = await fetch(SUPABASE_URL + view + '?select=cust_code&limit=1', {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'count=exact' }
  });
  if(!res.ok){ throw new Error(`Gagal memuat data (${res.status})`); }
  const range = res.headers.get('content-range');
  if(range){ const total = range.split('/')[1]; return total==='*' ? null : parseInt(total,10); }
  return null;
}

/** Matriks harian tonase per distributor untuk 1 bulan (dipivot di frontend) */
function dailyMatrix(year, month, productCodes){
  const pcKey = productCodes && productCodes.length ? productCodes.slice().sort().join(',') : 'all';
  const key = `daily:${year}:${month}:${pcKey}`;
  return getData(key, () => sbRpc('dashboard_daily_matrix', {
    p_year: year, p_month: month,
    p_product_codes: (productCodes && productCodes.length) ? productCodes : null
  }));
}

/** Breakdown tonase per tipe pengiriman untuk kombinasi filter apapun */
function deliveryTypeBreakdown(distCode, year, startMonth, endMonth, productCodes){
  const pcKey = productCodes && productCodes.length ? productCodes.slice().sort().join(',') : 'all';
  const key = `delivery:${distCode||'all'}:${year}:${startMonth}:${endMonth}:${pcKey}`;
  return getData(key, () => sbRpc('dashboard_delivery_type_breakdown', {
    p_dist_code: distCode || null, p_year: year, p_start_month: startMonth, p_end_month: endMonth,
    p_product_codes: (productCodes && productCodes.length) ? productCodes : null
  }));
}

/** "Alat" analitik untuk halaman Tanya AI. Semua perhitungan berat dikerjakan Postgres, bukan oleh model. */
const AITools = {
  storeMomChange: (year, month, distCode, limit, direction) => sbRpc('ai_store_mom_change', {
    p_year: year, p_month: month, p_dist_code: distCode||null, p_limit: limit||10, p_direction: direction||'decline'
  }),
  storeConsistency: (year, endMonth, monthsCount, distCode, minActiveMonths, limit) => sbRpc('ai_store_consistency', {
    p_year: year, p_end_month: endMonth, p_months_count: monthsCount||6, p_dist_code: distCode||null,
    p_min_active_months: minActiveMonths||5, p_limit: limit||10
  }),
  salesmanRanking: (month, distCode, limit, onlyActive) => sbRpc('ai_salesman_ranking', {
    p_month: month, p_dist_code: distCode||null, p_limit: limit||10, p_only_active: onlyActive!==false
  }),
  topCustomers: (distCode, year, startMonth, endMonth, productCodes, limit) => sbRpc('dashboard_top_customers', {
    p_dist_code: distCode||null, p_year: year, p_start_month: startMonth, p_end_month: endMonth,
    p_product_codes: (productCodes&&productCodes.length)?productCodes:null, p_limit: limit||10
  }),
  periodSummary: (distCode, year, startMonth, endMonth) => sbRpc('dashboard_period_summary', {
    p_dist_code: distCode||null, p_year: year, p_start_month: startMonth, p_end_month: endMonth, p_product_codes: null
  }).then(r => r[0]),
};

const cache = {};
async function getData(key, loader){
  if(!cache[key]) cache[key] = loader().catch(e => { delete cache[key]; throw e; });
  return cache[key];
}

const DataSource = {
  cementTargets: () => getData('cementTargets', () => sbGetAll('v_cement_targets_ext', '?select=*')),
  transaksiMonthly: () => getData('transaksiMonthly', () => sbGetAll('v_transaksi_monthly', '?select=*&order=year.asc,month.asc')),
  distributors: () => getData('distributors', () => sbGetAll('v_distributor_summary', '?select=*&order=total_qty_ytd.desc')),
  salesman: () => getData('salesman', () => sbGetAll('v_salesman_performance', '?select=*')),
  toko: () => getData('toko', () => sbGetAll('v_toko_agg', '?select=*')),
  yearlyTotals: () => getData('yearlyTotals', () => sbGetAll('v_yearly_totals', '?select=*&order=year.asc')),
  monthlyTotals: () => getData('monthlyTotals', () => sbGetAll('v_monthly_totals', '?select=*&order=year.asc,month.asc')),
  distMonthlyTotals: () => getData('distMonthlyTotals', () => sbGetAll('v_dist_monthly_totals', '?select=*&order=dist_code.asc,year.asc,month.asc')),
  produk: () => getData('produk', () => sbGetAll('produk', '?select=*')),
  tokoCount: () => getData('tokoCount', () => sbCount('v_toko_agg')),
  targetDist: () => getData('targetDist', () => sbGetAll('v_target_dist', '?select=*')),
  delivery: () => getData('delivery', () => sbGetAll('v_delivery_ext', '?select=*')),
  /** Detail transaksi berdasarkan tanggal (+opsional distributor/jenis) — dipakai drill-down dari Rekap Harian */
  transaksiDetail: (date, distCode, productCodes) => {
    const distFilter = (distCode && distCode!=='all') ? `&dist_code=eq.${encodeURIComponent(distCode)}` : '';
    const prodFilter = (productCodes && productCodes.length) ? `&product_code=in.(${productCodes.join(',')})` : '';
    return sbGetAll('v_transaksi_detail', `?select=*&do_date=eq.${date}${distFilter}${prodFilter}&order=do_no.asc`);
  },
  /** Detail transaksi berdasarkan salesman + bulan — dipakai drill-down dari Tim Sales */
  transaksiDetailBySalesman: (salesmanCode, year, month) => {
    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const endMonth = month === 12 ? 1 : month+1;
    const endYear = month === 12 ? year+1 : year;
    const end = `${endYear}-${String(endMonth).padStart(2,'0')}-01`;
    return sbGetAll('v_transaksi_detail', `?select=*&salesman_code=eq.${encodeURIComponent(salesmanCode)}&do_date=gte.${start}&do_date=lt.${end}&order=do_date.asc,do_no.asc`);
  },
};
