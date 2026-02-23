import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { File, Folder, FolderOpen, RotateCcw } from 'lucide-react';
import path from 'path-browserify';
import { IDEFileNode, useIDE } from '@/contexts/IDEContext';
import { fileSystemService } from '@/services/fileSystemService';
import { toast } from '@/hooks/use-toast';

type ClipboardState = {
  node: IDEFileNode;
  mode: 'copy' | 'cut';
} | null;

type MenuAction =
  | 'open'
  | 'newFile'
  | 'newFolder'
  | 'rename'
  | 'delete'
  | 'copy'
  | 'cut'
  | 'paste';

type MenuItem = {
  key: MenuAction;
  label: string;
  disabled?: boolean;
};

type ContextMenuState = {
  x: number;
  y: number;
  node: IDEFileNode | null;
} | null;

const PROTECTED_ROOTS = new Set(['@workspace', '@home']);

const isProtected = (node: IDEFileNode | null) => !!node && PROTECTED_ROOTS.has(node.path);

const buildCopyName = (name: string) => {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name}-copy`;
  return `${name.slice(0, dot)}-copy${name.slice(dot)}`;
};

interface NodeRowProps {
  node: IDEFileNode;
  level: number;
  selectedId?: string;
  expandedNodes: Set<string>;
  onSelect: (node: IDEFileNode) => void;
  onToggle: (node: IDEFileNode) => void;
  onContextMenu: (event: React.MouseEvent, node: IDEFileNode) => void;
}

const NodeRow: React.FC<NodeRowProps> = ({
  node,
  level,
  selectedId,
  expandedNodes,
  onSelect,
  onToggle,
  onContextMenu,
}) => {
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedId === node.id;
  const indent = level * 14;

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-[#2a2d2e] ${
          isSelected ? 'bg-blue-100 dark:bg-[#37373d]' : ''
        }`}
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={() => {
          onSelect(node);
          if (node.type === 'folder') onToggle(node);
        }}
        onContextMenu={(event) => onContextMenu(event, node)}
      >
        {node.type === 'folder' ? (
          isExpanded ? <FolderOpen className="w-4 h-4 text-blue-400" /> : <Folder className="w-4 h-4 text-blue-400" />
        ) : (
          <File className="w-4 h-4 text-gray-400" />
        )}
        <span className="truncate">{node.name}</span>
      </div>
      {node.type === 'folder' &&
        isExpanded &&
        node.children?.map((child) => (
          <NodeRow
            key={child.id}
            node={child}
            level={level + 1}
            selectedId={selectedId}
            expandedNodes={expandedNodes}
            onSelect={onSelect}
            onToggle={onToggle}
            onContextMenu={onContextMenu}
          />
        ))}
    </div>
  );
};

const FileExplorer: React.FC = () => {
  const { files, openFile, createFile, createFolder, renameNode, deleteNode, refreshFileTree, loadNodeChildren } = useIDE();
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['@workspace']));
  const [selectedId, setSelectedId] = useState<string>();
  const [menu, setMenu] = useState<ContextMenuState>(null);
  const [clipboard, setClipboard] = useState<ClipboardState>(null);

  const selectedNode = useMemo(
    () => (menu?.node ? menu.node : files.find((f) => f.id === selectedId) || null),
    [files, menu?.node, selectedId]
  );

  useEffect(() => {
    void refreshFileTree();
  }, [refreshFileTree]);

  useEffect(() => {
    const closeMenu = () => setMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const findNodeById = useCallback((nodes: IDEFileNode[], nodeId: string): IDEFileNode | null => {
    for (const node of nodes) {
      if (node.id === nodeId) return node;
      if (node.children?.length) {
        const found = findNodeById(node.children, nodeId);
        if (found) return found;
      }
    }
    return null;
  }, []);

  const syncExpandedFolders = useCallback(async () => {
    const expandedIds = Array.from(expanded);
    for (const folderId of expandedIds) {
      const folderNode = findNodeById(files, folderId);
      if (folderNode && folderNode.type === 'folder') {
        await loadNodeChildren(folderNode);
      }
    }
  }, [expanded, files, findNodeById, loadNodeChildren]);

  useEffect(() => {
    void syncExpandedFolders();
    // We intentionally sync immediately when expand/collapse changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void refreshFileTree();
      void syncExpandedFolders();
    }, 1500);
    return () => window.clearInterval(interval);
  }, [refreshFileTree, syncExpandedFolders]);

  const toggleFolder = useCallback(
    async (node: IDEFileNode) => {
      if (node.type !== 'folder') return;
      const next = new Set(expanded);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      setExpanded(next);
      if (!node.children || node.children.length === 0) {
        await loadNodeChildren(node);
      }
    },
    [expanded, loadNodeChildren]
  );

  const openContextMenu = (event: React.MouseEvent, node: IDEFileNode | null) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, node });
  };

  const menuItems = useMemo(() => {
    const node = menu?.node;
    const protectedRoot = isProtected(node);
    const targetFolder = node?.type === 'folder';
    const canPaste = !!clipboard && (targetFolder || node === null);

    const common: MenuItem[] = [
      { key: 'newFile', label: 'New File', disabled: !!node && !targetFolder },
      { key: 'newFolder', label: 'New Folder', disabled: !!node && !targetFolder },
      { key: 'paste', label: clipboard?.mode === 'cut' ? 'Paste (Move)' : 'Paste', disabled: !canPaste },
    ];

    if (!node) return common;

    if (node.type === 'file') {
      return [
        { key: 'open', label: 'Open' },
        { key: 'copy', label: 'Copy' },
        { key: 'cut', label: 'Move (Cut)' },
        { key: 'rename', label: 'Rename' },
        { key: 'delete', label: 'Delete' },
      ];
    }

    return [
      { key: 'newFile', label: 'New File' },
      { key: 'newFolder', label: 'New Folder' },
      { key: 'copy', label: 'Copy Folder' },
      { key: 'cut', label: 'Move Folder', disabled: protectedRoot },
      { key: 'paste', label: clipboard?.mode === 'cut' ? 'Paste (Move)' : 'Paste', disabled: !canPaste },
      { key: 'rename', label: 'Rename', disabled: protectedRoot },
      { key: 'delete', label: 'Delete', disabled: protectedRoot },
    ];
  }, [clipboard, menu?.node]);

  const getPasteTarget = (node: IDEFileNode | null) => {
    if (!node) return '@workspace';
    if (node.type === 'folder') return node.path;
    return path.dirname(node.path);
  };

  const handleAction = async (action: MenuAction) => {
    const node = menu?.node || null;
    setMenu(null);
    try {
      if (action === 'open' && node?.type === 'file') {
        await openFile(node);
        return;
      }
      if (action === 'newFile') {
        if (node?.type === 'folder') await createFile(node);
        else await createFile();
        return;
      }
      if (action === 'newFolder') {
        if (node?.type === 'folder') await createFolder(node);
        else await createFolder();
        return;
      }
      if (action === 'rename' && node) {
        if (isProtected(node)) return;
        const nextName = prompt('New name', node.name);
        if (!nextName?.trim()) return;
        await renameNode(node, nextName.trim());
        return;
      }
      if (action === 'delete' && node) {
        if (isProtected(node)) return;
        await deleteNode(node);
        return;
      }
      if (action === 'copy' && node) {
        setClipboard({ node, mode: 'copy' });
        toast({ title: 'Copied', description: node.path });
        return;
      }
      if (action === 'cut' && node) {
        if (isProtected(node)) return;
        setClipboard({ node, mode: 'cut' });
        toast({ title: 'Move queued', description: node.path });
        return;
      }
      if (action === 'paste' && clipboard) {
        const targetFolder = getPasteTarget(node);
        const source = clipboard.node;
        const targetName = clipboard.mode === 'copy' ? buildCopyName(source.name) : source.name;
        const destination = path.join(targetFolder, targetName);

        if (clipboard.mode === 'copy') {
          await fileSystemService.copyFileOrFolder(source.path, destination);
          toast({ title: 'Copied', description: `${source.path} -> ${destination}` });
        } else {
          await fileSystemService.moveFileOrFolder(source.path, destination);
          setClipboard(null);
          toast({ title: 'Moved', description: `${source.path} -> ${destination}` });
        }
        await refreshFileTree();
      }
    } catch (error) {
      toast({
        title: 'Operation failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#252526] text-gray-300" onContextMenu={(event) => openContextMenu(event, null)}>
      <div className="p-3 text-xs font-bold uppercase tracking-wider text-gray-500 flex justify-between items-center">
        <span>Explorer</span>
        <RotateCcw className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => void refreshFileTree()} />
      </div>

      <div className="flex-1 overflow-auto">
        {files.map((node) => (
          <NodeRow
            key={node.id}
            node={node}
            level={0}
            selectedId={selectedId}
            expandedNodes={expanded}
            onSelect={(next) => {
              setSelectedId(next.id);
              if (next.type === 'file') void openFile(next);
            }}
            onToggle={toggleFolder}
            onContextMenu={openContextMenu}
          />
        ))}
      </div>

      {menu && (
        <div
          className="fixed z-[90] min-w-[180px] rounded border border-ide-panel-border bg-background shadow-xl py-1"
          style={{ left: menu.x, top: menu.y }}
        >
          {menuItems.map((item) => (
            <button
              key={item.key}
              onClick={() => void handleAction(item.key)}
              disabled={item.disabled}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {item.label}
            </button>
          ))}
          {!menuItems.length && <div className="px-3 py-1.5 text-sm text-muted-foreground">No actions</div>}
        </div>
      )}

      {selectedNode && clipboard && (
        <div className="px-3 py-1 text-[11px] text-gray-400 border-t border-ide-panel-border">
          Clipboard: {clipboard.mode.toUpperCase()} {clipboard.node.path}
        </div>
      )}
    </div>
  );
};

export default FileExplorer;
