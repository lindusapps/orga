# Validation de la version connectée

Voir README pour le fonctionnement et les commandes de test.

- 25 scénarios de planning : réussis.
- Tests simulés Auth, droits et API métier : réussis.
- Base réelle : tables privées, RPC pointage interdit aux rôles navigateur, démarrage/arrêt idempotents et contrainte de durée vérifiés avec annulation de transaction.
- Fonctions staff-admin et staff-data déployées avec vérification JWT active.
- La confirmation finale de connexion avec le mot de passe choisi appartient au test utilisateur ; les tests simulés ne la remplacent pas.

- Responsable sécurité : tests API simulés et frontend réussis ; refus des opérations non autorisées, filtre Sécu et rôle SQL prioritaire sur les anciens claims vérifiés.
- Base réelle : création des comptes et affectations, révisions, validation Sécu individuelle, refus Bar, retrait d’équipe, désactivation et refus d’accès direct vérifiés avec annulation de transaction.

## Session après actualisation et affichage des équipes
- Cases à cocher limitées à 20 × 20 px, libellés proches de leur case, choix d'équipes en grille adaptative dans les formulaires de création et modification.
- Session temporaire de l'onglet restaurée avec vérification du compte serveur. Aucun mot de passe stocké.
- Déconnexion automatique de l'interface au bout de deux heures depuis la connexion initiale, sans prolongation au rechargement ni au renouvellement du jeton.
- Sept scénarios automatisés dans tests/test-session.cjs : rechargement, renouvellement concurrent unique, échéance de deux heures, compte désactivé, déconnexion manuelle, réponse tardive après déconnexion, session expirée au démarrage.
- Tests d'authentification, de modules, de sécurité et les 25 tests du planning réussis.
- Les tests de session utilisent des réponses Auth simulées et une horloge contrôlée ; ils ne remplacent pas un test de connexion avec le compte réel de l'utilisateur.

## Sécu 22 h, calendrier et suppression individuelle
- Tests serveur : rejet des créneaux autres que 22 h pour Sécu, filtres de disponibilités, validation direction et responsable.
- Tests interface : calendrier Sécu Jour/Semaine/Mois, changements de période, agents filtrés et créneaux 22 h.
- Test du bouton Direction : fenêtre ouverte pendant la publication et en cas d'échec ; fermeture uniquement après confirmation serveur.
- Test SQL transactionnel avec rollback : suppression individuelle, conservation des autres agents et disponibilités, refus hors équipe, refus pour employés et révisions périmées.

## Validation automatique et suppression du pointage — 27 octobre 2026

- Tests simulés : choix du début et de la fin publiés individuellement, formulaire compact uniquement après confirmation, boutons de modification et de reprise, refus après déconnexion.
- Échec serveur avec ou sans rechargement possible : dernière publication conservée ; saisie tentée gardée dans le formulaire.
- Les brouillons et publications des collègues restent distincts ; une disponibilité retirée sur un service inchangé ne bloque pas la publication d’un autre salarié.
- Le total mensuel utilise uniquement les services publiés, y compris après minuit ; changer un brouillon ne modifie pas ce total.
- Aucun bouton ni formulaire de pointage ; les commandes serveur clock et clock-correct sont refusées, même pour Direction. Les données historiques restent intactes.
- Les tests sont simulés et n’utilisent aucun compte ou planning réel. Le parcours authentifié en production n’a pas été testé avec un compte utilisateur réel lors de cette mise à jour.

## Correction de synchronisation — 27 octobre 2026

Le renvoi JSONB réordonne les propriétés : une comparaison du texte JSON brut pouvait considérer la réponse enregistrée comme un nouveau changement et relancer indéfiniment la sauvegarde. La comparaison du planning est désormais indépendante de cet ordre, avec normalisation des champs attendus. Les réponses de lecture plus anciennes que la révision courante sont ignorées.

`tests/test-planning-sync.cjs` reproduit le défaut avant correction et vérifie une seule écriture après validation, le repli après réponse serveur, les métadonnées ajoutées côté serveur, les modifications pendant une sauvegarde et le refus d'écraser un véritable conflit. Les neuf suites automatisées passent. Une requête en lecture seule a confirmé le réordonnancement JSONB dans le projet Supabase ; aucune donnée métier n'a été modifiée pour ce contrôle.

## Fermeture de la fenêtre de saisie après validation

Le repli de la carte ne fermait pas la fenêtre contenant le formulaire. Après confirmation serveur, la fenêtre du salarié enregistré se ferme désormais et le planning affiche son shift compact. Une sauvegarde en attente ou en erreur laisse la fenêtre ouverte. Le test automatisé reproduit l'ancienne fenêtre restant ouverte, puis vérifie sa fermeture après choix du créneau, changement de fin, saisie manuelle et nouvelle tentative réussie.
