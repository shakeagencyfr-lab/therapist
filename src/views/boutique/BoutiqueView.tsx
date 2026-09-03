import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Chip, Notice, Overline, TextInput, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { ouvert, useDroits } from '@/cabinet/droits'
import { supabase } from '@/lib/supabase'
import { lireIntegrations, type EtatIntegrations } from '@/services/integrations'
import { useSetState } from '@/state/store'
import s from './BoutiqueView.module.css'

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
 * créer, activer, retirer. Ce que la patiente en voit dépend de deux choses
 * réglées ailleurs — le compte Stripe et l'ouverture de la boutique, dans
 * Intégrations — et l'écran le dit avant de laisser vendre dans le vide.
 */
export function BoutiqueView() {
  const cabinet = useMaybeCabinet()
  const droits = useDroits()
  const set = useSetState()
  const [produits, setProduits] = useState<Produit[]>([])
  const [audios, setAudios] = useState<AudioDispo[]>([])
  const [ventes, setVentes] = useState<Vente[]>([])
  const [etat, setEtat] = useState<EtatIntegrations | null>(null)
  const [chargement, setChargement] = useState(true)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

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
        .limit(20),
    ])
    setProduits((p.data ?? []) as Produit[])
    setAudios((a.data ?? []) as AudioDispo[])
    setVentes((v.data ?? []) as unknown as Vente[])
    try {
      setEtat(await lireIntegrations())
    } catch {
      setEtat(null)
    }
    setChargement(false)
  }, [])

  useEffect(() => {
    if (cabinet?.reel) void charger()
    else setChargement(false)
  }, [cabinet?.reel, charger])

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

  const total = ventes.reduce((n, v) => n + v.amount_cents, 0)

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
        Ce que vos patientes peuvent acheter depuis leur espace : un audio, une séance, un
        programme. Le paiement arrive directement sur votre compte Stripe. Un audio acheté entre
        aussitôt dans la bibliothèque de la patiente.
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
                ? "Votre compte Stripe n'est pas relié : vos patientes ne voient pas encore la boutique. "
                : "La boutique est fermée : vos patientes ne la voient pas encore. "}
              <button type="button" className={s.lien} onClick={() => set({ mode: 'integrations' })}>
                Régler dans Intégrations →
              </button>
            </Notice>
          ) : null}
          {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

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
                <p className={s.muted}>Aucun produit pour l'instant. Ajoutez-en un ci-dessous.</p>
              ) : (
                <div className={s.liste}>
                  {produits.map((p) => (
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
                        <Button variant="ghost" onClick={() => void basculer(p)}>
                          {p.is_active ? 'Masquer' : 'Afficher'}
                        </Button>
                        <Button variant="ghost" onClick={() => void retirer(p)}>
                          Retirer
                        </Button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <NouveauProduit audios={audios} onCree={charger} onErreur={(t) => setNotice({ tone: 'warn', text: t })} />

            {ventes.length > 0 ? (
              <Card className={s.bloc}>
                <div className={s.blocHead}>
                  <Title large as="h2">
                    Dernières ventes
                  </Title>
                  <span className={s.compte}>{prix(total)} encaissés</span>
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

function NouveauProduit({
  audios,
  onCree,
  onErreur,
}: {
  audios: AudioDispo[]
  onCree: () => Promise<void>
  onErreur: (texte: string) => void
}) {
  const cabinet = useMaybeCabinet()
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [genre, setGenre] = useState<Genre>('audio')
  const [audioId, setAudioId] = useState('')
  const [prixSaisi, setPrixSaisi] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const cents = centimesDe(prixSaisi)
  const prixValide = Number.isFinite(cents) && cents >= 50
  const peutCreer = titre.trim().length >= 2 && prixValide && !envoi

  async function creer() {
    const db = supabase()
    if (!db || !peutCreer) return
    setEnvoi(true)
    // L'identifiant du cabinet vient de la session : la RLS refuserait tout
    // autre cabinet de toute façon.
    const { data: ctx } = await db.rpc('my_context')
    const cabinetId = (ctx as { cabinet?: { id: string } } | null)?.cabinet?.id
    if (!cabinetId) {
      setEnvoi(false)
      onErreur('Connectez-vous à votre cabinet.')
      return
    }
    const { error } = await db.from('products').insert({
      cabinet_id: cabinetId,
      title: titre.trim(),
      description: description.trim(),
      kind: genre,
      audio_id: genre === 'audio' && audioId ? audioId : null,
      price_cents: cents,
      currency: 'eur',
    })
    setEnvoi(false)
    if (error) {
      onErreur("Le produit n'a pas pu être créé.")
      return
    }
    setTitre('')
    setDescription('')
    setPrixSaisi('')
    setAudioId('')
    await onCree()
  }

  if (!cabinet?.reel) return null

  return (
    <Card className={s.bloc}>
      <div className={s.blocHead}>
        <Title large as="h2">
          Ajouter un produit
        </Title>
      </div>
      <form
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault()
          void creer()
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
            placeholder="Ce que la patiente reçoit, en une phrase."
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

        <div>
          <Button variant="primary" type="submit" disabled={!peutCreer}>
            {envoi ? 'Création…' : 'Mettre en vente'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
