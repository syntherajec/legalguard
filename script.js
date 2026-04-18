/* ═══════════════════════════════════════════════════════════
   LegalGuard AI — Complete Script (FULLY WORKING)
═══════════════════════════════════════════════════════════ */
'use strict';

const LS_KEY_APIKEY = 'legalguard_api_key';
const LS_KEY_BUYERS = 'legalguard_buyers';
const LS_KEY_CURRENT_BUYER = 'legalguard_current_buyer';

// Smart model list — ordered by best capability for legal analysis tasks
// System auto-selects and falls back if a model fails
const SMART_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'arcee-ai/trinity-large-preview:free',
  'z-ai/glm-4.5-air:free',
  'openai/gpt-oss-120b:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'minimax/minimax-m2.5:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'google/gemma-4-31b-it:free',
  'qwen/qwen3-coder:free',
  'openrouter/auto'
];

const SYSTEM_INSTRUCTION = `Anda adalah Senior Legal Auditor Indonesia dengan pengalaman 20 tahun. Analisis teks kontrak secara mendalam berdasarkan hukum perdata/bisnis Indonesia (KUHPerdata, UU Perseroan Terbatas, UU Ketenagakerjaan, dll).

Identifikasi:
1. Fatal Red Flags (Risiko tinggi)
2. Ambiguous Clauses (Pasal abu-abu)
3. Missing Clauses (Klausul yang seharusnya ada)

Kemudian, HASILKAN KONTRAK YANG SUDAH DIPERBAIKI berdasarkan temuan Anda. Perbaiki semua pasal bermasalah, tambahkan klausul yang hilang, dan tulis ulang kontrak dengan bahasa hukum yang tepat.

Output WAJIB dalam format JSON MURNI tanpa markdown, tanpa backtick:
{
  "score": 75,
  "red_flags": [{"pasal": "", "risiko": "", "saran": ""}],
  "ambiguous": [{"pasal": "", "risiko": "", "saran": ""}],
  "missing": [{"pasal": "", "risiko": "", "saran": ""}],
  "negotiation_script": "",
  "fixed_contract": ""
}`;

const SAMPLE_CONTRACT = `PERJANJIAN KERJA SAMA DISTRIBUSI

Perjanjian ini dibuat antara PT. Maju Bersama ("Pihak Pertama") dan CV. Distributor Nusantara ("Pihak Kedua").

Pasal 1 - Objek Perjanjian
Pihak Pertama menunjuk Pihak Kedua sebagai distributor tunggal produk elektronik di wilayah Jawa Tengah.

Pasal 2 - Harga dan Pembayaran
Harga produk ditentukan sepihak oleh Pihak Pertama dan dapat berubah sewaktu-waktu tanpa pemberitahuan sebelumnya. Pembayaran dilakukan dalam waktu yang wajar setelah pengiriman barang.

Pasal 3 - Target Penjualan
Pihak Kedua wajib mencapai target penjualan yang ditetapkan Pihak Pertama. Kegagalan mencapai target dapat mengakibatkan pemutusan perjanjian secara sepihak oleh Pihak Pertama.

Pasal 4 - Larangan Kompetisi
Pihak Kedua dilarang mendistribusikan produk sejenis dari perusahaan manapun selama perjanjian ini berlaku dan selama 5 tahun setelah berakhirnya perjanjian, di seluruh wilayah Indonesia.

Pasal 5 - Jangka Waktu
Perjanjian ini berlaku selama 3 tahun dan dapat diperpanjang atas persetujuan Pihak Pertama.

Pasal 6 - Penyelesaian Sengketa
Segala sengketa akan diselesaikan melalui jalur yang dianggap sesuai oleh Pihak Pertama.

Demikian perjanjian ini dibuat untuk ditaati bersama.`;

let auditResults = null;
let contractText = '';
let currentBuyer = null;

document.addEventListener('DOMContentLoaded', () => {
  if (typeof lucide !== 'undefined') lucide.createIcons();
  const savedKey = localStorage.getItem(LS_KEY_APIKEY);
  if (savedKey) {
    const keyInput = document.getElementById('apiKeyInput');
    if (keyInput) keyInput.value = savedKey;
    const clearBtn = document.getElementById('clearApiKeyBtn');
    if (clearBtn) clearBtn.style.display = 'flex';
    const badge = document.getElementById('keySavedBadge');
    if (badge) badge.style.display = 'inline-flex';
  }
  checkAccessFromURL();
});

function initBuyers() {
  let buyers = localStorage.getItem(LS_KEY_BUYERS);
  if (!buyers) {
    const defaultBuyers = [{ name: 'Demo User', accessCode: 'DEMO2024', createdAt: new Date().toISOString(), lastAccess: null }];
    localStorage.setItem(LS_KEY_BUYERS, JSON.stringify(defaultBuyers));
    return defaultBuyers;
  }
  return JSON.parse(buyers);
}

function generateAccessCode() {
  return 'LG-' + Math.random().toString(36).substring(2, 10).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);
}

function generateAndAddBuyer() {
  const name = document.getElementById('adminBuyerName')?.value.trim();
  if (!name) { showToast('Nama pembeli wajib diisi!', 'error'); return; }
  let code = document.getElementById('adminAccessCode')?.value.trim();
  if (!code) code = generateAccessCode();
  const buyers = initBuyers();
  if (buyers.find(b => b.accessCode === code)) { showToast('Kode akses sudah digunakan!', 'error'); return; }
  buyers.push({ name, accessCode: code, createdAt: new Date().toISOString(), lastAccess: null });
  localStorage.setItem(LS_KEY_BUYERS, JSON.stringify(buyers));
  renderAdminBuyersList();
  const nameInput = document.getElementById('adminBuyerName');
  const codeInput = document.getElementById('adminAccessCode');
  if (nameInput) nameInput.value = '';
  if (codeInput) codeInput.value = '';
  showToast(`Pembeli ${name} ditambahkan dengan kode: ${code}`, 'success');
}

function renderAdminBuyersList() {
  const tbody = document.getElementById('adminBuyersList');
  if (!tbody) return;
  const buyers = initBuyers();
  const baseUrl = window.location.origin + window.location.pathname;
  tbody.innerHTML = buyers.map((b, idx) => `<tr class="border-b border-slate-800"><td class="py-3 text-sm">${escapeHtml(b.name)}</td><td class="py-3 font-mono text-amber-500 text-sm">${b.accessCode}</td><td class="py-3"><input type="text" readonly value="${baseUrl}?code=${b.accessCode}" class="bg-slate-950 text-[10px] p-1 rounded w-full"></td><td class="py-3"><span class="text-xs ${b.lastAccess ? 'text-emerald-500' : 'text-slate-500'}">${b.lastAccess ? new Date(b.lastAccess).toLocaleDateString('id') : 'Belum pernah'}</span></td><td class="py-3"><button onclick="deleteBuyer('${b.accessCode}')" class="text-red-500 hover:text-red-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td></tr>`).join('');
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function deleteBuyer(accessCode) {
  let buyers = initBuyers();
  buyers = buyers.filter(b => b.accessCode !== accessCode);
  localStorage.setItem(LS_KEY_BUYERS, JSON.stringify(buyers));
  renderAdminBuyersList();
  showToast('Pembeli dihapus', 'success');
}

function clearAllBuyers() {
  if (confirm('Hapus semua data pembeli?')) {
    localStorage.setItem(LS_KEY_BUYERS, JSON.stringify([]));
    renderAdminBuyersList();
    showToast('Semua data pembeli dihapus', 'success');
  }
}

function exportAllData() {
  const buyers = initBuyers();
  const data = { buyers, exportDate: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `legalguard_buyers_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Data berhasil diekspor', 'success');
}

function verifyAccessCode() {
  const codeInput = document.getElementById('accessCodeInput');
  if (!codeInput) return;
  const code = codeInput.value.trim().toUpperCase();
  if (!code) { showToast('Masukkan kode akses!', 'error'); return; }
  const buyers = initBuyers();
  const buyer = buyers.find(b => b.accessCode === code);
  if (buyer) {
    buyer.lastAccess = new Date().toISOString();
    localStorage.setItem(LS_KEY_BUYERS, JSON.stringify(buyers));
    localStorage.setItem(LS_KEY_CURRENT_BUYER, JSON.stringify(buyer));
    currentBuyer = buyer;
    const modal = document.getElementById('accessModal');
    if (modal) modal.classList.add('hidden');
    const app = document.getElementById('app');
    const hero = document.getElementById('hero');
    if (app) app.classList.remove('hidden');
    if (hero) hero.classList.remove('hidden');
    showToast(`Selamat datang, ${buyer.name}!`, 'success');
  } else {
    showToast('Kode akses tidak valid!', 'error');
  }
}

function checkAccessFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const admin = urlParams.get('admin');
  if (admin === 'true') {
    const adminPanel = document.getElementById('adminPanel');
    if (adminPanel) adminPanel.classList.remove('hidden');
    renderAdminBuyersList();
    return;
  }
  const savedBuyer = localStorage.getItem(LS_KEY_CURRENT_BUYER);
  if (savedBuyer) {
    currentBuyer = JSON.parse(savedBuyer);
    const app = document.getElementById('app');
    const hero = document.getElementById('hero');
    if (app) app.classList.remove('hidden');
    if (hero) hero.classList.remove('hidden');
  } else if (code) {
    const codeInput = document.getElementById('accessCodeInput');
    if (codeInput) codeInput.value = code;
    verifyAccessCode();
  } else {
    const modal = document.getElementById('accessModal');
    const app = document.getElementById('app');
    const hero = document.getElementById('hero');
    if (modal) modal.classList.remove('hidden');
    if (app) app.classList.add('hidden');
    if (hero) hero.classList.add('hidden');
  }
}

function toggleAdminPanel() {
  const panel = document.getElementById('adminPanel');
  if (panel) {
    if (panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      renderAdminBuyersList();
    } else {
      panel.classList.add('hidden');
    }
  }
}

function closeAdminPanel() {
  const panel = document.getElementById('adminPanel');
  if (panel) panel.classList.add('hidden');
}

function scrollToApp() { const app = document.getElementById('app'); if (app) app.scrollIntoView({ behavior: 'smooth' }); }
function updateCharCount() { const contractInput = document.getElementById('contractInput'); const charCount = document.getElementById('charCount'); if (contractInput && charCount) { charCount.textContent = contractInput.value.length.toLocaleString('id-ID') + ' KARAKTER'; } }
function clearInput() { const contractInput = document.getElementById('contractInput'); if (contractInput) { contractInput.value = ''; updateCharCount(); } }
function loadSample() { const contractInput = document.getElementById('contractInput'); if (contractInput) { contractInput.value = SAMPLE_CONTRACT; updateCharCount(); showToast('Contoh kontrak dimuat.', 'success'); } }
function onApiKeyInput() { const apiKeyInput = document.getElementById('apiKeyInput'); const clearBtn = document.getElementById('clearApiKeyBtn'); if (apiKeyInput && clearBtn) { clearBtn.style.display = apiKeyInput.value.trim() ? 'flex' : 'none'; } }
function clearApiKey() { localStorage.removeItem(LS_KEY_APIKEY); const apiKeyInput = document.getElementById('apiKeyInput'); const clearBtn = document.getElementById('clearApiKeyBtn'); const badge = document.getElementById('keySavedBadge'); if (apiKeyInput) apiKeyInput.value = ''; if (clearBtn) clearBtn.style.display = 'none'; if (badge) badge.style.display = 'none'; showToast('API Key dihapus.', 'success'); }
function toggleApiKeyVisibility() { const input = document.getElementById('apiKeyInput'); if (!input) return; const isHidden = input.style.webkitTextSecurity !== 'none'; input.style.webkitTextSecurity = isHidden ? 'none' : 'disc'; input.style.textSecurity = isHidden ? 'none' : 'disc'; if (typeof lucide !== 'undefined') lucide.createIcons(); }
function resetApp() { auditResults = null; contractText = ''; const resultsSection = document.getElementById('resultsSection'); const loadingSection = document.getElementById('loadingSection'); const app = document.getElementById('app'); const contractInput = document.getElementById('contractInput'); if (resultsSection) resultsSection.classList.add('hidden'); if (loadingSection) loadingSection.classList.add('hidden'); if (app) app.classList.remove('hidden'); if (contractInput) contractInput.value = ''; updateCharCount(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function showToast(msg, type = 'info') { const toast = document.getElementById('toast'); const msgEl = document.getElementById('toastMsg'); const iconEl = document.getElementById('toastIcon'); if (!toast || !msgEl) return; const icons = { success: '✓', error: '✕', info: 'ℹ' }; if (iconEl) iconEl.textContent = icons[type] || 'ℹ'; msgEl.textContent = msg; toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none'); toast.classList.add('translate-y-0', 'opacity-100'); clearTimeout(toast._timer); toast._timer = setTimeout(() => { toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none'); toast.classList.remove('translate-y-0', 'opacity-100'); }, 4000); }

const LOADING_STEPS = ['Menghubungkan ke Legal Engine...', 'Memproses teks kontrak...', 'Mengidentifikasi pasal-pasal kritis...', 'Mendeteksi red flags...', 'Memeriksa klausul hilang...', 'Memperbaiki kontrak...', 'Menyusun script negosiasi...', 'Memfinalisasi laporan...'];

function runProgressSimulation() { let pct = 0, step = 0; const bar = document.getElementById('progressBar'); const pctEl = document.getElementById('progressPercent'); const stepEl = document.getElementById('loadingStep'); const interval = setInterval(() => { const inc = pct < 75 ? (Math.random() * 6 + 2) : (Math.random() * 1.2 + 0.2); pct = Math.min(pct + inc, 92); if (bar) bar.style.width = pct + '%'; if (pctEl) pctEl.textContent = Math.round(pct) + '%'; const si = Math.min(Math.floor((pct / 92) * LOADING_STEPS.length), LOADING_STEPS.length - 1); if (si !== step && stepEl) { step = si; stepEl.textContent = LOADING_STEPS[step]; } }, 300); return { finish() { clearInterval(interval); if (bar) bar.style.width = '100%'; if (pctEl) pctEl.textContent = '100%'; if (stepEl) stepEl.textContent = 'Laporan siap!'; }, stop() { clearInterval(interval); } }; }

// Parse multi-line API keys from textarea, return array of non-empty keys
function getApiKeys() {
  const raw = document.getElementById('apiKeyInput')?.value || '';
  return raw.split('\n').map(k => k.trim()).filter(k => k.length > 0);
}

// Try one API call with a specific key and model
async function tryRequest(apiKey, model, contract) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.href,
      'X-Title': 'LegalGuard AI'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: `Analisis kontrak berikut dalam format JSON:\n\n${contract}` }
      ],
      temperature: 0.2,
      max_tokens: 8192
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`);
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error('Respons AI kosong.');
  return rawContent;
}

async function analyzeContract() {
  const apiKeys = getApiKeys();
  const contract = document.getElementById('contractInput')?.value.trim();

  if (apiKeys.length === 0) { showToast('Masukkan OpenRouter API Key terlebih dahulu.', 'error'); return; }
  if (contract.length < 50) { showToast('Teks kontrak terlalu pendek. Minimal 50 karakter.', 'error'); return; }

  // Save all API keys as entered
  localStorage.setItem(LS_KEY_APIKEY, document.getElementById('apiKeyInput').value);

  // Show saved badge
  const clearBtn = document.getElementById('clearApiKeyBtn');
  const badge = document.getElementById('keySavedBadge');
  if (clearBtn) clearBtn.style.display = 'flex';
  if (badge) badge.style.display = 'inline-flex';

  contractText = contract;
  const app = document.getElementById('app');
  const resultsSection = document.getElementById('resultsSection');
  const loadingSection = document.getElementById('loadingSection');
  if (app) app.classList.add('hidden');
  if (resultsSection) resultsSection.classList.add('hidden');
  if (loadingSection) loadingSection.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const progress = runProgressSimulation();

  let lastError = null;
  let succeeded = false;

  // Outer loop: try each API key
  outerLoop:
  for (const apiKey of apiKeys) {
    // Inner loop: try each model for this key
    for (const model of SMART_MODELS) {
      try {
        const rawContent = await tryRequest(apiKey, model, contract);
        const result = parseJSON(rawContent);
        progress.finish();
        await sleep(400);
        auditResults = result;
        renderResults(result);
        if (loadingSection) loadingSection.classList.add('hidden');
        if (resultsSection) resultsSection.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        succeeded = true;
        break outerLoop;
      } catch (err) {
        lastError = err;
        console.warn(`Model ${model} dengan key ...${apiKey.slice(-6)} gagal:`, err.message);
        // Continue to next model
      }
    }
    // All models failed for this key, try next key
  }

  if (!succeeded) {
    progress.stop();
    if (loadingSection) loadingSection.classList.add('hidden');
    if (app) app.classList.remove('hidden');
    showToast('Semua model & key gagal. ' + (lastError?.message || 'Periksa koneksi Anda.'), 'error');
    console.error('Last error:', lastError);
  }
}

function parseJSON(raw) {
  let cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace === -1) throw new Error('JSON tidak ditemukan.');
  let depth = 0, inStr = false, escape = false, endIdx = -1;
  for (let i = firstBrace; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inStr) { escape = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  if (endIdx === -1) throw new Error('JSON tidak lengkap.');
  let parsed;
  try { parsed = JSON.parse(cleaned.slice(firstBrace, endIdx + 1)); } catch (e) { const san = cleaned.slice(firstBrace, endIdx + 1).replace(/,\s*([}\]])/g, '$1'); parsed = JSON.parse(san); }
  return {
    score: Math.max(0, Math.min(100, Number(parsed.score) || 50)),
    red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags : [],
    ambiguous: Array.isArray(parsed.ambiguous) ? parsed.ambiguous : [],
    missing: Array.isArray(parsed.missing) ? parsed.missing : [],
    negotiation_script: String(parsed.negotiation_script || 'Script negosiasi tidak tersedia.'),
    fixed_contract: String(parsed.fixed_contract || contractText || 'Kontrak yang sudah diperbaiki akan muncul di sini.')
  };
}

function renderResults(data) {
  const gaugeFill = document.getElementById('gaugeFill'); const gaugeScore = document.getElementById('gaugeScore'); const scoreLabel = document.getElementById('scoreLabel');
  if (gaugeFill) { const totalArc = 126; const offset = totalArc - (data.score / 100) * totalArc; gaugeFill.style.transition = 'none'; gaugeFill.style.strokeDashoffset = String(totalArc); void gaugeFill.getBoundingClientRect(); gaugeFill.style.transition = 'stroke-dashoffset 1.5s ease-out'; const scoreColor = data.score >= 75 ? '#34D399' : data.score >= 50 ? '#F59E0B' : '#F87171'; gaugeFill.setAttribute('stroke', scoreColor); requestAnimationFrame(() => requestAnimationFrame(() => { gaugeFill.style.strokeDashoffset = String(offset); })); }
  if (gaugeScore) animateNumber(gaugeScore, 0, data.score, 1400);
  if (scoreLabel) { if (data.score >= 75) { scoreLabel.textContent = 'Risiko Rendah'; scoreLabel.className = 'text-[8px] sm:text-[10px] font-bold px-2 sm:px-3 py-1 rounded-full uppercase tracking-widest bg-emerald-500/20 text-emerald-400'; } else if (data.score >= 50) { scoreLabel.textContent = 'Risiko Sedang'; scoreLabel.className = 'text-[8px] sm:text-[10px] font-bold px-2 sm:px-3 py-1 rounded-full uppercase tracking-widest bg-amber-500/20 text-amber-400'; } else { scoreLabel.textContent = 'Risiko Tinggi'; scoreLabel.className = 'text-[8px] sm:text-[10px] font-bold px-2 sm:px-3 py-1 rounded-full uppercase tracking-widest bg-red-500/20 text-red-400'; } }
  setEl('countRedFlags', data.red_flags.length); setEl('countAmbiguous', data.ambiguous.length); setEl('countMissing', data.missing.length); setEl('rfBadge', data.red_flags.length); setEl('ambBadge', data.ambiguous.length); setEl('misBadge', data.missing.length);
  const verdictIcon = document.getElementById('verdictIcon'); const verdictText = document.getElementById('verdictText');
  if (verdictIcon && verdictText) { if (data.score >= 75) { verdictIcon.innerHTML = '<i data-lucide="shield-check" class="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400"></i>'; verdictText.textContent = 'Kontrak relatif aman dengan perbaikan minor.'; } else if (data.score >= 50) { verdictIcon.innerHTML = '<i data-lucide="alert-circle" class="w-4 h-4 sm:w-5 sm:h-5 text-amber-400"></i>'; verdictText.textContent = 'Kontrak memiliki risiko sedang. Negosiasikan poin kritis.'; } else { verdictIcon.innerHTML = '<i data-lucide="x-circle" class="w-4 h-4 sm:w-5 sm:h-5 text-red-400"></i>'; verdictText.textContent = 'JANGAN ditandatangani. Kontrak ini mengandung risiko tinggi.'; } }
  renderCards('redFlagsContainer', data.red_flags, 'red'); renderCards('ambiguousContainer', data.ambiguous, 'amber'); renderCards('missingContainer', data.missing, 'blue');
  const scriptEl = document.getElementById('negotiationScript'); if (scriptEl) scriptEl.textContent = data.negotiation_script;
  const fixedEl = document.getElementById('fixedContract'); if (fixedEl && data.fixed_contract) fixedEl.textContent = data.fixed_contract;
  setTimeout(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); }, 60);
}

function renderCards(containerId, items, type) {
  const container = document.getElementById(containerId); if (!container) return; container.innerHTML = '';
  if (!items || items.length === 0) { container.innerHTML = `<div class="text-[10px] sm:text-xs text-slate-600 text-center py-3 sm:py-4 border border-slate-800 rounded-xl">Tidak ditemukan masalah dalam kategori ini</div>`; return; }
  const colors = { red: { border: 'border-red-500/20', bg: 'bg-red-500/5', tag: 'bg-red-500/10 text-red-400', icon: 'alert-triangle', iconCls: 'text-red-400' }, amber: { border: 'border-amber-500/20', bg: 'bg-amber-500/5', tag: 'bg-amber-500/10 text-amber-400', icon: 'help-circle', iconCls: 'text-amber-400' }, blue: { border: 'border-blue-500/20', bg: 'bg-blue-500/5', tag: 'bg-blue-500/10 text-blue-400', icon: 'file-minus', iconCls: 'text-blue-400' } };
  const c = colors[type];
  items.forEach((item, idx) => { const pasal = escapeHtml(item.pasal || '—'); const risiko = escapeHtml(item.risiko || '—'); const saran = escapeHtml(item.saran || '—'); container.innerHTML += `<div class="border ${c.border} ${c.bg} rounded-xl sm:rounded-2xl p-3 sm:p-4 space-y-2 sm:space-y-3" style="animation:fadeInUp .4s ease ${idx * 80}ms both"><div class="flex items-start gap-2"><i data-lucide="${c.icon}" class="w-3 h-3 sm:w-4 sm:h-4 ${c.iconCls} mt-0.5 flex-shrink-0"></i><span class="text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded ${c.tag}">${pasal}</span></div><div><p class="text-[8px] sm:text-[10px] uppercase tracking-widest text-slate-500 mb-1 font-bold">Risiko</p><p class="text-[11px] sm:text-xs text-slate-300 leading-relaxed">${risiko}</p></div><div class="bg-emerald-500/5 border border-emerald-500/10 rounded-lg sm:rounded-xl p-2 sm:p-3"><p class="text-[8px] sm:text-[10px] uppercase tracking-widest text-emerald-500 mb-1 font-bold">Rekomendasi</p><p class="text-[11px] sm:text-xs text-slate-400 leading-relaxed">${saran}</p></div></div>`; });
}

function exportPDF() { if (!auditResults) { showToast('Tidak ada hasil audit.', 'error'); return; } try { if (typeof generateAuditPDF === 'function') { generateAuditPDF(auditResults, contractText); showToast('PDF berhasil diunduh!', 'success'); } else { showToast('Fungsi PDF belum siap.', 'error'); } } catch (err) { showToast('Gagal membuat PDF: ' + err.message, 'error'); } }

function exportDOCX() {
  if (!auditResults) { showToast('Tidak ada hasil audit.', 'error'); return; }
  try {
    if (typeof window.docx === 'undefined') { showToast('Library DOCX sedang dimuat...', 'info'); setTimeout(() => exportDOCX(), 1000); return; }
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = window.docx;
    const now = new Date();
    const formattedDate = now.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const buyerName = currentBuyer?.name || 'Pengguna';
    const fileName = `LegalGuard_Audit_${buyerName}_${now.getFullYear()}${now.getMonth()+1}${now.getDate()}.docx`;
    const children = [];
    children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'LEGALGUARD AI', bold: true, size: 48, color: 'D97706' })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: 'LAPORAN AUDIT KONTRAK BISNIS', size: 28, bold: true })], alignment: AlignmentType.CENTER, spacing: { after: 100 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: `Tanggal: ${formattedDate}`, size: 20, color: '64748B' })], alignment: AlignmentType.CENTER, spacing: { after: 300 } }));
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'RINGKASAN EKSEKUTIF', bold: true, size: 26, color: 'D97706' })], spacing: { after: 200 } }));
    const scoreEmoji = auditResults.score >= 75 ? '✅' : (auditResults.score >= 50 ? '⚠️' : '🔴');
    children.push(new Paragraph({ children: [new TextRun({ text: `${scoreEmoji} Security Score: ${auditResults.score}/100`, bold: true, size: 24 })], spacing: { after: 100 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: `📋 Red Flags: ${auditResults.red_flags.length}  |  ⚠️ Pasal Ambigu: ${auditResults.ambiguous.length}  |  📄 Klausul Hilang: ${auditResults.missing.length}`, size: 20 })], spacing: { after: 200 } }));
    let verdict = ''; if (auditResults.score >= 75) verdict = '✅ RISIKO RENDAH — Kontrak relatif aman dengan perbaikan minor.'; else if (auditResults.score >= 50) verdict = '⚠️ RISIKO SEDANG — Perlu negosiasi sebelum ditandatangani.'; else verdict = '🔴 RISIKO TINGGI — JANGAN ditandatangani sebelum direvisi total.';
    children.push(new Paragraph({ children: [new TextRun({ text: verdict, bold: true, size: 22, color: auditResults.score >= 75 ? '34D399' : (auditResults.score >= 50 ? 'F59E0B' : 'F87171') })], spacing: { after: 300 } }));
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: '📄 KONTRAK YANG SUDAH DIPERBAIKI', bold: true, size: 26, color: '10B981' })], spacing: { after: 150 } }));
    const fixedContractText = auditResults.fixed_contract || 'Kontrak yang sudah diperbaiki tidak tersedia.';
    const fixedLines = fixedContractText.split('\n');
    for (const line of fixedLines) {
      if (line.trim().toUpperCase().startsWith('PASAL') || line.trim().startsWith('Pasal')) { children.push(new Paragraph({ children: [new TextRun({ text: line.trim(), bold: true, size: 20, color: 'F59E0B' })], spacing: { before: 150, after: 50 } })); }
      else if (line.trim() === '') { children.push(new Paragraph({ text: '', spacing: { after: 50 } })); }
      else { children.push(new Paragraph({ children: [new TextRun({ text: line.trim(), size: 18 })], spacing: { after: 30 } })); }
    }
    children.push(new Paragraph({ text: '', spacing: { after: 300 } }));
    if (auditResults.red_flags.length > 0) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '🔴 FATAL RED FLAGS', bold: true, size: 22, color: 'F87171' })], spacing: { after: 150 } }));
      for (let i = 0; i < auditResults.red_flags.length; i++) { const rf = auditResults.red_flags[i]; children.push(new Paragraph({ children: [new TextRun({ text: `Red Flag #${i+1}: ${rf.pasal || 'Pasal tidak disebutkan'}`, bold: true, size: 19, color: 'F87171' })], spacing: { after: 50 } }), new Paragraph({ children: [new TextRun({ text: `Risiko: ${rf.risiko || '-'}`, size: 18 })], spacing: { after: 30 } }), new Paragraph({ children: [new TextRun({ text: `Saran: ${rf.saran || '-'}`, italic: true, size: 18, color: '34D399' })], spacing: { after: 100 } })); }
    }
    if (auditResults.ambiguous.length > 0) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '⚠️ PASAL AMBIGU', bold: true, size: 22, color: 'FBBF24' })], spacing: { after: 150 } }));
      for (let i = 0; i < auditResults.ambiguous.length; i++) { const amb = auditResults.ambiguous[i]; children.push(new Paragraph({ children: [new TextRun({ text: `Pasal #${i+1}: ${amb.pasal || 'Pasal tidak disebutkan'}`, bold: true, size: 19, color: 'FBBF24' })], spacing: { after: 50 } }), new Paragraph({ children: [new TextRun({ text: `Risiko: ${amb.risiko || '-'}`, size: 18 })], spacing: { after: 30 } }), new Paragraph({ children: [new TextRun({ text: `Saran: ${amb.saran || '-'}`, italic: true, size: 18, color: '34D399' })], spacing: { after: 100 } })); }
    }
    if (auditResults.missing.length > 0) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '📄 KLAUSUL YANG HILANG', bold: true, size: 22, color: '60A5FA' })], spacing: { after: 150 } }));
      for (let i = 0; i < auditResults.missing.length; i++) { const miss = auditResults.missing[i]; children.push(new Paragraph({ children: [new TextRun({ text: `Klausul #${i+1}: ${miss.pasal || 'Klausul tidak disebutkan'}`, bold: true, size: 19, color: '60A5FA' })], spacing: { after: 50 } }), new Paragraph({ children: [new TextRun({ text: `Risiko: ${miss.risiko || '-'}`, size: 18 })], spacing: { after: 30 } }), new Paragraph({ children: [new TextRun({ text: `Saran: ${miss.saran || '-'}`, italic: true, size: 18, color: '34D399' })], spacing: { after: 100 } })); }
    }
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: '💬 SCRIPT NEGOSIASI', bold: true, size: 26, color: '10B981' })], spacing: { after: 150 } }));
    const scriptLines = (auditResults.negotiation_script || 'Script negosiasi tidak tersedia.').split('\n');
    for (const line of scriptLines) { if (line.trim() === '') { children.push(new Paragraph({ text: '', spacing: { after: 30 } })); } else { children.push(new Paragraph({ children: [new TextRun({ text: line.trim(), size: 18 })], spacing: { after: 30 } })); } }
    children.push(new Paragraph({ text: '', spacing: { after: 300 } }), new Paragraph({ children: [new TextRun({ text: 'Disclaimer: Laporan ini dihasilkan oleh AI LegalGuard. Bukan merupakan pengganti nasihat hukum dari profesional hukum yang kompeten.', size: 14, color: '64748B', italic: true })], alignment: AlignmentType.CENTER, spacing: { after: 50 } }), new Paragraph({ children: [new TextRun({ text: `Dihasilkan oleh LegalGuard AI · ${formattedDate}`, size: 12, color: '64748B' })], alignment: AlignmentType.CENTER }));
    const doc = new Document({ sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children: children }] });
    Packer.toBlob(doc).then(blob => { if (typeof saveAs !== 'undefined') { saveAs(blob, fileName); } else { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url); } showToast('DOCX berhasil diunduh!', 'success'); });
  } catch (err) { console.error('DOCX Error:', err); showToast('Gagal membuat DOCX: ' + err.message, 'error'); }
}

function copyNegotiationScript() { const el = document.getElementById('negotiationScript'); if (!el) return; const text = el.textContent.trim(); if (!text || text === 'Script akan muncul di sini setelah analisis selesai...') { showToast('Tidak ada script untuk disalin.', 'error'); return; } navigator.clipboard.writeText(text).then(() => showToast('Script berhasil disalin!', 'success')).catch(() => showToast('Gagal menyalin.', 'error')); }
function copyFixedContract() { const el = document.getElementById('fixedContract'); if (!el) return; const text = el.textContent.trim(); if (!text) { showToast('Tidak ada kontrak untuk disalin.', 'error'); return; } navigator.clipboard.writeText(text).then(() => showToast('Kontrak berhasil disalin!', 'success')).catch(() => showToast('Gagal menyalin.', 'error')); }
function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function escapeHtml(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function animateNumber(el, from, to, duration) { const start = performance.now(); (function update(now) { const p = Math.min((now - start) / duration, 1); const ease = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(from + (to - from) * ease); if (p < 1) requestAnimationFrame(update); })(performance.now()); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

window.analyzeContract = analyzeContract;
window.scrollToApp = scrollToApp;
window.updateCharCount = updateCharCount;
window.clearInput = clearInput;
window.loadSample = loadSample;
window.onApiKeyInput = onApiKeyInput;
window.clearApiKey = clearApiKey;
window.toggleApiKeyVisibility = toggleApiKeyVisibility;
window.resetApp = resetApp;
window.exportPDF = exportPDF;
window.exportDOCX = exportDOCX;
window.copyNegotiationScript = copyNegotiationScript;
window.copyFixedContract = copyFixedContract;
window.generateAndAddBuyer = generateAndAddBuyer;
window.deleteBuyer = deleteBuyer;
window.clearAllBuyers = clearAllBuyers;
window.exportAllData = exportAllData;
window.toggleAdminPanel = toggleAdminPanel;
window.closeAdminPanel = closeAdminPanel;
window.verifyAccessCode = verifyAccessCode;