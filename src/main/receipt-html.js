function getSetting(db, key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row && row.value != null && row.value !== '' ? row.value : fallback;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildReceiptHtml(getDb, saleId) {
  const db = getDb();
  const id = Number(saleId);
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
  if (!sale) return { ok: false, error: 'فاتورة غير موجودة' };
  const items = db
    .prepare(
      `SELECT si.qty, si.unit_price, si.line_total, p.name, p.sku
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = ?
       ORDER BY si.id`
    )
    .all(id);
  const storeName = getSetting(db, 'store_name', 'سوبر ماركت');
  const currency = getSetting(db, 'currency', 'ر.س');
  const rowsHtml = items
    .map(
      (it) => `<tr>
        <td>${esc(it.name)}</td>
        <td>${Number(it.qty).toLocaleString('ar-DZ')}</td>
        <td>${Number(it.unit_price).toLocaleString('ar-DZ', { minimumFractionDigits: 2 })}</td>
        <td>${Number(it.line_total).toLocaleString('ar-DZ', { minimumFractionDigits: 2 })}</td>
      </tr>`
    )
    .join('');
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>فاتورة</title>
<style>
  body{font-family:'Segoe UI',Tahoma,sans-serif;padding:16px;font-size:13px;color:#111;margin:0}
  h1{font-size:18px;margin:0 0 8px}
  .muted{color:#555;font-size:12px;margin-bottom:12px}
  table{width:100%;border-collapse:collapse}
  th,td{border-bottom:1px solid #ddd;padding:6px 4px;text-align:right}
  th{font-size:11px;color:#444}
  .total{font-weight:800;margin-top:10px;font-size:15px}
</style>
</head>
<body>
  <h1>${esc(storeName)}</h1>
  <div class="muted">فاتورة #${id} — ${esc(sale.sold_at)} — ${esc(sale.payment_method || '')}</div>
  ${sale.notes ? `<div class="muted">ملاحظات: ${esc(sale.notes)}</div>` : ''}
  <table>
    <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <p class="total">الإجمالي: ${Number(sale.total).toLocaleString('ar-DZ', { minimumFractionDigits: 2 })} ${esc(
    currency
  )}</p>
</body>
</html>`;
  return { ok: true, receiptHtml: html };
}

module.exports = { buildReceiptHtml };
