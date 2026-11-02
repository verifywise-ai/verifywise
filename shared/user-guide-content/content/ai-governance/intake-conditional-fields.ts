import type { ArticleContent } from '../../contentTypes';

export const intakeConditionalFieldsContent: ArticleContent = {
  blocks: [
    {
      type: 'time-estimate',
      text: '7 min read',
    },
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'A conditional field appears on the public form only when other answers match the conditions you set. Use it to ask follow-up questions that only apply to some submitters, for example which vendor they use, shown only to people who said they use a third-party model.',
    },
    {
      type: 'heading',
      id: 'add-a-condition',
      level: 2,
      text: 'Add a condition',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Click the field you want to show or hide on the canvas.' },
        { text: 'In the field settings, open **Show this field only if…**. Under the section title you can see "Always shown" or which kind of match is set.' },
        { text: 'Click **Add condition**.' },
        { text: 'Under **Field**, choose the question this field depends on.' },
        { text: 'Under **Condition**, choose how to compare. The choices depend on the type of that question (see the table below).' },
        { text: 'Set the **Value** if the condition needs one.' },
        { text: 'To add more conditions, click **Add condition** again. With two or more, choose **Match**: **All conditions** or **Any condition**.' },
        { text: 'Click **Save**, then check it with **Preview** > **Form as a submitter**.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'A field can have up to 20 conditions. To remove one, click the bin icon next to it. When the last condition is removed, the field is always shown again.',
    },
    {
      type: 'heading',
      id: 'which-fields',
      level: 2,
      text: 'Which questions a condition can use',
    },
    {
      type: 'paragraph',
      text: 'A condition can use any other field on the form, above or below it. The **Field** list leaves out fields that already depend on this one, because that would create a loop. If the form has no other fields, the section says "Add another field to create a rule".',
    },
    {
      type: 'paragraph',
      text: 'A condition that uses a field further down can confuse submitters, because the field appears or disappears based on something they haven\'t reached yet. In most forms, conditions work best on questions above the field.',
    },
    {
      type: 'heading',
      id: 'conditions-by-type',
      level: 2,
      text: 'Conditions for each field type',
    },
    {
      type: 'table',
      columns: [
        { key: 'type', label: 'Question type', width: '22%' },
        { key: 'conditions', label: 'Conditions you can choose', width: '38%' },
        { key: 'value', label: 'Value', width: '40%' },
      ],
      rows: [
        { type: 'Dropdown', conditions: 'is, is not, is one of, is empty, is not empty', value: 'Pick an option. For "is one of", check one or more options.' },
        { type: 'Multi-select', conditions: 'includes, does not include, includes any of, is empty, is not empty', value: 'Pick an option. For "includes any of", check one or more options.' },
        { type: 'Checkbox', conditions: 'is checked, is not checked', value: 'None' },
        { type: 'Short text, Long text, Email, URL', conditions: 'is, contains, is empty, is not empty', value: 'Type the text to compare with.' },
        { type: 'Number, Calculated', conditions: '=, ≠, >, ≥, <, ≤, is empty, is not empty', value: 'Type a number.' },
        { type: 'Date', conditions: 'is empty, is not empty', value: 'None' },
      ],
    },
    {
      type: 'heading',
      id: 'how-conditions-match',
      level: 2,
      text: 'How conditions are checked',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Unanswered questions', text: 'A condition on a question with no answer is false, except **is empty** and **is not checked**. This includes **is not** and **does not include**, so a field that depends on an unanswered question stays hidden until it is answered.' },
        { bold: 'What counts as empty', text: 'No answer, text made only of spaces or a multi-select with nothing chosen. An unchecked checkbox counts as **is not checked**.' },
        { bold: 'Text', text: '**is** and **contains** ignore upper and lower case and spaces at the start and end. "contains" looks for the text anywhere in the answer.' },
        { bold: 'Dropdown and multi-select', text: 'Conditions match the option itself, not its label text, so renaming an option\'s label doesn\'t break them. **includes any of** is true when at least one checked option was chosen.' },
        { bold: 'Hidden questions', text: 'If the question a condition uses is itself hidden, it counts as unanswered. Hiding one field can therefore hide the fields that depend on it.' },
        { bold: 'All or any', text: 'With **All conditions**, every condition must be true. With **Any condition**, one is enough.' },
      ],
    },
    {
      type: 'heading',
      id: 'hidden-fields',
      level: 2,
      text: 'What happens to hidden fields',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'A hidden field is never required. Once a field has conditions, its required checkbox reads **Required when shown**.' },
        { text: 'If a submitter answers a field and a later change hides it, their browser keeps the answer. It comes back if the field is shown again, but it is not sent with the submission.' },
        { text: 'When the submission arrives, VerifyWise checks the conditions again against the answers and drops any answer to a field that should be hidden. Reviewers only see answers to fields the submitter could see.' },
        { text: 'A hidden calculated field has no value and counts as empty for formulas and conditions that use it.' },
      ],
    },
    {
      type: 'heading',
      id: 'restrictions',
      level: 2,
      text: 'Fields that can\'t have conditions',
    },
    {
      type: 'paragraph',
      text: 'Fields mapped to the use case name, the use case goal or the model name are always shown, because VerifyWise needs those values to create the use case or model. Their condition section says "This field is always shown: it fills a required field of the new entity".',
    },
    {
      type: 'heading',
      id: 'publish-checks',
      level: 2,
      text: 'Checks before publishing',
    },
    {
      type: 'paragraph',
      text: 'You can save a draft with unfinished conditions. You can\'t publish the form, or save changes to a published form, while a condition has one of these problems. The field is highlighted in the builder with the reason.',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'It uses a field that was removed.' },
        { text: 'Its comparison doesn\'t fit the type of the question, for example after the question\'s type changed.' },
        { text: 'It has no value, or its value is an option that no longer exists.' },
        { text: 'The field has more than 20 conditions.' },
        { text: 'The conditions depend on the field itself, or two fields depend on each other in a loop.' },
        { text: 'A dropdown or multi-select used by a condition has an option with no value, or two options with the same value.' },
      ],
    },
    {
      type: 'heading',
      id: 'walkthrough-checkbox',
      level: 2,
      text: 'Walkthrough: a follow-up question',
    },
    {
      type: 'paragraph',
      text: 'Show "Which vendor provides the model?" only to people who use a third-party model.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Add a **Checkbox** field labelled "We use a third-party model".' },
        { text: 'Add a **Short text** field labelled "Which vendor provides the model?" and check **Required field**.' },
        { text: 'With the short text field selected, open **Show this field only if…** and click **Add condition**.' },
        { text: 'Set **Field** to "We use a third-party model" and **Condition** to **is checked**. The required checkbox now reads **Required when shown**.' },
        { text: 'Save and preview the form. The vendor question appears when you check the box and disappears when you uncheck it. With the box unchecked, the form submits without a vendor.' },
      ],
    },
    {
      type: 'heading',
      id: 'walkthrough-any',
      level: 2,
      text: 'Walkthrough: show a field when any of several answers match',
    },
    {
      type: 'paragraph',
      text: 'Ask for a data protection impact assessment when the system processes sensitive data or reaches many people.',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Make sure the form has a **Multi-select** field "What data does the system process?" with options including Health data and Biometric data, and a **Number** field "How many people will it affect?".' },
        { text: 'Add a **Long text** field labelled "Summarize the DPIA".' },
        { text: 'Add a condition: **Field** "What data does the system process?", **Condition** **includes any of**, then check Health data and Biometric data.' },
        { text: 'Add a second condition: **Field** "How many people will it affect?", **Condition** **≥**, **Value** 10000.' },
        { text: 'Set **Match** to **Any condition**.' },
        { text: 'Save and preview. The DPIA question appears if either condition is true.' },
      ],
    },
    {
      type: 'heading',
      id: 'logic-view',
      level: 2,
      text: 'See all conditions at once',
    },
    {
      type: 'paragraph',
      text: 'Select **Logic** at the top of the builder to list every conditional field and the questions it depends on, next to the form\'s calculations and reviewer assignment. Click a row to open that field.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-governance',
          articleId: 'intake-form-fields',
          title: 'Intake form fields',
          description: 'Every field type and its settings',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'intake-calculated-values',
          title: 'Calculated values',
          description: 'Formulas, rounding and limits',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'intake-forms',
          title: 'Intake forms',
          description: 'Build, publish and review intake forms',
        },
      ],
    },
  ],
};
