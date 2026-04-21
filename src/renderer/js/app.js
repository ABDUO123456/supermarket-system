(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.api;

  const state = {
    page: 'dashboard',
    productsCache: [],
    cart: [],
    posSearchTimer: null,
    invFilterTimer: null,
    editingCategoryId: null,
    invLowOnly: false,
    posResults: [],
    settings: {
      store_name: 'سوبر ماركت',
      currency: 'دج',
      theme: 'dark',
      low_stock_threshold: '10'
    },
    loadingDepth: 0
  };

  function currencyLabel() {
    return state.settings.currency || 'دج';
  }

  function formatMoney(n) {
    const v = Number(n) || 0;
    return `${v.toLocaleString('ar-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyLabel()}`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(message, isError) {
    const el = $('toast');
    el.textContent = message;
    el.hidden = false;
    el.classList.toggle('is-error', !!isError);
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.hidden = true;
    }, 3200);
  }

  async function withLoading(fn) {
    state.loadingDepth++;
    $('app-loading').hidden = false;
    try {
      return await fn();
    } finally {
      state.loadingDepth--;
      if (state.loadingDepth <= 0) {
        state.loadingDepth = 0;
        $('app-loading').hidden = true;
      }
    }
  }

  async function safeInvoke(fn, errPrefix) {
    try {
      return await fn();
    } catch (e) {
      toast(`${errPrefix}: ${e.message || e}`, true);
      throw e;
    }
  }

  async function loadSettings() {
    const rows = await safeInvoke(() => api.settings.getAll(), 'تعذر قراءة الإعدادات');
    state.settings = { ...state.settings, ...rows };
    applyTheme();
    applyBranding();
    fillSettingsForm();
  }

  function applyTheme() {
    const t = state.settings.theme === 'light' ? 'light' : 'dark';
    document.body.dataset.theme = t;
  }

  function applyBranding() {
    const name = state.settings.store_name || 'سوبر ماركت';
    $('brand-store-name').textContent = name;
    document.title = `${name} — إدارة`;
  }

  function fillSettingsForm() {
    if (!$('set-store-name')) return;
    $('set-store-name').value = state.settings.store_name || '';
    $('set-currency').value = state.settings.currency || '';
    $('set-theme').value = state.settings.theme === 'light' ? 'light' : 'dark';
    $('set-low-threshold').value = state.settings.low_stock_threshold || '10';
  }

  function lowThreshold() {
    return Number(state.settings.low_stock_threshold) || 10;
  }

  function setPage(name) {
    state.page = name;
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-page') === name);
    });
    document.querySelectorAll('.page').forEach((sec) => {
      sec.classList.toggle('is-visible', sec.id === `page-${name}`);
    });
    const sec = document.getElementById(`page-${name}`);
    const title = sec ? sec.getAttribute('data-title') || '' : '';
    $('page-title').textContent = title;
    if (name === 'dashboard') refreshDashboard();
    if (name === 'inventory') refreshInventory();
    if (name === 'categories') refreshCategories();
    if (name === 'suppliers') refreshSuppliers();
    if (name === 'credit') refreshCredit();
    if (name === 'purchases') refreshPurchases();
    if (name === 'sales') refreshSales();
    if (name === 'reports') initReportDates();
    if (name === 'pos') {
      $('pos-search').focus();
      renderPosCart();
    }
  }

  function initReportDates() {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    if (!$('rep-from').value) $('rep-from').value = from.toISOString().slice(0, 10);
    if (!$('rep-to').value) $('rep-to').value = to.toISOString().slice(0, 10);
  }

  function bindNav() {
    document.getElementById('main-nav').addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-item[data-page]');
      if (!btn) return;
      setPage(btn.getAttribute('data-page'));
    });
    document.querySelectorAll('[data-go]').forEach((b) => {
      b.addEventListener('click', () => setPage(b.getAttribute('data-go')));
    });
  }

  function updateClock() {
    const now = new Date();
    const opts = { weekday: 'long', hour: '2-digit', minute: '2-digit' };
    $('clock-pill').textContent = now.toLocaleString('ar-DZ', opts);
  }

  function renderChart7(points) {
    const wrap = $('chart-wrap');
    if (!points || !points.length) {
      wrap.innerHTML = '<div class="empty-hint">لا بيانات كافية</div>';
      return;
    }
    const max = Math.max(1, ...points.map((p) => Number(p.revenue) || 0));
    wrap.innerHTML = points
      .map((p) => {
        const rev = Number(p.revenue) || 0;
        const h = Math.round((rev / max) * 100);
        const short = String(p.day).slice(5);
        return `<div class="bar-col" title="${escapeHtml(p.day)}: ${formatMoney(rev)}"><div class="bar" style="height:${h}%"></div><span class="bar-lbl">${escapeHtml(short)}</span></div>`;
      })
      .join('');
  }

  async function refreshDashboard() {
    const data = await safeInvoke(() => api.dashboard.overview(), 'تعذر تحميل لوحة التحكم');
    const s = data.stats;
    $('stat-products').textContent = String(s.productsCount);
    $('stat-low').textContent = String(s.lowStock);
    $('stat-sales-today').textContent = String(s.salesToday);
    $('stat-revenue').textContent = formatMoney(s.revenueToday);
    $('stat-low-hint').textContent = `أصناف أقل من ${s.lowStockThreshold} وحدة`;

    const rb = $('dash-recent-body');
    if (!data.recentSales.length) {
      rb.innerHTML = `<tr><td colspan="4" class="empty-hint">لا فواتير بعد</td></tr>`;
    } else {
      rb.innerHTML = data.recentSales
        .map(
          (r) => `<tr>
          <td>${r.id}</td>
          <td>${escapeHtml(r.sold_at)}</td>
          <td>${formatMoney(r.total)}</td>
          <td><button type="button" class="link-btn" data-dash-sale="${r.id}">عرض</button></td>
        </tr>`
        )
        .join('');
      rb.querySelectorAll('[data-dash-sale]').forEach((b) =>
        b.addEventListener('click', () => openSaleDetailModal(Number(b.getAttribute('data-dash-sale'))))
      );
    }

    const tb = $('dash-top-body');
    if (!data.topProducts.length) {
      tb.innerHTML = `<tr><td colspan="3" class="empty-hint">لا مبيعات بعد</td></tr>`;
    } else {
      tb.innerHTML = data.topProducts
        .map(
          (p) => `<tr>
          <td>${escapeHtml(p.name)}</td>
          <td>${Number(p.units).toLocaleString('ar-DZ')}</td>
          <td>${formatMoney(p.revenue)}</td>
        </tr>`
        )
        .join('');
    }

    renderChart7(data.chart7);
  }

  async function openSaleDetailModal(id) {
    const rows = await safeInvoke(() => api.sales.list(200), 'تعذر التحميل');
    const sale = rows.find((r) => r.id === id);
    if (!sale) return;
    const items = await safeInvoke(() => api.sales.items(id), 'تعذر تحميل البنود');
    const rowsHtml = items
      .map(
        (it) => `<tr>
        <td>${escapeHtml(it.product_name)}</td>
        <td>${escapeHtml(it.sku)}</td>
        <td>${Number(it.qty).toLocaleString('ar-DZ')}</td>
        <td>${formatMoney(it.unit_price)}</td>
        <td>${formatMoney(it.line_total)}</td>
      </tr>`
      )
      .join('');
    openModal(
      `فاتورة #${id}`,
      `<p class="muted" style="margin-top:0">${escapeHtml(sale.sold_at)} — ${escapeHtml(sale.payment_method || '')}</p>
      ${sale.notes ? `<p>ملاحظات: ${escapeHtml(sale.notes)}</p>` : ''}
      <div class="table-wrap" style="max-height:360px">
        <table class="table table-dense">
          <thead><tr><th>الصنف</th><th>SKU</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <p style="text-align:left;margin-bottom:0"><strong>الإجمالي:</strong> ${formatMoney(sale.total)}</p>`,
      id
    );
  }

  function findCartLine(pid) {
    return state.cart.find((l) => l.product_id === pid);
  }

  function addToCart(product) {
    const existing = findCartLine(product.id);
    const max = Number(product.stock_qty) || 0;
    if (max <= 0) {
      toast('لا يوجد مخزون لهذا الصنف', true);
      return;
    }
    if (existing) {
      if (existing.qty + 1 > max) {
        toast('الكمية المتاحة غير كافية', true);
        return;
      }
      existing.qty += 1;
    } else {
      state.cart.push({
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        unit_price: Number(product.unit_price) || 0,
        qty: 1,
        stock_qty: max
      });
    }
    renderPosCart();
  }

  function addFirstSearchResult() {
    const p = state.posResults[0];
    if (p) addToCart(p);
    else toast('لا توجد نتيجة للإضافة', true);
  }

  function setLineQty(pid, qty) {
    const line = findCartLine(pid);
    if (!line) return;
    const q = Math.max(1, Math.min(Number(qty) || 1, line.stock_qty));
    line.qty = q;
    renderPosCart();
  }

  function bumpQty(pid, delta) {
    const line = findCartLine(pid);
    if (!line) return;
    setLineQty(pid, line.qty + delta);
  }

  function removeLine(pid) {
    state.cart = state.cart.filter((l) => l.product_id !== pid);
    renderPosCart();
  }

  function cartTotal() {
    return state.cart.reduce((sum, l) => sum + l.qty * l.unit_price, 0);
  }

  function renderPosCart() {
    const tbody = $('pos-cart-body');
    if (state.cart.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-hint">أضف أصنافاً من البحث</td></tr>`;
    } else {
      tbody.innerHTML = state.cart
        .map(
          (l) => `
        <tr>
          <td>
            <div class="chip-title">${escapeHtml(l.name)}</div>
            <div class="chip-meta">${escapeHtml(l.sku)}</div>
          </td>
          <td>${formatMoney(l.unit_price)}</td>
          <td>
            <span class="qty-control">
              <button type="button" data-dec="${l.product_id}">−</button>
              <input type="number" min="1" max="${l.stock_qty}" step="1" value="${l.qty}" data-qty="${l.product_id}" />
              <button type="button" data-inc="${l.product_id}">+</button>
            </span>
          </td>
          <td>${formatMoney(l.qty * l.unit_price)}</td>
          <td><button type="button" class="link-btn danger" data-rm="${l.product_id}">إزالة</button></td>
        </tr>`
        )
        .join('');
      tbody.querySelectorAll('[data-inc]').forEach((b) =>
        b.addEventListener('click', () => bumpQty(Number(b.getAttribute('data-inc')), 1))
      );
      tbody.querySelectorAll('[data-dec]').forEach((b) =>
        b.addEventListener('click', () => bumpQty(Number(b.getAttribute('data-dec')), -1))
      );
      tbody.querySelectorAll('[data-qty]').forEach((inp) => {
        inp.addEventListener('change', () =>
          setLineQty(Number(inp.getAttribute('data-qty')), inp.value)
        );
      });
      tbody.querySelectorAll('[data-rm]').forEach((b) =>
        b.addEventListener('click', () => removeLine(Number(b.getAttribute('data-rm'))))
      );
    }
    $('pos-total').textContent = formatMoney(cartTotal());
  }

  async function runPosSearch() {
    const q = $('pos-search').value.trim();
    const box = $('pos-results');
    if (!q) {
      state.posResults = [];
      box.innerHTML = '';
      return;
    }
    const rows = await safeInvoke(() => api.products.search(q), 'فشل البحث');
    state.posResults = rows;
    if (!rows.length) {
      box.innerHTML = `<div class="empty-hint">لا توجد نتائج</div>`;
      return;
    }
    box.innerHTML = rows
      .map(
        (p) => `
      <button type="button" class="chip" data-add="${p.id}">
        <div>
          <div class="chip-title">${escapeHtml(p.name)}</div>
          <div class="chip-meta">${escapeHtml(p.sku)} · مخزون ${Number(p.stock_qty).toLocaleString('ar-DZ')}</div>
        </div>
        <div class="chip-price">${formatMoney(p.unit_price)}</div>
      </button>`
      )
      .join('');
    box.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-add'));
        const p = rows.find((r) => r.id === id);
        if (p) addToCart(p);
      });
    });
  }

  function bindPos() {
    const search = $('pos-search');
    search.addEventListener('input', () => {
      clearTimeout(state.posSearchTimer);
      state.posSearchTimer = setTimeout(runPosSearch, 200);
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (state.page === 'pos') addFirstSearchResult();
      }
    });

    $('pos-payment').addEventListener('change', () => {
      const paymentMethod = $('pos-payment').value;
      const paymentDetails = $('payment-details');
      if (paymentMethod === 'نقدي') {
        paymentDetails.style.display = 'block';
      } else {
        paymentDetails.style.display = 'none';
        $('pos-received').value = '';
        $('pos-change').textContent = '0.00';
      }
    });

    $('pos-received').addEventListener('input', () => {
      const received = Number($('pos-received').value) || 0;
      const total = cartTotal();
      const change = Math.max(0, received - total);
      $('pos-change').textContent = formatMoney(change);
    });

    $('pos-barcode').addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const barcode = $('pos-barcode').value.trim();
        if (!barcode) return;
        try {
          const result = await api.scanBarcode(barcode);
          if (result.ok && result.result) {
            addToCart(result.result);
            toast('تم إضافة المنتج من الباركود');
          } else {
            toast('لم يتم العثور على منتج بهذا الباركود', true);
          }
        } catch (error) {
          toast('خطأ في مسح الباركود', true);
        }
        $('pos-barcode').value = '';
      }
    });

    $('pos-clear').addEventListener('click', () => {
      state.cart = [];
      renderPosCart();
      $('pos-received').value = '';
      $('pos-change').textContent = '0.00';
      $('pos-barcode').value = '';
    });

    $('pos-checkout').addEventListener('click', async () => {
      if (!state.cart.length) {
        toast('السلة فارغة', true);
        return;
      }

      const paymentMethod = $('pos-payment').value;
      const received = Number($('pos-received').value) || 0;
      const total = cartTotal();

      if (paymentMethod === 'نقدي' && received < total) {
        toast('المبلغ المستلم أقل من الإجمالي', true);
        return;
      }

      const payload = {
        payment_method: paymentMethod,
        received_amount: paymentMethod === 'نقدي' ? received : null,
        change_amount: paymentMethod === 'نقدي' ? Math.max(0, received - total) : null,
        notes: $('pos-notes').value.trim() || null,
        items: state.cart.map((l) => ({ product_id: l.product_id, qty: l.qty }))
      };

      const res = await api.sales.create(payload);
      if (!res.ok) {
        toast(res.error || 'فشل البيع', true);
        return;
      }

      const changeText = paymentMethod === 'نقدي' && res.change_amount > 0
        ? `<p><strong>الباقي:</strong> ${formatMoney(res.change_amount)}</p>`
        : '';

      toast(`تمت الفاتورة — ${formatMoney(res.total)}`);
      const saleId = res.saleId;
      state.cart = [];
      $('pos-notes').value = '';
      $('pos-received').value = '';
      $('pos-change').textContent = '0.00';
      $('pos-barcode').value = '';
      renderPosCart();
      search.value = '';
      $('pos-results').innerHTML = '';
      state.posResults = [];

      openModal(
        'تم إتمام البيع',
        `<p class="muted">يمكنك طباعة نسخة للعميل.</p>
         <p><strong>الإجمالي:</strong> ${formatMoney(res.total)}</p>
         ${changeText}`,
        saleId
      );

      if (state.page === 'dashboard') refreshDashboard();
    });
  }

  function stockBadge(qty) {
    const n = Number(qty) || 0;
    const thr = lowThreshold();
    if (n < thr) return `<span class="badge badge-low">منخفض</span>`;
    return `<span class="badge badge-ok">متوفر</span>`;
  }

  function renderProductsTable(rows) {
    const tbody = $('products-body');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-hint">لا توجد منتجات</td></tr>`;
      return;
    }
    tbody.innerHTML = rows
      .map(
        (p) => `
      <tr>
        <td>${escapeHtml(p.sku)}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.category_name || '—')}</td>
        <td>${formatMoney(p.unit_price)}</td>
        <td>${Number(p.stock_qty).toLocaleString('ar-DZ')} ${stockBadge(p.stock_qty)}</td>
        <td>
          <button type="button" class="link-btn" data-edit="${p.id}">تعديل</button>
          <button type="button" class="link-btn danger" data-del="${p.id}">حذف</button>
        </td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-edit'));
        const pr = rows.find((r) => r.id === id);
        if (!pr) return;
        $('product-id').value = pr.id;
        $('sku').value = pr.sku;
        $('name').value = pr.name;
        $('category_id').value = pr.category_id || '';
        $('unit_price').value = pr.unit_price;
        $('stock_qty').value = pr.stock_qty;
        $('reorder_level').value = pr.reorder_level != null ? pr.reorder_level : 5;
        $('barcode').value = pr.barcode || '';
        $('inv-form-title').textContent = 'تعديل منتج';
        $('sku').focus();
      });
    });
    tbody.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-del'));
        if (!confirm('حذف هذا المنتج؟')) return;
        const res = await api.products.remove(id);
        if (res && res.ok === false) {
          toast(res.error || 'تعذر الحذف', true);
          return;
        }
        toast('تم الحذف');
        await refreshInventory();
      });
    });
  }

  function applyInventoryFilter() {
    const q = $('inv-filter').value.trim().toLowerCase();
    const thr = lowThreshold();
    let rows = state.productsCache;
    if (state.invLowOnly) {
      rows = rows.filter((p) => Number(p.stock_qty) < thr);
    }
    if (q) {
      rows = rows.filter(
        (p) =>
          String(p.name).toLowerCase().includes(q) ||
          String(p.sku).toLowerCase().includes(q) ||
          (p.barcode && String(p.barcode).toLowerCase().includes(q))
      );
    }
    renderProductsTable(rows);
  }

  async function refreshInventory() {
    const [products, cats] = await Promise.all([
      safeInvoke(() => api.products.list(), 'تعذر تحميل المنتجات'),
      safeInvoke(() => api.categories.list(), 'تعذر تحميل التصنيفات')
    ]);
    state.productsCache = products;
    const sel = $('category_id');
    sel.innerHTML = cats.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    applyInventoryFilter();
  }

  async function exportProductsCsv() {
    await withLoading(async () => {
      const csv = await safeInvoke(() => api.export.productsCsv(), 'تعذر بناء الملف');
      const res = await api.export.saveText({ defaultName: 'products.csv', content: csv });
      if (res.canceled) return;
      if (res.ok) toast('تم حفظ الملف');
    });
  }

  function bindInventory() {
    const form = $('product-form');
    $('reset-form').addEventListener('click', () => {
      form.reset();
      $('product-id').value = '';
      $('reorder_level').value = '5';
      $('inv-form-title').textContent = 'منتج جديد';
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = $('product-id').value;
      const row = {
        sku: $('sku').value.trim(),
        name: $('name').value.trim(),
        category_id: $('category_id').value ? Number($('category_id').value) : null,
        unit_price: $('unit_price').value,
        stock_qty: $('stock_qty').value,
        barcode: $('barcode').value.trim() || null,
        reorder_level: $('reorder_level').value
      };
      try {
        if (id) {
          await api.products.update({ id: Number(id), ...row });
          toast('تم تحديث المنتج');
        } else {
          await api.products.add(row);
          toast('تمت إضافة المنتج');
        }
        form.reset();
        $('product-id').value = '';
        $('reorder_level').value = '5';
        $('inv-form-title').textContent = 'منتج جديد';
        await refreshInventory();
      } catch (err) {
        toast(err.message || 'تعذر الحفظ — تحقق من عدم تكرار SKU', true);
      }
    });
    $('inv-filter').addEventListener('input', () => {
      clearTimeout(state.invFilterTimer);
      state.invFilterTimer = setTimeout(applyInventoryFilter, 120);
    });
    $('inv-refresh').addEventListener('click', () => refreshInventory());
    $('inv-export').addEventListener('click', () => exportProductsCsv());
    $('inv-low-only').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      state.invLowOnly = !state.invLowOnly;
      btn.classList.toggle('is-on', state.invLowOnly);
      applyInventoryFilter();
    });
  }

  async function refreshCategories() {
    const rows = await safeInvoke(() => api.categories.list(), 'تعذر تحميل التصنيفات');
    const tbody = $('categories-body');
    tbody.innerHTML = rows
      .map((c) => {
        if (state.editingCategoryId === c.id) {
          return `<tr data-id="${c.id}">
            <td>${c.id}</td>
            <td><input class="input" type="text" value="${escapeHtml(c.name)}" id="cat-edit-${c.id}" /></td>
            <td>
              <button type="button" class="btn btn-sm btn-primary" data-save-cat="${c.id}">حفظ</button>
              <button type="button" class="btn btn-sm btn-ghost" data-cancel-cat>إلغاء</button>
            </td>
          </tr>`;
        }
        return `<tr data-id="${c.id}">
          <td>${c.id}</td>
          <td>${escapeHtml(c.name)}</td>
          <td>
            <button type="button" class="link-btn" data-edit-cat="${c.id}">تعديل</button>
            <button type="button" class="link-btn danger" data-del-cat="${c.id}">حذف</button>
          </td>
        </tr>`;
      })
      .join('');

    tbody.querySelectorAll('[data-edit-cat]').forEach((b) => {
      b.addEventListener('click', () => {
        state.editingCategoryId = Number(b.getAttribute('data-edit-cat'));
        refreshCategories();
      });
    });
    tbody.querySelectorAll('[data-cancel-cat]').forEach((b) => {
      b.addEventListener('click', () => {
        state.editingCategoryId = null;
        refreshCategories();
      });
    });
    tbody.querySelectorAll('[data-save-cat]').forEach((b) => {
      b.addEventListener('click', async () => {
        const cid = Number(b.getAttribute('data-save-cat'));
        const inp = $(`cat-edit-${cid}`);
        const res = await api.categories.update({ id: cid, name: inp.value });
        if (!res.ok) {
          toast(res.error || 'فشل التحديث', true);
          return;
        }
        state.editingCategoryId = null;
        toast('تم تحديث التصنيف');
        await refreshCategories();
        if (state.page === 'inventory') await refreshInventory();
      });
    });
    tbody.querySelectorAll('[data-del-cat]').forEach((b) => {
      b.addEventListener('click', async () => {
        const cid = Number(b.getAttribute('data-del-cat'));
        if (!confirm('حذف هذا التصنيف؟')) return;
        const res = await api.categories.remove(cid);
        if (!res.ok) {
          toast(res.error || 'تعذر الحذف', true);
          return;
        }
        toast('تم الحذف');
        await refreshCategories();
        if (state.page === 'inventory') await refreshInventory();
      });
    });
  }

  function bindCategories() {
    $('cat-add-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('cat-new-name').value;
      const res = await api.categories.add(name);
      if (!res.ok) {
        toast(res.error || 'فشل الإضافة', true);
        return;
      }
      $('cat-new-name').value = '';
      toast('تمت إضافة التصنيف');
      await refreshCategories();
      if (state.page === 'inventory') await refreshInventory();
    });
  }

  async function refreshSuppliers() {
    const rows = await safeInvoke(() => api.suppliers.list(), 'تعذر تحميل الموردين');
    const tbody = $('suppliers-body');
    tbody.innerHTML = rows
      .map((s) => {
        return `<tr data-id="${s.id}">
          <td>${s.id}</td>
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.contact || '')}</td>
          <td>${escapeHtml(s.address || '')}</td>
          <td>
            <button type="button" class="link-btn" data-edit-sup="${s.id}">تعديل</button>
            <button type="button" class="link-btn danger" data-del-sup="${s.id}">حذف</button>
          </td>
        </tr>`;
      })
      .join('');

    tbody.querySelectorAll('[data-edit-sup]').forEach((b) => {
      b.addEventListener('click', () => {
        const sid = Number(b.getAttribute('data-edit-sup'));
        openSupplierModal(sid);
      });
    });
    tbody.querySelectorAll('[data-del-sup]').forEach((b) => {
      b.addEventListener('click', async () => {
        const sid = Number(b.getAttribute('data-del-sup'));
        if (!confirm('حذف هذا المورد؟')) return;
        const res = await api.suppliers.remove(sid);
        if (!res.ok) {
          toast(res.error || 'تعذر الحذف', true);
          return;
        }
        toast('تم الحذف');
        await refreshSuppliers();
      });
    });
  }

  function bindSuppliers() {
    $('sup-add-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('sup-new-name').value;
      const contact = $('sup-new-contact').value;
      const address = $('sup-new-address').value;
      const res = await api.suppliers.add({ name, contact, address });
      if (!res.ok) {
        toast(res.error || 'فشل الإضافة', true);
        return;
      }
      $('sup-new-name').value = '';
      $('sup-new-contact').value = '';
      $('sup-new-address').value = '';
      toast('تمت إضافة المورد');
      await refreshSuppliers();
    });
    $('sup-reset-form').addEventListener('click', () => {
      $('sup-new-name').value = '';
      $('sup-new-contact').value = '';
      $('sup-new-address').value = '';
    });
  }

  function openSupplierModal(sid) {
    const html = `
      <form id="sup-edit-form" class="card pad">
        <h2 class="card-title">تعديل المورد</h2>
        <label class="field">
          <span class="field-label">الاسم</span>
          <input id="sup-edit-name" class="input" required />
        </label>
        <label class="field">
          <span class="field-label">الاتصال</span>
          <input id="sup-edit-contact" class="input" />
        </label>
        <label class="field">
          <span class="field-label">العنوان</span>
          <input id="sup-edit-address" class="input" />
        </label>
        <div class="field-row">
          <button type="submit" class="btn btn-primary">حفظ</button>
          <button type="button" class="btn btn-ghost" data-close-modal>إلغاء</button>
        </div>
      </form>
    `;
    openModal('تعديل المورد', html);
    api.suppliers.list().then((rows) => {
      const sup = rows.find((s) => s.id === sid);
      if (sup) {
        $('sup-edit-name').value = sup.name;
        $('sup-edit-contact').value = sup.contact || '';
        $('sup-edit-address').value = sup.address || '';
      }
    });
    $('sup-edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('sup-edit-name').value;
      const contact = $('sup-edit-contact').value;
      const address = $('sup-edit-address').value;
      const res = await api.suppliers.update({ id: sid, name, contact, address });
      if (!res.ok) {
        toast(res.error || 'فشل التحديث', true);
        return;
      }
      closeModal();
      toast('تم التحديث');
      await refreshSuppliers();
    });
  }

  async function refreshPurchases() {
    const rows = await safeInvoke(() => api.purchases.list(), 'تعذر تحميل المشتريات');
    const tbody = $('pur-body');
    tbody.innerHTML = rows
      .map((p) => {
        return `<tr data-id="${p.id}">
          <td>${p.id}</td>
          <td>${escapeHtml(p.purchased_at)}</td>
          <td>${escapeHtml(p.supplier_name || 'غير محدد')}</td>
          <td>${formatMoney(p.total)}</td>
          <td>
            <button type="button" class="link-btn" data-view-pur="${p.id}">عرض</button>
            <button type="button" class="link-btn danger" data-del-pur="${p.id}">حذف</button>
          </td>
        </tr>`;
      })
      .join('');

    tbody.querySelectorAll('[data-view-pur]').forEach((b) => {
      b.addEventListener('click', () => {
        const pid = Number(b.getAttribute('data-view-pur'));
        openPurchaseDetailModal(pid);
      });
    });
    tbody.querySelectorAll('[data-del-pur]').forEach((b) => {
      b.addEventListener('click', async () => {
        const pid = Number(b.getAttribute('data-del-pur'));
        if (!confirm('حذف هذه المشتريات؟')) return;
        const res = await api.purchases.remove(pid);
        if (!res.ok) {
          toast(res.error || 'تعذر الحذف', true);
          return;
        }
        toast('تم الحذف');
        await refreshPurchases();
      });
    });
  }

  async function refreshCredit() {
    const rows = await safeInvoke(() => api.credit.list(), 'تعذر تحميل الحسابات الائتمانية');
    const tbody = $('credit-body');
    tbody.innerHTML = rows
      .map((c) => `
      <tr>
        <td>${c.id}</td>
        <td>${escapeHtml(c.customer_name)}</td>
        <td>${escapeHtml(c.phone || '')}</td>
        <td>${formatMoney(c.amount_due)}</td>
        <td>${escapeHtml(c.created_at)}</td>
        <td>
          <button type="button" class="link-btn danger" data-del-credit="${c.id}">حذف</button>
        </td>
      </tr>`)
      .join('');

    tbody.querySelectorAll('[data-del-credit]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = Number(b.getAttribute('data-del-credit'));
        if (!confirm('حذف هذا الحساب الائتماني؟')) return;
        const res = await api.credit.remove(id);
        if (!res.ok) {
          toast(res.error || 'تعذر الحذف', true);
          return;
        }
        toast('تم الحذف');
        await refreshCredit();
      });
    });
  }

  function bindCredit() {
    $('credit-add').addEventListener('click', () => openCreditModal());
  }

  function openCreditModal() {
    const html = `
      <div class="credit-modal">
        <form id="credit-form" class="card pad">
          <h2 class="card-title">إضافة حساب ائتماني</h2>
          <label class="field">
            <span class="field-label">اسم العميل</span>
            <input id="credit-name" class="input" required />
          </label>
          <label class="field">
            <span class="field-label">رقم الهاتف</span>
            <input id="credit-phone" class="input" />
          </label>
          <label class="field">
            <span class="field-label">المبلغ المستحق</span>
            <input id="credit-amount" type="number" class="input" min="0" step="0.01" required />
          </label>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">إضافة</button>
            <button type="button" class="btn btn-ghost" onclick="this.closest('.modal').remove()">إلغاء</button>
          </div>
        </form>
      </div>
    `;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = html;
    document.body.appendChild(modal);
    modal.addEventListener('submit', async (e) => {
      e.preventDefault();
      const customer_name = $('credit-name').value.trim();
      const phone = $('credit-phone').value.trim();
      const amount_due = parseFloat($('credit-amount').value) || 0;
      if (!customer_name) {
        toast('اسم العميل مطلوب', true);
        return;
      }
      const res = await api.credit.add({ customer_name, phone, amount_due });
      if (!res.ok) {
        toast(res.error || 'فشل الإضافة', true);
        return;
      }
      toast('تمت الإضافة');
      modal.remove();
      await refreshCredit();
    });
  }

  function bindPurchases() {
    $('pur-add').addEventListener('click', () => openPurchaseModal());
  }

  function openPurchaseModal() {
    const html = `
      <div class="purchase-modal">
        <form id="pur-form" class="card pad">
          <h2 class="card-title">إضافة مشتريات</h2>
          <div class="field-row">
            <label class="field grow">
              <span class="field-label">المورد</span>
              <select id="pur-supplier" class="input">
                <option value="">غير محدد</option>
              </select>
            </label>
          </div>
          <div class="field-row">
            <label class="field grow">
              <span class="field-label">ملاحظات</span>
              <input id="pur-notes" class="input" />
            </label>
          </div>
          <div class="field-row">
            <label class="field">
              <span class="field-label">مبلغ الدفع</span>
              <input id="pur-payment" type="number" class="input" min="0" step="0.01" placeholder="0.00" />
            </label>
            <label class="field">
              <span class="field-label">المبلغ المتبقي</span>
              <input id="pur-remaining" type="number" class="input" min="0" step="0.01" placeholder="0.00" />
            </label>
          </div>
          <div class="pur-cart">
            <h3>المنتجات</h3>
            <div class="field-row">
              <label class="field grow">
                <span class="field-label">البحث عن منتج</span>
                <input id="pur-search" class="input" placeholder="اسم المنتج..." />
              </label>
              <button type="button" class="btn btn-ghost" id="pur-add-item">إضافة</button>
              <button type="button" class="btn btn-ghost" id="pur-add-new">إضافة منتج جديد</button>
            </div>
            <div class="table-wrap pur-items-table">
              <table class="table">
                <thead>
                  <tr>
                    <th>المنتج</th>
                    <th>الكمية</th>
                    <th>سعر الشراء</th>
                    <th>الإجمالي</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody id="pur-cart-body"></tbody>
              </table>
            </div>
            <div class="pur-summary">
              <strong>الإجمالي: <span id="pur-total">0.00</span></strong>
            </div>
          </div>
          <div class="field-row">
            <button type="submit" class="btn btn-primary">حفظ المشتريات</button>
            <button type="button" class="btn btn-ghost" data-close-modal>إلغاء</button>
          </div>
        </form>
      </div>
    `;
    openModal('إضافة مشتريات', html);
    loadSuppliersForPurchase();
    bindPurchaseForm();
  }

  async function loadSuppliersForPurchase() {
    const suppliers = await api.suppliers.list();
    const sel = $('pur-supplier');
    sel.innerHTML = '<option value="">غير محدد</option>' +
      suppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  }

  function bindPurchaseForm() {
    const purState = { cart: [] };
    const updateTotal = () => {
      const total = purState.cart.reduce((sum, it) => sum + (it.qty * it.unit_cost), 0);
      $('pur-total').textContent = formatMoney(total);
    };
    const renderCart = () => {
      const tbody = $('pur-cart-body');
      tbody.innerHTML = purState.cart
        .map((it, idx) => `
          <tr>
            <td>${escapeHtml(it.name)}${it.is_new ? ` <small>(جديد - باركود: ${it.barcode})</small>` : ''}</td>
            <td><input type="number" class="input input-sm" value="${it.qty}" min="0.01" step="0.01" data-idx="${idx}" data-field="qty" /></td>
            <td><input type="number" class="input input-sm" value="${it.unit_cost}" min="0" step="0.01" data-idx="${idx}" data-field="cost" /></td>
            <td>${formatMoney(it.qty * it.unit_cost)}</td>
            <td><button type="button" class="btn btn-sm btn-ghost danger" data-remove="${idx}">×</button></td>
          </tr>
        `).join('');
      tbody.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', () => {
          const idx = Number(inp.dataset.idx);
          const field = inp.dataset.field;
          const val = Number(inp.value);
          if (field === 'qty') purState.cart[idx].qty = val;
          if (field === 'cost') purState.cart[idx].unit_cost = val;
          renderCart();
          updateTotal();
        });
      });
      tbody.querySelectorAll('[data-remove]').forEach(b => {
        b.addEventListener('click', () => {
          const idx = Number(b.dataset.remove);
          purState.cart.splice(idx, 1);
          renderCart();
          updateTotal();
        });
      });
    };

    $('pur-add-item').addEventListener('click', async () => {
      const q = $('pur-search').value.trim();
      if (!q) return;
      const products = await api.products.search(q);
      if (products.length === 0) {
        toast('لا توجد منتجات مطابقة، يمكنك إضافة منتج جديد', true);
        return;
      }
      const p = products[0];
      purState.cart.push({ product_id: p.id, name: p.name, qty: 1, unit_cost: 0 });
      $('pur-search').value = '';
      renderCart();
      updateTotal();
    });

    $('pur-add-new').addEventListener('click', async () => {
      const q = $('pur-search').value.trim();
      if (!q) {
        toast('أدخل اسم المنتج أولاً', true);
        return;
      }
      const barcode = 'P' + Date.now().toString().slice(-8);
      const newProduct = {
        sku: 'SKU-' + Date.now(),
        name: q,
        category_id: 1,
        unit_price: 0,
        stock_qty: 0,
        barcode: barcode,
        reorder_level: 5
      };
      const result = await api.products.add(newProduct);
      if (!result.id) {
        toast('فشل في إضافة المنتج الجديد', true);
        return;
      }
      purState.cart.push({
        product_id: result.id,
        name: q,
        qty: 1,
        unit_cost: 0,
        is_new: true,
        barcode: barcode
      });
      $('pur-search').value = '';
      toast(`تم إضافة منتج جديد مع الباركود: ${barcode}`);
      renderCart();
      updateTotal();
    });

    $('pur-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (purState.cart.length === 0) {
        toast('السلة فارغة', true);
        return;
      }
      const supplier_id = $('pur-supplier').value ? Number($('pur-supplier').value) : null;
      const baseNotes = $('pur-notes').value;
      const paymentAmount = Number($('pur-payment').value) || 0;
      const remainingAmount = Number($('pur-remaining').value) || 0;

      let notes = baseNotes;
      if (paymentAmount > 0 || remainingAmount > 0) {
        const paymentInfo = `مبلغ الدفع: ${formatMoney(paymentAmount)}, المبلغ المتبقي: ${formatMoney(remainingAmount)}`;
        notes = notes ? `${notes}\n${paymentInfo}` : paymentInfo;
      }

      const newProducts = purState.cart.filter(it => it.is_new);
      if (newProducts.length > 0) {
        const newProductInfo = `منتجات جديدة: ${newProducts.map(p => `${p.name} (باركود: ${p.barcode})`).join(', ')}`;
        notes = notes ? `${notes}\n${newProductInfo}` : newProductInfo;
      }

      const items = purState.cart.map(it => ({
        product_id: it.product_id,
        qty: it.qty,
        unit_cost: it.unit_cost
      }));
      const res = await api.purchases.create({ supplier_id, notes, items });
      if (!res.ok) {
        toast(res.error || 'فشل الحفظ', true);
        return;
      }
      closeModal();
      toast('تم حفظ المشتريات');
      await refreshPurchases();
      if (state.page === 'inventory') await refreshInventory();
      if (state.page === 'dashboard') await refreshDashboard();
    });
  }

  function openPurchaseDetailModal(pid) {
    Promise.all([
      api.purchases.detail(pid),
      api.purchases.items(pid)
    ]).then(([detail, items]) => {
      if (!detail) {
        toast('المشتريات غير موجودة', true);
        return;
      }
      const html = `
        <div class="card pad">
          <h2 class="card-title">تفاصيل المشتريات #${pid}</h2>
          ${detail.notes ? `<div class="field-row"><strong>ملاحظات:</strong> ${escapeHtml(detail.notes).replace(/\n/g, '<br>')}</div>` : ''}
          ${detail.supplier_name ? `<div class="field-row"><strong>المورد:</strong> ${escapeHtml(detail.supplier_name)}</div>` : ''}
          <div class="field-row"><strong>التاريخ:</strong> ${escapeHtml(detail.purchased_at)}</div>
          <div class="field-row"><strong>الإجمالي:</strong> ${formatMoney(detail.total)}</div>
          <div class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>المنتج</th>
                  <th>الكمية</th>
                  <th>سعر الشراء</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(it => `
                  <tr>
                    <td>${escapeHtml(it.product_name)} (${it.sku})</td>
                    <td>${it.qty}</td>
                    <td>${formatMoney(it.unit_cost)}</td>
                    <td>${formatMoney(it.line_total)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="field-row">
            <button type="button" class="btn btn-ghost" data-close-modal>إغلاق</button>
          </div>
        </div>
      `;
      openModal(`تفاصيل المشتريات #${pid}`, html);
    }).catch(() => {
      toast('فشل في تحميل تفاصيل المشتريات', true);
    });
  }

  function openModal(title, html, printSaleId) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = html;
    const mp = $('modal-print');
    if (printSaleId != null && printSaleId !== '') {
      mp.hidden = false;
      mp.dataset.saleId = String(printSaleId);
    } else {
      mp.hidden = true;
      delete mp.dataset.saleId;
    }
    $('modal').hidden = false;
  }

  function closeModal() {
    $('modal').hidden = true;
    const mp = $('modal-print');
    mp.hidden = true;
    delete mp.dataset.saleId;
  }

  function bindModal() {
    const modal = document.getElementById('modal');
    modal.addEventListener('click', (e) => {
      if (e.target.matches('[data-close-modal]')) closeModal();
    });
    $('modal-print').addEventListener('click', async () => {
      const id = $('modal-print').dataset.saleId;
      if (!id) return;
      const res = await api.print.receipt(Number(id));
      if (!res.ok) toast(res.error || 'فشلت الطباعة', true);
      else toast('تم إرسال الطباعة');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });
  }

  async function refreshSales() {
    const rows = await safeInvoke(() => api.sales.list(120), 'تعذر تحميل المبيعات');
    const tbody = $('sales-body');
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-hint">لا توجد فواتير بعد</td></tr>`;
      return;
    }
    tbody.innerHTML = rows
      .map(
        (s) => `
      <tr>
        <td>${s.id}</td>
        <td>${escapeHtml(s.sold_at)}</td>
        <td>${formatMoney(s.total)}</td>
        <td>${escapeHtml(s.payment_method || '')}</td>
        <td>
          <button type="button" class="link-btn" data-sale="${s.id}">التفاصيل</button>
          <button type="button" class="link-btn danger" data-del-sale="${s.id}">حذف</button>
        </td>
      </tr>`
      )
      .join('');
    tbody.querySelectorAll('[data-sale]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = Number(b.getAttribute('data-sale'));
        await openSaleDetailModal(id);
      });
    });
    tbody.querySelectorAll('[data-del-sale]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = Number(b.getAttribute('data-del-sale'));
        if (!confirm('حذف هذه الفاتورة؟')) return;
        const res = await api.sales.remove(id);
        if (!res.ok) {
          toast(res.error || 'تعذر الحذف', true);
          return;
        }
        toast('تم الحذف');
        await refreshSales();
      });
    });
  }

  function openSalesModal() {
    const html = `
      <div class="sales-modal">
        <form id="sales-form" class="card pad">
          <h2 class="card-title">إضافة مبيعات</h2>
          <div class="sales-cart">
            <h3>المنتجات</h3>
            <div class="field-row">
              <label class="field grow">
                <span class="field-label">البحث عن منتج</span>
                <input id="sales-search" class="input" placeholder="اسم المنتج أو SKU..." />
              </label>
              <button type="button" class="btn btn-ghost" id="sales-add-item">إضافة</button>
            </div>
            <div class="table-wrap sales-items-table">
              <table class="table">
                <thead>
                  <tr>
                    <th>المنتج</th>
                    <th>الكمية</th>
                    <th>السعر</th>
                    <th>الإجمالي</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody id="sales-cart-body"></tbody>
              </table>
            </div>
            <div class="sales-summary">
              <strong>الإجمالي: <span id="sales-total">0.00</span></strong>
            </div>
          </div>
          <div class="field-row">
            <label class="field">
              <span class="field-label">طريقة الدفع</span>
              <select id="sales-payment" class="input">
                <option>نقدي</option>
                <option>بطاقة</option>
                <option>تحويل</option>
              </select>
            </label>
          </div>
          <div class="payment-details" id="sales-payment-details" style="display: none;">
            <label class="field">
              <span class="field-label">المبلغ المستلم</span>
              <input type="number" id="sales-received" class="input" placeholder="0.00" min="0" step="0.01" />
            </label>
            <div class="change-display">
              <span class="change-label">الباقي:</span>
              <strong id="sales-change" class="change-amount">0.00</strong>
            </div>
          </div>
          <label class="field">
            <span class="field-label">كود الباركود (اختياري)</span>
            <input type="text" id="sales-barcode" class="input" placeholder="امسح الباركود أو اكتبه" />
          </label>
          <label class="field">
            <span class="field-label">ملاحظات (اختياري)</span>
            <input type="text" id="sales-notes" class="input" placeholder="—" />
          </label>
          <div class="field-row">
            <button type="submit" class="btn btn-primary">حفظ المبيعات</button>
            <button type="button" class="btn btn-ghost" data-close-modal>إلغاء</button>
          </div>
        </form>
      </div>
    `;
    openModal('إضافة مبيعات', html);
    bindSalesForm();
  }

  function bindSalesForm() {
    const salesState = { cart: [] };

    const updateTotal = () => {
      const total = salesState.cart.reduce((sum, it) => sum + (it.qty * it.unit_price), 0);
      $('sales-total').textContent = formatMoney(total);
    };

    const renderCart = () => {
      const tbody = $('sales-cart-body');
      tbody.innerHTML = salesState.cart
        .map((it, idx) => `
          <tr>
            <td>${escapeHtml(it.name)} (${it.sku})</td>
            <td><input type="number" class="input input-sm" value="${it.qty}" min="0.01" step="0.01" data-idx="${idx}" data-field="qty" /></td>
            <td><input type="number" class="input input-sm" value="${it.unit_price}" min="0" step="0.01" data-idx="${idx}" data-field="price" /></td>
            <td>${formatMoney(it.qty * it.unit_price)}</td>
            <td><button type="button" class="btn btn-sm btn-ghost danger" data-remove="${idx}">×</button></td>
          </tr>
        `).join('');
      tbody.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', () => {
          const idx = Number(inp.dataset.idx);
          const field = inp.dataset.field;
          const val = Number(inp.value);
          if (field === 'qty') salesState.cart[idx].qty = val;
          if (field === 'price') salesState.cart[idx].unit_price = val;
          renderCart();
          updateTotal();
        });
      });
      tbody.querySelectorAll('[data-remove]').forEach(b => {
        b.addEventListener('click', () => {
          const idx = Number(b.dataset.remove);
          salesState.cart.splice(idx, 1);
          renderCart();
          updateTotal();
        });
      });
    };

    $('sales-payment').addEventListener('change', () => {
      const paymentMethod = $('sales-payment').value;
      const paymentDetails = $('sales-payment-details');
      if (paymentMethod === 'نقدي') {
        paymentDetails.style.display = 'block';
      } else {
        paymentDetails.style.display = 'none';
        $('sales-received').value = '';
        $('sales-change').textContent = '0.00';
      }
    });

    $('sales-received').addEventListener('input', () => {
      const received = Number($('sales-received').value) || 0;
      const total = salesState.cart.reduce((sum, it) => sum + (it.qty * it.unit_price), 0);
      const change = Math.max(0, received - total);
      $('sales-change').textContent = formatMoney(change);
    });

    $('sales-barcode').addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const barcode = $('sales-barcode').value.trim();
        if (!barcode) return;
        try {
          const result = await api.scanBarcode(barcode);
          if (result.ok && result.result) {
            const existing = salesState.cart.find(item => item.product_id === result.result.id);
            if (existing) {
              existing.qty += 1;
            } else {
              salesState.cart.push({
                product_id: result.result.id,
                name: result.result.name,
                sku: result.result.sku,
                qty: 1,
                unit_price: result.result.unit_price
              });
            }
            renderCart();
            updateTotal();
            toast('تم إضافة المنتج من الباركود');
          } else {
            toast('لم يتم العثور على منتج بهذا الباركود', true);
          }
        } catch (error) {
          toast('خطأ في مسح الباركود', true);
        }
        $('sales-barcode').value = '';
      }
    });

    $('sales-add-item').addEventListener('click', async () => {
      const q = $('sales-search').value.trim();
      if (!q) return;
      const products = await api.products.search(q);
      if (products.length === 0) {
        toast('لا توجد منتجات مطابقة', true);
        return;
      }
      const p = products[0];
      const existing = salesState.cart.find(item => item.product_id === p.id);
      if (existing) {
        existing.qty += 1;
      } else {
        salesState.cart.push({
          product_id: p.id,
          name: p.name,
          sku: p.sku,
          qty: 1,
          unit_price: p.unit_price
        });
      }
      $('sales-search').value = '';
      renderCart();
      updateTotal();
    });

    $('sales-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (salesState.cart.length === 0) {
        toast('السلة فارغة', true);
        return;
      }

      const paymentMethod = $('sales-payment').value;
      const received = Number($('sales-received').value) || 0;
      const total = salesState.cart.reduce((sum, it) => sum + (it.qty * it.unit_price), 0);

      if (paymentMethod === 'نقدي' && received < total) {
        toast('المبلغ المستلم أقل من الإجمالي', true);
        return;
      }

      const items = salesState.cart.map(it => ({
        product_id: it.product_id,
        qty: it.qty
      }));

      const res = await api.sales.create({
        payment_method: paymentMethod,
        received_amount: paymentMethod === 'نقدي' ? received : null,
        change_amount: paymentMethod === 'نقدي' ? Math.max(0, received - total) : null,
        notes: $('sales-notes').value.trim() || null,
        items: items
      });

      if (!res.ok) {
        toast(res.error || 'فشل الحفظ', true);
        return;
      }

      closeModal();
      toast('تم حفظ المبيعات');
      await refreshSales();
      if (state.page === 'dashboard') await refreshDashboard();
    });
  }

  function bindSales() {
    $('sales-refresh').addEventListener('click', () => refreshSales());
    $('sales-add').addEventListener('click', () => openSalesModal());
  }

  async function runReport() {
    const type = $('rep-type').value;
    const from = $('rep-from').value;
    const to = $('rep-to').value;
    if (!from || !to) {
      toast('اختر نطاق التواريخ', true);
      return;
    }
    let rows, sum, headers, bodyHtml;
    if (type === 'purchases') {
      rows = await safeInvoke(() => api.reports.purchasesInRange(from, to), 'تعذر التحميل');
      sum = rows.reduce((a, r) => a + (Number(r.total) || 0), 0);
      $('rep-summary').textContent = `${rows.length} مشتريات · الإجمالي ${formatMoney(sum)}`;
      headers = ['#', 'التاريخ', 'المورد', 'الإجمالي', 'ملاحظات'];
      bodyHtml = rows
        .map(
          (p) => `<tr>
          <td>${p.id}</td>
          <td>${escapeHtml(p.purchased_at)}</td>
          <td>${escapeHtml(p.supplier_name || '')}</td>
          <td>${formatMoney(p.total)}</td>
          <td>${escapeHtml(p.notes || '')}</td>
        </tr>`
        )
        .join('');
    } else {
      rows = await safeInvoke(() => api.reports.salesInRange(from, to), 'تعذر التحميل');
      sum = rows.reduce((a, r) => a + (Number(r.total) || 0), 0);
      $('rep-summary').textContent = `${rows.length} فاتورة · الإجمالي ${formatMoney(sum)}`;
      headers = ['#', 'التاريخ', 'الإجمالي', 'الدفع', 'ملاحظات'];
      bodyHtml = rows
        .map(
          (s) => `<tr>
          <td>${s.id}</td>
          <td>${escapeHtml(s.sold_at)}</td>
          <td>${formatMoney(s.total)}</td>
          <td>${escapeHtml(s.payment_method || '')}</td>
          <td>${escapeHtml(s.notes || '')}</td>
        </tr>`
        )
        .join('');
    }
    const thead = $('rep-body').parentElement.querySelector('thead');
    thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    const tb = $('rep-body');
    if (!rows.length) {
      tb.innerHTML = `<tr><td colspan="${headers.length}" class="empty-hint">لا نتائج في هذا النطاق</td></tr>`;
      return;
    }
    tb.innerHTML = bodyHtml;
  }

  async function exportReportCsv() {
    const type = $('rep-type').value;
    const from = $('rep-from').value;
    const to = $('rep-to').value;
    if (!from || !to) {
      toast('اختر نطاق التواريخ', true);
      return;
    }
    await withLoading(async () => {
      let csv;
      if (type === 'purchases') {
        csv = await safeInvoke(() => api.reports.purchasesCsv(from, to), 'تعذر بناء الملف');
      } else {
        csv = await safeInvoke(() => api.reports.salesCsv(from, to), 'تعذر بناء الملف');
      }
      const res = await api.export.saveText({ defaultName: `${type}_${from}_${to}.csv`, content: csv });
      if (res.canceled) return;
      if (res.ok) toast('تم حفظ التقرير');
    });
  }

  function bindReports() {
    $('rep-apply').addEventListener('click', () => runReport());
    $('rep-export').addEventListener('click', () => exportReportCsv());
  }

  function bindSettings() {
    $('settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const patch = {
        store_name: $('set-store-name').value.trim() || 'سوبر ماركت',
        currency: $('set-currency').value.trim() || 'ر.س',
        theme: $('set-theme').value,
        low_stock_threshold: String(Math.max(0, Number($('set-low-threshold').value) || 0))
      };
      await safeInvoke(() => api.settings.patch(patch), 'تعذر الحفظ');
      await loadSettings();
      toast('تم حفظ الإعدادات');
      if (state.page === 'dashboard') refreshDashboard();
      if (state.page === 'inventory') applyInventoryFilter();
    });
  }

  async function init() {
    if (!window.api) {
      document.body.innerHTML =
        '<p style="padding:24px;font-family:Tajawal,sans-serif">تعذر تحميل واجهة البرنامج (preload).</p>';
      return;
    }
    await withLoading(async () => {
      await loadSettings();
    });
    bindNav();
    bindPos();
    bindInventory();
    bindCategories();
    bindSuppliers();
    bindCredit();
    bindPurchases();
    bindModal();
    bindSales();
    bindReports();
    bindSettings();
    updateClock();
    setInterval(updateClock, 30000);
    setPage('dashboard');
  }

  init();

})();