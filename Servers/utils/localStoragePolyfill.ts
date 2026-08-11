/**
 * Minimal server-side localStorage stub.
 *
 * Node 25+ ships an experimental native `localStorage` that emits a warning
 * when code reads it without `--localstorage-file`. The `docx` package reads
 * `localStorage` at module load time, so on the server this warning is printed
 * on every startup. Provide a tiny in-memory stub before any `docx` import so
 * the native stub is never touched.
 *
 * This file is imported at the very top of the application entry point and is
 * safe to use in tests as well.
 */
const store = new Map<string, string>();

const serverLocalStorage: Storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, String(value)),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
  get length() {
    return store.size;
  },
  key: (index: number) => Array.from(store.keys())[index] ?? null,
} as Storage;

// Always replace the native stub on the server. The property is configurable
// on Node 25, and this module is only loaded in Node/server contexts.
Object.defineProperty(globalThis, "localStorage", {
  value: serverLocalStorage,
  configurable: true,
  writable: true,
});
