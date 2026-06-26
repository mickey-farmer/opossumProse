import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  getProjectsDir: () => ipcRenderer.invoke('get-projects-dir'),
  setProjectsDir: (dir: string) => ipcRenderer.invoke('set-projects-dir', dir),
  isFirstRun: () => ipcRenderer.invoke('is-first-run'),
  pickProjectsDir: () => ipcRenderer.invoke('pick-projects-dir'),
  listProjects: () => ipcRenderer.invoke('list-projects'),
  createProject: (project: unknown) => ipcRenderer.invoke('create-project', project),
  saveContent: (projectPath: string, content: unknown) =>
    ipcRenderer.invoke('save-content', projectPath, content),
  loadContent: (projectPath: string) => ipcRenderer.invoke('load-content', projectPath),
  loadCharacters: (projectPath: string) => ipcRenderer.invoke('load-characters', projectPath),
  saveCharacters: (projectPath: string, characters: unknown) =>
    ipcRenderer.invoke('save-characters', projectPath, characters),
  loadNotes: (projectPath: string) => ipcRenderer.invoke('load-notes', projectPath),
  saveNotes: (projectPath: string, notes: unknown) =>
    ipcRenderer.invoke('save-notes', projectPath, notes),
  loadOutline: (projectPath: string) => ipcRenderer.invoke('load-outline', projectPath),
  saveOutline: (projectPath: string, outline: unknown) =>
    ipcRenderer.invoke('save-outline', projectPath, outline),
  updateProject: (projectPath: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke('update-project', projectPath, updates),
  printToPdf: (defaultName: string, htmlContent: string) => ipcRenderer.invoke('print-to-pdf', defaultName, htmlContent),
  exportText: (defaultName: string, content: string, ext: string) =>
    ipcRenderer.invoke('export-text', defaultName, content, ext),
  saveBuffer: (defaultName: string, base64Data: string, ext: string) =>
    ipcRenderer.invoke('save-buffer', defaultName, base64Data, ext),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  geminiCheck: (projectPath: string, content: string, type: string) =>
    ipcRenderer.invoke('gemini-check', projectPath, content, type),
  geminiWrite: (prompt: string, context: string, mode: string) =>
    ipcRenderer.invoke('gemini-write', prompt, context, mode),
  onGeminiChunk: (cb: (text: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, text: string) => cb(text)
    ipcRenderer.on('gemini-write-chunk', handler)
    return () => ipcRenderer.removeListener('gemini-write-chunk', handler)
  },
  geminiChat: (messages: { role: string; text: string }[], context: string) =>
    ipcRenderer.invoke('gemini-chat', messages, context),
  onGeminiChatChunk: (cb: (delta: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, delta: string) => cb(delta)
    ipcRenderer.on('gemini-chat-chunk', handler)
    return () => ipcRenderer.removeListener('gemini-chat-chunk', handler)
  },
})
