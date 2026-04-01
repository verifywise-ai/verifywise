import React, { Component, ReactNode } from 'react'
import { Box, Typography, Alert } from '@mui/material'
import { background } from "../../themes/palette";

interface CommandPaletteErrorBoundaryProps {
  children: ReactNode
}

interface CommandPaletteErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

class CommandPaletteErrorBoundary extends Component<
  CommandPaletteErrorBoundaryProps,
  CommandPaletteErrorBoundaryState
> {
  constructor(props: CommandPaletteErrorBoundaryProps) {
    super(props)

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    }
  }

  static getDerivedStateFromError(error: Error): Partial<CommandPaletteErrorBoundaryState> {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo
    })

    // Log error to monitoring service
    console.error('Command Palette Error:', error, errorInfo)

    // You could integrate with error reporting service here
    // Example: Sentry.captureException(error, { contexts: { react: errorInfo } })
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box
          className="confirmation-backdrop"
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '15vh'
          }}
        >
          <Box
            role="dialog"
            aria-modal="true"
            sx={{
              background: `${background.main}`,
              borderRadius: '12px',
              boxShadow: '0 16px 70px rgba(0, 0, 0, 0.2)',
              width: '100%',
              maxWidth: '640px',
              overflow: 'hidden',
              border: '1px solid #e5e5e5',
              padding: '24px'
            }}
          >
            <Alert
              severity="error"
              sx={{ marginBottom: 2 }}
              action={
                <Typography
                  component="button"
                  onClick={this.handleRetry}
                  sx={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Try Again
                </Typography>
              }
            >
              <Typography variant="h6" gutterBottom>
                Command Palette Error
              </Typography>
              <Typography variant="body2">
                The command palette encountered an unexpected error. Please try again or contact support if the problem persists.
              </Typography>
            </Alert>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <Box
                sx={{
                  backgroundColor: `${background.surface}`,
                  padding: 2,
                  borderRadius: 1,
                  overflow: 'auto',
                  maxHeight: '200px'
                }}
              >
                <Typography variant="caption" component="pre" sx={{ fontSize: '12px' }}>
                  {this.state.error.toString()}
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      )
    }

    return this.props.children
  }
}

export default CommandPaletteErrorBoundary