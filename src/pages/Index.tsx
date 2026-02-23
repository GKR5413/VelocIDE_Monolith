import React, { Suspense } from 'react';
import TopBar from '@/components/TopBar';
import FileExplorer from '@/components/FileExplorer';
import ResizablePanel from '@/components/ResizablePanel';

const CodeEditor = React.lazy(() => import('@/components/CodeEditor'));
const BottomContainerTerminal = React.lazy(() => import('@/components/BottomContainerTerminal'));
const AIChat = React.lazy(() => import('@/components/AIChat'));

const PanelFallback: React.FC<{ label: string }> = ({ label }) => (
  <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground bg-md-surface">
    Loading {label}...
  </div>
);

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
            <Suspense fallback={<PanelFallback label="editor" />}>
              <CodeEditor />
            </Suspense>
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
            <Suspense fallback={<PanelFallback label="terminal" />}>
              <BottomContainerTerminal />
            </Suspense>
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
          <Suspense fallback={<PanelFallback label="assistant" />}>
            <AIChat />
          </Suspense>
        </ResizablePanel>
      </div>
    </div>
  );
}
