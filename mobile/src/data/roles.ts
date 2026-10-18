export type RoleId = 'parent' | 'individual' | 'coach';

export interface RoleOption {
  id: RoleId;
  title: string;
  badge: string;
  description: string;
  highlights: string[];
}

export const ROLES: RoleOption[] = [
  {
    id: 'parent',
    title: 'Parent / Guardian',
    badge: 'Youth & Families',
    description: 'Find trusted coaches for your child, manage their training, and track their progress.',
    highlights: [
      'Verified coach credentials & background safety',
      'Child session scheduling and progress notes',
      'Parental oversight on training goals',
    ],
  },
  {
    id: 'individual',
    title: 'Individual Customer',
    badge: 'Self-Improvement',
    description: 'Discover coaches and build your skills at your own pace.',
    highlights: [
      'Flexible booking for personal skill level',
      'Direct messaging with martial arts specialists',
      'Customized 1-on-1 or small group sessions',
    ],
  },
  {
    id: 'coach',
    title: 'Player / Coach',
    badge: 'Trainers & Pros',
    description: 'Explore coaching opportunities and manage your coaching profile.',
    highlights: [
      'Showcase certified disciplines & combat sports',
      'Manage availability, slots, and trainee roster',
      'Grow your client base with verified accreditation',
    ],
  },
];
