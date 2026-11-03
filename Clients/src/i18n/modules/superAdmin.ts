// superAdmin strings for de, fr and es. English is the key.
// Spread into ../translations.ts. Other areas stay in that file for now.

export const de: Record<string, string> = {
  "Deployment name": "Bereitstellungsname",
  "Save the deployment name first, then generate the token.":
    "Speichern Sie zuerst den Bereitstellungsnamen, dann generieren Sie das Token.",
  "Enable centralized monitoring": "Zentrales Monitoring aktivieren",
  "Failed to load monitoring configuration.":
    "Monitoring-Konfiguration konnte nicht geladen werden.",
  "Failed to save monitoring configuration.":
    "Monitoring-Konfiguration konnte nicht gespeichert werden.",
  "Monitoring configuration saved. Restart the server for the new Observability URL to take effect.":
    "Monitoring-Konfiguration gespeichert. Starten Sie den Server neu, damit die neue Observability-URL wirksam wird.",
  "Observability URL": "Observability-URL",
  "Push token": "Push-Token",
  "Push token generated. Restart services to apply changes.":
    "Push-Token generiert. Starten Sie die Dienste neu, um die Änderungen zu übernehmen.",
  "Send logs and metrics to a central observability stack":
    "Logs und Metriken an einen zentralen Observability-Stack senden",
  "Joined": "Beigetreten",
  "Send invite": "Einladung senden",
  "Create Organization": "Organisation erstellen",
  "Delete Organization": "Organisation löschen",
  "Edit user": "Benutzer bearbeiten",
  "Invite user": "Benutzer einladen",
  "Send an invitation to a new user": "Einladung an einen neuen Benutzer senden",
  "All Organizations": "Alle Organisationen",
  "Last Login": "Letzte Anmeldung",
  "Organization Name": "Organisationsname",
  "Search organizations...": "Organisationen suchen...",
  "Search users...": "Benutzer suchen...",
  "Enter a name for the new organization": "Namen für die neue Organisation eingeben",
  "Enter organization name": "Organisationsname eingeben",
  "Manage all organizations on the platform. Create, view, and manage organization access.":
    "Alle Organisationen auf der Plattform verwalten. Organisationszugriff erstellen, anzeigen und verwalten.",
  "Manage your super admin profile and security.":
    "Ihr Super-Admin-Profil und die Sicherheit verwalten.",
  "Select organization": "Organisation auswählen",
  "View and manage all users across all organizations.":
    "Alle Benutzer über alle Organisationen hinweg anzeigen und verwalten.",
  "Last login": "Letzte Anmeldung",
  "Loading organizations...": "Organisationen werden geladen...",
  "View users": "Benutzer anzeigen",
  "All Roles": "Alle Rollen",
  "Elect": "Wählen",
  "Elect Super Admin": "Super Admin wählen",
  "Elect a Super Admin": "Einen Super Admin wählen",
  "Elect other users as Super Admins": "Andere Benutzer als Super Admins wählen",
  "No Super Admins yet.": "Noch keine Super Admins.",
  "Revoke Super Admin": "Super Admin widerrufen",
  "Search by name or email": "Nach Name oder E-Mail suchen",
  "Sent": "Gesendet",
  "Super Admins": "Super Admins",
  "Add first user": "Ersten Benutzer hinzufügen",
  "Add user": "Benutzer hinzufügen",
  "Create API tokens for the super admin API":
    "API-Tokens für die Super-Administrator-API erstellen",
  "Connect Claude Code to this deployment": "Claude Code mit dieser Bereitstellung verbinden",
  "Download the config file": "Konfigurationsdatei herunterladen",
  "Token expires in": "Token läuft ab in",
  "Config file downloaded": "Konfigurationsdatei heruntergeladen",
  "Add it to Claude Code": "Zu Claude Code hinzufügen",
  "Check it worked": "Prüfen, ob es funktioniert hat",
  "What the file contains": "Was die Datei enthält",
  "Tools it adds": "Hinzugefügte Tools",
  "Download config file": "Konfigurationsdatei herunterladen",
  "Preparing...": "Wird vorbereitet...",
  "Failed to create the config file.": "Die Konfigurationsdatei konnte nicht erstellt werden.",
  "Downloading revokes the token issued here last time. Anything set up with the previous file, on this machine or another, stops working immediately.":
    "Beim Herunterladen wird das zuletzt hier ausgestellte Token widerrufen. Alles, was mit der vorherigen Datei eingerichtet wurde, auf diesem oder einem anderen Rechner, funktioniert sofort nicht mehr.",
  "Remove user": "Benutzer entfernen",
  "They lose access to this organization. If it is their only organization, their account is deleted too.":
    "Der Benutzer verliert den Zugriff auf diese Organisation. Ist es seine einzige Organisation, wird auch sein Konto gelöscht.",
  "A Super Admin with no organization cannot be revoked":
    "Einem Super Admin ohne Organisation kann die Rolle nicht entzogen werden",
  "Name and email apply in every organization the user belongs to.":
    "Name und E-Mail gelten in jeder Organisation, der der Benutzer angehört.",
  "This email already has an account. The invitation lets them join with it.":
    "Für diese E-Mail-Adresse gibt es bereits ein Konto. Mit der Einladung tritt der Benutzer mit diesem Konto bei.",
  "This email already has an account. It joins with its own name and password.":
    "Für diese E-Mail-Adresse gibt es bereits ein Konto. Es tritt mit seinem eigenen Namen und Passwort bei.",
  "Grant an existing user cross-organization Super Admin capabilities. Their organization roles are unchanged.":
    "Einem bestehenden Benutzer organisationsübergreifende Super Admin-Berechtigungen erteilen. Seine Rollen in den Organisationen bleiben unverändert.",
  "They will keep their organization roles but lose cross-organization access.":
    "Er behält seine Organisationsrollen, verliert jedoch den organisationsübergreifenden Zugriff.",
};

export const fr: Record<string, string> = {
  "Deployment name": "Nom du déploiement",
  "Save the deployment name first, then generate the token.":
    "Enregistrez d'abord le nom du déploiement, puis générez le jeton.",
  "Enable centralized monitoring": "Activer la surveillance centralisée",
  "Failed to load monitoring configuration.":
    "Échec du chargement de la configuration de surveillance.",
  "Failed to save monitoring configuration.":
    "Échec de l'enregistrement de la configuration de surveillance.",
  "Monitoring configuration saved. Restart the server for the new Observability URL to take effect.":
    "Configuration de surveillance enregistrée. Redémarrez le serveur pour que la nouvelle URL d'observabilité prenne effet.",
  "Observability URL": "URL d'observabilité",
  "Push token": "Jeton d'envoi",
  "Push token generated. Restart services to apply changes.":
    "Jeton d'envoi généré. Redémarrez les services pour appliquer les modifications.",
  "Send logs and metrics to a central observability stack":
    "Envoyer les journaux et les métriques vers une pile d'observabilité centralisée",
  "Joined": "Rejoint le",
  "Send invite": "Envoyer l'invitation",
  "Create Organization": "Créer une organisation",
  "Delete Organization": "Supprimer l'organisation",
  "Edit user": "Modifier l'utilisateur",
  "Invite user": "Inviter un utilisateur",
  "Send an invitation to a new user": "Envoyer une invitation à un nouvel utilisateur",
  "All Organizations": "Toutes les organisations",
  "Last Login": "Dernière connexion",
  "Organization Name": "Nom de l'organisation",
  "Search organizations...": "Rechercher des organisations...",
  "Search users...": "Rechercher des utilisateurs...",
  "Enter a name for the new organization": "Saisissez un nom pour la nouvelle organisation",
  "Enter organization name": "Saisir le nom de l'organisation",
  "Manage all organizations on the platform. Create, view, and manage organization access.":
    "Gérez toutes les organisations de la plateforme. Créez, consultez et gérez les accès des organisations.",
  "Manage your super admin profile and security.":
    "Gérez votre profil super-administrateur et la sécurité.",
  "Select organization": "Sélectionner une organisation",
  "View and manage all users across all organizations.":
    "Consulter et gérer tous les utilisateurs dans toutes les organisations.",
  "Last login": "Dernière connexion",
  "Loading organizations...": "Chargement des organisations...",
  "View users": "Voir les utilisateurs",
  "All Roles": "Tous les rôles",
  "Elect": "Élire",
  "Elect Super Admin": "Élire un Super Admin",
  "Elect a Super Admin": "Élire un Super Admin",
  "Elect other users as Super Admins": "Élire d'autres utilisateurs comme Super Admins",
  "No Super Admins yet.": "Aucun Super Admin pour le moment.",
  "Revoke Super Admin": "Révoquer Super Admin",
  "Search by name or email": "Rechercher par nom ou e-mail",
  "Sent": "Envoyé",
  "Super Admins": "Super Admins",
  "Add first user": "Ajouter le premier utilisateur",
  "Add user": "Ajouter un utilisateur",
  "Create API tokens for the super admin API":
    "Créer des tokens d'API pour l'API super administrateur",
  "Connect Claude Code to this deployment": "Connecter Claude Code à ce déploiement",
  "Download the config file": "Télécharger le fichier de configuration",
  "Token expires in": "Le jeton expire dans",
  "Config file downloaded": "Fichier de configuration téléchargé",
  "Add it to Claude Code": "L'ajouter à Claude Code",
  "Check it worked": "Vérifier que cela fonctionne",
  "What the file contains": "Contenu du fichier",
  "Tools it adds": "Outils ajoutés",
  "Download config file": "Télécharger le fichier de configuration",
  "Preparing...": "Préparation...",
  "Failed to create the config file.": "Impossible de créer le fichier de configuration.",
  "Downloading revokes the token issued here last time. Anything set up with the previous file, on this machine or another, stops working immediately.":
    "Le téléchargement révoque le jeton émis ici la dernière fois. Tout ce qui a été configuré avec le fichier précédent, sur cette machine ou une autre, cesse immédiatement de fonctionner.",
  "Remove user": "Retirer l'utilisateur",
  "They lose access to this organization. If it is their only organization, their account is deleted too.":
    "Il perd l'accès à cette organisation. Si c'est sa seule organisation, son compte est également supprimé.",
  "A Super Admin with no organization cannot be revoked":
    "Un Super Admin sans organisation ne peut pas être révoqué",
  "Name and email apply in every organization the user belongs to.":
    "Le nom et l'e-mail s'appliquent dans toutes les organisations de l'utilisateur.",
  "This email already has an account. The invitation lets them join with it.":
    "Cette adresse e-mail a déjà un compte. L'invitation lui permet de rejoindre l'organisation avec ce compte.",
  "This email already has an account. It joins with its own name and password.":
    "Cette adresse e-mail a déjà un compte. Il rejoint l'organisation avec son propre nom et mot de passe.",
  "Grant an existing user cross-organization Super Admin capabilities. Their organization roles are unchanged.":
    "Accordez à un utilisateur existant des capacités de Super Admin inter-organisations. Ses rôles dans les organisations restent inchangés.",
  "They will keep their organization roles but lose cross-organization access.":
    "Il conservera ses rôles dans les organisations mais perdra l'accès inter-organisations.",
};

export const es: Record<string, string> = {
  "Deployment name": "Nombre del despliegue",
  "Save the deployment name first, then generate the token.":
    "Primero guarde el nombre del despliegue y luego genere el token.",
  "Enable centralized monitoring": "Habilitar la supervisión centralizada",
  "Failed to load monitoring configuration.": "No se pudo cargar la configuración de supervisión.",
  "Failed to save monitoring configuration.": "No se pudo guardar la configuración de supervisión.",
  "Monitoring configuration saved. Restart the server for the new Observability URL to take effect.":
    "Configuración de supervisión guardada. Reinicie el servidor para que la nueva URL de observabilidad surta efecto.",
  "Observability URL": "URL de observabilidad",
  "Push token": "Token de envío",
  "Push token generated. Restart services to apply changes.":
    "Token de envío generado. Reinicie los servicios para aplicar los cambios.",
  "Send logs and metrics to a central observability stack":
    "Enviar registros y métricas a una pila de observabilidad centralizada",
  "Joined": "Se unió",
  "Send invite": "Enviar invitación",
  "Create Organization": "Crear organización",
  "Delete Organization": "Eliminar organización",
  "Edit user": "Editar usuario",
  "Invite user": "Invitar usuario",
  "Send an invitation to a new user": "Enviar una invitación a un nuevo usuario",
  "All Organizations": "Todas las organizaciones",
  "Last Login": "Último inicio de sesión",
  "Organization Name": "Nombre de la organización",
  "Search organizations...": "Buscar organizaciones...",
  "Search users...": "Buscar usuarios...",
  "Enter a name for the new organization": "Introduce un nombre para la nueva organización",
  "Enter organization name": "Introduce el nombre de la organización",
  "Manage all organizations on the platform. Create, view, and manage organization access.":
    "Gestione todas las organizaciones de la plataforma. Cree, vea y gestione el acceso de las organizaciones.",
  "Manage your super admin profile and security.":
    "Gestione su perfil de superadministrador y la seguridad.",
  "Select organization": "Selecciona una organización",
  "View and manage all users across all organizations.":
    "Vea y gestione todos los usuarios de todas las organizaciones.",
  "Last login": "Último inicio de sesión",
  "Loading organizations...": "Cargando organizaciones...",
  "View users": "Ver usuarios",
  "All Roles": "Todos los roles",
  "Elect": "Elegir",
  "Elect Super Admin": "Elegir Super Admin",
  "Elect a Super Admin": "Elegir un Super Admin",
  "Elect other users as Super Admins": "Elegir a otros usuarios como Super Admins",
  "No Super Admins yet.": "Aún no hay Super Admins.",
  "Revoke Super Admin": "Revocar Super Admin",
  "Search by name or email": "Buscar por nombre o correo electrónico",
  "Sent": "Enviado",
  "Super Admins": "Super Admins",
  "Add first user": "Añadir primer usuario",
  "Add user": "Añadir usuario",
  "Create API tokens for the super admin API":
    "Crear tokens de API para la API de superadministrador",
  "Connect Claude Code to this deployment": "Conectar Claude Code a esta implementación",
  "Download the config file": "Descargar el archivo de configuración",
  "Token expires in": "El token caduca en",
  "Config file downloaded": "Archivo de configuración descargado",
  "Add it to Claude Code": "Añadirlo a Claude Code",
  "Check it worked": "Comprobar que funcionó",
  "What the file contains": "Qué contiene el archivo",
  "Tools it adds": "Herramientas que añade",
  "Download config file": "Descargar el archivo de configuración",
  "Preparing...": "Preparando...",
  "Failed to create the config file.": "No se pudo crear el archivo de configuración.",
  "Downloading revokes the token issued here last time. Anything set up with the previous file, on this machine or another, stops working immediately.":
    "Al descargarlo se revoca el token emitido aquí la última vez. Todo lo que se configuró con el archivo anterior, en este equipo o en otro, deja de funcionar de inmediato.",
  "Remove user": "Quitar usuario",
  "They lose access to this organization. If it is their only organization, their account is deleted too.":
    "Pierde el acceso a esta organización. Si es su única organización, también se elimina su cuenta.",
  "A Super Admin with no organization cannot be revoked":
    "Un Super Admin sin organización no se puede revocar",
  "Name and email apply in every organization the user belongs to.":
    "El nombre y el correo se aplican en todas las organizaciones del usuario.",
  "This email already has an account. The invitation lets them join with it.":
    "Este correo ya tiene una cuenta. La invitación le permite unirse con ella.",
  "This email already has an account. It joins with its own name and password.":
    "Este correo ya tiene una cuenta. Se une con su propio nombre y contraseña.",
  "Grant an existing user cross-organization Super Admin capabilities. Their organization roles are unchanged.":
    "Conceda a un usuario existente capacidades de Super Admin entre organizaciones. Sus roles en las organizaciones no cambian.",
  "They will keep their organization roles but lose cross-organization access.":
    "Mantendrá sus roles en las organizaciones pero perderá el acceso entre organizaciones.",
};
