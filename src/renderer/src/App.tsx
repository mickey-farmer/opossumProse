import React from 'react'
import { useProjectStore } from './stores/projectStore'
import Dashboard from './pages/Dashboard'
import Editor from './pages/Editor'

export default function App(): JSX.Element {
  const activeView = useProjectStore((s) => s.activeView)

  return (
    <div className="h-full bg-gray-50 flex flex-col">
      {activeView === 'dashboard' && <Dashboard />}
      {activeView === 'editor' && <Editor />}
    </div>
  )
}
