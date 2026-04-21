function getSetting(db, key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row && row.value != null && row.value !== '' ? row.value : fallback;
}

function runDispatch(getDb, channel, args = []) {
  const db = getDb();

  switch (channel) {
    case 'settings:getAll': {
      const rows = db.prepare('SELECT key, value FROM settings').all();
      const out = {};
      for (const r of rows) out[r.key] = r.value;
      return out;
    }
    case 'settings:patch': {
      const partial = args[0];
      const stmt = db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      );
      const tx = db.transaction(() => {
        for (const [k, v] of Object.entries(partial || {})) {
          if (v === undefined || v === null) continue;
          stmt.run(String(k), String(v));
        }
      });
      tx();
      return { ok: true };
    }
    case 'dashboard:stats': {
      const thr = Number(getSetting(db, 'low_stock_threshold', '10')) || 10;
      const productsCount = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
      const lowStock = db
        .prepare('SELECT COUNT(*) AS n FROM products WHERE stock_qty >= 0 AND stock_qty < ?')
        .get(thr).n;
      const today = db
        .prepare(
          `SELECT COUNT(*) AS c, COALESCE(SUM(total), 0) AS revenue
           FROM sales
           WHERE date(sold_at, 'localtime') = date('now', 'localtime')`
        )
        .get();
      return {
        productsCount,
        lowStock,
        salesToday: today.c,
        revenueToday: today.revenue,
        lowStockThreshold: thr
      };
    }
    case 'dashboard:overview': {
      const thr = Number(getSetting(db, 'low_stock_threshold', '10')) || 10;
      const productsCount = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
      const lowStock = db
        .prepare('SELECT COUNT(*) AS n FROM products WHERE stock_qty >= 0 AND stock_qty < ?')
        .get(thr).n;
      const today = db
        .prepare(
          `SELECT COUNT(*) AS c, COALESCE(SUM(total), 0) AS revenue
           FROM sales
           WHERE date(sold_at, 'localtime') = date('now', 'localtime')`
        )
        .get();
      const recentSales = db
        .prepare(
          `SELECT id, sold_at, total, payment_method
           FROM sales
           ORDER BY sold_at DESC
           LIMIT 8`
        )
        .all();
      const topProducts = db
        .prepare(
          `SELECT p.name AS name, SUM(si.line_total) AS revenue, SUM(si.qty) AS units
           FROM sale_items si
           JOIN products p ON p.id = si.product_id
           GROUP BY p.id
           ORDER BY revenue DESC
           LIMIT 5`
        )
        .all();
      const raw = db
        .prepare(
          `SELECT date(sold_at, 'localtime') AS d, SUM(total) AS revenue
           FROM sales
           WHERE date(sold_at, 'localtime') >= date('now', 'localtime', '-6 days')
           GROUP BY date(sold_at, 'localtime')`
        )
        .all();
      const map = new Map(raw.map((r) => [r.d, r.revenue]));
      const chart7 = [];
      for (let i = 6; i >= 0; i--) {
        const row = db.prepare(`SELECT date('now', 'localtime', ?) AS d`).get(`-${i} days`);
        const d = row.d;
        chart7.push({ day: d, revenue: Number(map.get(d) || 0) });
      }
      return {
        stats: {
          productsCount,
          lowStock,
          salesToday: today.c,
          revenueToday: today.revenue,
          lowStockThreshold: thr
        },
        recentSales,
        topProducts,
        chart7
      };
    }
    case 'reports:salesInRange': {
      const from = args[0];
      const to = args[1];
      const f = String(from || '').slice(0, 10);
      const t = String(to || '').slice(0, 10);
      if (!f || !t) return [];
      return db
        .prepare(
          `SELECT id, sold_at, total, payment_method, notes
           FROM sales
           WHERE date(sold_at, 'localtime') BETWEEN ? AND ?
           ORDER BY sold_at DESC`
        )
        .all(f, t);
    }
    case 'reports:salesCsv': {
      const from = args[0];
      const to = args[1];
      const f = String(from || '').slice(0, 10);
      const t = String(to || '').slice(0, 10);
      const rows = db
        .prepare(
          `SELECT id, sold_at, total, payment_method, notes
           FROM sales
           WHERE date(sold_at, 'localtime') BETWEEN ? AND ?
           ORDER BY sold_at DESC`
        )
        .all(f, t);
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [
        '\ufeffid,sold_at,total,payment_method,notes',
        ...rows.map((r) =>
          [r.id, r.sold_at, r.total, r.payment_method || '', r.notes || ''].map(esc).join(',')
        )
      ];
      return lines.join('\n');
    }
    case 'products:exportCsv': {
      const rows = db
        .prepare(
          `SELECT p.sku, p.name, c.name AS category, p.unit_price, p.stock_qty, p.reorder_level, p.barcode
           FROM products p
           LEFT JOIN categories c ON c.id = p.category_id
           ORDER BY p.name`
        )
        .all();
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [
        '\ufeffsku,name,category,unit_price,stock_qty,reorder_level,barcode',
        ...rows.map((r) =>
          [r.sku, r.name, r.category || '', r.unit_price, r.stock_qty, r.reorder_level, r.barcode || '']
            .map(esc)
            .join(',')
        )
      ];
      return lines.join('\n');
    }
    case 'products:list':
      return db
        .prepare(
          `SELECT p.*, c.name AS category_name
           FROM products p
           LEFT JOIN categories c ON c.id = p.category_id
           ORDER BY p.name`
        )
        .all();
    case 'products:search': {
      const q = args[0];
      const term = `%${String(q || '').trim()}%`;
      const exact = String(q || '').trim();
      return db
        .prepare(
          `SELECT p.*, c.name AS category_name
           FROM products p
           LEFT JOIN categories c ON c.id = p.category_id
           WHERE p.name LIKE ? OR p.sku LIKE ? OR (p.barcode IS NOT NULL AND p.barcode = ?)
           ORDER BY (p.barcode = ?) DESC, p.name
           LIMIT 80`
        )
        .all(term, term, exact || null, exact || '');
    }
    case 'products:add': {
      const row = args[0];
      const stmt = db.prepare(
        `INSERT INTO products (sku, name, category_id, unit_price, stock_qty, barcode, reorder_level)
         VALUES (@sku, @name, @category_id, @unit_price, @stock_qty, @barcode, @reorder_level)`
      );
      const info = stmt.run({
        sku: row.sku,
        name: row.name,
        category_id: row.category_id ?? null,
        unit_price: Number(row.unit_price) || 0,
        stock_qty: Number(row.stock_qty) || 0,
        barcode: row.barcode ?? null,
        reorder_level: Number(row.reorder_level) >= 0 ? Number(row.reorder_level) : 5
      });
      return { id: info.lastInsertRowid };
    }
    case 'products:update': {
      const row = args[0];
      db.prepare(
        `UPDATE products SET
          sku = @sku,
          name = @name,
          category_id = @category_id,
          unit_price = @unit_price,
          stock_qty = @stock_qty,
          barcode = @barcode,
          reorder_level = @reorder_level
         WHERE id = @id`
      ).run({
        id: row.id,
        sku: row.sku,
        name: row.name,
        category_id: row.category_id ?? null,
        unit_price: Number(row.unit_price) || 0,
        stock_qty: Number(row.stock_qty) || 0,
        barcode: row.barcode ?? null,
        reorder_level: Number(row.reorder_level) >= 0 ? Number(row.reorder_level) : 5
      });
      return { ok: true };
    }
    case 'products:remove': {
      const id = args[0];
      try {
        db.prepare('DELETE FROM products WHERE id = ?').run(id);
        return { ok: true };
      } catch (e) {
        if (String(e.message).includes('FOREIGN KEY') || String(e.code) === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
          return { ok: false, error: 'لا يمكن الحذف: الصنف مرتبط بفواتير سابقة' };
        }
        throw e;
      }
    }
    case 'categories:list':
      return db.prepare('SELECT * FROM categories ORDER BY name').all();
    case 'categories:add': {
      const name = args[0];
      const n = String(name || '').trim();
      if (!n) return { ok: false, error: 'اسم التصنيف مطلوب' };
      try {
        const info = db.prepare('INSERT INTO categories (name) VALUES (?)').run(n);
        return { ok: true, id: info.lastInsertRowid };
      } catch (e) {
        if (String(e.message).includes('UNIQUE')) return { ok: false, error: 'التصنيف موجود مسبقاً' };
        throw e;
      }
    }
    case 'categories:update': {
      const row = args[0];
      const n = String(row.name || '').trim();
      if (!n) return { ok: false, error: 'اسم التصنيف مطلوب' };
      try {
        db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(n, row.id);
        return { ok: true };
      } catch (e) {
        if (String(e.message).includes('UNIQUE')) return { ok: false, error: 'اسم مكرر' };
        throw e;
      }
    }
    case 'categories:remove': {
      const id = args[0];
      const used = db.prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ?').get(id).n;
      if (used > 0) return { ok: false, error: 'لا يمكن الحذف: يوجد منتجات مرتبطة بهذا التصنيف' };
      db.prepare('DELETE FROM categories WHERE id = ?').run(id);
      return { ok: true };
    }
    case 'sales:create': {
      const payload = args[0];
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (items.length === 0) return { ok: false, error: 'السلة فارغة' };
      const payment_method = payload.payment_method || 'نقدي';
      const notes = payload.notes ? String(payload.notes) : null;
      const received_amount = payload.received_amount ? Number(payload.received_amount) : null;
      const change_amount = payload.change_amount ? Number(payload.change_amount) : null;

      const getProduct = db.prepare('SELECT id, unit_price, stock_qty, name FROM products WHERE id = ?');
      const qtyByProduct = new Map();
      for (const it of items) {
        const pid = Number(it.product_id);
        const qty = Number(it.qty);
        if (!pid || !(qty > 0)) continue;
        qtyByProduct.set(pid, (qtyByProduct.get(pid) || 0) + qty);
      }
      let total = 0;
      const normalized = [];
      for (const [pid, qty] of qtyByProduct) {
        const p = getProduct.get(pid);
        if (!p) return { ok: false, error: 'منتج غير موجود' };
        if (p.stock_qty < qty) return { ok: false, error: `كمية غير كافية: ${p.name}` };
        const line = qty * p.unit_price;
        total += line;
        normalized.push({ product_id: pid, qty, unit_price: p.unit_price, line_total: line });
      }
      if (normalized.length === 0) return { ok: false, error: 'بيانات غير صالحة' };

      // Validate cash payment
      if (payment_method === 'نقدي' && received_amount !== null && received_amount < total) {
        return { ok: false, error: 'المبلغ المستلم أقل من الإجمالي' };
      }

      const insertSale = db.prepare(
        'INSERT INTO sales (total, payment_method, notes) VALUES (?, ?, ?)'
      );
      const insertItem = db.prepare(
        `INSERT INTO sale_items (sale_id, product_id, qty, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?)`
      );
      const decStock = db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?');
      const run = db.transaction(() => {
        const { lastInsertRowid: saleId } = insertSale.run(total, payment_method, notes);
        for (const row of normalized) {
          insertItem.run(saleId, row.product_id, row.qty, row.unit_price, row.line_total);
          decStock.run(row.qty, row.product_id);
        }
        return saleId;
      });
      const saleId = run();
      return {
        ok: true,
        saleId,
        total,
        received_amount,
        change_amount
      };
    }
    case 'sales:list': {
      const limit = args[0] ?? 100;
      const lim = Math.min(500, Math.max(1, Number(limit) || 100));
      return db
        .prepare(
          `SELECT id, sold_at, total, payment_method, notes
           FROM sales
           ORDER BY sold_at DESC
           LIMIT ?`
        )
        .all(lim);
    }
    case 'sales:items': {
      const saleId = args[0];
      return db
        .prepare(
          `SELECT si.*, p.name AS product_name, p.sku
           FROM sale_items si
           JOIN products p ON p.id = si.product_id
           WHERE si.sale_id = ?
           ORDER BY si.id`
        )
        .all(saleId);
    }
    case 'sales:remove': {
      const id = args[0];
      db.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(id);
      db.prepare('DELETE FROM sales WHERE id = ?').run(id);
      return { ok: true };
    }
    case 'suppliers:list':
      return db.prepare('SELECT * FROM suppliers ORDER BY name').all();
    case 'suppliers:add': {
      const row = args[0];
      const stmt = db.prepare(
        'INSERT INTO suppliers (name, contact, address) VALUES (?, ?, ?)'
      );
      const info = stmt.run(row.name, row.contact || null, row.address || null);
      return { id: info.lastInsertRowid };
    }
    case 'suppliers:update': {
      const row = args[0];
      db.prepare(
        'UPDATE suppliers SET name = ?, contact = ?, address = ? WHERE id = ?'
      ).run(row.name, row.contact || null, row.address || null, row.id);
      return { ok: true };
    }
    case 'suppliers:remove': {
      const id = args[0];
      const used = db.prepare('SELECT COUNT(*) AS n FROM purchases WHERE supplier_id = ?').get(id).n;
      if (used > 0) return { ok: false, error: 'لا يمكن الحذف: يوجد مشتريات مرتبطة بهذا المورد' };
      db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
      return { ok: true };
    }
    case 'purchases:create': {
      const payload = args[0];
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (items.length === 0) return { ok: false, error: 'السلة فارغة' };
      const supplier_id = payload.supplier_id ? Number(payload.supplier_id) : null;
      const notes = payload.notes ? String(payload.notes) : null;
      const getProduct = db.prepare('SELECT id, name FROM products WHERE id = ?');
      const qtyByProduct = new Map();
      for (const it of items) {
        const pid = Number(it.product_id);
        const qty = Number(it.qty);
        const cost = Number(it.unit_cost);
        if (!pid || !(qty > 0) || !(cost >= 0)) continue;
        qtyByProduct.set(pid, { qty: (qtyByProduct.get(pid)?.qty || 0) + qty, cost });
      }
      let total = 0;
      const normalized = [];
      for (const [pid, { qty, cost }] of qtyByProduct) {
        const p = getProduct.get(pid);
        if (!p) return { ok: false, error: 'منتج غير موجود' };
        const line = qty * cost;
        total += line;
        normalized.push({ product_id: pid, qty, unit_cost: cost, line_total: line });
      }
      if (normalized.length === 0) return { ok: false, error: 'بيانات غير صالحة' };
      const insertPurchase = db.prepare(
        'INSERT INTO purchases (supplier_id, total, notes) VALUES (?, ?, ?)'
      );
      const insertItem = db.prepare(
        `INSERT INTO purchase_items (purchase_id, product_id, qty, unit_cost, line_total)
         VALUES (?, ?, ?, ?, ?)`
      );
      const incStock = db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?');
      const run = db.transaction(() => {
        const { lastInsertRowid: purchaseId } = insertPurchase.run(supplier_id, total, notes);
        for (const row of normalized) {
          insertItem.run(purchaseId, row.product_id, row.qty, row.unit_cost, row.line_total);
          incStock.run(row.qty, row.product_id);
        }
        return purchaseId;
      });
      const purchaseId = run();
      return { ok: true, purchaseId, total };
    }
    case 'purchases:list': {
      const limit = args[0] ?? 100;
      const lim = Math.min(500, Math.max(1, Number(limit) || 100));
      return db
        .prepare(
          `SELECT p.id, p.purchased_at, p.total, p.notes, s.name AS supplier_name
           FROM purchases p
           LEFT JOIN suppliers s ON s.id = p.supplier_id
           ORDER BY p.purchased_at DESC
           LIMIT ?`
        )
        .all(lim);
    }
    case 'purchases:items': {
      const purchaseId = args[0];
      return db
        .prepare(
          `SELECT pi.*, pr.name AS product_name, pr.sku
           FROM purchase_items pi
           JOIN products pr ON pr.id = pi.product_id
           WHERE pi.purchase_id = ?
           ORDER BY pi.id`
        )
        .all(purchaseId);
    }
    case 'purchases:detail': {
      const purchaseId = args[0];
      return db
        .prepare(
          `SELECT p.*, s.name AS supplier_name
           FROM purchases p
           LEFT JOIN suppliers s ON s.id = p.supplier_id
           WHERE p.id = ?`
        )
        .get(purchaseId);
    }
    case 'purchases:remove': {
      const id = args[0];
      db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(id);
      db.prepare('DELETE FROM purchases WHERE id = ?').run(id);
      return { ok: true };
    }
    case 'reports:purchasesInRange': {
      const from = args[0];
      const to = args[1];
      const f = String(from || '').slice(0, 10);
      const t = String(to || '').slice(0, 10);
      if (!f || !t) return [];
      return db
        .prepare(
          `SELECT p.id, p.purchased_at, p.total, p.notes, s.name AS supplier_name
           FROM purchases p
           LEFT JOIN suppliers s ON s.id = p.supplier_id
           WHERE date(p.purchased_at, 'localtime') BETWEEN ? AND ?
           ORDER BY p.purchased_at DESC`
        )
        .all(f, t);
    }
    case 'reports:purchasesCsv': {
      const from = args[0];
      const to = args[1];
      const f = String(from || '').slice(0, 10);
      const t = String(to || '').slice(0, 10);
      const rows = db
        .prepare(
          `SELECT p.id, p.purchased_at, p.total, p.notes, s.name AS supplier_name
           FROM purchases p
           LEFT JOIN suppliers s ON s.id = p.supplier_id
           WHERE date(p.purchased_at, 'localtime') BETWEEN ? AND ?
           ORDER BY p.purchased_at DESC`
        )
        .all(f, t);
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [
        '\ufeffid,purchased_at,total,supplier_name,notes',
        ...rows.map((r) =>
          [r.id, r.purchased_at, r.total, r.supplier_name || '', r.notes || ''].map(esc).join(',')
        )
      ];
      return lines.join('\n');
    }
    case 'credit:list': {
      return db.prepare('SELECT * FROM credit_accounts ORDER BY created_at DESC').all();
    }
    case 'credit:add': {
      const row = args[0];
      const stmt = db.prepare(
        'INSERT INTO credit_accounts (customer_name, phone, amount_due, notes) VALUES (?, ?, ?, ?)'
      );
      const info = stmt.run(row.customer_name, row.phone || null, row.amount_due || 0, row.notes || null);
      return { ok: true, id: info.lastInsertRowid };
    }
    case 'credit:remove': {
      const id = args[0];
      db.prepare('DELETE FROM credit_accounts WHERE id = ?').run(id);
      return { ok: true };
    }
    default:
      throw new Error(`قناة غير معروفة: ${channel}`);
  }
}

const DISPATCH_CHANNELS = [
  'settings:getAll',
  'settings:patch',
  'dashboard:stats',
  'dashboard:overview',
  'reports:salesInRange',
  'reports:salesCsv',
  'products:exportCsv',
  'products:list',
  'products:search',
  'products:add',
  'products:update',
  'products:remove',
  'categories:list',
  'categories:add',
  'categories:update',
  'categories:remove',
  'sales:create',
  'sales:list',
  'sales:items',
  'sales:remove',
  'suppliers:list',
  'suppliers:add',
  'suppliers:update',
  'suppliers:remove',
  'purchases:create',
  'purchases:list',
  'purchases:items',
  'purchases:detail',
  'purchases:remove',
  'credit:list',
  'credit:add',
  'credit:remove',
  'reports:purchasesInRange',
  'reports:purchasesCsv'
];

module.exports = { runDispatch, DISPATCH_CHANNELS, getSetting };
