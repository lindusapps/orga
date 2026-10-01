# Validation de la version connectée

Voir README pour le fonctionnement et les commandes de test.

- 25 scénarios de planning : réussis.
- Tests simulés Auth, droits et API métier : réussis.
- Base réelle : tables privées, RPC pointage interdit aux rôles navigateur, démarrage/arrêt idempotents et contrainte de durée vérifiés avec annulation de transaction.
- Fonctions staff-admin et staff-data déployées avec vérification JWT active.
- La confirmation finale de connexion avec le mot de passe choisi appartient au test utilisateur ; les tests simulés ne la remplacent pas.

- Responsable sécurité : tests API simulés et frontend réussis ; refus des opérations non autorisées, filtre Sécu et rôle SQL prioritaire sur les anciens claims vérifiés.
- Base réelle : création des comptes et affectations, révisions, validation Sécu individuelle, refus Bar, retrait d’équipe, désactivation et refus d’accès direct vérifiés avec annulation de transaction.
