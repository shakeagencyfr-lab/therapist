import { useState } from 'react'
import { Button, Notice, TextInput, Title } from '@/components/ui'
import { MOUVEMENTS_HYPNOSE, NOM_MOUVEMENT } from '@/services/aiClient'
import { useMaybeCabinet } from '@/cabinet/context'
import { hypnoseOuverte, useDroits } from '@/cabinet/droits'
import { useDevis } from '@/cabinet/useJetons'
import { useEcritureHypnose } from '@/cabinet/useEcritureHypnose'
import { bilanHypnose, libelleReprise } from '@/lib/texteHypnose'
import { useStore } from '@/state/store'
import { TexteMouvement } from '@/views/therapist/TexteMouvement'
import { CoutEnJetons } from '@/views/jetons/CoutEnJetons'
import { HypnoseToggle } from './HypnoseToggle'
import s from './HypnoseCard.module.css'

/**
 * L'hypnose personnalisée, écrite pour ce patient.
 *
 * Elle remplace l'ancien « brouillon d'induction » : cent trente mots trop
 * courts pour être lus en séance et trop génériques pour être repris. Ici
 * c'est la séance entière, environ trente minutes à voix haute, bâtie sur
 * les formulations relevées pendant la captation.
 *
 * L'ÉCRITURE SE VOIT. Quatre appels séparés, un par mouvement, et l'écran
 * dit lequel s'écrit : trois minutes de rond qui tourne feraient croire à
 * une panne. Chaque mouvement est conservé dès qu'il arrive — une écriture
 * interrompue au troisième laisse les deux premiers acquis, et l'écran
 * propose d'en repartir, ou de fermer. Il restait figé sur deux coches,
 * sans un bouton.
 *
 * CHAQUE MOUVEMENT SE CORRIGE. Le texte est lu à voix haute : une tournure
 * qui ne passe pas se reprend avant la séance, sans tout réécrire.
 *
 * ELLE NE S'OUVRE PAS TOUJOURS. C'est une option que la thérapeute règle
 * patient par patient : tous n'en ont pas besoin, et elle coûte plus
 * cher que tout le reste de la séance réuni.
 *
 * ET L'OFFRE DOIT L'OUVRIR (0065). Hors de l'offre, sans exception ni pass,
 * la case laisse la place au verrou (HypnoseToggle) et rien ne s'écrit —
 * sauf ce qui était déjà à l'écran, qui ne disparaît pas.
 */
export function HypnoseCard() {
  const { state } = useStore()
  const key = state.sessionPatient
  const patient = state.patients[key]

  const [intention, setIntention] = useState('')
  /*
   * L'option se décide AUSSI ici, au moment où la question se pose vraiment :
   * la séance vient de se dérouler, la thérapeute sait maintenant si cette
   * patient-là en tirera quelque chose.
   *
   * C'est le même réglage que sur la fiche, pas un doublon : cocher ici
   * l'ouvre aussi pour les séances suivantes. Une copie locale garde l'écran
   * réactif — et laisse la démonstration fonctionner sans base.
   */
  const [ouverteIci, setOuverteIci] = useState<boolean | null>(null)
  const cabinet = useMaybeCabinet()
  const verrouillee = !hypnoseOuverte(useDroits())
  /* Une hypnose se paie une fois, à son premier mouvement : la reprise
     d'une écriture interrompue est comprise, elle n'a pas de prix à dire. */
  const devis = useDevis('hypnose')
  const {
    ecriture,
    enCours,
    ecrits,
    erreur,
    fini,
    conservee,
    aReprendre,
    aEnregistrer,
    ecrire,
    reprendre,
    corriger,
    retoucher,
    reinitialiser,
  } = useEcritureHypnose()

  if (!patient) return null

  const prenom = patient.name.split(' ')[0] ?? patient.name
  const ouverte =
    (ouverteIci ?? patient.hypnoseActivee) && (!verrouillee || ecriture || ecrits.length > 0 || Boolean(erreur))
  const draft = state.draft
  const bilan = bilanHypnose(
    { fini, conservee, ecrits: ecrits.length, interrompue: !!erreur, reel: !!cabinet?.reel },
    prenom,
  )

  return (
    <section className={s.card}>
      <div className={s.head}>
        <Title large as="h2">
          Hypnose personnalisée
        </Title>
        {ouverte ? <span className={s.duree}>≈ 30 minutes de lecture</span> : null}
      </div>

      <HypnoseToggle actif={ouverte} onChange={setOuverteIci} disabled={ecriture} />

      {!ouverte ? null : (
        <>
          <p className={s.sub}>
            Écrite sur les formulations relevées ci-dessus, en quatre mouvements : induction,
            approfondissement, travail, retour. C'est un texte à dire, pas à donner.
          </p>

          {/* Masqué tant qu'une écriture est à l'écran — en cours, finie ou
              interrompue : elle se reprend ou se ferme d'abord. */}
          {!ecriture && ecrits.length === 0 && !erreur ? (
            <div className={s.lancement}>
              {/* Le micro reste ici, même pour une séance ouverte sans
                  enregistrement : la séance est finie, c'est la praticienne
                  qui dicte sa propre intention — rien de la séance ne
                  s'enregistre. */}
              <label className={s.champ}>
                <span className={s.label}>Ce que vous voulez travailler (facultatif)</span>
                <TextInput
                  nu
                  className={s.input}
                  value={intention}
                  onChange={(e) => setIntention(e.target.value)}
                  placeholder="Installer le délai avant le geste, ancrer la main sur le sternum…"
                  dictee
                />
              </label>
              <Button
                variant="primary"
                onClick={() => draft && void ecrire(key, draft, intention)}
                disabled={!draft || ecriture || Boolean(devis?.manque)}
              >
                {ecriture ? 'Écriture en cours…' : "Écrire l'hypnose"}
              </Button>
            </div>
          ) : null}
          {/* Le prix avant d'écrire — et, après un refus faute de jetons, le
              chemin de la recharge : rien n'a été payé, tout reste à écrire. */}
          {!ecriture && ecrits.length === 0 && (!erreur || devis?.manque) ? (
            <CoutEnJetons devis={devis} sujet="Cette hypnose" />
          ) : null}

          {erreur ? <Notice tone="warn">{erreur}</Notice> : null}

          {ecriture || ecrits.length > 0 ? (
            <>
            {enCours ? (
              <p className={s.encours}>
                <span className={s.point} aria-hidden />
                {enCours} en cours d'écriture… chaque mouvement demande une trentaine de
                secondes.
              </p>
            ) : null}
            <ol className={s.avancement}>
              {MOUVEMENTS_HYPNOSE.map((m, i) => {
                const ecrit = ecrits[i]
                const encours = !ecrit && i === ecrits.length && ecriture
                return (
                  <li key={m} className={ecrit ? s.fait : encours ? s.actif : s.attente}>
                    <span className={s.puce}>{ecrit ? '✓' : i + 1}</span>
                    <span>{ecrit?.titre || NOM_MOUVEMENT[m]}</span>
                  </li>
                )
              })}
            </ol>
            </>
          ) : null}

          {ecrits.map((e) => (
            <TexteMouvement
              key={e.mouvement}
              ecrit={e}
              classes={{ article: s.mouvement, titre: s.mouvementTitre, para: s.para }}
              onCorriger={ecriture ? undefined : (texte) => corriger(e.mouvement, texte)}
              /* Les pouces, dans un cabinet réel seulement : la retouche
                 s'enregistre là où le mouvement l'est. Hors de l'option
                 Hypnose, l'avis se donne encore ; la retouche, non. */
              retouche={
                cabinet?.reel
                  ? {
                      occupe: ecriture,
                      patient: patient.name,
                      onRetoucher: verrouillee
                        ? undefined
                        : (retour, abandon) => retoucher(e.mouvement, retour, abandon),
                    }
                  : undefined
              }
            />
          ))}

          {/* Le bilan ne dit « conservée » que si la base l'a reçue ; après
              un échec, il dit ce qui est gardé et d'où repartir. */}
          {!ecriture && (fini || erreur) ? (
            <div className={s.bilanLigne}>
              {bilan ? (
                bilan.ton === 'neutre' ? (
                  <p className={s.bilan}>{bilan.texte}</p>
                ) : (
                  <Notice tone={bilan.ton}>{bilan.texte}</Notice>
                )
              ) : null}
              <span className={s.gestes}>
                {aReprendre ? (
                  <Button variant="primary" onClick={() => void reprendre()}>
                    {libelleReprise(aReprendre)}
                  </Button>
                ) : null}
                {aEnregistrer ? (
                  <Button variant="primary" onClick={() => void reprendre()}>
                    Réessayer de l'enregistrer
                  </Button>
                ) : null}
                {/* Fermer ne défait rien : ce qui est en base y reste, et
                    une hypnose interrompue se reprend depuis la fiche. */}
                {!fini ? (
                  <Button variant="ghost" onClick={reinitialiser}>
                    Fermer
                  </Button>
                ) : null}
              </span>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
