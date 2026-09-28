import { describe, expect, it } from 'vitest'
import { motifEnvoi, priveOuLocal } from './courriel.js'

/**
 * Le tri des adresses, avant d'ouvrir une connexion vers ce qu'on nous donne.
 *
 * `reglerSmtp` fait établir une VRAIE connexion TCP par notre serveur vers
 * l'hôte saisi, et rend trois messages qui distinguent un port ouvert d'un
 * port fermé. Sur un nom public c'est une aide au réglage ; sur une adresse
 * interne, c'est un scanner de ports pointé sur notre infrastructure — et
 * 169.254.169.254 est l'endroit exact où les hébergeurs de nuage servent les
 * jetons d'instance.
 *
 * Cette fonction est la barrière. Une erreur de borne s'y voit mal à la
 * lecture et pas du tout à l'usage : d'où l'épreuve, plage par plage.
 */
describe('priveOuLocal', () => {
  it('écarte le bouclage, le lien-local et les plages privées', () => {
    for (const ip of [
      '0.0.0.0', '0.1.2.3',
      '10.0.0.5', '10.255.255.255',
      '127.0.0.1', '127.1.2.3',
      '169.254.169.254',
      '172.16.0.1', '172.31.255.254',
      '192.168.0.1', '192.168.255.255',
      '192.0.0.1',
      '100.64.0.1', '100.127.255.255',
      '198.18.0.1', '198.19.255.255',
      '224.0.0.1', '255.255.255.255',
    ]) {
      expect({ [ip]: priveOuLocal(ip) }).toEqual({ [ip]: true })
    }
  })

  it('écarte les mêmes en IPv6, y compris mappées', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12::34', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
      expect({ [ip]: priveOuLocal(ip) }).toEqual({ [ip]: true })
    }
  })

  /* La moitié qui compte autant : un filtre qui refuse tout ne protège rien,
     il rend seulement la fonctionnalité inutilisable. */
  it('laisse passer les adresses publiques', () => {
    for (const ip of [
      '1.1.1.1', '8.8.8.8',
      '212.27.48.4',        // smtp.free.fr
      '172.15.0.1', '172.32.0.1',   // juste hors de la plage 172.16/12
      '100.63.255.255', '100.128.0.1', // juste hors de la CGNAT
      '192.167.0.1', '192.169.0.1',
      '198.17.0.1', '198.20.0.1',
      '223.255.255.255',    // juste sous la multidiffusion
      '2001:4860:4860::8888',
      '2a01:e0a::1',
    ]) {
      expect({ [ip]: priveOuLocal(ip) }).toEqual({ [ip]: false })
    }
  })
})

/**
 * Le courriel d'essai dit POURQUOI il n'est pas parti.
 *
 * La vérification de l'enregistrement ne prouve que l'identifiant ; le refus
 * le plus courant arrive à l'envoi — une adresse d'expédition que l'hébergeur
 * n'autorise pas. Son message parle souvent d'« authenticated user » : il ne
 * doit pas se lire comme un mot de passe faux.
 */
describe('motifEnvoi', () => {
  it("reconnaît une adresse d'expédition refusée, même quand le motif parle d'authentification", () => {
    const motif = motifEnvoi(
      '553 5.7.1 <contact@cabinet.fr>: Sender address rejected: not owned by authenticated user',
      'contact@cabinet.fr',
      587,
    )
    expect(motif).toContain("refuse d'envoyer depuis contact@cabinet.fr")
  })

  it('reconnaît un mot de passe refusé', () => {
    expect(motifEnvoi('Invalid login: 535 5.7.8 Username and Password not accepted', 'a@b.fr', 465)).toContain(
      'identifiant ou le mot de passe',
    )
  })

  it('reconnaît un serveur qui ne répond pas, et nomme le port', () => {
    expect(motifEnvoi('Connection timeout', 'a@b.fr', 587)).toContain('port 587')
  })

  it("rend une phrase française, jamais le motif technique", () => {
    const motif = motifEnvoi('Unexpected socket close', 'a@b.fr', 465)
    expect(motif).not.toContain('socket')
  })
})
