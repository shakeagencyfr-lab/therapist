import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Chip, Notice, Overline, TextInput, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { ouvert, useDroits } from '@/cabinet/droits'
import {
  annonceDeLaRepriseAuCabinet,
  phraseDeLecture,
  saisieDuPrix,
  totalDesVentes,
  type Annonce,
} from '@/lib/boutique'
import { supabase } from '@/lib/supabase'
import { lireIntegrations, type EtatIntegrations } from '@/services/integrations'
import { verifierEnAttente, type CommandeEnAttente } from '@/services/shop'
import { useSetState } from '@/state/store'
import s from './BoutiqueView.module.css'

/** Les ventes lues à l'ouverture : les plus récentes. */
const VENTES_LUES = 20

type Genre = 'audio' | 'seance' | 'programme' | 'autre'

interface Produit {
  id: string
  title: string
  description: string
  kind: Genre
  audio_id: string | null
  price_cents: number
  currency: string
  is_active: boolean
  position: number
}

interface AudioDispo {
  id: string
  title: string
}

interface Vente {
  id: string
  title: string
  amount_cents: number
  paid_at: string | null
  patient: { display_name: string } | null
}

const GENRES: Array<{ value: Genre; label: string }> = [
  { value: 'audio', label: 'Audio' },
  { value: 'seance', label: 'Séance' },
  { value: 'programme', label: 'Programme' },
  { value: 'autre', label: 'Autre' },
]

function prix(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

/** « 29 », « 29,90 » ou « 29.90 » → centimes. NaN si illisible. */
export function centimesDe(saisie: string): number {
  const n = Number(saisie.trim().replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}

/**
 * La boutique, côté thérapeute : ce qu'elle met en vente.
 *
 * Tout passe par la base sous ses droits (politique « cabinet » de 0010) :
 * créer, modifier, activer, retirer. Ce que le patient en voit dépend de deux
 * choses réglées ailleurs — le compte Stripe et l'ouverture de la boutique,
 * dans Intégrations — et l'écran le dit avant de laisser vendre dans le vide.
 *
 * À l'ouverture, le serveur repasse aussi chez Stripe les commandes restées
 * en attente : un prélèvement confirmé des jours plus tard, un patient qui a
 * fermé l'onglet avant de revenir. Sans cela, la thérapeute était payée sans
 * le savoir, et le patient n'avait rien reçu.
 */
export function BoutiqueView() {
  const cabinet = useMaybeCabinet()
  const droits = useDroits()
  const set = useSetState()
  const [produits, setProduits] = useState<Produit[]>([])
  const [audios, setAudios] = useState<AudioDispo[]>([])
  const [ventes, setVentes] = useState<Vente[]>([])
  const [enAttente, setEnAttente] = useState<CommandeEnAttente[]>([])
  /** Ce qui n'a pas pu être lu — à dire, plutôt qu'afficher une boutique vide. */
  const [illisible, setIllisible] = useState<{ produits: boolean; ventes: boolean; audios: boolean }>({
    produits: false,
    ventes: false,
    audios: false,
  })
  const [etat, setEtat] = useState<EtatIntegrations | null>(null)
  const [chargement, setChargement] = useState(true)
  const [notice, setNotice] = useState<Annonce | null>(null)
  /** Le produit en cours de modification. */
  const [edition, setEdition] = useState<string | null>(null)

  const charger = useCallback(async () => {
    const db = supabase()
    if (!db) return
    const [p, a, v] = await Promise.all([
      db
        .from('products')
        .select('id, title, description, kind, audio_id, price_cents, currency, is_active, position')
        .is('archived_at', null)
        .order('position')
        .order('created_at'),
      db.from('audio_library').select('id, title').order('title'),
      db
        .from('orders')
        .select('id, title, amount_cents, paid_at, patient:patients (display_name)')
        .eq('status', 'payee')
        .order('paid_at', { ascending: false })
        .limit(VENTES_LUES),
    ])
    /* UNE PANNE N'EST PAS UNE BOUTIQUE VIDE. Les erreurs étaient tues : une
       lecture ratée affichait « Aucun produit pour l'instant » et faisait
       disparaître les ventes. Ce qui a été lu s'affiche ; le reste le dit. */
    if (p.error) console.warn('[boutique] produits illisibles', p.error.message)
    if (v.error) console.warn('[boutique] ventes illisibles', v.error.message)
    if (a.error) console.warn('[boutique] bibliothèque illisible', a.error.message)
    setIllisible({ produits: Boolean(p.error), ventes: Boolean(v.error), audios: Boolean(a.error) })
    if (!p.error) setProduits((p.data ?? []) as Produit[])
    if (!a.error) setAudios((a.data ?? []) as AudioDispo[])
    if (!v.error) setVentes((v.data ?? []) as unknown as Vente[])
    try {
      setEtat(await lireIntegrations())
    } catch {
      setEtat(null)
    }
    setChargement(false)
  }, [])

  /* La reprise, après la première lecture : Stripe peut prendre quelques
     secondes, la page n'a pas à les attendre. Si quelque chose a bougé, on
     relit les ventes. Même boutique fermée : l'argent déjà versé est dû. */
  const reprendre = useCallback(async (): Promise<boolean> => {
    try {
      const r = await verifierEnAttente('cabinet')
      setEnAttente(r.enAttente)
      const annonce = annonceDeLaRepriseAuCabinet(r)
      if (annonce) setNotice(annonce)
      return r.confirmees.length > 0 || r.echouees.length > 0
    } catch (err) {
      // Rien n'est perdu : la reprise repassera à la prochaine ouverture.
      console.warn('[boutique] reprise des commandes', (err as Error).message)
      return false
    }
  }, [])

  useEffect(() => {
    if (!cabinet?.reel) {
      setChargement(false)
      return
    }
    let vivant = true
    void (async () => {
      await charger()
      if ((await reprendre()) && vivant) await charger()
    })()
    return () => {
      vivant = false
    }
  }, [cabinet?.reel, charger, reprendre])

  async function basculer(p: Produit) {
    const db = supabase()
    if (!db) return
    const { error } = await db.from('products').update({ is_active: !p.is_active }).eq('id', p.id)
    setNotice(error ? { tone: 'warn', text: "Le produit n'a pas pu être modifié." } : null)
    await charger()
  }

  async function retirer(p: Produit) {
    const db = supabase()
    if (!db) return
    // Retirer, pas supprimer : les commandes passées le référencent encore.
    const { error } = await db
      .from('products')
      .update({ archived_at: new Date().toISOString(), is_active: false })
      .eq('id', p.id)
    setNotice(error ? { tone: 'warn', text: "Le produit n'a pas pu être retiré." } : { tone: 'ok', text: `« ${p.title} » retiré de la boutique.` })
    await charger()
  }

  /* LE TOTAL DIT SUR QUOI IL PORTE. Il s'annonçait « encaissés » alors qu'il
     ne sommait que les vingt dernières ventes : au-delà, la thérapeute lisait
     un chiffre d'affaires faux. Toutes les ventes tiennent à l'écran : c'est
     le vrai total. Sinon, l'écran le dit. */
  const total = totalDesVentes(ventes, VENTES_LUES)
  const lecture = phraseDeLecture([
    illisible.produits ? 'vos produits' : '',
    illisible.ventes ? 'vos ventes' : '',
    illisible.audios ? 'votre bibliothèque d’audios' : '',
  ])

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <div>
          <div className={s.crumb}>
            <Overline>Votre cabinet</Overline>
          </div>
          <h1 className={s.h1}>Boutique</h1>
        </div>
        {etat ? (
          <span className={etat.shopEnabled ? s.etatOn : s.etatOff}>
            {etat.shopEnabled ? 'Ouverte' : 'Fermée'}
          </span>
        ) : null}
      </div>
      <p className={s.intro}>
        Ce que vos patients peuvent acheter depuis leur espace : un audio, une séance, un
        programme. Le paiement arrive directement sur votre compte Stripe. Un audio acheté entre
        dans la bibliothèque du patient dès que Stripe confirme le paiement.
      </p>

      {!cabinet?.reel ? (
        <Card>
          <p className={s.muted}>Fiches de démonstration. Connectez-vous à votre cabinet pour vendre.</p>
        </Card>
      ) : !ouvert(droits, 'shop') ? (
        <Card>
          <p className={s.muted}>
            La boutique en ligne ne fait pas partie de votre offre
            {droits?.droits?.offre ? ` « ${droits.droits.offre} »` : ''}. Votre revendeur peut
            l'ouvrir depuis son espace ; vos produits, s'il y en a, sont conservés.
          </p>
        </Card>
      ) : chargement ? (
        <Card>
          <p className={s.muted}>Lecture de la boutique…</p>
        </Card>
      ) : (
        <>
          {etat && (!etat.stripe || !etat.shopEnabled) ? (
            <Notice tone="warn">
              {!etat.stripe
                ? "Votre compte Stripe n'est pas relié : vos patients ne voient pas encore la boutique. "
                : "La boutique est fermée : vos patients ne la voient pas encore. "}
              <button type="button" className={s.lien} onClick={() => set({ mode: 'integrations' })}>
                Régler dans Intégrations →
              </button>
            </Notice>
          ) : null}
          {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
          {lecture ? <Notice tone="warn">{lecture}</Notice> : null}

          <div className={s.grid}>
            <Card className={s.bloc}>
              <div className={s.blocHead}>
                <Title large as="h2">
                  En vente
                </Title>
                <span className={s.compte}>
                  {produits.filter((p) => p.is_active).length} / {produits.length} visibles
                </span>
              </div>

              {produits.length === 0 ? (
                illisible.produits ? null : (
                  <p className={s.muted}>Aucun produit pour l'instant. Ajoutez-en un ci-dessous.</p>
                )
              ) : (
                <div className={s.liste}>
                  {produits.map((p) =>
                    edition === p.id ? (
                      <div key={p.id} className={s.edition}>
                        <FicheProduit
                          produit={p}
                          audios={audios}
                          onFini={async (titre) => {
                            setEdition(null)
                            /* Une commande garde le titre et le prix du jour où elle a
                               été passée : le dire, pour qu'on ne cherche pas à
                               « corriger » un achat en modifiant le produit. */
                            setNotice({
                              tone: 'ok',
                              text: `« ${titre} » modifié. Les achats déjà faits gardent leur titre et leur prix.`,
                            })
                            await charger()
                          }}
                          onAnnuler={() => setEdition(null)}
                          onErreur={(t) => setNotice({ tone: 'warn', text: t })}
                        />
                      </div>
                    ) : (
                      <div key={p.id} className={p.is_active ? s.ligne : `${s.ligne} ${s.ligneOff}`}>
                        <span className={s.ligneText}>
                          <span className={s.ligneTitre}>
                            {p.title}
                            <span className={s.genre}>{GENRES.find((g) => g.value === p.kind)?.label}</span>
                          </span>
                          {p.description ? <span className={s.ligneDesc}>{p.description}</span> : null}
                        </span>
                        <span className={s.prix}>{prix(p.price_cents)}</span>
                        <span className={s.actions}>
                          <Button
                            variant="ghost"
                            aria-label={`Modifier « ${p.title} »`}
                            onClick={() => setEdition(p.id)}
                          >
                            Modifier
                          </Button>
                          <Button variant="ghost" onClick={() => void basculer(p)}>
                            {p.is_active ? 'Masquer' : 'Afficher'}
                          </Button>
                          <Button variant="ghost" onClick={() => void retirer(p)}>
                            Retirer
                          </Button>
                        </span>
                      </div>
                    ),
                  )}
                </div>
              )}
            </Card>

            <Card className={s.bloc}>
              <div className={s.blocHead}>
                <Title large as="h2">
                  Ajouter un produit
                </Title>
              </div>
              <FicheProduit
                audios={audios}
                onFini={async () => {
                  await charger()
                }}
                onErreur={(t) => setNotice({ tone: 'warn', text: t })}
              />
            </Card>

            {/* Validées, pas encore confirmées par la banque : ni vendues ni
                perdues. Sans cette liste, un prélèvement en cours n'existait
                nulle part — ni dans les ventes, ni ailleurs. */}
            {enAttente.length > 0 ? (
              <Card className={s.bloc}>
                <div className={s.blocHead}>
                  <Title large as="h2">
                    En attente de paiement
                  </Title>
                  <span className={s.compte}>Vérifiées à chaque ouverture de la boutique</span>
                </div>
                <div className={s.liste}>
                  {enAttente.map((c) => (
                    <div key={c.id} className={s.vente}>
                      <span className={s.ligneTitre}>{c.title}</span>
                      <span className={s.muted}>
                        {c.patient ?? '—'}
                        {` · ${new Date(c.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`}
                        {c.etat === 'reglement'
                          ? ' · confirmation de la banque en cours'
                          : ' · Stripe n’a pas répondu, nouvelle vérification à la prochaine ouverture'}
                      </span>
                      <span className={s.prix}>{prix(c.amount_cents)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}

            {ventes.length > 0 ? (
              <Card className={s.bloc}>
                <div className={s.blocHead}>
                  <Title large as="h2">
                    Dernières ventes
                  </Title>
                  <span className={s.compte}>
                    {total.complet
                      ? `${prix(total.cents)} encaissés`
                      : `${prix(total.cents)} sur les ${VENTES_LUES} dernières ventes`}
                  </span>
                </div>
                <div className={s.liste}>
                  {ventes.map((v) => (
                    <div key={v.id} className={s.vente}>
                      <span className={s.ligneTitre}>{v.title}</span>
                      <span className={s.muted}>
                        {v.patient?.display_name ?? '—'}
                        {v.paid_at
                          ? ` · ${new Date(v.paid_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
                          : ''}
                      </span>
                      <span className={s.prix}>{prix(v.amount_cents)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Le formulaire d'un produit : vide pour en créer un, rempli pour le
 * modifier. Un seul formulaire pour les deux gestes, pour qu'ils acceptent
 * exactement les mêmes choses — un prix refusé à la création ne doit pas
 * passer par la modification.
 *
 * Modifier ne touche pas au passé : une commande garde le titre et le montant
 * du jour où elle a été passée. Changer l'audio livré vaut pour les achats à
 * venir — y compris ceux dont la banque n'a pas encore confirmé le paiement.
 */
function FicheProduit({
  produit,
  audios,
  onFini,
  onAnnuler,
  onErreur,
}: {
  /** Le produit à modifier ; absent, on en crée un. */
  produit?: Produit
  audios: AudioDispo[]
  onFini: (titre: string) => Promise<void>
  onAnnuler?: () => void
  onErreur: (texte: string) => void
}) {
  const cabinet = useMaybeCabinet()
  const [titre, setTitre] = useState(produit?.title ?? '')
  const [description, setDescription] = useState(produit?.description ?? '')
  const [genre, setGenre] = useState<Genre>(produit?.kind ?? 'audio')
  const [audioId, setAudioId] = useState(produit?.audio_id ?? '')
  const [prixSaisi, setPrixSaisi] = useState(produit ? saisieDuPrix(produit.price_cents) : '')
  const [envoi, setEnvoi] = useState(false)

  const cents = centimesDe(prixSaisi)
  const prixValide = Number.isFinite(cents) && cents >= 50
  const peutEnregistrer = titre.trim().length >= 2 && prixValide && !envoi
  const champs = {
    title: titre.trim(),
    description: description.trim(),
    kind: genre,
    audio_id: genre === 'audio' && audioId ? audioId : null,
    price_cents: cents,
  }

  async function enregistrer() {
    const db = supabase()
    if (!db || !peutEnregistrer) return
    setEnvoi(true)
    if (produit) {
      const { error } = await db.from('products').update(champs).eq('id', produit.id)
      setEnvoi(false)
      if (error) {
        onErreur("Le produit n'a pas pu être modifié.")
        return
      }
      await onFini(champs.title)
      return
    }
    // L'identifiant du cabinet vient de la session : la RLS refuserait tout
    // autre cabinet de toute façon.
    const { data: ctx } = await db.rpc('my_context')
    const cabinetId = (ctx as { cabinet?: { id: string } } | null)?.cabinet?.id
    if (!cabinetId) {
      setEnvoi(false)
      onErreur('Connectez-vous à votre cabinet.')
      return
    }
    const { error } = await db.from('products').insert({ ...champs, cabinet_id: cabinetId, currency: 'eur' })
    setEnvoi(false)
    if (error) {
      onErreur("Le produit n'a pas pu être créé.")
      return
    }
    setTitre('')
    setDescription('')
    setPrixSaisi('')
    setAudioId('')
    await onFini(champs.title)
  }

  if (!cabinet?.reel) return null

  return (
    <form
      className={s.form}
      aria-label={produit ? `Modifier « ${produit.title} »` : 'Nouveau produit'}
      onSubmit={(e) => {
        e.preventDefault()
        void enregistrer()
      }}
    >
      <div className={s.champ}>
        <span className={s.label}>Type</span>
        <div className={s.chips}>
          {GENRES.map((g) => (
            <Chip key={g.value} on={genre === g.value} onClick={() => setGenre(g.value)}>
              {g.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className={s.rangee}>
        <label className={s.champ}>
          <span className={s.label}>Titre</span>
          <TextInput value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ancrage du soir, 12 min" />
        </label>
        <label className={s.champ}>
          <span className={s.label}>Prix (€)</span>
          <TextInput
            inputMode="decimal"
            value={prixSaisi}
            onChange={(e) => setPrixSaisi(e.target.value)}
            placeholder="9,90"
          />
          {prixSaisi && !prixValide ? <span className={s.hint}>Au moins 0,50 €.</span> : null}
        </label>
      </div>

      <label className={s.champ}>
        <span className={s.label}>Description</span>
        <TextInput
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ce que le patient reçoit, en une phrase."
        />
      </label>

      {genre === 'audio' ? (
        <label className={s.champ}>
          <span className={s.label}>Audio livré à l'achat</span>
          {audios.length ? (
            <select className={s.select} value={audioId} onChange={(e) => setAudioId(e.target.value)}>
              <option value="">— Aucun (vendu sans livraison automatique) —</option>
              {audios.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          ) : (
            <span className={s.hint}>
              Votre bibliothèque en base est vide : l'audio sera vendu sans livraison automatique.
            </span>
          )}
        </label>
      ) : null}

      <div className={s.boutons}>
        <Button variant="primary" type="submit" disabled={!peutEnregistrer}>
          {produit ? (envoi ? 'Enregistrement…' : 'Enregistrer') : envoi ? 'Création…' : 'Mettre en vente'}
        </Button>
        {onAnnuler ? (
          <Button variant="ghost" type="button" disabled={envoi} onClick={onAnnuler}>
            Annuler
          </Button>
        ) : null}
      </div>
    </form>
  )
}
