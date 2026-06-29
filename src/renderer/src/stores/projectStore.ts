import { create } from 'zustand'

export type ProjectType = 'novel' | 'screenplay' | 'stageplay' | 'tv' | 'shortstory' | 'videogame'

// ── Video game script data model ──────────────────────────────────────────────

export type GameNodeType = 'conversation' | 'cutscene' | 'bark_group' | 'start'

export interface GameDialogueLine {
  id: string
  speaker: string
  text: string
  condition?: string   // e.g. "reputation > 50"
  voId?: string        // auto-generated localization key
}

export interface GameChoice {
  id: string
  text: string           // player-visible response text
  destinationNodeId: string
  condition?: string     // gate this choice behind a flag/var
}

export interface GameNode {
  id: string             // e.g. "NODE_001"
  label: string          // friendly name for display in graph
  type: GameNodeType
  lines: GameDialogueLine[]
  choices: GameChoice[]
  actions: string[]      // e.g. ["SET quest_started = true", "GIVE item_key"]
  notes?: string
  // graph position (used in Phase 2)
  x?: number
  y?: number
}

export interface GameBarkLine {
  id: string
  speaker: string
  text: string
  trigger?: string       // condition that triggers this bark
  category?: string      // grouping label e.g. "combat", "idle", "react_fire"
  notes?: string
}

export interface GameVariable {
  id: string
  name: string
  type: 'boolean' | 'integer' | 'string'
  defaultValue: string
  description?: string
}

export interface GameConversation {
  id: string
  name: string
  startNodeId: string
  nodes: GameNode[]
}

export interface GameScript {
  conversations: GameConversation[]
  barks: GameBarkLine[]
  variables: GameVariable[]
}

export interface TitlePage {
  title: string
  subtitle: string   // e.g. "Written by Mickey Farmer"
  authorName: string
  contact: string    // address/email/phone in bottom-left corner
  // TV-specific extras
  episodeTitle?: string
  episodeNumber?: string
  seriesTitle?: string
  draftDate?: string
}

// WGA standard revision color sequence
export const REVISION_COLORS = [
  { label: 'White (original)', value: 'white', hex: '#ffffff' },
  { label: 'Blue (1st)', value: 'blue', hex: '#dbeafe' },
  { label: 'Pink (2nd)', value: 'pink', hex: '#fce7f3' },
  { label: 'Yellow (3rd)', value: 'yellow', hex: '#fef9c3' },
  { label: 'Green (4th)', value: 'green', hex: '#dcfce7' },
  { label: 'Goldenrod (5th)', value: 'goldenrod', hex: '#fef3c7' },
  { label: 'Buff (6th)', value: 'buff', hex: '#fef2d7' },
  { label: 'Salmon (7th)', value: 'salmon', hex: '#fee2e2' },
  { label: 'Cherry (8th)', value: 'cherry', hex: '#fce7f3' },
  { label: 'Tan (9th)', value: 'tan', hex: '#f5f0e8' },
  { label: 'Ivory (10th)', value: 'ivory', hex: '#fefce8' },
]

export interface ExportSettings {
  showPageNumbers: boolean
  includeTableOfContents: boolean   // novel / shortstory
  showSceneNumbers: boolean         // screenplay / stageplay / tv
  showRevisionWatermark: boolean    // screenplay / stageplay / tv
  includeTitlePage: boolean         // screenplay / stageplay / tv
}

export function defaultExportSettings(type: ProjectType): ExportSettings {
  return {
    showPageNumbers: true,
    includeTableOfContents: false,
    showSceneNumbers: type === 'screenplay' || type === 'tv',
    showRevisionWatermark: false,
    includeTitlePage: type !== 'novel' && type !== 'shortstory' && type !== 'videogame',
  }
}

export interface Project {
  id: string
  name: string
  type: ProjectType
  createdAt: string
  updatedAt: string
  wordCount: number
  path: string
  titlePage?: TitlePage
  revisionColor?: string  // one of REVISION_COLORS[n].value
  exportSettings?: ExportSettings
  wordCountGoal?: number
}

// Writing stats — one entry per writing session / save event
export interface WritingStatEntry {
  date: string        // ISO date string YYYY-MM-DD
  projectId: string
  projectName: string
  projectType: ProjectType
  wordsAdded: number  // delta from previous session (can be 0)
  totalWords: number  // snapshot at time of save
  sessionMs: number   // time spent writing this session in ms (0 if unknown)
}

export type EditorTab = 'write' | 'characters' | 'notes' | 'outline' | 'stats'

interface ProjectStore {
  projects: Project[]
  activeProject: Project | null
  activeView: 'dashboard' | 'editor'
  activeEditorTab: EditorTab
  setProjects: (projects: Project[]) => void
  setActiveProject: (project: Project | null) => void
  setActiveView: (view: 'dashboard' | 'editor') => void
  setActiveEditorTab: (tab: EditorTab) => void
  addProject: (project: Project) => void
  updateActiveProject: (updates: Partial<Project>) => void
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  activeProject: null,
  activeView: 'dashboard',
  activeEditorTab: 'write',
  setProjects: (projects) => set({ projects }),
  setActiveProject: (project) => set({ activeProject: project, activeEditorTab: 'write' }),
  setActiveView: (view) => set({ activeView: view }),
  setActiveEditorTab: (tab) => set({ activeEditorTab: tab }),
  addProject: (project) => set((state) => ({ projects: [...state.projects, project] })),
  updateActiveProject: (updates) =>
    set((state) => ({
      activeProject: state.activeProject ? { ...state.activeProject, ...updates } : null,
      projects: state.projects.map((p) =>
        state.activeProject && p.id === state.activeProject.id ? { ...p, ...updates } : p
      )
    }))
}))
