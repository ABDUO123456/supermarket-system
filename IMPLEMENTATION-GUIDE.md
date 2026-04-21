# 🔧 تعليمات تطبيق التعديلات الكاملة

## ✅ الملفات التي تم تعديلها:

### 1️⃣ **src/renderer/js/web-api.js** 
👉 انسخ محتوى `WEB-API-FIXED.js` كاملاً واستبدل الملف الأصلي

---

### 2️⃣ **src/main/dispatch.js**
👉 في بداية الـ switch statement أضف محتوى `DISPATCH-ADDITIONS.js`

**المكان الصحيح:**
```javascript
function runDispatch(getDb, channel, args = []) {
  const db = getDb();
  switch (channel) {
    // هنا أضف الحالات الجديدة من DISPATCH-ADDITIONS.js
  }
  return null;
}

// أستبدل مصفوفة DISPATCH_CHANNELS بالموجود في DISPATCH-ADDITIONS.js
```

---

### 3️⃣ **src/database/schema.sql** ✅ 
الجدول `credit_accounts` موجود بالفعل في الملف

---

### 4️⃣ **src/renderer/js/app.js**
👉 أضف محتوى `APP-JS-ADDITIONS.js` في الأماكن المناسبة:

**أولاً:** أضف الدوال الثلاث (refreshCredit, bindCredit, openCreditModal)

**ثانياً:** في دالة `setPage` أضف:
```javascript
if (name === 'credit') refreshCredit();
```

**ثالثاً:** في قسم البدء (init) أضف:
```javascript
bindCredit();
```

---

### 5️⃣ **src/renderer/index.html**
👉 أضف محتوى `HTML-ADDITIONS.html` في الأماكن المناسبة:

**أولاً:** في القائمة الجانبية (nav) بين الموردين والمشتريات:
```html
<button type="button" class="nav-item" data-page="credit">
  <span class="nav-icon">📝</span>
  <span>دفتر الديون</span>
</button>
```

**ثانياً:** في المحتوى الرئيسي بين صفحة الموردين والمشتريات:
أضف قسم صفحة الحسابات الائتمانية كاملة

**ثالثاً:** في جداول المشتريات والمبيعات أضف أزرار الحذف

---

## 🧪 خطوات التحقق:

1. **تشغيل التطبيق:**
   ```bash
   npm start
   ```

2. **التحقق من الواجهة:**
   - ✅ يجب أن تظهر صفحة "دفتر الديون" في القائمة الجانبية
   - ✅ يجب أن تظهر أزرار الحذف في المشتريات والمبيعات

3. **اختبار الوظائف:**
   - ✅ إضافة حساب ائتماني جديد
   - ✅ حذف حساب ائتماني
   - ✅ حذف فاتورة مبيعات
   - ✅ حذف عملية شراء

---

## 📝 ملاحظات مهمة:

⚠️ **تأكد من:**
- ✓ عدم وجود أخطاء في console
- ✓ جميع الأزرار تعمل بشكل صحيح
- ✓ رسائل التأكيد تظهر قبل الحذف
- ✓ البيانات تُحفظ في قاعدة البيانات

---

## 🚨 إذا واجهت مشاكل:

1. **امسح قاعدة البيانات وأعد التشغيل:**
   ```bash
   rm database.db  # Linux/Mac
   del database.db # Windows
   npm start
   ```

2. **تحقق من الأخطاء في Developer Tools:**
   ```
   F12 → Console
   ```

3. **تأكد من تطبيق جميع الخطوات بالترتيب**

---

## 📂 الملفات المساعدة:

- `WEB-API-FIXED.js` → الكود الكامل للـ API
- `DISPATCH-ADDITIONS.js` → حالات dispatch الجديدة
- `APP-JS-ADDITIONS.js` → الدوال الجديدة في app.js
- `HTML-ADDITIONS.html` → الأجزاء الجديدة في HTML

تم إنشاء جميع هذه الملفات في مجلد المشروع للمرجعية.
