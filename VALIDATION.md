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
