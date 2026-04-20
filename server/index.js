/**
 * خادم HTTP: نفس قاعدة SQLite + واجهة الويب للهاتف (المتصفح على الشبكة).
 * التشغيل: npm run server
 * ثم من الهاتف: http://عنوان-IP-الحاسوب:3847
 */
const path = require('path');
const express = require('express');
const cors = require('cors');
const { createGetDb } = require('./open-db');
const { runDispatch, DISPATCH_CHANNELS } = require('../src/main/dispatch');
const { buildReceiptHtml } = require('../src/main/receipt-html');

const PORT = Number(process.env.PORT) || 3847;
const dbPath =
  process.env.SUPERMARKET_DB ||
  path.join(__dirname, '..', 'data', 'server-supermarket.db');

const getDb = createGetDb(dbPath);
const dispatchSet = new Set(DISPATCH_CHANNELS);

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '4mb' }));

app.post('/api/invoke', (req, res) => {
  try {
    const { channel, args } = req.body || {};
    
    if (!channel) {
      res.status(400).json({ ok: false, error: 'channel مطلوب' });
      return;
    }

    // --- 1. منطق تصدير البيانات ---
    if (channel === 'export:saveText') {
      const payload = (args && args[0]) || {};
      res.json({
        ok: true,
        result: {
          saveAsDownload: true,
          defaultName: payload.defaultName || 'export.csv',
          content: String(payload.content ?? '')
        }
      });
      return;
    }

    // --- 2. منطق طباعة الفاتورة ---
    if (channel === 'print:receipt') {
      const saleId = args && args[0];
      const r = buildReceiptHtml(getDb, saleId);
      res.json({ ok: true, result: r });
      return;
    }

    // --- 3. منطق الماسح الضوئي (Barcode Scanner) الجديد ---
    if (channel === 'scan:barcode') {
      const barcode = args && args[0];
      if (!barcode) {
        res.status(400).json({ ok: false, error: 'رقم الباركود مطلوب' });
        return;
      }

      const db = getDb();
      // البحث عن المنتج بواسطة الباركود
      const product = db.prepare('SELECT * FROM products WHERE barcode = ?').get(barcode);

      if (product) {
        res.json({ ok: true, result: product });
      } else {
        res.status(404).json({ ok: false, error: 'المنتج غير مسجل في النظام' });
      }
      return;
    }

    // --- 4. التحقق من القنوات الأخرى ---
    if (!dispatchSet.has(channel)) {
      res.status(400).json({ ok: false, error: `قناة غير مدعومة: ${channel}` });
      return;
    }

    const result = runDispatch(getDb, channel, args || []);
    res.json({ ok: true, result });

  } catch (e) {
    console.error("Error in /api/invoke:", e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// تقديم ملفات الواجهة (Renderer) للهاتف
app.use(express.static(path.join(__dirname, '..', 'src', 'renderer')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`-------------------------------------------`);
  console.log(`🚀 سوبر ماركت — خادم الشبكة يعمل الآن`);
  console.log(`📂 قاعدة البيانات: ${dbPath}`);
  console.log(`🌐 الرابط المحلي: http://localhost:${PORT}`);
  console.log(`📱 من الهاتف: استبدل localhost بـ عنوان IP حاسوبك`);
  console.log(`📟 دعم الماسح الضوئي: مفعّل عبر القناة 'scan:barcode'`);
  console.log(`-------------------------------------------`);
});