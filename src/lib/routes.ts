import { ViewId } from '../types/sortsight.ts';

export const VIEW_TO_PATH: Record<ViewId, string> = {
  landing: '/',
  product_overview: '/overview',
  auth: '/login',
  onboarding: '/register',
  dashboard: '/dashboard',
  scanner: '/scanner',
  realtime: '/realtime',
  batch: '/batch',
  materials: '/materials',
  contamination: '/contamination',
  hazards: '/hazards',
  sorting: '/sorting',
  conveyor: '/conveyor',
  global_rules: '/global-rules',
  country_rules: '/country-rules',
  directory: '/directory',
  analytics: '/analytics',
  environment: '/environment',
  assistant: '/assistant',
  reviews: '/reviews',
  annotations: '/annotations',
  models: '/models',
  datasets: '/datasets',
  digital_twin: '/digital-twin',
  simulator: '/simulator',
  material_flow: '/material-flow',
  operations: '/operations',
  inventory: '/inventory',
  batches: '/batches',
  team: '/team',
  notifications: '/notifications',
  developers: '/developers',
  security: '/security',
  settings: '/settings',
  profile: '/profile',
  admin: '/admin',
};

export function viewIdToPath(view: ViewId): string {
  return VIEW_TO_PATH[view] || '/dashboard';
}

export function getActiveViewFromPath(pathname: string): ViewId {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/') return 'landing';
  if (clean === '/overview') return 'product_overview';
  if (clean === '/login') return 'auth';
  if (clean === '/register') return 'onboarding';
  if (clean === '/dashboard') return 'dashboard';
  if (clean.startsWith('/scanner')) return 'scanner';
  if (clean === '/realtime') return 'realtime';
  if (clean.startsWith('/batch/')) return 'batch';
  if (clean === '/batch') return 'batch';
  if (clean.startsWith('/materials')) return 'materials';
  if (clean === '/contamination') return 'contamination';
  if (clean.startsWith('/hazards')) return 'hazards';
  if (clean.startsWith('/sorting')) return 'sorting';
  if (clean.startsWith('/conveyor')) return 'conveyor';
  if (clean === '/global-rules') return 'global_rules';
  if (clean === '/country-rules') return 'country_rules';
  if (clean === '/directory' || clean.startsWith('/facilities')) return 'directory';
  if (clean.startsWith('/analytics')) return 'analytics';
  if (clean === '/environment') return 'environment';
  if (clean === '/assistant') return 'assistant';
  if (clean.startsWith('/reviews')) return 'reviews';
  if (clean === '/annotations') return 'annotations';
  if (clean.startsWith('/models')) return 'models';
  if (clean === '/datasets') return 'datasets';
  if (clean.startsWith('/digital-twin')) return 'digital_twin';
  if (clean === '/simulator') return 'simulator';
  if (clean === '/material-flow') return 'material_flow';
  if (clean.startsWith('/operations')) return 'operations';
  if (clean.startsWith('/inventory')) return 'inventory';
  if (clean.startsWith('/batches')) return 'batches';
  if (clean === '/team') return 'team';
  if (clean === '/notifications') return 'notifications';
  if (clean === '/developers') return 'developers';
  if (clean === '/security' || clean === '/audit-logs') return 'security';
  if (clean === '/settings') return 'settings';
  if (clean === '/profile') return 'profile';
  if (clean === '/admin') return 'admin';
  return 'dashboard';
}

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Main Dashboard',
  overview: 'Product Overview',
  scanner: 'Smart Waste Scanner',
  history: 'Inspection History',
  result: 'Inspection Detail',
  realtime: 'Real-Time Studio',
  batch: 'Batch Analysis',
  materials: 'Material Intelligence',
  contamination: 'Contamination Analysis',
  hazards: 'Hazard Intelligence',
  sorting: 'Smart Sorting Engine',
  configuration: 'Chute Configuration',
  conveyor: 'Conveyor Monitoring',
  session: 'Session Telemetry',
  'global-rules': 'Global Recycling Rules',
  'country-rules': 'Country & Region Rules',
  directory: 'Facility Directory',
  facilities: 'Facilities',
  analytics: 'Analytics Center',
  recovery: 'Recovery Analytics',
  environment: 'Environmental Impact',
  assistant: 'AI Operator Assistant',
  reviews: 'Human Review Queue',
  annotations: 'Annotation Workspace',
  models: 'Model Management',
  datasets: 'Dataset Management',
  'digital-twin': 'Digital Twin',
  stages: 'Stages',
  simulator: 'Optimization Simulator',
  'material-flow': 'Material Flow Explorer',
  operations: 'Operations & Handover',
  handover: 'Shift Handover',
  inventory: 'Material Inventory',
  batches: 'Collection Batches',
  team: 'Team & Roles',
  notifications: 'Alert Center',
  developers: 'API & Developers',
  security: 'Security & Audit',
  'audit-logs': 'Audit Logs',
  settings: 'Organization Settings',
  profile: 'User Profile',
  admin: 'Admin Control Panel',
};

export function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return [{ label: 'SortSight AI', path: '/' }];

  const crumbs: BreadcrumbItem[] = [{ label: 'Workspace', path: '/dashboard' }];
  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    acc += `/${seg}`;
    const isLast = i === parts.length - 1;
    const label = SEGMENT_LABELS[seg] || decodeURIComponent(seg);
    crumbs.push({ label, path: isLast ? undefined : acc });
  }
  return crumbs;
}
