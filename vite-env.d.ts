/**
 * @file Type augmentation for Vite's `import.meta.env`.
 * Lists every `VITE_*` variable the FE reads so TypeScript can flag typos.
 */
/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_BASE_URL?: string;
    readonly VITE_DEFAULT_INSTITUTE_SLUG?: string;
    readonly VITE_SENTRY_DSN?: string;
    readonly VITE_SENTRY_ENVIRONMENT?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
