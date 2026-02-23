import React, { useRef } from 'react';
import AIChat from '@/components/AIChat';
import TopBar from '@/components/TopBar';
import FileExplorer from '@/components/FileExplorer';
import CodeEditor from '@/components/CodeEditor';
import BottomContainerTerminal from '@/components/BottomContainerTerminal';
import ResizablePanel from '@/components/ResizablePanel';

export default function Index() {


  return (
    <div className="h-screen flex flex-col bg-md-surface">
      <TopBar />
      {/* Ensure content starts below sticky header height (h-12) */}
      <div className="flex-1 flex overflow-hidden">
        <ResizablePanel
          direction="vertical"
          minSize={200}
          maxSize={400}
          defaultSize={280}
          persistKey="fileExplorerWidth"
          className="border-r border-ide-panel-border"
        >
          <FileExplorer />
        </ResizablePanel>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 min-h-0">
            <CodeEditor />
          </div>
          <ResizablePanel
            direction="horizontal"
            resizeDirection="top"
            minSize={140}
            maxSize={420}
            defaultSize={220}
            persistKey="bottomTerminalHeight"
            className="border-t border-ide-panel-border"
          >
            <BottomContainerTerminal />
          </ResizablePanel>
        </div>

        <ResizablePanel
          direction="vertical"
          minSize={300}
          maxSize={600}
          defaultSize={400}
          persistKey="aiChatPanelWidth"
          className="border-l border-ide-panel-border"
        >
          <AIChat />
        </ResizablePanel>
      </div>
    </div>
  );
}
