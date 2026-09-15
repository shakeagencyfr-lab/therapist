/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Offre à exporter pour le bloc intégrable : "ia" (défaut), "rdv" ou "web". */
  readonly VITE_PRODUIT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
