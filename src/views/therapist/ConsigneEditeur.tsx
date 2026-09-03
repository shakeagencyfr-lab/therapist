import { useState } from 'react'
import { Button, Notice } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import type { PatientModule } from '@/types/domain'
import s from './ConsigneEditeur.module.css'

/**
 * La consigne d'un module, relue et corrigée.
 *
 * L'IA l'écrit à l'envoi de la séance, à partir du titre et du « pourquoi »
 * que la thérapeute a retenus. Elle n'est pas pour autant définitive : c'est
 * la praticienne qui connaît la personne, et un exercice mal formulé se fait
 * mal, ou pas du tout. Ce qu'elle écrit ici remplace ce que l'IA a proposé,
 * et c'est ce que le patient lira.
 *
 * UNE ÉTAPE PAR LIGNE, ET C'EST TOUT. Un éditeur à listes, avec des boutons
 * pour ajouter, retirer, déplacer, coûterait dix fois plus de code pour un
 * texte de six lignes qu'on relit une fois. Une zone de texte se corrige au
 * clavier, se réordonne au copier-coller, et ne se casse pas.
 */
export function ConsigneEditeur({
  module,
  onFerme,
}: {
  module: PatientModule
  onFerme: () => void
}) {
  const cabinet = useMaybeCabinet()
  const c = module.consigne
  const [duree, setDuree] = useState(c?.duree ?? '')
  const [quand, setQuand] = useState(c?.quand ?? '')
  const [why, setWhy] = useState(c?.why ?? '')
  const [etapes, setEtapes] = useState((c?.steps ?? []).join('\n'))
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState('')

  async function enregistrer() {
    if (!module.id || !cabinet || envoi) return
    setEnvoi(true)
    setEchec('')
    const r = await cabinet.majConsigne(module.id, {
      duree: duree.trim(),
      quand: quand.trim(),
      steps: etapes
        .split('\n')
        .map((e) => e.trim())
        .filter(Boolean),
      why: why.trim(),
    })
    setEnvoi(false)
    if (r.ok) onFerme()
    else setEchec(r.message)
  }

  return (
    <div className={s.editeur}>
      {!module.id ? (
        <Notice tone="warn">
          Cette fiche est une démonstration : la consigne ne s'enregistre pas.
        </Notice>
      ) : null}

      <div className={s.deux}>
        <label className={s.champ}>
          <span className={s.label}>Durée</span>
          <input
            className={s.input}
            value={duree}
            onChange={(e) => setDuree(e.target.value)}
            placeholder="3 minutes"
          />
        </label>
        <label className={s.champ}>
          <span className={s.label}>Quand</span>
          <input
            className={s.input}
            value={quand}
            onChange={(e) => setQuand(e.target.value)}
            placeholder="Au réveil, avant le café"
          />
        </label>
      </div>

      <label className={s.champ}>
        <span className={s.label}>À quoi ça sert</span>
        <textarea
          className={s.zone}
          rows={4}
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="Ce que le patient lit quand il se demande pourquoi le faire."
        />
      </label>

      <label className={s.champ}>
        <span className={s.label}>Les étapes — une par ligne</span>
        <textarea
          className={s.zone}
          rows={7}
          value={etapes}
          onChange={(e) => setEtapes(e.target.value)}
          placeholder={'Posez les pieds au sol.\nComptez trois respirations lentes.'}
        />
        <span className={s.aide}>
          Chaque ligne devient une étape numérotée dans son application. Une ligne vide est
          ignorée.
        </span>
      </label>

      {echec ? <Notice tone="warn">{echec}</Notice> : null}

      <div className={s.actions}>
        <Button variant="primary" onClick={() => void enregistrer()} disabled={envoi || !module.id}>
          {envoi ? 'Enregistrement…' : 'Enregistrer la consigne'}
        </Button>
        <Button variant="ghost" onClick={onFerme}>
          Annuler
        </Button>
      </div>
    </div>
  )
}
