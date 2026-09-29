import { useEffect, useState } from 'react'
import { Notice, RoundCheck } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { timecode } from '@/lib/format'
import { couleurSure } from '@/lib/couleurs'
import { pageDuMot } from '@/lib/fil'
import { useAuth } from '@/auth/session'
import { LiensLegaux } from '@/legal/LiensLegaux'
import { usePatientData } from './usePatientData'
import { RendezVous } from './RendezVous'
import { Boutique } from './Boutique'
import { Journal } from './Journal'
import { MonCompte } from './MonCompte'
import { MotAuTherapeute } from './MotAuTherapeute'
import { Tache } from './Tache'
import { Rappels } from './Rappels'
import { Installer } from './Installer'
import { IconeOnglet, type Icone } from './IconesOnglets'
import { MaCourbe } from './MaCourbe'
import { Urgence } from './Urgence'
import s from './PatientSpace.module.css'
import j from './Journee.module.css'

type Onglet = 'jour' | 'journal' | 'rdv' | 'boutique' | 'moi'

/** Retour de Stripe : la session à vérifier, ou l'annulation. Lus une fois. */
function retourPaiement(): { commande: string | null; annule: boolean } {
  if (typeof window === 'undefined') return { commande: null, annule: false }
  const q = new URLSearchParams(window.location.search)
  const commande = q.get('commande')
  const annule = q.get('annule') === '1'
  if (commande || annule) {
    // On nettoie l'adresse : recharger ne doit pas revérifier ni ré-annoncer.
    window.history.replaceState(null, '', window.location.pathname)
  }
  return { commande, annule }
}

/** « mardi 2 septembre » — la même date que dans le journal. */
function jourDe(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** Le prénom seul : c'est ainsi que la thérapeute s'adresse à lui. */
function prenom(nom: string): string {
  return nom.split(' ')[0] ?? nom
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

function aujourdhui(): string {
  const d = new Date()
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`
}

export function PatientSpace() {
  const { context } = useAuth()
  const patient = context?.patient ?? null
  const {
    modules,
    mots,
    marquerMotLu,
    reponses,
    journal,
    journalTotal,
    voirPlusDePages,
    journalIllisible,
    affirmations,
    audios,
    scaleToday,
    notesDuSoir,
    prochaineSeance,
    prochaineSeanceLe,
    scaleQuestion,
    bookingUrl,
    bookingMode,
    bookingWidgetUrl,
    shopEnabled,
    reponsesQuiz,
    repondreQuiz,
    chargement,
    erreur,
    recharger,
  } = usePatientData(patient?.id ?? null)

  const [retour] = useState(retourPaiement)
  /* La note libre en cours d'écriture : le module ouvert, et son texte. */
  /** La tâche ouverte en plein écran, s'il y en a une. */
  const [tacheOuverte, setTacheOuverte] = useState('')
  const [onglet, setOnglet] = useState<Onglet>(retour.commande || retour.annule ? 'boutique' : 'jour')
  /** La page du journal à ouvrir, quand on y arrive depuis la réponse de sa thérapeute (0054). */
  const [pageAOuvrir, setPageAOuvrir] = useState('')
  /** La carte des rappels est-elle à l'écran ? `null` tant qu'elle vérifie. */
  const [rappelsPresents, setRappelsPresents] = useState<boolean | null>(null)

  /** L'audio en cours d'écoute : son identifiant et son URL signée. */
  const [lecture, setLecture] = useState<{ id: string; url: string } | null>(null)
  const [lectureErreur, setLectureErreur] = useState('')

  const [affIdx, setAffIdx] = useState(0)
  const [affFige, setAffFige] = useState(false)
  const [echelle, setEchelle] = useState<number | null>(null)
  const [envoi, setEnvoi] = useState('')
  /** Une case qui n'a pas pu être enregistrée : dit là où elle a été touchée. */
  const [echecCase, setEchecCase] = useState('')
  /**
   * La liste d'une journée faite : repliée ou dépliée. `null` tant que
   * personne n'y a touché — elle est alors repliée si la journée était déjà
   * faite à l'ouverture, et reste ouverte sous le doigt qui vient de cocher
   * la dernière case.
   */
  const [listeOuverte, setListeOuverte] = useState<boolean | null>(null)

  /* L'affirmation tourne toutes les cinq secondes, et s'arrête définitivement
     au premier tap : on ne reprend pas la main sur quelqu'un qui vient de
     choisir de lire. Elle ne tourne pas du tout pour qui a demandé moins
     d'animation à son téléphone — un texte qui change tout seul est
     exactement ce que ce réglage écarte. */
  useEffect(() => {
    if (affFige || affirmations.length < 2) return
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setAffIdx((i) => (i + 1) % affirmations.length), 5000)
    return () => clearInterval(t)
  }, [affFige, affirmations.length])

  /* REMONTER EN HAUT.
     Changer d'onglet ou ouvrir un exercice remplace le contenu sans toucher au
     défilement : on arrivait au milieu de l'écran suivant, souvent après sa
     fin, sur un blanc. C'est le cas le plus visible depuis le bas d'un
     journal un peu long. */
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [onglet, tacheOuverte])

  if (!patient) return null

  // Le patient ne voit jamais plus de trois actions : les audios et l'échelle
  // ont leur propre place, le reste tient dans « aujourd'hui ».
  const taches = modules.filter((m) => m.kind !== 'Audio' && m.kind !== 'Échelle')
  /* FAIT AUJOURD'HUI, pas « fait un jour ». Les exercices entre les séances
     se refont chaque jour (0051) : une case cochée hier est de nouveau à
     faire ce matin. */
  const faites = taches.filter((m) => m.faitAujourdhui).length
  const nonLus = mots.filter((m) => !m.read_at).length
  /** À quelle page répond chaque réponse de sa thérapeute (0054). */
  const pageDesMots = pageDuMot(reponses)
  const tache = tacheOuverte ? (modules.find((m) => m.id === tacheOuverte) ?? null) : null
  const journeeFaite = taches.length > 0 && faites === taches.length
  const listeVisible = listeOuverte ?? !journeeFaite

  /**
   * Cocher ou décocher pour aujourd'hui.
   *
   * Rend vrai si la base l'a enregistré. L'échec se taisait : on touchait la
   * case, rien ne bougeait, sans un mot — et l'on recommençait, ou l'on
   * repartait en croyant avoir coché.
   */
  async function basculer(id: string, done: boolean): Promise<boolean> {
    const db = supabase()
    if (!db) return false
    setEchecCase('')
    // La main est dans la liste : elle ne se replie pas sous le doigt.
    setListeOuverte((v) => v ?? true)
    const { error } = await db.rpc('patient_set_module_done', { p_module: id, p_done: done })
    if (error) {
      console.warn('[patient] case non enregistrée', error.message)
      setEchecCase("La case n'a pas pu être enregistrée. Vérifiez votre connexion et réessayez.")
      return false
    }
    await recharger()
    return true
  }

  /**
   * Écrire un mot sur un exercice.
   *
   * `patient_save_note` existe en base depuis 0007 et n'avait jamais été
   * appelée : la colonne était lue à chaque chargement, et rien ne l'écrivait.
   * C'est pourtant ce que l'aperçu de la thérapeute montre depuis le début —
   * un mot posé sur l'exercice, là où il s'est passé quelque chose, plutôt
   * qu'une page de journal.
   */
  /**
   * La note d'une tâche, écrite depuis son écran.
   *
   * Elle REND si l'écriture a eu lieu. Avant, elle avalait l'erreur et
   * l'écran affichait « Enregistré » de toute façon : le patient repartait
   * en croyant que sa thérapeute lirait son mot, et son mot n'existait nulle
   * part. C'est le pire des retours — il dispense d'aller vérifier.
   */
  async function noterTache(id: string, texte: string): Promise<boolean> {
    const db = supabase()
    if (!db) return false
    const { error } = await db.rpc('patient_save_note', { p_module: id, p_note: texte })
    if (error) {
      console.warn('[patient] mot non enregistré', error.message)
      return false
    }
    await recharger()
    return true
  }


  /**
   * Écouter : une URL signée d'une heure sur le fichier privé, obtenue sous
   * ses propres droits — elle ne voit que ce qui lui a été envoyé. L'écoute
   * est comptée au démarrage, comme avant.
   */
  async function ecouter(id: string, chemin: string | undefined) {
    const db = supabase()
    if (!db) return
    if (lecture?.id === id) {
      setLecture(null)
      return
    }
    setLectureErreur('')
    if (!chemin) {
      setLectureErreur("Cet audio n'a pas de fichier associé.")
      return
    }
    const { data, error } = await db.storage.from('audios').createSignedUrl(chemin, 3600)
    if (error || !data?.signedUrl) {
      setLectureErreur("L'audio n'a pas pu être ouvert. Réessayez dans un instant.")
      return
    }
    setLecture({ id, url: data.signedUrl })
    void db.rpc('patient_count_listen', { p_audio: id }).then(() => recharger())
  }

  /**
   * La note du soir.
   *
   * Une ligne par jour, corrigée si elle change d'avis : chaque appui posait
   * un point de plus sur la courbe de sa thérapeute, qui comptait trois
   * mesures là où il y avait une soirée d'hésitation.
   */
  async function noterEchelle(valeur: number) {
    const db = supabase()
    if (!db) return
    /* La note suit le doigt tout de suite, et revient à la précédente si la
       base la refuse : une note surlignée qui n'est enregistrée nulle part
       passait pour choisie, et le petit texte d'échec ne suffisait pas à le
       démentir. */
    const avant = echelle
    setEchelle(valeur)
    const { error } = await db.rpc('patient_note_echelle', { p_value: valeur })
    if (error) {
      setEchelle(avant)
      setEnvoi("Votre note n'a pas été enregistrée. Réessayez dans un instant.")
      return
    }
    setEnvoi("C'est noté, merci.")
    await recharger()
  }

  const valeurEchelle = echelle ?? scaleToday

  /* TROIS DESTINATIONS FIXES, DEUX QUI DÉPENDENT DU CABINET. Le commentaire
     disait « quatre, jamais plus » et la barre en produit cinq dès que
     l'agenda ET la boutique sont ouverts — c'est le cas d'un cabinet complet,
     donc le cas normal du produit vendu. Autant le dire : la journée, le
     journal et « moi » sont toujours là ; les rendez-vous et la boutique
     n'apparaissent que si la thérapeute les a ouverts. À cinq, la barre reste
     tenable au pouce parce que chaque entrée fait toute sa hauteur. */
  const onglets: Array<{ value: Onglet; label: string; icone: Icone }> = [
    { value: 'jour', label: 'Ma journée', icone: 'jour' },
    { value: 'journal', label: 'Journal', icone: 'journal' },
    /* Prendre rendez-vous est une intention à part : elle n'a rien à faire
       au bout de la liste des exercices du jour, où on ne la cherche pas. */
    ...(bookingUrl ? [{ value: 'rdv' as const, label: 'Rendez-vous', icone: 'rdv' as const }] : []),
    ...(shopEnabled ? [{ value: 'boutique' as const, label: 'Boutique', icone: 'boutique' as const }] : []),
    { value: 'moi', label: 'Moi', icone: 'moi' },
  ]
  const avecOnglets = true
  // Un onglet qui n'existe plus (boutique fermée entre-temps) ramène au jour.
  const courant: Onglet = onglets.some((o) => o.value === onglet) ? onglet : 'jour'

  return (
    <div className={avecOnglets ? `${s.page} ${s.pageOnglets}` : s.page}>
      <header className={s.head} style={{ background: couleurSure(patient.branding?.dark) }}>
        {/* La marque du cabinet, en haut : cet espace est celui de sa
            thérapeute, pas le nôtre. C'est ce que la marque blanche vend, et
            l'en-tête était le seul endroit où elle ne se voyait pas. */}
        <div className={s.marque}>
          {patient.branding?.logoUrl ? (
            <img className={s.marqueLogo} src={patient.branding.logoUrl} alt="" />
          ) : (
            <span className={s.marquePastille} style={{ background: patient.branding?.accent }}>
              {patient.branding?.logo ?? 'KL'}
            </span>
          )}
          <span className={s.marqueNom}>{patient.cabinet_name}</span>
        </div>
        <div className={s.date}>{aujourdhui()}</div>
        <h1 className={s.hello}>Bonjour {prenom(patient.display_name)}</h1>
        {affirmations.length > 0 ? (
          <>
            {/* UNE PHRASE N'EST PAS UN BOUTON. Elle en portait le rôle pour
                une seule raison — figer le défilement — et un lecteur d'écran
                l'annonçait donc « bouton », sans dire ce qu'il ferait. Son
                `onKeyDown` répondait de surcroît à N'IMPORTE QUELLE touche,
                Tab compris : passer au clavier arrêtait le défilement sans
                que personne l'ait demandé. Ce sont les pastilles qui
                deviennent des commandes, ce qu'elles avaient l'air d'être. */}
            <p className={s.affirmation}>{affirmations[affIdx]}</p>
            <div className={s.dots}>
              {affirmations.map((a, i) => (
                <button
                  key={a}
                  type="button"
                  className={i === affIdx ? `${s.dot} ${s.dotOn}` : s.dot}
                  style={i === affIdx ? { background: patient.branding?.accent } : undefined}
                  aria-label={`Affirmation ${i + 1} sur ${affirmations.length}`}
                  aria-current={i === affIdx ? 'true' : undefined}
                  onClick={() => {
                    setAffIdx(i)
                    setAffFige(true)
                  }}
                />
              ))}
            </div>
          </>
        ) : null}
      </header>

      <div className={s.body}>
        {erreur ? <Notice tone="warn">{erreur}</Notice> : null}
        {chargement ? <p className={s.count}>Chargement…</p> : null}

        {courant === 'boutique' ? (
          <Boutique
            patientId={patient.id}
            accent={patient.branding?.accent}
            retourCommande={retour.commande}
            retourAnnule={retour.annule}
            onLivre={recharger}
          />
        ) : null}

        {/* UNE PROPOSITION À LA FOIS, en haut de la journée. Les rappels
            d'abord : c'est la seule manière pour la thérapeute de joindre sa
            patiente à l'heure dite. L'installation ensuite, quand les rappels
            sont réglés, écartés — ou quand, sur iPhone, c'est elle qui doit
            venir la première. Deux demandes empilées au réveil, c'est une
            de trop. */}
        {courant === 'jour' && !tache ? (
          <>
            <Rappels
              variante="carte"
              patientId={patient.id}
              cabinet={patient.cabinet_name}
              accent={patient.branding?.accent}
              onPresence={setRappelsPresents}
            />
            {rappelsPresents === false ? (
              <Installer variante="carte" accent={patient.branding?.accent} />
            ) : null}

            {/* La prochaine séance, telle que sa thérapeute l'a écrite sur la
                fiche. Elle y était réglée et ne se lisait que côté cabinet :
                c'est pourtant la première chose qu'on vient vérifier. */}
            {prochaineSeance ? (
              <section className={s.section}>
                <div className={s.sectionHead}>
                  <span className={s.sectionTitle}>Prochaine séance</span>
                </div>
                {/* Datée par sa thérapeute (0059) : « Demain, 14 h 30 », et
                    l'instant exact pour qui le lit à voix haute. */}
                <p className={j.prochaineTexte}>
                  {prochaineSeanceLe ? <time dateTime={prochaineSeanceLe}>{prochaineSeance}</time> : prochaineSeance}
                </p>
              </section>
            ) : null}
          </>
        ) : null}

        {/* Une tâche ouverte prend tout l'écran : sur un téléphone, un
            accordéon qui pousse le reste fait perdre sa place. */}
        {courant === 'jour' && tache ? (
          <Tache
            module={tache}
            accent={patient.branding?.accent}
            reponses={reponsesQuiz}
            onFermer={() => setTacheOuverte('')}
            onBasculer={(fait) => basculer(tache.id, fait)}
            onNote={(texte) => noterTache(tache.id, texte)}
            onRepondre={(question, choix) => repondreQuiz(tache.id, question, choix)}
          />
        ) : null}

        {/* Les mots du cabinet, avant les tâches : un message de sa
            thérapeute passe avant un exercice. Ils étaient enregistrés et
            adressés depuis des mois, et aucun écran ne les ouvrait. */}
        {courant === 'jour' && !tache && mots.length > 0 ? (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <span className={s.sectionTitle}>
                {mots.length > 1 ? 'Mots de votre cabinet' : 'Un mot de votre cabinet'}
              </span>
              {nonLus > 0 ? <span className={s.count}>{nonLus} non {nonLus > 1 ? 'lus' : 'lu'}</span> : null}
            </div>
            {mots.map((mot) => {
              const lu = Boolean(mot.read_at)
              /* Une réponse à l'une de ses pages (0054) mène à la page : on
                 ne répond pas dans le vide, on répond à quelque chose. Le
                 lien n'est offert que si la page est là — effacée, ou trop
                 ancienne pour être lue, elle ne s'ouvrirait pas. */
              const page = pageDesMots[mot.push_id]
              const pageLue = page ? journal.find((g) => g.id === page) : undefined
              return (
                <div key={mot.push_id} className={s.motFil}>
                  <button
                    type="button"
                    className={s.mot}
                    onClick={() => void marquerMotLu(mot.push_id)}
                  >
                    <span
                      className={lu ? `${s.motPastille} ${s.motLu}` : s.motPastille}
                      style={!lu && patient.branding?.accent ? { background: patient.branding.accent } : undefined}
                      aria-hidden
                    />
                    <span className={s.motCorps}>
                      <span className={lu ? `${s.motTitre} ${s.motLuTitre}` : s.motTitre}>
                        {mot.title}
                      </span>
                      <span className={s.motTexte}>{mot.body}</span>
                      {/* Le jour où le mot est arrivé : un mot programmé se
                          datait de la veille, jour où il avait été écrit. */}
                      <span className={s.motDate}>{jourDe(mot.du_le)}</span>
                    </span>
                  </button>
                  {pageLue ? (
                    <button
                      type="button"
                      className={s.motLien}
                      style={patient.branding?.accent ? { color: patient.branding.accent } : undefined}
                      onClick={() => {
                        void marquerMotLu(mot.push_id)
                        setPageAOuvrir(pageLue.id)
                        setOnglet('journal')
                      }}
                    >
                      Relire ce que vous aviez écrit →
                    </button>
                  ) : null}
                </div>
              )
            })}
          </section>
        ) : null}

        {/* LE PREMIER JOUR. Avant la première séance, ou avant que sa
            thérapeute ait rien confié, la section disparaissait : on voyait
            la salutation et l'échelle du soir, et rien ne disait que les
            exercices arriveraient — l'espace avait l'air vide, ou cassé. */}
        {courant === 'jour' && !tache && !chargement && !erreur && taches.length === 0 ? (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <span className={s.sectionTitle}>Aujourd'hui</span>
            </div>
            <p className={j.vide}>
              Votre thérapeute ajoutera ici vos exercices après votre séance. En attendant, vous
              pouvez noter votre soirée ou lui écrire un mot, plus bas.
            </p>
          </section>
        ) : null}

        {courant === 'jour' && !tache && taches.length > 0 ? (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <span className={s.sectionTitle}>Aujourd'hui</span>
              <span className={s.count}>
                {faites} / {taches.length}
              </span>
            </div>

            {echecCase ? (
              <div className={j.echec}>
                <Notice tone="warn">{echecCase}</Notice>
              </div>
            ) : null}

            {/* LA JOURNÉE FAITE NE CACHE PLUS RIEN. Le message remplaçait la
                liste : une fois tout coché — ou après un mauvais tap sur la
                dernière case —, plus aucun exercice ne s'ouvrait, plus rien
                ne se décochait, et comme la case ne revenait jamais, le
                message restait là les jours suivants. Il s'affiche au-dessus ;
                la liste reste à un geste, repliée. */}
            {journeeFaite ? (
              <div className={s.done}>
                <p className={s.doneTitle}>La journée est faite.</p>
                <p className={s.doneText}>
                  Tout est coché pour aujourd'hui. Demain, vos exercices seront de nouveau à faire :
                  c'est en les refaisant qu'ils agissent.
                </p>
                <button
                  type="button"
                  className={j.revoir}
                  aria-expanded={listeVisible}
                  aria-controls="exercices-du-jour"
                  onClick={() => setListeOuverte(!listeVisible)}
                >
                  {listeVisible ? 'Replier mes exercices' : 'Revoir mes exercices'}
                </button>
              </div>
            ) : null}

            {listeVisible ? (
              <div id="exercices-du-jour" className={journeeFaite ? j.liste : undefined}>
              {taches.map((m) => {
                const fait = m.faitAujourdhui
                return (
                  <div key={m.id} className={fait ? `${s.task} ${s.taskDone}` : s.task}>
                    <RoundCheck
                      on={fait}
                      onClick={() => void basculer(m.id, !fait)}
                      label={fait ? `Décocher ${m.title} pour aujourd'hui` : `Cocher ${m.title} pour aujourd'hui`}
                      style={fait ? { background: patient.branding?.accent, borderColor: patient.branding?.accent } : undefined}
                    />
                    {/* Toute la ligne ouvre la consigne : au pouce, un lien
                        de douze pixels sous le titre ne se vise pas. */}
                    <button
                      type="button"
                      className={s.taskOuvrir}
                      onClick={() => setTacheOuverte(m.id)}
                      aria-label={`Ouvrir « ${m.title} »`}
                    >
                      <span className={fait ? `${s.taskTitle} ${s.taskTitleDone}` : s.taskTitle}>
                        {m.title}
                      </span>
                      <span className={s.taskMeta}>{m.meta}</span>
                      {m.patient_note ? <span className={s.noteEcrite}>{m.patient_note}</span> : null}
                    </button>
                    <span className={s.chevron} aria-hidden>
                      ›
                    </span>
                  </div>
                )
              })}
              </div>
            ) : null}
          </section>
        ) : null}

        {courant === 'jour' && !tache && audios.length > 0 ? (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <span className={s.sectionTitle}>Vos audios</span>
              {/* « Hors connexion » : rien dans le produit ne le permet — ni
                  service worker, ni manifeste, ni téléchargement, et l'URL
                  d'écoute est signée pour une heure et fabriquée au clic. */}
              <span className={s.count}>Réécoutables autant de fois qu’il le faut</span>
            </div>
            {lectureErreur ? <p className={s.frameNote}>{lectureErreur}</p> : null}
            {audios.map((a) => {
              const enCours = lecture?.id === a.id
              return (
                <div key={a.id}>
                  <div className={s.audio}>
                    <button
                      type="button"
                      className={s.play}
                      style={{ color: patient.branding?.accent }}
                      aria-label={`${enCours ? 'Fermer' : 'Écouter'} ${a.audio?.title ?? 'cet audio'}`}
                      aria-pressed={enCours}
                      onClick={() => void ecouter(a.id, a.audio?.storage_path)}
                    >
                      {enCours ? '■' : '▶'}
                    </button>
                    <span>
                      <span className={s.audioTitle}>{a.audio?.title ?? 'Audio'}</span>
                      <span className={s.audioMeta}>
                        {a.listens > 0 ? `Écouté ${a.listens} fois` : 'Jamais écouté'}
                      </span>
                    </span>
                    <span className={s.duration}>{timecode(a.audio?.duration_seconds ?? 0)}</span>
                  </div>
                  {enCours ? (
                    <audio className={s.lecteur} controls autoPlay preload="auto" src={lecture.url} />
                  ) : null}
                </div>
              )
            })}
          </section>
        ) : null}

        {courant === 'jour' && !tache ? (
        <section className={s.section}>
          <div className={s.sectionHead}>
            <span className={s.sectionTitle}>Ce soir</span>
          </div>
          <p className={s.question}>{scaleQuestion}</p>
          <div className={s.scale}>
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                type="button"
                className={valeurEchelle === n ? `${s.step} ${s.stepOn}` : s.step}
                style={
                  valeurEchelle === n
                    ? { background: patient.branding?.accent, borderColor: patient.branding?.accent }
                    : undefined
                }
                onClick={() => void noterEchelle(n)}
                aria-pressed={valeurEchelle === n}
              >
                {n}
              </button>
            ))}
          </div>
          {envoi ? (
            <p className={s.count} style={{ marginTop: 10 }} role="status">
              {envoi}
            </p>
          ) : null}
          {/* Sa propre courbe : il la remplit chaque soir, et seule sa
              thérapeute la voyait. */}
          <MaCourbe notes={notesDuSoir} accent={patient.branding?.accent} />
        </section>
        ) : null}

        {courant === 'journal' ? (
          <Journal
            pages={journal}
            total={journalTotal}
            onPlus={voirPlusDePages}
            illisible={journalIllisible}
            patientId={patient.id}
            cabinetId={patient.cabinet_id}
            accent={patient.branding?.accent}
            onEcrit={recharger}
            reponses={reponses}
            onReponseLue={(pushId) => void marquerMotLu(pushId)}
            pageInitiale={pageAOuvrir || undefined}
            onPageInitialeVue={() => setPageAOuvrir('')}
          />
        ) : null}

        {/* Boutique fermée, pas d'onglet : les reçus des achats passés se
            retrouvent dans « Moi » (0058). */}
        {courant === 'moi' ? <MonCompte patient={patient} achatsIci={!shopEnabled} /> : null}

        {/* En dernier dans la journée : on lui écrit une fois le reste
            regardé — les exercices faits, la note du soir posée — parce que
            c'est de tout cela qu'on a quelque chose à dire. */}
        {courant === 'jour' && !tache ? (
          <MotAuTherapeute
            patientId={patient.id}
            cabinetId={patient.cabinet_id}
            accent={patient.branding?.accent}
            onEnvoye={recharger}
          />
        ) : null}

        {courant === 'rdv' && bookingUrl ? (
          <RendezVous
            url={bookingUrl}
            widgetUrl={bookingWidgetUrl}
            mode={bookingMode}
            accent={patient.branding?.accent}
          />
        ) : null}

        {/* En bas de chaque écran, onglet et exercice ouvert compris : on ne
            choisit pas le moment où l'on en a besoin. */}
        <Urgence />
        {/* Le pied de l'espace : ce qu'il advient de ce qu'on y écrit. Dans
            un nouvel onglet — l'espace installé n'a pas de bouton « précédent ». */}
        <LiensLegaux court className={s.legal} />
      </div>

      {avecOnglets ? (
        <nav className={s.tabs} aria-label="Sections">
          {onglets.map((o) => (
            <button
              key={o.value}
              type="button"
              className={courant === o.value ? `${s.tab} ${s.tabOn}` : s.tab}
              aria-current={courant === o.value ? 'page' : undefined}
              style={courant === o.value && patient.branding?.accent ? { color: patient.branding.accent } : undefined}
              onClick={() => {
                setOnglet(o.value)
                // Changer d'onglet referme la tâche ouverte : sinon on
                // revient sur « Ma journée » et c'est un exercice qui
                // s'affiche, sans qu'on ait rien demandé.
                setTacheOuverte('')
              }}
            >
              <IconeOnglet nom={o.icone} classe={s.tabIcone} />
              <span className={s.tabLabel}>{o.label}</span>
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  )
}
