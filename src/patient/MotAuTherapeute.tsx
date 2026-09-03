import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useDictee } from './useDictee'
import { BoutonDictee } from './BoutonDictee'
import s from './MotAuTherapeute.module.css'

/**
 * Un mot pour sa thérapeute, en trois secondes.
 *
 * Le journal sert à écrire pour soi ; celui-ci sert à dire quelque chose à
 * quelqu'un — « je n'ai pas pu faire l'exercice », « la nuit a été mauvaise »,
 * « j'ai eu un empêchement jeudi ». Ce n'est pas le même geste, et le faire
 * passer par une page de journal qu'il faut penser à cocher revenait à ne
 * jamais l'envoyer.
 *
 * C'EST NÉANMOINS UNE PAGE DE JOURNAL, partagée d'emblée. Pas de table à
 * part, pas de deuxième messagerie : la thérapeute lit tout au même endroit,
 * dans son journal partagé, et la patiente peut le retirer plus tard comme
 * n'importe quelle page — un mot envoyé un soir de doute se reprend.
 */
export function MotAuTherapeute({
  patientId,
  cabinetId,
  accent,
  onEnvoye,
}: {
  patientId: string
  cabinetId: string
  accent?: string
  onEnvoye: () => Promise<void>
}) {
  const [texte, setTexte] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [envoye, setEnvoye] = useState(false)
  const [erreur, setErreur] = useState('')
  const dictee = useDictee(texte, setTexte)

  async function envoyer() {
    const db = supabase()
    if (!db || !texte.trim() || envoi) return
    setEnvoi(true)
    setErreur('')
    const { error } = await db.from('journal_pages').insert({
      patient_id: patientId,
      cabinet_id: cabinetId,
      title: 'Un mot',
      body: texte.trim(),
      shared: true,
    })
    setEnvoi(false)
    if (error) {
      setErreur("Votre mot n'est pas parti. Réessayez dans un instant.")
      return
    }
    dictee.arreter()
    setTexte('')
    setEnvoye(true)
    await onEnvoye()
  }

  if (envoye) {
    return (
      <section className={s.carte}>
        <p className={s.transmis}>
          C'est transmis. Votre thérapeute le verra avant votre prochaine séance.
        </p>
        <button type="button" className={s.encore} onClick={() => setEnvoye(false)}>
          Écrire un autre mot
        </button>
      </section>
    )
  }

  return (
    <section className={s.carte}>
      <h2 className={s.titre}>Un mot pour votre thérapeute</h2>
      <p className={s.sous}>
        Quelque chose à lui dire avant la prochaine séance ? Deux lignes suffisent.
      </p>
      <textarea
        className={s.champ}
        rows={3}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        placeholder="Ce que vous voulez qu'elle sache…"
        aria-label="Un mot pour votre thérapeute"
      />
      <BoutonDictee dictee={dictee} accent={accent} />
      {erreur ? <p className={s.erreur}>{erreur}</p> : null}
      <button
        type="button"
        className={s.envoyer}
        style={accent ? { background: accent } : undefined}
        disabled={!texte.trim() || envoi}
        onClick={() => void envoyer()}
      >
        {envoi ? 'Envoi…' : 'Envoyer'}
      </button>
    </section>
  )
}
