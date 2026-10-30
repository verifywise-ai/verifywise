import type { ArticleContent } from '../../contentTypes';

export const intakeFormFieldsContent: ArticleContent = {
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
      text: 'This article covers each of the 10 field types in the intake form builder: what it stores, the settings it has and what VerifyWise checks when someone submits the form. The **Field types** panel on the left of the builder lists 9 of them. **Calculated** is in the **Advanced** section at the bottom of that panel.',
    },
    {
      type: 'heading',
      id: 'add-a-field',
      level: 2,
      text: 'Add and set up a field',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open the form and make sure **Edit** is selected at the top of the builder.' },
        { text: 'Click a field type in the **Field types** panel. The field is added at the end of the form.' },
        { text: 'Click the field on the canvas to open its settings on the right.' },
        { text: 'Write the **Label**. This is the question the submitter sees.' },
        { text: 'Fill in the other settings you need (see below), then click **Save**.' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'A form can\'t be saved while a field has an empty label, or while a dropdown or multi-select has no options or an option with an empty label.',
    },
    {
      type: 'heading',
      id: 'field-types',
      level: 2,
      text: 'Field types at a glance',
    },
    {
      type: 'table',
      columns: [
        { key: 'type', label: 'Field type', width: '18%' },
        { key: 'stores', label: 'What it stores', width: '32%' },
        { key: 'checks', label: 'Checked on submit', width: '50%' },
      ],
      rows: [
        { type: 'Short text', stores: 'One line of text', checks: 'Min length and max length. New fields start with a max length of 255.' },
        { type: 'Long text', stores: 'Several lines of text', checks: 'Min length and max length. New fields start with a max length of 2000.' },
        { type: 'Email', stores: 'An email address', checks: 'Must be a valid email address.' },
        { type: 'URL', stores: 'A web address', checks: 'Must be a full address that starts with a scheme, such as https://example.com.' },
        { type: 'Number', stores: 'A number', checks: 'Must be a number, within the min and max value if you set them.' },
        { type: 'Date', stores: 'A date from a date picker', checks: 'Must be a valid date.' },
        { type: 'Dropdown', stores: 'One option from a list', checks: 'Must be one of the field\'s options.' },
        { type: 'Multi-select', stores: 'Any number of options from a list', checks: 'Every choice must be one of the field\'s options.' },
        { type: 'Checkbox', stores: 'Checked or not checked', checks: 'If the field is required, it must be checked.' },
        { type: 'Calculated', stores: 'A number worked out from a formula', checks: 'Nothing to check. VerifyWise works the value out again from the other answers.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Required fields and the checks above apply only to fields the submitter can see. A field hidden by its conditions is never required. See [[Conditional fields]](ai-governance/intake-conditional-fields) for how that works.',
    },
    {
      type: 'heading',
      id: 'common-settings',
      level: 2,
      text: 'Settings every field has',
    },
    {
      type: 'table',
      columns: [
        { key: 'setting', label: 'Setting', width: '22%' },
        { key: 'what', label: 'What it does', width: '50%' },
        { key: 'where', label: 'Missing from', width: '28%' },
      ],
      rows: [
        { setting: 'Label', what: 'The question shown to the submitter. Required.', where: 'None' },
        { setting: 'Placeholder', what: 'Hint text inside an empty input. The public form shows it only on short text, long text, email, URL and number fields. Dropdowns always show "Select an option".', where: 'Calculated' },
        { setting: 'Help text', what: 'A short line shown under the field.', where: 'None' },
        { setting: 'Guidance text', what: 'A longer explanation of why the question matters, also shown under the field. If the form has an LLM key, click **AI** to draft it from the label.', where: 'Calculated' },
        { setting: 'Required field', what: 'The form can\'t be submitted without an answer. Once the field has conditions, this reads **Required when shown**.', where: 'Calculated' },
        { setting: 'Map to entity field', what: 'Copies the answer into the new use case or model when the submission is approved. Only mappings that fit the field type are listed, and each mapping can be used by one field.', where: 'Calculated' },
        { setting: 'Show this field only if…', what: 'Shows the field only when other answers match. See [[Conditional fields]](ai-governance/intake-conditional-fields).', where: 'None' },
      ],
    },
    {
      type: 'heading',
      id: 'text-fields',
      level: 2,
      text: 'Short text and long text',
    },
    {
      type: 'paragraph',
      text: 'Use **Short text** for names and short answers, and **Long text** for descriptions. Under **Validation** you can set **Min length** and **Max length** in characters. The public form shows "Minimum N characters" or "Maximum N characters" when an answer is outside the limits, and VerifyWise checks the same limits again when it receives the submission.',
    },
    {
      type: 'paragraph',
      text: 'A required text field needs more than spaces. An answer made only of spaces counts as empty.',
    },
    {
      type: 'heading',
      id: 'email-url-fields',
      level: 2,
      text: 'Email and URL',
    },
    {
      type: 'paragraph',
      text: '**Email** fields show "Please enter a valid email address" when the submitter tries to submit an answer that isn\'t one. **URL** fields are checked when the form reaches VerifyWise: the answer must be a full address that starts with a scheme, so https://example.com passes and example.com does not. The check doesn\'t limit which scheme is used.',
    },
    {
      type: 'heading',
      id: 'number-field',
      level: 2,
      text: 'Number',
    },
    {
      type: 'paragraph',
      text: 'Set **Min value** and **Max value** under **Validation** to limit the range. Both take whole numbers. The public form shows "Minimum value is N" or "Maximum value is N" when an answer is out of range. Number fields are the inputs for calculated fields, and conditions on them can compare with =, ≠, >, ≥, < and ≤.',
    },
    {
      type: 'heading',
      id: 'date-field',
      level: 2,
      text: 'Date',
    },
    {
      type: 'paragraph',
      text: 'The submitter picks a date. VerifyWise rejects anything that isn\'t a valid date. A condition on a date field can only check whether it is empty or not.',
    },
    {
      type: 'heading',
      id: 'option-fields',
      level: 2,
      text: 'Dropdown and multi-select',
    },
    {
      type: 'paragraph',
      text: 'A **Dropdown** takes one choice and a **Multi-select** takes any number of them. Multi-select choices show as chips above the list. Both fields start with two options, Option 1 and Option 2.',
    },
    {
      type: 'paragraph',
      text: 'Each option has a **Label**, which the submitter and reviewers see, and a **Value**, which VerifyWise stores and which conditions match on. Click **Add option** to add one. A field always keeps at least one option. New options get a value no other option on the field uses.',
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Option values and conditions',
      text: 'If a condition uses a dropdown or multi-select, every option needs a value and no two options can share one. Otherwise the form can\'t be published. If you delete an option that a condition uses, the condition shows an error until you change it.',
    },
    {
      type: 'heading',
      id: 'checkbox-field',
      level: 2,
      text: 'Checkbox',
    },
    {
      type: 'paragraph',
      text: 'A checkbox starts unchecked. If you mark it as required, the submitter has to check it, which suits statements such as "I confirm a DPIA has been completed". Reviewers see the answer as Yes or No.',
    },
    {
      type: 'heading',
      id: 'calculated-field',
      level: 2,
      text: 'Calculated',
    },
    {
      type: 'paragraph',
      text: 'A calculated field shows a read-only number worked out from other number or calculated fields, for example annual cost from monthly cost. It can\'t be required, mapped to an entity field or tagged with a risk dimension. Formulas, rounding and limits are covered in [[Calculated values]](ai-governance/intake-calculated-values).',
    },
    {
      type: 'heading',
      id: 'risk-dimension',
      level: 2,
      text: 'Risk dimension tags',
    },
    {
      type: 'paragraph',
      text: 'Short text, long text, dropdown, multi-select and checkbox fields have a **Risk scoring** section with a **Risk dimension** setting. Choose one of: Data sensitivity, Autonomy level, Impact scope, Transparency, Human oversight or Domain criticality. The AI scorer sees the tag next to the answer. Tags are never sent to the public form, so submitters can\'t see them.',
    },
    {
      type: 'heading',
      id: 'what-reviewers-see',
      level: 2,
      text: 'How answers appear to reviewers',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Dropdown and multi-select answers show the option labels. Several choices are separated by commas.' },
        { text: 'Checkbox answers show as Yes or No.' },
        { text: 'Dates are formatted for reading.' },
        { text: 'Calculated values show with their prefix, suffix and decimals.' },
        { text: 'An unanswered field usually shows a dash ("—"). A multi-select with nothing picked shows as blank. Answers to hidden fields are not stored.' },
      ],
    },
    {
      type: 'heading',
      id: 'walkthrough',
      level: 2,
      text: 'Walkthrough: add a required dropdown',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'In **Edit** mode, click **Dropdown** in the **Field types** panel.' },
        { text: 'Click the new field on the canvas.' },
        { text: 'Set the **Label** to "Where will the system be used?".' },
        { text: 'Under **Options**, change the labels of the two starter options to "EU" and "Outside the EU". Click **Add option** and name it "Both".' },
        { text: 'Under **Validation**, check **Required field**.' },
        { text: 'Click **Save**. Then choose **Preview** > **Form as a submitter** and try to submit without choosing an option. You should see "This field is required".' },
      ],
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'ai-governance',
          articleId: 'intake-forms',
          title: 'Intake forms',
          description: 'Build, publish and review intake forms',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'intake-calculated-values',
          title: 'Calculated values',
          description: 'Formulas, rounding and limits',
        },
        {
          collectionId: 'ai-governance',
          articleId: 'intake-conditional-fields',
          title: 'Conditional fields',
          description: 'Show a field only when other answers match',
        },
      ],
    },
  ],
};
