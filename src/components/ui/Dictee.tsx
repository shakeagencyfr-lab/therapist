import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
  type TextareaHTMLAttributes,
} from 'react'
import { useDicteeChamp, type DicteeChamp } from './useDictee'
import s from './ui.module.css'

const cx = (...parts: Array<string | false | undefined | null>) => parts.filter(Boolean).join(' ') || undefined

/** Ce que TextArea et TextInput acceptent en plus, pour la dictée. */
export interface OptionsDictee {
  /**
   * Un bouton micro dans le champ, quand le navigateur sait transcrire.
   *
   * Vrai : le bouton, sauf si le champ est désactivé ou en lecture seule.
   * Faux : le même habillage sans bouton — pour un champ dont le micro va et
   * vient (la séance l'ouvre et le ferme) sans que le champ soit remonté et
   * perde sa hauteur ou son défilement. Absent : le champ d'avant, nu.
   */
  dictee?: boolean
  /**
   * Appelé quand la dictée a fini d'écrire. Pour les champs qui
   * n'enregistrent qu'à la sortie (onBlur) : le bouton garde le champ sous
   * le curseur, la sortie ne vient donc pas d'elle-même.
   */
  onDicteeFin?: () => void
}

/**
 * Le micro, dessiné comme celui de l'espace patient.
 */
function IconeMicro() {
  return (
    <svg viewBox="0 0 24 24" className={s.dicteIcone} aria-hidden focusable="false">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3" />
    </svg>
  )
}

/**
 * Le champ, son bouton, et ce qu'il faut dire dessous.
 *
 * Des <span> et pas des <div> : beaucoup de ces champs vivent dans un
 * <label>, qui n'admet que du contenu de phrase.
 *
 * Le bouton ne prend pas le focus (mousedown sans suite) : le curseur reste
 * dans le champ, la dictée écrit là où il est, et la sortie du champ — qui
 * enregistre, sur certains écrans — ne part pas avant que le texte arrive.
 */
function Habillage({
  dictee,
  avecBouton,
  ligne,
  marges,
  children,
}: {
  dictee: DicteeChamp
  avecBouton: boolean
  ligne: boolean
  marges: CSSProperties | undefined
  children: ReactNode
}) {
  const titre = dictee.ecoute
    ? 'Arrêter la dictée (Échap)'
    : dictee.occupe
      ? 'Le micro sert à l’enregistrement de la séance'
      : 'Dicter : votre voix est transcrite par le service de votre navigateur'

  return (
    <span className={s.dicteZone}>
      <span className={s.dicteChamp} style={marges}>
        {children}
        {avecBouton ? (
          <button
            type="button"
            className={cx(s.dicteBouton, ligne && s.dicteBoutonLigne, dictee.ecoute && s.dicteBoutonEcoute)}
            aria-label={dictee.ecoute ? 'Arrêter la dictée' : 'Dicter'}
            aria-pressed={dictee.ecoute}
            title={titre}
            disabled={dictee.occupe && !dictee.ecoute}
            onMouseDown={(e) => e.preventDefault()}
            onClick={dictee.basculer}
          >
            <IconeMicro />
          </button>
        ) : null}
      </span>

      {/* Ce que le navigateur entend, avant validation : sans ce retour, on
          parle sans savoir si quelque chose arrive. Il ne s'écrit jamais
          dans le champ — il déclencherait enregistrements et limites. */}
      {dictee.ecoute ? (
        <span className={s.dicteInterim}>{dictee.interim || 'Parlez, le texte s’écrit tout seul…'}</span>
      ) : null}

      {dictee.erreur ? (
        <span className={s.dicteErreur} role="status">
          {dictee.erreur}
        </span>
      ) : null}

      {/* Dit une fois, sobrement, pendant la première dictée : sur une note
          clinique, la voix porte des données de santé. Le bouton le redit
          au survol. */}
      {dictee.ecoute && dictee.mention ? (
        <span className={s.dicteMention}>
          Votre voix est transcrite par le service de votre navigateur (Google pour Chrome,
          Microsoft pour Edge, Apple pour Safari) : le son sort de l’appareil le temps de l’écrire.
          Seul le texte reste ici.
        </span>
      ) : null}
    </span>
  )
}

/**
 * Les marges propres du champ, pour poser le micro sur le champ et non sur
 * sa marge.
 *
 * Certains écrans espacent leurs champs par une marge (le titre d'une
 * notification, 9 px dessous) : l'habillage l'englobe, et un micro centré
 * sur l'habillage glissait d'autant. On la lit une fois posée, et à chaque
 * changement de classe.
 */
function useMarges(ref: RefObject<HTMLElement>, classe: string | undefined): CSSProperties | undefined {
  const [marges, setMarges] = useState<CSSProperties | undefined>(undefined)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const style = window.getComputedStyle(el)
    const haut = parseFloat(style.marginTop) || 0
    const bas = parseFloat(style.marginBottom) || 0
    const droite = parseFloat(style.marginRight) || 0
    setMarges(
      haut || bas || droite
        ? ({
            '--dicte-haut': `${haut}px`,
            '--dicte-bas': `${bas}px`,
            '--dicte-droite': `${droite}px`,
          } as CSSProperties)
        : undefined,
    )
  }, [ref, classe])
  return marges
}

/** Un champ d'une ligne, avec son micro. */
export function ChampDicte({
  className,
  dictee = true,
  onDicteeFin,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & OptionsDictee) {
  const ref = useRef<HTMLInputElement>(null)
  const actif = dictee && !rest.disabled && !rest.readOnly
  const etat = useDicteeChamp(ref, { actif, valeur: rest.value, onFin: onDicteeFin })
  const marges = useMarges(ref, className)
  return (
    <Habillage dictee={etat} avecBouton={actif} ligne marges={marges}>
      <input ref={ref} className={cx(className, actif && s.dicteAvecBouton)} {...rest} />
    </Habillage>
  )
}

/** Une zone de texte, avec son micro. */
export function ZoneDicte({
  className,
  dictee = true,
  onDicteeFin,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & OptionsDictee) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const actif = dictee && !rest.disabled && !rest.readOnly
  const etat = useDicteeChamp(ref, { actif, valeur: rest.value, onFin: onDicteeFin })
  const marges = useMarges(ref, className)
  return (
    <Habillage dictee={etat} avecBouton={actif} ligne={false} marges={marges}>
      <textarea ref={ref} className={cx(className, actif && s.dicteAvecBouton)} {...rest} />
    </Habillage>
  )
}
