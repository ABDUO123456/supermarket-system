// أضف هذه الدوال في ملف app.js

// ======================== CREDIT ACCOUNTS ========================
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

// ======================== تعديل setPage ========================
// ابحث عن دالة setPage وأضف هذا السطر مع باقي التحديثات:
// في دالة setPage أضف:
if (name === 'credit') refreshCredit();

// ======================== في دالة bindNav أو وظيفة البدء ========================
// أضف:
bindCredit();

// ======================== DELETE SALES ========================
// ابحث عن refreshSales وعدّل جزء tbody.querySelectorAll ليصبح:
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

// ======================== DELETE PURCHASES ========================
// ابحث عن refreshPurchases وعدّل جزء tbody.querySelectorAll ليصبح:
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
