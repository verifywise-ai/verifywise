import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider, createTheme } from '@mui/material';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import App from './App';
import './styles/globals.css';

// Extended MUI theme types for custom palette properties
declare module '@mui/material/styles' {
  interface TypeText {
    tertiary: string;
    accent: string;
  }
  interface TypeBackground {
    main: string;
    alt: string;
    modal: string;
    fill: string;
    accent: string;
  }
  interface Palette {
    border: {
      light: string;
      dark: string;
    };
    status: {
      success: { text: string; main: string; light: string; bg: string };
      error: { text: string; main: string; light: string; bg: string; border: string };
      warning: { text: string; main: string; light: string; bg: string; border: string };
      info: { text: string; main: string; bg: string; border: string };
    };
    other: {
      icon: string;
      line: string;
      fill: string;
      grid: string;
    };
  }
  interface PaletteOptions {
    border?: {
      light?: string;
      dark?: string;
    };
    status?: {
      success?: { text?: string; main?: string; light?: string; bg?: string };
      error?: { text?: string; main?: string; light?: string; bg?: string; border?: string };
      warning?: { text?: string; main?: string; light?: string; bg?: string; border?: string };
      info?: { text?: string; main?: string; bg?: string; border?: string };
    };
    other?: {
      icon?: string;
      line?: string;
      fill?: string;
      grid?: string;
    };
  }
}

// Theme matching StyleGuide exactly with all custom properties
const theme = createTheme({
  palette: {
    primary: {
      main: '#13715B',
      light: '#5FA896',
      dark: '#0f604d',
    },
    text: {
      primary: '#1c2130',
      secondary: '#344054',
      tertiary: '#475467',
      accent: '#838c99',
    },
    background: {
      default: '#FFFFFF',
      paper: '#FCFCFD',
      main: '#FFFFFF',
      alt: '#FCFCFD',
      modal: '#FCFCFD',
      fill: '#F4F4F4',
      accent: '#f9fafb',
    },
    divider: '#d0d5dd',
    border: {
      light: '#eaecf0',
      dark: '#d0d5dd',
    },
    status: {
      success: { text: '#079455', main: '#17b26a', light: '#d4f4e1', bg: '#ecfdf3' },
      error: { text: '#f04438', main: '#d32f2f', light: '#fbd1d1', bg: '#f9eced', border: '#FDA29B' },
      warning: { text: '#DC6803', main: '#fdb022', light: '#ffecbc', bg: '#fffcf5', border: '#fec84b' },
      info: { text: '#1c2130', main: '#475467', bg: '#FFFFFF', border: '#d0d5dd' },
    },
    other: {
      icon: '#667085',
      line: '#d6d9dd',
      fill: '#e3e3e3',
      grid: '#a2a3a3',
    },
  },
  typography: {
    fontFamily: "'Geist', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif",
    fontSize: 13,
  },
  shape: {
    borderRadius: 4,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
  },
});

// NOTE: This is a standalone docs app for development/preview.
// When integrating into the main VerifyWise app, the Resources component (App)
// should be imported and rendered at the /resources route within the main app's router.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <BrowserRouter>
        <Routes>
          {/* Resources route with all documentation */}
          <Route path="/resources" element={<App />} />
          <Route path="/resources/:tab" element={<App />} />
          <Route path="/resources/:tab/:section" element={<App />} />
          {/* User Guide collection-based routing: /resources/user-guide/:collectionId/:articleId */}
          <Route path="/resources/:tab/:section/:articleId" element={<App />} />

          {/* For standalone dev: redirect root to /resources */}
          <Route path="/" element={<Navigate to="/resources" replace />} />
          <Route path="*" element={<Navigate to="/resources" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
