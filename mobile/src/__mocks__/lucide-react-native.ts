import React from 'react';

const createMockIcon = (name: string) => {
  const Icon: React.FC<any> = ({ size, color, ...props }) => {
    return React.createElement('svg', {
      ...props,
      'data-icon': name,
      width: size,
      height: size,
      color,
    });
  };
  Icon.displayName = name;
  return Icon;
};

export const ArrowLeft = createMockIcon('ArrowLeft');
export const AlertCircle = createMockIcon('AlertCircle');
export const Eye = createMockIcon('Eye');
export const EyeOff = createMockIcon('EyeOff');
export const ShieldCheck = createMockIcon('ShieldCheck');
export const User = createMockIcon('User');
export const Mail = createMockIcon('Mail');
export const Lock = createMockIcon('Lock');
export const Zap = createMockIcon('Zap');
export const LogOut = createMockIcon('LogOut');
export const CheckCircle2 = createMockIcon('CheckCircle2');
export const Compass = createMockIcon('Compass');
export const Star = createMockIcon('Star');
export const ArrowRight = createMockIcon('ArrowRight');
export const Sparkles = createMockIcon('Sparkles');
export const Home = createMockIcon('Home');
export const Target = createMockIcon('Target');
export const Users = createMockIcon('Users');
export const Award = createMockIcon('Award');
export const Check = createMockIcon('Check');
export const CheckCircle = createMockIcon('CheckCircle');
export const Edit3 = createMockIcon('Edit3');
export const Clock = createMockIcon('Clock');
export const Calendar = createMockIcon('Calendar');
export const MapPin = createMockIcon('MapPin');
export const Phone = createMockIcon('Phone');
export const XCircle = createMockIcon('XCircle');
export const X = createMockIcon('X');
export const MessageSquare = createMockIcon('MessageSquare');
export const MessageCircle = createMockIcon('MessageCircle');
export const Send = createMockIcon('Send');
export const Navigation = createMockIcon('Navigation');
export const Locate = createMockIcon('Locate');

export default new Proxy(
  {},
  {
    get: (_target, prop: string) => createMockIcon(prop),
  }
);
