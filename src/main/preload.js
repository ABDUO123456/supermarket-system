const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  settings: {
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    patch: (partial) => ipcRenderer.invoke('settings:patch', partial)
  },
  dashboard: {
    stats: () => ipcRenderer.invoke('dashboard:stats'),
    overview: () => ipcRenderer.invoke('dashboard:overview')
  },
  reports: {
    salesInRange: (from, to) => ipcRenderer.invoke('reports:salesInRange', from, to),
    purchasesInRange: (from, to) => ipcRenderer.invoke('reports:purchasesInRange', from, to),
    salesCsv: (from, to) => ipcRenderer.invoke('reports:salesCsv', from, to)
  },
  export: {
    saveText: (payload) => ipcRenderer.invoke('export:saveText', payload),
    productsCsv: () => ipcRenderer.invoke('products:exportCsv')
  },
  print: {
    receipt: (saleId) => ipcRenderer.invoke('print:receipt', saleId)
  },
  scanBarcode: (barcode) => ipcRenderer.invoke('scan:barcode', barcode),
  products: {
    list: () => ipcRenderer.invoke('products:list'),
    search: (q) => ipcRenderer.invoke('products:search', q),
    add: (row) => ipcRenderer.invoke('products:add', row),
    update: (row) => ipcRenderer.invoke('products:update', row),
    remove: (id) => ipcRenderer.invoke('products:remove', id)
  },
  categories: {
    list: () => ipcRenderer.invoke('categories:list'),
    add: (name) => ipcRenderer.invoke('categories:add', name),
    update: (row) => ipcRenderer.invoke('categories:update', row),
    remove: (id) => ipcRenderer.invoke('categories:remove', id)
  },
  sales: {
    create: (payload) => ipcRenderer.invoke('sales:create', payload),
    list: (limit) => ipcRenderer.invoke('sales:list', limit),
    items: (saleId) => ipcRenderer.invoke('sales:items', saleId)
  },
  purchases: {
    create: (payload) => ipcRenderer.invoke('purchases:create', payload),
    list: () => ipcRenderer.invoke('purchases:list'),
    items: (purchaseId) => ipcRenderer.invoke('purchases:items', purchaseId),
    detail: (purchaseId) => ipcRenderer.invoke('purchases:detail', purchaseId)
  },
  suppliers: {
    list: () => ipcRenderer.invoke('suppliers:list'),
    add: (row) => ipcRenderer.invoke('suppliers:add', row),
    update: (row) => ipcRenderer.invoke('suppliers:update', row),
    remove: (id) => ipcRenderer.invoke('suppliers:remove', id)
  }
});
