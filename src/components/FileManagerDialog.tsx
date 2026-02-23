import React, { useEffect, useMemo, useState } from 'react';
import { Folder, FolderOpen, File, X, ArrowLeft, Home, Plus } from 'lucide-react';
import { fileSystemService } from '@/services/fileSystemService';
import { IDEFileNode } from '@/contexts/IDEContext';
import { Button } from '@/components/ui/button';

type FileManagerMode = 'open-file' | 'open-folder' | 'create-folder';

interface FileManagerDialogProps {
  isOpen: boolean;
  mode: FileManagerMode;
  onClose: () => void;
  onOpenFile: (file: IDEFileNode) => Promise<void>;
  onOpenFolder: (folderPath: string) => Promise<void>;
  onCreateFolder: (parentPath: string, folderName: string) => Promise<void>;
}

const DEFAULT_ROOT = '@workspace';

export const FileManagerDialog: React.FC<FileManagerDialogProps> = ({
  isOpen,
  mode,
  onClose,
  onOpenFile,
  onOpenFolder,
  onCreateFolder,
}) => {
  const [currentPath, setCurrentPath] = useState<string>(DEFAULT_ROOT);
  const [items, setItems] = useState<IDEFileNode[]>([]);
  const [selected, setSelected] = useState<IDEFileNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [error, setError] = useState('');

  const title = useMemo(() => {
    if (mode === 'open-file') return 'Open File';
    if (mode === 'open-folder') return 'Open Folder';
    return 'Create Folder';
  }, [mode]);

  const loadPath = async (path: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fileSystemService.getDirectoryContents(path);
      setItems(response.files.map((item) => fileSystemService.convertToFileNode(item, new Set())));
      setCurrentPath(path);
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    void loadPath(DEFAULT_ROOT);
    if (mode === 'create-folder') {
      setFolderName('');
    }
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const goUp = () => {
    if (currentPath === DEFAULT_ROOT) return;
    const parts = currentPath.split('/');
    if (parts.length <= 2) {
      void loadPath(DEFAULT_ROOT);
      return;
    }
    const parent = parts.slice(0, -1).join('/');
    void loadPath(parent || DEFAULT_ROOT);
  };

  const onItemClick = (item: IDEFileNode) => {
    setSelected(item);
    if (item.type === 'folder') {
      return;
    }
    if (mode === 'open-file') {
      void onOpenFile(item).then(onClose);
    }
  };

  const onItemDoubleClick = (item: IDEFileNode) => {
    if (item.type === 'folder') {
      void loadPath(item.path);
      return;
    }
    if (mode === 'open-file') {
      void onOpenFile(item).then(onClose);
    }
  };

  const confirmAction = async () => {
    setError('');
    try {
      if (mode === 'open-file') {
        if (!selected || selected.type !== 'file') {
          setError('Select a file first.');
          return;
        }
        await onOpenFile(selected);
      } else if (mode === 'open-folder') {
        const folderPath = selected?.type === 'folder' ? selected.path : currentPath;
        await onOpenFolder(folderPath);
      } else {
        const parentPath = selected?.type === 'folder' ? selected.path : currentPath;
        const name = folderName.trim();
        if (!name) {
          setError('Folder name is required.');
          return;
        }
        await onCreateFolder(parentPath, name);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl h-[70vh] rounded-lg border border-ide-panel-border bg-md-surface shadow-2xl flex flex-col">
        <div className="h-12 px-4 border-b border-ide-panel-border flex items-center justify-between">
          <div className="font-semibold text-sm">{title}</div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div className="h-12 px-3 border-b border-ide-panel-border flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => void loadPath(DEFAULT_ROOT)} title="Workspace root">
            <Home size={16} />
          </Button>
          <Button variant="ghost" size="icon" onClick={goUp} title="Parent folder">
            <ArrowLeft size={16} />
          </Button>
          <div className="text-xs font-mono text-muted-foreground truncate">{currentPath}</div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading...</div>
          ) : (
            <div className="divide-y divide-ide-panel-border">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onItemClick(item)}
                  onDoubleClick={() => onItemDoubleClick(item)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-md-surface-variant ${
                    selected?.id === item.id ? 'bg-md-surface-variant' : ''
                  }`}
                >
                  {item.type === 'folder' ? (
                    selected?.id === item.id ? <FolderOpen size={16} /> : <Folder size={16} />
                  ) : (
                    <File size={16} />
                  )}
                  <span className="text-sm truncate">{item.name}</span>
                </button>
              ))}
              {!items.length && <div className="px-3 py-4 text-sm text-muted-foreground">No files or folders</div>}
            </div>
          )}
        </div>

        {mode === 'create-folder' && (
          <div className="p-3 border-t border-ide-panel-border flex items-center gap-2">
            <Plus size={16} />
            <input
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="New folder name"
              className="flex-1 bg-transparent border border-ide-panel-border rounded px-2 py-1 text-sm outline-none"
            />
          </div>
        )}

        {error && <div className="px-3 py-2 text-xs text-red-500 border-t border-ide-panel-border">{error}</div>}

        <div className="h-12 px-3 border-t border-ide-panel-border flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void confirmAction()}>
            {mode === 'open-file' ? 'Open File' : mode === 'open-folder' ? 'Open Folder' : 'Create Folder'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FileManagerDialog;
