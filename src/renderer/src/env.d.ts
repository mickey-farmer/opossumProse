interface Window {
  api: {
    getProjectsDir: () => Promise<string>
    setProjectsDir: (dir: string) => Promise<string>
    isFirstRun: () => Promise<boolean>
    pickProjectsDir: () => Promise<string | null>
    listProjects: () => Promise<import('./stores/projectStore').Project[]>
    createProject: (project: Omit<import('./stores/projectStore').Project, 'path'>) => Promise<import('./stores/projectStore').Project>
    saveContent: (projectPath: string, content: unknown) => Promise<boolean>
    loadContent: (projectPath: string) => Promise<unknown>
    loadCharacters: (projectPath: string) => Promise<unknown>
    saveCharacters: (projectPath: string, characters: unknown) => Promise<boolean>
    loadNotes: (projectPath: string) => Promise<unknown>
    saveNotes: (projectPath: string, notes: unknown) => Promise<boolean>
    loadOutline: (projectPath: string) => Promise<unknown>
    saveOutline: (projectPath: string, outline: unknown) => Promise<boolean>
    updateProject: (projectPath: string, updates: Record<string, unknown>) => Promise<unknown>
    printToPdf: (defaultName: string, htmlContent: string) => Promise<string | null>
    exportText: (defaultName: string, content: string, ext: string) => Promise<string | null>
    saveBuffer: (defaultName: string, base64Data: string, ext: string) => Promise<string | null>
    toggleFullscreen: () => Promise<void>
    geminiCheck: (projectPath: string, content: string, type: string) => Promise<{ issues: { type: string; description: string; suggestion: string }[] }>
    geminiWrite: (prompt: string, context: string, mode: string) => Promise<string>
    onGeminiChunk: (cb: (text: string) => void) => () => void
    geminiChat: (messages: { role: string; text: string }[], context: string) => Promise<string>
    onGeminiChatChunk: (cb: (delta: string) => void) => () => void
    recordWritingStat: (projectPath: string, entry: import('./stores/projectStore').WritingStatEntry) => Promise<boolean>
    loadWritingStats: (projectPath: string) => Promise<import('./stores/projectStore').WritingStatEntry[]>
  }
}
