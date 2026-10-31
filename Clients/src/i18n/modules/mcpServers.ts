// MCP server authentication strings for de, fr and es. English is the key.
// Spread into ../translations.ts. Other areas stay in that file for now.

export const de: Record<string, string> = {
  "OAuth (client credentials)": "OAuth (Client Credentials)",
  "AWS IAM": "AWS IAM",
  "Client ID": "Client-ID",
  "Client secret": "Client-Secret",
  "Scope (optional)": "Scope (optional)",
  "Token URL": "Token-URL",
  "Find token URL": "Token-URL suchen",
  "Finding token URL...": "Token-URL wird gesucht...",
  "Found at {host}. Check this is your identity provider before saving.":
    "Gefunden unter {host}. Prüfen Sie vor dem Speichern, ob dies Ihr Identitätsanbieter ist.",
  "Advanced": "Erweitert",
  "Client authentication": "Client-Authentifizierung",
  "Keep current setting": "Aktuelle Einstellung beibehalten",
  "Basic (header)": "Basic (Header)",
  "In request body": "Im Anfrage-Body",
  "Resource (optional)": "Ressource (optional)",
  "Region": "Region",
  "Access key ID": "Zugriffsschlüssel-ID",
  "Secret access key": "Geheimer Zugriffsschlüssel",
  "Use the long-term access key of an IAM user with the AWSMCPSignInOAuthAccessPolicy policy. Tool calls run with that user's permissions.":
    "Verwenden Sie den langfristigen Zugriffsschlüssel eines IAM-Benutzers mit der Richtlinie AWSMCPSignInOAuthAccessPolicy. Tool-Aufrufe laufen mit den Berechtigungen dieses Benutzers.",
  "Current secret: {hint}. Leave blank to keep it.":
    "Aktuelles Geheimnis: {hint}. Leer lassen, um es beizubehalten.",
  "Current key: {hint}. Leave blank to keep it.":
    "Aktueller Schlüssel: {hint}. Leer lassen, um ihn beizubehalten.",
  "Enter the server URL first": "Geben Sie zuerst die Server-URL ein",
  "Could not find the token URL": "Die Token-URL konnte nicht gefunden werden",
};

export const fr: Record<string, string> = {
  "OAuth (client credentials)": "OAuth (identifiants client)",
  "AWS IAM": "AWS IAM",
  "Client ID": "ID client",
  "Client secret": "Secret client",
  "Scope (optional)": "Scope (facultatif)",
  "Token URL": "URL du jeton",
  "Find token URL": "Trouver l'URL du jeton",
  "Finding token URL...": "Recherche de l'URL du jeton...",
  "Found at {host}. Check this is your identity provider before saving.":
    "Trouvée sur {host}. Vérifiez qu'il s'agit bien de votre fournisseur d'identité avant d'enregistrer.",
  "Advanced": "Avancé",
  "Client authentication": "Authentification du client",
  "Keep current setting": "Conserver le réglage actuel",
  "Basic (header)": "Basic (en-tête)",
  "In request body": "Dans le corps de la requête",
  "Resource (optional)": "Ressource (facultatif)",
  "Region": "Région",
  "Access key ID": "ID de clé d'accès",
  "Secret access key": "Clé d'accès secrète",
  "Use the long-term access key of an IAM user with the AWSMCPSignInOAuthAccessPolicy policy. Tool calls run with that user's permissions.":
    "Utilisez la clé d'accès à long terme d'un utilisateur IAM disposant de la stratégie AWSMCPSignInOAuthAccessPolicy. Les appels d'outils s'exécutent avec les autorisations de cet utilisateur.",
  "Current secret: {hint}. Leave blank to keep it.":
    "Secret actuel : {hint}. Laissez vide pour le conserver.",
  "Current key: {hint}. Leave blank to keep it.":
    "Clé actuelle : {hint}. Laissez vide pour la conserver.",
  "Enter the server URL first": "Saisissez d'abord l'URL du serveur",
  "Could not find the token URL": "Impossible de trouver l'URL du jeton",
};

export const es: Record<string, string> = {
  "OAuth (client credentials)": "OAuth (credenciales de cliente)",
  "AWS IAM": "AWS IAM",
  "Client ID": "ID de cliente",
  "Client secret": "Secreto de cliente",
  "Scope (optional)": "Scope (opcional)",
  "Token URL": "URL del token",
  "Find token URL": "Buscar la URL del token",
  "Finding token URL...": "Buscando la URL del token...",
  "Found at {host}. Check this is your identity provider before saving.":
    "Encontrada en {host}. Comprueba que es tu proveedor de identidad antes de guardar.",
  "Advanced": "Avanzado",
  "Client authentication": "Autenticación del cliente",
  "Keep current setting": "Mantener la configuración actual",
  "Basic (header)": "Basic (cabecera)",
  "In request body": "En el cuerpo de la solicitud",
  "Resource (optional)": "Recurso (opcional)",
  "Region": "Región",
  "Access key ID": "ID de clave de acceso",
  "Secret access key": "Clave de acceso secreta",
  "Use the long-term access key of an IAM user with the AWSMCPSignInOAuthAccessPolicy policy. Tool calls run with that user's permissions.":
    "Usa la clave de acceso de larga duración de un usuario de IAM con la política AWSMCPSignInOAuthAccessPolicy. Las llamadas a herramientas se ejecutan con los permisos de ese usuario.",
  "Current secret: {hint}. Leave blank to keep it.":
    "Secreto actual: {hint}. Déjalo en blanco para conservarlo.",
  "Current key: {hint}. Leave blank to keep it.":
    "Clave actual: {hint}. Déjalo en blanco para conservarla.",
  "Enter the server URL first": "Introduce primero la URL del servidor",
  "Could not find the token URL": "No se pudo encontrar la URL del token",
};
