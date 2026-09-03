/**
 * Le domaine du cabinet — la marque blanche totale.
 *
 * En marque blanche, l'espace de la thérapeute ne vit plus sous notre adresse
 * mais sous la sienne : espace.son-cabinet.fr. Trois choses à tenir pour que
 * ce ne soit pas un piège :
 *
 *   1. Le domaine est ENREGISTRÉ chez l'hébergeur avant d'être annoncé. Un
 *      CNAME posé vers un projet qui ne connaît pas le domaine ne sert rien —
 *      et la thérapeute passe l'après-midi à croire que son DNS est en cause.
 *   2. Les enregistrements à poser sont ceux que l'hébergeur RÉCLAME, gardés
 *      tels quels. Les réécrire de mémoire est le meilleur moyen de faire
 *      poser un CNAME faux.
 *   3. Tant que la vérification n'est pas passée, l'adresse ne sert pas :
 *      `cabinet_par_domaine()` ne rend rien pour un domaine non vérifié.
 *
 * Sans jeton d'hébergeur (VERCEL_TOKEN), tout continue de fonctionner en
 * mode manuel : on rend les enregistrements à poser, et la vérification se
 * fait par une vraie résolution DNS depuis le serveur. C'est moins confortable
 * mais ce n'est pas une impasse.
 */
import { promises as dns } from 'node:dns'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminConfigure, clientAdmin, exigerCabinet, identifier } from './auth.js'
import { droitsDuCabinet, exigerDroit } from './droits.js'
import { HttpError } from './errors.js'

/* ------------------------------------------------------------------ *
 * Ce que l'écran reçoit
 * ------------------------------------------------------------------ */

/** Un enregistrement DNS à poser, tel qu'on le dicte à la thérapeute. */
export interface EnregistrementDns {
  type: string
  nom: string
  valeur: string
}

export interface EtatDomaine {
  domaine: string | null
  verifie: boolean
  /** Ce qu'il reste à poser chez le registrar. */
  dns: EnregistrementDns[]
  /** Où en est la vérification, en français. */
  etat: string
  /** L'hébergeur est-il piloté par le serveur, ou faut-il l'ouvrir à la main ? */
  automatique: boolean
  /** L'offre du cabinet ouvre-t-elle la marque blanche ? */
  droit: boolean
  /** Le nom de son offre, pour l'expliquer sans le deviner. */
  offre: string
}

/* ------------------------------------------------------------------ *
 * L'hébergeur
 * ------------------------------------------------------------------ */

const VERCEL_TOKEN = (process.env.VERCEL_TOKEN ?? '').trim()
const VERCEL_PROJET = (process.env.VERCEL_PROJECT_ID ?? '').trim()
const VERCEL_EQUIPE = (process.env.VERCEL_TEAM_ID ?? '').trim()

/** L'adresse que doit viser un CNAME, quand on la pose à la main. */
const CIBLE_CNAME = process.env.DOMAIN_CNAME_TARGET ?? 'cname.vercel-dns.com'
/** L'adresse que doit viser un domaine racine, faute de CNAME possible. */
const CIBLE_A = process.env.DOMAIN_A_TARGET ?? '76.76.21.21'

/** L'hébergeur peut-il être piloté depuis le serveur ? */
export function hebergeurPilote(): boolean {
  return Boolean(VERCEL_TOKEN && VERCEL_PROJET)
}

interface ReponseVercel {
  ok: boolean
  status: number
  corps: Record<string, unknown>
}

async function appelVercel(chemin: string, methode: 'GET' | 'POST' | 'DELETE', corps?: unknown): Promise<ReponseVercel> {
  const url = new URL(`https://api.vercel.com${chemin}`)
  if (VERCEL_EQUIPE) url.searchParams.set('teamId', VERCEL_EQUIPE)
  let reponse: Response
  try {
    reponse = await fetch(url, {
      method: methode,
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        ...(corps ? { 'Content-Type': 'application/json' } : {}),
      },
      body: corps ? JSON.stringify(corps) : undefined,
      // L'hébergeur coupe la fonction à soixante secondes : on abandonne
      // avant, pour pouvoir dire pourquoi.
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new HttpError(504, "L'hébergeur est injoignable depuis le serveur. Réessayez dans un instant.")
  }
  const texte = await reponse.text()
  let lu: Record<string, unknown> = {}
  try {
    lu = texte ? (JSON.parse(texte) as Record<string, unknown>) : {}
  } catch {
    lu = {}
  }
  return { ok: reponse.ok, status: reponse.status, corps: lu }
}

/** Le message de l'hébergeur, quand il en donne un. */
function messageVercel(corps: Record<string, unknown>): string {
  const erreur = corps.error as { message?: string; code?: string } | undefined
  return erreur?.message ?? erreur?.code ?? ''
}

/**
 * Les enregistrements réclamés par l'hébergeur, mis en français.
 *
 * Vercel rend deux choses : `verification` (ce qu'il faut poser pour prouver
 * qu'on tient le domaine) et, via la configuration, le fait que le domaine
 * pointe ou non chez lui. On rend les deux au même endroit : la thérapeute a
 * un seul écran, pas deux notions.
 */
function dnsDeVercel(domaine: string, verification: unknown): EnregistrementDns[] {
  const liste = Array.isArray(verification) ? verification : []
  const enregistrements: EnregistrementDns[] = liste
    .map((v) => v as { type?: string; domain?: string; value?: string })
    .filter((v) => v.type && v.value)
    .map((v) => ({ type: String(v.type).toUpperCase(), nom: v.domain ?? domaine, valeur: String(v.value) }))
  if (enregistrements.length) return enregistrements
  return dnsAttendus(domaine)
}

/** Ce qu'il faut poser quand personne ne nous le dicte : le cas courant. */
export function dnsAttendus(domaine: string): EnregistrementDns[] {
  // Un domaine racine (deux étiquettes) ne peut pas porter de CNAME : c'est
  // le RFC, pas une limite de l'hébergeur. On dicte alors un A.
  const racine = domaine.split('.').length <= 2
  return racine
    ? [{ type: 'A', nom: '@', valeur: CIBLE_A }]
    : [{ type: 'CNAME', nom: domaine.split('.')[0], valeur: CIBLE_CNAME }]
}

/* ------------------------------------------------------------------ *
 * Le domaine, tel qu'on l'accepte
 * ------------------------------------------------------------------ */

/** Nos propres adresses : les prendre pour un domaine de cabinet n'a pas de sens. */
const INTERDITS = [/(^|\.)vercel\.app$/i, /(^|\.)klaroweb\.site$/i, /(^|\.)localhost$/i]

/**
 * Le domaine, nettoyé et éprouvé.
 *
 * On accepte ce qu'une thérapeute colle réellement : une adresse complète
 * avec https, un point final, des majuscules. On refuse le reste avec une
 * phrase qui dit quoi corriger.
 */
export function nettoyerDomaine(brut: string): string {
  let valeur = brut.trim().toLowerCase()
  if (!valeur) throw new HttpError(400, 'Entrez le domaine que vous voulez utiliser.')
  // « https://espace.cabinet.fr/ » → « espace.cabinet.fr »
  valeur = valeur.replace(/^[a-z]+:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '')
  if (valeur.includes('@')) {
    throw new HttpError(400, "C'est une adresse électronique, pas un domaine. Entrez par exemple espace.votre-cabinet.fr.")
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(valeur)) {
    throw new HttpError(400, "Ce domaine n'est pas valide. Entrez par exemple espace.votre-cabinet.fr.")
  }
  if (valeur.length > 253) throw new HttpError(400, 'Ce domaine est trop long.')
  if (INTERDITS.some((r) => r.test(valeur))) {
    throw new HttpError(400, 'Ce domaine est celui de la plateforme. Entrez le vôtre.')
  }
  return valeur
}

/* ------------------------------------------------------------------ *
 * Lecture
 * ------------------------------------------------------------------ */

interface DomaineRow {
  domaine: string
  verifie: boolean
  dns: EnregistrementDns[] | null
  etat: string | null
}

function admin(): SupabaseClient {
  const client = clientAdmin()
  if (!client || !adminConfigure()) {
    throw new HttpError(
      503,
      "Le serveur n'a pas sa clé de service (SUPABASE_SERVICE_ROLE_KEY) : il ne peut pas enregistrer de domaine.",
    )
  }
  return client
}

/** L'état du domaine du cabinet de l'appelante. */
export async function etatDomaine(token: string | null): Promise<EtatDomaine> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  const droits = await droitsDuCabinet(cabinetId, appelant.client)
  const { data, error } = await appelant.client
    .from('cabinet_domains')
    .select('domaine, verifie, dns, etat')
    .eq('cabinet_id', cabinetId)
    .maybeSingle<DomaineRow>()
  if (error) throw new HttpError(502, "Votre domaine n'a pas pu être lu.")
  return {
    domaine: data?.domaine ?? null,
    verifie: data?.verifie ?? false,
    dns: data?.dns ?? [],
    etat: data?.etat ?? '',
    automatique: hebergeurPilote(),
    droit: droits.marqueBlanche,
    offre: droits.offre,
  }
}

/* ------------------------------------------------------------------ *
 * Écriture
 * ------------------------------------------------------------------ */

async function enregistrer(
  cabinetId: string,
  userId: string,
  ligne: { domaine: string; verifie: boolean; dns: EnregistrementDns[]; etat: string; verifie_le?: string | null },
  action: string,
): Promise<void> {
  const db = admin()
  const { error } = await db.from('cabinet_domains').upsert(
    { cabinet_id: cabinetId, ...ligne, updated_at: new Date().toISOString() },
    { onConflict: 'cabinet_id' },
  )
  if (error) {
    // 23505 : le domaine appartient déjà à un autre cabinet.
    if (error.code === '23505') {
      throw new HttpError(409, 'Ce domaine est déjà utilisé par un autre cabinet.')
    }
    console.error(`[domaine] enregistrement — ${error.message}`)
    throw new HttpError(502, "Le domaine n'a pas pu être enregistré. Réessayez dans un instant.")
  }
  await db.from('audit_log').insert({
    cabinet_id: cabinetId,
    actor_user_id: userId,
    action,
    target_table: 'cabinet_domains',
    target_id: cabinetId,
  })
}

/**
 * Poser un domaine : l'annoncer à l'hébergeur, puis l'écrire.
 *
 * Dans cet ordre. Écrire d'abord donnerait une ligne « en attente » pour un
 * domaine que l'hébergeur refuse — par exemple parce qu'un autre projet le
 * détient déjà.
 */
export async function poserDomaine(token: string | null, raw: unknown): Promise<EtatDomaine> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  const droits = await droitsDuCabinet(cabinetId, appelant.client)
  exigerDroit(droits, 'marqueBlanche')

  const body = (raw && typeof raw === 'object' ? raw : {}) as { domaine?: string }
  const domaine = nettoyerDomaine(String(body.domaine ?? ''))

  let dnsAPoser = dnsAttendus(domaine)
  const etat = hebergeurPilote()
    ? 'Domaine enregistré. Posez les enregistrements ci-dessous chez votre registrar, puis lancez la vérification.'
    : "Posez les enregistrements ci-dessous chez votre registrar, puis lancez la vérification. L'hébergeur n'étant pas piloté depuis ce serveur, prévenez aussi votre revendeur pour qu'il rattache le domaine."

  if (hebergeurPilote()) {
    const ajout = await appelVercel(`/v10/projects/${VERCEL_PROJET}/domains`, 'POST', { name: domaine })
    const message = messageVercel(ajout.corps)
    if (!ajout.ok && !/already|exists|conflict/i.test(`${message} ${ajout.status}`)) {
      if (ajout.status === 403) {
        throw new HttpError(502, "L'hébergeur refuse ce domaine : il appartient à un autre compte.")
      }
      throw new HttpError(502, `L'hébergeur a refusé ce domaine${message ? ` : ${message}` : '.'}`)
    }
    const fiche = await appelVercel(`/v9/projects/${VERCEL_PROJET}/domains/${encodeURIComponent(domaine)}`, 'GET')
    dnsAPoser = dnsDeVercel(domaine, fiche.corps.verification)
  }

  await enregistrer(
    cabinetId,
    appelant.userId,
    { domaine, verifie: false, dns: dnsAPoser, etat, verifie_le: null },
    'domaine.pose',
  )
  return etatDomaine(token)
}

/**
 * Vérifier le domaine.
 *
 * Piloté, on demande à l'hébergeur — lui seul sait si le certificat est
 * émis. À la main, on résout le DNS depuis le serveur : c'est moins que la
 * vérité complète, mais c'est vrai — l'adresse pointe bien chez nous.
 */
export async function verifierDomaine(token: string | null): Promise<EtatDomaine> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)
  const droits = await droitsDuCabinet(cabinetId, appelant.client)
  exigerDroit(droits, 'marqueBlanche')

  const { data } = await appelant.client
    .from('cabinet_domains')
    .select('domaine, verifie, dns, etat')
    .eq('cabinet_id', cabinetId)
    .maybeSingle<DomaineRow>()
  if (!data?.domaine) throw new HttpError(404, "Aucun domaine à vérifier : posez-en un d'abord.")
  const domaine = data.domaine

  let verifie = false
  let etat = ''
  let dnsAPoser = data.dns ?? dnsAttendus(domaine)

  if (hebergeurPilote()) {
    const verif = await appelVercel(
      `/v9/projects/${VERCEL_PROJET}/domains/${encodeURIComponent(domaine)}/verify`,
      'POST',
    )
    const config = await appelVercel(
      `/v9/projects/${VERCEL_PROJET}/domains/${encodeURIComponent(domaine)}/config`,
      'GET',
    )
    const malConfigure = config.corps.misconfigured === true
    const reconnu = verif.ok && (verif.corps.verified === true || verif.corps.name === domaine)
    verifie = reconnu && !malConfigure
    if (!verifie) {
      const fiche = await appelVercel(`/v9/projects/${VERCEL_PROJET}/domains/${encodeURIComponent(domaine)}`, 'GET')
      dnsAPoser = dnsDeVercel(domaine, fiche.corps.verification)
    }
    etat = verifie
      ? 'Domaine vérifié. Votre espace répond à cette adresse.'
      : malConfigure
        ? "Le domaine est enregistré mais ne pointe pas encore ici : vérifiez l'enregistrement ci-dessous chez votre registrar. Une propagation DNS peut prendre quelques heures."
        : messageVercel(verif.corps) ||
          "La vérification n'est pas encore passée. Une propagation DNS peut prendre quelques heures."
  } else {
    const resolu = await pointeIci(domaine)
    verifie = resolu.ok
    etat = resolu.message
  }

  await enregistrer(
    cabinetId,
    appelant.userId,
    {
      domaine,
      verifie,
      dns: verifie ? [] : dnsAPoser,
      etat,
      verifie_le: verifie ? new Date().toISOString() : null,
    },
    verifie ? 'domaine.verifie' : 'domaine.verification_echouee',
  )
  return etatDomaine(token)
}

/**
 * Le domaine pointe-t-il chez nous ?
 *
 * Une résolution, pas une promesse : elle dit que le DNS est posé, ce qui est
 * exactement ce qui bloque neuf fois sur dix.
 */
export async function pointeIci(domaine: string): Promise<{ ok: boolean; message: string }> {
  try {
    const cnames = await dns.resolveCname(domaine)
    if (cnames.some((c) => c.replace(/\.$/, '').toLowerCase() === CIBLE_CNAME.toLowerCase())) {
      return { ok: true, message: `Le CNAME est en place et vise ${CIBLE_CNAME}.` }
    }
    return {
      ok: false,
      message: `Ce domaine vise ${cnames.join(', ')} au lieu de ${CIBLE_CNAME}. Corrigez l'enregistrement chez votre registrar.`,
    }
  } catch {
    /* Pas de CNAME : peut-être un A, sur un domaine racine. */
  }
  try {
    const adresses = await dns.resolve4(domaine)
    if (adresses.includes(CIBLE_A)) {
      return { ok: true, message: `L'enregistrement A est en place et vise ${CIBLE_A}.` }
    }
    return {
      ok: false,
      message: `Ce domaine vise ${adresses.join(', ')} au lieu de ${CIBLE_A}. Corrigez l'enregistrement chez votre registrar.`,
    }
  } catch {
    return {
      ok: false,
      message:
        "Ce domaine ne résout pas encore. Posez l'enregistrement ci-dessous chez votre registrar ; une propagation DNS peut prendre quelques heures.",
    }
  }
}

/** Retirer le domaine : chez l'hébergeur d'abord, en base ensuite. */
export async function retirerDomaine(token: string | null): Promise<EtatDomaine> {
  const appelant = await identifier(token)
  const cabinetId = exigerCabinet(appelant)

  const { data } = await appelant.client
    .from('cabinet_domains')
    .select('domaine, verifie, dns, etat')
    .eq('cabinet_id', cabinetId)
    .maybeSingle<DomaineRow>()
  if (!data?.domaine) return etatDomaine(token)

  if (hebergeurPilote()) {
    // Un domaine déjà absent chez l'hébergeur n'est pas un échec : ce qu'on
    // veut, c'est qu'il n'y soit plus.
    await appelVercel(`/v9/projects/${VERCEL_PROJET}/domains/${encodeURIComponent(data.domaine)}`, 'DELETE')
  }

  const db = admin()
  const { error } = await db.from('cabinet_domains').delete().eq('cabinet_id', cabinetId)
  if (error) throw new HttpError(502, "Le domaine n'a pas pu être retiré.")
  await db.from('audit_log').insert({
    cabinet_id: cabinetId,
    actor_user_id: appelant.userId,
    action: 'domaine.retire',
    target_table: 'cabinet_domains',
    target_id: cabinetId,
  })
  return etatDomaine(token)
}
