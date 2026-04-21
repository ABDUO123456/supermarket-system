
// ============================// تأكد أن الكود داخل دالة الـ Dispatch الرئيسية
async function handleDispatch(channel, args) {
  switch (channel) {
    
    // ======================== SALES ========================
    case 'sales:remove': {
      const id = args[0];
      const deleteItems = db.prepare('DELETE FROM sale_items WHERE sale_id = ?');
      const deleteSale = db.prepare('DELETE FROM sales WHERE id = ?');
      
      const transaction = db.transaction(() => {
        deleteItems.run(id);
        deleteSale.run(id);
      });
      transaction();
      return { ok: true };
    }

    // ======================== PURCHASES ========================
    case 'purchases:remove': {
      const id = args[0];
      const deleteItems = db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?');
      const deletePurchase = db.prepare('DELETE FROM purchases WHERE id = ?');
      
      const transaction = db.transaction(() => {
        deleteItems.run(id);
        deletePurchase.run(id);
      });
      transaction();
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
      const info = stmt.run(
        row.customer_name, 
        row.phone || null, 
        row.amount_due || 0, 
        row.notes || null
      );
      return { ok: true, id: info.lastInsertRowid };
    }
    
    case 'credit:remove': {
      const id = args[0];
      db.prepare('DELETE FROM credit_accounts WHERE id = ?').run(id);
      return { ok: true };
    }

    // تأكد من وجود default في نهاية الـ switch
    default:
      throw new Error(`Unknown channel: ${channel}`);
  }
}
// أضف هذه القنوات إلى مصفوفة DISPATCH_CHANNELS
// ============================================

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
  'credit:remove',
  'reports:purchasesInRange',
  'reports:purchasesCsv'
];
