/* ═══════════════════════════════════════════════════════════
   LegalGuard AI — Script v2 Premium
   Semua logic utuh + fitur baru: upload, personalisasi,
   loading steps animasi, download fixed contract premium
═══════════════════════════════════════════════════════════ */
'use strict';

const LS_KEY_APIKEY        = 'legalguard_api_key';
const LS_KEY_BUYERS        = 'legalguard_buyers';
const LS_KEY_CURRENT_BUYER = 'legalguard_current_buyer';

/* ── MODEL LIST ──────────────────────────────────────────── */
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

/* ── SYSTEM PROMPT ───────────────────────────────────────── */
const SYSTEM_INSTRUCTION = `Anda adalah Senior Legal Auditor Indonesia berpengalaman 20 tahun, ahli hukum perdata dan bisnis Indonesia.

Analisis teks kontrak SECARA SPESIFIK dan MENDALAM. Sebutkan NAMA PASAL ASLI dari kontrak yang dianalisis (contoh: "Pasal 3 — Target Penjualan"), bukan nama generik.

Identifikasi:
1. Fatal Red Flags — pasal berisiko tinggi yang merugikan klien
2. Ambiguous Clauses — pasal tidak jelas yang rawan sengketa
3. Missing Clauses — klausul penting yang tidak ada

Kemudian TULIS ULANG KONTRAK LENGKAP yang sudah diperbaiki dengan:
- Semua pasal bermasalah diperbaiki
- Semua klausul hilang ditambahkan (Force Majeure, Ganti Rugi, Kerahasiaan, dll)
- Bahasa hukum Indonesia yang baku dan profesional
- Nomor kontrak otomatis, struktur pasal bernomor rapi

Output WAJIB JSON MURNI (tanpa markdown, tanpa backtick, tanpa komentar):
{
  "score": 75,
  "red_flags": [{"pasal": "Pasal X — Nama Pasal", "risiko": "Penjelasan risiko spesifik", "saran": "Rekomendasi perubahan konkret"}],
  "ambiguous": [{"pasal": "Pasal X — Nama Pasal", "risiko": "Penjelasan", "saran": "Rekomendasi"}],
  "missing": [{"pasal": "Klausul Force Majeure", "risiko": "Tidak ada perlindungan jika...", "saran": "Tambahkan pasal..."}],
  "negotiation_script": "Script negosiasi lengkap dan profesional yang disesuaikan dengan temuan audit",
  "fixed_contract": "Teks kontrak lengkap yang sudah diperbaiki total, semua pasal ditulis ulang"
}`;

/* ── SAMPLE CONTRACT ─────────────────────────────────────── */
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

/* ── STATE ───────────────────────────────────────────────── */
let auditResults  = null;
let contractText  = '';
let currentBuyer  = null;

/* ── INIT ────────────────────────────────────────────────── */
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

/* ══ BUYER MANAGEMENT ════════════════════════════════════════ */
function initBuyers() {
  let buyers = [];
  try {
    const raw = localStorage.getItem(LS_KEY_BUYERS);
    buyers = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(buyers)) buyers = [];
  } catch (_) { buyers = []; }
  // Pastikan kode demo selalu ada
  if (!buyers.find(b => b.accessCode === 'DEMO2024')) {
    buyers.unshift({ name: 'Demo User', accessCode: 'DEMO2024', createdAt: new Date().toISOString(), lastAccess: null });
    localStorage.setItem(LS_KEY_BUYERS, JSON.stringify(buyers));
  }
  return buyers;
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
  showToast(`Pembeli ${name} ditambahkan · Kode: ${code}`, 'success');
}

function renderAdminBuyersList() {
  const tbody = document.getElementById('adminBuyersList');
  if (!tbody) return;
  const buyers = initBuyers();
  const baseUrl = window.location.origin + window.location.pathname;
  tbody.innerHTML = buyers.map((b) => `
    <tr style="border-bottom:0.5px solid var(--border)">
      <td class="py-3 pr-4 text-xs" style="color:var(--text-primary)">${escapeHtml(b.name)}</td>
      <td class="py-3 pr-4 font-mono-custom text-xs" style="color:var(--gold)">${b.accessCode}</td>
      <td class="py-3 pr-4"><input type="text" readonly value="${baseUrl}?code=${b.accessCode}" class="admin-input px-2 py-1 text-[10px] w-full"></td>
      <td class="py-3 pr-4"><span class="text-[10px] ${b.lastAccess ? 'badge badge-emerald' : 'badge'}">${b.lastAccess ? new Date(b.lastAccess).toLocaleDateString('id') : 'Belum'}</span></td>
      <td class="py-3"><button onclick="deleteBuyer('${b.accessCode}')" class="btn-ghost danger p-1"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button></td>
    </tr>`).join('');
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

/* ══ ACCESS CONTROL ══════════════════════════════════════════ */

// Sembunyikan semua konten, pastikan login tampil
function showLogin() {
  const modal = document.getElementById('accessModal');
  if (modal) { modal.style.cssText = 'display:flex!important'; }
  ['mainNav','hero','app','loadingSection','resultsSection','mainFooter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.cssText = 'display:none!important';
  });
}

// Tampilkan semua konten, sembunyikan login
function showApp(buyer) {
  currentBuyer = buyer;
  const modal = document.getElementById('accessModal');
  if (modal) modal.style.display = 'none';

  const showIds = { mainNav:'block', hero:'flex', app:'block', mainFooter:'block' };
  Object.entries(showIds).forEach(([id, disp]) => {
    const el = document.getElementById(id);
    if (el) { el.style.display = disp; el.classList.remove('hidden'); }
  });

  ['loadingSection','resultsSection'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.classList.add('hidden'); }
  });

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function verifyAccessCode() {
  const codeInput = document.getElementById('accessCodeInput');
  if (!codeInput) return;
  const code = codeInput.value.trim().toUpperCase();
  if (!code) { showToast('Masukkan kode akses!', 'error'); return; }
  const buyers = initBuyers();
  const buyer  = buyers.find(b => b.accessCode === code);
  if (buyer) {
    buyer.lastAccess = new Date().toISOString();
    localStorage.setItem(LS_KEY_BUYERS, JSON.stringify(buyers));
    localStorage.setItem(LS_KEY_CURRENT_BUYER, JSON.stringify(buyer));
    showApp(buyer);
    showToast(`Selamat datang, ${buyer.name}!`, 'success');
  } else {
    const input = document.getElementById('accessCodeInput');
    if (input) {
      input.style.borderColor = 'var(--red)';
      setTimeout(() => { input.style.borderColor = ''; }, 1500);
    }
    showToast('Kode akses tidak valid. Periksa kembali.', 'error');
  }
}

function checkAccessFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  const code  = urlParams.get('code');
  const admin = urlParams.get('admin');

  // Mode admin — bypass login
  if (admin === 'true') {
    showApp({ name: 'Admin', accessCode: 'admin' });
    const adminPanel = document.getElementById('adminPanel');
    if (adminPanel) adminPanel.classList.remove('hidden');
    renderAdminBuyersList();
    return;
  }

  // Cek localStorage — validasi ketat
  const savedRaw = localStorage.getItem(LS_KEY_CURRENT_BUYER);
  if (savedRaw) {
    try {
      const buyer = JSON.parse(savedRaw);
      // Pastikan data valid: punya name dan accessCode
      if (buyer && buyer.name && buyer.accessCode) {
        // Verifikasi kode masih ada di daftar pembeli
        const buyers = initBuyers();
        const stillValid = buyers.find(b => b.accessCode === buyer.accessCode);
        if (stillValid) { showApp(buyer); return; }
      }
    } catch (_) {}
    // Data tidak valid — hapus dan tampilkan login
    localStorage.removeItem(LS_KEY_CURRENT_BUYER);
  }

  // Login via URL ?code=xxx
  if (code) {
    const codeInput = document.getElementById('accessCodeInput');
    if (codeInput) codeInput.value = code;
    verifyAccessCode();
    return;
  }

  // Default: tampilkan halaman login
  showLogin();
}

function toggleAdminPanel() {
  const panel = document.getElementById('adminPanel');
  if (!panel) return;
  if (!panel.classList.contains('hidden')) {
    panel.classList.add('hidden');
    return;
  }
  const pwd = prompt('Masukkan password admin:');
  if (!pwd) return;
  const adminPwd = localStorage.getItem('legalguard_admin_pwd') || 'LGADMIN2026';
  if (pwd !== adminPwd) {
    showToast('Password admin salah!', 'error');
    return;
  }
  panel.classList.remove('hidden');
  renderAdminBuyersList();
}

function closeAdminPanel() {
  const panel = document.getElementById('adminPanel');
  if (panel) panel.classList.add('hidden');
}

/* ══ UI HELPERS ══════════════════════════════════════════════ */
function scrollToApp() {
  const app = document.getElementById('app');
  if (app) app.scrollIntoView({ behavior: 'smooth' });
}

function updateCharCount() {
  const contractInput = document.getElementById('contractInput');
  const charCount     = document.getElementById('charCount');
  if (contractInput && charCount) {
    charCount.textContent = contractInput.value.length.toLocaleString('id-ID') + ' KARAKTER';
  }
}

function clearInput() {
  const contractInput = document.getElementById('contractInput');
  if (contractInput) { contractInput.value = ''; updateCharCount(); }
  const uploadStatus = document.getElementById('uploadStatus');
  if (uploadStatus) uploadStatus.classList.add('hidden');
}

function loadSample() {
  const contractInput = document.getElementById('contractInput');
  if (contractInput) { contractInput.value = SAMPLE_CONTRACT; updateCharCount(); showToast('Contoh kontrak dimuat.', 'success'); }
}

function onApiKeyInput() {
  const apiKeyInput = document.getElementById('apiKeyInput');
  const clearBtn    = document.getElementById('clearApiKeyBtn');
  if (apiKeyInput && clearBtn) {
    clearBtn.style.display = apiKeyInput.value.trim() ? 'flex' : 'none';
  }
}

function clearApiKey() {
  localStorage.removeItem(LS_KEY_APIKEY);
  const apiKeyInput = document.getElementById('apiKeyInput');
  const clearBtn    = document.getElementById('clearApiKeyBtn');
  const badge       = document.getElementById('keySavedBadge');
  if (apiKeyInput) apiKeyInput.value = '';
  if (clearBtn)    clearBtn.style.display = 'none';
  if (badge)       badge.style.display = 'none';
  showToast('Konfigurasi engine dihapus.', 'success');
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('apiKeyInput');
  if (!input) return;
  const isHidden = input.style.webkitTextSecurity !== 'none';
  input.style.webkitTextSecurity = isHidden ? 'none' : 'disc';
  input.style.textSecurity       = isHidden ? 'none' : 'disc';
}

function resetApp() {
  auditResults = null;
  contractText = '';
  const resultsSection  = document.getElementById('resultsSection');
  const loadingSection  = document.getElementById('loadingSection');
  const app             = document.getElementById('app');
  const contractInput   = document.getElementById('contractInput');
  const uploadStatus    = document.getElementById('uploadStatus');
  if (resultsSection) resultsSection.classList.add('hidden');
  if (loadingSection) loadingSection.classList.add('hidden');
  if (app)            app.classList.remove('hidden');
  if (contractInput)  contractInput.value = '';
  if (uploadStatus)   uploadStatus.classList.add('hidden');
  updateCharCount();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(msg, type = 'info') {
  const toast  = document.getElementById('toast');
  const msgEl  = document.getElementById('toastMsg');
  const iconEl = document.getElementById('toastIcon');
  if (!toast || !msgEl) return;
  const colors = { success: 'var(--emerald)', error: 'var(--red)', info: 'var(--gold)' };
  const icons  = { success: '✓', error: '✕', info: 'ℹ' };
  if (iconEl) { iconEl.textContent = icons[type] || 'ℹ'; iconEl.style.color = colors[type] || 'var(--gold)'; }
  msgEl.textContent = msg;
  toast.classList.remove('translate-y-16', 'opacity-0', 'pointer-events-none');
  toast.classList.add('translate-y-0', 'opacity-100');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.add('translate-y-16', 'opacity-0', 'pointer-events-none');
    toast.classList.remove('translate-y-0', 'opacity-100');
  }, 4000);
}

/* ══ FILE UPLOAD ═════════════════════════════════════════════ */
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  processUploadedFile(file);
}

function processUploadedFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  showToast(`Memproses file: ${file.name}`, 'info');

  if (ext === 'pdf') {
    readPDF(file);
  } else if (ext === 'docx' || ext === 'doc') {
    readDOCX(file);
  } else {
    showToast('Format tidak didukung. Gunakan PDF atau DOCX.', 'error');
  }
}

function readDOCX(file) {
  if (typeof mammoth === 'undefined') {
    showToast('Library DOCX sedang dimuat, coba lagi.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    mammoth.extractRawText({ arrayBuffer: e.target.result })
      .then(result => {
        const text = result.value.trim();
        if (text.length < 50) { showToast('Isi dokumen terlalu pendek atau tidak dapat dibaca.', 'error'); return; }
        setContractText(text, file.name);
      })
      .catch(() => showToast('Gagal membaca file DOCX.', 'error'));
  };
  reader.readAsArrayBuffer(file);
}

function readPDF(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const typedArray = new Uint8Array(e.target.result);
    // Load pdf.js dynamically if not present
    if (typeof pdfjsLib === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        extractPDFText(typedArray, file.name);
      };
      document.head.appendChild(script);
    } else {
      extractPDFText(typedArray, file.name);
    }
  };
  reader.readAsArrayBuffer(file);
}

async function extractPDFText(typedArray, fileName) {
  try {
    const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n';
    }
    const text = fullText.trim();
    if (text.length < 50) { showToast('PDF tidak mengandung teks yang bisa dibaca.', 'error'); return; }
    setContractText(text, fileName);
  } catch {
    showToast('Gagal membaca file PDF.', 'error');
  }
}

function setContractText(text, fileName) {
  const contractInput  = document.getElementById('contractInput');
  const uploadStatus   = document.getElementById('uploadStatus');
  const uploadStatusTx = document.getElementById('uploadStatusText');
  if (contractInput)  contractInput.value = text;
  if (uploadStatus)   uploadStatus.classList.remove('hidden');
  if (uploadStatusTx) uploadStatusTx.textContent = `File "${fileName}" berhasil dimuat — ${text.length.toLocaleString('id-ID')} karakter`;
  updateCharCount();
  showToast(`File berhasil dimuat!`, 'success');
}

/* ══ API ═════════════════════════════════════════════════════ */
function getApiKeys() {
  const raw = document.getElementById('apiKeyInput')?.value || '';
  return raw.split('\n').map(k => k.trim()).filter(k => k.length > 0);
}

async function tryRequest(apiKey, model, contract, signal) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', signal,
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

async function raceAllRequests(apiKeys, contract) {
  const controllers = [];
  const promises    = [];
  for (const apiKey of apiKeys) {
    for (const model of SMART_MODELS) {
      const ctrl = new AbortController();
      controllers.push(ctrl);
      promises.push(
        tryRequest(apiKey, model, contract, ctrl.signal)
          .then(raw => parseJSON(raw))
      );
    }
  }
  return new Promise((resolve, reject) => {
    let settled = false, rejectedCount = 0;
    const total = promises.length;
    promises.forEach((p, idx) => {
      p.then(result => {
        if (settled) return;
        settled = true;
        controllers.forEach((c, i) => { if (i !== idx) { try { c.abort(); } catch (_) {} } });
        resolve(result);
      }).catch(err => {
        if (settled) return;
        rejectedCount++;
        console.warn(`Attempt ${idx + 1}/${total} gagal:`, err.message);
        if (rejectedCount === total) {
          reject(new Error('Semua model gagal. Periksa konfigurasi engine atau koneksi Anda.'));
        }
      });
    });
  });
}

/* ══ LOADING STEPS ANIMATION ═════════════════════════════════ */
const STEP_LABELS = [
  'Memindai struktur & jumlah pasal kontrak',
  'Mendeteksi klausul berisiko tinggi',
  'Menganalisis keseimbangan hak & kewajiban para pihak',
  'Menyusun rekomendasi hukum & revisi pasal',
  'Menyiapkan kontrak perbaikan & script negosiasi'
];

const LOADING_STEPS = [
  'Menginisialisasi Legal Engine...',
  'Memproses teks kontrak...',
  'Mengidentifikasi pasal-pasal kritis...',
  'Mendeteksi red flags...',
  'Memeriksa klausul hilang...',
  'Memperbaiki kontrak...',
  'Menyusun script negosiasi...',
  'Memfinalisasi laporan...'
];

function setLoadingStep(stepIdx, state, timeText) {
  const el = document.getElementById(`lstep${stepIdx}`);
  if (!el) return;
  el.className = `loading-step step-${state}`;
  const iconWrap = el.querySelector('.step-icon-wrap');
  const textEl   = el.querySelector('span:not(.font-mono-custom)') || el.childNodes[1];
  const timeEl   = document.getElementById(`lstep${stepIdx}-time`);
  if (iconWrap) {
    iconWrap.className = `step-icon-wrap ${state}`;
    let iconName, iconColor;
    if (state === 'done')   { iconName = 'check'; iconColor = 'var(--emerald)'; }
    else if (state === 'active') { iconName = 'loader'; iconColor = 'var(--gold)'; }
    else                    { iconName = 'circle'; iconColor = 'var(--text-dim)'; }
    iconWrap.innerHTML = `<i data-lucide="${iconName}" class="w-3 h-3" style="color:${iconColor}"></i>`;
  }
  if (textEl) {
    const c = state === 'done' ? 'var(--emerald)' : state === 'active' ? 'var(--gold)' : 'var(--text-dim)';
    textEl.style.color = c;
  }
  if (timeEl) {
    timeEl.textContent = timeText || '—';
    timeEl.style.color = state === 'done' ? 'rgba(46,189,133,0.4)' : state === 'active' ? 'rgba(201,168,76,0.4)' : 'var(--text-dim)';
  }
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function resetLoadingSteps() {
  for (let i = 0; i < 5; i++) setLoadingStep(i, 'idle', '—');
}

function runProgressSimulation() {
  resetLoadingSteps();
  let pct = 0, currentStep = -1;
  const startTime = performance.now();
  const stepTimes = [];
  const bar    = document.getElementById('progressBar');
  const pctEl  = document.getElementById('progressPercent');
  const stepEl = document.getElementById('loadingStep');

  const stepThresholds = [0, 20, 40, 60, 80]; // % when each loading step activates

  const interval = setInterval(() => {
    const inc = pct < 75 ? (Math.random() * 5 + 2) : (Math.random() * 1.2 + 0.2);
    pct = Math.min(pct + inc, 92);
    if (bar)   bar.style.width = pct + '%';
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';

    // Update loading text
    const si = Math.min(Math.floor((pct / 92) * LOADING_STEPS.length), LOADING_STEPS.length - 1);
    if (stepEl) stepEl.textContent = LOADING_STEPS[si];

    // Update step indicators
    for (let i = 0; i < 5; i++) {
      if (pct >= stepThresholds[i]) {
        const isActive = Math.floor(pct / (100 / 5)) === i;
        if (currentStep < i) {
          // mark previous as done
          if (i > 0) {
            const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
            setLoadingStep(i - 1, 'done', elapsed + ' dtk');
          }
          currentStep = i;
          setLoadingStep(i, 'active', '...');
          stepTimes[i] = performance.now();
        }
      }
    }
  }, 300);

  return {
    finish() {
      clearInterval(interval);
      if (bar)   bar.style.width = '100%';
      if (pctEl) pctEl.textContent = '100%';
      if (stepEl) stepEl.textContent = 'Laporan siap!';
      // Mark all remaining active/idle as done
      for (let i = 0; i <= currentStep; i++) {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        setLoadingStep(i, 'done', elapsed + ' dtk');
      }
      if (typeof lucide !== 'undefined') lucide.createIcons();
    },
    stop() { clearInterval(interval); }
  };
}

/* ══ MAIN ANALYZE ════════════════════════════════════════════ */
async function analyzeContract() {
  const apiKeys = getApiKeys();
  const contract = document.getElementById('contractInput')?.value.trim();

  if (apiKeys.length === 0) { showToast('Masukkan konfigurasi engine terlebih dahulu.', 'error'); return; }
  if (!contract || contract.length < 50) { showToast('Teks kontrak terlalu pendek. Minimal 50 karakter.', 'error'); return; }

  localStorage.setItem(LS_KEY_APIKEY, document.getElementById('apiKeyInput').value);
  const clearBtn = document.getElementById('clearApiKeyBtn');
  const badge    = document.getElementById('keySavedBadge');
  if (clearBtn) clearBtn.style.display = 'flex';
  if (badge)    badge.style.display = 'inline-flex';

  contractText = contract;

  const app            = document.getElementById('app');
  const resultsSection = document.getElementById('resultsSection');
  const loadingSection = document.getElementById('loadingSection');
  if (app)            app.classList.add('hidden');
  if (resultsSection) resultsSection.classList.add('hidden');
  if (loadingSection) loadingSection.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const progress = runProgressSimulation();

  try {
    const result = await raceAllRequests(apiKeys, contract);
    progress.finish();
    await sleep(600);
    auditResults = result;
    renderResults(result);
    if (loadingSection) loadingSection.classList.add('hidden');
    if (resultsSection) resultsSection.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    progress.stop();
    if (loadingSection) loadingSection.classList.add('hidden');
    if (app)            app.classList.remove('hidden');
    showToast('Error: ' + (err.message || 'Gagal menghubungi engine.'), 'error');
    console.error(err);
  }
}

/* ══ PARSE JSON ══════════════════════════════════════════════ */
function parseJSON(raw) {
  let cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace === -1) throw new Error('JSON tidak ditemukan.');
  let depth = 0, inStr = false, escape = false, endIdx = -1;
  for (let i = firstBrace; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape)             { escape = false; continue; }
    if (ch === '\\' && inStr) { escape = true; continue; }
    if (ch === '"')           { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  if (endIdx === -1) throw new Error('JSON tidak lengkap.');
  let parsed;
  try {
    parsed = JSON.parse(cleaned.slice(firstBrace, endIdx + 1));
  } catch {
    const san = cleaned.slice(firstBrace, endIdx + 1).replace(/,\s*([}\]])/g, '$1');
    parsed = JSON.parse(san);
  }
  return {
    score:              Math.max(0, Math.min(100, Number(parsed.score) || 50)),
    red_flags:          Array.isArray(parsed.red_flags) ? parsed.red_flags : [],
    ambiguous:          Array.isArray(parsed.ambiguous) ? parsed.ambiguous : [],
    missing:            Array.isArray(parsed.missing)   ? parsed.missing   : [],
    negotiation_script: String(parsed.negotiation_script || 'Script negosiasi tidak tersedia.'),
    fixed_contract:     String(parsed.fixed_contract || contractText || 'Kontrak perbaikan tidak tersedia.')
  };
}

/* ══ RENDER RESULTS ══════════════════════════════════════════ */
function renderResults(data) {

  // Personal banner
  const now      = new Date();
  const buyerName = currentBuyer?.name || 'Pengguna';
  const refNo    = 'LG-' + now.getFullYear() + '-' + String(Math.floor(Math.random() * 99999)).padStart(5, '0');
  const dateStr  = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) + ', ' + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
  setEl('buyerNameDisplay', buyerName);
  setEl('auditDateDisplay', dateStr);
  setEl('auditRefDisplay',  refNo);
  setEl('auditSubtitle', `${data.red_flags.length + data.ambiguous.length + data.missing.length} temuan · ${data.red_flags.length} red flags · dianalisis oleh AI Legal Engine`);

  // Gauge
  const gaugeFill  = document.getElementById('gaugeFill');
  const gaugeScore = document.getElementById('gaugeScore');
  const scoreLabel = document.getElementById('scoreLabel');
  if (gaugeFill) {
    const totalArc   = 126;
    const offset     = totalArc - (data.score / 100) * totalArc;
    const scoreColor = data.score >= 75 ? 'var(--emerald)' : data.score >= 50 ? 'var(--amber)' : 'var(--red)';
    gaugeFill.style.transition = 'none';
    gaugeFill.style.strokeDashoffset = String(totalArc);
    gaugeFill.setAttribute('stroke', scoreColor);
    void gaugeFill.getBoundingClientRect();
    gaugeFill.style.transition = 'stroke-dashoffset 1.5s ease-out';
    requestAnimationFrame(() => requestAnimationFrame(() => { gaugeFill.style.strokeDashoffset = String(offset); }));
    if (gaugeScore) { gaugeScore.style.color = scoreColor; animateNumber(gaugeScore, 0, data.score, 1400); }
  }

  // Score label + badge class
  if (scoreLabel) {
    if (data.score >= 75) {
      scoreLabel.textContent = 'Risiko Rendah';
      scoreLabel.className   = 'badge badge-emerald';
    } else if (data.score >= 50) {
      scoreLabel.textContent = 'Risiko Sedang';
      scoreLabel.className   = 'badge badge-amber';
    } else {
      scoreLabel.textContent = 'Risiko Tinggi';
      scoreLabel.className   = 'badge badge-red';
    }
  }

  // Score breakdown bars (estimated from score)
  const completeness = Math.min(100, data.score + 10 + (data.missing.length === 0 ? 10 : -data.missing.length * 5));
  const balance      = Math.max(10, data.score - data.red_flags.length * 8);
  const clarity      = Math.max(10, data.score - data.ambiguous.length * 7);
  const protection   = Math.max(10, data.score - (data.missing.length * 6));
  setEl('sb1', Math.round(completeness) + '%'); setElAttr('sb1bar', 'style', `width:${completeness}%;background:var(--gold)`);
  setEl('sb2', Math.round(balance) + '%');      setElAttr('sb2bar', 'style', `width:${balance}%;background:${balance < 50 ? 'var(--red)' : 'var(--amber)'}`);
  setEl('sb3', Math.round(clarity) + '%');      setElAttr('sb3bar', 'style', `width:${clarity}%;background:var(--amber)`);
  setEl('sb4', Math.round(protection) + '%');   setElAttr('sb4bar', 'style', `width:${protection}%;background:var(--blue)`);

  // Counts + badges
  setEl('countRedFlags',  data.red_flags.length);
  setEl('countAmbiguous', data.ambiguous.length);
  setEl('countMissing',   data.missing.length);
  setEl('rfBadge',  data.red_flags.length);
  setEl('ambBadge', data.ambiguous.length);
  setEl('misBadge', data.missing.length);

  // Verdict
  const verdictBar  = document.getElementById('verdictBar');
  const verdictIcon = document.getElementById('verdictIcon');
  const verdictText = document.getElementById('verdictText');
  if (verdictBar && verdictIcon && verdictText) {
    if (data.score >= 75) {
      verdictBar.className  = 'verdict-bar low flex-1';
      verdictIcon.innerHTML = '<i data-lucide="shield-check" class="w-4 h-4" style="color:var(--emerald)"></i>';
      verdictText.textContent = 'Kontrak relatif aman dengan perbaikan minor. Tinjau rekomendasi di bawah sebelum penandatanganan.';
    } else if (data.score >= 50) {
      verdictBar.className  = 'verdict-bar mid flex-1';
      verdictIcon.innerHTML = '<i data-lucide="alert-circle" class="w-4 h-4" style="color:var(--amber)"></i>';
      verdictText.innerHTML = `Kontrak mengandung risiko sedang. Terdapat <strong style="color:var(--text-primary)">${data.red_flags.length} pasal berisiko</strong> yang perlu dinegosiasikan. <strong style="color:var(--text-primary)">Jangan tandatangani</strong> sebelum poin kritis diselesaikan.`;
    } else {
      verdictBar.className  = 'verdict-bar high flex-1';
      verdictIcon.innerHTML = '<i data-lucide="x-circle" class="w-4 h-4" style="color:var(--red)"></i>';
      verdictText.innerHTML = `<strong style="color:var(--red)">JANGAN ditandatangani.</strong> Kontrak ini mengandung risiko tinggi dan berpotensi merugikan Anda secara signifikan. Gunakan kontrak perbaikan di bawah.`;
    }
  }

  // Issue cards
  renderCards('redFlagsContainer', data.red_flags, 'red');
  renderCards('ambiguousContainer', data.ambiguous, 'amber');
  renderCards('missingContainer', data.missing, 'blue');

  // Fixed contract meta tags
  const metaEl = document.getElementById('fixedContractMeta');
  if (metaEl) {
    const totalPasal = (data.fixed_contract.match(/Pasal\s+\d+/gi) || []).length;
    metaEl.innerHTML = `
      <span class="badge badge-emerald">REVISI TOTAL</span>
      ${totalPasal > 0 ? `<span class="badge badge-gold">${totalPasal} PASAL</span>` : ''}
      <span class="badge badge-gold">${buyerName.toUpperCase()}</span>
      <span class="badge" style="color:var(--text-dim);border-color:var(--border)">${refNo}</span>
    `;
  }

  // Fixed contract output
  const fixedEl = document.getElementById('fixedContract');
  if (fixedEl) fixedEl.textContent = data.fixed_contract;

  // Negotiation script
  const scriptEl = document.getElementById('negotiationScript');
  if (scriptEl) scriptEl.textContent = data.negotiation_script;

  setTimeout(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); }, 80);
}

function renderCards(containerId, items, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (!items || items.length === 0) {
    container.innerHTML = `<div class="text-xs text-center py-4 rounded-xl" style="color:var(--text-dim);border:0.5px solid var(--border)">Tidak ditemukan masalah dalam kategori ini</div>`;
    return;
  }

  const cfg = {
    red:   { icon: 'alert-triangle', iconColor: 'var(--red)',   titleColor: 'var(--red)',   saranColor: 'var(--emerald)' },
    amber: { icon: 'help-circle',    iconColor: 'var(--amber)', titleColor: 'var(--amber)', saranColor: 'var(--emerald)' },
    blue:  { icon: 'file-minus',     iconColor: 'var(--blue)',  titleColor: 'var(--blue)',  saranColor: 'var(--emerald)' }
  };
  const c = cfg[type];

  items.forEach((item, idx) => {
    const pasal  = escapeHtml(item.pasal  || '—');
    const risiko = escapeHtml(item.risiko || '—');
    const saran  = escapeHtml(item.saran  || '—');
    const div    = document.createElement('div');
    div.className = `issue-card ${type}`;
    div.style.animation = `fadeInUp .35s ease ${idx * 70}ms both`;
    div.innerHTML = `
      <div class="flex items-start gap-2 mb-2">
        <i data-lucide="${c.icon}" class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style="color:${c.iconColor}"></i>
        <span class="text-xs font-semibold" style="color:${c.titleColor}">${pasal}</span>
      </div>
      <p class="text-[9px] font-medium mb-1 tracking-wide" style="color:var(--text-dim)">RISIKO</p>
      <p class="text-[11px] leading-relaxed mb-3" style="color:var(--text-muted)">${risiko}</p>
      <div class="saran-row">
        <i data-lucide="arrow-right" class="w-3 h-3 flex-shrink-0 mt-0.5" style="color:${c.saranColor}"></i>
        <p class="text-[10px] leading-relaxed" style="color:rgba(46,189,133,0.7)">${saran}</p>
      </div>`;
    container.appendChild(div);
  });
}

/* ══ EXPORT PDF ══════════════════════════════════════════════ */
function exportPDF() {
  if (!auditResults) { showToast('Tidak ada hasil audit.', 'error'); return; }
  try {
    if (typeof generateAuditPDF === 'function') {
      generateAuditPDF(auditResults, contractText);
      showToast('PDF berhasil diunduh!', 'success');
    } else {
      showToast('Fungsi PDF belum siap.', 'error');
    }
  } catch (err) {
    showToast('Gagal membuat PDF: ' + err.message, 'error');
  }
}

/* ══ EXPORT DOCX (LAPORAN AUDIT) ═════════════════════════════ */
function exportDOCX() {
  if (!auditResults) { showToast('Tidak ada hasil audit.', 'error'); return; }
  try {
    if (typeof window.docx === 'undefined') {
      showToast('Library DOCX sedang dimuat...', 'info');
      setTimeout(() => exportDOCX(), 1000);
      return;
    }
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = window.docx;
    const now          = new Date();
    const formattedDate = now.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const buyerName    = currentBuyer?.name || 'Pengguna';
    const fileName     = `LegalGuard_Laporan_${buyerName}_${now.getFullYear()}${now.getMonth()+1}${now.getDate()}.docx`;
    const children     = [];

    // Cover
    children.push(new Paragraph({ children: [new TextRun({ text: 'LEGALGUARD AI', bold: true, size: 52, color: 'C9A84C' })], alignment: AlignmentType.CENTER, spacing: { after: 150 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: 'LAPORAN AUDIT KONTRAK BISNIS', bold: true, size: 26 })], alignment: AlignmentType.CENTER, spacing: { after: 80 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: `Untuk: ${buyerName}`, size: 22, color: '64748B' })], alignment: AlignmentType.CENTER, spacing: { after: 60 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: `Tanggal: ${formattedDate}`, size: 20, color: '64748B' })], alignment: AlignmentType.CENTER, spacing: { after: 300 } }));

    // Summary
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'RINGKASAN EKSEKUTIF', bold: true, size: 26, color: 'C9A84C' })], spacing: { after: 200 } }));
    const scoreEmoji = auditResults.score >= 75 ? '✅' : auditResults.score >= 50 ? '⚠️' : '🔴';
    children.push(new Paragraph({ children: [new TextRun({ text: `${scoreEmoji} Security Score: ${auditResults.score}/100`, bold: true, size: 24 })], spacing: { after: 100 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: `Red Flags: ${auditResults.red_flags.length}   |   Pasal Ambigu: ${auditResults.ambiguous.length}   |   Klausul Hilang: ${auditResults.missing.length}`, size: 20 })], spacing: { after: 200 } }));
    const verdict = auditResults.score >= 75 ? '✅ RISIKO RENDAH — Kontrak relatif aman.' : auditResults.score >= 50 ? '⚠️ RISIKO SEDANG — Perlu negosiasi sebelum ditandatangani.' : '🔴 RISIKO TINGGI — JANGAN ditandatangani sebelum direvisi.';
    const vColor  = auditResults.score >= 75 ? '2EBD85' : auditResults.score >= 50 ? 'D4963A' : 'E05555';
    children.push(new Paragraph({ children: [new TextRun({ text: verdict, bold: true, size: 22, color: vColor })], spacing: { after: 300 } }));

    // Fixed contract
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: '📄 KONTRAK YANG SUDAH DIPERBAIKI', bold: true, size: 26, color: '2EBD85' })], spacing: { after: 150 } }));
    for (const line of (auditResults.fixed_contract || '').split('\n')) {
      if (/^Pasal\s+\d+/i.test(line.trim())) {
        children.push(new Paragraph({ children: [new TextRun({ text: line.trim(), bold: true, size: 22, color: 'C9A84C' })], spacing: { before: 180, after: 60 } }));
      } else if (line.trim() === '') {
        children.push(new Paragraph({ text: '', spacing: { after: 60 } }));
      } else {
        children.push(new Paragraph({ children: [new TextRun({ text: line.trim(), size: 20 })], spacing: { after: 40 } }));
      }
    }
    children.push(new Paragraph({ text: '', spacing: { after: 300 } }));

    // Red flags
    if (auditResults.red_flags.length > 0) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '🔴 FATAL RED FLAGS', bold: true, size: 24, color: 'E05555' })], spacing: { after: 150 } }));
      auditResults.red_flags.forEach((rf, i) => {
        children.push(new Paragraph({ children: [new TextRun({ text: `${i+1}. ${rf.pasal || 'Pasal tidak disebutkan'}`, bold: true, size: 21, color: 'E05555' })], spacing: { after: 50 } }));
        children.push(new Paragraph({ children: [new TextRun({ text: `Risiko: ${rf.risiko || '-'}`, size: 19 })], spacing: { after: 40 } }));
        children.push(new Paragraph({ children: [new TextRun({ text: `Rekomendasi: ${rf.saran || '-'}`, italic: true, size: 19, color: '2EBD85' })], spacing: { after: 120 } }));
      });
    }

    // Ambiguous
    if (auditResults.ambiguous.length > 0) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '⚠️ PASAL AMBIGU', bold: true, size: 24, color: 'D4963A' })], spacing: { after: 150 } }));
      auditResults.ambiguous.forEach((amb, i) => {
        children.push(new Paragraph({ children: [new TextRun({ text: `${i+1}. ${amb.pasal || 'Pasal tidak disebutkan'}`, bold: true, size: 21, color: 'D4963A' })], spacing: { after: 50 } }));
        children.push(new Paragraph({ children: [new TextRun({ text: `Risiko: ${amb.risiko || '-'}`, size: 19 })], spacing: { after: 40 } }));
        children.push(new Paragraph({ children: [new TextRun({ text: `Rekomendasi: ${amb.saran || '-'}`, italic: true, size: 19, color: '2EBD85' })], spacing: { after: 120 } }));
      });
    }

    // Missing
    if (auditResults.missing.length > 0) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '📋 KLAUSUL YANG HILANG', bold: true, size: 24, color: '4A90D9' })], spacing: { after: 150 } }));
      auditResults.missing.forEach((miss, i) => {
        children.push(new Paragraph({ children: [new TextRun({ text: `${i+1}. ${miss.pasal || 'Klausul tidak disebutkan'}`, bold: true, size: 21, color: '4A90D9' })], spacing: { after: 50 } }));
        children.push(new Paragraph({ children: [new TextRun({ text: `Risiko: ${miss.risiko || '-'}`, size: 19 })], spacing: { after: 40 } }));
        children.push(new Paragraph({ children: [new TextRun({ text: `Rekomendasi: ${miss.saran || '-'}`, italic: true, size: 19, color: '2EBD85' })], spacing: { after: 120 } }));
      });
    }

    // Negotiation script
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: '💬 SCRIPT NEGOSIASI', bold: true, size: 26, color: 'C9A84C' })], spacing: { after: 150 } }));
    for (const line of (auditResults.negotiation_script || '').split('\n')) {
      if (line.trim() === '') { children.push(new Paragraph({ text: '', spacing: { after: 40 } })); }
      else { children.push(new Paragraph({ children: [new TextRun({ text: line.trim(), size: 20 })], spacing: { after: 40 } })); }
    }

    // Footer
    children.push(new Paragraph({ text: '', spacing: { after: 300 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: 'Disclaimer: Laporan ini dihasilkan oleh AI LegalGuard. Bukan pengganti nasihat hukum profesional.', size: 16, color: '64748B', italic: true })], alignment: AlignmentType.CENTER, spacing: { after: 60 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: `LegalGuard AI © 2026 · ${formattedDate}`, size: 14, color: '64748B' })], alignment: AlignmentType.CENTER }));

    const doc = new Document({ sections: [{ properties: { page: { margin: { top: 720, right: 900, bottom: 720, left: 900 } } }, children }] });
    Packer.toBlob(doc).then(blob => {
      if (typeof saveAs !== 'undefined') { saveAs(blob, fileName); }
      else { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url); }
      showToast('Laporan DOCX berhasil diunduh!', 'success');
    });
  } catch (err) {
    console.error('DOCX Error:', err);
    showToast('Gagal membuat DOCX: ' + err.message, 'error');
  }
}

/* ══ DOWNLOAD FIXED CONTRACT (DOCX KHUSUS) ══════════════════ */
function downloadFixedContract() {
  if (!auditResults || !auditResults.fixed_contract) { showToast('Kontrak perbaikan belum tersedia.', 'error'); return; }
  try {
    if (typeof window.docx === 'undefined') {
      showToast('Library DOCX sedang dimuat...', 'info');
      setTimeout(() => downloadFixedContract(), 1000);
      return;
    }
    const { Document, Packer, Paragraph, TextRun, AlignmentType } = window.docx;
    const now         = new Date();
    const buyerName   = currentBuyer?.name || 'Pengguna';
    const refNo       = 'LG-' + now.getFullYear() + '-' + String(Math.floor(Math.random() * 99999)).padStart(5, '0');
    const dateStr     = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const fileName    = `Kontrak_Perbaikan_${buyerName}_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.docx`;
    const children    = [];

    // Header firma
    children.push(new Paragraph({ children: [new TextRun({ text: 'LEGALGUARD AI', bold: true, size: 28, color: 'C9A84C' })], alignment: AlignmentType.CENTER, spacing: { after: 60 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: 'DOKUMEN KONTRAK — HASIL PERBAIKAN AI LEGAL AUDITOR', size: 18, color: '64748B' })], alignment: AlignmentType.CENTER, spacing: { after: 60 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: `Ref: ${refNo}   ·   Dibuat: ${dateStr}   ·   Untuk: ${buyerName}`, size: 16, color: '94A3B8' })], alignment: AlignmentType.CENTER, spacing: { after: 120 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: '─'.repeat(60), color: 'C9A84C', size: 14 })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }));

    // Kontrak isi
    const lines = auditResults.fixed_contract.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') {
        children.push(new Paragraph({ text: '', spacing: { after: 60 } }));
      } else if (/^(PERJANJIAN|KONTRAK|AGREEMENT)/i.test(trimmed)) {
        children.push(new Paragraph({ children: [new TextRun({ text: trimmed, bold: true, size: 30, color: 'E8E4DC' })], alignment: AlignmentType.CENTER, spacing: { before: 100, after: 120 } }));
      } else if (/^Pasal\s+\d+/i.test(trimmed)) {
        children.push(new Paragraph({ children: [new TextRun({ text: trimmed, bold: true, size: 24, color: 'C9A84C' })], spacing: { before: 200, after: 80 } }));
      } else if (/^[A-Z][A-Z\s]+:$/.test(trimmed)) {
        children.push(new Paragraph({ children: [new TextRun({ text: trimmed, bold: true, size: 20, color: 'E8E4DC' })], spacing: { before: 120, after: 60 } }));
      } else {
        children.push(new Paragraph({ children: [new TextRun({ text: trimmed, size: 20 })], spacing: { after: 40 } }));
      }
    }

    // Footer
    children.push(new Paragraph({ text: '', spacing: { after: 300 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: '─'.repeat(60), color: 'C9A84C', size: 14 })], alignment: AlignmentType.CENTER, spacing: { after: 120 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: 'Dokumen ini dihasilkan oleh AI Legal Auditor LegalGuard. Disarankan untuk ditinjau oleh konsultan hukum sebelum penandatanganan.', size: 16, color: '64748B', italic: true })], alignment: AlignmentType.CENTER, spacing: { after: 60 } }));
    children.push(new Paragraph({ children: [new TextRun({ text: `© 2026 LegalGuard AI Indonesia · ${refNo}`, size: 14, color: '475569' })], alignment: AlignmentType.CENTER }));

    const docObj = new Document({ sections: [{ properties: { page: { margin: { top: 900, right: 1080, bottom: 900, left: 1080 } } }, children }] });
    Packer.toBlob(docObj).then(blob => {
      if (typeof saveAs !== 'undefined') { saveAs(blob, fileName); }
      else { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url); }
      showToast('Kontrak perbaikan berhasil diunduh!', 'success');
    });
  } catch (err) {
    console.error('Download Fixed Contract Error:', err);
    showToast('Gagal mengunduh kontrak: ' + err.message, 'error');
  }
}

/* ══ COPY HELPERS ════════════════════════════════════════════ */
function copyNegotiationScript() {
  const el = document.getElementById('negotiationScript');
  if (!el) return;
  const text = el.textContent.trim();
  if (!text) { showToast('Tidak ada script untuk disalin.', 'error'); return; }
  navigator.clipboard.writeText(text).then(() => showToast('Script berhasil disalin!', 'success')).catch(() => showToast('Gagal menyalin.', 'error'));
}

function copyFixedContract() {
  const el = document.getElementById('fixedContract');
  if (!el) return;
  const text = el.textContent.trim();
  if (!text) { showToast('Tidak ada kontrak untuk disalin.', 'error'); return; }
  navigator.clipboard.writeText(text).then(() => showToast('Kontrak berhasil disalin!', 'success')).catch(() => showToast('Gagal menyalin.', 'error'));
}

/* ══ UTILS ═══════════════════════════════════════════════════ */
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setElAttr(id, attr, val) {
  const el = document.getElementById(id);
  if (el) el.setAttribute(attr, val);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function animateNumber(el, from, to, duration) {
  const start = performance.now();
  (function update(now) {
    const p    = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * ease);
    if (p < 1) requestAnimationFrame(update);
  })(performance.now());
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ══ PDF GENERATOR COMPAT ════════════════════════════════════ */
// Update color palette to match new premium colors
if (typeof window !== 'undefined') {
  window._lgPremiumColors = {
    bgDark: [12, 12, 16], bgCard: [19, 19, 26],
    gold: [201, 168, 76], white: [232, 228, 220],
    muted: [160, 152, 140], red: [224, 85, 85],
    amber: [212, 150, 58], blue: [74, 144, 217],
    emerald: [46, 189, 133]
  };
}

/* ══ GLOBAL EXPORTS ══════════════════════════════════════════ */
window.analyzeContract       = analyzeContract;
window.scrollToApp           = scrollToApp;
window.updateCharCount       = updateCharCount;
window.clearInput            = clearInput;
window.loadSample            = loadSample;
window.onApiKeyInput         = onApiKeyInput;
window.clearApiKey           = clearApiKey;
window.toggleApiKeyVisibility = toggleApiKeyVisibility;
window.resetApp              = resetApp;
window.exportPDF             = exportPDF;
window.exportDOCX            = exportDOCX;
window.downloadFixedContract = downloadFixedContract;
window.copyNegotiationScript = copyNegotiationScript;
window.copyFixedContract     = copyFixedContract;
window.generateAndAddBuyer   = generateAndAddBuyer;
window.deleteBuyer           = deleteBuyer;
window.clearAllBuyers        = clearAllBuyers;
window.exportAllData         = exportAllData;
window.toggleAdminPanel      = toggleAdminPanel;
window.closeAdminPanel       = closeAdminPanel;
window.verifyAccessCode      = verifyAccessCode;
window.handleFileUpload      = handleFileUpload;
window.processUploadedFile   = processUploadedFile;
