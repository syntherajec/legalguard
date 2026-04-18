/* ═══════════════════════════════════════════════════════════
   LegalGuard AI — PDF Report Generator v2.2 (FIXED)
═══════════════════════════════════════════════════════════ */

function generateAuditPDF(data, contractText) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const PAGE_W = 210;
  const PAGE_H = 297;
  const MARGIN = 18;
  const COL_W = PAGE_W - (MARGIN * 2);
  const FOOTER_H = 14;
  const SAFE_BOTTOM = PAGE_H - MARGIN - FOOTER_H;
  let y = 0;
  let currentHeader = '';

  // ── COLOUR PALETTE ────────────────────────────────────
  const C = {
    bgDark:  [15, 23, 42],
    bgCard:  [30, 41, 59],
    gold:    [245, 158, 11],
    goldDim: [90, 60, 8],
    white:   [241, 245, 249],
    muted:   [148, 163, 184],
    dim:     [71, 85, 105],
    red:     [248, 113, 113],
    amber:   [251, 191, 36],
    blue:    [96, 165, 250],
    emerald: [52, 211, 153],
    border:  [51, 65, 85],
  };

  // ── HELPERS ───────────────────────────────────────────
  const setFill   = (rgb) => doc.setFillColor(...rgb);
  const setTxt    = (rgb) => doc.setTextColor(...rgb);
  const setFont   = (style, size) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
  };

  function wrap(text, maxWidth, fontSize) {
    setFont('normal', fontSize);
    return doc.splitTextToSize(String(text || ''), maxWidth);
  }

  // ── PAGE MANAGEMENT ───────────────────────────────────
  function drawPageBg() {
    setFill(C.bgDark);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
    setFill(C.goldDim);
    doc.rect(0, 0, 2.5, PAGE_H, 'F'); 
  }

  function drawPageHeader(title) {
    setFill(C.bgCard);
    doc.rect(0, 0, PAGE_W, 13, 'F');
    setFill(C.gold);
    doc.rect(0, 0, PAGE_W, 1, 'F');
    setFont('bold', 7);
    setTxt(C.gold);
    doc.text('LEGALGUARD AI', MARGIN, 9);
    setTxt(C.dim);
    doc.text(title.toUpperCase(), PAGE_W / 2, 9, { align: 'center' });
    const pg = doc.internal.getNumberOfPages();
    doc.text(`Hal. ${pg}`, PAGE_W - MARGIN, 9, { align: 'right' });
    y = 25; // Reset Y ke bawah header
  }

  function drawPageFooter() {
    setFill(C.bgCard);
    doc.rect(0, PAGE_H - FOOTER_H, PAGE_W, FOOTER_H, 'F');
    setFont('normal', 6.5);
    setTxt(C.dim);
    doc.text('Laporan ini bersifat konfidensial dan dihasilkan oleh AI.', PAGE_W / 2, PAGE_H - 6, { align: 'center' });
  }

  function checkPage(needed = 20) {
    if (y + needed > SAFE_BOTTOM) {
      drawPageFooter();
      doc.addPage();
      drawPageBg();
      drawPageHeader(currentHeader);
    }
  }

  function drawSectionTitle(title, color) {
    checkPage(18);
    setFill(color.map(v => Math.round(v * 0.15)));
    doc.roundedRect(MARGIN, y, COL_W, 10, 2, 2, 'F');
    setFont('bold', 10);
    setTxt(color);
    doc.text(title, MARGIN + 4, y + 6.5);
    y += 14;
  }

  function drawIssueCard(item, idx, tagColor) {
    const pasalLines = wrap(item.pasal || '—', COL_W - 50, 8);
    const risikoLines = wrap(item.risiko || '—', COL_W - 12, 9);
    const saranLines = wrap(item.saran || '—', COL_W - 16, 8);

    const cardH = 20 + (risikoLines.length * 5) + (saranLines.length * 4.5);
    checkPage(cardH + 10);

    setFill(C.bgCard);
    doc.roundedRect(MARGIN, y, COL_W, cardH, 2, 2, 'F');
    
    // Tag Left
    setFill(tagColor);
    doc.rect(MARGIN, y, 1.5, cardH, 'F');

    setTxt(C.dim);
    setFont('bold', 7);
    doc.text(`#${idx + 1}`, PAGE_W - MARGIN - 5, y + 6);

    // Pasal
    setTxt(tagColor);
    setFont('bold', 8);
    doc.text(pasalLines[0], MARGIN + 6, y + 6);
    
    let iy = y + 12;
    setFont('bold', 7);
    setTxt(C.dim);
    doc.text('RISIKO:', MARGIN + 6, iy);
    iy += 5;
    setFont('normal', 9);
    setTxt(C.white);
    risikoLines.forEach(l => { doc.text(l, MARGIN + 6, iy); iy += 5; });

    iy += 2;
    setFont('bold', 7);
    setTxt(C.emerald);
    doc.text('SARAN PERBAIKAN:', MARGIN + 6, iy);
    iy += 5;
    setFont('normal', 8);
    setTxt(C.muted);
    saranLines.forEach(l => { doc.text(l, MARGIN + 6, iy); iy += 4.5; });

    y += cardH + 6;
  }

  // ── PROCESS DOCUMENT ──────────────────────────────────
  
  // 1. COVER PAGE
  drawPageBg();
  y = 60;
  setFont('bold', 28);
  setTxt(C.gold);
  doc.text('LegalGuard AI', PAGE_W / 2, y, { align: 'center' });
  y += 10;
  setFont('normal', 12);
  setTxt(C.muted);
  doc.text('LAPORAN AUDIT KONTRAK BISNIS', PAGE_W / 2, y, { align: 'center' });

  // Score Circle
  y += 25;
  const sColor = data.score >= 75 ? C.emerald : (data.score >= 50 ? C.amber : C.red);
  setFill(C.bgCard);
  doc.circle(PAGE_W / 2, y, 20, 'F');
  setFont('bold', 20);
  setTxt(sColor);
  doc.text(String(data.score), PAGE_W / 2, y + 2, { align: 'center' });
  setFont('normal', 7);
  setTxt(C.dim);
  doc.text('SCORE', PAGE_W / 2, y + 9, { align: 'center' });

  // Verdict banner
  y += 30;
  const verdictText =
    data.score >= 75 ? 'RISIKO RENDAH — Aman untuk Ditandatangani' :
    data.score >= 50 ? 'RISIKO SEDANG — Perlu Negosiasi Sebelum TTD' :
                       'RISIKO TINGGI — JANGAN Ditandatangani';
  setFill(sColor.map(v => Math.round(v * 0.12)));
  doc.roundedRect(MARGIN + 20, y, COL_W - 40, 11, 2, 2, 'F');
  setFont('bold', 8.5);
  setTxt(sColor);
  doc.text(verdictText, PAGE_W / 2, y + 7.5, { align: 'center' });

  // Stats row
  y += 22;
  const stats = [
    { label: 'Fatal Red Flags', value: data.red_flags.length, color: C.red },
    { label: 'Pasal Ambigu',    value: data.ambiguous.length, color: C.amber },
    { label: 'Klausul Hilang',  value: data.missing.length,   color: C.blue },
  ];
  const statW = (COL_W - 14) / 3;
  stats.forEach((s, i) => {
    const bx = MARGIN + i * (statW + 7);
    setFill(C.bgCard);
    doc.roundedRect(bx, y, statW, 27, 3, 3, 'F');
    setFont('bold', 18);
    setTxt(s.color);
    doc.text(String(s.value), bx + statW / 2, y + 14, { align: 'center' });
    setFont('normal', 7);
    setTxt(C.muted);
    doc.text(s.label, bx + statW / 2, y + 22, { align: 'center' });
  });

  // Date/meta
  y += 38;
  const now = new Date();
  setFont('normal', 8);
  setTxt(C.dim);
  doc.text('Tanggal Audit : ' + now.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }), PAGE_W / 2, y, { align: 'center' });
  y += 6;
  doc.text('Platform : LegalGuard AI  |  via OpenRouter', PAGE_W / 2, y, { align: 'center' });

  // Cover footer
  setFill(C.bgCard);
  doc.rect(0, PAGE_H - 14, PAGE_W, 14, 'F');
  setFont('normal', 6.5);
  setTxt(C.dim);
  doc.text('Disclaimer: Laporan ini dihasilkan AI. Bukan pengganti konsultasi hukum profesional.', PAGE_W / 2, PAGE_H - 6, { align: 'center' });

  // 2. ISSUES PAGE
  doc.addPage();
  drawPageBg();
  currentHeader = 'Hasil Audit Kontrak';
  drawPageHeader(currentHeader);

  drawSectionTitle('FATAL RED FLAGS', C.red);
  if (data.red_flags.length === 0) {
    checkPage(10);
    setTxt(C.muted); setFont('normal', 9);
    doc.text('Tidak ditemukan risiko fatal.', MARGIN + 5, y);
    y += 12;
  } else {
    data.red_flags.forEach((it, i) => drawIssueCard(it, i, C.red));
  }

  y += 4;
  drawSectionTitle('PASAL AMBIGU', C.amber);
  if (data.ambiguous.length === 0) {
    checkPage(10);
    setTxt(C.muted); setFont('normal', 9);
    doc.text('Tidak ditemukan pasal ambigu.', MARGIN + 5, y);
    y += 12;
  } else {
    data.ambiguous.forEach((it, i) => drawIssueCard(it, i, C.amber));
  }

  y += 4;
  drawSectionTitle('KLAUSUL YANG HILANG', C.blue);
  if (data.missing.length === 0) {
    checkPage(10);
    setTxt(C.muted); setFont('normal', 9);
    doc.text('Tidak ada klausul penting yang hilang.', MARGIN + 5, y);
    y += 12;
  } else {
    data.missing.forEach((it, i) => drawIssueCard(it, i, C.blue));
  }

  // 3. NEGOTIATION SCRIPT
  doc.addPage();
  drawPageBg();
  currentHeader = 'Script Negosiasi';
  drawPageHeader(currentHeader);
  drawSectionTitle('REKOMENDASI NEGOSIASI', C.emerald);

  const scriptLines = wrap(data.negotiation_script, COL_W - 10, 9);
  setFont('normal', 9);
  setTxt(C.muted);
  scriptLines.forEach(l => {
    checkPage(6);
    doc.text(l, MARGIN + 5, y);
    y += 5.5;
  });

  drawPageFooter();
  doc.save(`Audit_LegalGuard_${new Date().getTime()}.pdf`);
}