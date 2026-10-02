/**
 * Le relief de la page de vente : un peu de 3D, sans bibliothèque.
 *
 * Tout passe par des transformations CSS et quelques variables posées sur
 * les éléments — rien à télécharger, rien qui retarde la page, qui s'affiche
 * avant même que la base réponde. Le script ne fait que dire OÙ en est le
 * regard (le pointeur, ou le défilement sur un écran tactile) ; la feuille de
 * style décide de ce que ça donne.
 *
 * TROIS RÈGLES.
 *   — Le mouvement se refuse : « réduire les animations » dans le système,
 *     et la page reste immobile, sans rien perdre de ce qu'elle dit.
 *   — Rien ne bouge sous le doigt de quelqu'un qui s'en sert : survolé, le
 *     téléphone se tourne face à soi, pour qu'on puisse toucher ses boutons.
 *   — Rien ne tourne à vide : la boucle d'animation s'arrête dès que la
 *     position est atteinte, et ne suit le pointeur que si la scène est à
 *     l'écran.
 */
import { useEffect, type RefObject } from 'react'

/** Le système accepte-t-il le mouvement ? */
export function mouvementPermis(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: no-preference)').matches
}

/** Un pointeur précis (souris, pavé) qui survole — pas un doigt. */
function pointeurPrecis(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

const borne = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** L'inclinaison de la scène : rotation autour de X et de Y, en degrés. */
export interface Inclinaison {
  rx: number
  ry: number
}

/** La pose de repos : de trois quarts, légèrement vu de dessus. */
export const REPOS: Inclinaison = { rx: 6, ry: -14 }

/** Face à soi : la pose quand on se sert du téléphone. */
export const FACE: Inclinaison = { rx: 0, ry: -3 }

/**
 * L'inclinaison voulue pour un pointeur à (x, y), le centre de la scène à
 * (cx, cy), dans une fenêtre de largeur l et de hauteur h. Exportée pour être
 * éprouvée sans navigateur.
 */
export function inclinaisonPourPointeur(
  x: number,
  y: number,
  cx: number,
  cy: number,
  l: number,
  h: number,
): Inclinaison {
  const nx = borne((x - cx) / (l / 2), -1, 1)
  const ny = borne((y - cy) / (h / 2), -1, 1)
  return { rx: REPOS.rx - ny * 7, ry: REPOS.ry + nx * 11 }
}

/**
 * L'inclinaison voulue au défilement, sur un écran tactile : le téléphone se
 * redresse en arrivant au milieu de l'écran, et se couche en le quittant.
 * `centre` est la position verticale du centre de la scène, `h` la hauteur de
 * la fenêtre.
 */
export function inclinaisonPourDefilement(centre: number, h: number): Inclinaison {
  const p = borne((centre - h / 2) / h, -1, 1)
  return { rx: 3 + p * 10, ry: -9 + Math.abs(p) * -6 }
}

/**
 * La scène du haut de page : pose --rx et --ry sur `scene`, d'après le
 * pointeur (souris) ou le défilement (doigt). `cible` est l'élément qui, survolé,
 * se tourne face à soi.
 */
export function useScene(scene: RefObject<HTMLElement | null>, selecteurCible: string): void {
  useEffect(() => {
    const el = scene.current
    if (!el || !mouvementPermis()) return

    const precis = pointeurPrecis()
    let actuelle: Inclinaison = precis ? { ...REPOS } : inclinaisonPourDefilement(el.getBoundingClientRect().top, window.innerHeight)
    let voulue: Inclinaison = { ...actuelle }
    let boucle = 0
    let visible = true

    const poser = () => {
      el.style.setProperty('--rx', `${actuelle.rx.toFixed(2)}deg`)
      el.style.setProperty('--ry', `${actuelle.ry.toFixed(2)}deg`)
    }

    const pas = () => {
      actuelle = {
        rx: actuelle.rx + (voulue.rx - actuelle.rx) * 0.09,
        ry: actuelle.ry + (voulue.ry - actuelle.ry) * 0.09,
      }
      poser()
      if (Math.abs(voulue.rx - actuelle.rx) + Math.abs(voulue.ry - actuelle.ry) > 0.02) {
        boucle = window.requestAnimationFrame(pas)
      } else {
        actuelle = { ...voulue }
        poser()
        boucle = 0
      }
    }
    const viser = (i: Inclinaison) => {
      voulue = i
      if (!boucle) boucle = window.requestAnimationFrame(pas)
    }

    poser()

    // La scène hors de l'écran ne suit plus rien.
    let obs: IntersectionObserver | null = null
    if (typeof IntersectionObserver !== 'undefined') {
      obs = new IntersectionObserver((entrees) => {
        visible = entrees.some((e) => e.isIntersecting)
      })
      obs.observe(el)
    }

    if (precis) {
      const suivre = (e: PointerEvent) => {
        if (!visible || e.pointerType === 'touch') return
        const sur = e.target instanceof Element && e.target.closest(selecteurCible)
        if (sur && el.contains(sur)) {
          el.setAttribute('data-face', '')
          viser(FACE)
          return
        }
        el.removeAttribute('data-face')
        const r = el.getBoundingClientRect()
        viser(inclinaisonPourPointeur(e.clientX, e.clientY, r.left + r.width / 2, r.top + r.height / 3, window.innerWidth, window.innerHeight))
      }
      const quitter = () => {
        el.removeAttribute('data-face')
        viser(REPOS)
      }
      window.addEventListener('pointermove', suivre, { passive: true })
      document.documentElement.addEventListener('pointerleave', quitter)
      return () => {
        window.removeEventListener('pointermove', suivre)
        document.documentElement.removeEventListener('pointerleave', quitter)
        obs?.disconnect()
        if (boucle) window.cancelAnimationFrame(boucle)
      }
    }

    const defiler = () => {
      if (!visible) return
      const r = el.getBoundingClientRect()
      viser(inclinaisonPourDefilement(r.top + Math.min(r.height, window.innerHeight) / 2, window.innerHeight))
    }
    defiler()
    window.addEventListener('scroll', defiler, { passive: true })
    return () => {
      window.removeEventListener('scroll', defiler)
      obs?.disconnect()
      if (boucle) window.cancelAnimationFrame(boucle)
    }
  }, [scene, selecteurCible])
}

/**
 * Les cartes qui s'inclinent sous la souris : tout élément `[data-relief]`
 * de `racine` reçoit --tx et --ty (en degrés) selon la place du pointeur sur
 * lui. Un seul écouteur pour toute la page. Rien au doigt : sur un écran
 * tactile, une carte qui pivote sous le pouce gênerait la lecture.
 */
export function useCartesEnRelief(racine: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = racine.current
    if (!el || !mouvementPermis() || !pointeurPrecis()) return
    let courante: HTMLElement | null = null

    const relacher = (carte: HTMLElement) => {
      carte.style.setProperty('--tx', '0deg')
      carte.style.setProperty('--ty', '0deg')
    }
    const suivre = (e: PointerEvent) => {
      const carte = e.target instanceof Element ? (e.target.closest('[data-relief]') as HTMLElement | null) : null
      if (courante && courante !== carte) relacher(courante)
      courante = carte
      if (!carte) return
      const r = carte.getBoundingClientRect()
      const nx = borne((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5)
      const ny = borne((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5)
      carte.style.setProperty('--tx', `${(nx * 9).toFixed(2)}deg`)
      carte.style.setProperty('--ty', `${(-ny * 7).toFixed(2)}deg`)
    }
    const sortir = () => {
      if (courante) relacher(courante)
      courante = null
    }
    el.addEventListener('pointermove', suivre, { passive: true })
    el.addEventListener('pointerleave', sortir)
    return () => {
      el.removeEventListener('pointermove', suivre)
      el.removeEventListener('pointerleave', sortir)
    }
  }, [racine])
}

/**
 * Les apparitions au défilement : chaque `[data-apparition]` de `racine`
 * reçoit `data-apparu` en entrant à l'écran. La feuille de style ne cache
 * rien tant que `racine` n'a pas `data-anime` — posé ici, après avoir montré
 * d'office tout ce qui est déjà à l'écran ou au-dessus : rien ne clignote au
 * chargement, et une page ouverte sur #essai ne laisse rien d'invisible
 * derrière elle.
 */
export function useApparitions(racine: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = racine.current
    if (!el || !mouvementPermis() || typeof IntersectionObserver === 'undefined') return

    const elements = Array.from(el.querySelectorAll<HTMLElement>('[data-apparition]'))
    const montrer = (cible: Element) => cible.setAttribute('data-apparu', '')
    for (const cible of elements) {
      if (cible.getBoundingClientRect().top < window.innerHeight) montrer(cible)
    }
    el.setAttribute('data-anime', '')

    const obs = new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) {
          // Arrivé à l'écran, ou déjà dépassé (un saut d'ancre).
          if (e.isIntersecting || e.boundingClientRect.top < 0) {
            montrer(e.target)
            obs.unobserve(e.target)
          }
        }
      },
      // Seuil nul : un bloc plus haut que l'écran n'atteint jamais 8 % visibles
      // en entrant, et restait caché.
      { rootMargin: '0px 0px -6% 0px', threshold: 0 },
    )
    for (const cible of elements) if (!cible.hasAttribute('data-apparu')) obs.observe(cible)

    // À l'impression, tout se montre.
    const imprimer = () => elements.forEach(montrer)
    window.addEventListener('beforeprint', imprimer)
    return () => {
      obs.disconnect()
      window.removeEventListener('beforeprint', imprimer)
      el.removeAttribute('data-anime')
    }
  }, [racine])
}
