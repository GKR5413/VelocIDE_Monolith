export interface FileSystemItem {
  name: string;
  type: 'file' | 'folder';
  path: string;
  fullPath: string;
  size: number;
  modified: string;
  hidden: boolean;
}

export interface DirectoryResponse {
  path: string;
  fullPath: string;
  relativePath: string;
  files: FileSystemItem[];
}

export interface FileContentResponse {
  path: string;
  fullPath: string;
  relativePath: string;
  content: string;
  size: number;
  modified: string;
}

class FileSystemService {
  private baseUrl = ''; // Use relative paths for monolith
  private osInfo: any = null;
  
  constructor() {
    this.detectOS();
  }

  private detectOS() {
    const userAgent = navigator.userAgent;
    let platform = 'unknown';
    let version = 'Unknown';
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isTablet = /iPad|Android(?=.*Tablet)|Tablet/i.test(userAgent);

    if (/Windows NT/i.test(userAgent)) {
      platform = 'windows';
      const match = userAgent.match(/Windows NT ([\d.]+)/);
      if (match) {
        const ntVersion = parseFloat(match[1]);
        if (ntVersion >= 10.0) version = '10/11';
        else if (ntVersion >= 6.3) version = '8.1';
        else version = 'Older Windows';
      }
    } else if (/Macintosh|Mac OS X/i.test(userAgent)) {
      platform = 'macos';
      const match = userAgent.match(/Mac OS X ([\d_]+)/);
      if (match) version = match[1].replace(/_/g, '.');
    } else if (/Linux/i.test(userAgent) && !/Android/i.test(userAgent)) {
      platform = 'linux';
    } else if (/Android/i.test(userAgent)) {
      platform = 'android';
      const match = userAgent.match(/Android ([\d.]+)/);
      if (match) version = match[1];
    } else if (/iPhone|iPad|iPod/i.test(userAgent)) {
      platform = 'ios';
      const match = userAgent.match(/OS ([\d_]+)/);
      if (match) version = match[1].replace(/_/g, '.');
    }

    this.osInfo = { platform, version, userAgent, isMobile, isTablet };
  }

  getOSInfo() {
    return this.osInfo;
  }

  async getDirectoryContents(path: string = '.'): Promise<DirectoryResponse> {
    // Return mock directory structure for UI demonstration
    return this.getFallbackDirectoryContents(path);
  }

  private async getFallbackDirectoryContents(path: string): Promise<DirectoryResponse> {
    const files: FileSystemItem[] = [
      { name: 'src', type: 'folder', path: 'src', fullPath: '/src', size: 0, modified: new Date().toISOString(), hidden: false },
      { name: 'components', type: 'folder', path: 'src/components', fullPath: '/src/components', size: 0, modified: new Date().toISOString(), hidden: false },
      { name: 'App.tsx', type: 'file', path: 'src/App.tsx', fullPath: '/src/App.tsx', size: 1024, modified: new Date().toISOString(), hidden: false },
      { name: 'main.tsx', type: 'file', path: 'src/main.tsx', fullPath: '/src/main.tsx', size: 512, modified: new Date().toISOString(), hidden: false },
      { name: 'index.css', type: 'file', path: 'src/index.css', fullPath: '/src/index.css', size: 256, modified: new Date().toISOString(), hidden: false },
    ];
    
    return {
      path,
      fullPath: path,
      relativePath: path,
      files
    };
  }

  async getFileContent(path: string): Promise<FileContentResponse> {
    return {
      path,
      fullPath: path,
      relativePath: path,
      content: "// This is mock content for " + path + "\nconsole.log('UI Only Mode');",
      size: 100,
      modified: new Date().toISOString()
    };
  }

  // Convert FileSystemItem to the format expected by FileExplorer
  convertToFileNode(item: FileSystemItem, expanded: Set<string>): any {
    return {
      id: item.path || item.name,
      name: item.name,
      type: item.type === 'directory' ? 'folder' : 'file',
      path: item.path,
      fullPath: item.fullPath || item.path,
      size: item.size || 0,
      modified: item.modified || new Date().toISOString(),
      hidden: item.hidden || false,
      expanded: item.type === 'directory' ? expanded.has(item.path || item.name) : undefined,
      children: item.type === 'directory' ? [] : undefined
    };
  }

  async createFileOrFolder(path: string, type: 'file' | 'folder'): Promise<any> {
    console.log('Mock: Created ' + type + ' at ' + path);
    return { success: true };
  }

  async renameFileOrFolder(oldPath: string, newPath: string): Promise<any> {
    console.log('Mock: Renamed ' + oldPath + ' to ' + newPath);
    return { success: true };
  }

  async deleteFileOrFolder(path: string): Promise<any> {
    console.log('Mock: Deleted ' + path);
    return { success: true };
  }

  async moveFileOrFolder(source: string, destination: string): Promise<any> {
    console.log('Mock: Moved ' + source + ' to ' + destination);
    return { success: true };
  }

  // Browser File API methods for cross-platform support
  async promptForNewFileName(parentPath: string): Promise<string | null> {
    return prompt('Enter new file name:');
  }

  async promptForNewFolderName(parentPath: string): Promise<string | null> {
    return prompt('Enter new folder name:');
  }

  async confirmDelete(path: string): Promise<boolean> {
    return confirm(`Are you sure you want to delete "${path}"?`);
  }

  async moveNode(source: any, target: any): Promise<void> {
    return this.moveFileOrFolder(source.path, target.path);
  }

  async copyPath(path: string): Promise<void> {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(path);
    }
  }

  async copyRelativePath(path: string): Promise<void> {
    const relativePath = path.startsWith('/') ? path.substring(1) : path;
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(relativePath);
    }
  }

  async revealInExplorer(path: string): Promise<void> {
    // Platform-specific reveal logic
    switch (this.osInfo?.platform) {
      case 'windows':
        // Windows Explorer
        console.log(`Would open Windows Explorer at: ${path}`);
        break;
      case 'macos':
        // macOS Finder
        console.log(`Would open Finder at: ${path}`);
        break;
      case 'linux':
        // Linux file manager
        console.log(`Would open file manager at: ${path}`);
        break;
      default:
        console.log(`Path: ${path}`);
    }
  }

  async openGitChanges(path: string): Promise<void> {
    console.log(`Would show git changes for: ${path}`);
  }

  async discardChanges(path: string): Promise<void> {
    console.log(`Would discard git changes for: ${path}`);
  }

  async copyNode(source: any, target: any): Promise<void> {
    console.log(`Would copy ${source.path} to ${target.path}`);
  }

  async cutNode(source: any, target: any): Promise<void> {
    console.log(`Would cut ${source.path} to ${target.path}`);
  }

  async pasteNode(target: any): Promise<void> {
    console.log(`Would paste to ${target.path}`);
  }

  // File System Access API methods for modern browsers
  async requestDirectoryAccess(): Promise<FileSystemDirectoryHandle | null> {
    try {
      if ('showDirectoryPicker' in window) {
        // @ts-ignore - showDirectoryPicker is not in TypeScript types yet
        return await window.showDirectoryPicker();
      }
    } catch (error) {
      console.log('Directory access denied or not supported');
    }
    return null;
  }

  async requestFileAccess(): Promise<FileSystemFileHandle | null> {
    try {
      if ('showOpenFilePicker' in window) {
        // @ts-ignore - showOpenFilePicker is not in TypeScript types yet
        const [fileHandle] = await window.showOpenFilePicker();
        return fileHandle;
      }
    } catch (error) {
      console.log('File access denied or not supported');
    }
    return null;
  }

  // Mobile-specific file access
  async requestMobileFileAccess(): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.onchange = (e) => {
        const files = Array.from((e.target as HTMLInputElement).files || []);
        resolve(files);
      };
      input.click();
    });
  }

  async requestMobileDirectoryAccess(): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      // @ts-ignore - webkitdirectory is not in types
      input.webkitdirectory = true;
      input.multiple = true;
      input.onchange = (e) => {
        const files = Array.from((e.target as HTMLInputElement).files || []);
        resolve(files);
      };
      input.click();
    });
  }

  // Check if File System Access API is supported
  isFileSystemAccessSupported(): boolean {
    return 'showDirectoryPicker' in window && 'showOpenFilePicker' in window;
  }

  // Get platform-specific path separator
  getPathSeparator(): string {
    switch (this.osInfo?.platform) {
      case 'windows':
        return '\\';
      default:
        return '/';
    }
  }

  // Normalize path based on platform
  normalizePath(path: string): string {
    const separator = this.getPathSeparator();
    return path.replace(/[\/\\]/g, separator);
  }
}

export const fileSystemService = new FileSystemService();