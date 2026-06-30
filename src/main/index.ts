import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import https from 'https'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import { mkdirSync, existsSync } from 'fs'
import { promises as fsp } from 'fs'
import { homedir } from 'os'

const store = new Store()
const DEFAULT_PROJECTS_DIR = join(homedir(), 'Documents', 'OpossumProse', 'Projects')

function getProjectsDir(): string {
  return (store.get('projectsDir') as string) || DEFAULT_PROJECTS_DIR
}

function ensureProjectsDir(): void {
  const dir = getProjectsDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.opossumprose')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  ensureProjectsDir()

  // ── Settings ──────────────────────────────────────────────────────
  ipcMain.handle('get-projects-dir', () => getProjectsDir())

  ipcMain.handle('set-projects-dir', (_e, dir: string) => {
    store.set('projectsDir', dir)
    ensureProjectsDir()
    return dir
  })

  ipcMain.handle('is-first-run', () => {
    return !store.has('projectsDir')
  })

  ipcMain.handle('pick-projects-dir', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Choose your Projects folder',
      buttonLabel: 'Select Folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (canceled || !filePaths[0]) return null
    store.set('projectsDir', filePaths[0])
    ensureProjectsDir()
    return filePaths[0]
  })

  // ── Projects list ─────────────────────────────────────────────────
  ipcMain.handle('list-projects', async () => {
    const dir = getProjectsDir()
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true })
      const results: unknown[] = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        try {
          const raw = await fsp.readFile(join(dir, entry.name, 'project.json'), 'utf-8')
          const p = JSON.parse(raw)
          p.path = join(dir, entry.name)
          results.push(p)
        } catch {
          // skip malformed dirs
        }
      }
      return (results as { updatedAt: string }[]).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    } catch {
      return []
    }
  })

  // ── Create project ────────────────────────────────────────────────
  ipcMain.handle('create-project', async (_e, project: { name: string; type: string; id: string; createdAt: string; updatedAt: string; wordCount: number }) => {
    const dir = getProjectsDir()
    let dirName = project.name.replace(/[/\\:*?"<>|]/g, '-').trim() || 'Untitled'

    // avoid collisions
    let fullPath = join(dir, dirName)
    let n = 1
    while (existsSync(fullPath)) {
      fullPath = join(dir, `${dirName} ${n}`)
      n++
    }
    mkdirSync(fullPath, { recursive: true })

    const projectData = { ...project, path: fullPath }
    await fsp.writeFile(join(fullPath, 'project.json'), JSON.stringify(projectData, null, 2))

    const initialContent =
      project.type === 'novel'
        ? { chapters: [{ id: '1', title: 'Chapter 1', content: '' }] }
        : {
            lines: [
              {
                id: '1',
                element: 'scene-heading',
                text: project.type === 'stageplay' ? 'ACT ONE' : 'INT. LOCATION - DAY'
              }
            ]
          }
    await fsp.writeFile(join(fullPath, 'content.json'), JSON.stringify(initialContent, null, 2))

    return projectData
  })

  // ── Save / load content ───────────────────────────────────────────
  ipcMain.handle('save-content', async (_e, projectPath: string, content: { wordCount?: number }) => {
    await fsp.writeFile(join(projectPath, 'content.json'), JSON.stringify(content, null, 2))
    // update project.json metadata
    const pjPath = join(projectPath, 'project.json')
    try {
      const p = JSON.parse(await fsp.readFile(pjPath, 'utf-8'))
      p.updatedAt = new Date().toISOString()
      if (typeof content.wordCount === 'number') p.wordCount = content.wordCount
      await fsp.writeFile(pjPath, JSON.stringify(p, null, 2))
    } catch { /* non-fatal */ }
    return true
  })

  ipcMain.handle('load-content', async (_e, projectPath: string) => {
    const raw = await fsp.readFile(join(projectPath, 'content.json'), 'utf-8')
    return JSON.parse(raw)
  })

  // ── Characters ────────────────────────────────────────────────────
  ipcMain.handle('load-characters', async (_e, projectPath: string) => {
    try {
      const raw = await fsp.readFile(join(projectPath, 'characters.json'), 'utf-8')
      return JSON.parse(raw)
    } catch { return [] }
  })

  ipcMain.handle('save-characters', async (_e, projectPath: string, characters: unknown) => {
    await fsp.writeFile(join(projectPath, 'characters.json'), JSON.stringify(characters, null, 2))
    return true
  })

  // ── Notes ─────────────────────────────────────────────────────────
  ipcMain.handle('load-notes', async (_e, projectPath: string) => {
    try {
      const raw = await fsp.readFile(join(projectPath, 'notes.json'), 'utf-8')
      return JSON.parse(raw)
    } catch { return [] }
  })

  ipcMain.handle('save-notes', async (_e, projectPath: string, notes: unknown) => {
    await fsp.writeFile(join(projectPath, 'notes.json'), JSON.stringify(notes, null, 2))
    return true
  })

  // ── Outline ───────────────────────────────────────────────────────
  ipcMain.handle('load-outline', async (_e, projectPath: string) => {
    try {
      const raw = await fsp.readFile(join(projectPath, 'outline.json'), 'utf-8')
      return JSON.parse(raw)
    } catch { return [] }
  })

  ipcMain.handle('save-outline', async (_e, projectPath: string, outline: unknown) => {
    await fsp.writeFile(join(projectPath, 'outline.json'), JSON.stringify(outline, null, 2))
    return true
  })

  // ── Update project metadata ───────────────────────────────────────
  ipcMain.handle('update-project', async (_e, projectPath: string, updates: Record<string, unknown>) => {
    const pjPath = join(projectPath, 'project.json')
    const p = JSON.parse(await fsp.readFile(pjPath, 'utf-8'))
    Object.assign(p, updates, { updatedAt: new Date().toISOString() })
    await fsp.writeFile(pjPath, JSON.stringify(p, null, 2))
    return p
  })

  // ── PDF export ────────────────────────────────────────────────────
  // Receives a complete HTML string from the renderer, loads it in a hidden
  // BrowserWindow, and prints that — no app chrome or sidebar included.
  ipcMain.handle('print-to-pdf', async (_e, defaultName: string, htmlContent: string) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export PDF',
      defaultPath: defaultName + '.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return null

    const printWin = new BrowserWindow({
      show: false,
      width: 816,  // ~8.5in at 96dpi
      height: 1056,
      webPreferences: { sandbox: true }
    })
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent))

    const pdfData = await printWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Letter',
      margins: { marginType: 'none' },
    })
    printWin.destroy()

    await fsp.writeFile(filePath, pdfData)
    shell.showItemInFolder(filePath)
    return filePath
  })

  // ── Binary buffer export (e.g. .docx) ────────────────────────────
  ipcMain.handle('save-buffer', async (_e, defaultName: string, base64Data: string, ext: string) => {
    const extLabel = ext === 'docx' ? 'Word Document' : ext.toUpperCase()
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: `Export ${extLabel}`,
      defaultPath: `${defaultName}.${ext}`,
      filters: [{ name: extLabel, extensions: [ext] }]
    })
    if (canceled || !filePath) return null
    await fsp.writeFile(filePath, Buffer.from(base64Data, 'base64'))
    shell.showItemInFolder(filePath)
    return filePath
  })

  // ── Toggle fullscreen ─────────────────────────────────────────────
  ipcMain.handle('toggle-fullscreen', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) win.setFullScreen(!win.isFullScreen())
  })

  // ── Text/Fountain export ──────────────────────────────────────────
  ipcMain.handle('export-text', async (_e, defaultName: string, content: string, ext: string) => {
    const extLabel = ext === 'fountain' ? 'Fountain' : ext === 'fdx' ? 'Final Draft' : 'Text'
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: `Export ${extLabel}`,
      defaultPath: `${defaultName}.${ext}`,
      filters: [
        { name: extLabel, extensions: [ext] },
        { name: 'Plain Text', extensions: ['txt'] }
      ]
    })
    if (canceled || !filePath) return null
    await fsp.writeFile(filePath, content, 'utf-8')
    shell.showItemInFolder(filePath)
    return filePath
  })

  // ── API key settings ──────────────────────────────────────────────
  ipcMain.handle('get-api-key', () => (store.get('geminiApiKey') as string) || '')
  ipcMain.handle('set-api-key', (_e, key: string) => { store.set('geminiApiKey', key.trim()); return true })

  // ── Gemini AI ─────────────────────────────────────────────────────
  function getApiKey(): string { return (store.get('geminiApiKey') as string) || '' }

  // ── Gemini AI writer (streaming via SSE back to renderer) ─────────
  ipcMain.handle('gemini-write', async (event, prompt: string, context: string, mode: string) => {
    if (!getApiKey()) throw new Error('NO_API_KEY')
    const isScript = mode === 'screenplay' || mode === 'stageplay'

    const systemPrompt = isScript
      ? `You are a professional screenplay writer. The user will describe a scene or act and you will write it in standard screenplay format.

Output ONLY the screenplay content, no preamble or explanation. Use this exact format for each element, one per line, with a type prefix:

SCENE: INT. LOCATION - DAY
ACTION: Character walks into the room and looks around.
CHARACTER: JOHN
DIALOGUE: I can't believe it.
PARENTHETICAL: quietly
CHARACTER: SARAH
DIALOGUE: Believe it.
TRANSITION: CUT TO:

Rules:
- Every scene must start with a SCENE: line
- Use PARENTHETICAL: only when needed for delivery
- Do not number scenes
- Keep action lines concise (1-3 sentences max)
- Write naturalistic dialogue
- Use TRANSITION: sparingly`
      : `You are a professional fiction writer. The user will describe what they want in a chapter and you will write it as polished prose.

Output ONLY the chapter body text — no chapter title, no preamble, no explanation. Write in third-person past tense unless the user specifies otherwise. Aim for 500-1000 words of engaging, show-don't-tell prose with vivid sensory details and natural dialogue where appropriate.`

    const userMessage = context
      ? `Context from the story so far:\n${context.slice(0, 3000)}\n\n---\n\nWrite the following: ${prompt}`
      : `Write the following: ${prompt}`

    const body = JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }],
      generationConfig: { temperature: 0.85, maxOutputTokens: 4096 }
    })

    return new Promise<string>((resolve, reject) => {
      let fullText = ''
      const req = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-3.5-flash:generateContent?key=${getApiKey()}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 60000
      }, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString()
          try {
            const parsed = JSON.parse(data)
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
            if (text !== fullText) {
              fullText = text
              event.sender.send('gemini-write-chunk', text)
            }
          } catch { /* partial JSON, keep accumulating */ }
        })
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            if (parsed?.error) {
              reject(new Error(parsed.error.message || 'Gemini API error'))
              return
            }
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
            resolve(text)
          } catch {
            resolve(fullText || '')
          }
        })
      })
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out after 60s')) })
      req.on('error', (err) => reject(err))
      req.write(body)
      req.end()
    })
  })

  // ── Gemini AI continuity checker ──────────────────────────────────
  ipcMain.handle('gemini-check', async (_e, _projectPath: string, content: string, type: string) => {
    if (!getApiKey()) throw new Error('NO_API_KEY')
    const isScript = type === 'screenplay' || type === 'stageplay'
    const systemPrompt = isScript
      ? `You are a screenplay continuity checker. Analyze the provided screenplay content and identify issues such as: character name inconsistencies (same character referred to by different names), impossible timeline jumps, location name inconsistencies, and prop/wardrobe continuity errors. Return ONLY valid JSON, no markdown.`
      : `You are a novel continuity checker. Analyze the provided novel content and identify issues such as: character name inconsistencies, eye/hair color changes, timeline contradictions, location name inconsistencies, and factual contradictions within the story. Return ONLY valid JSON, no markdown.`

    const body = JSON.stringify({
      contents: [{
        parts: [{
          text: `${systemPrompt}\n\nContent to analyze:\n${content.slice(0, 12000)}\n\nReturn a JSON object with this exact structure: { "issues": [ { "type": "string (e.g. Character Name, Timeline, Location)", "description": "what the issue is", "suggestion": "how to fix it" } ] }`
        }]
      }],
      generationConfig: { temperature: 0.2 }
    })

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-3.5-flash:generateContent?key=${getApiKey()}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}'
            const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
            resolve(JSON.parse(clean))
          } catch {
            resolve({ issues: [] })
          }
        })
      })
      req.on('error', () => resolve({ issues: [] }))
      req.write(body)
      req.end()
    })
  })

  // ── Gemini chat (streaming) ───────────────────────────────────────
  ipcMain.handle('gemini-chat', async (event, messages: { role: string; text: string }[], context: string) => {
    if (!getApiKey()) throw new Error('NO_API_KEY')
    const systemInstruction = `You are a creative writing assistant embedded in OpossumProse, a writing tool for screenplays, stage plays, and novels. You have access to the user's current work and help them brainstorm, develop characters, fix dialogue, explore themes, and anything else related to their writing. Be conversational, specific, and concise.`

    const contents: { role: string; parts: { text: string }[] }[] = []

    // First user turn carries the script/chapter context
    if (context.trim()) {
      contents.push({
        role: 'user',
        parts: [{ text: `Here is my current work for context:\n\n${context.slice(0, 6000)}\n\n---\n\n${messages[0]?.text ?? ''}` }]
      })
    }

    // Remaining turns (or all turns if no context)
    const startIdx = context.trim() ? 1 : 0
    for (const msg of messages.slice(startIdx)) {
      contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.text }] })
    }

    const body = JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: { temperature: 0.9, maxOutputTokens: 2048 }
    })

    return new Promise<string>((resolve, reject) => {
      let fullText = ''
      const req = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-3.5-flash:streamGenerateContent?alt=sse&key=${getApiKey()}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 60000
      }, (res) => {
        let buf = ''
        res.on('data', (chunk: Buffer) => {
          buf += chunk.toString()
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const json = line.slice(6).trim()
            if (json === '[DONE]') continue
            try {
              const parsed = JSON.parse(json)
              const delta = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
              if (delta) {
                fullText += delta
                event.sender.send('gemini-chat-chunk', delta)
              }
            } catch { /* partial SSE line */ }
          }
        })
        res.on('end', () => resolve(fullText))
      })
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
      req.on('error', (err) => reject(err))
      req.write(body)
      req.end()
    })
  })

  // ── Writing stats ─────────────────────────────────────────────────
  ipcMain.handle('record-writing-stat', async (_event, projectPath: string, entry: unknown) => {
    const statsPath = join(projectPath, 'stats.json')
    let entries: unknown[] = []
    try {
      const raw = await fsp.readFile(statsPath, 'utf-8')
      entries = JSON.parse(raw)
    } catch { /* file doesn't exist yet */ }
    entries.push(entry)
    await fsp.writeFile(statsPath, JSON.stringify(entries, null, 2))
    return true
  })

  ipcMain.handle('load-writing-stats', async (_event, projectPath: string) => {
    const statsPath = join(projectPath, 'stats.json')
    try {
      const raw = await fsp.readFile(statsPath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return []
    }
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
