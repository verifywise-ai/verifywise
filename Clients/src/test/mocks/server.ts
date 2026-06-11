import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/**
 * MSW server instance for Node.js (Vitest/jsdom) tests.
 *
 * Imported in src/test/setup.ts for global lifecycle management.
 */
export const server = setupServer(...handlers);
