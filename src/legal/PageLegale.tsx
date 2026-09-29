import { useEffect, useState } from 'react'
import { useEnTete } from '@/lib/enTete'
import { LIENS_LEGAUX, type CleLegale } from './chemins'
import {
  MISE_A_JOUR,
  PAGES_LEGALES,
  VALIDE_JURIDIQUEMENT,
  morceaux,
  type Bloc,
  type Prestataire,
} from './contenu'
import s from './PageLegale.module.css'

/**
 * Une page légale de la plateforme : confidentialité, conditions, mentions.
 *
 * Servie seule par src/main.tsx, sans l'application : ni client de la base,
 * ni session, ni magasin d'état. On la lit sans être connecté, depuis le
 * widget d'un cabinet comme depuis la page de vente, et elle doit s'afficher
 * même quand la base ne répond pas.
 *
 * Le texte vit dans ./contenu (et s'éprouve là) ; ce composant ne fait que le
 * poser. Les champs « [À COMPLÉTER : …] » y sont surlignés : tant que le
 * document n'est pas validé, ils doivent sauter aux yeux, pas se fondre dans
 * une phrase qu'on croirait finie.
 */
export function PageLegaleVue({ cle }: { cle: CleLegale }) {
  const page = PAGES_LEGALES[cle]
  useEnTete(`${page.titre} — Klaro`, page.description)

  /* LE RETOUR, SEULEMENT S'IL MÈNE QUELQUE PART. Ouverte dans un nouvel
     onglet (depuis le widget, l'espace patient), la page n'a pas d'avant :
     un bouton « Retour » n'y ferait rien. Arrivée dans le même onglet, il
     ramène d'où l'on vient — l'application installée n'a pas d'autre bouton
     « précédent ». Lu après le montage : le banc de rendu n'a pas d'historique. */
  const [retour, setRetour] = useState(false)
  useEffect(() => {
    setRetour(window.history.length > 1)
  }, [])

  return (
    <div className={s.page}>
      {VALIDE_JURIDIQUEMENT ? null : (
        <p className={s.bandeau} role="note">
          <strong>Document à faire valider juridiquement.</strong> Les passages surlignés restent à compléter.
        </p>
      )}

      <header className={s.entete}>
        <span className={s.marque}>
          <span className={s.logo} aria-hidden="true">
            KL
          </span>
          <span className={s.nomMarque}>Klaro</span>
        </span>
        {retour ? (
          <button type="button" className={s.retour} onClick={() => window.history.back()}>
            <span aria-hidden="true">←</span> Retour
          </button>
        ) : null}
      </header>

      <nav className={s.documents} aria-label="Documents légaux">
        <ul className={s.documentsListe}>
          {LIENS_LEGAUX.map((l) => (
            <li key={l.cle}>
              <a
                href={l.chemin}
                className={l.cle === cle ? `${s.document} ${s.documentActif}` : s.document}
                aria-current={l.cle === cle ? 'page' : undefined}
              >
                {l.libelle}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main className={s.contenu}>
        <h1 className={s.titre}>{page.titre}</h1>
        <p className={s.maj}>Mise à jour le {MISE_A_JOUR}</p>
        <p className={s.chapo}>
          <Texte texte={page.chapo} />
        </p>

        <nav className={s.sommaire} aria-labelledby="sommaire">
          <h2 id="sommaire" className={s.sommaireTitre}>
            Sommaire
          </h2>
          <ol className={s.sommaireListe}>
            {page.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.titre}</a>
              </li>
            ))}
          </ol>
        </nav>

        {page.sections.map((section) => (
          <section key={section.id} id={section.id} className={s.section} aria-labelledby={`titre-${section.id}`}>
            <h2 id={`titre-${section.id}`} className={s.h2}>
              {section.titre}
            </h2>
            {section.blocs.map((bloc, i) => (
              <BlocVue key={i} bloc={bloc} />
            ))}
          </section>
        ))}
      </main>

      <footer className={s.pied}>
        <span>© {new Date().getFullYear()} Klaro</span>
      </footer>
    </div>
  )
}

/** Un texte, ses champs à compléter surlignés. */
function Texte({ texte }: { texte: string }) {
  return (
    <>
      {morceaux(texte).map((m, i) =>
        m.aCompleter ? (
          <mark key={i} className={s.aCompleter}>
            {m.texte}
          </mark>
        ) : (
          <span key={i}>{m.texte}</span>
        ),
      )}
    </>
  )
}

function BlocVue({ bloc }: { bloc: Bloc }) {
  switch (bloc.type) {
    case 'paragraphe':
      return (
        <p className={s.texte}>
          <Texte texte={bloc.texte} />
          {bloc.lien ? (
            <>
              {' '}
              <a className={s.lien} href={bloc.lien.href} {...lienSortant(bloc.lien.href)}>
                {bloc.lien.libelle}
              </a>
              .
            </>
          ) : null}
        </p>
      )
    case 'encart':
      return (
        <p className={s.encart}>
          <Texte texte={bloc.texte} />
        </p>
      )
    case 'liste':
      return (
        <ul className={s.liste}>
          {bloc.elements.map((e, i) => (
            <li key={i}>
              <Texte texte={e} />
            </li>
          ))}
        </ul>
      )
    case 'lignes':
      return (
        <dl className={s.lignes}>
          {bloc.lignes.map((l) => (
            <div key={l.terme} className={s.ligne}>
              <dt className={s.terme}>{l.terme}</dt>
              <dd className={s.valeur}>
                <Texte texte={l.valeur} />
              </dd>
            </div>
          ))}
        </dl>
      )
    case 'prestataires':
      return (
        <ul className={s.prestataires}>
          {bloc.prestataires.map((p) => (
            <PrestataireVue key={p.nom} prestataire={p} />
          ))}
        </ul>
      )
  }
}

function PrestataireVue({ prestataire: p }: { prestataire: Prestataire }) {
  return (
    <li className={s.prestataire}>
      <h3 className={s.prestataireNom}>{p.nom}</h3>
      <dl className={s.prestataireDetail}>
        <div>
          <dt>Pour quoi</dt>
          <dd>
            <Texte texte={p.role} />
          </dd>
        </div>
        <div>
          <dt>Où</dt>
          <dd>
            <Texte texte={p.lieu} />
          </dd>
        </div>
        <div>
          <dt>Ce qui lui parvient</dt>
          <dd>
            <Texte texte={p.donnees} />
          </dd>
        </div>
      </dl>
    </li>
  )
}

/** Un lien vers un autre site s'ouvre à part ; un renvoi entre nos pages, non. */
function lienSortant(href: string): { target?: string; rel?: string } {
  return /^https?:\/\//.test(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {}
}
