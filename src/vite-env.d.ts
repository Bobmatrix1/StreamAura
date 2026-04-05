/// <reference types="vite/client" />

/**
 * Type definitions for Vite environment variables
 */

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;
  readonly VITE_CLOUDINARY_CLOUD_NAME: string;
  readonly VITE_CLOUDINARY_API_KEY: string;
  readonly VITE_CLOUDINARY_UPLOAD_PRESET: string;
  readonly VITE_API_URL: string;
  readonly VITE_ENABLE_BULK_DOWNLOAD: string;
  readonly VITE_ENABLE_MUSIC_DOWNLOAD: string;
  readonly VITE_MAX_CONCURRENT_DOWNLOADS: string;
  readonly VITE_USE_MOCK_API: string;
  readonly VITE_DEBUG: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
