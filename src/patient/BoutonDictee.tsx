import type { Dictee } from './useDictee'
import s from './BoutonDictee.module.css'

/**
 * Le bouton de dictée, et ce qu'il faut dire autour.
 *
 * Il ne s'affiche pas quand le navigateur ne sait pas transcrire : un bouton
 * qui ne peut que refuser vaut moins que pas de bouton du tout.
 *
 * Trois états, et le deuxième est le seul qui compte pour la personne qui
 * parle : au repos il invite, à l'écoute il montre ce qu'il entend — sans
 * ce retour, on parle dans le vide et on recommence trois fois — et en
 * erreur il dit quoi faire.
 */
export function BoutonDictee({ dictee, accent }: { dictee: Dictee; accent?: string }) {
  if (!dictee.possible) return null

  return (
    <div className={s.zone}>
      <button
        type="button"
        className={dictee.ecoute ? `${s.bouton} ${s.ecoute}` : s.bouton}
        style={dictee.ecoute && accent ? { background: accent, borderColor: accent } : undefined}
        onClick={dictee.basculer}
        aria-pressed={dictee.ecoute}
      >
        <svg viewBox="0 0 24 24" className={s.micro} aria-hidden focusable="false">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
          <path d="M12 18v3" />
        </svg>
        {dictee.ecoute ? "J'écoute — appuyez pour arrêter" : 'Dicter'}
      </button>

      {/* Ce que le navigateur entend, avant validation : sans ce retour, on
          parle sans savoir si quelque chose arrive. */}
      {dictee.ecoute ? (
        <p className={s.interim}>{dictee.interim || 'Parlez, le texte s’écrit tout seul…'}</p>
      ) : null}

      {dictee.erreur ? <p className={s.erreur}>{dictee.erreur}</p> : null}

      {/* Dit une fois, sobrement, et avant d'appuyer : sur un journal intime,
          ce n'est pas un détail de mise en œuvre. */}
      {dictee.ecoute ? (
        <p className={s.mention}>
          Votre voix est transcrite par le service de votre navigateur : le son sort du téléphone
          le temps de l'écrire. Le texte, lui, ne part qu'ici.
        </p>
      ) : null}
    </div>
  )
}
