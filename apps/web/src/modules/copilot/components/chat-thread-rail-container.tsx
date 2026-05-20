import { ChatThreadRail } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useThreadList } from '../hooks/use-thread-list';

export function ChatThreadRailContainer({ activeThreadId }: { activeThreadId?: string }) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { groups } = useThreadList();

  return (
    <ChatThreadRail
      groups={groups ?? []}
      activeId={activeThreadId}
      onSelect={(id) => void navigate({ to: '/copilot/chat', search: { thread: id } })}
      onNewThread={() => void navigate({ to: '/copilot/chat', search: { thread: undefined } })}
      searchValue={search}
      onSearchChange={setSearch}
    />
  );
}
