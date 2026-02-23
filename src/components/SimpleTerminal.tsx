import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface SimpleTerminalProps {
  className?: string;
}

export const SimpleTerminal: React.FC<SimpleTerminalProps> = ({ className }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal instance
    const terminal = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#ffffff',
        cursor: '#ffffff',
        selection: '#264f78'
      },
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace'
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Open terminal
    terminal.open(terminalRef.current);
    fitAddon.fit();

    // Connect to Docker terminal
    connectToDockerTerminal();

    // Handle terminal input (Local Echo Only)
    terminal.onData((data) => {
      if (data === '\r') {
        terminal.write('\r\n$ ');
      } else {
        terminal.write(data);
      }
    });

    // Handle resize
    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    // Initial message
    terminal.write('\x1b[32m✅ VelocIDE UI-Only Mode\x1b[0m\r\n');
    terminal.write('\x1b[33mTerminal commands are disabled in this demo.\x1b[0m\r\n');
    terminal.write('\r\n$ ');

    return () => {
      terminal.dispose();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const connectToDockerTerminal = async () => {
    // Disabled in UI mode
  };

  return (
    <div className={`simple-terminal ${className || ''}`}>
      <div 
        ref={terminalRef} 
        className="terminal-container"
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#1e1e1e',
          padding: '0',
          margin: '0'
        }}
      />
    </div>
  );
};

export default SimpleTerminal;
