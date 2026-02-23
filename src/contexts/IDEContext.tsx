import React, { createContext, useCallback, useContext, useMemo, useState, useRef, useEffect } from 'react';
import { fileSystemService } from '@/services/fileSystemService';
import path from 'path-browserify';

// 1. INTERFACES
export interface IDEFileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: IDEFileNode[];
  gitStatus?: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  loading?: boolean;
  content?: string; // For terminal workspace files that already have content
}

export interface IDETab {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  isDirty: boolean;
}

interface IDEState {
  files: IDEFileNode[];
  tabs: IDETab[];
  activeTabId?: string;
  activeTab?: IDETab;
  editorRef: React.MutableRefObject<EditorRefValue | null>;
  openFile: (file: IDEFileNode) => Promise<void>;
  setActiveTab: (tabId: string) => void;
  updateActiveContent: (next: string) => void;
  closeTab: (tabId: string) => void;
  saveTab: (tabId: string) => Promise<void>;
  saveAll: () => Promise<void>;
  pickAndOpenFile: () => Promise<void>;
  saveActiveToDisk: () => Promise<void>;
  createFile: (parentNode?: IDEFileNode) => Promise<void>;
  createFolder: (parentNode?: IDEFileNode) => Promise<void>;
  renameNode: (node: IDEFileNode, newName: string) => Promise<void>;
  deleteNode: (node: IDEFileNode) => Promise<void>;
  createUntitledTab: () => void;
  triggerEditorAction: (action: string) => void;
  refreshFileTree: () => Promise<void>;
  loadNodeChildren: (node: IDEFileNode) => Promise<IDEFileNode[]>;
  importRepository: (repoUrl: string, targetPath?: string) => Promise<{ action: string; path: string }>;
}

type EditorRefValue = {
  trigger: (source: string, action: string, payload: unknown) => void;
};

type WindowWithFileHandles = Window & {
  __fileHandles?: Record<string, FileSystemFileHandle>;
};

// 2. CONTEXT (Not Exported)
const IDEContext = createContext<IDEState | undefined>(undefined);

// 3. PROVIDER COMPONENT (Exported)
export const IDEProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [files, setFiles] = useState<IDEFileNode[]>([]);
  const editorRef = useRef<EditorRefValue | null>(null);
  const [tabs, setTabs] = useState<IDETab[]>(() => {
    const saved = localStorage.getItem('ide-tabs');
    if (saved) {
      try {
        return JSON.parse(saved) as IDETab[];
      } catch {
        // Ignore malformed persisted state.
      }
    }
    return [];
  });
  const [activeTabId, setActiveTabId] = useState<string | undefined>(() => {
    return localStorage.getItem('ide-active-tab') || undefined;
  });

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId), [tabs, activeTabId]);

  const persist = useCallback((nextTabs: IDETab[], nextActiveId?: string) => {
    localStorage.setItem('ide-tabs', JSON.stringify(nextTabs));
    if (nextActiveId) localStorage.setItem('ide-active-tab', nextActiveId);
  }, []);

  const updateNodeChildren = useCallback((nodes: IDEFileNode[], nodeId: string, children: IDEFileNode[]): IDEFileNode[] => {
    return nodes.map((node) => {
      if (node.id === nodeId) {
        return { ...node, children };
      }
      if (node.children && node.children.length > 0) {
        return { ...node, children: updateNodeChildren(node.children, nodeId, children) };
      }
      return node;
    });
  }, []);

  const loadNodeChildren = useCallback(async (node: IDEFileNode): Promise<IDEFileNode[]> => {
    if (node.type !== 'folder') return [];
    try {
      const response = await fileSystemService.getDirectoryContents(node.path);
      const children = response.files.map(item => fileSystemService.convertToFileNode(item, new Set()));
      setFiles((prev) => updateNodeChildren(prev, node.id, children));
      return children;
    } catch (error) {
      console.error(`Failed to load children for ${node.path}:`, error);
      return [];
    }
  }, [updateNodeChildren]);

  const refreshFileTree = useCallback(async () => {
    console.log('refreshFileTree called');
    try {
      const rootNodes = await fileSystemService.getDirectoryContents('.');
      console.log('Root nodes received:', rootNodes);
      const convertedNodes = rootNodes.files.map(item => fileSystemService.convertToFileNode(item, new Set()));
      console.log('Converted nodes:', convertedNodes);
      setFiles(convertedNodes);
    } catch (error) {
      console.error('Error in refreshFileTree:', error);
    }
  }, []);

  useEffect(() => {
    refreshFileTree();
  }, [refreshFileTree]);

  const openFile = useCallback(async (file: IDEFileNode) => {
    console.log('openFile called with:', file);
    if (file.type !== 'file') {
      console.log('Not a file, returning');
      return;
    }
    const existing = tabs.find(t => t.path === file.path);
    if (existing) {
      console.log('Tab already exists, switching to:', existing.id);
      setActiveTabId(existing.id);
      localStorage.setItem('ide-active-tab', existing.id);
      return;
    }
    
    console.log('Loading file content for:', file.path);
    // Use existing content if available (e.g., from terminal workspace)
    let content = file.content || '';
    
    if (!content) {
      // Load file content from the server if not already provided
      try {
        const response = await fetch('/api/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'read', path: file.path })
        });
        if (response.ok) {
          const fileData = await response.json();
          content = fileData.content;
          console.log('File content loaded successfully from API, length:', content.length);
        } else {
          console.warn('Failed to load file content from API, using fallback');
          content = seedContentForPath(file.path);
        }
      } catch (error) {
        console.error('Error loading file content from API:', error);
        content = seedContentForPath(file.path);
      }
    } else {
      console.log('Using provided file content, length:', content.length);
    }
    
    const id = file.path;
    const newTab: IDETab = {
      id,
      name: file.name,
      path: file.path,
      content,
      language: languageFromPath(file.path),
      isDirty: false,
    };
    console.log('Creating new tab:', newTab);
    const nextTabs = [...tabs, newTab];
    setTabs(nextTabs);
    setActiveTabId(id);
    persist(nextTabs, id);
    console.log('Tab created and set as active. Total tabs:', nextTabs.length);
  }, [persist, tabs]);

  const setActiveTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
    localStorage.setItem('ide-active-tab', tabId);
  }, []);

  const updateActiveContent = useCallback((next: string) => {
    if (!activeTab) return;
    const nextTabs = tabs.map(t => t.id === activeTab.id ? { ...t, content: next, isDirty: true } : t);
    setTabs(nextTabs);
    persist(nextTabs, activeTab.id);
  }, [activeTab, persist, tabs]);

  const closeTab = useCallback((tabId: string) => {
    const index = tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;
    const nextTabs = tabs.filter(t => t.id !== tabId);
    let nextActive = activeTabId;
    if (activeTabId === tabId) {
      const fallback = nextTabs[index] || nextTabs[index - 1];
      nextActive = fallback?.id;
    }
    setTabs(nextTabs);
    setActiveTabId(nextActive);
    persist(nextTabs, nextActive);
  }, [activeTabId, persist, tabs]);

  const saveTab = useCallback(async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'write',
          path: tab.path,
          content: tab.content
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('File saved successfully:', result.message);
        
        // Mark tab as clean (not dirty)
        const nextTabs = tabs.map(t => t.id === tabId ? { ...t, isDirty: false } : t);
        setTabs(nextTabs);
        persist(nextTabs, activeTabId);
      } else {
        const error = await response.json();
        console.error('Failed to save file:', error.error);
        alert(`Failed to save file: ${error.error}`);
      }
    } catch (error) {
      console.error('Error saving file:', error);
      alert('Failed to save file. Please check the console for details.');
    }
  }, [tabs, activeTabId, persist]);

  const saveAll = useCallback(async () => {
    const dirtyTabs = tabs.filter(t => t.isDirty);
    
    try {
      // Save all dirty tabs
      await Promise.all(dirtyTabs.map(async (tab) => {
        const response = await fetch('/api/files', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'write',
            path: tab.path,
            content: tab.content
          })
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Failed to save ${tab.name}: ${error.error}`);
        }
      }));
      
      console.log(`Saved ${dirtyTabs.length} files successfully`);
      
      // Mark all tabs as clean
      const nextTabs = tabs.map(t => ({ ...t, isDirty: false }));
      setTabs(nextTabs);
      persist(nextTabs, activeTabId);
    } catch (error) {
      console.error('Error saving files:', error);
      alert(`Failed to save some files: ${error.message}`);
    }
  }, [tabs, activeTabId, persist]);

  const createFile = useCallback(async (parentNode?: IDEFileNode) => {
    const fileName = prompt("Enter the new file's name:");
    if (fileName) {
      const parentPath = parentNode && parentNode.type === 'folder' ? parentNode.path : '.';
      const newPath = path.join(parentPath, fileName);
      try {
        await fileSystemService.createFileOrFolder(newPath, 'file');
        await refreshFileTree();
      } catch (error) {
        console.error('Failed to create file:', error);
      }
    }
  }, [refreshFileTree]);

  const createFolder = useCallback(async (parentNode?: IDEFileNode) => {
    const folderName = prompt("Enter the new folder's name:");
    if (folderName) {
      const parentPath = parentNode && parentNode.type === 'folder' ? parentNode.path : '.';
      const newPath = path.join(parentPath, folderName);
      try {
        await fileSystemService.createFileOrFolder(newPath, 'folder');
        await refreshFileTree();
      } catch (error) {
        console.error('Failed to create folder:', error);
      }
    }
  }, [refreshFileTree]);

  const renameNode = useCallback(async (node: IDEFileNode, newName: string) => {
    try {
      const newPath = path.join(path.dirname(node.path), newName);
      await fileSystemService.renameFileOrFolder(node.path, newPath);
      await refreshFileTree();
    } catch (error) {
      console.error('Failed to rename:', error);
    }
  }, [refreshFileTree]);

  const deleteNode = useCallback(async (node: IDEFileNode) => {
    if (confirm(`Are you sure you want to delete ${node.name}?`)) {
      try {
        await fileSystemService.deleteFileOrFolder(node.path);
        await refreshFileTree();
      } catch (error) {
        console.error('Failed to delete:', error);
      }
    }
  }, [refreshFileTree]);

  const triggerEditorAction = useCallback((actionId: string) => {
    editorRef.current?.trigger('TopBar', actionId, null);
  }, []);

  const createUntitledTab = () => {
    const existingUntitled = tabs.filter(t => t.name.startsWith('Untitled'));
    const nextIndex = existingUntitled.length + 1;
    const name = `Untitled-${nextIndex}.txt`;
    const id = name;
    const newTab: IDETab = {
      id,
      name,
      path: name,
      content: '',
      language: 'text',
      isDirty: true,
    };
    const nextTabs = [...tabs, newTab];
    setTabs(nextTabs);
    setActiveTabId(id);
    persist(nextTabs, id);
  };

  const importRepository = useCallback(async (repoUrl: string, targetPath?: string) => {
    const response = await fetch('/api/git/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl, targetPath }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(String(data?.error || 'Failed to import repository'));
    }
    await refreshFileTree();
    return { action: String(data?.action || 'imported'), path: String(data?.path || '') };
  }, [refreshFileTree]);

  const value: IDEState = {
    files,
    tabs,
    activeTabId,
    activeTab,
    editorRef,
    openFile,
    setActiveTab,
    updateActiveContent,
    closeTab,
    saveTab,
    saveAll,
    pickAndOpenFile: async () => {
      try {
        // @ts-expect-error File System Access API
        const [handle] = await window.showOpenFilePicker?.({ multiple: false }) ?? [];
        if (!handle) return;
        const file = await handle.getFile();
        const text = await file.text();
        const path = file.name; // Browser cannot provide real path; use name
        const newTab: IDETab = {
          id: path,
          name: file.name,
          path,
          content: text,
          language: languageFromPath(file.name),
          isDirty: false,
        };
        const existing = tabs.find(t => t.id === newTab.id);
        const nextTabs = existing ? tabs.map(t => t.id === newTab.id ? newTab : t) : [...tabs, newTab];
        setTabs(nextTabs);
        setActiveTabId(newTab.id);
        persist(nextTabs, newTab.id);
        // attach handle map
        const browserWindow = window as WindowWithFileHandles;
        browserWindow.__fileHandles = { ...browserWindow.__fileHandles, [newTab.id]: handle };
      } catch (e) {
        console.debug('File open was cancelled or blocked', e);
      }
    },
    saveActiveToDisk: async () => {
      if (!activeTab) return;
      try {
        const browserWindow = window as WindowWithFileHandles;
        const handleMap = browserWindow.__fileHandles || {};
        let handle = handleMap[activeTab.id];
        if (!handle) {
          // @ts-expect-error File System Access API
          handle = await window.showSaveFilePicker?.({ suggestedName: activeTab.name });
          if (!handle) return;
          browserWindow.__fileHandles = { ...handleMap, [activeTab.id]: handle };
        }
        const writable = await handle.createWritable();
        await writable.write(activeTab.content);
        await writable.close();
        saveTab(activeTab.id);
      } catch (e) {
        console.debug('File save was cancelled or blocked', e);
      }
    },
    createFile,
    createFolder,
    renameNode,
    deleteNode,
    createUntitledTab,
    triggerEditorAction,
    refreshFileTree,
    loadNodeChildren,
    importRepository,
  };

  return <IDEContext.Provider value={value}>{children}</IDEContext.Provider>;
};

// 4. HOOK (Exported)
export const useIDE = (): IDEState => {
  const ctx = useContext(IDEContext);
  if (!ctx) throw new Error('useIDE must be used within a IDEProvider');
  return ctx;
};

  const seedContentForPath = (filePath: string): string => {
    // Provide some default content based on file type
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      return '// TypeScript file\nconsole.log("Hello, TypeScript!");';
    }
    if (filePath.endsWith('.jsx') || filePath.endsWith('.js')) {
      return '// JavaScript file\nconsole.log("Hello, JavaScript!");';
    }
    if (filePath.endsWith('.css')) {
      return '/* CSS file */\nbody {\n  margin: 0;\n  padding: 0;\n}';
    }
    if (filePath.endsWith('.html')) {
      return '<!DOCTYPE html>\n<html>\n<head>\n  <title>HTML File</title>\n</head>\n<body>\n  <h1>Hello, HTML!</h1>\n</body>\n</html>';
    }
    if (filePath.endsWith('.json')) {
      return '{\n  "name": "example",\n  "version": "1.0.0"\n}';
    }
    return '// Text file\nHello, World!';
  };

  const languageFromPath = (filePath: string): string => {
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) return 'typescript';
    if (filePath.endsWith('.jsx') || filePath.endsWith('.js')) return 'javascript';
    if (filePath.endsWith('.css')) return 'css';
    if (filePath.endsWith('.html')) return 'html';
    if (filePath.endsWith('.json')) return 'json';
    return 'text';
  };
