import { Routes } from "@angular/router";

export const pagesRoutes: Routes = [
    {
      path: '',
      loadComponent: () => import('./feed/feed')
    },
    {
      path: '**',
      redirectTo: ''
    }
]

export default pagesRoutes