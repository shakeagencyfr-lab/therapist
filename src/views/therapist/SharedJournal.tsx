import { useState } from 'react'
import { Button, Card, CardHead, EmptyState, Notice, Pill, TextArea, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { plural } from '@/lib/format'
import { momentDit, REPONSE_MAX, retourReponse } from '@/lib/fil'
import { patientOf } from '@/state/selectors'
import { useAppState } from '@/state/store'
import type { JournalEntry } from '@/types/domain'
import s from './SharedJournal.module.css'

/**
 * Journal partagé : les notes envoyées pendant la session, les pages que le
 * patient a marquées comme partagées, puis l'historique du dossier — les
 * plus récentes en tête.
 *
 * LE FIL (0054). Une page partagée est un mot adressé à la thérapeute ; le
 * patient voit désormais qu'il a été lu, et peut recevoir une réponse.
 *
 *   - UNE PAGE QUI ATTEND ARRIVE REPLIÉE, signalée « Non lu ». L'ouvrir la
 *     marque lue, et c'est ce geste-là que le patient verra (« Lu par votre
 *     thérapeute le … »). La marquer à l'affichage la dirait lue d'une fiche
 *     parcourue en passant : le patient lirait une promesse que personne
 *     n'a tenue.
 *   - « Répondre » écrit à CE patient seul, par un mot du cabinet rangé sous
 *     sa page — dans son espace, et sur son téléphone s'il y a activé les
 *     rappels. La base refuse tout autre destinataire.
 *
 * Les notes de la séance et les pages de la démonstration n'ont pas de page
 * en base : elles se lisent comme avant, sans lecture ni réponse.
 */
export function SharedJournal() {
  const state = useAppState()
  const cabinet = useMaybeCabinet()
  const key = state.sel
  /** Les pages dépliées à l'instant : elles s'ouvrent au clic, sans attendre la base. */
  const [ouvertes, setOuvertes] = useState<Record<string, boolean>>({})
  /** La lecture n'a pas pu être notée : la page est ouverte, le patient ne le sait pas. */
  const [echecLecture, setEchecLecture] = useState('')
  /** La page à laquelle on répond, et le texte en cours. */
  const [brouillon, setBrouillon] = useState<{ page: string; texte: string } | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [retour, setRetour] = useState<{ page: string; ton: 'ok' | 'warn'; texte: string } | null>(null)

  const entries: JournalEntry[] = (state.noteLog[key] ?? [])
    .concat(
      (state.pages[key] ?? [])
        .filter((g) => g.shared)
        .map((g) => ({ date: g.date, trigger: g.title || 'Page sans titre', text: g.text })),
    )
    .concat(patientOf(state)?.journal ?? [])

  /* Le fil ne tient que sur un dossier réel : ailleurs, rien à marquer ni à
     qui répondre. L'état dit ce qui attend ; le cabinet, s'il est là, écrit. */
  const reel = state.patientsReels
  const ecrit = Boolean(cabinet?.reel)
  const attend = (j: JournalEntry) => reel && Boolean(j.id) && !j.luLe
  const nonLues = entries.filter(attend).length
  const appareils = state.appareils[key] ?? 0

  async function ouvrir(pageId: string) {
    setOuvertes((o) => ({ ...o, [pageId]: true }))
    setEchecLecture('')
    /* Le bouton « Lire » disparaît sous le doigt : le focus suit la page
       ouverte, au lieu de retomber en haut du document pour qui navigue au
       clavier ou au lecteur d'écran. */
    requestAnimationFrame(() => document.getElementById(`fil-${pageId}`)?.focus())
    const r = await cabinet?.marquerPageLue(key, pageId)
    if (r && !r.ok) setEchecLecture(r.message)
  }

  async function envoyer() {
    if (!cabinet || !brouillon || envoi) return
    setEnvoi(true)
    setRetour(null)
    const r = await cabinet.repondreAPage(brouillon.page, brouillon.texte)
    setEnvoi(false)
    if (!r.ok) {
      // Le texte reste dans le champ : rien n'est perdu, on peut réessayer.
      setRetour({ page: brouillon.page, ton: 'warn', texte: r.message })
      return
    }
    setRetour({ page: brouillon.page, ton: 'ok', texte: retourReponse(appareils) })
    setBrouillon(null)
  }

  return (
    <Card padded={false} className={entries.length ? s.card : `${s.card} ${s.cardEmpty}`}>
      <CardHead>
        <Title>Journal partagé</Title>
        {nonLues > 0 ? <Pill tone="accent">{plural(nonLues, 'non lu', 'non lus')}</Pill> : null}
      </CardHead>
      <p className={s.sub}>
        {reel
          ? "Ce que le patient a choisi de vous transmettre. Ouvrir une page lui indique que vous l'avez lue."
          : 'Ce que le patient a choisi de vous transmettre'}
      </p>

      {echecLecture ? <Notice tone="warn" style={{ margin: '4px 0 8px' }}>{echecLecture}</Notice> : null}

      {entries.length === 0 ? (
        <EmptyState>
          Rien de partagé pour l'instant. Le patient décide page par page de ce
          qu'il vous transmet.
        </EmptyState>
      ) : (
        entries.map((j, i) => {
          const pageId = j.id
          const enAttente = attend(j)
          const cle = pageId ?? `${j.date}-${i}`

          if (pageId && enAttente && !ouvertes[pageId]) {
            return (
              <div className={`${s.entry} ${s.entryAttend}`} key={cle}>
                <button
                  type="button"
                  className={s.ouvrir}
                  aria-expanded={false}
                  onClick={() => void ouvrir(pageId)}
                >
                  <span className={s.line}>
                    <span className={s.date}>{j.date}</span>
                    <span className={s.trigger}>{j.trigger}</span>
                    <Pill tone="accent">Non lu</Pill>
                  </span>
                  <span className={s.lire}>Lire</span>
                </button>
              </div>
            )
          }

          const reponses = pageId ? (state.reponses[pageId] ?? []) : []
          const enCours = pageId && brouillon?.page === pageId ? brouillon : null
          const signes = enCours ? Array.from(enCours.texte.trim()).length : 0
          return (
            <div
              className={enAttente ? `${s.entry} ${s.entryAttend}` : s.entry}
              key={cle}
              id={pageId ? `fil-${pageId}` : undefined}
              tabIndex={pageId ? -1 : undefined}
            >
              <div className={s.line}>
                <span className={s.date}>{j.date}</span>
                <span className={s.trigger}>{j.trigger}</span>
                {enAttente ? <Pill tone="accent">Non lu</Pill> : null}
              </div>
              <p className={s.text}>{j.text}</p>

              {reponses.map((r) => (
                <div className={s.reponse} key={r.id}>
                  <span className={s.reponseQui}>Votre réponse · {momentDit(r.le)}</span>
                  <p className={s.reponseTexte}>{r.texte}</p>
                </div>
              ))}

              {pageId && ecrit && enCours ? (
                <div className={s.repondre}>
                  <TextArea
                    rows={3}
                    value={enCours.texte}
                    onChange={(e) => setBrouillon({ page: pageId, texte: e.target.value })}
                    placeholder="Quelques mots suffisent : ils s'afficheront sous sa page."
                    aria-label={`Votre réponse à « ${j.trigger} »`}
                    disabled={envoi}
                    dictee
                  />
                  <p className={s.aide}>
                    {appareils > 0
                      ? 'Elle arrivera dans son espace, sous sa page, et sur son téléphone.'
                      : "Elle arrivera dans son espace, sous sa page. Les rappels ne sont pas activés sur son téléphone : rien ne sonnera, elle l'attendra là."}
                    {signes > REPONSE_MAX * 0.9
                      ? ` ${signes.toLocaleString('fr-FR')} / ${REPONSE_MAX.toLocaleString('fr-FR')} signes.`
                      : ''}
                  </p>
                  <div className={s.actions}>
                    <Button
                      variant="primary"
                      disabled={envoi || !enCours.texte.trim()}
                      onClick={() => void envoyer()}
                    >
                      {envoi ? 'Envoi…' : 'Envoyer la réponse'}
                    </Button>
                    <Button variant="ghost" disabled={envoi} onClick={() => setBrouillon(null)}>
                      Annuler
                    </Button>
                  </div>
                </div>
              ) : pageId && ecrit ? (
                <Button
                  variant="ghost"
                  className={s.repondreBtn}
                  onClick={() => {
                    setBrouillon({ page: pageId, texte: '' })
                    setRetour(null)
                  }}
                >
                  Répondre
                </Button>
              ) : null}

              {retour && pageId && retour.page === pageId ? (
                <Notice tone={retour.ton} style={{ marginTop: 8 }}>
                  {retour.texte}
                </Notice>
              ) : null}
            </div>
          )
        })
      )}
    </Card>
  )
}
