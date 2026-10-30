import type { ArticleContent } from '../../contentTypes';

export const intakeCalculatedValuesContent: ArticleContent = {
  blocks: [
    {
      type: 'time-estimate',
      text: '6 min read',
    },
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'A calculated field shows a number worked out from other answers on the form, such as annual cost from monthly cost, or cost per user. The submitter can\'t type into it. The value updates as they fill in the fields it reads.',
    },
    {
      type: 'heading',
      id: 'add-a-calculated-field',
      level: 2,
      text: 'Add a calculated field',
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Add at least one **Number** field first. Formulas can only read number and calculated fields.' },
        { text: 'In the **Field types** panel, open **Advanced** and click **Calculated**.' },
        { text: 'Click the new field on the canvas and give it a **Label**.' },
        { text: 'In the **Calculated value** section, click into **Formula** and type `{`. A list of the fields you can use opens. Pick one with the mouse, or with the arrow keys and Enter.' },
        { text: 'Type the rest of the formula, for example ` * 12`.' },
        { text: 'Set **Decimals**, and a **Prefix** or **Suffix** if you want one.' },
        { text: 'Check the line under the formula. It repeats the formula with field names, such as "= Monthly cost × 12", and shows the result with every input set to 1.' },
        { text: 'Click **Save**.' },
      ],
    },
    {
      type: 'heading',
      id: 'formula-syntax',
      level: 2,
      text: 'Formula syntax',
    },
    {
      type: 'table',
      columns: [
        { key: 'part', label: 'You can use', width: '30%' },
        { key: 'example', label: 'Example', width: '30%' },
        { key: 'notes', label: 'Notes', width: '40%' },
      ],
      rows: [
        { part: 'Numbers', example: '12, 0.5, .5', notes: 'No thousands separators or currency symbols.' },
        { part: 'Fields', example: 'Monthly cost', notes: 'Inserted with `{`. Only number and calculated fields can be used.' },
        { part: 'Add and subtract', example: '+  -', notes: '' },
        { part: 'Multiply and divide', example: '*  /', notes: 'Shown as × and ÷ in the summary line.' },
        { part: 'Parentheses', example: '( )', notes: 'Up to 20 levels deep.' },
        { part: 'Minus sign in front', example: '-Discount', notes: 'Makes the value that follows negative.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Multiplication and division come before addition and subtraction. Otherwise the formula is worked out left to right, and parentheses change the order. Spaces are ignored. There is a length limit of 500 characters, counted on the stored formula, where each field takes about 30 characters. In practice that means about 15 fields in one formula.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'There are no functions such as SUM, IF or ROUND, and no percent sign or powers. To get a percentage, divide and multiply by 100.',
    },
    {
      type: 'paragraph',
      text: 'If the formula has a mistake, the editor says what it found, such as "Unexpected end of formula" or "Expected \')\'", and names the part just before the problem.',
    },
    {
      type: 'heading',
      id: 'fields-anywhere',
      level: 2,
      text: 'Which fields a formula can use',
    },
    {
      type: 'paragraph',
      text: 'A formula can use any number or calculated field on the form, above or below it. A total at the top can add up fields further down. A calculated field can use another calculated field, so you can build a value in steps. The field list leaves out any field that already depends on this one, because using it would create a loop.',
    },
    {
      type: 'heading',
      id: 'display',
      level: 2,
      text: 'Decimals, prefix and suffix',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Decimals', text: 'A whole number from 0 to 6. Leave it empty for the default of 2. The result is rounded to this many places and always shown with them, so 4 with 2 decimals shows as 4.00.' },
        { bold: 'Rounding', text: 'Halves round away from zero: 2.5 becomes 3 and -2.5 becomes -3 with 0 decimals. 1.005 becomes 1.01 with 2 decimals.' },
        { bold: 'Prefix and suffix', text: 'Up to 10 characters each, shown before and after the number with a space, for example "€ 1,200.00" or "45 %". They are for display only and are not part of the stored value.' },
        { bold: 'Number format', text: 'Thousands separators and the decimal mark follow the language settings of the browser viewing the value.' },
      ],
    },
    {
      type: 'heading',
      id: 'no-result',
      level: 2,
      text: 'When there is no result',
    },
    {
      type: 'paragraph',
      text: 'The field shows a dash ("—") instead of a number when:',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'An input field is empty or doesn\'t hold a number.' },
        { text: 'An input field is hidden by its conditions. Hidden fields count as empty.' },
        { text: 'The formula divides by zero.' },
        { text: 'The result is too large to work with.' },
      ],
    },
    {
      type: 'paragraph',
      text: 'If an input the submitter can see is still empty, the public form names it under the dash, for example "Fill in Number of users to calculate". For a division by zero only the dash is shown.',
    },
    {
      type: 'heading',
      id: 'stored-value',
      level: 2,
      text: 'What gets stored',
    },
    {
      type: 'paragraph',
      text: 'VerifyWise doesn\'t trust the value worked out in the submitter\'s browser. When a submission arrives, it applies the formula again to the submitted answers and saves that result. Reviewers see the saved value with its prefix, suffix and decimals. A calculated field that is visible but has no result is saved as empty. A hidden calculated field is not saved at all.',
    },
    {
      type: 'heading',
      id: 'restrictions',
      level: 2,
      text: 'What a calculated field can\'t do',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'It can\'t be required, mapped to an entity field or tagged with a risk dimension. The builder hides these settings.' },
        { text: 'It has no placeholder or guidance text. Help text is shown under the value.' },
        { text: 'It can have its own conditions, and other fields\' conditions can compare its value with =, ≠, >, ≥, < and ≤.' },
      ],
    },
    {
      type: 'heading',
      id: 'publish-checks',
      level: 2,
      text: 'Checks before publishing',
    },
    {
      type: 'paragraph',
      text: 'You can save a draft with an unfinished formula. You can\'t publish the form, or save changes to a published form, while a calculated field has one of these problems. The field is highlighted in the builder with the reason.',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'The formula is empty or has a syntax error.' },
        { text: 'The formula uses a field that was removed.' },
        { text: 'The formula uses a field that is not a number or calculated field.' },
        { text: 'The formula uses its own field, or two fields depend on each other in a loop.' },
        { text: 'Decimals is not a whole number from 0 to 6.' },
        { text: 'The prefix or suffix is longer than 10 characters.' },
      ],
    },
    {
      type: 'heading',
      id: 'examples',
      level: 2,
      text: 'Worked examples',
    },
    {
      type: 'table',
      columns: [
        { key: 'goal', label: 'Goal', width: '25%' },
        { key: 'formula', label: 'Formula', width: '35%' },
        { key: 'settings', label: 'Settings and result', width: '40%' },
      ],
      rows: [
        { goal: 'Annual cost', formula: 'Monthly cost * 12', settings: 'Decimals 0, prefix €. A monthly cost of 1500 shows "€ 18,000".' },
        { goal: 'Cost per user', formula: 'Annual cost / Number of users', settings: 'Decimals 2. Uses the annual cost field above. With 0 users the result is "—".' },
        { goal: 'Share of users affected', formula: 'Affected users / Total users * 100', settings: 'Decimals 1, suffix %. 250 of 2000 shows "12.5 %".' },
        { goal: 'Average of three ratings', formula: '(Rating A + Rating B + Rating C) / 3', settings: 'Decimals 1. If any rating is empty, the result is "—".' },
      ],
    },
    {
      type: 'paragraph',
      text: 'In the formula box, fields appear as chips with their labels. The examples above show the labels the same way.',
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
          articleId: 'intake-conditional-fields',
          title: 'Conditional fields',
          description: 'Show a field only when other answers match',
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
