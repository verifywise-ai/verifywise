// Intake "Preview as" strings for de, fr and es. English is the key.
// Spread into ../translations.ts. The role banner is split into text nodes
// ("Previewing as", the role, "simulation only") so each part translates.

export const de: Record<string, string> = {
  "Test submit": "Testweise absenden",
  "Submit for real": "Echt absenden",
  "How to submit": "Wie absenden",
  "Runs the checks on this page and sends nothing: no submission, no emails, no AI scoring.":
    "Führt die Prüfungen auf dieser Seite aus und sendet nichts: keine Einreichung, keine E-Mails, keine KI-Bewertung.",
  "Creates a real submission, emails your reviewers and runs AI scoring if the form uses it.":
    "Erstellt eine echte Einreichung, benachrichtigt Ihre Prüfer per E-Mail und führt die KI-Bewertung aus, wenn das Formular sie nutzt.",
  "Test submit passed the checks on this page. Nothing was sent. The captcha answer and the server checks only run on a real submit.":
    "Testweises Absenden hat die Prüfungen auf dieser Seite bestanden. Es wurde nichts gesendet. Die Captcha-Antwort und die Serverprüfungen laufen nur beim echten Absenden.",
  // Builder Preview menu
  "Form as a submitter": "Formular als einreichende Person",
  "Opens the public form in a new tab": "Öffnet das öffentliche Formular in einem neuen Tab",
  "Review flow as": "Prüfablauf als",
  "Expert reviewer": "Expertenprüfer",
  "Regular reviewer": "Regulärer Prüfer",
  // Review simulation banner
  "Previewing as": "Vorschau als",
  "simulation only": "nur Simulation",
  "Actions are turned off. The server still checks every real action against your own role.":
    "Aktionen sind deaktiviert. Der Server prüft weiterhin jede echte Aktion anhand Ihrer eigenen Rolle.",
  "Switch role": "Rolle wechseln",
  "Exit preview": "Vorschau beenden",
  // Public form preview notice
  "Previewing as a submitter": "Vorschau als einreichende Person",
  "This is the form people see from your public link. Submit lets you test it, which sends nothing, or submit for real, which reaches your reviewers.":
    "So sehen Personen das Formular über Ihren öffentlichen Link. Mit Absenden können Sie es testen, dann wird nichts gesendet, oder echt absenden, dann erreicht es Ihre Prüfer.",
  "Dismiss preview notice": "Vorschauhinweis schließen",
  // Review simulation, routing state and blocked line
  "Loading reviewer assignment for this form": "Prüferzuweisung für dieses Formular wird geladen",
  "Could not load reviewer assignment for this form":
    "Prüferzuweisung für dieses Formular konnte nicht geladen werden",
  "This submission is assigned to expert reviewers":
    "Diese Einreichung ist Expertenprüfern zugewiesen",
};

export const fr: Record<string, string> = {
  "Test submit": "Tester l’envoi",
  "Submit for real": "Envoyer pour de vrai",
  "How to submit": "Comment envoyer",
  "Runs the checks on this page and sends nothing: no submission, no emails, no AI scoring.":
    "Lance les vérifications de cette page et n’envoie rien : aucune soumission, aucun e-mail, aucune évaluation par l’IA.",
  "Creates a real submission, emails your reviewers and runs AI scoring if the form uses it.":
    "Crée une vraie soumission, envoie un e-mail à vos réviseurs et lance l’évaluation par l’IA si le formulaire l’utilise.",
  "Test submit passed the checks on this page. Nothing was sent. The captcha answer and the server checks only run on a real submit.":
    "Le test d’envoi a passé les vérifications de cette page. Rien n’a été envoyé. La réponse au captcha et les vérifications du serveur ne s’exécutent que lors d’un vrai envoi.",
  // Builder Preview menu
  "Form as a submitter": "Formulaire en tant que demandeur",
  "Opens the public form in a new tab": "Ouvre le formulaire public dans un nouvel onglet",
  "Review flow as": "Circuit de revue en tant que",
  "Expert reviewer": "Réviseur expert",
  "Regular reviewer": "Réviseur habituel",
  // Review simulation banner
  "Previewing as": "Aperçu en tant que",
  "simulation only": "simulation uniquement",
  "Actions are turned off. The server still checks every real action against your own role.":
    "Les actions sont désactivées. Le serveur vérifie toujours chaque action réelle selon votre propre rôle.",
  "Switch role": "Changer de rôle",
  "Exit preview": "Quitter l’aperçu",
  // Public form preview notice
  "Previewing as a submitter": "Aperçu en tant que demandeur",
  "This is the form people see from your public link. Submit lets you test it, which sends nothing, or submit for real, which reaches your reviewers.":
    "Voici le formulaire que les personnes voient depuis votre lien public. Envoyer permet de le tester, sans rien envoyer, ou de l’envoyer pour de vrai, à vos réviseurs.",
  "Dismiss preview notice": "Fermer l’avis d’aperçu",
  // Review simulation, routing state and blocked line
  "Loading reviewer assignment for this form":
    "Chargement de l'attribution des réviseurs de ce formulaire",
  "Could not load reviewer assignment for this form":
    "Impossible de charger l'attribution des réviseurs de ce formulaire",
  "This submission is assigned to expert reviewers":
    "Cette soumission est attribuée aux réviseurs experts",
};

export const es: Record<string, string> = {
  "Test submit": "Probar envío",
  "Submit for real": "Enviar de verdad",
  "How to submit": "Cómo enviar",
  "Runs the checks on this page and sends nothing: no submission, no emails, no AI scoring.":
    "Ejecuta las comprobaciones de esta página y no envía nada: ningún envío, ningún correo, ninguna evaluación con IA.",
  "Creates a real submission, emails your reviewers and runs AI scoring if the form uses it.":
    "Crea un envío real, envía un correo a sus revisores y ejecuta la evaluación con IA si el formulario la usa.",
  "Test submit passed the checks on this page. Nothing was sent. The captcha answer and the server checks only run on a real submit.":
    "La prueba de envío pasó las comprobaciones de esta página. No se envió nada. La respuesta del captcha y las comprobaciones del servidor solo se ejecutan en un envío real.",
  // Builder Preview menu
  "Form as a submitter": "Formulario como solicitante",
  "Opens the public form in a new tab": "Abre el formulario público en una pestaña nueva",
  "Review flow as": "Flujo de revisión como",
  "Expert reviewer": "Revisor experto",
  "Regular reviewer": "Revisor habitual",
  // Review simulation banner
  "Previewing as": "Vista previa como",
  "simulation only": "solo simulación",
  "Actions are turned off. The server still checks every real action against your own role.":
    "Las acciones están desactivadas. El servidor sigue comprobando cada acción real según su propio rol.",
  "Switch role": "Cambiar de rol",
  "Exit preview": "Salir de la vista previa",
  // Public form preview notice
  "Previewing as a submitter": "Vista previa como solicitante",
  "This is the form people see from your public link. Submit lets you test it, which sends nothing, or submit for real, which reaches your reviewers.":
    "Este es el formulario que se ve desde su enlace público. Enviar le permite probarlo, sin enviar nada, o enviarlo de verdad, a sus revisores.",
  "Dismiss preview notice": "Cerrar el aviso de vista previa",
  // Review simulation, routing state and blocked line
  "Loading reviewer assignment for this form":
    "Cargando la asignación de revisores de este formulario",
  "Could not load reviewer assignment for this form":
    "No se pudo cargar la asignación de revisores de este formulario",
  "This submission is assigned to expert reviewers":
    "Este envío está asignado a revisores expertos",
};
