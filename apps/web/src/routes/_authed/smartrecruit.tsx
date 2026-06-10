import { createFileRoute } from '@tanstack/react-router';
import { SmartrecruitPage } from '@/modules/smartrecruit/pages/smartrecruit-page';

export const Route = createFileRoute('/_authed/smartrecruit')({
  component: SmartrecruitPage,
});
