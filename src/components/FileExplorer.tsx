import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  File, 
  Folder, 
  FolderOpen,
  Pencil,
  Trash,
  FolderPlus,
  FilePlus,
  Copy,
  Scissors,
  Clipboard,
  ExternalLink,
  GitBranch,
  RotateCcw,
  Circle,
  X,
  Loader,
  Code2,
  Database,
  Image,
  Settings,
  FileText,
  Lock,
  Zap,
  Palette,
  Globe,
  Package,
  Terminal,
  Key,
  Archive,
  FileImage,
  Braces
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useIDE, IDEFileNode } from '@/contexts/IDEContext';
import { fileSystemService } from '@/services/fileSystemService';
import path from 'path-browserify';

interface ContextMenuProps {
  x: number;
  y: number;
  node: IDEFileNode;
  onClose: () => void;
  onAction: (action: string, node: IDEFileNode) => void;
}

type MenuItem =
  | { separator: true }
  | { icon: React.ComponentType<{ className?: string }>; label: string; action: string };

const MENU_ITEMS: MenuItem[] = [
  { icon: FilePlus, label: 'New File', action: 'newFile' },
  { icon: FolderPlus, label: 'New Folder', action: 'newFolder' },
  { separator: true },
  { icon: Pencil, label: 'Rename', action: 'rename' },
  { icon: Trash, label: 'Delete', action: 'delete' },
];

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, node, onClose, onAction }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="File context menu"
      className="fixed bg-white dark:bg-[#252526] border dark:border-[#454545] shadow-lg rounded py-1 z-50 min-w-[160px]"
      style={{ left: x, top: y }}
    >
      {MENU_ITEMS.map((item, index) => {
        if ('separator' in item) {
          return <div key={`sep-${index}`} className="h-px bg-gray-200 dark:bg-[#454545] my-1" aria-hidden />;
        }
        const { action, icon: Icon, label } = item;
        return (
          <div
            key={action}
            role="menuitem"
            tabIndex={0}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-blue-500 hover:text-white cursor-pointer text-sm"
            onClick={() => {
              onAction(action, node);
              onClose();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onAction(action, node);
                onClose();
              }
            }}
          >
            {Icon && <Icon className="w-4 h-4" />}
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
};

interface FileTreeNodeProps {
  node: IDEFileNode;
  level: number;
  onSelect: (node: IDEFileNode) => void;
  onToggle: (node: IDEFileNode) => void;
  selectedId?: string;
  expandedNodes: Set<string>;
}

const FileTreeNode: React.FC<FileTreeNodeProps> = ({ node, level, onSelect, onToggle, selectedId, expandedNodes }) => {
  const isExpanded = expandedNodes.has(node.id);
  const indent = level * 12;
  const isSelected = selectedId === node.id;

  const getIcon = () => {
    if (node.type === 'folder') return isExpanded ? <FolderOpen className="w-4 h-4 text-blue-400" /> : <Folder className="w-4 h-4 text-blue-400" />;
    return <File className="w-4 h-4 text-gray-400" />;
  };

  return (
    <div>
      <div 
        className={`flex items-center gap-2 py-1 px-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-[#2a2d2e] ${isSelected ? 'bg-blue-100 dark:bg-[#37373d]' : ''}`}
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={() => { onSelect(node); if(node.type === 'folder') onToggle(node); }}
      >
        {getIcon()}
        <span className="text-sm truncate">{node.name}</span>
      </div>
      {node.type === 'folder' && isExpanded && node.children?.map(child => (
        <FileTreeNode key={child.id} node={child} level={level + 1} onSelect={onSelect} onToggle={onToggle} selectedId={selectedId} expandedNodes={expandedNodes} />
      ))}
    </div>
  );
};

const FileExplorer: React.FC = () => {
  const { files, openFile, refreshFileTree, loadNodeChildren } = useIDE();
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['src']));
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const toggleFolder = useCallback(async (node: IDEFileNode) => {
    const next = new Set(expanded);
    if (next.has(node.id)) next.delete(node.id);
    else next.add(node.id);
    setExpanded(next);
    if (!node.children || node.children.length === 0) await loadNodeChildren(node);
  }, [expanded, loadNodeChildren]);

  useEffect(() => { refreshFileTree(); }, [refreshFileTree]);

  return (
    <div className="flex flex-col h-full bg-[#252526] text-gray-300">
      <div className="p-3 text-xs font-bold uppercase tracking-wider text-gray-500 flex justify-between items-center">
        <span>Explorer</span>
        <RotateCcw className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => refreshFileTree()} />
      </div>
      <div className="flex-1 overflow-auto">
        {files.map(node => (
          <FileTreeNode key={node.id} node={node} level={0} onSelect={(n) => { setSelectedId(n.id); if(n.type === 'file') openFile(n); }} onToggle={toggleFolder} selectedId={selectedId} expandedNodes={expanded} />
        ))}
      </div>
    </div>
  );
};

export default FileExplorer;
