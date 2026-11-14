import type { ArticleContent } from '../../contentTypes';

export const playgroundContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'What the playground does',
    },
    {
      type: 'paragraph',
      text: 'The playground is a chat window for the models you saved under **Models**. Use it to try a prompt, or to check that a model and its API key work, before you set up an experiment. Open it from **Enforce > LLM Evals > Playground** in the sidebar.',
    },
    {
      type: 'heading',
      id: 'using-the-playground',
      level: 2,
      text: 'Using the playground',
    },
    {
      type: 'bullet-list',
      items: [
        { text: 'Pick a saved model from the dropdown at the top, type a message and press Enter. Shift+Enter adds a new line' },
        { text: 'The conversation keeps its history: each message goes to the model with the turns before it' },
        { text: 'When the selected model accepts images, you can attach an image or a text file (TXT, Markdown, CSV or JSON). For other models, attachments are off' },
        { text: 'Dictate a message with the microphone button, where your browser supports speech input' },
        { text: 'Switching to another model, or clicking **Clear conversation**, starts a new conversation' },
      ],
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'The playground needs at least one saved model. With none saved, choose **Add model** in the model dropdown. It opens **Models**, where you pick a provider and model and enter the provider\'s API key if one isn\'t stored yet.',
    },
  ],
};
