import { Routes } from '@angular/router';

export const routes: Routes =  [
  {
    path: '',
    loadChildren: () => import('./feeds/pages/pages.routes')
  },
];
