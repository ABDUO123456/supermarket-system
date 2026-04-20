/**
 * عند فتح الواجهة من المتصفح (هاتف/حاسوب) بدون Electron يُنشأ window.api عبر الشبكة.
 */
(function () {
  if (window.api) return;

  const base = typeof window.__API_BASE__ === 'string' ? window.__API_BASE__.replace(/\/$/, '') : '';

  async function rpc(channel, ...args) {
    const url = `${base}/api/invoke`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, args })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      throw new Error(j.error || `HTTP ${r.status}`);
    }
    return j.result;
  }

  window.api = {
    settings: {
      getAll: () => rpc('settings:getAll'),
      patch: (partial) => rpc('settings:patch', partial)
    },
    dashboard: {
      stats: () => rpc('dashboard:stats'),
      overview: () => rpc('dashboard:overview')
    },
    reports: {
      salesInRange: (from, to) => rpc('reports:salesInRange', from, to),
      salesCsv: (from, to) => rpc('reports:salesCsv', from, to)
    },
    export: {
      saveText: async ({ defaultName, content }) => {
        const res = await rpc('export:saveText', { defaultName, content });
        if (res && res.saveAsDownload) {
          const blob = new Blob([res.content], { type: 'text/csv;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = res.defaultName || defaultName || 'export.csv';
          a.rel = 'noopener';
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          return { ok: true };
        }
        return res;
      },
      productsCsv: () => rpc('products:exportCsv')
    },
    print: {
      receipt: async (saleId) => {
        const res = await rpc('print:receipt', saleId);
        if (!res || !res.ok) return res || { ok: false, error: 'تعذر الطباعة' };
        if (res.receiptHtml) {
          const w = window.open('', '_blank', 'noopener,noreferrer');
          if (w) {
            w.document.open();
            w.document.write(res.receiptHtml);
            w.document.close();
            w.addEventListener(
              'load',
              () => {
                try {
                  w.focus();
                  w.print();
                } catch (_) {}
              },
              { once: true }
            );
          }
        }
        return { ok: true };
      }
    },
    products: {
      list: () => rpc('products:list'),
      search: (q) => rpc('products:search', q),
      add: (row) => rpc('products:add', row),
      update: (row) => rpc('products:update', row),
      remove: (id) => rpc('products:remove', id)
    },
    categories: {
      list: () => rpc('categories:list'),
      add: (name) => rpc('categories:add', name),
      update: (row) => rpc('categories:update', row),
      remove: (id) => rpc('categories:remove', id)
    },
    sales: {
      create: (payload) => rpc('sales:create', payload),
      list: (limit) => rpc('sales:list', limit),
      items: (saleId) => rpc('sales:items', saleId)
    }
  };
})();
