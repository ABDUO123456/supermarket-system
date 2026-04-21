const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function getSetting(db, key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row && row.value != null && row.value !== '' ? row.value : fallback;
}

function runDispatch(getDb, channel, args = []) {
  const db = getDb();

  switch (channel) {
    // ======================== SETTINGS ========================
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

    // ======================== DASHBOARD ========================
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

    // ======================== PRODUCTS ========================
    case 'products:list': {
      const rows = db.prepare(`
        SELECT p.*, c.name AS category_name
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        ORDER BY p.name
      `).all();
      return rows;
    }
    case 'products:search': {
      const q = String(args[0] || '').toLowerCase();
      if (!q) return [];
      return db.prepare(`
        SELECT p.*, c.name AS category_name
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ? OR (p.barcode AND LOWER(p.barcode) LIKE ?)
        ORDER BY p.name
      `).all(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    case 'products:add': {
      const row = args[0];
      const stmt = db.prepare(`
        INSERT INTO products (sku, name, category_id, unit_price, stock_qty, barcode, reorder_level)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(
        row.sku, row.name, row.category_id || null,
        Number(row.unit_price) || 0, Number(row.stock_qty) || 0,
        row.barcode || null, Number(row.reorder_level) || 5
      );
      return { ok: true, id: info.lastInsertRowid };
    }
    case 'products:update': {
      const row = args[0];
      db.prepare(`
        UPDATE products
        SET name = ?, category_id = ?, unit_price = ?, stock_qty = ?, barcode = ?, reorder_level = ?
        WHERE id = ?
      `).run(
        row.name, row.category_id || null,
        Number(row.unit_price) || 0, Number(row.stock_qty) || 0,
        row.barcode || null, Number(row.reorder_level) || 5,
        row.id
      );
      return { ok: true };
    }
    case 'products:remove': {
      const id = args[0];
      db.prepare('DELETE FROM products WHERE id = ?').run(id);
      return { ok: true };
    }

    // ======================== CATEGORIES ========================
    case 'categories:list': {
      return db.prepare('SELECT * FROM categories ORDER BY name').all();
    }
    case 'categories:add': {
      const name = args[0];
      const stmt = db.prepare('INSERT INTO categories (name) VALUES (?)');
      const info = stmt.run(name);
      return { ok: true, id: info.lastInsertRowid };
    }
    case 'categories:update': {
      const row = args[0];
      db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(row.name, row.id);
      return { ok: true };
    }
    case 'categories:remove': {
      const id = args[0];
      db.prepare('DELETE FROM categories WHERE id = ?').run(id);
      return { ok: true };
    }

    // ======================== SALES ========================
    case 'sales:create': {
      const payload = args[0];
      const tx = db.transaction(() => {
        const saleInfo = db.prepare(`
          INSERT INTO sales (sold_at, total, payment_method, notes)
          VALUES (datetime('now'), ?, ?, ?)
        `).run(payload.total, payload.payment_method, payload.notes);
        
        for (const item of (payload.items || [])) {
          db.prepare(`
            INSERT INTO sale_items (sale_id, product_id, qty, unit_price, line_total)
            VALUES (?, ?, ?, ?, ?)
          `).run(saleInfo.lastInsertRowid, item.product_id, item.qty, item.unit_price, item.line_total);
          
          db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?')
            .run(item.qty, item.product_id);
        }
        return saleInfo.lastInsertRowid;
      });
      return { ok: true, id: tx() };
    }
    case 'sales:list': {
      const limit = Number(args[0]) || 120;
      return db.prepare(`
        SELECT id, sold_at, total, payment_method
        FROM sales
        ORDER BY sold_at DESC
        LIMIT ?
      `).all(limit);
    }
    case 'sales:items': {
      const saleId = args[0];
      return db.prepare(`
        SELECT si.*, p.name AS product_name, p.sku
        FROM sale_items si
        JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = ?
        ORDER BY si.id
      `).all(saleId);
    }
    case 'sales:remove': {
      const id = args[0];
      db.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(id);
      db.prepare('DELETE FROM sales WHERE id = ?').run(id);
      return { ok: true };
    }

    // ======================== SUPPLIERS ========================
    case 'suppliers:list':
      return db.prepare('SELECT * FROM suppliers ORDER BY name').all();
    case 'suppliers:add': {
      const row = args[0];
      const stmt = db.prepare(
        'INSERT INTO suppliers (name, contact, address) VALUES (?, ?, ?)'
      );
      const info = stmt.run(row.name, row.contact || null, row.address || null);
      return { ok: true, id: info.lastInsertRowid };
    }
    case 'suppliers:update': {
      const row = args[0];
      db.prepare('UPDATE suppliers SET name = ?, contact = ?, address = ? WHERE id = ?')
        .run(row.name, row.contact, row.address, row.id);
      return { ok: true };
    }
    case 'suppliers:remove': {
      const id = args[0];
      db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
      return { ok: true };
    }

    // ======================== PURCHASES ========================
    case 'purchases:create': {
      const payload = args[0];
      const tx = db.transaction(() => {
        const purInfo = db.prepare(`
          INSERT INTO purchases (supplier_id, purchased_at, total, notes)
          VALUES (?, datetime('now'), ?, ?)
        `).run(payload.supplier_id || null, payload.total, payload.notes);
        
        for (const item of (payload.items || [])) {
          db.prepare(`
            INSERT INTO purchase_items (purchase_id, product_id, qty, unit_cost, line_total)
            VALUES (?, ?, ?, ?, ?)
          `).run(purInfo.lastInsertRowid, item.product_id, item.qty, item.unit_cost, item.line_total);
          
          db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?')
            .run(item.qty, item.product_id);
        }
        return purInfo.lastInsertRowid;
      });
      return { ok: true, id: tx() };
    }
    case 'purchases:list': {
      return db.prepare(`
        SELECT p.*, s.name AS supplier_name
        FROM purchases p
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        ORDER BY p.purchased_at DESC
      `).all();
    }
    case 'purchases:items': {
      const purchaseId = args[0];
      return db.prepare(`
        SELECT pi.*, p.name AS product_name, p.sku
        FROM purchase_items pi
        JOIN products p ON p.id = pi.product_id
        WHERE pi.purchase_id = ?
        ORDER BY pi.id
      `).all(purchaseId);
    }
    case 'purchases:detail': {
      const purchaseId = args[0];
      return db.prepare(`
        SELECT p.*, s.name AS supplier_name
        FROM purchases p
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        WHERE p.id = ?
      `).get(purchaseId);
    }
    case 'purchases:remove': {
      const id = args[0];
      db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(id);
      db.prepare('DELETE FROM purchases WHERE id = ?').run(id);
      return { ok: true };
    }

    // ======================== CREDIT ACCOUNTS ========================
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

    // ======================== REPORTS ========================
    case 'reports:salesInRange': {
      const from = args[0];
      const to = args[1];
      const f = String(from || '').slice(0, 10);
      const t = String(to || '').slice(0, 10);
      return db.prepare(`
        SELECT id, sold_at, total, payment_method, notes
        FROM sales
        WHERE date(sold_at, 'localtime') BETWEEN ? AND ?
        ORDER BY sold_at DESC
      `).all(f, t);
    }
    case 'reports:salesCsv': {
      const from = args[0];
      const to = args[1];
      const f = String(from || '').slice(0, 10);
      const t = String(to || '').slice(0, 10);
      const rows = db.prepare(`
        SELECT id, sold_at, total, payment_method, notes
        FROM sales
        WHERE date(sold_at, 'localtime') BETWEEN ? AND ?
        ORDER BY sold_at DESC
      `).all(f, t);
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [
        '\ufeffid,sold_at,total,payment_method,notes',
        ...rows.map((r) =>
          [r.id, r.sold_at, r.total, r.payment_method || '', r.notes || ''].map(esc).join(',')
        )
      ];
      return lines.join('\n');
    }
    case 'reports:purchasesInRange': {
      const from = args[0];
      const to = args[1];
      const f = String(from || '').slice(0, 10);
      const t = String(to || '').slice(0, 10);
      return db.prepare(`
        SELECT p.id, p.purchased_at, p.total, p.notes, s.name AS supplier_name
        FROM purchases p
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        WHERE date(p.purchased_at, 'localtime') BETWEEN ? AND ?
        ORDER BY p.purchased_at DESC
      `).all(f, t);
    }
    case 'reports:purchasesCsv': {
      const from = args[0];
      const to = args[1];
      const f = String(from || '').slice(0, 10);
      const t = String(to || '').slice(0, 10);
      const rows = db.prepare(`
        SELECT p.id, p.purchased_at, p.total, p.notes, s.name AS supplier_name
        FROM purchases p
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        WHERE date(p.purchased_at, 'localtime') BETWEEN ? AND ?
        ORDER BY p.purchased_at DESC
      `).all(f, t);
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [
        '\ufeffid,purchased_at,total,supplier_name,notes',
        ...rows.map((r) =>
          [r.id, r.purchased_at, r.total, r.supplier_name || '', r.notes || ''].map(esc).join(',')
        )
      ];
      return lines.join('\n');
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
  'reports:purchasesInRange',
  'reports:purchasesCsv',
  'products:list',
  'products:search',
  'products:add',
  'products:update',
  'products:remove',
  'products:exportCsv',
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
  'credit:remove'
];

module.exports = { runDispatch, DISPATCH_CHANNELS, getSetting };
