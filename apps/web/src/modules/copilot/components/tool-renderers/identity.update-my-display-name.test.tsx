import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UpdateMyDisplayNameRenderer } from './identity.update-my-display-name';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe('UpdateMyDisplayNameRenderer', () => {
  it('renders an InteractableCard in input-pending-approval state', () => {
    render(
      <UpdateMyDisplayNameRenderer
        args={{
          displayName: 'Jane Q. Doe',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }}
        state="input-pending-approval"
        callId="call-1"
      />,
      { wrapper },
    );
    expect(screen.getByText('Change display name')).toBeInTheDocument();
    expect(screen.getByText('identity.updateMyDisplayName')).toBeInTheDocument();
  });

  it('renders a tool-call OK pill when output-available', () => {
    render(
      <UpdateMyDisplayNameRenderer
        args={{ displayName: 'Jane Q. Doe' }}
        state="output-available"
        callId="call-1"
      />,
      { wrapper },
    );
    expect(screen.getByText('Display name updated')).toBeInTheDocument();
  });
});
