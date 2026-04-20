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
    if (channel === 'print:receipt') {
      const saleId = args && args[0];
      const r = buildReceiptHtml(getDb, saleId);
      res.json({ ok: true, result: r });
      return;
    }
    if (!dispatchSet.has(channel)) {
      res.status(400).json({ ok: false, error: `قناة غير مدعومة: ${channel}` });
      return;
    }
    const result = runDispatch(getDb, channel, args || []);
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.use(express.static(path.join(__dirname, '..', 'src', 'renderer')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`سوبر ماركت — خادم الشبكة`);
  console.log(`قاعدة البيانات: ${dbPath}`);
  console.log(`افتح من الحاسوب أو الهاتف (نفس الـ Wi‑Fi): http://localhost:${PORT}`);
  console.log(`أو استبدل localhost بعنوان IP هذا الجهاز.`);
});
