const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chemLabAPI', {
    loadData: () => ipcRenderer.invoke('load-data'),
    saveData: (data) => ipcRenderer.invoke('save-data', data)
});
