import { useState } from 'react'
import { Notice, TextArea, Title } from '@/components/ui'
import { useMaybeCabinet } from '@/cabinet/context'
import { useDevis, useProfilCompris } from '@/cabinet/useJetons'
import { dateDuJour, plural } from '@/lib/format'
import { choixAGarder, momentDuMessage, type ChoixDuBrouillon } from '@/lib/seance'
import {
  buildPatientContext,
  derniereReponseEstMaquette as derniereEstMaquette,
  echecDeRetouche,
  messageDEchec,
  refreshProfile,
  retoucher,
} from '@/services/aiClient'
import { RetourIA } from '@/components/retouche/RetourIA'
import { RETOUCHE_ABANDONNEE, versionDe, type IssueRetouche, type RetourDeLaPraticienne } from '@/lib/retouche'
import { nouvelleSeance, profileOf } from '@/state/selectors'
import { useStore } from '@/state/store'
import { useEcritureConsignes } from '@/cabinet/useEcritureConsignes'
import type { LibraryAudio, PatientModule, PsychProfile, SessionDraft } from '@/types/domain'
import { CoutEnJetons } from '@/views/jetons/CoutEnJetons'
import { HypnoseCard } from './HypnoseCard'
import s from './DraftStep.module.css'

type SuggestedAudio = LibraryAudio & { why: string }

const cx = (...parts: Array<string | false>) => parts.filter(Boolean).join(' ')

/** Étape 4 : le brouillon. Rien n'entre au dossier avant la barre d'envoi. */
export function DraftStep() {
  const { state, set, read } = useStore()
  const cabinet = useMaybeCabinet()
  const draft = state.draft
  /** L'envoi en base : en cours, ou l'échec à afficher. */
  const [envoi, setEnvoi] = useState<'repos' | 'en-cours'>('repos')
  /** Le brouillon gardé pour plus tard : en cours d'écriture. */
  const [garde, setGarde] = useState<'repos' | 'en-cours'>('repos')
  const [echecEnvoi, setEchecEnvoi] = useState('')
  /** Envoi des audios en cours : le bouton ne se reclique pas. */
  const [envoiAudios, setEnvoiAudios] = useState(false)
  /** Le navigateur a refusé la copie du message : on le dit. */
  const [echecCopie, setEchecCopie] = useState('')
  /** L'envoi du message dans l'espace du patient, et son échec éventuel. */
  const [envoiMessage, setEnvoiMessage] = useState<'repos' | 'en-cours'>('repos')
  const [echecMessage, setEchecMessage] = useState('')
  /** L'actualisation du profil : ce qu'elle a donné, ou pourquoi elle a échoué. */
  const [profil, setProfil] = useState<{ ton: 'ok' | 'warn'; texte: string } | null>(null)
  /* Un crochet ne se pose pas après un retour anticipé : l'écriture des
     consignes était déclarée sous le `return null` ci-dessous. */
  const consignes = useEcritureConsignes(cabinet?.majConsigne ?? (async () => ({ ok: false })))
  /* EN JETONS (0065), UNE ACTUALISATION QUI SUIT LA SÉANCE EST COMPRISE —
     une seule, et seulement si le brouillon a été payé. L'écran l'annonçait
     « incluse » dès qu'une séance existait : la seconde, ou celle d'une
     séance analysée avant les jetons, se payait sans prévenir, et le bouton
     ne se fermait jamais faute de solde. La base dit donc si elle l'est
     encore (useProfilCompris) ; et dès qu'une actualisation a réussi ici, la
     suivante s'annonce à son prix sans attendre la relecture. */
  const [profilDejaCompris, setProfilDejaCompris] = useState<string | null>(null)
  const seanceDuProfil = state.sessionPatient !== '' && state.sessionId ? state.sessionId : null
  const profilCompris = useProfilCompris(seanceDuProfil)
  const devisProfil = useDevis('profil', profilCompris && profilDejaCompris !== seanceDuProfil)

  /* La fiche de la séance, pas celle de la barre latérale : c'est elle qui
     recevra la note, les modules et les audios, même si la sélection a
     bougé ailleurs entre-temps. */
  const key = state.sessionPatient
  const patient = state.patients[key]
  if (!draft || !patient) return null

  const firstName = patient.name.split(' ')[0]
  /** Le message part une fois, après la validation, et jamais un texte de maquette. */
  const messageEnvoyable =
    Boolean(draft.message.trim()) && state.sent && !state.msgEnvoye && !state.draftMaquette

  const proposals = draft.propositions ?? []
  const retainedCount = proposals.filter((_, i) => !state.proposalOff[i]).length

  /* Audios de la bibliothèque : deux enregistrements par catégorie retenue. */
  const suggested: SuggestedAudio[] = []
  const sugCats = (draft.categories_audio ?? []).filter((c) => c && state.cats.includes(c.categorie))
  sugCats.forEach((c) => {
    state.lib
      .filter((audio) => audio.cat === c.categorie)
      .slice(0, 2)
      .forEach((audio) => {
        if (!suggested.some((x) => x.id === audio.id)) {
          suggested.push({ ...audio, why: c.pourquoi || c.categorie })
        }
      })
  })
  const sugOn = suggested.filter((audio) => !state.sugOff[audio.id])

  const profFresh = Boolean(state.profNew[key])
  const profBusy = state.profGen === key

  /**
   * Envoyer les audios retenus dans la bibliothèque du patient.
   *
   * Sur un cabinet réel, l'écran annonçait l'envoi sans rien écrire : les
   * audios n'arrivaient qu'à la validation de la note, et pas du tout si la
   * thérapeute quittait avant. Ils partent maintenant tout de suite, et le
   * message n'apparaît qu'au retour de la base.
   */
  async function sendSuggested() {
    if (!sugOn.length || envoiAudios) return
    if (cabinet?.reel) {
      setEnvoiAudios(true)
      // L'écriture est idempotente (patient_id, audio_id) : un audio déjà
      // envoyé ne fait pas de doublon, ni ici ni à la validation de la note.
      const retours = await Promise.all(sugOn.map((audio) => cabinet.envoyerAudio(audio.id, [key])))
      setEnvoiAudios(false)
      const echecs = retours.filter((r) => !r.ok).length
      set({
        sugSent: echecs
          ? "Certains audios n'ont pas pu être envoyés. Réessayez."
          : `${plural(sugOn.length, 'audio ajouté', 'audios ajoutés')} à la bibliothèque de ${patient.name}.`,
      })
      return
    }
    // Fiches de démonstration : la bibliothèque se remplit en mémoire.
    set((prev) => {
      const existing = prev.extraAudios[key] ?? []
      const add = sugOn
        .filter(
          (audio) =>
            !patient.audios.some((x) => x.title === audio.title) &&
            !existing.some((x) => x.title === audio.title),
        )
        .map((audio) => ({
          title: audio.title,
          meta: `Envoyé à l'instant · ${audio.cat}`,
          duration: audio.duration === '—' ? '10:00' : audio.duration,
        }))
      return {
        extraAudios: add.length
          ? { ...prev.extraAudios, [key]: existing.concat(add) }
          : prev.extraAudios,
        sugSent: `${plural(sugOn.length, 'audio ajouté', 'audios ajoutés')} à la bibliothèque de ${patient.name}.`,
      }
    })
  }

  /**
   * Garder ce que la thérapeute vient de corriger.
   *
   * À la sortie du champ, pas à chaque frappe : le dossier n'a pas besoin de
   * connaître chaque lettre, et une écriture par caractère sur une synthèse
   * de neuf lignes ferait du bruit pour rien. Un échec ne s'affiche pas
   * ici — le texte est encore à l'écran, l'envoi le réécrira, et
   * interrompre une relecture pour une panne réseau d'une seconde coûterait
   * plus qu'elle.
   *
   * APPELÉE AUSSI APRÈS LE DÉMONTAGE : un champ qui dictait annonce la fin
   * de sa dictée en se démontant — après « Garder en brouillon » ou
   * « Changer de patient », quand le magasin est déjà vidé. Le texte et la
   * séance sont ceux de ce rendu-ci ; les choix aussi dans ce cas-là
   * (choixAGarder), sans quoi les choix par défaut écrasaient ceux qu'elle
   * venait de garder.
   */
  function garderLesCorrections() {
    if (!cabinet?.reel || !state.sessionId || !state.draft) return
    // Envoyée, la note se corrige encore ; les choix, eux, ont été faits.
    void cabinet.majBrouillon(state.sessionId, state.draft, state.sent ? undefined : choixAGarder(read(), state))
  }

  /** Les choix faits sur le brouillon : ils se gardent avec lui. */
  function choixCourants() {
    const now = read()
    return { proposalOff: now.proposalOff, sugOff: now.sugOff, syntheseOk: now.syntheseOk }
  }

  /* ---- Les retouches par l'IA (0066) ----------------------------------- *
   * Une pièce du brouillon à la fois : la synthèse, le message, un module
   * proposé. Le reste du brouillon et la matière de la séance partent en
   * contexte ; la pièce retouchée prend la place de l'ancienne à l'écran,
   * puis dans la séance en base, comme une correction à la main. La version
   * d'avant reste ici, en mémoire, pour « Annuler la retouche ».            */

  /** Ce qui accompagne chaque retouche : le dossier, la séance, le reste du brouillon. */
  function contexteDeRetouche() {
    const now = read()
    const d = now.draft
    return {
      context: buildPatientContext(now, key),
      extra: {
        // Le serveur n'en relit qu'un extrait : inutile d'envoyer trois heures de parole.
        transcript: now.transcript.slice(0, 20_000),
        notes: now.sessionNotes.slice(0, 8_000),
        brouillon: d
          ? {
              synthese: d.synthese,
              mots: d.mots,
              themes: d.themes,
              message: d.message,
              propositions: (d.propositions ?? []).map((p) => ({ titre: p.titre, type: p.type })),
            }
          : {},
      },
      sessionId: now.sessionPatient === key ? now.sessionId : null,
    }
  }

  /**
   * Le brouillon retouché rejoint la séance en base — TEL QU'IL VIENT D'ÊTRE
   * POSÉ, passé en argument. Relu dans le magasin juste après `set`, il
   * était encore l'ancien (read() rend le dernier rendu, et React n'a pas
   * rendu entre les deux) : la retouche payée s'enregistrait sans elle, et
   * son annulation enregistrait le texte refusé — celui qu'une reprise
   * aurait ramené, et envoyé. `relu` : ce que la retouche change aux choix
   * (la synthèse n'est plus relue), pour la même raison.
   *
   * Un échec ne se dit pas ici, pas plus qu'à la sortie d'un champ
   * (garderLesCorrections) : le texte est à l'écran, et l'envoi le réécrira.
   */
  async function garderLaRetouche(suivant: SessionDraft, relu: Partial<ChoixDuBrouillon> = {}) {
    const now = read()
    if (!cabinet?.reel || !now.sessionId) return
    await cabinet.majBrouillon(now.sessionId, suivant, now.sent ? undefined : { ...choixCourants(), ...relu })
  }

  /**
   * Pose une pièce dans le brouillon, et rend le brouillon qui en résulte :
   * c'est lui qui s'enregistre (garderLaRetouche). Null : plus de brouillon.
   */
  function poserDansLeBrouillon(
    patch: Partial<SessionDraft>,
    relu: Partial<{ syntheseOk: boolean; msgOk: boolean }> = {},
  ): SessionDraft | null {
    const d = read().draft
    if (!d) return null
    set((prev) => (prev.draft ? { draft: { ...prev.draft, ...patch }, ...relu } : {}))
    return { ...d, ...patch }
  }

  /**
   * La séance a-t-elle quitté l'écran pendant l'appel ? La fenêtre est
   * modale, mais une retouche dure trente secondes : rien ne se pose dans
   * le brouillon d'une autre séance.
   */
  function seanceQuittee(seance: string | null): { ok: false; message: string } | null {
    const now = read()
    return now.sessionId !== seance || !now.draft
      ? { ok: false, message: "Le brouillon a changé pendant la retouche : rien n'y a été posé." }
      : null
  }

  /** Retouche la synthèse ou le message : un texte seul. */
  function retoucherTexte(cible: 'synthese' | 'message') {
    const relu = cible === 'synthese' ? { syntheseOk: false } : { msgOk: false }
    const reluDansLesChoix: Partial<ChoixDuBrouillon> = cible === 'synthese' ? { syntheseOk: false } : {}
    return async (retour: RetourDeLaPraticienne, abandon?: AbortSignal): Promise<IssueRetouche> => {
      const seance = read().sessionId
      const avant = read().draft?.[cible] ?? ''
      // Vidé à la main : il n'y a plus de texte de l'IA à retoucher.
      if (!avant.trim()) return { ok: false, message: 'Ce texte est vide : écrivez-le avant de le faire retoucher.' }
      let texte: string
      try {
        texte = (await retoucher({ cible, ...retour, actuel: avant, ...contexteDeRetouche() })).texte.trim()
      } catch (err) {
        return echecDeRetouche(err)
      }
      // La fenêtre refermée pendant l'appel : le texte en place ne bouge pas.
      if (abandon?.aborted) return RETOUCHE_ABANDONNEE
      const quittee = seanceQuittee(seance)
      if (quittee) return quittee
      if (!texte) return { ok: false, message: "La retouche est revenue vide : le texte d'avant reste en place." }
      const retouche = poserDansLeBrouillon({ [cible]: texte }, relu)
      if (retouche) await garderLaRetouche(retouche, reluDansLesChoix)
      return {
        ok: true,
        version: texte,
        annuler: async () => {
          const quitteeAvant = seanceQuittee(seance)
          if (quitteeAvant) return quitteeAvant
          const retabli = poserDansLeBrouillon({ [cible]: avant }, relu)
          if (retabli) await garderLaRetouche(retabli, reluDansLesChoix)
          return { ok: true, message: '' }
        },
      }
    }
  }

  /** Retouche un module proposé, et lui seul : les autres ne bougent pas. */
  function retoucherProposition(i: number) {
    return async (retour: RetourDeLaPraticienne, abandon?: AbortSignal): Promise<IssueRetouche> => {
      const seance = read().sessionId
      const avant = read().draft?.propositions?.[i]
      if (!avant) return { ok: false, message: "Ce module n'est plus dans le brouillon." }
      let rendu: SessionDraft['propositions'][number]
      try {
        rendu = await retoucher({ cible: 'proposition', ...retour, actuel: avant, ...contexteDeRetouche() })
      } catch (err) {
        return echecDeRetouche(err)
      }
      // La fenêtre refermée pendant l'appel : le module en place ne bouge pas.
      if (abandon?.aborted) return RETOUCHE_ABANDONNEE
      const quittee = seanceQuittee(seance)
      if (quittee) return quittee
      if (!rendu.titre?.trim()) return { ok: false, message: "La retouche est revenue vide : le module d'avant reste en place." }
      const nouvelle = { titre: rendu.titre.trim(), pourquoi: (rendu.pourquoi ?? '').trim(), type: rendu.type }
      /* Le brouillon suivant se bâtit ici, et c'est lui qui s'enregistre :
         relu après `set`, le magasin rendait encore l'ancien. */
      const poser = (p: SessionDraft['propositions'][number]) => {
        const propositions = (read().draft?.propositions ?? []).map((x, j) => (j === i ? p : x))
        return poserDansLeBrouillon({ propositions })
      }
      const retouche = poser(nouvelle)
      if (retouche) await garderLaRetouche(retouche)
      return {
        ok: true,
        version: versionDe(nouvelle),
        annuler: async () => {
          const quitteeAvant = seanceQuittee(seance)
          if (quitteeAvant) return quitteeAvant
          const retabli = poser(avant)
          if (retabli) await garderLaRetouche(retabli)
          return { ok: true, message: '' }
        },
      }
    }
  }

  /**
   * Garder le brouillon pour plus tard, sans rien envoyer.
   *
   * Le brouillon est déjà en base depuis sa rédaction ; ce geste y écrit la
   * dernière version relue ET les choix faits dessus, puis libère l'écran
   * pour la séance suivante. Rien n'entre dans le parcours du patient : il
   * se reprend depuis l'onglet Séance ou depuis sa fiche.
   */
  async function garderPourPlusTard() {
    if (!cabinet?.reel || !state.sessionId || !state.draft || state.sent || garde === 'en-cours') return
    setGarde('en-cours')
    setEchecEnvoi('')
    const r = await cabinet.majBrouillon(state.sessionId, state.draft, choixCourants())
    setGarde('repos')
    if (!r.ok) {
      setEchecEnvoi(r.message || "Le brouillon n'a pas pu être gardé. Réessayez.")
      return
    }
    set({
      ...nouvelleSeance(),
      avisSeance: `Brouillon de ${firstName} gardé, rien n'est envoyé. Reprenez-le ci-dessous, ou depuis sa fiche (Séances), quand vous voudrez le valider.`,
    })
  }

  function sendDraft() {
    // Garde de fond : le bouton est déjà barré, mais rien de fictif ne doit
    // pouvoir atteindre un dossier par un autre chemin.
    if (state.draftMaquette || state.sent || envoi === 'en-cours') return
    const retained: PatientModule[] = proposals
      .filter((_, i) => !state.proposalOff[i])
      .map((proposal) => ({
        title: proposal.titre,
        meta: `Ajouté depuis la séance du ${dateDuJour()}`,
        kind: proposal.type,
        done: false,
        fresh: true,
        // Ce que la séance a dit de ce module : sans lui, le patient reçoit
        // un titre à cocher et rien à lire.
        pourquoi: proposal.pourquoi,
      }))

    // Fiches de démonstration : le parcours se met à jour en mémoire.
    if (!cabinet?.reel || !state.sessionId) {
      set((prev) => ({
        sent: true,
        extra: { ...prev.extra, [key]: (prev.extra[key] ?? []).concat(retained) },
      }))
      return
    }

    // Fiche réelle : les modules entrent en base et la fiche est rechargée
    // depuis là — rien n'est ajouté en mémoire, sinon ils apparaîtraient deux
    // fois. La séance est clôturée, le compteur de séances avance.
    setEnvoi('en-cours')
    setEchecEnvoi('')
    const retenues = proposals.filter((_, i) => !state.proposalOff[i])
    // La séance envoyée : ses consignes sont comprises dans son forfait (mode jetons).
    const seance = state.sessionId
    void cabinet
      .envoyerSeance(state.sessionId, key, {
        modules: retained,
        audioIds: sugOn.map((a) => a.id),
        /* Le brouillon RELU part avec l'envoi. Les corrections apportées à la
           synthèse et au message au patient ne quittaient jamais l'écran : la
           colonne `draft` gardait le texte de l'IA, et c'est lui que la
           fiche relisait — et que l'hypnose reprenait comme « les mots de la
           séance ». */
        draft: state.draft,
      })
      .then((r) => {
        setEnvoi('repos')
        if (!r.ok) {
          setEchecEnvoi(r.message || "L'envoi a échoué. Réessayez.")
          return
        }
        /* La séance est versée : le compteur de la fiche la connaît
           désormais. On oublie le profil « fraîchement généré », sans quoi
           son +1 s'ajouterait à un compteur qui compte déjà cette séance —
           et le badge annonçait deux séances pour une. */
        set((prev) => {
          const profNew = { ...prev.profNew }
          delete profNew[key]
          // L'envoi a écrit le brouillon relu : un ancien échec ne vaut plus.
          return { sent: true, profNew, notice: '' }
        })
        /* Les consignes s'écrivent APRÈS, et le savoir change la conduite à
           tenir en cas d'échec : la séance, les modules et les audios sont
           déjà en place, il ne manquerait que du texte. */
        void consignes.ecrire(key, r.modules ?? [], retenues, seance)
      })
  }

  /**
   * Copier le message.
   *
   * « ✓ Copié » s'affichait avant la réponse du navigateur — et même quand il
   * refusait (page non sécurisée, permission retirée) : la thérapeute collait
   * alors autre chose dans son courriel. Le succès ne se pose qu'une fois la
   * copie faite.
   */
  async function copyMessage() {
    setEchecCopie('')
    const text = read().draft?.message ?? ''
    try {
      if (!navigator.clipboard) throw new Error('presse-papiers indisponible')
      await navigator.clipboard.writeText(text)
      set({ msgOk: true })
    } catch {
      set({ msgOk: false })
      setEchecCopie('Le navigateur a refusé la copie : sélectionnez le texte et copiez-le à la main.')
    }
  }

  /**
   * Envoyer le message dans l'espace du patient.
   *
   * L'écran l'annonçait « envoyé le soir de la séance » et n'offrait que
   * « Copier » : rien ne partait. Il passe maintenant par les notifications
   * du cabinet (push_notifications) : il apparaît dans l'espace du patient au
   * moment prévu, et sur son téléphone s'il y a activé les rappels.
   *
   * APRÈS LA VALIDATION SEULEMENT. Le message parle des exercices que la note
   * envoie : parti avant elle, il annoncerait ce qui n'arrivera peut-être
   * jamais. Et UNE FOIS : le moment d'envoi est gardé dans l'état, pas dans
   * l'écran — un aller-retour sur la fiche ne le fait pas repartir.
   */
  async function sendMessage() {
    const now = read()
    const texte = (now.draft?.message ?? '').trim()
    if (!texte || !now.sent || now.msgEnvoye || now.draftMaquette || envoiMessage === 'en-cours') return
    const moment = momentDuMessage()
    const confirmation = moment.immediat
      ? `Parti dans l'espace de ${firstName}, et sur son téléphone si les rappels y sont activés.`
      : `Programmé ${moment.dit} : il apparaîtra dans l'espace de ${firstName} à ce moment-là, et sur son téléphone si les rappels y sont activés.`
    if (!cabinet?.reel) {
      set({ msgEnvoye: `${confirmation} (Démonstration : rien ne part vraiment.)` })
      return
    }
    setEnvoiMessage('en-cours')
    setEchecMessage('')
    const r = await cabinet.envoyerNotification(
      { title: 'Un mot après votre séance', body: texte, when: moment.libelle, quand: moment.quand },
      [key],
    )
    setEnvoiMessage('repos')
    if (!r.ok) {
      setEchecMessage(r.message || "Le message n'a pas pu partir. Réessayez.")
      return
    }
    set({ msgEnvoye: confirmation })
  }

  /**
   * Actualisation du profil depuis le brouillon : mêmes états que la fiche
   * client, une séance de plus est comptée dès que le profil revient.
   *
   * SAUF APRÈS L'ENVOI. La séance est alors déjà au compteur de la fiche :
   * la passer à `enregistrerProfil` la comptait une seconde fois, et le « +1 »
   * du profil fraîchement généré faisait de même à l'écran. Après l'envoi, le
   * profil s'enregistre comme depuis la fiche — sans séance — et la version
   * d'écran s'efface dès que le dossier la relit.
   *
   * LES ÉCHECS SE DISENT. L'erreur de l'analyse était avalée en « Réessayez »,
   * le résumé écrit dans `profNote` ne s'affichait nulle part ici, et
   * l'enregistrement partait sans qu'on regarde s'il avait réussi : un profil
   * payé pouvait disparaître au rechargement sans un mot.
   */
  async function refreshProfil() {
    const now = read()
    if (now.profGen) return
    const current = profileOf(now, key)
    const dejaComptee = now.sent
    setProfil(null)
    set({ profGen: key })
    try {
      const result = await refreshProfile({
        context: buildPatientContext(now, key),
        notes: now.sessionNotes.trim(),
        synthese: now.draft?.synthese ?? '',
        transcript: now.transcript.trim(),
        // Depuis la séance de cette fiche : une actualisation comprise dans son forfait.
        sessionId: now.sessionPatient === key ? now.sessionId : null,
      })
      const next: PsychProfile = {
        updated: "Actualisé à l'instant, depuis la dernière séance",
        portrait: result.portrait || current?.portrait || '',
        axes: result.axes
          .filter((axis) => axis && axis.label)
          .map((axis) => ({
            label: axis.label,
            value: Math.max(0, Math.min(100, Math.round(axis.value))),
            note: axis.note || '',
          })),
        levers: result.levers.filter((lever) => lever && lever.title),
        dynamique: result.dynamique || current?.dynamique,
        alliance: result.alliance || current?.alliance,
        care: result.care.filter((item) => typeof item === 'string'),
        /* L'historique suit : l'IA ne le rend pas, et sans lui les courbes
           des axes disparaissaient de la fiche au moment même où une version
           de plus venait les enrichir (le même défaut que PsychProfile). */
        historique: current?.historique,
      }
      const resume = result.resume || 'Profil actualisé.'
      // L'actualisation comprise vient de servir, si elle l'était : la suivante se paie.
      if (now.sessionPatient === key && now.sessionId) setProfilDejaCompris(now.sessionId)
      set((prev) => ({
        profGen: '',
        profNew: { ...prev.profNew, [key]: next },
        profNote: { ...prev.profNote, [key]: resume },
      }))
      setProfil({ ton: 'ok', texte: resume })
      // Le profil est versionné en base : la fiche le retrouvera au prochain
      // chargement, avec le nombre de séances qui donne sa marge.
      if (cabinet?.reel && !derniereEstMaquette()) {
        const r = await cabinet.enregistrerProfil(key, dejaComptee ? null : now.sessionId, {
          portrait: next.portrait,
          axes: next.axes,
          levers: next.levers,
          dynamique: next.dynamique,
          alliance: next.alliance,
          care: next.care,
          resume: result.resume ?? '',
        })
        if (!r.ok) {
          setProfil({
            ton: 'warn',
            texte: `${r.message} Il reste affiché, mais la fiche ne le retrouvera pas au prochain chargement : réessayez.`,
          })
          return
        }
        if (dejaComptee) {
          /* Écrit, et la séance déjà comptée : le dossier fait foi. La
             version d'écran se retire, sans quoi son « +1 » compterait la
             séance une seconde fois sur le badge. */
          await cabinet.recharger()
          set((prev) => {
            const profNew = { ...prev.profNew }
            delete profNew[key]
            return { profNew }
          })
        }
      }
    } catch (error) {
      // Le message du serveur, tel quel : il dit déjà la cause et le remède.
      set({ profGen: '' })
      setProfil({
        ton: 'warn',
        texte: messageDEchec(error, "L'actualisation a échoué : le serveur n'a pas répondu. Le profil en place n'a pas bougé, réessayez."),
      })
    }
  }

  return (
    <div className={s.step}>
      {/* Un brouillon de maquette ne se déguise pas en analyse : il est annoncé
          comme tel, et la barre d'envoi refuse de le verser au dossier. */}
      {state.draftMaquette ? (
        <section className={s.fake}>
          <h2 className={s.fakeTitle}>Ceci n'est pas une analyse de votre séance</h2>
          <p className={s.fakeBody}>
            Le serveur tourne en mode maquette : ce texte est un exemple fixe, écrit d'avance, qui
            ne tient aucun compte de ce que vous venez d'enregistrer. Il ne peut pas être versé au
            dossier. Renseignez la clé d'analyse du serveur pour obtenir une vraie note de séance.
          </p>
        </section>
      ) : null}

      {/* Le brouillon n'a pas pu rejoindre la séance en base (RecordStep) :
          il est à l'écran, pas au dossier, et la thérapeute doit le savoir. */}
      {state.notice ? <Notice tone="warn">{state.notice}</Notice> : null}

      {/* Synthèse ------------------------------------------------------ */}
      <section className={s.card}>
        <div className={s.head}>
          <Title large as="h2">
            Synthèse de séance
          </Title>
          {/* « Valider ce bloc » laissait croire à une étape obligatoire : rien
              ne lit cet état, et l'envoi ne le consulte pas. C'est un repère
              de relecture, sur une note qui se lit en plusieurs fois entre
              deux patients — et c'est très bien, à condition de le nommer. */}
          <button
            type="button"
            className={cx(s.validate, state.syntheseOk && s.validateOn)}
            aria-pressed={state.syntheseOk}
            onClick={() => set((prev) => ({ syntheseOk: !prev.syntheseOk }))}
          >
            {state.syntheseOk ? '✓ Relue' : 'Marquer comme relue'}
          </button>
        </div>
        {/* La synthèse ne s'enregistre qu'à la sortie du champ ; le micro, lui,
            ne fait pas sortir : la fin de la dictée enregistre à sa place.
            Le micro reste ici même pour une séance ouverte sans
            enregistrement : la séance est finie, c'est la praticienne qui
            dicte sa propre note — rien de la séance ne s'enregistre. */}
        <TextArea
          nu
          className={s.field}
          rows={9}
          aria-label="Synthèse de séance"
          value={draft.synthese}
          onChange={(e) => {
            const synthese = e.target.value
            set((prev) => (prev.draft ? { draft: { ...prev.draft, synthese }, syntheseOk: false } : {}))
          }}
          onBlur={garderLesCorrections}
          dictee
          onDicteeFin={garderLesCorrections}
        />
        {/* Des pouces sous un texte de l'IA, pas sous un champ vide. */}
        {cabinet?.reel && draft.synthese.trim() ? (
          <RetourIA
            cible="synthese"
            libelle="la synthèse de séance"
            version={draft.synthese}
            patient={patient.name}
            onRetoucher={retoucherTexte('synthese')}
          />
        ) : null}
      </section>

      {/* Notes écrites pendant la séance -------------------------------- */}
      {state.sessionNotes.trim() ? (
        <section className={cx(s.card, s.cardQuiet)}>
          <Title as="h2">Vos notes de séance</Title>
          <div className={s.sub}>Conservées telles quelles dans le dossier, au-dessus du texte généré.</div>
          <div className={s.notes}>{state.sessionNotes}</div>
        </section>
      ) : null}

      {/* Mots du patient et fil rouge ------------------------------------ */}
      <div className={s.pair}>
        <section className={s.card}>
          <h2 className={s.h21}>Les mots de la séance</h2>
          <div className={s.sub}>À reprendre tels quels dans votre hypnose et vos formulations.</div>
          {draft.mots.length ? (
            <div className={s.words}>
              {draft.mots.map((word, i) => (
                <span className={s.word} key={`${i}-${word}`}>
                  {word}
                </span>
              ))}
            </div>
          ) : (
            /* Le prompt ordonnait autrefois de rendre vide faute d'attribution
               certaine : la rubrique ne se remplissait donc jamais. On demande
               maintenant les formulations marquantes, sans prétendre dire qui
               les a dites — une image forte reste réutilisable. */
            <p className={s.empty}>
              Rien de saillant n'a été relevé dans cette transcription. Le bouton « Mot du
              patient », pendant la séance, horodate les formulations que vous voulez retenir.
            </p>
          )}
          {/* Relevés, pas rédigés : un avis, pas de retouche. */}
          {cabinet?.reel && draft.mots.length ? <RetourIA cible="mots" /> : null}
        </section>
        <section className={s.card}>
          <h2 className={s.h21}>Fil rouge</h2>
          <div className={s.sub}>Thèmes repérés, à confirmer par vous.</div>
          <div className={s.themes}>
            {draft.themes.map((theme, i) => (
              <div className={s.theme} key={`${i}-${theme}`}>
                <span className={s.themeDot} aria-hidden />
                <span className={s.themeText}>{theme}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Points de vigilance --------------------------------------------- */}
      {draft.vigilance.length ? (
        <section className={s.vigilance}>
          <h2 className={cx(s.h21, s.vigilanceTitle)}>Points de vigilance</h2>
          <div className={s.vigilanceSub}>
            Relevés dans la transcription. Ce ne sont pas des diagnostics, seulement des éléments que
            vous voudrez peut-être ne pas laisser passer.
          </div>
          <div className={s.vigilanceList}>
            {draft.vigilance.map((item, i) => (
              <div className={s.vigilanceItem} key={`${i}-${item.point}`}>
                <div className={s.vigilancePoint}>{item.point}</div>
                <div className={s.vigilanceBody}>{item.conduite}</div>
              </div>
            ))}
          </div>
          {cabinet?.reel ? <RetourIA cible="vigilance" /> : null}
        </section>
      ) : null}

      {/* Questions --------------------------------------------------------- */}
      {draft.questions.length ? (
        <section className={s.card}>
          <h2 className={s.h21}>À reprendre à la prochaine séance</h2>
          <div className={s.sub}>Ce qui est resté en suspens, formulé en questions ouvertes.</div>
          <div className={s.questions}>
            {draft.questions.map((question, i) => (
              <div className={s.question} key={`${i}-${question}`}>
                <span className={s.questionDot} aria-hidden />
                <span className={s.questionText}>{question}</span>
              </div>
            ))}
          </div>
          {cabinet?.reel ? <RetourIA cible="questions" /> : null}
        </section>
      ) : null}

      {/* Modules proposés ---------------------------------------------------- */}
      <section className={s.card}>
        <div className={s.headTight}>
          <Title large as="h2">
            Modules proposés pour l'entre-séances
          </Title>
          <span className={s.countMeta}>
            {retainedCount} sur {proposals.length} retenus
          </span>
        </div>
        <div className={s.sub}>Décochez ce qui ne vous convient pas. Rien n'est envoyé sans votre validation.</div>
        <div className={s.rows}>
          {proposals.map((proposal, i) => {
            const on = !state.proposalOff[i]
            /* La clé est la place du module, pas son titre : une retouche
               qui le renomme ne doit pas remonter la ligne et perdre ses
               pouces. */
            return (
              <div key={i} className={s.rowWrap}>
                <button
                  type="button"
                  className={cx(s.row, !on && s.rowOff)}
                  aria-pressed={on}
                  onClick={() =>
                    set((prev) => ({ proposalOff: { ...prev.proposalOff, [i]: !prev.proposalOff[i] } }))
                  }
                >
                  <span className={cx(s.box, on && s.boxOn)} aria-hidden>
                    {on ? '✓' : ''}
                  </span>
                  <span className={s.rowText}>
                    <span className={s.rowTitle}>{proposal.titre}</span>
                    <span className={s.rowWhy}>{proposal.pourquoi}</span>
                  </span>
                  <span className={s.kind}>{proposal.type}</span>
                </button>
                {/* À côté du bouton, jamais dedans : un bouton dans un bouton
                    ne se clique pas. Envoyée, la séance a versé ses modules
                    au parcours : il n'y a plus rien à retoucher ici. */}
                {cabinet?.reel ? (
                  <RetourIA
                    cible="proposition"
                    libelle={`le module « ${proposal.titre} »`}
                    version={versionDe(proposal)}
                    patient={patient.name}
                    onRetoucher={state.sent ? undefined : retoucherProposition(i)}
                    className={s.rowRetour}
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      {/* Audios suggérés -------------------------------------------------------- */}
      {suggested.length ? (
        <section className={s.card}>
          <div className={s.headTight}>
            <Title large as="h2">
              Audios de votre bibliothèque
            </Title>
            <span className={s.countMeta}>
              {sugOn.length} sur {suggested.length} retenus
            </span>
          </div>
          <div className={s.sub}>
            Choisis parmi vos enregistrements d'après les catégories retenues pour cette séance :{' '}
            {sugCats.map((c) => c.categorie).join(', ')}.
          </div>
          <div className={s.rows}>
            {suggested.map((audio) => {
              const on = !state.sugOff[audio.id]
              return (
                <button
                  type="button"
                  key={audio.id}
                  className={cx(s.row, s.rowPlain, !on && s.rowMuted)}
                  aria-pressed={on}
                  onClick={() => set((prev) => ({ sugOff: { ...prev.sugOff, [audio.id]: !prev.sugOff[audio.id] } }))}
                >
                  <span className={cx(s.box, on && s.boxOn)} aria-hidden>
                    {on ? '✓' : ''}
                  </span>
                  <span className={s.rowText}>
                    <span className={s.rowTitle}>{audio.title}</span>
                    <span className={s.rowWhy}>{audio.why}</span>
                  </span>
                  <span className={s.duration}>{audio.duration}</span>
                </button>
              )
            })}
          </div>
          <div className={s.sendRow}>
            <button
              type="button"
              className={cx(s.dispatch, (!sugOn.length || envoiAudios) && s.dispatchOff)}
              onClick={() => void sendSuggested()}
              disabled={!sugOn.length || envoiAudios}
            >
              {envoiAudios
                ? 'Envoi…'
                : sugOn.length
                  ? `Ajouter à la bibliothèque de ${firstName}`
                  : 'Ajouter'}
            </button>
            <span className={s.sendHint}>
              {state.sugSent || 'Ce sont vos enregistrements, pas des audios générés.'}
            </span>
          </div>
        </section>
      ) : null}

      {/* Hypnose personnalisée ------------------------------------------------------- */}
      <HypnoseCard />

      {/* Message au patient ------------------------------------------------------------ */}
      <section className={s.card}>
        <div className={s.headTight}>
          <Title large as="h2">
            Message au patient
          </Title>
          <button
            type="button"
            className={cx(s.validate, state.msgOk && s.validateOn)}
            onClick={() => void copyMessage()}
          >
            {state.msgOk ? '✓ Copié' : 'Copier le message'}
          </button>
        </div>
        {/* « Il double le taux de réalisation des modules » : aucun chiffre du
            produit ne l'établit. On dit ce que fait le bouton, pas plus. */}
        <div className={s.sub}>
          Un mot pour le soir de la séance. Il part dans l'espace de {firstName} une fois la note
          validée ; il se relit et se corrige ici avant.
        </div>
        <TextArea
          nu
          className={s.field}
          rows={4}
          aria-label="Message au patient"
          value={draft.message}
          readOnly={Boolean(state.msgEnvoye)}
          onChange={(e) => {
            const message = e.target.value
            set((prev) => (prev.draft ? { draft: { ...prev.draft, message }, msgOk: false } : {}))
          }}
          onBlur={garderLesCorrections}
          dictee
          onDicteeFin={garderLesCorrections}
        />
        {/* Parti, le message est chez le patient : il ne se retouche plus.
            Vide, il n'y a rien de l'IA à noter. */}
        {cabinet?.reel && !state.msgEnvoye && draft.message.trim() ? (
          <RetourIA
            cible="message"
            libelle="le message au patient"
            version={draft.message}
            occupe={envoiMessage === 'en-cours'}
            patient={patient.name}
            onRetoucher={retoucherTexte('message')}
          />
        ) : null}
        <div className={s.sendRow}>
          <button
            type="button"
            className={cx(s.dispatch, (!messageEnvoyable || envoiMessage === 'en-cours') && s.dispatchOff)}
            onClick={() => void sendMessage()}
            disabled={!messageEnvoyable || envoiMessage === 'en-cours'}
          >
            {state.msgEnvoye
              ? '✓ Envoyé'
              : envoiMessage === 'en-cours'
                ? 'Envoi…'
                : `Envoyer dans son espace ${momentDuMessage().dit}`}
          </button>
          <span className={s.sendHint}>
            {state.msgEnvoye ||
              (state.draftMaquette
                ? "Un texte de maquette ne part pas chez un patient."
                : !state.sent
                  ? 'Disponible après « Valider et envoyer » : le message parle des exercices que la note envoie.'
                  : "Il apparaîtra dans son espace, et sur son téléphone si les rappels y sont activés.")}
          </span>
        </div>
        {echecMessage ? <Notice tone="warn">{echecMessage}</Notice> : null}
        {echecCopie ? <Notice tone="warn">{echecCopie}</Notice> : null}
      </section>

      {/* Profil psychologique ------------------------------------------------------------- */}
      <section className={cx(s.card, s.profCard)}>
        <div className={s.profText}>
          <span className={s.profTitle}>Actualiser le profil de {firstName}</span>
          <span className={s.profHint}>
            {profil?.ton === 'ok'
              ? `${profil.texte} Il est visible sur la fiche client.`
              : profFresh
                ? 'Profil actualisé à partir de cette séance. Il est visible sur la fiche client.'
                : "Reprend le profil psychologique et les conseils d'accompagnement à partir des notes et de la synthèse de cette séance."}
          </span>
          {profil?.ton === 'warn' ? <Notice tone="warn">{profil.texte}</Notice> : null}
          <CoutEnJetons devis={devisProfil} sujet="Cette actualisation" />
        </div>
        <button
          type="button"
          className={cx(s.profBtn, profBusy && s.profBtnBusy)}
          onClick={() => void refreshProfil()}
          disabled={profBusy || Boolean(devisProfil?.manque)}
        >
          {profBusy ? 'Analyse des notes…' : 'Actualiser le profil'}
        </button>
      </section>

      {/* Barre d'envoi ---------------------------------------------------------------------- */}
      <section className={s.sendBar}>
        <div className={s.sendText}>
          <span className={s.sendTitle}>
            {state.draftMaquette
              ? 'Envoi impossible'
              : state.sent
                ? `Envoyé au dossier de ${firstName}`
                : envoi === 'en-cours'
                  ? 'Envoi en cours…'
                  : echecEnvoi
                    ? "L'envoi a échoué"
                    : 'Prêt à envoyer'}
          </span>
          <span className={s.sendSub}>
            {state.draftMaquette
              ? "Ce brouillon est un texte de maquette. Rien de fictif n'entre dans un dossier de santé."
              : state.sent
                ? 'La note est archivée et les modules retenus apparaissent dans son parcours de la semaine.'
                : echecEnvoi
                  ? echecEnvoi
                  : "La note rejoint le dossier, les modules retenus partent dans son espace patient. La transcription brute est supprimée."}
          </span>
        </div>
        <div className={s.sendActions}>
          <button
            type="button"
            className={s.sendGhost}
            onClick={() => set({ mode: 'therapist', sel: key })}
          >
            Voir le parcours
          </button>
          {/* « Reprendre » après l'envoi ramenait à la captation d'une séance
              close : une seconde génération, un second envoi, les modules en
              double. Une fois la séance versée, la seule suite est une autre
              séance — qui repart de zéro. */}
          {state.sent ? (
            <button type="button" className={s.sendGhost} onClick={() => set(nouvelleSeance())}>
              Nouvelle séance
            </button>
          ) : (
            <button
              type="button"
              className={s.sendGhost}
              onClick={() => set({ draft: null, sent: false })}
            >
              Reprendre
            </button>
          )}
          {/* Relire plus tard, envoyer plus tard : le brouillon se garde,
              choix compris, et rien ne part. Pas en démonstration, où rien
              ne se garde. */}
          {cabinet?.reel && state.sessionId && !state.sent && !state.draftMaquette ? (
            <button
              type="button"
              className={s.sendGhost}
              onClick={() => void garderPourPlusTard()}
              disabled={garde === 'en-cours' || envoi === 'en-cours'}
            >
              {garde === 'en-cours' ? 'Enregistrement…' : 'Garder en brouillon'}
            </button>
          ) : null}
          <button
            type="button"
            className={cx(s.sendBtn, state.sent && s.sendBtnDone)}
            onClick={sendDraft}
            disabled={state.draftMaquette || state.sent || envoi === 'en-cours' || garde === 'en-cours'}
          >
            {state.sent ? '✓ Envoyé' : envoi === 'en-cours' ? 'Envoi…' : 'Valider et envoyer'}
          </button>
        </div>

        {/* L'écriture des consignes se voit : cinq appels d'affilée sans
            retour à l'écran passeraient pour un écran figé, et la thérapeute
            fermerait l'onglet au milieu. */}
        {consignes.ecrit ? (
          <p className={s.consignes}>
            {consignes.faits < consignes.total
              ? `Écriture des consignes — ${consignes.faits + 1} sur ${consignes.total}${consignes.enCours ? ` · ${consignes.enCours}` : ''}`
              : consignes.echecs
                ? `Consignes écrites, sauf ${consignes.echecs} sur ${consignes.total}. Ces exercices gardent le « pourquoi » de la séance ; vous pouvez écrire le reste depuis le parcours.`
                : `Consignes écrites : ${plural(consignes.total, 'exercice détaillé', 'exercices détaillés')} pour ${patient.name}. Relisez-les depuis le parcours.`}
          </p>
        ) : null}
      </section>
    </div>
  )
}
