/// <reference types="vite/client" />
/// <reference path="./types/lucide-react.d.ts" />
/// <reference path="./presentation/themes/theme.d.ts" />
/// <reference path="./presentation/configs/declarations.d.ts" />
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_API_BASE_URL: string;
  readonly VITE_IS_DEMO_APP: string;
  readonly VITE_IS_MULTI_TENANT: string;
  readonly VITE_SLACK_CLIENT_ID: string;
  readonly VITE_SLACK_URL: string;
  readonly VITE_IS_SLACK_VISIBLE: string;
  readonly VITE_BRANDFETCH_API_KEY: string;
}

declare const __APP_VERSION__: string;
