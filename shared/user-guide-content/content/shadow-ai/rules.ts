import type { ArticleContent } from '../../contentTypes';

export const rulesContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'The Rules page lets you set up alerts for Shadow AI activity. Rules are checked each time a batch of events arrives through the REST API or syslog. When a rule\'s condition is met, VerifyWise records an alert and, if you chose to be notified, sends you an in-app notification and an email.',
    },
    {
      type: 'heading',
      id: 'rules-tab',
      level: 2,
      text: 'Rules tab',
    },
    {
      type: 'paragraph',
      text: 'The default view shows your alert rules as cards. Each card shows the rule name, trigger type, its threshold or departments, the cooldown, whether it notifies anyone and an on/off toggle. Rules cannot be edited after creation; to change one, delete it and create a new one.',
    },
    {
      type: 'paragraph',
      text: 'You can enable or disable a rule at any time using the toggle switch. Disabled rules do not fire alerts but are preserved for future use.',
    },
    {
      type: 'heading',
      id: 'creating-rules',
      level: 2,
      text: 'Creating a rule',
    },
    {
      type: 'paragraph',
      text: 'Click "Create rule" to open the creation modal. Fill in the following fields:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Rule name', text: 'A descriptive name (required)' },
        { bold: 'Description', text: 'Optional notes about the rule\'s purpose' },
        { bold: 'Trigger type', text: 'The condition that fires the alert (see below)' },
        { bold: 'Configuration', text: 'Threshold or parameters specific to the trigger type' },
        { bold: 'Cooldown period', text: 'How long the rule stays quiet for the same tool, department or user after it fires (see below).' },
        { bold: 'Notify me', text: 'On by default. Sends you an in-app notification and an email when the rule fires. Only the person who creates the rule is notified; with this off, alerts appear in the alert history only' },
        { bold: 'Active', text: 'Whether the rule is checked from the moment it is created' },
      ],
    },
    {
      type: 'heading',
      id: 'trigger-types',
      level: 2,
      text: 'Trigger types',
    },
    {
      type: 'paragraph',
      text: 'Each rule monitors one type of event. The available triggers are:',
    },
    {
      type: 'icon-cards',
      items: [
        {
          icon: 'Radar',
          title: 'New tool detected',
          description: 'Fires when a batch of events contains an AI tool seen for the first time.',
        },
        {
          icon: 'TrendingUp',
          title: 'Usage threshold exceeded',
          description: 'Fires when new events arrive for a tool whose total event count has reached the threshold.',
        },
        {
          icon: 'Building2',
          title: 'Sensitive department usage',
          description: 'Fires when events arrive from one of the departments you list (matched without regard to case).',
        },
        {
          icon: 'ShieldAlert',
          title: 'Blocked tool attempt',
          description: 'Fires when your proxy reports a blocked request (action blocked) to a tool whose status is Blocked.',
        },
      ],
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Risk score exceeded', text: 'Fires when new events arrive for a tool whose current risk score is at or above the minimum you set (default 70). Scores are recalculated nightly, so a tool without a score yet does not fire.' },
        { bold: 'New user detected', text: 'Fires the first time a user is observed accessing any AI tool. Earlier traffic from that user that matched no AI tool does not count, so it does not stop the alert.' },
      ],
    },
    {
      type: 'heading',
      id: 'usage-threshold',
      level: 3,
      text: 'Understanding usage thresholds',
    },
    {
      type: 'paragraph',
      text: 'The usage threshold is the total number of events recorded for one AI tool across all users (default 100). Once a tool reaches it, the rule fires whenever new events for that tool arrive, at most once per cooldown period.',
    },
    {
      type: 'heading',
      id: 'risk-score-trigger',
      level: 3,
      text: 'Understanding risk score triggers',
    },
    {
      type: 'paragraph',
      text: 'The risk score (0-100) is calculated nightly using a weighted formula: approval status (40%), data and compliance policies (25%), usage volume (15%) and department sensitivity (20%). Unapproved tools with weak compliance posture used by sensitive departments score highest. The rule is checked when new events for a tool arrive, not when the score changes.',
    },
    {
      type: 'callout',
      variant: 'info',
      text: 'For a detailed breakdown of how risk scores are calculated, visit the Settings page and see the "Risk score calculation" section.',
    },
    {
      type: 'heading',
      id: 'deleting-rules',
      level: 2,
      text: 'Deleting a rule',
    },
    {
      type: 'paragraph',
      text: 'Click the trash icon on a rule card to delete it. You will be asked to confirm. Deleting a rule removes the rule but keeps its alerts in the alert history, under the rule\'s name.',
    },

    // ─── Cooldowns & alert batching ──────────────────────────────────

    {
      type: 'heading',
      id: 'cooldowns',
      level: 2,
      text: 'Cooldowns and alert batching',
    },
    {
      type: 'paragraph',
      text: 'To prevent alert fatigue, each rule has a configurable cooldown period and the system enforces a per-batch alert cap.',
    },
    {
      type: 'heading',
      id: 'cooldown-period',
      level: 3,
      text: 'Per-rule cooldown',
    },
    {
      type: 'paragraph',
      text: 'When you create a rule, you select a cooldown period that controls the minimum time between repeated alerts for the same trigger context (e.g., the same tool or the same user). If a rule fires for a given context, it will not fire again for that same context until the cooldown expires.',
    },
    {
      type: 'table',
      columns: [
        { key: 'option', label: 'Cooldown option', width: '30%' },
        { key: 'behavior', label: 'Behavior', width: '70%' },
      ],
      rows: [
        { option: '1 hour', behavior: 'Alert suppressed for the same context for 60 minutes after firing' },
        { option: '6 hours', behavior: 'Alert suppressed for the same context for 6 hours after firing' },
        { option: '12 hours', behavior: 'Alert suppressed for the same context for 12 hours after firing' },
        { option: '24 hours (default)', behavior: 'Alert suppressed for the same context for 24 hours after firing' },
      ],
    },
    {
      type: 'paragraph',
      text: 'The "context" that determines deduplication depends on the trigger type: for tool-based triggers (new tool detected, usage threshold, blocked attempt, risk score exceeded), the cooldown applies per tool per rule. For sensitive department triggers, it applies per department per rule. For new user detected, it applies per user email per rule. Within one batch of events, a Blocked tool attempt rule fires at most once per tool, however many blocked requests the batch holds.',
    },
    {
      type: 'heading',
      id: 'alert-cap',
      level: 3,
      text: 'Per-batch alert cap',
    },
    {
      type: 'paragraph',
      text: 'As a safety net, at most 50 alerts can fire for one batch of events. Alerts beyond 50 are dropped without a record in the alert history. This prevents a flood of notifications from a misconfigured rule or a sudden traffic spike.',
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Reducing noise',
      text: 'If you are receiving too many alerts, increase the cooldown period on the affected rule or narrow the trigger criteria (e.g., raise the usage threshold or limit sensitive departments to fewer entries).',
    },

    {
      type: 'heading',
      id: 'alert-history',
      level: 2,
      text: 'Alert history tab',
    },
    {
      type: 'paragraph',
      text: 'Switch to the "Alert history" tab to see the alerts your rules have fired, newest first. The table shows:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Rule', text: 'Name of the rule that fired' },
        { bold: 'Trigger', text: 'The trigger type that caused the alert' },
        { bold: 'Fired at', text: 'Timestamp of when the alert was triggered' },
      ],
    },
    {
      type: 'paragraph',
      text: 'Clicking a column header sorts the rows on the current page. Alerts are kept for the period set under alert history retention in Settings.',
    },
    {
      type: 'article-links',
      title: 'Related articles',
      items: [
        {
          collectionId: 'shadow-ai',
          articleId: 'ai-tools',
          title: 'AI tools',
          description: 'Review and manage detected tools',
        },
        {
          collectionId: 'shadow-ai',
          articleId: 'settings',
          title: 'Settings',
          description: 'Configure API keys and data retention',
        },
        {
          collectionId: 'shadow-ai',
          articleId: 'insights',
          title: 'Insights',
          description: 'View dashboard metrics',
        },
      ],
    },
  ],
};
