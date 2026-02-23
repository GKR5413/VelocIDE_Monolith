import React from 'react';
import { 
  Search, 
  GitBranch, 
  Settings, 
  Sun, 
  Moon,
  Command,
  ChevronDown,
  FolderOpen,
  SaveAll,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useTheme } from '@/contexts/ThemeContext';
import { useIDE } from '@/contexts/IDEContext';
import { toast } from '@/hooks/use-toast';
import FileManagerDialog from '@/components/FileManagerDialog';

type FileManagerMode = 'open-file' | 'open-folder' | 'create-folder';

export const TopBar: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { 
    activeTab, 
    saveAll, 
    saveActiveToDisk, 
    createFile,
    createFolderAtPath,
    openFile,
    openFolder,
    triggerEditorAction,
    importRepository,
    refreshFileTree,
  } = useIDE();
  const [fileManagerMode, setFileManagerMode] = React.useState<FileManagerMode | null>(null);

  const handleImportRepo = async () => {
    const repoUrl = window.prompt('Repository URL (https://... or git@...)');
    if (!repoUrl?.trim()) return;
    const targetPath = window.prompt('Target path under workspace (optional)', '') || undefined;
    try {
      const result = await importRepository(repoUrl.trim(), targetPath?.trim() || undefined);
      toast({
        title: 'Repository imported',
        description: `${result.action}: ${result.path}`,
      });
    } catch (error) {
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const dispatchTerminalAction = (action: 'new' | 'reconnect' | 'restart' | 'kill') => {
    window.dispatchEvent(new CustomEvent('velocide:terminal:action', { detail: { action } }));
  };

  const closeFileManager = () => setFileManagerMode(null);

  return (
    <>
      <header className="h-12 ide-panel border-b border-ide-panel-border flex items-center sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Left Section - Logo & Menu */}
      <div className="flex items-center gap-4 px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-md-primary to-md-accent rounded-lg flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <h1 className="md-title-medium text-md-primary font-semibold">VelocIDE</h1>
        </div>
        
        <nav className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-md-on-surface-variant hover:text-md-on-surface">
                File
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-64">
              <DropdownMenuItem onSelect={() => createFile()}>New File</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setFileManagerMode('create-folder')}>New Folder</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setFileManagerMode('open-file')}>Open File…</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setFileManagerMode('open-folder')}>Open Folder…</DropdownMenuItem>
              <DropdownMenuItem onSelect={handleImportRepo}>Import Repository…</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={saveActiveToDisk} disabled={!activeTab}>Save</DropdownMenuItem>
              <DropdownMenuItem onSelect={saveAll}>Save All</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-md-on-surface-variant hover:text-md-on-surface">
                Edit
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-64">
              <DropdownMenuItem onSelect={() => triggerEditorAction('editor.action.undo')}>Undo</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => triggerEditorAction('editor.action.redo')}>Redo</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => triggerEditorAction('editor.action.clipboardCutAction')}>Cut</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => triggerEditorAction('editor.action.clipboardCopyAction')}>Copy</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => triggerEditorAction('editor.action.clipboardPasteAction')}>Paste</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-md-on-surface-variant hover:text-md-on-surface">
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56">
              <DropdownMenuLabel>View</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => refreshFileTree()}>Refresh Explorer</DropdownMenuItem>
              <DropdownMenuItem onSelect={toggleTheme}>
                Switch to {theme === 'light' ? 'Dark' : 'Light'} Theme
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => triggerEditorAction('actions.find')}>Find in File</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-md-on-surface-variant hover:text-md-on-surface">
                Terminal
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-56">
              <DropdownMenuLabel>Terminal</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => dispatchTerminalAction('new')}>New Tab</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => dispatchTerminalAction('reconnect')}>Reconnect Active Tab</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => dispatchTerminalAction('restart')}>Restart Active Tab</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => dispatchTerminalAction('kill')}>Kill Active Tab</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-md-on-surface-variant hover:text-md-on-surface">
                Help
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-64">
              <DropdownMenuLabel>Help</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  toast({
                    title: 'Keyboard Shortcuts',
                    description: 'Ctrl/Cmd+S save, Ctrl+Shift+C copy terminal, Ctrl+Shift+V paste terminal.',
                  })
                }
              >
                Keyboard Shortcuts
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  toast({
                    title: 'VelocIDE',
                    description: 'Integrated editor, container terminal, and Gemini assistant in one workspace.',
                  })
                }
              >
                About VelocIDE
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>

      {/* Center Section - Breadcrumbs & Search */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="flex items-center gap-2 text-sm text-md-on-surface-variant">
          {activeTab ? (
            <>
              {activeTab.path.split('/').map((seg, idx, arr) => (
                <span key={idx} className={idx === arr.length - 1 ? 'text-md-on-surface font-medium' : ''}>
                  {idx > 0 && <span className="mx-1">/</span>}
                  {seg}
                </span>
              ))}
            </>
          ) : (
            <span className="text-md-on-surface-variant">No file selected</span>
          )}
        </div>
      </div>

      {/* Right Section - Actions */}
      <div className="flex items-center gap-2 px-4">
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-md-on-surface-variant hover:text-md-on-surface"
          title="Search everywhere (Ctrl+Shift+P)"
          onClick={() => triggerEditorAction('actions.find')}
        >
          <Command size={16} />
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          className="text-md-on-surface-variant hover:text-md-on-surface"
          onClick={() => setFileManagerMode('open-file')}
          title="Open File"
        >
          <FolderOpen size={16} />
        </Button>
        
        <Button variant="ghost" size="sm" className="text-md-on-surface-variant hover:text-md-on-surface" onClick={saveActiveToDisk} title="Save">
          <Search size={16} />
        </Button>
        
        <div className="w-px h-6 bg-ide-panel-border mx-1" />
        
        <Button
          variant="ghost"
          size="sm"
          className="text-md-on-surface-variant hover:text-md-on-surface"
          onClick={handleImportRepo}
          title="Import Repository"
        >
          <GitBranch size={16} />
          <span className="ml-1 text-sm">main</span>
          <ChevronDown size={12} className="ml-1" />
        </Button>
        
        <Button variant="outline" size="sm" className="text-md-primary border-md-primary hover:bg-md-primary-container" onClick={saveAll} title="Save All">
          <SaveAll size={14} className="mr-1" />
          Save all
        </Button>
        
        <div className="w-px h-6 bg-ide-panel-border mx-1" />
        
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-md-on-surface-variant hover:text-md-on-surface"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </Button>
        
        <Button variant="ghost" size="sm" className="text-md-on-surface-variant hover:text-md-on-surface">
          <Settings size={16} />
        </Button>

        <Button 
          variant="outline" 
          size="sm" 
          className="text-red-600 border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          onClick={async () => {
            try {
              await logout();
            } finally {
              navigate('/auth/login', { replace: true });
            }
          }}
        >
          Logout
        </Button>
      </div>
      </header>
      <FileManagerDialog
        isOpen={fileManagerMode !== null}
        mode={fileManagerMode || 'open-file'}
        onClose={closeFileManager}
        onOpenFile={openFile}
        onOpenFolder={async (folderPath) => {
          await openFolder(folderPath);
          toast({ title: 'Folder opened', description: folderPath });
        }}
        onCreateFolder={async (parentPath, folderName) => {
          await createFolderAtPath(parentPath, folderName);
          toast({ title: 'Folder created', description: `${parentPath}/${folderName}` });
        }}
      />
    </>
  );
};

export default TopBar;
