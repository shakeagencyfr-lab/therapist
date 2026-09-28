import { describe, expect, it } from 'vitest'
import {
  adresseDuManifeste,
  bilanTelephone,
  phraseTelephone,
  cheminDeLEspace,
  cleEnOctets,
  etatDeDepart,
  plusTardEncoreValable,
  PLUS_TARD_MS,
  surIOS,
  type Environnement,
} from './rappels'

const PRET: Environnement = {
  serviceWorker: true,
  pushManager: true,
  notification: true,
  permission: 'default',
  ios: false,
  installee: false,
}

describe('où en est ce téléphone', () => {
  it('propose d’activer quand tout est possible', () => {
    expect(etatDeDepart(PRET)).toBe('inactive')
  })

  /* Sur iPhone non installé, PushManager manque : dire « indisponible »
     ferait renoncer une patiente à qui il suffit d'installer l'espace. */
  it('dit d’installer l’espace sur iPhone, plutôt que « indisponible »', () => {
    expect(etatDeDepart({ ...PRET, ios: true, installee: false, pushManager: false })).toBe('a-installer')
    expect(etatDeDepart({ ...PRET, ios: true, installee: true })).toBe('inactive')
  })

  it('ne propose pas un bouton qu’aucun clic ne peut faire aboutir', () => {
    expect(etatDeDepart({ ...PRET, permission: 'denied' })).toBe('refusee')
    expect(etatDeDepart({ ...PRET, serviceWorker: false })).toBe('indisponible')
    expect(etatDeDepart({ ...PRET, notification: false })).toBe('indisponible')
  })
})

describe('reconnaître un iPhone', () => {
  it('reconnaît l’iPhone, et l’iPad qui se dit Mac', () => {
    expect(surIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true)
    expect(surIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true)
  })

  it('ne prend ni un Mac ni un Android pour un iPhone', () => {
    expect(surIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false)
    expect(surIOS('Mozilla/5.0 (Linux; Android 15; Pixel 9)', 'Linux armv8l', 5)).toBe(false)
  })
})

describe('l’adresse à rouvrir', () => {
  it('garde la porte du cabinet', () => {
    expect(cheminDeLEspace('/lohypnose/mon')).toBe('/lohypnose/mon')
    expect(cheminDeLEspace('/lohypnose/mon/')).toBe('/lohypnose/mon')
    expect(cheminDeLEspace('/mon')).toBe('/mon')
    expect(cheminDeLEspace('/autre/chose')).toBe('/mon')
  })

  /* Le manifeste est lu depuis l'adresse du cabinet pour que « ./mon » y
     rouvre la bonne porte une fois l'espace installé. */
  it('annonce le manifeste depuis la porte du cabinet', () => {
    expect(adresseDuManifeste('/lohypnose/mon')).toBe('/lohypnose/manifest.webmanifest')
    expect(adresseDuManifeste('/lohypnose/mon/')).toBe('/lohypnose/manifest.webmanifest')
    expect(adresseDuManifeste('/mon')).toBe('/manifest.webmanifest')
  })
})

describe('la clé du serveur', () => {
  it('passe de base64url aux octets, sans perdre le premier (0x04)', () => {
    const octets = cleEnOctets('BAECAwQF_-8')
    expect(Array.from(octets)).toEqual([4, 1, 2, 3, 4, 5, 255, 239])
  })

  it('rend les 65 octets d’une vraie clé publique P-256', () => {
    const cle = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
    expect(cleEnOctets(cle)).toHaveLength(65)
  })
})

describe('« plus tard »', () => {
  const maintenant = 1_800_000_000_000
  it('tient une semaine, pas plus', () => {
    expect(plusTardEncoreValable(String(maintenant - 1000), maintenant)).toBe(true)
    expect(plusTardEncoreValable(String(maintenant - PLUS_TARD_MS - 1), maintenant)).toBe(false)
  })

  it('ne se laisse pas tromper par une valeur absente ou abîmée', () => {
    expect(plusTardEncoreValable(null, maintenant)).toBe(false)
    expect(plusTardEncoreValable('n’importe quoi', maintenant)).toBe(false)
  })
})

describe('ce que la thérapeute lit dans le journal des envois', () => {
  it('compte chaque destinataire selon ce qui lui est arrivé', () => {
    expect(bilanTelephone(['envoyee', 'envoyee', 'sans_appareil', 'echec', 'expiree', null, undefined])).toEqual({
      arrivees: 2,
      sansTelephone: 1,
      echecs: 1,
      tardives: 1,
      enAttente: 2,
    })
  })

  /* « Sans téléphone » n'est pas un échec : c'est une patiente à qui l'on
     peut proposer d'activer les rappels. L'écran ne doit pas l'en accuser. */
  it('dit ce qui est arrivé, sans confondre absence de téléphone et échec', () => {
    expect(phraseTelephone(bilanTelephone(['envoyee', 'envoyee', 'sans_appareil']))).toBe(
      'Arrivé sur le téléphone de 2 personnes · 1 sans rappels activés : lu à sa prochaine ouverture',
    )
    expect(phraseTelephone(bilanTelephone(['envoyee']))).toBe("Arrivé sur le téléphone d'une personne")
    expect(phraseTelephone(bilanTelephone(['expiree', 'expiree']))).toBe("2 non envoyés : l'heure était passée")
  })

  it('se tait tant que rien n’a été traité', () => {
    expect(phraseTelephone(bilanTelephone([null, null]))).toBe('')
  })
})
