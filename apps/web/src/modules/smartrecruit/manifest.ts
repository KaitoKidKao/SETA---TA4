import { type NavManifest, noNavExtensions } from '@seta/module-sdk';
import { Activity, Box } from 'lucide-react';

export const smartrecruitNavManifest: NavManifest = {
  id: 'smartrecruit',
  label: 'Smartrecruit',
  icon: Box,
  requiredPermissions: [],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'Smartrecruit',
      items: [
        { id: 'smartrecruit.home', icon: Box, label: 'Smartrecruit', to: '/smartrecruit' },
        {
          id: 'smartrecruit.monitoring',
          icon: Activity,
          label: 'Monitoring',
          to: '/smartrecruit/monitoring',
        },
      ],
    },
  ],
};
