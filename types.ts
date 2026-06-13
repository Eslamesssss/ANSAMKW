import { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  href?: string;
  id: string;
  hasDropdown?: boolean;
  dropdownContent?: {
    label: string;
    icon?: LucideIcon;
    href?: string; // External link
    view?: ViewState; // Internal app view
    categoryFilter?: string; // For useful tools filtering
    color?: string;
    description?: string;
  }[];
}

export interface FeatureCardProps {
  title: string;
  image: string;
}

export enum Theme {
  DARK = 'dark',
  LIGHT = 'light'
}

export type ViewState = 
  | 'home' 
  | 'photo-restoration' 
  | 'photo-angle' 
  | 'photo-group' 
  | 'photo-extract' 
  | 'photo-generate' 
  | 'video-storyboard' 
  | 'agency-hub'
  | 'ad-product-photography'
  | 'ad-swot-analysis'
  | 'ad-cgi-generator'
  | 'ad-marketing-strategy'
  | 'creative-hub'
  | 'creative-logo-gen'
  | 'creative-brand-kit'
  | 'filmmaker-hub'
  | 'film-storyboard-pro'
  | 'film-script-writer'
  | 'film-novelist'
  | 'useful-tools'
  | 'about';