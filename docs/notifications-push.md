# Notifications push des nouvelles annonces

## À quoi ça sert

À Genève, un bon appartement part en quelques heures. Les alertes préviennent sur
le téléphone (ou l'ordinateur) dès qu'une **nouvelle annonce correspond à tes
critères**, sans avoir à ouvrir l'app pour vérifier.

Exemple de notification :

> **2 nouvelles annonces à Genève**
> 3.5 p · 72 m² · CHF 2 400 — Eaux-Vives

Un clic ouvre GVA Spot. Le contact se fait toujours sur l'annonce d'origine.

## Comment l'utiliser

1. **Une seule fois**, générer les clés et remplir `.env` (voir la section
   « Notifications » du README) :
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Dans l'app, cliquer sur **Alertes** (la cloche en haut à droite) et accepter
   la demande d'autorisation. Le bouton passe en rose : c'est actif.
3. Régler ses critères comme d'habitude. Ils sont envoyés automatiquement au
   serveur : les alertes suivent toujours les critères affichés.
4. Pour arrêter : recliquer sur **Alertes**.

Pour vérifier que tout marche : `npm run notify -- --test` envoie une
notification factice à tous les appareils abonnés.

**iPhone / iPad** : il faut d'abord installer l'app sur l'écran d'accueil
(Partager → « Sur l'écran d'accueil »), puis l'ouvrir depuis l'icône. iOS 16.4
minimum, et le site doit être en HTTPS.

## Comment ça marche

```
Navigateur                          Serveur
──────────                          ───────
Bouton Alertes ── abonnement ─────▶ data/subscriptions.json
Critères modifiés ── mise à jour ─▶ (critères de l'abonnement)

                                    Toutes les 15 min (cron ou ping HTTP) :
                                    1. récupère les annonces des portails
                                    2. dédoublonne
                                    3. pour chaque abonné : garde celles qui
                                       correspondent à ses critères et qui
                                       n'ont jamais été notifiées
                                    4. envoie UN push récapitulatif
Service worker ◀────── push ─────── 5. retient les annonces notifiées
affiche la notif                       (data/notified.json)
```

- **Registre des annonces notifiées** (`data/notified.json`) : séparé du badge
  « Nouveau » de l'interface. Il garde les 5 000 dernières annonces envoyées. Un
  même bien présent sur plusieurs portails n'est notifié qu'une fois.
- **Premier passage** : le registre est rempli avec le stock actuel **sans rien
  envoyer** (sinon la première alerte annoncerait des centaines d'annonces). Si
  un portail est en panne à ce moment-là, ce remplissage est reporté au passage
  suivant.
- **Abonnement expiré** (navigateur désinstallé, permission retirée…) : il est
  supprimé automatiquement.
- **Échec d'envoi temporaire** : l'annonce n'est pas marquée comme notifiée,
  elle sera renvoyée au passage suivant.
- **Politesse** : si les portails ont été interrogés il y a moins de 5 minutes,
  le notifier réutilise ces données au lieu de les solliciter à nouveau.

### Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/components/PushToggle.tsx` | Bouton « Alertes » : permission, abonnement, désabonnement |
| `src/lib/push-client.ts` | Outils côté navigateur (clé VAPID, synchronisation des critères) |
| `src/app/api/push/subscribe/route.ts` | Enregistre / met à jour / supprime un abonnement |
| `src/lib/push-store.ts` | Stockage des abonnements et du registre des annonces notifiées |
| `src/lib/notify.ts` | Détecte les nouveautés et envoie les notifications |
| `scripts/notify.ts` | Commande `npm run notify` (et `-- --test`) |
| `src/app/api/cron/notify/route.ts` | Même chose via une URL protégée par `CRON_SECRET` |
| `public/sw.js` | Affiche la notification et ouvre l'app au clic |

## Réglages (`.env`)

| Variable | Rôle |
|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Paire de clés qui signe les notifications. La privée ne quitte jamais le serveur. |
| `VAPID_SUBJECT` | Contact de l'expéditeur (`mailto:…`), exigé par les services push. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Copie de la clé publique pour le navigateur (relancer le build après modification). |
| `CRON_SECRET` | Mot de passe de l'URL `/api/cron/notify`. |

## Limites

- **Stockage sur disque** : parfait si l'app tourne sur ta machine ou un serveur,
  mais effacé à chaque exécution sur un hébergement serverless (Vercel). Dans ce
  cas, il faut brancher un stockage clé-valeur (Upstash, Vercel KV) dans
  `src/lib/push-store.ts`.
- **Délai** : les alertes arrivent au rythme du cron (15 min conseillé). Ne pas
  descendre plus bas pour ne pas surcharger les portails.
- **Élargir ses critères** peut déclencher une alerte pour des annonces déjà en
  ligne mais jamais notifiées (elles ne correspondaient pas aux anciens critères).
- **Vie privée** : la notification ne contient qu'un résumé (pièces, surface,
  loyer, quartier) et un lien vers l'app. Aucune photo, description ni
  coordonnée d'annonceur n'est transmise.
