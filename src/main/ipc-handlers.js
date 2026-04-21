const fs = require('fs');
const os = require('os');
const path = require('path');
const { BrowserWindow, dialog } = require('electron');
const { runDispatch, DISPATCH_CHANNELS } = require('./dispatch');
const { buildReceiptHtml } = require('./receipt-html');

function registerIpcHandlers(ipcMain, getDb) {
  // تسجيل القنوات الافتراضية
  for (const ch of DISPATCH_CHANNELS) {
    ipcMain.handle(ch, (_event, ...args) => runDispatch(getDb, ch, args));
  }

  // --- إضافة قناة الماسح الضوئي (Barcode Scanner) ---
  ipcMain.handle('scan:barcode', async (_event, barcode) => {
    try {
      if (!barcode) return { ok: false, error: 'الباركود مطلوب' };
      
      const db = getDb();
      // البحث عن المنتج في جدول products بواسطة الباركود (أو SKU كحل احتياطي)
      const code = String(barcode).trim();
      const product = db
        .prepare(
          `SELECT id, sku, name, unit_price, stock_qty, barcode
           FROM products
           WHERE barcode = ? OR sku = ?
           LIMIT 1`
        )
        .get(code, code);
      
      if (product) {
        // المطلوب: (name, price) — ونرجّع أيضاً حقول كافية لإضافته للسلة
        return { ok: true, result: product };
      } else {
        return { ok: false, error: 'المنتج غير موجود' };
      }
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  // معالج حفظ الملفات (Export)
  ipcMain.handle('export:saveText', async (event, { defaultName, content }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win || undefined, {
      title: 'حفظ الملف',
      defaultPath: defaultName || 'export.csv',
      filters: [
        { name: 'CSV', extensions: ['csv'] },
        { name: 'نص', extensions: ['txt'] },
        { name: 'الكل', extensions: ['*'] }
      ]
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    fs.writeFileSync(filePath, String(content), 'utf8');
    return { ok: true, path: filePath };
  });

  // معالج طباعة الفاتورة
  ipcMain.handle('print:receipt', async (_event, saleId) => {
    const r = buildReceiptHtml(getDb, saleId);
    if (!r.ok) return r;
    const html = r.receiptHtml;
    const tmp = path.join(os.tmpdir(), `receipt-${saleId}-${Date.now()}.html`);
    fs.writeFileSync(tmp, html, 'utf8');
    const printWin = new BrowserWindow({ show: false, width: 420, height: 720 });
    try {
      await printWin.loadFile(tmp);
      await new Promise((resolve) => {
        printWin.webContents.print({ silent: false, printBackground: true }, () => resolve());
      });
      printWin.close();
      fs.unlink(tmp, () => {});
      return { ok: true };
    } catch (e) {
      try {
        printWin.close();
      } catch (_) {}
      try {
        fs.unlinkSync(tmp);
      } catch (_) {}
      return { ok: false, error: String(e.message || e) };
    }
  });
}

module.exports = { registerIpcHandlers };