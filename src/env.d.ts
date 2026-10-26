/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dirección pública de la demo (con HTTPS) que codifica el código QR. Si está vacía se usa la dirección actual. */
  readonly VITE_PUBLIC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
