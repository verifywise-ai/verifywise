// Environment-level stubs that must be installed BEFORE any application or
// mock module loads. Several libraries capture URL.createObjectURL at import
// time, so this file is registered first in `test.setupFiles` (see
// vite.config.ts).
//
// Vitest 5's jsdom URL.createObjectURL polyfill only accepts Node-native
// Blobs and throws on jsdom Blobs ("Cannot read properties of undefined
// (reading '_buffer')"). Components that create object URLs for previews
// (file uploads, logos, profile photos, office thumbnails) pass jsdom
// Blobs, so stub both APIs here with vi.fn. Tests that assert on them
// re-wrap with vi.spyOn as usual.
URL.createObjectURL = vi.fn(
  () => `blob:vitest-${Math.random().toString(36).slice(2)}`,
) as unknown as typeof URL.createObjectURL;
URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;

export {};
