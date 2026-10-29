// Intake "Preview as" strings for de, fr and es. English is the key.
// Spread into ../translations.ts. The role banner is split into text nodes
// ("Previewing as", the role, "simulation only") so each part translates.

export const de: Record<string, string> = {
  "Test submit": "Testweise absenden",
  "Submit for real": "Echt absenden",
  "How to submit": "Wie absenden",
  "Checks your answers and sends nothing: no submission, no emails, no AI scoring.":
    "Prüft Ihre Antworten und sendet nichts: keine Einreichung, keine E-Mails, keine KI-Bewertung.",
  "Creates a real submission, emails your reviewers and runs AI scoring if the form uses it.":
    "Erstellt eine echte Einreichung, benachrichtigt Ihre Prüfer per E-Mail und führt die KI-Bewertung aus, wenn das Formular sie nutzt.",
  "Test submit passed. Nothing was sent.":
    "Testweises Absenden erfolgreich. Es wurde nichts gesendet.",
  // Builder Preview menu
  "Form as a submitter": "Formular als einreichende Person",
  "Opens the public form in a new tab": "Öffnet das öffentliche Formular in einem neuen Tab",
  "Review flow as": "Prüfablauf als",
  "Senior reviewer": "Senior-Prüfer",
  "Standard reviewer": "Standard-Prüfer",
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
  "Loading routing for this form": "Routing für dieses Formular wird geladen",
  "Could not load routing for this form": "Routing für dieses Formular konnte nicht geladen werden",
  "This submission is assigned to senior reviewers":
    "Diese Einreichung ist Senior-Prüfern zugewiesen",
};

export const fr: Record<string, string> = {
  "Test submit": "Tester l’envoi",
  "Submit for real": "Envoyer pour de vrai",
  "How to submit": "Comment envoyer",
  "Checks your answers and sends nothing: no submission, no emails, no AI scoring.":
    "Vérifie vos réponses et n’envoie rien : aucune soumission, aucun e-mail, aucune évaluation par l’IA.",
  "Creates a real submission, emails your reviewers and runs AI scoring if the form uses it.":
    "Crée une vraie soumission, envoie un e-mail à vos réviseurs et lance l’évaluation par l’IA si le formulaire l’utilise.",
  "Test submit passed. Nothing was sent.": "Test d’envoi réussi. Rien n’a été envoyé.",
  // Builder Preview menu
  "Form as a submitter": "Formulaire en tant que demandeur",
  "Opens the public form in a new tab": "Ouvre le formulaire public dans un nouvel onglet",
  "Review flow as": "Circuit de revue en tant que",
  "Senior reviewer": "Réviseur senior",
  "Standard reviewer": "Réviseur standard",
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
  "Loading routing for this form": "Chargement du routage de ce formulaire",
  "Could not load routing for this form": "Impossible de charger le routage de ce formulaire",
  "This submission is assigned to senior reviewers":
    "Cette soumission est attribuée aux réviseurs seniors",
};

export const es: Record<string, string> = {
  "Test submit": "Probar envío",
  "Submit for real": "Enviar de verdad",
  "How to submit": "Cómo enviar",
  "Checks your answers and sends nothing: no submission, no emails, no AI scoring.":
    "Revisa sus respuestas y no envía nada: ningún envío, ningún correo, ninguna evaluación con IA.",
  "Creates a real submission, emails your reviewers and runs AI scoring if the form uses it.":
    "Crea un envío real, envía un correo a sus revisores y ejecuta la evaluación con IA si el formulario la usa.",
  "Test submit passed. Nothing was sent.": "Prueba de envío correcta. No se envió nada.",
  // Builder Preview menu
  "Form as a submitter": "Formulario como solicitante",
  "Opens the public form in a new tab": "Abre el formulario público en una pestaña nueva",
  "Review flow as": "Flujo de revisión como",
  "Senior reviewer": "Revisor sénior",
  "Standard reviewer": "Revisor estándar",
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
  "Loading routing for this form": "Cargando el enrutamiento de este formulario",
  "Could not load routing for this form": "No se pudo cargar el enrutamiento de este formulario",
  "This submission is assigned to senior reviewers": "Este envío está asignado a revisores sénior",
};
