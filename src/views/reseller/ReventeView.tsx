import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Notice, Pill, TextInput, Title } from '@/components/ui'
import { euroCents } from '@/lib/format'
import {
  beneficePaquet,
  centimesEnEuros,
  coutMoyenEuros,
  euroFin,
  margePaquet,
  nomDuGenre,
  pourcentage,
  prixConseilleCentimes,
  totalAppels,
} from '@/lib/revente'
import { agirRevente, lireRevente, type ActionRevente, type EtatRevente, type Paquet } from '@/services/revente'
import s from './ReventeView.module.css'

/** « 1 septembre 2026 » */
function dateLongue(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

interface BlocProps {
  etat: EtatRevente
  enCours: string
  onAgir: (action: ActionRevente, confirmation: string) => Promise<void>
}

/**
 * Revente d'IA : le second modèle commercial du revendeur.
 *
 * Dans le premier, il vend un abonnement et la thérapeute branche sa propre
 * clé Anthropic — les appels lui sont facturés directement. Dans celui-ci,
 * c'est LA CLÉ DU REVENDEUR qui paie, et il revend des crédits d'analyse
 * avec une marge.
 *
 * Le mode se choisit cabinet par cabinet : rien n'oblige à vendre la même
 * chose à tout le monde. Et le coût affiché ici est constaté sur ses propres
 * appels, jamais estimé : c'est le seul chiffre à partir duquel un prix de
 * revente veut dire quelque chose.
 */
export function ReventeView() {
  const [etat, setEtat] = useState<EtatRevente | null>(null)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')
  const [notice, setNotice] = useState('')
  const [enCours, setEnCours] = useState('')

  const charger = useCallback(async () => {
    setChargement(true)
    setErreur('')
    try {
      setEtat(await lireRevente())
    } catch (err) {
      setErreur((err as Error).message)
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => {
    void charger()
  }, [charger])

  const agir = useCallback(async (action: ActionRevente, confirmation: string) => {
    setEnCours(action.action)
    setErreur('')
    setNotice('')
    try {
      setEtat(await agirRevente(action))
      setNotice(confirmation)
    } catch (err) {
      setErreur((err as Error).message)
    } finally {
      setEnCours('')
    }
  }, [])

  if (chargement && !etat) {
    return (
      <Card>
        <p className={s.muted}>Lecture de vos réglages de revente…</p>
      </Card>
    )
  }

  return (
    <div className={s.grid}>
      {erreur ? <Notice tone="warn">{erreur}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}

      {etat && !etat.chiffrement ? (
        <Notice tone="warn">
          Le serveur ne peut pas chiffrer les clés (variable <code>INTEGRATIONS_KEY</code> absente).
          Tant qu'elle n'est pas posée, l'enregistrement d'une clé est refusé plutôt que fait en
          clair.
        </Notice>
      ) : null}

      {etat ? (
        <>
          <CleAnalyse etat={etat} enCours={enCours} onAgir={agir} />
          <CoutEtMarge etat={etat} enCours={enCours} onAgir={agir} />
          <Paquets etat={etat} enCours={enCours} onAgir={agir} />
          <CleEncaissement etat={etat} enCours={enCours} onAgir={agir} />
          <Cabinets etat={etat} enCours={enCours} onAgir={agir} />
        </>
      ) : null}
    </div>
  )
}

/* ---- La clé qui paie les analyses --------------------------------------- */

function CleAnalyse({ etat, enCours, onAgir }: BlocProps) {
  const [cle, setCle] = useState('')
  const posee = etat.anthropic
  const occupe = enCours === 'anthropic' || enCours === 'anthropic-retirer'
  const enCredits = etat.cabinets.filter((c) => c.mode === 'credits').length

  return (
    <Card className={s.bloc}>
      <div className={s.blocHead}>
        <Title large as="h2">
          Votre clé d'analyse
        </Title>
        <span className={posee ? s.etatOn : s.etatOff}>{posee ? 'Clé active' : 'Aucune clé'}</span>
      </div>
      <p className={s.blocText}>
        C'est elle qui paie les analyses des cabinets que vous avez passés en crédits. Les appels
        sont facturés sur votre compte Anthropic, et vous les revendez sous forme de crédits.
        {enCredits > 0 && !posee ? (
          <>
            {' '}
            <strong>
              {enCredits === 1 ? 'Un cabinet attend' : `${enCredits} cabinets attendent`} cette clé :
              sans elle, leurs analyses échouent.
            </strong>
          </>
        ) : null}
      </p>

      {posee ? (
        <div className={s.posee}>
          <span className={s.poseeText}>
            <span className={s.mono}>sk-ant-{posee.hint}</span> · ajoutée le {dateLongue(posee.setAt)}
          </span>
          <Button
            variant="ghost"
            disabled={occupe}
            onClick={() =>
              void onAgir(
                { action: 'anthropic-retirer' },
                'Clé retirée. Les cabinets en crédits ne peuvent plus lancer d’analyse.',
              )
            }
          >
            {enCours === 'anthropic-retirer' ? 'Retrait…' : 'Retirer'}
          </Button>
        </div>
      ) : (
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault()
            void onAgir({ action: 'anthropic', key: cle }, 'Clé vérifiée et enregistrée.').then(() => setCle(''))
          }}
        >
          <label className={s.field}>
            <span className={s.label}>Clé d'API Anthropic</span>
            <TextInput
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={cle}
              onChange={(e) => setCle(e.target.value)}
              placeholder="sk-ant-…"
              disabled={!etat.chiffrement || occupe}
            />
            <span className={s.hint}>
              Vérifiée par un appel réel, puis chiffrée. Elle ne réapparaît jamais à l'écran.
            </span>
          </label>
          <Button variant="primary" type="submit" disabled={!etat.chiffrement || occupe || !cle.trim()}>
            {enCours === 'anthropic' ? 'Vérification…' : 'Vérifier et enregistrer'}
          </Button>
        </form>
      )}
    </Card>
  )
}

/* ---- Ce qu'une action coûte, et à combien la revendre -------------------- */

function CoutEtMarge({ etat, enCours, onAgir }: BlocProps) {
  const [marge, setMarge] = useState(String(etat.margePct))
  const [decouvert, setDecouvert] = useState(String(etat.decouvertCredits))
  const occupe = enCours === 'reglages'

  const cout = coutMoyenEuros(etat.couts)
  const appels = totalAppels(etat.couts)
  const margeNombre = Number(marge) || 0
  const conseil = cout === null ? null : prixConseilleCentimes(cout, margeNombre)

  return (
    <Card className={s.bloc}>
      <div className={s.blocHead}>
        <Title large as="h2">
          Ce qu'une action vous coûte
        </Title>
        {appels > 0 ? (
          <Pill tone="neutral">{appels === 1 ? '1 appel constaté' : `${appels} appels constatés`}</Pill>
        ) : null}
      </div>

      {appels === 0 ? (
        <p className={s.blocText}>
          Aucun appel n'a encore été passé sur vos cabinets. Dès la première analyse, vous verrez
          ici le coût réel de chaque type d'action — et non une estimation. C'est ce chiffre qui
          permet de fixer un prix de revente sans deviner.
        </p>
      ) : (
        <>
          <p className={s.blocText}>
            Relevé sur vos 500 derniers appels, tous cabinets confondus. Un crédit vaut une action,
            quelle qu'elle soit : c'est votre moyenne pondérée qui compte, pas le pire des cas.
          </p>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Type d'action</th>
                <th className={s.num}>Appels</th>
                <th className={s.num}>Coût moyen</th>
              </tr>
            </thead>
            <tbody>
              {etat.couts.map((c) => (
                <tr key={c.kind}>
                  <td>{nomDuGenre(c.kind)}</td>
                  <td className={s.num}>{c.appels}</td>
                  <td className={s.num}>{euroFin(centimesEnEuros(c.moyenneCentimes))}</td>
                </tr>
              ))}
              <tr className={s.total}>
                <td>Moyenne pondérée</td>
                <td className={s.num}>{appels}</td>
                <td className={s.num}>{cout === null ? '—' : euroFin(cout)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <form
        className={s.formCol}
        onSubmit={(e) => {
          e.preventDefault()
          void onAgir(
            {
              action: 'reglages',
              margePct: Math.round(Number(marge) || 0),
              decouvertCredits: Math.round(Number(decouvert) || 0),
            },
            'Réglages enregistrés.',
          )
        }}
      >
        <div className={s.deux}>
          <label className={s.field}>
            <span className={s.label}>Marge de référence</span>
            <div className={s.avecSuffixe}>
              <TextInput
                type="number"
                min={0}
                max={1000}
                step={5}
                value={marge}
                onChange={(e) => setMarge(e.target.value)}
                disabled={occupe}
              />
              <span className={s.suffixe}>%</span>
            </div>
            <span className={s.hint}>
              {conseil === null
                ? 'Sert à calculer un prix conseillé dès que vos premiers appels seront relevés.'
                : `À cette marge, un crédit se revend ${euroCents(conseil)}.`}
            </span>
          </label>

          <label className={s.field}>
            <span className={s.label}>Découvert autorisé</span>
            <div className={s.avecSuffixe}>
              <TextInput
                type="number"
                min={0}
                max={100}
                step={1}
                value={decouvert}
                onChange={(e) => setDecouvert(e.target.value)}
                disabled={occupe}
              />
              <span className={s.suffixe}>crédits</span>
            </div>
            <span className={s.hint}>
              Une séance ne s'interrompt pas parce qu'un compteur tombe à zéro devant une patiente.
              Au-delà de ce découvert, les analyses sont refusées.
            </span>
          </label>
        </div>
        <div>
          <Button variant="primary" type="submit" disabled={occupe}>
            {occupe ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

/* ---- Les paquets vendus aux thérapeutes --------------------------------- */

const NOUVEAU: Paquet = { id: '', label: '', credits: 50, prixCentimes: 2500, actif: true }

function Paquets({ etat, enCours, onAgir }: BlocProps) {
  const [edite, setEdite] = useState<Paquet | null>(null)
  const occupe = enCours === 'paquet' || enCours === 'paquet-retirer'
  const cout = coutMoyenEuros(etat.couts)

  return (
    <Card className={s.bloc}>
      <div className={s.blocHead}>
        <Title large as="h2">
          Vos paquets de crédits
        </Title>
        {!edite ? (
          <Button variant="secondary" onClick={() => setEdite(NOUVEAU)}>
            Nouveau paquet
          </Button>
        ) : null}
      </div>
      <p className={s.blocText}>
        Ce que la thérapeute voit dans son tableau de bord, et achète par carte. La marge affichée
        est réelle : elle compare votre prix unitaire à ce que l'action vous coûte.
      </p>

      {etat.paquets.length === 0 && !edite ? (
        <p className={s.muted}>
          Aucun paquet. Sans paquet, vous pouvez toujours créditer un cabinet à la main depuis la
          liste ci-dessous.
        </p>
      ) : null}

      {etat.paquets.length > 0 ? (
        <table className={s.table}>
          <thead>
            <tr>
              <th>Paquet</th>
              <th className={s.num}>Crédits</th>
              <th className={s.num}>Prix</th>
              <th className={s.num}>Marge</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {etat.paquets.map((p) => {
              const m = margePaquet(p.prixCentimes, p.credits, cout)
              const b = beneficePaquet(p.prixCentimes, p.credits, cout)
              return (
                <tr key={p.id} className={p.actif ? undefined : s.inactif}>
                  <td>
                    {p.label}
                    {p.actif ? null : <span className={s.tag}>masqué</span>}
                  </td>
                  <td className={s.num}>{p.credits}</td>
                  <td className={s.num}>{euroCents(p.prixCentimes)}</td>
                  <td className={s.num}>
                    {m === null ? (
                      <span className={s.muted}>—</span>
                    ) : (
                      <span className={m < 0 ? s.perte : s.gain}>
                        {pourcentage(m)}
                        {b === null ? '' : ` · ${euroCents(Math.round(b * 100))}`}
                      </span>
                    )}
                  </td>
                  <td className={s.num}>
                    <Button variant="ghost" disabled={occupe} onClick={() => setEdite(p)}>
                      Modifier
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={occupe}
                      onClick={() => void onAgir({ action: 'paquet-retirer', id: p.id }, 'Paquet retiré.')}
                    >
                      Retirer
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : null}

      {edite ? (
        <EditeurPaquet
          paquet={edite}
          cout={cout}
          margeReference={etat.margePct}
          occupe={occupe}
          onAnnuler={() => setEdite(null)}
          onValider={(p) =>
            void onAgir(
              {
                action: 'paquet',
                id: p.id || undefined,
                label: p.label,
                credits: p.credits,
                prixCentimes: p.prixCentimes,
                actif: p.actif,
              },
              p.id ? 'Paquet modifié.' : 'Paquet créé.',
            ).then(() => setEdite(null))
          }
        />
      ) : null}
    </Card>
  )
}

function EditeurPaquet({
  paquet,
  cout,
  margeReference,
  occupe,
  onAnnuler,
  onValider,
}: {
  paquet: Paquet
  cout: number | null
  margeReference: number
  occupe: boolean
  onAnnuler: () => void
  onValider: (p: Paquet) => void
}) {
  const [label, setLabel] = useState(paquet.label)
  const [credits, setCredits] = useState(String(paquet.credits))
  const [euros, setEuros] = useState((paquet.prixCentimes / 100).toFixed(2))
  const [actif, setActif] = useState(paquet.actif)

  const nbCredits = Math.round(Number(credits) || 0)
  const centimes = Math.round((Number(euros.replace(',', '.')) || 0) * 100)
  const m = margePaquet(centimes, nbCredits, cout)
  const conseil = cout === null || nbCredits <= 0 ? null : prixConseilleCentimes(cout, margeReference) * nbCredits

  return (
    <form
      className={s.editeur}
      onSubmit={(e) => {
        e.preventDefault()
        onValider({ id: paquet.id, label: label.trim(), credits: nbCredits, prixCentimes: centimes, actif })
      }}
    >
      <div className={s.trois}>
        <label className={s.field}>
          <span className={s.label}>Nom du paquet</span>
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Recharge 50" />
        </label>
        <label className={s.field}>
          <span className={s.label}>Crédits</span>
          <TextInput type="number" min={1} step={1} value={credits} onChange={(e) => setCredits(e.target.value)} />
        </label>
        <label className={s.field}>
          <span className={s.label}>Prix</span>
          <div className={s.avecSuffixe}>
            <TextInput type="text" inputMode="decimal" value={euros} onChange={(e) => setEuros(e.target.value)} />
            <span className={s.suffixe}>€</span>
          </div>
        </label>
      </div>

      <p className={s.calcul}>
        {m === null ? (
          <>Le coût réel n'est pas encore connu : la marge s'affichera dès vos premiers appels.</>
        ) : (
          <>
            Marge réelle <strong className={m < 0 ? s.perte : s.gain}>{pourcentage(m)}</strong>
            {conseil === null ? null : (
              <>
                {' '}
                · à votre marge de référence de {margeReference} %, ce paquet se vendrait{' '}
                {euroCents(conseil)}
              </>
            )}
          </>
        )}
      </p>

      <label className={s.case}>
        <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />
        <span>Proposé aux thérapeutes. Décochez pour le masquer sans le supprimer.</span>
      </label>

      <div className={s.actions}>
        <Button variant="primary" type="submit" disabled={occupe || !label.trim() || nbCredits <= 0 || centimes < 50}>
          {occupe ? 'Enregistrement…' : paquet.id ? 'Enregistrer' : 'Créer le paquet'}
        </Button>
        <Button variant="ghost" type="button" onClick={onAnnuler} disabled={occupe}>
          Annuler
        </Button>
        {centimes < 50 ? <span className={s.hint}>Stripe refuse les paiements sous 0,50 €.</span> : null}
      </div>
    </form>
  )
}

/* ---- Le compte qui encaisse --------------------------------------------- */

function CleEncaissement({ etat, enCours, onAgir }: BlocProps) {
  const [cle, setCle] = useState('')
  const posee = etat.stripe
  const occupe = enCours === 'stripe' || enCours === 'stripe-retirer'

  return (
    <Card className={s.bloc}>
      <div className={s.blocHead}>
        <Title large as="h2">
          Encaissement des crédits
        </Title>
        <span className={posee ? s.etatOn : s.etatOff}>{posee ? 'Stripe connecté' : 'Non connecté'}</span>
      </div>
      <p className={s.blocText}>
        Votre compte Stripe, pour que les thérapeutes achètent leurs crédits par carte. Sans lui,
        rien n'est bloqué : vous les créditez à la main, et réglez la facture autrement.
      </p>

      {posee ? (
        <div className={s.posee}>
          <span className={s.poseeText}>
            {posee.label ? <strong>{posee.label}</strong> : null}
            {posee.label ? ' · ' : ''}
            <span className={s.mono}>{posee.hint}</span> · connecté le {dateLongue(posee.setAt)}
          </span>
          <Button
            variant="ghost"
            disabled={occupe}
            onClick={() =>
              void onAgir(
                { action: 'stripe-retirer' },
                'Compte déconnecté. L’achat de crédits par carte est fermé.',
              )
            }
          >
            {enCours === 'stripe-retirer' ? 'Déconnexion…' : 'Déconnecter'}
          </Button>
        </div>
      ) : (
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault()
            void onAgir({ action: 'stripe', key: cle }, 'Compte Stripe vérifié et connecté.').then(() => setCle(''))
          }}
        >
          <label className={s.field}>
            <span className={s.label}>Clé secrète Stripe</span>
            <TextInput
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={cle}
              onChange={(e) => setCle(e.target.value)}
              placeholder="sk_live_… ou rk_live_…"
              disabled={!etat.chiffrement || occupe}
            />
            <span className={s.hint}>
              Tableau de bord Stripe → Développeurs → Clés d'API. Ce compte est le vôtre, distinct
              de celui de vos thérapeutes.
            </span>
          </label>
          <Button variant="primary" type="submit" disabled={!etat.chiffrement || occupe || !cle.trim()}>
            {enCours === 'stripe' ? 'Vérification…' : 'Vérifier et connecter'}
          </Button>
        </form>
      )}
    </Card>
  )
}

/* ---- Le mode de chaque cabinet ------------------------------------------ */

function Cabinets({ etat, enCours, onAgir }: BlocProps) {
  const [ouvert, setOuvert] = useState('')
  const occupe = enCours === 'mode' || enCours === 'crediter'

  return (
    <Card className={s.bloc}>
      <div className={s.blocHead}>
        <Title large as="h2">
          Mode de facturation par cabinet
        </Title>
      </div>
      <p className={s.blocText}>
        Rien n'oblige à vendre la même chose à tout le monde. <strong>Clé du cabinet</strong> : la
        thérapeute branche sa propre clé Anthropic et paie ses appels directement.{' '}
        <strong>Crédits</strong> : votre clé paie, et elle vous achète des crédits.
      </p>

      {etat.cabinets.length === 0 ? (
        <p className={s.muted}>Aucun cabinet ouvert pour l'instant.</p>
      ) : (
        <table className={s.table}>
          <thead>
            <tr>
              <th>Cabinet</th>
              <th>Facturation</th>
              <th className={s.num}>Solde</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {etat.cabinets.map((c) => (
              <tr key={c.cabinetId}>
                <td>{c.nom}</td>
                <td>
                  <Pill tone={c.mode === 'credits' ? 'accent' : 'neutral'}>
                    {c.mode === 'credits' ? 'Crédits' : 'Clé du cabinet'}
                  </Pill>
                </td>
                <td className={s.num}>
                  {c.mode === 'credits' ? (
                    <span className={c.solde <= 0 ? s.perte : undefined}>{c.solde}</span>
                  ) : (
                    <span className={s.muted}>—</span>
                  )}
                </td>
                <td className={s.num}>
                  <Button
                    variant="ghost"
                    disabled={occupe}
                    onClick={() =>
                      void onAgir(
                        {
                          action: 'mode',
                          cabinetId: c.cabinetId,
                          mode: c.mode === 'credits' ? 'cle_cabinet' : 'credits',
                        },
                        c.mode === 'credits'
                          ? `${c.nom} repasse sur sa propre clé.`
                          : `${c.nom} passe en crédits.`,
                      )
                    }
                  >
                    {c.mode === 'credits' ? 'Repasser sur sa clé' : 'Passer en crédits'}
                  </Button>
                  {c.mode === 'credits' ? (
                    <Button
                      variant="ghost"
                      disabled={occupe}
                      onClick={() => setOuvert(ouvert === c.cabinetId ? '' : c.cabinetId)}
                    >
                      Créditer
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {ouvert ? (
        <Crediter
          nom={etat.cabinets.find((c) => c.cabinetId === ouvert)?.nom ?? ''}
          occupe={occupe}
          onAnnuler={() => setOuvert('')}
          onValider={(credits, note) =>
            void onAgir(
              { action: 'crediter', cabinetId: ouvert, credits, note },
              credits > 0 ? `${credits} crédits ajoutés.` : `${-credits} crédits retirés.`,
            ).then(() => setOuvert(''))
          }
        />
      ) : null}
    </Card>
  )
}

function Crediter({
  nom,
  occupe,
  onAnnuler,
  onValider,
}: {
  nom: string
  occupe: boolean
  onAnnuler: () => void
  onValider: (credits: number, note: string) => void
}) {
  const [credits, setCredits] = useState('10')
  const [note, setNote] = useState('')
  const nombre = Math.round(Number(credits) || 0)

  return (
    <form
      className={s.editeur}
      onSubmit={(e) => {
        e.preventDefault()
        onValider(nombre, note.trim())
      }}
    >
      <p className={s.calcul}>
        Créditer <strong>{nom}</strong> à la main — un règlement par virement, un geste commercial,
        ou une correction. Un nombre négatif retire des crédits.
      </p>
      <div className={s.deux}>
        <label className={s.field}>
          <span className={s.label}>Crédits</span>
          <TextInput type="number" step={1} value={credits} onChange={(e) => setCredits(e.target.value)} />
        </label>
        <label className={s.field}>
          <span className={s.label}>Motif</span>
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Virement du 2 septembre"
          />
          <span className={s.hint}>Visible par la thérapeute dans son historique.</span>
        </label>
      </div>
      <div className={s.actions}>
        <Button variant="primary" type="submit" disabled={occupe || nombre === 0}>
          {occupe ? 'Enregistrement…' : 'Inscrire au compte'}
        </Button>
        <Button variant="ghost" type="button" onClick={onAnnuler} disabled={occupe}>
          Annuler
        </Button>
      </div>
    </form>
  )
}
