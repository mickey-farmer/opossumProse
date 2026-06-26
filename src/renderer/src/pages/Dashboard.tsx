import React, { useEffect, useState } from 'react'
import { useProjectStore, ProjectType, Project, TitlePage } from '../stores/projectStore'

const PROJECT_TYPE_META: Record<ProjectType, { label: string; icon: string; desc: string }> = {
  novel: {
    label: 'Novel',
    icon: '📖',
    desc: 'Long-form fiction with chapters, characters & world-building tools'
  },
  screenplay: {
    label: 'Screenplay',
    icon: '🎬',
    desc: 'Film & TV scripts with smart formatting: sluglines, action, dialogue'
  },
  stageplay: {
    label: 'Stage Play',
    icon: '🎭',
    desc: 'Theater scripts with act/scene headings and stage direction formatting'
  }
}

type Step = 'type' | 'titlepage'

export default function Dashboard(): JSX.Element {
  const { projects, setProjects, addProject, setActiveProject, setActiveView } = useProjectStore()
  const [showNewProject, setShowNewProject] = useState(false)
  const [step, setStep] = useState<Step>('type')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<ProjectType>('novel')
  const [titlePage, setTitlePage] = useState<TitlePage>({ title: '', subtitle: '', authorName: '', contact: '' })
  const [loading, setLoading] = useState(true)
  const [firstRun, setFirstRun] = useState(false)
  const [projectsDir, setProjectsDir] = useState('')

  useEffect(() => {
    async function init(): Promise<void> {
      const isFirst = await window.api.isFirstRun()
      if (isFirst) {
        setFirstRun(true)
        setLoading(false)
        return
      }
      const dir = await window.api.getProjectsDir()
      setProjectsDir(dir)
      const list = await window.api.listProjects()
      setProjects(list)
      setLoading(false)
    }
    init()
  }, [setProjects])

  async function handlePickFolder(): Promise<void> {
    const dir = await window.api.pickProjectsDir()
    if (!dir) return
    setProjectsDir(dir)
    setFirstRun(false)
    const list = await window.api.listProjects()
    setProjects(list)
  }

  async function handleChangeFolder(): Promise<void> {
    const dir = await window.api.pickProjectsDir()
    if (!dir) return
    setProjectsDir(dir)
    const list = await window.api.listProjects()
    setProjects(list)
  }

  function openModal(): void {
    setStep('type')
    setNewName('')
    setNewType('novel')
    setTitlePage({ title: '', subtitle: '', authorName: '', contact: '' })
    setShowNewProject(true)
  }

  function closeModal(): void {
    setShowNewProject(false)
  }

  function handleTypeNext(): void {
    if (!newName.trim()) return
    // novels skip the title page step
    if (newType === 'novel') {
      handleCreate()
    } else {
      setTitlePage((prev) => ({ ...prev, title: newName.trim() }))
      setStep('titlepage')
    }
  }

  async function handleCreate(tp?: TitlePage): Promise<void> {
    if (!newName.trim()) return
    const now = new Date().toISOString()
    const finalTitlePage = tp ?? titlePage
    const project = await window.api.createProject({
      id: `${Date.now()}`,
      name: newName.trim(),
      type: newType,
      createdAt: now,
      updatedAt: now,
      wordCount: 0,
      titlePage: newType !== 'novel' ? finalTitlePage : undefined,
      revisionColor: 'white'
    })
    addProject(project)
    setActiveProject(project)
    setActiveView('editor')
    setShowNewProject(false)
  }

  function openProject(project: Project): void {
    setActiveProject(project)
    setActiveView('editor')
  }

  const isScript = newType === 'screenplay' || newType === 'stageplay'

  if (firstRun) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="text-6xl mb-4">🦝</div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Welcome to OpossumProse</h1>
          <p className="text-gray-500 text-sm mb-6 leading-relaxed">
            Choose where to save your projects. For cross-machine sync, point this at a folder inside Google Drive.
          </p>
          <button
            onClick={handlePickFolder}
            className="w-full bg-opossum-600 hover:bg-opossum-700 text-white font-medium px-6 py-3 rounded-xl transition-colors"
          >
            Choose Projects Folder
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Titlebar */}
      <div className="titlebar-drag h-12 flex items-center px-4 bg-white/80 backdrop-blur border-b border-gray-200 shrink-0">
        <div className="pl-20 flex-1 flex items-center gap-3">
          <span className="font-semibold text-gray-800 text-sm">OpossumProse</span>
          {projectsDir && (
            <span className="text-xs text-gray-400 truncate max-w-xs" title={projectsDir}>
              {projectsDir.replace(/^.*?([^/]+\/[^/]+)$/, '…/$1')}
            </span>
          )}
        </div>
        <div className="no-drag flex items-center gap-2">
          <button
            onClick={handleChangeFolder}
            title="Change projects folder"
            className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            ⚙ Folder
          </button>
          <button
            onClick={openModal}
            className="bg-opossum-600 hover:bg-opossum-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            + New Project
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Loading projects…
          </div>
        ) : projects.length === 0 && !showNewProject ? (
          <EmptyState onNew={openModal} />
        ) : (
          <ProjectGrid projects={projects} onOpen={openProject} />
        )}
      </div>

      {/* New Project Modal */}
      {showNewProject && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-[540px] p-6">

            {/* ── Step 1: name + type ── */}
            {step === 'type' && (
              <>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Create New Project</h2>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
                  <input
                    autoFocus
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleTypeNext()}
                    placeholder="My Great Screenplay"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-opossum-500"
                  />
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Project Type</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(Object.keys(PROJECT_TYPE_META) as ProjectType[]).map((type) => {
                      const meta = PROJECT_TYPE_META[type]
                      return (
                        <button
                          key={type}
                          onClick={() => setNewType(type)}
                          className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all text-left ${
                            newType === type
                              ? 'border-opossum-500 bg-opossum-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <span className="text-2xl mb-1">{meta.icon}</span>
                          <span className="text-sm font-medium text-gray-900">{meta.label}</span>
                          <span className="text-xs text-gray-500 text-center mt-1 leading-tight">
                            {meta.desc}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex gap-3 justify-end">
                  <button onClick={closeModal} className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg">
                    Cancel
                  </button>
                  <button
                    onClick={handleTypeNext}
                    disabled={!newName.trim()}
                    className="bg-opossum-600 hover:bg-opossum-700 disabled:bg-gray-300 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
                  >
                    {isScript ? 'Next: Title Page →' : 'Create Project'}
                  </button>
                </div>
              </>
            )}

            {/* ── Step 2: title page (scripts only) ── */}
            {step === 'titlepage' && (
              <>
                <h2 className="text-xl font-semibold text-gray-900 mb-1">Title Page</h2>
                <p className="text-sm text-gray-500 mb-5">
                  This becomes the first page of your script. You can edit it anytime from the sidebar.
                </p>

                {/* Live title page preview */}
                <div
                  className="bg-gray-50 border border-gray-200 rounded-xl mb-5 relative overflow-hidden"
                  style={{ fontFamily: 'Courier New, monospace', fontSize: '11px', height: '200px' }}
                >
                  {/* top-center */}
                  <div className="absolute top-0 left-0 right-0 flex flex-col items-center pt-8 text-center px-4">
                    <div className="font-bold uppercase text-sm leading-tight">
                      {titlePage.title || newName}
                    </div>
                    {titlePage.subtitle && (
                      <div className="text-xs mt-1">{titlePage.subtitle}</div>
                    )}
                  </div>
                  {/* bottom-left */}
                  <div className="absolute bottom-3 left-4 text-left">
                    {titlePage.authorName && <div className="text-xs">{titlePage.authorName}</div>}
                    {titlePage.contact && (
                      <div className="text-xs text-gray-500 whitespace-pre-line">{titlePage.contact}</div>
                    )}
                  </div>
                </div>

                <div className="space-y-3 mb-5">
                  <Field label="Title (on the page)">
                    <input
                      autoFocus
                      value={titlePage.title}
                      onChange={(e) => setTitlePage((p) => ({ ...p, title: e.target.value }))}
                      placeholder={newName}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-opossum-500"
                    />
                  </Field>
                  <Field label="Subtitle / credit line">
                    <input
                      value={titlePage.subtitle}
                      onChange={(e) => setTitlePage((p) => ({ ...p, subtitle: e.target.value }))}
                      placeholder="Written by Mickey Farmer"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-opossum-500"
                    />
                  </Field>
                  <Field label="Author name (bottom-left corner)">
                    <input
                      value={titlePage.authorName}
                      onChange={(e) => setTitlePage((p) => ({ ...p, authorName: e.target.value }))}
                      placeholder="Mickey Farmer"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-opossum-500"
                    />
                  </Field>
                  <Field label="Contact details (address, email, phone)">
                    <textarea
                      value={titlePage.contact}
                      onChange={(e) => setTitlePage((p) => ({ ...p, contact: e.target.value }))}
                      rows={2}
                      placeholder={"mickey@example.com\n(555) 123-4567"}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-opossum-500 resize-none"
                    />
                  </Field>
                </div>

                <div className="flex gap-3 justify-between">
                  <button onClick={() => setStep('type')} className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg">
                    ← Back
                  </button>
                  <button
                    onClick={() => handleCreate(titlePage)}
                    className="bg-opossum-600 hover:bg-opossum-700 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
                  >
                    Create Project
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="text-6xl mb-4">🦝</div>
      <h1 className="text-2xl font-semibold text-gray-800 mb-2">Welcome to OpossumProse</h1>
      <p className="text-gray-500 mb-6 max-w-sm">
        Your creative companion for novels, screenplays, and stage plays. Start by creating your
        first project.
      </p>
      <button
        onClick={onNew}
        className="bg-opossum-600 hover:bg-opossum-700 text-white font-medium px-6 py-3 rounded-xl transition-colors"
      >
        Create Your First Project
      </button>
    </div>
  )
}

function ProjectGrid({ projects, onOpen }: { projects: Project[]; onOpen: (p: Project) => void }): JSX.Element {
  const icons: Record<ProjectType, string> = { novel: '📖', screenplay: '🎬', stageplay: '🎭' }
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Your Projects</h2>
      <div className="grid grid-cols-3 gap-4">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpen(p)}
            className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-opossum-400 hover:shadow-md transition-all"
          >
            <div className="text-3xl mb-2">{icons[p.type]}</div>
            <div className="font-medium text-gray-900">{p.name}</div>
            <div className="text-sm text-gray-500 capitalize">{p.type}</div>
            {p.wordCount > 0 && (
              <div className="text-xs text-gray-400 mt-1">{p.wordCount.toLocaleString()} words</div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
