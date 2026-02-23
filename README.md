# VelocIDE

VelocIDE - A modern, web-based integrated development environment with containerized terminal, Monaco code editor, and real-time file synchronization. Built with React, TypeScript, Docker, and WebSocket technology.

## ✨ Features

### 🎯 Core IDE Capabilities
- **Monaco Code Editor**: Full VS Code editor experience with syntax highlighting, IntelliSense, and multi-tab support
- **Containerized Terminal**: Isolated Docker-based terminal sessions with root permissions
- **File Explorer**: Tree-view navigation with real-time terminal workspace integration
- **Compiler Service**: Multi-language code execution in secure Docker containers
- **Resizable Panels**: Professional IDE layout with persistent panel sizing

### 🔄 Terminal-File Explorer Integration
- **Real-time Sync**: Files created/modified in terminal instantly appear in file explorer
- **Workspace Isolation**: Each terminal session gets its own containerized workspace
- **Bidirectional Navigation**: Browse files visually or via terminal commands
- **Session Management**: Connect file explorer to active terminal sessions with one click

### 🛡️ Security & Isolation
- **Docker Sandboxing**: All code execution happens in isolated containers
- **Session Isolation**: Each user gets separate workspace directories
- **Resource Limits**: Memory and CPU constraints on containers
- **Path Validation**: Secure file system access controls

## 🚀 Quick Start

### Frontend Monolith In Docker (Recommended)
Run the Web IDE monolith (frontend + `/api/files` + `/api/agent`) as a single container on localhost:

```bash
npm install
npm run docker:build
npm run docker:up
```

Open: `http://localhost:8080`

Useful commands:

```bash
npm run docker:logs
npm run docker:down
```

Environment variables:
- `GEMINI_API_KEY`: required for live Gemini responses from `/api/agent`
- `WORKSPACE_ROOT`: server-side sandbox root for file and command operations (default `/app/workspace` in Docker)

### Prerequisites
- **Node.js 18+** and npm
- **Docker** and Docker Compose
- **Git**

### Installation

#### Quick Setup with Authentication
```bash
# Clone the repository
git clone https://github.com/GKR5413/VelocIDE.git
cd VelocIDE

# Install main dependencies
npm install

# Setup authentication service
./setup-auth.sh

# Install compiler service dependencies
cd compiler-service && npm install && cd ..

# Build and start Docker services
docker-compose up --build

# Access VelocIDE at http://localhost:8080
```

#### Manual Setup
```bash
# Install auth service dependencies
cd auth-service && npm install && cd ..

# Copy environment configuration
cp auth-service/.env.example auth-service/.env

# Edit auth-service/.env with your GitHub OAuth credentials
# Start services individually
npm run dev          # Frontend (port 5173)
npm run auth:dev     # Authentication service (port 3010)
```

## 🏗️ Architecture

### Frontend Stack
- **React 18** + **TypeScript** - Modern component-based UI
- **Vite** - Lightning-fast development server
- **Monaco Editor** - VS Code's editor engine
- **xterm.js** - Professional terminal emulation
- **Tailwind CSS** - Utility-first styling with Material Design 3

### Backend Services
- **Terminal Service** (Port 3003) - WebSocket-based terminal sessions
- **Compiler Service** (Port 3002) - Code compilation and execution
- **Auth Service** (Port 3010) - GitHub OAuth + manual authentication
- **File System API** - RESTful file operations with workspace integration

### Infrastructure
- **Docker** - Containerized execution environments
- **WebSocket** - Real-time terminal communication
- **REST API** - File system operations and compiler integration

## 📁 Project Structure

```
VelocIDE/
├── src/
│   ├── components/
│   │   ├── CodeEditor.tsx      # Monaco editor integration
│   │   ├── FileExplorer.tsx    # File tree with terminal sync
│   │   ├── TerminalTabs.tsx    # Terminal tab management
│   │   ├── DirectTerminal.tsx  # Real Docker terminal (ttyd)
│   │   ├── CompilerTerminal.tsx # Interactive code execution terminal
│   │   └── CompilerPanel.tsx   # Code execution interface
│   ├── contexts/
│   │   └── IDEContext.tsx      # IDE state management
│   ├── services/
│   │   ├── compilerService.ts           # Code compilation
│   │   └── fileSystemService.ts         # File operations
│   └── pages/
│       └── Index.tsx           # Main IDE layout
├── compiler-service/           # Backend compiler service
└── docker-compose.yml         # Container orchestration
```

## 🎮 Usage Guide

### Terminal Integration Workflow
1. **Start Terminal**: Terminal automatically connects and creates isolated workspace
2. **Connect Explorer**: Click "Connect Explorer" button to sync file explorer
3. **Create Files**: Use terminal commands (`touch`, `mkdir`, etc.) or file explorer
4. **Edit Code**: Click files to open in Monaco editor with full syntax highlighting
5. **Execute Code**: Use compiler panel for multi-language code execution

### File Operations
- **Local Files**: Click folder icon (📁) for local project files
- **Terminal Workspace**: Click terminal icon (⚡) for containerized workspace
- **File Creation**: Right-click for context menu or use terminal commands
- **Real-time Sync**: Changes in terminal instantly reflect in file explorer

## 🔧 API Reference

### Terminal Service
- **Direct Terminal**: Real Docker container terminal via ttyd (port 7681)
- **Docker Terminal Service**: WebSocket terminal service (ws://localhost:3003)

```javascript
// WebSocket connection for terminal I/O
ws.send(JSON.stringify({ type: 'input', data: 'ls -la' }));
```

### Compiler Service (http://localhost:3004)
```javascript
// Code compilation and execution
POST /api/compile
{
  "code": "print('Hello World')",
  "language": "python",
  "input": ""
}
```

## 🐳 Docker Configuration

### Terminal Container
- **Base**: Ubuntu with development tools
- **User**: Root for full system access
- **Workspace**: `/workspace` mounted from host
- **Isolation**: Network and filesystem isolation
- **Resources**: 512MB memory, CPU limits

### Compiler Container
- **Multi-language**: Python, Node.js, Java support
- **Execution**: Sandboxed code execution
- **Security**: Resource limits and timeout controls

## 🛠️ Development

### Local Development
```bash
# Frontend development server
npm run dev

# Terminal service
node docker-terminal-server.js

# Compiler service
cd compiler-service && node server.js

# Build Docker images
docker-compose build

# Full Docker stack
docker-compose up
```

### Environment Configuration
```bash
# Copy environment template
cp .env.local.example .env.local

# Configure services
DOCKER_TERMINAL_PORT=3003
COMPILER_SERVICE_PORT=3002
AUTH_SERVICE_PORT=3010
FRONTEND_PORT=8080
```

## 🔒 Security Features

- **Container Isolation**: Each terminal session in separate Docker container
- **Resource Limits**: Memory/CPU constraints prevent resource exhaustion
- **Path Validation**: File access restricted to authorized directories
- **Session Management**: Automatic cleanup of terminated sessions
- **Network Isolation**: Containers have minimal network access

## 🚦 Performance Optimizations

- **Container Reuse**: Efficient container lifecycle management
- **WebSocket Multiplexing**: Single connection for terminal I/O
- **Code Splitting**: Dynamic imports for faster loading
- **Asset Optimization**: Compressed production builds
- **Memory Management**: Automatic cleanup of unused resources

## 🤝 Contributing

1. **Fork** the repository
2. **Create** feature branch (`git checkout -b feature/awesome-feature`)
3. **Commit** changes (`git commit -m 'Add awesome feature'`)
4. **Push** to branch (`git push origin feature/awesome-feature`)
5. **Open** Pull Request

## 📋 Roadmap

- [ ] **Multi-user Collaboration** - Real-time collaborative editing
- [ ] **Plugin System** - Extensible architecture for custom plugins
- [ ] **Advanced Debugging** - Integrated debugger with breakpoints
- [ ] **Git Integration** - Visual git operations and diff viewing
- [ ] **Cloud Deployment** - Kubernetes deployment configurations
- [ ] **Mobile Support** - Responsive design for mobile devices

## 🐛 Troubleshooting

### Common Issues
- **Docker Permission Errors**: Ensure Docker daemon is running and user has permissions
- **Port Conflicts**: Check if ports 3001, 3004, 5173 are available
- **WebSocket Connection Issues**: Verify terminal service is running and accessible
- **File Sync Problems**: Check Docker volume mounts and permissions

### Debug Commands
```bash
# Check service health
curl http://localhost:3001/health
curl http://localhost:3004/health

# View container logs
docker logs velocide-terminal
docker logs velocide-compiler

# Monitor WebSocket connections
docker logs -f velocide-terminal | grep WebSocket
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Monaco Editor** - Microsoft's VS Code editor engine
- **xterm.js** - Professional terminal emulation library
- **Docker** - Containerization and isolation platform
- **React Team** - Amazing JavaScript framework
- **Vite Team** - Next-generation build tooling
