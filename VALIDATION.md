# Validation de la version connectée

Voir README pour le fonctionnement et les commandes de test.

- 24 scénarios de planning : réussis.
- Tests simulés Auth, droits et API métier : réussis.
- Base réelle : tables privées, RPC pointage interdit aux rôles navigateur, démarrage/arrêt idempotents et contrainte de durée vérifiés avec annulation de transaction.
- Fonctions staff-admin et staff-data déployées avec vérification JWT active.
- La confirmation finale de connexion avec le mot de passe choisi appartient au test utilisateur ; les tests simulés ne la remplacent pas.
