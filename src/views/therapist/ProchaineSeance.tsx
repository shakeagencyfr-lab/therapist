import { useId } from 'react'
import { Notice, TextInput } from '@/components/ui'
import { jourDeParis } from '@/lib/assiduite'
import { instantDeParis, phraseRappelVeille, refusSeance } from '@/lib/agenda'
import { mentionFuseau } from '@/lib/rappelsReguliers'
import s from './ProchaineSeance.module.css'

export interface SaisieSeance {
  /** « AAAA-MM-JJ », jour de Paris. */
  jour: string
  /** « HH:MM », heure de Paris. */
  heure: string
  /** Sans date, une indication en toutes lettres (le repli des fiches d'avant). */
  texte: string
}

export interface ChampProchaineSeanceProps {
  saisie: SaisieSeance
  onChange: (saisie: SaisieSeance) => void
  /** L'instant déjà enregistré : une date passée qu'on ne touche pas ne bloque rien. */
  enregistree: string | null | undefined
  /** Le texte libre encore en base, sur une fiche d'avant. */
  texteEnregistre: string | null | undefined
  clos: boolean
  disabled?: boolean
  maintenant?: Date
  /** Le fuseau du navigateur : hors de Paris, l'heure se dit « de Paris ». */
  fuseau?: string
}

/**
 * La prochaine séance, datée (0059).
 *
 * UN JOUR ET UNE HEURE, À L'HEURE DE PARIS. Deux sélecteurs natifs plutôt
 * qu'un seul champ « date et heure » : sur téléphone, c'est un calendrier et
 * une roue que la praticienne connaît déjà, et l'heure se corrige sans
 * reprendre la date. Dessous, la phrase exacte du rappel que la base
 * écrira la veille à 18 h — ou pourquoi il ne partira pas.
 *
 * Vue pure : la fiche tient la saisie et l'enregistre avec le reste.
 */
export function ChampProchaineSeance({
  saisie,
  onChange,
  enregistree,
  texteEnregistre,
  clos,
  disabled = false,
  maintenant = new Date(),
  fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone,
}: ChampProchaineSeanceProps) {
  const id = useId()
  const aujourdhui = jourDeParis(maintenant)
  const refus = refusSeance(saisie.jour, saisie.heure, enregistree, maintenant)
  const instant = saisie.jour && saisie.heure ? instantDeParis(saisie.jour, saisie.heure) : null
  const iso = instant ? instant.toISOString() : null
  const fuseauDit = mentionFuseau(fuseau)
  // Le texte d'avant n'est plus qu'un repli : daté, il disparaît à l'enregistrement.
  const ancienTexte = texteEnregistre?.trim() || ''

  return (
    <div className={s.champ} role="group" aria-labelledby={`${id}-titre`}>
      <span className={s.label} id={`${id}-titre`}>
        Prochaine séance{fuseauDit}
      </span>
      <div className={s.selecteurs}>
        <TextInput
          className={s.jour}
          type="date"
          value={saisie.jour}
          /* Le calendrier grise les jours passés — sauf si la fiche en porte
             un : la validation du navigateur bloquerait alors tout le
             formulaire, et la fiche ne s'enregistrerait plus. */
          min={saisie.jour && saisie.jour < aujourdhui ? undefined : aujourdhui}
          aria-label="Jour de la prochaine séance"
          disabled={disabled}
          onChange={(e) => onChange({ ...saisie, jour: e.target.value })}
        />
        <TextInput
          className={s.heure}
          type="time"
          value={saisie.heure}
          aria-label={`Heure de la prochaine séance${fuseauDit}`}
          disabled={disabled}
          onChange={(e) => onChange({ ...saisie, heure: e.target.value })}
        />
        {saisie.jour || saisie.heure ? (
          <button
            type="button"
            className={s.effacer}
            disabled={disabled}
            onClick={() => onChange({ ...saisie, jour: '', heure: '' })}
          >
            Effacer la date
          </button>
        ) : null}
      </div>

      {refus ? (
        <span className={s.refus} role="alert">
          {refus}
        </span>
      ) : (
        <span className={s.rappel}>{phraseRappelVeille(iso, clos, maintenant)}</span>
      )}

      {!saisie.jour && !saisie.heure ? (
        <>
          {ancienTexte ? (
            <Notice tone="warn">
              Notée jusqu'ici en toutes lettres : « {ancienTexte} ». Datez-la pour qu'elle se range
              dans votre liste et que le rappel de la veille parte.
            </Notice>
          ) : null}
          <TextInput
            value={saisie.texte}
            onChange={(e) => onChange({ ...saisie, texte: e.target.value })}
            placeholder="Sans date précise : « début novembre, pour consolider »"
            aria-label="Prochaine séance, sans date précise"
            disabled={disabled}
          />
          <span className={s.hint}>
            Une indication sans date se lit sur la fiche et dans son espace, mais ne se range pas et
            ne déclenche aucun rappel.
          </span>
        </>
      ) : null}
    </div>
  )
}
