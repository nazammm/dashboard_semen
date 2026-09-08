// Halaman: Tanya AI
// Arsitektur: LLM (Groq, gratis) HANYA berfungsi sebagai (1) penerjemah pertanyaan -> parameter query,
// dan (2) penulis narasi jawaban. Semua perhitungan angka dikerjakan Postgres lewat RPC yang sudah ada
// (ai_store_mom_change, ai_store_consistency, ai_salesman_ranking, dashboard_top_customers, dashboard_period_summary).
// Angka yang ditampilkan di tabel/metric block SELALU diambil langsung dari hasil RPC, bukan dari teks model,
// supaya tidak ada angka karangan.

const GROQ_MODEL = 'llama-3.1-8b-instant';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY_STORAGE = 'tanya_ai_groq_key';

function getGroqKey(){ return localStorage.getItem(GROQ_KEY_STORAGE) || ''; }
function setGroqKey(k){ if(k) localStorage.setItem(GROQ_KEY_STORAGE, k); else localStorage.removeItem(GROQ_KEY_STORAGE); }

async function groqChat(messages, opts={}){
  const key = getGroqKey();
  if(!key){ const e = new Error('Belum ada API key'); e.code='NO_KEY'; throw e; }
  let res;
  try{
    res = await fetch(GROQ_ENDPOINT, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${key}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 500,
        ...(opts.json ? { response_format: { type:'json_object' } } : {})
      })
    });
  }catch(networkErr){
    const e = new Error('Tidak bisa menghubungi Groq. Cek koneksi internet kamu.'); e.code='NETWORK'; throw e;
  }
  if(res.status === 401){ const e = new Error('API key tidak valid.'); e.code='INVALID_KEY'; throw e; }
  if(res.status === 429){ const e = new Error('Kuota gratis Groq untuk saat ini habis, coba lagi sebentar lagi.'); e.code='RATE_LIMIT'; throw e; }
  if(!res.ok){ const t = await res.text().catch(()=>''); const e = new Error('Groq error: '+t.slice(0,200)); e.code='API_ERROR'; throw e; }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/* ======================================================================
   TOOL ROUTING (classify -> execute RPC -> explain)
====================================================================== */
function clampInt(v, lo, hi, def){ v = parseInt(v,10); if(!Number.isFinite(v)) return def; return Math.max(lo, Math.min(hi, v)); }

async function getAIContext(){
  const [monthly, dists] = await Promise.all([ DataSource.monthlyTotals(), DataSource.distributors() ]);
  const y2026 = monthly.filter(r=>r.year===2026);
  const latestMonth = y2026.length ? Math.max(...y2026.map(r=>r.month)) : 8;
  return { year:2026, latestMonth, distCodes: dists.filter(d=>d.tag==='Distributor').map(d=>d.dist_code) };
}

function buildClassifyPrompt(ctx){
  return `Kamu adalah router pertanyaan untuk dashboard distribusi semen internal. Tugasmu HANYA memilih satu tool paling relevan dan mengekstrak parameternya. Balas HANYA JSON valid, tanpa teks lain, tanpa markdown.

Daftar tool yang tersedia:
- store_mom_change: toko yang tonase-nya naik/turun paling besar dibanding bulan sebelumnya. params: {"month": 1-12, "direction": "decline"|"growth", "dist_code": kode distributor atau null}
- store_consistency: toko dengan penjualan paling stabil/konsisten beberapa bulan terakhir. params: {"months_count": jumlah bulan (default 6), "dist_code": kode distributor atau null}
- salesman_ranking: ranking performa salesman terhadap target (TA & tonase). params: {"month": 1-12, "dist_code": kode distributor atau null}
- top_customers: toko/customer dengan tonase tertinggi pada periode. params: {"start_month":1-12, "end_month":1-12, "dist_code": kode distributor atau null}
- period_summary: ringkasan total tonase/DO/toko aktif keseluruhan (untuk pertanyaan umum, bukan ranking per toko). params: {"start_month":1-12, "end_month":1-12, "dist_code": kode distributor atau null}
- none: pertanyaan tidak berkaitan dengan data toko/penjualan/distributor/salesman/target, atau terlalu tidak jelas untuk dijawab dari data ini.

Konteks: bulan terbaru yang datanya tersedia adalah bulan ke-${ctx.latestMonth} tahun ${ctx.year}. Kalau user tidak menyebut bulan, gunakan bulan terbaru itu. Kode distributor valid: ${ctx.distCodes.join(', ')}. Kalau user menyebut distributor yang tidak ada di daftar itu, set dist_code null.

Format balasan WAJIB persis seperti ini (ganti isinya):
{"tool": "nama_tool", "params": { ... }}`;
}

async function classify(question, ctx){
  const content = await groqChat([
    { role:'system', content: buildClassifyPrompt(ctx) },
    { role:'user', content: question }
  ], { json:true, temperature:0.1, maxTokens:200 });
  try{
    const parsed = JSON.parse(content);
    if(!parsed.tool) return { tool:'none', params:{} };
    return { tool: parsed.tool, params: parsed.params || {} };
  }catch(e){
    return { tool:'none', params:{} };
  }
}

async function executeTool(tool, params, ctx){
  const dist = (params.dist_code && ctx.distCodes.includes(params.dist_code)) ? params.dist_code : null;
  if(tool === 'store_mom_change'){
    const month = clampInt(params.month, 1, 12, ctx.latestMonth);
    const direction = params.direction === 'growth' ? 'growth' : 'decline';
    const rows = await AITools.storeMomChange(ctx.year, month, dist, 8, direction);
    return { rows, meta:{ month, direction, dist } };
  }
  if(tool === 'store_consistency'){
    const monthsCount = clampInt(params.months_count, 3, 12, 6);
    const rows = await AITools.storeConsistency(ctx.year, ctx.latestMonth, monthsCount, dist, Math.max(3, monthsCount-1), 8);
    return { rows, meta:{ monthsCount, dist } };
  }
  if(tool === 'salesman_ranking'){
    const month = clampInt(params.month, 1, 12, ctx.latestMonth);
    const rows = await AITools.salesmanRanking(month, dist, 8, true);
    return { rows, meta:{ month, dist } };
  }
  if(tool === 'top_customers'){
    const sm = clampInt(params.start_month, 1, 12, 1);
    const em = clampInt(params.end_month, 1, 12, ctx.latestMonth);
    const rows = await AITools.topCustomers(dist, ctx.year, sm, em, null, 8);
    return { rows, meta:{ sm, em, dist } };
  }
  if(tool === 'period_summary'){
    const sm = clampInt(params.start_month, 1, 12, 1);
    const em = clampInt(params.end_month, 1, 12, ctx.latestMonth);
    const row = await AITools.periodSummary(dist, ctx.year, sm, em);
    return { rows:[row], meta:{ sm, em, dist }, single:true };
  }
  return null;
}

async function explain(question, tool, result){
  const sys = `Kamu asisten analitik dashboard distribusi semen internal. Jawab HANYA berdasarkan data JSON yang diberikan user. JANGAN mengarang angka, nama toko, atau nama orang yang tidak ada di data. Jawab dalam Bahasa Indonesia, ringkas (maksimal 3-4 kalimat), profesional, langsung ke inti, sebut angka spesifik dari data. Kalau array data kosong, katakan terus terang tidak ditemukan data yang cocok. Jangan mengarang jawaban.`;
  const userMsg = `Pertanyaan: ${question}\n\nData hasil query (JSON):\n${JSON.stringify(result.rows).slice(0,3500)}`;
  return await groqChat([{ role:'system', content:sys }, { role:'user', content:userMsg }], { temperature:0.4, maxTokens:400 });
}

/* ======================================================================
   RENDER HELPERS
====================================================================== */
function toolLabel(tool){
  return { store_mom_change:'Perubahan bulanan toko', store_consistency:'Konsistensi penjualan toko',
    salesman_ranking:'Ranking salesman', top_customers:'Toko tonase tertinggi', period_summary:'Ringkasan periode' }[tool] || tool;
}
function miniTable(headers, rows, caption){
  return `<div class="ai-table-wrap"><table class="ai-table">${caption?`<caption class="sr-only">${esc(caption)}</caption>`:''}<thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td${i>=2?' class="num"':''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function pctCell(p){ if(p==null) return '–'; const cls = Number(p)>=0?'good':'bad'; return `<span class="ai-pct ${cls}">${Number(p)>=0?'+':''}${Number(p).toFixed(1)}%</span>`; }
function pctPlain(p){ return p==null ? '–' : Number(p).toFixed(1)+'%'; }
function distSuffix(dist){ return dist ? ` &middot; ${esc(dist)}` : ' &middot; seluruh distributor'; }

function renderEvidence(tool, result, ctx){
  if(!result) return '';
  const { rows, meta } = result;
  if(!rows || !rows.length || (rows.length===1 && rows[0]==null)){
    return `<div class="ai-source">Sumber: ${toolLabel(tool)}. Tidak ditemukan data yang cocok untuk parameter ini.</div>`;
  }
  let tableHTML = '', sourceLine = '', interp = '';

  if(tool === 'store_mom_change'){
    const prevMonth = meta.month===1?12:meta.month-1, prevYear = meta.month===1?ctx.year-1:ctx.year;
    tableHTML = miniTable(['Toko','Distributor', MONTHS_ID[meta.month]+' (ton)', MONTHS_ID[prevMonth]+' (ton)', 'Perubahan'],
      rows.map(r => [esc(r.cust_name||r.customer_code), esc(r.dist_code||'–'), fmt(r.curr_qty,1), fmt(r.prev_qty,1), pctCell(r.pct_change)]), 'Tabel perubahan tonase toko dibanding bulan sebelumnya');
    sourceLine = `fungsi <code>ai_store_mom_change</code> &middot; ${MONTHS_ID[meta.month]} ${ctx.year} vs ${MONTHS_ID[prevMonth]} ${prevYear}${distSuffix(meta.dist)}`;
    interp = 'Hanya toko yang tercatat bertransaksi di kedua bulan yang dibandingkan, supaya persentase tidak tak terhingga untuk toko yang baru mulai order.';
  } else if(tool === 'store_consistency'){
    tableHTML = miniTable(['Toko','Distributor','Bulan Aktif','Rata-rata (ton)','Variasi (CV)'],
      rows.map(r => [esc(r.cust_name||r.customer_code), esc(r.dist_code||'–'), r.active_months, fmt(r.avg_qty,1), fmt(r.cv,3)]), 'Tabel konsistensi penjualan toko');
    sourceLine = `fungsi <code>ai_store_consistency</code> &middot; ${meta.monthsCount} bulan terakhir s.d. ${MONTHS_ID[ctx.latestMonth]} ${ctx.year}${distSuffix(meta.dist)}`;
    interp = 'CV (coefficient of variation) makin rendah = makin stabil. Hanya toko yang aktif hampir tiap bulan dengan volume rata-rata memadai yang disertakan (menyaring toko kecil yang kebetulan konsisten karena jarang order).';
  } else if(tool === 'salesman_ranking'){
    tableHTML = miniTable(['Salesman','Distributor','Capaian TA','Capaian Tonase','Sales Rank'],
      rows.map(r => [esc(r.salesman_name||r.salesman_code), esc(r.dist_code||'–'), pctPlain(r.capaian_ta), pctPlain(r.capaian_tonase), pctPlain(r.sales_rank)]), 'Tabel ranking salesman');
    sourceLine = `fungsi <code>ai_salesman_ranking</code> &middot; ${MONTHS_ID[meta.month]} ${ctx.year}${distSuffix(meta.dist)}`;
    interp = 'Sales Rank = rata-rata Capaian TA% dan Capaian Tonase% (hanya target yang tersedia yang dihitung). Salesman berstatus non-aktif tidak disertakan.';
  } else if(tool === 'top_customers'){
    tableHTML = miniTable(['Toko','Distributor','Jumlah DO','Tonase (ton)'],
      rows.map(r => [esc(r.cust_name||r.customer_code), esc(r.dist_code||'–'), fmt(r.num_do), fmt(r.total_qty,1)]), 'Tabel toko dengan tonase tertinggi');
    sourceLine = `fungsi <code>dashboard_top_customers</code> &middot; ${MONTHS_ID[meta.sm]}\u2013${MONTHS_ID[meta.em]} ${ctx.year}${distSuffix(meta.dist)}`;
  } else if(tool === 'period_summary'){
    const r = rows[0];
    tableHTML = `<div class="ai-metrics">
      <div><span class="l">Tonase</span><span class="v">${fmt(r.total_qty,1)}</span></div>
      <div><span class="l">Delivery Order</span><span class="v">${fmt(r.num_do)}</span></div>
      <div><span class="l">Toko Aktif</span><span class="v">${fmt(r.num_active_stores)}</span></div>
      <div><span class="l">Order Qty</span><span class="v">${fmt(r.order_qty)}</span></div>
    </div>`;
    sourceLine = `fungsi <code>dashboard_period_summary</code> &middot; ${MONTHS_ID[meta.sm]}\u2013${MONTHS_ID[meta.em]} ${ctx.year}${distSuffix(meta.dist)}`;
  }

  return `${tableHTML}<div class="ai-source">Sumber: ${sourceLine}</div>${interp ? `<div class="ai-interp">${interp}</div>` : ''}`;
}

const SUGGESTED_QUESTIONS = [
  'Toko apa yang penurunannya paling besar bulan ini?',
  'Toko apa yang paling konsisten penjualannya?',
  'Siapa salesman dengan performa terbaik bulan ini?',
  'Toko mana dengan tonase tertinggi bulan ini?',
  'Bagaimana ringkasan performa bulan ini?',
];

/* ======================================================================
   PAGE
====================================================================== */
async function renderTanyaAI(app){
  const hasKey = !!getGroqKey();

  app.innerHTML = `
    ${pageHeader({
      breadcrumb:['Dashboard','Tanya AI'],
      eyebrow:'Narasi Intelligence \u00b7 Beta',
      title:'Tanya AI',
      desc:'Tanyakan performa toko, penjualan, pelanggan, salesman, dan target dalam bahasa sehari-hari. Jawaban dihitung langsung dari metrik dashboard, bukan tebakan.',
    })}
    <div class="ai-status reveal" id="aiStatus" role="status"><span class="dot" aria-hidden="true"></span><span id="aiStatusText">Memuat status data…</span></div>
    <div id="aiSetupZone" class="reveal"></div>
    <div id="aiChatZone" class="reveal" style="display:${hasKey?'block':'none'};">
      <div class="ai-chips" id="aiChips" role="group" aria-label="Contoh pertanyaan">${SUGGESTED_QUESTIONS.map(q=>`<button type="button" class="ai-chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <div class="ai-panel">
        <h2 class="sr-only">Percakapan Tanya AI</h2>
        <div class="ai-messages" id="aiMessages" aria-live="polite" aria-atomic="false"></div>
        <div class="ai-composer">
          <label for="aiInput" class="sr-only">Tulis pertanyaan untuk Tanya AI</label>
          <input id="aiInput" type="text" placeholder="Contoh: toko apa yang penurunannya paling rendah bulan ini?" autocomplete="off">
          <button id="aiSend" class="ai-send-btn">Tanya ${svgIcon('<path d="M5 12h14M13 6l6 6-6 6"/>')}</button>
        </div>
      </div>
      <div style="margin-top:10px;"><button type="button" id="aiChangeKey" style="background:none;border:none;padding:0;cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--ink-faint);text-decoration:underline;">Ganti API key</button></div>
    </div>
  `;

  function renderSetup(){
    document.getElementById('aiSetupZone').innerHTML = `
      <div class="ai-setup">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--accent);letter-spacing:.05em;margin-bottom:8px;">SETUP DIPERLUKAN &middot; SEKALI SAJA</div>
        <div style="font-size:13px;line-height:1.65;color:var(--ink-soft);">Tanya AI memakai <strong style="color:var(--ink);">Groq</strong> (API gratis, tanpa kartu kredit) sebagai otak bahasanya. Ambil API key gratis di <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a> (daftar pakai Google/email, key langsung jadi), lalu tempel di bawah.</div>
        <label for="aiKeyInput" class="sr-only">API key Groq</label>
        <input id="aiKeyInput" type="password" placeholder="Tempel API key Groq (gsk_...)" autocomplete="off">
        <div style="display:flex;gap:10px;margin-top:12px;align-items:center;">
          <button id="aiKeySave" class="ai-send-btn">Simpan &amp; Mulai</button>
          <span id="aiKeyMsg" role="alert" style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--red);"></span>
        </div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--ink-faint);margin-top:12px;line-height:1.6;">Key disimpan HANYA di browser kamu sendiri (localStorage) dan dikirim langsung ke Groq, tidak lewat server manapun. Kalau pakai komputer bersama, jangan simpan key di sini.</div>
      </div>
    `;
    document.getElementById('aiKeySave').addEventListener('click', () => {
      const v = document.getElementById('aiKeyInput').value.trim();
      if(!v){ document.getElementById('aiKeyMsg').textContent = 'Isi key dulu.'; return; }
      setGroqKey(v);
      document.getElementById('aiSetupZone').innerHTML = '';
      document.getElementById('aiChatZone').style.display = 'block';
    });
  }

  if(!hasKey) renderSetup();

  document.getElementById('aiChangeKey').addEventListener('click', (e) => {
    e.preventDefault();
    setGroqKey('');
    document.getElementById('aiChatZone').style.display = 'none';
    renderSetup();
  });

  // status bar: bulan performa terbaru yang tersedia
  getAIContext().then(ctx => {
    document.getElementById('aiStatusText').textContent = `Data terakhir diperbarui \u00b7 performa terbaru: ${MONTHS_ID[ctx.latestMonth]} ${ctx.year}`;
  }).catch(() => {
    document.getElementById('aiStatusText').textContent = 'Data terhubung ke dashboard';
  });

  const messagesEl = document.getElementById('aiMessages');
  function scrollToBottom(){ messagesEl.scrollTop = messagesEl.scrollHeight; }
  function addUserBubble(text){
    messagesEl.insertAdjacentHTML('beforeend', `<div class="msg msg-user"><div class="msg-bubble">${esc(text)}</div></div>`);
    scrollToBottom();
  }
  function addThinkingBubble(){
    const id = 'think-' + Date.now();
    messagesEl.insertAdjacentHTML('beforeend', `<div class="msg msg-ai thinking" id="${id}"><div class="msg-bubble"><span class="dots"><span>&#9679;</span><span>&#9679;</span><span>&#9679;</span></span> Menganalisis data…</div></div>`);
    scrollToBottom();
    return id;
  }
  function replaceBubble(id, innerHTML){
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.remove('thinking');
    el.innerHTML = `<div class="msg-bubble">${innerHTML}</div>`;
    scrollToBottom();
  }

  let busy = false;
  async function handleAsk(question){
    question = (question||'').trim();
    if(!question || busy) return;
    busy = true;
    document.getElementById('aiSend').disabled = true;
    document.getElementById('aiInput').value = '';
    addUserBubble(question);
    const thinkId = addThinkingBubble();
    try{
      const ctx = await getAIContext();
      const cls = await classify(question, ctx);
      if(cls.tool === 'none'){
        replaceBubble(thinkId, `Maaf, aku belum bisa menjawab pertanyaan ini dari data yang tersedia. Coba tanyakan seputar performa toko, penjualan, pelanggan, salesman, atau target, misalnya salah satu contoh pertanyaan di atas.`);
      } else {
        const result = await executeTool(cls.tool, cls.params, ctx);
        const answerText = await explain(question, cls.tool, result);
        const evidence = renderEvidence(cls.tool, result, ctx);
        replaceBubble(thinkId, `<div>${esc(answerText).replace(/\n/g,'<br>')}</div>${evidence}`);
      }
    }catch(err){
      console.error(err);
      let msg = 'Terjadi kesalahan saat memproses pertanyaan.';
      if(err.code === 'NO_KEY') msg = 'API key belum diatur.';
      else if(err.code === 'INVALID_KEY') msg = 'API key tidak valid. Cek lagi key Groq kamu lewat tombol "Ganti API key" di bawah.';
      else if(err.code === 'RATE_LIMIT') msg = 'Kuota gratis Groq untuk saat ini habis. Coba lagi dalam beberapa saat.';
      else if(err.code === 'NETWORK') msg = 'Tidak bisa menghubungi Groq. Cek koneksi internet kamu.';
      replaceBubble(thinkId, `<span style="color:var(--red);" role="alert">${esc(msg)}</span>`);
    } finally {
      busy = false;
      document.getElementById('aiSend').disabled = false;
    }
  }

  document.getElementById('aiSend').addEventListener('click', () => handleAsk(document.getElementById('aiInput').value));
  document.getElementById('aiInput').addEventListener('keydown', e => { if(e.key==='Enter') handleAsk(e.target.value); });
  document.querySelectorAll('.ai-chip').forEach(chip => {
    chip.addEventListener('click', () => handleAsk(chip.dataset.q));
  });
}
