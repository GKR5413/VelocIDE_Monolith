import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { toast } from '@/hooks/use-toast';
import '@xterm/xterm/css/xterm.css';

type TerminalTab = {
  id: string;
  title: string;
  cwd: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  history: string[];
};

const createTab = (index: number): TerminalTab => ({
  id: `tty-${Date.now()}-${index}`,
  title: `terminal-${index}`,
  cwd: '@workspace',
  status: 'connecting',
  history: [],
});

export const BottomContainerTerminal: React.FC = () => {
  const hostRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const suppressCloseRef = useRef(false);
  const currentInputRef = useRef('');
  const activeTabIdRef = useRef('');

  const [tabs, setTabs] = useState<TerminalTab[]>([createTab(1)]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0] || null;

  useEffect(() => {
    if (!activeTabId && tabs[0]) {
      setActiveTabId(tabs[0].id);
    }
  }, [activeTabId, tabs]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  const updateTab = (tabId: string, patch: Partial<TerminalTab>) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, ...patch } : t)));
  };

  const appendHistory = (tabId: string, command: string) => {
    const nextCommand = command.trim();
    if (!nextCommand) return;
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        const deduped = [nextCommand, ...tab.history.filter((item) => item !== nextCommand)];
        return { ...tab, history: deduped.slice(0, 30) };
      })
    );
  };

  const connectTab = (tab: TerminalTab, restart = false) => {
    if (!xtermRef.current) return;

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      suppressCloseRef.current = true;
      socketRef.current.send(JSON.stringify({ type: 'kill' }));
      socketRef.current.close();
    }

    updateTab(tab.id, { status: 'connecting' });
    xtermRef.current.clear();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/terminal`);
    socketRef.current = ws;
    const isActiveSocket = () => socketRef.current === ws;

    ws.onopen = () => {
      if (!isActiveSocket()) return;
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
      if (!isActiveSocket()) return;
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
          return;
        }
        if (payload.type === 'error') {
          updateTab(tab.id, { status: 'error' });
          const message = String(payload.message || 'unknown terminal error');
          toast({
            title: 'Terminal error',
            description: message,
            variant: 'destructive',
            duration: 2000,
          });
          return;
        }
        if (payload.type === 'exit') {
          updateTab(tab.id, { status: 'connecting' });
          setTimeout(() => {
            if (!isActiveSocket()) return;
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'create',
                  sessionId: tab.id,
                  cwd: '@workspace',
                  cols: xtermRef.current?.cols || 120,
                  rows: xtermRef.current?.rows || 28,
                  restart: true,
                })
              );
            } else {
              connectTab(tab, true);
            }
          }, 250);
        }
      } catch {
        if (!isActiveSocket()) return;
        xtermRef.current?.write(String(event.data || ''));
      }
    };

    ws.onclose = () => {
      if (!isActiveSocket()) return;
      if (suppressCloseRef.current) {
        suppressCloseRef.current = false;
        return;
      }
      updateTab(tab.id, { status: 'connecting' });
      setTimeout(() => connectTab(tab, false), 400);
    };

    ws.onerror = () => {
      if (!isActiveSocket()) return;
      updateTab(tab.id, { status: 'connecting' });
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
      if (activeTabIdRef.current) {
        if (data === '\r') {
          appendHistory(activeTabIdRef.current, currentInputRef.current);
          currentInputRef.current = '';
        } else if (data === '\u007f') {
          currentInputRef.current = currentInputRef.current.slice(0, -1);
        } else if (data.length === 1 && data >= ' ') {
          currentInputRef.current += data;
        }
      }
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
        suppressCloseRef.current = true;
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

  useEffect(() => {
    currentInputRef.current = '';
    setHistoryOpen(false);
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
        suppressCloseRef.current = true;
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
      suppressCloseRef.current = true;
      socketRef.current.send(JSON.stringify({ type: 'kill' }));
      socketRef.current.close();
    }
    if (activeTab) {
      updateTab(activeTab.id, { status: 'connecting' });
      setTimeout(() => connectTab(activeTab, true), 250);
    }
  };

  const runFromHistory = (command: string) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: 'Terminal',
        description: 'Terminal is reconnecting, try again.',
        variant: 'destructive',
        duration: 1200,
      });
      return;
    }
    socketRef.current.send(JSON.stringify({ type: 'input', data: `${command}\r` }));
    setHistoryOpen(false);
  };

  useEffect(() => {
    const onTerminalAction = (event: Event) => {
      const customEvent = event as CustomEvent<{ action?: 'new' | 'reconnect' | 'restart' | 'kill' }>;
      const action = customEvent.detail?.action;
      if (!action) return;
      if (action === 'new') {
        addTab();
        return;
      }
      if (action === 'reconnect') {
        reconnectActive();
        return;
      }
      if (action === 'restart') {
        restartActive();
        return;
      }
      if (action === 'kill') {
        killActive();
      }
    };

    window.addEventListener('velocide:terminal:action', onTerminalAction);
    return () => window.removeEventListener('velocide:terminal:action', onTerminalAction);
  });

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
          <div className="relative">
            <button
              onClick={() => setHistoryOpen((prev) => !prev)}
              className="px-2 py-1 rounded bg-[#161616] border border-[#333]"
            >
              History
            </button>
            {historyOpen && (
              <div className="absolute right-0 top-8 z-20 w-96 max-h-64 overflow-auto rounded border border-[#333] bg-[#121212] shadow-xl">
                {!activeTab?.history.length ? (
                  <div className="px-2 py-2 text-[11px] text-gray-400">No command history yet.</div>
                ) : (
                  activeTab.history.map((item, idx) => (
                    <button
                      key={`${item}-${idx}`}
                      onClick={() => runFromHistory(item)}
                      className="w-full text-left px-2 py-1.5 text-[11px] text-gray-200 hover:bg-[#1d1d1d] font-mono border-b border-[#222]"
                    >
                      {item}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button onClick={reconnectActive} className="px-2 py-1 rounded bg-[#161616] border border-[#333]">Reconnect</button>
          <button onClick={restartActive} className="px-2 py-1 rounded bg-[#161616] border border-[#333]">Restart</button>
          <button onClick={killActive} className="px-2 py-1 rounded bg-[#161616] border border-[#333]">Kill</button>
          <span className="ml-2 uppercase tracking-wide text-[10px] text-gray-400">
            connected {activeTab ? `| ${activeTab.cwd}` : ''}
          </span>
        </div>
      </div>
      <div ref={hostRef} className="flex-1 min-h-0" />
    </div>
  );
};

export default BottomContainerTerminal;
