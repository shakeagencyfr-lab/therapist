import { useState } from 'react'
import { Button, Notice, TextArea, TextInput } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { RetourIA } from '@/components/retouche/RetourIA'
import { consigneCorrigee, etapesDe as lignesDe } from '@/lib/parcours'
import { versionDe, type IssueRetouche, type RetourDeLaPraticienne } from '@/lib/retouche'
import { seFaitParLePatient } from '@/lib/typesDeModules'
import { echecDeRetouche, retoucher } from '@/services/aiClient'
import type { GeneratedModule, PatientContext, PatientModule } from '@/types/domain'
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
 *
 * LE TITRE AUSSI. C'est la première chose que le patient lit de l'exercice,
 * et il ne se corrigeait nulle part : une coquille dictée en séance restait
 * sous ses yeux jusqu'à la fin du suivi.
 *
 * CE QUE L'ÉCRAN NE MONTRE PAS, IL NE L'EFFACE PAS : le quiz d'un module de
 * l'atelier n'a pas de champ ici, et il survit à la correction (voir
 * consigneCorrigee).
 */
export function ConsigneEditeur({
  module,
  onFerme,
  dossier,
}: {
  module: PatientModule
  onFerme: () => void
  /** Le dossier de la personne, lu au moment de la retouche : l'IA écrit la consigne pour elle. */
  dossier?: () => PatientContext | undefined
}) {
  const cabinet = useMaybeCabinet()
  const c = module.consigne
  const [titre, setTitre] = useState(module.title)
  const [duree, setDuree] = useState(c?.duree ?? '')
  const [quand, setQuand] = useState(c?.quand ?? '')
  const [why, setWhy] = useState(c?.why ?? '')
  const [etapes, setEtapes] = useState((c?.steps ?? []).join('\n'))
  const [envoi, setEnvoi] = useState(false)
  const [echec, setEchec] = useState('')
  /* L'IA ne retouche que ce qu'elle a écrit : une consigne vide s'écrit à la
     main, et un audio ou une échelle n'en ont pas (src/lib/typesDeModules.ts). */
  const retouchable = seFaitParLePatient(module.kind) && Boolean(c?.steps?.length || c?.why)

  /**
   * Fait retoucher la consigne par l'IA (0066) — et REMPLIT LES CHAMPS, sans
   * enregistrer. La consigne est déjà chez le patient : ce qu'il lira reste
   * ce que la praticienne enregistre, après l'avoir relu. « Annuler la
   * retouche » remet les champs d'avant ; le quiz, lui, n'a jamais bougé
   * (consigneCorrigee le garde).
   */
  async function retoucherConsigne(retour: RetourDeLaPraticienne): Promise<IssueRetouche> {
    const avant = { titre, duree, quand, why, etapes }
    let rendu: GeneratedModule
    try {
      rendu = await retoucher({
        cible: 'consigne',
        ...retour,
        actuel: { titre, duree, quand, steps: lignesDe(etapes), pourquoi: why, quiz: [] },
        context: dossier?.(),
        extra: { brief: [module.title, module.pourquoi].filter(Boolean).join(' — '), type: module.kind },
      })
    } catch (err) {
      return echecDeRetouche(err)
    }
    if (!rendu.steps?.some((e) => e.trim())) {
      return { ok: false, message: "La retouche est revenue sans étapes : la consigne d'avant reste en place." }
    }
    const apres = {
      titre: rendu.titre.trim() || titre,
      duree: rendu.duree.trim(),
      quand: rendu.quand.trim(),
      why: rendu.pourquoi.trim(),
      etapes: lignesDe(rendu.steps.join('\n')).join('\n'),
    }
    poserChamps(apres)
    return {
      ok: true,
      version: versionDe(apres),
      libelle: "Version retouchée par l'IA, pas encore enregistrée",
      annuler: async () => {
        poserChamps(avant)
        return { ok: true, message: '' }
      },
    }
  }

  function poserChamps(v: { titre: string; duree: string; quand: string; why: string; etapes: string }) {
    setTitre(v.titre)
    setDuree(v.duree)
    setQuand(v.quand)
    setWhy(v.why)
    setEtapes(v.etapes)
  }

  async function enregistrer() {
    if (!module.id || !cabinet || envoi) return
    setEnvoi(true)
    setEchec('')
    const r = await cabinet.majModule(module.id, {
      titre,
      consigne: consigneCorrigee(module.consigne, { duree, quand, why, etapes }),
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

      <label className={s.champ}>
        <span className={s.label}>Titre de l'exercice</span>
        <TextInput
          nu
          dictee
          className={s.input}
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Geste d'ancrage avant le café"
        />
      </label>

      <div className={s.deux}>
        <label className={s.champ}>
          <span className={s.label}>Durée</span>
          <TextInput
            nu
            dictee
            className={s.input}
            value={duree}
            onChange={(e) => setDuree(e.target.value)}
            placeholder="3 minutes"
          />
        </label>
        <label className={s.champ}>
          <span className={s.label}>Quand</span>
          <TextInput
            nu
            dictee
            className={s.input}
            value={quand}
            onChange={(e) => setQuand(e.target.value)}
            placeholder="Au réveil, avant le café"
          />
        </label>
      </div>

      <label className={s.champ}>
        <span className={s.label}>À quoi ça sert</span>
        <TextArea
          nu
          dictee
          className={s.zone}
          rows={4}
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="Ce que le patient lit quand il se demande pourquoi le faire."
        />
      </label>

      <label className={s.champ}>
        <span className={s.label}>Les étapes — une par ligne</span>
        <TextArea
          nu
          dictee
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

      {/* Une consigne écrite, d'un exercice qui se fait : de quoi retoucher. */}
      {cabinet?.reel && module.id && retouchable ? (
        <RetourIA
          cible="consigne"
          libelle="la consigne de cet exercice (rien n'est enregistré avant « Enregistrer »)"
          version={versionDe({ titre, duree, quand, why, etapes })}
          occupe={envoi}
          onRetoucher={retoucherConsigne}
        />
      ) : null}

      <div className={s.actions}>
        <Button
          variant="primary"
          onClick={() => void enregistrer()}
          disabled={envoi || !module.id || !titre.trim()}
        >
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        <Button variant="ghost" onClick={onFerme}>
          Annuler
        </Button>
      </div>
    </div>
  )
}
