import { create } from 'zustand'

export type ProjectType = 'novel' | 'screenplay' | 'stageplay'

export interface TitlePage {
  title: string
  subtitle: string   // e.g. "Written by Mickey Farmer"
  authorName: string
  contact: string    // address/email/phone in bottom-left corner
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
  includeTableOfContents: boolean   // novel
  showSceneNumbers: boolean         // screenplay/stageplay
  showRevisionWatermark: boolean    // screenplay/stageplay
  includeTitlePage: boolean         // screenplay/stageplay
}

export function defaultExportSettings(type: ProjectType): ExportSettings {
  return {
    showPageNumbers: true,
    includeTableOfContents: false,
    showSceneNumbers: type === 'screenplay',
    showRevisionWatermark: false,
    includeTitlePage: type !== 'novel',
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

export type EditorTab = 'write' | 'characters' | 'notes' | 'outline'

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
