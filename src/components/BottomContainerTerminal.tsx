import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

type TerminalTab = {
  id: string;
  title: string;
  cwd: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
};

const createTab = (index: number): TerminalTab => ({
  id: `tty-${Date.now()}-${index}`,
  title: `terminal-${index}`,
  cwd: '@workspace',
  status: 'connecting',
});

export const BottomContainerTerminal: React.FC = () => {
  const hostRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const [tabs, setTabs] = useState<TerminalTab[]>([createTab(1)]);
  const [activeTabId, setActiveTabId] = useState<string>('');

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0] || null;

  useEffect(() => {
    if (!activeTabId && tabs[0]) {
      setActiveTabId(tabs[0].id);
    }
  }, [activeTabId, tabs]);

  const updateTab = (tabId: string, patch: Partial<TerminalTab>) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, ...patch } : t)));
  };

  const connectTab = (tab: TerminalTab, restart = false) => {
    if (!xtermRef.current) return;

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'kill' }));
      socketRef.current.close();
    }

    updateTab(tab.id, { status: 'connecting' });
    xtermRef.current.clear();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/terminal`);
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'create',
          sessionId: tab.id,
          cwd: restart ? '@workspace' : tab.cwd,
          cols: xtermRef.current?.cols || 120,
          rows: xtermRef.current?.rows || 28,
          restart,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data || '{}'));
        if (payload.type === 'output') {
          xtermRef.current?.write(String(payload.data || ''));
          return;
        }
        if (payload.type === 'ready') {
          updateTab(tab.id, {
            status: 'connected',
            cwd: String(payload.cwd || tab.cwd || '@workspace'),
          });
          xtermRef.current?.writeln(`\r\n[connected: ${payload.cwd || '@workspace'}]\r`);
          return;
        }
        if (payload.type === 'error') {
          updateTab(tab.id, { status: 'error' });
          xtermRef.current?.writeln(`\r\n[error] ${payload.message || 'unknown'}\r`);
          return;
        }
        if (payload.type === 'exit') {
          updateTab(tab.id, { status: 'disconnected' });
          xtermRef.current?.writeln(`\r\n[shell exited: ${payload.exitCode}]\r`);
        }
      } catch {
        xtermRef.current?.write(String(event.data || ''));
      }
    };

    ws.onclose = () => {
      updateTab(tab.id, { status: 'disconnected' });
      xtermRef.current?.writeln('\r\n[terminal disconnected]\r');
    };

    ws.onerror = () => {
      updateTab(tab.id, { status: 'error' });
      xtermRef.current?.writeln('\r\n[terminal connection error]\r');
    };
  };

  useEffect(() => {
    if (!hostRef.current || xtermRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Ubuntu Mono", monospace',
      theme: {
        background: '#101010',
        foreground: '#d4d4d4',
        cursor: '#f5f5f5',
      },
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    fit.fit();

    term.attachCustomKeyEventHandler((event) => {
      const isCopy = event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'c';
      const isPaste = event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'v';
      if (isCopy) {
        const selection = term.getSelection();
        if (selection) void navigator.clipboard.writeText(selection);
        return false;
      }
      if (isPaste) {
        void navigator.clipboard.readText().then((text) => {
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: 'input', data: text }));
          }
        });
        return false;
      }
      return true;
    });

    xtermRef.current = term;
    fitRef.current = fit;

    term.onData((data) => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const onResize = () => {
      fit.fit();
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows })
        );
      }
    };

    window.addEventListener('resize', onResize);
    const observer = new ResizeObserver(() => onResize());
    observer.observe(hostRef.current);

    return () => {
      window.removeEventListener('resize', onResize);
      observer.disconnect();
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'kill' }));
        socketRef.current.close();
      }
      term.dispose();
      xtermRef.current = null;
      fitRef.current = null;
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!activeTab) return;
    if (!xtermRef.current) return;
    connectTab(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  const addTab = () => {
    setTabs((prev) => {
      const next = createTab(prev.length + 1);
      setActiveTabId(next.id);
      return [...prev, next];
    });
  };

  const closeTab = (tabId: string) => {
    setTabs((prev) => {
      if (prev.length === 1) return prev;
      const next = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId && next[0]) {
        setActiveTabId(next[0].id);
      }
      if (tabId === activeTabId && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'kill' }));
        socketRef.current.close();
      }
      return next;
    });
  };

  const reconnectActive = () => {
    if (!activeTab) return;
    connectTab(activeTab, false);
  };

  const restartActive = () => {
    if (!activeTab) return;
    connectTab(activeTab, true);
  };

  const killActive = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'kill' }));
      socketRef.current.close();
    }
    if (activeTab) updateTab(activeTab.id, { status: 'disconnected' });
  };

  return (
    <div className="h-full w-full flex flex-col bg-[#101010] border-t border-ide-panel-border">
      <div className="h-8 px-2 flex items-center justify-between border-b border-[#2a2a2a] text-xs text-gray-300 gap-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`px-2 py-1 rounded border ${activeTabId === tab.id ? 'bg-[#1f2937] border-[#3b82f6]' : 'bg-[#161616] border-[#333]'}`}
              title={`${tab.title} (${tab.cwd})`}
            >
              {tab.title}
            </button>
          ))}
          <button onClick={addTab} className="px-2 py-1 rounded bg-[#161616] border border-[#333]">+</button>
          {activeTab && tabs.length > 1 && (
            <button onClick={() => closeTab(activeTab.id)} className="px-2 py-1 rounded bg-[#161616] border border-[#333]">x</button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button onClick={reconnectActive} className="px-2 py-1 rounded bg-[#161616] border border-[#333]">Reconnect</button>
          <button onClick={restartActive} className="px-2 py-1 rounded bg-[#161616] border border-[#333]">Restart</button>
          <button onClick={killActive} className="px-2 py-1 rounded bg-[#161616] border border-[#333]">Kill</button>
          <span className="ml-2 uppercase tracking-wide text-[10px] text-gray-400">
            {activeTab?.status || 'disconnected'} {activeTab ? `| ${activeTab.cwd}` : ''}
          </span>
        </div>
      </div>
      <div ref={hostRef} className="flex-1 min-h-0" />
    </div>
  );
};

export default BottomContainerTerminal;
