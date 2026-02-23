import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export const BottomContainerTerminal: React.FC = () => {
  const hostRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef(`bottom-terminal-${Date.now()}`);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');

  useEffect(() => {
    if (!hostRef.current) return;

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

    xtermRef.current = term;
    fitRef.current = fit;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/terminal`);
    socketRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      ws.send(
        JSON.stringify({
          type: 'create',
          sessionId: sessionIdRef.current,
          cwd: '@workspace',
          cols: term.cols,
          rows: term.rows,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data || '{}'));
        if (payload.type === 'output') {
          term.write(String(payload.data || ''));
          return;
        }
        if (payload.type === 'ready') {
          term.writeln(`\r\n[container terminal connected: ${payload.cwd || '@workspace'}]\r`);
          return;
        }
        if (payload.type === 'error') {
          term.writeln(`\r\n[terminal error] ${payload.message || 'unknown error'}\r`);
          return;
        }
        if (payload.type === 'exit') {
          term.writeln(`\r\n[shell exited: ${payload.exitCode}]\r`);
        }
      } catch {
        term.write(String(event.data || ''));
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      term.writeln('\r\n[terminal disconnected]\r');
    };

    ws.onerror = () => {
      setStatus('error');
      term.writeln('\r\n[terminal connection error]\r');
    };

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

  return (
    <div className="h-full w-full flex flex-col bg-[#101010] border-t border-ide-panel-border">
      <div className="h-8 px-3 flex items-center justify-between border-b border-[#2a2a2a] text-xs uppercase tracking-wide text-gray-400">
        <span>Container Terminal</span>
        <span>
          {status === 'connected' && 'Connected'}
          {status === 'connecting' && 'Connecting'}
          {status === 'disconnected' && 'Disconnected'}
          {status === 'error' && 'Error'}
        </span>
      </div>
      <div ref={hostRef} className="flex-1 min-h-0" />
    </div>
  );
};

export default BottomContainerTerminal;
