import { useEffect, useState } from 'react'
import { Notice, RoundCheck } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { timecode } from '@/lib/format'
import { useAuth } from '@/auth/session'
import { usePatientData } from './usePatientData'
import { RendezVous } from './RendezVous'
import { Boutique } from './Boutique'
import { Journal } from './Journal'
import { MonCompte } from './MonCompte'
import { MotAuTherapeute } from './MotAuTherapeute'
import { Tache } from './Tache'
import { IconeOnglet, type Icone } from './IconesOnglets'
import s from './PatientSpace.module.css'

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
    journal,
    journalIllisible,
    affirmations,
    audios,
    scaleToday,
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

  /** L'audio en cours d'écoute : son identifiant et son URL signée. */
  const [lecture, setLecture] = useState<{ id: string; url: string } | null>(null)
  const [lectureErreur, setLectureErreur] = useState('')

  const [affIdx, setAffIdx] = useState(0)
  const [affFige, setAffFige] = useState(false)
  const [echelle, setEchelle] = useState<number | null>(null)
  const [envoi, setEnvoi] = useState('')

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
  const faites = taches.filter((m) => m.done_at).length
  const nonLus = mots.filter((m) => !m.read_at).length
  const tache = tacheOuverte ? (modules.find((m) => m.id === tacheOuverte) ?? null) : null
  const journeeFaite = taches.length > 0 && faites === taches.length

  async function basculer(id: string, done: boolean) {
    const db = supabase()
    if (!db) return
    const { error } = await db.rpc('patient_set_module_done', { p_module: id, p_done: done })
    if (!error) await recharger()
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
    setEchelle(valeur)
    const { error } = await db.rpc('patient_note_echelle', { p_value: valeur })
    setEnvoi(error ? "L'enregistrement a échoué. Réessayez." : "C'est noté, merci.")
    if (!error) await recharger()
  }

  const valeurEchelle = echelle ?? scaleToday

  /* Quatre destinations, jamais plus : au pouce, une barre à cinq entrées
     devient une loterie. La journée est la première et celle qui s'ouvre ;
     le journal quitte le bas de la page pour devenir un lieu, parce qu'on
     n'écrit pas au bout d'un long défilement. */
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
      <header className={s.head} style={{ background: patient.branding?.dark }}>
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
              return (
                <button
                  key={mot.push_id}
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
                      {mot.push?.title}
                    </span>
                    <span className={s.motTexte}>{mot.push?.body}</span>
                    <span className={s.motDate}>{jourDe(mot.push?.created_at ?? '')}</span>
                  </span>
                </button>
              )
            })}
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

            {journeeFaite ? (
              <div className={s.done}>
                <p className={s.doneTitle}>La journée est faite.</p>
                <p className={s.doneText}>
                  Rien d'autre à faire aujourd'hui. À demain.
                </p>
              </div>
            ) : (
              taches.map((m) => {
                const fait = Boolean(m.done_at)
                return (
                  <div key={m.id} className={fait ? `${s.task} ${s.taskDone}` : s.task}>
                    <RoundCheck
                      on={fait}
                      onClick={() => void basculer(m.id, !fait)}
                      label={fait ? `Décocher ${m.title}` : `Cocher ${m.title}`}
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
              })
            )}
          </section>
        ) : null}

        {courant === 'jour' && !tache && audios.length > 0 ? (
          <section className={s.section}>
            <div className={s.sectionHead}>
              <span className={s.sectionTitle}>Vos audios</span>
              <span className={s.count}>Écoutables hors connexion</span>
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
            <p className={s.count} style={{ marginTop: 10 }}>
              {envoi}
            </p>
          ) : null}
        </section>
        ) : null}

        {courant === 'journal' ? (
          <Journal
            pages={journal}
            illisible={journalIllisible}
            patientId={patient.id}
            cabinetId={patient.cabinet_id}
            accent={patient.branding?.accent}
            onEcrit={recharger}
          />
        ) : null}

        {courant === 'moi' ? <MonCompte patient={patient} /> : null}

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
