import { FC, useContext, useEffect, useState, useRef, useCallback, memo } from 'react';
import { Stack, Box, useTheme, Avatar, Typography, Theme } from '@mui/material';
import { MessagePrimitive, useMessagePartText, useAssistantState } from '@assistant-ui/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Bot, Copy, Check } from 'lucide-react';
import { ChartRenderer } from './ChartRenderer';
import VWAvatar from '../Avatar/VWAvatar';
import { VerifyWiseContext } from '../../../application/contexts/VerifyWise.context';
import { useProfilePhotoFetch } from '../../../application/hooks/useProfilePhotoFetch';
import { User } from '../../../domain/types/User';

const formatTimestamp = (date: Date): string => {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

// Create markdown styles with theme. Tables follow the VerifyWise list
// conventions (thin borders, subtle header fill, 13/12px type) so an
// inline GFM table from the LLM reads like a native VW table rather
// than raw browser defaults.
const createMarkdownStyles = (theme: Theme) => {
  const borderColor =
    theme.palette.border?.light ?? theme.palette.divider ?? '#e5e5e5';
  const headerBg = theme.palette.background.alt ?? 'rgba(0, 0, 0, 0.03)';

  return {
    h1: { marginTop: 0, fontSize: theme.typography.body1.fontSize, fontWeight: 600 } as React.CSSProperties,
    h2: { marginTop: 0, fontSize: theme.typography.body1.fontSize, fontWeight: 700 } as React.CSSProperties,
    h3: { marginTop: 0, fontSize: theme.typography.body2.fontSize, fontWeight: 600 } as React.CSSProperties,
    tableWrapper: {
      overflowX: 'auto' as const,
      margin: '8px 0',
      borderRadius: '4px',
      border: `1px solid ${borderColor}`,
    } as React.CSSProperties,
    table: {
      borderCollapse: 'collapse' as const,
      width: '100%',
      minWidth: 'max-content' as const,
      fontSize: '12px',
    } as React.CSSProperties,
    thead: {
      backgroundColor: headerBg,
    } as React.CSSProperties,
    th: {
      textAlign: 'left' as const,
      padding: '8px 12px',
      fontSize: '11px',
      fontWeight: 600,
      letterSpacing: '0.02em',
      textTransform: 'uppercase' as const,
      color: theme.palette.text.secondary,
      borderBottom: `1px solid ${borderColor}`,
      whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
    td: {
      padding: '8px 12px',
      fontSize: '13px',
      color: theme.palette.text.primary,
      borderBottom: `1px solid ${borderColor}`,
      verticalAlign: 'top' as const,
      whiteSpace: 'nowrap' as const,
    } as React.CSSProperties,
  };
};

const MessageText: FC = () => {
  const theme = useTheme();
  const data = useMessagePartText();
  const styles = createMarkdownStyles(theme);

  if (!data.text) {
    return null;
  }

  return (
    <Markdown
      // GFM unlocks tables, task lists, strikethrough, and autolinks —
      // most relevant here is tables, because the advisor's system
      // prompt tells the LLM to emit markdown tables for item
      // listings. Without GFM, react-markdown renders them as literal
      // "| col | col |" text and the output looks broken.
      remarkPlugins={[remarkGfm]}
      components={{
        p: 'div',
        h1: ({ node: _node, ...rest }) => <h1 style={styles.h1} {...rest} />,
        h2: ({ node: _node, ...rest }) => <h2 style={styles.h2} {...rest} />,
        h3: ({ node: _node, ...rest }) => <h3 style={styles.h3} {...rest} />,
        // GFM table elements — scope the styles here rather than in a
        // global stylesheet so the advisor chat owns its own table
        // conventions independent of any other markdown surface.
        table: ({ node: _node, ...rest }) => (
          <div style={styles.tableWrapper}>
            <table style={styles.table} {...rest} />
          </div>
        ),
        thead: ({ node: _node, ...rest }) => <thead style={styles.thead} {...rest} />,
        th: ({ node: _node, ...rest }) => <th style={styles.th} {...rest} />,
        td: ({ node: _node, ...rest }) => <td style={styles.td} {...rest} />,
      }}
    >
      {data.text}
    </Markdown>
  );
};

interface LocalChartData {
  type: 'bar' | 'pie' | 'table' | 'donut' | 'line';
  data?: { label: string; value: number; color?: string }[];
  title: string;
  columns?: string[];
  rows?: (string | number)[][];
  series?: Array<{ label: string; data: number[] }>;
  xAxisLabels?: string[];
}

const isValidChartData = (data: unknown): data is LocalChartData => {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.type === 'string' &&
    ['bar', 'pie', 'table', 'donut', 'line'].includes(obj.type) &&
    typeof obj.title === 'string' &&
    (Array.isArray(obj.data) || Array.isArray(obj.columns) || Array.isArray(obj.series))
  );
};

/**
 * Tool UI component for generate_chart — rendered inline by MessagePrimitive.Content
 * when it encounters a tool-call part with toolName === 'generate_chart'.
 */
const GenerateChartToolUI: FC<{ result?: unknown }> = ({ result }) => {
  if (!result || !isValidChartData(result)) return null;
  // Ensure data array exists for ChartRenderer (default to empty array if missing)
  const chartData = {
    ...result,
    data: result.data || [],
  };
  return <ChartRenderer chartData={chartData} />;
};

/**
 * Fallback tool UI for non-chart tools (e.g. fetch_risks, get_risk_analytics).
 * These run server-side and their results are consumed by the LLM, not shown to the user.
 */
const DefaultToolFallback: FC = () => null;

const MessageTimestamp: FC = () => {
  const theme = useTheme();
  const message = useAssistantState(({ message }) => message);

  // Skip welcome message (id: 'welcome') which is generated client-side
  if (!message?.createdAt || message.id === 'welcome') {
    return null;
  }

  // Don't show "Answered" while the message is still being generated
  if (message.status?.type === 'running') {
    return null;
  }

  return (
    <Typography
      variant="caption"
      sx={{
        color: theme.palette.text.tertiary ?? theme.palette.text.disabled,
        fontSize: theme.typography.caption.fontSize,
        mt: 0.5,
        ml: 0.5,
      }}
    >
      Answered: {formatTimestamp(new Date(message.createdAt))}
    </Typography>
  );
};

const CopyButton: FC<{ bubbleRef: React.RefObject<HTMLDivElement | null> }> = ({ bubbleRef }) => {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const message = useAssistantState(({ message }) => message);

  // Don't show while message is still generating or for welcome message
  if (message.status?.type === 'running' || message.id === 'welcome') {
    return null;
  }

  const handleCopy = async () => {
    const el = bubbleRef.current;
    if (!el) return;

    try {
      const html = el.innerHTML;
      const text = el.innerText;
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback to plain text
      const text = el.innerText;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Box
      onClick={handleCopy}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        cursor: 'pointer',
        color: copied
          ? (theme.palette.success?.main ?? '#4CAF50')
          : (theme.palette.text.tertiary ?? theme.palette.text.disabled),
        ml: 0.5,
        '&:hover': {
          color: copied
            ? (theme.palette.success?.main ?? '#4CAF50')
            : theme.palette.text.primary,
        },
      }}
      aria-label="Copy response"
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? <Check size={12} strokeWidth={1.5} /> : <Copy size={12} strokeWidth={1.5} />}
      <Typography
        component="span"
        sx={{
          fontSize: 11,
          lineHeight: 1,
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Typography>
    </Box>
  );
};

const THINKING_MESSAGES = [
  'Thinking wisely',
  'Verifying assumptions',
  'Consulting the knowledge base',
  'Reasoning through options',
  'Checking the fine print',
  'Connecting the dots',
  'Reading between the lines',
  'Crunching the context',
  'Doing the due diligence',
  'Sifting through the details',
  'Asking the right questions',
  'Double-checking everything',
  'Looking at the big picture',
  'Weighing the evidence',
  'Putting it all together',
  'Going through the checklist',
  'Making sense of it all',
  'Almost there',
  'One more thing to check',
  'Brewing an answer',
];

const ThinkingIndicator: FC = () => {
  const theme = useTheme();
  const [messageIndex, setMessageIndex] = useState(() =>
    Math.floor(Math.random() * THINKING_MESSAGES.length)
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const rotate = useCallback(() => {
    setMessageIndex((prev) => {
      let next: number;
      do {
        next = Math.floor(Math.random() * THINKING_MESSAGES.length);
      } while (next === prev && THINKING_MESSAGES.length > 1);
      return next;
    });
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(rotate, 2500);
    return () => clearInterval(intervalRef.current);
  }, [rotate]);

  return (
    <Stack
      direction="row"
      gap={1.5}
      sx={{
        alignSelf: 'flex-start',
        maxWidth: '75%',
      }}
    >
      <Box
        sx={{
          backgroundColor: theme.palette.background.fill ?? theme.palette.grey[100],
          padding: '12px 16px',
          borderRadius: 3,
          borderTopLeftRadius: 1,
        }}
      >
        <Stack direction="row" gap={1} alignItems="center">
          <Stack direction="row" gap={0.75}>
            {[0, 0.2, 0.4].map((delay, index) => (
              <Box
                key={index}
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: theme.palette.text.accent ?? theme.palette.text.secondary,
                  animation: 'pulse 1.4s infinite',
                  animationDelay: `${delay}s`,
                  '@keyframes pulse': {
                    '0%, 60%, 100%': { opacity: 0.3 },
                    '30%': { opacity: 1 },
                  },
                }}
              />
            ))}
          </Stack>
          <Typography
            variant="caption"
            sx={{
              color: theme.palette.text.tertiary ?? theme.palette.text.disabled,
              fontSize: 11,
              fontStyle: 'italic',
              ml: 0.5,
              transition: 'opacity 200ms ease',
            }}
          >
            {THINKING_MESSAGES[messageIndex]}
          </Typography>
        </Stack>
      </Box>
    </Stack>
  );
};

const DEFAULT_USER: User = {
  id: 1,
  name: "",
  surname: "",
  email: "",
  roleId: 1,
};

const CustomMessageComponent: FC = () => {
  const theme = useTheme();
  const { userId, users, photoRefreshFlag } = useContext(VerifyWiseContext);
  const { fetchProfilePhotoAsBlobUrl } = useProfilePhotoFetch();
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const bubbleRef = useRef<HTMLDivElement>(null);

  const user: User = users
    ? users.find((u: User) => u.id === userId) || DEFAULT_USER
    : DEFAULT_USER;

  useEffect(() => {
    let cancel = false;
    let previousUrl: string | null = null;
    (async () => {
      const url = await fetchProfilePhotoAsBlobUrl(userId || 0);
      if (cancel) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      if (previousUrl && previousUrl !== url) {
        URL.revokeObjectURL(previousUrl);
      }
      previousUrl = url ?? null;
      setAvatarUrl(url ?? "");
    })();

    return () => {
      cancel = true;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
    };
  }, [userId, fetchProfilePhotoAsBlobUrl, photoRefreshFlag]);

  const userAvatar = {
    firstname: user.name,
    lastname: user.surname,
    pathToImage: avatarUrl,
  };

  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.If user>
        <Stack
          direction="row"
          gap={1.5}
          sx={{
            alignSelf: 'flex-end',
            maxWidth: {
              xs: '100%',
            },
            justifyContent: 'flex-end',
            paddingLeft: '8px',
            paddingRight: '8px',
          }}
        >
          <Box
            sx={{
              backgroundColor: theme.palette.primary.main,
              color: theme.palette.primary.contrastText,
              padding: '10px 14px',
              borderRadius: 3,
              borderTopRightRadius: 1,
              fontSize: theme.typography.body2.fontSize,
              lineHeight: 1.7,
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
            }}
          >
            <MessagePrimitive.Content components={{ Text: MessageText }} />
          </Box>
          <VWAvatar
            user={userAvatar}
            size="small"
            showBorder={false}
            sx={{ width: 28, height: 28, fontSize: 11 }}
          />
        </Stack>
      </MessagePrimitive.If>

      <MessagePrimitive.If assistant>
        <Stack
          direction="row"
          gap={1.5}
          sx={{
            alignSelf: 'flex-start',
            width: '100%',
            paddingLeft: '8px',
            paddingRight: '16px',
          }}
        >
          <Avatar
            sx={{
              width: 28,
              height: 28,
              backgroundColor: theme.palette.primary.main,
              fontSize: theme.typography.caption.fontSize,
            }}
          >
            <Bot size={14} />
          </Avatar>

          <MessagePrimitive.If hasContent={false}>
            <ThinkingIndicator />
          </MessagePrimitive.If>

          <MessagePrimitive.If hasContent>
            <Stack gap={0.75} sx={{ flex: 1, minWidth: 0 }}>
              <Box
                ref={bubbleRef}
                sx={{
                  backgroundColor: theme.palette.background.fill ?? theme.palette.grey[100],
                  border: `1px solid ${theme.palette.border?.light ?? theme.palette.divider}`,
                  color: theme.palette.text.primary,
                  padding: '10px 14px',
                  borderRadius: 3,
                  borderTopLeftRadius: 1,
                  fontSize: theme.typography.body2.fontSize,
                  lineHeight: 1.7,
                  wordBreak: 'break-word',
                }}
              >
                <MessagePrimitive.Content components={{
                    Text: MessageText,
                    tools: {
                      by_name: {
                        generate_chart: GenerateChartToolUI,
                      },
                      Fallback: DefaultToolFallback,
                    },
                  }} />
              </Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <MessageTimestamp />
                <CopyButton bubbleRef={bubbleRef} />
              </Stack>
            </Stack>
          </MessagePrimitive.If>
        </Stack>
      </MessagePrimitive.If>
    </MessagePrimitive.Root>
  );
};

export const CustomMessage = memo(CustomMessageComponent);
