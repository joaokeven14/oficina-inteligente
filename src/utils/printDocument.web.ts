import type { PrintableRow } from './printDocument';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);

export async function openPrintableDocument(title: string, workshopName: string, rows: PrintableRow[], period?: string, logoUrl?: string | null): Promise<void> {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('O navegador bloqueou a janela do documento. Permita pop-ups para imprimir ou salvar em PDF.');
  const safeTitle = escapeHtml(title);
  const safeWorkshop = escapeHtml(workshopName);
  const safePeriod = period ? `<p class="period">${escapeHtml(period)}</p>` : '';
  const safeLogo = logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="Logotipo da oficina">` : '';
  const tableRows = rows.map(({ label, value }) => `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('');
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>
    *{box-sizing:border-box}body{font:15px/1.5 Arial,sans-serif;color:#182b40;margin:0;padding:36px}header{border-bottom:3px solid #e97824;padding-bottom:18px;margin-bottom:24px}.logo{max-width:180px;max-height:72px;object-fit:contain;object-position:left center;display:block;margin:0 0 12px}h1{font-size:25px;margin:0 0 5px;color:#10243a}h2{font-size:15px;margin:0;color:#597087}.period{color:#67798c;margin:10px 0 0}table{border-collapse:collapse;width:100%}th,td{padding:11px 12px;border-bottom:1px solid #dce4ec;text-align:left;vertical-align:top}th{width:60%;font-weight:600;color:#40566d}td{font-weight:700;color:#10243a}footer{margin-top:30px;padding-top:12px;border-top:1px solid #dce4ec;font-size:11px;color:#687b90}@page{size:A4;margin:14mm}@media print{body{padding:0}}
    </style></head><body><header>${safeLogo}<h1>${safeWorkshop}</h1><h2>${safeTitle}</h2>${safePeriod}</header><main><table><tbody>${tableRows}</tbody></table></main><footer>Documento gerado pelo Oficina Inteligente · ${escapeHtml(new Date().toLocaleString('pt-BR'))}</footer><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`);
  printWindow.document.close();
}
