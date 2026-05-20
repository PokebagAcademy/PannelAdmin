'use client'

import Editor, { type OnMount } from '@monaco-editor/react'

export function MonacoEditor({
  value,
  language,
  readOnly,
  onChange,
}: {
  value: string
  language: string
  readOnly: boolean
  onChange: (v: string) => void
}) {
  const handleMount: OnMount = (_editor, monaco) => {
    // Custom theme matching our palette
    monaco.editor.defineTheme('cobble', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6a736a', fontStyle: 'italic' },
        { token: 'string', foreground: 'd8a04a' },
        { token: 'number', foreground: '7fd396' },
        { token: 'keyword', foreground: 'c4523a', fontStyle: 'bold' },
        { token: 'type', foreground: '7fd396' },
        { token: 'function', foreground: 'd8a04a' },
        { token: 'variable', foreground: 'e9ede9' },
        { token: 'tag', foreground: 'd8a04a' },
        { token: 'attribute.name', foreground: '7fd396' },
        { token: 'attribute.value', foreground: 'e6b667' },
      ],
      colors: {
        'editor.background': '#0a0c0a',
        'editor.foreground': '#e9ede9',
        'editor.lineHighlightBackground': '#161a16',
        'editor.selectionBackground': '#d8a04a55',
        'editor.inactiveSelectionBackground': '#d8a04a22',
        'editorCursor.foreground': '#d8a04a',
        'editorLineNumber.foreground': '#3a423a',
        'editorLineNumber.activeForeground': '#d8a04a',
        'editorIndentGuide.background': '#161a16',
        'editorIndentGuide.activeBackground': '#262d26',
        'editorWhitespace.foreground': '#1d221d',
        'scrollbarSlider.background': '#262d26',
        'scrollbarSlider.hoverBackground': '#3a423a',
        'scrollbarSlider.activeBackground': '#6a736a',
      },
    })
    monaco.editor.setTheme('cobble')
  }

  return (
    <div className="flex-1 min-h-0">
      <Editor
        height="100%"
        value={value}
        language={language}
        theme="cobble"
        onChange={(v) => onChange(v ?? '')}
        onMount={handleMount}
        options={{
          readOnly,
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: 13,
          fontLigatures: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'phase',
          cursorSmoothCaretAnimation: 'on',
          renderLineHighlight: 'line',
          padding: { top: 16, bottom: 16 },
          lineNumbersMinChars: 3,
          wordWrap: 'on',
          tabSize: 2,
          guides: { indentation: true },
        }}
      />
    </div>
  )
}
