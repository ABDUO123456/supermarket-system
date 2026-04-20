const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { initDatabase, getDb } = require('../database/database');
const { registerIpcHandlers } = require('./ipc-handlers');

let mainWindow;

/**
 * إنشاء نافذة البرنامج الرئيسية
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    title: 'سوبر ماركت — إدارة',
    // إخفاء الإطار العلوي إذا كنت تريد تصميماً عصرياً (اختياري)
    // frame: false, 
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    // خلفية البرنامج داكنة لتناسب تصميم النيون والأزرق الجليدي
    backgroundColor: '#0a0a0a', 
    show: false // لا تظهر النافذة حتى تجهز تماماً
  });

  // تحميل ملف الواجهة الرئيسي
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // إظهار النافذة بمجرد أن تصبح جاهزة (لتجنب الوميض الأبيض)
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize(); // فتح البرنامج بحجم الشاشة الكاملة
    mainWindow.show();
  });

  // معالجة إغلاق النافذة
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * تشغيل التطبيق
 */
app.whenReady().then(() => {
  // 1. إخفاء قائمة البرنامج العلوية (File, Edit, etc) ليظهر كبرنامج كاشير حقيقي
  Menu.setApplicationMenu(null);

  // 2. تهيئة قاعدة البيانات SQLite
  try {
    initDatabase(app);
    console.log("✅ تم تهيئة قاعدة البيانات بنجاح");
  } catch (error) {
    console.error("❌ فشل في تهيئة قاعدة البيانات:", error);
  }

  // 3. تسجيل جميع أوامر IPC (بما فيها الباركود والطباعة)
  registerIpcHandlers(ipcMain, getDb);

  // 4. فتح النافذة
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/**
 * إغلاق البرنامج عند غلق كل النوافذ
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// التعامل مع الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
  console.error('An unexpected error occurred:', error);
});