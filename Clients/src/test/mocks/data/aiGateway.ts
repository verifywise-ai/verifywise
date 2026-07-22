export interface MockPrompt {
  id: number;
  name: string;
  content: string;
  version: string;
  is_active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MockMcpServer {
  id: number;
  name: string;
  transport: "stdio" | "sse" | "http";
  command: string | null;
  url: string | null;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

export interface MockMcpRun {
  id: number;
  server_id: number;
  tool_name: string;
  status: "pending" | "running" | "completed" | "failed";
  result: unknown;
  createdAt: string;
  updatedAt: string;
}

export function createMockPrompt(overrides: Partial<MockPrompt> = {}): MockPrompt {
  return {
    id: 1,
    name: "Default System Prompt",
    content: "You are a helpful AI assistant.",
    version: "1.0",
    is_active: true,
    createdAt: "2025-11-01T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
    ...overrides,
  };
}

export function createMockMcpServer(overrides: Partial<MockMcpServer> = {}): MockMcpServer {
  return {
    id: 1,
    name: "Filesystem Server",
    transport: "stdio",
    command: "npx -y @modelcontextprotocol/server-filesystem /tmp",
    url: null,
    status: "active",
    createdAt: "2025-11-01T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
    ...overrides,
  };
}

export function createMockMcpRun(overrides: Partial<MockMcpRun> = {}): MockMcpRun {
  return {
    id: 1,
    server_id: 1,
    tool_name: "read_file",
    status: "completed",
    result: { content: "mock file content" },
    createdAt: "2025-11-01T00:00:00Z",
    updatedAt: "2026-02-15T00:00:00Z",
    ...overrides,
  };
}

export const mockPrompts: MockPrompt[] = [createMockPrompt()];
export const mockMcpServers: MockMcpServer[] = [createMockMcpServer()];
export const mockMcpRuns: MockMcpRun[] = [createMockMcpRun()];
