import { createFileRoute } from '@tanstack/react-router';
import { SmartrecruitMonitoringPage } from '@/modules/smartrecruit/pages/smartrecruit-monitoring-page';

export const Route = createFileRoute('/_authed/smartrecruit_/monitoring')({
  component: SmartrecruitMonitoringPage,
});
