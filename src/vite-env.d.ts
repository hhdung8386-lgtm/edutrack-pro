/// <reference types="vite/client" />

declare module 'vite/client' {
  interface ImportMetaEnv {
    readonly VITE_FIREBASE_API_KEY: string
    readonly VITE_FIREBASE_AUTH_DOMAIN: string
    readonly VITE_FIREBASE_PROJECT_ID: string
    readonly VITE_FIREBASE_STORAGE_BUCKET: string
    readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
    readonly VITE_FIREBASE_APP_ID: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

declare module '*.css' {
  const content: string
  export default content
}

declare module '*.svg?no-inline' {
  const src: string
  export default src
}

/** Mã bản build hiện tại (commit Vercel); so với /version.json để nhắc tải lại. */
declare const __APP_BUILD_ID__: string
