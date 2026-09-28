import { useState } from 'react'
import { Button, Card, Notice, Sub, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { useMaybeAuth } from '@/auth/session'
import { nomFichierDossier, telechargerDossier } from '@/lib/dossierPdf'
import { patientOf } from '@/state/selectors'
import { useAppState } from '@/state/store'
import s from './ExportDossier.module.css'

/** Ce que le document contient, dit avant qu'on le fabrique. */
export const CONTENU_EXPORT = [
  'son identité, son programme et son parcours d’exercices',
  'la synthèse de chaque séance envoyée',
  'son profil, tel qu’il est établi aujourd’hui',
  'ses notes du soir',
  'les pages de journal partagées avec vous',
  'votre anamnèse et vos notes de suivi',
]

/**
 * Exporter le dossier : le droit d'accès et la portabilité (RGPD, art. 15
 * et 20), en un PDF fabriqué sur cet appareil.
 *
 * L'EXPORT EST TRACÉ AVANT D'ÊTRE FABRIQUÉ. Un dossier de santé qui sort du
 * cabinet doit laisser une trace — qui, quel dossier, quand — et jamais son
 * contenu (cabinet_tracer_export, 0053). Si la trace ne s'écrit pas, le
 * document ne se fabrique pas : un export sans trace est justement celui
 * qu'on ne pourra pas expliquer.
 *
 * UN DOSSIER LU À MOITIÉ NE S'EXPORTE PAS. Une partie illisible passerait
 * pour une partie vide, dans un document qu'on remet à la personne comme
 * « tout ce que nous avons sur vous ».
 */
export function ExportDossier() {
  const state = useAppState()
  const cabinet = useMaybeCabinet()
  const auth = useMaybeAuth()
  const fiche = patientOf(state)
  const [etat, setEtat] = useState<'repos' | 'preparation'>('repos')
  const [retour, setRetour] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  if (!fiche) return null
  const prenom = fiche.name.split(' ')[0] ?? fiche.name
  const reel = Boolean(cabinet?.reel)

  async function exporter() {
    if (!cabinet?.reel || etat === 'preparation' || !fiche) return
    setEtat('preparation')
    setRetour(null)
    const gestes = cabinet.dossier
    const lu = await gestes.lire(state.sel)
    if (!lu || lu.seances === null || lu.anamnese === null || lu.notes === null) {
      setEtat('repos')
      setRetour({
        tone: 'warn',
        text: 'Une partie du dossier n’a pas pu être lue : l’export attendra, un document incomplet se lirait comme complet. Réessayez dans un instant.',
      })
      return
    }
    const trace = await gestes.tracerExport(state.sel)
    if (!trace.ok) {
      setEtat('repos')
      setRetour({ tone: 'warn', text: trace.message })
      return
    }
    const exporteLe = new Date()
    try {
      await telechargerDossier({
        cabinet: auth?.context?.cabinet?.name ?? '',
        exporteLe,
        fiche,
        seances: lu.seances,
        anamnese: lu.anamnese,
        notes: lu.notes,
      })
      setRetour({
        tone: 'ok',
        text: `Dossier téléchargé : ${nomFichierDossier(fiche.name, exporteLe)}. Il se trouve dans les téléchargements de cet appareil.`,
      })
    } catch {
      setRetour({ tone: 'warn', text: 'Le PDF n’a pas pu être fabriqué sur cet appareil. Réessayez.' })
    }
    setEtat('repos')
  }

  return (
    <Card className={s.card}>
      <Title as="h2">Exporter le dossier</Title>
      <Sub>
        Si {prenom} demande une copie de son dossier — c’est son droit —, voici le document à lui
        remettre. Il contient :
      </Sub>
      <ul className={s.contenu}>
        {CONTENU_EXPORT.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <p className={s.exclu}>
        Il ne contient ni la transcription des séances, qui n’est jamais conservée, ni le journal
        privé, qui ne quitte pas son téléphone.
      </p>
      <Notice tone="warn">
        Ce document contient des données de santé. Il se fabrique sur cet appareil et s’enregistre
        dans ses téléchargements : ne le laissez pas sur un poste partagé, et transmettez-le par un
        moyen sûr. L’export est inscrit au journal d’accès de votre cabinet — qui l’a fait et quand,
        jamais son contenu.
      </Notice>
      {retour ? (
        <div className={s.retour} role="status">
          <Notice tone={retour.tone}>{retour.text}</Notice>
        </div>
      ) : null}
      <div className={s.actions}>
        <Button variant="secondary" onClick={() => void exporter()} disabled={!reel || etat === 'preparation'}>
          {etat === 'preparation' ? 'Préparation du dossier…' : 'Télécharger le dossier (PDF)'}
        </Button>
        {!reel ? (
          <span className={s.discret}>L’export se fait depuis le dossier réel de votre cabinet.</span>
        ) : null}
      </div>
    </Card>
  )
}
