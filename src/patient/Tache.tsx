import { useState } from 'react'
import { RoundCheck } from '@/components/ui'
import type { PatientModuleRow } from './usePatientData'
import { useDictee } from './useDictee'
import { BoutonDictee } from './BoutonDictee'
import s from './Tache.module.css'

/**
 * Une tâche, ouverte.
 *
 * L'écran d'accueil ne montrait qu'un titre, une case et un champ de note :
 * on pouvait cocher un exercice sans jamais savoir ce qu'il fallait faire.
 * La consigne était en base — colonne `consigne` de `patient_modules` — et
 * aucun écran ne l'ouvrait.
 *
 * CE QUI MANQUE EST DIT, PAS INVENTÉ. Un module écrit dans l'atelier porte
 * ses étapes ; un module issu d'une séance ne porte que le « pourquoi » que
 * la thérapeute a dicté, parce que le brouillon de séance n'écrit pas
 * d'étapes. Fabriquer une consigne générique par type — « respirez trois
 * fois » — donnerait à lire quelque chose que personne n'a prescrit. On
 * montre ce qu'il y a, et on renvoie à sa thérapeute pour le reste.
 */
export function Tache({
  module,
  accent,
  onFermer,
  onBasculer,
  onNote,
}: {
  module: PatientModuleRow
  accent?: string
  onFermer: () => void
  onBasculer: (fait: boolean) => Promise<void>
  onNote: (texte: string) => Promise<void>
}) {
  const fait = Boolean(module.done_at)
  const [note, setNote] = useState(module.patient_note ?? '')
  const [enCours, setEnCours] = useState(false)
  const [enregistre, setEnregistre] = useState(false)
  const dictee = useDictee(note, (suite) => {
    setNote(suite)
    setEnregistre(false)
  })

  const consigne = module.consigne ?? null
  const etapes = consigne?.steps?.filter((e) => e.trim()) ?? []
  const repere = [consigne?.duree, consigne?.quand].filter(Boolean).join(' · ')

  async function enregistrer() {
    if (enCours) return
    setEnCours(true)
    dictee.arreter()
    await onNote(note.trim())
    setEnCours(false)
    setEnregistre(true)
  }

  return (
    <div className={s.ecran}>
      <button type="button" className={s.retour} onClick={onFermer}>
        ‹ Ma journée
      </button>

      <h1 className={s.titre}>{module.title}</h1>
      <p className={s.meta}>{repere || module.meta}</p>

      {consigne?.why ? (
        <section className={s.bloc}>
          <h2 className={s.blocTitre}>À quoi ça sert</h2>
          <p className={s.texte}>{consigne.why}</p>
        </section>
      ) : null}

      {etapes.length ? (
        <section className={s.bloc}>
          <h2 className={s.blocTitre}>Comment faire</h2>
          <ol className={s.etapes}>
            {etapes.map((etape, i) => (
              <li key={i} className={s.etape}>
                <span className={s.numero} style={accent ? { background: accent } : undefined}>
                  {i + 1}
                </span>
                <span className={s.etapeTexte}>{etape}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {!consigne?.why && !etapes.length ? (
        <section className={s.bloc}>
          <p className={s.texte}>
            Votre thérapeute a ajouté cet exercice sans consigne écrite : elle vous l'a expliqué en
            séance. Si vous ne vous rappelez plus, dites-le-lui dans un mot depuis le journal.
          </p>
        </section>
      ) : null}

      <section className={s.bloc}>
        <h2 className={s.blocTitre}>Un mot sur cet exercice</h2>
        <p className={s.aide}>Ce que vous en avez fait, ce qui a coincé. Votre thérapeute le lit.</p>
        <textarea
          className={s.champ}
          rows={4}
          value={note}
          onChange={(e) => {
            setNote(e.target.value)
            setEnregistre(false)
          }}
          placeholder="Deux mots suffisent…"
          aria-label={`Un mot sur « ${module.title} »`}
        />
        <BoutonDictee dictee={dictee} accent={accent} />
        <button
          type="button"
          className={s.enregistrer}
          disabled={enCours || enregistre}
          onClick={() => void enregistrer()}
        >
          {enCours ? 'Enregistrement…' : enregistre ? 'Enregistré' : 'Enregistrer mon mot'}
        </button>
      </section>

      {/* La case reste en bas, sous la main, une fois la consigne lue. */}
      <div className={s.pied}>
        <RoundCheck
          on={fait}
          onClick={() => void onBasculer(!fait)}
          label={fait ? `Décocher ${module.title}` : `Cocher ${module.title}`}
          style={fait && accent ? { background: accent, borderColor: accent } : undefined}
        />
        <span className={s.piedTexte}>{fait ? "C'est fait" : 'Marquer comme fait'}</span>
      </div>
    </div>
  )
}
