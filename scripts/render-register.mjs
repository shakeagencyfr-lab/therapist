// Enregistre le résolveur qui neutralise les imports CSS pendant le rendu.
import { register } from 'node:module'
register('./render-css-loader.mjs', import.meta.url)
