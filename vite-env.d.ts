/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_GEMINI_API_KEY?: string;
    readonly VITE_DEFAULT_CLOUD_ENDPOINT?: string;
    readonly VITE_DEFAULT_LOCAL_ENDPOINT?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
