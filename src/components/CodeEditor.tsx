import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useIDE } from '@/contexts/IDEContext';
import Editor, { Monaco } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { X } from 'lucide-react';

const AUTO_SUGGEST_KEY = 'velocide_auto_suggest';
const FORMAT_ON_SAVE_KEY = 'velocide_format_on_save';

export const CodeEditor: React.FC = () => {
  const { theme } = useTheme();
  const { activeTab, tabs, setActiveTab, closeTab, updateActiveContent, editorRef, saveTab } = useIDE();
  const autosaveTimerRef = useRef<number | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [autoSuggestEnabled, setAutoSuggestEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem(AUTO_SUGGEST_KEY);
    return stored === null ? true : stored === 'true';
  });
  const [formatOnSaveEnabled, setFormatOnSaveEnabled] = useState<boolean>(() => {
    const stored = localStorage.getItem(FORMAT_ON_SAVE_KEY);
    return stored === null ? true : stored === 'true';
  });

  const applyEditorPreferences = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({
      quickSuggestions: autoSuggestEnabled ? { other: true, comments: false, strings: true } : false,
      suggestOnTriggerCharacters: autoSuggestEnabled,
      parameterHints: { enabled: autoSuggestEnabled },
      inlineSuggest: { enabled: autoSuggestEnabled },
      wordBasedSuggestions: autoSuggestEnabled ? 'currentDocument' : 'off',
      tabCompletion: autoSuggestEnabled ? 'on' : 'off',
      acceptSuggestionOnEnter: autoSuggestEnabled ? 'smart' : 'off',
    });
  };

  const formatDocument = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const action = editor.getAction('editor.action.formatDocument');
    if (!action) return;
    try {
      await action.run();
    } catch (error) {
      console.warn('Format action failed:', error);
    }
  };

  const runAutosave = async () => {
    if (!activeTab?.isDirty) return;
    try {
      if (formatOnSaveEnabled) {
        await formatDocument();
      }
      await saveTab(activeTab.id);
    } catch (error) {
      console.error('Autosave failed:', error);
    }
  };

  const handleEditorDidMount = (editor: MonacoEditor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    applyEditorPreferences();

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
      editor.trigger('keyboard', 'editor.action.triggerSuggest', {});
    });

    editor.onDidBlurEditorText(() => {
      void runAutosave();
    });
  };

  useEffect(() => {
    if (!activeTab?.isDirty) return;
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      void runAutosave();
    }, 900);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, activeTab?.content, activeTab?.isDirty]);

  useEffect(() => {
    localStorage.setItem(AUTO_SUGGEST_KEY, String(autoSuggestEnabled));
    applyEditorPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSuggestEnabled]);

  useEffect(() => {
    localStorage.setItem(FORMAT_ON_SAVE_KEY, String(formatOnSaveEnabled));
  }, [formatOnSaveEnabled]);

  const configureMonaco = (monaco: Monaco) => {
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: false,
    });
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: false,
    });

    const compilerOptions = {
      allowJs: true,
      allowNonTsExtensions: true,
      target: monaco.languages.typescript.ScriptTarget.ES2022,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      resolveJsonModule: true,
      esModuleInterop: true,
      strict: false,
      skipLibCheck: true,
      noEmit: true,
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      typeRoots: ['node_modules/@types'],
    };

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
    monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
    monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);
    monaco.languages.typescript.typescriptDefaults.setInlayHintsOptions({
      includeInlayParameterNameHints: 'literals',
      includeInlayParameterNameHintsWhenArgumentMatchesName: false,
      includeInlayFunctionParameterTypeHints: true,
      includeInlayVariableTypeHints: true,
      includeInlayPropertyDeclarationTypeHints: true,
      includeInlayFunctionLikeReturnTypeHints: true,
      includeInlayEnumMemberValueHints: true,
    });

    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: true,
      enableSchemaRequest: true,
      schemaValidation: 'warning',
    });

    monaco.languages.css.cssDefaults.setOptions({
      validate: true,
      lint: { unknownProperties: 'warning' },
      data: { useDefaultDataProvider: true },
    });

    monaco.languages.html.htmlDefaults.setOptions({
      format: { tabSize: 2, wrapLineLength: 120 },
      suggest: {},
      data: { useDefaultDataProvider: true },
    });
  };

  const editorPath = activeTab ? `file:///workspace/${activeTab.path.replace(/^\.?\//, '')}` : undefined;

  if (!activeTab) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-center h-12 text-gray-500 border-b border-ide-panel-border">
          No files open
        </div>
        <div className="flex items-center justify-center h-32 text-gray-500">
          Select a file to begin editing.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar */}
      <div className="flex items-center bg-md-surface border-b border-ide-panel-border overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex items-center gap-2 px-4 py-2 border-r border-ide-panel-border cursor-pointer hover:bg-md-surface-variant transition-colors ${
              activeTab?.id === tab.id
                ? 'bg-md-surface-variant border-b-2 border-b-primary text-primary'
                : 'text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="text-sm font-medium truncate max-w-32">
              {tab.name}
              {tab.isDirty && <span className="text-yellow-400 ml-1">•</span>}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="p-1 hover:bg-md-surface-variant rounded transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2 px-2 py-1.5 text-xs">
          <button
            className={`px-2 py-1 rounded border ${autoSuggestEnabled ? 'border-emerald-500 text-emerald-500' : 'border-ide-panel-border text-gray-400'}`}
            onClick={() => setAutoSuggestEnabled((prev) => !prev)}
            title="Toggle Monaco auto suggest"
          >
            Auto Suggest {autoSuggestEnabled ? 'On' : 'Off'}
          </button>
          <button
            className={`px-2 py-1 rounded border ${formatOnSaveEnabled ? 'border-emerald-500 text-emerald-500' : 'border-ide-panel-border text-gray-400'}`}
            onClick={() => setFormatOnSaveEnabled((prev) => !prev)}
            title="Toggle format on save"
          >
            Format on Save {formatOnSaveEnabled ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={activeTab.language}
          path={editorPath}
          value={activeTab.content}
          onChange={(value) => updateActiveContent(value ?? '')}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          onMount={handleEditorDidMount}
          beforeMount={configureMonaco}
          options={{
            minimap: { enabled: false },
            padding: { top: 0, bottom: 0 },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            quickSuggestions: autoSuggestEnabled ? { other: true, comments: false, strings: true } : false,
            quickSuggestionsDelay: 40,
            suggestOnTriggerCharacters: autoSuggestEnabled,
            parameterHints: { enabled: autoSuggestEnabled },
            inlineSuggest: { enabled: autoSuggestEnabled },
            suggest: {
              preview: true,
              showMethods: true,
              showFunctions: true,
              showConstructors: true,
              showDeprecated: false,
              snippetsPreventQuickSuggestions: false,
            },
            wordBasedSuggestions: autoSuggestEnabled ? 'currentDocument' : 'off',
            acceptSuggestionOnEnter: autoSuggestEnabled ? 'smart' : 'off',
            tabCompletion: autoSuggestEnabled ? 'on' : 'off',
            formatOnType: true,
            formatOnPaste: true,
            formatOnSave: formatOnSaveEnabled,
          }}
        />
      </div>
    </div>
  );
};

export default CodeEditor;
