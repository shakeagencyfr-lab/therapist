// Conversations de démonstration — version FRANÇAISE.
// La version anglaise vit dans src/lib/threads.tsx.
// Types et pictogrammes : src/lib/threadKit.tsx
//
// Conversations fictives et illustratives. Les noms, marques et montants sont
// inventés ; ils s'affichent masqués, comme dans une vraie boîte partagée.

import { PaymentIcon, type Thread } from "../lib/threadKit";

// ───────────────────────────────────────────────────────────────────────────
// 1 — Institut de beauté. Demande entrante sur Instagram : l'IA identifie le
// soin, répond sur le prix et les suites, propose des créneaux et encaisse
// l'acompte. Aucune intervention humaine.
// ───────────────────────────────────────────────────────────────────────────
const spaThread: Thread = {
  id: "spa",
  inbox: {
    redacted: true,
    name: "Prospect · masqué",
    preview: "Acompte réglé. Jeudi 14h30.",
  },
  header: {
    name: "Prospect",
    redactedBadge: true,
    channelTag: "Instagram",
    statusText: "Traité par l'IA. Aucune intervention humaine.",
  },
  lead: {
    displayName: "Prospect",
    redactedBadge: true,
    sub: "@·········· · message Instagram",
    statusLabel: "Statut",
    statusValue: "Réservé · acompte réglé",
    rows: [
      { label: "Établissement", value: "Studio Lumière" },
      { label: "Soin", value: "Hydrafacial (60 min)" },
      { label: "Acompte réglé", value: "25 €" },
      { label: "Intervention humaine", value: "0 message" },
    ],
    insight:
      "Première demande après une publication Instagram. L'IA a fait correspondre le soin à son besoin, répondu sur le prix et les suites, puis réservé un créneau du jeudi et encaissé les 25 € d'acompte dans la conversation.",
  },
  events: [
    { type: "date", label: "3 mars" },
    {
      type: "msg",
      direction: "in",
      text: "bonjour ! j'ai vu votre soin éclat sur insta 😍",
    },
    {
      type: "msg",
      direction: "in",
      grouped: true,
      text: "vous avez quelque chose pour un teint terne / des pores obstrués ?",
    },
    {
      type: "system",
      tone: "ai",
      label: "Message Instagram entrant · étiqueté",
    },
    {
      type: "msg",
      direction: "out",
      text: "Bonjour ! Ravie que vous nous ayez trouvées 💚 Oui — pour un teint terne et des pores congestionnés, c'est l'Hydrafacial que nos clientes préfèrent",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Il nettoie, exfolie et hydrate en une seule séance, sans éviction sociale. Puis-je vous demander votre prénom ? Et est-ce votre premier soin chez nous ?",
    },
    {
      type: "msg",
      direction: "in",
      text: "Je m'appelle Maya, et oui c'est la première fois. Je n'ai jamais fait de soin du visage en fait",
    },
    { type: "system", tone: "ai", label: "Fiche contact mise à jour" },
    {
      type: "msg",
      direction: "out",
      text: "Enchantée Maya ! Les premiers soins sont les plus spectaculaires — l'éclat est immédiat",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Une petite question : des boutons en ce moment ou une peau sensible dont il faudrait tenir compte ? C'est pour adapter le soin",
    },
    {
      type: "msg",
      direction: "in",
      text: "un peu de rougeurs autour du nez parfois, rien de grave",
    },
    {
      type: "msg",
      direction: "out",
      text: "Très bien — c'est tout à fait gérable, notre esthéticienne ajustera les sérums en conséquence",
    },
    {
      type: "msg",
      direction: "in",
      text: "c'est combien ? et ça dure combien de temps",
    },
    {
      type: "msg",
      direction: "out",
      text: "L'Hydrafacial est à 120 € et dure environ 60 minutes",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Vous pouvez reprendre votre journée juste après — un joli éclat, sans desquamation ni rougeurs",
    },
    {
      type: "system",
      tone: "lead",
      label: "Question de prix · signal d'achat",
    },
    {
      type: "msg",
      direction: "in",
      text: "ok super. je peux venir cette semaine ?",
    },
    {
      type: "system",
      tone: "ai",
      label: "Créneaux disponibles récupérés dans l'agenda",
    },
    {
      type: "msg",
      direction: "out",
      text: "Oui ! Cette semaine il me reste mercredi 11h00, jeudi 14h30 ou vendredi 16h00",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Lequel vous conviendrait le mieux ?",
    },
    { type: "msg", direction: "in", text: "jeudi après-midi c'est parfait" },
    {
      type: "msg",
      direction: "out",
      text: "Jeudi 14h30, c'est noté 🎉 Pour bloquer le créneau nous demandons un petit acompte de 25 €, déduit du soin le jour J",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Voici le lien sécurisé : studiolumiere.example/reserver",
    },
    { type: "msg", direction: "in", text: "c'est fait !", leading: <PaymentIcon /> },
    { type: "system", tone: "ai", label: "Acompte confirmé · 25 €" },
    {
      type: "msg",
      direction: "out",
      text: "Parfait, acompte reçu et votre créneau est confirmé 💖",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Vous êtes inscrite pour l'Hydrafacial, jeudi à 14h30. Je vous enverrai un rappel la veille. Venez le visage démaquillé si possible — à jeudi, Maya !",
    },
    {
      type: "system",
      tone: "win",
      label: "Rendez-vous réservé · jeudi 14h30",
    },
    {
      type: "win",
      headline: "Du message au rendez-vous, en quelques minutes.",
      sub: "L'IA a identifié le soin, répondu sur le prix et les suites, réservé le créneau et encaissé l'acompte. Aucune intervention humaine.",
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────────
// 2 — Coaching sportif. Le prospect répond à une campagne : l'IA qualifie
// (objectif, disponibilités, niveau), lève l'objection prix avec un paiement
// en trois fois et conclut l'inscription. Aucune intervention humaine.
// ───────────────────────────────────────────────────────────────────────────
const coachThread: Thread = {
  id: "coach",
  inbox: {
    redacted: true,
    name: "Prospect · masqué",
    preview: "Inscrit · formule Objectif-12 mensuelle.",
  },
  header: {
    name: "Prospect",
    redactedBadge: true,
    channelTag: "WhatsApp",
    statusText: "Traité par l'IA · inscription coaching",
  },
  lead: {
    displayName: "Prospect",
    redactedBadge: true,
    sub: "+33 ·· ·· ·· ·· · FR",
    statusLabel: "Statut",
    statusValue: "Inscrit · mensuel",
    rows: [
      { label: "Établissement", value: "Salle Nord Performance" },
      { label: "Formule", value: "Objectif-12 (89 €/mois)" },
      { label: "But", value: "Perdre 7 kg · tenir dans la durée" },
      { label: "Intervention humaine", value: "0 message" },
    ],
    insight:
      "A répondu à une campagne de réactivation. L'IA a qualifié l'objectif et les disponibilités, levé l'objection « c'est trop cher » avec un paiement en trois fois, et conclu l'inscription mensuelle — le tout en une seule conversation.",
  },
  events: [
    { type: "date", label: "12 février" },
    {
      type: "system",
      tone: "ai",
      label: "Ajouté à la campagne · reprise de janvier",
    },
    {
      type: "msg",
      direction: "in",
      text: "Salut, j'ai vu votre message sur le coaching. Je réfléchis toujours à me remettre en forme",
    },
    {
      type: "msg",
      direction: "out",
      text: "Bonjour ! Content de vous lire 💪 Quel est l'objectif principal aujourd'hui — perdre du poids, prendre de la force, ou simplement reprendre un rythme ?",
    },
    {
      type: "msg",
      direction: "in",
      text: "Franchement un peu tout 😄 J'aimerais perdre 7 kg et surtout tenir cette fois",
    },
    {
      type: "system",
      tone: "ai",
      label: "Prospect qualifié · objectif enregistré",
    },
    {
      type: "msg",
      direction: "out",
      text: "C'est un objectif tout à fait atteignable, et le « tenir dans la durée » est précisément ce pour quoi notre coaching est fait",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Une question rapide : combien de jours par semaine pouvez-vous réellement vous entraîner ? Et vous préférez la salle ou la maison ?",
    },
    {
      type: "msg",
      direction: "in",
      text: "3 jours peut-être. La salle, j'ai déjà un abonnement",
    },
    {
      type: "msg",
      direction: "out",
      text: "Parfait — 3 jours en salle suffisent largement pour des résultats réels",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Notre formule Objectif-12 est faite exactement pour ça : un programme sur 3 jours adapté à vous, un point hebdomadaire, et un coach dans votre poche pour vous tenir. La plupart voient des progrès réguliers dès le premier mois",
    },
    { type: "msg", direction: "in", text: "C'est combien ?" },
    {
      type: "msg",
      direction: "out",
      text: "89 € par mois, résiliable à tout moment — sans engagement",
    },
    {
      type: "msg",
      direction: "in",
      text: "Hmm c'est un peu plus que ce que je voulais mettre là tout de suite",
    },
    { type: "system", tone: "lead", label: "Objection prix" },
    {
      type: "msg",
      direction: "out",
      text: "Je comprends tout à fait. Beaucoup commencent par le paiement en trois fois — 33 € par semaine le premier mois, puis on repasse aux 89 €/mois habituels. Même programme, effort plus doux au départ",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Et si ça ne vous convient pas dans les 14 premiers jours, nous remboursons. Autant dire qu'essayer ne coûte rien",
    },
    {
      type: "msg",
      direction: "in",
      text: "Ok là ça marche. On part sur le paiement en trois fois",
    },
    {
      type: "msg",
      direction: "out",
      text: "Excellent — on vous lance 🙌 Voici l'inscription sécurisée : nordperformance.example/objectif12",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Une fois inscrit, votre coach construit votre première semaine sous 24 heures",
    },
    {
      type: "msg",
      direction: "in",
      text: "Je viens de m'inscrire",
      leading: <PaymentIcon />,
    },
    {
      type: "system",
      tone: "ai",
      label: "Inscription confirmée · Objectif-12",
    },
    {
      type: "msg",
      direction: "out",
      text: "C'est parti ! 🎉 Bienvenue chez Nord Performance. J'ai prévenu votre coach — vous recevrez votre premier programme et une invitation à un appel de bienvenue demain",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Bravo d'avoir franchi le pas. À nous ces 7 kg 💪",
    },
    { type: "system", tone: "win", label: "Inscrit · formule mensuelle" },
    {
      type: "win",
      headline: "D'une réponse froide à un abonné payant.",
      sub: "L'IA a qualifié l'objectif, levé l'objection prix avec un paiement échelonné et conclu l'inscription en une seule conversation.",
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────────
// 3 — E-commerce : question produit → achat, puis passage de relais propre.
// L'IA répond sur la taille et conclut la vente ; quelques jours plus tard un
// cas de garantie arrive, l'IA reconnaît que ça sort de son périmètre et
// alerte un humain.
// ───────────────────────────────────────────────────────────────────────────
const shopThread: Thread = {
  id: "shop",
  inbox: {
    redacted: true,
    name: "Prospect · masqué",
    preview: "Dossier garantie transmis au service client.",
  },
  header: {
    name: "Prospect",
    redactedBadge: true,
    channelTag: "Chat du site",
    statusText: "Traité par l'IA · boutique en ligne (relais passé)",
  },
  lead: {
    displayName: "Prospect",
    redactedBadge: true,
    sub: "Visiteur du chat · FR",
    statusLabel: "Statut",
    statusValue: "Payé · garantie transmise",
    rows: [
      { label: "Boutique", value: "Drift & Co. Chaussures" },
      { label: "Commande", value: "Trail Runner · 138 €" },
      { label: "Traité par l'IA", value: "Pointure + paiement" },
      { label: "Repris par un humain", value: "Dossier garantie" },
    ],
    insight:
      "L'IA a répondu à une question de taille et conclu une commande de 138 € en une session. Cinq jours plus tard, le même client revient avec une question de garantie — l'IA a reconnu qu'un humain était nécessaire et a passé le relais avec tout le contexte.",
  },
  events: [
    { type: "date", label: "2 avril" },
    {
      type: "msg",
      direction: "in",
      text: "Bonjour, les Trail Runner taillent normalement ? Je fais du 43 d'habitude mais je suis entre deux tailles sur certaines marques",
    },
    {
      type: "msg",
      direction: "out",
      text: "Bonjour ! Très bonne question 👟 La Trail Runner taille un peu petit, donc entre deux tailles nous conseillons plutôt de prendre au-dessus, en 43,5",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Vous comptez porter des chaussettes épaisses ? Et c'est plutôt pour la route ou le sentier ?",
    },
    {
      type: "msg",
      direction: "in",
      text: "Surtout du sentier, chaussettes fines. Donc 43,5 selon vous ?",
    },
    {
      type: "msg",
      direction: "out",
      text: "Pour du sentier avec des chaussettes fines, oui — je partirais sur du 43,5. Il faut un peu d'aisance à l'avant pour les descentes",
    },
    {
      type: "msg",
      direction: "in",
      text: "Super. Vous les avez en vert ?",
    },
    {
      type: "msg",
      direction: "out",
      text: "Oui — le Vert Forêt est en stock en 43,5 en ce moment",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Elles sont à 138 € avec la livraison offerte, et le retour est gratuit sous 30 jours si la taille ne va pas. Je vous mets le lien de commande ?",
    },
    { type: "msg", direction: "in", text: "Oui allez-y" },
    {
      type: "msg",
      direction: "out",
      text: "Voilà : driftandco.example/trail-runner-vert-435",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Votre pointure et la couleur sont déjà pré-remplies, il ne reste que deux clics",
    },
    { type: "msg", direction: "in", text: "Commandé, merci !" },
    { type: "system", tone: "win", label: "Commande passée · 138 €" },
    {
      type: "msg",
      direction: "out",
      text: "Parfait, commande confirmée ✅ Vous recevrez le suivi par e-mail sous 24 h. Bonnes sorties ! 🌲",
    },
    {
      type: "system",
      tone: "warn",
      label: "Fenêtre de chat fermée · sans réponse",
    },

    { type: "gap", label: "5 jours plus tard" },

    { type: "date", label: "7 avril" },
    {
      type: "msg",
      direction: "in",
      text: "Bonjour, j'ai reçu les chaussures et je les adore, mais la semelle de la gauche commence déjà à se décoller à l'avant. C'est couvert ?",
    },
    {
      type: "msg",
      direction: "out",
      text: "Oh non — désolée d'apprendre ça, ce n'est vraiment pas normal pour une paire aussi neuve 😟",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Cela relève de la garantie, et ces dossiers sont traités par notre service client pour organiser correctement un échange ou un remboursement",
    },
    {
      type: "system",
      tone: "warn",
      label: "L'IA a alerté un humain · garantie hors périmètre",
    },
    { type: "system", tone: "ai", label: "Un conseiller a pris le relais" },
    {
      type: "msg",
      direction: "out",
      text: "Bonjour, ici Priya du service client Drift & Co. — je vois votre commande Trail Runner et la conversation ci-dessus. Une semelle qui se décolle aussi tôt est couverte par notre garantie d'un an, sans discussion",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Pouvez-vous m'envoyer une photo de l'avant de la chaussure ? Je fais partir une paire de remplacement dès aujourd'hui et je vous envoie une étiquette de retour prépayée pour la paire défectueuse",
    },
    {
      type: "msg",
      direction: "in",
      text: "Parfait, je vous envoie ça. Merci beaucoup !",
    },
    {
      type: "system",
      tone: "win",
      label: "Dossier garantie ouvert · remplacement expédié",
    },
    {
      type: "win",
      headline: "A conclu la vente. A su passer la main.",
      sub: "L'IA a réglé la question de pointure et la commande, puis reconnu qu'un dossier de garantie exigeait un humain et passé le relais avec tout le contexte.",
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────────
// 4 — Services à domicile : demande de devis → intervention réservée. Le
// prospect écrit à une entreprise de nettoyage de gouttières sur Messenger,
// l'IA cadre le chantier, donne une fourchette honnête, vérifie la zone
// d'intervention et confirme le rendez-vous. Aucune intervention humaine.
// ───────────────────────────────────────────────────────────────────────────
const homeServiceThread: Thread = {
  id: "home-service",
  inbox: {
    redacted: true,
    name: "Prospect · masqué",
    preview: "Samedi 9h00. Devis 140–180 €.",
  },
  header: {
    name: "Prospect",
    redactedBadge: true,
    channelTag: "Messenger",
    statusText: "Traité par l'IA · services à domicile",
  },
  lead: {
    displayName: "Prospect",
    redactedBadge: true,
    sub: "Messenger · ····· · commune masquée",
    statusLabel: "Statut",
    statusValue: "Intervention réservée",
    rows: [
      { label: "Entreprise", value: "Clairligne Gouttières" },
      { label: "Chantier", value: "Nettoyage gouttières · plain-pied" },
      { label: "Devis", value: "140 – 180 €" },
      { label: "Prévu le", value: "Samedi 9h00" },
    ],
    insight:
      "Demande Messenger après une publicité locale. L'IA a cadré le chantier, donné une fourchette de prix honnête, vérifié la zone d'intervention et réservé une intervention le samedi — transformant un message froid en chantier confirmé en quelques minutes.",
  },
  events: [
    { type: "date", label: "6 mai" },
    { type: "system", tone: "ai", label: "Message Messenger entrant · étiqueté" },
    {
      type: "msg",
      direction: "in",
      text: "Bonjour, vous faites le nettoyage de gouttières ? Les miennes débordent dès qu'il pleut",
    },
    {
      type: "msg",
      direction: "out",
      text: "Bonjour ! Oui tout à fait — des gouttières qui débordent sont généralement pleines de feuilles, c'est très fréquent à cette période 🍂",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Pour vous donner un devis juste, quelques questions rapides. Votre maison est de plain-pied ou à étage ?",
    },
    { type: "msg", direction: "in", text: "Plain-pied, maison de trois chambres" },
    {
      type: "msg",
      direction: "out",
      text: "Parfait. Et à peu près quand les gouttières ont-elles été nettoyées pour la dernière fois — dans l'année, ou cela fait un moment ?",
    },
    {
      type: "msg",
      direction: "in",
      text: "Honnêtement sans doute 2 ou 3 ans 😅",
    },
    { type: "system", tone: "ai", label: "L'IA cadre le chantier" },
    {
      type: "msg",
      direction: "out",
      text: "Aucun souci, c'est un chantier très classique pour nous",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Pour un plain-pied de trois chambres qui n'a pas été fait depuis deux ans, comptez environ 140 à 180 €. L'écart dépend de l'accumulation que nous trouverons — nous confirmons le montant exact sur place avant de commencer, sans mauvaise surprise",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Cela comprend le dégagement de toutes les gouttières et descentes, plus un test d'écoulement. Quelle est votre commune ? C'est juste pour vérifier que vous êtes dans notre zone",
    },
    { type: "msg", direction: "in", text: "Rivière-sur-Loire" },
    { type: "system", tone: "ai", label: "Zone d'intervention confirmée" },
    {
      type: "msg",
      direction: "out",
      text: "Vous êtes en plein dans notre zone 👍 Nous avons de la disponibilité cette semaine. Je peux vous proposer vendredi après-midi ou samedi 9h00 — qu'est-ce qui vous arrange ?",
    },
    { type: "msg", direction: "in", text: "Samedi matin ce serait parfait" },
    {
      type: "msg",
      direction: "out",
      text: "Samedi 9h00, c'est noté. Puis-je avoir votre nom et l'adresse pour que l'équipe sache où se rendre ?",
    },
    {
      type: "msg",
      direction: "in",
      text: "[nom masqué], [adresse masquée], Rivière-sur-Loire",
    },
    {
      type: "system",
      tone: "ai",
      label: "Coordonnées enregistrées · rendez-vous créé",
    },
    {
      type: "msg",
      direction: "out",
      text: "C'est réservé ✅ Notre équipe arrivera samedi à 9h00. Elle confirmera le prix final sur place avant de commencer — cela devrait se situer entre 140 et 180 €",
    },
    {
      type: "msg",
      direction: "out",
      grouped: true,
      text: "Je vous enverrai un rappel la veille au soir. Autre chose à dégager pendant que nous serons là-haut, les noues de toiture par exemple ?",
    },
    {
      type: "msg",
      direction: "in",
      text: "Non c'est tout pour l'instant, merci beaucoup !",
    },
    {
      type: "msg",
      direction: "out",
      text: "Avec plaisir — à samedi ! 👋",
    },
    {
      type: "system",
      tone: "win",
      label: "Intervention réservée · samedi 9h00 · 140–180 €",
    },
    {
      type: "win",
      headline: "D'une demande froide à un chantier réservé.",
      sub: "L'IA a cadré le chantier, donné une fourchette honnête, vérifié la zone d'intervention et bloqué une intervention le samedi. Aucune intervention humaine.",
    },
  ],
};

export const frThreads: Thread[] = [
  spaThread,
  coachThread,
  shopThread,
  homeServiceThread,
];
