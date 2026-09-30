import { useEffect, useState } from 'react'
import { Button, Card, Chip, Notice, TextInput, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { enRegle, hypnoseOuverte, useDroits } from '@/cabinet/droits'
import { etatAcces, libelleAcces, normaliserAdresse } from '@/lib/accesPatient'
import { instantDeParis, jourEtHeure, refusSeance } from '@/lib/agenda'
import { patientOf } from '@/state/selectors'
import { useAppState } from '@/state/store'
import { ChampProchaineSeance, type SaisieSeance } from './ProchaineSeance'
import { PropositionDuProgramme } from './PropositionDuProgramme'
import s from './FicheSettings.module.css'

/** Les valeurs de repli que l'assemblage affiche : à l'édition, elles valent « vide ». */
const REPLI_ECHELLE = 'Auto-évaluation'

/** La saisie de la séance d'une fiche : la date enregistrée, sinon le texte d'avant. */
function seanceDeLaFiche(fiche: { prochaineSeanceLe?: string | null; prochaineSeanceTexte?: string | null }): SaisieSeance {
  const { jour, heure } = jourEtHeure(fiche.prochaineSeanceLe)
  return { jour, heure, texte: jour ? '' : (fiche.prochaineSeanceTexte ?? '') }
}

/**
 * Réglages de la fiche : ce qu'on a retiré de la création parce que ça ne
 * s'invente pas avant la première séance — le programme, l'échelle du soir
 * et sa question, la prochaine séance. Replié par défaut : c'est un réglage,
 * pas une lecture quotidienne.
 */
export function FicheSettings({ ouvertParDefaut = false }: { ouvertParDefaut?: boolean } = {}) {
  const state = useAppState()
  const cabinet = useMaybeCabinet()
  const droits = useDroits()
  const fiche = patientOf(state)
  const [ouvert, setOuvert] = useState(ouvertParDefaut)
  const [envoi, setEnvoi] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  const [programme, setProgramme] = useState('')
  const [seances, setSeances] = useState(6)
  const [echelle, setEchelle] = useState('')
  const [question, setQuestion] = useState('')
  /** La prochaine séance : un jour et une heure de Paris, sinon une indication (0059). */
  const [seance, setSeance] = useState<SaisieSeance>({ jour: '', heure: '', texte: '' })
  /** Le programme qu'on vient de poser : son parcours par défaut se propose (0059). */
  const [proposition, setProposition] = useState('')
  /** Saisie du programme qu'on est en train de nommer. */
  const [nouveau, setNouveau] = useState('')
  const [ajout, setAjout] = useState(false)
  /** La suppression se confirme en toutes lettres : elle est irréversible. */
  const [suppression, setSuppression] = useState('')
  const [supprime, setSupprime] = useState(false)
  /** Clôture en cours : elle demande un aller-retour à la base. */
  const [cloture, setCloture] = useState(false)
  /** L'adresse telle qu'on la tape, avant de l'enregistrer. */
  const [adresse, setAdresse] = useState('')
  /** Changer l'adresse d'un espace activé : un geste qu'on ouvre exprès. */
  const [changerAdresse, setChangerAdresse] = useState(false)
  /** Un aller-retour d'accès en cours : adresse ou envoi du lien. */
  const [acces, setAcces] = useState(false)

  // Les champs suivent la fiche OUVERTE : on ne garde pas les saisies d'une
  // patient quand on passe à la suivante. Ils ne suivent pas chaque
  // rechargement du dossier — cocher un module ailleurs sur la page ne doit
  // pas vider un formulaire en cours de frappe.
  useEffect(() => {
    if (!fiche) return
    setProgramme(fiche.program.replace(/^Programme\s+/i, ''))
    setSeances(fiche.totalSessions || 6)
    setEchelle(fiche.scaleLabel === REPLI_ECHELLE ? '' : fiche.scaleLabel)
    setQuestion(fiche.scaleQuestion)
    setSeance(seanceDeLaFiche(fiche))
    setProposition('')
    setNotice(null)
    setOuvert(ouvertParDefaut)
    setNouveau('')
    setSuppression('')
    setAdresse(fiche.email ?? '')
    setChangerAdresse(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sel])

  if (!fiche || !cabinet?.reel) return null

  /* L'ACCÈS À SON ESPACE.
     Une fiche créée sans adresse ne pouvait jamais recevoir son accès ; une
     adresse fausse ne se corrigeait pas ; un lien perdu ne se renvoyait pas ;
     et l'état du compte, chargé à chaque rechargement, n'était montré nulle
     part. La thérapeute ne savait pas si son patient avait seulement ouvert
     son espace. */
  const etat = etatAcces(fiche)
  const enregistree = fiche.email ?? ''
  const modifiee = normaliserAdresse(adresse) !== normaliserAdresse(enregistree)

  async function enregistrerAdresse() {
    if (!cabinet || acces || !modifiee) return
    setAcces(true)
    setNotice(null)
    const r = await cabinet.changerAdresse(state.sel, adresse)
    setAcces(false)
    setNotice({ tone: r.ok ? 'ok' : 'warn', text: r.message })
    if (r.ok) {
      setAdresse(normaliserAdresse(adresse))
      setChangerAdresse(false)
    }
  }

  async function envoyerLien() {
    if (!cabinet || acces || !enregistree) return
    setAcces(true)
    setNotice(null)
    const r = await cabinet.envoyerLienAcces(enregistree)
    setAcces(false)
    setNotice({ tone: r.ok ? 'ok' : 'warn', text: r.message })
  }

  async function enregistrer() {
    if (!cabinet || !fiche) return
    /* La date se relit avant d'écrire : une séance à moitié saisie, ou déjà
       passée, ne part pas — et la phrase le dit sous le champ. */
    const refus = refusSeance(seance.jour, seance.heure, fiche.prochaineSeanceLe)
    if (refus) {
      setNotice({ tone: 'warn', text: refus })
      return
    }
    const instant = seance.jour && seance.heure ? instantDeParis(seance.jour, seance.heure) : null
    const avant = fiche.program.replace(/^Programme\s+/i, '').trim()
    setEnvoi(true)
    setNotice(null)
    const r = await cabinet.majFiche(state.sel, {
      // Le libellé nu, tel qu'il figure au catalogue : c'est sur lui que
      // l'écran des programmes rattache. Les fiches d'avant, préfixées
      // « Programme … », restent lues correctement à l'affichage.
      programme: programme.trim(),
      seances,
      echelle: echelle.trim(),
      question: question.trim(),
      prochaineLe: instant ? instant.toISOString() : null,
      prochaine: seance.texte.trim(),
    })
    setEnvoi(false)
    setNotice({ tone: r.ok ? 'ok' : 'warn', text: r.ok ? 'Fiche mise à jour.' : r.message })
    if (r.ok) {
      setOuvert(false)
      // Un programme posé à l'instant propose son parcours par défaut, s'il en a un.
      if (programme.trim() && programme.trim() !== avant) setProposition(programme.trim())
    }
  }

  // Le programme déjà porté par la fiche reste proposé même s'il ne figure
  // plus au catalogue : une fiche réglée l'an dernier ne doit pas perdre son
  // programme parce qu'il a été retiré depuis.
  const choix = state.programmes.includes(programme) || !programme
    ? state.programmes
    : [programme, ...state.programmes]

  /**
   * Nommer un programme depuis la fiche : c'est là qu'on s'aperçoit qu'il
   * manque, pas dans un écran de réglages qu'il faudrait aller chercher.
   */
  async function ajouterProgramme() {
    if (!cabinet || ajout) return
    const propre = nouveau.trim()
    if (!propre) return
    setAjout(true)
    setNotice(null)
    const r = await cabinet.creerProgramme(propre)
    setAjout(false)
    if (r.ok) {
      setNouveau('')
      setProgramme(propre)
      return
    }
    setNotice({ tone: 'warn', text: r.message })
  }

  /** Retirer du catalogue. Les fiches qui le portent gardent leur libellé. */
  async function retirerProgramme(label: string) {
    if (!cabinet || ajout) return
    setAjout(true)
    setNotice(null)
    const r = await cabinet.retirerProgramme(label)
    setAjout(false)
    if (r.ok && programme === label) setProgramme('')
    if (!r.ok) setNotice({ tone: 'warn', text: r.message })
  }

  const resume = [
    fiche.program || 'Aucun programme',
    fiche.totalSessions ? `${fiche.totalSessions} séances prévues` : null,
    fiche.scaleLabel === REPLI_ECHELLE ? "Rien de suivi le soir" : `Suivi : ${fiche.scaleLabel}`,
    fiche.hypnoseActivee ? 'Hypnose activée' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
    <Card className={s.card}>
      <div className={s.head}>
        <div className={s.headText}>
          <Title>Réglages de la fiche</Title>
          <span className={s.resume}>{resume}</span>
          {/* Visible fiche repliée : c'est l'état qu'on vient vérifier. */}
          <span className={s.acces} data-etat={etat}>
            <span className={s.accesPoint} aria-hidden />
            {libelleAcces(etat, enregistree)}
          </span>
          {!ouvert ? (
            <span className={s.contenu}>
              Adresse et lien d'accès, programme, échelle du soir, prochaine séance et son
              rappel, hypnose, et suppression de la fiche.
            </span>
          ) : null}
        </div>
        {ouvertParDefaut ? null : (
          <Button variant={ouvert ? 'ghost' : 'secondary'} onClick={() => setOuvert((o) => !o)}>
            {ouvert ? 'Fermer' : 'Modifier la fiche'}
          </Button>
        )}
      </div>

      {/* Le geste qui manque, à portée sans ouvrir le formulaire : un espace
          qui ne s'ouvre pas est la première chose à régler sur une fiche. */}
      {!ouvert && etat !== 'active' ? (
        <div className={s.accesGestes}>
          {etat === 'en-attente' ? (
            <Button variant="secondary" onClick={() => void envoyerLien()} disabled={acces}>
              {acces ? 'Envoi…' : "Envoyer le lien d'accès"}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setOuvert(true)}>
              Ajouter son adresse
            </Button>
          )}
        </div>
      ) : null}

      {notice ? (
        <div className={s.notice}>
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      ) : null}

      {ouvert ? (
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault()
            void enregistrer()
          }}
        >
          {/* L'adresse a son propre bouton : elle ne s'enregistre pas avec le
              reste, parce qu'elle ne se change pas comme le reste. */}
          <div className={s.field}>
            <span className={s.label}>Adresse électronique</span>
            {etat === 'active' && !changerAdresse ? (
              <>
                <span className={s.adresse}>{enregistree}</span>
                <span className={s.hint}>
                  Son espace est activé avec cette adresse : la connexion se fait depuis la page
                  d'accès de votre cabinet, sans mot de passe.
                </span>
                <button
                  type="button"
                  className={s.retirer}
                  onClick={() => {
                    setAdresse(enregistree)
                    setChangerAdresse(true)
                  }}
                >
                  Changer d'adresse
                </button>
              </>
            ) : (
              <>
                <div className={s.ajout}>
                  <TextInput
                    type="email"
                    inputMode="email"
                    value={adresse}
                    onChange={(e) => setAdresse(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      void enregistrerAdresse()
                    }}
                    placeholder="camille@exemple.fr"
                    aria-label="Adresse électronique de la fiche"
                    disabled={acces}
                  />
                  <Button
                    variant={etat === 'active' ? 'danger' : 'secondary'}
                    onClick={() => void enregistrerAdresse()}
                    disabled={acces || !modifiee}
                  >
                    {acces
                      ? 'Enregistrement…'
                      : etat === 'active'
                        ? 'Détacher et changer'
                        : "Enregistrer l'adresse"}
                  </Button>
                </div>
                {etat === 'active' ? (
                  <>
                    {/* Détacher n'est jamais silencieux : on le dit avant, en
                        toutes lettres, et le bouton le porte dans son nom. */}
                    <Notice tone="warn">
                      Son espace est activé avec {enregistree}. Changer d'adresse détache ce compte :
                      l'espace se ferme aussitôt, et ne se rouvrira qu'à la première connexion avec
                      la nouvelle adresse. À faire si l'adresse est erronée, ou si ce compte n'est
                      pas le bon.
                    </Notice>
                    <button
                      type="button"
                      className={s.retirer}
                      onClick={() => {
                        setAdresse(enregistree)
                        setChangerAdresse(false)
                      }}
                    >
                      Garder l'adresse actuelle
                    </button>
                  </>
                ) : (
                  <span className={s.hint}>
                    C'est avec cette adresse que son espace s'ouvrira, sans mot de passe. Une
                    autre fiche de votre cabinet ne peut pas porter la même.
                  </span>
                )}
              </>
            )}
            {etat === 'en-attente' && !modifiee ? (
              <div className={s.ajout}>
                <Button variant="secondary" onClick={() => void envoyerLien()} disabled={acces}>
                  {acces ? 'Envoi…' : "Envoyer le lien d'accès"}
                </Button>
                <span className={s.hint}>
                  Aucune connexion pour l'instant. Si le courriel s'est perdu, ou a expiré,
                  renvoyez-le d'ici.
                </span>
              </div>
            ) : null}
          </div>
          <div className={s.field}>
            <span className={s.label}>Programme</span>
            <div className={s.chips}>
              <Chip on={!programme} onClick={() => setProgramme('')}>
                Aucun
              </Chip>
              {choix.map((p) => (
                <Chip key={p} on={programme === p} onClick={() => setProgramme(p)}>
                  {p}
                </Chip>
              ))}
            </div>
            <div className={s.ajout}>
              <TextInput
                dictee
                value={nouveau}
                onChange={(e) => setNouveau(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  void ajouterProgramme()
                }}
                placeholder="Nommer un programme…"
                aria-label="Nom du nouveau programme"
              />
              <Button variant="secondary" onClick={() => void ajouterProgramme()} disabled={ajout || !nouveau.trim()}>
                {ajout ? 'Ajout…' : 'Ajouter'}
              </Button>
            </div>
            <span className={s.hint}>
              {state.programmes.length === 0
                ? "Vous n'avez pas encore nommé de programme. Écrivez le vôtre : il servira à toutes vos fiches."
                : 'Vos programmes, tels que vous les avez nommés. Ils sont propres à votre cabinet.'}
            </span>
            {programme && state.programmes.includes(programme) ? (
              <button
                type="button"
                className={s.retirer}
                disabled={ajout}
                onClick={() => void retirerProgramme(programme)}
              >
                Retirer « {programme} » de mes programmes
              </button>
            ) : null}
          </div>

          <div className={s.row}>
            <label className={s.field}>
              <span className={s.label}>Ce que vous suivez</span>
              <TextInput
                dictee
                value={echelle}
                onChange={(e) => setEchelle(e.target.value)}
                placeholder="Envie de fumer"
              />
              <span className={s.hint}>Le titre de la courbe, et de son échelle du soir.</span>
            </label>
            <label className={s.field}>
              <span className={s.label}>Séances prévues</span>
              <TextInput
                type="number"
                min={1}
                max={52}
                value={seances}
                onChange={(e) => setSeances(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
              />
            </label>
          </div>

          <label className={s.field}>
            <span className={s.label}>La question du soir</span>
            <TextInput
              dictee
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Où en est l'envie de fumer ?"
            />
            <span className={s.hint}>
              Elle s'affiche chaque soir dans son espace : écrivez-la comme vous la poseriez en
              séance.
            </span>
          </label>

          <ChampProchaineSeance
            saisie={seance}
            onChange={setSeance}
            enregistree={fiche.prochaineSeanceLe}
            texteEnregistre={fiche.prochaineSeanceLe ? null : fiche.prochaineSeanceTexte}
            clos={false}
            disabled={envoi}
          />

          {/* L'hypnose : une option, pas un automatisme. Tous les patients
              n'en ont pas besoin, et c'est de loin l'analyse la plus coûteuse
              du produit — la thérapeute décide, fiche par fiche. */}
          <div className={s.option}>
            <label className={s.optionLigne}>
              <input
                type="checkbox"
                checked={fiche.hypnoseActivee}
                disabled={envoi}
                onChange={(e) => {
                  const active = e.target.checked
                  void cabinet?.reglerHypnose(state.sel, active).then((r) => {
                    if (!r.ok) setNotice({ tone: 'warn', text: r.message })
                  })
                }}
              />
              <span>
                <span className={s.optionTitre}>Écrire une hypnose personnalisée</span>
                <span className={s.hint}>
                  Chaque séance produira une hypnose complète — environ trente minutes à lire à
                  voix haute — bâtie sur les formulations relevées pendant la captation. Elle
                  reste consultable depuis cette fiche.
                  {/* 0065 : l'hypnose est une option de l'offre. Le réglage de la
                      fiche se garde ; c'est l'écriture qui attend l'option — ou,
                      hors contrat, le contrat : ce n'est plus l'offre qui manque. */}
                  {hypnoseOuverte(droits)
                    ? ''
                    : !enRegle(droits)
                      ? " Votre contrat n'est pas en cours : ce réglage se garde, mais aucune hypnose ne s'écrira tant qu'il ne l'est pas de nouveau."
                      : " Elle n'est pas comprise dans votre offre : ce réglage se garde, mais aucune hypnose ne s'écrira tant que l'option Hypnose n'est pas ouverte pour votre cabinet."}
                </span>
              </span>
            </label>
          </div>

          <div className={s.actions}>
            <Button variant="primary" type="submit" disabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Button variant="ghost" onClick={() => setOuvert(false)} disabled={envoi}>
              Annuler
            </Button>
          </div>

          {/* Clore un suivi, c'est ce que le plafond de l'offre demande quand
              il est atteint. Ce n'est pas une suppression : le dossier reste,
              et la fiche se rouvre depuis la colonne de gauche. */}
          <div className={s.clore}>
            <span className={s.cloreTitre}>Clore le suivi de {fiche.name}</span>
            <span className={s.hint}>
              Sa fiche quitte vos patients actifs et libère une place sur votre offre. Son
              dossier est conservé entier, et vous pouvez rouvrir le suivi depuis « Suivis clos »,
              en bas de la colonne de gauche. Son espace, en revanche, se ferme : un suivi clos
              est un accompagnement terminé.
            </span>
            <Button
              variant="secondary"
              type="button"
              disabled={cloture || supprime}
              onClick={() => {
                setCloture(true)
                void cabinet?.archiverPatiente(state.sel).then((r) => {
                  setCloture(false)
                  setNotice({ tone: r.ok ? 'ok' : 'warn', text: r.message })
                  if (r.ok) void droits?.recharger()
                })
              }}
            >
              {cloture ? 'Clôture…' : 'Clore le suivi'}
            </Button>
          </div>

          {/* Supprimer une fiche emporte un dossier de santé entier. On fait
              écrire le nom : un bouton seul se clique par erreur, un nom
              recopié ne s'écrit pas par accident. */}
          <div className={s.danger}>
            <span className={s.dangerTitre}>Supprimer la fiche de {fiche.name}</span>
            <span className={s.hint}>
              Son dossier, ses séances, son anamnèse, vos notes de suivi, ses modules, ses audios,
              son journal et ses hypnoses partent avec la fiche. Rien ne se récupère. Seules ses
              notes d’honoraires restent à votre registre, à son nom : ce sont des pièces
              comptables. Pour confirmer, recopiez son nom.
            </span>
            <div className={s.dangerLigne}>
              <TextInput
                value={suppression}
                onChange={(e) => setSuppression(e.target.value)}
                placeholder={fiche.name}
                aria-label={`Recopiez « ${fiche.name} » pour confirmer la suppression`}
                disabled={supprime}
              />
              <Button
                variant="danger"
                type="button"
                disabled={supprime || suppression.trim() !== fiche.name}
                onClick={() => {
                  setSupprime(true)
                  void cabinet?.supprimerPatiente(state.sel).then((r) => {
                    if (!r.ok) {
                      setSupprime(false)
                      setNotice({ tone: 'warn', text: r.message })
                      return
                    }
                    // Une fiche de moins : le compte des places suit.
                    void droits?.recharger()
                  })
                }}
              >
                {supprime ? 'Suppression…' : 'Supprimer définitivement'}
              </Button>
            </div>
          </div>
        </form>
      ) : null}
    </Card>
    {/* Sous la carte, pas dedans : la fiche est refermée, et c'est la
        prochaine chose à décider pour cette personne. */}
    {proposition ? (
      <PropositionDuProgramme programme={proposition} patientId={state.sel} onFermer={() => setProposition('')} />
    ) : null}
    </>
  )
}
