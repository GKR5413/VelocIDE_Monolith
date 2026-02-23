import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Send, Bot, User, Copy, Sparkles, Trash2, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TerminalOutput {
  command: string;
  output: string;
  exitCode?: number;
  isRunning: boolean;
}

interface AgentToolResult {
  id?: string;
  tool: string;
  ok: boolean;
  args?: Record<string, unknown>;
  error?: string | null;
}

interface PendingApproval {
  token: string;
  command: string;
  reason: string;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  model?: string;
  terminalOutputs?: TerminalOutput[];
  toolResults?: AgentToolResult[];
  pendingApprovals?: PendingApproval[];
}

interface AgentHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

const models = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'gemini' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'gemini' },
];

export const AIChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedModel, setSelectedModel] = useState(models[0].value);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef(`ai-chat-session-${Date.now()}`);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const messageContentForAgent = useCallback((message: ChatMessage): string => {
    let content = message.content;
    if (message.terminalOutputs && message.terminalOutputs.length > 0) {
      content += '\n\n[Terminal Execution Results]:';
      message.terminalOutputs.forEach((term, idx) => {
        content += `\n\nCommand #${idx + 1}: ${term.command}`;
        content += `\nOutput:\n${term.output || ''}`;
        if (term.exitCode !== undefined) {
          content += `\nExit Code: ${term.exitCode}`;
        }
      });
    }
    if (message.toolResults && message.toolResults.length > 0) {
      content += '\n\n[Tool Results]:';
      message.toolResults.forEach((tool, idx) => {
        content += `\nTool #${idx + 1}: ${tool.tool}`;
        content += `\nStatus: ${tool.ok ? 'ok' : 'failed'}`;
        if (tool.error) {
          content += `\nError: ${tool.error}`;
        }
      });
    }
    return content;
  }, []);

  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    const currentModel = models.find((m) => m.value === selectedModel) || models[0];
    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const history: AgentHistoryMessage[] = messages.map((msg) => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: messageContentForAgent(msg),
      }));

      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: currentModel.provider,
          model: selectedModel,
          sessionId: sessionIdRef.current,
          messages: [...history, { role: 'user', content: inputValue }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Agent service error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const aiMessage: ChatMessage = {
        id: `${Date.now()}-ai`,
        type: 'ai',
        content: data?.content || 'No response generated.',
        timestamp: new Date(),
        model: currentModel.label,
        terminalOutputs: Array.isArray(data?.terminalOutputs) ? data.terminalOutputs : [],
        toolResults: Array.isArray(data?.toolResults) ? data.toolResults : [],
        pendingApprovals: Array.isArray(data?.pendingApprovals) ? data.pendingApprovals : [],
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: `${Date.now()}-err`,
        type: 'ai',
        content: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        model: currentModel.label,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, messageContentForAgent, messages, selectedModel]);

  const approveCommand = useCallback(async (token: string) => {
    if (isLoading) return;
    const currentModel = models.find((m) => m.value === selectedModel) || models[0];
    setIsLoading(true);
    try {
      const history: AgentHistoryMessage[] = messages.map((msg) => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: messageContentForAgent(msg),
      }));

      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: currentModel.provider,
          model: selectedModel,
          sessionId: sessionIdRef.current,
          approvals: [token],
          messages: history,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Agent service error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const aiMessage: ChatMessage = {
        id: `${Date.now()}-ai-approval`,
        type: 'ai',
        content: data?.content || 'No response generated.',
        timestamp: new Date(),
        model: currentModel.label,
        terminalOutputs: Array.isArray(data?.terminalOutputs) ? data.terminalOutputs : [],
        toolResults: Array.isArray(data?.toolResults) ? data.toolResults : [],
        pendingApprovals: Array.isArray(data?.pendingApprovals) ? data.pendingApprovals : [],
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: `${Date.now()}-approval-err`,
        type: 'ai',
        content: `Approval retry failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        model: currentModel.label,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messageContentForAgent, messages, selectedModel]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const clearConversation = () => {
    setMessages([]);
    sessionIdRef.current = `ai-chat-session-${Date.now()}`;
  };

  return (
    <div className="ai-chat-panel flex flex-col h-full">
      <div className="chat-header">
        <div className="chat-title">
          <Sparkles className="w-5 h-5" />
          <span>Assistant</span>
        </div>
        <div className="chat-controls">
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="model-selector h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model.value} value={model.value} className="py-2">
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="w-8 h-8 p-0" onClick={clearConversation} title="Clear">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="messages-container flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className={`message flex items-start gap-3 ${message.type === 'user' ? 'justify-end' : ''}`}>
            {message.type === 'ai' && <Bot className="w-5 h-5 mt-1 flex-shrink-0" />}
            <div className={`message-content rounded-lg px-3 py-2 max-w-lg ${message.type === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600'}`}>
              <p className="text-sm whitespace-pre-wrap break-words font-medium">{message.content}</p>

              {message.terminalOutputs && message.terminalOutputs.length > 0 && (
                <div className="mt-2 space-y-2">
                  {message.terminalOutputs.map((terminal, idx) => (
                    <div key={idx} className="bg-black text-green-400 p-2 rounded font-mono text-xs">
                      <div className="flex items-center gap-2 mb-1 text-gray-400">
                        <Terminal className="w-3 h-3" />
                        <span>$ {terminal.command}</span>
                        {terminal.isRunning && <span className="animate-pulse">Running...</span>}
                      </div>
                      {terminal.output && <pre className="whitespace-pre-wrap text-xs overflow-x-auto">{terminal.output}</pre>}
                      {!terminal.isRunning && terminal.exitCode !== undefined && (
                        <div className={`text-xs mt-1 ${terminal.exitCode === 0 ? 'text-green-500' : 'text-red-500'}`}>
                          Exit code: {terminal.exitCode}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {message.toolResults && message.toolResults.length > 0 && (
                <div className="mt-2 space-y-1">
                  {message.toolResults.map((tool, idx) => (
                    <div
                      key={`${tool.id || tool.tool}-${idx}`}
                      className={`text-xs rounded px-2 py-1 border ${
                        tool.ok
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-200'
                          : 'bg-red-50 border-red-300 text-red-800 dark:bg-red-950/40 dark:border-red-700 dark:text-red-200'
                      }`}
                    >
                      <span className="font-semibold">{tool.ok ? 'OK' : 'FAIL'}</span> {tool.tool}
                      {tool.error ? ` - ${tool.error}` : ''}
                    </div>
                  ))}
                </div>
              )}

              {message.pendingApprovals && message.pendingApprovals.length > 0 && (
                <div className="mt-2 space-y-2">
                  {message.pendingApprovals.map((approval, idx) => (
                    <div key={`${approval.token}-${idx}`} className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
                      <div className="font-semibold">Approval required</div>
                      <div className="font-mono mt-1">$ {approval.command}</div>
                      <div className="mt-1">{approval.reason}</div>
                      <Button
                        size="sm"
                        className="mt-2 h-7 px-2 text-xs"
                        onClick={() => approveCommand(approval.token)}
                        disabled={isLoading}
                      >
                        Allow once
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="message-actions text-xs mt-1 opacity-80 flex items-center gap-2">
                <span>{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {message.model && <span className="font-semibold">{message.model}</span>}
                {message.type === 'ai' && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyMessage(message.content)} title="Copy">
                    <Copy className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
            {message.type === 'user' && <User className="w-5 h-5 mt-1 flex-shrink-0" />}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container p-2 border-t">
        <div className="input-wrapper relative">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask anything..."
            className="chat-input w-full p-2 pr-12 rounded-md resize-none border"
            rows={1}
          />
          <Button
            onClick={sendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="send-button absolute right-2 top-1/2 -translate-y-1/2"
            size="icon"
            title="Send"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AIChat;
